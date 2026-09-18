/**
 * Pulso Chino — echan un pulso, pero la fuerza bruta se agota.
 *
 * Machacar sube el empuje, pero la resistencia del brazo baja con cada
 * machaque y solo se recupera soltando un momento. Eso convierte el pulso en
 * una cuestión de ráfagas y descanso, no de quién tiene el dedo más rápido
 * sin parar. Al mejor de tres.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const PARA_GANAR = 2;
const EMPUJE = 0.05;
const COSTE_RESISTENCIA = 0.07;
const RECUPERA = 0.35;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let pos = 0;                  // -1 gana P1, +1 gana P2
  const resistencia = [1, 1];
  const score = [0, 0];
  let asalto = 1;
  let bloqueado = false;
  let sb = null;

  function nuevoAsalto() {
    pos = 0;
    resistencia[0] = resistencia[1] = 1;
    bloqueado = false;
  }

  return {
    init() { W = ctx.W; H = ctx.H; nuevoAsalto(); sb = ui.scoreboard({ center: `a ${PARA_GANAR}` }); },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (bloqueado) { particles.update(dt); return; }

      for (let j = 0; j < 2; j++) {
        const pl = input.player(j);
        resistencia[j] = clamp(resistencia[j] + dt * RECUPERA, 0, 1);
        if (pl.pressed('a') && resistencia[j] > 0.08) {
          resistencia[j] = clamp(resistencia[j] - COSTE_RESISTENCIA, 0, 1);
          pos = clamp(pos + (j === 0 ? -EMPUJE : EMPUJE) * (0.5 + resistencia[j] * 0.5), -1.05, 1.05);
          audio.tone({ freq: 160 + j * 60, dur: 0.05, gain: 0.14, type: 'sawtooth' });
          haptics.play('tap', { player: j });
          particles.spawn({
            x: W / 2, y: H * 0.5, vx: (Math.random() - 0.5) * 100, vy: (Math.random() - 0.5) * 60,
            life: 0.3, maxLife: 0.3, size: 3, color: players[j].color,
          });
        } else if (pl.pressed('a')) {
          audio.error();
        }
      }

      pos *= Math.pow(0.985, dt * 60);

      if (pos <= -1) ganaAsalto(0);
      else if (pos >= 1) ganaAsalto(1);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#140c08');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#241608'); grd.addColorStop(1, '#120a04');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      const cy = H * 0.5;
      // Mesa
      g.fillStyle = '#3a2412';
      g.fillRect(W * 0.15, cy + 60, W * 0.7, 20);

      particles.render(g);

      const cx = W / 2 + pos * (W * 0.28);
      // Antebrazos entrelazados
      for (let j = 0; j < 2; j++) {
        const col = players[j].color;
        const dir = j === 0 ? 1 : -1;
        g.save();
        g.translate(j === 0 ? W * 0.2 : W * 0.8, cy + 40);
        g.rotate((cx - (j === 0 ? W * 0.2 : W * 0.8)) * 0.002 * dir);
        g.shadowColor = col; g.shadowBlur = 12;
        g.fillStyle = col;
        g.fillRect(-14, -70, 28, 70);
        g.restore();
      }
      // Puños juntos
      ctx.engine.glowCircle(cx, cy - 30, 24, '#e8c9a0', 10);

      // Barras de resistencia
      for (let j = 0; j < 2; j++) {
        const bw = 150, bx = j === 0 ? 20 : W - 20 - bw, by = H - 40;
        g.fillStyle = '#ffffff18'; g.fillRect(bx, by, bw, 10);
        g.fillStyle = resistencia[j] > 0.3 ? players[j].color : '#ff4757';
        g.fillRect(bx, by, bw * resistencia[j], 10);
        ctx.engine.text(players[j].name, bx + (j === 0 ? 0 : bw), by - 10, {
          size: 11, color: players[j].color, align: j === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
    },

    destroy() { sb?.remove(); },
  };

  function ganaAsalto(quien) {
    bloqueado = true;
    score[quien]++;
    sb.update(score[0], score[1]);
    audio.score(quien);
    haptics.score(quien);
    ctx.shake(10);
    particles.burst(W / 2 + (quien === 0 ? -1 : 1) * W * 0.28, H * 0.2, 24, {
      speed: 220, color: players[quien].color, size: 5,
    });
    setTimeout(() => {
      if (score[quien] >= PARA_GANAR) {
        ctx.finish({ winner: quien, scores: [score[0], score[1]], detail: `${asalto} asaltos` });
      } else {
        asalto++;
        nuevoAsalto();
      }
    }, 1500);
  }
}
