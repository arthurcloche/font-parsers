// WOFF (Web Open Font Format, version 1) parser.
//
// WOFF is a thin, per-table-zlib-compressed wrapper around a regular SFNT (TTF/OTF).
// We decompress to a fresh SFNT ArrayBuffer and delegate to the appropriate parser.
//
// Public API:
//   decompressWOFF(arrayBuffer)         → { flavor: 'ttf'|'otf', sfnt: ArrayBuffer }
//   parseWOFF(arrayBuffer)              → font instance (async)
//   loadWOFF(url)                       → fetch + parse (async)
//   default class { load, loadFromBuffer }
//
// `parseWOFF` is async because we use the platform `DecompressionStream('deflate')`
// for portable, dependency-free zlib support (Node 17+, all modern browsers).

import { u16, u32, inflate, buildSfnt } from "./_common.mjs";

// ───────────── header constants ─────────────
const WOFF_SIG   = 0x774f4646; // "wOFF"
const OTF_FLAVOR = 0x4f54544f; // "OTTO"

// ───────────── WOFF → SFNT ─────────────
export async function decompressWOFF(buffer) {
  const b = new Uint8Array(buffer);
  if (u32(b, 0) !== WOFF_SIG) throw new Error("WOFF: bad signature");
  const flavorRaw = u32(b, 4);

  // Table directory starts at 44, 20 bytes per entry: tag, offset, compLen, origLen, checksum.
  // Tables are inflated in parallel (DecompressionStream is async).
  const tables = await Promise.all(Array.from({ length: u16(b, 12) }, async (_, i) => {
    const p = 44 + i * 20, off = u32(b, p + 4), compLen = u32(b, p + 8);
    const slice = b.subarray(off, off + compLen);
    return {
      tag: String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]),
      // compLen === origLen means the table is stored uncompressed
      data: compLen === u32(b, p + 12) ? slice : await inflate(slice, "deflate"),
    };
  }));

  // Anything that isn't "OTTO" is treated as TrueType.
  return { flavor: flavorRaw === OTF_FLAVOR ? "otf" : "ttf", sfnt: buildSfnt(flavorRaw, tables) };
}

// ───────────── parse + auto-delegate ─────────────
export async function parseWOFF(buffer) {
  const { flavor, sfnt } = await decompressWOFF(buffer);
  if (flavor === "otf") {
    const { parseOTF } = await import("./otf.mjs");
    return parseOTF(sfnt);
  }
  const { parseTTF } = await import("./ttf.mjs");
  return parseTTF(sfnt);
}

export const loadWOFF = url => fetch(url).then(r => r.arrayBuffer()).then(parseWOFF);

export default class WOFFFontParser {
  load = loadWOFF;
  loadFromBuffer = parseWOFF;
}
