// Procedural stickman: pose from state (IK limbs), drawing with cosmetics, weapons, monster bodies, ragdolls.
'use strict';

const LIMB = { thigh: 13, shin: 13, torso: 21, neck: 9, up: 11, fore: 11 };
const pol = (o, a, r) => [o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r];
function ik(a, b, l1, l2, bend) { // two-bone IK -> [mid, end]
  let dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
  const mx = l1 + l2 - 0.01;
  if (d > mx) { b = [a[0] + dx / d * mx, a[1] + dy / d * mx]; d = mx; }
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * Math.max(d, 0.001)), -1, 1);
  return [pol(a, ang + bend * Math.acos(c), l1), b];
}
const easeOut = x => 1 - (1 - x) * (1 - x);
const swingAng = (q, a0, a1) => q < 0.15 ? a0 + 0.35 * (q / 0.15) : q < 0.45 ? lerp(a0 + 0.35, a1, easeOut((q - 0.15) / 0.3)) : lerp(a1, lerp(a0, a1, 0.6), (q - 0.45) / 0.55);

// f: { walk, spd, z, atk, atkDur, atkN, hurt, dash, aim, face, wpn, recoil, look }
function computePose(f, t) {
  const w = WEAPONS[f.wpn] || WEAPONS.fists, mv = f.spd || 0, ph = f.walk || 0, air = f.z > 1.5, lk = f.look || {};
  let aimL = f.face > 0 ? f.aim : Math.PI - f.aim; aimL = Math.atan2(Math.sin(aimL), Math.cos(aimL));
  let lean = 0, bob = Math.sin(t * 3) * 0.8;
  if (mv > 0.05 && !air) { bob = Math.abs(Math.sin(ph)) * 2.2 * mv; lean = 3.5 * mv; }
  if (lk.zombie) lean += 5;
  if (f.dash > 0) lean = 10;
  if (f.hurt > 0) lean = -7 * f.hurt / 0.3;
  else { const qa = f.atk >= 0 ? clamp(f.atk / f.atkDur, 0, 1) : -1; if (qa >= 0 && w.type !== 'gun') lean += 8 * Math.sin(qa * Math.PI); lean -= (f.recoil || 0) * 0.6; }
  const hip = [0, 25 + bob], neck = [hip[0] + lean, hip[1] + LIMB.torso], head = [neck[0] + lean * 0.25, neck[1] + LIMB.neck], sh = [neck[0], neck[1] - 3];
  let fL, fR;
  if (air) { fL = [-4, hip[1] - 19]; fR = [7, hip[1] - 15]; }
  else if (f.dash > 0) { fL = [-14, 0]; fR = [12, 2]; }
  else if (mv > 0.05) { fL = [Math.sin(ph) * 14 * mv, Math.max(0, Math.cos(ph)) * 8 * mv]; fR = [Math.sin(ph + Math.PI) * 14 * mv, Math.max(0, Math.cos(ph + Math.PI)) * 8 * mv]; }
  else { fL = [-5, 0]; fR = [6, 0]; }
  const [kL, fL2] = ik(hip, fL, LIMB.thigh, LIMB.shin, 1), [kR, fR2] = ik(hip, fR, LIMB.thigh, LIMB.shin, 1);
  const sw = Math.sin(ph) * 0.8 * mv;
  let hL = pol(sh, -Math.PI / 2 - sw - 0.2, 20), hR = pol(sh, -Math.PI / 2 + sw + 0.2, 20), wa = 1.0;
  const q = f.atk >= 0 ? clamp(f.atk / f.atkDur, 0, 1) : -1;
  if (f.hurt > 0) { hL = pol(sh, 2.3, 19); hR = pol(sh, 1.3, 19); }
  else if (lk.zombie && w === WEAPONS.fists) {
    const s = Math.sin(t * 4) * 0.12, claw = q >= 0 ? Math.sin(q * Math.PI) * 0.9 : 0;
    hL = pol(sh, 0.15 + s - claw, 20); hR = pol(sh, -0.05 - s - claw * 0.6, 20);
  } else if (w.type === 'gun') {
    const r = f.recoil || 0;
    hR = pol(sh, aimL, 19 - r); hL = w.shape === 'pistol' || w.thrown ? pol(sh, aimL - 0.25, 15 - r) : pol(sh, aimL - 0.1, 11 - r * 0.5);
    wa = aimL + r * 0.03;
    if (w.thrown && q >= 0) { const a = swingAng(q, aimL + 2.4, aimL - 0.3); hR = pol(sh, a, 19); wa = a; }
  } else if (q >= 0) {
    const ext = q < 0.35 ? q / 0.35 : Math.max(0, 1 - (q - 0.35) / 0.65), side = (f.atkN || 0) % 2;
    if (w.style === 'punch' || w.style === 'stab') {
      const hit = pol(sh, aimL, 6 + 16 * ext), guard = pol(sh, aimL + 0.9, 10);
      if (side && (w.style === 'punch' || w.dual)) { hL = hit; hR = guard; } else { hR = hit; hL = guard; }
      wa = aimL;
    } else {
      const [a0, a1] = w.style === 'overhead' ? [aimL + 2.8, aimL - 0.9] : w.style === 'smash' ? [aimL + 2.3, aimL - 1.1] : side ? [aimL - 1.6, aimL + 1.7] : [aimL + 1.9, aimL - 1.7];
      wa = swingAng(q, a0, a1); hR = pol(sh, wa, 16); hL = pol(hR, wa + Math.PI, 4);
    }
  } else if (w !== WEAPONS.fists) {
    const hold = w.style === 'stab' ? -0.3 : 0.9;
    wa = lerp(hold, aimL, 0.25); hR = pol(sh, -0.9, 15); if (w.style !== 'stab') hL = pol(hR, wa + Math.PI, 4);
  } else if (f.dash > 0) { hL = pol(sh, -2.6, 19); hR = pol(sh, -2.4, 19); }
  const [eL, hL2] = ik(sh, hL, LIMB.up, LIMB.fore, -1), [eR, hR2] = ik(sh, hR, LIMB.up, LIMB.fore, -1);
  return { hip, neck, head, sh, eL, hL: hL2, eR, hR: hR2, kL, fL: fL2, kR, fR: fR2, wa, aimL };
}

