import { FORMAT_INFO, sideOf, type Format, type PresetId } from '../rules/config.ts';
import { presetRules } from '../rules/presets.ts';
import { hashSeed } from '../rules/rng.ts';
import { apply, newMatch, playCommand, type AiLevel, type MatchState, type SeatConfig } from '../engine/match.ts';
import { viewFor } from '../engine/view.ts';
import { legalOptions, sameOption } from '../rules/capture.ts';
import { decide } from './policy.ts';

/**
 * Headless AI-vs-AI match runner. Every decision goes through `viewFor` and
 * `decide`, and every move through the engine's validating `apply`, so an
 * illegal choice is counted rather than silently corrected.
 */
export interface SimOptions {
  preset: PresetId;
  format: Format;
  /** Level per seat. */
  levels: AiLevel[];
  games: number;
  seed: number;
  target?: number;
  maxCommands?: number;
}

export interface SimReport {
  preset: PresetId;
  format: Format;
  levels: AiLevel[];
  games: number;
  /** Matches won per side. */
  winsBySide: number[];
  /** Matches won by the side of the first dealer. */
  firstDealerSideWins: number;
  /** Hands where the leading (non-dealer) side outscored the dealer's side. */
  handsLeaderAhead: number;
  handsDealerAhead: number;
  handsEven: number;
  illegal: number;
  crashes: string[];
  unfinished: number;
  decisions: number;
  decisionMsTotal: number;
  decisionMsMax: number;
  /** Final margin histogram: winner score - best loser score. */
  margins: Record<number, number>;
  /** Hands per match. */
  handsTotal: number;
  /** Mean points per hand per side. */
  pointsBySide: number[];
  msTotal: number;
}

export function simulate(o: SimOptions, now: () => number = () => performance.now()): SimReport {
  const rules = presetRules(o.preset, o.format);
  if (o.target) rules.target = o.target;
  const n = FORMAT_INFO[o.format].seats;
  const sides = FORMAT_INFO[o.format].sides;
  const rep: SimReport = {
    preset: o.preset, format: o.format, levels: o.levels, games: o.games,
    winsBySide: Array(sides).fill(0), firstDealerSideWins: 0, handsLeaderAhead: 0, handsDealerAhead: 0, handsEven: 0,
    illegal: 0, crashes: [], unfinished: 0, decisions: 0, decisionMsTotal: 0, decisionMsMax: 0, margins: {}, handsTotal: 0,
    pointsBySide: Array(sides).fill(0), msTotal: 0,
  };
  const t0 = now();
  for (let g = 0; g < o.games; g++) {
    const seats: SeatConfig[] = Array.from({ length: n }, (_, i) => ({ name: `S${i}`, kind: 'ai', level: o.levels[i % o.levels.length] }));
    const seed = hashSeed(o.seed, o.preset, o.format, o.levels.join('/'), g);
    let s: MatchState;
    try {
      s = newMatch({ rules, seats, seed }).state;
    } catch (e) { rep.crashes.push(String(e)); continue; }
    const firstDealerSide = sideOf(rules, s.dealer);
    const max = o.maxCommands ?? 4000;
    let i = 0;
    try {
      for (; i < max && s.phase !== 'matchEnd'; i++) {
        if (s.phase === 'handEnd') {
          tallyHand(rep, s, rules);
          const r = apply(s, { t: 'nextHand', seq: s.seq });
          if (!r.ok) throw new Error(r.error);
          s = r.state;
          continue;
        }
        const seat = s.hand.turn;
        const v = viewFor(s, seat);
        const d0 = now();
        const d = decide(v, seats[seat].level as AiLevel);
        const dt = now() - d0;
        rep.decisions++; rep.decisionMsTotal += dt; if (dt > rep.decisionMsMax) rep.decisionMsMax = dt;
        const legal = legalOptions(rules, s.hand.table, d.move.card);
        if (!s.hand.hands[seat].includes(d.move.card) || !legal.some((x) => sameOption(x, d.move.option))) { rep.illegal++; }
        const r = apply(s, playCommand(s, seat, d.move.card, d.move.option.kind, d.move.option.takes));
        if (!r.ok) { rep.illegal++; throw new Error(r.error); }
        s = r.state;
      }
    } catch (e) { rep.crashes.push(`game ${g}: ${String(e)}`); continue; }
    if (s.phase !== 'matchEnd') { rep.unfinished++; continue; }
    tallyHand(rep, s, rules);
    const w = s.winner as number;
    rep.winsBySide[w]++;
    if (w === firstDealerSide) rep.firstDealerSideWins++;
    const others = s.scores.filter((_, k) => k !== w);
    const margin = s.scores[w] - Math.max(...others);
    rep.margins[margin] = (rep.margins[margin] ?? 0) + 1;
  }
  rep.msTotal = now() - t0;
  if (rep.handsTotal) rep.pointsBySide = rep.pointsBySide.map((p) => p / rep.handsTotal);
  return rep;
}

function tallyHand(rep: SimReport, s: MatchState, rules: ReturnType<typeof presetRules>) {
  const h = s.history[s.history.length - 1];
  if (!h) return;
  rep.handsTotal++;
  h.totals.forEach((t, i) => (rep.pointsBySide[i] += t));
  if (FORMAT_INFO[rules.format].sides === 2) {
    const dealerSide = sideOf(rules, h.dealer);
    const d = h.totals[dealerSide], l = h.totals[1 - dealerSide];
    if (l > d) rep.handsLeaderAhead++; else if (d > l) rep.handsDealerAhead++; else rep.handsEven++;
  }
}

export function formatReport(r: SimReport): string {
  const pct = (x: number) => (100 * x / Math.max(1, r.games - r.crashes.length - r.unfinished)).toFixed(1) + '%';
  const lines = [
    `${r.preset} ${r.format}  levels ${r.levels.join(' / ')}  games ${r.games}`,
    `  wins by side: ${r.winsBySide.map((w, i) => `side ${i} ${w} (${pct(w)})`).join(', ')}`,
    `  first-dealer side won ${pct(r.firstDealerSideWins)}; hands: non-dealer ahead ${r.handsLeaderAhead}, dealer ahead ${r.handsDealerAhead}, even ${r.handsEven}`,
    `  illegal moves ${r.illegal}, crashes ${r.crashes.length}, unfinished ${r.unfinished}`,
    `  decisions ${r.decisions}, mean ${(r.decisionMsTotal / Math.max(1, r.decisions)).toFixed(2)} ms, max ${r.decisionMsMax.toFixed(1)} ms`,
    `  hands ${r.handsTotal} (${(r.handsTotal / Math.max(1, r.games)).toFixed(1)}/match), points/hand by side ${r.pointsBySide.map((p) => p.toFixed(2)).join(' / ')}`,
    `  margins ${Object.entries(r.margins).sort((a, b) => +a[0] - +b[0]).map(([m, c]) => `${m}:${c}`).join(' ')}`,
    `  wall ${(r.msTotal / 1000).toFixed(1)} s`,
  ];
  if (r.crashes.length) lines.push('  first crash: ' + r.crashes[0]);
  return lines.join('\n');
}
