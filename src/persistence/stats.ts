import type { MatchState } from '../engine/match.ts';
import { readJson, remove, writeJson } from './storage.ts';

export interface Stats {
  version: 1;
  matchesPlayed: number;
  /** Matches won by a side containing at least one local human. */
  humanWins: number;
  humanLosses: number;
  handsPlayed: number;
  scope: number;
  settebelli: number;
  bestHand: number;
  byPreset: Record<string, { played: number; won: number }>;
  recorded: string[]; // ids of matches already counted
}

const blank = (): Stats => ({ version: 1, matchesPlayed: 0, humanWins: 0, humanLosses: 0, handsPlayed: 0, scope: 0, settebelli: 0, bestHand: 0, byPreset: {}, recorded: [] });

export const loadStats = (): Stats => ({ ...blank(), ...(readJson<Stats>('stats') ?? {}) });
export const resetStats = () => remove('stats');

/** Record a finished match once. Only human seats' results count toward wins. */
export function recordMatch(s: MatchState) {
  const st = loadStats();
  const id = `${s.setup.seed}-${s.log.length}`;
  if (st.recorded.includes(id)) return;
  st.recorded = [...st.recorded.slice(-50), id];
  st.matchesPlayed++;
  st.handsPlayed += s.history.length;
  const humanSides = new Set(s.setup.seats.map((x, i) => (x.kind === 'human' ? (s.setup.rules.format === '4t' ? i % 2 : i) : -1)).filter((x) => x >= 0));
  const preset = (st.byPreset[s.setup.rules.preset] ??= { played: 0, won: 0 });
  preset.played++;
  if (humanSides.size) {
    if (s.winner !== null && humanSides.has(s.winner)) { st.humanWins++; preset.won++; } else st.humanLosses++;
  }
  for (const h of s.history) for (const side of humanSides) st.bestHand = Math.max(st.bestHand, h.totals[side] ?? 0);
  writeJson('stats', st);
}

/** Count a finished hand's scope and settebello for human sides. */
export function recordHand(s: MatchState) {
  const st = loadStats();
  const humanSides = new Set(s.setup.seats.map((x, i) => (x.kind === 'human' ? (s.setup.rules.format === '4t' ? i % 2 : i) : -1)).filter((x) => x >= 0));
  const sc = s.lastScore;
  if (!sc) return;
  for (const side of humanSides) {
    st.scope += sc.categories.find((c) => c.id === 'scope')?.points[side] ?? 0;
    st.settebelli += sc.categories.find((c) => c.id === 'settebello')?.points[side] ?? 0;
  }
  writeJson('stats', st);
}
