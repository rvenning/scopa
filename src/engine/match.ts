import type { CardId } from '../rules/cards.ts';
import { findOption, legalOptions, type CaptureKind } from '../rules/capture.ts';
import { migrateRules, seatCount, sideCount, sideOf, type RulesConfig } from '../rules/config.ts';
import { rngFor } from '../rules/rng.ts';
import { matchWinner, scoreHand, type HandScore } from '../rules/scoring.ts';
import { validateRules } from '../rules/validate.ts';
import { cloneHand, isHandOver, nextSeat, playCard, startHand, type HandEvent, type HandState } from './hand.ts';

export const SCHEMA_VERSION = 1;

export type AiLevel = 'relaxed' | 'standard' | 'expert';
export interface SeatConfig {
  name: string;
  kind: 'human' | 'ai';
  level?: AiLevel;
  /** Personality id (see ai/personalities.ts). */
  persona?: string;
}

export interface MatchSetup {
  rules: RulesConfig;
  seats: SeatConfig[];
  seed: number;
}

export type Command =
  | { t: 'play'; seq: number; seat: number; card: CardId; kind: CaptureKind; takes: CardId[] }
  | { t: 'nextHand'; seq: number };

export interface HandRecord { handNo: number; dealer: number; totals: number[]; scoresAfter: number[] }

export interface MatchState {
  schema: number;
  setup: MatchSetup;
  scores: number[];
  handNo: number;
  dealer: number;
  phase: 'play' | 'handEnd' | 'matchEnd';
  hand: HandState;
  lastScore: HandScore | null;
  history: HandRecord[];
  winner: number | null;
  /** Every committed command, for deterministic replay. */
  log: Command[];
  /** Next expected command sequence number; guards against duplicate submission. */
  seq: number;
}

export type MatchEvent = HandEvent | { e: 'handScored'; score: HandScore } | { e: 'matchOver'; winner: number } | { e: 'newHand'; handNo: number; dealer: number };

export type Result = { ok: true; state: MatchState; events: MatchEvent[] } | { ok: false; error: string };

export function cloneMatch(s: MatchState): MatchState {
  return {
    ...s,
    setup: JSON.parse(JSON.stringify(s.setup)),
    scores: [...s.scores],
    hand: cloneHand(s.hand),
    lastScore: s.lastScore ? JSON.parse(JSON.stringify(s.lastScore)) : null,
    history: s.history.map((h) => ({ ...h, totals: [...h.totals], scoresAfter: [...h.scoresAfter] })),
    log: [...s.log],
  };
}

export function newMatch(setup: MatchSetup): { state: MatchState; events: MatchEvent[] } {
  const errs = validateRules(setup.rules);
  if (errs.length) throw new Error(errs[0]);
  if (setup.seats.length !== seatCount(setup.rules)) throw new Error('Seat count does not match the format');
  const n = seatCount(setup.rules);
  const dealer = Math.floor(rngFor(setup.seed, 'firstDealer')() * n);
  const events: MatchEvent[] = [{ e: 'newHand', handNo: 1, dealer }];
  const evs: HandEvent[] = [];
  const hand = startHand(setup.rules, setup.seed, 1, dealer, evs);
  events.push(...evs);
  const state: MatchState = {
    schema: SCHEMA_VERSION,
    setup: JSON.parse(JSON.stringify(setup)),
    scores: Array(sideCount(setup.rules)).fill(0),
    handNo: 1,
    dealer,
    phase: 'play',
    hand,
    lastScore: null,
    history: [],
    winner: null,
    log: [],
    seq: 0,
  };
  return { state, events };
}

export const currentSeat = (s: MatchState) => s.hand.turn;
export const rulesOf = (s: MatchState) => s.setup.rules;

export function legalFor(s: MatchState, card: CardId) {
  return legalOptions(s.setup.rules, s.hand.table, card);
}

