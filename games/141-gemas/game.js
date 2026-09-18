/**
 * Gemas Versus — dos tableros que suben y no perdonan.
 *
 * El cursor abarca dos casillas y la única jugada posible es intercambiarlas.
 * Con eso basta: la profundidad no está en el movimiento sino en la CADENA —
 * al romper tres gemas, lo de arriba cae y puede volver a casar solo. Cada
 * eslabón de esa reacción vale mucho más que el anterior, y es lo que manda
 * basura al tablero del otro.
 *
 * El suelo empuja una fila nueva cada pocos segundos y va más rápido con el
 * tiempo, así que no existe la partida tranquila: o rompes o te ahogas.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 6;
const FILAS = 12;
const COLORES = ['#ff2e88', '#00e5ff', '#a8ff3e', '#ffd166', '#b04cff'];
const SUBIDA_BASE = 5.2;       // segundos entre filas nuevas al empezar
const SUBIDA_MIN = 1.6;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 0, tableroAn = 0, tableroAl = 0;
  const lados = [crear(0), crear(1)];
  let sb = null, tiempo = 0, terminado = false;

  function crear(i) {
    return {
      i, rej: new Array(COLS * FILAS).fill(-1),
      cx: 2, cy: FILAS - 3, reloj: SUBIDA_BASE, basura: 0,
      combo: 0, aviso: 0, textoCombo: '', puntos: 0, sacudida: 0,
      destellos: [],
    };
  }

  const idx = (x, y) => y * COLS + x;

  /** Fila aleatoria que no case sola nada más aparecer. */
  function filaNueva(L, y) {
    for (let x = 0; x < COLS; x++) {
      let c;
      let intentos = 0;
      do {
        c = Math.floor(rng() * COLORES.length);
        intentos++;
      } while (intentos < 12 && (
        (x >= 2 && L.rej[idx(x - 1, y)] === c && L.rej[idx(x - 2, y)] === c) ||
        (y <= FILAS - 3 && L.rej[idx(x, y + 1)] === c && L.rej[idx(x, y + 2)] === c)
      ));
      L.rej[idx(x, y)] = c;
    }
  }

  function empezar(L) {
    L.rej.fill(-1);
    for (let y = FILAS - 5; y < FILAS; y++) filaNueva(L, y);
    asentar(L);
    while (buscar(L).length) { limpiar(L, buscar(L), true); asentar(L); }
  }

  /** Todo lo que flote cae hasta apoyarse. */
  function asentar(L) {
    let movio = false;
    for (let x = 0; x < COLS; x++) {
      let destino = FILAS - 1;
      for (let y = FILAS - 1; y >= 0; y--) {
        const v = L.rej[idx(x, y)];
        if (v < 0) continue;
        if (y !== destino) { L.rej[idx(x, destino)] = v; L.rej[idx(x, y)] = -1; movio = true; }
        destino--;
      }
    }
    return movio;
  }

  /** Grupos de tres o más en línea. Devuelve la lista de índices a romper. */
  function buscar(L) {
    const marca = new Set();
    for (let y = 0; y < FILAS; y++) {
      let corrido = 1;
      for (let x = 1; x <= COLS; x++) {
        const a = x < COLS ? L.rej[idx(x, y)] : -2;
        const b = L.rej[idx(x - 1, y)];
        if (a >= 0 && a === b) corrido++;
        else {
          if (corrido >= 3 && b >= 0) for (let k = 1; k <= corrido; k++) marca.add(idx(x - k, y));
          corrido = 1;
        }
      }
    }
    for (let x = 0; x < COLS; x++) {
      let corrido = 1;
      for (let y = 1; y <= FILAS; y++) {
        const a = y < FILAS ? L.rej[idx(x, y)] : -2;
        const b = L.rej[idx(x, y - 1)];
        if (a >= 0 && a === b) corrido++;
        else {
          if (corrido >= 3 && b >= 0) for (let k = 1; k <= corrido; k++) marca.add(idx(x, y - k));
          corrido = 1;
        }
      }
    }
    return [...marca];
  }

  function limpiar(L, lista, silencio = false) {
    for (const k of lista) {
      if (!silencio) {
        const bx = tableroX(L.i) + (k % COLS) * celda + celda / 2;
        const by = tableroY() + Math.floor(k / COLS) * celda + celda / 2;
        L.destellos.push({ x: bx, y: by, vida: 0.3, col: COLORES[L.rej[k]] });
        particles.burst(bx, by, 6, { speed: 150, color: COLORES[L.rej[k]], size: 3, drag: 0.9 });
      }
      L.rej[k] = -1;
    }
  }

  /** Resuelve roturas y cadenas de golpe; devuelve la basura que genera. */
  function resolver(L) {
    let eslabon = 0, rotas = 0;
    for (;;) {
      const lista = buscar(L);
      if (!lista.length) break;
      eslabon++;
      rotas += lista.length;
      limpiar(L, lista);
      asentar(L);
      audio.tone({ freq: 420 + eslabon * 130, dur: 0.09, gain: 0.16, type: 'square' });
    }
    if (!eslabon) return 0;

    L.combo = eslabon;
    L.aviso = 1.2;
    L.puntos += rotas * eslabon;
    L.sacudida = Math.min(8, eslabon * 2.5);
    haptics.play(eslabon > 1 ? 'score' : 'click', { player: L.i });
    L.textoCombo = eslabon > 1 ? `CADENA ×${eslabon}` : `${rotas} gemas`;
    // Una rotura simple no ataca: hay que encadenar o romper mucho de golpe.
    return Math.max(0, (eslabon - 1) * 2 + Math.max(0, rotas - 3));
  }

  function subirFila(L) {
    // Si arriba del todo hay algo, esa fila ya no cabe: se acabó.
    for (let x = 0; x < COLS; x++) if (L.rej[idx(x, 0)] >= 0) return false;
    for (let y = 0; y < FILAS - 1; y++) {
      for (let x = 0; x < COLS; x++) L.rej[idx(x, y)] = L.rej[idx(x, y + 1)];
    }
    filaNueva(L, FILAS - 1);
    L.cy = Math.max(0, L.cy - 1);
    return true;
  }

  const tableroX = (i) => (i === 0 ? W * 0.5 - tableroAn - 26 : W * 0.5 + 26);
  const tableroY = () => (H - tableroAl) / 2 + 14;

  function medir() {
    celda = Math.floor(Math.min((W * 0.42) / COLS, (H - 90) / FILAS));
    tableroAn = celda * COLS;
    tableroAl = celda * FILAS;
  }

  function perder(L) {
    if (terminado) return;
    terminado = true;
    const g = 1 - L.i;
    audio.win();
    haptics.victory(g);
    ctx.finish({
      winner: g,
      scores: [lados[0].puntos, lados[1].puntos],
      detail: `${players[L.i].name} se ahoga en gemas`,
      record: ctx.record('gemas', lados[g].puntos, 'high'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      for (const L of lados) { empezar(L); L.reloj = SUBIDA_BASE; }
      sb = ui.scoreboard({ center: 'rompe y encadena' });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      tiempo += dt;
      particles.update(dt);

      const ritmo = Math.max(SUBIDA_MIN, SUBIDA_BASE - tiempo * 0.06);

      for (const L of lados) {
        const pl = input.player(L.i);
        L.aviso = Math.max(0, L.aviso - dt);
        L.sacudida = Math.max(0, L.sacudida - dt * 22);
        for (let k = L.destellos.length - 1; k >= 0; k--) {
          L.destellos[k].vida -= dt;
          if (L.destellos[k].vida <= 0) L.destellos.splice(k, 1);
        }

        if (pl.pressed('left')) { L.cx = Math.max(0, L.cx - 1); audio.tick(); }
        if (pl.pressed('right')) { L.cx = Math.min(COLS - 2, L.cx + 1); audio.tick(); }
        if (pl.pressed('up')) { L.cy = Math.max(0, L.cy - 1); audio.tick(); }
        if (pl.pressed('down')) { L.cy = Math.min(FILAS - 1, L.cy + 1); audio.tick(); }

        if (pl.pressed('a')) {
          const i1 = idx(L.cx, L.cy), i2 = idx(L.cx + 1, L.cy);
          const t = L.rej[i1]; L.rej[i1] = L.rej[i2]; L.rej[i2] = t;
          audio.place();
          haptics.tap(L.i);
          asentar(L);
          const ataque = resolver(L);
          if (ataque) lados[1 - L.i].basura += ataque;
        }
        // La tecla especial acelera el suelo: arriesgas por adelantar el reloj.
        if (pl.held('b')) L.reloj -= dt * 6;

        L.reloj -= dt;
        if (L.reloj <= 0) {
          L.reloj = ritmo;
          // La basura recibida entra como filas extra, de golpe y sin piedad.
          const filas = 1 + Math.min(3, Math.floor(L.basura / 4));
          L.basura = Math.max(0, L.basura - (filas - 1) * 4);
          for (let f = 0; f < filas; f++) {
            if (!subirFila(L)) { perder(L); return; }
          }
          audio.tone({ freq: 200, dur: 0.07, gain: 0.1, type: 'triangle' });
          const ataque = resolver(L);
          if (ataque) lados[1 - L.i].basura += ataque;
        }
      }

      sb.update(lados[0].puntos, lados[1].puntos);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#06040e');

      for (const L of lados) {
        const ox = tableroX(L.i) + (L.sacudida ? (rng() - 0.5) * L.sacudida : 0);
        const oy = tableroY();
        const col = players[L.i].color;

        g.fillStyle = '#0e0a1a';
        g.fillRect(ox - 4, oy - 4, tableroAn + 8, tableroAl + 8);
        g.strokeStyle = `${col}55`;
        g.lineWidth = 2;
        g.strokeRect(ox - 4, oy - 4, tableroAn + 8, tableroAl + 8);

        // Línea de peligro: dos filas del techo.
        g.fillStyle = '#ff475711';
        g.fillRect(ox, oy, tableroAn, celda * 2);
        g.strokeStyle = '#ff475744';
        g.setLineDash([4, 6]);
        g.beginPath(); g.moveTo(ox, oy + celda * 2); g.lineTo(ox + tableroAn, oy + celda * 2); g.stroke();
        g.setLineDash([]);

        for (let y = 0; y < FILAS; y++) {
          for (let x = 0; x < COLS; x++) {
            const v = L.rej[idx(x, y)];
            if (v < 0) continue;
            const px = ox + x * celda, py = oy + y * celda;
            g.fillStyle = COLORES[v];
            g.beginPath();
            g.roundRect(px + 2, py + 2, celda - 4, celda - 4, 5);
            g.fill();
            // Brillo interior: lo que separa un cuadrado de una gema.
            g.fillStyle = '#ffffff33';
            g.beginPath();
            g.roundRect(px + 5, py + 5, celda - 10, (celda - 10) * 0.34, 3);
            g.fill();
          }
        }

        for (const d of L.destellos) {
          g.save();
          g.globalAlpha = clamp(d.vida * 3, 0, 1);
          g.fillStyle = '#ffffff';
          g.beginPath(); g.arc(d.x, d.y, celda * 0.5 * (1 - d.vida * 2), 0, Math.PI * 2); g.fill();
          g.restore();
        }

        // Cursor de dos casillas
        g.save();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.shadowColor = col;
        g.shadowBlur = 14;
        g.strokeRect(ox + L.cx * celda + 1, oy + L.cy * celda + 1, celda * 2 - 2, celda - 2);
        g.restore();

        // Basura pendiente: se avisa antes de que caiga.
        if (L.basura > 0) {
          ctx.engine.text(`⚠ ${L.basura}`, ox + tableroAn / 2, oy - 16,
            { size: 13, color: '#ff4757', font: 'system-ui' });
        }
        if (L.aviso > 0) {
          g.save();
          g.globalAlpha = clamp(L.aviso, 0, 1);
          ctx.engine.text(L.textoCombo, ox + tableroAn / 2, oy + tableroAl * 0.42,
            { size: 20, color: '#ffd166', glow: 18 });
          g.restore();
        }
        ctx.engine.text(players[L.i].name, ox + tableroAn / 2, oy + tableroAl + 18,
          { size: 12, color: col, font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text('Mueve el cursor · tu tecla intercambia las dos gemas · la especial acelera el suelo',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
