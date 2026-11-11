import {
  ACTION_NAMES, DEFAULT_RULES, DEVIATIONS, INSURANCE_INDEX, advise, betUnits, cardValue,
  hardCode, softCode, pairCode, handInfo, hiLo, houseEdge, resolveCode,
} from './strategy.js';
import { Game, info, values } from './game.js';
import { LESSONS } from './lessons.js';

/* ---------- State ---------- */

const KEY = 'bj-trainer-v1';
const freshStats = () => ({ cells: {}, hands: 0, decisions: 0, correct: 0, evLost: 0, net: 0, streak: 0, best: 0, rebuys: 0 });
const state = {
  rules: { ...DEFAULT_RULES },
  opts: { block: true, countMode: 'off', deviations: false },
  stats: freshStats(),
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
    for (const k of ['bankroll', 'bet', 'view', 'lastBackup', 'lastBackupN']) if (saved[k] != null) state[k] = saved[k];
  }
} catch { /* storage unavailable: run without persistence */ }
function applySaved(saved) {
  Object.assign(state.rules, saved.rules);
  Object.assign(state.opts, saved.opts);
  state.stats = Object.assign(freshStats(), saved.stats);
  for (const k of ['bankroll', 'bet']) if (saved[k] != null) state[k] = saved[k];
}

const b64 = u8 => btoa(Array.from(u8, c => String.fromCharCode(c)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = str => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pack() {
  const { rules, opts, stats, bankroll, bet } = state;
  const raw = new TextEncoder().encode(JSON.stringify({ v: 1, rules, opts, stats, bankroll, bet }));
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
const money = n => (n < 0 ? '−' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n);
const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '–');
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

let game = new Game(state.rules);
let coach = null;        // { kind: 'ok' | 'bad' | 'info', html }
let tried = false;       // current decision already answered wrongly (block mode)
let countQuiz = null;    // { answer, result }
let peekCount = false;

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
  if (right) { s.correct++; s.streak++; s.best = Math.max(s.best, s.streak); }
  else { s.streak = 0; s.evLost += cost; }
  save();
}

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
  const show = mode === 'show' || peekCount;
  const tc = game.trueCount;
  return `<button class="stat count" data-act="peek"><label>Hi-Lo count</label>
    <b>${show ? `${signed(game.running)} <small>true ${signed(Math.abs(tc) < 0.05 ? 0 : +tc.toFixed(1))}</small>` : 'Tap to peek'}</b></button>`;
}

