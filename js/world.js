// Iso projection, camera, map art (floor, sides, obstacles, backgrounds, weather), particles, decals.
'use strict';

const TILT = 0.62; // camera pitch: 1 = straight down, lower = flatter
const proj = (x, y, z = 0) => [x, y * TILT - z];
const unproj = (sx, sy) => [sx, sy / TILT];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const pick = a => a[Math.floor(Math.random() * a.length)];
// seeded rng so map art is identical each build
function srng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function shade(hex, f) { // f<1 darker, f>1 lighter
  let c = hex.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const n = parseInt(c.slice(0, 6), 16), ch = s => clamp(Math.round(((n >> s) & 255) * f), 0, 255);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

const CAM = { x: 0, y: 0, zoom: 1, shake: 0, shx: 0, shy: 0, vw: 1, vh: 1, dpr: 1 };
function camApply(ctx) {
  const z = CAM.zoom, d = CAM.dpr;
  ctx.setTransform(z * d, 0, 0, z * d, (CAM.vw / 2 - CAM.x * z + CAM.shx) * d, (CAM.vh / 2 - CAM.y * z + CAM.shy) * d);
}
function screenToWorld(mx, my) {
  return unproj((mx - CAM.vw / 2 - CAM.shx) / CAM.zoom + CAM.x, (my - CAM.vh / 2 - CAM.shy) / CAM.zoom + CAM.y);
}
function shake(a) { if (SETTINGS.shake) CAM.shake = Math.max(CAM.shake, a); }

// ---------- map build: floor + sides baked once into an offscreen canvas ----------
const SIDE = 240;
function buildMap(m) {
  const [W, H] = m.size, cv = document.createElement('canvas'), R = srng(m.id.length * 9301 + 7);
  cv.width = W; cv.height = H * TILT + SIDE + 40;
  const c = cv.getContext('2d'), ox = 0, oy = 10;
  const P = (x, y, z = 0) => { const p = proj(x, y, z); return [p[0] + ox, p[1] + oy]; };
  const poly = (pts, fill) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); };

  // sides (two visible faces), fading into the void with hanging rock teeth
  const faces = [[P(0, H), P(W, H), 0.9]];
  for (const [a, b, f] of faces) {
    const g = c.createLinearGradient(0, Math.min(a[1], b[1]), 0, Math.max(a[1], b[1]) + SIDE);
    g.addColorStop(0, shade(m.side, f * 1.2)); g.addColorStop(0.6, shade(m.side, f * 0.7)); g.addColorStop(1, 'rgba(0,0,0,0)');
    const pts = [a, b];
    for (let i = 10; i >= 0; i--) { const t = i / 10, dep = SIDE * (0.45 + 0.55 * R()); pts.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t) + dep]); }
    poly(pts, g);
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    for (let r = 1; r < 6; r++) { // brick courses + staggered joints
      const dy = r * 26; c.beginPath(); c.moveTo(a[0], a[1] + dy); c.lineTo(b[0], b[1] + dy); c.stroke();
      for (let k = 0; k < 14; k++) { const t = (k + (r % 2) * 0.5) / 14, x = lerp(a[0], b[0], t), y = lerp(a[1], b[1], t) + dy; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 26); c.stroke(); }
    }
  }
  // tiles
  const T = 50;
  for (let i = 0; i < W / T; i++) for (let j = 0; j < H / T; j++) {
    const base = (i + j) % 2 ? m.tileA : m.tileB, f = 0.9 + R() * 0.2;
    poly([P(i * T, j * T), P((i + 1) * T, j * T), P((i + 1) * T, (j + 1) * T), P(i * T, (j + 1) * T)], shade(base, f));
  }
  c.lineWidth = 1;
  const line = (x0, y0, x1, y1, col, w = 1) => { const a = P(x0, y0), b = P(x1, y1); c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); };
  if (m.theme === 'city') {
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i <= W; i += T) line(i, 0, i, H, m.grid + '33', 2);
    for (let j = 0; j <= H; j += T) line(0, j, W, j, m.grid + '33', 2);
    for (let k = 0; k < 14; k++) { const i = Math.floor(R() * W / T) * T, j = Math.floor(R() * H / T) * T; poly([P(i, j), P(i + T, j), P(i + T, j + T), P(i, j + T)], 'rgba(0,200,255,0.10)'); }
    c.globalCompositeOperation = 'source-over';
    poly([P(W / 2 - 90, H / 2 - 90), P(W / 2 + 90, H / 2 - 90), P(W / 2 + 90, H / 2 + 90), P(W / 2 - 90, H / 2 + 90)], 'rgba(255,43,214,0.08)');
  } else if (m.theme === 'temple') {
    for (let j = 0; j < H; j += 25) line(0, j, W, j, 'rgba(60,30,10,0.35)', 1.5);
    for (let k = 0; k < 300; k++) { const x = R() * W, y = Math.floor(R() * H / 25) * 25 + R() * 25; line(x, y, x + 20 + R() * 60, y, 'rgba(70,40,15,0.18)'); }
    c.save(); const cc = P(W / 2, H / 2); c.translate(cc[0], cc[1]); c.scale(1, TILT);
    c.strokeStyle = 'rgba(170,20,20,0.6)'; c.lineWidth = 14; c.beginPath(); c.arc(0, 0, 170, 0, 7); c.stroke();
    c.fillStyle = 'rgba(170,20,20,0.35)'; c.beginPath(); c.arc(0, 0, 60, 0, 7); c.fill(); c.restore();
  } else if (m.theme === 'graveyard') {
    for (let k = 0; k < 40; k++) { const p = P(R() * W, R() * H); c.fillStyle = 'rgba(70,50,30,0.35)'; c.beginPath(); c.ellipse(p[0], p[1], 20 + R() * 50, 10 + R() * 22, 0, 0, 7); c.fill(); }
    for (let k = 0; k < 1400; k++) { const p = P(R() * W, R() * H); c.strokeStyle = `rgba(${90 + R() * 60 | 0},${140 + R() * 60 | 0},80,0.5)`; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + R() * 4 - 2, p[1] - 3 - R() * 5); c.stroke(); }
  } else if (m.theme === 'lava') {
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 30; k++) {
      let x = R() * W, y = R() * H; c.strokeStyle = `rgba(255,${80 + R() * 80 | 0},0,0.6)`; c.lineWidth = 1 + R() * 2.5; c.beginPath();
      const a = P(x, y); c.moveTo(a[0], a[1]);
      for (let s = 0; s < 6; s++) { x += R() * 60 - 30; y += R() * 60 - 30; const b = P(clamp(x, 0, W), clamp(y, 0, H)); c.lineTo(b[0], b[1]); }
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  } else if (m.theme === 'ice') {
    for (let k = 0; k < 80; k++) { const x = R() * W, y = R() * H, l = 20 + R() * 60; line(x, y, x + l, y - l * 0.3, 'rgba(255,255,255,0.35)', 1.5); }
    for (let k = 0; k < 30; k++) { const edge = R() < 0.5, p = P(edge ? R() * W : (R() < 0.5 ? 10 : W - 10), edge ? (R() < 0.5 ? 10 : H - 10) : R() * H); c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(p[0], p[1], 30 + R() * 40, 10 + R() * 12, 0, 0, 7); c.fill(); }
  }
  // glowing rim on all four top edges
  const edges = [[0, 0, W, 0], [W, 0, W, H], [W, H, 0, H], [0, H, 0, 0]];
  c.globalCompositeOperation = 'lighter';
  for (const [w, a] of [[8, '33'], [3, 'aa']]) for (const e of edges) line(e[0], e[1], e[2], e[3], m.rim + a, w);
  c.globalCompositeOperation = 'source-over';
  return { m, W, H, floor: cv, ox, oy, bg: null, bgKey: '', obs: m.obs.map(([x, y, w, d, h, kind]) => ({ x, y, w, d, h, kind, hp: kind === 'crate' ? 60 : 1e9 })) };
}

