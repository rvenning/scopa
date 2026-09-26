import { rankOf, valueOf, type CardId } from '../rules/cards.ts';
import { legalOptions, type CaptureOption } from '../rules/capture.ts';
import { seatCount, sideCount, sideOf, type RulesConfig } from '../rules/config.ts';
import { hashSeed, makeRng, shuffle, type Rng } from '../rules/rng.ts';
import { scoreHand } from '../rules/scoring.ts';
import { cloneHand, isHandOver, playCard, type HandState } from '../engine/hand.ts';
import type { PublicView } from '../engine/view.ts';
import type { AiLevel } from '../engine/match.ts';
import { buildKnowledge, cardWorth, setWorth, type Knowledge } from './knowledge.ts';
import { personaById, type Persona } from './personalities.ts';

export interface Move { card: CardId; option: CaptureOption }
export interface Decision { move: Move; /** Rollout plays or evaluations spent, for diagnostics. */ work: number }

/** Every legal (card, capture) pair for the seat to move, from the one authoritative generator. */
export function allMoves(v: PublicView): Move[] {
  const out: Move[] = [];
  for (const card of [...v.hand].sort((a, b) => a - b)) for (const option of legalOptions(v.rules, v.table, card)) out.push({ card, option });
  return out;
}

const isFinalPlay = (v: PublicView) => v.deckCount === 0 && v.handSizes.reduce((a, b) => a + b, 0) === 1;

function makesScopa(rules: RulesConfig, table: readonly CardId[], m: Move, final: boolean): boolean {
  const o = m.option;
  if (o.kind === 'place' || o.takes.length === 0 || o.takes.length !== table.length) return false;
  if (o.kind === 'aceSweep' && !rules.ace.sweepScoresScopa) return false;
  return !final || rules.scopa.finalPlay === 'counts';
}

/** Points-equivalent value of a move's capture, ignoring what it leaves behind. */
export function immediateValue(rules: RulesConfig, table: readonly CardId[], m: Move, final: boolean): number {
  if (m.option.kind === 'place') return 0;
  return setWorth(rules, m.option.takes) + cardWorth(rules, m.card) + (makesScopa(rules, table, m, final) ? 1 : 0);
}

export const tableAfter = (table: readonly CardId[], m: Move): CardId[] =>
  m.option.kind === 'place' ? [...table, m.card] : table.filter((c) => !m.option.takes.includes(c));

/**
 * Expected value the next seat gets from the table we leave, using only what
 * can be inferred: for each capture value it might hold, the best capture it
 * could make, weighted by the chance it holds that value.
 */
export function threat(v: PublicView, k: Knowledge, left: readonly CardId[], who: number, finalNext: boolean): number {
  if (left.length === 0) return 0;
  const gains: { g: number; p: number }[] = [];
  for (let val = 1; val <= 10; val++) {
    const p = k.pHolds[who][val];
    if (p <= 0) continue;
    const rep = k.unseen.find((c) => valueOf(c) === val) ?? v.revealed[who]?.find((c) => valueOf(c) === val);
    if (rep === undefined) continue;
    let best = 0;
    for (const o of legalOptions(v.rules, left, rep)) {
      const g = immediateValue(v.rules, left, { card: rep, option: o }, finalNext);
      if (g > best) best = g;
    }
    if (best > 0) gains.push({ g: best, p });
  }
  gains.sort((a, b) => b.g - a.g);
  let e = 0, miss = 1;
  for (const { g, p } of gains) { e += g * p * miss; miss *= 1 - p; }
  return e;
}

function personaBias(p: Persona, m: Move): number {
  const cs = m.option.kind === 'place' ? [] : [m.card, ...m.option.takes];
  switch (p.fondOf) {
    case 'coins': return cs.filter((c) => c < 10).length * 0.004;
    case 'cards': return cs.length * 0.003;
    case 'sevens': return cs.filter((c) => rankOf(c) === 7).length * 0.005;
    case 'figures': return cs.filter((c) => rankOf(c) >= 8).length * 0.004;
  }
}

