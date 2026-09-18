/**
 * Llama y Marea — plataformas de coordinación, a lo Fireboy & Watergirl.
 *
 * Cada jugador lleva SU personaje en el MISMO nivel: Llama (fuego) cruza la
 * lava pero muere en el agua, Marea (agua) al revés. El ácido mata a los dos.
 * Las puertas solo se abren si los dos pisan sus placas a la vez, así que
 * ninguno puede terminar el nivel solo — hay que hablar y esperarse.
 *
 * Los niveles son mapas de texto: cada carácter es una celda. Añadir uno es
 * escribir 12 líneas más abajo, sin tocar nada del motor.
 *
 *   #  muro          .  vacío
 *   L  lava (mata a Marea)     A  agua (mata a Llama)
 *   X  ácido (mata a los dos)
 *   1  salida de Llama         2  salida de Marea
 *   a  placa de Llama          b  placa de Marea
 *   =  puerta (se abre con las dos placas pisadas)
 *   g  gema (opcional, suma puntos)
 *   p  inicio de Llama         q  inicio de Marea
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

let T = 34;                      // lado de celda en px; medir() lo ajusta a la ventana
const GRAV = 1750;
const VEL = 190;
const SALTO = 545;

const NIVELES = [
  [
    '####################',
    '#..................#',
    '#..g............g..#',
    '#....####..####....#',
    '#..................#',
    '#.....a......b.....#',
    '#..#####====#####..#',
    '#..................#',
    '#p......LLAA......q#',
    '#..1..........2....#',
    '####################',
  ],
  [
    '####################',
    '#........gg........#',
    '#...###......###...#',
    '#..................#',
    '#.a..............b.#',
    '#####..######..#####',
    '#.......====.......#',
    '#..g..#......#..g..#',
    '#..#..#.XXXX.#..#..#',
    '#p.1..LL....AA..2.q#',
    '####################',
  ],
  [
    '####################',
    '#p.................#',
    '#####...g...g...####',
    '#...#..###.###..#..#',
    '#.a.#..........b#..#',
    '#####..######..#####',
    '#....===....===....#',
    '#..#....#..#....#..#',
    '#..#.LL.#..#.AA.#..#',
    '#..1....#XX#....2..q',
    '####################',
  ],
];

const COLOR = {
  '#': '#3a3550',
  L: '#ff4d2e',
  A: '#2ea8ff',
  X: '#a8ff3e',
};

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let nivelIdx = 0;
  let mapa = [], cols = 0, filas = 0, offX = 0, offY = 0;
  let puertas = [], placas = [], gemas = [], salidas = [];
  let abierto = false;
  let gemasTomadas = 0, gemasTotal = 0;
  let muertes = [0, 0];
  let tiempo = 0;
  let estado = 'jugando';        // jugando | pasando | fin
  let pausa = 0;
  let aviso = '', avisoT = 0;

  const her = [crearHeroe(0), crearHeroe(1)];

  function crearHeroe(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, w: T * 0.62, h: T * 0.86, suelo: false, enSalida: false, respawn: 0, sx: 0, sy: 0 };
  }

  function cargarNivel() {
    const src = NIVELES[nivelIdx];
    filas = src.length; cols = src[0].length;
    mapa = src.map((f) => f.split(''));
    puertas = []; placas = []; gemas = []; salidas = [];
    abierto = false; gemasTomadas = 0; gemasTotal = 0;

    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        const c = mapa[y][x];
        if (c === '=') puertas.push({ x, y });
        else if (c === 'a') placas.push({ x, y, de: 0, on: false });
        else if (c === 'b') placas.push({ x, y, de: 1, on: false });
        else if (c === 'g') { gemas.push({ x, y, tomada: false }); gemasTotal++; }
        else if (c === '1') salidas.push({ x, y, de: 0 });
        else if (c === '2') salidas.push({ x, y, de: 1 });
        else if (c === 'p') { her[0].sx = x; her[0].sy = y; }
        else if (c === 'q') { her[1].sx = x; her[1].sy = y; }
      }
    }
    // Medir antes de colocar: `reaparecer` traduce celda → píxel usando el
    // encuadre, así que hacerlo al revés deja a los héroes fuera del mapa.
    medir();
    for (const h of her) reaparecer(h, true);
    decir(`Nivel ${nivelIdx + 1} de ${NIVELES.length}`);
  }

  /**
   * Encaja el nivel en la ventana. El lado de celda no puede ser fijo: con
   * veinte columnas, un tamaño constante se sale por los lados en cuanto la
   * ventana no es ancha, y medio nivel queda fuera de la pantalla.
   */
  function medir() {
    const margen = 30;
    T = Math.max(14, Math.floor(Math.min(
      (W - margen * 2) / cols,
      (H - margen * 2 - 30) / filas,
      42,
    )));
    for (const h of her) { h.w = T * 0.62; h.h = T * 0.86; }
    offX = Math.floor((W - cols * T) / 2);
    offY = Math.floor((H - filas * T) / 2) + 14;
  }

  function decir(t) { aviso = t; avisoT = 2.4; }

  function reaparecer(h, silencioso = false) {
    h.x = offX + h.sx * T + (T - h.w) / 2;
    h.y = offY + h.sy * T + (T - h.h);
    h.vx = h.vy = 0;
    h.respawn = silencioso ? 0 : 0.45;
  }

  const celdaEn = (px, py) => {
    const cx = Math.floor((px - offX) / T), cy = Math.floor((py - offY) / T);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= filas) return '#';
    return mapa[cy][cx];
  };

  /** ¿Esa celda bloquea el paso para este héroe? */
  function solido(c) {
    if (c === '#') return true;
    if (c === '=' && !abierto) return true;
    return false;
  }

  function colisionaCaja(h, nx, ny) {
    const puntos = [
      [nx, ny], [nx + h.w, ny], [nx, ny + h.h], [nx + h.w, ny + h.h],
      [nx + h.w / 2, ny], [nx + h.w / 2, ny + h.h],
    ];
    return puntos.some(([px, py]) => solido(celdaEn(px, py)));
  }

  /** Líquido letal para este héroe: 0=Llama muere en agua, 1=Marea en lava. */
  function esLetal(c, i) {
    if (c === 'X') return true;
    if (i === 0 && c === 'A') return true;
    if (i === 1 && c === 'L') return true;
    return false;
  }

  function morir(h) {
    muertes[h.i]++;
    particles.burst(h.x + h.w / 2, h.y + h.h / 2, 20, {
      speed: 190, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: h.i === 0 ? '#ff4d2e' : '#2ea8ff', size: 3, shape: 'spark', drag: 0.92,
    });
    audio.explosion();
    haptics.explosion(h.i);
    ctx.shake(5, 7);
    reaparecer(h);
    decir(`${players[h.i].name} volvió al inicio`);
  }

  function mover(h, dt) {
    if (h.respawn > 0) { h.respawn -= dt; return; }
    const p = input.player(h.i);
    const dir = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    h.vx = dir * VEL;

    if (p.pressed('a') && h.suelo) {
      h.vy = -SALTO;
      h.suelo = false;
      audio.tone({ freq: h.i === 0 ? 380 : 300, dur: 0.07, gain: 0.13, type: 'square', sweep: 180 });
      haptics.play('tap', { player: h.i });
    }

    h.vy = Math.min(h.vy + GRAV * dt, 900);

    // Eje X
    let nx = h.x + h.vx * dt;
    if (!colisionaCaja(h, nx, h.y)) h.x = nx;
    else h.vx = 0;

    // Eje Y
    let ny = h.y + h.vy * dt;
    if (!colisionaCaja(h, h.x, ny)) { h.y = ny; h.suelo = false; }
    else {
      if (h.vy > 0) h.suelo = true;
      h.vy = 0;
    }

    // Peligros: se mira el centro-bajo del cuerpo
    const cx = h.x + h.w / 2, cy = h.y + h.h * 0.75;
    if (esLetal(celdaEn(cx, cy), h.i)) { morir(h); return; }

    // Gemas
    for (const g of gemas) {
      if (g.tomada) continue;
      const gx = offX + g.x * T + T / 2, gy = offY + g.y * T + T / 2;
      if (Math.abs(gx - cx) < T * 0.6 && Math.abs(gy - (h.y + h.h / 2)) < T * 0.6) {
        g.tomada = true; gemasTomadas++;
        audio.blip();
        haptics.play('soft', { player: h.i });
        particles.burst(gx, gy, 10, { speed: 130, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ffd166', size: 2.2, drag: 0.91 });
      }
    }

    // Salida propia
    h.enSalida = salidas.some((s) => s.de === h.i &&
      Math.abs(offX + s.x * T + T / 2 - cx) < T * 0.62 &&
      Math.abs(offY + s.y * T + T / 2 - (h.y + h.h / 2)) < T * 0.7);
  }

  function actualizarPlacas() {
    const antes = abierto;
    for (const pl of placas) {
      const px = offX + pl.x * T + T / 2, py = offY + pl.y * T + T / 2;
      const h = her[pl.de];
      pl.on = Math.abs(h.x + h.w / 2 - px) < T * 0.62 && Math.abs(h.y + h.h - py) < T * 0.9;
    }
    // La puerta se abre solo si TODAS las placas están pisadas a la vez.
    abierto = placas.length > 0 && placas.every((p) => p.on);
    if (abierto !== antes) {
      audio.tone({ freq: abierto ? 520 : 260, dur: 0.12, gain: 0.14, type: 'triangle' });
      if (abierto) decir('¡Puertas abiertas! Aprovechen');
    }
  }

  return {
    init() { medir(); cargarNivel(); },
    /**
     * Al cambiar el tamaño, el mapa se recentra: hay que arrastrar a los
     * héroes con él. Si no, se quedan en las coordenadas del encuadre
     * anterior, que ya cae fuera de la rejilla — y como `celdaEn()` trata
     * todo lo de fuera como muro, el personaje queda encajonado y no
     * responde a los controles.
     */
    resize(w, h) {
      // Se guarda la posición en celdas (con decimales) y se restaura tras
      // remedir: el encuadre y el lado de celda cambian a la vez, así que
      // trasladar en píxeles no bastaría.
      const antes = her.map((x) => ({ cx: (x.x - offX) / T, cy: (x.y - offY) / T }));
      W = w; H = h;
      medir();
      her.forEach((x, i) => { x.x = offX + antes[i].cx * T; x.y = offY + antes[i].cy * T; });
    },

    update(dt) {
      if (estado === 'fin') return;
      if (estado === 'pasando') {
        pausa -= dt;
        if (pausa <= 0) {
          nivelIdx++;
          if (nivelIdx >= NIVELES.length) {
            estado = 'fin';
            ctx.finish({
              winner: -1,
              scores: [muertes[0], muertes[1]],
              detail: `Los ${NIVELES.length} niveles en ${tiempo.toFixed(0)}s · ${muertes[0] + muertes[1]} caídas`,
              record: ctx.record('tiempo', Math.round(tiempo), 'low'),
            });
          } else { estado = 'jugando'; cargarNivel(); }
        }
        return;
      }

      tiempo += dt;
      if (avisoT > 0) avisoT -= dt;
      actualizarPlacas();
      for (const h of her) mover(h, dt);
      particles.update(dt);

      if (her[0].enSalida && her[1].enSalida) {
        estado = 'pasando';
        pausa = 1.2;
        audio.win();
        haptics.play('victory');
        decir('¡Los dos fuera! Siguiente nivel');
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0812');

      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const c = mapa[y][x];
          const px = offX + x * T, py = offY + y * T;
          if (c === '#') {
            g.fillStyle = COLOR['#']; g.fillRect(px, py, T, T);
            g.fillStyle = '#4a4468'; g.fillRect(px, py, T, 3);
          } else if (c === 'L' || c === 'A' || c === 'X') {
            const col = COLOR[c];
            g.fillStyle = col + '55'; g.fillRect(px, py, T, T);
            g.save(); g.shadowColor = col; g.shadowBlur = 12; g.fillStyle = col;
            const ola = Math.sin(tiempo * 3 + x * 0.8) * 2.5;
            g.fillRect(px, py + 5 + ola, T, T - 5 - ola);
            g.restore();
          }
        }
      }

      // Puertas
      for (const d of puertas) {
        const px = offX + d.x * T, py = offY + d.y * T;
        if (abierto) {
          g.fillStyle = '#ffd16633'; g.fillRect(px, py, T, 5);
        } else {
          g.fillStyle = '#8a7a3a'; g.fillRect(px, py, T, T);
          g.fillStyle = '#ffd166'; g.fillRect(px + 2, py + 2, T - 4, 4);
          g.fillRect(px + 2, py + T - 6, T - 4, 4);
        }
      }

      // Placas
      for (const pl of placas) {
        const px = offX + pl.x * T, py = offY + pl.y * T;
        const col = pl.de === 0 ? '#ff4d2e' : '#2ea8ff';
        g.fillStyle = pl.on ? col : col + '44';
        g.fillRect(px + 4, py + T - (pl.on ? 5 : 9), T - 8, pl.on ? 5 : 9);
        if (pl.on) { g.save(); g.shadowColor = col; g.shadowBlur = 14; g.fillRect(px + 4, py + T - 5, T - 8, 5); g.restore(); }
      }

      // Gemas
      for (const gem of gemas) {
        if (gem.tomada) continue;
        const px = offX + gem.x * T + T / 2, py = offY + gem.y * T + T / 2 + Math.sin(tiempo * 3 + gem.x) * 3;
        g.save(); g.shadowColor = '#ffd166'; g.shadowBlur = 12; g.fillStyle = '#ffd166';
        g.beginPath(); g.moveTo(px, py - 7); g.lineTo(px + 6, py); g.lineTo(px, py + 7); g.lineTo(px - 6, py); g.closePath(); g.fill();
        g.restore();
      }

      // Salidas
      for (const s of salidas) {
        const px = offX + s.x * T, py = offY + s.y * T;
        const col = s.de === 0 ? '#ff4d2e' : '#2ea8ff';
        g.strokeStyle = col; g.lineWidth = 2;
        g.strokeRect(px + 3, py + 3, T - 6, T - 6);
        g.save(); g.globalAlpha = 0.25 + Math.sin(tiempo * 4) * 0.12; g.fillStyle = col;
        g.fillRect(px + 3, py + 3, T - 6, T - 6); g.restore();
      }

      particles.render(g);

      // Héroes: el personaje que cada jugador creó en el menú. El aura sigue
      // siendo del elemento (fuego o agua), que es lo que hay que leer de un
      // vistazo para saber por dónde puede pasar cada uno.
      for (const h of her) {
        const col = h.i === 0 ? '#ff4d2e' : '#2ea8ff';
        const anim = pasoAnimado(h, { vx: h.vx, suelo: h.suelo, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[h.i], h.i), h.x + h.w / 2, h.y + h.h, h.h * 1.5, {
          ...anim,
          acento: col,
          brillo: 14,
          alpha: h.respawn > 0 ? 0.4 + Math.sin(tiempo * 30) * 0.3 : 1,
        });
        if (h.enSalida) {
          g.strokeStyle = '#a8ff3e'; g.lineWidth = 2;
          g.strokeRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
        }
      }

      // HUD
      ctx.engine.text(`Nivel ${nivelIdx + 1}/${NIVELES.length}`, W / 2, 24, { size: 13, color: '#ffffff' });
      ctx.engine.text(`Gemas ${gemasTomadas}/${gemasTotal} · ${tiempo.toFixed(0)}s`, W / 2, 44, {
        size: 11, color: '#ffffff77', font: 'system-ui',
      });
      ctx.engine.text(`Llama · ${players[0].name}`, 16, 24, { size: 11, color: '#ff4d2e', align: 'left', font: 'system-ui' });
      ctx.engine.text(`${players[1].name} · Marea`, W - 16, 24, { size: 11, color: '#2ea8ff', align: 'right', font: 'system-ui' });

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, offY + filas * T + 26, { size: 12.5, color: '#ffd166', font: 'system-ui' });
      }
      ctx.engine.text(
        'Llama muere en el agua · Marea muere en la lava · el ácido mata a los dos · las puertas piden las dos placas',
        W / 2, H - 14, { size: 10, color: '#ffffff44', font: 'system-ui' }
      );
    },

    destroy() {},
  };
}
