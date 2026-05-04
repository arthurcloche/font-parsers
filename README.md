# font-parsers

Tree-shakeable, zero-dependency font parsers for **TTF, OTF, WOFF, WOFF/2**, modeled on
[Shopify/Klint's FontParser.mjs](https://github.com/Shopify/Klint/blob/release/0.4.0/packages/klint/src/plugins/FontParser.mjs).

Each format gets its own ES module. They share a small internal `_common.mjs`
(binary readers, cmap, hmtx, layout, path emit), so a bundler only pulls in what
you actually `import`.

```
src/
├── _common.mjs   shared: binary IO, cmap, hmtx, fvar/avar/HVAR, layout, paths
├── ttf.mjs       TTF: glyf/loca outlines + gvar variations
├── otf.mjs       OTF: CFF v1 outlines via Type 2 charstrings (CID supported)
├── woff.mjs      WOFF: per-table zlib decompress → delegate
├── woff2.mjs     WOFF2: brotli + glyf/loca transform reconstruction
└── index.mjs     auto-detect from buffer magic (imports all)
```

## Public API (per parser)

```js
import { parseTTF, loadTTF }   from "./src/ttf.mjs";
import { parseOTF, loadOTF }   from "./src/otf.mjs";
import { parseWOFF, loadWOFF } from "./src/woff.mjs";   // async
import { parseWOFF2, loadWOFF2 } from "./src/woff2.mjs"; // async

const font = parseTTF(arrayBuffer);
const { letters, block } = font.toSVG("Hello", 100, { align: "center" });
// letters[i].d              SVG path d-string
// letters[i].center.{x,y}   pixel position
// letters[i].width / height
// block.width / block.height
```

Drop-in compat with Klint's class-based API:

```js
import FontParser from "./src/ttf.mjs";   // default export = class
const fp = new FontParser();
const font = await fp.load("/fonts/foo.ttf");
```

Universal entry that auto-detects:

```js
import { loadFont } from "./src/index.mjs";
const font = await loadFont("/fonts/foo.woff2");   // works for any of the 4
```

## What each module returns

The parsed `font` exposes the same surface across all four formats:

| Method | Returns |
|---|---|
| `font.toPaths(text, size, opts)` | `letters[i].path` is a `Path2D` |
| `font.toSVG(text, size, opts)`   | `letters[i].d` is an SVG path d-string |
| `font.toPoints(text, size, opts)`| `letters[i].shape` is sampled `{x, y, contour}[]` |
| `font.toGlyphPath(gid, axisValues?)` | raw command stream `[op, args, …]` |
| `font.head` / `font.hhea` / `font.fvar` | metadata |

`opts` supports `align: "left"|"center"|"right"`, `anchor: "center"`,
`baseline: "center"`, `letterSpacing`, `wordSpacing`, `lineSpacing`, `axisValues`,
`sampling` (toPoints density). Variable fonts: pass `axisValues: [wght, wdth, ...]`
in user space.

### Path command stream

Both TTF (`glyf`) and OTF (`CFF`) emit the same encoding so the rest of the
pipeline doesn't care:

```
0, x, y                  → moveTo
1, x, y                  → lineTo
2, cx, cy, x, y          → quadraticCurveTo
3                        → closePath
```

OTF cubic Béziers are split into two quadratics at t=0.5; visually indistinguishable
at type sizes and lets `toPoints`/`samplePath` work without a separate cubic branch.

## Bundle sizes (gzipped)

| Module | raw | gzip |
|---|---:|---:|
| `_common.mjs` | 20 KB | 6.0 KB |
| `ttf.mjs`     | 14 KB | 4.1 KB |
| `otf.mjs`     | 19 KB | 5.3 KB |
| `woff.mjs`    | 5 KB  | 2.1 KB |
| `woff2.mjs`   | 17 KB | 5.5 KB |
| `index.mjs`   | 1.7 KB| 0.8 KB |
| **Klint reference (TTF only, minified)** | 13 KB | 5.6 KB |

A consumer that only imports `ttf.mjs` ships ~10 KB gz. Importing `index.mjs`
pulls everything (~24 KB gz including the brotli/deflate wrappers).

## Compatibility notes

* **WOFF/WOFF2 are async** because brotli/deflate decompression is async on the
  web platform. Call `await loadWOFF(...)`.
* **WOFF2 brotli** uses `DecompressionStream("br")` (Chrome 137+, Safari 18+) with
  a `node:zlib.brotliDecompressSync` fallback. For older browsers, pass
  `parseWOFF2(buf, { brotli: customDecodeFn })`.
* **CFF2 (variable OpenType-CFF)** is not implemented. Static OTF / CFF v1 works
  fully, including CID-keyed fonts.
* **Variable TTF** (`fvar` + `gvar` + `HVAR`) is fully supported and matches
  Klint's behaviour exactly.

## Testing

The Antique Legacy Medium font is included in 4 formats so we can cross-verify:

```bash
node test/run-all.mjs
```

Tests verify:
- `ttf.mjs` produces output **byte-identical** to Klint's original on TTF
- `otf.mjs` produces output **byte-identical** to OTF for layout & bounding boxes
- `woff.mjs` produces output **identical to OTF** (since the WOFF here is CFF-flavored)
- `woff2.mjs` (CFF) produces output **identical to OTF**
- `woff2.mjs` (TTF, generated via fontTools) produces output **byte-identical to TTF**
  → exercises the full glyf-transform reconstruction
