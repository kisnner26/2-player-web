/**
 * Duelo del Oeste — esperar la señal y desenfundar antes que el otro.
 *
 * Todo el juego es una medida de tiempo de reacción honesta: si disparas
 * antes de la señal pierdes la ronda automáticamente, así que no se puede
 * ganar machacando la tecla. La espera es aleatoria entre 1,5 y 5 segundos.
 */

import { TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const PARA_GANAR = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let fase = 'espera';           // espera | senal | resuelto
  let espera = 0;
  let tSenal = 0;
  let tiempos = [null, null];
  const score = [0, 0];
  let ganadorRonda = -1;
  let sb = null;
  let pausaResultado = 0;
  let mejorTiempo = null;

  function nuevaRonda() {
    fase = 'espera';
    espera = 1.5 + rng() * 3.5;
    tiempos = [null, null];
    ganadorRonda = -1;
    pausaResultado = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `a ${PARA_GANAR} rondas` });
      ui.toast('Espera el ¡YA!  ·  disparar antes = perder', { ms: 2600 });
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (fase === 'resuelto') {
        pausaResultado -= dt;
        if (pausaResultado <= 0) {
          const g = score.findIndex((s) => s >= PARA_GANAR);
          if (g >= 0) {
            ctx.finish({
              winner: g,
              scores: [score[0], score[1]],
              detail: mejorTiempo ? `Mejor reacción: ${Math.round(mejorTiempo * 1000)} ms` : '',
              record: mejorTiempo != null && ctx.record('reaccion', Math.round(mejorTiempo * 1000), 'low'),
            });
          } else nuevaRonda();
        }
        particles.update(dt);
        return;
      }

      for (let i = 0; i < 2; i++) {
        if (!input.player(i).pressed('a')) continue;
        if (fase === 'espera') { resolver(1 - i, 'salida en falso'); return; }
        if (tiempos[i] == null) {
          tiempos[i] = ctx.engine.time - tSenal;
          audio.laser();
          haptics.impact(i, 1.2);
          if (ganadorRonda < 0) ganadorRonda = i;
        }
      }

      if (fase === 'espera') {
        espera -= dt;
        if (espera <= 0) {
          fase = 'senal';
          tSenal = ctx.engine.time;
          audio.countdown(0);
          haptics.play('heavy');
          ctx.shake(6);
        }
      } else if (fase === 'senal') {
        // La ronda se cierra en cuanto uno dispara: el otro ya no puede ganar.
        if (ganadorRonda >= 0) {
          const t = tiempos[ganadorRonda];
          if (mejorTiempo == null || t < mejorTiempo) mejorTiempo = t;
          resolver(ganadorRonda, `${Math.round(t * 1000)} ms`);
        }
        // Nadie dispara en 3 s: ronda nula.
        if (ctx.engine.time - tSenal > 3) resolver(-1, 'nadie disparó');
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      const fondo = fase === 'senal' ? '#3a1010' : '#100a06';
      ctx.engine.clear(fondo);

      // Cielo del desierto
      const grd = g.createLinearGradient(0, 0, 0, H);
      if (fase === 'senal') { grd.addColorStop(0, '#5a1a15'); grd.addColorStop(1, '#2a0c0a'); }
      else { grd.addColorStop(0, '#1d1410'); grd.addColorStop(1, '#3a2a1c'); }
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H * 0.72);
      g.fillStyle = '#4a3524';
      g.fillRect(0, H * 0.72, W, H * 0.28);

      // Sol
      g.save();
      g.globalAlpha = fase === 'senal' ? 0.9 : 0.35;
      ctx.engine.glowCircle(W / 2, H * 0.3, 60, fase === 'senal' ? '#ff4757' : '#d9a05b', 60);
      g.restore();

      particles.render(g);

      // Pistoleros
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? W * 0.22 : W * 0.78;
        const y = H * 0.72;
        const disparo = tiempos[i] != null;
        const col = players[i].color;
        g.save();
        g.translate(x, y);
        g.scale(i === 0 ? 1 : -1, 1);
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        g.fillRect(-14, -78, 28, 78);
        g.beginPath(); g.arc(0, -90, 16, 0, TAU); g.fill();
        g.shadowBlur = 0;
        // Sombrero
        g.fillStyle = '#2a1c14';
        g.fillRect(-24, -104, 48, 7);
        g.fillRect(-13, -116, 26, 14);
        // Brazo con revólver
        g.strokeStyle = col;
        g.lineWidth = 8;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(10, -58);
        if (disparo) g.lineTo(46, -58); else g.lineTo(24, -28);
        g.stroke();
        if (disparo) {
          g.fillStyle = '#ffd166';
          g.beginPath(); g.arc(54, -58, 9, 0, TAU); g.fill();
        }
        g.restore();
      }

      // Texto central
      if (fase === 'espera') {
        ctx.engine.text('…', W / 2, H * 0.42, { size: 46, color: '#ffffff66' });
      } else if (fase === 'senal' && ganadorRonda < 0) {
        ctx.engine.text('¡YA!', W / 2, H * 0.42, { size: 58, color: '#ffd166', glow: 30 });
      } else if (fase === 'resuelto') {
        const txt = ganadorRonda >= 0 ? players[ganadorRonda].name : 'Nula';
        const col = ganadorRonda >= 0 ? players[ganadorRonda].color : '#ffffff88';
        ctx.engine.text(txt, W / 2, H * 0.42, { size: 26, color: col, glow: 20 });
      }

      // Tiempos de reacción
      for (let i = 0; i < 2; i++) {
        if (tiempos[i] == null) continue;
        ctx.engine.text(`${Math.round(tiempos[i] * 1000)} ms`, i === 0 ? W * 0.22 : W * 0.78, H * 0.86, {
          size: 14, color: players[i].color,
        });
      }
    },

    destroy() { sb?.remove(); },
  };

  function resolver(quien, motivo) {
    fase = 'resuelto';
    ganadorRonda = quien;
    pausaResultado = 1.8;
    if (quien >= 0) {
      score[quien]++;
      sb.update(score[0], score[1]);
      audio.score(quien);
      haptics.score(quien);
      particles.burst(quien === 0 ? W * 0.22 : W * 0.78, H * 0.5, 24, {
        speed: 240, color: players[quien].color, size: 5, gravity: 200,
      });
    } else {
      audio.error();
    }
    ui.toast(motivo, { ms: 1600, color: quien >= 0 ? players[quien].color : '' });
  }
}
