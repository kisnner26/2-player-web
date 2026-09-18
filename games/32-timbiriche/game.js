/**
 * Timbiriche — une puntos y cierra cajitas.
 *
 * El tablero de puntos se representa como una rejilla impar: las posiciones
 * pares son los puntos, las intermedias son las líneas y los centros son las
 * cajas. Así todo cabe en un único Tablero y el cursor navega de forma natural
 * entre puntos y líneas.
 */

import { Tablero } from '../../core/boardgame.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const MARCA_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';

const PUNTOS_X = 6, PUNTOS_Y = 5;

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  // h[y][x]: línea horizontal entre el punto (x,y) y (x+1,y)
  // v[y][x]: línea vertical entre (x,y) y (x,y+1)
  let h = [], v = [], cajas = [];
  let tab = null;
  const score = [0, 0];
  let terminado = false;

  const cols = PUNTOS_X * 2 - 1;
  const filas = PUNTOS_Y * 2 - 1;

  function inicial() {
    h = Array.from({ length: PUNTOS_Y }, () => new Array(PUNTOS_X - 1).fill(false));
    v = Array.from({ length: PUNTOS_Y - 1 }, () => new Array(PUNTOS_X).fill(false));
    cajas = Array.from({ length: PUNTOS_Y - 1 }, () => new Array(PUNTOS_X - 1).fill(null));
  }

  /** Traduce coordenadas de la rejilla a qué elemento representan. */
  function queEs(gx, gy) {
    const parX = gx % 2 === 0, parY = gy % 2 === 0;
    if (parX && parY) return { tipo: 'punto', x: gx / 2, y: gy / 2 };
    if (!parX && parY) return { tipo: 'h', x: (gx - 1) / 2, y: gy / 2 };
    if (parX && !parY) return { tipo: 'v', x: gx / 2, y: (gy - 1) / 2 };
    return { tipo: 'caja', x: (gx - 1) / 2, y: (gy - 1) / 2 };
  }

  function pintarCelda(gx, gy) {
    const e = queEs(gx, gy);
    const clases = ['tb-' + e.tipo];
    let html = '';
    let estilo = 'background:transparent;';

    if (e.tipo === 'punto') {
      html = '<div class="tb-punto"></div>';
    } else if (e.tipo === 'h') {
      const puesta = h[e.y][e.x];
      html = `<div class="tb-linea tb-lh${puesta ? ' puesta' : ''}"></div>`;
    } else if (e.tipo === 'v') {
      const puesta = v[e.y][e.x];
      html = `<div class="tb-linea tb-lv${puesta ? ' puesta' : ''}"></div>`;
    } else {
      const due = cajas[e.y][e.x];
      if (due != null) {
        html = `<div class="tb-caja" style="background:${players[due].color}22;color:${players[due].color}">
                  <span class="tb-marca">${due === 0 ? icon('close') : MARCA_O}</span></div>`;
      }
    }
    return { html, clases, estilo };
  }

  function confirmar(gx, gy) {
    if (terminado) return;
    const e = queEs(gx, gy);
    if (e.tipo === 'punto' || e.tipo === 'caja') {
      audio.error();
      haptics.error(tab.turno);
      return;
    }
    const tabla = e.tipo === 'h' ? h : v;
    if (tabla[e.y][e.x]) { audio.error(); haptics.error(tab.turno); return; }

    tabla[e.y][e.x] = true;
    audio.place();
    haptics.play('click', { player: tab.turno });

    const cerradas = cerrarCajas(tab.turno);
    tab.refrescar();

    if (cerradas > 0) {
      // Cerrar caja da turno extra: es el motor táctico del juego.
      score[tab.turno] += cerradas;
      audio.capture();
      haptics.play('score', { player: tab.turno });
      tab.pie(`<b>${players[tab.turno].name}</b> cierra ${cerradas} caja${cerradas > 1 ? 's' : ''} · repite turno`);
      tab.actualizarTurno();
      if (cajas.every((f) => f.every((c) => c != null))) return fin();
      return;
    }

    if (cajas.every((f) => f.every((c) => c != null))) return fin();
    tab.cambiarTurno();
    actualizarPie();
  }

  function cerrarCajas(jugador) {
    let n = 0;
    for (let y = 0; y < PUNTOS_Y - 1; y++) {
      for (let x = 0; x < PUNTOS_X - 1; x++) {
        if (cajas[y][x] != null) continue;
        if (h[y][x] && h[y + 1][x] && v[y][x] && v[y][x + 1]) {
          cajas[y][x] = jugador;
          n++;
        }
      }
    }
    return n;
  }

  function actualizarPie() {
    const total = (PUNTOS_X - 1) * (PUNTOS_Y - 1);
    const hechas = score[0] + score[1];
    tab.pie(`Cajas: <b>${score[0]}</b> — <b>${score[1]}</b> · quedan ${total - hechas}`);
  }

  function fin() {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    ctx.finish({
      winner: score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1,
      scores: [score[0], score[1]],
      detail: `${(PUNTOS_X - 1) * (PUNTOS_Y - 1)} cajas en juego`,
    });
  }

  return {
    init() {
      inyectarEstilos();
      inicial();
      tab = new Tablero(ctx, {
        cols, filas, celda: 46,
        pintarCelda,
        onConfirmar: confirmar,
        onCursor: () => tab.refrescar(),
      });
      tab.ponerCursor(1, 0);
      actualizarPie();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('tb-css')) return;
  const s = document.createElement('style');
  s.id = 'tb-css';
  s.textContent = `
    .bg-celda.tb-punto, .bg-celda.tb-h, .bg-celda.tb-v, .bg-celda.tb-caja { background:transparent !important; }
    .bg-celda.tb-punto:hover, .bg-celda.tb-caja:hover { background:transparent !important; cursor:default; }
    .tb-punto { width:9px; height:9px; border-radius:50%; background:var(--ink-dim); }
    .tb-linea { background:#ffffff16; border-radius:3px; transition:background 160ms, box-shadow 160ms; }
    .tb-lh { width:88%; height:6px; }
    .tb-lv { width:6px; height:88%; }
    .tb-linea.puesta { background:var(--ink); box-shadow:0 0 10px -2px var(--ink); }
    .tb-caja { width:100%; height:100%; display:grid; place-items:center; border-radius:4px; animation:pop 260ms var(--ease); }
    .tb-marca svg { width:14px; height:14px; }
  `;
  document.head.appendChild(s);
}
