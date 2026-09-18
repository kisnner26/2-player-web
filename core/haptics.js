/**
 * haptics.js — sistema de vibración por capas.
 *
 * Realidad del hardware en una MacBook:
 *   · Safari en macOS NO implementa navigator.vibrate (decisión de Apple).
 *   · La MacBook no expone su Taptic Engine a ninguna API web.
 *   · Sí funciona el rumble de un mando conectado (DualSense, Xbox) vía
 *     Gamepad.vibrationActuator.playEffect() en Chrome/Edge.
 *
 * Por eso la vibración se compone de cuatro capas que se disparan juntas y
 * degradan solas según lo que haya disponible:
 *
 *   1. RUMBLE DE MANDO   — vibración real si hay gamepad (por jugador).
 *   2. VIBRACIÓN NATIVA  — navigator.vibrate donde exista.
 *   3. RUMBLE SÓNICO     — seno de 35-90 Hz por WebAudio. En la MacBook el
 *                          chasis transmite esas frecuencias: se siente, no
 *                          solo se oye. Es la capa que hace el trabajo aquí.
 *   4. RUMBLE VISUAL     — sacudida de cámara + destello, sincronizados.
 *
 * Cada efecto tiene una curva (attack/sustain/decay) para que un golpe seco y
 * un motor sostenido no se sientan igual, que es justo lo que hace que la
 * vibración parezca "real" en vez de un zumbido plano.
 */

import { audio } from './audio.js';
import { loadSettings, saveSettings } from './storage.js';

/**
 * Presets. `lf`/`hf` son las intensidades de los motores grave/agudo (0-1),
 * `dur` en segundos, `freq` la frecuencia del rumble sónico, `shake` los
 * píxeles de sacudida de cámara.
 */
export const EFFECTS = {
  tap:        { lf: 0.15, hf: 0.35, dur: 0.04, freq: 90, shake: 0,   curve: 'click' },
  click:      { lf: 0.10, hf: 0.55, dur: 0.03, freq: 120, shake: 0,  curve: 'click' },
  soft:       { lf: 0.25, hf: 0.10, dur: 0.09, freq: 55, shake: 1.5, curve: 'soft'  },
  bounce:     { lf: 0.45, hf: 0.25, dur: 0.07, freq: 70, shake: 3,   curve: 'click' },
  impact:     { lf: 0.75, hf: 0.45, dur: 0.13, freq: 52, shake: 7,   curve: 'punch' },
  heavy:      { lf: 1.00, hf: 0.30, dur: 0.24, freq: 40, shake: 12,  curve: 'punch' },
  explosion:  { lf: 1.00, hf: 0.80, dur: 0.45, freq: 35, shake: 18,  curve: 'blast' },
  score:      { lf: 0.55, hf: 0.65, dur: 0.20, freq: 65, shake: 4,   curve: 'double'},
  error:      { lf: 0.60, hf: 0.20, dur: 0.18, freq: 45, shake: 5,   curve: 'buzz'  },
  charge:     { lf: 0.40, hf: 0.10, dur: 0.50, freq: 60, shake: 2,   curve: 'ramp'  },
  engine:     { lf: 0.30, hf: 0.05, dur: 0.30, freq: 48, shake: 1,   curve: 'hold'  },
  victory:    { lf: 0.70, hf: 0.60, dur: 0.60, freq: 70, shake: 6,   curve: 'triple'},
  defeat:     { lf: 0.80, hf: 0.15, dur: 0.55, freq: 38, shake: 8,   curve: 'fall'  },
  tick:       { lf: 0.08, hf: 0.25, dur: 0.02, freq: 140, shake: 0,  curve: 'click' },
};

