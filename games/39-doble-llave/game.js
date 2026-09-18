/**
 * Doble Llave — puzles de plataformas donde nadie avanza solo.
 *
 * Las palancas están cruzadas a propósito: la que pisa el jugador 1 abre la
 * puerta del jugador 2 y viceversa. Los dos tienen que llegar a su salida a la
 * vez, así que el que ya llegó tiene que volver a ayudar.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const GRAV = 1900;
const VEL = 250;
const SALTO = 620;
const ANCHO = 22, ALTO = 30;

/**
 * Formato de nivel en coordenadas relativas (0..1) para que escale con la
 * ventana. `placa.abre` indica a qué puerta afecta (por índice de jugador).
 */
const NIVELES = [
  {
    nombre: 'Confianza',
    plataformas: [
      [0, 0.92, 1, 0.08], [0.0, 0.62, 0.28, 0.03], [0.72, 0.62, 0.28, 0.03],
      [0.38, 0.75, 0.24, 0.03],
    ],
    placas: [{ x: 0.12, y: 0.62, abre: 1 }, { x: 0.84, y: 0.62, abre: 0 }],
    puertas: [{ x: 0.06, y: 0.92 }, { x: 0.9, y: 0.92 }],
    inicio: [[0.3, 0.9], [0.66, 0.9]],
  },
  {
    nombre: 'Relevo',
    plataformas: [
      [0, 0.92, 1, 0.08], [0.16, 0.72, 0.2, 0.03], [0.64, 0.72, 0.2, 0.03],
      [0.4, 0.55, 0.2, 0.03], [0, 0.4, 0.22, 0.03], [0.78, 0.4, 0.22, 0.03],
    ],
    placas: [
      { x: 0.1, y: 0.4, abre: 1 }, { x: 0.88, y: 0.4, abre: 0 },
      { x: 0.5, y: 0.55, abre: 2 },
    ],
    puertas: [{ x: 0.05, y: 0.92 }, { x: 0.92, y: 0.92 }],
    inicio: [[0.34, 0.9], [0.62, 0.9]],
  },
  {
    nombre: 'Escalera',
    plataformas: [
      [0, 0.92, 1, 0.08], [0.1, 0.78, 0.16, 0.03], [0.36, 0.66, 0.16, 0.03],
      [0.62, 0.54, 0.16, 0.03], [0.84, 0.42, 0.16, 0.03], [0, 0.42, 0.14, 0.03],
      [0.3, 0.36, 0.2, 0.03],
    ],
    placas: [
      { x: 0.07, y: 0.42, abre: 1 }, { x: 0.9, y: 0.42, abre: 0 },
      { x: 0.4, y: 0.36, abre: 2 },
    ],
    puertas: [{ x: 0.04, y: 0.92 }, { x: 0.94, y: 0.92 }],
    inicio: [[0.2, 0.9], [0.76, 0.9]],
  },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let nivel = 0;
  let plataformas = [], placas = [], puertas = [];
  const jug = [personaje(0), personaje(1)];
  let sb = null, pausa = 0, tiempoTotal = 0, terminado = false;

  function personaje(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, enSuelo: false, enMeta: false, cara: 1 };
  }

  function cargar() {
    const L = NIVELES[nivel];
    plataformas = L.plataformas.map(([x, y, w, h]) => ({ x: x * W, y: y * H, w: w * W, h: h * H }));
    placas = L.placas.map((p) => ({ x: p.x * W, y: p.y * H, abre: p.abre, pisada: false }));
    puertas = L.puertas.map((p, i) => ({ x: p.x * W, y: p.y * H, abierta: false, jugador: i }));
    for (let i = 0; i < 2; i++) {
      jug[i].x = L.inicio[i][0] * W;
      jug[i].y = L.inicio[i][1] * H;
      jug[i].vx = jug[i].vy = 0;
      jug[i].enMeta = false;
    }
    ui.banner(`Nivel ${nivel + 1}: <b>${L.nombre}</b>`);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      cargar();
      sb = ui.scoreboard({ center: `nivel 1 / ${NIVELES.length}` });
    },
    resize(nw, nh) { W = nw; H = nh; cargar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) siguienteNivel();
        particles.update(dt);
        return;
      }
      tiempoTotal += dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        const dx = pl.x;
        if (dx) p.cara = dx;
        p.vx = dx * VEL;

        if (pl.pressed('up') && p.enSuelo) {
          p.vy = -SALTO;
          p.enSuelo = false;
          audio.jump();
          haptics.play('soft', { player: p.i });
        }
        // Salto corto al soltar: da control fino, imprescindible en un puzle.
        if (!pl.held('up') && p.vy < -220) p.vy = -220;

        p.vy += GRAV * dt;
        p.vy = Math.min(p.vy, 1400);

        p.x = clamp(p.x + p.vx * dt, ANCHO / 2, W - ANCHO / 2);
        p.enSuelo = false;
        p.y += p.vy * dt;

        for (const pf of plataformas) {
          if (p.x + ANCHO / 2 < pf.x || p.x - ANCHO / 2 > pf.x + pf.w) continue;
          const pies = p.y;
          if (p.vy >= 0 && pies >= pf.y && pies - p.vy * dt <= pf.y + 2) {
            p.y = pf.y;
            p.vy = 0;
            p.enSuelo = true;
          }
        }
        if (p.y > H + 100) { p.y = 0; p.vy = 0; haptics.error(p.i); }
      }

      // Placas: se activan si alguien está encima
      for (const pl of placas) {
        const antes = pl.pisada;
        pl.pisada = jug.some((p) =>
          Math.abs(p.x - pl.x) < 34 && Math.abs(p.y - pl.y) < 16 && p.enSuelo
        );
        if (pl.pisada !== antes) {
          audio.tone({ freq: pl.pisada ? 620 : 380, dur: 0.07, gain: 0.14 });
          haptics.play('click');
        }
      }

      // Puertas: abre = índice de jugador, o 2 = las dos
      for (const pu of puertas) {
        pu.abierta = placas.some((pl) => pl.pisada && (pl.abre === pu.jugador || pl.abre === 2));
      }

      // Meta
      for (const p of jug) {
        const pu = puertas[p.i];
        const dentro = Math.abs(p.x - pu.x) < 26 && Math.abs(p.y - pu.y) < 40;
        const antes = p.enMeta;
        p.enMeta = pu.abierta && dentro;
        if (p.enMeta && !antes) { audio.pickup(); haptics.play('score', { player: p.i, scale: 0.6 }); }
      }

      if (jug.every((p) => p.enMeta)) completar();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#06120f');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#0b1f1a');
      grd.addColorStop(1, '#16352c');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      for (const pf of plataformas) {
        g.fillStyle = '#2c4a3e';
        g.fillRect(pf.x, pf.y, pf.w, pf.h);
        g.fillStyle = '#4a7a64';
        g.fillRect(pf.x, pf.y, pf.w, 4);
      }

      // Placas
      for (const pl of placas) {
        const col = pl.abre === 2 ? '#ffd166' : players[pl.abre].color;
        const h = pl.pisada ? 4 : 9;
        g.save();
        g.shadowColor = col; g.shadowBlur = pl.pisada ? 22 : 8;
        g.fillStyle = col;
        g.fillRect(pl.x - 30, pl.y - h, 60, h);
        g.restore();
      }

      // Puertas
      for (const pu of puertas) {
        const col = players[pu.jugador].color;
        g.save();
        g.globalAlpha = pu.abierta ? 1 : 0.3;
        g.shadowColor = col; g.shadowBlur = pu.abierta ? 26 : 6;
        g.strokeStyle = col;
        g.lineWidth = 4;
        g.strokeRect(pu.x - 22, pu.y - 56, 44, 56);
        if (pu.abierta) {
          g.globalAlpha = 0.22;
          g.fillStyle = col;
          g.fillRect(pu.x - 22, pu.y - 56, 44, 56);
        } else {
          g.globalAlpha = 1;
          g.lineWidth = 3;
          for (let k = 1; k < 4; k++) {
            g.beginPath();
            g.moveTo(pu.x - 22, pu.y - 56 + k * 14);
            g.lineTo(pu.x + 22, pu.y - 56 + k * 14);
            g.stroke();
          }
        }
        g.restore();
      }

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        g.save();
        if (p.enMeta) g.globalAlpha = 0.55;
        g.shadowColor = col; g.shadowBlur = 16;
        g.fillStyle = col;
        g.fillRect(p.x - ANCHO / 2, p.y - ALTO, ANCHO, ALTO);
        g.shadowBlur = 0;
        g.fillStyle = '#0b0b14';
        g.fillRect(p.x - 5 + p.cara * 3, p.y - ALTO + 8, 4, 5);
        g.fillRect(p.x + 1 + p.cara * 3, p.y - ALTO + 8, 4, 5);
        g.restore();
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function completar() {
    audio.win();
    haptics.play('victory');
    particles.burst(W / 2, H / 2, 40, { speed: 300, color: '#a8ff3e', size: 5, gravity: 200 });
    ui.toast('¡Los dos fuera!', { ms: 1400, color: '#a8ff3e' });
    pausa = 1.6;
  }

  function siguienteNivel() {
    nivel++;
    if (nivel >= NIVELES.length) {
      terminado = true;
      ctx.finish({
        winner: -1,
        scores: [NIVELES.length, Math.round(tiempoTotal)],
        detail: `Los ${NIVELES.length} niveles en ${tiempoTotal.toFixed(1)} s`,
        record: ctx.record('tiempo', Math.round(tiempoTotal * 10) / 10, 'low'),
      });
      return;
    }
    sb.setCenter(`nivel ${nivel + 1} / ${NIVELES.length}`);
    sb.update(nivel, NIVELES.length - nivel);
    cargar();
  }
}
