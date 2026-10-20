// Game state, fighters, combat, projectiles, powers, modes, rendering + HUD.
'use strict';

const G = { on: false };
const GRAV = 1300, BASE_SPEED = 230;
const onPlat = (x, y) => x > 0 && y > 0 && x < G.map.W && y < G.map.H;
const foes = (a, b) => a !== b && (a.team !== b.team);
const alive = f => !f.dead && !f.gone;
const feet = t => t.body === 'bat' ? t.z - 35 : t.z; // flyers' hittable body hangs below their anchor

function startGame(cfg) {
  const m = MAPS.find(x => x.id === cfg.map) || pick(MAPS);
  FX.length = 0;
  Object.assign(G, { on: true, cfg, mode: cfg.mode, map: buildMap(m), F: [], P: [], items: [], rag: [], t: 0, freeze: 0, slowT: 0, warpT: 0, warp: null,
    wave: 0, queue: [], spawnT: 0, waveT: 3, score: 0, combo: 0, comboT: 0, over: false, overT: 0, ann: [], feed: [], idc: 0, itemT: 4, paused: false, boss: null });
  const surv = cfg.mode !== 'brawl';
  cfg.slots.forEach((s, i) => {
    if (s.type === 'off') return;
    const prof = s.prof || PROFILES[i] || DEFAULT_PROFILES[i];
    const look = s.type === 'bot' && !s.custom ? botLook(i) : Object.assign({}, prof);
    const team = surv ? 0 : cfg.teams ? i % 2 : i;
    if (cfg.teams && !surv) look.color = ['#ff4d4d', '#3ad7ff'][team];
    const f = mkFighter({ look, team, slot: i, ctrl: s, lives: surv ? 3 : cfg.lives, power: null, name: s.type === 'bot' ? `${look.name || 'Bot'} [${['EASY', 'NORMAL', 'HARD'][s.diff]}]` : prof.name });
    respawn(f, true);
  });
  AU.music(cfg.music || (surv && cfg.mode === 'zombies' ? 'zombie' : m.music));
  announce(surv ? MODES[cfg.mode].name : (cfg.teams ? 'TEAM BRAWL' : 'BRAWL'), surv ? 'Survive the waves' : 'FIGHT!', '#ffe14d');
}
function botLook(i) {
  return { name: pick(['Rex', 'Kai', 'Nova', 'Bolt', 'Ash', 'Zed', 'Ivy', 'Mako', 'Juno', 'Taz']), color: pick(COLORS.slice(1, 11)), head: pick(HEADS), hat: pick(HATS), eyes: pick(EYES), back: pick(BACKS), aura: Math.random() < 0.4 ? pick(AURAS) : 'none', thick: 4 };
}
function mkFighter(o) {
  const e = o.enemy ? ENEMIES[o.enemy] : null, hp = e ? e.hp * (e.boss ? 1 + G.wave * 0.02 : 1 + G.wave * 0.06) : 100;
  const f = Object.assign({ id: ++G.idc, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, face: 1, aim: 0, ax: 1, ay: 0, aimDist: 300, walk: 0, spd: 0,
    hp, maxHp: hp, scale: e?.scale || 1, base: e?.scale || 1, enemy: e, body: e?.body, wpn: 'fists', ammo: 0, cd: 0, atk: -1, atkDur: 0.3, atkN: 0, hitDone: true,
    hurt: 0, stun: 0, dash: 0, dashCd: 0, inv: 0, flash: 0, recoil: 0, energy: 40, pwT: 0, dead: false, respawnT: 0, trail: [], ghostT: 0, stats: { k: 0, d: 0, dmg: 0 }, ai: null }, o, { enemy: e });
  if (e) f.look = Object.assign({ thick: 4 }, e.look);
  G.F.push(f); return f;
}
function freeSpot(margin = 90) {
  const { W, H } = G.map;
  for (let i = 0; i < 30; i++) {
    const x = rnd(margin, W - margin), y = rnd(margin, H - margin);
    if (G.map.obs.some(o => x > o.x - 30 && x < o.x + o.w + 30 && y > o.y - 30 && y < o.y + o.d + 30)) continue;
    if (G.F.some(f => alive(f) && Math.hypot(f.x - x, f.y - y) < 140)) continue;
    return [x, y];
  }
  return [W / 2 + rnd(-50, 50), H / 2 + rnd(-50, 50)];
}
function respawn(f, first) {
  [f.x, f.y] = freeSpot(); f.z = first ? 0 : 600; f.vx = f.vy = 0; f.vz = 0;
  Object.assign(f, { dead: false, hp: f.maxHp, wpn: 'fists', ammo: 0, inv: 2, pwT: 0, power: null, energy: 0, scale: f.base, stun: 0, hurt: 0, atk: -1 });
}

// ---------- update ----------
function updateGame(dt) {
  if (!G.on || G.paused) return;
  G.t += dt;
  if (G.freeze > 0) { G.freeze -= dt; updateCam(dt); return; }
  if (G.slowT > 0) { G.slowT -= dt; dt *= 0.3; }
  if (G.warpT > 0) { G.warpT -= dt; if (G.warpT <= 0 || !alive(G.warp)) { G.warpT = 0; G.warp = null; } }
  const warped = e => G.warp && e !== G.warp && e.team !== G.warp.team ? 0.3 : 1;
  for (const f of G.F.slice()) updFighter(f, dt * warped(f));
  separate();
  for (let i = G.P.length - 1; i >= 0; i--) if (updProj(G.P[i], dt * (G.warp && G.P[i].team !== G.warp.team ? 0.3 : 1))) G.P.splice(i, 1);
  for (const r of G.rag) updateRagdoll(r, dt, G.map);
  G.rag = G.rag.filter(r => r.t < 4.2);
  G.F = G.F.filter(f => !f.gone);
  updItems(dt);
  updateFx(dt, G.map);
  for (const o of G.map.obs) if (o.hitT > 0) o.hitT -= dt;
  if ((G.comboT -= dt) <= 0) G.combo = 0;
  G.ann = G.ann.filter(a => (a.t += dt) < a.dur);
  G.feed = G.feed.filter(k => (k.t += dt) < 6);
  if (G.mode === 'brawl') checkBrawlEnd(dt); else updWaves(dt);
  updateCam(dt);
}

function input(f, dt) {
  if (f.ctrl.type === 'human') return readInput(f);
  return think(f, dt);
}

