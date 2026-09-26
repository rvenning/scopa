# Assets and licensing

Everything that ships in Scopa is either **original to this project** or a
font under the **SIL Open Font License 1.1**. No image, sound or font is
hotlinked: all of it is bundled and cached for offline play.

## Original assets (no attribution required; MIT with the code)

| Asset | In-game purpose | Source (editable) | Notes |
|---|---|---|---|
| 40 card faces | The Neapolitan-style deck | `src/presentation/cardArt.ts` | Drawn procedurally as SVG from a handful of shapes and one palette. `npm run export-art` writes each card to `art/cards/*.svg` plus a contact sheet `art/sheet.html`. |
| 4 card backs (Rosso lattice, Blu medallion, Verde damask, Sole) | Card-back choice | `src/presentation/cardArt.ts` (`backSvg`) | Original patterns. |
| 4 table surfaces (walnut, felt, marble, linen) | Table choice | `src/ui/style.css` | CSS gradients and SVG `feTurbulence` noise; no bitmaps. |
| Paper texture on menus | Background | `src/ui/style.css` | Inline SVG noise. |
| App icons (`public/icons/*`) | Home screen / manifest | `tools/make-icons.ts` | Rendered from the Settebello card art. |
| All sound effects and café ambience | Card placement (4 variants), gather, shuffle, deal, scopa flourish, scoring ticks, match-win cue, turn cue, error cue, ambience | `src/presentation/audio.ts` | Synthesised at runtime with WebAudio (filtered noise and oscillators). There are no audio files. |

### How the card art was made

The deck is informed by the general conventions of the Neapolitan pattern —
pip arrangements, crossed swords and cudgels, a standing Fante, a mounted
Cavallo and a standing Re, each holding their suit — which are centuries old and
in the public domain as a pattern. **No image was traced, scanned or copied**:
no Wikimedia Commons file, no commercial deck (Modiano, Dal Negro or other), and
no `mhamilt/Italian-decks` imagery (GPL-3.0) was used or bundled. Each figure has
its own body plan (page, horseman, king) rather than recolours of one drawing.
Value badges are not part of the artwork; the UI overlays them.

## Third-party assets

| File(s) | Purpose | Title / creator | Source | Licence | Attribution | Modifications | Retrieved |
|---|---|---|---|---|---|---|---|
| `assets/cormorant-garamond-*.woff2` | Display type (headings, wordmark) | Cormorant Garamond, © 2015 The Cormorant Project Authors (Christian Thalmann) | npm `@fontsource-variable/cormorant-garamond@5.3.0` (from <https://github.com/CatharsisFonts/Cormorant>) | SIL OFL 1.1 — <https://openfontlicense.org> | Not required in-app; noted in Settings → Credits. Licence text in `licenses/OFL-cormorant-garamond.txt` | None (subset files as published by Fontsource) | 2026-09-26 |
| `assets/eb-garamond-*.woff2` | Body type | EB Garamond, © 2017 The EB Garamond Project Authors (Georg Duffner, Octavio Pardo) | npm `@fontsource-variable/eb-garamond@5.3.0` (from <https://github.com/octaviopardo/EBGaramond12>) | SIL OFL 1.1 — <https://openfontlicense.org> | Not required in-app; noted in Settings → Credits. Licence text in `licenses/OFL-eb-garamond.txt` | None | 2026-09-26 |

Only the Latin and Latin-extended subsets are precached for offline use; other
subsets load on demand by `unicode-range` and are not needed for the English UI.

## Rules text

The rules book is original prose written from the sources in
[`RULES_SOURCES.md`](RULES_SOURCES.md). No text was copied from those sources.
