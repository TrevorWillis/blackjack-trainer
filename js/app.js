import {
  ACTION_NAMES, DEFAULT_RULES, DEVIATIONS, INSURANCE_INDEX, advise, betUnits, cardValue,
  hardCode, softCode, pairCode, handInfo, hiLo, houseEdge, resolveCode,
} from './strategy.js';
import { Game, info, values } from './game.js';
import { LESSONS } from './lessons.js';

/* ---------- State ---------- */

const KEY = 'bj-trainer-v1';
const freshExam = () => ({ best: 0, last: 0, taken: 0 });
const freshCount = () => ({ stages: {}, checks: [0, 0], bets: [0, 0] });
const freshStats = () => ({ days: {}, cells: {}, hands: 0, decisions: 0, correct: 0, evLost: 0, net: 0, streak: 0, best: 0, rebuys: 0 });
const state = {
  rules: { ...DEFAULT_RULES },
  opts: { block: true, countMode: 'off', deviations: false, betCheck: false, unit: 25 },
  stats: freshStats(),
  path: {},
  exam: freshExam(),
  count: freshCount(),
  bankroll: 1000,
  bet: 25,
  view: 'play',
};
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) {
    Object.assign(state.rules, saved.rules);
    Object.assign(state.opts, saved.opts);
    Object.assign(state.stats, saved.stats);
    Object.assign(state.path, saved.path);
    Object.assign(state.exam, saved.exam);
    Object.assign(state.count, saved.count);
    for (const k of ['bankroll', 'bet', 'view', 'lastBackup', 'lastBackupN']) if (saved[k] != null) state[k] = saved[k];
  }
} catch { /* storage unavailable: run without persistence */ }
function applySaved(saved) {
  Object.assign(state.rules, saved.rules);
  Object.assign(state.opts, saved.opts);
  state.stats = Object.assign(freshStats(), saved.stats);
  state.path = { ...saved.path };
  state.exam = Object.assign(freshExam(), saved.exam);
  state.count = Object.assign(freshCount(), saved.count);
  for (const k of ['bankroll', 'bet']) if (saved[k] != null) state[k] = saved[k];
}

const b64 = u8 => btoa(Array.from(u8, c => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pack() {
  const { rules, opts, stats, path, exam, count, bankroll, bet } = state;
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, rules, opts, stats, path, exam, count, bankroll, bet }));
  try {
    const z = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + b64(new Uint8Array(await new Response(z).arrayBuffer()));
  } catch { return 'j' + b64(raw); }
}
async function unpack(code) {
  code = code.trim().replace(/^.*#save=/, '');
  let bytes = unb64(code.slice(1));
  if (code[0] === 'z') {
    const z = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(z).arrayBuffer());
  } else if (code[0] !== 'j') throw new Error('bad code');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || data.v !== 1 || !data.stats) throw new Error('bad code');
  return data;
}
const restoreLink = async () => `${location.origin}${location.pathname}#save=${await pack()}`;
let backupMsg = '';

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } };

const $ = s => document.querySelector(s);
const main = $('#main');
const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const upLabel = u => (u === 11 ? 'A' : String(u));
const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 });
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

let game = new Game(state.rules);
let coach = null;        // { kind: 'ok' | 'bad' | 'info', html }
let tried = false;       // current decision already answered wrongly (block mode)
let countQuiz = null;    // { entry, result }
let animateDone = false; // fade results in once, on the render that ends a round

/* ---------- Shared rendering ---------- */

const seen = new Map();
let dealIdx = 0;
function cardHTML(c) {
  const red = c.s === '♥' || c.s === '♦';
  let cls = 'card', style = '';
  if (c.id) {
    const prev = seen.get(c.id);
    if (!prev) { cls += ' deal'; style = `animation-delay:${dealIdx++ * 130}ms`; }
    else if (prev === 'back' && !c.hidden) { cls += ' flip'; dealIdx++; }
    seen.set(c.id, c.hidden ? 'back' : 'face');
  } else cls += ' deal';
  if (c.hidden) return `<div class="${cls} back" style="${style}"></div>`;
  return `<div class="${cls}${red ? ' red' : ''}" style="${style}"><span class="r">${c.r}</span><span class="s">${c.s}\uFE0E</span></div>`;
}

function totalLabel(cards) {
  const i = info(cards);
  if (cards.length === 2 && i.total === 21) return '21';
  return (i.soft && i.total < 21 ? 'Soft ' : '') + i.total;
}

function evLine(adv, chosen) {
  const evs = adv.evs;
  const best = Object.keys(evs).reduce((a, b) => (evs[b] > evs[a] ? b : a));
  if (adv.dev) return '';
  if (best !== adv.action) return '<div class="ev">This one is close to a coin flip, but the chart play is right for a real shoe.</div>';
  const f = k => `${ACTION_NAMES[k]} ${evs[k] >= 0 ? '+' : '−'}${Math.abs(evs[k] * 100).toFixed(1)}¢`;
  const parts = [f(adv.action)];
  if (chosen && chosen !== adv.action && evs[chosen] != null) parts.push(f(chosen));
  return `<div class="ev">Average result per $1 bet: ${parts.join(' · ')}</div>`;
}

function feedback(adv, chosen) {
  if (chosen === adv.action) {
    return { kind: 'ok', html: `<b>✓ ${ACTION_NAMES[chosen]} is correct.</b> <span class="why">${adv.why}</span>` };
  }
  return {
    kind: 'bad',
    html: `<b>✗ You chose ${ACTION_NAMES[chosen].toLowerCase()}. The right play is ${ACTION_NAMES[adv.action].toLowerCase()}.</b>
      <div class="why">${adv.why}</div>${evLine(adv, chosen)}`,
  };
}

function record(cell, right, cost = 0) {
  const s = state.stats;
  const c = s.cells[cell] || (s.cells[cell] = [0, 0]);
  c[right ? 0 : 1]++;
  s.decisions++;
  const day = new Date().toLocaleDateString('en-CA');
  const d = s.days[day] || (s.days[day] = [0, 0]);
  d[right ? 0 : 1]++;
  if (right) { s.correct++; s.streak++; s.best = Math.max(s.best, s.streak); }
  else { s.streak = 0; s.evLost += cost; }
  save();
}

const stepperHTML = (label, value, pfx) => `<div class="stepper"><span>${label}</span>
  <button class="btn" data-act="${pfx}step" data-v="-1" aria-label="Lower">−</button><b>${signed(value)}</b>
  <button class="btn" data-act="${pfx}step" data-v="1" aria-label="Higher">+</button>
  <button class="btn primary" data-act="${pfx}submit">Check</button></div>`;

const actionButtons = (avail, prefix) => ['H', 'S', 'D', 'P', 'R'].map(a => {
  if (a === 'R' && !state.rules.surrender) return '';
  return `<button class="btn act a-${a}" data-act="${prefix}" data-a="${a}" ${avail[a] ? '' : 'disabled'}>${ACTION_NAMES[a]}<kbd>${a}</kbd></button>`;
}).join('');

/* ---------- Play ---------- */

const flooredTC = () => Math.floor(game.trueCount);
const devTC = () => (state.opts.deviations ? flooredTC() : null);

function playAvail() {
  const av = game.available();
  const committed = game.hands.reduce((s, h) => s + h.bet, 0);
  const canAdd = state.bankroll >= committed + game.hand.bet;
  av.D = av.D && canAdd;
  av.P = av.P && canAdd;
  return av;
}

function countHTML() {
  const mode = state.opts.countMode;
  if (mode === 'off') return '';
  if (mode === 'show') {
    const tc = game.trueCount;
    return `<div class="stat count"><label>Hi-Lo count</label><b>${signed(game.running)} <small>true ${signed(Math.abs(tc) < 0.05 ? 0 : +tc.toFixed(1))}</small></b></div>`;
  }
  const ch = state.count.checks, n = ch[0] + ch[1];
  return `<button class="stat count" data-act="peek"><label>Check my count</label><b>${n ? `${ch[0]}/${n} <small>right</small>` : 'Tap here'}</b></button>`;
}

function countCheck() {
  const q = countQuiz;
  if (!q || q.result) return;
  const ok = q.entry === game.running;
  state.count.checks[ok ? 0 : 1]++;
  q.result = { ok, given: q.entry, rc: game.running, decks: game.decksLeft, tc: flooredTC() };
  save();
  renderPlay();
}

