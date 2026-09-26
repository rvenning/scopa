import { describe, expect, it } from 'vitest';
import { card, primieraValue, type CardId } from '../../src/rules/cards.ts';
import { presetRules } from '../../src/rules/presets.ts';
import { coinRun, matchWinner, primieraOf, scoreHand, type HandTally } from '../../src/rules/scoring.ts';
import { declarationFor, dealerBonus } from '../../src/rules/cirulla.ts';

const C = (rank: number, suit: number) => card(suit as 0, rank);
const tally = (a: CardId[], b: CardId[], scope = [0, 0]): HandTally => ({ captures: [a, b], scope, declarations: [0, 0], scopaCards: [[], []] });
const all = Array.from({ length: 40 }, (_, i) => i);
const cat = (s: ReturnType<typeof scoreHand>, id: string) => s.categories.find((c) => c.id === id)!;

describe('primiera values', () => {
  it('matches the table', () => {
    const want: Record<number, number> = { 7: 21, 6: 18, 1: 16, 5: 15, 4: 14, 3: 13, 2: 12, 8: 10, 9: 10, 10: 10 };
    for (let r = 1; r <= 10; r++) for (let s = 0; s < 4; s++) expect(primieraValue(C(r, s))).toBe(want[r]);
    expect(primieraValue(C(8, 0), 'graded')).toBe(8);
    expect(primieraValue(C(9, 0), 'graded')).toBe(9);
    expect(primieraValue(C(10, 0), 'graded')).toBe(10);
  });
  it('picks the best card per suit and sums', () => {
    const p = primieraOf([C(7, 0), C(1, 0), C(6, 1), C(5, 2), C(10, 3), C(2, 3)], 'flat');
    expect(p.chosen).toEqual([C(7, 0), C(6, 1), C(5, 2), C(2, 3)]);
    expect(p.total).toBe(21 + 18 + 15 + 12);
  });
  it('a missing suit cannot win primiera even with a higher sum', () => {
    const a = [C(7, 0), C(7, 1), C(7, 2), C(6, 0)]; // no clubs
    const b = [C(2, 0), C(2, 1), C(2, 2), C(2, 3)];
    const s = scoreHand(presetRules('classic'), tally(a, b));
    expect(cat(s, 'primiera').values).toEqual([null, 48]);
    expect(cat(s, 'primiera').winner).toBe(1);
  });
  it('both missing a suit: nobody scores', () => {
    const s = scoreHand(presetRules('classic'), tally([C(7, 0)], [C(7, 1)]));
    expect(cat(s, 'primiera').winner).toBe(null);
    expect(cat(s, 'primiera').tie).toBe(false);
  });
  it('equal primiera ties and scores nothing', () => {
    const a = [C(7, 0), C(7, 1), C(7, 2), C(7, 3)];
    const b = [C(6, 0), C(6, 1), C(6, 2), C(6, 3), C(1, 0)];
    // 84 vs 72: a wins; now make b equal
    const s1 = scoreHand(presetRules('classic'), tally(a, b));
    expect(cat(s1, 'primiera').winner).toBe(0);
    const s2 = scoreHand(presetRules('classic'), tally([C(7, 0), C(6, 1), C(1, 2), C(5, 3)], [C(6, 0), C(7, 1), C(5, 2), C(1, 3)]));
    expect(cat(s2, 'primiera').tie).toBe(true);
    expect(cat(s2, 'primiera').points).toEqual([0, 0]);
  });
});

describe('standard categories', () => {
  const R = presetRules('classic');
  it('cards, coins, settebello, scope', () => {
    const coins = all.filter((c) => c < 10);
    const a = [...coins.filter((c) => c !== 5).slice(0, 6), C(7, 1), C(7, 2), C(7, 3), C(5, 1), C(5, 2), C(5, 3), C(4, 1), C(4, 2), C(4, 3), C(3, 1), C(3, 2), C(3, 3), C(2, 1), C(2, 2), C(2, 3)];
    const b = all.filter((c) => !a.includes(c));
    const s = scoreHand(R, tally(a, b, [2, 1]));
    expect(cat(s, 'cards').winner).toBe(0); // 21 v 19
    expect(cat(s, 'coins').winner).toBe(0); // 6 v 4
    expect(cat(s, 'settebello').winner).toBe(0);
    expect(cat(s, 'scope').points).toEqual([2, 1]);
    expect(s.totals[0]).toBe(1 + 1 + 1 + (cat(s, 'primiera').points[0]) + 2);
  });
  it('20-20 cards and 5-5 coins tie and score nothing', () => {
    const a = [...all.filter((c) => c < 5), ...all.filter((c) => c >= 10 && c < 25)];
    const b = all.filter((c) => !a.includes(c));
    const s = scoreHand(R, tally(a, b));
    expect(cat(s, 'cards').tie).toBe(true);
    expect(cat(s, 'coins').tie).toBe(true);
    expect(cat(s, 'cards').points).toEqual([0, 0]);
    expect(cat(s, 'coins').points).toEqual([0, 0]);
  });
  it('three sides: a two-way tie for most scores nothing', () => {
    const s = scoreHand(R, { captures: [[C(1, 1), C(2, 1)], [C(3, 1), C(4, 1)], [C(5, 1)]], scope: [0, 0, 0], declarations: [0, 0, 0], scopaCards: [[], [], []] });
    expect(cat(s, 'cards').winner).toBe(null);
  });
  it('Re Bello only when enabled', () => {
    expect(scoreHand(R, tally([C(10, 0)], [])).categories.some((c) => c.id === 'reBello')).toBe(false);
    const r = presetRules('classic'); r.scoring.reBello = true;
    expect(cat(scoreHand(r, tally([C(10, 0)], [])), 'reBello').points).toEqual([1, 0]);
  });
});

