// End-to-end check: feed the same font in 4 formats through the universal entry
// point. All four should produce identical layout (same gids, same advance widths)
// and structurally compatible glyph outlines.
import fs from "node:fs";
import { parseFont } from "../src/index.mjs";

globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} closePath() {}
};

const dir = "Antique-Legacy-Medium";
const files = {
  ttf:   `${dir}/Antique-Legacy-Medium.ttf`,
  otf:   `${dir}/Antique-Legacy-Medium.otf`,
  woff:  `${dir}/Antique-Legacy-Medium.woff`,
  woff2: `${dir}/Antique-Legacy-Medium.woff2`,
};

const fonts = {};
for (const [k, p] of Object.entries(files)) {
  fonts[k] = await parseFont(fs.readFileSync(p).buffer);
}

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

const sample = "Hello, World!\nQuick brown fox 0123!?";

// 1. Metadata identical across all formats
const ref = fonts.ttf.head.unitsPerEm;
for (const k of ["otf", "woff", "woff2"]) {
  test(`${k}: unitsPerEm matches ttf`, fonts[k].head.unitsPerEm === ref);
}

// 2. Layout identical (same advance widths from hmtx)
const layouts = {};
for (const k of Object.keys(files)) layouts[k] = fonts[k].toSVG(sample, 100);
for (const k of ["otf", "woff", "woff2"]) {
  const w = layouts[k].block.width;
  const refW = layouts.ttf.block.width;
  test(`${k}: block width matches ttf`, Math.abs(w - refW) < 1e-6,
    `${w} vs ${refW}`);
  test(`${k}: letter count matches ttf`,
    layouts[k].letters.length === layouts.ttf.letters.length);
}

// 3. otf == woff == woff2 path output (all are CFF-flavored here)
const cffFormats = ["otf", "woff", "woff2"];
for (let i = 1; i < cffFormats.length; i++) {
  const a = layouts[cffFormats[0]].letters;
  const b = layouts[cffFormats[i]].letters;
  let ok = true;
  for (let j = 0; j < a.length; j++) {
    if (a[j].d !== b[j].d) { ok = false; break; }
  }
  test(`${cffFormats[i]} d-strings == ${cffFormats[0]}`, ok);
}

// 4. ttf path differs from otf (because TTF has glyf, OTF has CFF cubics → different)
//    but bbox is the same.
const charBBox = (font, ch) => {
  const d = font.toSVG(ch, 1000).letters[0].d;
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  let minX = +Infinity, maxX = -Infinity, minY = +Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    if (nums[i] < minX) minX = nums[i];
    if (nums[i] > maxX) maxX = nums[i];
    if (nums[i + 1] < minY) minY = nums[i + 1];
    if (nums[i + 1] > maxY) maxY = nums[i + 1];
  }
  return { w: maxX - minX, h: maxY - minY };
};
for (const ch of "Aogh@") {
  const a = charBBox(fonts.ttf, ch);
  const b = charBBox(fonts.otf, ch);
  test(`bbox '${ch}' close (Δw=${(a.w - b.w).toFixed(1)}, Δh=${(a.h - b.h).toFixed(1)})`,
    Math.abs(a.w - b.w) < 8 && Math.abs(a.h - b.h) < 8);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
