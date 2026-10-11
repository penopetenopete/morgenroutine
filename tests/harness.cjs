/* Test-Lader: führt die ausgelieferten Dateien three.min.js, figur.js und app.js (wahlweise essen.js, spotify.js)
   aus dem Repo-Wurzelverzeichnis in einem frischen node:vm-Kontext aus – mit Stubs für DOM und localStorage.
   Keine Kopie und kein Nachbau der App: getestet wird genau das, was auch das Handy lädt.
   Export: { loadApp(seed, opts) } – Vertrag siehe .planning/phases/01-schutznetz/01-01-PLAN.md */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");

/* Stub-Element: bekannte Felder als einfache Werte, jede unbekannte Methode ist ein No-op */
function fakeEl(id) {
  const cls = new Set();
  const base = {
    id, style: {}, dataset: {}, hidden: false, checked: false, value: "", textContent: "", innerHTML: "",
    className: "", files: [], children: [], childNodes: [], offsetWidth: 360, offsetHeight: 700,
    clientWidth: 360, clientHeight: 700, scrollTop: 0, scrollLeft: 0,
    classList: {
      add(c) { cls.add(c); },
      remove(c) { cls.delete(c); },
      toggle(c, on) { const want = on === undefined ? !cls.has(c) : !!on; if (want) cls.add(c); else cls.delete(c); return want; },
      contains(c) { return cls.has(c); },
    },
    addEventListener() {}, removeEventListener() {}, appendChild(x) { return x; }, insertAdjacentHTML() {},
    querySelector() { return null; }, querySelectorAll() { return []; }, setAttribute() {}, getAttribute() { return null; },
    removeAttribute() {}, focus() {}, blur() {}, click() {}, remove() {}, select() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 360, height: 700, right: 360, bottom: 700 }; },
    getContext() { return null; }, closest() { return null; }, contains() { return false; },
  };
  return new Proxy(base, {
    get(t, p) { if (p in t || typeof p === "symbol") return t[p]; return () => {}; },
    set(t, p, v) { t[p] = v; return true; },
  });
}

function run(ctx, file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf8");
  vm.runInContext(code, ctx, { filename: file });
}

function loadApp(seed = {}, opts = {}) {
  const h = { failSet: opts.failSet || null, replaced: [] };

  /* Speicher-Stub: Schlüssel → Zeichenkette; failSet(key) === true lässt setItem wie bei vollem Speicher werfen */
  const data = new Map(Object.entries(seed).map(([k, v]) => [k, String(v)]));
  const storage = {
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) {
      if (typeof h.failSet === "function" && h.failSet(k)) throw new Error("QuotaExceededError");
      data.set(k, String(v));
    },
    removeItem(k) { data.delete(k); },
  };

  const els = new Map();
  const el = id => { if (!els.has(id)) els.set(id, fakeEl(id)); return els.get(id); };
  const document = {
    getElementById: el,
    querySelector: () => fakeEl("q"),
    querySelectorAll: () => [],
    createElement: () => fakeEl("c"),
    documentElement: fakeEl("html"), head: fakeEl("head"), body: fakeEl("body"),
    hidden: false, visibilityState: "visible",
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  };

  const nowFn = typeof opts.now === "function" ? opts.now : null;
  class FakeDate extends Date {
    static now() { return nowFn ? nowFn() : Date.now(); }
  }

  const ctx = {
    console, Date: FakeDate, Math, JSON,
    Array, Object, String, Number, Set, Map, Promise, Symbol, Error, TypeError, RegExp, Uint8Array, Float32Array,
    Int32Array, Uint32Array, Uint16Array, Float64Array, Int8Array, ArrayBuffer, DataView, WeakMap, WeakSet, Proxy,
    Reflect, BigInt, parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, btoa, atob,
    TextEncoder, TextDecoder, Blob, File, Response, URL, URLSearchParams, CompressionStream, DecompressionStream,
    crypto: globalThis.crypto,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } },
    navigator: { clipboard: {}, userAgent: "node-test" },
    location: {
      origin: "https://example.test", pathname: "/morgenroutine/index.html", hash: "", search: "",
      href: "https://example.test/morgenroutine/index.html", replace(u) { h.replaced.push(u); },
    },
    history: { replaceState() {}, state: null },
    document, localStorage: storage, performance: { now: () => 0 }, indexedDB: undefined,
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);

  run(ctx, "three.min.js");
  run(ctx, "figur.js");
  if (!ctx.Figur) throw new Error("loadApp: window.Figur fehlt nach figur.js");
  /* kein WebGL in Node: Zeichnen stilllegen, Bereitschaft sofort erfüllt */
  ["mount", "setShade", "setLook", "render"].forEach(n => { ctx.Figur[n] = () => {}; });
  ctx.Figur.whenReady = Promise.resolve();
  run(ctx, "app.js");
  if (!ctx.__app) throw new Error("loadApp: window.__app fehlt nach app.js");
  if (opts.withEssenSpotify) { run(ctx, "essen.js"); run(ctx, "spotify.js"); }

  h.ctx = ctx;
  h.F = ctx.Figur;
  h.A = ctx.__app;
  h.storage = storage;
  h.dump = () => Object.fromEntries(data);
  h.el = el;
  return h;
}

module.exports = { loadApp };
