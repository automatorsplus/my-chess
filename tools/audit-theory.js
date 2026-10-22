// Audits Theory mode with Stockfish 19 (the same engine build the app uses) and
// writes THEORY-AUDIT.md plus research/theory-audit.json.
//
//  1. Every course main line, move by move, at depth 18: how much winning chance
//     each theory move gives away compared with Stockfish's best move.
//  2. Every trap and claim quoted in the course text ("Good to know"), checked
//     with the rules engine and with Stockfish.
//  3. Every move of the whole Lichess library (all 3,865 lines), at depth 12, as
//     a screening pass: which theory moves Stockfish thinks are dubious.
//
// Usage: node tools/audit-theory.js [--workers 8] [--deep 18] [--quick 12]
const path = require('path');
const fs = require('fs');

global.window = global;
global.self = global;
require('../js/openings-data.js');
require('../js/theory-data.js');
const Core = require('../js/core.js')();
const coach = require('../js/coach.js')(Core);
require('../js/analyzer.js');
const T = require('../js/theory.js');
const { makePool } = require('./stockfish-pool.js');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? +process.argv[i + 1] : def; };
const WORKERS = arg('workers', 8), DEEP = arg('deep', 18), QUICK = arg('quick', 12);

// ---------------------------------------------------------------- helpers

const winPct = coach.winPct;
function play(san, fen) {
  const pos = new Core.Position(fen);
  const fens = [pos.toFEN()], ucis = [], sans = [];
  for (const raw of san.trim().split(/\s+/).filter((x) => !/^\d+\.+$/.test(x))) {
    const s = raw.replace(/^\d+\.+/, '').replace(/[?!]+$/, '');
    const m = pos.moveFromSan(s);
    if (!m) throw new Error(`illegal move ${s} in "${san}"`);
    ucis.push(pos.moveToUci(m));
    sans.push(pos.san(m));
    pos.make(m);
    fens.push(pos.toFEN());
  }
  return { pos, fens, ucis, sans };
}
// How much winning chance (in percentage points) the move from fens[i] to fens[i+1] gives away.
async function lossOf(pool, fenBefore, fenAfter, depth) {
  const [b, a] = await Promise.all([pool.analyse(fenBefore, depth), pool.analyse(fenAfter, depth)]);
  return { loss: Math.max(0, winPct(b.score) - (100 - winPct(a.score))), before: b, after: a };
}
const grade = (loss) => (loss < 2 ? 'best/excellent' : loss < 5 ? 'good' : loss < 10 ? 'inaccuracy' : loss < 15 ? 'mistake' : 'blunder');
const whiteEval = (score, sideToMove) => coach.formatEval(score, sideToMove);
const sideOf = (fen) => (fen.split(' ')[1] === 'w' ? 0 : 1);

// ---------------------------------------------------------------- 2. the claims in the course text

