/**
 * Torres de Hanói Duelo — dos torres idénticas y una carrera a la vez.
 *
 * Cinco discos se resuelven en 31 movimientos exactos y no hay forma de
 * hacerlo en menos: el puzle está resuelto desde 1883. Así que esto no es un
 * duelo de ingenio, es un duelo de EJECUCIÓN — los dos sabéis lo que hay que
 * hacer y pierde quien se equivoque de poste bajo presión.
 *
 * El contador de movimientos va a la vista y marca en rojo cuando te pasas del
 * mínimo. Duele más que el reloj.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DISCOS = 5;
const MINIMO = 2 ** DISCOS - 1;
const COLORES = ['#ff2e88', '#ff8c42', '#ffd166', '#a8ff3e', '#00e5ff', '#b04cff'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [crear(0), crear(1)];
  let sb = null, terminado = false, t = 0;

  function crear(i) {
    return {
      i,
      postes: [Array.from({ length: DISCOS }, (_, k) => DISCOS - k), [], []],
      mano: -1,          // disco en la mano, o -1
      poste: 0,
      movs: 0,
      error: 0,
      brillo: 0,
    };
  }

  function agarrarOsoltar(p) {
    const pila = p.postes[p.poste];
    if (p.mano < 0) {
      if (!pila.length) { fallo(p); return; }
      p.mano = pila.pop();
      audio.tone({ freq: 500 + p.mano * 60, dur: 0.05, gain: 0.12, type: 'triangle' });
      haptics.tick(p.i);
      return;
    }
    // Soltar: solo sobre un disco mayor o sobre el poste vacío.
    if (pila.length && pila[pila.length - 1] < p.mano) { fallo(p); return; }
    pila.push(p.mano);
    p.mano = -1;
    p.movs++;
    p.brillo = 0.25;
    audio.place();
    haptics.play('click', { player: p.i });

    if (p.postes[2].length === DISCOS) ganar(p);
  }

  function fallo(p) {
    p.error = 0.4;
    audio.error();
    haptics.error(p.i);
    ctx.shake(3);
  }

  function ganar(p) {
    if (terminado) return;
    terminado = true;
    audio.win();
    haptics.victory(p.i);
    particles.burst(centroX(p.i), H * 0.4, 40, { speed: 320, color: players[p.i].color, size: 5, drag: 0.9 });
    ctx.finish({
      winner: p.i,
      scores: [jug[0].movs, jug[1].movs],
      detail: p.movs === MINIMO ? `¡Perfecto: ${MINIMO} movimientos!` : `${p.movs} movimientos (el mínimo son ${MINIMO})`,
      record: ctx.record('movimientos', p.movs, 'low'),
    });
  }

  const centroX = (i) => W * (i === 0 ? 0.27 : 0.73);
  const anchoZona = () => Math.min(W * 0.42, 460);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: `${DISCOS} discos · mínimo ${MINIMO}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const p of jug) {
        p.error = Math.max(0, p.error - dt);
        p.brillo = Math.max(0, p.brillo - dt);
        const pl = input.player(p.i);
        if (pl.pressed('left')) { p.poste = (p.poste + 2) % 3; audio.tick(); }
        if (pl.pressed('right')) { p.poste = (p.poste + 1) % 3; audio.tick(); }
        if (pl.pressed('a') || pl.pressed('down') || pl.pressed('up')) agarrarOsoltar(p);
      }

      sb.update(jug[0].movs, jug[1].movs);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#08070f');

      const zona = anchoZona();
      const base = H * 0.74;
      const altoDisco = Math.min(24, (H * 0.4) / DISCOS);

      for (const p of jug) {
        const cx = centroX(p.i);
        const col = players[p.i].color;
        const sepPoste = zona / 3;

        g.save();
        if (p.error > 0) {
          g.translate((Math.random() - 0.5) * p.error * 20, 0);
        }

        // Suelo
        g.fillStyle = '#1a1526';
        g.fillRect(cx - zona / 2, base, zona, 12);

        for (let k = 0; k < 3; k++) {
          const px = cx - zona / 2 + sepPoste * (k + 0.5);
          const activo = p.poste === k;
          // Poste
          g.fillStyle = activo ? '#4a3f66' : '#2c2540';
          g.fillRect(px - 4, base - altoDisco * (DISCOS + 1.6), 8, altoDisco * (DISCOS + 1.6));
          if (k === 2) {
            g.strokeStyle = `${col}55`;
            g.lineWidth = 2;
            g.setLineDash([4, 5]);
            g.strokeRect(px - sepPoste * 0.44, base - altoDisco * (DISCOS + 1.2), sepPoste * 0.88, altoDisco * (DISCOS + 1.2));
            g.setLineDash([]);
          }

          p.postes[k].forEach((d, n) => {
            const an = sepPoste * (0.28 + (d / DISCOS) * 0.6);
            const y = base - (n + 1) * altoDisco;
            g.save();
            if (p.brillo > 0 && n === p.postes[k].length - 1) { g.shadowColor = col; g.shadowBlur = 20; }
            g.fillStyle = COLORES[d - 1];
            g.beginPath(); g.roundRect(px - an / 2, y, an, altoDisco - 3, 6); g.fill();
            g.restore();
            g.fillStyle = '#ffffff28';
            g.fillRect(px - an / 2 + 3, y + 2, an - 6, 3);
          });

          if (activo) {
            const puntaY = base - altoDisco * (DISCOS + 2.2);
            g.fillStyle = col;
            g.beginPath();
            g.moveTo(px, puntaY + 14);
            g.lineTo(px - 9, puntaY);
            g.lineTo(px + 9, puntaY);
            g.fill();
            if (p.mano > 0) {
              const an = sepPoste * (0.28 + (p.mano / DISCOS) * 0.6);
              g.save();
              g.shadowColor = COLORES[p.mano - 1];
              g.shadowBlur = 18;
              g.fillStyle = COLORES[p.mano - 1];
              g.beginPath();
              g.roundRect(px - an / 2, puntaY + 20 + Math.sin(t * 6) * 3, an, altoDisco - 3, 6);
              g.fill();
              g.restore();
            }
          }
        }
        g.restore();

        ctx.engine.text(players[p.i].name, cx, H * 0.14, { size: 15, color: col, font: 'system-ui' });
        const exceso = p.movs > MINIMO;
        ctx.engine.text(`${p.movs} mov.`, cx, H * 0.2, {
          size: 22, color: exceso ? '#ff4757' : '#f2f2ff',
        });
        if (exceso) {
          ctx.engine.text(`+${p.movs - MINIMO} sobre el mínimo`, cx, H * 0.245,
            { size: 11, color: '#ff475799', font: 'system-ui' });
        }
      }

      g.strokeStyle = '#ffffff10';
      g.beginPath(); g.moveTo(W / 2, H * 0.12); g.lineTo(W / 2, H * 0.86); g.stroke();

      particles.render(g);
      ctx.engine.text('←/→ cambian de poste · tu tecla coge y suelta · nunca un disco grande sobre uno pequeño',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