function updFighter(f, dt) {
  if (f.dead) {
    if (f.lives > 0 && (f.respawnT -= dt) <= 0 && !G.over) respawn(f);
    return;
  }
  for (const k of ['cd', 'hurt', 'stun', 'dash', 'dashCd', 'inv', 'flash']) if (f[k] > 0) f[k] -= dt;
  f.recoil *= Math.exp(-14 * dt);
  const w = WEAPONS[f.wpn], pw = f.pwT > 0 ? f.power : null, e = f.enemy;
  if (f.pwT > 0) { f.pwT -= dt; if (f.pwT <= 0) f.beam = null; }
  else if (G.cfg.powers !== false && f.power) f.energy = Math.min(100, f.energy + dt * 100 / POWERS[f.power].charge);
  const inp = input(f, dt);
  const grounded = f.z <= 0.01 && onPlat(f.x, f.y);
  let speed = BASE_SPEED * (e ? e.speed : 1) * (pw === 'speed' ? 1.9 : 1) * (w.slow || 1) * (f.atk >= 0 && w.type === 'melee' ? 0.75 : 1);
  if (f.ai?.slowmove) speed *= 0.3;
  // movement: steer velocity toward desired; knockback naturally decays
  const ctl = f.stun > 0 || f.dash > 0 ? 0 : 1, slip = G.map.m.slippery ? 0.3 : 1;
  const tx = inp.mx * speed * ctl, ty = inp.my * speed * ctl;
  const k = Math.min(1, (f.dash > 0 ? 0 : f.stun > 0 ? 3 : grounded ? 13 * slip : e?.fly ? 6 : 2.5) * dt);
  f.vx += (tx - f.vx) * k; f.vy += (ty - f.vy) * k;
  if (inp.ax !== undefined && (inp.ax || inp.ay)) { const l = Math.hypot(inp.ax, inp.ay); f.ax = inp.ax / l; f.ay = inp.ay / l; }
  const sdx = f.ax, sdy = f.ay * TILT;
  f.aim = Math.atan2(-sdy, sdx); if (Math.abs(sdx) > 0.05) f.face = sdx > 0 ? 1 : -1;
  if (ctl && inp.dash && f.dashCd <= 0 && !e) {
    const l = Math.hypot(inp.mx, inp.my), dx = l > 0.1 ? inp.mx / l : f.ax, dy = l > 0.1 ? inp.my / l : f.ay;
    f.vx = dx * 760; f.vy = dy * 760; f.dash = 0.17; f.dashCd = pw === 'speed' ? 0.3 : 0.75; f.inv = Math.max(f.inv, 0.17);
    AU.play('dash'); burst('smoke', f.x, f.y, 4, 6, 80, { life: 0.5, size: 6, drag: 4, color: '#999' });
  }
  if (ctl && inp.jump && grounded) { f.vz = 430; AU.play('jump', 0.6); fx('ring', f.x, f.y, 0, { size: 25, life: 0.25, color: '255,255,255' }); }
  // vertical
  if (e?.fly) { const hz = e.fly + Math.sin(G.t * 3 + f.id) * 12 + (f.ai?.dive || 0); f.z += (hz - f.z) * Math.min(1, 4 * dt); }
  else {
    f.vz -= GRAV * dt * (f.vz < 0 ? 1.3 : 1); f.z += f.vz * dt;
    if (onPlat(f.x, f.y) && f.z <= 0 && f.z > -25) {
      if (f.vz < -700) { fx('ring', f.x, f.y, 0, { size: 60 * f.scale, life: 0.35, color: '255,255,255' }); burst('smoke', f.x, f.y, 2, 10, 140, { life: 0.6, size: 8, drag: 4, color: '#888' }); shake(5); AU.play('punch', 0.5); }
      f.z = 0; f.vz = 0;
    }
    if (f.z < -450) { kill(f, f.lastHit, 'fell'); return; }
  }
  moveCollide(f, dt);
  const sp = Math.hypot(f.vx, f.vy); f.spd = clamp(sp / BASE_SPEED, 0, 1.3); f.walk += dt * sp / 11;
  // attack / power / pickup
  if (f.atk >= 0) { f.atk += dt * (pw === 'speed' ? 1.6 : 1); if (!f.hitDone && f.atk >= f.atkDur * 0.38) { f.hitDone = true; if (w.type === 'melee') meleeHit(f); } if (f.atk >= f.atkDur) f.atk = -1; }
  if (ctl && f.cd <= 0 && (w.auto ? inp.atk : inp.atkP)) attack(f);
  if (inp.pow && f.energy >= 100 && f.pwT <= 0 && G.cfg.powers !== false && f.power) activatePower(f);
  if (inp.pick) pickOrThrow(f);
  else if (!e) { const it = nearItem(f, 30); if (it && (it.kind !== 'weapon' || f.wpn === 'fists')) takeItem(f, it); }
  // ongoing powers
  if (pw === 'laser') laserTick(f, dt);
  if (pw === 'regen') { f.hp = Math.min(f.maxHp, f.hp + 22 * dt); if (Math.random() < 0.3) fx('cross', f.x + rnd(-12, 12), f.y + rnd(-12, 12), f.z + rnd(10, 50), { vz: 50, life: 0.8, color: '#5f8' }); }
  if (pw === 'strength' && Math.random() < 0.5) fx('fire', f.x + rnd(-8, 8), f.y + rnd(-8, 8), f.z + rnd(0, 50), { vz: 90, life: 0.4, size: 5, add: true });
  f.scale = lerp(f.scale, f.base * (pw === 'giant' ? 1.75 : 1), Math.min(1, 6 * dt));
  if ((pw === 'speed' || f.dash > 0) && (f.ghostT -= dt) <= 0 && !f.body) { f.ghostT = 0.035; fx('ghost', f.x, f.y, f.z, { life: 0.3, pose: computePose(f, G.t), look: f.look, scale: f.scale, face: f.face, color: f.dash > 0 ? '#fff' : '#4ff', add: true }); }
}

function moveCollide(f, dt) {
  const r = 13 * f.scale;
  for (const axis of ['x', 'y']) {
    f[axis] += f['v' + axis] * dt;
    for (const o of G.map.obs) {
      if (f.z >= o.h || f.x + r < o.x || f.x - r > o.x + o.w || f.y + r < o.y || f.y - r > o.y + o.d) continue;
      if (f.z > o.h - 18 && f.vz <= 0) { f.z = o.h; f.vz = 0; continue; } // landed on top
      if (axis === 'x') { f.x = f.vx > 0 ? o.x - r : o.x + o.w + r; f.vx *= -0.2; }
      else { f.y = f.vy > 0 ? o.y - r : o.y + o.d + r; f.vy *= -0.2; }
    }
  }
  // standing on an obstacle top
  if (f.z > 0 && f.vz <= 0) for (const o of G.map.obs) if (Math.abs(f.z - o.h) < 3 && f.x > o.x && f.x < o.x + o.w && f.y > o.y && f.y < o.y + o.d) { f.z = o.h; f.vz = 0; }
}
function separate() { // ponytail: O(n^2) push-apart, fine below ~100 fighters
  const L = G.F.filter(f => alive(f) && !f.body);
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = 12 * (a.scale + b.scale);
    if (d > 0 && d < m && Math.abs(a.z - b.z) < 40) { const p = (m - d) / d * 0.5; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; }
  }
}

