/**
 * FLIP animation over a state-derived render. The DOM is rebuilt from game
 * state first (so correctness never waits on animation), then each card is
 * animated from where it was to where it now is. Reduced motion swaps travel
 * for short fades.
 */
export interface Snapshot { rects: Map<string, DOMRect>; }

export function snapshot(root: HTMLElement): Snapshot {
  const rects = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => rects.set(el.dataset.card as string, el.getBoundingClientRect()));
  return { rects };
}

export interface AnimCtx { reduced: boolean; speed: number }

const running = new Set<Animation>();

export function flip(root: HTMLElement, before: Snapshot, ctx: AnimCtx, origin?: (id: string) => DOMRect | null): Promise<void> {
  const anims: Promise<unknown>[] = [];
  const dur = 320 / ctx.speed;
  root.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => {
    const id = el.dataset.card as string;
    const now = el.getBoundingClientRect();
    const was = before.rects.get(id) ?? origin?.(id) ?? null;
    if (!was || now.width === 0) return;
    const dx = was.left - now.left, dy = was.top - now.top;
    const s = was.width / Math.max(1, now.width);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(s - 1) < 0.01) return;
    let a: Animation;
    if (ctx.reduced) a = el.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 160 / ctx.speed, easing: 'ease-out' });
    else a = el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: 'none' }], { duration: dur, easing: 'cubic-bezier(.2,.8,.25,1)' });
    running.add(a);
    anims.push(a.finished.catch(() => undefined).finally(() => running.delete(a)));
  });
  return Promise.all(anims).then(() => undefined);
}

/** Fly ghost copies of cards (by their last rects) to a target, then fade. Used for captures. */
export function gather(images: { src: string; rect: DOMRect }[], target: DOMRect | null, ctx: AnimCtx, delay = 0): Promise<void> {
  if (!target || images.length === 0) return Promise.resolve();
  const anims: Promise<unknown>[] = [];
  images.forEach(({ src, rect }, i) => {
    const g = document.createElement('div');
    g.className = 'fly';
    Object.assign(g.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const img = document.createElement('img');
    img.src = src;
    g.appendChild(img);
    document.body.appendChild(g);
    const tx = target.left + target.width / 2 - (rect.left + rect.width / 2);
    const ty = target.top + target.height / 2 - (rect.top + rect.height / 2);
    const a = ctx.reduced
      ? g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 / ctx.speed, delay: delay / ctx.speed, fill: 'forwards' })
      : g.animate([
          { transform: 'none', opacity: 1 },
          { transform: `translate(${tx * 0.15}px, ${ty * 0.15 - 12}px) scale(1.04)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${tx}px, ${ty}px) scale(.35)`, opacity: 0.2 },
        ], { duration: 520 / ctx.speed, delay: (delay + i * 40) / ctx.speed, easing: 'cubic-bezier(.45,.05,.3,1)', fill: 'forwards' });
    running.add(a);
    anims.push(a.finished.catch(() => undefined).finally(() => { running.delete(a); g.remove(); }));
  });
  return Promise.all(anims).then(() => undefined);
}

/** Finish every running animation now (e.g. when the app is backgrounded). */
export function finishAll() {
  for (const a of running) { try { a.finish(); } catch { /* */ } }
  document.querySelectorAll('.fly').forEach((n) => n.remove());
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
