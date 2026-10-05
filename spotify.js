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
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
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
    localStorage.setItem(KEY + "_pkce", JSON.stringify({ v, st, redirect: REDIRECT }));
    const p = new URLSearchParams({ response_type: "code", client_id: CLIENT_ID, scope: SCOPES, code_challenge_method: "S256", code_challenge: await challenge(v), redirect_uri: REDIRECT, state: st });
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
  async function snapshot() {
    const p = await api("GET", "/me/player?additional_types=episode");
    if (!p || !p.item) return null;
    if (p.device && p.device.id && !S.device) S.device = { id: p.device.id, name: p.device.name };
    if (p.item.type === "track") S.music = { track: p.item.uri, name: p.item.name, pos: p.progress_ms, ctx: p.context ? p.context.uri : null, ctxType: p.context ? p.context.type : null };
    else if (p.item.type === "episode") S.pod = { episode: p.item.uri, name: p.item.name, pos: p.progress_ms };
    save(); return p;
  }
  async function play(body) {
    try { await api("PUT", "/me/player/play" + dq("?"), body); }
    catch (e) {
      if (e.status !== 404 || !S.device) throw e;
      await api("PUT", "/me/player", { device_ids: [S.device.id], play: false }); await wait(800);
      await api("PUT", "/me/player/play" + dq("?"), body);
    }
  }
  async function seekTo(ms) { if (ms > 2000) { await wait(700); await api("PUT", "/me/player/seek?position_ms=" + Math.round(ms) + dq("&")); } }
  async function podcastEpisode() {
    if (S.pod && S.pod.episode) return S.pod.episode;
    throw new Error("Noch keine Podcast-Folge gemerkt. Im ♫-Menü eine wählen oder kurz in Spotify eine anmachen.");
  }
  async function webSwitch(target, force) {
    let p = null; try { p = await snapshot(); } catch (e) { if (e.status !== 404) throw e; }
    if (force) { S.music = force; S.mode = null; }
    const item = p && p.item;
    if (target === "music" && S.mode === "queue" && item && item.type === "episode" && S.music) {
      await api("POST", "/me/player/next" + dq("?")); await seekTo(S.music.pos || 0); S.mode = null;
    } else if (target === "podcast" && item && item.type === "track" && !resumable(p.context)) {
      const ep = await podcastEpisode(), pos = S.pod && S.pod.episode === ep ? Math.max(0, (S.pod.pos || 0) - S.rewind * 1000) : 0;
      await api("POST", "/me/player/queue?uri=" + encodeURIComponent(ep) + dq("&"));
      await api("POST", "/me/player/queue?uri=" + encodeURIComponent(item.uri) + dq("&"));
      await api("POST", "/me/player/next" + dq("?")); await seekTo(pos); S.mode = "queue";
    } else if (target === "music") {
      S.mode = null; const m = S.music;
      if (m && m.ctx && !m.track) await play({ context_uri: m.ctx });
      else if (m && m.track && m.ctx) { try { await play({ context_uri: m.ctx, offset: { uri: m.track }, position_ms: m.pos || 0 }); } catch (e) { if (e.status === 404 || e.status === 403) throw e; await play({ uris: [m.track], position_ms: m.pos || 0 }); } }
      else if (m && m.track) await play({ uris: [m.track], position_ms: m.pos || 0 });
      else throw new Error("Noch keine Musik gemerkt. Im ♫-Menü Musik wählen oder kurz in Spotify Musik anmachen.");
    } else {
      S.mode = null; const ep = await podcastEpisode();
      await play({ uris: [ep], position_ms: S.pod && S.pod.episode === ep ? Math.max(0, (S.pod.pos || 0) - S.rewind * 1000) : 0 });
    }
    S.active = target; save();
  }

  let busy = false;
  async function switchTo(target, why, force) {
    if (busy) return; busy = true; render(target);
    try {
      if (T) {
        const r = force ? await T.playMusic({ music: JSON.stringify(force) }) : await T.switchTo({ target });
        if (!r.ok) toast(r.error);
        await syncNative();
      } else { await webSwitch(target, force); log("→ " + (target === "music" ? "Musik" : "Podcast") + (why ? " · " + why : ""), "o"); }
    } catch (e) { toast(explain(e)); log("Umschalten fehlgeschlagen: " + explain(e), "e"); }
    busy = false; render(); setTimeout(() => nowPlaying(true), 600);
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
#spotBar.busy{opacity:.6}
.sp-now{font-size:.88rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sp-now b{color:var(--fg);font-weight:600}
.sp-ctrl{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:8px}
.sp-ctrl .btn{font-size:1.25rem}
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
.sp-res button{text-align:left;min-height:44px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font:inherit;font-size:.92rem;cursor:pointer}
.sp-res button small{display:block;color:var(--muted);font-size:.78rem}
.sp-set{display:grid;grid-template-columns:1fr 90px;gap:8px;align-items:center;font-size:.88rem;color:var(--muted)}
.sp-log{font:12px/1.5 ui-monospace,monospace;max-height:220px;overflow:auto;white-space:pre-wrap;color:var(--muted)}
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
    bar.classList.toggle("busy", !!pending);
    bar.querySelectorAll(".spotseg .spb").forEach(b => b.setAttribute("aria-pressed", String((b.dataset.src === "podcast" ? "podcast" : "music") === (pending || S.active))));
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
  async function fillSheet() {
    const box = $("spSheet"); if (!box) return;
    await syncNative();
    if (!authed()) {
      box.innerHTML = '<div class="note">Verbinde die App einmal mit Spotify (Premium). Danach kannst du hier Musik und Podcast wählen und im Workout umschalten.</div><button class="btn primary big" id="spLogin">Mit Spotify verbinden</button>';
      $("spLogin").onclick = login; return;
    }
    box.innerHTML = `
      <div class="sp-seg"><button data-src="music">Musik</button><button data-src="podcast">Podcast</button></div>
      <label class="sp-row"><span><b>Smart</b><small id="spSmartNote">Musik im Satz · Podcast in der Pause</small></span><span class="sp-sw"><input type="checkbox" id="spSmart"><i></i></span></label>
      <div class="sp-now" id="spNow">–</div>
      <div class="sp-ctrl"><button class="btn" id="spPrev">⏮</button><button class="btn" id="spToggle">⏯</button><button class="btn" id="spNext">⏭</button></div>
      <h3>Musik wählen</h3>
      <div class="sp-in"><input id="spMQ" placeholder="Song oder Playlist suchen" enterkeyhint="search"><button class="btn" id="spMGo">Suchen</button></div>
      <button class="btn" id="spMyPl">Meine Playlists</button>
      <div class="sp-res" id="spMRes"></div>
      <h3>Podcast wählen</h3>
      <div class="sp-in"><input id="spPQ" placeholder="z. B. Hotel Matze" enterkeyhint="search"><button class="btn" id="spPGo">Suchen</button></div>
      <div class="sp-res" id="spPRes"></div>
      <div class="note" id="spSaved"></div>
      <details><summary class="small">Weitere Einstellungen</summary>
        <div class="sp-set" style="margin-top:10px">
          <span>Podcast zurückspulen (s)</span><input id="spRew" type="number" min="0" max="30">
          <span>Smart: Pausen kürzer als … s bleiben Musik</span><input id="spShort" type="number" min="0" max="300">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button class="btn" id="spDev">Gerät suchen</button><button class="btn" id="spOut">Abmelden</button></div>
        <div class="sp-res" id="spDevList" style="margin-top:8px"></div>
        <div class="small" style="margin-top:10px">Protokoll</div><div class="sp-log" id="spLog"></div>
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
    $("spDev").onclick = findDevices;
    $("spOut").onclick = async () => { delete S.tok; save(); if (T) await T.logout(); await syncNative(); fillSheet(); render(); };
    fillState(); nowPlaying(true);
  }
  function fillState() {
    const box = $("spSheet"); if (!box || !$("spSmart")) return;
    box.querySelectorAll(".sp-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.src === S.active)));
    $("spSmart").checked = !!S.smart;
    $("spSmartNote").textContent = S.smart ? "An · von Hand umschalten gilt bis zur nächsten Phase" : "Musik im Satz · Podcast in der Pause";
    const pod = S.active === "podcast";
    $("spPrev").textContent = pod ? "↺15" : "⏮"; $("spPrev").dataset.a = pod ? "back15" : "prev";
    $("spNext").textContent = pod ? "30↻" : "⏭"; $("spNext").dataset.a = pod ? "fwd30" : "next";
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
      const p = await api("GET", "/me/player?additional_types=episode"), it = p && p.item;
      if (!$("spNow")) return;
      $("spNow").innerHTML = it ? (it.type === "episode" ? "🎙 <b>" + esc(it.name) + "</b>" + (it.show ? " · " + esc(it.show.name) : "") : "♪ <b>" + esc(it.name) + "</b> · " + esc((it.artists || []).map(a => a.name).join(", "))) : "Gerade läuft nichts.";
      $("spToggle").textContent = p && p.is_playing ? "⏸" : "▶";
    } catch (e) { if ($("spNow")) $("spNow").textContent = explain(e); }
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
  function busyBox(id, t) { const b = $(id); if (b) b.innerHTML = `<div class="note">${esc(t)}</div>`; return b; }
  async function myPlaylists() {
    const box = busyBox("spMRes", "Lade deine Playlists …");
    try {
      let all = [], url = "/me/playlists?limit=50";
      for (let i = 0; i < 4 && url; i++) { const j = await api("GET", url); (j && j.items || []).filter(Boolean).forEach(x => all.push(x)); url = j && j.next ? j.next.replace("https://api.spotify.com/v1", "") : null; }
      box.innerHTML = '<input id="spPlF" placeholder="Playlists filtern …" style="min-height:44px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:0 10px;font:inherit">';
      const list = document.createElement("div"); list.className = "sp-res"; box.appendChild(list);
      const draw = () => { const f = ($("spPlF").value || "").toLowerCase(); list.innerHTML = ""; all.filter(x => !f || (x.name || "").toLowerCase().includes(f)).slice(0, 60).forEach(x => list.appendChild(resBtn(x.name, x.owner && x.owner.display_name, () => pickMusic({ ctx: x.uri, ctxType: "playlist", name: x.name })))); };
      $("spPlF").oninput = draw; draw();
    } catch (e) { box.innerHTML = `<div class="note">${esc(e.status === 401 || e.status === 403 ? "Für deine Playlists bitte unter „Weitere Einstellungen“ abmelden und neu verbinden." : explain(e))}</div>`; }
  }
  async function searchMusic() {
    const q = $("spMQ").value.trim(); if (!q) return; const box = busyBox("spMRes", "Suche …");
    try {
      const j = await api("GET", "/search?type=track,playlist&market=DE&limit=6&q=" + encodeURIComponent(q)); box.innerHTML = "";
      ((j && j.tracks && j.tracks.items) || []).filter(Boolean).forEach(t => box.appendChild(resBtn("♪ " + t.name, (t.artists || []).map(a => a.name).join(", "), () => pickMusic({ track: t.uri, name: t.name }))));
      ((j && j.playlists && j.playlists.items) || []).filter(Boolean).forEach(x => box.appendChild(resBtn("☰ " + x.name, x.owner && x.owner.display_name, () => pickMusic({ ctx: x.uri, ctxType: "playlist", name: x.name }))));
      if (!box.children.length) box.innerHTML = '<div class="note">Nichts gefunden.</div>';
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  async function pickMusic(m) { $("spMRes").innerHTML = ""; await switchTo("music", "Auswahl", m); }
  async function searchShows() {
    const q = $("spPQ").value.trim(); if (!q) return; const box = busyBox("spPRes", "Suche …");
    try {
      const j = await api("GET", "/search?type=show&market=DE&limit=8&q=" + encodeURIComponent(q)); box.innerHTML = "";
      ((j && j.shows && j.shows.items) || []).filter(Boolean).forEach(sh => box.appendChild(resBtn(sh.name, sh.publisher, () => showEpisodes(sh))));
      if (!box.children.length) box.innerHTML = '<div class="note">Nichts gefunden.</div>';
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  async function showEpisodes(sh) {
    const box = busyBox("spPRes", sh.name + " – lade Folgen …");
    try {
      const j = await api("GET", "/shows/" + sh.id + "/episodes?market=DE&limit=10"); box.innerHTML = "";
      ((j && j.items) || []).filter(Boolean).forEach(ep => {
        const rp = ep.resume_point || {}, st = rp.fully_played ? "gehört" : rp.resume_position_ms > 0 ? "angefangen bei " + fmt(rp.resume_position_ms) : "neu";
        box.appendChild(resBtn(ep.name, (ep.release_date || "") + " · " + Math.round((ep.duration_ms || 0) / 60000) + " min · " + st, () => pickEpisode(ep)));
      });
    } catch (e) { box.innerHTML = `<div class="note">${esc(explain(e))}</div>`; }
  }
  async function pickEpisode(ep) {
    const rp = ep.resume_point || {};
    S.pod = { episode: ep.uri, name: ep.name, pos: rp.fully_played ? 0 : (rp.resume_position_ms || 0) }; save();
    await pushConfig({ pod: S.pod });
    $("spPRes").innerHTML = "";
    await switchTo("podcast", "Auswahl");
  }
  async function findDevices() {
    const box = busyBox("spDevList", "Suche Geräte …");
    try {
      const j = await api("GET", "/me/player/devices"), d = (j && j.devices) || []; box.innerHTML = d.length ? "" : '<div class="note">Kein Gerät gefunden. Spotify am Handy öffnen und kurz abspielen.</div>';
      d.forEach(x => box.appendChild(resBtn((S.device && S.device.id === x.id ? "✓ " : "") + x.name, x.type + (x.is_active ? " · aktiv" : ""), () => { S.device = { id: x.id, name: x.name }; save(); pushConfig(); findDevices(); })));
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
    if (q.has("code") || q.has("error")) { history.replaceState(null, "", location.pathname); await handleRedirect(q); }
    render();
    setInterval(async () => {
      if (document.hidden) return;
      const pl = $("player");
      if ((pl && !pl.hidden) || sheetOpen()) { if (T) await syncNative(); render(); }
      if (sheetOpen()) nowPlaying();
    }, 3000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) syncNative().then(() => render()); });
  }
  window.TrainingSpotify = { openMenu, switchTo, setSmart, state: () => S };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
