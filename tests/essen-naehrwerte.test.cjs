/* Tests für die Ernährung vom 24.10.2026: Nährwerte unter der Tageszeile, eigene Einheiten am Lebensmittel.
   Geprüft wird der echte Code aus essen.js über window.__essen. Aussehen, Wischen/Gedrückthalten, Leiste scrollt,
   „nichts springt“ lassen sich nur am Gerät prüfen (siehe SUMMARY). Alle Fixtures sind erfunden. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

const OPT = { withEssenSpotify: true };
const gespeichert = h => JSON.parse(h.dump().essen_v1);
const nah = (a, b) => Math.abs(a - b) < 1e-9;

/* ---------- Nährwerte für die eingetragene Menge ---------- */

test("nutInfo (pro 100 g): Menge stimmt mit nut überein, Bezug ist pro 100 g, Herkunft eigene Liste", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = K.E().foods.hafer; // 372 kcal / 100 g
  const i = K.nutInfo(f, 80, undefined), n = K.nut(f, 80, undefined);
  for (const k of ["kcal", "p", "c", "f", "fib"]) assert.ok(nah(i.n[k], n[k]), k);
  assert.ok(nah(i.n.kcal, 372 * 0.8));
  assert.equal(i.lab, "pro 100 g");
  assert.ok(nah(i.ref.kcal, 372) && nah(i.ref.p, 13.5) && nah(i.ref.fib, 10));
  assert.equal(i.src, "eigene Liste");
});

test("nutInfo (pro Stück): Menge in Stück, Bezug ist pro Stück", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = K.E().foods.roggen; // 172 kcal / Stück
  const i = K.nutInfo(f, 2, undefined);
  assert.ok(nah(i.n.kcal, 344) && nah(i.n.p, 10.6));
  assert.equal(i.lab, "pro Stück");
  assert.ok(nah(i.ref.kcal, 172) && nah(i.ref.c, 32.9));
});

test("nutInfo (Gramm-Lebensmittel, Menge in Stück): rechnet über Gramm pro Stück, Bezug bleibt pro 100 g", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = K.E().foods.ei; // 135 kcal / 100 g, 60 g pro Stück
  const i = K.nutInfo(f, 3, "stk");
  assert.ok(nah(i.n.kcal, 135 * 1.8));
  assert.ok(nah(i.n.kcal, K.nut(f, 3, "stk").kcal));
  assert.equal(i.lab, "pro 100 g");
  assert.ok(nah(i.ref.kcal, 135));
});

test("nutInfo: unbekanntes Lebensmittel → null, nutH → leer, kein Wurf", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  assert.equal(K.nutInfo(undefined, 5), null);
  assert.equal(K.nutH(undefined, { amt: 5 }), "");
});

test("nutH: zeigt Werte für die Menge UND den Bezugswert, Herkunft nur wenn bekannt", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = K.E().foods.hafer;
  const html = K.nutH(f, { id: "x", food: "hafer", amt: 80 });
  assert.ok(html.includes(">298<"), "372 kcal × 0,8 = 297,6 → 298 für 80 g");
  assert.ok(html.includes(">372<"), "Bezugswert pro 100 g");
  assert.ok(html.includes("pro 100 g"));
  assert.ok(html.includes("eigene Liste"));
  const ohne = K.nutH(Object.assign({}, f, { src: undefined }), { id: "x", food: "hafer", amt: 80 });
  assert.ok(!ohne.includes("eigene Liste"));
  assert.ok(ohne.includes("pro 100 g"));
});

test("nutH ändert nichts am Speicher (reine Anzeige)", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = K.E().foods.hafer;
  const vorher = JSON.stringify(K.E());
  K.nutH(f, { id: "x", food: "hafer", amt: 80 });
  K.nutInfo(f, 80);
  assert.equal(JSON.stringify(K.E()), vorher);
});