function decal(MAP, kind, x, y, r, color) {
  if (!SETTINGS.decals || x < 0 || y < 0 || x > MAP.W || y > MAP.H) return;
  const c = MAP.floor.getContext('2d'), p = proj(x, y); const px = p[0] + MAP.ox, py = p[1] + MAP.oy;
  c.save(); c.translate(px, py); c.scale(1, TILT);
  if (kind === 'splat') {
    c.fillStyle = color; c.globalAlpha = 0.75;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(rnd(-r, r), rnd(-r, r), rnd(r * 0.2, r * 0.6), 0, 7); c.fill(); }
  } else if (kind === 'scorch') {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.6, 'rgba(20,10,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
  } else if (kind === 'crack') {
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 3;
    for (let i = 0; i < 9; i++) { let a = rnd(0, 7), d = 0, cx = 0, cy = 0; c.beginPath(); c.moveTo(0, 0); while (d < r) { d += rnd(10, 25); a += rnd(-0.5, 0.5); cx = Math.cos(a) * d; cy = Math.sin(a) * d; c.lineTo(cx, cy); } c.stroke(); }
  } else if (kind === 'hole') { c.fillStyle = 'rgba(0,0,0,0.6)'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); }
  else if (kind === 'burn') { c.fillStyle = 'rgba(20,0,0,0.25)'; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill(); }
  c.restore();
}

