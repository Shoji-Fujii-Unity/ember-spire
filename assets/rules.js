/* Rules & balance — pure functions so the maths can be unit-tested in Node. */
(function (global) {
  'use strict';

  var WEAPONS = [
    { key: 'item.wpn0', atk: 1, min: 0 },   // starting kit
    { key: 'item.wpn1', atk: 3, min: 1 },
    { key: 'item.wpn2', atk: 5, min: 4 },
    { key: 'item.wpn3', atk: 8, min: 7 },
    { key: 'item.wpn4', atk: 11, min: 10 }
  ];

  var ARMORS = [
    { key: 'item.arm0', def: 0, min: 0 },
    { key: 'item.arm1', def: 2, min: 1 },
    { key: 'item.arm2', def: 4, min: 4 },
    { key: 'item.arm3', def: 7, min: 8 }
  ];

  /* shape = sprite map, pal = recolour of that map, min/max = floors it haunts. */
  var MONSTERS = {
    slime:    { shape: 'blob',   pal: { b: '#4fb96a', l: '#a6e79a', d: '#2b7a48' }, hp: 12, atk: 5,  def: 0, exp: 3,  gold: 4,   min: 1,  max: 4,  w: 30 },
    beetle:   { shape: 'beetle', pal: { b: '#8a6a35', l: '#caa25a', d: '#57431f' }, hp: 16, atk: 6,  def: 3, exp: 4,  gold: 5,   min: 1,  max: 5,  w: 25 },
    bat:      { shape: 'bat',    pal: { b: '#6c5b8c', l: '#9c8ab8' },              hp: 9,  atk: 6,  def: 0, exp: 2,  gold: 3,   min: 1,  max: 6,  w: 20, erratic: true },
    goblin:   { shape: 'human',  pal: { b: '#6fae5f', a: '#3f4a63' },              hp: 20, atk: 8,  def: 2, exp: 6,  gold: 9,   min: 2,  max: 7,  w: 20 },
    skeleton: { shape: 'human',  pal: { b: '#dfe3ea', a: '#9aa3b2', o: '#20242c' }, hp: 24, atk: 10, def: 4, exp: 8,  gold: 12,  min: 3,  max: 8,  w: 18 },
    spider:   { shape: 'spider', pal: { b: '#5b2b32', l: '#8e4c54' },              hp: 18, atk: 9,  def: 1, exp: 7,  gold: 8,   min: 4,  max: 10, w: 15, ranged: 4, web: true },
    ooze:     { shape: 'blob',   pal: { b: '#6d4f9e', l: '#a98fd0', d: '#3b2a5c', o: '#160f26' }, hp: 34, atk: 9, def: 2, exp: 9, gold: 10, min: 4, max: 10, w: 14, slow: true },
    wraith:   { shape: 'wraith', pal: { b: '#57d3c6', l: '#a8f3e8' },              hp: 26, atk: 14, def: 3, exp: 13, gold: 16,  min: 5,  max: 14, w: 12, haunt: true },
    imp:      { shape: 'human',  pal: { b: '#c8562b', a: '#3a2018', o: '#2a1008' }, hp: 22, atk: 15, def: 4, exp: 12, gold: 14, min: 6,  max: 16, w: 12, ranged: 3 },
    brigand:  { shape: 'human',  pal: { b: '#7b6a58', a: '#a03f3f' },              hp: 32, atk: 16, def: 5, exp: 15, gold: 28,  min: 5,  max: 16, w: 12, steals: true },
    knight:   { shape: 'human',  pal: { b: '#9fb0c6', a: '#3c6ea8', o: '#1c2430' }, hp: 46, atk: 18, def: 8, exp: 20, gold: 34,  min: 7,  max: 22, w: 10 },
    mimic:    { shape: 'mimic',  pal: { b: '#8a5a2b', l: '#c79055', a: '#e8c766' }, hp: 28, atk: 13, def: 4, exp: 16, gold: 30, min: 2,  max: 14, w: 0 },
    dragon:   { shape: 'dragon', pal: { b: '#c8562b', l: '#f5a45c', d: '#7f2f18', a: '#ffd166' }, hp: 150, atk: 20, def: 9, exp: 60, gold: 150, min: 10, max: 10, w: 0, boss: true },
    elder:    { shape: 'dragon', pal: { b: '#4f6fae', l: '#8fb6e8', d: '#26365e', a: '#c8e4ff', o: '#101a2e' }, hp: 240, atk: 26, def: 12, exp: 110, gold: 260, min: 20, max: 20, w: 0, boss: true }
  };

  function roll(rand, n) { return Math.floor(rand() * (n + 1)); }

  function maxHp(lvl) { return 34 + (lvl - 1) * 9; }
  function maxMp(lvl) { return 12 + (lvl - 1) * 2; }
  function expNext(lvl) { return 12 + (lvl - 1) * 10; }

  function playerAtk(p) { return 2 + (p.lvl - 1) + WEAPONS[p.wi].atk; }
  function playerDef(p) { return 1 + Math.floor(p.lvl / 2) + ARMORS[p.ai].def; }

  function scaleFor(type, floor) {
    var over = floor - MONSTERS[type].max;
    return over > 0 ? 1 + 0.05 * over : 1;
  }

  /* Instantiate a monster for a given depth. */
  function spawn(type, floor, x, y) {
    var m = MONSTERS[type], k = scaleFor(type, floor);
    return {
      t: type, x: x, y: y,
      hp: Math.round(m.hp * k), maxhp: Math.round(m.hp * k),
      atk: Math.round(m.atk * k), def: m.def + (k > 1 ? Math.floor((k - 1) * 6) : 0),
      exp: m.exp, gold: m.gold,
      cd: 0
    };
  }

  /* Melee / bolt damage. `pierce` ignores part of the target's armour. */
  function damage(atk, def, rand, pierce) {
    var eff = def - Math.round((pierce || 0) * def);
    return Math.max(1, atk - eff + roll(rand, 2));
  }

  function critChance(lvl) { return 0.08 + lvl * 0.004; }

  function boltDamage(lvl, rand) { return 7 + Math.round(lvl * 1.4) + roll(rand, 3); }
  var BOLT_COST = 6;
  var BOLT_RANGE = 5;

  function potionHeal(lvl) { return Math.max(12, Math.round(maxHp(lvl) * 0.45)); }
  function trapDamage(floor, rand) { return 4 + floor + roll(rand, 3); }

  /* How many monsters a floor carries. */
  function monsterBudget(floor) { return Math.min(14, 5 + Math.round(floor * 0.8)); }

  /* Weighted pick among the monsters that belong on this floor. */
  function pickType(floor, rand) {
    var pool = [], total = 0;
    for (var t in MONSTERS) {
      if (!Object.prototype.hasOwnProperty.call(MONSTERS, t)) continue;
      var m = MONSTERS[t];
      if (m.boss || !m.w) continue;
      if (floor < m.min || floor > m.max) continue;
      pool.push([t, m.w]); total += m.w;
    }
    if (!pool.length) return ['slime', 'beetle'][floor % 2];
    var r = rand() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= pool[i][1];
      if (r <= 0) return pool[i][0];
    }
    return pool[pool.length - 1][0];
  }

  /* Loot tiers available at a given depth. */
  function weaponTier(floor, rand) {
    var tiers = [];
    for (var i = 1; i < WEAPONS.length; i++) if (floor >= WEAPONS[i].min) tiers.push(i);
    if (!tiers.length) return 1;
    var bias = Math.floor(rand() * rand() * tiers.length);   // favour the better gear
    return tiers[tiers.length - 1 - bias];
  }
  function armorTier(floor, rand) {
    var tiers = [];
    for (var i = 1; i < ARMORS.length; i++) if (floor >= ARMORS[i].min) tiers.push(i);
    if (!tiers.length) return 1;
    var bias = Math.floor(rand() * rand() * tiers.length);
    return tiers[tiers.length - 1 - bias];
  }

  function goldPile(floor, rand) { return 8 + floor * 4 + roll(rand, 10 + floor * 3); }

  global.Rules = {
    WEAPONS: WEAPONS, ARMORS: ARMORS, MONSTERS: MONSTERS,
    BOLT_COST: BOLT_COST, BOLT_RANGE: BOLT_RANGE,
    roll: roll, maxHp: maxHp, maxMp: maxMp, expNext: expNext,
    playerAtk: playerAtk, playerDef: playerDef,
    spawn: spawn, scaleFor: scaleFor, damage: damage, critChance: critChance,
    boltDamage: boltDamage, potionHeal: potionHeal, trapDamage: trapDamage,
    monsterBudget: monsterBudget, pickType: pickType,
    weaponTier: weaponTier, armorTier: armorTier, goldPile: goldPile
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Rules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
