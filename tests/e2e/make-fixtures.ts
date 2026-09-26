// Builds saved-match fixtures for the end-to-end tests. They are loaded the way
// a real save is — written to localStorage and restored with "Continue match" —
// so the UI under test is exactly the restore path players use.
import { card, type CardId } from '../../src/rules/cards.ts';
import { presetRules } from '../../src/rules/presets.ts';
import { newMatch, type MatchState, type SeatConfig } from '../../src/engine/match.ts';

const C = (s: number, r: number) => card(s as 0, r);
const D = 0, K = 1, S = 2, B = 3; // Coins, Cups, Swords, Clubs

function build(preset: Parameters<typeof presetRules>[0], format: Parameters<typeof presetRules>[1], seats: SeatConfig[], hand: { hands: CardId[][]; table: CardId[]; captures?: CardId[][]; deck?: CardId[] | 'rest'; turn: number; dealer: number; scores?: number[] }): MatchState {
  const rules = presetRules(preset, format);
  const m = newMatch({ rules, seats, seed: 4242 }).state;
  const used = new Set([...hand.hands.flat(), ...hand.table, ...(hand.captures ?? []).flat()]);
  const rest = Array.from({ length: 40 }, (_, i) => i).filter((i) => !used.has(i));
  m.dealer = hand.dealer;
  m.scores = hand.scores ?? m.scores;
  m.hand = {
    ...m.hand,
    hands: hand.hands.map((x) => [...x]),
    table: [...hand.table],
    captures: hand.captures ? hand.captures.map((x) => [...x]) : m.hand.captures.map(() => []),
    deck: hand.deck === 'rest' ? rest : hand.deck ?? [],
    turn: hand.turn,
    revealed: hand.hands.map(() => []),
    scope: m.hand.scope.map(() => 0),
    lastCapturer: hand.captures ? 1 : null,
    history: [],
  };
  const total = m.hand.hands.flat().length + m.hand.table.length + m.hand.captures.flat().length + m.hand.deck.length;
  if (total !== 40 && hand.deck !== undefined) throw new Error('fixture does not use 40 cards: ' + total);
  return m;
}

const you: SeatConfig = { name: 'You', kind: 'human' };
const rosa: SeatConfig = { name: 'Nonna Rosa', kind: 'ai', level: 'relaxed', persona: 'rosa' };

// 1. Several legal captures, and a no-capture card in the same hand.
//    7 of Cups: 3+4 or 2+5.  Ace of Swords: nothing on the table makes 1 -> placed.
const multi = build('classic', '2p', [you, rosa], {
  hands: [[C(K, 7), C(S, 1), C(D, 8)], [C(B, 7), C(K, 3), C(B, 1)]],
  table: [C(B, 3), C(B, 4), C(S, 2), C(B, 5)],
  deck: 'rest', turn: 0, dealer: 1,
});

// 2. Match point: last card of the hand. You already hold 7 Coins incl. the Settebello.
const allCoins = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((r) => C(D, r));
const yourPile = [...allCoins.slice(0, 7), C(K, 7), C(S, 7), C(B, 6), C(K, 1), C(S, 5), C(B, 2), C(K, 2), C(S, 3), C(B, 3), C(K, 4), C(S, 4), C(K, 5), C(S, 6), C(B, 8)];
const theirs = [C(D, 8), C(D, 9), C(D, 10), C(B, 7), C(K, 6), C(S, 8), C(S, 9), C(K, 8), C(K, 9), C(B, 9), C(B, 10), C(K, 10), C(S, 10), C(B, 4), C(B, 5), C(S, 2)];
const matchPoint = build('classic', '2p', [you, rosa], {
  hands: [[C(B, 1)], []],
  table: [C(K, 3), C(S, 1)],
  captures: [yourPile, theirs],
  deck: [], turn: 0, dealer: 1, scores: [10, 9],
});

// 3. Scopone Scientifico, ten cards each: the widest hand the layout must hold.
const sci = newMatch({ rules: presetRules('scientifico'), seats: [you, { name: 'Giulia', kind: 'ai', level: 'standard', persona: 'giulia' }, { name: 'Partner', kind: 'ai', level: 'standard', persona: 'enzo' }, { name: 'Zio Franco', kind: 'ai', level: 'standard', persona: 'franco' }], seed: 77 }).state;
sci.hand.turn = 0;

const wrap = (state: MatchState) => ({ schema: 1, savedAt: 0, appVersion: 'fixture', state, setup: state.setup, log: state.log });
console.log(JSON.stringify({ multi: wrap(multi), matchPoint: wrap(matchPoint), sci: wrap(sci) }));
