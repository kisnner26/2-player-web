/**
 * Bola de Nieve — rueda, engorda y aplasta.
 *
 * Cuanto más nieve recoges más grande eres, y el grande aplasta al pequeño al
 * chocar. Pero engordar cuesta caro: la bola grande gira como un camión y
 * acelera como un camión, así que la ventaja de tamaño se paga en agilidad.
 *
 * El suelo se queda pelado donde has pasado y la nieve tarda mucho en volver.
 * Al final de la ronda los dos estáis dando vueltas por los mismos cuatro
 * rincones que aún tienen algo, y ahí es donde se decide.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 3;
const REJ = 26;                // rejilla de nieve
const R_MIN = 14;
const R_MAX = 62;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let nieve = [], celda = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, pausa = 0, ronda = 1, perdedor = -1, t = 0;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: R_MIN, score: 0, vivo: true, giro: 0, golpe: 0 };
  }

  function nuevaRonda() {
    celda = Math.min(W, H) / REJ;
    nieve = new Array(REJ * REJ).fill(1);
    for (const p of jug) {
      p.x = W * (p.i === 0 ? 0.25 : 0.75);
      p.y = H * 0.5;
      p.vx = p.vy = 0;
      p.r = R_MIN;
      p.vivo = true;
      p.golpe = 0;
    }
    perdedor = -1;
    pausa = 0;
  }

  const ox = () => (W - celda * REJ) / 2;
  const oy = () => (H - celda * REJ) / 2;

  function comerNieve(p, dt) {
    const cx = Math.floor((p.x - ox()) / celda);
    const cy = Math.floor((p.y - oy()) / celda);
    const rad = Math.ceil(p.r / celda);
    for (let y = cy - rad; y <= cy + rad; y++) {
      for (let x = cx - rad; x <= cx + rad; x++) {
        if (x < 0 || y < 0 || x >= REJ || y >= REJ) continue;
        const k = y * REJ + x;
        if (nieve[k] <= 0) continue;
        const dx = ox() + (x + 0.5) * celda - p.x;
        const dy = oy() + (y + 0.5) * celda - p.y;
        if (dx * dx + dy * dy > p.r * p.r) continue;
        const come = Math.min(nieve[k], dt * 6);
        nieve[k] -= come;
        // Engordar rinde menos cuanto más grande eres: si no, es una bola de nieve.
        p.r = clamp(p.r + come * 1.5 * (1 - (p.r - R_MIN) / (R_MAX - R_MIN) * 0.7), R_MIN, R_MAX);
      }
    }
  }

  function aplastar(p) {
    if (!p.vivo || perdedor >= 0) return;
    p.vivo = false;
    perdedor = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.explosion();
    haptics.defeat(p.i);
    ctx.shake(14);
    particles.burst(p.x, p.y, 34, { speed: 280, color: '#e8f4ff', size: 5, drag: 0.9 });
    pausa = 1.5;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          ronda++;
          sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
          nuevaRonda();
        }
        return;
      }

      // La nieve vuelve muy despacio: al final el mapa está pelado.
      for (let k = 0; k < nieve.length; k++) if (nieve[k] < 1) nieve[k] = Math.min(1, nieve[k] + dt * 0.028);

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.golpe = Math.max(0, p.golpe - dt);
        // Agilidad inversamente proporcional al tamaño.
        const agilidad = 1 - ((p.r - R_MIN) / (R_MAX - R_MIN)) * 0.62;
        const acel = 900 * agilidad;
        const ex = pl.ax, ey = pl.ay;
        const l = Math.hypot(ex, ey) || 1;
        if (ex || ey) { p.vx += (ex / l) * acel * dt; p.vy += (ey / l) * acel * dt; }
        p.vx *= Math.pow(0.25, dt);
        p.vy *= Math.pow(0.25, dt);
        const vmax = 400 * agilidad;
        const v = Math.hypot(p.vx, p.vy);
        if (v > vmax) { p.vx *= vmax / v; p.vy *= vmax / v; }
        p.x = clamp(p.x + p.vx * dt, ox() + p.r, ox() + celda * REJ - p.r);
        p.y = clamp(p.y + p.vy * dt, oy() + p.r, oy() + celda * REJ - p.r);
        p.giro += v * dt * 0.02;
        comerNieve(p, dt);
      }

      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d < a.r + b.r) {
          const grande = a.r > b.r + 6 ? a : b.r > a.r + 6 ? b : null;
          if (grande) {
            const chico = grande === a ? b : a;
            const relTotal = Math.hypot(a.vx - b.vx, a.vy - b.vy);
            if (relTotal > 140) { aplastar(chico); return; }
          }
          const nx = dx / d, ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const ma = a.r, mb = b.r;
            const j = (-2 * rel) / (1 / ma + 1 / mb);
            a.vx -= (j * nx) / ma; a.vy -= (j * ny) / ma;
            b.vx += (j * nx) / mb; b.vy += (j * ny) / mb;
            a.golpe = b.golpe = 0.25;
            audio.thud();
            haptics.impact(null, clamp(Math.abs(rel) / 300, 0.5, 1.4));
            ctx.shake(clamp(Math.abs(rel) / 60, 3, 11));
            particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 14, { speed: 220, color: '#ffffff', size: 4, drag: 0.9 });
          }
          const sep = (a.r + b.r - d) / 2;
          a.x -= nx * sep; a.y -= ny * sep;
          b.x += nx * sep; b.y += ny * sep;
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1420');

      g.fillStyle = '#16283a';
      g.fillRect(ox(), oy(), celda * REJ, celda * REJ);
      for (let y = 0; y < REJ; y++) {
        for (let x = 0; x < REJ; x++) {
          const v = nieve[y * REJ + x];
          if (v <= 0.02) continue;
          const c = Math.round(180 + v * 70);
          g.fillStyle = `rgb(${c},${c + 4},${Math.min(255, c + 12)})`;
          g.fillRect(ox() + x * celda, oy() + y * celda, celda + 0.5, celda + 0.5);
        }
      }

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        g.shadowColor = col;
        g.shadowBlur = p.golpe > 0 ? 28 : 12;
        g.fillStyle = '#f2f8ff';
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
        g.restore();
        g.strokeStyle = col;
        g.lineWidth = 4;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.stroke();
        // Vetas que giran: se ve cuánto rueda.
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.giro);
        g.strokeStyle = '#c8d8e8';
        g.lineWidth = 2;
        for (const a of [0, 1.05, 2.1]) {
          g.beginPath();
          g.arc(0, 0, p.r * 0.6, a, a + 0.9);
          g.stroke();
        }
        g.restore();
        ctx.engine.text(String(Math.round(p.r)), p.x, p.y, { size: 13, color: '#20303e', font: 'system-ui' });
      }

      ctx.engine.text('Rueda para engordar · el grande aplasta al pequeño, pero gira como un camión',
        W / 2, H - 12, { size: 11, color: '#5a7a90', font: 'system-ui' });
    },
  };
}
