import type { Format, PresetId } from '../rules/config.ts';

export interface PresetText {
  name: string;
  tagline: string;
  description: string;
  players: string;
  /** Differences from Classic Scopa, one per line. */
  changes: string[];
  source: string;
}

export const PRESET_TEXT: Record<PresetId, PresetText> = {
  classic: {
    name: 'Classic Scopa',
    tagline: 'The game as played across Italy.',
    description: 'Capture table cards by matching a value or a sum. Clear the table for a scopa. Most cards, most Coins, the Settebello and the best Primiera score at the end of each hand.',
    players: 'Best for 2. Also 3, 4, or two partnerships of 2.',
    changes: ['This is the reference game; the other presets are described against it.'],
    source: 'Pagat: Scopa',
  },
  scopone: {
    name: 'Scopone',
    tagline: 'Four players, two partnerships, one big deal.',
    description: 'All the cards are dealt at once: nine each and four face up. Partners sit opposite and play for one shared pile.',
    players: '4 players in two partnerships.',
    changes: ['Nine cards each and four face up, dealt once. No second deal.', 'Always two partnerships, seated alternately.', 'Captures, scopa and scoring are unchanged.'],
    source: 'Pagat: Scopone',
  },
  scientifico: {
    name: 'Scopone Scientifico',
    tagline: 'Ten cards each and an empty table: pure calculation.',
    description: 'The whole deck is dealt into the four hands. The first player must lay a card on an empty table, and the dealer’s last card can score a scopa.',
    players: '4 players in two partnerships.',
    changes: ['Ten cards each, none face up, no second deal.', 'The dealer’s last card DOES score a scopa if it clears the table (Pagat). Some Italian club rules say it never does; switch this under Advanced rules.', 'Played to 21 by default.'],
    source: 'Pagat: Scopone; Ludopoli regolamento',
  },
  assi: {
    name: 'Scopa d’Assi',
    tagline: 'The Ace takes everything.',
    description: 'An Ace played when no Ace is on the table sweeps the whole table into your pile. By default the sweep is not a scopa (Scopa d’Assi); make it one to play Asso Pigliatutto.',
    players: 'Best for 2. Also 3, 4, or partnerships.',
    changes: ['An Ace takes the whole table if there is no Ace on it.', 'With an Ace already there, the played Ace just takes that Ace.', 'The Ace sweep does not score a scopa unless you choose Asso Pigliatutto.', 'Options: the Ace may take itself on an empty table, may be laid without sweeping, and face-up Aces may force a redeal.'],
    source: 'Pagat: Scopa (variations)',
  },
  quindici: {
    name: 'Scopa di Quindici',
    tagline: 'Make fifteen.',
    description: 'A card captures table cards only when it and they add up to 15. A Re (10) takes a 5; a 6 takes a Fante (8) and an Ace.',
    players: 'Best for 2. Also 3, 4, or partnerships.',
    changes: ['Your card plus the cards you take must total exactly 15.', 'You cannot take an equal card (unless you switch that option on).', 'When several sets make 15, you must use one with the fewest cards.', 'Scopa and scoring are unchanged.'],
    source: 'Pagat: Scopa; Italian rule pages',
  },
  napola: {
    name: 'Napola',
    tagline: 'Classic Scopa with the Neapolitan run of Coins.',
    description: 'Capture the Ace, 2 and 3 of Coins for a Napola worth 3, and one more point for each next Coin in an unbroken run. All ten Coins wins the match outright.',
    players: 'Best for 2. Also 3, 4, or partnerships.',
    changes: ['Napola: A-2-3 of Coins scores 3, plus 1 for each further consecutive Coin.', 'All ten Coins (Napoleone) wins the match at once.', 'Played to 21 by default.'],
    source: 'Pagat: Scopa and Scopone',
  },
  cirulla: {
    name: 'Cirulla',
    tagline: 'The Ligurian game of fifteens, declarations and the Matta.',
    description: 'Capture by equal value, by a sum, or by making fifteen; an Ace sweeps a table with no Ace. Declare a low or matching hand for points, and the 7 of Cups is wild when declaring. Piccola and Grande reward runs of Coins.',
    players: 'Best for 4 in partnerships. Also 2 or 3.',
    changes: [
      'Capture an equal card, a set that sums to your card, OR a set that makes 15 with your card.',
      'An Ace with no Ace on the table sweeps it and scores a scopa.',
      'If the four face-up cards total 15 or 30 the dealer takes them for 1 or 2 scope. Two Aces face up means a redeal.',
      'Declarations: three cards totalling 9 or less score 3, three of a kind scores 10. The 7 of Cups (la Matta) is wild for this.',
      'Piccola: A-2-3 of Coins and onward, 1 per card. Grande: Fante, Cavallo and Re of Coins, 5.',
      'All ten Coins wins the match. Played to 51.',
    ],
    source: 'Pagat: Cirulla; Wikipedia (it): Cirulla',
  },
};

export const FORMAT_TEXT: Record<Format, string> = {
  '2p': 'Two players',
  '3p': 'Three players',
  '4p': 'Four players, each alone',
  '4t': 'Four players in two partnerships',
};
