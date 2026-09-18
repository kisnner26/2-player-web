/**
 * Reversi — encierra fichas del rival entre dos tuyas y cámbialas de color.
 *
 * Detalles que sí importan: solo son legales las jugadas que voltean al menos
 * una ficha, y si un jugador no tiene ninguna jugada legal pasa turno
 * automáticamente en vez de bloquear la partida.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const N = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let rejilla = [];
  let tab = null;
  let legales = [];
  let volteadas = new Set();   // para animar el último movimiento
  let terminado = false;

  function inicial() {
    rejilla = Array.from({ length: N }, () => new Array(N).fill(null));
    const m = N / 2;
    rejilla[m - 1][m - 1] = 1;
    rejilla[m][m] = 1;
    rejilla[m - 1][m] = 0;
    rejilla[m][m - 1] = 0;
  }

  const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  /** Fichas que se voltearían al jugar en (x,y). Vacío = jugada ilegal. */
  function capturasEn(x, y, jugador) {
    if (rejilla[y][x] != null) return [];
    const total = [];
    for (const [dx, dy] of DIRS) {
      const linea = [];
      let cx = x + dx, cy = y + dy;
      while (dentro(cx, cy) && rejilla[cy][cx] === 1 - jugador) {
        linea.push([cx, cy]);
        cx += dx; cy += dy;
      }
      // Solo cuenta si la línea cierra con una ficha propia.
      if (linea.length && dentro(cx, cy) && rejilla[cy][cx] === jugador) total.push(...linea);
    }
    return total;
  }

  function jugadasDe(jugador) {
    const out = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (capturasEn(x, y, jugador).length) out.push({ x, y });
      }
    }
    return out;
  }

  function contar() {
    const c = [0, 0];
    for (const f of rejilla) for (const v of f) if (v != null) c[v]++;
    return c;
  }

  function pintarCelda(x, y) {
    const v = rejilla[y][x];
    const clases = [];
    let html = '';
    if (v != null) {
      const nueva = volteadas.has(`${x},${y}`);
      html = `<div class="ficha rv-ficha${nueva ? ' rv-voltea' : ''}" style="background:${players[v].color}"></div>`;
    } else if (legales.some((m) => m.x === x && m.y === y)) {
      clases.push('legal');
    }
    return { html, clases, estilo: 'background:#14432a;' };
  }

  function confirmar(x, y) {
    if (terminado) return;
    const jugador = tab.turno;
    const caps = capturasEn(x, y, jugador);
    if (!caps.length) {
      audio.error();
      haptics.error(jugador);
      return;
    }

    rejilla[y][x] = jugador;
    volteadas = new Set(caps.map(([cx, cy]) => `${cx},${cy}`));
    for (const [cx, cy] of caps) rejilla[cy][cx] = jugador;

    audio.place();
    haptics.play('impact', { player: jugador, scale: 0.5 + caps.length * 0.12 });
    if (caps.length >= 4) audio.capture();

    tab.cambiarTurno();
    resolverTurno();
  }

  /** Salta turnos sin jugadas legales y detecta el final. */
  function resolverTurno() {
    legales = jugadasDe(tab.turno);
    if (legales.length === 0) {
      const otras = jugadasDe(1 - tab.turno);
      if (otras.length === 0) return fin();
      audio.back();
      tab.pie(`<b>${players[tab.turno].name}</b> no tiene jugadas: pasa turno`);
      tab.turno = 1 - tab.turno;
      tab.actualizarTurno();
      legales = otras;
    } else {
      const c = contar();
      tab.pie(`Fichas: <b>${c[0]}</b> — <b>${c[1]}</b> · ${legales.length} jugadas posibles`);
    }
    tab.refrescar();
    // El cursor se coloca sobre una jugada legal para no buscar a ciegas.
    if (legales.length) tab.ponerCursor(legales[0].x, legales[0].y);
  }

  function fin() {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    const c = contar();
    ctx.finish({
      winner: c[0] === c[1] ? -1 : c[0] > c[1] ? 0 : 1,
      scores: c,
      detail: `${c[0] + c[1]} fichas en el tablero`,
    });
  }

  return {
    init() {
      inyectarEstilos();
      inicial();
      tab = new Tablero(ctx, {
        cols: N, filas: N, celda: 58,
        pintarCelda,
        onConfirmar: confirmar,
        onCursor: () => tab.refrescar(),
      });
      resolverTurno();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('rv-css')) return;
  const s = document.createElement('style');
  s.id = 'rv-css';
  s.textContent = `
    .rv-ficha { animation:none; }
    .rv-voltea { animation: rv-flip 340ms var(--ease); }
    @keyframes rv-flip {
      0% { transform: rotateY(0) scale(1); }
      50% { transform: rotateY(90deg) scale(.85); }
      100% { transform: rotateY(0) scale(1); }
    }
  `;
  document.head.appendChild(s);
}
