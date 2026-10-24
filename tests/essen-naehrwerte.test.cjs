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

/* ---------- Eigene Einheiten am Lebensmittel ---------- */
const eigen = (K, extra) => { const f = Object.assign({ id: "own:t1", name: "Testbrot", brand: "", base: "g", src: "own", kcal: 250, p: 8, c: 45, f: 2, fib: 4 }, extra || {}); K.E().foods[f.id] = f; return f; };
const json = x => JSON.stringify(x);

test("units anlegen: Gramm Pflicht, Text optional, Komma erlaubt, Reihenfolge = Anlegereihenfolge, im Speicher", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K);
  assert.equal(f.units, undefined, "ohne Anlegen gibt es das Feld nicht");
  for (const schlecht of ["", " ", "abc", "0", "-5", "1e9", null, undefined]) assert.equal(K.unitAdd(f, "Scheibe", schlecht), null, "abgelehnt: " + String(schlecht));
  assert.equal(f.units, undefined, "abgelehnte Eingaben hinterlassen nichts");
  assert.equal(json(K.unitAdd(f, "  Scheibe ", "30")), json({ t: "Scheibe", g: 30 }));
  assert.equal(json(K.unitAdd(f, "", "50")), json({ g: 50 }), "ohne Text: kein t-Schlüssel");
  assert.equal(json(K.unitAdd(f, null, "12,5")), json({ g: 12.5 }));
  assert.equal(json(f.units), json([{ t: "Scheibe", g: 30 }, { g: 50 }, { g: 12.5 }]));
  assert.equal(json(gespeichert(h).foods["own:t1"].units), json(f.units), "steht in essen_v1");
  assert.equal(K.unitAdd(f, "x".repeat(40), "10").t.length, 14, "Text gekürzt");
});

test("units: höchstens 12", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K);
  for (let i = 1; i <= 12; i++) assert.ok(K.unitAdd(f, "", String(i * 10)), "Nr. " + i);
  assert.equal(K.unitAdd(f, "", "5"), null, "13. wird abgelehnt");
  assert.equal(f.units.length, 12);
  assert.equal(K.unitsUsable(f, { amt: 1 }), true);
  assert.ok(!K.unH(f, { amt: 1 }).includes("data-uadd"), "bei 12 kein ＋ mehr");
});

test("units löschen: ein Eintrag weg, der letzte nimmt das Feld ganz mit (fehlt = keine); Rückgängig stellt her", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K);
  K.unitAdd(f, "a", "10"); K.unitAdd(f, "b", "20");
  const war = f.units.slice();
  assert.equal(json(K.unitDel(f, 0)), json({ t: "a", g: 10 }));
  assert.equal(json(f.units), json([{ t: "b", g: 20 }]));
  K.unitDel(f, 0);
  assert.ok(!("units" in f), "Feld ganz weg");
  assert.ok(!("units" in gespeichert(h).foods["own:t1"]));
  assert.equal(K.unitDel(f, 0), null, "nichts zu löschen → null, kein Wurf");
  K.unitSet(f, war);
  assert.equal(json(gespeichert(h).foods["own:t1"].units), json(war));
});

test("Gegenprobe: ohne units nur das ＋, Lebensmittel bleibt unverändert", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K), vorher = json(f);
  const html = K.unH(f, { amt: 100 });
  assert.ok(html.includes("data-uadd"));
  assert.ok(!html.includes("data-ui="), "keine Einträge");
  assert.equal(json(f), vorher);
  assert.equal(json(h.ctx.__essen.E().foods.hafer), json(loadApp({}, OPT).ctx.__essen.E().foods.hafer), "Startdaten unberührt");
});

test("unitAmt: Gramm-Menge → Grammzahl; Stück-Menge → über Gramm pro Stück; ohne stkG keine Leiste", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  assert.equal(K.unitAmt(E.foods.hafer, { amt: 80 }, 30), 30);
  assert.equal(K.unitAmt(E.foods.hafer, { amt: 80 }, "12,5"), 12.5);
  assert.equal(K.unitAmt(E.foods.ei, { amt: 2, u: "stk" }, 30), 0.5, "Ei: 30 g bei 60 g pro Stück");
  assert.equal(K.unitAmt(E.foods.roggen, { amt: 1 }, 30), null, "Stück ohne Gramm pro Stück");
  assert.equal(K.unitsUsable(E.foods.roggen, { amt: 1 }), false);
  assert.equal(K.unH(E.foods.roggen, { amt: 1 }), "", "dort gar keine Leiste");
  assert.equal(K.unitsUsable(E.foods.ei, { amt: 2, u: "stk" }), true);
  for (const schlecht of ["", "abc", 0, -3, NaN, undefined]) assert.equal(K.unitAmt(E.foods.hafer, { amt: 80 }, schlecht), null);
  assert.equal(K.unitAmt(undefined, { amt: 1 }, 30), null);
});

