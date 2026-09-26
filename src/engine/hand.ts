import { ALL_CARDS, rankOf, type CardId } from '../rules/cards.ts';
import { legalOptions, type CaptureOption } from '../rules/capture.ts';
import { dealerBonus, declarationFor, type Declaration } from '../rules/cirulla.ts';
import { seatCount, sideCount, sideOf, type RulesConfig } from '../rules/config.ts';
import { rngFor, shuffle } from '../rules/rng.ts';

/**
 * One hand of play as plain mutable data. These functions are the single path
 * by which cards move; the match engine calls them on a copy of its state, and
 * the Expert AI calls them on determinized worlds for its rollouts.
 */
export interface HandState {
  /** Undealt cards; dealt from the front. */
  deck: CardId[];
  hands: CardId[][];
  table: CardId[];
  /** Captured cards per side. */
  captures: CardId[][];
  scope: number[];
  scopaCards: CardId[][];
  declarations: number[];
  /** Per seat: cards shown to everyone by a declaration and still in hand. */
  revealed: CardId[][];
  lastCapturer: number | null;
  turn: number;
  plays: number;
  round: number;
  redeals: number;
  /** Public record of this hand's plays (every play is seen by all). */
  history: PlayRecord[];
}

export interface PlayRecord { seat: number; card: CardId; round: number; table: CardId[]; took: CardId[] }

export type HandEvent =
  | { e: 'deal'; round: number; counts: number[]; table: CardId[] }
  | { e: 'redeal'; reason: 'kings' | 'aces' | 'twoAces' }
  | { e: 'dealerBonus'; seat: number; points: number; cards: CardId[] }
  | { e: 'declare'; seat: number; decl: Declaration }
  | { e: 'play'; seat: number; card: CardId; option: CaptureOption; scopa: boolean; final: boolean }
  | { e: 'lastTake'; seat: number | null; cards: CardId[] }
  | { e: 'handOver' };

export const nextSeat = (rules: RulesConfig, s: number) => (s + 1) % seatCount(rules);

export function cloneHand(h: HandState): HandState {
  return {
    deck: [...h.deck],
    hands: h.hands.map((x) => [...x]),
    table: [...h.table],
    captures: h.captures.map((x) => [...x]),
    scope: [...h.scope],
    scopaCards: h.scopaCards.map((x) => [...x]),
    declarations: [...h.declarations],
    revealed: h.revealed.map((x) => [...x]),
    lastCapturer: h.lastCapturer,
    turn: h.turn,
    plays: h.plays,
    round: h.round,
    redeals: h.redeals,
    history: h.history.slice(),
  };
}

function redealReason(rules: RulesConfig, table: CardId[]): 'kings' | 'aces' | 'twoAces' | null {
  const kings = table.filter((c) => rankOf(c) === 10).length;
  const aces = table.filter((c) => rankOf(c) === 1).length;
  if (rules.deal.redealOnKings && kings >= 3) return 'kings';
  if (rules.deal.redealOnAces && aces >= 1) return 'aces';
  if (rules.deal.redealOnTwoAces && aces >= 2 && dealerBonus(rules, table) === 0) return 'twoAces';
  return null;
}

/** Deal a fresh hand. Redeals (same dealer) are part of the hand's deterministic setup. */
export function startHand(rules: RulesConfig, seed: number, handNo: number, dealer: number, events: HandEvent[]): HandState {
  const seats = seatCount(rules), sides = sideCount(rules);
  for (let redeals = 0; ; redeals++) {
    const deck = shuffle([...ALL_CARDS], rngFor(seed, 'shuffle', handNo, redeals));
    const h: HandState = {
      deck,
      hands: Array.from({ length: seats }, () => []),
      table: [],
      captures: Array.from({ length: sides }, () => []),
      scope: Array(sides).fill(0),
      scopaCards: Array.from({ length: sides }, () => []),
      declarations: Array(sides).fill(0),
      revealed: Array.from({ length: seats }, () => []),
      lastCapturer: null,
      turn: nextSeat(rules, dealer),
      plays: 0,
      round: 0,
      redeals,
      history: [],
    };
    // Hands first, then the table, as dealt at a real table.
    dealHands(rules, h, dealer);
    h.table = h.deck.splice(0, rules.deal.tableSize);
    const why = redealReason(rules, h.table);
    if (why && redeals < 50) {
      events.push({ e: 'redeal', reason: why });
      continue;
    }
    events.push({ e: 'deal', round: 0, counts: h.hands.map((x) => x.length), table: [...h.table] });
    const bonus = dealerBonus(rules, h.table);
    if (bonus > 0) {
      const side = sideOf(rules, dealer);
      const cards = h.table.splice(0);
      h.captures[side].push(...cards);
      h.scope[side] += bonus;
      h.lastCapturer = dealer;
      events.push({ e: 'dealerBonus', seat: dealer, points: bonus, cards });
    }
    declareAll(rules, h, dealer, events);
    return h;
  }
}