// ---------- obstacles ----------
const OBS_COL = { crate: ['#c8954f', '#9a6b33', '#7a521f'], box: ['#6b7280', '#4b5260', '#383d48'], pillar: ['#3b3f58', '#2a2d42', '#1d1f30'],
  lantern: ['#c9b49a', '#9c876d', '#7a6852'], tomb: ['#9aa3a8', '#737b80', '#596064'], rock: ['#3a2f2c', '#2a2220', '#1d1716'], ice: ['#d8f3ffcc', '#9fd8f5bb', '#7cc0e8bb'] };
function drawObstacle(c, o, t) {
  const { x, y, w, d, h } = o, col = OBS_COL[o.kind] || OBS_COL.box;
  const q = pts => { c.beginPath(); pts.forEach((p, i) => { const s = proj(p[0], p[1], p[2]); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); c.closePath(); };
  const flash = o.hitT > 0 ? 1.6 : 1;
  q([[x, y + d, h], [x + w, y + d, h], [x + w, y + d, 0], [x, y + d, 0]]); c.fillStyle = shade(col[1], flash); c.fill();
  q([[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]]); c.fillStyle = shade(col[0], flash); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5;
  const L = (a, b) => { const p = proj(...a), q2 = proj(...b); c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q2[0], q2[1]); c.stroke(); };
  if (o.kind === 'crate') { // plank X on both faces
    L([x, y + d, h], [x + w, y + d, 0]); L([x, y + d, 0], [x + w, y + d, h]);
  } else if (o.kind === 'pillar') {
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(0,220,255,${0.6 + 0.4 * Math.sin(t * 6)})`; c.lineWidth = 3;
    L([x + w * 0.2, y + d, 5], [x + w * 0.2, y + d, h - 5]); L([x + w * 0.8, y + d, 5], [x + w * 0.8, y + d, h - 5]); c.globalCompositeOperation = 'source-over';
  } else if (o.kind === 'lantern') {
    const p = proj(x + w / 2, y + d / 2, h + 14), g = c.createRadialGradient(p[0], p[1], 0, p[0], p[1], 60);
    g.addColorStop(0, `rgba(255,200,90,${0.8 + 0.2 * Math.sin(t * 9 + x)})`); g.addColorStop(1, 'rgba(255,120,40,0)');
    c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.beginPath(); c.arc(p[0], p[1], 60, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#c0392b'; c.fillRect(p[0] - 9, p[1] - 12, 18, 22); c.fillStyle = '#ffd27a'; c.fillRect(p[0] - 6, p[1] - 8, 12, 14);
  } else if (o.kind === 'tomb') {
    L([x + w * 0.5, y + d, h * 0.85], [x + w * 0.5, y + d, h * 0.35]); L([x + w * 0.25, y + d, h * 0.68], [x + w * 0.75, y + d, h * 0.68]);
  } else if (o.kind === 'rock') {
    c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(255,100,0,${0.5 + 0.3 * Math.sin(t * 3 + y)})`; c.lineWidth = 2;
    L([x + w * 0.2, y + d, h * 0.9], [x + w * 0.5, y + d, h * 0.4]); L([x + w * 0.5, y + d, h * 0.4], [x + w * 0.7, y + d, h * 0.1]); c.globalCompositeOperation = 'source-over';
  }
}

