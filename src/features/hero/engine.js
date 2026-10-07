/*
 * The hero's scene engine, kept as shipped.
 *
 * Between the two marker comments below is the design's own script, byte for
 * byte: one canvas, one animation loop and the scene named "mind". It came
 * from the homepage boards of the site's design, where the same script sits
 * in the desktop, the tablet and the phone board. It is not tidied,
 * reformatted or typed here, so that a later version of the design can
 * replace it whole and nothing it draws is ours to have changed.
 *
 * Rules for a maintainer:
 *
 *  - Do not edit between the markers. tests/hero-scene.test.mjs holds the
 *    checksum of that block and fails on any change. To take a new version of
 *    the scene, replace the block and the checksum together.
 *  - The only addition is the export on the last line.
 *  - Nothing but scene.ts imports this file. engine.d.ts is the shape scene.ts
 *    is given, and README.md says what the script reads from the page.
 *
 * One lint rule is switched off for this file and no other: the script has a
 * single `catch (err)` that never reads `err`, which the unused-variable rule
 * reports. Renaming the binding would be an edit to the block.
 */
/* eslint-disable @typescript-eslint/no-unused-vars -- shipped script, kept as it came: one catch binding is never read */
/* engine:begin */
/* ==========================================================================
   NAISI hero engine: shared by every round-two hero board.

   One <canvas> behind the hero copy, one requestAnimationFrame loop. The
   board's markup is static; the engine paints the canvas, reads layout from
   the DOM (keep-out zones, the mark, the headline words), follows the
   pointer, and reports the typed headline's state back to the board.
   Scenes plug in with NH.scene(name, factory). Plain ES2017, no imports.
   ========================================================================== */
