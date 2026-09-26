import { card } from '../rules/cards.ts';
import type { RulesConfig } from '../rules/config.ts';
import { presetRules, PRESET_ORDER } from '../rules/presets.ts';
import { PRESET_TEXT } from '../content/presets.ts';
import { faceUrl } from '../presentation/cards.ts';
import { clearAll } from '../persistence/storage.ts';
import { hasSavedMatch, loadLastSetup, loadMatch } from '../persistence/saves.ts';
import { loadStats, resetStats } from '../persistence/stats.ts';
import { DEFAULT_SETTINGS } from '../persistence/settings.ts';
import type { AppCtx, Screen, ScreenName } from './app.ts';
import { confirmDialog, h, toast } from './dom.ts';
import { rulesBookView, settingsPanel } from './menus.ts';
import { startMatch } from './setup.ts';
import { checkForUpdate, offlineStatus } from '../pwa.ts';

export function titleScreen(ctx: AppCtx): Screen {
  const el = h('div', { class: 'screen paper' });
  const saved = hasSavedMatch();
  const last = loadLastSetup();
  const lastLabel = last ? `${PRESET_TEXT[last.rules.preset].name}, ${last.seats.map((s) => s.name).join(' v ')}` : '';
  const menu = h('nav', { class: 'menu', 'aria-label': 'Main menu' },
    saved ? h('button', { class: 'btn primary block', onclick: () => { const m = loadMatch(); if (m) ctx.go('game', { match: m, resume: true }); else toast('That saved match could not be read.'); } }, 'Continue match') : null,
    h('button', { class: `btn block${saved ? '' : ' primary'}`, onclick: () => ctx.go('setup') }, 'New game'),
    last ? h('button', { class: 'btn block', onclick: () => startMatch(ctx, { rules: last.rules, seats: last.seats }), 'aria-label': `Play again: ${lastLabel}` }, 'Play again', h('span', { class: 'small muted', style: { fontFamily: 'var(--font-body)', fontWeight: '400' } }, ` — ${PRESET_TEXT[last.rules.preset].name}`)) : null,
    h('button', { class: 'btn block', onclick: () => ctx.go('tutorial') }, 'How to play'),
    h('div', { class: 'row', style: { justifyContent: 'center' } },
      h('button', { class: 'btn small', onclick: () => ctx.go('rules', { back: 'title' }) }, 'Rules'),
      h('button', { class: 'btn small', onclick: () => ctx.go('settings', { back: 'title' }) }, 'Settings'),
      h('button', { class: 'btn small', onclick: () => ctx.go('stats') }, 'Statistics')));
  el.append(h('div', { class: 'page title-wrap' },
    h('div', { class: 'title-cards', 'aria-hidden': 'true' }, h('img', { src: faceUrl(card(1, 10)), alt: '' }), h('img', { src: faceUrl(card(0, 7)), alt: '' }), h('img', { src: faceUrl(card(3, 9)), alt: '' })),
    h('h1', { class: 'wordmark' }, 'Scopa'),
    h('p', { class: 'subtitle' }, 'The Italian card game, at the kitchen table.'),
    menu,
    h('p', { class: 'version small muted' }, `Version ${ctx.build.version} (${ctx.build.sha})`)));
  return { el };
}

export function rulesScreen(ctx: AppCtx, rules?: RulesConfig, back: ScreenName = 'title'): Screen {
  const el = h('div', { class: 'screen paper' });
  const page = h('div', { class: 'page' });
  const current = rules ?? loadMatch()?.setup.rules ?? loadLastSetup()?.rules ?? presetRules('classic');
  const pick = h('select', { id: 'rb-pick', 'aria-label': 'Show rules for' }, ...PRESET_ORDER.map((id) => h('option', { value: id }, PRESET_TEXT[id].name))) as HTMLSelectElement;
  pick.value = current.preset;
  const body = h('div');
  const draw = () => {
    const r = pick.value === current.preset ? current : presetRules(pick.value as RulesConfig['preset']);
    body.replaceChildren(rulesBookView(r));
  };
  pick.onchange = draw;
  draw();
  page.append(h('div', { class: 'row between' }, h('button', { class: 'btn small', onclick: () => ctx.go(back) }, '← Back'), h('div', { class: 'field', style: { minWidth: '220px' } }, h('label', { for: 'rb-pick', class: 'small' }, 'Rules for'), pick)), body,
    h('div', { class: 'row end', style: { marginTop: '16px' } }, h('button', { class: 'btn', onclick: () => ctx.go(back) }, 'Done')));
  el.append(page);
  return { el, onKey: (e) => { if (e.key === 'Escape') ctx.go(back); } };
}

