/* Tests für den Workout-Ablauf: buildSteps aus der ausgelieferten app.js (SAFE-03).
   Alle Fixtures sind erfunden (uids a, b, z); keine echten Trainings- oder Ernährungsdaten.
   Standardpausen: Satzpause 120 s, Seitenwechsel 10 s. */
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
const kinds = steps => Array.from(steps, s => s.kind).filter(Boolean);
const works = steps => Array.from(steps).filter(s => s.type === "work");

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

test("Wiederholungen ohne Bestätigung: beide Seiten in einem Schritt", () => {
  const steps = build([item("a", "camel", { reps: 6, sets: 1 })]);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "reps", null, 1, 0, null],
  ]);
  assert.equal(steps[1].both, true);
});

test("Wiederholungen mit Bestätigung: Seitenwechsel dazwischen", () => {
  const steps = build([item("a", "camel", { reps: 6, sets: 1 })], { settings: { confirm: true } });
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "reps", null, 1, 0, null],
    ["trans", "side", 10, 1, null, null],
    ["work", "reps", null, 1, 1, null],
  ]);
  assert.equal(steps[2].label, "Seitenwechsel");
  assert.notEqual(steps[1].both, true);
});

test("Supersatz (link): zwölf Schritte, Pause · gleich Nerve Floss", () => {
  const steps = build([
    item("a", "grasshopper", { sets: 2, secs: 30 }, { link: true }),
    item("b", "nervefloss", { sets: 2, reps: 10 }),
  ]);
  assert.equal(steps.length, 12);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 30, 1, 0, null],
    ["trans", "side", 10, 1, null, null],
    ["work", "hold", 30, 1, 1, null],
    ["trans", "link", 120, 1, null, null],
    ["work", "reps", null, 1, 0, null],
    ["trans", "set", 120, 2, null, null],
    ["work", "hold", 30, 2, 0, null],
    ["trans", "side", 10, 2, null, null],
    ["work", "hold", 30, 2, 1, null],
    ["trans", "link", 120, 2, null, null],
    ["work", "reps", null, 2, 0, null],
  ]);
  assert.equal(steps[4].label, "Pause · gleich Nerve Floss");
  assert.equal(steps[10].label, "Pause · gleich Nerve Floss");
});

test("Seite für Seite (sf, um): acht Schritte, uid-Folge a, b, a, b", () => {
  const steps = build([
    item("a", "pigeon", { sets: 1, reps: 10 }, { link: true, sf: true }),
    item("b", "rot9090", { sets: 1, reps: 10 }, { um: "Umbau-Text" }),
  ]);
  assert.equal(steps.length, 8);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "reps", null, 1, 0, null],
    ["trans", "umbau", 10, 1, null, null],
    ["work", "reps", null, 1, 0, null],
    ["trans", "side", 10, 1, null, null],
    ["work", "reps", null, 1, 1, null],
    ["trans", "umbau", 10, 1, null, null],
    ["work", "reps", null, 1, 1, null],
  ]);
  const w = works(steps);
  assert.deepStrictEqual(w.map(s => s.uid), ["a", "b", "a", "b"]);
  assert.deepStrictEqual(w.map(s => s.side), [0, 0, 1, 1]);
  assert.equal(steps[2].label, "Umbau · Umbau-Text");
  assert.equal(steps[6].label, "Umbau · Umbau-Text");
});

test("Drop-Set: drei Stufen je Seite, Sätze aus der Eingabe", () => {
  const steps = build([item("a", "drop_out", { secs: 30, sets: 1 })]);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 30, 1, 0, 0],
    ["work", "hold", 30, 1, 0, 1],
    ["work", "hold", 30, 1, 0, 2],
    ["trans", "side", 10, 1, null, null],
    ["work", "hold", 30, 1, 1, 0],
    ["work", "hold", 30, 1, 1, 1],
    ["work", "hold", 30, 1, 1, 2],
  ]);
});

