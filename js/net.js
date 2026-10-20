// Online play. The host runs the real game and streams its canvas + sound to friends over WebRTC (PeerJS);
// friends only send their raw inputs back, which become a normal human slot on the host.
// ponytail: screen streaming, not state sync. Ceiling: host upload (~3 Mbps per friend) and ~100 ms input lag;
// upgrade path is sending entity snapshots and rendering locally if that bites.
'use strict';

const NO_INPUT = { keys: {}, pressed: {}, mouse: { x: 0, y: 0 }, pad: () => null };
const NET = {
  role: null, peer: null, conns: {}, remote: {}, conn: null, _stream: null,
  status(t) { $('#netStatus').textContent = t; },
  send(m) { if (this.role === 'host') for (const c of Object.values(this.conns)) if (c.open) c.send(m); },

  // ---------- host ----------
  host() {
    if (this.role === 'host') return;
    if (!window.Peer) return this.status('Online needs an internet connection (PeerJS failed to load).');
    AU.init(); this.leave(); this.role = 'host';
    const code = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.peer = new Peer('stickbrawl-' + code);
    this.status('Connecting…');
    this.peer.on('open', () => { $('#netCode').textContent = code; this.status('Share this code with your friends, then choose a mode.'); });
    this.peer.on('error', e => this.status('Network error: ' + e.type));
    this.peer.on('connection', conn => {
      conn.on('data', m => this.onHostMsg(conn, m));
      conn.on('close', () => this.drop(conn.peer));
    });
  },
  stream() {
    if (this._stream) return this._stream;
    const s = cv.captureStream(30), d = AU.ctx.createMediaStreamDestination();
    AU.master.connect(d); d.stream.getAudioTracks().forEach(t => s.addTrack(t));
    return (this._stream = s);
  },
  onHostMsg(conn, m) {
    if (m.hello) {
      const slots = UI.setup.slots, i = slots.findIndex((s, k) => k > 0 && s.type !== 'human');
      if (i < 0) { conn.send({ full: true }); return setTimeout(() => conn.close(), 200); }
      slots[i] = { type: 'human', scheme: m.pad ? 'pad0' : 'kbm', diff: 1, net: conn.peer, prof: Object.assign({}, DEFAULT_PROFILES[i], m.prof) };
      this.conns[conn.peer] = conn;
      this.remote[conn.peer] = { keys: {}, pressed: {}, mouse: { x: 0, y: 0, l: false, r: false, lp: false, rp: false }, pad: null, padPr: {} };
      this.peer.call(conn.peer, this.stream());
      conn.send({ slot: i, ui: UI.cur });
      AU.play('uiok'); this.list();
    } else if (m.in && this.remote[conn.peer]) {
      const R = this.remote[conn.peer], q = m.in;
      R.keys = Object.fromEntries(q.k.map(k => [k, true])); q.p.forEach(k => R.pressed[k] = true);
      Object.assign(R.mouse, { x: q.mx * CAM.vw, y: q.my * CAM.vh, l: q.l, r: q.r }); if (q.lp) R.mouse.lp = true; if (q.rp) R.mouse.rp = true;
      R.pad = q.pad; q.pp.forEach(j => R.padPr[j] = true);
    }
  },
  input(id) {
    const R = this.remote[id];
    return R ? { keys: R.keys, pressed: R.pressed, mouse: R.mouse, pad: () => R.pad && { a: R.pad.a, b: R.pad.b, pr: j => !!R.padPr[j] } } : NO_INPUT;
  },
  endFrame() { for (const R of Object.values(this.remote)) { R.pressed = {}; R.mouse.lp = R.mouse.rp = false; R.padPr = {}; } },
  drop(id) { // friend left: their fighter becomes a bot so the match goes on
    const name = UI.setup.slots.find(s => s.net === id)?.prof?.name || 'A player';
    for (const s of [...UI.setup.slots, ...(G.cfg?.slots || [])]) if (s.net === id) Object.assign(s, { type: 'bot', net: null });
    for (const f of G.F || []) if (f.ctrl.net === id) f.ctrl = { type: 'bot', diff: 1 };
    delete this.conns[id]; delete this.remote[id];
    if (G.on && !G.demo) announce(name + ' left', 'a bot takes over', '#aab');
    this.list();
  },
  list() {
    $('#netList').innerHTML = UI.setup.slots.map((s, i) => s.net ? `<li style="color:${s.prof.color}">P${i + 1} · ${s.prof.name}</li>` : '').join('') || '<li>No one yet</li>';
    if (UI.cur === 'setup') UI.buildSetup();
  },

  // ---------- client ----------
  join(code) {
    code = (code || '').trim().toUpperCase();
    if (!code) return this.status('Enter the host\'s code.');
    if (!window.Peer) return this.status('Online needs an internet connection (PeerJS failed to load).');
    AU.init(); this.leave(); this.role = 'client'; this.status('Connecting…');
    this.peer = new Peer();
    this.peer.on('open', () => {
      const conn = this.conn = this.peer.connect('stickbrawl-' + code, { reliable: true });
      conn.on('open', () => { conn.send({ hello: 1, prof: PROFILES[0], pad: $('#netPad').value === 'pad' }); this.status('Connected, waiting for video…'); });
      conn.on('data', m => {
        if (m.full) this.leave('That lobby is full (4 players).');
        if (m.slot !== undefined) $('#netWho').textContent = `You are P${m.slot + 1}`;
        if ('ui' in m) $('#netOverlay').textContent = m.ui ? 'Host is in the menu…' : '';
      });
      conn.on('close', () => this.role === 'client' && this.leave('Disconnected from host.'));
    });
    this.peer.on('call', call => {
      call.answer();
      call.on('stream', s => { const v = $('#netVideo'); v.srcObject = s; v.play().catch(() => { }); G.on = false; AU.music(null); UI.show(null); $('#netView').classList.remove('hidden'); });
    });
    this.peer.on('error', e => this.leave(e.type === 'peer-unavailable' ? 'No game with that code.' : 'Network error: ' + e.type));
  },
  sendInput() {
    if (!this.conn?.open) return;
    const v = $('#netVideo'), vw = v.videoWidth || 1, vh = v.videoHeight || 1, s = Math.min(innerWidth / vw, innerHeight / vh);
    const ox = (innerWidth - vw * s) / 2, oy = (innerHeight - vh * s) / 2, p = PADS[0];
    this.conn.send({ in: { k: Object.keys(KEYS).filter(k => KEYS[k]), p: Object.keys(PRESSED), mx: (MOUSE.x - ox) / (vw * s), my: (MOUSE.y - oy) / (vh * s),
      l: MOUSE.l, r: MOUSE.r, lp: MOUSE.lp, rp: MOUSE.rp, pad: p && { a: p.a, b: p.b }, pp: p ? p.b.map((b, j) => b && !PADPREV[0][j] ? j : -1).filter(j => j >= 0) : [] } });
  },
  leave(msg) {
    const was = this.role; this.role = null;
    try { this.peer?.destroy(); } catch { }
    Object.assign(this, { peer: null, conn: null, conns: {}, remote: {}, _stream: null });
    UI.setup.slots.forEach(s => { if (s.net) Object.assign(s, { type: 'off', net: null }); });
    $('#netCode').textContent = '—'; $('#netWho').textContent = ''; this.list();
    if (was === 'client') { $('#netView').classList.add('hidden'); $('#netVideo').srcObject = null; startDemo(); AU.music('menu'); UI.show('online'); }
    if (msg) this.status(msg);
  },
};
