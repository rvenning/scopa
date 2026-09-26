import { describe, expect, it } from 'vitest';
import { AudioDirector, CATEGORY, MAX_PAN, type AudioSettings } from '../../src/presentation/audio.ts';
import type { RecordedEngine, Sample } from '../../src/presentation/recorded.ts';
import type { SynthVoice, Cue } from '../../src/presentation/synth.ts';

class FakeSynth {
  played: { cue: Cue; bus: string }[] = [];
  volumes = { sfx: -1, ui: -1, amb: -1 };
  unlock() {}
  setVolumes(v: { sfx: number; ui: number; amb: number }) { this.volumes = v; }
  suspendIfIdle() {}
  play(cue: Cue, bus: 'sfx' | 'ui' = 'sfx') { this.played.push({ cue, bus }); }
}

class FakeRecorded implements RecordedEngine {
  loaded = true;
  played: { name: Sample; volume: number; pan: number }[] = [];
  amb: number[] = [];
  play(name: Sample, volume: number, pan: number) { this.played.push({ name, volume, pan }); }
  ambience(v: number) { this.amb.push(v); }
  suspend() {}
}

const ON: AudioSettings = { sfxOn: true, sfxVolume: 0.8, uiVolume: 0.5, ambOn: false, ambVolume: 0.4 };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function director(opts: { fail?: boolean; loaded?: boolean } = {}) {
  const synth = new FakeSynth();
  const rec = new FakeRecorded();
  rec.loaded = opts.loaded ?? true;
  let ready: () => void = () => {};
  let error: (w: string) => void = () => {};
  const d = new AudioDirector(async () => {
    if (opts.fail) throw new Error('offline');
    return { createRecorded: (onReady: () => void, onError: (w: string) => void) => { ready = onReady; error = onError; return rec; } };
  }, synth as unknown as SynthVoice);
  d.configure(ON);
  d.unlock();
  await flush();
  ready();
  return { d, synth, rec, fail: (w: string) => error(w) };
}

describe('audio', () => {
  it('plays card sounds and jingles from the recordings once loaded', async () => {
    const { d, synth, rec } = await director();
    d.play('place', false);
    d.play('gather', false);
    d.play('shuffle', false);
    d.play('scopa', false);
    expect(rec.played.map((p) => p.name)).toEqual([expect.stringMatching(/^place[1-4]$/), expect.stringMatching(/^capture[1-4]$/), 'shuffle', 'scopa']);
    expect(synth.played).toEqual([]);
  });

  it('interface cues are always synthesised, on the interface bus', async () => {
    const { d, synth, rec } = await director();
    d.play('turn', false);
    d.play('error', false);
    d.play('tick', false);
    expect(synth.played).toEqual([{ cue: 'turn', bus: 'ui' }, { cue: 'error', bus: 'ui' }, { cue: 'tick', bus: 'ui' }]);
    expect(rec.played).toEqual([]);
  });

  it('muting sound effects silences every cue in both voices, but captions still appear', async () => {
    const { d, synth, rec } = await director();
    const captions: string[] = [];
    d.onCaption = (t) => captions.push(t);
    d.configure({ ...ON, sfxOn: false });
    for (const cue of Object.keys(CATEGORY) as Cue[]) d.play(cue, true);
    expect(rec.played).toEqual([]);
    expect(synth.played).toEqual([]);
    expect(synth.volumes.sfx).toBe(0);
    expect(synth.volumes.ui).toBe(0);
    expect(d.log.slice(-10).every((e) => e.via === 'muted')).toBe(true);
    expect(captions).toContain('Scopa!');
  });

  it('volume categories follow their own sliders', async () => {
    const { d, rec } = await director();
    d.configure({ ...ON, sfxVolume: 0.5, uiVolume: 0.25 });
    expect(d.volumeFor('ui')).toBeCloseTo(0.25 * 0.8);
    expect(d.volumeFor('cards')).toBeCloseTo(0.5 * 0.9);
    expect(d.volumeFor('jingle')).toBeLessThan(d.volumeFor('cards'));
    d.play('place', false);
    expect(rec.played[0].volume).toBeCloseTo(d.volumeFor('cards'));
    d.configure({ ...ON, sfxVolume: 0 });
    d.play('place', false);
    expect(rec.played.length).toBe(1);
  });

  it('stereo placement follows the card and stays subtle', async () => {
    const { d, rec } = await director();
    d.play('place', false, { pan: -1 });
    d.play('place', false, { pan: 1 });
    d.play('place', false, { pan: 7 });
    expect(rec.played.map((p) => p.pan)).toEqual([-MAX_PAN, MAX_PAN, MAX_PAN]);
    expect(MAX_PAN).toBeLessThanOrEqual(0.5);
  });

  it('falls back to the synthesised voice before the recordings load and if they fail', async () => {
    const pending = await director({ loaded: false });
    pending.d.play('place', false);
    expect(pending.synth.played).toEqual([{ cue: 'place', bus: 'sfx' }]);
    expect(pending.d.log.at(-1)?.via).toBe('synth');

    const broken = await director({ fail: true });
    broken.d.play('scopa', false);
    expect(broken.synth.played).toEqual([{ cue: 'scopa', bus: 'sfx' }]);
    expect(broken.d.recordedFailed).toBe(true);

    const lost = await director();
    lost.fail('decode error');
    lost.d.play('gather', false);
    expect(lost.synth.played.at(-1)?.cue).toBe('gather');
  });

  it('the ambience switch starts and stops the recorded loop and keeps the synthesised room quiet', async () => {
    const { d, synth, rec } = await director();
    d.configure({ ...ON, ambOn: true, ambVolume: 0.5 });
    expect(rec.amb.at(-1)).toBeGreaterThan(0);
    expect(synth.volumes.amb).toBe(0);
    d.configure({ ...ON, ambOn: false });
    expect(rec.amb.at(-1)).toBe(0);
  });

  it('the synthesised room plays the ambience while recordings are unavailable', async () => {
    const { d, synth } = await director({ fail: true });
    d.configure({ ...ON, ambOn: true, ambVolume: 0.5 });
    expect(synth.volumes.amb).toBe(0.5);
  });
});
