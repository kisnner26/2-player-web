/**
 * Bolitas vs Fantasma — asimétrico y con cambio de rol.
 *
 * Ronda 1: P1 come el laberinto mientras P2 lo caza. Ronda 2 se invierten.
 * Gana quien haya comido más bolitas en su turno, así que ambos juegan los
 * dos papeles y nadie puede quejarse del reparto.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const CELDA = 34;
const VEL_COMELON = 5.2;      // celdas/s
const VEL_FANTASMA = 4.6;
const TIEMPO_RONDA = 45;
const PODER_DUR = 6;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cols = 0, filas = 0, offX = 0, offY = 0;
  let muros = null, puntos = null;
  let comelon = null, fantasma = null;
  let rolComelon = 0;         // quién come esta ronda
  let ronda = 1;
  let tiempo = TIEMPO_RONDA;
  let comidas = [0, 0];
  let poder = 0;
  let sb = null, congelado = 0;

  function medir() {
    cols = Math.max(13, Math.min(27, Math.floor((W - 40) / CELDA)));
    filas = Math.max(9, Math.min(17, Math.floor((H - 70) / CELDA)));
    if (cols % 2 === 0) cols--;
    if (filas % 2 === 0) filas--;
    offX = Math.floor((W - cols * CELDA) / 2);
    offY = Math.floor((H - filas * CELDA) / 2) + 12;
  }

  /** Laberinto simétrico: se genera media rejilla y se refleja. */
  function generar() {
    muros = new Uint8Array(cols * filas);
    puntos = new Uint8Array(cols * filas);
    const mitad = Math.ceil(cols / 2);
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < mitad; x++) {
        let v = 0;
        if (x === 0 || y === 0 || y === filas - 1) v = 1;
        else if (x % 2 === 0 && y % 2 === 0) v = 1;
        else if (x % 2 === 0 && rng() < 0.42) v = 1;
        else if (y % 2 === 0 && rng() < 0.3) v = 1;
        muros[y * cols + x] = v;
        muros[y * cols + (cols - 1 - x)] = v;
      }
    }
    // Corredor central abierto para que nunca quede un mapa partido.
    const my = Math.floor(filas / 2);
    for (let x = 1; x < cols - 1; x++) muros[my * cols + x] = 0;

    for (let y = 1; y < filas - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        if (!muros[y * cols + x]) puntos[y * cols + x] = rng() < 0.06 ? 2 : 1;
      }
    }
  }

  const esMuro = (x, y) => (x < 0 || y < 0 || x >= cols || y >= filas ? true : muros[y * cols + x] === 1);

  function ente(cx, cy) {
    return { cx, cy, x: cx, y: cy, dx: 0, dy: 0, prox: null };
  }

  function nuevaRonda() {
    medir();
    generar();
    const my = Math.floor(filas / 2);
    comelon = ente(1, my);
    fantasma = ente(cols - 2, my);
    tiempo = TIEMPO_RONDA;
    poder = 0;
    congelado = 0;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: '' });
      anunciar();
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (congelado > 0) { congelado -= dt; particles.update(dt); return; }

      tiempo -= dt;
      sb.setCenter(`ronda ${ronda}/2 · ${Math.ceil(tiempo)}s`);
      if (tiempo <= 0) return finRonda();

      if (poder > 0) {
        poder -= dt;
        if (poder <= 0) audio.back();
      }

      moverEnte(comelon, rolComelon, poder > 0 ? VEL_COMELON * 1.15 : VEL_COMELON, dt);
      moverEnte(fantasma, 1 - rolComelon, poder > 0 ? VEL_FANTASMA * 0.72 : VEL_FANTASMA, dt);

      // Comer
      const idx = comelon.cy * cols + comelon.cx;
      if (puntos[idx] === 1) {
        puntos[idx] = 0;
        comidas[rolComelon]++;
        audio.blip();
        haptics.play('tick', { player: rolComelon });
        sb.update(comidas[0], comidas[1]);
      } else if (puntos[idx] === 2) {
        puntos[idx] = 0;
        comidas[rolComelon] += 5;
        poder = PODER_DUR;
        audio.pickup();
        haptics.play('score', { player: rolComelon });
        ui.toast('¡Poder!', { ms: 1100, color: players[rolComelon].color });
        sb.update(comidas[0], comidas[1]);
      }

      // Contacto
      if (Math.hypot(comelon.x - fantasma.x, comelon.y - fantasma.y) < 0.7) {
        if (poder > 0) {
          // Con poder, el comelón se come al fantasma: bonus y lo manda lejos.
          comidas[rolComelon] += 10;
          sb.update(comidas[0], comidas[1]);
          audio.capture();
          haptics.impact(rolComelon, 1.2);
          ctx.shake(10);
          reubicarFantasma();
        } else {
          atrapado();
        }
      }

      if (!puntos.some((v) => v > 0)) finRonda();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#05050f');

      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const px = offX + x * CELDA, py = offY + y * CELDA;
          if (muros[y * cols + x]) {
            g.fillStyle = '#1a1a4d';
            g.fillRect(px + 2, py + 2, CELDA - 4, CELDA - 4);
            g.strokeStyle = '#3a3aa8';
            g.lineWidth = 2;
            g.strokeRect(px + 2, py + 2, CELDA - 4, CELDA - 4);
          } else {
            const v = puntos[y * cols + x];
            if (v === 1) {
              g.fillStyle = '#ffd9a0';
              g.beginPath(); g.arc(px + CELDA / 2, py + CELDA / 2, 3, 0, TAU); g.fill();
            } else if (v === 2) {
              const s = 1 + Math.sin(ctx.engine.time * 6) * 0.2;
              ctx.engine.glowCircle(px + CELDA / 2, py + CELDA / 2, 7 * s, '#ffd166', 16);
            }
          }
        }
      }

      particles.render(g);

      // Comelón
      const cCol = players[rolComelon].color;
      const cx = offX + comelon.x * CELDA + CELDA / 2;
      const cy = offY + comelon.y * CELDA + CELDA / 2;
      const boca = Math.abs(Math.sin(ctx.engine.time * 9)) * 0.5;
      const ang = Math.atan2(comelon.dy, comelon.dx) || 0;
      g.save();
      g.translate(cx, cy);
      g.rotate(ang);
      g.shadowColor = cCol; g.shadowBlur = poder > 0 ? 28 : 14;
      g.fillStyle = poder > 0 ? '#ffd166' : cCol;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, CELDA * 0.42, boca, TAU - boca);
      g.closePath();
      g.fill();
      g.restore();

      // Fantasma
      const fCol = players[1 - rolComelon].color;
      const fx = offX + fantasma.x * CELDA + CELDA / 2;
      const fy = offY + fantasma.y * CELDA + CELDA / 2;
      const r = CELDA * 0.4;
      g.save();
      g.shadowColor = fCol; g.shadowBlur = 16;
      g.fillStyle = poder > 0 ? '#4a5aff' : fCol;
      g.beginPath();
      g.arc(fx, fy - r * 0.15, r, Math.PI, 0);
      g.lineTo(fx + r, fy + r * 0.7);
      for (let k = 0; k < 3; k++) {
        g.lineTo(fx + r - (k * 2 + 1) * (r / 3), fy + r * 0.35);
        g.lineTo(fx + r - (k * 2 + 2) * (r / 3), fy + r * 0.7);
      }
      g.closePath();
      g.fill();
      g.restore();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(fx - 5, fy - 4, 4, 0, TAU); g.fill();
      g.beginPath(); g.arc(fx + 5, fy - 4, 4, 0, TAU); g.fill();
      g.fillStyle = '#111';
      g.beginPath(); g.arc(fx - 5 + fantasma.dx * 2, fy - 4 + fantasma.dy * 2, 2, 0, TAU); g.fill();
      g.beginPath(); g.arc(fx + 5 + fantasma.dx * 2, fy - 4 + fantasma.dy * 2, 2, 0, TAU); g.fill();

      // Rol actual
      ctx.engine.text(`${players[rolComelon].name} come`, W / 2, 46, {
        size: 11, color: cCol, font: 'system-ui',
      });
    },

    destroy() { sb?.remove(); },
  };

  function moverEnte(e, jugador, vel, dt) {
    const pl = input.player(jugador);
    if (pl.held('left')) e.prox = [-1, 0];
    else if (pl.held('right')) e.prox = [1, 0];
    else if (pl.held('up')) e.prox = [0, -1];
    else if (pl.held('down')) e.prox = [0, 1];

    const centrado = Math.abs(e.x - e.cx) < 0.08 && Math.abs(e.y - e.cy) < 0.08;
    if (centrado) {
      e.x = e.cx; e.y = e.cy;
      // El giro solo se aplica en el centro de una celda: movimiento limpio.
      if (e.prox && !esMuro(e.cx + e.prox[0], e.cy + e.prox[1])) {
        e.dx = e.prox[0]; e.dy = e.prox[1];
        e.prox = null;
      }
      if (esMuro(e.cx + e.dx, e.cy + e.dy)) { e.dx = 0; e.dy = 0; }
    }

    if (e.dx || e.dy) {
      e.x += e.dx * vel * dt;
      e.y += e.dy * vel * dt;
      e.cx = Math.round(e.x);
      e.cy = Math.round(e.y);
      // Túnel lateral
      if (e.x < 0) { e.x = cols - 1; e.cx = cols - 1; }
      if (e.x > cols - 1) { e.x = 0; e.cx = 0; }
    }
  }

  function reubicarFantasma() {
    particles.burst(offX + fantasma.x * CELDA, offY + fantasma.y * CELDA, 26, {
      speed: 240, color: players[1 - rolComelon].color, size: 5,
    });
    fantasma.cx = fantasma.x = rolComelon === 0 ? cols - 2 : 1;
    fantasma.cy = fantasma.y = Math.floor(filas / 2);
    fantasma.dx = fantasma.dy = 0;
  }

  function atrapado() {
    audio.lose();
    haptics.defeat(rolComelon);
    ctx.shake(16);
    particles.burst(offX + comelon.x * CELDA, offY + comelon.y * CELDA, 34, {
      speed: 260, color: players[rolComelon].color, size: 5,
    });
    ui.toast('¡Atrapado! −5', { ms: 1200, color: players[1 - rolComelon].color });
    comidas[rolComelon] = Math.max(0, comidas[rolComelon] - 5);
    sb.update(comidas[0], comidas[1]);
    congelado = 1;
    comelon.cx = comelon.x = 1;
    comelon.cy = comelon.y = Math.floor(filas / 2);
    comelon.dx = comelon.dy = 0;
    reubicarFantasma();
  }

  function anunciar() {
    ui.toast(`${players[rolComelon].name} come · ${players[1 - rolComelon].name} caza`, { ms: 2200 });
  }

  function finRonda() {
    if (ronda >= 2) {
      const [a, b] = comidas;
      ctx.finish({
        winner: a === b ? -1 : a > b ? 0 : 1,
        scores: [a, b],
        detail: 'Bolitas comidas en total',
      });
      return;
    }
    ronda++;
    rolComelon = 1 - rolComelon;
    audio.arp([440, 550, 660, 880]);
    nuevaRonda();
    anunciar();
  }
}