// Each check returns { ok, detail }.
function claims(pool) {
  const at = (line, i) => play(line).fens[i];
  const moveLoss = async (line, i) => { const g = play(line); return lossOf(pool, g.fens[i], g.fens[i + 1], DEEP); };
  const material = (pos) => pos.material(); // White minus Black, in pawns
  return [
    { chapter: 'Italian Game', claim: 'After 4.Ng5, Black should answer 4…d5', async check() {
      const r = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5', 7);
      return { ok: r.loss < 5, detail: `4…d5 gives away ${r.loss.toFixed(1)} win-% points (${grade(r.loss)})` };
    } },
    { chapter: 'Italian Game', claim: '5…Nxd5 is worse than the main line 5…Na5 (it allows the Fried Liver, 6.Nxf7)', async check() {
      const a = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5', 9);
      const b = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5', 9);
      return { ok: a.loss > b.loss + 3, detail: `5…Nxd5 loses ${a.loss.toFixed(1)}, 5…Na5 loses ${b.loss.toFixed(1)} win-% points` };
    } },
    { chapter: 'Ruy Lopez', claim: 'In the Exchange Variation, 5.Nxe5? Qd4! wins the pawn back', async check() {
      const r = await moveLoss('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5', 8);
      const after = play('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5 Qd4');
      const a = await pool.analyse(after.fens[after.fens.length - 1], DEEP);
      const end = new Core.Position(after.fens[after.fens.length - 1]);
      for (const u of a.pv.slice(0, 6)) end.make(end.moveFromUci(u));
      return { ok: r.loss >= 5 && material(end) <= 0.5, detail: `5.Nxe5 gives away ${r.loss.toFixed(1)} (${grade(r.loss)}); after 5…Qd4 Stockfish's line ends with material ${material(end) > 0 ? '+' : ''}${material(end)} for White` };
    } },
    { chapter: 'Scotch Game', claim: '4.Bc4 is the Scotch Gambit and is playable', async check() {
      const g = play('e4 e5 Nf3 Nc6 d4 exd4 Bc4');
      const name = coach.openingForLine([null, g.pos.key()]);
      const r = await moveLoss('e4 e5 Nf3 Nc6 d4 exd4 Bc4', 6);
      return { ok: !!name && /Scotch Gambit/.test(name.name) && r.loss < 10, detail: `named "${name && name.name}", gives away ${r.loss.toFixed(1)} (${grade(r.loss)})` };
    } },
    { chapter: 'Four Knights Game', claim: 'Halloween Gambit (4.Nxe5?!): Stockfish gives Black a clear advantage', async check() {
      const g = play('e4 e5 Nf3 Nc6 Nc3 Nf6 Nxe5');
      const a = await pool.analyse(g.fens[7], DEEP);
      const w = coach.whiteWinPct(a.score, 1);
      return { ok: w < 40, detail: `after 4.Nxe5 Stockfish rates it ${whiteEval(a.score, 1)}: White's winning chance ${w.toFixed(0)}%` };
    } },
    { chapter: 'Vienna Game', claim: 'The fork trick 3…Nxe4 4.Nxe4 d5 wins the piece back', async check() {
      const g = play('e4 e5 Nc3 Nf6 Bc4 Nxe4 Nxe4 d5');
      const a = await pool.analyse(g.fens[8], DEEP);
      const end = new Core.Position(g.fens[8]);
      for (const u of a.pv.slice(0, 4)) end.make(end.moveFromUci(u));
      return { ok: Math.abs(material(end)) <= 1 && Math.abs(coach.whiteWinPct(a.score, 0) - 50) < 20, detail: `after 4…d5: ${whiteEval(a.score, 0)}; material ${material(end)} after Stockfish's next four moves` };
    } },
    { chapter: 'Vienna Game', claim: '4.Qh5 leads to the Frankenstein–Dracula Variation', async check() {
      const g = play('e4 e5 Nc3 Nf6 Bc4 Nxe4 Qh5');
      const ok = window.MYCHESS_THEORY.lines.some((l) => /Frankenstein-Dracula/.test(l[1]) && l[2].startsWith(g.ucis.join(' ')));
      return { ok, detail: ok ? 'a Lichess line named Frankenstein-Dracula starts this way' : 'no such line' };
    } },
    { chapter: 'King’s Gambit', claim: 'After 3.Nf3, …Qh4+ just loses the queen', async check() {
      const r = await moveLoss('e4 e5 f4 exf4 Nf3 Qh4+', 5);
      return { ok: r.loss >= 15, detail: `3…Qh4+ gives away ${r.loss.toFixed(1)} (${grade(r.loss)})` };
    } },
    { chapter: 'Petrov’s Defence', claim: 'After 3.Nxe5 Nxe4, 4.Qe2! is the answer; 4…Nf6?? loses the queen to 5.Nc6+, and 4…Qe7 is the move', async check() {
      const b = await pool.analyse(at('e4 e5 Nf3 Nf6 Nxe5 Nxe4', 6), DEEP);
      const c = await moveLoss('e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6', 7);
      const q = await pool.analyse(at('e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2', 7), DEEP);
      const queenLost = play('e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6 Nc6+').pos.inCheck();
      return { ok: b.best === 'd1e2' && c.loss >= 15 && q.best === 'd8e7' && queenLost, detail: `Stockfish's reply to 3…Nxe4 is ${b.best}; 4…Nf6 gives away ${c.loss.toFixed(1)} (${grade(c.loss)}) and 5.Nc6+ is a discovered check; Stockfish's defence is ${q.best}` };
    } },
    { chapter: 'Philidor Defence', claim: 'With an early …Nd7, Bc4 puts pressure on f7 and some natural moves already lose', async check() {
      const base = 'e4 e5 Nf3 d6 d4 Nd7 Bc4';
      const tries = [];
      for (const m of ['Be7', 'Ngf6', 'h6', 'c6']) {
        const r = await moveLoss(`${base} ${m}`, 7);
        tries.push(`${m}: ${r.loss.toFixed(1)} (${grade(r.loss)})`);
        tries[m] = r.loss;
      }
      const losing = ['Be7', 'Ngf6', 'h6'].filter((m) => tries[m] >= 10);
      return { ok: losing.length > 0, detail: `after 4.Bc4 — ${tries.join(', ')}` };
    } },
    { chapter: 'Sicilian Defence', claim: 'After the trade on d4, Black has two centre pawns against White’s one', async check() {
      const p = play('e4 c5 Nf3 d6 d4 cxd4 Nxd4').pos;
      let w = 0, b = 0;
      for (let r = 0; r < 8; r++) for (const f of [3, 4]) { const c = p.pieceAt(f, r); if (c === 'P') w++; if (c === 'p') b++; }
      return { ok: w === 1 && b === 2, detail: `d- and e-file pawns: White ${w}, Black ${b}` };
    } },
    { chapter: 'French Defence', claim: 'The queen on b6 attacks b2 and, behind the c5 pawn, d4; 6.a3 is a main move', async check() {
      const g = play('e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6');
      const hits = g.pos.attacksFrom(Core.parseSq('b6'));
      const xray = play('e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 cxd4 cxd4').pos.attacksFrom(Core.parseSq('b6'));
      const r = await moveLoss('e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3', 10);
      return { ok: hits.includes(Core.parseSq('b2')) && !hits.includes(Core.parseSq('d4')) && xray.includes(Core.parseSq('d4')) && r.loss < 5, detail: `Qb6 attacks b2; d4 only once the c-pawns are exchanged; 6.a3 gives away ${r.loss.toFixed(1)} (${grade(r.loss)})` };
    } },
    { chapter: 'Caro-Kann Defence', claim: '5.Qe2 Ngf6?? 6.Nd6 is checkmate', async check() {
      const g = play('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#');
      const r = await moveLoss('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6', 9);
      return { ok: g.pos.outcome() && g.pos.outcome().reason === 'checkmate' && r.loss >= 15, detail: `6.Nd6 is mate on the board; 5…Ngf6 gives away ${r.loss.toFixed(1)} (${grade(r.loss)})` };
    } },
    { chapter: 'Alekhine Defence', claim: 'After c4 the knight usually goes to b6', async check() {
      const a = await pool.analyse(at('e4 Nf6 e5 Nd5 c4', 5), DEEP);
      return { ok: a.best === 'd5b6', detail: `Stockfish's choice after 3.c4: ${a.best}` };
    } },
    { chapter: 'Queen’s Gambit Declined', claim: 'The Elephant Trap: 6.Nxd5?? loses a piece', async check() {
      const r = await moveLoss('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5', 10);
      const end = play('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8').pos;
      return { ok: r.loss >= 15 && material(end) <= -2, detail: `6.Nxd5 gives away ${r.loss.toFixed(1)} (${grade(r.loss)}); after the trap Black is ${-material(end)} points up` };
    } },
    { chapter: 'Queen’s Gambit Accepted', claim: 'Holding the pawn with an early …b5 is risky: 3.e3 b5 is an inaccuracy, and a4 and b3 attack the pawns', async check() {
      const r = await moveLoss('d4 d5 c4 dxc4 e3 b5', 5);
      const g = play('d4 d5 c4 dxc4 e3 b5 a4 c6 axb5 cxb5 b3');
      const a = await pool.analyse(g.fens[g.fens.length - 1], DEEP);
      return { ok: r.loss >= 5 && coach.whiteWinPct(a.score, 1) > 52, detail: `3…b5 gives away ${r.loss.toFixed(1)} (${grade(r.loss)}); after 4.a4 c6 5.axb5 cxb5 6.b3 Stockfish rates it ${whiteEval(a.score, 1)} for White` };
    } },
    { chapter: 'Slav and Semi-Slav', claim: 'After 4…dxc4, 5.a4 stops …b5', async check() {
      const r = await moveLoss('d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4', 8);
      return { ok: r.loss < 5, detail: `5.a4 gives away ${r.loss.toFixed(1)} (${grade(r.loss)})` };
    } },
    { chapter: 'Nimzo-Indian Defence', claim: 'After …Bxc3 White gets doubled c-pawns and the bishop pair', async check() {
      const p = play('d4 Nf6 c4 e6 Nc3 Bb4 a3 Bxc3+ bxc3').pos;
      let c = 0, wb = 0, bb = 0;
      for (let r = 0; r < 8; r++) { if (p.pieceAt(2, r) === 'P') c++; for (let f = 0; f < 8; f++) { if (p.pieceAt(f, r) === 'B') wb++; if (p.pieceAt(f, r) === 'b') bb++; } }
      return { ok: c === 2 && wb === 2 && bb === 1, detail: `White c-pawns ${c}, White bishops ${wb}, Black bishops ${bb}` };
    } },
    { chapter: 'London System', claim: 'Against …c5 and …Qb6, Qb3 is a sound answer', async check() {
      const r = await moveLoss('d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3', 8);
      return { ok: r.loss < 5, detail: `5.Qb3 gives away ${r.loss.toFixed(1)} (${grade(r.loss)})` };
    } },
    { chapter: 'Plan: Blackburne Shilling trap', claim: '4.Nxe5? is a mistake, 5.Nxf7?? a blunder, and after 4.Nxd4 White is clearly better', async check() {
      const a = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5', 6);
      const b = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7', 8);
      const c = await pool.analyse(at('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxd4', 7), DEEP);
      const mate = play('e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5 Nxf7 Qxg2 Rf1 Qxe4+ Be2 Nf3#').pos.outcome();
      const w = coach.whiteWinPct(c.score, 1);
      return { ok: a.loss >= 10 && b.loss >= 15 && w >= 60 && mate && mate.reason === 'checkmate', detail: `4.Nxe5 gives away ${a.loss.toFixed(1)} (${grade(a.loss)}), 5.Nxf7 ${b.loss.toFixed(1)} (${grade(b.loss)}); after 4.Nxd4 ${whiteEval(c.score, 1)} (White ${w.toFixed(0)}%); the final mate works` };
    } },
    { chapter: 'Plan: Légal’s mate', claim: '4…g6? is a mistake, 5.Nxe5! is best, 5…Bxd1?? allows mate, and 5…dxe5 6.Qxg4 leaves White a pawn up', async check() {
      const a = await moveLoss('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6', 7);
      const b = await pool.analyse(at('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6', 8), DEEP);
      const c = await pool.analyse(at('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1', 10), DEEP);
      const p = play('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 dxe5 Qxg4').pos;
      const mate = play('e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6 Nxe5 Bxd1 Bxf7+ Ke7 Nd5#').pos.outcome();
      return { ok: a.loss >= 10 && b.best === 'f3e5' && c.score.mate > 0 && p.material() >= 1 && mate && mate.reason === 'checkmate', detail: `4…g6 gives away ${a.loss.toFixed(1)} (${grade(a.loss)}); best reply ${b.best}; after 5…Bxd1 White has mate in ${c.score.mate}; after 6.Qxg4 material +${p.material()}` };
    } },
    { chapter: 'Plan: Fried Liver Attack', claim: '5…Nxd5?! is an inaccuracy and 6.Nxf7! is Stockfish’s choice', async check() {
      const a = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5', 9);
      const b = await pool.analyse(at('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5', 10), DEEP);
      return { ok: a.loss >= 5 && b.best === 'g5f7', detail: `5…Nxd5 gives away ${a.loss.toFixed(1)} (${grade(a.loss)}); Stockfish’s reply ${b.best}` };
    } },
    { chapter: 'Plan: Scholar’s mate defence', claim: '2…Nc6, 3…g6 and 4…Nf6 are all sound, and 3…Nf6?? allows 4.Qxf7 mate', async check() {
      const l = [await moveLoss('e4 e5 Qh5 Nc6', 3), await moveLoss('e4 e5 Qh5 Nc6 Bc4 g6', 5), await moveLoss('e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6', 7)];
      const mate = play('e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#').pos.outcome();
      return { ok: l.every((r) => r.loss < 5) && mate && mate.reason === 'checkmate', detail: `losses ${l.map((r) => r.loss.toFixed(1)).join(', ')}; 4.Qxf7 is mate on the board` };
    } },
    { chapter: 'Plan: avoiding the Fried Liver', claim: 'After 4.Ng5 d5 5.exd5, 5…Na5 is as good as best', async check() {
      const a = await moveLoss('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5', 9);
      return { ok: a.loss < 2, detail: `5…Na5 gives away ${a.loss.toFixed(1)} (${grade(a.loss)})` };
    } },
    { chapter: 'Plan: Caro-Kann smothered mate', claim: '4…Bf5 avoids the trap and is sound', async check() {
      const a = await moveLoss('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5', 7);
      return { ok: a.loss < 5, detail: `4…Bf5 gives away ${a.loss.toFixed(1)} (${grade(a.loss)})` };
    } },
    { chapter: 'Bird Opening', claim: 'From’s Gambit: 4.Nc3? allows mate starting …Qh4+, 4.Nf3 stops it', async check() {
      const mate = play('f4 e5 fxe5 d6 exd6 Bxd6 Nc3 Qh4+ g3 Bxg3+ hxg3 Qxg3#').pos;
      const a = await moveLoss('f4 e5 fxe5 d6 exd6 Bxd6 Nc3', 6);
      const b = await moveLoss('f4 e5 fxe5 d6 exd6 Bxd6 Nf3', 6);
      return { ok: mate.outcome() && mate.outcome().reason === 'checkmate' && a.loss >= 15 && b.loss < 5, detail: `the mate works on the board; 4.Nc3 gives away ${a.loss.toFixed(1)} (${grade(a.loss)}), 4.Nf3 ${b.loss.toFixed(1)} (${grade(b.loss)})` };
    } },
  ];
}

