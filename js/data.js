// All game content as plain tables. Add a weapon/power/map = add a row.
'use strict';

const WEAPONS = {
  fists:   { name: 'Fists',    type: 'melee', dmg: 7,  range: 36, arc: 1.3, cd: 0.26, kb: 200, style: 'punch', snd: 'punch' },
  knife:   { name: 'Knife',    type: 'melee', dmg: 14, range: 42, arc: 1.0, cd: 0.22, kb: 160, style: 'stab',  shape: 'knife',  len: 14, color: '#d8dde6', snd: 'slash', trail: '#ffffff' },
  dagger:  { name: 'Daggers',  type: 'melee', dmg: 10, range: 40, arc: 1.2, cd: 0.14, kb: 120, style: 'stab',  shape: 'dagger', len: 12, color: '#b9c3d6', snd: 'slash', trail: '#cc88ff' , dual: true },
  katana:  { name: 'Katana',   type: 'melee', dmg: 26, range: 74, arc: 2.3, cd: 0.42, kb: 300, style: 'slash', shape: 'katana', len: 48, color: '#eef4ff', snd: 'slash', trail: '#77ffff', deflect: true },
  saber:   { name: 'Plasma Saber', type: 'melee', dmg: 30, range: 78, arc: 2.4, cd: 0.38, kb: 320, style: 'slash', shape: 'saber', len: 50, color: '#ff44ff', snd: 'saber', trail: '#ff44ff', deflect: true, glow: true },
  bat:     { name: 'Bat',      type: 'melee', dmg: 20, range: 62, arc: 2.0, cd: 0.52, kb: 620, style: 'smash', shape: 'bat',    len: 40, color: '#c8955a', snd: 'bonk',  trail: '#ffdd88', deflect: true },
  pan:     { name: 'Frying Pan', type: 'melee', dmg: 22, range: 52, arc: 1.9, cd: 0.5, kb: 480, style: 'smash', shape: 'pan',  len: 30, color: '#3a3f47', snd: 'clang', trail: '#ffffff', deflect: true },
  hammer:  { name: 'Sledgehammer', type: 'melee', dmg: 42, range: 66, arc: 1.6, cd: 0.95, kb: 800, style: 'overhead', shape: 'hammer', len: 44, color: '#777777', snd: 'bonk', trail: '#ffaa55', shake: 10 },
  pistol:  { name: 'Pistol',   type: 'gun', dmg: 15, cd: 0.26, speed: 1300, spread: 0.03, ammo: 14, kb: 140, shape: 'pistol', snd: 'pistol', recoil: 4, tracer: '#ffe08a' },
  smg:     { name: 'SMG',      type: 'gun', dmg: 8,  cd: 0.07, speed: 1300, spread: 0.13, ammo: 45, kb: 70, auto: true, shape: 'smg', snd: 'smg', recoil: 3, tracer: '#ffd060' },
  rifle:   { name: 'Assault Rifle', type: 'gun', dmg: 13, cd: 0.11, speed: 1600, spread: 0.05, ammo: 32, kb: 120, auto: true, shape: 'rifle', snd: 'rifle', recoil: 4, tracer: '#ffb84a' },
  shotgun: { name: 'Shotgun',  type: 'gun', dmg: 9,  cd: 0.75, speed: 1200, spread: 0.32, pellets: 8, ammo: 7, kb: 220, shape: 'shotgun', snd: 'shotgun', recoil: 10, tracer: '#ffcf70', shake: 6 },
  sniper:  { name: 'Sniper',   type: 'gun', dmg: 80, cd: 1.25, speed: 3200, spread: 0, ammo: 5, kb: 600, pierce: 3, shape: 'sniper', snd: 'sniper', recoil: 14, tracer: '#99eeff', laserSight: true, shake: 9 },
  minigun: { name: 'Minigun',  type: 'gun', dmg: 6,  cd: 0.04, speed: 1500, spread: 0.16, ammo: 160, kb: 60, auto: true, shape: 'minigun', snd: 'smg', recoil: 2, tracer: '#ffa040', slow: 0.6 },
  glauncher: { name: 'Grenade Launcher', type: 'gun', proj: 'grenade', dmg: 55, radius: 120, cd: 0.8, speed: 620, spread: 0.05, ammo: 6, kb: 700, shape: 'launcher', snd: 'thunk', recoil: 9, impact: true },
  rocket:  { name: 'Rocket Launcher', type: 'gun', proj: 'rocket', dmg: 65, radius: 130, cd: 1.1, speed: 760, spread: 0, ammo: 4, kb: 850, shape: 'rocketl', snd: 'rocket', recoil: 12, shake: 6 },
  grenade: { name: 'Grenades', type: 'gun', proj: 'grenade', dmg: 60, radius: 130, cd: 0.6, speed: 520, spread: 0, ammo: 3, kb: 800, shape: 'grenade', snd: 'throw', recoil: 0, fuse: 1.6, thrown: true },
  tknives: { name: 'Throwing Knives', type: 'gun', proj: 'knife', dmg: 24, cd: 0.3, speed: 950, spread: 0.02, ammo: 8, kb: 150, shape: 'knife', len: 14, color: '#d8dde6', snd: 'throw', recoil: 0, thrown: true },
};
// What can drop from crates / sky. Weighted by repeats.
const DROP_POOL = ['knife', 'dagger', 'katana', 'katana', 'saber', 'bat', 'bat', 'pan', 'pan', 'hammer',
  'pistol', 'pistol', 'smg', 'rifle', 'rifle', 'shotgun', 'shotgun', 'sniper', 'minigun', 'glauncher', 'rocket', 'grenade', 'tknives'];

