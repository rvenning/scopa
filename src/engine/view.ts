import type { CardId } from '../rules/cards.ts';
import { seatCount, sideOf, type RulesConfig } from '../rules/config.ts';
import type { MatchState } from './match.ts';
import type { PlayRecord } from './hand.ts';

/**
 * Everything one seat is entitled to know. This is the ONLY input the AI gets:
 * it has no field for other hands or the undealt deck, so an AI cannot read
 * hidden state even by accident. Human UI renders from the same shape.
 */
export interface PublicView {
  readonly rules: RulesConfig;
  readonly seat: number;
  readonly side: number;
  readonly numSeats: number;
  readonly dealer: number;
  readonly turn: number;
  readonly hand: readonly CardId[];
  readonly table: readonly CardId[];
  readonly handSizes: readonly number[];
  readonly deckCount: number;
  /** Captured cards per side. Every capture happens face up, so all players have seen them. */
  readonly captures: readonly (readonly CardId[])[];
  /** Per seat: cards shown by a Cirulla declaration and still held. */
  readonly revealed: readonly (readonly CardId[])[];
  readonly scope: readonly number[];
  readonly scores: readonly number[];
  readonly lastCapturer: number | null;
  readonly plays: number;
  /** Deal round within the hand (0 = the first deal). */
  readonly round: number;
  /** Every play of this hand so far, as all players saw it. */
  readonly history: readonly PlayRecord[];
  readonly handNo: number;
  readonly matchSeed: number;
}

export function viewFor(s: MatchState, seat: number): PublicView {
  const h = s.hand;
  return {
    rules: s.setup.rules,
    seat,
    side: sideOf(s.setup.rules, seat),
    numSeats: seatCount(s.setup.rules),
    dealer: s.dealer,
    turn: h.turn,
    hand: [...h.hands[seat]],
    table: [...h.table],
    handSizes: h.hands.map((x) => x.length),
    deckCount: h.deck.length,
    captures: h.captures.map((x) => [...x]),
    revealed: h.revealed.map((x, i) => (i === seat ? [] : [...x])),
    scope: [...h.scope],
    scores: [...s.scores],
    lastCapturer: h.lastCapturer,
    plays: h.plays,
    round: h.round,
    history: h.history.map((p) => ({ ...p, table: [...p.table], took: [...p.took] })),
    handNo: s.handNo,
    matchSeed: s.setup.seed,
  };
}

/** Cards this seat cannot locate: in other hands (unrevealed) or the undealt deck. */
export function unseenCards(v: PublicView): CardId[] {
  const known = new Set<CardId>([...v.hand, ...v.table]);
  for (const c of v.captures) for (const x of c) known.add(x);
  for (const r of v.revealed) for (const x of r) known.add(x);
  const out: CardId[] = [];
  for (let c = 0; c < 40; c++) if (!known.has(c)) out.push(c);
  return out;
}
