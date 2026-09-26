# Rules sources and adopted interpretations

Every preset is a data object in `src/rules/presets.ts`. This file records the
interpretation each one encodes, where it came from, and how disagreements
between sources were resolved. Sources were read on 2026-09-26.

Sources consulted:

- **[P-S]** Pagat, *Scopa* — <https://www.pagat.com/fishing/scopa.html>
- **[P-SC]** Pagat, *Scopone* — <https://www.pagat.com/fishing/scopone.html>
- **[P-C]** Pagat, *Cirulla* — <https://www.pagat.com/fishing/cirulla.html>
- **[W-C]** Wikipedia (it), *Cirulla* — <https://it.wikipedia.org/wiki/Cirulla>
- **[W-S]** Wikipedia (it), *Scopone scientifico* — <https://it.wikipedia.org/wiki/Scopone_scientifico>
- **[LUD]** Ludopoli, *Regolamento dello Scopone scientifico* — <https://www.ludopoli.it/scopone_scientifico_regolamento.aspx>
- **[DM]** Digitalmoka, *Scopa a 15* — <https://www.digitalmoka.com/scopa-a-15>
- **[TR]** Treccani, *scopa* — <https://www.treccani.it/enciclopedia/scopa_res-bdf87871-edc2-11df-9962-d5ce3506d72e/> (general background only)

Suit mapping for French-suited sources: diamonds = Denari (Coins), hearts =
Coppe (Cups), clubs = Bastoni (Clubs), spades = Spade (Swords). Queen = Cavallo.

---

## Classic Scopa (`classic`)

Source: [P-S].

- 40 cards; capture values A=1, 2–7 face, Fante 8, Cavallo 9, Re 10.
- Formats: 2 players (recommended), 3 players, 4 individuals, 4 in two
  alternating partnerships. [P-S] lists 3 players as "possible, though less
  satisfactory", and 4 or 6 in teams. Six players is not offered (the spec lists
  2/3/4 only); four individuals is offered because the deal divides evenly
  (36 cards ÷ 12 = 3 rounds) and it is a common house format.
- Deal 3 each, 4 face up; redeal 3 each when all hands are empty. Counter-
  clockwise; the player to the dealer's right leads; the deal rotates to the right.
- **Redeal:** if the four face-up cards include three or four Kings, the same
  dealer deals again ([P-S], [P-SC]). Rule field `deal.redealOnKings` (default on).