function renderPlay() {
  dealIdx = 0;
  const fadeCls = animateDone ? ' fade' : '';
  const g = game, r = state.rules;
  const inRound = g.phase !== 'bet';
  const dealerShown = inRound && !g.dealer[1].hidden;
  const dealerCards = inRound ? g.dealer.map(cardHTML).join('') : '';
  const handsHTML = inRound ? g.hands.map((h, i) => {
    const cards = h.cards.map(cardHTML).join('');
    const active = g.phase === 'player' && i === g.cur;
    const res = h.result ? `<span class="result r-${h.result.toLowerCase()}${fadeCls}" style="animation-delay:${dealIdx * 130}ms">${h.result}${h.net ? ' ' + money(h.net).replace('$', h.net > 0 ? '+$' : '$') : ''}</span>` : '';
    const label = g.hands.length > 1 ? `<div class="hlabel">Hand ${i + 1}${active ? ' · your turn' : ''}</div>` : '';
    return `<div class="hand${active ? ' active' : ''}">
      ${label}<div class="cards">${cards}</div>
      <div class="meta"><span class="total">${totalLabel(h.cards)}</span><span class="chip">${money(h.bet)}</span>${res}</div>
    </div>`;
  }).join('') : '<div class="placeholder">Place your bet and deal</div>';
  const delay = `animation-delay:${dealIdx * 130}ms`;
  const dealerTotal = !inRound ? '' : dealerShown
    ? `<span class="total${fadeCls}" style="${delay}">${totalLabel(g.dealer)}</span>`
    : `<span class="total">${upLabel(g.upValue)}</span>`;

  let controls;
  if (g.phase === 'player') controls = `<div class="actions">${actionButtons(playAvail(), 'play')}</div>`;
  else if (g.phase === 'insurance') {
    const even = info(g.hands[0].cards).total === 21;
    controls = `<div class="prompt">${even ? 'Even money?' : 'Insurance?'} <small>costs ${money(g.hands[0].bet / 2)}</small></div>
      <div class="actions two"><button class="btn act" data-act="ins" data-a="Y">Yes<kbd>Y</kbd></button><button class="btn act" data-act="ins" data-a="N">No<kbd>N</kbd></button></div>`;
  } else if (state.bankroll < 5) {
    controls = `<div class="prompt">You are out of chips.</div><div class="actions two"><button class="btn primary" data-act="rebuy">Rebuy $1,000</button></div>`;
  } else {
    const tc = flooredTC();
    const advice = state.opts.countMode === 'show'
      ? `<div class="bet-advice">True count ${signed(tc)}: a counter bets ${betUnits(tc)} unit${betUnits(tc) > 1 ? 's' : ''} (${money(betUnits(tc) * state.opts.unit)})</div>` : '';
    controls = `${advice}<div class="betrow">
        <button class="chipbtn c5" data-act="chip" data-v="5">+5</button>
        <button class="chipbtn c25" data-act="chip" data-v="25">+25</button>
        <button class="chipbtn c100" data-act="chip" data-v="100">+100</button>
        <button class="btn ghost" data-act="chip" data-v="0">Clear</button>
      </div>
      <div class="actions two"><button class="btn primary" data-act="deal" ${state.bet >= 5 ? '' : 'disabled'}>Deal ${money(Math.min(state.bet, state.bankroll))}<kbd>␣</kbd></button></div>`;
  }

  let quiz = '';
  if (countQuiz) {
    const q = countQuiz.result, late = animateDone && countQuiz.auto;
    quiz = q
      ? `<div class="coach ${q.ok ? 'ok' : 'bad'}"><b>${q.ok ? '✓ Your count is right.' : `✗ You said ${signed(q.given)}.`} Running count ${signed(q.rc)}.</b>
          <div class="why">With ${q.decks.toFixed(1)} decks left the true count is ${signed(q.tc)}, so a counter bets ${betUnits(q.tc)} unit${betUnits(q.tc) > 1 ? 's' : ''}.</div></div>`
      : `<div class="coach info${late ? ' fade' : ''}" style="${late ? delay : ''}">${stepperHTML('Running count?', countQuiz.entry, 'q')}</div>`;
  }

  main.innerHTML = `<section class="play">
    <div class="hud">
      <div class="stat"><label>Bankroll</label><b>${money(state.bankroll)}</b></div>
      <div class="stat"><label>Accuracy</label><b>${pct(state.stats.correct, state.stats.decisions)}</b></div>
      ${countHTML()}
      <div class="stat"><label>Shoe</label><b>${g.decksLeft.toFixed(1)} <small>decks left</small></b></div>
    </div>
    <div class="felt">
      <div class="dealer"><div class="who">Dealer ${dealerTotal}</div><div class="cards">${dealerCards}</div></div>
      <div class="felt-rules">Blackjack pays ${r.bjPayout === 1.5 ? '3 to 2' : '6 to 5'} · Dealer ${r.h17 ? 'hits' : 'stands on'} soft 17</div>
      <div class="hands n${g.hands.length}">${handsHTML}</div>
    </div>
    <div class="controls">${controls}</div>
    ${coach ? `<div class="coach ${coach.kind}${fadeCls}" style="${animateDone ? delay : ''}">${coach.html}</div>` : ''}
    ${quiz}
  </section>`;
  animateDone = false;
}

function roundSummary() {
  const g = game;
  let line = g.net > 0 ? `You won ${money(g.net)}.` : g.net < 0 ? `You lost ${money(-g.net)}.` : 'Push.';
  if (g.dealerBJ) line = 'Dealer has blackjack. ' + line;
  if (g.insurance) line += g.insuranceNet > 0 ? ' Insurance paid.' : ' Insurance lost.';
  return `<div class="summary">${line}</div>`;
}

function finishIfDone() {
  if (game.phase !== 'done') return;
  animateDone = true;
  state.bankroll += game.net;
  state.stats.hands += game.hands.length;
  state.stats.net += game.net;
  const body = coach && coach.kind === 'bad' ? coach.html : coach ? coach.html : '';
  coach = { kind: coach ? coach.kind : 'info', html: body + roundSummary() };
  if (!countQuiz && state.opts.countMode === 'quiz' && Math.random() < 0.4) countQuiz = { entry: 0, auto: true };
  save();
}

function deal() {
  if (game.phase !== 'bet' && game.phase !== 'done') return;
  const bet = Math.min(state.bet, state.bankroll);
  if (bet < 5) return;
  coach = null; tried = false; countQuiz = null;
  const tcBet = game.pos >= game.cut ? 0 : flooredTC();
  const bankBefore = state.bankroll;
  game.startRound(bet);
  if (game.justShuffled) { seen.clear(); coach = { kind: 'info', html: 'New shoe. The count starts again from zero.' }; }
  if (state.opts.betCheck) {
    const units = betUnits(tcBet), ideal = Math.min(units * state.opts.unit, Math.floor(bankBefore));
    const ok = bet === ideal;
    state.count.bets[ok ? 0 : 1]++;
    const lead = game.justShuffled ? 'New shoe, so the count is 0.' : `The true count was ${signed(tcBet)}.`;
    coach = { kind: ok ? 'ok' : 'bad', html: `<b>${ok ? '✓' : '✗'} Bet check.</b> <span class="why">${lead} That calls for ${units} unit${units > 1 ? 's' : ''} (${money(ideal)})${ok ? '.' : `, and you bet ${money(bet)}.`}</span>` };
  }
  finishIfDone();
  renderPlay();
}

function playAct(a) {
  if (game.phase !== 'player') return;
  const av = playAvail();
  if (!av[a]) return;
  const hand = game.hand;
  const adv = advise(values(hand.cards), game.upValue, state.rules, av, devTC());
  const right = a === adv.action;
  if (!tried) record(adv.cell, right, right ? 0 : Math.max(0, (adv.evs[adv.action] ?? 0) - (adv.evs[a] ?? 0)) * hand.bet);
  coach = feedback(adv, a);
  if (!right && state.opts.block) {
    tried = true;
    coach.html += '<div class="retry">Choose the right play to continue.</div>';
    return renderPlay();
  }
  tried = false;
  const wasCur = game.cur, splitAces = a === 'P' && cardValue(hand.cards[0].r) === 11;
  game.act(a);
  if (splitAces) coach.html += '<div class="retry">Split aces get one card each in Vegas, so both hands are finished.</div>';
  else if (a === 'P' && game.phase === 'player') coach.html += `<div class="retry">Now play hand ${game.cur + 1}. The next hand gets its second card when you reach it.</div>`;
  else if (game.phase === 'player' && game.cur !== wasCur) coach.html += `<div class="retry">Now play hand ${game.cur + 1}.</div>`;
  finishIfDone();
  renderPlay();
}

function insurance(yes) {
  if (game.phase !== 'insurance') return;
  const tc = devTC();
  const ideal = tc !== null && tc >= INSURANCE_INDEX;
  const right = yes === ideal;
  if (!tried) record('i:ins:11', right, right ? 0 : 0.037 * game.hands[0].bet);
  const why = ideal
    ? `The true count is ${signed(tc)}. At +${INSURANCE_INDEX} or higher there are enough tens left for insurance to be a winning bet.`
    : 'Insurance pays 2 to 1 on a bet that is about 9 to 4 against. It costs about 7% of the side bet every time, even when you hold a blackjack.';
  coach = { kind: right ? 'ok' : 'bad', html: `<b>${right ? '✓' : '✗'} ${ideal ? 'Take' : 'Decline'} insurance${right ? '' : ' here'}.</b> <span class="why">${why}</span>` };
  if (!right && state.opts.block) { tried = true; return renderPlay(); }
  tried = false;
  game.takeInsurance(yes);
  finishIfDone();
  renderPlay();
}

/* ---------- Train: learning path, free drill, exam ---------- */

const WINDOW = 20, NEED = 19, EXAM_N = 50, EXAM_PASS = 48, EXAM_SECONDS = 6;
const drill = { mode: 'path', filter: 'all', stage: null, q: null, answered: null, right: 0, total: 0, streak: 0 };
const exam = { on: false, timed: false, i: 0, q: null, log: [], timer: null, result: null };
const SUITS = ['♠', '♥', '♦', '♣'];
const rankFor = v => (v === 11 ? 'A' : v === 10 ? pick(['10', 'J', 'Q', 'K']) : String(v));
let drillId = 0;
const mkCard = v => ({ r: rankFor(v), s: pick(SUITS), id: `d${++drillId}` });

