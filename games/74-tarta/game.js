/**
 * Tarta a la Cara — piedra, papel o tijera con tartazos de por medio.
 *
 * Lanzar gana a Esquivar (la salpicadura te alcanza igual), Esquivar gana a
 * Cubrirse (te apartas mientras el otro se protege de nada) y Cubrirse gana
 * a Lanzar (el tartazo se estrella contra el escudo). Un ciclo clásico de
 * piedra-papel-tijera, con tartas. Al mejor de cinco.
 */

import { TAU } from '../../core/math2d.js';
import { PATHS } from '../../core/icons.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const PARA_GANAR = 5;
const OPCIONES = ['lanzar', 'esquivar', 'cubrir'];
const ETIQUETAS = { lanzar: 'Lanzar', esquivar: 'Esquivar', cubrir: 'Cubrirse' };
const ICONOS = { lanzar: 'pie', esquivar: 'dash', cubrir: 'shield' };

/** Dibuja un icono de core/icons.js en canvas (los paths están en un box de 24x24). */
function dibujarIcono(g, nombre, x, y, size, color) {
  const path = new Path2D(PATHS[nombre]);
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.fillStyle = color;
  g.fill(path);
  g.restore();
}
// lanzar > esquivar > cubrir > lanzar
const GANA_A = { lanzar: 'esquivar', esquivar: 'cubrir', cubrir: 'lanzar' };

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let cursor = [0, 0];
  let elegido = [null, null];
  let fase = 'eligiendo';
  const score = [0, 0];
  let pausa = 0;
  let sb = null;
  let mensaje = '';

  function nuevaRonda() {
    cursor = [0, 0];
    elegido = [null, null];
    fase = 'eligiendo';
    mensaje = '';
  }

  return {
    init() { W = ctx.W; H = ctx.H; nuevaRonda(); sb = ui.scoreboard({ center: `a ${PARA_GANAR}` }); },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (fase === 'resuelto') {
        pausa -= dt;
        if (pausa <= 0) {
          const g = score.findIndex((s) => s >= PARA_GANAR);
          if (g >= 0) ctx.finish({ winner: g, scores: [score[0], score[1]] });
          else nuevaRonda();
        }
        particles.update(dt);
        return;
      }

      for (let j = 0; j < 2; j++) {
        if (elegido[j] != null) continue;
        const pl = input.player(j);
        if (pl.pressed('up')) { cursor[j] = 0; audio.tick(); }
        if (pl.pressed('left')) { cursor[j] = 1; audio.tick(); }
        if (pl.pressed('down')) { cursor[j] = 2; audio.tick(); }
        if (pl.pressed('a')) {
          elegido[j] = OPCIONES[cursor[j]];
          audio.select();
          haptics.play('click', { player: j });
        }
      }
      if (elegido[0] != null && elegido[1] != null) resolver();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#1a0f1c');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a1830'); grd.addColorStop(1, '#160c1a');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      particles.render(g);

      for (let j = 0; j < 2; j++) {
        const bx = j === 0 ? W * 0.25 : W * 0.75;
        const col = players[j].color;
        if (fase === 'eligiendo') {
          OPCIONES.forEach((op, i) => {
            const y = H * 0.32 + i * 70;
            const sel = cursor[j] === i && elegido[j] == null;
            g.save();
            g.globalAlpha = elegido[j] != null ? (elegido[j] === op ? 1 : 0.25) : (sel ? 1 : 0.5);
            dibujarIcono(g, ICONOS[op], bx, y, 32, col);
            g.restore();
            if (sel) {
              g.strokeStyle = col; g.lineWidth = 2;
              g.beginPath(); g.arc(bx, y, 28, 0, TAU); g.stroke();
            }
            ctx.engine.text(ETIQUETAS[op], bx, y + 40, { size: 10, color: '#ffffff88', font: 'system-ui' });
          });
        } else {
          dibujarIcono(g, ICONOS[elegido[j]], bx, H * 0.42, 54, col);
          ctx.engine.text(ETIQUETAS[elegido[j]], bx, H * 0.42 + 50, { size: 13, color: col, font: 'system-ui' });
        }
        ctx.engine.text(players[j].name, bx, H * 0.16, { size: 12, color: col, font: 'system-ui' });
      }

      if (fase === 'resuelto' && mensaje) {
        ctx.engine.text(mensaje, W / 2, H * 0.72, { size: 16, color: '#ffffffcc', font: 'system-ui' });
      }
    },

    destroy() { sb?.remove(); },
  };

  function resolver() {
    fase = 'resuelto';
    pausa = 1.8;
    const [a, b] = elegido;
    let ganador = -1;
    if (a !== b) ganador = GANA_A[a] === b ? 0 : 1;

    if (ganador === -1) {
      mensaje = 'Empate: ambos igual';
      audio.arp([440, 440]);
    } else {
      score[ganador]++;
      sb.update(score[0], score[1]);
      mensaje = `${players[ganador].name} gana la ronda`;
      audio.score(ganador);
      haptics.score(ganador);
      const bx = ganador === 0 ? W * 0.75 : W * 0.25;
      particles.burst(bx, H * 0.42, 20, { speed: 200, color: players[ganador].color, size: 4 });
    }
  }
}