- **Capture:** an exact single match has priority over any sum ([P-S]: "the
  single card must be captured, not the set"). Capture is compulsory.
  Rule fields `capture.mode = "sum"`, `capture.exactMatchPriority = true`,
  `capture.mandatory = true`.
- **Scopa:** clearing the table scores 1; the last card of the hand never scores
  a scopa ([P-S] "never"). `scopa.finalPlay = "never"`.
- Remaining table cards go to the last capturer.
- Scoring: Cards, Coins, Settebello, Primiera (7=21, 6=18, A=16, 5=15, 4=14,
  3=13, 2=12, figures 10), each Scopa. Ties score nothing. A side missing a suit
  has no primiera ([P-SC]: "a prime of four suits always beats a prime of three
  suits").
- Target 11. Both over the target: higher wins; tied at or over: play on ([P-SC]).

## Scopone (`scopone`)

Source: [P-SC], corroborated by [W-S] (which calls this 9+4 deal "scientifico").

- 4 players, two alternating partnerships only.
- Deal: 9 cards each, 4 face up on the table, no further deal.
- Kings rule as Classic.
- Capture, scopa and scoring as Classic. Last card never scores a scopa.
- Target 11 ([P-SC]).

## Scopone Scientifico (`scientifico`)

Sources: [P-SC] ("10-card Scopone, sometimes known as Scientific Scopone"),
[LUD] (10 each, none on the table), [W-S].

- 4 players in partnerships; 10 cards each, **no table cards**, no redeal.
- **Disagreement on the final play.** [P-SC] says the dealer's team *does* score
  a scopa if the dealer's last card clears the table. [LUD] (an Italian club
  regulation) says a scopa is not possible with the last card, and the capture is
  an ordinary one. **Adopted:** the preset follows [P-SC], the reference the spec
  names, so `scopa.finalPlay = "counts"`. The advanced option "Final-play scopa"
  switches it to [LUD]'s "never", and the rules page names both.
- **Name disagreement.** [W-S] uses "scientifico" for the 9+4 deal; [P-SC] and
  [LUD] use it for 10+0. We follow the spec and [P-SC]/[LUD].
- Target 21 ([LUD]); [P-SC] gives 11 for Scopone generally. Adopted 21 as the
  preset default, 11 available.

## Scopa d'Assi / Asso Pigliatutto (`assi`)

Source: [P-S] (both variants and all their options come from there).

An Ace played when no Ace is on the table captures the whole table.

| Rule field | Options | Preset default | Source |
|---|---|---|---|
| `ace.sweep` | on | on | [P-S] |
| `ace.sweepScoresScopa` | yes (Asso Pigliatutto) / no (Scopa d'Assi) | **no** | [P-S] "does not count as a sweep" |
| `ace.withAceOnTable` | `"takesAce"` (the Ace takes only the Ace) | `"takesAce"` | [P-S] |
| `ace.toEmptyTable` | `"stays"` / `"takesItself"` | `"stays"` | [P-S] optional rule |
| `ace.mayDecline` | may play an Ace without sweeping | off | house option requested by spec; documented as non-traditional |
| `deal.redealOnAces` | redeal if an Ace appears among the face-up cards | off | [P-S] optional rule |

An Ace alone on the table is taken by a played Ace as an ordinary exact match,
which clears the table and so scores a scopa ([P-S]: "takes it and scores a
sweep"). An Ace sweep with the last card of the hand never scores. Target 11.

## Scopa di Quindici (`quindici`)

Sources: [P-S] (three versions), [DM] and other Italian sources.

- **Capture:** the played card plus the chosen table cards must total 15. An
  equal-value capture is **not** allowed ([P-S] version 1; [DM]: "non si prendono
  le carte di pari valore"). `capture.mode = "fifteen"`.
- **Exact-match priority:** not applicable in the default (there are no equal
  captures). With the option `capture.fifteenAllowsEqual` ([P-S] version 2), the
  player may choose an equal-value capture *or* a 15-capture freely; within the
  equal-value family, a single card still has priority over a sum.
- **Fewest cards:** [DM] requires the combination with the fewest cards; [P-S]
  lists it as optional for version 2. Adopted **on** by default
  (`capture.fifteenFewestCards`); where several combinations tie on size the
  player chooses.
- Capture is compulsory. Scopa and the last-card exception as Classic.
- Target 11 (21 or 31 available). [P-S] version 3 (Ace takes all, target 31) is
  reachable as Custom Rules by adding the ace-sweep options.

## Neapolitan / Napola (`napola`)

Sources: [P-S], [P-SC].

- Classic Scopa plus **Napola**: a side that captures A-2-3 of Coins scores 3,
  and the score is the highest Coin in an unbroken run from the Ace
  (A-2-3-4 = 4, … ). Both sources agree on "one point for each card in the
  sequence".
- **Length disagreement.** [P-S]: some cap at A–6 (6 points), others allow up to
  the Cavallo (9); all ten is a *Napoleone* that wins outright. [P-SC]: highest
  card in the run; all ten wins outright. **Adopted:** `scoring.napola = "full"`
  (the run may extend as far as it goes, up to 10) with `scoring.napoleone = true`
  (all ten Coins wins the match immediately). Option `"toSix"` caps at 6.
- Target 21 ([P-S]: "21, 31 or 41 rather than 11").

## Cirulla (`cirulla`)

Sources: [P-C] and [W-C]. It is a separate ruleset with its own fields, not a
set of Classic toggles.

- Formats: 2, 3, or 4 in partnerships ([P-C] "typically 4 in partnerships, 2–3
  player variants exist"; [W-C] "2–4").
- Deal 3 each, 4 face up, redeal 3 each, as Classic.
- **Misdeal:** two or more Aces among the face-up cards means a redeal by the same
  dealer ([P-C], [W-C]). [W-C] allows the dealer to keep the deal if the table
  totals 15 or 30. **Adopted:** the dealer's bonus takes precedence, so a
  15/30 table with two Aces is collected rather than redealt.
- **Dealer's table bonus:** if the four face-up cards total 15 the dealer
  collects them for 1 scopa; 30 for 2 scope ([P-C], [W-C]).
- **La Matta:** the 7 of Cups (7 of hearts in French packs) is wild *only* for
  declarations and for the dealer's 15/30 table bonus; anywhere else it is an
  ordinary 7 ([W-C]; [P-C] mentions it only for declarations). **Adopted:** [W-C].
- **Declarations (accusi):** on receiving three cards, a hand totalling 9 or
  less scores 3 (*bàrsega*); three of the same rank score 10 (*decino* /
  *barsegon*). Only one per hand. The cards are shown to everyone.
  [W-C] says "under 10" and [P-C] "≤ 9", which is the same thing.
  **Adopted:** declarations are made automatically for every seat (a human never
  loses points by forgetting), are announced, and the declared cards stay visible
  to all players until played. Declaration points count as scope.
- **Capture:** a played card may take an equal card, a set summing to its value,
  or a set which together with the played card makes 15. An Ace with no Ace on
  the table takes the whole table and scores a scopa; with an Ace on the table
  it may take that Ace or make 15; to an empty table it stays.
- **Choice disagreement.** [P-C]: "unlike Scopa … the player is free to choose".
  [W-C]: when an equal card exists you must take it rather than a sum of the
  same value. **Adopted:** `capture.exactMatchPriority = true` applies only
  between an equal card and a *sum to the same value* ([W-C]); 15-captures and
  the Ace sweep remain freely choosable alongside ([P-C]). The option
  "Free choice between equal and sum" switches to [P-C] exactly.
- Capture is compulsory when any capture exists (both sources describe capture
  as the normal result of a matching play; neither describes declining).
- Last card of the hand never scores a scopa ([P-C], [W-C]).
- **Scoring:** Cards, Coins, Settebello, Primiera, scope as Classic; plus
  **Piccola** (A-2-3 of Coins, 1 per card in the unbroken run, so 3 … 7) and
  **Grande** (Fante, Cavallo and Re of Coins: 5). [W-C] states minimums of 21
  cards and 6 coins, which in a two-sided game equals "strictly more"; we use
  "strictly most" so three-player games work, a tie scores nothing.
- **Cappotto:** capturing all ten Coins in one hand wins the match immediately.
- Target 51 ([P-C], [W-C]; 26 and 101 available).

---

## Advanced options (all presets where compatible)

| Option | Field | Source | Compatible with |
|---|---|---|---|
| Re Bello (King of Coins scores 1) | `scoring.reBello` | [P-S], [P-SC] | all |
| Napola | `scoring.napola` | [P-S], [P-SC] | all except Cirulla (which has Piccola) |
| Final-play scopa | `scopa.finalPlay` | [P-SC] vs [LUD] | all |
| Primiera figure values K10/C9/F8 | `scoring.primieraFigures` | [P-S], [P-SC] regional note | all |
| Ace sweep and its sub-options | `ace.*` | [P-S] | Classic, Napola, Assi, Quindici |
| Redeal on three Kings | `deal.redealOnKings` | [P-S] | presets with face-up cards |
| Redeal on any Ace face up | `deal.redealOnAces` | [P-S] | with ace sweep |
| Fifteen allows equal captures | `capture.fifteenAllowsEqual` | [P-S] v2 | Quindici |
| Fewest cards in a fifteen | `capture.fifteenFewestCards` | [DM] | Quindici |
| Cirulla free choice | `capture.exactMatchPriority=false` | [P-C] | Cirulla |
| Target | `target` | per preset | all |

Incompatible combinations are rejected by `validateRules()` with a
plain-language reason; the setup screen only offers valid ones.
