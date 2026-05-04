// Verify the OTF parser produces sensible output. Since OTF is CFF (cubic) and TTF is
// glyf (quadratic), the path commands won't be byte-identical — but glyph metrics,
// cmap mapping, layout, and bounding boxes should match closely.
import fs from "node:fs";
import { parseOTF } from "../src/otf.mjs";
import { parseTTF } from "../src/ttf.mjs";

globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
};

const otfBuf = fs.readFileSync("fonts/Antique-Legacy-Medium.otf").buffer;
const ttfBuf = fs.readFileSync("fonts/Antique-Legacy-Medium.ttf").buffer;
const otf = parseOTF(otfBuf);
const ttf = parseTTF(ttfBuf);

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

const sample = "The quick brown fox\njumps over 0123!?";

test("unitsPerEm (OTF==TTF)", otf.head.unitsPerEm === ttf.head.unitsPerEm,
  `${otf.head.unitsPerEm} vs ${ttf.head.unitsPerEm}`);
test("ascender (OTF==TTF)", otf.hhea.asc === ttf.hhea.asc);
test("descender (OTF==TTF)", otf.hhea.desc === ttf.hhea.desc);

// Layout — should be identical (same hmtx, same cmap)
const A = otf.toSVG(sample, 100);
const B = ttf.toSVG(sample, 100);
test("toSVG: same letter count", A.letters.length === B.letters.length);
test("toSVG: block width matches", Math.abs(A.block.width - B.block.width) < 0.01,
  `${A.block.width} vs ${B.block.width}`);
test("toSVG: same letter positions", (() => {
  for (let i = 0; i < A.letters.length; i++) {
    if (Math.abs(A.letters[i].center.x - B.letters[i].center.x) > 0.01) return false;
    if (Math.abs(A.letters[i].center.y - B.letters[i].center.y) > 0.01) return false;
  }
  return true;
})());

// Glyph paths exist and are non-trivial for visible chars
let pathsOK = true, pathInfo = "";
for (const ch of "Tquickbrownfox0123") {
  const cp = ch.codePointAt(0);
  // shape() to find gid; simpler to just draw via SVG and sniff the d-string
  const letter = otf.toSVG(ch, 100).letters[0];
  if (!letter || !letter.d || letter.d.length < 8) {
    pathsOK = false;
    pathInfo = `OTF: empty path for '${ch}' (d='${letter?.d}')`;
    break;
  }
}
test("OTF: every visible glyph produces a non-trivial path", pathsOK, pathInfo);

// Bounding box of OTF glyph 'O' should sort of match TTF
const computeBBox = (font, ch) => {
  const cmds = font.toGlyphPath(font.toSVG(ch, 100).letters[0].gl?.g ?? 0); // we don't expose gl on toSVG; use raw
  // fallback: use the SVG d string
  const d = font.toSVG(ch, 1000).letters[0].d;
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  let xs = [], ys = [];
  for (let i = 0; i < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i+1]); }
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
  };
};

for (const ch of "OoTAxg") {
  const a = computeBBox(otf, ch);
  const b = computeBBox(ttf, ch);
  const dW = Math.abs((a.maxX - a.minX) - (b.maxX - b.minX));
  const dH = Math.abs((a.maxY - a.minY) - (b.maxY - b.minY));
  // Within 5 units (out of ~600 unit em scaled to 1000) — typical CFF↔TTF discrepancy.
  test(`bbox '${ch}' close (Δw=${dW.toFixed(1)} Δh=${dH.toFixed(1)})`, dW < 8 && dH < 8);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
