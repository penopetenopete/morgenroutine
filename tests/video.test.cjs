/* Tests für den Video-Speicher (eigene Clips pro Übung, IndexedDB "trainingvid").
   Gegen ein einfaches IndexedDB-Doppel; keine echten Videos, nur kleine Blobs. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

/* Minimales IndexedDB-Doppel: Speicher "v" (Clips) und "m" (Marken), Transaktionen melden sich asynchron zurück.
   opts.existing = {version, stores:{name:Map}} bildet eine schon vorhandene Datenbank nach (Aufstieg).
   createObjectStore wirft wie das echte IndexedDB, wenn der Speicher schon existiert. */
function fakeIDB(opts = {}) {
  const ex = opts.existing;
  const stores = new Map(ex ? Object.entries(ex.stores) : []);
  let version = ex ? ex.version : 0;
  const log = { opened: [], stores: [], upgraded: false };
  const later = fn => queueMicrotask(fn);
  const db = {
    objectStoreNames: { contains: n => stores.has(n) },
    createObjectStore(n) {
      if (stores.has(n)) throw new Error("ConstraintError: " + n);
      stores.set(n, new Map()); log.stores.push(n);
    },
    close() {},
    transaction(name) {
      assert.ok(stores.has(name), "Speicher fehlt: " + name);
      const store = stores.get(name);
      const t = {};
      const done = () => later(() => later(() => (opts.failWrite ? t.onabort : t.oncomplete)()));
      t.objectStore = () => ({
        get(k) { done(); return { get result() { return store.get(k); } }; },
        put(v, k) { store.set(k, v); done(); return {}; },
        delete(k) { store.delete(k); done(); return {}; },
        getAllKeys() { done(); return { get result() { return [...store.keys()]; } }; },
      });
      return t;
    },
  };
  return {
    stores, log, get store() { return stores.get("v"); },
    open(name, ver) {
      log.opened.push([name, ver]);
      const r = { result: db };
      later(() => {
        if (ver > version) { log.upgraded = true; if (r.onupgradeneeded) r.onupgradeneeded(); version = ver; }
        if (r.onsuccess) r.onsuccess();
      });
      return r;
    },
  };
}

const blob = t => new Blob([t], { type: "video/mp4" });

test("anlegen, lesen, auflisten, löschen", async () => {
  const h = loadApp();
  const idb = fakeIDB();
  h.ctx.indexedDB = idb;
  const v = h.A.vid;
  assert.equal(await v.get("squat"), null);
  assert.equal(await v.put("squat", blob("abc")), true);
  assert.equal(await v.put("lunge", blob("xyz")), true);
  const got = await v.get("squat");
  assert.ok(got && got.size === 3);
  assert.deepEqual([...(await v.has())].sort(), ["lunge", "squat"]);
  assert.equal(await v.del("squat"), true);
  assert.equal(await v.get("squat"), null);
  assert.deepEqual([...(await v.has())], ["lunge"]);
  assert.deepEqual(idb.log.opened[0], ["trainingvid", 2]);
  assert.deepEqual(idb.log.stores, ["v", "m"]);
});

test("ohne IndexedDB: alles still leer, nichts wirft", async () => {
  const h = loadApp(); // Harness setzt indexedDB auf undefined
  const v = h.A.vid;
  assert.equal(await v.get("squat"), null);
  assert.equal(await v.put("squat", blob("a")), false);
  assert.equal(await v.del("squat"), false);
  assert.equal((await v.has()).size, 0);
});

test("Schreibfehler (z. B. Speicher voll): put meldet false", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB({ failWrite: true });
  assert.equal(await h.A.vid.put("squat", blob("a")), false);
});

test("Öffnen wirft: kein Bruch", async () => {
  const h = loadApp();
  h.ctx.indexedDB = { open() { throw new Error("gesperrt"); } };
  assert.equal(await h.A.vid.put("squat", blob("a")), false);
  assert.equal((await h.A.vid.has()).size, 0);
});

test("sync: Übungen mit Clip landen in der Merkmenge", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const ex = h.F.EX[0].id;
  await h.A.vid.put(ex, blob("a"));
  await h.A.vid.sync();
  assert.ok(h.A.vid.ids().has(ex));
});

