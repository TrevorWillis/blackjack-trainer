# Vegas Blackjack Trainer

A browser game for learning perfect blackjack basic strategy before a Las Vegas trip. Play simulated hands, get corrected the moment you stray from the ideal play, and pick up the other skills that matter on a casino floor.

## What is in it

- **Play**: a full table with a real shoe, betting, splits, doubles, surrender and insurance. Every decision is checked against basic strategy. Wrong plays are explained, with the average cost of each option.
- **Train**: three ways to practise without payouts.
  - *Learning path*: six stages (stiff hands, doubling, soft hands, pairs, three-card hands, everything mixed), each with its rule and a mastery target of 19 of your last 20.
  - *Free drill*: rapid-fire hands by category or from your weak spots. Hands you miss come back more often.
  - *Exam*: 50 hands with no feedback until the end, optionally at 6 seconds a hand. 48 is a pass.
- **Chart**: the strategy chart for your table's rules, with the reasoning behind each cell and an overlay of your own accuracy.
- **Count**: a seven-stage Hi-Lo course. Each stage explains one idea and then drills it: card values, cancelling pairs, running count, counting a full table, true count, betting, and count-based deviations.
  - In **Play**, count practice is optional: show the count as a guide, or hide it and have your count checked on request and after some rounds. Bets and plays can also be checked against the count.
- **Learn**: lessons on how basic strategy works, choosing a table (3:2 vs 6:5), hand signals and etiquette, bets to skip, bankroll, comps, counting, and the odds of craps, video poker, baccarat and roulette.
- **Stats**: a readiness checklist, accuracy by day, streaks, the cost of your mistakes, and your weakest hands.

Use the **Rules** button to match the table you plan to play: 4, 6 or 8 decks, dealer hits or stands on soft 17, double after split, late surrender, and 3:2 or 6:5 payouts. Count mode and count-based deviations are optional and off by default.

It installs to a phone home screen and works offline. Progress is saved in your browser. To protect it or move it to another device, use **Stats → Save a restore link**; opening that link restores everything. Keyboard: `H` hit, `S` stand, `D` double, `P` split, `R` surrender, `Space` deal.

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
