// Verify our TTF parser produces output identical to Klint's original.
import fs from "node:fs";
import { parseTTF } from "../src/ttf.mjs";
import KlintFontParser from "../reference/klint-FontParser.mjs";

// Polyfill Path2D for Node so Klint's `toPaths()` doesn't crash.
// We don't actually compare Path2D objects — only `toSVG` / `toPoints`.
globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
};

const fontPath = "fonts/Antique-Legacy-Medium.ttf";
const buf = fs.readFileSync(fontPath).buffer;

const ours = parseTTF(buf);
const klint = (new KlintFontParser()).loadFromBuffer(buf);

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

const sample = "The quick brown fox\njumps over 0123!?";

// 1. Glyph count + units per em
test("unitsPerEm matches", ours.head.unitsPerEm === klint.head.unitsPerEm,
  `${ours.head.unitsPerEm} vs ${klint.head.unitsPerEm}`);
test("ascender matches", ours.hhea.asc === klint.hhea.asc);
test("descender matches", ours.hhea.desc === klint.hhea.desc);

// 2. SVG output identity
const A = ours.toSVG(sample, 100);
const B = klint.toSVG(sample, 100);
test("toSVG: same letter count", A.letters.length === B.letters.length);
test("toSVG: block width matches", Math.abs(A.block.width - B.block.width) < 1e-6);
test("toSVG: block height matches", Math.abs(A.block.height - B.block.height) < 1e-6);
let allD = true, firstDiff = "";
for (let i = 0; i < A.letters.length; i++) {
  if (A.letters[i].d !== B.letters[i].d) {
    allD = false;
    firstDiff = `letter ${i} (${sample[i]}):\n  ours:  ${A.letters[i].d.slice(0, 80)}…\n  klint: ${B.letters[i].d.slice(0, 80)}…`;
    break;
  }
}
test("toSVG: all path d strings identical", allD, firstDiff);

// 3. positions match
let allPos = true;
for (let i = 0; i < A.letters.length; i++) {
  if (Math.abs(A.letters[i].center.x - B.letters[i].center.x) > 1e-6) { allPos = false; break; }
  if (Math.abs(A.letters[i].center.y - B.letters[i].center.y) > 1e-6) { allPos = false; break; }
}
test("toSVG: all letter positions match", allPos);

// 4. Glyph paths via toGlyphPath
let allGlyphs = true, gDiff = "";
for (let gid = 0; gid < 50; gid++) {
  const a = ours.toGlyphPath(gid);
  const b = klint.toGlyphPath(gid);
  if (a.length !== b.length) { allGlyphs = false; gDiff = `gid ${gid}: lengths ${a.length} vs ${b.length}`; break; }
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) { allGlyphs = false; gDiff = `gid ${gid} idx ${i}: ${a[i]} vs ${b[i]}`; break; }
  if (!allGlyphs) break;
}
test("toGlyphPath(0..50) match exactly", allGlyphs, gDiff);

// 5. toPoints
const P = ours.toPoints(sample, 100);
const Q = klint.toPoints(sample, 100);
test("toPoints: same letter count", P.letters.length === Q.letters.length);
let allPts = true, ptDiff = "";
for (let i = 0; i < P.letters.length; i++) {
  if (P.letters[i].shape.length !== Q.letters[i].shape.length) {
    allPts = false; ptDiff = `letter ${i}: ${P.letters[i].shape.length} vs ${Q.letters[i].shape.length}`; break;
  }
  for (let k = 0; k < P.letters[i].shape.length; k++) {
    const p = P.letters[i].shape[k], q = Q.letters[i].shape[k];
    if (Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6 || p.contour !== q.contour) {
      allPts = false; ptDiff = `letter ${i} pt ${k}: (${p.x},${p.y}) vs (${q.x},${q.y})`; break;
    }
  }
  if (!allPts) break;
}
test("toPoints: all sample points match", allPts, ptDiff);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