// ---------- combat ----------
const dmgMult = f => (f.pwT > 0 && f.power === 'strength' ? 2.5 : 1) * (f.pwT > 0 && f.power === 'giant' ? 1.5 : 1);
function attack(f) {
  const w = WEAPONS[f.wpn], fast = f.pwT > 0 && f.power === 'speed' ? 0.55 : 1;
  f.cd = (f.enemy && f.wpn === 'fists' ? f.enemy.cd || w.cd : w.cd) * fast;
  if (w.type === 'melee' || w.thrown) { f.atk = 0; f.atkDur = Math.max(0.16, Math.min(0.5, w.cd * 0.9)) * (f.enemy && f.wpn === 'fists' ? 1.6 : 1); f.atkN++; f.hitDone = w.type !== 'melee'; if (w.type === 'melee') AU.play('throw', 0.4); }
  if (w.type === 'gun') {
    fire(f, w); f.recoil = w.recoil;
    if (--f.ammo <= 0) { tossWeapon(f, true); }
  }
}
function muzzle(f) { const s = f.scale; return [f.x + f.ax * 26 * s, f.y + f.ay * 26 * s, f.z + 40 * s]; }
function fire(f, w) {
  const [mx, my, mz] = muzzle(f), base = Math.atan2(f.ay, f.ax);
  for (let i = 0; i < (w.pellets || 1); i++) {
    const a = base + rnd(-w.spread, w.spread), sp = w.speed * (w.pellets ? rnd(0.8, 1.1) : 1);
    G.P.push({ x: mx, y: my, z: mz, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: w.proj === 'grenade' ? 300 * Math.min(1.4, f.aimDist / 350) : 0, kind: w.proj || 'bullet', owner: f, team: f.team,
      dmg: w.dmg * dmgMult(f), kb: w.kb, life: w.proj ? 4 : 1.1, pierce: w.pierce || 0, radius: w.radius, fuse: w.fuse, impact: w.impact, color: w.tracer || '#ff0', hit: new Set(), wpn: f.wpn });
  }
  if (!w.thrown) {
    fx('muzzle', mx, my, mz, { a: Math.atan2(f.ay * TILT, f.ax), size: 8 + w.recoil, life: 0.06, add: true });
    fx('flash', mx, my, mz, { size: 40 + w.recoil * 3, life: 0.08, color: '255,210,120', add: true });
    if (!w.proj) fx('shell', mx - f.ax * 15, my - f.ay * 15, mz, { vx: -f.ay * 120 + rnd(-30, 30), vy: f.ax * 120 + rnd(-30, 30), vz: 200, grav: 900, life: 1.2, size: 4, color: '#e0b040' });
    fx('smoke', mx, my, mz, { vz: 30, life: 0.6, size: 4, drag: 3, color: '#aaa' });
  }
  shake(w.shake || 1.5); AU.play(w.snd, 0.8);
}
function meleeHit(f) {
  const w = WEAPONS[f.wpn], e = f.enemy, range = (e && f.wpn === 'fists' ? e.range : w.range) * f.scale;
  const dmg = (e && f.wpn === 'fists' ? e.dmg : w.dmg) * dmgMult(f) * (e && !e.boss && f.wpn !== 'fists' ? 0.6 : 1), cosA = Math.cos(w.arc / 2);
  let hit = false;
  for (const t of G.F) {
    if (!alive(t) || !foes(f, t)) continue;
    const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy);
    if (d > range + 14 * t.scale || Math.abs(feet(t) - f.z) > 45 * Math.max(f.scale, t.scale)) continue;
    if (d > 20 && (dx * f.ax + dy * f.ay) / d < cosA) continue;
    if (damage(t, dmg, d ? dx / d : f.ax, d ? dy / d : f.ay, w.kb * (f.pwT > 0 && f.power === 'strength' ? 2 : 1), f)) {
      hit = true; burst('spark', t.x, t.y, t.z + 30 * t.scale, 10, 400, { life: 0.25, color: w.trail || '#fff', add: true, size: 2 });
    }
  }
  for (const o of G.map.obs.slice()) if (o.kind === 'crate' && Math.hypot(o.x + o.w / 2 - f.x, o.y + o.d / 2 - f.y) < range + o.w / 2) { hitCrate(o, dmg); hit = true; }
  if (w.deflect) for (const p of G.P) {
    if (p.team === f.team || Math.hypot(p.x - f.x, p.y - f.y) > range + 10 || Math.abs(p.z - f.z - 30) > 50) continue;
    const sp = Math.hypot(p.vx, p.vy) * 1.3; p.vx = f.ax * sp; p.vy = f.ay * sp; p.owner = f; p.team = f.team; p.hit.clear();
    burst('spark', p.x, p.y, p.z, 12, 500, { life: 0.3, color: '#9ff', add: true }); AU.play('deflect'); popText(p.x, p.y, p.z + 20, 'DEFLECT!', '#9ff', 18);
  }
  if (hit) AU.play(f.enemy?.ai === 'melee' ? 'splat' : w.snd);
}
function popText(x, y, z, text, color, size = 16) { fx('text', x, y, z, { text, color, size, vz: 60, life: 0.9 }); }
function damage(t, amt, dx, dy, kb, src, quiet) {
  if (!alive(t) || t.inv > 0 || G.over && G.mode === 'brawl') return false;
  if (src && src !== t && !foes(src, t)) return false;
  if (t.pwT > 0 && t.power === 'giant') { amt *= 0.6; kb *= 0.4; }
  if (src?.enemy && G.mode !== 'brawl') kb *= 0.5; // survival: fewer cheap ring-outs
  t.hp -= amt; t.lastHit = src || t.lastHit;
  if (src) { src.stats.dmg += amt; if (src.pwT <= 0) src.energy = Math.min(100, src.energy + amt * 0.5); }
  t.energy = Math.min(100, t.energy + amt * 0.25);
  const res = t.enemy?.boss ? 0.12 : t.scale > 1.6 ? 0.35 : 1;
  t.vx += dx * kb * res; t.vy += dy * kb * res;
  if (kb > 300) t.vz = Math.max(t.vz, kb * 0.4 * res);
  if (!quiet) {
    t.hurt = 0.3; t.flash = 0.08; t.stun = Math.min(0.45, 0.06 + kb / 2200) * res;
    const col = SETTINGS.blood ? '#c0101a' : t.look.color;
    burst('blood', t.x, t.y, t.z + 30 * t.scale, 4 + amt / 4, 260, { grav: 900, size: 2.5, color: col, life: 1.2 });
    popText(t.x + rnd(-10, 10), t.y, t.z + 70 * t.scale, Math.round(amt), amt > 40 ? '#ff4' : '#fff', 13 + Math.min(20, amt / 3));
    G.freeze = Math.max(G.freeze, Math.min(0.11, 0.02 + amt / 500));
    if (amt > 30) shake(6);
    AU.play('hurt', 0.4);
  } else if (Math.random() < 0.3) burst('spark', t.x, t.y, t.z + 30, 2, 200, { life: 0.2, color: '#f84', add: true });
  if (t.hp <= 0) kill(t, src);
  return true;
}
function kill(f, src, how) {
  if (f.dead) return;
  f.dead = true; f.hp = 0; f.respawnT = 2.5; f.beam = null; f.pwT = 0;
  if (f.lives !== undefined) f.lives--;
  if (!f.body) G.rag.push(makeRagdoll(f, computePose(f, G.t), f.vx * 1.1, f.vy * 1.1, Math.max(f.vz, 150)));
  else burst('debris', f.x, f.y, f.z + 15, 18, 300, { grav: 900, life: 1.4, size: 5, color: f.look.color });
  if (f.wpn !== 'fists' && how !== 'fell') G.items.push({ kind: 'weapon', wpn: f.wpn, ammo: f.ammo, x: f.x, y: f.y, z: f.z + 30, vz: 200, t: 0 });
  f.stats.d++;
  const k = src && src !== f ? src : f.lastHit !== f ? f.lastHit : null;
  if (k) k.stats.k++;
  G.feed.push({ a: k ? k.name || k.enemy?.name : '', b: f.name || f.enemy?.name, w: how === 'fell' ? 'RING OUT' : WEAPONS[k?.wpn]?.name || '', ca: k?.look.color, cb: f.look.color, t: 0 });
  if (G.feed.length > 6) G.feed.shift();
  fx('flash', f.x, f.y, f.z + 30, { size: 120 * f.scale, life: 0.2, color: '255,255,255', add: true });
  fx('ring', f.x, f.y, Math.max(0, f.z), { size: 80 * f.scale, life: 0.4, color: '255,80,80' });
  burst('spark', f.x, f.y, f.z + 30, 20, 600, { life: 0.4, color: '#fff', add: true });
  shake(f.enemy && !f.enemy.boss ? 4 : 12); AU.play(f.enemy ? (f.enemy.boss ? 'ko' : 'splat') : 'die');
  if (!f.enemy) popText(f.x, f.y, f.z + 90, how === 'fell' ? 'RING OUT!' : 'K.O.!', '#ff4d4d', 34);
  if (f.enemy) {
    f.gone = true;
    if (f.enemy.explodes) explode(f.x, f.y, 20, 110, 30, 500, f);
    if (k && k.ctrl?.type !== 'enemy') { G.combo++; G.comboT = 2.2; G.score += Math.round(f.enemy.score * (1 + G.wave * 0.1) * (1 + (G.combo - 1) * 0.25)); if (G.combo > 2) popText(f.x, f.y, f.z + 110, `x${G.combo} COMBO`, '#ffe14d', 22); }
    if (f.enemy.boss) { G.boss = null; G.slowT = 1.2; announce('BOSS DOWN!', '+' + f.enemy.score, '#ff4d4d'); AU.music(G.cfg.mode === 'zombies' ? 'zombie' : 'battle'); }
    if (Math.random() < 0.12) G.items.push(randItem(f.x, f.y, f.z + 20));
  }
}
function explode(x, y, z, r, dmg, kb, owner) {
  explosionFx(G.map, x, y, z, r);
  for (const t of G.F) {
    const d = Math.hypot(t.x - x, t.y - y, (t.z + 25) - z); if (d > r + 14 || !alive(t)) continue;
    if (owner && owner !== t && !foes(owner, t)) continue;
    const fo = 1 - d / (r + 14);
    damage(t, dmg * (0.4 + 0.6 * fo), (t.x - x) / (d || 1), (t.y - y) / (d || 1), kb * fo, owner === t ? null : owner);
    t.vz = Math.max(t.vz, 500 * fo);
  }
  for (const o of G.map.obs.slice()) if (o.kind === 'crate' && Math.hypot(o.x + o.w / 2 - x, o.y + o.d / 2 - y) < r + o.w / 2) hitCrate(o, dmg);
}
function hitCrate(o, dmg) {
  o.hp -= dmg; o.hitT = 0.08;
  burst('debris', o.x + o.w / 2, o.y + o.d / 2, o.h / 2, 4, 200, { grav: 900, life: 1, size: 4, color: '#9a6b33' });
  if (o.hp <= 0) {
    G.map.obs.splice(G.map.obs.indexOf(o), 1);
    burst('debris', o.x + o.w / 2, o.y + o.d / 2, o.h / 2, 24, 420, { grav: 900, life: 1.5, size: 7, color: '#b07a3a' });
    burst('smoke', o.x + o.w / 2, o.y + o.d / 2, 20, 10, 120, { life: 1, size: 12, drag: 3, color: '#a88' });
    AU.play('crate'); shake(6);
    G.items.push({ kind: 'weapon', wpn: pick(DROP_POOL), x: o.x + o.w / 2, y: o.y + o.d / 2, z: 20, vz: 250, t: 0 });
  }
}

