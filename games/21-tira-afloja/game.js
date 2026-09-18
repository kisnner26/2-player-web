/**
 * Tira y Afloja — machaca tu tecla y arrastra la cuerda a tu lado.
 *
 * Cada pulsación empuja, pero la fuerza decae si machacas sin ritmo: el
 * empuje se acumula en un "impulso" que se disipa solo. Así gana quien
 * mantiene cadencia, no quien tiene el dedo más rápido en un pico corto.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const RONDAS = 3;
const META = 1;              // posición normalizada -1..1
const EMPUJE = 0.048;
const DECAE = 2.2;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let pos = 0;                 // -1 gana P1, +1 gana P2
  let impulso = [0, 0];
  let pulsaciones = [0, 0];
  const score = [0, 0];
  let ronda = 1;
  let sb = null;
  let bloqueado = false;
  let sacudida = 0;

  function nuevaRonda() {
    pos = 0;
    impulso = [0, 0];
    pulsaciones = [0, 0];
    bloqueado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} / ${RONDAS}` });
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (bloqueado) { particles.update(dt); return; }

      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        if (pl.pressed('a')) {
          impulso[i] += EMPUJE;
          pulsaciones[i]++;
          audio.tone({ freq: 180 + i * 60, dur: 0.04, gain: 0.12, type: 'square' });
          haptics.play('tap', { player: i });
          sacudida = 3;
        }
        impulso[i] = Math.max(0, impulso[i] - DECAE * impulso[i] * dt);
      }

      // La cuerda se mueve por la diferencia de impulsos.
      pos += (impulso[1] - impulso[0]) * dt * 26;
      // Recuperación hacia el centro: nadie se queda con ventaja gratis.
      pos *= Math.pow(0.86, dt);
      pos = clamp(pos, -1.05, 1.05);
      sacudida = Math.max(0, sacudida - dt * 12);

      if (pos <= -META) ganaRonda(0);
      else if (pos >= META) ganaRonda(1);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0e1206');

      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a2410');
      grd.addColorStop(1, '#2c3a18');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      const cy = H * 0.55;
      const margen = W * 0.12;
      const centro = W / 2 + pos * (W / 2 - margen);

      // Zonas de meta
      for (let i = 0; i < 2; i++) {
        g.save();
        g.globalAlpha = 0.18;
        g.fillStyle = players[i].color;
        g.fillRect(i === 0 ? 0 : W - margen, 0, margen, H);
        g.restore();
        g.strokeStyle = players[i].color;
        g.lineWidth = 3;
        g.setLineDash([10, 10]);
        g.beginPath();
        const lx = i === 0 ? margen : W - margen;
        g.moveTo(lx, 0); g.lineTo(lx, H);
        g.stroke();
        g.setLineDash([]);
      }

      // Barro central
      g.fillStyle = '#3a2a14';
      g.fillRect(W / 2 - 40, cy - 60, 80, 120);

      // Cuerda
      const sac = Math.sin(ctx.engine.time * 40) * sacudida;
      g.save();
      g.strokeStyle = '#c9a86b';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(60, cy + sac);
      g.quadraticCurveTo(centro, cy + 18 + sac, W - 60, cy - sac);
      g.stroke();
      g.restore();

      // Nudo central
      ctx.engine.glowCircle(centro, cy + 9, 14, '#ffd166', 22);

      particles.render(g);

      // Tiradores
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? centro - W * 0.16 : centro + W * 0.16;
        const col = players[i].color;
        const tiron = impulso[i] * 120;
        g.save();
        g.translate(clamp(x, 40, W - 40), cy + 10);
        g.scale(i === 0 ? 1 : -1, 1);
        g.rotate(-0.22 - tiron * 0.5);
        g.shadowColor = col; g.shadowBlur = 16;
        g.fillStyle = col;
        g.fillRect(-13, -62, 26, 62);
        g.beginPath(); g.arc(0, -74, 14, 0, TAU); g.fill();
        g.restore();
      }

      // Medidores de fuerza
      for (let i = 0; i < 2; i++) {
        const bw = 150, bh = 12;
        const bx = i === 0 ? 24 : W - 24 - bw;
        const by = H - 44;
        g.fillStyle = '#00000066';
        g.fillRect(bx, by, bw, bh);
        g.fillStyle = players[i].color;
        const w = bw * clamp(impulso[i] / 0.22, 0, 1);
        g.fillRect(i === 0 ? bx : bx + bw - w, by, w, bh);
        ctx.engine.text(`${pulsaciones[i]} golpes`, i === 0 ? bx : bx + bw, by - 12, {
          size: 10, color: '#ffffff88', align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
    },

    destroy() { sb?.remove(); },
  };

  function ganaRonda(quien) {
    bloqueado = true;
    score[quien]++;
    sb.update(score[0], score[1]);
    audio.score(quien);
    haptics.score(quien);
    ctx.shake(14);
    particles.burst(quien === 0 ? 60 : W - 60, H * 0.55, 34, {
      speed: 300, color: players[quien].color, size: 5, gravity: 400,
    });

    setTimeout(() => {
      if (score[quien] >= Math.ceil(RONDAS / 2)) {
        ctx.finish({
          winner: quien,
          scores: [score[0], score[1]],
          detail: `${pulsaciones[quien]} pulsaciones en la última ronda`,
        });
      } else {
        ronda++;
        sb.setCenter(`ronda ${ronda} / ${RONDAS}`);
        nuevaRonda();
      }
    }, 1500);
  }
}