function dealHands(rules: RulesConfig, h: HandState, dealer: number) {
  const n = seatCount(rules);
  for (let k = 0; k < n; k++) {
    const s = (dealer + 1 + k) % n;
    h.hands[s].push(...h.deck.splice(0, rules.deal.handSize));
  }
}

function declareAll(rules: RulesConfig, h: HandState, dealer: number, events: HandEvent[]) {
  if (!rules.cirulla.declarations) return;
  const n = seatCount(rules);
  for (let k = 0; k < n; k++) {
    const s = (dealer + 1 + k) % n;
    const d = declarationFor(rules, h.hands[s]);
    if (d) {
      h.declarations[sideOf(rules, s)] += d.points;
      h.revealed[s] = [...d.cards];
      events.push({ e: 'declare', seat: s, decl: d });
    }
  }
}

export const isHandOver = (h: HandState) => h.deck.length === 0 && h.hands.every((x) => x.length === 0);

/**
 * Play `card` from `seat` with `option`. Caller guarantees legality (the match
 * engine validates; the AI only picks from legalOptions). Handles refills and,
 * after the final card, gives the remaining table to the last capturer.
 */
export function playCard(rules: RulesConfig, h: HandState, dealer: number, seat: number, card: CardId, option: CaptureOption, events: HandEvent[] | null): { scopa: boolean; final: boolean } {
  const hand = h.hands[seat];
  const tableBefore = events ? h.table.slice() : [];
  hand.splice(hand.indexOf(card), 1);
  const rv = h.revealed[seat].indexOf(card);
  if (rv >= 0) h.revealed[seat].splice(rv, 1);
  const final = h.deck.length === 0 && h.hands.every((x) => x.length === 0);
  const side = sideOf(rules, seat);
  let scopa = false;
  if (option.kind === 'place') {
    h.table.push(card);
  } else {
    const takes = option.takes;
    if (takes.length) h.table = h.table.filter((c) => !takes.includes(c));
    h.captures[side].push(card, ...takes);
    h.lastCapturer = seat;
    const cleared = takes.length > 0 && h.table.length === 0;
    const counts = option.kind !== 'aceSweep' || rules.ace.sweepScoresScopa;
    if (cleared && counts && (!final || rules.scopa.finalPlay === 'counts')) {
      scopa = true;
      h.scope[side] += 1;
      h.scopaCards[side].push(card);
    }
  }
  if (events) h.history.push({ seat, card, round: h.round, table: tableBefore, took: option.kind === 'place' ? [] : option.takes.slice() });
  h.plays++;
  h.turn = nextSeat(rules, seat);
  events?.push({ e: 'play', seat, card, option, scopa, final });

  if (h.hands.every((x) => x.length === 0)) {
    if (h.deck.length > 0 && rules.deal.refill) {
      h.round++;
      dealHands(rules, h, dealer);
      events?.push({ e: 'deal', round: h.round, counts: h.hands.map((x) => x.length), table: [] });
      declareAll(rules, h, dealer, events ?? []);
    } else {
      const rest = h.table.splice(0);
      if (rest.length && h.lastCapturer !== null) h.captures[sideOf(rules, h.lastCapturer)].push(...rest);
      else if (rest.length) h.table = rest; // nobody ever captured: the cards are simply not counted
      events?.push({ e: 'lastTake', seat: h.lastCapturer, cards: rest });
      events?.push({ e: 'handOver' });
    }
  }
  return { scopa, final };
}

export function optionsFor(rules: RulesConfig, h: HandState, card: CardId): CaptureOption[] {
  return legalOptions(rules, h.table, card);
}
