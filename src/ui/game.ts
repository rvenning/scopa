import { cardName, valueOf, type CardId } from '../rules/cards.ts';
import { legalOptions, optionEquation, type CaptureOption } from '../rules/capture.ts';
import { FORMAT_INFO, seatCount, sideCount, sideOf } from '../rules/config.ts';
import { isCustom } from '../rules/presets.ts';
import { apply, newMatch, playCommand, type Command, type MatchEvent, type MatchState } from '../engine/match.ts';
import { randomSeed } from '../rules/rng.ts';
import { viewFor } from '../engine/view.ts';
import { requestMove } from '../ai/client.ts';
import { thinkingDelay } from '../ai/policy.ts';
import { personaById } from '../ai/personalities.ts';
import { audio } from '../presentation/audio.ts';
import { backEl, backUrl, cardEl, describeCard, faceUrl, miniImg } from '../presentation/cards.ts';
import { PRESET_TEXT } from '../content/presets.ts';
import { prefersReducedMotion } from '../persistence/settings.ts';
import { clearMatch, saveMatch } from '../persistence/saves.ts';
import { recordHand, recordMatch } from '../persistence/stats.ts';
import { enterSheet, finishAll, flip, flourishIn, gather, snapshot, wait, type AnimCtx } from './anim.ts';
import { chooseView, detectCapabilities, type ViewChoice } from '../presentation/mode.ts';
import { presentationAllowance } from '../presentation/pacing.ts';
import { placements, planFlights, targetsFor, type Pose, type Rect, type Zone } from '../presentation/sceneModel.ts';
import type { Highlight, Table3D } from '../presentation/table3d.ts';

/** Once the 3D table has been too slow on this device, Automatic stays flat for the session. */
let perfDowngraded = false;
/** Test and support override: ?view=2d or ?view=3d. */
const forcedView = (() => { try { const v = new URLSearchParams(location.search).get('view'); return v === '2d' || v === '3d' ? v : null; } catch { return null; } })();
import type { AppCtx, Screen } from './app.ts';
import { announce, caption, h, toast } from './dom.ts';
import { showScore } from './score.ts';
import { pauseMenu } from './menus.ts';

export interface TutorialHooks {
  /** Coach text for the current state, or null to hide. */
  coach(s: MatchState): { text: string; next?: string } | null;
  /** May the human make this move now? Return a reason if not. */
  allow(s: MatchState, card: CardId, o: CaptureOption): string | null;
  /** Scripted move for a non-human seat. */
  scripted(s: MatchState): { card: CardId; option: CaptureOption } | null;
  /** Called when the coach's "next" button is pressed. */
  advance(s: MatchState): MatchState | null;
  onHandEnd(s: MatchState): void;
  skip(): void;
}

interface Selection { card: CardId; options: CaptureOption[]; chosen: number | null; picks: Set<CardId> }

export class GameScreen implements Screen {
  el: HTMLElement;
  private ctx: AppCtx;
  state: MatchState;
  private tut?: TutorialHooks;
  private humans: number[];
  private viewer: number | null = null;
  private anchor: number;
  private sel: Selection | null = null;
  private busy = false;
  private aiToken = 0;
  private destroyed = false;
  private scoreShownFor = -1;
  private showAllHands = false;
  private holdBadges = false;
  private ro: ResizeObserver | null = null;
  private longPressTimer = 0;
  private drag: { card: CardId; x: number; y: number; ghost: HTMLElement | null; el: HTMLElement; moved: boolean } | null = null;
  private infoPop: HTMLElement | null = null;
  private focusInfo = '';
  /** When the last presented move will have been seen (pacing.ts); computer moves and the score sheet wait for it. */
  private settleAt = 0;
  // Presentation: the flat DOM table always exists; the 3D table paints underneath when chosen.
  view: ViewChoice = { view: '2d', reason: 'starting' };
  private t3d: Table3D | null = null;
  private t3dLoading = false;
  private t3dLook = '';
  private zones: Map<CardId, Zone> | null = null;
  private presenting = false;

  // DOM regions
  private bar!: HTMLElement;
  private north!: HTMLElement;
  private west!: HTMLElement;
  private east!: HTMLElement;
  private tableEl!: HTMLElement;
  private meta!: HTMLElement;
  private tray!: HTMLElement;
  private me!: HTMLElement;
  private handEl!: HTMLElement;
  private overlayEl: HTMLElement | null = null;

  constructor(ctx: AppCtx, state: MatchState, opts: { tutorial?: TutorialHooks; resume?: boolean } = {}) {
    this.ctx = ctx;
    this.state = state;
    this.tut = opts.tutorial;
    this.humans = state.setup.seats.map((s, i) => (s.kind === 'human' ? i : -1)).filter((i) => i >= 0);
    this.anchor = this.humans[0] ?? 0;
    this.el = h('div', { class: 'screen table-screen', 'data-table': ctx.settings.table, role: 'application', 'aria-label': 'Scopa table' });
    this.build();
    // The screen resizing re-fits the 3D canvas and places cards at once; the play area or tray
    // changing size (a longer message, a new option row) lets the cards glide to their new places.
    this.ro = new ResizeObserver((entries) => {
      const screen = entries.some((e) => e.target === this.el);
      if (screen) this.layout();
      if (!this.t3d) return;
      if (screen) { this.t3d.resize(); this.sync3d(null, true); } else this.sync3d(null);
    });
    this.ro.observe(this.el);
    this.ro.observe(this.tableEl.parentElement as HTMLElement);
    this.ro.observe(this.tray);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pointerup', this.onGlobalUp);
    window.addEventListener('pointermove', this.onGlobalMove);
    // Restoring a saved match with more than one local human always starts on a privacy screen.
    if (opts.resume && this.humans.length > 1) this.viewer = null;
    else if (this.humans.length === 1) this.viewer = this.humans[0];
    this.render();
    this.applyView();
    queueMicrotask(() => this.step());
  }

  destroy() {
    this.destroyed = true;
    this.aiToken++;
    this.ro?.disconnect();
    this.t3d?.dispose();
    this.t3d = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pointerup', this.onGlobalUp);
    window.removeEventListener('pointermove', this.onGlobalMove);
    finishAll();
  }

  // ---------------------------------------------------------------- 3D table

  /** Choose the flat or 3D table from settings and the device, and switch if needed. Safe to call often. */
  applyView() {
    if (this.destroyed) return;
    const setting = forcedView ?? this.ctx.settings.tableView;
    this.view = chooseView(setting, detectCapabilities(this.reduced), perfDowngraded);
    if (this.view.view === '2d') { this.unmount3d(); return; }
    if (this.t3d) {
      // Look changes (table, back, faces) are applied to the live scene.
      const look = `${this.ctx.settings.table}|${this.ctx.settings.cardBack}|${this.ctx.settings.cardStyle}`;
      if (look !== this.t3dLook) {
        const [table, back, style] = this.t3dLook.split('|');
        if (table !== this.ctx.settings.table) this.t3d.setSurface(this.ctx.settings.table);
        if (back !== this.ctx.settings.cardBack) this.t3d.setBack(backUrl(this.ctx.settings.cardBack));
        if (style !== this.ctx.settings.cardStyle) this.t3d.refreshFaces();
        this.t3dLook = look;
      }
      return;
    }
    if (this.t3dLoading) return;
    this.t3dLoading = true;
    // Three.js arrives in its own chunk, after the table is already playable in 2D.
    import('../presentation/table3d.ts').then((m) => {
      this.t3dLoading = false;
      if (this.destroyed || this.view.view !== '3d' || this.t3d) return;
      try {
        this.t3d = new m.Table3D(this.el, {
          faceUrl: (c) => faceUrl(c),
          backUrl: backUrl(this.ctx.settings.cardBack),
          table: this.ctx.settings.table,
          onFallback: (why) => this.fallback(why),
        });
      } catch (e) { this.fallback(`the 3D table could not start (${(e as Error).message})`); return; }
      this.t3dLook = `${this.ctx.settings.table}|${this.ctx.settings.cardBack}|${this.ctx.settings.cardStyle}`;
      this.el.classList.add('view3d');
      this.layout();
      this.sync3d(null, true);
      this.renderHighlights();
    }).catch(() => { this.t3dLoading = false; this.fallback('the 3D table could not be loaded'); });
  }

