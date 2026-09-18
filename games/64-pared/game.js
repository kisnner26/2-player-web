/**
 * Pintar la Pared — cooperativo con un castigo muy concreto: pisarse.
 *
 * La pared es una cuadrícula. Cada uno pinta con su color, y pintar encima de
 * lo del otro no lo mejora: lo convierte en MANCHA, que resta y ya no se puede
 * arreglar. Así que el juego no va de pintar rápido, va de repartirse la pared
 * en los primeros diez segundos.
 *
 * Y como quedarse quieto sobre una celda ya pintada hace que chorree, tampoco
 * se puede aparcar la brocha: hay que avanzar siempre.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 22, FILAS = 13;
const DURACION = 65;
const VEL = 210;
const OBJETIVO = 0.9;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let celdas = [];             // -1 vacía, 0/1 pintada, 2 mancha
  let brocha = [];
  let pintadas = [0, 0], manchas = 0, goteos = 0;
  let tiempo = DURACION;
  let sb = null, terminado = false;

  const cellW = () => (W * 0.88) / COLS;
  const cellH = () => (H * 0.66) / FILAS;
  const ox = () => W * 0.06;
  const oy = () => H * 0.2;

  function reiniciar() {
    celdas = new Array(COLS * FILAS).fill(-1);
    brocha = [
      { i: 0, x: ox() + cellW() * 2, y: oy() + cellH() * 2, quieto: 0, ultima: -1 },
      { i: 1, x: ox() + cellW() * (COLS - 3), y: oy() + cellH() * (FILAS - 3), quieto: 0, ultima: -1 },
    ];
    pintadas = [0, 0]; manchas = 0; goteos = 0;
    tiempo = DURACION;
    terminado = false;
  }

  const indice = (cx, cy) => (cx < 0 || cy < 0 || cx >= COLS || cy >= FILAS ? -1 : cy * COLS + cx);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Cubran la pared · pintar sobre lo del otro hace <b>mancha</b>');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      for (const b of brocha) {
        const pl = input.player(b.i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        const movio = dx !== 0 || dy !== 0;
        b.x = clamp(b.x + (dx / len) * VEL * dt, ox(), ox() + cellW() * COLS);
        b.y = clamp(b.y + (dy / len) * VEL * dt, oy(), oy() + cellH() * FILAS);

        const cx = Math.floor((b.x - ox()) / cellW());
        const cy = Math.floor((b.y - oy()) / cellH());
        const k = indice(cx, cy);
        if (k < 0) continue;

        if (k === b.ultima) {
          b.quieto += dt;
          // Chorreón: castiga aparcar la brocha en la misma celda.
          if (b.quieto > 1.3 && celdas[k] === b.i) {
            b.quieto = 0;
            goteos++;
            const abajo = indice(cx, cy + 1);
            if (abajo >= 0 && celdas[abajo] === -1) {
              celdas[abajo] = 2;
              manchas++;
              audio.tone({ freq: 130, dur: 0.14, gain: 0.12, type: 'sine', sweep: -60 });
              haptics.play('soft', { player: b.i });
              particles.burst(ox() + (cx + 0.5) * cellW(), oy() + (cy + 1.5) * cellH(), 6, {
                speed: 60, color: '#6b5b4a', size: 3, gravity: 220,
              });
            }
          }
        } else {
          b.quieto = 0;
          b.ultima = k;
          if (!movio) continue;
          const antes = celdas[k];
          if (antes === -1) {
            celdas[k] = b.i;
            pintadas[b.i]++;
            audio.tone({ freq: 420 + b.i * 90, dur: 0.03, gain: 0.06, type: 'triangle' });
          } else if (antes === 1 - b.i) {
            celdas[k] = 2;
            pintadas[1 - b.i]--;
            manchas++;
            audio.error();
            haptics.play('tap', { player: b.i });
            ctx.shake(4);
            particles.burst(ox() + (cx + 0.5) * cellW(), oy() + (cy + 0.5) * cellH(), 8, {
              speed: 110, color: '#6b5b4a', size: 3,
            });
          }
        }
      }

      const cubiertas = celdas.filter((c) => c === 0 || c === 1).length;
      const frac = cubiertas / celdas.length;
      sb.update(pintadas[0], pintadas[1]);
      sb.setCenter(`${Math.round(frac * 100)}% cubierto · ${manchas} manchas · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (frac >= OBJETIVO) return terminar(true);
      if (tiempo <= 0 || !celdas.includes(-1)) return terminar(frac >= OBJETIVO);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#171310');
      g.fillStyle = '#221c17';
      g.fillRect(0, 0, W, H);

      const cw = cellW(), ch = cellH();

      // Pared sin pintar: yeso con junta.
      g.fillStyle = '#3a322b';
      g.fillRect(ox(), oy(), cw * COLS, ch * FILAS);

      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = celdas[y * COLS + x];
          if (c === -1) continue;
          g.fillStyle = c === 2 ? '#6b5b4a' : players[c].color;
          g.globalAlpha = c === 2 ? 0.85 : 0.92;
          g.fillRect(ox() + x * cw, oy() + y * ch, cw - 1, ch - 1);
          g.globalAlpha = 1;
        }
      }

      // Rejilla suave para que se vean las celdas libres
      g.save();
      g.strokeStyle = '#00000030';
      g.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        g.beginPath(); g.moveTo(ox() + x * cw, oy()); g.lineTo(ox() + x * cw, oy() + ch * FILAS); g.stroke();
      }
      for (let y = 0; y <= FILAS; y++) {
        g.beginPath(); g.moveTo(ox(), oy() + y * ch); g.lineTo(ox() + cw * COLS, oy() + y * ch); g.stroke();
      }
      g.restore();

      particles.render(g);

      // Brochas
      for (const b of brocha) {
        const col = players[b.i].color;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(-0.5);
        g.fillStyle = '#8a6a3a';
        g.fillRect(-3, 0, 6, 26);
        g.fillStyle = col;
        g.fillRect(-9, -14, 18, 15);
        g.restore();
        if (b.quieto > 0.9) {
          g.save();
          g.globalAlpha = 0.5 + Math.sin(b.quieto * 18) * 0.4;
          ctx.engine.text('¡gotea!', b.x, b.y - 26, { size: 10, color: '#ffd166' });
          g.restore();
        }
      }

      // Progreso
      const cubiertas = celdas.filter((c) => c === 0 || c === 1).length;
      const frac = cubiertas / celdas.length;
      g.fillStyle = '#ffffff14';
      g.fillRect(W * 0.06, H * 0.92, W * 0.88, 8);
      g.fillStyle = frac >= OBJETIVO ? '#a8ff3e' : '#ffd166';
      g.fillRect(W * 0.06, H * 0.92, W * 0.88 * frac, 8);
      g.save();
      g.strokeStyle = '#a8ff3e';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(W * 0.06 + W * 0.88 * OBJETIVO, H * 0.92 - 4);
      g.lineTo(W * 0.06 + W * 0.88 * OBJETIVO, H * 0.92 + 12);
      g.stroke();
      g.restore();
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(logrado) {
    terminado = true;
    const cubiertas = celdas.filter((c) => c === 0 || c === 1).length;
    const frac = Math.round((cubiertas / celdas.length) * 100);
    let veredicto;
    if (logrado && manchas === 0) veredicto = 'Ni una mancha. Se reparten hasta la pared.';
    else if (logrado) veredicto = `Pared cubierta, con ${manchas} manchas de discusión.`;
    else veredicto = `Se quedó en el ${frac}%: mucho pisarse y poco repartir.`;
    if (logrado) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [pintadas[0], pintadas[1]],
      detail: `${frac}% cubierto · ${manchas} manchas · ${goteos} chorreones · ${veredicto}`,
      record: ctx.record('cubierto', frac, 'high'),
    });
  }
}
