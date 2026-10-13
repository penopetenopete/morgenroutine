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

test("sfOn: liefert null, wenn der Block nur eine Übung hat (Fall S5)", () => {
  const h = loadApp();
  const F = h.F;
  const items = [{ uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), status: "plan" }];
  assert.equal(h.A.sfOn(items, 0), null);
});

test("sfOn: liefert null, wenn eine Übung des Blocks beidseitig ist (heelsit, Fall S4)", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, status: "plan" },
    { uid: "b", ex: "heelsit", o: Object.assign({}, F.EXB.heelsit.def), status: "plan" },
  ];
  assert.equal(h.A.sfOn(items, 0), null);
});

test("sfOn: liefert null, wenn eine Übung des Blocks status 'removed' trägt", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, status: "plan" },
    { uid: "b", ex: "rot9090", o: Object.assign({}, F.EXB.rot9090.def), status: "removed" },
  ];
  assert.equal(h.A.sfOn(items, 0), null);
});

test("sfOn: zeigt in jeder Zeile des Blocks auf denselben Eintrag (P-04)", () => {
  const h = loadApp();
  const F = h.F;
  const items = [
    { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, status: "plan" },
    { uid: "b", ex: "rot9090", o: Object.assign({}, F.EXB.rot9090.def), status: "plan" },
  ];
  const r0 = h.A.sfOn(items, 0), r1 = h.A.sfOn(items, 1);
  assert.notEqual(r0, null);
  assert.equal(r0, r1);
});

test("Dialog springt nicht: #shBody hat nach dem Neuzeichnen durch einen .sfbtn-Klick denselben scrollTop wie davor", () => {
  const h = loadApp();
  const F = h.F;
  const it = { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, so: {} };
  let on = false;
  const ctx = { rid: null, st: {}, set: 0, sf: { get on() { return on; }, set(v) { on = v; } } };

  h.A.openEditor(it, ctx);
  h.el("shBody").scrollTop = 123;
  ctx.sf.set(true);
  h.A.rerenderEditor();
  assert.equal(h.el("shBody").scrollTop, 123);
});

test("aria-pressed spiegelt den Zustand: nach dem Einschalten steht data-sf=\"true\" auf \"true\" und data-sf=\"false\" auf \"false\", und umgekehrt", () => {
  const h = loadApp();
  const F = h.F;
  const it = { uid: "a", ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def), link: true, so: {} };
  let on = false;
  const ctx = { rid: null, st: {}, set: 0, sf: { get on() { return on; }, set(v) { on = v; } } };

  h.A.openEditor(it, ctx);
  assert.match(h.el("shBody").innerHTML, /data-sf="false" aria-pressed="true"/);
  assert.match(h.el("shBody").innerHTML, /data-sf="true" aria-pressed="false"/);

  ctx.sf.set(true);
  h.A.rerenderEditor();
  assert.match(h.el("shBody").innerHTML, /data-sf="false" aria-pressed="false"/);
  assert.match(h.el("shBody").innerHTML, /data-sf="true" aria-pressed="true"/);
});

/* Befund CR-01 (13.10.2026): „Seite für Seite" fiel lautlos auf „Je Übung" zurück, sobald die
   Übung, die den Blockschalter trägt, übersprungen, gelöscht oder nach hinten gezogen wurde.
   blocksOf filterte vor dem Gruppieren, buildSteps las danach bl[0].sf. Die folgenden Fälle
   halten das Verhalten fest; sie deckten zugleich WR-02 ab (Blöcke mit drei Übungen). */

function blockItems(F, extras) {
  return extras.map((ex, i) => Object.assign(
    { uid: "abc"[i], ex: "pigeon", o: Object.assign({}, F.EXB.pigeon.def, { sets: 1, reps: 10 }), so: {}, status: "plan" },
    ex));
}
const seiten = (A, items) => A.buildSteps({ v: 1, id: "w1", items, res: {}, pauses: {}, settings: {}, audio: {}, visited: [] })
  .filter(s => s.type === "work").map(s => s.uid + ":" + s.side).join(" ");

test("CR-01: Dreier-Block läuft Seite für Seite — erst alle links, dann alle rechts", () => {
  const h = loadApp();
  const items = blockItems(h.F, [{ link: true, sf: true }, { link: true }, {}]);
  assert.equal(seiten(h.A, items), "a:0 b:0 c:0 a:1 b:1 c:1");
});

test("CR-01: erste Übung des Blocks mitten im Workout übersprungen — Seite für Seite bleibt", () => {
  const h = loadApp();
  const items = blockItems(h.F, [{ link: true, sf: true }, { link: true }, {}]);
  items[0].status = "removed";
  assert.equal(seiten(h.A, items), "b:0 c:0 b:1 c:1");
});

test("CR-01: erste Übung des Blocks auf null Sätze — Seite für Seite bleibt", () => {
  const h = loadApp();
  const items = blockItems(h.F, [{ link: true, sf: true }, { link: true }, {}]);
  items[0].cut = 0;
  assert.equal(seiten(h.A, items), "b:0 c:0 b:1 c:1");
});

test("CR-01: ein sf an einer späteren Übung bleibt wirkungslos (festgelegte Regel, P-04)", () => {
  const h = loadApp();
  const items = blockItems(h.F, [{ link: true }, { link: true, sf: true }, {}]);
  assert.notEqual(seiten(h.A, items), "a:0 b:0 c:0 a:1 b:1 c:1");
});

test("CR-01: Verschieben innerhalb des Blocks führt den Schalter auf die neue erste Übung nach", () => {
  const h = loadApp();
  h.A.S().routines = [{ id: "r1", name: "T", pauses: {}, audio: {}, settings: {},
    days: [{ items: blockItems(h.F, [{ link: true, sf: true }, { link: true }, {}]) }] }];
  h.A.save();
  h.A.orderItems("r1", 0, ["b", "a", "c"]);
  const raw = h.A.getRoutine("r1").days[0].items;
  assert.deepEqual(raw.map(x => x.uid), ["b", "a", "c"]);
  assert.equal(raw[0].sf, true, "der Schalter sitzt an der neuen ersten Übung");
  assert.equal(raw[1].sf, undefined, "und nicht mehr an der verschobenen");
  assert.equal(seiten(h.A, raw), "b:0 a:0 c:0 b:1 a:1 c:1");
});

test("CR-01: Löschen der Trägerübung vererbt den Schalter an die nächste im Block", () => {
  const h = loadApp();
  h.A.S().routines = [{ id: "r1", name: "T", pauses: {}, audio: {}, settings: {},
    days: [{ items: blockItems(h.F, [{ link: true, sf: true }, { link: true }, {}]) }] }];
  h.A.save();
  h.A.deleteItem("r1", 0, "a");
  const raw = h.A.getRoutine("r1").days[0].items;
  assert.deepEqual(raw.map(x => x.uid), ["b", "c"]);
  assert.equal(raw[0].sf, true);
  assert.equal(seiten(h.A, raw), "b:0 c:0 b:1 c:1");
});
