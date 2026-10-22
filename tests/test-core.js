// Run with: node tests/test-core.js
// Checks move generation against published perft counts, the game-end rules,
// and that the computer finds simple tactics at each difficulty.
const MyChessCore = require('../js/core.js');
const Core = MyChessCore();
const { Position } = Core;

let failures = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
}

function perft(pos, depth) {
  if (depth === 0) return 1;
  const buf = new Int32Array(256);
  const n = pos.gen(buf, false);
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (!pos.make(buf[i])) continue;
    total += perft(pos, depth - 1);
    pos.unmake();
  }
  return total;
}

// Reference counts from https://www.chessprogramming.org/Perft_Results
const PERFT = [
  ['start position', Core.START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];
for (const [name, fen, counts] of PERFT) {
  const pos = new Position(fen);
  counts.forEach((c, i) => check(`perft ${name} depth ${i + 1}`, perft(pos, i + 1), c));
  check(`${name} FEN round-trip`, pos.toFEN(), fen);
}

// Make/unmake must restore the hash exactly.
{
  const pos = new Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  const lo = pos.hashLo, hi = pos.hashHi;
  for (const m of pos.legalMoves()) {
    pos.make(m);
    const after = pos.hashLo;
    pos.computeHash();
    if (after !== pos.hashLo) { failures++; console.log('FAIL incremental hash for', pos.moveToUci(m)); }
    pos.unmake();
  }
  check('hash restored after make/unmake', pos.hashLo === lo && pos.hashHi === hi, true);
}

// Notation.
{
  const pos = new Position('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
  check('SAN castle', pos.san(pos.moveFromUci('e1g1')), 'O-O');
  check('SAN capture', pos.san(pos.moveFromUci('e5f7')), 'Nxf7');
  const p2 = new Position('6k1/8/8/8/8/8/8/R4RK1 w - - 0 1');
  check('SAN disambiguation', p2.san(p2.moveFromUci('a1d1')), 'Rad1');
  const p4 = new Position('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1');
  check('SAN checkmate', p4.san(p4.moveFromUci('a1a8')), 'Ra8#');
  const p3 = new Position('8/P6k/8/8/8/8/8/K7 w - - 0 1');
  check('SAN promotion', p3.san(p3.moveFromUci('a7a8q')), 'a8=Q');
}

// Illegal moves are refused.
{
  const pos = new Position('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
  check('king may not step onto an attacked square', pos.moveFromUci('e1d2'), 0);
  check('king may capture an undefended rook', pos.moveFromUci('e1e2') !== 0, true);
  const pinned = new Position('4k3/4r3/8/8/8/8/4B3/4K3 w - - 0 1');
  check('pinned bishop cannot move', pinned.moveFromUci('e2d3'), 0);
  const start = new Position();
  check('pawn cannot jump three squares', start.moveFromUci('e2e5'), 0);
  check('knight cannot move like a bishop', start.moveFromUci('g1e3'), 0);
}

// Game endings.
{
  const mate = new Position('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  check('fool\'s mate is checkmate', JSON.stringify(mate.outcome()), JSON.stringify({ result: '0-1', reason: 'checkmate' }));
  const stale = new Position('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  check('stalemate', stale.outcome().reason, 'stalemate');
  const bare = new Position('8/8/4k3/8/8/3K4/8/8 w - - 0 1');
  check('K v K is insufficient material', bare.outcome().reason, 'insufficient material');
  const fifty = new Position('8/8/4k3/8/8/3K4/8/7R w - - 100 80');
  check('fifty-move rule', fifty.outcome().reason, 'fifty-move rule');
  const rep = new Position();
  for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) rep.make(rep.moveFromUci(u));
  check('threefold repetition', rep.outcome().reason, 'threefold repetition');
}

// Engine: tactics and speed per difficulty.
const LEVELS = { easy: { depth: 1, timeMs: 3000 }, medium: { depth: 4, timeMs: 5000 }, hard: { depth: 10, timeMs: 6000 } }; // same as js/app.js
const TACTICS = [
  ['mate in one (back rank)', '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', ['a1a8'], ['easy', 'medium', 'hard']],
  ['takes the free queen', '4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1', ['d2d5'], ['easy', 'medium', 'hard']],
  ['scholar\'s mate', 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', ['h5f7'], ['medium', 'hard']],
  ['knight fork', '2r3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', ['d5e7'], ['medium', 'hard']],
];
for (const [name, fen, answers, levels] of TACTICS) {
  for (const level of levels) {
    const r = Core.handleSearch({ fen, moves: [], depth: LEVELS[level].depth, timeMs: LEVELS[level].timeMs });
    check(`${level}: ${name} (${r.move}, depth ${r.depth}, ${r.nodes} nodes, ${r.ms} ms)`, answers.includes(r.move), true);
  }
}
for (const level of Object.keys(LEVELS)) {
  const fen = 'r1bq1rk1/pp2bppp/2n1pn2/3p4/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 8';
  const r = Core.handleSearch({ fen, moves: [], depth: LEVELS[level].depth, timeMs: LEVELS[level].timeMs });
  check(`${level}: middlegame search finishes (${r.move} depth ${r.depth}, ${r.nodes} nodes, ${r.ms} ms)`, r.ms <= LEVELS[level].timeMs + 500 && !!r.move, true);
}

// Book.
check('book answers 1.e4', ['e7e5', 'c7c5', 'e7e6', 'c7c6', 'd7d5'].includes(Core.bookMove(['e2e4'])), true);

console.log(failures ? `\n${failures} failure(s)` : '\nAll tests passed');
process.exit(failures ? 1 : 0);
