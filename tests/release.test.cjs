/* Release-Regeln als Test (SAFE-04): Versionspaar sw.js/app.js, Offline-Liste ohne Testdateien,
   Form des Test-Workflows. Liest die Dateien nur als Text; braucht den Lader nicht. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

/* Nummern aus den Texten ziehen: sw.js (const V="training-vNN") und app.js (APP_VER="NN") */
function versions(swText, appText) {
  const sw = /const V\s*=\s*"training-v(\d+)"/.exec(swText);
  const app = /const APP_VER\s*=\s*"(\d+)"/.exec(appText);
  return { sw: sw && sw[1], app: app && app[1] };
}

test("Versionspaar: Nummer in sw.js ist gleich APP_VER in app.js", () => {
  /* Der Prüfer erkennt Gleichheit und Ungleichheit */
  const gleich = versions('const V="training-v7";', 'const APP_VER="7";');
  const anders = versions('const V="training-v7";', 'const APP_VER="8";');
  assert.equal(gleich.sw, gleich.app);
  assert.notEqual(anders.sw, anders.app);

  const v = versions(read("sw.js"), read("app.js"));
  assert.ok(v.sw, "training-vNN in sw.js nicht gefunden");
  assert.ok(v.app, "APP_VER in app.js nicht gefunden");
  assert.equal(v.sw, v.app);
});

test("Offline-Liste: CORE in sw.js enthält keine Testdateien", () => {
  const m = /const CORE\s*=\s*\[([^\]]*)\]/.exec(read("sw.js"));
  assert.ok(m, "CORE in sw.js nicht gefunden");
  const eintraege = m[1].split(",").map(s => s.trim().replace(/^"|"$/g, "")).filter(Boolean);
  assert.ok(eintraege.length > 0);
  eintraege.forEach(e => {
    assert.ok(!e.startsWith("tests/"), "Testordner in CORE: " + e);
    assert.ok(!e.endsWith(".test.cjs"), "Testdatei in CORE: " + e);
  });
});

test("Workflow-Form: Push ohne Filter, nur Leserechte, kein Durchwinken", () => {
  const y = read(".github/workflows/tests.yml");
  assert.match(y, /^on:\s*\n\s+push:\s*\n\s+workflow_dispatch:/m, "push ohne Unterpunkte erwartet");
  assert.ok(!/^\s+(branches|branches-ignore|paths|paths-ignore|tags|tags-ignore):/m.test(y), "Zweig- oder Pfadfilter gefunden");
  assert.match(y, /^permissions:\s*\n\s+contents:\s*read\s*$/m);
  assert.ok(!/:\s*write\b/.test(y), "Schreibrecht gefunden");
  assert.ok(!/secrets\./.test(y), "Secret gefunden");
  assert.ok(!/continue-on-error/.test(y), "continue-on-error gefunden");
  assert.ok(!/\|\|\s*(true|:)/.test(y), "Durchwinken mit || true gefunden");
  assert.match(y, /node-version:\s*22/);
  assert.ok(y.includes('node --test "tests/*.test.cjs"'), "Testbefehl fehlt");
});

test("Fremde Actions: nur checkout@v4 und setup-node@v4", () => {
  const y = read(".github/workflows/tests.yml");
  const uses = y.split("\n").filter(l => /^\s*-?\s*uses:/.test(l)).map(l => l.replace(/^\s*-?\s*uses:\s*/, "").trim());
  assert.ok(uses.length >= 2);
  uses.forEach(u => assert.ok(u === "actions/checkout@v4" || u === "actions/setup-node@v4", "unerwartete Action: " + u));
});
