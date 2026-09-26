/**
 * Builds the recorded-sound sprite and the ambience loop for Howler.
 *
 *   node tools/build-audio.ts            build public/audio/*
 *   node tools/build-audio.ts --analyse  print a pitch contour for each pizzicato jingle
 *
 * Sources (all CC0 / public domain, see docs/ASSETS.md) live in art/source/audio/.
 * Every clip is decoded to PCM, trimmed of leading and trailing silence, loudness-matched
 * per category, given short fades, and packed into one sprite with gaps between clips.
 * The sprite map (start and duration in ms) is written to src/presentation/soundSprite.json.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const FFMPEG: string = require('ffmpeg-static');
const RATE = 44100;
const SRC = 'art/source/audio';
const CASINO = `${SRC}/casino/Audio`;
const PIZZ = `${SRC}/jingles/Audio/Pizzicato jingles`;

type Pcm = { l: Float32Array; r: Float32Array };

function decode(file: string): Pcm {
  const buf = execFileSync(FFMPEG, ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(RATE), '-'], { maxBuffer: 1 << 28 });
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const n = f.length / 2;
  const l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { l[i] = f[2 * i]; r[i] = f[2 * i + 1]; }
  return { l, r };
}

function trim(p: Pcm, threshold = 0.004, padMs = 6): Pcm {
  const n = p.l.length;
  const loud = (i: number) => Math.max(Math.abs(p.l[i]), Math.abs(p.r[i])) > threshold;
  let a = 0; while (a < n && !loud(a)) a++;
  let b = n - 1; while (b > a && !loud(b)) b--;
  const pad = Math.round((padMs / 1000) * RATE);
  a = Math.max(0, a - pad); b = Math.min(n - 1, b + pad * 4);
  return { l: p.l.slice(a, b + 1), r: p.r.slice(a, b + 1) };
}

function cut(p: Pcm, fromS: number, toS: number): Pcm {
  const a = Math.round(fromS * RATE), b = Math.min(p.l.length, Math.round(toS * RATE));
  return { l: p.l.slice(a, b), r: p.r.slice(a, b) };
}

function rms(p: Pcm): number {
  let s = 0;
  for (let i = 0; i < p.l.length; i++) s += p.l[i] * p.l[i] + p.r[i] * p.r[i];
  return Math.sqrt(s / (2 * Math.max(1, p.l.length)));
}

function peak(p: Pcm): number {
  let m = 0;
  for (let i = 0; i < p.l.length; i++) m = Math.max(m, Math.abs(p.l[i]), Math.abs(p.r[i]));
  return m;
}

/** Scale to a target RMS (dBFS) without letting the peak exceed -1 dBFS. */
function level(p: Pcm, targetDb: number): Pcm {
  const g = Math.min(10 ** (targetDb / 20) / Math.max(1e-6, rms(p)), 0.891 / Math.max(1e-6, peak(p)));
  return { l: p.l.map((v) => v * g), r: p.r.map((v) => v * g) };
}

function fade(p: Pcm, inMs: number, outMs: number): Pcm {
  const l = p.l.slice(), r = p.r.slice(), n = l.length;
  const fi = Math.min(n, Math.round((inMs / 1000) * RATE)), fo = Math.min(n, Math.round((outMs / 1000) * RATE));
  for (let i = 0; i < fi; i++) { const g = i / fi; l[i] *= g; r[i] *= g; }
  for (let i = 0; i < fo; i++) { const g = i / fo; l[n - 1 - i] *= g; r[n - 1 - i] *= g; }
  return { l, r };
}

/** A seamless loop: the tail is crossfaded (equal power) into the head. */
function loop(p: Pcm, crossS: number): Pcm {
  const x = Math.round(crossS * RATE), n = p.l.length - x;
  const l = p.l.slice(x), r = p.r.slice(x);
  for (let i = 0; i < x; i++) {
    const t = i / x, gIn = Math.sin((t * Math.PI) / 2), gOut = Math.cos((t * Math.PI) / 2);
    l[n - x + i] = l[n - x + i] * gOut + p.l[i] * gIn;
    r[n - x + i] = r[n - x + i] * gOut + p.r[i] * gIn;
  }
  return { l, r };
}

function encode(p: Pcm, base: string, opts: { opusKbps: number; mp3Kbps: number }) {
  const n = p.l.length, inter = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { inter[2 * i] = p.l[i]; inter[2 * i + 1] = p.r[i]; }
  const raw = `${base}.f32`;
  writeFileSync(raw, Buffer.from(inter.buffer));
  const input = ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(RATE), '-ac', '2', '-i', raw];
  execFileSync(FFMPEG, [...input, '-c:a', 'libopus', '-b:a', `${opts.opusKbps}k`, `${base}.webm`]);
  execFileSync(FFMPEG, [...input, '-c:a', 'libmp3lame', '-b:a', `${opts.mp3Kbps}k`, `${base}.mp3`]);
  rmSync(raw);
}

