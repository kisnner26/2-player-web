/**
 * Cometa — uno lleva el hilo y el otro corre con ella.
 *
 * La cometa vuela por el viento, no por vosotros: lo que hacéis es negociar
 * con él. El del hilo suelta o recoge (más hilo = sube más pero pierde
 * control); el que corre se desplaza por la playa y cambia el ángulo con el
 * que le entra el aire.
 *
 * El viento va a rachas y avisa con la hierba antes de cambiar. Aguantar la
 * cometa alta el mayor tiempo posible es todo el objetivo, y para eso hace
 * falta que uno vea venir la racha y el otro se fíe.
 */

import { clamp, TAU, damp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const TIEMPO = 110;
const HILO_MIN = 90;
const HILO_MAX = 420;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let corredor = 0.4, hilo = 200;
  let cometa = { x: 0, y: 0, vx: 0, vy: 0, ang: 0 };
  let viento = 0.5, objetivoViento = 0.5, cambio = 3;
  let reloj = TIEMPO, altura = 0, mejorAltura = 0, tiempoAlto = 0, t = 0, terminado = false;
  let sb = null, tension = 0;

  const manoX = () => corredor * W;
  const manoY = () => H * 0.78;

  return {
    init() {
      W = ctx.W; H = ctx.H;
      cometa = { x: W * 0.45, y: H * 0.55, vx: 0, vy: 0, ang: 0 };
      sb = ui.scoreboard({ center: 'mantenedla arriba' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      reloj -= dt;

      // Viento a rachas, con transición suave y aviso previo.
      cambio -= dt;
      if (cambio <= 0) {
        objetivoViento = 0.2 + rng() * 0.8;
        cambio = 2.5 + rng() * 4;
        audio.noise({ dur: 0.5, gain: 0.05, filter: 500, type: 'lowpass' });
      }
      viento = damp(viento, objetivoViento, 1.1, dt);

      /* --- Corredor --- */
      const p0 = input.player(0);
      corredor = clamp(corredor + p0.ax * 0.34 * dt, 0.06, 0.94);

      /* --- Hilo --- */
      const p1 = input.player(1);
      if (p1.held('a') || p1.held('down')) hilo = clamp(hilo - 150 * dt, HILO_MIN, HILO_MAX);
      else if (p1.held('up') || p1.held('b')) hilo = clamp(hilo + 130 * dt, HILO_MIN, HILO_MAX);

      /* --- Vuelo --- */
      // El aire empuja hacia arriba y a la derecha; el peso tira abajo.
      const empuje = viento * 520;
      cometa.vx += (empuje * 0.55 - (cometa.x - manoX()) * 0.6) * dt;
      cometa.vy += (620 - empuje * 1.25) * dt;
      cometa.vx *= Math.pow(0.35, dt);
      cometa.vy *= Math.pow(0.4, dt);
      cometa.x += cometa.vx * dt;
      cometa.y += cometa.vy * dt;

      // Restricción del hilo: la cometa no puede alejarse más de `hilo`.
      const dx = cometa.x - manoX(), dy = cometa.y - manoY();
      const d = Math.hypot(dx, dy) || 1e-6;
      tension = clamp((d - hilo) / 40, 0, 1);
      if (d > hilo) {
        const nx = dx / d, ny = dy / d;
        cometa.x = manoX() + nx * hilo;
        cometa.y = manoY() + ny * hilo;
        const radial = cometa.vx * nx + cometa.vy * ny;
        if (radial > 0) { cometa.vx -= nx * radial; cometa.vy -= ny * radial; }
      }
      cometa.ang = Math.atan2(cometa.y - manoY(), cometa.x - manoX()) + Math.PI / 2;

      altura = clamp((manoY() - cometa.y) / (H * 0.7), 0, 1);
      mejorAltura = Math.max(mejorAltura, altura);
      if (altura > 0.45) tiempoAlto += dt;

      if (rng() < dt * 12 && altura > 0.2) {
        particles.spawn({
          x: cometa.x, y: cometa.y, vx: -30 - rng() * 40, vy: 20,
          life: 0.6, maxLife: 0.6, size: 3, color: `${players[1].color}66`,
        });
      }

      sb.update(Math.round(altura * 100), Math.round(tiempoAlto));

      if (cometa.y > H * 0.86) {
        // Se ha caído: se relanza sin castigo, esto no va de perder.
        cometa = { x: manoX() + 40, y: manoY() - 90, vx: 0, vy: -120, ang: 0 };
        audio.thud();
        haptics.play('soft');
        particles.burst(cometa.x, H * 0.86, 12, { speed: 130, color: '#c9a86a', size: 3, drag: 0.9 });
      }

      if (reloj <= 0) {
        terminado = true;
        audio.win();
        haptics.victory(null);
        ctx.finish({
          winner: -1,
          scores: [Math.round(mejorAltura * 100), Math.round(tiempoAlto)],
          detail: `${Math.round(tiempoAlto)} s en lo alto · récord de altura ${Math.round(mejorAltura * 100)}`,
          record: ctx.record('altura', Math.round(mejorAltura * 100), 'high'),
        });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0e1a2a');

      const cielo = g.createLinearGradient(0, 0, 0, H);
      cielo.addColorStop(0, '#1b3c62');
      cielo.addColorStop(0.6, '#3b6a86');
      cielo.addColorStop(1, '#e0c08a');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, H);

      // Nubes que se mueven con el viento
      for (let i = 0; i < 5; i++) {
        const x = ((i * 340 + t * viento * 40) % (W + 300)) - 150;
        const y = H * (0.12 + (i % 3) * 0.1);
        g.fillStyle = '#ffffff22';
        for (const [ox, oy, r] of [[0, 0, 34], [30, 6, 26], [-28, 8, 24]]) {
          g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill();
        }
      }

      // Playa
      g.fillStyle = '#d8b57e';
      g.fillRect(0, H * 0.8, W, H * 0.2);
      // Hierba: el indicador del viento.
      g.strokeStyle = '#7a8a4a';
      g.lineWidth = 2;
      for (let x = 10; x < W; x += 24) {
        const inc = viento * 22 + Math.sin(t * 6 + x) * 3;
        g.beginPath();
        g.moveTo(x, H * 0.82);
        g.quadraticCurveTo(x + inc * 0.5, H * 0.79, x + inc, H * 0.775);
        g.stroke();
      }

      particles.render(g);

      // Hilo
      g.save();
      g.strokeStyle = tension > 0.5 ? '#ffffffcc' : '#ffffff66';
      g.lineWidth = 1.6 + tension;
      g.beginPath();
      g.moveTo(manoX(), manoY());
      const comba = (1 - tension) * 40;
      g.quadraticCurveTo((manoX() + cometa.x) / 2, (manoY() + cometa.y) / 2 + comba, cometa.x, cometa.y);
      g.stroke();
      g.restore();

      // Cometa
      g.save();
      g.translate(cometa.x, cometa.y);
      g.rotate(cometa.ang);
      g.fillStyle = players[1].color;
      g.beginPath();
      g.moveTo(0, -26); g.lineTo(20, 0); g.lineTo(0, 30); g.lineTo(-20, 0);
      g.closePath(); g.fill();
      g.strokeStyle = '#00000044';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -26); g.lineTo(0, 30); g.moveTo(-20, 0); g.lineTo(20, 0); g.stroke();
      // Cola
      g.strokeStyle = '#ffd166';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, 30);
      for (let k = 1; k <= 5; k++) g.lineTo(Math.sin(t * 6 + k) * 8, 30 + k * 14);
      g.stroke();
      g.restore();

      dibujarPersonaje(g, personajeDe(players[0], 0), manoX(), manoY() + 30, 62, {
        pose: Math.abs(input.player(0).ax) > 0.1 ? 'anda' : 'quieto',
        frame: Math.floor(t * 8) % 4,
        acento: players[0].color, mirando: cometa.x > manoX() ? 1 : -1,
      });
      dibujarPersonaje(g, personajeDe(players[1], 1), manoX() - 46, manoY() + 30, 62, {
        pose: 'quieto', acento: players[1].color, mirando: 1,
      });

      // Indicadores
      ctx.engine.text(`altura ${Math.round(altura * 100)} · hilo ${Math.round(hilo)} · ${Math.ceil(Math.max(0, reloj))}s`,
        W / 2, H * 0.07, { size: 14, color: '#f2f6ff', font: 'system-ui' });
      const bw = 160;
      g.fillStyle = '#00000044';
      g.fillRect(W / 2 - bw / 2, H * 0.1, bw, 8);
      g.fillStyle = '#a8ff3e';
      g.fillRect(W / 2 - bw / 2, H * 0.1, bw * viento, 8);
      ctx.engine.text(objetivoViento > viento + 0.08 ? 'entra racha' : objetivoViento < viento - 0.08 ? 'amaina' : 'viento estable',
        W / 2, H * 0.14, { size: 11, color: '#dfe8f8', font: 'system-ui' });

      ctx.engine.text(`${players[0].name}: corre por la playa · ${players[1].name}: mantén para recoger hilo, especial para soltar`,
        W / 2, H - 12, { size: 11, color: '#6a5a48', font: 'system-ui' });
    },
  };
}
