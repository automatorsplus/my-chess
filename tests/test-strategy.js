// Run with: node tests/test-strategy.js
// Checks Strategy mode: every lesson's rule recognises its idea on a hand-made
// position (and nothing that gives check), and every exercise in the data is a
// legal position whose answer really is the lesson's idea.
global.window = global;
const Core = require('../js/core.js')();
const S = require('../js/strategy-rules.js');
const { detect } = S.rules(Core);

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

for (const l of S.LESSONS) check(`lesson "${l.title}" has an idea, three rules and a task`, !!l.idea && l.rules.length === 3 && !!l.task);

// [lesson, FEN, move, should it match?]
const cases = [
  ['outpost', '4k3/pp3ppp/8/8/2P1P3/2N5/PP3PPP/4K3 w - - 0 20', 'c3d5', true],
  ['outpost', '4k3/pp2pppp/8/8/2P1P3/2N5/PP3PPP/4K3 w - - 0 20', 'c3d5', false], // the e7 pawn can still play …e6
  ['centralize', '4k3/pp3ppp/8/8/8/7N/PP3PPP/4K3 w - - 0 20', 'h3f4', true],
  ['centralize', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'g1f3', false], // ordinary development is not this lesson
  ['openFile', '4k3/pp3ppp/8/8/8/8/PP3PPP/R3K3 w - - 0 20', 'a1d1', true],
  ['doubleRooks', '4k3/pp3ppp/8/8/8/8/PP1R1PPP/R5K1 w - - 0 20', 'a1d1', true],
  ['seventh', '6k1/pp3ppp/8/8/8/8/5PPP/3R2K1 w - - 0 30', 'd1d7', true],
  ['passedPawn', '4k3/8/8/3P4/8/8/8/4K3 w - - 0 40', 'd5d6', true],
  ['pawnBreak', 'r1bqkbnr/pp3ppp/2n1p3/2ppP3/3P4/2P2N2/PP3PPP/RNBQKB1R b KQkq - 0 10', 'f7f6', true],
  ['space', 'rnbqkb1r/pp3ppp/4pn2/2p5/2B1P3/5N2/PPP2PPP/RNBQK2R w KQkq - 0 10', 'e4e5', true],
  ['blockade', '4k3/pp3ppp/8/3p4/8/1N6/PP3PPP/4K3 w - - 0 20', 'b3d4', true],
  ['blockade', '4k3/pp3ppp/8/8/3p4/8/PP3PPP/2N1K3 w - - 0 20', 'c1e2', false], // not in front of the pawn
  ['isolatedPawn', '4k3/pp3ppp/8/3p4/8/2N5/PP3PPP/R3K3 w - - 0 20', 'a1d1', true],
  ['minority', '4k3/pp3ppp/2p5/3p4/1P1P4/8/P4PPP/4K3 w - - 0 20', 'b4b5', true],
  ['luft', '3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 30', 'h2h3', true],
  ['pawnStorm', '6k1/5ppp/8/8/8/8/5PPP/2K5 w - - 0 20', 'g2g4', true],
  ['tradeWhenAhead', '8/8/3k4/3n4/8/2N5/8/R3K3 w - - 0 30', 'c3d5', true],
  ['tradeWhenAhead', '8/8/3k4/3n4/8/2N5/8/4K3 w - - 0 30', 'c3d5', false], // not ahead
];
for (const [lesson, fen, uci, want] of cases) {
  const got = detect(fen, uci);
  const hit = got.find((d) => d.lesson === lesson);
  check(`rule "${lesson}" ${want ? 'recognises' : 'rejects'} ${uci}`, !!hit === want, hit ? hit.text : got.map((d) => d.lesson).join(', ') || 'no lesson');
}
check('moves that give check are never strategy', detect('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 30', 'd1d8').length === 0);

// The exercises.
let data = null;
try { require('../js/strategy-data.js'); data = window.MYCHESS_STRATEGY; } catch (e) { data = null; }
check('exercise data loaded', !!data);
if (data) {
  let total = 0, bad = [];
  for (const l of S.LESSONS) {
    const list = data.lessons[l.id] || [];
    total += list.length;
    for (const [fen, answer, alts, cp] of list) {
      const pos = new Core.Position(fen);
      const ok = pos.isLegalSetup() && !pos.inCheck() && pos.fullmove >= 10 && !!pos.moveFromUci(answer) &&
        detect(fen, answer).some((d) => d.lesson === l.id) && alts.every((a) => !!pos.moveFromUci(a) && detect(fen, a).some((d) => d.lesson === l.id)) &&
        Math.abs(cp) <= (l.id === 'tradeWhenAhead' ? 900 : 300);
      if (!ok) bad.push(`${l.id} ${fen} ${answer}`);
    }
    console.log(`      ${l.title}: ${list.length} exercises`);
  }
  check('every exercise is legal, from move 10 on, and its answer is the lesson’s idea', bad.length === 0, bad.length ? bad.slice(0, 3).join(' | ') : `${total} exercises`);
}

console.log(failures ? `\n${failures} check(s) failed` : '\nAll strategy checks passed');
process.exit(failures ? 1 : 0);