function stages() {
  const r = state.rules;
  return [
    { id: 'stiff', title: 'Stiff hands', sub: 'Hard 12 to 17',
      rule: `Stand against a dealer 2 to 6 and hit against 7 or higher. The exception: hit 12 against a 2 or 3. Always stand on 17.${r.surrender ? ` Surrender comes first: give up 16 against 9, 10 or Ace, and 15 against 10${r.h17 ? ', plus 15 and 17 against an Ace' : ''}.` : ''}`,
      match: c => c.type === 'h' && c.k >= 12 && c.k <= 17 },
    { id: 'double', title: 'Doubling down', sub: 'Hard 11 and under',
      rule: `Double 11 against ${r.h17 ? 'everything' : 'everything except an Ace'}. Double 10 against 2 to 9. Double 9 against 3 to 6. Otherwise hit, and always hit 8 or less.`,
      match: c => c.type === 'h' && c.k <= 11 },
    { id: 'soft', title: 'Soft hands', sub: 'An Ace counted as 11',
      rule: `Soft 19 and 20 stand${r.h17 ? ' (double soft 19 against a 6)' : ''}. Soft 18: double against ${r.h17 ? '2' : '3'} to 6, stand against ${r.h17 ? '' : '2, '}7 and 8, hit against 9, 10 and Ace. Soft 17 doubles against 3 to 6, soft 15 and 16 against 4 to 6, soft 13 and 14 against 5 and 6. Otherwise hit: a soft hand never stands below 18.`,
      match: c => c.type === 's' },
    { id: 'pairs', title: 'Pairs', sub: 'Split or not',
      rule: `Always split Aces and 8s. Never split 10s or 5s (play 5,5 as a 10). 9s: split against 2 to 9, but stand against 7. 7s: split against 2 to 7. ${r.das ? '6s against 2 to 6. 2s and 3s against 2 to 7. 4s only against 5 and 6.' : '6s against 3 to 6. 2s and 3s against 4 to 7. Never split 4s.'}${r.surrender && r.h17 ? ' Surrender 8,8 against an Ace.' : ''}`,
      match: c => c.type === 'p' },
    { id: 'multi', title: 'Three-card hands', sub: 'After you have hit',
      rule: 'Once you have hit you cannot double, split or surrender. Hands you would have doubled become hits, except soft 18 (and soft 19), which stand. Watch for soft hands hiding in three cards: Ace, 2, 4 is a soft 17, so hit it.',
      multi: 1, match: c => (c.type === 'h' && c.k >= 9 && c.k <= 17) || (c.type === 's' && c.k >= 14 && c.k <= 19) },
    { id: 'mixed', title: 'Everything mixed', sub: 'Like a real shoe',
      rule: `Ask in this order: ${r.surrender ? 'Should I surrender? ' : ''}Should I split? Should I double? Then hit or stand.`,
      multi: 0.2, match: () => true },
  ];
}

function stageProgress(id) {
  const r = state.path[id] || [];
  const n = r.reduce((a, b) => a + b, 0);
  return { n, len: r.length, done: r.length >= WINDOW && n >= NEED };
}

function drillCells() {
  const cells = [];
  for (const up of UPS) {
    for (let t = 8; t <= 18; t++) cells.push({ type: 'h', k: t, up });
    for (let t = 13; t <= 20; t++) cells.push({ type: 's', k: t, up });
    for (let v = 2; v <= 11; v++) cells.push({ type: 'p', k: v, up });
  }
  return cells;
}

function multiVals(c) {
  if (c.type === 's') {
    const n = c.k - 11;
    if (n < 3) return null;
    if (n === 3) return [11, 11, 2];
    const a = 2 + Math.floor(Math.random() * (n - 3));
    return [11, a, n - a];
  }
  for (let i = 0; i < 40; i++) {
    const a = 2 + Math.floor(Math.random() * 9), b = 2 + Math.floor(Math.random() * 9), d = c.k - a - b;
    if (d >= 2 && d <= 10) return [a, b, d];
  }
  return null;
}

function makeQuestion(match, multiP = 0, weakOnly = false) {
  let cells = drillCells().filter(match);
  const stat = c => state.stats.cells[`${c.type}:${c.k}:${c.up}`];
  if (weakOnly) {
    const weak = cells.filter(c => stat(c) && stat(c)[1] > 0);
    drill.noWeak = weak.length === 0;
    if (weak.length) cells = weak;
  }
  const weights = cells.map(c => {
    const s = stat(c);
    const trivial = (c.type === 'h' && (c.k <= 8 || c.k >= 17)) || (c.type === 's' && c.k >= 19) || (c.type === 'p' && (c.k === 10 || c.k === 5));
    return (trivial ? 0.35 : 1) * (1 + (s ? (4 * s[1]) / (s[0] + s[1]) : 0.5));
  });
  let x = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
  while (i < cells.length - 1 && (x -= weights[i]) > 0) i++;
  const c = cells[i];
  let vals = c.type !== 'p' && Math.random() < multiP ? multiVals(c) : null;
  const multi = !!vals;
  if (!vals) {
    if (c.type === 'p') vals = [c.k, c.k];
    else if (c.type === 's') vals = [11, c.k - 11];
    else {
      const opts = [];
      for (let a = Math.max(2, c.k - 10); a <= Math.min(10, c.k - 2); a++) if (a !== c.k - a) opts.push(a);
      const a = pick(opts);
      vals = [a, c.k - a];
    }
  }
  const cards = vals.map(mkCard);
  if (c.type === 'p') cards[1].r = cards[0].r;
  cards.sort(() => Math.random() - 0.5);
  return { cards, up: mkCard(c.up), upValue: c.up, multi };
}

function availFor(q) {
  if (q.multi) return { H: true, S: true, D: false, P: false, R: false };
  return { H: true, S: true, D: true, P: handInfo(values(q.cards)).pair !== null, R: state.rules.surrender };
}

function nextDrill() {
  if (drill.mode === 'path' && drill.stage) {
    const st = stages().find(s => s.id === drill.stage);
    drill.q = makeQuestion(st.match, st.multi || 0);
  } else {
    const f = drill.filter;
    drill.q = makeQuestion(c => f === 'all' || f === 'weak' || c.type === f, f === 'all' ? 0.15 : 0, f === 'weak');
  }
  drill.answered = null;
}

function handUI(q, answered, prefix) {
  return `<div class="felt small">
      <div class="dealer"><div class="who">Dealer shows</div><div class="cards">${cardHTML(q.up)}<div class="card back"></div></div></div>
      <div class="hands"><div class="hand active"><div class="cards">${q.cards.map(cardHTML).join('')}</div>
        <div class="meta"><span class="total">${totalLabel(q.cards)}</span></div></div></div>
    </div>
    <div class="controls">${answered
      ? '<div class="actions two"><button class="btn primary" data-act="dnext">Next hand<kbd>␣</kbd></button></div>'
      : `<div class="actions">${actionButtons(availFor(q), prefix)}</div>`}</div>
    ${answered ? `<div class="coach ${answered.kind}">${answered.html}</div>` : ''}`;
}

function pathHTML() {
  const list = stages();
  const firstOpen = list.find(s => !stageProgress(s.id).done);
  const rows = list.map((s, i) => {
    const p = stageProgress(s.id);
    return `<button class="stage${p.done ? ' done' : ''}${firstOpen === s ? ' next' : ''}" data-act="stage" data-v="${s.id}">
      <span class="num">${p.done ? '✓' : i + 1}</span>
      <span class="st"><b>${s.title}</b><small>${s.sub}</small><span class="bar"><i style="width:${(100 * p.n) / WINDOW}%"></i></span></span>
      <span class="state">${p.done ? 'Mastered' : p.len ? `${p.n}/${WINDOW}` : 'Start'}</span></button>`;
  }).join('');
  const e = state.exam;
  return `<p class="lead">Work through the chart one piece at a time. A stage is mastered when you get ${NEED} of your last ${WINDOW} hands right.</p>
    <div class="stages">${rows}
      <button class="stage${e.best >= EXAM_PASS ? ' done' : ''}${firstOpen ? '' : ' next'}" data-act="tmode" data-v="exam">
        <span class="num">${e.best >= EXAM_PASS ? '✓' : '★'}</span>
        <span class="st"><b>Final exam</b><small>${EXAM_N} hands, no feedback until the end</small></span>
        <span class="state">${e.taken ? `Best ${e.best}/${EXAM_N}` : 'Take it'}</span></button>
    </div>`;
}

function examHTML() {
  const e = state.exam;
  if (exam.on) {
    return `<div class="examhead"><b>Hand ${exam.i + 1} of ${EXAM_N}</b><button class="pill" data-act="examquit">Quit exam</button></div>
      <div class="bar"><i style="width:${(100 * exam.i) / EXAM_N}%"></i></div>
      ${exam.timed ? `<div class="bar timer"><i style="animation-duration:${EXAM_SECONDS}s"></i></div>` : ''}
      ${handUI(exam.q, null, 'exam')}`;
  }
  const res = exam.result;
  let top = '';
  if (res) {
    const verdict = res.score === EXAM_N ? 'Perfect. That is table-ready play.'
      : res.score >= EXAM_PASS ? 'Pass. Clean up the hands below and you are ready.'
        : 'Not there yet. Drill the hands below and try again.';
    const misses = res.misses.map(m => `<div class="coach bad"><b>${m.q.cards.map(c => c.r).join(', ')} against ${m.q.up.r}:</b>
      you ${m.a ? `chose ${ACTION_NAMES[m.a].toLowerCase()}` : 'ran out of time'}, the right play is <b>${ACTION_NAMES[m.adv.action].toLowerCase()}</b>.
      <div class="why">${m.adv.why}</div></div>`).join('');
    top = `<div class="score ${res.score >= EXAM_PASS ? 'pass' : 'fail'}"><b>${res.score}<small>/${EXAM_N}</small></b><span>${verdict}</span></div>${misses}`;
  }
  return `${top}<p class="lead">${EXAM_N} mixed hands with no corrections until the end, weighted toward the hands you find hardest. ${EXAM_PASS} or better is a pass.${e.taken ? ` Best so far: <b>${e.best}/${EXAM_N}</b> over ${e.taken} attempt${e.taken > 1 ? 's' : ''}.` : ''}</p>
    <div class="pills">
      <button class="pill${exam.timed ? '' : ' on'}" data-act="examtimed" data-v="0">No time limit</button>
      <button class="pill${exam.timed ? ' on' : ''}" data-act="examtimed" data-v="1">Table pace: ${EXAM_SECONDS} seconds a hand</button>
    </div>
    <div class="actions two"><button class="btn primary" data-act="examstart">${res ? 'Take it again' : 'Start the exam'}</button></div>`;
}

