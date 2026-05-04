// Visual cross-format alignment test.
// Renders the same string with all 4 parsers and writes an HTML report where:
//   - each format is rendered on its own row
//   - all 4 are overlaid with different colors so misalignment is visible
//
// Usage:  node test/visual.mjs  [optional sample string]
// Output: test/visual.html
//
// Drop your fonts at fonts/<name>.{ttf,otf,woff,woff2}. The script picks the
// first basename for which all 4 formats exist.

import fs from "node:fs";
import path from "node:path";
import { parseFont } from "../src/index.mjs";

globalThis.Path2D = globalThis.Path2D || class {
  moveTo() {} lineTo() {} quadraticCurveTo() {} bezierCurveTo() {} closePath() {}
};

const FONTS_DIR = path.resolve(new URL(".", import.meta.url).pathname, "../fonts");
const SAMPLE = process.argv[2] || "Hello, World! Quick brown fox 0123!?";
const SIZE = 96;
const FORMATS = ["ttf", "otf", "woff", "woff2"];
const COLORS = { ttf: "#e63946", otf: "#2a9d8f", woff: "#f4a261", woff2: "#5a4fcf" };

// --- find a basename that exists in all 4 formats ---
const files = fs.readdirSync(FONTS_DIR);
const groups = {};
for (const f of files) {
  const m = f.match(/^(.+)\.(ttf|otf|woff|woff2)$/i);
  if (!m) continue;
  const [, base, ext] = m;
  (groups[base] ??= {})[ext.toLowerCase()] = path.join(FONTS_DIR, f);
}
const basename = Object.keys(groups).find(b => FORMATS.every(fmt => groups[b][fmt]));
if (!basename) {
  console.error(`No font with all 4 formats found in ${FONTS_DIR}`);
  console.error(`Drop matching .ttf .otf .woff .woff2 files in fonts/.`);
  process.exit(1);
}
console.log(`Using ${basename}`);

// --- parse + layout each format ---
const layouts = {};
let ascScale = 0, descScale = 0;
for (const fmt of FORMATS) {
  const buf = fs.readFileSync(groups[basename][fmt]).buffer;
  const font = await parseFont(buf);
  const layout = font.toSVG(SAMPLE, SIZE, { align: "left" });
  layouts[fmt] = layout;
  // ascender / descender in pixels (same across formats — they share the font)
  const scale = SIZE / font.head.unitsPerEm;
  ascScale  = font.hhea.asc  * scale;   // positive
  descScale = font.hhea.desc * scale;   // negative
}
// Compute true vertical bounds across all letters.
// Path coords have ascenders at negative y, descenders at positive y, baseline at 0.
// In layout coords, glyph top   = center.y - ascScale
//                  glyph bottom = center.y - descScale (descScale is negative)
const allCenterYs = Object.values(layouts).flatMap(l => l.letters.map(L => L.center.y));
const yMin = Math.min(...allCenterYs) - ascScale;
const yMax = Math.max(...allCenterYs) - descScale;

// --- build SVG for one layout ---
// Each letter's `d` is in glyph-local coords (baseline at y=0, ascenders
// negative y). We position each glyph via its `center.{x,y}` then shift the
// whole thing into a positive viewBox using the precomputed yMin/yMax.
const PAD = 16;
const contentH = yMax - yMin;
const buildSVG = (layout, color, opts = {}) => {
  const { width } = layout.block;
  const w = width + PAD * 2;
  const h = contentH + PAD * 2;
  const yShift = PAD - yMin;
  const paths = layout.letters
    .map(l => `<path d="${l.d}" transform="translate(${l.center.x},${l.center.y})" fill="${color}" fill-rule="evenodd" opacity="${opts.opacity ?? 1}"/>`)
    .join("");
  const baselineY = (layout.letters[0]?.center.y ?? 0) + yShift;
  const guides = opts.guides
    ? `<line x1="0" y1="${baselineY}" x2="${w}" y2="${baselineY}" stroke="#ccc" stroke-width="0.5"/>
       <rect x="${PAD}" y="${PAD}" width="${width}" height="${contentH}" fill="none" stroke="#eee" stroke-width="0.5"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  ${guides}<g transform="translate(${PAD},${yShift})">${paths}</g></svg>`;
};