/** Standard's static evaluation of a move: what it takes, minus what it hands the next seat. */
export function standardScore(v: PublicView, k: Knowledge, m: Move, persona: Persona): number {
  const rules = v.rules;
  const final = isFinalPlay(v);
  let s = immediateValue(rules, v.table, m, final);
  const left = tableAfter(v.table, m);
  const n = seatCount(rules);
  const next = (v.seat + 1) % n;
  const remainingAfter = v.handSizes.reduce((a, b) => a + b, 0) - 1;
  const finalNext = v.deckCount === 0 && remainingAfter === 1;
  if (remainingAfter > 0 || v.deckCount > 0) {
    const t = threat(v, k, left, next, finalNext);
    if (sideOf(rules, next) !== v.side) s -= t * persona.caution;
    else s += t * 0.35; // leave something for a partner
    // In partnership games the seat after next is also an opponent's chance if the partner cannot take it.
    if (n === 4 && sideOf(rules, next) !== v.side) {
      const after = (v.seat + 3) % n; // the other opponent, two plays away; discount heavily
      s -= threat(v, k, left, after, false) * 0.15;
    }
  } else if (m.option.kind === 'place') {
    // final card of the hand: whatever is left goes to the last capturer
    if (v.lastCapturer !== null && sideOf(rules, v.lastCapturer) !== v.side) s -= setWorth(rules, left);
  }
  // When the deck is empty, the last capture also collects the leftovers: taking something late is worth a little extra.
  if (v.deckCount === 0 && m.option.kind !== 'place') s += 0.04 * Math.min(left.length, 4);
  // Holding back a card that pairs with a 7 on the table is not modelled; prefer not to throw sevens and coins onto the table.
  if (m.option.kind === 'place') s -= cardWorth(rules, m.card) * 0.35;
  return s + personaBias(persona, m);
}

function argmax<T>(xs: T[], f: (x: T) => number): T {
  let best = xs[0], bv = -Infinity;
  for (const x of xs) { const v = f(x); if (v > bv) { bv = v; best = x; } }
  return best;
}

// ---------------------------------------------------------------- Relaxed

function relaxed(v: PublicView, rng: Rng, persona: Persona): Decision {
  const moves = allMoves(v);
  const k = buildKnowledge(v, true);
  const final = isFinalPlay(v);
  const scored = moves.map((m) => {
    let s = immediateValue(v.rules, v.table, m, final);
    // notices only the most blatant gift: a table that a single card would sweep
    const left = tableAfter(v.table, m);
    const next = (v.seat + 1) % v.numSeats;
    if (sideOf(v.rules, next) !== v.side && left.length > 0 && left.length <= 2) s -= threat(v, k, left, next, false) * 0.4;
    if (m.option.kind === 'place') s -= cardWorth(v.rules, m.card) * 0.2;
    return { m, s: s + (rng() - 0.5) * 0.35 + personaBias(persona, m) };
  });
  scored.sort((a, b) => b.s - a.s);
  // Occasionally a plausible but not-best choice among the top three.
  const pick = scored.length > 1 && rng() < 0.18 ? scored[Math.min(scored.length - 1, 1 + Math.floor(rng() * 2))] : scored[0];
  return { move: pick.m, work: moves.length };
}

// ---------------------------------------------------------------- Standard

function standard(v: PublicView, _rng: Rng, persona: Persona): Decision {
  const moves = allMoves(v);
  const k = buildKnowledge(v);
  return { move: argmax(moves, (m) => standardScore(v, k, m, persona)), work: moves.length };
}

// ---------------------------------------------------------------- Expert

/** A table a single card could sweep next turn (fast approximation for rollouts). */
function sweepable(rules: RulesConfig, table: readonly CardId[]): boolean {
  if (table.length === 0) return false;
  if (rules.ace.sweep && !table.some((c) => rankOf(c) === 1)) return true;
  let sum = 0;
  for (const c of table) sum += valueOf(c);
  const eqOk = table.length === 1 || (sum <= 10 && !table.some((c) => valueOf(c) === sum));
  if (rules.capture.mode === 'sum') return eqOk;
  const fif = sum >= 5 && sum <= 14;
  if (rules.capture.mode === 'fifteen') return fif || (rules.capture.fifteenAllowsEqual && eqOk);
  return eqOk || fif;
}

