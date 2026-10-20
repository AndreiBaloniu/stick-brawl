// Menus, settings/profiles persistence, input (keyboard, mouse, gamepads), main loop.
'use strict';

const store = {
  get(k, d) { try { const v = localStorage.getItem('stickbrawl.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('stickbrawl.' + k, JSON.stringify(v)); } catch { } },
};
const SETTINGS = Object.assign({ music: 0.5, sfx: 0.7, shake: true, blood: true, decals: true, quality: true }, store.get('settings', {}));
const PROFILES = store.get('profiles', null) || JSON.parse(JSON.stringify(DEFAULT_PROFILES));
const BEST = store.get('best', {});
AU.vol = { music: SETTINGS.music, sfx: SETTINGS.sfx };

// ---------- input ----------
const KEYS = {}, PRESSED = {}, MOUSE = { x: 0, y: 0, l: false, r: false, lp: false, rp: false }, PADS = [], PADPREV = [];
addEventListener('keydown', e => {
  if (!KEYS[e.code]) PRESSED[e.code] = true; KEYS[e.code] = true; AU.init();
  if (((G.on && !G.demo && !G.paused) || NET.role === 'client') && /Arrow|Space|Tab/.test(e.code)) e.preventDefault();
  if (e.code === 'Escape' && G.on && !G.demo && !G.over) UI.togglePause();
});
addEventListener('keyup', e => { KEYS[e.code] = false; });
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
cv.addEventListener('mousemove', e => { MOUSE.x = e.clientX; MOUSE.y = e.clientY; });
cv.addEventListener('mousedown', e => { AU.init(); if (e.button === 0) { MOUSE.l = MOUSE.lp = true; } if (e.button === 2) { MOUSE.r = MOUSE.rp = true; } });
addEventListener('mouseup', e => { if (e.button === 0) MOUSE.l = false; if (e.button === 2) MOUSE.r = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());

const SCHEMES = {
  kbm: { name: 'Keyboard + Mouse', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], atk: ['KeyF'], pow: ['KeyQ'], jump: ['Space'], dash: ['ShiftLeft'], pick: ['KeyE'], mouse: true },
  kbl: { name: 'Keyboard Left', up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], atk: ['KeyF'], pow: ['KeyG'], jump: ['Space'], dash: ['ShiftLeft'], pick: ['KeyE'] },
  kbr: { name: 'Keyboard Right', up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], atk: ['KeyK', 'Numpad1'], pow: ['KeyL', 'Numpad2'], jump: ['KeyI', 'Numpad0'], dash: ['KeyJ', 'Numpad3'], pick: ['KeyU', 'Numpad5'] },
  pad0: { name: 'Gamepad 1', pad: 0 }, pad1: { name: 'Gamepad 2', pad: 1 }, pad2: { name: 'Gamepad 3', pad: 2 }, pad3: { name: 'Gamepad 4', pad: 3 },
};
function pollPads() {
  const ps = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 4; i++) {
    const p = ps[i]; PADPREV[i] = PADS[i] ? PADS[i].b : [];
    PADS[i] = p ? { a: p.axes.slice(), b: p.buttons.map(b => b.pressed || b.value > 0.4) } : null;
    if (PADS[i]?.b[9] && !PADPREV[i][9] && G.on && !G.demo && !G.over) UI.togglePause();
  }
}
// screen-direction -> world-direction (tilted top-down: same axes)
const s2w = (dx, dy) => [dx, dy];
function assist(f, ax, ay, cone) { // snap aim to the best foe inside a cone
  let best = null, bs = cone;
  for (const t of G.F) { if (!alive(t) || !foes(f, t)) continue; const dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy); if (d > 700) continue; const c = (dx * ax + dy * ay) / (d * Math.hypot(ax, ay) || 1); if (c > bs) { bs = c; best = [dx, dy, d]; } }
  return best;
}
const LOCAL = { keys: KEYS, pressed: PRESSED, mouse: MOUSE, pad: i => PADS[i] && { a: PADS[i].a, b: PADS[i].b, pr: j => PADS[i].b[j] && !PADPREV[i][j] } };
function readInput(f) {
  const S = SCHEMES[f.ctrl.scheme] || SCHEMES.kbm, inp = { mx: 0, my: 0, atk: false, atkP: false, pow: false, jump: false, dash: false, pick: false };
  const R = f.ctrl.net ? NET.input(f.ctrl.net) : LOCAL, M = R.mouse;
  const held = a => a && a.some(k => R.keys[k]), hit = a => a && a.some(k => R.pressed[k]);
  let dx = 0, dy = 0, aim = null;
  if (S.pad !== undefined) {
    const p = R.pad(S.pad); if (!p) return inp;
    const dz = v => Math.abs(v) < 0.2 ? 0 : v, pr = p.pr;
    dx = dz(p.a[0]) + (p.b[15] ? 1 : 0) - (p.b[14] ? 1 : 0); dy = dz(p.a[1]) + (p.b[13] ? 1 : 0) - (p.b[12] ? 1 : 0);
    if (Math.hypot(p.a[2] || 0, p.a[3] || 0) > 0.35) aim = s2w(p.a[2], p.a[3]);
    inp.atk = p.b[7] || p.b[5] || p.b[2]; inp.atkP = pr(7) || pr(5) || pr(2); inp.pow = pr(6) || pr(4); inp.jump = pr(0); inp.dash = pr(1); inp.pick = pr(3);
  } else {
    dx = (held(S.right) ? 1 : 0) - (held(S.left) ? 1 : 0); dy = (held(S.down) ? 1 : 0) - (held(S.up) ? 1 : 0);
    inp.atk = held(S.atk) || (S.mouse && M.l); inp.atkP = hit(S.atk) || (S.mouse && M.lp);
    inp.pow = hit(S.pow) || (S.mouse && M.rp); inp.jump = hit(S.jump); inp.dash = hit(S.dash); inp.pick = hit(S.pick);
  }
  let [wx, wy] = s2w(dx, dy); const l = Math.hypot(wx, wy); if (l > 1) { wx /= l; wy /= l; }
  inp.mx = wx; inp.my = wy;
  if (S.mouse) { const [mx, my] = screenToWorld(M.x, M.y); aim = [mx - f.x, my - f.y]; f.aimDist = Math.hypot(aim[0], aim[1]); }
  else {
    const base = aim || (l > 0.1 ? [wx, wy] : [f.ax, f.ay]);
    const a = assist(f, base[0], base[1], aim ? 0.94 : 0.75);
    aim = a ? [a[0], a[1]] : base; f.aimDist = a ? a[2] : 320;
  }
  inp.ax = aim[0]; inp.ay = aim[1];
  return inp;
}

