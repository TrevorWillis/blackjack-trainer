import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hardCode, softCode, pairCode, resolveCode, actionEVs, advise, handInfo, DEFAULT_RULES,
} from '../js/strategy.js';
import { Game, values } from '../js/game.js';

const UPS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const ruleSets = [];
for (const h17 of [true, false]) for (const das of [true, false]) for (const surrender of [true, false])
  ruleSets.push({ ...DEFAULT_RULES, h17, das, surrender });

// Every chart cell must be the highest-EV play, or within a hair of it
// (a few cells are near coin-flips where the model and published charts differ).
test('chart matches the EV engine', () => {
  const TOL = 0.01;
  const close = [];
  for (const r of ruleSets) {
    const check = (label, info, code, up, avail) => {
      const action = resolveCode(code, avail);
      const evs = actionEVs(info, up, r, avail);
      const best = Object.keys(evs).reduce((a, b) => (evs[b] > evs[a] ? b : a));
      const gap = evs[best] - evs[action];
      if (gap > 1e-9) close.push(`${label} vs ${up}: chart ${action}, model ${best}, gap ${gap.toFixed(4)} (h17=${r.h17} das=${r.das} ls=${r.surrender})`);
      assert.ok(gap <= TOL, `${label} vs ${up}: chart ${action} (${evs[action].toFixed(4)}) but ${best} is ${evs[best].toFixed(4)} ${JSON.stringify(r)}`);
    };
    for (const up of UPS) {
      const base = { H: true, S: true, D: true, P: false, R: r.surrender };
      for (let t = 5; t <= 20; t++) check(`hard ${t}`, { total: t, soft: false, pair: null, n: 2 }, hardCode(t, up, r), up, base);
      for (let t = 13; t <= 20; t++) check(`soft ${t}`, { total: t, soft: true, pair: null, n: 2 }, softCode(t, up, r), up, base);
      for (let v = 2; v <= 11; v++) check(`pair ${v}`, handInfo([v, v]), pairCode(v, up, r), up, { ...base, P: true });
    }
  }
  if (close.length) console.log('Near-tie cells:\n  ' + [...new Set(close)].join('\n  '));
});

test('advise falls back when options are unavailable', () => {
  const r = { ...DEFAULT_RULES };
  const none = { H: true, S: true, D: false, P: false, R: false };
  assert.equal(advise([5, 6], 6, r, none).action, 'H');
  assert.equal(advise([11, 7], 5, r, none).action, 'S');
  assert.equal(advise([8, 8], 10, r, none).action, 'H');
  assert.equal(advise([10, 6], 10, r, { ...none, R: true }).action, 'R');
  assert.equal(advise([8, 8], 10, r, { ...none, P: true, R: true }).action, 'P');
});

test('count deviations', () => {
  const r = { ...DEFAULT_RULES, surrender: false };
  const av = { H: true, S: true, D: true, P: false, R: false };
  assert.equal(advise([10, 6], 10, r, av, 0).action, 'S');
  assert.equal(advise([10, 6], 10, r, av, -1).action, 'H');
  assert.equal(advise([10, 2], 4, r, av, -1).action, 'H');
  assert.equal(advise([10, 10], 6, r, { ...av, P: true }, 4).action, 'P');
  assert.equal(advise([10, 5], 10, { ...r, surrender: true }, { ...av, R: true }, -1).action, 'H');
});

test('simulated basic strategy play lands near the expected house edge', () => {
  const r = { ...DEFAULT_RULES };
  let seed = 12345;
  const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const g = new Game(r, rng);
  let net = 0;
  const N = 300000;
  for (let i = 0; i < N; i++) {
    g.startRound(1);
    if (g.phase === 'insurance') g.takeInsurance(false);
    let guard = 0;
    while (g.phase === 'player') {
      assert.ok(++guard < 50);
      g.act(advise(values(g.hand.cards), g.upValue, r, g.available()).action);
    }
    assert.equal(g.phase, 'done');
    net += g.net;
  }
  const edge = (-net / N) * 100;
  console.log(`Simulated house edge: ${edge.toFixed(2)}%`);
  assert.ok(edge > -0.3 && edge < 1.4, `edge ${edge}`);
});
