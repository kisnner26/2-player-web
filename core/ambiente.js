/**
 * ambiente.js — música de fondo y sonido de escenario para todo el catálogo.
 *
 * El arcade tenía efectos pero silencio entre golpe y golpe, y un juego sin
 * fondo se siente muerto aunque la mecánica esté bien. Esto pone dos capas
 * debajo de todo, sin tocar ni un juego:
 *
 *   1. MÚSICA — una banda sintetizada que toca sola, elegida por la estética
 *      del juego: lounge de ascensor para los suaves, synthwave para los neón,
 *      chiptune para los de píxeles, jazz de bar para los de realismo…
 *
 *   2. LECHO — el ruido del sitio donde pasa el juego: lluvia, mar, público,
 *      grillos, sala vacía, chisporroteo. Se deduce de las etiquetas del
 *      manifiesto, así que un juego nuevo con `tags: ['playa']` suena a playa
 *      sin escribir una línea.
 *
 * Tres decisiones que conviene conocer:
 *
 *   · Todo es síntesis. Ni un archivo de audio, como el resto del proyecto
 *     (ver assets/LICENSES.md): pesa cero y funciona offline.
 *
 *   · El planificador va por delante del reloj. WebAudio programa eventos con
 *     tiempo absoluto, así que se agenda medio segundo por adelantado y el
 *     ritmo no depende de si el navegador entrega el setInterval tarde. Sin
 *     esto, la música cojea justo cuando el juego carga algo.
 *
 *   · La tensión sube sola. Cuanto más dura una partida, más se abre el filtro
 *     y más se puebla la percusión: la misma progresión se va animando sin que
 *     el juego tenga que avisar de nada.
 */

import { audio } from './audio.js';
import { loadSettings, updateSettings } from './storage.js';

/** Semitonos desde A4 → Hz. */
const nota = (semis) => 440 * Math.pow(2, semis / 12);

/* ═══════════════ Voces ═══════════════ */

