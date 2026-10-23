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


/* ================= foldRounds: gemischte Runden wieder als Supersatz (24.10.2026) =================
   Prüfstein: Der Ablauf vor und nach dem Zusammenfassen muss derselbe sein. Wörtlich identisch kann er nicht sein
   (die Einträge der Folgerunden haben eigene uids, und die Pause zwischen den Runden ist beim Supersatz eine
   „Satzpause“ statt „Pause · gleich …“). Deshalb prüft sameWorkout Schritt für Schritt – und lässt AUSSCHLIESSLICH
   diese Unterschiede zu: Folgerunden-uid → uid der ersten Runde, Satznummer = Runde, kind link → set an der Rundengrenze
   mit dem dazugehörigen Pausen-Schlüssel (pk). Alles andere (Typ, Seite, Modus, Stufe, Dauer, eigene Pause, beide Seiten) muss gleich sein. */
const plain = x => JSON.parse(JSON.stringify(x === undefined ? null : x));
const durOf = s => (s.dur == null ? null : s.dur);

function sameWorkout(unf, fold, order, L) {
  const idx = {};
  order.forEach((u, i) => { idx[u] = i; });
  assert.equal(fold.length, unf.length, "gleiche Zahl an Schritten");
  Array.from(unf).forEach((u, n) => {
    const f = fold[n], i = idx[u.uid], fu = order[i % L], r = Math.floor(i / L) + 1;
    assert.equal(f.type, u.type, "Schritt " + n + ": type");
    assert.equal(f.uid, fu, "Schritt " + n + ": uid");
    assert.equal(durOf(f), durOf(u), "Schritt " + n + ": Dauer");
    if (u.type === "work") {
      assert.equal(f.ex, u.ex, "Schritt " + n + ": Übung");
      assert.equal(f.side, u.side, "Schritt " + n + ": Seite");
      assert.equal(f.mode, u.mode, "Schritt " + n + ": Modus");
      assert.equal(f.stage, u.stage, "Schritt " + n + ": Stufe");
      assert.equal(!!f.both, !!u.both, "Schritt " + n + ": beide Seiten");
      assert.equal(f.set, r, "Schritt " + n + ": Satz = Runde");
      assert.equal(f.o.secs, u.o.secs, "Schritt " + n + ": Sekunden");
      assert.equal(f.o.reps, u.o.reps, "Schritt " + n + ": Wiederholungen");
    } else {
      assert.equal(!!f.custom, !!u.custom, "Schritt " + n + ": eigene Pause");
      if (u.kind === "link") {
        const grenze = i % L === 0;
        assert.equal(f.kind, grenze ? "set" : "link", "Schritt " + n + ": Rundengrenze");
        assert.equal(f.pk, fu + (grenze ? "|set|" : "|link|") + r, "Schritt " + n + ": pk");
        assert.equal(u.pk, u.uid + "|link|1");
      } else {
        assert.equal(f.kind, u.kind, "Schritt " + n + ": kind");
        assert.equal(f.pk, u.pk === undefined ? undefined : fu + "|" + u.pk.split("|")[1] + "|" + r, "Schritt " + n + ": pk");
      }
    }
  });
}

/* baut beide Fassungen: Schritte vor dem Zusammenfassen, dann zusammenfassen, dann Schritte danach */
function fold(mk, o) {
  o = o || {};
  const pz = plain(o.pauses || {}), au = plain(o.audio || {}), ex = { settings: { confirm: !!o.confirm } };
  const unf = build(mk(), Object.assign({ pauses: plain(o.pauses || {}) }, ex));
  const arr = mk();
  const n = h.A.foldRounds(arr, [pz, au], o.skip, o.loose);
  return { n, unf, arr, pz, au, items: plain(arr), fold: build(arr, Object.assign({ pauses: pz }, ex)) };
}
/* Gegenprobe: nichts darf sich ändern – weder Einträge noch Pausen-/Musik-Tabellen */
function bleibt(mk, o) {
  o = o || {};
  const pz = plain(o.pauses || {}), au = plain(o.audio || {}), arr = mk(), vorher = JSON.stringify([plain(arr), pz, au]);
  const n = h.A.foldRounds(arr, [pz, au], o.skip, o.loose);
  assert.equal(n, 0);
  assert.equal(JSON.stringify([plain(arr), pz, au]), vorher);
}