/** Validate and apply one command. Never mutates the input state. */
export function apply(s: MatchState, cmd: Command): Result {
  if (cmd.seq !== s.seq) return { ok: false, error: `Stale or duplicate command (expected #${s.seq}, got #${cmd.seq})` };
  const rules = s.setup.rules;
  if (cmd.t === 'play') {
    if (s.phase !== 'play') return { ok: false, error: 'The hand is not in play' };
    if (cmd.seat !== s.hand.turn) return { ok: false, error: 'It is not that player’s turn' };
    if (!s.hand.hands[cmd.seat].includes(cmd.card)) return { ok: false, error: 'That card is not in the player’s hand' };
    const opts = legalOptions(rules, s.hand.table, cmd.card);
    const opt = findOption(opts, cmd.takes, cmd.kind);
    if (!opt) return { ok: false, error: 'That is not a legal capture' };
    const next = cloneMatch(s);
    const events: MatchEvent[] = [];
    const evs: HandEvent[] = [];
    playCard(rules, next.hand, next.dealer, cmd.seat, cmd.card, opt, evs);
    events.push(...evs);
    next.log.push(cmd);
    next.seq++;
    if (isHandOver(next.hand)) finishHand(next, events);
    return { ok: true, state: next, events };
  }
  if (cmd.t === 'nextHand') {
    if (s.phase !== 'handEnd') return { ok: false, error: 'The hand is not over' };
    const next = cloneMatch(s);
    const events: MatchEvent[] = [];
    next.handNo++;
    next.dealer = nextSeat(rules, next.dealer);
    events.push({ e: 'newHand', handNo: next.handNo, dealer: next.dealer });
    const evs: HandEvent[] = [];
    next.hand = startHand(rules, next.setup.seed, next.handNo, next.dealer, evs);
    events.push(...evs);
    next.phase = 'play';
    next.lastScore = null;
    next.log.push(cmd);
    next.seq++;
    return { ok: true, state: next, events };
  }
  return { ok: false, error: 'Unknown command' };
}

function finishHand(s: MatchState, events: MatchEvent[]) {
  const rules = s.setup.rules;
  const h = s.hand;
  const score = scoreHand(rules, { captures: h.captures, scope: h.scope, declarations: h.declarations, scopaCards: h.scopaCards });
  s.scores = s.scores.map((v, i) => v + score.totals[i]);
  s.lastScore = score;
  s.history.push({ handNo: s.handNo, dealer: s.dealer, totals: [...score.totals], scoresAfter: [...s.scores] });
  events.push({ e: 'handScored', score });
  const w = matchWinner(s.scores, rules.target, score.instantWin);
  if (w !== null) {
    s.winner = w;
    s.phase = 'matchEnd';
    events.push({ e: 'matchOver', winner: w });
  } else s.phase = 'handEnd';
}

/** Rebuild a match from its setup and command log. Throws on the first invalid command. */
export function replay(setup: MatchSetup, log: readonly Command[], upTo = log.length): MatchState {
  let s = newMatch(setup).state;
  for (let i = 0; i < upTo; i++) {
    const r = apply(s, log[i]);
    if (!r.ok) throw new Error(`Replay failed at command ${i}: ${r.error}`);
    s = r.state;
  }
  return s;
}

/** Side names for display: team seats joined, or the player name. */
export function sideMembers(s: MatchState, side: number): number[] {
  const n = seatCount(s.setup.rules);
  return Array.from({ length: n }, (_, i) => i).filter((i) => sideOf(s.setup.rules, i) === side);
}

export function playCommand(s: MatchState, seat: number, card: CardId, kind: CaptureKind, takes: CardId[]): Command {
  return { t: 'play', seq: s.seq, seat, card, kind, takes: [...takes] };
}

/** Accept a saved match of any known schema. */
export function migrateMatch(raw: unknown): MatchState {
  const m = raw as MatchState;
  if (!m || typeof m !== 'object' || typeof m.schema !== 'number') throw new Error('Not a saved match');
  if (m.schema > SCHEMA_VERSION) throw new Error('This save is from a newer version of Scopa');
  m.setup.rules = migrateRules(m.setup.rules);
  // schema 1 is current; later migrations are applied here step by step.
  return m;
}
