import { MATTA, rankOf, valueOf, type CardId } from './cards.ts';
import type { RulesConfig } from './config.ts';

export type DeclarationKind = 'barsega' | 'decino';
export interface Declaration { kind: DeclarationKind; points: number; cards: CardId[] }

/**
 * Cirulla declarations for a freshly dealt three-card hand. Three of a kind
 * (decino) scores 10; a total of 9 or less (bàrsega) scores 3; only the better
 * one counts. The Matta may take any value 1–10 when it makes one.
 */
export function declarationFor(rules: RulesConfig, hand: readonly CardId[]): Declaration | null {
  if (!rules.cirulla.declarations || hand.length !== 3) return null;
  const wild = rules.cirulla.matta ? hand.filter((c) => c === MATTA).length : 0;
  const fixed = hand.filter((c) => !(rules.cirulla.matta && c === MATTA));
  const ranks = fixed.map(rankOf);
  const allSame = ranks.every((r) => r === ranks[0]);
  if (allSame && (fixed.length === 3 || wild > 0)) return { kind: 'decino', points: 10, cards: [...hand] };
  const fixedSum = fixed.reduce((t, c) => t + valueOf(c), 0);
  if (fixedSum + wild * 1 <= 9) return { kind: 'barsega', points: 3, cards: [...hand] };
  return null;
}

/**
 * The dealer's bonus for the initial face-up cards: 15 → 1 scopa, 30 → 2.
 * With the Matta face up it may count as any value that makes 15 or 30.
 */
export function dealerBonus(rules: RulesConfig, table: readonly CardId[]): number {
  if (!rules.cirulla.dealerBonus || table.length === 0) return 0;
  const hasMatta = rules.cirulla.matta && table.includes(MATTA);
  const base = table.reduce((t, c) => t + (hasMatta && c === MATTA ? 0 : valueOf(c)), 0);
  const totals = hasMatta ? Array.from({ length: 10 }, (_, i) => base + i + 1) : [base];
  if (totals.includes(30)) return 2;
  if (totals.includes(15)) return 1;
  return 0;
}