/** Acorde sostenido y suave: varias ondas apiladas con ataque lento. */
function pad(ctx, out, freqs, t0, dur, { gain = 0.05, tipo = 'sine', corte = 1400, detune = 6 } = {}) {
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(corte, t0);
  filtro.Q.value = 0.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
  g.gain.setValueAtTime(gain, t0 + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  filtro.connect(g);
  g.connect(out);
  for (const f of freqs) {
    for (const d of [-detune, detune]) {
      const osc = ctx.createOscillator();
      osc.type = tipo;
      osc.frequency.value = f;
      osc.detune.value = d;
      osc.connect(filtro);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
  }
}

/** Bajo: triángulo filtrado con ataque corto. */
function bajo(ctx, out, freq, t0, dur, { gain = 0.09, tipo = 'triangle', corte = 700 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t0);
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.value = corte;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(filtro); filtro.connect(g); g.connect(out);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

/** Nota pulsada: melodía, arpegios y punteos. */
function pluck(ctx, out, freq, t0, dur, { gain = 0.045, tipo = 'triangle', corte = 2600 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.value = freq;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.frequency.setValueAtTime(corte, t0);
  filtro.frequency.exponentialRampToValueAtTime(Math.max(300, corte * 0.35), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(filtro); filtro.connect(g); g.connect(out);
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

/**
 * Piano eléctrico tipo Rhodes: seno con una campana desafinada encima.
 * Es el timbre que hace que algo suene a "hilo musical" y no a sintetizador.
 */
function rhodes(ctx, out, freqs, t0, dur, { gain = 0.05 } = {}) {
  for (const f of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    const campana = ctx.createOscillator();
    campana.type = 'sine';
    campana.frequency.value = f * 3.01;
    const gc = ctx.createGain();
    gc.gain.value = gain * 0.13;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    campana.connect(gc); gc.connect(g);
    g.connect(out);
    osc.start(t0); campana.start(t0);
    osc.stop(t0 + dur + 0.05); campana.stop(t0 + dur + 0.05);
  }
}

/** Ruido corto y filtrado: escobillas, charles, chasquidos. */
function ruidoCorto(ctx, out, t0, { dur = 0.14, freq = 4200, q = 0.7, gain = 0.03, tipo = 'bandpass' } = {}) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.frequency.value = freq;
  filtro.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filtro); filtro.connect(g); g.connect(out);
  src.start(t0);
}

/** Bombo blando. */
function bombo(ctx, out, t0, { gain = 0.09 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110, t0);
  osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  osc.connect(g); g.connect(out);
  osc.start(t0); osc.stop(t0 + 0.18);
}

/* ═══════════════ Paletas musicales ═══════════════
   Cada paleta es un tempo, una progresión (semitonos desde la tónica, en
   grados de acorde) y una función que decide qué suena en cada negra. La
   `tension` va de 0 a 1 y la usan para animarse conforme avanza la partida. */

const PROG_LOUNGE = [                      // ii–V–I–VI: el hilo musical de toda la vida
  { acorde: [0, 3, 7, 10], bajo: -12 },
  { acorde: [5, 9, 12, 15], bajo: -7 },
  { acorde: [-2, 2, 5, 9], bajo: -14 },
  { acorde: [-4, 0, 3, 7], bajo: -16 },
];
const PROG_SYNTH = [
  { acorde: [0, 3, 7], bajo: -24 },
  { acorde: [-2, 2, 5], bajo: -26 },
  { acorde: [-4, 0, 3], bajo: -28 },
  { acorde: [-5, -1, 2], bajo: -29 },
];
const PROG_CALMA = [
  { acorde: [0, 4, 7, 11], bajo: -12 },
  { acorde: [-3, 2, 5, 9], bajo: -15 },
  { acorde: [-5, 0, 4, 7], bajo: -17 },
  { acorde: [-7, -2, 2, 5], bajo: -19 },
];

const PROG_LOFI = [                        // Imaj7 – vi7 – ii7 – V7, en bucle
  { acorde: [0, 4, 7, 11], bajo: -12 },
  { acorde: [-3, 0, 4, 9], bajo: -15 },
  { acorde: [2, 5, 9, 12], bajo: -10 },
  { acorde: [-5, -1, 2, 7], bajo: -17 },
];

const ESCALA_MENOR = [0, 2, 3, 5, 7, 8, 10, 12];
const ESCALA_MAYOR = [0, 2, 4, 5, 7, 9, 11, 12];

const PALETAS = {
  /* Música de ascensor de manual: Rhodes, escobillas y bajo paseando. */
  ascensor: {
    bpm: 76, raiz: -9, prog: PROG_LOUNGE, escala: ESCALA_MAYOR,
    tocar(api, { beat, compas, tiempo, acorde, t0, tension }) {
      if (tiempo === 0) api.rhodes(acorde.notas, 1.9, { gain: 0.042 + tension * 0.012 });
      api.bajo(api.hz(acorde.bajo + (tiempo === 2 ? 7 : 0)), 0.5, { gain: 0.075 });
      if (tiempo % 2 === 1) api.ruido({ freq: 3400, gain: 0.022 + tension * 0.012, dur: 0.18 });
      if (tiempo === 3) api.ruido({ freq: 5200, gain: 0.012, dur: 0.1, q: 1.4 });
      // Un adorno de vez en cuando: sin esto, a los dos minutos cansa.
      if (tension > 0.25 && beat % 8 === 6) api.pluck(api.grado(2 + (compas % 3) * 2, 12), 0.5, { gain: 0.03 });
    },
  },

  /* Jazz de bar para los juegos de realismo: contrabajo, aro y trompeta sorda. */
  jazz: {
    bpm: 92, raiz: -12, prog: PROG_LOUNGE, escala: ESCALA_MENOR,
    tocar(api, { beat, tiempo, acorde, tension }) {
      if (tiempo === 0) api.rhodes(acorde.notas, 1.3, { gain: 0.03 });
      api.bajo(api.hz(acorde.bajo + [0, 7, 3, 5][tiempo]), 0.4, { gain: 0.08, corte: 520 });
      api.ruido({ freq: 3000, gain: tiempo % 2 ? 0.02 : 0.014, dur: 0.16 });
      if (tiempo === 2) api.ruido({ freq: 1500, gain: 0.012, dur: 0.05, q: 2 });
      if (tension > 0.35 && beat % 12 === 9) {
        api.pluck(api.grado(4, 12), 0.6, { gain: 0.028, tipo: 'sawtooth', corte: 1600 });
      }
    },
  },

  /* Synthwave para lo neón: bajo pulsante, pad ancho y arpegio. */
  sintetico: {
    bpm: 104, raiz: -14, prog: PROG_SYNTH, escala: ESCALA_MENOR,
    tocar(api, { beat, tiempo, acorde, tension }) {
      if (tiempo === 0) api.pad(acorde.notas, 2.0, { gain: 0.03 + tension * 0.018, tipo: 'sawtooth', corte: 900 + tension * 1800 });
      api.bajo(api.hz(acorde.bajo), 0.22, { gain: 0.07, tipo: 'sawtooth', corte: 420 });
      if (tension > 0.15) api.bajo(api.hz(acorde.bajo), 0.16, { gain: 0.05, tipo: 'sawtooth', corte: 400, retraso: 0.5 });
      if (tiempo === 0 || tiempo === 2) api.bombo({ gain: 0.075 });
      if (tension > 0.3) api.ruido({ freq: 8000, gain: 0.014, dur: 0.06, q: 1.2 });
      // Arpegio que solo aparece cuando la partida ya está encendida.
      if (tension > 0.45) api.pluck(api.grado((beat * 2) % 7, 12), 0.16, { gain: 0.026, tipo: 'square', corte: 3000 });
    },
  },

  /* Chiptune para los de píxeles: cuadradas, sin filtros de más. */
  chip: {
    bpm: 116, raiz: -9, prog: PROG_SYNTH, escala: ESCALA_MENOR,
    tocar(api, { beat, tiempo, acorde, tension }) {
      api.bajo(api.hz(acorde.bajo + 12), 0.13, { gain: 0.05, tipo: 'square', corte: 900 });
      if (tiempo % 2 === 0) api.pluck(api.hz(acorde.acorde[0] + 12), 0.1, { gain: 0.03, tipo: 'square', corte: 4000 });
      if (tension > 0.2 && beat % 4 === 3) {
        api.pluck(api.grado((beat / 4) % 6, 24), 0.12, { gain: 0.024, tipo: 'square', corte: 5000 });
      }
      if (tiempo === 0) api.bombo({ gain: 0.06 });
      if (tiempo === 2) api.ruido({ freq: 6000, gain: 0.02, dur: 0.06 });
    },
  },

  /* Acústico para lo de papel: guitarra punteada y nada más. */
  acustico: {
    bpm: 84, raiz: -7, prog: PROG_CALMA, escala: ESCALA_MAYOR,
    tocar(api, { beat, tiempo, acorde, tension }) {
      // Arpegio de la cuerda que toque, como un rasgueo lento.
      const n = acorde.notas[(beat + tiempo) % acorde.notas.length];
      api.pluck(n, 0.9, { gain: 0.035, tipo: 'triangle', corte: 2200 });
      if (tiempo === 0) api.bajo(api.hz(acorde.bajo), 0.7, { gain: 0.055, corte: 500 });
      if (tension > 0.3 && tiempo === 2) api.pluck(n * 2, 0.6, { gain: 0.02 });
    },
  },

  /* Lofi de estudio: Rhodes con séptimas, bajo redondo, caja a contratiempo y
     el chisporroteo del vinilo. Va a 72 bpm y con el «swing» metido a mano —
     retrasando la segunda corchea— porque es eso, y no los acordes, lo que
     hace que suene a lofi y no a jazz lento.
     Nada de esto es un archivo: sale todo del sintetizador, así que no hay
     licencia que respetar ni megas que descargar. */
  lofi: {
    bpm: 72, raiz: -10, prog: PROG_LOFI, escala: ESCALA_MAYOR,
    tocar(api, { beat, compas, tiempo, acorde, tension }) {
      // El acorde entra en el 1 y se repite floja en el 3, arrastrada.
      if (tiempo === 0) api.rhodes(acorde.notas, 2.6, { gain: 0.05 });
      if (tiempo === 2) api.rhodes(acorde.notas, 1.6, { gain: 0.022, retraso: 0.09 });

      // Bajo redondo y corto, muy filtrado: en lofi el bajo es sordo.
      api.bajo(api.hz(acorde.bajo + (tiempo === 3 ? 5 : 0)), 0.55, { gain: 0.085, corte: 320 });

      // Batería: bombo en 1 y 3, caja en 2 y 4, charles con swing.
      if (tiempo === 0 || tiempo === 2) api.bombo({ gain: 0.06 });
      if (tiempo === 1 || tiempo === 3) api.ruido({ freq: 1900, gain: 0.026, dur: 0.13, q: 0.8 });
      api.ruido({ freq: 7200, gain: 0.012, dur: 0.05, q: 1.6, tipo: 'highpass' });
      api.ruido({ freq: 7200, gain: 0.008, dur: 0.04, q: 1.6, tipo: 'highpass', retraso: 0.62 * (60 / 72) });

      // Melodía muy de vez en cuando: el lofi vive de dejar huecos.
      if (beat % 8 === 5) api.pluck(api.grado(4 + (compas % 4), 12), 1.1, { gain: 0.03, tipo: 'triangle', corte: 2400 });
      if (tension > 0.4 && beat % 16 === 12) api.pluck(api.grado(6, 12), 0.9, { gain: 0.022, tipo: 'sine' });
    },
  },

  /* Mínimo para la Touch Bar: casi nada, para no tapar los pitidos del juego. */
  minimal: {
    bpm: 88, raiz: -12, prog: PROG_CALMA, escala: ESCALA_MENOR,
    tocar(api, { beat, tiempo, acorde }) {
      if (tiempo === 0) api.pad(acorde.notas, 2.6, { gain: 0.022, corte: 700 });
      if (beat % 8 === 0) api.pluck(api.hz(acorde.bajo + 24), 0.4, { gain: 0.02, tipo: 'sine' });
    },
  },
};

const POR_ESTETICA = {
  neon: 'sintetico', suave: 'ascensor', papel: 'acustico',
  pixel: 'chip', oled: 'minimal', real: 'jazz',
};

/* ═══════════════ Lechos de escenario ═══════════════ */

/** Ruido continuo y filtrado, con un vaivén lento de volumen. */
function lechoRuido(ctx, out, { corte = 900, tipo = 'lowpass', q = 0.7, gain = 0.03, vaiven = 0.4, velocidad = 0.09 } = {}) {
  const len = Math.floor(ctx.sampleRate * 3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Ruido rosa aproximado: el blanco puro suena a estática de tele.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const blanco = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + blanco * 0.099;
    b1 = 0.963 * b1 + blanco * 0.2965;
    b2 = 0.57 * b2 + blanco * 1.0526;
    d[i] = (b0 + b1 + b2 + blanco * 0.1848) * 0.22;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipo;
  filtro.frequency.value = corte;
  filtro.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = velocidad;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = gain * vaiven;
  lfo.connect(lfoGain);
  lfoGain.connect(g.gain);
  src.connect(filtro); filtro.connect(g); g.connect(out);
  src.start();
  lfo.start();
  return { parar() { try { src.stop(); lfo.stop(); } catch { /* ya parados */ } } };
}

/** Zumbido grave de sala o de máquina. */
function lechoZumbido(ctx, out, { freq = 58, gain = 0.02, tipo = 'sine' } = {}) {
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = gain;
  osc.connect(g); g.connect(out);
  osc.start();
  return { parar() { try { osc.stop(); } catch { /* ya parado */ } } };
}

/**
 * Cada escenario declara su lecho continuo y, opcionalmente, sus "chispas":
 * eventos sueltos (un pájaro, un grillo, una ola que rompe, un jaleo del
 * público) que son lo que de verdad hace que un sitio parezca habitado.
 */
const ESCENARIOS = {
  lluvia: {
    lecho: (ctx, out) => [
      lechoRuido(ctx, out, { corte: 2600, gain: 0.035, vaiven: 0.25, velocidad: 0.13 }),
      lechoRuido(ctx, out, { corte: 420, gain: 0.02, vaiven: 0.5, velocidad: 0.05 }),
    ],
    chispa: (api) => { if (api.suerte(0.02)) api.ruido({ freq: 180, gain: 0.05, dur: 1.4, tipo: 'lowpass' }); },
  },
  mar: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 700, gain: 0.05, vaiven: 0.85, velocidad: 0.055 })],
    chispa: (api) => { if (api.suerte(0.05)) api.ruido({ freq: 900, gain: 0.03, dur: 1.1, q: 0.4 }); },
  },
  bosque: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 1200, gain: 0.018, vaiven: 0.6, velocidad: 0.04 })],
    chispa: (api) => {
      if (!api.suerte(0.05)) return;
      // Pájaro: dos notas agudas con caída, nunca la misma altura.
      const f = 1800 + Math.random() * 1400;
      api.pluck(f, 0.09, { gain: 0.022, tipo: 'sine', corte: 6000 });
      api.pluck(f * 1.32, 0.07, { gain: 0.018, tipo: 'sine', corte: 6000, retraso: 0.12 });
    },
  },
  noche: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 500, gain: 0.016, vaiven: 0.4, velocidad: 0.03 })],
    chispa: (api) => {
      // Grillo: tres chirridos rápidos.
      if (!api.suerte(0.09)) return;
      for (let i = 0; i < 3; i++) api.ruido({ freq: 5200, q: 12, gain: 0.012, dur: 0.03, retraso: i * 0.07 });
    },
  },
  estadio: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 1100, tipo: 'bandpass', q: 0.5, gain: 0.03, vaiven: 0.55, velocidad: 0.07 })],
    chispa: (api) => {
      // Oleada de público: sube y baja, como cuando pasa algo lejos.
      if (api.suerte(0.03)) api.ruido({ freq: 1400, q: 0.4, gain: 0.045, dur: 1.6, tipo: 'bandpass' });
    },
  },
  salon: {
    lecho: (ctx, out) => [
      lechoZumbido(ctx, out, { freq: 54, gain: 0.014 }),
      lechoRuido(ctx, out, { corte: 380, gain: 0.012, vaiven: 0.3, velocidad: 0.06 }),
    ],
    chispa: (api) => { if (api.suerte(0.012)) api.ruido({ freq: 2600, gain: 0.01, dur: 0.06, q: 3 }); },
  },
  arcade: {
    lecho: (ctx, out) => [
      lechoZumbido(ctx, out, { freq: 62, gain: 0.016 }),
      lechoRuido(ctx, out, { corte: 3000, tipo: 'highpass', gain: 0.008, vaiven: 0.2, velocidad: 0.11 }),
    ],
    chispa: (api) => {
      // Máquina lejana que se anuncia sola.
      if (!api.suerte(0.025)) return;
      const f = 500 + Math.random() * 700;
      api.pluck(f, 0.07, { gain: 0.012, tipo: 'square', corte: 3000 });
      api.pluck(f * 1.5, 0.07, { gain: 0.01, tipo: 'square', corte: 3000, retraso: 0.09 });
    },
  },
  hielo: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 2200, tipo: 'highpass', gain: 0.014, vaiven: 0.5, velocidad: 0.05 })],
    chispa: (api) => { if (api.suerte(0.02)) api.ruido({ freq: 7000, q: 3, gain: 0.014, dur: 0.18 }); },
  },
  fuego: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 800, gain: 0.022, vaiven: 0.6, velocidad: 0.14 })],
    chispa: (api) => {
      if (!api.suerte(0.25)) return;
      api.ruido({ freq: 1800 + Math.random() * 2500, q: 2, gain: 0.016, dur: 0.05 });
    },
  },
  motor: {
    lecho: (ctx, out) => [
      lechoZumbido(ctx, out, { freq: 78, gain: 0.02, tipo: 'sawtooth' }),
      lechoRuido(ctx, out, { corte: 600, gain: 0.02, vaiven: 0.35, velocidad: 0.2 }),
    ],
    chispa: () => {},
  },
  agua: {
    lecho: (ctx, out) => [lechoRuido(ctx, out, { corte: 1500, tipo: 'bandpass', q: 0.8, gain: 0.028, vaiven: 0.5, velocidad: 0.1 })],
    chispa: (api) => { if (api.suerte(0.06)) api.ruido({ freq: 2400, q: 1.5, gain: 0.014, dur: 0.22 }); },
  },
};

