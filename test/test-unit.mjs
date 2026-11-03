// Font-free unit tests: format sniffing, sfnt assembly, platform inflate, and the WOFF2
// brotli fallback chain. Needs no files in fonts/.
import zlib from "node:zlib";
import { detectFontFormat } from "../src/index.mjs";
import { buildSfnt, inflate, readSfntDirectory, u16, u32 } from "../src/_common.mjs";
import { decompressWOFF2, parseWOFF2 } from "../src/woff2.mjs";

let pass = 0, fail = 0;
const test = (name, ok, info = "") => {
  if (ok) { pass++; console.log("✓", name); }
  else    { fail++; console.log("✗", name, info); }
};
const throws = async (fn, re) => {
  try { await fn(); return false; } catch (e) { return re.test(e.message); }
};
const magic = n => { const b = new Uint8Array(8); new DataView(b.buffer).setUint32(0, n); return b.buffer; };

// ── detectFontFormat ──
for (const [n, fmt] of [[0x00010000, "ttf"], [0x74727565, "ttf"], [0x4f54544f, "otf"],
                        [0x774f4646, "woff"], [0x774f4632, "woff2"]]) {
  test(`detectFontFormat 0x${n.toString(16)} → ${fmt}`, detectFontFormat(magic(n)) === fmt);
}
test("detectFontFormat rejects < 4 bytes", await throws(() => detectFontFormat(new ArrayBuffer(3)), /at least 4 bytes/));
test("detectFontFormat rejects unknown magic", await throws(() => detectFontFormat(magic(0x12345678)), /0x12345678/));

// ── buildSfnt ↔ readSfntDirectory ──
{
  const tables = [
    { tag: "zzzz", data: Uint8Array.of(1, 2, 3, 4, 5) },
    { tag: "aaaa", data: Uint8Array.of(9, 8, 7, 6) },
    { tag: "mmmm", data: new Uint8Array(0) },
  ];
  const buf = buildSfnt(0x4f54544f, tables);
  const b = new Uint8Array(buf);
  const { tables: dir, numTables } = readSfntDirectory(b);
  test("buildSfnt: flavor written", u32(b, 0) === 0x4f54544f);
  test("buildSfnt: numTables", numTables === 3 && u16(b, 4) === 3);
  test("buildSfnt: directory sorted by tag", Object.keys(dir).join() === "aaaa,mmmm,zzzz");
  test("buildSfnt: offsets 4-byte aligned", Object.values(dir).every(([off]) => off % 4 === 0));
  test("buildSfnt: lengths are the unpadded lengths", dir.zzzz[1] === 5 && dir.aaaa[1] === 4 && dir.mmmm[1] === 0);
  test("buildSfnt: table data lands at its offset",
    [...b.subarray(dir.zzzz[0], dir.zzzz[0] + 5)].join() === "1,2,3,4,5" &&
    [...b.subarray(dir.aaaa[0], dir.aaaa[0] + 4)].join() === "9,8,7,6");
  test("buildSfnt: total size = header + dir + padded tables", buf.byteLength === 12 + 48 + 4 + 0 + 8);
  test("buildSfnt: does not reorder the caller's array", tables[0].tag === "zzzz");
}

// ── inflate ──
{
  const payload = new TextEncoder().encode("font-parsers ".repeat(200));
  const same = out => out.length === payload.length && out.every((v, i) => v === payload[i]);
  test("inflate deflate (zlib)", same(await inflate(zlib.deflateSync(payload), "deflate")));
  test("inflate deflate-raw", same(await inflate(zlib.deflateRawSync(payload), "deflate-raw")));
  test("inflate gzip", same(await inflate(zlib.gzipSync(payload), "gzip")));
  // 'brotli' is runtime-dependent (Node 24+: yes, Chrome 156: no). Either decode correctly or reject.
  let r;
  try { r = same(await inflate(zlib.brotliCompressSync(payload), "brotli")) ? "decodes" : "WRONG"; }
  catch { r = "rejects"; }
  test(`inflate brotli: decodes correctly or rejects cleanly (here: ${r})`, r !== "WRONG");
  test("inflate rejects an invalid format", await throws(() => inflate(payload, "br"), /./));
}

// ── WOFF2 brotli fallback chain (header-only WOFF2: zero tables, empty brotli stream) ──
{
  const hdr = new Uint8Array(48);
  const dv = new DataView(hdr.buffer);
  dv.setUint32(0, 0x774f4632); // wOF2
  dv.setUint32(4, 0x00010000); // flavor: TrueType
  // numTables = 0 (offset 12), totalCompressedSize = 0 (offset 20)

  let calls = 0, got = null;
  const custom = bytes => { calls++; got = bytes; return Promise.resolve(new Uint8Array(0)); };
  const { flavor, sfnt } = await decompressWOFF2(hdr.buffer, { brotli: custom });
  test("WOFF2 custom { brotli } decoder is used", calls === 1 && got instanceof Uint8Array && got.length === 0);
  test("WOFF2 custom decoder result is assembled into an sfnt", flavor === "ttf" && sfnt.byteLength === 12);

  // parseWOFF2 must forward opts too (it needs a real font after that, so just check the call happens)
  calls = 0;
  await parseWOFF2(hdr.buffer, { brotli: custom }).catch(() => {});
  test("parseWOFF2 forwards { brotli }", calls === 1);

  // Simulate a browser that has no brotli: no node:zlib reachable, DecompressionStream rejects.
  const proc = globalThis.process;
  globalThis.process = undefined;
  try {
    let err;
    try { await decompressWOFF2(hdr.buffer); } catch (e) { err = e; }
    test("WOFF2 without any brotli decoder → actionable error", /no brotli decoder.*\{ brotli/.test(err?.message ?? ""), err?.message);
    test("…and keeps the underlying cause", err?.cause !== undefined);
  } finally {
    globalThis.process = proc;
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