test("Marke: setzen, lesen, überschreiben, löschen; ohne Eintrag null", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const v = h.A.vid;
  assert.equal(await v.markGet("squat"), null);
  assert.equal(await v.markPut("squat", 2, 7), true);
  assert.deepEqual({ ...(await v.markGet("squat")) }, { a: 2, b: 7 });
  assert.equal(await v.markPut("squat", 3, 8), true);
  assert.deepEqual({ ...(await v.markGet("squat")) }, { a: 3, b: 8 });
  assert.equal(await v.markDel("squat"), true);
  assert.equal(await v.markGet("squat"), null);
});

test("Marke verschwindet mit dem Clip; Marken anderer Übungen bleiben", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const v = h.A.vid;
  await v.put("squat", blob("abc"));
  await v.put("lunge", blob("xyz"));
  await v.markPut("squat", 1, 5);
  await v.markPut("lunge", 2, 6);
  assert.equal(await v.del("squat"), true);
  assert.equal(await v.markGet("squat"), null);
  assert.deepEqual({ ...(await v.markGet("lunge")) }, { a: 2, b: 6 });
});

test("Kaputte Marke im Speicher zählt als keine Marke (ganzer Clip)", async () => {
  const h = loadApp();
  const idb = fakeIDB();
  h.ctx.indexedDB = idb;
  await h.A.vid.markPut("squat", 1, 2);
  idb.stores.get("m").set("squat", "kaputt");
  assert.equal(await h.A.vid.markGet("squat"), null);
});

test("Aufstieg Version 1 auf 2: vorhandener Clip in v bleibt, m kommt neu dazu", async () => {
  const h = loadApp();
  const clip = blob("echter clip");
  const idb = fakeIDB({ existing: { version: 1, stores: { v: new Map([["squat", clip]]) } } });
  h.ctx.indexedDB = idb;
  const got = await h.A.vid.get("squat");
  assert.ok(got === clip, "Clip nach dem Aufstieg weg");
  assert.equal(idb.log.upgraded, true);
  assert.deepEqual(idb.log.stores, ["m"], "v darf nicht angefasst, nur m angelegt werden");
  assert.deepEqual([...(await h.A.vid.has())], ["squat"]);
  assert.equal(await h.A.vid.markGet("squat"), null);
  assert.equal(await h.A.vid.markPut("squat", 1, 4), true);
  assert.ok((await h.A.vid.get("squat")) === clip);
});

test("Datenbank ist schon auf Version 2: kein Aufstieg, nichts wird neu angelegt", async () => {
  const h = loadApp();
  const clip = blob("clip");
  const idb = fakeIDB({ existing: { version: 2, stores: { v: new Map([["squat", clip]]), m: new Map([["squat", { a: 1, b: 3 }]]) } } });
  h.ctx.indexedDB = idb;
  assert.ok((await h.A.vid.get("squat")) === clip);
  assert.deepEqual({ ...(await h.A.vid.markGet("squat")) }, { a: 1, b: 3 });
  assert.equal(idb.log.upgraded, false);
});

test("Grenzen: stufenlos, a nie unter 0, b nie über die Länge, Mindestabstand 0,5 s", () => {
  const h = loadApp();
  const c = (...a) => [...h.A.vid.markClamp(...a)];
  assert.deepEqual(c(0, 10, 10, "a", -1), [0, 10]);
  assert.deepEqual(c(2, 10, 10, "a", 1.37), [1.37, 10]); // keine Sekundenschritte
  assert.deepEqual(c(2, 10, 10, "a", 12), [9.5, 10]);
  assert.deepEqual(c(0, 10, 10, "b", 11), [0, 10]);
  assert.deepEqual(c(0, 10, 10, "b", 0), [0, 0.5]);
  assert.deepEqual(c(4, 8, 10, "b", 4.2), [4, 4.5]);
  assert.deepEqual(c(4, 8, 10, "b", 6.25), [4, 6.25]);
  assert.deepEqual(c(0, 0.5, 0.5, "a", 1), [0, 0.5]); // zu kurzer Clip: nichts ändert sich
  assert.equal(h.A.vid.markTime(75), "1:15");
  assert.equal(h.A.vid.markTime(5.9), "0:05");
});

/* Vorschlag aus dem Katalog (EXB[id].trim) */
test("Vorschlag: ohne eigene Marke gilt trim, mit eigener Marke gilt die eigene", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  h.F.EXB.splitsquat.trim = [2, 6.5];
  const v = h.A.vid;
  assert.deepEqual({ ...(await v.markGet("splitsquat")) }, { a: 2, b: 6.5 });
  await v.markPut("splitsquat", 3, 5);
  assert.deepEqual({ ...(await v.markGet("splitsquat")) }, { a: 3, b: 5 });
  await v.markDel("splitsquat"); // Zurücksetzen = Vorschlag, nicht ganzer Clip
  assert.deepEqual({ ...(await v.markGet("splitsquat")) }, { a: 2, b: 6.5 });
});

