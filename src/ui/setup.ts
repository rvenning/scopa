import { FORMAT_INFO, type Format, type PresetId, type RulesConfig } from '../rules/config.ts';
import { PRESETS, PRESET_ORDER, decodeRules, presetRules, isCustom } from '../rules/presets.ts';
import { OPTIONS, optionChoices, setOption } from '../rules/options.ts';
import { validateRules } from '../rules/validate.ts';
import { newMatch, type AiLevel, type SeatConfig } from '../engine/match.ts';
import { randomSeed } from '../rules/rng.ts';
import { PERSONAS, personaById } from '../ai/personalities.ts';
import { FORMAT_TEXT, PRESET_TEXT } from '../content/presets.ts';
import { rulesSummary } from '../content/rulesbook.ts';
import { loadLastSetup, saveLastSetup, saveMatch } from '../persistence/saves.ts';
import type { AppCtx, Screen } from './app.ts';
import { announce, h, toast } from './dom.ts';
import { cosmeticsPicker, TABLES } from './menus.ts';
import { BACKS } from '../presentation/cardArt.ts';

const STEPS = ['Rules', 'Players', 'Seats', 'Scoring', 'Look', 'Begin'];

export interface SetupState { rules: RulesConfig; seats: SeatConfig[] }

export function defaultSeats(n: number, prev: SeatConfig[] = []): SeatConfig[] {
  const used = new Set(prev.filter((s) => s.kind === 'ai').map((s) => s.persona));
  const free = PERSONAS.filter((p) => !used.has(p.id));
  return Array.from({ length: n }, (_, i) => {
    if (prev[i]) return prev[i];
    if (i === 0) return { name: 'You', kind: 'human' as const };
    const p = free.shift() ?? PERSONAS[i % PERSONAS.length];
    return { name: p.name, kind: 'ai' as const, level: 'standard' as AiLevel, persona: p.id };
  });
}

export function initialSetup(fromRules?: RulesConfig): SetupState {
  const last = loadLastSetup();
  if (fromRules) {
    const seats = last && last.seats.length === FORMAT_INFO[fromRules.format].seats ? last.seats : defaultSeats(FORMAT_INFO[fromRules.format].seats);
    return { rules: JSON.parse(JSON.stringify(fromRules)), seats };
  }
  if (last && last.rules && validateRules(last.rules).length === 0 && last.seats.length === FORMAT_INFO[last.rules.format].seats) {
    return { rules: last.rules, seats: last.seats };
  }
  const rules = presetRules('classic', '2p');
  return { rules, seats: defaultSeats(2) };
}

export function startMatch(ctx: AppCtx, st: SetupState) {
  const seats = st.seats.map((s, i) => ({ ...s, name: s.name.trim() || (s.kind === 'human' ? `Player ${i + 1}` : personaById(s.persona).name) }));
  const m = newMatch({ rules: st.rules, seats, seed: randomSeed() }).state;
  saveLastSetup({ preset: st.rules.preset, format: st.rules.format, seats, rules: st.rules });
  saveMatch(m, ctx.build.version);
  ctx.go('game', { match: m, resume: false });
}

