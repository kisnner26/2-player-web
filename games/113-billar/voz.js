/**
 * voz.js — la voz de los personajes.
 *
 * No son palabras: son sílabas. El truco es el de Animal Crossing y Banjo —
 * un balbuceo corto con la entonación de la frase que tocaría decir. El
 * cerebro completa el resto y el muñeco pasa de maniquí a alguien que está
 * jugando contigo, sin grabar ni un archivo de audio y sin idioma que
 * traducir.
 *
 * Cada sílaba son dos osciladores: uno para el tono y otro una quinta arriba
 * muy flojo, que es lo que le da cuerpo de voz en vez de sonar a pitido. El
 * filtro paso bajo se abre y se cierra dentro de la sílaba imitando la boca.
 *
 * Cada jugador tiene su timbre, sacado de su color de perfil: dos personajes
 * no pueden sonar igual o no sabrías cuál de los dos ha refunfuñado.
 */

import { audio } from '../../core/audio.js';

/* Frases: cada una es una lista de grados relativos con su duración. La
   entonación es lo único que importa —subir pregunta, bajar resigna— así que
   están escritas como melodías cortas, no como texto. */
const FRASES = {
  saluda: [[0, 1], [4, 1], [2, 1.4]],                    // «¿vamos allá?»
  apunta: [[0, 0.8], [-2, 1]],                           // murmullo de concentración
  acierta: [[4, 0.7], [7, 0.7], [11, 1.3]],              // «¡toma ya!»
  acertaza: [[7, 0.6], [11, 0.6], [14, 0.6], [16, 1.6]], // varias de golpe
  falla: [[2, 0.8], [-1, 0.9], [-4, 1.6]],               // «vaya…»
  falta: [[-2, 0.7], [-5, 1.6]],                         // «uf»
  gana: [[0, 0.6], [4, 0.6], [7, 0.6], [12, 1.8]],
  pierde: [[-3, 0.9], [-7, 2]],
  pica: [[7, 0.5], [5, 0.5], [7, 0.9]],                  // chincha al rival
};

/** Del color del jugador sale su registro: los cálidos hablan más grave. */
function timbreDe(colorHex) {
  const n = parseInt(colorHex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const calido = (r - b) / 255;                    // −1 frío · +1 cálido
  return {
    base: 210 - calido * 55,                       // Hz de la sílaba central
    tipo: calido > 0.1 ? 'triangle' : 'square',
    corte: 900 + Math.abs(calido) * 500,
  };
}

const semitono = (base, n) => base * Math.pow(2, n / 12);

export function crearVoz(players) {
  const timbres = players.map((p) => timbreDe(p.color));
  /* Cortesía mínima: si acaba de hablar, no se le encima otra frase. Dos
     muñecos hablando a la vez suenan a error, no a conversación. */
  const ultima = [0, 0];

  return {
    /**
     * @param {number} j     jugador
     * @param {string} clave frase de FRASES
     * @param {object} o     { prisa: acelera las sílabas, vol }
     * @returns {number} duración total, para sincronizar el gesto de la boca
     */
    decir(j, clave, { prisa = 1, vol = 1 } = {}) {
      const frase = FRASES[clave];
      const t = timbres[j];
      if (!frase || !t) return 0;
      const ahora = performance.now();
      if (ahora - ultima[j] < 260) return 0;
      ultima[j] = ahora;

      let retraso = 0;
      for (const [grado, largo] of frase) {
        const dur = 0.085 * largo / prisa;
        const f = semitono(t.base, grado);
        // Cuerpo de la sílaba.
        audio.tone({
          freq: f, dur, gain: 0.085 * vol, type: t.tipo,
          delay: retraso, sweep: grado * 1.5, attack: 0.012,
        });
        // Armónico de quinta, flojito: es lo que la separa de un pitido.
        audio.tone({
          freq: f * 1.5, dur: dur * 0.8, gain: 0.028 * vol, type: 'sine',
          delay: retraso + 0.008,
        });
        // Consonante: un chasquido de aire al empezar cada sílaba.
        audio.noise({ dur: 0.022, gain: 0.02 * vol, filter: t.corte, delay: retraso });
        retraso += dur + 0.035 / prisa;
      }
      return retraso;
    },

    /** ¿Cuánto lleva hablando este jugador? Lo usa la animación de la boca. */
    hablando(j) { return Math.max(0, 1 - (performance.now() - ultima[j]) / 600); },
  };
}