const ohneSeite = steps => Array.from(steps, s => s.kind).filter(k => k && k !== "side");
const GH = { sets: 1, secs: 30 }, NF = { sets: 1, reps: 10 }, HS = { sets: 1 };
const kette4 = () => [
  item("a1", "grasshopper", GH, { link: true, mix: true }), item("b1", "nervefloss", NF, { link: true, mix: true }),
  item("a2", "grasshopper", GH, { link: true, mix: true }), item("b2", "nervefloss", NF, { mix: true }),
];

test("Zusammenfassen: der gemeldete Fall A,B,A,B (je 1 Satz) wird 2 Einträge mit je 2 Sätzen, Ablauf gleich", () => {
  const x = fold(kette4);
  assert.equal(x.n, 1);
  assert.equal(x.unf.length, 12);
  assert.deepStrictEqual(x.items.map(i => [i.uid, i.o.sets, !!i.link, !!i.mix]), [["a1", 2, true, false], ["b1", 2, false, false]]);
  sameWorkout(x.unf, x.fold, ["a1", "b1", "a2", "b2"], 2);
  assert.deepStrictEqual(ohneSeite(x.unf), ["next", "link", "link", "link"]);
  assert.deepStrictEqual(ohneSeite(x.fold), ["next", "link", "set", "link"]);
  assert.deepStrictEqual(works(x.fold).map(s => s.uid), ["a1", "a1", "b1", "a1", "a1", "b1"]);
});

test("Zusammenfassen: Ablauf bleibt auch mit Bestätigung (Seitenwechsel, einseitige Übungen mit Wiederholungen) gleich", () => {
  const mk = () => [
    item("a1", "pigeon", { sets: 1, reps: 10 }, { link: true, mix: true }), item("b1", "grasshopper", GH, { link: true, mix: true }),
    item("a2", "pigeon", { sets: 1, reps: 10 }, { link: true, mix: true }), item("b2", "grasshopper", GH, { mix: true }),
  ];
  [true, false].forEach(confirm => {
    const x = fold(mk, { confirm });
    assert.equal(x.n, 1);
    sameWorkout(x.unf, x.fold, ["a1", "b1", "a2", "b2"], 2);
  });
});

test("Zusammenfassen: Dreier-Runde A,B,C,A,B,C wird 3 Einträge mit je 2 Sätzen", () => {
  const mk = () => [
    item("a1", "grasshopper", GH, { link: true, mix: true }), item("b1", "nervefloss", NF, { link: true, mix: true }), item("c1", "heelsit", HS, { link: true, mix: true }),
    item("a2", "grasshopper", GH, { link: true, mix: true }), item("b2", "nervefloss", NF, { link: true, mix: true }), item("c2", "heelsit", HS, { mix: true }),
  ];
  const x = fold(mk);
  assert.equal(x.n, 1);
  assert.deepStrictEqual(x.items.map(i => [i.uid, i.o.sets, !!i.link, !!i.mix]), [["a1", 2, true, false], ["b1", 2, true, false], ["c1", 2, false, false]]);
  sameWorkout(x.unf, x.fold, ["a1", "b1", "c1", "a2", "b2", "c2"], 3);
});

test("Zusammenfassen: drei Runden A,B,A,B,A,B werden 2 Einträge mit je 3 Sätzen", () => {
  const mk = () => ["a1", "b1", "a2", "b2", "a3", "b3"].map((u, i) => item(u, i % 2 ? "nervefloss" : "grasshopper", i % 2 ? NF : GH, { link: i < 5, mix: true }));
  const x = fold(mk, { confirm: true });
  assert.equal(x.n, 1);
  assert.deepStrictEqual(x.items.map(i => [i.uid, i.o.sets, !!i.link, !!i.mix]), [["a1", 3, true, false], ["b1", 3, false, false]]);
  sameWorkout(x.unf, x.fold, ["a1", "b1", "a2", "b2", "a3", "b3"], 2);
  assert.equal(h.A.foldRounds(x.arr, [], [], false), 0, "ein zweites Mal ändert nichts mehr");
});

