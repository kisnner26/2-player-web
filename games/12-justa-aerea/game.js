/**
 * Justa Aérea — aleteas para subir y ganas el choque quien esté más alto.
 *
 * Toda la profundidad sale de una regla: al colisionar, el que tiene la
 * lanza (la posición vertical) más alta gana. Eso convierte volar en
 * posicionarse, no en perseguir.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAV = 1000;
const ALETEO = 320;
const VEL_H = 260;
const ACEL_H = 900;
const R = 20;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let plataformas = [];
  const jug = [ave(0), ave(1)];
  let sb = null, finRonda = 0, ronda = 1;

  function ave(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, score: 0, vivo: true, ala: 0, mirando: i === 0 ? 1 : -1, invul: 0 };
  }

  function construir() {
    const suelo = H - 30;
    plataformas = [
      { x: 0, y: suelo, w: W, h: 30 },
      { x: W * 0.08, y: H * 0.62, w: W * 0.24, h: 14 },
      { x: W * 0.68, y: H * 0.62, w: W * 0.24, h: 14 },
      { x: W * 0.36, y: H * 0.44, w: W * 0.28, h: 14 },
      { x: W * 0.14, y: H * 0.26, w: W * 0.2, h: 14 },
      { x: W * 0.66, y: H * 0.26, w: W * 0.2, h: 14 },
    ];
  }

  function nuevaRonda() {
    construir();
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.x = i === 0 ? W * 0.2 : W * 0.8;
      p.y = H * 0.5;
      p.vx = 0; p.vy = 0;
      p.vivo = true;
      p.invul = 0.8;
    }
    finRonda = 0;
  }

  return {
    init() { W = ctx.W; H = ctx.H; nuevaRonda(); sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` }); },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        particles.update(dt);
        if (finRonda <= 0) siguienteRonda();
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        if (p.invul > 0) p.invul -= dt;

        const dx = pl.x;
        if (dx) p.mirando = dx;
        p.vx += dx * ACEL_H * dt;
        p.vx = clamp(p.vx, -VEL_H, VEL_H);
        if (!dx) p.vx *= Math.pow(0.25, dt);

        if (pl.pressed('up')) {
          p.vy = -ALETEO;
          p.ala = 1;
          audio.tone({ freq: 420, dur: 0.06, gain: 0.12, type: 'triangle', sweep: 160 });
          haptics.play('soft', { player: p.i });
          particles.burst(p.x, p.y + R * 0.6, 4, { speed: 90, dir: Math.PI / 2, spread: 1, color: '#ffffff55', size: 2 });
        }
        p.ala = Math.max(0, p.ala - dt * 5);

        p.vy += GRAV * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Envolvente lateral
        if (p.x < -R) p.x = W + R;
        if (p.x > W + R) p.x = -R;
        if (p.y < R) { p.y = R; p.vy = 0; }

        // Plataformas: solo frenan al caer sobre ellas.
        for (const pf of plataformas) {
          if (p.vy < 0) continue;
          if (p.x + R * 0.6 < pf.x || p.x - R * 0.6 > pf.x + pf.w) continue;
          if (p.y + R > pf.y && p.y + R < pf.y + pf.h + 20) {
            p.y = pf.y - R;
            p.vy = 0;
            p.vx *= Math.pow(0.1, dt);
          }
        }
      }

      // Choque
      if (jug[0].vivo && jug[1].vivo && jug[0].invul <= 0 && jug[1].invul <= 0) {
        const a = jug[0], b = jug[1];
        if (Math.hypot(a.x - b.x, a.y - b.y) < R * 2) {
          const dif = a.y - b.y;
          if (Math.abs(dif) < 6) empate(a, b);
          else if (dif < 0) derribar(b, a);
          else derribar(a, b);
        }
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#12081c');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1c0e2e');
      grd.addColorStop(1, '#331438');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      for (const pf of plataformas) {
        g.fillStyle = '#4a3560';
        g.fillRect(pf.x, pf.y, pf.w, pf.h);
        g.fillStyle = '#6b4d85';
        g.fillRect(pf.x, pf.y, pf.w, 4);
      }

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        if (p.invul > 0) g.globalAlpha = 0.45 + Math.sin(ctx.engine.time * 20) * 0.3;
        g.translate(p.x, p.y);
        g.scale(p.mirando, 1);
        // Alas
        const ang = -0.5 - p.ala * 1.1;
        g.strokeStyle = col; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(-4, -2); g.lineTo(-4 + Math.cos(ang) * 22, -2 + Math.sin(ang) * 22); g.stroke();
        // Cuerpo
        g.shadowColor = col; g.shadowBlur = 16;
        g.fillStyle = col;
        g.beginPath(); g.ellipse(0, 0, R * 0.85, R * 0.7, 0, 0, TAU); g.fill();
        g.shadowBlur = 0;
        // Lanza: marca la altura que decide el duelo
        g.strokeStyle = '#f2f2ff'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(R * 0.5, -R * 0.55); g.lineTo(R * 1.7, -R * 0.85); g.stroke();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(R * 0.35, -4, 3, 0, TAU); g.fill();
        g.restore();
      }
    },

    destroy() { sb?.remove(); },
  };

  function derribar(perdedor, ganador) {
    perdedor.vivo = false;
    ganador.score++;
    ganador.vy = -260;
    sb.update(jug[0].score, jug[1].score);
    audio.hit();
    haptics.impact(ganador.i, 1.3);
    haptics.defeat(perdedor.i);
    ctx.shake(14);
    particles.burst(perdedor.x, perdedor.y, 34, {
      speed: 280, color: players[perdedor.i].color, size: 5, gravity: 500,
    });
    finRonda = 1.4;
  }

  function empate(a, b) {
    // Misma altura: se repelen y nadie puntúa. Recompensa volver a intentarlo.
    const dir = Math.sign(a.x - b.x) || 1;
    a.vx = dir * 380; b.vx = -dir * 380;
    a.invul = b.invul = 0.4;
    audio.bounce(0);
    haptics.impact(null, 0.8);
    ctx.shake(8);
    particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 14, { speed: 220, color: '#fff', size: 4, shape: 'spark' });
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