const NH = (function () {
  'use strict';

  /* ---------------------------------------------------------------- maths */
  const TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function smoother(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function easeOut(t, p) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, p || 3); }
  function easeIn(t, p) { t = clamp(t, 0, 1); return Math.pow(t, p || 3); }
  function easeInOut(t) { t = clamp(t, 0, 1); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  /* frame-rate independent approach: move `cur` toward `target` at `rate` per second */
  function damp(cur, target, rate, dt) { return target + (cur - target) * Math.exp(-rate * dt); }
  /* seeded random (mulberry32) */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* smooth 2-D value noise in [-1, 1] */
  function makeNoise(seed) {
    const r = rng(seed * 7919 + 13);
    const P = new Uint8Array(512), G = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    function v(ix, iy) { return G[P[(P[ix & 255] + iy) & 255]]; }
    return function (x, y) {
      const ix = Math.floor(x), iy = Math.floor(y);
      const fx = x - ix, fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
      const a = v(ix, iy), b = v(ix + 1, iy), c = v(ix, iy + 1), d = v(ix + 1, iy + 1);
      return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
    };
  }
  /* quadratic bezier point, used for the network's curved edges */
  function qpt(ax, ay, cx, cy, bx, by, t, out) {
    const u = 1 - t;
    out = out || {};
    out.x = u * u * ax + 2 * u * t * cx + t * t * bx;
    out.y = u * u * ay + 2 * u * t * cy + t * t * by;
    return out;
  }
  /* cubic bezier point */
  function cpt(ax, ay, b1x, b1y, b2x, b2y, bx, by, t, out) {
    const u = 1 - t;
    out = out || {};
    out.x = u * u * u * ax + 3 * u * u * t * b1x + 3 * u * t * t * b2x + t * t * t * bx;
    out.y = u * u * u * ay + 3 * u * u * t * b1y + 3 * u * t * t * b2y + t * t * t * by;
    return out;
  }

  /* --------------------------------------------------------------- colour */
  function hex(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgba(c, a) {
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(4) + ')';
  }
  /* the site's colours (src/theme/tokens.css, heroFieldUtils.ts) plus the brand's offset cyan */
  const C = {
    ground: [5, 8, 16], ink: [10, 13, 26], indigo: [31, 44, 92], blue: [74, 101, 200],
    accent: [106, 130, 255], pink: [255, 184, 216], cyan: [0, 212, 255], cyanText: [34, 211, 238],
    ice: [92, 243, 255], sky: [77, 142, 255], white: [230, 234, 242], gold: [245, 165, 36], warm: [255, 138, 36]
  };
  /* NAISI_COOL_PINK: four blues and one pink terminal (pink only at the brightest highlights) */
  const COOL_PINK = [C.ink, C.indigo, C.blue, C.accent, C.pink];
  /* the brand's cold ramp toward the offset cyan */
  const COLD_CYAN = [C.ink, C.indigo, C.blue, C.sky, C.ice];
  function sample(stops, t) {
    t = clamp(t, 0, 0.999);
    const segs = stops.length - 1;
    const i = Math.floor(t * segs), f = t * segs - i;
    const k = f * f * (3 - 2 * f);
    return mix(stops[i], stops[i + 1], k);
  }

  /* ---------------------------------------------------------- glow sprites
     Pre-rendered radial falloffs (the site's halo profile), tinted per
     colour, drawn with drawImage: far cheaper than a gradient per call. */
  const SPR = 64;
  const sprites = new Map();
  /* 'soft' is the site's halo profile (centre, 40 % at 0.42 r, clear at r); 'hot' is a tighter core */
  const PROFILES = { soft: [[0, 1], [0.42, 0.38], [1, 0]], hot: [[0, 1], [0.14, 0.62], [0.42, 0.14], [1, 0]] };
  function sprite(c, prof) {
    prof = prof || 'soft';
    const key = prof + ((c[0] | 0) >> 2) + ',' + ((c[1] | 0) >> 2) + ',' + ((c[2] | 0) >> 2);
    let s = sprites.get(key);
    if (s) return s;
    s = document.createElement('canvas');
    s.width = s.height = SPR;
    const g = s.getContext('2d');
    const gr = g.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    const stops = PROFILES[prof] || PROFILES.soft;
    for (let i = 0; i < stops.length; i++) gr.addColorStop(stops[i][0], rgba(c, stops[i][1]));
    g.fillStyle = gr;
    g.fillRect(0, 0, SPR, SPR);
    if (sprites.size > 600) sprites.clear();
    sprites.set(key, s);
    return s;
  }
  function glow(ctx, x, y, r, c, a, prof) {
    if (a < 0.004 || r < 0.4) return;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(sprite(c, prof), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  function dot(ctx, x, y, r, c, a) {
    if (a < 0.004) return;
    ctx.fillStyle = rgba(c, a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  /* ------------------------------------------------------------ the mark
     Large cut, viewBox 6 6 221.07 270.4. HEAD is the closed head + neck
     shape (the notch in the shield): the canvas shows through it. */
  const MARK_VB = [6, 6, 221.07, 270.4];
  const HEAD_D = 'M166 223.65L175.13 187.08C175.61 185.01 176.2 182 178.17 180.79C183.38 177.59 198.03 185.08 199.98 174.24C200.57 170.97 198.85 170.35 198.88 168.27C199.27 167.29 200.29 166.98 200.84 166.13C201.34 165.37 201.71 161.6 201.68 160.6C201.38 159.8 200.56 159.29 200.55 158.38C201.68 155.93 207.06 158.41 207.96 154.54C208.81 150.94 201.4 141.6 200.35 137.34C199.82 135.17 200.98 132.7 200.98 130.48C200.98 124.33 200.07 118.64 196.84 113.28C189.05 100.32 168.75 95.6 154.81 99.5C149.1 101.1 143.67 104.37 139.49 108.55C128.67 119.36 125.44 137.38 132.07 151.25C134.18 155.68 141.63 163.55 142.13 166.67C143.04 172.27 138.93 181.12 136.31 186.01L130.26 197.29A100 100 0 0 0 166 223.65Z';
  const BODY_D = [
    'M46 6H80V34H108V6H142V34H176V6H204V70.13L166 60.63L94 78.63V132A112 112 0 0 0 130 214.27V227.83C114.77 220.57 97.67 214.88 76.65 214.88C65.18 214.88 53.31 216.94 42 222.62V186L56 172V88L46 78ZM68 158H80V110A6 6 0 0 0 68 110Z',
    'M130.26 197.29A100 100 0 0 1 106 132V88L166 73L226 88V132A100 100 0 0 1 166 223.65L175.13 187.08C175.61 185.01 176.2 182 178.17 180.79C183.38 177.59 198.03 185.08 199.98 174.24C200.57 170.97 198.85 170.35 198.88 168.27C199.27 167.29 200.29 166.98 200.84 166.13C201.34 165.37 201.71 161.6 201.68 160.6C201.38 159.8 200.56 159.29 200.55 158.38C201.68 155.93 207.06 158.41 207.96 154.54C208.81 150.94 201.4 141.6 200.35 137.34C199.82 135.17 200.98 132.7 200.98 130.48C200.98 124.33 200.07 118.64 196.84 113.28C189.05 100.32 168.75 95.6 154.81 99.5C149.1 101.1 143.67 104.37 139.49 108.55C128.67 119.36 125.44 137.38 132.07 151.25C134.18 155.68 141.63 163.55 142.13 166.67C143.04 172.27 138.93 181.12 136.31 186.01L130.26 197.29Z',
    'M181.51 254.87C164.21 254.87 151.99 250.8 136.21 242.91C119.41 234.26 100.58 226.88 76.65 226.88C54.25 226.88 30.33 234.77 12 262C33.89 248.51 54 244.18 71.05 244.18C89.12 244.18 103.12 248.77 117.12 256.15C133.15 264.55 146.9 270.4 167.01 270.4C186.35 270.4 208.24 263.02 227.07 238.33C212.06 250.8 196.02 254.87 181.51 254.87Z'
  ];

  /* ------------------------------------------------- the headline timeline
     Mirrors TypedHeadline.tsx: prefix words blur-rise from 0.5 s, 120 ms
     apart; the accent types at 95 ms a character from 1.76 s, underlines,
     holds 2.8 s, un-underlines, deletes at 55 ms, pauses 0.75 s, retypes at
     110 ms, forever. 'once' types it a single time and keeps it. */
  const HL = { T0: 1.76, FIRST: 0.095, LOOP: 0.110, DEL: 0.055, PRE_UL: 0.35, UL: 0.35, HOLD: 2.8, UNUL: 0.28, POST: 0.75 };
  function headlineAt(t, loop, n) {
    if (t < HL.T0) return { typed: 0, caret: false, ul: 'none', phase: 'prefix' };
    let s = t - HL.T0;
    const first = n * HL.FIRST;
    if (s < first) return { typed: Math.min(n, Math.floor(s / HL.FIRST) + 1), caret: true, ul: 'none', phase: 'typing' };
    s -= first;
    if (s < HL.PRE_UL) return { typed: n, caret: true, ul: 'none', phase: 'typed' };
    s -= HL.PRE_UL;
    if (s < HL.UL) return { typed: n, caret: true, ul: 'grow', phase: 'typed' };
    s -= HL.UL;
    if (!loop) return { typed: n, caret: s < 3.5, ul: 'full', phase: 'hold' };
    const period = HL.HOLD + HL.UNUL + n * HL.DEL + HL.POST + n * HL.LOOP + HL.PRE_UL + HL.UL;
    s = s % period;
    if (s < HL.HOLD) return { typed: n, caret: true, ul: 'full', phase: 'hold' };
    s -= HL.HOLD;
    if (s < HL.UNUL) return { typed: n, caret: true, ul: 'shrink', phase: 'hold' };
    s -= HL.UNUL;
    if (s < n * HL.DEL) return { typed: Math.max(0, n - Math.floor(s / HL.DEL) - 1), caret: true, ul: 'none', phase: 'deleting' };
    s -= n * HL.DEL;
    if (s < HL.POST) return { typed: 0, caret: true, ul: 'none', phase: 'empty' };
    s -= HL.POST;
    if (s < n * HL.LOOP) return { typed: Math.min(n, Math.floor(s / HL.LOOP) + 1), caret: true, ul: 'none', phase: 'typing' };
    s -= n * HL.LOOP;
    if (s < HL.PRE_UL) return { typed: n, caret: true, ul: 'none', phase: 'typed' };
    return { typed: n, caret: true, ul: 'grow', phase: 'typed' };
  }

  /* ------------------------------------------------------------- keep-out
     Every element marked data-keepout (the mark, the headline, the pill,
     the header) pushes the field down to `floor` inside it, with a soft
     falloff of `feather` px outside its padded box. Sampled on a grid. */
  function KeepOut() {
    const CELL = 6;
    let gw = 0, gh = 0, grid = null;
    function sdBox(px, py, r) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const hx = r.w / 2 - r.rad, hy = r.h / 2 - r.rad;
      const qx = Math.abs(px - cx) - hx, qy = Math.abs(py - cy) - hy;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0);
      return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r.rad;
    }
    function build(w, h, zones) {
      gw = Math.ceil(w / CELL) + 2; gh = Math.ceil(h / CELL) + 2;
      grid = new Float32Array(gw * gh);
      for (let j = 0; j < gh; j++) {
        const y = (j - 0.5) * CELL;
        for (let i = 0; i < gw; i++) {
          const x = (i - 0.5) * CELL;
          let k = 1;
          for (let z = 0; z < zones.length; z++) {
            const r = zones[z];
            const d = sdBox(x, y, r);
            const v = 1 - r.strength * (1 - smooth(d / r.feather));
            if (v < k) k = v;
          }
          grid[j * gw + i] = k;
        }
      }
    }
    function at(x, y) {
      if (!grid) return 1;
      const fx = x / CELL + 0.5, fy = y / CELL + 0.5;
      let i = Math.floor(fx), j = Math.floor(fy);
      if (i < 0) i = 0; if (j < 0) j = 0;
      if (i > gw - 2) i = gw - 2; if (j > gh - 2) j = gh - 2;
      const tx = clamp(fx - i, 0, 1), ty = clamp(fy - j, 0, 1);
      const a = grid[j * gw + i], b = grid[j * gw + i + 1], c = grid[(j + 1) * gw + i], d = grid[(j + 1) * gw + i + 1];
      return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
    }
    return { build: build, at: at };
  }

  /* layout box of an element relative to the board root, ignoring CSS
     transforms (the entrance animations move things while we measure) */
  function layoutBox(el, root) {
    if (el.offsetParent !== undefined && el.offsetWidth !== undefined) {
      let x = 0, y = 0, n = el;
      while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      if (n === root) return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
    }
    const rr = root.getBoundingClientRect(), er = el.getBoundingClientRect();
    const s = rr.width / (root.offsetWidth || rr.width || 1);
    return { x: (er.left - rr.left) / s, y: (er.top - rr.top) / s, w: er.width / s, h: er.height / s };
  }

  /* ---------------------------------------------------------- the scenes */
  const SCENES = {};
  function scene(name, factory) { SCENES[name] = factory; }

  /* ---------------------------------------------------------- the engine */
  function create(cfg) {
    const root = cfg.root, canvas = cfg.canvas;
    const ctx = canvas.getContext('2d', { alpha: true });
    const factory = SCENES[cfg.scene];
    if (!factory) throw new Error('NH: unknown scene ' + cfg.scene);
    const accent = cfg.accent || 'From Nottingham.';
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    let props = Object.assign({ field: 'continuous', headline: 'loop like the site', intensity: 1, variation: 1 }, cfg.props || {});
    const keep = KeepOut();

    const ptr = {
      x: -1e4, y: -1e4, sx: -1e4, sy: -1e4, vx: 0, vy: 0,
      active: false, down: false, type: 'mouse', presence: 0, idle: 999, taps: []
    };

    const env = {
      form: cfg.form || 'desktop', layout: cfg.layout || {},
      w: 0, h: 0, dpr: 1, portrait: false,
      t: 0, dt: 0, introT: 0, exitT: 0, cycleN: 0,
      reduced: !!mq.matches, field: props.field, gain: +props.intensity || 1, variation: +props.variation || 1,
      rand: Math.random, noise: makeNoise(1), seed: 1,
      ptr: ptr, keep: keep.at,
      rects: {}, zones: [],
      mark: null, headline: { typed: 0, prev: 0, caret: false, ul: 'none', phase: 'prefix', n: accent.length, accent: accent },
      cycleLen: 34, exitDur: 2.8,
      C: C, COOL_PINK: COOL_PINK, COLD_CYAN: COLD_CYAN,
      util: { clamp: clamp, lerp: lerp, smooth: smooth, smoother: smoother, easeOut: easeOut, easeIn: easeIn, easeInOut: easeInOut,
              damp: damp, rng: rng, makeNoise: makeNoise, qpt: qpt, cpt: cpt, mix: mix, rgba: rgba, sample: sample, hex: hex, TAU: TAU },
      glow: glow, dot: dot,
      words: words, markPt: markPt, withMark: withMark, headPath: null, bodyPaths: null,
      setMarkVars: setMarkVars, measure: measure
    };

    let sc = null;
    let raf = 0, running = false, visible = true, destroyed = false;
    let last = 0, startedAt = 0, hlStart = 0;
    let lastHl = '';
    const markVarCache = {};

    /* ------------------------------------------------ geometry from the DOM */
    function measure() {
      const zones = [];
      const rects = {};
      const els = root.querySelectorAll('[data-keepout]');
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        const b = layoutBox(el, root);
        const name = el.getAttribute('data-keepout');
        const pad = parseFloat(el.getAttribute('data-pad') || '16');
        const feather = parseFloat(el.getAttribute('data-feather') || '60');
        const strength = parseFloat(el.getAttribute('data-strength') || '0.72');
        rects[name] = b;
        if (strength > 0) zones.push({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2, rad: Math.min(24, pad + 8), feather: feather, strength: strength, name: name });
      }
      env.rects = rects;
      env.zones = zones;
      keep.build(env.w, env.h, zones);
      const m = root.querySelector('[data-mark]');
      if (m) {
        const b = layoutBox(m, root);
        const s = b.h / MARK_VB[3];
        env.mark = { x: b.x, y: b.y, w: b.w, h: b.h, s: s };
      } else env.mark = null;
    }
    function markPt(u, v) {
      const m = env.mark;
      if (!m) return { x: env.w / 2, y: env.h / 2 };
      return { x: m.x + (u - MARK_VB[0]) * m.s, y: m.y + (v - MARK_VB[1]) * m.s };
    }
    /* run fn(ctx) in the mark's own units (viewBox space) */
    function withMark(c, fn) {
      const m = env.mark;
      if (!m) return;
      c.save();
      c.translate(m.x - MARK_VB[0] * m.s, m.y - MARK_VB[1] * m.s);
      c.scale(m.s, m.s);
      fn(c);
      c.restore();
    }
    /* boxes of the visible headline words, in board px (measured on demand) */
    function words() {
      const out = [];
      const rr = root.getBoundingClientRect();
      const s = rr.width / (root.offsetWidth || rr.width || 1);
      const ws = root.querySelectorAll('[data-word]');
      for (let i = 0; i < ws.length; i++) {
        const r = ws[i].getBoundingClientRect();
        out.push({ text: ws[i].textContent, kind: 'prefix', x: (r.left - rr.left) / s, y: (r.top - rr.top) / s, w: r.width / s, h: r.height / s });
      }
      const acc = root.querySelector('[data-accent-text]');
      if (acc) {
        /* the runtime wraps the {{accentText}} hole in its own span: walk down to the text nodes */
        const walker = document.createTreeWalker(acc, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const txt = node.textContent;
          const re = /\S+/g;
          let m;
          while ((m = re.exec(txt))) {
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            const r = range.getBoundingClientRect();
            out.push({ text: m[0], kind: 'accent', x: (r.left - rr.left) / s, y: (r.top - rr.top) / s, w: r.width / s, h: r.height / s });
          }
        }
      }
      return out;
    }
    function setMarkVars(kick, flash) {
      const k = (Math.round(kick * 100) / 100).toFixed(2), f = (Math.round(flash * 100) / 100).toFixed(2);
      if (markVarCache.k !== k) { root.style.setProperty('--nh-kick', k); markVarCache.k = k; }
      if (markVarCache.f !== f) { root.style.setProperty('--nh-flash', f); markVarCache.f = f; }
    }

    /* ---------------------------------------------------------------- sizing */
    function resize() {
      const w = root.offsetWidth || root.clientWidth, h = root.offsetHeight || root.clientHeight;
      if (!w || !h) return false;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const changed = (w !== env.w || h !== env.h || dpr !== env.dpr);
      env.w = w; env.h = h; env.dpr = dpr; env.portrait = h > w;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      measure();
      return changed;
    }

    function reseed() {
      env.seed = 1 + (env.variation | 0) * 101;
      env.rand = rng(env.seed);
      env.noise = makeNoise(env.seed);
    }

    function buildScene() {
      reseed();
      sc = factory(env) || {};
      if (sc.cycleLen) env.cycleLen = sc.cycleLen;
      if (sc.exitDur) env.exitDur = sc.exitDur;
      if (sc.setup) sc.setup();
    }

    /* ------------------------------------------------------------- pointer */
    function local(e) {
      const rr = root.getBoundingClientRect();
      const s = rr.width / (root.offsetWidth || rr.width || 1);
      return { x: (e.clientX - rr.left) / s, y: (e.clientY - rr.top) / s };
    }
    function onMove(e) {
      const p = local(e);
      ptr.type = e.pointerType || 'mouse';
      if (ptr.type === 'mouse' || ptr.down) {
        if (!ptr.active || ptr.sx < -1e3) { ptr.sx = p.x; ptr.sy = p.y; }
        ptr.active = true;
      }
      ptr.x = p.x; ptr.y = p.y; ptr.idle = 0;
    }
    function onDown(e) {
      const p = local(e);
      ptr.type = e.pointerType || 'mouse';
      ptr.down = true; ptr.active = true; ptr.idle = 0;
      if (ptr.sx < -1e3 || ptr.type !== 'mouse') { ptr.sx = p.x; ptr.sy = p.y; }
      ptr.x = p.x; ptr.y = p.y;
      ptr.taps.push({ x: p.x, y: p.y, t: env.t });
      if (ptr.type !== 'mouse' && root.setPointerCapture) { try { root.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } }
    }
    function onUp(e) {
      ptr.down = false;
      if ((e.pointerType || 'mouse') !== 'mouse') ptr.active = false;
    }
    function onLeave(e) {
      if ((e.pointerType || 'mouse') === 'mouse') ptr.active = false;
    }
    function onDbl() { replay(); }

    /* --------------------------------------------------------------- frame */
    function headlineTick() {
      const loop = String(props.headline || '').indexOf('once') < 0;
      const t = env.reduced ? 999 : (performance.now() - hlStart) / 1000;
      const st = env.reduced ? { typed: accent.length, caret: false, ul: 'full', phase: 'hold' } : headlineAt(t, loop, accent.length);
      const hl = env.headline;
      hl.prev = hl.typed;
      hl.typed = st.typed; hl.caret = st.caret; hl.ul = st.ul; hl.phase = st.phase;
      const key = st.typed + '|' + (st.caret ? 1 : 0) + '|' + st.ul;
      if (key !== lastHl) {
        lastHl = key;
        if (cfg.onHeadline) cfg.onHeadline({ accentText: accent.slice(0, st.typed), caret: st.caret, ul: st.ul });
      }
    }

    /* if the browser is struggling (many boards running at once), drop to half rate */
    let emaDt = 1 / 60, slowFor = 0, half = false, skip = false;
    function frame(now) {
      raf = 0;
      if (destroyed) return;
      if (half) { skip = !skip; if (skip) { schedule(); return; } }
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0;
      if (!half) {
        emaDt = emaDt * 0.94 + Math.min(dt, 0.1) * 0.06;
        if (emaDt > 1 / 38) { slowFor += dt; if (slowFor > 2.5) half = true; } else slowFor = 0;
      }
      if (dt > 1 / 20) dt = 1 / 20;
      env.dt = dt;
      env.t += dt;
      env.introT += dt;

      /* the field's cycle: 'cycle' re-enters like the live site; 'continuous' never repeats */
      if (env.field === 'cycle') {
        const L = env.cycleLen, X = env.exitDur;
        env.exitT = env.introT > L - X ? clamp((env.introT - (L - X)) / X, 0, 1) : 0;
        if (env.introT >= L) { env.introT = 0; env.exitT = 0; env.cycleN++; if (sc.restart) sc.restart(); }
      } else env.exitT = 0;

      /* pointer smoothing and presence */
      ptr.idle += dt;
      if (ptr.active) {
        const nsx = damp(ptr.sx, ptr.x, 14, dt), nsy = damp(ptr.sy, ptr.y, 14, dt);
        ptr.vx = dt > 0 ? (nsx - ptr.sx) / dt : 0; ptr.vy = dt > 0 ? (nsy - ptr.sy) / dt : 0;
        ptr.sx = nsx; ptr.sy = nsy;
      } else { ptr.vx *= 0.9; ptr.vy *= 0.9; }
      ptr.presence = damp(ptr.presence, ptr.active ? 1 : 0, ptr.active ? 5 : 1.6, dt);
      if (ptr.taps.length && env.t - ptr.taps[0].t > 3) ptr.taps.shift();

      headlineTick();
      if (sc.update) sc.update(dt);
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, env.w, env.h);
      if (sc.draw) sc.draw(ctx);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      schedule();
    }
    function schedule() {
      if (!destroyed && running && visible && !env.reduced && !raf) raf = requestAnimationFrame(frame);
    }

    /* reduced motion: one finished, still frame (redrawn on resize only) */
    function drawStill() {
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
      ctx.clearRect(0, 0, env.w, env.h);
      env.introT = 60; env.t = 60; env.exitT = 0; env.dt = 0;
      headlineTick();
      if (sc.still) sc.still(ctx);
      else {
        if (sc.update) { for (let i = 0; i < 4; i++) sc.update(1 / 60); }
        if (sc.draw) sc.draw(ctx);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    function replay() {
      env.introT = 0; env.exitT = 0; env.cycleN = 0;
      hlStart = performance.now(); lastHl = '';
      if (sc && sc.restart) sc.restart();
      if (cfg.onReplay) cfg.onReplay();
      if (env.reduced) drawStill();
    }

    /* ------------------------------------------------------------ lifecycle */
    let ro = null, io = null, fontsDone = false;
    function start() {
      if (!resize()) {
        /* not laid out yet: try again next frame */
        requestAnimationFrame(function () { if (!destroyed && !sc) start(); });
        return;
      }
      buildScene();
      startedAt = last = performance.now();
      hlStart = startedAt;
      headlineTick();
      running = true;
      if (env.reduced) drawStill(); else schedule();
      if (window.ResizeObserver) {
        ro = new ResizeObserver(function () {
          if (destroyed) return;
          const ch = resize();
          if (ch && sc && sc.setup) { reseed(); sc.setup(); }
          if (env.reduced) drawStill();
        });
        ro.observe(root);
      }
      if (window.IntersectionObserver) {
        io = new IntersectionObserver(function (ents) {
          const v = ents.some(function (e) { return e.isIntersecting; });
          if (v !== visible) { visible = v; if (visible) { last = performance.now(); half = false; slowFor = 0; emaDt = 1 / 60; schedule(); } }
        }, { threshold: 0 });
        io.observe(root);
      }
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          if (destroyed || fontsDone) return;
          fontsDone = true;
          measure();
          if (sc && sc.relayout) sc.relayout();
          if (env.reduced) drawStill();
        });
      }
      /* the headline settles after its entrance: re-measure keep-outs once it has */
      setTimeout(function () { if (!destroyed) { measure(); if (sc && sc.relayout) sc.relayout(); } }, 1400);
      root.addEventListener('pointermove', onMove);
      root.addEventListener('pointerdown', onDown);
      root.addEventListener('pointerup', onUp);
      root.addEventListener('pointercancel', onUp);
      root.addEventListener('pointerleave', onLeave);
      root.addEventListener('dblclick', onDbl);
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      document.addEventListener('visibilitychange', onVis);
    }
    function onMq() {
      env.reduced = !!mq.matches;
      if (env.reduced) drawStill(); else { last = performance.now(); schedule(); }
    }
    function onVis() {
      if (document.hidden) return;
      last = performance.now();
      schedule();
    }
    function setProps(p) {
      const prev = props;
      props = Object.assign({}, props, p || {});
      env.field = props.field;
      env.gain = +props.intensity || 1;
      const nv = +props.variation || 1;
      if (nv !== env.variation) { env.variation = nv; reseed(); if (sc && sc.setup) sc.setup(); }
      if (prev.field !== props.field || prev.headline !== props.headline) replay();
      if (env.reduced) drawStill();
    }
    function destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ro) ro.disconnect();
      if (io) io.disconnect();
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('dblclick', onDbl);
      if (mq.removeEventListener) mq.removeEventListener('change', onMq);
      document.removeEventListener('visibilitychange', onVis);
      if (sc && sc.destroy) sc.destroy();
    }

    env.headPath = (typeof Path2D !== 'undefined') ? new Path2D(HEAD_D) : null;
    env.bodyPaths = (typeof Path2D !== 'undefined') ? BODY_D.map(function (d) { return new Path2D(d); }) : null;
    start();
    return { env: env, setProps: setProps, destroy: destroy, replay: replay, measure: measure };
  }

  return {
    create: create, scene: scene, C: C, COOL_PINK: COOL_PINK, COLD_CYAN: COLD_CYAN,
    util: { clamp: clamp, lerp: lerp, smooth: smooth, smoother: smoother, easeOut: easeOut, easeIn: easeIn, easeInOut: easeInOut,
            damp: damp, rng: rng, makeNoise: makeNoise, qpt: qpt, cpt: cpt, mix: mix, rgba: rgba, sample: sample, hex: hex, TAU: TAU },
    glow: glow, dot: dot, MARK_VB: MARK_VB, HEAD_D: HEAD_D, BODY_D: BODY_D, headlineAt: headlineAt
  };
})();

