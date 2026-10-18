/* Tests für das Mengen-Zahlenfeld in der Ernährung (18.10.2026): getippte Menge landet als Zahl im Speicher,
   ungültige Eingabe lässt den alten Wert stehen, nie NaN in essen_v1.
   Geprüft wird der echte Code aus essen.js (parseAmt, bindAmt, bindAmtObj über window.__essen) mit einem
   Mini-Ersatz für das Eingabefeld. Aussehen, Fokus/Tastatur und „nichts springt“ lassen sich nur am Gerät prüfen.
   Alle Fixtures sind erfunden. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

const OPT = { withEssenSpotify: true };

/* Mini-Eingabefeld: sammelt Zuhörer, feuert sie wie der Browser */
function feld(wert) {
  const f = { value: wert, on: {}, blurs: 0,
    addEventListener(t, fn) { (f.on[t] = f.on[t] || []).push(fn); },
    fire(t, e) { (f.on[t] || []).forEach(fn => fn(e || {})); },
    blur() { f.blurs++; f.fire("blur"); } };
  return f;
}
const tippe = (f, text) => { f.value = text; f.fire("input"); };
const gespeichert = h => JSON.parse(h.dump().essen_v1);

function eintrag(h, amt) {
  const E = h.ctx.__essen.E();
  E.days["2026-01-01"] = { e: [{ id: "x1", slot: "fr", food: "hafer", amt }] };
  return E.days["2026-01-01"].e[0];
}

test("parseAmt: Komma und Punkt, gerundet; leer, Text, 0, negativ und riesig → null", () => {
  const h = loadApp({}, OPT), p = h.ctx.__essen.parseAmt;
  assert.equal(p("150"), 150);
  assert.equal(p("12,5"), 12.5);
  assert.equal(p(" 7.25 "), 7.25);
  assert.equal(p("3.456"), 3.46);
  for (const schlecht of ["", " ", "abc", "12abc", "0", "-3", "1e9", "NaN", "Infinity", null, undefined]) {
    assert.equal(p(schlecht), null, "sollte abgelehnt werden: " + String(schlecht));
  }
});

test("getippte Menge landet als Zahl im Speicher (live, ohne Verlassen des Feldes)", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const en = eintrag(h, 80), f = feld("80");
  let rufe = 0;
  K.bindAmtObj(f, en, () => { rufe++; });
  tippe(f, "180");
  assert.equal(en.amt, 180);
  assert.equal(typeof en.amt, "number");
  assert.equal(rufe, 1);
  assert.equal(gespeichert(h).days["2026-01-01"].e[0].amt, 180);
  tippe(f, "12,5");
  assert.equal(gespeichert(h).days["2026-01-01"].e[0].amt, 12.5);
});

test("ungültige Eingabe: alter Wert bleibt, Feld springt beim Verlassen zurück, kein NaN im Speicher", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const en = eintrag(h, 80), f = feld("80");
  K.bindAmtObj(f, en, () => {});
  tippe(f, "90"); // erst ein gültiger Wert, damit etwas im Speicher liegt
  assert.equal(gespeichert(h).days["2026-01-01"].e[0].amt, 90);
  for (const schlecht of ["", "abc", "0", "-5", "1e9"]) {
    tippe(f, schlecht);
    assert.equal(en.amt, 90, "Wert geändert durch: " + schlecht);
    f.fire("change");
    assert.equal(f.value, "90", "Feld nicht zurückgesprungen nach: " + schlecht);
  }
  const roh = h.dump().essen_v1 || "";
  assert.ok(!/NaN|null,"amt"/.test(roh));
  assert.equal(JSON.stringify(gespeichert(h)).includes("NaN"), false);
  assert.equal(gespeichert(h).days["2026-01-01"].e[0].amt, 90);
});

test("gültig getippt, dann Verlassen: Wert bleibt, Feld zeigt den gespeicherten Wert; Enter verlässt das Feld", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const en = eintrag(h, 80), f = feld("80");
  K.bindAmtObj(f, en, () => {});
  tippe(f, "3.456");
  f.fire("change");
  assert.equal(en.amt, 3.46);
  assert.equal(f.value, "3.46"); // beim Verlassen zeigt das Feld den gespeicherten, gerundeten Wert
  let verhindert = false;
  f.fire("keydown", { key: "Enter", preventDefault() { verhindert = true; } });
  assert.equal(verhindert, true);
  assert.equal(f.blurs, 1);
  assert.equal(en.amt, 3.46);
});

test("bindAmt ohne Feld wirft nicht", () => {
  const h = loadApp({}, OPT);
  assert.doesNotThrow(() => h.ctx.__essen.bindAmt(null, () => 1, () => {}));
  assert.doesNotThrow(() => h.ctx.__essen.bindAmtObj(null, { amt: 1 }, () => {}));
});