test("Zusammenfassen: abweichende Werte in Runde 2 landen als so[2], jeder Satz behält seine Werte", () => {
  const mk = () => {
    const l = kette4();
    l[2].o.secs = 45; // Runde 2: anderes Halten
    l[3].o.reps = 12; // Runde 2: andere Wiederholungen
    return l;
  };
  const x = fold(mk);
  assert.equal(x.n, 1);
  assert.deepStrictEqual(x.items.map(i => i.so), [{ 2: { secs: 45 } }, { 2: { reps: 12 } }]);
  assert.deepStrictEqual([x.items[0].o.secs, x.items[1].o.reps], [30, 10]);
  const w = works(x.fold);
  assert.deepStrictEqual(w.map(s => durOf(s)), works(x.unf).map(s => durOf(s)));
  assert.equal(works(x.unf).find(s => s.uid === "a2" && s.side === 0).dur, 45);
  sameWorkout(x.unf, x.fold, ["a1", "b1", "a2", "b2"], 2);
});

test("Zusammenfassen: eigener Wert am Satz 1 (so[1]) bleibt, ein veralteter so-Eintrag wird nicht lebendig", () => {
  const mk = () => {
    const l = kette4();
    l[0].so = { 1: { secs: 20 }, 2: { secs: 99 } }; // 99 gehört zu einem Satz, den es nicht mehr gibt
    return l;
  };
  const x = fold(mk);
  assert.equal(x.n, 1);
  assert.deepStrictEqual(x.items[0].so, { 1: { secs: 20 } });
  assert.equal(works(x.fold).find(s => s.uid === "a1" && s.set === 2 && s.side === 0).dur, 30);
  sameWorkout(x.unf, x.fold, ["a1", "b1", "a2", "b2"], 2);
});

test("Zusammenfassen: eingestellte Pausen und Musik überleben und wandern an den neuen Schlüssel", () => {
  const pauses = {
    "a2|link|1": 45, "b2|link|1": 15, "a2|side|1": 3, "a1|side|1": 4, // lebendig (Pause vor a2 = Rundengrenze)
    "a1|set|2": 77, "b1|link|2": 88, "w|ignored|1": 5, // vor dem Zusammenfassen wirkungslos, danach würden sie wirken → müssen weg
  };
  const audio = { "a2|link|1": "music", "w|a2|1|0|0": "podcast", "w|b2|1|1|0": "podcast", "w|a1|1|0|0": "podcast", "w|a1|2|0|0": "music", "b2|next": "music" };
  const x = fold(kette4, { pauses, audio, confirm: true });
  assert.equal(x.n, 1);
  assert.deepStrictEqual(x.pz, { "a1|set|2": 45, "b1|link|2": 15, "a1|side|2": 3, "a1|side|1": 4, "w|ignored|1": 5 });
  assert.deepStrictEqual(x.au, { "a1|set|2": "music", "w|a1|2|0|0": "podcast", "w|b1|2|1|0": "podcast", "w|a1|1|0|0": "podcast" });
  sameWorkout(x.unf, x.fold, ["a1", "b1", "a2", "b2"], 2);
  // die eingestellten Zeiten kommen im Ablauf an, mit Markierung „eigene Pause“
  const sp = x.fold.find(s => s.kind === "set");
  assert.deepStrictEqual([sp.dur, sp.custom], [45, true]);
  assert.deepStrictEqual(plain(Array.from(x.fold).filter(s => s.kind === "link").map(s => [s.pk, s.dur, !!s.custom])), [["b1|link|1", 120, false], ["b1|link|2", 15, true]]);
});

test("Gegenprobe: unregelmäßige Anordnung A,B,B,A bleibt unverändert (türkisches Zeichen bleibt)", () => {
  bleibt(() => [
    item("a1", "grasshopper", GH, { link: true, mix: true }), item("b1", "nervefloss", NF, { link: true, mix: true }),
    item("b2", "nervefloss", NF, { link: true, mix: true }), item("a2", "grasshopper", GH, { mix: true }),
  ]);
  bleibt(() => ["a", "b", "c", "b", "a", "c"].map((e, i) => item("u" + i, { a: "grasshopper", b: "nervefloss", c: "heelsit" }[e], { sets: 1 }, { link: i < 5, mix: true })), { pauses: { "u1|link|1": 9 } });
});

