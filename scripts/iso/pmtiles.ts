/** A minimal PMTiles v3 writer (after scripts/build_pmtiles.mjs): one root directory, gzip. */
import fs from "node:fs";
import zlib from "node:zlib";

function rotate(n: number, xy: number[], rx: number, ry: number) {
  if (ry === 0) {
    if (rx === 1) [xy[0], xy[1]] = [n - 1 - xy[0], n - 1 - xy[1]];
    [xy[0], xy[1]] = [xy[1], xy[0]];
  }
}
export function tileId(z: number, x: number, y: number): number {
  let acc = 0;
  for (let tz = 0; tz < z; tz++) acc += (1 << tz) * (1 << tz);
  const n = 1 << z;
  let d = 0;
  const xy = [x, y];
  for (let s = n / 2; s > 0; s = Math.floor(s / 2)) {
    const rx = (xy[0] & s) > 0 ? 1 : 0;
    const ry = (xy[1] & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    rotate(n, xy, rx, ry);
  }
  return acc + d;
}
function varint(n: number) {
  const out: number[] = [];
  do {
    let b = n & 0x7f;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Buffer.from(out);
}
type Entry = { tileId: number; offset: number; length: number; runLength: number };
function serializeDir(entries: Entry[]) {
  const parts = [varint(entries.length)];
  let last = 0;
  for (const e of entries) {
    parts.push(varint(e.tileId - last));
    last = e.tileId;
  }
  for (const e of entries) parts.push(varint(e.runLength));
  for (const e of entries) parts.push(varint(e.length));
  let next = 0;
  entries.forEach((e, i) => {
    parts.push(varint(i > 0 && e.offset === next ? 0 : e.offset + 1));
    next = e.offset + e.length;
  });
  return Buffer.concat(parts);
}

export function writePmtiles(
  file: string,
  tiles: Map<number, Buffer>,
  o: { minZoom: number; maxZoom: number; bounds: [number, number, number, number]; metadata: object },
) {
  const ids = [...tiles.keys()].sort((a, b) => a - b);
  const entries: Entry[] = [];
  const blobs: Buffer[] = [];
  let off = 0;
  for (const id of ids) {
    const buf = tiles.get(id)!;
    entries.push({ tileId: id, offset: off, length: buf.length, runLength: 1 });
    blobs.push(buf);
    off += buf.length;
  }
  const data = Buffer.concat(blobs);
  const root = zlib.gzipSync(serializeDir(entries), { level: 9 });
  if (root.length > 16257) throw new Error(`root directory too large (${root.length} B)`);
  const meta = zlib.gzipSync(Buffer.from(JSON.stringify(o.metadata)));
  const h = Buffer.alloc(127);
  h.write("PMTiles", 0, "utf8");
  h.writeUInt8(3, 7);
  const rootOff = 127;
  const metaOff = rootOff + root.length;
  const dataOff = metaOff + meta.length;
  h.writeBigUInt64LE(BigInt(rootOff), 8);
  h.writeBigUInt64LE(BigInt(root.length), 16);
  h.writeBigUInt64LE(BigInt(metaOff), 24);
  h.writeBigUInt64LE(BigInt(meta.length), 32);
  h.writeBigUInt64LE(0n, 40);
  h.writeBigUInt64LE(0n, 48);
  h.writeBigUInt64LE(BigInt(dataOff), 56);
  h.writeBigUInt64LE(BigInt(data.length), 64);
  h.writeBigUInt64LE(BigInt(entries.length), 72);
  h.writeBigUInt64LE(BigInt(entries.length), 80);
  h.writeBigUInt64LE(BigInt(blobs.length), 88);
  h.writeUInt8(1, 96);
  h.writeUInt8(2, 97);
  h.writeUInt8(2, 98);
  h.writeUInt8(1, 99);
  h.writeUInt8(o.minZoom, 100);
  h.writeUInt8(o.maxZoom, 101);
  const [w, s, e, n] = o.bounds;
  h.writeInt32LE(Math.round(w * 1e7), 102);
  h.writeInt32LE(Math.round(s * 1e7), 106);
  h.writeInt32LE(Math.round(e * 1e7), 110);
  h.writeInt32LE(Math.round(n * 1e7), 114);
  h.writeUInt8(o.minZoom + 2, 118);
  h.writeInt32LE(Math.round(((w + e) / 2) * 1e7), 119);
  h.writeInt32LE(Math.round(((s + n) / 2) * 1e7), 123);
  fs.writeFileSync(file, Buffer.concat([h, root, meta, data]));
  return data.length;
}