test("Altpaar (alter pair-Zweig, kommt aus echten Routinen nicht mehr an): acht Schritte", () => {
  const def2 = Object.assign({}, F.EXB.hfstretch.def, { secs: 30 });
  const steps = build([
    item("a", "kickout", { secs: 15 }, { pair: { ex2: "hfstretch", o2: def2, umbau: "Fuß auf den Stuhl", name: "Paar" } }),
  ]);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 15, 1, 0, null],
    ["trans", "umbau", 10, 1, null, null],
    ["work", "hold", 30, 1, 0, null],
    ["trans", "side", 10, 1, null, null],
    ["work", "hold", 15, 1, 1, null],
    ["trans", "umbau", 10, 1, null, null],
    ["work", "hold", 30, 1, 1, null],
  ]);
  assert.equal(steps[2].label, "Umbau · Fuß auf den Stuhl");
  assert.equal(steps[1].part, 0);
  assert.equal(steps[3].part, 1);
  assert.equal(steps[3].ex, "hfstretch");
  assert.equal(steps[7].part, 1);
});

test("Überspringen: eine entfernte Übung fehlt im Ablauf", () => {
  const steps = build([
    item("a", "heelsit", { sets: 1 }),
    item("b", "grasshopper", { sets: 1, secs: 30 }, { status: "removed" }),
  ]);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
  ]);
  assert.deepStrictEqual(works(steps).map(s => s.uid), ["a"]);
});

test("Alle übersprungen: leere Schrittliste", () => {
  const steps = build([item("a", "heelsit", { sets: 1 }, { status: "removed" })]);
  assert.deepStrictEqual(rows(steps), []);
});

test("Übung beendet (cut): nur der erste Satz bleibt", () => {
  const steps = build([item("a", "heelsit", { sets: 3 }, { cut: 1 })]);
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
  ]);
});

test("Eigene Pause (pauses): überschreibt die Standardpause und ist als custom markiert", () => {
  const pk = "a" + "|" + "set" + "|" + "2";
  const steps = build([item("a", "heelsit", { sets: 2 })], { pauses: { [pk]: 45 } });
  assert.deepStrictEqual(rows(steps), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
    ["trans", "set", 45, 2, null, null],
    ["work", "hold", 60, 2, 0, null],
  ]);
  assert.equal(steps[2].custom, true);
  const std = build([item("a", "heelsit", { sets: 2 })]);
  assert.notEqual(std[2].custom, true);
});

test("Nachbarschaft: ohne link zwei Blöcke, mit link ein Block", () => {
  const ohne = build([item("a", "heelsit", { sets: 1 }), item("b", "heelsit", { sets: 1 })]);
  assert.equal(ohne.length, 4);
  assert.deepStrictEqual(kinds(ohne), ["next", "next"]);
  assert.deepStrictEqual(Array.from(ohne).filter(s => s.kind === "next").map(s => s.label), ["Mach dich bereit", "Nächste Übung"]);

  const mit = build([item("a", "heelsit", { sets: 1 }, { link: true }), item("b", "heelsit", { sets: 1 })]);
  assert.equal(mit.length, 4);
  assert.deepStrictEqual(kinds(mit), ["next", "link"]);
  assert.deepStrictEqual(rows(mit), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
    ["trans", "link", 120, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
  ]);
  assert.equal(mit[2].label, "Pause · gleich Heel Sit");
});

test("Leere Eingabe: keine Übungen, auch ohne pauses-Feld, wirft nicht", () => {
  assert.deepStrictEqual(rows(h.A.buildSteps({ settings: { confirm: false }, items: [] })), []);
  assert.deepStrictEqual(rows(h.A.buildSteps({ settings: { confirm: false }, pauses: {}, items: [] })), []);
  const eine = h.A.buildSteps({ settings: { confirm: false }, items: [item("a", "heelsit", { sets: 1 })] });
  assert.deepStrictEqual(rows(eine), [
    ["trans", "next", null, 1, null, null],
    ["work", "hold", 60, 1, 0, null],
  ]);
});

test("Reihenfolge: Arbeitsschritte folgen den Übungen, key-Werte sind verschieden und stabil", () => {
  const drei = build([item("z", "heelsit", { sets: 1 }), item("a", "heelsit", { sets: 1 }), item("m", "heelsit", { sets: 1 })]);
  assert.deepStrictEqual(works(drei).map(s => s.uid), ["z", "a", "m"]);

  const gemischt = () => build([
    item("a", "grasshopper", { sets: 2, secs: 30 }, { link: true }),
    item("b", "nervefloss", { sets: 2, reps: 10 }),
    item("c", "drop_out", { secs: 30, sets: 1 }),
    item("d", "heelsit", { sets: 2 }),
    item("e", "heelsit", { sets: 2 }),
  ]);
  const k1 = Array.from(gemischt(), s => s.key), k2 = Array.from(gemischt(), s => s.key);
  assert.equal(new Set(k1).size, k1.length);
  assert.deepStrictEqual(k1, k2);
});

