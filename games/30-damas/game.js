/**
 * Damas — reglas internacionales simplificadas sobre tablero de 8×8.
 *
 * Incluye lo que hace que las damas sean damas: la captura es obligatoria,
 * las capturas encadenadas se resuelven en un solo turno y la dama corona al
 * llegar al fondo. Sin captura obligatoria el juego pierde toda su tensión.
 */

import { Tablero } from '../../core/boardgame.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 8;

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  // Cada casilla: null o { j: 0|1, dama: boolean }
  let piezas = [];
  let tab = null;
  let seleccion = null;        // {x,y}
  let jugadasLegales = [];     // [{x,y,capturas:[{x,y}]}]
  let cadena = null;           // pieza obligada a seguir capturando
  let terminado = false;

  function inicial() {
    piezas = Array.from({ length: N }, () => new Array(N).fill(null));
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if ((x + y) % 2 === 0) continue;       // solo casillas oscuras
        if (y < 3) piezas[y][x] = { j: 1, dama: false };
        if (y > N - 4) piezas[y][x] = { j: 0, dama: false };
      }
    }
  }

  const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  /** Movimientos de una pieza. Si `soloCapturas`, ignora los tranquilos. */
  function movimientosDe(x, y, soloCapturas = false) {
    const p = piezas[y][x];
    if (!p) return [];
    const salida = [];
    const dirs = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const avance = p.j === 0 ? -1 : 1;

    for (const [dx, dy] of dirs) {
      if (p.dama) {
        // La dama recorre la diagonal; puede capturar a distancia.
        let cx = x + dx, cy = y + dy;
        let capturada = null;
        while (dentro(cx, cy)) {
          const o = piezas[cy][cx];
          if (o) {
            if (o.j === p.j || capturada) break;
            capturada = { x: cx, y: cy };
          } else {
            if (capturada) salida.push({ x: cx, y: cy, capturas: [capturada] });
            else if (!soloCapturas) salida.push({ x: cx, y: cy, capturas: [] });
          }
          cx += dx; cy += dy;
        }
      } else {
        const sx = x + dx, sy = y + dy;
        // Peón: avanza solo hacia delante, pero captura en las cuatro diagonales.
        if (dentro(sx, sy) && !piezas[sy][sx] && dy === avance && !soloCapturas) {
          salida.push({ x: sx, y: sy, capturas: [] });
        }
        const jx = x + dx * 2, jy = y + dy * 2;
        if (dentro(jx, jy) && !piezas[jy][jx] && piezas[sy]?.[sx] && piezas[sy][sx].j !== p.j) {
          salida.push({ x: jx, y: jy, capturas: [{ x: sx, y: sy }] });
        }
      }
    }
    return salida;
  }

  /** Todas las jugadas del jugador, aplicando captura obligatoria. */
  function jugadasDe(jugador) {
    const todas = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (piezas[y][x]?.j !== jugador) continue;
        for (const m of movimientosDe(x, y)) todas.push({ desde: { x, y }, ...m });
      }
    }
    const conCaptura = todas.filter((m) => m.capturas.length > 0);
    return conCaptura.length ? conCaptura : todas;
  }

  function pintarCelda(x, y) {
    const oscura = (x + y) % 2 === 1;
    const clases = [oscura ? 'oscura' : 'clara'];
    let html = '';

    const p = piezas[y][x];
    if (p) {
      const col = players[p.j].color;
      html = `<div class="ficha dm-pieza${p.dama ? ' dm-dama' : ''}" style="background:${col}">
                ${p.dama ? `<span class="dm-corona">${icon('trophy', { size: 14 })}</span>` : ''}
              </div>`;
    }
    if (seleccion && seleccion.x === x && seleccion.y === y) clases.push('marcada');
    const legal = jugadasLegales.find((m) => m.x === x && m.y === y);
    if (legal) clases.push(legal.capturas.length ? 'legal-captura' : 'legal');
    return { html, clases };
  }

  function seleccionar(x, y) {
    const jugador = tab.turno;
    const todas = jugadasDe(jugador);

    // En mitad de una cadena, solo esa pieza puede moverse.
    if (cadena) {
      if (x === cadena.x && y === cadena.y) return;
      const m = jugadasLegales.find((j) => j.x === x && j.y === y);
      if (m) return aplicar(cadena, m);
      audio.error(); haptics.error(jugador);
      return;
    }

    if (seleccion) {
      const m = jugadasLegales.find((j) => j.x === x && j.y === y);
      if (m) return aplicar(seleccion, m);
    }

    const p = piezas[y][x];
    if (p && p.j === jugador) {
      const suyas = todas.filter((m) => m.desde.x === x && m.desde.y === y);
      if (!suyas.length) {
        // Hay captura obligatoria en otro sitio.
        audio.error();
        haptics.error(jugador);
        tab.pie('<b>Captura obligatoria</b>: debes comer con otra pieza');
        return;
      }
      seleccion = { x, y };
      jugadasLegales = suyas;
      audio.select();
      tab.refrescar();
      return;
    }

    seleccion = null;
    jugadasLegales = [];
    tab.refrescar();
  }

  function aplicar(desde, m) {
    const p = piezas[desde.y][desde.x];
    piezas[desde.y][desde.x] = null;
    piezas[m.y][m.x] = p;

    for (const c of m.capturas) {
      piezas[c.y][c.x] = null;
      audio.capture();
      haptics.play('impact', { player: tab.turno, scale: 1 });
    }
    if (!m.capturas.length) {
      audio.place();
      haptics.play('click', { player: tab.turno });
    }

    // Coronación
    const fondo = p.j === 0 ? 0 : N - 1;
    let acabaDeCoronar = false;
    if (!p.dama && m.y === fondo) {
      p.dama = true;
      acabaDeCoronar = true;
      audio.win();
      haptics.play('score', { player: tab.turno });
    }

    seleccion = null;
    jugadasLegales = [];

    // Cadena: si tras capturar hay más capturas con la misma pieza, sigue.
    // Coronar corta la cadena, como en las reglas internacionales.
    if (m.capturas.length && !acabaDeCoronar) {
      const siguientes = movimientosDe(m.x, m.y, true);
      if (siguientes.length) {
        cadena = { x: m.x, y: m.y };
        jugadasLegales = siguientes;
        tab.ponerCursor(m.x, m.y);
        tab.pie('<b>Cadena</b>: puedes seguir comiendo');
        tab.refrescar();
        return;
      }
    }

    cadena = null;
    tab.cambiarTurno();
    comprobarFin();
  }

  function comprobarFin() {
    const cuenta = [0, 0];
    for (const f of piezas) for (const c of f) if (c) cuenta[c.j]++;

    if (cuenta[0] === 0) return fin(1, cuenta);
    if (cuenta[1] === 0) return fin(0, cuenta);
    if (jugadasDe(tab.turno).length === 0) return fin(1 - tab.turno, cuenta);

    const hayCaptura = jugadasDe(tab.turno).some((m) => m.capturas.length);
    tab.pie(hayCaptura ? '<b>Captura obligatoria</b> este turno' : 'Elige una pieza y su destino');
  }

  function fin(ganador, cuenta) {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    ctx.finish({
      winner: ganador,
      scores: cuenta,
      detail: cuenta[1 - ganador] === 0 ? 'Sin piezas' : 'Sin movimientos legales',
    });
  }

  return {
    init() {
      inyectarEstilos();
      inicial();
      tab = new Tablero(ctx, {
        cols: N, filas: N, celda: 60,
        pintarCelda,
        onConfirmar: (x, y) => { if (!terminado) seleccionar(x, y); },
        onCursor: () => tab.refrescar(),
      });
      tab.ponerCursor(3, 5);
      comprobarFin();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('dm-css')) return;
  const s = document.createElement('style');
  s.id = 'dm-css';
  s.textContent = `
    .dm-pieza { display:grid; place-items:center; }
    .dm-dama { box-shadow: inset 0 -3px 6px #0006, 0 0 16px -2px currentColor, 0 2px 6px #0008; }
    .dm-corona { font-size:.85em; color:#000000aa; text-shadow:0 1px 0 #ffffff55; }
  `;
  document.head.appendChild(s);
}
