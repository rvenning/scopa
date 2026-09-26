import { describe, expect, it } from 'vitest';
import { FORMAT_INFO, type Format } from '../../src/rules/config.ts';
import { OPTIONS, setOption } from '../../src/rules/options.ts';
import { PRESETS, PRESET_ORDER, customisations, decodeRules, encodeRules, isCustom, presetRules } from '../../src/rules/presets.ts';
import { validateRules } from '../../src/rules/validate.ts';

const ALL_FORMATS = Object.keys(FORMAT_INFO) as Format[];

describe('presets', () => {
  for (const id of PRESET_ORDER) {
    it(`${id}: valid in every supported format, rejected in others`, () => {
      for (const f of ALL_FORMATS) {
        const r = PRESETS[id].build(f);
        const errs = validateRules(r);
        if (PRESETS[id].formats.includes(f)) expect(errs).toEqual([]);
        else expect(errs.length).toBeGreaterThan(0);
      }
      expect(PRESETS[id].formats).toContain(PRESETS[id].recommended);
      expect(isCustom(presetRules(id))).toBe(false);
    });
  }
  it('Classic 2p is the recommended default', () => expect(PRESETS.classic.recommended).toBe('2p'));
  it('Scopone and Scientifico are partnership-only', () => {
    expect(PRESETS.scopone.formats).toEqual(['4t']);
    expect(PRESETS.scientifico.formats).toEqual(['4t']);
    expect(presetRules('scientifico').deal).toMatchObject({ handSize: 10, tableSize: 0, refill: false });
    expect(presetRules('scopone').deal).toMatchObject({ handSize: 9, tableSize: 4, refill: false });
  });
});

describe('incompatible options are rejected', () => {
  it('ace sub-options without the sweep', () => {
    const r = presetRules('classic'); r.ace.sweepScoresScopa = true;
    expect(validateRules(r)[0]).toMatch(/Ace sweep/);
  });
  it('napola in Cirulla', () => {
    const r = presetRules('cirulla'); r.scoring.napola = 'full';
    expect(validateRules(r).join()).toMatch(/Piccola/);
  });
  it('Cirulla features outside Cirulla', () => {
    const r = presetRules('classic'); r.cirulla.declarations = true;
    expect(validateRules(r).length).toBeGreaterThan(0);
  });
  it('fifteen options outside Quindici', () => {
    const r = presetRules('classic'); r.capture.fifteenAllowsEqual = true;
    expect(validateRules(r).length).toBeGreaterThan(0);
  });
  it('kings redeal with no table', () => {
    const r = presetRules('scientifico'); r.deal.redealOnKings = true;
    expect(validateRules(r).length).toBeGreaterThan(0);
  });
  it('bad deal arithmetic', () => {
    const r = presetRules('classic', '3p'); r.deal.handSize = 5;
    expect(validateRules(r).join()).toMatch(/evenly/);
  });
});

describe('advanced option model', () => {
  it('every option is either available or explains why not, for every preset', () => {
    for (const id of PRESET_ORDER) {
      const r = presetRules(id);
      for (const o of OPTIONS) {
        const why = o.unavailable(r);
        if (why) {
          expect(why.length).toBeGreaterThan(5);
          expect(setOption(r, o.id, o.choices[0]?.value ?? '11').error).toBe(why);
        } else {
          for (const c of o.choices) {
            const res = setOption(r, o.id, c.value);
            expect(res.error, `${id}/${o.id}=${c.value}: ${res.error}`).toBeUndefined();
            expect(validateRules(res.rules)).toEqual([]);
          }
        }
      }
    }
  });
  it('turning the Ace sweep off switches its dependents off, with notes', () => {
    let r = presetRules('assi');
    r = setOption(r, 'aceScopa', 'on').rules;
    r = setOption(r, 'aceDecline', 'on').rules;
    const res = setOption(r, 'aceSweep', 'off');
    expect(res.error).toBeUndefined();
    expect(res.rules.ace).toMatchObject({ sweep: false, sweepScoresScopa: false, mayDecline: false });
    expect(res.notes.length).toBe(2);
    expect(res.notes[0]).toMatch(/because/);
  });
  it('a change marks Custom Rules; target does not', () => {
    const r = presetRules('classic');
    expect(isCustom(setOption(r, 'target', '21').rules)).toBe(false);
    const c = setOption(r, 'reBello', 'on').rules;
    expect(isCustom(c)).toBe(true);
    expect(customisations(c)).toEqual(['scoring.reBello']);
  });
  it('rules codes reproduce the configuration exactly', () => {
    for (const id of PRESET_ORDER) {
      let r = presetRules(id);
      if (id === 'assi') r = setOption(r, 'aceEmpty', 'takesItself').rules;
      expect(decodeRules(encodeRules(r))).toEqual(r);
    }
    expect(() => decodeRules('nonsense')).toThrow();
  });
});
