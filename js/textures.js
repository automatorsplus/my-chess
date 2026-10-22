/*
 * Procedural board and piece textures.
 *
 * Apple's Chess ships photographic textures (BoardWood.jpg, WhitePieceWood.jpg,
 * ...). Rather than copy those, this file paints look-alikes on a canvas, using
 * colours sampled from the originals as the starting point.
 */
(function () {
  'use strict';

  // Small deterministic value-noise generator.
  function makeNoise(seed) {
    const perm = new Uint8Array(512);
    let s = seed >>> 0 || 1;
    const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const vals = new Float32Array(256);
    for (let i = 0; i < 256; i++) vals[i] = rand();
    const fade = (t) => t * t * (3 - 2 * t);
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const a = vals[perm[(xi & 255) + perm[yi & 255]]];
      const b = vals[perm[((xi + 1) & 255) + perm[yi & 255]]];
      const c = vals[perm[(xi & 255) + perm[(yi + 1) & 255]]];
      const d = vals[perm[((xi + 1) & 255) + perm[(yi + 1) & 255]]];
      const u = fade(xf), v = fade(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    return function fbm(x, y, octaves) {
      let sum = 0, amp = 0.5, freq = 1, norm = 0;
      for (let o = 0; o < (octaves || 4); o++) {
        sum += noise(x * freq, y * freq) * amp;
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    };
  }

  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => a + (b - a) * t;

  function paint(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rgb = fn(x, y);
        const i = (y * w + x) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/jpeg', 0.9);
  }

  // Wood: growth rings bent by noise plus fine fibre streaks running along the grain.
  function wood(opts) {
    const { w, h, light, dark, vertical, rings = 7, streak = 0.45, seed = 1 } = opts;
    const L = hex(light), D = hex(dark), fbm = makeNoise(seed);
    return paint(w, h, (x, y) => {
      const along = (vertical ? y : x) / 256, across = (vertical ? x : y) / 256;
      const warp = fbm(along * 1.6, across * 3.2, 4);
      const ring = 0.5 + 0.5 * Math.sin((across * rings + warp * 2.4) * Math.PI * 2);
      const fibre = fbm(along * 2.2, across * 90, 3);
      const fleck = fbm(along * 24, across * 160, 2);
      let t = ring * 0.55 + fibre * streak + fleck * 0.12;
      t = Math.min(1, Math.max(0, (t - 0.22) * 1.35));
      return [mix(D[0], L[0], t), mix(D[1], L[1], t), mix(D[2], L[2], t)];
    });
  }

  // Marble: turbulent veins over a soft cloudy base.
  function marble(opts) {
    const { w, h, base, vein, seed = 1, sharp = 6 } = opts;
    const B = hex(base), V = hex(vein), fbm = makeNoise(seed);
    return paint(w, h, (x, y) => {
      const u = x / 256, v = y / 256;
      const turb = fbm(u * 3, v * 3, 5);
      const veinT = Math.pow(1 - Math.abs(Math.sin((u * 2.2 + v * 1.3 + turb * 3.2) * Math.PI)), sharp);
      const cloud = fbm(u * 6 + 10, v * 6, 4) * 0.25;
      const t = Math.min(1, veinT * 0.85 + cloud);
      return [mix(B[0], V[0], t), mix(B[1], V[1], t), mix(B[2], V[2], t)];
    });
  }

  // Brushed metal: long horizontal streaks.
  function metal(opts) {
    const { w, h, light, dark, vertical, seed = 1 } = opts;
    const L = hex(light), D = hex(dark), fbm = makeNoise(seed);
    return paint(w, h, (px, py) => {
      const x = vertical ? py : px, y = vertical ? px : py;
      const t = Math.min(1, Math.max(0, fbm(x / 400, y / 1.6, 3) * 0.75 + fbm(x / 60, y / 40, 2) * 0.35));
      return [mix(D[0], L[0], t), mix(D[1], L[1], t), mix(D[2], L[2], t)];
    });
  }

  // Nearly flat colour with a faint speckle: vinyl tournament boards and plastic pieces.
  function plain(opts) {
    const { w, h, color, amount = 10, seed = 1 } = opts;
    const C = hex(color), fbm = makeNoise(seed);
    return paint(w, h, (x, y) => {
      const n = (fbm(x / 6, y / 6, 2) - 0.5) * amount;
      return [C[0] + n, C[1] + n, C[2] + n];
    });
  }

  // Each style provides: light/dark squares, frame (horizontal + vertical grain), white/black pieces.
  const STYLES = {
    walnut: () => ({
      light: wood({ w: 256, h: 256, light: '#d2b38a', dark: '#a8865c', vertical: true, rings: 6, seed: 71 }),
      dark: wood({ w: 256, h: 256, light: '#5e3b1f', dark: '#26140a', vertical: false, rings: 7, seed: 73 }),
      frameH: wood({ w: 1024, h: 128, light: '#5a341a', dark: '#1d0f06', vertical: false, rings: 10, seed: 79 }),
      frameV: wood({ w: 128, h: 1024, light: '#5a341a', dark: '#1d0f06', vertical: true, rings: 10, seed: 83 }),
      white: wood({ w: 192, h: 192, light: '#efdcbc', dark: '#c4a37c', vertical: true, rings: 4, streak: 0.3, seed: 89 }),
      black: wood({ w: 192, h: 192, light: '#45332a', dark: '#16100c', vertical: true, rings: 5, streak: 0.4, seed: 97 }),
    }),
    tournament: () => ({
      light: plain({ w: 256, h: 256, color: '#ebecd0', amount: 8, seed: 3 }),
      dark: plain({ w: 256, h: 256, color: '#739552', amount: 10, seed: 5 }),
      frameH: plain({ w: 1024, h: 128, color: '#2d3a26', amount: 8, seed: 7 }),
      frameV: plain({ w: 128, h: 1024, color: '#2d3a26', amount: 8, seed: 9 }),
      white: plain({ w: 192, h: 192, color: '#f4f1e8', amount: 6, seed: 11 }),
      black: plain({ w: 192, h: 192, color: '#2a2a2c', amount: 6, seed: 13 }),
    }),
    ebony: () => ({
      light: wood({ w: 256, h: 256, light: '#f3ead6', dark: '#d9cbb0', vertical: true, rings: 3, streak: 0.2, seed: 101 }),
      dark: wood({ w: 256, h: 256, light: '#3b322c', dark: '#100d0b', vertical: false, rings: 8, streak: 0.5, seed: 103 }),
      frameH: wood({ w: 1024, h: 128, light: '#2e2620', dark: '#0b0908', vertical: false, rings: 12, seed: 107 }),
      frameV: wood({ w: 128, h: 1024, light: '#2e2620', dark: '#0b0908', vertical: true, rings: 12, seed: 109 }),
      white: wood({ w: 192, h: 192, light: '#fbf4e4', dark: '#e3d5b8', vertical: true, rings: 3, streak: 0.15, seed: 113 }),
      black: wood({ w: 192, h: 192, light: '#3a312b', dark: '#0d0a08', vertical: true, rings: 6, streak: 0.45, seed: 127 }),
    }),
    wood: () => ({
      light: wood({ w: 256, h: 256, light: '#d9c19b', dark: '#a98a62', vertical: true, rings: 5, seed: 11 }),
      dark: wood({ w: 256, h: 256, light: '#7a4a22', dark: '#3f210b', vertical: false, rings: 6, seed: 23 }),
      frameH: wood({ w: 1024, h: 128, light: '#9a5a26', dark: '#5a2f0e', vertical: false, rings: 9, seed: 37 }),
      frameV: wood({ w: 128, h: 1024, light: '#9a5a26', dark: '#5a2f0e', vertical: true, rings: 9, seed: 41 }),
      white: wood({ w: 192, h: 192, light: '#e6d2b4', dark: '#b8987a', vertical: true, rings: 4, streak: 0.35, seed: 53 }),
      black: wood({ w: 192, h: 192, light: '#55402f', dark: '#1e140d', vertical: true, rings: 5, streak: 0.4, seed: 67 }),
    }),
    marble: () => ({
      light: marble({ w: 256, h: 256, base: '#f1efe9', vein: '#9c9a96', seed: 5 }),
      dark: marble({ w: 256, h: 256, base: '#4b5551', vein: '#a9b3ad', seed: 9, sharp: 9 }),
      frameH: marble({ w: 1024, h: 128, base: '#8e8b86', vein: '#e6e3dd', seed: 13 }),
      frameV: marble({ w: 128, h: 1024, base: '#8e8b86', vein: '#e6e3dd', seed: 17 }),
      white: marble({ w: 192, h: 192, base: '#f6f4ef', vein: '#b7b3ac', seed: 19 }),
      black: marble({ w: 192, h: 192, base: '#2a2d2c', vein: '#7d8581', seed: 29, sharp: 10 }),
    }),
    metal: () => ({
      light: metal({ w: 256, h: 256, light: '#e3e5e8', dark: '#a7abb1', seed: 3 }),
      dark: metal({ w: 256, h: 256, light: '#7b8088', dark: '#41454c', seed: 7 }),
      frameH: metal({ w: 1024, h: 128, light: '#5f636a', dark: '#2b2d31', seed: 31 }),
      frameV: metal({ w: 128, h: 1024, light: '#5f636a', dark: '#2b2d31', vertical: true, seed: 43 }),
      white: metal({ w: 192, h: 192, light: '#f4f5f7', dark: '#b9bdc3', seed: 47 }),
      black: metal({ w: 192, h: 192, light: '#55585e', dark: '#17181b', seed: 59 }),
    }),
  };

  const cache = {};
  window.MyChessTextures = {
    styles: Object.keys(STYLES),
    get(name) {
      if (!STYLES[name]) name = 'wood';
      if (!cache[name]) cache[name] = STYLES[name]();
      return cache[name];
    },
  };
})();
