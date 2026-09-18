/**
 * Cordada — atados por la cintura, y solo uno puede soltarse a la vez.
 *
 * Cada uno se agarra manteniendo su tecla. Con la tecla suelta se puede subir,
 * pero si los dos se sueltan al mismo tiempo no hay nadie asegurando y la
 * cuerda no sujeta nada: caída.
 *
 * La cuerda tiene largo máximo, así que tampoco vale que uno se dispare hacia
 * arriba: al tensarse, tira del otro hacia atrás. Subir rápido es imposible;
 * subir a la vez, también. Solo se sube turnándose y hablando.
 */

import { clamp, damp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const ALTURA = 1600;           // metros de pared, en píxeles lógicos
const CUERDA = 130;
const SUBIDA = 118;
const GRAVEDAD = 620;
const CAIDA_MAX = 90;          // caer más de esto rompe la cordada

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let camara = 0, terminado = false, t = 0, aviso = 0, mensaje = '';
  const jug = [crear(0), crear(1)];
  const presas = [];
  let sb = null, sustos = 0;

  function crear(i) {
    return { i, x: 0, y: 0, vy: 0, agarrado: true, alturaMax: 0, caida: 0, mira: i === 0 ? 1 : -1 };
  }

  function generar() {
    presas.length = 0;
    for (let y = 60; y < ALTURA; y += 46) {
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        presas.push({ x: 0.2 + rng() * 0.6, y, r: 7 + rng() * 4 });
      }
    }
  }

  function caer(p) {
    // Caída larga: los dos al suelo (es cooperativo, se cae en equipo).
    sustos++;
    mensaje = '¡Los dos sueltos! caída';
    aviso = 1.4;
    audio.lose();
    haptics.defeat(p.i);
    ctx.shake(14);
    for (const q of jug) {
      q.y = Math.max(0, q.y - 120);
      q.vy = 0;
      q.agarrado = true;
    }
    particles.burst(W / 2, H * 0.6, 26, { speed: 260, color: '#ff4757', size: 4, drag: 0.9 });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      for (const p of jug) { p.x = 0.4 + p.i * 0.2; p.y = 30 + p.i * 30; }
      sb = ui.scoreboard({ center: 'subid juntos' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      aviso = Math.max(0, aviso - dt);
      particles.update(dt);

      const sueltos = jug.filter((p) => !input.player(p.i).held('a')).length;

      for (const p of jug) {
        const pl = input.player(p.i);
        p.agarrado = pl.held('a');

        if (p.agarrado) {
          p.vy = 0;
          p.caida = 0;
        } else if (sueltos === 2) {
          // Nadie asegura: se cae de verdad.
          p.vy += GRAVEDAD * dt;
          p.y -= p.vy * dt;
          p.caida += p.vy * dt;
          if (p.caida > CAIDA_MAX) { caer(p); return; }
        } else {
          // Uno asegura: el otro puede trepar.
          const dy = pl.held('up') ? 1 : pl.held('down') ? -0.7 : 0;
          const dx = pl.ax;
          p.y += dy * SUBIDA * dt;
          p.x = clamp(p.x + dx * 0.35 * dt, 0.12, 0.88);
          if (dx) p.mira = dx > 0 ? 1 : -1;
          if (dy > 0 && rng() < dt * 14) {
            particles.spawn({
              x: p.x * W, y: alturaPantalla(p.y) + 22, vx: (rng() - 0.5) * 30, vy: 40,
              life: 0.5, maxLife: 0.5, size: 3, color: '#8a7f6a',
            });
          }
        }
        p.y = Math.max(0, p.y);
        p.alturaMax = Math.max(p.alturaMax, p.y);
      }

      // Cuerda: si se pasa del largo, el que va delante tira del de atrás.
      const dif = jug[0].y - jug[1].y;
      if (Math.abs(dif) > CUERDA) {
        const exceso = Math.abs(dif) - CUERDA;
        const alto = dif > 0 ? jug[0] : jug[1];
        const bajo = dif > 0 ? jug[1] : jug[0];
        alto.y -= exceso * 0.6;
        bajo.y += exceso * 0.4;
        if (exceso > 3 && rng() < dt * 8) audio.tone({ freq: 180, dur: 0.05, gain: 0.06, type: 'sawtooth' });
      }

      const media = (jug[0].y + jug[1].y) / 2;
      camara = damp(camara, Math.max(0, media - H * 0.42), 4, dt);
      sb.update(Math.round(jug[0].y / 10), Math.round(jug[1].y / 10));

      if (Math.min(jug[0].y, jug[1].y) >= ALTURA) {
        terminado = true;
        audio.win();
        haptics.victory(null);
        ctx.finish({
          winner: -1,
          scores: [Math.round(jug[0].y / 10), Math.round(jug[1].y / 10)],
          detail: `¡Cima! con ${sustos} caídas · ${Math.round(t)} s`,
          record: ctx.record('tiempo', Math.round(t), 'low'),
        });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1018');

      // Pared: degradado con vetas que se mueven con la cámara.
      const pared = g.createLinearGradient(0, 0, W, 0);
      pared.addColorStop(0, '#1a1c26');
      pared.addColorStop(0.5, '#252836');
      pared.addColorStop(1, '#1a1c26');
      g.fillStyle = pared;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#ffffff08';
      g.lineWidth = 2;
      for (let y = -((camara * 0.6) % 90); y < H; y += 90) {
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(W * 0.3, y + 20, W * 0.7, y - 20, W, y + 10);
        g.stroke();
      }

      for (const pr of presas) {
        const y = alturaPantalla(pr.y);
        if (y < -20 || y > H + 20) continue;
        g.fillStyle = '#3c4152';
        g.beginPath(); g.arc(pr.x * W, y, pr.r, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#4e5468';
        g.beginPath(); g.arc(pr.x * W - 2, y - 2, pr.r * 0.6, 0, Math.PI * 2); g.fill();
      }

      // Cuerda entre los dos: se pone roja cuando está tensa.
      const y0 = alturaPantalla(jug[0].y), y1 = alturaPantalla(jug[1].y);
      const tensa = Math.abs(jug[0].y - jug[1].y) > CUERDA * 0.85;
      g.save();
      g.strokeStyle = tensa ? '#ff4757' : '#c9a86a';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(jug[0].x * W, y0);
      const combado = tensa ? 0 : 26;
      g.quadraticCurveTo((jug[0].x + jug[1].x) / 2 * W, (y0 + y1) / 2 + combado, jug[1].x * W, y1);
      g.stroke();
      g.restore();

      particles.render(g);

      for (const p of jug) {
        const y = alturaPantalla(p.y);
        const col = players[p.i].color;
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x * W, y + 26, 54, {
          pose: p.agarrado ? 'quieto' : 'salta',
          acento: col, mirando: p.mira,
          brillo: p.agarrado ? 0 : 20,
        });
        // Estado del agarre, muy visible: es LA información del juego.
        ctx.engine.text(p.agarrado ? '✊ agarrado' : '✋ suelto', p.x * W, y - 40, {
          size: 11, color: p.agarrado ? '#a8ff3e' : '#ff4757', font: 'system-ui',
        });
      }

      // Barra de altura
      const prog = clamp(Math.min(jug[0].y, jug[1].y) / ALTURA, 0, 1);
      g.fillStyle = '#00000088';
      g.fillRect(W - 26, H * 0.15, 10, H * 0.7);
      g.fillStyle = '#a8ff3e';
      g.fillRect(W - 26, H * 0.85 - H * 0.7 * prog, 10, H * 0.7 * prog);
      ctx.engine.text(`${Math.round(prog * 100)}%`, W - 21, H * 0.11, { size: 11, color: '#a8ff3e', font: 'system-ui' });

      if (aviso > 0) {
        g.save();
        g.globalAlpha = clamp(aviso, 0, 1);
        ctx.engine.text(mensaje, W / 2, H * 0.2, { size: 22, color: '#ff4757', glow: 14 });
        g.restore();
      }

      ctx.engine.text('Mantén tu tecla para agarrarte · con el otro agarrado, sube con ↑ · si os soltáis los dos, caéis',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };

  function alturaPantalla(y) { return H * 0.85 - (y - camara); }
}