// ---------- screens ----------
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const UI = {
  cur: 'title', setup: { mode: 'brawl', map: 'neon', lives: 3, teams: false, weapons: true, powers: true, extra: 0, slots: [
    { type: 'human', scheme: 'kbm', diff: 1 }, { type: 'bot', scheme: 'kbr', diff: 1 }, { type: 'bot', scheme: 'pad0', diff: 1 }, { type: 'off', scheme: 'pad1', diff: 2 }] },
  editing: 0,
  show(id) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id)); this.cur = id; NET.send({ ui: id });
    $('#menu').classList.toggle('hidden', !id);
    if (id === 'modes') this.buildModes(); if (id === 'setup') this.buildSetup(); if (id === 'custom') this.buildCustom(); if (id === 'settings') this.buildSettings(); if (id === 'online') NET.list();
    const b = $('#' + id + ' button'); if (b) b.focus({ preventScroll: true });
  },
  buildModes() {
    $('#modeCards').innerHTML = Object.entries(MODES).map(([k, m]) => `<button class="card mode" data-mode="${k}"><span class="ico">${m.icon}</span><b>${m.name}</b><small>${m.desc}</small>${BEST[k] ? `<em>Best: ${BEST[k].toLocaleString()}</em>` : ''}</button>`).join('');
    $$('[data-mode]').forEach(b => b.onclick = () => { this.setup.mode = b.dataset.mode; if (b.dataset.mode !== 'brawl' && this.setup.slots[1].type === 'bot') this.setup.slots.forEach((s, i) => i && (s.type = 'off')); this.show('setup'); });
  },
  buildSetup() {
    const S = this.setup, surv = S.mode !== 'brawl';
    $('#setupMode').textContent = MODES[S.mode].name;
    $('#mapCards').innerHTML = MAPS.map(m => `<button class="card map ${S.map === m.id ? 'sel' : ''}" data-map="${m.id}" style="--a:${m.sky[1]};--b:${m.sky[2]};--r:${m.rim}"><canvas width="160" height="90" data-prev="${m.id}"></canvas><b>${m.name}</b></button>`).join('')
      + `<button class="card map ${S.map === 'random' ? 'sel' : ''}" data-map="random" style="--a:#222;--b:#444;--r:#fff"><div class="rand">?</div><b>Random</b></button>`;
    $$('[data-prev]').forEach(c => { const M = buildMap(MAPS.find(m => m.id === c.dataset.prev)), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 90); g.addColorStop(0, M.m.sky[0]); g.addColorStop(1, M.m.sky[2]); x.fillStyle = g; x.fillRect(0, 0, 160, 90); const s = 150 / M.floor.width; x.drawImage(M.floor, 5, 8, M.floor.width * s, M.floor.height * s); M.obs.forEach(o => { x.save(); x.translate(5 + M.ox * s, 8 + M.oy * s); x.scale(s, s); drawObstacle(x, o, 0); x.restore(); }); });
    $$('[data-map]').forEach(b => b.onclick = () => { S.map = b.dataset.map; this.buildSetup(); AU.play('ui'); });
    const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}" ${k == v ? 'selected' : ''}>${n}</option>`).join('');
    $('#slots').innerHTML = S.slots.map((s, i) => s.net ? `<div class="slot human" style="--c:${s.prof.color}"><b>P${i + 1}</b><span class="pname">${s.prof.name}</span><span>🌐 Online</span></div>` : `<div class="slot ${s.type}" style="--c:${PROFILES[i].color}">
      <b>P${i + 1}</b><span class="pname">${s.type === 'off' ? '—' : s.type === 'bot' ? PROFILES[i].name + ' (bot)' : PROFILES[i].name}</span>
      <select data-slot="${i}" data-k="type" aria-label="P${i + 1} type">${opt({ off: 'Off', human: 'Human', bot: surv ? 'Bot ally' : 'Bot' }, s.type)}</select>
      ${s.type === 'human' ? `<select data-slot="${i}" data-k="scheme" aria-label="P${i + 1} controls">${opt(Object.fromEntries(Object.entries(SCHEMES).map(([k, v]) => [k, v.name])), s.scheme)}</select>` : ''}
      ${s.type === 'bot' ? `<select data-slot="${i}" data-k="diff" aria-label="P${i + 1} difficulty">${opt({ 0: 'Easy', 1: 'Normal', 2: 'Hard' }, s.diff)}</select>` : ''}</div>`).join('');
    $$('[data-slot]').forEach(el => el.onchange = () => { const s = S.slots[el.dataset.slot]; s[el.dataset.k] = el.dataset.k === 'diff' ? +el.value : el.value; this.buildSetup(); });
    $('#optBrawl').style.display = surv ? 'none' : '';
    $('#optLives').value = S.lives; $('#optTeams').checked = S.teams; $('#optWeapons').checked = S.weapons; $('#optPowers').checked = S.powers; $('#optExtra').value = S.extra;
    $('#padInfo').textContent = `${PADS.filter(Boolean).length} gamepad(s) connected`;
  },
  start() {
    const S = this.setup;
    if (!S.slots.some(s => s.type === 'human')) S.slots[0].type = 'human';
    S.lives = +$('#optLives').value; S.teams = $('#optTeams').checked; S.weapons = $('#optWeapons').checked; S.powers = $('#optPowers').checked; S.extra = +$('#optExtra').value;
    const slots = S.slots.map((s, i) => Object.assign({}, s, { custom: i < 4 }));
    if (S.mode === 'brawl') for (let i = 0; i < S.extra; i++) slots.push({ type: 'bot', diff: 1 });
    const map = S.map === 'random' ? pick(MAPS).id : S.map;
    this.show(null); G.demo = false; AU.play('uiok');
    startGame({ mode: S.mode, map, lives: S.lives, teams: S.teams, weapons: S.weapons, powers: S.powers, slots });
  },
  // --- customization ---
  buildCustom() {
    const p = PROFILES[this.editing];
    $('#ctabs').innerHTML = PROFILES.map((q, i) => `<button class="tab ${i === this.editing ? 'sel' : ''}" data-tab="${i}" style="--c:${q.color}">P${i + 1}</button>`).join('');
    $$('[data-tab]').forEach(b => b.onclick = () => { this.editing = +b.dataset.tab; this.buildCustom(); AU.play('ui'); });
    $('#cname').value = p.name;
    $('#swatches').innerHTML = COLORS.map(c => `<button class="sw ${p.color === c ? 'sel' : ''}" data-col="${c}" style="background:${c}" aria-label="color ${c}"></button>`).join('');
    $$('[data-col]').forEach(b => b.onclick = () => { p.color = b.dataset.col; this.saveProf(); this.buildCustom(); });
    const rows = [['head', 'Head', HEADS], ['hat', 'Hat', HATS], ['eyes', 'Eyes', EYES], ['back', 'Back', BACKS], ['aura', 'Aura', AURAS]];
    $('#crows').innerHTML = rows.map(([k, n, list]) => `<div class="crow"><span>${n}</span><button data-cyc="${k}" data-d="-1" aria-label="previous ${n}">◀</button><b>${p[k]}</b><button data-cyc="${k}" data-d="1" aria-label="next ${n}">▶</button></div>`).join('');
    $$('[data-cyc]').forEach(b => b.onclick = () => { const [, , list] = rows.find(r => r[0] === b.dataset.cyc), i = list.indexOf(p[b.dataset.cyc]); p[b.dataset.cyc] = list[(i + +b.dataset.d + list.length) % list.length]; this.saveProf(); this.buildCustom(); AU.play('ui'); });
    $('#cthick').value = p.thick || 4;
  },
  saveProf() { store.set('profiles', PROFILES); },
  randomize() { const p = PROFILES[this.editing]; Object.assign(p, botLook(0), { name: p.name }); this.saveProf(); this.buildCustom(); AU.play('uiok'); },
  buildSettings() {
    for (const k of ['music', 'sfx']) $('#s_' + k).value = SETTINGS[k];
    for (const k of ['shake', 'blood', 'decals', 'quality']) $('#s_' + k).checked = SETTINGS[k];
  },
  saveSettings() {
    for (const k of ['music', 'sfx']) SETTINGS[k] = +$('#s_' + k).value;
    for (const k of ['shake', 'blood', 'decals', 'quality']) SETTINGS[k] = $('#s_' + k).checked;
    AU.vol = { music: SETTINGS.music, sfx: SETTINGS.sfx }; AU.setVol(); store.set('settings', SETTINGS);
  },
  togglePause() {
    G.paused = !G.paused; NET.send({ ui: G.paused ? 'pause' : null }); $('#menu').classList.toggle('hidden', !G.paused);
    $$('.screen').forEach(s => s.classList.toggle('active', G.paused && s.id === 'pause'));
    if (G.paused) $('#pause button').focus();
  },
  results() {
    if (G.demo) return startDemo();
    const surv = G.mode !== 'brawl', rows = G.F.filter(f => f.ctrl.type !== 'enemy').sort((a, b) => b.stats.k - a.stats.k);
    if (surv && G.score > (BEST[G.mode] || 0)) { BEST[G.mode] = G.score; store.set('best', BEST); }
    $('#resTitle').textContent = surv ? 'GAME OVER' : G.winner ? (G.cfg.teams ? ['RED', 'BLUE'][G.winner.team] + ' TEAM WINS' : G.winner.name + ' WINS') : 'DRAW';
    $('#resTitle').style.color = surv ? '#ff4d4d' : G.winner?.look.color || '#fff';
    $('#resSub').textContent = surv ? `Wave ${G.wave} · ${G.score.toLocaleString()} pts · Best ${(BEST[G.mode] || 0).toLocaleString()}` : MODES.brawl.name;
    $('#resTable').innerHTML = '<tr><th></th><th>KOs</th><th>Deaths</th><th>Damage</th></tr>' + rows.map(f => `<tr><td style="color:${f.look.color}">${f.name}</td><td>${f.stats.k}</td><td>${f.stats.d}</td><td>${Math.round(f.stats.dmg)}</td></tr>`).join('');
    this.show('results'); AU.music('menu');
  },
  quit() { G.paused = false; startDemo(); this.show('title'); },
};
function startDemo() {
  startGame({ mode: 'brawl', map: pick(MAPS).id, lives: 3, teams: false, weapons: true, powers: true, music: 'menu', slots: [0, 1, 2, 3, 4].map(i => ({ type: 'bot', diff: 1 + (i % 2) })) });
  G.demo = true;
}

