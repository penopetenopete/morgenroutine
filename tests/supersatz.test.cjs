/* Tests für „Seite für Seite" (WORK-03): Regel sfOn, Speicherfunktion sfItem, Lesen über
   getRoutine, Schrittfolge aus buildSteps, Dialog-Markup aus openEditor.
   Alle Fixtures sind erfunden (uids a, b); keine echten Trainings- oder Ernährungsdaten. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

function routineMit(items) {
  return { id: "r1", name: "Testroutine", pauses: {}, audio: {}, settings: {}, days: [{ items }] };
}

test("sfOn: liefert bei zwei verknüpften einseitigen Übungen die erste Übung", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, status: "plan" },
    { uid: "b", ex: "rot9090", o: Object.assign({}, F.EXB.rot9090.def), status: "plan" },
  ];
  const r = h.A.sfOn(items, 0);
  assert.notEqual(r, null);
  assert.equal(r.uid, "a");
});

test("sfItem: schreibt sf: true an den Rohbestand in training_v1, Ausschalten entfernt den Schlüssel", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true },
    { uid: "b", ex: "rot9090", o: Object.assign({}, F.EXB.rot9090.def), um: "Umbau-Text" },
  ];
  const S = h.A.S();
  S.routines.push(routineMit(items));
  h.A.save();

  h.A.sfItem("r1", 0, "a", true);
  const stored = JSON.parse(h.storage.getItem("training_v1"));
  const eintrag = stored.routines.find(r => r.id === "r1").days[0].items.find(x => x.uid === "a");
  assert.equal(eintrag.sf, true);

  h.A.sfItem("r1", 0, "a", false);
  const stored2 = JSON.parse(h.storage.getItem("training_v1"));
  const eintrag2 = stored2.routines.find(r => r.id === "r1").days[0].items.find(x => x.uid === "a");
  assert.equal("sf" in eintrag2, false);
});

test("getRoutine: liefert sf === true an der ersten Übung, nachdem sfItem geschrieben hat", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true },
    { uid: "b", ex: "rot9090", o: Object.assign({}, F.EXB.rot9090.def), um: "Umbau-Text" },
  ];
  const S = h.A.S();
  S.routines.push(routineMit(items));
  h.A.save();
  h.A.sfItem("r1", 0, "a", true);

  const R = h.A.getRoutine("r1");
  assert.equal(R.days[0].items[0].sf, true);
});

test("buildSteps: mit sf an liefert acht Schritte, uid-Folge a,b,a,b, Seiten 0,0,1,1 (Fall S1)", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true },
    { uid: "b", ex: "rot9090", o: Object.assign({}, F.EXB.rot9090.def), um: "Umbau-Text" },
  ];
  const S = h.A.S();
  S.routines.push(routineMit(items));
  h.A.save();
  h.A.sfItem("r1", 0, "a", true);

  const R = h.A.getRoutine("r1");
  const steps = h.A.buildSteps({ settings: { confirm: false }, pauses: {}, items: R.days[0].items });
  assert.equal(steps.length, 8);
  const works = Array.from(steps).filter(s => s.type === "work");
  assert.deepStrictEqual(works.map(s => s.uid), ["a", "b", "a", "b"]);
  assert.deepStrictEqual(works.map(s => s.side), [0, 0, 1, 1]);
});

test("openEditor: ctx.sf erzeugt data-sf Markup, ohne ctx.sf kommt data-sf nicht vor", () => {
  const h = loadApp();
  const F = h.F;
  const it = { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, so: {} };

  h.A.openEditor(it, { rid: null, st: {}, set: 0, sf: { on: false, set() {} } });
  const mitSf = h.el("shBody").innerHTML;
  assert.match(mitSf, /data-sf="true"/);
  assert.match(mitSf, /data-sf="false"/);

  h.A.openEditor(it, { rid: null, st: {}, set: 0 });
  const ohneSf = h.el("shBody").innerHTML;
  assert.doesNotMatch(ohneSf, /data-sf/);
});
