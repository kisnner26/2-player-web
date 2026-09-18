/**
 * Imanes — dos discos magnéticos en una plataforma flotante.
 *
 * Los motores son ridículamente flojos: empujarse a base de acelerar no
 * funciona. Lo que mueve de verdad es el imán, y el imán solo tiene dos
 * estados. Con polos opuestos os atraéis, con el mismo polo os repeléis, y la
 * fuerza crece muchísimo de cerca.
 *
 * De ahí sale la jugada del juego: atraer al rival para que coja velocidad
 * hacia ti y cambiar de polo justo antes del contacto, convirtiendo su propio
 * impulso en el empujón que lo tira. Hacerlo tarde es comerse el golpe entero.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const MOTOR = 420;             // aceleración propia: deliberadamente escasa
const FUERZA = 3.4e6;          // constante magnética
const D_MIN = 46;              // distancia mínima para el cálculo (evita el infinito)
const ROZAMIENTO = 0.55;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let cx = 0, cy = 0, radio = 0;
  const jug = [crear(0), crear(1)];
  const tuercas = [];           // chatarra neutra: la arrastra quien esté cerca
  let sb = null, pausa = 0, ronda = 1, fuera = -1, campo = 0;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 24, score: 0, vivo: true,
             polo: i === 0 ? 1 : -1, cambio: 0, calor: 0 };
  }

  function nuevaRonda() {
    cx = W / 2; cy = H * 0.54;
    radio = Math.min(W, H) * 0.38;
    for (const p of jug) {
      p.x = cx + (p.i === 0 ? -1 : 1) * radio * 0.52;
      p.y = cy;
      p.vx = p.vy = 0;
      p.vivo = true;
      p.polo = p.i === 0 ? 1 : -1;
      p.cambio = 0;
      p.calor = 0;
    }
    tuercas.length = 0;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.4;
      tuercas.push({ x: cx + Math.cos(a) * radio * 0.6, y: cy + Math.sin(a) * radio * 0.6, vx: 0, vy: 0, r: 9, rot: a });
    }
    fuera = -1;
    pausa = 0;
  }

  function caer(p) {
    if (!p.vivo || fuera >= 0) return;
    p.vivo = false;
    fuera = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.lose();
    haptics.defeat(p.i);
    ctx.shake(10);
    particles.burst(p.x, p.y, 26, { speed: 200, color: players[p.i].color, size: 5, gravity: 700 });
    pausa = 1.4;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      particles.update(dt);
      campo += dt;

      if (pausa > 0) {
        pausa -= dt;
        for (const p of jug) if (!p.vivo) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 700 * dt; }
        if (pausa <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          ronda++;
          sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
          nuevaRonda();
        }
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.cambio = Math.max(0, p.cambio - dt);
        p.calor = Math.max(0, p.calor - dt * 1.4);

        if (pl.pressed('a')) {
          p.polo *= -1;
          p.cambio = 0.28;
          p.calor = 1;
          audio.tone({ freq: p.polo > 0 ? 620 : 380, dur: 0.09, gain: 0.18, type: 'square' });
          haptics.click(p.i);
          particles.burst(p.x, p.y, 10, { speed: 180, color: p.polo > 0 ? '#ff4757' : '#3aa0ff', size: 3, shape: 'circle' });
        }

        const ex = pl.ax, ey = pl.ay;
        const l = Math.hypot(ex, ey) || 1;
        if (ex || ey) { p.vx += (ex / l) * MOTOR * dt; p.vy += (ey / l) * MOTOR * dt; }
      }

      // Fuerza entre los dos discos. Signo: polos iguales se repelen.
      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.max(D_MIN, Math.hypot(dx, dy));
        const nx = dx / d, ny = dy / d;
        const f = (FUERZA / (d * d)) * (a.polo === b.polo ? -1 : 1);
        a.vx += nx * f * dt; a.vy += ny * f * dt;
        b.vx -= nx * f * dt; b.vy -= ny * f * dt;

        // Contacto: rebote seco. Con polos iguales el rebote es brutal.
        const real = Math.hypot(dx, dy);
        if (real < a.r + b.r) {
          const rest = a.polo === b.polo ? 1.6 : 0.75;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const j = -rel * rest;
            a.vx -= nx * j; a.vy -= ny * j;
            b.vx += nx * j; b.vy += ny * j;
            audio.hit();
            haptics.impact(null, clamp(Math.abs(rel) / 400, 0.5, 1.5));
            ctx.shake(clamp(Math.abs(rel) / 60, 3, 12));
            particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 16,
              { speed: 280, color: '#ffffff', size: 4, shape: 'spark', drag: 0.9 });
          }
          const sep = (a.r + b.r - real) / 2;
          a.x -= nx * sep; a.y -= ny * sep;
          b.x += nx * sep; b.y += ny * sep;
        }
      }

      // Chatarra: la atrae cualquiera de los dos polos, sirve de estorbo y de aviso.
      for (const t of tuercas) {
        for (const p of jug) {
          if (!p.vivo) continue;
          const dx = p.x - t.x, dy = p.y - t.y;
          const d = Math.max(30, Math.hypot(dx, dy));
          const f = (FUERZA * 0.22) / (d * d);
          t.vx += (dx / d) * f * dt;
          t.vy += (dy / d) * f * dt;
        }
        t.vx *= Math.pow(0.35, dt);
        t.vy *= Math.pow(0.35, dt);
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.rot += (t.vx + t.vy) * dt * 0.02;
        const d = Math.hypot(t.x - cx, t.y - cy);
        if (d > radio + 40) { const a = Math.atan2(t.y - cy, t.x - cx); t.x = cx + Math.cos(a) * radio * 0.5; t.y = cy + Math.sin(a) * radio * 0.5; t.vx = t.vy = 0; }
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        p.vx *= Math.pow(ROZAMIENTO, dt);
        p.vy *= Math.pow(ROZAMIENTO, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (Math.hypot(p.x - cx, p.y - cy) > radio + p.r * 0.6) { caer(p); break; }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#05060f');

      // Plataforma
      g.save();
      g.shadowColor = '#3effc8';
      g.shadowBlur = 26;
      g.fillStyle = '#0e1626';
      g.beginPath(); g.arc(cx, cy, radio, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = '#3effc8';
      g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, radio, 0, TAU); g.stroke();

      // Líneas de campo entre los dos: la lectura rápida de qué va a pasar.
      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const atrae = a.polo !== b.polo;
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const inten = clamp(1 - (d - D_MIN) / 420, 0.08, 1);
        g.save();
        g.globalAlpha = inten;
        g.strokeStyle = atrae ? '#3aa0ff' : '#ff4757';
        g.lineWidth = 1.5;
        g.setLineDash([9, 9]);
        g.lineDashOffset = (atrae ? -campo : campo) * 90;
        for (const k of [-1, 0, 1]) {
          const mx = (a.x + b.x) / 2 + (-(b.y - a.y) / (d || 1)) * k * 26;
          const my = (a.y + b.y) / 2 + ((b.x - a.x) / (d || 1)) * k * 26;
          g.beginPath();
          g.moveTo(a.x, a.y);
          g.quadraticCurveTo(mx, my, b.x, b.y);
          g.stroke();
        }
        g.restore();
      }

      for (const t of tuercas) {
        g.save();
        g.translate(t.x, t.y);
        g.rotate(t.rot);
        g.fillStyle = '#7d879e';
        g.fillRect(-t.r, -t.r * 0.5, t.r * 2, t.r);
        g.fillRect(-t.r * 0.5, -t.r, t.r, t.r * 2);
        g.restore();
      }

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        const poloCol = p.polo > 0 ? '#ff4757' : '#3aa0ff';
        // El disco lleva el color del polo; el aro, el del jugador. Así se sabe
        // de un vistazo quién es quién y en qué polaridad está.
        ctx.engine.glowCircle(p.x, p.y, p.r, poloCol, p.cambio > 0 ? 34 : 16);
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath(); g.arc(p.x, p.y, p.r + 4, 0, TAU); g.stroke();
        ctx.engine.text(p.polo > 0 ? 'N' : 'S', p.x, p.y, { size: 15, color: '#0a0a14' });

        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y - p.r * 0.2, 44, {
          pose: 'quieto', acento: col, alpha: 0.95, mirando: p.vx >= 0 ? 1 : -1,
        });

        if (p.calor > 0) {
          g.strokeStyle = `rgba(255,255,255,${p.calor * 0.5})`;
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, p.r + 10 + (1 - p.calor) * 24, 0, TAU); g.stroke();
        }
      }

      ctx.engine.text('Tu tecla de acción cambia el polo · polos iguales se repelen, distintos se atraen',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
