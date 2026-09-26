import { COINS, RE_BELLO, SETTEBELLO, card, primieraValue, rankOf, suitOf, type CardId, type SuitIndex } from './cards.ts';
import type { RulesConfig } from './config.ts';

export type CategoryId = 'cards' | 'coins' | 'settebello' | 'primiera' | 'reBello' | 'napola' | 'piccola' | 'grande' | 'scope' | 'declarations';

export interface CategoryResult {
  id: CategoryId;
  /** The measured quantity per side (count, primiera total, run length). null = not eligible (e.g. missing a suit). */
  values: (number | null)[];
  /** Winning side, or null for a tie / nobody. For additive categories (scope) this is null. */
  winner: number | null;
  /** Points each side scores from this category. */
  points: number[];
  /** Cards that illustrate the result, per side. */
  cards: CardId[][];
  /** Primiera only: the card chosen from each suit, per side (null where the suit is missing). */
  primiera?: (CardId | null)[][];
  tie: boolean;
}

export interface HandScore {
  categories: CategoryResult[];
  totals: number[];
  /** A side that won the whole match outright this hand (Napoleone / Cappotto). */
  instantWin: number | null;
}

export interface HandTally {
  captures: CardId[][];
  /** Scopa points per side earned in play (including Cirulla's dealer bonus). */
  scope: number[];
  /** Cirulla declaration points per side. */
  declarations: number[];
  /** The capturing cards that made each scopa, per side (for display). */
  scopaCards: CardId[][];
}

function majority(values: number[]): number | null {
  const max = Math.max(...values);
  const at = values.filter((v) => v === max).length;
  return at === 1 ? values.indexOf(max) : null;
}

export function primieraOf(captured: readonly CardId[], figures: 'flat' | 'graded'): { total: number | null; chosen: (CardId | null)[] } {
  const chosen: (CardId | null)[] = [null, null, null, null];
  for (const c of captured) {
    const s = suitOf(c);
    const cur = chosen[s];
    if (cur === null || primieraValue(c, figures) > primieraValue(cur, figures) || (primieraValue(c, figures) === primieraValue(cur, figures) && rankOf(c) > rankOf(cur))) chosen[s] = c;
  }
  if (chosen.some((c) => c === null)) return { total: null, chosen };
  return { total: chosen.reduce<number>((t, c) => t + primieraValue(c as CardId, figures), 0), chosen };
}

/** Length of the unbroken run of Coins from the Ace, capped. */
export function coinRun(captured: readonly CardId[], cap = 10): CardId[] {
  const have = new Set(captured);
  const run: CardId[] = [];
  for (let r = 1; r <= cap; r++) {
    const c = card(COINS as SuitIndex, r);
    if (!have.has(c)) break;
    run.push(c);
  }
  return run;
}

export function scoreHand(rules: RulesConfig, t: HandTally): HandScore {
  const n = t.captures.length;
  const zeros = () => Array(n).fill(0) as number[];
  const cats: CategoryResult[] = [];
  const S = rules.scoring;

  const award = (id: CategoryId, values: (number | null)[], cards: CardId[][], pts = 1, extra?: Partial<CategoryResult>) => {
    const eligible = values.map((v) => (v === null ? -Infinity : v));
    const anyEligible = eligible.some((v) => v !== -Infinity);
    const w = anyEligible ? majority(eligible) : null;
    const points = zeros();
    if (w !== null) points[w] = pts;
    cats.push({ id, values, winner: w, points, cards, tie: anyEligible && w === null, ...extra });
  };

  // Cards
  award('cards', t.captures.map((c) => c.length), t.captures.map(() => []));
  // Coins
  const coins = t.captures.map((cs) => cs.filter((c) => suitOf(c) === COINS).sort((a, b) => a - b));
  award('coins', coins.map((c) => c.length), coins);
  // Settebello
  {
    const has = t.captures.map((cs) => cs.includes(SETTEBELLO));
    const w = has.indexOf(true);
    const points = zeros();
    if (w >= 0) points[w] = 1;
    cats.push({ id: 'settebello', values: has.map((h) => (h ? 1 : 0)), winner: w >= 0 ? w : null, points, cards: has.map((h) => (h ? [SETTEBELLO] : [])), tie: false });
  }
  // Primiera
  {
    const p = t.captures.map((cs) => primieraOf(cs, S.primieraFigures));
    award('primiera', p.map((x) => x.total), p.map((x) => x.chosen.filter((c): c is CardId => c !== null)), 1, { primiera: p.map((x) => x.chosen) });
  }
  // Re Bello
  if (S.reBello) {
    const has = t.captures.map((cs) => cs.includes(RE_BELLO));
    const w = has.indexOf(true);
    const points = zeros();
    if (w >= 0) points[w] = 1;
    cats.push({ id: 'reBello', values: has.map((h) => (h ? 1 : 0)), winner: w >= 0 ? w : null, points, cards: has.map((h) => (h ? [RE_BELLO] : [])), tie: false });
  }

  let instantWin: number | null = null;
  // Napola
  if (S.napola !== 'off') {
    const runs = t.captures.map((cs) => coinRun(cs, S.napola === 'toSix' ? 6 : 10));
    const points = runs.map((r) => (r.length >= 3 ? r.length : 0));
    const w = points.findIndex((p) => p > 0);
    cats.push({ id: 'napola', values: runs.map((r) => r.length), winner: w >= 0 ? w : null, points, cards: runs, tie: false });
  }
  // Cirulla: Piccola and Grande
  if (S.piccola) {
    const runs = t.captures.map((cs) => coinRun(cs, 7));
    const points = runs.map((r) => (r.length >= 3 ? r.length : 0));
    const w = points.findIndex((p) => p > 0);
    cats.push({ id: 'piccola', values: runs.map((r) => r.length), winner: w >= 0 ? w : null, points, cards: runs, tie: false });
  }
  if (S.grande) {
    const g = [8, 9, 10].map((r) => card(COINS, r));
    const has = t.captures.map((cs) => g.every((c) => cs.includes(c)));
    const w = has.indexOf(true);
    const points = zeros();
    if (w >= 0) points[w] = 5;
    cats.push({ id: 'grande', values: has.map((h) => (h ? 1 : 0)), winner: w >= 0 ? w : null, points, cards: has.map((h) => (h ? g : [])), tie: false });
  }
  if (S.napoleone) {
    const all = coins.findIndex((c) => c.length === 10);
    if (all >= 0) instantWin = all;
  }

  // Scope (additive)
  cats.push({ id: 'scope', values: [...t.scope], winner: null, points: [...t.scope], cards: t.scopaCards.map((c) => [...c]), tie: false });
  if (t.declarations.some((d) => d > 0)) {
    cats.push({ id: 'declarations', values: [...t.declarations], winner: null, points: [...t.declarations], cards: t.captures.map(() => []), tie: false });
  }

  const totals = zeros();
  for (const c of cats) c.points.forEach((p, i) => (totals[i] += p));
  return { categories: cats, totals, instantWin };
}

/**
 * Match outcome after adding a hand. Returns the winning side, or null to keep
 * playing (nobody at target, or the leaders tied at or above it).
 */
export function matchWinner(scores: readonly number[], target: number, instantWin: number | null): number | null {
  if (instantWin !== null) return instantWin;
  const max = Math.max(...scores);
  if (max < target) return null;
  const leaders = scores.filter((s) => s === max).length;
  return leaders === 1 ? scores.indexOf(max) : null;
}
