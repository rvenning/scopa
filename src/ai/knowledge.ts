import { rankOf, suitOf, valueOf, type CardId } from '../rules/cards.ts';
import { sideOf, type RulesConfig } from '../rules/config.ts';
import type { PublicView } from '../engine/view.ts';
import { unseenCards } from '../engine/view.ts';

/**
 * What a seat can infer from public play: which cards are unaccounted for, and
 * the chance that a given other seat holds at least one card of each value.
 */
export interface Knowledge {
  unseen: CardId[];
  /** unseen count by capture value 1..10 (index 0 unused). */
  unseenByValue: number[];
  /** P(seat holds >= 1 card of value v), per seat, per value. Own seat = exact. */
  pHolds: number[][];
}

/** P(at least one of k specific cards among a random h-card draw from u). */
function pAtLeastOne(u: number, k: number, h: number): number {
  if (k <= 0 || h <= 0) return 0;
  if (h >= u) return 1;
  // 1 - C(u-k, h) / C(u, h)
  let p = 1;
  for (let i = 0; i < h; i++) p *= (u - k - i) / (u - i);
  return 1 - Math.max(0, p);
}

export function buildKnowledge(v: PublicView, forgetful = false): Knowledge {
  let unseen: CardId[];
  if (forgetful) {
    // Limited memory: remembers only what is in front of it now.
    const known = new Set<CardId>([...v.hand, ...v.table]);
    unseen = Array.from({ length: 40 }, (_, i) => i).filter((c) => !known.has(c));
  } else unseen = unseenCards(v);
  const unseenByValue = Array(11).fill(0);
  for (const c of unseen) unseenByValue[valueOf(c)]++;
  const u = unseen.length;
  const pHolds = Array.from({ length: v.numSeats }, (_, s) => {
    const row = Array(11).fill(0);
    if (s === v.seat) {
      for (const c of v.hand) row[valueOf(c)] = 1;
      return row;
    }
    const rev = v.revealed[s];
    const hidden = v.handSizes[s] - rev.length;
    for (let val = 1; val <= 10; val++) {
      if (rev.some((c) => valueOf(c) === val)) row[val] = 1;
      else row[val] = pAtLeastOne(u, unseenByValue[val], hidden);
    }
    return row;
  });
  return { unseen, unseenByValue, pHolds };
}

/**
 * How much a set of cards is worth to the side that takes it, in approximate
 * match points. Used both to value a capture and to price what a move leaves.
 */
export function cardWorth(rules: RulesConfig, c: CardId): number {
  let w = 0.045; // the Cards point, spread over ~21 cards
  if (suitOf(c) === 0) {
    w += 0.09; // the Coins point
    if (rankOf(c) === 7) w += 0.8; // Settebello
    if (rules.scoring.reBello && rankOf(c) === 10) w += 0.7;
    if ((rules.scoring.napola !== 'off' || rules.scoring.piccola) && rankOf(c) <= 3) w += 0.35;
    if (rules.scoring.grande && rankOf(c) >= 8) w += 0.6;
  }
  const r = rankOf(c);
  if (r === 7) w += 0.22; // Primiera
  else if (r === 6) w += 0.12;
  else if (r === 1) w += 0.07;
  return w;
}

export const setWorth = (rules: RulesConfig, cs: readonly CardId[]) => cs.reduce((t, c) => t + cardWorth(rules, c), 0);

export const isOpponent = (rules: RulesConfig, a: number, b: number) => sideOf(rules, a) !== sideOf(rules, b);
