/**
 * Laberinto Contrarreloj — el mismo laberinto para los dos, cada uno a oscuras.
 *
 * La pantalla se parte en dos y cada mitad enseña solo lo que alcanza la
 * linterna de su dueño. Es el mismo mapa, así que no hay suerte: si el otro va
 * más rápido es porque ha elegido mejor, no porque le tocara el camino corto.
 *
 * Lo recorrido se queda dibujado en tenue, y ahí está el detalle bonito: al
 * final de la partida cada mitad enseña la forma de cómo pensó cada uno. Uno
 * suele tener una línea limpia y el otro un garabato lleno de callejones.
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const COLS = 21;              // impares: el generador trabaja sobre celdas impares
const FILAS = 15;
const VISION = 3.2;           // radio de linterna, en casillas
const PASO = 0.13;            // segundos por casilla

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let muro = [];
  let metaX = 0, metaY = 0;
  let celda = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, terminado = false, t = 0;

  function crear(i) {
    return { i, x: 0, y: 0, px: 0, py: 0, mover: 0, mira: 1, pasos: 0,
             visto: new Set(), rastro: [], farol: 0 };
  }

  const k = (x, y) => y * COLS + x;
  const pared = (x, y) => x < 0 || y < 0 || x >= COLS || y >= FILAS || muro[k(x, y)];

  /** Laberinto perfecto por excavación en profundidad. */
  function generar() {
    muro = new Array(COLS * FILAS).fill(true);
    const pila = [[1, 1]];
    muro[k(1, 1)] = false;
    while (pila.length) {
      const [x, y] = pila[pila.length - 1];
      const opciones = [];
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const nx = x + dx, ny = y + dy;
        if (nx > 0 && ny > 0 && nx < COLS - 1 && ny < FILAS - 1 && muro[k(nx, ny)]) opciones.push([nx, ny, dx, dy]);
      }
      if (!opciones.length) { pila.pop(); continue; }
      const [nx, ny, dx, dy] = opciones[Math.floor(rng() * opciones.length)];
      muro[k(x + dx / 2, y + dy / 2)] = false;
      muro[k(nx, ny)] = false;
      pila.push([nx, ny]);
    }
    // Unos cuantos muros de menos: con ciclos hay rutas alternativas y el
    // laberinto deja de ser "solo hay un camino, corre".
    for (let n = 0; n < 14; n++) {
      const x = 1 + Math.floor(rng() * (COLS - 2));
      const y = 1 + Math.floor(rng() * (FILAS - 2));
      if ((x % 2) !== (y % 2)) muro[k(x, y)] = false;
    }

    metaX = COLS % 2 ? Math.floor(COLS / 2) : Math.floor(COLS / 2) + 1;
    metaY = FILAS % 2 ? Math.floor(FILAS / 2) : Math.floor(FILAS / 2) + 1;
    if (metaX % 2 === 0) metaX--;
    if (metaY % 2 === 0) metaY--;
    muro[k(metaX, metaY)] = false;

    jug[0].x = 1; jug[0].y = 1;
    jug[1].x = COLS - 2; jug[1].y = FILAS - 2;
    if (muro[k(jug[1].x, jug[1].y)]) { jug[1].x = COLS - 2; jug[1].y = FILAS - 2; muro[k(jug[1].x, jug[1].y)] = false; }
    for (const p of jug) { p.px = p.x; p.py = p.y; p.visto.clear(); p.rastro = []; marcarVisto(p); }
  }

  function marcarVisto(p) {
    const r = Math.ceil(VISION + p.farol);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > (VISION + p.farol) * (VISION + p.farol)) continue;
        const x = p.x + dx, y = p.y + dy;
        if (x < 0 || y < 0 || x >= COLS || y >= FILAS) continue;
        p.visto.add(k(x, y));
      }
    }
  }

  function medir() {
    const mitad = W / 2 - 16;
    celda = Math.floor(Math.min(mitad / COLS, (H - 90) / FILAS));
  }

  const origen = (i) => ({
    x: (i === 0 ? 0 : W / 2) + (W / 2 - celda * COLS) / 2,
    y: (H - celda * FILAS) / 2 + 10,
  });

  function llegar(p) {
    if (terminado) return;
    terminado = true;
    audio.win();
    haptics.victory(p.i);
    ctx.finish({
      winner: p.i,
      scores: [jug[0].pasos, jug[1].pasos],
      detail: `${players[p.i].name} llega en ${p.pasos} pasos`,
      record: ctx.record('pasos', p.pasos, 'low'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      generar();
      sb = ui.scoreboard({ center: 'al centro, a ciegas' });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const p of jug) {
        const pl = input.player(p.i);
        p.mover = Math.max(0, p.mover - dt);
        if (p.mover > 0) continue;

        let dx = 0, dy = 0;
        if (pl.held('left')) dx = -1;
        else if (pl.held('right')) dx = 1;
        else if (pl.held('up')) dy = -1;
        else if (pl.held('down')) dy = 1;
        if (!dx && !dy) continue;

        if (pared(p.x + dx, p.y + dy)) {
          if (pl.pressed('left') || pl.pressed('right') || pl.pressed('up') || pl.pressed('down')) {
            audio.tone({ freq: 140, dur: 0.05, gain: 0.07, type: 'square' });
          }
          continue;
        }

        p.px = p.x; p.py = p.y;
        p.x += dx; p.y += dy;
        p.mover = PASO;
        p.pasos++;
        if (dx) p.mira = dx > 0 ? 1 : -1;
        p.rastro.push(k(p.x, p.y));
        if (p.rastro.length > 400) p.rastro.shift();
        marcarVisto(p);
        audio.tone({ freq: 300 + (p.pasos % 5) * 20, dur: 0.02, gain: 0.05, type: 'triangle' });

        if (p.x === metaX && p.y === metaY) { llegar(p); return; }
      }

      sb.update(jug[0].pasos, jug[1].pasos);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#05040a');

      for (const p of jug) {
        const o = origen(p.i);
        const col = players[p.i].color;

        g.save();
        g.beginPath();
        g.rect(o.x - 6, o.y - 6, celda * COLS + 12, celda * FILAS + 12);
        g.clip();

        g.fillStyle = '#0b0912';
        g.fillRect(o.x - 6, o.y - 6, celda * COLS + 12, celda * FILAS + 12);

        for (let y = 0; y < FILAS; y++) {
          for (let x = 0; x < COLS; x++) {
            const i = k(x, y);
            if (!p.visto.has(i)) continue;
            const d = Math.hypot(x - p.x, y - p.y);
            // Lo lejano se recuerda apagado; lo cercano está iluminado.
            const luz = clamp(1.15 - d / (VISION + 1.6), 0.16, 1);
            const px = o.x + x * celda, py = o.y + y * celda;
            if (muro[i]) {
              g.fillStyle = `rgba(58,46,86,${luz})`;
              g.fillRect(px, py, celda, celda);
              g.fillStyle = `rgba(88,72,124,${luz * 0.7})`;
              g.fillRect(px, py, celda, Math.max(1, celda * 0.22));
            } else {
              g.fillStyle = `rgba(18,16,30,${0.4 + luz * 0.6})`;
              g.fillRect(px, py, celda, celda);
            }
          }
        }

        // Rastro: por dónde ha pasado este jugador.
        g.fillStyle = `${col}22`;
        for (const i of p.rastro) {
          const x = i % COLS, y = Math.floor(i / COLS);
          g.fillRect(o.x + x * celda + celda * 0.3, o.y + y * celda + celda * 0.3, celda * 0.4, celda * 0.4);
        }

        // Meta, solo si ya la ha visto alguna vez.
        if (p.visto.has(k(metaX, metaY))) {
          const mx = o.x + metaX * celda + celda / 2, my = o.y + metaY * celda + celda / 2;
          ctx.engine.glowCircle(mx, my, celda * 0.32 * (1 + Math.sin(t * 4) * 0.12), '#ffd166', 18);
        }

        const t2 = clamp(1 - p.mover / PASO, 0, 1);
        const jx = o.x + (p.px + (p.x - p.px) * t2 + 0.5) * celda;
        const jy = o.y + (p.py + (p.y - p.py) * t2 + 0.5) * celda;
        // Halo de linterna
        const halo = g.createRadialGradient(jx, jy, 0, jx, jy, celda * (VISION + 1));
        halo.addColorStop(0, `${col}30`);
        halo.addColorStop(1, '#00000000');
        g.fillStyle = halo;
        g.fillRect(o.x - 6, o.y - 6, celda * COLS + 12, celda * FILAS + 12);

        dibujarPersonaje(g, personajeDe(players[p.i], p.i), jx, jy + celda * 0.5, celda * 1.25, {
          pose: p.mover > 0 ? 'anda' : 'quieto',
          frame: Math.floor(t * 9) % 4,
          acento: col, mirando: p.mira, brillo: 12,
        });

        g.restore();

        g.strokeStyle = `${col}55`;
        g.lineWidth = 2;
        g.strokeRect(o.x - 6, o.y - 6, celda * COLS + 12, celda * FILAS + 12);
        ctx.engine.text(`${players[p.i].name} · ${p.pasos} pasos`, o.x + celda * COLS / 2, o.y - 18,
          { size: 12, color: col, font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text('Mismo laberinto para los dos · gana quien llegue antes a la luz del centro',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
