/**
 * Manguera — empuja la pelota al campo del otro sin tocarla nunca.
 *
 * Solo hay agua. El chorro es una parábola con inercia: tarda en llegar y
 * sigue llegando un rato después de que dejes de apuntar ahí, así que hay que
 * disparar a donde la pelota VA a estar.
 *
 * El depósito se vacía y se rellena solo, más rápido cuando la pelota está en
 * tu campo. Es la compensación del que va perdiendo: cuando te tienen
 * acorralado es justo cuando más presión tienes para devolverla.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const AGUA_MAX = 100;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let bola = { x: 0, y: 0, vx: 0, vy: 0, r: 24 };
  const jug = [crear(0), crear(1)];
  let gotas = [], sb = null, t = 0, pausa = 0, terminado = false;

  function crear(i) {
    return { i, ang: i === 0 ? -0.6 : Math.PI + 0.6, agua: AGUA_MAX, score: 0, soltando: false };
  }

  const bocaX = (i) => W * (i === 0 ? 0.06 : 0.94);
  const bocaY = () => H * 0.78;

  function sacar(hacia) {
    bola = { x: W * 0.5, y: H * 0.35, vx: (hacia === 0 ? -1 : 1) * 60, vy: 0, r: 24 };
    for (const p of jug) p.agua = AGUA_MAX;
    pausa = 1;
  }

  function punto(i) {
    jug[i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.score(i);
    haptics.score(i);
    particles.burst(bola.x, bola.y, 26, { speed: 240, color: players[i].color, size: 4, drag: 0.9 });
    if (jug[i].score >= PARA_GANAR) {
      terminado = true;
      ctx.finish({ winner: i, scores: [jug[0].score, jug[1].score], detail: `${PARA_GANAR} goles de agua` });
      return;
    }
    sacar(1 - i);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sacar(Math.floor(rng() * 2));
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const p of jug) {
        const pl = input.player(p.i);
        const lim = p.i === 0 ? [-1.45, -0.05] : [Math.PI + 0.05, Math.PI + 1.45];
        p.ang = clamp(p.ang + pl.ay * 1.5 * dt * (p.i === 0 ? 1 : -1), lim[0], lim[1]);
        p.soltando = pl.held('a') && p.agua > 0;

        if (p.soltando) {
          p.agua = Math.max(0, p.agua - 34 * dt);
          const v = 620;
          for (let k = 0; k < 2; k++) {
            gotas.push({
              x: bocaX(p.i), y: bocaY(),
              vx: Math.cos(p.ang) * v * (0.95 + rng() * 0.1),
              vy: Math.sin(p.ang) * v * (0.95 + rng() * 0.1),
              vida: 1.6, de: p.i,
            });
          }
          if (rng() < dt * 6) audio.noise({ dur: 0.1, gain: 0.04, filter: 2400, type: 'highpass' });
        } else {
          // Se recarga más rápido si la pelota está en tu campo: ayuda al que sufre.
          const enMiCampo = p.i === 0 ? bola.x < W / 2 : bola.x > W / 2;
          p.agua = Math.min(AGUA_MAX, p.agua + (enMiCampo ? 30 : 16) * dt);
        }
      }

      if (pausa > 0) { pausa -= dt; }

      // La pelota flota: baja despacio y el agua la empuja.
      bola.vy += 180 * dt;
      bola.vx *= Math.pow(0.55, dt);
      bola.vy *= Math.pow(0.55, dt);
      bola.x += bola.vx * dt;
      bola.y += bola.vy * dt;
      if (bola.y > H * 0.8 - bola.r) { bola.y = H * 0.8 - bola.r; bola.vy = -Math.abs(bola.vy) * 0.4; }
      if (bola.y < bola.r) { bola.y = bola.r; bola.vy = Math.abs(bola.vy) * 0.4; }

      for (let i = gotas.length - 1; i >= 0; i--) {
        const d = gotas[i];
        d.vy += 700 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.vida -= dt;
        const dist = Math.hypot(d.x - bola.x, d.y - bola.y);
        if (dist < bola.r + 6) {
          // Cada gota empuja un poquito: el chorro entero es lo que mueve.
          const nx = (bola.x - d.x) / (dist || 1), ny = (bola.y - d.y) / (dist || 1);
          bola.vx += nx * 26;
          bola.vy += ny * 26;
          particles.spawn({
            x: d.x, y: d.y, vx: -d.vx * 0.2, vy: -120 - rng() * 80,
            life: 0.4, maxLife: 0.4, size: 3, color: '#9fd8ff', shape: 'circle', gravity: 400,
          });
          gotas.splice(i, 1);
          continue;
        }
        if (d.vida <= 0 || d.y > H * 0.82 || d.x < -30 || d.x > W + 30) gotas.splice(i, 1);
      }
      if (gotas.length > 500) gotas.splice(0, gotas.length - 500);

      if (pausa <= 0) {
        if (bola.x < bola.r + 4) punto(1);
        else if (bola.x > W - bola.r - 4) punto(0);
      } else {
        bola.x = clamp(bola.x, bola.r + 10, W - bola.r - 10);
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#081420');

      const cielo = g.createLinearGradient(0, 0, 0, H);
      cielo.addColorStop(0, '#123048');
      cielo.addColorStop(1, '#0a1a26');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, H);

      // Charco de suelo y líneas de gol
      g.fillStyle = '#0e2434';
      g.fillRect(0, H * 0.8, W, H * 0.2);
      for (const i of [0, 1]) {
        g.fillStyle = `${players[i].color}22`;
        g.fillRect(i === 0 ? 0 : W - 40, 0, 40, H * 0.8);
        ctx.engine.glowRect(i === 0 ? 38 : W - 40, 0, 3, H * 0.8, players[i].color, 14);
      }
      g.strokeStyle = '#ffffff14';
      g.setLineDash([10, 12]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H * 0.8); g.stroke();
      g.setLineDash([]);

      for (const d of gotas) {
        g.save();
        g.globalAlpha = clamp(d.vida, 0, 1) * 0.9;
        g.strokeStyle = '#9fd8ff';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(d.x, d.y);
        g.lineTo(d.x - d.vx * 0.012, d.y - d.vy * 0.012);
        g.stroke();
        g.restore();
      }

      particles.render(g);

      // Pelota
      ctx.engine.glowCircle(bola.x, bola.y, bola.r, '#ffd166', 22);
      g.fillStyle = '#00000022';
      g.beginPath(); g.arc(bola.x, bola.y, bola.r * 0.55, 0, TAU); g.fill();

      for (const p of jug) {
        const col = players[p.i].color;
        g.save();
        g.translate(bocaX(p.i), bocaY());
        g.rotate(p.ang);
        g.fillStyle = p.agua > 0 ? '#c9c9d8' : '#4a4a60';
        g.fillRect(0, -6, 34, 12);
        g.restore();
        g.fillStyle = col;
        g.beginPath(); g.arc(bocaX(p.i), bocaY(), 16, 0, TAU); g.fill();

        // Depósito
        const x = p.i === 0 ? 20 : W - 140;
        g.fillStyle = '#00000088';
        g.fillRect(x, 22, 120, 12);
        g.fillStyle = p.agua < 22 ? '#ff4757' : '#3aa0ff';
        g.fillRect(x, 22, 120 * (p.agua / AGUA_MAX), 12);
        ctx.engine.text(`${players[p.i].name} · agua ${Math.round(p.agua)}`,
          p.i === 0 ? 20 : W - 20, 48, {
            size: 12, color: col, align: p.i === 0 ? 'left' : 'right', font: 'system-ui',
          });
      }

      ctx.engine.text('↑/↓ apuntan la lanza · tu tecla suelta agua · empuja la pelota hasta su pared',
        W / 2, H - 10, { size: 11, color: '#3a6a80', font: 'system-ui' });
    },
  };
}
