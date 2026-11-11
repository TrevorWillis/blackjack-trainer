// Shoe and round logic for a Vegas-style blackjack table (dealer peeks,
// late surrender, split to four hands, split aces get one card each).
import { cardValue, hiLo, handInfo } from './strategy.js';

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
export const MAX_HANDS = 4;
let uid = 0;

export const values = cards => cards.map(c => cardValue(c.r));
export const info = cards => handInfo(values(cards));

export class Game {
  constructor(rules, rng = Math.random) {
    this.rules = rules;
    this.rng = rng;
    this.phase = 'bet';
    this.hands = [];
    this.dealer = [];
    this.newShoe();
  }

  newShoe() {
    const cards = [];
    for (let d = 0; d < this.rules.decks; d++)
      for (const s of SUITS) for (const r of RANKS) cards.push({ r, s });
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    this.shoe = cards;
    this.pos = 0;
    this.running = 0;
    this.cut = Math.floor(cards.length * this.rules.penetration);
  }

  draw(visible = true) {
    const c = { ...this.shoe[this.pos++], id: ++uid, hidden: !visible };
    if (visible) this.running += hiLo(cardValue(c.r));
    return c;
  }

  get decksLeft() { return (this.shoe.length - this.pos) / 52; }
  get trueCount() { return this.running / Math.max(this.decksLeft, 0.25); }
  get hand() { return this.hands[this.cur]; }
  get upValue() { return cardValue(this.dealer[0].r); }

  startRound(bet) {
    this.justShuffled = this.pos >= this.cut;
    if (this.justShuffled) this.newShoe();
    const hand = { cards: [], bet, fromSplit: false, done: false };
    this.hands = [hand];
    this.dealer = [];
    this.cur = 0;
    this.insurance = null;
    this.net = 0;
    hand.cards.push(this.draw());
    this.dealer.push(this.draw());
    hand.cards.push(this.draw());
    this.dealer.push(this.draw(false));
    if (this.upValue === 11) this.phase = 'insurance';
    else this.peek();
  }

  takeInsurance(yes) {
    this.insurance = yes ? this.hands[0].bet / 2 : 0;
    this.peek();
  }

  peek() {
    const dealerBJ = this.upValue >= 10 && info(this.dealer).total === 21;
    const playerBJ = info(this.hands[0].cards).total === 21;
    if (dealerBJ || playerBJ) {
      this.hands[0].done = true;
      this.reveal();
      this.settle();
    } else this.phase = 'player';
  }

  reveal() {
    const hole = this.dealer[1];
    if (hole.hidden) {
      hole.hidden = false;
      this.running += hiLo(cardValue(hole.r));
    }
  }

  available() {
    const h = this.hand, two = h.cards.length === 2;
    const v = values(h.cards);
    return {
      H: true,
      S: true,
      D: two && (!h.fromSplit || this.rules.das),
      P: two && v[0] === v[1] && this.hands.length < MAX_HANDS,
      R: this.rules.surrender && two && !h.fromSplit,
    };
  }

  act(a) {
    const h = this.hand;
    if (a === 'H') {
      h.cards.push(this.draw());
      if (info(h.cards).total >= 21) h.done = true;
    } else if (a === 'S') {
      h.done = true;
    } else if (a === 'D') {
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(this.draw());
      h.done = true;
    } else if (a === 'R') {
      h.surrendered = true;
      h.done = true;
    } else if (a === 'P') {
      const aces = cardValue(h.cards[0].r) === 11;
      const mk = c => ({ cards: [c], bet: h.bet, fromSplit: true, done: false });
      const a1 = mk(h.cards[0]), a2 = mk(h.cards[1]);
      this.hands.splice(this.cur, 1, a1, a2);
      if (aces) {
        for (const x of [a1, a2]) { x.cards.push(this.draw()); x.done = true; }
      } else {
        a1.cards.push(this.draw());
        if (info(a1.cards).total === 21) a1.done = true;
      }
    }
    if (this.hand.done) this.advance();
  }

  advance() {
    while (this.cur < this.hands.length && this.hands[this.cur].done) this.cur++;
    if (this.cur >= this.hands.length) return this.dealerPlay();
    const h = this.hand;
    if (h.cards.length === 1) {
      h.cards.push(this.draw());
      if (info(h.cards).total === 21) { h.done = true; this.advance(); }
    }
  }

  dealerPlay() {
    this.reveal();
    const live = this.hands.some(h => !h.surrendered && info(h.cards).total <= 21);
    if (live) {
      for (;;) {
        const d = info(this.dealer);
        if (d.total > 17 || (d.total === 17 && !(d.soft && this.rules.h17))) break;
        this.dealer.push(this.draw());
      }
    }
    this.settle();
  }

  settle() {
    const d = info(this.dealer);
    const dealerBJ = this.dealer.length === 2 && d.total === 21;
    let net = 0;
    for (const h of this.hands) {
      const p = info(h.cards);
      const bj = !h.fromSplit && h.cards.length === 2 && p.total === 21;
      if (h.surrendered) { h.net = -h.bet / 2; h.result = 'Surrender'; }
      else if (p.total > 21) { h.net = -h.bet; h.result = 'Bust'; }
      else if (bj) { h.net = dealerBJ ? 0 : h.bet * this.rules.bjPayout; h.result = dealerBJ ? 'Push' : 'Blackjack'; }
      else if (dealerBJ) { h.net = -h.bet; h.result = 'Lose'; }
      else if (d.total > 21 || p.total > d.total) { h.net = h.bet; h.result = 'Win'; }
      else if (p.total < d.total) { h.net = -h.bet; h.result = 'Lose'; }
      else { h.net = 0; h.result = 'Push'; }
      net += h.net;
    }
    if (this.insurance) {
      this.insuranceNet = dealerBJ ? this.insurance * 2 : -this.insurance;
      net += this.insuranceNet;
    } else this.insuranceNet = 0;
    this.dealerBJ = dealerBJ;
    this.net = net;
    this.cur = -1;
    this.phase = 'done';
  }
}
