/**
 * Tres en Raya ∞ — la versión Ultimate: nueve tableros anidados.
 *
 * Regla que lo cambia todo: la casilla donde juegas decide en QUÉ tablero
 * pequeño tiene que jugar el rival. Ganar un tablero pequeño te da su casilla
 * en el tablero grande, y gana quien haga tres en raya de tableros.
 * Si te mandan a un tablero ya resuelto, puedes jugar donde quieras.
 */

import { Tablero } from '../../core/boardgame.js';
import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

const MARCA_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>';
const marca = (v) => (v === 0 ? icon('close') : MARCA_O);

export const meta = { render: 'dom', sinCuentaAtras: true };

const LINEAS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  // celdas[bloque][casilla] = null | 0 | 1
  const celdas = Array.from({ length: 9 }, () => new Array(9).fill(null));
  const ganados = new Array(9).fill(null);    // null | 0 | 1 | 'empate'
  let bloqueObligado = -1;                    // -1 = libre
  let tab = null;
  let terminado = false;

  const aBloque = (x, y) => Math.floor(y / 3) * 3 + Math.floor(x / 3);
  const aCasilla = (x, y) => (y % 3) * 3 + (x % 3);

  function ganadorDe(tabla) {
    for (const [a, b, c] of LINEAS) {
      if (tabla[a] != null && tabla[a] === tabla[b] && tabla[b] === tabla[c] && tabla[a] !== 'empate') {
        return tabla[a];
      }
    }
    return null;
  }

  function esLegal(x, y) {
    const b = aBloque(x, y);
    const c = aCasilla(x, y);
    if (ganados[b] != null) return false;
    if (celdas[b][c] != null) return false;
    if (bloqueObligado >= 0 && b !== bloqueObligado) return false;
    return true;
  }

  function pintarCelda(x, y) {
    const b = aBloque(x, y);
    const c = aCasilla(x, y);
    const v = celdas[b][c];
    const clases = [];
    let estilo = '';

    // Bordes gruesos para separar visualmente los nueve tableros.
    const bordes = [];
    if (x % 3 === 0 && x > 0) bordes.push('border-left:3px solid #ffffff30');
    if (y % 3 === 0 && y > 0) bordes.push('border-top:3px solid #ffffff30');
    estilo += bordes.join(';') + ';';

    if (ganados[b] != null) {
      clases.push('ttt-resuelto');
      if (ganados[b] !== 'empate') estilo += `background:${players[ganados[b]].color}22;`;
    } else if (bloqueObligado === b || bloqueObligado === -1) {
      clases.push('ttt-activo');
    } else {
      clases.push('ttt-inactivo');
    }

    let html = '';
    if (v != null) {
      html = `<span class="ttt-marca" style="color:${players[v].color}">${marca(v)}</span>`;
    } else if (esLegal(x, y) && tab && tab.cursor.x === x && tab.cursor.y === y) {
      html = `<span class="ttt-fantasma" style="color:${players[tab.turno].color}">${marca(tab.turno)}</span>`;
    }
    return { html, clases, estilo };
  }

  function textoObligado() {
    if (bloqueObligado < 0) return 'Puedes jugar en <b>cualquier</b> tablero';
    const nombres = ['arriba izq.', 'arriba centro', 'arriba der.',
                     'centro izq.', 'centro', 'centro der.',
                     'abajo izq.', 'abajo centro', 'abajo der.'];
    return `Debes jugar en el tablero <b>${nombres[bloqueObligado]}</b>`;
  }

  function confirmar(x, y, jugador) {
    if (terminado) return;
    if (!esLegal(x, y)) {
      audio.error();
      haptics.error(jugador);
      return;
    }
    const b = aBloque(x, y), c = aCasilla(x, y);
    celdas[b][c] = jugador;
    audio.place();
    haptics.play('impact', { player: jugador, scale: 0.7 });

    // ¿Se resolvió el tablero pequeño?
    const g = ganadorDe(celdas[b]);
    if (g != null) {
      ganados[b] = g;
      audio.capture();
      haptics.play('score', { player: jugador });
    } else if (celdas[b].every((v) => v != null)) {
      ganados[b] = 'empate';
    }

    // ¿Se resolvió el tablero grande?
    const gGrande = ganadorDe(ganados);
    if (gGrande != null) return fin(gGrande);
    if (ganados.every((v) => v != null)) return fin(-1);

    // El siguiente bloque es el que corresponde a la casilla jugada.
    bloqueObligado = ganados[c] != null ? -1 : c;
    tab.cambiarTurno();
    tab.actualizarTurno();
    tab.pie(textoObligado());

    // El cursor salta al bloque obligado para no obligar a recorrer el tablero.
    if (bloqueObligado >= 0) {
      const bx = (bloqueObligado % 3) * 3 + 1;
      const by = Math.floor(bloqueObligado / 3) * 3 + 1;
      tab.ponerCursor(bx, by);
    }
  }

  function fin(ganador) {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    const cuenta = [
      ganados.filter((v) => v === 0).length,
      ganados.filter((v) => v === 1).length,
    ];
    ctx.finish({
      winner: ganador,
      scores: cuenta,
      detail: ganador === -1 ? 'Ningún tres en raya posible' : 'Tres tableros en línea',
    });
  }

  return {
    init() {
      inyectarEstilos();
      tab = new Tablero(ctx, {
        cols: 9, filas: 9, celda: 46,
        pintarCelda,
        onConfirmar: confirmar,
        onCursor: () => tab.refrescar(),
      });
      tab.pie(textoObligado());
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('ttt-css')) return;
  const s = document.createElement('style');
  s.id = 'ttt-css';
  s.textContent = `
    .ttt-inactivo { opacity:.32; }
    .ttt-activo { background:#ffffff12 !important; }
    .ttt-resuelto { opacity:.85; }
    .ttt-marca { font-size:1.05em; animation: pop 200ms var(--ease); }
    .ttt-fantasma { opacity:.32; }
    .ttt-marca svg, .ttt-fantasma svg { width:0.85em; height:0.85em; vertical-align:-0.12em; }
  `;
  document.head.appendChild(s);
}
