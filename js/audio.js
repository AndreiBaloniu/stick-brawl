// Everything synthesized with WebAudio: no asset files.
'use strict';

const AU = {
  ctx: null, master: null, sfx: null, mus: null, noise: null, track: null, step: 0, next: 0, timer: 0,
  vol: { music: 0.5, sfx: 0.7 },
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const c = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = c.createDynamicsCompressor(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.connect(this.master);
    this.setVol();
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.timer = setInterval(() => this.tick(), 25);
    if (this.pending) this.music(this.pending);
  },
  setVol() { if (this.ctx) { this.sfx.gain.value = this.vol.sfx; this.mus.gain.value = this.vol.music * 0.55; } },

  // --- primitives ---
  osc(type, f0, f1, dur, vol, t = 0, dest = this.sfx) {
    const c = this.ctx, now = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g).connect(dest); o.start(now); o.stop(now + dur + 0.02);
  },
  nz(dur, vol, ftype, f0, f1, t = 0, q = 1, dest = this.sfx) {
    const c = this.ctx, now = c.currentTime + t, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, now);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    s.connect(f).connect(g).connect(dest); s.start(now, Math.random()); s.stop(now + dur + 0.02);
  },

  play(name, v = 1) {
    if (!this.ctx || this.vol.sfx <= 0) return;
    const r = 0.9 + Math.random() * 0.2; // pitch variance so repeats don't sound robotic
    switch (name) {
      case 'punch': this.osc('sine', 150 * r, 45, 0.12, 0.8 * v); this.nz(0.06, 0.5 * v, 'lowpass', 2500, 400); break;
      case 'slash': this.nz(0.16, 0.5 * v, 'bandpass', 1500 * r, 7000, 0, 2); break;
      case 'saber': this.osc('sawtooth', 160 * r, 90, 0.25, 0.25 * v); this.nz(0.2, 0.3 * v, 'bandpass', 900, 3000, 0, 4); break;
      case 'bonk': this.osc('triangle', 380 * r, 90, 0.18, 0.8 * v); this.nz(0.05, 0.6 * v, 'lowpass', 3000, 300); break;
      case 'clang': [820, 1290, 1910, 2730].forEach((f, i) => this.osc('sine', f * r, f * r * 0.98, 0.7 - i * 0.12, 0.25 * v)); this.nz(0.04, 0.6 * v, 'highpass', 3000, 3000); break;
      case 'pistol': this.nz(0.12, 0.8 * v, 'lowpass', 6000, 300); this.osc('sine', 180, 40, 0.12, 0.7 * v); break;
      case 'smg': this.nz(0.06, 0.6 * v, 'lowpass', 7000, 500); this.osc('square', 140 * r, 50, 0.05, 0.25 * v); break;
      case 'rifle': this.nz(0.09, 0.8 * v, 'lowpass', 8000, 400); this.osc('sine', 160, 35, 0.1, 0.8 * v); break;
      case 'shotgun': this.nz(0.35, 1 * v, 'lowpass', 5000, 150); this.osc('sine', 120, 30, 0.3, 1 * v); this.nz(0.05, 0.4, 'bandpass', 2000, 2000, 0.35); this.nz(0.05, 0.4, 'bandpass', 1500, 1500, 0.45); break;
      case 'sniper': this.nz(0.9, 1 * v, 'lowpass', 9000, 120); this.osc('sine', 220, 30, 0.5, 1 * v); this.nz(0.02, 0.9 * v, 'highpass', 4000, 4000); break;
      case 'thunk': this.osc('sine', 260, 60, 0.2, 0.9 * v); this.nz(0.15, 0.4 * v, 'bandpass', 600, 1500); break;
      case 'rocket': this.nz(0.7, 0.6 * v, 'bandpass', 400, 2500, 0, 1.5); this.osc('sawtooth', 90, 40, 0.4, 0.3 * v); break;
      case 'throw': this.nz(0.14, 0.35 * v, 'bandpass', 600 * r, 2500, 0, 3); break;
      case 'boom': this.nz(1.3, 1.2 * v, 'lowpass', 1500, 60); this.osc('sine', 70, 25, 1.0, 1.2 * v); this.nz(0.1, 0.8 * v, 'highpass', 2000, 800); break;
      case 'laser': this.osc('sawtooth', 1200 * r, 700, 0.14, 0.12 * v); this.osc('square', 600 * r, 350, 0.14, 0.07 * v); break;
      case 'zap': this.nz(0.3, 0.8 * v, 'highpass', 3000, 1000); for (let i = 0; i < 4; i++) this.osc('square', 80 + Math.random() * 1200, 60, 0.06, 0.25 * v, i * 0.05); break;
      case 'power': this.osc('sawtooth', 200, 1600, 0.45, 0.25 * v); this.osc('sine', 400, 3200, 0.5, 0.2 * v); this.nz(0.4, 0.3 * v, 'bandpass', 500, 6000, 0, 2); break;
      case 'blink': this.osc('sine', 1800, 200, 0.2, 0.4 * v); this.osc('triangle', 300, 2400, 0.2, 0.25 * v); break;
      case 'slam': this.osc('sine', 90, 25, 0.8, 1.2 * v); this.nz(0.6, 1 * v, 'lowpass', 800, 60); break;
      case 'warp': this.osc('sine', 600, 80, 1.2, 0.5 * v); this.osc('sine', 606, 81, 1.2, 0.5 * v); break;
      case 'deflect': this.osc('sine', 2400 * r, 1800, 0.25, 0.35 * v); this.osc('sine', 3600 * r, 3000, 0.2, 0.2 * v); break;
      case 'jump': this.osc('square', 250 * r, 520, 0.09, 0.15 * v); break;
      case 'dash': this.nz(0.22, 0.5 * v, 'bandpass', 300, 3500, 0, 2); break;
      case 'hurt': this.osc('square', 260 * r, 120, 0.12, 0.2 * v); break;
      case 'die': this.osc('sawtooth', 500 * r, 50, 0.6, 0.3 * v); this.nz(0.3, 0.5 * v, 'lowpass', 1500, 200); break;
      case 'ko': this.osc('sine', 60, 30, 1.2, 1.2 * v); this.nz(1.0, 0.8 * v, 'lowpass', 4000, 80); this.osc('sawtooth', 100, 1600, 0.6, 0.15 * v, 0.1); break;
      case 'pickup': [660, 880, 1320].forEach((f, i) => this.osc('triangle', f, f, 0.12, 0.3 * v, i * 0.06)); break;
      case 'heal': [520, 660, 780, 1040].forEach((f, i) => this.osc('sine', f, f, 0.2, 0.25 * v, i * 0.05)); break;
      case 'empty': this.osc('square', 1400, 1400, 0.03, 0.1 * v); break;
      case 'ui': this.osc('sine', 1300, 1300, 0.04, 0.15 * v); break;
      case 'uiok': this.osc('triangle', 700, 700, 0.07, 0.3 * v); this.osc('triangle', 1050, 1050, 0.12, 0.3 * v, 0.06); break;
      case 'zombie': { const f = 70 + Math.random() * 50; this.osc('sawtooth', f, f * 0.7, 0.7, 0.12 * v); this.nz(0.7, 0.2 * v, 'bandpass', 500, 300, 0, 6); break; }
      case 'screech': this.osc('sawtooth', 1800 * r, 900, 0.3, 0.1 * v); this.osc('sawtooth', 2300 * r, 1200, 0.3, 0.06 * v); break;
      case 'roar': this.nz(1.4, 1 * v, 'lowpass', 600, 120, 0, 4); this.osc('sawtooth', 60, 40, 1.4, 0.4 * v); break;
      case 'wave': [440, 554, 659].forEach(f => this.osc('sawtooth', f, f, 0.9, 0.1 * v)); this.osc('sine', 110, 110, 1, 0.4 * v); break;
      case 'splat': this.nz(0.15, 0.6 * v, 'lowpass', 900, 200, 0, 3); break;
      case 'crate': this.nz(0.3, 0.8 * v, 'bandpass', 700, 300, 0, 1); this.osc('triangle', 180, 70, 0.2, 0.5 * v); break;
    }
  },

  // --- music: tiny step sequencer ---
  TRACKS: {
    menu:   { bpm: 96,  prog: [57, 53, 48, 55], minor: [0, 0, 1, 1], kick: 'x.......x.......', snare: '........x.......', hat: '..x...x...x...x.', bass: 'x.....x.x.......', arp: [0, 7, 12, 15, 12, 7, 3, 7], lead: 'triangle', pad: true },
    battle: { bpm: 140, prog: [45, 41, 48, 43], minor: [0, 0, 1, 1], kick: 'x...x...x...x..x', snare: '....x.......x...', hat: 'x.x.x.x.x.x.xxx.', bass: 'x.xx.xx.x.xx.x.x', arp: [0, 12, 7, 12, 3, 12, 7, 15], lead: 'square', pad: false },
    zombie: { bpm: 110, prog: [45, 46, 45, 40], minor: [0, 0, 0, 0], kick: 'x.....x.x.......', snare: '....x.......x..x', hat: 'x...x...x...x...', bass: 'x..x..x.x..x..x.', arp: [0, 1, 7, 6, 0, 13, 7, 3], lead: 'sawtooth', pad: true },
    boss:   { bpm: 160, prog: [45, 46, 43, 44], minor: [0, 0, 0, 0], kick: 'x.x.x.x.x.x.x.x.', snare: '....x.......x.x.', hat: 'xxxxxxxxxxxxxxxx', bass: 'xxx.xxx.xxx.xx.x', arp: [0, 3, 6, 12, 15, 12, 6, 3], lead: 'sawtooth', pad: false },
  },
  music(name) {
    if (!this.ctx) { this.pending = name; return; }
    if (this.track === this.TRACKS[name]) return;
    this.track = this.TRACKS[name] || null; this.step = 0; this.next = this.ctx.currentTime + 0.1;
  },
  tick() {
    const tr = this.track; if (!tr || this.vol.music <= 0) return;
    const c = this.ctx, sp = 60 / tr.bpm / 4;
    while (this.next < c.currentTime + 0.12) {
      const s = this.step % 16, bar = Math.floor(this.step / 16) % tr.prog.length, root = tr.prog[bar];
      const t = this.next - c.currentTime, M = this.mus, hz = n => 440 * Math.pow(2, (n - 69) / 12);
      if (tr.kick[s] === 'x') { this.osc('sine', 150, 40, 0.25, 0.9, t, M); }
      if (tr.snare[s] === 'x') { this.nz(0.18, 0.45, 'highpass', 1500, 1500, t, 1, M); this.osc('triangle', 220, 150, 0.08, 0.3, t, M); }
      if (tr.hat[s] === 'x') this.nz(0.03, 0.15, 'highpass', 8000, 8000, t, 1, M);
      if (tr.bass[s] === 'x') this.osc('sawtooth', hz(root - 12), hz(root - 12), sp * 1.6, 0.22, t, M);
      if (s % 2 === 0) {
        let n = tr.arp[(s / 2) % tr.arp.length]; if (tr.minor[bar] && n % 12 === 3) n += 1; // major chords on bars 3-4
        this.osc(tr.lead, hz(root + 12 + n), hz(root + 12 + n), sp * 1.8, 0.06, t, M);
      }
      if (tr.pad && s === 0) [0, tr.minor[bar] ? 4 : 3, 7].forEach(n => this.osc('triangle', hz(root + n), hz(root + n), sp * 15, 0.05, t, M));
      this.next += sp; this.step++;
    }
  },
};
