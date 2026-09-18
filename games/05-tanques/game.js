/**
 * Tanques — laberinto generado, balas que rebotan y fuego amigo garantizado.
 *
 * Las balas rebotan hasta 4 veces y siguen siendo letales para quien las
 * disparó: eso convierte cada disparo en una decisión, no en un reflejo.
 */

import { clamp, TAU, circleRect } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const CELDA = 64;
const VEL = 130;
const VEL_GIRO = 2.9;
const R_TANQUE = 15;
const VEL_BALA = 320;
const R_BALA = 4;
const MAX_BALAS = 5;
const REBOTES = 4;
const RECARGA = 0.42;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cols = 0, filas = 0, offX = 0, offY = 0;
  let muros = null;           // Uint8Array cols*filas

  const jug = [nuevo(0), nuevo(1)];
  let balas = [];
  let sb = null, finRonda = 0, ronda = 1;

  function nuevo(i) {
    return { i, x: 0, y: 0, a: 0, vivo: true, score: 0, recarga: 0, balas: 0, retro: 0 };
  }

  function medir() {
    cols = Math.max(7, Math.floor((W - 40) / CELDA));
    filas = Math.max(5, Math.floor((H - 40) / CELDA));
    if (cols % 2 === 0) cols--;
    if (filas % 2 === 0) filas--;
    offX = Math.floor((W - cols * CELDA) / 2);
    offY = Math.floor((H - filas * CELDA) / 2);
  }

  /**
   * Laberinto abierto: se parte de una rejilla vacía y se colocan bloques
   * dispersos. Un laberinto perfecto sería demasiado cerrado para un duelo;
   * lo que se busca son coberturas y ángulos de rebote.
   */
  function generar() {
    muros = new Uint8Array(cols * filas);
    const set = (x, y) => { if (x >= 0 && y >= 0 && x < cols && y < filas) muros[y * cols + x] = 1; };
    for (let y = 1; y < filas - 1; y += 2) {
      for (let x = 1; x < cols - 1; x += 2) {
        if (rng() < 0.62) {
          set(x, y);
          // Se alarga el bloque en una dirección para crear pasillos.
          if (rng() < 0.5) set(x + (rng() < 0.5 ? 1 : -1), y);
          else set(x, y + (rng() < 0.5 ? 1 : -1));
        }
      }
    }
    // Se despejan las esquinas donde aparecen los tanques.
    for (const [cx, cy] of [[1, 1], [cols - 2, filas - 2]]) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && y >= 0 && x < cols && y < filas) muros[y * cols + x] = 0;
      }
    }
  }

  function esMuro(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= cols || cy >= filas) return true;
    return muros[cy * cols + cx] === 1;
  }

  function nuevaRonda() {
    medir();
    generar();
    balas = [];
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.vivo = true;
      p.x = offX + (i === 0 ? 1.5 : cols - 1.5) * CELDA;
      p.y = offY + (i === 0 ? 1.5 : filas - 1.5) * CELDA;
      p.a = i === 0 ? 0 : Math.PI;
      p.recarga = 0;
      p.balas = 0;
      p.retro = 0;
    }
    finRonda = 0;
  }

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
        actualizarBalas(dt);
        particles.update(dt);
        if (finRonda <= 0) siguienteRonda();
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.a += (pl.held('right') ? 1 : 0) * VEL_GIRO * dt;
        p.a -= (pl.held('left') ? 1 : 0) * VEL_GIRO * dt;

        const adelante = (pl.held('up') ? 1 : 0) - (pl.held('down') ? 1 : 0);
        if (adelante !== 0) {
          const v = VEL * adelante * (adelante < 0 ? 0.6 : 1);
          mover(p, Math.cos(p.a) * v * dt, Math.sin(p.a) * v * dt);
          if (Math.random() < dt * 8) haptics.play('tick', { player: p.i });
        }

        if (p.recarga > 0) p.recarga -= dt;
        if (p.retro > 0) p.retro -= dt * 5;
        if (pl.pressed('a') && p.recarga <= 0 && p.balas < MAX_BALAS) disparar(p);
      }

      actualizarBalas(dt);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0a12');

      // Suelo y muros
      g.fillStyle = '#12111c';
      g.fillRect(offX, offY, cols * CELDA, filas * CELDA);
      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          if (!muros[y * cols + x]) continue;
          const px = offX + x * CELDA, py = offY + y * CELDA;
          g.fillStyle = '#2c2a44';
          g.fillRect(px, py, CELDA, CELDA);
          g.fillStyle = '#3d3a5e';
          g.fillRect(px, py, CELDA, 4);
          g.fillStyle = '#1c1a2e';
          g.fillRect(px, py + CELDA - 4, CELDA, 4);
        }
      }
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 3;
      g.strokeRect(offX, offY, cols * CELDA, filas * CELDA);

      particles.render(g);

      // Balas
      for (const b of balas) {
        const col = players[b.due].color;
        ctx.engine.glowCircle(b.x, b.y, R_BALA, b.rebotes > 0 ? '#ffd166' : col, 14);
      }

      // Tanques
      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.a);
        const r = p.retro > 0 ? -p.retro * 3 : 0;
        g.fillStyle = '#00000055';
        g.fillRect(-R_TANQUE, -R_TANQUE + 3, R_TANQUE * 2, R_TANQUE * 2);
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        g.fillRect(-R_TANQUE + r, -R_TANQUE, R_TANQUE * 2, R_TANQUE * 2);
        g.shadowBlur = 0;
        g.fillStyle = '#0c0c14';
        g.fillRect(-R_TANQUE + 3 + r, -R_TANQUE + 3, R_TANQUE * 2 - 6, R_TANQUE * 2 - 6);
        g.fillStyle = col;
        g.fillRect(R_TANQUE * 0.4 + r, -3, R_TANQUE, 6);
        g.restore();
      }
    },

    destroy() { sb?.remove(); },
  };

  /* ---------------- Movimiento con deslizamiento ---------------- */

  function chocaEn(x, y) {
    const cx0 = Math.floor((x - R_TANQUE - offX) / CELDA);
    const cx1 = Math.floor((x + R_TANQUE - offX) / CELDA);
    const cy0 = Math.floor((y - R_TANQUE - offY) / CELDA);
    const cy1 = Math.floor((y + R_TANQUE - offY) / CELDA);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!esMuro(cx, cy)) continue;
        if (circleRect(x, y, R_TANQUE, offX + cx * CELDA, offY + cy * CELDA, CELDA, CELDA)) return true;
      }
    }
    return false;
  }

  function mover(p, dx, dy) {
    // Ejes por separado: si uno choca, el otro sigue. Da deslizamiento
    // contra las paredes en vez de quedarse pegado.
    if (!chocaEn(p.x + dx, p.y)) p.x += dx;
    if (!chocaEn(p.x, p.y + dy)) p.y += dy;
  }

  /* ---------------- Balas ---------------- */

  function disparar(p) {
    p.recarga = RECARGA;
    p.balas++;
    p.retro = 1;
    balas.push({
      x: p.x + Math.cos(p.a) * (R_TANQUE + R_BALA + 2),
      y: p.y + Math.sin(p.a) * (R_TANQUE + R_BALA + 2),
      vx: Math.cos(p.a) * VEL_BALA,
      vy: Math.sin(p.a) * VEL_BALA,
      due: p.i, rebotes: 0, vida: 6,
      // Margen inicial para que no te mate tu propia bala al salir del cañón.
      gracia: 0.22,
    });
    audio.laser();
    haptics.play('bounce', { player: p.i, scale: 1.1 });
    particles.burst(p.x + Math.cos(p.a) * 22, p.y + Math.sin(p.a) * 22, 6, {
      speed: 140, dir: p.a, spread: 0.8, color: '#ffd166', size: 3, shape: 'spark',
    });
  }

  function actualizarBalas(dt) {
    for (let i = balas.length - 1; i >= 0; i--) {
      const b = balas[i];
      b.vida -= dt;
      if (b.gracia > 0) b.gracia -= dt;
      if (b.vida <= 0) { quitarBala(i); continue; }

      const pasos = Math.max(1, Math.ceil(VEL_BALA * dt / 3));
      const sdt = dt / pasos;
      let muerta = false;
      for (let s = 0; s < pasos; s++) {
        const nx = b.x + b.vx * sdt;
        const ny = b.y + b.vy * sdt;

        // Rebote eje por eje para conservar el ángulo correcto.
        if (celdaSolida(nx, b.y)) { b.vx *= -1; rebote(b); }
        else b.x = nx;
        if (celdaSolida(b.x, ny)) { b.vy *= -1; rebote(b); }
        else b.y = ny;

        if (b.rebotes > REBOTES) { muerta = true; break; }

        for (const p of jug) {
          if (!p.vivo) continue;
          if (b.due === p.i && b.gracia > 0) continue;
          if (Math.hypot(p.x - b.x, p.y - b.y) < R_TANQUE + R_BALA) {
            impacto(p, b);
            muerta = true;
            break;
          }
        }
        if (muerta) break;
      }
      if (muerta) quitarBala(i);
    }
  }

  function celdaSolida(x, y) {
    return esMuro(Math.floor((x - offX) / CELDA), Math.floor((y - offY) / CELDA));
  }

  function rebote(b) {
    b.rebotes++;
    audio.tick();
    particles.burst(b.x, b.y, 4, { speed: 90, color: '#ffd166', size: 2 });
  }

  function quitarBala(i) {
    const b = balas[i];
    jug[b.due].balas = Math.max(0, jug[b.due].balas - 1);
    balas.splice(i, 1);
  }

  function impacto(p, b) {
    p.vivo = false;
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(18);
    particles.burst(p.x, p.y, 44, { speed: 340, color: players[p.i].color, size: 6, drag: 0.9 });
    particles.burst(p.x, p.y, 20, { speed: 200, color: '#ffd166', size: 4, shape: 'circle' });

    const otro = 1 - p.i;
    // Suicidarse con la propia bala no da punto a nadie.
    if (b.due !== p.i) jug[otro].score++;
    else ui.toast('¡Fuego amigo!', { ms: 1400, color: players[p.i].color });
    sb.update(jug[0].score, jug[1].score);
    finRonda = 1.5;
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
