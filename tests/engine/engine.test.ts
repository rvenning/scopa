import { describe, expect, it } from 'vitest';
import { card, rankOf, type CardId } from '../../src/rules/cards.ts';
import { legalOptions } from '../../src/rules/capture.ts';
import { presetRules } from '../../src/rules/presets.ts';
import { playCard, startHand, type HandEvent, type HandState } from '../../src/engine/hand.ts';
import { apply, migrateMatch, newMatch, playCommand, replay } from '../../src/engine/match.ts';
import { unseenCards, viewFor } from '../../src/engine/view.ts';
import { ALL_CONFIGS, randomMatch, rulesFor, seats } from '../helpers.ts';

const C = (rank: number, suit: number) => card(suit as 0, rank);

function emptyHand(sides: number, seatsN: number): HandState {
  return {
    deck: [], hands: Array.from({ length: seatsN }, () => []), table: [],
    captures: Array.from({ length: sides }, () => []), scope: Array(sides).fill(0), scopaCards: Array.from({ length: sides }, () => []),
    declarations: Array(sides).fill(0), revealed: Array.from({ length: seatsN }, () => []), lastCapturer: null, turn: 0, plays: 0, round: 0, redeals: 0, history: [],
  };
}

describe('dealing', () => {
  for (const [p, f] of ALL_CONFIGS) {
    it(`${p} ${f}: deals the right counts and exhausts the deck exactly`, () => {
      const R = rulesFor(p, f);
      const ev: HandEvent[] = [];
      const h = startHand(R, 42, 1, 0, ev);
      const total = h.deck.length + h.table.length + h.hands.flat().length + h.captures.flat().length;
      expect(total).toBe(40);
      if (!R.cirulla.dealerBonus || h.captures.flat().length === 0) expect(h.table.length).toBe(R.deal.tableSize);
      for (const x of h.hands) expect(x.length).toBe(R.deal.handSize);
      expect(new Set([...h.deck, ...h.table, ...h.hands.flat(), ...h.captures.flat()]).size).toBe(40);
    });
  }
  it('the player to the dealer’s right leads', () => {
    const R = presetRules('classic', '4p');
    const h = startHand(R, 1, 1, 2, []);
    expect(h.turn).toBe(3);
  });
  it('three Kings face up forces a redeal with the same dealer', () => {
    const R = presetRules('classic');
    let found = false;
    for (let seed = 0; seed < 4000 && !found; seed++) {
      const ev: HandEvent[] = [];
      const h = startHand(R, seed, 1, 0, ev);
      if (ev.some((e) => e.e === 'redeal')) {
        found = true;
        expect(h.redeals).toBeGreaterThan(0);
        expect(h.table.filter((c) => rankOf(c) === 10).length).toBeLessThan(3);
      }
    }
    expect(found).toBe(true);
  });
  it('the dealer rotates to the right after every hand', () => {
    const R = presetRules('classic');
    const { state } = randomMatch(R, 7);
    const dealers = state.history.map((h) => h.dealer);
    for (let i = 1; i < dealers.length; i++) expect(dealers[i]).toBe((dealers[i - 1] + 1) % 2);
  });
});

