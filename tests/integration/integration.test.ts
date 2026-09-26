import { beforeEach, describe, expect, it } from 'vitest';
import { rulesBook, rulesSummary } from '../../src/content/rulesbook.ts';
import { explainCategory } from '../../src/content/explain.ts';
import { PRESET_TEXT } from '../../src/content/presets.ts';
import { setOption } from '../../src/rules/options.ts';
import { PRESET_ORDER, presetRules, decodeRules } from '../../src/rules/presets.ts';
import { legalOptions, findOption } from '../../src/rules/capture.ts';
import { apply, newMatch, playCommand, replay, SCHEMA_VERSION } from '../../src/engine/match.ts';
import { TUTORIAL, tutorialMatch, fastForward } from '../../src/ui/tutorial.ts';
import { cardSvg, backSvg, BACKS } from '../../src/presentation/cardArt.ts';
import { seats, randomMatch } from '../helpers.ts';

// A minimal localStorage for the persistence modules.
class MemStore { m = new Map<string, string>(); get length() { return this.m.size; } key(i: number) { return [...this.m.keys()][i] ?? null; } getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, String(v)); } removeItem(k: string) { this.m.delete(k); } clear() { this.m.clear(); } }
(globalThis as unknown as { localStorage: MemStore }).localStorage = new MemStore();

