/**
 * Fútbol Cabezón — 1v1 con cabezazos, patadas y chilenas.
 *
 * El cuerpo es un círculo (la cabeza) más una pierna que solo existe durante
 * la patada. Golpear con la cabeza da control; con la pierna, potencia. Esa
 * diferencia es todo el juego.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 90;          // segundos
const R_CABEZA = 30;
const VEL = 330;
const SALTO = 640;
const GRAV = 1700;
const R_BOLA = 14;
const PATADA_DUR = 0.22;
const PATADA_RECARGA = 0.34;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0, porteriaAlto = 0, porteriaAncho = 0;
  const jug = [jugador(0), jugador(1)];
  const bola = { x: 0, y: 0, vx: 0, vy: 0, rot: 0 };
  let sb = null, tiempo = DURACION, congelado = 0;

  function jugador(i) {
    return { i, x: 0, y: 0, vy: 0, enSuelo: true, score: 0, patada: 0, recarga: 0, mirando: i === 0 ? 1 : -1 };
  }

  function medir() {
    suelo = H - 40;
    porteriaAlto = clamp(H * 0.26, 90, 170);
    porteriaAncho = 26;
  }

  function saque(quien = -1) {
    jug[0].x = W * 0.25; jug[1].x = W * 0.75;
    for (const p of jug) { p.y = suelo; p.vy = 0; p.enSuelo = true; p.patada = 0; }
    bola.x = W / 2;
    bola.y = suelo - 220;
    bola.vx = quien === -1 ? 0 : (quien === 0 ? 120 : -120);
    bola.vy = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      saque();
      sb = ui.scoreboard({ center: '1:30' });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); saque(); },

    update(dt) {
      if (congelado > 0) { congelado -= dt; particles.update(dt); return; }

      tiempo -= dt;
      sb.setCenter(`${Math.floor(Math.max(0, tiempo) / 60)}:${String(Math.max(0, Math.ceil(tiempo % 60)) % 60).padStart(2, '0')}`);
      if (tiempo <= 0) return finalizar();

      /* --- Jugadores --- */
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const pl = input.player(i);
        const dx = pl.x;
        if (dx) p.mirando = dx;
        p.x = clamp(p.x + dx * VEL * dt, R_CABEZA, W - R_CABEZA);

        if (pl.held('up') && p.enSuelo) {
          p.vy = -SALTO; p.enSuelo = false;
          audio.jump(); haptics.play('soft', { player: i });
        }
        if (!p.enSuelo) {
          p.vy += GRAV * dt;
          p.y += p.vy * dt;
          if (p.y >= suelo) { p.y = suelo; p.vy = 0; p.enSuelo = true; haptics.play('tap', { player: i }); }
        }

        if (p.recarga > 0) p.recarga -= dt;
        if (p.patada > 0) p.patada -= dt;
        if (pl.pressed('a') && p.recarga <= 0) {
          p.patada = PATADA_DUR;
          p.recarga = PATADA_DUR + PATADA_RECARGA;
          audio.swoosh();
          haptics.play('tap', { player: i });
        }
      }

      /* --- Pelota --- */
      const pasos = Math.max(1, Math.ceil(Math.hypot(bola.vx, bola.vy) * dt / 6));
      const sdt = dt / pasos;
      for (let s = 0; s < pasos; s++) {
        bola.vy += GRAV * 0.55 * sdt;
        bola.x += bola.vx * sdt;
        bola.y += bola.vy * sdt;
        bola.rot += bola.vx * sdt * 0.02;

        if (bola.y + R_BOLA > suelo && bola.vy > 0) {
          bola.y = suelo - R_BOLA; bola.vy *= -0.72; bola.vx *= 0.92;
          if (Math.abs(bola.vy) > 60) { audio.bounce(0); haptics.bounce(null, 0.4); }
        }
        if (bola.y - R_BOLA < 0 && bola.vy < 0) { bola.y = R_BOLA; bola.vy *= -0.8; }

        // Portería: dentro del arco entra; fuera, rebota en el poste.
        const enArco = bola.y > suelo - porteriaAlto;
        if (bola.x - R_BOLA < porteriaAncho) {
          if (enArco && bola.x < porteriaAncho) { gol(1); return; }
          if (!enArco) { bola.x = porteriaAncho + R_BOLA; bola.vx *= -0.85; }
        }
        if (bola.x + R_BOLA > W - porteriaAncho) {
          if (enArco && bola.x > W - porteriaAncho) { gol(0); return; }
          if (!enArco) { bola.x = W - porteriaAncho - R_BOLA; bola.vx *= -0.85; }
        }
        if (bola.x - R_BOLA < 0) { bola.x = R_BOLA; bola.vx *= -0.85; }
        if (bola.x + R_BOLA > W) { bola.x = W - R_BOLA; bola.vx *= -0.85; }

        for (let i = 0; i < 2; i++) contacto(i, jug[i]);
      }

      bola.vx *= Math.pow(0.75, dt);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1f14');

      const grd = g.createLinearGradient(0, 0, 0, suelo);
      grd.addColorStop(0, '#0e2a1c');
      grd.addColorStop(1, '#1a4a30');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, suelo);
      g.fillStyle = '#2d7a4a';
      g.fillRect(0, suelo, W, H - suelo);
      g.fillStyle = '#3d9a5a';
      g.fillRect(0, suelo, W, 4);

      // Líneas del campo
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, suelo); g.stroke();
      g.beginPath(); g.arc(W / 2, suelo, 70, Math.PI, 0); g.stroke();

      // Porterías
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? 0 : W - porteriaAncho;
        g.save();
        g.shadowColor = players[i].color; g.shadowBlur = 18;
        g.fillStyle = players[i].color + '33';
        g.fillRect(x, suelo - porteriaAlto, porteriaAncho, porteriaAlto);
        g.restore();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(i === 0 ? porteriaAncho : W - porteriaAncho, suelo - porteriaAlto);
        g.lineTo(i === 0 ? porteriaAncho : W - porteriaAncho, suelo);
        g.stroke();
        g.beginPath();
        g.moveTo(x, suelo - porteriaAlto);
        g.lineTo(x + porteriaAncho, suelo - porteriaAlto);
        g.stroke();
      }

      particles.render(g);

      // Jugadores
      for (const p of jug) {
        const col = players[p.i].color;
        // Pierna de la patada
        if (p.patada > 0) {
          const t = 1 - p.patada / PATADA_DUR;
          const ang = -0.9 + t * 1.9;
          g.save();
          g.translate(p.x, p.y - 6);
          g.rotate(p.mirando > 0 ? ang : Math.PI - ang);
          g.strokeStyle = col;
          g.lineWidth = 9;
          g.lineCap = 'round';
          g.beginPath(); g.moveTo(0, 0); g.lineTo(R_CABEZA + 20, 0); g.stroke();
          g.restore();
        }
        ctx.engine.glowCircle(p.x, p.y - R_CABEZA, R_CABEZA, col, 16);
        // Cara
        g.fillStyle = '#0009';
        const ex = p.x + p.mirando * 10;
        g.beginPath(); g.arc(ex, p.y - R_CABEZA - 4, 5, 0, TAU); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(ex + p.mirando * 1.5, p.y - R_CABEZA - 5, 2, 0, TAU); g.fill();
      }

      // Pelota
      g.save();
      g.translate(bola.x, bola.y);
      g.rotate(bola.rot);
      g.shadowColor = '#fff'; g.shadowBlur = 12;
      g.fillStyle = '#f5f5f5';
      g.beginPath(); g.arc(0, 0, R_BOLA, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#222';
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.beginPath();
        g.arc(Math.cos(a) * R_BOLA * 0.55, Math.sin(a) * R_BOLA * 0.55, R_BOLA * 0.24, 0, TAU);
        g.fill();
      }
      g.restore();
    },

    destroy() { sb?.remove(); },
  };

  function contacto(i, p) {
    const cabezaY = p.y - R_CABEZA;
    const dx = bola.x - p.x, dy = bola.y - cabezaY;
    const d = Math.hypot(dx, dy);

    // Patada: alcance mayor y mucha más potencia.
    if (p.patada > 0) {
      const px = p.x + p.mirando * (R_CABEZA + 14);
      const py = p.y - 10;
      if (Math.hypot(bola.x - px, bola.y - py) < R_BOLA + 20) {
        const chilena = !p.enSuelo;
        bola.vx = p.mirando * (chilena ? 780 : 640);
        bola.vy = chilena ? -520 : -290;
        p.patada = 0;
        audio.hit();
        haptics.impact(i, chilena ? 1.4 : 1.1);
        ctx.shake(chilena ? 10 : 6);
        particles.burst(bola.x, bola.y, 14, {
          speed: 260, dir: p.mirando > 0 ? -0.5 : Math.PI + 0.5, spread: 1.2,
          color: players[i].color, size: 5, shape: 'spark',
        });
        if (chilena) ui.toast('¡Chilena!', { ms: 900, color: players[i].color });
        return;
      }
    }

    if (d > R_CABEZA + R_BOLA || d < 1) return;
    // Cabezazo: sale por la normal, con un empujón vertical para levantarla.
    const nx = dx / d, ny = dy / d;
    bola.x = p.x + nx * (R_CABEZA + R_BOLA + 1);
    bola.y = cabezaY + ny * (R_CABEZA + R_BOLA + 1);
    const vel = clamp(Math.hypot(bola.vx, bola.vy) * 0.6 + 300, 300, 800);
    bola.vx = nx * vel;
    bola.vy = ny * vel - 120;
    audio.bounce(i);
    haptics.bounce(i, 0.9);
    particles.burst(bola.x, bola.y, 6, { speed: 150, color: players[i].color, size: 3 });
  }

  function gol(quien) {
    jug[quien].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.score(quien);
    haptics.score(quien);
    ctx.shake(16);
    ui.toast('¡GOL!', { ms: 1200, color: players[quien].color });
    particles.burst(bola.x, bola.y, 40, {
      speed: 380, color: players[quien].color, size: 6, drag: 0.92, gravity: 300,
    });
    congelado = 1.2;
    setTimeout(() => { if (tiempo > 0) saque(1 - quien); }, 0);
  }

  function finalizar() {
    const [a, b] = [jug[0].score, jug[1].score];
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: a === b ? 'Se acabó el tiempo' : '',
    });
  }
}
