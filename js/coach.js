/*
 * The coach: grades moves, explains them in plain words, and names openings.
 *
 * Grades use the win-chance model Lichess publishes: an engine score in
 * centipawns becomes a win percentage, and a move is judged by how much win
 * percentage it gives away (inaccuracy ≥ 5, mistake ≥ 10, blunder ≥ 15 points).
 * Explanations are built from the rules engine: hanging pieces, forks, material
 * won or lost along the engine's main line, development and so on.
 */
window.MyChessCoach = function (Core) {
  'use strict';

  const { Position } = Core;
  const OPENINGS = (typeof window !== 'undefined' && window.MYCHESS_OPENINGS) || {};
  const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

  // ---------------------------------------------------------------- openings

  // Main ideas, most specific first. Matched against the Lichess opening name.
  const IDEAS = [
    ['Najdorf', 'Black plays …a6 to keep White’s pieces off b5, then chooses between …e5 and …e6 with …b5. A flexible, fighting system.'],
    ['Dragon', 'Black fianchettoes the bishop on g7, where it bears down the long diagonal. White often castles long and storms with h4–h5; Black counterattacks on the queenside.'],
    ['Sveshnikov', 'Black plays an early …e5, accepting a hole on d5 for active pieces and dark-square control.'],
    ['Accelerated Dragon', 'Black fianchettoes before …d6, keeping the option of …d5 in one go.'],
    ['Alapin', 'White plays c3 to build a full pawn centre with d4, avoiding the sharpest Sicilian lines.'],
    ['Fried Liver', 'White sacrifices a knight on f7 to drag Black’s king into the open. Dangerous if Black is careless.'],
    ['Two Knights Defense', 'Black counterattacks e4 with …Nf6 instead of copying White’s Bc4, inviting sharp lines like Ng5.'],
    ['Giuoco Piano', 'The “quiet game”: both bishops aim at the opposing f-pawn. White either plays slowly with d3 or strikes in the centre with c3 and d4.'],
    ['Evans Gambit', 'White offers the b-pawn to gain time and build the centre with c3 and d4.'],
    ['Berlin Defense', 'Black counterattacks e4 with …Nf6. Famous for the solid “Berlin Wall” endgame where queens come off early.'],
    ['Marshall Attack', 'Black gives up a pawn with …d5 for a lasting attack against White’s king.'],
    ['Stafford Gambit', 'A trappy gambit: Black gives a pawn for quick piece play and traps if White grabs too greedily.'],
    ['Winawer', 'Black pins the c3-knight with …Bb4 and often gives the bishop for it, leaving White with doubled pawns but the bishop pair. Sharp and unbalanced.'],
    ['Advance Variation', 'White gains space with e5. Black attacks the pawn chain at its base (…c5, or …f6).'],
    ['Exchange Variation', 'An early pawn exchange opens the position and makes the structure symmetrical. Piece activity decides.'],
    ['London System', 'White develops the dark-squared bishop to f4 before playing e3, then builds a solid setup with c3, Nbd2 and Bd3.'],
    ['Catalan', 'White combines the Queen’s Gambit with a bishop on g2 that presses down the long diagonal toward Black’s queenside.'],
    ['Sicilian Defense', 'Black fights for d4 from the side with …c5, creating an unbalanced position. White often attacks on the kingside; Black counterattacks on the queenside along the half-open c-file.'],
    ['French Defense', 'Black builds a solid chain with …e6 and …d5. The c8-bishop can get stuck behind it, so Black hits back at White’s centre with …c5 and …f6.'],
    ['Caro-Kann Defense', 'Black supports …d5 with …c6 to challenge e4 while keeping a healthy pawn structure. The light-squared bishop usually comes out before …e6.'],
    ['Scandinavian Defense', 'Black challenges e4 at once with …d5. After the exchange the queen comes out early, so Black must not lose time with it.'],
    ['Alekhine Defense', 'Black’s knight invites White’s pawns forward, planning to attack the over-extended centre later.'],
    ['Pirc Defense', 'Black lets White build a big centre, then attacks it with a bishop on g7 and …c5 or …e5.'],
    ['Modern Defense', 'Black fianchettoes on g7 first and strikes at White’s centre later. Flexible but gives White space.'],
    ['Nimzowitsch Defense', 'Black meets 1.e4 with …Nc6, pressuring the centre with pieces rather than pawns.'],
    ['Ruy Lopez', 'White’s bishop on b5 pressures the knight that guards e5. The fight is about the centre: White aims for d4, Black holds e5.'],
    ['Italian Game', 'White’s bishop on c4 eyes f7, Black’s weakest square early on. White builds the centre with c3 and d4, or plays slowly with d3.'],
    ['Scotch Game', 'White opens the centre at once with d4, trading off the e5 pawn for free, quick piece play.'],
    ['Four Knights Game', 'Both sides develop knights first. A solid, symmetrical start where natural development matters most.'],
    ['Three Knights', 'Natural knight development; often transposes to the Four Knights.'],
    ['Petrov', 'Black mirrors White with …Nf6, counterattacking e4 instead of defending e5. Very solid.'],
    ['Philidor Defense', 'Black supports e5 with …d6. Solid but a little passive; White gets more space.'],
    ['Vienna', 'White develops the queen’s knight first, keeping the f2–f4 push in reserve.'],
    ['Bishop\'s Opening', 'An early Bc4 aims at f7 and keeps options of f4 or a quiet d3 setup.'],
    ['King\'s Gambit', 'White offers the f-pawn to deflect Black’s e-pawn and open the f-file for a fast attack. Sharp and risky for both sides.'],
    ['Danish Gambit', 'White gives up two pawns for rapid development and long diagonals aimed at Black’s king.'],
    ['Center Game', 'White recaptures on d4 with the queen. Quick, but the queen can be chased with …Nc6.'],
    ['Ponziani', 'White prepares d4 with c3 to build a broad pawn centre.'],
    ['Latvian Gambit', 'A risky gambit with …f5 that weakens Black’s king in return for the initiative.'],
    ['Queen\'s Gambit Declined', 'Black keeps a strong pawn on d5 with …e6. Very solid; Black’s main task is developing the c8-bishop.'],
    ['Queen\'s Gambit Accepted', 'Black takes the c4 pawn but rarely keeps it. The aim is free development while White builds a centre with e4 or e3.'],
    ['Semi-Slav', 'Black combines …c6 and …e6, a solid wall that can turn sharp if Black takes on c4 and expands with …b5.'],
    ['Slav Defense', 'Black supports d5 with …c6, keeping the c8-bishop free to develop to f5 or g4.'],
    ['Tarrasch Defense', 'Black accepts an isolated d-pawn in return for active pieces and open lines.'],
    ['King\'s Indian Attack', 'White sets up Nf3, g3, Bg2, O-O, d3 and e4, a system that often leads to a kingside attack.'],
    ['King\'s Indian Defense', 'Black lets White take the centre, castles quickly behind a bishop on g7, then strikes with …e5 or …c5. Often leads to attacks on opposite wings.'],
    ['Nimzo-Indian', 'Black pins the c3-knight with …Bb4 to control e4, often giving up the bishop to double White’s pawns.'],
    ['Queen\'s Indian', 'Black fianchettoes on b7 to control e4 and the long diagonal. Solid and flexible.'],
    ['Bogo-Indian', 'Black checks with …Bb4+ to ease development, often trading the dark-squared bishops.'],
    ['Neo-Grünfeld', 'A Grünfeld setup against a White fianchetto: Black hits the centre with …d5 and …c5.'],
    ['Grünfeld', 'Black lets White build a big pawn centre, then attacks it with …d5, …Bg7 and …c5.'],
    ['Benko Gambit', 'Black sacrifices a queenside pawn to open the a- and b-files for long-lasting pressure.'],
    ['Benoni', 'Black concedes space in the centre in return for a queenside pawn majority and an active bishop on g7.'],
    ['Dutch Defense', 'Black plays …f5 to fight for e4 and prepare kingside play, at the cost of loosening the king a little.'],
    ['Old Indian', 'Black supports …e5 with …d6 and …Nbd7. Solid but a little cramped.'],
    ['Trompowsky', 'White’s early Bg5 attacks the f6-knight, aiming to unbalance the game from move two.'],
    ['Torre Attack', 'White pins the f6-knight with Bg5 inside a solid d4, Nf3, e3 setup.'],
    ['Blackmar-Diemer', 'White gives a pawn with e4 and f3 to open lines for a quick attack.'],
    ['Englund Gambit', 'A trappy but unsound gambit with 1…e5 against 1.d4.'],
    ['English Opening', 'White starts with c4, controlling d5 from the side. Flexible: it often becomes a reversed Sicilian or transposes into queen’s pawn openings.'],
    ['Réti', 'White develops with Nf3 and c4, pressing on the centre from the flanks instead of occupying it.'],
    ['Zukertort', '1.Nf3 develops a piece, watches e5 and d4, and keeps every option open.'],
    ['Bird Opening', '1.f4 controls e5 and prepares a kingside setup, like a Dutch Defense with an extra move.'],
    ['Polish Opening', '1.b4 grabs queenside space and prepares Bb2. Unusual and a little loose.'],
    ['Nimzo-Larsen', '1.b3 prepares Bb2 to pressure the long diagonal.'],
    ['Hungarian Opening', '1.g3 prepares a bishop on g2.'],
    ['Van Geet', '1.Nc3 develops a knight and keeps both e4 and d4 available.'],
    ['Grob', '1.g4 is aggressive but weakening; good replies strike the centre at once.'],
    ['Queen\'s Pawn Game', 'A 1.d4 opening without an early c4: usually a solid system built around central control.'],
    ['Indian Defense', '1…Nf6 controls e4 without committing a pawn; Black decides on a setup later.'],
    ['King\'s Pawn Game', 'A 1.e4 opening that has not yet reached a named main line. Keep developing toward the centre.'],
  ];
  const ECO_IDEAS = {
    A: 'A flank opening: the centre is controlled from the side with pawns and pieces rather than occupied straight away.',
    B: 'A semi-open game: Black answers 1.e4 with something other than …e5, aiming for an unbalanced fight.',
    C: 'An open game (1.e4 e5) or French Defense: quick development and central control are what count.',
    D: 'A closed game (1.d4 d5): slower manoeuvring around the central pawns.',
    E: 'An Indian defence: Black controls the centre with pieces first, often with a fianchetto.',
  };
  const START_ADVICE = 'Opening principles: control the centre with pawns and pieces, develop your knights and bishops, castle early, and avoid moving the same piece twice.';

  const lookup = (key) => (Object.prototype.hasOwnProperty.call(OPENINGS, key) ? OPENINGS[key] : undefined);

  function ideaFor(name, eco) {
    for (const [k, text] of IDEAS) if (name.includes(k)) return text;
    return ECO_IDEAS[eco[0]] || '';
  }

  // keys: position keys from the starting position (index 0) to now.
  function openingForLine(keys) {
    for (let i = keys.length - 1; i >= 1; i--) {
      const v = lookup(keys[i]);
      if (v) {
        return { eco: v[0], name: v[1], ply: i, inBook: lookup(keys[keys.length - 1]) !== undefined, idea: ideaFor(v[1], v[0]) };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- scores

  function winPct(score) {
    if (!score) return 50;
    if (score.mate !== undefined && score.mate !== null) return score.mate > 0 ? 100 : 0;
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * score.cp)) - 1);
  }

  // Lichess's per-move accuracy formula.
  function accuracyFromLoss(loss) {
    return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  }

  function whiteScore(score, sideToMove) {
    if (!score) return { cp: 0 };
    const s = sideToMove === 0 ? 1 : -1;
    return score.mate !== undefined ? { mate: s * score.mate, matedSide: score.mate === 0 ? sideToMove : null } : { cp: s * score.cp };
  }

  function formatEval(score, sideToMove) {
    const w = whiteScore(score, sideToMove);
    if (w.mate !== undefined) {
      if (w.mate === 0) return w.matedSide === 0 ? '0-1' : '1-0';
      return (w.mate > 0 ? '+M' : '−M') + Math.abs(w.mate);
    }
    const v = w.cp / 100;
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
  }

  // White's win percentage, for the evaluation bar.
  function whiteWinPct(score, sideToMove) {
    const p = winPct(score);
    return sideToMove === 0 ? p : 100 - p;
  }

  const GRADES = {
    book: { label: 'Book', symbol: '', tone: 'book' },
    best: { label: 'Best', symbol: '!', tone: 'best' },
    excellent: { label: 'Excellent', symbol: '', tone: 'good' },
    good: { label: 'Good', symbol: '', tone: 'good' },
    inaccuracy: { label: 'Inaccuracy', symbol: '?!', tone: 'inaccuracy' },
    mistake: { label: 'Mistake', symbol: '?', tone: 'mistake' },
    blunder: { label: 'Blunder', symbol: '??', tone: 'blunder' },
  };
  const ORDER = ['book', 'best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const worse = (a, b) => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

  // ---------------------------------------------------------------- board helpers

  const chAt = (pos, sq) => pos.pieceAt(sq & 7, sq >> 4);
  const colorOf = (ch) => (ch === ch.toUpperCase() ? 0 : 1);
  const nameOf = (ch) => NAME[ch.toLowerCase()];
  const valOf = (ch) => VAL[ch.toLowerCase()];
  const sqn = Core.sqName;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function eachPiece(pos, side, fn) {
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const ch = pos.pieceAt(f, r);
        if (ch && colorOf(ch) === side) fn(r * 16 + f, ch);
      }
    }
  }

  // Pieces of `side` that the opponent can win: attacked and undefended, or attacked by something cheaper.
  function hangingPieces(pos, side) {
    const out = [];
    eachPiece(pos, side, (sq, ch) => {
      if (ch.toLowerCase() === 'k') return;
      const attackers = pos.attackersOf(sq, side ^ 1);
      if (!attackers.length) return;
      const defended = pos.attackersOf(sq, side).length > 0;
      const cheapest = Math.min(...attackers.map((a) => valOf(chAt(pos, a))));
      if (!defended || cheapest < valOf(ch)) out.push({ sq, ch, defended, cheapest });
    });
    return out;
  }

  // Valuable enemy pieces the piece on `sq` attacks (king, undefended pieces, or pieces worth more).
  function forkTargets(pos, sq) {
    const ch = chAt(pos, sq);
    if (!ch) return [];
    const side = colorOf(ch), out = [];
    for (const t of pos.attacksFrom(sq)) {
      const v = chAt(pos, t);
      if (!v || colorOf(v) === side) continue;
      const lower = v.toLowerCase();
      if (lower === 'p') continue;
      if (lower === 'k' || valOf(v) > valOf(ch) || pos.attackersOf(t, side ^ 1).length === 0) out.push({ sq: t, ch: v });
    }
    out.sort((a, b) => valOf(b.ch) - valOf(a.ch));
    return out;
  }

  // Play a line of UCI moves; returns the material change for `side` (in pawns) and the SAN of each move.
  function playLine(fen, line, side, maxPlies) {
    const pos = new Position(fen);
    const start = pos.material();
    const sans = [];
    let plies = 0;
    for (const uci of line) {
      if (plies >= maxPlies) {
        // Do not stop in the middle of an exchange.
        const m = pos.moveFromUci(uci);
        if (!m || !(m & Core.FLAG_CAPTURE) || plies >= maxPlies + 2) break;
      }
      const m = pos.moveFromUci(uci);
      if (!m) break;
      sans.push(pos.san(m));
      pos.make(m);
      plies++;
    }
    const delta = pos.material() - start;
    return { swing: side === 0 ? delta : -delta, sans };
  }

  function lineText(fen, line, max) {
    const pos = new Position(fen);
    let out = '';
    for (let i = 0; i < Math.min(line.length, max); i++) {
      const m = pos.moveFromUci(line[i]);
      if (!m) break;
      if (pos.side === 0) out += `${pos.fullmove}. `;
      else if (i === 0) out += `${pos.fullmove}… `;
      out += pos.san(m) + ' ';
      pos.make(m);
    }
    return out.trim();
  }

  function sanOf(fen, uci) {
    const pos = new Position(fen);
    const m = pos.moveFromUci(uci);
    return m ? pos.san(m) : uci;
  }

  // ---------------------------------------------------------------- describing moves

  // The score after the best move, from the opponent's side, given the score before it: mate in N
  // becomes "mated in N - 1", and centipawns flip sign.
  function afterScore(score) {
    if (!score) return null;
    if (score.mate === undefined) return { cp: -score.cp };
    return { mate: score.mate > 0 ? -(score.mate - 1) : -score.mate };
  }

  // A short phrase saying what a move achieves, e.g. "wins the knight on e5".
  // line: the engine's continuation starting with this move; scoreAfter: the engine's score of the
  // position after the move, from the opponent's side (as Stockfish reports it). Use afterScore() to
  // turn the score before the best move into this form.
  function describeMove(fen, uci, line, scoreAfter) {
    const pos = new Position(fen);
    const side = pos.side;
    const m = pos.moveFromUci(uci);
    if (!m) return '';
    const from = Core.moveFrom(m), to = Core.moveTo(m);
    const mover = chAt(pos, from);
    const victim = m & Core.FLAG_EP ? (side === 0 ? 'p' : 'P') : chAt(pos, to);
    const hangBefore = hangingPieces(pos, side);
    const { swing } = playLine(fen, line && line[0] === uci ? line : [uci].concat(line || []), side, 6);

    pos.make(m);
    const check = pos.inCheck();
    if (check && pos.legalMoves().length === 0) return 'delivers checkmate';
    const withCheck = check ? ' with check' : '';
    if (scoreAfter && scoreAfter.mate !== undefined && scoreAfter.mate < 0) {
      return `starts a forced mate in ${1 - scoreAfter.mate}`; // mated in N more moves after this one: N + 1 in all
    }
    if (m & Core.FLAG_CASTLE) return 'castles, tucking the king away and connecting the rooks';
    if (Core.movePromo(m)) return `promotes the pawn to a ${NAME[' kqbnr'[Core.movePromo(m)]]}${withCheck}`;
    if (victim) {
      if (swing >= 1) return `wins ${Math.abs(swing - valOf(victim)) < 1 ? `the ${nameOf(victim)} on ${sqn(to)}` : `material (+${swing})`}${withCheck}`;
      if (swing > -1) return `trades on ${sqn(to)}${withCheck}`;
      return `takes the ${nameOf(victim)} on ${sqn(to)}${withCheck}`;
    }
    if (swing >= 2) return `sets up winning material (+${swing})${withCheck}`;
    const fork = forkTargets(pos, to);
    if (fork.length >= 2) return `forks the ${nameOf(fork[0].ch)} and ${nameOf(fork[1].ch)}`;
    if (hangBefore.some((h) => h.sq === from)) return `moves the ${nameOf(mover)} out of danger${withCheck}`;
    const hangAfter = hangingPieces(pos, side);
    const saved = hangBefore.find((h) => h.sq !== from && !hangAfter.some((x) => x.sq === h.sq));
    if (saved) return `protects the ${nameOf(saved.ch)} on ${sqn(saved.sq)}`;
    if (check) return 'gives check';
    if (fork.length === 1 && fork[0].ch.toLowerCase() !== 'k') return `attacks the ${nameOf(fork[0].ch)} on ${sqn(fork[0].sq)}`;
    const t = mover.toLowerCase(), fromRank = from >> 4, home = side === 0 ? 0 : 7;
    if ((t === 'n' || t === 'b') && fromRank === home && pos.fullmove <= 15) return `develops the ${nameOf(mover)}`;
    if (t === 'p' && 'de'.includes(sqn(to)[0]) && [3, 4].includes(to >> 4) && pos.fullmove <= 12) return 'claims space in the centre';
    if (t === 'p' && isPassedPawn(pos, to)) {
      const before = new Position(fen);
      return isPassedPawn(before, from) ? `pushes the passed pawn to ${sqn(to)}` : `creates a passed pawn on ${sqn(to)}`;
    }
    if (t === 'r' && pos.attacksFrom(to).length >= 10) return 'puts the rook on an open line';
    if (t === 'k' && isEndgame(pos)) return 'activates the king, a strong piece in the endgame';
    return 'improves the position';
  }

  // A pawn with no enemy pawns ahead of it on its own or neighbouring files.
  function isPassedPawn(pos, sq) {
    const ch = chAt(pos, sq);
    if (!ch || ch.toLowerCase() !== 'p') return false;
    const side = colorOf(ch), f = sq & 7, r = sq >> 4;
    const enemy = side === 0 ? 'p' : 'P';
    for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) {
      for (let rr = 0; rr < 8; rr++) {
        const ahead = side === 0 ? rr > r : rr < r;
        if (ahead && pos.pieceAt(ff, rr) === enemy) return false;
      }
    }
    return true;
  }

  // Few pieces left besides kings and pawns.
  function isEndgame(pos) {
    let pieces = 0;
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const ch = pos.pieceAt(f, r); if (ch && !'kKpP'.includes(ch)) pieces++; }
    return pieces <= 2;
  }

  // Why a move went wrong, using the engine's best reply (`after.pv`, opponent to move).
  function whyBad(fenAfter, after, mover, who) {
    const your = who === 'you' ? 'your' : `${who}’s`;
    const opp = who === 'you' ? 'your opponent' : (who === 'White' ? 'Black' : 'White');
    const pos = new Position(fenAfter);
    const reply = after.pv && after.pv[0];
    const replyMove = reply ? pos.moveFromUci(reply) : 0;
    const replySan = replyMove ? pos.san(replyMove) : '';
    if (after.score && after.score.mate > 0) {
      return `it allows mate in ${after.score.mate}${replySan ? `, starting with ${replySan}` : ''}`;
    }
    const hangs = hangingPieces(pos, mover);
    if (replyMove) {
      const to = Core.moveTo(replyMove);
      const target = hangs.find((h) => h.sq === to);
      if (target) {
        return `it leaves ${your} ${nameOf(target.ch)} on ${sqn(to)} ${target.defended ? 'attacked by a cheaper piece' : 'unprotected'}, so ${opp} can take it with ${replySan}`;
      }
      pos.make(replyMove);
      const fork = forkTargets(pos, to).filter((f) => colorOf(f.ch) === mover);
      pos.unmake();
      if (fork.length >= 2) return `${opp} can answer ${replySan}, forking ${your} ${nameOf(fork[0].ch)} and ${nameOf(fork[1].ch)}`;
    }
    const { swing } = playLine(fenAfter, after.pv || [], mover, 6);
    if (swing <= -2) return `after ${replySan} ${who === 'you' ? 'you lose' : `${who} loses`} material (${-swing} points)`;
    if (hangs.length) return `${your} ${nameOf(hangs[0].ch)} on ${sqn(hangs[0].sq)} is left loose`;
    if (replySan) return `${opp} gets the better game after ${replySan}`;
    return 'it gives away part of the advantage';
  }

  // Opening principles that a move goes against (only for the early game).
  function principleTip(fenBefore, uci) {
    const pos = new Position(fenBefore);
    const m = pos.moveFromUci(uci);
    if (!m || pos.fullmove > 12) return '';
    const from = Core.moveFrom(m), side = pos.side;
    const ch = chAt(pos, from), t = ch.toLowerCase();
    const capture = !!(m & Core.FLAG_CAPTURE);
    const home = side === 0 ? 0 : 7;
    if (t === 'q' && !capture && pos.fullmove <= 8) return 'Bringing the queen out early lets your opponent gain time by attacking it. Develop your knights and bishops first.';
    if (t === 'k' && !(m & Core.FLAG_CASTLE)) return 'Moving the king gives up castling. Castle early to keep the king safe and bring your rooks into play.';
    if ((t === 'n' || t === 'b') && (from >> 4) !== home && !capture && !hangingPieces(pos, side).some((h) => h.sq === from)) {
      return 'Try to move each piece once in the opening before moving one twice.';
    }
    if (t === 'p' && 'ah'.includes(sqn(from)[0]) && pos.fullmove <= 6) return 'Edge-pawn moves do little in the opening. Fight for the centre with your d- and e-pawns.';
    const castleRights = side === 0 ? (pos.castle & 3) : (pos.castle & 12);
    if (pos.fullmove >= 10 && castleRights && !(m & Core.FLAG_CASTLE)) return 'Your king is still in the centre. Think about castling soon.';
    return '';
  }

  // ---------------------------------------------------------------- reviewing a move

  // a: { fenBefore, fenAfter, uci, before, after, book, opening, who }
  // before/after: analyses of the positions before and after the move (scores from the side to move).
  function review(a) {
    const pos = new Position(a.fenBefore);
    const mover = pos.side;
    const m = pos.moveFromUci(a.uci);
    const san = m ? pos.san(m) : a.uci;
    const number = mover === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`;
    const winBefore = winPct(a.before.score);
    const winAfter = 100 - winPct(a.after.score);
    const loss = Math.max(0, winBefore - winAfter);
    const playedBest = a.before.best === a.uci;

    // A named opening move only counts as "Book" if it does not give much away;
    // dubious named lines (the Grob, say) still get a real grade.
    const book = !!a.book && loss < 5;
    const dubiousBook = !!a.book && !book;
    let kind;
    if (book) kind = 'book';
    else if (playedBest || loss <= 0.5) kind = 'best';
    else if (loss < 2) kind = 'excellent';
    else if (loss < 5) kind = 'good';
    else if (loss < 10) kind = 'inaccuracy';
    else if (loss < 15) kind = 'mistake';
    else kind = 'blunder';

    const beforeMate = a.before.score && a.before.score.mate;
    const afterMate = a.after.score && a.after.score.mate;
    const allowsMate = afterMate > 0 && !(beforeMate < 0);
    const missedMate = beforeMate > 0 && !(afterMate < 0 || afterMate === 0);
    if (!book && allowsMate) kind = 'blunder';
    if (!book && missedMate) kind = worse(kind, 'inaccuracy');

    const g = GRADES[kind];
    const who = a.who || 'you';
    const res = {
      kind, label: g.label, symbol: g.symbol, tone: g.tone, san, number, loss,
      accuracy: book ? null : accuracyFromLoss(loss),
      evalBefore: formatEval(a.before.score, mover),
      evalAfter: formatEval(a.after.score, mover ^ 1),
      text: '', better: null, tip: '',
    };

    const bestUci = a.before.best;
    const bestSan = bestUci ? sanOf(a.fenBefore, bestUci) : '';
    const scoreAfterBest = afterScore(a.before.score);
    const playedIdea = describeMove(a.fenBefore, a.uci, [a.uci].concat(a.after.pv || []), a.after.score);

    if (kind === 'book') {
      res.text = a.opening ? `A known opening move: this is the ${a.opening.name}.` : 'A known opening move.';
    } else if (kind === 'best') {
      res.text = `${playedBest ? 'The engine’s top choice' : 'As good as the engine’s top choice'}: it ${playedIdea}.`;
    } else if (kind === 'excellent' || kind === 'good') {
      res.text = `${kind === 'excellent' ? 'Nearly the best move' : 'A reasonable move'}: it ${playedIdea}.`;
      if (bestUci && bestUci !== a.uci) {
        res.better = { uci: bestUci, san: bestSan, why: describeMove(a.fenBefore, bestUci, a.before.pv, scoreAfterBest), line: lineText(a.fenBefore, a.before.pv || [bestUci], 6) };
      }
    } else {
      let why = whyBad(a.fenAfter, a.after, mover, who);
      if (missedMate && !allowsMate) why = `you had a forced mate in ${beforeMate} and let it slip`;
      res.text = `${cap(why)}.`;
      if (bestUci) {
        res.better = { uci: bestUci, san: bestSan, why: describeMove(a.fenBefore, bestUci, a.before.pv, scoreAfterBest), line: lineText(a.fenBefore, a.before.pv || [bestUci], 6) };
      }
    }
    if (dubiousBook && a.opening) res.text = `This is the ${a.opening.name}, a known line but not a good one. ${res.text}`;
    if (who === 'you' && kind !== 'book' && kind !== 'best') res.tip = principleTip(a.fenBefore, a.uci);
    return res;
  }

  return {
    review, openingForLine, isBook: (key) => lookup(key) !== undefined, ideaFor, START_ADVICE,
    winPct, whiteWinPct, formatEval, accuracyFromLoss, GRADES,
    describeMove, afterScore, hangingPieces, forkTargets, principleTip, lineText,
  };
};

if (typeof module !== 'undefined' && module.exports) module.exports = window.MyChessCoach;
