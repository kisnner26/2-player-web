/**
 * Conecta 4 — fichas que caen, cuatro en línea en cualquier dirección.
 *
 * El cursor solo se mueve en horizontal: la ficha siempre cae hasta abajo,
 * así que la única decisión es la columna. Se marca la línea ganadora al
 * terminar para que se vea de un vistazo por dónde se perdió.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const COLS = 7, FILAS = 6;

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  const rejilla = Array.from({ length: FILAS }, () => new Array(COLS).fill(null));
  let tab = null;
  let terminado = false;
  let ganadora = [];          // casillas de la línea ganadora
  let cayendo = null;         // {col, fila, jugador, t} animación de caída

  const primeraLibre = (col) => {
    for (let y = FILAS - 1; y >= 0; y--) if (rejilla[y][col] == null) return y;
    return -1;
  };

  function buscarLinea(x, y, jugador) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dx, dy] of dirs) {
      const linea = [[x, y]];
      for (const signo of [1, -1]) {
        let cx = x + dx * signo, cy = y + dy * signo;
        while (cx >= 0 && cy >= 0 && cx < COLS && cy < FILAS && rejilla[cy][cx] === jugador) {
          linea.push([cx, cy]);
          cx += dx * signo; cy += dy * signo;
        }
      }
      if (linea.length >= 4) return linea;
    }
    return null;
  }

  function pintarCelda(x, y) {
    const v = rejilla[y][x];
    const clases = [];
    let html = '';

    const esGanadora = ganadora.some(([gx, gy]) => gx === x && gy === y);
    if (v != null) {
      html = `<div class="ficha${esGanadora ? ' c4-gana' : ''}" style="background:${players[v].color}"></div>`;
    } else if (!terminado && tab && x === tab.cursor.x && y === primeraLibre(x)) {
      // Fantasma en la posición donde caería la ficha.
      html = `<div class="ficha c4-fantasma" style="background:${players[tab.turno].color}"></div>`;
    }
    if (esGanadora) clases.push('marcada');
    return { html, clases, estilo: 'background:#0d1b3a;' };
  }

  function confirmar(x) {
    if (terminado || cayendo) return;
    const y = primeraLibre(x);
    if (y < 0) { audio.error(); haptics.error(tab.turno); return; }

    rejilla[y][x] = tab.turno;
    audio.place();
    haptics.play('impact', { player: tab.turno, scale: 0.6 + (FILAS - y) * 0.06 });
    tab.refrescar();

    const linea = buscarLinea(x, y, tab.turno);
    if (linea) {
      ganadora = linea;
      return fin(tab.turno);
    }
    if (rejilla.every((f) => f.every((c) => c != null))) return fin(-1);

    tab.cambiarTurno();
    // El cursor se queda en la misma columna: es lo que espera la mano.
    tab.ponerCursor(x, 0);
  }

  function fin(ganador) {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    const fichas = [0, 0];
    for (const f of rejilla) for (const c of f) if (c != null) fichas[c]++;
    setTimeout(() => {
      ctx.finish({
        winner: ganador,
        scores: fichas,
        detail: ganador === -1 ? 'Tablero lleno' : 'Cuatro en línea',
      });
    }, 900);
  }

  return {
    init() {
      inyectarEstilos();
      tab = new Tablero(ctx, {
        cols: COLS, filas: FILAS, celda: 62,
        pintarCelda,
        onConfirmar: (x) => confirmar(x),
        onCursor: () => tab.refrescar(),
      });
      tab.ponerCursor(3, 0);
      tab.pie('Mueve en horizontal y suelta: la ficha cae sola');
    },

    update(dt) {
      if (!tab || tab.bloqueado) return;
      // Solo interesa el eje horizontal; se anula el vertical del cursor.
      const pl = ctx.input.player(tab.turno);
      const antes = tab.cursor.y;
      tab.actualizar(dt);
      if (tab.cursor.y !== antes) { tab.cursor.y = 0; tab.refrescar(); }
    },

    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('c4-css')) return;
  const s = document.createElement('style');
  s.id = 'c4-css';
  s.textContent = `
    .c4-fantasma { opacity:.28; animation:none; }
    .c4-gana { animation: c4-brillo .7s infinite alternate; }
    @keyframes c4-brillo {
      from { box-shadow: inset 0 -3px 6px #0006, 0 0 0 #fff0; }
      to   { box-shadow: inset 0 -3px 6px #0006, 0 0 22px #ffffffcc; }
    }
  `;
  document.head.appendChild(s);
}
