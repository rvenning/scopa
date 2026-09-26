import { describe, expect, it } from 'vitest';
import { legalOptions } from '../../src/rules/capture.ts';
import { makeRng } from '../../src/rules/rng.ts';
import type { CardId } from '../../src/rules/cards.ts';
import { apply, newMatch, playCommand, type Command, type MatchEvent, type MatchState } from '../../src/engine/match.ts';
import { chooseView, FrameGuard, type Capabilities } from '../../src/presentation/mode.ts';
import { presentationAllowance } from '../../src/presentation/pacing.ts';
import { placements, planFlights, targetsFor, type Anchors, type Pose, type Rect } from '../../src/presentation/sceneModel.ts';
import { CardFlights, poseAlong, samePose, type Tween, type TweenOpts } from '../../src/presentation/cardFlights.ts';
import { ALL_CONFIGS, rulesFor, seats } from '../helpers.ts';

// ------------------------------------------------------------------ fallback choice

const CAPABLE: Capabilities = { webgl2: true, softwareGl: false, reducedMotion: false, cores: 8, memoryGb: 8, saveData: false };

describe('choosing the 3D or flat table', () => {
  it('uses the 3D table on a capable device by default', () => {
    expect(chooseView('auto', CAPABLE).view).toBe('3d');
  });
  it('falls back to 2D without WebGL 2, even when 3D is chosen', () => {
    expect(chooseView('3d', { ...CAPABLE, webgl2: false })).toEqual({ view: '2d', reason: 'WebGL 2 is not available' });
    expect(chooseView('auto', { ...CAPABLE, webgl2: false }).view).toBe('2d');
  });
  it('always uses the flat table with reduced motion, whatever the setting', () => {
    for (const s of ['auto', '3d', '2d'] as const) expect(chooseView(s, { ...CAPABLE, reducedMotion: true }).view).toBe('2d');
  });
  it('Automatic stays flat on low-powered devices, with data saving, or after slow frames', () => {
    expect(chooseView('auto', { ...CAPABLE, cores: 2 }).view).toBe('2d');
    expect(chooseView('auto', { ...CAPABLE, memoryGb: 2 }).view).toBe('2d');
    expect(chooseView('auto', { ...CAPABLE, saveData: true }).view).toBe('2d');
    expect(chooseView('auto', { ...CAPABLE, softwareGl: true }).view).toBe('2d');
    expect(chooseView('3d', { ...CAPABLE, softwareGl: true }).view).toBe('3d');
    expect(chooseView('auto', CAPABLE, true).view).toBe('2d');
    // Unknown memory or cores do not count against the device.
    expect(chooseView('auto', { ...CAPABLE, cores: 0, memoryGb: null }).view).toBe('3d');
  });
  it('an explicit choice wins over the device heuristics (but never over WebGL or reduced motion)', () => {
    expect(chooseView('3d', { ...CAPABLE, cores: 2, memoryGb: 1 }, true).view).toBe('3d');
    expect(chooseView('2d', CAPABLE).view).toBe('2d');
  });
});

describe('frame guard', () => {
  const feed = (g: FrameGuard, dt: number, n: number, t0 = 0) => { let t = t0; let tripped = false; for (let i = 0; i < n; i++) { t += dt; tripped = g.frame(t, i > 0); } return tripped; };
  it('trips when typical frames are slower than the budget', () => {
    expect(feed(new FrameGuard(34, 60, 5), 50, 80)).toBe(true);
  });
  it('does not trip at 60 fps, or on a few long frames', () => {
    const g = new FrameGuard(34, 60, 5);
    expect(feed(g, 16.7, 200)).toBe(false);
    let t = 5000;
    for (let i = 0; i < 70; i++) { t += i % 10 === 0 ? 120 : 16; g.frame(t, true); }
    expect(g.tripped).toBe(false);
  });
  it('ignores the gap after the table went idle', () => {
    const g = new FrameGuard(34, 20, 2);
    let t = 0;
    for (let burst = 0; burst < 10; burst++) { t += 5000; for (let i = 0; i < 5; i++) { t += 16; g.frame(t, i > 0); } }
    expect(g.tripped).toBe(false);
  });
});

// ------------------------------------------------------------------ pacing