test("Gegenprobe: A,B,A ohne vollständige zweite Runde und A,B,A,B,A bleiben unverändert", () => {
  bleibt(() => [
    item("a1", "grasshopper", GH, { link: true, mix: true }), item("b1", "nervefloss", NF, { link: true, mix: true }), item("a2", "grasshopper", GH, { mix: true }),
  ]);
  bleibt(() => ["a1", "b1", "a2", "b2", "a3"].map((u, i) => item(u, i % 2 ? "nervefloss" : "grasshopper", { sets: 1 }, { link: i < 4, mix: true })));
});

test("Gegenprobe: eine übersprungene Übung in der Folge – Eintrag oder Heute-Liste – lässt alles unverändert", () => {
  bleibt(() => { const l = kette4(); l[2].status = "removed"; return l; });
  bleibt(kette4, { skip: ["b2"] });
  const x = fold(kette4, { skip: ["zzz"] });
  assert.equal(x.n, 1, "eine fremde uid in der Heute-Liste stört nicht");
});

test("Gegenprobe: pair, cut, Seite für Seite (sf), gelöscht, mehrere Sätze je Eintrag verhindern das Zusammenfassen", () => {
  bleibt(() => { const l = kette4(); l[1].pair = { ex2: "hfstretch", o2: {}, umbau: "x", name: "P" }; return l; });
  bleibt(() => { const l = kette4(); l[1].cut = 1; return l; });
  bleibt(() => { const l = kette4(); l[0].sf = true; return l; });
  bleibt(() => { const l = kette4(); l[3].deleted = true; return l; });
  bleibt(() => { const l = kette4(); l[2].o.sets = 2; return l; });
  bleibt(() => { const l = kette4(); l[1].off = true; return l; });
});

test("Gegenprobe: ohne durchgehende Verknüpfung oder ohne „gemischt“-Zeichen bleibt es, wie es ist", () => {
  // zwei getrennte Zweier-Blöcke (a1+b1, a2+b2): zwei Supersätze hintereinander, kein Muster zum Falten
  bleibt(() => { const l = kette4(); l[1].link = false; return l; });
  // eine gewöhnliche verknüpfte Kette, die der Nutzer selbst so gebaut hat (nichts verschoben, kein mix)
  bleibt(() => kette4().map(i => { delete i.mix; return i; }));
  // gleiche Übung zweimal in einer Runde
  bleibt(() => ["a", "a", "b", "a", "a", "b"].map((e, i) => item("u" + i, e === "a" ? "grasshopper" : "nervefloss", { sets: 1 }, { link: i < 5, mix: true })));
});

test("Gegenprobe: fehlt in einem späteren Satz ein Wert, den die erste Runde hat, wird nicht zusammengefasst", () => {
  bleibt(() => { const l = kette4(); l[0].o.kg = 20; return l; });
});

test("Zusammenfassen: mehrere Gruppen in einer Liste, Einträge davor, dazwischen und danach bleiben unberührt", () => {
  const mk = () => [
    item("x", "heelsit", HS),
    ...kette4(),
    item("y", "heelsit", HS),
    item("c1", "heelsit", HS, { link: true, mix: true }), item("d1", "camel", { sets: 1, reps: 6 }, { link: true, mix: true }),
    item("c2", "heelsit", HS, { link: true, mix: true }), item("d2", "camel", { sets: 1, reps: 6 }, { mix: true }),
    item("z", "heelsit", HS),
  ];
  const x = fold(mk);
  assert.equal(x.n, 2);
  assert.deepStrictEqual(x.items.map(i => [i.uid, i.o.sets || 1]), [["x", 1], ["a1", 2], ["b1", 2], ["y", 1], ["c1", 2], ["d1", 2], ["z", 1]]);
  const m = { a2: "a1", b2: "b1", c2: "c1", d2: "d1" };
  assert.deepStrictEqual(works(x.unf).map(s => m[s.uid] || s.uid), works(x.fold).map(s => s.uid));
  assert.deepStrictEqual(works(x.unf).map(durOf), works(x.fold).map(durOf));
  assert.deepStrictEqual(works(x.unf).map(s => s.side), works(x.fold).map(s => s.side));
});

