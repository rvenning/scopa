import { cardName, primieraValue, type CardId } from '../rules/cards.ts';
import type { RulesConfig } from '../rules/config.ts';
import type { CategoryResult } from '../rules/scoring.ts';

export const CATEGORY_TITLE: Record<CategoryResult['id'], string> = {
  cards: 'Cards',
  coins: 'Coins',
  settebello: 'Settebello',
  primiera: 'Primiera',
  reBello: 'Re Bello',
  napola: 'Napola',
  piccola: 'Piccola',
  grande: 'Grande',
  scope: 'Scope',
  declarations: 'Declarations',
};

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

/** One sentence explaining a category's result. */
export function explainCategory(c: CategoryResult, sides: string[], rules: RulesConfig): string {
  const who = (i: number) => sides[i];
  const vals = c.values;
  switch (c.id) {
    case 'cards':
    case 'coins': {
      const noun = c.id === 'cards' ? 'cards' : 'Coins';
      const counts = list(vals.map((v, i) => `${who(i)} ${v}`));
      if (c.winner === null) return `Tied for most ${noun} (${counts}), so nobody scores.`;
      return `${who(c.winner)} took the most ${noun}: ${counts}.`;
    }
    case 'settebello':
      return c.winner === null ? 'Nobody captured the Settebello.' : `${who(c.winner)} captured the Settebello, the 7 of Coins.`;
    case 'reBello':
      return c.winner === null ? 'Nobody captured the Re Bello.' : `${who(c.winner)} captured the Re Bello, the King of Coins.`;
    case 'primiera': {
      const parts = (c.primiera ?? []).map((chosen, i) => {
        if (vals[i] === null) {
          const missing = chosen.map((x, s) => (x === null ? ['Coins', 'Cups', 'Swords', 'Clubs'][s] : null)).filter(Boolean);
          return `${who(i)} has no ${list(missing as string[])}`;
        }
        const nums = chosen.map((x) => primieraValue(x as CardId, rules.scoring.primieraFigures));
        return `${who(i)} ${nums.join(' + ')} = ${vals[i]}`;
      });
      if (c.winner === null) return c.tie ? `Primiera is tied (${parts.join('; ')}), so nobody scores.` : `Nobody has all four suits (${parts.join('; ')}), so nobody scores.`;
      return `${who(c.winner)} has the best Primiera: ${parts.join('; ')}.`;
    }
    case 'napola':
    case 'piccola': {
      const name = c.id === 'napola' ? 'Napola' : 'Piccola';
      if (c.winner === null) return `Nobody holds the Ace, 2 and 3 of Coins, so there is no ${name}.`;
      const run = vals[c.winner] as number;
      return `${who(c.winner)} holds the Coins from Ace to ${run === 8 ? 'Fante' : run === 9 ? 'Cavallo' : run === 10 ? 'Re' : run}: a ${name} of ${c.points[c.winner]}.`;
    }
    case 'grande':
      return c.winner === null ? 'Nobody holds the Fante, Cavallo and Re of Coins.' : `${who(c.winner)} holds the Fante, Cavallo and Re of Coins: the Grande, worth 5.`;
    case 'scope': {
      const any = c.points.some((p) => p > 0);
      if (!any) return 'No scope this hand.';
      return list(c.points.map((p, i) => (p > 0 ? `${who(i)} made ${p} scop${p === 1 ? 'a' : 'e'}` : '')).filter(Boolean)) + '.';
    }
    case 'declarations':
      return list(c.points.map((p, i) => (p > 0 ? `${who(i)} declared for ${p}` : '')).filter(Boolean)) + '.';
  }
}

export function cardList(cs: readonly CardId[]): string {
  return list(cs.map(cardName));
}
