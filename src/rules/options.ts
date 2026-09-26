import { cloneRules, type RulesConfig } from './config.ts';
import { PRESETS } from './presets.ts';
import { validateRules } from './validate.ts';

/**
 * The Advanced Rules screen's vocabulary. Each option knows when it applies and,
 * when it does not, says why in one sentence. `set` returns the new rules plus a
 * note for every dependent option it had to switch off.
 */
export interface OptionChoice { value: string; label: string }
export interface OptionDef {
  id: string;
  label: string;
  help: string;
  choices: OptionChoice[];
  get(r: RulesConfig): string;
  /** Returns null if available, else the plain-language reason it is not. */
  unavailable(r: RulesConfig): string | null;
  apply(r: RulesConfig, v: string): void;
}

const onOff: OptionChoice[] = [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }];
const b = (x: boolean) => (x ? 'on' : 'off');

export const OPTIONS: OptionDef[] = [
  {
    id: 'target',
    label: 'Target score',
    help: 'The first side to reach this total at the end of a hand wins. Ties at or above it play another hand.',
    choices: [],
    get: (r) => String(r.target),
    unavailable: () => null,
    apply: (r, v) => { r.target = Number(v); },
  },
  {
    id: 'finalPlay',
    label: 'Scopa on the last card',
    help: 'Whether clearing the table with the very last card of the hand scores a scopa.',
    choices: [{ value: 'never', label: 'Never scores' }, { value: 'counts', label: 'Scores' }],
    get: (r) => r.scopa.finalPlay,
    unavailable: () => null,
    apply: (r, v) => { r.scopa.finalPlay = v as 'never' | 'counts'; },
  },
  {
    id: 'reBello',
    label: 'Re Bello',
    help: 'The King of Coins scores one extra point for the side that captures it.',
    choices: onOff,
    get: (r) => b(r.scoring.reBello),
    unavailable: () => null,
    apply: (r, v) => { r.scoring.reBello = v === 'on'; },
  },
  {
    id: 'napola',
    label: 'Napola',
    help: 'Capturing Ace, 2 and 3 of Coins scores 3, plus 1 for each further Coin in an unbroken run.',
    choices: [{ value: 'off', label: 'Off' }, { value: 'full', label: 'Run to the King' }, { value: 'toSix', label: 'Run up to the 6' }],
    get: (r) => r.scoring.napola,
    unavailable: (r) => (r.preset === 'cirulla' ? 'Cirulla already scores the Coins run as the Piccola.' : null),
    apply: (r, v) => {
      r.scoring.napola = v as RulesConfig['scoring']['napola'];
      if (v === 'off') r.scoring.napoleone = false;
    },
  },
  {
    id: 'napoleone',
    label: 'All ten Coins wins the match',
    help: 'A side that captures every Coin in one hand (Napoleone, or Cappotto in Cirulla) wins immediately.',
    choices: onOff,
    get: (r) => b(r.scoring.napoleone),
    unavailable: (r) => (r.scoring.napola === 'off' && !r.scoring.piccola ? 'Needs Napola scoring to be on.' : null),
    apply: (r, v) => { r.scoring.napoleone = v === 'on'; },
  },
  {
    id: 'primieraFigures',
    label: 'Primiera value of figures',
    help: 'Traditionally Fante, Cavallo and Re are all worth 10 in the Primiera. Some regions grade them 8, 9 and 10.',
    choices: [{ value: 'flat', label: 'All 10' }, { value: 'graded', label: 'Fante 8, Cavallo 9, Re 10' }],
    get: (r) => r.scoring.primieraFigures,
    unavailable: () => null,
    apply: (r, v) => { r.scoring.primieraFigures = v as 'flat' | 'graded'; },
  },
  {
    id: 'redealOnKings',
    label: 'Redeal on three Kings',
    help: 'If three or four Kings are dealt face up, the same dealer deals again.',
    choices: onOff,
    get: (r) => b(r.deal.redealOnKings),
    unavailable: (r) => (r.deal.tableSize === 0 ? 'No cards are dealt face up in this game.' : null),
    apply: (r, v) => { r.deal.redealOnKings = v === 'on'; },
  },
  {
    id: 'aceSweep',
    label: 'Ace takes the whole table',
    help: 'An Ace played when no Ace is on the table captures every table card (Asso Pigliatutto).',
    choices: onOff,
    get: (r) => b(r.ace.sweep),
    unavailable: (r) => (r.preset === 'cirulla' ? 'The Ace sweep is part of Cirulla itself.' : null),
    apply: (r, v) => {
      r.ace.sweep = v === 'on';
      if (!r.ace.sweep) {
        r.ace.sweepScoresScopa = false; r.ace.withAceOnTable = 'normal';
        r.ace.toEmptyTable = 'stays'; r.ace.mayDecline = false; r.deal.redealOnAces = false;
      }
    },
  },
  {
    id: 'aceScopa',
    label: 'Ace sweep scores a scopa',
    help: 'Asso Pigliatutto counts the sweep as a scopa; Scopa d’Assi does not.',
    choices: onOff,
    get: (r) => b(r.ace.sweepScoresScopa),
    unavailable: (r) => (!r.ace.sweep ? 'Only applies when an Ace takes the whole table.' : null),
    apply: (r, v) => { r.ace.sweepScoresScopa = v === 'on'; },
  },
  {
    id: 'aceOnTable',
    label: 'When an Ace is already on the table',
    help: 'Traditionally the played Ace then only takes that Ace. As a house rule it can sweep anyway.',
    choices: [{ value: 'normal', label: 'Takes just the Ace' }, { value: 'sweeps', label: 'Sweeps anyway' }],
    get: (r) => r.ace.withAceOnTable,
    unavailable: (r) => (!r.ace.sweep ? 'Only applies when an Ace takes the whole table.' : null),
    apply: (r, v) => { r.ace.withAceOnTable = v as 'normal' | 'sweeps'; },
  },
  {
    id: 'aceEmpty',
    label: 'Ace played to an empty table',
    help: 'It stays on the table, or it “takes itself” into your pile and the table stays empty.',
    choices: [{ value: 'stays', label: 'Stays on the table' }, { value: 'takesItself', label: 'Takes itself' }],
    get: (r) => r.ace.toEmptyTable,
    unavailable: (r) => (!r.ace.sweep ? 'Only applies when an Ace takes the whole table.' : null),
    apply: (r, v) => { r.ace.toEmptyTable = v as 'stays' | 'takesItself'; },
  },
  {
    id: 'aceDecline',
    label: 'Ace may be laid without sweeping',
    help: 'A house rule: you may choose to put an Ace on the table instead of sweeping.',
    choices: onOff,
    get: (r) => b(r.ace.mayDecline),
    unavailable: (r) => (!r.ace.sweep ? 'Only applies when an Ace takes the whole table.' : null),
    apply: (r, v) => { r.ace.mayDecline = v === 'on'; },
  },
  {
    id: 'redealOnAces',
    label: 'Redeal if an Ace is dealt face up',
    help: 'Stops the first player sweeping a freshly dealt table.',
    choices: onOff,
    get: (r) => b(r.deal.redealOnAces),
    unavailable: (r) => (!r.ace.sweep ? 'Only applies when an Ace takes the whole table.' : r.deal.tableSize === 0 ? 'No cards are dealt face up in this game.' : null),
    apply: (r, v) => { r.deal.redealOnAces = v === 'on'; },
  },
  {
    id: 'fifteenEqual',
    label: 'Equal cards may also be taken',
    help: 'Besides making fifteen, a card may take a card or set of the same value.',
    choices: onOff,
    get: (r) => b(r.capture.fifteenAllowsEqual),
    unavailable: (r) => (r.capture.mode !== 'fifteen' ? 'Only for Scopa di Quindici.' : null),
    apply: (r, v) => { r.capture.fifteenAllowsEqual = v === 'on'; },
  },
  {
    id: 'fifteenFewest',
    label: 'Fewest cards when making fifteen',
    help: 'When several sets make fifteen, you must take one that uses the fewest cards.',
    choices: onOff,
    get: (r) => b(r.capture.fifteenFewestCards),
    unavailable: (r) => (r.capture.mode !== 'fifteen' ? 'Only for Scopa di Quindici.' : null),
    apply: (r, v) => { r.capture.fifteenFewestCards = v === 'on'; },
  },
  {
    id: 'cirullaChoice',
    label: 'Equal card before a sum',
    help: 'Italian rules make you take an equal card rather than a sum of the same value. Pagat lets you choose freely.',
    choices: [{ value: 'on', label: 'Equal card first' }, { value: 'off', label: 'Free choice' }],
    get: (r) => b(r.capture.exactMatchPriority),
    unavailable: (r) => (r.preset !== 'cirulla' ? 'Only for Cirulla; the other presets always take the equal card first.' : null),
    apply: (r, v) => { r.capture.exactMatchPriority = v === 'on'; },
  },
  {
    id: 'dealerBonus',
    label: 'Dealer’s 15 / 30 bonus',
    help: 'If the four face-up cards total 15 or 30, the dealer takes them for 1 or 2 scope.',
    choices: onOff,
    get: (r) => b(r.cirulla.dealerBonus),
    unavailable: (r) => (r.preset !== 'cirulla' ? 'Only for Cirulla.' : null),
    apply: (r, v) => { r.cirulla.dealerBonus = v === 'on'; if (!r.cirulla.dealerBonus && !r.cirulla.declarations) r.cirulla.matta = false; },
  },
  {
    id: 'declarations',
    label: 'Declarations',
    help: 'A three-card hand totalling 9 or less scores 3; three of a kind scores 10.',
    choices: onOff,
    get: (r) => b(r.cirulla.declarations),
    unavailable: (r) => (r.preset !== 'cirulla' ? 'Only for Cirulla.' : null),
    apply: (r, v) => { r.cirulla.declarations = v === 'on'; if (!r.cirulla.dealerBonus && !r.cirulla.declarations) r.cirulla.matta = false; },
  },
  {
    id: 'matta',
    label: 'La Matta (wild 7 of Cups)',
    help: 'The 7 of Cups may count as any value from 1 to 10 for declarations and the dealer bonus.',
    choices: onOff,
    get: (r) => b(r.cirulla.matta),
    unavailable: (r) => (r.preset !== 'cirulla' ? 'Only for Cirulla.' : !r.cirulla.dealerBonus && !r.cirulla.declarations ? 'Needs declarations or the dealer bonus, the only places it is wild.' : null),
    apply: (r, v) => { r.cirulla.matta = v === 'on'; },
  },
];

