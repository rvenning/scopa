import { primieraValue, type CardId } from '../rules/cards.ts';
import type { MatchState } from '../engine/match.ts';
import type { CategoryResult } from '../rules/scoring.ts';
import { CATEGORY_TITLE, explainCategory } from '../content/explain.ts';
import { miniImg } from '../presentation/cards.ts';
import { audio } from '../presentation/audio.ts';
import { prefersReducedMotion, type Settings } from '../persistence/settings.ts';
import { announce, h } from './dom.ts';
import { wait } from './anim.ts';

/**
 * The end-of-hand ceremony: categories revealed one at a time, each with both
 * sides' relevant cards and a one-sentence explanation. Primiera shows the card
 * chosen from each suit and the arithmetic. Skippable at any point.
 */
export type ScoreResult = 'next' | 'rematch' | 'home';

export function showScore(host: HTMLElement, s: MatchState, sides: string[], settings: Settings, opts: { tutorial?: boolean } = {}): Promise<ScoreResult> {
  const score = s.lastScore;
  const rules = s.setup.rules;
  return new Promise((resolve) => {
    if (!score) { resolve('next'); return; }
    const reduced = prefersReducedMotion(settings);
    const list = h('div', { role: 'list', 'aria-label': 'Hand scoring' });
    const done = h('div', { class: 'stack' });
    const skip = h('button', { class: 'btn small ghost' }, 'Show all');
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sc-t', style: { '--sides': String(sides.length) } as Partial<CSSStyleDeclaration> },
      h('div', { class: 'row between' }, h('h2', { id: 'sc-t' }, s.phase === 'matchEnd' ? 'Final hand' : `Hand ${s.handNo} scoring`), skip),
      list, done);
    sheet.style.setProperty('--sides', String(sides.length));
    host.append(sheet);
    skip.focus();
    let fast = false;
    skip.onclick = () => { fast = true; };
    const cats = score.categories.filter((c) => c.id !== 'declarations' || c.points.some((p) => p > 0));

    const cardsRow = (c: CategoryResult, side: number): HTMLElement => {
      const imgs: HTMLElement[] = [];
      const back = settings.cardBack;
      if (c.id === 'primiera' && c.primiera) {
        c.primiera[side].forEach((x, suit) => {
          if (x === null) imgs.push(h('span', { class: 'chip', style: { color: 'inherit', borderColor: 'currentColor' } }, `no ${['Coins', 'Cups', 'Swords', 'Clubs'][suit]}`));
          else imgs.push(h('span', { style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', marginRight: '4px' } }, miniImg(x, back), h('small', {}, String(primieraValue(x, rules.scoring.primieraFigures)))));
        });
      } else if (c.id === 'cards') {
        imgs.push(h('span', {}, `${c.values[side]} cards`));
      } else {
        for (const x of c.cards[side] as CardId[]) imgs.push(miniImg(x, back));
        if (c.id === 'coins') imgs.push(h('span', { class: 'small' }, ` ${c.values[side]}`));
        if (c.id === 'scope' && (c.values[side] ?? 0) > 0 && !c.cards[side].length) imgs.push(h('span', {}, `${c.values[side]}`));
      }
      return h('div', { class: 'score-side' }, h('div', { class: 'small', style: { fontWeight: '600' } }, sides[side]), h('div', { class: 'minis' }, ...imgs));
    };

    const run = async () => {
      for (const c of cats) {
        const sentence = explainCategory(c, sides, rules);
        const pts = c.points.map((p, i) => (p ? `${sides[i]} +${p}` : '')).filter(Boolean).join(', ') || 'no points';
        const row = h('div', { class: 'score-row', role: 'listitem' },
          h('h3', {}, h('span', {}, CATEGORY_TITLE[c.id]), h('span', { class: 'pts small' }, pts)),
          h('div', { class: 'score-sides' }, ...c.points.map((_, i) => cardsRow(c, i))),
          h('p', { class: 'small', style: { margin: '0' } }, sentence));
        list.append(row);
        row.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
        announce(`${CATEGORY_TITLE[c.id]}. ${sentence}`);
        audio.play('tick', false);
        if (!fast) await wait(reduced ? 350 : 900 / settings.animationSpeed);
      }
      skip.remove();
      const before = s.scores.map((v, i) => v - score.totals[i]);
      const totals = h('div', { class: 'score-total', 'aria-label': 'Totals' }, ...sides.map((nm, i) => h('div', { style: { textAlign: 'center' } }, h('div', { class: 'small' }, nm), h('div', {}, `${before[i]} + ${score.totals[i]} = `, h('b', {}, String(s.scores[i]))))));
      done.append(totals);
      let msg = '';
      if (s.phase === 'matchEnd' && s.winner !== null) {
        msg = score.instantWin !== null ? `${sides[s.winner]} captured all ten Coins and win the match outright!` : `${sides[s.winner]} win${sides[s.winner].includes('&') ? '' : 's'} the match, ${s.scores[s.winner]} to ${Math.max(...s.scores.filter((_, i) => i !== s.winner))}.`;
        done.append(h('h2', { style: { textAlign: 'center' } }, msg));
      } else {
        const max = Math.max(...s.scores);
        if (max >= rules.target) msg = 'Tied at the top above the target — another hand decides it.';
        else msg = `First to ${rules.target} wins.`;
        done.append(h('p', { class: 'muted', style: { textAlign: 'center' } }, msg));
      }
      announce(`Totals: ${sides.map((nm, i) => `${nm} ${s.scores[i]}`).join(', ')}. ${msg}`);
      const btns = h('div', { class: 'row end' });
      if (opts.tutorial) {
        btns.append(h('button', { class: 'btn primary', onclick: () => resolve('home') }, 'Finish tutorial'));
      } else if (s.phase === 'matchEnd') {
        btns.append(h('button', { class: 'btn', onclick: () => resolve('home') }, 'Home'), h('button', { class: 'btn primary', onclick: () => resolve('rematch') }, 'Rematch'));
      } else {
        btns.append(h('button', { class: 'btn primary', onclick: () => resolve('next') }, 'Next hand'));
      }
      done.append(btns);
      (btns.lastElementChild as HTMLElement).focus();
    };
    void run();
  });
}
