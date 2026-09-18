/**
 * Cocina Caos — pedidos contrarreloj en una cocina compartida.
 *
 * Cada plato necesita pasar por estaciones distintas (cortar, cocinar) y solo
 * se puede llevar una cosa en las manos, así que la única forma de ir rápido
 * es repartirse el trabajo: uno prepara mientras el otro entrega.
 *
 * Es cooperativo puro: la puntuación es común y las propinas también.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { PATHS } from '../../core/icons.js';

export const meta = { render: 'canvas' };

const DURACION = 150;
const VEL = 250;
const R = 17;

const RECETAS = [
  { id: 'ensalada', emoji: '🥗', nombre: 'Ensalada', base: '🥬', pasos: ['cortar'], puntos: 60, tiempo: 32 },
  { id: 'sopa',     emoji: '🍲', nombre: 'Sopa',     base: '🥕', pasos: ['cortar', 'cocinar'], puntos: 110, tiempo: 46 },
  { id: 'filete',   emoji: '🍖', nombre: 'Filete',   base: '🥩', pasos: ['cocinar'], puntos: 90, tiempo: 38 },
  { id: 'pan',      emoji: '🥖', nombre: 'Pan',      base: '🌾', pasos: ['cocinar'], puntos: 70, tiempo: 34 },
  { id: 'tacos',    emoji: '🌮', nombre: 'Tacos',    base: '🌽', pasos: ['cortar', 'cocinar'], puntos: 130, tiempo: 50 },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let estaciones = [];
  const cocineros = [cocinero(0), cocinero(1)];
  let pedidos = [];
  let tiempo = DURACION;
  let puntos = 0, servidos = 0, perdidos = 0;
  let sb = null, terminado = false;
  let proximoPedido = 2;

  /** Dibuja un icono de core/icons.js en canvas (los paths están en un box de 24x24). */
  function dibujarIcono(g, nombre, x, y, size, color = '#f2f2f2') {
    const path = new Path2D(PATHS[nombre]);
    g.save();
    g.translate(x - size / 2, y - size / 2);
    g.scale(size / 24, size / 24);
    g.fillStyle = color;
    g.fill(path);
    g.restore();
  }

  function cocinero(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, lleva: null, cara: 0, usando: null };
  }

  /**
   * `lleva` = { receta, hechos:[...pasos completados] } o null.
   * Una estación de tipo 'caja' entrega el ingrediente base de una receta.
   */
  function construirCocina() {
    const m = 70;
    const cajasY = m;
    estaciones = [];

    // Cajas de ingredientes arriba
    const bases = [...new Set(RECETAS.map((r) => r.base))];
    bases.forEach((b, k) => {
      const receta = RECETAS.find((r) => r.base === b);
      estaciones.push({
        tipo: 'caja', emoji: b, receta,
        x: m + (k + 0.5) * ((W - m * 2) / bases.length), y: cajasY,
        w: 74, h: 58, etiqueta: receta.nombre,
      });
    });

    // Estaciones de proceso en medio
    estaciones.push({ tipo: 'cortar', icono: 'knife', x: W * 0.3, y: H * 0.52, w: 92, h: 70, etiqueta: 'Cortar', progreso: 0, dur: 1.6 });
    estaciones.push({ tipo: 'cortar', icono: 'knife', x: W * 0.7, y: H * 0.52, w: 92, h: 70, etiqueta: 'Cortar', progreso: 0, dur: 1.6 });
    estaciones.push({ tipo: 'cocinar', icono: 'flame', x: W * 0.45, y: H * 0.72, w: 92, h: 70, etiqueta: 'Cocinar', progreso: 0, dur: 2.4 });
    estaciones.push({ tipo: 'cocinar', icono: 'flame', x: W * 0.55, y: H * 0.72, w: 92, h: 70, etiqueta: 'Cocinar', progreso: 0, dur: 2.4 });

    // Ventanilla de entrega y basura
    estaciones.push({ tipo: 'entregar', icono: 'bell', x: W * 0.5, y: H - 60, w: 150, h: 62, etiqueta: 'Entregar' });
    estaciones.push({ tipo: 'basura', icono: 'trash', x: W - 60, y: H - 60, w: 62, h: 62, etiqueta: 'Tirar' });
  }

  function nuevoPedido() {
    const r = RECETAS[Math.floor(rng() * RECETAS.length)];
    pedidos.push({ receta: r, restante: r.tiempo, max: r.tiempo, id: Math.random() });
  }

  function estacionCerca(c) {
    let mejor = null, md = Infinity;
    for (const e of estaciones) {
      const dx = Math.abs(c.x - e.x), dy = Math.abs(c.y - e.y);
      if (dx > e.w / 2 + R + 10 || dy > e.h / 2 + R + 10) continue;
      const d = dx + dy;
      if (d < md) { md = d; mejor = e; }
    }
    return mejor;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      construirCocina();
      cocineros[0].x = W * 0.35; cocineros[0].y = H * 0.35;
      cocineros[1].x = W * 0.65; cocineros[1].y = H * 0.35;
      pedidos = [];
      nuevoPedido();
      nuevoPedido();
      sb = ui.scoreboard({ center: '' });
    },
    resize(nw, nh) { W = nw; H = nh; construirCocina(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }

      tiempo -= dt;
      sb.setCenter(`${Math.floor(Math.max(0, tiempo) / 60)}:${String(Math.max(0, Math.ceil(tiempo % 60)) % 60).padStart(2, '0')}  ·  ${puntos} pts`);
      sb.update(servidos, perdidos);
      if (tiempo <= 0) return terminar();

      // Pedidos
      proximoPedido -= dt;
      if (proximoPedido <= 0 && pedidos.length < 4) {
        nuevoPedido();
        audio.blip();
        proximoPedido = clamp(9 - servidos * 0.25, 4.5, 9);
      }
      for (let i = pedidos.length - 1; i >= 0; i--) {
        pedidos[i].restante -= dt;
        if (pedidos[i].restante <= 0) {
          pedidos.splice(i, 1);
          perdidos++;
          puntos = Math.max(0, puntos - 30);
          audio.error();
          haptics.error(null);
          ctx.shake(8);
          ui.toast('¡Pedido perdido!', { ms: 1200, color: '#ff4757' });
        }
      }

      // Cocineros
      for (const c of cocineros) {
        const pl = input.player(c.i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        const estaUsando = c.usando != null;
        const vel = estaUsando ? 0 : VEL;
        c.x = clamp(c.x + (dx / len) * vel * dt, R, W - R);
        c.y = clamp(c.y + (dy / len) * vel * dt, R + 40, H - R);
        if (dx || dy) c.cara = Math.atan2(dy, dx);

        const est = estacionCerca(c);

        // Mantener pulsada la acción trabaja la estación
        if (est && (est.tipo === 'cortar' || est.tipo === 'cocinar') && pl.held('a') && c.lleva) {
          const paso = est.tipo;
          const receta = c.lleva.receta;
          const siguiente = receta.pasos.find((p) => !c.lleva.hechos.includes(p));
          if (siguiente === paso) {
            c.usando = est;
            est.progreso += dt / est.dur;
            haptics.play({ lf: 0.3, hf: 0.2, dur: 0.06, freq: 70, shake: 0.5, curve: 'hold' }, { player: c.i });
            if (Math.random() < dt * 8) audio.tick();
            if (est.progreso >= 1) {
              est.progreso = 0;
              c.lleva.hechos.push(paso);
              c.usando = null;
              audio.pickup();
              haptics.play('score', { player: c.i, scale: 0.6 });
              particles.burst(est.x, est.y, 10, { speed: 120, color: '#a8ff3e', size: 3 });
            }
          } else {
            c.usando = null;
          }
        } else {
          if (c.usando) { c.usando.progreso = 0; c.usando = null; }
        }

        // Pulsación corta: agarrar / soltar / entregar
        if (pl.pressed('a') && est) interactuar(c, est);
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#14100c');

      // Suelo de baldosas
      const t = 42;
      for (let y = 0; y < H; y += t) {
        for (let x = 0; x < W; x += t) {
          g.fillStyle = ((x / t + y / t) % 2) ? '#221b14' : '#1c1610';
          g.fillRect(x, y, t, t);
        }
      }

      // Estaciones
      for (const e of estaciones) {
        const x = e.x - e.w / 2, y = e.y - e.h / 2;
        g.fillStyle = e.tipo === 'entregar' ? '#3a2a10' : e.tipo === 'basura' ? '#2a1a1a' : '#2e2620';
        g.fillRect(x, y, e.w, e.h);
        g.strokeStyle = e.tipo === 'entregar' ? '#ffd166' : '#4a4038';
        g.lineWidth = 2;
        g.strokeRect(x, y, e.w, e.h);

        if (e.icono) dibujarIcono(g, e.icono, e.x, e.y - 4, 26);
        else ctx.engine.text(e.emoji, e.x, e.y - 4, { size: 26, font: 'system-ui' });
        ctx.engine.text(e.etiqueta, e.x, y + e.h - 10, { size: 9, color: '#ffffff77', font: 'system-ui' });

        if (e.progreso > 0) {
          g.fillStyle = '#00000088';
          g.fillRect(x + 8, y + e.h - 22, e.w - 16, 7);
          g.fillStyle = '#a8ff3e';
          g.fillRect(x + 8, y + e.h - 22, (e.w - 16) * e.progreso, 7);
        }
      }

      particles.render(g);

      // Cocineros
      for (const c of cocineros) {
        const col = players[c.i].color;
        ctx.engine.glowCircle(c.x, c.y, R, col, 14);
        g.fillStyle = '#fff';
        g.beginPath();
        g.arc(c.x + Math.cos(c.cara) * 6, c.y + Math.sin(c.cara) * 6, 4, 0, TAU);
        g.fill();
        // Gorro
        g.fillStyle = '#f2f2f2';
        g.fillRect(c.x - 9, c.y - R - 9, 18, 8);
        if (c.lleva) {
          const r = c.lleva.receta;
          const listo = r.pasos.every((p) => c.lleva.hechos.includes(p));
          ctx.engine.text(listo ? r.emoji : r.base, c.x, c.y - R - 22, { size: 20, font: 'system-ui' });
          if (listo) {
            g.strokeStyle = '#a8ff3e';
            g.lineWidth = 2;
            g.beginPath(); g.arc(c.x, c.y - R - 22, 16, 0, TAU); g.stroke();
          }
        }
      }

      // Panel de pedidos
      const px = 16, py = 74;
      pedidos.forEach((p, k) => {
        const y = py + k * 54;
        g.fillStyle = '#00000099';
        g.fillRect(px, y, 168, 46);
        const urgente = p.restante / p.max < 0.3;
        g.strokeStyle = urgente ? '#ff4757' : '#ffffff33';
        g.lineWidth = 2;
        g.strokeRect(px, y, 168, 46);
        ctx.engine.text(p.receta.emoji, px + 24, y + 22, { size: 22, font: 'system-ui' });
        ctx.engine.text(p.receta.nombre, px + 46, y + 15, { size: 11, color: '#fff', align: 'left', font: 'system-ui' });
        ctx.engine.text(p.receta.pasos.join(' → ') || 'listo', px + 46, y + 31, {
          size: 9, color: '#ffffff88', align: 'left', font: 'system-ui',
        });
        g.fillStyle = '#ffffff20';
        g.fillRect(px + 4, y + 40, 160, 4);
        g.fillStyle = urgente ? '#ff4757' : '#ffd166';
        g.fillRect(px + 4, y + 40, 160 * (p.restante / p.max), 4);
      });
    },

    destroy() { sb?.remove(); },
  };

  function interactuar(c, est) {
    if (est.tipo === 'caja') {
      if (c.lleva) { audio.error(); haptics.error(c.i); return; }
      c.lleva = { receta: est.receta, hechos: [] };
      audio.select();
      haptics.play('click', { player: c.i });
      return;
    }
    if (est.tipo === 'basura') {
      if (!c.lleva) return;
      c.lleva = null;
      audio.back();
      haptics.play('soft', { player: c.i });
      return;
    }
    if (est.tipo === 'entregar') {
      if (!c.lleva) { audio.error(); return; }
      const r = c.lleva.receta;
      const listo = r.pasos.every((p) => c.lleva.hechos.includes(p));
      const idx = pedidos.findIndex((p) => p.receta.id === r.id);
      if (!listo || idx < 0) {
        audio.error();
        haptics.error(c.i);
        ui.toast(listo ? 'Nadie pidió eso' : 'Todavía no está listo', { ms: 1100, color: '#ff4757' });
        return;
      }
      const p = pedidos[idx];
      // Propina por entregar con tiempo de sobra.
      const bono = Math.round(p.receta.puntos * (0.5 + (p.restante / p.max) * 0.5));
      puntos += bono;
      servidos++;
      pedidos.splice(idx, 1);
      c.lleva = null;
      audio.win();
      haptics.play('victory', { player: c.i });
      ui.toast(`+${bono}`, { ms: 900, color: '#a8ff3e' });
      particles.burst(est.x, est.y, 20, { speed: 200, color: '#ffd166', size: 4, gravity: -100 });
      return;
    }
    // Estaciones de proceso: soltar o recoger no aplica; se trabajan manteniendo.
    if (!c.lleva) { audio.error(); haptics.error(c.i); }
  }

  function terminar() {
    terminado = true;
    ctx.finish({
      winner: -1,
      scores: [servidos, perdidos],
      detail: `${puntos} puntos · ${servidos} platos servidos, ${perdidos} perdidos`,
      record: ctx.record('puntos', puntos, 'high'),
    });
  }
}