/** Envolventes de amplitud normalizadas: t va de 0 a 1. */
const CURVES = {
  click:  (t) => Math.pow(1 - t, 2),
  soft:   (t) => Math.sin(Math.PI * t) ** 1.5,
  punch:  (t) => (t < 0.08 ? t / 0.08 : Math.pow(1 - (t - 0.08) / 0.92, 1.8)),
  blast:  (t) => (t < 0.04 ? t / 0.04 : Math.pow(1 - (t - 0.04) / 0.96, 1.2) * (0.75 + 0.25 * Math.sin(t * 70))),
  buzz:   (t) => (1 - t) * (Math.sin(t * 90) > 0 ? 1 : 0.25),
  ramp:   (t) => t * t,
  hold:   (t) => (t < 0.1 ? t / 0.1 : t > 0.85 ? (1 - t) / 0.15 : 1),
  double: (t) => (t < 0.35 ? Math.pow(1 - t / 0.35, 1.5) : t < 0.45 ? 0 : Math.pow(1 - (t - 0.45) / 0.55, 1.5)),
  triple: (t) => { const p = (t * 3) % 1; return t < 1 ? Math.pow(1 - p, 1.6) : 0; },
  fall:   (t) => Math.pow(1 - t, 0.8),
};

class Haptics {
  constructor() {
    const s = loadSettings();
    this._enabled = s.haptics ?? true;
    this._intensity = s.hapticIntensity ?? 1;
    this.engine = null;          // Engine actual, para la sacudida de cámara
    this.flashEl = null;         // Elemento para el destello
    this._gamepadOfPlayer = [null, null];
    this._lastScan = 0;
    this._bridge = null;         // puente Touch Bar (Electron), si existe

    window.addEventListener('gamepadconnected', () => this._scanGamepads(true));
    window.addEventListener('gamepaddisconnected', () => this._scanGamepads(true));
  }

  get enabled() { return this._enabled; }
  set enabled(v) {
    this._enabled = !!v;
    const s = loadSettings(); s.haptics = this._enabled; saveSettings(s);
  }
  get intensity() { return this._intensity; }
  set intensity(v) {
    this._intensity = Math.min(1.5, Math.max(0, v));
    const s = loadSettings(); s.hapticIntensity = this._intensity; saveSettings(s);
  }

  /** El shell conecta aquí el Engine activo para la sacudida de cámara. */
  attach(engine, flashEl = null) { this.engine = engine; this.flashEl = flashEl; }
  detach() { this.engine = null; this.flashEl = null; }
  attachBridge(bridge) { this._bridge = bridge; }

  /* ---------- Capa 1: mandos ---------- */

  _scanGamepads(force = false) {
    const now = performance.now();
    if (!force && now - this._lastScan < 1000) return;
    this._lastScan = now;
    const pads = (navigator.getGamepads?.() || []).filter(Boolean);
    this._gamepadOfPlayer = [pads[0] || null, pads[1] || null];
  }

  get gamepadCount() {
    this._scanGamepads();
    return this._gamepadOfPlayer.filter(Boolean).length;
  }

  _rumbleGamepad(playerIndex, e) {
    this._scanGamepads();
    // playerIndex null => todos los mandos conectados
    const targets = playerIndex == null
      ? this._gamepadOfPlayer.filter(Boolean)
      : [this._gamepadOfPlayer[playerIndex]].filter(Boolean);
    for (const pad of targets) {
      const act = pad.vibrationActuator;
      if (!act?.playEffect) continue;
      try {
        act.playEffect('dual-rumble', {
          startDelay: 0,
          duration: Math.round(e.dur * 1000),
          weakMagnitude: Math.min(1, e.hf * this._intensity),
          strongMagnitude: Math.min(1, e.lf * this._intensity),
        }).catch(() => {});
      } catch { /* actuador no disponible en este navegador */ }
    }
  }

  /* ---------- Capa 3: rumble sónico ---------- */

  _rumbleSonic(e) {
    if (!audio.ready || !audio.ctx) return;
    const ctx = audio.ctx;
    const t0 = ctx.currentTime;
    const dur = e.dur;
    const curve = CURVES[e.curve] || CURVES.click;
    const peak = Math.min(0.9, (e.lf * 0.55 + e.hf * 0.12) * this._intensity);
    if (peak <= 0.001) return;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(e.freq, t0);
    // Un ligero descenso de tono hace que el golpe se perciba con "peso".
    osc.frequency.exponentialRampToValueAtTime(Math.max(22, e.freq * 0.62), t0 + dur);

    // Un poco de distorsión suma armónicos que el altavoz sí puede reproducir,
    // reforzando la sensación táctil de las frecuencias más graves.
    const shaper = ctx.createWaveShaper();
    shaper.curve = this._distortionCurve();

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    // Se muestrea la envolvente en pasos: reproduce curvas que los ramps nativos no.
    const steps = Math.max(6, Math.min(64, Math.round(dur * 180)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const v = Math.max(0.0001, curve(t) * peak);
      g.gain.linearRampToValueAtTime(v, t0 + t * dur);
    }
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.01);

    osc.connect(shaper); shaper.connect(g); g.connect(audio.hapticGain || ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }

  _distortionCurve() {
    if (this._curveCache) return this._curveCache;
    const n = 1024, curve = new Float32Array(n), k = 6;
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
    }
    this._curveCache = curve;
    return curve;
  }