/**
 * Etiquetas del manifiesto → escenario. Se recorre en orden y gana la primera
 * que coincida, así que las más específicas van arriba.
 */
const POR_ETIQUETA = [
  [/lluvia|paraguas|tormenta|manguera/, 'lluvia'],
  [/playa|mar|vóley|voley|surf|pesca|balsa|submarin|remo|río|rio|piragua|barca|kayak/, 'agua'],
  [/nieve|hielo|esquí|esqui|curling|invierno|slalom|patin/, 'hielo'],
  [/fogata|hoguera|fuego|bomber|cocina|reactor/, 'fuego'],
  [/noche|estrella|constelaci|luna|espacio|cometa|uvas/, 'noche'],
  [/jardín|jardin|bosque|invernader|bonsái|bonsai|brote|árbol|arbol|parque|columpio/, 'bosque'],
  [/coche|carrera|rally|moto|circuito|turbo|grúa|grua|tándem|tandem|bici|ciclismo/, 'motor'],
  [/estadio|público|publico|fútbol|futbol|penalti|baloncesto|tenis|béisbol|beisbol|atletismo|hockey|velódromo|velodromo|bolos|pista/, 'estadio'],
];

const POR_CATEGORIA_ESC = {
  realismo: 'estadio', arcade: 'arcade', versus: 'arcade', reflejos: 'arcade',
  tablero: 'salon', coop: 'salon', pareja: 'salon', tactil: 'salon', touchbar: 'salon',
};