/* Antippen einer Einheit durch den echten bindUnits-Weg (Ersatz-Zeile/-Leiste/-Feld, wie bei der Tagesliste) */
function leiste(K, f, en, onChange) {
  const doc = {};
  K.h.ctx.document.addEventListener = (t, fn) => { doc[t] = fn; };
  K.h.ctx.document.removeEventListener = () => {};
  const chips = [], bar = { listeners: {}, addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    querySelectorAll: s => s === "[data-ui]" ? chips : [], querySelector: () => null };
  (f.units || []).forEach((u, i) => chips.push({ dataset: { ui: String(i) }, l: {}, addEventListener(t, fn) { this.l[t] = fn; } }));
  const inp = { value: String(en.amt), closest: s => s === ".eamtrow" ? { querySelector: q => q === "[data-un]" ? bar : null } : null };
  K.K.bindUnits(inp, f, en, onChange);  const tippe = i => { chips[i].l.pointerdown({ button: 0, clientX: 0, clientY: 0, target: { closest: () => null } }); doc.pointerup({ target: { closest: () => null } }); };
  return { inp, bar, tippe };
}

test("Tipp auf eine Einheit setzt entry.amt auf die Grammzahl; Feld zieht nach; Speicher sonst unverändert", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K);
  K.unitAdd(f, "Scheibe", "30"); K.unitAdd(f, "", "50");
  const en = { id: "x1", slot: "fr", food: "own:t1", amt: 80 };
  K.E().days["2026-01-01"] = { e: [en] };
  let rufe = 0;
  const l = leiste({ K, h }, f, en, () => { rufe++; });
  l.tippe(0);
  assert.strictEqual(en.amt, 30);
  assert.equal(l.inp.value, "30", "Zahlenfeld zieht nach");
  assert.equal(rufe, 1);
  l.tippe(1);
  assert.strictEqual(en.amt, 50);
  const g = gespeichert(h);
  assert.deepEqual(Object.keys(g.days["2026-01-01"].e[0]).sort(), ["amt", "food", "id", "slot"], "Eintrag behält seine Form");
  assert.equal(g.days["2026-01-01"].e[0].amt, 50);
  assert.ok(!JSON.stringify(g).includes("NaN"));
});

test("Tipp auf eine Einheit bei Stück-Menge (Ei, u:stk) rechnet über Gramm pro Stück; ohne Umrechnung bleibt die Menge", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, ei = K.E().foods.ei;
  K.unitAdd(ei, "Hälfte", "30");
  const en = { id: "x1", slot: "fr", food: "ei", amt: 2, u: "stk" };
  const l = leiste({ K, h }, ei, en, () => {});
  l.tippe(0);
  assert.strictEqual(en.amt, 0.5);
  const ro = K.E().foods.roggen; ro.units = [{ g: 30 }];
  const en2 = { id: "x2", slot: "fr", food: "roggen", amt: 1 };
  const l2 = leiste({ K, h }, ro, en2, () => {});
  l2.tippe(0);
  assert.strictEqual(en2.amt, 1, "keine Umrechnung möglich → nichts geändert, kein NaN");
});

