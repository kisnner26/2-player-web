/**
 * Interruptor — las reglas cambian cada diez segundos.
 *
 * Cada tanda toca una regla distinta y se avisa dos segundos antes: los
 * controles se invierten, la velocidad se dispara, las monedas restan en vez de
 * sumar, o solo puntúa quien esté quieto. La habilidad que se mide no es
 * ninguna en concreto: es **desaprender rápido**.
 *
 * El aviso previo es lo que lo salva de ser una broma. Sin él sería aleatorio;
 * con él es una carrera por adaptarse antes que el otro.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 80;
const TANDA = 10;

const REGLAS = [
  { id: 'normal', nombre: 'Normal', desc: 'Coge monedas' },
  { id: 'invertido', nombre: '¡Controles al revés!', desc: 'Todo invertido' },
  { id: 'veloz', nombre: '¡Turbo!', desc: 'El doble de rápido' },
  { id: 'venenoso', nombre: '¡Las monedas restan!', desc: 'No las toques' },
  { id: 'quieto', nombre: '¡Solo puntúa el quieto!', desc: 'No te muevas' },
  { id: 'hielo', nombre: '¡Hielo!', desc: 'Sin rozamiento' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({ i, x: 0, y: 0, vx: 0, vy: 0, r: 17, puntos: 0 }));
  let monedas = [];
  let regla = REGLAS[0], siguiente = null;
  let reloj = DURACION, tanda = TANDA, sb = null, t = 0;

  function sembrar() {
    monedas = [];
    for (let i = 0; i < 8; i++) {
      monedas.push({ x: 60 + ctx.rng() * (W - 120), y: 60 + ctx.rng() * (H - 120), r: 12, viva: true });
    }
  }
  function colocar() {
    jug[0].x = W * 0.3; jug[0].y = H / 2;
    jug[1].x = W * 0.7; jug[1].y = H / 2;
    sembrar();
  }
  function cambiar() {
    regla = siguiente || REGLAS[Math.floor(ctx.rng() * REGLAS.length)];
    siguiente = null;
    tanda = TANDA;
    audio.select();
    ctx.shake(6);
    sembrar();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ctx.ui.scoreboard({ center: regla.nombre });
      sb.update(0, 0);
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      t += dt;
      reloj -= dt;
      tanda -= dt;
      if (tanda < 2 && !siguiente) {
        // El aviso: dos segundos para prepararse.
        siguiente = REGLAS.filter((r) => r.id !== regla.id)[Math.floor(ctx.rng() * (REGLAS.length - 1))];
        audio.tick();
      }
      if (tanda <= 0) cambiar();
      sb?.setCenter(`${regla.nombre} · ${Math.max(0, Math.ceil(reloj))} s`);

      if (reloj <= 0) {
        const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        ctx.finish({ winner: gana, scores: [jug[0].puntos, jug[1].puntos], detail: 'Ocho cambios de regla' });
        return;
      }

      for (const j of jug) {
        const p = input.player(j.i);
        const inv = regla.id === 'invertido' ? -1 : 1;
        const vel = regla.id === 'veloz' ? 2600 : 1350;
        const roz = regla.id === 'hielo' ? 0.5 : 3.6;
        const ax = ((p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0)) * inv;
        const ay = ((p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0)) * inv;
        j.vx += ax * vel * dt;
        j.vy += ay * vel * dt;
        j.vx *= Math.exp(-roz * dt);
        j.vy *= Math.exp(-roz * dt);
        j.x = clamp(j.x + j.vx * dt, j.r, W - j.r);
        j.y = clamp(j.y + j.vy * dt, j.r, H - j.r);

        // «Solo puntúa el quieto» no usa monedas: es una regla aparte.
        if (regla.id === 'quieto') {
          if (Math.hypot(j.vx, j.vy) < 22) j.puntos += dt * 6;
          sb.update(Math.floor(jug[0].puntos), Math.floor(jug[1].puntos));
          continue;
        }

        for (const m of monedas) {
          if (!m.viva || Math.hypot(m.x - j.x, m.y - j.y) > j.r + m.r) continue;
          m.viva = false;
          const delta = regla.id === 'venenoso' ? -2 : 1;
          j.puntos = Math.max(0, j.puntos + delta);
          sb.update(Math.floor(jug[0].puntos), Math.floor(jug[1].puntos));
          if (delta > 0) { audio.pickup(); haptics.score(j.i); }
          else { audio.error(); haptics.error(j.i); }
          particles.burst(m.x, m.y, 12, {
            speed: 170, color: delta > 0 ? players[j.i].color : '#ff4757', size: 3, drag: 0.9,
          });
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear(regla.id === 'venenoso' ? '#160b10' : (regla.id === 'hielo' ? '#0a1420' : '#0c0f17'));

      if (regla.id !== 'quieto') {
        for (const m of monedas) {
          if (!m.viva) continue;
          g.fillStyle = regla.id === 'venenoso' ? '#ff4757' : '#ffd166';
          g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
        }
      }
      particles.render(g);

      for (const j of jug) {
        const quieto = regla.id === 'quieto' && Math.hypot(j.vx, j.vy) < 22;
        if (quieto) {
          g.globalAlpha = 0.3 + Math.sin(t * 8) * 0.15;
          g.fillStyle = '#a8ff3e';
          g.beginPath(); g.arc(j.x, j.y, j.r + 14, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        }
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = 'bold 22px system-ui, sans-serif';
      g.fillText(regla.nombre, W / 2, 44);
      g.font = '13px system-ui, sans-serif';
      g.fillStyle = '#ffffff88';
      g.fillText(regla.desc, W / 2, 66);

      if (siguiente) {
        g.globalAlpha = 0.5 + Math.sin(t * 12) * 0.4;
        g.fillStyle = '#ffd166';
        g.font = 'bold 26px system-ui, sans-serif';
        g.fillText(`En ${tanda.toFixed(1)}: ${siguiente.nombre}`, W / 2, H / 2);
        g.globalAlpha = 1;
      }
    },

    destroy() { sb?.remove(); },
  };
}
