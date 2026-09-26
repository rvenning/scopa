// Writes every card face and back as a standalone SVG to art/ (the editable
// source, regenerated from src/presentation/cardArt.ts) plus a contact sheet.
//   npm run export-art
import { mkdirSync, writeFileSync } from 'node:fs';
import { BACKS, backSvg, cardSvg } from '../src/presentation/cardArt.ts';
import { cardShort } from '../src/rules/cards.ts';

mkdirSync('art/cards', { recursive: true });
const cells: string[] = [];
for (let c = 0; c < 40; c++) {
  const name = `${String(c).padStart(2, '0')}-${cardShort(c)}.svg`;
  writeFileSync(`art/cards/${name}`, cardSvg(c));
  cells.push(`<figure><img src="cards/${name}"><figcaption>${cardShort(c)}</figcaption></figure>`);
}
for (const b of BACKS) {
  writeFileSync(`art/cards/back-${b.id}.svg`, backSvg(b.id));
  cells.push(`<figure><img src="cards/back-${b.id}.svg"><figcaption>${b.name}</figcaption></figure>`);
}
writeFileSync('art/sheet.html', `<!doctype html><meta charset="utf-8"><title>Scopa deck</title><style>body{background:#3b2a1d;margin:8px;display:grid;grid-template-columns:repeat(10,1fr);gap:8px;font:12px sans-serif;color:#eee}figure{margin:0;text-align:center}img{width:100%}</style>${cells.join('')}`);
console.log('wrote art/cards/*.svg and art/sheet.html');
