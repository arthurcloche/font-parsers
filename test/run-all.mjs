// Run every test file in this directory in order. Exits non-zero if any fail.
//
// test-unit.mjs needs no fonts. test-fonts.mjs auto-discovers whatever is in fonts/.
// The older test-*.mjs files are pinned to one specific family
// (fonts/Antique-Legacy-Medium.{ttf,otf,woff,woff2,ttf.woff2}); they are skipped when
// it isn't there.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const PINNED = "Antique-Legacy-Medium";
const havePinned = existsSync(`fonts/${PINNED}.ttf`);

const tests = readdirSync(new URL(".", import.meta.url))
  .filter(f => f.startsWith("test-") && f.endsWith(".mjs"))
  .sort();

let anyFailed = false;
const skipped = [];

for (const t of tests) {
  console.log(`\n━━━ ${t} ━━━`);
  if (!havePinned && readFileSync(new URL(t, import.meta.url), "utf8").includes(PINNED)) {
    console.log(`skip: needs fonts/${PINNED}.* (not present)`);
    skipped.push(t);
    continue;
  }
  try {
    execSync(`node test/${t}`, { stdio: "inherit", cwd: process.cwd() });
    // Each test prints its own pass/fail summary; we just track overall exit.
  } catch (e) {
    anyFailed = true;
  }
}

if (skipped.length) console.log(`\nskipped (font not present): ${skipped.join(", ")}`);
console.log(anyFailed ? "\n❌ some tests failed" : "\n✅ all tests passed");
process.exit(anyFailed ? 1 : 0);