test("Export → Import (Teilen per Link): units überleben den Rundlauf; ohne units kein Feld im Link", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K);
  K.unitAdd(f, "Scheibe", "30"); K.unitAdd(f, "", "50");
  eigen(K, { id: "own:t2", name: "Ohne Einheiten" });
  let text = "";
  h.ctx.navigator.share = async o => { text = o.text; };
  await K.shareEssen();
  assert.ok(/#e=/.test(text), "Link entstanden: " + text.slice(0, 80));
  const p = await K.readE(text);
  const aus = p.foods.find(x => x.name === "Testbrot"), ohne = p.foods.find(x => x.name === "Ohne Einheiten");
  assert.equal(json(aus.units), json([{ t: "Scheibe", g: 30 }, { g: 50 }]), "Export trägt units");
  assert.ok(!("units" in ohne), "Export ohne units: kein Feld");
  /* anderes Gerät: frische App kennt „Testbrot“ nicht */
  const h2 = loadApp({}, OPT), K2 = h2.ctx.__essen;
  const c = await K2.prepImport(JSON.parse(JSON.stringify(p)));
  const neu = Object.values(c.extra).find(x => x.name === "Testbrot");
  assert.equal(json(neu.units), json([{ t: "Scheibe", g: 30 }, { g: 50 }]), "Import liest units");
  const neu2 = Object.values(c.extra).find(x => x.name === "Ohne Einheiten");
  assert.ok(!("units" in neu2));
  K2.applyImport(c);
  const id = Object.keys(K2.E().foods).find(k => K2.E().foods[k].name === "Testbrot");
  assert.equal(json(gespeichert(h2).foods[id].units), json([{ t: "Scheibe", g: 30 }, { g: 50 }]), "nach Übernehmen im Speicher");
});

test("Import: bestehendes Lebensmittel mit upd:true bekommt units; ohne units im Link bleiben vorhandene stehen", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K);
  K.unitAdd(f, "alt", "10");
  const c1 = await K.prepImport({ v: 1, foods: [{ name: "Testbrot", kcal: 250, p: 8, c: 45, f: 2, upd: true }] });
  K.applyImport(c1);
  assert.equal(json(K.E().foods["own:t1"].units), json([{ t: "alt", g: 10 }]), "Link ohne units lässt units stehen");
  const c2 = await K.prepImport({ v: 1, foods: [{ name: "Testbrot", kcal: 250, p: 8, c: 45, f: 2, upd: true, units: [{ t: "neu", g: 25 }] }] });
  K.applyImport(c2);
  assert.equal(json(K.E().foods["own:t1"].units), json([{ t: "neu", g: 25 }]));
});

test("Import: kaputte units werden bereinigt, nicht übernommen (kein NaN, höchstens 12)", async () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen;
  const viele = Array.from({ length: 20 }, (_, i) => ({ g: i + 1 }));
  const c = await K.prepImport({ v: 1, foods: [
    { name: "A", kcal: 1, p: 0, c: 0, f: 0, units: [{ g: -1 }, { g: "x" }, { t: 5, g: 20 }, null, { t: "ok", g: "7,5" }] },
    { name: "B", kcal: 1, p: 0, c: 0, f: 0, units: viele },
    { name: "C", kcal: 1, p: 0, c: 0, f: 0, units: "kaputt" },
    { name: "D", kcal: 1, p: 0, c: 0, f: 0, units: [{ g: 0 }] }] });
  const nach = n => Object.values(c.extra).find(x => x.name === n);
  assert.equal(json(nach("A").units), json([{ g: 20 }, { t: "ok", g: 7.5 }]));
  assert.equal(nach("B").units.length, 12);
  assert.ok(!("units" in nach("C")) && !("units" in nach("D")), "nichts Brauchbares → kein Feld");
  assert.ok(!json(c.extra).includes("NaN"));
});

test("units anlegen berührt keine anderen Felder des Lebensmittels", () => {
  /* Das Bearbeiten-Formular (foodForm) kopiert das Lebensmittel per Object.assign und nimmt units damit mit – am Gerät gegenzuprüfen. */
  const h = loadApp({}, OPT), K = h.ctx.__essen, f = eigen(K, { stkG: 40, def: 100 });
  const vorher = json(Object.assign({}, f));
  K.unitAdd(f, "x", "5");
  const nachher = Object.assign({}, f); delete nachher.units;
  assert.equal(json(nachher), vorher, "alle anderen Felder unverändert, gleiche Reihenfolge");
});

/* ---------- Suche: Gedrückthalten zeigt Werte, Loslassen wählt nichts aus ----------
   Echter drawRes/gesture-Weg mit Ersatz-Trefferzeile; der 420-ms-Zeitgeber wird von Hand ausgelöst.
   Wie es sich anfühlt (Dauer, Einfahren von unten, Vibration) → Gerät. */
