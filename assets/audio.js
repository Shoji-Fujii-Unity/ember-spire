/* Sound — everything synthesised with the Web Audio API (no audio files).
   Master on/off is remembered by the game layer. */
(function (global) {
  'use strict';

  var AC = global.AudioContext || global.webkitAudioContext;

  function Sound() {
    this.ctx = null;
    this.master = null;
    this.amb = null;
    this.bellTimer = 0;
    this.ok = !!AC;
  }

  Sound.prototype.ensure = function () {
    if (!this.ok) return false;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.34;
        this.master.connect(this.ctx.destination);
      } catch (e) {
        this.ok = false;
        return false;
      }
    }
    if (this.ctx.state === 'suspended' && this.ctx.resume) {
      var p = this.ctx.resume();
      if (p && p.catch) p.catch(function () {});
    }
    return true;
  };

  Sound.prototype.stopAll = function () {
    if (this.bellTimer) { global.clearInterval(this.bellTimer); this.bellTimer = 0; }
    if (this.amb) {
      try {
        this.amb.gain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.amb.gain.gain.setValueAtTime(this.amb.gain.gain.value, this.ctx.currentTime);
        this.amb.gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.5);
        this.amb.osc.forEach(function (o) { try { o.stop(this.ctx.currentTime + 0.6); } catch (e) {} }, this);
      } catch (e) {}
      this.amb = null;
    }
  };

  /* --- primitives ------------------------------------------------------ */

  Sound.prototype.tone = function (o) {
    if (!this.ensure()) return;
    var ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + (o.dur || 0.12));
    var peak = (o.gain === undefined ? 0.16 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (o.att || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (o.dur || 0.12));
    if (o.cutoff) {
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.cutoff;
      osc.connect(lp); lp.connect(g);
    } else {
      osc.connect(g);
    }
    g.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + (o.dur || 0.12) + 0.02);
  };

  Sound.prototype.noise = function (o) {
    if (!this.ensure()) return;
    var ctx = this.ctx, t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.dur || 0.12;
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.f || 900, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f2), t0 + dur);
    f.Q.value = o.q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(o.gain === undefined ? 0.14 : o.gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  };

  /* --- ambience -------------------------------------------------------- */

  var SCALE = [392, 440, 523.25, 587.33, 659.25, 783.99];

  Sound.prototype.startAmbient = function () {
    if (!this.ensure() || this.amb) return;
    var ctx = this.ctx;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 2.2);
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    lp.Q.value = 0.7;
    var lfo = ctx.createOscillator();
    var lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);

    var oscs = [];
    [55, 82.4, 110.5].forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = (i - 1) * 7;
      var og = ctx.createGain();
      og.gain.value = i === 2 ? 0.22 : 0.4;
      o.connect(og); og.connect(lp);
      o.start();
      oscs.push(o);
    });
    lfo.start();
    oscs.push(lfo);
    lp.connect(g); g.connect(this.master);
    this.amb = { gain: g, osc: oscs, lp: lp };

    var self = this;
    this.bellTimer = global.setInterval(function () {
      if (!self.amb) return;
      if (Math.random() < 0.55) {
        var f = SCALE[(Math.random() * SCALE.length) | 0];
        self.tone({ f: f, type: 'sine', dur: 1.8, gain: 0.045, att: 0.02 });
        if (Math.random() < 0.4) self.tone({ f: f * 1.5, type: 'sine', dur: 1.4, gain: 0.022, delay: 0.35 });
      }
    }, 3600);
  };

  /* --- one-shots ------------------------------------------------------- */

  var CUES = {
    ui:      function (s) { s.tone({ f: 620, f2: 720, type: 'triangle', dur: 0.05, gain: 0.07 }); },
    toggle:  function (s) { s.tone({ f: 480, f2: 880, type: 'triangle', dur: 0.09, gain: 0.09 }); },
    move:    function (s) { s.tone({ f: 300, f2: 340, type: 'square', dur: 0.035, gain: 0.035, cutoff: 1200 }); },
    bump:    function (s) { s.noise({ f: 220, f2: 90, dur: 0.09, gain: 0.1, type: 'lowpass' }); },
    hit:     function (s) { s.noise({ f: 1400, f2: 500, dur: 0.09, gain: 0.13 }); s.tone({ f: 340, f2: 180, type: 'triangle', dur: 0.1, gain: 0.12 }); },
    crit:    function (s) { s.noise({ f: 2000, f2: 600, dur: 0.12, gain: 0.16 }); s.tone({ f: 880, f2: 1400, type: 'square', dur: 0.14, gain: 0.09, delay: 0.03 }); },
    miss:    function (s) { s.noise({ f: 700, f2: 1600, dur: 0.07, gain: 0.05, type: 'highpass' }); },
    hurt:    function (s) { s.tone({ f: 200, f2: 80, type: 'sawtooth', dur: 0.24, gain: 0.15, cutoff: 900 }); s.noise({ f: 400, f2: 120, dur: 0.16, gain: 0.1, type: 'lowpass' }); },
    kill:    function (s) { s.tone({ f: 420, f2: 110, type: 'square', dur: 0.2, gain: 0.1, cutoff: 1400 }); s.noise({ f: 900, f2: 200, dur: 0.18, gain: 0.08 }); },
    pickup:  function (s) { s.tone({ f: 660, type: 'triangle', dur: 0.08, gain: 0.1 }); s.tone({ f: 990, type: 'triangle', dur: 0.1, gain: 0.09, delay: 0.07 }); },
    gold:    function (s) { s.tone({ f: 1180, type: 'square', dur: 0.06, gain: 0.06 }); s.tone({ f: 1560, type: 'square', dur: 0.08, gain: 0.06, delay: 0.05 }); s.tone({ f: 2100, type: 'square', dur: 0.1, gain: 0.05, delay: 0.1 }); },
    chest:   function (s) { s.noise({ f: 300, f2: 1200, dur: 0.3, gain: 0.09, type: 'bandpass', q: 3 }); s.tone({ f: 520, f2: 1040, type: 'triangle', dur: 0.3, gain: 0.09, delay: 0.22 }); },
    door:    function (s) { s.noise({ f: 260, f2: 70, dur: 0.26, gain: 0.13, type: 'lowpass' }); },
    locked:  function (s) { s.tone({ f: 240, f2: 200, type: 'square', dur: 0.1, gain: 0.09 }); s.tone({ f: 226, f2: 190, type: 'square', dur: 0.12, gain: 0.08, delay: 0.09 }); },
    trap:    function (s) { s.noise({ f: 2600, f2: 400, dur: 0.14, gain: 0.16 }); s.tone({ f: 150, f2: 60, type: 'sawtooth', dur: 0.2, gain: 0.12 }); },
    cast:    function (s) { s.tone({ f: 200, f2: 1500, type: 'sawtooth', dur: 0.2, gain: 0.09, cutoff: 2600 }); s.noise({ f: 600, f2: 2400, dur: 0.16, gain: 0.05 }); },
    boom:    function (s) { s.tone({ f: 160, f2: 46, type: 'sine', dur: 0.32, gain: 0.18 }); s.noise({ f: 900, f2: 160, dur: 0.24, gain: 0.11, type: 'lowpass' }); },
    heal:    function (s) { s.tone({ f: 523, type: 'sine', dur: 0.14, gain: 0.09 }); s.tone({ f: 784, type: 'sine', dur: 0.2, gain: 0.08, delay: 0.1 }); s.tone({ f: 1046, type: 'sine', dur: 0.3, gain: 0.06, delay: 0.2 }); },
    levelup: function (s) { [523, 659, 784, 1046, 1319].forEach(function (f, i) { s.tone({ f: f, type: 'triangle', dur: 0.24, gain: 0.1, delay: i * 0.08 }); }); },
    stair:   function (s) { [523, 415, 349, 262].forEach(function (f, i) { s.tone({ f: f, type: 'sine', dur: 0.26, gain: 0.1, delay: i * 0.1 }); }); },
    spawn:   function (s) { s.tone({ f: 160, f2: 240, type: 'sine', dur: 0.2, gain: 0.06 }); },
    boss:    function (s) { s.tone({ f: 70, f2: 46, type: 'sawtooth', dur: 1.5, gain: 0.2, cutoff: 340 }); s.noise({ f: 180, f2: 60, dur: 1.2, gain: 0.1, type: 'lowpass' }); s.tone({ f: 990, f2: 220, type: 'square', dur: 0.5, gain: 0.05, delay: 0.4 }); },
    death:   function (s) { [440, 349, 293, 220, 165].forEach(function (f, i) { s.tone({ f: f, type: 'triangle', dur: 0.5, gain: 0.12, delay: i * 0.22 }); }); },
    victory: function (s) { [523, 659, 784, 1046, 784, 1046, 1319].forEach(function (f, i) { s.tone({ f: f, type: 'triangle', dur: 0.34, gain: 0.11, delay: i * 0.14 }); }); s.noise({ f: 3000, dur: 1.2, gain: 0.04, type: 'highpass', delay: 0.4 }); }
  };

  Sound.prototype.play = function (name) {
    if (!this.ok || !this.enabled) return;
    var cue = CUES[name];
    if (!cue) return;
    try { cue(this); } catch (e) { /* audio is optional; never break the game */ }
  };

  Sound.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (this.enabled) { this.ensure(); this.startAmbient(); }
    else { this.stopAll(); }
  };

  global.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
