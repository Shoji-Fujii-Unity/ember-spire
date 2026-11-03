/* Sound — everything synthesised with the Web Audio API (no audio files).
   Master on/off is remembered by the game layer. */
(function (global) {
  'use strict';

  var AC = global.AudioContext || global.webkitAudioContext;

  function Sound() {
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.verb = null;
    this.amb = null;
    this.bellTimer = 0;
    this.heartTimer = 0;
    this._danger = false;
    this.ok = !!AC;
  }

  /* Stereo noise burst with an exponential tail — a fake stone-hall impulse. */
  function makeImpulse(ctx, seconds, decay) {
    var rate = ctx.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    var buf = ctx.createBuffer(2, len, rate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  Sound.prototype.ensure = function () {
    if (!this.ok) return false;
    if (!this.ctx) {
      try {
        this.ctx = new AC();
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.knee.value = 22;
        this.comp.ratio.value = 6;
        this.comp.attack.value = 0.004;
        this.comp.release.value = 0.18;
        this.comp.connect(this.ctx.destination);
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.34;
        this.master.connect(this.comp);
        try {
          this.verb = this.ctx.createConvolver();
          this.verb.buffer = makeImpulse(this.ctx, 1.9, 2.8);
          var wet = this.ctx.createGain();
          wet.gain.value = 0.4;
          this.verb.connect(wet); wet.connect(this.comp);
        } catch (e) { this.verb = null; }
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
    if (this.heartTimer) { global.clearInterval(this.heartTimer); this.heartTimer = 0; }
    this._danger = false;
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

  /* Route a cue tail into the hall reverb (skipped when convolver is missing). */
  Sound.prototype.wet = function (g, amount) {
    if (!this.verb || amount <= 0) return;
    var send = this.ctx.createGain();
    send.gain.value = amount;
    g.connect(send); send.connect(this.verb);
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
    this.wet(g, o.verb === undefined ? 0.22 : o.verb);
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
    this.wet(g, o.verb === undefined ? 0.18 : o.verb);
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

    // cavern wind: looped noise through a slowly wandering bandpass
    try {
      var wlen = Math.floor(ctx.sampleRate * 2);
      var wbuf = ctx.createBuffer(1, wlen, ctx.sampleRate);
      var wd = wbuf.getChannelData(0);
      for (var wi = 0; wi < wlen; wi++) wd[wi] = Math.random() * 2 - 1;
      var wsrc = ctx.createBufferSource();
      wsrc.buffer = wbuf; wsrc.loop = true;
      var wbp = ctx.createBiquadFilter();
      wbp.type = 'bandpass'; wbp.frequency.value = 320; wbp.Q.value = 0.6;
      var wg = ctx.createGain(); wg.gain.value = 0.018;
      var wlfo = ctx.createOscillator(); wlfo.frequency.value = 0.05;
      var wlg = ctx.createGain(); wlg.gain.value = 130;
      wlfo.connect(wlg); wlg.connect(wbp.frequency);
      var wlfo2 = ctx.createOscillator(); wlfo2.frequency.value = 0.083;
      var wlg2 = ctx.createGain(); wlg2.gain.value = 0.009;
      wlfo2.connect(wlg2); wlg2.connect(wg.gain);
      wsrc.connect(wbp); wbp.connect(wg); wg.connect(this.master);
      if (this.verb) { var wsend = ctx.createGain(); wsend.gain.value = 0.5; wg.connect(wsend); wsend.connect(this.verb); }
      wsrc.start(); wlfo.start(); wlfo2.start();
      oscs.push(wsrc); oscs.push(wlfo); oscs.push(wlfo2);
    } catch (e) { /* wind is optional */ }

    this.amb = { gain: g, osc: oscs, lp: lp };

    var self = this;
    this.bellTimer = global.setInterval(function () {
      if (!self.amb) return;
      var r = Math.random();
      if (r < 0.42) {
        // distant bell tone
        var f = SCALE[(Math.random() * SCALE.length) | 0];
        self.tone({ f: f, type: 'sine', dur: 1.8, gain: 0.045, att: 0.02, verb: 0.6 });
        if (Math.random() < 0.4) self.tone({ f: f * 1.5, type: 'sine', dur: 1.4, gain: 0.022, delay: 0.35, verb: 0.6 });
      } else if (r < 0.68) {
        // water drip, sometimes answered by its own echo
        self.play('drip');
        if (Math.random() < 0.5) self.tone({ f: 1500, f2: 700, type: 'sine', dur: 0.08, gain: 0.02, delay: 0.4, verb: 0.8 });
      } else if (r < 0.9) {
        // torch crackle: a small burst of sparks
        var n = 1 + ((Math.random() * 3) | 0);
        for (var i = 0; i < n; i++) self.play('crackle', i * (0.03 + Math.random() * 0.06));
      }
    }, 3400);
  };

  /* Low-HP heartbeat. The game layer toggles this from the HUD refresh. */
  Sound.prototype.setDanger = function (on) {
    on = !!on;
    if (on === this._danger) return;
    this._danger = on;
    if (this.heartTimer) { global.clearInterval(this.heartTimer); this.heartTimer = 0; }
    if (!on) return;
    var self = this;
    this.heartTimer = global.setInterval(function () {
      if (self.enabled) self.play('heart');
    }, 950);
  };

  /* --- one-shots ------------------------------------------------------- */

  var CUES = {
    ui:      function (s) { s.tone({ f: 620, f2: 720, type: 'triangle', dur: 0.05, gain: 0.07 }); },
    toggle:  function (s) { s.tone({ f: 480, f2: 880, type: 'triangle', dur: 0.09, gain: 0.09 }); },
    move:    function (s) {
      var f = 260 + Math.random() * 90;   // no two steps land exactly alike
      s.tone({ f: f, f2: f * 1.12, type: 'square', dur: 0.035, gain: 0.035, cutoff: 1200, verb: 0.12 });
    },
    bump:    function (s) { s.noise({ f: 220, f2: 90, dur: 0.09, gain: 0.1, type: 'lowpass' }); },
    whoosh:  function (s) { s.noise({ f: 480, f2: 2600, dur: 0.09, gain: 0.075, type: 'bandpass', q: 1.5, verb: 0.1 }); },
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
    growl:   function (s) { s.tone({ f: 92, f2: 58, type: 'sawtooth', dur: 0.42, gain: 0.085, cutoff: 320, verb: 0.5 }); s.tone({ f: 97, f2: 61, type: 'square', dur: 0.34, gain: 0.045, cutoff: 260, delay: 0.04, verb: 0.5 }); },
    mimic:   function (s) { s.noise({ f: 1900, f2: 320, dur: 0.16, gain: 0.14 }); s.tone({ f: 466, f2: 220, type: 'square', dur: 0.3, gain: 0.085, delay: 0.05, verb: 0.4 }); s.tone({ f: 493, f2: 233, type: 'square', dur: 0.3, gain: 0.075, delay: 0.05, verb: 0.4 }); },
    heart:   function (s) { s.tone({ f: 66, f2: 40, type: 'sine', dur: 0.14, gain: 0.2, verb: 0.08 }); s.tone({ f: 58, f2: 37, type: 'sine', dur: 0.12, gain: 0.14, delay: 0.19, verb: 0.08 }); },
    drip:    function (s) { s.tone({ f: 1900, f2: 880, type: 'sine', dur: 0.09, gain: 0.05, verb: 0.75 }); },
    crackle: function (s) { s.noise({ f: 3400, f2: 2100, dur: 0.05, gain: 0.035, type: 'highpass', verb: 0.25 }); },
    boss:    function (s) { s.tone({ f: 70, f2: 46, type: 'sawtooth', dur: 1.5, gain: 0.2, cutoff: 340, verb: 0.6 }); s.noise({ f: 180, f2: 60, dur: 1.2, gain: 0.1, type: 'lowpass', verb: 0.5 }); s.tone({ f: 990, f2: 220, type: 'square', dur: 0.5, gain: 0.05, delay: 0.4, verb: 0.6 }); },
    death:   function (s) { [440, 349, 293, 220, 165].forEach(function (f, i) { s.tone({ f: f, type: 'triangle', dur: 0.5, gain: 0.12, delay: i * 0.22 }); }); },
    victory: function (s) { [523, 659, 784, 1046, 784, 1046, 1319].forEach(function (f, i) { s.tone({ f: f, type: 'triangle', dur: 0.34, gain: 0.11, delay: i * 0.14 }); }); s.noise({ f: 3000, dur: 1.2, gain: 0.04, type: 'highpass', delay: 0.4 }); }
  };

  Sound.prototype.play = function (name, delay) {
    if (!this.ok || !this.enabled) return;
    var cue = CUES[name];
    if (!cue) return;
    try {
      if (delay) {
        var self = this;
        global.setTimeout(function () { if (self.enabled) { try { cue(self); } catch (e) {} } }, delay * 1000);
      } else {
        cue(this);
      }
    } catch (e) { /* audio is optional; never break the game */ }
  };

  Sound.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (this.enabled) { this.ensure(); this.startAmbient(); }
    else { this.stopAll(); }
  };

  global.Sound = Sound;
  if (typeof module !== 'undefined' && module.exports) module.exports = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
