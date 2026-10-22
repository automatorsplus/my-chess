// Run with: node tests/test-endgames.js
// Checks the endgame drills against the real Stockfish build: positions are
// legal, start in the right state (winning or holdable), verdicts separate
// right from wrong moves, technique comments fire, and full mates are reached.
const path = require('path');
const { spawn } = require('child_process');

global.window = global;
const Core = require('../js/core.js')();
require('../js/endgames.js');
const EG = window.MyChessEndgames;
const H = EG.helpers(Core);

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function startStockfish() {
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'engine', 'stockfish-19-lite-single.js')]);
  let buf = '';
  const listeners = [];
  proc.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      for (const l of listeners.slice()) l(line);
    }
  });
  const send = (c) => proc.stdin.write(c + '\n');
  const waitFor = (prefix) => new Promise((resolve) => {
    const l = (line) => { if (line.startsWith(prefix)) { listeners.splice(listeners.indexOf(l), 1); resolve(line); } };
    listeners.push(l);
  });
  async function analyse(fen) {
    let last = null;
    const l = (line) => {
      const m = / score (cp|mate) (-?\d+)/.exec(line);
      if (line.startsWith('info ') && m && !line.includes('bound')) last = m[1] === 'mate' ? { mate: +m[2] } : { cp: +m[2] };
    };
    listeners.push(l);
    send(`position fen ${fen}`);
    send('go depth 22 movetime 1500');
    const best = (await waitFor('bestmove')).split(' ')[1];
    listeners.splice(listeners.indexOf(l), 1);
    return { score: last || { cp: 0 }, best: best === '(none)' ? null : best, pv: best ? [best] : [] };
  }
  return {
    async init() { send('uci'); await waitFor('uciok'); send('isready'); await waitFor('readyok'); },
    analyse,
    quit() { send('quit'); proc.kill(); },
  };
}

const play = (fen, san) => { const p = new Core.Position(fen); const m = p.moveFromSan(san); if (!m) throw new Error(`bad ${san} in ${fen}`); p.make(m); return p; };

