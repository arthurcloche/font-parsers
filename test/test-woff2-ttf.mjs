// WOFF2 parser test for TTF-flavored input — exercises the glyf-transform path.
// We compare the parsed output against the original TTF.
import fs from "node:fs";
import { parseWOFF2, decompressWOFF2 } from "../src/woff2.mjs";
import { parseTTF } from "../src/ttf.mjs";

globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
};

const woff2Buf = fs.readFileSync("Antique-Legacy-Medium/Antique-Legacy-Medium.ttf.woff2").buffer;
const ttfBuf   = fs.readFileSync("Antique-Legacy-Medium/Antique-Legacy-Medium.ttf").buffer;

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

const { flavor } = await decompressWOFF2(woff2Buf);
test("flavor detected as 'ttf'", flavor === "ttf", `got '${flavor}'`);

const woff2 = await parseWOFF2(woff2Buf);
const ttf   = parseTTF(ttfBuf);

test("unitsPerEm matches", woff2.head.unitsPerEm === ttf.head.unitsPerEm);
test("ascender matches",  woff2.hhea.asc        === ttf.hhea.asc);

const sample = "The quick brown fox\njumps over 0123!?";
const A = woff2.toSVG(sample, 100);
const B = ttf.toSVG(sample, 100);
test("toSVG letter count", A.letters.length === B.letters.length);
test("toSVG block width",  Math.abs(A.block.width - B.block.width) < 1e-6);

let allD = true, diff = "";
for (let i = 0; i < A.letters.length; i++) {
  if (A.letters[i].d !== B.letters[i].d) {
    allD = false;
    diff = `letter ${i} ('${sample[i]}'):\n  woff2: ${A.letters[i].d.slice(0, 80)}\n  ttf:   ${B.letters[i].d.slice(0, 80)}`;
    break;
  }
}
test("toSVG: every glyph d-string identical to TTF", allD, diff);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
