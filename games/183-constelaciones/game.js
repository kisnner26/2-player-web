/**
 * Constelaciones — una línea solo se dibuja si los dos están en su estrella.
 *
 * Cada uno lleva su punto de mira. Para trazar un tramo hay que estar cada uno
 * en un extremo y confirmar a la vez, dentro de una ventana corta. Es un juego
 * de "voy yo primero, ahora tú" con el cielo entero de por medio.
 *
 * No hay reloj ni fallo posible: solo la constelación a medio hacer, que ya es
 * bastante incentivo. Al terminarla, se queda escrita en el cielo con vuestros
 * nombres y aparece la siguiente.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const VENTANA = 0.55;          // segundos de margen para confirmar a la vez

/** Constelaciones en coordenadas 0..1, con los tramos que hay que trazar. */
const FIGURAS = [
  {
    nombre: 'La Osa',
    estrellas: [[0.22, 0.62], [0.32, 0.55], [0.43, 0.56], [0.52, 0.48], [0.62, 0.5], [0.72, 0.42], [0.78, 0.55]],
    tramos: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    nombre: 'El Cazador',
    estrellas: [[0.35, 0.28], [0.62, 0.3], [0.42, 0.45], [0.5, 0.48], [0.58, 0.46], [0.36, 0.68], [0.64, 0.7]],
    tramos: [[0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [5, 6]],
  },
  {
    nombre: 'El Cisne',
    estrellas: [[0.5, 0.24], [0.5, 0.42], [0.5, 0.62], [0.5, 0.78], [0.28, 0.5], [0.72, 0.5]],
    tramos: [[0, 1], [1, 2], [2, 3], [4, 1], [1, 5]],
  },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let figura = 0, hechos = new Set(), cursor = [0, 1];
  let listo = [-1, -1], t = 0, terminado = false, brillo = 0, mensaje = '';
  let fondo = [], sb = null, completadas = 0, tramosTotales = 0;

  function estrellaXY(i) {
    const [x, y] = FIGURAS[figura].estrellas[i];
    return { x: x * W, y: y * H };
  }

  function cargar() {
    hechos = new Set();
    cursor = [0, Math.min(1, FIGURAS[figura].estrellas.length - 1)];
    listo = [-1, -1];
    mensaje = FIGURAS[figura].nombre;
  }

  function intentar() {
    const [a, b] = cursor;
    if (a === b) return;
    const clave = a < b ? `${a}-${b}` : `${b}-${a}`;
    const valido = FIGURAS[figura].tramos.some(([p, q]) => (p === a && q === b) || (p === b && q === a));
    if (!valido || hechos.has(clave)) {
      audio.tone({ freq: 200, dur: 0.09, gain: 0.08, type: 'sine' });
      return;
    }
    hechos.add(clave);
    tramosTotales++;
    brillo = 1;
    audio.tone({ freq: 520 + hechos.size * 60, dur: 0.3, gain: 0.14, type: 'sine' });
    haptics.score(null);
    const pa = estrellaXY(a), pb = estrellaXY(b);
    particles.burst((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, 14, {
      speed: 130, color: '#fff2b0', size: 3, drag: 0.92, shape: 'circle',
    });

    if (hechos.size >= FIGURAS[figura].tramos.length) {
      completadas++;
      mensaje = `${FIGURAS[figura].nombre} completa`;
      audio.win();
      haptics.victory(null);
      sb.update(completadas, tramosTotales);
      if (completadas >= FIGURAS.length) {
        terminado = true;
        ctx.finish({
          winner: -1,
          scores: [completadas, tramosTotales],
          detail: `${completadas} constelaciones trazadas entre los dos`,
          record: ctx.record('constelaciones', completadas, 'high'),
        });
        return;
      }
      figura++;
      cargar();
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      figura = 0;
      cargar();
      fondo = Array.from({ length: 160 }, () => ({
        x: rng(), y: rng(), r: 0.4 + rng() * 1.5, fase: rng() * TAU,
      }));
      sb = ui.scoreboard({ center: 'trazad el cielo' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      brillo = Math.max(0, brillo - dt);
      particles.update(dt);

      const n = FIGURAS[figura].estrellas.length;
      for (const j of [0, 1]) {
        const pl = input.player(j);
        if (pl.pressed('left') || pl.pressed('up')) { cursor[j] = (cursor[j] + n - 1) % n; audio.tick(); }
        if (pl.pressed('right') || pl.pressed('down')) { cursor[j] = (cursor[j] + 1) % n; audio.tick(); }
        if (pl.pressed('a')) {
          listo[j] = VENTANA;
          audio.blip();
          haptics.tick(j);
        }
        if (listo[j] > 0) listo[j] -= dt;
      }

      if (listo[0] > 0 && listo[1] > 0) {
        intentar();
        listo = [-1, -1];
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#03040e');

      const cielo = g.createLinearGradient(0, 0, 0, H);
      cielo.addColorStop(0, '#070b22');
      cielo.addColorStop(1, '#02030a');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, H);

      for (const s of fondo) {
        const p = 0.4 + Math.sin(t * 1.4 + s.fase) * 0.3;
        g.fillStyle = `rgba(255,255,255,${p * 0.6})`;
        g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, TAU); g.fill();
      }

      // Tramos pendientes, muy tenues: la figura se intuye.
      const F = FIGURAS[figura];
      for (const [a, b] of F.tramos) {
        const clave = a < b ? `${a}-${b}` : `${b}-${a}`;
        const pa = estrellaXY(a), pb = estrellaXY(b);
        const hecho = hechos.has(clave);
        g.save();
        if (hecho) {
          g.strokeStyle = '#fff2b0';
          g.lineWidth = 2.5;
          g.shadowColor = '#fff2b0';
          g.shadowBlur = 12 + brillo * 20;
        } else {
          g.strokeStyle = '#ffffff12';
          g.lineWidth = 1.5;
          g.setLineDash([3, 8]);
        }
        g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
        g.restore();
      }

      particles.render(g);

      F.estrellas.forEach((_, i) => {
        const p = estrellaXY(i);
        const elegida = cursor.includes(i);
        ctx.engine.glowCircle(p.x, p.y, elegida ? 7 : 4.5, elegida ? '#ffffff' : '#dfe6ff', elegida ? 24 : 10);
      });

      for (const j of [0, 1]) {
        const p = estrellaXY(cursor[j]);
        const col = players[j].color;
        g.save();
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.shadowColor = col;
        g.shadowBlur = listo[j] > 0 ? 22 : 8;
        const r = 16 + (j === 0 ? 0 : 6) + (listo[j] > 0 ? Math.sin(t * 20) * 2 : 0);
        g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.stroke();
        g.restore();
        if (listo[j] > 0) {
          ctx.engine.text('listo', p.x, p.y - r - 12, { size: 10, color: col, font: 'system-ui' });
        }
      }

      ctx.engine.text(mensaje, W / 2, H * 0.1, { size: 22, color: '#fff2b0', glow: 12 });
      ctx.engine.text(`${hechos.size} de ${F.tramos.length} tramos · figura ${figura + 1} de ${FIGURAS.length}`,
        W / 2, H * 0.15, { size: 12, color: '#8f9fc0', font: 'system-ui' });
      ctx.engine.text('Cada uno en una estrella del tramo · confirmad casi a la vez para trazarlo',
        W / 2, H - 12, { size: 11, color: '#48507a', font: 'system-ui' });
    },
  };
}
