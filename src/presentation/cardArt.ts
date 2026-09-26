import { rankOf, suitOf, type CardId } from '../rules/cards.ts';

/**
 * The original Scopa deck, drawn procedurally as SVG. This file IS the editable
 * source artwork: every pip, figure and back is a function of a few shapes and
 * one palette, so the forty cards stay one coherent set. Nothing here is traced
 * from a scan or a commercial deck; the Neapolitan pattern informs the layout
 * (pip arrangements, crossed swords and clubs, Fante / Cavallo / Re) only.
 *
 * Card faces are 200 × 320 (5:8). Value badges are NOT drawn here; the UI
 * overlays them so they can be toggled.
 */
export const W = 200, H = 320;

const INK = '#2b1d14';
const PAPER = '#f8f1e0';
const GOLD = '#d9a441';
const GOLD_D = '#a0701e';
const RED = '#b23a2e';
const RED_D = '#7e2219';
const BLUE = '#35629a';
const BLUE_D = '#1f3f68';
const GREEN = '#4f7d3b';
const GREEN_D = '#335524';
const WOOD = '#a06a33';
const WOOD_D = '#6b4420';
const FLESH = '#f0c9a2';
const STEEL = '#9fb7cf';
const WHITE = '#fbf8f0';

const f = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ suit symbols (drawn around 0,0)

/** Coin: radius 20 units. */
function coin(big = false): string {
  const petals = Array.from({ length: 8 }, (_, i) => `<ellipse cx="0" cy="-9" rx="3.2" ry="6" fill="${RED}" stroke="${INK}" stroke-width="0.8" transform="rotate(${i * 45})"/>`).join('');
  const dots = big ? Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return `<circle cx="${f(Math.cos(a) * 17.2)}" cy="${f(Math.sin(a) * 17.2)}" r="0.9" fill="${GOLD_D}"/>`; }).join('') : '';
  return `<circle r="20" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/><circle r="15.2" fill="#e8bd5c" stroke="${GOLD_D}" stroke-width="1.2"/>${dots}${petals}<circle r="4" fill="${GREEN}" stroke="${INK}" stroke-width="1"/>`;
}

/** Cup: about 44 units tall, centred. */
function cup(): string {
  return `<path d="M-17,-19 Q-18,3 0,5 Q18,3 17,-19 Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M-16.6,-12 Q0,-7 16.6,-12 L16.2,-7 Q0,-2 -16.2,-7 Z" fill="${RED}" stroke="${INK}" stroke-width="0.8"/>` +
    `<ellipse cx="0" cy="-19" rx="17" ry="4" fill="#e8bd5c" stroke="${INK}" stroke-width="1.4"/>` +
    `<rect x="-2.8" y="4" width="5.6" height="12" fill="${GOLD_D}" stroke="${INK}" stroke-width="1.1"/>` +
    `<ellipse cx="0" cy="9.5" rx="5.2" ry="2.8" fill="${BLUE}" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M-12,22 Q0,12 12,22 Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`;
}

/** Sword: blade along -y, about 120 units long, centred. */
function sword(): string {
  return `<path d="M-4.5,30 Q-9,-15 1.5,-60 Q7,-14 4.5,30 Z" fill="${STEEL}" stroke="${INK}" stroke-width="1.5"/>` +
    `<path d="M0,26 Q-2,-14 1.2,-50" fill="none" stroke="${BLUE_D}" stroke-width="1" opacity="0.7"/>` +
    `<path d="M-16,30 Q0,26 16,30 L15,36 Q0,33 -15,36 Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.3"/>` +
    `<rect x="-3.6" y="35" width="7.2" height="15" rx="2" fill="${RED}" stroke="${INK}" stroke-width="1.2"/>` +
    `<circle cx="0" cy="53.5" r="4.6" fill="${GOLD}" stroke="${INK}" stroke-width="1.2"/>`;
}