describe('content reflects the rules', () => {
  it('every preset has text, changes and a complete rules book', () => {
    for (const id of PRESET_ORDER) {
      const t = PRESET_TEXT[id];
      expect(t.name && t.description && t.players && t.changes.length).toBeTruthy();
      const book = rulesBook(presetRules(id));
      expect(book.map((s) => s.id)).toEqual(expect.arrayContaining(['overview', 'deck', 'deal', 'capture', 'scopa', 'scoring', 'helper']));
    }
  });
  it('custom options appear in the rules book and mark Custom Rules', () => {
    let r = presetRules('classic');
    r = setOption(r, 'reBello', 'on').rules;
    r = setOption(r, 'aceSweep', 'on').rules;
    const text = rulesBook(r).flatMap((s) => [s.title, ...s.paras]).join(' ');
    expect(text).toMatch(/Custom Rules/);
    expect(text).toMatch(/Re Bello/);
    expect(text).toMatch(/Ace played when there is no Ace on the table captures the whole table/);
    const sum = rulesSummary(r);
    expect(sum.custom).toBe(true);
    expect(decodeRules(sum.code)).toEqual(r);
  });
  it('the helper text never gives strategy advice', () => {
    const all = PRESET_ORDER.flatMap((id) => rulesBook(presetRules(id)).flatMap((s) => s.paras)).join(' ').toLowerCase();
    for (const w of ['should play', 'best move', 'you should', 'recommend', 'good idea', 'strategy tip']) expect(all).not.toContain(w);
  });
  it('every score category explains itself in one sentence', () => {
    const { state } = randomMatch(presetRules('cirulla', '4t'), 3);
    const names = ['Team A', 'Team B'];
    for (const c of state.lastScore!.categories) {
      const s = explainCategory(c, names, state.setup.rules);
      expect(s.length).toBeGreaterThan(8);
      expect(s.split(/[.!?](\s|$)/).filter((x) => x && x.trim().length > 2).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('tutorial uses the real engine', () => {
  it('every scripted move is legal and the script reaches the scoring', () => {
    let s = tutorialMatch();
    for (let p = 0; p < 6; p++) {
      const seat = s.hand.turn;
      let card: number, kind: string, takes: number[];
      if (TUTORIAL.expect[p]) {
        const want = TUTORIAL.expect[p];
        const o = legalOptions(s.setup.rules, s.hand.table, want.card).find((x) => x.kind === want.kind)!;
        expect(o, `play ${p}`).toBeTruthy();
        ({ card, kind, takes } = { card: want.card, kind: o.kind, takes: o.takes });
      } else {
        const m = TUTORIAL.scripted[p];
        const o = findOption(legalOptions(s.setup.rules, s.hand.table, m.card), m.takes);
        expect(o, `scripted play ${p}`).toBeTruthy();
        ({ card, kind, takes } = { card: m.card, kind: o!.kind, takes: o!.takes });
      }
      const r = apply(s, playCommand(s, seat, card, kind as never, takes));
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
      if (p === 4) expect(s.hand.scope[0]).toBe(1);
    }
    const end = fastForward(s);
    expect(end.phase === 'handEnd' || end.phase === 'matchEnd').toBe(true);
    // deterministic
    expect(fastForward(s)).toEqual(end);
  });
});

describe('persistence', () => {
  beforeEach(() => localStorage.clear());
  it('saves and restores a match exactly, and falls back to the replay log', async () => {
    const { saveMatch, loadMatch, hasSavedMatch } = await import('../../src/persistence/saves.ts');
    const { state } = randomMatch(presetRules('classic'), 12, 40);
    expect(saveMatch(state, 'test')).toBe(true);
    expect(loadMatch()).toEqual(state);
    expect(hasSavedMatch()).toBe(state.phase !== 'matchEnd');
    // A save whose state is unreadable (e.g. from a broken future schema) is rebuilt from its log.
    const raw = JSON.parse(localStorage.getItem('scopa:match')!);
    raw.state.schema = SCHEMA_VERSION + 5;
    localStorage.setItem('scopa:match', JSON.stringify(raw));
    expect(loadMatch()).toEqual(replay(state.setup, state.log));
  });
  it('settings merge over defaults so older saves gain new fields', async () => {
    const { loadSettings } = await import('../../src/persistence/settings.ts');
    localStorage.setItem('scopa:settings', JSON.stringify({ version: 1, cardBack: 'sole' }));
    const s = loadSettings();
    expect(s.cardBack).toBe('sole');
    expect(s.legalHighlights).toBe(true);
  });
  it('statistics record a match once and reset cleanly', async () => {
    const { recordMatch, loadStats, resetStats } = await import('../../src/persistence/stats.ts');
    const { state } = randomMatch(presetRules('classic'), 3);
    state.setup.seats[0] = { name: 'Me', kind: 'human' };
    recordMatch(state);
    recordMatch(state);
    expect(loadStats().matchesPlayed).toBe(1);
    resetStats();
    expect(loadStats().matchesPlayed).toBe(0);
  });
  it('clearing saved data removes only Scopa keys', async () => {
    const { clearAll } = await import('../../src/persistence/storage.ts');
    localStorage.setItem('other-app', 'x');
    localStorage.setItem('scopa:match', '{}');
    clearAll();
    expect(localStorage.getItem('scopa:match')).toBeNull();
    expect(localStorage.getItem('other-app')).toBe('x');
  });
});

describe('deterministic replay across a whole match', () => {
  it('a match replays command by command to identical states', () => {
    const { state } = randomMatch(presetRules('assi', '4t'), 99);
    for (const k of [0, 5, 17, state.log.length]) {
      const a = replay(state.setup, state.log, k);
      const b = replay(state.setup, state.log, k);
      expect(a).toEqual(b);
    }
    expect(replay(state.setup, state.log)).toEqual(state);
  });
  it('the same seed deals the same cards', () => {
    const a = newMatch({ rules: presetRules('classic'), seats: seats(2), seed: 5 }).state;
    const b = newMatch({ rules: presetRules('classic'), seats: seats(2), seed: 5 }).state;
    expect(a.hand).toEqual(b.hand);
  });
});

describe('card art', () => {
  it('draws 40 distinct faces and four backs as valid SVG', () => {
    const faces = new Set<string>();
    for (let c = 0; c < 40; c++) {
      const s = cardSvg(c);
      expect(s.startsWith('<svg') && s.endsWith('</svg>')).toBe(true);
      expect(s).not.toMatch(/NaN|undefined/);
      faces.add(s);
    }
    expect(faces.size).toBe(40);
    expect(BACKS.length).toBeGreaterThanOrEqual(4);
    for (const b of BACKS) expect(backSvg(b.id)).toMatch(/^<svg[\s\S]*<\/svg>$/);
  });
});
