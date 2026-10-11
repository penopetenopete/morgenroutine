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
