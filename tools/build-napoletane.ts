// Builds the "Traditional" card faces from the Commons scans in art/source/commons:
// each scan is multiplied onto warm paper, framed with a rounded edge and a fine
// inner rule, and written as a 480x768 WebP to public/cards/napoletane/.
//   node tools/build-napoletane.ts
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import sharp from 'sharp';

const W = 480, H = 768, R = 30;
const SRC = 'art/source/commons', OUT = 'public/cards/napoletane';
mkdirSync(OUT, { recursive: true });

// Warm paper with a very faint fibre texture.
const paper = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 0.45 0 0 0 0 0.35 0 0 0 0 0.2 0 0 0 0.06 0"/></filter>
  <radialGradient id="g" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#fbf6ea"/><stop offset="1" stop-color="#f1e7d2"/></radialGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" filter="url(#n)"/></svg>`)).png().toBuffer();

const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect x="2.5" y="2.5" width="${W - 5}" height="${H - 5}" rx="${R}" fill="none" stroke="#2b1d14" stroke-width="5"/>
  <rect x="15" y="15" width="${W - 30}" height="${H - 30}" rx="${R - 12}" fill="none" stroke="#b08a4a" stroke-width="1.6" opacity="0.55"/></svg>`);
const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="${R}" fill="#fff"/></svg>`);

async function face(src: string, out: string, opts: { inset: number; tint?: string }) {
  const art = await sharp(src).resize(W - opts.inset * 2, H - opts.inset * 2, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).toBuffer();
  let base = sharp(paper).composite([{ input: art, left: opts.inset, top: opts.inset, blend: 'multiply' }]);
  if (opts.tint) base = sharp(await base.png().toBuffer()).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${opts.tint}"/></svg>`), blend: 'screen' }]);
  const framed = await sharp(await base.png().toBuffer()).composite([{ input: frame }]).png().toBuffer();
  await sharp(framed).composite([{ input: mask, blend: 'dest-in' }]).webp({ quality: 84, alphaQuality: 90 }).toFile(out);
}

for (let c = 0; c < 40; c++) {
  const id = String(c).padStart(2, '0');
  await face(`${SRC}/${id}.jpg`, `${OUT}/${id}.webp`, { inset: 22 });
}
// The traditional back is black and white; screen it with a deep red so black becomes red, white stays paper.
await face(`${SRC}/back.jpg`, `${OUT}/back.webp`, { inset: 14, tint: '#8e2a1e' });
const total = readdirSync(OUT).reduce((t, f) => t + statSync(`${OUT}/${f}`).size, 0);
console.log(`wrote ${readdirSync(OUT).length} files, ${(total / 1024).toFixed(0)} KB`);
