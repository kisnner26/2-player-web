/**
 * Pesca en la Barra — el pez pasa por debajo y el anzuelo está quieto.
 *
 * El pez cruza la barra a su ritmo y de vez en cuando cambia de idea. Solo
 * pica si tiras del sedal en el instante en que está bajo el anzuelo, y el
 * anzuelo se coloca antes tocando la celda: una vez colocado no se mueve.
 *
 * Cada pez es más pequeño y más rápido que el anterior. Los últimos ocupan una
 * sola celda y cruzan la barra en menos de un segundo, así que se pescan de
 * intuición, no de vista.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 20;
const PECES = 6;

export function create(ctx) {
  const { touchbar, audio, haptics, players, rng } = ctx;

  let cab = null, espejo = null, disponible = false, desuscribir = null;
  let anzuelo = 10, pez = 0, dir = 1, vel = 5, largo = 3;
  let turno = 0, pescado = 0, fase = 'colocando', pausa = 0, cambio = 0;
  const score = [0, 0];

  function nuevoPez() {
    largo = Math.max(1, 4 - Math.floor(pescado / 2));
    vel = 4.5 + pescado * 2.1;
    pez = rng() < 0.5 ? -largo : CELDAS;
    dir = pez < 0 ? 1 : -1;
    cambio = 0.7 + rng() * 1.2;
    fase = 'colocando';
    cab.resaltar(turno);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · pez ${pescado + 1}/${PECES} · toca dónde pones el anzuelo`);
    pintar();
  }

  const ocupa = (i) => i >= Math.floor(pez) && i < Math.floor(pez) + largo;

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (fase !== 'colocando' && ocupa(i)) {
        const cabezaPez = dir > 0 ? i === Math.floor(pez) + largo - 1 : i === Math.floor(pez);
        celdas.push({ label: cabezaPez ? (dir > 0 ? '►' : '◄') : '', bg: '#3aa0ff', color: '#04101c' });
      } else if (i === anzuelo) {
        celdas.push({ label: fase === 'colocando' ? '?' : 'J', bg: '#ffd166', color: '#000000', clase: 'viva' });
      } else {
        // Agua con un leve oleaje para que la barra no parezca apagada.
        celdas.push({ label: '', bg: i % 2 ? '#0a1420' : '#0d1a28', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `a${i}`, label: c.label || ' ', bg: c.bg, color: c.color || '#000000',
      })),
    ]);
  }

  function tirar() {
    if (fase !== 'nadando') return;
    const pica = ocupa(anzuelo);
    fase = 'resultado';
    pausa = 1.6;
    if (pica) {
      const puntos = 40 + (4 - largo) * 25 + Math.round(vel * 3);
      score[turno] += puntos;
      cab.decir(`¡Pica! pez de ${largo} celdas · +${puntos}`);
      audio.win();
      haptics.victory(turno);
      touchbar.haptic('heavy');
      espejo?.destello(anzuelo, '#a8ff3e');
    } else {
      const fallo = Math.abs(anzuelo - (pez + largo / 2));
      cab.decir(`Se escapa por ${fallo.toFixed(1)} celdas`);
      audio.error();
      haptics.error(turno);
      touchbar.haptic('medium');
      espejo?.destello(anzuelo, '#ff2e2e');
    }
    cab.marcar(score[0], score[1]);
    pintar();
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Pesca', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || ev.id === '_turno') return;
        if (fase === 'colocando') {
          const m = /^a(\d+)$/.exec(ev.id);
          if (!m) return;
          anzuelo = +m[1];
          fase = 'nadando';
          audio.blip();
          touchbar.haptic('light');
          cab.decir(`Anzuelo puesto · toca la barra cuando el pez esté debajo`);
          pintar();
        } else if (fase === 'nadando') tirar();
      });
      nuevoPez();
    },

    update(dt) {
      if (!disponible) return;

      if (fase === 'resultado') {
        pausa -= dt;
        if (pausa > 0) return;
        if (turno === 0) { turno = 1; nuevoPez(); return; }
        turno = 0;
        pescado++;
        if (pescado >= PECES) {
          const [a, b] = score;
          ctx.finish({
            winner: a === b ? -1 : a > b ? 0 : 1,
            scores: [a, b],
            detail: `${PECES} peces cada uno`,
            record: ctx.record('puntos', Math.max(a, b), 'high'),
          });
          return;
        }
        nuevoPez();
        return;
      }

      if (fase !== 'nadando') return;
      // El pez se lo piensa: cambia de sentido a media travesía.
      cambio -= dt;
      if (cambio <= 0) {
        dir = -dir;
        cambio = 0.6 + rng() * 1.4;
      }
      pez += dir * vel * dt;
      if (pez < -largo - 2 || pez > CELDAS + 2) {
        dir = -dir;
        pez = Math.max(-largo, Math.min(CELDAS, pez));
      }
      pintar();
    },

    destroy() {
      desuscribir?.();
      touchbar.clear();
    },
  };
}
