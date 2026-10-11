/* Tests für Sichern und Wiederherstellen (SAFE-02): Rundlauf mit gewachsenen Daten, Lücken (null),
   Ablehnung nur bei Startbruch, Rücknahme, laufendes Workout, ältere Sicherung, Knopf.
   Alle Fixtures sind erfunden; keine echten Trainings- oder Ernährungsdaten.
   Werte aus dem vm-Kontext werden vor dem Vergleich in Host-Werte umgewandelt (JSON-Rundlauf). */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

const NO = "Datei passt nicht";
const FAIL = "Speichern ging nicht";
const OPT = { withEssenSpotify: true };

const host = v => JSON.parse(JSON.stringify(v));
const toastText = h => h.el("toast").textContent;

/* Fixture „gewachsene Daten" (luecken = Fassung mit null überall, wo die App den Wert nicht braucht).
   Liefert die Startwerte (seed) für loadApp. Basis ist ein frischer Start. */
function gewachsen(luecken) {
  const h0 = loadApp({}, OPT);
  const S = host(h0.A.S());
  S.g = { rest: 90, theme: "dunkel", sound: true, vib: false };
  const r = {
    id: "rtest", name: "Testroutine", cat: "knie", settings: { umbau: 15 }, pauses: { "a|set|2": 45 }, audio: { "a|1": "podcast" },
    days: [
      { items: [
        { uid: "a", ex: "grasshopper", o: { sets: 2, secs: 30 }, base: { sets: 2, secs: 30 }, so: { 2: { secs: 20 } }, link: true, sf: true },
        { uid: "b", ex: "nervefloss", o: { sets: 2, reps: 10, kg: 20 }, um: "Umbau-Text", mix: true },
        { uid: "c", ex: "gibtsnichtmehr", o: {} } ] },
      { items: [] } ] };
  S.routines.push(r);
  S.plans = [{ id: "ptest", name: "Wochenplan", days: [null, "rtest", null, "morgen", null, null, null] }];
  S.exLast = { nervefloss: { sets: 2, reps: 10, kg: 20 } };
  S.settings = { tlFace: "txt" };
  S.last.rtest = { day: 0, d: 1767600000000 };
  S.lastRes["rtest|b"] = { d: 1767600000000, sets: [{ reps: 10 }, { reps: 9 }], kg: 20 };
  S.log.push({ d: 1767600000000, end: 1767600600000, t: 600, rid: "rtest", rname: "Testroutine", day: 0, days: 2,
    items: [{ uid: "b", ex: "nervefloss", name: "Nerve Floss", status: "erledigt", added: false, o: { sets: 2, reps: 10, kg: 20 },
      o2: null, time: 80, sets: [{ reps: 10 }, { reps: 9 }], planned: 2, cut: null, link: false }] });
  const E = { v: 1, mig: 1, goals: { kcal: 2000, p: 100, f: 60, c: 250 }, kg: 80, burnIn: false,
    foods: { testfood: { id: "testfood", name: "Testessen", base: "g", kcal: 100, p: 10, c: 10, f: 2, fib: 1, src: "own" } },
    meals: { testmahl: { id: "testmahl", name: "Testmahlzeit", slot: "fr", items: [{ food: "testfood", amt: 100 }] } },
    days: { "2026-01-05": { e: [{ id: "e1", slot: "fr", food: "testfood", amt: 150 }], acts: [{ name: "Gehen", kcal: 120 }] } } };
  let cat = { ex: { nervefloss: { reps: 12 } } };
  if (luecken) {
    Object.assign(S, { plans: null, exLast: null, settings: null, morgen: null, morgenR: null, cats: null });
    S.g.rest = null; S.last.rtest = null;
    Object.assign(r, { cat: null, settings: null, pauses: null, audio: null });
    Object.assign(r.days[0].items[0], { so: null, base: null, link: null, sf: null });
    Object.assign(r.days[0].items[1], { um: null, mix: null }); r.days[0].items[1].o.kg = null;
    Object.assign(E, { meals: null, kg: null, burnIn: null }); E.goals.kcal = null; E.days["2026-01-05"].acts = null;
    cat = null;
  }
  return { training_v1: JSON.stringify(S), essen_v1: JSON.stringify(E), uebungen_v1: JSON.stringify(cat) };
}

/* gültige Sicherung aus einem frischen Start (Host-Objekt, frei änderbar) */
async function frisch() {
  const h = loadApp({}, OPT);
  return host(await h.A.readData(await h.A.dataLink()));
}

