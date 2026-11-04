# font-parsers

Tree-shakeable, zero-dependency font parsers for **TTF, OTF, WOFF & WOFF2**, modeled on
[Shopify/Klint's FontParser.mjs](https://github.com/Shopify/Klint/blob/release/0.4.0/packages/klint/src/plugins/FontParser.mjs)
(vendored in `reference/`; the tests check that `ttf.mjs` matches it exactly). Klint 0.5 ships a typed
version of the same parsers in `packages/klint/src/plugins/font-parser/`.

Each format gets its own ES module. They share a small internal `_common.mjs`
(binary readers, cmap, hmtx, layout, path emit), so a bundler only pulls in what
you actually `import`.

```
src/
├── _common.mjs   shared: binary IO, cmap, hmtx, fvar/avar/HVAR, layout, paths, sfnt build, inflate
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
const font = await loadFont("/fonts/foo.woff2", { brotli });   // works for any of the 4

import { detectFontFormat } from "./src/index.mjs";
detectFontFormat(buffer);   // "ttf" | "otf" | "woff" | "woff2"  (throws on anything else)
```

`{ brotli }` is only read for WOFF2 — see [Compatibility notes](#compatibility-notes).

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
0, x, y                      → moveTo
1, x, y                      → lineTo
2, cx, cy, x, y              → quadraticCurveTo   (glyf)
3                            → closePath
4, c1x, c1y, c2x, c2y, x, y  → bezierCurveTo      (CFF)
```

CFF cubics are kept as true cubics: `toPaths` calls `bezierCurveTo`, `toSVG` emits `C`,
and `toPoints` samples them directly.

## Bundle size

What a bundler emits (esbuild, `--bundle --minify`, tree-shaken) when you import each entry,
including the shared core and, for WOFF/WOFF2, the TTF/OTF parser they delegate to:

| Import | minified | gzip |
|---|---:|---:|
| `ttf.mjs`   | 14.0 kB | 5.9 kB |
| `otf.mjs`   | 15.1 kB | 5.9 kB |
| `woff.mjs`  | 22.0 kB | 8.7 kB |
| `woff2.mjs` | 26.9 kB | 10.8 kB |
| `index.mjs` (all four) | 28.6 kB | 11.4 kB |
| **Klint 0.4.0 reference (TTF only)** | 13.2 kB | 5.6 kB |

```bash
npx esbuild src/ttf.mjs --bundle --minify --format=esm --platform=browser | gzip -9 | wc -c
```

The WOFF2 numbers don't include a brotli decoder: browsers need one (see below).

## Compatibility notes

* **WOFF/WOFF2 are async** because deflate/brotli decompression is async on the web
  platform. Call `await loadWOFF(...)`.
* **WOFF needs no extra code anywhere**: it uses `DecompressionStream("deflate")`
  (Node 17+, all modern browsers).
* **WOFF2 needs a brotli decoder.** In order, the parser uses:
  1. `{ brotli: fn }` — `fn(Uint8Array) → Uint8Array | Promise<Uint8Array>`, accepted by
     `parseWOFF2`, `loadWOFF2`, `parseFont` and `loadFont`
  2. `DecompressionStream("brotli")` — works on Node 24; **browsers don't ship it yet**
     (not in Chrome 156)
  3. `node:zlib` on older Node

  So in a browser, pass `{ brotli }`. A wasm decoder can be loaded only when a WOFF2
  actually shows up (`brotli-dec-wasm`: 208 kB, 97 kB gzip):

  ```js
  const brotli = bytes => import("brotli-dec-wasm").then(m => m.default).then(b => b.decompress(bytes));
  const font = await parseWOFF2(buffer, { brotli });
  ```

  Verified in Chrome 156 with brotli-dec-wasm 2.3.2 loaded as plain ES modules; with a
  bundler, follow that package's setup. Without any decoder the call rejects with
  `no brotli decoder available` (the underlying error is on `.cause`).
* **CFF2 (variable OpenType-CFF)** is not implemented. Static OTF / CFF v1 works
  fully, including CID-keyed fonts.
* **Variable TTF** (`fvar` + `gvar` + `HVAR`) is fully supported and matches
  Klint's behaviour exactly.

## Testing

No fonts are committed (`fonts/` is gitignored), so `npm test` on a fresh checkout runs the
font-free unit tests and skips the rest with a message. Drop fonts into `fonts/` (or point
`FONTS_DIR` at a folder) to run everything — see `fonts/README.md`.

```bash
npm test                          # node test/run-all.mjs
FONTS_DIR=/path/to/fonts npm test
node test/visual.mjs              # writes test/visual.html — visual cross-format diff
```

| File | Needs | Checks |
|---|---|---|
| `test-unit.mjs`  | nothing | format sniffing, sfnt assembly, inflate, the WOFF2 brotli fallback chain |
| `test-fonts.mjs` | any fonts in `fonts/` | auto-discovered, see below |
| `test-*.mjs` (older) | `fonts/Antique-Legacy-Medium.*` | the original suite, pinned to one family; skipped if absent |

`test-fonts.mjs` checks, for every font it finds:
- it parses and has outlines
- every `.ttf` is **identical to Klint's original** (SVG paths, positions, raw glyph streams;
  variable fonts at their axis min / default / max)
- every `.woff` / `.woff2` is **identical to the `.ttf`/`.otf` it wraps** (name them
  `X.ttf.woff2` or `X.woff2`) — this exercises inflate, brotli and the full glyf-transform
  reconstruction
- `{ brotli }` is honoured by both `parseWOFF2` and `parseFont`

### Interactive playground

`test/playground.html` is a single-file drag-and-drop tool to inspect any font
you throw at it: outlines, per-glyph bounding boxes, advance widths, on-curve
points, and Bézier control handles. Modules require an HTTP origin:

```bash
python3 -m http.server 8765
open http://localhost:8765/test/playground.html
```

WOFF2 files work too: the playground loads `brotli-dec-wasm` (pinned) from jsDelivr the
first time you open one.
