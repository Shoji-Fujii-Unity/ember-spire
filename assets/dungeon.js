/* Dungeon generation, field of view, pathfinding. Pure logic — testable outside a browser. */
(function (global) {
  'use strict';

  var WALL = '#', FLOOR = '.', DOOR = '+', LOCKED = 'L';

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function idx(x, y, w) { return y * w + x; }

  function sizeFor(floor) {
    var w = 19 + (floor >= 4 ? 2 : 0) + (floor >= 9 ? 2 : 0);
    var h = 25 + (floor >= 3 ? 2 : 0) + (floor >= 8 ? 2 : 0);
    return { w: w, h: h };
  }

  /* Rooms + L corridors. Always connected: each room links to the previous one. */
  function generate(floor, rand) {
    var s = sizeFor(floor), w = s.w, h = s.h;
    var grid = [];
    for (var y0 = 0; y0 < h; y0++) {
      var row = '';
      for (var x0 = 0; x0 < w; x0++) row += WALL;
      grid.push(row);
    }

    var want = Math.min(12, 6 + Math.ceil(floor * 0.6));
    var rooms = [];
    var guard = 0;
    while (rooms.length < want && guard < 400) {
      guard++;
      var rw = 5 + Math.floor(rand() * 4);   // 5..8
      var rh = 4 + Math.floor(rand() * 4);   // 4..7
      var rx = 1 + Math.floor(rand() * (w - rw - 2));
      var ry = 1 + Math.floor(rand() * (h - rh - 2));
      var clash = false;
      for (var i = 0; i < rooms.length; i++) {
        var r = rooms[i];
        if (rx < r.x + r.w + 1 && rx + rw + 1 > r.x && ry < r.y + r.h + 1 && ry + rh + 1 > r.y) { clash = true; break; }
      }
      if (clash) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
      carveRect(grid, rx, ry, rw, rh);
    }
    for (var k = 1; k < rooms.length; k++) {
      carveCorridor(grid, rooms[k - 1], rooms[k], rand);
    }

    var start = rooms[0];
    var last = rooms[rooms.length - 1];
    var stairs = { x: last.cx, y: last.cy };
    var startAt = { x: start.cx, y: start.cy };

    var doors = pickDoors(grid, w, h, startAt, stairs, floor, rand);

    return {
      w: w, h: h,
      tiles: grid,
      rooms: rooms,
      start: startAt,
      stairs: stairs,
      doorCells: doors.locked ? [doors.locked] : [],
      sealed: doors.sealed || [],
      decorativeDoors: doors.decor
    };
  }

  function carveRect(grid, x, y, w, h) {
    for (var j = y; j < y + h; j++) {
      var row = grid[j].substring(0, x);
      for (var i = x; i < x + w; i++) row += FLOOR;
      grid[j] = row + grid[j].substring(x + w);
    }
  }

  function carveH(grid, y, x1, x2) {
    var a = Math.min(x1, x2), b = Math.max(x1, x2);
    var row = grid[y];
    var out = '';
    for (var x = a; x <= b; x++) out += FLOOR;
    grid[y] = row.substring(0, a) + out + row.substring(b + 1);
  }

  function carveV(grid, x, y1, y2) {
    var a = Math.min(y1, y2), b = Math.max(y1, y2);
    for (var y = a; y <= b; y++) {
      grid[y] = grid[y].substring(0, x) + FLOOR + grid[y].substring(x + 1);
    }
  }

  function carveCorridor(grid, a, b, rand) {
    if (rand() < 0.5) {
      carveH(grid, a.cy, a.cx, b.cx);
      carveV(grid, b.cx, a.cy, b.cy);
    } else {
      carveV(grid, a.cx, a.cy, b.cy);
      carveH(grid, b.cy, a.cx, b.cx);
    }
  }

  function at(grid, x, y) {
    if (y < 0 || y >= grid.length) return WALL;
    var row = grid[y];
    if (x < 0 || x >= row.length) return WALL;
    return row.charAt(x);
  }

  function isFloor(ch) { return ch === FLOOR || ch === DOOR || ch === LOCKED; }

  /* 1-wide neck: walls on one axis, open on the other. */
  function isNeck(grid, x, y) {
    if (at(grid, x, y) !== FLOOR) return false;
    var n = at(grid, x, y - 1), s2 = at(grid, x, y + 1), e = at(grid, x + 1, y), wv = at(grid, x - 1, y);
    var vert = (n === WALL && s2 === WALL && e === FLOOR && wv === FLOOR);
    var horz = (e === WALL && wv === WALL && n === FLOOR && s2 === FLOOR);
    return vert || horz;
  }

  /* Cells reachable from (px,py) treating (blockX,blockY) as a wall. */
  function reach(grid, w, h, px, py, blockX, blockY) {
    var seen = {}, stack = [[px, py]], out = [];
    seen[px + ',' + py] = 1;
    while (stack.length) {
      var c = stack.pop(), x = c[0], y = c[1];
      out.push([x, y]);
      var d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var i = 0; i < 4; i++) {
        var nx = x + d[i][0], ny = y + d[i][1];
        if (nx === blockX && ny === blockY) continue;
        if (!isFloor(at(grid, nx, ny))) continue;
        var key = nx + ',' + ny;
        if (seen[key]) continue;
        seen[key] = 1;
        stack.push([nx, ny]);
      }
    }
    return out;
  }

  /* One locked door guarding a side vault; decorative doors elsewhere.
     The lock is only placed when the stairs stay reachable without it. */
  function pickDoors(grid, w, h, start, stairs, floor, rand) {
    var cands = [];
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        if ((x === start.x && y === start.y) || (x === stairs.x && y === stairs.y)) continue;
        if (isNeck(grid, x, y)) cands.push([x, y]);
      }
    }
    var result = { decor: [], locked: null, sealed: [] };
    if (!cands.length) return result;

    var best = null;
    if (floor >= 3) {
      for (var i = 0; i < cands.length; i++) {
        var cx = cands[i][0], cy = cands[i][1];
        var open = reach(grid, w, h, start.x, start.y, cx, cy);
        var reachesStairs = false;
        for (var j = 0; j < open.length; j++) {
          if (open[j][0] === stairs.x && open[j][1] === stairs.y) { reachesStairs = true; break; }
        }
        if (!reachesStairs) continue;           // would trap the player: never lock here
        var full = reach(grid, w, h, start.x, start.y, -1, -1);
        var sealed = [];
        var inOpen = {};
        for (var q = 0; q < open.length; q++) inOpen[open[q][0] + ',' + open[q][1]] = 1;
        for (var p = 0; p < full.length; p++) {
          var key = full[p][0] + ',' + full[p][1];
          if (!inOpen[key] && !(full[p][0] === cx && full[p][1] === cy)) sealed.push([full[p][0], full[p][1]]);
        }
        if (sealed.length >= 5 && (!best || sealed.length > best.sealed.length)) {
          best = { x: cx, y: cy, sealed: sealed };
        }
      }
    }
    if (best) {
      grid[best.y] = grid[best.y].substring(0, best.x) + LOCKED + grid[best.y].substring(best.x + 1);
      result.locked = { x: best.x, y: best.y };
      result.sealed = best.sealed;
    }

    var spare = [];
    for (var m = 0; m < cands.length; m++) {
      var c2 = cands[m];
      if (result.locked && c2[0] === result.locked.x && c2[1] === result.locked.y) continue;
      spare.push(c2);
    }
    var n = Math.min(spare.length, 1 + Math.floor(rand() * 2));
    for (var t = 0; t < n; t++) {
      var pick = spare[Math.floor(rand() * spare.length)];
      grid[pick[1]] = grid[pick[1]].substring(0, pick[0]) + DOOR + grid[pick[1]].substring(pick[0] + 1);
      result.decor.push({ x: pick[0], y: pick[1] });
    }
    return result;
  }

  /* Bresenham line of sight; target cell is always revealed, blockers are not. */
  function los(grid, x0, y0, x1, y1) {
    var dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    var sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    var err = dx - dy;
    var x = x0, y = y0;
    while (true) {
      var e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === x1 && y === y1) return true;
      if (at(grid, x, y) === WALL) return false;
    }
  }

  /* Lit cells around the lantern: circle + line of sight. */
  function fov(grid, w, h, px, py, r) {
    var set = [];
    for (var y = Math.max(0, py - r); y <= Math.min(h - 1, py + r); y++) {
      for (var x = Math.max(0, px - r); x <= Math.min(w - 1, px + r); x++) {
        var d = Math.abs(x - px), e = Math.abs(y - py);
        if (d * d + e * e > r * r + r) continue;
        if (x === px && y === py) { set.push(y * w + x); continue; }
        if (los(grid, px, py, x, y)) set.push(y * w + x);
      }
    }
    return set;
  }

  /* Breadth-first walk, orthogonal only. Returns the step list (target last). */
  function path(grid, w, h, sx, sy, tx, ty, maxLen, blocked) {
    if (sx === tx && sy === ty) return [];
    var prev = {}, q = [[sx, sy]], seen = {};
    seen[sx + ',' + sy] = 1;
    var head = 0;
    while (head < q.length) {
      var c = q[head++], x = c[0], y = c[1];
      var dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
      for (var i = 0; i < 4; i++) {
        var nx = x + dirs[i][0], ny = y + dirs[i][1];
        var key = nx + ',' + ny;
        if (seen[key]) continue;
        if (!isFloor(at(grid, nx, ny))) continue;
        if (at(grid, nx, ny) === LOCKED) continue;
        if (blocked && blocked(nx, ny)) continue;
        seen[key] = 1;
        prev[key] = x + ',' + y;
        if (nx === tx && ny === ty) {
          var out = [], cur = key;
          while (cur !== sx + ',' + sy) {
            var pp = cur.split(',');
            out.unshift({ x: +pp[0], y: +pp[1] });
            cur = prev[cur];
            if (out.length > maxLen) return null;
          }
          return out;
        }
        q.push([nx, ny]);
        if (q.length > maxLen * 40) return null;
      }
    }
    return null;
  }

  function openCells(grid, w, h) {
    var out = [];
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) if (isFloor(at(grid, x, y))) out.push({ x: x, y: y });
    }
    return out;
  }

  global.Dungeon = {
    WALL: WALL, FLOOR: FLOOR, DOOR: DOOR, LOCKED: LOCKED,
    rng: rng,
    at: at,
    isFloor: isFloor,
    sizeFor: sizeFor,
    generate: generate,
    los: los,
    fov: fov,
    path: path,
    openCells: openCells,
    reach: reach
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Dungeon;
})(typeof globalThis !== 'undefined' ? globalThis : this);