/** Club: a knotted cudgel along -y, about 120 units long, centred. */
function club(): string {
  const knots = [-34, -12, 10, 32].map((y, i) => {
    const side = i % 2 ? 1 : -1;
    return `<path d="M${side * 5},${y} q${side * 7},-3 ${side * 8},-9 q${-side * 5},1 ${-side * 9},5 Z" fill="${GREEN}" stroke="${INK}" stroke-width="0.9"/>`;
  }).join('');
  return `<path d="M-5.5,56 L-8.5,-46 Q-9,-60 0,-61 Q9,-60 8.5,-46 L5.5,56 Q0,60 -5.5,56 Z" fill="${WOOD}" stroke="${INK}" stroke-width="1.5"/>` +
    `<path d="M-2,50 L-4,-44" stroke="${WOOD_D}" stroke-width="1.2" opacity="0.6"/>` +
    knots +
    `<rect x="-8.8" y="-52" width="17.6" height="5" rx="1.5" fill="${RED}" stroke="${INK}" stroke-width="1"/>` +
    `<rect x="-6" y="44" width="12" height="5" rx="1.5" fill="${RED}" stroke="${INK}" stroke-width="1"/>`;
}

const at = (x: number, y: number, s: number, rot: number, body: string) => `<g transform="translate(${f(x)},${f(y)}) rotate(${rot}) scale(${f(s)})">${body}</g>`;

// ------------------------------------------------------------------ pip layouts

const CX = W / 2, CY = H / 2;

function roundPips(n: number, draw: () => string, s: number): string {
  // Coins and cups: counted in columns, like the Neapolitan pattern.
  const L = CX - 42, R = CX + 42;
  const pos: [number, number][] = {
    2: [[CX, CY - 62], [CX, CY + 62]],
    3: [[CX, CY - 82], [CX, CY], [CX, CY + 82]],
    4: [[L, CY - 62], [R, CY - 62], [L, CY + 62], [R, CY + 62]],
    5: [[L, CY - 78], [R, CY - 78], [CX, CY], [L, CY + 78], [R, CY + 78]],
    6: [[L, CY - 86], [R, CY - 86], [L, CY], [R, CY], [L, CY + 86], [R, CY + 86]],
    7: [[L, CY - 92], [R, CY - 92], [CX, CY - 46], [L, CY], [R, CY], [L, CY + 92], [R, CY + 92]],
  }[n] as [number, number][];
  return pos.map(([x, y]) => at(x, y, s, 0, draw())).join('');
}

function longPips(n: number, draw: () => string): string {
  // Swords and clubs: crossed pairs stacked down the card; an odd one stands upright in the middle.
  const pairs = Math.floor(n / 2);
  const odd = n % 2 === 1;
  const out: string[] = [];
  const span = 250;
  const step = pairs > 0 ? span / pairs : 0;
  const scale = Math.min(1.05, 0.55 + 0.9 / Math.max(1, pairs));
  const ang = pairs === 1 ? 28 : 42;
  const xoff = odd ? 30 : 0;
  for (let i = 0; i < pairs; i++) {
    const y = CY - span / 2 + step * (i + 0.5);
    const x = CX + (odd ? (i % 2 ? xoff : -xoff) * 0 : 0);
    out.push(at(x, y, scale, -ang, draw()), at(x, y, scale, ang, draw()));
  }
  if (odd) out.push(at(CX, CY, pairs === 0 ? 1.8 : 1.62, 0, draw()));
  return out.join('');
}

// ------------------------------------------------------------------ figures

interface Palette { main: string; mainD: string; trim: string; trimD: string; tint: string; horse: string; horseD: string }
const SUIT_PAL: Palette[] = [
  { main: RED, mainD: RED_D, trim: GOLD, trimD: GOLD_D, tint: '#f3e3c2', horse: '#f2ede2', horseD: '#b9ad97' }, // coins
  { main: BLUE, mainD: BLUE_D, trim: RED, trimD: RED_D, tint: '#e7e2d3', horse: '#8b5a34', horseD: '#5a391f' }, // cups
  { main: GREEN, mainD: GREEN_D, trim: GOLD, trimD: GOLD_D, tint: '#e9e6d0', horse: '#9a9a96', horseD: '#62625e' }, // swords
  { main: RED, mainD: RED_D, trim: BLUE, trimD: BLUE_D, tint: '#efe0cd', horse: '#c28a4b', horseD: '#7d5429' }, // clubs
];

function heldSymbol(suit: number, x: number, y: number, s: number, rot = 0): string {
  const d = [coin, cup, sword, club][suit];
  return at(x, y, s, rot, d());
}

