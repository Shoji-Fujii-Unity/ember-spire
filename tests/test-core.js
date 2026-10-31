/* Node-side checks for the pure logic modules (no browser needed).
   Run:  node tests/test-core.js                                                */
'use strict';

const path = require('path');
const A = (f) => require(path.join(__dirname, '..', 'assets', f));

const Dungeon = A('dungeon.js');
const Sprites = A('sprites.js');

let fails = 0;
function ok(cond, label) {
  if (!cond) { fails++; console.log('  FAIL ' + label); }
}

/* ---- sprite sheets -------------------------------------------------- */
const spriteProblems = Sprites.verify();
ok(spriteProblems.length === 0, 'sprite maps valid: ' + spriteProblems.join('; '));

/* ---- dungeon generation --------------------------------------------- */
let sealedTotal = 0, lockedFloors = 0, minOpen = Infinity, maxOpen = 0;
for (let floor = 1; floor <= 40; floor++) {
  for (let seed = 0; seed < 20; seed++) {
    const rand = Dungeon.rng((floor * 7919 + seed * 104729) >>> 0);
    const g = Dungeon.generate(floor, rand);
    const label = 'floor ' + floor + ' seed ' + seed;

    ok(g.tiles.length === g.h, label + ': row count');
    let open = 0;
    for (const row of g.tiles) {
      ok(row.length === g.w, label + ': row width');
      for (const ch of row) if (Dungeon.isFloor(ch)) open++;
    }
    minOpen = Math.min(minOpen, open); maxOpen = Math.max(maxOpen, open);
    ok(open > 90, label + ': enough open floor (' + open + ')');

    // start + stairs sit on open ground and are distinct
    ok(Dungeon.isFloor(Dungeon.at(g.tiles, g.start.x, g.start.y)), label + ': start open');
    ok(Dungeon.isFloor(Dungeon.at(g.tiles, g.stairs.x, g.stairs.y)), label + ': stairs open');
    ok(!(g.start.x === g.stairs.x && g.start.y === g.stairs.y), label + ': start != stairs');

    // fully connected: every open cell reachable ignoring the lock
    const all = reachSet(g, -1, -1);
    const cells = Dungeon.openCells(g.tiles, g.w, g.h);
    let unreachable = 0;
    for (const c of cells) if (!all.has(c.x + ',' + c.y)) unreachable++;
    ok(unreachable === 0, label + ': all open cells connected (' + unreachable + ')');

    // a lock, when present, must never block the way down
    if (g.doorCells.length) {
      lockedFloors++;
      const d = g.doorCells[0];
      const withoutLock = reachSet(g, d.x, d.y);
      ok(withoutLock.has(g.stairs.x + ',' + g.stairs.y), label + ': stairs reachable without the key');
      ok(withoutLock.has(g.start.x + ',' + g.start.y), label + ': start reachable without the key');
      sealedTotal += g.sealed.length;
      for (const s of g.sealed) {
        ok(!withoutLock.has(s[0] + ',' + s[1]), label + ': sealed cell really sealed');
      }
    }

    // pathfinding finds the stairs, and never routes through the lock
    const p = Dungeon.path(g.tiles, g.w, g.h, g.start.x, g.start.y, g.stairs.x, g.stairs.y, 400, null);
    ok(Array.isArray(p) && p.length > 0, label + ': path to stairs');
    if (p) {
      for (const st of p) ok(Dungeon.isFloor(Dungeon.at(g.tiles, st.x, st.y)), label + ': path cell walkable');
      if (g.doorCells.length) {
        const d = g.doorCells[0];
        ok(!p.some((s) => s.x === d.x && s.y === d.y), label + ': path avoids locked door');
      }
    }

    // line of sight / FOV sanity
    const lit = Dungeon.fov(g.tiles, g.w, g.h, g.start.x, g.start.y, 6);
    ok(lit.length >= 9, label + ': fov lights at least the immediate area (' + lit.length + ')');
    ok(lit.indexOf(g.start.y * g.w + g.start.x) >= 0, label + ': fov includes the walker');
  }
}

function reachSet(g, bx, by) {
  const list = Dungeon.reach(g.tiles, g.w, g.h, g.start.x, g.start.y, bx, by);
  const set = new Set();
  for (const c of list) set.add(c[0] + ',' + c[1]);
  return set;
}

console.log('dungeons: 800 floors, ' + lockedFloors + ' with a locked vault, ' +
  sealedTotal + ' sealed cells total, open cells ' + minOpen + '-' + maxOpen);

