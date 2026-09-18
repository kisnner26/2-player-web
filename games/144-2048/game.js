/**
 * 2048 Duelo — el mismo puzle de siempre, pero con alguien saboteándote.
 *
 * Cada fusión de 64 o más manda una ROCA al tablero del rival: una pieza que
 * no se fusiona con nada y que ocupa sitio para siempre. Eso da la vuelta al
 * juego original: allí interesaba construir una torre enorme sin prisa, y aquí
 * las torres grandes son justo lo que arma al enemigo.
 *
 * Se pierde cuando no queda ningún movimiento posible. Con dos o tres rocas
 * mal puestas, un tablero cómodo se ahoga en cuatro turnos.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const N = 4;
const ROCA = -1;
const META = 1024;
const COLOR = {
  2: '#2f3a52', 4: '#3a4a6b', 8: '#4a6ba0', 16: '#3aa0ff', 32: '#00e5ff',
  64: '#a8ff3e', 128: '#ffd166', 256: '#ff8c42', 512: '#ff2e88', 1024: '#b04cff', 2048: '#ffffff',
};

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 0, lado = 0;
  const lados = [crear(0), crear(1)];
  let sb = null, terminado = false, t = 0;

  function crear(i) {
    return { i, rej: new Array(N * N).fill(0), puntos: 0, mejor: 0,
             aviso: 0, texto: '', rocas: 0, sacudida: 0, nuevas: [] };
  }

  const k = (x, y) => y * N + x;

  function nueva(L, forzarRoca = false) {
    const libres = [];
    for (let i = 0; i < N * N; i++) if (L.rej[i] === 0) libres.push(i);
    if (!libres.length) return false;
    const p = libres[Math.floor(rng() * libres.length)];
    L.rej[p] = forzarRoca ? ROCA : (rng() < 0.88 ? 2 : 4);
    L.nuevas.push({ p, vida: 0.28 });
    return true;
  }

  /**
   * Desliza en una dirección. Devuelve los puntos ganados y la fusión mayor.
   * Las rocas no se mueven ni se fusionan: son tapones.
   */
  function mover(L, dx, dy) {
    const antes = L.rej.join(',');
    let ganados = 0, mayor = 0;

    // Se recorre cada línea desde el borde de destino hacia atrás.
    const lineas = [];
    if (dx !== 0) {
      for (let y = 0; y < N; y++) {
        const fila = [];
        for (let x = 0; x < N; x++) fila.push(k(x, y));
        lineas.push(dx > 0 ? fila.slice().reverse() : fila);
      }
    } else {
      for (let x = 0; x < N; x++) {
        const col = [];
        for (let y = 0; y < N; y++) col.push(k(x, y));
        lineas.push(dy > 0 ? col.slice().reverse() : col);
      }
    }

    for (const linea of lineas) {
      // Cada tramo entre rocas se compacta por separado.
      let tramo = [];
      const tramos = [];
      for (const c of linea) {
        if (L.rej[c] === ROCA) { tramos.push(tramo); tramo = []; }
        else tramo.push(c);
      }
      tramos.push(tramo);

      for (const celdas of tramos) {
        const vals = celdas.map((c) => L.rej[c]).filter((v) => v > 0);
        const salida = [];
        for (let i = 0; i < vals.length; i++) {
          if (i + 1 < vals.length && vals[i] === vals[i + 1]) {
            const v = vals[i] * 2;
            salida.push(v);
            ganados += v;
            mayor = Math.max(mayor, v);
            i++;
          } else salida.push(vals[i]);
        }
        celdas.forEach((c, i) => { L.rej[c] = salida[i] || 0; });
      }
    }

    if (L.rej.join(',') === antes) return null;
    return { ganados, mayor };
  }

  function hayMovimiento(L) {
    for (let i = 0; i < N * N; i++) if (L.rej[i] === 0) return true;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = L.rej[k(x, y)];
        if (v <= 0) continue;
        if (x + 1 < N && L.rej[k(x + 1, y)] === v) return true;
        if (y + 1 < N && L.rej[k(x, y + 1)] === v) return true;
      }
    }
    return false;
  }

  function medir() {
    celda = Math.floor(Math.min((W * 0.4) / N, (H - 130) / N));
    lado = celda * N;
  }

  const tabX = (i) => (i === 0 ? W * 0.5 - lado - 28 : W * 0.5 + 28);
  const tabY = () => (H - lado) / 2 + 8;

  function acabar(perdedor, motivo) {
    if (terminado) return;
    terminado = true;
    const g = 1 - perdedor;
    audio.win();
    haptics.victory(g);
    ctx.finish({
      winner: g,
      scores: [lados[0].puntos, lados[1].puntos],
      detail: motivo,
      record: ctx.record('puntos', Math.max(lados[0].puntos, lados[1].puntos), 'high'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      for (const L of lados) { nueva(L); nueva(L); }
      sb = ui.scoreboard({ center: `llega a ${META}` });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const L of lados) {
        const pl = input.player(L.i);
        L.aviso = Math.max(0, L.aviso - dt);
        L.sacudida = Math.max(0, L.sacudida - dt * 20);
        for (let i = L.nuevas.length - 1; i >= 0; i--) {
          L.nuevas[i].vida -= dt;
          if (L.nuevas[i].vida <= 0) L.nuevas.splice(i, 1);
        }

        let dx = 0, dy = 0;
        if (pl.pressed('left')) dx = -1;
        else if (pl.pressed('right')) dx = 1;
        else if (pl.pressed('up')) dy = -1;
        else if (pl.pressed('down')) dy = 1;
        if (!dx && !dy) continue;

        const r = mover(L, dx, dy);
        if (!r) { audio.tone({ freq: 150, dur: 0.05, gain: 0.07, type: 'square' }); continue; }

        L.puntos += r.ganados;
        L.mejor = Math.max(L.mejor, ...L.rej.filter((v) => v > 0));
        nueva(L);
        audio.tone({ freq: 300 + Math.min(r.mayor, 512) * 0.5, dur: 0.06, gain: 0.13, type: 'triangle' });
        if (r.mayor >= 8) haptics.click(L.i);

        // El ataque: una fusión gorda le mete una roca al otro.
        if (r.mayor >= 64) {
          const otro = lados[1 - L.i];
          const rocas = r.mayor >= 256 ? 2 : 1;
          for (let n = 0; n < rocas; n++) if (nueva(otro, true)) otro.rocas++;
          otro.aviso = 1.3;
          otro.texto = `+${rocas} roca${rocas > 1 ? 's' : ''}`;
          otro.sacudida = 6;
          audio.hit();
          haptics.impact(otro.i, 1);
        }

        if (r.mayor >= META) { acabar(1 - L.i, `${players[L.i].name} llega a ${META}`); return; }
        if (!hayMovimiento(L)) { acabar(L.i, `${players[L.i].name} se queda sin movimientos`); return; }
      }

      sb.update(lados[0].puntos, lados[1].puntos);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0a14');

      for (const L of lados) {
        const ox = tabX(L.i) + (L.sacudida ? (rng() - 0.5) * L.sacudida : 0);
        const oy = tabY();
        const col = players[L.i].color;

        g.fillStyle = '#161726';
        g.beginPath(); g.roundRect(ox - 6, oy - 6, lado + 12, lado + 12, 10); g.fill();
        g.strokeStyle = `${col}55`;
        g.lineWidth = 2;
        g.stroke();

        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const v = L.rej[k(x, y)];
            const px = ox + x * celda + 4, py = oy + y * celda + 4;
            const s = celda - 8;
            g.fillStyle = '#20223a';
            g.beginPath(); g.roundRect(px, py, s, s, 6); g.fill();
            if (v === 0) continue;

            const brote = L.nuevas.find((n) => n.p === k(x, y));
            const escala = brote ? 0.6 + (1 - brote.vida / 0.28) * 0.4 : 1;
            g.save();
            g.translate(px + s / 2, py + s / 2);
            g.scale(escala, escala);
            if (v === ROCA) {
              g.fillStyle = '#4c4560';
              g.beginPath(); g.roundRect(-s / 2, -s / 2, s, s, 6); g.fill();
              g.fillStyle = '#6a6280';
              g.beginPath();
              g.moveTo(-s * 0.3, s * 0.2); g.lineTo(-s * 0.05, -s * 0.25);
              g.lineTo(s * 0.25, s * 0.15); g.closePath(); g.fill();
            } else {
              const c = COLOR[v] || '#ffffff';
              g.fillStyle = c;
              if (v >= 128) { g.shadowColor = c; g.shadowBlur = 16; }
              g.beginPath(); g.roundRect(-s / 2, -s / 2, s, s, 6); g.fill();
              g.shadowBlur = 0;
              ctx.engine.text(String(v), 0, 1, {
                size: Math.floor(s * (v >= 1000 ? 0.26 : v >= 100 ? 0.32 : 0.4)),
                color: v <= 8 ? '#dfe6ff' : '#0d0d16',
                font: 'system-ui',
              });
            }
            g.restore();
          }
        }

        ctx.engine.text(`${players[L.i].name} · ${L.puntos}`, ox + lado / 2, oy - 20,
          { size: 12, color: col, font: 'system-ui' });
        if (L.rocas) {
          ctx.engine.text(`${L.rocas} rocas recibidas`, ox + lado / 2, oy + lado + 20,
            { size: 11, color: '#7a7290', font: 'system-ui' });
        }
        if (L.aviso > 0) {
          g.save();
          g.globalAlpha = clamp(L.aviso, 0, 1);
          ctx.engine.text(L.texto, ox + lado / 2, oy + lado / 2, { size: 22, color: '#ff4757', glow: 16 });
          g.restore();
        }
      }

      particles.render(g);
      ctx.engine.text('Fusiona con las direcciones · toda fusión de 64 o más manda una roca al rival',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
