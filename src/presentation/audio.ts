/**
 * Sound for the table: one place that decides what is heard, how loudly and where.
 *
 * - Card sounds and the scopa / match jingles are recordings played through Howler
 *   (recorded.ts, loaded after the first gesture). Until they have loaded, or if they
 *   cannot load, the synthesised voice (synth.ts) plays the same cue instead.
 * - Interface cues (your turn, not allowed, score ticks) are always synthesised.
 * - Volume categories: cards and jingles follow "Effects volume", interface cues
 *   "Interface volume", the café loop "Ambience volume". Turning sound effects off
 *   silences every cue; the ambience has its own switch.
 * - Each card sound can be placed left or right to follow the card (subtle stereo).
 * - Sounds react to engine events only and never hold up play; every meaningful cue
 *   still has a caption for players who cannot hear it, whether or not sound is on.
 */
import type { RecordedEngine, Sample } from './recorded.ts';
import { SynthVoice, type Cue } from './synth.ts';

export type { Cue };
export type Category = 'cards' | 'jingle' | 'ui';

export const CATEGORY: Record<Cue, Category> = {
  place: 'cards', gather: 'cards', shuffle: 'cards', deal: 'cards', select: 'cards',
  scopa: 'jingle', win: 'jingle',
  tick: 'ui', turn: 'ui', error: 'ui',
};

/** Level of each category relative to its slider, so a full slider is still a quiet table. */
const BASE_LEVEL: Record<Category, number> = { cards: 0.9, jingle: 0.55, ui: 0.8 };
/** How far left or right a card sound may sit. Subtle on purpose. */
export const MAX_PAN = 0.45;

const CAPTIONS: Partial<Record<Cue, string>> = {
  shuffle: 'Cards shuffled',
  gather: 'Cards gathered',
  scopa: 'Scopa!',
  win: 'Match won',
  turn: 'Your turn',
  error: 'Not allowed',
};

export interface AudioSettings { sfxOn: boolean; sfxVolume: number; uiVolume: number; ambOn: boolean; ambVolume: number }
export interface PlayOpts { pan?: number; count?: number }
export interface LogEntry { cue: Cue; via: 'recorded' | 'synth' | 'muted'; volume: number; pan: number }

type Loader = () => Promise<{ createRecorded(onReady: () => void, onError: (why: string) => void): RecordedEngine }>;

export class AudioDirector {
  private synth: SynthVoice;
  private rec: RecordedEngine | null = null;
  private loading = false;
  private variant = 0;
  private s: AudioSettings = { sfxOn: true, sfxVolume: 0.7, uiVolume: 0.6, ambOn: false, ambVolume: 0.35 };
  onCaption: ((text: string) => void) | null = null;
  /** The last few cues and how they were played; read by tests. */
  readonly log: LogEntry[] = [];
  recordedFailed = false;

  private loader: Loader;

  constructor(loader: Loader = () => import('./recorded.ts'), synth?: SynthVoice) {
    this.loader = loader;
    this.synth = synth ?? new SynthVoice();
  }

  /** Call from a user gesture. Starts WebAudio and fetches the recordings in the background. */
  unlock() {
    this.synth.unlock();
    if (!this.rec && !this.loading && !this.recordedFailed) {
      this.loading = true;
      this.loader().then((m) => {
        this.rec = m.createRecorded(() => this.apply(), () => { this.recordedFailed = true; this.rec = null; this.apply(); });
      }).catch(() => { this.recordedFailed = true; }).finally(() => { this.loading = false; });
    }
    this.apply();
  }

  configure(s: AudioSettings) {
    this.s = { ...s };
    this.apply();
  }

  get settings(): Readonly<AudioSettings> { return this.s; }

  /** Linear volume for a category, 0 when muted. */
  volumeFor(cat: Category): number {
    if (!this.s.sfxOn) return 0;
    return (cat === 'ui' ? this.s.uiVolume : this.s.sfxVolume) * BASE_LEVEL[cat];
  }

  private recordedReady() { return !!this.rec && this.rec.loaded; }

  private apply() {
    const amb = this.s.ambOn ? this.s.ambVolume : 0;
    // The recorded loop takes over the ambience once it can; the synthesised room stops.
    const recAmb = this.recordedReady();
    this.synth.setVolumes({ sfx: this.volumeFor('cards'), ui: this.volumeFor('ui'), amb: recAmb ? 0 : amb });
    if (recAmb) this.rec!.ambience(amb * 0.6);
  }

  suspendIfIdle() {
    this.synth.suspendIfIdle();
    this.rec?.suspend();
  }

  play(cue: Cue, captionsOn: boolean, o: PlayOpts = {}) {
    if (captionsOn && CAPTIONS[cue]) this.onCaption?.(CAPTIONS[cue] as string);
    const cat = CATEGORY[cue];
    const volume = this.volumeFor(cat);
    const pan = Math.max(-MAX_PAN, Math.min(MAX_PAN, (o.pan ?? 0) * MAX_PAN));
    if (volume <= 0) { this.note({ cue, via: 'muted', volume: 0, pan }); return; }
    const sample = cat === 'ui' ? null : this.sampleFor(cue);
    if (sample && this.recordedReady()) {
      try {
        if (cue === 'deal') {
          // One slide per card dealt, quickly, like cards leaving the dealer's hand.
          const n = Math.max(1, Math.min(6, o.count ?? 3));
          for (let i = 0; i < n; i++) setTimeout(() => this.rec?.play(`slide${1 + ((this.variant + i) % 4)}` as Sample, volume * 0.8, pan, 0.96 + (i % 3) * 0.04), i * 70);
          this.variant += n;
        } else this.rec!.play(sample, volume, pan, cue === 'place' ? 0.97 + (this.variant % 3) * 0.03 : 1);
        this.note({ cue, via: 'recorded', volume, pan });
        return;
      } catch { /* fall through to the synthesised voice */ }
    }
    this.synth.play(cue, cat === 'ui' ? 'ui' : 'sfx');
    this.note({ cue, via: 'synth', volume, pan });
  }

  private sampleFor(cue: Cue): Sample | null {
    const v = this.variant++;
    switch (cue) {
      case 'place': return `place${1 + (v % 4)}` as Sample;
      case 'gather': return `capture${1 + (v % 4)}` as Sample;
      case 'deal': return 'slide1';
      case 'shuffle': return 'shuffle';
      case 'select': return 'select';
      case 'scopa': return 'scopa';
      case 'win': return 'win';
      default: return null;
    }
  }

  private note(e: LogEntry) {
    this.log.push(e);
    if (this.log.length > 60) this.log.shift();
  }
}

export const audio = new AudioDirector();