test("Vorschlag fehlt oder ist unbrauchbar: ganzer Clip (null)", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const e = h.F.EXB.splitsquat;
  const v = h.A.vid;
  for (const t of [undefined, null, [], [3], [5, 5.2], [5, 2], [-1, 4], ["1", "4"], [1, NaN], "kaputt"]) {
    e.trim = t;
    assert.equal(await v.markGet("splitsquat"), null, "trim=" + JSON.stringify(t));
  }
});

test("Vorschlag und Aufstieg: gespeicherte Marke und Clip bleiben unberührt", async () => {
  const h = loadApp();
  h.F.EXB.splitsquat.trim = [1, 4];
  const clip = blob("echter clip");
  const idb = fakeIDB({ existing: { version: 2, stores: { v: new Map([["splitsquat", clip]]), m: new Map([["splitsquat", { a: 5, b: 9 }]]) } } });
  h.ctx.indexedDB = idb;
  assert.deepEqual({ ...(await h.A.vid.markGet("splitsquat")) }, { a: 5, b: 9 });
  assert.ok((await h.A.vid.get("splitsquat")) === clip);
  assert.equal(idb.log.upgraded, false);
});

/* Sheet-Verhalten: kleine Doppel für Video, Griffe und Dokument; Zeitgeber laufen von Hand */
function fakeNode() {
  const cls = new Set(), ev = {};
  return {
    style: {}, textContent: "", onclick: null, clientWidth: 300, clientHeight: 56,
    classList: {
      add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, contains(c) { return cls.has(c); },
      toggle(c, on) { const w = on === undefined ? !cls.has(c) : !!on; if (w) cls.add(c); else cls.delete(c); return w; },
    },
    addEventListener(n, f) { (ev[n] = ev[n] || []).push(f); },
    emit(n, e = {}) { (ev[n] || []).slice().forEach(f => f(e)); },
    getBoundingClientRect() { return { width: 300, left: 0 }; },
  };
}
function fakeSheet(h, dur) {
  const vd = fakeNode();
  Object.assign(vd, { duration: dur, readyState: 1, currentTime: 0, paused: true, seeking: false, plays: 0, sets: [] });
  let t = 0;
  Object.defineProperty(vd, "currentTime", { get() { return t; }, set(v) { t = v; vd.sets.push(v); } });
  vd.play = function () { this.paused = false; this.plays++; this.emit("play"); return Promise.resolve(); };
  vd.pause = function () { if (this.paused) return; this.paused = true; this.emit("pause"); };
  const n = {};
  ["#mka", "#mkb", "#mkReset", "#trimIn", "#trimA", "#trimB", "#trimL", "#trimR", "#trimF", "#trimPos", "#vidPlay", "#vidWrap", "#trim"].forEach(s => { n[s] = fakeNode(); });
  const body = { querySelector: s => n[s] || null };
  /* Dokument: Lauscher mitzählen, Ereignisse von Hand auslösen */
  const dl = {};
  h.ctx.document.addEventListener = (k, f) => { (dl[k] = dl[k] || new Set()).add(f); };
  h.ctx.document.removeEventListener = (k, f) => { if (dl[k]) dl[k].delete(f); };
  const doc = (k, e) => [...(dl[k] || [])].forEach(f => f(e));
  const count = () => Object.values(dl).reduce((s, x) => s + x.size, 0);
  return { vd, n, body, doc, count };
}
function setup(dur) {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const timers = [];
  h.ctx.setTimeout = fn => timers.push(fn);
  h.ctx.clearTimeout = () => {};
  return { h, timers, s: fakeSheet(h, dur) };
}

test("Sheet: öffnet auf dem ganzen Clip und spielt vom Anfang; Griffe stehen an den Rändern", () => {
  const { h, s } = setup(10);
  h.A.vid.markBind(s.body, s.vd, "squat", null);
  assert.equal(s.vd.currentTime, 0);
  assert.equal(s.vd.plays, 1);
  assert.equal(s.n["#mka"].textContent, "0:00");
  assert.equal(s.n["#mkb"].textContent, "0:10");
  assert.equal(s.n["#trimB"].style.left, "100%");
  assert.ok(s.n["#trim"].classList.contains("rdy"));
});

