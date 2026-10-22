/*
 * Endgames mode: practise the basic endings against Stockfish at full strength,
 * with the coach commenting on every move.
 *
 * After each of your moves the coach combines two things:
 *  - Stockfish's verdict (mate distance, "still winning", "that loses", …), and
 *  - a technique comment read off the board: the size of the box the lone king
 *    is trapped in, king distance, the opposition, key squares, the Lucena
 *    "bridge", or the Philidor rook on the third rank.
 * Then it says what the next step of the method is.
 */
window.MyChessEndgames = (function () {
  'use strict';

  const STORE = 'mychess.endgames.v1';
  const DEPTH = 22, MOVETIME = 1500;
  const WIN_CP = 300; // a score this good (or a mate) counts as "winning"
  const DRAWISH_CP = 150; // dropping below this from a winning position means the win is gone
  const LOST_CP = -350; // a score this bad (or being mated) counts as "lost"

  const DRILLS = [
    {
      id: 'kqk', group: 'Basic mates', title: 'Queen mate', subtitle: 'King + queen vs king', goal: 'mate', user: 0, positions: 'Q',
      lesson: 'With king and queen against a lone king you can always force mate, usually in under ten moves.',
      method: [
        'Use the queen to shrink the king’s box. A knight’s move away from the enemy king takes away the most squares without giving check.',
        'Once the king is stuck on the edge, stop chasing it with the queen and bring your own king up.',
        'Mate with the queen right next to the enemy king, protected by your king, or along the edge in front of it.',
        'Before every move, check that the enemy king still has a move. No check and no moves is stalemate: a draw.',
      ],
    },
    {
      id: 'krk', group: 'Basic mates', title: 'Rook mate', subtitle: 'King + rook vs king', goal: 'mate', user: 0, positions: 'R',
      lesson: 'King and rook can always mate a lone king. It takes longer than with a queen (up to 16 moves) and needs your king’s help all the way.',
      method: [
        'Cut the king off with the rook along a rank or file.',
        'Walk your king towards the enemy king while the rook holds the line. Keep the rook far away so the king can’t attack it.',
        'When the enemy king is pushed back, use the opposition: kings facing each other with one square between them.',
        'With the kings facing each other and the enemy king on the edge, check along the edge: that’s mate. If they aren’t facing, make a waiting move with the rook along its line.',
      ],
    },
    {
      id: 'lucena', group: 'Rook endings', title: 'Lucena position', subtitle: 'Rook + pawn vs rook: win it', goal: 'promote', user: 0,
      positions: ['1K6/1P1k4/8/8/8/8/2r5/5R2 w - - 0 1', '6K1/4k1P1/8/8/8/8/5r2/2R5 w - - 0 1', '3K4/3P1k2/8/8/8/8/4r3/7R w - - 0 1'],
      lesson: 'Your pawn is on the 7th rank with your king in front of it, and the enemy king is cut off. This is a known win, but only with the right technique: building a bridge.',
      method: [
        'Make sure the enemy king is cut off from the pawn by at least one file. Check it away with the rook if needed.',
        'Put your rook on the 4th rank. That is the bridge.',
        'Step your king out from in front of the pawn, on the side away from the enemy king.',
        'The enemy rook checks from the side. Walk the king down towards your rook and block the check with it: the checks stop and the pawn queens.',
      ],
    },
    {
      id: 'philidor', group: 'Rook endings', title: 'Philidor position', subtitle: 'Rook vs rook + pawn: hold the draw', goal: 'draw', user: 1, holdMoves: 20,
      positions: ['4k3/R7/1r6/3KP3/8/8/8/8 b - - 0 1', '3k4/7R/6r1/3PK3/8/8/8/8 b - - 0 1'],
      lesson: 'You are a pawn down in a rook ending, with your king in front of the pawn. Philidor’s method holds the draw.',
      method: [
        'Keep your king on the queening square or right next to it.',
        'Keep your rook on your third rank (the 6th rank here), so the white king can’t come forward to it.',
        'Wait with the rook along that rank until the pawn moves up to the 6th.',
        'As soon as the pawn reaches the 6th, send your rook to the far end of the board and check the king from behind. With the pawn on the 6th, the king has nowhere to hide.',
      ],
    },
    {
      id: 'oppositionWin', group: 'Pawn endings', title: 'Opposition: win', subtitle: 'King + pawn vs king', goal: 'promote', user: 0,
      positions: ['8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', '8/8/3k4/8/8/3K4/3P4/8 w - - 0 1', '8/8/5k2/8/8/5K2/5P2/8 w - - 0 1'],
      lesson: 'King and pawn beat a lone king only if your king leads the way. Get your king to a key square, and use the opposition.',
      method: [
        'Walk your king in front of the pawn, not behind it. For a pawn on its 2nd to 4th rank, the key squares are the three squares two ranks in front of it.',
        'Opposition: kings facing each other with one square between them. The side that does not have to move holds the opposition.',
        'Push the pawn only when your king already controls the squares in front of it.',
        'If the enemy king takes the opposition, step round it to the side (outflank) instead of going back.',
      ],
    },
    {
      id: 'oppositionDraw', group: 'Pawn endings', title: 'Opposition: hold', subtitle: 'King vs king + pawn', goal: 'draw', user: 1, holdMoves: 12,
      positions: ['4k3/8/8/3K4/4P3/8/8/8 b - - 0 1', '3k4/8/8/4K3/3P4/8/8/8 b - - 0 1', '5k2/8/8/4K3/5P2/8/8/8 b - - 0 1'],
      lesson: 'Against king and pawn, stay in front of the pawn and take the opposition at the right moment, and it’s a draw.',
      method: [
        'Stay directly in front of the pawn when you can.',
        'When the enemy king comes close, take the opposition: face it with one square between you, so the other side has to move.',
        'Retreat straight back in front of the pawn, not to the side.',
        'If the pawn reaches the 7th with check, step onto the queening square or directly in front, never off to the side.',
      ],
    },
  ];
  const DRILL_BY_ID = new Map(DRILLS.map((d) => [d.id, d]));

  // ---------------------------------------------------------------- board helpers

  function helpers(Core) {
    const { Position } = Core;
    const fileOf = (sq) => sq & 7, rankOf = (sq) => sq >> 4;
    const cheb = (a, b) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
    const isEdge = (sq) => fileOf(sq) === 0 || fileOf(sq) === 7 || rankOf(sq) === 0 || rankOf(sq) === 7;
    const relRank = (sq, side) => (side === 0 ? rankOf(sq) : 7 - rankOf(sq)); // 0 = that side's own back rank
    const name = (sq) => Core.sqName(sq);

    function pieces(pos, side) {
      const out = [];
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const ch = pos.pieceAt(f, r);
        if (ch && (ch === ch.toUpperCase() ? 0 : 1) === side) out.push({ sq: r * 16 + f, type: ch.toLowerCase() });
      }
      return out;
    }
    const find = (pos, side, type) => pieces(pos, side).find((p) => p.type === type);

    // Squares the lone king can reach without walking into attacks: the "box" it is trapped in.
    function boxSize(pos, defender) {
      const p = new Position(pos.toFEN());
      const start = p.kingSq[defender];
      const attacker = defender ^ 1;
      p.board[start] = 0; // let the attackers' lines pass through the king's own square
      const seen = new Set([start]);
      const queue = [start];
      while (queue.length) {
        const s = queue.shift();
        for (const d of [1, -1, 16, -16, 15, 17, -15, -17]) {
          const t = s + d;
          if ((t & 0x88) || seen.has(t)) continue;
          const occ = p.board[t];
          if (occ && ((occ & 8) ? 1 : 0) === defender) continue;
          if (p.attacked(t, attacker)) continue; // includes defended attacker pieces
          seen.add(t);
          queue.push(t);
        }
      }
      return seen.size;
    }

    const opposition = (pos) => {
      const a = pos.kingSq[0], b = pos.kingSq[1];
      const df = Math.abs(fileOf(a) - fileOf(b)), dr = Math.abs(rankOf(a) - rankOf(b));
      return (df === 0 && dr === 2) || (dr === 0 && df === 2);
    };

    // Key squares of a (non-rook) pawn: reach one with your king and the pawn queens by force.
    function keySquares(pawnSq, side) {
      const f = fileOf(pawnSq), r = relRank(pawnSq, side);
      const ranks = r <= 3 ? [r + 2] : [r + 1, r + 2].filter((x) => x <= 7);
      const out = [];
      for (const rr of ranks) for (let ff = Math.max(0, f - 1); ff <= Math.min(7, f + 1); ff++) out.push((side === 0 ? rr : 7 - rr) * 16 + ff);
      return out;
    }

    const promoSquare = (pawnSq, side) => (side === 0 ? 7 : 0) * 16 + fileOf(pawnSq);

    // The textbook rook "box": the rectangle the rook's rank and file fence the lone king into.
    function rookBox(pos, defender) {
      const rook = find(pos, defender ^ 1, 'r');
      if (!rook) return 64;
      const k = pos.kingSq[defender];
      const rf = fileOf(rook.sq), rr = rankOf(rook.sq), kf = fileOf(k), kr = rankOf(k);
      const w = kf < rf ? rf : kf > rf ? 7 - rf : 8;
      const h = kr < rr ? rr : kr > rr ? 7 - rr : 8;
      return w * h;
    }

    // Lucena: is the defending king cut off from the pawn by the rook's file?
    function cutOff(pos, user) {
      const pawn = find(pos, user, 'p'), rook = find(pos, user, 'r');
      if (!pawn || !rook) return false;
      const pf = fileOf(pawn.sq), rf = fileOf(rook.sq), kf = fileOf(pos.kingSq[user ^ 1]);
      // The king must be strictly beyond the rook's file: a king standing on that file (in check) can still step either way.
      return Math.sign(rf - pf) === Math.sign(kf - pf) && rf !== pf && Math.abs(rf - pf) >= 2 && Math.abs(rf - pf) < Math.abs(kf - pf);
    }

    return { fileOf, rankOf, cheb, isEdge, relRank, name, pieces, find, boxSize, rookBox, cutOff, opposition, keySquares, promoSquare, parseSq: Core.parseSq };
  }

  // Random K+Q (or K+R) vs K with the lone king near the centre, White to move.
  function randomMatePosition(Core, piece) {
    const H = helpers(Core);
    const rnd = (n) => Math.floor(Math.random() * n);
    for (let i = 0; i < 2000; i++) {
      const bk = (2 + rnd(4)) * 16 + (2 + rnd(4));
      const wk = rnd(8) * 16 + rnd(8);
      const pc = rnd(8) * 16 + rnd(8);
      if (bk === wk || bk === pc || wk === pc || H.cheb(bk, wk) < 3 || H.cheb(bk, pc) <= 1) continue;
      const rows = [];
      for (let r = 7; r >= 0; r--) {
        let row = '', empty = 0;
        for (let f = 0; f < 8; f++) {
          const sq = r * 16 + f;
          const ch = sq === bk ? 'k' : sq === wk ? 'K' : sq === pc ? piece : '';
          if (!ch) { empty++; continue; }
          if (empty) { row += empty; empty = 0; }
          row += ch;
        }
        rows.push(row + (empty || ''));
      }
      const board = rows.join('/');
      const fen = `${board} w - - 0 1`;
      const pos = new Core.Position(fen);
      if (!pos.isLegalSetup()) continue;
      if (new Core.Position(`${board} b - - 0 1`).legalMoves().length < 3) continue;
      return fen;
    }
    return piece === 'Q' ? '8/8/8/3k4/8/8/8/K5Q1 w - - 0 1' : '8/8/8/3k4/8/8/8/K6R w - - 0 1';
  }

  // ---------------------------------------------------------------- Stockfish verdicts

  // after: analysis with the opponent to move; turn it round to the user's point of view.
  const userScore = (after) => (after && after.score ? (after.score.mate !== undefined ? { mate: -after.score.mate } : { cp: -after.score.cp }) : null);
  const isWin = (s) => !!s && ((s.mate !== undefined && s.mate > 0) || (s.cp !== undefined && s.cp >= WIN_CP));
  const isLost = (s) => !!s && ((s.mate !== undefined && s.mate <= 0) || (s.cp !== undefined && s.cp <= LOST_CP));

  function verdict(goal, before, after) {
    const s0 = before && before.score ? before.score : null;
    const s1 = userScore(after);
    if (goal === 'draw') {
      if (!isLost(s0) && isLost(s1)) return { kind: 'error', text: 'That loses.' };
      return { kind: 'ok', text: 'Still a draw.' };
    }
    const stillWinning = !!s1 && ((s1.mate !== undefined && s1.mate > 0) || (s1.cp !== undefined && s1.cp >= DRAWISH_CP));
    if (isWin(s0) && !stillWinning) return { kind: 'error', text: 'That throws away the win.' };
    if (s1 && s1.mate > 0) {
      if (s0 && s0.mate > 0) {
        const best = s0.mate - 1;
        return s1.mate <= best
          ? { kind: 'best', text: `Perfect: mate in ${s1.mate}.` }
          : { kind: 'ok', text: `Still winning, but slower: mate in ${s1.mate} (mate in ${best} was possible).` };
      }
      return { kind: 'best', text: `Stockfish now sees mate in ${s1.mate}.` };
    }
    return { kind: 'ok', text: 'Still winning.' };
  }

  // ---------------------------------------------------------------- technique comments

  const sideName = (s) => (s === 0 ? 'White' : 'Black');

  // What a move did in terms of the drill's technique. before/after: positions around the user's move.
  // allowCriticism is false when Stockfish rates the move as best: the coach never scolds a best move.
  function comment(drillId, H, before, after, uci, user, allowCriticism = true) {
    const opp = user ^ 1, oppName = sideName(opp).toLowerCase();
    const from = H.parseSq(uci.slice(0, 2));
    const moved = before.pieceAt(from & 7, from >> 4).toLowerCase();
    const parts = [];
    if (drillId === 'kqk' || drillId === 'krk') {
      const box = drillId === 'krk' ? H.rookBox : H.boxSize;
      const b0 = box(before, opp), b1 = box(after, opp);
      const d0 = H.cheb(before.kingSq[0], before.kingSq[1]), d1 = H.cheb(after.kingSq[0], after.kingSq[1]);
      if (b1 < b0 && b1 < 64) parts.push(`The ${oppName} king’s box shrank from ${b0} to ${b1} squares.`);
      else if (allowCriticism && !after.inCheck() && b1 < 56 && b1 > b0 + 3 && b1 > b0 * 1.25) parts.push(`That gave the ${oppName} king more room (${b0} → ${b1} squares).`);
      if (moved === 'k' && d1 < d0) parts.push(`Your king came closer (${d1} squares away).`);
      if (drillId === 'krk' && H.opposition(after) && H.isEdge(after.kingSq[opp])) parts.push('The kings now face each other.');
      const n = after.legalMoves().length;
      if (!after.inCheck() && n > 0 && n <= 2) parts.push(`Careful: the ${oppName} king has only ${n} move${n === 1 ? '' : 's'} left. Take the last one away without giving check and it’s stalemate.`);
    } else if (drillId === 'lucena') {
      const pawn = H.find(after, user, 'p'), rook0 = H.find(before, user, 'r'), rook1 = H.find(after, user, 'r');
      if (pawn && rook1) {
        const promo = H.promoSquare(pawn.sq, user);
        if (!H.cutOff(before, user) && H.cutOff(after, user)) parts.push(`Good: your rook cuts the ${oppName} king off from the pawn; it can’t cross the ${'abcdefgh'[H.fileOf(rook1.sq)]}-file.`);
        if (moved === 'r' && before.inCheck()) parts.push('That’s the bridge: your rook blocks the check, and the checks are over.');
        else if (moved === 'r' && H.relRank(rook1.sq, user) === 3 && !(rook0 && H.relRank(rook0.sq, user) === 3)) parts.push('Good: the rook is on the 4th rank. That’s the bridge, ready for later.');
        if (moved === 'k' && before.kingSq[user] === promo) parts.push('The king steps out from in front of the pawn. Expect checks from the side.');
      }
    } else if (drillId === 'philidor') {
      const pawn = H.find(after, opp, 'p'), rook0 = H.find(before, user, 'r'), rook1 = H.find(after, user, 'r');
      if (pawn && rook1) {
        const pawnRel = H.relRank(pawn.sq, opp);
        const third0 = rook0 && H.relRank(rook0.sq, user) === 2, third1 = H.relRank(rook1.sq, user) === 2;
        if (pawnRel <= 4) {
          if (third1) parts.push('Good: your rook guards your third rank, so the white king can’t come forward.');
          else if (third0 && allowCriticism) parts.push('Careful: your rook has left the third rank, so the white king may come up to the 6th.');
        } else if (H.relRank(rook1.sq, user) >= 6) parts.push('Right: with the pawn on the 6th, check from behind. The white king has no shelter.');
        else parts.push('The pawn is on the 6th now: send your rook to the far end and check from behind.');
        if (H.cheb(after.kingSq[user], H.promoSquare(pawn.sq, opp)) > 1) parts.push('Keep your king on or next to the queening square.');
      }
    } else if (drillId === 'oppositionWin') {
      const pawn0 = H.find(before, user, 'p'), pawn1 = H.find(after, user, 'p');
      if (pawn0 && pawn1) {
        const keys0 = H.keySquares(pawn0.sq, user), keys1 = H.keySquares(pawn1.sq, user);
        const on0 = keys0.includes(before.kingSq[user]), on1 = keys1.includes(after.kingSq[user]);
        if (moved === 'p' && !on0 && allowCriticism) parts.push('Pushing the pawn before your king reaches a key square lets the defender take the opposition.');
        if (on1 && !on0) parts.push(`Good: your king reached a key square (${H.name(after.kingSq[user])}). That wins with correct play.`);
        if (H.opposition(after)) parts.push(`You have the opposition: the ${oppName} king must give way.`);
      }
    } else if (drillId === 'oppositionDraw') {
      const pawn = H.find(after, opp, 'p');
      if (H.opposition(after)) parts.push(`You took the opposition: ${sideName(opp)} must give way.`);
      if (pawn && H.fileOf(after.kingSq[user]) === H.fileOf(pawn.sq) && H.relRank(after.kingSq[user], opp) > H.relRank(pawn.sq, opp)) parts.push('Your king is in front of the pawn, where it belongs.');
    }
    return parts.join(' ');
  }

  // The next step of the method, for the position with the user to move.
  function plan(drillId, H, pos, user) {
    const opp = user ^ 1, oppName = sideName(opp).toLowerCase();
    if (drillId === 'kqk' || drillId === 'krk') {
      const piece = H.find(pos, user, drillId === 'kqk' ? 'q' : 'r');
      if (piece && pos.attackersOf(piece.sq, opp).length && !pos.attackersOf(piece.sq, user).length) {
        return `Your ${drillId === 'kqk' ? 'queen' : 'rook'} is attacked. Move it away${drillId === 'krk' ? ' along its line so it keeps the king cut off' : ''}.`;
      }
      const box = H.boxSize(pos, opp), dist = H.cheb(pos.kingSq[0], pos.kingSq[1]);
      const edge = H.isEdge(pos.kingSq[opp]);
      if (drillId === 'kqk') {
        if (!edge && box > 6) return 'Keep shrinking the box with the queen. A knight’s move away from the king works well.';
        if (dist > 2) return 'The king is nearly trapped. Bring your own king closer: the queen can’t mate on its own.';
        return 'Your king is close enough. Look for the mate, and watch out for stalemate.';
      }
      if (H.rookBox(pos, opp) >= 40) return 'Cut the king off: put the rook on a rank or file next to the enemy king.';
      if (dist > 2) return 'Walk your king towards the enemy king. The rook holds the line.';
      if (edge && H.opposition(pos)) return 'The kings face each other with the enemy king on the edge. Check along the edge: that’s mate.';
      return 'Take the opposition with your king, or make a waiting move with the rook along its line so the enemy king has to step into opposition.';
    }
    if (drillId === 'lucena') {
      const pawn = H.find(pos, user, 'p'), rook = H.find(pos, user, 'r');
      if (!pawn || !rook) return 'Convert the advantage: you are winning.';
      const promo = H.promoSquare(pawn.sq, user);
      if (pos.inCheck()) return 'Walk the king towards your rook. When it is close, block the next check with the rook: that’s the bridge.';
      if (!H.cutOff(pos, user) && pos.kingSq[user] === promo) return `Cut the ${oppName} king off first: put your rook on a file between the king and your pawn, two files from the pawn.`;
      if (pos.kingSq[user] === promo && H.relRank(rook.sq, user) !== 3) return 'Build the bridge: put your rook on the 4th rank.';
      if (pos.kingSq[user] === promo) return `Now step out with the king, on the side away from the ${oppName} king.`;
      return 'Keep the king close to the pawn. Escape the checks towards your rook, then queen the pawn.';
    }
    if (drillId === 'philidor') {
      const pawn = H.find(pos, opp, 'p'), rook = H.find(pos, user, 'r');
      if (!pawn || !rook) return 'Hold on: this should be a draw.';
      if (H.relRank(pawn.sq, opp) <= 4) return 'Wait with the rook along your third rank and keep your king near the queening square.';
      if (H.relRank(rook.sq, user) < 6) return 'Drop the rook to the far end of the board and start checking from behind.';
      return 'Keep checking from behind. The king can’t escape the checks without giving up the pawn.';
    }
    if (drillId === 'oppositionWin') {
      const pawn = H.find(pos, user, 'p');
      if (!pawn) return 'Push on: you are winning.';
      const keys = H.keySquares(pawn.sq, user);
      if (!keys.includes(pos.kingSq[user])) return `Head for a key square: ${keys.map(H.name).join(', ')}.`;
      return 'Keep your king ahead of the pawn. Push the pawn when the squares in front of it are covered.';
    }
    if (drillId === 'oppositionDraw') return 'Stay in front of the pawn and take the opposition whenever the white king comes close.';
    return '';
  }

  // ---------------------------------------------------------------- the drill controller

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function create(api) {
    const { Core, coach, analyzer } = api;
    const H = helpers(Core);
    const el = api.panel;
    const stats = loadStats();
    let st = null;
    let token = 0;

    function loadStats() {
      const base = { drill: 'kqk', done: {}, best: {}, index: {} };
      try { return Object.assign(base, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { return base; }
    }
    function saveStats() {
      try { localStorage.setItem(STORE, JSON.stringify(stats)); } catch (e) { /* storage unavailable */ }
    }

    const analyse = (fen) => analyzer.analyse(fen, { depth: DEPTH, movetime: MOVETIME });

    function startingFen(drill, fresh) {
      if (typeof drill.positions === 'string') return randomMatePosition(Core, drill.positions);
      const n = drill.positions.length;
      let i = stats.index[drill.id] || 0;
      if (fresh) i = (i + 1) % n;
      stats.index[drill.id] = i;
      saveStats();
      return drill.positions[i];
    }

    async function start(drill, fen) {
      token++;
      const t = token;
      st = { drill, fen, user: drill.user, userMoves: 0, feed: [], before: null, startMate: null, plan: '', busy: true, done: false, success: '', error: null };
      api.load(fen, drill.user === 1);
      api.showEval(null);
      api.status(`You play ${sideName(drill.user)}`, 'Stockfish is looking at the position…', '');
      render();
      const r = await analyse(fen);
      if (t !== token) return;
      st.before = r;
      if (r && r.score && r.score.mate > 0) st.startMate = r.score.mate;
      st.plan = plan(drill.id, H, new Core.Position(fen), st.user);
      st.busy = false;
      api.showEval(r);
      api.status(`You play ${sideName(drill.user)}`, 'Your move.', '');
      render();
    }

    function canMove() {
      return !!st && !st.busy && !st.done && !st.error && api.side() === st.user;
    }

    function succeed(text) {
      st.done = true;
      st.busy = false;
      st.success = text;
      const id = st.drill.id;
      stats.done[id] = (stats.done[id] || 0) + 1;
      if (st.drill.goal === 'mate' && (!stats.best[id] || st.userMoves < stats.best[id])) stats.best[id] = st.userMoves;
      saveStats();
      api.status('Well done!', text, 'good');
      render();
    }

    function fail(text, best) {
      st.error = { text, best };
      st.busy = false;
      api.status('Not quite', 'Take the move back and try again.', 'warn');
      render();
    }

    async function onMovePlayed(mv, opts) {
      if (!st || (opts && opts.computer)) return;
      const t = token;
      const drill = st.drill, user = st.user;
      st.busy = true;
      st.userMoves++;
      const fens = api.fens();
      const fenBefore = fens[fens.length - 2], fenAfter = fens[fens.length - 1];
      const before = new Core.Position(fenBefore), after = new Core.Position(fenAfter);
      const num = before.side === 0 ? `${before.fullmove}.` : `${before.fullmove}…`;
      const entry = { num, san: mv.san, kind: 'ok', text: '' };
      st.feed.push(entry);
      render();

      const out = after.outcome();
      if (out) {
        if (out.reason === 'checkmate') {
          entry.kind = 'best'; entry.text = 'Checkmate!';
          succeed(drill.goal === 'mate'
            ? `Checkmate in ${st.userMoves} move${st.userMoves === 1 ? '' : 's'}.${st.startMate ? ` The fastest possible was ${st.startMate}.` : ''}`
            : 'Checkmate!');
          return;
        }
        if (drill.goal === 'draw') { entry.text = `Draw (${out.reason}).`; succeed(`Draw by ${out.reason}. You held it.`); return; }
        entry.kind = 'error';
        entry.text = out.reason === 'stalemate' ? 'Stalemate: the enemy king has no moves and isn’t in check. That’s a draw.' : `That’s a draw (${out.reason}).`;
        fail(entry.text, st.before && st.before.best);
        return;
      }
      if (drill.goal === 'draw' && !H.find(after, user ^ 1, 'p')) {
        entry.text = 'You won the pawn: nothing left to win for White.';
        succeed('You won the pawn, so it’s a draw. Well defended!');
        return;
      }

      const res = await analyse(fenAfter);
      if (t !== token) return;
      const v = verdict(drill.goal, st.before, res);
      const playedTopChoice = !!(st.before && st.before.best === mv.uci);
      const technique = comment(drill.id, H, before, after, mv.uci, user, v.kind !== 'best' && !playedTopChoice);
      if (playedTopChoice && v.kind === 'ok') { v.kind = 'best'; v.text = `Stockfish’s top choice. ${v.text}`; }
      // Above ten pawns Stockfish's number just means "won" (e.g. +91.7 in K+R v K), which the verdict already says.
      const huge = res && res.score.mate === undefined && Math.abs(res.score.cp) >= 1000;
      const evalText = res && !huge ? ` (Stockfish: ${coach.formatEval(res.score, after.side)})` : '';
      entry.kind = v.kind;
      entry.text = v.kind === 'error' ? `${v.text}${evalText}` : `${v.text}${evalText} ${technique}`.trim();
      api.showEval(res);
      if (v.kind === 'error') {
        let reason = drillReason(drill, after, res);
        if (!reason && st.before && res) {
          reason = coach.review({ fenBefore, fenAfter, uci: mv.uci, before: st.before, after: res, book: false, who: 'you' }).text;
        }
        fail(`${v.text}${evalText} ${reason}`.trim(), st.before && st.before.best);
        return;
      }
      if (drill.goal === 'promote' && mv.uci.length === 5) { succeed('You queened the pawn and kept the win. From here it’s a queen mate.'); return; }
      if (drill.goal === 'draw' && st.userMoves >= drill.holdMoves) { succeed(`You held the draw for ${drill.holdMoves} moves.`); return; }
      render();

      // Stockfish answers with the best defence (or the strongest attack, in the drawing drills).
      if (!res || !res.best) { st.busy = false; render(); return; }
      await new Promise((r) => setTimeout(r, 400));
      if (t !== token) return;
      const replyPos = new Core.Position(fenAfter);
      const reply = replyPos.moveFromUci(res.best);
      const replyNum = replyPos.side === 0 ? `${replyPos.fullmove}.` : `${replyPos.fullmove}…`;
      const replySan = reply ? replyPos.san(reply) : res.best;
      api.play(res.best);
      st.feed.push({ num: replyNum, san: replySan, opp: true });
      const now = new Core.Position(api.fens()[api.fens().length - 1]);
      const out2 = now.outcome();
      if (out2) {
        if (drill.goal === 'draw' && out2.reason !== 'checkmate') { succeed(`Draw by ${out2.reason}. You held it.`); return; }
        if (out2.reason === 'checkmate') { fail('You were checkmated.'); return; }
      }
      if (drill.goal === 'mate' && !H.find(now, user, drill.id === 'kqk' ? 'q' : 'r')) { fail(`Stockfish took your ${drill.id === 'kqk' ? 'queen' : 'rook'}. Without it there is no mate.`); return; }
      const next = await analyse(now.toFEN());
      if (t !== token) return;
      st.before = next;
      st.plan = plan(drill.id, H, now, user);
      st.busy = false;
      api.showEval(next);
      api.status(`You play ${sideName(user)}`, drill.goal === 'draw' ? `Held ${st.userMoves} of ${drill.holdMoves} moves.` : 'Your move.', '');
      render();
    }

    async function takeBack() {
      if (!st || st.busy) return;
      const t = token;
      if (st.error) {
        api.undoLast();
        st.error = null;
        st.userMoves--;
        st.feed.pop();
      } else if (!st.done && st.feed.length >= 2) {
        api.undoLast(); api.undoLast();
        st.userMoves--;
        st.feed.splice(-2, 2);
      } else return;
      st.busy = true;
      render();
      const fen = api.fens()[api.fens().length - 1];
      const r = await analyse(fen);
      if (t !== token) return;
      st.before = r;
      st.plan = plan(st.drill.id, H, new Core.Position(fen), st.user);
      st.busy = false;
      api.showEval(r);
      api.status(`You play ${sideName(st.user)}`, 'Your move.', '');
      render();
    }

    // Why a losing move fails, in the drill's own terms (the opposition drills), or '' to use the general coach.
    function drillReason(drill, afterPos, res) {
      if (!res || !res.best || (drill.id !== 'oppositionDraw' && drill.id !== 'oppositionWin')) return '';
      const p = new Core.Position(afterPos.toFEN());
      const m = p.moveFromUci(res.best);
      if (!m) return '';
      const san = p.san(m);
      p.make(m);
      if (drill.id === 'oppositionDraw') {
        return H.opposition(p) ? `After ${san}, White has the opposition and your king has to give way.` : `After ${san}, White’s king gets in front of its pawn.`;
      }
      return H.opposition(p) ? `After ${san}, Black takes the opposition and keeps your king off the key squares.` : `After ${san}, Black’s king blocks the way to the key squares.`;
    }

    // Explain a suggested move in the drill's terms first, falling back to the general coach.
    function explainSuggestion(fen, best) {
      const pos = new Core.Position(fen);
      const m = pos.moveFromUci(best);
      if (!m) return null;
      const san = pos.san(m);
      const afterPos = new Core.Position(fen);
      afterPos.make(afterPos.moveFromUci(best));
      const technique = comment(st.drill.id, H, pos, afterPos, best, st.user, false);
      if (technique) return { san, text: technique.replace(/^Good: /, '').replace(/^You took the opposition/, 'It takes the opposition').replace(/^Right: /, '') };
      const score = st.before ? coach.afterScore(st.before.score) : null;
      return { san, text: `It ${coach.describeMove(fen, best, st.before ? st.before.pv : [best], score)}.` };
    }

    function showBest() {
      const best = st && ((st.error && st.error.best) || (st.before && st.before.best));
      if (!best) return;
      const fen = st.error ? api.fens()[api.fens().length - 2] : api.fens()[api.fens().length - 1];
      const x = explainSuggestion(fen, best);
      if (!x) return;
      if (st.error) { takeBack().then(() => { api.arrow(best, 'best'); api.status(`You play ${sideName(st.user)}`, `Try ${x.san}. ${x.text}`, 'good'); }); return; }
      api.arrow(best, 'hint');
      api.status(`You play ${sideName(st.user)}`, `Stockfish suggests ${x.san}. ${x.text}`, 'good');
    }

    // ------------------------------------------------------------ panel

    function render() {
      const drill = st ? st.drill : DRILL_BY_ID.get(stats.drill) || DRILLS[0];
      const groups = [...new Set(DRILLS.map((d) => d.group))];
      const opts = groups.map((g) => `<optgroup label="${g}">` + DRILLS.filter((d) => d.group === g)
        .map((d) => `<option value="${d.id}"${d.id === drill.id ? ' selected' : ''}>${escapeHtml(d.title)}${stats.done[d.id] ? ' ✓' : ''}</option>`).join('') + '</optgroup>').join('');
      const goal = drill.goal === 'mate' ? `Checkmate the ${sideName(drill.user ^ 1).toLowerCase()} king.`
        : drill.goal === 'promote' ? 'Win: queen the pawn while keeping the win.'
          : `Hold the draw for ${drill.holdMoves} moves.`;

      let card = '';
      if (st) {
        if (st.success) card += `<p class="pz-result good">${escapeHtml(st.success)}</p>`;
        else if (st.error) card += `<p class="pz-wrong">${escapeHtml(st.error.text)}</p>`;
        else if (st.busy) card += '<p class="muted"><span class="spinner"></span>Stockfish is thinking…</p>';
        else if (st.plan) card += `<p class="tip"><strong>Next:</strong> ${escapeHtml(st.plan)}</p>`;
        if (drill.goal === 'draw' && !st.done) card += `<p class="muted small">Held ${st.userMoves} of ${drill.holdMoves} moves</p>`;
        if (drill.goal === 'mate' && st.startMate && !st.done) card += `<p class="muted small">Stockfish: mate in ${st.startMate} from the start. Moves so far: ${st.userMoves}.</p>`;
        const feed = st.feed.slice(-10);
        if (feed.length) {
          card += '<ol class="eg-feed">' + feed.map((f) => f.opp
            ? `<li class="theirs">${escapeHtml(f.num)} ${escapeHtml(f.san)}</li>`
            : `<li class="tone-${f.kind}"><strong>${escapeHtml(f.num)} ${escapeHtml(f.san)}</strong> ${escapeHtml(f.text || '…')}</li>`).join('') + '</ol>';
        }
        card += '<div class="review-actions">';
        if (st.done) card += '<button type="button" class="btn primary small" data-eg="new">New position</button><button type="button" class="btn small" data-eg="restart">Again</button>';
        else if (st.error) card += '<button type="button" class="btn small" data-eg="back">Take back</button><button type="button" class="btn small" data-eg="best">Show me</button>';
        else {
          card += `<button type="button" class="btn small" data-eg="hint"${canMove() ? '' : ' disabled'}>Hint</button>` +
            `<button type="button" class="btn small" data-eg="back"${st.busy || st.feed.length < 2 ? ' disabled' : ''}>Take back</button>` +
            '<button type="button" class="btn small" data-eg="restart">Restart</button><button type="button" class="btn small" data-eg="new">New position</button>';
        }
        card += '</div>';
      }

      const done = stats.done[drill.id] || 0;
      el.innerHTML =
        `<div class="field-row"><span>Drill</span><select id="egDrill">${opts}</select></div>` +
        `<div class="lesson-card"><p class="lesson-title">${escapeHtml(drill.title)} <span class="level">${escapeHtml(drill.subtitle)}</span></p>` +
        `<p><strong>Goal:</strong> ${escapeHtml(goal)} You play ${sideName(drill.user)}; Stockfish defends${drill.goal === 'draw' ? ' by attacking' : ''} at full strength.</p>` +
        `<p>${escapeHtml(drill.lesson)}</p>` +
        `<details class="method"${done ? '' : ' open'}><summary>The method</summary><ol>${drill.method.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ol></details></div>` +
        `<div class="puzzle-card">${card}</div>` +
        `<p class="pz-stats">Completed ${done} time${done === 1 ? '' : 's'}${stats.best[drill.id] ? ` · fastest mate: ${stats.best[drill.id]} moves` : ''}</p>`;
      api.refresh();
    }

    el.addEventListener('change', (e) => {
      if (e.target.id !== 'egDrill') return;
      stats.drill = e.target.value;
      saveStats();
      const d = DRILL_BY_ID.get(stats.drill);
      start(d, startingFen(d, false));
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !st) return;
      const a = b.dataset.eg;
      if (a === 'hint') showBest();
      else if (a === 'back') takeBack();
      else if (a === 'best') showBest();
      else if (a === 'restart') start(st.drill, st.fen);
      else if (a === 'new') start(st.drill, startingFen(st.drill, true));
    });

    return {
      enter() {
        const d = DRILL_BY_ID.get(stats.drill) || DRILLS[0];
        start(d, startingFen(d, false));
      },
      exit() { token++; st = null; },
      canMove,
      onMovePlayed,
    };
  }

  return { create, DRILLS, helpers, verdict, comment, plan, randomMatePosition };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = window.MyChessEndgames;
