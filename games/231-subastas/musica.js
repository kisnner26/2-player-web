/**
 * musica.js — la sintonía del programa, tocada en directo por el navegador.
 *
 * Ni un archivo de audio, como todo lo demás del arcade: seis voces de
 * osciladores y ruido (bajo, acordes, melodía, bombo, caja y charles) tocando
 * un bucle de cuatro compases en la menor. La progresión es la de toda la vida
 * —Am · F · C · G— porque es la que suena a sintonía de concurso a la primera
 * vuelta y no cansa a la décima.
 *
 * Dos cosas que conviene entender antes de tocarla:
 *
 *   1. **Se programa por delante, no al ritmo de los fotogramas.** WebAudio
 *      tiene su propio reloj, exacto al microsegundo; el bucle del juego, no.
 *      Si cada nota se disparase en su fotograma, el ritmo iría dando tumbos
 *      con cada bajada de fps. Aquí `paso()` solo mira si falta menos de
 *      `HORIZONTE` para la siguiente semicorchea y, si falta, la deja
 *      programada con su instante exacto. El sonido va por delante del juego.
 *
 *   2. **La intensidad la manda la partida.** Durante la puja entran el
 *      charles doble y la melodía aguda; en el reparto la música se aparta
 *      para dejar oír el recuento. Es la misma canción, no otra: cambia lo que
 *      toca cada voz, no el tema.
 */

const HORIZONTE = 0.32;        // segundos que se programan por delante
const BPM = 108;
const PASOS = 64;              // cuatro compases de semicorcheas

/** Frecuencia de una nota MIDI. */
const nota = (m) => 440 * (2 ** ((m - 69) / 12));

/* Am · F · C · G, un compás cada uno. */
const RAICES = [45, 41, 48, 43];                    // A2 F2 C3 G2
const TRIADAS = [
  [57, 60, 64],   // Am
  [53, 57, 60],   // F
  [60, 64, 67],   // C
  [55, 59, 62],   // G
];

/* Patrones dentro de cada compás (16 semicorcheas). */
const BAJO = [0, 3, 6, 8, 11, 14];
const OCTAVA = [6, 14];                             // saltos de octava del bajo
const ACORDE = [2, 6, 10, 14];
const BOMBO = [0, 6, 8, 14];
const CAJA = [4, 12];

/**
 * El gancho: pentatónica de la menor, sobre los compases 2 y 4.
 * Ocho notas contadas — un riff que se pueda tararear es un riff que se
 * reconoce cuando vuelve, y eso es todo lo que se le pide a una sintonía.
 */
const RIFF = {
  1: [[0, 69], [3, 72], [6, 74], [10, 72], [12, 69]],
  3: [[0, 76], [2, 74], [5, 72], [8, 69], [11, 67], [14, 69]],
};

