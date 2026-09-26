import { cardName, primieraValue, rankOf, SUITS, suitOf, valueOf, RANK_NAMES, type CardId } from '../rules/cards.ts';
import { backSvg, cardSvg, type BackId } from './cardArt.ts';

/**
 * Card images are generated once from the SVG source and cached as object URLs,
 * so every card on screen is a plain <img> the browser rasterises crisply at
 * any pixel ratio.
 */
const faceUrls = new Map<CardId, string>();
const backUrls = new Map<BackId, string>();

const toUrl = (svg: string) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));

/**
 * Two face styles: 'traditional' uses the scanned Neapolitan deck in
 * public/cards/napoletane (see docs/ASSETS.md); 'original' is the procedural SVG deck.
 */
export type CardStyle = 'traditional' | 'original';
let style: CardStyle = 'traditional';
export function setCardStyle(s: CardStyle) { style = s; }
const SCANNED = 'cards/napoletane/';

export function faceUrl(c: CardId, as: CardStyle = style): string {
  if (as === 'traditional') return SCANNED + String(c).padStart(2, '0') + '.webp';
  let u = faceUrls.get(c);
  if (!u) { u = toUrl(cardSvg(c)); faceUrls.set(c, u); }
  return u;
}
export function backUrl(b: BackId): string {
  if (b === 'cubi') return SCANNED + 'back.webp';
  let u = backUrls.get(b);
  if (!u) { u = toUrl(backSvg(b)); backUrls.set(b, u); }
  return u;
}

/** Warm the image cache so the first deal does not flicker. */
export function preloadDeck(back: BackId) {
  // warms whichever style is active
  for (let c = 0; c < 40; c++) { const i = new Image(); i.src = faceUrl(c); }
  const i = new Image(); i.src = backUrl(back);
}

export function valueLabel(c: CardId): string {
  const r = rankOf(c);
  return r === 1 ? 'A' : String(r);
}

export function describeCard(c: CardId, figures: 'flat' | 'graded' = 'flat'): string {
  return `${cardName(c)} (${RANK_NAMES[rankOf(c)].it} di ${SUITS[suitOf(c)].it}). Capture value ${valueOf(c)}. Primiera value ${primieraValue(c, figures)}.`;
}

export interface CardElOpts { badge?: boolean; tag?: 'button' | 'div'; label?: string }

export function cardEl(c: CardId, o: CardElOpts = {}): HTMLElement {
  const el = document.createElement(o.tag ?? 'button');
  el.className = 'card';
  el.dataset.card = String(c);
  if (o.tag !== 'div') (el as HTMLButtonElement).type = 'button';
  el.setAttribute('aria-label', o.label ?? cardName(c));
  const img = document.createElement('img');
  img.src = faceUrl(c);
  img.alt = '';
  img.draggable = false;
  el.appendChild(img);
  if (o.badge) {
    const b = document.createElement('span');
    b.className = 'vb';
    b.textContent = String(valueOf(c));
    b.setAttribute('aria-hidden', 'true');
    el.appendChild(b);
  }
  return el;
}

export function backEl(b: BackId, label = 'Face-down card'): HTMLElement {
  const el = document.createElement('div');
  el.className = 'card back';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
  const img = document.createElement('img');
  img.src = backUrl(b);
  img.alt = '';
  img.draggable = false;
  el.appendChild(img);
  return el;
}

export function miniImg(c: CardId | 'back', back: BackId, cls = ''): HTMLImageElement {
  const i = document.createElement('img');
  i.src = c === 'back' ? backUrl(back) : faceUrl(c);
  i.alt = c === 'back' ? '' : cardName(c);
  if (cls) i.className = cls;
  i.draggable = false;
  return i;
}
