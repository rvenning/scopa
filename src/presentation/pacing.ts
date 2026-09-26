/**
 * How long the table lets a move be seen before the next computer move or the
 * score sheet. It is a pure function of the engine's events and the player's
 * settings, never of whether an animation has actually finished: the same match
 * paces identically in the 3D view, the flat view, a slow phone or a test, and
 * an interrupted or dropped animation can never stall or hurry the game.
 */
import type { MatchEvent } from '../engine/match.ts';

export interface PaceOpts { reduced: boolean; speed: number }

export function presentationAllowance(events: MatchEvent[], o: PaceOpts): number {
  if (o.reduced) {
    // Only the short fades remain; keep a readable beat after captures.
    return events.some((e) => e.e === 'play' && e.option.kind !== 'place') ? 260 : 160;
  }
  let ms = 0;
  const k = 1 / Math.max(0.25, o.speed);
  for (const e of events) {
    if (e.e === 'newHand') ms += 520;
    else if (e.e === 'deal') ms += 180 + 55 * (e.counts.reduce((a, b) => a + b, 0) + e.table.length) + 380;
    else if (e.e === 'play') ms += e.option.kind === 'place' ? 420 : 360 + 300 + 45 * e.option.takes.length + 520;
    else if (e.e === 'lastTake' && e.cards.length) ms += 300 + 45 * e.cards.length;
    else if (e.e === 'dealerBonus' || e.e === 'declare') ms += 900;
  }
  return Math.round(Math.min(ms, 4200) * k);
}
