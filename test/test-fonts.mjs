// Font-driven tests that work with *whatever* you drop in fonts/ (or $FONTS_DIR).
//
//   • every .ttf/.otf/.woff/.woff2 parses through the universal entry and has outlines
//   • every .woff/.woff2 is compared against the .ttf/.otf it was made from — layout and
//     raw outlines must be identical. Pairing is by name:
//         X.ttf.woff2 → X.ttf        X.woff2 → X.ttf or X.otf
//     This is what exercises WOFF inflate, WOFF2 brotli and the glyf-transform rebuild.
//   • every .ttf is compared against the vendored Klint original (reference/), the claim
//     this repo is built on: identical SVG paths, positions and raw glyph streams
//   • variable fonts are swept at their axis min / default / max
//
// With no fonts present the file reports a skip and exits 0.
import fs from "node:fs";
import crypto from "node:crypto";
import { parseFont } from "../src/index.mjs";
import { parseWOFF2 } from "../src/woff2.mjs";
import KlintFontParser from "../reference/klint-FontParser.mjs";

const dir = process.env.FONTS_DIR || "fonts";
const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /\.(ttf|otf|woff2?)$/i.test(f)).sort()
  : [];
if (!files.length) {
  console.log(`skip: no .ttf/.otf/.woff/.woff2 files in ${dir}/ — see fonts/README.md`);
  process.exit(0);
}

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};

const TEXT = "Hamburgefonstiv ÀÉÎõü fi 123 AV To\nSecond line, with — dashes & 𝒳";
const GLYPHS = 300;
const hash = v => crypto.createHash("sha1").update(JSON.stringify(v)).digest("hex").slice(0, 12);
const read = f => { const b = fs.readFileSync(`${dir}/${f}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

// A font's observable output at one axis setting: layout + SVG + raw glyph streams.
function snapshot(font, axisValues) {
  const o = axisValues ? { axisValues } : {};
  const svg = font.toSVG(TEXT, 100, o);
  const glyphs = [];
  for (let g = 0; g < GLYPHS; g++) glyphs.push(font.toGlyphPath(g, axisValues));
  return {
    svg: hash(svg), glyphs: hash(glyphs),
    nonEmpty: glyphs.filter(p => p.length).length,
    streams: glyphs, // raw, for pinpointing a mismatch
  };
}
const axisSets = font => {
  const axes = font.fvar?.[0] ?? [];
  return axes.length
    ? [undefined, axes.map(a => a[1]), axes.map(a => a[2]), axes.map(a => a[3])]
    : [undefined];
};

const fonts = {};
for (const f of files) {
  try { fonts[f] = await parseFont(read(f)); }
  catch (e) { test(`${f}: parses`, false, e.message); }
}

for (const [f, font] of Object.entries(fonts)) {
  const snaps = axisSets(font).map(av => snapshot(font, av));
  test(`${f}: parses, unitsPerEm=${font.head.unitsPerEm}${font.fvar ? `, ${font.fvar[0].length} axes` : ""}`, font.head.unitsPerEm > 0);
  test(`${f}: has outlines (${snaps[0].nonEmpty}/${GLYPHS} glyphs non-empty)`, snaps[0].nonEmpty > 0);
  const laid = font.toSVG(TEXT, 100);
  test(`${f}: layout yields letters and a non-zero block`, laid.letters.length > 0 && laid.block.width > 0);

  // ── TrueType vs. Klint's original ──
  if (/\.ttf$/i.test(f)) {
    const klint = new KlintFontParser().loadFromBuffer(read(f));
    axisSets(font).forEach((av, i) => {
      const o = av ? { axisValues: av } : {}, tag = av ? `axes[${i}]=${av}` : "default";
      const A = font.toSVG(TEXT, 100, o), B = klint.toSVG(TEXT, 100, o);
      const same = A.letters.length === B.letters.length &&
        A.block.width === B.block.width && A.block.height === B.block.height &&
        A.letters.every((l, k) => l.d === B.letters[k].d &&
          l.center.x === B.letters[k].center.x && l.center.y === B.letters[k].center.y);
      test(`${f} ≡ Klint original @ ${tag}: toSVG paths + positions`, same);
      let bad = -1;
      for (let g = 0; g < GLYPHS && bad < 0; g++)
        if (JSON.stringify(font.toGlyphPath(g, av)) !== JSON.stringify(klint.toGlyphPath(g, av))) bad = g;
      test(`${f} ≡ Klint original @ ${tag}: raw glyph streams (${GLYPHS} glyphs)`, bad < 0, `first differing glyph id: ${bad}`);
    });
  }

  // ── container vs. the sfnt it wraps ──
  const m = f.match(/^(.*?)\.woff2?$/i);
  if (!m) continue;
  const src = [m[1], `${m[1]}.ttf`, `${m[1]}.otf`].find(c => c !== f && /\.(ttf|otf)$/i.test(c) && fonts[c]);
  if (!src) { console.log(`· ${f}: no matching .ttf/.otf in ${dir}/ to compare against`); continue; }
  const ref = fonts[src];
  axisSets(ref).forEach((av, i) => {
    const a = snapshot(font, av), b = snapshot(ref, av), tag = av ? `axes[${i}]=${av}` : "default";
    let where = "";
    if (a.glyphs !== b.glyphs) {
      const g = a.streams.findIndex((p, k) => JSON.stringify(p) !== JSON.stringify(b.streams[k]));
      where = `first differing glyph id: ${g}`;
    }
    test(`${f} ≡ ${src} @ ${tag}: layout+SVG`, a.svg === b.svg);
    test(`${f} ≡ ${src} @ ${tag}: raw outlines (${GLYPHS} glyphs)`, a.glyphs === b.glyphs, where);
  });
  test(`${f}: head/hhea match ${src}`, hash([font.head, font.hhea]) === hash([ref.head, ref.hhea]));

  // `{ brotli }` must reach the decoder through the universal entry as well
  if (/\.woff2$/i.test(f)) {
    let called = 0;
    const zlib = await import("node:zlib");
    const viaOpts = await parseFont(read(f), { brotli: b => (called++, zlib.brotliDecompressSync(b)) });
    test(`${f}: { brotli } forwarded by parseFont()`, called === 1 && snapshot(viaOpts).glyphs === snapshot(font).glyphs);
    const direct = await parseWOFF2(read(f), { brotli: b => zlib.brotliDecompressSync(b) });
    test(`${f}: { brotli } honoured by parseWOFF2()`, snapshot(direct).glyphs === snapshot(font).glyphs);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
