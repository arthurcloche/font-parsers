// Universal entry point — auto-detects format from the buffer's magic number and
// delegates to the correct parser. Importing this pulls in *all* parsers; for
// tree-shakeable usage, import the specific module instead (ttf.mjs, otf.mjs, …).
//
//   import { parseFont, loadFont } from "./src/index.mjs";
//   const font = await loadFont("/fonts/foo.woff2");
//
// The async signature is necessary because WOFF and WOFF2 require a brotli /
// deflate decoder. TTF and OTF parsing remains synchronous internally.

import { u32 } from "./_common.mjs";

const FORMATS = {
  0x00010000: "ttf",
  0x74727565: "ttf",   // 'true'
  0x4f54544f: "otf",   // 'OTTO' — OTF / CFF
  0x774f4646: "woff",  // 'wOFF'
  0x774f4632: "woff2", // 'wOF2'
};

// → "ttf" | "otf" | "woff" | "woff2" (throws on anything else)
export function detectFontFormat(buffer) {
  if (buffer.byteLength < 4) throw new Error("Invalid font file: expected at least 4 bytes");
  const magic = u32(new Uint8Array(buffer), 0);
  const format = FORMATS[magic];
  if (!format) throw new Error(`Unknown font magic: 0x${magic.toString(16).padStart(8, "0")}`);
  return format;
}

export async function parseFont(buffer, opts = {}) {
  switch (detectFontFormat(buffer)) {
    case "ttf":   return (await import("./ttf.mjs")).parseTTF(buffer);
    case "otf":   return (await import("./otf.mjs")).parseOTF(buffer);
    case "woff":  return (await import("./woff.mjs")).parseWOFF(buffer);
    case "woff2": return (await import("./woff2.mjs")).parseWOFF2(buffer, opts);
  }
}

export const loadFont = (url, opts) =>
  fetch(url).then(r => r.arrayBuffer()).then(b => parseFont(b, opts));

export default class FontParser {
  load = loadFont;
  loadFromBuffer = parseFont;
}