/* ═══════════════ El módulo ═══════════════ */

class Ambiente {
  constructor() {
    const s = loadSettings();
    this._activa = s.musica ?? true;
    this._volumen = s.musicaVolumen ?? 0.55;
    this.bus = null;          // gain propio: música + lecho
    this.paleta = null;
    this.escenario = null;
    this.lechos = [];
    this.beat = 0;
    this.siguiente = 0;       // instante (audio) de la próxima negra
    this.arranque = 0;
    this.tensionManual = null;
    this._reloj = 0;
    this._pausado = false;
    this._pendiente = null;   // juego pedido antes de que hubiera audio
  }

  /** ¿Hay música sonando ahora mismo? */
  get sonando() { return !!this.bus; }

  get activa() { return this._activa; }
  set activa(v) {
    this._activa = !!v;
    updateSettings({ musica: this._activa });
    if (!this._activa) this._silenciar();
    else if (this._pendiente) this.iniciar(this._pendiente);
  }

  get volumen() { return this._volumen; }
  set volumen(v) {
    this._volumen = Math.min(1, Math.max(0, v));
    updateSettings({ musicaVolumen: this._volumen });
    if (this.bus) this.bus.gain.value = this._pausado ? this._volumen * 0.25 : this._volumen;
  }

  /**
   * Arranca la ambientación para una entrada del manifiesto (o `null` para el
   * menú). Si el audio aún no está desbloqueado se guarda la intención y se
   * reintenta sola en cuanto lo esté.
   */
  /**
   * @param {object} juego   entrada del manifiesto, para elegir por estética
   * @param {object} [o]     { paleta } fuerza una paleta concreta
   */
  iniciar(juego, { paleta = null } = {}) {
    this._forzada = paleta;
    this._pendiente = juego;
    if (!this._activa) return;
    if (!audio.ready || !audio.ctx) { this._esperarAudio(); return; }
    this._montar(juego);
  }

