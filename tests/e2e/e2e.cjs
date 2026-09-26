// End-to-end walkthrough with trusted touch input at phone size.
//   node tests/e2e/e2e.cjs [baseUrl] [--only name]
// Each scenario starts from a fresh browser profile. Exits non-zero on the first failure.
const { driver, wait } = require('./driver.cjs');

const BASE = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:8134/';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

/** Play the local human's turn: tap a hand card, then the first offered option (and Confirm if shown). */
async function humanMove(d, pick = 0) {
  const n = await d.js(() => document.querySelectorAll('.hand .card[data-card]').length);
  if (!n) throw new Error('no visible hand');
  await d.tap(`.hand .card[data-card]:nth-child(${(pick % n) + 1})`);
  const optCount = await d.waitFor(() => document.querySelectorAll('.tray .opt-btn').length, 3000);
  if (optCount) await d.tap('.tray .opt-btn');
  else await d.tapText('Play card', '.tray button');
  const confirm = await d.js(() => [...document.querySelectorAll('.tray button')].some((b) => /Confirm|Place card/.test(b.textContent)));
  if (confirm) await d.tapText(await d.js(() => [...document.querySelectorAll('.tray button')].find((b) => /Confirm|Place card/.test(b.textContent)).textContent.trim()), '.tray button');
}

const { execFileSync } = require('node:child_process');
const FIX = JSON.parse(execFileSync(process.execPath, [require('node:path').join(__dirname, 'make-fixtures.ts')], { encoding: 'utf8' }));

/** Fresh device that has already seen the tutorial, optionally with a saved match and settings. */
async function prime(d, { fixture, settings } = {}) {
  await d.goto(BASE);
  await d.js((fx, st) => {
    localStorage.clear();
    localStorage.setItem('scopa:settings', JSON.stringify({ tutorialSeen: true, aiSpeed: 0.15, animationSpeed: 2.5, ...(st || {}) }));
    if (fx) localStorage.setItem('scopa:match', JSON.stringify(fx));
  }, fixture || null, settings || null);
  await d.goto(BASE);
}

async function playUntil(d, cond, maxMoves = 80) {
  for (let i = 0; i < maxMoves; i++) {
    if (await d.js(cond)) return true;
    const st = await d.js(() => {
      const s = window.__scopa.state;
      if (!s) return 'none';
      if (document.querySelector('.score-row') || document.querySelector('.score-total')) return 'score';
      if (document.querySelector('.handoff')) return 'handoff';
      const human = s.setup.seats[s.hand.turn].kind === 'human';
      return human && document.querySelector('.hand .card[data-card]') ? 'mine' : 'wait';
    });
    if (st === 'mine') await humanMove(d, i);
    else if (st === 'handoff') await d.tapText('Tap when ready');
    else if (st === 'score') return d.js(cond);
    else await d.wait(250);
  }
  return d.js(cond);
}

