// Basic strategy for 4-8 deck shoe games, an expected-value engine used to
// explain and verify it, and Hi-Lo counting helpers.
// Card values: 2..10, Ace = 11.

export const ACTION_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

export const DEFAULT_RULES = {
  decks: 6,
  h17: true,        // dealer hits soft 17
  das: true,        // double after split
  surrender: true,  // late surrender
  bjPayout: 1.5,    // 1.5 = 3:2, 1.2 = 6:5
  penetration: 0.75,
};

export function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === 'K' || rank === 'Q' || rank === 'J') return 10;
  return Number(rank);
}

export function hiLo(value) {
  return value <= 6 ? 1 : value >= 10 ? -1 : 0;
}

export function addCard(total, soft, c) {
  let t = total + (c === 11 ? 1 : c);
  let s = soft;
  if (c === 11 && !s && t + 10 <= 21) { t += 10; s = true; }
  if (t > 21 && s) { t -= 10; s = false; }
  return [t, s];
}

// values: array of card values. Returns { total, soft, pair, n }.
export function handInfo(values) {
  let total = 0, soft = false;
  for (const v of values) [total, soft] = addCard(total, soft, v);
  const pair = values.length === 2 && values[0] === values[1] ? values[0] : null;
  return { total, soft, pair, n: values.length };
}

/* ---------- The chart ---------- */
// Codes: H, S, P, D (double else hit), Ds (double else stand),
// Rh / Rs / Rp (surrender else hit / stand / split).

export function hardCode(t, u, r) {
  if (t >= 17) return r.surrender && r.h17 && t === 17 && u === 11 ? 'Rs' : 'S';
  if (t === 16) return r.surrender && u >= 9 ? 'Rh' : u <= 6 ? 'S' : 'H';
  if (t === 15) return r.surrender && (u === 10 || (u === 11 && r.h17)) ? 'Rh' : u <= 6 ? 'S' : 'H';
  if (t >= 13) return u <= 6 ? 'S' : 'H';
  if (t === 12) return u >= 4 && u <= 6 ? 'S' : 'H';
  if (t === 11) return u === 11 && !r.h17 ? 'H' : 'D';
  if (t === 10) return u <= 9 ? 'D' : 'H';
  if (t === 9) return u >= 3 && u <= 6 ? 'D' : 'H';
  return 'H';
}

export function softCode(t, u, r) {
  if (t >= 20) return 'S';
  if (t === 19) return r.h17 && u === 6 ? 'Ds' : 'S';
  if (t === 18) {
    if (u <= 6) return u >= 3 || r.h17 ? 'Ds' : 'S';
    return u <= 8 ? 'S' : 'H';
  }
  if (t === 17) return u >= 3 && u <= 6 ? 'D' : 'H';
  if (t >= 15) return u >= 4 && u <= 6 ? 'D' : 'H';
  if (t >= 13) return u >= 5 && u <= 6 ? 'D' : 'H';
  return 'H';
}

export function pairCode(v, u, r) {
  switch (v) {
    case 11: return 'P';
    case 10: return 'S';
    case 9: return u === 7 || u >= 10 ? 'S' : 'P';
    case 8: return r.surrender && r.h17 && u === 11 ? 'Rp' : 'P';
    case 7: return u <= 7 ? 'P' : 'H';
    case 6: return u <= 6 && (r.das || u >= 3) ? 'P' : 'H';
    case 5: return hardCode(10, u, r);
    case 4: return r.das && (u === 5 || u === 6) ? 'P' : 'H';
    default: return u <= 7 && (r.das || u >= 4) ? 'P' : 'H';
  }
}

export function resolveCode(code, avail) {
  switch (code) {
    case 'D': return avail.D ? 'D' : 'H';
    case 'Ds': return avail.D ? 'D' : 'S';
    case 'Rh': return avail.R ? 'R' : 'H';
    case 'Rs': return avail.R ? 'R' : 'S';
    case 'Rp': return avail.R ? 'R' : 'P';
    default: return code;
  }
}

/* ---------- Expected value engine (infinite-deck model) ---------- */

const CARDS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const prob = c => (c === 10 ? 4 / 13 : 1 / 13);
const memo = new Map();

