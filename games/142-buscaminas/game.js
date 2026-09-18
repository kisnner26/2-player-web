/**
 * Buscaminas Duelo — un solo campo minado y dos personas destapándolo a la vez.
 *
 * Todo lo que descubres suma, así que la avaricia es la mecánica: los huecos
 * grandes se abren en cascada y valen una fortuna, pero están donde no hay
 * pistas y una mina te congela dos segundos enteros mientras el otro sigue.
 *
 * La bandera es lo que convierte esto en un duelo y no en dos solitarios: al
 * marcar una mina la desactivas para los DOS, así que estás dando seguridad al
 * rival a cambio de puntos. Marcar de más regala el campo; no marcar nada lo
 * deja lleno de trampas para los dos.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 18;
const FILAS = 12;
const MINAS = 34;
const CONGELADO = 2.2;
const RELOJ = 150;             // tope de partida: sin él, una bandera olvidada la eterniza
const NUM_COL = ['#7a8aa0', '#4aa8ff', '#a8ff3e', '#ffd166', '#ff8c42', '#ff4757', '#ff2e88', '#b04cff', '#ffffff'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 0, ox = 0, oy = 0;
  let mina = [], vecinos = [], abierto = [], bandera = [];   // bandera: -1 nadie, 0/1 jugador
  const jug = [{ i: 0, cx: 3, cy: 6, puntos: 0, hielo: 0 }, { i: 1, cx: COLS - 4, cy: 6, puntos: 0, hielo: 0 }];
  let sb = null, restantes = 0, terminado = false, t = 0, reloj = RELOJ;

  const idx = (x, y) => y * COLS + x;
  const dentro = (x, y) => x >= 0 && y >= 0 && x < COLS && y < FILAS;

  function generar() {
    mina = new Array(COLS * FILAS).fill(false);
    abierto = new Array(COLS * FILAS).fill(false);
    bandera = new Array(COLS * FILAS).fill(-1);
    let puestas = 0;
    while (puestas < MINAS) {
      const k = Math.floor(rng() * COLS * FILAS);
      const x = k % COLS, y = Math.floor(k / COLS);
      // Las esquinas de salida se dejan limpias: nadie muere en el primer clic.
      if (mina[k] || (y > 4 && y < 8 && (x < 5 || x > COLS - 6))) continue;
      mina[k] = true;
      puestas++;
    }
    vecinos = new Array(COLS * FILAS).fill(0);
    for (let y = 0; y < FILAS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (mina[idx(x, y)]) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dentro(x + dx, y + dy) && mina[idx(x + dx, y + dy)]) n++;
        }
        vecinos[idx(x, y)] = n;
      }
    }
    restantes = COLS * FILAS - MINAS;
  }

  /** Destapa en cascada. Devuelve cuántas casillas nuevas ha abierto. */
  function destapar(x, y) {
    const pila = [[x, y]];
    let n = 0;
    while (pila.length) {
      const [px, py] = pila.pop();
      if (!dentro(px, py)) continue;
      const k = idx(px, py);
      if (abierto[k] || mina[k] || bandera[k] >= 0) continue;
      abierto[k] = true;
      n++;
      if (vecinos[k] === 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx || dy) pila.push([px + dx, py + dy]);
        }
      }
    }
    return n;
  }

  function medir() {
    celda = Math.floor(Math.min((W - 60) / COLS, (H - 130) / FILAS));
    ox = (W - celda * COLS) / 2;
    oy = (H - celda * FILAS) / 2 + 8;
  }

  function acabar(motivo) {
    if (terminado) return;
    terminado = true;
    const [a, b] = jug;
    const ganador = a.puntos === b.puntos ? -1 : (a.puntos > b.puntos ? 0 : 1);
    ctx.finish({
      winner: ganador,
      scores: [a.puntos, b.puntos],
      detail: motivo,
      record: ctx.record('casillas', Math.max(a.puntos, b.puntos), 'high'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      generar();
      sb = ui.scoreboard({ center: `${MINAS} minas` });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      const antes = Math.ceil(reloj);
      reloj -= dt;
      if (Math.ceil(reloj) !== antes && reloj <= 10 && reloj > 0) audio.countdown(Math.ceil(reloj));
      if (reloj <= 0) { acabar('Se acabó el tiempo'); return; }
      particles.update(dt);

      for (const p of jug) {
        const pl = input.player(p.i);
        if (p.hielo > 0) { p.hielo -= dt; continue; }

        if (pl.pressed('left')) { p.cx = Math.max(0, p.cx - 1); audio.tick(); }
        if (pl.pressed('right')) { p.cx = Math.min(COLS - 1, p.cx + 1); audio.tick(); }
        if (pl.pressed('up')) { p.cy = Math.max(0, p.cy - 1); audio.tick(); }
        if (pl.pressed('down')) { p.cy = Math.min(FILAS - 1, p.cy + 1); audio.tick(); }

        const k = idx(p.cx, p.cy);
        const px = ox + p.cx * celda + celda / 2;
        const py = oy + p.cy * celda + celda / 2;

        if (pl.pressed('a') && !abierto[k] && bandera[k] < 0) {
          if (mina[k]) {
            abierto[k] = true;
            p.puntos = Math.max(0, p.puntos - 4);
            p.hielo = CONGELADO;
            audio.explosion();
            haptics.explosion(p.i);
            ctx.shake(11);
            particles.burst(px, py, 24, { speed: 240, color: '#ff4757', size: 4, drag: 0.9 });
            ui.toast(`${players[p.i].name} pisa una mina`, { ms: 900, color: '#ff4757' });
          } else {
            const n = destapar(p.cx, p.cy);
            restantes -= n;
            p.puntos += n;
            audio.tone({ freq: 500 + Math.min(n, 12) * 40, dur: 0.07, gain: 0.15 });
            haptics.play(n > 4 ? 'score' : 'click', { player: p.i });
            if (n > 4) particles.burst(px, py, 12, { speed: 180, color: players[p.i].color, size: 3, drag: 0.9 });
          }
        }

        if (pl.pressed('b') && !abierto[k]) {
          if (bandera[k] === p.i) {
            bandera[k] = -1;
            p.puntos -= mina[k] ? 5 : -3;
            audio.back();
          } else if (bandera[k] < 0) {
            bandera[k] = p.i;
            if (mina[k]) {
              p.puntos += 5;
              audio.pickup();
              haptics.score(p.i);
              particles.burst(px, py, 10, { speed: 150, color: players[p.i].color, size: 3 });
            } else {
              // Marcar en falso duele el doble: bloquea una casilla que valía puntos.
              p.puntos -= 3;
              audio.error();
              haptics.error(p.i);
            }
          }
        }
      }

      sb.update(jug[0].puntos, jug[1].puntos);
      if (restantes <= 0) acabar('Campo despejado');
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#080a12');

      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const k = idx(x, y);
          const px = ox + x * celda, py = oy + y * celda;
          if (abierto[k]) {
            g.fillStyle = mina[k] ? '#3a1620' : '#151a26';
            g.fillRect(px + 1, py + 1, celda - 2, celda - 2);
            if (mina[k]) {
              ctx.engine.glowCircle(px + celda / 2, py + celda / 2, celda * 0.24, '#ff4757', 12);
            } else if (vecinos[k] > 0) {
              ctx.engine.text(String(vecinos[k]), px + celda / 2, py + celda / 2 + 1,
                { size: Math.floor(celda * 0.46), color: NUM_COL[vecinos[k]], font: 'system-ui' });
            }
          } else {
            g.fillStyle = (x + y) % 2 ? '#242c3e' : '#283246';
            g.fillRect(px + 1, py + 1, celda - 2, celda - 2);
            g.fillStyle = '#ffffff0c';
            g.fillRect(px + 1, py + 1, celda - 2, 3);
            if (bandera[k] >= 0) {
              const col = players[bandera[k]].color;
              g.fillStyle = col;
              g.beginPath();
              g.moveTo(px + celda * 0.34, py + celda * 0.22);
              g.lineTo(px + celda * 0.72, py + celda * 0.38);
              g.lineTo(px + celda * 0.34, py + celda * 0.54);
              g.fill();
              g.fillRect(px + celda * 0.31, py + celda * 0.2, 2.5, celda * 0.58);
            }
          }
        }
      }

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        const px = ox + p.cx * celda, py = oy + p.cy * celda;
        g.save();
        g.strokeStyle = p.hielo > 0 ? '#7a8aa0' : col;
        g.lineWidth = 3;
        g.shadowColor = col;
        g.shadowBlur = p.hielo > 0 ? 0 : 14;
        g.globalAlpha = p.hielo > 0 ? 0.4 + Math.sin(t * 18) * 0.2 : 1;
        g.strokeRect(px + 1, py + 1, celda - 2, celda - 2);
        g.restore();
        if (p.hielo > 0) {
          ctx.engine.text(p.hielo.toFixed(1), px + celda / 2, py - celda * 0.4,
            { size: 11, color: '#ff4757', font: 'system-ui' });
        }
      }

      ctx.engine.text(`quedan ${Math.max(0, restantes)} casillas seguras · ${Math.ceil(Math.max(0, reloj))}s`,
        W / 2, oy - 16, { size: 12, color: reloj < 15 ? '#ff4757' : '#8f8fb0', font: 'system-ui' });
      ctx.engine.text('Tu tecla destapa · la especial pone bandera: +5 si hay mina, −3 si no · una mina te congela',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