export function setupScreen(ctx: AppCtx, fromRules?: RulesConfig): Screen {
  const st = initialSetup(fromRules);
  let step = 0;
  let notes: string[] = [];
  const el = h('div', { class: 'screen paper' });
  const page = h('div', { class: 'page' });
  el.append(page);

  const setPreset = (id: PresetId) => {
    const keepFormat = PRESETS[id].formats.includes(st.rules.format) ? st.rules.format : PRESETS[id].recommended;
    st.rules = presetRules(id, keepFormat);
    st.seats = defaultSeats(FORMAT_INFO[st.rules.format].seats, st.seats.slice(0, FORMAT_INFO[st.rules.format].seats));
    notes = [];
  };
  const setFormat = (f: Format) => {
    const target = st.rules.target;
    const custom = JSON.parse(JSON.stringify(st.rules)) as RulesConfig;
    const fresh = presetRules(st.rules.preset, f);
    // keep compatible custom options when only the table size changes
    const merged = { ...custom, format: f, deal: fresh.deal } as RulesConfig;
    st.rules = validateRules(merged).length ? fresh : merged;
    st.rules.target = target;
    st.seats = defaultSeats(FORMAT_INFO[f].seats, st.seats.slice(0, FORMAT_INFO[f].seats));
  };

  const nav = () => h('div', { class: 'row between', style: { marginTop: '16px' } },
    h('button', { class: 'btn', onclick: () => { if (step === 0) ctx.go('title'); else { step--; draw(); } } }, step === 0 ? 'Cancel' : '← Back'),
    step < STEPS.length - 1
      ? h('button', { class: 'btn primary', onclick: () => { step++; draw(); } }, `Next: ${STEPS[step + 1]} →`)
      : h('button', { class: 'btn primary', onclick: () => startMatch(ctx, st) }, 'Begin the match'));

  const header = () => h('div', {},
    h('div', { class: 'steps', 'aria-hidden': 'true' }, ...STEPS.map((_, i) => h('span', { class: i <= step ? 'on' : '' }))),
    h('p', { class: 'small muted', style: { margin: '0' } }, `Step ${step + 1} of ${STEPS.length}`),
    h('h1', { id: 'setup-h', tabindex: '-1' }, ['Choose the rules', 'Players and teams', 'Who is playing?', 'Target and advanced rules', 'Cards and table', 'Ready to deal'][step]));

  const radio = (label: (HTMLElement | null)[], checked: boolean, disabledWhy: string | null, onPick: () => void) =>
    h('button', {
      class: 'choice', role: 'radio', 'aria-checked': String(checked), 'aria-disabled': disabledWhy ? 'true' : null,
      onclick: () => { if (disabledWhy) { toast(disabledWhy); announce(disabledWhy); return; } onPick(); draw(); },
    }, ...label, disabledWhy ? h('div', { class: 'why' }, disabledWhy) : null);

  function stepPreset(): HTMLElement {
    return h('div', { class: 'stack', role: 'radiogroup', 'aria-labelledby': 'setup-h' }, ...PRESET_ORDER.map((id) => {
      const t = PRESET_TEXT[id];
      return radio([
        h('div', { class: 'name' }, t.name),
        h('div', {}, t.tagline),
        h('div', { class: 'small muted' }, t.players),
        id === st.rules.preset ? h('div', { class: 'small', style: { marginTop: '6px' } }, h('div', {}, t.description), h('strong', {}, 'What changes? '), h('ul', { style: { margin: '4px 0 0', paddingLeft: '1.2em' } }, ...t.changes.map((c) => h('li', {}, c)))) : null,
      ], st.rules.preset === id, null, () => setPreset(id));
    }));
  }

  function stepFormat(): HTMLElement {
    const p = PRESETS[st.rules.preset];
    const all: Format[] = ['2p', '3p', '4p', '4t'];
    return h('div', { class: 'stack', role: 'radiogroup', 'aria-labelledby': 'setup-h' },
      h('p', {}, `${PRESET_TEXT[st.rules.preset].name}: ${PRESET_TEXT[st.rules.preset].players}`),
      ...all.map((f) => {
        const ok = p.formats.includes(f);
        const why = ok ? null : st.rules.preset === 'scopone' || st.rules.preset === 'scientifico'
          ? `${PRESET_TEXT[st.rules.preset].name} is always played by four players in two partnerships.`
          : st.rules.preset === 'cirulla' && f === '4p' ? 'Cirulla with four players is played in two partnerships.' : 'Not played this way.';
        const deal = presetRules(st.rules.preset, ok ? f : p.recommended).deal;
        const desc = ok ? (deal.refill ? `${deal.handSize} cards each, redealt as hands empty; ${36 / (deal.handSize * FORMAT_INFO[f].seats)} deals per hand.` : `All cards dealt at once: ${deal.handSize} each.`) : '';
        return radio([h('div', { class: 'name' }, FORMAT_TEXT[f] + (f === p.recommended ? ' (recommended)' : '')), h('div', { class: 'small muted' }, desc)], st.rules.format === f, why, () => setFormat(f));
      }),
      h('p', { class: 'small muted' }, 'Everyone can be a person at this device or a computer player. Make every seat a computer player to watch a game.'));
  }

  function stepSeats(): HTMLElement {
    const rows = st.seats.map((s, i) => {
      const team = st.rules.format === '4t' ? (i % 2 === 0 ? 'Team A' : 'Team B') : null;
      const nameIn = h('input', { type: 'text', id: `seat-n-${i}`, value: s.name, maxlength: '18', autocomplete: 'off', 'aria-describedby': `seat-d-${i}` }) as HTMLInputElement;
      nameIn.oninput = () => { s.name = nameIn.value; };
      const kind = h('select', { id: `seat-k-${i}`, 'aria-label': `Seat ${i + 1} player type` },
        h('option', { value: 'human' }, 'Person at this device'),
        h('option', { value: 'relaxed' }, 'Computer — Relaxed'),
        h('option', { value: 'standard' }, 'Computer — Standard'),
        h('option', { value: 'expert' }, 'Computer — Expert')) as HTMLSelectElement;
      kind.value = s.kind === 'human' ? 'human' : s.level ?? 'standard';
      kind.onchange = () => {
        if (kind.value === 'human') { st.seats[i] = { name: s.kind === 'human' ? s.name : `Player ${i + 1}`, kind: 'human' }; }
        else {
          const persona = s.persona ?? PERSONAS.find((p) => !st.seats.some((x) => x.persona === p.id))?.id ?? PERSONAS[i].id;
          st.seats[i] = { name: s.kind === 'ai' ? s.name : personaById(persona).name, kind: 'ai', level: kind.value as AiLevel, persona };
        }
        draw();
        (document.getElementById(`seat-k-${i}`) as HTMLElement | null)?.focus();
      };
      const persona = s.kind === 'ai' ? h('select', { id: `seat-p-${i}`, 'aria-label': `Seat ${i + 1} character` }, ...PERSONAS.map((p) => h('option', { value: p.id }, p.name))) as HTMLSelectElement : null;
      if (persona) {
        persona.value = s.persona ?? PERSONAS[0].id;
        persona.onchange = () => { const old = personaById(s.persona); s.persona = persona.value; if (!s.name || s.name === old.name) s.name = personaById(persona.value).name; draw(); };
      }
      return h('div', { class: 'card-panel stack' },
        h('div', { class: 'row between' }, h('strong', {}, `Seat ${i + 1}${i === 0 ? ' (bottom)' : ''}`), team ? h('span', { class: 'badge' }, team) : null),
        h('div', { class: 'seat-row' },
          h('div', { class: 'field' }, h('label', { for: `seat-n-${i}` }, 'Name'), nameIn),
          h('div', { class: 'field' }, h('label', { for: `seat-k-${i}` }, 'Plays as'), kind),
          persona ? h('div', { class: 'field' }, h('label', { for: `seat-p-${i}` }, 'Character'), persona) : h('div')),
        h('div', { class: 'small muted', id: `seat-d-${i}` }, s.kind === 'ai' ? personaById(s.persona).blurb : 'Plays at this device. With more than one person here, the game asks you to pass the device between turns and keeps each hand private.'));
    });
    const humans = st.seats.filter((s) => s.kind === 'human').length;
    return h('div', { class: 'stack' },
      h('p', { class: 'small' }, st.rules.format === '4t' ? 'Partners sit opposite: seats 1 and 3 are Team A, seats 2 and 4 are Team B. Play goes counter-clockwise, seat 1 → 2 → 3 → 4.' : 'Play goes counter-clockwise around the table in seat order.'),
      ...rows,
      h('p', { class: 'small muted' }, humans === 0 ? 'Every seat is a computer player: you will watch the match.' : humans > 1 ? `${humans} people will pass this device. Each hand stays hidden until its owner taps “ready”.` : 'One person against the computer.'));
  }

  function stepRules(): HTMLElement {
    const r = st.rules;
    const wrap = h('div', { class: 'stack' });
    wrap.append(h('div', { class: 'row' }, h('strong', {}, PRESET_TEXT[r.preset].name), isCustom(r) ? h('span', { class: 'badge custom' }, 'Custom Rules') : h('span', { class: 'badge' }, 'Preset rules')));
    for (const n of notes) wrap.append(h('div', { class: 'note', role: 'status' }, n));
    for (const o of OPTIONS) {
      const why = o.unavailable(r);
      if (why && !['aceScopa', 'aceOnTable', 'aceEmpty', 'aceDecline', 'napoleone', 'matta', 'redealOnAces'].includes(o.id)) continue; // unrelated to this preset: not shown at all
      const id = `opt-${o.id}`;
      const sel = h('select', { id, 'aria-describedby': `${id}-h`, disabled: !!why }, ...optionChoices(o, r).map((c) => h('option', { value: c.value }, c.label))) as HTMLSelectElement;
      sel.value = o.get(r);
      sel.onchange = () => {
        const res = setOption(st.rules, o.id, sel.value);
        if (res.error) { toast(res.error); sel.value = o.get(st.rules); return; }
        st.rules = res.rules;
        notes = res.notes;
        if (notes.length) announce(notes.join(' '));
        draw();
        (document.getElementById(id) as HTMLElement | null)?.focus();
      };
      wrap.append(h('div', { class: 'opt' }, h('label', { for: id }, o.label), sel, h('div', { class: 'small', id: `${id}-h` }, o.help), why ? h('div', { class: 'small why' }, `Unavailable: ${why}`) : null));
    }
    const code = h('input', { type: 'text', id: 'rules-code', placeholder: 'SCOPA1-…', autocomplete: 'off' }) as HTMLInputElement;
    wrap.append(
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { st.rules = presetRules(r.preset, r.format); notes = ['Rules reset to the preset.']; draw(); } }, 'Reset to preset')),
      h('details', {}, h('summary', {}, 'Use a rules code'), h('div', { class: 'stack' }, h('label', { for: 'rules-code', class: 'small' }, 'Paste a code from the rules book to play exactly those rules.'), code,
        h('button', { class: 'btn small', onclick: () => {
          try {
            const nr = decodeRules(code.value);
            const errs = validateRules(nr);
            if (errs.length) throw new Error(errs[0]);
            st.rules = nr;
            st.seats = defaultSeats(FORMAT_INFO[nr.format].seats, st.seats.slice(0, FORMAT_INFO[nr.format].seats));
            notes = ['Rules loaded from code.'];
            draw();
          } catch (e) { toast(`That code did not work: ${(e as Error).message}`, 3600); }
        } }, 'Load code'))));
    return wrap;
  }

  function stepLook(): HTMLElement {
    return cosmeticsPicker(ctx);
  }

  function stepSummary(): HTMLElement {
    const sum = rulesSummary(st.rules);
    const seatLines = st.seats.map((s, i) => `Seat ${i + 1}${st.rules.format === '4t' ? (i % 2 ? ' (Team B)' : ' (Team A)') : ''}: ${s.name || '(unnamed)'} — ${s.kind === 'human' ? 'person' : `computer, ${s.level}`}`);
    return h('div', { class: 'stack' },
      h('div', { class: 'card-panel' }, h('h3', {}, sum.custom ? 'Custom Rules' : 'Rules'), h('ul', {}, ...sum.lines.map((l) => h('li', {}, l)))),
      h('div', { class: 'card-panel' }, h('h3', {}, 'Players'), h('ul', {}, ...seatLines.map((l) => h('li', {}, l)))),
      h('div', { class: 'card-panel' }, h('h3', {}, 'Look'), h('p', {}, `${BACKS.find((b) => b.id === ctx.settings.cardBack)?.name} cards on ${TABLES.find((t) => t.id === ctx.settings.table)?.name.toLowerCase()}.`)),
      h('details', {}, h('summary', {}, 'Rules code'), h('div', { class: 'code' }, sum.code)));
  }

  function draw() {
    const body = [stepPreset, stepFormat, stepSeats, stepRules, stepLook, stepSummary][step]();
    page.replaceChildren(header(), body, nav());
    (page.querySelector('#setup-h') as HTMLElement | null)?.focus({ preventScroll: true });
  }
  draw();
  return { el, onKey: (e) => { if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) { if (step > 0) { step--; draw(); } else ctx.go('title'); } } };
}
