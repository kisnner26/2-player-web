/**
 * Peso y Pluma — plataformas de coordinación por masa.
 *
 * Aquí no hay elementos que maten: lo que separa a los dos es cuánto pesan.
 * Peso rompe los suelos frágiles, hunde las placas duras y el viento le da
 * igual; Pluma salta altísimo, planea y los ventiladores la lanzan, pero no
 * puede activar nada pesado y el agua la arrastra.
 *
 * Cada uno abre camino para el otro con lo que el otro no puede hacer: Peso
 * rompe el suelo para que Pluma baje, Pluma sube por el aire para pulsar el
 * botón que le abre la puerta a Peso.
 *
 * Formato de nivel:
 *   #  muro           .  vacío
 *   f  suelo frágil (Peso lo rompe, Pluma lo aguanta)
 *   v  ventilador (empuja hacia arriba; a Pluma mucho, a Peso casi nada)
 *   A  agua (Pluma se ahoga, Peso camina por el fondo)
 *   X  pinchos (matan a los dos)
 *   a  placa pesada (solo Peso)      b  botón ligero (solo Pluma)
 *   =  puerta (necesita las dos)
 *   1  salida de Peso   2  salida de Pluma
 *   g  gema             p  inicio de Peso   q  inicio de Pluma
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

let T = 34;                      // lado de celda; medir() lo ajusta a la ventana
const GRAV = 1800;
const VEL = 185;

const NIVELES = [
  [
    '####################',
    '#p................q#',
    '#..g..........g....#',
    '#####ffff###########',
    '#..................#',
    '#....v........v....#',
    '#..a............b..#',
    '#..####======####..#',
    '#..................#',
    '#..1............2..#',
    '####################',
  ],
  [
    '####################',
    '#p...........g....q#',
    '####fff####........#',
    '#........#....v....#',
    '#..g.....#.........#',
    '#..###...####ffff###',
    '#....v.........b...#',
    '#..a....XX.....#####',
    '#..#####AAAA#......#',
    '#..1....AAAA....2..#',
    '####################',
  ],
  [
    '####################',
    '#p....b...........q#',
    '#..####ffff####....#',
    '#..#....v.....#..g.#',
    '#..#.g........#.####',
    '#..######ff####....#',
    '#.......v.......v..#',
    '#..a###......###...#',
    '#..#..XX.AAAA.XX#..#',
    '#..1..........2....#',
    '####################',
  ],
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let nivelIdx = 0;
  let mapa = [], cols = 0, filas = 0, offX = 0, offY = 0;
  let fragiles = [], vientos = [], placas = [], puertas = [], gemas = [], salidas = [];
  let abierto = false;
  let gemasTomadas = 0, gemasTotal = 0;
  const muertes = [0, 0];
  let tiempo = 0;
  let estado = 'jugando';
  let pausa = 0;
  let aviso = '', avisoT = 0;

  // 0 = Peso (pesado, salto corto), 1 = Pluma (ligera, salto alto y planeo)
  const her = [crearHeroe(0), crearHeroe(1)];

  function crearHeroe(i) {
    const pesado = i === 0;
    return {
      i, pesado,
      x: 0, y: 0, vx: 0, vy: 0,
      w: pesado ? T * 0.74 : T * 0.5,
      h: pesado ? T * 0.9 : T * 0.7,
      salto: pesado ? 460 : 660,
      suelo: false, enSalida: false, respawn: 0, sx: 0, sy: 0,
      planea: false,
    };
  }

  function cargarNivel() {
    const src = NIVELES[nivelIdx];
    filas = src.length; cols = src[0].length;
    mapa = src.map((f) => f.split(''));
    fragiles = []; vientos = []; placas = []; puertas = []; gemas = []; salidas = [];
    abierto = false; gemasTomadas = 0; gemasTotal = 0;

    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        const c = mapa[y][x];
        if (c === 'f') fragiles.push({ x, y, vida: 1, roto: false });
        else if (c === 'v') vientos.push({ x, y });
        else if (c === 'a') placas.push({ x, y, de: 0, on: false });
        else if (c === 'b') placas.push({ x, y, de: 1, on: false });
        else if (c === '=') puertas.push({ x, y });
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
    decir(`Nivel ${nivelIdx + 1} de ${NIVELES.length}`);
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
    h.respawn = silencioso ? 0 : 0.45;
  }

  const idx = (px, py) => [Math.floor((px - offX) / T), Math.floor((py - offY) / T)];
  const celdaEn = (px, py) => {
    const [cx, cy] = idx(px, py);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= filas) return '#';
    return mapa[cy][cx];
  };

  const fragilEn = (cx, cy) => fragiles.find((f) => f.x === cx && f.y === cy);

  /** ¿Bloquea el paso? Los frágiles rotos dejan de hacerlo. */
  function solido(px, py) {
    const c = celdaEn(px, py);
    if (c === '#') return true;
    if (c === '=') return !abierto;
    if (c === 'f') {
      const [cx, cy] = idx(px, py);
      const f = fragilEn(cx, cy);
      return f ? !f.roto : true;
    }
    return false;
  }

  function colisionaCaja(h, nx, ny) {
    const pts = [
      [nx, ny], [nx + h.w, ny], [nx, ny + h.h], [nx + h.w, ny + h.h],
      [nx + h.w / 2, ny], [nx + h.w / 2, ny + h.h],
    ];
    return pts.some(([px, py]) => solido(px, py));
  }

  function morir(h, motivo) {
    muertes[h.i]++;
    particles.burst(h.x + h.w / 2, h.y + h.h / 2, 20, {
      speed: 190, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: h.i === 0 ? '#c98a3a' : '#9ad8ff', size: 3, shape: 'spark', drag: 0.92,
    });
    audio.explosion();
    haptics.explosion(h.i);
    ctx.shake(h.pesado ? 7 : 4, 7);
    reaparecer(h);
    decir(`${players[h.i].name}: ${motivo}`);
  }

  function mover(h, dt) {
    if (h.respawn > 0) { h.respawn -= dt; return; }
    const p = input.player(h.i);
    const dir = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
    h.vx = dir * VEL * (h.pesado ? 0.86 : 1.1);

    if (p.pressed('a') && h.suelo) {
      h.vy = -h.salto;
      h.suelo = false;
      audio.tone({ freq: h.pesado ? 200 : 520, dur: 0.08, gain: 0.13, type: 'square', sweep: h.pesado ? 90 : 220 });
      haptics.play('tap', { player: h.i });
    }

    // Pluma planea manteniendo el botón en el aire; Peso cae como una piedra.
    h.planea = !h.pesado && p.held('a') && h.vy > 0;
    const gravedad = h.pesado ? GRAV * 1.25 : (h.planea ? GRAV * 0.22 : GRAV * 0.8);
    h.vy = Math.min(h.vy + gravedad * dt, h.planea ? 130 : 900);

    // Viento de los ventiladores (columna hacia arriba)
    const cx = h.x + h.w / 2;
    for (const v of vientos) {
      const vx = offX + v.x * T + T / 2;
      const vy = offY + v.y * T;
      const dentroX = Math.abs(cx - vx) < T * 0.62;
      const encima = h.y + h.h <= vy + T * 0.5 && h.y + h.h > vy - T * 5.5;
      if (dentroX && encima) {
        h.vy -= (h.pesado ? 480 : 2600) * dt;
        if (!h.pesado && Math.random() < 0.25) {
          particles.burst(vx, vy, 1, { speed: 60, dir: -Math.PI / 2, spread: 0.5, color: '#9ad8ff88', size: 1.8, drag: 0.95 });
        }
      }
    }

    let nx = h.x + h.vx * dt;
    if (!colisionaCaja(h, nx, h.y)) h.x = nx; else h.vx = 0;

    let ny = h.y + h.vy * dt;
    if (!colisionaCaja(h, h.x, ny)) { h.y = ny; h.suelo = false; }
    else { if (h.vy > 0) h.suelo = true; h.vy = 0; }

    const pieY = h.y + h.h + 2;

    // Suelos frágiles: solo Peso los rompe, y con un instante de margen.
    if (h.pesado && h.suelo) {
      const [fx, fy] = idx(cx, pieY);
      const f = fragilEn(fx, fy);
      if (f && !f.roto) {
        f.vida -= dt * 1.9;
        if (f.vida <= 0) {
          f.roto = true;
          audio.tone({ freq: 130, dur: 0.16, gain: 0.15, type: 'sawtooth' });
          haptics.play('impact', { player: 0 });
          ctx.shake(4, 5);
          particles.burst(offX + f.x * T + T / 2, offY + f.y * T + T / 2, 14, {
            speed: 160, dir: Math.PI / 2, spread: Math.PI, color: '#8a6a3a', size: 2.6, drag: 0.92,
          });
          decir('El suelo cedió bajo Peso');
        }
      }
    }

    const cyCuerpo = h.y + h.h * 0.6;
    const bajo = celdaEn(cx, cyCuerpo);

    if (bajo === 'X') { morir(h, 'pinchos'); return; }
    // Agua: Pluma se ahoga, Peso camina por el fondo.
    if (bajo === 'A') {
      if (!h.pesado) { morir(h, 'se ahogó'); return; }
      h.vy = Math.min(h.vy, 60);
      h.vx *= 0.62;
    }

    // Placas: la pesada solo la hunde Peso; el botón ligero solo Pluma.
    for (const pl of placas) {
      const px = offX + pl.x * T + T / 2, py = offY + pl.y * T + T / 2;
      const encima = Math.abs(cx - px) < T * 0.62 && Math.abs(h.y + h.h - py) < T * 0.9;
      if (encima && pl.de === h.i) pl.on = true;
    }

    for (const g of gemas) {
      if (g.tomada) continue;
      const gx = offX + g.x * T + T / 2, gy = offY + g.y * T + T / 2;
      if (Math.abs(gx - cx) < T * 0.62 && Math.abs(gy - (h.y + h.h / 2)) < T * 0.62) {
        g.tomada = true; gemasTomadas++;
        audio.blip();
        haptics.play('soft', { player: h.i });
        particles.burst(gx, gy, 10, { speed: 130, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ffd166', size: 2.2, drag: 0.91 });
      }
    }

    h.enSalida = salidas.some((s) => s.de === h.i &&
      Math.abs(offX + s.x * T + T / 2 - cx) < T * 0.62 &&
      Math.abs(offY + s.y * T + T / 2 - (h.y + h.h / 2)) < T * 0.72);
  }

  function actualizarPuertas() {
    const antes = abierto;
    for (const pl of placas) pl.on = false;
    for (const h of her) {
      if (h.respawn > 0) continue;
      const cx = h.x + h.w / 2;
      for (const pl of placas) {
        if (pl.de !== h.i) continue;
        const px = offX + pl.x * T + T / 2, py = offY + pl.y * T + T / 2;
        if (Math.abs(cx - px) < T * 0.62 && Math.abs(h.y + h.h - py) < T * 0.9) pl.on = true;
      }
    }
    abierto = placas.length > 0 && placas.every((p) => p.on);
    if (abierto !== antes) {
      audio.tone({ freq: abierto ? 520 : 250, dur: 0.13, gain: 0.14, type: 'triangle' });
      if (abierto) decir('¡Puertas abiertas!');
    }
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
      actualizarPuertas();
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
      ctx.engine.clear('#0a0c10');

      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const c = mapa[y][x];
          const px = offX + x * T, py = offY + y * T;
          if (c === '#') {
            g.fillStyle = '#333a46'; g.fillRect(px, py, T, T);
            g.fillStyle = '#414a59'; g.fillRect(px, py, T, 3);
          } else if (c === 'A') {
            g.fillStyle = '#12446e88'; g.fillRect(px, py, T, T);
            g.fillStyle = '#2ea8ff';
            const ola = Math.sin(tiempo * 3 + x * 0.8) * 2.5;
            g.fillRect(px, py + 4 + ola, T, 3);
          } else if (c === 'X') {
            g.fillStyle = '#ff2e5b';
            for (let k = 0; k < 3; k++) {
              g.beginPath();
              g.moveTo(px + k * T / 3, py + T);
              g.lineTo(px + k * T / 3 + T / 6, py + T * 0.45);
              g.lineTo(px + (k + 1) * T / 3, py + T);
              g.closePath(); g.fill();
            }
          }
        }
      }

      // Suelos frágiles
      for (const f of fragiles) {
        if (f.roto) continue;
        const px = offX + f.x * T, py = offY + f.y * T;
        const desgaste = 1 - clamp(f.vida, 0, 1);
        g.fillStyle = '#8a6a3a'; g.fillRect(px, py, T, T);
        g.strokeStyle = `rgba(20,10,0,${0.3 + desgaste * 0.6})`;
        g.lineWidth = 1 + desgaste * 2;
        g.beginPath();
        g.moveTo(px + 4, py + T * 0.3); g.lineTo(px + T * 0.55, py + T * 0.6); g.lineTo(px + T - 4, py + T * 0.35);
        g.stroke();
      }

      // Ventiladores y su columna de aire
      for (const v of vientos) {
        const px = offX + v.x * T, py = offY + v.y * T;
        g.save();
        g.globalAlpha = 0.14;
        const grd = g.createLinearGradient(0, py, 0, py - T * 5);
        grd.addColorStop(0, '#9ad8ff'); grd.addColorStop(1, 'rgba(154,216,255,0)');
        g.fillStyle = grd;
        g.fillRect(px + 3, py - T * 5, T - 6, T * 5);
        g.restore();
        g.fillStyle = '#5a7a92'; g.fillRect(px + 3, py + T * 0.55, T - 6, T * 0.4);
        g.strokeStyle = '#9ad8ff'; g.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const oy = py + T * 0.4 - ((tiempo * 90 + k * 26) % (T * 1.6));
          g.globalAlpha = 0.55;
          g.beginPath(); g.moveTo(px + 8, oy); g.lineTo(px + T - 8, oy); g.stroke();
        }
        g.globalAlpha = 1;
      }

      // Puertas
      for (const d of puertas) {
        const px = offX + d.x * T, py = offY + d.y * T;
        if (abierto) { g.fillStyle = '#ffd16633'; g.fillRect(px, py, T, 5); }
        else {
          g.fillStyle = '#7a6a4a'; g.fillRect(px, py, T, T);
          g.fillStyle = '#ffd166'; g.fillRect(px + 2, py + 2, T - 4, 4);
          g.fillRect(px + 2, py + T - 6, T - 4, 4);
        }
      }

      // Placas: la pesada es ancha y baja; el botón ligero es pequeño
      for (const pl of placas) {
        const px = offX + pl.x * T, py = offY + pl.y * T;
        const col = pl.de === 0 ? '#c98a3a' : '#9ad8ff';
        g.fillStyle = pl.on ? col : col + '55';
        if (pl.de === 0) g.fillRect(px + 2, py + T - (pl.on ? 6 : 10), T - 4, pl.on ? 6 : 10);
        else {
          g.beginPath();
          g.arc(px + T / 2, py + T - (pl.on ? 5 : 8), T * 0.24, Math.PI, 0);
          g.fill();
        }
        if (pl.on) { g.save(); g.shadowColor = col; g.shadowBlur = 14; g.fillRect(px + 4, py + T - 5, T - 8, 4); g.restore(); }
      }

      for (const gem of gemas) {
        if (gem.tomada) continue;
        const px = offX + gem.x * T + T / 2;
        const py = offY + gem.y * T + T / 2 + Math.sin(tiempo * 3 + gem.x) * 3;
        g.save(); g.shadowColor = '#ffd166'; g.shadowBlur = 12; g.fillStyle = '#ffd166';
        g.beginPath(); g.moveTo(px, py - 7); g.lineTo(px + 6, py); g.lineTo(px, py + 7); g.lineTo(px - 6, py); g.closePath(); g.fill();
        g.restore();
      }

      for (const s of salidas) {
        const px = offX + s.x * T, py = offY + s.y * T;
        const col = s.de === 0 ? '#c98a3a' : '#9ad8ff';
        g.strokeStyle = col; g.lineWidth = 2;
        g.strokeRect(px + 3, py + 3, T - 6, T - 6);
        g.save(); g.globalAlpha = 0.22 + Math.sin(tiempo * 4) * 0.12; g.fillStyle = col;
        g.fillRect(px + 3, py + 3, T - 6, T - 6); g.restore();
      }

      particles.render(g);

      // Héroes: Peso es un bloque ancho, Pluma una forma pequeña y redondeada
      for (const h of her) {
        const col = h.pesado ? '#c98a3a' : '#9ad8ff';
        g.save();
        // Peso se dibuja más bajo y ancho que Pluma: la silueta tiene que
        // decir quién rompe suelos y quién planea, aunque los dos personajes
        // los haya creado el mismo jugador.
        const anim = pasoAnimado(h, { vx: h.vx, suelo: h.suelo, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[h.i], h.i), h.x + h.w / 2, h.y + h.h,
          h.h * (h.pesado ? 1.35 : 1.55), {
            ...anim,
            acento: col,
            brillo: 14,
            alpha: h.respawn > 0 ? 0.4 + Math.sin(tiempo * 30) * 0.3 : 1,
          });
        // Alitas de planeo
        if (h.planea) {
          g.strokeStyle = '#9ad8ff'; g.lineWidth = 2;
          g.beginPath();
          g.arc(h.x - 4, h.y + h.h * 0.35, 7, Math.PI * 0.4, Math.PI * 1.3);
          g.arc(h.x + h.w + 4, h.y + h.h * 0.35, 7, -Math.PI * 0.3, Math.PI * 0.6);
          g.stroke();
        }
        if (h.enSalida) {
          g.strokeStyle = '#a8ff3e'; g.lineWidth = 2;
          g.strokeRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);
        }
        g.restore();
      }

      ctx.engine.text(`Nivel ${nivelIdx + 1}/${NIVELES.length}`, W / 2, 24, { size: 13, color: '#ffffff' });
      ctx.engine.text(`Gemas ${gemasTomadas}/${gemasTotal} · ${tiempo.toFixed(0)}s`, W / 2, 44, {
        size: 11, color: '#ffffff77', font: 'system-ui',
      });
      ctx.engine.text(`Peso · ${players[0].name}`, 16, 24, { size: 11, color: '#c98a3a', align: 'left', font: 'system-ui' });
      ctx.engine.text(`${players[1].name} · Pluma`, W - 16, 24, { size: 11, color: '#9ad8ff', align: 'right', font: 'system-ui' });

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, offY + filas * T + 26, { size: 12.5, color: '#ffd166', font: 'system-ui' });
      }
      ctx.engine.text(
        'Peso rompe suelos y hunde placas · Pluma salta alto, planea (mantén salto) y vuela con el viento · Pluma se ahoga',
        W / 2, H - 14, { size: 10, color: '#ffffff44', font: 'system-ui' }
      );
    },

    destroy() {},
  };
}
