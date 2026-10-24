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

/* ---------- Aufgabe 2: Vielfaches der Menge ---------- */

test("scaleEntries: ×1,5 auf 100 g ergibt 150 g in EINEM Eintrag – nichts wird neu angelegt", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  E.days[k] = { e: [{ id: "x1", slot: "fr", food: "hafer", amt: 100 }] };
  const liste = E.days[k].e, en = liste[0];
  assert.equal(K.scaleEntries([en], 1.5), true);
  assert.equal(en.amt, 150);
  assert.equal(E.days[k].e.length, 1, "Zahl der Einträge unverändert");
  assert.equal(E.days[k].e, liste, "dieselbe Liste");
  assert.equal(E.days[k].e[0], en, "derselbe Eintrag");
  const s = gespeichert(h);
  assert.equal(s.days[k].e.length, 1);
  assert.equal(s.days[k].e[0].amt, 150, "im Speicher");
  assert.equal(s.days[k].e[0].id, "x1");
  assert.ok(!h.dump().essen_v1.includes("NaN"));
});

test("scaleEntries: ×2 auf Stück und Dezimalzahlen wird auf zwei Stellen gerundet, nie NaN, nie ≤ 0", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const a = { amt: 3 }, b = { amt: 33.33 }, c = { amt: 0.01 }, d = { amt: 1 };
  assert.ok(K.scaleEntries([a], 1.5) && a.amt === 4.5);
  assert.ok(K.scaleEntries([b], 1.5) && nah(b.amt, 50), "33,33 × 1,5 = 49,995 → 50");
  assert.ok(K.scaleEntries([c], 1.5) && c.amt > 0 && Number.isFinite(c.amt), "kleinste Menge bleibt > 0");
  assert.ok(K.scaleEntries([d], 2) && d.amt === 2);
});

test("scaleEntries: ungültiger Faktor oder ungültige Menge → false und NICHTS verändert (alles oder nichts)", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  for (const schlecht of [0, -2, NaN, Infinity, "abc", undefined, null]) {
    const e = { amt: 100 };
    assert.equal(K.scaleEntries([e], schlecht), false, String(schlecht));
    assert.equal(e.amt, 100);
  }
  assert.equal(K.scaleEntries([], 2), false, "leere Liste");
  assert.equal(K.scaleEntries(undefined, 2), false);
  const gut = { amt: 100 }, kaputt = { amt: NaN }, zuGross = { amt: 60000 };
  assert.equal(K.scaleEntries([gut, kaputt], 2), false);
  assert.equal(gut.amt, 100, "die gültige Zutat wird nicht allein umgerechnet");
  assert.equal(K.scaleEntries([gut, zuGross], 2), false, "über der Obergrenze → ganze Liste bleibt");
  assert.equal(gut.amt, 100);
  assert.equal(zuGross.amt, 60000);
});

/* Tagesliste: Tipp auf den Rest der Zeile öffnet die Nährwerte, dort die Knöpfe */
function tagesliste(eintraege) {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  E.days[k] = { e: eintraege };
  const doc = {}, reihen = {}, knoepfe = [];
  h.ctx.document.addEventListener = (t, fn) => { doc[t] = fn; };
  h.ctx.document.removeEventListener = () => {};
  const S2 = h.el("eSlots");
  S2.querySelectorAll = sel => sel === "[data-e],[data-gt]" ? Object.values(reihen) : sel === "[data-mul]" ? knoepfe : [];
  const reihe = ds => { const id = ds.e || ds.gt; return reihen[id] = reihen[id] || { dataset: ds, l: {}, addEventListener(t, fn) { this.l[t] = fn; } }; };
  const tipp = r => { r.l.pointerdown({ button: 0, clientX: 0, clientY: 0, target: { closest: () => null } }); doc.pointerup({ target: { closest: () => null } }); };
  /* die Knöpfe, die der Aufbau gerade erzeugt hat (der echte Code bindet sie per querySelectorAll → onclick) */
  const mul = f => { const b = { dataset: { mul: String(f) }, onclick: null }; knoepfe.length = 0; knoepfe.push(b); return b; };
  return { h, K, E, k, reihe, tipp, mul, html: () => S2.innerHTML };
}

test("Nährwerte-Panel der Zeile hat die Knöpfe ×1,5 und ×2; das Panel bleibt offen, die Zeilenzahl gleich", () => {
  const t = tagesliste([{ id: "x1", slot: "fr", food: "hafer", amt: 100 }, { id: "x2", slot: "fr", food: "quark", amt: 250 }]);
  const r = t.reihe({ e: "x1" });
  t.K.setDay(t.k);
  assert.ok(!t.html().includes("data-mul"), "zu: keine Knöpfe");
  t.tipp(r);
  const html = t.html();
  assert.ok(html.includes("enutrow") && html.includes('data-mul="1.5"') && html.includes('data-mul="2"'));
  assert.ok(html.includes("×1,5") && html.includes("×2"));
  // der echte Handler hängt sich per querySelectorAll an die Knöpfe: Knopf bereitstellen, Panel nochmal aufbauen lassen
  const b = t.mul(1.5);
  t.tipp(r); // zu
  t.tipp(r); // wieder auf: bindSlots läuft und bindet an den bereitgestellten Knopf
  b.onclick();
  const e = t.E.days[t.k].e;
  assert.equal(e.length, 2, "keine neue Zeile");
  assert.equal(e.find(x => x.id === "x1").amt, 150);
  assert.equal(e.find(x => x.id === "x2").amt, 250, "andere Zeile unberührt");
  assert.ok(t.html().includes("enutrow"), "Panel bleibt nach dem Umrechnen offen");
  assert.ok(t.html().includes(">150<") || t.html().includes("150 g"), "Anzeige zeigt die neue Menge");
  assert.ok(!t.h.dump().essen_v1.includes("NaN"));
});

