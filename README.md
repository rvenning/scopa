# Scopa

The traditional Italian card game for the browser: warm, offline-first and
installable on a phone. Play against three levels of computer opponent, pass one
device around the table, or watch the computer play itself.

**Play it:** <https://rvenning.github.io/scopa/>

- Seven rule presets: **Classic Scopa**, **Scopone**, **Scopone Scientifico**,
  **Scopa d'Assi / Asso Pigliatutto**, **Scopa di Quindici**, **Napola** and
  **Cirulla**, each with a "What changes?" summary and a full rules page.
- Compatible advanced rules (Re Bello, Napola, last-card scopa, Ace-sweep
  variations, redeals, Quindici and Cirulla options), marked **Custom Rules**
  and shareable as an exact rules code.
- 2, 3 or 4 players, or two partnerships; every seat can be a person at this
  device or an AI (Relaxed / Standard / Expert), with private pass-and-play.
- A rules helper that shows every legal capture and explains the scoring, but
  never suggests a move.
- A 3D tabletop (three.js): cards with thickness, lamp light and soft shadows,
  the deck and capture piles as real stacks, shallow deal and capture arcs, under
  a fixed, restrained camera. It paints beneath the ordinary DOM table, which is
  still what you tap and what screen readers read, and it gives way to the flat
  table without WebGL 2, with reduced motion, on low-powered devices or if
  frames run slow (Settings → Motion → Table).
- Spring-based card movement, staggered deals, capture sequences, score
  feedback and menu transitions with Motion; animations can be interrupted
  and never pace or change the game.
- Recorded card sounds, jingles and café ambience (CC0 / public domain) through
  Howler.js, with subtle stereo, separate effects, interface and ambience
  volumes, and a synthesised fallback.
- Traditional Neapolitan card faces (scanned, from Wikimedia Commons) or an
  original illustrated deck, five card backs, four photographic table surfaces
  (CC0), reduced motion, keyboard and screen-reader support.
- No accounts, servers, tracking, ads or purchases.

## Setup

Requires Node 22.6+ (24 recommended).

```bash
npm install
```

## Development

```bash
npm run dev          # http://localhost:8134  (developer tools on)
```

Append `?dev=1` to any build (including production) to show the developer
tools: seed entry and replay, a state inspector with hidden information marked,
a legal-move visualiser, a scenario loader, AI and animation speed, a batch
simulation runner and offline/cache diagnostics.

## Testing

```bash
npm test             # unit + integration + AI tests (Vitest)
npm run typecheck
npm run sim          # thousands of seeded AI games: win rates, bias, timing, illegal moves
npm run e2e          # trusted-touch walkthrough in headless Edge against the dev server
npm run e2e -- http://localhost:8135/ --only offline          # needs the production preview
npm run e2e -- http://localhost:8135/ --only updateKeepsMatch # needs the production preview
```

- `tests/rules` — capture values, exact-match precedence, combination
  enumeration checked against a brute-force reference on 3000 random tables per
  variant, scoring and ties, Primiera, Napola, Cirulla, presets and options.
- `tests/engine` — dealing and exhaustion for every preset and format, scopa and
  last-card rules, remaining-table assignment, dealer rotation, illegal and
  duplicate commands, deterministic replay, save migration.
- `tests/ai` — legality in every preset and format, the information boundary
  (shuffling hidden cards never changes a decision), seeded reproducibility,
  decision-time budget, difficulty ordering.
- `tests/presentation` — choosing the 3D or flat table (WebGL, reduced motion,
  low power, slow frames), event-derived pacing, the scene model matching engine
  state in every preset, capture and deal sequencing, interrupted and stormed
  card flights coming to rest on their targets, audio muting, volume categories,
  stereo placement and the synthesised fallback.
- `tests/integration` — rules book and explanations, the tutorial against the
  real engine, persistence and statistics.
