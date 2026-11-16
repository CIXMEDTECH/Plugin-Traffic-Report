#!/usr/bin/env node
// Build the plugin package: dist/<id>-<version>.zip with the manifest, the script,
// ui/ and fonts/, nothing else. The zip is reproducible (fixed timestamps, sorted
// entries), so the same sources always give the same SHA-256 — the plugin market
// and the panel check packages by that digest.
//
//   node scripts/pack.mjs [--check-tag v1.2.3]
import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "vespera-plugin.json"), "utf8"));
const { id, version } = manifest;
if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(id || "")) throw new Error(`bad plugin id ${id}`);
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version || "")) throw new Error(`bad version ${version}`);

const tagAt = process.argv.indexOf("--check-tag");
if (tagAt !== -1) {
  const tag = process.argv[tagAt + 1] || "";
  if (tag.replace(/^v/, "") !== version) throw new Error(`tag ${tag} does not match the manifest version ${version}`);
}

const walk = (dir) =>
  fs.existsSync(path.join(root, dir))
    ? fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`;
        if (e.name.startsWith(".")) return [];
        return e.isDirectory() ? walk(rel) : [rel];
      })
    : [];
const files = ["vespera-plugin.json", manifest.entry || "main.js", ...walk("ui"), ...walk("fonts")].sort();

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

// 1980-01-01 00:00, the earliest DOS date: nothing of the build machine leaks in.
const DOS_TIME = 0, DOS_DATE = (0 << 9) | (1 << 5) | 1;
const locals = [], centrals = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(path.join(root, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name, "utf8");
  const crc = crc32(data);
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(0x0800, 6); // UTF-8 names
  head.writeUInt16LE(8, 8); // deflate
  head.writeUInt16LE(DOS_TIME, 10);
  head.writeUInt16LE(DOS_DATE, 12);
  head.writeUInt32LE(crc, 14);
  head.writeUInt32LE(packed.length, 18);
  head.writeUInt32LE(data.length, 22);
  head.writeUInt16LE(nameBuf.length, 26);
  head.writeUInt16LE(0, 28);
  locals.push(head, nameBuf, packed);
  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4);
  dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt16LE(DOS_TIME, 12);
  dir.writeUInt16LE(DOS_DATE, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(packed.length, 20);
  dir.writeUInt32LE(data.length, 24);
  dir.writeUInt16LE(nameBuf.length, 28);
  dir.writeUInt32LE(offset, 42);
  centrals.push(dir, nameBuf);
  offset += head.length + nameBuf.length + packed.length;
}
const central = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
const zip = Buffer.concat([...locals, central, end]);

const out = path.join(root, "dist", `${id}-${version}.zip`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zip);
const sha256 = createHash("sha256").update(zip).digest("hex");
fs.writeFileSync(`${out}.sha256`, `${sha256}  ${path.basename(out)}\n`);
console.log(JSON.stringify({ id, version, file: path.relative(root, out), size: zip.length, sha256 }));
