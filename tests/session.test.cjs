/* Tests für die Sitzung über die Spotify-Umleitung (WORK-05, 13.10.2026): Sicherung vor der
   Navigation nach accounts.spotify.com, Rückkehr mit kleinem und großem Zeitsprung, keine
   Spotify-Geheimnisse in der gesicherten Sitzung. Alle Fixtures sind erfunden; kein echter
   Spotify-Zugang, kein echtes Training kommt vor. Grundlage: 02-02-PLAN.md <interfaces>,
   Messlauf vom 2026-10-12 gegen v29/v30. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

/* Einstellungen der Sitzung aus dem Messlauf im PLAN-Kontextblock. */
const SETTINGS = { umbau: 10, satz: 60, wechsel: 15, confirm: false };

/* Baut die Sitzung aus dem Messlauf: eine Übung heelsit {sets:2, secs:60}, uid "a".
   W.cur kommt aus h.A.buildSteps(W) (Schritt 1, der erste Arbeitsschritt), nicht als Zeichenkette.
   Die vorher eingetragene Ergebniszeile für "a" hat bewusst kein Feld "part" – anders als die
   Zeile, die recordHold beim Nachholen anlegt (part:0) – sonst würde putSet beide als denselben
   Satz ansehen und die vorhandene Zeile ersetzen statt eine zweite anzuhängen (am 2026-10-13 mit
   diesem Harness nachgemessen). */
function buildSession(h, startedAt) {
  const items = [{ uid: "a", ex: "heelsit", o: Object.assign({}, h.F.EXB.heelsit.def, { sets: 2, secs: 60 }), status: "plan" }];
  const W = {
    v: 1, id: "w" + startedAt.toString(36), rid: "r1", rname: "Morgenroutine", day: 0, days: 1,
    settings: SETTINGS, pauses: {}, audio: {},
    startedAt, items, cur: null, stepStart: startedAt, pauseAt: null, pausedMs: 0, extra: 0,
    res: { a: { time: 12, sets: [{ set: 1, side: 0, stage: null, mode: "hold", target: 60, done: 12 }] } },
    pending: null, ended: false, visited: ["a"],
  };
  const steps = h.A.buildSteps(W);
  W.cur = steps[1].key; // erster Arbeitsschritt: Satz 1, Seite 0
  return { W, steps };
}

/* ---- Aufgabe 1: Die Sitzung steht im Speicher, bevor die Seite wechselt ---- */

test("Anmeldung: training_active_v1 trägt dieselbe id wie W, im Moment der Umleitung", async () => {
  const h = loadApp({}, { withEssenSpotify: true });
  const { W } = buildSession(h, Date.now());
  h.A.W = W; // im Arbeitsspeicher, bewusst nicht gesichert

  let gemerkt = null;
  Object.defineProperty(h.ctx.location, "href", {
    configurable: true,
    get() { return "https://example.test/morgenroutine/index.html"; },
    set(v) { gemerkt = { url: v, gespeichert: h.storage.getItem("training_active_v1") }; },
  });

  h.ctx.TrainingSpotify.openMenu();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const login = h.el("spLogin").onclick;
  assert.equal(typeof login, "function");
  await login();

  assert.ok(gemerkt, "location.href wurde nicht gesetzt");
  assert.match(gemerkt.url, /^https:\/\/accounts\.spotify\.com\/authorize\?/);
  assert.ok(gemerkt.gespeichert, "training_active_v1 war im Moment der Umleitung leer");
  const gesichert = JSON.parse(gemerkt.gespeichert);
  assert.equal(gesichert.id, W.id);
});

test("Anmeldung: die gesicherte Sitzung enthält weder PKCE-Prüfwert noch Spotify-Zugang", async () => {
  const h = loadApp({}, { withEssenSpotify: true });
  const { W } = buildSession(h, Date.now());
  h.A.W = W;

  let gemerkt = null;
  Object.defineProperty(h.ctx.location, "href", {
    configurable: true,
    get() { return "https://example.test/morgenroutine/index.html"; },
    set(v) { gemerkt = { gespeichert: h.storage.getItem("training_active_v1") }; },
  });

  h.ctx.TrainingSpotify.openMenu();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await h.el("spLogin").onclick();

  const pkce = JSON.parse(h.storage.getItem("spotify_labor_v1_pkce") || "{}");
  assert.ok(pkce.v, "PKCE-Prüfwert wurde nicht abgelegt");
  assert.equal(gemerkt.gespeichert.includes(pkce.v), false);
  assert.equal(/tok|access|refresh/i.test(gemerkt.gespeichert), false);
});

