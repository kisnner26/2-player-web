/**
 * Suelo Frágil — por donde pisas se va cayendo.
 *
 * La arena es una rejilla de baldosas. Cada una aguanta tres pisadas y a la
 * tercera se cae. Nadie te persigue: el enemigo es el mapa, que se va gastando
 * debajo de los dos a la vez, y el último que quede en pie gana.
 *
 * El giro que lo hace tenso: **las baldosas que rompe uno le sirven al otro de
 * frontera**. Empujar al rival hacia su propio rastro es la jugada.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const REJA_X = 18, REJA_Y = 11;
const AGUANTE = 3;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let baldosas = [];
  const jug = [0, 1].map((i) => ({ i, x: 0, y: 0, vx: 0, vy: 0, r: 15, vivo: true, ultima: null }));
  let sb = null, marcador = [0, 0], pausa = 0, acabado = false;

  const cw = () => W / REJA_X;
  const ch = () => H / REJA_Y;
  const idx = (cx, cy) => cy * REJA_X + cx;

  function nuevaRonda() {
    baldosas = new Array(REJA_X * REJA_Y).fill(AGUANTE);
    jug[0].x = cw() * 2.5; jug[0].y = H / 2;
    jug[1].x = W - cw() * 2.5; jug[1].y = H / 2;
    for (const j of jug) { j.vx = j.vy = 0; j.vivo = true; j.ultima = null; }
    pausa = 1;
  }

  function caer(j) {
    if (!j.vivo) return;
    j.vivo = false;
    const gana = 1 - j.i;
    marcador[gana]++;
    sb.update(marcador[0], marcador[1]);
    audio.explosion();
    haptics.explosion(j.i);
    ctx.shake(12);
    particles.burst(j.x, j.y, 26, { speed: 240, color: players[j.i].color, size: 4, drag: 0.9 });
    if (marcador[gana] >= 3) {
      acabado = true;
      ctx.finish({ winner: gana, scores: marcador, detail: `${marcador[0]}-${marcador[1]} al mejor de cinco` });
      return;
    }
    setTimeout(nuevaRonda, 900);
    pausa = 99;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ctx.ui.scoreboard({ center: 'Al mejor de 5' });
      sb.update(0, 0);
    },

    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (acabado) { particles.update(dt); return; }
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }

      for (const j of jug) {
        if (!j.vivo) continue;
        const p = input.player(j.i);
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        j.vx += ax * 1500 * dt;
        j.vy += ay * 1500 * dt;
        j.vx *= Math.exp(-3.5 * dt);
        j.vy *= Math.exp(-3.5 * dt);
        j.x = clamp(j.x + j.vx * dt, j.r, W - j.r);
        j.y = clamp(j.y + j.vy * dt, j.r, H - j.r);

        const cx = clamp(Math.floor(j.x / cw()), 0, REJA_X - 1);
        const cy = clamp(Math.floor(j.y / ch()), 0, REJA_Y - 1);
        const i = idx(cx, cy);

        if (baldosas[i] <= 0) { caer(j); continue; }
        // Solo se gasta al ENTRAR en una baldosa nueva: si no, quedarse quieto
        // te hundiría y el juego sería «no pares nunca», que es otro juego.
        if (j.ultima !== i) {
          j.ultima = i;
          baldosas[i]--;
          audio.tone({ freq: 220 + baldosas[i] * 90, dur: 0.05, gain: 0.09, type: 'square' });
          if (baldosas[i] <= 0) {
            particles.burst((cx + 0.5) * cw(), (cy + 0.5) * ch(), 8, {
              speed: 120, color: '#5a4a3a', size: 3, drag: 0.9,
            });
          }
        }
      }

      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (d < a.r + b.r) {
          const nx = (b.x - a.x) / (d || 1), ny = (b.y - a.y) / (d || 1);
          a.vx -= nx * 340; a.vy -= ny * 340;
          b.vx += nx * 340; b.vy += ny * 340;
          audio.hit();
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07090e');
      const w = cw(), h = ch();
      for (let cy = 0; cy < REJA_Y; cy++) {
        for (let cx = 0; cx < REJA_X; cx++) {
          const v = baldosas[idx(cx, cy)];
          if (v <= 0) continue;
          // Cuanto menos aguante, más oscura y más agrietada.
          const t = v / AGUANTE;
          g.fillStyle = `rgb(${40 + t * 46},${44 + t * 50},${58 + t * 56})`;
          g.fillRect(cx * w + 1.5, cy * h + 1.5, w - 3, h - 3);
          if (v < AGUANTE) {
            g.strokeStyle = `rgba(0,0,0,${0.3 + (1 - t) * 0.5})`;
            g.lineWidth = 1.5;
            g.beginPath();
            g.moveTo(cx * w + w * 0.25, cy * h + h * 0.2);
            g.lineTo(cx * w + w * 0.6, cy * h + h * 0.7);
            if (v === 1) { g.moveTo(cx * w + w * 0.7, cy * h + h * 0.25); g.lineTo(cx * w + w * 0.35, cy * h + h * 0.8); }
            g.stroke();
          }
        }
      }
      particles.render(g);

      for (const j of jug) {
        if (!j.vivo) continue;
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff55';
      g.font = '12px system-ui, sans-serif';
      g.fillText('Cada baldosa aguanta tres pisadas', W / 2, 26);
    },

    destroy() { sb?.remove(); },
  };
}
