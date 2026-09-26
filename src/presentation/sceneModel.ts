/**
 * The presentation's picture of the table, derived only from engine state.
 *
 * `placements` says where each of the 40 cards is (deck, table, a hand or a
 * side's capture pile); `targetsFor` turns that into screen poses using rects
 * measured from the DOM, which stays the authoritative layout. `planFlights`
 * reads engine events to decide how cards travel between two such pictures.
 * Nothing here can change the game: it takes state in and gives poses out.
 */
import type { CardId } from '../rules/cards.ts';
import type { MatchEvent, MatchState } from '../engine/match.ts';

export type Zone =
  | { z: 'deck'; index: number }
  | { z: 'table'; index: number }
  | { z: 'hand'; seat: number; index: number }
  | { z: 'pile'; side: number; index: number; scopa: boolean };

export function placements(s: MatchState): Map<CardId, Zone> {
  const h = s.hand;
  const out = new Map<CardId, Zone>();
  const put = (c: CardId, z: Zone) => {
    if (out.has(c)) throw new Error(`card ${c} is in two places`);
    out.set(c, z);
  };
  h.deck.forEach((c, index) => put(c, { z: 'deck', index }));
  h.table.forEach((c, index) => put(c, { z: 'table', index }));
  h.hands.forEach((cards, seat) => cards.forEach((c, index) => put(c, { z: 'hand', seat, index })));
  h.captures.forEach((cards, side) => {
    const sc = new Set(h.scopaCards[side] ?? []);
    cards.forEach((c, index) => put(c, { z: 'pile', side, index, scopa: sc.has(c) }));
  });
  return out;
}

export interface Rect { left: number; top: number; width: number; height: number }
export const centre = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** A card's resting or in-flight appearance in screen space (CSS px). */
export interface Pose {
  x: number; y: number;
  /** Height above the table in CSS px (stacking and lift). */
  z: number;
  /** Card width on screen; height is always 1.6 times this. */
  w: number;
  /** Rotation about the table's normal, degrees. */
  rot: number;
  /** 1 = face up, 0 = face down; in between while turning over. */
  face: number;
  /** Tilt out of the table plane while travelling, degrees. */
  tilt: number;
  /** 0 = hidden (held in a hand), 1 = on the table. */
  show: number;
}

export interface Anchors {
  table: Map<CardId, Rect>;
  deck: Rect | null;
  /** Where each seat's hand is: the hand strip for the player at the bottom, the seat panel for others. */
  seat: (seat: number) => Rect | null;
  /** Where each side's capture pile rests. */
  pile: (side: number) => Rect | null;
  /** Table card width in CSS px. */
  cardW: number;
}

/** Thickness of one card on screen, in CSS px of height. */
export const CARD_T = 0.55;