test("Rundlauf mit gewachsenen Daten: Sicherung → Prüfung → Wiederherstellung → Neustart", async () => {
  const h1 = loadApp(gewachsen(false), OPT);
  const link = await h1.A.dataLink();
  assert.ok(link.startsWith("https://example.test/morgenroutine/#d="));
  const h2 = loadApp({}, OPT);
  const p = await h2.A.readData(link);
  assert.deepEqual(Object.keys(p).sort(), ["S", "all", "cat", "essen", "v"]);
  assert.equal(h2.A.backupOk(p), null);
  assert.equal(h2.A.restoreData(p), null);
  assert.deepEqual(JSON.parse(h2.dump().training_v1), host(h1.A.S()));
  assert.deepEqual(JSON.parse(h2.dump().essen_v1), host(h1.ctx.TrainingEssen.get()));
  assert.deepEqual(JSON.parse(h2.dump().uebungen_v1), JSON.parse(h1.dump().uebungen_v1));
  const h3 = loadApp(h2.dump(), OPT);
  assert.equal(h3.A.S().g.rest, 90);
  assert.equal(h3.A.S().g.theme, "dunkel");
  assert.equal(h3.A.S().routines.length, h1.A.S().routines.length);
  assert.equal(h3.ctx.TrainingEssen.get().foods.testfood.name, "Testessen");
});

test("Sonderformen kommen zurück: so, link, sf, um, mix, exLast, lastRes, freie Plantage, o2/cut", async () => {
  const h1 = loadApp(gewachsen(false), OPT);
  const h2 = loadApp({}, OPT);
  assert.equal(h2.A.restoreData(await h2.A.readData(await h1.A.dataLink())), null);
  const S = JSON.parse(h2.dump().training_v1);
  const r = S.routines.find(x => x.id === "rtest");
  const [a, b] = r.days[0].items;
  assert.equal(a.so[2].secs, 20);
  assert.equal(a.link, true);
  assert.equal(a.sf, true);
  assert.equal(b.um, "Umbau-Text");
  assert.equal(b.mix, true);
  assert.equal(S.exLast.nervefloss.kg, 20);
  assert.equal(S.lastRes["rtest|b"].sets.length, 2);
  assert.equal(S.plans[0].days.length, 7);
  assert.equal(S.plans[0].days.filter(d => d === null).length, 5);
  const last = S.log[S.log.length - 1].items[0];
  assert.equal(last.o2, null);
  assert.equal(last.cut, null);
});

test("Eigene Sicherung aus dem Startzustand besteht die Prüfung", async () => {
  const h = loadApp({}, OPT);
  const p = await h.A.readData(await h.A.dataLink());
  assert.equal(h.A.backupOk(p), null);
});

test("Lücken (null) sind kein Ablehnungsgrund: Fassung mit Lücken besteht, App startet, eigene Sicherung besteht", async () => {
  const seed = gewachsen(true);
  const p = { v: 1, all: true, S: JSON.parse(seed.training_v1), cat: null, essen: JSON.parse(seed.essen_v1) };
  const h0 = loadApp({}, OPT);
  assert.equal(h0.A.backupOk(p), null);
  let h;
  assert.doesNotThrow(() => { h = loadApp(seed, OPT); });
  const q = await h.A.readData(await h.A.dataLink());
  assert.equal(q.cat, null);
  assert.equal(h.A.backupOk(q), null);
});

/* je Fall genau eine Änderung an einer gültigen Sicherung; Ernährung = Fall, der essen betrifft */
const FAELLE = {
  "Hülle: null": { huelle: true, f: () => null },
  "Hülle: ohne all": { huelle: true, f: p => { delete p.all; return p; } },
  "Hülle: S als Array": { huelle: true, f: p => { p.S = []; return p; } },
  "routines als Zahl": { f: p => { p.S.routines = 5; } },
  "Routine mit days als Zahl": { f: p => { p.S.routines[0].days = 5; } },
  "Routine mit leerem days": { f: p => { p.S.routines[0].days = []; } },
  "Tag ohne items": { f: p => { delete p.S.routines[0].days[0].items; } },
  "Eintrag null": { f: p => { p.S.routines[0].days[0].items[0] = null; } },
  "morgenR als leeres Objekt": { f: p => { p.S.morgenR = {}; } },
  "g gleich null": { f: p => { p.S.g = null; } },
  "last gleich null": { f: p => { p.S.last = null; } },
  "plans mit Eintrag null": { f: p => { p.S.plans = [null]; } },
  "cats als Zahl": { f: p => { p.S.cats = 5; } },
  "essen ohne foods": { essen: true, f: p => { delete p.essen.foods; } },
  "essen ohne days": { essen: true, f: p => { delete p.essen.days; } },
  "essen.goals gleich null": { essen: true, f: p => { p.essen.goals = null; } },
};