test("Knopf an einer Zutat in der Tagesliste rechnet nur diese Zutat, die Mahlzeit behält ihre g.id", () => {
  const t = tagesliste([
    { id: "m1", slot: "ab", food: "hafer", amt: 80, g: { id: "g1", name: "Müsli" } },
    { id: "m2", slot: "ab", food: "quark", amt: 250, g: { id: "g1", name: "Müsli" } },
  ]);
  const r = t.reihe({ e: "m1" }), kopf = t.reihe({ gt: "g1" });
  t.K.setDay(t.k);
  t.tipp(kopf); // Gruppe auf, bindet die Zutaten-Ersatzzeilen
  t.tipp(r); // Nährwerte der Zutat
  const b = t.mul(2);
  t.tipp(r); t.tipp(r);
  b.onclick();
  const e = t.E.days[t.k].e;
  assert.equal(e.length, 2);
  assert.equal(e[0].amt, 160);
  assert.equal(e[1].amt, 250, "die andere Zutat bleibt");
  assert.ok(e.every(x => x.g.id === "g1"));
});

/* Mahlzeiten-Ansicht: Knopf rechnet ALLE Zutaten */
function mahlzeitMitKnopf(eintraege) {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  E.days[k] = { e: eintraege };
  h.ctx.document.addEventListener = () => {};
  h.ctx.document.removeEventListener = () => {};
  const body = h.el("shBody"), knoepfe = [];
  body.querySelectorAll = s => s === "[data-mul]" ? knoepfe : [];
  const knopf = f => { const b = { dataset: { mul: String(f) }, onclick: null }; knoepfe.length = 0; knoepfe.push(b); return b; };
  K.setDay(k);
  return { h, K, E, k, body, knopf, html: () => body.innerHTML };
}

test("Mahlzeit ×2: ALLE Zutaten werden hochgerechnet, g.id und Zahl der Einträge bleiben, nichts neu angelegt", () => {
  const m = mahlzeitMitKnopf(MUESLI());
  const vorher = m.E.days[m.k].e.slice();
  m.knopf(2);
  m.K.grpView("g1", true);
  assert.ok(m.html().includes('data-mul="2"'), "Knöpfe stehen in der Ansicht der Mahlzeit im Tag");
  const b = m.knopf(2);
  m.K.grpView("g1", true); // neu aufbauen, damit der echte Code an unseren Knopf bindet
  b.onclick();
  const e = m.E.days[m.k].e;
  assert.equal(e.length, 2, "keine zweite Mahlzeit, keine neuen Zeilen");
  assert.deepEqual(e.map(x => x.id), ["m1", "m2"]);
  assert.deepEqual(e.map(x => x.amt), [160, 500], "jede Zutat ×2");
  assert.ok(e.every((x, i) => x === vorher[i]), "dieselben Eintragsobjekte");
  assert.ok(e.every(x => x.g.id === "g1" && x.g.name === "Müsli"), "g.id und Name bleiben – es ist EINE Mahlzeit");
  const s = gespeichert(m.h);
  assert.deepEqual(s.days[m.k].e.map(x => x.amt), [160, 500], "im Speicher");
  assert.ok(!m.h.dump().essen_v1.includes("NaN"));
});

test("Mahlzeit ×1,5: eine Zutat wäre danach zu groß → nichts wird verändert (alle behalten ihre Mengen)", () => {
  const m = mahlzeitMitKnopf([
    { id: "m1", slot: "ab", food: "hafer", amt: 80, g: { id: "g1", name: "Müsli" } },
    { id: "m2", slot: "ab", food: "quark", amt: 90000, g: { id: "g1", name: "Müsli" } },
  ]);
  const b = m.knopf(1.5);
  m.K.grpView("g1", true);
  b.onclick();
  assert.deepEqual(m.E.days[m.k].e.map(x => x.amt), [80, 90000]);
});

test("Vorlage (tplSheet) bekommt KEINE Vielfachen-Knöpfe – ×2 würde das gespeicherte Rezept dauerhaft verdoppeln", () => {
  const m = mahlzeitMitKnopf([]);
  m.E.meals = { t1: { id: "t1", name: "Müsli", slot: "fr", items: [{ food: "hafer", amt: 80 }] } };
  m.K.tplSheet("t1");
  assert.ok(m.html().includes("emnut"), "Ansicht steht");
  assert.ok(!m.html().includes("data-mul"));
});
