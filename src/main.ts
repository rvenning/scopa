import '@fontsource-variable/cormorant-garamond';
import '@fontsource-variable/eb-garamond';
import './ui/style.css';
import { loadSettings, saveSettings, prefersReducedMotion } from './persistence/settings.ts';
import { audio } from './presentation/audio.ts';
import { preloadDeck, setCardStyle } from './presentation/cards.ts';
import type { AppCtx, GoArg, Screen, ScreenName } from './ui/app.ts';
import { caption, h, toast } from './ui/dom.ts';
import { GameScreen } from './ui/game.ts';
import { runningCount } from './ui/anim.ts';
import { rulesScreen, settingsScreen, statsScreen, titleScreen } from './ui/screens.ts';
import { setupScreen } from './ui/setup.ts';
import { tutorialScreen } from './ui/tutorial.ts';
import { loadMatch } from './persistence/saves.ts';
import { applyUpdate, onUpdateReady, registerSW } from './pwa.ts';

declare global { const __BUILD__: { version: string; sha: string; built: string } }

const root = document.getElementById('app') as HTMLElement;
const settings = loadSettings();
let current: Screen | null = null;
let game: GameScreen | null = null;
const dev = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');

const ctx: AppCtx = {
  settings,
  build: __BUILD__,
  dev,
  saveSettings: () => saveSettings(settings),
  applySettings,
  go,
  overlay: (el) => root.append(el),
};

function applySettings() {
  setCardStyle(settings.cardStyle);
  document.documentElement.classList.toggle('reduced', prefersReducedMotion(settings));
  document.documentElement.style.setProperty('--anim', prefersReducedMotion(settings) ? '0.01' : String(1 / settings.animationSpeed));
  audio.configure({ sfxOn: settings.sfxOn, sfxVolume: settings.sfxVolume, uiVolume: settings.uiVolume, ambOn: settings.ambienceOn, ambVolume: settings.ambienceVolume });
  game?.applyView();
  document.querySelectorAll<HTMLElement>('.table-screen').forEach((t) => (t.dataset.table = settings.table));
}

function go(name: ScreenName, arg: GoArg = {}) {
  current?.destroy?.();
  game = null;
  let next: Screen;
  switch (name) {
    case 'title': next = titleScreen(ctx); break;
    case 'setup': next = setupScreen(ctx, arg.rules); break;
    case 'rules': next = rulesScreen(ctx, arg.rules, arg.back); break;
    case 'settings': next = settingsScreen(ctx, arg.back); break;
    case 'stats': next = statsScreen(ctx); break;
    case 'tutorial': { const t = tutorialScreen(ctx); game = t.game; next = t; break; }
    case 'game': {
      const m = arg.match ?? loadMatch();
      if (!m) { go('title'); return; }
      game = new GameScreen(ctx, m, { resume: arg.resume });
      next = { el: game.el, destroy: () => game?.destroy(), onKey: (e) => game?.onKey(e) };
      break;
    }
  }
  current = next;
  root.replaceChildren(next.el);
  window.scrollTo(0, 0);
}

document.addEventListener('keydown', (e) => current?.onKey?.(e));
// Audio may only start after a user gesture.
const unlock = () => { audio.unlock(); applySettings(); };
window.addEventListener('pointerdown', unlock, { once: true, capture: true });
window.addEventListener('keydown', unlock, { once: true, capture: true });
audio.onCaption = (t) => caption(t);
// Pinch-zoom and double-tap zoom are prevented only on the play surface (see CSS touch-action).
document.addEventListener('gesturestart', (e) => { if ((e.target as HTMLElement).closest?.('.table-screen')) e.preventDefault(); });

applySettings();
preloadDeck(settings.cardBack);
registerSW();
onUpdateReady(() => {
  const b = h('button', { class: 'btn small', style: { position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 'calc(env(safe-area-inset-bottom) + 10px)', zIndex: '98' }, onclick: () => applyUpdate() }, 'Update ready — tap to restart (your match is saved)');
  document.body.append(b);
  toast('A new version is ready.');
});

if (dev) void import('./dev/devtools.ts').then((m) => m.mountDevTools(ctx, () => game));

// Expose a tiny hook for automated end-to-end checks (read-only state access).
(window as unknown as { __scopa: unknown }).__scopa = {
  get state() { return game?.state ?? null; },
  ctx,
  get scene() { return game?.sceneInfo ?? null; },
  sceneScreenOf: (c: number) => game?.sceneScreenOf(c) ?? null,
  settle: () => game?.settle3d(),
  get domAnimations() { return runningCount(); },
  audio: { get log() { return audio.log; }, get recorded() { return !audio.recordedFailed; }, volumeFor: (c: 'cards' | 'jingle' | 'ui') => audio.volumeFor(c) },
};

if (!settings.tutorialSeen && !loadMatch()) go('tutorial');
else go('title');
