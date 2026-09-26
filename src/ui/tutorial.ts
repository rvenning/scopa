import { card, type CardId } from '../rules/cards.ts';
import type { CaptureOption } from '../rules/capture.ts';
import { presetRules } from '../rules/presets.ts';
import { ALL_CARDS } from '../rules/cards.ts';
import { apply, newMatch, playCommand, type MatchState } from '../engine/match.ts';
import { viewFor } from '../engine/view.ts';
import { decide } from '../ai/policy.ts';
import type { AppCtx, Screen } from './app.ts';
import { GameScreen, type TutorialHooks } from './game.ts';

/**
 * The first-game tutorial. It runs the REAL engine on a fixed, hand-built deal,
 * so every rule it demonstrates is the rule the game enforces. Deterministic and
 * skippable at every step.
 */
const D = 0, C = 1, S = 2, B = 3;
const c = (s: number, r: number) => card(s as 0, r);

export const TUTORIAL = {
  human: [c(D, 5), c(C, 7), c(S, 2)],
  ai: [c(B, 2), c(D, 10), c(C, 9)],
  table: [c(C, 5), c(B, 3), c(S, 4), c(B, 10)],
  /** The human's scripted plays, by play number. */
  expect: { 0: { card: c(D, 5), kind: 'match' }, 2: { card: c(C, 7), kind: 'sum' }, 4: { card: c(S, 2), kind: 'match' } } as Record<number, { card: CardId; kind: CaptureOption['kind'] }>,
  /** The computer's scripted plays, by play number. */
  scripted: { 1: { card: c(B, 2), takes: [] as CardId[] }, 3: { card: c(D, 10), takes: [c(B, 10)] }, 5: { card: c(C, 9), takes: [] as CardId[] } } as Record<number, { card: CardId; takes: CardId[] }>,
};

export function tutorialMatch(): MatchState {
  const rules = presetRules('classic', '2p');
  const { state } = newMatch({ rules, seats: [{ name: 'You', kind: 'human' }, { name: 'Nonna Rosa', kind: 'ai', level: 'standard', persona: 'rosa' }], seed: 2018 });
  const used = new Set([...TUTORIAL.human, ...TUTORIAL.ai, ...TUTORIAL.table]);
  state.dealer = 1;
  state.hand = {
    ...state.hand,
    deck: ALL_CARDS.filter((x) => !used.has(x)).sort((a, b) => ((a * 17) % 40) - ((b * 17) % 40)),
    hands: [[...TUTORIAL.human], [...TUTORIAL.ai]],
    table: [...TUTORIAL.table],
    captures: [[], []], scope: [0, 0], scopaCards: [[], []], declarations: [0, 0], revealed: [[], []],
    lastCapturer: null, turn: 0, plays: 0, round: 0, redeals: 0, history: [],
  };
  return state;
}

/** Play the rest of the hand with the Standard AI for both seats (deterministic). */
export function fastForward(s: MatchState): MatchState {
  let st = s;
  for (let i = 0; i < 200 && st.phase === 'play'; i++) {
    const seat = st.hand.turn;
    const m = decide(viewFor(st, seat), 'standard').move;
    const r = apply(st, playCommand(st, seat, m.card, m.option.kind, m.option.takes));
    if (!r.ok) break;
    st = r.state;
  }
  return st;
}

export function tutorialScreen(ctx: AppCtx): Screen & { game: GameScreen } {
  let stage: 'intro' | 'values' | 'play' = 'intro';
  const prevBadges = ctx.settings.valueBadges, prevHl = ctx.settings.legalHighlights;
  const restore = () => { ctx.settings.valueBadges = prevBadges; ctx.settings.legalHighlights = prevHl; };
  const finish = () => { restore(); ctx.settings.tutorialSeen = true; ctx.saveSettings(); ctx.go('title'); };
  const hooks: TutorialHooks = {
    coach(s) {
      if (stage === 'intro') return { text: 'Welcome to Scopa! Each player is dealt three cards and four go face up on the table. You play one card a turn, trying to capture table cards. Your hand is at the bottom; Nonna Rosa sits opposite.', next: 'Next' };
      if (stage === 'values') return { text: 'Every card has a capture value: Ace is 1, number cards are their number, Fante 8, Cavallo 9 and Re 10. The small badges show the values. Press and hold any card to see its details.', next: 'Let’s play' };
      if (s.phase !== 'play') return null;
      const p = s.hand.plays;
      if (p === 0) return { text: 'Capture by matching: tap your 5 of Coins, then take the 5 of Cups. A card always takes a single card of the same value when there is one.' };
      if (p === 1) return { text: 'Nonna Rosa plays a 2. Nothing on the table is worth 2, and no cards add up to 2, so it stays on the table.' };
      if (p === 2) return { text: 'Capture by adding up: your 7 of Cups can take the 3 and the 4 together, because 3 + 4 = 7. Tap it, then choose that capture.' };
      if (p === 3) return { text: 'Nonna Rosa takes the Re with her Re. Now only one card is left on the table…' };
      if (p === 4) return { text: 'Take the last card with your 2 to clear the table. Clearing the table is a scopa, worth a point.' };
      if (p === 5) return { text: 'After a scopa the next player has to lay a card on an empty table.' };
      return { text: 'That’s the heart of Scopa! New cards are dealt whenever the hands are empty, until the deck runs out. The last cards on the table go to whoever captured last. Let’s jump to the end of the hand and see how it is scored.', next: 'Jump to the scoring' };
    },
    allow(s, cardId, o) {
      if (stage !== 'play') return 'Read the note first, then press Next.';
      const want = TUTORIAL.expect[s.hand.plays];
      if (!want) return null;
      if (cardId !== want.card || o.kind !== want.kind) return 'For this step, try the move the note describes.';
      return null;
    },
    scripted(s) {
      const m = TUTORIAL.scripted[s.hand.plays];
      if (!m) return null;
      return { card: m.card, option: { kind: m.takes.length ? 'match' : 'place', takes: m.takes } };
    },
    advance(s) {
      if (stage === 'intro') { stage = 'values'; return null; }
      if (stage === 'values') { stage = 'play'; return null; }
      if (s.hand.plays >= 6) return fastForward(s);
      return null;
    },
    onHandEnd: () => finish(),
    skip: () => finish(),
  };
  // The tutorial shows value badges regardless of the setting, for the lesson.


  ctx.settings.valueBadges = true;
  ctx.settings.legalHighlights = true;
  const g = new GameScreen(ctx, tutorialMatch(), { tutorial: hooks });
  return {
    el: g.el,
    game: g,
    onKey: (e) => g.onKey(e),
    destroy() { restore(); g.destroy(); },
  };
}
