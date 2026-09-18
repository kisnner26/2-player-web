/**
 * Carrera Sokoban — un almacén, dos operarios y cajas que no son de nadie.
 *
 * Cada uno tiene tres marcas de su color y hay cajas de sobra para los dos.
 * Empujar es lo de siempre —solo si detrás hay hueco— pero aquí el hueco lo
 * puede estar tapando el rival, y ahí aparece el juego que no tiene el Sokoban
 * de toda la vida: plantarse detrás de una caja es una defensa perfectamente
 * legal.
 *
 * Una caja colocada se queda quieta para siempre, así que también sirve de
 * muro. Ganar rápido y ganar bien no siempre es lo mismo.
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 3;

/**
 * Mapas: # muro · . suelo · c caja · 1/2 salida de cada jugador · a/b marca.
 * Se dibujan a mano porque un generador aleatorio produce almacenes
 * irresolubles con una facilidad pasmosa.
 */
const MAPAS = [
  [
    '###################',
    '#....a.......b....#',
    '#.###...###...###.#',
    '#.#.....c.c.....#.#',
    '#...c..#...#..c...#',
    '#.a.....1.2.....b.#',
    '#...c..#...#..c...#',
    '#.#.....c.c.....#.#',
    '#.###...###...###.#',
    '#....a.......b....#',
    '###################',
  ],
  [
    '###################',
    '#a...#.......#...b#',
    '#..c.....c.....c..#',
    '#....#..###..#....#',
    '#a.c...#1.2#...c.b#',
    '#....#..###..#....#',
    '#..c.....c.....c..#',
    '#a...#.......#...b#',
    '###################',
  ],
  [
    '###################',
    '#.......a.b.......#',
    '#.#####..c..#####.#',
    '#.#...c.....c...#.#',
    '#.#.a..#####..b.#.#',
    '#...c..#1.2#..c...#',
    '#.#.a..#####..b.#.#',
    '#.#...c.....c...#.#',
    '#.#####..c..#####.#',
    '#.......###.......#',
    '###################',
  ],
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cols = 0, filas = 0, celda = 0, ox = 0, oy = 0;
  let muro = [], marca = [];    // marca: -1 ninguna, 0/1 de cada jugador
  let cajas = [];
  const jug = [crear(0), crear(1)];
  let sb = null, terminado = false, t = 0, reloj = 180;

  function crear(i) {
    return { i, x: 0, y: 0, px: 0, py: 0, mira: i === 0 ? 1 : -1, colocadas: 0, mover: 0, empuje: 0 };
  }

  const k = (x, y) => y * cols + x;
  const libre = (x, y) => x >= 0 && y >= 0 && x < cols && y < filas && !muro[k(x, y)];
  const cajaEn = (x, y) => cajas.find((c) => c.x === x && c.y === y) || null;
  const jugEn = (x, y) => jug.find((p) => p.x === x && p.y === y) || null;

  function cargar() {
    const mapa = MAPAS[Math.floor(rng() * MAPAS.length)];
    filas = mapa.length;
    cols = mapa[0].length;
    muro = new Array(cols * filas).fill(false);
    marca = new Array(cols * filas).fill(-1);
    cajas = [];
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        const ch = mapa[y][x];
        if (ch === '#') muro[k(x, y)] = true;
        if (ch === 'a') marca[k(x, y)] = 0;
        if (ch === 'b') marca[k(x, y)] = 1;
        if (ch === 'c') cajas.push({ x, y, fija: -1, ax: x, ay: y });
        if (ch === '1') { jug[0].x = x; jug[0].y = y; }
        if (ch === '2') { jug[1].x = x; jug[1].y = y; }
      }
    }
    for (const p of jug) { p.px = p.x; p.py = p.y; }
  }

  function medir() {
    celda = Math.floor(Math.min((W - 60) / cols, (H - 120) / filas));
    ox = (W - celda * cols) / 2;
    oy = (H - celda * filas) / 2 + 6;
  }

  function intentar(p, dx, dy) {
    const nx = p.x + dx, ny = p.y + dy;
    if (!libre(nx, ny)) { audio.tone({ freq: 150, dur: 0.05, gain: 0.08, type: 'square' }); return; }
    if (jugEn(nx, ny)) { audio.tone({ freq: 190, dur: 0.05, gain: 0.08, type: 'square' }); return; }

    const caja = cajaEn(nx, ny);
    if (caja) {
      if (caja.fija >= 0) { audio.tone({ freq: 130, dur: 0.06, gain: 0.09, type: 'square' }); return; }
      const bx = nx + dx, by = ny + dy;
      if (!libre(bx, by) || cajaEn(bx, by) || jugEn(bx, by)) {
        audio.thud();
        haptics.tap(p.i);
        return;
      }
      caja.ax = caja.x; caja.ay = caja.y;
      caja.x = bx; caja.y = by;
      p.empuje = 0.16;
      audio.tone({ freq: 260, dur: 0.06, gain: 0.13, type: 'triangle' });
      haptics.click(p.i);

      const m = marca[k(bx, by)];
      if (m >= 0) {
        caja.fija = m;
        jug[m].colocadas++;
        sb.update(jug[0].colocadas, jug[1].colocadas);
        audio.pickup();
        haptics.score(m);
        particles.burst(ox + (bx + 0.5) * celda, oy + (by + 0.5) * celda, 16,
          { speed: 170, color: players[m].color, size: 4, drag: 0.9 });
        if (jug[m].colocadas >= PARA_GANAR) ganar(m);
      }
    } else {
      audio.tick();
    }

    p.px = p.x; p.py = p.y;
    p.x = nx; p.y = ny;
    p.mover = 0.12;
    if (dx) p.mira = dx > 0 ? 1 : -1;
  }

  function ganar(i) {
    if (terminado) return;
    terminado = true;
    audio.win();
    ctx.finish({
      winner: i,
      scores: [jug[0].colocadas, jug[1].colocadas],
      detail: `${players[i].name} coloca sus ${PARA_GANAR} cajas`,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      cargar();
      medir();
      sb = ui.scoreboard({ center: `a ${PARA_GANAR} cajas` });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      reloj -= dt;
      if (reloj <= 0) {
        terminado = true;
        const [a, b] = jug;
        ctx.finish({
          winner: a.colocadas === b.colocadas ? -1 : (a.colocadas > b.colocadas ? 0 : 1),
          scores: [a.colocadas, b.colocadas], detail: 'Se acabó el turno de almacén',
        });
        return;
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        p.mover = Math.max(0, p.mover - dt);
        p.empuje = Math.max(0, p.empuje - dt);
        // Un paso por pulsación: el Sokoban se piensa, no se corre.
        if (pl.pressed('left')) intentar(p, -1, 0);
        else if (pl.pressed('right')) intentar(p, 1, 0);
        else if (pl.pressed('up')) intentar(p, 0, -1);
        else if (pl.pressed('down')) intentar(p, 0, 1);
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0812');

      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const px = ox + x * celda, py = oy + y * celda;
          if (muro[k(x, y)]) {
            g.fillStyle = '#2c2440';
            g.fillRect(px, py, celda, celda);
            g.fillStyle = '#3a3054';
            g.fillRect(px + 2, py + 2, celda - 4, celda * 0.4);
          } else {
            g.fillStyle = (x + y) % 2 ? '#13101f' : '#171326';
            g.fillRect(px, py, celda, celda);
            const m = marca[k(x, y)];
            if (m >= 0) {
              const col = players[m].color;
              g.strokeStyle = col;
              g.lineWidth = 2;
              g.setLineDash([5, 4]);
              g.strokeRect(px + 5, py + 5, celda - 10, celda - 10);
              g.setLineDash([]);
              g.fillStyle = `${col}22`;
              g.fillRect(px + 5, py + 5, celda - 10, celda - 10);
            }
          }
        }
      }

      for (const c of cajas) {
        const px = ox + c.x * celda, py = oy + c.y * celda;
        const fijo = c.fija >= 0;
        g.save();
        if (fijo) { g.shadowColor = players[c.fija].color; g.shadowBlur = 16; }
        g.fillStyle = fijo ? players[c.fija].color : '#b98a4f';
        g.fillRect(px + 4, py + 4, celda - 8, celda - 8);
        g.restore();
        g.strokeStyle = fijo ? '#ffffff77' : '#8a6238';
        g.lineWidth = 2;
        g.strokeRect(px + 4, py + 4, celda - 8, celda - 8);
        g.beginPath();
        g.moveTo(px + 4, py + 4); g.lineTo(px + celda - 4, py + celda - 4);
        g.moveTo(px + celda - 4, py + 4); g.lineTo(px + 4, py + celda - 4);
        g.stroke();
      }

      particles.render(g);

      for (const p of jug) {
        // Interpolación corta entre casillas: el paso a paso se ve mucho mejor.
        const t2 = clamp(1 - p.mover / 0.12, 0, 1);
        const x = (p.px + (p.x - p.px) * t2 + 0.5) * celda + ox;
        const y = (p.py + (p.y - p.py) * t2 + 0.5) * celda + oy;
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), x, y + celda * 0.42, celda * 0.95, {
          pose: p.mover > 0 ? 'anda' : 'quieto',
          frame: Math.floor(t * 8) % 4,
          acento: players[p.i].color,
          mirando: p.mira,
          brillo: p.empuje > 0 ? 18 : 0,
        });
      }

      ctx.engine.text(`${Math.ceil(Math.max(0, reloj))}s`, W / 2, oy - 14,
        { size: 12, color: reloj < 20 ? '#ff4757' : '#8f8fb0', font: 'system-ui' });
      ctx.engine.text('Empuja las cajas a las marcas de TU color · una caja colocada ya no se mueve',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
