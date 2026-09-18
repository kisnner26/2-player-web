/**
 * Planes — programáis cuatro movimientos y se ejecutan a la vez.
 *
 * No hay turnos alternos: los dos escribís vuestro plan en secreto y luego se
 * resuelven **simultáneamente**, paso a paso. Chocar contra el otro os frena a
 * los dos; llegar antes a la moneda te la lleva. Todo el juego está en
 * adivinar qué va a escribir el otro, no en tener mejores reflejos.
 *
 * Cuatro pasos y no ocho a propósito: con ocho el plan se vuelve un ejercicio
 * de memoria y deja de ser una apuesta.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', turnos: true, sinCuentaAtras: true };

const REJA = 9;
const PASOS = 4;
const RONDAS = 8;
const FLECHA = { up: '↑', down: '↓', left: '←', right: '→' };

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [
    { i: 0, cx: 1, cy: 4, plan: [], puntos: 0 },
    { i: 1, cx: REJA - 2, cy: 4, plan: [], puntos: 0 },
  ];
  let moneda = { cx: 4, cy: 4 };
  let fase = 'planear';       // planear | resolver
  let paso = 0, pasoT = 0, ronda = 1;
  let sb = null, aviso = '', avisoT = 0;

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };
  const celda = () => Math.min(W, H) / (REJA + 2);
  const px = (c) => (W - celda() * REJA) / 2 + c * celda() + celda() / 2;
  const py = (c) => (H - celda() * REJA) / 2 + c * celda() + celda() / 2;

  function nuevaMoneda() {
    do {
      moneda.cx = Math.floor(ctx.rng() * REJA);
      moneda.cy = Math.floor(ctx.rng() * REJA);
    } while (jug.some((j) => j.cx === moneda.cx && j.cy === moneda.cy));
  }

  function empezarResolucion() {
    fase = 'resolver';
    paso = 0; pasoT = 0;
    audio.select();
  }

  function ejecutarPaso() {
    const destinos = jug.map((j) => {
      const d = j.plan[paso];
      const dx = d === 'left' ? -1 : d === 'right' ? 1 : 0;
      const dy = d === 'up' ? -1 : d === 'down' ? 1 : 0;
      return { cx: clamp(j.cx + dx, 0, REJA - 1), cy: clamp(j.cy + dy, 0, REJA - 1) };
    });

    // Mismo destino: chocan y ninguno se mueve. Es el corazón del farol.
    if (destinos[0].cx === destinos[1].cx && destinos[0].cy === destinos[1].cy) {
      audio.hit();
      ctx.shake(7);
      particles.burst(px(destinos[0].cx), py(destinos[0].cy), 16, {
        speed: 200, color: '#ffffff', size: 3, drag: 0.9,
      });
      decir('¡Choque! Los dos os quedáis', 1.2);
    } else {
      jug.forEach((j, i) => { j.cx = destinos[i].cx; j.cy = destinos[i].cy; });
    }

    for (const j of jug) {
      if (j.cx !== moneda.cx || j.cy !== moneda.cy) continue;
      j.puntos++;
      sb.update(jug[0].puntos, jug[1].puntos);
      audio.pickup();
      haptics.score(j.i);
      particles.burst(px(moneda.cx), py(moneda.cy), 14, {
        speed: 180, color: players[j.i].color, size: 3, drag: 0.9,
      });
      nuevaMoneda();
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaMoneda();
      sb = ctx.ui.scoreboard({ center: `Ronda 1/${RONDAS}` });
      sb.update(0, 0);
      decir('Escribid cuatro movimientos. Se ejecutan a la vez.', 3.5);
    },

    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;

      if (fase === 'planear') {
        for (const j of jug) {
          if (j.plan.length >= PASOS) continue;
          const p = input.player(j.i);
          for (const d of ['up', 'down', 'left', 'right']) {
            if (p.pressed(d)) { j.plan.push(d); audio.blip(); break; }
          }
          // La acción borra el último, por si te equivocas.
          if (p.pressed('b') && j.plan.length) { j.plan.pop(); audio.back(); }
        }
        if (jug.every((j) => j.plan.length === PASOS)) empezarResolucion();
        return;
      }

      pasoT += dt;
      if (pasoT < 0.45) { particles.update(dt); return; }
      pasoT = 0;
      ejecutarPaso();
      paso++;
      if (paso < PASOS) { particles.update(dt); return; }

      // Fin de ronda
      for (const j of jug) j.plan = [];
      ronda++;
      if (ronda > RONDAS) {
        const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        ctx.finish({
          winner: gana, scores: [jug[0].puntos, jug[1].puntos],
          detail: `${RONDAS} rondas de planes`,
        });
        return;
      }
      sb?.setCenter(`Ronda ${ronda}/${RONDAS}`);
      fase = 'planear';
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      const c = celda();
      ctx.engine.clear('#0b1016');

      for (let x = 0; x < REJA; x++) {
        for (let y = 0; y < REJA; y++) {
          g.strokeStyle = '#ffffff14';
          g.lineWidth = 1;
          g.strokeRect(px(x) - c / 2, py(y) - c / 2, c, c);
        }
      }

      g.fillStyle = '#ffd166';
      g.beginPath(); g.arc(px(moneda.cx), py(moneda.cy), c * 0.24, 0, Math.PI * 2); g.fill();
      particles.render(g);

      for (const j of jug) {
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(px(j.cx), py(j.cy), c * 0.34, 0, Math.PI * 2); g.fill();
      }

      /* Los planes: EN SECRETO mientras se escriben (solo se ve cuántos
         llevas), y a la vista al resolver. Enseñar el plan del otro mientras
         escribe reventaría el farol, que es todo el juego. */
      for (const j of jug) {
        const bx = j.i === 0 ? 24 : W - 24 - PASOS * 34;
        for (let k = 0; k < PASOS; k++) {
          const puesto = k < j.plan.length;
          g.fillStyle = puesto ? players[j.i].color : '#ffffff1a';
          g.fillRect(bx + k * 34, H - 58, 28, 28);
          if (puesto && fase === 'resolver') {
            g.fillStyle = k < paso ? '#ffffff55' : '#ffffff';
            g.font = 'bold 17px system-ui';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(FLECHA[j.plan[k]], bx + k * 34 + 14, H - 43);
          }
        }
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = 'bold 19px system-ui, sans-serif';
      g.fillText(fase === 'planear' ? 'Escribid vuestro plan (especial borra)' : `Paso ${paso + 1} de ${PASOS}`, W / 2, 40);
      if (avisoT > 0) {
        g.font = '15px system-ui, sans-serif';
        g.fillStyle = '#ffffffcc';
        g.fillText(aviso, W / 2, 66);
      }
    },

    destroy() { sb?.remove(); },
  };
}