/* H3b · Into the mind. Round one's H3 funnelled inference right-to-left into the mark; here the copy
   sits in a right-hand column and the network runs left to right. A wide input layer at the left edge
   narrows layer by layer to a small last layer just before the mark, and the final edges run in behind
   the mark's white body to the head (the cut-out in the shield). Rounds that get there light the head
   from inside (a soft cyan glow painted under env.headPath) and kick the cyan offset for a beat.
   - entrance: one forward pass builds the network left to right (nodes and edges ink in as the front
     passes, a few comets ride it); its landing switches the mind on just as the accent starts typing.
   - continuous: rounds from a few neighbouring inputs at irregular intervals; weak ones fizzle part-way,
     most arrive, now and then a full bright round. Seeded, never the same twice.
   - cycle: entrance, run, then the network is reeled into the mark left to right; the mind goes dark last.
   - pointer / finger: nodes lean in (260 px) and brighten (220 px); a node under the pointer fires a
     comet that heads for the mind. */
NH.scene('mind', function (env) {
  const U = env.util, C = env.C, TAU = U.TAU;
  const PAL = env.COOL_PINK;
  const Z_SIZE = [0.65, 1.0, 1.55], Z_ALPHA = [0.36, 0.62, 0.92];
  const MIND_U = 163, MIND_V = 134;   /* the mind: the cranium's centre (mark units, viewBox 6 6 221.07 270.4) */
  const FACE_U = 56;                  /* the tower's left face at that height: comets pass behind the mark here */
  const FRONT0 = 0.18, LAND = 1.74;   /* entrance: the forward pass leaves the inputs / lands in the mind */
  const DRAIN = 0.66;                 /* cycle exit: the drain lands in the mind at this exitT; then the mind goes dark */
  const REST = 0.22;                  /* the mind's light once it is on */
  const FORK = 0.62, FIZZ = 0.42;
  /* naisi.uk change (6 Oct): arrivals no longer land one by one. A comet's last hop slows as it nears the
     mark and waits at the door (just before it passes behind the tower); everything waiting goes in together,
     so the head takes at most one landing pulse every PULSE_GAP seconds instead of strobing. */
  const PULSE_GAP = 5, GATHER = 0.7, GO = 0.55;
  const MERLONS = [[0, 34], [62, 96], [130, 158]];   /* the tower's three merlons, 158 units across */

  const dbg = env.__dbg || null;      /* QA hook (headless simulation); absent on the boards */
  let plan = null, S = 1, L = 6;
  let nodes = [], edges = [], byLayer = [], routes = [], comets = [], echoes = [];
  let T = { x: 0, y: 0 }, faceX = 0, X0 = 0, XL = 0, C0 = 0;
  let front = Infinity, drain = -Infinity;
  let landed = false, drainLanded = false, nextRoundAt = 0, roundId = 0, lastFull = -99, lastCursorFire = -9;
  let nextPulseAt = 0, releaseAt = -1, bundle = 0;
  const mind = { rest: 0, charge: 0, p: 0, age: 9 };
  const q1 = {}, pe = {};
  /* own legibility mask: env.keep without the mark (the network is meant to reach it) */
  const KC = 6;
  let kg = null, kgw = 0, kgh = 0;

  /* ------------------------------------------------------------------ layout */
  function makePlan() {
    const w = env.w, h = env.h, R = env.rects;
    const top = R.header ? R.header.y + R.header.h : 64;
    if (!env.portrait && w >= 900) {
      return { L: 6, S: 1, counts: [12, 9, 7, 5, 4, 3], spans: [1, 0.78, 0.58, 0.41, 0.27, 0.16],
               x0: 66, gap: 76, top: top + 40, bot: h - 42, merlons: true };
    }
    const floor = (R.tagline ? R.tagline.y : h - 140) - 58;
    if (w >= 600) {
      return { L: 6, S: 0.92, counts: [12, 9, 7, 5, 4, 3], spans: [1, 0.78, 0.58, 0.41, 0.27, 0.16],
               x0: 48, gap: 64, top: top + 52, bot: floor, merlons: true };
    }
    return { L: 4, S: 0.74, counts: [8, 6, 4, 3], spans: [1, 0.68, 0.42, 0.22],
             x0: 26, gap: 34, top: top + 36, bot: floor, merlons: false };
  }

  function setup() {
    const r = U.rng((env.seed | 0) * 7 + 3);
    plan = makePlan(); L = plan.L; S = plan.S;
    nodes = []; byLayer = [];
    for (let l = 0; l < L; l++) {
      const ids = [];
      for (let i = 0; i < plan.counts[l]; i++) {
        const zr = r();
        nodes.push({
          l: l, i: i, hx: 0, hy: 0, x: 0, y: 0, q: 0, z: zr < 0.25 ? 0 : zr < 0.78 ? 1 : 2,
          jx: r() - 0.5, jy: r() - 0.5, act: 0, bright: 1, ph: r() * TAU, vis: 0, born: -1, fired: -1, out: [],
          wfx: [0.18 + r() * 0.32, 0.28 + r() * 0.45], wfy: [0.18 + r() * 0.32, 0.28 + r() * 0.45],
          wpx: [r() * TAU, r() * TAU], wpy: [r() * TAU, r() * TAU], wax: 2.5 + r() * 3.5, way: 2.5 + r() * 3.5
        });
        ids.push(nodes.length - 1);
      }
      byLayer.push(ids);
    }
    place();
    for (const n of nodes) { n.x = n.hx; n.y = n.hy; }
    connect();
    place();
    makeRoutes();
    buildKeep();
    restart();
  }

  function relayout() {
    if (!plan) return;
    const p2 = makePlan();
    if (p2.L === plan.L) { plan = p2; place(); }
    buildKeep();
  }

  /* node homes: a funnel from the input layer to the mind, re-run whenever the layout moves */
  function place() {
    const m = env.mark;
    if (m) { T = env.markPt(MIND_U, MIND_V); faceX = env.markPt(FACE_U, MIND_V).x; XL = m.x - plan.gap; }
    else { T = { x: env.w * 0.6, y: env.h * 0.42 }; faceX = T.x - 80; XL = T.x - 200; }
    X0 = plan.x0;
    C0 = (plan.top + plan.bot) / 2;
    const half0 = (plan.bot - plan.top) / 2;
    for (let l = 0; l < L; l++) {
      const ids = byLayer[l], n = ids.length;
      const x = X0 + (XL - X0) * l / (L - 1);
      const q = (x - X0) / Math.max(1, T.x - X0);
      const c = U.lerp(C0, T.y, q), half = half0 * plan.spans[l];
      const step = n > 1 ? 2 * half / (n - 1) : 0;
      const grouped = l === 0 && plan.merlons && n % 3 === 0;
      for (let i = 0; i < n; i++) {
        const nd = nodes[ids[i]];
        let f = n > 1 ? i / (n - 1) : 0.5;
        if (grouped) {
          const g = n / 3, gi = Math.floor(i / g), j = i % g, seg = MERLONS[gi];
          f = (seg[0] + (seg[1] - seg[0]) * (g > 1 ? j / (g - 1) : 0.5)) / 158;
        }
        nd.hx = x + nd.jx * 14 * S;
        nd.hy = c - half + 2 * half * f + nd.jy * step * (grouped ? 0.1 : 0.3);
        nd.q = q;
      }
    }
    for (const e of edges) shapeEdge(e);
  }

  function connect() {
    edges = [];
    for (const n of nodes) n.out = [];
    for (let l = 0; l < L - 1; l++) {
      const src = byLayer[l], dst = byLayer[l + 1], hasIn = {};
      for (const si of src) {
        const s = nodes[si];
        const near = dst.map(function (di) { return { di: di, d: Math.abs(nodes[di].hy - s.hy) }; })
          .sort(function (a, b) { return a.d - b.d; }).slice(0, 2);
        for (const nn of near) { addEdge(si, nn.di, ((si + nn.di) % 2) ? 1 : -1); hasIn[nn.di] = 1; }
      }
      for (const di of dst) {
        if (hasIn[di]) continue;
        let best = src[0], bd = 1e9;
        for (const si of src) { const d = Math.abs(nodes[si].hy - nodes[di].hy); if (d < bd) { bd = d; best = si; } }
        addEdge(best, di, 1);
      }
    }
    for (const si of byLayer[L - 1]) addEdge(si, -1, 1);
  }
  function addEdge(a, b, sign) {
    edges.push({ a: a, b: b, sign: sign, ox: 0, oy: 0, len: 1, stop: 1, lit: 0, litTo: 0, q: 0 });
    nodes[a].out.push(edges.length - 1);
  }
  function shapeEdge(e) {
    const a = nodes[e.a];
    if (e.b < 0) {
      e.len = Math.hypot(T.x - a.hx, T.y - a.hy);
      e.q = (a.q + 1) / 2;
      e.stop = 1;
      for (let k = 1; k <= 48; k++) {
        const p = U.qpt(a.hx, a.hy, a.hx + (T.x - a.hx) * 0.5, T.y, T.x, T.y, k / 48, q1);
        if (p.x >= faceX + 3) { e.stop = k / 48; break; }
      }
      return;
    }
    const b = nodes[e.b];
    const dx = b.hx - a.hx, dy = b.hy - a.hy, len = Math.hypot(dx, dy) || 1;
    const sag = 0.16 * len * e.sign;
    e.ox = -dy / len * sag; e.oy = dx / len * sag; e.len = len; e.stop = 1;
    e.q = (a.q + b.q) / 2;
  }
  /* live control points of an edge (nodes wobble and lean toward the pointer) */
  function pts(e) {
    const a = nodes[e.a];
    pe.ax = a.x; pe.ay = a.y;
    if (e.b < 0) { pe.bx = T.x; pe.by = T.y; pe.cx = a.x + (T.x - a.x) * 0.5; pe.cy = T.y; }
    else {
      const b = nodes[e.b];
      pe.bx = b.x; pe.by = b.y; pe.cx = (a.x + b.x) / 2 + e.ox; pe.cy = (a.y + b.y) / 2 + e.oy;
    }
    return pe;
  }

  /* the first pass's comets follow a few routes that keep their place in the funnel */
  function makeRoutes() {
    routes = [];
    const n0 = byLayer[0].length;
    const fr = L >= 6 ? [0.07, 0.3, 0.5, 0.71, 0.94] : L === 5 ? [0.1, 0.37, 0.63, 0.9] : [0.14, 0.5, 0.86];
    for (const f of fr) {
      let ni = byLayer[0][Math.round(f * (n0 - 1))];
      const rt = [];
      for (let guard = 0; guard < L + 1; guard++) {
        const n = nodes[ni];
        if (!n.out.length) break;
        let best = n.out[0], bd = 1e9;
        for (const ei of n.out) {
          const e = edges[ei];
          if (e.b < 0) { best = ei; break; }
          const d = nodes[e.b], cnt = byLayer[d.l].length;
          const dd = Math.abs((cnt > 1 ? d.i / (cnt - 1) : 0.5) - f);
          if (dd < bd) { bd = dd; best = ei; }
        }
        rt.push(best);
        if (edges[best].b < 0) break;
        ni = edges[best].b;
      }
      routes.push(rt);
    }
  }

  function buildKeep() {
    const w = env.w, h = env.h;
    kgw = Math.ceil(w / KC) + 2; kgh = Math.ceil(h / KC) + 2;
    kg = new Float32Array(kgw * kgh);
    const zs = (env.zones || []).filter(function (z) { return z.name !== 'mark'; });
    for (let j = 0; j < kgh; j++) {
      const y = (j - 0.5) * KC;
      for (let i = 0; i < kgw; i++) {
        const x = (i - 0.5) * KC;
        let k = 1;
        for (const r of zs) {
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2, hx = r.w / 2 - r.rad, hy = r.h / 2 - r.rad;
          const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy;
          const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r.rad;
          const v = 1 - r.strength * (1 - U.smooth(d / r.feather));
          if (v < k) k = v;
        }
        kg[j * kgw + i] = k;
      }
    }
  }
  function keepAt(x, y) {
    if (!kg) return 1;
    const fx = x / KC + 0.5, fy = y / KC + 0.5;
    let i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0) i = 0; if (j < 0) j = 0;
    if (i > kgw - 2) i = kgw - 2; if (j > kgh - 2) j = kgh - 2;
    const tx = U.clamp(fx - i, 0, 1), ty = U.clamp(fy - j, 0, 1);
    const a = kg[j * kgw + i], b = kg[j * kgw + i + 1], c = kg[(j + 1) * kgw + i], d = kg[(j + 1) * kgw + i + 1];
    return U.lerp(U.lerp(a, b, tx), U.lerp(c, d, tx), ty);
  }

  /* ---------------------------------------------------------------- timeline */
  /* the front gathers speed as the funnel narrows: it arrives in the mind with momentum, not a crawl */
  function sweep(u) { u = U.clamp(u, -0.2, 1.05); return 0.55 * u + 0.45 * u * Math.abs(u); }
  function frontAt(it) {
    if (env.reduced) return Infinity;
    const u = (it - FRONT0) / (LAND - FRONT0);
    if (u > 1.02) return Infinity;
    return X0 - 40 * S + (T.x - X0 + 40 * S) * sweep(u);
  }
  function drainAt(ex) {
    if (env.reduced || ex <= 0) return -Infinity;
    return X0 - 40 * S + (T.x - X0 + 40 * S) * sweep(ex / DRAIN);
  }
  /* how present the network is at board x: inked in behind the entrance front, reeled in behind the drain */
  function visAt(x) {
    let v = 1;
    if (front < 1e8) v = U.smooth((front - x + 20 * S) / (70 * S));
    if (drain > -1e8) v *= 1 - U.smooth((drain - x + 30 * S) / (60 * S));
    return v;
  }

  function restart() {
    comets = []; echoes = [];
    for (const e of edges) { e.lit = 0; e.litTo = 0; }
    for (const n of nodes) { n.act = 0; n.bright = 1; n.born = -1; n.fired = -1; }
    landed = env.introT >= LAND;   /* replays and new cycles reset introT first; a re-setup mid-run (resize, variation) stays on */
    drainLanded = false;
    mind.charge = 0;
    nextPulseAt = env.t + (landed ? 1.2 : PULSE_GAP); releaseAt = -1; bundle = 0;
    nextRoundAt = LAND + 2.1 + env.rand() * 1.4;
  }

  function land(amount, round) { mind.charge = Math.min(1.4, mind.charge + amount); if (amount > 0.3 || mind.age > 0.5) mind.age = 0; if (dbg) dbg('land', amount, round || 0); }

  function hopDur(e) { return (0.36 + e.len / (285 * S)) * (1 - 0.28 * e.q); }

  function launch(ei, k, en, decay, round, seek, t0) {
    const e = edges[ei];
    const last = e.b < 0;
    comets.push({ e: ei, t: t0 || 0, dur: hopDur(e) * (last ? 1.5 : 1), k: k, en: en, decay: decay, round: round, seek: seek, fizz: !seek && en < FIZZ,
                  gate: last ? U.clamp(e.stop - 0.06, 0.4, 0.95) : 1, wait: false, go: false, goFrom: 0, goT0: 0 });
  }

  /* a round: a few neighbouring inputs fire; strength decides how far it gets */
  function startRound() {
    const r = env.rand;
    let kind;
    if (env.t - lastFull > 20 && r() < 0.22) kind = 'full';
    else kind = r() < 0.45 ? 'small' : 'medium';
    if (kind === 'full') lastFull = env.t;
    if (dbg) dbg('round', kind, roundId + 1);
    const ins = byLayer[0];
    const k = kind === 'small' ? 1 + (r() < 0.4 ? 1 : 0) : kind === 'medium' ? 2 + (r() < 0.5 ? 1 : 0) : 4 + ((r() * 4) | 0);
    let start = (r() * (ins.length - k + 1)) | 0;
    if (plan.merlons && ins.length % 3 === 0) {
      const gs = ins.length / 3, g = (r() * 3) | 0;
      start = k <= gs ? g * gs + ((r() * (gs - k + 1)) | 0) : Math.min(ins.length - k, g * gs);
    }
    const en = kind === 'small' ? 0.5 + r() * 0.22 : kind === 'medium' ? 0.8 + r() * 0.2 : 1.2;
    const decay = kind === 'small' ? 0.78 + r() * 0.1 : kind === 'medium' ? 0.88 + r() * 0.09 : 1;
    const kk = kind === 'full' ? 1 : 0.72 + r() * 0.16;
    const id = ++roundId;
    for (let j = 0; j < k; j++) {
      const n = nodes[ins[start + j]];
      n.fired = id; n.act = Math.max(n.act, 0.85);
      const delay = j * (0.05 + r() * 0.09);
      let any = false;
      for (const ei of n.out) if (r() < 0.5 + 0.4 * Math.min(1, en)) { launch(ei, kk, en, decay, id, false, -delay); any = true; }
      if (!any) launch(n.out[(r() * n.out.length) | 0], kk, en, decay, id, false, -delay);
    }
    return kind;
  }
  function gapFor(kind) {
    const r = env.rand();
    return kind === 'small' ? 1.3 + r * 2.0 : kind === 'medium' ? 2.4 + r * 2.4 : 5 + r * 2;
  }

  function arrive(c) {
    const e = edges[c.e];
    if (e.b < 0) { bundle += c.seek ? 0.22 : 0.18 + 0.32 * c.k; return; }   /* everything released together lands as one pulse (after the comet loop) */
    const d = nodes[e.b];
    d.act = Math.min(1, d.act + 0.55 * c.k * (c.fizz ? 0.4 : 1));
    echoes.push({ x: d.x, y: d.y, t: env.t, q: d.q, k: c.fizz ? 0.35 : c.k });
    if (c.fizz || d.fired === c.round) return;
    d.fired = c.round;
    const r = env.rand;
    if (c.seek) { launch(d.out[(r() * d.out.length) | 0], c.k * 0.97, 1, 1, c.round, true); return; }
    const en = c.en * c.decay;
    let any = false;
    for (const oi of d.out) {
      if (r() < FORK * Math.min(1, en)) { launch(oi, Math.min(1, c.k * (0.92 + r() * 0.12)), en, c.decay, c.round, false); any = true; }
    }
    if (!any && en > 0.56) launch(d.out[(r() * d.out.length) | 0], c.k, en, c.decay, c.round, false);
    else if (!any && en > FIZZ * 0.85 && r() < 0.6) launch(d.out[(r() * d.out.length) | 0], c.k * 0.85, FIZZ * 0.5, c.decay, c.round, false);
  }

  /* the first pass lights its routes as the front carries comets along them */
  function inkRoutes(fx) {
    for (const rt of routes) {
      for (const ei of rt) {
        const e = edges[ei], a = nodes[e.a], bx = e.b < 0 ? T.x : nodes[e.b].hx;
        if (fx >= a.hx && fx < bx) {
          if (e.lit < 0.05) e.litTo = 0;
          e.lit = Math.max(e.lit, 0.8);
          e.litTo = Math.max(e.litTo, (fx - a.hx) / Math.max(4, bx - a.hx));
        }
      }
    }
  }

  /* ------------------------------------------------------------------ update */
  function update(dt) {
    const t = env.t, it = env.introT, ex = env.exitT, P = env.ptr, r = env.rand;
    const cycle = env.field === 'cycle';
    front = frontAt(it);
    drain = drainAt(ex);
    if (!landed && it >= LAND) { landed = true; land(1.1); nextPulseAt = t + PULSE_GAP; }
    if (ex > 0 && !drainLanded && ex >= DRAIN) { drainLanded = true; land(0.8); }
    if (front < 1e8) inkRoutes(front);

    /* rounds */
    if (landed && ex === 0 && !env.reduced && it >= nextRoundAt && !(cycle && it > env.cycleLen - env.exitDur - 2.4)) {
      let moving = 0;
      for (const c of comets) if (!c.wait) moving++;   /* comets waiting at the door don't hold up new rounds */
      if (moving < 14) { const kind = startRound(); nextRoundAt = it + gapFor(kind); }
      else nextRoundAt = it + 0.6;
    }

    /* comets */
    for (let i = comets.length - 1; i >= 0; i--) {
      const c = comets[i];
      const e = edges[c.e];
      if (c.go) c.t = c.goFrom + (1 - c.goFrom) * U.easeIn(U.clamp((t - c.goT0) / GO, 0, 1)) + (t - c.goT0 >= GO ? 1 : 0);
      else if (e.b < 0 && c.t > 0) {
        /* the last hop eases off as it nears the door, then holds there */
        c.t = Math.min(c.gate, c.t + dt / c.dur * (0.3 + 0.7 * (1 - U.smooth(c.t / c.gate))));
        if (c.t >= c.gate) c.wait = true;
      }
      else c.t += dt / c.dur;
      if (c.t <= 0) continue;
      if (drain > -1e8 && nodes[e.a].hx < drain - 40 * S && c.t < 0.95) {
        const bx = e.b < 0 ? T.x : nodes[e.b].hx;
        if (nodes[e.a].hx + (bx - nodes[e.a].hx) * c.t < drain) { comets.splice(i, 1); continue; }
      }
      const lv = c.k * (c.fizz ? 1 - U.smooth((c.t - 0.3) / 0.6) : 1);
      if (e.lit < 0.05) e.litTo = 0;
      if (lv * 0.95 > e.lit) e.lit = lv * 0.95;
      e.litTo = Math.max(e.litTo, Math.min(1, c.t));
      if (c.t >= 1) { comets.splice(i, 1); arrive(c); }
    }
    if (bundle > 0) { land(Math.min(1.25, bundle)); bundle = 0; nextPulseAt = Math.max(nextPulseAt, t + PULSE_GAP); }
    let waiting = 0;
    for (const c of comets) if (c.wait && !c.go) waiting++;
    if (waiting > 0) {
      if (releaseAt < 0) releaseAt = Math.max(t + GATHER, nextPulseAt - GO);   /* gather the stragglers, keep the rhythm */
      if (t >= releaseAt) {
        for (const c of comets) if (c.wait && !c.go) { c.go = true; c.goFrom = c.t; c.goT0 = t; }
        releaseAt = -1;
        nextPulseAt = t + GO + PULSE_GAP;
      }
    }
    for (let i = echoes.length - 1; i >= 0; i--) if (t - echoes[i].t > 0.32) echoes.splice(i, 1);
    const decay = Math.pow(0.32, dt * (ex > 0 ? 2.5 : 1));
    for (const e of edges) { e.lit *= decay; if (e.lit < 0.01) { e.lit = 0; e.litTo = 0; } }

    /* the mind: a pulse per landing (rise ~0.15 s, fall ~1 s) over a resting light once it is on */
    mind.age += dt;
    mind.charge *= Math.exp(-dt / 0.7);
    mind.p = U.damp(mind.p, mind.charge, 12, dt);
    const on = landed && (ex === 0 || ex < DRAIN + 0.05);
    mind.rest = U.damp(mind.rest, on ? REST : 0, on ? 1.4 : 4.2, dt);
    /* the offset answers only the stronger landings: a beat, not a flicker */
    env.setMarkVars(U.clamp((mind.p - 0.3) / 0.9, 0, 1), 0.9 * U.clamp((mind.p - 0.22) / 1.0, 0, 1));

    /* the pointer: attract, brighten, fire toward the mind */
    const settled = landed && ex === 0 && front > 1e8;
    /* the attractor eases in once the first pass has landed (as live: an 800 ms ramp) and out for the exit */
    const settle = landed ? U.smooth((it - LAND - 0.1) / 0.8) * (1 - U.smooth(ex / 0.15)) : 0;
    const attract = 0.4 * P.presence * settle;
    if (P.active && settled && t - lastCursorFire > 0.38) {
      let bi = -1, bd = 1e9;
      for (let i = 0; i < nodes.length; i++) {
        const dx = nodes[i].x - P.sx, dy = nodes[i].y - P.sy, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = i; }
      }
      if (bi >= 0 && bd < 70 * 70) {
        const n = nodes[bi], id = ++roundId;
        n.fired = id; n.act = Math.max(n.act, 1);
        launch(n.out[(r() * n.out.length) | 0], 0.85, 1, 1, id, true);
        lastCursorFire = t;
      }
    }
    for (const n of nodes) {
      const v = visAt(n.hx);
      n.vis = v;
      const amp = 0.6 + Z_SIZE[n.z] * 0.4;
      const wx = (Math.sin(t * n.wfx[0] + n.wpx[0]) * 0.6 + Math.cos(t * n.wfx[1] + n.wpx[1]) * 0.4) * n.wax * amp * S;
      const wy = (Math.cos(t * n.wfy[0] + n.wpy[0]) * 0.6 + Math.sin(t * n.wfy[1] + n.wpy[1]) * 0.4) * n.way * amp * S;
      let tx = n.hx + wx, ty = n.hy + wy;
      if (attract > 0.001) {
        const dx = P.sx - n.hx, dy = P.sy - n.hy, dist = Math.hypot(dx, dy);
        if (dist < 260 && dist > 2) { const f = 1 - dist / 260; tx += dx * f * attract; ty += dy * f * attract; }
      }
      if (drain > -1e8 && v < 1) {
        /* reeled in: drift toward the mind as it fades */
        const f = (1 - v) * 0.16;
        tx += (T.x - n.hx) * f; ty += (T.y - n.hy) * f * 1.4;
      }
      n.x = U.damp(n.x, tx, 13, dt); n.y = U.damp(n.y, ty, 13, dt);
      if (P.active) {
        const dx = P.sx - n.x, dy = P.sy - n.y, d2 = dx * dx + dy * dy;
        if (d2 < 220 * 220) n.bright = Math.min(1.6, n.bright + (1 - Math.sqrt(d2) / 220) * 3.6 * dt);
      }
      n.bright = Math.max(1, n.bright * Math.pow(0.965, dt * 60));
      n.act *= Math.pow(0.94, dt * 60);
      if (n.born < 0 && v > 0.9 && front < 1e8) n.born = t;
    }
  }

  /* ------------------------------------------------------------------- draw */
  function col(q, heat) {
    const a = U.sample(PAL, 0.42 + 0.42 * heat);
    const b = U.mix(C.sky, C.ice, heat);
    return U.mix(a, b, Math.pow(U.clamp(q, 0, 1), 1.6));
  }
  /* stroke the part [t0, t1] of a quadratic (its polar form gives the sub-curve's control point) */
  function sub(ctx, p, t0, t1) {
    const f = function (s, u, a, c, b) { return (1 - s) * (1 - u) * a + ((1 - s) * u + s * (1 - u)) * c + s * u * b; };
    ctx.moveTo(f(t0, t0, p.ax, p.cx, p.bx), f(t0, t0, p.ay, p.cy, p.by));
    ctx.quadraticCurveTo(f(t0, t1, p.ax, p.cx, p.bx), f(t0, t1, p.ay, p.cy, p.by), f(t1, t1, p.ax, p.cx, p.bx), f(t1, t1, p.ay, p.cy, p.by));
  }
  function stroke(ctx, p, t0, t1, c, a, w) {
    if (a < 0.006 || t1 - t0 < 0.004) return;
    ctx.strokeStyle = U.rgba(c, a);
    ctx.lineWidth = w;
    ctx.beginPath(); sub(ctx, p, t0, t1); ctx.stroke();
  }

  function draw(ctx) {
    const G = env.gain, t = env.t;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    /* edges: inked in behind the front, reeled in behind the drain; a comet leaves a lit trail */
    for (const e of edges) {
      const a = nodes[e.a], bx = e.b < 0 ? T.x : nodes[e.b].hx, span = Math.max(4, bx - a.hx);
      let lo = 0, hi = 1;
      if (front < 1e8) hi = U.clamp((front - a.hx) / span, 0, 1);
      if (drain > -1e8) lo = U.clamp((drain - a.hx) / span, 0, 1);
      hi = Math.min(hi, e.stop);
      if (hi - lo < 0.003) continue;
      const p = pts(e);
      const k = keepAt((p.ax + p.bx) / 2, (p.ay + p.by) / 2);
      const base = (e.b < 0 ? 0.15 : 0.1) * k * G;
      const c0 = col(e.q, 0.15);
      stroke(ctx, p, lo, hi, c0, base, 0.8);
      if (front < 1e8 && hi < e.stop && hi > 0) stroke(ctx, p, Math.max(lo, hi - 0.22), hi, col(e.q, 0.5), base * 2.4, 1.1 * S);
      if (drain > -1e8 && lo > 0) stroke(ctx, p, lo, Math.min(hi, lo + 0.22), col(e.q, 0.6), base * 2.6, 1.1 * S);
      if (e.lit > 0.02) {
        const top = Math.min(hi, e.litTo);
        if (top > lo) stroke(ctx, p, lo, top, col(e.q, 0.55 + 0.4 * e.lit), e.lit * 0.7 * k * G, (0.8 + 1.5 * e.lit) * Math.max(0.8, S));
      }
    }
    /* comets (round comets, then the first pass / drain riders) */
    for (const c of comets) {
      if (c.t <= 0) continue;
      const e = edges[c.e], p = pts(e);
      const pt = U.qpt(p.ax, p.ay, p.cx, p.cy, p.bx, p.by, Math.min(1, c.t), q1);
      let a = c.k * (c.fizz ? 1 - U.smooth((c.t - 0.3) / 0.6) : 1) * visAt(pt.x);
      if (nodes[e.a].l === 0) a *= U.smooth(c.t / 0.12);
      comet(ctx, pt.x, pt.y, e.q, a, e.b < 0);
    }
    if (front < 1e8) riders(ctx, front, 0.8);
    if (drain > -1e8) riders(ctx, drain, 0.75);
    /* arrival echoes */
    for (const ec of echoes) {
      const u = (t - ec.t) / 0.32, k = keepAt(ec.x, ec.y);
      env.glow(ctx, ec.x, ec.y, (10 + u * 26) * S * 1.4, col(ec.q, 0.8), (1 - u) * 0.7 * ec.k * k * k * G);
    }
    /* node halos and the one-shot ring as the first pass reaches them */
    for (const n of nodes) {
      const vis = n.vis;
      if (vis < 0.02) continue;
      const k = keepAt(n.x, n.y);
      if (k < 0.04) continue;
      const tw = 0.85 + 0.15 * Math.sin(t * 1.4 + n.ph);
      const tb = Math.max(0.42, n.act + (n.bright - 1));
      const r = (10 + 18 * Z_SIZE[n.z]) * S * n.bright * tw * (1 + n.act * 0.7) * (0.4 + 0.6 * vis);
      const c = col(n.q, Math.min(1, 0.15 + n.act * 0.8));
      env.glow(ctx, n.x, n.y, r, c, tb * 0.32 * Z_ALPHA[n.z] * k * tw * vis * G);
      if (n.born > 0 && front < 1e8) {
        const age = (t - n.born) / 0.7;
        if (age < 1) {
          ctx.strokeStyle = U.rgba(c, (1 - age) * 0.42 * k * G);
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(n.x, n.y, (4 + age * 20 * Z_SIZE[n.z]) * S, 0, TAU); ctx.stroke();
        }
      }
    }
    drawMind(ctx);
    ctx.globalCompositeOperation = 'source-over';
    /* sharp cores */
    for (const n of nodes) {
      const vis = n.vis;
      if (vis < 0.02) continue;
      const k = keepAt(n.x, n.y);
      if (k < 0.04) continue;
      const r = (1.5 + 1.6 * Z_SIZE[n.z]) * Math.max(0.8, S) * (0.95 + n.act * 0.6 + n.bright * 0.2) * (0.5 + 0.5 * vis);
      const al = Math.max(0.23, (0.55 + 0.4 * Z_ALPHA[n.z]) * n.bright) * k * vis * Math.min(1, G);
      env.dot(ctx, n.x, n.y, r, col(n.q, Math.min(1, 0.45 + n.act * 0.55)), al);
    }
  }

  function comet(ctx, x, y, q, a, final) {
    if (a < 0.01) return;
    const k = final ? 1 : keepAt(x, y), G = env.gain;
    env.glow(ctx, x, y, 24 * S, col(q, 0.92), 0.8 * a * k * k * G);
    env.glow(ctx, x, y, 7 * S, C.ice, 0.75 * a * k * G, 'hot');
  }
  /* the first pass and the drain carry a comet along each route, riding the front */
  function riders(ctx, fx, k) {
    for (const rt of routes) {
      for (const ei of rt) {
        const e = edges[ei], a = nodes[e.a], bx = e.b < 0 ? T.x : nodes[e.b].hx;
        if (fx < a.hx || fx >= bx) continue;
        const u = (fx - a.hx) / Math.max(4, bx - a.hx), p = pts(e);
        const pt = U.qpt(p.ax, p.ay, p.cx, p.cy, p.bx, p.by, u, q1);
        const ramp = U.smooth((fx - X0 + 10 * S) / (90 * S));
        comet(ctx, pt.x, pt.y, e.q, k * ramp, e.b < 0);
      }
    }
  }

  /* the head is a cut-out in the mark: light it from inside. A landing's light comes in at the back of
     the head (where the comets arrive) and spreads forward into the cranium as it fades. */
  function drawMind(ctx) {
    const lv = mind.rest + mind.p;
    if (lv < 0.004 || !env.headPath || !env.mark) return;
    const G = env.gain, a = U.smooth(mind.age / 0.8);
    env.withMark(ctx, function (c) {
      c.save();
      c.clip(env.headPath);
      const x = U.lerp(MIND_U - 18, MIND_U + 2, a);
      const breath = env.reduced ? 1 : 1 + 0.1 * Math.sin(env.t * U.TAU / 6.5);
      env.glow(c, MIND_U + 2, MIND_V + 8, 92, C.cyan, Math.min(1, mind.rest * 0.85 * breath) * G);
      if (mind.p > 0.01) {
        env.glow(c, x, MIND_V + 6, 74, C.cyan, Math.min(1, mind.p * 0.95) * G);
        env.glow(c, x - 4, MIND_V + 2, 52, C.ice, Math.min(1, mind.p * 0.8) * G, 'hot');
      }
      c.restore();
    });
  }

  function still(ctx) {
    comets = []; echoes = [];
    front = Infinity; drain = -Infinity;
    for (const n of nodes) { n.x = n.hx; n.y = n.hy; n.born = -1; n.act = 0; n.bright = 1; n.vis = 1; }
    for (const e of edges) { e.lit = 0; e.litTo = 0; }
    const rt = routes[Math.floor(routes.length / 2)] || [];
    for (const ei of rt) { edges[ei].lit = 0.42; edges[ei].litTo = 1; nodes[edges[ei].a].act = 0.35; }
    mind.rest = REST + 0.14; mind.p = 0; mind.charge = 0;
    env.setMarkVars(0, 0);
    draw(ctx);
  }

  return { setup: setup, restart: restart, update: update, draw: draw, still: still, relayout: relayout, cycleLen: 30, exitDur: 2.8 };
});
/* engine:end */

export default NH;