const POWERS = {
  speed:     { name: 'Super Speed',  color: '#44ffff', charge: 9,  dur: 5,   desc: 'Move and attack twice as fast, leave afterimages.' },
  strength:  { name: 'Super Damage', color: '#ff4444', charge: 11, dur: 6,   desc: 'x2.5 damage and huge knockback.' },
  laser:     { name: 'Laser Eyes',   color: '#ff3333', charge: 12, dur: 3,   desc: 'Burn everything you look at.' },
  deflect:   { name: 'Deflector',    color: '#66aaff', charge: 10, dur: 5,   desc: 'Bullets bounce back at their owner.' },
  blink:     { name: 'Blink',        color: '#cc66ff', charge: 5,  dur: 0,   desc: 'Teleport where you aim.' },
  shockwave: { name: 'Shockwave',    color: '#ffcc44', charge: 10, dur: 0,   desc: 'Slam the ground, launch everyone near.' },
  timewarp:  { name: 'Time Warp',    color: '#88ff88', charge: 14, dur: 4,   desc: 'Everyone else moves in slow motion.' },
  lightning: { name: 'Chain Lightning', color: '#aaeeff', charge: 10, dur: 0, desc: 'Lightning jumps between enemies.' },
  giant:     { name: 'Giant',        color: '#ffaa66', charge: 13, dur: 6,   desc: 'Grow huge. More HP, more damage.' },
  regen:     { name: 'Regeneration', color: '#55ff88', charge: 12, dur: 4,   desc: 'Heal rapidly.' },
};

const COLORS = ['#ffffff', '#ff4d4d', '#ff9f1c', '#ffe14d', '#7dff4d', '#2ee6a8', '#3ad7ff', '#4d7cff', '#a64dff', '#ff4dd2', '#ff8fa3', '#9aa0a6', '#222222', '#c58b52'];
const HEADS = ['circle', 'square', 'triangle', 'diamond', 'skull', 'hex', 'pumpkin'];
const HATS = ['none', 'cap', 'tophat', 'crown', 'horns', 'halo', 'headband', 'wizard', 'viking', 'ninja', 'cowboy', 'mohawk', 'beanie', 'pirate', 'chef', 'santa', 'propeller', 'bunny', 'cat', 'party', 'knight', 'grad'];
const EYES = ['dots', 'angry', 'visor', 'x', 'cyclops', 'shades', 'glow', 'wink', 'hearts', 'sleepy', 'stars', 'monocle'];
const BACKS = ['none', 'cape', 'scarf', 'wings', 'jetpack', 'katana', 'backpack', 'guitar', 'shield', 'quiver', 'batwings'];
const AURAS = ['none', 'fire', 'electric', 'shadow', 'rainbow', 'frost', 'toxic', 'gold', 'hearts'];

const DEFAULT_PROFILES = [
  { name: 'Blaze', color: '#ff4d4d', head: 'circle', hat: 'headband', eyes: 'angry', back: 'scarf', aura: 'fire', power: 'strength', thick: 4 },
  { name: 'Volt',  color: '#3ad7ff', head: 'circle', hat: 'cap', eyes: 'visor', back: 'cape', aura: 'electric', power: 'speed', thick: 4 },
  { name: 'Jade',  color: '#7dff4d', head: 'diamond', hat: 'ninja', eyes: 'dots', back: 'katana', aura: 'none', power: 'blink', thick: 4 },
  { name: 'Vex',   color: '#a64dff', head: 'square', hat: 'wizard', eyes: 'glow', back: 'wings', aura: 'shadow', power: 'laser', thick: 4 },
];

