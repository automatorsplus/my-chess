/*
 * Strategy mode: middlegame lessons with exercises.
 *
 * Each lesson explains one idea (outposts, open files, passed pawns, …) and then
 * gives positions where Stockfish's best move is exactly that idea (chosen and
 * checked by tools/build-strategy.js). The first exercise of a lesson is shown
 * as a worked example. Any other move is checked by Stockfish live: if it is as
 * good as the answer it counts, otherwise the coach explains what it allows.
 */
window.MyChessStrategy = (function () {
  'use strict';

  const STORE = 'mychess.strategy.v1';
  const SIDE = ['White', 'Black'];
  const GOOD_ENOUGH = 1.5; // win-chance points: a move this close to Stockfish's best also counts
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function create(api) {
    const { Core, coach, analyzer } = api;
    const el = api.panel;
    const R = window.MyChessStrategyRules;
    const { detect } = R.rules(Core);
    const explain = window.MyChessTheory ? window.MyChessTheory.explainer(Core, coach).explainMove : null;
    const st = loadState();
    let data = null;
    let cur = null;
    let token = 0;
    let active = false;

    function loadState() {
      const base = { lesson: 'worstPiece', solved: {}, played: 0, right: 0, examples: {} };
      try { return Object.assign(base, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { return base; }
    }
    const save = () => { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch (e) { /* storage unavailable */ } };

    function loadData() {
      if (window.MYCHESS_STRATEGY) return Promise.resolve(window.MYCHESS_STRATEGY);
      return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'js/strategy-data.js';
        s.onload = () => resolve(window.MYCHESS_STRATEGY);
        s.onerror = () => reject(new Error('Could not load js/strategy-data.js'));
        document.head.appendChild(s);
      });
    }

    const lesson = () => R.LESSON_BY_ID.get(st.lesson) || R.LESSONS[0];
    const exercises = (id) => (data && data.lessons[id]) || [];
    const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');
    const solvedSet = (id) => new Set(st.solved[id] || []);
    const moveText = (fen, uci) => {
      const pos = new Core.Position(fen);
      const m = pos.moveFromUci(uci);
      return m ? (pos.side === 0 ? `${pos.fullmove}.` : `${pos.fullmove}…`) + pos.san(m) : uci;
    };
    const forYou = (cp) => `${cp > 0 ? '+' : cp < 0 ? '−' : ''}${Math.abs(cp / 100).toFixed(1)} for you`;

    // ------------------------------------------------------------ exercises

    function pick() {
      const list = exercises(st.lesson);
      if (!list.length) return null;
      const done = solvedSet(st.lesson);
      const fresh = list.filter((e) => !done.has(fenKey(e[0])));
      const pool = fresh.length ? fresh : list;
      // In order for the first pass (examples first), then at random.
      return fresh.length ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    }

    function start(ex) {
      token++;
      api.arrows([]);
      api.marks([]);
      if (!ex) { cur = null; render(); return; }
      const [fen, answer, alts, cp, name, text] = ex;
      const side = new Core.Position(fen).side;
      cur = { fen, answer, alts: alts || [], cp, name, text, side, state: 'try', hinted: 0, wrong: 0, feedback: null, busy: false, example: !st.examples[st.lesson] };
      api.load(fen, side === 1);
      api.showEval(null);
      if (cur.example) {
        api.arrows([{ uci: answer, kind: 'best' }]);
        api.status('Worked example', `${SIDE[side]} to play: the green arrow shows the idea.`, 'good');
      } else api.status(`${SIDE[side]} to play`, lesson().task, '');
      render();
    }

    function canMove() {
      return active && !!cur && !cur.example && !cur.busy && cur.state === 'try' && api.side() === cur.side;
    }

    function solvedNow(how) {
      cur.state = 'done';
      st.played++;
      if (!cur.wrong && !cur.hinted) st.right++;
      const list = st.solved[st.lesson] || (st.solved[st.lesson] = []);
      if (!list.includes(fenKey(cur.fen))) list.push(fenKey(cur.fen));
      save();
      cur.how = how;
      api.status(how === 'answer' ? 'Right!' : 'Good move', '', 'good');
      render();
    }

    function onMovePlayed(mv, opts) {
      if (!cur || (opts && opts.computer) || cur.state !== 'try') return;
      const t = token;
      if (mv.uci === cur.answer || cur.alts.includes(mv.uci)) {
        cur.played = mv.uci;
        cur.feedback = { kind: 'best', title: 'Right', text: `${moveText(cur.fen, mv.uci)} ${detectText(mv.uci)}.` };
        solvedNow('answer');
        return;
      }
      cur.busy = true;
      cur.feedback = { kind: 'pending', text: `${moveText(cur.fen, mv.uci)}: checking with Stockfish…` };
      render();
      const fens = api.fens();
      const fenBefore = fens[fens.length - 2], fenAfter = fens[fens.length - 1];
      Promise.all([analyzer.analyse(fenBefore, { depth: 16, movetime: 1500 }), analyzer.analyse(fenAfter, { depth: 16, movetime: 1500 })]).then(([before, after]) => {
        if (t !== token || !cur) return;
        cur.busy = false;
        if (!before || !after) { cur.feedback = { kind: 'danger', title: 'Not this time', text: `${moveText(fenBefore, mv.uci)} is not the move this lesson is about.` }; retryLater(t); return; }
        const loss = Math.max(0, coach.winPct(before.score) - (100 - coach.winPct(after.score)));
        if (loss <= GOOD_ENOUGH) {
          cur.played = mv.uci;
          cur.feedback = { kind: 'chance', title: 'Also good', text: `${moveText(fenBefore, mv.uci)} is as good as the answer, says Stockfish. The lesson’s move was ${moveText(cur.fen, cur.answer)}: it ${cur.text}.` };
          solvedNow('also');
          return;
        }
        cur.wrong++;
        const r = coach.review({ fenBefore, fenAfter, uci: mv.uci, before, after, book: false, who: 'you' });
        const what = ['best', 'excellent', 'good'].includes(r.kind)
          ? `${moveText(fenBefore, mv.uci)} is playable, but there is a stronger idea here.`
          : `${r.label}: ${moveText(fenBefore, mv.uci)}. ${r.text}`;
        cur.feedback = { kind: 'danger', title: 'Not quite', text: what };
        retryLater(t);
      });
    }

    function retryLater(t) {
      render();
      setTimeout(() => {
        if (t !== token || !cur || cur.state !== 'try') return;
        api.undoLast();
        api.status(`${SIDE[cur.side]} to play`, 'Try again, or ask for a hint.', 'warn');
        render();
      }, 1100);
    }

    // The rule's own wording for a move, e.g. "puts the knight on an outpost: …".
    function detectText(uci) {
      const d = detect(cur.fen, uci).find((x) => x.lesson === st.lesson);
      if (d) return d.text;
      return explain ? explain(cur.fen, uci, {}) : 'is the move';
    }

    function hint() {
      if (!canMove()) return;
      cur.hinted++;
      if (cur.hinted === 1) {
        api.select(Core.parseSq(cur.answer.slice(0, 2)));
        api.status(`${SIDE[cur.side]} to play`, 'Hint: this piece.', 'good');
      } else {
        api.arrows([{ uci: cur.answer, kind: 'hint' }]);
        api.status(`${SIDE[cur.side]} to play`, 'Hint: play the arrow move.', 'good');
      }
      render();
    }

    function showMe() {
      if (!cur || cur.state !== 'try' || cur.busy) return;
      cur.hinted += 2;
      api.arrows([{ uci: cur.answer, kind: 'best' }]);
      cur.feedback = { kind: 'theory', title: 'The answer', text: `${moveText(cur.fen, cur.answer)} ${cur.text}. Play it on the board.` };
      api.status(`${SIDE[cur.side]} to play`, 'Play the arrow move.', 'good');
      render();
    }

    // ------------------------------------------------------------ panel

    function render() {
      const L = lesson();
      const groups = [...new Set(R.LESSONS.map((l) => l.group))];
      const opts = groups.map((g) => `<optgroup label="${escapeHtml(g)}">` + R.LESSONS.filter((l) => l.group === g)
        .map((l) => `<option value="${l.id}"${l.id === L.id ? ' selected' : ''}>${escapeHtml(l.title)} (${exercises(l.id).length})</option>`).join('') + '</optgroup>').join('');
      const total = exercises(L.id).length, done = solvedSet(L.id).size;
      let html = (window.MyChessTheory ? window.MyChessTheory.sectionsHtml('middlegame') : '') +
        `<div class="field-row"><span>Lesson</span><select id="sgLesson">${opts}</select></div>`;
      html += `<div class="th-block theory"><span class="th-label">Middlegame · ${escapeHtml(L.group)} · ${escapeHtml(L.level)}</span>` +
        `<p class="th-big sg-title">${escapeHtml(L.title)}</p><p class="th-why">${escapeHtml(L.idea)}</p></div>`;
      html += `<details class="th-history sg-rules"${rulesOpen ? ' open' : ''}><summary>Rules of thumb</summary><ol class="th-steps">${L.rules.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ol></details>`;

      if (!data) html += '<p class="muted"><span class="spinner"></span>Loading the exercises…</p>';
      else if (!cur) html += '<p class="th-why">No exercises for this lesson yet.</p>';
      else {
        const side = SIDE[cur.side];
        if (cur.example) {
          html += `<div class="th-block best"><span class="th-label">Worked example · ${side} to play</span>` +
            `<p class="th-big">${escapeHtml(moveText(cur.fen, cur.answer))} <span class="eval">${escapeHtml(forYou(cur.cp))}</span></p>` +
            `<p class="th-why">${escapeHtml(cap(cur.text))}.</p>` +
            '<p class="th-small">This is Stockfish’s best move in a position from a real opening. Now find the idea yourself.</p></div>' +
            '<div class="review-actions"><button type="button" class="btn primary" data-sg="tryit">Now you try</button></div>';
        } else {
          html += `<p class="th-why"><b>${side} to play.</b> ${escapeHtml(L.task)}</p>`;
          const f = cur.feedback;
          if (f && f.kind === 'pending') html += `<p class="muted"><span class="spinner"></span>${escapeHtml(f.text)}</p>`;
          else if (f) html += `<div class="th-block ${f.kind}"><span class="th-label">${escapeHtml(f.title)}</span><p class="th-why">${escapeHtml(f.text)}</p>` +
            (cur.state === 'done' ? `<p class="th-small">Stockfish rates the position ${escapeHtml(forYou(cur.cp))} after the best move.</p>` : '') + '</div>';
          html += '<div class="review-actions">';
          if (cur.state === 'done') html += '<button type="button" class="btn primary" data-sg="next">Next exercise</button>';
          else {
            html += `<button type="button" class="btn" data-sg="hint"${canMove() ? '' : ' disabled'}>Hint</button>`;
            html += `<button type="button" class="btn" data-sg="show"${cur.busy ? ' disabled' : ''}>Show me</button>`;
            html += '<button type="button" class="btn" data-sg="skip">Skip</button>';
          }
          html += '</div>';
          html += `<p class="th-small">From a position in the ${escapeHtml(cur.name)}. <button type="button" class="linkish" data-sg="opening">Learn this opening</button></p>`;
        }
      }
      const all = R.LESSONS.reduce((n, l) => n + solvedSet(l.id).size, 0);
      html += `<p class="pz-stats">This lesson: ${done} of ${total} solved · All lessons: ${all} solved · First-try score ${st.played ? Math.round((100 * st.right) / st.played) : 0}%</p>`;
      el.innerHTML = html;
      api.refresh();
    }

    let rulesOpen = true;
    el.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('sg-rules')) rulesOpen = e.target.open; }, true);
    el.addEventListener('change', (e) => {
      if (e.target.id !== 'sgLesson') return;
      st.lesson = e.target.value;
      save();
      start(pick());
    });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.closest('#thSection')) {
        const v = b.dataset.value;
        if (v !== 'middlegame') api.setMode('theory', { view: v === 'plan' ? 'plan' : 'learn' });
        return;
      }
      if (!cur) return;
      const a = b.dataset.sg;
      if (a === 'opening') { api.setMode('theory', { view: 'learn', lineName: cur.name }); return; }
      if (a === 'tryit') { st.examples[st.lesson] = true; save(); start(pick() === null ? null : nextAfter(cur.fen)); }
      else if (a === 'next') start(nextAfter(cur.fen));
      else if (a === 'skip') start(nextAfter(cur.fen));
      else if (a === 'hint') hint();
      else if (a === 'show') showMe();
    });

    // The next exercise after this one (unsolved first).
    function nextAfter(fen) {
      const list = exercises(st.lesson);
      if (!list.length) return null;
      const done = solvedSet(st.lesson);
      const i = list.findIndex((e) => e[0] === fen);
      for (let k = 1; k <= list.length; k++) {
        const e = list[(i + k) % list.length];
        if (!done.has(fenKey(e[0])) && e[0] !== fen) return e;
      }
      return list[(i + 1) % list.length];
    }

    return {
      async enter() {
        active = true;
        render();
        if (!data) {
          try { data = await loadData(); } catch (err) { el.innerHTML = `<p class="pz-wrong">${escapeHtml(err.message)}</p>`; return; }
        }
        if (!active) return;
        if (!R.LESSON_BY_ID.has(st.lesson)) st.lesson = R.LESSONS[0].id;
        start(pick());
      },
      exit() { active = false; token++; cur = null; api.arrows([]); api.marks([]); },
      canMove,
      onMovePlayed,
      isBusy: () => !!cur && cur.busy,
    };
  }

  return { create };
})();
