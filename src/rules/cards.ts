/**
 * The 40-card Italian deck. A card is a number 0..39: suit * 10 + (rank - 1).
 * Rank 1..7 are Ace..7; 8 Fante, 9 Cavallo, 10 Re. Rank equals capture value.
 */
export type CardId = number;
export type SuitIndex = 0 | 1 | 2 | 3;

/** Denari (Coins), Coppe (Cups), Spade (Swords), Bastoni (Clubs). */
export const SUITS = [
  { key: 'denari', it: 'Denari', en: 'Coins', short: 'D' },
  { key: 'coppe', it: 'Coppe', en: 'Cups', short: 'C' },
  { key: 'spade', it: 'Spade', en: 'Swords', short: 'S' },
  { key: 'bastoni', it: 'Bastoni', en: 'Clubs', short: 'B' },
] as const;

export const COINS: SuitIndex = 0;
export const CUPS: SuitIndex = 1;

export const RANK_NAMES: Record<number, { it: string; en: string; short: string }> = {
  1: { it: 'Asso', en: 'Ace', short: 'A' },
  2: { it: 'Due', en: 'Two', short: '2' },
  3: { it: 'Tre', en: 'Three', short: '3' },
  4: { it: 'Quattro', en: 'Four', short: '4' },
  5: { it: 'Cinque', en: 'Five', short: '5' },
  6: { it: 'Sei', en: 'Six', short: '6' },
  7: { it: 'Sette', en: 'Seven', short: '7' },
  8: { it: 'Fante', en: 'Jack', short: 'F' },
  9: { it: 'Cavallo', en: 'Knight', short: 'C' },
  10: { it: 'Re', en: 'King', short: 'R' },
};

export const ALL_CARDS: readonly CardId[] = Array.from({ length: 40 }, (_, i) => i);

export const card = (suit: SuitIndex, rank: number): CardId => suit * 10 + (rank - 1);
export const suitOf = (c: CardId): SuitIndex => Math.floor(c / 10) as SuitIndex;
export const rankOf = (c: CardId): number => (c % 10) + 1;
/** Capture value: Ace 1, 2–7 face, Fante 8, Cavallo 9, Re 10. */
export const valueOf = (c: CardId): number => (c % 10) + 1;

export const SETTEBELLO = card(COINS, 7);
export const RE_BELLO = card(COINS, 10);
/** Cirulla's wild card, the 7 of Cups. */
export const MATTA = card(CUPS, 7);

/** Primiera values. `graded` is the regional K10/C9/F8 alternative. */
export function primieraValue(c: CardId, figures: 'flat' | 'graded' = 'flat'): number {
  const r = rankOf(c);
  switch (r) {
    case 7: return 21;
    case 6: return 18;
    case 1: return 16;
    case 5: return 15;
    case 4: return 14;
    case 3: return 13;
    case 2: return 12;
    default: return figures === 'graded' ? r : 10;
  }
}

export function cardName(c: CardId): string {
  return `${RANK_NAMES[rankOf(c)].en} of ${SUITS[suitOf(c)].en}`;
}
export function cardNameIt(c: CardId): string {
  const r = rankOf(c);
  const s = SUITS[suitOf(c)].it;
  return `${RANK_NAMES[r].it} di ${s}`;
}
export function cardShort(c: CardId): string {
  return RANK_NAMES[rankOf(c)].short + SUITS[suitOf(c)].short;
}