  _esperarAudio() {
    if (this._reloj) return;
    // Sondeo barato: el desbloqueo llega con el primer gesto del usuario y no
    // hay evento propio al que engancharse.
    this._reloj = setInterval(() => {
      if (audio.ready && audio.ctx && this._activa && this._pendiente !== undefined) {
        clearInterval(this._reloj);
        this._reloj = 0;
        this._montar(this._pendiente);
      }
    }, 400);
  }

  _montar(juego) {
    this._silenciar();
    const ctx = audio.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = this._volumen;
    // Va al master (respeta volumen y silencio globales) pero no al compresor
    // de efectos: si no, cada explosión aplastaría la música entera.
    this.bus.connect(audio.master || ctx.destination);

    // La paleta forzada gana: el billar la usa para dejar elegir la música
    // desde su propio panel sin tener que inventarse otro sistema.
    const nombrePaleta = this._forzada && PALETAS[this._forzada]
      ? this._forzada
      : (juego ? (POR_ESTETICA[juego.estetica] || 'ascensor') : 'ascensor');
    this.paleta = PALETAS[nombrePaleta];
    this.escenario = ESCENARIOS[this._escenarioDe(juego)] || null;
    // Cada partida transpone un par de semitonos: la misma progresión no suena
    // idéntica dos veces seguidas.
    this.transporte = Math.floor(Math.random() * 5) - 2;

    if (this.escenario) {
      const salidaLecho = ctx.createGain();
      salidaLecho.gain.value = 1;
      salidaLecho.connect(this.bus);
      this.lechos = this.escenario.lecho(ctx, salidaLecho) || [];
    }

    this.beat = 0;
    this.arranque = ctx.currentTime;
    this.siguiente = ctx.currentTime + 0.12;
    this._ultimoTick = ctx.currentTime;
    this._pausado = false;
    this._reloj = setInterval(() => this._planificar(), 60);
  }

