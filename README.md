# Vegas Blackjack Trainer

A browser game for learning perfect blackjack basic strategy before a Las Vegas trip. Play simulated hands, get corrected the moment you stray from the ideal play, and pick up the other skills that matter on a casino floor.

## What is in it

- **Play**: a full table with a real shoe, betting, splits, doubles, surrender and insurance. Every decision is checked against basic strategy. Wrong plays are explained, with the average cost of each option.
- **Drill**: rapid-fire decisions with no payouts. Hands you miss come back more often.
- **Chart**: the strategy chart for your table's rules, with the reasoning behind each cell and an overlay of your own accuracy.
- **Count**: Hi-Lo running count drill, true count conversion, bet sizing, and the plays that change with the count.
- **Learn**: lessons on how basic strategy works, choosing a table (3:2 vs 6:5), hand signals and etiquette, bets to skip, bankroll, comps, counting, and the odds of craps, video poker, baccarat and roulette.
- **Stats**: accuracy, streaks, the cost of your mistakes, and your weakest hands.

Use the **Rules** button to match the table you plan to play: 4, 6 or 8 decks, dealer hits or stands on soft 17, double after split, late surrender, and 3:2 or 6:5 payouts. Count mode and count-based deviations are optional and off by default.

Progress is saved in your browser. To protect it or move it to another device, use **Stats → Save a restore link**; opening that link restores everything. Keyboard: `H` hit, `S` stand, `D` double, `P` split, `R` surrender, `Space` deal.

## Run it

It is a static site with no build step.

```bash
npm start
```

Then open http://localhost:8080. Any static file server works.

## Tests

```bash
npm test
```

The tests check every cell of the strategy chart against an expected-value model for all rule combinations, and simulate 300,000 hands of perfect play to confirm the house edge lands where it should.

## Notes on accuracy

The chart is the standard total-dependent basic strategy for 4 to 8 deck shoe games. Single and double deck games differ in a few cells and are not covered. The per-play cost figures come from an infinite-deck model, so they are close approximations. House edge figures are approximate.