test("Ziehen am Anfangsgriff: Bild folgt sofort, Video hält an, nach dem Loslassen läuft es ab dem Anfang", async () => {
  const { h, timers, s } = setup(10);
  const v = h.A.vid;
  v.markBind(s.body, s.vd, "squat", null);
  const a = s.n["#trimA"];
  a.emit("pointerdown", { pointerId: 1, clientX: 0 });
  assert.equal(s.vd.paused, true, "beim Ziehen steht das Video");
  assert.ok(a.classList.contains("drag"));
  s.doc("pointermove", { pointerId: 1, clientX: 90 }); // 300 px = 10 s -> +3 s
  assert.equal(s.vd.currentTime, 3, "Bild am Anfang der Auswahl");
  assert.equal(s.n["#mka"].textContent, "0:03");
  s.doc("pointermove", { pointerId: 1, clientX: 91.5 });
  assert.equal(s.vd.currentTime, 3.05, "stufenlos, nicht in Sekunden");
  s.doc("pointermove", { pointerId: 2, clientX: 250 }); // fremder Finger zählt nicht
  assert.equal(s.vd.currentTime, 3.05);
  assert.equal(timers.length, 0, "während des Ziehens wird nichts geschrieben");
  const plays = s.vd.plays;
  s.doc("pointerup", { pointerId: 1 });
  assert.ok(!a.classList.contains("drag"));
  assert.equal(s.vd.currentTime, 3.05, "läuft ab dem Anfang");
  assert.equal(s.vd.plays, plays + 1);
  assert.equal(s.vd.paused, false);
  assert.equal(s.count(), 0, "Zeiger-Lauscher werden wieder entfernt");
  v.markFlush();
  assert.deepEqual({ ...(await v.markGet("squat")) }, { a: 3.05, b: 10 });
});

test("Ziehen am Endgriff: Bild am Ende der Auswahl; Mindestabstand; am Ende halten und schwarz", () => {
  const { h, s } = setup(10);
  const v = h.A.vid;
  v.markBind(s.body, s.vd, "squat", null);
  const b = s.n["#trimB"];
  b.emit("pointerdown", { pointerId: 1, clientX: 300 });
  s.doc("pointermove", { pointerId: 1, clientX: 150 }); // -5 s
  assert.equal(s.vd.currentTime, 5, "Bild am Ende der Auswahl");
  assert.equal(s.n["#mkb"].textContent, "0:05");
  s.doc("pointermove", { pointerId: 1, clientX: -500 }); // weit nach links: Ende bleibt 0,5 s hinter dem Anfang
  assert.equal(s.vd.currentTime, 0.5);
  s.doc("pointermove", { pointerId: 1, clientX: 150 });
  s.doc("pointerup", { pointerId: 1 });
  assert.equal(s.vd.currentTime, 4, "Endgriff: beginnt eine Sekunde vor dem Ende, nicht am Anfang");
  assert.equal(s.vd.paused, false);
  /* kurz vor dem Ende: bleibt laufen; am Ende: anhalten, nicht zurückspringen, Bild schwarz */
  s.vd.currentTime = 4.9; s.vd.emit("timeupdate");
  assert.equal(s.vd.paused, false);
  assert.ok(!s.vd.classList.contains("end"));
  s.vd.currentTime = 5.01; s.vd.emit("timeupdate");
  assert.equal(s.vd.paused, true);
  assert.equal(s.vd.currentTime, 5.01, "kein Zurückspringen");
  assert.ok(s.vd.classList.contains("end"), "Bild bleibt schwarz");
  /* erneutes Abspielen startet wieder beim Anfang, Bild wieder da */
  const plays = s.vd.plays;
  s.n["#vidPlay"].onclick();
  assert.equal(s.vd.currentTime, 0);
  assert.equal(s.vd.plays, plays + 1);
  assert.ok(!s.vd.classList.contains("end"));
  /* Antippen während des Laufs hält an */
  s.n["#vidPlay"].onclick();
  assert.equal(s.vd.paused, true);
  assert.ok(!s.vd.classList.contains("end"));
});