- `tests/e2e` — first launch and tutorial, Classic against the AI, partnership
  pass-and-play privacy, multiple captures, no-capture and confirmation, match
  end and rematch, save/reload, orientation, reduced motion, keyboard-only play,
  an eleven-viewport device matrix (flat and 3D), the 3D table (alignment with
  the DOM, idle frames, captures in flight), the 2D fallbacks (no WebGL 2,
  software graphics, reduced motion), audio settings, interruptions mid-flight, full all-AI and human matches, offline reload
  and an update with a match in progress. Screenshots land in `tests/e2e/out/`.

## Production build and offline install

```bash
npm run build        # dist/, with a generated service worker (sw.js)
npm run preview      # http://localhost:8135
```

The service worker precaches every file of the build under a content-hashed
cache name. After the first load the whole game works in airplane mode. A new
version downloads in the background and is only activated when the player taps
"Update ready"; the match in progress is saved after every action and restored
afterwards. Settings shows the version and offers "Clear saved data".

To install on a phone, open the site and use **Add to Home Screen** (iOS Safari)
or **Install app** (Android Chrome).

Pushing to `master` runs the tests and deploys `dist/` to GitHub Pages
(`.github/workflows/pages.yml`).

## Architecture

```text
src/
  rules/        pure data-driven rules: cards, RulesConfig, presets, options, validation,
                the one legal-move generator (capture.ts), scoring, Cirulla specials, seeded RNG
  engine/       hand + match state machine, validated commands, events, replay, PublicView
  ai/           knowledge model, Relaxed/Standard/Expert policies, determinized Monte Carlo,
                simulation runner, Web Worker client
  ui/           screens, table controller, setup wizard, tutorial, score ceremony, menus
  presentation/ procedural card art, card elements; view choice and fallback (mode.ts);
                the scene model (engine state → card poses) and interruptible flights;
                the lazily loaded three.js table (table3d.ts); event-derived pacing;
                audio director (Howler recordings, synthesised fallback)
  persistence/  versioned saves (state + replay log), settings, statistics
  content/      preset descriptions, generated rules book, score explanations
  dev/          developer tools (loaded only with ?dev=1)
tests/          rules, engine, ai, integration, e2e
tools/          simulate.ts, export-art.ts, make-icons.ts, fetch-commons-deck.ts,
                build-napoletane.ts, build-textures.ts, headless-Edge helpers
docs/           RULES_SOURCES.md, ASSETS.md, AI_REPORT.md
```

Key rules of the architecture:

- **Rules are data.** Every difference between presets is a named field in
  `RulesConfig`, stored with a version number in each save.
- **One legal-move generator** (`legalOptions`) serves the UI, the AI, the
  tutorial and the tests.
- **The engine is pure.** `apply(state, command)` validates and returns a new
  state plus events; the renderer observes events but never owns game truth.
  Commands carry a sequence number, so double taps and stale AI replies are
  rejected. Every command is logged; `replay(setup, log)` reproduces a match.
- **Presentation only reacts.** Animations and sound are driven by engine
  events and never hold or hurry play: the pause before a computer move is
  computed from the events (`pacing.ts`), not from animations finishing. The
  3D table derives every card's pose from engine state (`sceneModel.ts`), and
  tests check that it always comes to rest exactly there, including after
  interruptions.
- **The AI sees only a `PublicView`**, which has no field for other hands or
  the deck. Expert samples hidden cards consistent with public play (including
  "they passed up a scopa, so they don't hold that value") and runs a fixed
  rollout budget, so its decisions are reproducible and phone-friendly. It runs
  in a Web Worker.

## Licensing

Code, original artwork and synthesised sounds: MIT (see `LICENSE`). Recorded card sounds and jingles: CC0 (Kenney); café ambience: public domain (pdsounds.org). three.js, Motion and Howler.js: MIT. Traditional card
scans: public domain as released on Wikimedia Commons, with a provenance caveat
(they are scans of a Dal Negro printing — personal, non-commercial use). Table
textures: CC0 (ambientCG). Fonts: SIL Open Font License 1.1 (`licenses/`). Full provenance: [`docs/ASSETS.md`](docs/ASSETS.md).

## Rule sources

Each preset's interpretation, with source links and how disagreements between
sources were resolved: [`docs/RULES_SOURCES.md`](docs/RULES_SOURCES.md). The
in-game rules book is generated from the active configuration.
