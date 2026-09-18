/**
 * Escaleras y Serpientes — el juego de mesa donde no se decide nada… salvo aquí.
 *
 * La versión de toda la vida es azar puro, así que se le añade la única
 * decisión que le faltaba: cada turno eliges tirar UN dado o DOS. Dos dados
 * avanzan el doble, pero en la recta final hay que caer clavado en la 100 —
 * pasarse rebota— y los tramos con más serpientes están justo ahí.
 *
 * Además: caer en la casilla del rival lo manda al principio de su tramo. Eso
 * convierte ir por detrás en una posición con posibilidades y no en un paseo
 * perdido.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const CASILLAS = 100;
const COLS = 10;

/** origen → destino. Escaleras hacia arriba, serpientes hacia abajo. */
const ESCALERAS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92 };
const SERPIENTES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 95: 75, 99: 80 };

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 0, ox = 0, oy = 0;
  const pos = [0, 0];
  const anim = [0, 0];
  let turno = 0, fase = 'eligiendo', espera = 0, t = 0, terminado = false;
  let dados = [], mensaje = 'Una tecla: un dado · la otra: dos dados', sb = null;

  function medir() {
    celda = Math.floor(Math.min((W - 260) / COLS, (H - 90) / COLS));
    ox = (W - celda * COLS) / 2 - 60;
    oy = (H - celda * COLS) / 2 + 8;
  }

  /** El tablero serpentea: las filas impares van al revés. */
  function centroDe(n) {
    const i = clamp(n, 1, CASILLAS) - 1;
    const fila = Math.floor(i / COLS);
    let col = i % COLS;
    if (fila % 2 === 1) col = COLS - 1 - col;
    return {
      x: ox + col * celda + celda / 2,
      y: oy + (COLS - 1 - fila) * celda + celda / 2,
    };
  }

  function tirar(cuantos) {
    dados = Array.from({ length: cuantos }, () => 1 + Math.floor(rng() * 6));
    const suma = dados.reduce((a, b) => a + b, 0);
    let destino = pos[turno] + suma;
    let nota = '';

    if (destino > CASILLAS) {
      // Rebote: hay que caer clavado en la 100.
      destino = CASILLAS - (destino - CASILLAS);
      nota = ' · rebota';
    }
    if (ESCALERAS[destino]) { nota += ` · escalera hasta ${ESCALERAS[destino]}`; destino = ESCALERAS[destino]; audio.pickup(); }
    else if (SERPIENTES[destino]) { nota += ` · ¡serpiente! baja a ${SERPIENTES[destino]}`; destino = SERPIENTES[destino]; audio.lose(); }

    const rival = 1 - turno;
    if (destino === pos[rival] && destino > 0) {
      // Se lo lleva por delante: vuelve al principio de su decena.
      pos[rival] = Math.floor((pos[rival] - 1) / 10) * 10;
      nota += ` · manda a ${players[rival].name} atrás`;
      audio.hit();
      haptics.impact(rival, 1);
    }

    pos[turno] = destino;
    mensaje = `${players[turno].name} saca ${dados.join(' + ')}${nota}`;
    audio.tone({ freq: 500, dur: 0.09, gain: 0.16, type: 'square' });
    haptics.play('click', { player: turno });
    sb.update(pos[0], pos[1]);

    const c = centroDe(destino);
    particles.burst(c.x, c.y, 14, { speed: 160, color: players[turno].color, size: 4, drag: 0.9 });

    if (destino >= CASILLAS) {
      terminado = true;
      audio.win();
      haptics.victory(turno);
      ctx.finish({ winner: turno, scores: [pos[0], pos[1]], detail: 'llega clavado a la 100' });
      return;
    }
    fase = 'mostrando';
    espera = 1.5;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      sb = ui.scoreboard({ center: 'a la casilla 100' });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      for (const i of [0, 1]) anim[i] += (pos[i] - anim[i]) * Math.min(1, dt * 8);

      if (fase === 'mostrando') {
        espera -= dt;
        if (espera <= 0) { turno = 1 - turno; fase = 'eligiendo'; dados = []; }
        return;
      }

      const pl = input.player(turno);
      if (pl.pressed('a')) tirar(1);
      else if (pl.pressed('b') || pl.pressed('up')) tirar(2);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0812');

      for (let n = 1; n <= CASILLAS; n++) {
        const c = centroDe(n);
        const esc = !!ESCALERAS[n], ser = !!SERPIENTES[n];
        g.fillStyle = esc ? '#1d3a2c' : ser ? '#3a1a26' : (n % 2 ? '#191527' : '#1f1b31');
        g.fillRect(c.x - celda / 2 + 1, c.y - celda / 2 + 1, celda - 2, celda - 2);
        ctx.engine.text(String(n), c.x - celda * 0.28, c.y - celda * 0.28, {
          size: Math.max(8, celda * 0.2), color: '#ffffff33', font: 'system-ui', align: 'left',
        });
      }

      // Escaleras y serpientes dibujadas encima.
      for (const [de, a] of Object.entries(ESCALERAS)) {
        const p = centroDe(+de), q = centroDe(a);
        g.save();
        g.strokeStyle = '#a8ff3e88';
        g.lineWidth = 4;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
        g.restore();
      }
      for (const [de, a] of Object.entries(SERPIENTES)) {
        const p = centroDe(+de), q = centroDe(a);
        g.save();
        g.strokeStyle = '#ff475788';
        g.lineWidth = 5;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p.x, p.y);
        const mx = (p.x + q.x) / 2 + (p.y - q.y) * 0.18;
        const my = (p.y + q.y) / 2 + (q.x - p.x) * 0.18;
        g.quadraticCurveTo(mx, my, q.x, q.y);
        g.stroke();
        g.restore();
        ctx.engine.glowCircle(p.x, p.y, celda * 0.16, '#ff4757', 10);
      }

      particles.render(g);

      for (const i of [0, 1]) {
        const c = centroDe(Math.max(1, anim[i]));
        const off = i === 0 ? -celda * 0.16 : celda * 0.16;
        ctx.engine.glowCircle(c.x + off, c.y, celda * 0.22, players[i].color, turno === i ? 22 : 8);
      }

      // Panel lateral: turno y dados.
      const px = ox + celda * COLS + 30;
      ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, px, oy + 20, {
        size: 14, color: players[turno].color, align: 'left', font: 'system-ui',
      });
      dados.forEach((d, k) => {
        const dx = px + k * 52, dy = oy + 56;
        g.fillStyle = '#f2f0e6';
        g.beginPath(); g.roundRect(dx, dy, 42, 42, 8); g.fill();
        ctx.engine.text(String(d), dx + 21, dy + 22, { size: 22, color: '#1a1622', font: 'system-ui' });
      });
      ctx.engine.text(`${players[0].name}: ${pos[0]}`, px, oy + 130,
        { size: 13, color: players[0].color, align: 'left', font: 'system-ui' });
      ctx.engine.text(`${players[1].name}: ${pos[1]}`, px, oy + 152,
        { size: 13, color: players[1].color, align: 'left', font: 'system-ui' });

      ctx.engine.text(mensaje, W / 2, H - 30, { size: 13, color: '#c9c9e0', font: 'system-ui' });
      ctx.engine.text('Tu tecla: un dado · tu especial: dos dados · hay que caer clavado en la 100',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