test("Positionsregler ziehen: Abspielstelle folgt, bleibt im gewählten Bereich, Marken unverändert", () => {
  const { h, s } = setup(10);
  const v = h.A.vid;
  v.markBind(s.body, s.vd, "squat", { a: 2, b: 8 });
  const pos = s.n["#trimPos"];
  const mka = s.n["#mka"].textContent, mkb = s.n["#mkb"].textContent;
  pos.emit("pointerdown", { pointerId: 2, clientX: 300 });
  assert.equal(s.vd.paused, true, "beim Ziehen steht das Bild");
  s.doc("pointermove", { pointerId: 2, clientX: 330 }); // +1 s
  assert.equal(s.vd.currentTime, 3, "Bild folgt dem Regler");
  s.doc("pointermove", { pointerId: 2, clientX: -500 }); // weit nach links
  assert.equal(s.vd.currentTime, 2, "nicht vor den Anfang");
  s.doc("pointermove", { pointerId: 2, clientX: 900 }); // weit nach rechts
  assert.equal(s.vd.currentTime, 8, "nicht hinter das Ende");
  s.doc("pointerup", { pointerId: 2 });
  assert.equal(s.vd.paused, true, "nach dem Loslassen bleibt es stehen");
  assert.equal(s.n["#mka"].textContent, mka, "Anfang unverändert");
  assert.equal(s.n["#mkb"].textContent, mkb, "Ende unverändert");
});

test("Antippen der Leiste springt an die Stelle, innerhalb des Bereichs", () => {
  const { h, s } = setup(10);
  h.A.vid.markBind(s.body, s.vd, "squat", { a: 2, b: 8 });
  const leiste = s.n["#trimIn"];
  leiste.emit("pointerdown", { pointerId: 3, clientX: 120, target: leiste });
  assert.equal(s.vd.currentTime, 4, "springt an die angetippte Stelle");
  s.doc("pointerup", { pointerId: 3 });
  leiste.emit("pointerdown", { pointerId: 4, clientX: 0, target: leiste });
  assert.equal(s.vd.currentTime, 2, "vor dem Anfang wird auf den Anfang begrenzt");
  s.doc("pointerup", { pointerId: 4 });
});

test("Ziehen: bis ganz ans Ende des Clips (ended-Ereignis) hält an und bleibt schwarz", () => {
  const { h, s } = setup(10);
  h.A.vid.markBind(s.body, s.vd, "squat", null);
  s.vd.currentTime = 10; s.vd.emit("ended");
  assert.equal(s.vd.paused, true);
  assert.ok(s.vd.classList.contains("end"));
  assert.equal(s.vd.currentTime, 10);
});

test("Ziehen: nur die jüngste Stelle wird angesprungen, solange das Video noch sucht", () => {
  const { h, s } = setup(10);
  h.A.vid.markBind(s.body, s.vd, "squat", null);
  s.n["#trimA"].emit("pointerdown", { pointerId: 1, clientX: 0 });
  s.vd.seeking = true;
  const n0 = s.vd.sets.length;
  s.doc("pointermove", { pointerId: 1, clientX: 30 });
  s.doc("pointermove", { pointerId: 1, clientX: 60 });
  s.doc("pointermove", { pointerId: 1, clientX: 90 });
  assert.equal(s.vd.sets.length, n0, "keine Zwischenstellen während des Suchens");
  s.vd.seeking = false; s.vd.emit("seeked");
  assert.equal(s.vd.currentTime, 3);
  assert.equal(s.vd.sets.length, n0 + 1);
});

test("Ziehen: Marke wird entprellt gespeichert (einmal), ganzer Clip ohne Vorschlag löscht die Marke", async () => {
  const { h, timers, s } = setup(10);
  const v = h.A.vid;
  v.markBind(s.body, s.vd, "squat", null);
  const a = s.n["#trimA"];
  a.emit("pointerdown", { pointerId: 1, clientX: 0 });
  s.doc("pointermove", { pointerId: 1, clientX: 60 });
  s.doc("pointerup", { pointerId: 1 });
  assert.equal(timers.length, 1);
  assert.equal(await v.markGet("squat"), null);
  v.markFlush();
  assert.deepEqual({ ...(await v.markGet("squat")) }, { a: 2, b: 10 });
  /* zurück auf ganz: kein Eintrag mehr */
  a.emit("pointerdown", { pointerId: 3, clientX: 60 });
  s.doc("pointermove", { pointerId: 3, clientX: -100 });
  s.doc("pointerup", { pointerId: 3 });
  v.markFlush();
  assert.equal(await v.markGet("squat"), null);
});

