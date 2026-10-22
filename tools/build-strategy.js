// Builds js/strategy-data.js: middlegame exercises for the Strategy lessons, and
// STRATEGY-AUDIT.md describing how they were chosen and checked.
//
//  1. From the end of every Lichess opening line, Stockfish plays on for a number
//     of moves (depth 12), giving thousands of realistic middlegame positions.
//  2. Wherever Stockfish's move matches a lesson's rule (js/strategy-rules.js),
//     the position becomes a candidate.
//  3. Each candidate is searched again with the three best moves (depth 18). It is
//     kept only if the best move is still the lesson's idea, it is clearly better
//     than any move that is not, and the position is not already decided.
//  4. Every exercise kept is checked once more, deeper (depth 22).
//
// Usage: node tools/build-strategy.js [--workers 9] [--plies 30] [--per 40] [--limit N]
const path = require('path');
const fs = require('fs');

global.window = global;
global.self = global;
require('../js/openings-data.js');
require('../js/theory-data.js');
const Core = require('../js/core.js')();
const coach = require('../js/coach.js')(Core);
const S = require('../js/strategy-rules.js');
const T = require('../js/theory.js');
// Positions from the main openings come first, so the exercises look like real games.
const MAIN = new Set(T.CHAPTERS.flatMap((c) => c.families));
const { makePool } = require('./stockfish-pool.js');

const arg = (name, def) => { const i = process.argv.indexOf('--' + name); return i > 0 ? +process.argv[i + 1] : def; };
const WORKERS = arg('workers', 9), PLIES = arg('plies', 30), PER = arg('per', 40), LIMIT = arg('limit', 0);
const QUICK = 12, DEEP = 18, CHECK = 22, MARGIN = 2.5, SAME = 1.5;
const { detect } = S.rules(Core);
const key = (fen) => fen.split(' ').slice(0, 4).join(' ');
const winOf = (score) => coach.winPct(score); // for the side to move

// A small deterministic shuffle, so rebuilding gives the same exercises.
function shuffle(list, seed) {
  let s = seed >>> 0;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list;
}

