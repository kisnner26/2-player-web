/**
 * Hex — une tus dos lados antes de que el otro una los suyos.
 *
 * El juego más limpio que existe: se coloca una ficha y ya está. No hay
 * capturas, ni empates, ni azar — está demostrado que en un tablero lleno hay
 * siempre exactamente un camino ganador, así que el empate es imposible por
 * matemáticas, no por regla.
 *
 * El rombo se dibuja inclinado porque las casillas de un Hex son hexágonos con
 * seis vecinos: los cuatro de siempre más las dos diagonales que unen esquinas
 * opuestas. Bloquear al rival y avanzar tú son literalmente la misma jugada.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 11;
// Vecindad hexagonal sobre un rombo: las dos diagonales "buenas" del rombo.
const VECINOS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let rejilla = [];
  let tab = null, terminado = false, camino = new Set(), ultima = null;

  const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  /**
   * ¿Este jugador conecta sus dos lados?
   * P1 (0) une izquierda con derecha; P2 (1) une arriba con abajo.
   */
  function conecta(j) {
    const cola = [];
    const vistos = new Set();
    for (let k = 0; k < N; k++) {
      const p = j === 0 ? { x: 0, y: k } : { x: k, y: 0 };
      if (rejilla[p.y][p.x] === j) { cola.push(p); vistos.add(`${p.x},${p.y}`); }
    }
    const padres = new Map();
    while (cola.length) {
      const p = cola.shift();
      const final = j === 0 ? p.x === N - 1 : p.y === N - 1;
      if (final) {
        // Se reconstruye el camino para poder enseñarlo al terminar.
        const ruta = new Set();
        let k = `${p.x},${p.y}`;
        while (k) { ruta.add(k); k = padres.get(k); }
        return ruta;
      }
      for (const [dx, dy] of VECINOS) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!dentro(nx, ny) || rejilla[ny][nx] !== j) continue;
        const k = `${nx},${ny}`;
        if (vistos.has(k)) continue;
        vistos.add(k);
        padres.set(k, `${p.x},${p.y}`);
        cola.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  function pintar(x, y) {
    const v = rejilla[y][x];
    const clave = `${x},${y}`;
    const enCamino = camino.has(clave);
    let html = '';
    if (v != null) {
      const brillo = enCamino ? 'box-shadow:0 0 0 3px #ffd166,0 0 18px #ffd166;' : '';
      html = `<div class="ficha" style="background:${players[v].color};${brillo}"></div>`;
    }
    const clases = [];
    if (ultima && ultima.x === x && ultima.y === y) clases.push('marcada');
    // Los bordes se tiñen con el color de quien tiene que llegar a ellos.
    let fondo = '#1b1b2c';
    if (x === 0 || x === N - 1) fondo = `${players[0].color}33`;
    if (y === 0 || y === N - 1) fondo = `${players[1].color}33`;
    if ((x === 0 || x === N - 1) && (y === 0 || y === N - 1)) fondo = '#2a2a40';
    // Contraskew: el tablero entero va inclinado y las casillas se enderezan.
    return { html, clases, estilo: `background:${fondo};transform:skewX(20deg);` };
  }

  function confirmar(x, y) {
    if (terminado) return;
    if (rejilla[y][x] != null) { audio.error(); haptics.error(tab.turno); return; }
    const j = tab.turno;
    rejilla[y][x] = j;
    ultima = { x, y };
    audio.place();
    haptics.play('click', { player: j });

    const ruta = conecta(j);
    if (ruta) {
      camino = ruta;
      terminado = true;
      tab.refrescar();
      tab.bloqueado = true;
      audio.win();
      haptics.victory(j);
      ctx.finish({ winner: j, detail: `${ruta.size} fichas en el camino ganador` });
      return;
    }

    tab.cambiarTurno();
    tab.pie(`<b style="color:${players[0].color}">${players[0].name}</b> une izquierda y derecha · ` +
            `<b style="color:${players[1].color}">${players[1].name}</b> une arriba y abajo`);
  }

  return {
    init() {
      rejilla = Array.from({ length: N }, () => new Array(N).fill(null));
      tab = new Tablero(ctx, {
        cols: N, filas: N, celda: 40,
        pintarCelda: pintar,
        onConfirmar: confirmar,
      });
      // El rombo: se inclina el tablero y cada casilla se contrainclina.
      tab.elTablero.style.transform = 'skewX(-20deg)';
      tab.elTablero.style.margin = '0 40px';
      tab.pie(`<b style="color:${players[0].color}">${players[0].name}</b> une izquierda y derecha · ` +
              `<b style="color:${players[1].color}">${players[1].name}</b> une arriba y abajo`);
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