// wire static buttons
document.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; AU.init();
  if (b.dataset.go !== undefined) { UI.show(b.dataset.go); AU.play('uiok'); }
  const act = b.dataset.act;
  if (act === 'start') UI.start();
  if (act === 'random') UI.randomize();
  if (act === 'resume') UI.togglePause();
  if (act === 'restart' || act === 'rematch') { G.paused = false; UI.show(null); startGame(G.cfg); }
  if (act === 'quit') UI.quit();
  if (act === 'exit') { NET.leave(); close(); }
  if (act === 'host') NET.host();
  if (act === 'join') NET.join($('#netJoinCode').value);
  if (act === 'netleave') NET.leave('You left the game.');
});
document.addEventListener('mouseover', e => { if (e.target.closest('button') && e.target.closest('button') !== UI.hov) { UI.hov = e.target.closest('button'); AU.play('ui', 0.5); } });
$('#cname').oninput = e => { PROFILES[UI.editing].name = e.target.value.slice(0, 14) || 'Stick'; UI.saveProf(); };
$('#cthick').oninput = e => { PROFILES[UI.editing].thick = +e.target.value; UI.saveProf(); };
$$('#settings input').forEach(i => i.oninput = () => UI.saveSettings());

// ---------- main loop ----------
function resize() {
  CAM.dpr = Math.min(devicePixelRatio || 1, 1.5); CAM.vw = innerWidth; CAM.vh = innerHeight;
  cv.width = CAM.vw * CAM.dpr; cv.height = CAM.vh * CAM.dpr;
}
addEventListener('resize', resize); resize();
const pv = $('#preview'), pctx = pv.getContext('2d');
const demoWpns = ['fists', 'katana', 'pistol', 'bat', 'rifle', 'pan', 'saber', 'shotgun', 'hammer', 'sniper', 'dagger', 'rocket'];
function drawPreview(t) {
  const p = PROFILES[UI.editing], W = pv.width, H = pv.height;
  pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.clearRect(0, 0, W, H);
  const g = pctx.createRadialGradient(W / 2, H * 0.8, 10, W / 2, H * 0.8, W * 0.6); g.addColorStop(0, p.color + '55'); g.addColorStop(1, 'rgba(0,0,0,0)'); pctx.fillStyle = g; pctx.fillRect(0, 0, W, H);
  pctx.fillStyle = '#2a2d3e'; pctx.beginPath(); pctx.moveTo(W / 2, H * 0.72); pctx.lineTo(W / 2 + 100, H * 0.8); pctx.lineTo(W / 2, H * 0.88); pctx.lineTo(W / 2 - 100, H * 0.8); pctx.fill();
  const cyc = t % 3, wpn = demoWpns[Math.floor(t / 3) % demoWpns.length], w = WEAPONS[wpn];
  const f = { walk: t * 8, spd: cyc < 1 ? 1 : 0, z: cyc > 2.2 && cyc < 2.6 ? 20 : 0, atk: cyc > 1.2 && cyc < 2 ? ((cyc - 1.2) % 0.4) : -1, atkDur: 0.4, atkN: Math.floor(cyc / 0.4), aim: w.type === 'gun' ? 0.1 : 0, face: 1, wpn, recoil: 0, look: p };
  drawStick(pctx, W * 0.4, H * 0.8 - f.z, computePose(f, t), p, 3, 1, wpn, null, t);
  pctx.font = '700 13px system-ui'; pctx.textAlign = 'center'; pctx.fillStyle = '#ffe14d'; pctx.fillText(w.name, W / 2, H - 8);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  pollPads();
  if (G.on) { updateGame(dt); ctx.globalAlpha = 1; renderGame(ctx, dt); }
  if (UI.cur === 'custom' && !G.paused) drawPreview(now / 1000);
  if (NET.role === 'client') NET.sendInput(); else NET.endFrame();
  for (const k in PRESSED) delete PRESSED[k]; MOUSE.lp = MOUSE.rp = false;
  requestAnimationFrame(frame);
}
// open index.html?smoke to run every mode on every map headless and assert nothing breaks
function smoke() {
  const fails = []; UI.results = () => { };
  for (const mode of Object.keys(MODES)) for (const m of MAPS) {
    try {
      startGame({ mode, map: m.id, lives: 2, weapons: true, powers: true, slots: [0, 1, 2].map(() => ({ type: 'bot', diff: 2 })) });
      for (let i = 0; i < 60 * 150 && !G.over; i++) { updateGame(1 / 60); if (G.F.some(f => Number.isNaN(f.x + f.y + f.z)) || Number.isNaN(G.score)) throw Error('NaN state'); }
      if (mode === 'brawl' && !G.over) throw Error('brawl never ended');
      if (mode !== 'brawl' && G.wave < 2) throw Error('waves stalled at ' + G.wave);
    } catch (e) { fails.push(`${mode}/${m.id}: ${e.message}`); }
  }
  console.log(fails.length ? 'SMOKE FAIL: ' + fails.join(' | ') : 'SMOKE OK'); document.title = fails.length ? 'SMOKE FAIL' : 'SMOKE OK';
}
if (location.search.includes('smoke')) smoke();
fetch('version.json', { cache: 'no-store' }).then(r => r.json()).then(v => { $('#verTag').textContent = 'v' + v.version + ' ·'; }).catch(() => { }); // only exists in published builds
$$('.exit-btn').forEach(b => b.hidden = !/Electron/.test(navigator.userAgent)); // browsers won't let a page close its own tab
startDemo(); UI.show('title'); AU.music('menu');
requestAnimationFrame(frame);