export function settingsScreen(ctx: AppCtx, back: ScreenName = 'title'): Screen {
  const el = h('div', { class: 'screen paper' });
  const status = h('p', { class: 'small', role: 'status' });
  const refresh = async () => { status.textContent = await offlineStatus(); };
  void refresh();
  const page = h('div', { class: 'page' },
    h('div', { class: 'row between' }, h('h1', {}, 'Settings'), h('button', { class: 'btn small', onclick: () => ctx.go(back) }, '← Back')),
    settingsPanel(ctx),
    h('h3', {}, 'App'),
    h('p', {}, `Scopa version ${ctx.build.version} (${ctx.build.sha}), built ${ctx.build.built.slice(0, 10)}.`),
    status,
    h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: async () => { status.textContent = await checkForUpdate(); } }, 'Check for update'),
      h('button', { class: 'btn small', onclick: async () => {
        if (await confirmDialog(el, 'Reset settings?', 'All preferences go back to their defaults. Your saved match and statistics are kept.', 'Reset settings')) {
          Object.assign(ctx.settings, DEFAULT_SETTINGS, { tutorialSeen: ctx.settings.tutorialSeen });
          ctx.saveSettings(); ctx.applySettings(); ctx.go('settings', { back });
        }
      } }, 'Reset settings')),
    h('div', { class: 'card-panel', style: { marginTop: '16px', borderColor: 'var(--danger)' } },
      h('h3', {}, 'Clear saved data'),
      h('p', { class: 'small' }, 'Deletes the match in progress, your statistics, your last game setup and all settings from this device. This cannot be undone.'),
      h('button', { class: 'btn', style: { borderColor: 'var(--danger)', color: 'var(--danger)' }, onclick: async () => {
        if (await confirmDialog(el, 'Clear all saved data?', 'The match in progress, statistics and settings will be deleted from this device.', 'Delete everything')) {
          clearAll();
          Object.assign(ctx.settings, DEFAULT_SETTINGS);
          ctx.applySettings();
          toast('Saved data cleared.');
          ctx.go('title');
        }
      } }, 'Clear saved data')),
    h('h3', {}, 'Credits and licences'),
    h('p', { class: 'small' }, 'Traditional card faces and the cubes back: scans from Wikimedia Commons (Category: Naples deck, uploaded by Trocche100, released to the public domain), a Dal Negro printing of the Neapolitan pattern. Table textures: ambientCG (CC0). The Original illustrated deck, the other card backs and all sounds are original to this project. Fonts: Cormorant Garamond and EB Garamond, SIL Open Font License 1.1. Full details in docs/ASSETS.md; rules sources in docs/RULES_SOURCES.md.'),
  );
  el.append(page);
  return { el, onKey: (e) => { if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) ctx.go(back); } };
}

export function statsScreen(ctx: AppCtx): Screen {
  const el = h('div', { class: 'screen paper' });
  const draw = () => {
    const s = loadStats();
    const rows: [string, string][] = [
      ['Matches played', String(s.matchesPlayed)],
      ['Matches won by a person here', String(s.humanWins)],
      ['Matches lost', String(s.humanLosses)],
      ['Hands played', String(s.handsPlayed)],
      ['Scope made', String(s.scope)],
      ['Settebelli captured', String(s.settebelli)],
      ['Best single hand', `${s.bestHand} points`],
      ...PRESET_ORDER.filter((p) => s.byPreset[p]).map((p) => [`${PRESET_TEXT[p].name}`, `${s.byPreset[p].won} won of ${s.byPreset[p].played}`] as [string, string]),
    ];
    page.replaceChildren(
      h('div', { class: 'row between' }, h('h1', {}, 'Statistics'), h('button', { class: 'btn small', onclick: () => ctx.go('title') }, '← Back')),
      h('p', { class: 'small muted' }, 'Kept only on this device.'),
      h('table', { class: 'rt' }, h('tbody', {}, ...rows.map(([a, b]) => h('tr', {}, h('th', { scope: 'row' }, a), h('td', {}, b))))),
      h('button', { class: 'btn', onclick: async () => { if (await confirmDialog(el, 'Reset statistics?', 'All statistics on this device will be set back to zero.', 'Reset')) { resetStats(); draw(); } } }, 'Reset statistics'));
  };
  const page = h('div', { class: 'page' });
  el.append(page);
  draw();
  return { el, onKey: (e) => { if (e.key === 'Escape') ctx.go('title'); } };
}
