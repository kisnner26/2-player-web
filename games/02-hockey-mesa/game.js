/**
 * Hockey de Mesa — disco, mazos y físicas de choque elástico.
 *
 * El mazo se mueve con las cuatro direcciones dentro de su mitad del campo.
 * El disco conserva el momento del mazo, así que un golpe con carrera pega
 * mucho más fuerte que uno estático: recompensa el movimiento anticipado.
 */

import { clamp, elasticBounce, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 7;
const R_MAZO = 30;
const R_DISCO = 17;
const VEL_MAZO = 700;
const VEL_MAX_DISCO = 1500;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let porteria = 0;      // alto de la portería
  const mazos = [
    { x: 0, y: 0, vx: 0, vy: 0, r: R_MAZO, m: 6, score: 0 },
    { x: 0, y: 0, vx: 0, vy: 0, r: R_MAZO, m: 6, score: 0 },
  ];
  const disco = { x: 0, y: 0, vx: 0, vy: 0, r: R_DISCO, m: 1 };
  let sb = null;
  let congelado = 0;
  const estela = [];

  function medidas() {
    porteria = clamp(H * 0.34, 110, 260);
  }

  function colocar(saqueDe = -1) {
    mazos[0].x = W * 0.18; mazos[0].y = H / 2;
    mazos[1].x = W * 0.82; mazos[1].y = H / 2;
    for (const m of mazos) { m.vx = 0; m.vy = 0; }
    disco.x = W / 2;
    disco.y = H / 2;
    if (saqueDe >= 0) {
      const dir = saqueDe === 0 ? -1 : 1;
      disco.vx = dir * 220;
      disco.vy = (Math.random() - 0.5) * 200;
    } else {
      disco.vx = (Math.random() < 0.5 ? -1 : 1) * 260;
      disco.vy = (Math.random() - 0.5) * 200;
    }
    estela.length = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medidas();
      colocar();
      sb = ui.scoreboard({ center: `primero a ${PARA_GANAR}` });
    },

    resize(nw, nh) { W = nw; H = nh; medidas(); colocar(); },

    update(dt) {
      if (congelado > 0) { congelado -= dt; return; }

      /* --- Mazos, limitados a su mitad --- */
      for (let i = 0; i < 2; i++) {
        const m = mazos[i];
        const pl = input.player(i);
        const tx = pl.x * VEL_MAZO, ty = pl.y * VEL_MAZO;
        m.vx += (tx - m.vx) * Math.min(1, dt * 16);
        m.vy += (ty - m.vy) * Math.min(1, dt * 16);
        m.x += m.vx * dt;
        m.y += m.vy * dt;

        const minX = i === 0 ? m.r : W / 2 + m.r;
        const maxX = i === 0 ? W / 2 - m.r : W - m.r;
        if (m.x < minX) { m.x = minX; m.vx = 0; }
        if (m.x > maxX) { m.x = maxX; m.vx = 0; }
        m.y = clamp(m.y, m.r, H - m.r);
      }

      /* --- Disco --- */
      const pasos = Math.max(1, Math.ceil(Math.hypot(disco.vx, disco.vy) * dt / 8));
      const sdt = dt / pasos;
      for (let s = 0; s < pasos; s++) {
        disco.x += disco.vx * sdt;
        disco.y += disco.vy * sdt;

        if (disco.y - disco.r < 0 && disco.vy < 0) { disco.y = disco.r; disco.vy *= -0.96; banda(); }
        if (disco.y + disco.r > H && disco.vy > 0) { disco.y = H - disco.r; disco.vy *= -0.96; banda(); }

        const enPorteria = Math.abs(disco.y - H / 2) < porteria / 2;
        if (disco.x - disco.r < 0) {
          if (enPorteria) { gol(1); return; }
          disco.x = disco.r; disco.vx *= -0.96; banda();
        }
        if (disco.x + disco.r > W) {
          if (enPorteria) { gol(0); return; }
          disco.x = W - disco.r; disco.vx *= -0.96; banda();
        }

        for (let i = 0; i < 2; i++) {
          const m = mazos[i];
          if (elasticBounce(m, disco, 1.05)) {
            const fuerza = Math.hypot(disco.vx, disco.vy);
            audio.hit();
            haptics.impact(i, clamp(fuerza / 700, 0.5, 1.4));
            particles.burst(disco.x, disco.y, 10, {
              speed: 200, color: players[i].color, size: 4, shape: 'spark', drag: 0.9,
            });
            // El mazo apenas se frena: pesa mucho más que el disco.
            m.vx *= 0.85; m.vy *= 0.85;
          }
        }
      }

      // Rozamiento de la mesa y tope de velocidad
      const fric = Math.pow(0.55, dt);
      disco.vx *= fric; disco.vy *= fric;
      const v = Math.hypot(disco.vx, disco.vy);
      if (v > VEL_MAX_DISCO) { disco.vx *= VEL_MAX_DISCO / v; disco.vy *= VEL_MAX_DISCO / v; }

      estela.push({ x: disco.x, y: disco.y });
      if (estela.length > 12) estela.shift();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#071018');

      // Pista
      g.save();
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 3;
      g.strokeRect(3, 3, W - 6, H - 6);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
      g.beginPath(); g.arc(W / 2, H / 2, Math.min(W, H) * 0.16, 0, TAU); g.stroke();
      g.restore();

      // Porterías
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? 0 : W - 8;
        g.save();
        g.shadowColor = players[i].color;
        g.shadowBlur = 22;
        g.fillStyle = players[i].color + '55';
        g.fillRect(x, H / 2 - porteria / 2, 8, porteria);
        g.restore();
      }

      for (let i = 0; i < estela.length; i++) {
        const t = i / estela.length;
        g.globalAlpha = t * 0.3;
        g.fillStyle = '#7fdcff';
        g.beginPath(); g.arc(estela[i].x, estela[i].y, disco.r * t * 0.9, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;

      particles.render(g);

      for (let i = 0; i < 2; i++) {
        const m = mazos[i];
        ctx.engine.glowCircle(m.x, m.y, m.r, players[i].color, 20);
        g.fillStyle = '#0009';
        g.beginPath(); g.arc(m.x, m.y, m.r * 0.55, 0, TAU); g.fill();
      }

      ctx.engine.glowCircle(disco.x, disco.y, disco.r, '#dff6ff', 22);
      g.fillStyle = '#8fd5ff';
      g.beginPath(); g.arc(disco.x, disco.y, disco.r * 0.5, 0, TAU); g.fill();
    },

    destroy() { sb?.remove(); },
  };

  function banda() {
    audio.bounce(0);
    haptics.bounce(null, 0.5);
  }

  function gol(quien) {
    mazos[quien].score++;
    sb.update(mazos[0].score, mazos[1].score);
    audio.score(quien);
    haptics.score(quien);
    ctx.shake(14);
    particles.burst(quien === 0 ? W : 0, H / 2, 36, {
      speed: 420, dir: quien === 0 ? Math.PI : 0, spread: 1.8,
      color: players[quien].color, size: 6, drag: 0.93,
    });
    if (mazos[quien].score >= PARA_GANAR) {
      ctx.finish({ winner: quien, scores: [mazos[0].score, mazos[1].score] });
      return;
    }
    congelado = 0.8;
    colocar(quien);
  }
}