describe('pacing comes from events, never from animation', () => {
  const { state } = newMatch({ rules: rulesFor('classic', '2p'), seats: seats(2), seed: 3 });
  const seat = state.hand.turn;
  const c = state.hand.hands[seat][0];
  const o = legalOptions(state.setup.rules, state.hand.table, c)[0];
  const r = apply(state, playCommand(state, seat, c, o.kind, o.takes));
  if (!r.ok) throw new Error(r.error);
  it('is a pure function of the events and settings', () => {
    const a = presentationAllowance(r.events, { reduced: false, speed: 1 });
    expect(presentationAllowance(r.events, { reduced: false, speed: 1 })).toBe(a);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThanOrEqual(4200);
  });
  it('is shorter with reduced motion and at faster animation speeds', () => {
    const normal = presentationAllowance(r.events, { reduced: false, speed: 1 });
    expect(presentationAllowance(r.events, { reduced: true, speed: 1 })).toBeLessThan(normal);
    expect(presentationAllowance(r.events, { reduced: false, speed: 2 })).toBeLessThan(normal);
  });
  it('a capture is given longer than a placement', () => {
    const mk = (kind: 'place' | 'capture'): MatchEvent[] => [{ e: 'play', seat: 0, card: 5, option: kind === 'place' ? { kind: 'place', takes: [] } : { kind: 'capture', takes: [15] } as never, scopa: false, final: false }];
    expect(presentationAllowance(mk('capture'), { reduced: false, speed: 1 })).toBeGreaterThan(presentationAllowance(mk('place'), { reduced: false, speed: 1 }));
  });
});

// ------------------------------------------------------------------ scene model

/** Walk a random match command by command, yielding each step. */
function* steps(p: Parameters<typeof rulesFor>[0], f: Parameters<typeof rulesFor>[1], seed: number, max = 400): Generator<{ prev: MatchState; next: MatchState; events: MatchEvent[] }> {
  const rules = rulesFor(p, f);
  const n = f === '2p' ? 2 : f === '3p' ? 3 : 4;
  let s = newMatch({ rules, seats: seats(n), seed }).state;
  const rng = makeRng(seed * 7 + 1);
  for (let i = 0; i < max && s.phase !== 'matchEnd'; i++) {
    let cmd: Command;
    if (s.phase === 'handEnd') cmd = { t: 'nextHand', seq: s.seq };
    else {
      const seat = s.hand.turn;
      const hand = s.hand.hands[seat];
      const c = hand[Math.floor(rng() * hand.length)];
      const opts = legalOptions(rules, s.hand.table, c);
      const o = opts[Math.floor(rng() * opts.length)];
      cmd = playCommand(s, seat, c, o.kind, o.takes);
    }
    const r = apply(s, cmd);
    if (!r.ok) throw new Error(r.error);
    yield { prev: s, next: r.state, events: r.events };
    s = r.state;
  }
}

const rect = (left: number, top: number, width = 60, height = 96): Rect => ({ left, top, width, height });
function anchorsFor(s: MatchState): Anchors {
  const table = new Map<CardId, Rect>();
  s.hand.table.forEach((c, i) => table.set(c, rect(40 + (i % 5) * 70, 200 + Math.floor(i / 5) * 110)));
  return { table, deck: rect(10, 420, 30, 48), seat: (seat) => rect(100 + seat * 40, seat === 0 ? 700 : 40, 120, 60), pile: (side) => rect(300, side === 0 ? 420 : 60, 30, 48), cardW: 60 };
}
const FALLBACK = rect(0, 0, 400, 800);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); }
  return o;
}

