/**
 * Sombra y Luz — plataformas de coordinación con la luz como enemigo común.
 *
 * El giro respecto a Llama y Marea: aquí los dos se estorban a propósito.
 * Luz MUERE en la oscuridad, así que necesita lámparas encendidas. Sombra
 * MUERE en la luz, así que necesita esas mismas lámparas apagadas. Como las
 * lámparas se conmutan pisando las placas, avanzar significa turnarse: uno
 * cruza mientras el otro le apaga (o le enciende) el camino, y luego al revés.
 *
 * No pueden avanzar a la vez por el mismo sitio, y esa es justo la gracia.
 *
 * Formato de nivel (mapas de texto, igual que 81-llama-y-marea):
 *   #  muro            .  vacío
 *   L  lámpara         X  abismo (mata a los dos)
 *   a  placa de Luz    b  placa de Sombra   (conmutan TODAS las lámparas)
 *   1  salida de Luz   2  salida de Sombra
 *   g  gema            p  inicio de Luz     q  inicio de Sombra
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

let T = 34;                      // lado de celda; medir() lo ajusta a la ventana
const GRAV = 1750;
const VEL = 190;
const SALTO = 545;
const RADIO_LUZ = 2.6;          // en celdas, alcance de cada lámpara
const GRACIA = 0.45;            // segundos que aguantas en el medio equivocado

const NIVELES = [
  [
    '####################',
    '#p................q#',
    '#..g............g..#',
    '#....####..####....#',
    '#.......L..L.......#',
    '#..................#',
    '#..a............b..#',
    '####################',
    '#..................#',
    '#..1............2..#',
    '####################',
  ],
  [
    '####################',
    '#p.......L........q#',
    '####..........######',
    '#....g......g......#',
    '#..a....####....b..#',
    '#####..........#####',
    '#.......L..L.......#',
    '#..#....XXXX....#..#',
    '#..1............2..#',
    '####################',
  ],
  [
    '####################',
    '#p....L.....L.....q#',
    '#..#################',
    '#..a..........b....#',
    '#####..######..#####',
    '#....g..L..g.......#',
    '#..#....####....#..#',
    '#..#.XX......XX.#..#',
    '#..1............2..#',
    '####################',
  ],
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let nivelIdx = 0;
  let mapa = [], cols = 0, filas = 0, offX = 0, offY = 0;
  let lamparas = [], placas = [], gemas = [], salidas = [];
  let encendidas = true;          // estado global de las lámparas
  let gemasTomadas = 0, gemasTotal = 0;
  const muertes = [0, 0];
  let tiempo = 0;
  let estado = 'jugando';         // jugando | pasando | fin
  let pausa = 0;
  let aviso = '', avisoT = 0;

  const her = [crearHeroe(0), crearHeroe(1)];

  function crearHeroe(i) {
    return {
      i, x: 0, y: 0, vx: 0, vy: 0, w: T * 0.62, h: T * 0.86,
      suelo: false, enSalida: false, respawn: 0, sx: 0, sy: 0,
      // Cuánto tiempo lleva en el medio que lo mata (0 = a salvo)
      riesgo: 0,
    };
  }

  function cargarNivel() {
    const src = NIVELES[nivelIdx];
    filas = src.length; cols = src[0].length;
    mapa = src.map((f) => f.split(''));
    lamparas = []; placas = []; gemas = []; salidas = [];
    encendidas = true;
    gemasTomadas = 0; gemasTotal = 0;

    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        const c = mapa[y][x];
        if (c === 'L') lamparas.push({ x, y });
        else if (c === 'a') placas.push({ x, y, de: 0 });
        else if (c === 'b') placas.push({ x, y, de: 1 });
        else if (c === 'g') { gemas.push({ x, y, tomada: false }); gemasTotal++; }
        else if (c === '1') salidas.push({ x, y, de: 0 });
        else if (c === '2') salidas.push({ x, y, de: 1 });
        else if (c === 'p') { her[0].sx = x; her[0].sy = y; }
        else if (c === 'q') { her[1].sx = x; her[1].sy = y; }
      }
    }
    // Medir antes de colocar: `reaparecer` traduce celda → píxel con el
    // encuadre, y hacerlo al revés deja a los héroes fuera del mapa.
    medir();
    for (const h of her) reaparecer(h, true);
    decir(`Nivel ${nivelIdx + 1} de ${NIVELES.length} · lámparas ${encendidas ? 'encendidas' : 'apagadas'}`);
  }

  /** Encaja el nivel en la ventana: con lado fijo se salía por los costados. */
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

  const decir = (t) => { aviso = t; avisoT = 2.6; };

  function reaparecer(h, silencioso = false) {
    h.x = offX + h.sx * T + (T - h.w) / 2;
    h.y = offY + h.sy * T + (T - h.h);
    h.vx = h.vy = 0;
    h.riesgo = 0;
    h.respawn = silencioso ? 0 : 0.45;
  }

  const celdaEn = (px, py) => {
    const cx = Math.floor((px - offX) / T), cy = Math.floor((py - offY) / T);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= filas) return '#';
    return mapa[cy][cx];
  };

  const solido = (c) => c === '#';

  function colisionaCaja(h, nx, ny) {
    const pts = [
      [nx, ny], [nx + h.w, ny], [nx, ny + h.h], [nx + h.w, ny + h.h],
      [nx + h.w / 2, ny], [nx + h.w / 2, ny + h.h],
    ];
    return pts.some(([px, py]) => solido(celdaEn(px, py)));
  }

  /** Intensidad de luz (0..1) en una posición del mundo. */
  function luzEn(px, py) {
    if (!encendidas) return 0;
    let mejor = 0;
    for (const l of lamparas) {
      const lx = offX + l.x * T + T / 2, ly = offY + l.y * T + T / 2;
      const d = Math.hypot(px - lx, py - ly) / T;
      mejor = Math.max(mejor, clamp(1 - d / RADIO_LUZ, 0, 1));
    }
    return mejor;
  }

  function morir(h, motivo) {
    muertes[h.i]++;
    particles.burst(h.x + h.w / 2, h.y + h.h / 2, 20, {
      speed: 190, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: h.i === 0 ? '#ffd166' : '#7b5cff', size: 3, shape: 'spark', drag: 0.92,
    });
    audio.explosion();
    haptics.explosion(h.i);
    ctx.shake(5, 7);
    reaparecer(h);
    decir(`${players[h.i].name}: ${motivo}`);
  }

  function conmutar(quien) {
    encendidas = !encendidas;
    audio.tone({ freq: encendidas ? 560 : 220, dur: 0.14, gain: 0.14, type: 'triangle' });
    haptics.play('impact', { player: quien });
    for (const l of lamparas) {
      particles.burst(offX + l.x * T + T / 2, offY + l.y * T + T / 2, 8, {
        speed: 110, dir: -Math.PI / 2, spread: Math.PI * 2,
        color: encendidas ? '#ffd166' : '#3a3550', size: 2.2, drag: 0.91,
      });
    }
    decir(encendidas ? 'Lámparas ENCENDIDAS' : 'Lámparas APAGADAS');
  }

  function mover(h, dt) {
    if (h.respawn > 0) { h.respawn -= dt; return; }
    const p = input.player(h.i);
    const dir = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    h.vx = dir * VEL;

    if (p.pressed('a') && h.suelo) {
      h.vy = -SALTO;
      h.suelo = false;
      audio.tone({ freq: h.i === 0 ? 400 : 290, dur: 0.07, gain: 0.13, type: 'square', sweep: 170 });
      haptics.play('tap', { player: h.i });
    }

    h.vy = Math.min(h.vy + GRAV * dt, 900);

    let nx = h.x + h.vx * dt;
    if (!colisionaCaja(h, nx, h.y)) h.x = nx; else h.vx = 0;

    let ny = h.y + h.vy * dt;
    if (!colisionaCaja(h, h.x, ny)) { h.y = ny; h.suelo = false; }
    else { if (h.vy > 0) h.suelo = true; h.vy = 0; }

    const cx = h.x + h.w / 2, cy = h.y + h.h * 0.6;

    // Abismo: mata a los dos por igual
    if (celdaEn(cx, h.y + h.h * 0.8) === 'X') { morir(h, 'cayó al abismo'); return; }

    // El medio: Luz necesita luz, Sombra necesita oscuridad.
    const luz = luzEn(cx, cy);
    const enPeligro = h.i === 0 ? luz < 0.12 : luz > 0.42;
    if (enPeligro) {
      h.riesgo += dt;
      if (h.riesgo >= GRACIA) {
        morir(h, h.i === 0 ? 'se apagó en la oscuridad' : 'se disolvió en la luz');
        return;
      }
    } else {
      h.riesgo = Math.max(0, h.riesgo - dt * 2);
    }

    // Placas: conmutan las lámparas al pisarlas (con un pequeño rearme)
    for (const pl of placas) {
      if (pl.de !== h.i) continue;
      const px = offX + pl.x * T + T / 2, py = offY + pl.y * T + T / 2;
      const encima = Math.abs(cx - px) < T * 0.6 && Math.abs(h.y + h.h - py) < T * 0.85;
      if (encima && !pl.pisada) { pl.pisada = true; conmutar(h.i); }
      else if (!encima) pl.pisada = false;
    }

    for (const g of gemas) {
      if (g.tomada) continue;
      const gx = offX + g.x * T + T / 2, gy = offY + g.y * T + T / 2;
      if (Math.abs(gx - cx) < T * 0.6 && Math.abs(gy - (h.y + h.h / 2)) < T * 0.6) {
        g.tomada = true; gemasTomadas++;
        audio.blip();
        haptics.play('soft', { player: h.i });
        particles.burst(gx, gy, 10, { speed: 130, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#a8ff3e', size: 2.2, drag: 0.91 });
      }
    }

    h.enSalida = salidas.some((s) => s.de === h.i &&
      Math.abs(offX + s.x * T + T / 2 - cx) < T * 0.62 &&
      Math.abs(offY + s.y * T + T / 2 - (h.y + h.h / 2)) < T * 0.7);
  }

  return {
    init() { medir(); cargarNivel(); },
    /** El mapa se recentra y reescala; los héroes conservan su celda. */
    resize(w, h) {
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
              detail: `${NIVELES.length} niveles en ${tiempo.toFixed(0)}s · ${muertes[0] + muertes[1]} caídas`,
              record: ctx.record('tiempo', Math.round(tiempo), 'low'),
            });
          } else { estado = 'jugando'; cargarNivel(); }
        }
        return;
      }

      tiempo += dt;
      if (avisoT > 0) avisoT -= dt;
      for (const h of her) mover(h, dt);
      particles.update(dt);

      if (her[0].enSalida && her[1].enSalida) {
        estado = 'pasando';
        pausa = 1.2;
        audio.win();
        haptics.play('victory');
        decir('¡Los dos fuera!');
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07060d');

      // Muros y abismos
      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const c = mapa[y][x];
          const px = offX + x * T, py = offY + y * T;
          if (c === '#') {
            g.fillStyle = '#2e2a42'; g.fillRect(px, py, T, T);
            g.fillStyle = '#3c3757'; g.fillRect(px, py, T, 3);
          } else if (c === 'X') {
            g.fillStyle = '#120a16'; g.fillRect(px, py, T, T);
            g.strokeStyle = '#ff2e5b66'; g.lineWidth = 2;
            g.beginPath(); g.moveTo(px, py); g.lineTo(px + T, py); g.stroke();
          }
        }
      }

      // Halos de luz (lo que define quién puede estar dónde)
      if (encendidas) {
        for (const l of lamparas) {
          const lx = offX + l.x * T + T / 2, ly = offY + l.y * T + T / 2;
          const r = RADIO_LUZ * T;
          const grd = g.createRadialGradient(lx, ly, 0, lx, ly, r);
          grd.addColorStop(0, 'rgba(255,209,102,0.32)');
          grd.addColorStop(0.55, 'rgba(255,209,102,0.13)');
          grd.addColorStop(1, 'rgba(255,209,102,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(lx, ly, r, 0, Math.PI * 2); g.fill();
        }
      }

      // Lámparas
      for (const l of lamparas) {
        const px = offX + l.x * T + T / 2, py = offY + l.y * T + T / 2;
        g.save();
        if (encendidas) { g.shadowColor = '#ffd166'; g.shadowBlur = 18; }
        g.fillStyle = encendidas ? '#ffd166' : '#4a4460';
        g.beginPath(); g.arc(px, py, T * 0.22, 0, Math.PI * 2); g.fill();
        g.restore();
        g.fillStyle = '#6b5a3a';
        g.fillRect(px - 2, py - T * 0.5, 4, T * 0.28);
      }

      // Placas
      for (const pl of placas) {
        const px = offX + pl.x * T, py = offY + pl.y * T;
        const col = pl.de === 0 ? '#ffd166' : '#7b5cff';
        g.fillStyle = pl.pisada ? col : col + '55';
        g.fillRect(px + 4, py + T - (pl.pisada ? 5 : 9), T - 8, pl.pisada ? 5 : 9);
      }

      // Gemas
      for (const gem of gemas) {
        if (gem.tomada) continue;
        const px = offX + gem.x * T + T / 2;
        const py = offY + gem.y * T + T / 2 + Math.sin(tiempo * 3 + gem.x) * 3;
        g.save(); g.shadowColor = '#a8ff3e'; g.shadowBlur = 12; g.fillStyle = '#a8ff3e';
        g.beginPath(); g.moveTo(px, py - 7); g.lineTo(px + 6, py); g.lineTo(px, py + 7); g.lineTo(px - 6, py); g.closePath(); g.fill();
        g.restore();
      }

      // Salidas
      for (const s of salidas) {
        const px = offX + s.x * T, py = offY + s.y * T;
        const col = s.de === 0 ? '#ffd166' : '#7b5cff';
        g.strokeStyle = col; g.lineWidth = 2;
        g.strokeRect(px + 3, py + 3, T - 6, T - 6);
        g.save(); g.globalAlpha = 0.22 + Math.sin(tiempo * 4) * 0.12; g.fillStyle = col;
        g.fillRect(px + 3, py + 3, T - 6, T - 6); g.restore();
      }

      particles.render(g);

      // Héroes: el personaje creado por cada jugador, con el aura de su
      // elemento (luz dorada o sombra violeta) para saber de un vistazo
      // en qué mitad del nivel sobrevive cada uno.
      for (const h of her) {
        const col = h.i === 0 ? '#ffd166' : '#7b5cff';
        g.save();
        const anim = pasoAnimado(h, { vx: h.vx, suelo: h.suelo, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[h.i], h.i), h.x + h.w / 2, h.y + h.h, h.h * 1.5, {
          ...anim,
          acento: col,
          brillo: h.i === 0 ? 22 : 10,
          alpha: h.respawn > 0 ? 0.4 + Math.sin(tiempo * 30) * 0.3 : 1,
        });

        // Aviso de que está en el medio equivocado: se va poniendo rojo
        if (h.riesgo > 0.04) {
          const f = clamp(h.riesgo / GRACIA, 0, 1);
          g.strokeStyle = `rgba(255,46,91,${0.4 + f * 0.6})`;
          g.lineWidth = 2 + f * 2;
          g.strokeRect(h.x - 3, h.y - 3, h.w + 6, h.h + 6);
        }
        if (h.enSalida) {
          g.strokeStyle = '#a8ff3e'; g.lineWidth = 2;
          g.strokeRect(h.x - 5, h.y - 5, h.w + 10, h.h + 10);
        }
        g.restore();
      }

      // HUD
      ctx.engine.text(`Nivel ${nivelIdx + 1}/${NIVELES.length}`, W / 2, 24, { size: 13, color: '#ffffff' });
      ctx.engine.text(
        `Lámparas ${encendidas ? 'ENCENDIDAS' : 'APAGADAS'} · gemas ${gemasTomadas}/${gemasTotal} · ${tiempo.toFixed(0)}s`,
        W / 2, 44, { size: 11, color: encendidas ? '#ffd166' : '#7b5cff', font: 'system-ui' }
      );
      ctx.engine.text(`Luz · ${players[0].name}`, 16, 24, { size: 11, color: '#ffd166', align: 'left', font: 'system-ui' });
      ctx.engine.text(`${players[1].name} · Sombra`, W - 16, 24, { size: 11, color: '#7b5cff', align: 'right', font: 'system-ui' });

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, offY + filas * T + 26, { size: 12.5, color: '#ffd166', font: 'system-ui' });
      }
      ctx.engine.text(
        'Luz muere a oscuras · Sombra muere en la luz · las placas conmutan TODAS las lámparas',
        W / 2, H - 14, { size: 10, color: '#ffffff44', font: 'system-ui' }
      );
    },

    destroy() {},
  };
}
