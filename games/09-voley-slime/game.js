/**
 * Voley Slime — dos semicírculos saltarines y una pelota que no debe tocar
 * tu suelo. Rebote sencillo de entender, difícil de dominar.
 *
 * La clave del original: la pelota rebota según DÓNDE del slime la golpeas,
 * no según la física real. Eso permite dirigir tiros con precisión y hace que
 * el juego se aprenda en diez segundos.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 7;
const R_SLIME = 42;
const VEL_SLIME = 340;
const SALTO = 560;
const GRAV = 1500;
const R_BOLA = 13;
const VEL_MAX_BOLA = 900;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0, redX = 0, redAlto = 0;
  const jug = [slime(0), slime(1)];
  const bola = { x: 0, y: 0, vx: 0, vy: 0 };
  let sb = null, congelado = 0, saque = 0, toques = 0;

  function slime(i) {
    return { i, x: 0, y: 0, vy: 0, enSuelo: true, score: 0, squash: 0 };
  }

  function medir() {
    suelo = H - 44;
    redX = W / 2;
    redAlto = clamp(H * 0.22, 70, 150);
  }

  function sacar(quien) {
    saque = quien;
    toques = 0;
    for (let i = 0; i < 2; i++) {
      jug[i].x = i === 0 ? W * 0.25 : W * 0.75;
      jug[i].y = suelo;
      jug[i].vy = 0;
      jug[i].enSuelo = true;
    }
    bola.x = quien === 0 ? W * 0.25 : W * 0.75;
    bola.y = suelo - 200;
    bola.vx = 0;
    bola.vy = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      sacar(Math.random() < 0.5 ? 0 : 1);
      sb = ui.scoreboard({ center: `primero a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); sacar(saque); },

    update(dt) {
      if (congelado > 0) { congelado -= dt; particles.update(dt); return; }

      /* --- Slimes --- */
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const pl = input.player(i);
        const vx = pl.x * VEL_SLIME;
        p.x += vx * dt;

        // Cada uno confinado a su mitad; la red es un muro sólido.
        const min = i === 0 ? R_SLIME : redX + 6 + R_SLIME;
        const max = i === 0 ? redX - 6 - R_SLIME : W - R_SLIME;
        p.x = clamp(p.x, min, max);

        if (pl.held('up') && p.enSuelo) {
          p.vy = -SALTO;
          p.enSuelo = false;
          audio.jump();
          haptics.play('soft', { player: i });
          p.squash = -0.35;
        }
        if (!p.enSuelo) {
          p.vy += GRAV * dt;
          p.y += p.vy * dt;
          if (p.y >= suelo) {
            p.y = suelo;
            p.vy = 0;
            p.enSuelo = true;
            p.squash = 0.4;
            haptics.play('tap', { player: i });
          }
        }
        p.squash *= Math.pow(0.02, dt);
      }

      /* --- Pelota --- */
      const pasos = Math.max(1, Math.ceil(Math.hypot(bola.vx, bola.vy) * dt / 6));
      const sdt = dt / pasos;
      for (let s = 0; s < pasos; s++) {
        bola.vy += GRAV * 0.62 * sdt;
        bola.x += bola.vx * sdt;
        bola.y += bola.vy * sdt;

        if (bola.x - R_BOLA < 0 && bola.vx < 0) { bola.x = R_BOLA; bola.vx *= -0.92; pared(); }
        if (bola.x + R_BOLA > W && bola.vx > 0) { bola.x = W - R_BOLA; bola.vx *= -0.92; pared(); }
        if (bola.y - R_BOLA < 0 && bola.vy < 0) { bola.y = R_BOLA; bola.vy *= -0.92; pared(); }

        // Red: rebota por los lados y por el canto superior.
        const redTop = suelo - redAlto;
        if (bola.y + R_BOLA > redTop && Math.abs(bola.x - redX) < 6 + R_BOLA) {
          if (bola.y < redTop + 8 && bola.vy > 0) {
            bola.y = redTop - R_BOLA; bola.vy *= -0.7;
          } else {
            bola.x = bola.x < redX ? redX - 6 - R_BOLA : redX + 6 + R_BOLA;
            bola.vx *= -0.85;
          }
          pared();
        }

        // Slimes: solo la mitad superior del semicírculo golpea.
        for (let i = 0; i < 2; i++) {
          const p = jug[i];
          const dx = bola.x - p.x, dy = bola.y - p.y;
          if (dy > 0) continue;
          const d = Math.hypot(dx, dy);
          if (d > R_SLIME + R_BOLA || d < 1) continue;
          golpear(i, p, dx / d, dy / d, d);
        }

        if (bola.y + R_BOLA >= suelo) { punto(bola.x < redX ? 1 : 0); return; }
      }

      const v = Math.hypot(bola.vx, bola.vy);
      if (v > VEL_MAX_BOLA) { bola.vx *= VEL_MAX_BOLA / v; bola.vy *= VEL_MAX_BOLA / v; }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1b2a');

      // Cielo y arena
      const grd = g.createLinearGradient(0, 0, 0, suelo);
      grd.addColorStop(0, '#123');
      grd.addColorStop(1, '#2a4a6b');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, suelo);
      g.fillStyle = '#c9a86b';
      g.fillRect(0, suelo, W, H - suelo);
      g.fillStyle = '#e0bd7c';
      g.fillRect(0, suelo, W, 5);

      // Red
      g.fillStyle = '#f2f2ff';
      g.fillRect(redX - 4, suelo - redAlto, 8, redAlto);
      g.fillStyle = '#ffd166';
      g.fillRect(redX - 7, suelo - redAlto - 6, 14, 8);

      particles.render(g);

      // Slimes
      for (const p of jug) {
        const col = players[p.i].color;
        const sq = clamp(p.squash, -0.35, 0.4);
        const rx = R_SLIME * (1 + sq * 0.5);
        const ry = R_SLIME * (1 - sq * 0.5);
        g.save();
        g.shadowColor = col; g.shadowBlur = 18;
        g.fillStyle = col;
        g.beginPath();
        g.ellipse(p.x, p.y, rx, ry, 0, Math.PI, 0);
        g.closePath();
        g.fill();
        g.restore();
        // Ojo mirando a la pelota
        const a = Math.atan2(bola.y - (p.y - ry * 0.45), bola.x - p.x);
        const ox = p.x + (p.i === 0 ? rx * 0.35 : -rx * 0.35);
        const oy = p.y - ry * 0.45;
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(ox, oy, 8, 0, TAU); g.fill();
        g.fillStyle = '#111';
        g.beginPath(); g.arc(ox + Math.cos(a) * 3, oy + Math.sin(a) * 3, 4, 0, TAU); g.fill();
      }

      // Pelota con sombra en la arena
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(bola.x, suelo + 3, R_BOLA * 1.2, 4, 0, 0, TAU);
      g.fill();
      g.restore();
      ctx.engine.glowCircle(bola.x, bola.y, R_BOLA, '#ffffff', 16);
      g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(bola.x, bola.y, R_BOLA * 0.55, 0, TAU); g.fill();
    },

    destroy() { sb?.remove(); },
  };

  function pared() { audio.bounce(0); haptics.bounce(null, 0.5); }

  function golpear(i, p, nx, ny, d) {
    // Se reposiciona la bola fuera del slime y se sale en la normal del punto
    // de contacto: golpear cerca del borde manda la bola casi horizontal.
    bola.x = p.x + nx * (R_SLIME + R_BOLA + 1);
    bola.y = p.y + ny * (R_SLIME + R_BOLA + 1);
    const vel = clamp(Math.hypot(bola.vx, bola.vy) * 0.9 + 380, 380, VEL_MAX_BOLA);
    bola.vx = nx * vel;
    bola.vy = ny * vel - (p.enSuelo ? 0 : 90);   // saltar da más altura al golpe
    toques++;
    audio.bounce(i);
    haptics.bounce(i, 1);
    particles.burst(bola.x, bola.y, 8, {
      speed: 180, dir: Math.atan2(ny, nx), spread: 1.2, color: players[i].color, size: 4,
    });
  }

  function punto(quien) {
    jug[quien].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.score(quien);
    haptics.score(quien);
    ctx.shake(8);
    particles.burst(bola.x, suelo, 24, {
      speed: 260, dir: -Math.PI / 2, spread: 2.2, color: players[quien].color, size: 5, gravity: 700,
    });
    if (jug[quien].score >= PARA_GANAR) {
      ctx.finish({ winner: quien, scores: [jug[0].score, jug[1].score] });
      return;
    }
    congelado = 0.9;
    setTimeout(() => sacar(quien), 0);
  }
}
