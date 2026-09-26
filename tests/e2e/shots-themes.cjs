// Screenshots of the table in every surface (and both card styles) for review.
//   node tests/e2e/shots-themes.cjs [baseUrl]
const { driver } = require('./driver.cjs');
const { execFileSync } = require('node:child_process');
const BASE = process.argv[2] || 'http://localhost:8134/';
const FIX = JSON.parse(execFileSync(process.execPath, [require('node:path').join(__dirname, 'make-fixtures.ts')], { encoding: 'utf8' }));
(async () => {
  const d = await driver({ base: BASE });
  try {
    for (const [table, style, back] of [['walnut', 'traditional', 'cubi'], ['felt', 'traditional', 'rosso'], ['marble', 'traditional', 'blu'], ['linen', 'traditional', 'verde'], ['walnut', 'original', 'sole']]) {
      await d.goto(BASE);
      await d.js((fx, st) => { localStorage.clear(); localStorage.setItem('scopa:settings', JSON.stringify(st)); localStorage.setItem('scopa:match', JSON.stringify(fx)); }, FIX.multi, { tutorialSeen: true, table, cardStyle: style, cardBack: back });
      await d.goto(BASE);
      await d.tapText('Continue match');
      await d.waitFor(() => document.querySelectorAll('.hand .card img').length === 3);
      await d.wait(900);
      await d.shot(`theme-${table}-${style}`);
      console.log('shot', table, style);
    }
  } finally { await d.close(); }
})();
