// WOFF2 parser test. Our test font is CFF-flavored (no glyf transform),
// so we mostly exercise the brotli + sfnt-rebuild paths here.
import fs from "node:fs";
import { parseWOFF2, decompressWOFF2 } from "../src/woff2.mjs";
import { parseOTF } from "../src/otf.mjs";

globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
};

const woff2Buf = fs.readFileSync("Antique-Legacy-Medium/Antique-Legacy-Medium.woff2").buffer;
const otfBuf   = fs.readFileSync("Antique-Legacy-Medium/Antique-Legacy-Medium.otf").buffer;

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

const { flavor, sfnt } = await decompressWOFF2(woff2Buf);
test("WOFF2 flavor detected as 'otf'", flavor === "otf", `got '${flavor}'`);
test("decompressed sfnt non-empty", sfnt.byteLength > 1000);

const woff2 = await parseWOFF2(woff2Buf);
const otf   = parseOTF(otfBuf);

test("unitsPerEm matches OTF", woff2.head.unitsPerEm === otf.head.unitsPerEm);
test("ascender matches OTF", woff2.hhea.asc === otf.hhea.asc);

const sample = "Hello, World!\nLine two";
const A = woff2.toSVG(sample, 100);
const B = otf.toSVG(sample, 100);
test("toSVG: same letter count", A.letters.length === B.letters.length);
test("toSVG: block width matches", Math.abs(A.block.width - B.block.width) < 1e-6);

let allD = true, diff = "";
for (let i = 0; i < A.letters.length; i++) {
  if (A.letters[i].d !== B.letters[i].d) { allD = false; diff = `letter ${i}: '${sample[i]}'`; break; }
}
test("toSVG: every glyph d-string identical to OTF", allD, diff);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