test("Unverknüpft gemischt (der Fall aus der Liste): streng bleibt es, loose fasst zusammen – aber der Ablauf ändert sich dabei", () => {
  const mk = () => [
    item("a", "heelsit", HS, { mix: true }), item("b", "grasshopper", GH, { mix: true }),
    item("c", "heelsit", HS, { mix: true }), item("b2", "grasshopper", GH, { mix: true }),
  ];
  bleibt(mk); // Standard: nicht anfassen
  bleibt(() => mk().map(i => { delete i.mix; return i; }), { loose: true }); // ohne „gemischt“ nie
  bleibt(() => { const l = mk(); l[0].link = true; return l; }, { loose: true }); // verknüpft ist nicht „unverknüpft gemischt“
  const x = fold(mk, { loose: true });
  assert.equal(x.n, 1);
  assert.deepStrictEqual(x.items.map(i => [i.uid, i.o.sets, !!i.link, !!i.mix]), [["a", 2, true, false], ["b", 2, false, false]]);
  // gleich: die Arbeitsschritte (Reihenfolge, Seite, Modus, Dauer)
  assert.deepStrictEqual(works(x.unf).map(s => ({ a: "a", b: "b", c: "a", b2: "b" })[s.uid]), works(x.fold).map(s => s.uid));
  assert.deepStrictEqual(works(x.unf).map(durOf), works(x.fold).map(durOf));
  assert.deepStrictEqual(works(x.unf).map(s => s.side), works(x.fold).map(s => s.side));
  // anders – und genau das ist der Grund, warum loose aus ist: Knopf „Nächste Übung“ wird zur Supersatz-Pause
  assert.deepStrictEqual(ohneSeite(x.unf), ["next", "next", "next", "next"]);
  assert.deepStrictEqual(ohneSeite(x.fold), ["next", "link", "set", "link"]);
  assert.equal(h.A.foldRounds(x.arr, [], [], true), 0);
});

/* Pause ohne Zeit (24.10.2026): im Rad ganz unten, unter 0 Sekunden, steht „Weiter per Knopf".
   Gespeichert wird -1; im Ablauf wird daraus dur===null, also derselbe Schritt wie zwischen zwei
   Übungen – man tippt sich weiter, es läuft keine Uhr. */
const sitzung = (items, pauses) => ({ settings: { confirm: false }, pauses: pauses || {}, items });
const satzPause = w => h.A.buildSteps(w).find(s => s.type === "trans" && s.kind === "set");

test("Pause ohne Zeit: gespeicherte -1 wird im Ablauf zu „weiter per Knopf“", () => {
  const items = [item("a", "pigeon", { sets: 2, reps: 10 })];
  const vorher = satzPause(sitzung(items));
  assert.ok(vorher && vorher.dur > 0, "ohne eigene Einstellung läuft eine Uhr");

  const nachher = satzPause(sitzung(items, { [vorher.pk]: -1 }));
  assert.equal(nachher.dur, null, "keine Zeit mehr");
  assert.equal(nachher.custom, true, "zählt als eigene Einstellung");
  assert.equal(nachher.pk, vorher.pk, "gleicher Schlüssel");
});

test("Pause ohne Zeit: 0 Sekunden bleibt 0 und wird NICHT zum Knopf", () => {
  const items = [item("a", "pigeon", { sets: 2, reps: 10 })];
  const pk = satzPause(sitzung(items)).pk;
  assert.equal(satzPause(sitzung(items, { [pk]: 0 })).dur, 0, "0 ist eine echte Pause, kein Knopf");
});

test("Pause ohne Zeit: das Rad bietet den Eintrag an, der Seitenwechsel nicht", () => {
  const A = h.A;
  const rest = A.wheelValues(h.F.EXB.balance, "rest");
  assert.equal(rest[0], -1, "ganz unten im Rad");
  assert.equal(rest[1], 0, "danach kommt 0 s");
  assert.ok(!A.wheelValues(h.F.EXB.balance, "sw").some(v => v < 0), "beim Seitenwechsel gibt es das nicht");
  assert.equal(A.wheelLabel(h.F.EXB.balance, "rest", -1), "Weiter per Knopf");
  assert.equal(A.pauseText(-1), "weiter per Knopf");
});
