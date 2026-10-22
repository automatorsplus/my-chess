/*
 * MyChess user interface.
 *
 * Mirrors the split seen in Apple's Chess: the window (MBCBoardWin) owns a
 * board model (MBCBoard), a human player (MBCInteractivePlayer) and an engine
 * player (MBCEngine) that runs the search out of process. Here the rules come
 * from js/core.js on the page, the opponent searches in a Web Worker
 * (js/engine-host.js), and the coach analyses positions with Stockfish
 * (js/analyzer.js) and explains them (js/coach.js).
 */
(function () {
  'use strict';

  const Core = MyChessCore();
  const { Position, START_FEN } = Core;
  const coach = window.MyChessCoach(Core);

  // Difficulty follows the Mac's strength slider, which sends Sjeng a search
  // depth ("sd N"): Easy = slider position 1 (the Mac's default), Medium =
  // position 4, Hard = position 10. Hard also gets a time cap so a move never
  // takes more than a few seconds in the browser.
  const LEVELS = {
    easy: { depth: 1, timeMs: 3000, randomMargin: 40, text: 'Thinks 1 move ahead' },
    medium: { depth: 4, timeMs: 5000, randomMargin: 0, text: 'Thinks 4 moves ahead' },
    hard: { depth: 10, timeMs: 6000, randomMargin: 0, text: 'Thinks up to 10 moves ahead, 6 s max' },
  };
  const REVIEW_WINDOW = 8; // how many recent moves the coach (re)analyses automatically

  const GLYPH = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
  const PIECE_NAME = { k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn' };
  const STYLE_COLORS = {
    wood: { inlay: '#1e1006', label: 'rgba(255, 238, 214, 0.8)', whiteEdge: 'rgba(58, 33, 12, 0.95)', blackEdge: 'rgba(10, 4, 0, 0.95)' },
    marble: { inlay: '#2d2f2e', label: 'rgba(255, 255, 255, 0.85)', whiteEdge: 'rgba(70, 70, 70, 0.9)', blackEdge: 'rgba(0, 0, 0, 0.95)' },
    metal: { inlay: '#0d0e10', label: 'rgba(235, 238, 242, 0.85)', whiteEdge: 'rgba(60, 64, 70, 0.95)', blackEdge: 'rgba(0, 0, 0, 0.95)' },
    walnut: { inlay: '#140a03', label: 'rgba(255, 236, 210, 0.82)', whiteEdge: 'rgba(70, 45, 20, 0.95)', blackEdge: 'rgba(8, 3, 0, 0.95)' },
    ebony: { inlay: '#050404', label: 'rgba(245, 238, 225, 0.85)', whiteEdge: 'rgba(80, 70, 55, 0.9)', blackEdge: 'rgba(0, 0, 0, 0.95)' },
    tournament: { inlay: '#1b2416', label: 'rgba(240, 244, 230, 0.88)', whiteEdge: 'rgba(60, 60, 60, 0.9)', blackEdge: 'rgba(0, 0, 0, 0.95)' },
  };
  const STORAGE_KEY = 'mychess.v1';

  // ---------------------------------------------------------------- state

  const S = {
    settings: { players: 'w', level: 'easy', elo: 1200, adaptiveElo: false, style: 'wood', pieceStyle: null, pieces3d: true, view3d: true, showLegal: true, speak: false, coach: true, evalBar: true, mode: 'play', textSize: 'large' },
    mode: 'play', // 'play', 'puzzles', 'endgames' or 'theory'
    stash: null, // the game in progress, parked while in a trainer mode
    puzzleStatus: null,
    startFen: START_FEN,
    moves: [], // { uci, san, by: 'human' | 'computer', review }
    fens: [START_FEN],
    keys: [],
    pos: new Position(),
    flipped: false,
    selected: -1,
    targets: [],
    thinking: false,
    token: 0,
    gen: 0,
    over: null,
    hint: null,
    arrows: [], // trainer arrows: { from, to, kind }
    marks: new Map(), // trainer square rings: 0x88 square -> kind
    pendingPlayers: null,
    noteTimer: 0,
    reviewIdx: null,
    curEval: null,
    engineStatus: { kind: 'loading', name: 'Starting engine…' },
  };
  S.keys = [S.pos.key()];

  const engine = new window.MyChessEngineHost();
  const opponent = window.MyChessAnalyzer.createOpponent(); // Stockfish at a chosen Elo (needs the local server)
  const { ELO_FLOOR, ELO_MAX } = window.MyChessAnalyzer;
  const trainers = {}; // 'puzzles', 'endgames' and 'theory', created once the board functions exist
  const trainer = () => (S.mode === 'play' ? null : trainers[S.mode]);
  // The status callback can fire during create(), before the page is wired up, so defer it.
  const analyzer = window.MyChessAnalyzer.create(Core, (kind, name) => setTimeout(() => {
    S.engineStatus = { kind, name };
    renderCoach();
    scheduleAnalysis();
  }, 0));

  const $ = (id) => document.getElementById(id);
  const els = {
    board: $('board'), grid: $('grid'), pieces: $('pieces'), marks: $('marks'), labels: $('labels'), field: $('field'),
    statusTurn: $('statusTurn'), statusNote: $('statusNote'), status: $('status'),
    players: $('players'), level: $('level'), levelHint: $('levelHint'), boardStyle: $('boardStyle'), pieceStyle: $('pieceStyle'), pieces3d: $('pieces3d'),
    eloBox: $('eloBox'), eloRange: $('eloRange'), eloValue: $('eloValue'), eloMine: $('eloMine'), eloAdaptive: $('eloAdaptive'),
    view3d: $('view3d'), showLegal: $('showLegal'), speak: $('speak'), coachOn: $('coachOn'), evalOn: $('evalOn'), textSize: $('textSize'),
    newGame: $('newGame'), takeBack: $('takeBack'), hint: $('hint'), rotate: $('rotate'),
    log: $('log'), promo: $('promo'), promoChoices: $('promoChoices'),
    evalBar: $('evalBar'), evalFill: $('evalFill'), evalText: $('evalText'),
    coach: $('coach'), engineChip: $('engineChip'), opening: $('opening'), review: $('review'), accuracy: $('accuracy'),
    modeTabs: $('modeTabs'), puzzlePanel: $('puzzlePanel'), endgamePanel: $('endgamePanel'), theoryPanel: $('theoryPanel'), strategyPanel: $('strategyPanel'),
  };

  const isWhitePiece = (ch) => ch === ch.toUpperCase();
  const sqFile = (sq) => sq & 7;
  const sqRank = (sq) => sq >> 4;
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- persistence

  function save() {
    const g = S.mode !== 'play' && S.stash ? S.stash : S; // never save a puzzle or drill as your game
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        settings: S.settings,
        startFen: g.startFen,
        moves: g.moves.map((m) => m.uci),
        by: g.moves.map((m) => m.by),
        reviews: g.moves.map((m) => m.review || null),
        flipped: g.flipped,
      }));
    } catch (err) { /* storage unavailable: nothing to do */ }
  }

  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (err) { data = null; }
    if (!data) return false;
    if (data.settings) Object.assign(S.settings, data.settings);
    if (!LEVELS[S.settings.level] && S.settings.level !== 'rating') S.settings.level = 'easy';
    S.settings.elo = Math.max(400, Math.min(ELO_MAX, +S.settings.elo || 1200));
    S.startFen = data.startFen || START_FEN;
    try { S.pos = new Position(S.startFen); } catch (err) { S.startFen = START_FEN; S.pos = new Position(); }
    S.moves = [];
    S.fens = [S.pos.toFEN()];
    S.keys = [S.pos.key()];
    (data.moves || []).forEach((uci, i) => {
      if (S.moves.length !== i) return;
      const m = S.pos.moveFromUci(uci);
      if (!m) return;
      const san = S.pos.san(m);
      S.pos.make(m);
      S.moves.push({ uci, san, by: (data.by && data.by[i]) || 'human', review: (data.reviews && data.reviews[i]) || null });
      S.fens.push(S.pos.toFEN());
      S.keys.push(S.pos.key());
    });
    S.flipped = !!data.flipped;
    S.over = S.pos.outcome();
    return true;
  }

  // ---------------------------------------------------------------- board building

  function buildSquares() {
    els.grid.innerHTML = '';
    for (let i = 0; i < 64; i++) {
      const d = document.createElement('div');
      d.className = 'sq';
      d.setAttribute('role', 'gridcell');
      els.grid.appendChild(d);
    }
  }

  // Grid cell (row 0 = top) for a 0x88 square, taking rotation into account.
  function cellOf(sq) {
    const f = sqFile(sq), r = sqRank(sq);
    return S.flipped ? { col: 7 - f, row: r } : { col: f, row: 7 - r };
  }

  function layoutSquares() {
    const cells = els.grid.children;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const f = S.flipped ? 7 - col : col, r = S.flipped ? row : 7 - row;
        const sq = r * 16 + f;
        const d = cells[row * 8 + col];
        d.dataset.sq = sq;
        d.className = 'sq ' + ((f + r) % 2 ? 'light' : 'dark');
        // Offset the texture per square so neighbouring squares show different grain.
        const h = (sq * 2654435761) >>> 0;
        d.style.backgroundPosition = `${h % 97}% ${(h >>> 8) % 89}%`;
      }
    }
    els.labels.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const file = document.createElement('span');
      file.textContent = 'abcdefgh'[S.flipped ? 7 - i : i];
      file.style.left = `calc(var(--fr) + (${i} + 0.5) * var(--sq))`;
      file.style.top = 'calc(100% - var(--fr) / 2)';
      els.labels.appendChild(file);
      const rank = document.createElement('span');
      rank.textContent = String(S.flipped ? i + 1 : 8 - i);
      rank.style.left = 'calc(var(--fr) / 2)';
      rank.style.top = `calc(var(--fr) + (${i} + 0.5) * var(--sq))`;
      els.labels.appendChild(rank);
    }
  }

  const pieceEls = new Map(); // 0x88 square -> element

  function makePieceEl(ch) {
    const el = document.createElement('div');
    el.className = 'piece ' + (isWhitePiece(ch) ? 'white' : 'black');
    const g = document.createElement('div');
    g.className = 'glyph';
    g.textContent = GLYPH[ch.toLowerCase()];
    g.style.setProperty('--sprite', `var(--sprite-${ch})`);
    el.appendChild(g);
    el.dataset.piece = ch;
    return el;
  }

  function placeEl(el, sq) {
    const { col, row } = cellOf(sq);
    el.style.left = col * 12.5 + '%';
    el.style.top = row * 12.5 + '%';
    el.dataset.sq = sq;
  }

  function renderPieces() {
    els.pieces.innerHTML = '';
    pieceEls.clear();
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const ch = S.pos.pieceAt(f, r);
        if (!ch) continue;
        const sq = r * 16 + f;
        const el = makePieceEl(ch);
        el.classList.add('instant');
        placeEl(el, sq);
        els.pieces.appendChild(el);
        pieceEls.set(sq, el);
      }
    }
    requestAnimationFrame(() => pieceEls.forEach((el) => el.classList.remove('instant')));
    updateMovable();
  }

  function updateMovable() {
    const canMove = humanCanMove();
    pieceEls.forEach((el) => {
      const mine = canMove && (isWhitePiece(el.dataset.piece) ? 0 : 1) === S.pos.side;
      el.firstChild.classList.toggle('movable', mine);
      el.firstChild.setAttribute('aria-hidden', 'true');
    });
  }

  // ---------------------------------------------------------------- highlights & arrows

  function squareEl(sq) {
    const { col, row } = cellOf(sq);
    return els.grid.children[row * 8 + col];
  }

  function updateHighlights() {
    for (const d of els.grid.children) {
      d.classList.remove('selected', 'target', 'capture', 'check', 'last-from', 'last-to', 'mark-danger', 'mark-target', 'mark-focus');
    }
    S.marks.forEach((kind, sq) => squareEl(sq).classList.add('mark-' + kind));
    const last = S.moves[S.moves.length - 1];
    if (last) {
      squareEl(Core.parseSq(last.uci.slice(0, 2))).classList.add('last-from');
      squareEl(Core.parseSq(last.uci.slice(2, 4))).classList.add('last-to');
    }
    if (S.selected >= 0) {
      squareEl(S.selected).classList.add('selected');
      for (const m of S.targets) {
        const d = squareEl(Core.moveTo(m));
        d.classList.add('target');
        if (m & Core.FLAG_CAPTURE) d.classList.add('capture');
      }
    }
    if (S.pos.inCheck()) squareEl(S.pos.kingSq[S.pos.side]).classList.add('check');
    for (const d of els.grid.children) {
      const sq = +d.dataset.sq;
      const ch = S.pos.pieceAt(sqFile(sq), sqRank(sq));
      d.setAttribute('aria-label', Core.sqName(sq) + (ch ? `, ${isWhitePiece(ch) ? 'white' : 'black'} ${PIECE_NAME[ch.toLowerCase()].toLowerCase()}` : ''));
    }
    drawArrows();
  }

  // A rounded arrow between two squares. Knight moves bend into an L, the way you
  // would trace them with a finger. kind sets the colour: best/alt (Stockfish,
  // green), book/hint (theory, blue), threat (red), last (the move just played).
  function arrowSvg(fromSq, toSq, kind) {
    const a = cellOf(fromSq), b = cellOf(toSq);
    const x1 = a.col * 100 + 50, y1 = a.row * 100 + 50, x2 = b.col * 100 + 50, y2 = b.row * 100 + 50;
    const dc = Math.abs(b.col - a.col), dr = Math.abs(b.row - a.row);
    const knight = (dc === 1 && dr === 2) || (dc === 2 && dr === 1);
    const pts = knight ? [[x1, y1], dr === 2 ? [x1, y2] : [x2, y1], [x2, y2]] : [[x1, y1], [x2, y2]];
    const w = kind === 'alt' ? 10 : kind === 'last' ? 9 : 14;
    const [px, py] = pts[pts.length - 2];
    const len = Math.hypot(x2 - px, y2 - py), ux = (x2 - px) / len, uy = (y2 - py) / len, nx = -uy, ny = ux;
    const headLen = w * 2.4, headHalf = w * 1.55;
    const tx = x2 - ux * 10, ty = y2 - uy * 10; // tip, just short of the centre of the target square
    const bx = tx - ux * headLen, by = ty - uy * headLen; // where the head meets the shaft
    const [qx, qy] = pts[1];
    const l0 = Math.hypot(qx - x1, qy - y1);
    const sx = x1 + ((qx - x1) / l0) * 16, sy = y1 + ((qy - y1) / l0) * 16;
    const f = (v) => v.toFixed(1);
    const bend = pts.slice(1, -1).map(([x, y]) => `L${f(x)},${f(y)}`).join(' ');
    const d = `M${f(sx)},${f(sy)} ${bend} L${f(bx + ux * 2)},${f(by + uy * 2)}`;
    const head = [[tx, ty], [bx + nx * headHalf, by + ny * headHalf], [bx - nx * headHalf, by - ny * headHalf]].map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
    return `<g class="arrow arrow-${kind}"><path d="${d}" stroke-width="${w}"/><polygon points="${head}"/></g>`;
  }

  function drawArrows() {
    let svg = '';
    const last = S.moves[S.moves.length - 1];
    // The last-move arrow steps aside while the coach is drawing its own arrows.
    if (last && !S.arrows.length && !S.hint) svg += arrowSvg(Core.parseSq(last.uci.slice(0, 2)), Core.parseSq(last.uci.slice(2, 4)), 'last');
    if (S.hint) svg += arrowSvg(S.hint.from, S.hint.to, S.hint.best ? 'best' : 'hint');
    // Weaker suggestions first, so the best move's arrow is drawn on top.
    const order = { alt: 0, book: 1, hint: 2, threat: 3, best: 4 };
    for (const a of [...S.arrows].sort((x, y) => order[x.kind] - order[y.kind])) svg += arrowSvg(a.from, a.to, a.kind);
    els.marks.innerHTML = svg;
  }

  // ---------------------------------------------------------------- status, log, controls

  function setNote(text, kind, ms) {
    clearTimeout(S.noteTimer);
    els.statusNote.textContent = text || '';
    els.statusNote.className = 'status-note' + (kind ? ' ' + kind : '');
    if (ms) S.noteTimer = setTimeout(() => setNote(''), ms);
  }

  function updateStatus() {
    if (S.mode !== 'play') {
      els.statusTurn.textContent = S.puzzleStatus ? S.puzzleStatus.main : '';
      els.status.classList.remove('thinking');
      document.title = 'MyChess — ' + { puzzles: 'Puzzles', endgames: 'Endgames', theory: 'Theory', strategy: 'Theory: middlegame' }[S.mode];
      return;
    }
    let turn;
    if (S.over) {
      const r = S.over.result;
      turn = r === '1-0' ? 'White wins!' : r === '0-1' ? 'Black wins!' : 'Draw!';
      const reason = S.over.reason.charAt(0).toUpperCase() + S.over.reason.slice(1);
      setNote(reason, 'good');
    } else {
      const side = S.pos.side === 0 ? 'White' : 'Black';
      turn = S.thinking ? `${side} is thinking` : `${side} to move`;
      if (S.pos.inCheck() && !S.thinking && !els.statusNote.classList.contains('warn')) setNote('Check!', 'warn');
    }
    els.statusTurn.textContent = turn;
    els.status.classList.toggle('thinking', S.thinking);
    document.title = `MyChess — ${turn}`;
    els.takeBack.disabled = !S.moves.length || S.settings.players === 'c';
    els.hint.disabled = !humanCanMove();
  }

  function renderLog() {
    const ol = els.log;
    ol.innerHTML = '';
    const startsBlack = S.startFen.split(' ')[1] === 'b';
    const firstNum = parseInt(S.startFen.split(' ')[5] || '1', 10) || 1;
    const offset = startsBlack ? 1 : 0;
    const shown = S.reviewIdx === null ? S.moves.length - 1 : S.reviewIdx;
    for (let row = 0; row * 2 - offset < S.moves.length; row++) {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = firstNum + row + '.';
      li.appendChild(num);
      for (let k = 0; k < 2; k++) {
        const i = row * 2 + k - offset;
        const mv = S.moves[i];
        if (!mv) {
          const span = document.createElement('span');
          span.textContent = i < 0 ? '…' : '';
          li.appendChild(span);
          continue;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mv';
        btn.dataset.idx = i;
        const r = mv.review;
        if (r && S.settings.coach) btn.classList.add('tone-' + r.tone);
        if (i === shown) btn.classList.add('current');
        btn.textContent = mv.san + (r && S.settings.coach && r.symbol ? r.symbol : '');
        btn.title = r ? `${r.label}${r.accuracy !== null ? ` · accuracy ${Math.round(r.accuracy)}%` : ''}` : '';
        li.appendChild(btn);
      }
      ol.appendChild(li);
    }
    if (S.over) {
      const li = document.createElement('li');
      li.innerHTML = '<span class="result"></span>';
      li.firstChild.textContent = S.over.result;
      ol.appendChild(li);
    }
    if (S.reviewIdx === null) ol.scrollTop = ol.scrollHeight;
  }

  function syncControls() {
    const s = S.settings;
    els.players.value = S.pendingPlayers || s.players;
    for (const b of els.level.children) b.setAttribute('aria-checked', String(b.dataset.value === s.level));
    els.boardStyle.value = s.style;
    els.pieceStyle.value = s.pieceStyle || s.style;
    els.pieces3d.checked = s.pieces3d;
    els.levelHint.textContent = s.players === '2' ? 'Two players: no computer' : levelText();
    els.eloBox.hidden = s.level !== 'rating';
    els.eloRange.value = s.elo;
    els.eloValue.textContent = s.elo;
    els.eloAdaptive.checked = !!s.adaptiveElo;
    els.view3d.checked = s.view3d;
    els.showLegal.checked = s.showLegal;
    els.speak.checked = s.speak;
    els.coachOn.checked = s.coach;
    els.evalOn.checked = s.evalBar;
    els.textSize.value = s.textSize;
    document.documentElement.classList.toggle('text-large', s.textSize === 'large');
    document.documentElement.classList.toggle('text-xl', s.textSize === 'xl');
    document.body.classList.toggle('view3d', s.view3d);
    document.body.classList.toggle('show-legal', s.showLegal);
    document.body.classList.toggle('no-coach', !s.coach);
    document.body.classList.toggle('no-eval', !s.evalBar);
  }

  // Board textures come from the board style; piece textures (and the 3D set) from the piece style.
  function applyStyle() {
    const name = S.settings.style;
    const pieces = S.settings.pieceStyle || name;
    const t = window.MyChessTextures.get(name);
    const pt = window.MyChessTextures.get(pieces);
    const c = STYLE_COLORS[name] || STYLE_COLORS.wood;
    const pc = STYLE_COLORS[pieces] || STYLE_COLORS.wood;
    const root = document.documentElement.style;
    root.setProperty('--tex-light', `url(${t.light})`);
    root.setProperty('--tex-dark', `url(${t.dark})`);
    root.setProperty('--tex-frame-h', `url(${t.frameH})`);
    root.setProperty('--tex-frame-v', `url(${t.frameV})`);
    root.setProperty('--tex-white', `url(${pt.white})`);
    root.setProperty('--tex-black', `url(${pt.black})`);
    root.setProperty('--inlay', c.inlay);
    root.setProperty('--label', c.label);
    root.setProperty('--white-edge', pc.whiteEdge);
    root.setProperty('--black-edge', pc.blackEdge);
    applySprites();
  }

  // 3D pieces: js/pieces3d.js renders each set once (an ES module, so only when
  // served over http). Until it is ready, or when it is off, the glyph pieces show.
  const spriteCache = {};
  let spriteWanted = null;
  function applySprites() {
    const s = S.settings;
    const style = s.pieceStyle || s.style;
    const lib = window.MyChessPieces3D;
    spriteWanted = style;
    if (!s.pieces3d || !lib) { document.body.classList.remove('sprites'); return; }
    const show = (set) => {
      if (spriteWanted !== style || !S.settings.pieces3d) return;
      const root = document.documentElement.style;
      for (const [ch, url] of Object.entries(set)) root.setProperty(`--sprite-${ch}`, `url(${url})`);
      document.body.classList.add('sprites');
    };
    if (spriteCache[style]) { show(spriteCache[style]); return; }
    lib.renderSet(style).then((set) => { spriteCache[style] = set; show(set); }).catch((err) => {
      console.warn('3D pieces could not be drawn; using the flat pieces', err);
      document.body.classList.remove('sprites');
    });
  }
  window.addEventListener('mychess:pieces3d', () => applySprites());

  function fullRender() {
    layoutSquares();
    renderPieces();
    updateHighlights();
    updateStatus();
    renderLog();
    syncControls();
    renderEvalBar();
    renderCoach();
  }

  // ---------------------------------------------------------------- coach

  const sideName = (side) => (side === 0 ? 'White' : 'Black');
  // Side that played move i (0 = White).
  const moverOf = (i) => ((S.startFen.split(' ')[1] === 'b' ? 1 : 0) + i) & 1;

  function whoFor(i) {
    const mv = S.moves[i];
    if (S.settings.players === '2' || S.settings.players === 'c' || mv.by !== 'human') return sideName(moverOf(i));
    return 'you';
  }

  function scheduleAnalysis() {
    if (S.mode !== 'play') return; // puzzles and drills ask the analyzer themselves
    if (!S.settings.coach && !S.settings.evalBar) return;
    if (S.engineStatus.kind === 'loading') return;
    const n = S.fens.length - 1;
    const cur = S.fens[n];
    analyzer.analyse(cur).then((r) => {
      if (r && S.fens[S.fens.length - 1] === cur) { S.curEval = r; renderEvalBar(); }
    });
    if (S.settings.coach) {
      for (let i = Math.max(0, S.moves.length - REVIEW_WINDOW); i < S.moves.length; i++) reviewMove(i);
    }
  }

  async function reviewMove(i) {
    const mv = S.moves[i];
    if (!mv || mv.review || mv.reviewing) return;
    mv.reviewing = true;
    const gen = S.gen;
    const fenBefore = S.fens[i], fenAfter = S.fens[i + 1];
    const [before, after] = await Promise.all([analyzer.analyse(fenBefore), analyzer.analyse(fenAfter)]);
    mv.reviewing = false;
    if (gen !== S.gen || S.moves[i] !== mv || !before || !after) return;
    const standard = S.startFen === START_FEN;
    const book = standard && i < 30 && coach.isBook(S.keys[i + 1]);
    const opening = standard ? coach.openingForLine(S.keys.slice(0, i + 2)) : null;
    mv.review = coach.review({ fenBefore, fenAfter, uci: mv.uci, before, after, book, opening, who: whoFor(i) });
    renderLog();
    renderCoach();
    save();
  }

  function renderEvalBar() {
    if (!S.curEval) { els.evalText.textContent = ''; return; }
    const pct = coach.whiteWinPct(S.curEval.score, S.pos.side);
    els.evalFill.style.height = pct.toFixed(1) + '%';
    els.evalBar.classList.toggle('flipped', S.flipped);
    const text = coach.formatEval(S.curEval.score, S.pos.side);
    // Keep the label short enough for the bar: "+0.4", "−3.2", "12", "M3".
    els.evalText.textContent = text.replace(/^\+/, '').replace(/^(−?\d{2,})\.\d$/, '$1');
    els.evalText.classList.toggle('on-white', pct >= 50);
    els.evalBar.setAttribute('aria-label', `Evaluation ${text} (from White’s side)`);
  }

  // Which move the coach card talks about: the one picked in the log, or the latest move by a human.
  function reviewTarget() {
    if (S.reviewIdx !== null && S.moves[S.reviewIdx]) return S.reviewIdx;
    for (let i = S.moves.length - 1; i >= 0; i--) {
      if (S.moves[i].by === 'human' || S.settings.players === 'c') return i;
    }
    return -1;
  }

  function renderCoach() {
    if (!els.coach) return;
    const chip = els.engineChip;
    chip.textContent = S.engineStatus.name;
    chip.className = 'engine-chip ' + S.engineStatus.kind;

    // Opening name and its main idea.
    let openingHtml;
    if (S.startFen !== START_FEN) openingHtml = '<p class="idea">Custom start position.</p>';
    else if (!S.moves.length) openingHtml = `<p class="idea">${escapeHtml(coach.START_ADVICE)}</p>`;
    else {
      const o = coach.openingForLine(S.keys);
      if (!o) openingHtml = '<p class="idea">No named opening yet. Keep developing toward the centre.</p>';
      else {
        const left = o.inBook ? '' : ` <span class="out">out of book after move ${Math.floor((o.ply - 1) / 2) + 1}</span>`;
        openingHtml = `<p class="opening-name"><span class="eco">${escapeHtml(o.eco)}</span> ${escapeHtml(o.name)}${left}</p><p class="idea">${escapeHtml(o.idea)}</p>`;
      }
    }
    els.opening.innerHTML = openingHtml;

    // Move review.
    const i = reviewTarget();
    let html;
    if (i < 0) html = '<p class="muted">Make a move and the coach will grade it.</p>';
    else {
      const mv = S.moves[i];
      const r = mv.review;
      const label = `${new Position(S.fens[i]).fullmove}${moverOf(i) === 0 ? '.' : '…'} ${escapeHtml(mv.san)}`;
      if (!r) html = `<p class="muted"><span class="spinner"></span>Analysing ${label}…</p>`;
      else {
        html = `<p class="review-head"><span class="badge tone-${r.tone}">${escapeHtml(r.label)}</span> <strong>${label}${escapeHtml(r.symbol)}</strong>` +
          `<span class="evals">${escapeHtml(r.evalBefore)} → ${escapeHtml(r.evalAfter)}</span></p>` +
          `<p>${escapeHtml(r.text)}</p>`;
        if (r.better) {
          html += `<p class="better">Better was <strong>${escapeHtml(r.better.san)}</strong>, which ${escapeHtml(r.better.why)}.` +
            (r.better.line ? ` <span class="line">${escapeHtml(r.better.line)}</span>` : '') + '</p>';
        }
        if (r.tip) html += `<p class="tip"><strong>Tip:</strong> ${escapeHtml(r.tip)}</p>`;
        const canRetry = mv.by === 'human' && S.settings.players !== 'c' && ['inaccuracy', 'mistake', 'blunder'].includes(r.kind) && !S.thinking;
        if (canRetry) {
          html += `<div class="review-actions"><button type="button" class="btn small" data-retry="${i}">Try again</button>` +
            `<button type="button" class="btn small" data-show="${i}">Show me</button></div>`;
        }
      }
      if (S.reviewIdx !== null && S.reviewIdx !== S.moves.length - 1) html += '<p class="muted small">Showing an earlier move. Click the last move in the log to follow the game.</p>';
    }
    els.review.innerHTML = html;

    // Accuracy per side.
    const sums = [[0, 0], [0, 0]];
    S.moves.forEach((mv, k) => {
      if (mv.review && mv.review.accuracy !== null) { const s = moverOf(k); sums[s][0] += mv.review.accuracy; sums[s][1]++; }
    });
    const label = (side) => {
      const p = S.settings.players;
      if ((p === 'w' && side === 0) || (p === 'b' && side === 1)) return 'You';
      if (p === 'w' || p === 'b') return 'Computer';
      return sideName(side);
    };
    const part = (side) => `${label(side)} ${sums[side][1] ? Math.round(sums[side][0] / sums[side][1]) + '%' : '–'}`;
    els.accuracy.textContent = `Accuracy: ${part(0)} · ${part(1)}`;
  }

  // ---------------------------------------------------------------- turn logic

  function isComputerTurn() {
    if (S.mode !== 'play') return false;
    const p = S.settings.players;
    if (p === 'c') return true;
    if (p === '2') return false;
    return (p === 'w' && S.pos.side === 1) || (p === 'b' && S.pos.side === 0);
  }

  function humanCanMove() {
    if (S.mode !== 'play') return !!trainer() && trainer().canMove() && !S.over && els.promo.hidden;
    return !S.over && !S.thinking && !isComputerTurn() && els.promo.hidden;
  }

  function deselect() {
    S.selected = -1;
    S.targets = [];
  }

  function select(sq) {
    S.selected = sq;
    S.targets = S.pos.legalMoves().filter((m) => Core.moveFrom(m) === sq);
    updateHighlights();
  }

  function illegal() {
    setNote('Illegal Move!', 'warn', 1800);
  }

  function speakMove(info, san) {
    if (!S.settings.speak || !('speechSynthesis' in window)) return;
    let text;
    if (san.startsWith('O-O-O')) text = 'Castle queen side';
    else if (san.startsWith('O-O')) text = 'Castle king side';
    else {
      text = `${PIECE_NAME[info.piece.toLowerCase()]} ${info.from.split('').join(' ')} ${info.capture ? 'takes' : 'to'} ${info.to.split('').join(' ')}`;
      if (info.promo) text += `, promoting to ${PIECE_NAME[info.promo]}`;
    }
    if (san.endsWith('#')) text += ', checkmate';
    else if (san.endsWith('+')) text += ', check';
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    } catch (err) { /* speech not available */ }
  }

  // Plays a legal move on the model and slides the pieces on screen.
  function playMove(m, opts) {
    const pos = S.pos;
    const from = Core.moveFrom(m), to = Core.moveTo(m), promo = Core.movePromo(m);
    const san = pos.san(m), uci = pos.moveToUci(m);
    const moverCh = pos.pieceAt(sqFile(from), sqRank(from));
    const info = { piece: moverCh, from: Core.sqName(from), to: Core.sqName(to), capture: !!(m & Core.FLAG_CAPTURE), promo: promo ? ' kqbnr'[promo] : '' };
    const capSq = m & Core.FLAG_EP ? to + (pos.side === 0 ? -16 : 16) : (m & Core.FLAG_CAPTURE ? to : -1);

    pos.make(m);
    S.moves.push({ uci, san, by: opts && opts.computer ? 'computer' : 'human', review: null });
    S.fens.push(pos.toFEN());
    S.keys.push(pos.key());
    S.reviewIdx = null;
    deselect();
    S.hint = null;
    S.arrows = [];
    S.marks = new Map();

    // Animate.
    if (capSq >= 0 && pieceEls.has(capSq)) {
      const capEl = pieceEls.get(capSq);
      pieceEls.delete(capSq);
      capEl.classList.add('captured');
      setTimeout(() => capEl.remove(), 320);
    }
    const el = pieceEls.get(from);
    if (el) {
      pieceEls.delete(from);
      el.classList.remove('dragging');
      if (opts && opts.instant) {
        el.classList.add('instant');
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('instant')));
      }
      placeEl(el, to);
      pieceEls.set(to, el);
      if (promo) {
        const newCh = pos.pieceAt(sqFile(to), sqRank(to));
        setTimeout(() => {
          el.firstChild.textContent = GLYPH[newCh.toLowerCase()];
          el.firstChild.style.setProperty('--sprite', `var(--sprite-${newCh})`);
          el.dataset.piece = newCh;
        }, opts && opts.instant ? 0 : 280);
      }
    }
    if (m & Core.FLAG_CASTLE) {
      const rf = to > from ? from + 3 : from - 4, rt = to > from ? from + 1 : from - 1;
      const rook = pieceEls.get(rf);
      if (rook) { pieceEls.delete(rf); placeEl(rook, rt); pieceEls.set(rt, rook); }
    }

    if (opts && opts.computer) speakMove(info, san);
    S.over = pos.outcome();
    if (S.over) setTimeout(adjustRatingAfterGame, 0);
    if (!(opts && opts.keepNote)) setNote('');
    updateHighlights();
    updateMovable();
    updateStatus();
    renderLog();
    renderCoach();
    if (S.mode !== 'play') { if (trainer()) trainer().onMovePlayed(S.moves[S.moves.length - 1], opts); return; }
    save();
    scheduleAnalysis();
    if (!S.over) scheduleComputer();
  }

  function scheduleComputer() {
    if (S.over || !isComputerTurn()) return;
    const token = ++S.token;
    S.thinking = true;
    updateStatus();
    updateMovable();
    setTimeout(() => computerMove(token), S.settings.players === 'c' ? 450 : 120);
  }

  function levelText() {
    const s = S.settings;
    if (s.level !== 'rating') return LEVELS[s.level].text;
    if (s.elo >= ELO_MAX) return 'Stockfish at full strength (3190, its top setting)';
    return s.elo >= ELO_FLOOR
      ? `Stockfish playing at about ${s.elo} Elo`
      : `About ${s.elo} Elo: a rough estimate, since Stockfish’s own scale starts at ${ELO_FLOOR}`;
  }

  // Stockfish at the chosen rating. Returns a UCI move, or null if it is unavailable.
  async function ratedMove(token) {
    let ready = true;
    try { await opponent.ready; } catch (e) { ready = false; }
    if (!ready || token !== S.token) return null;
    const fen = S.fens[S.fens.length - 1];
    const r = await opponent.move(fen, S.settings.elo);
    if (!r || !r.best || token !== S.token) return null;
    // Below Stockfish's floor, play some deliberately random moves, as beginners do.
    if (Math.random() < opponent.randomShare(S.settings.elo)) {
      const legal = S.pos.legalMoves();
      return { move: S.pos.moveToUci(legal[Math.floor(Math.random() * legal.length)]), random: true };
    }
    return { move: r.best };
  }

  async function computerMove(token) {
    if (token !== S.token) return;
    if (S.settings.level === 'rating') {
      const started = performance.now();
      const r = await ratedMove(token);
      if (token !== S.token) return;
      if (r) {
        const wait = Math.max(0, 500 - (performance.now() - started));
        if (wait) await new Promise((res) => setTimeout(res, wait));
        if (token !== S.token) return;
        S.thinking = false;
        const m = S.pos.moveFromUci(r.move);
        if (!m) { updateStatus(); return; }
        playMove(m, { computer: true, keepNote: true });
        if (!S.over && !S.pos.inCheck()) setNote(`Stockfish at ${S.settings.elo}`, '', 3000);
        return;
      }
      setNote('Rated play needs Stockfish: start MyChess with the launcher. Using the built-in engine for now.', 'warn', 5000);
    }
    const lvl = LEVELS[S.settings.level] || (S.settings.elo < 1000 ? LEVELS.easy : S.settings.elo < 1800 ? LEVELS.medium : LEVELS.hard);
    const started = performance.now();
    const res = await engine.search({
      fen: S.startFen,
      moves: S.moves.map((m) => m.uci),
      depth: lvl.depth,
      timeMs: lvl.timeMs,
      randomMargin: lvl.randomMargin,
      useBook: true,
    });
    if (token !== S.token || !res) return;
    // A short pause keeps instant replies (book moves, easy level) from feeling abrupt.
    const wait = Math.max(0, 350 - (performance.now() - started));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    if (token !== S.token) return;
    S.thinking = false;
    const m = res.move ? S.pos.moveFromUci(res.move) : 0;
    if (!m) { updateStatus(); return; }
    const note = res.book ? 'Book move' : `Searched ${res.depth} ${res.depth === 1 ? 'move' : 'moves'} deep in ${(res.ms / 1000).toFixed(1)} s`;
    playMove(m, { computer: true, keepNote: true });
    if (!S.over && !(S.pos.inCheck())) setNote(note, '', 4000);
  }

  function stopThinking() {
    S.token++;
    if (S.thinking) { engine.cancel(); opponent.stop(); }
    S.thinking = false;
  }

  // "Adjust after each game": move the opponent's rating towards your level.
  function adjustRatingAfterGame() {
    const s = S.settings;
    if (S.mode !== 'play' || s.level !== 'rating' || !s.adaptiveElo || S.ratedDone || !S.over) return;
    if (s.players !== 'w' && s.players !== 'b') return;
    S.ratedDone = true;
    const you = s.players === 'w' ? '1-0' : '0-1';
    const change = S.over.result === you ? 50 : S.over.result === '1/2-1/2' ? 0 : -50;
    if (!change) return;
    s.elo = Math.max(400, Math.min(ELO_MAX, s.elo + change));
    syncControls();
    save();
    setNote(`${change > 0 ? 'You won' : 'You lost'}: the opponent is now rated ${s.elo}.`, 'good', 6000);
  }

  // ---------------------------------------------------------------- promotion picker

  function choosePromotion(white) {
    return new Promise((resolve) => {
      els.promoChoices.innerHTML = '';
      for (const p of ['q', 'r', 'b', 'n']) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-label', PIECE_NAME[p]);
        btn.appendChild(makePieceEl(white ? p.toUpperCase() : p));
        btn.addEventListener('click', () => { els.promo.hidden = true; resolve(p); });
        els.promoChoices.appendChild(btn);
      }
      els.promo.hidden = false;
      els.promoChoices.firstChild.focus();
      els.promo.onkeydown = (e) => { if (e.key === 'Escape') { els.promo.hidden = true; resolve(null); } };
    });
  }

  async function tryMove(from, to, instant) {
    const candidates = S.pos.legalMoves().filter((m) => Core.moveFrom(m) === from && Core.moveTo(m) === to);
    if (!candidates.length) { illegal(); deselect(); updateHighlights(); return; }
    let m = candidates[0];
    if (candidates.length > 1) {
      const white = S.pos.side === 0;
      const choice = await choosePromotion(white);
      if (!choice) { deselect(); updateHighlights(); return; }
      m = candidates.find((c) => ' kqbnr'[Core.movePromo(c)] === choice) || candidates[0];
    }
    playMove(m, { instant });
  }

  // ---------------------------------------------------------------- pointer input (click or drag)

  let drag = null;

  function squareFromTarget(t) {
    if (!t || !t.closest) return -1;
    const piece = t.closest('.piece');
    if (piece && piece.dataset.sq !== undefined && els.pieces.contains(piece)) return +piece.dataset.sq;
    const sq = t.closest('.sq');
    return sq ? +sq.dataset.sq : -1;
  }

  function squareAtPoint(x, y) {
    for (const t of document.elementsFromPoint(x, y)) {
      if (t.closest('.ghost')) continue;
      const sq = squareFromTarget(t);
      if (sq >= 0) return sq;
    }
    return -1;
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const sq = squareFromTarget(e.target);
    if (sq < 0) return;
    if (!humanCanMove()) {
      if (S.thinking) setNote('The computer is thinking…', '', 1500);
      return;
    }
    e.preventDefault();
    const ch = S.pos.pieceAt(sqFile(sq), sqRank(sq));
    const own = ch && (isWhitePiece(ch) ? 0 : 1) === S.pos.side;
    if (S.selected >= 0 && sq !== S.selected && S.targets.some((m) => Core.moveTo(m) === sq)) {
      tryMove(S.selected, sq, false);
      return;
    }
    if (own) {
      const toggle = S.selected === sq;
      select(sq);
      drag = { sq, x: e.clientX, y: e.clientY, active: false, toggle, id: e.pointerId };
      try { els.field.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      return;
    }
    if (S.selected >= 0) illegal();
    deselect();
    updateHighlights();
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
      drag.active = true;
      const el = pieceEls.get(drag.sq);
      if (!el) { drag = null; return; }
      el.classList.add('dragging');
      const size = squareEl(drag.sq).getBoundingClientRect().width;
      const ghost = makePieceEl(el.dataset.piece);
      ghost.className += ' ghost';
      ghost.style.width = ghost.style.height = size + 'px';
      ghost.style.setProperty('--sq', size + 'px');
      document.body.appendChild(ghost);
      drag.ghost = ghost;
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const over = squareAtPoint(e.clientX, e.clientY);
    for (const d of els.grid.children) d.classList.toggle('drop-hover', +d.dataset.sq === over && over !== drag.sq);
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    for (const c of els.grid.children) c.classList.remove('drop-hover');
    if (!d.active) {
      if (d.toggle) { deselect(); updateHighlights(); }
      return;
    }
    d.ghost.remove();
    const el = pieceEls.get(d.sq);
    const target = squareAtPoint(e.clientX, e.clientY);
    if (target >= 0 && target !== d.sq && S.targets.some((m) => Core.moveTo(m) === target)) {
      tryMove(d.sq, target, true);
      return;
    }
    if (el) el.classList.remove('dragging');
    if (target >= 0 && target !== d.sq) { illegal(); deselect(); updateHighlights(); }
  }

  function onPointerCancel() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    const el = pieceEls.get(drag.sq);
    if (el) el.classList.remove('dragging');
    drag = null;
  }

  // ---------------------------------------------------------------- commands

  function resetGameState(startFen) {
    S.startFen = startFen;
    S.pos = new Position(startFen);
    S.moves = [];
    S.fens = [S.pos.toFEN()];
    S.keys = [S.pos.key()];
    S.over = null;
    S.hint = null;
    S.arrows = [];
    S.marks = new Map();
    S.reviewIdx = null;
    S.curEval = null;
    S.ratedDone = false;
    S.gen++;
    deselect();
  }

  function newGame() {
    stopThinking();
    analyzer.newGame();
    if (S.pendingPlayers) { S.settings.players = S.pendingPlayers; S.pendingPlayers = null; }
    resetGameState(START_FEN);
    S.flipped = S.settings.players === 'b';
    setNote('');
    fullRender();
    save();
    scheduleAnalysis();
    scheduleComputer();
  }

  // Undo moves until only `n` remain.
  function undoTo(n) {
    stopThinking();
    analyzer.stop();
    while (S.moves.length > n) { S.pos.unmake(); S.moves.pop(); S.fens.pop(); S.keys.pop(); }
    for (const mv of S.moves) mv.reviewing = false;
    S.over = null;
    S.hint = null;
    S.reviewIdx = null;
    S.curEval = null;
    S.gen++;
    deselect();
    setNote('');
    fullRender();
    save();
    scheduleAnalysis();
    scheduleComputer();
  }

  function takeBack() {
    if (!S.moves.length || S.settings.players === 'c') return;
    let n = S.moves.length - 1;
    // Against the computer, also undo its reply so it is your move again.
    if (S.settings.players !== '2') {
      const humanSide = S.settings.players === 'w' ? 0 : 1;
      while (n > 0 && moverOf(n) !== humanSide) n--;
    }
    undoTo(n);
  }

  // Coach buttons: go back to before a weak move, optionally showing the better move.
  function retry(i, show) {
    const mv = S.moves[i];
    if (!mv || !mv.review) return;
    const better = mv.review.better;
    undoTo(i);
    if (show && better) {
      S.hint = { from: Core.parseSq(better.uci.slice(0, 2)), to: Core.parseSq(better.uci.slice(2, 4)), best: true };
      drawArrows();
      setNote(`Try ${better.san}: it ${better.why}.`, 'good');
    } else {
      setNote('Your move again. Look for something better!', 'good');
    }
  }

  async function showHint() {
    if (!humanCanMove()) return;
    const fen = S.fens[S.fens.length - 1];
    const movesAtRequest = S.moves.length;
    setNote('Looking for a good move…');
    els.hint.disabled = true;
    const r = await analyzer.analyse(fen);
    updateStatus();
    if (!r || !r.best || movesAtRequest !== S.moves.length) { setNote(''); return; }
    S.hint = { from: Core.parseSq(r.best.slice(0, 2)), to: Core.parseSq(r.best.slice(2, 4)) };
    drawArrows();
    const pos = new Position(fen);
    const m = pos.moveFromUci(r.best);
    const san = m ? pos.san(m) : r.best;
    setNote(`I would suggest ${san}: it ${coach.describeMove(fen, r.best, r.pv, coach.afterScore(r.score || { cp: 0 }))}.`, 'good');
  }

  // ---------------------------------------------------------------- puzzles mode

  // What js/puzzles.js, js/endgames.js and js/theory.js may do with the board.
  function trainerApi(panel) {
    return {
      Core, coach, analyzer, panel,
      load(fen, flipped) { resetGameState(fen); S.flipped = flipped; setNote(''); fullRender(); },
      // Set up a position reached by a sequence of moves, without animation.
      loadLine(fen, ucis, flipped) {
        resetGameState(fen);
        S.flipped = flipped;
        for (const uci of ucis) {
          const m = S.pos.moveFromUci(uci);
          if (!m) break;
          const san = S.pos.san(m);
          S.pos.make(m);
          S.moves.push({ uci, san, by: 'computer', review: null });
          S.fens.push(S.pos.toFEN());
          S.keys.push(S.pos.key());
        }
        S.over = S.pos.outcome();
        setNote('');
        fullRender();
      },
      // Several arrows at once: [{ uci, kind: 'best' | 'alt' | 'book' | 'hint' | 'threat' }].
      arrows(list) {
        S.arrows = (list || []).map((a) => ({ from: Core.parseSq(a.uci.slice(0, 2)), to: Core.parseSq(a.uci.slice(2, 4)), kind: a.kind }));
        drawArrows();
      },
      // Rings on squares: [{ sq, kind: 'danger' | 'target' | 'focus' }].
      marks(list) {
        S.marks = new Map((list || []).map((m) => [m.sq, m.kind]));
        updateHighlights();
      },
      // A move from Stockfish at about `elo` (the built-in engine when Stockfish is unavailable).
      async engineMove(fen, elo) {
        let ok = true;
        try { await opponent.ready; } catch (e) { ok = false; }
        if (ok) {
          const r = await opponent.move(fen, elo);
          if (r && r.best) {
            if (Math.random() < opponent.randomShare(elo)) {
              const pos = new Position(fen);
              const legal = pos.legalMoves();
              return pos.moveToUci(legal[Math.floor(Math.random() * legal.length)]);
            }
            return r.best;
          }
        }
        const r = await analyzer.analyse(fen, { depth: elo < 1200 ? 3 : elo < 1800 ? 6 : 10, movetime: 1500 });
        return r && r.best;
      },
      play(uci) { const m = S.pos.moveFromUci(uci); if (m) playMove(m, { computer: true, keepNote: true }); },
      undoLast() {
        if (!S.moves.length) return;
        S.pos.unmake(); S.moves.pop(); S.fens.pop(); S.keys.pop();
        S.over = null; S.hint = null; deselect();
        fullRender();
      },
      status(main, note, kind) { S.puzzleStatus = { main }; updateStatus(); if (note !== undefined) setNote(note, kind); },
      arrow(uci, kind) {
        S.hint = uci ? { from: Core.parseSq(uci.slice(0, 2)), to: Core.parseSq(uci.slice(2, 4)), best: kind === 'best' } : null;
        drawArrows();
      },
      select(sq) { select(sq); },
      side() { return S.pos.side; },
      fens() { return S.fens; },
      showEval(r) { S.curEval = r; document.body.classList.toggle('puzzle-done', !!r); renderEvalBar(); },
      setMode(m, opts) { setMode(m, opts); },
      refresh() { updateMovable(); },
    };
  }
  trainers.puzzles = window.MyChessPuzzles.create(trainerApi(els.puzzlePanel));
  trainers.endgames = window.MyChessEndgames.create(trainerApi(els.endgamePanel));
  trainers.theory = window.MyChessTheory.create(trainerApi(els.theoryPanel));
  trainers.strategy = window.MyChessStrategy.create(trainerApi(els.strategyPanel));

  const GAME_FIELDS = ['startFen', 'moves', 'fens', 'keys', 'pos', 'flipped', 'over', 'curEval'];

  // opts is handed to the trainer's enter(), e.g. { view: 'learn', lineName } for Theory.
  function setMode(mode, opts) {
    if (mode === S.mode) return;
    if (S.mode === 'play') {
      // Park the game in progress.
      stopThinking();
      S.stash = {};
      for (const k of GAME_FIELDS) S.stash[k] = S[k];
    } else {
      trainer().exit();
    }
    analyzer.stop();
    opponent.stop();
    S.hint = null;
    S.arrows = [];
    S.marks = new Map();
    deselect();
    document.body.classList.remove('puzzle-done');
    S.mode = mode;
    if (mode === 'play') {
      for (const k of GAME_FIELDS) S[k] = S.stash[k];
      S.stash = null;
      S.puzzleStatus = null;
      S.gen++;
      setNote('');
      fullRender();
      scheduleAnalysis();
      scheduleComputer();
    } else {
      trainer().enter(opts);
    }
    S.settings.mode = mode;
    document.body.classList.toggle('mode-puzzles', mode === 'puzzles');
    document.body.classList.toggle('mode-endgames', mode === 'endgames');
    document.body.classList.toggle('mode-theory', mode === 'theory');
    document.body.classList.toggle('mode-strategy', mode === 'strategy');
    // Middlegame lessons live under the Theory tab.
    const tab = mode === 'strategy' ? 'theory' : mode;
    for (const b of els.modeTabs.children) b.setAttribute('aria-checked', String(b.dataset.value === tab));
    save();
  }

  // ---------------------------------------------------------------- wiring

  function bind() {
    els.modeTabs.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setMode(b.dataset.value);
    });
    els.field.addEventListener('pointerdown', onPointerDown);
    els.field.addEventListener('pointermove', onPointerMove);
    els.field.addEventListener('pointerup', onPointerUp);
    els.field.addEventListener('pointercancel', onPointerCancel);
    els.field.addEventListener('lostpointercapture', (e) => { if (drag && drag.active && e.pointerId === drag.id) onPointerUp(e); });

    els.newGame.addEventListener('click', newGame);
    els.takeBack.addEventListener('click', takeBack);
    els.hint.addEventListener('click', showHint);
    els.rotate.addEventListener('click', () => { S.flipped = !S.flipped; layoutSquares(); renderPieces(); updateHighlights(); renderEvalBar(); save(); });

    els.log.addEventListener('click', (e) => {
      const b = e.target.closest('button.mv');
      if (!b) return;
      const i = +b.dataset.idx;
      S.reviewIdx = i === S.moves.length - 1 ? null : i;
      if (S.moves[i] && !S.moves[i].review) reviewMove(i);
      renderLog();
      renderCoach();
    });
    els.review.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.retry !== undefined) retry(+b.dataset.retry, false);
      if (b.dataset.show !== undefined) retry(+b.dataset.show, true);
    });

    els.players.addEventListener('change', () => {
      const v = els.players.value;
      if (!S.moves.length || S.over) { S.settings.players = v; S.pendingPlayers = null; newGame(); return; }
      S.pendingPlayers = v === S.settings.players ? null : v;
      setNote(S.pendingPlayers ? 'Players change when you start a New Game' : '', '', 3000);
    });
    els.level.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      S.settings.level = b.dataset.value; // applies to the computer's next move, like the Mac's live slider
      syncControls(); save();
    });
    els.eloRange.addEventListener('input', () => { S.settings.elo = +els.eloRange.value; els.eloValue.textContent = S.settings.elo; els.levelHint.textContent = levelText(); });
    els.eloRange.addEventListener('change', () => { S.settings.elo = +els.eloRange.value; syncControls(); save(); });
    els.eloAdaptive.addEventListener('change', () => { S.settings.adaptiveElo = els.eloAdaptive.checked; save(); });
    els.eloMine.addEventListener('click', () => {
      let rating = null;
      try { rating = JSON.parse(localStorage.getItem('mychess.puzzles.v1') || '{}').rating; } catch (e) { rating = null; }
      if (!rating) { setNote('Solve a few puzzles first to get a puzzle rating.', '', 4000); return; }
      S.settings.elo = Math.max(400, Math.min(ELO_MAX, Math.round(rating / 10) * 10));
      syncControls(); save();
      setNote(`Opponent set to your puzzle rating, ${S.settings.elo}.`, 'good', 4000);
    });
    els.boardStyle.addEventListener('change', () => {
      // Pieces follow the board until you pick a piece set of your own.
      if (!S.settings.pieceStyle || S.settings.pieceStyle === S.settings.style) S.settings.pieceStyle = els.boardStyle.value;
      S.settings.style = els.boardStyle.value;
      applyStyle(); syncControls(); save();
    });
    els.pieceStyle.addEventListener('change', () => { S.settings.pieceStyle = els.pieceStyle.value; applyStyle(); syncControls(); save(); });
    els.pieces3d.addEventListener('change', () => { S.settings.pieces3d = els.pieces3d.checked; applySprites(); save(); });
    els.view3d.addEventListener('change', () => { S.settings.view3d = els.view3d.checked; syncControls(); save(); });
    els.showLegal.addEventListener('change', () => { S.settings.showLegal = els.showLegal.checked; syncControls(); save(); });
    els.speak.addEventListener('change', () => { S.settings.speak = els.speak.checked; save(); });
    els.textSize.addEventListener('change', () => { S.settings.textSize = els.textSize.value; syncControls(); save(); });
    els.coachOn.addEventListener('change', () => { S.settings.coach = els.coachOn.checked; syncControls(); renderLog(); renderCoach(); save(); scheduleAnalysis(); });
    els.evalOn.addEventListener('change', () => { S.settings.evalBar = els.evalOn.checked; syncControls(); save(); scheduleAnalysis(); });

    for (const group of [els.level]) {
      group.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        const btns = [...group.children];
        const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
        const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
        next.click(); next.focus();
      });
    }
  }

  // When served by serve.py, tell it the app is still open (it shuts down once nothing has pinged for a while).
  function keepServerAlive() {
    if (!/^https?:$/.test(location.protocol)) return;
    const ping = () => fetch('__alive', { cache: 'no-store' }).catch(() => {});
    ping();
    setInterval(ping, 30000);
  }

  function init() {
    buildSquares();
    const restored = load();
    applyStyle();
    bind();
    if (!restored) S.flipped = S.settings.players === 'b';
    fullRender();
    keepServerAlive();
    for (const b of els.modeTabs.children) b.setAttribute('aria-checked', String(b.dataset.value === 'play'));
    if (trainers[S.settings.mode]) { setMode(S.settings.mode); return; }
    scheduleAnalysis();
    if (!S.over) scheduleComputer();
  }

  init();
})();