function renderDrill() {
  dealIdx = 0;
  let body;
  if (drill.mode === 'exam') body = examHTML();
  else if (drill.mode === 'path' && !drill.stage) body = pathHTML();
  else {
    if (!drill.q) nextDrill();
    let head;
    if (drill.mode === 'path') {
      const st = stages().find(s => s.id === drill.stage), p = stageProgress(st.id);
      head = `<div class="examhead"><h3>${st.title}</h3><button class="pill" data-act="stageback">← All stages</button></div>
        <div class="coach info rule">${st.rule}</div>
        <div class="mastery"><span>${p.done ? '✓ Mastered' : `${p.n} of your last ${WINDOW} right (need ${NEED})`}</span><span class="bar"><i style="width:${(100 * p.n) / WINDOW}%"></i></span></div>`;
    } else {
      const filters = [['all', 'All hands'], ['h', 'Hard'], ['s', 'Soft'], ['p', 'Pairs'], ['weak', 'My weak spots']]
        .map(([k, l]) => `<button class="pill${drill.filter === k ? ' on' : ''}" data-act="dfilter" data-v="${k}">${l}</button>`).join('');
      head = `<div class="pills">${filters}</div>
        ${drill.filter === 'weak' && drill.noWeak ? '<p class="note">No missed hands recorded yet, so this is showing all hands.</p>' : ''}
        <div class="hud">
          <div class="stat"><label>This session</label><b>${drill.right}/${drill.total}</b></div>
          <div class="stat"><label>Accuracy</label><b>${pct(drill.right, drill.total)}</b></div>
          <div class="stat"><label>Streak</label><b>${drill.streak}</b></div>
        </div>`;
    }
    body = head + handUI(drill.q, drill.answered, 'drill');
  }
  const modes = exam.on ? '' : `<div class="pills modes">${[['path', 'Learning path'], ['free', 'Free drill'], ['exam', 'Exam']]
    .map(([k, l]) => `<button class="pill${drill.mode === k ? ' on' : ''}" data-act="tmode" data-v="${k}">${l}</button>`).join('')}</div>`;
  main.innerHTML = `<section class="drill">${modes}${body}</section>`;
}

function drillAct(a) {
  if (drill.mode === 'exam') return examAct(a);
  const q = drill.q;
  if (!q || drill.answered || (drill.mode === 'path' && !drill.stage)) return;
  if (!availFor(q)[a]) return;
  const adv = advise(values(q.cards), q.upValue, state.rules, availFor(q));
  const right = a === adv.action;
  record(adv.cell, right);
  drill.total++;
  if (right) { drill.right++; drill.streak++; } else drill.streak = 0;
  drill.answered = feedback(adv, a);
  if (drill.mode === 'path') {
    const was = stageProgress(drill.stage).done;
    const r = state.path[drill.stage] || (state.path[drill.stage] = []);
    r.push(right ? 1 : 0);
    if (r.length > WINDOW) r.shift();
    if (!was && stageProgress(drill.stage).done) drill.answered.html += '<div class="retry">Stage mastered. Go back to all stages for the next one.</div>';
    save();
  }
  renderDrill();
}

function examNext() {
  clearTimeout(exam.timer);
  if (exam.i >= EXAM_N) {
    exam.on = false;
    const score = exam.log.filter(l => l.right).length;
    exam.result = { score, misses: exam.log.filter(l => !l.right) };
    const e = state.exam;
    e.taken++; e.last = score; e.best = Math.max(e.best, score);
    save();
  } else {
    exam.q = makeQuestion(() => true, 0.2);
    if (exam.timed) exam.timer = setTimeout(() => examAct(null), EXAM_SECONDS * 1000);
  }
  renderDrill();
  window.scrollTo(0, 0);
}

function examAct(a) {
  if (!exam.on) return;
  const q = exam.q, avail = availFor(q);
  if (a && !avail[a]) return;
  const adv = advise(values(q.cards), q.upValue, state.rules, avail);
  const right = a === adv.action;
  record(adv.cell, right);
  exam.log.push({ q, a, adv, right });
  exam.i++;
  examNext();
}

function examStart() {
  Object.assign(exam, { on: true, i: 0, log: [], result: null });
  examNext();
}

function examQuit() {
  clearTimeout(exam.timer);
  exam.on = false;
}

/* ---------- Chart ---------- */

const chart = { acc: false, sel: null };
const CODE_CLASS = { H: 'cH', S: 'cS', D: 'cD', Ds: 'cD', P: 'cP', Rh: 'cR', Rs: 'cR', Rp: 'cR' };

function rulesSummary() {
  const r = state.rules;
  return `${r.decks} decks · dealer ${r.h17 ? 'hits' : 'stands on'} soft 17 · ${r.das ? 'double after split' : 'no double after split'} · ${r.surrender ? 'late surrender' : 'no surrender'} · blackjack pays ${r.bjPayout === 1.5 ? '3:2' : '6:5'}`;
}

function chartTable(title, type, rows) {
  const r = state.rules;
  const head = `<tr><th></th>${UPS.map(u => `<th>${upLabel(u)}</th>`).join('')}</tr>`;
  const body = rows.map(([k, label]) => {
    const tds = UPS.map(u => {
      const code = type === 'h' ? hardCode(k, u, r) : type === 's' ? softCode(k, u, r) : pairCode(k, u, r);
      const id = `${type}:${k}:${u}`;
      const s = state.stats.cells[id];
      let cls = CODE_CLASS[code], text = code[0] === 'R' ? 'R' : code;
      let style = '';
      if (chart.acc) {
        cls = 'acc';
        if (s) { const p = s[0] / (s[0] + s[1]); text = Math.round(p * 100); style = `background:hsl(${Math.round(p * 130)} 55% 32%)`; }
        else text = '·';
      }
      return `<td class="${cls}${chart.sel === id ? ' sel' : ''}" style="${style}" data-act="cell" data-id="${id}">${text}</td>`;
    }).join('');
    return `<tr><th>${label}</th>${tds}</tr>`;
  }).join('');
  return `<h3>${title}</h3><div class="chart-wrap"><table class="chart">${head}${body}</table></div>`;
}

function cellDetail() {
  if (!chart.sel) return '<p class="note">Tap any cell for the reasoning behind it.</p>';
  const [type, ks, us] = chart.sel.split(':');
  const k = +ks, up = +us;
  const vals = type === 'p' ? [k, k] : type === 's' ? [11, k - 11] : k >= 12 ? [10, k - 10] : [k - 2, 2];
  const avail = { H: true, S: true, D: true, P: type === 'p', R: state.rules.surrender };
  const adv = advise(vals, up, state.rules, avail);
  const name = type === 'p' ? `Pair of ${k === 11 ? 'Aces' : k + 's'}` : `${type === 's' ? 'Soft' : 'Hard'} ${k}`;
  const fallback = { D: 'If you cannot double, hit.', Ds: 'If you cannot double, stand.', Rh: 'If surrender is not offered, hit.', Rs: 'If surrender is not offered, stand.', Rp: 'If surrender is not offered, split.' }[adv.code] || '';
  const s = state.stats.cells[chart.sel];
  return `<div class="coach info"><b>${name} against ${up === 11 ? 'an Ace' : up}: ${ACTION_NAMES[adv.action]}.</b>
    <div class="why">${adv.why} ${fallback}</div>${evLine(adv)}
    ${s ? `<div class="ev">Your record on this hand: ${s[0]} right, ${s[1]} wrong.</div>` : ''}</div>`;
}

function renderChart() {
  const hard = [[8, '≤8'], ...[9, 10, 11, 12, 13, 14, 15, 16, 17].map(t => [t, t]), [18, '18+']];
  const soft = [13, 14, 15, 16, 17, 18, 19, 20].map(t => [t, `A,${t - 11}`]);
  const pairs = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map(v => [v, v === 11 ? 'A,A' : `${v},${v}`]);
  main.innerHTML = `<section class="chartview">
    <p class="lead">Basic strategy for your table: ${rulesSummary()}. House edge about <b>${houseEdge(state.rules).toFixed(2)}%</b>.</p>
    <div class="pills">
      <button class="pill${chart.acc ? '' : ' on'}" data-act="cacc" data-v="0">Strategy</button>
      <button class="pill${chart.acc ? ' on' : ''}" data-act="cacc" data-v="1">My accuracy</button>
    </div>
    ${chart.acc ? '<p class="note">Percent correct for each hand you have faced. A dot means you have not seen it yet.</p>'
      : `<div class="legend"><span class="cH">H Hit</span><span class="cS">S Stand</span><span class="cD">D Double (else hit)</span><span class="cD">Ds Double (else stand)</span><span class="cP">P Split</span>${state.rules.surrender ? '<span class="cR">R Surrender</span>' : ''}</div>`}
    <div id="detail">${cellDetail()}</div>
    <div class="charts">
      <div>${chartTable('Hard totals', 'h', hard)}</div>
      <div>${chartTable('Soft totals', 's', soft)}${chartTable('Pairs', 'p', pairs)}</div>
    </div>
    <p class="note">Columns are the dealer's upcard. Check pairs first, then soft totals, then hard totals. Never take insurance.</p>
  </section>`;
}

/* ---------- Count: a staged Hi-Lo course ---------- */

