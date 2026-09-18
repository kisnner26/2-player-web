/**
 * Cuerda Táctil — tira de la cuerda tocando repetidamente tu extremo.
 *
 * El nudo se representa como la celda iluminada de la barra: se ve moverse
 * físicamente de un extremo al otro bajo tus dedos, que es exactamente lo que
 * un tira y afloja debería sentirse.
 *
 * Cada toque solo cuenta si cae en TU mitad, así que invadir el lado del rival
 * no sirve de nada y las dos manos se quedan en su sitio.
 */

import { prepararPantalla } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 16;
const EMPUJE = 0.055;
const DECAE = 2.4;
const RONDAS = 3;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let pos = 0;                 // -1 gana P1, +1 gana P2
  const impulso = [0, 0];
  const toques = [0, 0];
  const score = [0, 0];
  let ronda = 1;
  let bloqueado = false;
  let pausa = 0;
  let desuscribir = null;

  const mitadDe = (i) => (i < CELDAS / 2 ? 0 : 1);
  const celdaNudo = () => Math.max(0, Math.min(CELDAS - 1,
    Math.round(((pos + 1) / 2) * (CELDAS - 1))));

  function pintar() {
    const nudo = celdaNudo();
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (i === nudo) {
        celdas.push({ label: '◆', bg: '#ffd166', color: '#000000', clase: 'viva' });
      } else if (i < nudo) {
        celdas.push({ label: '', bg: players[0].color + (disponible ? '' : '55') });
      } else {
        celdas.push({ label: '', bg: players[1].color });
      }
    }
    espejo?.pintar(celdas.map((c, i) => ({
      ...c,
      bg: i === nudo ? '#ffd166' : i < nudo ? players[0].color : players[1].color,
    })));
    if (!disponible) return;
    touchbar.set(celdas.map((c, i) => ({
      type: 'button', id: `c${i}`,
      label: i === nudo ? '◆' : ' ',
      bg: i === nudo ? '#ffd166' : i < nudo ? players[0].color : players[1].color,
      color: '#000000',
    })));
  }

  function tocar(i) {
    if (bloqueado) return;
    const quien = mitadDe(i);
    impulso[quien] += EMPUJE;
    toques[quien]++;
    espejo?.destello(i, '#ffffff');
    audio.tone({ freq: 170 + quien * 70, dur: 0.035, gain: 0.11, type: 'square' });
    haptics.play('tap', { player: quien });
    touchbar.haptic('light');
  }

  function nuevaRonda() {
    pos = 0;
    impulso[0] = impulso[1] = 0;
    toques[0] = toques[1] = 0;
    bloqueado = false;
    cab.decir(`Ronda ${ronda} de ${RONDAS} · toca rápido en <b>tu mitad</b> de la barra`);
    pintar();
  }

  function ganaRonda(quien) {
    bloqueado = true;
    pausa = 1.6;
    score[quien]++;
    cab.marcar(score[0], score[1]);
    cab.resaltar(quien);
    cab.decir(`<b style="color:${players[quien].color}">${players[quien].name}</b> gana la ronda ·
               ${toques[quien]} toques`);
    audio.score(quien);
    haptics.score(quien);
    touchbar.haptic('heavy');
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Cuerda Táctil', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      nuevaRonda();
    },

    update(dt) {
      if (!disponible) return;
      if (bloqueado) {
        pausa -= dt;
        if (pausa <= 0) {
          const g = score.findIndex((s) => s >= Math.ceil(RONDAS / 2));
          if (g >= 0) {
            ctx.finish({
              winner: g, scores: [score[0], score[1]],
              detail: `${toques[0]} vs ${toques[1]} toques en la última ronda`,
            });
          } else { ronda++; nuevaRonda(); }
        }
        return;
      }

      for (let i = 0; i < 2; i++) impulso[i] = Math.max(0, impulso[i] - DECAE * impulso[i] * dt);
      pos += (impulso[1] - impulso[0]) * dt * 24;
      pos *= Math.pow(0.88, dt);      // la cuerda tiende a volver al centro
      pos = Math.max(-1.05, Math.min(1.05, pos));

      if (pos <= -1) return ganaRonda(0);
      if (pos >= 1) return ganaRonda(1);
      pintar();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
