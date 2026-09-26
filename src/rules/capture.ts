import { rankOf, valueOf, type CardId } from './cards.ts';
import type { RulesConfig } from './config.ts';

/**
 * The one authoritative legal-move generator. UI, AI, tutorial and tests all
 * call `legalOptions`; nothing else decides what a card may take.
 */
export type CaptureKind = 'place' | 'match' | 'sum' | 'fifteen' | 'aceSweep' | 'aceSelf';

export interface CaptureOption {
  kind: CaptureKind;
  /** Table cards taken, sorted ascending. Empty for place and aceSelf. */
  takes: CardId[];
}

const KIND_ORDER: Record<CaptureKind, number> = { match: 0, sum: 1, fifteen: 2, aceSweep: 3, aceSelf: 4, place: 5 };

/** All subsets of `table` (size >= minSize) whose values total `target`, each sorted, deterministic order. */
export function subsetsSumming(table: readonly CardId[], target: number, minSize = 1): CardId[][] {
  const cards = [...table].sort((a, b) => valueOf(a) - valueOf(b) || a - b);
  const out: CardId[][] = [];
  const pick: CardId[] = [];
  const dfs = (start: number, remaining: number) => {
    if (remaining === 0) {
      if (pick.length >= minSize) out.push([...pick].sort((a, b) => a - b));
      return;
    }
    for (let i = start; i < cards.length; i++) {
      const v = valueOf(cards[i]);
      if (v > remaining) break; // sorted by value, so nothing later fits either
      pick.push(cards[i]);
      dfs(i + 1, remaining - v);
      pick.pop();
    }
  };
  if (target > 0) dfs(0, target);
  return out;
}

function equalFamily(table: readonly CardId[], v: number, priority: boolean): CaptureOption[] {
  const matches = table.filter((c) => valueOf(c) === v);
  const out: CaptureOption[] = matches.map((c) => ({ kind: 'match', takes: [c] }));
  if (!priority || matches.length === 0) {
    for (const s of subsetsSumming(table, v, 2)) out.push({ kind: 'sum', takes: s });
  }
  return out;
}

function fifteenFamily(table: readonly CardId[], v: number, fewest: boolean): CaptureOption[] {
  let sets = subsetsSumming(table, 15 - v, 1);
  if (fewest && sets.length) {
    const min = Math.min(...sets.map((s) => s.length));
    sets = sets.filter((s) => s.length === min);
  }
  return sets.map((s) => ({ kind: 'fifteen' as const, takes: s }));
}

/**
 * Every legal way to play `played` onto `table`. Always non-empty: if nothing
 * can be captured the single option is `place`.
 */
export function legalOptions(rules: RulesConfig, table: readonly CardId[], played: CardId): CaptureOption[] {
  const v = valueOf(played);
  const cap = rules.capture;
  let opts: CaptureOption[] = [];

  const isAce = rankOf(played) === 1;
  const aceOnTable = table.some((c) => rankOf(c) === 1);
  const aceSweeps = rules.ace.sweep && isAce && table.length > 0 && (!aceOnTable || rules.ace.withAceOnTable === 'sweeps');

  if (aceSweeps) {
    opts.push({ kind: 'aceSweep', takes: [...table].sort((a, b) => a - b) });
    // Cirulla lets the Ace make fifteen instead; elsewhere the sweep is the capture.
    if (cap.mode === 'cirulla') opts.push(...fifteenFamily(table, v, false));
  } else if (cap.mode === 'sum') {
    opts = equalFamily(table, v, cap.exactMatchPriority);
  } else if (cap.mode === 'fifteen') {
    opts = fifteenFamily(table, v, cap.fifteenFewestCards);
    if (cap.fifteenAllowsEqual) opts.push(...equalFamily(table, v, true));
  } else {
    opts = [...equalFamily(table, v, cap.exactMatchPriority), ...fifteenFamily(table, v, false)];
  }

  if (rules.ace.sweep && isAce && table.length === 0 && rules.ace.toEmptyTable === 'takesItself') {
    opts.push({ kind: 'aceSelf', takes: [] });
  }

  // Dedupe identical take-sets (a set can arise in two families only in theory, but be safe).
  const seen = new Set<string>();
  opts = opts.filter((o) => {
    const k = o.kind === 'aceSelf' ? 'self' : o.takes.join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  opts.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.takes.length - b.takes.length || cmpArr(a.takes, b.takes));

  if (opts.length === 0) return [{ kind: 'place', takes: [] }];
  if (aceSweeps && rules.ace.mayDecline) opts.push({ kind: 'place', takes: [] });
  return opts;
}

function cmpArr(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

export function sameOption(a: CaptureOption, b: CaptureOption): boolean {
  return a.kind === b.kind && a.takes.length === b.takes.length && a.takes.every((c, i) => c === b.takes[i]);
}

/** Find the legal option that takes exactly `takes` (order-insensitive), if any. */
export function findOption(options: CaptureOption[], takes: readonly CardId[], kind?: CaptureKind): CaptureOption | undefined {
  const s = [...takes].sort((a, b) => a - b);
  return options.find((o) => (kind ? o.kind === kind : true) && o.takes.length === s.length && o.takes.every((c, i) => c === s[i]))
    // an empty take-set is ambiguous between place and aceSelf; prefer the explicit kind or place
    ?? undefined;
}

/** Human-readable arithmetic for a capture, e.g. "7 = 3 + 4" or "6 + 4 + 5 = 15". */
export function optionEquation(rules: RulesConfig, played: CardId, o: CaptureOption): string {
  const v = valueOf(played);
  const vals = o.takes.map(valueOf).sort((a, b) => a - b);
  switch (o.kind) {
    case 'match': return `${v} = ${vals[0]}`;
    case 'sum': return `${v} = ${vals.join(' + ')}`;
    case 'fifteen': return `${v} + ${vals.join(' + ')} = 15`;
    case 'aceSweep': return 'Ace takes the whole table';
    case 'aceSelf': return 'Ace takes itself';
    case 'place': return rules.capture.mode === 'fifteen' ? 'Nothing makes 15 — the card is placed on the table' : 'No capture — the card is placed on the table';
  }
}