function lum(hex) { const n = parseInt(hex.slice(1, 7), 16); return (0.3 * (n >> 16 & 255) + 0.59 * (n >> 8 & 255) + 0.11 * (n & 255)) / 255; }

// draws in a local frame: x forward, y up. Returns screen [handX, handY, tipX, tipY] for swing trails.
function drawStick(c, sx, sy, P, lk, scale, face, wpn, tint, t = performance.now() / 1000, fat) {
  const col = tint || lk.color || '#fff', th = lk.thick || 4, w = wpn && WEAPONS[wpn];
  c.save(); c.translate(sx, sy); c.scale(face * scale, -scale); c.lineCap = 'round'; c.lineJoin = 'round';
  const seg = (...pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); };
  // aura
  if (!tint && lk.aura && lk.aura !== 'none') drawAura(c, P, lk.aura, t);
  // back accessory
  c.strokeStyle = col; c.fillStyle = col; c.lineWidth = th;
  const nb = P.neck, hb = P.hip;
  if (!tint) {
    if (lk.back === 'cape') { c.fillStyle = shade(col, 0.55); c.beginPath(); c.moveTo(nb[0], nb[1]); const fl = Math.sin(t * 6) * 3; c.quadraticCurveTo(nb[0] - 14, hb[1], nb[0] - 16 + fl, hb[1] - 10); c.lineTo(hb[0] - 4, hb[1] - 6); c.closePath(); c.fill(); }
    else if (lk.back === 'scarf') { c.strokeStyle = '#e33'; c.lineWidth = 3; const fl = Math.sin(t * 9); seg([nb[0], nb[1] - 1], [nb[0] - 9, nb[1] - 1 + fl * 2], [nb[0] - 18, nb[1] - 3 + fl * 4]); }
    else if (lk.back === 'wings') { c.fillStyle = shade(col, 0.7); c.globalAlpha = 0.8; const fl = Math.sin(t * 5) * 0.3; for (const s of [1, 0.7]) { c.beginPath(); c.moveTo(nb[0] - 2, nb[1] - 4); c.lineTo(nb[0] - 26 * s, nb[1] + 14 + fl * 20); c.lineTo(nb[0] - 20 * s, nb[1] - 2); c.lineTo(nb[0] - 22 * s, nb[1] - 12); c.closePath(); c.fill(); } c.globalAlpha = 1; }
    else if (lk.back === 'jetpack') { c.fillStyle = '#666'; c.fillRect(nb[0] - 11, nb[1] - 16, 7, 14); c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,${150 + Math.random() * 100 | 0},40,0.9)`; c.beginPath(); c.moveTo(nb[0] - 11, nb[1] - 16); c.lineTo(nb[0] - 7.5, nb[1] - 24 - Math.random() * 6); c.lineTo(nb[0] - 4, nb[1] - 16); c.fill(); c.globalCompositeOperation = 'source-over'; }
    else if (lk.back === 'backpack') { c.strokeStyle = 'rgba(12,10,24,0.85)'; c.lineWidth = 1; c.fillStyle = '#d9822b'; c.beginPath(); c.roundRect(nb[0] - 13, nb[1] - 17, 9, 14, 2.5); c.fill(); c.stroke(); c.fillStyle = '#b5651d'; c.beginPath(); c.rect(nb[0] - 13, nb[1] - 9, 9, 3); c.fill(); c.stroke(); }
    else if (lk.back === 'guitar') { c.strokeStyle = '#3a2410'; c.lineWidth = 2.2; seg([hb[0] - 8, hb[1] + 4], [nb[0] - 2, nb[1] + 13]); c.fillStyle = '#b5542a'; c.strokeStyle = 'rgba(12,10,24,0.85)'; c.lineWidth = 1; c.beginPath(); c.ellipse(hb[0] - 8, hb[1] + 3, 6.5, 5.5, 0.6, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#2a1a0a'; c.beginPath(); c.arc(hb[0] - 7, hb[1] + 4, 1.6, 0, 7); c.fill(); }
    else if (lk.back === 'shield') { c.strokeStyle = 'rgba(12,10,24,0.85)'; c.lineWidth = 1; c.fillStyle = '#8a8f99'; c.beginPath(); c.arc(nb[0] - 10, nb[1] - 9, 8.5, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#c92a2a'; c.beginPath(); c.arc(nb[0] - 10, nb[1] - 9, 6, 0, 7); c.fill(); c.fillStyle = '#ffc93c'; c.beginPath(); c.arc(nb[0] - 10, nb[1] - 9, 2.2, 0, 7); c.fill(); c.stroke(); }
    else if (lk.back === 'quiver') { c.strokeStyle = '#6b4220'; c.lineWidth = 5; seg([nb[0] - 12, nb[1] - 14], [nb[0] - 5, nb[1] + 2]); c.strokeStyle = '#e8e2cf'; c.lineWidth = 1; for (const o of [-2, 0, 2]) seg([nb[0] - 5 + o, nb[1] + 2], [nb[0] - 3 + o, nb[1] + 9]); c.fillStyle = '#e03131'; for (const o of [-2, 0, 2]) c.fillRect(nb[0] - 4 + o, nb[1] + 7, 1.6, 3); }
    else if (lk.back === 'batwings') { c.fillStyle = '#2b1d33'; c.strokeStyle = '#120a18'; c.lineWidth = 1; const fl = Math.sin(t * 7) * 6; c.beginPath(); c.moveTo(nb[0] - 2, nb[1] - 3); c.lineTo(nb[0] - 30, nb[1] + 12 + fl); c.quadraticCurveTo(nb[0] - 25, nb[1] + 2 + fl, nb[0] - 22, nb[1] - 4 + fl * 0.5); c.quadraticCurveTo(nb[0] - 17, nb[1] - 1, nb[0] - 14, nb[1] - 10); c.quadraticCurveTo(nb[0] - 9, nb[1] - 6, nb[0] - 5, nb[1] - 12); c.closePath(); c.fill(); c.stroke(); }
    else if (lk.back === 'katana') { c.strokeStyle = '#222'; c.lineWidth = 3; seg([nb[0] - 12, nb[1] + 4], [hb[0] + 8, hb[1] - 8]); }
  }
  c.strokeStyle = col; c.lineWidth = th;
  const back = tint ? col : shade(col, 0.72);
  if (!tint) { c.strokeStyle = 'rgba(8,6,16,0.6)'; c.lineWidth = th + 2.6; seg(P.hip, P.kL, P.fL); seg(P.sh, P.eL, P.hL); seg(P.hip, P.neck); seg(P.hip, P.kR, P.fR); c.lineWidth = th; }
  c.strokeStyle = back; seg(P.hip, P.kL, P.fL); seg(P.sh, P.eL, P.hL);
  c.strokeStyle = col;
  if (fat || lk.fat) { c.fillStyle = col; c.beginPath(); c.ellipse((P.hip[0] + P.neck[0]) / 2 + 3, (P.hip[1] + P.neck[1]) / 2, 10, 13, 0, 0, 7); c.fill(); }
  seg(P.hip, P.neck); seg(P.hip, P.kR, P.fR);
  drawHead(c, P.head, lk, col, th, tint, t);
  let tip = null;
  if (w && w.shape) {
    c.save(); c.translate(P.hR[0], P.hR[1]); c.rotate(P.wa); drawWeapon(c, wpn, t); c.restore();
    if (w.dual) { c.save(); c.translate(P.hL[0], P.hL[1]); c.rotate(P.wa); drawWeapon(c, wpn, t); c.restore(); }
    const L = (w.len || 20) + 4; tip = [P.hR[0] + Math.cos(P.wa) * L, P.hR[1] + Math.sin(P.wa) * L];
  }
  if (!tint) { c.strokeStyle = 'rgba(8,6,16,0.6)'; c.lineWidth = th + 2.6; seg(P.sh, P.eR, P.hR); }
  c.strokeStyle = col; c.lineWidth = th; seg(P.sh, P.eR, P.hR);
  c.restore();
  return tip ? [sx + P.hR[0] * face * scale, sy - P.hR[1] * scale, sx + tip[0] * face * scale, sy - tip[1] * scale] : null;
}

function drawHead(c, h, lk, col, th, tint, t) {
  const r = 7.5, [x, y] = h;
  if (lk.head === 'pumpkin' && !tint) col = '#ff8c1a';
  if (lk.head === 'skull' && !tint) col = '#ece6d6'; // bone, whatever the body color // a pumpkin is always orange; eyes/outlines below adapt to it
  c.fillStyle = col; c.beginPath();
  switch (lk.head) {
    case 'square': c.rect(x - r, y - r, r * 2, r * 2); break;
    case 'triangle': c.moveTo(x - r * 1.1, y - r * 0.8); c.lineTo(x + r * 1.1, y - r * 0.8); c.lineTo(x, y + r * 1.2); c.closePath(); break;
    case 'diamond': c.moveTo(x, y + r * 1.25); c.lineTo(x + r, y); c.lineTo(x, y - r * 1.25); c.lineTo(x - r, y); c.closePath(); break;
    case 'skull': c.arc(x - 0.5, y + 1, r, 0, 7); c.roundRect(x - 2, y - r - 1.8, 9, 7, 2.2); break; // cranium + jaw facing forward
    case 'hex': for (let i = 0; i < 6; i++) c.lineTo(x + Math.cos(i * Math.PI / 3) * r * 1.05, y + Math.sin(i * Math.PI / 3) * r * 1.05); c.closePath(); break;
    case 'pumpkin': c.ellipse(x, y, r * 1.12, r * 0.95, 0, 0, 7); break;
    default: c.arc(x, y, r, 0, 7);
  }
  if (!tint) { c.strokeStyle = 'rgba(8,6,16,0.6)'; c.lineWidth = 2.6; c.stroke(); }
  c.fill();
  if (lk.head === 'pumpkin' && !tint) { c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.9; c.beginPath(); for (const o of [-3.5, 0, 3.5]) c.ellipse(x + o, y, 2.6, r * 0.9, 0, 0, 7); c.stroke(); c.fillStyle = '#2f9e44'; c.fillRect(x - 1, y + r * 0.9, 2, 3.2); }
  // outline that reads on any body color: dark on light bodies, light on very dark ones
  const OL = lum(col) < 0.22 ? 'rgba(255,255,255,0.75)' : 'rgba(12,10,24,0.85)';
  if (lk.head === 'skull' && !tint) {
    const hole = '#1b1420';
    c.fillStyle = hole; c.beginPath(); c.ellipse(x + 1.2, y + 0.6, 2.1, 2.5, -0.15, 0, 7); c.ellipse(x + 5.4, y + 0.6, 1.7, 2.3, 0.15, 0, 7); c.fill(); // eye sockets
    c.beginPath(); c.moveTo(x + 3.4, y - 1.6); c.lineTo(x + 5, y - 1.6); c.lineTo(x + 4.2, y - 3.8); c.closePath(); c.fill(); // nose
    c.strokeStyle = hole; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x - 0.5, y - 5.7); c.lineTo(x + 6.6, y - 5.7); // teeth
    for (let i = 0; i < 5; i++) { c.moveTo(x + 0.4 + i * 1.5, y - 4.4); c.lineTo(x + 0.4 + i * 1.5, y - 7); } c.stroke();
    c.lineWidth = 0.7; c.beginPath(); c.moveTo(x - 4, y + 6.4); c.lineTo(x - 2.6, y + 4.6); c.lineTo(x - 3.6, y + 3.4); c.lineTo(x - 2.2, y + 1.8); c.stroke(); // crack
    if (lk.eyes === 'glow') { c.globalCompositeOperation = 'lighter'; c.fillStyle = '#ff3030'; c.beginPath(); c.arc(x + 1.4, y + 0.6, 1.1, 0, 7); c.arc(x + 5.4, y + 0.6, 1, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,40,40,0.35)'; c.beginPath(); c.arc(x + 1.4, y + 0.6, 3, 0, 7); c.arc(x + 5.4, y + 0.6, 2.8, 0, 7); c.fill(); c.globalCompositeOperation = 'source-over'; }
  }
  if (tint) return;
  const ink = lum(col) > 0.45 ? '#111' : '#fff', ex = x + 1.5; // both eyes stay inside the head
  c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = 1.6;
  if (lk.head !== 'skull') switch (lk.eyes) { // a skull has sockets instead of eyes
    case 'angry':
      c.beginPath(); c.arc(ex, y + 1, 1.3, 0, 7); c.arc(ex + 4, y + 1, 1.3, 0, 7); c.fill();
      c.lineWidth = 2.2; c.beginPath(); c.moveTo(ex - 2, y + 5); c.lineTo(ex + 1.5, y + 3); c.moveTo(ex + 2.5, y + 3); c.lineTo(ex + 6, y + 5); c.stroke(); break;
    case 'visor': c.fillStyle = '#0ff'; c.strokeStyle = OL; c.lineWidth = 0.8; c.beginPath(); c.rect(ex - 3, y, 9.5, 3.5); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.fillRect(ex - 1.5, y + 2.2, 3, 0.8); break;
    case 'x': c.beginPath(); for (const o of [0, 4]) { c.moveTo(ex - 1.2 + o, y); c.lineTo(ex + 1.2 + o, y + 3); c.moveTo(ex + 1.2 + o, y); c.lineTo(ex - 1.2 + o, y + 3); } c.stroke(); break;
    case 'cyclops': c.fillStyle = '#fff'; c.strokeStyle = OL; c.lineWidth = 0.8; c.beginPath(); c.arc(ex + 2, y + 1.5, 3.2, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#000'; c.beginPath(); c.arc(ex + 3, y + 1.5, 1.5, 0, 7); c.fill(); break;
    case 'shades': c.fillStyle = '#000'; c.fillRect(ex - 2.5, y + 0.5, 4, 3); c.fillRect(ex + 2.5, y + 0.5, 4, 3); c.fillRect(ex - 4, y + 2.6, 10.5, 1); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(ex - 1.8, y + 2.4, 1.2, 0.7); c.fillRect(ex + 3.2, y + 2.4, 1.2, 0.7); break;
    case 'glow':
      c.fillStyle = '#1a0006'; for (const o of [0, 4]) { c.beginPath(); c.arc(ex + o, y + 1.5, 1.9, 0, 7); c.fill(); }
      c.fillStyle = '#ff2a2a'; for (const o of [0, 4]) { c.beginPath(); c.arc(ex + o, y + 1.5, 1.2, 0, 7); c.fill(); }
      c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,40,40,0.35)'; for (const o of [0, 4]) { c.beginPath(); c.arc(ex + o, y + 1.5, 3.2, 0, 7); c.fill(); }
      c.globalCompositeOperation = 'source-over'; break;
    case 'wink': c.beginPath(); c.arc(ex, y + 1.5, 1.4, 0, 7); c.fill(); c.lineWidth = 1.3; c.beginPath(); c.arc(ex + 4, y + 2.3, 1.6, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); break;
    case 'hearts': c.fillStyle = '#ff2b5e'; for (const o of [0, 4.2]) { const hx = ex + o, hy = y + 1; c.beginPath(); c.moveTo(hx, hy - 1.6); c.bezierCurveTo(hx - 2.6, hy + 0.2, hx - 1.2, hy + 2.6, hx, hy + 1.2); c.bezierCurveTo(hx + 1.2, hy + 2.6, hx + 2.6, hy + 0.2, hx, hy - 1.6); c.fill(); } break;
    case 'sleepy': c.lineWidth = 1.3; c.beginPath(); for (const o of [0, 4]) { c.moveTo(ex - 1.5 + o, y + 1.5); c.lineTo(ex + 1.5 + o, y + 1.5); } c.stroke(); c.globalAlpha = 0.6; c.fillRect(ex - 1.6, y + 1.5, 3.2, 0.9); c.fillRect(ex + 2.4, y + 1.5, 3.2, 0.9); c.globalAlpha = 1; break;
    case 'stars': c.fillStyle = '#ffd23f'; c.strokeStyle = OL; c.lineWidth = 0.5; for (const o of [0, 4.3]) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? 0.9 : 2.2; c.lineTo(ex + o + Math.cos(a) * rr, y + 1.5 + Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); } break;
    case 'monocle': c.beginPath(); c.arc(ex, y + 1.5, 1.3, 0, 7); c.arc(ex + 4, y + 1.5, 1.3, 0, 7); c.fill(); c.strokeStyle = '#ffc93c'; c.lineWidth = 0.9; c.beginPath(); c.arc(ex + 4, y + 1.5, 2.8, 0, 7); c.stroke(); c.beginPath(); c.moveTo(ex + 4, y - 1.3); c.quadraticCurveTo(ex + 3, y - 5, ex - 1, y - 6); c.stroke(); break;
    default: c.beginPath(); c.arc(ex, y + 1.5, 1.4, 0, 7); c.arc(ex + 4, y + 1.5, 1.4, 0, 7); c.fill();
  }
  // hats: every shape is filled then outlined so it never blends into the body
  const top = y + (lk.head === 'diamond' ? r * 1.15 : lk.head === 'triangle' ? r * 0.9 : r);
  c.strokeStyle = OL; c.lineWidth = 1;
  const F = (fill, draw) => { c.fillStyle = fill; c.beginPath(); draw(); c.fill(); c.stroke(); };
  switch (lk.hat) {
    case 'cap': F('#e03131', () => { c.arc(x, top - 2.5, r, 0, Math.PI); c.closePath(); }); F('#b81f1f', () => c.rect(x + 2, top - 3.5, 11, 2.6)); F('#fff', () => c.arc(x, top + 4.4, 1, 0, 7)); break;
    case 'tophat': F('#16161c', () => c.rect(x - 9.5, top - 1.5, 19, 2.8)); F('#16161c', () => c.rect(x - 6, top, 12, 13)); c.fillStyle = '#c92a2a'; c.fillRect(x - 6, top + 1.2, 12, 2.6); break;
    case 'crown': F('#ffc93c', () => { c.moveTo(x - 7, top - 1.5); c.lineTo(x - 7.5, top + 7); c.lineTo(x - 3.5, top + 3); c.lineTo(x, top + 8.5); c.lineTo(x + 3.5, top + 3); c.lineTo(x + 7.5, top + 7); c.lineTo(x + 7, top - 1.5); c.closePath(); });
      c.fillStyle = '#e03131'; c.beginPath(); c.arc(x, top + 1.2, 1.3, 0, 7); c.fill(); c.fillStyle = '#3ad7ff'; c.beginPath(); c.arc(x - 4, top + 1.2, 1, 0, 7); c.arc(x + 4, top + 1.2, 1, 0, 7); c.fill(); break;
    case 'horns': for (const s of [-1, 1]) F('#f1e6c8', () => { c.moveTo(x + s * 1.5, top - 3); c.quadraticCurveTo(x + s * 15, top - 3, x + s * 12, top + 12); c.quadraticCurveTo(x + s * 6, top + 3, x + s * 8, top - 3.5); c.closePath(); }); break;
    case 'halo': c.globalCompositeOperation = 'lighter'; c.strokeStyle = 'rgba(255,220,90,0.45)'; c.lineWidth = 4; c.beginPath(); c.ellipse(x, top + 6 + Math.sin(t * 3), 8.5, 2.6, 0, 0, 7); c.stroke();
      c.strokeStyle = '#fff2a8'; c.lineWidth = 1.6; c.stroke(); c.globalCompositeOperation = 'source-over'; break;
    case 'headband': F('#e03131', () => c.rect(x - r, y + 3, r * 2, 2.8)); c.strokeStyle = '#e03131'; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x - r, y + 4.4); c.lineTo(x - r - 7, y + 2 + Math.sin(t * 10) * 2); c.moveTo(x - r, y + 4.4); c.lineTo(x - r - 6, y - 1 + Math.sin(t * 10 + 1) * 2); c.stroke(); break;
    case 'wizard': F('#4b2bbf', () => { c.moveTo(x - 6.5, top - 2); c.lineTo(x + 6.5, top - 2); c.lineTo(x - 4, top + 19); c.closePath(); }); F('#3a1f99', () => c.ellipse(x, top - 2, 11, 2.4, 0, 0, 7));
      c.fillStyle = '#ffd23f'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? 1 : 2.3; c.lineTo(x - 0.5 + Math.cos(a) * rr, top + 6 + Math.sin(a) * rr); } c.fill(); break;
    case 'viking': for (const s of [-1, 1]) F('#f1e6c8', () => { c.moveTo(x + s * 4.5, top - 1.5); c.quadraticCurveTo(x + s * 16, top - 1, x + s * 14, top + 11); c.quadraticCurveTo(x + s * 8.5, top + 3, x + s * 9.5, top - 2.5); c.closePath(); });
      F('#9aa3ad', () => { c.arc(x, top - 3, r + 0.6, 0, Math.PI); c.closePath(); }); F('#6b7480', () => c.rect(x - r - 0.6, top - 4, (r + 0.6) * 2, 2.4)); break;
    case 'ninja': F('#16161c', () => c.rect(x - r, y - 1.5, r * 2, 2.6)); F('#16161c', () => c.rect(x - r - 0.3, y + 4.6, r * 2 + 0.6, 3.2)); c.strokeStyle = '#16161c'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x - r, y + 6); c.lineTo(x - r - 6, y + 4 + Math.sin(t * 9) * 2); c.stroke(); break;
    case 'cowboy': F('#8a5a2b', () => c.ellipse(x, top - 1, 13.5, 2.8, 0, 0, 7)); F('#8a5a2b', () => { c.moveTo(x - 6, top - 1); c.lineTo(x - 5.5, top + 8); c.lineTo(x, top + 6.5); c.lineTo(x + 5.5, top + 8); c.lineTo(x + 6, top - 1); c.closePath(); }); c.fillStyle = '#4a2f15'; c.fillRect(x - 6, top + 0.3, 12, 1.8); break;
    case 'beanie': F('#2f9e44', () => { c.arc(x, top - 3, r + 0.6, 0, Math.PI); c.closePath(); }); F('#237a34', () => c.rect(x - r - 0.6, top - 4.5, (r + 0.6) * 2, 3)); F('#fff', () => c.arc(x, top + 5.3, 2.2, 0, 7)); break;
    case 'pirate': F('#16161c', () => { c.moveTo(x - 12, top - 1); c.quadraticCurveTo(x - 6, top + 1, x - 4, top + 8); c.quadraticCurveTo(x, top + 10, x + 4, top + 8); c.quadraticCurveTo(x + 6, top + 1, x + 12, top - 1); c.quadraticCurveTo(x, top - 3, x - 12, top - 1); c.closePath(); });
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, top + 4, 1.6, 0, 7); c.fill(); c.fillRect(x - 1.8, top + 1.6, 3.6, 1); break;
    case 'chef': F('#ffffff', () => c.rect(x - 6, top - 1.5, 12, 6)); F('#ffffff', () => { c.arc(x - 4.5, top + 6.5, 3.8, 0, 7); }); F('#ffffff', () => { c.arc(x + 4.5, top + 6.5, 3.8, 0, 7); }); F('#ffffff', () => { c.arc(x, top + 8.5, 4.5, 0, 7); }); break;
    case 'santa': { const sw = Math.sin(t * 3) * 1.5; F('#e03131', () => { c.moveTo(x - 7.5, top); c.quadraticCurveTo(x - 6, top + 10, x - 12 + sw, top + 12); c.quadraticCurveTo(x + 2, top + 13, x + 7.5, top); c.closePath(); });
      F('#ffffff', () => c.roundRect(x - 8.5, top - 2.5, 17, 3.8, 1.9)); F('#ffffff', () => c.arc(x - 12 + sw, top + 12, 2.4, 0, 7)); break; }
    case 'propeller': F('#ffd23f', () => { c.arc(x, top - 3, r + 0.5, 0, Math.PI / 2); c.lineTo(x, top - 3); c.closePath(); }); F('#3ad7ff', () => { c.arc(x, top - 3, r + 0.5, Math.PI / 2, Math.PI); c.lineTo(x, top - 3); c.closePath(); });
      c.strokeStyle = OL; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, top + 4.5); c.lineTo(x, top + 7.5); c.stroke(); c.lineWidth = 1;
      { const w = Math.cos(t * 25) * 8; F('#e03131', () => c.ellipse(x, top + 8, Math.abs(w) + 0.6, 1.4, 0, 0, 7)); } break;
    case 'bunny': for (const [o, a] of [[-2.5, 0.18], [2.5, -0.12]]) { F('#ffffff', () => c.ellipse(x + o, top + 9, 2.4, 8, a, 0, 7)); c.fillStyle = '#ffa8c5'; c.beginPath(); c.ellipse(x + o, top + 9, 1, 5.5, a, 0, 7); c.fill(); } break;
    case 'cat': for (const s of [-1, 1]) { F(col, () => { c.moveTo(x + s * 2, top - 1.5); c.lineTo(x + s * 6.5, top + 6.5); c.lineTo(x + s * 7.5, top - 3.5); c.closePath(); }); c.fillStyle = '#ffa8c5'; c.beginPath(); c.moveTo(x + s * 3.8, top - 1); c.lineTo(x + s * 6.3, top + 3.8); c.lineTo(x + s * 6.8, top - 1.8); c.fill(); } break;
    case 'party': F('#ae3ec9', () => { c.moveTo(x - 6, top - 1.5); c.lineTo(x + 6, top - 1.5); c.lineTo(x + 1, top + 14); c.closePath(); });
      c.save(); c.clip(); c.fillStyle = '#ffd23f'; for (let i = 0; i < 4; i++) c.fillRect(x - 8, top + i * 4, 16, 1.6); c.restore(); F('#3ad7ff', () => c.arc(x + 1, top + 14.5, 2, 0, 7)); break;
    case 'knight': F('#aab2bd', () => { c.arc(x, y, r + 1.4, 0, 7); }); F('#16161c', () => c.rect(x - 1, y + 0.4, r + 2.2, 2.4)); F('#e03131', () => { c.moveTo(x - 2, top + 1); c.quadraticCurveTo(x - 6, top + 10, x - 12, top + 6); c.quadraticCurveTo(x - 6, top + 4, x - 2, top + 1); }); break;
    case 'grad': F('#16161c', () => c.rect(x - 5.5, top - 1.5, 11, 4)); F('#16161c', () => { c.moveTo(x - 11, top + 3.5); c.lineTo(x, top + 6.5); c.lineTo(x + 11, top + 3.5); c.lineTo(x, top + 0.5); c.closePath(); });
      c.strokeStyle = '#ffd23f'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, top + 3.5); c.lineTo(x + 8, top + 2.5); c.lineTo(x + 8.5, top - 3 + Math.sin(t * 4)); c.stroke(); break;
    case 'mohawk': F('#ff2bd6', () => { c.moveTo(x - 7, top - 2); for (let i = -3; i <= 3; i++) { c.lineTo(x + i * 2, top + 9 - Math.abs(i) * 1.2); c.lineTo(x + i * 2 + 1, top); } c.lineTo(x + 7, top - 2); c.closePath(); }); break;
  }
}

function drawAura(c, P, a, t) {
  const mid = [(P.hip[0] + P.head[0]) / 2, (P.hip[1] + P.head[1]) / 2], foot = P.hip[1] - 24;
  const glow = (x, y, r, col) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
  c.save(); c.globalCompositeOperation = a === 'shadow' ? 'source-over' : 'lighter';
  if (a === 'fire') {
    glow(mid[0], foot + 10, 30, 'rgba(255,90,20,0.25)');
    for (let i = 0; i < 9; i++) { // flame tongues licking upward
      const k = (t * 1.6 + i / 9) % 1, x = mid[0] + Math.sin(i * 2.3 + t * 4) * (10 - k * 6), y = foot + k * 62, s = 7 * (1 - k) + 1.5;
      c.fillStyle = k < 0.25 ? `rgba(255,200,80,${0.42 * (1 - k)})` : k < 0.6 ? `rgba(255,110,20,${0.4 * (1 - k)})` : `rgba(210,30,10,${0.35 * (1 - k)})`;
      c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x - s * 0.6, y + s * 1.6, x, y + s * 2.6); c.quadraticCurveTo(x + s * 0.6, y + s * 1.6, x + s, y); c.arc(x, y, s, 0, Math.PI, true); c.fill();
    }
  } else if (a === 'electric') {
    glow(mid[0], mid[1], 34, 'rgba(80,170,255,0.18)');
    for (let n = 0; n < 2; n++) {
      const pts = []; let x = mid[0] + rnd(-16, 16), y = foot + rnd(0, 10);
      for (let i = 0; i < 6; i++) { pts.push([x, y]); x += rnd(-8, 8); y += rnd(7, 12); }
      for (const [lw, col] of [[4, 'rgba(90,170,255,0.35)'], [1.3, '#e6f6ff']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke(); }
    }
  } else if (a === 'shadow') {
    glow(mid[0], foot + 4, 26, 'rgba(40,0,70,0.45)');
    for (let i = 0; i < 7; i++) { const k = (t * 0.8 + i / 7) % 1; c.fillStyle = `rgba(70,10,120,${0.5 * (1 - k)})`; c.beginPath(); c.arc(mid[0] + Math.sin(i * 3 + t * 2) * 13, foot + k * 58, 9 * (1 - k) + 2, 0, 7); c.fill(); }
  } else if (a === 'rainbow') {
    glow(mid[0], mid[1], 36, `hsla(${t * 200 % 360},100%,60%,0.3)`);
    for (let i = 0; i < 6; i++) { const ang = t * 3 + i * Math.PI / 3; c.fillStyle = `hsla(${(i * 60 + t * 200) % 360},100%,65%,0.9)`; c.beginPath(); c.arc(mid[0] + Math.cos(ang) * 20, mid[1] + Math.sin(ang) * 8, 2.2, 0, 7); c.fill(); }
  } else if (a === 'toxic') {
    glow(mid[0], foot + 6, 30, 'rgba(120,255,60,0.22)');
    for (let i = 0; i < 7; i++) { const k = (t * 0.9 + i / 7) % 1, bx = mid[0] + Math.sin(i * 4 + t * 2) * 14, by = foot + k * 60, br = 1.5 + 2.5 * Math.sin(k * Math.PI);
      c.strokeStyle = `rgba(150,255,80,${0.85 * (1 - k)})`; c.lineWidth = 1; c.beginPath(); c.arc(bx, by, br, 0, 7); c.stroke(); c.fillStyle = `rgba(110,230,50,${0.3 * (1 - k)})`; c.fill(); }
  } else if (a === 'gold') {
    glow(mid[0], mid[1], 34, 'rgba(255,200,60,0.22)');
    for (let i = 0; i < 6; i++) { const ph = (t * 1.3 + i * 0.37) % 1, s = 4 * Math.sin(ph * Math.PI), gx = mid[0] + Math.sin(i * 7.1) * 17, gy = foot + 8 + ((i * 13.7) % 50);
      c.fillStyle = 'rgba(255,225,120,0.95)'; c.beginPath(); c.moveTo(gx, gy - s); c.lineTo(gx + s * 0.25, gy); c.lineTo(gx, gy + s); c.lineTo(gx - s * 0.25, gy); c.closePath(); c.moveTo(gx - s, gy); c.lineTo(gx, gy + s * 0.25); c.lineTo(gx + s, gy); c.lineTo(gx, gy - s * 0.25); c.closePath(); c.fill(); }
  } else if (a === 'hearts') {
    glow(mid[0], mid[1], 30, 'rgba(255,90,150,0.18)');
    for (let i = 0; i < 5; i++) { const k = (t * 0.7 + i / 5) % 1, hx = mid[0] + Math.sin(i * 3.3 + t * 2) * 15, hy = foot + 10 + k * 55, hs = 2.6 * (1 - k * 0.4);
      c.fillStyle = `rgba(255,70,130,${0.9 * (1 - k)})`; c.beginPath(); c.moveTo(hx, hy - hs); c.bezierCurveTo(hx - hs * 1.6, hy + hs * 0.2, hx - hs * 0.8, hy + hs * 1.6, hx, hy + hs * 0.8); c.bezierCurveTo(hx + hs * 0.8, hy + hs * 1.6, hx + hs * 1.6, hy + hs * 0.2, hx, hy - hs); c.fill(); }
  } else if (a === 'frost') {
    glow(mid[0], mid[1], 32, 'rgba(150,220,255,0.22)');
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.6 + i / 6) % 1, x = mid[0] + Math.sin(i * 5 + t) * 15, y = foot + k * 58, s = 3.5 * Math.sin(k * Math.PI);
      c.fillStyle = 'rgba(220,245,255,0.95)'; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.3, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.3, y); c.closePath();
      c.moveTo(x - s, y); c.lineTo(x, y + s * 0.3); c.lineTo(x + s, y); c.lineTo(x, y - s * 0.3); c.closePath(); c.fill();
    }
  }
  c.restore();
}

// weapons in a frame where +x = barrel/blade direction, -y = grip side (local y-up frame)
function drawWeapon(c, id, t) {
  const w = WEAPONS[id], R = (x, y, ww, hh, col) => { c.fillStyle = col; c.fillRect(x, y, ww, hh); };
  c.lineCap = 'round';
  switch (w.shape) {
    case 'pistol': R(-2, -1, 14, 4.5, '#2b2d33'); R(-2, -8, 4.5, 8, '#1b1c20'); R(0, 2.5, 11, 1, '#555'); break;
    case 'smg': R(-5, -1, 20, 5, '#2b2d33'); R(4, -9, 3.5, 8, '#111'); R(-4, -7, 3.5, 6, '#111'); break;
    case 'rifle': R(-13, -3, 11, 5, '#5a3a20'); R(-2, -1, 24, 5, '#2b2d33'); R(22, 0.5, 7, 2, '#111'); R(6, -9, 4, 8, '#111'); R(2, 4, 8, 2, '#444'); break;
    case 'shotgun': R(-12, -3, 10, 6, '#6b3f1f'); R(-2, 0, 28, 4, '#2b2d33'); R(9, -2, 9, 3, '#8a5a2b'); break;
    case 'sniper': R(-15, -3, 13, 5, '#2e3b2a'); R(-2, -1, 40, 3.5, '#22262b'); R(3, 3, 12, 3.5, '#111'); R(2, -7, 3.5, 6, '#111'); R(14, 3.5, 2, 1.5, '#9ef'); break;
    case 'minigun': { R(-8, -4, 22, 10, '#3a3d44'); const o = (t * 40) % 3; for (let i = 0; i < 3; i++) R(14, -2 + ((i + o) % 3) * 2.5, 18, 1.6, '#888'); R(-4, -10, 4, 7, '#111'); break; }
    case 'launcher': R(-10, -2, 32, 9, '#4d5a2a'); R(20, -3, 3, 11, '#2f3819'); R(0, -9, 4, 7, '#111'); break;
    case 'rocketl': R(-16, -2, 40, 10, '#3d5c3a'); c.fillStyle = '#c33'; c.beginPath(); c.moveTo(24, -1); c.lineTo(31, 3); c.lineTo(24, 7); c.fill(); R(2, -9, 4, 7, '#111'); break;
    case 'grenade': c.fillStyle = '#3f6a2a'; c.beginPath(); c.arc(2, 0, 4.5, 0, 7); c.fill(); R(0, 3.5, 4, 2, '#aaa'); break;
    case 'knife': case 'dagger': {
      R(-5, -1.5, 7, 3, '#222'); if (w.shape === 'dagger') R(1.5, -4, 1.5, 8, '#c9a227');
      c.fillStyle = w.color; c.beginPath(); c.moveTo(2, -1.5); c.lineTo(2 + w.len, 0); c.lineTo(2, 2); c.fill(); break;
    }
    case 'katana': {
      R(-9, -1.4, 12, 2.8, '#1a1a2a'); c.fillStyle = '#c9a227'; c.beginPath(); c.ellipse(3, 0, 1.6, 4, 0, 0, 7); c.fill();
      c.strokeStyle = w.color; c.lineWidth = 2.6; c.beginPath(); c.moveTo(4, 0); c.quadraticCurveTo(4 + w.len * 0.6, 1.5, 4 + w.len, 4); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(6, 1); c.quadraticCurveTo(4 + w.len * 0.6, 2.5, 4 + w.len, 4); c.stroke(); break;
    }
    case 'saber': {
      R(-7, -1.8, 11, 3.6, '#999'); c.globalCompositeOperation = 'lighter';
      for (const [lw, col] of [[9, w.color + '33'], [5, w.color + '99'], [2, '#fff']]) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(4, 0); c.lineTo(4 + w.len, 0); c.stroke(); }
      c.globalCompositeOperation = 'source-over'; break;
    }
    case 'bat': c.fillStyle = w.color; c.beginPath(); c.moveTo(-6, -1.5); c.lineTo(w.len - 3, -4); c.arc(w.len - 3, 0, 4, -Math.PI / 2, Math.PI / 2); c.lineTo(-6, 1.5); c.fill(); R(-6, -1.8, 8, 3.6, '#222'); break;
    case 'pan': R(-6, -1.5, 22, 3, '#111'); c.fillStyle = w.color; c.beginPath(); c.arc(24, 0, 9, 0, 7); c.fill(); c.fillStyle = '#5a606a'; c.beginPath(); c.arc(24, 0, 6.5, 0, 7); c.fill(); break;
    case 'hammer': R(-6, -1.5, w.len, 3, '#8a5a2b'); R(w.len - 8, -9, 11, 18, '#6f747c'); R(w.len - 8, -9, 11, 3, '#9aa0a8'); break;
  }
}

// spider: round body, eight jointed legs scuttling
function drawSpider(c, sx, sy, f, t, s) {
  const ph = f.walk * 1.5, col = f.flash > 0 ? '#fff' : f.look.color;
  c.save(); c.translate(sx, sy); c.scale(f.face * s, -s); c.lineCap = 'round';
  c.strokeStyle = col; c.lineWidth = 2.5;
  const by = 14 + f.z * 0;
  for (let i = 0; i < 4; i++) for (const side of [-1, 1]) {
    const a = ph + i * 1.3 + (side > 0 ? Math.PI : 0), fx2 = (i - 1.5) * 9 + Math.sin(a) * 4 * f.spd + side * 2, lift = Math.max(0, Math.cos(a)) * 5 * f.spd;
    const knee = [fx2 * 1.3, by + 12], foot = [fx2 * 1.8, lift];
    c.beginPath(); c.moveTo((i - 1.5) * 3, by); c.lineTo(knee[0], knee[1]); c.lineTo(foot[0], foot[1]); c.stroke();
  }
  c.fillStyle = col; c.beginPath(); c.ellipse(-6, by + 2, 11, 8, 0, 0, 7); c.fill(); c.beginPath(); c.arc(7, by, 6, 0, 7); c.fill();
  c.globalCompositeOperation = 'lighter'; c.fillStyle = '#f22'; for (const [x, y] of [[9, by + 2], [11, by], [8, by - 1]]) { c.beginPath(); c.arc(x, y, 1.3, 0, 7); c.fill(); }
  c.restore();
}
function drawBat(c, sx, sy, f, t, s) {
  const flap = Math.sin(t * 18 + f.id), col = f.flash > 0 ? '#fff' : f.look.color;
  c.save(); c.translate(sx, sy); c.scale(f.face * s, -s); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 2.5; c.lineCap = 'round';
  for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(0, 0); c.lineTo(sd * 12, 6 + flap * 8); c.lineTo(sd * 22, flap * 12); c.lineTo(sd * 14, -2 + flap * 4); c.closePath(); c.globalAlpha = 0.85; c.fill(); c.globalAlpha = 1; }
  c.beginPath(); c.moveTo(0, -6); c.lineTo(0, 6); c.stroke(); c.beginPath(); c.arc(0, 9, 5, 0, 7); c.fill();
  c.beginPath(); c.moveTo(-3, 12); c.lineTo(-4, 17); c.lineTo(-1, 13); c.moveTo(3, 12); c.lineTo(4, 17); c.lineTo(1, 13); c.fill();
  c.globalCompositeOperation = 'lighter'; c.fillStyle = '#f33'; c.fillRect(1, 9, 2, 2); c.fillRect(-3, 9, 2, 2);
  c.restore();
}

// ---------- ragdolls (3D verlet) ----------
const RD_LINKS = [[0, 1], [1, 2], [1, 3], [3, 4], [1, 5], [5, 6], [2, 7], [7, 8], [2, 9], [9, 10], [0, 2]];
function makeRagdoll(f, P, ix, iy, iz) {
  const s = f.scale, joints = [P.head, P.neck, P.hip, P.eL, P.hL, P.eR, P.hR, P.kL, P.fL, P.kR, P.fR];
  const pts = joints.map((j, i) => {
    const lx = j[0] * f.face * s, x = f.x + lx, y = f.y, z = Math.max(0, f.z) + j[1] * s, spin = (j[1] / 50) * rnd(0.8, 1.4);
    const vx = ix * (0.6 + spin) + rnd(-40, 40), vy = iy * (0.6 + spin) + rnd(-40, 40), vz = iz * (0.5 + spin * 0.5) + rnd(0, 60);
    return { x, y, z, px: x - vx / 60, py: y - vy / 60, pz: z - vz / 60 };
  });
  const len = RD_LINKS.map(([a, b]) => Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y, pts[a].z - pts[b].z));
  return { pts, len, t: 0, look: f.look, scale: s, face: f.face, body: f.body };
}
function updateRagdoll(r, dt, MAP) {
  r.t += dt; const g = 1100 * dt * dt;
  for (const p of r.pts) {
    const on = p.x > 0 && p.y > 0 && p.x < MAP.W && p.y < MAP.H, fr = on && p.z <= 0.5 ? 0.85 : 0.995;
    const vx = (p.x - p.px) * fr, vy = (p.y - p.py) * fr, vz = (p.z - p.pz) * 0.995;
    p.px = p.x; p.py = p.y; p.pz = p.z; p.x += vx; p.y += vy; p.z += vz - g;
    if (on && p.z < 0 && p.pz > -8) { p.z = 0; p.pz = vz < -2 ? -vz * 0.3 : 0; }
  }
  for (let k = 0; k < 4; k++) RD_LINKS.forEach(([a, b], i) => {
    const A = r.pts[a], B = r.pts[b], dx = B.x - A.x, dy = B.y - A.y, dz = B.z - A.z, d = Math.hypot(dx, dy, dz) || 1, m = (d - r.len[i]) / d * 0.5;
    A.x += dx * m; A.y += dy * m; A.z += dz * m; B.x -= dx * m; B.y -= dy * m; B.z -= dz * m;
  });
}
function drawRagdoll(c, r) {
  const a = r.t > 3 ? Math.max(0, 1 - (r.t - 3)) : 1; if (a <= 0) return;
  c.globalAlpha = a; c.strokeStyle = r.look.color; c.fillStyle = r.look.color; c.lineWidth = (r.look.thick || 4) * r.scale; c.lineCap = 'round';
  const S = r.pts.map(p => proj(p.x, p.y, p.z));
  c.beginPath(); for (const [i, j] of RD_LINKS.slice(0, 10)) { c.moveTo(S[i][0], S[i][1]); c.lineTo(S[j][0], S[j][1]); } c.stroke();
  c.beginPath(); c.arc(S[0][0], S[0][1], 7.5 * r.scale, 0, 7); c.fill();
  c.globalAlpha = 1;
}
