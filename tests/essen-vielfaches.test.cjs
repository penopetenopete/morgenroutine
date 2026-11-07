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
const gestern = () => { const d = new Date(Date.now() - 864e5); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
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

/* V60 (24.10.2026): umgeschrieben. Vorher prüften die zwei Fälle, dass das Nährwerte-Panel einer EINZELNEN Zeile die Knöpfe ×1,5 / ×2
   hat und sie umrechnen. Der Nutzer wollte das „gar nicht so sehr bei Zutaten, sondern bei Mahlzeiten“ – am Einzel-Eintrag sind die Knöpfe
   wieder weg. Geprüft wird jetzt das Gegenteil (keine Knöpfe, auch kein Handler) und dass das Öffnen des Panels nichts verändert;
   scaleEntries selbst und die Mahlzeiten-Knöpfe behalten ihre Fälle weiter unten unverändert. */
test("Nährwerte-Panel einer einzelnen Zeile hat KEINE Vielfach-Knöpfe mehr; Öffnen und Schließen ändert keine Menge", () => {
  const t = tagesliste([{ id: "x1", slot: "fr", food: "hafer", amt: 100 }, { id: "x2", slot: "fr", food: "quark", amt: 250 }]);
  const r = t.reihe({ e: "x1" });
  t.K.setDay(t.k);
  assert.ok(!t.html().includes("data-mul"), "zu: keine Knöpfe");
  t.tipp(r);
  const html = t.html();
  assert.ok(html.includes("enutrow"), "Panel offen");
  assert.ok(!html.includes("data-mul") && !html.includes("emul") && !html.includes("×1,5") && !html.includes("×2"), "keine Vielfach-Knöpfe am Einzel-Eintrag");
  const b = t.mul(1.5); // selbst wenn ein Knopf da wäre: kein Handler hängt mehr an ihm
  t.tipp(r); t.tipp(r);
  assert.equal(b.onclick, null, "bindSlots bindet keinen Vielfach-Handler mehr an eine einzelne Zeile");
  const e = t.E.days[t.k].e;
  assert.equal(e.length, 2);
  assert.equal(e.find(x => x.id === "x1").amt, 100);
  assert.equal(e.find(x => x.id === "x2").amt, 250);
  assert.ok(!t.h.dump().essen_v1.includes("NaN"));
});

test("Zutat einer Mahlzeit in der Tagesliste: Panel ohne Vielfach-Knöpfe, Mengen und g.id bleiben beim Öffnen unberührt", () => {
  const t = tagesliste([
    { id: "m1", slot: "ab", food: "hafer", amt: 80, g: { id: "g1", name: "Müsli" } },
    { id: "m2", slot: "ab", food: "quark", amt: 250, g: { id: "g1", name: "Müsli" } },
  ]);
  const r = t.reihe({ e: "m1" }), kopf = t.reihe({ gt: "g1" });
  t.K.setDay(t.k);
  t.tipp(kopf); // Gruppe auf, bindet die Zutaten-Ersatzzeilen
  t.tipp(r); // Nährwerte der Zutat
  assert.ok(t.html().includes("enutrow") && !t.html().includes("data-mul"));
  const b = t.mul(2);
  t.tipp(r); t.tipp(r);
  assert.equal(b.onclick, null);
  const e = t.E.days[t.k].e;
  assert.equal(e.length, 2);
  assert.equal(e[0].amt, 80);
  assert.equal(e[1].amt, 250);
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

/* ---------- Aufgabe 3: „Nochmal“ in der Auswahl-Leiste ---------- */

/* Auswahl-Leiste: renderSelBar läuft über renderEssen; die Knöpfe holt der echte Code per querySelectorAll("[data-sb]") */
function auswahl(eintraege, ausgewaehlt) {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  E.days[k] = { e: eintraege };
  h.ctx.document.addEventListener = () => {};
  h.ctx.document.removeEventListener = () => {};
  const bar = h.el("eSelBar"), tasten = {};
  bar.querySelectorAll = s => s === "[data-sb]" ? ["x", "prev", "cal", "again", "next", "del"].map(a => tasten[a] = tasten[a] || { dataset: { sb: a }, onclick: null }) : [];
  ausgewaehlt.forEach(id => K.sel().add(id));
  K.setDay(k);
  return { h, K, E, k, bar, tasten, tag: () => E.days[k].e };
}
const PIZZA2 = () => [
  { id: "a1", slot: "ab", food: "hafer", amt: 80, g: { id: "gp", name: "Pizza", tpl: "t9" } },
  { id: "a2", slot: "ab", food: "quark", amt: 250, g: { id: "gp", name: "Pizza", tpl: "t9" } },
  { id: "b1", slot: "ab", food: "ei", amt: 2, u: "stk" },
];

/* V60 (24.10.2026): Reihenfolge umgeschrieben. Vorher gestern · Kalender · Nochmal · morgen · Löschen; der Umbruch auf schmalen Handys
   sah damit unsymmetrisch aus. Jetzt gestern · Kalender · morgen | Nochmal · Löschen – oben die Tage, unten die zwei Aktionen. */
test("Auswahl-Leiste: oben gestern · Kalender · morgen, unten Nochmal · Löschen (Löschen bleibt der letzte Knopf)", () => {
  const a = auswahl(PIZZA2(), ["b1"]);
  const html = a.bar.innerHTML;
  const reihenfolge = [...html.matchAll(/data-sb="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(reihenfolge, ["x", "prev", "cal", "next", "again", "del"]);
  assert.ok(html.includes("Nochmal"));
});

test("Nochmal: legt die Auswahl ein zweites Mal im SELBEN Tag an, Auswahl wird geleert, Original unberührt", () => {
  const a = auswahl(PIZZA2(), ["b1"]);
  const orig = a.tag().find(x => x.id === "b1");
  a.tasten.again.onclick();
  const e = a.tag();
  assert.equal(e.length, 4, "ein Eintrag mehr");
  const kopien = e.filter(x => x.food === "ei");
  assert.equal(kopien.length, 2);
  assert.equal(kopien[0], orig, "Original bleibt wie es war");
  assert.notEqual(kopien[1].id, orig.id, "neue Eintrags-ID");
  assert.equal(kopien[1].amt, 2); assert.equal(kopien[1].u, "stk"); assert.equal(kopien[1].slot, "ab");
  assert.equal(a.K.sel().size, 0, "Auswahl geleert");
  assert.equal(e.indexOf(kopien[1]), e.indexOf(orig) + 1, "direkt hinter dem Original");
  assert.ok(!a.h.dump().essen_v1.includes("NaN"));
  assert.equal(gespeichert(a.h).days[a.k].e.length, 4, "im Speicher");
});

test("Nochmal auf eine Mahlzeit: die Kopie bekommt eine NEUE g.id – zwei Pizzen verschmelzen nicht", () => {
  const a = auswahl(PIZZA2(), ["a1", "a2"]);
  a.tasten.again.onclick();
  const e = a.tag();
  assert.equal(e.length, 5, "zwei Zutaten dazu");
  const ids = new Set(e.filter(x => x.g).map(x => x.g.id));
  assert.equal(ids.size, 2, "zwei verschiedene Mahlzeiten");
  assert.ok(ids.has("gp"), "die alte bleibt");
  const alt = e.filter(x => x.g && x.g.id === "gp"), neu = e.filter(x => x.g && x.g.id !== "gp");
  assert.equal(alt.length, 2, "alte Mahlzeit hat weiter genau ihre zwei Zutaten");
  assert.equal(neu.length, 2, "neue Mahlzeit hat die zwei kopierten Zutaten");
  assert.equal(neu[0].g.id, neu[1].g.id, "beide Kopien in EINER neuen Mahlzeit");
  assert.equal(neu[0].g.name, "Pizza"); assert.equal(neu[0].g.tpl, "t9");
  assert.deepEqual(neu.map(x => x.amt), [80, 250]);
  assert.deepEqual(neu.map(x => x.food), ["hafer", "quark"]);
  assert.ok(neu.every(x => !alt.includes(x) && !alt.some(y => y.id === x.id)), "keine geteilten Objekte oder IDs");
  assert.ok(alt.every(x => x.g.id === "gp"), "Originale unverändert");
});

test("Nochmal ohne gültige Auswahl tut nichts (kein leeres Duplikat)", () => {
  const a = auswahl(PIZZA2(), ["b1"]);
  a.K.sel().clear(); a.K.sel().add("gibt-es-nicht");
  a.tasten.again.onclick();
  assert.equal(a.tag().length, 3);
});

test("Pfeil › kopiert weiter in den Folgetag (heute unverändert) – der alte Weg ist durch Nochmal nicht gebrochen", () => {
  const a = auswahl(PIZZA2(), ["b1"]);
  a.tasten.next.onclick();
  assert.equal(a.tag().length, 3, "heute unverändert");
  const d = new Date(); d.setDate(d.getDate() + 1);
  const morgen = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  assert.equal(a.E.days[morgen].e.length, 1, "Kopie liegt morgen");
});

/* ---------- Vielfaches als Faktor am Eintrag (05.11.2026) ----------
   n = Faktor, b = Menge bei Faktor 1. Alte Einträge ohne beides zählen als 1× mit der eingetragenen Menge als Basis. */

test("Faktor: 0,5 halbiert die Menge, 2 verdoppelt sie – immer von der Basis aus, nicht vom letzten Wert", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const e = { id: "x1", amt: 80 };
  assert.equal(K.facN(e), 1, "ohne n gilt 1×");
  assert.equal(K.facB(e), 80, "ohne b ist die Menge selbst die Basis");
  assert.ok(K.setFac([e], 0.5));
  assert.equal(e.amt, 40);
  assert.equal(e.n, 0.5);
  assert.equal(e.b, 80, "die Basis bleibt stehen");
  assert.ok(K.setFac([e], 2), "jetzt ×2 – von der Basis, nicht von den 40 g");
  assert.equal(e.amt, 160);
  assert.ok(K.setFac([e], 0.25) && e.amt === 20);
});

test("Faktor: Komma statt Punkt wird genommen, Grenzen und Unsinn nicht", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  assert.equal(K.parseFac("0,5"), 0.5);
  assert.equal(K.parseFac(" 1.25 "), 1.25);
  for (const schlecht of [0, -1, 100, NaN, Infinity, "abc", "", undefined, null]) {
    assert.equal(K.parseFac(schlecht), null, String(schlecht));
    const e = { amt: 100 };
    assert.equal(K.setFac([e], schlecht), false);
    assert.equal(e.amt, 100, "nichts verändert");
  }
});

test("Faktor auf einer Mahlzeit: alle Zutaten rechnen mit, der Faktor steht an der Gruppe", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const g = { id: "g1", name: "Lasagne" };
  const l = [{ id: "a", amt: 300, g }, { id: "b", amt: 150, g }, { id: "c", amt: 60, g }];
  assert.ok(K.setFac(l, 1 / 3 > 0 ? 0.33 : 1));
  assert.equal(l[0].amt, 99);
  assert.equal(l[1].amt, 49.5);
  assert.equal(l[2].amt, 19.8);
  assert.equal(g.n, 0.33, "die Gruppe merkt sich den Faktor");
  assert.ok(l.every(x => x.n === 0.33));
  assert.ok(K.setFac(l, 1), "zurück auf 1× ergibt wieder die Ausgangsmengen");
  assert.deepEqual(l.map(x => x.amt), [300, 150, 60]);
});

test("Faktor auf einer Mahlzeit: wäre eine Zutat danach ungültig, bleibt die ganze Mahlzeit unverändert", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const g = { id: "g2", name: "Groß" };
  const l = [{ id: "a", amt: 100, g }, { id: "b", amt: 60000, g }];
  assert.equal(K.setFac(l, 2), false);
  assert.equal(l[0].amt, 100, "die gültige Zutat wird nicht allein umgerechnet");
  assert.equal(l[1].amt, 60000);
  assert.ok(!("n" in g), "die Gruppe merkt sich nichts");
});

test("Menge von Hand eingetippt: der Faktor geht auf 1 zurück und die neue Menge ist die Basis", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const e = { id: "x2", amt: 80 };
  K.setFac([e], 2);
  assert.equal(e.amt, 160);
  e.amt = 95;              // so, wie das Gramm-Feld es setzt
  K.facReset(e);
  assert.equal(e.n, 1);
  assert.equal(e.b, 95);
  assert.ok(K.setFac([e], 2) && e.amt === 190, "ab jetzt zählt die neue Basis");
});