  /** Escenario deducido de las etiquetas, con la categoría como red de seguridad. */
  _escenarioDe(juego) {
    if (!juego) return 'salon';
    const texto = [...(juego.tags || []), juego.nombre, juego.descripcion].join(' ').toLowerCase();
    for (const [re, esc] of POR_ETIQUETA) if (re.test(texto)) return esc;
    return POR_CATEGORIA_ESC[juego.categoria] || 'salon';
  }

  /** Tensión automática: sube de 0 a 1 en el primer minuto y medio de partida. */
  get tension() {
    if (this.tensionManual != null) return this.tensionManual;
    if (!audio.ctx) return 0;
    return Math.min(1, (audio.ctx.currentTime - this.arranque) / 95);
  }

  /**
   * Planificador con adelanto: agenda todas las negras que caigan dentro de la
   * próxima medio segunda. Que el navegador entregue este intervalo tarde no
   * afecta al ritmo, porque los eventos ya están puestos con hora absoluta.
   */
  _planificar() {
    if (!this.bus || !audio.ctx || this._pausado) return;
    const ctx = audio.ctx;
    const paso = 60 / this.paleta.bpm;
    // Horizonte adaptativo: normalmente medio segundo, pero si el navegador
    // tardó en devolvernos el intervalo (carga de un juego 3D, pestaña de
    // fondo, recolección de basura) se agenda tanto como se tardó. Con un
    // horizonte fijo, cada tirón dejaba un silencio en la música.
    const desde = this._ultimoTick || ctx.currentTime;
    const retraso = Math.max(0, ctx.currentTime - desde);
    this._ultimoTick = ctx.currentTime;
    const horizonte = ctx.currentTime + Math.min(2.5, Math.max(0.5, retraso * 2.2));
    let guarda = 0;
    while (this.siguiente < horizonte && guarda++ < 64) {
      this._negra(this.siguiente);
      this.siguiente += paso;
      this.beat++;
    }
    // Si la pestaña estuvo dormida, el reloj se quedó atrás: se recoloca en
    // vez de intentar recuperar cien negras de golpe.
    if (this.siguiente < ctx.currentTime - 1) this.siguiente = ctx.currentTime + 0.05;
  }

