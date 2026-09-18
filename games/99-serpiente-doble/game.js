/**
 * Serpiente Doble — dos serpientes, un tablero, una manzana cada vez.
 *
 * Lo de siempre pero a dos: creces al comer y mueres si chocas con un muro,
 * contigo misma o con la otra. Como comparten tablero, la estrategia real es
 * cerrarle el paso al rival con tu propio cuerpo.
 *
 * Regla de choque frontal: si las dos cabezas caen en la misma celda el mismo
 * turno, mueren las dos. Sin eso, quien se moviera primero tendría ventaja
 * gratis y el juego dejaría de ser justo.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 27, FILAS = 19;
const PASO_INI = 0.16;            // segundos por casilla
const PASO_MIN = 0.075;
const CRECE = 3;                  // segmentos por manzana

export function create(ctx) {
  const { input, audio, haptics, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 22, offX = 0, offY = 0;
  let manzana = { x: 0, y: 0 };
  let paso = PASO_INI, acum = 0;
  let estado = 'jugando';          // jugando | fin
  let finPausa = 0;
  let aviso = '', avisoT = 0;

  const ser = [crear(0), crear(1)];

  function crear(i) {
    const y = Math.floor(FILAS / 2);
    const x = i === 0 ? 5 : COLS - 6;
    const dir = i === 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    return {
      i, cuerpo: [{ x, y }, { x: x - dir.x, y }, { x: x - dir.x * 2, y }],
      dir, sig: { ...dir }, viva: true, comidas: 0,
    };
  }

  function medir() {
    celda = Math.floor(Math.min((W - 60) / COLS, (H - 130) / FILAS));
    celda = clamp(celda, 10, 30);
    offX = Math.floor((W - COLS * celda) / 2);
    offY = Math.floor((H - FILAS * celda) / 2) + 18;
  }

  const decir = (t) => { aviso = t; avisoT = 2; };
  const ocupada = (x, y) => ser.some((s) => s.viva && s.cuerpo.some((c) => c.x === x && c.y === y));

  function nuevaManzana() {
    let x, y, intentos = 0;
    do {
      x = Math.floor(rng() * COLS);
      y = Math.floor(rng() * FILAS);
      intentos++;
    } while (ocupada(x, y) && intentos < 300);
    manzana = { x, y };
  }

  function reiniciar() {
    ser[0] = crear(0); ser[1] = crear(1);
    paso = PASO_INI; acum = 0;
    estado = 'jugando';
    nuevaManzana();
  }

  /** Lee el giro pedido; no se permite el giro de 180º (te comerías el cuello). */
  function leerGiro(s) {
    const p = input.player(s.i);
    const opciones = [
      [p.pressed('up'), { x: 0, y: -1 }],
      [p.pressed('down'), { x: 0, y: 1 }],
      [p.pressed('left'), { x: -1, y: 0 }],
      [p.pressed('right'), { x: 1, y: 0 }],
    ];
    for (const [pulsado, d] of opciones) {
      if (!pulsado) continue;
      if (d.x === -s.dir.x && d.y === -s.dir.y) continue;
      s.sig = d;
      return;
    }
  }

  function avanzar() {
    // 1. Todas calculan su cabeza nueva ANTES de resolver choques, para que
    //    el orden de los jugadores no decida quién gana un empate.
    const cabezas = ser.map((s) => {
      if (!s.viva) return null;
      s.dir = s.sig;
      return { x: s.cuerpo[0].x + s.dir.x, y: s.cuerpo[0].y + s.dir.y };
    });

    const muere = [false, false];
    for (let i = 0; i < 2; i++) {
      const h = cabezas[i];
      if (!h) continue;
      if (h.x < 0 || h.y < 0 || h.x >= COLS || h.y >= FILAS) { muere[i] = true; continue; }
      // Contra cualquier cuerpo (el propio o el ajeno)
      for (const s of ser) {
        if (!s.viva) continue;
        // La cola se libera si esa serpiente no come este turno
        const comeEsta = cabezas[s.i] && cabezas[s.i].x === manzana.x && cabezas[s.i].y === manzana.y;
        const cuerpo = comeEsta ? s.cuerpo : s.cuerpo.slice(0, -1);
        if (cuerpo.some((c) => c.x === h.x && c.y === h.y)) { muere[i] = true; break; }
      }
    }
    // Choque frontal: misma casilla el mismo turno → caen las dos
    if (cabezas[0] && cabezas[1] && cabezas[0].x === cabezas[1].x && cabezas[0].y === cabezas[1].y) {
      muere[0] = muere[1] = true;
    }

    for (let i = 0; i < 2; i++) {
      const s = ser[i];
      if (!s.viva) continue;
      if (muere[i]) {
        s.viva = false;
        particles.burst(offX + s.cuerpo[0].x * celda + celda / 2, offY + s.cuerpo[0].y * celda + celda / 2, 20, {
          speed: 190, dir: -Math.PI / 2, spread: Math.PI * 2,
          color: players[i].color, size: 3, shape: 'spark', drag: 0.93,
        });
        audio.explosion();
        haptics.explosion(i);
        ctx.shake(5, 6);
        continue;
      }
      s.cuerpo.unshift(cabezas[i]);
      if (cabezas[i].x === manzana.x && cabezas[i].y === manzana.y) {
        s.comidas++;
        for (let k = 0; k < CRECE - 1; k++) s.cuerpo.push({ ...s.cuerpo[s.cuerpo.length - 1] });
        paso = Math.max(PASO_MIN, paso * 0.965);
        audio.blip();
        haptics.play('score', { player: i });
        particles.burst(offX + manzana.x * celda + celda / 2, offY + manzana.y * celda + celda / 2, 12, {
          speed: 140, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ff2e5b', size: 2.4, drag: 0.91,
        });
        nuevaManzana();
        decir(`${players[i].name}: ${s.comidas}`);
      } else {
        s.cuerpo.pop();
      }
    }

    if (!ser[0].viva || !ser[1].viva) {
      estado = 'fin';
      finPausa = 1.4;
    }
  }

  return {
    init() { medir(); reiniciar(); },
    resize(w, h) { W = w; H = h; medir(); },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (estado === 'fin') {
        finPausa -= dt;
        if (finPausa <= 0) {
          const [a, b] = ser;
          let winner = -1;
          if (a.viva !== b.viva) winner = a.viva ? 0 : 1;
          else if (a.comidas !== b.comidas) winner = a.comidas > b.comidas ? 0 : 1;
          ctx.finish({
            winner,
            scores: [a.comidas, b.comidas],
            detail: a.viva === b.viva ? 'Chocaron a la vez' : `${a.comidas} vs ${b.comidas} manzanas`,
            record: ctx.record('manzanas', Math.max(a.comidas, b.comidas), 'high'),
          });
        }
        return;
      }

      for (const s of ser) if (s.viva) leerGiro(s);
      acum += dt;
      if (acum >= paso) { acum = 0; avanzar(); }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07100b');

      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          g.fillStyle = (x + y) % 2 ? '#0f1e14' : '#122318';
          g.fillRect(offX + x * celda, offY + y * celda, celda, celda);
        }
      }
      g.strokeStyle = '#ffffff26'; g.lineWidth = 2;
      g.strokeRect(offX, offY, COLS * celda, FILAS * celda);

      // Manzana
      const mx = offX + manzana.x * celda + celda / 2, my = offY + manzana.y * celda + celda / 2;
      g.save();
      g.shadowColor = '#ff2e5b'; g.shadowBlur = 14;
      g.fillStyle = '#ff2e5b';
      g.beginPath(); g.arc(mx, my, celda * 0.32, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = '#3fbf5a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(mx, my - celda * 0.3); g.lineTo(mx + celda * 0.16, my - celda * 0.46); g.stroke();

      // Serpientes
      for (const s of ser) {
        const col = players[s.i].color;
        s.cuerpo.forEach((c, k) => {
          const px = offX + c.x * celda, py = offY + c.y * celda;
          g.save();
          if (!s.viva) g.globalAlpha = 0.32;
          if (k === 0) { g.shadowColor = col; g.shadowBlur = 14; }
          g.fillStyle = k === 0 ? col : col + 'bb';
          const m = k === 0 ? 1 : 2.5;
          if (g.roundRect) { g.beginPath(); g.roundRect(px + m, py + m, celda - m * 2, celda - m * 2, k === 0 ? 6 : 4); g.fill(); }
          else g.fillRect(px + m, py + m, celda - m * 2, celda - m * 2);
          if (k === 0) {
            g.shadowBlur = 0; g.fillStyle = '#08120c';
            const ox = s.dir.x * celda * 0.13, oy = s.dir.y * celda * 0.13;
            const px2 = px + celda / 2 + ox, py2 = py + celda / 2 + oy;
            const perp = { x: -s.dir.y, y: s.dir.x };
            g.beginPath(); g.arc(px2 + perp.x * celda * 0.16, py2 + perp.y * celda * 0.16, celda * 0.09, 0, Math.PI * 2); g.fill();
            g.beginPath(); g.arc(px2 - perp.x * celda * 0.16, py2 - perp.y * celda * 0.16, celda * 0.09, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        });
      }

      particles.render(g);

      for (let i = 0; i < 2; i++) {
        ctx.engine.text(`${players[i].name} · ${ser[i].comidas}`, i === 0 ? 16 : W - 16, 26, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
      if (avisoT > 0) ctx.engine.text(aviso, W / 2, 26, { size: 12, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('Come manzanas y crece · chocar con un muro, contigo o con la otra te mata',
        W / 2, H - 12, { size: 10.5, color: '#ffffff55', font: 'system-ui' });
    },

    destroy() {},
  };
}