function dealerFrom(t, s, h17) {
  if (t > 21) return [0, 0, 0, 0, 0, 1];
  if (t > 17 || (t === 17 && !(s && h17))) {
    const r = [0, 0, 0, 0, 0, 0];
    r[t - 17] = 1;
    return r;
  }
  const key = `df${t}${s}${h17}`;
  if (memo.has(key)) return memo.get(key);
  const r = [0, 0, 0, 0, 0, 0];
  for (const c of CARDS) {
    const sub = dealerFrom(...addCard(t, s, c), h17);
    for (let i = 0; i < 6; i++) r[i] += prob(c) * sub[i];
  }
  memo.set(key, r);
  return r;
}

// Probabilities of dealer finishing on [17, 18, 19, 20, 21, bust], given the
// upcard and given that the dealer has already peeked and has no blackjack.
export function dealerDist(up, h17) {
  const key = `dd${up}${h17}`;
  if (memo.has(key)) return memo.get(key);
  const r = [0, 0, 0, 0, 0, 0];
  let norm = 0;
  for (const c of CARDS) {
    if ((up === 11 && c === 10) || (up === 10 && c === 11)) continue;
    const sub = dealerFrom(...addCard(up === 11 ? 11 : up, up === 11, c), h17);
    norm += prob(c);
    for (let i = 0; i < 6; i++) r[i] += prob(c) * sub[i];
  }
  for (let i = 0; i < 6; i++) r[i] /= norm;
  memo.set(key, r);
  return r;
}

function standEV(t, up, h17) {
  if (t > 21) return -1;
  const d = dealerDist(up, h17);
  let ev = d[5];
  for (let i = 0; i < 5; i++) {
    if (t > 17 + i) ev += d[i];
    else if (t < 17 + i) ev -= d[i];
  }
  return ev;
}

function hitStand(t, s, up, h17) {
  const key = `hs${t}${s}${up}${h17}`;
  if (memo.has(key)) return memo.get(key);
  const S = standEV(t, up, h17);
  let H = 0;
  for (const c of CARDS) {
    const [nt, ns] = addCard(t, s, c);
    H += prob(c) * (nt > 21 ? -1 : hitStand(nt, ns, up, h17).best);
  }
  const r = { H, S, best: Math.max(H, S) };
  memo.set(key, r);
  return r;
}

function doubleEV(t, s, up, h17) {
  let ev = 0;
  for (const c of CARDS) ev += prob(c) * standEV(addCard(t, s, c)[0], up, h17);
  return 2 * ev;
}

function splitEV(v, up, r) {
  const start = v === 11 ? [11, true] : [v, false];
  let rest = 0, same = 0;
  for (const c of CARDS) {
    const [t, s] = addCard(...start, c);
    let e;
    if (v === 11) e = standEV(t, up, r.h17); // split aces get one card each
    else {
      e = hitStand(t, s, up, r.h17).best;
      if (r.das) e = Math.max(e, doubleEV(t, s, up, r.h17));
    }
    if (c === v && v !== 11) same = e;
    else rest += prob(c) * e;
  }
  if (v === 11) return 2 * rest;
  const once = rest + prob(v) * same;                       // no resplit
  const again = rest + prob(v) * Math.max(same, 2 * once);  // one resplit each (up to 4 hands)
  return 2 * again;
}

// EV, per unit of original bet, of each available action.
export function actionEVs(info, up, rules, avail) {
  const hs = hitStand(info.total, info.soft, up, rules.h17);
  const ev = { H: hs.H, S: hs.S };
  if (avail.D) ev.D = doubleEV(info.total, info.soft, up, rules.h17);
  if (avail.P && info.pair) ev.P = splitEV(info.pair, up, rules);
  if (avail.R) ev.R = -0.5;
  return ev;
}

/* ---------- Explanations ---------- */

