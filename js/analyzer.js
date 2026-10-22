/*
 * Position analysis for the coach.
 *
 * Prefers Stockfish 19 Lite (WebAssembly, in engine/) talking UCI in a Worker.
 * When the page is served with cross-origin isolation (serve.py does this) the
 * multi-threaded build is used; otherwise the single-threaded one. If Stockfish
 * cannot start (for example when index.html is opened straight from disk), the
 * coach falls back to MyChess's own engine so it still works, just weaker.
 *
 * analyse(fen) resolves to { score: {cp} | {mate}, best: uci|null, pv: [uci], depth }
 * with the score from the point of view of the side to move. With { multipv: n }
 * it also returns `lines`: the n best moves, each { score, best, pv, depth }.
 */
(function () {
  'use strict';

  const SF_DEPTH = 18, SF_MOVETIME = 2000;
  const BUILTIN_DEPTH = 8, BUILTIN_MOVETIME = 1500;

  function parseInfo(line) {
    const t = line.split(' ');
    const out = {};
    for (let i = 1; i < t.length; i++) {
      const k = t[i];
      if (k === 'depth') out.depth = +t[++i];
      else if (k === 'multipv') out.multipv = +t[++i];
      else if (k === 'score') {
        const kind = t[++i], v = +t[++i];
        out.score = kind === 'mate' ? { mate: v } : { cp: v };
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') { out.bound = true; i++; }
      } else if (k === 'pv') { out.pv = t.slice(i + 1); break; }
    }
    return out;
  }

  // ---------------------------------------------------------------- Stockfish over UCI

  function Stockfish(script, threads) {
    this.script = script;
    this.threads = threads;
    this.worker = null;
    this.queue = [];
    this.current = null;
    this.waiters = [];
    this.multipv = 1;
  }

  Stockfish.prototype.start = function (timeoutMs) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (why) => { if (!done) { done = true; try { this.worker && this.worker.terminate(); } catch (e) { /* ignore */ } reject(new Error(why)); } };
      const timer = setTimeout(() => fail('Stockfish did not start in time'), timeoutMs);
      try {
        this.worker = new Worker(this.script);
      } catch (err) { clearTimeout(timer); fail(String(err)); return; }
      this.worker.onerror = (e) => { clearTimeout(timer); fail(e.message || 'Stockfish worker error'); };
      this.worker.onmessage = (e) => this.onLine(String(e.data));
      this.expect('uciok').then(() => {
        if (this.threads > 1) this.send(`setoption name Threads value ${this.threads}`);
        this.send('setoption name Hash value 32');
        this.send('isready');
        return this.expect('readyok');
      }).then(() => {
        clearTimeout(timer);
        if (!done) { done = true; resolve(this); }
      });
      this.send('uci');
    });
  };

  Stockfish.prototype.send = function (cmd) { this.worker.postMessage(cmd); };

  Stockfish.prototype.expect = function (word) {
    return new Promise((resolve) => this.waiters.push({ word, resolve }));
  };

  Stockfish.prototype.onLine = function (line) {
    for (let i = 0; i < this.waiters.length; i++) {
      if (line.startsWith(this.waiters[i].word)) { this.waiters.splice(i, 1)[0].resolve(line); return; }
    }
    const job = this.current;
    if (!job) return;
    if (line.startsWith('info ') && line.includes(' score ')) {
      const info = parseInfo(line);
      if (!info.bound && info.score) {
        const k = info.multipv || 1;
        if (k === 1) job.last = info;
        if (job.multipv > 1) job.lines[k - 1] = info;
      }
    } else if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1];
      this.current = null;
      if (job.cancelled) job.resolve(null);
      else {
        const info = job.last || {};
        const res = {
          score: info.score || { cp: 0 },
          best: best && best !== '(none)' ? best : null,
          pv: info.pv || (best && best !== '(none)' ? [best] : []),
          depth: info.depth || 0,
        };
        if (job.multipv > 1) {
          // Lines can come from two depths when time runs out; keep one per first move.
          const seen = new Set();
          res.lines = job.lines.filter((l) => l && l.pv && l.pv.length && !seen.has(l.pv[0]) && seen.add(l.pv[0]))
            .map((l) => ({ score: l.score, best: l.pv[0], pv: l.pv, depth: l.depth || 0 }));
        }
        job.resolve(res);
      }
      this.next();
    }
  };

  Stockfish.prototype.analyse = function (fen, depth, movetime, multipv) {
    return new Promise((resolve) => {
      this.queue.push({ fen, depth: depth || SF_DEPTH, movetime: movetime || SF_MOVETIME, multipv: multipv || 1, lines: [], resolve, last: null, cancelled: false });
      if (!this.current) this.next();
    });
  };

  Stockfish.prototype.next = function () {
    const job = this.queue.shift();
    if (!job) return;
    this.current = job;
    if (job.multipv !== this.multipv) { this.send(`setoption name MultiPV value ${job.multipv}`); this.multipv = job.multipv; }
    this.send(`position fen ${job.fen}`);
    this.send(`go depth ${job.depth} movetime ${job.movetime}`);
  };

  Stockfish.prototype.stop = function () {
    for (const job of this.queue) job.resolve(null);
    this.queue = [];
    if (this.current) { this.current.cancelled = true; this.send('stop'); }
  };

  Stockfish.prototype.newGame = function () {
    this.stop();
    this.send('ucinewgame');
  };

  // ---------------------------------------------------------------- built-in fallback

  function BuiltIn(Core) {
    this.Core = Core;
    this.host = new window.MyChessEngineHost();
    this.generation = 0;
  }

  BuiltIn.prototype.analyse = function (fen, depth, movetime) {
    const gen = this.generation;
    const pos = new this.Core.Position(fen);
    const outcome = pos.legalMoves().length ? null : (pos.inCheck() ? 'mate' : 'stalemate');
    if (outcome) return Promise.resolve({ score: outcome === 'mate' ? { mate: 0 } : { cp: 0 }, best: null, pv: [], depth: 0 });
    const d = depth ? Math.min(depth, BUILTIN_DEPTH + 4) : BUILTIN_DEPTH;
    return this.host.search({ fen, moves: [], depth: d, timeMs: movetime || BUILTIN_MOVETIME, randomMargin: 0, useBook: false }).then((r) => {
      if (!r || gen !== this.generation) return null;
      const MATE = 30000;
      let score;
      if (Math.abs(r.score) > MATE - 200) {
        const plies = MATE - Math.abs(r.score);
        score = { mate: Math.sign(r.score) * Math.max(1, Math.ceil(plies / 2)) };
      } else score = { cp: r.score };
      const pv = r.pv && r.pv.length ? r.pv : [r.move];
      return { score, best: r.move, pv, depth: r.depth, lines: [{ score, best: r.move, pv, depth: r.depth }] };
    });
  };
  BuiltIn.prototype.stop = function () { this.generation++; this.host.cancel(); };
  BuiltIn.prototype.newGame = function () { this.stop(); };

  // ---------------------------------------------------------------- public analyzer

  function createAnalyzer(Core, onStatus) {
    const a = {
      name: 'Starting engine…',
      kind: 'loading',
      impl: null,
      cache: new Map(),
      ready: null,
    };
    const status = (kind, name) => { a.kind = kind; a.name = name; if (onStatus) onStatus(kind, name); };

    a.ready = (async () => {
      const canTry = location.protocol === 'http:' || location.protocol === 'https:';
      if (canTry) {
        const options = [];
        if (self.crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined') {
          const cores = navigator.hardwareConcurrency || 2;
          options.push({ script: 'engine/stockfish-19-lite.js', threads: Math.max(1, Math.min(4, cores - 1)) });
        }
        options.push({ script: 'engine/stockfish-19-lite-single.js', threads: 1 });
        for (const o of options) {
          try {
            a.impl = await new Stockfish(o.script, o.threads).start(12000);
            status('stockfish', o.threads > 1 ? `Stockfish 19 (${o.threads} threads)` : 'Stockfish 19');
            return;
          } catch (err) {
            console.warn('Stockfish could not start with', o.script, err);
          }
        }
      }
      a.impl = new BuiltIn(Core);
      status('builtin', canTry ? 'Built-in engine (Stockfish failed to load)' : 'Built-in engine (start with the launcher for Stockfish)');
    })();

    // Cached per position (and depth); a cancelled request is dropped from the cache.
    // opts: { depth, movetime, multipv } — endgame drills search deeper than the default,
    // and the theory coach asks for its three best moves.
    a.analyse = function (fen, opts) {
      const depth = opts && opts.depth, movetime = opts && opts.movetime, multipv = (opts && opts.multipv) || 1;
      const key = (depth ? `${fen}|${depth}` : fen) + (multipv > 1 ? `|m${multipv}` : '');
      if (a.cache.has(key)) return a.cache.get(key);
      const p = a.ready.then(() => a.impl.analyse(fen, depth, movetime, multipv)).then((r) => {
        if (!r) a.cache.delete(key);
        return r;
      });
      a.cache.set(key, p);
      return p;
    };
    a.peek = function (fen) { return a.cache.get(fen); };
    a.stop = function () { if (a.impl) a.impl.stop(); };
    a.newGame = function () { a.cache.clear(); if (a.impl) a.impl.newGame(); };
    return a;
  }

  // ---------------------------------------------------------------- Stockfish as a rated opponent

  // A second, separate Stockfish (single thread) that plays at a chosen Elo, so the
  // coach's analysis engine keeps running at full strength.
  //  - 1320 to 3190: Stockfish's own calibrated UCI_LimitStrength / UCI_Elo.
  //  - Below 1320 (Stockfish's floor): Skill Level 0 and a very shallow search; the
  //    app adds random moves on top. Those ratings are rough estimates.
  const ELO_FLOOR = 1320, ELO_MAX = 3190;

  function createOpponent() {
    const o = { sf: null, rating: null };
    o.ready = (async () => {
      if (!/^https?:$/.test(location.protocol)) throw new Error('Stockfish needs the local server');
      o.sf = await new Stockfish('engine/stockfish-19-lite-single.js', 1).start(12000);
      o.sf.send('setoption name Hash value 16');
    })();
    o.ready.catch(() => {});
    function configure(rating) {
      if (o.rating === rating) return;
      o.rating = rating;
      if (rating >= ELO_FLOOR) {
        o.sf.send('setoption name Skill Level value 20');
        o.sf.send('setoption name UCI_LimitStrength value true');
        o.sf.send(`setoption name UCI_Elo value ${Math.min(ELO_MAX, Math.round(rating))}`);
      } else {
        o.sf.send('setoption name UCI_LimitStrength value false');
        o.sf.send('setoption name Skill Level value 0');
      }
    }
    // Resolves to { best, score, pv, depth } or null if cancelled.
    o.move = async (fen, rating) => {
      await o.ready;
      configure(rating);
      if (rating >= ELO_FLOOR) return o.sf.analyse(fen, 22, 1000);
      const t = Math.max(0, Math.min(1, (rating - 400) / (ELO_FLOOR - 400)));
      return o.sf.analyse(fen, 1 + Math.round(t * 4), 400);
    };
    // Share of deliberately random moves below Stockfish's floor (0 at 1320 and above).
    o.randomShare = (rating) => (rating >= ELO_FLOOR ? 0 : 0.3 * (1 - Math.max(0, (rating - 400) / (ELO_FLOOR - 400))));
    o.stop = () => { if (o.sf) o.sf.stop(); };
    return o;
  }

  window.MyChessAnalyzer = { create: createAnalyzer, createOpponent, parseInfo, ELO_FLOOR, ELO_MAX };
})();