/**
 * Policy for every seat inside a rollout. The world is fully determined there,
 * so it looks at the next seat's actual cards: the best reply it would have.
 */
function rolloutMove(rules: RulesConfig, h: HandState, seat: number, rng: Rng): Move {
  const total = h.hands.reduce((a, x) => a + x.length, 0);
  const final = h.deck.length === 0 && total === 1;
  const n = seatCount(rules);
  const next = (seat + 1) % n;
  const nextOpp = sideOf(rules, next) !== sideOf(rules, seat);
  const nextHand = h.hands[next];
  const finalNext = h.deck.length === 0 && total === 2;
  let best: Move | null = null, bv = -Infinity;
  for (const card of h.hands[seat]) {
    for (const option of legalOptions(rules, h.table, card)) {
      const m = { card, option };
      let s = immediateValue(rules, h.table, m, final);
      if (!final) {
        const left = tableAfter(h.table, m);
        let reply = 0;
        if (left.length && nextHand.length && nextHand.length <= 4) {
          for (const rc of nextHand) for (const ro of legalOptions(rules, left, rc)) {
            const g = immediateValue(rules, left, { card: rc, option: ro }, finalNext);
            if (g > reply) reply = g;
          }
        } else if (left.length && sweepable(rules, left)) reply = 0.5;
        s += nextOpp ? -reply : reply * 0.35;
      }
      if (option.kind === 'place') s -= cardWorth(rules, card) * 0.35;
      s += rng() * 0.03;
      if (s > bv) { bv = s; best = m; }
    }
  }
  return best as Move;
}

/**
 * Inference from public play: a seat that could have made a scopa and did not
 * almost certainly held no card that would have made it — and if no new cards
 * have been dealt since, still holds none. Returns forbidden values per seat.
 */
export function inferAbsentValues(v: PublicView): Set<number>[] {
  const out = Array.from({ length: v.numSeats }, () => new Set<number>());
  const reps = Array.from({ length: 11 }, (_, val) => val); // value -> a card id of that value in Coins (suit 0): id = val - 1
  for (const r of v.history) {
    if (r.seat === v.seat || r.round !== v.round || r.table.length === 0) continue;
    const madeScopa = r.took.length > 0 && r.took.length === r.table.length;
    if (madeScopa) continue;
    for (let val = 1; val <= 10; val++) {
      const rep = reps[val] - 1;
      const sweep = legalOptions(v.rules, r.table, rep).some((o) => o.takes.length === r.table.length && (o.kind !== 'aceSweep' || v.rules.ace.sweepScoresScopa));
      if (sweep) out[r.seat].add(val);
    }
  }
  return out;
}

/** Sample a full world consistent with everything this seat can see and infer. */
export function determinize(v: PublicView, rng: Rng, absent?: Set<number>[]): HandState {
  const base = new Set<CardId>(buildKnowledge(v).unseen);
  for (const r of v.revealed) for (const c of r) base.delete(c);
  const n = v.numSeats;
  let hands: CardId[][] = [];
  let pool: CardId[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    pool = shuffle([...base], rng);
    hands = [];
    for (let s = 0; s < n; s++) {
      if (s === v.seat) { hands.push([...v.hand]); continue; }
      const need = v.handSizes[s] - v.revealed[s].length;
      hands.push([...v.revealed[s], ...pool.splice(0, need)]);
    }
    if (!absent || hands.every((hd, s) => s === v.seat || !hd.some((c) => absent[s].has(valueOf(c))))) break;
  }
  const sides = sideCount(v.rules);
  return {
    deck: pool,
    hands,
    table: [...v.table],
    captures: v.captures.map((x) => [...x]),
    scope: [...v.scope],
    scopaCards: Array.from({ length: sides }, () => []),
    declarations: Array(sides).fill(0),
    revealed: v.revealed.map((x) => [...x]),
    lastCapturer: v.lastCapturer,
    turn: v.seat,
    plays: v.plays,
    round: v.round,
    redeals: 0,
    history: [],
  };
}

