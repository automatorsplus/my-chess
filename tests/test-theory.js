// Run with: node tests/test-theory.js
// Checks Theory mode: the opening lines replay legally, the course chapters find
// their main lines, the move explanations say the right thing on known lines,
// spaced repetition schedules sensibly, and every trap quoted in the course text
// really works on the board.
global.window = global;
require('../js/openings-data.js');
require('../js/theory-data.js');
const Core = require('../js/core.js')();
const coach = require('../js/coach.js')(Core);
const T = require('../js/theory.js');

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- data

const data = window.MYCHESS_THEORY;
check('opening lines loaded', data.lines.length === 3865, `${data.lines.length} lines`);
let bad = 0;
for (const [, , ucis] of data.lines) {
  const pos = new Core.Position();
  for (const u of ucis.split(' ')) { const m = pos.moveFromUci(u); if (!m || !pos.make(m)) { bad++; break; } }
}
check('every line replays legally', bad === 0, `${bad} bad`);

const started = Date.now();
const lib = T.buildLibrary(Core, data);
check('library builds quickly', Date.now() - started < 1500, `${Date.now() - started} ms`);
let outside = 0;
for (const key of lib.tree.keys()) if (key !== lib.startKey && !coach.isBook(key)) outside++;
check('every theory position is also in the opening-name data', outside === 0, `${lib.tree.size - 1} positions, ${outside} missing`);

// ---------------------------------------------------------------- course

const curated = lib.chapters.filter((c) => c.curated);
check('all course chapters are present', curated.length === T.CHAPTERS.length, `${curated.length} chapters`);
for (const c of curated) {
  const want = T.sanToUci(Core, c.main);
  const main = lib.lines[c.mainIdx];
  check(`${c.title}: main line is a Lichess line in the chapter`, !!main && main.uci === want && lib.home[main.idx] === c, main ? main.name : 'missing');
  check(`${c.title}: has variations and text`, c.lines.length >= 5 && c.groups.length >= 2 && c.white.length && c.black.length && c.know && c.about, `${c.lines.length} lines in ${c.groups.length} groups`);
}
const homes = lib.home.filter(Boolean).length;
check('every line belongs to exactly one chapter', homes === lib.lines.length && lib.chapters.reduce((n, c) => n + c.lines.length, 0) === lib.lines.length);
const sicilian = lib.chapterById.get('sicilian');
check('Sicilian lines are grouped by variation', sicilian.groups.some(([g, list]) => g === 'Najdorf Variation' && list.length >= 5), sicilian.groups.slice(0, 4).map(([g, l]) => `${g} (${l.length})`).join(', '));
const dutchFam = lib.chapterById.get('fam:Englund Gambit');
check('other families become reference chapters with the right side', !!dutchFam && dutchFam.side === 'b' && lib.chapterById.get('fam:Danish Gambit').side === 'w');

// ---------------------------------------------------------------- explanations