function renderPlay() {
  dealIdx = 0;
  const g = game, r = state.rules;
  const inRound = g.phase !== 'bet';
  const dealerShown = inRound && !g.dealer[1].hidden;
  const dealerCards = inRound ? g.dealer.map(cardHTML).join('') : '';
  const handsHTML = inRound ? g.hands.map((h, i) => {
    const cards = h.cards.map(cardHTML).join('');
    const active = g.phase === 'player' && i === g.cur;
    const res = h.result ? `<span class="result r-${h.result.toLowerCase()} fade" style="animation-delay:${dealIdx * 130}ms">${h.result}${h.net ? ' ' + money(h.net).replace('$', h.net > 0 ? '+$' : '$') : ''}</span>` : '';
    const label = g.hands.length > 1 ? `<div class="hlabel">Hand ${i + 1}${active ? ' · your turn' : ''}</div>` : '';
    return `<div class="hand${active ? ' active' : ''}">
      ${label}<div class="cards">${cards}</div>
      <div class="meta"><span class="total">${totalLabel(h.cards)}</span><span class="chip">${money(h.bet)}</span>${res}</div>
    </div>`;
  }).join('') : '<div class="placeholder">Place your bet and deal</div>';
  const delay = `animation-delay:${dealIdx * 130}ms`;
  const dealerTotal = !inRound ? '' : dealerShown
    ? `<span class="total fade" style="${delay}">${totalLabel(g.dealer)}</span>`
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
    const advice = state.opts.countMode !== 'off' && (state.opts.countMode === 'show' || peekCount)
      ? `<div class="bet-advice">True count ${signed(tc)}: a counter bets ${betUnits(tc)} unit${betUnits(tc) > 1 ? 's' : ''}</div>` : '';
    controls = `${advice}<div class="betrow">
        <button class="chipbtn c5" data-act="chip" data-v="5">+5</button>
        <button class="chipbtn c25" data-act="chip" data-v="25">+25</button>
        <button class="chipbtn c100" data-act="chip" data-v="100">+100</button>
        <button class="btn ghost" data-act="chip" data-v="0">Clear</button>
      </div>
      <div class="actions two"><button class="btn primary" data-act="deal" ${state.bet >= 5 ? '' : 'disabled'}>Deal ${money(Math.min(state.bet, state.bankroll))}<kbd>␣</kbd></button></div>`;
  }

  let quiz = '';
  if (countQuiz && g.phase === 'done') {
    quiz = countQuiz.result
      ? `<div class="coach ${countQuiz.result.ok ? 'ok' : 'bad'} fade">${countQuiz.result.ok ? '✓ Count is right:' : '✗ The running count is'} <b>${signed(game.running)}</b></div>`
      : `<form class="coach info quiz fade" style="${delay}" data-form="countquiz">What is the running count? <input name="rc" type="number" inputmode="numeric" required><button class="btn small">Check</button></form>`;
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
    ${coach ? `<div class="coach ${coach.kind}${g.phase === 'done' ? ' fade' : ''}" style="${g.phase === 'done' ? delay : ''}">${coach.html}</div>` : ''}
    ${quiz}
  </section>`;
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
  state.bankroll += game.net;
  state.stats.hands += game.hands.length;
  state.stats.net += game.net;
  const body = coach && coach.kind === 'bad' ? coach.html : coach ? coach.html : '';
  coach = { kind: coach ? coach.kind : 'info', html: body + roundSummary() };
  countQuiz = state.opts.countMode === 'quiz' && Math.random() < 0.4 ? {} : null;
  save();
}

function deal() {
  if (game.phase !== 'bet' && game.phase !== 'done') return;
  const bet = Math.min(state.bet, state.bankroll);
  if (bet < 5) return;
  coach = null; tried = false; countQuiz = null; peekCount = false;
  game.startRound(bet);
  if (game.justShuffled) { seen.clear(); coach = { kind: 'info', html: 'New shoe. The count starts again from zero.' }; }
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

/* ---------- Drill ---------- */

const drill = { filter: 'all', q: null, answered: null, right: 0, total: 0, streak: 0, timer: null };
const SUITS = ['♠', '♥', '♦', '♣'];
const rankFor = v => (v === 11 ? 'A' : v === 10 ? pick(['10', 'J', 'Q', 'K']) : String(v));
let drillId = 0;
const mkCard = v => ({ r: rankFor(v), s: pick(SUITS), id: `d${++drillId}` });

function drillCells() {
  const cells = [];
  for (const up of UPS) {
    for (let t = 8; t <= 18; t++) cells.push({ type: 'h', k: t, up });
    for (let t = 13; t <= 20; t++) cells.push({ type: 's', k: t, up });
    for (let v = 2; v <= 11; v++) cells.push({ type: 'p', k: v, up });
  }
  return cells;
}

function nextDrill() {
  clearTimeout(drill.timer);
  const f = drill.filter;
  let cells = drillCells().filter(c => f === 'all' || f === 'weak' || c.type === f);
  const stat = c => state.stats.cells[`${c.type}:${c.k}:${c.up}`];
  if (f === 'weak') {
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
  while ((x -= weights[i]) > 0) i++;
  const c = cells[i];
  let vals;
  if (c.type === 'p') vals = [c.k, c.k];
  else if (c.type === 's') vals = [11, c.k - 11];
  else {
    const opts = [];
    for (let a = Math.max(2, c.k - 10); a <= Math.min(10, c.k - 2); a++) if (a !== c.k - a) opts.push(a);
    const a = pick(opts);
    vals = [a, c.k - a];
  }
  const cards = vals.map(mkCard);
  if (c.type === 'p') cards[1].r = cards[0].r;
  if (Math.random() < 0.5) cards.reverse();
  drill.q = { cards, up: mkCard(c.up), upValue: c.up };
  drill.answered = null;
}

function renderDrill() {
  if (!drill.q) nextDrill();
  const q = drill.q;
  const avail = { H: true, S: true, D: true, P: handInfo(values(q.cards)).pair !== null, R: state.rules.surrender };
  const filters = [['all', 'All hands'], ['h', 'Hard'], ['s', 'Soft'], ['p', 'Pairs'], ['weak', 'My weak spots']]
    .map(([k, l]) => `<button class="pill${drill.filter === k ? ' on' : ''}" data-act="dfilter" data-v="${k}">${l}</button>`).join('');
  const a = drill.answered;
  main.innerHTML = `<section class="drill">
    <p class="lead">Rapid-fire decisions with no payouts. Hands you miss come back more often.</p>
    <div class="pills">${filters}</div>
    ${drill.filter === 'weak' && drill.noWeak ? '<p class="note">No missed hands recorded yet, so this is showing all hands.</p>' : ''}
    <div class="hud">
      <div class="stat"><label>This session</label><b>${drill.right}/${drill.total}</b></div>
      <div class="stat"><label>Accuracy</label><b>${pct(drill.right, drill.total)}</b></div>
      <div class="stat"><label>Streak</label><b>${drill.streak}</b></div>
    </div>
    <div class="felt small">
      <div class="dealer"><div class="who">Dealer shows</div><div class="cards">${cardHTML(q.up)}<div class="card back"></div></div></div>
      <div class="hands"><div class="hand active"><div class="cards">${q.cards.map(cardHTML).join('')}</div>
        <div class="meta"><span class="total">${totalLabel(q.cards)}</span></div></div></div>
    </div>
    <div class="controls">${a
      ? '<div class="actions two"><button class="btn primary" data-act="dnext">Next hand<kbd>␣</kbd></button></div>'
      : `<div class="actions">${actionButtons(avail, 'drill')}</div>`}</div>
    ${a ? `<div class="coach ${a.kind}">${a.html}</div>` : ''}
  </section>`;
}

function drillAct(a) {
  const q = drill.q;
  if (!q || drill.answered) return;
  const vals = values(q.cards);
  const avail = { H: true, S: true, D: true, P: handInfo(vals).pair !== null, R: state.rules.surrender };
  if (!avail[a]) return;
  const adv = advise(vals, q.upValue, state.rules, avail);
  const right = a === adv.action;
  record(adv.cell, right);
  drill.total++;
  if (right) { drill.right++; drill.streak++; } else drill.streak = 0;
  drill.answered = feedback(adv, a);
  renderDrill();
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

/* ---------- Count ---------- */

const cnt = { phase: 'idle', n: 30, speed: 1000, cards: [], i: 0, timer: null, result: null, tc: null };

function newTcQuiz() {
  const decks = pick([1, 1.5, 2, 2.5, 3, 4, 5]);
  const rc = Math.floor(Math.random() * 25) - 8;
  cnt.tc = { decks, rc, result: null };
}

function renderCount() {
  if (!cnt.tc) newTcQuiz();
  let stage;
  if (cnt.phase === 'running') {
    stage = `<div class="felt small flash"><div class="cards big">${cardHTML(cnt.cards[cnt.i])}</div>
      <div class="felt-rules">Card ${cnt.i + 1} of ${cnt.n}</div></div>
      <div class="actions two"><button class="btn ghost" data-act="cstop">Stop</button></div>`;
  } else if (cnt.phase === 'answer') {
    stage = `<form class="coach info quiz" data-form="cdrill">What is the running count? <input name="rc" type="number" inputmode="numeric" required autofocus><button class="btn small">Check</button></form>`;
  } else {
    const res = cnt.result ? `<div class="coach ${cnt.result.ok ? 'ok' : 'bad'}">${cnt.result.ok ? '✓ Correct.' : `✗ You said ${signed(cnt.result.given)}.`} The running count was <b>${signed(cnt.result.answer)}</b>.
      <div class="cards mini">${cnt.cards.map(c => `<span class="${hiLo(cardValue(c.r)) > 0 ? 'plus' : hiLo(cardValue(c.r)) < 0 ? 'minus' : ''}">${c.r}</span>`).join('')}</div></div>` : '';
    const sp = [[1500, 'Slow'], [1000, 'Medium'], [600, 'Fast'], [350, 'Casino speed']]
      .map(([v, l]) => `<button class="pill${cnt.speed === v ? ' on' : ''}" data-act="cspeed" data-v="${v}">${l}</button>`).join('');
    const ns = [15, 30, 52].map(v => `<button class="pill${cnt.n === v ? ' on' : ''}" data-act="cn" data-v="${v}">${v} cards</button>`).join('');
    stage = `${res}<div class="pills">${sp}</div><div class="pills">${ns}</div>
      <div class="actions two"><button class="btn primary" data-act="cstart">Start flashing cards</button></div>`;
  }
  const t = cnt.tc;
  const tcq = t.result
    ? `<div class="coach ${t.result.ok ? 'ok' : 'bad'}">${t.result.ok ? '✓' : '✗'} ${signed(t.rc)} ÷ ${t.decks} = <b>${signed(+(t.rc / t.decks).toFixed(1))}</b>. Round down to ${signed(Math.floor(t.rc / t.decks))} when betting.
        <button class="btn small" data-act="tcnext">Another</button></div>`
    : `<form class="coach info quiz" data-form="tcquiz">Running count <b>${signed(t.rc)}</b>, <b>${t.decks}</b> deck${t.decks === 1 ? '' : 's'} left. True count? <input name="tc" type="number" step="any" inputmode="decimal" required><button class="btn small">Check</button></form>`;
  const devRows = DEVIATIONS.filter(d => !(d.s17only && state.rules.h17)).map(d => {
    const hand = d.pair ? '10,10' : d.t;
    const txt = d.ge === 'R' ? 'Surrender' : `${ACTION_NAMES[d.ge]} (otherwise ${ACTION_NAMES[d.lt].toLowerCase()})`;
    return `<tr><td>${hand} vs ${upLabel(d.up)}</td><td>${signed(d.idx)} or higher</td><td>${txt}${d.noSurr ? ' <small>if you cannot surrender</small>' : ''}</td></tr>`;
  }).join('');
  main.innerHTML = `<section class="countview">
    <p class="lead">Hi-Lo: 2 to 6 count <b class="plus">+1</b>, 7 to 9 count <b>0</b>, tens and aces count <b class="minus">−1</b>. Keep a running total as cards appear.</p>
    <h3>Running count drill</h3>
    ${stage}
    <h3>True count conversion</h3>
    <p class="note">True count = running count ÷ decks left in the shoe.</p>
    ${tcq}
    <h3>Betting by the count</h3>
    <table class="info"><tr><th>True count</th><th>Bet</th><th>Your edge, roughly</th></tr>
      ${[[1, '+1 or less', 'House has the edge'], [2, '+2', '+0.5%'], [3, '+3', '+1%'], [4, '+4', '+1.5%'], [5, '+5 or more', '+2% and up']]
        .map(([tc, l, e]) => `<tr><td>${l}</td><td>${betUnits(tc)} unit${betUnits(tc) > 1 ? 's' : ''}</td><td>${e}</td></tr>`).join('')}</table>
    <h3>Plays that change with the count</h3>
    <table class="info"><tr><th>Hand</th><th>True count</th><th>Play</th></tr>
      <tr><td>Insurance</td><td>${signed(INSURANCE_INDEX)} or higher</td><td>Take it</td></tr>${devRows}</table>
    <p class="note">To practise at the table, open <b>Rules</b> and set count mode to "Quiz me", and switch on count deviations when you are ready.</p>
  </section>`;
  const input = main.querySelector('form[data-form="cdrill"] input');
  if (input) input.focus();
}

function startCount() {
  cnt.cards = Array.from({ length: cnt.n }, () => ({ ...mkCard(pick([2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11])) }));
  cnt.i = 0; cnt.phase = 'running'; cnt.result = null;
  renderCount();
  clearInterval(cnt.timer);
  cnt.timer = setInterval(() => {
    if (state.view !== 'count') return stopCount();
    cnt.i++;
    if (cnt.i >= cnt.n) { clearInterval(cnt.timer); cnt.phase = 'answer'; }
    renderCount();
  }, cnt.speed);
}
function stopCount() { clearInterval(cnt.timer); if (cnt.phase === 'running') cnt.phase = 'idle'; }

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
  main.innerHTML = `<section class="statsview">
    <div class="hud wrap">
      <div class="stat"><label>Decisions</label><b>${s.decisions}</b></div>
      <div class="stat"><label>Accuracy</label><b>${pct(s.correct, s.decisions)}</b></div>
      <div class="stat"><label>Best streak</label><b>${s.best}</b></div>
      <div class="stat"><label>Hands played</label><b>${s.hands}</b></div>
      <div class="stat"><label>Table result</label><b>${money(s.net)}</b></div>
      <div class="stat"><label>Cost of mistakes</label><b>${money(-Math.round(s.evLost * 100) / 100)}</b></div>
    </div>
    <p class="note">Cost of mistakes is the average amount your wrong plays at the table give away, based on your bet at the time. Aim for 100 correct decisions in a row before the trip.</p>
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
    <div class="field"><span>Card count</span>${seg('countMode', [['off', 'Off'], ['show', 'Show'], ['quiz', 'Quiz me']], o.countMode)}</div>
    <div class="field"><span>Count deviations</span>${seg('deviations', [[0, 'Off'], [1, 'On']], o.deviations ? 1 : 0)}</div>
    <p class="note">With deviations on, the right play follows the Hi-Lo true count instead of plain basic strategy.</p>
    <div class="actions two"><button class="btn primary" value="ok">Done</button></div>
  </form>`;
  const form = $('#settingsForm');
  const read = () => {
    const f = new FormData(form);
    return {
      rules: { ...r, decks: +f.get('decks'), h17: f.get('h17') === '1', bjPayout: +f.get('bj'), das: f.get('das') === '1', surrender: f.get('surrender') === '1' },
      opts: { block: f.get('block') === '1', countMode: f.get('countMode'), deviations: f.get('deviations') === '1' },
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
    if (changed) { game = new Game(state.rules); coach = null; tried = false; seen.clear(); drill.q = null; chart.sel = null; }
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
  stopCount();
  clearTimeout(drill.timer);
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
  peek: () => { peekCount = !peekCount; renderPlay(); },
  drill: el => drillAct(el.dataset.a),
  dnext: () => { nextDrill(); renderDrill(); },
  dfilter: el => { drill.filter = el.dataset.v; nextDrill(); renderDrill(); },
  cacc: el => { chart.acc = el.dataset.v === '1'; renderChart(); },
  cell: el => { chart.sel = el.dataset.id; renderChart(); },
  cstart: startCount,
  cstop: () => { stopCount(); renderCount(); },
  cspeed: el => { cnt.speed = +el.dataset.v; renderCount(); },
  cn: el => { cnt.n = +el.dataset.v; renderCount(); },
  tcnext: () => { newTcQuiz(); renderCount(); },
  drillweak: () => { drill.filter = 'weak'; drill.q = null; go('drill'); },
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
    state.stats = freshStats(); state.bankroll = 1000; state.bet = 25;
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
    game = new Game(state.rules); coach = null; tried = false; seen.clear(); drill.q = null;
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
  const val = parseFloat(new FormData(form).values().next().value);
  if (Number.isNaN(val)) return;
  if (kind === 'countquiz') { countQuiz.result = { ok: val === game.running }; renderPlay(); }
  if (kind === 'cdrill') {
    const answer = cnt.cards.reduce((s, c) => s + hiLo(cardValue(c.r)), 0);
    cnt.result = { ok: val === answer, given: val, answer };
    cnt.phase = 'idle';
    renderCount();
  }
  if (kind === 'tcquiz') {
    const exact = cnt.tc.rc / cnt.tc.decks;
    cnt.tc.result = { ok: Math.abs(val - exact) <= 0.6 || val === Math.floor(exact) };
    renderCount();
  }
});

main.addEventListener('input', e => {
  const calc = e.target.closest('[data-calc]');
  if (calc) updateCalc(calc);
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey || $('#settings').open) return;
  const k = e.key.toUpperCase();
  const space = e.key === ' ' || e.key === 'Enter';
  if (state.view === 'play') {
    if ('HSDPR'.includes(k) && k.length === 1) playAct(k);
    else if (k === 'Y' || k === 'N') insurance(k === 'Y');
    else if (space) { e.preventDefault(); deal(); }
  } else if (state.view === 'drill') {
    if ('HSDPR'.includes(k) && k.length === 1) drillAct(k);
    else if (space && drill.answered) { e.preventDefault(); nextDrill(); renderDrill(); }
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