function face(cx: number, cy: number, r: number, beard: boolean, hair: string): string {
  const b = beard ? `<path d="M${cx - r * 0.85},${cy + r * 0.2} Q${cx - r * 0.8},${cy + r * 1.7} ${cx},${cy + r * 1.8} Q${cx + r * 0.8},${cy + r * 1.7} ${cx + r * 0.85},${cy + r * 0.2} Q${cx},${cy + r * 0.9} ${cx - r * 0.85},${cy + r * 0.2} Z" fill="${hair}" stroke="${INK}" stroke-width="1.2"/>` : '';
  return `<path d="M${cx - r * 1.05},${cy + r * 0.1} Q${cx - r * 1.2},${cy + r * 1.15} ${cx - r * 0.7},${cy + r * 1.2} L${cx - r * 0.95},${cy - r * 0.2} Z" fill="${hair}" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M${cx + r * 1.05},${cy + r * 0.1} Q${cx + r * 1.2},${cy + r * 1.15} ${cx + r * 0.7},${cy + r * 1.2} L${cx + r * 0.95},${cy - r * 0.2} Z" fill="${hair}" stroke="${INK}" stroke-width="1"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.12}" fill="${FLESH}" stroke="${INK}" stroke-width="1.4"/>` +
    `<circle cx="${cx - r * 0.38}" cy="${cy - r * 0.08}" r="${r * 0.11}" fill="${INK}"/><circle cx="${cx + r * 0.38}" cy="${cy - r * 0.08}" r="${r * 0.11}" fill="${INK}"/>` +
    `<path d="M${cx - r * 0.55},${cy - r * 0.35} q${r * 0.2},-${r * 0.14} ${r * 0.36},0 M${cx + r * 0.19},${cy - r * 0.35} q${r * 0.2},-${r * 0.14} ${r * 0.36},0" stroke="${INK}" stroke-width="0.9" fill="none"/>` +
    `<path d="M${cx},${cy} l-${r * 0.12},${r * 0.32} l${r * 0.2},0" stroke="${INK}" stroke-width="0.9" fill="none"/>` +
    `<circle cx="${cx - r * 0.55}" cy="${cy + r * 0.35}" r="${r * 0.2}" fill="#e39a86" opacity="0.55"/><circle cx="${cx + r * 0.55}" cy="${cy + r * 0.35}" r="${r * 0.2}" fill="#e39a86" opacity="0.55"/>` +
    b +
    `<path d="M${cx - r * 0.3},${cy + r * 0.62} q${r * 0.3},${r * 0.2} ${r * 0.6},0" stroke="${RED_D}" stroke-width="1.2" fill="none"/>`;
}

/** Fante: a standing page in a short tunic and feathered cap. */
function fante(suit: number): string {
  const p = SUIT_PAL[suit];
  const hose = suit % 2 ? p.trim : p.main;
  const tunic = suit % 2 ? p.main : p.trim === GOLD ? BLUE : p.trim;
  return [
    // legs and shoes
    `<path d="M86,236 L82,288 L93,288 L97,236 Z" fill="${hose}" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M103,236 L107,288 L118,288 L114,236 Z" fill="${hose}" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M76,288 Q80,281 93,284 L94,292 L74,292 Z M106,284 Q120,281 124,288 L126,292 L106,292 Z" fill="${INK}"/>`,
    // tunic
    `<path d="M78,146 Q100,138 122,146 L132,240 Q100,250 68,240 Z" fill="${tunic}" stroke="${INK}" stroke-width="1.6"/>`,
    `<path d="M73,200 L127,200 L128,210 L72,210 Z" fill="${p.trimD}" stroke="${INK}" stroke-width="1.1"/>`,
    `<circle cx="100" cy="205" r="4" fill="${GOLD}" stroke="${INK}"/>`,
    `<path d="M100,148 L100,198" stroke="${p.trimD}" stroke-width="2" stroke-dasharray="3 5"/>`,
    `<path d="M70,238 Q100,248 130,238" stroke="${GOLD}" stroke-width="3" fill="none"/>`,
    // collar
    `<path d="M84,146 Q100,160 116,146 Q100,140 84,146 Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.2"/>`,
    // left arm on hip
    `<path d="M79,150 Q62,175 70,200 Q76,204 82,199 Q76,180 86,160 Z" fill="${tunic}" stroke="${INK}" stroke-width="1.4"/>`,
    `<circle cx="76" cy="201" r="5.5" fill="${FLESH}" stroke="${INK}" stroke-width="1.1"/>`,
    // right arm raised, holding the suit
    `<path d="M120,150 Q142,140 146,116 L137,112 Q134,132 114,142 Z" fill="${tunic}" stroke="${INK}" stroke-width="1.4"/>`,
    `<circle cx="142" cy="111" r="6" fill="${FLESH}" stroke="${INK}" stroke-width="1.1"/>`,
    heldSymbol(suit, 145, suit >= 2 ? 72 : 88, suit >= 2 ? 0.62 : 0.8, suit >= 2 ? 12 : 0),
    // neck and head
    `<rect x="95" y="128" width="10" height="14" fill="${FLESH}" stroke="${INK}" stroke-width="1.1"/>`,
    face(100, 112, 17, false, '#6b3f1f'),
    // cap with feather
    `<path d="M80,102 Q100,82 121,100 Q125,96 127,101 Q101,94 76,104 Z" fill="${p.mainD}" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M118,96 Q140,70 136,58 Q128,78 112,94 Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.1"/>`,
    `<path d="M120,93 Q131,75 134,63" stroke="${p.main}" stroke-width="1.2" fill="none"/>`,
  ].join('');
}

