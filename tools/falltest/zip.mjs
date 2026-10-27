/** ZIP ohne Kompression (Textdateien), wie zipOhneKompression in der App – ohne zusätzliche Pakete */
const TAB = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TAB[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** dateien: [name, text][] → Buffer */
export function zipErstellen(dateien) {
  const teile = [];
  const verz = [];
  let pos = 0;
  for (const [name, text] of dateien) {
    const n = Buffer.from(name, "utf8");
    const d = Buffer.from(text, "utf8");
    const crc = crc32(d);
    const kopf = Buffer.alloc(30);
    kopf.writeUInt32LE(0x04034b50, 0);
    kopf.writeUInt16LE(20, 4);
    kopf.writeUInt16LE(0x0800, 6); // UTF-8-Namen
    kopf.writeUInt16LE(0, 8);
    kopf.writeUInt32LE(0, 10);
    kopf.writeUInt32LE(crc, 14);
    kopf.writeUInt32LE(d.length, 18);
    kopf.writeUInt32LE(d.length, 22);
    kopf.writeUInt16LE(n.length, 26);
    kopf.writeUInt16LE(0, 28);
    teile.push(kopf, n, d);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(0, 10);
    c.writeUInt32LE(0, 12);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(d.length, 20);
    c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(pos, 42);
    verz.push(c, n);
    pos += 30 + n.length + d.length;
  }
  const v = Buffer.concat(verz);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(dateien.length, 8);
  ende.writeUInt16LE(dateien.length, 10);
  ende.writeUInt32LE(v.length, 12);
  ende.writeUInt32LE(pos, 16);
  return Buffer.concat([...teile, v, ende]);
}
