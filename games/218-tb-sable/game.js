/**
 * Sable de Luz — el golpe se anuncia un instante y hay que pararlo donde cae.
 *
 * La barra se enciende entera de rojo salvo la celda por la que entra el
 * sable. Tocar esa celda a tiempo es parar; tocar otra es comerse el tajo.
 * El aviso dura cada vez menos, y a partir de la quinta ronda hay fintas: se
 * enciende una celda y salta a otra antes de llegar.
 *
 * Se paran cinco golpes por turno. Cada parada suma y cada fallo resta, así
 * que quedarse quieto no salva: hay que decidir.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 18;
const GOLPES = 5;
const RONDAS = 2;

export function create(ctx) {
  const { touchbar, audio, haptics, players, rng } = ctx;

  let cab = null, espejo = null, disponible = false, desuscribir = null;
  let objetivo = 0, aviso = 0, ventana = 0, fase = 'esperando', pausa = 0, finta = false;
  let turno = 0, golpe = 0, ronda = 1;
  const score = [0, 0];

  function nuevoGolpe() {
    golpe++;
    const dificultad = (ronda - 1) * GOLPES + golpe;
    objetivo = Math.floor(rng() * CELDAS);
    aviso = Math.max(0.34, 1.15 - dificultad * 0.075);
    finta = dificultad >= 5 && rng() < 0.45;
    ventana = 0;
    fase = 'avisando';
    cab.resaltar(turno);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · golpe ${golpe}/${GOLPES}${finta ? ' · ¡ojo!' : ''}`);
    audio.tone({ freq: 620, dur: 0.09, gain: 0.14, type: 'square' });
    pintar();
  }

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (fase === 'avisando' && i === objetivo) {
        celdas.push({ label: '▮', bg: '#3aa0ff', color: '#001020', clase: 'viva' });
      } else if (fase === 'cayendo' && i === objetivo) {
        celdas.push({ label: '▮', bg: '#ffffff', color: '#000000', clase: 'viva' });
      } else if (fase === 'avisando' || fase === 'cayendo') {
        celdas.push({ label: '', bg: '#3a0d14', clase: 'tenue' });
      } else {
        celdas.push({ label: '', bg: '#101018', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `s${i}`, label: c.label || ' ', bg: c.bg, color: c.color || '#000000',
      })),
    ]);
  }

  function parar(i) {
    if (fase !== 'avisando' && fase !== 'cayendo') return;
    const bien = i === objetivo;
    fase = 'resultado';
    pausa = 1.3;
    if (bien) {
      const puntos = 50 + Math.round((1 - aviso) * 60);
      score[turno] += puntos;
      cab.decir(`¡Parada! +${puntos}`);
      audio.win();
      haptics.victory(turno);
      touchbar.haptic('heavy');
      espejo?.destello(i, '#a8ff3e');
    } else {
      score[turno] = Math.max(0, score[turno] - 25);
      cab.decir(`Tajo · entraba por la ${objetivo + 1} y tocaste la ${i + 1} · −25`);
      audio.error();
      haptics.error(turno);
      touchbar.haptic('heavy');
      espejo?.destello(i, '#ff2e2e');
    }
    cab.marcar(score[0], score[1]);
    pintar();
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Sable', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || ev.id === '_turno') return;
        const m = /^s(\d+)$/.exec(ev.id);
        if (m) parar(+m[1]);
      });
      fase = 'esperando';
      pausa = 1;
    },

    update(dt) {
      if (!disponible) return;
      pausa -= dt;

      if (fase === 'esperando') {
        if (pausa <= 0) nuevoGolpe();
        return;
      }

      if (fase === 'avisando') {
        aviso -= dt;
        // Finta: a mitad de aviso el golpe salta a otra celda.
        if (finta && aviso < 0.16) {
          objetivo = (objetivo + 1 + Math.floor(rng() * (CELDAS - 1))) % CELDAS;
          finta = false;
          audio.blip();
          pintar();
        }
        if (aviso <= 0) {
          fase = 'cayendo';
          ventana = 0.32;
          audio.swoosh();
          pintar();
        }
        return;
      }

      if (fase === 'cayendo') {
        ventana -= dt;
        if (ventana <= 0) {
          fase = 'resultado';
          pausa = 1.2;
          score[turno] = Math.max(0, score[turno] - 25);
          cab.marcar(score[0], score[1]);
          cab.decir('Ni te has movido · −25');
          audio.error();
          haptics.error(turno);
          pintar();
        }
        return;
      }

      if (fase === 'resultado' && pausa <= 0) {
        if (golpe >= GOLPES) {
          golpe = 0;
          if (turno === 0) turno = 1;
          else {
            turno = 0;
            ronda++;
            if (ronda > RONDAS) {
              const [a, b] = score;
              ctx.finish({
                winner: a === b ? -1 : a > b ? 0 : 1,
                scores: [a, b],
                detail: `${RONDAS * GOLPES} golpes cada uno`,
                record: ctx.record('puntos', Math.max(a, b), 'high'),
              });
              return;
            }
          }
        }
        fase = 'esperando';
        pausa = 0.9;
      }
    },

    destroy() {
      desuscribir?.();
      touchbar.clear();
    },
  };
}
