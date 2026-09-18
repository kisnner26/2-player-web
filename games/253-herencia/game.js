/**
 * Herencia — el que pierde una ronda le REGALA su poder al que gana.
 *
 * Cada uno empieza con un poder distinto. Quien pierde la ronda cede el suyo
 * al rival, y a cambio recibe uno nuevo del montón. El resultado es que el que
 * va ganando acumula poderes y se vuelve un monstruo, pero el que va perdiendo
 * estrena juguete cada ronda y nunca se aburre.
 *
 * Se equilibra solo: cuantos más poderes llevas, más grande eres y más fácil
 * de acertar. La ventaja se paga con el cuerpo.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const RONDAS = 7;
const PODERES = [
  { id: 'rapido', nombre: 'Rápido', desc: 'Te mueves más' },
  { id: 'salto', nombre: 'Impulso', desc: 'Acción: empujón' },
  { id: 'iman', nombre: 'Imán', desc: 'Atraes la bola' },
  { id: 'escudo', nombre: 'Escudo', desc: 'Aguantas un golpe' },
  { id: 'freno', nombre: 'Ancla', desc: 'Paras en seco' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({
    i, x: 0, y: 0, vx: 0, vy: 0, poderes: [], escudo: false, puntos: 0,
  }));
  const bola = { x: 0, y: 0, vx: 0, vy: 0, r: 14 };
  let ronda = 1, sb = null, pausa = 0, aviso = '', avisoT = 0;

  const decir = (t, s = 2.4) => { aviso = t; avisoT = s; };
  const radio = (j) => 16 + j.poderes.length * 3.5;   // más poderes, más blanco
  const tiene = (j, id) => j.poderes.some((p) => p.id === id);

  function nuevaRonda() {
    jug[0].x = W * 0.22; jug[0].y = H / 2;
    jug[1].x = W * 0.78; jug[1].y = H / 2;
    for (const j of jug) { j.vx = j.vy = 0; j.escudo = tiene(j, 'escudo'); }
    bola.x = W / 2; bola.y = H / 2;
    const a = ctx.rng() * Math.PI * 2;
    bola.vx = Math.cos(a) * 320; bola.vy = Math.sin(a) * 320;
    pausa = 0.9;
  }

  function reparto(perdedor) {
    const ganador = jug[1 - perdedor.i];
    // El perdedor cede su poder más antiguo y recibe uno nuevo del montón.
    const cedido = perdedor.poderes.shift();
    if (cedido) {
      ganador.poderes.push(cedido);
      decir(`${players[ganador.i].name} hereda ${cedido.nombre}`, 2.6);
    }
    const libres = PODERES.filter((p) => !tiene(perdedor, p.id));
    const nuevo = libres[Math.floor(ctx.rng() * libres.length)] || PODERES[0];
    perdedor.poderes.push(nuevo);
    ganador.puntos++;
    sb.update(jug[0].puntos, jug[1].puntos);

    if (ganador.puntos > RONDAS / 2) {
      ctx.finish({
        winner: ganador.i, scores: [jug[0].puntos, jug[1].puntos],
        detail: `${ganador.poderes.length} poderes acumulados`,
      });
      pausa = 99;
      return;
    }
    ronda++;
    sb?.setCenter(`Ronda ${ronda}`);
    nuevaRonda();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      jug[0].poderes = [PODERES[0]];
      jug[1].poderes = [PODERES[1]];
      nuevaRonda();
      sb = ctx.ui.scoreboard({ center: 'Ronda 1' });
      sb.update(0, 0);
      decir('Quien pierde la ronda regala su poder al otro', 3.5);
    },

    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }

      for (const j of jug) {
        const p = input.player(j.i);
        const vel = tiene(j, 'rapido') ? 1700 : 1150;
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        j.vx += ax * vel * dt;
        j.vy += ay * vel * dt;
        if (tiene(j, 'salto') && p.pressed('a')) {
          const n = Math.hypot(ax, ay) || 1;
          j.vx += (ax / n) * 420; j.vy += (ay / n) * 420;
          audio.jump();
        }
        if (tiene(j, 'freno') && p.held('b')) { j.vx *= 0.86; j.vy *= 0.86; }
        j.vx *= Math.exp(-3.2 * dt);
        j.vy *= Math.exp(-3.2 * dt);
        j.x = clamp(j.x + j.vx * dt, radio(j), W - radio(j));
        j.y = clamp(j.y + j.vy * dt, radio(j), H - radio(j));

        if (tiene(j, 'iman')) {
          const dx = j.x - bola.x, dy = j.y - bola.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 260) { bola.vx += (dx / d) * 340 * dt; bola.vy += (dy / d) * 340 * dt; }
        }
      }

      bola.x += bola.vx * dt;
      bola.y += bola.vy * dt;
      if (bola.y < bola.r || bola.y > H - bola.r) {
        bola.vy *= -1;
        bola.y = clamp(bola.y, bola.r, H - bola.r);
        audio.bounce();
      }

      for (const j of jug) {
        const R = radio(j) + bola.r;
        const dx = bola.x - j.x, dy = bola.y - j.y;
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const nx = dx / (d || 1), ny = dy / (d || 1);
        const v = Math.hypot(bola.vx, bola.vy);
        bola.vx = nx * (v + 60); bola.vy = ny * (v + 60);
        bola.x = j.x + nx * R; bola.y = j.y + ny * R;
        audio.hit();
        haptics.impact(j.i, 0.4);
      }

      // Salir por tu lado es perder la ronda.
      if (bola.x < -30) { reparto(jug[0]); return; }
      if (bola.x > W + 30) { reparto(jug[1]); return; }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#120b16');
      g.strokeStyle = '#ffffff14';
      g.lineWidth = 2;
      g.setLineDash([8, 8]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
      g.setLineDash([]);
      particles.render(g);

      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(bola.x, bola.y, bola.r, 0, Math.PI * 2); g.fill();

      for (const j of jug) {
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, radio(j), 0, Math.PI * 2); g.fill();
        if (j.escudo) {
          g.strokeStyle = '#ffffff'; g.lineWidth = 3;
          g.beginPath(); g.arc(j.x, j.y, radio(j) + 7, 0, Math.PI * 2); g.stroke();
        }
        // Sus poderes, listados en su lado.
        const bx = j.i === 0 ? 20 : W - 150;
        g.textAlign = j.i === 0 ? 'left' : 'right';
        const ax = j.i === 0 ? bx : W - 20;
        g.font = '12px system-ui, sans-serif';
        j.poderes.forEach((p, k) => {
          g.fillStyle = players[j.i].color;
          g.fillText(`${p.nombre} · ${p.desc}`, ax, 78 + k * 18);
        });
      }

      if (avisoT > 0) {
        g.textAlign = 'center';
        g.fillStyle = '#ffffff';
        g.font = 'bold 20px system-ui, sans-serif';
        g.fillText(aviso, W / 2, 46);
      }
    },

    destroy() { sb?.remove(); },
  };
}