const { explainMove } = T.explainer(Core, coach);
function fenAfter(san) {
  const pos = new Core.Position();
  for (const s of san.trim().split(/\s+/).filter((x) => !/^\d+\.$/.test(x))) pos.make(pos.moveFromSan(s.replace(/^\d+\.+/, '')));
  return pos.toFEN();
}
function explain(before, move, cont, prevSan) {
  const fen = fenAfter(before);
  const pos = new Core.Position(fen);
  const uci = pos.moveToUci(pos.moveFromSan(move));
  const contUci = [uci];
  pos.make(pos.moveFromSan(move));
  for (const s of cont || []) { const m = pos.moveFromSan(s); contUci.push(pos.moveToUci(m)); pos.make(m); }
  let prev = null;
  if (prevSan) {
    const parts = before.trim().split(/\s+/).filter((x) => !/^\d+\.$/.test(x));
    const last = parts.pop();
    const pfen = fenAfter(parts.join(' '));
    const pp = new Core.Position(pfen);
    prev = { fen: pfen, uci: pp.moveToUci(pp.moveFromSan(last)) };
  }
  return explainMove(fen, uci, { cont: contUci, prev });
}
const cases = [
  ['Ruy Lopez 3.Bb5', 'e4 e5 Nf3 Nc6', 'Bb5', ['a6'], false, /pressure on the knight on c6, the only defender of the pawn on e5/],
  ['Italian 3.Bc4 aims at f7', 'e4 e5 Nf3 Nc6', 'Bc4', [], false, /aims at the pawn on f7, which only the king defends/],
  ['Two Knights 4.Ng5 adds an attacker on f7', 'e4 e5 Nf3 Nc6 Bc4 Nf6', 'Ng5', ['d5'], false, /second attacker to the pawn on f7/],
  ['QGD 4.Bg5 pins to the queen', 'd4 d5 c4 e6 Nc3 Nf6', 'Bg5', ['Be7'], false, /pins the knight on f6 to the queen/],
  ['Nimzo 3…Bb4 pins to the king', 'd4 Nf6 c4 e6 Nc3', 'Bb4', [], false, /pins the knight on c3 to the king/],
  ['Queen’s Gambit 2.c4 offers a pawn', 'd4 d5', 'c4', ['dxc4'], false, /offers the pawn on c4/],
  ['QGA 2…dxc4 accepts', 'd4 d5 c4', 'dxc4', ['Nf3'], true, /accepts the offer and takes the pawn on c4/],
  ['Two Knights 5.exd5 is an exchange', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5', 'exd5', ['Nxd5'], true, /exchanges pawns on d5/],
  ['Fried Liver 6.Nxf7 is a sacrifice', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5', 'Nxf7', ['Kxf7'], true, /gives up the knight for the pawn on f7/],
  ['Petrov 3.Nxe5 is not a simple trade', 'e4 e5 Nf3 Nf6', 'Nxe5', ['d6', 'Nf3', 'Nxe4'], true, /takes the pawn on e5; Black wins the material back later/],
  ['Légal 5.Nxe5 is a sound sacrifice', 'e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6', 'Nxe5', ['dxe5', 'Qxg4'], false, /takes the pawn on e5; if Black takes back, White comes out ahead/],
  ['Petrov 4…Nxe4 wins the pawn back', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3', 'Nxe4', [], true, /wins the material back/],
  ['Scotch 4.Nxd4 recaptures', 'e4 e5 Nf3 Nc6 d4 exd4', 'Nxd4', [], true, /recaptures on d4/],
  ['Slav 5.a4 discourages …b5', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4', 'a4', [], false, /discourages …b5/],
  ['Najdorf 5…a6 keeps pieces off b5', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3', 'a6', [], false, /keeps White’s pieces off b5/],
  ['French 3.e5 gains space and takes f6 away', 'e4 e6 d4 d5', 'e5', [], false, /gains space in the centre and keeps Black’s pieces off d6 and f6/],
  ['QGD 2…e6 supports d5', 'd4 d5 c4', 'e6', [], false, /supports the pawn on d5/],
  ['Italian 4.c3 prepares d4', 'e4 e5 Nf3 Nc6 Bc4 Bc5', 'c3', [], false, /prepares d4/],
  ['KID 3…Bg7 fianchettoes', 'd4 Nf6 c4 g6 Nc3', 'Bg7', [], false, /fianchettoes the bishop/],
  ['Castling', 'e4 e5 Nf3 Nc6 Bc4 Bc5', 'O-O', [], false, /castles kingside/],
  ['Mate is called mate', 'f3 e5 g4', 'Qh4#', [], false, /^delivers checkmate$/],
];
for (const [name, before, move, cont, prev, re] of cases) {
  const text = explain(before, move, cont, prev);
  check(`explains ${name}`, re.test(text), text);
}

// Every move of every line gets a sentence, and no sentence repeats itself.
let empty = 0, repeats = 0, total = 0;
const t0 = Date.now();
for (const l of lib.lines) {
  const pos = new Core.Position();
  let prev = null;
  l.moves.forEach((u, i) => {
    const fen = pos.toFEN();
    const text = explainMove(fen, u, { cont: l.moves.slice(i, i + 6), prev });
    total++;
    if (!text) empty++;
    const parts = text.split(/,| and |; it also /).map((p) => p.trim()).filter(Boolean);
    if (new Set(parts).size !== parts.length) repeats++;
    prev = { fen, uci: u };
    pos.make(pos.moveFromUci(u));
  });
}
check('every theory move gets an explanation', empty === 0, `${total} moves in ${((Date.now() - t0) / 1000).toFixed(1)} s, ${empty} empty`);
check('explanations do not repeat themselves', repeats === 0, `${repeats} with a repeated phrase`);

// ---------------------------------------------------------------- study plan

let planLines = 0, badPlan = 0, trapMates = 0;
for (const slot of lib.plan) {
  for (const o of slot.options) {
    check(`plan "${slot.title}: ${o.title}" points at a course chapter`, !!lib.chapterById.get(o.chapter) && o.lines.length >= 2);
    for (const e of o.lines.concat(o.traps)) {
      planLines++;
      const pos = new Core.Position();
      for (const u of e.line.moves) { const m = pos.moveFromUci(u); if (!m || !pos.make(m)) { badPlan++; break; } }
      if (/#$/.test(e.pgn || '') && pos.outcome() && pos.outcome().reason === 'checkmate') trapMates++;
    }
    // Lines that end in your own side's blunder are for Learn only, never drilled.
    for (const t of o.traps) {
      const loser = /#$/.test(t.pgn) ? (t.line.moves.length % 2 === 1 ? 'b' : 'w') : null;
      if (loser === slot.side) check(`trap "${t.name}" is not drilled, since your side gets mated in it`, t.drill === false);
    }
  }
}
check('every study plan line replays legally', badPlan === 0, `${planLines} lines`);
check('the trap lines that end in mate really are mate', trapMates === 3, `${trapMates} mates`);

// ---------------------------------------------------------------- spaced repetition

const DAY = 86400000, now = 1e12;
let c = T.schedule(null, 'clean', now);
check('a clean first run comes back tomorrow', c.box === 1 && c.due === now + DAY);
for (let i = 0; i < 3; i++) c = T.schedule(c, 'clean', now);
check('four clean runs reach the mastered box', c.box === 4 && c.due === now + 16 * DAY);
c = T.schedule(c, 'missed', now);
check('a mistake sends the line back to box 1, due in minutes', c.box === 1 && c.due === now + 10 * 60000 && c.lapses === 1);
c = T.schedule(c, 'helped', now);
check('a run with hints is not promoted', c.box === 1 && c.due === now + DAY);

// ---------------------------------------------------------------- the traps quoted in the course

function play(san) {
  const pos = new Core.Position();
  for (const s of san.trim().split(/\s+/).filter((x) => !/^\d+\.+$/.test(x))) {
    const m = pos.moveFromSan(s.replace(/^\d+\.+/, '').replace(/[?!]+$/, ''));
    if (!m) return null;
    pos.make(m);
  }
  return pos;
}
let p;
p = play('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Qe2 Ngf6 Nd6#');
check('Caro-Kann trap: 6.Nd6 is mate', !!p && p.outcome() && p.outcome().reason === 'checkmate');
p = play('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+');
const elephantCheck = !!p && p.inCheck();
p = play('d4 d5 c4 e6 Nc3 Nf6 Bg5 Nbd7 cxd5 exd5 Nxd5 Nxd5 Bxd8 Bb4+ Qd2 Bxd2+ Kxd2 Kxd8');
check('Elephant Trap: 7…Bb4+ is check and Black ends a piece up', elephantCheck && !!p && p.material() <= -2, p ? `material ${p.material()} (White minus Black)` : 'illegal');
p = play('e4 e5 Nf3 Nf6 Nxe5 Nxe4 Qe2 Nf6 Nc6+');
check('Petrov trap: 5.Nc6+ is a discovered check that hits the queen', !!p && p.inCheck() && p.attackersOf(Core.parseSq('d8'), 0).includes(Core.parseSq('c6')));
p = play('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 Nxe5 Qd4');
check('Exchange Ruy: 5…Qd4 hits the knight and e4', !!p && p.attacksFrom(Core.parseSq('d4')).includes(Core.parseSq('e5')) && p.attacksFrom(Core.parseSq('d4')).includes(Core.parseSq('e4')));
p = play('e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7');
check('Fried Liver: 6.Nxf7 forks queen and rook', !!p && ['d8', 'h8'].every((s) => p.attacksFrom(Core.parseSq('f7')).includes(Core.parseSq(s))));
p = play('e4 e5 Nc3 Nf6 Bc4 Nxe4 Nxe4 d5');
check('Vienna fork trick: 4…d5 hits bishop and knight', !!p && ['c4', 'e4'].every((s) => p.attacksFrom(Core.parseSq('d5')).includes(Core.parseSq(s))));
p = play('f4 e5 fxe5 d6 exd6 Bxd6 Nc3 Qh4+ g3 Bxg3+ hxg3 Qxg3#');
check('From’s Gambit: 4.Nc3? Qh4+ 5.g3 Bxg3+ 6.hxg3 Qxg3 is mate', !!p && p.outcome() && p.outcome().reason === 'checkmate');
check('From’s Gambit: after 4.Nf3, …Qh4+ loses the queen to Nxh4', !!play('f4 e5 fxe5 d6 exd6 Bxd6 Nf3 Qh4+ Nxh4'));
check('King’s Gambit: after 3.Nf3, …Qh4+ loses the queen to Nxh4', !!play('e4 e5 f4 exf4 Nf3 Qh4+ Nxh4') && !!play('e4 e5 f4 exf4 Bc4 Qh4+ Kf1'));
p = play('e4 e5 Nf3 Nc6 Nc3 Nf6 Nxe5');
check('Halloween Gambit line is legal', !!p);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll theory checks passed');
process.exit(failures ? 1 : 0);
