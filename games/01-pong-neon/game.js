/**
 * Pong Neón — el duelo de paletas, con efecto y aceleración progresiva.
 *
 * El giro sobre el original: la paleta transmite su velocidad a la bola
 * (efecto), y pulsar la tecla de acción justo al golpear da un remate que
 * acelera de golpe. Eso convierte un juego de reflejos en uno de intención.
 */

import { drawGrid } from '../../core/engine.js';
import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 7;
const PAD_W = 14, PAD_H = 96;
const VEL_PALETA = 620;
const VEL_INICIAL = 420;
const VEL_MAX = 1150;

export function create(ctx) {
  const { c, input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const pads = [
    { x: 0, y: 0, vy: 0, score: 0, remate: 0, flash: 0 },
    { x: 0, y: 0, vy: 0, score: 0, remate: 0, flash: 0 },
  ];
  const bola = { x: 0, y: 0, vx: 0, vy: 0, r: 9, spin: 0 };
  let rally = 0;
  let mejorRally = 0;
  let sb = null;
  let congelado = 0;      // pausa breve tras un gol
  const estela = [];

  function colocar() {
    pads[0].x = 34;
    pads[1].x = W - 34 - PAD_W;
    for (const p of pads) p.y = H / 2 - PAD_H / 2;
  }

  function sacar(haciaJugador) {
    bola.x = W / 2;
    bola.y = H / 2;
    const ang = (Math.random() - 0.5) * 0.6;
    const dir = haciaJugador === 0 ? -1 : 1;
    bola.vx = Math.cos(ang) * VEL_INICIAL * dir;
    bola.vy = Math.sin(ang) * VEL_INICIAL;
    bola.spin = 0;
    rally = 0;
    estela.length = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sacar(Math.random() < 0.5 ? 0 : 1);
      sb = ui.scoreboard({ center: `primero a ${PARA_GANAR}` });
    },

    resize(nw, nh) {
      W = nw; H = nh;
      colocar();
    },

    update(dt) {
      if (congelado > 0) { congelado -= dt; return; }

      /* --- Paletas --- */
      for (let i = 0; i < 2; i++) {
        const p = pads[i];
        const pl = input.player(i);
        const dir = pl.y;
        const objetivo = dir * VEL_PALETA;
        // Aceleración con inercia: da peso al movimiento y hace posible el efecto.
        p.vy += (objetivo - p.vy) * Math.min(1, dt * 18);
        p.y = clamp(p.y + p.vy * dt, 0, H - PAD_H);
        if (p.y <= 0 || p.y >= H - PAD_H) p.vy *= 0.3;
        if (pl.pressed('a')) { p.remate = 0.16; haptics.tap(i); }
        if (p.remate > 0) p.remate -= dt;
        if (p.flash > 0) p.flash -= dt * 4;
      }

      /* --- Bola --- */
      const pasos = Math.max(1, Math.ceil((Math.abs(bola.vx) + Math.abs(bola.vy)) * dt / 6));
      const sdt = dt / pasos;
      for (let s = 0; s < pasos; s++) {
        bola.vy += bola.spin * sdt * 60;
        bola.spin *= Math.pow(0.4, sdt);
        bola.x += bola.vx * sdt;
        bola.y += bola.vy * sdt;

        if (bola.y - bola.r < 0 && bola.vy < 0) {
          bola.y = bola.r; bola.vy *= -1;
          audio.bounce(0); haptics.bounce(null, 0.6);
          particles.burst(bola.x, 0, 6, { speed: 120, dir: Math.PI / 2, spread: 1.6, color: '#ffffff', size: 3 });
        }
        if (bola.y + bola.r > H && bola.vy > 0) {
          bola.y = H - bola.r; bola.vy *= -1;
          audio.bounce(0); haptics.bounce(null, 0.6);
          particles.burst(bola.x, H, 6, { speed: 120, dir: -Math.PI / 2, spread: 1.6, color: '#ffffff', size: 3 });
        }

        for (let i = 0; i < 2; i++) {
          const p = pads[i];
          const haciaEl = i === 0 ? bola.vx < 0 : bola.vx > 0;
          if (!haciaEl) continue;
          const dentroX = i === 0
            ? bola.x - bola.r < p.x + PAD_W && bola.x > p.x
            : bola.x + bola.r > p.x && bola.x < p.x + PAD_W;
          if (!dentroX) continue;
          if (bola.y + bola.r < p.y || bola.y - bola.r > p.y + PAD_H) continue;
          golpear(i, p);
        }
      }

      /* --- Gol --- */
      if (bola.x < -30) gol(1);
      else if (bola.x > W + 30) gol(0);

      estela.push({ x: bola.x, y: bola.y });
      if (estela.length > 14) estela.shift();
      particles.update(dt);
    },

    render() {
      const { c: g } = ctx;
      ctx.engine.clear('#06060c');
      drawGrid(g, W, H, 48, '#ffffff07');

      // Red central punteada
      g.save();
      g.strokeStyle = '#ffffff1a';
      g.lineWidth = 3;
      g.setLineDash([12, 16]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
      g.restore();

      // Marcador gigante de fondo
      g.save();
      g.globalAlpha = 0.05;
      ctx.engine.text(String(pads[0].score), W / 2 - 90, H / 2, { size: 110, color: players[0].color });
      ctx.engine.text(String(pads[1].score), W / 2 + 90, H / 2, { size: 110, color: players[1].color });
      g.restore();

      // Estela de la bola
      for (let i = 0; i < estela.length; i++) {
        const t = i / estela.length;
        g.globalAlpha = t * 0.45;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(estela[i].x, estela[i].y, bola.r * t, 0, TAU);
        g.fill();
      }
      g.globalAlpha = 1;

      particles.render(g);

      for (let i = 0; i < 2; i++) {
        const p = pads[i];
        const col = players[i].color;
        const brillo = 16 + p.flash * 40 + (p.remate > 0 ? 26 : 0);
        ctx.engine.glowRect(p.x, p.y, PAD_W, PAD_H, col, brillo);
        if (p.remate > 0) {
          g.save();
          g.globalAlpha = p.remate * 4;
          g.strokeStyle = col;
          g.lineWidth = 2;
          g.strokeRect(p.x - 6, p.y - 6, PAD_W + 12, PAD_H + 12);
          g.restore();
        }
      }

      ctx.engine.glowCircle(bola.x, bola.y, bola.r, '#ffffff', 24);

      if (rally >= 4) {
        ctx.engine.text(`×${rally}`, W / 2, 46, { size: 14, color: '#ffffff44' });
      }
    },

    destroy() { sb?.remove(); },
  };

  /* ---------------- Lógica de golpeo y gol ---------------- */

  function golpear(i, p) {
    const centro = p.y + PAD_H / 2;
    const rel = clamp((bola.y - centro) / (PAD_H / 2), -1, 1);
    const vel = Math.hypot(bola.vx, bola.vy);
    const remate = p.remate > 0;

    let nueva = Math.min(VEL_MAX, vel * (remate ? 1.24 : 1.045) + 12);
    // El ángulo de salida depende de dónde golpea, como en el original.
    const ang = rel * 0.92;
    const dir = i === 0 ? 1 : -1;
    bola.vx = Math.cos(ang) * nueva * dir;
    bola.vy = Math.sin(ang) * nueva;
    // Efecto: la paleta en movimiento curva la trayectoria.
    bola.spin = clamp(p.vy / VEL_PALETA, -1, 1) * (remate ? 5.5 : 3);
    bola.x = i === 0 ? p.x + PAD_W + bola.r + 1 : p.x - bola.r - 1;

    p.flash = 1;
    rally++;
    mejorRally = Math.max(mejorRally, rally);

    if (remate) {
      audio.hit();
      haptics.impact(i, 1.25);
      particles.burst(bola.x, bola.y, 16, {
        speed: 320, dir: dir > 0 ? 0 : Math.PI, spread: 1.4,
        color: players[i].color, size: 5, shape: 'spark', drag: 0.9,
      });
    } else {
      audio.bounce(i);
      haptics.bounce(i, 0.9 + rally * 0.04);
      particles.burst(bola.x, bola.y, 8, {
        speed: 180, dir: dir > 0 ? 0 : Math.PI, spread: 1.2,
        color: players[i].color, size: 3,
      });
    }
  }

  function gol(quien) {
    pads[quien].score++;
    sb.update(pads[0].score, pads[1].score);
    audio.score(quien);
    haptics.score(quien);
    particles.burst(quien === 0 ? W : 0, bola.y, 30, {
      speed: 380, dir: quien === 0 ? Math.PI : 0, spread: 2,
      color: players[quien].color, size: 6, drag: 0.93,
    });
    ctx.shake(10);

    if (pads[quien].score >= PARA_GANAR) {
      const esRecord = ctx.record('rally', mejorRally, 'high');
      ctx.finish({
        winner: quien,
        scores: [pads[0].score, pads[1].score],
        detail: `Mejor intercambio: ${mejorRally} golpes`,
        record: esRecord && mejorRally > 4,
      });
      return;
    }
    congelado = 0.7;
    sacar(quien === 0 ? 1 : 0);
  }
}
