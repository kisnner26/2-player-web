/**
 * Simón Dice — secuencia que crece; el primero que falla, pierde.
 *
 * Los dos ven la misma secuencia y la repiten por turnos, así que no es una
 * carrera de velocidad sino de memoria pura. Cada ronda añade un paso.
 */

import { TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const COLORES = [
  { dir: 'up',    color: '#a8ff3e', freq: 392, nombre: 'arriba' },
  { dir: 'right', color: '#ff4757', freq: 523, nombre: 'derecha' },
  { dir: 'down',  color: '#5b8cff', freq: 330, nombre: 'abajo' },
  { dir: 'left',  color: '#ffd166', freq: 440, nombre: 'izquierda' },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let secuencia = [];
  let fase = 'mostrando';        // mostrando | repitiendo | fallo
  let indiceMostrar = 0;
  let tMostrar = 0;
  let encendido = -1;
  let turno = 0;                 // quién repite ahora
  let paso = 0;                  // en qué posición de la secuencia va
  let ronda = 0;
  let sb = null;
  let pausa = 0;
  let aciertos = [0, 0];
  let ganador = -1;

  function nuevaRonda() {
    secuencia.push(Math.floor(rng() * 4));
    ronda = secuencia.length;
    fase = 'mostrando';
    indiceMostrar = 0;
    tMostrar = 0.5;
    encendido = -1;
    paso = 0;
    sb.setCenter(`secuencia de ${ronda}`);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: '' });
      nuevaRonda();
      ui.banner(`Observa la secuencia`);
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (fase === 'fallo') {
        pausa -= dt;
        if (pausa <= 0) resolverFinal();
        particles.update(dt);
        return;
      }

      if (fase === 'esperandoRonda') {
        pausa -= dt;
        if (pausa <= 0) nuevaRonda();
        particles.update(dt);
        return;
      }

      if (fase === 'mostrando') {
        tMostrar -= dt;
        if (tMostrar <= 0) {
          if (encendido >= 0) {
            encendido = -1;
            tMostrar = 0.14;
            if (indiceMostrar >= secuencia.length) {
              fase = 'repitiendo';
              turno = 0;
              paso = 0;
              ui.banner(`Turno de <b style="color:${players[0].color}">${players[0].name}</b>`);
              audio.select();
            }
          } else {
            if (indiceMostrar < secuencia.length) {
              encendido = secuencia[indiceMostrar];
              indiceMostrar++;
              // La secuencia se acelera un poco al crecer: presiona la memoria.
              tMostrar = Math.max(0.22, 0.52 - secuencia.length * 0.012);
              audio.tone({ freq: COLORES[encendido].freq, dur: tMostrar * 0.9, gain: 0.18, type: 'square' });
              haptics.play('tap');
            }
          }
        }
        return;
      }

      // fase === 'repitiendo'
      const pl = input.player(turno);
      for (let d = 0; d < 4; d++) {
        if (!pl.pressed(COLORES[d].dir)) continue;
        encendido = d;
        setTimeout(() => { if (encendido === d) encendido = -1; }, 160);
        audio.tone({ freq: COLORES[d].freq, dur: 0.16, gain: 0.2, type: 'square' });
        haptics.play('click', { player: turno });

        if (d === secuencia[paso]) {
          paso++;
          aciertos[turno]++;
          if (paso >= secuencia.length) {
            if (turno === 0) {
              turno = 1;
              paso = 0;
              ui.banner(`Turno de <b style="color:${players[1].color}">${players[1].name}</b>`);
              audio.select();
            } else {
              // Los dos completaron: se alarga la secuencia conservando el
              // prefijo anterior, que es lo que hace que sea un juego de memoria.
              audio.arp([523, 659, 784]);
              haptics.play('score');
              ui.banner('¡Los dos! La secuencia crece');
              fase = 'esperandoRonda';
              pausa = 0.9;
            }
          }
        } else {
          fallar(turno, d);
        }
        break;
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#05050f');

      const cx = W / 2, cy = H * 0.5;
      const R = Math.min(W, H) * 0.26;
      const r = R * 0.42;

      // Cuatro pétalos, uno por dirección
      const pos = [
        [cx, cy - R * 0.62],
        [cx + R * 0.62, cy],
        [cx, cy + R * 0.62],
        [cx - R * 0.62, cy],
      ];
      for (let d = 0; d < 4; d++) {
        const [x, y] = pos[d];
        const on = encendido === d;
        g.save();
        if (on) { g.shadowColor = COLORES[d].color; g.shadowBlur = 44; }
        g.globalAlpha = on ? 1 : 0.30;
        g.fillStyle = COLORES[d].color;
        g.beginPath(); g.arc(x, y, r * (on ? 1.1 : 1), 0, TAU); g.fill();
        g.restore();
        g.strokeStyle = '#ffffff22';
        g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
        ctx.engine.text(['↑', '→', '↓', '←'][d], x, y, { size: 22, color: '#00000099' });
      }

      // Centro
      g.fillStyle = '#0d0d18';
      g.beginPath(); g.arc(cx, cy, r * 0.8, 0, TAU); g.fill();
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 2;
      g.stroke();
      ctx.engine.text(String(secuencia.length), cx, cy, { size: 20, color: '#ffffffcc' });

      // Progreso de la repetición
      if (fase === 'repitiendo') {
        const col = players[turno].color;
        for (let k = 0; k < secuencia.length; k++) {
          const bx = cx - (secuencia.length * 12) / 2 + k * 12;
          g.fillStyle = k < paso ? col : '#ffffff22';
          g.fillRect(bx, cy + R + 30, 8, 8);
        }
      }

      particles.render(g);
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function fallar(quien, pulsado) {
    fase = 'fallo';
    pausa = 1.6;
    audio.lose();
    haptics.defeat(quien);
    ctx.shake(14);
    ui.banner(`<b style="color:${players[quien].color}">${players[quien].name}</b> falló · era ${COLORES[secuencia[paso]].nombre}`);
    particles.burst(W / 2, H * 0.5, 30, { speed: 240, color: players[quien].color, size: 5 });
    sb.update(aciertos[0], aciertos[1]);
    ganador = 1 - quien;
  }

  function resolverFinal() {
    ctx.finish({
      winner: ganador,
      scores: [aciertos[0], aciertos[1]],
      detail: `Secuencia de ${secuencia.length} pasos`,
      record: ctx.record('secuencia', secuencia.length, 'high'),
    });
  }
}