export function optionChoices(o: OptionDef, r: RulesConfig): OptionChoice[] {
  if (o.id === 'target') {
    const ts = [...new Set([...PRESETS[r.preset].targets, r.target])].sort((a, b2) => a - b2);
    return ts.map((t) => ({ value: String(t), label: `${t} points` }));
  }
  return o.choices;
}

/**
 * Apply an option change. Returns the new rules and a note for each dependent
 * option that changed as a consequence. Never returns an invalid configuration:
 * if the change would be invalid it is refused with the reason.
 */
export function setOption(r: RulesConfig, id: string, value: string): { rules: RulesConfig; notes: string[]; error?: string } {
  const o = OPTIONS.find((x) => x.id === id);
  if (!o) return { rules: r, notes: [], error: 'Unknown option' };
  const why = o.unavailable(r);
  if (why) return { rules: r, notes: [], error: why };
  const next = cloneRules(r);
  o.apply(next, value);
  const notes: string[] = [];
  for (const other of OPTIONS) {
    if (other.id === id) continue;
    const before = other.get(r), after = other.get(next);
    if (before !== after) {
      const lab = other.choices.find((c) => c.value === after)?.label ?? after;
      notes.push(`${other.label} changed to “${lab}” because ${o.label.toLowerCase()} is ${o.choices.find((c) => c.value === value)?.label.toLowerCase() ?? value}.`);
    }
  }
  const errs = validateRules(next);
  if (errs.length) return { rules: r, notes: [], error: errs[0] };
  return { rules: next, notes };
}
