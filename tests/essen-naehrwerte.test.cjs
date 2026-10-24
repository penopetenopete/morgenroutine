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

/* ---------- Tagesliste: Tipp trennen (Pille = Mengenfeld, Rest der Zeile = Nährwerte) ----------
   Läuft durch den echten Zeilen-Handler aus bindSlots/gesture: eine Ersatz-Zeile sammelt den pointerdown-Zuhörer,
   document sammelt pointerup. Gedrückthalten (Zeitgeber) und Wischen sind im Lader nicht abbildbar → Gerät. */
const heute = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

function tagesliste(eintraege) {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  E.days[k] = { e: eintraege };
  const reihen = {}, doc = {};
  h.ctx.document.addEventListener = (t, fn) => { doc[t] = fn; };
  h.ctx.document.removeEventListener = () => {};
  const S2 = h.el("eSlots");
  S2.querySelectorAll = sel => sel === "[data-e],[data-gt]" ? Object.values(reihen) : [];
  const reihe = ds => { const id = ds.e || ds.gt; return reihen[id] = reihen[id] || { dataset: ds, l: {}, addEventListener(t, fn) { this.l[t] = fn; } }; };
  const tipp = (r, aufPille) => {
    r.l.pointerdown({ button: 0, clientX: 0, clientY: 0, target: { closest: () => null } });
    doc.pointerup({ target: { closest: s => (aufPille && s === "[data-pill]") ? {} : null } });
  };
  return { h, K, E, k, reihe, tipp, html: () => S2.innerHTML };
}
const hat = (html, klasse) => html.includes(klasse);

test("Tipp auf den Rest der Zeile zeigt die Nährwerte, nicht das Mengenfeld; nochmal Tippen schließt", () => {
  const t = tagesliste([{ id: "x1", slot: "fr", food: "hafer", amt: 80 }]);
  const r = t.reihe({ e: "x1" });
  t.K.setDay(t.k); // bindet die Ersatz-Zeile
  t.tipp(r, false);
  assert.ok(hat(t.html(), "enutrow"), "Nährwerte offen");
  assert.ok(!hat(t.html(), "eamtrow"), "Mengenfeld nicht offen");
  t.tipp(r, false);
  assert.ok(!hat(t.html(), "enutrow") && !hat(t.html(), "eamtrow"), "zweiter Tipp schließt");
});

test("Tipp auf die Gramm-Pille öffnet das Mengenfeld wie bisher; Nährwerte und Mengenfeld schließen sich gegenseitig", () => {
  const t = tagesliste([{ id: "x1", slot: "fr", food: "hafer", amt: 80 }]);
  const r = t.reihe({ e: "x1" });
  t.K.setDay(t.k);
  t.tipp(r, true);
  assert.ok(hat(t.html(), "eamtrow") && !hat(t.html(), "enutrow"));
  t.tipp(r, false);
  assert.ok(hat(t.html(), "enutrow") && !hat(t.html(), "eamtrow"), "Zeile angetippt → Mengenfeld zu, Nährwerte auf");
  t.tipp(r, true);
  assert.ok(hat(t.html(), "eamtrow") && !hat(t.html(), "enutrow"), "Pille angetippt → Nährwerte zu, Mengenfeld auf");
  t.tipp(r, true);
  assert.ok(!hat(t.html(), "eamtrow") && !hat(t.html(), "enutrow"), "Pille nochmal → zu");
});

test("nur eine Zeile gleichzeitig offen (Nährwerte)", () => {
  const t = tagesliste([{ id: "x1", slot: "fr", food: "hafer", amt: 80 }, { id: "x2", slot: "fr", food: "quark", amt: 250 }]);
  const r1 = t.reihe({ e: "x1" }), r2 = t.reihe({ e: "x2" });
  t.K.setDay(t.k);
  t.tipp(r1, false); t.tipp(r2, false);
  assert.equal((t.html().match(/class="enutrow"/g) || []).length, 1);
});

test("Mehrfachauswahl aktiv: Tipp wählt an/ab, öffnet weder Nährwerte noch Mengenfeld (auch nicht auf der Pille)", () => {
  const t = tagesliste([{ id: "x1", slot: "fr", food: "hafer", amt: 80 }]);
  const r = t.reihe({ e: "x1" });
  t.K.setDay(t.k);
  t.K.sel().add("x2"); // Auswahl läuft schon (anderer Eintrag)
  t.tipp(r, false);
  assert.ok(t.K.sel().has("x1"), "angewählt");
  assert.ok(!hat(t.html(), "enutrow") && !hat(t.html(), "eamtrow"));
  t.tipp(r, true);
  assert.ok(!t.K.sel().has("x1"), "abgewählt");
  assert.ok(!hat(t.html(), "enutrow") && !hat(t.html(), "eamtrow"));
});

test("Gruppenzeile: Tipp klappt auf/zu (unverändert)", () => {
  const t = tagesliste([
    { id: "a1", slot: "fr", food: "hafer", amt: 80, g: { id: "g1", name: "Mein Frühstück" } },
    { id: "a2", slot: "fr", food: "quark", amt: 250, g: { id: "g1", name: "Mein Frühstück" } }]);
  const r = t.reihe({ gt: "g1" });
  t.K.setDay(t.k);
  assert.ok(!hat(t.html(), "egin"));
  t.tipp(r, false);
  assert.ok(hat(t.html(), "egin"), "aufgeklappt");
  t.tipp(r, false);
  assert.ok(!hat(t.html(), "egin"), "zugeklappt");
});

test("onPill: nur ein Treffer auf [data-pill] zählt; ohne Ereignis oder Ziel kein Wurf", () => {
  const K = loadApp({}, OPT).ctx.__essen;
  assert.equal(K.onPill({ target: { closest: s => s === "[data-pill]" ? {} : null } }), true);
  assert.equal(K.onPill({ target: { closest: () => null } }), false);
  assert.equal(K.onPill(undefined), false);
  assert.equal(K.onPill({}), false);
  assert.equal(K.onPill({ target: {} }), false);
});
