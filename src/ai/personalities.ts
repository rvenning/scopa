/**
 * AI characters. Personality only flavours timing, risk appetite within the
 * difficulty's band, and tie-breaking between moves the policy rates equal.
 * It never changes the rules or what the AI can see.
 */
export interface Persona {
  id: string;
  name: string;
  initials: string;
  /** Portrait accent colour (with a pattern index so colour is never the only cue). */
  color: string;
  pattern: number;
  blurb: string;
  /** Multiplier on thinking delay. */
  pace: number;
  /** Multiplier on how much the AI fears leaving a scopa (0.85–1.15). */
  caution: number;
  /** Small preference used only to break near-ties. */
  fondOf: 'coins' | 'cards' | 'sevens' | 'figures';
}

export const PERSONAS: Persona[] = [
  { id: 'rosa', name: 'Nonna Rosa', initials: 'NR', color: '#9b3d3d', pattern: 0, blurb: 'Unhurried, and never forgets a Settebello.', pace: 1.35, caution: 1.1, fondOf: 'sevens' },
  { id: 'franco', name: 'Zio Franco', initials: 'ZF', color: '#3d5d8f', pattern: 1, blurb: 'Plays quickly and likes a gamble.', pace: 0.75, caution: 0.88, fondOf: 'cards' },
  { id: 'giulia', name: 'Giulia', initials: 'G', color: '#5f7d3a', pattern: 2, blurb: 'Collects Coins like a banker.', pace: 1.0, caution: 1.0, fondOf: 'coins' },
  { id: 'enzo', name: 'Enzo', initials: 'E', color: '#8a6a2a', pattern: 3, blurb: 'Thoughtful, a little stubborn.', pace: 1.2, caution: 1.05, fondOf: 'figures' },
  { id: 'lucia', name: 'Lucia', initials: 'L', color: '#7a4b7f', pattern: 4, blurb: 'Bright and brisk at the table.', pace: 0.85, caution: 0.95, fondOf: 'sevens' },
  { id: 'beppe', name: 'Beppe', initials: 'B', color: '#2f6f6a', pattern: 5, blurb: 'The café regular. Counts every card.', pace: 1.1, caution: 1.12, fondOf: 'cards' },
  { id: 'carla', name: 'Carla', initials: 'C', color: '#a0522d', pattern: 6, blurb: 'Cheerful, bold with an Ace.', pace: 0.9, caution: 0.9, fondOf: 'coins' },
  { id: 'marco', name: 'Marco', initials: 'M', color: '#4a4a6a', pattern: 7, blurb: 'Quiet, patient, precise.', pace: 1.15, caution: 1.08, fondOf: 'figures' },
];

export const personaById = (id: string | undefined): Persona => PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