/* ---- translation coverage ------------------------------------------- */
const I18N = A('i18n.js');
const langs = I18N.LANGS;
const keysets = langs.map((l) => new Set(Object.keys(I18N.STR[l])));
for (let i = 1; i < langs.length; i++) {
  for (const k of keysets[0]) ok(keysets[i].has(k), 'missing ' + langs[i] + ' key: ' + k);
  for (const k of keysets[i]) ok(keysets[0].has(k), 'extra ' + langs[i] + ' key: ' + k);
}
for (const l of langs) {
  for (const k of Object.keys(I18N.STR[l])) {
    const v = I18N.STR[l][k];
    ok(typeof v === 'string' && v.length > 0, 'empty value ' + l + '.' + k);
  }
}
// templates must match across languages
function params(s) { return (s.match(/\{\w+\}/g) || []).sort().join(','); }
for (const k of keysets[0]) {
  const base = params(I18N.STR.en[k]);
  for (const l of langs) ok(params(I18N.STR[l][k]) === base, 'param mismatch ' + l + '.' + k);
}
ok(I18N.t('hud.floor', { n: 7 }) === 'B7', 'template substitution');
ok(I18N.t('no.such.key') === 'no.such.key', 'missing key falls back to the key itself');

/* ---- balance --------------------------------------------------------- */
const Rules = A('rules.js');

// Every floor 1..20 must be able to host its monsters, and every monster must
// belong to at least one floor in that span.
for (let floor = 1; floor <= 20; floor++) {
  const seen = [];
  for (let s = 0; s < 200; s++) seen.push(Rules.pickType(floor, Dungeon.rng(floor * 31 + s)));
  ok(seen.every((t) => Rules.MONSTERS[t] && !Rules.MONSTERS[t].boss), 'floor ' + floor + ' picks a hostable monster');
}
const hosted = new Set();
for (let floor = 1; floor <= 16; floor++) {
  for (let s = 0; s < 300; s++) hosted.add(Rules.pickType(floor, Dungeon.rng(floor * 977 + s)));
}
for (const t of Object.keys(Rules.MONSTERS)) {
  if (Rules.MONSTERS[t].w > 0) ok(hosted.has(t), 'monster never spawns: ' + t);
}

// Level pacing: clearing ~three quarters of B1-B9 should land a hero around Lv7-9.
let exp = 0, lvl = 1;
for (let floor = 1; floor <= 9; floor++) {
  const budget = Rules.monsterBudget(floor);
  for (let i = 0; i < budget; i++) {
    if ((floor * 13 + i * 7) % 4 === 3) continue;              // some monsters are dodged
    exp += Rules.MONSTERS[Rules.pickType(floor, Dungeon.rng(floor * 5741 + i))].exp;
  }
  while (exp >= Rules.expNext(lvl)) { exp -= Rules.expNext(lvl); lvl++; }
}
console.log('pacing: Lv' + lvl + ' by B10 (spare exp ' + exp + ')');
ok(lvl >= 6 && lvl <= 11, 'hero arrives at the boss properly levelled (got Lv' + lvl + ')');

function bossFight(cfg) {
  const rand = Dungeon.rng(4242);
  const p = { lvl: cfg.lvl, wi: cfg.wi, ai: cfg.ai, hp: Rules.maxHp(cfg.lvl), mp: Rules.maxMp(cfg.lvl), potions: cfg.potions };
  const m = Rules.spawn(cfg.boss, cfg.floor, 0, 0);
  let turns = 0, heals = 0;
  while (m.hp > 0 && p.hp > 0 && turns < 400) {
    turns++;
    if (p.hp < Rules.maxHp(p.lvl) * 0.35 && p.potions > 0) {
      p.potions--; heals++;
      p.hp = Math.min(Rules.maxHp(p.lvl), p.hp + Rules.potionHeal(p.lvl));
    }
    if (p.mp >= Rules.BOLT_COST && turns % 2 === 0) {
      p.mp -= Rules.BOLT_COST;
      m.hp -= Rules.damage(Rules.boltDamage(p.lvl, rand), m.def, rand, 0.5);
    } else {
      let d = Rules.damage(Rules.playerAtk(p), m.def, rand);
      if (rand() < Rules.critChance(p.lvl)) d = Math.round(d * 1.6);
      m.hp -= d;
    }
    if (m.hp <= 0) break;
    p.hp -= Rules.damage(m.atk, Rules.playerDef(p), rand);
  }
  return { won: m.hp <= 0, hp: p.hp, turns: turns, heals: heals };
}

const prepared = bossFight({ lvl: 8, wi: 4, ai: 3, potions: 3, boss: 'dragon', floor: 10 });
const rushed = bossFight({ lvl: 1, wi: 0, ai: 0, potions: 0, boss: 'dragon', floor: 10 });
console.log('boss, geared Lv8 + Ember Fang + Warded Plate:', JSON.stringify(prepared));
console.log('boss, rushed Lv1 in cloth:', JSON.stringify(rushed));
ok(prepared.won && prepared.hp > 0, 'a prepared hero beats the boss');
ok(!rushed.won && rushed.hp <= 0, 'an unprepared hero dies (the run keeps its stakes)');

// endless boss must out-scale the geared hero's ceiling, but still be beatable at Lv14
const endless = bossFight({ lvl: 14, wi: 4, ai: 3, potions: 4, boss: 'elder', floor: 20 });
console.log('boss, B20 elder at Lv14:', JSON.stringify(endless));
ok(endless.won, 'the deeper boss stays winnable for a maxed hero');

console.log(fails ? 'FAILED: ' + fails + ' problem(s)' : 'all core checks passed');
process.exit(fails ? 1 : 0);