test("Seite für Seite über zwei Sätze: 16 Schritte, uid-, Seiten- und Satz-Folge je Runde", () => {
  const steps = build([
    item("a", "pigeon", { sets: 2, reps: 10 }, { link: true, sf: true }),
    item("b", "rot9090", { sets: 2, reps: 10 }, { um: "Umbau-Text" }),
  ]);
  assert.equal(steps.length, 16);
  const w = works(steps);
  assert.deepStrictEqual(w.map(s => s.uid), ["a", "b", "a", "b", "a", "b", "a", "b"]);
  assert.deepStrictEqual(w.map(s => s.side), [0, 0, 1, 1, 0, 0, 1, 1]);
  assert.deepStrictEqual(w.map(s => s.set), [1, 1, 1, 1, 2, 2, 2, 2]);
});

test("Eigene Pausen in der Seiten-Reihenfolge: Umbau pro Seite und Seitenwechsel überschreibbar, falscher Schlüssel wirkungslos", () => {
  // Umbau-Schlüssel: uid der Übung, vor der der Umbau steht (b, nicht a) – Form: b|umbau|1|0
  const pkUmbauSeite0 = ["b", "umbau", "1", "0"].join("|");
  const pkUmbauSeite1 = ["b", "umbau", "1", "1"].join("|");
  const pkSeitenwechsel = ["a", "side", "1"].join("|");
  const pkFalsch = ["a", "umbau", "1", "0"].join("|"); // uid der ERSTEN Übung – darf keine Wirkung haben
  const steps = build([
    item("a", "pigeon", { sets: 1, reps: 10 }, { link: true, sf: true }),
    item("b", "rot9090", { sets: 1, reps: 10 }, { um: "Umbau-Text" }),
  ], { pauses: { [pkUmbauSeite0]: 5, [pkUmbauSeite1]: 8, [pkSeitenwechsel]: 3, [pkFalsch]: 999 } });
  const umbauSteps = steps.filter(s => s.kind === "umbau");
  assert.equal(umbauSteps.length, 2);
  assert.equal(umbauSteps[0].dur, 5);
  assert.equal(umbauSteps[0].custom, true);
  assert.equal(umbauSteps[1].dur, 8);
  assert.equal(umbauSteps[1].custom, true);
  const sideStep = steps.find(s => s.kind === "side");
  assert.equal(sideStep.dur, 3);
  assert.equal(sideStep.custom, true);
});

test("Gegenprobe ohne Seite für Seite (confirm:true): uid-Folge a,a,b,b je Satz, link-Übergang, kein Umbau", () => {
  const steps = build([
    item("a", "pigeon", { sets: 2, reps: 10 }, { link: true }),
    item("b", "rot9090", { sets: 2, reps: 10 }, { um: "Umbau-Text" }),
  ], { settings: { confirm: true } });
  const w = works(steps);
  assert.deepStrictEqual(w.map(s => s.uid), ["a", "a", "b", "b", "a", "a", "b", "b"]);
  const linkStep = steps.find(s => s.kind === "link");
  assert.notEqual(linkStep, undefined);
  assert.equal(linkStep.dur, 120);
  assert.equal(kinds(steps).includes("umbau"), false);
});

test("Schalter ohne Wirkung: beidseitige Übung im Block (S4) und sf an der zweiten Übung (S6)", () => {
  const s4 = build([
    item("a", "pigeon", { sets: 1, reps: 10 }, { link: true, sf: true }),
    item("b", "heelsit", { secs: 60, sets: 1 }),
  ]);
  assert.equal(s4.length, 4);
  assert.deepStrictEqual(kinds(s4), ["next", "link"]);

  const s6 = build([
    item("a", "pigeon", { sets: 1, reps: 10 }, { link: true }),
    item("b", "rot9090", { sets: 1, reps: 10 }, { sf: true, um: "Umbau-Text" }),
  ], { settings: { confirm: true } });
  assert.equal(s6.length, 8);
  assert.equal(kinds(s6).includes("umbau"), false);
});