describe('play', () => {
  const R = presetRules('classic');
  it('a capture that clears the table is a scopa', () => {
    const h = emptyHand(2, 2);
    h.hands = [[C(7, 1), C(2, 2)], [C(9, 1)]];
    h.deck = [C(1, 3)];
    h.table = [C(3, 0), C(4, 0)];
    const ev: HandEvent[] = [];
    const r = playCard(R, h, 1, 0, C(7, 1), legalOptions(R, h.table, C(7, 1))[0], ev);
    expect(r.scopa).toBe(true);
    expect(h.scope).toEqual([1, 0]);
    expect(h.captures[0].sort()).toEqual([C(7, 1), C(3, 0), C(4, 0)].sort());
    expect(h.lastCapturer).toBe(0);
  });
  it('the final play never scores a scopa by default, but the cards are taken', () => {
    const h = emptyHand(2, 2);
    h.hands = [[C(7, 1)], []];
    h.table = [C(7, 0)];
    const r = playCard(R, h, 1, 0, C(7, 1), legalOptions(R, h.table, C(7, 1))[0], []);
    expect(r).toEqual({ scopa: false, final: true });
    expect(h.scope).toEqual([0, 0]);
  });
  it('scientifico: the final play does score', () => {
    const S = presetRules('scientifico');
    const h = emptyHand(2, 4);
    h.hands = [[C(7, 1)], [], [], []];
    h.table = [C(7, 0)];
    expect(playCard(S, h, 3, 0, C(7, 1), legalOptions(S, h.table, C(7, 1))[0], []).scopa).toBe(true);
  });
  it('remaining table cards go to the last capturer’s side', () => {
    const h = emptyHand(2, 4);
    const R4 = presetRules('classic', '4t');
    h.hands = [[], [], [], [C(9, 1)]];
    h.table = [C(2, 0), C(5, 3)];
    h.lastCapturer = 2; // partner of seat 0 → side 0
    h.turn = 3;
    const ev: HandEvent[] = [];
    playCard(R4, h, 0, 3, C(9, 1), { kind: 'place', takes: [] }, ev);
    expect(h.captures[0].sort()).toEqual([C(2, 0), C(5, 3), C(9, 1)].sort());
    expect(ev.some((e) => e.e === 'lastTake' && e.seat === 2)).toBe(true);
  });
  it('ace sweep scores only when the option says so', () => {
    const A = presetRules('assi');
    const h = emptyHand(2, 2);
    h.hands = [[C(1, 1), C(4, 2)], [C(3, 3)]];
    h.deck = [C(9, 0)];
    h.table = [C(5, 0), C(6, 2)];
    expect(playCard(A, h, 1, 0, C(1, 1), legalOptions(A, h.table, C(1, 1))[0], []).scopa).toBe(false);
    const P = presetRules('assi'); P.ace.sweepScoresScopa = true;
    const h2 = emptyHand(2, 2);
    h2.hands = [[C(1, 1), C(4, 2)], [C(3, 3)]];
    h2.deck = [C(9, 0)];
    h2.table = [C(5, 0), C(6, 2)];
    expect(playCard(P, h2, 1, 0, C(1, 1), legalOptions(P, h2.table, C(1, 1))[0], []).scopa).toBe(true);
  });
});