function reason(info, up, action, asPair, rules) {
  const u = up === 11 ? 'an Ace' : `a ${up}`;
  const weak = up <= 6;
  if (action === 'R') {
    return `This hand wins only about one time in four against ${u}. Surrendering gives up half your bet, which is cheaper than playing it out.`;
  }
  if (asPair) {
    switch (info.pair) {
      case 11: return 'Always split aces. Two hands that each start with 11 are far stronger than one soft 12.';
      case 10: return 'A pair of tens is 20. Stand, and never split them: 20 wins too often to break up.';
      case 9: return action === 'P'
        ? 'Split 9s against 2 to 6, 8 and 9. Two hands starting at 9 beat a single 18 here.'
        : up === 7 ? 'Stand on 9,9 against a 7. Your 18 already beats the 17 the dealer most likely makes.'
          : 'Stand on 9,9 against a 10 or Ace. Splitting just puts more money out against a strong card.';
      case 8: return 'Always split 8s. Hard 16 is the worst hand in the game, and an 8 is a decent start.';
      case 7: return action === 'P' ? 'Split 7s against 2 to 7. Two 7s do better than a hard 14 against a weak or equal card.'
        : 'Against 8 or higher, two 7s are both underdogs, so do not split. Just hit the 14.';
      case 6: return action === 'P' ? 'Split 6s against a weak dealer card. Hard 12 is a poor hand and the dealer is likely to bust.'
        : 'Against 7 or higher, splitting 6s makes two weak hands. Hit the 12.';
      case 5: return 'Never split 5s. Treat them as a hard 10: double against 2 to 9, otherwise hit.';
      case 4: return action === 'P' ? 'Split 4s only against 5 or 6, and only when you can double after splitting.'
        : 'Do not split 4s here. Hard 8 is a better start than two 4s, so hit.';
      default: return action === 'P' ? `Split small pairs against 2 to 7${rules.das ? '' : ' (4 to 7 when you cannot double after split)'}. The dealer is weak enough to make two hands worthwhile.`
        : 'Against 8 or higher, do not split small pairs. Just hit.';
    }
  }
  if (info.soft) {
    if (action === 'D') return `Soft hands cannot bust with one card, and ${u} is a weak dealer card. Double to get more money out while you have the advantage.`;
    if (info.total >= 19) return 'Soft 19 or better is already a strong hand. Stand.';
    if (info.total === 18) {
      return action === 'S' ? 'Soft 18 is ahead of a dealer 2, 7 or 8. Stand.'
        : 'Soft 18 is an underdog against 9, 10 or Ace. Hitting cannot bust you and gives a chance to improve.';
    }
    return 'Soft 17 or less never stands. You cannot bust, and 17 only wins when the dealer busts.';
  }
  const t = info.total;
  if (action === 'D') {
    return t === 11 ? 'Eleven is the best doubling hand. Any ten gives you 21.'
      : t === 10 ? 'Double 10 whenever the dealer shows less than 10. You are the favourite, so get more money out.'
        : 'Double 9 against a weak dealer card (3 to 6).';
  }
  if (t >= 17) return 'Always stand on hard 17 or more. Hitting busts far too often.';
  if (t <= 11) {
    if (info.n > 2 && t >= 9) return 'You would double this with two cards. With three or more you can only hit.';
    return t === 11 ? 'Against an Ace when the dealer stands on soft 17, just hit 11.'
      : t === 10 ? 'Do not double 10 against a 10 or Ace. The dealer is too strong, so just hit.'
        : 'You cannot bust this hand, and it is not strong enough to double here. Hit.';
  }
  if (action === 'S') {
    return t === 12 ? 'Stand on 12 against 4, 5 or 6. These are the dealer\'s worst cards, so let the dealer bust.'
      : `The dealer shows a bust card (${up}). Do not risk busting your ${t}. Stand and let the dealer draw.`;
  }
  if (t === 12 && weak) return 'Hit 12 against a 2 or 3. Only a ten busts you, and the dealer is not weak enough to stand.';
  return `Against ${u}, assume the dealer makes 17 or better. Your ${t} only wins if the dealer busts, so you have to hit.`;
}