const CSTAGES = [
  { id: 'values', title: 'Card values', sub: 'Every card is +1, 0 or −1', w: 20, need: 19,
    concept: `<p>Counting is not memorising cards. You keep one number that tells you whether the cards still in the shoe are rich in high cards or low cards.</p>
      <p>High cards help you: more blackjacks paid at 3 to 2, stronger doubles, and a dealer who busts more often. Low cards help the dealer. So each card that leaves the shoe gets a value:</p>
      <table class="info"><tr><td>2, 3, 4, 5, 6</td><td class="plus"><b>+1</b></td><td>A low card is gone. Good for you.</td></tr>
      <tr><td>7, 8, 9</td><td><b>0</b></td><td>Neutral. Ignore it.</td></tr>
      <tr><td>10, J, Q, K, A</td><td class="minus"><b>−1</b></td><td>A high card is gone. Bad for you.</td></tr></table>
      <p>This is the Hi-Lo system. Drill until the value comes to you without thinking.</p>` },
  { id: 'pairs', title: 'Cancelling pairs', sub: 'Read two cards as one number', w: 20, need: 19,
    concept: `<p>At a table the cards arrive in twos, too quickly to add one at a time. Learn to see a pair as a single value.</p>
      <ul><li>A high card and a low card cancel: <b>King + 5 = 0</b>. Skip them.</li>
      <li>Two low cards are <b>+2</b>, two high cards are <b>−2</b>.</li>
      <li>A 7, 8 or 9 adds nothing, so the pair is worth whatever the other card is.</li></ul>
      <p>Most hands at a real table cancel to zero or one. That is what makes counting possible at speed.</p>` },
  { id: 'running', title: 'Running count', sub: 'Keep the total as cards go by', w: 5, need: 4,
    concept: `<p>Start at <b>0</b> when the shoe is shuffled. Add each card's value as you see it and carry the total from round to round. That total is the <b>running count</b>.</p>
      <p>Example: 5, K, 3, 6, 9, A, 4 is +1, 0, +1, +2, +2, +1, <b>+2</b>.</p>
      <p>A positive count means more low cards have gone, so the remaining shoe is rich in tens and aces. A negative count means the opposite.</p>
      <p>Start slow and raise the speed only when you are getting it right. To pass a full deck at "Casino speed" is a good target: a whole deck always ends on 0.</p>` },
  { id: 'table', title: 'Counting a table', sub: 'Whole rounds, like the real thing', w: 10, need: 9,
    concept: `<p>In a real game you do not see cards one by one. You see a table full of hands. Counting it is a routine:</p>
      <ol><li>As the first two cards land, count each player's hand as a pair.</li>
      <li>Add the dealer's upcard.</li>
      <li>Add each hit card as it is dealt.</li>
      <li>Add the dealer's hole card and draws when they turn over.</li></ol>
      <p>Here each screen is one finished round at a table with three players. Carry your count forward from round to round, and enter the running count after each one.</p>` },
  { id: 'true', title: 'True count', sub: 'Adjust for the cards left', w: 10, need: 9,
    concept: `<p>A running count of +6 means much more with one deck left than with five. Six extra high cards in 52 is a rich deck; six in 260 is barely noticeable.</p>
      <p class="formula">true count = running count ÷ decks left</p>
      <ul><li>Running +6 with 3 decks left: true <b>+2</b>.</li>
      <li>Running +6 with 1 deck left: true <b>+6</b>.</li>
      <li>Running +3 with half a deck left: true <b>+6</b> (dividing by a half doubles it).</li>
      <li>Running −4 with 2 decks left: true <b>−2</b>.</li></ul>
      <p>Round <b>down</b> to the whole number below: +7 ÷ 2 = 3.5 is a true count of +3, and −3 ÷ 2 = −1.5 is −2. At the table you estimate decks left by looking at the discard tray: a six-deck shoe with two decks in the tray has four left.</p>` },
  { id: 'bet', title: 'Betting with the count', sub: 'Where the money is made', w: 10, need: 9,
    concept: `<p>The count's main use is to tell you how much to bet. Each point of true count is worth about half a percent to you. The house starts about half a percent ahead, so you draw level around +1 and have the edge from +2 up.</p>
      <table class="info"><tr><th>True count</th><th>Bet</th><th>Your edge, roughly</th></tr>
      <tr><td>+1 or less</td><td>1 unit</td><td>House has the edge</td></tr>
      <tr><td>+2</td><td>2 units</td><td>+0.5%</td></tr><tr><td>+3</td><td>4 units</td><td>+1%</td></tr>
      <tr><td>+4</td><td>6 units</td><td>+1.5%</td></tr><tr><td>+5 or more</td><td>8 units</td><td>+2% and up</td></tr></table>
      <p>A unit is your minimum bet. This 1 to 8 spread is what turns a small edge into a profit: you bet little when the house is ahead and a lot when you are. Betting more at a negative count, or failing to raise at a high one, gives the edge back.</p>` },
  { id: 'dev', title: 'Playing deviations', sub: 'When the count changes the play', w: 20, need: 18,
    concept: `<p>Basic strategy assumes an average shoe. When the count says the shoe is not average, a few plays change. Each has an <b>index</b>: at that true count or higher you make the deviation.</p>
      <ul><li><b>Insurance</b> at +3 or higher. The most valuable one.</li>
      <li><b>16 against 10</b>: stand at 0 or higher (if you cannot surrender).</li>
      <li><b>15 against 10</b>: stand at +4 or higher.</li>
      <li><b>12 against 3</b>: stand at +2. <b>12 against 2</b>: stand at +3.</li>
      <li><b>10 against 10 or Ace</b>: double at +4.</li>
      <li><b>12 against 4</b>: hit when the count is below 0.</li></ul>
      <p>The logic is always the same. A high count means more tens: stiff hands bust more often if you hit, doubles land more often, and the dealer's ten in the hole is more likely. A low count means the reverse. The full list is at the bottom of this stage.</p>` },
];

const cc = { stage: null, q: null, ans: null, entry: 0, rc: 0, round: 0, flash: { phase: 'idle', n: 20, speed: 1000, cards: [], i: 0, timer: null } };
const anyVal = () => pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11]);
const cardsCount = cards => cards.reduce((s, c) => s + hiLo(cardValue(c.r)), 0);

function cProgress(id) {
  const st = CSTAGES.find(s => s.id === id), r = state.count.stages[id] || [];
  const n = r.reduce((a, b) => a + b, 0);
  return { n, len: r.length, done: r.length >= st.w && n >= st.need };
}

function cStop() {
  clearInterval(cc.flash.timer);
  if (cc.flash.phase === 'running') cc.flash.phase = 'idle';
}

function twoCardVals(t) {
  const opts = [];
  for (let a = Math.max(2, t - 10); a <= Math.min(10, t - 2); a++) if (a !== t - a) opts.push(a);
  const a = pick(opts);
  return [a, t - a];
}

function cNewQuestion() {
  cc.ans = null;
  const id = cc.stage;
  if (id === 'values') cc.q = { cards: [mkCard(anyVal())] };
  else if (id === 'pairs') cc.q = { cards: [mkCard(anyVal()), mkCard(anyVal())] };
  else if (id === 'running') { cc.q = null; cc.flash.phase = 'idle'; }
  else if (id === 'table') {
    const hand = limit => { const cs = [mkCard(anyVal()), mkCard(anyVal())]; while (handInfo(values(cs)).total < limit && cs.length < 5) cs.push(mkCard(anyVal())); return cs; };
    const q = { dealer: hand(17), hands: [0, 1, 2].map(() => hand(pick([12, 13, 15, 17]))), prev: cc.rc };
    q.answer = cc.rc + cardsCount([...q.dealer, ...q.hands.flat()]);
    cc.round++;
    cc.entry = cc.rc;
    cc.q = q;
  } else if (id === 'true') {
    const decks = pick([0.5, 1, 1.5, 2, 3, 4, 5]);
    const rc = Math.round((Math.random() * 8 - 2) * decks) + (Math.random() < 0.5 ? 1 : 0);
    const answer = Math.floor(rc / decks);
    const opts = new Set([answer]);
    for (const d of [1, -1, 2, -2, 3]) { if (opts.size < 4) opts.add(answer + d); }
    cc.q = { decks, rc, answer, exact: rc / decks, opts: [...opts].sort((a, b) => a - b) };
  } else if (id === 'bet') {
    const tc = Math.floor(Math.random() * 10) - 2;
    cc.q = { tc, answer: betUnits(tc) };
  } else if (id === 'dev') {
    const r = state.rules;
    const d = pick(DEVIATIONS.filter(x => !(x.s17only && r.h17) && !(x.surr && !r.surrender) && !(x.noSurr && r.surrender)));
    const tc = d.idx + pick([-2, -1, 0, 1]);
    const vals = d.pair ? [10, 10] : twoCardVals(d.t);
    const cards = vals.map(mkCard);
    if (d.pair) cards[1].r = cards[0].r;
    const avail = { H: true, S: true, D: true, P: !!d.pair, R: r.surrender };
    cc.q = { d, tc, cards, up: mkCard(d.up), avail, adv: advise(vals, d.up, r, avail, tc) };
  }
}

function cAnswer(v) {
  if (!cc.q || cc.ans) return;
  const q = cc.q, id = cc.stage;
  let ok, html;
  if (id === 'values' || id === 'pairs') {
    const answer = cardsCount(q.cards);
    ok = v === answer;
    const parts = q.cards.map(c => `${c.r} is ${signed(hiLo(cardValue(c.r)))}`).join(', ');
    html = `<b>${ok ? '✓' : '✗'} ${signed(answer)}.</b> <span class="why">${parts}${q.cards.length > 1 ? `, so the pair is ${signed(answer)}` : ''}.</span>`;
  } else if (id === 'table') {
    ok = v === q.answer;
    const rows = [['Dealer', q.dealer], ...q.hands.map((h, i) => [`Player ${i + 1}`, h])]
      .map(([n, cs]) => `${n} ${signed(cardsCount(cs))}`).join(' · ');
    html = `<b>${ok ? '✓' : `✗ You said ${signed(v)}.`} The running count is ${signed(q.answer)}.</b>
      <div class="why">Started at ${signed(q.prev)}. This round: ${rows}.</div>${ok ? '' : '<div class="ev">Carry on from the correct count.</div>'}`;
    cc.rc = q.answer;
  } else if (id === 'true') {
    ok = v === q.answer;
    html = `<b>${ok ? '✓' : '✗'} True count ${signed(q.answer)}.</b> <span class="why">${signed(q.rc)} ÷ ${q.decks} = ${signed(+q.exact.toFixed(1))}${Number.isInteger(q.exact) ? '' : `, rounded down to ${signed(q.answer)}`}.</span>`;
  } else if (id === 'bet') {
    ok = v === q.answer;
    html = `<b>${ok ? '✓' : '✗'} ${q.answer} unit${q.answer > 1 ? 's' : ''} at a true count of ${signed(q.tc)}.</b> <span class="why">${q.tc <= 1 ? 'The house still has the edge at +1 or less, so bet the minimum.' : `You have roughly a ${((q.tc - 1) * 0.5).toFixed(1)}% edge here, so get more money out.`}</span>`;
  } else if (id === 'dev') {
    const { d, adv } = q;
    ok = v === adv.action;
    const hand = d.pair ? 'a pair of tens' : d.t;
    html = `<b>${ok ? `✓ ${ACTION_NAMES[v]} is correct.` : `✗ You chose ${ACTION_NAMES[v].toLowerCase()}. The right play is ${ACTION_NAMES[adv.action].toLowerCase()}.`}</b>
      <div class="why">The index for ${hand} against ${upLabel(d.up)} is ${signed(d.idx)}: ${ACTION_NAMES[d.ge].toLowerCase()} at ${signed(d.idx)} or higher, otherwise ${ACTION_NAMES[d.lt].toLowerCase()}. The true count here is ${signed(q.tc)}.</div>`;
  }
  cFinish(ok, html);
}

