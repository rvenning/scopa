# AI simulation report

Produced by `npm run sim -- --games 400` (seed 20260926) on 2026-09-26:
**6,900 seeded all-AI matches, 0 illegal moves, 0 crashes, 0 unfinished matches.**
Every decision went through `viewFor` (public information only) and every move
through the engine's validating `apply`. Re-run it to regenerate these numbers;
the raw per-configuration reports go to `sim-report.json` with `--json`.

## Difficulty ladder (Classic, two players, both seat orders)

| Matchup (400 matches each order) | Stronger side's match wins | Points per hand |
|---|---:|---|
| Standard v Relaxed | 78.8% / 79.8% | 2.77 v 1.75 |
| Expert v Standard | 72.0% / 75.5% | 2.58–2.64 v 1.83–1.87 |
| Expert v Relaxed | 91.0% | 3.17 v 1.55 |

Expert clearly outperforms Standard, which clearly outperforms Relaxed, in both
seat orders. The same ordering holds in every preset (Expert v Relaxed, 100
matches each): Scopone 99%, Scientifico 100%, Scopa d'Assi 94%, Napola 91%,
Classic 89%, Cirulla 88%, Quindici 85%.

## Seat and dealer bias (equal Standard seats, 200 matches per configuration)

Match wins by seat stay within normal sampling noise of an even split for every
preset and format (for example Classic 2p 48.5/51.5, Classic 4t 52.5/47.5,
Cirulla 2p 47.5/52.5; three- and four-player individual games 21–37% per seat).

At the **hand** level, **Scopone and Scopone Scientifico favour the dealer's
team** (Scientifico: the dealer's side won 974 hands to 193). This is a
property of those rules rather than an engine fault: the dealer's side plays the
last card, takes the leftover table cards, and in Scientifico's default Pagat
rule its last card can score a scopa. The deal alternates every hand, so over a
match it largely evens out (first-dealer side won 61% of Scientifico matches,
52.5% of Scopone). Switching "Scopa on the last card" to "Never" (the Ludopoli
rule) reduces it. In the two-player presets the non-dealer, who leads, is
slightly ahead per hand (Classic 421 v 353), again a known feature of the game.

## Decision time

Mean decision time on the development desktop: Relaxed and Standard under
0.1 ms; Expert 9–18 ms depending on preset (Scientifico and Cirulla, with more
cards in play, are the slowest). Individual worst cases were 130–900 ms; the
largest occurred while the machine was also running the end-to-end suite. The
Expert's budget is counted in simulated plays, not wall-clock time, so decisions
are identical for a fixed seed on any device; in the app it runs in a Web
Worker, so a slow phone waits a little longer but the table never freezes. The
unit suite enforces a mean below 60 ms and a maximum below 600 ms for a
Scientifico game.

## Draws

Tied match totals at or above the target are never a result: the engine plays
another hand until the tie is broken, and every simulated match ended with a
single winner. Hands with equal points between sides occurred in roughly 12% of
two-sided hands.
