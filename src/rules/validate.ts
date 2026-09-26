import { FORMAT_INFO, type RulesConfig } from './config.ts';
import { PRESETS } from './presets.ts';

/** Every reason this configuration cannot be played, in plain language. Empty = valid. */
export function validateRules(r: RulesConfig): string[] {
  const e: string[] = [];
  const p = PRESETS[r.preset];
  if (!p) return [`Unknown rules preset "${r.preset}".`];
  const fi = FORMAT_INFO[r.format];
  if (!fi) return [`Unknown player format "${r.format}".`];
  if (!p.formats.includes(r.format)) e.push(`This preset is not played as "${fi.label}".`);

  const { handSize, tableSize, refill } = r.deal;
  const perRound = handSize * fi.seats;
  if (handSize < 1 || tableSize < 0) e.push('Hand and table sizes must be positive.');
  else if (refill) {
    if ((40 - tableSize) % perRound !== 0) e.push(`${40 - tableSize} cards cannot be dealt evenly in rounds of ${handSize} to ${fi.seats} players.`);
  } else if (perRound + tableSize !== 40) e.push(`A single deal of ${handSize} each plus ${tableSize} on the table must use all 40 cards.`);

  if (r.deal.redealOnKings && tableSize === 0) e.push('The three-Kings redeal needs face-up table cards.');
  if (r.deal.redealOnAces && tableSize === 0) e.push('The face-up Ace redeal needs face-up table cards.');
  if (r.deal.redealOnAces && !r.ace.sweep) e.push('Redealing on a face-up Ace only applies when Aces sweep the table.');
  if (r.deal.redealOnTwoAces && r.preset !== 'cirulla') e.push('The two-Aces misdeal belongs to Cirulla.');

  const isCirulla = r.preset === 'cirulla';
  if ((r.capture.mode === 'cirulla') !== isCirulla) e.push('Cirulla capturing is only used by the Cirulla preset, and Cirulla always uses it.');
  if (r.capture.mode === 'fifteen' && r.preset !== 'quindici') e.push('Fifteen-capture belongs to Scopa di Quindici.');
  if (r.capture.mode !== 'fifteen' && (r.capture.fifteenAllowsEqual || r.capture.fifteenFewestCards)) e.push('The fifteen-capture options only apply to Scopa di Quindici.');

  if (!r.ace.sweep) {
    if (r.ace.sweepScoresScopa) e.push('"Ace sweep scores a scopa" needs the Ace sweep.');
    if (r.ace.withAceOnTable !== 'normal') e.push('"Ace sweeps even with an Ace on the table" needs the Ace sweep.');
    if (r.ace.toEmptyTable !== 'stays') e.push('"Ace takes itself on an empty table" needs the Ace sweep.');
    if (r.ace.mayDecline) e.push('"Ace may be laid without sweeping" needs the Ace sweep.');
  }

  const cirullaRules = r.cirulla.dealerBonus || r.cirulla.declarations || r.cirulla.matta || r.scoring.piccola || r.scoring.grande;
  if (cirullaRules && !isCirulla) e.push('Dealer bonus, declarations, the Matta, Piccola and Grande belong to Cirulla.');
  if (r.cirulla.matta && !(r.cirulla.dealerBonus || r.cirulla.declarations)) e.push('The Matta is only wild for declarations and the dealer bonus.');
  if (isCirulla && r.cirulla.declarations && handSize !== 3) e.push('Cirulla declarations need three-card hands.');
  if (r.scoring.napola !== 'off' && isCirulla) e.push('Cirulla scores the Coins run as Piccola, so Napola is not added.');
  if (r.scoring.napoleone && r.scoring.napola === 'off' && !r.scoring.piccola) e.push('Winning outright with all ten Coins needs Napola scoring.');

  if (!Number.isInteger(r.target) || r.target < 5 || r.target > 151) e.push('Target score must be a whole number from 5 to 151.');
  return e;
}

export const isValidRules = (r: RulesConfig) => validateRules(r).length === 0;
