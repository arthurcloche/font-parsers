// Run every test file in this directory in order. Exits non-zero if any fail.
import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

const tests = readdirSync(new URL(".", import.meta.url))
  .filter(f => f.startsWith("test-") && f.endsWith(".mjs"))
  .sort();

let totalPass = 0, totalFail = 0, anyFailed = false;

for (const t of tests) {
  console.log(`\n━━━ ${t} ━━━`);
  try {
    execSync(`node test/${t}`, { stdio: "inherit", cwd: process.cwd() });
    // Each test prints its own pass/fail summary; we just track overall exit.
  } catch (e) {
    anyFailed = true;
  }
}

console.log(anyFailed ? "\n❌ some tests failed" : "\n✅ all tests passed");
process.exit(anyFailed ? 1 : 0);
