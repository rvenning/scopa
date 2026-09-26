import { describe, expect, it } from 'vitest';
import { ALL_CARDS, card, rankOf, valueOf, type CardId } from '../../src/rules/cards.ts';
import { legalOptions, optionEquation, subsetsSumming, type CaptureOption } from '../../src/rules/capture.ts';
import type { RulesConfig } from '../../src/rules/config.ts';
import { presetRules } from '../../src/rules/presets.ts';
import { makeRng, shuffle } from '../../src/rules/rng.ts';

const C = (rank: number, suit = 0) => card(suit as 0, rank);
const takes = (o: CaptureOption[]) => o.map((x) => `${x.kind}:${x.takes.join(',')}`);

describe('card values', () => {
  it('every card of every suit has the right capture value', () => {
    for (const c of ALL_CARDS) {
      const r = (c % 10) + 1;
      expect(valueOf(c)).toBe(r);
      expect(rankOf(c)).toBe(r);
    }
    expect(valueOf(C(8))).toBe(8); // Fante
    expect(valueOf(C(9))).toBe(9); // Cavallo
    expect(valueOf(C(10))).toBe(10); // Re
  });
});

describe('classic capture', () => {
  const R = presetRules('classic');
  it('exact match beats a sum of the same value', () => {
    const table = [C(3, 1), C(4, 2), C(7, 3)];
    expect(takes(legalOptions(R, table, C(7, 0)))).toEqual([`match:${C(7, 3)}`]);
  });
  it('two exact matches are two distinct choices', () => {
    const table = [C(5, 1), C(5, 2), C(2, 3), C(3, 3)];
    const o = legalOptions(R, table, C(5, 0));
    expect(o.map((x) => x.kind)).toEqual(['match', 'match']);
    expect(o.map((x) => x.takes[0]).sort()).toEqual([C(5, 1), C(5, 2)].sort());
  });
  it('enumerates overlapping combinations', () => {
    const table = [C(1, 1), C(2, 1), C(3, 1), C(4, 1), C(5, 2)];
    const o = legalOptions(R, table, C(6, 0));
    const sets = o.map((x) => x.takes.map(valueOf).sort().join('+'));
    expect(sets.sort()).toEqual(['1+2+3', '1+5', '2+4'].sort());
    expect(o.every((x) => x.kind === 'sum')).toBe(true);
  });
  it('no capture means place', () => {
    const o = legalOptions(R, [C(9, 1), C(8, 2)], C(3, 0));
    expect(o).toEqual([{ kind: 'place', takes: [] }]);
    expect(optionEquation(R, C(3, 0), o[0])).toMatch(/placed/);
  });
  it('empty table means place', () => {
    expect(legalOptions(R, [], C(1, 0))).toEqual([{ kind: 'place', takes: [] }]);
  });
  it('an Ace does not sweep in Classic', () => {
    expect(legalOptions(R, [C(4, 1), C(9, 2)], C(1, 0))).toEqual([{ kind: 'place', takes: [] }]);
  });
});