/** Cavallo: a rider on a horse in profile. */
function cavallo(suit: number): string {
  const p = SUIT_PAL[suit];
  const coat = suit % 2 ? p.trim : p.main;
  return [
    // tail
    `<path d="M48,190 Q30,205 34,238 Q42,222 52,206 Z" fill="${p.horseD}" stroke="${INK}" stroke-width="1.3"/>`,
    // far legs
    `<path d="M66,214 L60,268 L68,270 L76,218 Z M126,214 L136,266 L144,265 L134,212 Z" fill="${p.horseD}" stroke="${INK}" stroke-width="1.3"/>`,
    // body
    `<path d="M50,196 Q52,176 84,174 L128,172 Q150,170 154,190 Q156,214 132,220 L72,222 Q48,220 50,196 Z" fill="${p.horse}" stroke="${INK}" stroke-width="1.6"/>`,
    // near legs with hooves
    `<path d="M76,214 L72,274 L82,275 L88,216 Z M140,210 L150,270 L160,268 L150,206 Z" fill="${p.horse}" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M70,272 L84,272 L84,280 L69,280 Z M148,268 L162,266 L163,274 L149,276 Z M58,266 L70,267 L70,274 L57,273 Z M134,263 L146,262 L147,269 L135,270 Z" fill="${INK}"/>`,
    // neck and head
    `<path d="M136,180 Q146,146 160,132 Q170,124 180,132 L186,150 Q182,156 174,152 Q166,166 158,190 Z" fill="${p.horse}" stroke="${INK}" stroke-width="1.6"/>`,
    `<path d="M150,140 Q158,124 166,126 Q156,138 156,150 Z" fill="${p.horseD}" stroke="${INK}" stroke-width="1"/>`,
    `<circle cx="170" cy="138" r="2.2" fill="${INK}"/>`,
    `<path d="M166,128 L170,118 L174,130 Z" fill="${p.horse}" stroke="${INK}" stroke-width="1"/>`,
    // bridle and saddle cloth
    `<path d="M160,134 L182,148 M168,150 L150,176" stroke="${p.trimD}" stroke-width="2" fill="none"/>`,
    `<path d="M84,172 L126,170 L130,208 Q104,214 80,206 Z" fill="${p.main === RED ? BLUE : RED}" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M82,202 Q104,210 129,204" stroke="${GOLD}" stroke-width="3" fill="none"/>`,
    // rider leg
    `<path d="M104,176 L112,214 L120,230 L128,226 L120,210 L118,172 Z" fill="${coat}" stroke="${INK}" stroke-width="1.3"/>`,
    `<path d="M118,228 L132,224 L133,231 L119,234 Z" fill="${INK}"/>`,
    // rider torso
    `<path d="M92,120 Q108,112 122,122 L124,176 Q108,182 94,176 Z" fill="${coat}" stroke="${INK}" stroke-width="1.6"/>`,
    `<path d="M93,150 L124,150 L124,157 L93,157 Z" fill="${p.trimD}" stroke="${INK}" stroke-width="1"/>`,
    // arm holding reins
    `<path d="M118,128 Q136,146 146,150 L144,158 Q130,154 114,140 Z" fill="${coat}" stroke="${INK}" stroke-width="1.3"/>`,
    `<circle cx="147" cy="154" r="5" fill="${FLESH}" stroke="${INK}"/>`,
    // arm raising the suit
    `<path d="M96,126 Q76,110 72,86 L81,84 Q86,104 102,116 Z" fill="${coat}" stroke="${INK}" stroke-width="1.3"/>`,
    `<circle cx="76" cy="83" r="5.5" fill="${FLESH}" stroke="${INK}"/>`,
    heldSymbol(suit, 72, suit >= 2 ? 50 : 60, suit >= 2 ? 0.55 : 0.72, suit >= 2 ? -18 : 0),
    // head and plumed hat
    `<rect x="102" y="100" width="10" height="14" fill="${FLESH}" stroke="${INK}"/>`,
    face(107, 88, 14, false, '#4a2c16'),
    `<path d="M90,80 Q107,62 125,78 L128,82 Q107,76 88,84 Z" fill="${p.mainD}" stroke="${INK}" stroke-width="1.3"/>`,
    `<path d="M108,68 Q98,44 112,36 Q110,54 116,66 Z" fill="${p.trim}" stroke="${INK}" stroke-width="1.1"/>`,
  ].join('');
}

