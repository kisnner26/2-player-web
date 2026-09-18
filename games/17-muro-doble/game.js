/**
 * Muro Doble — dos paletas, un muro compartido en el centro.
 *
 * Cada uno tiene su bola y su lado. Rompes ladrillos para puntuar, pero si se
 * te escapa la bola pierdes una vida. Gana quien tenga más puntos cuando el
 * muro se acabe o cuando alguien se quede sin vidas.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VIDAS = 3;
const FILAS = 6;
const PAD_W = 110, PAD_H = 14;
const VEL_PALETA = 640;
const R_BOLA = 8;
const VEL_BOLA = 380;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let ladrillos = [];
  let colsL = 0, ladW = 0, ladH = 22, muroTop = 0;
  const jug = [lado(0), lado(1)];
  let sb = null, congelado = 0;

  function lado(i) {
    return { i, x: 0, y: 0, score: 0, vidas: VIDAS, bola: { x: 0, y: 0, vx: 0, vy: 0, pegada: true } };
  }

  function construir() {
    colsL = Math.max(6, Math.floor((W - 80) / 74));
    ladW = (W - 80) / colsL;
    muroTop = H / 2 - (FILAS * ladH) / 2;
    ladrillos = [];
    for (let f = 0; f < FILAS; f++) {
      for (let cN = 0; cN < colsL; cN++) {
        ladrillos.push({
          x: 40 + cN * ladW, y: muroTop + f * ladH,
          w: ladW - 4, h: ladH - 4,
          vida: f < 2 ? 2 : 1,
          fila: f,
        });
      }
    }
  }

  function colocar() {
    jug[0].y = H - 40;
    jug[1].y = 26;
    jug[0].x = W / 2 - PAD_W / 2;
    jug[1].x = W / 2 - PAD_W / 2;
    for (const p of jug) pegarBola(p);
  }

  function pegarBola(p) {
    p.bola.pegada = true;
    p.bola.x = p.x + PAD_W / 2;
    p.bola.y = p.i === 0 ? p.y - R_BOLA - 2 : p.y + PAD_H + R_BOLA + 2;
    p.bola.vx = 0;
    p.bola.vy = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      construir();
      colocar();
      sb = ui.scoreboard({ center: `${VIDAS} vidas` });
      ui.toast('Pulsa tu tecla de acción para sacar', { ms: 2200 });
    },
    resize(nw, nh) { W = nw; H = nh; construir(); colocar(); },

    update(dt) {
      if (congelado > 0) { congelado -= dt; particles.update(dt); return; }

      for (const p of jug) {
        const pl = input.player(p.i);
        p.x = clamp(p.x + pl.x * VEL_PALETA * dt, 0, W - PAD_W);

        const b = p.bola;
        if (b.pegada) {
          b.x = p.x + PAD_W / 2;
          b.y = p.i === 0 ? p.y - R_BOLA - 2 : p.y + PAD_H + R_BOLA + 2;
          if (pl.pressed('a') || pl.pressed('up') || pl.pressed('down')) {
            b.pegada = false;
            const ang = (Math.random() - 0.5) * 0.5;
            const dir = p.i === 0 ? -1 : 1;
            b.vx = Math.sin(ang) * VEL_BOLA;
            b.vy = Math.cos(ang) * VEL_BOLA * dir;
            audio.blip();
            haptics.play('tap', { player: p.i });
          }
          continue;
        }

        const pasos = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vy) * dt / 5));
        const sdt = dt / pasos;
        for (let s = 0; s < pasos; s++) {
          b.x += b.vx * sdt;
          b.y += b.vy * sdt;

          if (b.x - R_BOLA < 0 && b.vx < 0) { b.x = R_BOLA; b.vx *= -1; pared(); }
          if (b.x + R_BOLA > W && b.vx > 0) { b.x = W - R_BOLA; b.vx *= -1; pared(); }

          // El techo del rival (su fondo) es pared para tu bola.
          const fondoRival = p.i === 0 ? 0 : H;
          if (p.i === 0 && b.y - R_BOLA < 0 && b.vy < 0) { b.y = R_BOLA; b.vy *= -1; pared(); }
          if (p.i === 1 && b.y + R_BOLA > H && b.vy > 0) { b.y = H - R_BOLA; b.vy *= -1; pared(); }

          // Paleta propia
          if (rebotaEnPaleta(p, b)) break;

          // Ladrillos
          const li = ladrillos.findIndex((l) =>
            b.x + R_BOLA > l.x && b.x - R_BOLA < l.x + l.w &&
            b.y + R_BOLA > l.y && b.y - R_BOLA < l.y + l.h);
          if (li >= 0) { romper(p, li, b); break; }

          // Se escapó por tu lado
          if (p.i === 0 && b.y > H + 30) { perderVida(p); break; }
          if (p.i === 1 && b.y < -30) { perderVida(p); break; }
        }
      }

      if (ladrillos.length === 0) finalizar('Muro despejado');
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#080814');

      // Zona de cada jugador
      for (let i = 0; i < 2; i++) {
        g.save();
        g.globalAlpha = 0.05;
        g.fillStyle = players[i].color;
        g.fillRect(0, i === 0 ? H / 2 : 0, W, H / 2);
        g.restore();
      }

      // Ladrillos
      for (const l of ladrillos) {
        const t = 1 - l.fila / FILAS;
        const col = l.vida > 1 ? '#ffd166' : `hsl(${190 + t * 110}, 70%, 60%)`;
        g.save();
        g.shadowColor = col;
        g.shadowBlur = 8;
        g.fillStyle = col;
        g.fillRect(l.x, l.y, l.w, l.h);
        g.restore();
        g.fillStyle = '#00000033';
        g.fillRect(l.x, l.y + l.h - 4, l.w, 4);
      }

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        ctx.engine.glowRect(p.x, p.y, PAD_W, PAD_H, col, 18);
        const b = p.bola;
        ctx.engine.glowCircle(b.x, b.y, R_BOLA, b.pegada ? col : '#ffffff', 18);
      }

      // Vidas
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        for (let k = 0; k < p.vidas; k++) {
          const x = i === 0 ? 18 + k * 16 : W - 18 - k * 16;
          const y = i === 0 ? H - 60 : 60;
          g.fillStyle = players[i].color;
          g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill();
        }
      }
    },

    destroy() { sb?.remove(); },
  };

  function pared() { audio.bounce(0); haptics.bounce(null, 0.4); }

  function rebotaEnPaleta(p, b) {
    const py = p.y, ph = PAD_H;
    const dentroX = b.x + R_BOLA > p.x && b.x - R_BOLA < p.x + PAD_W;
    if (!dentroX) return false;
    const haciaPaleta = p.i === 0 ? b.vy > 0 : b.vy < 0;
    if (!haciaPaleta) return false;
    const toca = p.i === 0
      ? b.y + R_BOLA > py && b.y < py + ph
      : b.y - R_BOLA < py + ph && b.y > py;
    if (!toca) return false;

    const rel = clamp((b.x - (p.x + PAD_W / 2)) / (PAD_W / 2), -1, 1);
    const vel = Math.min(760, Math.hypot(b.vx, b.vy) * 1.02 + 6);
    const ang = rel * 1.0;
    const dir = p.i === 0 ? -1 : 1;
    b.vx = Math.sin(ang) * vel;
    b.vy = Math.cos(ang) * vel * dir;
    b.y = p.i === 0 ? py - R_BOLA - 1 : py + ph + R_BOLA + 1;
    audio.bounce(p.i);
    haptics.bounce(p.i, 0.8);
    return true;
  }

  function romper(p, li, b) {
    const l = ladrillos[li];
    l.vida--;
    const centroX = l.x + l.w / 2, centroY = l.y + l.h / 2;
    // Rebote por el eje de menor penetración.
    const dx = Math.abs(b.x - centroX) / (l.w / 2);
    const dy = Math.abs(b.y - centroY) / (l.h / 2);
    if (dx > dy) b.vx *= -1; else b.vy *= -1;

    if (l.vida <= 0) {
      ladrillos.splice(li, 1);
      p.score += 10;
      particles.burst(centroX, centroY, 12, { speed: 200, color: players[p.i].color, size: 4, gravity: 300 });
    } else {
      p.score += 3;
      particles.burst(centroX, centroY, 5, { speed: 130, color: '#ffd166', size: 3 });
    }
    sb.update(jug[0].score, jug[1].score);
    audio.hit();
    haptics.play('bounce', { player: p.i, scale: 1.1 });
  }

  function perderVida(p) {
    p.vidas--;
    audio.error();
    haptics.error(p.i);
    ctx.shake(10);
    sb.setCenter(`${jug[0].vidas} ♥ · ♥ ${jug[1].vidas}`);
    if (p.vidas <= 0) { finalizar(`${players[p.i].name} se quedó sin vidas`); return; }
    congelado = 0.6;
    pegarBola(p);
  }

  function finalizar(detalle) {
    const [a, b] = [jug[0].score, jug[1].score];
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: detalle,
    });
  }
}
