// node tools/shot.cjs <url> <out.png> [width height dpr]
const { launch, wait } = require('./lib/cdp.cjs');
const fs = require('node:fs');
(async () => {
  const [url, out, w = 1200, h = 900, dpr = 1] = process.argv.slice(2);
  const b = await launch({ width: +w, height: +h, dpr: +dpr });
  await b.send('Page.navigate', { url });
  await wait(1500);
  const r = await b.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  if (b.logs.length) console.log(b.logs.join('\n'));
  await b.close();
})();
