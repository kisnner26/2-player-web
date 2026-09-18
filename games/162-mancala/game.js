/**
 * Mancala — siembra las semillas y mira dónde cae la última.
 *
 * Reglas de kalah completas, que son las que hacen que esto no sea azar: si tu
 * última semilla cae en tu granero, repites turno (y las cadenas de tres o
 * cuatro turnos seguidos son lo mejor del juego); si cae en un hoyo vacío de tu
 * lado, capturas esa semilla y todas las de enfrente.
 *
 * Al vaciarse un lado, el otro se lleva lo que le quede en la fila. Por eso
 * quedarse sin semillas no siempre es malo: a veces es justo el remate.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const HOYOS = 6;
const SEMILLAS = 4;

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  // Tablero lineal de 14: 0-5 hoyos de P1, 6 granero de P1, 7-12 de P2, 13 granero de P2.
  let campo = [];
  let tab = null, terminado = false, ultimoHoyo = -1, capturado = new Set();

  const granero = (j) => (j === 0 ? 6 : 13);
  const esMio = (j, i) => (j === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
  const opuesto = (i) => 12 - i;

  /** La rejilla es 6×2: arriba los hoyos de P2 (al revés) y abajo los de P1. */
  function indiceDe(x, y) {
    return y === 0 ? 12 - x : x;
  }

  function pintar(x, y) {
    const i = indiceDe(x, y);
    const n = campo[i];
    const dueño = y === 1 ? 0 : 1;
    const col = players[dueño].color;
    const activo = esMio(tab?.turno ?? 0, i) && n > 0;
    const clases = [];
    if (ultimoHoyo === i) clases.push('marcada');
    const semillas = Array.from({ length: Math.min(n, 12) }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      const r = n > 4 ? 26 : 16;
      return `<i style="left:${50 + Math.cos(a) * r}%;top:${50 + Math.sin(a) * r}%;background:${col}"></i>`;
    }).join('');
    const html = `<div class="hoyo">${semillas}<b>${n}</b></div>`;
    const fondo = capturado.has(i) ? '#5a2030' : (activo ? '#3a2c1e' : '#2a2016');
    return { html, clases, estilo: `background:${fondo};border-radius:50%;` };
  }

  function refrescarPie() {
    tab.pie(`Granero de <b style="color:${players[0].color}">${players[0].name}</b>: ${campo[6]} · ` +
            `<b style="color:${players[1].color}">${players[1].name}</b>: ${campo[13]}`);
  }

  function confirmar(x, y) {
    if (terminado) return;
    const j = tab.turno;
    const i = indiceDe(x, y);
    if (!esMio(j, i) || campo[i] === 0) { audio.error(); haptics.error(j); return; }

    let mano = campo[i];
    campo[i] = 0;
    let pos = i;
    capturado = new Set();

    while (mano > 0) {
      pos = (pos + 1) % 14;
      if (pos === granero(1 - j)) continue;    // el granero rival se salta
      campo[pos]++;
      mano--;
      audio.tone({ freq: 420 + mano * 12, dur: 0.03, gain: 0.09, type: 'triangle' });
    }
    ultimoHoyo = pos;
    haptics.play('click', { player: j });

    let repite = false;
    if (pos === granero(j)) {
      repite = true;
      audio.pickup();
    } else if (esMio(j, pos) && campo[pos] === 1 && campo[opuesto(pos)] > 0) {
      // Captura: la última semilla en hoyo vacío propio se lleva las de enfrente.
      const botin = campo[opuesto(pos)] + 1;
      capturado = new Set([pos, opuesto(pos)]);
      campo[granero(j)] += botin;
      campo[pos] = 0;
      campo[opuesto(pos)] = 0;
      audio.capture();
      haptics.score(j);
    }

    const vacio0 = campo.slice(0, 6).every((v) => v === 0);
    const vacio1 = campo.slice(7, 13).every((v) => v === 0);
    if (vacio0 || vacio1) {
      // Se acabó: cada uno recoge lo que quede en su fila.
      for (let k = 0; k < 6; k++) { campo[6] += campo[k]; campo[k] = 0; }
      for (let k = 7; k < 13; k++) { campo[13] += campo[k]; campo[k] = 0; }
      tab.refrescar();
      refrescarPie();
      terminado = true;
      tab.bloqueado = true;
      const g = campo[6] === campo[13] ? -1 : (campo[6] > campo[13] ? 0 : 1);
      audio.win();
      ctx.finish({ winner: g, scores: [campo[6], campo[13]], detail: 'Se vació un lado del tablero' });
      return;
    }

    if (repite) {
      tab.actualizarTurno('¡otra vez!');
      tab.refrescar();
    } else {
      tab.cambiarTurno();
    }
    refrescarPie();
  }

  return {
    init() {
      campo = new Array(14).fill(SEMILLAS);
      campo[6] = 0;
      campo[13] = 0;
      tab = new Tablero(ctx, {
        cols: HOYOS, filas: 2, celda: 84,
        pintarCelda: pintar,
        onConfirmar: confirmar,
      });
      // Los hoyos necesitan un poco de estilo propio: semillas repartidas.
      if (!document.getElementById('mancala-css')) {
        const s = document.createElement('style');
        s.id = 'mancala-css';
        s.textContent = `
          .hoyo { position:relative; width:100%; height:100%; display:grid; place-items:center; }
          .hoyo i { position:absolute; width:14%; height:14%; border-radius:50%;
                    transform:translate(-50%,-50%); box-shadow:0 1px 3px #0009; }
          .hoyo b { font-size:15px; color:#fff; text-shadow:0 2px 4px #000; z-index:2; }
        `;
        document.head.appendChild(s);
      }
      refrescarPie();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