(async () => {
  // ---- positions
  for (const d of EG.DRILLS) {
    if (typeof d.positions === 'string') continue;
    for (const fen of d.positions) check(`${d.title}: legal position ${fen}`, new Core.Position(fen).isLegalSetup() && new Core.Position(fen).side === d.user);
  }
  let okRandom = true;
  for (let i = 0; i < 400; i++) {
    for (const piece of ['Q', 'R']) {
      const fen = EG.randomMatePosition(Core, piece);
      const pos = new Core.Position(fen);
      const bk = pos.kingSq[1];
      const black = new Core.Position(fen.replace(' w ', ' b '));
      if (!pos.isLegalSetup() || black.legalMoves().length < 3 || H.cheb(bk, pos.kingSq[0]) < 3) okRandom = false;
    }
  }
  check('400 random queen and rook mate starts are legal and not cramped', okRandom);

  // ---- board helpers
  const keys = (sq, side) => H.keySquares(Core.parseSq(sq), side).map(H.name).join(' ');
  check('key squares of a pawn on e2', keys('e2', 0) === 'd4 e4 f4', keys('e2', 0));
  check('key squares of a pawn on e5', keys('e5', 0) === 'd6 e6 f6 d7 e7 f7', keys('e5', 0));
  check('key squares of a black pawn on d7', keys('d7', 1) === 'c5 d5 e5', keys('d7', 1));
  check('opposition is detected', H.opposition(new Core.Position('8/8/4k3/8/4K3/8/8/8 w - - 0 1')) && !H.opposition(new Core.Position('8/8/3k4/8/4K3/8/8/8 w - - 0 1')));
  const boxFar = H.boxSize(new Core.Position('8/8/8/1k6/8/8/8/K4R2 w - - 0 1'), 1);
  const boxNear = H.boxSize(new Core.Position('8/8/8/1k6/8/8/8/K1R5 w - - 0 1'), 1);
  check('a rook closer to the king leaves a smaller box', boxNear < boxFar, `rook on f-file ${boxFar}, on c-file ${boxNear}`);

  // ---- verdicts (pure)
  check('faster mate is "Perfect"', EG.verdict('mate', { score: { mate: 8 } }, { score: { mate: -7 } }).kind === 'best');
  check('slower mate is not an error', EG.verdict('mate', { score: { mate: 8 } }, { score: { mate: -10 } }).kind === 'ok');
  check('giving away the win is an error', EG.verdict('mate', { score: { mate: 8 } }, { score: { cp: 0 } }).kind === 'error');
  check('a draw turning lost is an error', EG.verdict('draw', { score: { cp: -20 } }, { score: { mate: 9 } }).kind === 'error');

  const sf = startStockfish();
  await sf.init();

  // ---- every fixed drill starts in the right state
  for (const d of EG.DRILLS) {
    if (typeof d.positions === 'string') continue;
    for (const fen of d.positions) {
      const r = await sf.analyse(fen);
      const s = r.score;
      const win = (s.mate !== undefined && s.mate > 0) || (s.cp !== undefined && s.cp >= 300);
      const lost = (s.mate !== undefined && s.mate <= 0) || (s.cp !== undefined && s.cp <= -350);
      check(`${d.title} starts ${d.goal === 'draw' ? 'holdable' : 'winning'} (${JSON.stringify(s)})`, d.goal === 'draw' ? !lost : win);
      check(`${d.title} has a plan for the start`, EG.plan(d.id, H, new Core.Position(fen), d.user).length > 10);
    }
  }

  // ---- right and wrong moves
  async function judge(goal, fen, san) {
    const before = await sf.analyse(fen);
    const after = await sf.analyse(play(fen, san).toFEN());
    return EG.verdict(goal, before, after).kind;
  }
  const ow = '8/8/4k3/8/8/4K3/4P3/8 w - - 0 1';
  check('Opposition win: 1.Ke4 keeps the win', (await judge('promote', ow, 'Ke4')) !== 'error');
  check('Opposition win: 1.Kd2 throws it away', (await judge('promote', ow, 'Kd2')) === 'error');
  const od = '4k3/8/8/3K4/4P3/8/8/8 b - - 0 1';
  check('Opposition hold: 1…Kd7 holds', (await judge('draw', od, 'Kd7')) !== 'error');
  check('Opposition hold: 1…Ke7 loses', (await judge('draw', od, 'Ke7')) === 'error');
  const ph = '4k3/R7/1r6/3KP3/8/8/8/8 b - - 0 1';
  check('Philidor: 1…Rh6 holds', (await judge('draw', ph, 'Rh6')) !== 'error');
  check('Philidor: 1…Ra6?? loses', (await judge('draw', ph, 'Ra6')) === 'error');

  // ---- technique comments
  const lu = '1K6/1P1k4/8/8/8/8/2r5/5R2 w - - 0 1';
  const lu1 = play(lu, 'Rd1+'), lu2 = play(lu1.toFEN(), 'Ke7');
  const lu3 = play(lu2.toFEN(), 'Rd4');
  const bridge = EG.comment('lucena', H, lu2, lu3, 'd1d4', 0);
  check('Lucena: Rd4 is recognised as the bridge', /bridge/.test(bridge), bridge);
  const cut = EG.comment('lucena', H, lu1, lu2, 'f1d1', 0);
  check('Lucena: a check from the side is not yet called a cut-off', !/cuts/.test(EG.comment('lucena', H, new Core.Position(lu), lu1, 'f1d1', 0)));
  const planCut = EG.plan('lucena', H, lu2, 0);
  check('Lucena: once the king is beyond the d-file, the plan is to build the bridge', /bridge/.test(planCut), planCut);
  const planStart = EG.plan('lucena', H, new Core.Position(lu), 0);
  check('Lucena: at the start the plan is to cut the king off', /Cut the black king off/.test(planStart), planStart);
  const phMove = EG.comment('philidor', H, new Core.Position(ph), play(ph, 'Rh6'), 'b6h6', 1);
  check('Philidor: rook on the third rank is praised', /third rank/.test(phMove), phMove);
  const odMove = EG.comment('oppositionDraw', H, new Core.Position(od), play(od, 'Kd7'), 'e8d7', 1);
  check('Opposition hold: Kd7 takes the opposition', /opposition/.test(odMove), odMove);
  const owMove = EG.comment('oppositionWin', H, new Core.Position(ow), play(ow, 'Ke4'), 'e3e4', 0);
  check('Opposition win: Ke4 reaches a key square', /key square/.test(owMove), owMove);

  // ---- full mates against Stockfish's best defence
  for (const [piece, limit] of [['Q', 25], ['R', 45]]) {
    const fen = EG.randomMatePosition(Core, piece);
    const pos = new Core.Position(fen);
    let moves = 0, mated = false, boxes = [];
    while (moves < limit) {
      const r = await sf.analyse(pos.toFEN());
      if (!r.best) break;
      pos.make(pos.moveFromUci(r.best));
      if (pos.side === 1) { moves++; boxes.push(piece === 'R' ? H.rookBox(pos, 1) : H.boxSize(pos, 1)); }
      const o = pos.outcome();
      if (o) { mated = o.reason === 'checkmate'; break; }
    }
    check(`${piece === 'Q' ? 'Queen' : 'Rook'} mate from ${fen} is reached by best play`, mated, `${moves} moves; box sizes ${boxes.join(' ')}`);
    check(`${piece === 'Q' ? 'Queen' : 'Rook'} mate: the box gets smaller along the way`, boxes.length > 1 && Math.min(...boxes) < boxes[0]);
  }

  sf.quit();
  console.log(failures ? `\n${failures} failure(s)` : '\nAll endgame tests passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
