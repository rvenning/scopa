import type { MatchState } from '../engine/match.ts';
import { rulesBook, rulesSummary } from '../content/rulesbook.ts';
import { BACKS } from '../presentation/cardArt.ts';
import { backUrl } from '../presentation/cards.ts';
import { audio } from '../presentation/audio.ts';
import type { RulesConfig } from '../rules/config.ts';
import type { Settings, TableTheme } from '../persistence/settings.ts';
import type { AppCtx } from './app.ts';
import { h } from './dom.ts';

export const TABLES: { id: TableTheme; name: string; css: string }[] = [
  { id: 'walnut', name: 'Warm walnut', css: 'linear-gradient(160deg,#6b4424,#4f2f17)' },
  { id: 'felt', name: 'Deep green felt', css: 'linear-gradient(160deg,#2f5d3f,#1d3f29)' },
  { id: 'marble', name: 'Café marble', css: 'linear-gradient(160deg,#e3ddd2,#b9b1a2)' },
  { id: 'linen', name: 'Rustic linen', css: 'linear-gradient(160deg,#b89a70,#97795a)' },
];

/** Card back and table surface pickers (radio groups). */
export function cosmeticsPicker(ctx: AppCtx, onChange?: () => void): HTMLElement {
  const s = ctx.settings;
  const backs = h('div', { class: 'picker', role: 'radiogroup', 'aria-label': 'Card back' });
  const tables = h('div', { class: 'picker', role: 'radiogroup', 'aria-label': 'Table surface' });
  const draw = () => {
    backs.replaceChildren(...BACKS.map((b) => h('button', { role: 'radio', 'aria-checked': String(s.cardBack === b.id), 'aria-label': b.name, onclick: () => { s.cardBack = b.id; ctx.saveSettings(); draw(); onChange?.(); } }, h('img', { src: backUrl(b.id), alt: '' }), h('div', { class: 'small' }, b.name))));
    tables.replaceChildren(...TABLES.map((t) => h('button', { role: 'radio', 'aria-checked': String(s.table === t.id), 'aria-label': t.name, onclick: () => { s.table = t.id; ctx.saveSettings(); draw(); onChange?.(); } }, h('div', { class: 'swatch', style: { background: t.css } }), h('div', { class: 'small' }, t.name))));
  };
  draw();
  return h('div', { class: 'stack' }, h('h3', {}, 'Card back'), backs, h('h3', {}, 'Table surface'), tables);
}

function toggle(label: string, desc: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
  const id = 'tg-' + label.replace(/\W+/g, '-').toLowerCase();
  const input = h('input', { type: 'checkbox', id, 'aria-describedby': id + '-d' }) as HTMLInputElement;
  input.checked = get();
  input.onchange = () => set(input.checked);
  return h('div', { class: 'toggle' }, h('div', {}, h('label', { for: id }, label), h('div', { class: 'small muted', id: id + '-d' }, desc)), input);
}
function slider(label: string, get: () => number, set: (v: number) => void, min = 0, max = 1, step = 0.05): HTMLElement {
  const id = 'sl-' + label.replace(/\W+/g, '-').toLowerCase();
  const input = h('input', { type: 'range', id, min, max, step }) as HTMLInputElement;
  input.value = String(get());
  input.oninput = () => set(Number(input.value));
  return h('div', { class: 'toggle' }, h('label', { for: id }, label), input);
}

