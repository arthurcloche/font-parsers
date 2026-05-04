// Verify WOFF parser: decompress + delegate, output should match the OTF parser
// run on the original .otf (since this WOFF is CFF-flavored).
import fs from "node:fs";
import { parseWOFF, decompressWOFF } from "../src/woff.mjs";
import { parseOTF } from "../src/otf.mjs";

globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
};

const woffBuf = fs.readFileSync("Antique-Legacy-Medium/Antique-Legacy-Medium.woff").buffer;
const otfBuf = fs.readFileSync("Antique-Legacy-Medium/Antique-Legacy-Medium.otf").buffer;

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

// 1. Decompression detection
const { flavor, sfnt } = await decompressWOFF(woffBuf);
test("WOFF flavor detected as 'otf'", flavor === "otf", `got '${flavor}'`);
test("decompressed sfnt is a non-empty ArrayBuffer", sfnt.byteLength > 1000);

// 2. Parsed font
const woff = await parseWOFF(woffBuf);
const otf = parseOTF(otfBuf);

test("unitsPerEm matches OTF", woff.head.unitsPerEm === otf.head.unitsPerEm);
test("ascender matches OTF", woff.hhea.asc === otf.hhea.asc);

// 3. Output identity vs OTF
const sample = "Hello, World!\nLine two";
const A = woff.toSVG(sample, 100);
const B = otf.toSVG(sample, 100);
test("toSVG: same letter count", A.letters.length === B.letters.length);
test("toSVG: block width matches", Math.abs(A.block.width - B.block.width) < 1e-6);

let allD = true, diff = "";
for (let i = 0; i < A.letters.length; i++) {
  if (A.letters[i].d !== B.letters[i].d) { allD = false; diff = `letter ${i}: '${sample[i]}'`; break; }
}
test("toSVG: every glyph d-string identical to OTF", allD, diff);

// 4. toPoints matches
const P = woff.toPoints(sample, 100);
const Q = otf.toPoints(sample, 100);
let ptsOK = true;
for (let i = 0; i < P.letters.length; i++) {
  if (P.letters[i].shape.length !== Q.letters[i].shape.length) { ptsOK = false; break; }
}
test("toPoints: same sample count per letter", ptsOK);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