export function crearMusica(audio) {
  let n = null;
  let paso16 = 0;
  let proxima = 0;
  let vivo = true;

  const dur = 15 / BPM;        // duración de una semicorchea

  function arrancar() {
    const ac = audio.ctx;
    if (!ac) return;

    const salida = ac.createGain();
    salida.gain.value = 0.0001;

    // Un pelín de brillo general: la mezcla cruda sale muy mate.
    const brillo = ac.createBiquadFilter();
    brillo.type = 'highshelf';
    brillo.frequency.value = 2600;
    brillo.gain.value = 3;
    salida.connect(brillo).connect(audio.comp);

    n = { ac, salida, buffers: {} };

    // Un solo búfer de ruido reutilizado por la caja y el charles: crear uno
    // nuevo en cada golpe son varios miles de números aleatorios por compás.
    const largo = Math.floor(ac.sampleRate * 0.4);
    const buf = ac.createBuffer(1, largo, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < largo; i++) d[i] = Math.random() * 2 - 1;
    n.buffers.ruido = buf;

    proxima = ac.currentTime + 0.08;
  }

  /* ---------------- Voces ---------------- */

  function env(t0, dur0, pico, caida = null) {
    const g = n.ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(pico, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (caida ?? dur0));
    return g;
  }

  function bajo(midi, t0, largo, vol) {
    const o = n.ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = nota(midi);
    const lp = n.ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 7;
    // Barrido del filtro por nota: es lo que le da el "wow" de bajo funk.
    lp.frequency.setValueAtTime(1500, t0);
    lp.frequency.exponentialRampToValueAtTime(320, t0 + largo * 0.9);
    const g = env(t0, largo, 0.32 * vol);
    o.connect(lp).connect(g).connect(n.salida);
    o.start(t0);
    o.stop(t0 + largo + 0.03);
  }

  function acorde(midis, t0, vol) {
    for (const m of midis) {
      for (const desafine of [-6, 6]) {
        const o = n.ac.createOscillator();
        o.type = 'square';
        o.frequency.value = nota(m);
        o.detune.value = desafine;
        const g = env(t0, 0.14, 0.036 * vol);
        const lp = n.ac.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        o.connect(lp).connect(g).connect(n.salida);
        o.start(t0);
        o.stop(t0 + 0.18);
      }
    }
  }

  function melodia(midi, t0, vol) {
    const o = n.ac.createOscillator();
    o.type = 'triangle';
    o.frequency.value = nota(midi);
    const g = env(t0, 0.26, 0.16 * vol);
    o.connect(g).connect(n.salida);
    o.start(t0);
    o.stop(t0 + 0.3);
    // Una quinta por encima, floja: engorda la melodía sin taparla.
    const o2 = n.ac.createOscillator();
    o2.type = 'square';
    o2.frequency.value = nota(midi + 7);
    const g2 = env(t0, 0.18, 0.035 * vol);
    o2.connect(g2).connect(n.salida);
    o2.start(t0);
    o2.stop(t0 + 0.22);
  }

  function bombo(t0, vol) {
    const o = n.ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t0);
    o.frequency.exponentialRampToValueAtTime(44, t0 + 0.11);
    const g = env(t0, 0.16, 0.5 * vol);
    o.connect(g).connect(n.salida);
    o.start(t0);
    o.stop(t0 + 0.2);
  }

  function percusion(t0, { filtro, q, tipo, dur: d0, vol }) {
    const s = n.ac.createBufferSource();
    s.buffer = n.buffers.ruido;
    const bq = n.ac.createBiquadFilter();
    bq.type = tipo;
    bq.frequency.value = filtro;
    bq.Q.value = q;
    const g = env(t0, d0, vol);
    s.connect(bq).connect(g).connect(n.salida);
    s.start(t0, 0, d0 + 0.05);
  }

  /* ---------------- Secuenciador ---------------- */

  function programar(i, t0, intensidad) {
    const compas = Math.floor(i / 16);
    const p = i % 16;
    const vol = 0.75 + intensidad * 0.25;

    if (BAJO.includes(p)) {
      bajo(RAICES[compas] + (OCTAVA.includes(p) ? 12 : 0), t0, dur * 1.7, vol);
    }
    if (ACORDE.includes(p)) acorde(TRIADAS[compas], t0, vol);
    if (BOMBO.includes(p)) bombo(t0, vol);
    if (CAJA.includes(p)) percusion(t0, { filtro: 1700, q: 1.1, tipo: 'bandpass', dur: 0.14, vol: 0.24 * vol });

    // Charles a corcheas; en la puja, a semicorcheas: el mismo tema al doble
    // de nervio sin cambiar una sola nota.
    const finos = intensidad > 0.5;
    if (p % (finos ? 1 : 2) === 0) {
      percusion(t0, {
        filtro: 8200, q: 0.8, tipo: 'highpass',
        dur: p % 4 === 0 ? 0.05 : 0.03,
        vol: (p % 4 === 0 ? 0.09 : 0.05) * vol,
      });
    }

    const riff = RIFF[compas];
    if (riff && intensidad > 0.25) {
      for (const [paso, midi] of riff) {
        if (paso === p) melodia(midi + (intensidad > 0.7 ? 12 : 0), t0, vol);
      }
    }
  }

  return {
    /**
     * @param {string} fase   config | puerta | subasta | reparto | fin
     */
    paso(fase) {
      if (!vivo) return;
      if (!n) { if (audio.ready) arrancar(); return; }

      const ahora = n.ac.currentTime;

      // Volumen y nervio según lo que esté pasando en la subasta.
      const [gan, nervio] = fase === 'subasta' ? [0.5, 0.85]
        : fase === 'reparto' ? [0.24, 0.15]
          : fase === 'config' ? [0.34, 0.3]
            : [0.4, 0.35];
      n.salida.gain.setTargetAtTime(gan, ahora, 0.7);

      // Si el juego estuvo en pausa, el reloj de audio siguió corriendo: en vez
      // de soltar de golpe todas las notas atrasadas, se reengancha al compás.
      if (proxima < ahora - 0.25) {
        proxima = ahora + 0.05;
        paso16 = 0;
      }

      while (proxima < ahora + HORIZONTE) {
        programar(paso16, proxima, nervio);
        proxima += dur;
        paso16 = (paso16 + 1) % PASOS;
      }
    },

    parar() {
      vivo = false;
      if (!n) return;
      const t = n.ac.currentTime;
      n.salida.gain.cancelScheduledValues(t);
      n.salida.gain.setTargetAtTime(0.0001, t, 0.15);
      setTimeout(() => { try { n.salida.disconnect(); } catch { /* ya suelto */ } }, 900);
      n = null;
    },
  };
}
