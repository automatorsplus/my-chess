// Run with: node tests/test-coach.js
// Drives the bundled Stockfish build over UCI and checks the coach's grades,
// explanations and opening names on a few known positions.
const path = require('path');
const { spawn } = require('child_process');

global.window = global;
require('../js/openings-data.js');
const Core = require('../js/core.js')();
require('../js/coach.js');
require('../js/analyzer.js');
const coach = window.MyChessCoach(Core);
const { parseInfo } = window.MyChessAnalyzer;

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// Minimal UCI driver for the WebAssembly Stockfish running under Node.
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
    const l = (line) => { if (line.startsWith('info ') && line.includes(' score ')) { const p = parseInfo(line); if (!p.bound) last = p; } };
    listeners.push(l);
    send(`position fen ${fen}`);
    send('go depth 16');
    const best = (await waitFor('bestmove')).split(' ')[1];
    listeners.splice(listeners.indexOf(l), 1);
    return { score: last ? last.score : { cp: 0 }, best: best === '(none)' ? null : best, pv: last && last.pv ? last.pv : [], depth: last ? last.depth : 0 };
  }
  return {
    async init() { send('uci'); await waitFor('uciok'); send('isready'); await waitFor('readyok'); },
    analyse,
    quit() { send('quit'); proc.kill(); },
  };
}

function line(sans) {
  const pos = new Core.Position();
  const fens = [pos.toFEN()], keys = [pos.key()], ucis = [];
  for (const san of sans) {
    const m = pos.moveFromSan(san);
    if (!m) throw new Error('bad move ' + san);
    ucis.push(pos.moveToUci(m));
    pos.make(m);
    fens.push(pos.toFEN());
    keys.push(pos.key());
  }
  return { fens, keys, ucis };
}

async function reviewLast(sf, sans, who) {
  const g = line(sans);
  const i = sans.length - 1;
  const before = await sf.analyse(g.fens[i]);
  const after = await sf.analyse(g.fens[i + 1]);
  const book = coach.isBook(g.keys[i + 1]);
  const opening = coach.openingForLine(g.keys.slice(0, i + 2));
  return coach.review({ fenBefore: g.fens[i], fenAfter: g.fens[i + 1], uci: g.ucis[i], before, after, book, opening, who: who || 'you' });
}

(async () => {
  // Pure helpers first.
  check('win% of an equal position is 50', Math.abs(coach.winPct({ cp: 0 }) - 50) < 1e-9);
  check('win% when mating is 100', coach.winPct({ mate: 3 }) === 100);
  check('accuracy of a perfect move is ~100', Math.round(coach.accuracyFromLoss(0)) === 100);
  check('eval formatting', coach.formatEval({ cp: 135 }, 1) === '−1.4', coach.formatEval({ cp: 135 }, 1));

  const g = line(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  const o = coach.openingForLine(g.keys);
  check('opening name after 1.e4 e5 2.Nf3 Nc6 3.Bc4', o && o.name === 'Italian Game' && o.eco === 'C50', o && `${o.eco} ${o.name}`);
  check('opening idea text', o && o.idea.includes('f7'));
  const sic = coach.openingForLine(line(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']).keys);
  check('Najdorf is recognised', sic && sic.name.includes('Najdorf'), sic && sic.name);
  const trans = coach.openingForLine(line(['Nf3', 'd5', 'd4']).keys);
  check('transposition still gets a name', !!trans, trans && trans.name);

  const pos = new Core.Position('2r3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1');
  check('fork is described', coach.describeMove(pos.toFEN(), 'd5e7', ['d5e7'], { cp: -300 }) === 'forks the king and rook', coach.describeMove(pos.toFEN(), 'd5e7', ['d5e7'], { cp: -300 }));

  // Mate counts include the move itself (puzzle vvmMC: 30.Qxf8+ Rxf8 31.Rxf8#).
  const backRank = '5r1k/p4rnp/1pp3q1/3p4/1Q3R2/2P3PP/PP2R1B1/6K1 w - - 1 30';
  const mate2 = coach.describeMove(backRank, 'b4f8', ['b4f8', 'f7f8', 'f4f8'], { mate: -1 });
  check('Qxf8+ with Black mated next move reads "mate in 2"', mate2 === 'starts a forced mate in 2', mate2);
  check('afterScore: mate in 2 before the move is "mated in 1" after it', JSON.stringify(coach.afterScore({ mate: 2 })) === '{"mate":-1}', JSON.stringify(coach.afterScore({ mate: 2 })));
  check('afterScore: being mated stays being mated', JSON.stringify(coach.afterScore({ mate: -3 })) === '{"mate":3}');
  const viaBefore = coach.describeMove(backRank, 'b4f8', ['b4f8', 'f7f8', 'f4f8'], coach.afterScore({ mate: 2 }));
  check('the before-score route gives the same count', viaBefore === mate2, viaBefore);
  check('early queen move gets a tip', coach.principleTip(line(['e4', 'e5']).fens[2], 'd1h5').includes('queen'));

  const sf = startStockfish();
  await sf.init();

  let r = await reviewLast(sf, ['e4', 'e5', 'Nf3', 'Nc6']);
  check('2…Nc6 is a book move', r.kind === 'book', `${r.label}: ${r.text}`);

  r = await reviewLast(sf, ['g4']);
  check('1.g4 is named but not excused as "Book"', r.kind !== 'book' && /Grob/.test(r.text), `${r.label} (loss ${r.loss.toFixed(1)}): ${r.text}`);

  r = await reviewLast(sf, ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6']);
  check('3…Nf6?? walks into Qxf7# (blunder)', r.kind === 'blunder' && /mate/.test(r.text), `${r.label}: ${r.text}`);
  check('the coach names a better move', r.better && r.better.san, r.better && `Better was ${r.better.san}, which ${r.better.why}. ${r.better.line}`);

  r = await reviewLast(sf, ['e4', 'e5', 'Nf3', 'Qg5']);
  check('2…Qg5?? hangs the queen (blunder)', r.kind === 'blunder' && /queen/.test(r.text) && /Nxg5/.test(r.text), `${r.label}: ${r.text}`);
  check('tip about bringing the queen out early', /queen/.test(r.tip), r.tip);

  r = await reviewLast(sf, ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'e6', 'Nf3', 'c5', 'c3', 'Nc6', 'Nbd2', 'Bd6', 'Bg3', 'O-O', 'Bd3', 'b6', 'h4']);
  check('a quiet middlegame move gets a non-book grade', r.kind !== 'book', `${r.label} (loss ${r.loss.toFixed(1)}): ${r.text}`);

  sf.quit();
  console.log(failures ? `\n${failures} failure(s)` : '\nAll coach tests passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