  _negra(t0) {
    const ctx = audio.ctx;
    const p = this.paleta;
    const compas = Math.floor(this.beat / 4);
    const tiempo = this.beat % 4;
    const grado = p.prog[compas % p.prog.length];
    const raiz = p.raiz + this.transporte;
    const acorde = {
      acorde: grado.acorde,
      bajo: raiz + grado.bajo,
      notas: grado.acorde.map((g) => nota(raiz + g)),
    };
    const dest = this.bus;

    const api = {
      hz: (semis) => nota(semis),
      /** Nota de la escala de la paleta, `octava` semitonos arriba. */
      grado: (i, octava = 0) => nota(raiz + p.escala[((i % p.escala.length) + p.escala.length) % p.escala.length] + octava),
      pad: (freqs, dur, o = {}) => pad(ctx, dest, freqs, t0 + (o.retraso || 0), dur, o),
      rhodes: (freqs, dur, o = {}) => rhodes(ctx, dest, freqs, t0 + (o.retraso || 0), dur, o),
      bajo: (f, dur, o = {}) => bajo(ctx, dest, f, t0 + (o.retraso || 0) * (60 / p.bpm), dur, o),
      pluck: (f, dur, o = {}) => pluck(ctx, dest, f, t0 + (o.retraso || 0), dur, o),
      ruido: (o = {}) => ruidoCorto(ctx, dest, t0 + (o.retraso || 0), o),
      bombo: (o = {}) => bombo(ctx, dest, t0 + (o.retraso || 0), o),
      suerte: (p2) => Math.random() < p2,
    };

    try {
      p.tocar(api, { beat: this.beat, compas, tiempo, acorde, t0, tension: this.tension });
      this.escenario?.chispa?.(api);
    } catch { /* una nota perdida no puede tumbar la partida */ }
  }