/* ---------- Diktierte Mahlzeit einfügen (05.11.2026) ----------
   Ein Skill in der Claude-App liefert reinen JSON-Text; die App nimmt ihn genauso an wie den gepackten Link. */

test("Einfügen: reiner JSON-Text wird angenommen, auch in einem Codeblock", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const txt = '{"v":1,"meals":[{"name":"Lasagne","items":[]}]}';
  assert.equal((await K.readE(txt)).meals[0].name, "Lasagne");
  assert.equal((await K.readE("```json\n" + txt + "\n```")).meals[0].name, "Lasagne", "Fences fallen weg");
  assert.equal((await K.readE("  ```\n" + txt + "\n```  ")).v, 1);
  await assert.rejects(() => K.readE("{kein json"), /nicht lesbar/);
  await assert.rejects(() => K.readE("irgendein Text"), /Kein Ernährungs-Link/);
});

test("Einfügen: add mit n trägt die Mahlzeit mit dem Vielfachen ein, die volle Menge bleibt die Basis", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  const p = {
    v: 1,
    foods: [{ name: "Hack", kcal: 250, p: 17, c: 0, f: 20 }, { name: "Platten", kcal: 350, p: 12, c: 70, f: 2 }],
    add: [{ date: k, slot: "mi", name: "Lasagne", n: 0.33, items: [{ food: "Hack", amt: 500 }, { food: "Platten", amt: 250 }] }]
  };
  K.applyImport(await K.prepImport(p));
  const e = E.days[k].e;
  assert.equal(e.length, 2);
  assert.equal(e[0].b, 500, "die gelieferte Menge ist die Basis");
  assert.equal(e[0].amt, 165, "500 × 0,33");
  assert.equal(e[1].amt, 82.5);
  assert.ok(e.every(x => x.n === 0.33));
  assert.equal(e[0].g.n, 0.33, "die Mahlzeit merkt sich das Vielfache");
  assert.ok(K.setFac(e, 1) && e[0].amt === 500, "ein Tipp zurück auf die ganze Portion");
});

