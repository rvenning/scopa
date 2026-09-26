import { cardShort, type CardId } from '../rules/cards.ts';
import { legalOptions, optionEquation } from '../rules/capture.ts';
import type { Format, PresetId } from '../rules/config.ts';
import { presetRules, PRESETS, PRESET_ORDER } from '../rules/presets.ts';
import { newMatch, replay, type AiLevel, type MatchState } from '../engine/match.ts';
import { formatReport, simulate } from '../ai/simulate.ts';
import { aiStats } from '../ai/client.ts';
import { offlineStatus } from '../pwa.ts';
import { loadLastSetup, saveMatch } from '../persistence/saves.ts';
import { defaultSeats } from '../ui/setup.ts';
import type { AppCtx } from '../ui/app.ts';
import type { GameScreen } from '../ui/game.ts';
import { h, toast } from '../ui/dom.ts';

/**
 * Developer tools. Only mounted with ?dev=1 (or in the dev server). Hidden
 * information is shown here deliberately and marked in red.
 */
export function mountDevTools(ctx: AppCtx, getGame: () => GameScreen | null) {
  const btn = h('button', { class: 'btn small dev', 'aria-label': 'Developer tools' }, 'dev');
  document.body.append(btn);
  let panel: HTMLElement | null = null;
  btn.onclick = () => { if (panel) { panel.remove(); panel = null; } else { panel = build(); document.body.append(panel); } };

  const cards = (cs: readonly CardId[]) => cs.map(cardShort).join(' ') || '—';

  function build(): HTMLElement {
    const out = h('pre');
    const p = h('div', { class: 'dev-panel', role: 'dialog', 'aria-label': 'Developer tools' });
    const g = getGame();
    const s = g?.state ?? null;
    const section = (title: string, ...kids: (HTMLElement | string | null)[]) => h('div', { style: { borderTop: '1px solid #ccc', padding: '6px 0' } }, h('b', {}, title), ...kids);

    // Seed entry
    const seedIn = h('input', { type: 'text', value: String(s?.setup.seed ?? ''), style: { width: '12em', minHeight: '32px' } }) as HTMLInputElement;
    const newFromSeed = h('button', { class: 'btn small', onclick: () => {
      const last = loadLastSetup();
      const rules = s?.setup.rules ?? last?.rules ?? presetRules('classic');
      const seats = s?.setup.seats ?? last?.seats ?? defaultSeats(2);
      const m = newMatch({ rules, seats, seed: Number(seedIn.value) >>> 0 }).state;
      saveMatch(m, ctx.build.version);
      ctx.go('game', { match: m });
      p.remove(); panel = null;
    } }, 'New match from seed');

    // Replay
    let cursor = s?.log.length ?? 0;
    const replayInfo = h('span', {}, s ? ` ${cursor}/${s.log.length}` : '');
    const stepTo = (k: number) => {
      if (!s || !g) return;
      cursor = Math.max(0, Math.min(s.log.length, k));
      const r = replay(s.setup, s.log, cursor);
      // keep the full log so we can step forward again
      g.loadState({ ...r, log: r.log });
      replayInfo.textContent = ` ${cursor}/${s.log.length}`;
    };

    // Inspector
    const inspect = () => {
      if (!s) return 'No match open.';
      const cur = getGame()?.state ?? s;
      const hd = cur.hand;
      const lines = [
        `preset ${cur.setup.rules.preset} ${cur.setup.rules.format}  seed ${cur.setup.seed}  hand ${cur.handNo}  dealer ${cur.dealer}  turn ${hd.turn}  phase ${cur.phase}  seq ${cur.seq}`,
        `scores ${cur.scores.join(' / ')}  scope ${hd.scope.join('/')}  lastCapturer ${hd.lastCapturer}`,
        `table: ${cards(hd.table)}`,
        ...hd.hands.map((x, i) => `[HIDDEN] seat ${i} (${cur.setup.seats[i].name}): ${cards(x)}`),
        `[HIDDEN] deck (${hd.deck.length}): ${cards(hd.deck)}`,
        ...hd.captures.map((x, i) => `pile side ${i} (${x.length}): ${cards(x)}`),
        '',
        'Legal moves:',
        ...hd.hands.flatMap((hand, seat) => hand.map((cc) => `  seat ${seat} ${cardShort(cc)}: ${legalOptions(cur.setup.rules, hd.table, cc).map((o) => `${o.kind}{${cards(o.takes)}} ${optionEquation(cur.setup.rules, cc, o)}`).join(' | ')}`)),
        '',
        `AI decisions ${aiStats.decisions}, mean ${(aiStats.msTotal / Math.max(1, aiStats.decisions)).toFixed(1)} ms, max ${aiStats.msMax.toFixed(1)} ms`,
      ];
      return lines.join('\n');
    };
    const inspector = h('pre', { class: 'hidden-info' }, inspect());

    // Scenario loader
    const scen = h('textarea', { rows: '5', style: { width: '100%', font: 'inherit' } }) as HTMLTextAreaElement;
    scen.value = JSON.stringify({ preset: 'classic', format: '2p', table: [4, 12, 23], hands: [[6, 16, 26], [1, 2, 3]], turn: 0 });
    const loadScenario = () => {
      try {
        const sc = JSON.parse(scen.value) as { preset: PresetId; format: Format; table: CardId[]; hands: CardId[][]; turn?: number; deck?: CardId[] };
        const rules = presetRules(sc.preset, sc.format);
        const seats = defaultSeats(sc.hands.length);
        const m = newMatch({ rules, seats, seed: 1 }).state;
        const used = new Set([...sc.table, ...sc.hands.flat()]);
        m.hand.table = [...sc.table];
        m.hand.hands = sc.hands.map((x) => [...x]);
        m.hand.deck = sc.deck ?? Array.from({ length: 40 }, (_, i) => i).filter((i) => !used.has(i)).slice(0, 0);
        m.hand.turn = sc.turn ?? 0;
        m.hand.revealed = sc.hands.map(() => []);
        const ok = new Set([...m.hand.deck, ...m.hand.table, ...m.hand.hands.flat()]).size === m.hand.deck.length + m.hand.table.length + m.hand.hands.flat().length;
        if (!ok) throw new Error('duplicate cards');
        ctx.go('game', { match: m });
        p.remove(); panel = null;
      } catch (e) { toast('Scenario error: ' + (e as Error).message); }
    };

    // Sliders
    const range = (label: string, min: number, max: number, step: number, get: () => number, set: (v: number) => void) => {
      const i = h('input', { type: 'range', min, max, step }) as HTMLInputElement;
      i.value = String(get());
      const lab = h('span', {}, ` ${get()}`);
      i.oninput = () => { set(Number(i.value)); lab.textContent = ` ${i.value}`; ctx.saveSettings(); ctx.applySettings(); };
      return h('label', { style: { display: 'block' } }, label, ' ', i, lab);
    };

    // Batch simulation
    const simPreset = h('select', {}, ...PRESET_ORDER.map((id) => h('option', { value: id }, id))) as HTMLSelectElement;
    const simLevels = h('input', { type: 'text', value: 'expert,standard' }) as HTMLInputElement;
    const simGames = h('input', { type: 'text', value: '20', style: { width: '4em' } }) as HTMLInputElement;
    const runSim = () => {
      out.textContent = 'Running…';
      setTimeout(() => {
        const id = simPreset.value as PresetId;
        const r = simulate({ preset: id, format: PRESETS[id].recommended, levels: simLevels.value.split(',') as AiLevel[], games: Number(simGames.value) || 10, seed: Date.now() >>> 0 });
        out.textContent = formatReport(r);
      }, 30);
    };

    const diag = h('pre', {}, '');
    const runDiag = async () => {
      const sw = 'serviceWorker' in navigator ? (navigator.serviceWorker.controller ? 'controlled by ' + navigator.serviceWorker.controller.scriptURL : 'not controlled') : 'no SW support';
      diag.textContent = `${await offlineStatus()}\nservice worker: ${sw}\nonline: ${navigator.onLine}\nbuild: ${JSON.stringify(ctx.build)}`;
    };

    p.append(
      h('div', { class: 'row between' }, h('b', {}, 'Developer tools (hidden information in red)'), h('button', { class: 'btn small', onclick: () => { p.remove(); panel = null; } }, 'Close')),
      section('Seed', ' ', seedIn, ' ', newFromSeed),
      ...(s ? [section('Replay', ' ', h('button', { class: 'btn small', onclick: () => stepTo(0) }, '|◀'), h('button', { class: 'btn small', onclick: () => stepTo(cursor - 1) }, '◀'), h('button', { class: 'btn small', onclick: () => stepTo(cursor + 1) }, '▶'), h('button', { class: 'btn small', onclick: () => stepTo(s.log.length) }, '▶|'), replayInfo)] : []),
      section('State inspector & legal moves', h('button', { class: 'btn small', onclick: () => { inspector.textContent = inspect(); } }, 'Refresh'), inspector),
      section('Scenario loader (card id = suit*10 + rank-1; suits D C S B)', scen, h('button', { class: 'btn small', onclick: loadScenario }, 'Load scenario')),
      section('Speed', range('AI pause ×', 0.05, 2, 0.05, () => ctx.settings.aiSpeed, (v) => { ctx.settings.aiSpeed = v; }), range('Animation speed ×', 0.25, 4, 0.25, () => ctx.settings.animationSpeed, (v) => { ctx.settings.animationSpeed = v; })),
      section('Batch simulation', ' ', simPreset, ' levels ', simLevels, ' games ', simGames, ' ', h('button', { class: 'btn small', onclick: runSim }, 'Run'), out),
      section('Offline / cache', ' ', h('button', { class: 'btn small', onclick: runDiag }, 'Diagnose'), h('button', { class: 'btn small', onclick: async () => { for (const k of await caches.keys()) await caches.delete(k); diag.textContent = 'Caches cleared.'; } }, 'Clear caches'), diag),
    );
    return p;
  }
}

export type { MatchState };