const scenarios = {
  async classicVsAi(d) {
    await prime(d);
    d.ok('title shows New game', await d.waitFor(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('New game'))));
    await d.shot('10-title');
    await d.tapText('New game');
    d.ok('setup step 1: presets listed', await d.waitFor(() => document.querySelectorAll('.choice').length === 7));
    await d.tapText('Classic Scopa', '.choice');
    await d.shot('11-setup-presets');
    for (const label of ['Next: Players', 'Next: Seats', 'Next: Scoring', 'Next: Look', 'Next: Begin']) await d.tapText(label);
    d.ok('summary shows the rules', await d.waitFor(() => /Classic Scopa — Two players — to 11/.test(document.body.textContent)));
    await d.shot('12-setup-summary');
    await d.tapText('Begin the match');
    d.ok('the table is dealt', await d.waitFor(() => window.__scopa.state && window.__scopa.state.hand.table.length === 4));
    d.ok('status shows turn, dealer, deck and score', await d.js(() => !!document.querySelector('.chip.dealer') && /to deal/.test(document.querySelector('.tablemeta').textContent) && document.querySelectorAll('.topbar .scores span').length === 2 && !!document.querySelector('.seat.turn')));
    await d.shot('13-table');
    d.ok('no horizontal scroll at the table', await d.noOverflow());
    const r = await playUntil(d, () => !!document.querySelector('.score-total'), 200);
    d.ok('a whole hand plays to the scoring screen', r || await d.waitFor(() => !!document.querySelector('.score-total'), 20000));
    await d.shot('14-hand-score');
    const dealer1 = (await d.state()).dealer;
    await d.tapText('Next hand');
    d.ok('next hand deals with the deal rotated', await d.waitFor((d1) => window.__scopa.state.handNo === 2 && window.__scopa.state.dealer !== d1, 8000, dealer1));
    // Save, leave and continue restores exactly.
    await d.wait(600);
    await playUntil(d, () => window.__scopa.state.hand.plays >= 3, 10);
    await d.tap('.topbar .icon-btn');
    await d.wait(400);
    const before = JSON.stringify(await d.js(() => window.__scopa.state));
    await d.tapText('Save and leave');
    d.ok('title offers Continue', await d.waitFor(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Continue match'))));
    await d.goto(BASE); // full reload: app closed and reopened
    await d.tapText('Continue match');
    const after = JSON.stringify(await d.waitFor(() => window.__scopa.state));
    d.ok('reload restores the exact match state', after === before);
  },

  async multipleCaptures(d) {
    await prime(d, { fixture: FIX.multi });
    await d.tapText('Continue match');
    await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length === 3);
    await d.tap('.hand .card[data-card="16"]');
    d.ok('two capture groups are offered', await d.waitFor(() => document.querySelectorAll('.tray .opt-btn').length === 2));
    d.ok('table cards carry group numbers', await d.js(() => document.querySelectorAll('.table-cards .card .groups b').length === 4));
    d.ok('equations are shown', await d.js(() => /7 = 3 \+ 4/.test(document.querySelector('.tray').textContent) && /7 = 2 \+ 5/.test(document.querySelector('.tray').textContent)));
    await d.shot('20-multi-options');
    // Tap the 5 on the table: it belongs to exactly one group, which is taken.
    await d.tap('.table-cards .card[data-card="34"]');
    d.ok('choosing via the table takes 2 + 5', await d.waitFor(() => { const c = window.__scopa.state.hand.captures[0]; return c.includes(34) && c.includes(21) && !c.includes(32); }));
    d.ok('three and four stay on the table', await d.js(() => window.__scopa.state.hand.table.includes(32) && window.__scopa.state.hand.table.includes(33)));
  },

  async confirmAndNoCapture(d) {
    await prime(d, { fixture: FIX.multi, settings: { confirmMoves: true } });
    await d.tapText('Continue match');
    await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length === 3);
    await d.tap('.hand .card[data-card="20"]'); // Ace of Swords
    d.ok('no-capture is clearly stated', await d.waitFor(() => /placed on the table/.test(document.querySelector('.tray').textContent)));
    await d.tap('.tray .opt-btn');
    d.ok('confirmation preview appears, nothing committed yet', await d.waitFor(() => /Place card/.test(document.querySelector('.tray').textContent)) && (await d.state()).plays === 0);
    await d.tapText('Cancel', '.tray button');
    d.ok('cancel leaves the hand untouched', (await d.state()).hands[0].length === 3 && !(await d.js(() => document.querySelector('.hand .card.selected'))));
    await d.tap('.hand .card[data-card="20"]');
    await d.tap('.tray .opt-btn');
    await d.tapText('Place card', '.tray button');
    d.ok('the Ace is placed on the table', await d.waitFor(() => { const c = window.__scopa.state.log[0]; return c && c.card === 20 && c.kind === 'place'; }));
  },

  async matchEndAndRematch(d) {
    await prime(d, { fixture: FIX.matchPoint });
    await d.tapText('Continue match');
    await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length === 1);
    await d.tap('.hand .card[data-card="30"]');
    await d.tap('.tray .opt-btn');
    d.ok('match ends with a winner', await d.waitFor(() => window.__scopa.state.phase === 'matchEnd', 8000));
    await d.tapText('Show all');
    d.ok('winner announced on the score screen', await d.waitFor(() => /win.*the match/.test(document.querySelector('.sheet')?.textContent || ''), 8000));
    await d.shot('30-match-end');
    await d.tapText('Rematch');
    d.ok('rematch starts a fresh match', await d.waitFor(() => window.__scopa.state && window.__scopa.state.scores.every((x) => x === 0) && window.__scopa.state.phase === 'play'));
    d.ok('statistics recorded the match', await d.js(() => JSON.parse(localStorage.getItem('scopa:stats')).matchesPlayed === 1));
  },

  async partnershipPassAndPlay(d) {
    await prime(d);
    await d.tapText('New game');
    await d.tapText('Classic Scopa', '.choice');
    await d.tapText('Next: Players');
    await d.tapText('Four players in two partnerships', '.choice');
    await d.tapText('Next: Seats');
    // Seat 3 (index 2, your partner) becomes a second person at this device.
    await d.tap('#seat-k-2');
    await d.js(() => { const s = document.getElementById('seat-k-2'); s.value = 'human'; s.dispatchEvent(new Event('change')); });
    d.ok('two people configured', await d.waitFor(() => /2 people will pass this device/.test(document.body.textContent)));
    await d.shot('40-seats');
    for (const label of ['Next: Scoring', 'Next: Look', 'Next: Begin']) await d.tapText(label);
    await d.tapText('Begin the match');
    let handoffs = 0;
    for (let i = 0; i < 40 && handoffs < 3; i++) {
      const st = await d.waitFor(() => (document.querySelector('.handoff') ? 'handoff' : document.querySelector('.hand .card[data-card]') ? 'mine' : ''), 6000);
      if (st === 'handoff') {
        handoffs++;
        const leak = await d.js(() => {
          const s = window.__scopa.state;
          const faces = [...document.querySelectorAll('img')].map((i) => i.src);
          const hidden = s.hand.hands.flat();
          // Any face-up hand card in the DOM would be a leak (table cards are public).
          return [...document.querySelectorAll('.hand .card[data-card], .minis img[alt]:not([alt=""])')].length + (document.querySelector('.hand img') && hidden.some(() => false) ? 1 : 0) + faces.length * 0;
        });
        d.ok(`handoff ${handoffs}: no hand is visible behind it`, leak === 0);
        if (handoffs === 1) await d.shot('41-handoff');
        const who = await d.js(() => document.querySelector('.handoff h2').textContent);
        await d.tapText('Tap when ready');
        const seat = await d.js(() => window.__scopa.state.hand.turn);
        const name = await d.js((s) => window.__scopa.state.setup.seats[s].name, seat);
        d.ok(`the revealed hand belongs to the named player (${name})`, who === `Pass to ${name}` && await d.waitFor((s) => { const ids = [...document.querySelectorAll('.hand .card[data-card]')].map((e) => +e.dataset.card).sort((a, b) => a - b); return JSON.stringify(ids) === JSON.stringify([...window.__scopa.state.hand.hands[s]].sort((a, b) => a - b)); }, 3000, seat));
        await humanMove(d, 0);
        d.ok('the hand is hidden as soon as the move is committed', await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length === 0, 1500));
      } else if (st === 'mine') {
        throw new Error('a hand was shown without a handoff in pass-and-play');
      }
    }
    d.ok('three private handoffs happened', handoffs === 3);
    // App restoration must also land on a privacy screen.
    await d.goto(BASE);
    await d.tapText('Continue match');
    d.ok('restoring pass-and-play shows a handoff or an AI turn, never a hand', await d.waitFor(() => document.querySelector('.handoff') || window.__scopa.state.setup.seats[window.__scopa.state.hand.turn].kind === 'ai', 4000) && await d.js(() => document.querySelectorAll('.hand .card[data-card]').length === 0));
  },

  async keyboardOnly(d) {
    await prime(d, { fixture: FIX.multi });
    // Reach Continue with the keyboard alone.
    await d.waitFor(() => !!document.querySelector('.menu button'));
    await d.js(() => document.body.focus());
    let focused = '';
    for (let i = 0; i < 6 && !/Continue/.test(focused); i++) { await d.key('Tab'); focused = await d.js(() => document.activeElement?.textContent || ''); }
    d.ok('Continue is reachable by Tab', /Continue/.test(focused));
    d.ok('focus is visible', await d.js(() => getComputedStyle(document.activeElement).outlineStyle !== 'none'));
    await d.key('Enter');
    await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length === 3);
    await d.js(() => document.querySelector('.hand .card[data-card]').focus());
    d.ok('focusing a card explains it', await d.waitFor(() => /Capture value/.test(document.querySelector('.tray').textContent)));
    // Move to the 7 of Cups with arrow keys, select with Enter, choose option 1 with the digit key.
    for (let i = 0; i < 3 && (await d.js(() => document.activeElement.dataset.card)) !== '16'; i++) await d.key('ArrowRight');
    await d.key('Enter');
    d.ok('Enter selects the card', await d.waitFor(() => !!document.querySelector('.hand .card.selected')));
    await d.key('Escape');
    d.ok('Escape cancels', await d.waitFor(() => !document.querySelector('.hand .card.selected')));
    await d.key('Enter');
    await d.key('1', 'Digit1');
    d.ok('a digit chooses a capture and plays it', await d.waitFor(() => window.__scopa.state.hand.plays === 1));
  },

  async deviceMatrix(d) {
    const sizes = [
      ['iphone-se', 320, 568, 2], ['iphone-15', 393, 852, 3], ['iphone-15-land', 852, 393, 3], ['pixel-7', 412, 915, 2.6], ['android-land', 915, 412, 2.6],
      ['ipad-port', 768, 1024, 2], ['ipad-land', 1024, 768, 2], ['desktop', 1440, 900, 1], ['desktop-small', 1024, 640, 1],
    ];
    const check = () => {
      const vw = innerWidth, vh = innerHeight;
      const inside = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1; };
      const bad = [];
      for (const sel of ['.hand .card', '.tray button', '.topbar button', '.seat', '.table-cards .card', '.handoff .btn']) document.querySelectorAll(sel).forEach((e) => { if (!inside(e)) bad.push(sel + ' ' + (e.dataset.card ?? e.textContent.slice(0, 20))); });
      const small = [...document.querySelectorAll('.hand .card, .tray button, .topbar button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width < 40 || r.height < 40; }).map((e) => e.className + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
      // Regions must not collide, and nothing may be cut off inside a seat panel.
      const boxes = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
      const hit = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      for (const [x, y] of [['.seat', '.tray .msg'], ['.seat', '.tray button'], ['.seat', '.table-cards .card'], ['.hand .card', '.tray button'], ['.table-cards .card', '.tray .msg'], ['.tablemeta', '.table-cards .card']]) for (const a of boxes(x)) for (const b of boxes(y)) if (hit(a, b)) bad.push(`${x} overlaps ${y}`);
      document.querySelectorAll('.seat').forEach((e) => { if (e.scrollWidth > e.clientWidth + 2) bad.push('seat content clipped: ' + e.textContent.slice(0, 16)); });
      return { bad: [...new Set(bad)], small, overflow: document.documentElement.scrollWidth > vw + 1 };
    };
    for (const [fixture, label] of [['sci', 'scientifico-10-cards'], ['multi', 'classic-2p']]) {
      await prime(d, { fixture: FIX[fixture] });
      for (const [name, w, h, dpr] of sizes) {
        await d.resize(w, h, dpr);
        await d.goto(BASE);
        await d.tapText('Continue match');
        await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length > 0, 6000);
        await d.tap('.hand .card[data-card]');
        await d.wait(300);
        const r = await d.js(check);
        await d.shot(`60-${label}-${name}`);
        d.ok(`${label} @ ${name} ${w}x${h}: nothing clipped, targets >= 40px, no sideways scroll`, r.bad.length === 0 && r.small.length === 0 && !r.overflow, JSON.stringify(r));
        await d.key('Escape');
      }
    }
    await d.resize(390, 844, 2);
  },

  // The next two need the production build: node tests/e2e/e2e.cjs http://localhost:8135/ --only offline
  async offline(d) {
    if (!/8135/.test(BASE)) { console.log('  (skipped: run against the production preview on :8135)'); return; }
    await prime(d);
    d.ok('service worker takes control', await d.waitFor(async () => { await navigator.serviceWorker.ready; return !!navigator.serviceWorker.controller || (location.reload(), false); }, 20000));
    await d.goto(BASE);
    d.ok('the offline cache is complete', await d.waitFor(async () => { const k = (await caches.keys()).find((x) => x.startsWith('scopa-')); if (!k) return false; const c = await caches.open(k); return (await c.keys()).length >= 12; }, 20000));
    await d.tapText('New game');
    for (const label of ['Next: Players', 'Next: Seats', 'Next: Scoring', 'Next: Look', 'Next: Begin']) await d.tapText(label);
    await d.tapText('Begin the match');
    await d.waitFor(() => window.__scopa.state && window.__scopa.state.hand.table.length > 0);
    await d.send('Network.enable');
    await d.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    d.ok('the network is really off', await d.js(async () => { try { await fetch('./version.json?x=' + Math.random(), { cache: 'no-store' }); return false; } catch { return true; } }));
    await d.goto(BASE);
    d.ok('the app loads in airplane mode', await d.waitFor(() => !!document.querySelector('.wordmark')));
    await d.tapText('Continue match');
    d.ok('the saved match continues offline', await d.waitFor(() => !!window.__scopa.state && document.querySelectorAll('.card img').length > 3));
    await playUntil(d, () => window.__scopa.state.hand.plays >= 4, 20);
    d.ok('play works offline (AI worker included)', (await d.state()).plays >= 4);
    await d.shot('70-offline');
    await d.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  },

  async updateKeepsMatch(d) {
    if (!/8135/.test(BASE)) { console.log('  (skipped: run against the production preview on :8135)'); return; }
    await prime(d);
    await d.waitFor(async () => { await navigator.serviceWorker.ready; return !!navigator.serviceWorker.controller || (location.reload(), false); }, 20000);
    await d.goto(BASE);
    await d.tapText('New game');
    for (const label of ['Next: Players', 'Next: Seats', 'Next: Scoring', 'Next: Look', 'Next: Begin']) await d.tapText(label);
    await d.tapText('Begin the match');
    await playUntil(d, () => window.__scopa.state.hand.plays >= 2, 10);
    await d.tap('.topbar .icon-btn');
    await d.wait(300);
    const before = JSON.stringify(await d.js(() => window.__scopa.state));
    const oldCache = await d.js(async () => (await caches.keys()).find((k) => k.startsWith('scopa-')));
    await d.tapText('Save and leave');
    // Ship a new version underneath the running app.
    require('node:child_process').execSync('npx vite build', { cwd: require('node:path').join(__dirname, '../..'), stdio: 'ignore', shell: true, env: { ...process.env, GITHUB_SHA: 'updtest' + Date.now() } });
    await d.goto(BASE);
    await d.js(async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    d.ok('the new version is offered, not forced', await d.waitFor(() => [...document.querySelectorAll('button')].some((b) => /Update ready/.test(b.textContent)), 30000));
    d.ok('the old version keeps running until the player chooses', await d.js(() => [...document.querySelectorAll('button')].some((b) => /Continue match/.test(b.textContent))));
    await d.tapText('Update ready');
    await d.wait(2500);
    await d.waitFor(() => !!document.querySelector('.menu'), 15000);
    const newCache = await d.js(async () => (await caches.keys()).filter((k) => k.startsWith('scopa-')));
    d.ok('the new cache replaced the old one', !newCache.includes(oldCache) && newCache.length === 1, JSON.stringify({ oldCache, newCache }));
    await d.tapText('Continue match');
    const after = JSON.stringify(await d.waitFor(() => window.__scopa.state));
    d.ok('the in-progress match survived the update exactly', after === before);
  },

  async fullMatchesAllAiAndHuman(d) {
    const finishMatch = async (label, maxMs) => {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        const st = await d.js(() => {
          const s = window.__scopa.state;
          if (!s) return 'none';
          if (s.phase === 'matchEnd' && document.querySelector('.score-total')) return 'over';
          if (document.querySelector('.score-total')) return 'score';
          if (document.querySelector('.score-row')) return 'reveal';
          const human = s.setup.seats[s.hand.turn].kind === 'human';
          return human && document.querySelector('.hand .card[data-card]') ? 'mine' : 'wait';
        });
        if (st === 'over') return true;
        if (st === 'score') await d.tapText('Next hand');
        else if (st === 'reveal') await d.tapText('Show all', 'button', 5).catch(() => undefined);
        else if (st === 'mine') await humanMove(d, Math.floor(Math.random() * 3));
        else await d.wait(200);
      }
      return false;
    };
    // 1. All-AI watched match, via the setup screen.
    await prime(d, { settings: { aiSpeed: 0.05, animationSpeed: 4 } });
    await d.tapText('New game');
    await d.tapText('Next: Players');
    await d.tapText('Next: Seats');
    await d.js(() => { const s = document.getElementById('seat-k-0'); s.value = 'expert'; s.dispatchEvent(new Event('change')); });
    d.ok('all seats are computer players', await d.waitFor(() => /you will watch the match/.test(document.body.textContent)));
    for (const label of ['Next: Scoring', 'Next: Look', 'Next: Begin']) await d.tapText(label);
    await d.tapText('Begin the match');
    d.ok('an all-AI match plays itself to a winner', await finishMatch('all-ai', 240000));
    await d.shot('80-all-ai-end');
    // 2. A person against the computer, set up through the UI, played to the end.
    await d.tapText('Home');
    await d.tapText('New game');
    await d.tapText('Next: Players');
    await d.tapText('Next: Seats');
    await d.js(() => { const s = document.getElementById('seat-k-0'); s.value = 'human'; s.dispatchEvent(new Event('change')); });
    await d.js(() => { const s = document.getElementById('seat-k-1'); s.value = 'relaxed'; s.dispatchEvent(new Event('change')); });
    for (const label of ['Next: Scoring', 'Next: Look', 'Next: Begin']) await d.tapText(label);
    await d.tapText('Begin the match');
    d.ok('a person plays a complete match to victory or defeat', await finishMatch('human', 400000));
    await d.shot('81-human-match-end');
    d.ok('statistics count both matches', await d.js(() => JSON.parse(localStorage.getItem('scopa:stats')).matchesPlayed === 2));
  },

  async orientationAndMotion(d) {
    await prime(d, { fixture: FIX.multi, settings: { reducedMotion: 'on' } });
    await d.tapText('Continue match');
    await d.waitFor(() => document.querySelectorAll('.hand .card[data-card]').length === 3);
    d.ok('reduced motion is applied', await d.js(() => document.documentElement.classList.contains('reduced')));
    await humanMove(d, 0);
    // wait for the computer to reply so nothing changes during the rotation
    await d.waitFor(() => window.__scopa.state.hand.turn === 0 && window.__scopa.state.hand.plays === 2, 8000);
    const before = JSON.stringify(await d.state());
    await d.resize(844, 390);
    d.ok('landscape layout engages', await d.waitFor(() => document.querySelector('.table-screen').classList.contains('landscape')));
    d.ok('state survives rotation', JSON.stringify(await d.state()) === before);
    d.ok('no horizontal scroll in landscape', await d.noOverflow());
    await d.shot('50-landscape');
    await d.resize(390, 844);
    d.ok('back to portrait', await d.waitFor(() => !document.querySelector('.table-screen').classList.contains('landscape')));
  },

  async tutorial(d) {
    await d.goto(BASE);
    d.ok('first launch opens the tutorial', await d.waitFor(() => !!document.querySelector('.coach')));
    d.ok('no horizontal scroll', await d.noOverflow());
    await d.shot('01-tutorial-intro');
    await d.tapText('Next');
    await d.tapText('Let');
    d.ok('tutorial asks for the 5 of Coins', await d.waitFor(() => /5 of Coins/.test(document.querySelector('.coach')?.textContent || '')));
    // Try the wrong card first: the tutorial must refuse it and explain.
    await d.tap('.hand .card[data-card="16"]');
    await d.tap('.tray .opt-btn');
    d.ok('a different move is refused with a hint', (await d.state()).plays === 0 && await d.waitFor(() => /try the move/i.test(document.getElementById('toast').textContent)));
    await d.tap('.hand .card[data-card="4"]');
    d.ok('selecting shows the matching capture', await d.waitFor(() => document.querySelectorAll('.table-cards .card.legal').length === 1));
    await d.shot('02-tutorial-select');
    await d.tap('.tray .opt-btn');
    d.ok('capture by matching', await d.waitFor(() => window.__scopa.state.hand.captures[0].length === 2));
    d.ok('scripted opponent places a 2', await d.waitFor(() => window.__scopa.state.hand.plays === 2, 8000));
    await d.tap('.hand .card[data-card="16"]');
    d.ok('7 shows the 3 + 4 combination', await d.waitFor(() => /3 \+ 4/.test(document.querySelector('.tray').textContent)));
    await d.tap('.tray .opt-btn');
    d.ok('combination capture', await d.waitFor(() => window.__scopa.state.hand.captures[0].length === 5));
    d.ok('opponent takes the Re', await d.waitFor(() => window.__scopa.state.hand.plays === 4, 8000));
    await d.tap('.hand .card[data-card="21"]');
    await d.tap('.tray .opt-btn');
    d.ok('scopa is scored', await d.waitFor(() => window.__scopa.state.hand.scope[0] === 1));
    d.ok('scopa flourish shows', await d.waitFor(() => !!document.querySelector('.scopa-flourish'), 1500));
    await d.shot('03-tutorial-scopa');
    d.ok('coach offers to jump to scoring', await d.waitFor(() => /Jump/.test(document.querySelector('.coach')?.textContent || ''), 9000));
    await d.tapText('Jump');
    d.ok('score ceremony appears', await d.waitFor(() => !!document.querySelector('.score-row'), 8000));
    await d.tapText('Show all');
    d.ok('primiera shows arithmetic', await d.waitFor(() => /Primiera/.test(document.querySelector('.sheet').textContent) && /=/.test(document.querySelector('.sheet').textContent), 8000));
    await d.shot('04-tutorial-score');
    await d.tapText('Finish tutorial');
    d.ok('back to the title', await d.waitFor(() => /Scopa/.test(document.querySelector('.wordmark')?.textContent || '')));
    d.ok('tutorial marked as seen', await d.js(() => JSON.parse(localStorage.getItem('scopa:settings')).tutorialSeen === true));
  },
};

(async () => {
  let failed = false;
  for (const [name, fn] of Object.entries(scenarios)) {
    if (only && name !== only) continue;
    console.log(`\n== ${name}`);
    const d = await driver({ base: BASE });
    try {
      await fn(d);
      if (d.logs.length) { console.log(d.logs.join('\n')); d.ok('no console errors', false, d.logs[0]); }
      else d.ok('no console errors', true);
    } catch (e) {
      failed = true;
      console.log('✗ ' + e.message);
      try { await d.shot(`FAIL-${name}`); } catch { /* */ }
      if (d.logs.length) console.log(d.logs.join('\n'));
    } finally {
      await d.close();
    }
    if (failed) break;
  }
  process.exit(failed ? 1 : 0);
})();

module.exports = { humanMove, wait };