/** Re: a standing king in a long robe, crown and ermine collar. */
function re(suit: number): string {
  const p = SUIT_PAL[suit];
  const robe = p.main, cape = p.trim === GOLD ? BLUE_D : p.trimD;
  const ermine = Array.from({ length: 6 }, (_, i) => `<path d="M${80 + i * 8},${150 + (i % 2) * 3} l1.5,4 l1.5,-4 Z" fill="${INK}"/>`).join('');
  return [
    // cape
    `<path d="M72,146 Q56,220 58,294 L142,294 Q144,220 128,146 Z" fill="${cape}" stroke="${INK}" stroke-width="1.6"/>`,
    // robe
    `<path d="M80,148 Q100,142 120,148 L130,292 L70,292 Z" fill="${robe}" stroke="${INK}" stroke-width="1.6"/>`,
    `<path d="M100,160 L100,292" stroke="${GOLD}" stroke-width="5"/>`,
    `<path d="M100,160 L100,292" stroke="${GOLD_D}" stroke-width="1" stroke-dasharray="2 6"/>`,
    `<path d="M71,282 L129,282" stroke="${GOLD}" stroke-width="4"/>`,
    `<path d="M76,212 L124,212 L125,220 L75,220 Z" fill="${GOLD}" stroke="${INK}" stroke-width="1"/>`,
    // ermine collar
    `<path d="M76,148 Q100,166 124,148 Q124,140 100,142 Q76,140 76,148 Z" fill="${WHITE}" stroke="${INK}" stroke-width="1.3"/>`,
    ermine,
    // arm with sceptre (left)
    `<path d="M80,152 Q64,176 66,204 L76,204 Q76,182 88,164 Z" fill="${robe}" stroke="${INK}" stroke-width="1.3"/>`,
    `<circle cx="71" cy="206" r="6" fill="${FLESH}" stroke="${INK}"/>`,
    `<path d="M71,250 L71,160" stroke="${GOLD_D}" stroke-width="4"/><path d="M71,250 L71,160" stroke="${GOLD}" stroke-width="2"/>`,
    `<circle cx="71" cy="156" r="6" fill="${GOLD}" stroke="${INK}"/><path d="M71,146 l0,-6 M67,143 l8,0" stroke="${INK}" stroke-width="1.5"/>`,
    // arm holding the suit (right)
    `<path d="M120,152 Q138,160 142,182 L133,186 Q128,170 114,164 Z" fill="${robe}" stroke="${INK}" stroke-width="1.3"/>`,
    `<circle cx="138" cy="188" r="6" fill="${FLESH}" stroke="${INK}"/>`,
    heldSymbol(suit, 140, suit >= 2 ? 150 : 176, suit >= 2 ? 0.62 : 0.75, suit >= 2 ? 10 : 0),
    // head, beard, crown
    `<rect x="95" y="124" width="10" height="16" fill="${FLESH}" stroke="${INK}"/>`,
    face(100, 106, 17, true, '#d8d2c4'),
    `<path d="M82,94 L82,70 L90,82 L95,64 L100,80 L105,64 L110,82 L118,70 L118,94 Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.4"/>`,
    `<path d="M82,90 L118,90" stroke="${GOLD_D}" stroke-width="3"/>`,
    `<circle cx="100" cy="90" r="2.6" fill="${RED}" stroke="${INK}" stroke-width="0.6"/><circle cx="90" cy="90" r="2" fill="${BLUE}"/><circle cx="110" cy="90" r="2" fill="${BLUE}"/>`,
  ].join('');
}

