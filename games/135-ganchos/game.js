/**
 * Ganchos — duelo de columpios en una cueva llena de pinchos.
 *
 * Una sola tecla lo hace todo: mantenerla lanza el gancho al techo y te deja
 * colgando, soltarla te suelta. Todo el juego está en CUÁNDO sueltas — el
 * péndulo convierte la altura en velocidad, así que salir en el punto más bajo
 * te dispara y salir arriba te deja muerto en el aire.
 *
 * No hay ataque: el daño lo pone la cueva. Chocar contra el rival transmite tu
 * velocidad, y ese empujón es lo que lo manda contra los pinchos.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAVEDAD = 1250;
const AIRE = 260;              // control lateral mientras vuelas (poco a propósito)
const CUERDA_MAX = 340;
const CUERDA_MIN = 60;
const RECOGE = 130;            // píxeles por segundo que se acorta la cuerda

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let techo = 0, sueloPincho = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, pausa = 0, muerto = -1, ronda = 1;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 17, score: 0, vivo: true,
             ancla: null, largo: 0, mira: i === 0 ? 1 : -1, chispa: 0 };
  }

  function nuevaRonda() {
    techo = H * 0.12;
    sueloPincho = H * 0.88;
    for (const p of jug) {
      p.x = W * (p.i === 0 ? 0.25 : 0.75);
      p.y = H * 0.42;
      p.vx = p.vy = 0;
      p.ancla = null;
      p.vivo = true;
      p.chispa = 0;
    }
    muerto = -1;
    pausa = 0;
  }

  function lanzar(p) {
    // El gancho agarra en vertical con una desviación según hacia dónde vayas:
    // así se puede encadenar un columpio con el siguiente sin apuntar a mano.
    const desvio = clamp(p.vx / 500, -0.75, 0.75);
    const ax = clamp(p.x + desvio * 150, 30, W - 30);
    p.ancla = { x: ax, y: techo };
    p.largo = clamp(Math.hypot(p.x - ax, p.y - techo), CUERDA_MIN, CUERDA_MAX);
    audio.blip();
    haptics.tick(p.i);
    particles.burst(ax, techo, 8, { speed: 130, dir: Math.PI / 2, spread: 1.6, color: players[p.i].color, size: 3 });
  }

  function morir(p, motivo) {
    if (!p.vivo || muerto >= 0) return;
    p.vivo = false;
    muerto = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(13);
    particles.burst(p.x, p.y, 30, { speed: 300, color: players[p.i].color, size: 5, gravity: 500, drag: 0.92 });
    ui.toast(motivo, { ms: 1100, color: players[1 - p.i].color });
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

      if (pausa > 0) {
        pausa -= dt;
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

        if (pl.pressed('a') && !p.ancla) lanzar(p);
        if (p.ancla && !pl.held('a')) {
          p.ancla = null;
          audio.swoosh();
        }

        p.vy += GRAVEDAD * dt;
        const eje = pl.ax;
        if (eje) { p.vx += eje * AIRE * dt; p.mira = eje > 0 ? 1 : -1; }

        if (p.ancla) {
          // Recoger cuerda mientras cuelgas acelera el giro: es el "bombeo".
          if (pl.held('up')) p.largo = Math.max(CUERDA_MIN, p.largo - RECOGE * dt);
          if (pl.held('down')) p.largo = Math.min(CUERDA_MAX, p.largo + RECOGE * dt);
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.ancla) restringirCuerda(p);

        // Paredes: rebotan sin castigo, solo el suelo y el techo pinchan.
        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.6; audio.bounce(); }
        if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * 0.6; audio.bounce(); }

        if (p.y > sueloPincho - p.r) { morir(p, `${players[p.i].name} aterriza en los pinchos`); break; }
        if (p.y < techo + p.r + 6) {
          if (p.ancla) { p.y = techo + p.r + 6; p.vy = Math.max(p.vy, 0); }
          else { morir(p, `${players[p.i].name} se estampa contra el techo`); break; }
        }

        p.vx *= Math.pow(0.7, dt);
        p.chispa = Math.max(0, p.chispa - dt);

        if (Math.hypot(p.vx, p.vy) > 620) {
          particles.spawn({ x: p.x, y: p.y, vx: -p.vx * 0.1, vy: -p.vy * 0.1,
            life: 0.22, maxLife: 0.22, size: 4, color: `${players[p.i].color}99` });
        }
      }

      // Choque entre los dos: intercambio de velocidad, sin daño directo.
      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d < a.r + b.r + 6) {
          const nx = dx / d, ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            const j = -rel * 1.25;
            a.vx -= nx * j; a.vy -= ny * j;
            b.vx += nx * j; b.vy += ny * j;
            const sep = (a.r + b.r + 6 - d) / 2;
            a.x -= nx * sep; a.y -= ny * sep;
            b.x += nx * sep; b.y += ny * sep;
            a.chispa = b.chispa = 0.25;
            audio.hit();
            haptics.impact(null, clamp(Math.abs(rel) / 500, 0.5, 1.5));
            ctx.shake(clamp(Math.abs(rel) / 70, 3, 12));
            particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 14,
              { speed: 260, color: '#ffffff', size: 4, shape: 'spark', drag: 0.9 });
          }
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#070510');

      // Cueva: roca arriba y abajo con pinchos dibujados como sierra.
      g.fillStyle = '#150f22';
      g.fillRect(0, 0, W, techo);
      g.fillRect(0, sueloPincho, W, H - sueloPincho);

      g.fillStyle = '#ff4757';
      g.beginPath();
      for (let x = 0; x < W; x += 26) {
        g.moveTo(x, sueloPincho);
        g.lineTo(x + 13, sueloPincho - 20);
        g.lineTo(x + 26, sueloPincho);
      }
      g.fill();
      g.save();
      g.shadowColor = '#ff4757';
      g.shadowBlur = 22;
      g.fillStyle = '#ff475733';
      g.fillRect(0, sueloPincho - 22, W, 24);
      g.restore();

      g.fillStyle = '#3b2c52';
      g.beginPath();
      for (let x = 13; x < W; x += 26) {
        g.moveTo(x, techo);
        g.lineTo(x + 13, techo + 14);
        g.lineTo(x + 26, techo);
      }
      g.fill();
      ctx.engine.glowRect(0, techo - 3, W, 3, '#6a5aff', 14);

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;

        if (p.ancla) {
          g.save();
          g.strokeStyle = col;
          g.lineWidth = 2.5;
          g.shadowColor = col;
          g.shadowBlur = 10;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.ancla.x, p.ancla.y); g.stroke();
          g.restore();
          ctx.engine.glowCircle(p.ancla.x, p.ancla.y, 6, col, 16);
        }

        const vel = Math.hypot(p.vx, p.vy);
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + 22, 46, {
          pose: 'salta', acento: col, mirando: p.mira,
          brillo: p.chispa > 0 ? 26 : clamp(vel / 40, 0, 16),
        });
      }

      // Velocímetro discreto: la velocidad es LA variable del juego.
      for (const p of jug) {
        const v = Math.hypot(p.vx, p.vy);
        ctx.engine.text(`${Math.round(v)}`, p.i === 0 ? 18 : W - 18, techo + 22, {
          size: 12, color: `${players[p.i].color}99`, align: p.i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      ctx.engine.text('Mantén tu tecla para engancharte, suéltala para salir disparado · ↑/↓ acorta y suelta cuerda',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };

  /** Mantiene al jugador exactamente a `largo` del ancla y mata la componente radial. */
  function restringirCuerda(p) {
    const dx = p.x - p.ancla.x, dy = p.y - p.ancla.y;
    const d = Math.hypot(dx, dy) || 1e-6;
    if (d <= p.largo) return;
    const nx = dx / d, ny = dy / d;
    p.x = p.ancla.x + nx * p.largo;
    p.y = p.ancla.y + ny * p.largo;
    const radial = p.vx * nx + p.vy * ny;
    if (radial > 0) { p.vx -= nx * radial; p.vy -= ny * radial; }
  }
}