// ---------- backgrounds (static layer baked per screen size, animated bits per frame) ----------
function bakeBg(MAP) {
  const m = MAP.m, w = Math.ceil(CAM.vw * 1.15), h = Math.ceil(CAM.vh * 1.15), key = w + 'x' + h;
  if (MAP.bgKey === key) return MAP.bg;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), R = srng(42 + m.id.length);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, m.sky[0]); g.addColorStop(0.55, m.sky[1]); g.addColorStop(1, m.sky[2]);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const stars = n => { for (let i = 0; i < n; i++) { c.fillStyle = `rgba(255,255,255,${R() * 0.8})`; c.fillRect(R() * w, R() * h * 0.6, 1.5, 1.5); } };
  const orb = (x, y, r, col, glow) => { const gg = c.createRadialGradient(x, y, r * 0.5, x, y, r * 4); gg.addColorStop(0, glow); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(0, 0, w, h); c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  const ridge = (base, amp, col, seed) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (let x = 0; x <= w; x += 8) c.lineTo(x, base - amp * (0.5 + 0.3 * Math.sin(x * 0.004 + seed) + 0.2 * Math.sin(x * 0.013 + seed * 3) + 0.08 * Math.sin(x * 0.05 + seed))); c.lineTo(w, h); c.fill(); };
  if (m.theme === 'city') {
    stars(150); orb(w * 0.8, h * 0.18, 40, '#f3e9ff', 'rgba(200,120,255,0.35)');
    [[0.55, '#120726', 0], [0.68, '#1a0b33', 0.25], [0.82, '#0b0418', 0.5]].forEach(([base, col, lit]) => {
      let x = -20; while (x < w) {
        const bw = 40 + R() * 110, bh = h * (0.15 + R() * 0.35); c.fillStyle = col; c.fillRect(x, h * base - bh, bw, bh + h);
        if (lit) for (let wy = h * base - bh + 8; wy < h; wy += 12) for (let wx = x + 5; wx < x + bw - 6; wx += 10) if (R() < lit * 0.5) { c.fillStyle = pick(['#ffd86b88', '#5ff4ff77', '#ff5ce177']); c.fillRect(wx, wy, 5, 6); }
        if (lit && R() < 0.25) { c.fillStyle = pick(['#ff2bd6', '#00e5ff', '#ffe600']); c.shadowColor = c.fillStyle; c.shadowBlur = 18; c.fillRect(x + bw * 0.2, h * base - bh + 14, bw * 0.6, 8); c.shadowBlur = 0; }
        x += bw + R() * 10;
      }
    });
  } else if (m.theme === 'temple') {
    orb(w * 0.5, h * 0.55, 90, '#fff2c4', 'rgba(255,170,80,0.5)');
    ridge(h * 0.62, h * 0.3, '#c0627acc', 1); ridge(h * 0.72, h * 0.25, '#8e3e66dd', 4); ridge(h * 0.85, h * 0.2, '#4a1f45', 7);
    for (const px of [0.18, 0.78]) { const bx = w * px, by = h * 0.66; c.fillStyle = '#3a1838'; for (let k = 0; k < 4; k++) { const tw = 120 - k * 25, ty = by - k * 34; c.beginPath(); c.moveTo(bx - tw / 2 - 14, ty); c.lineTo(bx + tw / 2 + 14, ty); c.lineTo(bx + tw / 2, ty - 12); c.lineTo(bx - tw / 2, ty - 12); c.fill(); c.fillRect(bx - tw / 2 + 12, ty - 34, tw - 24, 22); } }
  } else if (m.theme === 'graveyard') {
    stars(220); orb(w * 0.25, h * 0.22, 70, '#e8ffe8', 'rgba(120,255,170,0.25)');
    ridge(h * 0.75, h * 0.15, '#0d1d1f', 2);
    const tree = (x, y, a, l, d) => { if (d === 0) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; c.lineWidth = d * 1.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x2, y2); c.stroke(); tree(x2, y2, a - 0.3 - R() * 0.4, l * 0.72, d - 1); tree(x2, y2, a + 0.3 + R() * 0.4, l * 0.72, d - 1); };
    c.strokeStyle = '#050b0c'; for (let i = 0; i < 5; i++) tree(R() * w, h * 0.8, -Math.PI / 2, 50 + R() * 40, 7);
    c.fillStyle = '#050b0c'; const cx = w * 0.7, cy = h * 0.78; c.fillRect(cx, cy - 120, 70, 140); c.beginPath(); c.moveTo(cx - 10, cy - 120); c.lineTo(cx + 35, cy - 190); c.lineTo(cx + 80, cy - 120); c.fill(); c.fillRect(cx + 31, cy - 225, 8, 40); c.fillRect(cx + 20, cy - 212, 30, 7);
    for (let x = 0; x < w; x += 14) c.fillRect(x, h * 0.84, 4, 30);
  } else if (m.theme === 'lava') {
    stars(40);
    for (const [vx, vw, vh] of [[0.2, 380, 0.4], [0.75, 460, 0.5], [0.5, 300, 0.3]]) {
      const bx = w * vx, by = h * 0.85; c.fillStyle = '#1a0605'; c.beginPath(); c.moveTo(bx - vw / 2, by); c.lineTo(bx - 30, by - h * vh); c.lineTo(bx + 30, by - h * vh); c.lineTo(bx + vw / 2, by); c.fill();
      const gg = c.createRadialGradient(bx, by - h * vh, 0, bx, by - h * vh, 120); gg.addColorStop(0, 'rgba(255,120,0,0.8)'); gg.addColorStop(1, 'rgba(255,40,0,0)'); c.fillStyle = gg; c.fillRect(bx - 120, by - h * vh - 120, 240, 240);
    }
    const lg = c.createLinearGradient(0, h * 0.8, 0, h); lg.addColorStop(0, 'rgba(255,90,0,0)'); lg.addColorStop(1, 'rgba(255,140,0,0.9)'); c.fillStyle = lg; c.fillRect(0, h * 0.8, w, h * 0.2);
  } else if (m.theme === 'ice') {
    stars(260); orb(w * 0.82, h * 0.16, 30, '#ffffff', 'rgba(150,200,255,0.3)');
    ridge(h * 0.7, h * 0.35, '#c9dcf2', 3); ridge(h * 0.72, h * 0.33, '#1c3566', 3); ridge(h * 0.8, h * 0.28, '#284a80', 5);
  }
  MAP.bg = cv; MAP.bgKey = key; return cv;
}
function drawBackground(c, MAP, t) {
  const bg = bakeBg(MAP), w = CAM.vw, h = CAM.vh, d = CAM.dpr;
  c.setTransform(d, 0, 0, d, 0, 0);
  const px = clamp(-CAM.x * 0.02, -w * 0.07, w * 0.07), py = clamp(-CAM.y * 0.02, -h * 0.07, h * 0.07);
  c.drawImage(bg, -w * 0.075 + px, -h * 0.075 + py, bg.width, bg.height);
  const th = MAP.m.theme;
  c.globalCompositeOperation = 'lighter';
  if (th === 'city') { // sweeping searchlights + lightning flash
    for (let i = 0; i < 2; i++) { const a = -Math.PI / 2 + Math.sin(t * 0.4 + i * 2) * 0.6, x = w * (0.3 + i * 0.4); c.fillStyle = 'rgba(180,140,255,0.06)'; c.beginPath(); c.moveTo(x, h); c.lineTo(x + Math.cos(a - 0.06) * h * 1.5, h + Math.sin(a - 0.06) * h * 1.5); c.lineTo(x + Math.cos(a + 0.06) * h * 1.5, h + Math.sin(a + 0.06) * h * 1.5); c.fill(); }
    if (Math.sin(t * 0.7) > 0.995 || (t % 11 < 0.08)) { c.fillStyle = 'rgba(200,200,255,0.25)'; c.fillRect(0, 0, w, h); }
  } else if (th === 'ice') { // aurora ribbons
    for (let k = 0; k < 3; k++) for (let x = 0; x < w; x += 6) {
      const y = h * (0.2 + k * 0.07) + Math.sin(x * 0.006 + t * 0.5 + k) * 40 + Math.sin(x * 0.017 - t * 0.3) * 15, a = 0.05 + 0.04 * Math.sin(x * 0.01 + t + k);
      c.fillStyle = k === 1 ? `rgba(120,80,255,${a})` : `rgba(60,255,170,${a})`; c.fillRect(x, y, 6, 90);
    }
  } else if (th === 'lava') { const a = 0.15 + 0.08 * Math.sin(t * 2); c.fillStyle = `rgba(255,60,0,${a})`; c.fillRect(0, h * 0.75, w, h * 0.25); }
  else if (th === 'temple') { c.fillStyle = 'rgba(255,220,200,0.08)'; for (let i = 0; i < 4; i++) { const x = ((t * 15 + i * 400) % (w + 400)) - 200; c.beginPath(); c.ellipse(x, h * (0.2 + i * 0.08), 180, 22, 0, 0, 7); c.fill(); } }
  c.globalCompositeOperation = 'source-over';
  if (th === 'graveyard') { c.strokeStyle = '#000'; c.lineWidth = 2; for (let i = 0; i < 5; i++) { const x = ((t * 40 + i * 300) % (w + 100)) - 50, y = h * 0.2 + Math.sin(t + i) * 40 + i * 20, f = Math.sin(t * 14 + i) * 6; c.beginPath(); c.moveTo(x - 10, y - f); c.lineTo(x, y); c.lineTo(x + 10, y - f); c.stroke(); } }
}

