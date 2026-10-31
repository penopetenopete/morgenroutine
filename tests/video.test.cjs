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

test("Grenzen: a nie unter 0, b nie über die Länge, a mindestens 1 s vor b", () => {
  const h = loadApp();
  const c = (...a) => [...h.A.vid.markClamp(...a)];
  assert.deepEqual(c(0, 10, 10, "a", -1), [0, 10]);
  assert.deepEqual(c(2, 10, 10, "a", 1), [1, 10]);
  assert.deepEqual(c(2, 10, 10, "a", 12), [9, 10]);
  assert.deepEqual(c(0, 10, 10, "b", 11), [0, 10]);
  assert.deepEqual(c(0, 10, 10, "b", 0), [0, 1]);
  assert.deepEqual(c(4, 8, 10, "b", 5), [4, 5]);
  assert.deepEqual(c(4, 8, 10, "b", 3), [4, 5]);
  assert.deepEqual(c(0, 0.5, 0.5, "a", 1), [0, 0.5]); // zu kurzer Clip: nichts ändert sich
  assert.equal(h.A.vid.markTime(75), "1:15");
  assert.equal(h.A.vid.markTime(5.9), "0:05");
});