describe('scene model: the picture always matches the engine', () => {
  for (const [p, f] of ALL_CONFIGS) {
    it(`${p} ${f}: every card is in exactly one place, as the engine says`, () => {
      let checked = 0;
      for (const { next } of steps(p, f, 11)) {
        const z = placements(next);
        expect(z.size).toBe(40);
        const count = (kind: string) => [...z.values()].filter((x) => x.z === kind).length;
        expect(count('deck')).toBe(next.hand.deck.length);
        expect(count('table')).toBe(next.hand.table.length);
        expect(count('hand')).toBe(next.hand.hands.flat().length);
        expect(count('pile')).toBe(next.hand.captures.flat().length);
        for (const c of next.hand.table) expect(z.get(c)?.z).toBe('table');
        next.hand.captures.forEach((cards, side) => cards.forEach((c) => { const zz = z.get(c); expect(zz?.z === 'pile' && zz.side === side).toBe(true); }));
        const scopaMarked = [...z.values()].filter((x) => x.z === 'pile' && x.scopa).length;
        expect(scopaMarked).toBe(next.hand.scopaCards.flat().filter((c) => next.hand.captures.flat().includes(c)).length);
        const t = targetsFor(z, anchorsFor(next), FALLBACK);
        expect(t.size).toBe(40);
        for (const [c, pose] of t) {
          const zz = z.get(c)!;
          // Hidden exactly when held in a hand; face up exactly on the table or as a scopa marker.
          expect(pose.show === 0).toBe(zz.z === 'hand');
          expect(pose.face === 1).toBe(zz.z === 'table' || (zz.z === 'pile' && zz.scopa));
        }
        checked++;
      }
      expect(checked).toBeGreaterThan(20);
    });
  }

  it('reading state for the presentation never changes it', () => {
    for (const { prev, next, events } of steps('scopone', '4t', 5, 120)) {
      deepFreeze(prev); deepFreeze(next); deepFreeze(events);
      const pz = placements(prev), nz = placements(next);
      const pt = targetsFor(pz, anchorsFor(prev), FALLBACK), nt = targetsFor(nz, anchorsFor(next), FALLBACK);
      expect(() => planFlights(events, pz, nz, pt, nt, { speed: 1 })).not.toThrow();
    }
  });

  it('a capture sends the played card to the captured cards first, then all of them to the pile', () => {
    for (const { prev, next, events } of steps('classic', '2p', 21, 300)) {
      const play = events.find((e): e is Extract<MatchEvent, { e: 'play' }> => e.e === 'play');
      if (!play || play.option.kind === 'place' || events.some((e) => e.e === 'lastTake' || e.e === 'deal')) continue;
      const pz = placements(prev), nz = placements(next);
      const pt = targetsFor(pz, anchorsFor(prev), FALLBACK), nt = targetsFor(nz, anchorsFor(next), FALLBACK);
      const plan = planFlights(events, pz, nz, pt, nt, { speed: 1 });
      const played = plan.get(play.card)!;
      expect(played.via).toBeDefined();
      for (const c of play.option.takes) {
        expect(plan.get(c)!.kind).toBe('capture');
        // The captured cards leave only after the played card has arrived and paused.
        expect(plan.get(c)!.delay).toBeGreaterThanOrEqual(played.via!.hold);
      }
      return;
    }
    throw new Error('no capture found');
  });

  it('deals leave the deck one after another, and a new hand is gathered first', () => {
    for (const { prev, next, events } of steps('classic', '2p', 4, 400)) {
      if (!events.some((e) => e.e === 'newHand')) continue;
      const pz = placements(prev), nz = placements(next);
      const plan = planFlights(events, pz, nz, targetsFor(pz, anchorsFor(prev), FALLBACK), targetsFor(nz, anchorsFor(next), FALLBACK), { speed: 1 });
      const deals = [...plan.values()].filter((f) => f.kind === 'deal').map((f) => f.delay);
      expect(deals.length).toBe(next.hand.table.length + next.hand.hands.flat().length);
      const sorted = [...deals].sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
      const gathers = [...plan.values()].filter((f) => f.kind === 'gather');
      expect(Math.min(...deals)).toBeGreaterThan(Math.max(0, ...gathers.map((g) => g.delay)));
      return;
    }
    throw new Error('no new hand found');
  });
});

// ------------------------------------------------------------------ flights and interruption

/** A tween we step by hand: progress follows a clock we control, with an optional overshoot like a spring. */
class FakeClock {
  now = 0;
  private live = new Set<{ o: TweenOpts; start: number; stopped: boolean }>();
  tween: Tween = (o) => {
    const t = { o, start: this.now + o.delay * 1000, stopped: false };
    this.live.add(t);
    return { stop: () => { t.stopped = true; this.live.delete(t); } };
  };
  advance(ms: number, stepMs = 16) {
    for (let e = 0; e < ms; e += stepMs) {
      this.now += stepMs;
      for (const t of [...this.live]) {
        if (t.stopped || this.now < t.start) continue;
        const x = Math.min(1, (this.now - t.start) / (t.o.duration * 1000));
        // Ease out with a small overshoot, then settle, as a gentle spring would.
        const p = x < 1 ? 1 - Math.pow(1 - x, 3) + Math.sin(Math.PI * x) * 0.04 : 1;
        t.o.onUpdate(p);
        if (x >= 1) { this.live.delete(t); t.o.onComplete(); }
      }
    }
  }
}

const pose = (x: number, y: number, extra: Partial<Pose> = {}): Pose => ({ x, y, z: 0, w: 60, rot: 0, face: 1, tilt: 0, show: 1, ...extra });

