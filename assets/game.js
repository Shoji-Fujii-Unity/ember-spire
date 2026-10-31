/* EMBER SPIRE — game layer: state, turns, rendering, input, persistence. */
(function (global) {
  'use strict';

  var I18N = global.I18N, Sprites = global.Sprites, Rules = global.Rules, Dungeon = global.Dungeon;
  var t = I18N.t;

  /* ── constants ─────────────────────────────────────────────── */
  var VW = 15, VH = 19;          // viewport in tiles (portrait)
  var LIGHT_R = 6;
  var WIN_FLOOR = 10;            // the Cinder Dragon waits here
  var SAVE_KEY = 'ember-spire:save:v1';
  var META_KEY = 'ember-spire:meta:v1';
  var VERSION = 1;

  var $ = function (id) { return document.getElementById(id); };

  /* ── persisted preferences / records ───────────────────────── */
  var meta = {
    lang: null, sound: true,
    best: 0, runs: 0, kills: 0, gold: 0, deepest: 0
  };

  var snd = new global.Sound();
  var S = null;                  // the current run
  var viewSeed = 20261030;       // stable seed for tile shading (survives S being null)
  var lit = {}, seen = {};       // visibility sets keyed by tile index
  var fx = [];                   // transient visual effects
  var cam = { x: 0, y: 0 };
  var shake = 0, hurtFlash = 0;
  var walk = null;               // auto-walk queue
  var paused = true, over = false;
  var canvas, ctx, TS = 24, dpr = 1, viewW = 0, viewH = 0;
  var lastFrame = 0, timeMs = 0;

  /* ── tiny helpers ──────────────────────────────────────────── */
  function idx(x, y) { return y * S.w + x; }
  function inMap(x, y) { return x >= 0 && y >= 0 && x < S.w && y < S.h; }
  function tileAt(x, y) { return S.tiles[y].charAt(x); }
  function setTile(x, y, ch) { S.tiles[y] = S.tiles[y].substring(0, x) + ch + S.tiles[y].substring(x + 1); }
  function rand() {
    S.rng = (S.rng + 0x6D2B79F5) >>> 0;
    var z = S.rng;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }
  function ri(n) { return Math.floor(rand() * n); }
  function hash2(x, y, k) {
    var h = (x * 374761393 + y * 668265263 + k * 2246822519 + viewSeed) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0; h = Math.imul(h, 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function monAt(x, y) {
    for (var i = 0; i < S.mon.length; i++) if (S.mon[i].x === x && S.mon[i].y === y) return S.mon[i];
    return null;
  }
  function itemAt(x, y) {
    for (var i = 0; i < S.items.length; i++) if (S.items[i].x === x && S.items[i].y === y) return S.items[i];
    return null;
  }
  function trapAt(x, y) {
    for (var i = 0; i < S.traps.length; i++) if (S.traps[i].x === x && S.traps[i].y === y) return S.traps[i];
    return null;
  }
  function itemName(kind) { return kind >= 0 ? t(Rules.WEAPONS[kind].key) : ''; }

  /* ── messages ──────────────────────────────────────────────── */
  function say(key, params, tone) {
    var log = $('log');
    var p = document.createElement('p');
    p.textContent = t(key, params);
    if (tone) p.className = tone;
    log.appendChild(p);
    while (log.childNodes.length > 3) log.removeChild(log.firstChild);
    var kids = log.childNodes;
    for (var i = 0; i < kids.length - 1; i++) kids[i].classList.add('old');
  }
  var toastTimer = 0;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { el.classList.remove('show'); }, 1500);
  }

  /* ── new floor ─────────────────────────────────────────────── */
  function startFloor(n, keepPos) {
    viewSeed = (S.seed >>> 0) ^ (n * 2654435761);
    var gen = Dungeon.generate(n, rand);
    S.floor = n;
    S.w = gen.w; S.h = gen.h;
    S.tiles = gen.tiles;
    S.items = []; S.mon = []; S.traps = [];
    seen = {}; lit = {};

    var sealed = {};
    for (var q = 0; q < gen.sealed.length; q++) sealed[gen.sealed[q][0] + ',' + gen.sealed[q][1]] = 1;
    S.vault = gen.sealed.length ? gen.sealed : null;

    var open = Dungeon.openCells(S.tiles, S.w, S.h);
    var free = function (x, y) {
      if (Dungeon.at(S.tiles, x, y) !== Dungeon.FLOOR) return false;
      if (itemAt(x, y) || monAt(x, y) || trapAt(x, y)) return false;
      if (x === gen.start.x && y === gen.start.y) return false;
      return true;
    };
    var pickCell = function (onlyVault, notVault) {
      var pool = [];
      for (var i = 0; i < open.length; i++) {
        var c = open[i];
        if (!free(c.x, c.y)) continue;
        var isIn = !!sealed[c.x + ',' + c.y];
        if (onlyVault && !isIn) continue;
        if (notVault && isIn) continue;
        pool.push(c);
      }
      if (!pool.length) return null;
      return pool[ri(pool.length)];
    };

    // the way down
    S.items.push({ k: 'stairs', x: gen.stairs.x, y: gen.stairs.y });

    // loot: a guaranteed prize behind the locked door when there is one
    if (S.vault) {
      var chestIn = pickCell(true, false);
      if (chestIn) S.items.push({ k: 'chest', x: chestIn.x, y: chestIn.y, prize: true, tier: Rules.weaponTier(n, rand) });
      var k1 = pickCell(false, true);
      if (k1) S.items.push({ k: 'key', x: k1.x, y: k1.y });
    }

    var chests = 1 + ri(2);
    for (var c = 0; c < chests; c++) {
      var cc = pickCell(false, true);
      if (cc) S.items.push({ k: 'chest', x: cc.x, y: cc.y, tier: rand() < 0.5 ? Rules.weaponTier(n, rand) : -1 });
    }
    for (var g2 = 0, gn = 2 + ri(2); g2 < gn; g2++) {
      var gc = pickCell(false, true);
      if (gc) S.items.push({ k: 'gold', x: gc.x, y: gc.y, v: Rules.goldPile(n, rand) });
    }
    for (var pn = 1 + ri(3), p2 = 0; p2 < pn; p2++) {
      var pc = pickCell(false, true);
      if (pc) S.items.push({ k: 'potion', x: pc.x, y: pc.y });
    }
    if (rand() < 0.6) {
      var kc = pickCell(false, true);
      if (kc) S.items.push({ k: 'key', x: kc.x, y: kc.y });
    }
    if (n >= 2 && rand() < 0.4) {
      var ac = pickCell(false, true);
      if (ac) S.items.push({ k: 'armor', x: ac.x, y: ac.y, tier: Rules.armorTier(n, rand) });
    }
    if (n >= 2 && rand() < 0.45) {
      var wc = pickCell(false, true);
      if (wc) S.items.push({ k: 'weapon', x: wc.x, y: wc.y, tier: Rules.weaponTier(n, rand) });
    }

    // hidden traps
    for (var tn = 2 + Math.floor(n / 2), ti = 0; ti < tn; ti++) {
      var tc = pickCell(false, true);
      if (tc) S.traps.push({ x: tc.x, y: tc.y, seen: false });
    }

    // monsters, kept away from the entry
    var budget = Rules.monsterBudget(n);
    var far = [];
    for (var f = 0; f < open.length; f++) {
      var o = open[f];
      var d = Math.abs(o.x - gen.start.x) + Math.abs(o.y - gen.start.y);
      if (d >= 6 && free(o.x, o.y)) far.push(o);
    }
    for (var mi = 0; mi < budget && far.length; mi++) {
      var cell = far.splice(ri(far.length), 1)[0];
      var type = Rules.pickType(n, rand);
      S.mon.push(Rules.spawn(type, n, cell.x, cell.y));
    }
    // the boss (every tenth floor)
    if (n % WIN_FLOOR === 0) {
      var bossType = n >= WIN_FLOOR * 2 ? 'elder' : 'dragon';
      var bc = null, bestD = -1;
      for (var b = 0; b < open.length; b++) {
        var o2 = open[b];
        var dd = Math.abs(o2.x - gen.start.x) + Math.abs(o2.y - gen.start.y);
        if (free(o2.x, o2.y) && dd > bestD) { bestD = dd; bc = o2; }
      }
      if (bc) S.mon.push(Rules.spawn(bossType, n, bc.x, bc.y));
    }

    if (keepPos && S.p.x !== undefined) {
      // entering from the stairs of the previous floor: land next to the entry
      S.p.x = gen.start.x; S.p.y = gen.start.y;
    } else {
      S.p.x = gen.start.x; S.p.y = gen.start.y;
    }
    cam.x = clampCam(S.p.x - VW / 2, S.w - VW);
    cam.y = clampCam(S.p.y - VH / 2, S.h - VH);
    updateLight();
    $('log').innerHTML = '';
    say('msg.floor', { n: n }, 'good');
    say('msg.floorHint');
    if (n % WIN_FLOOR === 0 && S.mon.some(function (m) { return Rules.MONSTERS[m.t].boss; })) say('msg.bossWarn', null, 'bad');
    hud();
    save();
  }

  function clampCam(v, max) { return Math.max(0, Math.min(max, v)); }

  function updateLight() {
    lit = {};
    var cells = Dungeon.fov(S.tiles, S.w, S.h, S.p.x, S.p.y, LIGHT_R);
    for (var i = 0; i < cells.length; i++) {
      lit[cells[i]] = 1;
      seen[cells[i]] = 1;
    }
  }

  /* ── the run ───────────────────────────────────────────────── */
  function newRun() {
    S = {
      seed: (Date.now() ^ (Math.random() * 0xffffff)) >>> 0,
      rng: (Date.now() ^ (Math.random() * 0xffffff)) >>> 0,
      floor: 1, turn: 0,
      kills: 0, goldFound: 0, committed: false,
      p: {
        lvl: 1, exp: 0,
        hp: Rules.maxHp(1), maxhp: Rules.maxHp(1),
        mp: Rules.maxMp(1), maxmp: Rules.maxMp(1),
        wi: 0, ai: 0, potions: 2, keys: 0, gold: 0
      }
    };
    over = false; paused = false; walk = null; fx = [];
    startFloor(1, false);
    meta.runs++;
    writeMeta();
    showScreen(null);
    snd.play('stair');
  }

  function descend() {
    snd.play('stair');
    startFloor(S.floor + 1, true);
  }

  /* ── combat ────────────────────────────────────────────────── */
  function hitMonster(m, mult, pierce, label) {
    var base = Rules.playerAtk(S.p);
    var dmg = label === 'bolt'
      ? Rules.damage(Rules.boltDamage(S.p.lvl, rand), m.def, rand, pierce)
      : Rules.damage(Math.round(base * (mult || 1)), m.def, rand, pierce);
    var crit = label !== 'bolt' && rand() < Rules.critChance(S.p.lvl);
    if (crit) dmg = Math.round(dmg * 1.6);
    m.hp -= dmg;
    addFx('float', m.x, m.y, '-' + dmg, crit ? '#ffd166' : '#ffe6e6');
    addFx('spark', m.x, m.y, crit ? '#ffd166' : '#ff8f6a');
    shake = Math.max(shake, crit ? 6 : 3);
    snd.play(crit ? 'crit' : (label === 'bolt' ? 'boom' : 'hit'));
    say(crit ? 'msg.crit' : 'msg.hit', { name: t('mon.' + m.t), n: dmg }, 'good');
    if (m.hp <= 0) killMonster(m);
    return dmg;
  }

  function killMonster(m) {
    var def = Rules.MONSTERS[m.t];
    S.mon.splice(S.mon.indexOf(m), 1);
    S.kills++; meta.kills++;
    addFx('burst', m.x, m.y, def.boss ? '#ffd166' : '#c8d6e6');
    snd.play(def.boss ? 'victory' : 'kill');
    say('msg.kill', { name: t('mon.' + m.t) }, 'good');
    S.p.exp += m.exp;
    while (S.p.exp >= Rules.expNext(S.p.lvl)) {
      S.p.exp -= Rules.expNext(S.p.lvl);
      S.p.lvl++;
      S.p.maxhp = Rules.maxHp(S.p.lvl); S.p.maxmp = Rules.maxMp(S.p.lvl);
      S.p.hp = S.p.maxhp; S.p.mp = S.p.maxmp;
      addFx('ring', S.p.x, S.p.y, '#ffd166');
      say('msg.levelUp', { n: S.p.lvl }, 'good');
      snd.play('levelup');
    }
    if (def.boss) onBossDown(m);
  }

  function hurtPlayer(dmg, m) {
    S.p.hp -= dmg;
    hurtFlash = 1; shake = Math.max(shake, 7);
    addFx('float', S.p.x, S.p.y, '-' + dmg, '#ff8f9e');
    snd.play('hurt');
    say('msg.hurt', { name: t('mon.' + m.t), n: dmg }, 'bad');
    var def = Rules.MONSTERS[m.t];
    if (def.steals && S.p.gold > 0 && rand() < 0.5) {
      var stolen = Math.min(S.p.gold, 5 + ri(10 + S.floor * 2));
      S.p.gold -= stolen;
      say('msg.steal', { name: t('mon.' + m.t), n: stolen }, 'bad');
    }
    if (S.p.hp <= 0) die(m);
  }

  /* Fold one run into the lifetime records, exactly once. */
  function commitRun(kind) {
    if (S && !S.committed) {
      S.committed = true;
      meta.gold = meta.gold + S.goldFound;
      meta.best = Math.max(meta.best, S.floor);
      if (kind === 'death') meta.deepest = Math.max(meta.deepest, S.floor);
    }
    writeMeta();
  }

  function die(m) {
    over = true; paused = true;
    snd.play('death');
    commitRun('death');
    clearSave();
    $('death-body').textContent = t('over.dBody', { name: m ? t('mon.' + m.t) : t('over.dark'), f: S.floor });
    $('death-stats').innerHTML =
      statBox('hud.lv', S.p.lvl) + statBox('rec.kills', S.kills) + statBox('hud.gold', S.goldFound);
    showScreen('screen-death');
  }

  function statBox(key, v) {
    return '<div><span>' + t(key) + '</span><b>' + v + '</b></div>';
  }

  function onBossDown(m) {
    var isGoal = S.floor === WIN_FLOOR;
    say('msg.bossDown', null, 'good');
    var drop = 80 + S.floor * 20;
    S.p.gold += drop; S.goldFound += drop;
    if (isGoal) {
      commitRun('win');
      over = true; paused = true;
      $('victory-body').textContent = t('over.vBody', { f: S.floor });
      $('victory-stats').innerHTML =
        statBox('hud.lv', S.p.lvl) + statBox('rec.kills', S.kills) + statBox('hud.gold', S.goldFound);
      showScreen('screen-victory');
    } else {
      S.items.push({ k: 'potion', x: m.x, y: m.y });
    }
  }

  /* ── items ─────────────────────────────────────────────────── */
  function pickup(it) {
    if (it.k === 'gold') {
      S.p.gold += it.v; S.goldFound += it.v;
      say('msg.gold', { n: it.v }, 'good'); snd.play('gold');
      drop(it);
    } else if (it.k === 'potion') {
      S.p.potions++;
      say('msg.potion', { n: t('item.potion') }); snd.play('pickup');
      drop(it);
    } else if (it.k === 'key') {
      S.p.keys++;
      say('msg.key'); snd.play('pickup');
      drop(it);
    } else if (it.k === 'weapon') {
      var cur = Rules.WEAPONS[S.p.wi], want = Rules.WEAPONS[it.tier];
      if (want.atk > cur.atk) {
        S.p.wi = it.tier;
        say('msg.wpnBetter', { n: t(want.key), v: want.atk }, 'good');
        snd.play('levelup'); drop(it);
      } else {
        say('msg.wpnKeep', { n: t(want.key), cur: t(cur.key) });
      }
    } else if (it.k === 'armor') {
      var aCur = Rules.ARMORS[S.p.ai], aWant = Rules.ARMORS[it.tier];
      if (aWant.def > aCur.def) {
        S.p.ai = it.tier;
        say('msg.armBetter', { n: t(aWant.key), v: aWant.def }, 'good');
        snd.play('levelup'); drop(it);
      } else {
        say('msg.wpnKeep', { n: t(aWant.key), cur: t(aCur.key) });
      }
    }
  }
  function drop(it) { S.items.splice(S.items.indexOf(it), 1); }

  function openChest(it) {
    if (it.mimic === undefined) it.mimic = !it.prize && rand() < 0.16;
    if (it.mimic) {
      it.mimic = 'done';
      say('msg.mimicReveal', null, 'bad');
      snd.play('spawn');
      var m = Rules.spawn('mimic', S.floor, it.x, it.y);
      drop(it);
      S.mon.push(m);
      return;
    }
    drop(it);
    snd.play('chest');
    var roll = rand();
    if (it.prize) {
      var g = 40 + S.floor * 12 + ri(40);
      S.p.gold += g; S.goldFound += g;
      say('msg.chest');
      if (it.tier > S.p.wi) {
        S.p.wi = it.tier;
        var w = Rules.WEAPONS[it.tier];
        say('msg.wpnBetter', { n: t(w.key), v: w.atk }, 'good');
        snd.play('levelup');
      } else {
        g = g + 60 + S.floor * 20;
        S.p.gold += g; S.goldFound += g;
        say('msg.gold', { n: g }, 'good');
      }
      S.items.push({ k: 'potion', x: it.x, y: it.y });
      return;
    }
    if (roll < 0.34) {
      var g2 = Rules.goldPile(S.floor, rand) + 10;
      S.p.gold += g2; S.goldFound += g2;
      say('msg.chest'); say('msg.gold', { n: g2 }, 'good');
    } else if (roll < 0.52) {
      S.items.push({ k: 'potion', x: it.x, y: it.y });
      say('msg.chest');
    } else if (roll < 0.68) {
      S.items.push({ k: 'key', x: it.x, y: it.y });
      say('msg.chest');
    } else if (roll < 0.86) {
      var tier = it.tier !== undefined && it.tier > 0 ? it.tier : Rules.weaponTier(S.floor, rand);
      S.items.push({ k: 'weapon', x: it.x, y: it.y, tier: tier });
      say('msg.chest');
    } else {
      say('msg.chestEmpty');
    }
  }

  /* ── turns ─────────────────────────────────────────────────── */
  function stepTowards(m, tx, ty) {
    var dx = Math.sign(tx - m.x), dy = Math.sign(ty - m.y);
    var tryList = Math.abs(tx - m.x) >= Math.abs(ty - m.y)
      ? [[dx, 0], [0, dy], [0, dy ? -dy : 0], [dx ? -dx : 0, 0]]
      : [[0, dy], [dx, 0], [dx ? -dx : 0, 0], [0, dy ? -dy : 0]];
    for (var i = 0; i < tryList.length; i++) {
      var sx = m.x + tryList[i][0], sy = m.y + tryList[i][1];
      if (!tryList[i][0] && !tryList[i][1]) continue;
      if (canMonStand(m, sx, sy)) { m.x = sx; m.y = sy; return true; }
    }
    return false;
  }
  function canMonStand(m, x, y) {
    if (!inMap(x, y)) return false;
    if (x === S.p.x && y === S.p.y) return false;
    var ch = tileAt(x, y);
    if (ch === Dungeon.WALL || ch === Dungeon.LOCKED) return false;
    if (monAt(x, y)) return false;
    var it = itemAt(x, y);
    if (it && (it.k === 'chest')) return false;
    return true;
  }

  function monsterPhase() {
    var list = S.mon.slice();
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (S.mon.indexOf(m) < 0) continue;
      var def = Rules.MONSTERS[m.t];
      var dx = S.p.x - m.x, dy = S.p.y - m.y;
      var dist = Math.max(Math.abs(dx), Math.abs(dy));
      var visible = !!lit[idx(m.x, m.y)];
      var heard = dist <= 4;

      if (def.slow && (S.turn % 2 === 0)) continue;

      if (dist === 1 && (Math.abs(dx) + Math.abs(dy) === 1)) {
        hurtPlayer(Rules.damage(m.atk, Rules.playerDef(S.p), rand), m);
        if (S.p.hp <= 0) return;
        continue;
      }
      if (def.ranged && visible && dist <= def.ranged && Dungeon.los(S.tiles, m.x, m.y, S.p.x, S.p.y)) {
        var dmg = Math.max(1, Math.round(Rules.damage(m.atk, Rules.playerDef(S.p), rand) * (def.web ? 0.7 : 1)));
        addFx('bolt', m.x, m.y, def.web ? '#cfe0ee' : '#ff9f45', S.p.x, S.p.y);
        snd.play(def.web ? 'miss' : 'cast');
        hurtPlayer(dmg, m);
        if (S.p.hp <= 0) return;
        continue;
      }
      if (visible || heard) {
        stepTowards(m, S.p.x, S.p.y);
        if (def.haunt) stepTowards(m, S.p.x, S.p.y);
      } else if (def.erratic && rand() < 0.6) {
        var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        var d = dirs[ri(4)];
        if (canMonStand(m, m.x + d[0], m.y + d[1])) { m.x += d[0]; m.y += d[1]; }
      }
    }
  }

  function endTurn() {
    S.turn++;
    monsterPhase();
    if (S.p.hp <= 0) { hud(); return; }
    updateLight();
    if (S.turn % 8 === 0 && S.p.mp < S.p.maxmp) S.p.mp++;
    hud();
    if (S.turn % 4 === 0) save();
  }

  /* ── player actions ────────────────────────────────────────── */
  function blocked() { return paused || over; }

  function tryMove(dx, dy) {
    if (blocked()) return false;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;   // one tile at a time
    var nx = S.p.x + dx, ny = S.p.y + dy;
    if (!inMap(nx, ny)) return false;
    var ch = tileAt(nx, ny);

    if (ch === Dungeon.WALL) { snd.play('bump'); addFx('bump', nx, ny, '#5c6b80'); return false; }

    if (ch === Dungeon.LOCKED) {
      if (S.p.keys > 0) {
        S.p.keys--;
        setTile(nx, ny, Dungeon.FLOOR);
        say('msg.useKey'); snd.play('door');
        endTurn();
      } else {
        say('msg.locked', null, 'bad'); snd.play('locked');
      }
      return false;
    }

    var m = monAt(nx, ny);
    if (m) { hitMonster(m, 1); endTurn(); hud(); return true; }

    // A chest is opened from where you stand — a hidden mimic keeps its ground.
    var chest = itemAt(nx, ny);
    if (chest && chest.k === 'chest') {
      openChest(chest);
      endTurn();
      return true;
    }

    S.p.x = nx; S.p.y = ny;
    snd.play('move');

    var trap = trapAt(nx, ny);
    if (trap && !trap.seen) {
      trap.seen = true;
      var dmg = Rules.trapDamage(S.floor, rand);
      S.p.hp -= dmg;
      hurtFlash = 1; shake = Math.max(shake, 5);
      addFx('float', nx, ny, '-' + dmg, '#ff8f9e');
      snd.play('trap');
      say('msg.trap', { n: dmg }, 'bad');
      if (S.p.hp <= 0) { die(null); return true; }
    }

    var it = itemAt(nx, ny);
    if (it) {
      if (it.k === 'stairs') { descend(); return true; }
      pickup(it);
    }
    endTurn();
    return true;
  }

  function castBolt() {
    if (blocked()) return;
    if (S.p.mp < Rules.BOLT_COST) { say('msg.noMp', null, 'bad'); snd.play('locked'); return; }
    var target = nearestVisibleMonster(Rules.BOLT_RANGE);
    if (!target) { say('msg.noTarget', null, 'bad'); snd.play('locked'); return; }
    S.p.mp -= Rules.BOLT_COST;
    addFx('bolt', S.p.x, S.p.y, '#ffb64d', target.x, target.y);
    snd.play('cast');
    hitMonster(target, 1, 0.5, 'bolt');
    endTurn();
  }

  function nearestVisibleMonster(range) {
    var best = null, bestD = 1e9;
    for (var i = 0; i < S.mon.length; i++) {
      var m = S.mon[i];
      if (!lit[idx(m.x, m.y)]) continue;
      var d = Math.abs(m.x - S.p.x) + Math.abs(m.y - S.p.y);
      if (d > range || d >= bestD) continue;
      if (!Dungeon.los(S.tiles, S.p.x, S.p.y, m.x, m.y)) continue;
      best = m; bestD = d;
    }
    return best;
  }

  function quaff() {
    if (blocked()) return;
    if (S.p.potions <= 0) { say('msg.noPotion', null, 'bad'); snd.play('locked'); return; }
    if (S.p.hp >= S.p.maxhp) { say('msg.fullHp'); return; }
    S.p.potions--;
    var heal = Rules.potionHeal(S.p.lvl);
    S.p.hp = Math.min(S.p.maxhp, S.p.hp + heal);
    addFx('ring', S.p.x, S.p.y, '#ef4d63');
    addFx('float', S.p.x, S.p.y, '+' + heal, '#b8f5c8');
    say('msg.heal', { n: heal }, 'good');
    snd.play('heal');
    endTurn();
    hud();
  }

  function rest() {
    if (blocked()) return;
    if (S.p.mp < S.p.maxmp) S.p.mp++;
    say('msg.rest');
    snd.play('ui');
    if (rand() < 0.09) {
      var spots = [];
      for (var y = Math.max(0, S.p.y - 4); y <= Math.min(S.h - 1, S.p.y + 4); y++) {
        for (var x = Math.max(0, S.p.x - 4); x <= Math.min(S.w - 1, S.p.x + 4); x++) {
          if (x === S.p.x && y === S.p.y) continue;
          if (Dungeon.at(S.tiles, x, y) !== Dungeon.FLOOR) continue;
          if (monAt(x, y) || itemAt(x, y)) continue;
          spots.push([x, y]);
        }
      }
      if (spots.length) {
        var sp = spots[ri(spots.length)];
        S.mon.push(Rules.spawn(Rules.pickType(S.floor, rand), S.floor, sp[0], sp[1]));
        say('msg.ambush', null, 'bad'); snd.play('spawn');
      }
    }
    endTurn();
  }

  /* ── auto-walk ─────────────────────────────────────────────── */
  function autoWalk(tx, ty) {
    if (blocked()) return;
    // tapping a wall or an unseen tile should still walk you as close as possible
    var targets = Dungeon.isFloor(tileAt(tx, ty))
      ? [[tx, ty]]
      : [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1]];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (!inMap(t[0], t[1]) || !Dungeon.isFloor(tileAt(t[0], t[1]))) continue;
      if (!seen[idx(t[0], t[1])]) continue;
      var steps = Dungeon.path(S.tiles, S.w, S.h, S.p.x, S.p.y, t[0], t[1], 30, function (x, y) {
        return !!monAt(x, y);
      });
      if (steps && steps.length) { walk = { steps: steps, next: 0 }; return; }
    }
  }

  function walkTick() {
    if (!walk || blocked()) { walk = null; return; }
    // stop the moment something dangerous shows up
    for (var i = 0; i < S.mon.length; i++) {
      var m = S.mon[i];
      if (lit[idx(m.x, m.y)] && Math.max(Math.abs(m.x - S.p.x), Math.abs(m.y - S.p.y)) <= 3) { walk = null; return; }
    }
    var st = walk.steps[walk.next++];
    if (!st) { walk = null; return; }
    var dx = Math.sign(st.x - S.p.x), dy = Math.sign(st.y - S.p.y);
    if (!tryMove(dx, dy)) { walk = null; return; }
    if (walk && walk.next >= walk.steps.length) walk = null;
  }

  /* ── effects ───────────────────────────────────────────────── */
  function addFx(kind, x, y, color, x2, y2, text) {
    fx.push({ kind: kind, x: x, y: y, x2: x2, y2: y2, c: color, t: text, age: 0, life: kind === 'bolt' ? 260 : 420 });
  }

  /* ── HUD ───────────────────────────────────────────────────── */
  function hud() {
    if (!S) return;
    var p = S.p;
    $('floor-badge').textContent = 'B' + S.floor;
    $('hud-lv').textContent = p.lvl;
    $('hud-hp').textContent = p.hp + '/' + p.maxhp;
    $('hud-mp').textContent = p.mp + '/' + p.maxmp;
    $('hud-exp').textContent = p.exp + '/' + Rules.expNext(p.lvl);
    $('hud-gold').textContent = p.gold;
    $('hud-keys').textContent = p.keys;
    $('hud-weapon').textContent = t(Rules.WEAPONS[p.wi].key);
    $('hud-armor').textContent = t(Rules.ARMORS[p.ai].key);
    $('hud-atk').textContent = Rules.playerAtk(p);
    $('hud-def').textContent = Rules.playerDef(p);
    $('bar-hp').style.width = (100 * p.hp / p.maxhp) + '%';
    $('bar-mp').style.width = (100 * p.mp / p.maxmp) + '%';
    $('bar-exp').style.width = (100 * p.exp / Rules.expNext(p.lvl)) + '%';
    $('potion-count').textContent = 'x' + p.potions;
    $('skill-cost').textContent = 'MP ' + Rules.BOLT_COST;
    $('btn-skill').classList.toggle('is-disabled', p.mp < Rules.BOLT_COST);
    $('btn-potion').classList.toggle('is-disabled', p.potions <= 0);
    $('pause-turn').textContent = S.turn;
    $('pause-floor').textContent = S.floor;
  }

  /* ── screens ───────────────────────────────────────────────── */
  var SCREENS = ['screen-title', 'screen-pause', 'screen-settings', 'screen-help', 'screen-records', 'screen-death', 'screen-victory', 'screen-confirm'];
  var returnTo = null;
  function showScreen(id) {
    for (var i = 0; i < SCREENS.length; i++) {
      var el = $(SCREENS[i]);
      if (!el) continue;
      if (SCREENS[i] === id) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
    paused = id !== null && id !== undefined;
    if (id === 'screen-title') paintTitle();
    if (id === 'screen-records') paintRecords();
    if (id === 'screen-settings') paintSettings();
  }
  function anyScreen() {
    for (var i = 0; i < SCREENS.length; i++) if (!$(SCREENS[i]).classList.contains('hidden')) return SCREENS[i];
    return null;
  }

  function paintTitle() {
    $('btn-cont').classList.toggle('is-hidden', !readSave());
    $('title-best').textContent = meta.best > 0 ? t('title.best', { n: meta.best }) : '';
  }
  function paintRecords() {
    var has = meta.runs > 0;
    $('recs').classList.toggle('hidden', !has);
    $('recs-empty').classList.toggle('hidden', has);
    $('rec-best').textContent = meta.best || '—';
    $('rec-deepest').textContent = meta.deepest || '—';
    $('rec-runs').textContent = meta.runs;
    $('rec-kills').textContent = meta.kills;
    $('rec-gold').textContent = meta.gold;
  }
  function paintSettings() {
    var s = readSave();
    $('save-info').textContent = s
      ? t('hud.floor', { n: s.floor }) + ' · ' + t('hud.lv') + ' ' + s.p.lvl + ' · ' + t('hud.turn') + ' ' + s.turn
      : t('toast.noSave');
  }

  /* ── persistence ───────────────────────────────────────────── */
  function writeMeta() {
    try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {}
  }
  function readMeta() {
    try {
      var raw = localStorage.getItem(META_KEY);
      if (raw) {
        var m = JSON.parse(raw);
        for (var k in meta) if (m[k] !== undefined) meta[k] = m[k];
      }
    } catch (e) {}
  }
  function save() {
    if (!S || over) return true;
    try {
      var seenRows = [];
      for (var y = 0; y < S.h; y++) {
        var row = '';
        for (var x = 0; x < S.w; x++) row += seen[y * S.w + x] ? '1' : '0';
        seenRows.push(row);
      }
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: VERSION, floor: S.floor, turn: S.turn, seed: S.seed, rng: S.rng,
        kills: S.kills, goldFound: S.goldFound,
        p: S.p, tiles: S.tiles, seen: seenRows,
        items: S.items, mon: S.mon, traps: S.traps
      }));
      return true;
    } catch (e) {
      say('msg.saveFail', null, 'bad');
      return false;
    }
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }
  function readSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || s.v !== VERSION || !s.p) return null;
      return s;
    } catch (e) { return null; }
  }
  function loadRun() {
    var s = readSave();
    if (!s) { toast(t('toast.noSave')); return false; }
    S = {
      seed: s.seed, rng: s.rng, floor: s.floor, turn: s.turn,
      kills: s.kills || 0, goldFound: s.goldFound || 0,
      p: s.p, tiles: s.tiles, items: s.items || [], mon: s.mon || [], traps: s.traps || [],
      w: s.tiles[0].length, h: s.tiles.length
    };
    seen = {};
    for (var y = 0; y < S.h; y++) {
      var row = s.seen && s.seen[y] ? s.seen[y] : '';
      for (var x = 0; x < S.w; x++) if (row.charAt(x) === '1') seen[y * S.w + x] = 1;
    }
    over = false; paused = false; walk = null; fx = [];
    viewSeed = (S.seed >>> 0) ^ (S.floor * 2654435761);
    cam.x = clampCam(S.p.x - VW / 2, S.w - VW);
    cam.y = clampCam(S.p.y - VH / 2, S.h - VH);
    updateLight();
    showScreen(null);
    hud();
    toast(t('toast.loaded'));
    return true;
  }

  /* ── language & sound ──────────────────────────────────────── */
  function setLang(code) {
    I18N.setLang(code);
    meta.lang = code;
    writeMeta();
    buildLangButtons();
    syncSoundButton();
    hud();
    $('log').innerHTML = '';
    $('lang-label').textContent = code.toUpperCase();
    if (!S) paintTitle();
  }
  function buildLangButtons() {
    var hosts = ['lang-switch-title', 'lang-switch-pause', 'lang-switch-settings'];
    for (var h = 0; h < hosts.length; h++) {
      var host = $(hosts[h]);
      if (!host) continue;
      host.innerHTML = '';
      for (var i = 0; i < I18N.LANGS.length; i++) {
        (function (code) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'lang-btn' + (I18N.getLang() === code ? ' is-active' : '');
          b.textContent = I18N.LANG_NAME[code];
          b.addEventListener('click', function () {
            setLang(code); snd.play('toggle'); toast(t('toast.lang'));
          });
          host.appendChild(b);
        })(I18N.LANGS[i]);
      }
    }
  }
  function syncSoundButton() {
    $('btn-sound').classList.toggle('is-off', !meta.sound);
    $('sound-state').textContent = meta.sound ? t('set.on') : t('set.off');
    $('btn-sound-2').classList.toggle('is-off', !meta.sound);
  }
  function toggleSound() {
    meta.sound = !meta.sound;
    writeMeta();
    snd.setEnabled(meta.sound);
    syncSoundButton();
    toast(t(meta.sound ? 'toast.sndOn' : 'toast.sndOff'));
    if (meta.sound) snd.play('toggle');
  }

  /* ── canvas size ───────────────────────────────────────────── */
  function resize() {
    if (!canvas) return;
    var stage = $('stage');
    var w = stage.clientWidth, h = stage.clientHeight;
    var per = Math.min(Math.floor(w / VW), Math.floor(h / VH));
    TS = Math.max(10, per);           // fill the stage; sprites scale nearest-neighbour
    viewW = TS * VW; viewH = TS * VH;
    dpr = Math.min(3, global.devicePixelRatio || 1);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  /* ── rendering ─────────────────────────────────────────────── */
  function draw(now) {
    global.requestAnimationFrame(draw);
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now; timeMs = now;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = '#05080d';
    ctx.fillRect(0, 0, viewW, viewH);
    if (!S) { drawIdle(); return; }

    if (walk && now - (walk.at || 0) > 140) { walk.at = now; walkTick(); }

    var targetX = clampCam(S.p.x - (VW - 1) / 2, Math.max(0, S.w - VW));
    var targetY = clampCam(S.p.y - (VH - 1) / 2, Math.max(0, S.h - VH));
    cam.x += (targetX - cam.x) * Math.min(1, dt / 90);
    cam.y += (targetY - cam.y) * Math.min(1, dt / 90);

    var ox = shake ? (rand01(now) - 0.5) * shake : 0;
    var oy = shake ? (rand01(now + 31) - 0.5) * shake : 0;
    shake = Math.max(0, shake - dt * 0.035);
    var camPx = cam.x * TS;

    var x0 = Math.floor(cam.x), y0 = Math.floor(cam.y);
    for (var j = 0; j <= VH; j++) {
      for (var i = 0; i <= VW; i++) {
        var tx = x0 + i, ty = y0 + j;
        if (!inMap(tx, ty)) continue;
        var sx = Math.round(tx * TS - camPx + ox);
        var sy = Math.round(ty * TS - cam.y * TS + oy);
        drawTile(tx, ty, sx, sy);
      }
    }
    // items first, then monsters, then the hero
    for (var q = 0; q < S.items.length; q++) {
      var it = S.items[q];
      if (!seen[idx(it.x, it.y)]) continue;
      drawItem(it, camPx, ox, oy);
    }
    for (var n = 0; n < S.mon.length; n++) {
      var m = S.mon[n];
      if (!lit[idx(m.x, m.y)]) continue;
      var mx = Math.round(m.x * TS - camPx + ox), my = Math.round(m.y * TS - cam.y * TS + oy);
      var def = Rules.MONSTERS[m.t];
      drawGroundShadow(mx, my, 0.72, 0.34);
      if (def.boss) drawGlow(mx + TS / 2, my + TS / 2, 'rgba(255,91,67,.3)', TS * 1.5);
      Sprites.draw(ctx, def.shape, mx, my, TS, def.pal, m.t);
      if (m.hp < m.maxhp) {
        var bw = TS - 8;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(mx + 4, my - 5, bw, 3);
        ctx.fillStyle = '#ff526d';
        ctx.fillRect(mx + 4, my - 5, Math.max(1, bw * m.hp / m.maxhp), 3);
      }
    }
    var px = Math.round(S.p.x * TS - camPx + ox), py = Math.round(S.p.y * TS - cam.y * TS + oy);
    var bob = walk ? Math.round(Math.sin(now / 90) * 1.5) : 0;
    // lantern pool
    var flicker = Math.sin(now / 430) * 0.25 + Math.sin(now / 173) * 0.08;
    var lg = ctx.createRadialGradient(px + TS / 2, py + TS / 2, TS * 0.45, px + TS / 2, py + TS / 2, TS * (LIGHT_R + 1 + flicker));
    lg.addColorStop(0, 'rgba(255,190,112,.25)');
    lg.addColorStop(0.42, 'rgba(255,157,83,.12)');
    lg.addColorStop(1, 'rgba(255,145,72,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, viewW, viewH);
    var core = ctx.createRadialGradient(px + TS / 2, py + TS / 2, 0, px + TS / 2, py + TS / 2, TS * 1.8);
    core.addColorStop(0, 'rgba(255,211,137,.16)');
    core.addColorStop(1, 'rgba(255,150,78,0)');
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, viewW, viewH);
    drawGroundShadow(px, py, 0.62, 0.42);
    Sprites.draw(ctx, 'hero', px, py + bob, TS, null, 'hero');

    drawFx(dt, camPx, ox, oy);

    if (hurtFlash > 0) {
      ctx.fillStyle = 'rgba(190,40,60,' + (hurtFlash * 0.28) + ')';
      ctx.fillRect(0, 0, viewW, viewH);
      hurtFlash = Math.max(0, hurtFlash - dt * 0.004);
    }
    drawMinimap();
  }

  function drawIdle() {
    // attract mode behind the title: a still, dark hall
    ctx.fillStyle = '#0b111a';
    ctx.fillRect(0, 0, viewW, viewH);
    for (var y = 0; y < VH; y++) {
      for (var x = 0; x < VW; x++) {
        var hall = Math.abs(x - 7) < 3;
        ctx.fillStyle = hall ? (hash2(x, y, 7) > .5 ? '#18222f' : '#1a2532') : (hash2(x, y, 3) > .5 ? '#232f40' : '#253243');
        ctx.fillRect(x * TS, y * TS, TS, TS);
      }
    }
    var cxp = viewW / 2, cyp = viewH / 2;
    var g = ctx.createRadialGradient(cxp, cyp, TS, cxp, cyp, TS * 5.5);
    g.addColorStop(0, 'rgba(255,190,100,.20)');
    g.addColorStop(1, 'rgba(0,0,0,.92)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, viewW, viewH);
    Sprites.draw(ctx, 'hero', Math.round(cxp - TS / 2), Math.round(cyp - TS / 2) + Math.round(Math.sin(timeMs / 700) * 2), TS, null, 'idle');
  }

  function rand01(seed) {
    var z = Math.sin(seed * 0.001) * 10000;
    return z - Math.floor(z);
  }

  function drawTile(tx, ty, sx, sy) {
    var ch = tileAt(tx, ty);
    var k = idx(tx, ty);
    var isLit = !!lit[k], isSeen = isLit || !!seen[k];
    if (!isSeen) return;
    var h1 = hash2(tx, ty, 11), h2 = hash2(tx, ty, 29);

    if (ch === Dungeon.WALL) {
      var below = ty + 1 < S.h ? tileAt(tx, ty + 1) : Dungeon.WALL;
      var top = below !== Dungeon.WALL;
      ctx.fillStyle = isLit ? (h1 > .5 ? '#30394b' : '#343c4e') : (h1 > .5 ? '#1d2535' : '#20283a');
      ctx.fillRect(sx, sy, TS, TS);
      ctx.fillStyle = isLit ? '#20283a' : '#151c2b';
      ctx.fillRect(sx, sy + Math.floor(TS * 0.5), TS, TS * 0.5);
      ctx.strokeStyle = isLit ? 'rgba(186,190,220,.2)' : 'rgba(107,123,159,.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy + TS * 0.5 + .5); ctx.lineTo(sx + TS, sy + TS * 0.5 + .5);
      ctx.moveTo(sx + TS * (h1 > .5 ? .5 : .25), sy); ctx.lineTo(sx + TS * (h1 > .5 ? .5 : .25), sy + TS * 0.5);
      ctx.stroke();
      ctx.fillStyle = isLit ? 'rgba(255,224,174,.13)' : 'rgba(164,172,205,.06)';
      ctx.fillRect(sx + 1, sy + 1, TS - 2, 1);
      ctx.fillStyle = isLit ? 'rgba(5,7,14,.2)' : 'rgba(2,4,10,.22)';
      ctx.fillRect(sx, sy + TS - 2, TS, 2);
      if (isLit) {
        ctx.fillStyle = 'rgba(255,190,110,' + (0.045 + 0.05 * Math.max(0, 1 - dist2(tx, ty) / (LIGHT_R + 1))) + ')';
        ctx.fillRect(sx, sy, TS, Math.max(1, Math.floor(TS * .1)));
      }
      if (top && isLit) {
        ctx.fillStyle = 'rgba(255,231,193,.1)';
        ctx.fillRect(sx, sy, TS, 2);
      }
      return;
    }

    // floor / door
    var base = isLit
      ? (h1 > .5 ? '#303140' : '#343444')
      : (h1 > .5 ? '#1b1f2e' : '#202435');
    ctx.fillStyle = base;
    ctx.fillRect(sx, sy, TS, TS);
    // faint flagstone grid so open space reads as a room, not as void
    ctx.strokeStyle = isLit ? 'rgba(255,227,192,.085)' : 'rgba(180,181,218,.035)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx + .5, sy + TS - .5); ctx.lineTo(sx + TS - .5, sy + TS - .5);
    ctx.moveTo(sx + TS - .5, sy + .5); ctx.lineTo(sx + TS - .5, sy + TS - .5);
    ctx.stroke();
    ctx.fillStyle = isLit ? 'rgba(255,230,196,.035)' : 'rgba(183,184,218,.018)';
    ctx.fillRect(sx + 1, sy + 1, TS - 2, 1);
    if (h2 > .86) {
      ctx.fillStyle = isLit ? 'rgba(255,220,176,.11)' : 'rgba(176,179,214,.055)';
      ctx.fillRect(sx + Math.floor(TS * .25), sy + Math.floor(TS * .6), 2, 2);
    }
    if (h1 > .93) {
      ctx.strokeStyle = isLit ? 'rgba(255,206,153,.12)' : 'rgba(155,164,203,.07)';
      ctx.beginPath();
      ctx.moveTo(sx + TS * .3, sy + TS * .3); ctx.lineTo(sx + TS * .6, sy + TS * .55);
      ctx.stroke();
    }
    var d = dist2(tx, ty);
    if (isLit) {
      ctx.fillStyle = 'rgba(255,190,110,' + (0.10 * Math.max(0, 1 - d / (LIGHT_R + 1))) + ')';
      ctx.fillRect(sx, sy, TS, TS);
    }
    if (ch === Dungeon.DOOR || ch === Dungeon.LOCKED) {
      Sprites.draw(ctx, 'door', sx, sy, TS, ch === Dungeon.LOCKED ? { b: '#6d4a22', a: '#f0c65a' } : null, ch);
    }
    var tr = trapAt(tx, ty);
    if (tr && tr.seen) Sprites.draw(ctx, 'trap', sx, sy, TS, null, 'trap');
  }

  function dist2(tx, ty) {
    var dx = tx - S.p.x, dy = ty - S.p.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function drawGroundShadow(x, y, width, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#05050a';
    ctx.beginPath();
    ctx.ellipse(x + TS / 2, y + TS * .79, TS * width * .5, TS * .13, 0, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGlow(x, y, color, radius) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  function drawItem(it, camPx, ox, oy) {
    var k = idx(it.x, it.y);
    if (!lit[k] && it.k !== 'stairs' && it.k !== 'chest') return;   // small loot only shows while lit
    var sx = Math.round(it.x * TS - camPx + ox), sy = Math.round(it.y * TS - cam.y * TS + oy);
    var alpha = lit[k] ? 1 : 0.45;
    drawGroundShadow(sx, sy, 0.68, 0.32 * alpha);
    if (it.k === 'stairs') drawGlow(sx + TS / 2, sy + TS / 2, 'rgba(105,225,211,.2)', TS * .9);
    else if (it.k === 'chest' || it.k === 'gold' || it.k === 'key') drawGlow(sx + TS / 2, sy + TS / 2, 'rgba(255,196,91,.18)', TS * .72);
    else if (it.k === 'potion') drawGlow(sx + TS / 2, sy + TS / 2, 'rgba(255,89,123,.14)', TS * .72);
    if (it.k === 'stairs') Sprites.draw(ctx, 'stairs', sx, sy, TS, null, 'stairs', alpha);
    else if (it.k === 'chest') Sprites.draw(ctx, 'chest', sx, sy, TS, it.prize ? { a: '#ffe08a', b: '#a5773a' } : null, 'chest', alpha);
    else if (it.k === 'gold') { Sprites.draw(ctx, 'gold', sx, sy, TS, null, 'gold', alpha); }
    else if (it.k === 'potion') Sprites.draw(ctx, 'potion', sx, sy, TS, null, 'potion', alpha);
    else if (it.k === 'key') Sprites.draw(ctx, 'key', sx, sy, TS, null, 'key', alpha);
    else if (it.k === 'weapon') Sprites.draw(ctx, 'sword', sx, sy, TS, null, 'sword', alpha);
    else if (it.k === 'armor') Sprites.draw(ctx, 'armor', sx, sy, TS, null, 'armor', alpha);
  }

  function drawFx(dt, camPx, ox, oy) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var f = fx[i];
      f.age += dt;
      if (f.age >= f.life) { fx.splice(i, 1); continue; }
      var p = f.age / f.life;
      var sx = f.x * TS - camPx + ox, sy = f.y * TS - cam.y * TS + oy;
      if (f.kind === 'float') {
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = f.c;
        ctx.font = '700 ' + Math.round(TS * 0.55) + "px 'Zen Maru Gothic', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(f.t, sx + TS / 2, sy + TS * 0.4 - p * TS * 0.9);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'spark') {
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = f.c;
        for (var a = 0; a < 5; a++) {
          var ang = a * 1.256 + p;
          var r = TS * (0.2 + p * 0.45);
          ctx.fillRect(sx + TS / 2 + Math.cos(ang) * r - 1, sy + TS / 2 + Math.sin(ang) * r - 1, 3, 3);
        }
        ctx.globalAlpha = 1;
      } else if (f.kind === 'burst') {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = f.c; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx + TS / 2, sy + TS / 2, TS * (0.25 + p * 0.9), 0, 6.283);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'ring') {
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = f.c;
        ctx.beginPath();
        ctx.arc(sx + TS / 2, sy + TS / 2, TS * (0.5 + p * 0.5), 0, 6.283);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'bolt') {
        var bx = sx + (f.x2 - f.x) * TS * p, by = sy + (f.y2 - f.y) * TS * p;
        Sprites.draw(ctx, 'fire', bx, by, Math.round(TS * 0.75), null, 'fx', 1);
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.fillStyle = f.c;
        ctx.fillRect(bx + TS * 0.25, by + TS * 0.25, 4, 4);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'bump') {
        ctx.globalAlpha = (1 - p) * 0.6;
        ctx.strokeStyle = f.c; ctx.lineWidth = 2;
        ctx.strokeRect(sx + 2, sy + 2, TS - 4, TS - 4);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawMinimap() {
    var cell = TS >= 24 ? 3 : 2;
    var mw = S.w * cell, mh = S.h * cell;
    var mx = viewW - mw - 6, my = 6;
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = '#05080d';
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(240,220,190,.18)';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx - 3.5, my - 3.5, mw + 7, mh + 7);
    for (var y = 0; y < S.h; y++) {
      for (var x = 0; x < S.w; x++) {
        var k = idx(x, y);
        if (!seen[k]) continue;
        var ch = tileAt(x, y);
        ctx.fillStyle = ch === Dungeon.WALL ? '#233043'
          : ch === Dungeon.LOCKED ? '#7a5a22'
          : ch === Dungeon.DOOR ? '#4a3a22' : '#151f2b';
        ctx.fillRect(mx + x * cell, my + y * cell, cell, cell);
      }
    }
    for (var i = 0; i < S.items.length; i++) {
      var it = S.items[i];
      if (!seen[idx(it.x, it.y)]) continue;
      if (it.k === 'stairs') { ctx.fillStyle = '#5ac8c0'; ctx.fillRect(mx + it.x * cell, my + it.y * cell, cell, cell); }
      else if (it.k === 'chest') { ctx.fillStyle = '#f0c65a'; ctx.fillRect(mx + it.x * cell, my + it.y * cell, cell, cell); }
    }
    for (var m = 0; m < S.mon.length; m++) {
      var mo = S.mon[m];
      if (!lit[idx(mo.x, mo.y)]) continue;
      ctx.fillStyle = Rules.MONSTERS[mo.t].boss ? '#ff5c5c' : '#c05a6a';
      ctx.fillRect(mx + mo.x * cell, my + mo.y * cell, cell, cell);
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(mx + S.p.x * cell, my + S.p.y * cell, cell, cell + 1);
  }

  /* ── input ─────────────────────────────────────────────────── */
  var KEYS = {
    ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
    w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
    W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0],
    k: [0, -1], j: [0, 1], h: [-1, 0], l: [1, 0]
  };

  function bindKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.repeat && (e.key === ' ' || e.key === 'Escape')) return;
      var scr = anyScreen();
      if (e.key === 'Escape' || e.key === 'Esc') {
        e.preventDefault();
        if (scr === 'screen-pause') showScreen(null);
        else if (scr === 'screen-settings' || scr === 'screen-help' || scr === 'screen-records') closeOverlay();
        else if (scr === null && S && !over) openPause();
        return;
      }
      if (scr !== null) return;
      if (KEYS[e.key]) { e.preventDefault(); walk = null; tryMove(KEYS[e.key][0], KEYS[e.key][1]); return; }
      if (e.key === ' ') { e.preventDefault(); walk = null; rest(); return; }
      if (e.key === 'f' || e.key === 'F') { walk = null; castBolt(); return; }
      if (e.key === 'q' || e.key === 'Q') { walk = null; quaff(); return; }
    });
  }

  function bindPad() {
    var holdTimer = 0, holdDir = null;
    function press(dx, dy) {
      walk = null;
      tryMove(dx, dy);
      global.clearInterval(holdTimer);
      holdTimer = global.setInterval(function () { tryMove(dx, dy); }, 170);
    }
    function release() { global.clearInterval(holdTimer); holdTimer = 0; holdDir = null; }
    var btns = document.querySelectorAll('.pad-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        var parts = b.getAttribute('data-dir').split(',');
        var dx = +parts[0], dy = +parts[1];
        b.addEventListener('pointerdown', function (e) { e.preventDefault(); holdDir = b; press(dx, dy); });
        b.addEventListener('pointerup', release);
        b.addEventListener('pointerleave', release);
        b.addEventListener('pointercancel', release);
        b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      })(btns[i]);
    }
    document.addEventListener('pointerup', release);
  }

  function bindStage() {
    var x0 = 0, y0 = 0, moved = false, active = false;
    canvas.addEventListener('pointerdown', function (e) {
      active = true; moved = false;
      x0 = e.clientX; y0 = e.clientY;
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!active) return;
      if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 26) moved = true;
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!active) return;
      active = false;
      walk = null;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        // tap: walk to that tile
        var rect = canvas.getBoundingClientRect();
        var tx = Math.floor(cam.x + (e.clientX - rect.left) / TS);
        var ty = Math.floor(cam.y + (e.clientY - rect.top) / TS);
        if (tx === S.p.x && ty === S.p.y) rest();
        else if (Math.abs(tx - S.p.x) + Math.abs(ty - S.p.y) === 1) tryMove(Math.sign(tx - S.p.x), Math.sign(ty - S.p.y));
        else autoWalk(tx, ty);
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) tryMove(dx > 0 ? 1 : -1, 0);
      else tryMove(0, dy > 0 ? 1 : -1);
    });
    canvas.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function openPause() {
    hud();
    showScreen('screen-pause');
    save();
  }

  /* ── wiring ────────────────────────────────────────────────── */
  function on(id, fn) {
    var el = $(id);
    if (el) el.addEventListener('click', function (e) { e.preventDefault(); snd.play('ui'); fn(e); });
  }

  function bindButtons() {
    on('btn-new', function () { newRun(); });
    on('btn-cont', function () { loadRun(); });
    on('btn-help', function () { returnTo = 'screen-title'; showScreen('screen-help'); });
    on('btn-settings', function () { returnTo = 'screen-title'; showScreen('screen-settings'); });
    on('btn-records', function () { returnTo = 'screen-title'; showScreen('screen-records'); });
    on('btn-help-close', closeOverlay);
    on('btn-settings-close', closeOverlay);
    on('btn-records-close', closeOverlay);

    on('btn-pause', function () { if (S && !over && !anyScreen()) openPause(); });
    on('btn-resume', function () { showScreen(null); });
    on('btn-save', function () { save(); toast(t('toast.saved')); });
    on('btn-pause-help', function () { returnTo = 'screen-pause'; showScreen('screen-help'); });
    on('btn-pause-settings', function () { returnTo = 'screen-pause'; showScreen('screen-settings'); });
    on('btn-quit', function () { save(); writeMeta(); S = null; showScreen('screen-title'); toast(t('toast.quit')); });

    on('btn-retry', function () { newRun(); });
    on('btn-death-title', function () { S = null; showScreen('screen-title'); });
    on('btn-deeper', function () {
      showScreen(null); over = false; paused = false;
      descend();
    });
    on('btn-retire', function () {
      commitRun('retire');
      clearSave();
      S = null;
      showScreen('screen-title');
    });

    on('btn-delete', function () { showScreen('screen-confirm'); });
    on('btn-confirm-no', function () { showScreen('screen-settings'); });
    on('btn-confirm-yes', function () {
      clearSave();
      meta = { lang: I18N.getLang(), sound: meta.sound, best: 0, runs: 0, kills: 0, gold: 0, deepest: 0 };
      writeMeta();
      paintSettings();
      toast(t('toast.del'));
      showScreen('screen-settings');
    });

    on('btn-sound', toggleSound);
    on('btn-sound-2', toggleSound);
    on('btn-language', function () {
      var order = I18N.LANGS;
      var next = order[(order.indexOf(I18N.getLang()) + 1) % order.length];
      setLang(next);
      toast(t('toast.lang'));
    });

    on('btn-skill', function () { castBolt(); });
    on('btn-potion', function () { quaff(); });
    on('btn-rest', function () { rest(); });
  }

  function closeOverlay() {
    if (returnTo === 'screen-pause') { showScreen('screen-pause'); return; }
    if (returnTo === 'screen-title' || !S) { showScreen('screen-title'); return; }
    showScreen(null);
  }

  /* ── boot ──────────────────────────────────────────────────── */
  function boot() {
    canvas = $('view');
    ctx = canvas.getContext('2d');
    readMeta();
    I18N.setLang(meta.lang || I18N.detect(), true);
    document.documentElement.lang = I18N.getLang() === 'zh' ? 'zh-CN' : I18N.getLang();
    I18N.applyStatic(document);
    $('lang-label').textContent = I18N.getLang().toUpperCase();
    snd.enabled = meta.sound !== false;
    buildLangButtons();
    syncSoundButton();
    bindButtons();
    bindKeys();
    bindPad();
    bindStage();
    resize();
    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', function () { global.setTimeout(resize, 120); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && S && !over) save(); });
    // audio needs a user gesture: arm it on the first touch anywhere
    var arm = function () {
      if (meta.sound) snd.setEnabled(true);
      document.removeEventListener('pointerdown', arm);
    };
    document.addEventListener('pointerdown', arm);
    paintTitle();
    showScreen('screen-title');
    global.requestAnimationFrame(draw);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.EmberSpire = {
    state: function () { return S; },
    newRun: newRun, tryMove: tryMove, castBolt: castBolt, quaff: quaff, rest: rest,
    save: save, loadRun: loadRun, showScreen: showScreen, setLang: setLang,
    meta: function () { return meta; },
    resize: resize,
    /* hooks the automated test drives; harmless in play */
    debug: {
      hurt: function (dmg) {
        if (!S) return;
        var m = S.mon[0] || Rules.spawn('slime', S.floor, S.p.x, S.p.y);
        hurtPlayer(dmg, m);
        hud();
      },
      win: function () { if (S) onBossDown({ t: 'dragon', x: S.p.x, y: S.p.y }); },
      descend: function () { if (S) descend(); },
      autoWalk: autoWalk,
      litCells: function () {
        var out = [];
        if (!S) return out;
        for (var k in lit) { var i = +k; out.push([i % S.w, Math.floor(i / S.w)]); }
        return out;
      },
      walkInfo: function () {
        if (!walk) return null;
        return { steps: walk.steps.length, next: walk.next, first: [walk.steps[0].x, walk.steps[0].y], hero: [S.p.x, S.p.y], tile: tileAt(walk.steps[0].x, walk.steps[0].y) };
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