test("Zurücksetzen: ohne Vorschlag ganzer Clip, mit Vorschlag der Vorschlag", async () => {
  const { h, s } = setup(10);
  const v = h.A.vid;
  v.markBind(s.body, s.vd, "squat", { a: 3, b: 7 });
  assert.equal(s.n["#mka"].textContent, "0:03");
  assert.equal(s.vd.currentTime, 3);
  s.n["#mkReset"].onclick();
  assert.equal(s.n["#mka"].textContent, "0:00");
  assert.equal(s.n["#mkb"].textContent, "0:10");
  assert.equal(s.vd.currentTime, 0);
  await new Promise(r => setImmediate(r));
  assert.equal(await v.markGet("squat"), null);

  const t = setup(10);
  t.h.F.EXB.splitsquat.trim = [2, 6];
  await t.h.A.vid.markPut("splitsquat", 4, 9);
  t.h.A.vid.markBind(t.s.body, t.s.vd, "splitsquat", { a: 4, b: 9 });
  t.s.n["#mkReset"].onclick();
  assert.equal(t.s.n["#mka"].textContent, "0:02");
  assert.equal(t.s.n["#mkb"].textContent, "0:06");
  assert.equal(t.s.vd.currentTime, 2);
  await new Promise(r => setImmediate(r));
  assert.deepEqual({ ...(await t.h.A.vid.markGet("splitsquat")) }, { a: 2, b: 6 });
});

test("Vorschlag und ganzer Clip: bewusst auf ganz gestellte Marke bleibt erhalten", async () => {
  const { h, s } = setup(10);
  h.F.EXB.splitsquat.trim = [2, 6];
  const v = h.A.vid;
  v.markBind(s.body, s.vd, "splitsquat", { a: 2, b: 6 });
  s.n["#trimA"].emit("pointerdown", { pointerId: 1, clientX: 60 });
  s.doc("pointermove", { pointerId: 1, clientX: -100 });
  s.doc("pointerup", { pointerId: 1 });
  s.n["#trimB"].emit("pointerdown", { pointerId: 2, clientX: 180 });
  s.doc("pointermove", { pointerId: 2, clientX: 900 });
  s.doc("pointerup", { pointerId: 2 });
  v.markFlush();
  assert.deepEqual({ ...(await v.markGet("splitsquat")) }, { a: 0, b: 10 });
});

test("Sheet: gespeicherte Marke wird beim Öffnen angesprungen; Marke außerhalb der Länge = ganzer Clip", () => {
  const { h, s } = setup(20);
  h.A.vid.markBind(s.body, s.vd, "squat", { a: 3, b: 12 });
  assert.equal(s.vd.currentTime, 3);
  assert.equal(s.n["#mkb"].textContent, "0:12");
  const u = setup(5);
  u.h.A.vid.markBind(u.s.body, u.s.vd, "squat", { a: 8, b: 30 });
  assert.equal(u.s.vd.currentTime, 0);
  assert.equal(u.s.n["#mkb"].textContent, "0:05");
});

test("Sheet: Länge erst nach den Metadaten bekannt; vorher tut kein Griff etwas", () => {
  const { h, s } = setup(10);
  s.vd.readyState = 0; s.vd.duration = NaN;
  h.A.vid.markBind(s.body, s.vd, "squat", null);
  s.n["#trimA"].emit("pointerdown", { pointerId: 1, clientX: 0 });
  assert.equal(s.count(), 0);
  s.vd.duration = 10; s.vd.emit("loadedmetadata");
  assert.equal(s.vd.plays, 1);
  s.n["#trimA"].emit("pointerdown", { pointerId: 1, clientX: 0 });
  assert.equal(s.count(), 3);
});

test("Aufräumen: Zeiger-Lauscher weg, Video angehalten", () => {
  const { h, s } = setup(10);
  const off = h.A.vid.markBind(s.body, s.vd, "squat", null);
  s.n["#trimB"].emit("pointerdown", { pointerId: 1, clientX: 300 });
  assert.equal(s.count(), 3);
  off();
  assert.equal(s.count(), 0);
  assert.equal(s.vd.paused, true);
});
test("Alle zwölf Squat-University-Übungen haben das Feld trim (ohne Zahlen: null = ganzer Clip)", () => {
  const h = loadApp();
  const su = h.F.EX.filter(e => e.src === "Squat University");
  assert.equal(su.length, 12);
  su.forEach(e => assert.ok("trim" in e, e.id + " ohne trim"));
  su.forEach(e => assert.ok(e.trim === null || (Array.isArray(e.trim) && e.trim.length === 2), e.id));
});


