/**
 * Puente Frágil — cooperativo: crucen sin caerse, aprendiendo entre los dos.
 *
 * Cada tramo del puente tiene una sola tabla segura entre varias opciones,
 * decidida al azar y desconocida al principio. Cuando alguien pisa una tabla
 * débil, rebota un paso atrás pero esa tabla queda marcada en verde para
 * siempre: el conocimiento se acumula para los dos, así que ir primero no es
 * un castigo, es información para el equipo.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const TRAMOS = 10;
const OPCIONES_POR_TRAMO = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let tablas = [];              // por tramo: {segura, conocida[3]}
  const jug = [{ i: 0, tramo: -1 }, { i: 1, tramo: -1 }];
  let turno = 0;
  let caidas = 0;
  let terminado = false;
  let sb = null;
  let cursor = 1;

  function generar() {
    tablas = [];
    for (let t = 0; t < TRAMOS; t++) {
      tablas.push({ segura: Math.floor(rng() * OPCIONES_POR_TRAMO), conocida: [false, false, false] });
    }
    jug[0].tramo = -1; jug[1].tramo = -1;
    turno = 0;
    cursor = 1;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      sb = ui.scoreboard({ center: `0 / ${TRAMOS}` });
      ui.banner('Elijan tabla por turnos · una fallida se marca para siempre');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      const p = jug[turno];
      const pl = input.player(turno);
      if (pl.pressed('left')) { cursor = clamp(cursor - 1, 0, 2); audio.tick(); }
      if (pl.pressed('right')) { cursor = clamp(cursor + 1, 0, 2); audio.tick(); }
      if (pl.pressed('a')) intentar(p, cursor);
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0c1420');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#182838'); grd.addColorStop(1, '#0a1018');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      const margenX = W * 0.08, ancho = (W - margenX * 2) / TRAMOS;
      const filaY = H * 0.55, altoFila = 26;

      // Abismo
      g.fillStyle = '#050810';
      g.fillRect(margenX, filaY - 60, W - margenX * 2, 130);

      for (let t = 0; t < TRAMOS; t++) {
        const x = margenX + t * ancho;
        const tabla = tablas[t];
        for (let o = 0; o < OPCIONES_POR_TRAMO; o++) {
          const y = filaY - 40 + o * altoFila;
          const esProxima = t === Math.max(jug[0].tramo, jug[1].tramo) + 1;
          let color = '#3a4a5c';
          if (tabla.conocida[o]) color = o === tabla.segura ? '#a8ff3e' : '#3a2020';
          g.save();
          g.globalAlpha = esProxima ? 1 : 0.45;
          g.fillStyle = color;
          g.fillRect(x + 3, y, ancho - 6, altoFila - 5);
          g.restore();
          if (esProxima && cursor === o && (turno === 0 || turno === 1)) {
            const activo = jug[turno].tramo + 1 === t;
            if (activo) {
              g.strokeStyle = players[turno].color; g.lineWidth = 2;
              g.strokeRect(x + 1, y - 2, ancho - 2, altoFila - 1);
            }
          }
        }
      }

      particles.render(g);

      // Jugadores
      for (const p of jug) {
        const x = margenX + (p.tramo + 0.5) * ancho - ancho * 0.5;
        const px = margenX + Math.max(0, p.tramo) * ancho + (p.tramo < 0 ? -ancho * 0.6 : ancho * 0.5);
        const py = filaY - 40 + (tablas[p.tramo]?.segura ?? 1) * altoFila + altoFila / 2;
        ctx.engine.glowCircle(px, p.tramo < 0 ? filaY + 20 : py, 12, players[p.i].color, 14);
      }

      ctx.engine.text(`Turno de ${players[turno].name}`, W / 2, H * 0.18, {
        size: 14, color: players[turno].color, font: 'system-ui',
      });
      ctx.engine.text('←/→ elegir tabla · Espacio o M confirmar', W / 2, H * 0.86, {
        size: 11, color: '#ffffff66', font: 'system-ui',
      });
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function intentar(p, opcion) {
    const siguiente = p.tramo + 1;
    if (siguiente >= TRAMOS) return;
    const tabla = tablas[siguiente];
    tabla.conocida[opcion] = true;

    if (opcion === tabla.segura) {
      p.tramo = siguiente;
      audio.pickup();
      haptics.play('score', { player: p.i, scale: 0.7 });
      sb.update(Math.min(jug[0].tramo, jug[1].tramo) + 1, 0);
      sb.setCenter(`${jug[0].tramo + 1} / ${TRAMOS} · ${jug[1].tramo + 1} / ${TRAMOS}`);

      if (p.tramo >= TRAMOS - 1) {
        const otro = jug[1 - p.i];
        if (otro.tramo >= TRAMOS - 1) return terminar();
        ui.toast(`${players[p.i].name} ya cruzó · falta ${players[otro.i].name}`, { ms: 1600 });
        turno = otro.i;
        cursor = 1;
        return;
      }
    } else {
      caidas++;
      audio.error();
      haptics.error(p.i);
      ctx.shake(8);
      particles.burst(margenX + siguiente * ((W - margenX * 2) / TRAMOS), H * 0.55, 16, {
        speed: 180, color: '#ff4757', size: 4, gravity: 300,
      });
    }
    turno = 1 - turno;
    cursor = 1;
  }

  function terminar() {
    terminado = true;
    audio.win(); haptics.play('victory');
    ctx.finish({
      winner: -1,
      scores: [TRAMOS, caidas],
      detail: `Los dos cruzaron con ${caidas} caídas`,
      record: ctx.record('caidas', caidas, 'low'),
    });
  }
}
