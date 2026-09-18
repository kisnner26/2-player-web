/**
 * Gomoku — cinco en raya en un tablero donde no hay empate posible.
 *
 * La regla que lo hace un juego y no un pasatiempo: exactamente cinco. Seis o
 * más en línea NO valen, así que una fila larga que se pasa de rosca es papel
 * mojado y hay que cerrarla justa.
 *
 * El tablero avisa de lo importante: las filas abiertas de tres y de cuatro se
 * marcan solas. No es una ayuda para novatos, es lo que un jugador con ojo ve
 * de un vistazo, y sin ello las partidas se deciden por despiste en vez de por
 * plan.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 15;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let rejilla = [];
  let tab = null, terminado = false, ultima = null;
  let ganadoras = new Set(), amenazas = new Set();

  const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  /** Longitud de la línea que pasa por (x,y) en una dirección. */
  function linea(x, y, dx, dy, jugador) {
    const celdas = [[x, y]];
    for (const s of [1, -1]) {
      let cx = x + dx * s, cy = y + dy * s;
      while (dentro(cx, cy) && rejilla[cy][cx] === jugador) {
        celdas.push([cx, cy]);
        cx += dx * s; cy += dy * s;
      }
    }
    return celdas;
  }

  /** Marca las líneas abiertas de 3 y 4 de los dos jugadores. */
  function calcularAmenazas() {
    amenazas = new Set();
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const j = rejilla[y][x];
        if (j == null) continue;
        for (const [dx, dy] of DIRS) {
          const c = linea(x, y, dx, dy, j);
          if (c.length !== 3 && c.length !== 4) continue;
          // Solo cuenta si tiene hueco por algún extremo para llegar a cinco.
          const orden = c.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
          const [ax, ay] = orden[0];
          const [bx, by] = orden[orden.length - 1];
          const libre = (px, py) => dentro(px, py) && rejilla[py][px] == null;
          if (libre(ax - dx, ay - dy) || libre(bx + dx, by + dy)) {
            for (const [cx, cy] of c) amenazas.add(`${cx},${cy}`);
          }
        }
      }
    }
  }

  function pintar(x, y) {
    const v = rejilla[y][x];
    const clases = [];
    const clave = `${x},${y}`;
    let html = '';
    if (v != null) {
      const brillo = ganadoras.has(clave) ? 'box-shadow:0 0 0 3px #ffd166, 0 0 16px #ffd166;' : '';
      html = `<div class="ficha" style="background:${players[v].color};${brillo}"></div>`;
    } else if (amenazas.has(clave)) {
      html = '';
    }
    if (ultima && ultima.x === x && ultima.y === y) clases.push('marcada');
    // Tablero de go: madera clara y las intersecciones marcadas con puntos.
    const punto = [3, 7, 11].includes(x) && [3, 7, 11].includes(y);
    const fondo = amenazas.has(clave) && v == null ? '#c9a86a' : (punto ? '#c2a068' : '#cdae78');
    return { html, clases, estilo: `background:${fondo};` };
  }

  function confirmar(x, y) {
    if (terminado) return;
    if (rejilla[y][x] != null) { audio.error(); haptics.error(tab.turno); return; }
    const j = tab.turno;
    rejilla[y][x] = j;
    ultima = { x, y };
    audio.place();
    haptics.play('click', { player: j });

    for (const [dx, dy] of DIRS) {
      const c = linea(x, y, dx, dy, j);
      // Exactamente cinco: seis no vale, y esa regla cambia el juego entero.
      if (c.length === 5) {
        ganadoras = new Set(c.map(([cx, cy]) => `${cx},${cy}`));
        terminado = true;
        calcularAmenazas();
        tab.refrescar();
        tab.bloqueado = true;
        audio.win();
        haptics.victory(j);
        ctx.finish({ winner: j, detail: 'Cinco en raya, ni una más' });
        return;
      }
    }

    if (rejilla.every((f) => f.every((c) => c != null))) {
      terminado = true;
      ctx.finish({ winner: -1, detail: 'Tablero lleno' });
      return;
    }

    calcularAmenazas();
    tab.cambiarTurno();
    const n = [...amenazas].length;
    tab.pie(n ? `Hay <b>líneas peligrosas</b> marcadas en el tablero` : 'Coloca tu ficha en cualquier intersección');
  }

  return {
    init() {
      rejilla = Array.from({ length: N }, () => new Array(N).fill(null));
      tab = new Tablero(ctx, {
        cols: N, filas: N, celda: 34,
        pintarCelda: pintar,
        onConfirmar: confirmar,
      });
      tab.pie('Cinco EXACTOS en línea · seis no valen');
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