test("Einfügen: fehlendes oder unsinniges n ändert nichts an der Menge", async () => {
  for (const n of [undefined, 0, -1, "abc", 1000]) {
    const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
    const p = { v: 1, foods: [{ name: "Hack", kcal: 250, p: 17, c: 0, f: 20 }], add: [{ date: k, slot: "mi", n, items: [{ food: "Hack", amt: 500 }] }] };
    K.applyImport(await K.prepImport(p));
    assert.equal(E.days[k].e[0].amt, 500, String(n));
  }
});

test("Skill-Beispiel aus .claude/skills/essen/SKILL.md läuft durch die App", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  /* genau der Block, den der Skill für „Lasagne gekocht, ein Drittel gegessen“ ausgibt */
  const txt = '```json\n' + JSON.stringify({
    v: 1,
    foods: [
      { name: "Rinderhack", base: "g", kcal: 250, p: 17, c: 0, f: 20, fib: 0 },
      { name: "Nudelplatten", base: "g", kcal: 350, p: 12, c: 70, f: 2, fib: 3 },
      { name: "Tomaten passiert", base: "g", kcal: 35, p: 1.5, c: 6, f: 0.2, fib: 1.5 },
      { name: "Gouda", base: "g", kcal: 356, p: 25, c: 0, f: 28, fib: 0 }
    ],
    meals: [{ name: "Lasagne", slot: "mi", items: [
      { food: "Rinderhack", amt: 500 }, { food: "Nudelplatten", amt: 250 },
      { food: "Tomaten passiert", amt: 400 }, { food: "Gouda", amt: 200 }] }],
    add: [{ slot: "mi", meal: "Lasagne", n: 0.33 }]
  }) + '\n```';
  const c = await K.prepImport(await K.readE(txt));
  assert.equal(c.warn.length, 0, "keine unbekannten Zutaten");
  K.applyImport(c);
  const vorlage = Object.values(E.meals).find(m => m.name === "Lasagne");
  assert.ok(vorlage, "die Vorlage liegt im Repertoire");
  assert.equal(vorlage.items.length, 4);
  assert.equal(vorlage.items[0].amt, 500, "die Vorlage behält die ganze Portion");
  const e = E.days[k].e;
  assert.equal(e.length, 4);
  assert.equal(e[0].amt, 165, "im Tag steht ein Drittel");
  assert.ok(e.every(x => x.n === 0.33 && x.g && x.g.name === "Lasagne"));
  assert.ok(K.nut(E.foods[e[0].food], e[0].amt, e[0].u).kcal > 0, "Nährwerte rechnen");
});

