/**
 * Bloques Versus — dos tableros, piezas que caen y basura que se envía.
 *
 * Envío estándar del género: 1 línea no manda nada, 2 mandan 1, 3 mandan 2,
 * 4 mandan 4. La basura llega con un hueco en columna aleatoria y empuja tu
 * pila hacia arriba, así que aguantar para hacer cuádruples es un riesgo real.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 10, FILAS = 20;
const CAIDA_BASE = 0.85;      // segundos por celda al inicio
const ACELERA_CADA = 25;      // líneas para acelerar un escalón
const ENVIO = [0, 0, 1, 2, 4];

const PIEZAS = {
  I: { celdas: [[0, 1], [1, 1], [2, 1], [3, 1]], w: 4, color: '#00e5ff' },
  O: { celdas: [[1, 0], [2, 0], [1, 1], [2, 1]], w: 4, color: '#ffd166' },
  T: { celdas: [[1, 0], [0, 1], [1, 1], [2, 1]], w: 3, color: '#b04cff' },
  S: { celdas: [[1, 0], [2, 0], [0, 1], [1, 1]], w: 3, color: '#a8ff3e' },
  Z: { celdas: [[0, 0], [1, 0], [1, 1], [2, 1]], w: 3, color: '#ff4757' },
  J: { celdas: [[0, 0], [0, 1], [1, 1], [2, 1]], w: 3, color: '#5b8cff' },
  L: { celdas: [[2, 0], [0, 1], [1, 1], [2, 1]], w: 3, color: '#ff7847' },
};
const TIPOS = Object.keys(PIEZAS);

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 24, boardX = [0, 0], boardY = 0;
  const jug = [tablero(0), tablero(1)];
  let sb = null, terminado = false;

  function tablero(i) {
    return {
      i, rejilla: nuevaRejilla(), pieza: null, siguiente: aleatoria(), bolsa: [],
      caida: 0, lineas: 0, basuraPendiente: 0, vivo: true, bloqueoDas: 0, ultimaDir: 0,
    };
  }

  function nuevaRejilla() {
    return Array.from({ length: FILAS }, () => new Array(COLS).fill(null));
  }

  /** Bolsa de 7: garantiza que no salgan cinco S seguidas. */
  function aleatoria(t) {
    if (!t) return TIPOS[Math.floor(rng() * TIPOS.length)];
    if (t.bolsa.length === 0) {
      t.bolsa = [...TIPOS];
      for (let i = t.bolsa.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [t.bolsa[i], t.bolsa[j]] = [t.bolsa[j], t.bolsa[i]];
      }
    }
    return t.bolsa.pop();
  }

  function medir() {
    celda = Math.floor(Math.min((H - 110) / FILAS, (W - 140) / (COLS * 2 + 3)));
    celda = clamp(celda, 12, 30);
    const anchoT = COLS * celda;
    const sep = celda * 2.4;
    boardX = [W / 2 - anchoT - sep / 2, W / 2 + sep / 2];
    boardY = (H - FILAS * celda) / 2 + 16;
  }

  function crearPieza(t, tipo) {
    const def = PIEZAS[tipo];
    return {
      tipo,
      celdas: def.celdas.map(([x, y]) => [x, y]),
      x: Math.floor((COLS - def.w) / 2),
      y: -1,
      w: def.w,
      color: def.color,
    };
  }

  function colisiona(t, pieza, dx = 0, dy = 0, celdas = null) {
    const cs = celdas || pieza.celdas;
    for (const [cx, cy] of cs) {
      const x = pieza.x + cx + dx;
      const y = pieza.y + cy + dy;
      if (x < 0 || x >= COLS || y >= FILAS) return true;
      if (y >= 0 && t.rejilla[y][x]) return true;
    }
    return false;
  }

  /** Rotación en el cuadro w×w de la pieza (SRS simplificado). */
  function rotar(t, pieza) {
    const w = pieza.w;
    const nuevas = pieza.celdas.map(([x, y]) => [w - 1 - y, x]);
    // Patadas: si choca, se prueba a desplazarla un poco.
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!colisiona(t, pieza, dx, 0, nuevas)) {
        pieza.celdas = nuevas;
        pieza.x += dx;
        return true;
      }
    }
    return false;
  }

  function nuevaPieza(t) {
    t.pieza = crearPieza(t, t.siguiente);
    t.siguiente = aleatoria(t);
    if (colisiona(t, t.pieza)) perder(t);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      for (const t of jug) { t.siguiente = aleatoria(t); nuevaPieza(t); }
      sb = ui.scoreboard({ center: 'líneas' });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },

    update(dt) {
      if (terminado) return;
      for (const t of jug) {
        if (!t.vivo) continue;
        const pl = input.player(t.i);

        // Movimiento lateral con auto-repetición propia (más preciso que el del SO)
        const dir = pl.x;
        if (dir !== 0) {
          if (dir !== t.ultimaDir) { mover(t, dir); t.bloqueoDas = 0.17; t.ultimaDir = dir; }
          else {
            t.bloqueoDas -= dt;
            if (t.bloqueoDas <= 0) { mover(t, dir); t.bloqueoDas = 0.045; }
          }
        } else t.ultimaDir = 0;

        if (pl.pressed('up')) {
          if (rotar(t, t.pieza)) { audio.blip(); haptics.play('click', { player: t.i }); }
        }
        if (pl.pressed('a')) soltar(t);

        const acelerado = pl.held('down');
        const vel = Math.max(0.07, CAIDA_BASE * Math.pow(0.86, Math.floor(t.lineas / ACELERA_CADA)));
        t.caida += dt * (acelerado ? 14 : 1);
        while (t.caida >= vel) {
          t.caida -= vel;
          if (!colisiona(t, t.pieza, 0, 1)) t.pieza.y++;
          else { fijar(t); break; }
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0812');

      for (let i = 0; i < 2; i++) {
        const t = jug[i];
        const bx = boardX[i];

        // Marco
        g.save();
        g.strokeStyle = players[i].color + '66';
        g.lineWidth = 2;
        g.strokeRect(bx - 2, boardY - 2, COLS * celda + 4, FILAS * celda + 4);
        g.fillStyle = '#00000066';
        g.fillRect(bx, boardY, COLS * celda, FILAS * celda);
        g.restore();

        // Rejilla de fondo
        g.strokeStyle = '#ffffff08';
        g.lineWidth = 1;
        for (let x = 1; x < COLS; x++) {
          g.beginPath(); g.moveTo(bx + x * celda + 0.5, boardY); g.lineTo(bx + x * celda + 0.5, boardY + FILAS * celda); g.stroke();
        }

        // Bloques fijados
        for (let y = 0; y < FILAS; y++) {
          for (let x = 0; x < COLS; x++) {
            const c = t.rejilla[y][x];
            if (c) bloque(g, bx + x * celda, boardY + y * celda, c);
          }
        }

        if (t.pieza && t.vivo) {
          // Sombra de aterrizaje
          let gy = 0;
          while (!colisiona(t, t.pieza, 0, gy + 1)) gy++;
          g.save();
          g.globalAlpha = 0.18;
          for (const [cx, cy] of t.pieza.celdas) {
            const y = t.pieza.y + cy + gy;
            if (y < 0) continue;
            bloque(g, bx + (t.pieza.x + cx) * celda, boardY + y * celda, t.pieza.color);
          }
          g.restore();

          for (const [cx, cy] of t.pieza.celdas) {
            const y = t.pieza.y + cy;
            if (y < 0) continue;
            bloque(g, bx + (t.pieza.x + cx) * celda, boardY + y * celda, t.pieza.color);
          }
        }

        // Siguiente pieza
        const nx = bx + COLS * celda + 10;
        ctx.engine.text('SIG', nx + 22, boardY + 8, { size: 8, color: '#ffffff55', font: 'system-ui' });
        const def = PIEZAS[t.siguiente];
        for (const [cx, cy] of def.celdas) {
          bloque(g, nx + cx * (celda * 0.6), boardY + 20 + cy * (celda * 0.6), def.color, celda * 0.6);
        }

        // Basura pendiente
        if (t.basuraPendiente > 0) {
          g.fillStyle = '#ff4757';
          g.fillRect(bx - 12, boardY + FILAS * celda - t.basuraPendiente * celda, 7, t.basuraPendiente * celda);
        }
      }

      particles.render(g);
    },

    destroy() { sb?.remove(); },
  };

  function bloque(g, x, y, color, tam = celda) {
    g.fillStyle = color;
    g.fillRect(x + 1, y + 1, tam - 2, tam - 2);
    g.fillStyle = '#ffffff44';
    g.fillRect(x + 1, y + 1, tam - 2, 3);
    g.fillStyle = '#00000044';
    g.fillRect(x + 1, y + tam - 4, tam - 2, 3);
  }

  function mover(t, dir) {
    if (!colisiona(t, t.pieza, dir, 0)) {
      t.pieza.x += dir;
      haptics.play('tick', { player: t.i });
    }
  }

  function soltar(t) {
    let d = 0;
    while (!colisiona(t, t.pieza, 0, d + 1)) d++;
    t.pieza.y += d;
    audio.thud();
    haptics.impact(t.i, 0.8 + d * 0.02);
    fijar(t);
  }

  function fijar(t) {
    for (const [cx, cy] of t.pieza.celdas) {
      const y = t.pieza.y + cy, x = t.pieza.x + cx;
      if (y < 0) { perder(t); return; }
      t.rejilla[y][x] = t.pieza.color;
    }
    audio.place();
    haptics.play('soft', { player: t.i });

    // Limpiar líneas
    let limpiadas = 0;
    for (let y = FILAS - 1; y >= 0; y--) {
      if (t.rejilla[y].every((c) => c)) {
        const bx = boardX[t.i];
        particles.burst(bx + (COLS * celda) / 2, boardY + y * celda + celda / 2, 26, {
          speed: 260, spread: 0.6, dir: 0, color: players[t.i].color, size: 4, drag: 0.9,
        });
        t.rejilla.splice(y, 1);
        t.rejilla.unshift(new Array(COLS).fill(null));
        limpiadas++;
        y++;
      }
    }

    if (limpiadas > 0) {
      t.lineas += limpiadas;
      sb.update(jug[0].lineas, jug[1].lineas);
      audio.score(t.i);
      haptics.score(t.i);
      ctx.shake(limpiadas * 3);
      if (limpiadas === 4) ui.toast('¡CUÁDRUPLE!', { ms: 1100, color: players[t.i].color });

      let envio = ENVIO[limpiadas];
      // La basura pendiente propia cancela lo que ibas a mandar.
      const cancelado = Math.min(envio, t.basuraPendiente);
      t.basuraPendiente -= cancelado;
      envio -= cancelado;
      if (envio > 0) jug[1 - t.i].basuraPendiente += envio;
    } else if (t.basuraPendiente > 0) {
      // La basura entra cuando cierras una pieza sin hacer línea.
      recibirBasura(t);
    }

    nuevaPieza(t);
  }

  function recibirBasura(t) {
    const n = Math.min(t.basuraPendiente, 6);
    t.basuraPendiente -= n;
    const hueco = Math.floor(rng() * COLS);
    for (let k = 0; k < n; k++) {
      t.rejilla.shift();
      const fila = new Array(COLS).fill('#4a4a5e');
      fila[hueco] = null;
      t.rejilla.push(fila);
    }
    audio.error();
    haptics.play('heavy', { player: t.i });
    ctx.shake(6);
    // Si la pieza en juego queda dentro de la basura, se sube.
    while (t.pieza && colisiona(t, t.pieza) && t.pieza.y > -3) t.pieza.y--;
  }

  function perder(t) {
    if (terminado) return;
    t.vivo = false;
    terminado = true;
    audio.lose();
    haptics.defeat(t.i);
    ctx.shake(20);
    ctx.finish({
      winner: 1 - t.i,
      scores: [jug[0].lineas, jug[1].lineas],
      detail: `${players[t.i].name} desbordó`,
    });
  }
}
