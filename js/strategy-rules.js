/*
 * Middlegame strategy: the lessons, and exact rules for recognising each idea in
 * a move ("the knight lands on a square no enemy pawn can ever attack"). The same
 * rules pick the exercises (tools/build-strategy.js, which keeps only positions
 * where Stockfish's best move is the idea) and explain your moves in the app.
 */
(function () {
  'use strict';

  const LESSONS = [
    // ------------------------------------------------------------ pieces
    {
      id: 'worstPiece', group: 'Pieces', title: 'Improve your worst piece', level: 'Beginner',
      idea: 'When there is nothing to attack, find your least active piece and give it a better square. A game is often decided by which side gets all its pieces working.',
      rules: ['Count how many squares each of your pieces can reach. The one with the fewest is your worst piece.', 'Bring it to a square where it attacks or controls more.', 'Do this before you start an attack: attacks need every piece.'],
      task: 'Find a better square for your least active piece.',
    },
    {
      id: 'outpost', group: 'Pieces', title: 'Knights love outposts', level: 'Beginner',
      idea: 'An outpost is a square in the opponent’s half that your pawn protects and no enemy pawn can ever attack. A knight on an outpost cannot be chased away, so it often ends up worth more than a rook.',
      rules: ['Look for holes: squares the enemy pawns have moved past and can no longer cover.', 'Support the square with a pawn, then put a knight there.', 'An outpost on the 5th or 6th rank is the strongest.'],
      task: 'Find an outpost and put a piece on it.',
    },
    {
      id: 'centralize', group: 'Pieces', title: 'Centralise your knights', level: 'Beginner',
      idea: '“A knight on the rim is dim.” From the edge a knight reaches only 2 to 4 squares; from the centre it reaches 8. Bring stray knights back towards the middle.',
      rules: ['Knights on the a- and h-files, or still on the back rank, are usually doing little.', 'Head for the centre: c3 to f6 for White, c6 to f3 for Black.', 'Exceptions exist, but they need a concrete reason.'],
      task: 'Bring a knight from the edge towards the centre.',
    },
    {
      id: 'openFile', group: 'Pieces', title: 'Rooks on open files', level: 'Beginner',
      idea: 'Rooks need open lines. An open file has no pawns on it; a half-open file has only the opponent’s pawns. A rook there can reach the enemy camp or press on a weak pawn.',
      rules: ['Put your rooks on the open files before your opponent does.', 'On a half-open file the rook attacks the enemy pawn at the end of it.', 'A rook behind its own pawns does very little.'],
      task: 'Put a rook on an open or half-open file.',
    },
    {
      id: 'doubleRooks', group: 'Pieces', title: 'Double your rooks', level: 'Intermediate',
      idea: 'Two rooks on the same open file support each other and double the pressure. Whoever controls the open file with two rooks usually gets to the seventh rank.',
      rules: ['Once one rook holds an open file, bring the other one behind it.', 'The queen can join too: queen and rook together on a file are a battery.', 'Doubled rooks can break into the enemy camp along the file.'],
      task: 'Double your rooks (or rook and queen) on a file.',
    },
    {
      id: 'seventh', group: 'Pieces', title: 'The seventh rank', level: 'Intermediate',
      idea: 'A rook on the seventh rank (the second rank for Black) attacks pawns that are still on their starting squares and can trap the king on the back rank. It is one of the strongest places for a rook.',
      rules: ['Use an open file to reach the seventh rank.', 'Pawns there can only be defended by pieces, which ties them down.', 'Two rooks on the seventh are often decisive.'],
      task: 'Get a rook to the seventh rank.',
    },
    // ------------------------------------------------------------ pawns
    {
      id: 'passedPawn', group: 'Pawns', title: 'Passed pawns must be pushed', level: 'Beginner',
      idea: 'A passed pawn has no enemy pawns in front of it or on the files beside it, so only pieces can stop it. Every step forward ties down more of the opponent’s pieces.',
      rules: ['Create a passed pawn when you can: it is a long-term advantage.', 'Push it when it is safe, supported by your pieces.', 'A rook behind a passed pawn is the ideal support.'],
      task: 'Create or push a passed pawn.',
    },
    {
      id: 'pawnBreak', group: 'Pawns', title: 'Pawn breaks', level: 'Intermediate',
      idea: 'A pawn break is a pawn move that attacks an enemy pawn to open lines. It is how you start play in a closed position: the right break opens the files and diagonals your pieces need.',
      rules: ['Break where you have more space or more pieces.', 'Attack a pawn chain at its base, not its head.', 'Prepare the break first, so that you are ready for the lines that open.'],
      task: 'Find the pawn break that opens the position for you.',
    },
    {
      id: 'space', group: 'Pawns', title: 'Gain space', level: 'Intermediate',
      idea: 'A centre pawn on the fifth rank takes squares away from the enemy pieces and gives yours more room. The side with more space finds it easier to move pieces from one wing to the other.',
      rules: ['Advance a centre pawn when it is well supported.', 'With more space, avoid trades: the cramped side wants them.', 'Watch for breaks against your advanced pawn.'],
      task: 'Gain space with a pawn advance.',
    },
    {
      id: 'blockade', group: 'Pawns', title: 'Blockade', level: 'Intermediate',
      idea: 'The best answer to an enemy passed or isolated pawn is often to put a piece directly in front of it. The pawn stops, and it can never attack the piece that blocks it. Knights are the best blockaders.',
      rules: ['Blockade the square in front of a passed or isolated pawn.', 'A knight blockades best: it keeps working while it blocks.', 'Once the pawn is stopped, attack it with your other pieces.'],
      task: 'Blockade the enemy pawn.',
    },
    {
      id: 'isolatedPawn', group: 'Pawns', title: 'Pile up on weak pawns', level: 'Intermediate',
      idea: 'An isolated pawn has no friendly pawns on the files beside it, so only pieces can defend it. Attack it more times than it can be defended, and pieces get tied up guarding it.',
      rules: ['Find pawns with no neighbours: isolated pawns.', 'Attack them with pieces, especially rooks and queen on the file.', 'First blockade the square in front, then pile up.'],
      task: 'Add pressure to the isolated pawn.',
    },
    {
      id: 'minority', group: 'Pawns', title: 'The minority attack', level: 'Advanced',
      idea: 'Two pawns can attack three. Pushing the b-pawn against a queenside majority (classically b4–b5 against c6) leaves the opponent with a weak, isolated or backward pawn to attack.',
      rules: ['Use it when your opponent has more pawns on the queenside.', 'Push the b-pawn to exchange it for their c-pawn.', 'Then attack the weak pawn left behind.'],
      task: 'Start the minority attack.',
    },
    // ------------------------------------------------------------ kings and trades
    {
      id: 'luft', group: 'Kings and trades', title: 'Give your king air', level: 'Beginner',
      idea: 'A castled king behind three unmoved pawns can be mated on the back rank. Moving one pawn (often h3 or h6) gives the king an escape square, called “luft”.',
      rules: ['If your king has no escape square and the opponent has a rook or queen, think about luft.', 'h3 (h6 for Black) is usually the safest pawn move for it.', 'Do it when you have a quiet moment, not when you are under attack.'],
      task: 'Make an escape square for your king.',
    },
    {
      id: 'pawnStorm', group: 'Kings and trades', title: 'Attack on opposite sides', level: 'Intermediate',
      idea: 'When the kings are castled on opposite sides, pawns can storm the enemy king without weakening your own. It becomes a race: whoever opens lines first usually wins.',
      rules: ['Push the pawns in front of the enemy king, not your own.', 'Open files for your rooks and queen.', 'Speed matters more than material in a race.'],
      task: 'Storm the enemy king with your pawns.',
    },
    {
      id: 'tradeWhenAhead', group: 'Kings and trades', title: 'Trade when you are ahead', level: 'Beginner',
      idea: 'When you are ahead in material, trade pieces (not pawns). Every trade makes your extra material count for more, and the endgame becomes easy to win.',
      rules: ['Ahead: trade pieces, keep pawns.', 'Behind: avoid trades and keep the position complicated.', 'Trade your opponent’s most active pieces first.'],
      task: 'You are ahead: find the trade.',
    },
  ];

  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
  const SIDE = ['White', 'Black'];

  function rules(Core) {
    const at = (pos, sq) => pos.pieceAt(sq & 7, sq >> 4) || '';
    const lower = (c) => c.toLowerCase();
    const colorOf = (c) => (c === c.toUpperCase() ? 0 : 1);
    const sqn = Core.sqName;
    const file = (sq) => sq & 7, rank = (sq) => sq >> 4;

    function pawnsOn(pos, f, side) {
      const out = [];
      for (let r = 0; r < 8; r++) { const c = pos.pieceAt(f, r); if (c && lower(c) === 'p' && colorOf(c) === side) out.push(r * 16 + f); }
      return out;
    }
    function isPassed(pos, sq) {
      const c = at(pos, sq);
      if (!c || lower(c) !== 'p') return false;
      const side = colorOf(c), f = file(sq), r = rank(sq);
      for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
        for (const p of pawnsOn(pos, ff, side ^ 1)) if (side === 0 ? rank(p) > r : rank(p) < r) return false;
      }
      return true;
    }
    function isIsolated(pos, sq) {
      const c = at(pos, sq);
      if (!c || lower(c) !== 'p') return false;
      const side = colorOf(c), f = file(sq);
      return ![f - 1, f + 1].some((ff) => ff >= 0 && ff <= 7 && pawnsOn(pos, ff, side).length);
    }
    // No pawn of `by` can ever attack sq (none on the neighbouring files that could still advance to it).
    function safeFromPawns(pos, sq, by) {
      const f = file(sq), r = rank(sq);
      for (const ff of [f - 1, f + 1]) {
        if (ff < 0 || ff > 7) continue;
        for (const p of pawnsOn(pos, ff, by)) if (by === 1 ? rank(p) > r : rank(p) < r) return false;
      }
      return true;
    }
    const mobility = (pos, sq) => {
      const side = colorOf(at(pos, sq));
      return pos.attacksFrom(sq).filter((t) => { const c = at(pos, t); return !c || colorOf(c) !== side; }).length;
    };
    const pieces = (pos, side, types) => {
      const out = [];
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const c = pos.pieceAt(f, r); if (c && colorOf(c) === side && types.includes(lower(c))) out.push(r * 16 + f); }
      return out;
    };
    const minorsAndMajors = (pos) => pieces(pos, 0, 'nbrq').length + pieces(pos, 1, 'nbrq').length;

    // Which lessons a move illustrates: [{ lesson, text }].
    function detect(fen, uci) {
      const pos = new Core.Position(fen);
      const side = pos.side, opp = side ^ 1;
      const m = pos.moveFromUci(uci);
      if (!m || pos.inCheck()) return [];
      const from = Core.moveFrom(m), to = Core.moveTo(m);
      const ch = at(pos, from), t = lower(ch);
      const capture = !!(m & Core.FLAG_CAPTURE);
      const victim = capture ? (m & Core.FLAG_EP ? 'p' : lower(at(pos, to))) : '';
      const rel = (sq) => (side === 0 ? rank(sq) : 7 - rank(sq)); // 0 = your back rank
      const ahead = (side === 0 ? 1 : -1) * pos.material();
      const out = [];

      // Before the move.
      const own = pieces(pos, side, 'nbr');
      const mobBefore = mobility(pos, from);
      const lowest = own.every((s) => s === from || mobility(pos, s) >= mobBefore);
      const wasPassed = t === 'p' && isPassed(pos, from);
      const rooksOnFile = pieces(pos, side, 'r').filter((s) => s !== from && file(s) === file(to)).length;
      const queenOnFile = pieces(pos, side, 'q').filter((s) => s !== from && file(s) === file(to)).length;
      const attackersBefore = (sq) => pos.attackersOf(sq, side).length;
      const kingSq = pos.kingSq[side], enemyKing = pos.kingSq[opp];
      const enemyHeavy = pieces(pos, opp, 'rq').length;
      let noLuft = false;
      if ((t === 'p') && rel(kingSq) === 0 && file(kingSq) >= 5) {
        const fwd = side === 0 ? 16 : -16;
        noLuft = [kingSq + fwd - 1, kingSq + fwd, kingSq + fwd + 1].filter((s) => !(s & 0x88) && file(s) >= 5)
          .every((s) => { const c = at(pos, s); return c && colorOf(c) === side; });
      }
      const pressureBefore = {}; // enemy pawn square -> how many of your pieces attacked it
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const c = pos.pieceAt(f, r);
        if (c && lower(c) === 'p' && colorOf(c) === opp) pressureBefore[r * 16 + f] = attackersBefore(r * 16 + f);
      }

      pos.make(m);
      // Checks and promotions are tactics, not strategy.
      if (Core.movePromo(m) || pos.inCheck()) return [];
      const check = false;
      const mobAfter = t === 'k' || t === 'p' ? 0 : mobility(pos, to);
      const fileName = 'abcdefgh'[file(to)];
      const ownPawnsFile = pawnsOn(pos, file(to), side).length, oppPawnsFile = pawnsOn(pos, file(to), opp).length;

      if ((t === 'n' || t === 'b') && !capture && (rel(to) === 4 || rel(to) === 5) &&
          pos.attackersOf(to, side).some((a) => lower(at(pos, a)) === 'p') && safeFromPawns(pos, to, opp)) {
        out.push({ lesson: 'outpost', text: `puts the ${NAME[t]} on an outpost: ${sqn(to)} is protected by your pawn, and no ${SIDE[opp]} pawn can ever attack it` });
      }
      if (t === 'n' && !capture && file(to) >= 2 && file(to) <= 5 && rel(to) >= 2 && rel(to) <= 5 && (file(from) === 0 || file(from) === 7)) {
        out.push({ lesson: 'centralize', text: `brings the knight in from the edge: on ${sqn(to)} it reaches ${mobility(pos, to)} squares instead of ${mobBefore}` });
      }
      if ('nbr'.includes(t) && !capture && !check && lowest && own.length >= 2 && mobBefore <= 3 && mobAfter >= mobBefore + 3) {
        out.push({ lesson: 'worstPiece', text: `improves your least active piece: the ${NAME[t]} could reach ${mobBefore} square${mobBefore === 1 ? '' : 's'} from ${sqn(from)} and reaches ${mobAfter} from ${sqn(to)}` });
      }
      if (t === 'r' && !capture && file(to) !== file(from) && ownPawnsFile === 0 && rooksOnFile === 0) {
        out.push({ lesson: 'openFile', text: oppPawnsFile ? `puts the rook on the half-open ${fileName}-file, aiming at the ${SIDE[opp]} pawn on it` : `puts the rook on the open ${fileName}-file` });
      }
      if ((t === 'r' || t === 'q') && !capture && ownPawnsFile === 0 && (t === 'r' ? rooksOnFile + queenOnFile >= 1 : rooksOnFile >= 1) && file(to) !== file(from)) {
        out.push({ lesson: 'doubleRooks', text: t === 'r' ? `doubles your heavy pieces on the ${fileName}-file, so they support each other` : `lines the queen up with your rook on the ${fileName}-file: a battery` });
      }
      if (t === 'r' && rel(to) === 6 && (!capture || victim === 'p')) {
        let pawns = 0;
        for (let f = 0; f < 8; f++) { const c = pos.pieceAt(f, rank(to)); if (c && lower(c) === 'p' && colorOf(c) === opp) pawns++; }
        const kingBack = rank(enemyKing) === (side === 0 ? 7 : 0);
        if (pawns || kingBack) out.push({ lesson: 'seventh', text: `puts the rook on the ${side === 0 ? 'seventh' : 'second'} rank, where it attacks pawns on their starting squares${kingBack ? ' and boxes in the king' : ''}` });
      }
      if (t === 'p' && !capture && rel(to) >= 3 && isPassed(pos, to)) {
        out.push({ lesson: 'passedPawn', text: wasPassed ? `pushes the passed pawn to ${sqn(to)}: the further it goes, the more pieces it ties down` : `creates a passed pawn on ${sqn(to)}: no ${SIDE[opp]} pawn can stop it` });
      } else if (t === 'p' && capture && isPassed(pos, to) && !wasPassed) {
        out.push({ lesson: 'passedPawn', text: `creates a passed pawn on ${sqn(to)}: no ${SIDE[opp]} pawn can stop it` });
      }
      const lever = t === 'p' && !capture ? pos.attacksFrom(to).find((s) => { const c = at(pos, s); return c && lower(c) === 'p' && colorOf(c) === opp; }) : undefined;
      if (lever !== undefined && pos.fullmove >= 8 && minorsAndMajors(pos) >= 6 && !isPassed(pos, to)) {
        out.push({ lesson: 'pawnBreak', text: `is a pawn break: it attacks the pawn on ${sqn(lever)} to open lines for your pieces` });
      }
      if (t === 'p' && !capture && lever === undefined && 'cdef'.includes(sqn(to)[0]) && rel(to) === 4 && pos.fullmove >= 6) {
        const taken = pos.attacksFrom(to).filter((s) => !at(pos, s)).map(sqn);
        if (taken.length) out.push({ lesson: 'space', text: `gains space: the pawn on ${sqn(to)} takes ${taken.join(' and ')} away from ${SIDE[opp]}’s pieces` });
      }
      if ('nb'.includes(t) && !capture) {
        const front = to + (side === 0 ? 16 : -16); // where the enemy pawn stands, just in front of the blockader
        const c = !(front & 0x88) ? at(pos, front) : '';
        if (c && lower(c) === 'p' && colorOf(c) === opp && (isPassed(pos, front) || isIsolated(pos, front))) {
          out.push({ lesson: 'blockade', text: `blockades the ${isPassed(pos, front) ? 'passed' : 'isolated'} pawn on ${sqn(front)}: the pawn is stopped and can never attack the ${NAME[t]}` });
        }
      }
      if ('nbrq'.includes(t) && !capture) {
        for (const s of pos.attacksFrom(to)) {
          const c = at(pos, s);
          if (!c || lower(c) !== 'p' || colorOf(c) !== opp || !isIsolated(pos, s) || file(s) === 0 || file(s) === 7) continue;
          const now = pos.attackersOf(s, side).length;
          if (now >= 2 && now > (pressureBefore[s] || 0)) {
            out.push({ lesson: 'isolatedPawn', text: `adds a ${now === 2 ? 'second' : 'third'} attacker to the isolated pawn on ${sqn(s)}: with no pawns beside it, only pieces can defend it` });
            break;
          }
        }
      }
      if (t === 'p' && file(from) === 1 && lever !== undefined && file(lever) === 2) {
        const qs = (sd) => [0, 1, 2].reduce((n, f) => n + pawnsOn(pos, f, sd).length, 0);
        if (qs(side) < qs(opp)) out.push({ lesson: 'minority', text: `is the minority attack: ${qs(side)} queenside pawns against ${qs(opp)}, aiming to leave ${SIDE[opp]} with a weak pawn` });
      }
      if (t === 'p' && !capture && noLuft && enemyHeavy && file(from) >= 5 && Math.abs(file(from) - file(kingSq)) <= 1 && rel(to) === 2) {
        out.push({ lesson: 'luft', text: `gives your king an escape square, so a check on the back rank is no longer mate` });
      }
      if (t === 'p' && !capture && rel(to) >= 3) {
        const myWing = file(kingSq) <= 2 ? 'q' : file(kingSq) >= 5 ? 'k' : '';
        const theirWing = file(enemyKing) <= 2 ? 'q' : file(enemyKing) >= 5 ? 'k' : '';
        if (myWing && theirWing && myWing !== theirWing && Math.abs(file(to) - file(enemyKing)) <= 2) {
          out.push({ lesson: 'pawnStorm', text: `storms the ${SIDE[opp]} king: with the kings on opposite sides, these pawns are not shielding your own king` });
        }
      }
      if (capture && victim && 'nbrq'.includes(t) && VAL[victim] === VAL[t] && ahead >= 2 && pos.attackersOf(to, opp).length) {
        out.push({ lesson: 'tradeWhenAhead', text: `trades ${NAME[t]}s while you are ${ahead} points ahead: fewer pieces make your extra material count for more` });
      }
      return out;
    }

    return { detect, isPassed, isIsolated, safeFromPawns, mobility };
  }

  const api = { LESSONS, rules, LESSON_BY_ID: new Map(LESSONS.map((l) => [l.id, l])) };
  if (typeof window !== 'undefined') window.MyChessStrategyRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
