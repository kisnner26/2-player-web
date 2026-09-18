/**
 * Bombas — laberinto destructible, explosiones en cruz y mejoras.
 *
 * Reglas del género que sí importan: las bombas no se atraviesan una vez que
 * te has salido de encima, las explosiones se propagan en cruz hasta topar con
 * muro, y una bomba alcanzada por otra detona en cadena.
 */

import { clamp } from '../../core/math2d.js';
import { PATHS } from '../../core/icons.js';

export const meta = { render: 'canvas' };

const CELDA = 48;
const VEL_BASE = 3.4;         // celdas por segundo
const MECHA = 2.4;
const EXPLOSION_DUR = 0.45;
const PARA_GANAR = 3;

const VACIO = 0, MURO = 1, CAJA = 2;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cols = 0, filas = 0, offX = 0, offY = 0;
  let rejilla = null;
  let bombas = [], llamas = [], mejoras = [];
  const jug = [nuevo(0), nuevo(1)];
  let sb = null, finRonda = 0, ronda = 1;

  function nuevo(i) {
    return { i, cx: 0, cy: 0, x: 0, y: 0, vivo: true, score: 0,
             maxBombas: 1, alcance: 2, vel: VEL_BASE, puestas: 0, invul: 0 };
  }

  /** Dibuja un icono de core/icons.js en canvas (los paths están en un box de 24x24). */
  function dibujarIcono(g, nombre, x, y, size, color) {
    const path = new Path2D(PATHS[nombre]);
    g.save();
    g.translate(x, y - size / 2);
    g.scale(size / 24, size / 24);
    g.fillStyle = color;
    g.fill(path);
    g.restore();
  }

  /** Fila de icono+número alternados, alineada a izquierda o derecha desde x. */
  function lineaEstado(g, segmentos, x, y, align, color) {
    g.font = '600 11px system-ui, sans-serif';
    const anchos = segmentos.map((s) => (s.tipo === 'icono' ? 15 : g.measureText(s.valor).width));
    const total = anchos.reduce((a, b) => a + b, 0) + (segmentos.length - 1) * 3;
    let cx = align === 'right' ? x - total : x;
    segmentos.forEach((s, idx) => {
      if (s.tipo === 'icono') dibujarIcono(g, s.valor, cx, y, 13, color);
      else { g.textAlign = 'left'; g.fillStyle = color; g.fillText(s.valor, cx, y + 4); }
      cx += anchos[idx] + 3;
    });
  }

  function medir() {
    cols = Math.max(9, Math.min(19, Math.floor((W - 40) / CELDA)));
    filas = Math.max(7, Math.min(13, Math.floor((H - 60) / CELDA)));
    if (cols % 2 === 0) cols--;
    if (filas % 2 === 0) filas--;
    offX = Math.floor((W - cols * CELDA) / 2);
    offY = Math.floor((H - filas * CELDA) / 2) + 10;
  }

  function generar() {
    rejilla = new Uint8Array(cols * filas);
    const set = (x, y, v) => { rejilla[y * cols + x] = v; };
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        if (x === 0 || y === 0 || x === cols - 1 || y === filas - 1) set(x, y, MURO);
        else if (x % 2 === 0 && y % 2 === 0) set(x, y, MURO);
        else set(x, y, rng() < 0.72 ? CAJA : VACIO);
      }
    }
    // Esquinas de aparición despejadas en forma de L.
    const esquinas = [[1, 1], [cols - 2, filas - 2]];
    for (const [ex, ey] of esquinas) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = ex + dx, y = ey + dy;
        if (x > 0 && y > 0 && x < cols - 1 && y < filas - 1 && rejilla[y * cols + x] === CAJA) set(x, y, VACIO);
      }
    }
  }

  function nuevaRonda() {
    medir();
    generar();
    bombas = []; llamas = []; mejoras = [];
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.cx = i === 0 ? 1 : cols - 2;
      p.cy = i === 0 ? 1 : filas - 2;
      p.x = p.cx; p.y = p.cy;
      p.vivo = true;
      p.maxBombas = 1; p.alcance = 2; p.vel = VEL_BASE; p.puestas = 0;
      p.invul = 0.6;
    }
    finRonda = 0;
  }

  const celda = (x, y) => (x < 0 || y < 0 || x >= cols || y >= filas ? MURO : rejilla[y * cols + x]);
  const bombaEn = (x, y) => bombas.find((b) => b.cx === x && b.cy === y);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        actualizarBombas(dt);
        particles.update(dt);
        if (finRonda <= 0) siguienteRonda();
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        if (p.invul > 0) p.invul -= dt;
        mover(p, dt);
        const pl = input.player(p.i);
        if (pl.pressed('a') && p.puestas < p.maxBombas && !bombaEn(p.cx, p.cy)) ponerBomba(p);
        recogerMejora(p);
        // Estar sobre una llama mata.
        if (p.invul <= 0 && llamas.some((f) => f.cx === p.cx && f.cy === p.cy)) morir(p);
      }

      actualizarBombas(dt);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0f0d1a');

      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const px = offX + x * CELDA, py = offY + y * CELDA;
          const v = rejilla[y * cols + x];
          if (v === MURO) {
            g.fillStyle = '#3a3552'; g.fillRect(px, py, CELDA, CELDA);
            g.fillStyle = '#4d4770'; g.fillRect(px, py, CELDA, 5);
            g.fillStyle = '#241f38'; g.fillRect(px, py + CELDA - 5, CELDA, 5);
          } else if (v === CAJA) {
            g.fillStyle = '#8a5a3a'; g.fillRect(px + 2, py + 2, CELDA - 4, CELDA - 4);
            g.fillStyle = '#a8724a'; g.fillRect(px + 2, py + 2, CELDA - 4, 6);
            g.strokeStyle = '#5c3a22'; g.lineWidth = 2;
            g.strokeRect(px + 2, py + 2, CELDA - 4, CELDA - 4);
          } else {
            g.fillStyle = (x + y) % 2 ? '#16142a' : '#191733';
            g.fillRect(px, py, CELDA, CELDA);
          }
        }
      }

      // Mejoras
      for (const m of mejoras) {
        const px = offX + m.cx * CELDA + CELDA / 2, py = offY + m.cy * CELDA + CELDA / 2;
        const col = m.tipo === 'bomba' ? '#ff6ec7' : m.tipo === 'fuego' ? '#ff9040' : '#3effc8';
        const pulso = 1 + Math.sin(ctx.engine.time * 5) * 0.12;
        ctx.engine.glowCircle(px, py, 13 * pulso, col, 20);
        ctx.engine.text(m.tipo === 'bomba' ? '+' : m.tipo === 'fuego' ? '≡' : '»', px, py + 1, { size: 14, color: '#0b0b14' });
      }

      // Bombas
      for (const b of bombas) {
        const px = offX + b.cx * CELDA + CELDA / 2, py = offY + b.cy * CELDA + CELDA / 2;
        const t = 1 - b.mecha / MECHA;
        const pulso = 1 + Math.sin(t * 40) * 0.14 * t;
        g.save();
        g.shadowColor = '#ff4757'; g.shadowBlur = 10 + t * 22;
        g.fillStyle = '#1c1c28';
        g.beginPath(); g.arc(px, py, CELDA * 0.32 * pulso, 0, Math.PI * 2); g.fill();
        g.restore();
        g.strokeStyle = '#ffd166'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(px + 6, py - CELDA * 0.3); g.lineTo(px + 12, py - CELDA * 0.42); g.stroke();
      }

      // Llamas
      for (const f of llamas) {
        const px = offX + f.cx * CELDA, py = offY + f.cy * CELDA;
        const a = clamp(f.vida / EXPLOSION_DUR, 0, 1);
        g.save();
        g.globalAlpha = a;
        g.shadowColor = '#ff9040'; g.shadowBlur = 26;
        g.fillStyle = '#ffd166';
        g.fillRect(px + 3, py + 3, CELDA - 6, CELDA - 6);
        g.fillStyle = '#ff6b35';
        g.fillRect(px + 9, py + 9, CELDA - 18, CELDA - 18);
        g.restore();
      }

      particles.render(g);

      // Jugadores
      for (const p of jug) {
        if (!p.vivo) continue;
        const px = offX + p.x * CELDA + CELDA / 2, py = offY + p.y * CELDA + CELDA / 2;
        const col = players[p.i].color;
        g.save();
        if (p.invul > 0) g.globalAlpha = 0.45 + Math.sin(ctx.engine.time * 20) * 0.3;
        ctx.engine.glowCircle(px, py, CELDA * 0.34, col, 16);
        g.fillStyle = '#0b0b14';
        g.beginPath(); g.arc(px - 5, py - 3, 3, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(px + 5, py - 3, 3, 0, Math.PI * 2); g.fill();
        g.restore();
      }

      // Estado de mejoras
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const tx = i === 0 ? 16 : W - 16;
        lineaEstado(g, [
          { tipo: 'icono', valor: 'bomb' }, { tipo: 'texto', valor: String(p.maxBombas) },
          { tipo: 'icono', valor: 'flame' }, { tipo: 'texto', valor: String(p.alcance) },
        ], tx, H - 18, i === 0 ? 'left' : 'right', players[i].color);
      }
    },

    destroy() { sb?.remove(); },
  };

  /* ---------------- Movimiento con ajuste a la rejilla ---------------- */

  function libre(p, cx, cy) {
    if (celda(cx, cy) !== VACIO) return false;
    const b = bombaEn(cx, cy);
    // Puedes seguir sobre la bomba que acabas de poner hasta salir de su celda.
    if (b && !(b.cx === p.cx && b.cy === p.cy)) return false;
    return true;
  }

  function mover(p, dt) {
    const pl = input.player(p.i);
    let dx = 0, dy = 0;
    if (pl.held('left')) dx = -1;
    else if (pl.held('right')) dx = 1;
    else if (pl.held('up')) dy = -1;
    else if (pl.held('down')) dy = 1;
    if (!dx && !dy) {
      // Se centra en la celda al soltar, evita quedarse trabado entre dos.
      p.x += clamp(p.cx - p.x, -p.vel * dt, p.vel * dt);
      p.y += clamp(p.cy - p.y, -p.vel * dt, p.vel * dt);
      return;
    }

    const paso = p.vel * dt;
    if (dx) {
      const destino = p.cx + dx;
      if (libre(p, destino, p.cy) || (dx > 0 ? p.x > p.cx : p.x < p.cx)) {
        p.x += dx * paso;
      } else {
        p.x += clamp(p.cx - p.x, -paso, paso);
      }
      p.y += clamp(p.cy - p.y, -paso, paso);
    } else {
      const destino = p.cy + dy;
      if (libre(p, p.cx, destino) || (dy > 0 ? p.y > p.cy : p.y < p.cy)) {
        p.y += dy * paso;
      } else {
        p.y += clamp(p.cy - p.y, -paso, paso);
      }
      p.x += clamp(p.cx - p.x, -paso, paso);
    }
    p.cx = Math.round(p.x);
    p.cy = Math.round(p.y);
    p.x = clamp(p.x, 1, cols - 2);
    p.y = clamp(p.y, 1, filas - 2);
  }

  /* ---------------- Bombas y explosiones ---------------- */

  function ponerBomba(p) {
    p.puestas++;
    bombas.push({ cx: p.cx, cy: p.cy, mecha: MECHA, due: p.i, alcance: p.alcance });
    audio.place();
    haptics.play('soft', { player: p.i });
  }

  function actualizarBombas(dt) {
    for (let i = bombas.length - 1; i >= 0; i--) {
      const b = bombas[i];
      b.mecha -= dt;
      if (b.mecha < 0.6 && Math.random() < dt * 6) audio.tick();
      if (b.mecha <= 0) { detonar(i); }
    }
    for (let i = llamas.length - 1; i >= 0; i--) {
      llamas[i].vida -= dt;
      if (llamas[i].vida <= 0) llamas.splice(i, 1);
    }
  }

  function detonar(indice) {
    const b = bombas[indice];
    bombas.splice(indice, 1);
    jug[b.due].puestas = Math.max(0, jug[b.due].puestas - 1);

    audio.explosion();
    haptics.explosion(null);
    ctx.shake(14);

    const celdas = [{ cx: b.cx, cy: b.cy }];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      for (let k = 1; k <= b.alcance; k++) {
        const x = b.cx + dx * k, y = b.cy + dy * k;
        const v = celda(x, y);
        if (v === MURO) break;
        celdas.push({ cx: x, cy: y });
        if (v === CAJA) {
          rejilla[y * cols + x] = VACIO;
          soltarMejora(x, y);
          particles.burst(offX + x * CELDA + CELDA / 2, offY + y * CELDA + CELDA / 2, 14, {
            speed: 180, color: '#8a5a3a', size: 5, gravity: 300,
          });
          break;
        }
      }
    }

    for (const c of celdas) {
      llamas.push({ cx: c.cx, cy: c.cy, vida: EXPLOSION_DUR });
      // Reacción en cadena: adelanta la mecha de las bombas alcanzadas.
      const otra = bombas.findIndex((x) => x.cx === c.cx && x.cy === c.cy);
      if (otra >= 0 && bombas[otra].mecha > 0.05) bombas[otra].mecha = 0.05;
      // Las mejoras se queman.
      const mi = mejoras.findIndex((m) => m.cx === c.cx && m.cy === c.cy);
      if (mi >= 0) mejoras.splice(mi, 1);
    }

    particles.burst(offX + b.cx * CELDA + CELDA / 2, offY + b.cy * CELDA + CELDA / 2, 26, {
      speed: 260, color: '#ff9040', size: 6, drag: 0.9,
    });
  }

  function soltarMejora(cx, cy) {
    if (rng() > 0.34) return;
    const tipo = rng() < 0.4 ? 'bomba' : rng() < 0.7 ? 'fuego' : 'vel';
    mejoras.push({ cx, cy, tipo });
  }

  function recogerMejora(p) {
    const i = mejoras.findIndex((m) => m.cx === p.cx && m.cy === p.cy);
    if (i < 0) return;
    const m = mejoras[i];
    mejoras.splice(i, 1);
    if (m.tipo === 'bomba') p.maxBombas = Math.min(6, p.maxBombas + 1);
    if (m.tipo === 'fuego') p.alcance = Math.min(7, p.alcance + 1);
    if (m.tipo === 'vel') p.vel = Math.min(6.5, p.vel + 0.6);
    audio.pickup();
    haptics.play('score', { player: p.i, scale: 0.6 });
  }

  function morir(p) {
    if (!p.vivo || finRonda > 0) return;
    p.vivo = false;
    audio.lose();
    haptics.defeat(p.i);
    ctx.shake(18);
    particles.burst(offX + p.x * CELDA + CELDA / 2, offY + p.y * CELDA + CELDA / 2, 40, {
      speed: 280, color: players[p.i].color, size: 6, drag: 0.9,
    });
    const otro = jug[1 - p.i];
    if (otro.vivo) otro.score++;
    sb.update(jug[0].score, jug[1].score);
    finRonda = 1.6;
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