/** Independent reference: all subsets by bitmask, straight from the rule text. */
function reference(R: RulesConfig, table: CardId[], played: CardId): Set<string> {
  const v = valueOf(played);
  const subsets: CardId[][] = [];
  for (let m = 1; m < 1 << table.length; m++) subsets.push(table.filter((_, i) => m & (1 << i)));
  const sum = (s: CardId[]) => s.reduce((t, c) => t + valueOf(c), 0);
  const key = (k: string, s: CardId[]) => `${k}:${[...s].sort((a, b) => a - b).join(',')}`;
  const out = new Set<string>();
  const isAce = v === 1;
  const aceOnTable = table.some((c) => valueOf(c) === 1);
  const eq = (priority: boolean) => {
    const singles = subsets.filter((s) => s.length === 1 && sum(s) === v);
    for (const s of singles) out.add(key('match', s));
    if (!priority || singles.length === 0) for (const s of subsets) if (s.length >= 2 && sum(s) === v) out.add(key('sum', s));
  };
  const fif = (fewest: boolean) => {
    let f = subsets.filter((s) => sum(s) + v === 15);
    if (fewest && f.length) { const m = Math.min(...f.map((s) => s.length)); f = f.filter((s) => s.length === m); }
    for (const s of f) out.add(key('fifteen', s));
  };
  if (R.ace.sweep && isAce && table.length && (!aceOnTable || R.ace.withAceOnTable === 'sweeps')) {
    out.add(key('aceSweep', table));
    if (R.capture.mode === 'cirulla') {
      fif(false);
      // a fifteen that takes the whole table is the same capture as the sweep
      out.delete(key('fifteen', table));
    }
  } else if (R.capture.mode === 'sum') eq(R.capture.exactMatchPriority);
  else if (R.capture.mode === 'fifteen') { fif(R.capture.fifteenFewestCards); if (R.capture.fifteenAllowsEqual) eq(true); }
  else { eq(R.capture.exactMatchPriority); fif(false); }
  if (R.ace.sweep && isAce && !table.length && R.ace.toEmptyTable === 'takesItself') out.add('aceSelf:');
  if (out.size === 0) out.add('place:');
  else if (R.ace.sweep && isAce && table.length && (!aceOnTable || R.ace.withAceOnTable === 'sweeps') && R.ace.mayDecline) out.add('place:');
  return out;
}

describe('legal options are legal, unique and complete (property test)', () => {
  const variants: [string, RulesConfig][] = [];
  for (const id of ['classic', 'assi', 'quindici', 'cirulla', 'napola'] as const) variants.push([id, presetRules(id)]);
  const q2 = presetRules('quindici'); q2.capture.fifteenAllowsEqual = true; q2.capture.fifteenFewestCards = false; variants.push(['quindici v2', q2]);
  const a2 = presetRules('assi'); a2.ace.withAceOnTable = 'sweeps'; a2.ace.toEmptyTable = 'takesItself'; a2.ace.mayDecline = true; variants.push(['assi house', a2]);
  const c2 = presetRules('cirulla'); c2.capture.exactMatchPriority = false; variants.push(['cirulla free', c2]);

  for (const [name, R] of variants) {
    it(`${name}: 3000 random tables match the brute-force reference`, () => {
      const rng = makeRng(1234);
      for (let trial = 0; trial < 3000; trial++) {
        const deck = shuffle([...ALL_CARDS], rng);
        const n = Math.floor(rng() * 9); // 0..8 table cards
        const table = deck.slice(0, n);
        const played = deck[n];
        const got = legalOptions(R, table, played);
        const keys = takes(got);
        expect(new Set(keys).size).toBe(keys.length); // unique
        for (const o of got) for (const t of o.takes) expect(table).toContain(t); // legal cards
        expect(new Set(keys)).toEqual(reference(R, table, played)); // complete and nothing extra
        // deterministic
        expect(takes(legalOptions(R, [...table].reverse(), played))).toEqual(keys);
      }
    });
  }
});

describe('Scopa d’Assi', () => {
  const R = presetRules('assi');
  it('an Ace sweeps a table with no Ace', () => {
    const t = [C(4, 1), C(9, 2), C(6, 3)];
    expect(legalOptions(R, t, C(1, 0))).toEqual([{ kind: 'aceSweep', takes: [...t].sort((a, b) => a - b) }]);
  });
  it('with an Ace on the table, the played Ace takes only an Ace', () => {
    const t = [C(1, 1), C(9, 2)];
    expect(takes(legalOptions(R, t, C(1, 0)))).toEqual([`match:${C(1, 1)}`]);
  });
  it('house rule: sweeps anyway', () => {
    const r = presetRules('assi'); r.ace.withAceOnTable = 'sweeps';
    expect(legalOptions(r, [C(1, 1), C(9, 2)], C(1, 0))[0].kind).toBe('aceSweep');
  });
  it('to an empty table it stays, or takes itself', () => {
    expect(legalOptions(R, [], C(1, 0))[0].kind).toBe('place');
    const r = presetRules('assi'); r.ace.toEmptyTable = 'takesItself';
    expect(legalOptions(r, [], C(1, 0))).toEqual([{ kind: 'aceSelf', takes: [] }]);
  });
  it('may-decline adds a place option', () => {
    const r = presetRules('assi'); r.ace.mayDecline = true;
    expect(legalOptions(r, [C(5, 1)], C(1, 0)).map((o) => o.kind)).toEqual(['aceSweep', 'place']);
  });
});

