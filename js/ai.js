// Bots and monster brains. think(f) returns the same input shape a human controller does.
'use strict';

function nearestFoe(f) {
  let b = null, bd = 1e9;
  for (const t of G.F) { if (!alive(t) || !foes(f, t) || t.z > 250) continue; const d = Math.hypot(t.x - f.x, t.y - f.y) * (t.inv > 0.5 ? 2 : 1); if (d < bd) { bd = d; b = t; } }
  return b;
}
function los(a, b) {
  for (const o of G.map.obs) { if (o.h < 30) continue; for (let k = 0.1; k < 0.95; k += 0.08) { const x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k); if (x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.d) return false; } }
  return true;
}
function enemyShot(f, T, kind, dmg) {
  const d = Math.hypot(T.x - f.x, T.y - f.y), sp = kind === 'acid' ? 420 : kind === 'fireball' ? 480 : 700;
  const tt = d / sp, a = Math.atan2(T.y + T.vy * tt * 0.6 - f.y, T.x + T.vx * tt * 0.6 - f.x) + rnd(-0.06, 0.06), z = f.z + 40 * f.scale;
  G.P.push({ x: f.x + Math.cos(a) * 20, y: f.y + Math.sin(a) * 20, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: kind === 'acid' ? 450 * tt - z / Math.max(tt, 0.1) : 0,
    kind, owner: f, team: f.team, dmg, kb: 180, life: 3, pierce: 0, radius: kind === 'fireball' ? 60 : 0, hit: new Set() });
  if (kind === 'arrow') { G.P[G.P.length - 1].z = f.z + 35 * f.scale; AU.play('throw', 0.5); } else AU.play(kind === 'acid' ? 'splat' : 'rocket', 0.5);
}
function slam(f, r, dmg, kb) {
  fx('ring', f.x, f.y, 0, { size: r, life: 0.5, color: '255,120,60' }); fx('ring', f.x, f.y, 0, { size: r * 0.6, life: 0.35, color: '255,255,255' });
  burst('debris', f.x, f.y, 5, 24, 380, { grav: 1000, life: 1.1, size: 6, color: '#665' }); decal(G.map, 'crack', f.x, f.y, r * 0.5);
  for (const t of G.F) { if (!alive(t) || !foes(f, t)) continue; const d = Math.hypot(t.x - f.x, t.y - f.y); if (d < r && t.z < 40) { damage(t, dmg, (t.x - f.x) / (d || 1), (t.y - f.y) / (d || 1), kb, f); t.vz = 450; } }
  shake(16); AU.play('slam');
}