// ---------------------------------------------------------------- run

(async function main() {
  const t0 = Date.now();
  const pool = await makePool(WORKERS, Core);
  const lib = T.buildLibrary(Core, window.MYCHESS_THEORY);
  const report = { engine: 'Stockfish 19 (lite, WebAssembly, the build MyChess uses)', deep: DEEP, quick: QUICK, mainLines: [], claims: [], library: {} };

  // 1. Course main lines.
  console.log(`1/3 course main lines at depth ${DEEP}…`);
  for (const ch of lib.chapters.filter((c) => c.curated)) {
    const line = lib.lines[ch.mainIdx];
    const pos = new Core.Position();
    const fens = [pos.toFEN()], sans = [];
    for (const u of line.moves) { const m = pos.moveFromUci(u); sans.push(pos.san(m)); pos.make(m); fens.push(pos.toFEN()); }
    const moves = await Promise.all(line.moves.map(async (u, i) => {
      const r = await lossOf(pool, fens[i], fens[i + 1], DEEP);
      const num = i % 2 === 0 ? `${i / 2 + 1}.` : `${(i + 1) / 2}…`;
      return { move: num + sans[i], loss: +r.loss.toFixed(1), grade: grade(r.loss), sfBest: r.before.best === u, evalAfter: whiteEval(r.after.score, sideOf(fens[i + 1])) };
    }));
    report.mainLines.push({ chapter: ch.title, line: line.name, eco: line.eco, moves, final: moves[moves.length - 1].evalAfter });
  }

  // 1b. The study plan: every move you play in your repertoire lines.
  console.log(`1b/3 study plan lines at depth ${DEEP}…`);
  report.plan = [];
  for (const slot of lib.plan) {
    for (const o of slot.options) {
      for (const e of o.lines.concat(o.traps.filter((t) => t.drill !== false))) {
        const l = e.line;
        const pos = new Core.Position();
        const fens = [pos.toFEN()], sans = [];
        for (const u of l.moves) { const m = pos.moveFromUci(u); sans.push(pos.san(m)); pos.make(m); fens.push(pos.toFEN()); }
        const mine = slot.side === 'w' ? 0 : 1;
        const moves = await Promise.all(l.moves.map(async (u, i) => {
          if (i % 2 !== mine) return null;
          const r = await lossOf(pool, fens[i], fens[i + 1], DEEP);
          return { move: (i % 2 === 0 ? `${i / 2 + 1}.` : `${(i + 1) / 2}…`) + sans[i], loss: +r.loss.toFixed(1), grade: grade(r.loss) };
        }));
        const yours = moves.filter(Boolean);
        report.plan.push({ slot: slot.title, option: o.title, line: e.note || e.name, yours, worst: Math.max(0, ...yours.map((m) => m.loss)) });
      }
    }
  }

  // 2. Claims.
  console.log('2/3 claims in the course text…');
  for (const c of claims(pool)) {
    let res;
    try { res = await c.check(); } catch (err) { res = { ok: false, detail: 'error: ' + err.message }; }
    report.claims.push({ chapter: c.chapter, claim: c.claim, ok: res.ok, detail: res.detail });
    console.log(`  ${res.ok ? 'OK ' : 'NO '} ${c.chapter}: ${c.claim} — ${res.detail}`);
  }

  // 3. The whole library: every distinct (position, theory move) pair.
  console.log(`3/3 library screening at depth ${QUICK}…`);
  const edges = new Map(); // "fen|uci" -> { fen, after, uci, lines: Set(names) }
  for (const l of lib.lines) {
    const pos = new Core.Position();
    for (const u of l.moves) {
      const fen = pos.toFEN();
      const m = pos.moveFromUci(u);
      const san = pos.san(m);
      const num = pos.side === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`;
      pos.make(m);
      const k = pos.key() + '|' + u;
      if (!edges.has(k)) edges.set(k, { fen, after: pos.toFEN(), uci: u, move: num + san, line: l.name, eco: l.eco });
    }
  }
  const all = [...edges.values()];
  let done = 0;
  await Promise.all(all.map(async (e) => {
    const r = await lossOf(pool, e.fen, e.after, QUICK);
    e.loss = r.loss;
    e.evalAfter = whiteEval(r.after.score, sideOf(e.after));
    if (++done % 1000 === 0) console.log(`  ${done} of ${all.length}`);
  }));
  const counts = { 'best/excellent': 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
  for (const e of all) counts[grade(e.loss)]++;
  report.library = {
    moves: all.length,
    counts,
    worst: all.sort((a, b) => b.loss - a.loss).slice(0, 40).map((e) => ({ move: e.move, line: e.line, eco: e.eco, loss: +e.loss.toFixed(1), evalAfter: e.evalAfter })),
  };
  pool.quit();
  report.seconds = Math.round((Date.now() - t0) / 1000);

  fs.writeFileSync(path.join(__dirname, '..', 'research', 'theory-audit.json'), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(__dirname, '..', 'THEORY-AUDIT.md'), markdown(report));
  console.log(`done in ${report.seconds} s: THEORY-AUDIT.md and research/theory-audit.json`);
})();

// ---------------------------------------------------------------- the report

function markdown(r) {
  const pct = (n) => ((100 * n) / r.library.moves).toFixed(1) + '%';
  const okClaims = r.claims.filter((c) => c.ok).length;
  const mainMoves = r.mainLines.reduce((n, l) => n + l.moves.length, 0);
  const mainFlagged = r.mainLines.flatMap((l) => l.moves.filter((m) => m.loss >= 5).map((m) => `${l.chapter} ${m.move}`));
  const c = r.library.counts;
  let s = `# Theory audit\n\nGenerated by \`node tools/audit-theory.js\` with ${r.engine}, in ${r.seconds} seconds. Raw results: \`research/theory-audit.json\`.\n\n`;
  s += '## How to read it\n\n';
  s += 'Each theory move is compared with Stockfish’s best move in the same position. **Loss** is how many percentage points of winning chance the move gives away (the Lichess formula the coach uses everywhere): under 2 is as good as best, under 5 is good, 5–10 is an inaccuracy, 10–15 a mistake, 15 or more a blunder. Evaluations are from White’s side.\n\n';
  s += 'Where the content comes from:\n\n';
  s += '- **Move orders and names**: the Lichess opening list (CC0), 3,865 named lines. Every line replays legally (`tests/test-theory.js`).\n';
  s += '- **Evaluations and “Stockfish disagrees”**: Stockfish 19, checked below.\n';
  s += '- **“Good to know” traps and claims**: written for the course, and every one that can be tested is tested below, on the board and with Stockfish.\n';
  s += '- **Plans and ideas**: general opening advice written for the course. It is standard teaching, but it is advice, not something an engine can prove.\n\n';
  s += '## Summary\n\n';
  s += `- **Course main lines:** ${r.mainLines.length} lines, ${mainMoves} moves at depth ${r.deep}. ${mainFlagged.length ? `${mainFlagged.length} move(s) give away 5 or more points: ${mainFlagged.join(', ')}.` : 'Every move is within 5 points of Stockfish’s best.'}\n`;
  const planWorst = Math.max(...r.plan.map((p) => p.worst));
  s += `- **Study plan:** ${r.plan.length} lines; every move you play is ${planWorst < 5 ? 'good or better' : 'checked below'} (worst: ${planWorst} points).\n`;
  s += `- **Claims in the course text and plan:** ${okClaims} of ${r.claims.length} confirmed.\n`;
  s += `- **Whole library:** ${r.library.moves} distinct theory moves at depth ${r.quick}: ${pct(c['best/excellent'] + c.good)} are good or better, ${pct(c.inaccuracy)} inaccuracies, ${pct(c.mistake)} mistakes, ${pct(c.blunder)} blunders. The dubious ones are real lines people play (gambits and traps such as the Englund, Grob and Jerome); the app marks each of them “Stockfish disagrees” when you study it.\n\n`;
  s += '## 1. Course main lines\n\n';
  for (const l of r.mainLines) {
    s += `### ${l.chapter}: ${l.line} (${l.eco})\n\n| Move | Loss | Verdict | Stockfish’s first choice | Eval after |\n|---|---|---|---|---|\n`;
    for (const m of l.moves) s += `| ${m.move} | ${m.loss} | ${m.grade} | ${m.sfBest ? 'yes' : ''} | ${m.evalAfter} |\n`;
    s += '\n';
  }
  s += '## 1b. Your moves in the study plan\n\nEvery move you play in each line of the Road to 1000 plan (traps where your own side blunders are for learning only, so they are left out).\n\n| Repertoire | Line | Your moves | Worst loss |\n|---|---|---|---|\n';
  for (const p of r.plan) s += `| ${p.slot}: ${p.option} | ${p.line} | ${p.yours.map((m) => m.move).join(' ')} | ${p.worst} (${p.worst < 2 ? 'best/excellent' : p.worst < 5 ? 'good' : 'check'}) |\n`;
  s += '\n';
  s += '## 2. Claims in the course text\n\n| | Opening | Claim | What was checked |\n|---|---|---|---|\n';
  for (const cl of r.claims) s += `| ${cl.ok ? '✅' : '❌'} | ${cl.chapter} | ${cl.claim} | ${cl.detail} |\n`;
  s += `\n## 3. Whole library (depth ${r.quick} screening)\n\n| Verdict | Moves |\n|---|---|\n`;
  for (const [k, v] of Object.entries(c)) s += `| ${k} | ${v} (${pct(v)}) |\n`;
  s += '\nThe 40 theory moves Stockfish likes least (depth ' + r.quick + '; a quick pass, so treat single results with care):\n\n| Move | Line | Loss | Eval after |\n|---|---|---|---|\n';
  for (const w of r.library.worst) s += `| ${w.move} | ${w.eco} ${w.line} | ${w.loss} | ${w.evalAfter} |\n`;
  return s;
}