describe('Scopa di Quindici', () => {
  const R = presetRules('quindici');
  it('only fifteens capture, never an equal card', () => {
    const t = [C(6, 1), C(9, 2)];
    expect(takes(legalOptions(R, t, C(6, 0)))).toEqual([`fifteen:${C(9, 2)}`]);
  });
  it('fewest cards: 6 takes Ace+Fante or 4+5, not Ace+3+5', () => {
    const t = [C(1, 1), C(3, 1), C(4, 2), C(5, 2), C(8, 3)];
    const o = legalOptions(R, t, C(6, 0));
    expect(o.every((x) => x.takes.length === 2)).toBe(true);
    expect(o.map((x) => x.takes.map(valueOf).sort((a, b) => a - b).join('+')).sort()).toEqual(['1+8', '4+5']);
    expect(optionEquation(R, C(6, 0), o[0])).toMatch(/= 15$/);
  });
  it('without fewest-cards, larger sets are allowed', () => {
    const r = presetRules('quindici'); r.capture.fifteenFewestCards = false;
    const t = [C(1, 1), C(3, 1), C(4, 2), C(5, 2), C(8, 3)];
    expect(legalOptions(r, t, C(6, 0)).some((x) => x.takes.length === 3)).toBe(true);
  });
  it('a Re makes 15 with a 5', () => {
    expect(legalOptions(R, [C(5, 3)], C(10, 0))[0]).toEqual({ kind: 'fifteen', takes: [C(5, 3)] });
  });
});

describe('Cirulla capture', () => {
  const R = presetRules('cirulla');
  it('offers equal and fifteen together', () => {
    const t = [C(5, 1), C(10, 2)];
    const o = legalOptions(R, t, C(5, 0));
    expect(takes(o)).toEqual([`match:${C(5, 1)}`, `fifteen:${C(10, 2)}`]);
  });
  it('equal card has priority over a sum to the same value by default', () => {
    const t = [C(5, 1), C(2, 2), C(3, 3)];
    expect(legalOptions(R, t, C(5, 0)).some((o) => o.kind === 'sum')).toBe(false);
    const free = presetRules('cirulla'); free.capture.exactMatchPriority = false;
    expect(legalOptions(free, t, C(5, 0)).some((o) => o.kind === 'sum')).toBe(true);
  });
  it('an Ace sweeps or makes fifteen', () => {
    const t = [C(10, 1), C(4, 2), C(7, 3)];
    const o = legalOptions(R, t, C(1, 0));
    expect(o.map((x) => x.kind)).toContain('aceSweep');
    expect(o.some((x) => x.kind === 'fifteen' && x.takes.map(valueOf).sort((a, b) => a - b).join() === '4,10')).toBe(true);
  });
});

describe('subsetsSumming', () => {
  it('handles large tables quickly and completely', () => {
    const table = Array.from({ length: 20 }, (_, i) => i % 10 === 9 ? i - 5 : i).slice(0, 20);
    const t0 = performance.now();
    const s = subsetsSumming(table, 10, 2);
    expect(performance.now() - t0).toBeLessThan(200);
    for (const x of s) expect(x.reduce((a, c) => a + valueOf(c), 0)).toBe(10);
  });
});