// ------------------------------------------------------------------ aces

function ace(suit: number): string {
  const wreath = (r: number) => Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2;
    const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r * 1.45;
    return `<ellipse cx="${f(x)}" cy="${f(y)}" rx="4" ry="9" fill="${GREEN}" stroke="${GREEN_D}" stroke-width="0.8" transform="rotate(${f((a * 180) / Math.PI + 90)} ${f(x)} ${f(y)})"/>`;
  }).join('');
  switch (suit) {
    case 0: return wreath(72) + at(CX, CY, 3.1, 0, coin(true));
    case 1: return wreath(70) + at(CX, CY + 4, 2.6, 0, cup());
    case 2: return wreath(66) + at(CX, CY, 2.05, 0, sword()) + `<path d="M${CX - 34},${CY + 66} q34,20 68,0" stroke="${RED}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    default: return wreath(66) + at(CX, CY, 2.05, 0, club()) + `<path d="M${CX - 34},${CY + 70} q34,20 68,0" stroke="${BLUE}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
}

// ------------------------------------------------------------------ faces and backs

function frame(inner: string, tint: string): string {
  return `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="12" fill="${PAPER}" stroke="${INK}" stroke-width="2.4"/>` +
    `<rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="7" fill="${tint}" stroke="${INK}" stroke-width="1.2"/>` +
    `<rect x="12.5" y="12.5" width="${W - 25}" height="${H - 25}" rx="5" fill="none" stroke="${GOLD_D}" stroke-width="0.8" opacity="0.8"/>` +
    inner;
}

