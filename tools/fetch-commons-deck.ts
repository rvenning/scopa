// Downloads the Neapolitan deck from Wikimedia Commons (full resolution, kept as
// the editable source in art/source/commons/) and records each file's licence,
// author and URL in art/source/commons/manifest.json. Run once; the files are
// committed so the build never touches the network.
//   node tools/fetch-commons-deck.ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';

const UA = 'ScopaBuild/1.0 (https://github.com/rvenning/scopa)';
const SUITS = ['denari', 'coppe', 'spade', 'bastoni'];
const RANKS = ['Asso', 'Due', 'Tre', 'Quattro', 'Cinque', 'Sei', 'Sette', 'Otto', 'Nove', 'Dieci'];
const titles: { id: number | 'back'; title: string }[] = [];
for (let s = 0; s < 4; s++) for (let r = 0; r < 10; r++) {
  const n = s * 10 + r + 1;
  const suit = n === 40 ? 'Bastoni' : SUITS[s];
  titles.push({ id: s * 10 + r, title: `File:${String(n).padStart(2, '0')} ${RANKS[r]} di ${suit}.jpg` });
}
titles.push({ id: 'back', title: 'File:Carte Napoletane retro.jpg' });

const dir = 'art/source/commons';
mkdirSync(dir, { recursive: true });
const manifest: Record<string, unknown>[] = [];
const strip = (s = '') => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

for (let i = 0; i < titles.length; i += 20) {
  const batch = titles.slice(i, i + 20);
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(batch.map((b) => b.title).join('|'))}&prop=imageinfo&iiprop=url|size|extmetadata|sha1&format=json`;
  const data = await (await fetch(url, { headers: { 'User-Agent': UA } })).json();
  const pages = Object.values(data.query.pages) as { title: string; imageinfo: { url: string; descriptionurl: string; width: number; height: number; sha1: string; extmetadata: Record<string, { value: string }> }[] }[];
  for (const b of batch) {
    const p = pages.find((x) => x.title === b.title.replace(/_/g, ' '));
    if (!p?.imageinfo) throw new Error('missing ' + b.title);
    const ii = p.imageinfo[0];
    const m = ii.extmetadata;
    const file = `${dir}/${b.id === 'back' ? 'back' : String(b.id).padStart(2, '0')}.jpg`;
    if (!existsSync(file)) {
      let res = await fetch(ii.url, { headers: { 'User-Agent': UA } });
      for (let tries = 0; res.status === 429 && tries < 6; tries++) {
        await new Promise((r) => setTimeout(r, 5000 * (tries + 1))); // rate limited: back off
        res = await fetch(ii.url, { headers: { 'User-Agent': UA } });
      }
      if (!res.ok) throw new Error(`${res.status} ${ii.url}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      await new Promise((r) => setTimeout(r, 1500)); // be polite to Commons
    }
    manifest.push({
      card: b.id, file, title: b.title, source: ii.descriptionurl, original: ii.url, width: ii.width, height: ii.height, sha1: ii.sha1,
      licence: strip(m.LicenseShortName?.value), licenceUrl: strip(m.LicenseUrl?.value) || 'https://commons.wikimedia.org/wiki/Template:PD-user-it',
      author: strip(m.Artist?.value), credit: strip(m.Credit?.value), date: strip(m.DateTimeOriginal?.value || m.DateTime?.value),
      retrieved: new Date().toISOString().slice(0, 10),
    });
    console.log(b.title, '->', file, strip(m.LicenseShortName?.value));
  }
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} files, manifest written`);
