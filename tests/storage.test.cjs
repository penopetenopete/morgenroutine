/* Tests für den Speicher: Fehlermeldung, Drossel, alle Schreibstellen, unlesbare Daten (SAFE-01).
   Alle Fixtures sind erfunden; keine echten Trainings- oder Ernährungsdaten.
   Meldung der App: Toast (#toast); Meldung von spotify.js: #spNow. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

const MELDUNG = "Speichern ging nicht";

const toastText = h => h.el("toast").textContent;
const toastShown = h => h.el("toast").classList.contains("show");

test("Erfolg: erfolgreiches Speichern zeigt keine Meldung", () => {
  const h = loadApp();
  h.A.save();
  assert.equal(toastText(h), "");
  assert.equal(toastShown(h), false);
});

test("Fehler: save() wirft nicht, der Toast zeigt genau den festen Text", () => {
  const h = loadApp();
  h.failSet = () => true;
  assert.doesNotThrow(() => h.A.save());
  assert.equal(toastText(h), MELDUNG);
  assert.equal(toastShown(h), true);
});

test("Zustand bleibt: nach einem Fehler ist S unverändert und training_v1 nicht überschrieben", () => {
  const h = loadApp();
  h.A.save();
  const vorher = JSON.stringify(h.A.S());
  const gespeichert = h.dump().training_v1;
  h.failSet = () => true;
  h.A.S().g.testwert = 42;
  h.A.save();
  assert.equal(h.A.S().g.testwert, 42);
  assert.equal(h.dump().training_v1, gespeichert);
  delete h.A.S().g.testwert;
  assert.equal(JSON.stringify(h.A.S()), vorher);
});

test("Drossel: höchstens eine Meldung je 10 Sekunden, Rückstellen der Uhr meldet wieder", () => {
  let uhr = 1000;
  const h = loadApp({}, { now: () => uhr });
  h.failSet = () => true;
  const leeren = () => { h.el("toast").textContent = ""; };
  uhr = 1000; h.A.save();
  assert.equal(toastText(h), MELDUNG);
  leeren();
  uhr = 5000; h.A.save();
  assert.equal(toastText(h), "");
  uhr = 10999; h.A.save();
  assert.equal(toastText(h), "");
  uhr = 11000; h.A.save();
  assert.equal(toastText(h), MELDUNG);
  leeren();
  uhr = 500; h.A.save();
  assert.equal(toastText(h), MELDUNG);
});

test("laufendes Workout: saveW() wirft nicht und meldet", () => {
  const h = loadApp();
  h.A.W = { id: "t", ended: false };
  h.failSet = () => true;
  assert.doesNotThrow(() => h.A.saveW());
  assert.equal(toastText(h), MELDUNG);
  h.A.W = null;
});

test("Ernährung: esave() meldet über die gemeinsame Meldung", () => {
  const h = loadApp({}, { withEssenSpotify: true });
  h.el("toast").textContent = "";
  h.failSet = () => true;
  const E = h.ctx.TrainingEssen;
  assert.doesNotThrow(() => E.set(E.get()));
  assert.equal(toastText(h), MELDUNG);
});

test("Spotify-Einstellungen: save() meldet über die gemeinsame Meldung", async () => {
  const h = loadApp({}, { withEssenSpotify: true });
  h.el("toast").textContent = "";
  h.failSet = () => true;
  await h.ctx.TrainingSpotify.setSmart(false);
  assert.equal(toastText(h), MELDUNG);
});

test("gemeinsame Drossel: Fehler in Training und Ernährung zählen zusammen", () => {
  let uhr = 1000;
  const h = loadApp({}, { withEssenSpotify: true, now: () => uhr });
  const leeren = () => { h.el("toast").textContent = ""; };
  leeren();
  h.failSet = () => true;
  uhr = 1000; h.A.save();
  assert.equal(toastText(h), MELDUNG);
  leeren();
  uhr = 2000;
  const E = h.ctx.TrainingEssen;
  E.set(E.get());
  assert.equal(toastText(h), "");
});

test("Spotify-Anmeldung: scheitert das Speichern, Meldung und keine Anmeldeseite", async () => {
  const h = loadApp({}, { withEssenSpotify: true });
  h.ctx.TrainingSpotify.openMenu();
  await new Promise(r => setImmediate(r));
  const login = h.el("spLogin").onclick;
  assert.equal(typeof login, "function");
  const href = h.ctx.location.href;
  h.failSet = k => k.endsWith("_pkce");
  await assert.doesNotReject(async () => login());
  assert.equal(h.el("spNow").textContent, MELDUNG);
  assert.equal(h.ctx.location.href, href);
});

test("Start mit vollem Speicher: läuft durch, S ist da, Meldung steht", () => {
  let h;
  assert.doesNotThrow(() => { h = loadApp({}, { withEssenSpotify: true, failSet: () => true }); });
  assert.equal(typeof h.A.S(), "object");
  assert.equal(Array.isArray(h.A.S().routines), true);
  assert.equal(toastText(h), MELDUNG);
});

const DEFEKT = "Daten beschädigt – Kopie aufbewahrt";

test("unlesbare Trainingsdaten: Rohkopie bleibt, Meldung, App läuft mit Startwerten", () => {
  const h = loadApp({ training_v1: '{"kaputt' });
  assert.equal(h.dump().training_defekt_v1, '{"kaputt');
  assert.equal(toastText(h), DEFEKT);
  assert.equal(Array.isArray(h.A.S().routines), true);
});

test("vorhandene Kopie wird nicht überschrieben", () => {
  const h = loadApp({ training_v1: '{"kaputt', training_defekt_v1: "ALT" });
  assert.equal(h.dump().training_defekt_v1, "ALT");
});

test("training_v1 ohne Objekt (Array): Kopie unter training_defekt_v1", () => {
  const h = loadApp({ training_v1: "[1,2]" });
  assert.equal(h.dump().training_defekt_v1, "[1,2]");
});

test("lesbare Daten: keine Kopie, keine Meldung, auch beim zweiten Start", () => {
  const h1 = loadApp({});
  h1.A.save();
  const h2 = loadApp(h1.dump());
  for (const h of [h1, h2]) {
    assert.deepStrictEqual(Object.keys(h.dump()).filter(k => k.includes("_defekt_")), []);
    assert.notEqual(toastText(h), DEFEKT);
  }
});

test("unlesbare Ernährungsdaten: Kopie unter essen_defekt_v1, Meldung", () => {
  const h = loadApp({ essen_v1: '{"kaputt' }, { withEssenSpotify: true });
  assert.equal(h.dump().essen_defekt_v1, '{"kaputt');
  assert.equal(toastText(h), DEFEKT);
  assert.equal(typeof h.ctx.TrainingEssen.get().foods, "object");
});

test("Ernährungsdaten ohne foods: ebenfalls Kopie", () => {
  const h = loadApp({ essen_v1: '{"x":1}' }, { withEssenSpotify: true });
  assert.equal(h.dump().essen_defekt_v1, '{"x":1}');
});
