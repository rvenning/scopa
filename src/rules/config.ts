/**
 * Rules are data. Every behaviour that differs between presets is a named field
 * here, never a conditional on the preset id. `version` lets old saves stay
 * interpretable: a save carries its own RulesConfig, and `migrateRules` lifts it.
 */
export const RULES_VERSION = 1;

export type PresetId = 'classic' | 'scopone' | 'scientifico' | 'assi' | 'quindici' | 'napola' | 'cirulla';
/** 2 / 3 / 4 individual players, or 4 in two alternating partnerships. */
export type Format = '2p' | '3p' | '4p' | '4t';

export interface RulesConfig {
  version: number;
  preset: PresetId;
  format: Format;
  deal: {
    /** Cards dealt to each player per round. */
    handSize: number;
    /** Face-up cards at the start of the hand. */
    tableSize: number;
    /** Deal another round when all hands are empty and cards remain. */
    refill: boolean;
    /** Three or four Kings face up: redeal. */
    redealOnKings: boolean;
    /** Any Ace face up: redeal (ace-sweep games). */
    redealOnAces: boolean;
    /** Two or more Aces face up: redeal (Cirulla). */
    redealOnTwoAces: boolean;
  };
  capture: {
    /** sum: equal or sum to the card. fifteen: card + cards = 15. cirulla: both, plus 15. */
    mode: 'sum' | 'fifteen' | 'cirulla';
    /** An equal single card must be taken instead of a sum to the same value. */
    exactMatchPriority: boolean;
    /** Fifteen mode only: equal-value captures are also allowed. */
    fifteenAllowsEqual: boolean;
    /** Fifteen mode only: must use the fewest cards that make fifteen. */
    fifteenFewestCards: boolean;
  };
  ace: {
    /** An Ace played with no Ace on the table takes the whole table. */
    sweep: boolean;
    sweepScoresScopa: boolean;
    /** With an Ace already on the table: behave normally, or sweep anyway. */
    withAceOnTable: 'normal' | 'sweeps';
    /** An Ace played to an empty table stays, or takes itself. */
    toEmptyTable: 'stays' | 'takesItself';
    /** The player may lay an Ace on the table instead of sweeping. */
    mayDecline: boolean;
  };
  scopa: {
    /** Whether clearing the table with the last card of the hand scores. */
    finalPlay: 'never' | 'counts';
  };
  scoring: {
    reBello: boolean;
    napola: 'off' | 'toSix' | 'full';
    /** All ten Coins wins the match outright (Napoleone / Cappotto). */
    napoleone: boolean;
    primieraFigures: 'flat' | 'graded';
    /** Cirulla: A-2-3.. of Coins, 1 per card. */
    piccola: boolean;
    /** Cirulla: Fante, Cavallo and Re of Coins, 5 points. */
    grande: boolean;
  };
  cirulla: {
    /** Face-up cards totalling 15 / 30 give the dealer 1 / 2 scope. */
    dealerBonus: boolean;
    /** Hand of total ≤ 9 scores 3, three of a kind scores 10. */
    declarations: boolean;
    /** The 7 of Cups is wild for declarations and the dealer bonus. */
    matta: boolean;
  };
  target: number;
}

export const FORMAT_INFO: Record<Format, { seats: number; sides: number; label: string; short: string }> = {
  '2p': { seats: 2, sides: 2, label: 'Two players', short: '1 v 1' },
  '3p': { seats: 3, sides: 3, label: 'Three players', short: '3 players' },
  '4p': { seats: 4, sides: 4, label: 'Four players, each for themselves', short: '4 players' },
  '4t': { seats: 4, sides: 2, label: 'Four players in two partnerships', short: '2 v 2' },
};

export const seatCount = (r: RulesConfig) => FORMAT_INFO[r.format].seats;
export const sideCount = (r: RulesConfig) => FORMAT_INFO[r.format].sides;
/** Partners sit opposite: seats 0 & 2 are side 0, seats 1 & 3 side 1. */
export const sideOf = (r: RulesConfig, seat: number) => (r.format === '4t' ? seat % 2 : seat);

export function cloneRules(r: RulesConfig): RulesConfig {
  return JSON.parse(JSON.stringify(r));
}

/** Lift a rules object from any earlier version to the current one. */
export function migrateRules(raw: unknown): RulesConfig {
  const r = raw as RulesConfig;
  if (!r || typeof r !== 'object') throw new Error('Unreadable rules');
  if (r.version > RULES_VERSION) throw new Error(`Rules version ${r.version} is newer than this app understands`);
  // version 1 is current; future migrations go here, one step at a time.
  return r;
}
