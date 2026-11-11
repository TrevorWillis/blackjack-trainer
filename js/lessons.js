// Lesson content for the Learn tab. Plain HTML strings.

export const LESSONS = [
  {
    title: 'How basic strategy thinks',
    tag: 'Start here',
    html: `
<p>Basic strategy is the single best play for every hand against every dealer upcard. It was worked out by computer, and it is not a matter of opinion. Played perfectly at a good table it cuts the house edge to about half a percent, the best odds on the casino floor.</p>
<p>You do not need to memorise 300 cells one by one. Almost all of it follows from three ideas:</p>
<ul>
<li><b>Dealer 2 to 6 is weak.</b> The dealer must hit until 17, and from these cards busts 35 to 42% of the time. Do not bust first. Stand on your stiff hands (13 to 16) and put more money out by doubling and splitting.</li>
<li><b>Dealer 7 to Ace is strong.</b> Assume the dealer ends on 17 or better. A stiff hand that stands is just a loser, so hit until you reach 17.</li>
<li><b>Double when you are the favourite.</b> 10 and 11 against a smaller dealer card, and soft hands against the dealer's weakest cards.</li>
</ul>
<h4>The whole chart as rules</h4>
<p><b>Surrender</b> (check first, if offered): 16 against 9, 10, Ace. 15 against 10. If the dealer hits soft 17, also 15 and 17 against an Ace.</p>
<p><b>Pairs</b></p>
<ul>
<li>Always split Aces and 8s.</li>
<li>Never split 10s or 5s. Treat 5,5 as a 10.</li>
<li>9s: split against 2 to 9, except stand against 7.</li>
<li>7s: split against 2 to 7. 6s: against 2 to 6.</li>
<li>2s and 3s: split against 2 to 7. 4s: only against 5 and 6.</li>
</ul>
<p><b>Soft hands</b> (an Ace counted as 11)</p>
<ul>
<li>Soft 19 and 20: stand. (Double soft 19 against a 6 if the dealer hits soft 17.)</li>
<li>Soft 18: double against 2 to 6, stand against 7 and 8, <b>hit</b> against 9, 10, Ace.</li>
<li>Soft 17: double against 3 to 6, otherwise hit.</li>
<li>Soft 15 and 16: double against 4 to 6. Soft 13 and 14: double against 5 and 6. Otherwise hit.</li>
</ul>
<p><b>Hard hands</b></p>
<ul>
<li>17 and up: stand.</li>
<li>13 to 16: stand against 2 to 6, hit against 7 and up.</li>
<li>12: stand against 4 to 6 only.</li>
<li>11: double. 10: double against 2 to 9. 9: double against 3 to 6.</li>
<li>8 or less: hit.</li>
</ul>
<p>The plays people get wrong most: hitting 12 against a 2 or 3, hitting soft 18 against 9, 10 or Ace, splitting 8s against a 10, doubling 11 against a 10, and hitting 16 against a 7. Use the <b>Drill</b> tab until these feel automatic.</p>`,
  },
  {
    title: 'Picking a good table',
    tag: 'Worth more than any play',
    html: `
<p>Where you sit matters more than how you play any one hand. Read the placard and the felt before you buy in.</p>
<ul>
<li><b>Blackjack pays 3 to 2. Walk past 6 to 5.</b> On a $25 bet a blackjack pays $37.50 at 3:2 and only $30 at 6:5. That one rule roughly quadruples the house edge, from about 0.5% to about 2%. Most low-minimum tables on the Strip are 6:5. The payout is printed on the felt.</li>
<li><b>Dealer stands on soft 17 (S17)</b> is better for you than "hits soft 17" (H17) by about 0.2%. S17 is usually only at higher limits.</li>
<li><b>Double after split and late surrender</b> are both good for you. Ask the dealer if surrender is offered, since it is often not posted.</li>
<li><b>Fewer decks is better</b> only if the other rules match. A single-deck game paying 6:5 is much worse than an eight-deck shoe paying 3:2.</li>
<li><b>Continuous shuffling machines</b> do not change basic strategy, but they deal more hands per hour, so you lose faster. They make counting useless.</li>
<li><b>Skip the variants</b> unless you learn their own strategy: Free Bet Blackjack, Blackjack Switch, Super Fun 21, and most electronic or stadium blackjack (often 6:5 or worse).</li>
</ul>
<h4>Finding minimums you can afford</h4>
<ul>
<li>On the Strip, 3:2 games usually start at $25 and often $50 or more on busy nights. Downtown (Fremont Street) and off-Strip locals casinos tend to have lower minimums with the same or better rules.</li>
<li>Minimums go up at night, on weekends, and sharply around New Year's Eve. Mornings and afternoons are cheaper and the tables are calmer.</li>
<li>Rules and limits change often. Look up a current Las Vegas blackjack survey shortly before your trip, then confirm at the table.</li>
<li>A full table is slower. Fewer hands per hour means a smaller expected loss for the same amount of fun.</li>
</ul>
<p>Use the <b>Rules</b> button at the top to set this trainer to the game you plan to play. The chart and corrections adjust.</p>`,
  },
  {
    title: 'At the table: signals and etiquette',
    tag: 'Look like you belong',
    html: `
<p>In shoe games the cards are dealt face up and you never touch them. The cameras need to see your decision, so you signal with your hand as well as speaking.</p>
<table class="info">
<tr><th>Play</th><th>Signal</th></tr>
<tr><td>Hit</td><td>Tap or scratch the felt behind your cards.</td></tr>
<tr><td>Stand</td><td>Wave your hand flat over your cards.</td></tr>
<tr><td>Double</td><td>Place an equal stack <i>next to</i> your bet, not on top, and hold up one finger.</td></tr>
<tr><td>Split</td><td>Place an equal stack next to your bet and hold up two fingers in a V.</td></tr>
<tr><td>Surrender</td><td>Say "surrender" out loud before doing anything else. Some dealers also want a line drawn behind the bet with a finger.</td></tr>
</table>
<h4>Buying in and cashing out</h4>
<ul>
<li>Wait for the hand to finish, then lay cash flat on the felt. The dealer cannot take money from your hand.</li>
<li>Hand over your players card at the same time so your play gets rated.</li>
<li>Do not touch your bet once the cards are out. Stack bigger chips on the bottom.</li>
<li>When you leave, ask to "colour up". The dealer swaps your stack for larger chips, and you take them to the cage for cash.</li>
</ul>
<h4>Good manners</h4>
<ul>
<li>Keep your phone off the table and do not take photos.</li>
<li>In hand-held single or double deck games, use one hand only and keep cards over the table.</li>
<li>You can ask the dealer what the book says, and most casinos allow a basic strategy card at the table if you do not slow the game.</li>
<li>Other players' decisions do not change your long-run odds. Ignore anyone who says you "took the dealer's bust card".</li>
<li>Tipping is customary but optional. A chip for the dealer now and then, or a small bet placed for the dealer in front of yours, is plenty. Tip the cocktail server a dollar or two per drink.</li>
<li>Drinks are free while you play. They also make the chart harder to remember. Pace yourself.</li>
</ul>`,
  },
  {
    title: 'Bets to skip',
    tag: 'Easy money saved',
    html: `
<ul>
<li><b>Insurance.</b> A side bet that the dealer has a ten in the hole. It pays 2 to 1, but the true odds are about 9 to 4 against. House edge about 7%. Always decline, unless you are counting and the true count is +3 or higher.</li>
<li><b>Even money.</b> Offered when you have blackjack and the dealer shows an Ace. It is insurance under another name. Decline it and take the 3:2 most of the time.</li>
<li><b>Side bets.</b> 21+3, Perfect Pairs, Lucky Ladies, Buster and the rest carry edges from about 3% to over 20%, compared with 0.5% on the main bet. A $5 side bet often costs more per hour than your $25 main bet.</li>
<li><b>Betting systems.</b> Martingale and other progressions change how your results are distributed, not the edge. Doubling after losses runs into the table maximum or your bankroll sooner than it feels like it should.</li>
<li><b>Playing a hunch.</b> Every departure from the chart costs money on average. This trainer shows the cost in the Stats tab.</li>
</ul>`,
  },
  {
    title: 'Bankroll and what it really costs',
    tag: 'Includes a calculator',
    html: `
<p>Even with perfect play the house has a small edge, so think of it as the price of entertainment:</p>
<p class="formula">expected loss = average bet × hands per hour × hours × house edge</p>
<div class="calc" data-calc>
  <label>Average bet $<input type="number" inputmode="decimal" name="bet" value="25" min="1"></label>
  <label>Hands per hour<input type="number" inputmode="numeric" name="hph" value="70" min="1"></label>
  <label>Hours<input type="number" inputmode="decimal" name="hours" value="4" min="0.5" step="0.5"></label>
  <div class="calc-out" data-calc-out></div>
</div>
<p>A full table deals about 60 hands an hour, a half-empty one 100 or more, and heads-up against the dealer over 200.</p>
<h4>Swings are much bigger than the edge</h4>
<p>The result of one hand has a standard deviation of about 1.15 bets. Over a few hours luck dominates: being up or down 20 to 30 bets is ordinary. That cuts both ways, so size your bets to survive the bad runs.</p>
<ul>
<li><b>Session bankroll:</b> bring at least 40 to 50 times your bet to a session. At a $25 table that is $1,000 to $1,250. With less, a normal cold streak ends your night early.</li>
<li><b>Trip bankroll:</b> decide the total you can lose before you leave home and split it by session. Leave the cards and the rest of the cash in the room safe.</li>
<li><b>Keep enough for doubles and splits.</b> Those are the hands where you have the advantage, and passing on them costs you.</li>
<li><b>Loss limits and win goals</b> do not change the maths, but they stop you from chasing. Decide them sober.</li>
<li>Casino ATMs charge high fees. Bring cash.</li>
</ul>`,
  },
  {
    title: 'Players cards and comps',
    tag: 'Free value',
    html: `
<ul>
<li>Sign up for the free players card at each casino group you visit, and hand it to the dealer when you buy in. Most of the Strip belongs to a couple of large loyalty programmes, so one card covers many casinos.</li>
<li>The pit rates you on <b>average bet × hours played × the edge they assume</b>, which is your theoretical loss. They assume a higher edge than a basic strategy player actually gives up, so comps are worth more to you than to most players.</li>
<li>Expect roughly 10 to 30% of your theoretical loss back as food credit, room discounts and future offers.</li>
<li>Before you check out, ask at the players desk or a host whether any of your room or dining charges can be comped against your play.</li>
<li>Do not play longer or bigger to earn comps. They are a rebate on a cost, never a profit.</li>
</ul>`,
  },
  {
    title: 'Card counting, realistically',
    tag: 'Optional',
    html: `
<p>Counting does not mean memorising cards. You keep one running number that says whether the cards left in the shoe favour you. High cards (tens and aces) help the player: more blackjacks at 3:2, better doubles, more dealer busts.</p>
<h4>Hi-Lo</h4>
<table class="info">
<tr><th>Cards</th><th>Count</th></tr>
<tr><td>2, 3, 4, 5, 6</td><td>+1</td></tr>
<tr><td>7, 8, 9</td><td>0</td></tr>
<tr><td>10, J, Q, K, A</td><td>−1</td></tr>
</table>
<ol>
<li><b>Running count:</b> add each card you see, starting from 0 after the shuffle.</li>
<li><b>True count:</b> divide the running count by the decks left in the shoe. A running count of +6 with 3 decks left is a true count of +2.</li>
<li><b>Bet with the count:</b> each true count point is worth about half a percent to you. You have the edge at about +2 and up. Bet the minimum below that and more above it.</li>
<li><b>Play with the count:</b> a handful of plays change, such as standing on 16 against a 10 when the count is zero or higher, and taking insurance at +3.</li>
</ol>
<h4>What to expect</h4>
<ul>
<li>Counting with your head is legal. Using a phone or any device is not. Casinos are private businesses and can ask you to stop playing blackjack if they suspect you.</li>
<li>The edge is small, around half a percent to one percent with a wide bet spread, and the swings are large. It takes a big bankroll and many hours to matter.</li>
<li>It only works at 3:2 shoe games dealt by hand or by an ordinary shuffler, with most of the shoe dealt out.</li>
<li>Accuracy at speed, with noise and conversation, takes weeks of practice. A miscounted shoe is worse than not counting.</li>
</ul>
<p>For this trip, flawless basic strategy at a 3:2 table is the goal that pays. Use the <b>Count</b> tab to practise if you enjoy it, and turn on count mode under <b>Rules</b> to practise during play.</p>`,
  },
  {
    title: 'Other games: where the odds are',
    tag: 'Craps, video poker and more',
    html: `
<table class="info">
<tr><th>Game and bet</th><th>House edge</th></tr>
<tr><td>Blackjack, 3:2, basic strategy</td><td>about 0.5%</td></tr>
<tr><td>Craps: pass or come, with odds</td><td>1.41% on the flat bet, 0% on the odds</td></tr>
<tr><td>Craps: don't pass or don't come</td><td>1.36%</td></tr>
<tr><td>Craps: place 6 or 8</td><td>1.52%</td></tr>
<tr><td>Video poker: 9/6 Jacks or Better, perfect play</td><td>0.46%</td></tr>
<tr><td>Baccarat: banker / player</td><td>1.06% / 1.24%</td></tr>
<tr><td>Pai Gow Poker</td><td>about 1.5 to 2.5%, and slow</td></tr>
<tr><td>Blackjack paying 6:5</td><td>about 2%</td></tr>
<tr><td>Roulette: single zero</td><td>2.70%</td></tr>
<tr><td>Roulette: double zero / triple zero</td><td>5.26% / 7.69%</td></tr>
<tr><td>Craps: field, hardways, any seven</td><td>5.6% / 9 to 11% / 16.7%</td></tr>
<tr><td>Baccarat tie</td><td>about 14%</td></tr>
<tr><td>Slots on the Strip</td><td>often 8 to 12%</td></tr>
<tr><td>Keno, Big Six wheel</td><td>11% to over 25%</td></tr>
</table>
<h4>Craps in two minutes</h4>
<ul>
<li>Put a bet on the <b>pass line</b> before the come-out roll. 7 or 11 wins, 2, 3 or 12 loses, anything else becomes the point.</li>
<li>Once there is a point, place an <b>odds bet</b> behind your pass line bet. It pays true odds with no house edge. It is the only bet in the casino like that. Take as much as you are comfortable with (3x-4x-5x is common).</li>
<li>You win if the point repeats before a 7. Come bets work the same way, started mid-roll.</li>
<li>Stay away from the centre of the table. The proposition bets the stickman calls out are the worst on the layout.</li>
<li>Hand signals and jargon are thick at a craps table. Tell the dealer you are new and they will help you place bets.</li>
</ul>
<h4>Video poker</h4>
<ul>
<li>The pay table is the whole game. On Jacks or Better look at the one-coin payouts for full house and flush. <b>9 and 6</b> is the full-pay version (99.5% return). 8/5 returns about 97.3%, and worse is common, especially at bar tops.</li>
<li>Always bet five coins. The royal flush bonus only pays at max coins. Drop to a smaller denomination if five coins is too much.</li>
<li>It needs its own strategy to hit those returns. Learn a Jacks or Better strategy card first.</li>
</ul>
<h4>Roulette and baccarat</h4>
<ul>
<li>Roulette: count the green pockets before you sit. One zero is twice as good as two, and triple zero is the worst. Every bet on a given wheel has the same edge, so no pattern or system helps.</li>
<li>Baccarat: bet banker or player, never the tie. No decisions to make, and the edge is low, but the hands are fast.</li>
</ul>`,
  },
];