  /** Bajar la música sin cortarla (pausa del juego). */
  /** Cambia de paleta sin cortar la música: el compás en curso termina. */
  cambiarPaleta(nombre) {
    this._forzada = nombre;
    if (PALETAS[nombre] && this.paleta) this.paleta = PALETAS[nombre];
  }

  pausar() {
    this._pausado = true;
    if (this.bus) this.bus.gain.value = this._volumen * 0.25;
  }
  reanudar() {
    this._pausado = false;
    if (this.bus && audio.ctx) {
      this.bus.gain.value = this._volumen;
      this.siguiente = audio.ctx.currentTime + 0.05;
    }
  }

  /** Golpe de color para un momento gordo (fin de partida). */
  acento(ganador = -1) {
    if (!this.bus || !audio.ctx) return;
    const ctx = audio.ctx, t0 = ctx.currentTime;
    const base = this.paleta ? this.paleta.raiz + this.transporte : -9;
    const grados = ganador < 0 ? [0, 3, 7] : [0, 4, 7, 12];
    rhodes(ctx, this.bus, grados.map((g) => nota(base + g + 12)), t0, 1.6, { gain: 0.05 });
  }

  parar() {
    this._pendiente = undefined;
    this._silenciar();
  }

  _silenciar() {
    clearInterval(this._reloj);
    this._reloj = 0;
    for (const l of this.lechos) l.parar?.();
    this.lechos = [];
    if (this.bus) {
      try {
        // Una rampa corta evita el "clic" de cortar en seco.
        const t0 = audio.ctx.currentTime;
        this.bus.gain.setValueAtTime(this.bus.gain.value, t0);
        this.bus.gain.linearRampToValueAtTime(0.0001, t0 + 0.25);
        const bus = this.bus;
        setTimeout(() => { try { bus.disconnect(); } catch { /* ya suelto */ } }, 400);
      } catch { try { this.bus.disconnect(); } catch { /* ya suelto */ } }
      this.bus = null;
    }
  }
}

/** Instancia única, como audio, input y haptics. */
export const PALETAS_DISPONIBLES = Object.keys(PALETAS);
export const ambiente = new Ambiente();