/* ---- Video in der Trainingsansicht (Bühne: Figur oder Clip) ---- */
const tick = () => new Promise(r => setImmediate(r));
async function tvSetup(withClip = true) {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  h.el("player").hidden = true; // size() braucht hier keine echte Bühne
  const v = h.el("tvVid");
  Object.assign(v, { paused: true, duration: 12, currentTime: 0, seeking: false });
  v.plays = 0; v.pauses = 0;
  v.play = () => { v.paused = false; v.plays++; return Promise.resolve(); };
  v.pause = () => { v.paused = true; v.pauses++; };
  if (withClip) await h.A.vid.put("splitsquat", blob("clip"));
  await h.A.vid.sync();
  return { h, v, tv: h.A.tv };
}

test("Bühne: das Symbol erscheint nur, wenn die laufende Übung einen Clip hat", async () => {
  const { h, tv } = await tvSetup();
  tv.step("splitsquat", false);
  assert.equal(h.el("swFig").hidden, false);
  tv.step("lunge", false);
  assert.equal(h.el("swFig").hidden, true);
  tv.step("splitsquat", false);
  assert.equal(h.el("swFig").hidden, false);
});

test("Bühne: Symbol schaltet um (Figur weg, Video da), nochmal zurück; Video lädt und startet an der Marke", async () => {
  const { h, v, tv } = await tvSetup();
  tv.step("splitsquat", false);
  await h.A.vid.markPut("splitsquat", 3, 8);
  h.el("swFig").onclick({ stopPropagation() {} });
  assert.equal(tv.state.on, true);
  assert.equal(h.el("stage").hidden, true);
  assert.equal(h.el("stagevid").hidden, false);
  await tick(); await tick(); await tick();
  tv.meta();
  assert.equal(tv.state.dur, 12);
  assert.equal(v.currentTime, 3, "beginnt an der Marke");
  assert.equal(v.plays, 1);
  h.el("swVid").onclick({ stopPropagation() {} });
  assert.equal(tv.state.on, false);
  assert.equal(h.el("stage").hidden, false);
  assert.equal(h.el("stagevid").hidden, true);
  assert.equal(v.paused, true, "Video hält an");
});

test("Bühne: ein Tipp auf die Fläche schaltet nie um (weder Figur noch Video), er weckt nur die Bedienung", async () => {
  const { h, tv } = await tvSetup();
  tv.step("splitsquat", false);
  tv.wake();
  assert.equal(tv.state.on, false);
  assert.equal(h.el("stage").hidden, false);
  tv.mode(true);
  tv.wake();
  assert.equal(tv.state.on, true);
  /* Im Quelltext hängt an Bühne und Videofläche kein Klick-Handler, der umschaltet */
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "app.js"), "utf8");
  assert.ok(!/\$\("stage(vid)?"\)\.(onclick|ondblclick|ontouchend)/.test(src));
  assert.ok(!/\$\("stage(vid)?"\)\.addEventListener\("(click|dblclick|touchend|pointerup)"/.test(src));
});

test("Bühne: Übungswechsel und Zwischenseite zurück auf die Figur, Video angehalten", async () => {
  const { h, v, tv } = await tvSetup();
  tv.step("splitsquat", false);
  tv.mode(true);
  v.paused = false;
  tv.step("splitsquat", false); // gleiche Übung (nächster Satz): bleibt
  assert.equal(tv.state.on, true);
  tv.step("heelsit", false);
  assert.equal(tv.state.on, false);
  assert.equal(h.el("stage").hidden, false);
  assert.equal(v.paused, true);
  tv.step("splitsquat", false);
  tv.mode(true);
  tv.step("splitsquat", true); // Zwischenseite
  assert.equal(tv.state.on, false);
  tv.mode(true);
  tv.reset(); // Workout beginnt oder endet
  assert.equal(tv.state.on, false);
  assert.equal(tv.state.ex, "");
  assert.equal(h.el("swFig").hidden, true);
});

test("Bühne: Video läuft zwischen den Marken in Schleife", async () => {
  const { h, v, tv } = await tvSetup();
  tv.step("splitsquat", false);
  await h.A.vid.markPut("splitsquat", 2, 6);
  tv.mode(true);
  await tick(); await tick(); await tick();
  tv.meta();
  assert.equal(v.currentTime, 2);
  v.paused = false; v.currentTime = 5.5; tv.tick();
  assert.equal(v.currentTime, 5.5);
  v.currentTime = 5.99; tv.tick();
  assert.equal(v.currentTime, 2, "springt zum Anfang zurück");
  v.paused = true; v.currentTime = 6.5; tv.tick();
  assert.equal(v.currentTime, 6.5, "angehaltenes Video bleibt stehen");
});

