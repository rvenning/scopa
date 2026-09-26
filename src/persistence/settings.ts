import type { BackId } from '../presentation/cardArt.ts';
import { readJson, writeJson } from './storage.ts';

export type TableTheme = 'walnut' | 'felt' | 'marble' | 'linen';

export interface Settings {
  version: 1;
  valueBadges: boolean;
  highContrastBadges: boolean;
  legalHighlights: boolean;
  confirmMoves: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  animationSpeed: number; // 1 = normal; dev override
  sfxOn: boolean;
  sfxVolume: number; // 0..1, card sounds and the scopa and match jingles
  uiVolume: number; // 0..1, interface cues: your turn, not allowed, score ticks
  ambienceOn: boolean;
  ambienceVolume: number;
  captions: boolean;
  cardBack: BackId;
  cardStyle: 'traditional' | 'original';
  table: TableTheme;
  /** 'auto' uses the 3D table where the device can carry it; '2d' always the flat table. */
  tableView: 'auto' | '3d' | '2d';
  tutorialSeen: boolean;
  aiSpeed: number; // multiplier on AI thinking pauses, 0.25..2
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  valueBadges: true,
  highContrastBadges: false,
  legalHighlights: true,
  confirmMoves: false,
  reducedMotion: 'system',
  animationSpeed: 1,
  sfxOn: true,
  sfxVolume: 0.7,
  uiVolume: 0.6,
  ambienceOn: false,
  ambienceVolume: 0.35,
  captions: false,
  cardBack: 'cubi',
  cardStyle: 'traditional',
  table: 'walnut',
  tableView: 'auto',
  tutorialSeen: false,
  aiSpeed: 1,
};

export function loadSettings(): Settings {
  const s = readJson<Partial<Settings>>('settings');
  return { ...DEFAULT_SETTINGS, ...(s ?? {}), version: 1 };
}

export function saveSettings(s: Settings) {
  writeJson('settings', s);
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.reducedMotion === 'on') return true;
  if (s.reducedMotion === 'off') return false;
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