/* ---------- Einfügen dort, wo man gerade ist (05.11.2026) ---------- */

const block = () => ({
  v: 1,
  foods: [{ name: "Hack", kcal: 250, p: 17, c: 0, f: 20 }],
  meals: [{ name: "Bolo", slot: "ab", items: [{ food: "Hack", amt: 400 }] }],
  add: [{ date: "2026-01-02", slot: "ab", meal: "Bolo" }],
  acts: [{ name: "Tennis", kcal: 300 }]
});

test("Einfügen aus einem Tagesabschnitt: Abschnitt und Tag von dort gewinnen über das, was im Text steht", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  const p = K.pasteCtx(block(), { slot: "fr", date: k });
  K.applyImport(await K.prepImport(p));
  assert.ok(!E.days["2026-01-02"], "nicht am Tag aus dem Text");
  assert.equal(E.days[k].e[0].slot, "fr", "sondern im Frühstück von heute");
});

test("Einfügen in die Vorlagen: nur Lebensmittel und Vorlage, nichts ins Tagebuch", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  const vorher = JSON.stringify(E.days);
  K.applyImport(await K.prepImport(K.pasteCtx(block(), { onlyMeals: true })));
  assert.ok(Object.values(E.meals).some(m => m.name === "Bolo"), "die Vorlage ist da");
  assert.ok(Object.values(E.foods).some(f => f.name === "Hack"), "das Lebensmittel auch");
  assert.equal(JSON.stringify(E.days), vorher, "am Tagebuch ändert sich nichts");
});