// Monster/zombie roster. Everything is a stickman, some are weirder stickmen.
const ENEMIES = {
  thug:     { name: 'Thug',     hp: 60,  speed: 1.0,  dmg: 1,   score: 100, ai: 'bot', look: { color: '#9aa0a6', head: 'circle', hat: 'cap', eyes: 'angry', back: 'none', aura: 'none' } },
  zombie:   { name: 'Zombie',   hp: 45,  speed: 0.45, dmg: 10,  score: 100, ai: 'melee', range: 34, cd: 0.9, look: { color: '#7fae6a', head: 'circle', hat: 'none', eyes: 'x', back: 'none', aura: 'none', zombie: true } },
  runner:   { name: 'Runner',   hp: 30,  speed: 0.95, dmg: 8,   score: 120, ai: 'melee', range: 32, cd: 0.6, look: { color: '#a8c45a', head: 'skull', hat: 'none', eyes: 'glow', back: 'none', aura: 'none', zombie: true } },
  fatty:    { name: 'Bloater',  hp: 160, speed: 0.32, dmg: 18,  score: 250, ai: 'melee', range: 40, cd: 1.3, scale: 1.45, explodes: true, look: { color: '#5d8a4e', head: 'circle', hat: 'none', eyes: 'x', back: 'none', aura: 'none', zombie: true, fat: true } },
  spitter:  { name: 'Spitter',  hp: 40,  speed: 0.5,  dmg: 14,  score: 180, ai: 'ranged', proj: 'acid', range: 380, cd: 2.0, look: { color: '#9bd84a', head: 'triangle', hat: 'none', eyes: 'glow', back: 'none', aura: 'none', zombie: true } },
  skeleton: { name: 'Skeleton', hp: 40,  speed: 0.7,  dmg: 16,  score: 150, ai: 'ranged', proj: 'arrow', range: 520, cd: 1.6, look: { color: '#e8e2cf', head: 'skull', hat: 'none', eyes: 'glow', back: 'none', aura: 'none' } },
  spider:   { name: 'Stick Spider', hp: 50, speed: 1.1, dmg: 12, score: 180, ai: 'leaper', range: 200, cd: 1.6, body: 'spider', look: { color: '#2b2b36', eyes: 'glow' } },
  bat:      { name: 'Stick Bat', hp: 25, speed: 1.2,  dmg: 8,   score: 140, ai: 'flyer', range: 30, cd: 0.8, body: 'bat', fly: 48, look: { color: '#4a2f5c', eyes: 'glow' } },
  brute:    { name: 'Brute',    hp: 320, speed: 0.4,  dmg: 30,  score: 500, ai: 'brute', range: 70, cd: 2.2, scale: 2.1, look: { color: '#b0563c', head: 'square', hat: 'horns', eyes: 'angry', back: 'none', aura: 'none' } },
  demon:    { name: 'STICK DEMON', hp: 950, speed: 0.55, dmg: 35, score: 3000, ai: 'boss', range: 90, cd: 1.8, scale: 3, boss: true, look: { color: '#ff3344', head: 'triangle', hat: 'horns', eyes: 'glow', back: 'wings', aura: 'fire' } },
  necro:    { name: 'NECROSTICK', hp: 800, speed: 0.6, dmg: 25, score: 3000, ai: 'boss', range: 80, cd: 1.6, scale: 2.6, boss: true, summons: true, look: { color: '#7d6bff', head: 'skull', hat: 'wizard', eyes: 'glow', back: 'cape', aura: 'shadow' } },
};

// Wave composition per survival mode: function(wave) -> list of enemy ids
const WAVES = {
  infinite: w => mix(w, w % 5 === 0 ? ['demon'] : [], [['thug', 3], ['zombie', 1], ['skeleton', w > 2 ? 1 : 0], ['spider', w > 3 ? 1 : 0], ['brute', w > 6 ? 0.3 : 0]], 2 + w * 2),
  zombies:  w => mix(w, w % 5 === 0 ? ['necro'] : [], [['zombie', 5], ['runner', w > 1 ? 2 : 0], ['fatty', w > 2 ? 1 : 0], ['spitter', w > 3 ? 1 : 0]], 4 + w * 3),
  monsters: w => mix(w, w % 5 === 0 ? ['demon'] : [], [['spider', 3], ['bat', 2], ['skeleton', 2], ['brute', w > 2 ? 0.6 : 0]], 3 + w * 2),
};
function mix(w, extra, table, n) {
  const total = table.reduce((s, t) => s + t[1], 0), out = extra.slice();
  for (let i = 0; i < n; i++) {
    let r = Math.random() * total;
    for (const [id, wt] of table) { if ((r -= wt) <= 0) { out.push(id); break; } }
  }
  return out;
}

