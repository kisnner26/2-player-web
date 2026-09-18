/**
 * Oído Absoluto — suena una nota y hay que encontrarla en la barra, a ciegas.
 *
 * Las teclas no están etiquetadas y no suenan al tocarlas: solo se oye la nota
 * objetivo y, después de fallar, la que has tocado. Así que no vale ir
 * probando de oído tecla a tecla — hay que apuntar.
 *
 * Puntúa la cercanía, no el acierto exacto: quedarse a un semitono vale casi
 * todo. Eso hace que el juego se pueda jugar sin oído absoluto y que el que
 * lo tiene se note enseguida.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const NOTAS = 13;              // una octava más la tónica
const RONDAS = 6;
const BASE = 261.63;           // do central
const NOMBRES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si', 'Do'];

export function create(ctx) {
  const { touchbar, audio, haptics, players, rng } = ctx;

  let cab = null, espejo = null, disponible = false, desuscribir = null;
  let objetivo = 0, turno = 0, ronda = 1, fase = 'sonando', pausa = 0, elegida = -1;
  const score = [0, 0];

  const freq = (n) => BASE * Math.pow(2, n / 12);

  function sonar(n, gain = 0.22) {
    audio.tone({ freq: freq(n), dur: 0.85, gain, type: 'sine' });
    audio.tone({ freq: freq(n) * 2, dur: 0.5, gain: gain * 0.3, type: 'sine', delay: 0.02 });
  }

  function nuevaRonda() {
    objetivo = Math.floor(rng() * NOTAS);
    elegida = -1;
    fase = 'sonando';
    pausa = 1.1;
    cab.resaltar(turno);
    cab.decir(`Ronda ${ronda}/${RONDAS} · <b style="color:${players[turno].color}">${players[turno].name}</b> · escucha y busca la nota`);
    sonar(objetivo);
    pintar();
  }

  function pintar() {
    const celdas = [];
    for (let i = 0; i < NOTAS; i++) {
      const negra = [1, 3, 6, 8, 10].includes(i % 12);
      let bg = negra ? '#14141c' : '#22222c';
      let label = '';
      let color = '#8a8a9a';
      if (fase === 'resultado') {
        if (i === objetivo) { bg = '#1f7a3a'; label = NOMBRES[i]; color = '#ffffff'; }
        else if (i === elegida) { bg = '#7a2020'; label = NOMBRES[i]; color = '#ffffff'; }
      }
      celdas.push({ label, bg, color, clase: negra ? 'tenue' : '' });
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `n${i}`, label: c.label || ' ', bg: c.bg, color: c.color,
      })),
    ]);
  }

  function elegir(i) {
    if (fase !== 'escuchando') return;
    elegida = i;
    fase = 'resultado';
    pausa = 2.4;
    const dist = Math.abs(i - objetivo);
    // Un semitono de error sigue valiendo mucho: si no, el juego es cruel.
    const puntos = dist === 0 ? 100 : dist === 1 ? 60 : dist === 2 ? 30 : Math.max(0, 14 - dist * 2);
    score[turno] += puntos;
    cab.marcar(score[0], score[1]);
    cab.decir(dist === 0
      ? `¡${NOMBRES[objetivo]} clavada! +100`
      : `Era ${NOMBRES[objetivo]} y tocaste ${NOMBRES[i]} · +${puntos}`);
    if (dist === 0) { audio.win(); haptics.victory(turno); touchbar.haptic('heavy'); }
    else { haptics.play(dist <= 2 ? 'score' : 'error', { player: turno }); touchbar.haptic('medium'); }
    // Se oyen las dos para aprender: primero la tuya y luego la buena.
    sonar(i, 0.18);
    setTimeout(() => sonar(objetivo, 0.2), 700);
    espejo?.destello(i, dist === 0 ? '#a8ff3e' : '#ff8c42');
    pintar();
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Oído', segmentos: NOTAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || ev.id === '_turno') return;
        const m = /^n(\d+)$/.exec(ev.id);
        if (m) elegir(+m[1]);
      });
      nuevaRonda();
    },

    update(dt) {
      if (!disponible) return;
      pausa -= dt;
      if (pausa > 0) return;

      if (fase === 'sonando') {
        fase = 'escuchando';
        pausa = 99;
        cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · toca la tecla que crees que ha sonado`);
        return;
      }
      if (fase === 'resultado') {
        if (turno === 0) { turno = 1; nuevaRonda(); return; }
        turno = 0;
        ronda++;
        if (ronda > RONDAS) {
          const [a, b] = score;
          ctx.finish({
            winner: a === b ? -1 : a > b ? 0 : 1,
            scores: [a, b],
            detail: `${RONDAS} notas cada uno`,
            record: ctx.record('puntos', Math.max(a, b), 'high'),
          });
          return;
        }
        nuevaRonda();
      }
    },

    destroy() {
      desuscribir?.();
      touchbar.clear();
    },
  };
}