// --- per-format rows ---
const rows = FORMATS.map(fmt => {
  const l = layouts[fmt];
  return `<div class="row">
    <div class="label" style="color:${COLORS[fmt]}">${fmt.toUpperCase()}<br/>
      <small>w=${l.block.width.toFixed(2)}<br/>letters=${l.letters.length}</small></div>
    <div class="svg">${buildSVG(l, COLORS[fmt], { guides: true })}</div>
  </div>`;
}).join("\n");

// --- overlay (all 4 stacked, semi-transparent) ---
const overlayBlock = layouts.ttf.block;
const ow = overlayBlock.width + PAD * 2;
const oh = contentH + PAD * 2;
const oYShift = PAD - yMin;
const overlayPaths = FORMATS.map(fmt =>
  layouts[fmt].letters
    .map(l => `<path d="${l.d}" transform="translate(${l.center.x},${l.center.y})" fill="${COLORS[fmt]}" fill-rule="evenodd" opacity="0.45"/>`)
    .join("")
).join("");
const baselineY = (layouts.ttf.letters[0]?.center.y ?? 0) + oYShift;
const overlay = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ow} ${oh}" width="${ow}" height="${oh}">
  <line x1="0" y1="${baselineY}" x2="${ow}" y2="${baselineY}" stroke="#ccc" stroke-width="0.5"/>
  <g transform="translate(${PAD},${oYShift})">${overlayPaths}</g></svg>`;

// --- diff stats ---
const refLayout = layouts.ttf;
const stats = FORMATS.map(fmt => {
  const l = layouts[fmt];
  const dW = (l.block.width - refLayout.block.width).toFixed(3);
  const dH = (l.block.height - refLayout.block.height).toFixed(3);
  const sameCount = l.letters.length === refLayout.letters.length;
  const sameAdvances = sameCount && l.letters.every((g, i) =>
    Math.abs(g.center.x - refLayout.letters[i].center.x) < 1e-3);
  return `<tr>
    <td style="color:${COLORS[fmt]}"><b>${fmt.toUpperCase()}</b></td>
    <td>${l.letters.length}</td>
    <td>${l.block.width.toFixed(3)}</td>
    <td>${dW === "0.000" ? "—" : dW}</td>
    <td>${dH === "0.000" ? "—" : dH}</td>
    <td>${sameAdvances ? "✓" : "✗"}</td>
  </tr>`;
}).join("");

const html = `<!doctype html>
<html><head><meta charset="utf-8"/><title>Font parsers visual test — ${basename}</title>
<style>
  body { font: 13px ui-monospace, Menlo, monospace; background: #fafafa; color: #222; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #666; margin-bottom: 24px; }
  .row { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; background: #fff; padding: 12px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.05); }
  .label { width: 80px; font-weight: 600; }
  .svg { flex: 1; overflow-x: auto; }
  svg { display: block; max-width: 100%; height: auto; background: #fff; }
  .overlay { background: #fff; padding: 12px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,.05); margin-top: 24px; }
  .overlay h2 { font-size: 14px; margin: 0 0 8px; }
  table { border-collapse: collapse; margin-top: 24px; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.05); border-radius: 6px; overflow: hidden; }
  th, td { padding: 6px 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f4f4f4; font-weight: 600; }
  .legend span { display: inline-block; width: 10px; height: 10px; margin-right: 4px; vertical-align: middle; }
</style></head>
<body>
<h1>Font parsers — visual cross-format test</h1>
<div class="meta">Font: <b>${basename}</b> · sample: <code>${SAMPLE.replace(/[<>&]/g, c => ({ "<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</code> · size: ${SIZE}px</div>

${rows}

<div class="overlay">
  <h2>Overlay (all 4 formats, 45% opacity)</h2>
  <div class="legend">${FORMATS.map(f => `<span style="background:${COLORS[f]}"></span>${f.toUpperCase()}`).join(" &nbsp; ")}</div>
  <div class="svg">${overlay}</div>
  <p style="color:#666;margin-top:8px">If parsers agree, colors stack into a muddy brown. Any visible color = misalignment.</p>
</div>

<table>
  <tr><th>format</th><th>letters</th><th>block width</th><th>Δw vs ttf</th><th>Δh vs ttf</th><th>x-positions match ttf</th></tr>
  ${stats}
</table>
</body></html>`;

const out = path.resolve(new URL(".", import.meta.url).pathname, "visual.html");
fs.writeFileSync(out, html);
console.log(`Wrote ${out}`);
console.log(`Open with:  open ${out}`);