// Maps: floating isometric arenas. obs = [x, y, w, d, h, kind]
const MAPS = [
  { id: 'neon', name: 'Neon Rooftop', size: [1000, 900], theme: 'city', weather: 'rain', music: 'battle',
    sky: ['#05010f', '#1b0a3a', '#4a1260'], tileA: '#1c1f2e', tileB: '#23273a', grid: '#ff2bd6', side: '#2a2440', rim: '#ff2bd6', voidGlow: '#ff2bd655',
    obs: [[180, 180, 70, 70, 50, 'crate'], [750, 180, 90, 60, 40, 'box'], [460, 420, 80, 80, 90, 'pillar'], [200, 660, 60, 60, 50, 'crate'], [780, 650, 70, 70, 50, 'crate']] },
  { id: 'dojo', name: 'Sunset Dojo', size: [950, 950], theme: 'temple', weather: 'petals', music: 'battle',
    sky: ['#ff7e5f', '#feb47b', '#ffd9a0'], tileA: '#a8743f', tileB: '#9b6a38', grid: '#6b4520', side: '#5e3a1c', rim: '#e8c27a', voidGlow: '#ffb47b33',
    obs: [[150, 150, 50, 50, 110, 'lantern'], [750, 150, 50, 50, 110, 'lantern'], [150, 750, 50, 50, 110, 'lantern'], [750, 750, 50, 50, 110, 'lantern'], [440, 440, 70, 70, 45, 'crate']] },
  { id: 'grave', name: 'Midnight Graveyard', size: [1050, 950], theme: 'graveyard', weather: 'fog', music: 'zombie',
    sky: ['#02060a', '#0b1f24', '#1d3b3a'], tileA: '#2c3a2a', tileB: '#334430', grid: '#1a2418', side: '#2a2a2e', rim: '#66ff99', voidGlow: '#44ff8833',
    obs: [[200, 220, 50, 25, 55, 'tomb'], [320, 640, 50, 25, 55, 'tomb'], [700, 260, 50, 25, 55, 'tomb'], [820, 700, 50, 25, 55, 'tomb'], [500, 460, 90, 60, 40, 'crate'], [560, 150, 50, 25, 55, 'tomb']] },
  { id: 'forge', name: 'Lava Forge', size: [1000, 1000], theme: 'lava', weather: 'embers', music: 'battle',
    sky: ['#1a0000', '#4a0800', '#a32100'], tileA: '#1e1b1b', tileB: '#272222', grid: '#ff5a00', side: '#1a1414', rim: '#ff6a00', voidGlow: '#ff4a0066',
    obs: [[220, 220, 90, 90, 70, 'rock'], [700, 230, 70, 70, 50, 'crate'], [250, 720, 70, 70, 50, 'crate'], [690, 690, 100, 100, 80, 'rock']] },
  { id: 'peak', name: 'Frozen Peak', size: [950, 900], theme: 'ice', weather: 'snow', music: 'battle', slippery: true,
    sky: ['#020617', '#0b1d4a', '#1e3a8a'], tileA: '#b9d7ef', tileB: '#a8cbe8', grid: '#e8f6ff', side: '#4d6f99', rim: '#cfefff', voidGlow: '#7fd4ff44',
    obs: [[200, 200, 60, 60, 60, 'ice'], [700, 640, 60, 60, 60, 'ice'], [460, 430, 70, 70, 45, 'crate'], [720, 180, 60, 60, 45, 'crate']] },
];

const MODES = {
  brawl:    { name: 'BRAWL',       desc: 'Free-for-all or teams. Friends + bots. Last stick standing.', icon: '⚔' },
  infinite: { name: 'INFINITE',    desc: 'Endless waves of armed sticks. How long can you last?', icon: '∞' },
  zombies:  { name: 'ZOMBIES',     desc: 'Undead sticks rise in hordes. Bosses every 5 waves.', icon: '☠' },
  monsters: { name: 'MONSTERS',    desc: 'Spiders, bats, brutes and the Stick Demon.', icon: '👹' },
};
