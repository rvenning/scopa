import { legalOptions } from '../src/rules/capture.ts';
import type { Format, PresetId, RulesConfig } from '../src/rules/config.ts';
import { presetRules } from '../src/rules/presets.ts';
import { makeRng } from '../src/rules/rng.ts';
import { apply, newMatch, playCommand, type MatchState, type SeatConfig, type Command } from '../src/engine/match.ts';

export function seats(n: number): SeatConfig[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, kind: 'ai' as const, level: 'relaxed' as const }));
}

/** Play a whole match with uniformly random legal moves. */
export function randomMatch(rules: RulesConfig, seed: number, maxCommands = 5000): { state: MatchState; log: Command[] } {
  const n = rules.format === '2p' ? 2 : rules.format === '3p' ? 3 : 4;
  let s = newMatch({ rules, seats: seats(n), seed }).state;
  const rng = makeRng(seed ^ 0x5eed);
  for (let i = 0; i < maxCommands && s.phase !== 'matchEnd'; i++) {
    let cmd: Command;
    if (s.phase === 'handEnd') cmd = { t: 'nextHand', seq: s.seq };
    else {
      const seat = s.hand.turn;
      const hand = s.hand.hands[seat];
      const c = hand[Math.floor(rng() * hand.length)];
      const opts = legalOptions(rules, s.hand.table, c);
      const o = opts[Math.floor(rng() * opts.length)];
      cmd = playCommand(s, seat, c, o.kind, o.takes);
    }
    const r = apply(s, cmd);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return { state: s, log: s.log };
}

export const ALL_CONFIGS: [PresetId, Format][] = [
  ['classic', '2p'], ['classic', '3p'], ['classic', '4p'], ['classic', '4t'],
  ['scopone', '4t'], ['scientifico', '4t'],
  ['assi', '2p'], ['assi', '4t'], ['quindici', '2p'], ['quindici', '3p'],
  ['napola', '2p'], ['napola', '4t'], ['cirulla', '2p'], ['cirulla', '3p'], ['cirulla', '4t'],
];

export const rulesFor = (p: PresetId, f: Format) => presetRules(p, f);