// ---------- weather (screen space) ----------
const WX = { list: [], type: '' };
function weather(c, type, dt, t) {
  const w = CAM.vw, h = CAM.vh, n = { rain: 220, snow: 160, petals: 60, embers: 90, fog: 10 }[type] * (SETTINGS.quality ? 1 : 0.4) | 0;
  if (WX.type !== type) { WX.type = type; WX.list = []; }
  while (WX.list.length < n) WX.list.push({ x: rnd(0, w), y: rnd(-h, h), s: rnd(0.5, 1.5), p: rnd(0, 7) });
  c.setTransform(CAM.dpr, 0, 0, CAM.dpr, 0, 0);
  for (const q of WX.list) {
    if (type === 'rain') { q.x -= 200 * dt * q.s; q.y += 900 * dt * q.s; c.strokeStyle = 'rgba(170,190,255,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x + 4, q.y - 18 * q.s); c.stroke(); }
    else if (type === 'snow') { q.y += 50 * dt * q.s; q.x += Math.sin(t + q.p) * 20 * dt; c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(q.x, q.y, 1.5 * q.s + 0.5, 0, 7); c.fill(); }
    else if (type === 'petals') { q.y += 40 * dt * q.s; q.x += (30 + Math.sin(t * 2 + q.p) * 40) * dt; c.fillStyle = 'rgba(255,170,200,0.85)'; c.beginPath(); c.ellipse(q.x, q.y, 4 * q.s, 2 * q.s, t * 2 + q.p, 0, 7); c.fill(); }
    else if (type === 'embers') { q.y -= 60 * dt * q.s; q.x += Math.sin(t * 3 + q.p) * 30 * dt; c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,${120 + 80 * Math.sin(t * 8 + q.p) | 0},30,0.8)`; c.fillRect(q.x, q.y, 2.5 * q.s, 2.5 * q.s); c.globalCompositeOperation = 'source-over'; if (q.y < -10) { q.y = h + 10; q.x = rnd(0, w); } continue; }
    else if (type === 'fog') { q.x += 15 * dt * q.s; const g = c.createRadialGradient(q.x, q.y, 0, q.x, q.y, 300); g.addColorStop(0, 'rgba(160,220,200,0.08)'); g.addColorStop(1, 'rgba(160,220,200,0)'); c.fillStyle = g; c.fillRect(q.x - 300, q.y - 300, 600, 600); if (q.x > w + 300) q.x = -300; if (q.y < 0) q.y = rnd(h * 0.3, h); continue; }
    if (q.y > h + 20) { q.y = -20; q.x = rnd(0, w + 200); }
    if (q.x < -50) q.x = w + 40; if (q.x > w + 50) q.x = -40;
  }
}

// ---------- particles (world space, 3D) ----------
const FX = [];
function fx(type, x, y, z, o = {}) {
  if (FX.length > (SETTINGS.quality ? 2500 : 900)) return;
  FX.push(Object.assign({ type, x, y, z, vx: 0, vy: 0, vz: 0, life: 0.5, t: 0, size: 3, color: '#fff', grav: 0, add: false }, o));
}
function burst(type, x, y, z, n, speed, o = {}) {
  for (let i = 0; i < n * (SETTINGS.quality ? 1 : 0.5); i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(speed * 0.3, speed);
    fx(type, x, y, z, Object.assign({ vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: rnd(-0.2, 1) * s, life: rnd(0.3, 0.8) }, o, o.life ? { life: o.life * rnd(0.6, 1.2) } : {}));
  }
}
function explosionFx(MAP, x, y, z, r) {
  fx('flash', x, y, z, { size: r * 2.4, life: 0.25, color: '255,200,120', add: true });
  fx('ring', x, y, 0, { size: r * 1.3, life: 0.45, color: '255,180,90' });
  burst('fire', x, y, z, 40, r * 3.5, { life: 0.6, size: 10, grav: -150, drag: 3, add: true });
  burst('smoke', x, y, z + 10, 22, r * 1.4, { life: 1.6, size: 16, grav: -60, drag: 2 });
  burst('debris', x, y, z, 14, r * 4, { life: 1.5, size: 4, grav: 900, color: '#333' });
  burst('spark', x, y, z, 30, r * 7, { life: 0.4, color: '#ffd27a', add: true, grav: 300 });
  decal(MAP, 'scorch', x, y, r * 1.1); shake(16); AU.play('boom');
}
function updateFx(dt, MAP) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const p = FX[i]; p.t += dt;
    if (p.t >= p.life) { FX.splice(i, 1); continue; }
    if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
    p.vz -= p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.z < 0 && p.grav > 0) {
      const onFloor = p.x > 0 && p.y > 0 && p.x < MAP.W && p.y < MAP.H;
      if (!onFloor) continue;
      if (p.type === 'blood') { decal(MAP, 'splat', p.x, p.y, p.size * 2, p.color); FX.splice(i, 1); continue; }
      p.z = 0; p.vz *= -0.4; p.vx *= 0.6; p.vy *= 0.6;
    }
  }
}
function drawFx(c, t) {
  for (const p of FX) {
    const k = p.t / p.life, [sx, sy] = proj(p.x, p.y, p.z);
    c.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
    switch (p.type) {
      case 'spark': { const [ex, ey] = proj(p.x - p.vx * 0.03, p.y - p.vy * 0.03, p.z - p.vz * 0.03); c.strokeStyle = p.color; c.globalAlpha = 1 - k; c.lineWidth = p.size * (1 - k) + 0.5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke(); break; }
      case 'fire': { c.globalAlpha = 1 - k; c.fillStyle = k < 0.3 ? '#fff3b0' : k < 0.6 ? '#ff9a2a' : '#c0300a'; c.beginPath(); c.arc(sx, sy, p.size * (1 - k * 0.5), 0, 7); c.fill(); break; }
      case 'smoke': { c.globalAlpha = (1 - k) * 0.45; c.fillStyle = p.color === '#fff' ? '#555' : p.color; c.beginPath(); c.arc(sx, sy, p.size * (0.5 + k * 1.5), 0, 7); c.fill(); break; }
      case 'blood': case 'dot': { c.globalAlpha = 1 - k * 0.5; c.fillStyle = p.color; c.beginPath(); c.arc(sx, sy, p.size, 0, 7); c.fill(); break; }
      case 'debris': case 'shell': { c.globalAlpha = 1 - k; c.fillStyle = p.color; c.save(); c.translate(sx, sy); c.rotate(p.t * 15 + p.x); c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); c.restore(); break; }
      case 'ring': { c.globalAlpha = 1 - k; c.strokeStyle = `rgb(${p.color})`; c.lineWidth = 6 * (1 - k) + 1; const r = p.size * (0.2 + k); c.beginPath(); c.ellipse(sx, sy, r, r * TILT, 0, 0, 7); c.stroke(); break; }
      case 'flash': { const r = p.size * (0.5 + k * 0.5), g = c.createRadialGradient(sx, sy, 0, sx, sy, r); g.addColorStop(0, `rgba(${p.color},${1 - k})`); g.addColorStop(1, `rgba(${p.color},0)`); c.globalAlpha = 1; c.fillStyle = g; c.beginPath(); c.arc(sx, sy, r, 0, 7); c.fill(); break; }
      case 'muzzle': { c.globalAlpha = 1 - k; c.fillStyle = '#fff6c0'; c.save(); c.translate(sx, sy); c.rotate(p.a); c.beginPath(); c.moveTo(0, -p.size * 0.4); c.lineTo(p.size * 2.2, 0); c.lineTo(0, p.size * 0.4); c.lineTo(p.size * 0.5, 0); c.fill(); c.fillStyle = '#ffae3a'; c.beginPath(); c.arc(0, 0, p.size * 0.7, 0, 7); c.fill(); c.restore(); break; }
      case 'text': { const s = k < 0.15 ? 1 + (0.15 - k) * 6 : 1; c.globalAlpha = 1 - k * k; c.font = `900 ${p.size * s}px Impact, sans-serif`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#000'; c.strokeText(p.text, sx, sy); c.fillStyle = p.color; c.fillText(p.text, sx, sy); break; }
      case 'bolt': { c.globalAlpha = (1 - k) * (0.6 + Math.random() * 0.4); for (const [lw, col] of [[8, 'rgba(120,180,255,0.35)'], [2.5, '#e8f6ff']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); p.pts.forEach((q, i) => { const s = proj(q[0], q[1], q[2]); i ? c.lineTo(s[0], s[1]) : c.moveTo(s[0], s[1]); }); c.stroke(); } break; }
      case 'ghost': { c.globalAlpha = (1 - k) * 0.5; drawStick(c, sx, sy, p.pose, p.look, p.scale, p.face, null, p.color); break; }
      case 'cross': { c.globalAlpha = 1 - k; c.fillStyle = p.color; c.fillRect(sx - 1.5, sy - 5, 3, 10); c.fillRect(sx - 5, sy - 1.5, 10, 3); break; }
    }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}
function lightningPts(a, b) { // jagged 3D polyline
  const pts = [a], n = 8;
  for (let i = 1; i < n; i++) { const t = i / n; pts.push([lerp(a[0], b[0], t) + rnd(-18, 18), lerp(a[1], b[1], t) + rnd(-18, 18), lerp(a[2], b[2], t) + rnd(-14, 14)]); }
  pts.push(b); return pts;
}