describe('card flights', () => {
  it('a flight ends exactly on its target and nothing is left mismatched', () => {
    const clock = new FakeClock();
    const f = new CardFlights(clock.tween, 400);
    f.jump(new Map([[1, pose(0, 0)]]));
    f.retarget(new Map([[1, pose(200, 100)]]), new Map([[1, { delay: 0, arc: 30, kind: 'play' }]]));
    clock.advance(200);
    expect(f.moving).toBe(1);
    const mid = f.poses.get(1)!;
    expect(mid.z).toBeGreaterThan(0); // lifted in an arc
    clock.advance(400);
    expect(f.moving).toBe(0);
    expect(samePose(f.poses.get(1)!, pose(200, 100))).toBe(true);
    expect(f.mismatches()).toEqual([]);
  });

  it('interrupting a flight continues from where the card is, never jumping', () => {
    const clock = new FakeClock();
    const f = new CardFlights(clock.tween, 400);
    f.jump(new Map([[7, pose(0, 0)]]));
    f.retarget(new Map([[7, pose(300, 0)]]), new Map([[7, { delay: 0, arc: 20, kind: 'play' }]]));
    clock.advance(160);
    const caught = { ...f.poses.get(7)! };
    expect(caught.x).toBeGreaterThan(20);
    f.retarget(new Map([[7, pose(0, 300)]]), new Map([[7, { delay: 0, arc: 20, kind: 'capture' }]]));
    clock.advance(16);
    const after = f.poses.get(7)!;
    // One frame later it is still near where it was caught; restarting from the old origin would put it ~230px away.
    const moved = Math.hypot(after.x - caught.x, after.y - caught.y);
    expect(moved).toBeLessThan(0.25 * Math.hypot(caught.x, caught.y));
    clock.advance(600);
    expect(samePose(f.poses.get(7)!, pose(0, 300))).toBe(true);
  });

  it('a storm of interruptions always comes to rest on the latest targets', () => {
    const clock = new FakeClock();
    const f = new CardFlights(clock.tween, 380);
    const rng = makeRng(99);
    const rnd = () => pose(Math.round(rng() * 400), Math.round(rng() * 800), { face: rng() < 0.5 ? 0 : 1, z: Math.round(rng() * 10) });
    f.jump(new Map(Array.from({ length: 40 }, (_, c) => [c, rnd()] as [number, Pose])));
    for (let round = 0; round < 60; round++) {
      const t = new Map<number, Pose>();
      const plan = new Map<number, { delay: number; arc: number; kind: 'play' }>();
      for (let c = 0; c < 40; c++) {
        if (rng() < 0.3) { t.set(c, rnd()); plan.set(c, { delay: Math.round(rng() * 200), arc: 20, kind: 'play' }); } else t.set(c, f.targets.get(c)!);
      }
      f.retarget(t, plan);
      clock.advance(Math.round(rng() * 300));
      // Mid-flight, every card still has exactly one pose.
      expect(f.poses.size).toBe(40);
    }
    clock.advance(2000);
    expect(f.moving).toBe(0);
    expect(f.mismatches()).toEqual([]);
  });

  it('finish() snaps every card to its target at once', () => {
    const clock = new FakeClock();
    const f = new CardFlights(clock.tween, 400);
    f.jump(new Map([[1, pose(0, 0)], [2, pose(10, 10)]]));
    f.retarget(new Map([[1, pose(100, 0)], [2, pose(0, 100)]]), new Map([[1, { delay: 0, arc: 20, kind: 'play' }], [2, { delay: 300, arc: 20, kind: 'capture' }]]));
    clock.advance(50);
    f.finish();
    expect(f.moving).toBe(0);
    expect(f.mismatches()).toEqual([]);
    // A stopped tween never writes again.
    clock.advance(1000);
    expect(samePose(f.poses.get(1)!, pose(100, 0))).toBe(true);
  });

  it('a card going into a hand without a planned flight is simply hidden there', () => {
    const clock = new FakeClock();
    const f = new CardFlights(clock.tween, 400);
    f.jump(new Map([[3, pose(0, 0)]]));
    f.retarget(new Map([[3, pose(50, 700, { show: 0, face: 0 })]]));
    expect(f.moving).toBe(0);
    expect(f.poses.get(3)!.show).toBe(0);
  });

  it('a capture passes through its via point before the pile', () => {
    const clock = new FakeClock();
    const f = new CardFlights(clock.tween, 300);
    f.jump(new Map([[5, pose(0, 800)]]));
    f.retarget(new Map([[5, pose(400, 50, { face: 0 })]]), new Map([[5, { delay: 0, arc: 30, kind: 'play', via: { x: 200, y: 300, z: 3, hold: 200, face: 1 } }]]));
    clock.advance(330);
    const at = f.poses.get(5)!;
    expect(Math.abs(at.x - 200)).toBeLessThan(2);
    expect(Math.abs(at.y - 300)).toBeLessThan(2);
    clock.advance(1000);
    expect(samePose(f.poses.get(5)!, pose(400, 50, { face: 0 }))).toBe(true);
  });

  it('turning over happens in the middle of the flight and the arc returns to the table', () => {
    const a = pose(0, 0, { face: 0 }), b = pose(100, 0, { face: 1 });
    expect(poseAlong(a, b, 0.1, 30).face).toBe(0);
    expect(poseAlong(a, b, 0.9, 30).face).toBe(1);
    expect(poseAlong(a, b, 1.05, 30).z).toBeCloseTo(0, 5); // spring overshoot never sinks into the cloth
  });
});