/** Rough pitch per 60 ms frame by autocorrelation, to find the rising jingles by measurement. */
function contour(p: Pcm): number[] {
  const frame = Math.round(0.06 * RATE), out: number[] = [];
  for (let s = 0; s + frame * 2 < p.l.length; s += frame) {
    let best = 0, bestLag = 0;
    for (let lag = Math.round(RATE / 1200); lag < Math.round(RATE / 110); lag++) {
      let c = 0;
      for (let i = 0; i < frame; i++) c += p.l[s + i] * p.l[s + i + lag];
      if (c > best) { best = c; bestLag = lag; }
    }
    out.push(bestLag ? Math.round(RATE / bestLag) : 0);
  }
  return out;
}

if (process.argv.includes('--analyse')) {
  for (let i = 0; i <= 16; i++) {
    const id = String(i).padStart(2, '0');
    const p = trim(decode(`${PIZZ}/jingles_PIZZI${id}.ogg`));
    const c = contour(p).filter((f) => f > 0);
    const q = Math.max(1, Math.floor(c.length / 4));
    const head = c.slice(0, q), tail = c.slice(-q);
    const med = (a: number[]) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    console.log(`PIZZI${id} ${(p.l.length / RATE).toFixed(2)}s  start ~${med(head)} Hz  end ~${med(tail)} Hz  ${med(tail) > med(head) * 1.2 ? 'RISING' : ''}`);
  }
  process.exit(0);
}

// ---------------------------------------------------------------- the sprite

interface Clip { name: string; pcm: Pcm }
const clips: Clip[] = [];
const add = (name: string, pcm: Pcm) => clips.push({ name, pcm });
const card = (f: string, db: number) => fade(level(trim(decode(`${CASINO}/${f}.ogg`)), db), 2, 25);

// Card handling sits well below the music; place is the loudest because it is the moment of commitment.
[1, 2, 3, 4].forEach((i) => add(`place${i}`, card(`card-place-${i}`, -20)));
[1, 2, 3, 5].forEach((i, k) => add(`slide${k + 1}`, card(`card-slide-${i}`, -24)));
[1, 2, 3, 4].forEach((i) => add(`capture${i}`, card(`card-shove-${i}`, -21)));
add('select', card('card-fan-1', -27));
add('shuffle', fade(level(cut(trim(decode(`${CASINO}/card-shuffle.ogg`)), 0, 2.2), -24), 2, 220));
add('scopa', fade(level(trim(decode(`${PIZZ}/jingles_PIZZI${process.env.SCOPA_JINGLE ?? '10'}.ogg`)), -19), 2, 120));
add('win', fade(level(trim(decode(`${PIZZ}/jingles_PIZZI${process.env.WIN_JINGLE ?? '02'}.ogg`)), -18), 2, 200));

const GAP = Math.round(0.12 * RATE);
const total = clips.reduce((t, c) => t + c.pcm.l.length + GAP, 0);
const sprite: Pcm = { l: new Float32Array(total), r: new Float32Array(total) };
const map: Record<string, [number, number]> = {};
let at = 0;
for (const c of clips) {
  sprite.l.set(c.pcm.l, at); sprite.r.set(c.pcm.r, at);
  map[c.name] = [Math.round((at / RATE) * 1000), Math.round((c.pcm.l.length / RATE) * 1000)];
  at += c.pcm.l.length + GAP;
}

const OUT = 'public/audio';
mkdirSync(OUT, { recursive: true });
encode(sprite, join(OUT, 'sprite'), { opusKbps: 64, mp3Kbps: 96 });

// Café ambience: 48 s of the recording, looped seamlessly, kept quiet at the source.
const amb = loop(level(cut(decode(`${SRC}/Restaurant_ambience.ogg`), 8, 60), -30), 4);
encode(amb, join(OUT, 'ambience'), { opusKbps: 40, mp3Kbps: 64 });

writeFileSync('src/presentation/soundSprite.json', JSON.stringify({ sprite: map, ambienceMs: Math.round((amb.l.length / RATE) * 1000) }, null, 1) + '\n');
console.log(`sprite: ${clips.length} clips, ${(at / RATE).toFixed(1)} s; ambience ${(amb.l.length / RATE).toFixed(1)} s`);
