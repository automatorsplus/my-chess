/*
 * MyChess core: chess rules + computer opponent.
 *
 * Everything lives inside one self-contained function so the same source can
 * run on the page (for move legality, notation and game-end checks) and be
 * stringified into a Web Worker (for the search), much like Apple's Chess runs
 * its Sjeng engine as a separate process next to the window.
 */
function MyChessCore() {
  'use strict';

  // ---------------------------------------------------------------------------
  // Pieces and squares
  // ---------------------------------------------------------------------------

  // Piece codes follow the lookup table seen in Apple's Chess binary,
  // " KQBNRP  kqbnrp ": K=1 Q=2 B=3 N=4 R=5 P=6, and black adds 8.
  const KING = 1, QUEEN = 2, BISHOP = 3, KNIGHT = 4, ROOK = 5, PAWN = 6;
  const BLACK_BIT = 8;
  const WHITE = 0, BLACK = 1;
  const PIECE_CHARS = ' KQBNRP  kqbnrp ';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  // 0x88 board: index = rank * 16 + file, a1 = 0, h8 = 119.
  const sqName = (sq) => 'abcdefgh'[sq & 7] + ((sq >> 4) + 1);
  const parseSq = (s) => (s.charCodeAt(0) - 97) + ((s.charCodeAt(1) - 49) << 4);

  // Moves are packed into one integer.
  const FLAG_CAPTURE = 1 << 17, FLAG_EP = 1 << 18, FLAG_CASTLE = 1 << 19, FLAG_DOUBLE = 1 << 20;
  const encode = (from, to, promo, flags) => from | (to << 7) | (promo << 14) | flags;
  const moveFrom = (m) => m & 127;
  const moveTo = (m) => (m >> 7) & 127;
  const movePromo = (m) => (m >> 14) & 7;

  const KNIGHT_D = [33, 31, 18, 14, -33, -31, -18, -14];
  const KING_D = [1, -1, 16, -16, 15, 17, -15, -17];
  const BISHOP_D = [15, 17, -15, -17];
  const ROOK_D = [1, -1, 16, -16];

  // Castling rights: 1 = white king side, 2 = white queen side, 4 = black king side, 8 = black queen side.
  const castleMask = new Int8Array(128).fill(15);
  castleMask[0] = 15 & ~2; castleMask[4] = 15 & ~3; castleMask[7] = 15 & ~1;
  castleMask[112] = 15 & ~8; castleMask[116] = 15 & ~12; castleMask[119] = 15 & ~4;

  // ---------------------------------------------------------------------------
  // Zobrist hashing (two 32-bit halves) for repetition checks and the hash table
  // ---------------------------------------------------------------------------

  let seed = 0x2545f491;
  function rnd32() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) | 0;
  }
  const ZP_LO = new Int32Array(16 * 128), ZP_HI = new Int32Array(16 * 128);
  for (let i = 0; i < 16 * 128; i++) { ZP_LO[i] = rnd32(); ZP_HI[i] = rnd32(); }
  const ZC_LO = new Int32Array(16), ZC_HI = new Int32Array(16);
  for (let i = 0; i < 16; i++) { ZC_LO[i] = rnd32(); ZC_HI[i] = rnd32(); }
  const ZEP_LO = new Int32Array(8), ZEP_HI = new Int32Array(8);
  for (let i = 0; i < 8; i++) { ZEP_LO[i] = rnd32(); ZEP_HI[i] = rnd32(); }
  const ZSIDE_LO = rnd32(), ZSIDE_HI = rnd32();

  // ---------------------------------------------------------------------------
  // Position: board state, move generation, make/unmake
  // ---------------------------------------------------------------------------

  function Position(fen) {
    this.board = new Int8Array(128);
    this.count = new Int8Array(16);
    this.kingSq = [4, 116];
    this.side = WHITE;
    this.castle = 0;
    this.ep = -1;
    this.halfmove = 0;
    this.fullmove = 1;
    this.hashLo = 0;
    this.hashHi = 0;
    this.sp = 0;
    this.undo = [];
    this.histLo = [];
    this.histHi = [];
    this.setFEN(fen || START_FEN);
  }

  Position.prototype.setFEN = function (fen) {
    const parts = fen.trim().split(/\s+/);
    const b = this.board;
    b.fill(0);
    this.count.fill(0);
    let rank = 7, file = 0;
    for (const ch of parts[0]) {
      if (ch === '/') { rank--; file = 0; continue; }
      if (ch >= '1' && ch <= '8') { file += ch.charCodeAt(0) - 48; continue; }
      const idx = PIECE_CHARS.indexOf(ch);
      if (idx <= 0) throw new Error('Bad FEN piece: ' + ch);
      const sq = rank * 16 + file;
      b[sq] = idx;
      this.count[idx]++;
      if ((idx & 7) === KING) this.kingSq[idx & BLACK_BIT ? BLACK : WHITE] = sq;
      file++;
    }
    this.side = parts[1] === 'b' ? BLACK : WHITE;
    this.castle = 0;
    const c = parts[2] || '-';
    if (c.includes('K')) this.castle |= 1;
    if (c.includes('Q')) this.castle |= 2;
    if (c.includes('k')) this.castle |= 4;
    if (c.includes('q')) this.castle |= 8;
    this.ep = parts[3] && parts[3] !== '-' ? parseSq(parts[3]) : -1;
    this.halfmove = parseInt(parts[4] || '0', 10) || 0;
    this.fullmove = parseInt(parts[5] || '1', 10) || 1;
    this.computeHash();
    this.sp = 0;
    this.histLo = [this.hashLo];
    this.histHi = [this.hashHi];
  };

  Position.prototype.computeHash = function () {
    let lo = 0, hi = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this.board[sq];
      if (p) { lo ^= ZP_LO[p * 128 + sq]; hi ^= ZP_HI[p * 128 + sq]; }
    }
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    if (this.ep >= 0) { lo ^= ZEP_LO[this.ep & 7]; hi ^= ZEP_HI[this.ep & 7]; }
    if (this.side === BLACK) { lo ^= ZSIDE_LO; hi ^= ZSIDE_HI; }
    this.hashLo = lo; this.hashHi = hi;
  };

  Position.prototype.toFEN = function () {
    let s = '';
    for (let rank = 7; rank >= 0; rank--) {
      let empty = 0;
      for (let file = 0; file < 8; file++) {
        const p = this.board[rank * 16 + file];
        if (!p) { empty++; continue; }
        if (empty) { s += empty; empty = 0; }
        s += PIECE_CHARS[p];
      }
      if (empty) s += empty;
      if (rank) s += '/';
    }
    let c = '';
    if (this.castle & 1) c += 'K';
    if (this.castle & 2) c += 'Q';
    if (this.castle & 4) c += 'k';
    if (this.castle & 8) c += 'q';
    return [s, this.side ? 'b' : 'w', c || '-', this.ep >= 0 ? sqName(this.ep) : '-', this.halfmove, this.fullmove].join(' ');
  };

  // Is `sq` attacked by side `by`?
  Position.prototype.attacked = function (sq, by) {
    const b = this.board;
    const bb = by ? BLACK_BIT : 0;
    let s;
    if (by === WHITE) {
      s = sq - 15; if (!(s & 0x88) && b[s] === PAWN) return true;
      s = sq - 17; if (!(s & 0x88) && b[s] === PAWN) return true;
    } else {
      s = sq + 15; if (!(s & 0x88) && b[s] === (PAWN | BLACK_BIT)) return true;
      s = sq + 17; if (!(s & 0x88) && b[s] === (PAWN | BLACK_BIT)) return true;
    }
    const knight = KNIGHT | bb, king = KING | bb;
    for (let i = 0; i < 8; i++) {
      s = sq + KNIGHT_D[i]; if (!(s & 0x88) && b[s] === knight) return true;
      s = sq + KING_D[i]; if (!(s & 0x88) && b[s] === king) return true;
    }
    const bishop = BISHOP | bb, rook = ROOK | bb, queen = QUEEN | bb;
    for (let i = 0; i < 4; i++) {
      let d = BISHOP_D[i];
      s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (p === bishop || p === queen) return true; break; }
        s += d;
      }
      d = ROOK_D[i];
      s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) { if (p === rook || p === queen) return true; break; }
        s += d;
      }
    }
    return false;
  };

  Position.prototype.inCheck = function () {
    return this.attacked(this.kingSq[this.side], this.side ^ 1);
  };

  function addPromos(moves, n, from, to, flags, queenOnly) {
    moves[n++] = encode(from, to, QUEEN, flags);
    if (!queenOnly) {
      moves[n++] = encode(from, to, ROOK, flags);
      moves[n++] = encode(from, to, BISHOP, flags);
      moves[n++] = encode(from, to, KNIGHT, flags);
    }
    return n;
  }

  // Pseudo-legal moves (may leave the king in check; make() rejects those).
  // capsOnly generates captures and queen promotions for the quiescence search.
  Position.prototype.gen = function (moves, capsOnly) {
    const b = this.board, side = this.side;
    const us = side ? BLACK_BIT : 0, them = side ? 0 : BLACK_BIT;
    let n = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p || (p & BLACK_BIT) !== us) continue;
      const t = p & 7;
      if (t === PAWN) {
        const dir = side ? -16 : 16;
        const promoRank = side ? 0 : 7;
        let to = sq + dir;
        if (!b[to]) {
          if ((to >> 4) === promoRank) n = addPromos(moves, n, sq, to, 0, capsOnly);
          else if (!capsOnly) {
            moves[n++] = encode(sq, to, 0, 0);
            if ((sq >> 4) === (side ? 6 : 1) && !b[to + dir]) moves[n++] = encode(sq, to + dir, 0, FLAG_DOUBLE);
          }
        }
        for (let k = -1; k <= 1; k += 2) {
          to = sq + dir + k;
          if (to & 0x88) continue;
          const q = b[to];
          if (q && (q & BLACK_BIT) === them) {
            if ((to >> 4) === promoRank) n = addPromos(moves, n, sq, to, FLAG_CAPTURE, capsOnly);
            else moves[n++] = encode(sq, to, 0, FLAG_CAPTURE);
          } else if (to === this.ep) {
            moves[n++] = encode(sq, to, 0, FLAG_CAPTURE | FLAG_EP);
          }
        }
      } else if (t === KNIGHT || t === KING) {
        const D = t === KNIGHT ? KNIGHT_D : KING_D;
        for (let i = 0; i < 8; i++) {
          const to = sq + D[i];
          if (to & 0x88) continue;
          const q = b[to];
          if (!q) { if (!capsOnly) moves[n++] = encode(sq, to, 0, 0); }
          else if ((q & BLACK_BIT) === them) moves[n++] = encode(sq, to, 0, FLAG_CAPTURE);
        }
      } else {
        const D = t === BISHOP ? BISHOP_D : t === ROOK ? ROOK_D : KING_D;
        for (let i = 0; i < D.length; i++) {
          const d = D[i];
          let to = sq + d;
          while (!(to & 0x88)) {
            const q = b[to];
            if (!q) { if (!capsOnly) moves[n++] = encode(sq, to, 0, 0); }
            else { if ((q & BLACK_BIT) === them) moves[n++] = encode(sq, to, 0, FLAG_CAPTURE); break; }
            to += d;
          }
        }
      }
    }
    if (!capsOnly && this.castle) {
      if (side === WHITE) {
        if ((this.castle & 1) && !b[5] && !b[6] && b[7] === ROOK && b[4] === KING &&
            !this.attacked(4, BLACK) && !this.attacked(5, BLACK) && !this.attacked(6, BLACK)) moves[n++] = encode(4, 6, 0, FLAG_CASTLE);
        if ((this.castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === ROOK && b[4] === KING &&
            !this.attacked(4, BLACK) && !this.attacked(3, BLACK) && !this.attacked(2, BLACK)) moves[n++] = encode(4, 2, 0, FLAG_CASTLE);
      } else {
        const R = ROOK | BLACK_BIT, K = KING | BLACK_BIT;
        if ((this.castle & 4) && !b[117] && !b[118] && b[119] === R && b[116] === K &&
            !this.attacked(116, WHITE) && !this.attacked(117, WHITE) && !this.attacked(118, WHITE)) moves[n++] = encode(116, 118, 0, FLAG_CASTLE);
        if ((this.castle & 8) && !b[115] && !b[114] && !b[113] && b[112] === R && b[116] === K &&
            !this.attacked(116, WHITE) && !this.attacked(115, WHITE) && !this.attacked(114, WHITE)) moves[n++] = encode(116, 114, 0, FLAG_CASTLE);
      }
    }
    return n;
  };

  // Plays a pseudo-legal move. Returns false (and takes it back) if it leaves the mover in check.
  Position.prototype.make = function (m) {
    const b = this.board;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
    const piece = b[from], side = this.side, us = side ? BLACK_BIT : 0;
    let u = this.undo[this.sp];
    if (!u) u = this.undo[this.sp] = { m: 0, cap: 0, castle: 0, ep: 0, half: 0, lo: 0, hi: 0 };
    u.m = m; u.castle = this.castle; u.ep = this.ep; u.half = this.halfmove; u.lo = this.hashLo; u.hi = this.hashHi;

    let lo = this.hashLo, hi = this.hashHi, cap = 0;
    if (this.ep >= 0) { lo ^= ZEP_LO[this.ep & 7]; hi ^= ZEP_HI[this.ep & 7]; }
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];

    if (m & FLAG_EP) {
      const capSq = to + (side ? 16 : -16);
      cap = b[capSq]; b[capSq] = 0;
      lo ^= ZP_LO[cap * 128 + capSq]; hi ^= ZP_HI[cap * 128 + capSq];
    } else if (b[to]) {
      cap = b[to];
      lo ^= ZP_LO[cap * 128 + to]; hi ^= ZP_HI[cap * 128 + to];
    }
    if (cap) this.count[cap]--;
    u.cap = cap;

    lo ^= ZP_LO[piece * 128 + from]; hi ^= ZP_HI[piece * 128 + from];
    b[from] = 0;
    let placed = piece;
    if (promo) { placed = promo | us; this.count[piece]--; this.count[placed]++; }
    b[to] = placed;
    lo ^= ZP_LO[placed * 128 + to]; hi ^= ZP_HI[placed * 128 + to];

    if ((piece & 7) === KING) {
      this.kingSq[side] = to;
      if (m & FLAG_CASTLE) {
        const rf = to > from ? from + 3 : from - 4;
        const rt = to > from ? from + 1 : from - 1;
        const r = b[rf]; b[rf] = 0; b[rt] = r;
        lo ^= ZP_LO[r * 128 + rf] ^ ZP_LO[r * 128 + rt];
        hi ^= ZP_HI[r * 128 + rf] ^ ZP_HI[r * 128 + rt];
      }
    }
    this.castle &= castleMask[from] & castleMask[to];
    lo ^= ZC_LO[this.castle]; hi ^= ZC_HI[this.castle];
    this.ep = -1;
    if (m & FLAG_DOUBLE) { this.ep = (from + to) >> 1; lo ^= ZEP_LO[this.ep & 7]; hi ^= ZEP_HI[this.ep & 7]; }
    this.halfmove = cap || (piece & 7) === PAWN ? 0 : this.halfmove + 1;
    if (side === BLACK) this.fullmove++;
    this.side = side ^ 1;
    lo ^= ZSIDE_LO; hi ^= ZSIDE_HI;
    this.hashLo = lo; this.hashHi = hi;
    this.sp++;
    this.histLo[this.sp] = lo; this.histHi[this.sp] = hi;

    if (this.attacked(this.kingSq[side], side ^ 1)) { this.unmake(); return false; }
    return true;
  };

  Position.prototype.unmake = function () {
    this.sp--;
    const u = this.undo[this.sp], m = u.m, b = this.board;
    const from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7;
    this.side ^= 1;
    const side = this.side, us = side ? BLACK_BIT : 0;
    let piece = b[to];
    if (promo) { this.count[piece]--; piece = PAWN | us; this.count[piece]++; }
    b[from] = piece;
    if (m & FLAG_EP) { b[to] = 0; b[to + (side ? 16 : -16)] = u.cap; }
    else b[to] = u.cap;
    if (u.cap) this.count[u.cap]++;
    if ((piece & 7) === KING) {
      this.kingSq[side] = from;
      if (m & FLAG_CASTLE) {
        const rf = to > from ? from + 3 : from - 4;
        const rt = to > from ? from + 1 : from - 1;
        b[rf] = b[rt]; b[rt] = 0;
      }
    }
    this.castle = u.castle; this.ep = u.ep; this.halfmove = u.half;
    this.hashLo = u.lo; this.hashHi = u.hi;
    if (side === BLACK) this.fullmove--;
  };

  // "Pass" used by null-move pruning in the search.
  Position.prototype.makeNull = function () {
    let u = this.undo[this.sp];
    if (!u) u = this.undo[this.sp] = { m: 0, cap: 0, castle: 0, ep: 0, half: 0, lo: 0, hi: 0 };
    u.m = 0; u.ep = this.ep; u.half = this.halfmove; u.lo = this.hashLo; u.hi = this.hashHi;
    let lo = this.hashLo ^ ZSIDE_LO, hi = this.hashHi ^ ZSIDE_HI;
    if (this.ep >= 0) { lo ^= ZEP_LO[this.ep & 7]; hi ^= ZEP_HI[this.ep & 7]; }
    this.ep = -1;
    this.side ^= 1;
    this.halfmove++;
    this.hashLo = lo; this.hashHi = hi;
    this.sp++;
    this.histLo[this.sp] = lo; this.histHi[this.sp] = hi;
  };

  Position.prototype.unmakeNull = function () {
    this.sp--;
    const u = this.undo[this.sp];
    this.side ^= 1;
    this.ep = u.ep; this.halfmove = u.half; this.hashLo = u.lo; this.hashHi = u.hi;
  };

  // Has the current position occurred before (since the last capture or pawn move)?
  Position.prototype.isRepetition = function () {
    const lo = this.hashLo, hi = this.hashHi;
    const limit = Math.max(0, this.sp - this.halfmove);
    for (let i = this.sp - 2; i >= limit; i -= 2) {
      if (this.histLo[i] === lo && this.histHi[i] === hi) return true;
    }
    return false;
  };

  Position.prototype.repetitionCount = function () {
    const lo = this.hashLo, hi = this.hashHi;
    const limit = Math.max(0, this.sp - this.halfmove);
    let n = 0;
    for (let i = this.sp; i >= limit; i -= 2) {
      if (this.histLo[i] === lo && this.histHi[i] === hi) n++;
    }
    return n;
  };

  Position.prototype.hasNonPawn = function (side) {
    const c = this.count, o = side ? BLACK_BIT : 0;
    return c[QUEEN | o] + c[ROOK | o] + c[BISHOP | o] + c[KNIGHT | o] > 0;
  };

  // Neither side can possibly mate: K v K, K+minor v K, K+B v K+B with same-coloured bishops.
  Position.prototype.insufficientMaterial = function (exact) {
    const c = this.count;
    if (c[PAWN] || c[PAWN | 8] || c[ROOK] || c[ROOK | 8] || c[QUEEN] || c[QUEEN | 8]) return false;
    const minors = c[KNIGHT] + c[KNIGHT | 8] + c[BISHOP] + c[BISHOP | 8];
    if (minors <= 1) return true;
    if (!exact || c[KNIGHT] || c[KNIGHT | 8]) return false;
    // Only bishops left: drawn if they all stand on the same colour.
    let colours = 0;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      if ((this.board[sq] & 7) === BISHOP) colours |= 1 << (((sq >> 4) + (sq & 7)) & 1);
    }
    return colours !== 3;
  };

  Position.prototype.legalMoves = function () {
    const buf = new Int32Array(256);
    const n = this.gen(buf, false);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (this.make(buf[i])) { this.unmake(); out.push(buf[i]); }
    }
    return out;
  };

  Position.prototype.moveToUci = function (m) {
    const p = movePromo(m);
    return sqName(moveFrom(m)) + sqName(moveTo(m)) + (p ? ' kqbnr'[p] : '');
  };

  Position.prototype.moveFromUci = function (str) {
    if (!str || str.length < 4) return 0;
    const from = parseSq(str.slice(0, 2)), to = parseSq(str.slice(2, 4));
    const promoChar = str[4] || '';
    const promo = promoChar ? ' kqbnr'.indexOf(promoChar) : 0;
    for (const m of this.legalMoves()) {
      if (moveFrom(m) === from && moveTo(m) === to && movePromo(m) === promo) return m;
    }
    return 0;
  };

  // Standard algebraic notation, computed before the move is played.
  Position.prototype.san = function (m) {
    const b = this.board, from = moveFrom(m), to = moveTo(m), promo = movePromo(m);
    const type = b[from] & 7;
    let s;
    if (m & FLAG_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else if (type === PAWN) {
      s = m & FLAG_CAPTURE ? 'abcdefgh'[from & 7] + 'x' : '';
      s += sqName(to);
      if (promo) s += '=' + ' KQBNR'[promo];
    } else {
      s = ' KQBNR'[type];
      let clash = false, sameFile = false, sameRank = false;
      for (const o of this.legalMoves()) {
        const of = moveFrom(o);
        if (of !== from && moveTo(o) === to && (b[of] & 7) === type) {
          clash = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
      }
      if (clash) {
        if (!sameFile) s += 'abcdefgh'[from & 7];
        else if (!sameRank) s += (from >> 4) + 1;
        else s += sqName(from);
      }
      if (m & FLAG_CAPTURE) s += 'x';
      s += sqName(to);
    }
    if (this.make(m)) {
      if (this.inCheck()) s += this.legalMoves().length ? '+' : '#';
      this.unmake();
    }
    return s;
  };

  // Game over? Mirrors the results Sjeng reports: mate, stalemate ("Draw"),
  // "3 fold repetition", "Fifty move rule", plus insufficient material.
  Position.prototype.outcome = function () {
    if (this.legalMoves().length === 0) {
      if (this.inCheck()) return { result: this.side === WHITE ? '0-1' : '1-0', reason: 'checkmate' };
      return { result: '1/2-1/2', reason: 'stalemate' };
    }
    if (this.halfmove >= 100) return { result: '1/2-1/2', reason: 'fifty-move rule' };
    if (this.repetitionCount() >= 3) return { result: '1/2-1/2', reason: 'threefold repetition' };
    if (this.insufficientMaterial(true)) return { result: '1/2-1/2', reason: 'insufficient material' };
    return null;
  };

  Position.prototype.pieceAt = function (file, rank) {
    const p = this.board[rank * 16 + file];
    return p ? PIECE_CHARS[p] : '';
  };

  // FEN without the move counters, and with the en-passant square only when a
  // capture there is actually possible, so transpositions share one key.
  Position.prototype.key = function () {
    const parts = this.toFEN().split(' ');
    if (this.ep >= 0) {
      const pawn = this.side === WHITE ? PAWN : PAWN | BLACK_BIT;
      const from1 = this.ep + (this.side === WHITE ? -15 : 15), from2 = this.ep + (this.side === WHITE ? -17 : 17);
      const canCapture = (!(from1 & 0x88) && this.board[from1] === pawn) || (!(from2 & 0x88) && this.board[from2] === pawn);
      if (!canCapture) parts[3] = '-';
    }
    return parts.slice(0, 4).join(' ');
  };

  // Parses standard algebraic notation ("Nf3", "exd5", "O-O", "e8=Q+") into a legal move, or 0.
  Position.prototype.moveFromSan = function (san) {
    const s = san.replace(/[+#!?]/g, '').replace(/0/g, 'O').trim();
    const legal = this.legalMoves();
    if (s === 'O-O' || s === 'O-O-O') {
      for (const m of legal) {
        if ((m & FLAG_CASTLE) && ((moveTo(m) > moveFrom(m)) === (s === 'O-O'))) return m;
      }
      return 0;
    }
    const mt = /^([KQRBN])?([a-h])?([1-8])?x?([a-h][1-8])(?:=?([QRBN]))?$/.exec(s);
    if (!mt) return 0;
    const type = mt[1] ? ' KQBNR'.indexOf(mt[1]) : PAWN;
    const to = parseSq(mt[4]);
    const promo = mt[5] ? ' KQBNR'.indexOf(mt[5]) : 0;
    for (const m of legal) {
      const from = moveFrom(m);
      if (moveTo(m) !== to || (this.board[from] & 7) !== type || movePromo(m) !== promo) continue;
      if (mt[2] && 'abcdefgh'[from & 7] !== mt[2]) continue;
      if (mt[3] && String((from >> 4) + 1) !== mt[3]) continue;
      return m;
    }
    return 0;
  };

  // Squares of the pieces of side `by` that attack `sq` (used by the coach's explanations).
  Position.prototype.attackersOf = function (sq, by) {
    const b = this.board, bb = by ? BLACK_BIT : 0, out = [];
    let s;
    const pawnFrom = by === WHITE ? [sq - 15, sq - 17] : [sq + 15, sq + 17];
    for (s of pawnFrom) if (!(s & 0x88) && b[s] === (PAWN | bb)) out.push(s);
    for (let i = 0; i < 8; i++) {
      s = sq + KNIGHT_D[i]; if (!(s & 0x88) && b[s] === (KNIGHT | bb)) out.push(s);
      s = sq + KING_D[i]; if (!(s & 0x88) && b[s] === (KING | bb)) out.push(s);
    }
    for (let i = 0; i < 8; i++) {
      const d = KING_D[i], diag = i >= 4;
      s = sq + d;
      while (!(s & 0x88)) {
        const p = b[s];
        if (p) {
          if ((p & BLACK_BIT) === bb && ((p & 7) === QUEEN || (p & 7) === (diag ? BISHOP : ROOK))) out.push(s);
          break;
        }
        s += d;
      }
    }
    return out;
  };

  // Squares attacked by the piece standing on `sq` (ignores pins).
  Position.prototype.attacksFrom = function (sq) {
    const b = this.board, p = b[sq], t = p & 7, out = [];
    if (!p) return out;
    if (t === PAWN) {
      const dir = p & BLACK_BIT ? -16 : 16;
      for (const s of [sq + dir - 1, sq + dir + 1]) if (!(s & 0x88)) out.push(s);
    } else if (t === KNIGHT || t === KING) {
      for (const d of t === KNIGHT ? KNIGHT_D : KING_D) { const s = sq + d; if (!(s & 0x88)) out.push(s); }
    } else {
      const D = t === BISHOP ? BISHOP_D : t === ROOK ? ROOK_D : KING_D;
      for (const d of D) {
        let s = sq + d;
        while (!(s & 0x88)) { out.push(s); if (b[s]) break; s += d; }
      }
    }
    return out;
  };

  // Is this a position a game could reach? One king each, no pawns on the back ranks,
  // and the side that just moved is not left in check. (Stockfish rejects such positions.)
  Position.prototype.isLegalSetup = function () {
    if (this.count[KING] !== 1 || this.count[KING | BLACK_BIT] !== 1) return false;
    for (let f = 0; f < 8; f++) {
      if ((this.board[f] & 7) === PAWN || (this.board[112 + f] & 7) === PAWN) return false;
    }
    return !this.attacked(this.kingSq[this.side ^ 1], this.side);
  };

  // Material count from White's point of view, in pawns (P=1 N=3 B=3 R=5 Q=9).
  Position.prototype.material = function () {
    const c = this.count;
    return (c[PAWN] - c[PAWN | 8]) + 3 * (c[KNIGHT] - c[KNIGHT | 8]) + 3 * (c[BISHOP] - c[BISHOP | 8]) +
      5 * (c[ROOK] - c[ROOK | 8]) + 9 * (c[QUEEN] - c[QUEEN | 8]);
  };

  // ---------------------------------------------------------------------------
  // Evaluation: material + piece-square tables, tapered between middlegame and
  // endgame (Sjeng reports separate opening/middlegame/endgame phases), plus
  // simple pawn-structure, bishop-pair and rook-file terms.
  // ---------------------------------------------------------------------------

  const VALUE = [0, 0, 900, 330, 320, 500, 100, 0];
  const PHASE_INC = [0, 0, 4, 1, 1, 2, 0, 0];

  // Tables are written from White's point of view with a8 first.
  const PST = {
    [PAWN]: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0],
    [KNIGHT]: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50],
    [BISHOP]: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20],
    [ROOK]: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0],
    [QUEEN]: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20],
  };
  const KING_MG = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20];
  const KING_EG = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50];

  // Combined material + square bonus, indexed by piece code * 128 + 0x88 square.
  const PST_MG = new Int16Array(16 * 128), PST_EG = new Int16Array(16 * 128);
  for (let t = 1; t <= 6; t++) {
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) continue;
      const file = sq & 7, rank = sq >> 4;
      const wIdx = (7 - rank) * 8 + file, bIdx = rank * 8 + file;
      const mgT = t === KING ? KING_MG : PST[t], egT = t === KING ? KING_EG : PST[t];
      PST_MG[t * 128 + sq] = VALUE[t] + mgT[wIdx];
      PST_EG[t * 128 + sq] = VALUE[t] + egT[wIdx];
      PST_MG[(t | 8) * 128 + sq] = VALUE[t] + mgT[bIdx];
      PST_EG[(t | 8) * 128 + sq] = VALUE[t] + egT[bIdx];
    }
  }
  const PASSED_MG = [0, 5, 10, 15, 25, 40, 60, 0];
  const PASSED_EG = [0, 10, 20, 35, 60, 100, 150, 0];

  const wPawnCount = new Int8Array(8), bPawnCount = new Int8Array(8);
  const wPawnMin = new Int8Array(8), bPawnMax = new Int8Array(8);
  const wPawnMax = new Int8Array(8), bPawnMin = new Int8Array(8);

  // Score from the point of view of the side to move.
  Position.prototype.evaluate = function () {
    const b = this.board;
    let mg = 0, eg = 0, phase = 0;
    wPawnCount.fill(0); bPawnCount.fill(0);
    wPawnMin.fill(8); wPawnMax.fill(-1); bPawnMin.fill(8); bPawnMax.fill(-1);
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p) continue;
      const i = p * 128 + sq;
      if (p & BLACK_BIT) { mg -= PST_MG[i]; eg -= PST_EG[i]; }
      else { mg += PST_MG[i]; eg += PST_EG[i]; }
      phase += PHASE_INC[p & 7];
      if (p === PAWN) {
        const f = sq & 7, r = sq >> 4;
        wPawnCount[f]++;
        if (r < wPawnMin[f]) wPawnMin[f] = r;
        if (r > wPawnMax[f]) wPawnMax[f] = r;
      } else if (p === (PAWN | BLACK_BIT)) {
        const f = sq & 7, r = sq >> 4;
        bPawnCount[f]++;
        if (r < bPawnMin[f]) bPawnMin[f] = r;
        if (r > bPawnMax[f]) bPawnMax[f] = r;
      }
    }
    // Pawn structure and rook files.
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (p === PAWN) {
        const f = sq & 7, r = sq >> 4;
        const left = f > 0 ? f - 1 : f, right = f < 7 ? f + 1 : f;
        if (bPawnMax[left] <= r && bPawnMax[f] <= r && bPawnMax[right] <= r) { mg += PASSED_MG[r]; eg += PASSED_EG[r]; }
        if ((f === 0 || !wPawnCount[f - 1]) && (f === 7 || !wPawnCount[f + 1])) { mg -= 10; eg -= 15; }
      } else if (p === (PAWN | BLACK_BIT)) {
        const f = sq & 7, r = sq >> 4;
        const left = f > 0 ? f - 1 : f, right = f < 7 ? f + 1 : f;
        if (wPawnMin[left] >= r && wPawnMin[f] >= r && wPawnMin[right] >= r) { mg -= PASSED_MG[7 - r]; eg -= PASSED_EG[7 - r]; }
        if ((f === 0 || !bPawnCount[f - 1]) && (f === 7 || !bPawnCount[f + 1])) { mg += 10; eg += 15; }
      } else if (p === ROOK) {
        const f = sq & 7;
        if (!wPawnCount[f]) { const bonus = bPawnCount[f] ? 10 : 20; mg += bonus; eg += bonus >> 1; }
      } else if (p === (ROOK | BLACK_BIT)) {
        const f = sq & 7;
        if (!bPawnCount[f]) { const bonus = wPawnCount[f] ? 10 : 20; mg -= bonus; eg -= bonus >> 1; }
      }
    }
    for (let f = 0; f < 8; f++) {
      if (wPawnCount[f] > 1) { mg -= 10 * (wPawnCount[f] - 1); eg -= 20 * (wPawnCount[f] - 1); }
      if (bPawnCount[f] > 1) { mg += 10 * (bPawnCount[f] - 1); eg += 20 * (bPawnCount[f] - 1); }
    }
    if (this.count[BISHOP] >= 2) { mg += 30; eg += 50; }
    if (this.count[BISHOP | 8] >= 2) { mg -= 30; eg -= 50; }
    if (phase > 24) phase = 24;
    const score = ((mg * phase + eg * (24 - phase)) / 24) | 0;
    return this.side === WHITE ? score + 10 : -score + 10; // small bonus for having the move
  };

  // ---------------------------------------------------------------------------
  // Search: iterative deepening alpha-beta (principal variation search) with a
  // transposition table, quiescence search, check extensions, null-move
  // pruning, killer/history move ordering and late-move reductions.
  // The strings in Apple's Sjeng binary show it uses the same family of tools
  // (TT stores/probes, quiescence nodes, check extensions, null-move "NTries/NCuts").
  // ---------------------------------------------------------------------------

  const MATE = 30000, INF = 32000, MAX_PLY = 100;
  const TT_BITS = 20, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
  const EXACT = 1, LOWER = 2, UPPER = 3;
  const now = typeof performance !== 'undefined' && performance.now ? () => performance.now() : () => Date.now();

  function Engine() {
    this.ttLo = new Int32Array(TT_SIZE);
    this.ttHi = new Int32Array(TT_SIZE);
    this.ttMove = new Int32Array(TT_SIZE);
    this.ttScore = new Int16Array(TT_SIZE);
    this.ttDepth = new Int8Array(TT_SIZE);
    this.ttFlag = new Int8Array(TT_SIZE);
    this.killers = new Int32Array(MAX_PLY * 2);
    this.history = new Int32Array(16 * 128);
    this.moveBufs = [];
    this.scoreBufs = [];
    for (let i = 0; i < MAX_PLY + 1; i++) { this.moveBufs.push(new Int32Array(256)); this.scoreBufs.push(new Int32Array(256)); }
    this.nodes = 0;
    this.stop = false;
    this.deadline = 0;
    this.rootBest = 0;
    this.pos = null;
  }

  Engine.prototype.scoreMoves = function (moves, scores, n, ttMove, ply) {
    const b = this.pos.board;
    const k1 = this.killers[ply * 2], k2 = this.killers[ply * 2 + 1];
    for (let i = 0; i < n; i++) {
      const m = moves[i];
      if (m === ttMove) scores[i] = 2000000;
      else if (m & FLAG_CAPTURE) {
        const victim = m & FLAG_EP ? PAWN : b[(m >> 7) & 127] & 7;
        const attacker = b[m & 127] & 7;
        scores[i] = 1000000 + VALUE[victim] * 8 - VALUE[attacker] / 10 + (movePromo(m) ? 900 : 0);
      } else if (movePromo(m)) scores[i] = 950000 + VALUE[movePromo(m)];
      else if (m === k1) scores[i] = 900000;
      else if (m === k2) scores[i] = 800000;
      else scores[i] = this.history[b[m & 127] * 128 + ((m >> 7) & 127)];
    }
  };

  function pickNext(moves, scores, i, n) {
    let best = i;
    for (let j = i + 1; j < n; j++) if (scores[j] > scores[best]) best = j;
    if (best !== i) {
      const m = moves[i]; moves[i] = moves[best]; moves[best] = m;
      const s = scores[i]; scores[i] = scores[best]; scores[best] = s;
    }
  }

  Engine.prototype.quiesce = function (alpha, beta, ply) {
    if ((++this.nodes & 2047) === 0 && now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const pos = this.pos;
    const stand = pos.evaluate();
    if (ply >= MAX_PLY) return stand;
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const moves = this.moveBufs[ply], scores = this.scoreBufs[ply];
    const n = pos.gen(moves, true);
    this.scoreMoves(moves, scores, n, 0, ply);
    let best = stand;
    for (let i = 0; i < n; i++) {
      pickNext(moves, scores, i, n);
      const m = moves[i];
      if (!movePromo(m)) {
        const victim = m & FLAG_EP ? PAWN : pos.board[(m >> 7) & 127] & 7;
        if (stand + VALUE[victim] + 200 < alpha) continue; // delta pruning
      }
      if (!pos.make(m)) continue;
      const s = -this.quiesce(-beta, -alpha, ply + 1);
      pos.unmake();
      if (this.stop) return 0;
      if (s > best) {
        best = s;
        if (s > alpha) { alpha = s; if (s >= beta) break; }
      }
    }
    return best;
  };

  Engine.prototype.negamax = function (depth, alpha, beta, ply, allowNull) {
    if ((++this.nodes & 2047) === 0 && now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const pos = this.pos;
    const pvNode = beta - alpha > 1;
    if (ply > 0) {
      if (pos.halfmove >= 100 || pos.isRepetition() || pos.insufficientMaterial(false)) return 0;
      if (alpha < -MATE + ply) alpha = -MATE + ply;
      if (beta > MATE - ply - 1) beta = MATE - ply - 1;
      if (alpha >= beta) return alpha;
    }
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return this.quiesce(alpha, beta, ply);
    if (ply >= MAX_PLY) return pos.evaluate();

    let ttMove = 0;
    const idx = pos.hashLo & TT_MASK;
    if (this.ttLo[idx] === pos.hashLo && this.ttHi[idx] === pos.hashHi) {
      ttMove = this.ttMove[idx];
      if (ply > 0 && !pvNode && this.ttDepth[idx] >= depth) {
        let s = this.ttScore[idx];
        if (s > MATE - 200) s -= ply; else if (s < -MATE + 200) s += ply;
        const f = this.ttFlag[idx];
        if (f === EXACT || (f === LOWER && s >= beta) || (f === UPPER && s <= alpha)) return s;
      }
    }

    if (allowNull && !inCheck && !pvNode && depth >= 3 && pos.hasNonPawn(pos.side) && pos.evaluate() >= beta) {
      pos.makeNull();
      const s = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (this.stop) return 0;
      if (s >= beta) return beta;
    }

    const moves = this.moveBufs[ply], scores = this.scoreBufs[ply];
    const n = pos.gen(moves, false);
    this.scoreMoves(moves, scores, n, ttMove, ply);
    const oldAlpha = alpha;
    let legal = 0, bestScore = -INF, bestMove = 0;
    for (let i = 0; i < n; i++) {
      pickNext(moves, scores, i, n);
      const m = moves[i];
      const mover = pos.board[m & 127];
      if (!pos.make(m)) continue;
      legal++;
      let s;
      if (legal === 1) {
        s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        let r = 0;
        if (depth >= 3 && legal > 4 && !inCheck && !(m & FLAG_CAPTURE) && !movePromo(m) && !pos.inCheck()) r = 1;
        s = -this.negamax(depth - 1 - r, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && !this.stop && (r || s < beta)) s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (this.stop) return 0;
      if (s > bestScore) {
        bestScore = s;
        bestMove = m;
        if (s > alpha) {
          alpha = s;
          if (ply === 0) this.rootBest = m;
          if (s >= beta) {
            if (!(m & FLAG_CAPTURE) && !movePromo(m)) {
              if (this.killers[ply * 2] !== m) { this.killers[ply * 2 + 1] = this.killers[ply * 2]; this.killers[ply * 2] = m; }
              this.history[mover * 128 + ((m >> 7) & 127)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (legal === 0) return inCheck ? -MATE + ply : 0;

    let stored = bestScore;
    if (stored > MATE - 200) stored += ply; else if (stored < -MATE + 200) stored -= ply;
    if (this.ttLo[idx] !== pos.hashLo || this.ttHi[idx] !== pos.hashHi || depth >= this.ttDepth[idx]) {
      this.ttLo[idx] = pos.hashLo; this.ttHi[idx] = pos.hashHi;
      this.ttMove[idx] = bestMove; this.ttScore[idx] = stored; this.ttDepth[idx] = depth;
      this.ttFlag[idx] = bestScore >= beta ? LOWER : bestScore > oldAlpha ? EXACT : UPPER;
    }
    return bestScore;
  };

  Engine.prototype.principalVariation = function (first, maxLen) {
    const pos = this.pos, pv = [];
    let m = first, made = 0;
    while (m && pv.length < maxLen) {
      const legal = pos.legalMoves();
      if (!legal.includes(m)) break;
      pv.push(pos.moveToUci(m));
      pos.make(m); made++;
      const idx = pos.hashLo & TT_MASK;
      m = this.ttLo[idx] === pos.hashLo && this.ttHi[idx] === pos.hashHi ? this.ttMove[idx] : 0;
    }
    while (made--) pos.unmake();
    return pv;
  };

  // opts: { maxDepth, timeMs, randomMargin }
  Engine.prototype.search = function (pos, opts) {
    this.pos = pos;
    this.nodes = 0;
    this.stop = false;
    const start = now();
    this.deadline = start + (opts.timeMs || 10000);
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] >>= 2;

    const rootMoves = pos.legalMoves();
    if (rootMoves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0, pv: [], ms: 0 };
    let best = rootMoves[0], bestScore = 0, depthDone = 0;
    if (rootMoves.length > 1) {
      for (let d = 1; d <= opts.maxDepth; d++) {
        this.rootBest = 0;
        const score = this.negamax(d, -INF, INF, 0, true);
        if (this.stop) break;
        if (this.rootBest) best = this.rootBest;
        bestScore = score;
        depthDone = d;
        if (Math.abs(score) > MATE - 200) break;
        if (now() - start > (opts.timeMs || 10000) * 0.55) break; // next depth would not finish in time
      }
    }

    // Easy level: choose at random among moves that score almost as well as the best one.
    if (opts.randomMargin > 0 && rootMoves.length > 1 && depthDone > 0 && Math.abs(bestScore) < MATE - 200) {
      this.stop = false;
      this.deadline = now() + 2000;
      const near = [];
      for (const m of rootMoves) {
        pos.make(m);
        const s = -this.negamax(depthDone - 1, -INF, INF, 1, true);
        pos.unmake();
        if (this.stop) break;
        if (s >= bestScore - opts.randomMargin) near.push(m);
      }
      if (!this.stop && near.length) best = near[Math.floor(Math.random() * near.length)];
    }

    const uci = pos.moveToUci(best);
    return {
      move: uci,
      san: pos.san(best),
      score: bestScore,
      depth: depthDone,
      nodes: this.nodes,
      pv: this.principalVariation(best, Math.max(depthDone, 1)),
      ms: Math.round(now() - start),
    };
  };

  // ---------------------------------------------------------------------------
  // Opening book (Sjeng ships one too: nbook.db / normal.opn). A handful of
  // main lines, chosen at random so games do not all start the same way.
  // ---------------------------------------------------------------------------

  const BOOK = [
    'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5a4 g8f6 e1g1 f8e7 f1e1 b7b5 a4b3 d7d6',
    'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d4 e5d4',
    'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8e7 e1g1 e8g8',
    'e2e4 e7e5 g1f3 b8c6 d2d4 e5d4 f3d4 g8f6 d4c6 b7c6',
    'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5',
    'e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6',
    'e2e4 c7c5 g1f3 b8c6 d2d4 c5d4 f3d4 g8f6 b1c3 e7e5',
    'e2e4 c7c5 g1f3 e7e6 d2d4 c5d4 f3d4 b8c6 b1c3 d8c7',
    'e2e4 e7e6 d2d4 d7d5 b1c3 g8f6 c1g5 f8e7 e4e5 f6d7',
    'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6',
    'e2e4 c7c6 d2d4 d7d5 b1c3 d5e4 c3e4 c8f5 e4g3 f5g6',
    'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c8f5',
    'd2d4 d7d5 c2c4 e7e6 b1c3 g8f6 c1g5 f8e7 e2e3 e8g8 g1f3',
    'd2d4 d7d5 c2c4 c7c6 g1f3 g8f6 b1c3 d5c4 a2a4 c8f5',
    'd2d4 g8f6 c2c4 e7e6 b1c3 f8b4 e2e3 e8g8 f1d3 d7d5',
    'd2d4 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 g1f3 e8g8 f1e2 e7e5',
    'd2d4 g8f6 c2c4 e7e6 g1f3 b7b6 g2g3 c8b7 f1g2 f8e7',
    'd2d4 d7d5 g1f3 g8f6 c1f4 e7e6 e2e3 c7c5 c2c3 b8c6',
    'c2c4 e7e5 b1c3 g8f6 g1f3 b8c6 g2g3 d7d5 c4d5 f6d5',
    'c2c4 g8f6 b1c3 e7e6 e2e4 c7c5 e4e5 f6g8',
    'g1f3 d7d5 d2d4 g8f6 c2c4 e7e6 b1c3 f8e7 c1g5 e8g8',
    'g1f3 g8f6 c2c4 g7g6 b1c3 f8g7 e2e4 d7d6 d2d4 e8g8',
  ].map((line) => line.split(' '));

  function bookMove(history) {
    if (history.length >= 14) return null;
    const counts = new Map();
    for (const line of BOOK) {
      if (line.length <= history.length) continue;
      let match = true;
      for (let i = 0; i < history.length; i++) if (line[i] !== history[i]) { match = false; break; }
      if (match) counts.set(line[history.length], (counts.get(line[history.length]) || 0) + 1);
    }
    if (!counts.size) return null;
    let total = 0;
    for (const c of counts.values()) total += c;
    let r = Math.random() * total;
    for (const [mv, c] of counts) { r -= c; if (r < 0) return mv; }
    return counts.keys().next().value;
  }

  // ---------------------------------------------------------------------------
  // Request handler shared by the Web Worker and the main-thread fallback.
  // req: { fen, moves: [uci], depth, timeMs, randomMargin, useBook }
  // ---------------------------------------------------------------------------

  let sharedEngine = null;
  function handleSearch(req) {
    const fen = req.fen || START_FEN;
    const pos = new Position(fen);
    const history = req.moves || [];
    for (const u of history) {
      const m = pos.moveFromUci(u);
      if (!m || !pos.make(m)) break;
    }
    if (req.useBook && fen === START_FEN) {
      const b = bookMove(history);
      const m = b ? pos.moveFromUci(b) : 0;
      if (m) return { id: req.id, move: b, san: pos.san(m), book: true, score: 0, depth: 0, nodes: 0, pv: [b], ms: 0 };
    }
    if (!sharedEngine) sharedEngine = new Engine();
    const r = sharedEngine.search(pos, { maxDepth: req.depth || 3, timeMs: req.timeMs || 10000, randomMargin: req.randomMargin || 0 });
    r.id = req.id;
    r.book = false;
    return r;
  }

  return {
    Position, Engine, handleSearch, bookMove,
    START_FEN, WHITE, BLACK, KING, QUEEN, BISHOP, KNIGHT, ROOK, PAWN, BLACK_BIT, PIECE_CHARS,
    FLAG_CAPTURE, FLAG_EP, FLAG_CASTLE, FLAG_DOUBLE,
    moveFrom, moveTo, movePromo, sqName, parseSq, encode,
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = MyChessCore;
