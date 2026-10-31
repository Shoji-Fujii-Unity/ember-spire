/* Pixel art baked from 8x8 character maps — no external image assets. */
(function (global) {
  'use strict';

  var N = 8;

  /* Each shape is 8 rows of 8 chars, joined with "/". "." = transparent. */
  var SHAPES = {
    hero:   '..oooo../.ohhhho./.owkwko./.occcco./occlccco/occcccco/.occcco./..o..o..',
    blob:   '......../..oooo../.ollbbo./owkwkbwo/obbbbbbo/.obddbo./..oddo../........',
    bat:    '......../o......o/oo.oo.oo/oowkwkoo/.obbbbo./..obbo../...oo.../........',
    beetle: '..o..o../..o..o../.oooooo./obwkwbko/obbbdbbo/obbdbbbo/.obbbbo./..oooo..',
    spider: 'o.o..o.o/.oobboo./oobwkboo/.obbbbo./o.obbo.o/o.o..o.o/......../........',
    human:  '..oooo../.owkwko./.obbbbo./..oaao../.oabbao./.oabbao./..o..o../..o..o..',
    wraith: '...oo.../..obbo../.owkwko./.obbbbo./..obbo../..obbo../.o.o.o../........',
    dragon: 'o.o..o.o/ooobbooo/oowkwkoo/obbbdbbo/obbabbo./.obbbbo./..o..o../........',
    mimic:  '..oooo../.obbbbo./.owkwko./.okkkko./obbbbbbo/obabbabo/.obbbbo./..oooo..',
    potion: '...oo.../...bb.../..obbo../.obllbo./.obllbo./obwlllbo/obllllbo/.obllbo.',
    gold:   '......../..oooo../.ollllo./olwllllo/olllollo/oooooooo/......../........',
    sword:  '...oo.../...ll.../...lw.../...ll.../...ll.../.oaalao./...aa.../........',
    armor:  '..oooo../.obbbbo./obbbobbo/obbbobbo/.obbbbo./.obbbbo./..obbo../........',
    key:    '.ooo..../owbbo.../obbbo.../.ooo..../..ob..../..obbo../..ob..../..obo...',
    chest:  '......../..oooo../.obbbbo./obbaabo./obbbbbbo/obbabbbo/.obbbbo./..oooo..',
    stairs: 'oooooooo/ooabbaoo/ooaaaaoo/ooabbaoo/ooaaaaoo/ooabbaoo/oooooooo/........',
    door:   '..oooo../.obbbbo./.obbbbo./.obbobbo/.obbobbo/.obbbabo/.obbbabo/..oooo..',
    trap:   '..o..o../.obo.obo/.obboobo/obbbobbo/oooooooo/......../......../........',
    fire:   '......../...oo.../..ohho../.ohyhho./ohyyhyho/.oyyyyo./..oyyo../........'
  };

  /* Defaults. Callers may override a subset of these letters (monster recolour). */
  var PALETTE = {
    hero:   { o: '#0d1220', h: '#4a5a76', w: '#ffe9d2', k: '#20263a', c: '#3f7ba8', l: '#7fd8cf' },
    blob:   { o: '#132618', b: '#4fb96a', l: '#a6e79a', d: '#2b7a48', w: '#f3fbff', k: '#101a14' },
    bat:    { o: '#191322', b: '#6c5b8c', l: '#9c8ab8', w: '#ffd166', k: '#120d18' },
    beetle: { o: '#1a1409', b: '#8a6a35', l: '#caa25a', d: '#57431f', w: '#fff4dc', k: '#140f07' },
    spider: { o: '#150d10', b: '#5b2b32', l: '#8e4c54', w: '#ffd9d9', k: '#0f0709' },
    human:  { o: '#131a12', b: '#6fae5f', l: '#9ed48c', d: '#3d6b39', w: '#f7fff2', k: '#141c13', a: '#3f4a63' },
    wraith: { o: '#0d1a21', b: '#57d3c6', l: '#a8f3e8', w: '#eaffff', k: '#0a1c20' },
    dragon: { o: '#2a1008', b: '#c8562b', l: '#f5a45c', d: '#7f2f18', w: '#ffe9a8', k: '#1a0804', a: '#ffd166' },
    mimic:  { o: '#1c1207', b: '#8a5a2b', l: '#c79055', w: '#f9f2e2', k: '#150e06', a: '#e8c766' },
    potion: { o: '#152230', b: '#9fc0d8', l: '#ef4d63', w: '#ffffff' },
    gold:   { o: '#3a2a10', l: '#f2c94c', w: '#fff5cf' },
    sword:  { o: '#1e2430', l: '#dce6f2', w: '#ffffff', a: '#c79a3e' },
    armor:  { o: '#1e2430', b: '#b4c2d6', l: '#dde6f0', a: '#7f8ea6' },
    key:    { o: '#2b2410', b: '#f0c65a', w: '#fff6d2' },
    chest:  { o: '#221708', b: '#8f5f2c', a: '#f0c65a', l: '#c08a4a' },
    stairs: { o: '#05070b', b: '#0a0f16', a: '#b08a54' },
    door:   { o: '#1b1307', b: '#7d5525', a: '#f0c65a' },
    trap:   { o: '#1b1f27', b: '#93a4bb' },
    fire:   { o: '#3a1c08', h: '#f5772f', y: '#ffd166' }
  };

  var cache = {};

  function bake(shape, pal, tag) {
    var ck = shape + '|' + (tag || '*');
    if (cache[ck]) return cache[ck];
    var rows = SHAPES[shape].split('/');
    var map = {};
    var base = PALETTE[shape] || {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) map[k] = base[k];
    if (pal) for (k in pal) if (Object.prototype.hasOwnProperty.call(pal, k)) map[k] = pal[k];

    if (typeof document === 'undefined') return null;
    var c = document.createElement('canvas');
    c.width = N; c.height = N;
    var g = c.getContext('2d');
    for (var y = 0; y < N; y++) {
      var row = rows[y] || '';
      for (var x = 0; x < N; x++) {
        var ch = row.charAt(x);
        if (ch === '.' || ch === '') continue;
        g.fillStyle = map[ch] || '#ff00ff';
        g.fillRect(x, y, 1, 1);
      }
    }
    cache[ck] = c;
    return c;
  }

  /* Draw scaled with hard pixels. x,y = top-left of the target box. */
  function draw(ctx, shape, x, y, size, pal, tag, alpha) {
    var img = bake(shape, pal, tag);
    if (!img) return;
    if (alpha !== undefined && alpha !== null && alpha < 1) {
      var prev = ctx.globalAlpha;
      ctx.globalAlpha = prev * alpha;
      ctx.drawImage(img, x, y, size, size);
      ctx.globalAlpha = prev;
    } else {
      ctx.drawImage(img, x, y, size, size);
    }
  }

  /* Integrity check used by the offline test harness (and dev console). */
  function verify() {
    var problems = [];
    for (var shape in SHAPES) {
      if (!Object.prototype.hasOwnProperty.call(SHAPES, shape)) continue;
      var rows = SHAPES[shape].split('/');
      if (rows.length !== N) problems.push(shape + ': ' + rows.length + ' rows (want ' + N + ')');
      var pal = PALETTE[shape] || {};
      for (var y = 0; y < rows.length; y++) {
        if (rows[y].length !== N) problems.push(shape + ' row ' + y + ': length ' + rows[y].length);
        for (var x = 0; x < rows[y].length; x++) {
          var ch = rows[y].charAt(x);
          if (ch === '.') continue;
          if (!Object.prototype.hasOwnProperty.call(pal, ch)) {
            problems.push(shape + ' row ' + y + ' col ' + x + ': no palette entry for "' + ch + '"');
          }
        }
      }
    }
    return problems;
  }

  global.Sprites = {
    N: N,
    SHAPES: SHAPES,
    PALETTE: PALETTE,
    bake: bake,
    draw: draw,
    verify: verify,
    clear: function () { cache = {}; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Sprites;
})(typeof globalThis !== 'undefined' ? globalThis : this);
