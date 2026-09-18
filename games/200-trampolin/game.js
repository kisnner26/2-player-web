/**
 * Trampolín — el suelo es una lona y el que está arriba manda.
 *
 * La lona guarda la energía con la que caes y te la devuelve, así que la
 * altura no se pide: se construye. Y hay un detalle que lo cambia todo: si
 * caéis los dos a la vez sobre la lona, el que llega con más fuerza le roba
 * el rebote al otro y lo deja clavado abajo.
 *
 * Desde ahí, el remate: caer encima de su cabeza. Toda la partida es la misma
 * pregunta — ¿aguanto un bote más para subir, o ya estoy bastante arriba?
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAVEDAD = 1450;
const REBOTE = 0.94;
const LATERAL = 620;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let lona = 0, tension = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, t = 0, pausa = 0, perdedor = -1;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 20, score: 0, vivo: true, mira: 1, hundido: 0, clavado: 0 };
  }

  function nuevaRonda() {
    lona = H * 0.76;
    for (const p of jug) {
      p.x = W * (p.i === 0 ? 0.35 : 0.65);
      p.y = lona - 180;
      p.vx = 0;
      p.vy = 0;
      p.vivo = true;
      p.clavado = 0;
    }
    perdedor = -1;
    pausa = 0;
  }

  function caer(p, motivo) {
    if (!p.vivo || perdedor >= 0) return;
    p.vivo = false;
    perdedor = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.lose();
    haptics.defeat(p.i);
    ctx.shake(12);
    particles.burst(p.x, p.y, 26, { speed: 240, color: players[p.i].color, size: 4, drag: 0.9 });
    ui.toast(motivo, { ms: 1000, color: players[1 - p.i].color });
    pausa = 1.4;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      tension = Math.max(0, tension - dt * 4);
      particles.update(dt);

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          nuevaRonda();
        }
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.clavado = Math.max(0, p.clavado - dt);
        p.hundido = Math.max(0, p.hundido - dt * 3);

        if (p.clavado <= 0) {
          p.vx += pl.ax * LATERAL * dt;
          if (pl.ax) p.mira = pl.ax > 0 ? 1 : -1;
          // Encoger al caer aumenta el rebote; estirarse lo mata.
          if (pl.held('a') && p.vy > 0) p.vy += 520 * dt;
          if (pl.held('down') && p.vy < 0) p.vy += 900 * dt;
        }
        p.vy += GRAVEDAD * dt;
        p.vx *= Math.pow(0.55, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx) * 0.6; }
        if (p.x > W - p.r) { p.x = W - p.r; p.vx = -Math.abs(p.vx) * 0.6; }

        // Fuera de la lona por los lados: caída al suelo duro.
        const enLona = p.x > W * 0.12 && p.x < W * 0.88;
        if (p.y > lona - p.r) {
          if (!enLona) { caer(p, `${players[p.i].name} se sale de la lona`); return; }
          const impacto = p.vy;
          p.y = lona - p.r;
          if (impacto > 60) {
            p.vy = -impacto * REBOTE;
            p.hundido = 1;
            tension = clamp(impacto / 900, 0, 1);
            audio.bounce(clamp(impacto / 900, 0, 1));
            haptics.bounce(p.i, clamp(impacto / 700, 0.3, 1.2));
            particles.burst(p.x, lona, 8, {
              speed: 160, dir: -Math.PI / 2, spread: 1.4, color: '#ffffff66', size: 3, drag: 0.9,
            });
          } else p.vy = 0;
        }
        if (p.y < -400) { caer(p, `${players[p.i].name} se pierde de vista`); return; }
      }

      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        // Robo de rebote: los dos tocando lona a la vez.
        const aEnLona = a.y > lona - a.r - 4 && a.vy < 0;
        const bEnLona = b.y > lona - b.r - 4 && b.vy < 0;
        if (aEnLona && bEnLona) {
          const fuerte = Math.abs(a.vy) > Math.abs(b.vy) ? a : b;
          const debil = fuerte === a ? b : a;
          fuerte.vy -= Math.abs(debil.vy) * 0.7;
          debil.vy = 0;
          debil.clavado = 0.5;
          audio.thud();
          haptics.impact(debil.i, 1.2);
          ctx.shake(8);
        }

        // Pisotón: caerle encima con velocidad.
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < a.r + b.r) {
          const arriba = a.y < b.y ? a : b;
          const abajo = arriba === a ? b : a;
          if (arriba.vy > 200) {
            caer(abajo, `${players[arriba.i].name} le cae encima`);
            return;
          }
          const nx = (b.x - a.x) / (d || 1);
          a.vx -= nx * 220;
          b.vx += nx * 220;
          audio.hit();
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0a18');

      const fondo = g.createLinearGradient(0, 0, 0, H);
      fondo.addColorStop(0, '#161436');
      fondo.addColorStop(1, '#0a0916');
      g.fillStyle = fondo;
      g.fillRect(0, 0, W, H);

      // Marcas de altura
      g.strokeStyle = '#ffffff08';
      for (let y = lona - 100; y > -20; y -= 100) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
        ctx.engine.text(`${Math.round((lona - y) / 10)} m`, 22, y - 8,
          { size: 10, color: '#ffffff18', align: 'left', font: 'system-ui' });
      }

      // Suelo duro a los lados
      g.fillStyle = '#241c34';
      g.fillRect(0, lona, W * 0.12, H - lona);
      g.fillRect(W * 0.88, lona, W * 0.12, H - lona);

      // Lona: se hunde donde está el que acaba de caer.
      g.save();
      g.strokeStyle = '#3effc8';
      g.lineWidth = 5;
      g.shadowColor = '#3effc8';
      g.shadowBlur = 12 + tension * 26;
      g.beginPath();
      for (let x = W * 0.12; x <= W * 0.88; x += 8) {
        let y = lona;
        for (const p of jug) {
          if (!p.vivo || p.hundido <= 0) continue;
          const d = Math.abs(x - p.x);
          y += Math.exp(-(d * d) / 9000) * p.hundido * 34;
        }
        g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
      // Muelles
      g.strokeStyle = '#4a4a68';
      g.lineWidth = 2;
      for (const x of [W * 0.12, W * 0.88]) {
        g.beginPath(); g.moveTo(x, lona); g.lineTo(x, lona + 26); g.stroke();
      }

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + p.r, 62, {
          pose: Math.abs(p.vy) > 60 ? 'salta' : 'quieto',
          acento: col, mirando: p.mira,
          brillo: p.clavado > 0 ? 0 : (p.vy < -400 ? 22 : 0),
          alpha: p.clavado > 0 ? 0.6 : 1,
        });
        if (p.clavado > 0) {
          ctx.engine.text('¡clavado!', p.x, p.y - 40, { size: 12, color: '#ff4757', font: 'system-ui' });
        }
        const altura = Math.max(0, Math.round((lona - p.y) / 10));
        ctx.engine.text(`${altura} m`, p.x, p.y - 56, { size: 11, color: `${col}aa`, font: 'system-ui' });
      }

      ctx.engine.text('Mantén tu tecla al caer para rebotar más alto · caerle encima le quita el punto',
        W / 2, H - 10, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