describe('match engine', () => {
  it('rejects illegal and duplicate commands', () => {
    const { state: s } = newMatch({ rules: presetRules('classic'), seats: seats(2), seed: 99 });
    const seat = s.hand.turn;
    const other = 1 - seat;
    expect(apply(s, playCommand(s, other, s.hand.hands[other][0], 'place', [])).ok).toBe(false);
    const c = s.hand.hands[seat][0];
    const o = legalOptions(s.setup.rules, s.hand.table, c)[0];
    const cmd = playCommand(s, seat, c, o.kind, o.takes);
    const r1 = apply(s, cmd);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(apply(r1.state, cmd).ok).toBe(false); // same seq twice
    // input state untouched
    expect(s.hand.hands[seat]).toContain(c);
    // not-your-card and forged capture
    const s2 = r1.state;
    const seat2 = s2.hand.turn;
    expect(apply(s2, playCommand(s2, seat2, 39 - s2.hand.hands[seat2][0], 'place', [])).ok).toBe(false);
    const c2 = s2.hand.hands[seat2][0];
    const legal = legalOptions(s2.setup.rules, s2.hand.table, c2);
    if (legal[0].kind !== 'place') expect(apply(s2, playCommand(s2, seat2, c2, 'place', [])).ok).toBe(false); // must capture
  });

  for (const [p, f] of ALL_CONFIGS) {
    it(`${p} ${f}: random full matches terminate, account for every card, and replay exactly`, () => {
      const R = rulesFor(p, f);
      for (let seed = 1; seed <= 6; seed++) {
        const { state } = randomMatch(R, seed * 7919);
        expect(state.phase).toBe('matchEnd');
        expect(state.winner).not.toBeNull();
        const w = state.winner as number;
        const max = Math.max(...state.scores);
        if (state.lastScore?.instantWin == null) {
          expect(state.scores[w]).toBe(max);
          expect(max).toBeGreaterThanOrEqual(R.target);
          expect(state.scores.filter((x) => x === max).length).toBe(1);
        }
        const h = state.hand;
        expect(h.captures.flat().length + h.table.length).toBe(40);
        const again = replay(state.setup, state.log);
        expect(again).toEqual(state);
        // serialization round-trip
        expect(migrateMatch(JSON.parse(JSON.stringify(state)))).toEqual(state);
      }
    });
  }

  it('every hand’s points add up to the running score', () => {
    const { state } = randomMatch(presetRules('napola'), 5);
    let run = [0, 0];
    for (const h of state.history) {
      run = run.map((v, i) => v + h.totals[i]);
      expect(h.scoresAfter).toEqual(run);
    }
    expect(state.scores).toEqual(run);
  });

  it('refuses saves from the future', () => {
    const { state } = newMatch({ rules: presetRules('classic'), seats: seats(2), seed: 1 });
    expect(() => migrateMatch({ ...state, schema: 99 })).toThrow(/newer/);
  });
});

describe('public view', () => {
  it('exposes no other hand and no deck', () => {
    const { state } = newMatch({ rules: presetRules('classic', '4t'), seats: seats(4), seed: 3 });
    const v = viewFor(state, 0);
    const keys = Object.keys(v);
    expect(keys).not.toContain('deck');
    expect(keys).not.toContain('hands');
    const json = JSON.stringify(v);
    for (const s of [1, 2, 3]) for (const c of state.hand.hands[s]) expect(v.hand).not.toContain(c);
    expect(json.length).toBeLessThan(3000);
    const unseen = unseenCards(v);
    expect(unseen.length).toBe(40 - v.hand.length - v.table.length);
    for (const c of state.hand.deck) expect(unseen).toContain(c);
  });
  it('Cirulla declarations reveal cards to the other seats only', () => {
    const R = presetRules('cirulla', '2p');
    for (let seed = 0; seed < 300; seed++) {
      const { state } = newMatch({ rules: R, seats: seats(2), seed });
      const s = state.hand.revealed.findIndex((r) => r.length);
      if (s < 0) continue;
      const other = 1 - s;
      expect(viewFor(state, other).revealed[s]).toEqual(state.hand.revealed[s]);
      expect(viewFor(state, s).revealed[s]).toEqual([]);
      return;
    }
    throw new Error('no declaration found in 300 seeds');
  });
});

describe('Cirulla deal specials', () => {
  it('the dealer bonus captures the table and scores scope', () => {
    const R = presetRules('cirulla', '2p');
    for (let seed = 0; seed < 3000; seed++) {
      const ev: HandEvent[] = [];
      const h = startHand(R, seed, 1, 0, ev);
      const b = ev.find((e) => e.e === 'dealerBonus');
      if (!b || b.e !== 'dealerBonus') continue;
      expect(h.table).toEqual([]);
      expect(h.scope[0]).toBe(b.points);
      expect(h.captures[0].length).toBe(4);
      return;
    }
    throw new Error('no dealer bonus in 3000 seeds');
  });
  it('two Aces face up force a redeal unless the dealer bonus applies', () => {
    const R = presetRules('cirulla', '2p');
    for (let seed = 0; seed < 3000; seed++) {
      const h = startHand(R, seed, 1, 0, []);
      const aces = h.table.filter((c: CardId) => rankOf(c) === 1).length;
      expect(aces).toBeLessThan(2);
    }
  });
});
