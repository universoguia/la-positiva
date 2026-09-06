/* Genera los iconos PNG de marca de La Positiva sin dependencias externas.
   El motivo es un plato visto desde arriba: crema con borde dorado sobre
   terracota. Se usa en vez de la foto de un plato, que no sirve como icono.
   Uso:  node scripts/make-icons.js                                        */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const TERRACOTA = [0xb4, 0x47, 0x2a];
const DORADO    = [0xc8, 0x96, 0x3e];
const CREMA     = [0xf3, 0xec, 0xe2];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  // Cada scanline lleva un byte de filtro (0 = None) y luego RGB.
  const raw = Buffer.alloc(size * (1 + size * 3));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      const c = pixel(x, y);
      raw[p++] = c[0]; raw[p++] = c[1]; raw[p++] = c[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // 8 bits por canal
  ihdr[9] = 2;    // color type 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// Antialiasing simple por supermuestreo de 3x3.
function makePlate(size, plateRatio) {
  const c = (size - 1) / 2;
  const rOut = size * plateRatio;
  const rIn = rOut * 0.72;
  return (x, y) => {
    let acc = [0, 0, 0];
    for (let sy = 0; sy < 3; sy++) {
      for (let sx = 0; sx < 3; sx++) {
        const dx = x + (sx + 0.5) / 3 - 0.5 - c;
        const dy = y + (sy + 0.5) / 3 - 0.5 - c;
        const d = Math.sqrt(dx * dx + dy * dy);
        const col = d <= rIn ? CREMA : (d <= rOut ? DORADO : TERRACOTA);
        acc[0] += col[0]; acc[1] += col[1]; acc[2] += col[2];
      }
    }
    return [Math.round(acc[0] / 9), Math.round(acc[1] / 9), Math.round(acc[2] / 9)];
  };
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });

const jobs = [
  // Los normales usan un plato grande; el maskable lo achica para
  // respetar la zona segura del 80% que recortan Android y Chrome.
  ['icon-192.png', 192, 0.34],
  ['icon-512.png', 512, 0.34],
  ['icon-512-maskable.png', 512, 0.26],
  ['apple-touch-icon.png', 180, 0.34]
];

for (const [name, size, ratio] of jobs) {
  const buf = png(size, makePlate(size, ratio));
  fs.writeFileSync(path.join(outDir, name), buf);
  console.log(name.padEnd(24), size + 'x' + size, buf.length + ' bytes');
}
