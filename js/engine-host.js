/*
 * Runs MyChess's own engine (js/core.js) in a background Web Worker, the way
 * the Mac's Chess runs Sjeng as a separate process. The worker is built from
 * the source of MyChessCore so it also works when the page is opened as a file.
 */
(function () {
  'use strict';

  function EngineHost() {
    this.worker = null;
    this.nextId = 1;
    this.pending = new Map();
    this.core = MyChessCore();
    this.spawn();
  }

  EngineHost.prototype.spawn = function () {
    try {
      const src = MyChessCore.toString() +
        '\nconst Core = MyChessCore();\nself.onmessage = function (e) { self.postMessage(Core.handleSearch(e.data)); };\n';
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (e) => {
        const p = this.pending.get(e.data.id);
        if (p) { this.pending.delete(e.data.id); p.resolve(e.data); }
      };
      w.onerror = () => {
        // Workers unavailable: answer anything outstanding on the page instead.
        this.worker = null;
        for (const [, p] of this.pending) p.resolve(this.core.handleSearch(p.req));
        this.pending.clear();
      };
      this.worker = w;
    } catch (err) {
      this.worker = null;
    }
  };

  // req: { fen, moves: [uci], depth, timeMs, randomMargin, useBook }
  EngineHost.prototype.search = function (req) {
    req.id = this.nextId++;
    if (!this.worker) {
      return new Promise((resolve) => setTimeout(() => resolve(this.core.handleSearch(req)), 30));
    }
    return new Promise((resolve) => {
      this.pending.set(req.id, { resolve, req });
      this.worker.postMessage(req);
    });
  };

  // Like the Mac sending "?" to Sjeng on take-back: stop thinking right away.
  EngineHost.prototype.cancel = function () {
    if (!this.pending.size) return;
    if (this.worker) this.worker.terminate();
    for (const [, p] of this.pending) p.resolve(null);
    this.pending.clear();
    this.spawn();
  };

  window.MyChessEngineHost = EngineHost;
})();
