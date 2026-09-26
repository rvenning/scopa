// Turns the CC0 ambientCG colour maps in art/source/textures into the four
// seamless table tiles in src/ui/textures/ (tinted and toned for card contrast).
//   node tools/build-textures.ts
import { mkdirSync } from 'node:fs';
import sharp, { type Sharp } from 'sharp';

const SRC = 'art/source/textures', OUT = 'src/ui/textures';
mkdirSync(OUT, { recursive: true });
const S = 512;
// sharp applies greyscale() LAST whatever the call order, so desaturate in a pass of its own before tinting.
const grey = async (src: string) => sharp(await sharp(src).resize(S, S).greyscale().toBuffer());
const jobs: { out: string; src: string; grey?: boolean; op: (s: Sharp) => Sharp }[] = [
  // Walnut: warm, a touch darker so cream cards read clearly.
  { out: 'walnut', src: 'Wood066', op: (s) => s.modulate({ brightness: 0.78, saturation: 0.95 }) },
  // Felt: neutral felt, dyed deep card-room green.
  { out: 'felt', src: 'Fabric034', grey: true, op: (s) => s.linear(0.5, 0).tint({ r: 34, g: 88, b: 54 }) },
  // Café marble: cream veined marble, toned down a little.
  { out: 'marble', src: 'Marble014', op: (s) => s.modulate({ brightness: 0.86, saturation: 1.05 }) },
  // Rustic linen: plain weave, dyed flax.
  { out: 'linen', src: 'Fabric036', grey: true, op: (s) => s.linear(0.9, 0).tint({ r: 196, g: 164, b: 118 }) },
];
for (const j of jobs) {
  const src = `${SRC}/${j.src}_1K-JPG_Color.jpg`;
  await j.op(j.grey ? await grey(src) : sharp(src).resize(S, S)).webp({ quality: 80 }).toFile(`${OUT}/${j.out}.webp`);
  console.log('wrote', `${OUT}/${j.out}.webp`);
}