(async function main() {
  const t0 = Date.now();
  const pool = await makePool(WORKERS, Core);
  // Distinct end positions of the opening lines.
  const starts = new Map();
  for (const [eco, name, ucis] of window.MYCHESS_THEORY.lines) {
    const pos = new Core.Position();
    for (const u of ucis.split(' ')) pos.make(pos.moveFromUci(u));
    if (!starts.has(key(pos.toFEN()))) starts.set(key(pos.toFEN()), { fen: pos.toFEN(), name, family: name.split(/[:,]/)[0] });
  }
  let list = [...starts.values()];
  if (LIMIT) list = list.slice(0, LIMIT);
  console.log(`1/4 Stockfish plays on from ${list.length} opening positions, ${PLIES} plies each…`);
  const candidates = new Map(); // lesson -> Map(key -> candidate)
  let done = 0, positions = 0;
  await Promise.all(list.map(async (st) => {
    const pos = new Core.Position(st.fen);
    for (let ply = 0; ply < PLIES; ply++) {
      if (pos.outcome()) break;
      const fen = pos.toFEN();
      const r = await pool.analyse(fen, QUICK);
      positions++;
      if (!r.best) break;
      const s = r.score;
      if (s.mate === undefined && Math.abs(s.cp) <= 700 && pos.fullmove >= 10) {
        for (const d of detect(fen, r.best)) {
          if (!candidates.has(d.lesson)) candidates.set(d.lesson, new Map());
          const m = candidates.get(d.lesson);
          if (!m.has(key(fen))) m.set(key(fen), { fen, uci: r.best, name: st.name, family: st.family, quick: s });
        }
      }
      const mv = pos.moveFromUci(r.best);
      if (!mv) break;
      pos.make(mv);
    }
    if (++done % 250 === 0) console.log(`  ${done} of ${list.length} playouts`);
  }));
  for (const l of S.LESSONS) console.log(`  ${l.id}: ${candidates.has(l.id) ? candidates.get(l.id).size : 0} candidates`);

  console.log(`2/4 checking candidates with Stockfish's three best moves (depth ${DEEP})…`);
  const chosen = {};
  const stats = {};
  await Promise.all(S.LESSONS.map(async (lesson, li) => {
    const all = shuffle([...(candidates.get(lesson.id) || new Map()).values()], 1000 + li);
    const cands = all.filter((c) => MAIN.has(c.family)).concat(all.filter((c) => !MAIN.has(c.family)));
    const keep = [];
    const perLine = new Map(), perFamily = new Map();
    const st = stats[lesson.id] = { candidates: cands.length, checked: 0, kept: 0, rejected: { notBest: 0, margin: 0, decided: 0 } };
    const maxCp = lesson.id === 'tradeWhenAhead' ? 900 : 300;
    for (const c of cands) {
      if (keep.length >= PER) break;
      if ((perLine.get(c.name) || 0) >= 1 || (perFamily.get(c.family) || 0) >= 4) continue;
      st.checked++;
      const r = await pool.analyse(c.fen, DEEP, 3);
      const lines = r.lines && r.lines.length ? r.lines : [{ score: r.score, best: r.best }];
      const best = lines[0];
      if (best.score.mate !== undefined || Math.abs(best.score.cp) > maxCp) { st.rejected.decided++; continue; }
      const fits = (uci) => detect(c.fen, uci).some((d) => d.lesson === lesson.id);
      if (!fits(best.best)) { st.rejected.notBest++; continue; }
      const top = winOf(best.score);
      const alts = lines.map((l) => ({ uci: l.best, loss: Math.max(0, top - winOf(l.score)), fits: fits(l.best) }));
      const rival = alts.slice(1).find((a) => !a.fits);
      if (rival && rival.loss < MARGIN) { st.rejected.margin++; continue; }
      const text = detect(c.fen, best.best).find((d) => d.lesson === lesson.id).text;
      keep.push({ fen: c.fen, answer: best.best, alts: alts.filter((a) => a.fits && a.loss <= SAME).map((a) => a.uci), cp: best.score.cp, name: c.name, text });
      perLine.set(c.name, 1);
      perFamily.set(c.family, (perFamily.get(c.family) || 0) + 1);
    }
    chosen[lesson.id] = keep;
  }));

  console.log(`3/4 checking every exercise again at depth ${CHECK}…`);
  await Promise.all(Object.entries(chosen).map(async ([id, list]) => {
    const kept = [];
    const maxCp = id === 'tradeWhenAhead' ? 900 : 300;
    for (const e of list) {
      const r = await pool.analyse(e.fen, CHECK);
      const ok = r.best === e.answer || e.alts.includes(r.best) || detect(e.fen, r.best).some((d) => d.lesson === id);
      if (ok && r.score.mate === undefined && Math.abs(r.score.cp) <= maxCp) { e.cp = r.score.cp; kept.push(e); } else stats[id].droppedDeep = (stats[id].droppedDeep || 0) + 1;
    }
    chosen[id] = kept;
    stats[id].kept = kept.length;
  }));
  pool.quit();

  console.log('4/4 writing js/strategy-data.js and STRATEGY-AUDIT.md');
  const data = {};
  for (const [id, list] of Object.entries(chosen)) data[id] = list.map((e) => [e.fen, e.answer, e.alts, e.cp, e.name, e.text]);
  fs.writeFileSync(path.join(__dirname, '..', 'js', 'strategy-data.js'),
    `// Generated by tools/build-strategy.js: middlegame exercises checked with Stockfish 19 (depth ${DEEP}, re-checked at ${CHECK}).\n` +
    '// Each exercise: [FEN, answer (UCI), other moves that are just as good and show the same idea, Stockfish eval in centipawns for the side to move, opening it grew from, explanation].\n' +
    'window.MYCHESS_STRATEGY = ' + JSON.stringify({ depth: DEEP, check: CHECK, lessons: data }) + ';\n');
  const seconds = Math.round((Date.now() - t0) / 1000);
  let md = `# Strategy audit\n\nGenerated by \`node tools/build-strategy.js\` in ${seconds} seconds, with Stockfish 19 (the build MyChess uses).\n\n`;
  md += '## How the exercises were chosen\n\n';
  md += `1. From the end of each of the ${list.length} distinct Lichess opening positions, Stockfish played on for up to ${PLIES} plies (depth ${QUICK}), giving ${positions} positions. Only positions from move 10 on are used, and positions from the 29 main openings of the Theory course are tried first.\n`;
  md += '2. A position became a candidate when Stockfish’s move matched a lesson’s rule in `js/strategy-rules.js`. The rules are exact, for example: *an outpost is a square in the opponent’s half, protected by your pawn, that no enemy pawn can ever attack*. Moves that give check or promote are left out: those are tactics.\n';
  md += `3. Each candidate was searched again with Stockfish’s three best moves (depth ${DEEP}). It was kept only if the best move is still the lesson’s idea, every move that is not the idea is at least ${MARGIN} points of winning chance worse, and the position is not already decided (within ±3 pawns; ±9 for “trade when ahead”). At most one exercise comes from each opening line, and four from each opening family.\n`;
  md += `4. Every exercise kept was searched once more at depth ${CHECK}, and dropped if Stockfish changed its mind or the deeper search found the position already decided.\n\n`;
  md += 'In the app, the answer is Stockfish’s move. Any other move that shows the same idea and is within 1.5 points of it also counts as right; anything else is checked by Stockfish live and explained.\n\n';
  md += '## Exercises per lesson\n\n| Lesson | Candidates | Checked | Kept | Not best at depth 18 | Too close to other moves | Already decided | Dropped at depth 22 |\n|---|---|---|---|---|---|---|---|\n';
  for (const l of S.LESSONS) {
    const st = stats[l.id];
    md += `| ${l.title} | ${st.candidates} | ${st.checked} | **${st.kept}** | ${st.rejected.notBest} | ${st.rejected.margin} | ${st.rejected.decided} | ${st.droppedDeep || 0} |\n`;
  }
  fs.writeFileSync(path.join(__dirname, '..', 'STRATEGY-AUDIT.md'), md);
  console.log(`done in ${seconds} s: ${Object.values(chosen).reduce((n, l) => n + l.length, 0)} exercises`);
})();