function cFinish(ok, html) {
  const id = cc.stage, st = CSTAGES.find(s => s.id === id);
  const was = cProgress(id).done;
  const r = state.count.stages[id] || (state.count.stages[id] = []);
  r.push(ok ? 1 : 0);
  if (r.length > st.w) r.shift();
  if (!was && cProgress(id).done) html += '<div class="retry">Stage mastered. Go back to all stages for the next one.</div>';
  cc.ans = { kind: ok ? 'ok' : 'bad', html };
  cc.open = false;
  save();
  renderCount();
}

function cFlashStart() {
  const f = cc.flash;
  f.cards = Array.from({ length: f.n }, () => mkCard(anyVal()));
  if (f.n === 52) {
    const deck = [];
    for (const v of [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11]) for (let i = 0; i < 4; i++) deck.push(v);
    deck.sort(() => Math.random() - 0.5);
    f.cards = deck.map(mkCard);
  }
  f.i = 0; f.phase = 'running'; cc.ans = null; cc.entry = 0; cc.open = false;
  renderCount();
  clearInterval(f.timer);
  f.timer = setInterval(() => {
    if (state.view !== 'count') return cStop();
    f.i++;
    if (f.i >= f.n) { clearInterval(f.timer); f.phase = 'answer'; }
    renderCount();
  }, f.speed);
}

function cSubmit() {
  if (cc.stage === 'table') return cAnswer(cc.entry);
  const f = cc.flash;
  if (cc.stage !== 'running' || f.phase !== 'answer') return;
  const answer = cardsCount(f.cards), ok = cc.entry === answer;
  f.phase = 'idle';
  const trail = f.cards.map(c => `<span class="${hiLo(cardValue(c.r)) > 0 ? 'plus' : hiLo(cardValue(c.r)) < 0 ? 'minus' : ''}">${c.r}</span>`).join('');
  cFinish(ok, `<b>${ok ? '✓ Correct.' : `✗ You said ${signed(cc.entry)}.`} The running count was ${signed(answer)}.</b><div class="cards mini">${trail}</div>`);
}

const stepper = label => stepperHTML(label, cc.entry, 'c');
const choices = (vals, fmt) => `<div class="actions choices">${vals.map(v => `<button class="btn" data-act="cans" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;
const nextBtn = '<div class="actions two"><button class="btn primary" data-act="cnext">Next<kbd>␣</kbd></button></div>';

function cStageBody() {
  const id = cc.stage, q = cc.q, a = cc.ans;
  const ansHTML = a ? `<div class="coach ${a.kind}">${a.html}</div>` : '';
  if (id === 'values' || id === 'pairs') {
    return `<div class="felt small flash"><div class="cards big">${q.cards.map(cardHTML).join('')}</div></div>
      <div class="controls">${a ? nextBtn : choices(id === 'values' ? [1, 0, -1] : [2, 1, 0, -1, -2], signed)}</div>${ansHTML}`;
  }
  if (id === 'running') {
    const f = cc.flash;
    if (f.phase === 'running') {
      return `<div class="felt small flash"><div class="cards big">${cardHTML(f.cards[f.i])}</div>
        <div class="felt-rules">Card ${f.i + 1} of ${f.n}</div></div>
        <div class="actions two"><button class="btn ghost" data-act="cstop">Stop</button></div>`;
    }
    if (f.phase === 'answer') return `<div class="controls">${stepper('Running count?')}</div>`;
    const sp = [[1500, 'Slow'], [1000, 'Medium'], [600, 'Fast'], [350, 'Casino speed']]
      .map(([v, l]) => `<button class="pill${f.speed === v ? ' on' : ''}" data-act="cspeed" data-v="${v}">${l}</button>`).join('');
    const ns = [[10, '10 cards'], [20, '20 cards'], [52, 'Full deck']].map(([v, l]) => `<button class="pill${f.n === v ? ' on' : ''}" data-act="cn" data-v="${v}">${l}</button>`).join('');
    return `${ansHTML}<div class="pills">${sp}</div><div class="pills">${ns}</div>
      <div class="actions two"><button class="btn primary" data-act="cstart">${a ? 'Go again' : 'Start flashing cards'}</button></div>`;
  }
  if (id === 'table') {
    const row = (name, cs) => `<div class="hand"><div class="hlabel">${name}</div><div class="cards">${cs.map(cardHTML).join('')}</div></div>`;
    return `<div class="felt small tableview">
        <div class="dealer">${row('Dealer', q.dealer)}</div>
        <div class="felt-rules">Round ${cc.round} · count before this round: ${a ? signed(q.prev) : cc.round === 1 ? '0' : 'yours to remember'}</div>
        <div class="hands n3">${q.hands.map((h, i) => row(`Player ${i + 1}`, h)).join('')}</div>
      </div>
      <div class="controls">${a ? nextBtn.replace('Next', 'Next round') : stepper('Running count now?')}</div>${ansHTML}`;
  }
  if (id === 'true') {
    return `<div class="bigq"><div><label>Running count</label><b>${signed(q.rc)}</b></div><div><label>Decks left</label><b>${q.decks === 0.5 ? '½' : q.decks}</b></div></div>
      <div class="prompt">What is the true count?</div>
      <div class="controls">${a ? nextBtn : choices(q.opts, signed)}</div>${ansHTML}`;
  }
  if (id === 'bet') {
    return `<div class="bigq"><div><label>True count</label><b>${signed(q.tc)}</b></div></div>
      <div class="prompt">How many units do you bet?</div>
      <div class="controls">${a ? nextBtn : choices([1, 2, 4, 6, 8], v => v)}</div>${ansHTML}`;
  }
  const devRows = DEVIATIONS.filter(d => !(d.s17only && state.rules.h17)).map(d => {
    const txt = d.ge === 'R' ? 'Surrender' : `${ACTION_NAMES[d.ge]} (otherwise ${ACTION_NAMES[d.lt].toLowerCase()})`;
    return `<tr><td>${d.pair ? '10,10' : d.t} vs ${upLabel(d.up)}</td><td>${signed(d.idx)} or higher</td><td>${txt}${d.noSurr ? ' <small>if you cannot surrender</small>' : ''}</td></tr>`;
  }).join('');
  return `<div class="felt small">
      <div class="tcbadge">True count ${signed(q.tc)}</div>
      <div class="dealer"><div class="who">Dealer shows</div><div class="cards">${cardHTML(q.up)}<div class="card back"></div></div></div>
      <div class="hands"><div class="hand active"><div class="cards">${q.cards.map(cardHTML).join('')}</div>
        <div class="meta"><span class="total">${totalLabel(q.cards)}</span></div></div></div>
    </div>
    <div class="controls">${a ? nextBtn : `<div class="actions">${actionButtons(q.avail, 'cdev')}</div>`}</div>${ansHTML}
    <details class="reftable"><summary><span>All deviations</span><small>Reference</small></summary><div class="lesson">
      <table class="info"><tr><th>Hand</th><th>True count</th><th>Play</th></tr>
      <tr><td>Insurance</td><td>${signed(INSURANCE_INDEX)} or higher</td><td>Take it</td></tr>${devRows}</table></div></details>`;
}