/** Small, stable irregularity so a pile looks put down by hand, never random frame to frame. */
export const jitter = (c: CardId, k: number) => {
  const x = Math.sin((c + 1) * 12.9898 + k * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
};

export function targetsFor(p: Map<CardId, Zone>, a: Anchors, fallback: Rect): Map<CardId, Pose> {
  const out = new Map<CardId, Pose>();
  const pileW0 = Math.max(28, a.cardW * 0.62);
  for (const [c, zone] of p) {
    let pose: Pose;
    if (zone.z === 'table') {
      const r = a.table.get(c);
      const m = centre(r ?? fallback);
      pose = { x: m.x, y: m.y, z: 0, w: r ? r.width : a.cardW, rot: jitter(c, 1) * 1.6, face: 1, tilt: 0, show: 1 };
    } else if (zone.z === 'deck') {
      const m = centre(a.deck ?? fallback);
      const w = a.deck ? a.deck.width : a.cardW * 0.6;
      // index 0 is dealt next, so it sits on top.
      pose = { x: m.x + jitter(c, 2) * 0.8, y: m.y + jitter(c, 3) * 0.8, z: (40 - zone.index) * CARD_T, w, rot: jitter(c, 4) * 2.2, face: 0, tilt: 0, show: 1 };
    } else if (zone.z === 'hand') {
      const m = centre(a.seat(zone.seat) ?? fallback);
      pose = { x: m.x, y: m.y, z: 24, w: a.cardW * 0.7, rot: 0, face: 0, tilt: 0, show: 0 };
    } else {
      const spot = a.pile(zone.side);
      const m = centre(spot ?? fallback);
      const pileW = spot ? spot.width : pileW0;
      // A scopa is marked in the traditional way: that card is turned face up, crosswise in the pile.
      pose = zone.scopa
        ? { x: m.x + pileW * 0.18, y: m.y, z: zone.index * CARD_T, w: pileW, rot: 90 + jitter(c, 5) * 4, face: 1, tilt: 0, show: 1 }
        : { x: m.x + jitter(c, 6) * 1.5, y: m.y + jitter(c, 7) * 1.5, z: zone.index * CARD_T, w: pileW, rot: jitter(c, 8) * 5, face: 0, tilt: 0, show: 1 };
    }
    out.set(c, pose);
  }
  return out;
}

/** How one card travels to its new pose. */
export interface Flight {
  /** ms to wait before leaving. */
  delay: number;
  /** A point to pass through and pause at: the played card joins the cards it captures; a new deal passes through the deck. */
  via?: { x: number; y: number; z: number; hold: number; face?: number; w?: number };
  /** Where to start from instead of the current pose (a card leaving the player's own hand). */
  from?: Pose;
  /** Peak height of the arc in CSS px. */
  arc: number;
  kind: 'deal' | 'play' | 'capture' | 'gather';
}

export interface FlightTiming { speed: number }

/**
 * Stagger and route cards from engine events. Deals leave the deck one by one
 * in dealing order; a capture sends the played card to the captured cards, lets
 * the table be read for a beat, then sends them all to the pile together; a new
 * hand gathers every card back to the deck before dealing again.
 */
export function planFlights(events: MatchEvent[], prevZ: Map<CardId, Zone>, nextZ: Map<CardId, Zone>, prev: Map<CardId, Pose>, next: Map<CardId, Pose>, t: FlightTiming, origins: Map<CardId, Pose> = new Map()): Map<CardId, Flight> {
  const plan = new Map<CardId, Flight>();
  const k = 1 / Math.max(0.25, t.speed);
  const newHand = events.some((e) => e.e === 'newHand');
  // A new hand: everything not already in the deck is swept back first.
  const gatherMs = newHand ? 520 * k : 0;
  if (newHand) {
    let i = 0;
    for (const [c, z] of prevZ) if (z.z !== 'deck') plan.set(c, { delay: (i++ % 16) * 12 * k, arc: 30, kind: 'gather' });
  }
  // Cards dealt by this command, in dealing order (hands first, then the table, as the engine deals).
  const dealt: CardId[] = [];
  if (events.some((e) => e.e === 'deal')) {
    const order = (z: Zone) => (z.z === 'hand' ? z.index * 8 + z.seat : z.z === 'table' ? 1000 + z.index : 1e6);
    for (const [c, z] of nextZ) {
      const was = prevZ.get(c);
      if ((z.z === 'hand' || z.z === 'table') && (!was || was.z !== z.z || newHand)) dealt.push(c);
    }
    dealt.sort((a, b) => order(nextZ.get(a)!) - order(nextZ.get(b)!));
  }
  const deckTop = [...next.values()].filter((p) => p.face === 0 && p.show === 1 && p.z > 0).sort((a, b) => b.z - a.z)[0];
  dealt.forEach((c, i) => {
    const via = newHand && deckTop ? { x: deckTop.x, y: deckTop.y, z: deckTop.z + 2, hold: 0, face: 0, w: deckTop.w } : undefined;
    plan.set(c, { delay: gatherMs + (120 + i * 55) * k, arc: 24, kind: 'deal', via });
  });
  for (const ev of events) {
    if (ev.e === 'play') {
      const card = ev.card;
      const takes = ev.option.kind === 'place' ? [] : ev.option.takes;
      const from = origins.get(card);
      if (!takes.length) { plan.set(card, { delay: 0, arc: 40, kind: 'play', from }); continue; }
      const pts = takes.map((c) => prev.get(c)).filter((p): p is Pose => !!p);
      const cx = pts.reduce((s, p) => s + p.x, 0) / Math.max(1, pts.length);
      const cy = pts.reduce((s, p) => s + p.y, 0) / Math.max(1, pts.length);
      const w = pts[0]?.w ?? 60;
      const hold = 300 * k;
      const arrive = 360 * k;
      plan.set(card, { delay: 0, arc: 42, kind: 'play', from, via: { x: cx + w * 0.28, y: cy + w * 0.2, z: 3, hold, face: 1, w } });
      takes.forEach((c, i) => plan.set(c, { delay: arrive + hold + i * 45 * k, arc: 34, kind: 'capture' }));
    } else if ((ev.e === 'lastTake' || ev.e === 'dealerBonus') && ev.cards.length) {
      ev.cards.forEach((c, i) => { if (!plan.has(c)) plan.set(c, { delay: (ev.e === 'lastTake' ? 520 : 700) * k + i * 45 * k, arc: 34, kind: 'capture' }); });
    }
  }
  return plan;
}

/** Total time the plan needs, so pacing can be derived from events alone (see pacing.ts). */
export const planLength = (plan: Map<CardId, Flight>, flightMs: number) => Math.max(0, ...[...plan.values()].map((f) => f.delay + (f.via ? f.via.hold + flightMs : 0) + flightMs));
