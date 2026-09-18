/**
 * Carrera de Tres Piernas — un solo corredor, dos piernas, dos jugadores.
 *
 * P1 controla la pierna izquierda y P2 la derecha. Avanzan alternando pasos
 * (izquierda-derecha-izquierda…) dentro de una ventana de ritmo: perfecto si
 * el segundo paso llega poco después del primero, tropiezo si van fuera de
 * compás o si el mismo pie pisa dos veces seguidas — exactamente lo que pasa
 * en una carrera de tres piernas de verdad.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const VENTANA_BUENA = 0.5;     // segundos ideales entre pasos alternos
const VENTANA_MAX = 0.9;
const AVANCE_PASO = 0.055;     // fracción de pista por paso bueno
const EQUILIBRIO_MAX = 1;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let progreso = 0;             // 0..1 a lo largo de la pista
  let piePeleado = 0;           // 0 = espera pie izq (P1), 1 = espera der (P2)
  let tUltimoPaso = -10;
  let equilibrio = EQUILIBRIO_MAX;
  let tiempo = 0;
  let caidas = 0;
  let terminado = false;
  let mensaje = '';
  let mensajeT = 0;
  const pasos = [];              // estela de pisadas para dibujar

  return {
    init() {
      W = ctx.W; H = ctx.H;
      ui.banner('Alternen sus teclas: <b>izquierda</b>, <b>derecha</b>, <b>izquierda</b>…');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo += dt;
      if (mensajeT > 0) mensajeT -= dt;

      for (let j = 0; j < 2; j++) {
        if (!input.player(j).pressed('a')) continue;
        pasoDe(j);
      }

      // El equilibrio se recupera solo con el tiempo.
      equilibrio = Math.min(EQUILIBRIO_MAX, equilibrio + dt * 0.25);

      if (progreso >= 1) return terminar();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1206');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#182a10');
      grd.addColorStop(1, '#0c1608');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      const pistaY = H * 0.62;
      const x0 = W * 0.1, x1 = W * 0.9;

      // Pista con carriles
      g.fillStyle = '#2a4a1a';
      g.fillRect(x0, pistaY - 3, x1 - x0, 6);
      g.strokeStyle = '#ffffff22'; g.lineWidth = 2; g.setLineDash([10, 12]);
      g.beginPath(); g.moveTo(x0, pistaY); g.lineTo(x1, pistaY); g.stroke();
      g.setLineDash([]);

      // Meta
      for (let k = 0; k < 6; k++) {
        g.fillStyle = k % 2 ? '#fff' : '#111';
        g.fillRect(x1 - 4, pistaY - 30 + k * 10, 12, 10);
      }

      // Huellas
      for (const p of pasos) {
        g.save();
        g.globalAlpha = clamp(p.vida, 0, 1) * 0.6;
        g.fillStyle = players[p.j].color;
        g.beginPath(); g.arc(p.x, pistaY + (p.j === 0 ? -14 : 14), 5, 0, TAU); g.fill();
        g.restore();
        p.vida -= 0.01;
      }

      particles.render(g);

      // Corredor: dos cuerpos unidos por una cinta a la cintura
      const cx = x0 + (x1 - x0) * progreso;
      const bamboleo = Math.sin(tiempo * 10) * (1 - equilibrio) * 8;
      for (let j = 0; j < 2; j++) {
        const col = players[j].color;
        const ox = j === 0 ? -16 : 16;
        const oy = j === piePeleado ? -6 : 2;   // el pie que toca ahora se adelanta un poco
        g.save();
        g.translate(cx + ox, pistaY - 30 + oy + bamboleo * (j === 0 ? 1 : -1));
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        g.fillRect(-9, 0, 18, 34);
        g.beginPath(); g.arc(0, -8, 10, 0, TAU); g.fill();
        g.restore();
      }
      // Cinta que los une
      g.strokeStyle = '#ffd166'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 16, pistaY - 6); g.lineTo(cx + 16, pistaY - 6); g.stroke();

      // Barra de equilibrio
      const bw = 200, bx = W / 2 - bw / 2, by = 60;
      g.fillStyle = '#ffffff18'; g.fillRect(bx, by, bw, 8);
      g.fillStyle = equilibrio > 0.4 ? '#a8ff3e' : '#ff4757';
      g.fillRect(bx, by, bw * equilibrio, 8);
      ctx.engine.text('EQUILIBRIO', W / 2, by - 12, { size: 10, color: '#ffffff77', font: 'system-ui' });

      // Indicador de próximo pie
      const col = players[piePeleado].color;
      ctx.engine.text(`Pie de ${players[piePeleado].name}`, W / 2, by + 30, { size: 13, color: col, font: 'system-ui' });

      // Progreso / tiempo
      ctx.engine.text(`${Math.round(progreso * 100)}%  ·  ${tiempo.toFixed(1)}s  ·  ${caidas} tropiezos`, W / 2, H - 26, {
        size: 12, color: '#ffffffaa', font: 'system-ui',
      });

      if (mensajeT > 0) {
        g.save();
        g.globalAlpha = clamp(mensajeT * 2, 0, 1);
        ctx.engine.text(mensaje, cx, pistaY - 70, { size: 15, color: '#ff4757', glow: 10 });
        g.restore();
      }
    },

    destroy() { ui.hideBanner(); },
  };

  function pasoDe(j) {
    if (j !== piePeleado) {
      // Pisar con el pie equivocado: tropiezo garantizado.
      tropezar('Pie equivocado');
      return;
    }
    const dt = tiempo - tUltimoPaso;
    tUltimoPaso = tiempo;

    if (dt > VENTANA_MAX) {
      // Primer paso de la carrera o llevaban parados: se acepta sin castigo.
      avanzar(0.7);
    } else if (dt < 0.12) {
      tropezar('Muy rápido');
      return;
    } else {
      const calidad = 1 - clamp(Math.abs(dt - VENTANA_BUENA) / VENTANA_BUENA, 0, 1);
      avanzar(0.5 + calidad * 0.5);
      if (calidad > 0.7) haptics.play('impact', { player: j, scale: 0.7 });
    }
    audio.tone({ freq: j === 0 ? 300 : 360, dur: 0.06, gain: 0.12, type: 'square' });
    haptics.play('tap', { player: j });
    pasos.push({ x: (W * 0.1) + (W * 0.8) * progreso, j, vida: 1 });
    if (pasos.length > 40) pasos.shift();
    piePeleado = 1 - piePeleado;
  }

  function avanzar(factor) {
    progreso = clamp(progreso + AVANCE_PASO * factor, 0, 1);
  }

  function tropezar(motivo) {
    caidas++;
    equilibrio = Math.max(0, equilibrio - 0.4);
    mensaje = motivo; mensajeT = 1;
    audio.error();
    haptics.play('error');
    ctx.shake(6);
    if (equilibrio <= 0.05) {
      progreso = Math.max(0, progreso - 0.06);
      equilibrio = EQUILIBRIO_MAX * 0.5;
      audio.explosion();
      ctx.shake(12);
    }
  }

  function terminar() {
    terminado = true;
    audio.win();
    haptics.play('victory');
    particles.burst(W * 0.9, H * 0.62, 30, { speed: 240, color: '#ffd166', size: 5 });
    ctx.finish({
      winner: -1,
      scores: [Math.round(tiempo * 10) / 10, caidas],
      detail: `Meta en ${tiempo.toFixed(1)} s con ${caidas} tropiezos`,
      record: ctx.record('tiempo', Math.round(tiempo * 10) / 10, 'low'),
    });
  }
}
