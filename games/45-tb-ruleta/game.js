/**
 * Ruleta de Botones — doce botones, una bomba escondida.
 *
 * Se turnan tocando botones. Cada botón seguro que destapas reduce las
 * casillas que quedan, así que la probabilidad sube en cada turno y la tensión
 * también: el que va ganando es el que obliga al otro a tocar cuando ya quedan
 * pocas. Ronda a ronda, a tres victorias.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const BOTONES = 12;
const PARA_GANAR = 3;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let bomba = 0;
  let abiertos = [];           // índices ya destapados
  let turno = 0;
  let fase = 'jugando';        // jugando | explotado
  let pausa = 0;
  const score = [0, 0];
  let ronda = 1;
  let desuscribir = null;

  function nuevaRonda() {
    bomba = Math.floor(Math.random() * BOTONES);
    abiertos = [];
    fase = 'jugando';
    // Alterna quién empieza para que la desventaja de abrir no sea siempre
    // del mismo jugador.
    turno = (ronda - 1) % 2;
    pintar();
    actualizarTexto();
  }

  function pintar() {
    const celdas = [];
    for (let i = 0; i < BOTONES; i++) {
      const abierto = abiertos.includes(i);
      const esBomba = i === bomba;
      if (fase === 'explotado' && esBomba) {
        celdas.push({ label: 'X', bg: '#ff2e2e', color: '#ffffff', clase: 'viva' });
      } else if (abierto) {
        celdas.push({ label: '·', bg: '#0d0d0d', color: '#3a3a3a', clase: 'tenue' });
      } else {
        celdas.push({ label: String(i + 1), bg: '#242424', color: '#f2f2f2' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `b${i}`,
        label: c.label,
        bg: c.bg,
        color: c.color,
        enabled: !abiertos.includes(i) && fase === 'jugando',
      })),
    ]);
  }

  function actualizarTexto() {
    const restantes = BOTONES - abiertos.length;
    const prob = Math.round((1 / restantes) * 100);
    cab.resaltar(turno);
    cab.decir(
      `Ronda ${ronda} · turno de <b style="color:${players[turno].color}">${players[turno].name}</b> ·
       quedan ${restantes} botones · <b>${prob}%</b> de que sea la bomba`
    );
  }

  function tocar(i) {
    if (fase !== 'jugando' || abiertos.includes(i)) return;
    espejo?.destello(i, i === bomba ? '#ff2e2e' : players[turno].color);

    if (i === bomba) {
      fase = 'explotado';
      pausa = 2.2;
      const ganador = 1 - turno;
      score[ganador]++;
      cab.marcar(score[0], score[1]);
      cab.resaltar(ganador);
      cab.decir(`${icon('bomb', { size: 15 })} <b style="color:${players[turno].color}">${players[turno].name}</b> encontró la bomba ·
                 punto para <b style="color:${players[ganador].color}">${players[ganador].name}</b>`);
      audio.explosion();
      haptics.explosion(turno);
      touchbar.haptic('heavy');
      pintar();
      return;
    }

    abiertos.push(i);
    audio.blip();
    haptics.play('soft', { player: turno });
    touchbar.haptic('light');

    // Si solo queda la bomba, el siguiente pierde sí o sí: se resuelve solo.
    if (abiertos.length >= BOTONES - 1) {
      turno = 1 - turno;
      pintar();
      actualizarTexto();
      cab.decir(cab.el.querySelector('.tb-instr').innerHTML + ' · <b>solo queda una…</b>');
      return;
    }

    turno = 1 - turno;
    pintar();
    actualizarTexto();
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Ruleta de Botones', segmentos: BOTONES });
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
      if (!disponible || fase !== 'explotado') return;
      pausa -= dt;
      if (pausa > 0) return;
      const g = score.findIndex((s) => s >= PARA_GANAR);
      if (g >= 0) {
        ctx.finish({
          winner: g, scores: [score[0], score[1]],
          detail: `${ronda} rondas jugadas`,
        });
        return;
      }
      ronda++;
      nuevaRonda();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
