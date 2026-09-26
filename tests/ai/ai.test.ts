import { afterEach, describe, expect, it } from 'vitest';

// These tests are long and synchronous: give the runner's I/O a turn between them.
afterEach(() => new Promise<void>((r) => setTimeout(r, 5)));
import { decide, allMoves, determinize, inferAbsentValues } from '../../src/ai/policy.ts';
import { simulate } from '../../src/ai/simulate.ts';
import { cloneMatch, newMatch } from '../../src/engine/match.ts';
import { viewFor } from '../../src/engine/view.ts';
import { sameOption } from '../../src/rules/capture.ts';
import { PRESETS, PRESET_ORDER, presetRules } from '../../src/rules/presets.ts';
import { makeRng } from '../../src/rules/rng.ts';
import { seats } from '../helpers.ts';
import type { AiLevel } from '../../src/engine/match.ts';

const LEVELS: AiLevel[] = ['relaxed', 'standard', 'expert'];

describe('AI legality and termination', () => {
  for (const p of PRESET_ORDER) {
    for (const f of PRESETS[p].formats) {
      it(`${p} ${f}: all levels play whole matches legally`, () => {
        const r = simulate({ preset: p, format: f, levels: f === '2p' ? ['expert', 'relaxed'] : ['relaxed', 'standard', 'expert', 'standard'], games: f === '2p' ? 2 : 1, seed: 11 });
        expect(r.illegal).toBe(0);
        expect(r.crashes).toEqual([]);
        expect(r.unfinished).toBe(0);
      });
    }
  }
  it('many fast Standard/Relaxed matches in every preset: no illegal moves or hangs', () => {
    for (const p of PRESET_ORDER) {
      const r = simulate({ preset: p, format: PRESETS[p].recommended, levels: ['standard', 'relaxed'], games: 40, seed: 5 });
      expect(r.illegal + r.crashes.length + r.unfinished, p).toBe(0);
    }
  });
});

describe('AI information boundary', () => {
  it('decisions depend only on the public view: shuffling hidden cards changes nothing', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const rules = presetRules('classic', '4t');
      const { state } = newMatch({ rules, seats: seats(4), seed });
      const me = state.hand.turn;
      // A second world: same public information, different hidden cards.
      const alt = cloneMatch(state);
      const hidden = [...alt.hand.deck, ...alt.hand.hands.filter((_, s) => s !== me).flat()];
      const rng = makeRng(seed * 31);
      for (let i = hidden.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [hidden[i], hidden[j]] = [hidden[j], hidden[i]]; }
      alt.hand.deck = hidden.splice(0, alt.hand.deck.length);
      for (let s = 0; s < 4; s++) if (s !== me) alt.hand.hands[s] = hidden.splice(0, alt.hand.hands[s].length);
      expect(viewFor(alt, me)).toEqual(viewFor(state, me));
      for (const lvl of LEVELS) {
        const a = decide(viewFor(state, me), lvl);
        const b = decide(viewFor(alt, me), lvl);
        expect(a.move.card).toBe(b.move.card);
        expect(sameOption(a.move.option, b.move.option)).toBe(true);
      }
    }
  });
  it('fixed seed, state and settings reproduce the decision', () => {
    const { state } = newMatch({ rules: presetRules('classic'), seats: seats(2), seed: 77 });
    const v = viewFor(state, state.hand.turn);
    for (const lvl of LEVELS) expect(decide(v, lvl)).toEqual(decide(v, lvl));
  });
  it('determinized worlds keep known cards and hand sizes', () => {
    const { state } = newMatch({ rules: presetRules('cirulla', '4t'), seats: seats(4), seed: 9 });
    const v = viewFor(state, 0);
    const w = determinize(v, makeRng(1), inferAbsentValues(v));
    expect(w.hands[0]).toEqual(v.hand);
    w.hands.forEach((h, s) => expect(h.length).toBe(v.handSizes[s]));
    expect(new Set([...w.deck, ...w.hands.flat(), ...w.table, ...w.captures.flat()]).size).toBe(40);
    for (let s = 1; s < 4; s++) for (const c of v.revealed[s]) expect(w.hands[s]).toContain(c);
  });
  it('the AI only ever picks from the legal-move generator', () => {
    const { state } = newMatch({ rules: presetRules('quindici'), seats: seats(2), seed: 4 });
    const v = viewFor(state, state.hand.turn);
    const legal = allMoves(v);
    for (const lvl of LEVELS) {
      const d = decide(v, lvl);
      expect(legal.some((m) => m.card === d.move.card && sameOption(m.option, d.move.option))).toBe(true);
    }
  });
});

describe('AI decision time', () => {
  it('Expert stays inside a phone-appropriate budget on desktop hardware', () => {
    const r = simulate({ preset: 'scientifico', format: '4t', levels: ['expert'], games: 1, seed: 3 });
    // A phone is several times slower than the test machine; the UI also runs the AI in a worker.
    const slack = process.env.CI ? 2.5 : 1; // shared CI runners are slower than a desktop
    expect(r.decisionMsMax).toBeLessThan(600 * slack);
    expect(r.decisionMsTotal / r.decisions).toBeLessThan(60 * slack);
  });
});

describe('difficulty ordering (small sample; `npm run sim` runs thousands)', () => {
  // One game at a time, yielding between them, so a long run never blocks the test runner.
  const pts = async (a: AiLevel, b: AiLevel, games: number) => {
    let first = 0, second = 0, hands = 0;
    for (let g = 0; g < games; g++) {
      for (const [lv, flip] of [[[a, b], false], [[b, a], true]] as [AiLevel[], boolean][]) {
        const r = simulate({ preset: 'classic', format: '2p', levels: lv, games: 1, seed: 2026 + g * 2 + (flip ? 1 : 0) });
        const p0 = r.pointsBySide[0] * r.handsTotal, p1 = r.pointsBySide[1] * r.handsTotal;
        first += flip ? p1 : p0; second += flip ? p0 : p1; hands += r.handsTotal;
      }
      await new Promise((res) => setTimeout(res, 0));
    }
    return (first - second) / hands;
  };
  it('Standard outscores Relaxed per hand', async () => expect(await pts('standard', 'relaxed', 120)).toBeGreaterThan(0.4));
  it('Expert outscores Standard per hand', async () => expect(await pts('expert', 'standard', 8)).toBeGreaterThan(0.1));
});
