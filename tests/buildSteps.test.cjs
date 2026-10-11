/* Tests für den Workout-Ablauf: buildSteps aus der ausgelieferten app.js (SAFE-03).
   Alle Fixtures sind erfunden (uids a, b, z); keine echten Trainings- oder Ernährungsdaten. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

const h = loadApp();
const F = h.F;

/* Übung mit den Standardwerten des Katalogs, darüber die Testwerte */
function item(uid, ex, werte, extra) {
  return Object.assign({ uid, ex, o: Object.assign({}, F.EXB[ex].def, werte), status: "plan" }, extra || {});
}
/* Schrittliste → Zeilen [type, kind oder mode, dur oder null, set, side oder null, stage oder null].
   Array.from, weil die Liste aus dem vm-Kontext kommt (fremder Array-Prototyp). */
function rows(steps) {
  return Array.from(steps, s => [
    s.type, s.type === "trans" ? s.kind : s.mode, s.dur == null ? null : s.dur, s.set,
    s.side == null ? null : s.side, s.stage == null ? null : s.stage,
  ]);
}
function build(items, extra) {
  return h.A.buildSteps(Object.assign({ settings: { confirm: false }, pauses: {}, items }, extra || {}));
}

test("Sätze: zwei Sätze mit Satzpause", () => {
  const steps = build([item("a", "heelsit", { sets: 2 })]);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
    ["trans", "set", 120, 2, null, null],
    ["work", "hold", 60, 2, 0, null],
  ]);
  assert.equal(steps[0].label, "Mach dich bereit");
  assert.equal(steps[2].label, "Satzpause");
});
