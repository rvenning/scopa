/**
 * All sound is synthesised here with WebAudio: no recordings, nothing streamed.
 * The context is created only after a user gesture, sounds never block play,
 * and every meaningful cue has a caption for players who cannot hear it.
 */
export type Cue = 'place' | 'gather' | 'shuffle' | 'deal' | 'scopa' | 'tick' | 'win' | 'turn' | 'error' | 'select';

const CAPTIONS: Partial<Record<Cue, string>> = {
  shuffle: 'Cards shuffled',
  gather: 'Cards gathered',
  scopa: 'Scopa!',
  win: 'Match won',
  turn: 'Your turn',
  error: 'Not allowed',
};

class Audio {
  ctx: AudioContext | null = null;
  private sfx: GainNode | null = null;
  private amb: GainNode | null = null;
  private ambNodes: AudioNode[] = [];
  private ambTimer: number | null = null;
  sfxOn = true;
  sfxVolume = 0.7;
  ambOn = false;
  ambVolume = 0.35;
  onCaption: ((text: string) => void) | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private variant = 0;

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      // Respect the iOS silent switch where supported.
      const nav = navigator as Navigator & { audioSession?: { type: string } };
      if (nav.audioSession) nav.audioSession.type = 'ambient';
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.sfx = this.ctx.createGain();
      this.sfx.connect(this.ctx.destination);
      this.amb = this.ctx.createGain();
      this.amb.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let seed = 12345;
      for (let i = 0; i < len; i++) { seed = (seed * 1103515245 + 12345) >>> 0; d[i] = (seed / 2 ** 31) - 1; }
      this.apply();
    } catch { this.ctx = null; }
  }

  configure(o: { sfxOn: boolean; sfxVolume: number; ambOn: boolean; ambVolume: number }) {
    this.sfxOn = o.sfxOn; this.sfxVolume = o.sfxVolume; this.ambOn = o.ambOn; this.ambVolume = o.ambVolume;
    this.apply();
  }

  private apply() {
    if (!this.ctx || !this.sfx || !this.amb) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(this.sfxOn ? this.sfxVolume : 0, t, 0.02);
    this.amb.gain.setTargetAtTime(this.ambOn ? this.ambVolume * 0.5 : 0, t, 0.4);
    if (this.ambOn && !this.ambNodes.length) this.startAmbience();
    if (!this.ambOn && this.ambNodes.length) this.stopAmbience();
  }

  suspendIfIdle() {
    if (this.ctx && !this.ambOn && this.ctx.state === 'running') void this.ctx.suspend();
  }

  play(cue: Cue, captionsOn: boolean) {
    if (captionsOn && CAPTIONS[cue]) this.onCaption?.(CAPTIONS[cue] as string);
    if (!this.ctx || !this.sfx || !this.sfxOn) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    try { this[cue](); } catch { /* audio must never break play */ }
  }

  // ---------------------------------------------------------------- primitives

  private noise(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx as AudioContext;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(this.sfx as GainNode);
    src.start(at, Math.random() * 0.5, dur + 0.05);
    src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  }

  private tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'triangle') {
    const c = this.ctx as AudioContext;
    const o = c.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.sfx as GainNode);
    o.start(at); o.stop(at + dur + 0.05);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  private get now() { return (this.ctx as AudioContext).currentTime + 0.01; }

  // ---------------------------------------------------------------- cues

  /** Several varied card-on-table sounds: a paper slap with a soft body. */
  private place() {
    const t = this.now;
    const v = this.variant++ % 4;
    const freqs = [2400, 2900, 2100, 3300];
    this.noise(t, 0.07 + v * 0.01, freqs[v], 0.9, 0.5);
    this.noise(t, 0.05, 380 + v * 40, 1.2, 0.35, 'lowpass');
  }
  private select() {
    this.noise(this.now, 0.035, 4200, 1.5, 0.18);
  }
  private deal() {
    const t = this.now;
    this.noise(t, 0.05, 3600, 1.1, 0.22);
  }
  private gather() {
    const t = this.now;
    for (let i = 0; i < 4; i++) this.noise(t + i * 0.045, 0.09, 1800 + i * 250, 0.8, 0.28);
    this.noise(t + 0.2, 0.08, 300, 1, 0.3, 'lowpass');
  }
  private shuffle() {
    const t = this.now;
    for (let i = 0; i < 26; i++) this.noise(t + i * 0.022 + Math.random() * 0.006, 0.03, 3000 + Math.random() * 1600, 1.4, 0.16);
    for (let i = 0; i < 20; i++) this.noise(t + 0.7 + i * 0.02, 0.03, 2600 + Math.random() * 1600, 1.4, 0.14);
  }
  /** A soft plucked arpeggio, like a mandolin in the next room. */
  private scopa() {
    const t = this.now;
    const notes = [392, 493.9, 587.3, 784];
    notes.forEach((f, i) => { this.tone(t + i * 0.07, f, 0.9, 0.12); this.tone(t + i * 0.07, f * 2, 0.35, 0.03, 'sine'); });
  }
  private tick() {
    const t = this.now;
    this.tone(t, 1320, 0.06, 0.07, 'sine');
    this.noise(t, 0.03, 5000, 2, 0.06);
  }
  private turn() {
    const t = this.now;
    this.tone(t, 659.3, 0.25, 0.05, 'sine');
    this.tone(t + 0.09, 880, 0.3, 0.05, 'sine');
  }
  private error() {
    const t = this.now;
    this.tone(t, 220, 0.18, 0.06, 'triangle');
  }
  private win() {
    const t = this.now;
    const seq = [[261.6, 329.6, 392], [349.2, 440, 523.3], [392, 493.9, 587.3], [523.3, 659.3, 784]];
    seq.forEach((ch, i) => ch.forEach((f, j) => this.tone(t + i * 0.28 + j * 0.05, f, 1.1, 0.07)));
  }

  // ---------------------------------------------------------------- ambience

  private startAmbience() {
    const c = this.ctx as AudioContext;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 900;
    const g = c.createGain(); g.gain.value = 0.25;
    src.connect(lp).connect(lp2).connect(g).connect(this.amb as GainNode);
    src.start();
    this.ambNodes = [src, lp, lp2, g];
    const clink = () => {
      if (!this.ctx || !this.ambOn) return;
      const t = this.ctx.currentTime + 0.05;
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 2200 + Math.random() * 1400;
      const gg = c.createGain(); gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.02, t + 0.004); gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(gg).connect(this.amb as GainNode); o.start(t); o.stop(t + 0.4);
      o.onended = () => { o.disconnect(); gg.disconnect(); };
      this.ambTimer = window.setTimeout(clink, 2500 + Math.random() * 7000);
    };
    this.ambTimer = window.setTimeout(clink, 3000);
  }

  private stopAmbience() {
    for (const n of this.ambNodes) { try { (n as AudioBufferSourceNode).stop?.(); } catch { /* */ } n.disconnect(); }
    this.ambNodes = [];
    if (this.ambTimer) clearTimeout(this.ambTimer);
    this.ambTimer = null;
  }
}

export const audio = new Audio();