test("Einfügen in die Lebensmittel: nur das Lebensmittel, keine Vorlage", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  const vorherM = Object.keys(E.meals).length, vorherT = JSON.stringify(E.days);
  K.applyImport(await K.prepImport(K.pasteCtx(block(), { onlyFoods: true })));
  assert.ok(Object.values(E.foods).some(f => f.name === "Hack"));
  assert.equal(Object.keys(E.meals).length, vorherM, "keine neue Vorlage");
  assert.equal(JSON.stringify(E.days), vorherT);
});

test("Einfügen ohne Kontext bleibt, wie es war", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  const p = block();
  assert.equal(K.pasteCtx(p, null), p, "ohne Kontext unverändert durchgereicht");
  K.applyImport(await K.prepImport(p));
  assert.ok(E.days["2026-01-02"], "der Tag aus dem Text zählt");
});

test("Direkt einfügen: Abschnitt aus der Uhrzeit, wenn der Text keinen nennt – und Rückgängig stellt alles her", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  h.ctx.scrollTo = () => {};
  h.ctx.history.pushState = () => {};
  const vorher = JSON.stringify(E.days);
  const p = K.pasteCtx({ v: 1, foods: [{ name: "Hack", kcal: 250, p: 17, c: 0, f: 20 }], add: [{ items: [{ food: "Hack", amt: 200 }] }] }, { auto: true });
  assert.equal(p.add[0].slot, K.slotNow(), "der Abschnitt kommt aus der Uhrzeit");
  assert.equal(p.add[0].date, k, "und der Tag ist der angezeigte");
  assert.ok(await K.pasteGo(p));
  assert.equal(E.days[k].e.length, 1);
  K.undo();
  assert.equal(JSON.stringify(E.days), vorher, "nach Rückgängig wie vorher");
});

test("Direkt einfügen: nennt der Text selbst einen Abschnitt, gewinnt der Text", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const p = K.pasteCtx({ v: 1, add: [{ slot: "fr", items: [] }] }, { auto: true });
  assert.equal(p.add[0].slot, "fr");
});

test("Einfügen: nur was nach einem Block aussieht, wird überhaupt angefasst", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  assert.equal(K.pasteLike('{"v":1}'), true);
  assert.equal(K.pasteLike('```json\n{"v":1}\n```'), true);
  assert.equal(K.pasteLike("https://x.de/#e=AbC"), true);
  assert.equal(K.pasteLike("Einkaufszettel: Milch, Brot"), false);
  assert.equal(K.pasteLike(""), false);
  assert.equal(K.pasteLike(null), false);
});

