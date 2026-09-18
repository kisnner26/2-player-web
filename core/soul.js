/**
 * soul.js — banda de acompañamiento soul/jazz, sintetizada y original.
 *
 * El pedido era música real con ese aire (Amy Winehouse y similares), pero
 * embeber sus grabaciones no es legal ni posible sin cuentas/streaming — y
 * este proyecto es deliberadamente offline y sin dependencias externas
 * (ver assets/LICENSES.md). La alternativa honesta: una banda sintetizada
 * propia, con el mismo lenguaje armónico y tímbrico (soul de los 60,
 * Motown, Northern Soul) — saxo, bajo caminante, batería con escobillas y
 * piano eléctrico — compuesta aquí, no muestreada de nadie.
 *
 * Las progresiones de acordes no son objeto de copyright (solo la grabación
 * y la melodía concretas lo son), así que usar un ii-V-I con shuffle es
 * tan legítimo como tocarlo en un bar.
 */

import { audio } from './audio.js';

/** Notas -> Hz (A4 = 440). */
function nota(semitonosDesdeA4) {
  return 440 * Math.pow(2, semitonosDesdeA4 / 12);
}
// Tabla corta de las notas que usa la progresión, en notación con octava.
const N = {
  D2: nota(-31), A2: nota(-24), C3: nota(-21), D3: nota(-19), E3: nota(-17), F3: nota(-16),
  G2: nota(-26), G3: nota(-14), A3: nota(-12), B3: nota(-10), C4: nota(-9),
  D4: nota(-7), E4: nota(-5), F4: nota(-4), G4: nota(-2), A4: 440, B4: nota(2),
};

/**
 * Progresión de dos compases en Re menor, con ese aire de balada soul
 * (ii–V–i–VI): Dm7 · G7 · Cmaj7 · Am7. Cuatro acordes, uno por compás.
 */
const PROGRESION = [
  { nombre: 'Dm7', notas: [N.D3, N.F3, N.A3, N.C4], raiz: N.D2, tercera: N.F3, quinta: N.A2 },
  { nombre: 'G7', notas: [N.G3, N.B3, N.D4, N.F4], raiz: N.G2, tercera: N.B3, quinta: N.D3 },
  { nombre: 'Cmaj7', notas: [N.C4, N.E4, N.G4, N.B4], raiz: N.C3, tercera: N.E3, quinta: N.G3 },
  { nombre: 'Am7', notas: [N.A3, N.C4, N.E4, N.G4], raiz: N.A2, tercera: N.C3, quinta: N.E3 },
];