function renderCount() {
  dealIdx = 0;
  if (!cc.stage) {
    const firstOpen = CSTAGES.find(s => !cProgress(s.id).done);
    const rows = CSTAGES.map((s, i) => {
      const p = cProgress(s.id);
      return `<button class="stage${p.done ? ' done' : ''}${firstOpen === s ? ' next' : ''}" data-act="cstage" data-v="${s.id}">
        <span class="num">${p.done ? '✓' : i + 1}</span>
        <span class="st"><b>${s.title}</b><small>${s.sub}</small><span class="bar"><i style="width:${(100 * p.n) / s.w}%"></i></span></span>
        <span class="state">${p.done ? 'Mastered' : p.len ? `${p.n}/${s.w}` : 'Start'}</span></button>`;
    }).join('');
    const o = state.opts, ch = state.count.checks;
    main.innerHTML = `<section class="countview">
      <p class="lead">Card counting with Hi-Lo, one skill at a time. Each stage explains the idea, then drills it. Get basic strategy solid first: counting adds about one percent, and mistakes in basic play cost more than that.</p>
      <div class="stages">${rows}</div>
      <h3>Use it at the table</h3>
      <p class="note">Practise counting during real hands in the Play tab. "Show" displays the count as a guide. "Test me" hides it and checks your count when you ask and after some rounds.${ch[0] + ch[1] ? ` Your count checks so far: <b>${ch[0]} of ${ch[0] + ch[1]}</b> right.` : ''}</p>
      <div class="field"><span>Count in Play</span><div class="pills tight">${[['off', 'Off'], ['show', 'Show'], ['quiz', 'Test me']]
        .map(([v, l]) => `<button class="pill${o.countMode === v ? ' on' : ''}" data-act="copt" data-k="countMode" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Check my bets against the count</span><div class="pills tight">${[[0, 'Off'], [1, 'On']]
        .map(([v, l]) => `<button class="pill${!!o.betCheck === !!v ? ' on' : ''}" data-act="copt" data-k="betCheck" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="field"><span>Correct my plays using count deviations</span><div class="pills tight">${[[0, 'Off'], [1, 'On']]
        .map(([v, l]) => `<button class="pill${!!o.deviations === !!v ? ' on' : ''}" data-act="copt" data-k="deviations" data-v="${v}">${l}</button>`).join('')}</div></div>
      <p class="note">Bet checks use a ${money(o.unit)} unit. Change it under Rules.</p>
    </section>`;
    return;
  }
  const st = CSTAGES.find(s => s.id === cc.stage), p = cProgress(st.id);
  if (!cc.q && cc.stage !== 'running') cNewQuestion();
  main.innerHTML = `<section class="countview">
    <div class="examhead"><h3>${st.title}</h3><button class="pill" data-act="cback">← All stages</button></div>
    <details class="concept"${cc.open ? ' open' : ''}><summary><span>The idea</span><small>${cc.open ? 'Tap to hide' : 'Tap to review'}</small></summary><div class="lesson">${st.concept}</div></details>
    <div class="mastery"><span>${p.done ? '✓ Mastered' : `${p.n} of your last ${st.w} right (need ${st.need})`}</span><span class="bar"><i style="width:${(100 * p.n) / st.w}%"></i></span></div>
    ${cStageBody()}
  </section>`;
}

/* ---------- Learn ---------- */

function renderLearn() {
  main.innerHTML = `<section class="learn">
    <p class="lead">Short lessons on the game and on getting the most from a Vegas casino floor.</p>
    ${LESSONS.map((l, i) => `<details${i === 0 ? ' open' : ''}><summary><span>${l.title}</span><small>${l.tag}</small></summary><div class="lesson">${l.html}</div></details>`).join('')}
  </section>`;
  main.querySelectorAll('[data-calc]').forEach(updateCalc);
}

function updateCalc(el) {
  const v = n => Math.max(0, parseFloat(el.querySelector(`[name=${n}]`).value) || 0);
  const hands = v('hph') * v('hours');
  const edge = houseEdge(state.rules);
  const loss = v('bet') * hands * edge / 100;
  const swing = 1.15 * v('bet') * Math.sqrt(hands);
  const alt = { ...state.rules, bjPayout: state.rules.bjPayout === 1.5 ? 1.2 : 1.5 };
  el.querySelector('[data-calc-out]').innerHTML = `With your current rules (edge ${edge.toFixed(2)}%): expected loss <b>${money(Math.round(loss))}</b> over ${Math.round(hands)} hands.
    A typical swing either way is about <b>${money(Math.round(swing))}</b>.
    <br>Same play at a ${alt.bjPayout === 1.5 ? '3:2' : '6:5'} table: ${money(Math.round(v('bet') * hands * houseEdge(alt) / 100))}.`;
}

/* ---------- Stats ---------- */

function cellName(id) {
  const [type, k, up] = id.split(':');
  const u = up === '11' ? 'A' : up;
  if (type === 'i') return 'Insurance';
  if (type === 'p') return `${k === '11' ? 'A,A' : `${k},${k}`} vs ${u}`;
  if (type === 's') return `Soft ${k} vs ${u}`;
  return `Hard ${k === '8' ? '8 or less' : k === '18' ? '18+' : k} vs ${u}`;
}

function renderStats() {
  const s = state.stats;
  const weak = Object.entries(s.cells).filter(([, c]) => c[1] > 0)
    .sort((a, b) => b[1][1] / (b[1][0] + b[1][1]) - a[1][1] / (a[1][0] + a[1][1]) || b[1][1] - a[1][1]).slice(0, 10);
  const rows = weak.map(([id, c]) => {
    const [type, k, up] = id.split(':');
    let play = 'Decline';
    if (type !== 'i') {
      const code = type === 'h' ? hardCode(+k, +up, state.rules) : type === 's' ? softCode(+k, +up, state.rules) : pairCode(+k, +up, state.rules);
      play = ACTION_NAMES[resolveCode(code, { H: true, S: true, D: true, P: true, R: state.rules.surrender })];
    }
    return `<tr><td>${cellName(id)}</td><td>${play}</td><td>${c[1]} of ${c[0] + c[1]}</td></tr>`;
  }).join('');
  const st = stages(), mastered = st.filter(x => stageProgress(x.id).done).length, ex = state.exam;
  const checks = [
    [mastered === st.length, `Learning path: ${mastered} of ${st.length} stages mastered`],
    [ex.best >= EXAM_PASS, ex.taken ? `Exam: best ${ex.best}/${EXAM_N} (pass is ${EXAM_PASS})` : `Exam: not taken yet (pass is ${EXAM_PASS}/${EXAM_N})`],
    [s.best >= 100, `Best streak: ${s.best} correct in a row (aim for 100)`],
  ];
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(); dt.setDate(dt.getDate() - i);
    const v = s.days[dt.toLocaleDateString('en-CA')];
    days.push({ label: dt.getDate(), n: v ? v[0] + v[1] : 0, acc: v ? Math.round((100 * v[0]) / (v[0] + v[1])) : 0 });
  }
  const dayBars = days.map(d => `<div class="day" title="${d.n} decisions"><span class="v">${d.n ? d.acc : ''}</span><span class="col"><i style="height:${d.n ? Math.max(4, d.acc) : 0}%"></i></span><span class="l">${d.label}</span></div>`).join('');
  main.innerHTML = `<section class="statsview">
    <h3 class="first">Ready for Vegas?</h3>
    <ul class="check">${checks.map(([ok, t]) => `<li class="${ok ? 'done' : ''}"><span>${ok ? '✓' : '○'}</span>${t}</li>`).join('')}</ul>
    <h3>Accuracy by day <small>last 14 days, percent correct</small></h3>
    <div class="days">${dayBars}</div>
    <h3>All time</h3>
    <div class="hud wrap">
      <div class="stat"><label>Decisions</label><b>${s.decisions}</b></div>
      <div class="stat"><label>Accuracy</label><b>${pct(s.correct, s.decisions)}</b></div>
      <div class="stat"><label>Best streak</label><b>${s.best}</b></div>
      <div class="stat"><label>Hands played</label><b>${s.hands}</b></div>
      <div class="stat"><label>Table result</label><b>${money(s.net)}</b></div>
      <div class="stat"><label>Cost of mistakes</label><b>${money(-Math.round(s.evLost * 100) / 100)}</b></div>
    </div>
    <p class="note">Cost of mistakes is the average amount your wrong plays at the table give away, based on your bet at the time. Aim for 100 correct decisions in a row before the trip.</p>
    ${(() => {
      const c = state.count, cm = CSTAGES.filter(x => cProgress(x.id).done).length;
      const any = cm || c.checks[0] + c.checks[1] || c.bets[0] + c.bets[1] || Object.keys(c.stages).length;
      return any ? `<h3>Card counting</h3><div class="hud wrap">
        <div class="stat"><label>Course stages</label><b>${cm}/${CSTAGES.length}</b></div>
        <div class="stat"><label>Count checks</label><b>${c.checks[0]}/${c.checks[0] + c.checks[1]}</b></div>
        <div class="stat"><label>Bet checks</label><b>${c.bets[0]}/${c.bets[0] + c.bets[1]}</b></div></div>` : '';
    })()}
    <h3>Hands to work on</h3>
    ${rows ? `<table class="info"><tr><th>Hand</th><th>Right play</th><th>Missed</th></tr>${rows}</table>
      <div class="actions two"><button class="btn primary" data-act="drillweak">Drill my weak spots</button></div>`
      : '<p class="note">No mistakes recorded yet. Play some hands or run the drill.</p>'}
    <h3>Keep your progress</h3>
    <p class="note">Progress is stored in this browser on this device. There is no account, so clearing site data or switching phones would lose it. A restore link carries everything: save it somewhere safe (notes, or email it to yourself) and open it on any device to pick up where you left off.${state.lastBackup ? ` Last saved ${new Date(state.lastBackup).toLocaleDateString()}, at ${state.lastBackupN ?? 0} decisions.` : ''}</p>
    <div class="actions two"><button class="btn primary" data-act="backup">Save a restore link</button></div>
    ${backupMsg}
    <form class="coach info quiz" data-form="restore">Restore: <input class="wide" name="code" type="text" placeholder="Paste a restore link" required autocomplete="off"><button class="btn small">Restore</button></form>
    <div class="actions two"><button class="btn ghost" data-act="reset">Reset all progress</button></div>
  </section>`;
}

/* ---------- Settings ---------- */

function renderSettings() {
  const r = state.rules, o = state.opts;
  const seg = (name, opts, cur) => `<div class="seg">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${String(cur) === String(v) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
  $('#settings').innerHTML = `<form method="dialog" id="settingsForm">
    <h2>Table rules</h2>
    <p class="note">Match the table you plan to play. The chart, corrections and house edge follow these.</p>
    <div class="field"><span>Decks</span>${seg('decks', [[4, '4'], [6, '6'], [8, '8']], r.decks)}</div>
    <div class="field"><span>Dealer on soft 17</span>${seg('h17', [[1, 'Hits'], [0, 'Stands']], r.h17 ? 1 : 0)}</div>
    <div class="field"><span>Blackjack pays</span>${seg('bj', [[1.5, '3 to 2'], [1.2, '6 to 5']], r.bjPayout)}</div>
    <div class="field"><span>Double after split</span>${seg('das', [[1, 'Yes'], [0, 'No']], r.das ? 1 : 0)}</div>
    <div class="field"><span>Late surrender</span>${seg('surrender', [[1, 'Yes'], [0, 'No']], r.surrender ? 1 : 0)}</div>
    <p class="note" id="edgeNote"></p>
    <h2>Coaching</h2>
    <div class="field"><span>On a wrong play</span>${seg('block', [[1, 'Stop me'], [0, 'Tell me, then play it']], o.block ? 1 : 0)}</div>
    <div class="field"><span>Card count</span>${seg('countMode', [['off', 'Off'], ['show', 'Show'], ['quiz', 'Test me']], o.countMode)}</div>
    <div class="field"><span>Check my bets</span>${seg('betCheck', [[0, 'Off'], [1, 'On']], o.betCheck ? 1 : 0)}</div>
    <div class="field"><span>Betting unit</span>${seg('unit', [[5, '$5'], [10, '$10'], [25, '$25'], [50, '$50'], [100, '$100']], o.unit)}</div>
    <div class="field"><span>Count deviations</span>${seg('deviations', [[0, 'Off'], [1, 'On']], o.deviations ? 1 : 0)}</div>
    <p class="note">Show displays the count as a guide. Test me hides it and checks your count on request and after some rounds. Bet checks compare each bet with the count's bet ramp. With deviations on, the right play follows the true count instead of plain basic strategy.</p>
    <div class="actions two"><button class="btn primary" value="ok">Done</button></div>
  </form>`;
  const form = $('#settingsForm');
  const read = () => {
    const f = new FormData(form);
    return {
      rules: { ...r, decks: +f.get('decks'), h17: f.get('h17') === '1', bjPayout: +f.get('bj'), das: f.get('das') === '1', surrender: f.get('surrender') === '1' },
      opts: { block: f.get('block') === '1', countMode: f.get('countMode'), deviations: f.get('deviations') === '1', betCheck: f.get('betCheck') === '1', unit: +f.get('unit') },
    };
  };
  const note = () => {
    const e = houseEdge(read().rules);
    $('#edgeNote').innerHTML = `House edge with perfect play: about <b>${e.toFixed(2)}%</b>${e > 1.5 ? '. A 6 to 5 table costs roughly four times as much as 3 to 2. Avoid it if you can.' : '.'}`;
  };
  form.addEventListener('change', note);
  note();
  $('#settings').onclose = () => {
    const next = read();
    const changed = JSON.stringify(next.rules) !== JSON.stringify(state.rules);
    state.rules = next.rules;
    state.opts = next.opts;
    if (changed) { game = new Game(state.rules); coach = null; tried = false; seen.clear(); drill.q = null; drill.answered = null; chart.sel = null; examQuit(); }
    save();
    render();
  };
}

/* ---------- Wiring ---------- */

const views = { play: renderPlay, drill: renderDrill, chart: renderChart, count: renderCount, learn: renderLearn, stats: renderStats };

function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === state.view));
  (views[state.view] || renderPlay)();
}

function go(view) {
  cStop();
  if (exam.on) examQuit();
  if (drill.answered) drill.q = null;
  if (view !== 'stats') backupMsg = '';
  state.view = view;
  save();
  render();
  window.scrollTo(0, 0);
}

$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.view); });
$('#settingsBtn').addEventListener('click', () => { renderSettings(); $('#settings').showModal(); });

const handlers = {
  play: el => playAct(el.dataset.a),
  ins: el => insurance(el.dataset.a === 'Y'),
  deal,
  chip: el => {
    const v = +el.dataset.v;
    state.bet = v ? Math.min(state.bet + v, Math.max(5, Math.floor(state.bankroll))) : 0;
    save(); renderPlay();
  },
  rebuy: () => { state.bankroll += 1000; state.stats.rebuys++; state.bet = state.bet || 25; save(); renderPlay(); },
  peek: () => { countQuiz = countQuiz && !countQuiz.result ? null : { entry: 0 }; renderPlay(); },
  qstep: el => { countQuiz.entry += +el.dataset.v; renderPlay(); },
  qsubmit: countCheck,
  drill: el => drillAct(el.dataset.a),
  dnext: () => { nextDrill(); renderDrill(); },
  dfilter: el => { drill.filter = el.dataset.v; nextDrill(); renderDrill(); },
  tmode: el => { drill.mode = el.dataset.v; drill.stage = null; drill.q = null; drill.answered = null; renderDrill(); window.scrollTo(0, 0); },
  stage: el => { drill.stage = el.dataset.v; nextDrill(); renderDrill(); window.scrollTo(0, 0); },
  stageback: () => { drill.stage = null; drill.q = null; renderDrill(); },
  exam: el => examAct(el.dataset.a),
  examstart: examStart,
  examquit: () => { examQuit(); renderDrill(); },
  examtimed: el => { exam.timed = el.dataset.v === '1'; renderDrill(); },
  cacc: el => { chart.acc = el.dataset.v === '1'; renderChart(); },
  cell: el => { chart.sel = el.dataset.id; renderChart(); },
  cstage: el => { cStop(); cc.stage = el.dataset.v; cc.q = null; cc.ans = null; cc.rc = 0; cc.round = 0; cc.entry = 0; cc.flash.phase = 'idle'; cc.open = cProgress(cc.stage).len === 0; renderCount(); window.scrollTo(0, 0); },
  cback: () => { cStop(); cc.stage = null; cc.q = null; cc.ans = null; renderCount(); },
  cans: el => cAnswer(+el.dataset.v),
  cdev: el => cAnswer(el.dataset.a),
  cstep: el => { cc.entry += +el.dataset.v; renderCount(); },
  csubmit: cSubmit,
  cnext: () => { cNewQuestion(); renderCount(); },
  cstart: cFlashStart,
  cstop: () => { cStop(); renderCount(); },
  cspeed: el => { cc.flash.speed = +el.dataset.v; renderCount(); },
  cn: el => { cc.flash.n = +el.dataset.v; renderCount(); },
  copt: el => { const k = el.dataset.k; state.opts[k] = k === 'countMode' ? el.dataset.v : el.dataset.v === '1'; countQuiz = null; save(); renderCount(); },
  drillweak: () => { drill.mode = 'free'; drill.stage = null; drill.filter = 'weak'; drill.q = null; go('drill'); },
  backup: async () => {
    const url = await restoreLink();
    let how = '';
    try {
      if (navigator.share && matchMedia('(hover: none)').matches) { await navigator.share({ title: 'Blackjack trainer progress', url }); how = 'Shared.'; }
      else { await navigator.clipboard.writeText(url); how = 'Copied to the clipboard.'; }
    } catch { how = 'Copy the link below.'; }
    state.lastBackup = Date.now(); state.lastBackupN = state.stats.decisions; save();
    backupMsg = `<div class="coach ok">${how} Opening this link restores your progress as of now.<textarea class="linkbox" readonly rows="3">${url}</textarea></div>`;
    renderStats();
  },
  reset: () => {
    if (!confirm('Erase all stats and reset your bankroll to $1,000?')) return;
    state.stats = freshStats(); state.path = {}; state.exam = freshExam(); state.count = freshCount(); state.bankroll = 1000; state.bet = 25;
    save(); renderStats();
  },
};

main.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && handlers[el.dataset.act]) handlers[el.dataset.act](el);
});

async function restoreFrom(code, ask) {
  try {
    const data = await unpack(code);
    const theirs = data.stats.decisions || 0, mine = state.stats.decisions;
    if (ask && mine > 0 && !confirm(`Replace the progress on this device (${mine} decisions) with the saved progress (${theirs} decisions)?`)) return;
    applySaved(data);
    game = new Game(state.rules); coach = null; tried = false; seen.clear(); drill.q = null; examQuit(); exam.result = null;
    save();
    backupMsg = `<div class="coach ok">Progress restored: ${theirs} decisions, ${pct(data.stats.correct, theirs)} accuracy.</div>`;
  } catch {
    backupMsg = '<div class="coach bad">That restore link could not be read. Check that you pasted all of it.</div>';
  }
  state.view = 'stats';
  render();
}

main.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target, kind = form.dataset.form;
  if (kind === 'restore') return restoreFrom(new FormData(form).get('code'), true);
});

main.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('.concept')) cc.open = e.target.open; }, true);

main.addEventListener('input', e => {
  const calc = e.target.closest('[data-calc]');
  if (calc) updateCalc(calc);
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || $('#settings').open) return;
  const k = e.key.toUpperCase();
  const space = e.key === ' ' || e.key === 'Enter';
  const arrow = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : 0;
  if (state.view === 'play') {
    if (countQuiz && !countQuiz.result && (arrow || e.key === 'Enter')) {
      e.preventDefault();
      if (arrow) { countQuiz.entry += arrow; renderPlay(); } else countCheck();
    } else if ('HSDPR'.includes(k) && k.length === 1) playAct(k);
    else if (k === 'Y' || k === 'N') insurance(k === 'Y');
    else if (space) { e.preventDefault(); deal(); }
  } else if (state.view === 'drill') {
    if ('HSDPR'.includes(k) && k.length === 1) drillAct(k);
    else if (space && drill.answered) { e.preventDefault(); nextDrill(); renderDrill(); }
  } else if (state.view === 'count' && cc.stage) {
    const stepping = !cc.ans && (cc.stage === 'table' || (cc.stage === 'running' && cc.flash.phase === 'answer'));
    if (stepping && arrow) { e.preventDefault(); cc.entry += arrow; renderCount(); }
    else if (stepping && e.key === 'Enter') { e.preventDefault(); cSubmit(); }
    else if (space && cc.ans && cc.stage !== 'running') { e.preventDefault(); cNewQuestion(); renderCount(); }
    else if (cc.stage === 'dev' && !cc.ans && 'HSDPR'.includes(k) && k.length === 1 && cc.q.avail[k]) cAnswer(k);
  }
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

render();
if (location.hash.startsWith('#save=')) {
  const code = location.hash;
  history.replaceState(null, '', location.pathname);
  restoreFrom(code, true);
}
