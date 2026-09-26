import { FORMAT_INFO, type RulesConfig } from '../rules/config.ts';
import { customisations, encodeRules, isCustom, PRESETS } from '../rules/presets.ts';
import { OPTIONS } from '../rules/options.ts';
import { PRESET_TEXT } from './presets.ts';

/**
 * The rules book is written FROM the rules configuration, so it always matches
 * the game being played, including every custom option. It explains rules and
 * legal moves only; it never gives strategy advice.
 */
export interface RulesSection { id: string; title: string; paras: string[]; table?: [string, string][] }

export function rulesBook(r: RulesConfig): RulesSection[] {
  const t = PRESET_TEXT[r.preset];
  const fi = FORMAT_INFO[r.format];
  const out: RulesSection[] = [];

  out.push({
    id: 'overview',
    title: `${t.name}${isCustom(r) ? ' — Custom Rules' : ''}`,
    paras: [t.description, `Players: ${fi.label.toLowerCase()}. ${r.format === '4t' ? 'Partners sit opposite each other and share one pile of captured cards.' : ''}`, `The first side to reach ${r.target} points at the end of a hand wins. If more than one side gets there in the same hand, the higher total wins; if they are tied, another hand is played.`],
  });

  out.push({
    id: 'deck',
    title: 'The deck',
    paras: ['Forty Italian cards in four suits: Denari (Coins), Coppe (Cups), Spade (Swords) and Bastoni (Clubs). Each suit runs Ace to 7, then Fante (Jack), Cavallo (Knight) and Re (King). Suits are always shown by their shape, never by colour alone.'],
    table: [['Ace', '1'], ['2 – 7', 'face value'], ['Fante', '8'], ['Cavallo', '9'], ['Re', '10']],
  });

  const deal: string[] = [];
  if (r.deal.refill) {
    deal.push(`The dealer gives each player ${r.deal.handSize} cards${r.deal.tableSize ? ` and lays ${r.deal.tableSize} cards face up on the table` : ''}. When every hand is empty, ${r.deal.handSize} more cards are dealt to each player; the table is left as it is. This continues until the deck runs out.`);
  } else {
    deal.push(`All forty cards are dealt at once: ${r.deal.handSize} to each player${r.deal.tableSize ? ` and ${r.deal.tableSize} face up on the table` : ', and none to the table'}.`);
  }
  deal.push('Play goes counter-clockwise, starting with the player to the dealer’s right. The deal passes to the right after every hand.');
  if (r.deal.redealOnKings) deal.push('If three or four Kings are dealt face up, the same dealer shuffles and deals again.');
  if (r.deal.redealOnAces) deal.push('If any Ace is dealt face up, the same dealer deals again.');
  if (r.deal.redealOnTwoAces) deal.push('If two or more Aces are dealt face up, the same dealer deals again — unless the dealer’s 15/30 bonus applies.');
  if (r.cirulla.dealerBonus) deal.push(`If the face-up cards total 15, the dealer takes them and scores 1 scopa; if they total 30, 2 scope.${r.cirulla.matta ? ' A face-up 7 of Cups may count as any value from 1 to 10 for this.' : ''}`);
  out.push({ id: 'deal', title: 'Dealing', paras: deal });

  const cap: string[] = ['On your turn you play one card from your hand face up.'];
  if (r.capture.mode === 'sum') {
    cap.push('If a table card has the same value, you capture it. If two or more have that value, you choose which one.');
    cap.push(r.capture.exactMatchPriority
      ? 'If no single card matches, you may capture a group of table cards whose values add up to your card. A single matching card always comes first: you may not take a group instead.'
      : 'You may capture a single matching card or a group of table cards that adds up to your card.');
  } else if (r.capture.mode === 'fifteen') {
    cap.push('You capture table cards when your card and the cards you take add up to exactly 15. For example a 6 can take a 4 and a 5, or a Fante (8) and an Ace.');
    if (r.capture.fifteenAllowsEqual) cap.push('You may instead capture a card of equal value, or a group adding up to your card (a single equal card first).');
    else cap.push('An equal card is NOT captured in this game.');
    if (r.capture.fifteenFewestCards) cap.push('If several groups make 15, you must choose one that uses the fewest cards.');
  } else {
    cap.push('You may capture a card of the same value, a group of table cards adding up to your card, or a group that makes 15 together with your card. You choose which.');
    if (r.capture.exactMatchPriority) cap.push('One restriction: if a single card has your card’s value, you may not take a group that adds up to the same value instead.');
  }
  if (r.ace.sweep) {
    cap.push(`An Ace played when there is no Ace on the table captures the whole table${r.ace.sweepScoresScopa ? ' and scores a scopa' : ', but this does not count as a scopa'}.`);
    cap.push(r.ace.withAceOnTable === 'sweeps' ? 'House rule: the Ace sweeps even if there is already an Ace on the table.' : 'If there is already an Ace on the table, your Ace captures that Ace as normal instead.');
    if (r.ace.toEmptyTable === 'takesItself') cap.push('An Ace played to an empty table goes straight into your pile; the table stays empty.');
    else cap.push('An Ace played to an empty table stays on the table.');
    if (r.ace.mayDecline) cap.push('House rule: you may choose to lay an Ace on the table instead of sweeping.');
  }
  cap.push('If your card can capture, you must capture. If it cannot, it stays on the table.');
  out.push({ id: 'capture', title: 'Capturing', paras: cap });

  const sc: string[] = ['Clearing every card from the table with a capture is a scopa, worth 1 point. The next player then has to play to an empty table.'];
  sc.push(r.scopa.finalPlay === 'never'
    ? 'Clearing the table with the very last card of the hand does not count as a scopa.'
    : 'Clearing the table with the very last card of the hand DOES count as a scopa.');
  sc.push('When the last card has been played, any cards left on the table go to the player or team who captured most recently.');
  out.push({ id: 'scopa', title: 'Scopa and the end of the hand', paras: sc });

  const pts: string[] = [
    'Cards: 1 point for capturing the most cards. A tie scores nothing.',
    'Coins: 1 point for the most Denari. A tie scores nothing.',
    'Settebello: 1 point for the 7 of Coins.',
    `Primiera: 1 point for the best Primiera. Take your best card in each suit by the Primiera table and add them up. A side missing a whole suit cannot win it; a tie scores nothing.`,
    'Scope: 1 point for each scopa.',
  ];
  if (r.scoring.reBello) pts.push('Re Bello: 1 point for the King of Coins.');
  if (r.scoring.napola !== 'off') pts.push(`Napola: the Ace, 2 and 3 of Coins score 3, plus 1 for each next Coin in an unbroken run${r.scoring.napola === 'toSix' ? ', up to the 6' : ''}.`);
  if (r.scoring.piccola) pts.push('Piccola: the Ace, 2 and 3 of Coins score 3, plus 1 for each next Coin in an unbroken run up to the 7.');
  if (r.scoring.grande) pts.push('Grande: the Fante, Cavallo and Re of Coins together score 5.');
  if (r.cirulla.declarations) pts.push(`Declarations: when you are dealt three cards totalling 9 or less you score 3; three cards of the same rank score 10. The cards are shown to everyone.${r.cirulla.matta ? ' The 7 of Cups (la Matta) may count as any value from 1 to 10 to make a declaration.' : ''} The game declares for you automatically.`);
  if (r.scoring.napoleone) pts.push('Capturing all ten Coins in one hand wins the match immediately.');
  out.push({
    id: 'scoring',
    title: 'Scoring each hand',
    paras: pts,
    table: [['7', '21'], ['6', '18'], ['Ace', '16'], ['5', '15'], ['4', '14'], ['3', '13'], ['2', '12'], r.scoring.primieraFigures === 'graded' ? ['Fante / Cavallo / Re', '8 / 9 / 10'] : ['Fante, Cavallo, Re', '10']],
  });

  out.push({ id: 'helper', title: 'Rules helper', paras: [
    'Tap a card in your hand to see every capture it can legally make. When there is more than one, each is shown as a numbered group; pick the one you want, then confirm.',
    'If a card cannot capture, the helper says it will be placed on the table. The helper never suggests which move is best.',
    'Press and hold (or focus) any card to see its name, suit, capture value and Primiera value. Value badges can be switched on in Settings.',
  ] });
  out.push({ id: 'source', title: 'Where these rules come from', paras: [`${t.source}. Full notes and disagreements between sources are in docs/RULES_SOURCES.md in the project.`] });
  return out;
}

/** A readable, exact summary of the configuration, plus a code that reproduces it. */
export function rulesSummary(r: RulesConfig): { lines: string[]; code: string; custom: boolean } {
  const lines = [`${PRESET_TEXT[r.preset].name} — ${FORMAT_INFO[r.format].label} — to ${r.target}`];
  const changed = new Set(customisations(r));
  for (const o of OPTIONS) {
    if (o.id === 'target' || o.unavailable(r)) continue;
    const v = o.get(r);
    const label = o.choices.find((c) => c.value === v)?.label ?? v;
    lines.push(`${o.label}: ${label}`);
  }
  return { lines, code: encodeRules(r), custom: changed.size > 0 || !PRESETS[r.preset].targets.includes(r.target) };
}