/** All player preferences. Used by the Settings screen and the in-game menu. */
export function settingsPanel(ctx: AppCtx, onChange?: () => void): HTMLElement {
  const s: Settings = ctx.settings;
  const save = () => { ctx.saveSettings(); ctx.applySettings(); onChange?.(); };
  const motion = h('select', { id: 'rm', 'aria-label': 'Reduced motion' }, ...[['system', 'Follow device'], ['on', 'On'], ['off', 'Off']].map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement;
  motion.value = s.reducedMotion;
  motion.onchange = () => { s.reducedMotion = motion.value as Settings['reducedMotion']; save(); };
  return h('div', { class: 'stack' },
    h('h3', {}, 'Rules helper'),
    toggle('Card value badges', 'Show each card’s capture value in its corner. You can also hold the 1–10 button.', () => s.valueBadges, (v) => { s.valueBadges = v; save(); }),
    toggle('High-contrast badges', 'White on black value badges.', () => s.highContrastBadges, (v) => { s.highContrastBadges = v; save(); }),
    toggle('Highlight legal captures', 'Selecting a card shows every capture it can legally make. The helper never suggests which is best.', () => s.legalHighlights, (v) => { s.legalHighlights = v; save(); }),
    toggle('Confirm every move', 'Preview a capture and confirm it before it is played.', () => s.confirmMoves, (v) => { s.confirmMoves = v; save(); }),
    h('h3', {}, 'Sound'),
    toggle('Sound effects', 'Card sounds, the scopa flourish and scoring ticks.', () => s.sfxOn, (v) => { s.sfxOn = v; audio.unlock(); save(); }),
    slider('Effects volume', () => s.sfxVolume, (v) => { s.sfxVolume = v; save(); }),
    toggle('Café ambience', 'A very quiet room in the background.', () => s.ambienceOn, (v) => { s.ambienceOn = v; audio.unlock(); save(); }),
    slider('Ambience volume', () => s.ambienceVolume, (v) => { s.ambienceVolume = v; save(); }),
    toggle('Sound captions', 'Show a short caption for meaningful sounds.', () => s.captions, (v) => { s.captions = v; save(); }),
    h('h3', {}, 'Motion'),
    h('div', { class: 'toggle' }, h('label', { for: 'rm' }, 'Reduced motion'), motion),
    slider('Computer players’ pace (slower → faster)', () => 2.25 - s.aiSpeed, (v) => { s.aiSpeed = Math.round((2.25 - v) * 100) / 100; save(); }, 0.25, 2, 0.25),
    h('h3', {}, 'Look'),
    cosmeticsPicker(ctx, onChange),
  );
}

export function rulesBookView(r: RulesConfig): HTMLElement {
  const secs = rulesBook(r);
  const sum = rulesSummary(r);
  return h('div', { class: 'stack' },
    ...secs.map((sec) => h('section', { 'aria-labelledby': `rb-${sec.id}` },
      h(sec.id === 'overview' ? 'h2' : 'h3', { id: `rb-${sec.id}` }, sec.title),
      ...sec.paras.filter(Boolean).map((p) => h('p', {}, p)),
      sec.table ? h('table', { class: 'rt' }, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Card'), h('th', { scope: 'col' }, sec.id === 'deck' ? 'Capture value' : 'Primiera value'))), h('tbody', {}, ...sec.table.map(([a, b]) => h('tr', {}, h('td', {}, a), h('td', {}, b))))) : null)),
    h('section', {}, h('h3', {}, 'This configuration'), h('ul', {}, ...sum.lines.map((l) => h('li', {}, l))), h('p', { class: 'small muted' }, 'Rules code (paste it into New Game to play exactly these rules):'), h('div', { class: 'code' }, sum.code)),
  );
}

interface PauseOpts { state: MatchState; tutorial: boolean; showAll: boolean | null; onShowAll(v: boolean): void; onClose(): void; onQuit(): void }

export function pauseMenu(host: HTMLElement, ctx: AppCtx, o: PauseOpts) {
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pm-t' });
  const main = () => {
    const resume = h('button', { class: 'btn primary block', onclick: () => o.onClose() }, 'Resume');
    sheet.replaceChildren(
      h('h2', { id: 'pm-t' }, 'Paused'),
      h('div', { class: 'stack' },
        resume,
        h('button', { class: 'btn block', onclick: () => sub('Rules', rulesBookView(o.state.setup.rules)) }, 'Rules book'),
        h('button', { class: 'btn block', onclick: () => sub('Settings', settingsPanel(ctx)) }, 'Settings'),
        o.showAll !== null ? h('button', { class: 'btn block', onclick: () => { o.onShowAll(!o.showAll); o.showAll = !o.showAll; main(); } }, o.showAll ? 'Hide the computer players’ hands' : 'Show all hands (watching)') : null,
        h('button', { class: 'btn block', onclick: () => o.onQuit() }, o.tutorial ? 'Leave tutorial' : 'Save and leave'),
      ));
    resume.focus();
  };
  const sub = (title: string, body: HTMLElement) => {
    const back = h('button', { class: 'btn small', onclick: () => main() }, '← Back');
    sheet.replaceChildren(h('div', { class: 'row between' }, h('h2', { id: 'pm-t' }, title), back), body, h('div', { class: 'row end', style: { marginTop: '12px' } }, h('button', { class: 'btn primary', onclick: () => o.onClose() }, 'Resume')));
    back.focus();
  };
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); o.onClose(); } });
  host.append(sheet);
  main();
}
