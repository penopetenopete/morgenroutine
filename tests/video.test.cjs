/* Tests für den Video-Speicher (eigene Clips pro Übung, IndexedDB "trainingvid").
   Gegen ein einfaches IndexedDB-Doppel; keine echten Videos, nur kleine Blobs. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./harness.cjs");

/* Minimales IndexedDB-Doppel: ein Store "v", Transaktionen melden sich asynchron zurück */
function fakeIDB(opts = {}) {
  const store = new Map();
  const log = { opened: [], stores: [] };
  const later = fn => queueMicrotask(fn);
  const db = {
    createObjectStore(n) { log.stores.push(n); },
    close() {},
    transaction(name) {
      assert.equal(name, "v");
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
    store, log,
    open(name, ver) {
      log.opened.push([name, ver]);
      const r = { result: db };
      later(() => { if (r.onupgradeneeded) r.onupgradeneeded(); if (r.onsuccess) r.onsuccess(); });
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
  assert.deepEqual(idb.log.opened[0], ["trainingvid", 1]);
  assert.deepEqual(idb.log.stores, ["v"]);
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
