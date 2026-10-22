// Run with: node tests/test-puzzles.js
// Checks the bundled puzzle set: every lesson has puzzles across ratings, and
// every puzzle replays legally with the solver to move after the setup move.
global.window = global;
require('../js/puzzles-data.js');
const Core = require('../js/core.js')();
require('../js/puzzles.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const { themes, puzzles } = window.MYCHESS_PUZZLES;
check('puzzle set loaded', puzzles.length > 10000, `${puzzles.length} puzzles`);

for (const lesson of window.MyChessPuzzles.LESSONS) {
  if (lesson.id === 'mix') continue;
  const ti = themes.indexOf(lesson.id);
  const mine = puzzles.filter((p) => p[4].includes(ti));
  const low = mine.filter((p) => p[3] < 1200).length, high = mine.filter((p) => p[3] >= 1800).length;
  check(`lesson "${lesson.title}" has puzzles at several levels`, ti >= 0 && mine.length >= 300 && low > 0 && high > 0, `${mine.length} (under 1200: ${low}, 1800+: ${high})`);
}

let bad = 0, wrongSide = 0, mateOk = 0, mates = 0;
for (const [id, fen, moves] of puzzles) {
  const pos = new Core.Position(fen);
  const list = moves.split(' ');
  const solver = pos.side ^ 1;
  for (let i = 0; i < list.length; i++) {
    const m = pos.moveFromUci(list[i]);
    if (!m || !pos.make(m)) { bad++; break; }
    if (i === 0 && pos.side !== solver) wrongSide++;
  }
  if (list.length % 2 === 0) { // the solver plays the last move
    const o = pos.outcome();
    if (o && o.reason === 'checkmate') { mates++; mateOk++; }
  }
}
check('every puzzle replays legally', bad === 0, `${bad} bad`);
check('solver is to move after the setup move', wrongSide === 0);
check('mate puzzles end in checkmate', mates > 1000, `${mateOk} end in mate`);

console.log(failures ? `\n${failures} failure(s)` : '\nAll puzzle tests passed');
process.exit(failures ? 1 : 0);
