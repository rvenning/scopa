// Renders the app icons from the card art: the Settebello on a walnut ground.
//   npm run icons   (uses headless Edge to rasterise the SVG)
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cardSvg } from '../src/presentation/cardArt.ts';
import { card } from '../src/rules/cards.ts';

const require = createRequire(import.meta.url);
const { launch, wait } = require('./lib/cdp.cjs');
mkdirSync('public/icons', { recursive: true });
const face = cardSvg(card(0, 7)).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const icon = (pad: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a4d28"/><stop offset="1" stop-color="#3e2410"/></linearGradient></defs><rect width="512" height="512" rx="${pad ? 0 : 96}" fill="url(#g)"/><g transform="translate(${256 - 100 * (1 - pad) * 1.3}, ${256 - 160 * (1 - pad) * 1.3}) scale(${(1 - pad) * 1.3}) rotate(-6 100 160)">${face}</g></svg>`;
writeFileSync('public/icons/icon.svg', icon(0));
(async () => {
  const b = await launch({ width: 512, height: 512, dpr: 1 });
  const shots: [string, number, number][] = [['icon-512.png', 512, 0], ['icon-192.png', 192, 0], ['maskable-512.png', 512, 0.22], ['apple-touch-icon.png', 180, 0.08]];
  for (const [name, size, pad] of shots) {
    const html = `<html><body style="margin:0;background:transparent">${icon(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`;
    await b.send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
    await b.send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
    await wait(400);
    await b.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const r = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
    writeFileSync(`public/icons/${name}`, Buffer.from(r.result.data, 'base64'));
  }
  await b.close();
  console.log('icons written');
})();