function outcome(rules: RulesConfig, h: HandState, side: number): number {
  const s = scoreHand(rules, { captures: h.captures, scope: h.scope, declarations: h.declarations, scopaCards: h.scopaCards });
  const mine = s.totals[side];
  let other = -Infinity;
  s.totals.forEach((t, i) => { if (i !== side && t > other) other = t; });
  // smooth the categories so near-misses still inform the search
  const cards = h.captures.map((c) => c.length);
  const coins = h.captures.map((c) => c.filter((x) => x < 10).length);
  const oppCards = Math.max(...cards.filter((_, i) => i !== side));
  const oppCoins = Math.max(...coins.filter((_, i) => i !== side));
  return mine - other + 0.03 * (cards[side] - oppCards) + 0.05 * (coins[side] - oppCoins);
}

/** Rollout budget: total simulated plays per decision. Fixed, so decisions are reproducible. */
export const EXPERT_BUDGET = 150000;

function expert(v: PublicView, rng: Rng, persona: Persona): Decision {
  const moves = allMoves(v);
  if (moves.length === 1) return { move: moves[0], work: 0 };
  const k = buildKnowledge(v);
  const prior = moves.map((m) => ({ m, s: standardScore(v, k, m, persona) }));
  prior.sort((a, b) => b.s - a.s);
  const cands = prior.slice(0, 7);
  const remaining = v.handSizes.reduce((a, b) => a + b, 0) + v.deckCount;
  const avgHand = Math.max(3, v.handSizes.reduce((a, b) => a + b, 0) / v.numSeats);
  // cost of one rollout ~ plays remaining x (own options x the next hand's replies) per play
  const worlds = Math.max(8, Math.min(200, Math.floor(EXPERT_BUDGET / (cands.length * Math.max(1, remaining) * (avgHand * avgHand) / 3))));
  const totals = cands.map(() => 0);
  let work = 0;
  const dealer = v.dealer;
  const absent = inferAbsentValues(v);
  for (let w = 0; w < worlds; w++) {
    const world = determinize(v, rng, absent);
    const rolloutSeed = hashSeed(v.matchSeed, v.handNo, v.plays, v.seat, 'rollout', w);
    for (let i = 0; i < cands.length; i++) {
      const h = cloneHand(world);
      const rr = makeRng(rolloutSeed); // common random numbers across candidates
      playCard(v.rules, h, dealer, v.seat, cands[i].m.card, cands[i].m.option, null);
      while (!isHandOver(h)) {
        const s = h.turn;
        const m = rolloutMove(v.rules, h, s, rr);
        playCard(v.rules, h, dealer, s, m.card, m.option, null);
        work++;
      }
      totals[i] += outcome(v.rules, h, v.side);
    }
  }
  let best = 0, bv = -Infinity;
  for (let i = 0; i < cands.length; i++) {
    const val = totals[i] / worlds + cands[i].s * 0.08;
    if (val > bv) { bv = val; best = i; }
  }
  return { move: cands[best].m, work };
}

export function decide(v: PublicView, level: AiLevel, personaId?: string): Decision {
  const persona = personaById(personaId);
  const rng = makeRng(hashSeed(v.matchSeed, 'ai', v.handNo, v.plays, v.seat, level));
  if (level === 'relaxed') return relaxed(v, rng, persona);
  if (level === 'standard') return standard(v, rng, persona);
  return expert(v, rng, persona);
}

/** Natural thinking pause in ms (presentation only; never affects the choice). */
export function thinkingDelay(level: AiLevel, personaId: string | undefined, v: PublicView): number {
  const p = personaById(personaId);
  const base = level === 'relaxed' ? 700 : level === 'standard' ? 850 : 950;
  const r = makeRng(hashSeed(v.matchSeed, 'delay', v.handNo, v.plays))();
  return Math.round((base + r * 500) * p.pace);
}
