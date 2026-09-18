/**
 * Damas Chinas — lleva tus diez fichas a la esquina de enfrente.
 *
 * No hay capturas ni se pierde nada: es una mudanza. Se avanza un paso, o se
 * SALTA por encima de cualquier ficha —tuya o suya— y los saltos se encadenan.
 * Una cadena bien montada cruza medio tablero en un solo turno.
 *
 * Ahí está lo bonito: las fichas del rival son escalones. Le construyes el
 * camino sin querer, y dejar una ficha rezagada para no dar escalón cuesta
 * la partida por otro lado. Cada movimiento ayuda a alguien.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 8;
/** Triángulo de salida: diez casillas en cada esquina opuesta. */
const CASA = [
  [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [0, 3]],
  [[7, 7], [6, 7], [5, 7], [4, 7], [7, 6], [6, 6], [5, 6], [7, 5], [6, 5], [7, 4]],
];

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let rejilla = [];
  let tab = null, terminado = false;
  let elegida = null, destinos = [], saltando = false, movimientos = [0, 0];

  const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  /** Destinos de una ficha: pasos sueltos y cadenas de salto. */
  function calcular(x, y, soloSaltos) {
    const salida = [];
    const vistos = new Set([`${x},${y}`]);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        if (!soloSaltos) {
          const px = x + dx, py = y + dy;
          if (dentro(px, py) && rejilla[py][px] == null) salida.push({ x: px, y: py, salto: false });
        }
        const sx = x + dx * 2, sy = y + dy * 2;
        if (dentro(sx, sy) && rejilla[y + dy][x + dx] != null && rejilla[sy][sx] == null) {
          salida.push({ x: sx, y: sy, salto: true });
          vistos.add(`${sx},${sy}`);
        }
      }
    }
    return salida;
  }

  function enCasa(j) {
    return CASA[1 - j].every(([x, y]) => rejilla[y][x] === j);
  }

  function pintar(x, y) {
    const v = rejilla[y][x];
    let html = '';
    if (v != null) html = `<div class="ficha" style="background:${players[v].color}"></div>`;
    const clases = [];
    if (elegida && elegida.x === x && elegida.y === y) clases.push('marcada');
    if (destinos.some((d) => d.x === x && d.y === y)) clases.push('legal');
    // Las dos casas se tiñen: hay que ver a dónde va cada uno.
    let fondo = (x + y) % 2 ? '#26202f' : '#1d1826';
    if (CASA[0].some(([cx, cy]) => cx === x && cy === y)) fondo = `${players[0].color}26`;
    if (CASA[1].some(([cx, cy]) => cx === x && cy === y)) fondo = `${players[1].color}26`;
    return { html, clases, estilo: `background:${fondo};` };
  }

  function terminarTurno() {
    elegida = null;
    destinos = [];
    saltando = false;
    const j = tab.turno;
    if (enCasa(j)) {
      terminado = true;
      tab.bloqueado = true;
      tab.refrescar();
      audio.win();
      haptics.victory(j);
      ctx.finish({
        winner: j, scores: movimientos,
        detail: `en ${movimientos[j]} movimientos`,
        record: ctx.record('movimientos', movimientos[j], 'low'),
      });
      return;
    }
    tab.cambiarTurno();
    pie();
  }

  function confirmar(x, y) {
    if (terminado) return;
    const j = tab.turno;

    if (elegida && elegida.x === x && elegida.y === y && saltando) {
      // Confirmar sobre la propia ficha corta la cadena de saltos.
      movimientos[j]++;
      terminarTurno();
      return;
    }

    if (!elegida) {
      if (rejilla[y][x] !== j) { audio.error(); haptics.error(j); return; }
      elegida = { x, y };
      destinos = calcular(x, y, false);
      saltando = false;
      audio.blip();
      tab.refrescar();
      pie();
      return;
    }

    const d = destinos.find((m) => m.x === x && m.y === y);
    if (!d) {
      if (rejilla[y][x] === j && !saltando) {
        elegida = { x, y };
        destinos = calcular(x, y, false);
        audio.blip();
        tab.refrescar();
        pie();
        return;
      }
      audio.error();
      haptics.error(j);
      return;
    }

    rejilla[elegida.y][elegida.x] = null;
    rejilla[y][x] = j;
    audio.place();
    haptics.play('click', { player: j });

    if (d.salto) {
      // Cadena: si desde aquí se puede volver a saltar, el turno sigue.
      const siguientes = calcular(x, y, true);
      if (siguientes.length) {
        elegida = { x, y };
        destinos = siguientes;
        saltando = true;
        tab.ponerCursor(x, y);
        tab.refrescar();
        pie();
        return;
      }
    }
    movimientos[j]++;
    terminarTurno();
  }

  function pie() {
    const j = tab.turno;
    const faltan = CASA[1 - j].filter(([x, y]) => rejilla[y][x] !== j).length;
    tab.pie(
      saltando
        ? 'Puedes encadenar otro salto, o confirmar sobre tu ficha para parar'
        : elegida ? 'Elige a dónde va' : `Te faltan <b>${faltan}</b> casillas por ocupar en la casa de enfrente`,
    );
  }

  return {
    init() {
      rejilla = Array.from({ length: N }, () => new Array(N).fill(null));
      CASA[0].forEach(([x, y]) => { rejilla[y][x] = 0; });
      CASA[1].forEach(([x, y]) => { rejilla[y][x] = 1; });
      movimientos = [0, 0];
      tab = new Tablero(ctx, {
        cols: N, filas: N, celda: 56,
        pintarCelda: pintar,
        onConfirmar: confirmar,
      });
      tab.ponerCursor(1, 1);
      pie();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
