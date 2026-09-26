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
  sfxVolume: number; // 0..1
  ambienceOn: boolean;
  ambienceVolume: number;
  captions: boolean;
  cardBack: BackId;
  cardStyle: 'traditional' | 'original';
  table: TableTheme;
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
  ambienceOn: false,
  ambienceVolume: 0.35,
  captions: false,
  cardBack: 'cubi',
  cardStyle: 'traditional',
  table: 'walnut',
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