/* ---------- Hi-Lo deviations ---------- */
// Play `ge` when the true count is at or above idx, otherwise `lt`.
export const DEVIATIONS = [
  { t: 16, up: 10, idx: 0, ge: 'S', lt: 'H', noSurr: true },
  { t: 15, up: 10, idx: 4, ge: 'S', lt: 'H', noSurr: true },
  { t: 12, up: 3, idx: 2, ge: 'S', lt: 'H' },
  { t: 12, up: 2, idx: 3, ge: 'S', lt: 'H' },
  { t: 12, up: 4, idx: 0, ge: 'S', lt: 'H' },
  { t: 12, up: 5, idx: -2, ge: 'S', lt: 'H' },
  { t: 12, up: 6, idx: -1, ge: 'S', lt: 'H' },
  { t: 13, up: 2, idx: -1, ge: 'S', lt: 'H' },
  { t: 13, up: 3, idx: -2, ge: 'S', lt: 'H' },
  { t: 16, up: 9, idx: 5, ge: 'S', lt: 'H', noSurr: true },
  { t: 10, up: 10, idx: 4, ge: 'D', lt: 'H' },
  { t: 10, up: 11, idx: 4, ge: 'D', lt: 'H' },
  { t: 11, up: 11, idx: 1, ge: 'D', lt: 'H', s17only: true },
  { t: 9, up: 2, idx: 1, ge: 'D', lt: 'H' },
  { t: 9, up: 7, idx: 3, ge: 'D', lt: 'H' },
  { pair: 10, up: 5, idx: 5, ge: 'P', lt: 'S' },
  { pair: 10, up: 6, idx: 4, ge: 'P', lt: 'S' },
  { t: 14, up: 10, idx: 3, ge: 'R', lt: 'H', surr: true },
  { t: 15, up: 10, idx: 0, ge: 'R', lt: 'H', surr: true },
  { t: 15, up: 9, idx: 2, ge: 'R', lt: 'H', surr: true },
  { t: 15, up: 11, idx: 1, ge: 'R', lt: 'H', surr: true, s17only: true },
];
export const INSURANCE_INDEX = 3;

function deviation(info, up, tc, rules, avail, asPair) {
  // Surrender entries are listed last but take priority when they apply.
  const order = [...DEVIATIONS].sort((a, b) => (b.surr ? 1 : 0) - (a.surr ? 1 : 0));
  for (const d of order) {
    if (d.up !== up) continue;
    if (d.s17only && rules.h17) continue;
    if (d.pair) { if (!(asPair && info.pair === d.pair)) continue; }
    else if (asPair || info.soft || info.total !== d.t) continue;
    if (d.surr && !avail.R) continue;
    if (d.noSurr && avail.R) continue;
    let action = tc >= d.idx ? d.ge : d.lt;
    if (action === 'D' && !avail.D) action = 'H';
    return { action, idx: d.idx };
  }
  return null;
}

/* ---------- Advice ---------- */

// values: card values in the hand. avail: { H, S, D, P, R } booleans.
// tc: floored true count to apply Hi-Lo deviations, or null for pure basic strategy.
export function advise(values, up, rules, avail, tc = null) {
  const info = handInfo(values);
  const asPair = info.pair !== null && !!avail.P;
  const code = asPair ? pairCode(info.pair, up, rules)
    : info.soft ? softCode(info.total, up, rules) : hardCode(info.total, up, rules);
  const basic = resolveCode(code, avail);
  let action = basic, why = reason(info, up, basic, asPair, rules), dev = null;
  if (tc !== null) {
    const d = deviation(info, up, tc, rules, avail, asPair);
    if (d && d.action !== basic) {
      action = d.action;
      dev = d;
      const sign = d.idx > 0 ? '+' : '';
      why = `Count deviation: basic strategy says ${ACTION_NAMES[basic].toLowerCase()}, but the index for this hand is ${sign}${d.idx} and the true count is ${tc > 0 ? '+' : ''}${tc}, so ${ACTION_NAMES[action].toLowerCase()}.`;
    }
  }
  const cell = asPair ? `p:${info.pair}:${up}`
    : info.soft ? `s:${Math.min(20, Math.max(13, info.total))}:${up}`
      : `h:${Math.min(18, Math.max(8, info.total))}:${up}`;
  return { action, basic, code, why, dev, cell, info, evs: actionEVs(info, up, rules, avail) };
}

/* ---------- House edge and betting ---------- */

// Approximate house edge in percent for a basic strategy player.
export function houseEdge(r) {
  let e = 0.42;
  if (r.decks === 8) e += 0.02;
  if (r.decks === 4) e -= 0.06;
  if (r.h17) e += 0.22;
  if (!r.das) e += 0.14;
  if (r.surrender) e -= r.h17 ? 0.09 : 0.07;
  if (r.bjPayout < 1.5) e += 1.36;
  return e;
}

// Bet in units for a floored true count (a 1-8 spread).
export function betUnits(tc) {
  if (tc <= 1) return 1;
  if (tc === 2) return 2;
  if (tc === 3) return 4;
  if (tc === 4) return 6;
  return 8;
}