test("Einfügen: ein zweiter Tipp öffnet kein zweites Fenster", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  let auf = 0;
  const echt = h.ctx.__app ? null : null;
  h.el("scrim").hidden = true;
  const offen = () => !h.el("scrim").hidden;
  await K.paste({ sofort: true });
  assert.equal(offen(), true, "das Fenster steht offen");
  const inhalt = h.el("shBody").innerHTML;
  await K.paste({ sofort: true });
  assert.equal(h.el("shBody").innerHTML, inhalt, "der zweite Tipp baut nichts neu auf");
});

/* ---------- Braten: Öl mit einem Tipp (07.11.2026) ---------- */

test("Braten: ein Tipp legt 10 g Öl im richtigen Abschnitt an", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, k = heute();
  const ne = K.bratAdd("oil_oliv", "mi");
  assert.ok(ne, "der Eintrag entsteht");
  assert.equal(ne.slot, "mi");
  assert.equal(ne.amt, 10);
  const d = K.E().days[k];
  assert.equal(d.e.filter(x => x.food === "oil_oliv").length, 1);
  const f = K.E().foods.oil_oliv;
  assert.ok(f, "das Lebensmittel wird dabei angelegt");
  assert.equal(f.base, "g");
  assert.ok(f.kcal > 800 && f.kcal < 920, "Öl hat ~880 kcal pro 100 g");
  assert.ok(f.f > 95, "fast reines Fett");
  assert.ok(nah(K.nut(f, 10).kcal, f.kcal / 10), "10 g sind ein Zehntel der 100-g-Werte");
});

test("Braten: beide Öle, und die Werte landen in der Tagessumme", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, k = heute();
  assert.equal(K.BRAT.map(f => f.id).join(","), "oil_oliv,oil_sonne");
  K.BRAT.forEach(f => assert.equal(f.def, 10, f.name + " steht auf 10 g"));
  K.bratAdd("oil_oliv", "mi");
  K.bratAdd("oil_sonne", "ab");
  const d = K.E().days[k];
  assert.equal(d.e.length, 2);
  assert.equal(d.e.map(x => x.slot).join(","), "mi,ab");
  const kcal = d.e.reduce((a, x) => a + K.nut(K.E().foods[x.food], x.amt, x.u).kcal, 0);
  assert.ok(kcal > 170 && kcal < 180, "zwei mal 10 g Öl sind ~177 kcal, war " + kcal);
});

test("Braten: der Abschnitt richtet sich nach der Uhrzeit", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
    assert.equal(K.bratAdd("quark"), null, "fremde Kennung legt nichts an");
  assert.equal(K.E().days[heute()], undefined);
  assert.ok(["mi", "ab", "sn"].includes(K.bratSlot()), "der Abschnitt richtet sich nach der Uhrzeit, nie Frühstück");
});

test("Braten: Rückgängig nimmt genau diesen Eintrag zurück", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, k = heute();
  K.bratAdd("oil_oliv", "mi");
  K.bratAdd("oil_oliv", "ab");
  assert.equal(K.E().days[k].e.length, 2);
  K.undo();
  const rest = K.E().days[k].e;
  assert.equal(rest.length, 1, "nur der zuletzt angelegte fällt weg");
  assert.equal(rest[0].slot, "mi");
});

test("Braten: ein zweiter Tipp legt einen zweiten Eintrag an (nicht 20 g)", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, k = heute();
  K.bratAdd("oil_sonne", "ab");
  K.bratAdd("oil_sonne", "ab");
  const l = K.E().days[k].e;
  assert.equal(l.length, 2);
  l.forEach(x => assert.equal(x.amt, 10));
});

test("Braten: die Knöpfe stehen in der Tagesansicht bei Mittag und Abend", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  h.ctx.renderEssen();
  const htm = h.el("eSlots").innerHTML;
  assert.equal((htm.match(/data-brat=/g) || []).length, 2, "die beiden Öle stehen genau einmal da");
  assert.ok(htm.includes('data-brat="oil_oliv"') && htm.includes('data-brat="oil_sonne"'));
  assert.ok(htm.indexOf("ebrats") < htm.indexOf("dPaste"), "über dem Einfügen-Knopf");
  assert.ok(htm.includes("Olivenöl") && htm.includes("Sonnenblumenöl"));
});

/* ---------- Tagesansicht ruhiger (07.11.2026) ---------- */

