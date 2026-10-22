/*
 * Puzzles mode: themed lessons with puzzles from the Lichess puzzle database
 * (CC0), an adaptive puzzle rating, and coach explanations for every solution
 * and every wrong try.
 *
 * Lichess puzzle rules: the stored FEN is the position before the opponent's
 * move; the first move is the opponent's, the rest alternate between you and
 * the opponent. Every one of your moves is the only good one, except that any
 * checkmating move solves the puzzle.
 */
window.MyChessPuzzles = (function () {
  'use strict';

  const STORE = 'mychess.puzzles.v1';
  const OFFSETS = { easier: -300, normal: 0, harder: 300 };

  // Lessons, roughly in teaching order. ids match Lichess theme names (and tools/build-puzzles.js).
  const LESSONS = [
    { id: 'mix', title: 'Mixed practice', level: 'All levels', text: 'Puzzles from every theme, matched to your rating. A good daily warm-up.', look: 'Checks, captures and threats, in that order. Look at every forcing move before anything else.', why: '' },
    { id: 'mateIn1', title: 'Mate in 1', level: 'Beginner', text: 'Deliver checkmate in a single move.', look: 'Try every check you can give. For each one ask: can the king step away, can the check be blocked, can the checking piece be taken? Three “no”s means mate.', why: 'The king had no escape square, no block and no way to capture the checking piece.' },
    { id: 'hangingPiece', title: 'Hanging pieces', level: 'Beginner', text: 'A hanging piece is attacked and not defended, so it can simply be taken.', look: 'After each of your opponent’s moves ask what it attacks and what it stopped defending. Scan for pieces with no defenders.', why: 'The piece had no defender, so it was free.' },
    { id: 'fork', title: 'Forks', level: 'Beginner', text: 'A fork is one piece attacking two or more targets at once. Your opponent can only save one of them.', look: 'Knights are the classic forkers. Look for a safe square where one of your pieces hits the king and another piece, or two undefended pieces.', why: 'One piece attacked two targets at once, and only one could be saved.' },
    { id: 'pin', title: 'Pins', level: 'Beginner', text: 'A pinned piece cannot move without exposing a more valuable piece, or the king, behind it.', look: 'Line up a bishop, rook or queen with an enemy piece and a bigger target behind it. Then attack the pinned piece again, ideally with a pawn.', why: 'The pinned piece could not move without exposing what stood behind it.' },
    { id: 'skewer', title: 'Skewers', level: 'Beginner', text: 'A skewer is a pin in reverse: a valuable piece in front is attacked and must move, exposing the piece behind it.', look: 'Look for the enemy king or queen on the same line as another piece, where your bishop, rook or queen can attack along that line, often with check.', why: 'The valuable front piece had to move, leaving the piece behind it to be taken.' },
    { id: 'backRankMate', title: 'Back-rank mates', level: 'Beginner', text: 'A king hemmed in behind its own pawns on the back rank can be mated by a rook or queen.', look: 'Is the enemy king stuck on its first rank with no escape square? Count the defenders of that rank and see if you can overload them.', why: 'The king was boxed in by its own pawns and nothing could cover the back rank.' },
    { id: 'mateIn2', title: 'Mate in 2', level: 'Beginner', text: 'Force checkmate in two moves, whatever your opponent replies.', look: 'Start with the most forcing moves: checks, then captures, then threats. A sacrifice that drags the king out is often the key.', why: 'The first move left no defence against the mating blow.' },
    { id: 'attackingF2F7', title: 'Attacking f7 and f2', level: 'Beginner', text: 'Early in the game f7 (f2 for White) is defended only by the king, which makes it the weakest square.', look: 'Count attackers and defenders on f7 or f2. A bishop on c4/c5 and a knight on g5/g4 often combine against it.', why: 'The pawn next to the king was defended only by the king.' },
    { id: 'discoveredAttack', title: 'Discovered attacks', level: 'Intermediate', text: 'Moving one piece uncovers an attack by another piece behind it, and the piece that moves can make a threat of its own.', look: 'Find your pieces lined up behind one of your own pieces. Moving the front one with check or a capture creates two threats at once.', why: 'Moving one piece unleashed a second attack from the piece behind it.' },
    { id: 'doubleCheck', title: 'Double check', level: 'Intermediate', text: 'A discovered attack where both pieces give check. The king must move, because nothing can block or capture both checkers.', look: 'When a discovered check is possible, see whether the moving piece can also give check.', why: 'Two pieces gave check at once, so the king had to move.' },
    { id: 'trappedPiece', title: 'Trapped pieces', level: 'Intermediate', text: 'A piece with no safe squares can be attacked and won.', look: 'Look for enemy pieces that have wandered far forward or into a corner. Take away their escape squares, then attack them.', why: 'The piece had no safe square left.' },
    { id: 'promotion', title: 'Promotion', level: 'Intermediate', text: 'Getting a pawn to the last rank turns it into a new queen, or another piece.', look: 'Clear the pawn’s path, deflect the blockers, and check whether promoting to a knight gives check or avoids stalemate.', why: 'The pawn reached the last rank and became a new piece.' },
    { id: 'capturingDefender', title: 'Removing the defender', level: 'Intermediate', text: 'Capture or chase away the piece that guards something important, then take what it was guarding.', look: 'Ask what each enemy piece is defending. If one piece guards two things, or a key square, remove it.', why: 'Once the defender was gone, what it guarded fell.' },
    { id: 'sacrifice', title: 'Sacrifices', level: 'Intermediate', text: 'Giving up material on purpose to get something bigger: mate, more material, or a crushing attack.', look: 'Calculate the forcing lines after the sacrifice. If every reply loses for your opponent, the sacrifice is sound.', why: 'The material you gave up came back with interest.' },
    { id: 'deflection', title: 'Deflection', level: 'Intermediate', text: 'Force an enemy piece away from a square or line it needs to guard.', look: 'Find an overworked defender and offer it something it must take or answer.', why: 'The defender was pulled away from its job.' },
    { id: 'attraction', title: 'Attraction', level: 'Intermediate', text: 'Lure an enemy piece, often the king, onto a square where it can be forked, pinned or mated.', look: 'Look for sacrifices that force the king or queen onto a fatal square.', why: 'A sacrifice dragged an enemy piece onto a fatal square.' },
    { id: 'smotheredMate', title: 'Smothered mate', level: 'Intermediate', text: 'A knight checkmates a king that is surrounded by its own pieces.', look: 'A king in the corner, blocked by its own rook and pawns, and a knight that can reach f7/f2 or g6/g3. A queen sacrifice often forces the blocker into place.', why: 'The king was smothered by its own pieces, and a knight check cannot be blocked.' },
    { id: 'intermezzo', title: 'In-between moves', level: 'Advanced', text: 'Instead of the expected recapture, first play a stronger forcing move, then recapture.', look: 'Before recapturing automatically, check whether a check or a bigger threat comes first.', why: 'A forcing move slipped in before the expected one changed the outcome.' },
    { id: 'quietMove', title: 'Quiet moves', level: 'Advanced', text: 'A move without check or capture that sets up a threat your opponent cannot meet.', look: 'If no forcing move works, look for a calm move that takes away escape squares or adds an attacker.', why: 'A calm move created a threat that could not be parried.' },
    { id: 'clearance', title: 'Clearance', level: 'Advanced', text: 'Move a piece out of the way, often with tempo, to open a line or square for another piece.', look: 'Which of your own pieces is blocking a stronger move? Move it with a threat.', why: 'Clearing a square or line let another piece in.' },
    { id: 'xRayAttack', title: 'X-ray attacks', level: 'Advanced', text: 'A piece attacks or defends a square through an enemy piece standing in between.', look: 'On lines with several pieces, count attackers including the ones behind other pieces.', why: 'A piece did its job straight through another piece on the same line.' },
    { id: 'interference', title: 'Interference', level: 'Advanced', text: 'Put a piece between two enemy pieces to cut the line that connects them.', look: 'Find enemy pieces that protect each other along a line and plant a piece on that line.', why: 'A piece placed in between cut the defence.' },
    { id: 'mateIn3', title: 'Mate in 3', level: 'Advanced', text: 'Force checkmate in three moves.', look: 'Keep every move forcing, and picture the final mating net before you start.', why: 'Each move was forcing, leaving no time for a defence.' },
    { id: 'defensiveMove', title: 'Defence', level: 'Advanced', text: 'Find the only move that holds the position.', look: 'Look at your opponent’s threats first, then find the move that meets all of them.', why: 'Only this move dealt with every threat.' },
    { id: 'pawnEndgame', title: 'Pawn endgames', level: 'Endgame', text: 'King and pawn endings, where king activity, the opposition and passed pawns decide everything.', look: 'Count the moves (tempi). Bring the king forward, take the opposition, and create a passed pawn.', why: 'Precise king and pawn moves won the race.' },
    { id: 'rookEndgame', title: 'Rook endgames', level: 'Endgame', text: 'The most common endgame: active rooks, rooks behind passed pawns, and cutting off the enemy king.', look: 'Activate the rook, cut off the enemy king and support your passed pawn from behind.', why: 'The more active rook decided the ending.' },
    { id: 'advancedPawn', title: 'Advanced pawns', level: 'Endgame', text: 'A pawn close to promotion ties down enemy pieces and often decides the game.', look: 'Work out whether the pawn can be stopped, and look for sacrifices that clear its path.', why: 'The far-advanced pawn was too strong to stop.' },
    { id: 'zugzwang', title: 'Zugzwang', level: 'Endgame', text: 'Your opponent would be fine if they could pass, but every legal move makes things worse.', look: 'Instead of attacking, take away your opponent’s useful moves and let them run out.', why: 'Every move your opponent had made their position worse.' },
  ];
  const LESSON_BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
  const HIDDEN_TAGS = new Set(['short', 'long', 'veryLong', 'oneMove', 'crushing', 'advantage', 'equality', 'master', 'masterVsMaster', 'superGM']);
  const TAG_NAMES = {
    mate: 'Checkmate', mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', mateIn5: 'Mate in 5',
    attackingF2F7: 'Attacking f2/f7', xRayAttack: 'X-ray attack', capturingDefender: 'Removing the defender', intermezzo: 'In-between move',
    hangingPiece: 'Hanging piece', backRankMate: 'Back-rank mate', kingsideAttack: 'Kingside attack', queensideAttack: 'Queenside attack',
  };
  const tagName = (t) => TAG_NAMES[t] || (t.charAt(0).toUpperCase() + t.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase());
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function create(api) {
    const { Core, coach, analyzer } = api;
    const el = api.panel;

    const stats = loadStats();
    let data = null; // { themes, puzzles }
    let cur = null; // current puzzle state
    let token = 0; // invalidates pending timers/analyses when the puzzle changes

    function loadStats() {
      const base = { rating: 1200, played: 0, solved: 0, streak: 0, best: 0, lesson: 'mix', offset: 'normal', seen: [], lessons: {} };
      try { return Object.assign(base, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { return base; }
    }
    function saveStats() {
      try { localStorage.setItem(STORE, JSON.stringify(stats)); } catch (e) { /* storage unavailable */ }
    }

    function loadData() {
      if (window.MYCHESS_PUZZLES) return Promise.resolve(window.MYCHESS_PUZZLES);
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/puzzles-data.js';
        s.onload = () => resolve(window.MYCHESS_PUZZLES);
        s.onerror = () => reject(new Error('Could not load js/puzzles-data.js'));
        document.head.appendChild(s);
      });
    }

    // ------------------------------------------------------------ choosing a puzzle

    function pick() {
      const lesson = stats.lesson;
      const themeIdx = lesson === 'mix' ? -1 : data.themes.indexOf(lesson);
      const skip = new Set(window.MYCHESS_PUZZLE_EXCLUDE || []); // puzzles Stockfish could not confirm (tools/audit-puzzles.js)
      const pool = data.puzzles.filter((p) => (themeIdx < 0 || p[4].includes(themeIdx)) && !skip.has(p[0]));
      const seen = new Set(stats.seen);
      const target = stats.rating + OFFSETS[stats.offset];
      for (let width = 100; width <= 3000; width += 100) {
        let near = pool.filter((p) => Math.abs(p[3] - target) <= width && !seen.has(p[0]));
        if (near.length < 4 && width >= 3000) near = pool.filter((p) => Math.abs(p[3] - target) <= width);
        if (near.length >= 4 || (width >= 600 && near.length)) return near[Math.floor(Math.random() * near.length)];
      }
      return pool[Math.floor(Math.random() * pool.length)];
    }

    function start(p) {
      token++;
      const t = token;
      const moves = p[2].split(' ');
      const setup = new Core.Position(p[1]);
      const playerSide = setup.side ^ 1;
      cur = {
        id: p[0], fen: p[1], moves, rating: p[3], themes: p[4].map((i) => data.themes[i]),
        step: 0, playerSide, failed: false, hinted: 0, done: false, busy: true, wrong: null, explanation: null, feedback: '', scored: false,
      };
      api.load(p[1], playerSide === 1);
      api.showEval(null);
      render();
      setTimeout(() => {
        if (t !== token) return;
        api.play(moves[0]); // the opponent's move that sets up the puzzle
        cur.step = 1;
        cur.busy = false;
        prompt();
        render();
      }, 600);
    }

    function prompt() {
      const side = cur.playerSide === 0 ? 'White' : 'Black';
      api.status(`${side} to play`, cur.step === 1 ? 'Find the best move.' : 'Correct! Keep going.', cur.step === 1 ? '' : 'good');
    }

    // ------------------------------------------------------------ rating

    function score(result) {
      if (cur.scored) return;
      cur.scored = true;
      const expected = 1 / (1 + Math.pow(10, (cur.rating - stats.rating) / 400));
      const k = stats.played < 20 ? 40 : 20;
      const before = stats.rating;
      stats.rating = Math.max(400, Math.round(stats.rating + k * (result - expected)));
      cur.ratingChange = stats.rating - before;
      stats.played++;
      const ls = stats.lessons[stats.lesson] || (stats.lessons[stats.lesson] = { played: 0, solved: 0 });
      ls.played++;
      if (result === 1) { stats.solved++; ls.solved++; stats.streak++; stats.best = Math.max(stats.best, stats.streak); } else stats.streak = 0;
      stats.seen.push(cur.id);
      if (stats.seen.length > 3000) stats.seen = stats.seen.slice(-3000);
      saveStats();
    }

    // ------------------------------------------------------------ moves

    function canMove() {
      return !!cur && !cur.busy && !cur.done && !cur.wrong && api.side() === cur.playerSide;
    }

    // Called by the app after every move on the board while in puzzle mode.
    function onMovePlayed(mv, opts) {
      if (!cur || (opts && opts.computer)) return;
      const t = token;
      const expected = cur.moves[cur.step];
      const isMate = /#$/.test(mv.san);
      if (mv.uci === expected || isMate) {
        cur.step++;
        if (isMate || cur.step >= cur.moves.length) { finish(true); return; }
        cur.busy = true;
        prompt();
        render();
        setTimeout(() => {
          if (t !== token) return;
          api.play(cur.moves[cur.step]);
          cur.step++;
          cur.busy = false;
          api.status(`${cur.playerSide === 0 ? 'White' : 'Black'} to play`, 'Correct! Now find the follow-up.', 'good');
          render();
        }, 450);
        return;
      }
      judgeWrongMove(mv, t);
    }

    async function judgeWrongMove(mv, t) {
      cur.busy = true;
      cur.wrong = { san: mv.san, text: '' };
      api.status('Not quite', 'Checking your move…', '');
      render();
      const fens = api.fens();
      const fenAfter = fens[fens.length - 1], fenBefore = fens[fens.length - 2];
      const [before, after] = await Promise.all([analyzer.analyse(fenBefore), analyzer.analyse(fenAfter)]);
      if (t !== token || !cur.wrong) return;
      let text = '';
      let good = false;
      if (before && after) {
        const r = coach.review({ fenBefore, fenAfter, uci: mv.uci, before, after, book: false, who: 'you' });
        good = r.kind === 'best' || r.kind === 'excellent';
        text = good
          ? `${mv.san} is a decent move (${r.evalAfter}), but there is a stronger one. Try again.`
          : `${mv.san} doesn’t work: ${r.text.charAt(0).toLowerCase()}${r.text.slice(1)}`;
      } else text = `${mv.san} is not the move this puzzle is looking for.`;
      cur.wrong.text = text;
      cur.busy = false;
      if (good) {
        api.status('Close', text, '');
        render();
        setTimeout(() => { if (t === token && cur.wrong) retry(); }, 1600);
        return;
      }
      if (!cur.failed) { cur.failed = true; score(0); }
      api.status('Not quite', 'Try again or see the solution.', 'warn');
      render();
    }

    function retry() {
      if (!cur || !cur.wrong) return;
      api.undoLast();
      cur.wrong = null;
      prompt();
      render();
    }

    function hint() {
      if (!canMove()) return;
      const uci = cur.moves[cur.step];
      cur.hinted++;
      if (cur.hinted === 1) {
        api.select(Core.parseSq(uci.slice(0, 2)));
        api.status(`${cur.playerSide === 0 ? 'White' : 'Black'} to play`, 'Hint: move this piece.', 'good');
      } else {
        api.arrow(uci, 'hint');
        api.status(`${cur.playerSide === 0 ? 'White' : 'Black'} to play`, 'Hint: play the arrow move.', 'good');
      }
      render();
    }

    async function showSolution() {
      if (!cur || cur.done) return;
      const t = token;
      if (cur.wrong) { api.undoLast(); cur.wrong = null; }
      if (!cur.failed) { cur.failed = true; score(0); }
      cur.busy = true;
      render();
      while (cur.step < cur.moves.length) {
        await new Promise((r) => setTimeout(r, 650));
        if (t !== token) return;
        api.play(cur.moves[cur.step]);
        cur.step++;
      }
      finish(false);
    }

    function finish(solved) {
      cur.done = true;
      cur.busy = false;
      cur.solved = solved && !cur.failed;
      cur.solvedLate = solved && cur.failed;
      if (solved && !cur.failed) score(cur.hinted ? 0.5 : 1);
      const msg = !solved ? 'Here is the solution.' : cur.failed ? 'Solved on a second try.' : cur.hinted ? 'Solved with a hint.' : 'Solved!';
      api.status(solved ? 'Puzzle solved' : 'Puzzle over', msg, solved ? 'good' : '');
      render();
      explain(token);
    }

    // ------------------------------------------------------------ coach explanation

    async function explain(t) {
      const pos = new Core.Position(cur.fen);
      const m0 = pos.moveFromUci(cur.moves[0]);
      const setupSan = pos.san(m0);
      const setupNum = pos.side === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`;
      pos.make(m0);
      const startMaterial = pos.material();
      const steps = [];
      for (let i = 1; i < cur.moves.length; i++) {
        const uci = cur.moves[i];
        const m = pos.moveFromUci(uci);
        if (!m) break;
        const fenBefore = pos.toFEN();
        const num = pos.side === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`;
        const san = pos.san(m);
        pos.make(m);
        if (i % 2 === 1) {
          const after = await analyzer.analyse(pos.toFEN());
          if (t !== token) return;
          let idea = coach.describeMove(fenBefore, uci, cur.moves.slice(i), after ? after.score : null);
          if (idea === 'improves the position') idea = themeIdea(cur.themes, i === cur.moves.length - 1);
          steps.push({ mine: true, num, san, idea });
        } else steps.push({ mine: false, num, san });
      }
      const final = await analyzer.analyse(pos.toFEN());
      if (t !== token) return;
      const gained = (pos.material() - startMaterial) * (cur.playerSide === 0 ? 1 : -1);
      const outcome = pos.outcome();
      let result;
      if (outcome && outcome.reason === 'checkmate') result = 'Checkmate.';
      else if (gained >= 1) result = `You come out ${gained} point${gained === 1 ? '' : 's'} of material ahead.`;
      else result = 'Your position is now much better.';
      if (final && !(outcome && outcome.reason === 'checkmate')) result += ` Stockfish now rates it ${coach.formatEval(final.score, pos.side)} (from White’s side).`;
      const lesson = lessonFor(cur.themes);
      cur.explanation = { setup: `${setupNum} ${setupSan}`, steps, result, why: lesson && lesson.why ? { title: lesson.title, text: lesson.why } : null };
      if (final) api.showEval(final);
      render();
    }

    // When the move itself has no obvious point (no capture, check or threat), say what the puzzle is about.
    function themeIdea(themes, last) {
      const opp = cur.playerSide === 0 ? 'Black' : 'White';
      if (themes.includes('zugzwang')) return `puts ${opp} in zugzwang: every reply makes things worse`;
      if (themes.includes('defensiveMove')) return 'is the only move that holds the position';
      if (themes.includes('quietMove')) return 'is a quiet move that sets up a threat that cannot be stopped';
      if (themes.includes('clearance')) return 'clears the way for another piece';
      if (themes.includes('interference')) return 'cuts the line between the defending pieces';
      if (themes.includes('trappedPiece')) return 'takes away the last escape squares';
      return last ? 'finishes the job' : 'keeps up the pressure';
    }

    // The most specific lesson matching the puzzle's themes.
    function lessonFor(themes) {
      if (stats.lesson !== 'mix' && themes.includes(stats.lesson)) return LESSON_BY_ID.get(stats.lesson);
      for (const l of LESSONS) if (l.id !== 'mix' && themes.includes(l.id)) return l;
      return null;
    }

    // ------------------------------------------------------------ panel

    function render() {
      const lesson = LESSON_BY_ID.get(stats.lesson) || LESSONS[0];
      const ls = stats.lessons[stats.lesson];
      const levels = ['All levels', 'Beginner', 'Intermediate', 'Advanced', 'Endgame'];
      let opts = '';
      for (const lv of levels) {
        const items = LESSONS.filter((l) => l.level === lv);
        if (!items.length) continue;
        opts += `<optgroup label="${lv}">` + items.map((l) => `<option value="${l.id}"${l.id === stats.lesson ? ' selected' : ''}>${escapeHtml(l.title)}</option>`).join('') + '</optgroup>';
      }

      let card = '';
      if (!data) card = '<p class="muted"><span class="spinner"></span>Loading puzzles…</p>';
      else if (cur) {
        const side = cur.playerSide === 0 ? 'White' : 'Black';
        card += `<p class="pz-head"><strong>Puzzle ${escapeHtml(cur.id)}</strong> <span class="muted">rated ${cur.rating}</span>` +
          (cur.done ? ` <a href="https://lichess.org/training/${encodeURIComponent(cur.id)}" target="_blank" rel="noopener">View on Lichess</a>` : '') + '</p>';
        if (!cur.done) card += `<p>${side} to play. ${cur.step <= 1 ? 'Find the best move.' : 'Find the next move.'}</p>`;
        if (cur.wrong && cur.wrong.text) card += `<p class="pz-wrong">${escapeHtml(cur.wrong.text)}</p>`;
        else if (cur.wrong) card += '<p class="muted"><span class="spinner"></span>Checking your move…</p>';
        if (cur.done) {
          const change = cur.ratingChange ? ` (${cur.ratingChange > 0 ? '+' : ''}${cur.ratingChange})` : '';
          card += `<p class="pz-result ${cur.solved ? 'good' : ''}">${cur.solved ? (cur.hinted ? 'Solved with a hint' : 'Solved!') : cur.solvedLate ? 'Solved on a second try' : 'Solution shown'}${escapeHtml(change)}</p>`;
          const x = cur.explanation;
          if (!x) card += '<p class="muted"><span class="spinner"></span>The coach is working out the explanation…</p>';
          else {
            card += `<p class="muted">After ${escapeHtml(x.setup)}:</p><ol class="pz-steps">` +
              x.steps.map((s) => s.mine
                ? `<li class="mine"><strong>${escapeHtml(s.num)} ${escapeHtml(s.san)}</strong> ${escapeHtml(s.idea)}.</li>`
                : `<li class="theirs">${escapeHtml(s.num)} ${escapeHtml(s.san)}</li>`).join('') + '</ol>';
            card += `<p>${escapeHtml(x.result)}</p>`;
            if (x.why) card += `<p class="tip"><strong>${escapeHtml(x.why.title)}:</strong> ${escapeHtml(x.why.text)}</p>`;
          }
          const tags = cur.themes.filter((t) => !HIDDEN_TAGS.has(t)).map((t) => `<span class="tag">${escapeHtml(tagName(t))}</span>`).join('');
          if (tags) card += `<p class="tags">${tags}</p>`;
        }
        card += '<div class="review-actions">';
        if (cur.done) card += '<button type="button" class="btn primary small" data-pz="next">Next puzzle</button>';
        else if (cur.wrong && cur.wrong.text && cur.failed) card += '<button type="button" class="btn small" data-pz="retry">Retry</button><button type="button" class="btn small" data-pz="solution">Show solution</button>';
        else card += `<button type="button" class="btn small" data-pz="hint"${canMove() ? '' : ' disabled'}>Hint</button><button type="button" class="btn small" data-pz="solution"${cur.busy ? ' disabled' : ''}>Show solution</button>`;
        card += '</div>';
      }

      el.innerHTML =
        `<div class="field-row"><span>Lesson</span><select id="pzLesson">${opts}</select></div>` +
        `<div class="lesson-card"><p class="lesson-title">${escapeHtml(lesson.title)} <span class="level">${escapeHtml(lesson.level)}</span></p>` +
        `<p>${escapeHtml(lesson.text)}</p><p class="look"><strong>Look for:</strong> ${escapeHtml(lesson.look)}</p>` +
        (ls ? `<p class="muted small">This lesson: ${ls.solved} of ${ls.played} solved</p>` : '') + '</div>' +
        `<div class="puzzle-card">${card}</div>` +
        `<div class="field-row"><span id="pzLevelLabel">Difficulty</span><div class="segmented" role="radiogroup" aria-labelledby="pzLevelLabel" id="pzOffset">` +
        ['easier', 'normal', 'harder'].map((o) => `<button type="button" role="radio" data-value="${o}" aria-checked="${o === stats.offset}">${o.charAt(0).toUpperCase() + o.slice(1)}</button>`).join('') +
        '</div></div>' +
        `<p class="pz-stats">Puzzle rating <strong>${stats.rating}</strong> · Solved ${stats.solved} of ${stats.played} · Streak ${stats.streak} (best ${stats.best})</p>`;
      api.refresh();
    }

    el.addEventListener('change', (e) => {
      if (e.target.id !== 'pzLesson') return;
      stats.lesson = e.target.value;
      saveStats();
      if (data) start(pick());
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.closest('#pzOffset')) { stats.offset = b.dataset.value; saveStats(); if (data && cur && !cur.done && cur.step <= 1 && !cur.failed) start(pick()); else render(); return; }
      const action = b.dataset.pz;
      if (action === 'next') start(pick());
      else if (action === 'retry') retry();
      else if (action === 'hint') hint();
      else if (action === 'solution') showSolution();
    });

    return {
      async enter() {
        render();
        if (!data) {
          try { data = await loadData(); } catch (err) { el.innerHTML = `<p class="pz-wrong">${escapeHtml(err.message)}</p>`; return; }
        }
        if (!LESSON_BY_ID.has(stats.lesson)) stats.lesson = 'mix';
        start(pick());
      },
      exit() { token++; cur = null; },
      canMove,
      onMovePlayed,
      isBusy: () => !!cur && cur.busy,
      LESSONS,
    };
  }

  return { create, LESSONS };
})();
