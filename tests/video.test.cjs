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
  assert.equal(s.vd.currentTime, 0, "läuft ab dem Anfang");
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
