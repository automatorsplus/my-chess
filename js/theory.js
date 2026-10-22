/*
 * Theory mode: study the openings.
 *
 *  - Learn: step through a line from the Lichess opening list (CC0). The coach
 *    explains each move, names the opening as it appears, shows Stockfish's
 *    verdict and the other theory moves at that point.
 *  - Practise: play your side of a line from memory. Lines you know come back
 *    less often (spaced repetition), lines you get wrong come back soon.
 *  - Coach: a guided game. The opponent plays theory moves while there are any,
 *    then Stockfish at a chosen strength. On your turn the coach shows the
 *    theory moves, Stockfish's three best moves, the opponent's threat and the
 *    rules of thumb that apply (loose pieces, development, castling).
 *
 * Accuracy: move suggestions only ever come from the Lichess lines or from
 * Stockfish; the rule highlights are facts read off the board.
 */
window.MyChessTheory = (function () {
  'use strict';

  const STORE = 'mychess.theory.v1';
  const DAY = 86400000;
  const INTERVALS = [0, 1, 3, 7, 16, 35]; // days until the next review, per box
  const MASTERED_BOX = 4;
  const LEARN_DEPTH = { depth: 16, movetime: 1500 };
  const GUIDE_DEPTH = { depth: 16, movetime: 1500, multipv: 3 };
  const THREAT_DEPTH = { depth: 12, movetime: 700 };
  const COACH_ELOS = [800, 1000, 1200, 1400, 1600, 1800, 2000, 2400, 2800, 3190];
  const SIDE = ['White', 'Black'];
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // The switcher at the top of Theory: Plan, Openings and Middlegame (Middlegame
  // is js/strategy.js, shown under the same tab).
  function sectionsHtml(current) {
    return '<div class="segmented full th-sections" role="radiogroup" aria-label="Theory" id="thSection">' +
      [['plan', 'Plan'], ['openings', 'Openings'], ['middlegame', 'Middlegame']]
        .map(([v, label]) => `<button type="button" role="radio" data-value="${v}" aria-checked="${v === current}">${label}</button>`).join('') + '</div>';
  }

  // ---------------------------------------------------------------- the course

  const GROUPS = [
    { id: 'open', title: '1.e4 e5: open games' },
    { id: 'semi', title: '1.e4: other defences' },
    { id: 'qg', title: '1.d4 d5: queen’s gambits' },
    { id: 'indian', title: '1.d4: Indian and other defences' },
    { id: 'd4w', title: '1.d4: systems for White' },
    { id: 'flank', title: 'Flank openings' },
  ];

  // side: who usually chooses the opening. main: the line Learn starts with (a Lichess line).
  const CHAPTERS = [
    {
      id: 'italian', group: 'open', title: 'Italian Game', side: 'w', level: 'Beginner',
      families: ['Italian Game'],
      main: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3',
      about: 'One of the oldest openings. White develops fast and puts a bishop on c4, aiming at f7, Black’s weakest square early on. Then White either builds a centre with c3 and d4 or manoeuvres slowly with d3.',
      white: ['Play c3 and d3 (or d4), castle, then bring the b1-knight round via d2 and f1 to g3.', 'a4 stops …b5 from chasing your bishop; Bb3 keeps it safe.', 'Bishop on c4 and knight on g5 can team up against f7, but only attack it when it really works.'],
      black: ['Mirror White’s development with …Bc5 or …Nf6, castle, and play …d5 when it is safe.', '…a6 and …Ba7 keep the bishop safe from d4 and b4 attacks.', '…h6 stops Ng5 and Bg5.'],
      know: 'After 3…Nf6 4.Ng5 White attacks f7 at once. Black should answer 4…d5; after 5.exd5 the natural-looking 5…Nxd5 allows 6.Nxf7!, the Fried Liver Attack. 5…Na5 is the main line.',
    },
    {
      id: 'ruy', group: 'open', title: 'Ruy Lopez', side: 'w', level: 'Intermediate',
      families: ['Ruy Lopez'],
      main: '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O',
      about: 'The Spanish Game. White’s bishop attacks the knight that defends e5, which keeps Black under slow, lasting pressure. Played at every level, up to world championship matches.',
      white: ['Castle, then build the ideal centre with c3 and d4.', 'Keep the bishop on the a4–b3 diagonal, eyeing f7. h3 stops …Bg4 before d4.', 'In closed positions, bring the b1-knight round via d2, f1 and g3 towards the kingside.'],
      black: ['…a6 asks the bishop to decide; …b5 then gains space on the queenside.', 'Hold e5 with …d6 and look for …d5 or …f5 breaks later.', 'The Berlin (3…Nf6) and the Marshall (8…d5, a pawn sacrifice) are Black’s most popular modern choices.'],
      know: 'In the Exchange Variation (4.Bxc6 dxc6) White cannot win the e5 pawn yet: 5.Nxe5? Qd4! hits the knight and e4, and Black gets the pawn back.',
    },
    {
      id: 'scotch', group: 'open', title: 'Scotch Game', side: 'w', level: 'Beginner',
      families: ['Scotch Game'],
      main: '1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4',
      about: 'White opens the centre on move three. After the trade on d4, White has a free hand in the centre and easy development; Black gets active pieces in return.',
      white: ['Centralise the knight on d4 and develop quickly: Be3, Nc3, Qd2 and castling long is a common set-up.', 'Against 4…Nf6, 5.Nxc6 bxc6 6.e5 gains space and chases the knight.'],
      black: ['Hit the d4-knight at once with 4…Bc5 or 4…Nf6.', 'Black’s pieces come out easily; aim for …d5 to free the game completely.'],
      know: 'Instead of 4.Nxd4, 4.Bc4 is the Scotch Gambit: White leaves the pawn on d4 for a lead in development.',
    },
    {
      id: 'fourknights', group: 'open', title: 'Four Knights Game', side: 'w', level: 'Beginner',
      families: ['Four Knights Game', 'Three Knights Opening'],
      main: '1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 4. Bb5',
      about: 'Both sides bring out their knights first. Solid and logical, it is one of the best openings for learning how to develop.',
      white: ['4.Bb5 (the Spanish Four Knights) or 4.d4 (the Scotch Four Knights) are the main ways to make something happen.', 'Castle quickly and look for d4 to open the centre.'],
      black: ['Copy White’s set-up with …Bb4 and castling, or play the sharper 4…Nd4 (the Rubinstein Countergambit).', 'Symmetrical positions are safe; trading pieces early is fine.'],
      know: 'The Halloween Gambit (4.Nxe5?!) gives up a knight for a pawn and a big centre. Stockfish gives Black a clear advantage, but it is a dangerous surprise if you do not know it.',
    },
    {
      id: 'vienna', group: 'open', title: 'Vienna Game', side: 'w', level: 'Intermediate',
      families: ['Vienna Game', 'Vienna Gambit'],
      main: '1. e4 e5 2. Nc3 Nf6 3. f4',
      about: 'White develops the queen’s knight first and keeps the f-pawn free to advance: a King’s Gambit with a piece already out.',
      white: ['Prepare f4 to attack e5 and open the f-file.', 'Bc4 aims at f7; g3 and Bg2 is a quieter set-up.'],
      black: ['Hit back in the centre with …Nf6 and …d5.', '…Bc5 makes f4 risky because of checks on the g1–a7 diagonal.'],
      know: 'After 2…Nf6 3.Bc4 Nxe4!? Black uses the “fork trick”: 4.Nxe4 d5 wins the piece back with a good centre. The sharp 4.Qh5 leads to the wild Frankenstein–Dracula Variation.',
    },
    {
      id: 'kingsgambit', group: 'open', title: 'King’s Gambit', side: 'w', level: 'Intermediate',
      families: ['King\'s Gambit', 'King\'s Gambit Accepted', 'King\'s Gambit Declined'],
      main: '1. e4 e5 2. f4 exf4 3. Nf3 d6',
      about: 'The romantic opening. White offers the f-pawn to deflect Black’s e-pawn, open the f-file and build a big centre with d4. Stockfish rates 2.f4 slightly risky (an inaccuracy), but the positions are sharp and full of traps for both sides.',
      white: ['After …exf4, play Nf3: the knight guards h4 against …Qh4+. Then d4, and win the pawn back with Bxf4 when you can.', 'Castle and use the half-open f-file against f7.'],
      black: ['Keep the extra pawn with …g5, or give it back with …d5 for free development.', 'Declining with 2…Bc5 is safe: the bishop stops White from castling for a while.'],
      know: 'After 3.Nf3 the knight guards h4, so the annoying …Qh4+ check would just lose the queen to Nxh4. That is the main reason 3.Nf3 is the main line.',
    },
    {
      id: 'petrov', group: 'open', title: 'Petrov’s Defence', side: 'b', level: 'Intermediate',
      families: ['Petrov\'s Defense'],
      main: '1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4',
      about: 'Black answers 2.Nf3 with a counterattack on e4 instead of defending e5. Very solid, and a favourite of top players who want a safe game with Black.',
      white: ['Take on e5 (3.Nxe5) or open the centre with 3.d4.', 'Aim for small, lasting pluses: d4, Bd3, castling and c4.'],
      black: ['After 3.Nxe5, play 3…d6 first and only then take on e4.', 'Develop quickly; the position is symmetrical, so accuracy matters more than aggression.'],
      know: 'After 3.Nxe5 Nxe4 (the Damiano Variation), 4.Qe2! pins the knight to the king. The natural retreat 4…Nf6?? loses the queen to 5.Nc6+, a discovered check; Black must play 4…Qe7. Playing 3…d6 first avoids all of this.',
    },
    {
      id: 'philidor', group: 'open', title: 'Philidor Defence', side: 'b', level: 'Beginner',
      families: ['Philidor Defense'],
      main: '1. e4 e5 2. Nf3 d6 3. d4 Nf6 4. Nc3 Nbd7',
      about: 'Black defends e5 with the d-pawn. Solid but a little passive: White gets more space, Black gets a sturdy position that is hard to break.',
      white: ['Push d4 to question e5, develop, castle, and use your extra space.', 'Bc4 aims at f7, the weak spot in Black’s camp.'],
      black: ['Hold the strong point on e5 with …Nbd7, …Be7 and …c6, then castle.', 'Later, …b5 or …exd4 with pressure on e4 brings counterplay.'],
      know: 'Move order matters in the Philidor. With an early …Nd7, Bc4 puts real pressure on f7, and some natural Black moves already lose material.',
    },
    {
      id: 'sicilian', group: 'semi', title: 'Sicilian Defence', side: 'b', level: 'Intermediate',
      families: ['Sicilian Defense'],
      main: '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6',
      about: 'The most popular reply to 1.e4. Black fights for d4 from the side with …c5, which leads to unbalanced positions where both sides play to win.',
      white: ['Open Sicilian: play d4, recapture with the knight, develop fast and attack on the kingside (Be3, f3, Qd2, castle long and g4).', 'Quieter choices: 2.c3 (the Alapin) or 3.Bb5 avoid the heaviest theory.'],
      black: ['Use the half-open c-file: …Rc8, …Qc7 and …b5 for queenside counterplay.', 'Strike in the centre with …d5 or …e5 at the right moment.'],
      know: 'After the trade on d4 Black has two centre pawns against White’s one, a long-term plus. White has to use the lead in development before it fades.',
    },
    {
      id: 'french', group: 'semi', title: 'French Defence', side: 'b', level: 'Intermediate',
      families: ['French Defense'],
      main: '1. e4 e6 2. d4 d5 3. e5 c5 4. c3 Nc6 5. Nf3 Qb6 6. a3',
      about: 'Black builds a solid pawn chain with …e6 and …d5. The price: the bishop on c8 is shut in, so Black has to hit back at White’s centre.',
      white: ['Grab space with e5 and support d4 with c3 and Nf3.', 'Your space advantage favours an attack on the kingside.'],
      black: ['Attack the base of White’s pawn chain: …c5 against d4, later …f6 against e5.', 'Pile up on d4 with …Nc6, …Qb6 and …Nge7–f5.'],
      know: 'In the Advance Variation the queen on b6 attacks b2 and, from behind the c5 pawn, adds to the pressure on d4. White’s 6.a3 prepares b4 to gain space on the queenside.',
    },
    {
      id: 'carokann', group: 'semi', title: 'Caro-Kann Defence', side: 'b', level: 'Beginner',
      families: ['Caro-Kann Defense'],
      main: '1. e4 c6 2. d4 d5 3. Nd2 dxe4 4. Nxe4 Bf5',
      about: 'Black supports …d5 with …c6. Like the French, but the light-squared bishop gets out (to f5 or g4) before …e6. Solid, with a healthy pawn structure.',
      white: ['Gain space with 3.e5 (the Advance), or take on e4 with a knight and chase Black’s bishop with Ng3 and h4.', 'Use your extra space for play in the centre or on the kingside.'],
      black: ['Develop the bishop to f5 or g4 first, then …e6, …Nd7 and …Ngf6.', 'In the Advance Variation, hit d4 with …c5.'],
      know: 'A famous trap: 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nd7 5.Qe2 Ngf6?? 6.Nd6 is checkmate. The e7-pawn is pinned by the queen, so it cannot take the knight.',
    },
    {
      id: 'scandinavian', group: 'semi', title: 'Scandinavian Defence', side: 'b', level: 'Beginner',
      families: ['Scandinavian Defense'],
      main: '1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5',
      about: 'Black challenges e4 on move one. After 2.exd5 Qxd5 the queen is out early, so Black must not lose too much time when it is attacked.',
      white: ['Gain time with Nc3 attacking the queen, then d4, Nf3 and fast development.', 'Your lead in development can become an attack if Black is slow.'],
      black: ['Put the queen on a5 or d6, then play …Nf6, …c6 and …Bf5 or …Bg4: a sturdy set-up.', '2…Nf6 instead of 2…Qxd5 wins the pawn back later with the knight.'],
      know: 'Every time White attacks the queen with a developing move, White gains a tempo. That is the price Black pays for 2…Qxd5.',
    },
    {
      id: 'pirc', group: 'semi', title: 'Pirc and Modern', side: 'b', level: 'Intermediate',
      families: ['Pirc Defense', 'Modern Defense'],
      main: '1. e4 d6 2. d4 Nf6 3. Nc3 g6',
      about: 'Black lets White build a big pawn centre, fianchettoes the bishop on g7, and attacks the centre later with …c5 or …e5. Hypermodern and flexible.',
      white: ['Use the space: the Austrian Attack (f4) or the 150 Attack (Be3, Qd2, Bh6) go straight for Black’s king.', 'Keep the centre stable; if it holds, Black stays cramped.'],
      black: ['Castle, then challenge the centre with …e5 or …c5 at the right moment.', 'The bishop on g7 is your best piece; do not trade it lightly.'],
      know: 'If Black waits too long, White’s e5 push drives the f6-knight away and gains a lot of space.',
    },
    {
      id: 'alekhine', group: 'semi', title: 'Alekhine Defence', side: 'b', level: 'Intermediate',
      families: ['Alekhine Defense'],
      main: '1. e4 Nf6 2. e5 Nd5 3. d4 d6 4. Nf3 Bg4',
      about: 'Black’s knight invites White’s pawns forward. The idea is to let White over-extend, then attack the big centre.',
      white: ['Take space with e5 and d4; adding c4 and f4 (the Four Pawns Attack) is the most ambitious.', 'The calm 4.Nf3 keeps a solid space advantage.'],
      black: ['Hit the centre with …d6, and later …c5 or …Nc6.', 'Pin the f3-knight with …Bg4 to reduce the pressure on d4.'],
      know: 'The knight on d5 can be chased with c4 and c5. Know where it is going (b6 is the usual square) before you start.',
    },
    {
      id: 'qgd', group: 'qg', title: 'Queen’s Gambit Declined', side: 'b', level: 'Intermediate',
      families: ['Queen\'s Gambit Declined', 'Tarrasch Defense'],
      main: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7',
      about: 'Black keeps a strong pawn on d5 with …e6 and does not take the c4 pawn. One of the most respected defences; Black’s main task is finding a good role for the c8-bishop.',
      white: ['Put pressure on f6 with Bg5 and build up with e3, Nf3 and Rc1.', 'In the Exchange Variation, the minority attack (b4–b5) against Black’s queenside pawns is the classic plan.'],
      black: ['Castle, then free your game with …dxc4 and …c5, or trade pieces with …Ne4.', 'Find a job for the c8-bishop: …b6 and …Bb7 is one way.'],
      know: 'The Elephant Trap: 4…Nbd7 5.cxd5 exd5 6.Nxd5?? Nxd5! 7.Bxd8 Bb4+ and Black wins a piece, because the check lets Black take back the queen with interest.',
    },
    {
      id: 'qga', group: 'qg', title: 'Queen’s Gambit Accepted', side: 'b', level: 'Beginner',
      families: ['Queen\'s Gambit Accepted'],
      main: '1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3',
      about: 'Black takes the c4 pawn but does not try to keep it. The point is free development and a quick strike at White’s centre with …c5 or …e5.',
      white: ['Win the pawn back with e3 and Bxc4, or build a big centre with e4.', 'Use the open lines for quick development; an isolated d-pawn often gives White attacking chances.'],
      black: ['Give the pawn back gracefully: develop with …Nf6, …e6 and …c5, and target d4.', '…a6 and …b5 can gain space on the queenside with tempo.'],
      know: 'Trying to hold the pawn with an early …b5 is risky: a4 and b3 attack Black’s queenside pawns, and Stockfish rates 3.e3 b5 an inaccuracy. Give the pawn back and develop instead.',
    },
    {
      id: 'slav', group: 'qg', title: 'Slav and Semi-Slav', side: 'b', level: 'Intermediate',
      families: ['Slav Defense', 'Semi-Slav Defense'],
      main: '1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4',
      about: 'Black supports d5 with …c6 instead of …e6, so the c8-bishop stays free. The Semi-Slav adds …e6 for an even sturdier, but combative, set-up.',
      white: ['Develop with Nf3 and Nc3; if Black takes on c4, a4 stops …b5 and you win the pawn back.', 'e3 and Bd3, or the sharper Bg5 lines against the Semi-Slav.'],
      black: ['Bring the bishop to f5 or g4 before playing …e6.', 'Taking on c4 and holding it with …b5 is the key idea of several lines.'],
      know: 'In the main Slav, after 4…dxc4 White usually plays 5.a4 to stop …b5, then wins the pawn back.',
    },
    {
      id: 'kid', group: 'indian', title: 'King’s Indian Defence', side: 'b', level: 'Advanced',
      families: ['King\'s Indian Defense'],
      main: '1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5',
      about: 'Black lets White take the whole centre, castles behind a fianchettoed bishop, then strikes with …e5 or …c5. Often both sides attack on opposite wings.',
      white: ['Use your space. If the centre closes with d5, attack on the queenside with c5, b4 and Nd2–c4.', 'Keep the centre solid: Black’s play depends on breaking it.'],
      black: ['After d5, play …Ne8 or …Nh5, then …f5 and a kingside pawn storm.', 'The bishop on g7 comes alive once the long diagonal opens.'],
      know: 'In the closed lines it is a race: White’s queenside attack against Black’s kingside attack. Every tempo counts.',
    },
    {
      id: 'nimzo', group: 'indian', title: 'Nimzo-Indian Defence', side: 'b', level: 'Intermediate',
      families: ['Nimzo-Indian Defense'],
      main: '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3',
      about: 'Black pins the c3-knight with …Bb4 and fights for e4 with pieces. Black is often happy to give the bishop for the knight and leave White with doubled pawns.',
      white: ['Play e3, Bd3 and Nf3 (the Rubinstein), or 4.Qc2 to avoid doubled pawns.', 'If you get the bishop pair, open the position for the bishops.'],
      black: ['Control e4, castle, and hit the centre with …c5 or …d5.', 'Against doubled c-pawns, blockade and attack them with …b6, …Ba6 and …Na5.'],
      know: 'The doubled c-pawns after …Bxc3 are a long-term weakness, but they give White the bishop pair and a half-open b-file.',
    },
    {
      id: 'qid', group: 'indian', title: 'Queen’s Indian Defence', side: 'b', level: 'Intermediate',
      families: ['Queen\'s Indian Defense', 'Queen\'s Indian Accelerated'],
      main: '1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. g3 Bb7 5. Bg2 Be7',
      about: 'Black fianchettoes on b7 to control e4 and the long diagonal. Solid and flexible, often reached when White avoids the Nimzo-Indian with 3.Nf3.',
      white: ['Fianchetto your own bishop with g3 and Bg2 to fight for the long diagonal.', 'a3 (the Petrosian System) stops …Bb4 and prepares Nc3 and d5.'],
      black: ['Keep control of e4 with …Bb7, …Ne4 and sometimes …f5.', '…Ba6, hitting the c4 pawn, is an important alternative.'],
      know: 'The fight is about the e4 square: whoever controls it is happy.',
    },
    {
      id: 'grunfeld', group: 'indian', title: 'Grünfeld Defence', side: 'b', level: 'Advanced',
      families: ['Grünfeld Defense', 'Neo-Grünfeld Defense'],
      main: '1. d4 Nf6 2. c4 g6 3. Nc3 d5 4. cxd5 Nxd5 5. e4 Nxc3 6. bxc3 Bg7 7. Nf3',
      about: 'Black lets White build a big pawn centre with e4 and d4, then attacks it with pieces: the g7-bishop, …c5 and …Nc6.',
      white: ['Keep the centre together with Be3, Rc1 and Nf3; push d5 when it gains space with tempo.', 'A big centre gives attacking chances if Black falls behind.'],
      black: ['Pile up on d4: …Bg7, …c5, …Nc6, and …Qa5 or …Bg4.', 'Trade pieces when White’s centre is overextended.'],
      know: 'The whole game revolves around d4. If Black’s pressure wins it, Black is better; if the centre holds, White is.',
    },
    {
      id: 'benoni', group: 'indian', title: 'Benoni and Benko', side: 'b', level: 'Advanced',
      families: ['Benoni Defense', 'Benko Gambit', 'Benko Gambit Accepted', 'Benko Gambit Declined'],
      main: '1. d4 Nf6 2. c4 c5 3. d5 e6 4. Nc3 exd5 5. cxd5 d6 6. e4',
      about: 'Black challenges d4 with …c5. After White’s d5, Black gets an unbalanced game: a queenside pawn majority and an active g7-bishop against White’s space in the centre. The Benko Gambit gives a pawn for queenside pressure instead.',
      white: ['Use your central space: e4, Nf3, Be2, castle, and push e5 when it works.', 'a4 slows down Black’s …b5.'],
      black: ['Fianchetto on g7, castle, and expand with …a6 and …b5.', 'In the Benko, open the a- and b-files and use the long diagonal.'],
      know: 'The e4–e5 push is White’s key break. If Black can stop it, Black’s queenside majority starts to tell.',
    },
    {
      id: 'dutch', group: 'indian', title: 'Dutch Defence', side: 'b', level: 'Intermediate',
      families: ['Dutch Defense'],
      main: '1. d4 f5 2. c4 Nf6 3. g3 e6 4. Bg2 Be7',
      about: 'Black fights for e4 with …f5 and prepares play on the kingside. Ambitious, at the cost of loosening the king a little.',
      white: ['Fianchetto with g3 and Bg2 to blunt Black’s play, then aim for e4.', 'Early tries such as 2.Bg5 or the Staunton Gambit 2.e4 are sharp alternatives.'],
      black: ['Control e4 with …Nf6, and choose …e6 (Classical, Stonewall) or …g6 (Leningrad).', '…Qe8–h5 brings the queen to the kingside attack.'],
      know: 'After …f5 the e8–h5 diagonal is weak. Watch out for early Qh5+ ideas and checks against your king.',
    },
    {
      id: 'london', group: 'd4w', title: 'London System', side: 'w', level: 'Beginner',
      families: ['London System'], contains: ['London System'],
      main: '1. d4 d5 2. Nf3 Nf6 3. Bf4',
      about: 'A system rather than a sharp opening: White plays d4, Bf4, e3, c3, Nf3, Nbd2 and Bd3 against almost anything. Easy to learn and solid, with plenty of play left.',
      white: ['Get the bishop out to f4 before playing e3, so it is not shut in.', 'Build the c3–d4–e3 pyramid and castle; then Ne5 with a kingside push, or e4.'],
      black: ['Challenge the f4-bishop with …Nh5 or …Bd6.', 'Strike with …c5 and hit b2 with …Qb6.'],
      know: '…c5 with …Qb6 attacking b2 is Black’s most annoying idea. A common answer is Qb3, offering a queen trade.',
    },
    {
      id: 'catalan', group: 'd4w', title: 'Catalan Opening', side: 'w', level: 'Advanced',
      families: ['Catalan Opening'],
      main: '1. d4 Nf6 2. c4 e6 3. g3 d5 4. Bg2',
      about: 'White combines the Queen’s Gambit with a fianchetto: the bishop on g2 presses down the long diagonal towards Black’s queenside.',
      white: ['Fianchetto and castle; if Black takes on c4, win the pawn back with Qa4+ or Qc2.', 'Long-term pressure on b7 and the queenside is the point of the opening.'],
      black: ['Take on c4 and hold it for a while (the Open Catalan), or keep the centre closed with …Be7 and …c6 (the Closed Catalan).', 'Free the c8-bishop with …b6 and …Bb7, or …dxc4 and …b5.'],
      know: 'The g2-bishop is White’s best piece. Trading it, or blocking the long diagonal with …c6 and …d5, takes the sting out of the opening.',
    },
    {
      id: 'english', group: 'flank', title: 'English Opening', side: 'w', level: 'Intermediate',
      families: ['English Opening'],
      main: '1. c4 e5 2. Nc3 Nf6 3. g3',
      about: '1.c4 controls d5 from the side. It is flexible: against …e5 it is a Sicilian with the colours reversed, and it can turn into a Queen’s Gambit.',
      white: ['Fianchetto the king’s bishop to press on d5 and the long diagonal.', 'Play on the queenside with Rb1 and b4–b5.'],
      black: ['Take the centre with …e5 (a reversed Sicilian) or …c5 (the Symmetrical English).', 'Or steer into a 1.d4 opening you know with …Nf6 and …e6.'],
      know: 'In the reversed Sicilian White is a whole move up, so Black’s “Sicilian” set-ups are safer when played more modestly.',
    },
    {
      id: 'reti', group: 'flank', title: 'Réti Opening', side: 'w', level: 'Intermediate',
      families: ['Réti Opening', 'Zukertort Opening'],
      main: '1. Nf3 d5 2. c4',
      about: 'White develops a knight and attacks the centre from the side with c4, usually with a kingside fianchetto. A hypermodern system.',
      white: ['Pressure d5 with c4, g3 and Bg2.', 'Decide later between d4 (a Queen’s Gambit) and a slower b3–Bb2 double fianchetto.'],
      black: ['Hold the centre with …c6 or …e6, or grab space with …d4.', 'Keep the c8-bishop active: …Bf5 or …Bg4 before …e6.'],
      know: 'Many Réti games turn into a Queen’s Gambit, an English or a Catalan. Learn the plans, not just the moves.',
    },
    {
      id: 'kia', group: 'flank', title: 'King’s Indian Attack', side: 'w', level: 'Beginner',
      families: ['King\'s Indian Attack'], contains: ['King\'s Indian Attack'],
      main: '1. e4 e6 2. d3 d5 3. Nd2 Nf6 4. Ngf3 c5 5. g3 Nc6 6. Bg2 Be7 7. O-O O-O 8. Re1',
      about: 'A system: White sets up Nf3, g3, Bg2, castling, d3, Nbd2 and e4 against almost anything, then attacks on the kingside, often after e5.',
      white: ['Same set-up every time, then e5 to cramp Black’s kingside.', 'Follow up with Nf1, h4 and a kingside attack.'],
      black: ['Take the centre and expand on the queenside with …b5–b4 while White attacks the king.', 'Set-ups with …e5 make White’s e5 push impossible.'],
      know: 'Against the French set-up, the King’s Indian Attack is a race: White’s kingside attack against Black’s queenside pawn storm.',
    },
    {
      id: 'bird', group: 'flank', title: 'Bird Opening', side: 'w', level: 'Intermediate',
      families: ['Bird Opening'],
      main: '1. f4 d5 2. Nf3 Nf6 3. e3 c5',
      about: '1.f4 controls e5 and prepares a kingside set-up: a Dutch Defence with the colours reversed and an extra move. Stockfish rates 1.f4 slightly loosening (an inaccuracy), because it weakens the e1–h4 diagonal.',
      white: ['Play Nf3, e3, Be2 or b3–Bb2, and castle; Ne5 is a strong outpost.', 'Qe1–h4 can swing the queen over to the kingside.'],
      black: ['Hit back in the centre with …d5 and …c5, or gambit with From’s Gambit, 1…e5.', 'Use the weakened e1–h4 diagonal against White’s king.'],
      know: 'From’s Gambit is full of traps: after 1.f4 e5 2.fxe5 d6 3.exd6 Bxd6 Black threatens …Qh4+. For example, 4.Nc3? Qh4+ 5.g3 Bxg3+ 6.hxg3 Qxg3 is mate. 4.Nf3 stops it by guarding h4.',
    },
  ];

  // ---------------------------------------------------------------- the study plan

  // A starter repertoire for players rated roughly 800–1200, with the traps that
  // come up most at that level. Every line and every claim in a lesson is checked
  // by tools/audit-theory.js (Stockfish 19) and tests/test-theory.js.
  // kind: 'danger' = a trap to avoid, 'chance' = a trap to set.
  const PLAN = [
    {
      id: 'white', title: 'As White', side: 'w', options: [
        {
          id: 'italian', title: 'Italian Game', chapter: 'italian',
          why: 'Quick development and plans that repeat in almost every game: bishop to c4, castle, then c3 with d3 or d4.',
          lines: [
            ['1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3', 'Main line: the Giuoco Pianissimo'],
            ['1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3', 'Against 3…Nf6: the calm 4.d3'],
            ['1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4', 'If Black plays the Petrov (2…Nf6)'],
            ['1. e4 e5 2. Nf3 d6 3. d4', 'If Black plays the Philidor (2…d6)'],
            ['1. e4 c5 2. Nf3', 'If Black plays the Sicilian: develop, then d4'],
            ['1. e4 e6 2. d4 d5 3. e5', 'If Black plays the French: take space with e5'],
            ['1. e4 c6 2. d4 d5 3. e5', 'If Black plays the Caro-Kann: take space with e5'],
            ['1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5', 'If Black plays the Scandinavian: hit the queen'],
          ],
          traps: [
            { name: 'Blackburne Shilling trap', kind: 'danger', drill: false, pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nd4 4. Nxe5 Qg5 5. Nxf7 Qxg2 6. Rf1 Qxe4+ 7. Be2 Nf3#',
              lesson: 'After 3…Nd4, do not take on e5. 4.Nxe5? Qg5! hits the knight and g2, and the greedy 5.Nxf7?? loses to 5…Qxg2 and mate. Play 4.Nxd4 instead: Stockfish rates White clearly better.' },
            { name: 'Légal’s mate', kind: 'chance', pgn: '1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#',
              lesson: 'If Black pins your knight with …Bg4 and then plays a slow move like 4…g6?, the knight is not really pinned: 5.Nxe5! If Black takes your queen, 6.Bxf7+ and 7.Nd5 is mate. After 5…dxe5 6.Qxg4 you are a pawn up.' },
            { name: 'Fried Liver Attack', kind: 'chance', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7',
              lesson: 'An attacking option against 3…Nf6: 4.Ng5 hits f7. If Black recaptures 5…Nxd5?! (an inaccuracy; 5…Na5 is better), 6.Nxf7! forks the queen and rook and drags the king out.' },
          ],
        },
        {
          id: 'london', title: 'London System', chapter: 'london',
          why: 'The same set-up against almost anything: d4, Bf4, e3, Nf3, c3, Bd3 and Nbd2. Less to remember.',
          lines: [
            ['1. d4 d5 2. Nf3 Nf6 3. Bf4', 'Main set-up'],
            ['1. d4 d5 2. Nf3 Nf6 3. Bf4 c5 4. e3', 'Against …c5'],
            ['1. d4 Nf6 2. Nf3 e6 3. Bf4', 'Against 1…Nf6'],
          ],
          traps: [
            { name: 'The …Qb6 attack on b2', kind: 'danger', pgn: '1. d4 d5 2. Bf4 c5 3. e3 Nc6 4. c3 Qb6 5. Qb3',
              lesson: 'Black’s most annoying idea is …c5 and …Qb6, hitting b2. Do not leave the pawn hanging: 5.Qb3 offers a queen trade, and Stockfish rates it as good as anything.' },
          ],
        },
      ],
    },
    {
      id: 'e4', title: 'Against 1.e4', side: 'b', options: [
        {
          id: 'e5', title: '1…e5', chapter: 'italian',
          why: 'The classical answer: it fights for the centre at once and teaches you open, active chess.',
          lines: [
            ['1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6', 'Against the Italian'],
            ['1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7', 'Against the Ruy Lopez'],
            ['1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5', 'Against the Scotch'],
            ['1. e4 e5 2. Bc4 Nf6', 'Against the Bishop’s Opening'],
            ['1. e4 e5 2. Nc3 Nf6', 'Against the Vienna'],
            ['1. e4 e5 2. f4 exf4 3. Nf3 d6', 'Against the King’s Gambit: take the pawn'],
          ],
          traps: [
            { name: 'Scholar’s mate: how to stop it', kind: 'danger', pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 g6 4. Qf3 Nf6',
              lesson: 'When White brings the queen out early and aims at f7, defend e5 with 2…Nc6, chase the queen with 3…g6, and block with 4…Nf6. Never 3…Nf6??: 4.Qxf7 is mate.' },
            { name: 'Fried Liver: how to avoid it', kind: 'danger', pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5',
              lesson: 'If White plays 4.Ng5, answer 4…d5, and after 5.exd5 play 5…Na5, hitting the bishop. The natural 5…Nxd5?! allows 6.Nxf7!, the Fried Liver Attack.' },
          ],
        },
        {
          id: 'carokann', title: 'Caro-Kann', chapter: 'carokann',
          why: 'Solid and safe: few early traps, a healthy pawn structure, and the bishop gets out before …e6.',
          lines: [
            ['1. e4 c6 2. d4 d5 3. Nd2 dxe4 4. Nxe4 Bf5', 'Main line: the Classical'],
            ['1. e4 c6 2. d4 d5 3. e5 Bf5 4. Nf3', 'Against the Advance (3.e5)'],
            ['1. e4 c6 2. d4 d5 3. exd5 cxd5', 'Against the Exchange (3.exd5)'],
          ],
          traps: [
            { name: 'The smothered-mate trap', kind: 'danger', drill: false, pgn: '1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Nd7 5. Qe2 Ngf6 6. Nd6#',
              lesson: 'After 4…Nd7 5.Qe2, the natural 5…Ngf6?? walks into 6.Nd6, checkmate: the e7-pawn is pinned by the queen. Play 4…Bf5 to avoid the whole idea.' },
          ],
        },
      ],
    },
    {
      id: 'd4', title: 'Against 1.d4', side: 'b', options: [
        {
          id: 'qgd', title: 'Queen’s Gambit Declined', chapter: 'qgd',
          why: 'Rock solid: keep a pawn on d5, develop, castle, and free your game later with …c5 or …dxc4.',
          lines: [
            ['1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7', 'Main line'],
            ['1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. cxd5 exd5', 'Against the Exchange (4.cxd5)'],
            ['1. d4 d5 2. Nf3 Nf6 3. Bf4 c5 4. e3', 'Against the London: hit back with …c5'],
            ['1. d4 d5 2. e3 Nf6 3. Bd3', 'Against quiet systems (e3 and Bd3)'],
          ],
          traps: [
            { name: 'The Elephant Trap', kind: 'chance', pgn: '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Nbd7 5. cxd5 exd5 6. Nxd5 Nxd5 7. Bxd8 Bb4+ 8. Qd2 Bxd2+ 9. Kxd2 Kxd8',
              lesson: 'After 4…Nbd7 the d5 pawn looks loose, but 6.Nxd5?? loses a piece: 6…Nxd5! 7.Bxd8 Bb4+ and Black takes the queen back with interest.' },
          ],
        },
        {
          id: 'slav', title: 'Slav', chapter: 'slav',
          why: 'Support d5 with …c6 and keep the light-squared bishop free for …Bf5.',
          lines: [
            ['1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5', 'Main line: the Czech Variation'],
            ['1. d4 d5 2. Nf3 Nf6 3. Bf4 c5 4. e3', 'Against the London: hit back with …c5'],
          ],
          traps: [],
        },
      ],
    },
  ];

  // ---------------------------------------------------------------- explaining a theory move

  function explainer(Core, coach) {
    const { Position } = Core;
    const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
    const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
    const chAt = (pos, sq) => pos.pieceAt(sq & 7, sq >> 4);
    const colorOf = (ch) => (ch === ch.toUpperCase() ? 0 : 1);
    const lower = (ch) => ch.toLowerCase();
    const sqn = Core.sqName, parseSq = Core.parseSq;
    const CENTRE = ['d4', 'e4', 'd5', 'e5'].map(parseSq);
    const FIANCHETTO = { 0: { b2: 'c1', g2: 'f1' }, 1: { b7: 'c8', g7: 'f8' } };
    const FIANCHETTO_PREP = { 0: { b3: ['c1', 'b2'], g3: ['f1', 'g2'] }, 1: { b6: ['c8', 'b7'], g6: ['f8', 'g7'] } };

    const enemiesAttacked = (pos, sq) => {
      const side = colorOf(chAt(pos, sq));
      return pos.attacksFrom(sq).filter((t) => { const v = chAt(pos, t); return v && colorOf(v) !== side; });
    };

    // An enemy piece pinned by the bishop, rook or queen on `sq`.
    function pinBy(pos, sq) {
      const ch = chAt(pos, sq), t = lower(ch), side = colorOf(ch);
      const dirs = [];
      if (t === 'b' || t === 'q') dirs.push(15, 17, -15, -17);
      if (t === 'r' || t === 'q') dirs.push(1, -1, 16, -16);
      for (const d of dirs) {
        let s = sq + d, first = -1;
        while (!(s & 0x88)) {
          const v = chAt(pos, s);
          if (v) {
            if (colorOf(v) === side) break;
            if (first < 0) { first = s; s += d; continue; }
            const a = lower(chAt(pos, first)), b = lower(v);
            if (a !== 'k' && a !== 'p' && (b === 'k' || (b === 'q' && a !== 'q'))) return { pinned: first, behind: s };
            break;
          }
          s += d;
        }
      }
      return null;
    }

    // An enemy piece attacked from `sq` that guards something we already attack.
    function pressureOnDefender(pos, sq) {
      const side = colorOf(chAt(pos, sq));
      for (const t of enemiesAttacked(pos, sq)) {
        const v = lower(chAt(pos, t));
        if (v === 'k' || v === 'p') continue;
        for (const g of pos.attacksFrom(t)) {
          const w = chAt(pos, g);
          if (!w || colorOf(w) === side || lower(w) === 'k') continue;
          if (!pos.attackersOf(g, side).some((a) => a !== sq)) continue;
          const only = pos.attackersOf(g, side ^ 1).length === 1;
          return { defender: t, guarded: g, only };
        }
      }
      return null;
    }

    const unit = (pos, sq) => `the ${NAME[lower(chAt(pos, sq))]} on ${sqn(sq)}`;

    function joinParts(main, extras) {
      let uniq = extras.filter((e, i) => e && extras.indexOf(e) === i && !main.includes(e)).slice(0, 2);
      if (!uniq.length) return main;
      // Clauses with their own comma ("…, which only the king defends") read badly in a list.
      if (uniq.some((e) => e.includes(','))) uniq = uniq.slice(0, 1);
      if (main.includes(',')) return `${main}; it also ${uniq[0]}`;
      if (uniq.length === 1 || uniq[0].includes(',')) return `${main} and ${uniq[0]}`;
      if (uniq.length === 1) return `${main} and ${uniq[0]}`;
      return `${main}, ${uniq[0]} and ${uniq[1]}`;
    }

    // Material change for `side` along a line (pawn units), finishing any capture sequence.
    function swingOf(fen, line, side) {
      const pos = new Position(fen);
      const start = pos.material();
      let plies = 0;
      for (const uci of line) {
        const m = pos.moveFromUci(uci);
        if (!m) break;
        if (plies >= 6 && (!(m & Core.FLAG_CAPTURE) || plies >= 8)) break;
        pos.make(m);
        plies++;
      }
      const d = pos.material() - start;
      return side === 0 ? d : -d;
    }

    // An enemy pawn that could step onto `sq` next move.
    function pawnCanReach(pos, sq, by) {
      const back = by === 1 ? 16 : -16, ch = by === 1 ? 'p' : 'P', start = by === 1 ? 6 : 1;
      const one = sq + back, two = sq + 2 * back;
      if (!(one & 0x88) && chAt(pos, one) === ch) return true;
      return !(two & 0x88) && (two >> 4) === start && chAt(pos, two) === ch && !chAt(pos, one);
    }

    // A phrase saying what a move does, for example "develops the bishop and puts
    // pressure on the knight on c6, the only defender of the pawn on e5".
    // opts.cont: moves expected to follow (book or engine line), used to judge exchanges.
    // opts.prev: { fen, uci } of the move before, to spot recaptures and accepted gambits.
    function explainMove(fen, uci, opts) {
      opts = opts || {};
      const pos = new Position(fen);
      const side = pos.side, opp = side ^ 1;
      const m = pos.moveFromUci(uci);
      if (!m) return '';
      const from = Core.moveFrom(m), to = Core.moveTo(m);
      const ch = chAt(pos, from), t = lower(ch);
      const home = side === 0 ? 0 : 7;
      const capture = !!(m & Core.FLAG_CAPTURE);
      const cont = opts.cont && opts.cont[0] === uci ? opts.cont : [uci].concat(opts.cont || []);
      let prevTo = -1, offeredSq = -1;
      if (opts.prev) {
        const pp = new Position(opts.prev.fen);
        const pm = pp.moveFromUci(opts.prev.uci);
        if (pm) {
          const pch = chAt(pp, Core.moveFrom(pm));
          if (pm & Core.FLAG_CAPTURE) prevTo = Core.moveTo(pm);
          else if (pch && lower(pch) === 'p') {
            pp.make(pm);
            if (coach.hangingPieces(pp, opp).some((h) => h.sq === Core.moveTo(pm) && !h.defended)) offeredSq = Core.moveTo(pm);
          }
        }
      }
      const ownHangBefore = coach.hangingPieces(pos, side);
      const oppHangBefore = coach.hangingPieces(pos, opp);
      const victim = m & Core.FLAG_EP ? 'p' : (chAt(pos, to) ? lower(chAt(pos, to)) : '');
      const balance = (side === 0 ? 1 : -1) * pos.material();
      const lineReach = {};
      for (let s = 0; s < 128; s++) {
        if (s & 0x88) continue;
        const c = chAt(pos, s);
        if (c && colorOf(c) === side && 'bq'.includes(lower(c))) lineReach[s] = pos.attacksFrom(s).length;
      }

      pos.make(m);
      const check = pos.inCheck();
      if (check && pos.legalMoves().length === 0) return 'delivers checkmate';
      const wc = check ? ' with check' : '';
      const at = sqn(to);

      if (m & Core.FLAG_CASTLE) return `castles ${to > from ? 'kingside' : 'queenside'}, tucking the king away and bringing the rook towards the centre`;
      if (Core.movePromo(m)) return coach.describeMove(fen, uci, cont, null);
      if (capture) {
        if (prevTo === to) return `recaptures on ${at}${wc}`;
        const reply = cont[1] ? pos.moveFromUci(cont[1]) : 0;
        const recapture = reply && (reply & Core.FLAG_CAPTURE) && Core.moveTo(reply) === to;
        if (recapture) {
          const sw2 = swingOf(fen, cont.slice(0, 2), side);
          const swAll = swingOf(fen, cont, side);
          if (sw2 >= 1) return `wins material on ${at}${wc}, even after the recapture`;
          if (sw2 <= -1 && swAll >= 1) return `takes the ${NAME[victim]} on ${at}${wc}; if ${SIDE[opp]} takes back, ${SIDE[side]} comes out ahead`;
          if (sw2 <= -1 && swAll > -1) return `gives up the ${NAME[t]} for the ${NAME[victim]} on ${at}${wc}, and wins the material back later in the line`;
          if (sw2 <= -1) return `gives up the ${NAME[t]} for the ${NAME[victim]} on ${at}${wc}`;
          if (t === victim) return `exchanges ${NAME[t]}s on ${at}${wc}`;
          if (VAL[t] === VAL[victim]) return `gives up the ${NAME[t]} for the ${NAME[victim]} on ${at}${wc}`;
          return `trades on ${at}${wc}`;
        }
        if (offeredSq === to && victim === 'p') return `accepts the offer and takes the pawn on ${at}${wc}`;
        if (cont.length < 2) return balance < 0 ? `wins the material back, taking the ${NAME[victim]} on ${at}${wc}` : `takes the ${NAME[victim]} on ${at}${wc}`;
        const sw = swingOf(fen, cont, side);
        if (balance < 0 && sw >= 0) return `wins the material back, taking the ${NAME[victim]} on ${at}${wc}`;
        if (sw <= -2) return `gives up the ${NAME[t]} for the ${NAME[victim]} on ${at}${wc}`;
        if (sw >= 1) return `wins the ${NAME[victim]} on ${at}${wc}`;
        return `takes the ${NAME[victim]} on ${at}${wc}; ${SIDE[opp]} wins the material back later in the line`;
      }

      const ownHangAfter = coach.hangingPieces(pos, side);
      const oppHangAfter = coach.hangingPieces(pos, opp);

      // Facts shared by every piece type.
      const pin = 'bqr'.includes(t) ? pinBy(pos, to) : null;
      const pinText = pin ? `pins ${unit(pos, pin.pinned)} to the ${NAME[lower(chAt(pos, pin.behind))]}` : '';
      const pressure = t !== 'p' ? pressureOnDefender(pos, to) : null;
      const pressureText = pressure && (!pin || pin.pinned !== pressure.defender)
        ? `puts pressure on ${unit(pos, pressure.defender)}, ${pressure.only ? 'the only defender of' : 'which guards'} ${unit(pos, pressure.guarded)}` : '';
      const attacked = enemiesAttacked(pos, to).filter((s) => {
        const v = lower(chAt(pos, s));
        if (v === 'k' || (pin && s === pin.pinned) || (pressure && s === pressure.defender)) return false;
        return VAL[v] > VAL[t] || (oppHangAfter.some((h) => h.sq === s) && !oppHangBefore.some((h) => h.sq === s));
      });
      const attackText = attacked.length ? `attacks ${unit(pos, attacked[0])}` : '';
      const piled = t === 'p' ? undefined : enemiesAttacked(pos, to).find((s) => {
        if (lower(chAt(pos, s)) === 'k') return false;
        const a = pos.attackersOf(s, side).length, d = pos.attackersOf(s, opp).length;
        return a >= 2 && a > d && a - 1 <= d;
      });
      let pileText = '';
      if (piled !== undefined) {
        const a = pos.attackersOf(piled, side).length, defs = pos.attackersOf(piled, opp);
        const onlyKing = defs.length === 1 && lower(chAt(pos, defs[0])) === 'k';
        pileText = `adds a ${a === 2 ? 'second' : a === 3 ? 'third' : 'further'} attacker to ${unit(pos, piled)}${onlyKing ? ', which only the king defends' : defs.length ? `, which has ${defs.length} defender${defs.length === 1 ? '' : 's'}` : ''}`;
      }
      const weak = side === 0 ? parseSq('f7') : parseSq('f2');
      const aimText = 'bq'.includes(t) && pos.fullmove <= 12 && piled !== weak && pos.attacksFrom(to).includes(weak) && chAt(pos, weak) === (side === 0 ? 'p' : 'P') &&
        pos.attackersOf(weak, opp).length === 1 && lower(chAt(pos, pos.attackersOf(weak, opp)[0])) === 'k'
        ? `aims at the pawn on ${sqn(weak)}, which only the king defends` : '';
      const saved = ownHangBefore.find((h) => h.sq !== from && !ownHangAfter.some((x) => x.sq === h.sq));
      let protectText = saved ? `protects ${unit(pos, saved.sq)}` : '';

      if (t === 'p') {
        const file = at[0];
        const reach = pos.attacksFrom(to);
        const offered = ownHangAfter.some((h) => h.sq === to && !h.defended);
        const challenge = reach.find((s) => CENTRE.includes(s) && chAt(pos, s) && lower(chAt(pos, s)) === 'p' && colorOf(chAt(pos, s)) === opp);
        const challengeText = challenge !== undefined ? `challenges the pawn on ${sqn(challenge)}` : '';
        // A centre pawn of ours that this pawn now defends (attacked ones first).
        const mine = CENTRE.filter((s) => s !== to && chAt(pos, s) === ch && reach.includes(s));
        const supported = mine.find((s) => pos.attackersOf(s, opp).length) ?? mine[0];
        if (supported !== undefined && saved && saved.sq === supported) protectText = '';
        const dHome = side === 0 ? 'd2' : 'd7', dTarget = side === 0 ? 'd4' : 'd5';
        const prepares = ((side === 0 && ['c3', 'e3'].includes(at)) || (side === 1 && ['c6', 'e6'].includes(at))) &&
          chAt(pos, parseSq(dHome)) === ch && !chAt(pos, parseSq(dTarget));
        const prep = FIANCHETTO_PREP[side][at];
        const fianchettoPrep = prep && chAt(pos, parseSq(prep[0])) === (side === 0 ? 'B' : 'b');
        const offSquares = reach.filter((s) => !chAt(pos, s) && pos.attackersOf(s, opp).some((a) => 'nb'.includes(lower(chAt(pos, a)))));
        const keepOff = offSquares.length ? `keeps ${SIDE[opp]}’s pieces off ${offSquares.slice(0, 2).map(sqn).join(' and ')}` : '';
        const blocked = 'abgh'.includes(file) ? reach.find((s) => !chAt(pos, s) && pawnCanReach(pos, s, opp)) : undefined;
        const discourage = blocked !== undefined ? `discourages ${opp === 1 ? '…' : ''}${sqn(blocked)}` : '';
        const controls = reach.filter((s) => CENTRE.includes(s) && !(chAt(pos, s) && colorOf(chAt(pos, s)) === side));
        const opened = [];
        if ((from >> 4) === (side === 0 ? 1 : 6)) {
          for (const s of Object.keys(lineReach)) {
            const sq = +s;
            if (pos.attacksFrom(sq).length >= lineReach[sq] + 2) opened.push(lower(chAt(pos, sq)) === 'q' ? 'the queen' : `the bishop on ${sqn(sq)}`);
          }
          opened.sort((a, b) => (a === 'the queen') - (b === 'the queen'));
        }
        const openText = opened.length ? `opens ${opened.length > 1 ? 'lines' : 'a line'} for ${opened.slice(0, 2).join(' and ')}` : '';
        const supportText = supported !== undefined ? `supports the pawn on ${sqn(supported)}` : '';

        let main;
        if (offered) main = `offers the pawn on ${at}`;
        else if (attackText && VAL[lower(chAt(pos, attacked[0]))] > 1) main = attackText;
        else if (CENTRE.includes(to) && CENTRE.includes(from)) main = 'gains space in the centre';
        else if (CENTRE.includes(to)) main = 'stakes a claim in the centre';
        else if (challengeText && 'cf'.includes(file)) main = `${challengeText} from the side`;
        else if (challengeText) main = challengeText;
        else if (supported !== undefined && pos.attackersOf(supported, opp).length) main = supportText;
        else if (protectText) main = protectText;
        else if (prepares) main = `prepares ${side === 1 ? '…' : ''}${dTarget}`;
        else if (supportText) main = supportText;
        else if (fianchettoPrep) main = `prepares to fianchetto the bishop on ${prep[1]}`;
        else if ('cf'.includes(file) && controls.length) main = `controls the ${sqn(controls[0])} square from the side`;
        else if (discourage) main = discourage;
        else if (keepOff) main = keepOff;
        else if (controls.length) main = `controls the ${sqn(controls[0])} square`;
        else if (openText) main = openText;
        else main = `gains space on the ${'abc'.includes(file) ? 'queenside' : 'fgh'.includes(file) ? 'kingside' : 'centre'}`;
        main += wc;
        const sameTarget = challenge !== undefined && attacked[0] === challenge;
        const extras = [challengeText, sameTarget ? '' : attackText, protectText, supportText, openText].filter((e) => e && !main.startsWith(e));
        if (!extras.length && keepOff && !main.startsWith('keeps')) extras.push(keepOff);
        return joinParts(main, extras);
      }

      const developing = (t === 'n' || t === 'b') && (from >> 4) === home && pos.fullmove <= 15;
      const fianchetto = t === 'b' && FIANCHETTO[side][at] === sqn(from);
      let main;
      if (pin && t === 'b' && !developing) main = pinText;
      else if (fianchetto) main = 'fianchettoes the bishop, aiming it down the long diagonal';
      else if (developing) main = `develops the ${NAME[t]}`;
      else if (ownHangBefore.some((h) => h.sq === from)) main = `moves the ${NAME[t]} out of danger`;
      else if (t === 'q') main = pos.fullmove <= 10 ? 'brings the queen out' : `moves the queen to ${at}`;
      else if (t === 'r') {
        const f = to & 7;
        let open = true;
        for (let r = 0; r < 8; r++) { const c = pos.pieceAt(f, r); if (c && lower(c) === 'p') open = false; }
        main = open ? `puts the rook on the open ${'abcdefgh'[f]}-file` : `brings the rook to the ${'abcdefgh'[f]}-file`;
      } else if (t === 'k') main = 'moves the king';
      else if (pileText) main = pileText;
      else main = `moves the ${NAME[t]} to ${at}`;
      main += wc;
      return joinParts(main, [pinText, pileText, pressureText, aimText, attackText, protectText]);
    }

    return { explainMove };
  }

  // ---------------------------------------------------------------- the library of lines

  // Splits "Sicilian Defense: Najdorf Variation, English Attack" into its parts.
  function nameParts(name) {
    const colon = name.indexOf(':');
    const head = colon < 0 ? name : name.slice(0, colon);
    const family = head.split(',')[0].trim();
    const rest = colon < 0 ? '' : name.slice(colon + 1).trim();
    return { family, head, rest };
  }

  function sanToUci(Core, pgn) {
    const pos = new Core.Position();
    const out = [];
    for (const san of pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/)) {
      const m = pos.moveFromSan(san);
      if (!m) return null;
      out.push(pos.moveToUci(m));
      pos.make(m);
    }
    return out.join(' ');
  }

  // data: { lines: [[eco, name, "e2e4 e7e5 …"]] }
  function buildLibrary(Core, data) {
    const lines = data.lines.map((l, idx) => {
      const p = nameParts(l[1]);
      return { idx, eco: l[0], name: l[1], uci: l[2], moves: l[2].split(' '), family: p.family, head: p.head, rest: p.rest };
    });

    // Position tree: key -> { n: lines through it, next: Map(uci -> key), shortest: line idx }.
    const start = new Core.Position();
    const startKey = start.key();
    const tree = new Map([[startKey, { n: lines.length, next: new Map(), shortest: -1 }]]);
    const named = new Map(); // key -> line idx of the shortest line ending there
    for (const line of lines) {
      const pos = new Core.Position();
      let key = startKey;
      for (const uci of line.moves) {
        const node = tree.get(key);
        const m = pos.moveFromUci(uci);
        pos.make(m);
        const k = pos.key();
        node.next.set(uci, k);
        let child = tree.get(k);
        if (!child) { child = { n: 0, next: new Map(), shortest: line.idx }; tree.set(k, child); }
        child.n++;
        if (lines[child.shortest].moves.length > line.moves.length) child.shortest = line.idx;
        key = k;
      }
      const prev = named.get(key);
      if (prev === undefined || lines[prev].moves.length > line.moves.length) named.set(key, line.idx);
    }

    // Chapters: the course first, then every remaining family.
    const chapters = [];
    const home = new Array(lines.length).fill(null);
    const byUci = new Map(lines.map((l) => [l.uci, l.idx]));
    for (const c of CHAPTERS) {
      const ch = Object.assign({ curated: true }, c, { lines: [] });
      const fams = new Set(c.families || []);
      for (const l of lines) {
        if (home[l.idx]) continue;
        if (fams.has(l.family) || (c.contains && c.contains.some((s) => l.name.includes(s)))) { home[l.idx] = ch; ch.lines.push(l.idx); }
      }
      const mainUci = sanToUci(Core, c.main);
      ch.mainIdx = mainUci && byUci.has(mainUci) ? byUci.get(mainUci) : (ch.lines[0] !== undefined ? ch.lines[0] : -1);
      chapters.push(ch);
    }
    const autos = new Map();
    for (const l of lines) {
      if (home[l.idx]) continue;
      let ch = autos.get(l.family);
      if (!ch) {
        ch = { id: 'fam:' + l.family, group: 'more', title: l.family, families: [l.family], lines: [], curated: false };
        autos.set(l.family, ch);
      }
      home[l.idx] = ch;
      ch.lines.push(l.idx);
    }
    for (const ch of [...autos.values()].sort((a, b) => a.title.localeCompare(b.title))) {
      // Who usually chooses it: whoever made the last move of its shortest line.
      const shortest = ch.lines.reduce((a, b) => (lines[b].moves.length < lines[a].moves.length ? b : a));
      ch.side = lines[shortest].moves.length % 2 ? 'w' : 'b';
      ch.mainIdx = shortest;
      chapters.push(ch);
    }

    // Variation groups inside each chapter.
    for (const ch of chapters) {
      const primary = ch.families[0];
      const groups = new Map();
      for (const i of ch.lines) {
        const l = lines[i];
        const sub = l.rest.split(',')[0].trim();
        const prefix = l.family === primary && !ch.contains ? '' : l.head;
        const label = prefix && sub ? `${prefix}: ${sub}` : (prefix || sub || primary);
        const tail = l.rest.includes(',') ? l.rest.slice(l.rest.indexOf(',') + 1).trim() : '';
        l.group = label;
        l.tail = tail;
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(i);
      }
      const byLen = (a, b) => lines[a].moves.length - lines[b].moves.length || lines[a].name.localeCompare(lines[b].name);
      for (const list of groups.values()) list.sort(byLen);
      ch.groups = [...groups.entries()].sort((a, b) => byLen(a[1][0], b[1][0]));
    }

    const chapterById = new Map(chapters.map((c) => [c.id, c]));
    // The study plan: each entry points at a Lichess line, or at an extra line (traps).
    const extra = new Map(); // uci -> extra line
    const planLine = (pgn, note, chapterId, trap) => {
      const uci = sanToUci(Core, pgn);
      if (!uci) throw new Error('Plan line does not replay: ' + pgn);
      if (!trap && byUci.has(uci)) return { line: lines[byUci.get(uci)], note };
      const base = byUci.has(uci) ? lines[byUci.get(uci)] : null;
      const l = { idx: -1, extra: true, eco: base ? base.eco : '', name: trap ? trap.name : note, uci, moves: uci.split(' '), family: '', head: '', rest: '',
        group: 'Plan', tail: trap ? trap.name : note, chapterId, lesson: trap ? trap.lesson : '', kind: trap ? trap.kind : '' };
      extra.set(uci, l);
      return { line: l, note };
    };
    const plan = PLAN.map((slot) => Object.assign({}, slot, {
      options: slot.options.map((o) => Object.assign({}, o, {
        lines: o.lines.map(([pgn, note]) => planLine(pgn, note, o.chapter)),
        traps: o.traps.map((t) => Object.assign({}, t, planLine(t.pgn, t.name, o.chapter, t))),
      })),
    }));
    return { lines, tree, named, startKey, chapters, chapterById, home, plan, extra };
  }

  // Spaced repetition. result: 'clean' (no mistakes, no help), 'helped' or 'missed'.
  function schedule(card, result, now) {
    const c = Object.assign({ box: 0, reps: 0, lapses: 0, due: 0, last: 0 }, card || {});
    c.reps++;
    c.last = now;
    if (result === 'clean') { c.box = Math.min(INTERVALS.length - 1, c.box + 1); c.due = now + INTERVALS[c.box] * DAY; }
    else if (result === 'helped') { c.box = Math.max(1, c.box); c.due = now + DAY; }
    else { c.lapses++; c.box = 1; c.due = now + 10 * 60 * 1000; }
    return c;
  }

  // ---------------------------------------------------------------- the mode

  function create(api) {
    const { Core, coach, analyzer } = api;
    const el = api.panel;
    const { explainMove } = explainer(Core, coach);
    const st = loadState();
    let lib = null;
    let loading = null;
    let token = 0;
    let chapter = null; // chapter object
    let line = null; // line object
    let learnPly = 0;
    let drill = null; // Practise state
    let game = null; // Coach state
    let cardOpen = false;
    let historyOpen = false;
    const slotOpen = new Set(); // Plan slots whose "All lines" list is unfolded
    let whyOpen = false;
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    let results = [];
    let active = false;
    const notes = new Map(); // Learn: move-prefix -> engine verdict

    function loadState() {
      const base = {
        chapter: 'italian', line: '', view: 'plan', sides: {}, cards: {}, coach: { elo: 1200, start: 'start', hints: true },
        plan: { rating: 850, goal: 1000, picks: { white: 'italian', e4: 'e5', d4: 'qgd' } }, daily: null, planSeen: false,
      };
      try {
        const s = JSON.parse(localStorage.getItem(STORE) || '{}');
        const out = Object.assign(base, s, { coach: Object.assign(base.coach, s.coach || {}), plan: Object.assign(base.plan, s.plan || {}) });
        out.plan.picks = Object.assign({ white: 'italian', e4: 'e5', d4: 'qgd' }, out.plan.picks || {});
        if (!out.planSeen) { out.view = 'plan'; out.planSeen = true; } // the plan is new: show it once
        return out;
      } catch (e) { return base; }
    }
    function saveState() { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* storage unavailable */ } }

    function loadData() {
      if (window.MYCHESS_THEORY) return Promise.resolve(window.MYCHESS_THEORY);
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/theory-data.js';
        s.onload = () => resolve(window.MYCHESS_THEORY);
        s.onerror = () => reject(new Error('Could not load js/theory-data.js'));
        document.head.appendChild(s);
      });
    }

    // ------------------------------------------------------------ helpers

    const sideIdx = () => (mySide() === 'w' ? 0 : 1);
    const mySide = () => st.sides[chapter.id] || chapter.side;
    const cardKey = (l, side) => `${side || mySide()}:${l.uci}`;
    const now = () => Date.now();

    function fenAt(moves) {
      const pos = new Core.Position();
      for (const u of moves) pos.make(pos.moveFromUci(u));
      return pos.toFEN();
    }

    // Move text such as "3.Bb5" or "3…a6" for each move of a sequence.
    function sanList(moves) {
      const pos = new Core.Position();
      return moves.map((u) => {
        const m = pos.moveFromUci(u);
        const num = pos.side === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`;
        const san = pos.san(m);
        pos.make(m);
        return { num, san, text: num + san };
      });
    }
    const moveText = (fen, uci) => {
      const pos = new Core.Position(fen);
      const m = pos.moveFromUci(uci);
      return m ? (pos.side === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`) + pos.san(m) : uci;
    };

    const nodeFor = (fen) => lib.tree.get(new Core.Position(fen).key());

    // Theory moves from a position, most-studied first: [{ uci, n, name, key }].
    function bookMoves(fen) {
      const node = nodeFor(fen);
      if (!node) return [];
      return [...node.next.entries()].map(([uci, key]) => {
        const child = lib.tree.get(key);
        const named = lib.named.get(key);
        const l = lib.lines[named !== undefined ? named : child.shortest];
        return { uci, key, n: child.n, name: l.name, eco: l.eco, named: named !== undefined };
      }).sort((a, b) => b.n - a.n);
    }

    // The most common continuation from a position, for judging exchanges.
    function likelyContinuation(fen, plies) {
      const pos = new Core.Position(fen);
      const out = [];
      for (let i = 0; i < plies; i++) {
        const node = lib.tree.get(pos.key());
        if (!node || !node.next.size) break;
        let best = null, bestN = -1;
        for (const [uci, key] of node.next) { const n = lib.tree.get(key).n; if (n > bestN) { bestN = n; best = uci; } }
        out.push(best);
        pos.make(pos.moveFromUci(best));
      }
      return out;
    }

    // The coach's phrase for move i of a sequence.
    function phraseFor(moves, i, pv) {
      const fen = fenAt(moves.slice(0, i));
      const prev = i > 0 ? { fen: fenAt(moves.slice(0, i - 1)), uci: moves[i - 1] } : null;
      const tail = moves.slice(i + 1, i + 7);
      const note = notes.get(moves.slice(0, i + 1).join(' '));
      if (!pv && note && note.pv && note.pv.length) pv = note.pv;
      const cont = [moves[i]].concat(pv || tail.concat(likelyContinuation(fenAt(moves.slice(0, i + 1 + tail.length)), 6)).slice(0, 6));
      return explainMove(fen, moves[i], { cont, prev });
    }

    function nameAfter(moves) {
      const key = new Core.Position(fenAt(moves)).key();
      const idx = lib.named.get(key);
      return idx === undefined ? null : lib.lines[idx];
    }

    const lineLabel = (l) => {
      const last = sanList(l.moves).pop();
      const card = st.cards[cardKey(l)];
      const mark = card ? (card.box >= MASTERED_BOX ? '✓ ' : '• ') : '';
      return `${mark}${l.tail || 'Main line'} · ${last ? last.text : ''}`;
    };

    // ------------------------------------------------------------ choosing what to study

    function setChapter(id, lineIdx) {
      chapter = lib.chapterById.get(id) || lib.chapters[0];
      st.chapter = chapter.id;
      const idx = lineIdx !== undefined ? lineIdx : chapter.mainIdx;
      setLine(lib.lines[idx >= 0 ? idx : chapter.lines[0]]);
    }

    function setLine(l) {
      line = l;
      st.line = l.uci;
      saveState();
    }

    function findLine(prefix, preferChapter) {
      const want = prefix.join(' ');
      let best = null;
      for (const l of lib.lines) {
        if (l.uci !== want && !l.uci.startsWith(want + ' ')) continue;
        const inChapter = lib.home[l.idx] === preferChapter;
        if (!best || (inChapter && !best.inChapter) || (inChapter === best.inChapter && l.moves.length < best.l.moves.length)) best = { l, inChapter };
      }
      return best ? best.l : null;
    }

    function switchTo(l, ply) {
      const ch = lib.home[l.idx];
      if (ch !== chapter) { chapter = ch; st.chapter = ch.id; }
      setLine(l);
      if (st.view === 'learn') showLearn(ply === undefined ? 0 : ply);
      else if (st.view === 'practise') startDrill();
      else { game = null; render(); }
    }

    // ------------------------------------------------------------ Learn

    function showLearn(ply, animate) {
      token++;
      drill = null; game = null;
      const prev = learnPly;
      learnPly = Math.max(0, Math.min(line.moves.length, ply));
      const flipped = mySide() === 'b';
      if (animate && learnPly === prev + 1 && api.fens().length - 1 === prev) api.play(line.moves[prev]);
      else if (animate && learnPly === prev - 1 && api.fens().length - 1 === prev) api.undoLast();
      else api.loadLine(Core.START_FEN, line.moves.slice(0, learnPly), flipped);
      api.status(`${chapter.title}: learn`, '');
      learnArrows();
      render();
      analyseLearn(token);
    }

    function learnArrows() {
      const next = line.moves[learnPly];
      api.arrows(next ? [{ uci: next, kind: 'hint' }] : []);
    }

    async function analyseLearn(t) {
      const ply = learnPly;
      const moves = line.moves.slice(0, ply);
      const fenAfter = fenAt(moves);
      const after = await analyzer.analyse(fenAfter, LEARN_DEPTH);
      if (t !== token) return;
      if (after) api.showEval(after);
      if (!ply) return;
      const key = moves.join(' ');
      if (notes.has(key)) { render(); return; }
      const fenBefore = fenAt(moves.slice(0, -1));
      const before = await analyzer.analyse(fenBefore, LEARN_DEPTH);
      if (t !== token || !before || !after) return;
      const mover = new Core.Position(fenBefore).side;
      const r = coach.review({ fenBefore, fenAfter, uci: moves[ply - 1], before, after, book: false, who: SIDE[mover] });
      notes.set(key, { kind: r.kind, label: r.label, tone: r.tone, evalAfter: r.evalAfter, better: r.better, playedBest: before.best === moves[ply - 1], pv: after.pv || [] });
      render();
    }

    function renderLearn() {
      const sans = sanList(line.moves);
      let html = '<div class="th-moves">' + sans.map((s, i) =>
        `<button type="button" class="th-mv${i === learnPly - 1 ? ' current' : ''}${i >= learnPly ? ' ahead' : ''}" data-ply="${i + 1}">${escapeHtml(s.text)}</button>`).join('') + '</div>';
      if (line.lesson) {
        html += `<div class="th-block ${line.kind === 'danger' ? 'danger' : 'chance'}"><span class="th-label">${line.kind === 'danger' ? 'Trap to avoid' : 'Trap to set'}: ${escapeHtml(line.name)}</span>` +
          `<p class="th-why">${escapeHtml(line.lesson)}</p></div>`;
      }

      if (learnPly === 0) {
        html += `<div class="th-block theory"><span class="th-label">${escapeHtml(chapter.title)}</span>` +
          `<p class="th-why">${escapeHtml(chapter.about || coach.ideaFor(chapter.title, line.eco) || '')}</p>` +
          `<p class="th-small">${line.moves.length} moves to the ${escapeHtml(line.name)}. Press ▶ (or the → key), or play the blue arrow on the board.</p></div>`;
      } else {
        const i = learnPly - 1;
        const s = sans[i];
        const moves = line.moves.slice(0, learnPly);
        const note = notes.get(moves.join(' '));
        const mover = i % 2 === 0 ? 'White' : 'Black';
        const named = nameAfter(moves);
        const before = named ? nameAfter(moves.slice(0, -1)) : null;
        const idea = named && (!before || before.family !== named.family) ? coach.ideaFor(named.name, named.eco) : '';
        const dubious = note && ['inaccuracy', 'mistake', 'blunder'].includes(note.kind);
        html += '<div class="th-block theory">' +
          `<p class="th-big">${escapeHtml(s.text)} <span class="eval">${note ? escapeHtml(note.evalAfter) : '<span class="spinner"></span>'}</span></p>` +
          `<p class="th-why">${escapeHtml(cap(phraseFor(line.moves, i, null)))}.</p>` +
          (named ? `<p class="th-name"><span class="eco">${escapeHtml(named.eco)}</span> ${escapeHtml(named.name)}</p>` : '') +
          (idea ? `<p class="th-small">${escapeHtml(idea)}</p>` : '') +
          (note && note.playedBest ? '<p class="th-small th-ok">✓ Stockfish’s first choice too</p>' : '') +
          '</div>';
        if (dubious) {
          html += '<div class="th-block danger"><span class="th-label">Stockfish disagrees</span>' +
            `<p class="th-why">It rates this move ${note.kind === 'inaccuracy' ? 'an inaccuracy' : 'a ' + note.kind}${note.better ? ` and prefers <b>${escapeHtml(note.better.san)}</b>` : ''}.</p>` +
            '<p class="th-small">It is still theory because people play it, but know the risk.</p></div>';
        }
        const fenBefore = fenAt(line.moves.slice(0, i));
        const alts = bookMoves(fenBefore).filter((b) => b.uci !== line.moves[i]).slice(0, 4);
        if (alts.length) {
          html += `<div class="th-others"><span class="th-label">${mover} could also play</span><div class="th-chips">` +
            alts.map((a) => `<button type="button" class="th-chip th-branch" data-branch="${escapeHtml(line.moves.slice(0, i).concat(a.uci).join(' '))}"><b>${escapeHtml(moveText(fenBefore, a.uci))}</b> <span>${a.named ? '' : '→ '}${escapeHtml(shortName(a.name))}</span></button>`).join('') + '</div></div>';
        }
      }
      if (learnPly === line.moves.length) {
        const fen = fenAt(line.moves);
        const next = bookMoves(fen).slice(0, 4);
        html += '<div class="th-others"><span class="th-label">End of this line</span>' + (next.length
          ? '<div class="th-chips">' + next.map((a) => `<button type="button" class="th-chip th-branch" data-branch="${escapeHtml(line.moves.concat(a.uci).join(' '))}"><b>${escapeHtml(moveText(fen, a.uci))}</b> <span>${a.named ? '' : '→ '}${escapeHtml(shortName(a.name))}</span></button>`).join('') + '</div>'
          : '<p class="th-small">Theory stops here. Try it in Practice.</p>') + '</div>';
      }
      html += '<div class="th-nav">' +
        `<button type="button" class="btn" data-learn="first" aria-label="Start"${learnPly ? '' : ' disabled'}>⏮</button>` +
        `<button type="button" class="btn" data-learn="prev" aria-label="Previous move"${learnPly ? '' : ' disabled'}>◀</button>` +
        `<button type="button" class="btn" data-learn="next" aria-label="Next move"${learnPly < line.moves.length ? '' : ' disabled'}>▶</button>` +
        `<button type="button" class="btn" data-learn="last" aria-label="End"${learnPly < line.moves.length ? '' : ' disabled'}>⏭</button>` +
        '<button type="button" class="btn primary" data-go="practise">Practice</button></div>';
      return html;
    }

    // "Sicilian Defense: Najdorf Variation, English Attack" -> "Najdorf Variation, English Attack" inside the Sicilian chapter.
    function shortName(name) {
      const p = nameParts(name);
      return chapter && p.family === chapter.families[0] && p.rest ? p.rest : name;
    }

    // ------------------------------------------------------------ Practise

    function startDrill(l) {
      token++;
      if (l) setLine(l);
      game = null;
      const side = sideIdx();
      drill = { line, side, ply: 0, mistakes: 0, hints: 0, done: false, busy: true, wrong: null, feedback: [], marks: [], startedAt: now() };
      api.load(Core.START_FEN, side === 1);
      api.showEval(null);
      if (!line.moves.some((u, i) => i % 2 === side)) {
        drill.done = true; drill.busy = false;
        drill.feedback.push({ tone: 'warn', text: `This line has no ${SIDE[side]} moves for you to play. Switch sides or pick a longer line.` });
        render();
        return;
      }
      api.status(`${chapter.title}: practice`, `You play ${SIDE[side]}. Play the theory moves from memory.`, '');
      render();
      setTimeout(() => continueDrill(token), 450);
    }

    // Plays the opponent's book moves until it is your turn (or the line ends).
    function continueDrill(t) {
      if (t !== token || !drill) return;
      if (drill.ply >= drill.line.moves.length) { finishDrill(); return; }
      if (drill.ply % 2 !== drill.side) {
        drill.busy = true;
        render();
        setTimeout(() => {
          if (t !== token || !drill) return;
          api.play(drill.line.moves[drill.ply]);
          drill.ply++;
          continueDrill(t);
        }, 420);
        return;
      }
      drill.busy = false;
      api.status(`${chapter.title}: practice`, 'Your move.', '');
      render();
    }

    function onDrillMove(mv) {
      const t = token;
      const expected = drill.line.moves[drill.ply];
      const fens = api.fens();
      const fenBefore = fens[fens.length - 2], fenAfter = fens[fens.length - 1];
      if (mv.uci === expected) {
        const text = `${moveText(fenBefore, mv.uci)} ${phraseFor(drill.line.moves, drill.ply, null)}.`;
        drill.feedback.unshift({ tone: 'best', text: `✓ ${text}` });
        drill.marks.push(drill.wrong ? 'helped' : 'ok');
        drill.wrong = null;
        drill.ply++;
        api.arrows([]);
        continueDrill(t);
        return;
      }
      drill.busy = true;
      const key = new Core.Position(fenAfter).key();
      if (lib.tree.has(key)) {
        // Another theory move: fine, but this line goes elsewhere.
        const named = lib.named.get(key);
        const what = named !== undefined ? ` (it leads to the ${lib.lines[named].name})` : '';
        drill.feedback.unshift({ tone: 'good', text: `${moveText(fenBefore, mv.uci)} is also theory${what}, but this line continues differently. Try again.` });
        render();
        setTimeout(() => { if (t !== token || !drill) return; api.undoLast(); drill.busy = false; render(); }, 1300);
        return;
      }
      if (!drill.wrong) { drill.mistakes++; drill.wrong = { ply: drill.ply }; }
      const entry = { tone: 'error', text: `${moveText(fenBefore, mv.uci)} is not the theory move here.` };
      drill.feedback.unshift(entry);
      render();
      setTimeout(() => { if (t !== token || !drill) return; api.undoLast(); drill.busy = false; api.status(`${chapter.title}: practice`, 'Not the theory move. Try again, or ask for a hint.', 'warn'); render(); }, 900);
      // Ask Stockfish what was wrong with it, for the explanation.
      Promise.all([analyzer.analyse(fenBefore, LEARN_DEPTH), analyzer.analyse(fenAfter, LEARN_DEPTH)]).then(([before, after]) => {
        if (t !== token || !drill || !before || !after) return;
        const r = coach.review({ fenBefore, fenAfter, uci: mv.uci, before, after, book: false, who: 'you' });
        const verdict = ['best', 'excellent', 'good'].includes(r.kind)
          ? `Stockfish thinks it is playable (${r.label.toLowerCase()}, ${r.evalAfter}), but it is not the line you are learning.`
          : `Stockfish rates it ${r.kind === 'inaccuracy' ? 'an inaccuracy' : 'a ' + r.kind} (${r.evalAfter}): ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)}`;
        entry.text += ' ' + verdict;
        if (r.tip) entry.text += ' ' + r.tip;
        render();
      });
    }

    function drillHint() {
      if (!drill || drill.done || drill.busy) return;
      const uci = drill.line.moves[drill.ply];
      drill.hints++;
      if (!drill.wrong) drill.wrong = { ply: drill.ply, hinted: true };
      const level = drill.hintAt && drill.hintAt.ply === drill.ply ? drill.hintAt.level + 1 : 1;
      drill.hintAt = { ply: drill.ply, level };
      if (level === 1) {
        api.select(Core.parseSq(uci.slice(0, 2)));
        api.status(`${chapter.title}: practice`, 'Hint: move this piece.', 'good');
      } else {
        api.arrows([{ uci, kind: 'hint' }]);
        api.status(`${chapter.title}: practice`, 'Hint: play the arrow move.', 'good');
      }
      render();
    }

    function drillShow() {
      if (!drill || drill.done || drill.busy) return;
      const uci = drill.line.moves[drill.ply];
      if (!drill.wrong) drill.wrong = { ply: drill.ply, hinted: true };
      drill.hints++;
      const fen = api.fens()[api.fens().length - 1];
      api.arrows([{ uci, kind: 'best' }]);
      drill.feedback.unshift({ tone: 'good', text: `The theory move is ${moveText(fen, uci)}: it ${phraseFor(drill.line.moves, drill.ply, null)}. Play it on the board.` });
      api.status(`${chapter.title}: practice`, 'Play the arrow move.', 'good');
      render();
    }

    function finishDrill() {
      drill.done = true;
      drill.busy = false;
      const yours = drill.marks.length;
      const result = drill.mistakes ? 'missed' : drill.hints ? 'helped' : 'clean';
      const key = cardKey(drill.line, SIDE[drill.side] === 'White' ? 'w' : 'b');
      st.cards[key] = schedule(st.cards[key], result, now());
      today().lines++;
      saveState();
      const named = nameAfter(drill.line.moves);
      const c = st.cards[key];
      const when = result === 'missed' ? 'in a few minutes' : `in ${INTERVALS[c.box]} day${INTERVALS[c.box] === 1 ? '' : 's'}`;
      drill.summary = result === 'clean'
        ? `Line complete: all ${yours} of your moves right first time. It comes back for review ${when}.`
        : result === 'helped'
          ? `Line complete, with ${drill.hints === 1 ? 'a hint' : 'hints'}. It comes back ${when}.`
          : `Line complete with ${drill.mistakes} mistake${drill.mistakes === 1 ? '' : 's'}. It comes back for review ${when}.`;
      if (named) drill.summary += ` You reached the ${named.name}.`;
      api.status(`${chapter.title}: practice`, result === 'clean' ? 'Well done!' : 'Line complete.', result === 'clean' ? 'good' : '');
      render();
    }

    function dueCards() {
      const t = now();
      return Object.entries(st.cards).filter(([, c]) => c.due <= t).sort((a, b) => a[1].due - b[1].due);
    }

    function reviewNext() {
      const due = dueCards();
      if (!due.length) return;
      const [key] = due[0];
      const side = key.slice(0, 1), uci = key.slice(2);
      const l = lib.extra.get(uci) || lib.lines.find((x) => x.uci === uci);
      if (!l) { delete st.cards[key]; saveState(); render(); return; }
      openLine(l, side, 'practise');
    }

    function renderPractise() {
      let html = '';
      const due = dueCards().length;
      if (!drill) {
        html += '<div class="th-block theory"><span class="th-label">Practice</span><p class="th-why">Play your side of this line from memory. Lines you know come back less often; lines you miss come back soon.</p></div>';
      } else {
        const sans = sanList(drill.line.moves.slice(0, drill.ply));
        html += '<div class="th-moves">' + sans.map((s, i) => `<span class="th-mv done${i % 2 === drill.side ? ' mine' : ''}">${escapeHtml(s.text)}</span>`).join('') +
          (drill.done ? '' : '<span class="th-mv ahead">?</span>') + '</div>';
        const latest = drill.feedback[0];
        if (drill.summary) html += `<div class="th-block ${drill.mistakes ? 'remember' : 'best'}"><span class="th-label">${drill.mistakes ? 'Line complete' : 'Well done'}</span><p class="th-why">${escapeHtml(drill.summary)}</p></div>`;
        else if (!drill.done) {
          html += `<p class="th-why">${drill.busy ? '<span class="spinner"></span>Opponent to move…' : `<b>Your move as ${SIDE[drill.side]}.</b> What does theory play here?`}</p>`;
        }
        if (latest && !drill.summary) {
          const kind = latest.tone === 'error' ? 'danger' : latest.tone === 'best' ? 'best' : 'theory';
          const label = latest.tone === 'error' ? 'Not the theory move' : latest.tone === 'best' ? 'Right' : 'Also theory';
          html += `<div class="th-block ${kind}"><span class="th-label">${label}</span><p class="th-why">${escapeHtml(latest.text.replace(/^✓ /, ''))}</p></div>`;
        }
        html += '<div class="review-actions">';
        if (drill.done) {
          html += '<button type="button" class="btn primary" data-go="again">Again</button>';
          html += '<button type="button" class="btn" data-go="learn">Learn it</button>';
          html += '<button type="button" class="btn" data-go="random">Another line</button>';
        } else {
          html += `<button type="button" class="btn" data-go="hint"${drill.busy ? ' disabled' : ''}>Hint</button>`;
          html += `<button type="button" class="btn" data-go="show"${drill.busy ? ' disabled' : ''}>Show me</button>`;
          html += '<button type="button" class="btn" data-go="again">Restart</button>';
        }
        html += '</div>';
        if (drill.feedback.length > 1 || drill.summary) {
          html += `<details class="th-history"${historyOpen ? ' open' : ''}><summary>All moves</summary><ul class="eg-feed">` +
            drill.feedback.map((f) => `<li class="tone-${f.tone === 'error' ? 'error' : f.tone === 'best' ? 'best' : 'good'}">${escapeHtml(f.text)}</li>`).join('') + '</ul></details>';
        }
      }
      html += `<div class="review-actions">${drill ? '' : '<button type="button" class="btn primary" data-go="again">Start</button>'}` +
        `<button type="button" class="btn" data-go="review"${due ? '' : ' disabled'}>Review due lines${due ? ` (${due})` : ''}</button></div>`;
      return html;
    }

    // ------------------------------------------------------------ Plan

    let planIndex = []; // data-plan="k" -> { line, side }

    // Middlegame ideas (js/strategy-rules.js) that a move shows, for the coach.
    const strategy = window.MyChessStrategyRules ? window.MyChessStrategyRules.rules(Core) : null;
    function middlegameIdea(fen, uci) {
      if (!strategy) return null;
      const d = strategy.detect(fen, uci)[0];
      return d ? window.MyChessStrategyRules.LESSON_BY_ID.get(d.lesson).title : null;
    }

    // Today's counts: puzzles come from the puzzle trainer's own total.
    function today() {
      const d = new Date();
      const date = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const count = (key) => { try { return JSON.parse(localStorage.getItem(key) || '{}').played || 0; } catch (e) { return 0; } };
      const played = count('mychess.puzzles.v1'), strategy = count('mychess.strategy.v1');
      if (!st.daily || st.daily.date !== date) st.daily = { date, puzzlesAtStart: played, strategyAtStart: strategy, lines: 0, games: 0 };
      if (st.daily.strategyAtStart === undefined) st.daily.strategyAtStart = strategy;
      st.daily.puzzles = Math.max(0, played - st.daily.puzzlesAtStart);
      st.daily.strategy = Math.max(0, strategy - st.daily.strategyAtStart);
      return st.daily;
    }

    const planOption = (slot) => slot.options.find((o) => o.id === st.plan.picks[slot.id]) || slot.options[0];
    function lineStatus(l, side) {
      const c = st.cards[`${side}:${l.uci}`];
      return !c ? 'new' : c.box >= MASTERED_BOX ? 'mastered' : 'learning';
    }
    const movesShort = (moves) => sanList(moves).map((m, i) => (i % 2 === 0 ? m.text : m.san)).join(' ');

    function openLine(l, side, view) {
      chapter = l.extra ? (lib.chapterById.get(l.chapterId) || chapter) : lib.home[l.idx];
      st.chapter = chapter.id;
      st.sides[chapter.id] = side;
      st.view = view;
      setLine(l);
      if (view === 'learn') showLearn(0);
      else if (view === 'practise') startDrill();
      else restartView();
    }

    function renderPlan() {
      const d = today();
      const due = dueCards().length;
      const P = st.plan;
      let html = `<div class="th-block theory"><span class="th-label">Road to ${escapeHtml(P.goal)}</span>` +
        `<div class="th-rating"><label>Rating <input type="number" id="thRating" min="100" max="3000" step="10" value="${escapeHtml(P.rating)}"></label>` +
        `<span aria-hidden="true">→</span><label>Goal <input type="number" id="thGoal" min="100" max="3000" step="50" value="${escapeHtml(P.goal)}"></label></div>` +
        '<p class="th-why">Do Today’s four jobs every day.</p>' +
        `<details class="th-whyplan"${whyOpen ? ' open' : ''}><summary>Why this plan?</summary><p class="th-small">At this level most games are decided by undefended pieces and simple tactics, not by deep theory. So: know a small repertoire well for the first 8 to 10 moves, solve puzzles every day, learn the main middlegame ideas, and play coached games to put it all into practice.</p></details></div>`;
      const rows = [
        { done: d.puzzles >= 10, text: 'Solve 10 puzzles', prog: `${Math.min(d.puzzles, 10)} of 10`, go: 'puzzles', btn: 'Puzzles' },
        due
          ? { done: false, text: `Review ${due} line${due === 1 ? '' : 's'} due today`, prog: `${d.lines} done`, go: 'review', btn: 'Review' }
          : { done: d.lines >= 1, text: 'Practice one line from your plan', prog: `${d.lines} done`, go: 'nextnew', btn: 'Practice' },
        { done: d.strategy >= 3, text: 'Do 3 middlegame exercises', prog: `${Math.min(d.strategy, 3)} of 3`, go: 'strategy', btn: 'Middlegame' },
        { done: d.games >= 1, text: 'Play one coached game', prog: `${Math.min(d.games, 1)} of 1`, go: 'coachgame', btn: 'Coach' },
      ];
      html += '<div class="th-block best"><span class="th-label">Today</span><ul class="th-today">' + rows.map((r) =>
        `<li class="${r.done ? 'done' : ''}"><span class="tick" aria-hidden="true">${r.done ? '✓' : ''}</span><span class="what">${escapeHtml(r.text)}<span class="th-mini">${escapeHtml(r.prog)}</span></span>` +
        `<button type="button" class="btn small" data-plan-go="${r.go}">${r.btn}</button></li>`).join('') + '</ul></div>';
      html += '<div class="th-block danger"><span class="th-label">Before every move</span><ol class="th-steps">' +
        '<li>What does your opponent’s last move attack or threaten?</li>' +
        '<li>Are any of your pieces loose: attacked and not defended?</li>' +
        '<li>Look at every check, capture and threat: theirs first, then yours.</li></ol></div>';
      planIndex = [];
      let total = 0, mastered = 0;
      const buttons = (k, drillable) => `<span class="btns"><button type="button" class="btn small" data-plan="${k}" data-view="learn">Learn</button>` +
        (drillable ? `<button type="button" class="btn small" data-plan="${k}" data-view="practise">Practice</button>` : '') + '</span>';
      const statusName = (status) => (status === 'new' ? 'Not practised yet' : status === 'mastered' ? 'Mastered' : 'Learning');
      html += '<p class="th-section-label">Your repertoire</p>';
      for (const slot of lib.plan) {
        const o = planOption(slot);
        const items = o.lines.map((e) => ({ line: e.line, title: e.note, detail: movesShort(e.line.moves), cls: '', drill: true }))
          .concat(o.traps.map((t) => ({ line: t.line, title: `${t.kind === 'danger' ? 'Trap to avoid' : 'Trap to set'}: ${t.name}`, detail: t.lesson, cls: `trap ${t.kind}`, drill: t.drill !== false })));
        for (const it of items) {
          it.k = planIndex.push({ line: it.line, side: slot.side }) - 1;
          it.status = lineStatus(it.line, slot.side);
        }
        const started = items.filter((it) => it.status !== 'new').length;
        const done = items.filter((it) => it.status === 'mastered').length;
        total += items.length;
        mastered += done;
        // The line to work on next: the first one not started, else the first still being learned.
        const next = items.find((it) => it.drill && it.status === 'new') || items.find((it) => it.drill && it.status === 'learning');
        html += `<div class="th-slot"><div class="th-slot-head"><span class="th-label">${escapeHtml(slot.title)}</span>` +
          `<select data-plan-slot="${slot.id}" aria-label="${escapeHtml(slot.title)}">` +
          slot.options.map((x) => `<option value="${x.id}"${x === o ? ' selected' : ''}>${escapeHtml(x.title)}</option>`).join('') + '</select></div>' +
          `<div class="th-progress" title="${started} of ${items.length} started, ${done} mastered"><span class="bar"><span class="started" style="width:${Math.round(100 * started / items.length)}%"></span><span class="mastered" style="width:${Math.round(100 * done / items.length)}%"></span></span>` +
          `<span class="th-mini">${started} of ${items.length} started · ${done} mastered</span></div>`;
        if (next) {
          html += `<div class="th-next"><span class="th-mini">Next</span><b class="${next.cls.includes('danger') ? 'danger' : next.cls.includes('chance') ? 'chance' : ''}">${escapeHtml(next.title)}</b>${buttons(next.k, next.drill)}</div>`;
        } else html += '<p class="th-small">Every line here is started. Keep up the reviews in Today.</p>';
        html += `<details class="th-all" data-slot="${slot.id}"${slotOpen.has(slot.id) ? ' open' : ''}><summary>All ${items.length} lines and traps</summary>` +
          `<p class="th-small">${escapeHtml(o.why)}</p><ul class="th-plan">` +
          items.map((it) => `<li class="${it.cls}"><span class="dot ${it.status}" title="${statusName(it.status)}"></span>` +
            `<span class="what"><b>${escapeHtml(it.title)}</b><span class="th-mini">${escapeHtml(it.detail)}</span></span>${buttons(it.k, it.drill)}</li>`).join('') +
          '</ul></details></div>';
      }
      html += `<p class="pz-stats">${mastered} of ${total} lines mastered. A line is mastered after four clean practice runs spread over about two weeks.</p>`;
      return html;
    }

    function planGo(what) {
      if (what === 'puzzles' || what === 'strategy') { api.setMode(what); return; }
      if (what === 'review') { reviewNext(); return; }
      const entries = [];
      for (const slot of lib.plan) { const o = planOption(slot); for (const e of o.lines) entries.push({ line: e.line, side: slot.side }); }
      if (what === 'nextnew') {
        const next = entries.find((e) => lineStatus(e.line, e.side) === 'new') || entries.find((e) => lineStatus(e.line, e.side) === 'learning') || entries[0];
        openLine(next.line, next.side, 'practise');
      } else if (what === 'coachgame') {
        // A coached game with your White repertoire, against an opponent near your rating.
        st.coach.elo = COACH_ELOS.reduce((a, b) => (Math.abs(b - st.plan.rating) < Math.abs(a - st.plan.rating) ? b : a));
        st.coach.start = 'start';
        openLine(entries[0].line, entries[0].side, 'coach');
        startGame();
      }
    }

    // ------------------------------------------------------------ Coach

    function startGame() {
      token++;
      drill = null;
      const side = sideIdx();
      game = { side, elo: st.coach.elo, busy: false, guide: null, showIdeas: st.coach.hints, log: [], last: null, pause: false, over: null, leftBook: false, followLine: true };
      if (st.coach.start === 'end') api.loadLine(Core.START_FEN, line.moves, side === 1);
      else api.load(Core.START_FEN, side === 1);
      api.showEval(null);
      game.log.push({ tone: 'good', text: st.coach.start === 'end'
        ? `Starting from the end of the ${line.name}. You play ${SIDE[side]}.`
        : `You play ${SIDE[side]}. I’ll play theory moves from the ${chapter.title} while there are any, then Stockfish takes over at about ${game.elo}.` });
      nextTurn(token);
    }

    const coachFen = () => { const f = api.fens(); return f[f.length - 1]; };
    const gameMoves = () => { const f = api.fens(); return f.length - 1; };

    function nextTurn(t) {
      if (t !== token || !game) return;
      const pos = new Core.Position(coachFen());
      const outcome = pos.outcome();
      if (outcome) { endGame(outcome); return; }
      if (pos.side !== game.side) opponentMove(t);
      else guide(t);
    }

    function endGame(outcome) {
      game.over = outcome;
      game.busy = false;
      api.arrows([]); api.marks([]);
      const youWin = (outcome.result === '1-0' && game.side === 0) || (outcome.result === '0-1' && game.side === 1);
      const text = outcome.result === '1/2-1/2' ? `Draw: ${outcome.reason}.` : youWin ? `You win: ${outcome.reason}!` : `You lose: ${outcome.reason}.`;
      game.log.unshift({ tone: youWin ? 'best' : 'good', text });
      api.status('Coached game', text, youWin ? 'good' : '');
      render();
    }

    async function opponentMove(t) {
      game.busy = true;
      game.guide = null;
      api.status('Coached game', `${SIDE[game.side ^ 1]} is thinking…`, '');
      render();
      const fen = coachFen();
      const books = bookMoves(fen);
      let uci = null, how = '';
      if (books.length) {
        const played = api.fens().length - 1;
        // Follow the chosen line while the game matches it, otherwise pick a popular theory move.
        const moves = gameUcis();
        const onLine = game.followLine && moves.every((u, i) => u === line.moves[i]) && played < line.moves.length;
        if (onLine) uci = line.moves[played];
        else {
          const top = books.slice(0, 4);
          const total = top.reduce((s, b) => s + b.n, 0);
          let r = Math.random() * total;
          for (const b of top) { r -= b.n; if (r <= 0) { uci = b.uci; break; } }
          uci = uci || top[0].uci;
        }
        const b = books.find((x) => x.uci === uci);
        how = `a theory move (${b ? b.name : 'book'})`;
        await new Promise((res) => setTimeout(res, 550));
      } else {
        if (!game.leftBook) {
          game.leftBook = true;
          game.log.unshift({ tone: 'good', text: 'We are out of the opening books now. From here Stockfish plays, and coaches you.' });
        }
        const started = Date.now();
        uci = await api.engineMove(fen, game.elo);
        const wait = Math.max(0, 500 - (Date.now() - started));
        if (wait) await new Promise((res) => setTimeout(res, wait));
        how = `Stockfish at about ${game.elo}`;
      }
      if (t !== token || !game) return;
      if (!uci) { game.busy = false; game.log.unshift({ tone: 'error', text: 'The engine did not answer. Try starting the game again.' }); render(); return; }
      game.last = { text: `${SIDE[game.side ^ 1]} played ${moveText(fen, uci)}: ${how}.`, move: moveText(fen, uci), how: books.length ? 'theory' : `Stockfish ~${game.elo}` };
      api.play(uci);
      nextTurn(t);
    }

    // The moves of the game so far, in UCI.
    function gameUcis() {
      const fens = api.fens();
      const out = [];
      for (let i = 1; i < fens.length; i++) {
        const a = new Core.Position(fens[i - 1]);
        const target = fens[i].split(' ').slice(0, 4).join(' ');
        const m = a.legalMoves().find((mv) => { a.make(mv); const ok = a.toFEN().split(' ').slice(0, 4).join(' ') === target; a.unmake(); return ok; });
        out.push(m ? a.moveToUci(m) : '');
      }
      return out;
    }

    // Everything the coach shows before your move.
    async function guide(t) {
      game.busy = false;
      const fen = coachFen();
      const pos = new Core.Position(fen);
      const side = pos.side, opp = side ^ 1;
      const g = { fen, book: bookMoves(fen).slice(0, 3), engine: null, threat: null, rules: rulesFor(pos), marks: [] };
      game.guide = g;
      api.status('Coached game', `Your move as ${SIDE[side]}.`, '');
      showGuide();
      render();

      const r = await analyzer.analyse(fen, GUIDE_DEPTH);
      if (t !== token || game.guide !== g) return;
      if (r) {
        api.showEval(r);
        const lines = (r.lines && r.lines.length ? r.lines : [r]).filter((l) => l.pv && l.pv.length).slice(0, 3);
        g.score = r.score;
        g.before = r;
        g.engine = lines.map((l) => {
          const uci = l.pv[0];
          const pos2 = new Core.Position(fen);
          pos2.make(pos2.moveFromUci(uci));
          const scoreAfter = l.score.mate !== undefined ? { mate: -l.score.mate } : { cp: -l.score.cp };
          const phrase = l.score.mate !== undefined && l.score.mate > 0 ? `starts a forced mate in ${l.score.mate}` : explainMove(fen, uci, { cont: l.pv.slice(0, 6) });
          const loss = Math.max(0, coach.winPct(lines[0].score) - coach.winPct(l.score)); // winning chance given up vs the best line
          return { uci, text: moveText(fen, uci), eval: coach.formatEval(scoreAfter, opp), phrase, loss, idea: new Core.Position(fen).fullmove >= 8 ? middlegameIdea(fen, uci) : null };
        });
        showGuide();
        render();
      }
      // What would the opponent do if it were their move? That is their threat.
      if (!pos.inCheck()) {
        const parts = fen.split(' ');
        parts[1] = side === 0 ? 'b' : 'w';
        parts[3] = '-';
        const nullFen = parts.join(' ');
        const np = new Core.Position(nullFen);
        if (np.isLegalSetup()) {
          const nr = await analyzer.analyse(nullFen, THREAT_DEPTH);
          if (t !== token || game.guide !== g) return;
          if (nr && nr.best && r) {
            const ours = r.score.mate !== undefined ? (r.score.mate > 0 ? 3000 : -3000) : r.score.cp;
            const theirs = nr.score.mate !== undefined ? (nr.score.mate > 0 ? 3000 : -3000) : nr.score.cp;
            if (theirs + ours >= 150 || (nr.score.mate !== undefined && nr.score.mate > 0)) {
              const scoreAfter = coach.afterScore(nr.score);
              const mateIn = nr.score.mate !== undefined && nr.score.mate > 0 ? nr.score.mate : 0;
              const phrase = mateIn === 1 ? 'would be checkmate' : mateIn ? `would start a forced mate in ${mateIn}` : `would ${baseVerb(coach.describeMove(nullFen, nr.best, nr.pv, scoreAfter))}`;
              g.threat = { uci: nr.best, text: moveText(nullFen, nr.best), phrase };
              showGuide();
              render();
            }
          }
        }
      }
    }

    // "wins the pawn" -> "win the pawn", for "it would …".
    function baseVerb(phrase) {
      return phrase.replace(/^(\w+?)(es|s)\b/, (w, stem, end) => (end === 'es' && /(sh|ch|x|ss)$/.test(stem) ? stem : stem + (end === 'es' ? 'e' : '')));
    }

    // Rules of thumb that apply right now: facts about the board.
    // kind: 'danger' (your problem), 'target' (a chance), 'rule' (a principle that applies).
    function rulesFor(pos) {
      const side = pos.side, opp = side ^ 1;
      const out = [], marks = [];
      const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
      const at = (s) => pos.pieceAt(Core.parseSq(s) & 7, Core.parseSq(s) >> 4);
      if (pos.inCheck()) out.push({ kind: 'danger', text: 'You are in check' });
      for (const h of coach.hangingPieces(pos, side).slice(0, 2)) {
        out.push({ kind: 'danger', text: `Your ${NAME[pos.pieceAt(h.sq & 7, h.sq >> 4).toLowerCase()]} on ${Core.sqName(h.sq)} is ${h.defended ? 'attacked by a cheaper piece' : 'loose'}` });
        marks.push({ sq: h.sq, kind: 'danger' });
      }
      for (const h of coach.hangingPieces(pos, opp).slice(0, 2)) {
        out.push({ kind: 'target', text: `${SIDE[opp]}’s ${NAME[pos.pieceAt(h.sq & 7, h.sq >> 4).toLowerCase()]} on ${Core.sqName(h.sq)} is ${h.defended ? 'attacked by a cheaper piece' : 'loose'}` });
        marks.push({ sq: h.sq, kind: 'target' });
      }
      if (pos.fullmove >= 4 && pos.fullmove <= 15) {
        const homes = side === 0 ? { b1: 'N', g1: 'N', c1: 'B', f1: 'B' } : { b8: 'n', g8: 'n', c8: 'b', f8: 'b' };
        const idle = Object.entries(homes).filter(([s, p]) => at(s) === p);
        if (idle.length) {
          out.push({ kind: 'rule', text: `Develop: ${idle.map(([s, p]) => `${NAME[p.toLowerCase()]} ${s}`).join(', ')}` });
          for (const [s] of idle) marks.push({ sq: Core.parseSq(s), kind: 'focus' });
        }
      }
      const kingHome = side === 0 ? 'e1' : 'e8';
      const rights = side === 0 ? pos.castle & 3 : pos.castle & 12;
      if (Core.sqName(pos.kingSq[side]) === kingHome && rights && pos.fullmove >= 6) out.push({ kind: 'rule', text: 'Castle soon: your king is still in the centre' });
      else if (Core.sqName(pos.kingSq[side]) === kingHome && !rights && pos.fullmove <= 20) out.push({ kind: 'rule', text: 'Your king can’t castle: keep it covered' });
      if (pos.fullmove >= 4 && pos.fullmove <= 10 && !['d4', 'e4', 'd5', 'e5'].some((s) => at(s) === (side === 0 ? 'P' : 'p'))) out.push({ kind: 'rule', text: 'Get a pawn into the centre' });
      return { list: out, marks };
    }

    function showGuide() {
      const g = game && game.guide;
      if (!g || !game.showIdeas) { api.arrows([]); api.marks([]); return; }
      const arrows = [];
      const seen = new Set();
      if (g.engine) g.engine.forEach((e, i) => { if (i > 0 && e.loss >= 5) return; arrows.push({ uci: e.uci, kind: i === 0 ? 'best' : 'alt' }); seen.add(e.uci); });
      for (const b of g.book) if (!seen.has(b.uci)) { arrows.push({ uci: b.uci, kind: 'book' }); seen.add(b.uci); }
      if (g.threat) arrows.push({ uci: g.threat.uci, kind: 'threat' });
      api.arrows(arrows);
      api.marks(g.rules.marks);
    }

    function onGameMove(mv) {
      const t = token;
      const fens = api.fens();
      const fenBefore = fens[fens.length - 2], fenAfter = fens[fens.length - 1];
      const g = game.guide;
      game.guide = null;
      game.busy = true;
      api.arrows([]); api.marks([]);
      game.myMoves = (game.myMoves || 0) + 1;
      if (game.myMoves === 8) { today().games++; saveState(); }
      const wasBook = !!nodeFor(fenBefore);
      const isBook = wasBook && lib.tree.has(new Core.Position(fenAfter).key());
      if (!isBook || mv.uci !== line.moves[fens.length - 2]) game.followLine = game.followLine && isBook;
      const entry = { tone: 'good', text: `Your ${moveText(fenBefore, mv.uci)}: checking…`, pending: true };
      game.log.unshift(entry);
      game.verdict = { pending: true, move: moveText(fenBefore, mv.uci) };
      game.last = null;
      render();
      const beforeP = g && g.before && g.fen === fenBefore ? Promise.resolve(g.before) : analyzer.analyse(fenBefore, LEARN_DEPTH);
      Promise.all([beforeP, analyzer.analyse(fenAfter, LEARN_DEPTH)]).then(([before, after]) => {
        if (t !== token || !game) return;
        entry.pending = false;
        if (!before || !after) { entry.text = `Your ${moveText(fenBefore, mv.uci)}.`; nextTurn(t); return; }
        const named = lib.named.get(new Core.Position(fenAfter).key());
        const opening = named !== undefined ? { name: lib.lines[named].name } : null;
        const r = coach.review({ fenBefore, fenAfter, uci: mv.uci, before, after, book: isBook, opening, who: 'you' });
        if (['best', 'excellent', 'good'].includes(r.kind)) {
          const ucis = gameUcis();
          const prev = fens.length >= 3 ? { fen: fens[fens.length - 3], uci: ucis[ucis.length - 2] } : null;
          r.text = r.text.replace(/: it .*$/, `: it ${explainMove(fenBefore, mv.uci, { cont: [mv.uci].concat(after.pv || []).slice(0, 6), prev })}.`);
        }
        entry.tone = r.tone === 'book' || r.tone === 'best' ? 'best' : ['mistake', 'blunder'].includes(r.kind) ? 'error' : 'good';
        entry.text = `${r.label}: ${moveText(fenBefore, mv.uci)}. ${r.text}` + (r.better ? ` Better was ${r.better.san}, which ${r.better.why}.` : '') + (r.tip ? ` ${r.tip}` : '');
        const bad = ['inaccuracy', 'mistake', 'blunder'].includes(r.kind);
        game.verdict = {
          label: r.label, tone: r.tone, move: moveText(fenBefore, mv.uci), bad,
          name: r.kind === 'book' && opening ? opening.name : '',
          text: bad ? r.text : '',
          better: bad && r.better ? r.better.san : '', tip: bad ? r.tip : '',
        };
        if (['mistake', 'blunder'].includes(r.kind)) {
          game.pause = true;
          game.busy = false;
          api.status('Coached game', `${r.label}. Take it back, or carry on.`, 'warn');
          render();
          return;
        }
        nextTurn(t);
      });
    }

    function takeBackGame() {
      if (!game || game.busy) return;
      token++;
      const t = token;
      // Undo your last move and the reply to it (if any).
      if (api.fens().length < 2) return;
      api.undoLast();
      if (new Core.Position(coachFen()).side !== game.side && api.fens().length > 1) api.undoLast();
      game.pause = false;
      game.over = null;
      game.log.unshift({ tone: 'good', text: 'Move taken back. Your turn again.' });
      nextTurn(t);
    }

    function renderCoachView() {
      const c = st.coach;
      let html = '';
      if (!game) {
        html += '<div class="th-setup">' +
          `<div class="field-row"><span id="thStartLabel">Start</span><div class="segmented" role="radiogroup" aria-labelledby="thStartLabel" id="thStart">` +
          `<button type="button" role="radio" data-value="start" aria-checked="${c.start === 'start'}">Move 1</button>` +
          `<button type="button" role="radio" data-value="end" aria-checked="${c.start === 'end'}">End of line</button></div></div>` +
          `<div class="field-row"><span>Opponent</span><select id="thElo">${COACH_ELOS.map((e) => `<option value="${e}"${e === c.elo ? ' selected' : ''}>Theory, then ~${e}${e >= 3190 ? ' (full)' : ''}</option>`).join('')}</select></div>` +
          `<label class="toggle small"><input type="checkbox" id="thHints"${c.hints ? ' checked' : ''}> <span>Show ideas before I move</span></label>` +
          '<button type="button" class="btn primary" data-go="coach">Start coached game</button></div>' +
          '<div class="th-key"><span class="k best">Green</span> Stockfish’s best moves <span class="k theory">Blue</span> Theory <span class="k danger">Red</span> Danger</div>';
        return html;
      }
      const g = game.guide;
      const v = game.verdict;
      // What just happened.
      if (v) {
        if (v.pending) html += `<div class="th-verdict"><span class="spinner"></span><strong>${escapeHtml(v.move)}</strong> <span class="muted">checking…</span></div>`;
        else {
          html += `<div class="th-verdict${v.bad ? ' bad' : ''}"><span class="badge tone-${v.tone}">${escapeHtml(v.label)}</span> <strong>${escapeHtml(v.move)}</strong>` +
            (v.name ? ` <span class="muted">${escapeHtml(shortName(v.name))}</span>` : '') + '</div>';
          if (v.bad) {
            html += `<div class="th-block danger"><p class="th-why">${escapeHtml(v.text)}</p>` +
              (v.better ? `<p class="th-why">Better: <b>${escapeHtml(v.better)}</b></p>` : '') +
              (v.tip ? `<p class="th-small">${escapeHtml(v.tip)}</p>` : '') + '</div>';
          }
        }
      }
      if (game.last) html += `<p class="th-opp">${escapeHtml(SIDE[game.side ^ 1])} played <b>${escapeHtml(game.last.move)}</b> <span class="muted">· ${escapeHtml(game.last.how)}</span></p>`;

      if (game.over) html += `<div class="th-block theory"><p class="th-big">${escapeHtml(game.log[0] ? game.log[0].text : 'Game over')}</p></div>`;
      else if (game.pause) html += '<p class="th-why">Take the move back and try again, or carry on.</p>';
      else if (!g) html += `<p class="muted"><span class="spinner"></span>${escapeHtml(SIDE[game.side ^ 1])} is thinking…</p>`;
      else if (!game.showIdeas) html += '<p class="th-why">Your move. Ideas are hidden: press <b>Show ideas</b> if you get stuck.</p>';
      else {
        const rules = g.rules.list;
        if (g.engine && g.engine.length) {
          const [best, ...rest] = g.engine;
          const more = rest.filter((e) => e.loss < 5); // under the coach's inaccuracy threshold
          html += '<div class="th-block best"><span class="th-label">Best move</span>' +
            `<p class="th-big">${escapeHtml(best.text)} <span class="eval">${escapeHtml(best.eval)}</span></p>` +
            `<p class="th-why">${escapeHtml(cap(best.phrase))}.</p>` +
            (best.idea ? `<p class="th-small">Middlegame idea: <b>${escapeHtml(best.idea)}</b> (see Theory → Middlegame)</p>` : '') +
            (more.length ? '<div class="th-chips"><span class="muted">Also good</span>' + more.map((e) => `<span class="th-chip" title="${escapeHtml(cap(e.phrase))}"><b>${escapeHtml(e.text)}</b> ${escapeHtml(e.eval)}</span>`).join('') + '</div>' : '') +
            '</div>';
        } else html += '<div class="th-block best"><span class="th-label">Best move</span><p class="muted"><span class="spinner"></span>Stockfish is looking…</p></div>';
        if (g.book.length) {
          html += '<div class="th-block theory"><span class="th-label">Theory</span><div class="th-chips">' +
            g.book.map((b) => `<span class="th-chip"><b>${escapeHtml(moveText(g.fen, b.uci))}</b> <span>${b.named ? '' : '→ '}${escapeHtml(shortName(b.name))}</span></span>`).join('') + '</div></div>';
        }
        const danger = rules.filter((r) => r.kind === 'danger');
        if (g.threat || danger.length) {
          html += '<div class="th-block danger"><span class="th-label">Watch out</span>' +
            (g.threat ? `<p class="th-why"><b>${escapeHtml(g.threat.text)}</b> ${escapeHtml(g.threat.phrase)}</p>` : '') +
            danger.map((r) => `<p class="th-why">${escapeHtml(r.text)}</p>`).join('') + '</div>';
        }
        const chances = rules.filter((r) => r.kind === 'target');
        if (chances.length) html += '<div class="th-block chance"><span class="th-label">Chance</span>' + chances.map((r) => `<p class="th-why">${escapeHtml(r.text)}</p>`).join('') + '</div>';
        const remember = rules.filter((r) => r.kind === 'rule');
        if (remember.length) html += '<div class="th-block remember"><span class="th-label">Remember</span>' + remember.map((r) => `<p class="th-why">${escapeHtml(r.text)}</p>`).join('') + '</div>';
      }
      html += '<div class="review-actions">';
      html += `<button type="button" class="btn" data-go="takeback"${game.busy || api.fens().length < 2 ? ' disabled' : ''}>Take back</button>`;
      if (game.pause) html += '<button type="button" class="btn primary" data-go="carryon">Carry on</button>';
      if (!game.over) html += `<button type="button" class="btn" data-go="ideas">${game.showIdeas ? 'Hide ideas' : 'Show ideas'}</button>`;
      html += '<button type="button" class="btn" data-go="setup">New game</button></div>';
      if (game.log.length) {
        html += `<details class="th-history"${historyOpen ? ' open' : ''}><summary>Game so far</summary><ul class="eg-feed">` +
          game.log.map((f) => `<li class="tone-${f.tone === 'error' ? 'error' : f.tone === 'best' ? 'best' : 'good'}">${f.pending ? '<span class="spinner"></span>' : ''}${escapeHtml(f.text)}</li>`).join('') + '</ul></details>';
      }
      return html;
    }

    // ------------------------------------------------------------ panel

    function render() {
      if (!lib) {
        el.innerHTML = '<p class="muted"><span class="spinner"></span>Loading the opening library…</p>';
        api.refresh();
        return;
      }
      const side = mySide();
      let chapterOpts = '';
      for (const g of GROUPS) {
        chapterOpts += `<optgroup label="${escapeHtml(g.title)}">` + lib.chapters.filter((c) => c.group === g.id)
          .map((c) => `<option value="${escapeHtml(c.id)}"${c === chapter ? ' selected' : ''}>${escapeHtml(c.title)}</option>`).join('') + '</optgroup>';
      }
      chapterOpts += '<optgroup label="More openings, A–Z">' + lib.chapters.filter((c) => c.group === 'more')
        .map((c) => `<option value="${escapeHtml(c.id)}"${c === chapter ? ' selected' : ''}>${escapeHtml(c.title)} (${c.lines.length})</option>`).join('') + '</optgroup>';
      const curGroup = chapter.groups.find(([label]) => label === line.group) || chapter.groups[0];
      let groupOpts = chapter.groups.map(([label, list]) => `<option value="${escapeHtml(label)}"${!line.extra && label === curGroup[0] ? ' selected' : ''}>${escapeHtml(label)} (${list.length})</option>`).join('');
      let lineOpts = curGroup[1].map((i) => `<option value="${i}"${i === line.idx ? ' selected' : ''}>${escapeHtml(lineLabel(lib.lines[i]))}</option>`).join('');
      if (line.extra) {
        groupOpts = '<option value="" selected>From your study plan</option>' + groupOpts;
        lineOpts = `<option value="" selected>${escapeHtml(line.name)}</option>` + lineOpts;
      }

      let card = `<p class="lesson-title">${escapeHtml(chapter.title)} <span class="level">${escapeHtml(chapter.level || 'Reference')}</span></p>`;
      if (!(st.view === 'learn' && learnPly === 0)) card += `<p>${escapeHtml(chapter.about || coach.ideaFor(chapter.title, lib.lines[chapter.lines[0]].eco) || '')}</p>`;
      if (chapter.curated) {
        const mine = side === 'w' ? chapter.white : chapter.black, theirs = side === 'w' ? chapter.black : chapter.white;
        card += `<details class="method th-plans"${cardOpen ? ' open' : ''}><summary>Plans and ideas</summary>` +
          `<p class="th-plan-head">Your plans as ${side === 'w' ? 'White' : 'Black'}</p><ul>${mine.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` +
          `<p class="th-plan-head">What your opponent wants</p><ul>${theirs.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` +
          `<p class="tip"><strong>Good to know:</strong> ${escapeHtml(chapter.know)}</p></details>`;
      }
      card += `<p class="muted small">${escapeHtml(line.eco)} · ${escapeHtml(line.name)}</p>`;

      let body = '';
      if (st.view === 'plan') body = renderPlan();
      else if (st.view === 'learn') body = renderLearn();
      else if (st.view === 'practise') body = renderPractise();
      else body = renderCoachView();

      const counts = Object.values(st.cards);
      const mastered = counts.filter((c) => c.box >= MASTERED_BOX).length;
      const due = dueCards().length;

      const playing = st.view === 'coach' && game;
      const pickers = st.view === 'plan' ? '' : playing
        ? `<p class="th-compact"><strong>${escapeHtml(chapter.title)}</strong> · ${escapeHtml(line.tail || line.group)} · you play ${side === 'w' ? 'White' : 'Black'} vs ~${game.elo}</p>`
        : `<div class="th-search"><input type="search" id="thSearch" placeholder="Find an opening by name…" autocomplete="off" aria-label="Find an opening" value="${escapeHtml(searchText)}"><div class="th-results" id="thResults">${resultsHtml()}</div></div>` +
        `<div class="field-row"><span>Opening</span><select id="thChapter">${chapterOpts}</select></div>` +
        `<div class="field-row"><span>Variation</span><select id="thGroup">${groupOpts}</select></div>` +
        `<div class="field-row"><span>Line</span><select id="thLine">${lineOpts}</select></div>` +
        `<div class="field-row"><span id="thSideLabel">You play</span><div class="segmented" role="radiogroup" aria-labelledby="thSideLabel" id="thSide">` +
        `<button type="button" role="radio" data-value="w" aria-checked="${side === 'w'}">White</button><button type="button" role="radio" data-value="b" aria-checked="${side === 'b'}">Black</button></div></div>`;
      const section = st.view === 'plan' ? 'plan' : 'openings';
      el.innerHTML = sectionsHtml(section) + pickers +
        (section === 'openings' ? `<div class="segmented full" role="radiogroup" aria-label="Openings" id="thView">` +
          ['learn', 'practise', 'coach'].map((v) => `<button type="button" role="radio" data-value="${v}" aria-checked="${st.view === v}">${{ learn: 'Learn', practise: 'Practice', coach: 'Coach' }[v]}</button>`).join('') + '</div>' : '') +
        body +
        (section === 'openings' ? `<div class="lesson-card">${card}</div>` +
          `<p class="pz-stats">Lines studied ${counts.length} · Mastered ${mastered} · Due for review ${due}</p>` : '');
      const search = el.querySelector('#thSearch');
      if (search && searchFocused) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
      api.refresh();
    }

    // ------------------------------------------------------------ search

    let searchText = '';
    let searchFocused = false;
    const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function runSearch(q) {
      searchText = q;
      const words = fold(q).split(/\s+/).filter(Boolean);
      if (!words.length) { results = []; return; }
      results = lib.lines.filter((l) => { const n = fold(l.name + ' ' + l.eco); return words.every((w) => n.includes(w)); })
        .sort((a, b) => a.moves.length - b.moves.length).slice(0, 30);
    }

    function resultsHtml() {
      if (!searchText.trim()) return '';
      if (!results.length) return '<p class="muted small">No opening by that name.</p>';
      return results.map((l) => `<button type="button" class="th-result" data-line="${l.idx}"><span class="eco">${escapeHtml(l.eco)}</span> ${escapeHtml(l.name)} <span class="muted">· ${escapeHtml(sanList(l.moves).pop().text)}</span></button>`).join('');
    }

    // ------------------------------------------------------------ events

    el.addEventListener('change', (e) => {
      if (!lib) return;
      const id = e.target.id;
      if (id === 'thChapter') { setChapter(e.target.value); restartView(); }
      else if (id === 'thGroup') {
        const g = chapter.groups.find(([label]) => label === e.target.value);
        if (g) { setLine(lib.lines[g[1][0]]); restartView(); }
      } else if (id === 'thLine') { if (e.target.value !== '') { setLine(lib.lines[+e.target.value]); restartView(); } }
      else if (id === 'thRating' || id === 'thGoal') {
        const v = Math.max(100, Math.min(3000, Math.round(+e.target.value) || 0));
        if (v) { st.plan[id === 'thRating' ? 'rating' : 'goal'] = v; saveState(); render(); }
      } else if (e.target.dataset && e.target.dataset.planSlot) { st.plan.picks[e.target.dataset.planSlot] = e.target.value; saveState(); render(); }
      else if (id === 'thElo') { st.coach.elo = +e.target.value; if (game) game.elo = st.coach.elo; saveState(); }
      else if (id === 'thHints') {
        st.coach.hints = e.target.checked; saveState();
        if (game) { game.showIdeas = st.coach.hints; showGuide(); }
        render();
      }
    });
    el.addEventListener('input', (e) => {
      if (e.target.id !== 'thSearch' || !lib) return;
      runSearch(e.target.value);
      el.querySelector('#thResults').innerHTML = resultsHtml();
    });
    el.addEventListener('focusin', (e) => { if (e.target.id === 'thSearch') searchFocused = true; });
    el.addEventListener('focusout', (e) => { if (e.target.id === 'thSearch') searchFocused = false; });
    el.addEventListener('toggle', (e) => {
      if (!e.target.classList) return;
      if (e.target.classList.contains('th-plans')) cardOpen = e.target.open;
      if (e.target.classList.contains('th-history')) historyOpen = e.target.open;
      if (e.target.classList.contains('th-whyplan')) whyOpen = e.target.open;
      if (e.target.classList.contains('th-all')) { if (e.target.open) slotOpen.add(e.target.dataset.slot); else slotOpen.delete(e.target.dataset.slot); }
    }, true);
    el.addEventListener('click', (e) => {
      if (!lib) return;
      const b = e.target.closest('button');
      if (!b) return;
      if (b.classList.contains('th-result')) {
        searchText = ''; results = []; searchFocused = false;
        const l = lib.lines[+b.dataset.line];
        chapter = lib.home[l.idx]; st.chapter = chapter.id;
        setLine(l);
        restartView();
        return;
      }
      if (b.closest('#thSide')) { st.sides[chapter.id] = b.dataset.value; saveState(); restartView(); return; }
      if (b.closest('#thView')) { st.view = b.dataset.value; st.openingView = st.view; saveState(); restartView(); return; }
      if (b.closest('#thSection')) {
        const v = b.dataset.value;
        if (v === 'middlegame') { api.setMode('strategy'); return; }
        st.view = v === 'plan' ? 'plan' : (st.openingView || 'learn');
        saveState(); restartView(); return;
      }
      if (b.closest('#thStart')) { st.coach.start = b.dataset.value; saveState(); render(); return; }
      if (b.dataset.ply) { showLearn(+b.dataset.ply); return; }
      if (b.dataset.plan !== undefined) { const e = planIndex[+b.dataset.plan]; if (e) openLine(e.line, e.side, b.dataset.view); return; }
      if (b.dataset.planGo) { planGo(b.dataset.planGo); return; }
      if (b.dataset.branch) {
        const prefix = b.dataset.branch.split(' ');
        const l = findLine(prefix, chapter);
        if (l) switchTo(l, prefix.length);
        return;
      }
      const learn = b.dataset.learn;
      if (learn === 'first') showLearn(0);
      else if (learn === 'prev') showLearn(learnPly - 1, true);
      else if (learn === 'next') showLearn(learnPly + 1, true);
      else if (learn === 'last') showLearn(line.moves.length);
      const go = b.dataset.go;
      if (go === 'practise') { st.view = 'practise'; saveState(); startDrill(); }
      else if (go === 'learn') { st.view = 'learn'; saveState(); showLearn(0); }
      else if (go === 'again') startDrill();
      else if (go === 'random') {
        const pool = chapter.lines.filter((i) => lib.lines[i].moves.length >= 4 && i !== line.idx);
        if (pool.length) startDrill(lib.lines[pool[Math.floor(Math.random() * pool.length)]]);
      } else if (go === 'hint') drillHint();
      else if (go === 'show') drillShow();
      else if (go === 'review') reviewNext();
      else if (go === 'coach') startGame();
      else if (go === 'takeback') takeBackGame();
      else if (go === 'carryon') { if (game) { game.pause = false; nextTurn(token); } }
      else if (go === 'help') { if (game) { game.showIdeas = true; showGuide(); render(); } }
      else if (go === 'ideas') { if (game) { game.showIdeas = !game.showIdeas; st.coach.hints = game.showIdeas; saveState(); showGuide(); render(); } }
      else if (go === 'setup') restartView();
    });

    document.addEventListener('keydown', (e) => {
      if (!lib || !active || st.view !== 'learn') return;
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (learnPly < line.moves.length) showLearn(learnPly + 1, true); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (learnPly > 0) showLearn(learnPly - 1, true); }
    });

    function restartView() {
      token++;
      drill = null; game = null;
      api.arrows([]); api.marks([]);
      if (st.view === 'learn') showLearn(0);
      else if (st.view === 'practise') startDrill();
      else if (st.view === 'plan') {
        api.load(Core.START_FEN, false);
        api.showEval(null);
        api.status('Your study plan', '', '');
        render();
      } else {
        api.load(Core.START_FEN, mySide() === 'b');
        api.showEval(null);
        api.status(`${chapter.title}: coach`, 'Press Start coached game.', '');
        render();
      }
    }

    // ------------------------------------------------------------ board callbacks

    function canMove() {
      if (!lib || !line) return false;
      if (st.view === 'plan') return false;
      if (st.view === 'learn') return true;
      if (st.view === 'practise') return !!drill && !drill.done && !drill.busy && api.side() === drill.side;
      return !!game && !game.busy && !game.over && !game.pause && api.side() === game.side;
    }

    function onMovePlayed(mv, opts) {
      if (opts && opts.computer) return;
      if (st.view === 'learn') {
        const ply = api.fens().length - 1;
        if (mv.uci === line.moves[ply - 1] && ply - 1 === learnPly) { learnPly = ply; token++; learnArrows(); render(); analyseLearn(token); return; }
        const moves = line.moves.slice(0, ply - 1).concat(mv.uci);
        const l = lib.tree.has(new Core.Position(api.fens()[ply]).key()) ? findLine(moves, chapter) : null;
        if (l && l.uci.startsWith(moves.join(' '))) {
          const ch = lib.home[l.idx];
          if (ch !== chapter) { chapter = ch; st.chapter = ch.id; }
          setLine(l);
          learnPly = ply;
          token++;
          api.status(`${chapter.title}: learn`, `Now following ${l.name}.`, 'good');
          learnArrows(); render(); analyseLearn(token);
          return;
        }
        const known = lib.tree.has(new Core.Position(api.fens()[ply]).key());
        api.status(`${chapter.title}: learn`, known ? `${mv.san} reaches a known position by a different move order. Step back and follow the line.` : `${mv.san} is not in the opening books here.`, 'warn');
        setTimeout(() => { if (st.view === 'learn') { api.undoLast(); learnArrows(); } }, 900);
        return;
      }
      if (st.view === 'practise' && drill) { onDrillMove(mv); return; }
      if (st.view === 'coach' && game) onGameMove(mv);
    }

    return {
      async enter(opts) {
        active = true;
        if (opts && opts.view) { st.view = opts.view; if (opts.view !== 'plan') st.openingView = opts.view; }
        render();
        if (!lib) {
          if (!loading) {
            loading = loadData().then((data) => new Promise((res) => setTimeout(() => res(buildLibrary(Core, data)), 0)));
          }
          try { lib = await loading; } catch (err) { el.innerHTML = `<p class="pz-wrong">${escapeHtml(err.message)}</p>`; return; }
        }
        if (!active) return;
        // Opened from a middlegame exercise: go to the opening it came from.
        const named = opts && opts.lineName ? lib.lines.filter((l) => l.name === opts.lineName).sort((a, b) => a.moves.length - b.moves.length)[0] : null;
        if (named) { chapter = lib.home[named.idx]; st.chapter = chapter.id; setLine(named); restartView(); return; }
        chapter = lib.chapterById.get(st.chapter) || lib.chapters[0];
        const idx = lib.lines.findIndex((l) => l.uci === st.line);
        if (idx >= 0 && lib.home[idx] === chapter) setLine(lib.lines[idx]);
        else setChapter(chapter.id);
        restartView();
      },
      exit() { active = false; token++; drill = null; game = null; api.arrows([]); api.marks([]); },
      canMove,
      onMovePlayed,
      isBusy: () => !!((drill && drill.busy) || (game && game.busy)),
    };
  }

  return { create, CHAPTERS, GROUPS, PLAN, explainer, buildLibrary, schedule, nameParts, sanToUci, INTERVALS, sectionsHtml };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MyChessTheory;
