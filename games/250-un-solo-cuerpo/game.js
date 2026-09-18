/**
 * Un Solo Cuerpo — los dos movéis al MISMO muñeco.
 *
 * No hay dos personajes: hay uno, y su dirección es la SUMA de lo que pulsan
 * los dos. Si uno va a la derecha y el otro a la izquierda, el muñeco se queda
 * clavado. Para ir a algún sitio hay que estar de acuerdo, literalmente.
 *
 * Es cooperativo de verdad y no «cooperativo» de dos personajes que se ayudan:
 * no se puede jugar en paralelo, hay que hablar. Y por eso el reto es de
 * precisión —pasillos estrechos y una plataforma que se mueve— y no de
 * velocidad: correr juntos es fácil, girar juntos no.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const NIVELES = 6;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const cuerpo = { x: 0, y: 0, vx: 0, vy: 0, r: 15 };
  let muros = [];
  let meta_ = { x: 0, y: 0, r: 30 };
  let nivel = 1;
  let sb = null;
  let reloj = 0;
  let aviso = '', avisoT = 0;
  let acabado = false;

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };

  /** Cada nivel es un pasillo distinto, generado con la semilla del nivel. */
  function construir() {
    muros = [];
    const r = (n) => {
      // Ruido reproducible por nivel: el mismo nivel es el mismo laberinto.
      const x = Math.sin(nivel * 99.7 + n * 37.3) * 10000;
      return x - Math.floor(x);
    };
    const huecos = 2 + Math.min(4, nivel);
    for (let i = 0; i < huecos; i++) {
      const y = (H / (huecos + 1)) * (i + 1);
      const hueco = clamp(120 - nivel * 12, 58, 120);
      const cx = 90 + r(i) * (W - 180);
      muros.push({ x: 0, y: y - 9, w: cx - hueco / 2, h: 18 });
      muros.push({ x: cx + hueco / 2, y: y - 9, w: W - (cx + hueco / 2), h: 18 });
    }
    cuerpo.x = W / 2; cuerpo.y = 40; cuerpo.vx = cuerpo.vy = 0;
    meta_ = { x: W / 2, y: H - 46, r: 30 };
  }

  function superarNivel() {
    audio.win();
    haptics.score(0); haptics.score(1);
    particles.burst(meta_.x, meta_.y, 30, { speed: 260, color: '#a8ff3e', size: 4, drag: 0.9 });
    if (nivel >= NIVELES) {
      acabado = true;
      // Cooperativo: ganan o pierden los dos. −1 es empate en el shell.
      ctx.finish({ winner: -1, scores: [nivel, nivel], detail: `Los ${NIVELES} pasillos en ${reloj.toFixed(1)} s` });
      return;
    }
    nivel++;
    sb?.setCenter(`Pasillo ${nivel}/${NIVELES}`);
    decir(`¡Pasillo ${nivel}!`);
    construir();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      construir();
      sb = ctx.ui.scoreboard({ center: `Pasillo 1/${NIVELES}` });
      sb.update(0, 0);
      decir('Los dos movéis al mismo muñeco. Poneos de acuerdo.', 3.5);
    },

    resize(nw, nh) { W = nw; H = nh; construir(); },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (acabado) { particles.update(dt); return; }
      reloj += dt;

      /* La suma: si uno va a un lado y el otro al contrario, se anulan. */
      let ax = 0, ay = 0;
      for (const i of [0, 1]) {
        const p = input.player(i);
        ax += (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        ay += (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
      }
      cuerpo.vx += ax * 900 * dt;
      cuerpo.vy += ay * 900 * dt;
      cuerpo.vx *= Math.exp(-4.2 * dt);
      cuerpo.vy *= Math.exp(-4.2 * dt);

      const nx = clamp(cuerpo.x + cuerpo.vx * dt, cuerpo.r, W - cuerpo.r);
      const ny = clamp(cuerpo.y + cuerpo.vy * dt, cuerpo.r, H - cuerpo.r);

      // Choque con muros: rebota y os devuelve arriba del pasillo.
      let choca = false;
      for (const m of muros) {
        if (nx + cuerpo.r < m.x || nx - cuerpo.r > m.x + m.w) continue;
        if (ny + cuerpo.r < m.y || ny - cuerpo.r > m.y + m.h) continue;
        choca = true; break;
      }
      if (choca) {
        audio.error();
        haptics.error(0);
        ctx.shake(9);
        particles.burst(cuerpo.x, cuerpo.y, 14, { speed: 200, color: '#ff4757', size: 3, drag: 0.9 });
        cuerpo.x = W / 2; cuerpo.y = 40; cuerpo.vx = cuerpo.vy = 0;
        decir('Chocasteis: otra vez', 1.4);
      } else {
        cuerpo.x = nx; cuerpo.y = ny;
      }

      if (Math.hypot(cuerpo.x - meta_.x, cuerpo.y - meta_.y) < meta_.r) superarNivel();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0c1410');

      g.fillStyle = '#a8ff3e26';
      g.beginPath(); g.arc(meta_.x, meta_.y, meta_.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#a8ff3e'; g.lineWidth = 3;
      g.beginPath(); g.arc(meta_.x, meta_.y, meta_.r, 0, Math.PI * 2); g.stroke();

      g.fillStyle = '#3b4560';
      for (const m of muros) g.fillRect(m.x, m.y, m.w, m.h);
      particles.render(g);

      /* El muñeco lleva los dos colores: es de los dos. */
      g.save();
      g.beginPath(); g.arc(cuerpo.x, cuerpo.y, cuerpo.r, 0, Math.PI * 2); g.clip();
      g.fillStyle = players[0].color;
      g.fillRect(cuerpo.x - cuerpo.r, cuerpo.y - cuerpo.r, cuerpo.r, cuerpo.r * 2);
      g.fillStyle = players[1].color;
      g.fillRect(cuerpo.x, cuerpo.y - cuerpo.r, cuerpo.r, cuerpo.r * 2);
      g.restore();

      // Las dos intenciones, para ver quién tira de dónde.
      for (const i of [0, 1]) {
        const p = input.player(i);
        const dx = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const dy = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        if (!dx && !dy) continue;
        const n = Math.hypot(dx, dy) || 1;
        g.strokeStyle = players[i].color;
        g.lineWidth = 4;
        g.globalAlpha = 0.7;
        g.beginPath();
        g.moveTo(cuerpo.x, cuerpo.y);
        g.lineTo(cuerpo.x + (dx / n) * 46, cuerpo.y + (dy / n) * 46);
        g.stroke();
        g.globalAlpha = 1;
      }

      if (avisoT > 0) {
        g.fillStyle = '#ffffff';
        g.textAlign = 'center';
        g.font = 'bold 20px system-ui, sans-serif';
        g.fillText(aviso, W / 2, 52);
      }
    },

    destroy() { sb?.remove(); },
  };
}