test("Vorschläge: jeder Abschnitt zeigt seine zugeordneten Vorlagen und „wie gestern“", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute(), g = gestern();
  Object.keys(E.meals).forEach(id => delete E.meals[id]);
  E.meals.m1 = { id: "m1", name: "Mein Frühstück", slot: "fr", items: [{ food: "quark", amt: 250 }] };
  E.meals.m2 = { id: "m2", name: "Pizza", slots: ["mi", "ab"], items: [{ food: "quark", amt: 100 }] };
  E.meals.m3 = { id: "m3", name: "Ungenutzt", items: [{ food: "quark", amt: 50 }] };
  E.days[g] = { e: [{ id: "a", slot: "fr", food: "quark", amt: 100 }], acts: [] };
  const lab = sl => K.suggestions(sl, k).map(x => x.label).join(" | ");
  assert.equal(lab("fr"), "Mein Frühstück | wie gestern", "alter Einzelwert gilt weiter");
  assert.equal(lab("mi"), "Pizza", "gestern gab es mittags nichts");
  assert.equal(lab("ab"), "Pizza", "dieselbe Vorlage darf in zwei Abschnitten stehen");
  assert.equal(lab("sn"), "", "ohne Zuordnung wird nichts vorgeschlagen");
});

test("Vorlagen: Abschnitte an- und abwählen, tpl.slot bleibt als Rückfall erhalten", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  E.meals.m1 = { id: "m1", name: "Pizza", slot: "fr", items: [] };
  const m = E.meals.m1;
  assert.equal(K.tplSlots(m).join(","), "fr", "der alte Einzelwert zählt als Zuordnung");
  K.tplSlotSet(m, "fr");
  assert.equal(K.tplSlots(m).length, 0, "nochmal tippen nimmt sie weg");
  assert.equal(m.slot, undefined);
  K.tplSlotSet(m, "ab");
  K.tplSlotSet(m, "mi");
  assert.equal(K.tplSlots(m).join(","), "mi,ab", "Reihenfolge wie im Tag, nicht wie angetippt");
  assert.equal(m.slot, "mi", "slot zeigt auf den ersten – ältere Stände lesen das");
  assert.equal(K.tplSlotSet(m, "xx").join(","), "mi,ab", "unbekannter Abschnitt ändert nichts");
  assert.equal(JSON.parse(h.dump().essen_v1).meals.m1.slots.join(","), "mi,ab", "gespeichert");
});

test("Vorlagen-Liste: nach Abschnitt geordnet, ohne Erklärtext", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  Object.keys(E.meals).forEach(id => delete E.meals[id]);
  E.meals.m1 = { id: "m1", name: "Mein Frühstück", slots: ["fr"], items: [] };
  E.meals.m2 = { id: "m2", name: "Pizza", slots: ["mi", "ab"], items: [] };
  E.meals.m3 = { id: "m3", name: "Irgendwas", items: [] };
  K.tplList();
  const htm = h.el("shBody").innerHTML;
  assert.ok(!htm.includes('class="note"'), "der Erklärtext ist weg");
  assert.ok(htm.includes("Ohne Abschnitt"), "Unzugeordnete stehen am Ende");
  assert.equal((htm.match(/data-tl="m2"/g) || []).length, 2, "Pizza steht unter Mittag und Abend");
  assert.ok(htm.indexOf("Frühstück") < htm.indexOf("Ohne Abschnitt"));
  assert.ok(htm.indexOf('data-tl="m1"') < htm.indexOf('data-tl="m3"'));
});

test("Tagesansicht: keine Kalorienzahl mehr an der Abschnitts-Überschrift", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, k = heute();
  K.bratAdd("oil_oliv", "mi");
  h.ctx.renderEssen();
  const htm = h.el("eSlots").innerHTML;
  assert.ok(!htm.includes('class="esk"'), "der Kopf trägt keine Summe mehr");
  assert.ok(h.el("eSum").innerHTML.includes("kcal"), "die Tagessumme oben bleibt");
});

test("Auffüllen: die Animation läuft nur beim Betreten, nicht bei jeder Änderung", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  let n = 0;
  h.ctx.requestAnimationFrame = fn => { n++; return n };
  h.ctx.cancelAnimationFrame = () => {};
  h.ctx.renderEssen();
  assert.equal(n, 0, "ein gewöhnlicher Aufbau animiert nicht");
  h.ctx.renderEssen(true);
  assert.ok(n > 0, "beim Betreten fängt sie an");
});
