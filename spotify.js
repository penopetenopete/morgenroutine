/* Spotify in der Trainings-App: Leiste im Player (Musik | Podcast, Smart, ♫) + Menü mit Steuerung, Quellen, Einstellungen.
   Gleiche Logik wie spotify-labor.html. In der Android-App übernimmt der native Teil (Capacitor.Plugins.Training)
   das Umschalten und den Smart-Plan – das läuft auch bei gesperrtem Bildschirm.
   Andockstellen aus app.js: window.TrainingHooks.onPhase(phase, info) und syncNative() → Training.scheduleEvents. */
(function () {
  "use strict";
  const CLIENT_ID = "e4b95d44f2f6410e8e80483e9f3f82c0";
  const SCOPES = "user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-playback-position playlist-read-private playlist-read-collaborative";
  const KEY = "spotify_labor_v1"; // gleicher Speicher wie das Labor
  const CAP = window.Capacitor;
  const NATIVE = !!(CAP && CAP.isNativePlatform && CAP.isNativePlatform());
  const T = NATIVE && CAP.Plugins && CAP.Plugins.Training ? CAP.Plugins.Training : null;
  const REDIRECT = NATIVE ? "morgenroutine://spotify" : "https://penopetenopete.github.io/morgenroutine/";
  const $ = id => document.getElementById(id);

  // ---------- Speicher ----------
  let S = load();
  function load() { try { return Object.assign({ log: [], rewind: 2, short: 20 }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { log: [], rewind: 2, short: 20 }; } }
  // Speicherfehler (12.10.2026): gemeinsame, gedrosselte Meldung aus app.js; ohne sie (alte app.js im Cache) die eigene Meldung
  function storeFail() { try { if (window.AppKit && window.AppKit.storeFail) window.AppKit.storeFail(); else toast("Speichern ging nicht"); } catch (e) {} }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { storeFail(); } }
  function log(text, kind) {
    if (T) { T.addLog({ text, kind: kind || "" }).catch(() => {}); return; }
    S.log.unshift({ t: Date.now(), text, kind: kind || "" }); S.log = S.log.slice(0, 200); save();
  }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = ms => { if (ms == null) return "–"; const s = Math.floor(ms / 1000); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const wait = ms => new Promise(x => setTimeout(x, ms));
  const authed = () => (T ? !!S.hasAuth : !!S.tok);

  // ---------- Login (PKCE, ohne Server) ----------
  function randStr(n) { const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"; return Array.from(crypto.getRandomValues(new Uint8Array(n)), x => c[x % c.length]).join(""); }
  async function challenge(v) { const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)); return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  async function login() {
    const v = randStr(64), st = randStr(16);
    // Ohne gespeicherten PKCE-Zustand ließe sich die Rückkehr nicht zuordnen: abbrechen, mit Meldung, ohne Drossel (12.10.2026)
    try { localStorage.setItem(KEY + "_pkce", JSON.stringify({ v, st, redirect: REDIRECT })); } catch (e) { toast("Speichern ging nicht"); return; }
    // Laufende Sitzung vor der Umleitung sichern (13.10.2026, WORK-05): location.href bzw. Browser.open verlässt die Seite,
    // nur was vorher in training_active_v1 steht, überlebt. Ein Fehler hier darf die Anmeldung nicht verhindern.
    let gesichert = false;
    try { if (window.AppKit && window.AppKit.saveW) gesichert = window.AppKit.saveW(); } catch (e) {}
    log(gesichert ? "Anmeldung gestartet · Workout gesichert" : "Anmeldung gestartet", "o");
    const p =new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, scope: SCOPES, code_challenge_method: "S256", code_challenge: await challenge(v), redirect_uri: REDIRECT, state: st });
    const url = "https://accounts.spotify.com/authorize?" + p;
    if (NATIVE) await CAP.Plugins.Browser.open({ url }); else location.href = url;
  }
  async function tokenReq(params) {
    const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("Token-Fehler: " + (j.error_description || j.error || r.status));
    S.tok = { access: j.access_token, refresh: j.refresh_token || (S.tok && S.tok.refresh), exp: Date.now() + (j.expires_in - 60) * 1000 }; save();
    if (T) await T.setAuth({ access: S.tok.access, refresh: S.tok.refresh, exp: Math.round(S.tok.exp) });
  }
  async function handleRedirect(q) {
    if (!q.has("code") && !q.has("error")) return;
    const k = JSON.parse(localStorage.getItem(KEY + "_pkce") || "{}");
    if (k.st !== q.get("state")) return; // nicht unser Login
    if (q.has("error")) { log("Login abgelehnt: " + q.get("error"), "e"); return; }
    try { await tokenReq({ client_id: CLIENT_ID, grant_type: "authorization_code", code: q.get("code"), redirect_uri: k.redirect || REDIRECT, code_verifier: k.v }); log("Mit Spotify verbunden", "o"); }
    catch (e) { log(e.message, "e"); alert(e.message); }
    await syncNative(); render(); if (sheetOpen()) fillSheet();
  }
  async function token() {
    if (T) { const r = await T.getToken(); return r.access; }
    if (!S.tok) throw Object.assign(new Error("Nicht mit Spotify verbunden."), { status: 0 });
    if (Date.now() > S.tok.exp) await tokenReq({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: S.tok.refresh });
    return S.tok.access;
  }

  // ---------- Web API ----------
  async function api(method, path, body, retry) {
    const r = await fetch("https://api.spotify.com/v1" + path, { method, headers: { Authorization: "Bearer " + await token(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 401 && !retry && S.tok) { S.tok.exp = 0; return api(method, path, body, true); }
    if (r.status === 429 && !retry) { await wait(+(r.headers.get("Retry-After") || 1) * 1000); return api(method, path, body, true); }
    if (r.status === 204) return null;
    const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) {}
    if (!r.ok) { const e = new Error(r.status + ": " + ((j && j.error && (j.error.message || j.error)) || txt || r.statusText)); e.status = r.status; e.reason = j && j.error && j.error.reason; throw e; }
    return j;
  }
  function explain(e) {
    if (e.status === 404) return "Kein aktives Spotify-Gerät. Spotify am Handy öffnen, kurz Play drücken, dann nochmal.";
    if (e.status === 403) return e.reason === "PREMIUM_REQUIRED" ? "Spotify meldet: Premium nötig." : "Zugriff verweigert. Evtl. abmelden und neu mit Spotify verbinden.";
    return e.message || String(e);
  }
  const dq = sep => (S.device ? (sep || "?") + "device_id=" + encodeURIComponent(S.device.id) : "");

  // ---------- Umschalten im Browser (in der Android-App macht das der native Teil) ----------
  const resumable = ctx => !!ctx && (ctx.type === "album" || (ctx.type === "playlist" && !/^spotify:playlist:37i9/.test(ctx.uri)));
  // Was gerade in Spotify läuft, immer mitschreiben (23.10.2026): sonst sprang "Musik" zurück auf den
  // zuerst gewählten Song, wenn man in der Zwischenzeit in Spotify weitergeskippt hatte.
  function learn(p) {
    if (!p || !p.item || T) return;
    if (p.device && p.device.id && !S.device) S.device = { id: p.device.id, name: p.device.name };
    if (p.item.type === "track") {
      S.shuffle = !!p.shuffle_state;
      // Nach dem Direktstart (Titelliste) meldet Spotify keinen Kontext mehr – dann die alte Playlist behalten
      const keep = !p.context && S.music && S.music.ctx && ctxCache[S.music.ctx] && ctxCache[S.music.ctx].list.includes(p.item.uri);
      S.music = { track: p.item.uri, name: p.item.name, pos: p.progress_ms, ctx: p.context ? p.context.uri : keep ? S.music.ctx : null, ctxType: p.context ? p.context.type : keep ? S.music.ctxType : null };
    }
    else if (p.item.type === "episode") S.pod = Object.assign({ episode: p.item.uri, name: p.item.name, pos: p.progress_ms }, S.pod && S.pod.episode === p.item.uri && S.pod.show ? { show: S.pod.show } : {});
    // Anzeige an die Wirklichkeit anpassen: läuft in Spotify Musik, steht die App auch auf Musik
    if (!busy && !zeigt && p.is_playing && Date.now() - lastSwitch > 5000) { const real = p.item.type === "episode" ? "podcast" : "music"; if (S.active !== real) { S.active = real; S.mode = null; try { render(); } catch (e) {} } }
    save();
  }
  async function snapshot() {
    const p = await api("GET", "/me/player?additional_types=episode");
    if (!p || !p.item) return null;
    learn(p); return p;
  }
  async function play(body) {
    try { await api("PUT", "/me/player/play" + dq("?"), body); }
    catch (e) {
      if (e.status !== 404 || !S.device) throw e;
      await api("PUT", "/me/player", { device_ids: [S.device.id], play: false }); await wait(800);
      await api("PUT", "/me/player/play" + dq("?"), body);
    }
  }
  // Nur spulen, wenn es nötig ist (13.10.2026): nach `next` setzt Spotify eine Podcast-Folge selbst
  // an seinem gemerkten Punkt ein, also schon richtig. Das alte unbedingte Spulen zwang sie danach
  // auf den älteren Wert aus dem letzten snapshot() — erst richtig angefangen, dann kleiner Sprung
  // zurück, auch bei Zurückspulen 0. Bei Musik startet `next` dagegen bei 0, da liegt das Ziel weit
  // weg und es wird wie bisher gespult. Die 700 ms bleiben: davor trifft das Spulen noch den vorigen
  // Titel. Schlägt die Abfrage fehl, wird gespult wie vorher.
  const SEEK_TOL = 4000;
  // Warten, bis wirklich das Zielstück läuft, und erst dann entscheiden (13.10.2026, gemessen am
  // Gerät): nach "next" ist der Aufruf zwar zurück, Spotify spielt aber noch den vorigen Titel.
  // Eine Messung nach festen 700 ms liest dessen Position (gemessen: ist 278756 ms bei Ziel
  // 4638851 ms) – der Vergleich ist dann wertlos und es wird immer gespult. Danach startet die
  // Folge an Spotifys eigenem Punkt, und das Spulen zieht sie auf den älteren Wert zurück: erst
  // richtig, dann kleiner Sprung zurück. Läuft das Zielstück, ist die Abweichung klein und es
  // wird nicht gespult; bei Musik startet "next" bei 0, da bleibt es beim Spulen wie bisher.
  async function seekTo(ms, uri) {
    if (ms <= 2000) return;
    await wait(700);
    let ist = null, traf = false;
    for (let i = 0; i < 6; i++) {
      let p = null;
      try { p = await api("GET", "/me/player?additional_types=episode"); } catch (e) { break; }
      const it = p && p.item;
      if (!uri || (it && it.uri === uri)) { traf = true; if (p && p.progress_ms != null) ist = p.progress_ms; break; }
      await wait(250);
    }
    const passt = ist != null && Math.abs(ist - ms) <= SEEK_TOL;
    // Immer protokollieren, auch wenn gespult wird: nur so ist am Gerät zu sehen, woran es liegt.
    // Nur Zeitangaben, kein Titel, keine Adresse, keine Zugangsdaten (P-07).
    log("Spulen: ist " + (ist == null ? (traf ? "unbekannt" : "Stück kam nicht") : Math.round(ist) + " ms") + ", Ziel " + Math.round(ms) + " ms → " + (passt ? "nicht gespult" : "gespult"), "");
    if (passt) return;
    await api("PUT", "/me/player/seek?position_ms=" + Math.round(ms) + dq("&"));
  }
  async function podcastEpisode() {
    if (S.pod && S.pod.episode) return S.pod.episode;
    throw new Error("Noch keine Podcast-Folge gemerkt. Im ♫-Menü eine wählen oder kurz in Spotify eine anmachen.");
  }
  async function webSwitch(target, force) {
    let p = null; try { p = await snapshot(); } catch (e) { if (e.status !== 404) throw e; }
    if (force) { S.music = force; S.mode = null; }
    const item = p && p.item;
    if (target === "podcast" && item && item.type === "track" && S.music) log("Gemerkt: " + (S.music.name || "Titel") + " (" + fmt(S.music.pos) + ")" + (S.shuffle ? " · Zufall an" : ""), "");
    // Läuft schon das Richtige (z. B. in Spotify selbst umgestellt), nichts neu starten – nur weiterspielen
    if (!force && item && (target === "music" ? item.type === "track" : item.type === "episode")) {
      if (!p.is_playing) await play();
      S.mode = null; S.active = target; save(); log("Läuft schon · nur weitergespielt", ""); return;
    }
    if (target === "music" && S.mode === "queue" && item && item.type === "episode" && S.music) {
      // Direkt an der Stelle starten statt über die Warteschlange (13.10.2026): ein eingereihter
      // Titel startet bei Spotify immer bei 0, und "next" hebt eine Pause davor wieder auf
      // (am Gerät gemessen: "ist 777 ms" trotz Pause) – der Liedanfang war also hörbar, dann der
      // Sprung. "play" mit Kontext, Titel und Position macht es in einem Aufruf, ohne Vorlauf.
      // Geht nur bei fortsetzbarer Quelle (Album/eigene Playlist); sonst der alte Weg.
      // Drei Fälle (13.10.2026): ohne Quelle gibt es nichts fortzusetzen – dann den Titel nackt mit
      // Position starten. Mit fortsetzbarer Quelle (Album/eigene Playlist) Kontext, Titel und
      // Position zusammen. Nur bei Mix/Radio bleibt der alte Weg über die Warteschlange, weil dort
      // sonst die Fortsetzung verloren ginge – das ist der einzige Fall mit hörbarem Vorlauf.
      const m = S.music;
      let direkt = false;
      if (false && m.track) { // am iPhone ignoriert Spotify hier den Einstieg (startet die Playlist vorn, einzeln = Stille) – daher immer über die Warteschlange
        const kann = m.ctx && resumable({ type: m.ctxType, uri: m.ctx });
        if (kann || !m.ctx) {
          const body = kann
            ? { context_uri: m.ctx, offset: { uri: m.track }, position_ms: m.pos || 0 }
            : { uris: [m.track], position_ms: m.pos || 0 };
          try { await play(body); direkt = true; log("Musik direkt an der Stelle gestartet", ""); }
          catch (e) { log("Direkt starten ging nicht, zurück über die Warteschlange: " + explain(e), "w"); }
        }
      }
      if (!direkt) {
        log("Musik zurück über die Warteschlange: " + (m.name || "Titel") + " (" + fmt(m.pos) + ")", "");
        let pausiert = false;
        try { await api("PUT", "/me/player/pause" + dq("?")); pausiert = true; } catch (e) {}
        await api("POST", "/me/player/next" + dq("?"));
        // Sofort spulen, ohne erst zu warten (24.10.2026): "next" hebt am iPhone die Pause auf, jede
        // Wartezeit davor war als Liedanfang zu hören (gemessen ~0,8 s). Spotify arbeitet die Befehle
        // der Reihe nach ab, das Spulen trifft also schon den neuen Song. seekTo prüft danach nach.
        if ((m.pos || 0) > 2000) { try { await api("PUT", "/me/player/seek?position_ms=" + Math.round(m.pos) + dq("&")); } catch (e) {} }
        await seekTo(m.pos || 0, m.track || null);
        if (pausiert) { try { await play(); } catch (e) {} }
      }
      S.mode = null;
    } else if (target === "podcast" && item && item.type === "track" && (!resumable(p.context) || !(await listeLesbar(item, p.context)))) {
      const ep = await podcastEpisode(), pos = S.pod && S.pod.episode === ep ? Math.max(0, (S.pod.pos || 0) - S.rewind * 1000) : 0;
      await api("POST", "/me/player/queue?uri=" + encodeURIComponent(ep) + dq("&"));
      await api("POST", "/me/player/queue?uri=" + encodeURIComponent(item.uri) + dq("&"));
      await api("POST", "/me/player/next" + dq("?")); await seekTo(pos, ep); S.mode = "queue";
      log("Podcast über die Warteschlange", "");
    } else if (target === "music") {
      S.mode = null; const m = S.music;
      // Zufallswiedergabe kurz aus (23.10.2026): sonst ignoriert Spotify den gemerkten Song und startet irgendwo.
      // Danach wieder an – der laufende Song bleibt, nur der Rest wird gemischt.
      const mix = !!S.shuffle && !!(m && m.track);
      if (mix) { try { await api("PUT", "/me/player/shuffle?state=false" + dq("&")); } catch (e) {} }
      try {
      if (m && m.ctx && !m.track) await play({ context_uri: m.ctx });
      else if (m && m.track && m.ctx) await musikZurueck(m);
      else if (m && m.track) { log("Musik weiter bei: " + (m.name || "Titel") + " (" + fmt(m.pos) + ")", ""); await play({ uris: [m.track], position_ms: m.pos || 0 }); }
      else throw new Error("Noch keine Musik gemerkt. Im ♫-Menü Musik wählen oder kurz in Spotify Musik anmachen.");
      } finally {
        if (mix) { await wait(600); try { await api("PUT", "/me/player/shuffle?state=true" + dq("&")); log("Zufallswiedergabe wieder an", ""); } catch (e) {} }
      }
    } else {
      S.mode = null; const ep = await podcastEpisode();
      const ppos = S.pod && S.pod.episode === ep ? Math.max(0, (S.pod.pos || 0) - S.rewind * 1000) : 0;
      // Erst über die Sendung mit der Folge als Einstieg – der dokumentierte Weg. Das blosse
      // uris:[Folge] nimmt Spotify zwar an, lädt die Folge aber nicht und würgt dabei die laufende
      // Wiedergabe ab; Einreihen scheitert danach mit 403, weil nichts mehr spielt (iPhone,
      // 23.10.2026 gemessen). Deshalb ist uris nur noch der Rückfall.
      const sh = await podShow(ep);
      let lief = false;
      if (sh) {
        try { await play({ context_uri: sh, offset: { uri: ep }, position_ms: ppos }); log("Podcast über die Sendung gestartet", ""); lief = await laeuft(ep); }
        catch (e) { log("Über die Sendung ging nicht: " + explain(e), "w"); }
      } else log("Sendung zur Folge nicht gefunden", "w");
      if (!lief) {
        try { await play({ uris: [ep], position_ms: ppos }); log("Zweiter Versuch: Folge einzeln", "w"); lief = await laeuft(ep); }
        catch (e) { log("Folge einzeln ging nicht: " + explain(e), "e"); }
        if (!lief) log("Podcast startet nicht · Spotify nimmt den Befehl an, spielt aber nicht", "e");
      }
    }
    S.active = target; save();
  }

  let busy = false, lastSwitch = 0;
  /* Nachsehen, was nach dem Umschalten wirklich läuft (23.10.2026). Am iPhone nahm Spotify den
     Befehl an (keine Fehlerzeile), spielte den Podcast aber nicht. Ohne diese Rückschau ist nicht
     zu unterscheiden, ob der Aufruf gar nicht ankam oder ob Spotify ihn still verwirft.
     Nur Art, Spiel-Zustand und Gerät – kein Titel, keine Adresse, keine Zugangsdaten (P-07). */
  async function nachsehen(target) {
    await wait(1500);
    try {
      const p = await api("GET", "/me/player?additional_types=episode");
      if (!p) { log("Danach: Spotify meldet nichts (kein aktives Gerät)", "w"); return; }
      const art = p.item ? (p.item.type === "episode" ? "Podcast" : "Musik") : "nichts";
      const dev = p.device ? p.device.type || "Gerät" : "kein Gerät";
      const passt = (target === "podcast" && art === "Podcast") || (target === "music" && art === "Musik");
      log("Danach läuft: " + art + ", " + (p.is_playing ? "spielt" : "pausiert") + ", " + dev + (passt ? "" : " · NICHT das Gewünschte"), passt ? "" : "w");
    } catch (e) { log("Nachsehen ging nicht: " + explain(e), "w"); }
  }

  /* Läuft die gewünschte Folge wirklich? (23.10.2026) Am iPhone nimmt Spotify ein play mit
     uris:[Folge] an, lädt sie aber nicht – gemessen: "Danach läuft: nichts, pausiert". Deshalb
     kurz nachfassen, statt dem Rückgabewert zu glauben. */
  /* Sendung zur Folge: gemerkt, sonst einmal nachschlagen und merken (23.10.2026). */
  async function podShow(ep) {
    if (S.pod && S.pod.episode === ep && S.pod.show) return S.pod.show;
    const id = String(ep).split(":").pop();
    try {
      const j = await api("GET", "/episodes/" + encodeURIComponent(id) + "?market=DE");
      const u = j && j.show && j.show.uri;
      if (u && S.pod && S.pod.episode === ep) { S.pod.show = u; save(); }
      return u || null;
    } catch (e) { return null; }
  }

  async function laeuft(uri) {
    for (let i = 0; i < 5; i++) {
      await wait(400);
      try {
        const p = await api("GET", "/me/player?additional_types=episode");
        if (p && p.item && p.item.uri === uri && p.is_playing) return true;
      } catch (e) { return false; }
    }
    return false;
  }

  /* Kein Schnipsel vom Playlist-Anfang (23.10.2026, iPhone): "play" mit Kontext + Einstieg spielt nach einem
     Podcast erst kurz den ersten Titel der Playlist und springt dann. Stattdessen die Titel ab dem gemerkten
     Song selbst holen und als Liste starten – dann beginnt Spotify sofort am richtigen Song und an der Stelle,
     und danach läuft die Playlist ganz normal weiter. Klappt das Holen nicht, bleibt es beim alten Weg. */
  const ctxCache = {};
  // Lässt sich die Playlist später ab dem Song starten? Wenn nicht (fremde Playlist, Spotify-Mix), den Podcast
  // nur dazwischenschieben – dann bleibt die Playlist mit dem Song in Spotify erhalten.
  async function listeLesbar(item, ctx) {
    try { const u = await titelAb({ ctx: ctx.uri, track: item.uri }); if (u && u.length) return true; } catch (e) {}
    log("Playlist nicht lesbar – Podcast wird nur dazwischengeschoben", ""); return false;
  }
  async function titelAb(m) {
    // Seit Februar 2026 heißt der Playlist-Endpunkt /items (vorher /tracks → jetzt 403), Feld "item" statt "track"
    let base = null, field = x => x && (x.item || x.track);
    if (/^spotify:playlist:/.test(m.ctx)) base = "/playlists/" + m.ctx.split(":").pop() + "/items?limit=50";
    else if (/^spotify:album:/.test(m.ctx)) { base = "/albums/" + m.ctx.split(":").pop() + "/tracks?limit=50"; field = x => x; }
    else if (/:collection$/.test(m.ctx)) base = "/me/tracks?limit=50";
    if (!base) return null;
    const c = ctxCache[m.ctx];
    let all = c && Date.now() - c.t < 10 * 60000 ? c.list : null;
    if (!all || !all.includes(m.track)) {
      all = []; let url = base;
      for (let i = 0; i < 6 && url; i++) {
        const j = await api("GET", url);
        (j && j.items || []).forEach(x => { const t = field(x); if (t && t.uri && (!t.type || t.type === "track")) all.push(t.uri); });
        if (all.includes(m.track) && all.length - all.indexOf(m.track) > 60) break;
        url = j && j.next ? j.next.replace("https://api.spotify.com/v1", "") : null;
      }
      ctxCache[m.ctx] = { t: Date.now(), list: all };
    }
    const i = all.indexOf(m.track);
    return i < 0 ? null : all.slice(i, i + 100);
  }
  const gleicherTitel = (it, m) => it.uri === m.track || (it.linked_from && it.linked_from.uri === m.track) || (!!m.name && it.name === m.name);
  async function welcherTitel() {
    for (let i = 0; i < 6; i++) {
      await wait(450);
      try { const p = await api("GET", "/me/player"); if (p && p.item && p.item.type === "track") return Object.assign({ playing: !!p.is_playing }, p.item); } catch (e) { return null; }
    }
    return null;
  }
  /* Zurück zur Musik (23.10.2026, iPhone): mehrere Wege nacheinander, nach jedem nachsehen, was wirklich läuft.
     Nie mit Stille enden – lieber die Playlist ohne gemerkte Stelle als gar nichts. */
  async function musikZurueck(m) {
    const soll = (m.name || "Titel") + " (" + fmt(m.pos) + ")";
    log("Musik weiter bei: " + soll, "");
    const wege = [
      ["Titelliste ab dem Song", async () => { const u = await titelAb(m).catch(e => { log("Titelliste nicht lesbar: " + explain(e), "w"); return null; }); if (!u || !u.length) return false; await play({ uris: u, position_ms: m.pos || 0 }); return true; }],
      ["Playlist ab dem Song", async () => { await play({ context_uri: m.ctx, offset: { uri: m.track }, position_ms: m.pos || 0 }); return true; }],
      ["Playlist ab dem Song, 2. Versuch", async () => { await wait(500); await play({ context_uri: m.ctx, offset: { uri: m.track }, position_ms: m.pos || 0 }); return true; }]
    ];
    let zuletzt = null;
    for (const [name, fn] of wege) {
      let gesendet = false;
      try { gesendet = await fn(); } catch (e) { if (e.status === 404 || e.status === 403) throw e; log(name + " ging nicht: " + explain(e), "w"); }
      if (!gesendet) continue;
      const ist = await welcherTitel(); zuletzt = ist;
      if (ist && gleicherTitel(ist, m)) {
        if (!ist.playing) { try { await play(); } catch (e) {} }
        log("Läuft richtig · " + name, "o"); return;
      }
      log(name + ": läuft " + (ist ? "„" + ist.name + "“" : "nichts") + " statt „" + (m.name || "?") + "“", "w");
    }
    if (!zuletzt || !zuletzt.playing) { log("Notlösung: Playlist von vorn", "e"); try { await play({ context_uri: m.ctx }); } catch (e) { log("Auch das ging nicht: " + explain(e), "e"); } }
  }
  // Schnelles Hin und Her (24.10.2026): der Schalter springt sofort um; läuft noch ein Wechsel, wird der
  // letzte Wunsch gemerkt und direkt danach ausgeführt, statt das Tippen zu verschlucken.
  let wunsch = null, zeigt = null;
  async function switchTo(target, why, force) {
    if (busy) { if (!force) { wunsch = { target, why }; zeigt = target; render(target); } return; }
    busy = true; zeigt = target; render(target);
    try {
      if (T) {
        const r = force ? await T.playMusic({ music: JSON.stringify(force) }) : await T.switchTo({ target });
        if (!r.ok) toast(r.error);
        await syncNative();
      } else { await webSwitch(target, force); log("→ " + (target === "music" ? "Musik" : "Podcast") + (why ? " · " + why : ""), "o"); }
    } catch (e) { toast(explain(e)); log("Umschalten fehlgeschlagen: " + explain(e), "e"); }
    busy = false; lastSwitch = Date.now();
    if (wunsch) { const w = wunsch; wunsch = null; if (w.target !== target) return switchTo(w.target, w.why); }
    zeigt = null; render(); setTimeout(() => nowPlaying(true), 600);
    if (!T) nachsehen(target);
  }

  // ---------- Abgleich mit dem nativen Teil ----------
  async function syncNative() {
    if (!T) return;
    try {
      const n = await T.getState();
      ["music", "pod", "active", "mode", "device", "plan", "smart", "short"].forEach(k => { if (n[k] === undefined || n[k] === null) delete S[k]; else S[k] = n[k]; });
      S.nlog = n.log || []; S.hasAuth = !!n.hasAuth;
      if (S.short == null) S.short = 20;
    } catch (e) {}
  }
  function pushConfig(extra) {
    if (!T) return Promise.resolve();
    return T.setConfig({ config: JSON.stringify(Object.assign({ device: S.device || null, rewind: S.rewind }, extra || {})) }).catch(() => {});
  }

  // ---------- Smart ----------
  let lastPhase = null;
  function smartTarget(phase, info) {
    // Plan aus der Timeline (Musik/Podcast pro Satz und Pause) hat Vorrang vor der Grundregel
    if (phase !== "done" && info && (info.audio === "music" || info.audio === "podcast")) return info.audio;
    if (phase === "work") return "music";
    if (phase === "rest") { const p = (info && info.pauseSek) || 0; return p === 0 || p >= (S.short || 0) ? "podcast" : "music"; }
    return null;
  }
  async function applySmart() {
    if (!S.smart || !lastPhase || !authed()) return;
    await syncNative();
    const t = smartTarget(lastPhase.phase, lastPhase.info);
    if (t && t !== S.active) switchTo(t, "Smart");
  }
  async function setSmart(on) {
    S.smart = !!on; save();
    if (T) await T.setSmart({ on: S.smart, short: +S.short || 0 }).catch(() => {});
    render();
    if (on) applySmart();
  }
  const Hooks = window.TrainingHooks = window.TrainingHooks || {};
  const prevHook = Hooks.onPhase;
  Hooks.onPhase = function (phase, info) {
    try { if (typeof prevHook === "function") prevHook(phase, info); } catch (e) {}
    lastPhase = phase === "done" ? null : { phase, info };
    if (phase !== "done") applySmart();
  };
  // Ton-Einstellung der App an den nativen Teil geben (Töne bei gesperrtem Bildschirm)
  function pushSound() {
    if (!T || !T.setSound) return;
    let on = true; try { const g = (JSON.parse(localStorage.getItem("training_v1") || "{}").g) || {}; if (g.sound === false) on = false; } catch (e) {}
    T.setSound({ on }).catch(() => {});
  }

  // ---------- Leiste im Player ----------
  function css() {
    const st = document.createElement("style");
    st.textContent = `
#spotBar .spb{min-width:0}
#spotMenu{border:1px solid var(--line);border-radius:999px;padding:0 9px;font-size:.9rem}
#spotBar.busy{opacity:1}
.sp-now{font-size:.88rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-now b{color:var(--fg);font-weight:600}
.sp-ctrl{display:flex;justify-content:center;align-items:center;gap:22px;padding:4px 0}
.spc{width:52px;height:52px;border-radius:50%;border:0;background:color-mix(in srgb,var(--fg) 7%,transparent);color:var(--fg);display:grid;place-items:center;cursor:pointer;padding:0;transition:transform .12s,background .15s;-webkit-tap-highlight-color:transparent}
.spc svg{width:24px;height:24px;display:block}
.spc.play{width:68px;height:68px;background:var(--accent);color:#001318;box-shadow:0 6px 18px color-mix(in srgb,var(--accent) 35%,transparent)}
.spc.play svg{width:30px;height:30px}
.spc:active{transform:scale(.92)}
.spc:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.sp-seg{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.sp-seg button{min-height:48px;border:0;background:none;font-family:var(--f-display);font-weight:600;font-size:1rem;color:var(--muted);cursor:pointer}
.sp-seg button[aria-pressed="true"]{background:var(--accent);color:#001318}
.sp-row{display:flex;justify-content:space-between;align-items:center;gap:12px}
.sp-row small{display:block;color:var(--muted);font-size:.8rem}
.sp-sw{position:relative;width:52px;height:30px;flex:none}.sp-sw input{opacity:0;position:absolute;inset:0;margin:0}
.sp-sw i{position:absolute;inset:0;background:var(--card);border:1px solid var(--line);border-radius:30px;transition:.2s;pointer-events:none}
.sp-sw i::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:var(--muted);transition:.2s}
.sp-sw input:checked+i{background:var(--accent);border-color:var(--accent)}.sp-sw input:checked+i::after{left:25px;background:#001318}
.sp-in{display:flex;gap:8px}.sp-in input,.sp-set input{flex:1;min-width:0;min-height:44px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:0 10px;font:inherit}
.sp-res{display:flex;flex-direction:column;gap:6px}
.sp-dev{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;font-size:.95rem}
.sp-dev>i{flex:none;width:10px;height:10px;border-radius:50%;background:var(--muted)}
.sp-dev>span{flex:1;min-width:0}.sp-dev small{display:block;color:var(--muted);font-size:.8rem}
.sp-dev .btn{flex:none;width:auto;margin:0;min-height:40px;padding:0 12px;font-size:.9rem}
.sp-dev{flex-wrap:wrap}.sp-devb{flex-basis:100%;display:flex;gap:8px}.sp-devb .btn{flex:1 1 0;min-height:44px}.sp-devb:not(:has(.btn:not([hidden]))){display:none}.sp-dev .sp-open{background:#1DB954;border-color:#1DB954;color:#04170A}
.sp-dev.on>i{background:var(--ok)}
.sp-dev.off{border-color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent)}.sp-dev.off>i{background:var(--bad)}
#spotMenu.off{border-color:var(--bad);color:var(--bad)}
.sp-reshead{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.85rem;color:var(--muted)}
.sp-res .sp-reshead button{text-align:center;min-height:40px;padding:0 12px;border:1px solid var(--line);border-radius:999px;background:var(--bg);color:var(--fg);font:inherit;font-size:.85rem;cursor:pointer}
.sp-res button{text-align:left;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:.92rem;cursor:pointer}
.sp-res button small{display:block;color:var(--muted);font-size:.78rem}
.sp-set{display:grid;grid-template-columns:1fr 90px;gap:8px;align-items:center;font-size:.88rem;color:var(--muted)}
.sp-log{font:12px/1.5 ui-monospace,monospace;max-height:220px;overflow:auto;white-space:pre-wrap;color:var(--muted)}
.sp-loghead{display:flex;justify-content:space-between;align-items:center;margin-top:10px}.sp-loghead .btn{width:auto;min-height:36px;padding:0 12px;font-size:.85rem;margin:0}
.sp-log .e{color:var(--bad)}.sp-log .o{color:var(--ok)}.sp-log .w{color:var(--rest)}
.sp-fallback{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999;display:flex;align-items:flex-end}
.sp-fallback>div{background:var(--card);width:100%;max-height:88vh;overflow:auto;border-radius:16px 16px 0 0;padding:16px;display:flex;flex-direction:column;gap:12px}`;
    document.head.appendChild(st);
  }
  function setupBar() {
    const bar = $("spotBar"); if (!bar) return false;
    bar.hidden = false; bar.removeAttribute("aria-hidden");
    if (!$("spotMenu")) { const b = document.createElement("button"); b.className = "spb"; b.id = "spotMenu"; b.textContent = "♫"; b.setAttribute("aria-label", "Spotify-Menü"); bar.appendChild(b); }
    bar.querySelectorAll(".spotseg .spb").forEach(b => b.onclick = () => { if (!authed()) return openMenu(); switchTo(b.dataset.src === "podcast" ? "podcast" : "music"); });
    $("spotSmart").onclick = () => { if (!authed()) return openMenu(); setSmart(!S.smart); };
    $("spotMenu").onclick = openMenu;
    return true;
  }
  function render(pending) {
    const bar = $("spotBar"); if (!bar) return;
    const on = pending || zeigt || S.active;
    bar.classList.toggle("busy", !!(pending || zeigt));
    const seg = bar.querySelector(".spotseg"); if (seg) seg.dataset.on = on === "podcast" ? "podcast" : "music";
    bar.querySelectorAll(".spotseg .spb").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.src === "podcast" ? "podcast" : "music") === on)));
    const sm = $("spotSmart"); if (sm) sm.setAttribute("aria-pressed", String(!!S.smart));
    if (sheetOpen()) fillState();
  }

  // ---------- Menü (Sheet) ----------
  let fallback = null;
  function sheetOpen() { return !!$("spSheet"); }
  function openMenu() {
    const html = '<div id="spSheet" style="display:flex;flex-direction:column;gap:14px"></div>';
    if (typeof window.openSheet === "function") window.openSheet("Spotify", "Musik & Podcast", html);
    else { fallback = document.createElement("div"); fallback.className = "sp-fallback"; fallback.innerHTML = "<div>" + html + '<button class="btn" id="spFbClose">Schließen</button></div>'; document.body.appendChild(fallback); $("spFbClose").onclick = () => { fallback.remove(); fallback = null; }; fallback.onclick = e => { if (e.target === fallback) { fallback.remove(); fallback = null; } }; }
    fillSheet();
  }
  const IC = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4C8.9 4.3 8 4.8 8 5.6z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.3"/><rect x="13.5" y="5" width="4" height="14" rx="1.3"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5.5" width="2.4" height="13" rx="1.2"/><path d="M19 6.7v10.6c0 .8-.9 1.2-1.5.8l-8.3-5.3c-.6-.4-.6-1.2 0-1.6l8.3-5.3c.6-.4 1.5 0 1.5.8z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="16.6" y="5.5" width="2.4" height="13" rx="1.2"/><path d="M5 6.7v10.6c0 .8.9 1.2 1.5.8l8.3-5.3c.6-.4.6-1.2 0-1.6L6.5 5.9C5.9 5.5 5 5.9 5 6.7z"/></svg>',
    back15: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4v3.5H8"/><text x="12.4" y="15.2" text-anchor="middle" font-size="7.4" font-weight="700" fill="currentColor" stroke="none" font-family="-apple-system,sans-serif">15</text></svg>',
    fwd30: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4v3.5H16"/><text x="11.6" y="15.2" text-anchor="middle" font-size="7.4" font-weight="700" fill="currentColor" stroke="none" font-family="-apple-system,sans-serif">30</text></svg>'
  };
  async function fillSheet() {
    const box = $("spSheet"); if (!box) return;
    await syncNative();
    if (!authed()) {
      box.innerHTML = '<div class="note">Verbinde die App einmal mit Spotify (Premium). Danach kannst du hier Musik und Podcast wählen und im Workout umschalten.</div><button class="btn primary big" id="spLogin">Mit Spotify verbinden</button>';
      $("spLogin").onclick = login; return;
    }
    box.innerHTML = `
      <div class="sp-dev" id="spDevStat"><i></i><span id="spDevTxt">Prüfe Gerät …</span><div class="sp-devb"><button class="btn sp-open" id="spOpenApp">Spotify öffnen</button><button class="btn" id="spDevFind">Gerät suchen</button></div></div>
      <div class="sp-res" id="spDevTop"></div>
      <div class="sp-seg"><button data-src="music">Musik</button><button data-src="podcast">Podcast</button></div>
      <div class="sp-now" id="spNow">–</div>
      <div class="sp-ctrl"><button class="spc" id="spPrev" aria-label="Zurück"></button><button class="spc play" id="spToggle" aria-label="Abspielen"></button><button class="spc" id="spNext" aria-label="Weiter"></button></div>
      <h3>Musik wählen</h3>
      <div class="sp-in"><input id="spMQ" placeholder="Song oder Playlist suchen" enterkeyhint="search"><button class="btn" id="spMGo">Suchen</button></div>
      <button class="btn" id="spMyPl">Meine Playlists</button>
      <div class="sp-res" id="spMRes"></div>
      <h3>Podcast wählen</h3>
      <div class="sp-in"><input id="spPQ" placeholder="z. B. Hotel Matze" enterkeyhint="search"><button class="btn" id="spPGo">Suchen</button></div>
      <div class="sp-res" id="spPRes"></div>
      <div class="note" id="spSaved"></div>
      <details id="spMore"><summary class="small">Weitere Einstellungen</summary>
        <label class="sp-row" style="margin-top:10px"><span><b>Smart</b><small id="spSmartNote">Musik im Satz · Podcast in der Pause</small></span><span class="sp-sw"><input type="checkbox" id="spSmart"><i></i></span></label>
        <div class="sp-set" style="margin-top:10px">
          <span>Podcast zurückspulen (s)</span><input id="spRew" type="number" min="0" max="30">
          <span>Smart: Pausen kürzer als … s bleiben Musik</span><input id="spShort" type="number" min="0" max="300">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="spDev">Gerät suchen</button><button class="btn" id="spOut">Abmelden</button></div>
        <div class="sp-res" id="spDevList" style="margin-top:8px"></div>
        <div class="sp-loghead"><span class="small">Protokoll</span><span style="display:flex;gap:6px"><button class="btn" id="spLogClear">Leeren</button><button class="btn" id="spLogCopy">Kopieren</button></span></div><div class="sp-log" id="spLog"></div>
      </details>`;
    box.querySelectorAll(".sp-seg button").forEach(b => b.onclick = () => switchTo(b.dataset.src));
    $("spSmart").onchange = e => setSmart(e.target.checked);
    $("spPrev").onclick = () => control($("spPrev").dataset.a || "prev");
    $("spNext").onclick = () => control($("spNext").dataset.a || "next");
    $("spToggle").onclick = () => control("toggle");
    $("spMGo").onclick = searchMusic; $("spMQ").onkeydown = e => { if (e.key === "Enter") searchMusic(); };
    $("spMyPl").onclick = myPlaylists;
    $("spPGo").onclick = searchShows; $("spPQ").onkeydown = e => { if (e.key === "Enter") searchShows(); };
    $("spRew").value = S.rewind; $("spShort").value = S.short;
    $("spRew").onchange = () => { S.rewind = Math.max(0, +$("spRew").value || 0); save(); pushConfig(); };
    $("spShort").onchange = () => { S.short = Math.max(0, +$("spShort").value || 0); save(); if (T) T.setSmart({ on: !!S.smart, short: S.short }).catch(() => {}); };
    $("spDev").onclick = () => findDevices("spDevList");
    $("spDevFind").onclick = () => findDevices("spDevTop");
    $("spOpenApp").onclick = openSpotifyApp;
    $("spLogClear").onclick = async () => { if (T) { try { await T.clearLog(); } catch (e) {} S.nlog = []; } else { S.log = []; save(); } $("spLog").innerHTML = ""; };
    $("spLogCopy").onclick = async () => { const L = T ? (S.nlog || []) : S.log; const txt = L.slice(0, 80).map(e => new Date(e.t).toLocaleTimeString("de-DE", { hour12: false }) + "  " + e.text).join("\n");
      try { await navigator.clipboard.writeText(txt); $("spLogCopy").textContent = "Kopiert ✓"; } catch (e) { $("spLogCopy").textContent = "Ging nicht"; } setTimeout(() => { if ($("spLogCopy")) $("spLogCopy").textContent = "Kopieren"; }, 2000); };
    // Aufgeklappt: die neuen Einstellungen direkt ins Bild holen
    $("spMore").ontoggle = () => { const d = $("spMore"); if (!d.open) return; const sb = d.closest(".shbody") || document.scrollingElement;
      requestAnimationFrame(() => { const top = sb.scrollTop + d.getBoundingClientRect().top - (sb.getBoundingClientRect ? sb.getBoundingClientRect().top : 0) - 8; try { sb.scrollTo({ top, behavior: "smooth" }); } catch (e) { sb.scrollTop = top; } }); };
    devUI();
    $("spOut").onclick = async () => { delete S.tok; save(); if (T) await T.logout(); await syncNative(); fillSheet(); render(); };
    fillState(); nowPlaying(true);
  }
  function fillState() {
    const box = $("spSheet"); if (!box || !$("spSmart")) return;
    box.querySelectorAll(".sp-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.src === (zeigt || S.active))));
    $("spSmart").checked = !!S.smart;
    $("spSmartNote").textContent = S.smart ? "An · von Hand umschalten gilt bis zur nächsten Phase" : "Musik im Satz · Podcast in der Pause";
    const pod = S.active === "podcast";
    $("spPrev").innerHTML = pod ? IC.back15 : IC.prev; $("spPrev").dataset.a = pod ? "back15" : "prev"; $("spPrev").setAttribute("aria-label", pod ? "15 s zurück" : "Vorheriger Titel");
    $("spNext").innerHTML = pod ? IC.fwd30 : IC.next; $("spNext").dataset.a = pod ? "fwd30" : "next"; $("spNext").setAttribute("aria-label", pod ? "30 s vor" : "Nächster Titel");
    if (!$("spToggle").firstChild) $("spToggle").innerHTML = IC.play;
    const src = { playlist: "Playlist", album: "Album", artist: "Künstler", collection: "Lieblingssongs" };
    const m = S.music ? `<b>${esc(S.music.name)}</b>${S.music.ctxType ? " · aus " + (src[S.music.ctxType] || S.music.ctxType) : ""}` : "noch nichts";
    const p = S.pod ? `<b>${esc(S.pod.name)}</b> bei ${fmt(S.pod.pos)}` : "noch nichts";
    $("spSaved").innerHTML = `Musik: ${m}<br>Podcast: ${p}`;
    const L = T ? (S.nlog || []) : S.log;
    $("spLog").innerHTML = L.slice(0, 40).map(e => `<div class="${e.kind || ""}">${new Date(e.t).toLocaleTimeString("de-DE", { hour12: false })}  ${esc(e.text)}</div>`).join("");
  }
  let lastNow = 0;
  async function nowPlaying(force) {
    if (!$("spNow") || !authed()) return;
    if (!force && Date.now() - lastNow < 4000) return; lastNow = Date.now();
    try {
      const p = await api("GET", "/me/player?additional_types=episode"), it = p && p.item; learn(p);
      setDev(p && p.device ? p.device.name : null);
      if (!$("spNow")) return;
      $("spNow").innerHTML = it ? (it.type === "episode" ? "🎙 <b>" + esc(it.name) + "</b>" + (it.show ? " · " + esc(it.show.name) : "") : "♪ <b>" + esc(it.name) + "</b> · " + esc((it.artists || []).map(a => a.name).join(", "))) : "Gerade läuft nichts.";
      { const on = !!(p && p.is_playing); $("spToggle").innerHTML = on ? IC.pause : IC.play; $("spToggle").setAttribute("aria-label", on ? "Pause" : "Abspielen"); }
    } catch (e) { if ($("spNow")) $("spNow").textContent = explain(e); if (e.status === 404) setDev(null); }
  }
  // ---------- Gerät verbunden? (sofort sichtbar: Menü, Leiste im Player, Hauptmenü) ----------
  let devName, devAt = 0;
  function setDev(name) { devName = name || null; devAt = Date.now(); devUI(); }
  function devUI() {
    const st = $("spDevStat"), known = devAt > 0;
    if (st) {
      st.className = "sp-dev " + (!known ? "" : devName ? "on" : "off");
      $("spDevTxt").innerHTML = !known ? "Prüfe Gerät …" : devName ? "Verbunden mit <b>" + esc(devName) + "</b>" : "<b>Kein Gerät verbunden</b><small>Spotify am Handy öffnen und kurz Play drücken – oder Gerät suchen</small>";
      $("spDevFind").hidden = !!devName; if ($("spOpenApp")) $("spOpenApp").hidden = !known || !!devName;
    }
    const m = $("spotMenu"); if (m) m.classList.toggle("off", known && !devName && authed());
    try { if (typeof window.musMeta === "function") window.musMeta(); } catch (e) {}
  }
  async function checkDev() {
    if (!authed()) return;
    try { const p = await api("GET", "/me/player?additional_types=episode"); learn(p); setDev(p && p.device ? p.device.name : null); } catch (e) { if (e.status === 404 || e.status === 0) setDev(null); }
  }
  async function control(a) {
    try {
      if (T) { const r = await T.control({ action: a }); if (!r.ok) toast(r.error); }
      else if (a === "prev") await api("POST", "/me/player/previous" + dq("?"));
      else if (a === "next") await api("POST", "/me/player/next" + dq("?"));
      else if (a === "toggle") { const p = await api("GET", "/me/player"); await api("PUT", (p && p.is_playing ? "/me/player/pause" : "/me/player/play") + dq("?")); }
      else { const p = await api("GET", "/me/player?additional_types=episode"); await api("PUT", "/me/player/seek?position_ms=" + Math.max(0, ((p && p.progress_ms) || 0) + (a === "back15" ? -15000 : 30000)) + dq("&")); }
    } catch (e) { toast(explain(e)); }
    setTimeout(() => nowPlaying(true), 700);
  }
  function resBtn(title, sub, fn) { const b = document.createElement("button"); b.innerHTML = esc(title) + (sub ? `<small>${esc(sub)}</small>` : ""); b.onclick = fn; return b; }
  function busyBox(id, t) { const b = $(id); if (b) { b.innerHTML = `<div class="note">${esc(t)}</div>`; delete b.dataset.kind; } return b; }
  // Ergebnisliste wieder einklappen können (Playlists, Suche, Podcast-Folgen)
  function addClose(box, label, kind) {
    if (!box) return; box.dataset.kind = kind || "";
    const h = document.createElement("div"); h.className = "sp-reshead";
    h.innerHTML = `<span>${esc(label)}</span><button type="button">Einklappen ▴</button>`;
    h.querySelector("button").onclick = () => { box.innerHTML = ""; delete box.dataset.kind; };
    box.insertBefore(h, box.firstChild);
  }
  async function myPlaylists() {
    const cur = $("spMRes"); if (cur && cur.dataset.kind === "pl") { cur.innerHTML = ""; delete cur.dataset.kind; return; } // zweites Tippen = einklappen
    const box = busyBox("spMRes", "Lade deine Playlists …");
    try {
      let all = [], url = "/me/playlists?limit=50";
      for (let i = 0; i < 4 && url; i++) { const j = await api("GET", url); (j && j.items || []).filter(Boolean).forEach(x => all.push(x)); url = j && j.next ? j.next.replace("https://api.spotify.com/v1", "") : null; }
      box.innerHTML = '<input id="spPlF" placeholder="Playlists filtern …" style="min-height:44px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:0 10px;font:inherit">';
      const list = document.createElement("div"); list.className = "sp-res"; box.appendChild(list);
      const draw = () => { const f = ($("spPlF").value || "").toLowerCase(); list.innerHTML = ""; all.filter(x => !f || (x.name || "").toLowerCase().includes(f)).slice(0, 60).forEach(x => list.appendChild(resBtn(x.name, x.owner && x.owner.display_name, () => pickMusic({ ctx: x.uri, ctxType: "playlist", name: x.name })))); };
      $("spPlF").oninput = draw; draw();
      addClose(box, all.length + " Playlists", "pl");
    } catch (e) { box.innerHTML = `<div class="note">${esc(e.status === 401 || e.status === 403 ? "Für deine Playlists bitte unter „Weitere Einstellungen“ abmelden und neu verbinden." : explain(e))}</div>`; }
  }
  async function searchMusic() {
    const q = $("spMQ").value.trim(); if (!q) return; const box = busyBox("spMRes", "Suche …");
    try {
      const j = await api("GET", "/search?type=track,playlist&market=DE&limit=6&q=" + encodeURIComponent(q)); box.innerHTML = "";
      ((j && j.tracks && j.tracks.items) || []).filter(Boolean).forEach(t => box.appendChild(resBtn("♪ " + t.name, (t.artists || []).map(a => a.name).join(", "), () => pickMusic({ track: t.uri, name: t.name }))));
      ((j && j.playlists && j.playlists.items) || []).filter(Boolean).forEach(x => box.appendChild(resBtn("☰ " + x.name, x.owner && x.owner.display_name, () => pickMusic({ ctx: x.uri, ctxType: "playlist", name: x.name }))));
      if (!box.children.length) box.innerHTML = '<div class="note">Nichts gefunden.</div>';
      addClose(box, "Suche: " + q, "msearch");
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  async function pickMusic(m) { $("spMRes").innerHTML = ""; await switchTo("music", "Auswahl", m); }
  async function searchShows() {
    const q = $("spPQ").value.trim(); if (!q) return; const box = busyBox("spPRes", "Suche …");
    try {
      const j = await api("GET", "/search?type=show&market=DE&limit=8&q=" + encodeURIComponent(q)); box.innerHTML = "";
      ((j && j.shows && j.shows.items) || []).filter(Boolean).forEach(sh => box.appendChild(resBtn(sh.name, sh.publisher, () => showEpisodes(sh))));
      if (!box.children.length) box.innerHTML = '<div class="note">Nichts gefunden.</div>';
      addClose(box, "Suche: " + q, "psearch");
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  async function showEpisodes(sh) {
    const box = busyBox("spPRes", sh.name + " – lade Folgen …");
    try {
      const j = await api("GET", "/shows/" + sh.id + "/episodes?market=DE&limit=10"); box.innerHTML = "";
      ((j && j.items) || []).filter(Boolean).forEach(ep => {
        const rp = ep.resume_point || {}, st = rp.fully_played ? "gehört" : rp.resume_position_ms > 0 ? "angefangen bei " + fmt(rp.resume_position_ms) : "neu";
        box.appendChild(resBtn(ep.name, (ep.release_date || "") + " · " + Math.round((ep.duration_ms || 0) / 60000) + " min · " + st, () => pickEpisode(ep, "spotify:show:" + sh.id)));
      });
      addClose(box, sh.name, "eps");
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  async function pickEpisode(ep, show) {
    const rp = ep.resume_point || {};
    // show = Kennung der Sendung (23.10.2026): eine Folge über uris zu starten nimmt Spotify zwar
    // an, lädt sie aber nicht (am iPhone gemessen). Mit der Sendung als Zusammenhang und der Folge
    // als Einstieg ist es der dokumentierte Weg und läuft zuverlässig.
    S.pod = { episode: ep.uri, name: ep.name, pos: rp.fully_played ? 0 : (rp.resume_position_ms || 0) };
    if (show) S.pod.show = show; save();
    await pushConfig({ pod: S.pod });
    $("spPRes").innerHTML = "";
    await switchTo("podcast", "Auswahl");
  }
  // Spotify-App direkt öffnen (dort Play drücken), beim Zurückkommen wird das Gerät automatisch erkannt
  function openSpotifyApp() {
    log("Spotify-App geöffnet");
    if (NATIVE && CAP.Plugins.AppLauncher) { CAP.Plugins.AppLauncher.openUrl({ url: "spotify:" }).catch(() => { location.href = "spotify:"; }); return; }
    location.href = "spotify:";
  }
  async function findDevices(id) {
    id = id || "spDevList";
    const box = busyBox(id, "Suche Geräte …");
    try {
      const j = await api("GET", "/me/player/devices"), d = (j && j.devices) || []; box.innerHTML = d.length ? "" : '<div class="note">Kein Gerät gefunden. Öffne Spotify, drück kurz Play und komm dann hierher zurück.</div><button class="btn primary" data-spopen>Spotify öffnen</button>';
      { const ob = box.querySelector("[data-spopen]"); if (ob) ob.onclick = openSpotifyApp; }
      d.forEach(x => box.appendChild(resBtn((S.device && S.device.id === x.id ? "✓ " : "") + x.name, x.type + (x.is_active ? " · aktiv" : ""), async () => {
        S.device = { id: x.id, name: x.name }; save(); pushConfig();
        try { await api("PUT", "/me/player", { device_ids: [x.id], play: false }); } catch (e) {}
        box.innerHTML = ""; setTimeout(() => nowPlaying(true), 800);
      })));
      if (d.length) addClose(box, d.length + (d.length === 1 ? " Gerät" : " Geräte"), "dev");
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  function toast(t) {
    if (!t) return;
    const n = $("spNow"); if (n) { n.textContent = t; return; }
    const d = document.createElement("div"); d.textContent = t;
    d.style.cssText = "position:fixed;left:16px;right:16px;bottom:96px;z-index:1000;background:#2A1416;border:1px solid #5A2428;color:#FFB4B4;padding:10px 12px;border-radius:10px;font-size:.88rem";
    document.body.appendChild(d); setTimeout(() => d.remove(), 4500);
  }

  // ---------- Start ----------
  async function init() {
    css();
    setupBar();
    if (T) {
      CAP.Plugins.App.addListener("appUrlOpen", ev => {
        if (!ev || !ev.url || ev.url.indexOf("morgenroutine://spotify") !== 0) return;
        try { CAP.Plugins.Browser.close(); } catch (e) {}
        handleRedirect(new URLSearchParams(ev.url.split("?")[1] || ""));
      });
      await syncNative();
      pushSound();
      document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#mute,#snd")) setTimeout(pushSound, 50); }, true);
      document.addEventListener("change", e => { if (e.target && e.target.id === "snd") setTimeout(pushSound, 50); }, true);
    }
    const q = new URLSearchParams(location.search);
    if (q.has("code") || q.has("error")) { history.replaceState(history.state, "", location.pathname); /* bisherigen state erhalten, wie app.js an vergleichbaren Stellen (13.10.2026) */ await handleRedirect(q); }
    render();
    setInterval(async () => {
      if (document.hidden) return;
      const pl = $("player");
      if ((pl && !pl.hidden) || sheetOpen()) { if (T) await syncNative(); render(); if (!sheetOpen() && Date.now() - devAt > 15000) checkDev(); }
      if (sheetOpen()) nowPlaying();
    }, 3000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNative().then(() => { render(); if (authed()) { checkDev(); if (sheetOpen()) nowPlaying(true); } }); });
  }
  window.TrainingSpotify = { openMenu, switchTo, setSmart, checkDev, state: () => S, device: () => ({ known: devAt > 0, name: devName }) };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