test("Ablehnung: sechzehn Eingaben ergeben „Datei passt nicht“, der Speicher bleibt unverändert", async () => {
  for (const [name, fall] of Object.entries(FAELLE)) {
    let p = await frisch();
    const q = fall.f(p);
    if (q !== undefined) p = q;
    const h = loadApp(gewachsen(false), OPT);
    const vorher = host(h.dump());
    assert.equal(h.A.backupOk(p), NO, name);
    assert.equal(h.A.restoreData(p), NO, name);
    assert.deepEqual(host(h.dump()), vorher, name);
  }
  assert.equal(Object.keys(FAELLE).length, 16);
});

test("Ablehnung nur bei Startbruch: mit genau diesen Daten startet die App nicht", async () => {
  for (const [name, fall] of Object.entries(FAELLE)) {
    if (fall.huelle) continue;
    const p = await frisch();
    fall.f(p);
    const seed = { training_v1: JSON.stringify(p.S), essen_v1: JSON.stringify(p.essen) };
    if (name === "essen ohne foods") {
      /* der Start verwirft die Daten und hebt sie als Rohkopie auf (Plan 02) */
      const h = loadApp(seed, OPT);
      assert.equal(h.dump().essen_defekt_v1, seed.essen_v1, name);
    } else {
      assert.throws(() => loadApp(seed, OPT), name);
    }
  }
});

test("Rücknahme: scheitert ein Schreiben, ist der Speicher danach wie vorher", async () => {
  const faelle = { "essen_v1": k => k === "essen_v1", "uebungen_v1": k => k === "uebungen_v1", "training_v1": k => k === "training_v1", "alle": () => true };
  for (const [name, fail] of Object.entries(faelle)) {
    const p = await frisch();
    const h = loadApp(gewachsen(false), OPT);
    const vorher = host(h.dump());
    h.failSet = fail;
    assert.equal(h.A.restoreData(p), FAIL, name);
    assert.deepEqual(host(h.dump()), vorher, name);
  }
});

test("Rücknahme scheitert selbst einmal: der alte Wert steht danach trotzdem wieder da", async () => {
  const p = await frisch();
  const h = loadApp(gewachsen(false), OPT);
  const vorher = host(h.dump());
  let n = 0;
  h.failSet = k => k === "essen_v1" || (k === "training_v1" && ++n === 2);
  assert.equal(h.A.restoreData(p), FAIL);
  assert.deepEqual(host(h.dump()), vorher);
});

test("laufendes Workout: keine Wiederherstellung, der Speicher bleibt; ein beendetes Workout sperrt nicht", async () => {
  const p = await frisch();
  const h = loadApp(gewachsen(false), OPT);
  h.storage.setItem("training_active_v1", JSON.stringify({ id: "x", ended: false }));
  const vorher = host(h.dump());
  assert.equal(h.A.restoreData(p), "Erst Workout beenden");
  assert.deepEqual(host(h.dump()), vorher);
  h.storage.removeItem("training_active_v1");
  h.A.W = { id: "y", ended: false };
  assert.equal(h.A.restoreData(p), "Erst Workout beenden");
  h.A.W = null;
  h.storage.setItem("training_active_v1", JSON.stringify({ id: "z", ended: true }));
  assert.equal(h.A.restoreData(p), null);
  assert.equal("training_active_v1" in h.dump(), false);
});

test("Ältere Sicherung ohne essen und cat: nur Training wird ersetzt", async () => {
  const p = await frisch();
  delete p.essen; delete p.cat;
  p.S.g = { rest: 77 };
  const h = loadApp(gewachsen(false), OPT);
  const vorher = host(h.dump());
  assert.equal(h.A.restoreData(p), null);
  assert.equal(h.dump().essen_v1, vorher.essen_v1);
  assert.equal(h.dump().uebungen_v1, vorher.uebungen_v1);
  assert.equal(JSON.parse(h.dump().training_v1).g.rest, 77);
});

test("Knopf: „Alles ersetzen“ lädt nur nach Erfolg neu; ungültige Eingabe zeigt den Toast und lädt nicht", async () => {
  const p = await frisch();
  p.S.g = { rest: 66 };
  const h = loadApp(gewachsen(false), OPT);
  h.A.offerData(p);
  h.el("dtOk").onclick();
  assert.equal(h.replaced.length, 1);
  assert.equal(JSON.parse(h.dump().training_v1).g.rest, 66);

  const h2 = loadApp(gewachsen(false), OPT);
  const q = await frisch();
  q.S.routines = 5;
  h2.A.offerData(q);
  assert.equal(toastText(h2), NO);
  assert.equal(h2.replaced.length, 0);

  const h3 = loadApp(gewachsen(false), OPT);
  h3.A.offerData(await frisch());
  h3.failSet = () => true;
  h3.el("dtOk").onclick();
  assert.equal(toastText(h3), FAIL);
  assert.equal(h3.replaced.length, 0);
});
