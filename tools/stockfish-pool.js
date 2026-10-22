// A small pool of Stockfish 19 processes (the WebAssembly build in engine/, run by
// Node) for the audit tools. analyse(fen, depth) resolves to
// { score, best, pv, depth }, scored for the side to move, and caches by position.
const path = require('path');
const { spawn } = require('child_process');

const ENGINE = path.join(__dirname, '..', 'engine', 'stockfish-19-lite-single.js');
if (!global.window) global.window = global;
if (!global.self) global.self = global;
if (!window.MyChessAnalyzer) require('../js/analyzer.js');
const { parseInfo } = window.MyChessAnalyzer;

function startStockfish() {
  const proc = spawn(process.execPath, [ENGINE]);
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
  return {
    async init() { send('uci'); await waitFor('uciok'); send('setoption name Hash value 32'); send('isready'); await waitFor('readyok'); },
    async analyse(fen, depth, multipv) {
      const n = multipv || 1;
      if (n !== this.multipv) { send(`setoption name MultiPV value ${n}`); this.multipv = n; }
      let last = null;
      const lines = [];
      const l = (line) => {
        if (!line.startsWith('info ') || !line.includes(' score ')) return;
        const p = parseInfo(line);
        if (p.bound) return;
        if (!p.multipv || p.multipv === 1) last = p;
        if (n > 1 && p.multipv) lines[p.multipv - 1] = p;
      };
      listeners.push(l);
      send(`position fen ${fen}`);
      send(`go depth ${depth}`);
      const best = (await waitFor('bestmove')).split(' ')[1];
      listeners.splice(listeners.indexOf(l), 1);
      const res = { score: last ? last.score : { cp: 0 }, best: best === '(none)' ? null : best, pv: last && last.pv ? last.pv : [], depth: last ? last.depth : 0 };
      if (n > 1) res.lines = lines.filter((x) => x && x.pv && x.pv.length).map((x) => ({ score: x.score, best: x.pv[0], pv: x.pv }));
      return res;
    },
    quit() { send('quit'); proc.kill(); },
  };
}

async function makePool(n, Core) {
  const engines = await Promise.all(Array.from({ length: n }, async () => { const e = startStockfish(); await e.init(); return e; }));
  const cache = new Map();
  const queue = [];
  const idle = engines.slice();
  function pump() {
    while (idle.length && queue.length) {
      const e = idle.pop();
      const job = queue.shift();
      e.analyse(job.fen, job.depth, job.multipv).then((r) => { job.resolve(r); idle.push(e); pump(); });
    }
  }
  return {
    // Positions with no legal moves are scored directly.
    analyse(fen, depth, multipv) {
      const key = fen.split(' ').slice(0, 4).join(' ') + '|' + depth + '|' + (multipv || 1);
      if (cache.has(key)) return cache.get(key);
      const pos = new Core.Position(fen);
      let p;
      if (!pos.legalMoves().length) p = Promise.resolve({ score: pos.inCheck() ? { mate: 0 } : { cp: 0 }, best: null, pv: [], depth, lines: [] });
      else p = new Promise((resolve) => { queue.push({ fen, depth, multipv, resolve }); pump(); });
      cache.set(key, p);
      return p;
    },
    quit() { for (const e of engines) e.quit(); },
  };
}

module.exports = { makePool, startStockfish };
