/**
 * audio.js — efectos de sonido sintetizados con WebAudio.
 *
 * Cero archivos de audio: todo se genera con osciladores y ruido, así que el
 * proyecto pesa nada y funciona offline sin descargar assets. El timbre es
 * deliberadamente chiptune (ondas cuadradas, envolventes cortas).
 */

import { loadSettings, saveSettings } from './storage.js';

class AudioBus {
  constructor() {
    this.ctx = null;
    const s = loadSettings();
    this._volume = s.volume ?? 0.7;
    this._muted = s.muted ?? false;
    this.ready = false;
  }

  /** WebAudio exige un gesto del usuario; el hub llama a esto en el primer click/tecla. */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._volume;
    // Un compresor evita que varios efectos simultáneos saturen y suenen sucios.
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -12;
    this.comp.ratio.value = 8;
    this.comp.connect(this.master);
    this.master.connect(this.ctx.destination);

    /** Bus separado para el rumble háptico: no lo afecta el mute de SFX. */
    this.hapticGain = this.ctx.createGain();
    this.hapticGain.gain.value = 1;
    this.hapticGain.connect(this.ctx.destination);

    this.ready = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  get volume() { return this._volume; }
  set volume(v) {
    this._volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = this._muted ? 0 : this._volume;
    const s = loadSettings(); s.volume = this._volume; saveSettings(s);
  }
  get muted() { return this._muted; }
  set muted(v) {
    this._muted = !!v;
    if (this.master) this.master.gain.value = this._muted ? 0 : this._volume;
    const s = loadSettings(); s.muted = this._muted; saveSettings(s);
  }
  toggleMute() { this.muted = !this._muted; return this._muted; }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  /** Tono simple con envolvente ADSR reducida a attack/decay. */
  tone({ freq = 440, dur = 0.12, type = 'square', gain = 0.25, attack = 0.005, sweep = 0, delay = 0, detune = 0 } = {}) {
    if (!this.ready || this._muted) return;
    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t0 + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.comp);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /** Ruido blanco filtrado — base de explosiones, pasos y percusión. */
  noise({ dur = 0.2, gain = 0.25, filter = 1200, q = 1, type = 'lowpass', sweep = 0, delay = 0 } = {}) {
    if (!this.ready || this._muted) return;
    const t0 = this.t + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bq = this.ctx.createBiquadFilter();
    bq.type = type; bq.frequency.setValueAtTime(filter, t0); bq.Q.value = q;
    if (sweep) bq.frequency.exponentialRampToValueAtTime(Math.max(40, filter + sweep), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq); bq.connect(g); g.connect(this.comp);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  /* ---------- Biblioteca de efectos ---------- */

  beep(freq = 660)      { this.tone({ freq, dur: 0.07, gain: 0.18 }); }
  blip()                { this.tone({ freq: 880, dur: 0.05, gain: 0.14, type: 'square' }); }
  select()              { this.tone({ freq: 520, dur: 0.06, gain: 0.16 }); this.tone({ freq: 780, dur: 0.07, gain: 0.12, delay: 0.05 }); }
  back()                { this.tone({ freq: 400, dur: 0.08, gain: 0.15, sweep: -180 }); }
  bounce(p = 0)         { this.tone({ freq: 300 + p * 140, dur: 0.06, gain: 0.22, type: 'square', sweep: 90 }); }
  hit()                 { this.noise({ dur: 0.09, gain: 0.3, filter: 2200, sweep: -1600 }); this.tone({ freq: 180, dur: 0.08, gain: 0.2, type: 'triangle', sweep: -110 }); }
  jump()                { this.tone({ freq: 320, dur: 0.14, gain: 0.2, type: 'square', sweep: 420 }); }
  pickup()              { this.tone({ freq: 700, dur: 0.06, gain: 0.18 }); this.tone({ freq: 1050, dur: 0.09, gain: 0.16, delay: 0.05 }); }
  laser()               { this.tone({ freq: 1200, dur: 0.16, gain: 0.16, type: 'sawtooth', sweep: -1000 }); }
  explosion()           { this.noise({ dur: 0.5, gain: 0.4, filter: 900, sweep: -800 }); this.tone({ freq: 90, dur: 0.4, gain: 0.28, type: 'triangle', sweep: -60 }); }
  thud()                { this.tone({ freq: 110, dur: 0.16, gain: 0.3, type: 'sine', sweep: -60 }); }
  tick()                { this.tone({ freq: 1400, dur: 0.025, gain: 0.1, type: 'square' }); }
  error()               { this.tone({ freq: 200, dur: 0.22, gain: 0.24, type: 'sawtooth', sweep: -90 }); }
  countdown(n)          { this.tone({ freq: n > 0 ? 520 : 900, dur: n > 0 ? 0.12 : 0.3, gain: 0.24 }); }
  score(player = 0)     { const b = player === 0 ? 520 : 620; [0, 0.08, 0.16].forEach((d, i) => this.tone({ freq: b * (1 + i * 0.26), dur: 0.12, gain: 0.2, delay: d })); }
  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.22, gain: 0.22, delay: i * 0.11, type: 'square' }));
  }
  lose() {
    [400, 340, 280, 200].forEach((f, i) => this.tone({ freq: f, dur: 0.24, gain: 0.2, delay: i * 0.13, type: 'sawtooth' }));
  }
  charge(progress = 0)  { this.tone({ freq: 200 + progress * 700, dur: 0.05, gain: 0.1, type: 'sawtooth' }); }
  swoosh()              { this.noise({ dur: 0.22, gain: 0.16, filter: 400, sweep: 2400, type: 'bandpass', q: 2 }); }
  place()               { this.tone({ freq: 440, dur: 0.05, gain: 0.16, type: 'triangle' }); this.noise({ dur: 0.05, gain: 0.12, filter: 3000 }); }
  capture()             { this.tone({ freq: 620, dur: 0.09, gain: 0.2, sweep: 260 }); }

  /** Arpegio corto de N notas — para menús y transiciones. */
  arp(notes = [440, 550, 660], step = 0.06, gain = 0.14) {
    notes.forEach((f, i) => this.tone({ freq: f, dur: step * 1.6, gain, delay: i * step }));
  }
}

export const audio = new AudioBus();

// Desbloqueo en el primer gesto real del usuario.
const unlockOnce = () => audio.unlock();
window.addEventListener('pointerdown', unlockOnce, { once: true });
window.addEventListener('keydown', unlockOnce, { once: true });