function think(f, dt) {
  const A = f.ai || (f.ai = { t: 0, T: null, strafe: Math.random() < 0.5 ? 1 : -1, st: 1, cool: rnd(0.5, 1.5), react: 0, pat: 0, wind: 0, err: 0 });
  const e = f.enemy, kind = e ? e.ai : 'bot';
  const inp = { mx: 0, my: 0, ax: f.ax, ay: f.ay, atk: false, atkP: false, pow: false, jump: false, dash: false, pick: false };
  if (f.z > 150 && !e?.fly) return inp; // still dropping in
  if ((A.t -= dt) <= 0 || !A.T || !alive(A.T)) { A.t = 0.4; A.T = nearestFoe(f); }
  A.cool -= dt; A.slowmove = false;
  const T = A.T, diff = f.ctrl.type === 'bot' ? f.ctrl.diff : clamp(Math.floor(G.wave / 4), 0, 2);
  let gx = G.map.W / 2, gy = G.map.H / 2, d = 1e9, ux = 0, uy = 0;
  if (T) { d = Math.hypot(T.x - f.x, T.y - f.y); ux = (T.x - f.x) / (d || 1); uy = (T.y - f.y) / (d || 1); gx = T.x; gy = T.y; inp.ax = ux; inp.ay = uy; }
  let mx = ux, my = uy;

  if (kind === 'bot') {
    const w = WEAPONS[f.wpn];
    let item = null;
    if (f.wpn === 'fists' && G.cfg.weapons !== false) { let bd = 520; for (const it of G.items) { if (it.kind !== 'weapon' || it.z > 30 || !onPlat(it.x, it.y)) continue; const dd = Math.hypot(it.x - f.x, it.y - f.y); if (dd < bd) { bd = dd; item = it; } } if (item && T && bd > d * 1.3 && diff < 2) item = null; }
    if (!item && !f.power) { let bd = 450; for (const it of G.items) { if (it.kind !== 'power' || it.z > 30 || !onPlat(it.x, it.y)) continue; const dd = Math.hypot(it.x - f.x, it.y - f.y); if (dd < bd) { bd = dd; item = it; } } }
    if (!item && f.hp < 50) for (const it of G.items) if (it.kind === 'health' && Math.hypot(it.x - f.x, it.y - f.y) < 400) { item = it; break; }
    if (item) { const dd = Math.hypot(item.x - f.x, item.y - f.y); mx = (item.x - f.x) / dd; my = (item.y - f.y) / dd; }
    else if (T) {
      const want = w.type === 'gun' ? (w.shape === 'sniper' ? 450 : w.shape === 'shotgun' ? 130 : w.proj ? 300 : 250) : w.range * 0.6 * f.scale;
      const fwd = d > want + 40 ? 1 : d < want - 40 ? -1 : 0, sf = w.type === 'gun' ? 0.9 : 0.35;
      if ((A.st -= dt) <= 0) { A.st = rnd(0.7, 2); A.strafe *= -1; }
      mx = ux * fwd - uy * A.strafe * sf; my = uy * fwd + ux * A.strafe * sf;
      // aim with lead + difficulty error
      A.err = lerp(A.err, rnd(-1, 1) * [0.35, 0.15, 0.05][diff], 0.1);
      const tt = w.speed ? d / w.speed : 0, a = Math.atan2(T.y + T.vy * tt - f.y, T.x + T.vx * tt - f.x) + A.err;
      inp.ax = Math.cos(a); inp.ay = Math.sin(a); f.aimDist = d;
      A.react -= dt;
      const reach = w.type === 'gun' ? (w.shape === 'sniper' ? 1100 : w.shape === 'shotgun' ? 300 : 700) : w.range * f.scale + 14 * T.scale;
      if (d < reach && Math.abs(T.z - f.z) < 60 && (w.type !== 'gun' || los(f, T))) { if (A.react <= 0) { inp.atk = true; inp.atkP = Math.random() < [0.12, 0.35, 0.9][diff]; } }
      else A.react = [0.6, 0.3, 0.1][diff];
      if (diff > 0 && w.type === 'melee' && d > 90 && d < 230 && Math.random() < 0.008 * diff) inp.dash = true;
      const useful = { laser: d < 420, shockwave: d < 150, lightning: d < 320, blink: w.type === 'melee' ? d > 260 : d < 110, strength: d < 300, speed: true, deflect: G.P.some(p => p.team !== f.team), timewarp: d < 400, giant: d < 300, regen: f.hp < 60 };
      if (f.energy >= 100 && useful[f.power] && Math.random() < 0.02 * (diff + 1)) inp.pow = true;
    }
    if (diff > 0) for (const p of G.P) { // dodge incoming
      if (p.team === f.team) continue; const dx = f.x - p.x, dy = f.y - p.y, dd = Math.hypot(dx, dy), sp = Math.hypot(p.vx, p.vy) || 1;
      if (dd < 170 && (dx * p.vx + dy * p.vy) / (dd * sp) > 0.9 && Math.random() < [0, 0.04, 0.15][diff]) { inp.dash = true; mx = -p.vy / sp; my = p.vx / sp; break; }
    }
    if (Math.random() < 0.003) inp.jump = true;
  } else if (kind === 'melee') {
    if (d < e.range * f.scale + 14 * (T?.scale || 1)) { inp.atkP = true; mx *= 0.3; my *= 0.3; }
    if (Math.random() < 0.004) AU.play('zombie', 0.4);
  } else if (kind === 'ranged') {
    const fwd = d > e.range * 0.75 ? 1 : d < e.range * 0.45 ? -1 : 0;
    if ((A.st -= dt) <= 0) { A.st = rnd(1, 2.5); A.strafe *= -1; }
    mx = ux * fwd - uy * A.strafe * 0.6; my = uy * fwd + ux * A.strafe * 0.6;
    if (T && A.cool <= 0 && d < e.range && los(f, T)) { A.cool = e.cd * rnd(0.8, 1.3); f.atk = 0; f.atkDur = 0.35; enemyShot(f, T, e.proj, e.dmg); }
  } else if (kind === 'leaper') {
    const grounded = f.z <= 0.01;
    if (T && grounded && A.cool <= 0 && d < e.range && d > 50) { A.cool = e.cd; f.vz = 420; f.vx = ux * 560; f.vy = uy * 560; A.leap = true; AU.play('screech', 0.5); }
    if (!grounded) { mx = my = 0; }
    if (T && d < 30 * f.scale + 12 && Math.abs(T.z - f.z) < 40 && (A.bite = (A.bite || 0) - dt) <= 0) { A.bite = A.leap ? 0.4 : e.cd * 0.6; damage(T, e.dmg * (A.leap ? 1.5 : 1), ux, uy, A.leap ? 350 : 120, f); A.leap = false; }
    if (grounded) A.leap = false;
  } else if (kind === 'flyer') {
    mx += Math.sin(G.t * 3 + f.id) * 0.6; my += Math.cos(G.t * 2.3 + f.id) * 0.6;
    A.dive = d < 110 ? -25 : 0;
    if (T && d < 34 && A.cool <= 0 && Math.abs(f.z - T.z - 30) < 45) { A.cool = e.cd; damage(T, e.dmg, ux, uy, 120, f); AU.play('screech', 0.4); }
  } else if (kind === 'brute') {
    if (A.wind > 0) { A.wind -= dt; mx = my = 0; A.slowmove = true; if (Math.random() < 0.3) burst('spark', f.x, f.y, f.z + 60 * f.scale, 2, 150, { color: '#f84', add: true, life: 0.3 }); if (A.wind <= 0) { slam(f, 170, e.dmg, 750); f.atk = -1; } }
    else if (T && d < e.range * 1.3 && A.cool <= 0) { A.cool = e.cd; A.wind = 0.55; f.atk = 0; f.atkDur = 0.6; f.vz = 300; AU.play('roar', 0.5); }
  } else if (kind === 'boss') {
    if (A.wind > 0) { A.wind -= dt; mx = my = 0; if (A.wind <= 0) slam(f, 260, e.dmg, 900); }
    else if (T && A.cool <= 0) {
      A.cool = e.cd + rnd(0, 1); const pat = A.pat++ % 4;
      if (pat === 0 || d < 170) { A.wind = 0.7; f.vz = 450; AU.play('roar', 0.7); }
      else if (pat === 1) { for (let i = -2; i <= 2; i++) { const a = Math.atan2(uy, ux) + i * 0.22, fake = { x: f.x + Math.cos(a) * d, y: f.y + Math.sin(a) * d, vx: 0, vy: 0 }; enemyShot(f, fake, 'fireball', 22); } }
      else if (pat === 2) { f.pwT = 2.4; f.power = 'laser'; AU.play('power'); }
      else if (e.summons) { for (let i = 0; i < 4; i++) spawnEnemy(pick(['zombie', 'runner', 'skeleton']), [clamp(f.x + rnd(-150, 150), 40, G.map.W - 40), clamp(f.y + rnd(-150, 150), 40, G.map.H - 40)]); AU.play('roar'); }
      else { f.vx = ux * 900; f.vy = uy * 900; f.dash = 0.35; AU.play('dash'); }
    }
    if (f.pwT > 0) { f.aimDist = d; const a = Math.atan2(f.ay, f.ax), b = Math.atan2(uy, ux), da = Math.atan2(Math.sin(b - a), Math.cos(b - a)); inp.ax = Math.cos(a + clamp(da, -1.5 * dt, 1.5 * dt)); inp.ay = Math.sin(a + clamp(da, -1.5 * dt, 1.5 * dt)); mx = my = 0; }
    if (T && d < 50 * f.scale && (A.bite = (A.bite || 0) - dt) <= 0) { A.bite = 0.6; damage(T, 12, ux, uy, 260, f); }
    if (d < 140) { mx *= 0.2; my *= 0.2; }
  }
  // walk around props: if the way ahead is blocked, slide along it (side sticks until clear)
  const ml = Math.hypot(mx, my), r = 16 * f.scale;
  const blocked = (x, y) => G.map.obs.some(o => f.z < o.h - 5 && x > o.x - r && x < o.x + o.w + r && y > o.y - r && y < o.y + o.d + r);
  if (ml > 0.1 && !e?.fly && blocked(f.x + mx / ml * 34, f.y + my / ml * 34)) { const s = A.side || (A.side = A.strafe); [mx, my] = [-my * s, mx * s]; }
  else A.side = 0;
  // stay on the platform: steer away from edges, never step off
  const { W, H } = G.map, m = 100;
  if (!e?.fly) {
    if (f.x < m) mx += 1.5; if (f.x > W - m) mx -= 1.5; if (f.y < m) my += 1.5; if (f.y > H - m) my -= 1.5;
    if (!onPlat(f.x + mx * 40, f.y)) mx = 0; if (!onPlat(f.x, f.y + my * 40)) my = 0;
  }
  // unstick: if trying to move but not moving, hop
  const l = Math.hypot(mx, my);
  if (l > 0.3 && f.spd < 0.1 && f.z <= 0.01 && kind !== 'boss') { A.stuck = (A.stuck || 0) + dt; if (A.stuck > 0.4) { inp.jump = true; A.stuck = 0; A.strafe *= -1; } }
  if (l > 1) { mx /= l; my /= l; }
  inp.mx = mx; inp.my = my;
  if (A.slowmove) f.ai.slowmove = true;
  return inp;
}