function suche() {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E(), k = heute();
  const zeiger = [], doc = {};
  h.ctx.setTimeout = (fn, ms) => { zeiger.push({ fn, ms, tot: false }); return zeiger.length; };
  h.ctx.clearTimeout = id => { if (zeiger[id - 1]) zeiger[id - 1].tot = true; };
  h.ctx.fetch = () => Promise.reject(new Error("offline"));
  h.ctx.document.addEventListener = (t, fn) => { doc[t] = fn; };
  h.ctx.document.removeEventListener = () => {};
  const zeile = { dataset: { pick: "hafer" }, l: {}, addEventListener(t, fn) { this.l[t] = fn; } };
  h.el("eRes").querySelectorAll = s => s === "[data-pick]" ? [zeile] : [];
  K.setDay(k);
  K.openSearch({ kind: "day", slot: "fr" });
  const anz = () => ((E.days[k] || { e: [] }).e).length;
  const druck = () => zeile.l.pointerdown({ button: 0, clientX: 0, clientY: 0, target: { closest: () => null } });
  const los = () => doc.pointerup({ target: { closest: () => null } });
  const lang = () => { const t = zeiger.find(z => z.ms === 420 && !z.tot); assert.ok(t, "Zeitgeber für langes Drücken läuft"); t.tot = true; t.fn(); };
  const klick = () => zeile.onclick({ target: { closest: () => null } });
  const karte = () => h.el("eInfo");
  return { h, K, E, k, zeile, anz, druck, los, lang, klick, karte, zeiger, doc };
}

test("Gedrückt halten: Werte-Karte erscheint (kcal, E / KH / F pro 100 g), Loslassen blendet aus und wählt nichts aus", () => {
  const s = suche();
  assert.equal(s.anz(), 0);
  s.druck(); s.lang();
  assert.ok(s.karte().classList.contains("show"), "Karte sichtbar während des Haltens");
  const html = s.karte().innerHTML, f = s.E.foods.hafer;
  assert.ok(html.includes(f.name) && html.includes("pro 100 g"));
  assert.ok(html.includes(">372<") && html.includes(">13,5<") && html.includes(">58,7<") && html.includes(">7<"), html);
  assert.equal(s.anz(), 0, "beim Halten nichts ausgewählt");
  s.los();
  assert.ok(!s.karte().classList.contains("show"), "Loslassen blendet aus");
  s.klick(); // der Klick, den der Browser nach dem Loslassen noch schickt
  assert.equal(s.anz(), 0, "Loslassen wählt NICHTS aus");
  assert.equal(JSON.stringify(s.E).includes("NaN"), false);
});

test("nach einem Halten wirkt der nächste normale Tipp wieder (Auswahl)", () => {
  const s = suche();
  s.druck(); s.lang(); s.los(); s.klick();
  assert.equal(s.anz(), 0);
  s.druck(); s.los(); // kurzer Tipp: Zeitgeber wird nicht ausgelöst
  s.klick();
  assert.equal(s.anz(), 1, "normaler Tipp wählt aus wie bisher");
  assert.equal(s.E.days[s.k].e[0].food, "hafer");
});

test("kurzer Tipp ohne Halten: keine Karte, Auswahl wie bisher", () => {
  const s = suche();
  s.druck(); s.los(); s.klick();
  assert.ok(!s.karte().classList.contains("show"));
  assert.equal(s.anz(), 1);
});

test("Finger bewegt sich vor Ablauf des Zeitgebers (Scrollen der Trefferliste): Zeitgeber abgebrochen, keine Karte", () => {
  const s = suche();
  s.druck();
  assert.ok(s.zeiger.some(z => z.ms === 420 && !z.tot), "Zeitgeber läuft");
  s.doc.pointermove({ clientX: 0, clientY: 30 }); // mehr als 9 px
  assert.ok(s.zeiger.filter(z => z.ms === 420).every(z => z.tot), "Zeitgeber abgebrochen");
  assert.ok(!s.karte().classList.contains("show"));
  assert.equal(s.anz(), 0);
});

test("holdH: Karte aus den Bezugswerten des Lebensmittels (pro Stück bei Stück-Lebensmitteln)", () => {
  const h = loadApp({}, OPT), K = h.ctx.__essen, E = K.E();
  const stk = K.holdH(E.foods.roggen);
  assert.ok(stk.includes("pro Stück") && stk.includes(">172<") && stk.includes(">5,3<"));
  assert.equal(K.holdH(undefined), "");
});
