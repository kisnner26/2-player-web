/**
 * Curvas — tu línea nunca se detiene y de vez en cuando deja un hueco.
 *
 * La colisión se resuelve con una máscara de ocupación del tamaño del campo:
 * cada trazo marca sus píxeles y el cabezal comprueba el punto que tiene
 * justo delante. Es exacto y O(1) por jugador, a diferencia de comparar
 * contra la lista de segmentos, que crece sin parar durante la ronda.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const VEL = 175;
const GIRO = 3.1;          // radianes por segundo
const GROSOR = 4;
const HUECO_CADA = [1.4, 3.2];   // segundos entre huecos
const HUECO_DURA = 0.26;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let mask = null;           // Uint8Array W*H — 0 libre, 1+ ocupado
  let capa = null;           // canvas donde se acumulan los trazos dibujados
  let capaCtx = null;

  const jug = [crearJugador(0), crearJugador(1)];
  let ronda = 1;
  let sb = null;
  let finRonda = 0;
  let vivos = 2;

  function crearJugador(i) {
    return { i, x: 0, y: 0, a: 0, vivo: true, score: 0, hueco: 0, proxHueco: 0, invul: 0 };
  }

  function nuevaRonda() {
    mask = new Uint8Array(W * H);
    capa = document.createElement('canvas');
    capa.width = W; capa.height = H;
    capaCtx = capa.getContext('2d');
    capaCtx.lineCap = 'round';
    capaCtx.lineJoin = 'round';

    vivos = 2;
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.vivo = true;
      p.x = W * (i === 0 ? 0.25 : 0.75) + (rng() - 0.5) * W * 0.15;
      p.y = H * 0.5 + (rng() - 0.5) * H * 0.4;
      p.a = i === 0 ? 0 : Math.PI;
      p.a += (rng() - 0.5) * 1.2;
      p.hueco = 0;
      p.proxHueco = HUECO_CADA[0] + rng() * (HUECO_CADA[1] - HUECO_CADA[0]);
      p.invul = 0.5;        // margen inicial para no morir en el arranque
    }
    finRonda = 0;
    ui.toast(`Ronda ${ronda}`, { ms: 1100 });
  }

  /** Marca un disco de radio r en la máscara y devuelve si chocaba antes. */
  function pintar(x, y, r) {
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(W - 1, Math.ceil(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(H - 1, Math.ceil(y + r));
    const r2 = r * r;
    for (let py = y0; py <= y1; py++) {
      const dy = py - y;
      for (let px = x0; px <= x1; px++) {
        const dx = px - x;
        if (dx * dx + dy * dy <= r2) mask[py * W + px] = 1;
      }
    }
  }

  function ocupado(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return mask[(y | 0) * W + (x | 0)] === 1;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },

    resize(nw, nh) {
      // Cambiar el tamaño invalida la máscara: se reinicia la ronda en curso.
      W = nw; H = nh;
      nuevaRonda();
    },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        if (finRonda <= 0) siguienteRonda();
        particles.update(dt);
        return;
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        // Solo izquierda/derecha: el resto de teclas queda libre, lo que
        // reduce el riesgo de ghosting con dos jugadores a la vez.
        const giro = (pl.held('right') ? 1 : 0) - (pl.held('left') ? 1 : 0);
        p.a += giro * GIRO * dt;

        if (p.invul > 0) p.invul -= dt;
        p.proxHueco -= dt;
        if (p.proxHueco <= 0 && p.hueco <= 0) {
          p.hueco = HUECO_DURA;
          p.proxHueco = HUECO_CADA[0] + rng() * (HUECO_CADA[1] - HUECO_CADA[0]);
        }
        if (p.hueco > 0) p.hueco -= dt;

        // Subpasos para que a alta velocidad no se salte la colisión.
        const pasos = Math.max(1, Math.ceil(VEL * dt / 2));
        const sdt = dt / pasos;
        for (let s = 0; s < pasos && p.vivo; s++) {
          const nx = p.x + Math.cos(p.a) * VEL * sdt;
          const ny = p.y + Math.sin(p.a) * VEL * sdt;

          // Se comprueba un punto por delante del cabezal, no el centro,
          // para no chocar contra el trazo que uno mismo acaba de dejar.
          const fx = nx + Math.cos(p.a) * (GROSOR + 1);
          const fy = ny + Math.sin(p.a) * (GROSOR + 1);
          if (p.invul <= 0 && ocupado(fx, fy)) { morir(p); break; }

          const dibujando = p.hueco <= 0;
          if (dibujando) {
            capaCtx.strokeStyle = players[p.i].color;
            capaCtx.lineWidth = GROSOR * 2;
            capaCtx.beginPath();
            capaCtx.moveTo(p.x, p.y);
            capaCtx.lineTo(nx, ny);
            capaCtx.stroke();
            pintar(nx, ny, GROSOR);
          }
          p.x = nx; p.y = ny;
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#05050d');

      // Borde del campo: choca igual que un trazo.
      g.save();
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 4;
      g.strokeRect(2, 2, W - 4, H - 4);
      g.restore();

      if (capa) {
        g.save();
        g.shadowColor = '#ffffff40';
        g.shadowBlur = 8;
        g.drawImage(capa, 0, 0);
        g.restore();
      }

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        ctx.engine.glowCircle(p.x, p.y, GROSOR + 2, col, 22);
        // Punta blanca: ayuda a ver hacia dónde apunta cada uno.
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(p.x + Math.cos(p.a) * 3, p.y + Math.sin(p.a) * 3, 2, 0, TAU);
        g.fill();
        if (p.hueco > 0) {
          g.save();
          g.globalAlpha = 0.6;
          g.strokeStyle = col;
          g.lineWidth = 1.5;
          g.beginPath(); g.arc(p.x, p.y, 12, 0, TAU); g.stroke();
          g.restore();
        }
      }
    },

    destroy() { sb?.remove(); },
  };

  function morir(p) {
    p.vivo = false;
    vivos--;
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(12);
    particles.burst(p.x, p.y, 34, {
      speed: 260, color: players[p.i].color, size: 5, drag: 0.92, shape: 'square',
    });
    const otro = 1 - p.i;
    if (vivos <= 1) {
      // Quien sobrevive gana el punto; si mueren en el mismo paso, nadie suma.
      if (jug[otro].vivo) jug[otro].score++;
      sb.update(jug[0].score, jug[1].score);
      finRonda = 1.4;
    }
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) {
      ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score], detail: `${ronda} rondas jugadas` });
      return;
    }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
