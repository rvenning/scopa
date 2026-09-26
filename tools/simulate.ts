// Developer simulation runner: thousands of seeded AI games, headless.
//   npm run sim                       -> the standard report (all presets, difficulty ladder, seat bias)
//   npm run sim -- --games 500 --preset classic --format 2p --levels expert,standard
//   npm run sim -- --json out.json    -> also write the raw reports
import { writeFileSync } from 'node:fs';
import { formatReport, simulate, type SimReport } from '../src/ai/simulate.ts';
import type { AiLevel } from '../src/engine/match.ts';
import type { Format, PresetId } from '../src/rules/config.ts';
import { PRESETS, PRESET_ORDER } from '../src/rules/presets.ts';

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const games = Number(opt('games', '400'));
const seed = Number(opt('seed', '20260926'));
const reports: SimReport[] = [];
const run = (preset: PresetId, format: Format, levels: AiLevel[], g = games) => {
  const r = simulate({ preset, format, levels, games: g, seed });
  reports.push(r);
  console.log(formatReport(r) + '\n');
  return r;
};

if (opt('preset')) {
  run(opt('preset') as PresetId, (opt('format') ?? PRESETS[opt('preset') as PresetId].recommended) as Format, (opt('levels') ?? 'standard,standard').split(',') as AiLevel[]);
} else {
  console.log('== Seat / dealer bias: every preset, equal Standard seats ==\n');
  for (const p of PRESET_ORDER) for (const f of PRESETS[p].formats) run(p, f, ['standard'], Math.max(50, Math.floor(games / 2)));
  console.log('== Difficulty ladder (Classic 2p, both seat orders) ==\n');
  for (const [a, b] of [['standard', 'relaxed'], ['relaxed', 'standard'], ['expert', 'standard'], ['standard', 'expert'], ['expert', 'relaxed']] as AiLevel[][]) run('classic', '2p', [a, b]);
  console.log('== Every preset, Expert vs Relaxed ==\n');
  for (const p of PRESET_ORDER) run(p, PRESETS[p].recommended, ['expert', 'relaxed'], Math.max(40, Math.floor(games / 4)));
}
const bad = reports.reduce((t, r) => t + r.illegal + r.crashes.length + r.unfinished, 0);
const json = opt('json');
if (json) writeFileSync(json, JSON.stringify(reports, null, 1));
console.log(bad ? `FAIL: ${bad} illegal/crashed/unfinished games` : `OK: ${reports.reduce((t, r) => t + r.games, 0)} games, no illegal moves, crashes or hangs`);
process.exit(bad ? 1 : 0);