test("window.AppKit.saveW: false ohne Sitzung, true mit Sitzung, danach steht der Eintrag im Speicher", () => {
  const h = loadApp();
  assert.equal(h.ctx.AppKit.saveW(), false);
  assert.equal(h.storage.getItem("training_active_v1"), null);
  h.A.W = { id: "probe", ended: false };
  assert.equal(h.ctx.AppKit.saveW(), true);
  assert.ok(h.storage.getItem("training_active_v1"));
  assert.equal(JSON.parse(h.storage.getItem("training_active_v1")).id, "probe");
});

test("Protokoll: login schreibt genau eine feste deutsche Zeile ohne Adresse, Code oder Prüfwert", async () => {
  const h = loadApp({}, { withEssenSpotify: true });
  const { W } = buildSession(h, Date.now());
  h.A.W = W;
  Object.defineProperty(h.ctx.location, "href", { configurable: true, get() { return ""; }, set() {} });

  h.ctx.TrainingSpotify.openMenu();
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  await h.el("spLogin").onclick();

  const s = JSON.parse(h.storage.getItem("spotify_labor_v1"));
  assert.equal(s.log[0].text, "Anmeldung gestartet · Workout gesichert");
  assert.equal(s.log[0].kind, "o");
  assert.equal(/https?:|code=|state=|verifier/i.test(s.log[0].text), false);
});

/* ---- Aufgabe 2: Die Rückkehr landet an derselben Stelle ---- */

test("Z1 – 20 s Abstand: dieselbe Stelle, W.res unverändert, Player läuft weiter", () => {
  const T0 = 1700000000000;
  const h = loadApp({}, { now: () => T0 });
  const { W, steps } = buildSession(h, T0);
  h.A.W = W;
  h.A.saveW();
  const dump = h.dump();
  const resVorher = JSON.stringify(W.res);

  const h2 = loadApp(dump, { now: () => T0 + 20000 });
  assert.equal(h2.A.W.cur, steps[1].key);
  assert.equal(h2.A.idx, 1);
  assert.equal(JSON.stringify(h2.A.W.res), resVorher);
  assert.equal(h2.A.W.ended, false);
  assert.equal(h2.el("player").hidden, false);
});

test("Z2 – 200 s Abstand: Satz 2 aktiv, Zeit nachgerechnet, alte Ergebniszeile bleibt erste", () => {
  const T0 = 1700000000000;
  const h = loadApp({}, { now: () => T0 });
  const { W, steps } = buildSession(h, T0);
  h.A.W = W;
  h.A.saveW();
  const dump = h.dump();

  const h2 = loadApp(dump, { now: () => T0 + 200000 });
  assert.equal(h2.A.W.cur, steps[3].key);
  assert.equal(h2.A.idx, 3);
  assert.equal(h2.A.W.ended, false);
  assert.equal(h2.A.W.res.a.sets[0].done, 12);
  assert.equal(h2.A.W.res.a.sets.length, 2);
  assert.equal(h2.A.W.res.a.time, 72);
  assert.equal(h2.el("player").hidden, false);
});

test("Beendete Sitzung wird beim Neuladen nicht fortgesetzt", () => {
  const T0 = 1700000000000;
  const h = loadApp({}, { now: () => T0 });
  const { W } = buildSession(h, T0);
  h.A.W = W;
  h.A.saveW();
  const dump = h.dump();
  dump.training_active_v1 = JSON.stringify(Object.assign({}, W, { ended: true }));

  const h2 = loadApp(dump, { now: () => T0 + 20000 });
  assert.equal(h2.A.W, null);
  // Zusätzliches Messergebnis (13.10.2026): der DOM-Stub von harness.cjs legt jedes Element mit
  // hidden:false an; das echte index.html hat #player hingegen von Anfang an mit dem Attribut
  // "hidden" markiert. Ohne Wiederaufnahme ruft app.js startPlayer() (und damit $("player").hidden=
  // false) nie auf – das belegbare Signal dafür ist, dass #home sichtbar bleibt (kein Wechsel zum
  // Player), nicht der literale Wert von #player.hidden, den der Stub ohnehin nie auf true setzt.
  assert.equal(h2.el("home").hidden, false);
});
