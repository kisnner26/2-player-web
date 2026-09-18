/**
 * Invasores 1D — bajan por la barra y solo hay un cañón.
 *
 * Los bichos aparecen en los extremos y avanzan hacia el centro, que es tu
 * base. Disparar es tocar la celda donde está el bicho, y el disparo tarda un
 * pelo en salir: al que va rápido hay que adelantarle el dedo.
 *
 * Cada oleada añade uno más y los acelera. Se aguanta hasta que tres llegan al
 * centro, y ahí acaba tu turno. El otro intenta aguantar más oleadas que tú.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 20;
const CENTRO = CELDAS / 2;
const VIDAS = 3;

export function create(ctx) {
  const { touchbar, audio, haptics, players, rng } = ctx;

  let cab = null, espejo = null, disponible = false, desuscribir = null;
  let bichos = [], disparos = [], oleada = 1, vidas = VIDAS;
  let turno = 0, fase = 'jugando', pausa = 0, aparecer = 0;
  const mejor = [0, 0];

  function nuevaPartida() {
    bichos = [];
    disparos = [];
    oleada = 1;
    vidas = VIDAS;
    aparecer = 0.6;
    fase = 'jugando';
    cab.resaltar(turno);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · toca encima del bicho para dispararle`);
    pintar();
  }

  function soltarBicho() {
    const izq = rng() < 0.5;
    bichos.push({
      x: izq ? -0.5 : CELDAS - 0.5,
      dir: izq ? 1 : -1,
      vel: 1.5 + oleada * 0.42 + rng() * 0.5,
      vivo: true,
    });
  }

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const bicho = bichos.find((b) => b.vivo && Math.round(b.x) === i);
      const disparo = disparos.find((d) => Math.round(d.x) === i);
      if (i === CENTRO - 1 || i === CENTRO) {
        celdas.push({ label: '▲', bg: players[turno].color, color: '#000000' });
      } else if (bicho) {
        celdas.push({ label: '☠', bg: '#a8ff3e', color: '#08120a', clase: 'viva' });
      } else if (disparo) {
        celdas.push({ label: '|', bg: '#ffd166', color: '#000000' });
      } else {
        celdas.push({ label: '', bg: '#0a0a12', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `i${i}`, label: c.label || ' ', bg: c.bg, color: c.color || '#000000',
      })),
    ]);
  }

  function disparar(i) {
    if (fase !== 'jugando') return;
    // El disparo tarda: hay que adelantarse al bicho.
    disparos.push({ x: i, vida: 0.16 });
    audio.tone({ freq: 900, dur: 0.05, gain: 0.1, type: 'sawtooth', sweep: -400 });
    touchbar.haptic('light');
  }

  function perderVida() {
    vidas--;
    audio.error();
    haptics.error(turno);
    touchbar.haptic('heavy');
    espejo?.destello(CENTRO, '#ff2e2e');
    if (vidas <= 0) {
      fase = 'muerto';
      pausa = 1.9;
      mejor[turno] = Math.max(mejor[turno], oleada);
      cab.marcar(mejor[0], mejor[1]);
      cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · cae en la oleada ${oleada}`);
      audio.lose();
      haptics.defeat(turno);
    }
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Invasores', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || ev.id === '_turno') return;
        const m = /^i(\d+)$/.exec(ev.id);
        if (m) disparar(+m[1]);
      });
      nuevaPartida();
    },

    update(dt) {
      if (!disponible) return;

      if (fase === 'muerto') {
        pausa -= dt;
        if (pausa > 0) return;
        if (turno === 0) { turno = 1; nuevaPartida(); return; }
        const [a, b] = mejor;
        ctx.finish({
          winner: a === b ? -1 : a > b ? 0 : 1,
          scores: [a, b],
          detail: `oleadas aguantadas: ${a} y ${b}`,
          record: ctx.record('oleadas', Math.max(a, b), 'high'),
        });
        return;
      }

      aparecer -= dt;
      if (aparecer <= 0 && bichos.filter((b) => b.vivo).length < oleada + 1) {
        soltarBicho();
        aparecer = Math.max(0.35, 1.4 - oleada * 0.09);
      }

      for (const b of bichos) {
        if (!b.vivo) continue;
        b.x += b.dir * b.vel * dt;
        if (b.dir > 0 ? b.x >= CENTRO - 1 : b.x <= CENTRO) {
          b.vivo = false;
          perderVida();
          if (fase === 'muerto') { pintar(); return; }
        }
      }

      for (let i = disparos.length - 1; i >= 0; i--) {
        const d = disparos[i];
        d.vida -= dt;
        const tocado = bichos.find((b) => b.vivo && Math.abs(b.x - d.x) < 0.7);
        if (tocado) {
          tocado.vivo = false;
          disparos.splice(i, 1);
          audio.pickup();
          haptics.tick(turno);
          espejo?.destello(Math.round(d.x), '#a8ff3e');
          continue;
        }
        if (d.vida <= 0) disparos.splice(i, 1);
      }

      // Oleada superada cuando no queda ninguno vivo y ya han salido todos.
      if (!bichos.filter((b) => b.vivo).length && bichos.length >= oleada + 1) {
        oleada++;
        bichos = [];
        aparecer = 0.7;
        audio.win();
        haptics.score(turno);
        cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · oleada ${oleada} · vidas ${'♥'.repeat(vidas)}`);
      }

      pintar();
    },

    destroy() {
      desuscribir?.();
      touchbar.clear();
    },
  };
}
