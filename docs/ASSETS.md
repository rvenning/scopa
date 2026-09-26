# Assets and licensing

Scopa ships three kinds of asset: **original** work made for this project,
**CC0** table textures, and a **scanned Neapolitan deck** from Wikimedia Commons
(read its caveat below), plus fonts under the **SIL Open Font License 1.1**.
Nothing is hotlinked: everything is bundled and cached for offline play.

## Scanned Neapolitan deck — "Traditional" card faces (the default)

| Files | Purpose | Title / creator | Source | Licence as stated on Commons | Attribution | Modifications | Retrieved |
|---|---|---|---|---|---|---|---|
| `public/cards/napoletane/00.webp` … `39.webp` (source: `art/source/commons/00.jpg` … `39.jpg`) | The 40 card faces | "01 Asso di denari.jpg" … "40 Dieci di Bastoni.jpg", uploaded by Trocche100 (it.wikipedia) | <https://commons.wikimedia.org/wiki/Category:Naples_deck> — per-file URLs, sizes and SHA-1s in `art/source/commons/manifest.json` | Public domain, `{{PD-user-it|Trocche100}}` — <https://commons.wikimedia.org/wiki/Template:PD-user-it> | Not required by the stated licence; credited in Settings → Credits | Resized to 480×768, multiplied onto a warm paper ground, framed with a rounded edge and inner rule, WebP (`tools/build-napoletane.ts`) | 2026-09-26 |
| `public/cards/napoletane/back.webp` (source `art/source/commons/back.jpg`) | "Napoletano cubes" card back | "Carte Napoletane retro.jpg", Trocche100 | <https://commons.wikimedia.org/wiki/File:Carte_Napoletane_retro.jpg> | Public domain, `PD-user-it` | as above | Tinted deep red, framed as above | 2026-09-26 |

**Caveat, recorded deliberately.** These are clean scans of a modern printed
Napoletane deck: the Ace of Coins carries the imprint "Dal Negro, Treviso — Made
in Italy". The Neapolitan pattern itself is centuries old, but the public-domain
status of these particular images rests only on the uploader's own release, and
the spec asked us not to copy current commercial artwork. Robert reviewed this on
2026-09-26 and chose to use them for **personal, non-commercial** use. For any
other use, switch the default to the original deck (`cardStyle: 'original'` in
`src/persistence/settings.ts`) and delete `public/cards/napoletane/` — nothing
else depends on them. A genuinely public-domain alternative exists: the late-19th
century hand-coloured Neapolitan pack in the British Museum
(BM 1875,1211.172-211, on Commons as "Print, playing-card (BM 1875,1211.172-211).jpg"
and three sibling files, tagged PD-old-100-expired), which would need its 40
cards cut from four photographs.

## CC0 table textures

| File | Purpose | Source asset | Licence | Modifications | Retrieved |
|---|---|---|---|---|---|
| `src/ui/textures/walnut.webp` (source `art/source/textures/Wood066_1K-JPG_Color.jpg`) | Warm walnut table | ambientCG "Wood066" by Lennart Demes — <https://ambientcg.com/view?id=Wood066> | CC0 1.0 — <https://ambientcg.com/license> | 512 px tile, darkened 22% | 2026-09-26 |
| `src/ui/textures/felt.webp` (`Fabric034`) | Deep green felt | ambientCG "Fabric034" — <https://ambientcg.com/view?id=Fabric034> | CC0 1.0 | Desaturated, dyed green | 2026-09-26 |
| `src/ui/textures/marble.webp` (`Marble014`) | Café marble | ambientCG "Marble014" — <https://ambientcg.com/view?id=Marble014> | CC0 1.0 | Darkened 14% | 2026-09-26 |
| `src/ui/textures/linen.webp` (`Fabric036`) | Rustic linen | ambientCG "Fabric036" — <https://ambientcg.com/view?id=Fabric036> | CC0 1.0 | Desaturated, dyed flax | 2026-09-26 |

Attribution is not required for CC0; the textures are credited in Settings anyway.
`tools/build-textures.ts` regenerates the tiles.

## Original assets (no attribution required; MIT with the code)

| Asset | In-game purpose | Source (editable) | Notes |
|---|---|---|---|
| 40 card faces ("Original illustrated" style) | The alternative, fully original deck | `src/presentation/cardArt.ts` | Drawn procedurally as SVG from a handful of shapes and one palette. `npm run export-art` writes each card to `art/cards/*.svg` plus a contact sheet `art/sheet.html`. |
| 4 card backs (Rosso lattice, Blu medallion, Verde damask, Sole) | Card-back choice | `src/presentation/cardArt.ts` (`backSvg`) | Original patterns. |
| Table lighting (lamp pool and vignette) | Over the table textures | `src/ui/style.css` | CSS gradients. |
| Paper texture on menus | Background | `src/ui/style.css` | Inline SVG noise. |
| App icons (`public/icons/*`) | Home screen / manifest | `tools/make-icons.ts` | Rendered from the Settebello card art. |
| All sound effects and café ambience | Card placement (4 variants), gather, shuffle, deal, scopa flourish, scoring ticks, match-win cue, turn cue, error cue, ambience | `src/presentation/audio.ts` | Synthesised at runtime with WebAudio (filtered noise and oscillators). There are no audio files. |

### How the card art was made

The deck is informed by the general conventions of the Neapolitan pattern —
pip arrangements, crossed swords and cudgels, a standing Fante, a mounted
Cavallo and a standing Re, each holding their suit — which are centuries old and
in the public domain as a pattern. **No image was traced, scanned or copied**:
no Wikimedia Commons file, no commercial deck (Modiano, Dal Negro or other), and
no `mhamilt/Italian-decks` imagery (GPL-3.0) was used or bundled. (The separately
bundled "Traditional" scans are described above.) Each figure has
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