  /* ---------- Capa 4: rumble visual ---------- */

  _rumbleVisual(e) {
    if (e.shake > 0) {
      this.engine?.shake(e.shake * Math.min(1.2, this._intensity), e.curve === 'blast' ? 5 : 9);
    }
    if (this.flashEl && e.shake >= 7) {
      const el = this.flashEl;
      el.style.transition = 'none';
      el.style.opacity = String(Math.min(0.28, e.shake / 70));
      requestAnimationFrame(() => {
        el.style.transition = `opacity ${Math.round(e.dur * 900)}ms ease-out`;
        el.style.opacity = '0';
      });
    }
  }

  /* ---------- API pública ---------- */

  /**
   * Dispara un efecto háptico.
   * @param {keyof EFFECTS|object} effect  nombre del preset o preset a medida
   * @param {object} [opts]
   * @param {number|null} [opts.player]    a qué mando dirigirlo (null = todos)
   * @param {number} [opts.scale]          multiplicador puntual de intensidad
   */
  play(effect, { player = null, scale = 1 } = {}) {
    if (!this._enabled) return;
    const base = typeof effect === 'string' ? EFFECTS[effect] : effect;
    if (!base) return;
    const e = scale === 1 ? base : {
      ...base,
      lf: Math.min(1, base.lf * scale),
      hf: Math.min(1, base.hf * scale),
      shake: base.shake * scale,
    };
    this._rumbleGamepad(player, e);
    if (navigator.vibrate) {
      try { navigator.vibrate(Math.round(e.dur * 1000 * Math.max(e.lf, e.hf))); } catch {}
    }
    this._rumbleSonic(e);
    this._rumbleVisual(e);
    this._bridge?.haptic?.(e.curve === 'click' ? 'light' : e.lf > 0.7 ? 'heavy' : 'medium');
  }

  /** Atajos legibles para los juegos. */
  tap(p)        { this.play('tap', { player: p }); }
  click(p)      { this.play('click', { player: p }); }
  bounce(p, s)  { this.play('bounce', { player: p, scale: s }); }
  impact(p, s)  { this.play('impact', { player: p, scale: s }); }
  heavy(p)      { this.play('heavy', { player: p }); }
  explosion(p)  { this.play('explosion', { player: p }); }
  score(p)      { this.play('score', { player: p }); }
  error(p)      { this.play('error', { player: p }); }
  victory(p)    { this.play('victory', { player: p }); }
  defeat(p)     { this.play('defeat', { player: p }); }
  tick(p)       { this.play('tick', { player: p }); }

  /**
   * Rumble continuo (motores, arrastre, carga). Devuelve una función `stop`.
   * Repite un pulso corto para simular un estado sostenido con intensidad viva.
   */
  sustain(getIntensity, { player = null, period = 90 } = {}) {
    if (!this._enabled) return () => {};
    const id = setInterval(() => {
      const i = Math.max(0, Math.min(1, getIntensity()));
      if (i < 0.03) return;
      this.play({ lf: 0.5 * i, hf: 0.08 * i, dur: period / 1000, freq: 44 + i * 26, shake: 0.6 * i, curve: 'hold' }, { player });
    }, period);
    return () => clearInterval(id);
  }

  /** Prueba de la cadena completa — usada por la pantalla de ajustes. */
  demo() {
    const seq = ['tap', 'soft', 'bounce', 'impact', 'heavy', 'explosion'];
    seq.forEach((n, i) => setTimeout(() => this.play(n), i * 380));
    return seq.length * 380;
  }
}

export const haptics = new Haptics();
