/* Tests für die Ernährung vom 24.10.2026 (zweite Runde): Einheiten-Leiste auch in Suche und Mahlzeiten-Ansicht,
   Vielfaches der Menge (×1,5 / ×2 rechnet um, legt NICHT mehrfach an), „Nochmal“ in der Auswahl-Leiste.
   Geprüft wird der echte Code aus essen.js über window.__essen. Aussehen, Umbruch der Leiste bei schmaler Breite,
   „nichts springt“ lassen sich nur am Gerät prüfen (siehe SUMMARY). Alle Fixtures sind erfunden. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

const OPT = { withEssenSpotify: true };
const heute = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const nah = (a, b) => Math.abs(a - b) < 1e-9;
const gespeichert = h => JSON.parse(h.dump().essen_v1);

/* ---------- Aufgabe 1: Einheiten-Leiste auch beim Hinzufügen ---------- */

/* Suche mit Ersatz-Trefferzeile; Tipp auf die graue Kalorienzahl (.ev) legt an UND öffnet das Mengenfeld */
function suche() {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  h.ctx.fetch = () => Promise.reject(new Error("offline"));
  h.ctx.document.addEventListener = () => {};
  h.ctx.document.removeEventListener = () => {};
  const zeilen = {};
  h.el("eRes").querySelectorAll = s => s === "[data-pick]" ? Object.values(zeilen) : [];
  const zeile = id => zeilen[id] = zeilen[id] || { dataset: { pick: id }, l: {}, addEventListener(t, fn) { this.l[t] = fn; }, onclick: null };
  K.setDay(k);
  return { h, K, E, k, zeile, html: () => h.el("eRes").innerHTML };
}

test("Suche: nach dem Antippen der Kalorienzahl steht die Einheiten-Leiste (derselbe Helfer) neben dem Mengenfeld", () => {
  const s = suche(), z = s.zeile("hafer");
  s.E.foods.hafer.units = [{ t: "Löffel", g: 15 }];
  s.K.openSearch({ kind: "day", slot: "fr" });
  assert.ok(!s.html().includes("data-un"), "ohne geöffnetes Mengenfeld noch keine Leiste");
  z.onclick({ target: { closest: q => q === ".ev" ? {} : null } });
  const html = s.html();
  assert.ok(html.includes('class="eamtrow in"'), "Mengenfeld offen");
  assert.ok(html.includes("Löffel 15 g"), "vorhandene Einheit als Knopf");
  assert.ok(html.includes("data-uadd"), "und das ＋ zum Anlegen");
  assert.ok(html.includes(s.K.unH(s.E.foods.hafer, { amt: 100 })), "Zeichenfolge ist exakt die des gemeinsamen Helfers unH");
});

test("Suche: Stück-Lebensmittel ohne Gramm pro Stück bekommt dort keine Leiste (wie in der Tagesliste)", () => {
  const s = suche(), z = s.zeile("roggen");
  s.K.openSearch({ kind: "day", slot: "fr" });
  z.onclick({ target: { closest: q => q === ".ev" ? {} : null } });
  assert.ok(s.html().includes("eamtrow"), "Mengenfeld offen");
  assert.ok(!s.html().includes("data-un"));
});

/* Mahlzeiten-Ansicht (grpView → mealSheet): Tipp auf eine Zutat öffnet das Mengenfeld, dort muss dieselbe Leiste stehen */
function mahlzeit(eintraege) {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  E.days[k] = { e: eintraege };
  const doc = {};
  h.ctx.document.addEventListener = (t, fn) => { doc[t] = fn; };
  h.ctx.document.removeEventListener = () => {};
  const body = h.el("shBody"), zeilen = {};
  body.querySelectorAll = s => s === "[data-mi]" ? Object.values(zeilen) : [];
  const zeile = i => zeilen[i] = zeilen[i] || { dataset: { mi: String(i) }, l: {}, addEventListener(t, fn) { this.l[t] = fn; } };
  const tipp = r => { r.l.pointerdown({ button: 0, clientX: 0, clientY: 0, target: { closest: () => null } }); doc.pointerup({ target: { closest: () => null } }); };
  K.setDay(k);
  return { h, K, E, k, body, zeile, tipp, html: () => body.innerHTML };
}
const MUESLI = () => [
  { id: "m1", slot: "ab", food: "hafer", amt: 80, g: { id: "g1", name: "Müsli" } },
  { id: "m2", slot: "ab", food: "quark", amt: 250, g: { id: "g1", name: "Müsli" } },
];

test("Mahlzeiten-Ansicht: Tipp auf eine Zutat öffnet das Mengenfeld MIT Einheiten-Leiste (derselbe Helfer)", () => {
  const m = mahlzeit(MUESLI());
  m.E.foods.hafer.units = [{ t: "Schale", g: 45 }];
  const r = m.zeile(0);
  m.K.grpView("g1", true);
  assert.ok(!m.html().includes("data-un"), "zu: keine Leiste");
  m.tipp(r);
  assert.ok(m.html().includes('class="eamtrow in"'), "Mengenfeld offen");
  assert.ok(m.html().includes(m.K.unH(m.E.foods.hafer, { amt: 80 })), "exakt der gemeinsame Helfer");
  assert.ok(m.html().includes("Schale 45 g"));
});