export function createSoulBand({ volumen = 0.55 } = {}) {
  let salida = null;   // gain propio, se crea al desbloquear el audio

  function asegurarSalida() {
    if (!audio.ready || !audio.ctx) return null;
    if (!salida || salida.context !== audio.ctx) {
      salida = audio.ctx.createGain();
      salida.gain.value = volumen;
      salida.connect(audio.comp || audio.ctx.destination);
    }
    return salida;
  }

  const t = () => audio.ctx.currentTime;

  /* ---------------- Voces ---------------- */

  /** Saxo: diente de sierra filtrado, vibrato y un pelo de aire (ruido). */
  function sax(freq, dur, { gain = 0.14, delay = 0 } = {}) {
    const out = asegurarSalida(); if (!out) return;
    const ctx = audio.ctx, t0 = t() + delay;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t0);

    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 5.2;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.008;
    vibrato.connect(vibGain);
    vibGain.connect(osc.frequency);

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = freq * 2.2;
    filtro.Q.value = 1.4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.05);
    g.gain.exponentialRampToValueAtTime(gain * 0.7, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filtro); filtro.connect(g); g.connect(out);
    osc.start(t0); vibrato.start(t0);
    osc.stop(t0 + dur + 0.05); vibrato.stop(t0 + dur + 0.05);
  }

  /** Bajo caminante: triángulo cálido, ataque corto, ligero portamento. */
  function bass(freq, dur, { gain = 0.22, delay = 0, desde = null } = {}) {
    const out = asegurarSalida(); if (!out) return;
    const ctx = audio.ctx, t0 = t() + delay;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    if (desde) {
      osc.frequency.setValueAtTime(desde, t0);
      osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.06);
    } else {
      osc.frequency.setValueAtTime(freq, t0);
    }

    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 900;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    osc.connect(filtro); filtro.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  /** Acorde de piano eléctrico: notas apiladas, timbre tipo Rhodes. */
  function chordStab(notas, dur, { gain = 0.09, delay = 0 } = {}) {
    const out = asegurarSalida(); if (!out) return;
    const ctx = audio.ctx, t0 = t() + delay;

    for (const freq of notas) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const campana = ctx.createOscillator();
      campana.type = 'sine';
      campana.frequency.value = freq * 2.01;   // ligero desafine: color de Rhodes
      const gCampana = ctx.createGain();
      gCampana.gain.value = gain * 0.18;

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(g);
      campana.connect(gCampana); gCampana.connect(g);
      g.connect(out);
      osc.start(t0); campana.start(t0);
      osc.stop(t0 + dur + 0.05); campana.stop(t0 + dur + 0.05);
    }
  }

  /** Bombo: seno con caída rápida de frecuencia, ataque seco. */
  function kick({ gain = 0.3, delay = 0 } = {}) {
    const out = asegurarSalida(); if (!out) return;
    const ctx = audio.ctx, t0 = t() + delay;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t0);
    osc.frequency.exponentialRampToValueAtTime(38, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + 0.2);
  }

  /** Escobilla: ruido filtrado, más suave y largo que un platillo normal. */
  function brush({ gain = 0.1, delay = 0 } = {}) {
    const out = asegurarSalida(); if (!out) return;
    const ctx = audio.ctx, t0 = t() + delay;
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = 3200;
    filtro.Q.value = 0.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
    src.connect(filtro); filtro.connect(g); g.connect(out);
    src.start(t0);
  }

  /** Golpe de aro: clic corto y agudo, para los contratiempos. */
  function rim({ gain = 0.08, delay = 0 } = {}) {
    const out = asegurarSalida(); if (!out) return;
    const ctx = audio.ctx, t0 = t() + delay;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.035);
    osc.connect(g); g.connect(out);
    osc.start(t0); osc.stop(t0 + 0.05);
  }

  /* ---------------- Secuenciador ---------------- */

  /** Línea de bajo caminante: raíz, quinta, tercera del siguiente, cromatismo. */
  function notaDeBajo(compas, tiempo) {
    const actual = PROGRESION[compas % PROGRESION.length];
    const siguiente = PROGRESION[(compas + 1) % PROGRESION.length];
    switch (tiempo) {
      case 0: return actual.raiz;
      case 1: return actual.tercera;
      case 2: return actual.quinta;
      default: return (actual.raiz + siguiente.raiz) / 2;   // paso cromático de acercamiento
    }
  }

  let ultimoCompas = -1;

  /**
   * Avanza la banda un tiempo (negra). Se llama una vez por beat detectado
   * en el propio reloj del juego — el soul band no lleva reloj propio, para
   * no desincronizarse con la partida.
   * @param {number} beatIndex  contador de negras desde el inicio, siempre creciente
   */
  function tick(beatIndex) {
    if (!asegurarSalida()) return;
    const compas = Math.floor(beatIndex / 4);
    const tiempo = beatIndex % 4;

    // Acorde y saxo al entrar en cada compás nuevo.
    if (compas !== ultimoCompas) {
      ultimoCompas = compas;
      const ac = PROGRESION[compas % PROGRESION.length];
      chordStab(ac.notas, 1.1);
      // El saxo improvisa una nota del acorde, con swing (llega un pelín tarde).
      const notaSax = ac.notas[Math.floor(Math.random() * ac.notas.length)];
      sax(notaSax * 2, 0.5, { delay: 0.06 + Math.random() * 0.05, gain: 0.1 });
    }

    // Bajo caminante, una nota por negra.
    bass(notaDeBajo(compas, tiempo), 0.42);

    // Batería: bombo en 1 y 3, escobilla en 2 y 4, aro en el "y" sincopado.
    if (tiempo === 0 || tiempo === 2) kick({ gain: 0.22 });
    if (tiempo === 1 || tiempo === 3) brush({ gain: 0.08 });
    if (tiempo === 3) rim({ delay: 0.24, gain: 0.05 });
  }

  function reset() { ultimoCompas = -1; }

  return { tick, reset, sax, bass, chordStab, kick, brush, rim, PROGRESION };
}
