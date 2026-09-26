import { RULES_VERSION, cloneRules, type Format, type PresetId, type RulesConfig } from './config.ts';

export interface PresetDef {
  id: PresetId;
  formats: Format[];
  recommended: Format;
  targets: number[];
  /** Build the preset's rules for a format. */
  build(format: Format): RulesConfig;
}

function classicBase(format: Format): RulesConfig {
  return {
    version: RULES_VERSION,
    preset: 'classic',
    format,
    deal: { handSize: 3, tableSize: 4, refill: true, redealOnKings: true, redealOnAces: false, redealOnTwoAces: false },
    capture: { mode: 'sum', exactMatchPriority: true, fifteenAllowsEqual: false, fifteenFewestCards: false },
    ace: { sweep: false, sweepScoresScopa: false, withAceOnTable: 'normal', toEmptyTable: 'stays', mayDecline: false },
    scopa: { finalPlay: 'never' },
    scoring: { reBello: false, napola: 'off', napoleone: false, primieraFigures: 'flat', piccola: false, grande: false },
    cirulla: { dealerBonus: false, declarations: false, matta: false },
    target: 11,
  };
}

export const PRESETS: Record<PresetId, PresetDef> = {
  classic: {
    id: 'classic',
    formats: ['2p', '3p', '4p', '4t'],
    recommended: '2p',
    targets: [11, 16, 21],
    build: (f) => classicBase(f),
  },
  scopone: {
    id: 'scopone',
    formats: ['4t'],
    recommended: '4t',
    targets: [11, 21],
    build: (f) => {
      const r = classicBase(f);
      r.preset = 'scopone';
      r.deal = { ...r.deal, handSize: 9, tableSize: 4, refill: false };
      return r;
    },
  },
  scientifico: {
    id: 'scientifico',
    formats: ['4t'],
    recommended: '4t',
    targets: [21, 11, 31],
    build: (f) => {
      const r = classicBase(f);
      r.preset = 'scientifico';
      r.deal = { ...r.deal, handSize: 10, tableSize: 0, refill: false, redealOnKings: false };
      r.scopa.finalPlay = 'counts';
      r.target = 21;
      return r;
    },
  },
  assi: {
    id: 'assi',
    formats: ['2p', '3p', '4p', '4t'],
    recommended: '2p',
    targets: [11, 16, 21],
    build: (f) => {
      const r = classicBase(f);
      r.preset = 'assi';
      r.ace = { sweep: true, sweepScoresScopa: false, withAceOnTable: 'normal', toEmptyTable: 'stays', mayDecline: false };
      return r;
    },
  },
  quindici: {
    id: 'quindici',
    formats: ['2p', '3p', '4p', '4t'],
    recommended: '2p',
    targets: [11, 21, 31],
    build: (f) => {
      const r = classicBase(f);
      r.preset = 'quindici';
      r.capture = { mode: 'fifteen', exactMatchPriority: true, fifteenAllowsEqual: false, fifteenFewestCards: true };
      return r;
    },
  },
  napola: {
    id: 'napola',
    formats: ['2p', '3p', '4p', '4t'],
    recommended: '2p',
    targets: [21, 11, 31, 41],
    build: (f) => {
      const r = classicBase(f);
      r.preset = 'napola';
      r.scoring.napola = 'full';
      r.scoring.napoleone = true;
      r.target = 21;
      return r;
    },
  },
  cirulla: {
    id: 'cirulla',
    formats: ['4t', '2p', '3p'],
    recommended: '4t',
    targets: [51, 26, 101],
    build: (f) => {
      const r = classicBase(f);
      r.preset = 'cirulla';
      r.deal = { ...r.deal, redealOnKings: false, redealOnTwoAces: true };
      r.capture = { mode: 'cirulla', exactMatchPriority: true, fifteenAllowsEqual: false, fifteenFewestCards: false };
      r.ace = { sweep: true, sweepScoresScopa: true, withAceOnTable: 'normal', toEmptyTable: 'stays', mayDecline: false };
      r.scoring = { ...r.scoring, piccola: true, grande: true, napoleone: true };
      r.cirulla = { dealerBonus: true, declarations: true, matta: true };
      r.target = 51;
      return r;
    },
  },
};

export const PRESET_ORDER: PresetId[] = ['classic', 'scopone', 'scientifico', 'assi', 'quindici', 'napola', 'cirulla'];

export function presetRules(id: PresetId, format?: Format): RulesConfig {
  const p = PRESETS[id];
  const f = format && p.formats.includes(format) ? format : p.recommended;
  return cloneRules(p.build(f));
}

/** Paths (like "ace.sweep") where `r` differs from its own preset's defaults, ignoring format and target. */
export function customisations(r: RulesConfig): string[] {
  const base = presetRules(r.preset, r.format) as unknown as Record<string, unknown>;
  const cur = r as unknown as Record<string, unknown>;
  const out: string[] = [];
  for (const group of ['deal', 'capture', 'ace', 'scopa', 'scoring', 'cirulla'] as const) {
    const b = base[group] as Record<string, unknown>;
    const c = cur[group] as Record<string, unknown>;
    for (const k of Object.keys(b)) if (b[k] !== c[k]) out.push(`${group}.${k}`);
  }
  return out;
}

/** Custom Rules = any rule changed from the preset. Target score is a normal choice. */
export function isCustom(r: RulesConfig): boolean {
  return customisations(r).length > 0 || !PRESETS[r.preset].targets.includes(r.target);
}

/** A short code that reproduces the configuration exactly. */
export function encodeRules(r: RulesConfig): string {
  const json = JSON.stringify(r);
  const b64 = typeof btoa === 'function' ? btoa(json) : Buffer.from(json, 'utf8').toString('base64');
  return 'SCOPA1-' + b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function decodeRules(code: string): RulesConfig {
  const m = /^SCOPA1-([A-Za-z0-9_-]+)$/.exec(code.trim());
  if (!m) throw new Error('Not a Scopa rules code');
  let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json) as RulesConfig;
}