test("Bühne: ohne Marke läuft der ganze Clip; Vorschlag aus dem Katalog gilt, wenn vorhanden", async () => {
  const { h, v, tv } = await tvSetup();
  tv.step("splitsquat", false);
  tv.mode(true);
  await tick(); await tick(); await tick();
  tv.meta();
  assert.equal(tv.state.a, 0);
  assert.equal(tv.state.b, 12);
  tv.mode(false);
  h.F.EXB.splitsquat.trim = [1.5, 4];
  tv.mode(true);
  await tick(); await tick(); await tick();
  tv.meta();
  assert.equal(tv.state.a, 1.5);
  assert.equal(tv.state.b, 4);
  assert.equal(v.currentTime, 1.5);
});

test("Bühne: verschwindet der Clip (im Sheet entfernt), geht es zurück zur Figur", async () => {
  const { h, tv } = await tvSetup();
  tv.step("splitsquat", false);
  tv.mode(true);
  await h.A.vid.del("splitsquat");
  await h.A.vid.sync();
  assert.equal(tv.state.on, false);
  assert.equal(h.el("swFig").hidden, true);
  assert.equal(h.el("stage").hidden, false);
});

test("Bühne: Sheet öffnen hält das Video an; beim Schließen wird neu geladen", async () => {
  const { h, v, tv } = await tvSetup();
  tv.step("splitsquat", false);
  tv.mode(true);
  v.paused = false;
  tv.hold();
  assert.equal(v.paused, true);
  const tok = tv.state.tok;
  tv.back();
  assert.ok(tv.state.tok > tok);
  tv.mode(false);
  const t2 = tv.state.tok;
  tv.back(); // Figur zeigt: nichts zu laden
  assert.equal(tv.state.tok, t2);
});

/* ---- Clips aus einem Ordner auf einmal zuordnen ---- */
const vfile = n => ({ name: n, type: "video/mp4" });

test("Zuordnen: Dateiname trifft die Übung, Umlaut ausgeschrieben wie mit Umlaut", () => {
  const h = loadApp();
  const m = h.A.vid.match;
  assert.equal(m("Hip Hike.mp4"), "hiphike");
  assert.equal(m("Einbeinige Bruecke mit Band.mp4"), "sglbridgeband");
  assert.equal(m("Einbeinige Brücke mit Band.mov"), "sglbridgeband");
  assert.equal(m("01 Spanish Squat.mp4"), "spanishsquat");
  assert.equal(m("sglbridgeband.mp4"), "sglbridgeband", "auch die Übungs-ID als Dateiname");
});

test("Zuordnen: unbekannter Name bleibt ohne Treffer", () => {
  const h = loadApp();
  assert.equal(h.A.vid.match("IMG_4711.mp4"), null);
  assert.equal(h.A.vid.match("a.mp4"), null);
});

test("Zuordnen: Clips landen bei den Übungen, Unerkanntes wird gemeldet", async () => {
  const h = loadApp();
  const idb = fakeIDB();
  h.ctx.indexedDB = idb;
  const v = h.A.vid;
  const r = await v.assign([vfile("Hip Thrust.mp4"), vfile("Split Squat.mp4"), vfile("Urlaub.mp4")]);
  assert.equal(r.ok.map(x => x[1]).join(","), "hipthrust,splitsquat");
  assert.equal(r.miss.join(","), "Urlaub.mp4");
  assert.ok(await v.get("hipthrust"), "Clip liegt in der Datenbank");
  assert.ok(v.ids().has("splitsquat"), "Symbol färbt nach");
});

test("Zuordnen: zweite Datei für dieselbe Übung zählt nicht", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const r = await h.A.vid.assign([vfile("Hip Hike.mp4"), vfile("hiphike.mp4")]);
  assert.equal(r.ok.map(x => x[1]).join(","), "hiphike");
  assert.equal(r.miss.join(","), "hiphike.mp4");
});

test("Zuordnen: alte Marke fällt weg, der Vorschlag aus dem Katalog gilt wieder", async () => {
  const h = loadApp();
  h.ctx.indexedDB = fakeIDB();
  const v = h.A.vid;
  await v.markPut("spanishsquat", 3, 9);
  assert.equal(JSON.stringify(await v.markGet("spanishsquat")), '{"a":3,"b":9}');
  await v.assign([vfile("Spanish Squat.mp4")]);
  const mk = await v.markGet("spanishsquat");
  assert.notEqual(JSON.stringify(mk), '{"a":3,"b":9}', "nicht mehr die eigene Marke");
  assert.equal(JSON.stringify(mk), '{"a":15,"b":31}', "stattdessen der Vorschlag aus dem Katalog");
});