// ---------- projectiles ----------
function updProj(p, dt) {
  p.life -= dt;
  const heavy = p.kind === 'grenade' || p.kind === 'acid' || p.kind === 'thrown';
  if (heavy) p.vz -= 900 * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if (p.kind === 'rocket') { fx('smoke', p.x, p.y, p.z, { life: 0.8, size: 6, vz: 20, drag: 2, color: '#bbb' }); fx('fire', p.x, p.y, p.z, { life: 0.15, size: 5, add: true }); }
  if (p.kind === 'fireball' && Math.random() < 0.7) fx('fire', p.x, p.y, p.z, { life: 0.3, size: 9, add: true, vz: 30 });
  if (p.kind === 'acid' && Math.random() < 0.4) fx('dot', p.x, p.y, p.z, { life: 0.4, size: 2.5, color: '#9f3', grav: 300 });
  const boom = () => { explode(p.x, p.y, Math.max(p.z, 5), p.radius || 60, p.dmg, p.kb, p.owner); return true; };
  if (p.kind === 'grenade' && p.fuse !== undefined && (p.fuse -= dt) <= 0) return boom();
  // floor
  if (p.z <= 0 && onPlat(p.x, p.y)) {
    if (p.kind === 'grenade' && !p.impact) { p.z = 0; p.vz = Math.abs(p.vz) > 80 ? -p.vz * 0.45 : 0; p.vx *= 0.75; p.vy *= 0.75; if (p.vz) AU.play('empty', 0.5); }
    else if (p.radius) return boom();
    else if (p.kind === 'acid') { decal(G.map, 'splat', p.x, p.y, 14, 'rgba(120,220,40,0.6)'); burst('dot', p.x, p.y, 2, 6, 120, { color: '#9f3', grav: 600, life: 0.5, size: 2 }); return true; }
    else { decal(G.map, 'hole', p.x, p.y, 2); return true; }
  }
  // obstacles
  for (const o of G.map.obs) {
    if (p.z > o.h || p.x < o.x || p.x > o.x + o.w || p.y < o.y || p.y > o.y + o.d) continue;
    if (p.kind === 'grenade' && !p.impact) { p.x -= p.vx * dt; p.y -= p.vy * dt; const inX = p.x > o.x && p.x < o.x + o.w; if (inX) p.vy *= -0.6; else p.vx *= -0.6; continue; }
    if (p.radius) return boom();
    burst('spark', p.x, p.y, p.z, 6, 300, { life: 0.25, color: '#ffd', add: true });
    if (o.kind === 'crate') hitCrate(o, p.dmg * 0.5); else o.hitT = 0.05;
    return true;
  }
  // fighters
  for (const t of G.F) {
    if (!alive(t) || t === p.owner || t.team === p.team || p.hit.has(t)) continue;
    const r = (t.body === 'bat' ? 18 : 14) * t.scale + 4, bz = feet(t);
    if (Math.hypot(t.x - p.x, t.y - p.y) > r || p.z < bz - 6 || p.z > bz + 66 * t.scale) continue;
    if (t.pwT > 0 && t.power === 'deflect') { // bounce back at owner
      const o = p.owner, a = o && alive(o) ? Math.atan2(o.y - p.y, o.x - p.x) : Math.atan2(-p.vy, -p.vx), sp = Math.hypot(p.vx, p.vy) * 1.2;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.owner = t; p.team = t.team; p.hit.clear(); if (p.kind === 'grenade') p.vz = 250;
      burst('spark', p.x, p.y, p.z, 10, 400, { life: 0.3, color: '#6af', add: true }); AU.play('deflect'); return false;
    }
    if (p.radius) return boom();
    const sp = Math.hypot(p.vx, p.vy) || 1;
    damage(t, p.dmg, p.vx / sp, p.vy / sp, p.kb, p.owner);
    p.hit.add(t);
    if (p.pierce-- <= 0) return true;
  }
  return p.life <= 0 || p.z < -600;
}
function drawProj(c, p) {
  const [sx, sy] = proj(p.x, p.y, p.z);
  if (p.kind === 'bullet') {
    const [ex, ey] = proj(p.x - p.vx * 0.025, p.y - p.vy * 0.025, p.z);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    c.strokeStyle = p.color + '55'; c.lineWidth = 5; c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 1.8; c.stroke(); c.globalCompositeOperation = 'source-over';
  } else if (p.kind === 'grenade') { c.fillStyle = '#3f6a2a'; c.beginPath(); c.arc(sx, sy, 5, 0, 7); c.fill(); if (p.fuse !== undefined && (G.t * 10 | 0) % 2) { c.fillStyle = '#f33'; c.beginPath(); c.arc(sx, sy - 4, 2, 0, 7); c.fill(); } }
  else if (p.kind === 'rocket') { c.save(); c.translate(sx, sy); c.rotate(Math.atan2(p.vy * TILT, p.vx)); c.fillStyle = '#ddd'; c.fillRect(-9, -3, 14, 6); c.fillStyle = '#c33'; c.beginPath(); c.moveTo(5, -3); c.lineTo(11, 0); c.lineTo(5, 3); c.fill(); c.restore(); }
  else if (p.kind === 'knife' || p.kind === 'arrow') { c.save(); c.translate(sx, sy); c.rotate(p.kind === 'knife' ? G.t * 25 : Math.atan2(p.vy * TILT, p.vx)); c.strokeStyle = p.kind === 'knife' ? '#dde' : '#e8e2cf'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-8, 0); c.lineTo(8, 0); c.stroke(); c.restore(); }
  else if (p.kind === 'acid') { c.fillStyle = '#9f3'; c.beginPath(); c.arc(sx, sy, 5, 0, 7); c.fill(); }
  else if (p.kind === 'fireball') { c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(sx, sy, 0, sx, sy, 16); g.addColorStop(0, '#fff6a0'); g.addColorStop(0.5, '#ff7a1a'); g.addColorStop(1, 'rgba(255,40,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, 16, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
  else if (p.kind === 'thrown') { c.save(); c.translate(sx, sy); c.rotate(G.t * 18); c.scale(1, -1); drawWeapon(c, p.wpn, G.t); c.restore(); }
}

// ---------- powers ----------
function activatePower(f) {
  const P = POWERS[f.power]; f.energy = 0; f.pwT = P.dur;
  AU.play('power'); fx('ring', f.x, f.y, f.z, { size: 70, life: 0.5, color: hexRgb(P.color) }); popText(f.x, f.y, f.z + 95 * f.scale, P.name.toUpperCase() + '!', P.color, 20);
  fx('flash', f.x, f.y, f.z + 30, { size: 100, life: 0.3, color: hexRgb(P.color), add: true });
  const enemies = () => G.F.filter(t => alive(t) && foes(f, t));
  if (f.power === 'blink') {
    let d = 230; const { W, H } = G.map;
    let nx = clamp(f.x + f.ax * d, 20, W - 20), ny = clamp(f.y + f.ay * d, 20, H - 20);
    while (d > 0 && G.map.obs.some(o => nx > o.x - 14 && nx < o.x + o.w + 14 && ny > o.y - 14 && ny < o.y + o.d + 14)) { d -= 20; nx = f.x + f.ax * d; ny = f.y + f.ay * d; }
    burst('spark', f.x, f.y, f.z + 30, 25, 300, { life: 0.4, color: '#c6f', add: true });
    fx('ghost', f.x, f.y, f.z, { life: 0.4, pose: computePose(f, G.t), look: f.look, scale: f.scale, face: f.face, color: '#c6f', add: true });
    f.x = nx; f.y = ny; f.inv = 0.3; f.vz = Math.max(0, f.vz);
    burst('spark', f.x, f.y, f.z + 30, 25, 300, { life: 0.4, color: '#c6f', add: true }); AU.play('blink');
  } else if (f.power === 'shockwave') {
    fx('ring', f.x, f.y, 0, { size: 200, life: 0.6, color: '255,210,80' }); fx('ring', f.x, f.y, 0, { size: 140, life: 0.4, color: '255,255,255' });
    burst('debris', f.x, f.y, 5, 30, 400, { grav: 1000, life: 1.2, size: 5, color: '#777' }); decal(G.map, 'crack', f.x, f.y, 90);
    for (const t of enemies()) { const d = Math.hypot(t.x - f.x, t.y - f.y); if (d < 190) { const fo = 1 - d / 190; damage(t, 30 * dmgMult(f) * (0.5 + fo), (t.x - f.x) / (d || 1), (t.y - f.y) / (d || 1), 400 + 700 * fo, f); t.vz = 520 * fo + 150; } }
    shake(18); AU.play('slam');
  } else if (f.power === 'lightning') {
    let cur = f; const hitSet = new Set();
    for (let i = 0; i < 5; i++) {
      let best = null, bd = 340;
      for (const t of enemies()) { if (hitSet.has(t)) continue; const d = Math.hypot(t.x - cur.x, t.y - cur.y); if (d < bd) { bd = d; best = t; } }
      if (!best) break;
      fx('bolt', 0, 0, 0, { pts: lightningPts([cur.x, cur.y, cur.z + 40 * cur.scale], [best.x, best.y, best.z + 30 * best.scale]), life: 0.35, add: true });
      damage(best, 32 * dmgMult(f), 0, 0, 0, f); best.stun = 0.8; hitSet.add(best); cur = best;
      burst('spark', best.x, best.y, best.z + 30, 10, 300, { color: '#aef', life: 0.3, add: true });
    }
    if (!hitSet.size) fx('bolt', 0, 0, 0, { pts: lightningPts([f.x, f.y, f.z + 400], [f.x, f.y, f.z + 40]), life: 0.3, add: true });
    shake(8); AU.play('zap');
  } else if (f.power === 'timewarp') { G.warp = f; G.warpT = P.dur; AU.play('warp'); }
}
function laserTick(f, dt) {
  const s = f.scale, L = clamp(f.aimDist, 140, 520), x0 = f.x + f.ax * 4, y0 = f.y + f.ay * 4, z0 = f.z + 52 * s;
  let x1 = f.x + f.ax * L, y1 = f.y + f.ay * L, z1 = 0, end = 1;
  for (const o of G.map.obs) for (let k = 0.05; k < end; k += 0.03) { const x = lerp(x0, x1, k), y = lerp(y0, y1, k), z = lerp(z0, z1, k); if (z < o.h && x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.d) { end = k; if (o.kind === 'crate') hitCrate(o, 60 * dt); break; } }
  x1 = lerp(x0, x1, end); y1 = lerp(y0, y1, end); z1 = lerp(z0, z1, end);
  f.beam = [x0, y0, z0, x1, y1, z1];
  for (const t of G.F) {
    if (!alive(t) || !foes(f, t)) continue;
    const dx = x1 - x0, dy = y1 - y0, k = clamp(((t.x - x0) * dx + (t.y - y0) * dy) / (dx * dx + dy * dy || 1), 0, 1), bz = lerp(z0, z1, k);
    if (Math.hypot(x0 + dx * k - t.x, y0 + dy * k - t.y) < 16 * t.scale && bz > feet(t) - 5 && bz < feet(t) + 65 * t.scale) damage(t, 120 * dmgMult(f) * dt, f.ax, f.ay, 30, f, true);
  }
  if (end === 1 && onPlat(x1, y1)) decal(G.map, 'burn', x1, y1, 7);
  burst('spark', x1, y1, z1, 2, 250, { life: 0.3, color: '#f84', add: true, grav: 400 });
  if (Math.random() < 0.3) fx('smoke', x1, y1, z1, { vz: 40, life: 0.6, size: 5, drag: 2, color: '#555' });
  if ((f.lzT = (f.lzT || 0) - dt) <= 0) { f.lzT = 0.12; AU.play('laser', 0.6); shake(2); }
}
const hexRgb = h => { const n = parseInt(h.length === 4 ? h.slice(1).split('').map(x => x + x).join('') : h.slice(1, 7), 16); return `${n >> 16 & 255},${n >> 8 & 255},${n & 255}`; };

// ---------- items ----------
function randItem(x, y, z) {
  const r = Math.random(), pw = G.cfg.powers !== false && r >= 0.15 && r < 0.6;
  return r < 0.15 ? { kind: 'health', x, y, z, vz: 200, t: 0 } : pw ? { kind: 'power', pw: pick(Object.keys(POWERS)), x, y, z, vz: 200, t: 0 } : { kind: 'weapon', wpn: pick(DROP_POOL), x, y, z, vz: 200, t: 0 };
}
function updItems(dt) {
  const wOn = G.cfg.weapons !== false, pOn = G.cfg.powers !== false;
  if ((wOn || pOn) && (G.itemT -= dt) <= 0 && G.items.length < 7) {
    G.itemT = rnd(4, 7); const [x, y] = freeSpot(70);
    let it = pOn && !G.items.some(i => i.kind === 'power') ? { kind: 'power', pw: pick(Object.keys(POWERS)), x, y, z: 700, vz: 200, t: 0 } : randItem(x, y, 700);
    if (it.kind === 'weapon' && !wOn) it = { kind: 'health', x, y, z: 700, vz: 200, t: 0 };
    G.items.push(Object.assign(it, { drop: true }));
  }
  for (const it of G.items) {
    it.t += dt;
    if (it.z > 0 || it.vz > 0) { it.vz -= (it.drop ? 500 : 900) * dt; it.z = Math.max(0, it.z + it.vz * dt); if (it.z === 0) { if (it.drop) { fx('ring', it.x, it.y, 0, { size: 50, life: 0.35, color: '255,240,180' }); burst('smoke', it.x, it.y, 2, 6, 90, { life: 0.5, size: 7, drag: 4, color: '#999' }); } it.vz = 0; it.drop = false; } }
    if (!onPlat(it.x, it.y) && it.z <= 0) it.gone = true;
  }
  G.items = G.items.filter(i => !i.gone && i.t < 40);
}
function nearItem(f, r) { let b = null, bd = r; for (const it of G.items) { if (it.z > 20) continue; const d = Math.hypot(it.x - f.x, it.y - f.y); if (d < bd) { bd = d; b = it; } } return b; }
function takeItem(f, it) {
  it.gone = true;
  if (it.kind === 'health') { f.hp = Math.min(f.maxHp, f.hp + 45); AU.play('heal'); popText(f.x, f.y, f.z + 80, '+45 HP', '#5f8'); return; }
  if (it.kind === 'power') { // found power: yours until you die or grab another, ready right away, recharges after use
    const P = POWERS[it.pw]; f.power = it.pw; f.energy = 100; f.pwT = 0; f.beam = null; AU.play('power', 0.6);
    fx('ring', f.x, f.y, f.z, { size: 50, life: 0.4, color: hexRgb(P.color) }); popText(f.x, f.y, f.z + 85, P.name.toUpperCase(), P.color, 17); return;
  }
  if (f.wpn !== 'fists') tossWeapon(f, false);
  const w = WEAPONS[it.wpn]; f.wpn = it.wpn; f.ammo = it.ammo || w.ammo || 0; AU.play('pickup');
  if (f.ctrl.type === 'human') popText(f.x, f.y, f.z + 80, w.name.toUpperCase(), '#ffe14d', 15);
}
function pickOrThrow(f) {
  const it = nearItem(f, 40);
  if (it) return takeItem(f, it);
  if (f.wpn !== 'fists') tossWeapon(f, false, true);
}
function tossWeapon(f, empty, hard) { // throw current weapon as a spinning projectile
  const w = WEAPONS[f.wpn], sp = hard ? 850 : 400;
  if (empty || hard) G.P.push({ x: f.x, y: f.y, z: f.z + 40, vx: f.ax * sp, vy: f.ay * sp, vz: 120, kind: 'thrown', wpn: f.wpn, owner: f, team: f.team, dmg: hard ? 18 : 6, kb: hard ? 400 : 100, life: 1.2, pierce: 0, hit: new Set() });
  else G.items.push({ kind: 'weapon', wpn: f.wpn, ammo: f.ammo, x: f.x - f.ax * 20, y: f.y - f.ay * 20, z: 30, vz: 150, t: 0 });
  if (hard || empty) AU.play('throw');
  f.wpn = 'fists'; f.ammo = 0;
}

// ---------- modes ----------
function checkBrawlEnd(dt) {
  const teams = new Set(G.F.filter(f => alive(f) || f.lives > 0).map(f => f.team));
  if (!G.over && teams.size <= 1 && G.F.length > 1) {
    G.over = true; G.slowT = 1.5; const w = G.F.find(f => teams.has(f.team));
    G.winner = w; announce(w ? (G.cfg.teams ? ['RED', 'BLUE'][w.team] + ' TEAM WINS' : (w.name || 'Bot') + ' WINS!') : 'DRAW', '', w ? w.look.color : '#fff'); AU.play('ko');
  }
  if (G.over && (G.overT += dt) > 3.5 && G.overT - dt <= 3.5) UI.results();
}
function updWaves(dt) {
  const humans = G.F.filter(f => f.ctrl.type !== 'enemy');
  if (!G.over && humans.length && humans.every(f => f.dead && f.lives <= 0)) { G.over = true; G.slowT = 1.5; announce('GAME OVER', `Wave ${G.wave} · ${G.score} pts`, '#ff4d4d'); AU.play('ko'); }
  if (G.over) { if ((G.overT += dt) > 3.5 && G.overT - dt <= 3.5) UI.results(); return; }
  const enemies = G.F.filter(f => f.ctrl.type === 'enemy' && alive(f));
  if (!G.queue.length && !enemies.length) {
    if ((G.waveT -= dt) <= 0) {
      G.wave++; G.queue = WAVES[G.mode](G.wave); G.waveT = 4;
      const boss = G.queue.find(id => ENEMIES[id].boss);
      announce('WAVE ' + G.wave, boss ? '⚠ ' + ENEMIES[boss].name + ' APPROACHES ⚠' : G.queue.length + ' enemies', boss ? '#ff4d4d' : '#ffe14d'); AU.play('wave');
      if (boss) AU.music('boss');
      for (const h of humans) { if (h.dead && h.lives > 0) h.respawnT = 0; else h.hp = Math.min(h.maxHp, h.hp + 30); }
    }
    return;
  }
  if (G.queue.length && (G.spawnT -= dt) <= 0 && enemies.length < 10 + G.wave) {
    G.spawnT = rnd(0.35, 1.0) * Math.max(0.4, 1 - G.wave * 0.05);
    spawnEnemy(G.queue.shift());
  }
}
function spawnEnemy(id, at) {
  const e = ENEMIES[id], f = mkFighter({ enemy: id, team: 9, ctrl: { type: 'enemy' }, name: e.name });
  const [x, y] = at || freeSpot(60); f.x = x; f.y = y;
  if (e.fly) f.z = 300; else if (e.look?.zombie) { f.z = 0; f.inv = 0.6; burst('debris', x, y, 2, 14, 200, { grav: 900, life: 0.9, size: 4, color: '#4a3a2a' }); decal(G.map, 'splat', x, y, 18, 'rgba(40,30,20,0.6)'); AU.play('zombie', 0.6); }
  else { f.z = 650; f.inv = 1; }
  if (id === 'thug' && Math.random() < 0.55 + G.wave * 0.03) { f.wpn = pick(DROP_POOL); f.ammo = WEAPONS[f.wpn].ammo || 0; }
  if (id === 'thug') f.look = Object.assign(botLook(0), { aura: 'none', thick: 4 });
  if (e.boss) { G.boss = f; f.power = 'laser'; f.energy = 0; AU.play('roar'); shake(20); }
  return f;
}
function announce(text, sub, color = '#fff', dur = 2.4) { G.ann.push({ text, sub, color, t: 0, dur }); }

// ---------- camera ----------
function updateCam(dt) {
  let T = G.F.filter(f => alive(f) && f.ctrl.type === 'human');
  if (!T.length) T = G.F.filter(f => alive(f) && f.ctrl.type !== 'enemy');
  if (!T.length) T = G.F.filter(alive);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  if (!T.length) { const p = proj(G.map.W / 2, G.map.H / 2); x0 = x1 = p[0]; y0 = y1 = p[1]; }
  for (const f of T) { const p = proj(f.x, f.y, Math.max(f.z, -100) + 30); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const sc = Math.min(CAM.vw / 1280, CAM.vh / 720); // bigger screens zoom in proportionally instead of showing a tiny arena
  const z = clamp(Math.min(CAM.vw / (x1 - x0 + 600), CAM.vh / (y1 - y0 + 420)), 0.55 * sc, 1.25 * sc) * (G.demo ? 0.8 : 1);
  const k = Math.min(1, 3 * dt);
  CAM.x = lerp(CAM.x, (x0 + x1) / 2, k); CAM.y = lerp(CAM.y, (y0 + y1) / 2, k); CAM.zoom = lerp(CAM.zoom, z, k);
  CAM.shake *= Math.exp(-9 * dt); CAM.shx = rnd(-1, 1) * CAM.shake; CAM.shy = rnd(-1, 1) * CAM.shake;
}

// ---------- render ----------
function renderGame(c, dt) {
  if (!G.on || CAM.vw < 2 || CAM.vh < 2) return; // minimized / zero-size window
  const M = G.map, t = G.t;
  drawBackground(c, M, t);
  camApply(c);
  const [cx, cy] = proj(M.W / 2, M.H / 2), vg = c.createRadialGradient(cx, cy + 120, 50, cx, cy + 120, M.W * 1.1);
  vg.addColorStop(0, M.m.voidGlow); vg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = vg; c.fillRect(cx - M.W * 1.2, cy - M.H, M.W * 2.4, M.H * 2.2);
  const behind = f => f.z < -2 && f.y < 0;
  for (const f of G.F) if (alive(f) && behind(f)) drawFighter(c, f, t);
  c.drawImage(M.floor, -M.ox, -M.oy);
  // shadows + item glows
  for (const f of G.F) if (alive(f) && onPlat(f.x, f.y) && f.z > -5) { const [sx, sy] = proj(f.x, f.y, 0), r = 15 * f.scale * clamp(1 - f.z / 500, 0.3, 1); c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(sx, sy, r * 1.3, r * 0.55, 0, 0, 7); c.fill(); }
  for (const it of G.items) { const [sx, sy] = proj(it.x, it.y, 0); c.globalCompositeOperation = 'lighter'; c.fillStyle = it.kind === 'health' ? 'rgba(80,255,120,0.25)' : it.kind === 'power' ? `rgba(${hexRgb(POWERS[it.pw].color)},0.3)` : 'rgba(255,220,100,0.22)'; c.beginPath(); c.ellipse(sx, sy, 26 + Math.sin(t * 4) * 3, 12, 0, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over';
    if (it.drop) { c.fillStyle = 'rgba(255,240,180,0.12)'; c.fillRect(sx - 6, sy - 800, 12, 800); } }
  const list = [];
  for (const o of M.obs) list.push([o.y + o.d / 2, 0, o]);
  for (const f of G.F) if (alive(f) && !behind(f)) list.push([f.y, 1, f]);
  for (const r of G.rag) list.push([r.pts[2].y, 2, r]);
  for (const it of G.items) list.push([it.y, 3, it]);
  for (const p of G.P) list.push([p.y, 4, p]);
  list.sort((a, b) => a[0] - b[0]); // ponytail: centre-point depth sort; big overlapping props may misorder
  for (const [, k, o] of list) k === 0 ? drawObstacle(c, o, t) : k === 1 ? drawFighter(c, o, t) : k === 2 ? drawRagdoll(c, o) : k === 3 ? drawItem(c, o, t) : drawProj(c, o);
  drawFx(c, t);
  weather(c, M.m.weather, dt, t);
  if (!G.demo) drawHUD(c);
}
function drawItem(c, it, t) {
  const [sx, sy] = proj(it.x, it.y, it.z + 14 + Math.sin(t * 3 + it.x) * 4);
  c.save(); c.translate(sx, sy);
  if (it.kind === 'weapon') { c.rotate(Math.sin(t * 2 + it.y) * 0.3); c.scale(1.2, -1.2); drawWeapon(c, it.wpn, t); }
  else if (it.kind === 'health') { c.fillStyle = '#fff'; c.fillRect(-10, -10, 20, 20); c.fillStyle = '#e22'; c.fillRect(-3, -8, 6, 16); c.fillRect(-8, -3, 16, 6); }
  else { // power orb: pulsing core in the power's color with orbiting sparks
    const col = POWERS[it.pw].color, rgb = hexRgb(col), pr = 15 + Math.sin(t * 6) * 2;
    c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(0, 0, 0, 0, 0, pr * 1.6); g.addColorStop(0, '#fff'); g.addColorStop(0.35, col); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(0, 0, pr * 1.6, 0, 7); c.fill();
    c.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; c.beginPath(); c.arc(Math.cos(a) * pr, Math.sin(a) * pr * 0.5, 1.8, 0, 7); c.fill(); }
    c.globalCompositeOperation = 'source-over'; c.font = '900 13px Impact, system-ui'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = '#000'; c.strokeText(POWERS[it.pw].name, 0, -pr - 10); c.fillStyle = col; c.fillText(POWERS[it.pw].name, 0, -pr - 10);
  }
  c.restore();
  if (it.kind === 'weapon' && G.F.some(f => f.ctrl.type === 'human' && alive(f) && Math.hypot(f.x - it.x, f.y - it.y) < 90)) {
    c.font = '700 11px system-ui'; c.textAlign = 'center'; c.fillStyle = '#ffe14d'; c.fillText(WEAPONS[it.wpn].name + ' [pick]', sx, sy - 22);
  }
}
function drawFighter(c, f, t) {
  const [sx, sy] = proj(f.x, f.y, f.z), w = WEAPONS[f.wpn], s = f.scale;
  c.globalAlpha = f.inv > 0 && !f.enemy && (t * 16 | 0) % 2 ? 0.45 : 1;
  if (f.body === 'spider') drawSpider(c, sx, sy, f, t, s);
  else if (f.body === 'bat') drawBat(c, sx, sy, f, t, s);
  else {
    const P = computePose(f, t), tip = drawStick(c, sx, sy, P, f.look, s, f.face, f.wpn, f.flash > 0 ? '#fff' : null, t);
    if (w.type === 'melee' && w.trail && f.atk >= 0 && tip) { f.trail.push(tip); if (f.trail.length > 7) f.trail.shift(); } else if (f.trail.length) f.trail.shift();
    if (f.trail.length > 1) {
      c.globalCompositeOperation = 'lighter'; c.fillStyle = (w.trail || '#ffffff') + 'aa'; c.beginPath();
      f.trail.forEach((p, i) => i ? c.lineTo(p[2], p[3]) : c.moveTo(p[2], p[3]));
      for (let i = f.trail.length - 1; i >= 0; i--) c.lineTo(lerp(f.trail[i][0], f.trail[i][2], 0.45), lerp(f.trail[i][1], f.trail[i][3], 0.45));
      c.fill(); c.strokeStyle = '#ffffffcc'; c.lineWidth = 2; c.beginPath(); f.trail.forEach((p, i) => i ? c.lineTo(p[2], p[3]) : c.moveTo(p[2], p[3])); c.stroke(); c.globalCompositeOperation = 'source-over';
    }
    if (w.laserSight && f.ctrl.type !== 'enemy') { const [mx, my, mz] = muzzle(f), a = proj(mx, my, mz), b = proj(mx + f.ax * 900, my + f.ay * 900, mz); c.strokeStyle = 'rgba(255,40,40,0.35)'; c.lineWidth = 1; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  }
  c.globalAlpha = 1;
  if (f.beam) {
    const a = proj(f.beam[0], f.beam[1], f.beam[2]), b = proj(f.beam[3], f.beam[4], f.beam[5]);
    c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (const [lw, col] of [[16, 'rgba(255,0,0,0.15)'], [8, 'rgba(255,40,40,0.5)'], [3, '#fff']]) { c.strokeStyle = col; c.lineWidth = lw * (0.85 + Math.random() * 0.3); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
  }
  if (f.pwT > 0 && f.power === 'deflect') { c.globalCompositeOperation = 'lighter'; c.strokeStyle = `rgba(100,170,255,${0.5 + 0.3 * Math.sin(t * 20)})`; c.fillStyle = 'rgba(100,170,255,0.08)'; c.lineWidth = 2; c.beginPath(); c.ellipse(sx, sy - 30 * s, 34 * s, 42 * s, 0, 0, 7); c.fill(); c.stroke(); c.globalCompositeOperation = 'source-over'; }
  // tags
  if (f.enemy?.boss) return;
  const top = sy - (f.body ? 40 : 82) * s;
  if (!f.enemy || f.hp < f.maxHp) {
    const bw = f.enemy ? 26 : 40; c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(sx - bw / 2 - 1, top - 1, bw + 2, 5);
    c.fillStyle = f.hp / f.maxHp > 0.5 ? '#5f8' : f.hp / f.maxHp > 0.25 ? '#fc4' : '#f44'; c.fillRect(sx - bw / 2, top, bw * Math.max(0, f.hp / f.maxHp), 3);
  }
  if (!f.enemy) {
    c.font = '700 11px system-ui'; c.textAlign = 'center'; c.fillStyle = f.look.color; c.strokeStyle = '#000'; c.lineWidth = 3;
    const tag = f.ctrl.type === 'human' ? 'P' + (f.slot + 1) : f.name.split(' ')[0];
    c.strokeText(tag, sx, top - 5); c.fillText(tag, sx, top - 5);
    if (f.ctrl.type === 'human') { c.beginPath(); c.moveTo(sx - 5, top - 22); c.lineTo(sx + 5, top - 22); c.lineTo(sx, top - 16); c.fill(); }
  }
}

function drawHUD(c) {
  const hs = Math.max(1, Math.min(CAM.vw / 1280, CAM.vh / 720)), W = CAM.vw / hs, H = CAM.vh / hs; c.setTransform(CAM.dpr * hs, 0, 0, CAM.dpr * hs, 0, 0); // HUD grows on big screens c.textBaseline = 'alphabetic';
  if (G.warpT > 0) { c.fillStyle = 'rgba(80,255,120,0.08)'; c.fillRect(0, 0, W, H); }
  const me = G.F.filter(f => f.ctrl.type === 'human');
  if (me.some(f => alive(f) && f.hp < 30)) { const g = c.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8); g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,0,0,${0.25 + 0.1 * Math.sin(G.t * 8)})`); c.fillStyle = g; c.fillRect(0, 0, W, H); }
  // player cards
  const cards = G.F.filter(f => f.ctrl.type !== 'enemy'), cw = Math.min(210, (W - 20) / Math.max(1, cards.length) - 8);
  cards.forEach((f, i) => {
    const x = W / 2 - (cards.length * (cw + 8)) / 2 + i * (cw + 8), y = H - 74;
    c.fillStyle = 'rgba(8,8,16,0.72)'; c.fillRect(x, y, cw, 64); c.fillStyle = f.look.color; c.fillRect(x, y, 4, 64);
    c.font = '800 13px system-ui'; c.textAlign = 'left'; c.fillStyle = '#fff'; c.fillText((f.ctrl.type === 'human' ? `P${f.slot + 1} ` : '') + (f.name || '').slice(0, 16), x + 10, y + 16);
    c.textAlign = 'right'; c.fillStyle = '#ff6b6b'; c.fillText('♥'.repeat(Math.max(0, f.lives)), x + cw - 6, y + 16);
    c.fillStyle = '#222'; c.fillRect(x + 10, y + 22, cw - 20, 8); c.fillStyle = f.dead ? '#555' : '#5f8'; c.fillRect(x + 10, y + 22, (cw - 20) * Math.max(0, f.hp / f.maxHp), 8);
    const P = POWERS[f.power], full = f.energy >= 100;
    c.fillStyle = '#222'; c.fillRect(x + 10, y + 33, cw - 20, 5); c.fillStyle = f.pwT > 0 ? '#fff' : P ? P.color : '#888'; c.fillRect(x + 10, y + 33, (cw - 20) * (f.pwT > 0 ? f.pwT / (P.dur || 1) : f.energy / 100), 5);
    c.font = '600 11px system-ui'; c.textAlign = 'left'; c.fillStyle = full && f.pwT <= 0 && (G.t * 4 | 0) % 2 ? '#fff' : '#aab';
    c.fillText(P ? P.name + (full && f.pwT <= 0 ? ' READY' : '') : 'No power: grab an orb', x + 10, y + 52);
    const w = WEAPONS[f.wpn]; c.textAlign = 'right'; c.fillStyle = '#ffe14d'; c.fillText(f.dead ? (f.lives > 0 ? 'respawning…' : 'OUT') : w.name + (w.type === 'gun' ? ' ' + f.ammo : ''), x + cw - 8, y + 52);
    c.fillStyle = '#889'; c.fillText(`${f.stats.k} KO`, x + cw - 8, y + 62);
  });
  // top center
  c.textAlign = 'center';
  if (G.mode !== 'brawl') {
    c.font = '900 26px Impact, system-ui'; c.fillStyle = '#fff'; c.fillText(`WAVE ${G.wave}`, W / 2, 36);
    c.font = '700 15px system-ui'; c.fillStyle = '#ffe14d'; c.fillText(`${G.score.toLocaleString()} pts` + (G.combo > 1 ? `  ·  x${G.combo} combo` : ''), W / 2, 56);
    c.fillStyle = '#aab'; c.font = '600 12px system-ui'; c.fillText(`${G.F.filter(f => f.ctrl.type === 'enemy' && alive(f)).length + G.queue.length} enemies left`, W / 2, 72);
  }
  if (G.boss && alive(G.boss)) {
    const b = G.boss, bw = Math.min(500, W - 40); c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(W / 2 - bw / 2 - 2, 84, bw + 4, 16);
    c.fillStyle = '#c1121f'; c.fillRect(W / 2 - bw / 2, 86, bw * b.hp / b.maxHp, 12); c.font = '900 13px Impact, system-ui'; c.fillStyle = '#fff'; c.fillText(b.enemy.name, W / 2, 97);
  }
  // kill feed
  c.textAlign = 'right'; c.font = '700 12px system-ui';
  G.feed.forEach((k, i) => {
    const y = 24 + i * 20, a = Math.min(1, 6 - k.t); c.globalAlpha = a; c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(W - 280, y - 13, 270, 18);
    c.fillStyle = k.cb; c.fillText(k.b, W - 16, y); const wb = c.measureText(k.b).width;
    c.fillStyle = '#aaa'; c.fillText(` ✖ ${k.w} `, W - 16 - wb, y); const ww = c.measureText(` ✖ ${k.w} `).width;
    c.fillStyle = k.ca || '#fff'; c.fillText(k.a, W - 16 - wb - ww, y);
  });
  c.globalAlpha = 1;
  // announcements
  const a = G.ann[0];
  if (a) {
    const k = a.t / a.dur, s = k < 0.12 ? 2.4 - k / 0.12 * 1.4 : 1, al = k > 0.8 ? (1 - k) / 0.2 : 1;
    c.save(); c.globalAlpha = al; c.translate(W / 2, H * 0.36); c.scale(s, s);
    c.font = '900 64px Impact, system-ui'; c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText(a.text, 0, 0); c.fillStyle = a.color; c.fillText(a.text, 0, 0);
    if (a.sub) { c.font = '700 20px system-ui'; c.lineWidth = 4; c.strokeText(a.sub, 0, 34); c.fillStyle = '#fff'; c.fillText(a.sub, 0, 34); }
    c.restore();
  }
}