export function cardSvg(c: CardId): string {
  const s = suitOf(c), r = rankOf(c);
  let body: string;
  let tint = '#fbf5e6';
  if (r === 1) body = ace(s);
  else if (r <= 7) {
    const orn = (x: number, y: number) => `<g transform="translate(${x},${y})" opacity="0.75">${[0, 90, 180, 270].map((a) => `<ellipse cx="0" cy="-4.5" rx="2" ry="4" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="0.6" transform="rotate(${a + 45})"/>`).join('')}<circle r="1.8" fill="${RED}"/></g>`;
    body = orn(24, 24) + orn(W - 24, 24) + orn(24, H - 24) + orn(W - 24, H - 24);
    body +=s <= 1 ? roundPips(r, s === 0 ? () => coin() : cup, s === 0 ? (r >= 6 ? 1.3 : r >= 4 ? 1.5 : 1.7) : (r >= 6 ? 1.25 : r >= 4 ? 1.45 : 1.6)) : longPips(r, s === 2 ? sword : club);
  } else {
    tint = SUIT_PAL[s].tint;
    const fig = r === 8 ? fante(s) : r === 9 ? cavallo(s) : re(s);
    body = `<path d="M24,300 L24,64 Q24,26 100,24 Q176,26 176,64 L176,300 Z" fill="${PAPER}" stroke="${GOLD_D}" stroke-width="1.4"/>` +
      `<path d="M24,300 L176,300" stroke="${INK}" stroke-width="1"/>` +
      `<ellipse cx="100" cy="296" rx="62" ry="6" fill="${INK}" opacity="0.12"/>` + fig;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${frame(body, tint)}</svg>`;
}

export const BACKS = [
  { id: 'rosso', name: 'Rosso lattice' },
  { id: 'blu', name: 'Blu medallion' },
  { id: 'verde', name: 'Verde damask' },
  { id: 'sole', name: 'Sole' },
] as const;
export type BackId = (typeof BACKS)[number]['id'];

export function backSvg(id: BackId): string {
  const shell = (fill: string, inner: string, border: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${inner}</defs>` +
    `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="12" fill="${PAPER}" stroke="${INK}" stroke-width="2.4"/>` +
    `<rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="6" fill="${fill}" stroke="${border}" stroke-width="2"/>` +
    `<rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="4" fill="none" stroke="${PAPER}" stroke-width="1.2" opacity="0.7"/>`;
  switch (id) {
    case 'rosso':
      return shell('url(#p)', `<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="20" height="20" fill="${RED}"/><path d="M0,10 L20,10 M10,0 L10,20" stroke="${RED_D}" stroke-width="3"/><circle cx="10" cy="10" r="2.6" fill="${GOLD}"/></pattern>`, RED_D) +
        `<ellipse cx="${CX}" cy="${CY}" rx="40" ry="54" fill="${PAPER}" stroke="${GOLD_D}" stroke-width="2"/><ellipse cx="${CX}" cy="${CY}" rx="31" ry="44" fill="none" stroke="${RED}" stroke-width="2"/>` +
        at(CX, CY, 1.05, 0, coin()) + '</svg>';
    case 'blu': {
      const petals = Array.from({ length: 12 }, (_, i) => `<ellipse cx="${CX}" cy="${CY - 44}" rx="9" ry="26" fill="${PAPER}" stroke="${BLUE_D}" stroke-width="1.2" opacity="0.95" transform="rotate(${i * 30} ${CX} ${CY})"/>`).join('');
      return shell('url(#p)', `<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${BLUE}"/><circle cx="12" cy="12" r="5" fill="none" stroke="#5f86b7" stroke-width="1.4"/><circle cx="0" cy="0" r="2" fill="${GOLD}"/><circle cx="24" cy="24" r="2" fill="${GOLD}"/><circle cx="24" cy="0" r="2" fill="${GOLD}"/><circle cx="0" cy="24" r="2" fill="${GOLD}"/></pattern>`, BLUE_D) +
        petals + `<circle cx="${CX}" cy="${CY}" r="22" fill="${GOLD}" stroke="${INK}" stroke-width="1.5"/><circle cx="${CX}" cy="${CY}" r="10" fill="${RED}" stroke="${INK}"/></svg>`;
    }
    case 'verde':
      return shell('url(#p)', `<pattern id="p" width="28" height="40" patternUnits="userSpaceOnUse"><rect width="28" height="40" fill="${GREEN_D}"/><path d="M14,4 Q24,14 14,20 Q4,14 14,4 Z M14,20 Q24,26 14,36 Q4,26 14,20 Z" fill="${GREEN}" stroke="#6d9a55" stroke-width="1"/><path d="M0,20 L28,20" stroke="#284419" stroke-width="1"/></pattern>`, GREEN_D) +
        `<rect x="${CX - 36}" y="${CY - 52}" width="72" height="104" rx="36" fill="${PAPER}" stroke="${GOLD_D}" stroke-width="2"/>` +
        at(CX - 10, CY, 0.62, -25, club()) + at(CX + 10, CY, 0.62, 25, sword()) + '</svg>';
    case 'sole': {
      const rays = Array.from({ length: 24 }, (_, i) => `<path d="M${CX},${CY - 34} L${CX + 6},${CY - 70} L${CX - 6},${CY - 70} Z" fill="${i % 2 ? GOLD : '#e8bd5c'}" stroke="${GOLD_D}" stroke-width="0.8" transform="rotate(${i * 15} ${CX} ${CY})"/>`).join('');
      return shell('url(#p)', `<pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="${WOOD_D}"/><path d="M0,8 Q4,4 8,8 T16,8" stroke="${WOOD}" stroke-width="1.6" fill="none"/></pattern>`, INK) +
        rays + `<circle cx="${CX}" cy="${CY}" r="34" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/>` +
        `<circle cx="${CX - 11}" cy="${CY - 5}" r="3" fill="${INK}"/><circle cx="${CX + 11}" cy="${CY - 5}" r="3" fill="${INK}"/><path d="M${CX - 12},${CY + 10} q12,10 24,0" stroke="${INK}" stroke-width="2" fill="none"/></svg>`;
    }
  }
}