describe('Napola', () => {
  it('scores the run length from 3, full and capped', () => {
    const R = presetRules('napola');
    expect(coinRun([C(1, 0), C(2, 0), C(3, 0), C(4, 0), C(6, 0)]).length).toBe(4);
    const s = scoreHand(R, tally([C(1, 0), C(2, 0), C(3, 0), C(4, 0), C(5, 0), C(6, 0), C(7, 0), C(8, 0)], [C(9, 0)]));
    expect(cat(s, 'napola').points).toEqual([8, 0]);
    const r6 = presetRules('napola'); r6.scoring.napola = 'toSix';
    expect(cat(scoreHand(r6, tally([C(1, 0), C(2, 0), C(3, 0), C(4, 0), C(5, 0), C(6, 0), C(7, 0)], [])), 'napola').points).toEqual([6, 0]);
    expect(cat(scoreHand(R, tally([C(1, 0), C(2, 0)], [C(3, 0)])), 'napola').points).toEqual([0, 0]);
  });
  it('all ten Coins is Napoleone: instant win', () => {
    const R = presetRules('napola');
    const s = scoreHand(R, tally(all.filter((c) => c < 10), []));
    expect(s.instantWin).toBe(0);
    expect(cat(s, 'napola').points).toEqual([10, 0]);
  });
});

describe('Cirulla scoring and specials', () => {
  const R = presetRules('cirulla');
  it('piccola capped at 7 and grande 5', () => {
    const coins = all.filter((c) => c < 10);
    const s = scoreHand(R, tally(coins.slice(0, 9), [C(10, 0)]));
    expect(cat(s, 'piccola').points).toEqual([7, 0]);
    expect(cat(s, 'grande').points).toEqual([0, 0]);
    const g = scoreHand(R, tally([C(8, 0), C(9, 0), C(10, 0)], []));
    expect(cat(g, 'grande').points).toEqual([5, 0]);
  });
  it('cappotto: all Coins wins outright', () => {
    expect(scoreHand(R, tally(all.filter((c) => c < 10), [])).instantWin).toBe(0);
  });
  it('declarations: bàrsega, decino, matta', () => {
    expect(declarationFor(R, [C(1, 1), C(2, 2), C(5, 3)])).toMatchObject({ kind: 'barsega', points: 3 });
    expect(declarationFor(R, [C(1, 1), C(3, 2), C(6, 3)])).toBe(null); // 10
    expect(declarationFor(R, [C(9, 0), C(9, 2), C(9, 3)])).toMatchObject({ kind: 'decino', points: 10 });
    expect(declarationFor(R, [C(9, 0), C(9, 2), C(7, 1)])).toMatchObject({ kind: 'decino' }); // matta
    expect(declarationFor(R, [C(3, 0), C(5, 2), C(7, 1)])).toMatchObject({ kind: 'barsega' }); // matta as 1
    const noMatta = presetRules('cirulla'); noMatta.cirulla.matta = false;
    expect(declarationFor(noMatta, [C(9, 0), C(9, 2), C(7, 1)])).toBe(null);
  });
  it('dealer bonus 15 / 30, matta wild', () => {
    expect(dealerBonus(R, [C(1, 1), C(2, 2), C(5, 3), C(7, 2)])).toBe(1);
    expect(dealerBonus(R, [C(10, 1), C(10, 2), C(5, 3), C(5, 2)])).toBe(2);
    expect(dealerBonus(R, [C(10, 1), C(10, 2), C(3, 3), C(7, 1)])).toBe(2); // matta as 7 → 30
    expect(dealerBonus(R, [C(1, 1), C(2, 2), C(2, 3), C(7, 1)])).toBe(1); // matta as 10 → 15
    expect(dealerBonus(R, [C(1, 1), C(1, 2), C(2, 3), C(7, 1)])).toBe(0); // 4 + (1..10) never 15
    expect(dealerBonus(presetRules('classic'), [C(1, 1), C(2, 2), C(5, 3), C(7, 2)])).toBe(0);
  });
});

describe('match winner', () => {
  it('nobody at target: continue', () => expect(matchWinner([10, 9], 11, null)).toBe(null));
  it('one over target wins', () => expect(matchWinner([11, 9], 11, null)).toBe(0));
  it('both over: higher wins', () => expect(matchWinner([12, 13], 11, null)).toBe(1));
  it('tied at or above target: play on', () => expect(matchWinner([12, 12], 11, null)).toBe(null));
  it('instant win overrides', () => expect(matchWinner([0, 30], 11, 0)).toBe(0));
  it('three sides, two tied leaders over target: play on', () => expect(matchWinner([12, 12, 3], 11, null)).toBe(null));
});