  private fallback(why: string) {
    if (/slow/.test(why)) {
      perfDowngraded = true;
      // A player who explicitly chose the 3D table keeps it; Automatic gives way.
      if ((forcedView ?? this.ctx.settings.tableView) === '3d') return;
    }
    this.view = { view: '2d', reason: why };
    this.unmount3d();
  }

  private unmount3d() {
    if (!this.t3d) return;
    this.t3d.dispose();
    this.t3d = null;
    this.zones = null;
    this.el.classList.remove('view3d');
    this.layout();
  }

  private rectOf(el: Element | null): Rect | null {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  }

  /** Measure the DOM table and send every card to where the engine says it is. */
  private sync3d(events: MatchEvent[] | null, jump = false, before?: ReturnType<typeof snapshot>) {
    const t = this.t3d;
    if (!t) return;
    const host = this.el.getBoundingClientRect();
    const rel = (r: Rect | null): Rect | null => (r ? { left: r.left - host.left, top: r.top - host.top, width: r.width, height: r.height } : null);
    const table = new Map<CardId, Rect>();
    this.tableEl.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => { const r = rel(this.rectOf(el)); if (r) table.set(Number(el.dataset.card), r); });
    const cw = parseFloat(getComputedStyle(this.el).getPropertyValue('--cw')) || 64;
    const zones = placements(this.state);
    const targets = targetsFor(zones, {
      table,
      deck: rel(this.rectOf(this.meta.querySelector('.deck'))),
      seat: (seat) => rel(this.rectOf(seat === this.anchor ? this.handEl : this.el.querySelector(`.seat[data-seat="${seat}"]`))),
      pile: (side) => rel(this.rectOf(this.el.querySelector(`.pile-spot[data-side="${side}"]`))),
      cardW: cw,
    }, rel(this.rectOf(this.tableEl.parentElement)) ?? { left: 0, top: 0, width: host.width, height: host.height });
    const prevZones = this.zones;
    this.zones = zones;
    // Cards the player may play next will turn face up in flight: have their faces ready.
    if (this.viewer === this.anchor) t.prepare(this.state.hand.hands[this.anchor]);
    if (jump || !prevZones || this.reduced) { t.flights.jump(targets); return; }
    if (!events) { t.flights.retarget(targets); return; }
    // A card played from the player's own hand starts where its DOM card was.
    const origins = new Map<CardId, Pose>();
    for (const ev of events) {
      if (ev.e !== 'play') continue;
      const r = rel(before?.rects.get(String(ev.card)) ?? null);
      if (r && ev.seat === this.anchor) origins.set(ev.card, { x: r.left + r.width / 2, y: r.top + r.height / 2, z: 30, w: r.width, rot: 0, face: 1, tilt: 0, show: 1 });
    }
    const plan = planFlights(events, prevZones, zones, t.flights.targets, targets, { speed: this.ctx.settings.animationSpeed }, origins);
    t.prepare([...plan].filter(([c, f]) => f.via?.face === 1 || targets.get(c)?.face === 1).map(([c]) => c));
    // The player's own hand is animated in the DOM; those cards need no 3D flight.
    for (const [c, z] of zones) if (z.z === 'hand' && z.seat === this.anchor) plan.delete(c);
    t.flights.retarget(targets, plan, this.ctx.settings.animationSpeed);
  }

  private highlights3d() {
    if (!this.t3d) return;
    const m = new Map<CardId, Highlight>();
    this.tableEl.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
      const c = Number(el.dataset.card);
      const cl = el.classList;
      m.set(c, cl.contains('take') ? 'take' : cl.contains('pick') ? 'pick' : cl.contains('legal') ? 'legal' : cl.contains('dim') ? 'dim' : null);
    });
    this.t3d.setHighlights(m);
  }

  /** Read-only view of the 3D table for the end-to-end suite. */
  get sceneInfo() {
    return { view: this.view.view, reason: this.view.reason, mounted: !!this.t3d, ...(this.t3d?.debug() ?? {}) };
  }

  /** Projected centre of a 3D card, for alignment checks against its DOM box. */
  sceneScreenOf(c: CardId) {
    const p = this.t3d?.screenOf(c);
    if (!p) return null;
    const host = this.el.getBoundingClientRect();
    return { x: p.x + host.left, y: p.y + host.top };
  }

  /** Snap the 3D table to rest (tests; backgrounding). */
  settle3d() { this.t3d?.flights.finish(); }

  // ---------------------------------------------------------------- helpers

  private get rules() { return this.state.setup.rules; }
  private get n() { return seatCount(this.rules); }
  private get reduced() { return prefersReducedMotion(this.ctx.settings); }
  private get animCtx(): AnimCtx { return { reduced: this.reduced, speed: this.ctx.settings.animationSpeed }; }
  private seatName(s: number) { return this.state.setup.seats[s].name; }
  sideName(side: number): string {
    const members = Array.from({ length: this.n }, (_, i) => i).filter((i) => sideOf(this.rules, i) === side);
    return members.map((m) => this.seatName(m)).join(' & ');
  }
  private isHuman(s: number) { return this.state.setup.seats[s].kind === 'human'; }
  private rel(seat: number) { return (seat - this.anchor + this.n) % this.n; }
  private badgesOn() { return this.ctx.settings.valueBadges || this.holdBadges; }

  // ---------------------------------------------------------------- skeleton

  private build() {
    const menuBtn = h('button', { class: 'icon-btn', 'aria-label': 'Menu', onclick: () => this.openMenu() }, '☰');
    const badgeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Hold to show card values', title: 'Hold to show card values' }, '1 – 10');
    const on = () => { this.holdBadges = true; this.renderBadges(); };
    const off = () => { if (this.holdBadges) { this.holdBadges = false; this.renderBadges(); } };
    badgeBtn.addEventListener('pointerdown', on);
    badgeBtn.addEventListener('pointerup', off);
    badgeBtn.addEventListener('pointerleave', off);
    badgeBtn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); on(); } });
    badgeBtn.addEventListener('keyup', off);
    badgeBtn.style.fontSize = '.85rem';
    this.bar = h('div', { class: 'topbar' }, menuBtn, h('div', { class: 'preset' }), badgeBtn, h('div', { class: 'scores', 'aria-label': 'Match score' }));
    this.north = h('div', { class: 'north' });
    this.west = h('div', { class: 'side-seat' });
    this.east = h('div', { class: 'side-seat' });
    this.tableEl = h('div', { class: 'table-cards', role: 'group', 'aria-label': 'Table cards', 'data-empty': 'The table is empty' });
    this.meta = h('div', { class: 'tablemeta' });
    const play = h('div', { class: 'play-area' }, this.tableEl, this.meta);
    this.tray = h('div', { class: 'tray' });
    this.me = h('div', { class: 'me-row' });
    this.handEl = h('div', { class: 'hand', role: 'group', 'aria-label': 'Your hand' });
    this.el.append(this.bar, this.north, h('div', { class: 'felt' }, this.west, play, this.east), this.tray, this.me, this.handEl);
    this.tableEl.addEventListener('click', (e) => { if (e.target === this.tableEl) this.onTableBackground(); });
  }

  // ---------------------------------------------------------------- layout

  private layout() {
    const w = this.el.clientWidth, hgt = this.el.clientHeight;
    if (!w || !hgt) return;
    const landscape = w > hgt * 1.15;
    this.el.classList.toggle('landscape', landscape);
    // In landscape the far seat sits at the top of the play area instead of taking a whole row.
    const play = this.tableEl.parentElement as HTMLElement;
    if (landscape && this.north.parentElement !== play) play.prepend(this.north);
    if (!landscape && this.north.parentElement === play) this.el.insertBefore(this.north, this.coachEl ?? (this.el.querySelector('.felt') as HTMLElement));
    const handN = this.viewer !== null || this.showAllHands ? Math.max(1, this.state.hand.hands[this.anchor]?.length ?? 3) : 3;
    // Hand cards: as large as fits, wrapping into two rows rather than shrinking below a comfortable touch target.
    // Wide screens pad the table into a centred column, so measure the content box, not the element.
    const cs = getComputedStyle(this.el);
    const avail = w - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
    let hw = Math.min(landscape ? 96 : 104, Math.floor(hgt * (landscape ? 0.2 : 0.14)));
    let rows = 1;
    const gap = 0.08;
    const fits = (cw: number, perRow: number) => perRow * cw * (1 + gap) <= avail;
    if (!fits(hw, handN)) {
      const one = Math.floor(avail / (handN * (1 + gap)));
      if (one >= 58) hw = one;
      else { rows = 2; hw = Math.min(hw, Math.floor(avail / (Math.ceil(handN / 2) * (1 + gap)))); }
    }
    // The hand may use at most ~30% of the height, so the table always keeps room. The last term is the
    // headroom (--lift-room in style.css) the selected card rises into, so it never covers the tray.
    const handBudget = hgt * (landscape ? 0.36 : 0.3);
    hw = Math.min(hw, Math.floor(handBudget / (rows * 1.6 + 0.15 * rows + (landscape ? 0.4 : 0.12))));
    hw = Math.max(44, hw);
    this.el.style.setProperty('--hw', `${hw}px`);
    this.handEl.style.flexWrap = rows > 1 ? 'wrap' : 'nowrap';
    // Table cards: the largest width at which every card (plus room for one more) fits the play area.
    // (play is the play area found above)
    // In landscape the deck row floats in the play area's corner and takes no height (see style.css).
    const metaH = getComputedStyle(this.meta).position === 'absolute' ? 0 : this.meta.offsetHeight;
    const pw = play.clientWidth - 24, ph = play.clientHeight - 24 - metaH - (this.north.parentElement === play ? this.north.offsetHeight : 0);
    const count = Math.max(4, this.state.hand.table.length + 1);
    let cw = 96;
    for (; cw > 34; cw -= 2) {
      const g = cw * 0.12;
      const perRow = Math.max(1, Math.floor((pw + g) / (cw + g)));
      const r = Math.ceil(count / perRow);
      // Leave room above the top row for a capturable card, which rises and grows (.card.take), and its group badge.
      if (r * (cw * 1.6 + g) + cw * 0.2 + 10 <= ph) break;
    }
    this.el.style.setProperty('--cw', `${cw}px`);
    this.el.style.setProperty('--mw', `${Math.max(18, Math.min(30, Math.round(cw * 0.42)))}px`);
    // Card sizes may have changed: keep the 3D cards under their DOM boxes.
    if (this.t3d && !this.presenting) this.sync3d(null);
  }

  // ---------------------------------------------------------------- render

  render() {
    const s = this.state;
    const rules = this.rules;
    const t = PRESET_TEXT[rules.preset];
    const pl = this.bar.querySelector('.preset') as HTMLElement;
    pl.replaceChildren(h('span', {}, t.name + (isCustom(rules) ? ' (custom)' : '')), h('small', { style: { display: 'block', fontFamily: 'var(--font-body)', fontWeight: '400', fontSize: '.78rem', opacity: '.85' } }, `${FORMAT_INFO[rules.format].short} · first to ${rules.target} · hand ${s.handNo}`));
    const scores = this.bar.querySelector('.scores') as HTMLElement;
    scores.replaceChildren(...s.scores.map((v, i) => h('span', { 'aria-label': `${this.sideName(i)}: ${v} points` }, `${this.shortSide(i)} `, h('b', {}, String(v)))));

    // Seats around the table.
    this.north.replaceChildren();
    this.west.replaceChildren();
    this.east.replaceChildren();
    const landscape = this.el.classList.contains('landscape');
    // Each side's capture pile rests beside one of its seats (shown in the 3D view; hidden in 2D).
    const mySide = sideOf(this.rules, this.anchor);
    const piled = new Set<number>([mySide]);
    const pileSpot = (side: number) => h('div', { class: 'pile-spot', 'data-side': String(side), 'aria-hidden': 'true' });
    for (let seat = 0; seat < this.n; seat++) {
      if (seat === this.anchor) continue;
      const r = this.rel(seat);
      let pos: 'north' | 'east' | 'west';
      if (this.n === 2) pos = 'north';
      else if (this.n === 3) pos = landscape ? (r === 1 ? 'east' : 'west') : 'north';
      else pos = r === 2 ? 'north' : r === 1 ? 'east' : 'west';
      const side = sideOf(this.rules, seat);
      const panel = this.seatPanel(seat, pos !== 'north');
      // The pile spot is an invisible, absolutely placed child of the panel: measured, never laid out.
      // Side seats' piles lie inward; a far seat's lies outward (left, or right for the right-hand of two).
      if (!piled.has(side)) {
        piled.add(side);
        const at = pos === 'west' ? 'right' : pos === 'east' ? 'left' : this.n === 3 && !landscape && r === 1 ? 'right' : 'left';
        const spot = pileSpot(side);
        spot.classList.add(`at-${at}`);
        panel.append(spot);
      }
      const unit = panel;
      if (pos === 'north') {
        if (this.n === 3 && !landscape) this.north.prepend(unit); // counter-clockwise: right seat shows on the right
        else this.north.append(unit);
      } else (pos === 'east' ? this.east : this.west).append(unit);
    }
    if (this.n === 3 && !landscape) this.north.replaceChildren(...[...this.north.children].reverse());

    // Table.
    this.keepFocus(() => this.tableEl.replaceChildren(...s.hand.table.map((c) => this.tableCard(c))));
    this.tableEl.classList.toggle('empty', s.hand.table.length === 0);
    const deck = h('div', { class: 'deck', 'aria-hidden': 'true' }, ...(s.hand.deck.length ? [0, 1, 2].slice(0, Math.min(3, Math.ceil(s.hand.deck.length / 6))).map(() => miniImg('back', this.ctx.settings.cardBack)) : []));
    this.meta.replaceChildren(deck, h('span', { 'aria-label': `${s.hand.deck.length} cards left to deal` }, s.hand.deck.length ? `${s.hand.deck.length} to deal` : 'Last deal'));
    // The player's own pile rests in the lower-right corner of the table, nearest them.
    const play = this.tableEl.parentElement as HTMLElement;
    play.querySelector(':scope > .pile-spot')?.remove();
    play.append(pileSpot(mySide));

    // Bottom seat strip and hand.
    this.me.replaceChildren(this.meStrip());
    this.renderHand();
    this.renderTray();
    this.layout();
    this.renderBadges();
    this.renderHighlights();
    if (!this.presenting) this.sync3d(null);
  }

  private shortSide(i: number) {
    const nm = this.sideName(i);
    return nm.split(' & ').map((x) => x.split(' ').pop()!.slice(0, 7)).join(' & ');
  }

  private avatar(seat: number): HTMLElement {
    const cfg = this.state.setup.seats[seat];
    if (cfg.kind === 'ai') {
      const p = personaById(cfg.persona);
      const pats = ['repeating-linear-gradient(45deg,#fff 0 3px,transparent 3px 8px)', 'radial-gradient(circle,#fff 1.5px,transparent 2px) 0 0/7px 7px', 'repeating-linear-gradient(0deg,#fff 0 2px,transparent 2px 7px)', 'repeating-linear-gradient(90deg,#fff 0 2px,transparent 2px 7px)', 'repeating-linear-gradient(-45deg,#fff 0 3px,transparent 3px 8px)', 'repeating-conic-gradient(#fff 0 25%,transparent 0 50%) 0 0/10px 10px', 'radial-gradient(circle at 50% 120%,#fff 30%,transparent 31%)', 'linear-gradient(#fff 0 0) 50% 50%/100% 3px no-repeat'];
      return h('div', { class: 'avatar', style: { background: p.color }, 'aria-hidden': 'true' }, h('div', { class: 'pat', style: { background: pats[p.pattern % pats.length] } }), h('span', {}, p.initials));
    }
    const initials = cfg.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'P';
    return h('div', { class: 'avatar', style: { background: '#5b4a3a' }, 'aria-hidden': 'true' }, h('span', {}, initials));
  }

  private seatMeta(seat: number, compact = false): HTMLElement[] {
    const s = this.state;
    const side = sideOf(this.rules, seat);
    const out: HTMLElement[] = [];
    if (seat === s.dealer) out.push(h('span', { class: 'chip dealer', title: 'Dealer' }, compact ? 'D' : 'Dealer'));
    if (this.rules.format === '4t' && !compact) out.push(h('span', { class: 'chip team' }, side === sideOf(this.rules, this.anchor) ? 'Partner' : 'Opponent'));
    const pile = s.hand.captures[side].length;
    out.push(h('span', { class: 'chip', title: 'Cards captured by this side' }, `▤ ${pile}`));
    const sc = s.hand.scope[side];
    if (sc) out.push(h('span', { class: 'chip', 'aria-label': `${sc} scop${sc === 1 ? 'a' : 'e'} this hand` }, h('span', { class: 'scopa-marks', 'aria-hidden': 'true' }, ...Array.from({ length: Math.min(sc, 6) }, () => h('i'))), sc > 6 ? `×${sc}` : ''));
    return out;
  }

  private seatPanel(seat: number, vertical: boolean): HTMLElement {
    const s = this.state;
    const cfg = s.setup.seats[seat];
    const turn = s.phase === 'play' && s.hand.turn === seat;
    const handN = s.hand.hands[seat].length;
    const lvl = cfg.kind === 'ai' ? ({ relaxed: 'Relaxed', standard: 'Standard', expert: 'Expert' } as const)[cfg.level ?? 'standard'] : 'Player';
    const revealed = s.hand.revealed[seat];
    const minis = this.showAllHands
      ? h('div', { class: 'minis' }, ...s.hand.hands[seat].map((c) => miniImg(c, this.ctx.settings.cardBack)))
      : handN <= 3 && !vertical
        ? h('div', { class: 'minis', 'aria-hidden': 'true' }, ...Array.from({ length: handN }, () => miniImg('back', this.ctx.settings.cardBack)))
        : h('span', { class: 'chip', 'aria-hidden': 'true' }, `${handN} in hand`);
    const panel = h('div', {
      class: `seat${turn ? ' turn' : ''}${vertical ? ' vertical' : ''}`,
      'data-seat': String(seat),
      role: 'group',
      'aria-label': `${cfg.name}, ${lvl}${seat === s.dealer ? ', dealer' : ''}, ${handN} cards in hand${turn ? ', to play' : ''}`,
    },
    this.avatar(seat),
    h('div', { class: 'who' }, h('div', { class: 'nm' }, cfg.name), h('div', { class: 'meta' }, vertical ? null : h('span', {}, lvl), ...this.seatMeta(seat, vertical)), minis,
      revealed.length ? h('div', { class: 'revealed', 'aria-label': `Declared cards: ${revealed.map(cardName).join(', ')}` }, ...revealed.map((c) => miniImg(c, this.ctx.settings.cardBack))) : null));
    return panel;
  }

  private meStrip(): HTMLElement {
    const s = this.state;
    const seat = this.anchor;
    const cfg = s.setup.seats[seat];
    const turn = s.phase === 'play' && s.hand.turn === seat;
    return h('div', { class: `seat me${turn ? ' turn' : ''}`, 'data-seat': String(seat), style: { margin: '0 auto', width: 'fit-content', padding: '2px 10px' } },
      h('div', { class: 'nm' }, cfg.name + (cfg.kind === 'ai' ? ` (${cfg.level})` : '')), h('div', { class: 'meta' }, ...this.seatMeta(seat)));
  }

  private tableCard(c: CardId): HTMLElement {
    const el = cardEl(c, { badge: this.badgesOn(), label: cardName(c) });
    el.addEventListener('click', () => this.onTableCard(c));
    this.attachInfo(el, c);
    return el;
  }

  /** Re-rendering replaces elements; keep keyboard focus on the same card (or the hand) across it. */
  private keepFocus(fn: () => void) {
    const a = document.activeElement as HTMLElement | null;
    const card = a?.dataset?.card;
    const inHand = !!a && this.handEl.contains(a), inTable = !!a && this.tableEl.contains(a);
    fn();
    if (card === undefined || !(inHand || inTable)) return;
    const region = inHand ? this.handEl : this.tableEl;
    const el = region.querySelector<HTMLElement>(`[data-card="${card}"]`) ?? this.handEl.querySelector<HTMLElement>('button.card[data-card]');
    el?.focus({ preventScroll: true });
  }

  private renderHand() {
    this.keepFocus(() => this.renderHandInner());
  }

  private renderHandInner() {
    const s = this.state;
    const seat = this.anchor;
    const visible = (this.viewer === seat && !this.overlayEl) || this.showAllHands;
    const hand = s.hand.hands[seat];
    this.handEl.classList.toggle('hidden-hand', !visible);
    this.handEl.setAttribute('aria-label', visible ? `${this.seatName(seat)}’s hand` : `${this.seatName(seat)}’s hand, hidden`);
    if (!visible) {
      this.handEl.replaceChildren(...hand.map(() => backEl(this.ctx.settings.cardBack, 'Hidden card')));
      return;
    }
    this.handEl.replaceChildren(...hand.map((c) => {
      const el = cardEl(c, { badge: this.badgesOn(), label: cardName(c) });
      if (this.sel?.card === c) { el.classList.add('selected'); el.setAttribute('aria-pressed', 'true'); } else el.setAttribute('aria-pressed', 'false');
      el.addEventListener('pointerdown', (e) => this.onHandDown(e, c, el));
      el.addEventListener('click', (e) => { e.preventDefault(); if (e.detail === 0) this.onHandCard(c); });
      el.addEventListener('keydown', (e) => this.onHandKey(e, c));
      this.attachInfo(el, c);
      return el;
    }));
  }

  private renderBadges() {
    const on = this.badgesOn();
    this.el.classList.toggle('hc', this.ctx.settings.highContrastBadges);
    this.el.querySelectorAll<HTMLElement>('.card[data-card]').forEach((el) => {
      const has = el.querySelector('.vb');
      if (on && !has) { const b = h('span', { class: 'vb', 'aria-hidden': 'true' }, String(valueOf(Number(el.dataset.card)))); el.appendChild(b); }
      if (!on && has) has.remove();
    });
  }

  /** Highlight legal captures for the current selection. */
  private renderHighlights() {
    const sel = this.sel;
    const cards = [...this.tableEl.querySelectorAll<HTMLElement>('.card')];
    for (const el of cards) {
      el.classList.remove('legal', 'take', 'dim', 'pick');
      el.querySelector('.groups')?.remove();
    }
    if (!sel) { this.highlights3d(); return; }
    const hl = this.ctx.settings.legalHighlights;
    const opt = sel.chosen !== null ? sel.options[sel.chosen] : null;
    for (const el of cards) {
      const c = Number(el.dataset.card);
      if (opt) {
        if (opt.takes.includes(c)) el.classList.add('take'); else el.classList.add('dim');
      } else if (hl) {
        const groups = sel.options.map((o, i) => (o.takes.includes(c) ? i + 1 : 0)).filter(Boolean);
        if (groups.length) {
          el.classList.add('legal');
          if (sel.options.filter((o) => o.takes.length).length > 1) el.append(h('span', { class: 'groups', 'aria-hidden': 'true' }, ...groups.map((g) => h('b', {}, String(g)))));
        }
      } else if (sel.picks.has(c)) el.classList.add('pick');
    }
    this.highlights3d();
  }

  private renderTray() {
    const s = this.state;
    const tray = this.tray;
    tray.replaceChildren();
    const msg = h('div', { class: 'msg', id: 'tray-msg' });
    tray.append(msg);
    if (s.phase !== 'play') { msg.textContent = 'Hand over'; return; }
    const turn = s.hand.turn;
    const mine = this.viewer === turn && this.isHuman(turn);
    if (!mine) {
      msg.textContent = this.isHuman(turn) ? `${this.seatName(turn)} to play` : `${this.seatName(turn)} is thinking…`;
      if (this.focusInfo) msg.textContent = this.focusInfo;
      return;
    }
    const sel = this.sel;
    if (!sel) {
      msg.textContent = this.focusInfo || 'Your turn — choose a card';
      return;
    }
    const hl = this.ctx.settings.legalHighlights;
    const opts = h('div', { class: 'opts' });
    const card = sel.card;
    const nCaps = sel.options.filter((o) => o.kind !== 'place').length;
    if (sel.chosen !== null) {
      const o = sel.options[sel.chosen];
      msg.textContent = this.optionSentence(card, o);
      opts.append(
        h('button', { class: 'btn small', onclick: () => this.cancel() }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => this.commit(card, o), 'aria-describedby': 'tray-msg' }, o.kind === 'place' ? 'Place card' : 'Confirm capture'),
      );
    } else if (hl) {
      msg.textContent = nCaps === 0 ? `${cardName(card)}: ${optionEquation(this.rules, card, sel.options[0])}.` : nCaps === 1 && sel.options.length === 1 ? `${cardName(card)} can make one capture.` : `${cardName(card)} can capture in ${nCaps} ways. Choose one.`;
      sel.options.forEach((o, i) => {
        const label = o.kind === 'place' ? 'Place on table' : o.kind === 'aceSelf' ? 'Ace takes itself' : o.kind === 'aceSweep' ? 'Take the whole table' : `Take ${[...o.takes].sort((a, b) => valueOf(a) - valueOf(b)).map((c) => valueLabel(c)).join(' + ')}`;
        opts.append(h('button', { class: 'btn small opt-btn', 'aria-label': `Option ${i + 1}: ${this.optionSentence(card, o)}`, onclick: () => this.choose(i) },
          sel.options.length > 1 ? h('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)) : null, o.kind !== 'place' && o.kind !== 'aceSweep' && o.kind !== 'aceSelf' ? h('span', { class: 'equation' }, optionEquation(this.rules, card, o)) : label));
      });
      opts.append(h('button', { class: 'btn small ghost', onclick: () => this.cancel() }, 'Cancel'));
    } else {
      msg.textContent = sel.picks.size ? `Selected: ${[...sel.picks].map((c) => valueLabel(c)).join(' + ')}` : 'Tap the table cards to capture, or play the card as it is.';
      opts.append(h('button', { class: 'btn small ghost', onclick: () => this.cancel() }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => this.playPicks() }, sel.picks.size ? 'Capture' : 'Play card'));
    }
    tray.append(opts);
    this.layout();
  }

  private optionSentence(card: CardId, o: CaptureOption): string {
    switch (o.kind) {
      case 'place': return `${cardName(card)} will be placed on the table.`;
      case 'aceSweep': return `${cardName(card)} takes the whole table: ${o.takes.map(cardName).join(', ')}.`;
      case 'aceSelf': return `${cardName(card)} takes itself; the table stays empty.`;
      default: return `${cardName(card)} takes ${o.takes.map(cardName).join(' and ')} (${optionEquation(this.rules, card, o)}).`;
    }
  }

  // ---------------------------------------------------------------- card info (long press / focus)

  private attachInfo(el: HTMLElement, c: CardId) {
    el.addEventListener('focus', () => { this.focusInfo = describeCard(c, this.rules.scoring.primieraFigures); if (!this.sel) (this.tray.querySelector('.msg') as HTMLElement | null)?.replaceChildren(this.focusInfo); el.setAttribute('aria-description', this.focusInfo); });
    el.addEventListener('blur', () => { this.focusInfo = ''; });
    el.addEventListener('pointerdown', (e) => {
      window.clearTimeout(this.longPressTimer);
      const x = e.clientX, y = e.clientY;
      this.longPressTimer = window.setTimeout(() => this.showInfo(c, x, y), 520);
    });
    el.addEventListener('pointerup', () => window.clearTimeout(this.longPressTimer));
    el.addEventListener('pointercancel', () => window.clearTimeout(this.longPressTimer));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private showInfo(c: CardId, x: number, y: number) {
    this.hideInfo();
    if (this.drag?.moved) return;
    const pop = h('div', { class: 'info-pop', role: 'tooltip' }, h('b', {}, cardName(c)), h('div', {}, describeCard(c, this.rules.scoring.primieraFigures).replace(/^[^.]*\(/, '(')));
    document.body.append(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2))}px`;
    pop.style.top = `${Math.max(8, y - r.height - 24)}px`;
    this.infoPop = pop;
    this.suppressClick = true;
    window.setTimeout(() => this.hideInfo(), 2600);
  }
  private suppressClick = false;
  private hideInfo() { this.infoPop?.remove(); this.infoPop = null; }

  // ---------------------------------------------------------------- input

  private canAct(): boolean {
    const s = this.state;
    return !this.busy && !this.overlayEl && s.phase === 'play' && this.isHuman(s.hand.turn) && this.viewer === s.hand.turn;
  }

  private onHandDown(e: PointerEvent, c: CardId, el: HTMLElement) {
    if (!this.canAct() || e.button > 0) return;
    this.drag = { card: c, x: e.clientX, y: e.clientY, ghost: null, el, moved: false };
  }

  private onGlobalMove = (e: PointerEvent) => {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 12) return;
    if (!d.moved) {
      d.moved = true;
      window.clearTimeout(this.longPressTimer);
      const r = d.el.getBoundingClientRect();
      const g = h('div', { class: 'fly', style: { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, opacity: '.9' } }, h('img', { src: faceUrl(d.card), alt: '' }));
      document.body.append(g);
      d.ghost = g;
      d.el.style.opacity = '.3';
    }
    if (d.ghost) d.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(${Math.max(-8, Math.min(8, dx / 20))}deg)`;
    const over = this.overTable(e.clientX, e.clientY);
    this.tableEl.classList.toggle('drop-hover', over);
  };

  private onGlobalUp = (e: PointerEvent) => {
    const d = this.drag;
    this.drag = null;
    window.clearTimeout(this.longPressTimer);
    if (!d) return;
    if (!d.moved) {
      // A tap: commit happens on release, never on press.
      if (this.suppressClick) { this.suppressClick = false; return; }
      this.onHandCard(d.card);
      return;
    }
    d.ghost?.remove();
    d.el.style.opacity = '';
    this.tableEl.classList.remove('drop-hover');
    if (!this.overTable(e.clientX, e.clientY) || !this.canAct()) return;
    // Dropped on the table: unambiguous drops play; otherwise the options are offered.
    const options = legalOptions(this.rules, this.state.hand.table, d.card);
    const target = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.card && this.tableEl.contains(n)) as HTMLElement | undefined;
    let idx: number | null = null;
    if (options.length === 1) idx = 0;
    else if (target) {
      const tc = Number(target.dataset.card);
      const hits = options.map((o, i) => (o.takes.includes(tc) ? i : -1)).filter((i) => i >= 0);
      if (hits.length === 1) idx = hits[0];
    }
    this.select(d.card);
    if (idx !== null) this.choose(idx);
  };

  private overTable(x: number, y: number): boolean {
    const r = (this.tableEl.parentElement as HTMLElement).getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  private onHandKey(e: KeyboardEvent, c: CardId) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const btns = [...this.handEl.querySelectorAll<HTMLElement>('.card')];
      const i = btns.findIndex((b) => Number(b.dataset.card) === c);
      btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length]?.focus();
      e.preventDefault();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.onHandCard(c);
    }
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (this.sel) { this.cancel(); e.preventDefault(); }
    } else if (e.key === 'v' || e.key === 'V') {
      if (!this.holdBadges && !(e.target instanceof HTMLInputElement)) { this.holdBadges = true; this.renderBadges(); window.addEventListener('keyup', () => { this.holdBadges = false; this.renderBadges(); }, { once: true }); }
    } else if (/^[1-9]$/.test(e.key) && this.sel && this.ctx.settings.legalHighlights) {
      const i = Number(e.key) - 1;
      if (i < this.sel.options.length) this.choose(i);
    }
  }

  private onHandCard(c: CardId) {
    if (!this.canAct()) {
      if (this.state.phase === 'play' && !this.busy && !this.isHuman(this.state.hand.turn)) toast(`Wait for ${this.seatName(this.state.hand.turn)} to play.`);
      return;
    }
    if (this.sel?.card === c) {
      // Tapping the selected card again plays it when there is only one thing it can do.
      if (this.sel.options.length === 1 && this.sel.chosen === null) this.choose(0);
      else this.cancel();
      return;
    }
    this.select(c);
  }

  private select(c: CardId) {
    const options = legalOptions(this.rules, this.state.hand.table, c);
    this.sel = { card: c, options, chosen: null, picks: new Set() };
    audio.play('select', false);
    this.renderHand();
    this.renderTray();
    this.renderHighlights();
    const caps = options.filter((o) => o.kind !== 'place');
    const hl = this.ctx.settings.legalHighlights;
    announce(`${cardName(c)} selected. ${!hl ? 'Choose table cards to capture, then play.' : caps.length === 0 ? 'No capture; it will be placed on the table.' : `${caps.length} legal capture${caps.length > 1 ? 's' : ''}: ${options.map((o, i) => `${i + 1}, ${this.optionSentence(c, o)}`).join(' ')}`}`);
  }

  private choose(i: number) {
    const sel = this.sel;
    if (!sel || !this.canAct()) return;
    const o = sel.options[i];
    if (this.ctx.settings.confirmMoves) {
      sel.chosen = i;
      this.renderTray();
      this.renderHighlights();
      announce(`Preview: ${this.optionSentence(sel.card, o)} Confirm or cancel.`);
      (this.tray.querySelector('.btn.primary') as HTMLElement | null)?.focus();
    } else this.commit(sel.card, o);
  }

  private onTableCard(c: CardId) {
    if (this.suppressClick) { this.suppressClick = false; return; } // the click that ends a long press
    const sel = this.sel;
    if (!sel || !this.canAct()) {
      return;
    }
    if (!this.ctx.settings.legalHighlights) {
      if (sel.picks.has(c)) sel.picks.delete(c); else sel.picks.add(c);
      this.renderTray();
      this.renderHighlights();
      return;
    }
    const hits = sel.options.map((o, i) => (o.takes.includes(c) ? i : -1)).filter((i) => i >= 0);
    if (!hits.length) { toast('That card is not part of any capture for this card.'); audio.play('error', this.ctx.settings.captions); return; }
    // Several groups share this card: cycle through them.
    const cur = sel.chosen !== null ? hits.indexOf(sel.chosen) : -1;
    const next = hits[(cur + 1) % hits.length];
    if (hits.length > 1 || this.ctx.settings.confirmMoves) {
      sel.chosen = next;
      this.renderTray();
      this.renderHighlights();
      announce(`Preview: ${this.optionSentence(sel.card, sel.options[next])}`);
    } else this.choose(next);
  }

  private onTableBackground() {
    const sel = this.sel;
    if (!sel || !this.canAct()) return;
    if (sel.options.length === 1 && sel.options[0].kind === 'place') this.choose(0);
  }

  private playPicks() {
    const sel = this.sel;
    if (!sel) return;
    const want = [...sel.picks].sort((a, b) => a - b);
    const match = sel.options.find((o) => o.takes.length === want.length && o.takes.every((c, i) => c === want[i]));
    if (match) return this.chooseOption(match);
    // Explain the rule, never the strategy.
    const caps = sel.options.filter((o) => o.kind !== 'place');
    let why: string;
    if (!want.length && caps.length) why = `${cardName(sel.card)} can capture, and capturing is compulsory. Choose the cards it takes.`;
    else if (want.length && !caps.length) why = `${cardName(sel.card)} cannot capture anything here; it can only be placed.`;
    else {
      const sum = want.reduce((t, c) => t + valueOf(c), 0);
      if (this.rules.capture.mode === 'fifteen') why = `Those cards and your ${valueOf(sel.card)} make ${sum + valueOf(sel.card)}, not 15.`;
      else if (sum !== valueOf(sel.card)) why = `Those cards add up to ${sum}, but your card is worth ${valueOf(sel.card)}.`;
      else why = 'That is not a legal capture: a single card of the same value must be taken instead of a sum.';
    }
    toast(why, 3600);
    announce(why);
    audio.play('error', this.ctx.settings.captions);
  }

  private chooseOption(o: CaptureOption) {
    const sel = this.sel;
    if (!sel) return;
    const i = sel.options.indexOf(o);
    this.choose(i);
  }

  private cancel() {
    this.sel = null;
    this.renderHand();
    this.renderTray();
    this.renderHighlights();
    announce('Selection cancelled.');
  }

  private commit(card: CardId, o: CaptureOption) {
    if (!this.canAct()) return;
    const seat = this.state.hand.turn;
    if (this.tut) {
      const why = this.tut.allow(this.state, card, o);
      if (why) { toast(why, 3200); announce(why); return; }
    }
    this.sel = null;
    // Pass-and-play: the hand is hidden as soon as the move is committed.
    if (this.humans.length > 1) this.viewer = null;
    void this.submit(playCommand(this.state, seat, card, o.kind, o.takes));
  }

  // ---------------------------------------------------------------- engine plumbing

  private async submit(cmd: Command) {
    if (this.busy || this.destroyed) return;
    this.busy = true;
    try {
      const before = snapshot(this.el);
      const r = apply(this.state, cmd);
      if (!r.ok) {
        toast(r.error);
        this.render();
        return;
      }
      this.state = r.state;
      if (!this.tut) saveMatch(this.state, this.ctx.build.version);
      this.present(r.events, before);
    } finally {
      this.busy = false;
    }
    if (!this.destroyed) this.step();
  }

  /** Render the new state, then animate and narrate what happened. */
  private present(events: MatchEvent[], before: ReturnType<typeof snapshot>) {
    const captions = this.ctx.settings.captions;
    const ctx = this.animCtx;
    const deckRect = this.meta.querySelector('.deck')?.getBoundingClientRect() ?? null;
    const seatRect = (seat: number | null) => {
      if (seat === null) return null;
      const el = seat === this.anchor ? this.me : this.el.querySelector(`.seat[data-seat="${seat}"]`);
      return el?.getBoundingClientRect() ?? null;
    };
    // Cards that leave the DOM (captured) fly to the capturing seat.
    const flights: { src: string; rect: DOMRect }[] = [];
    let flightTarget: DOMRect | null = null;
    let playedFrom: { card: CardId; rect: DOMRect | null } | null = null;
    let scopa = false;
    const lines: string[] = [];
    for (const ev of events) {
      if (ev.e === 'play') {
        const who = this.seatName(ev.seat);
        const o = ev.option;
        playedFrom = { card: ev.card, rect: before.rects.get(String(ev.card)) ?? seatRect(ev.seat) };
        if (o.kind === 'place') lines.push(`${who} places ${cardName(ev.card)}.`);
        else if (o.kind === 'aceSelf') lines.push(`${who} plays ${cardName(ev.card)}, which takes itself.`);
        else lines.push(`${who} plays ${cardName(ev.card)} and takes ${o.takes.map(cardName).join(', ')}.`);
        if (o.kind !== 'place') {
          flightTarget = seatRect(ev.seat);
          for (const c of [...o.takes]) { const rc = before.rects.get(String(c)); if (rc) flights.push({ src: faceUrl(c), rect: rc }); }
        }
        if (ev.scopa) { scopa = true; lines.push(`Scopa for ${this.sideName(sideOf(this.rules, ev.seat))}!`); }
      } else if (ev.e === 'redeal') {
        lines.push(ev.reason === 'kings' ? 'Three Kings were dealt face up, so the cards were dealt again.' : 'Aces were dealt face up, so the cards were dealt again.');
      } else if (ev.e === 'dealerBonus') {
        lines.push(`The table totals ${ev.points === 2 ? 30 : 15}: ${this.seatName(ev.seat)}, the dealer, takes it for ${ev.points} scop${ev.points === 1 ? 'a' : 'e'}.`);
      } else if (ev.e === 'declare') {
        lines.push(`${this.seatName(ev.seat)} declares ${ev.decl.kind === 'decino' ? 'three of a kind' : 'a hand of 9 or less'} for ${ev.decl.points}: ${ev.decl.cards.map(cardName).join(', ')}.`);
      } else if (ev.e === 'lastTake' && ev.cards.length) {
        lines.push(ev.seat === null ? 'Nobody captured this hand; the table cards are not counted.' : `The last ${ev.cards.length} table card${ev.cards.length > 1 ? 's go' : ' goes'} to ${this.sideName(sideOf(this.rules, ev.seat))}, who captured last.`);
        for (const c of ev.cards) { const rc = before.rects.get(String(c)); if (rc) flights.push({ src: faceUrl(c), rect: rc }); }
        flightTarget = seatRect(ev.seat);
      } else if (ev.e === 'newHand') {
        lines.push(`Hand ${ev.handNo}. ${this.seatName(ev.dealer)} deals.`);
      }
    }
    const dealt = events.some((e) => e.e === 'deal');
    const newHand = events.some((e) => e.e === 'newHand');
    this.presenting = true;
    try { this.render(); } finally { this.presenting = false; }
    this.sync3d(events, false, before);
    // Pace the next computer move and the score sheet from the events alone, never from animation.
    this.settleAt = performance.now() + presentationAllowance(events, { reduced: this.reduced, speed: this.ctx.settings.animationSpeed });
    // The played card itself joins the flight if it was a capture.
    const playEv = events.find((e) => e.e === 'play') as Extract<MatchEvent, { e: 'play' }> | undefined;
    if (playEv && playEv.option.kind !== 'place' && playedFrom?.rect) flights.unshift({ src: faceUrl(playEv.card), rect: playedFrom.rect });
    const origin = (id: string) => {
      const c = Number(id);
      if (playedFrom && c === playedFrom.card) return playedFrom.rect;
      return dealt ? deckRect : null;
    };
    // Card sounds sit a little left or right, following where the card is on the table.
    const panAt = (r: DOMRect | null | undefined) => (r ? ((r.left + r.width / 2) / Math.max(1, innerWidth)) * 2 - 1 : 0);
    const dealtCount = events.filter((e): e is Extract<MatchEvent, { e: 'deal' }> => e.e === 'deal').reduce((t, e) => t + e.counts.reduce((a, b) => a + b, 0) + e.table.length, 0);
    if (newHand) audio.play('shuffle', captions, { pan: panAt(deckRect) });
    if (dealt) window.setTimeout(() => audio.play('deal', captions && !newHand, { pan: panAt(deckRect), count: dealtCount }), newHand ? 700 / this.ctx.settings.animationSpeed : 0);
    if (playEv) {
      const landing = this.tableEl.querySelector(`[data-card="${playEv.card}"]`)?.getBoundingClientRect() ?? playedFrom?.rect;
      audio.play(playEv.option.kind === 'place' ? 'place' : 'gather', captions, { pan: panAt(playEv.option.kind === 'place' ? landing : flightTarget ?? playedFrom?.rect) });
    }
    if (this.t3d) {
      // The 3D table flies the table cards; only the player's own hand moves in the DOM.
      void flip(this.handEl, before, ctx, origin);
    } else {
      void (async () => {
        await flip(this.el, before, ctx, origin);
        // show the capture on the table for a beat before gathering
        if (flights.length) await gather(flights, flightTarget, ctx, 120);
      })();
    }
    if (scopa) this.flourish();
    if (lines.length) {
      announce(lines.join(' '));
      if (events.some((e) => e.e === 'declare' || e.e === 'dealerBonus' || e.e === 'redeal')) toast(lines.filter((l) => /declares|dealer|dealt again/.test(l)).join(' '), 3600);
    }
    // Input is never held up by animation: the state is already committed and rendered.
  }

  private flourish() {
    audio.play('scopa', this.ctx.settings.captions);
    const f = h('div', { class: 'scopa-flourish', 'aria-hidden': 'true' }, 'Scopa!');
    this.el.append(f);
    void flourishIn(f, this.ctx.settings.animationSpeed).finally(() => f.remove());
    if (this.ctx.settings.captions) caption('Scopa!');
  }

  // ---------------------------------------------------------------- flow

  private step() {
    if (this.destroyed || this.busy || this.overlayEl) return;
    const s = this.state;
    if (this.tut) {
      const c = this.tut.coach(s);
      this.renderCoach(c);
    }
    if (s.phase === 'handEnd' || s.phase === 'matchEnd') {
      if (this.scoreShownFor === s.history.length) return;
      this.scoreShownFor = s.history.length;
      void this.showHandScore();
      return;
    }
    const turn = s.hand.turn;
    if (this.isHuman(turn)) {
      if (this.humans.length > 1 && this.viewer !== turn) { this.showHandoff(turn); return; }
      this.viewer = turn;
      this.anchor = turn;
      this.render();
      audio.play('turn', false);
      announce(`Your turn, ${this.seatName(turn)}. Your hand: ${s.hand.hands[turn].map(cardName).join(', ')}. Table: ${s.hand.table.length ? s.hand.table.map(cardName).join(', ') : 'empty'}.`);
      return;
    }
    void this.aiTurn();
  }

  private async aiTurn() {
    const token = ++this.aiToken;
    const s = this.state;
    const seat = s.hand.turn;
    const cfg = s.setup.seats[seat];
    const view = viewFor(s, seat);
    let move: { card: CardId; option: CaptureOption } | null = this.tut?.scripted(s) ?? null;
    const delay = thinkingDelay(cfg.level ?? 'standard', cfg.persona, view) * this.ctx.settings.aiSpeed;
    const started = performance.now();
    if (!move) move = await requestMove(view, cfg.level ?? 'standard', cfg.persona);
    // Wait for the thinking pause and for the last move to have been seen: both are fixed
    // durations (pacing.ts), so animation can neither hold nor hurry the computer.
    const left = Math.max(started + delay, this.settleAt) - performance.now();
    if (left > 0) await wait(left);
    if (token !== this.aiToken || this.destroyed || this.state !== s || this.overlayEl) return;
    await this.submit(playCommand(s, seat, move.card, move.option.kind, move.option.takes));
  }

  private showHandoff(seat: number) {
    this.viewer = null;
    this.sel = null;
    this.render();
    const go = h('button', { class: 'btn primary', onclick: () => close() }, 'Tap when ready');
    const ov = h('div', { class: 'overlay solid', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ho-t' },
      h('div', { class: 'sheet handoff' }, h('p', { class: 'muted' }, 'Hands are hidden'), h('h2', { id: 'ho-t' }, `Pass to ${this.seatName(seat)}`), h('p', {}, 'Only they should look at the screen now.'), go));
    const close = () => {
      ov.remove();
      this.overlayEl = null;
      this.viewer = seat;
      this.anchor = seat;
      this.step();
    };
    this.overlayEl = ov;
    this.el.append(ov);
    enterSheet(ov);
    go.focus();
    announce(`Pass to ${this.seatName(seat)}. Tap when ready.`, true);
  }

  private async showHandScore() {
    const s = this.state;
    if (!this.tut) {
      recordHand(s);
      if (s.phase === 'matchEnd') { recordMatch(s); clearMatch(); }
    }
    const left = this.settleAt - performance.now();
    if (left > 0) await wait(left);
    if (this.destroyed) return;
    if (s.phase === 'matchEnd') audio.play('win', this.ctx.settings.captions);
    const sides = Array.from({ length: sideCount(this.rules) }, (_, i) => this.sideName(i));
    const ov = h('div', { class: 'overlay' });
    this.overlayEl = ov;
    this.render();
    this.el.append(ov);
    enterSheet(ov);
    const result = await showScore(ov, s, sides, this.ctx.settings, { tutorial: !!this.tut });
    ov.remove();
    this.overlayEl = null;
    if (this.destroyed) return;
    if (this.tut) { this.tut.onHandEnd(s); return; }
    if (result === 'next') {
      if (this.humans.length > 1) this.viewer = null;
      await this.submit({ t: 'nextHand', seq: this.state.seq });
    } else if (result === 'rematch') {
      const m = newMatch({ ...this.state.setup, seed: randomSeed() }).state;
      saveMatch(m, this.ctx.build.version);
      this.ctx.go('game', { match: m });
    } else this.ctx.go('title');
  }

  private coachEl: HTMLElement | null = null;
  private renderCoach(c: { text: string; next?: string } | null) {
    this.coachEl?.remove();
    this.coachEl = null;
    if (!c || !this.tut) { this.layout(); return; }
    const tut = this.tut;
    const box = h('div', { class: 'coach', role: 'note' }, h('p', {}, c.text),
      h('div', { class: 'row end' }, h('button', { class: 'btn small ghost', onclick: () => tut.skip() }, 'Skip tutorial'),
        c.next ? h('button', { class: 'btn small primary', onclick: () => { const ns = tut.advance(this.state); if (ns) { this.state = ns; this.render(); } this.step(); } }, c.next) : null));
    this.coachEl = box;
    this.north.after(box);
    this.layout();
    announce(c.text);
  }

  // ---------------------------------------------------------------- menu, lifecycle

  private openMenu() {
    if (this.overlayEl) return;
    this.aiToken++;
    const wasViewer = this.viewer;
    // Nothing private shows behind a menu in pass-and-play.
    if (this.humans.length > 1) this.viewer = null;
    this.sel = null;
    const ov = h('div', { class: 'overlay' });
    this.overlayEl = ov;
    this.render();
    this.el.append(ov);
    enterSheet(ov);
    pauseMenu(ov, this.ctx, {
      state: this.state,
      tutorial: !!this.tut,
      showAll: this.humans.length === 0 ? this.showAllHands : null,
      onShowAll: (v) => { this.showAllHands = v; },
      onClose: () => {
        ov.remove();
        this.overlayEl = null;
        this.el.dataset.table = this.ctx.settings.table;
        if (this.humans.length === 1) this.viewer = wasViewer;
        this.render();
        this.step();
      },
      onQuit: () => { if (!this.tut) saveMatch(this.state, this.ctx.build.version); this.ctx.go('title'); },
    });
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      finishAll();
      this.settle3d();
      if (!this.tut) saveMatch(this.state, this.ctx.build.version);
      audio.suspendIfIdle();
      if (this.humans.length > 1 && !this.overlayEl && this.state.phase === 'play') { this.viewer = null; this.sel = null; this.render(); }
    } else if (!this.overlayEl) this.step();
  };

  /** Dev tools: replace the state (replay / scenario). */
  loadState(s: MatchState) {
    this.aiToken++;
    this.state = s;
    this.sel = null;
    this.scoreShownFor = -1;
    this.render();
    this.step();
  }
}

function valueLabel(c: CardId) {
  const v = valueOf(c);
  return v === 1 ? 'A' : String(v);
}

export { backUrl };
