/**
 * Retardo — lo que pulsas pasa ocho décimas después.
 *
 * Todo lo que haces entra en una cola y se ejecuta con retraso. No es un
 * fallo ni "lag simulado": es la mecánica. Deja de jugarse reaccionando y pasa
 * a jugarse PREDICIENDO — tienes que pulsar hacia donde vas a necesitar estar,
 * no hacia donde quieres ir ahora.
 *
 * Para que sea justo y no una tortura, se dibuja el fantasma: una silueta que
 * enseña qué órdenes vienen de camino. Sin eso sería adivinar; con eso es un
 * juego de anticipación, que es otra cosa.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const RETARDO = 0.8;         // segundos entre pulsar y que pase
const DURACION = 75;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({
    i, x: 0, y: 0, r: 18, puntos: 0,
    cola: [],                 // [{ t, ax, ay }] órdenes esperando su turno
    ax: 0, ay: 0,             // lo que se está ejecutando ahora mismo
  }));
  let monedas = [];
  let reloj = DURACION;
  let sb = null;
  let t = 0;

  function soltarMoneda() {
    monedas.push({
      x: 60 + ctx.rng() * (W - 120),
      y: 60 + ctx.rng() * (H - 120),
      r: 13, vida: 8 + ctx.rng() * 6,
    });
  }

  function colocar() {
    jug[0].x = W * 0.3; jug[0].y = H / 2;
    jug[1].x = W * 0.7; jug[1].y = H / 2;
    monedas = [];
    for (let i = 0; i < 5; i++) soltarMoneda();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ctx.ui.scoreboard({ center: `${DURACION} s` });
      sb.update(0, 0);
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      t += dt;
      reloj -= dt;
      sb?.setCenter(`${Math.max(0, Math.ceil(reloj))} s`);
      if (reloj <= 0) {
        const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        ctx.finish({ winner: gana, scores: [jug[0].puntos, jug[1].puntos], detail: 'Al tiempo' });
        return;
      }

      for (const j of jug) {
        const p = input.player(j.i);
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        // Solo se encola cuando CAMBIA: una cola con sesenta órdenes por
        // segundo se come la memoria y no aporta nada.
        const ult = j.cola[j.cola.length - 1];
        if (!ult || ult.ax !== ax || ult.ay !== ay) j.cola.push({ t: t + RETARDO, ax, ay });

        while (j.cola.length && j.cola[0].t <= t) {
          const o = j.cola.shift();
          j.ax = o.ax; j.ay = o.ay;
        }

        const n = Math.hypot(j.ax, j.ay) || 1;
        j.x = clamp(j.x + (j.ax / n) * 300 * dt, j.r, W - j.r);
        j.y = clamp(j.y + (j.ay / n) * 300 * dt, j.r, H - j.r);

        for (let k = monedas.length - 1; k >= 0; k--) {
          const m = monedas[k];
          if (Math.hypot(m.x - j.x, m.y - j.y) > j.r + m.r) continue;
          monedas.splice(k, 1);
          j.puntos++;
          sb.update(jug[0].puntos, jug[1].puntos);
          audio.pickup();
          haptics.score(j.i);
          particles.burst(m.x, m.y, 12, { speed: 170, color: players[j.i].color, size: 3, drag: 0.9 });
          soltarMoneda();
        }
      }

      for (let k = monedas.length - 1; k >= 0; k--) {
        monedas[k].vida -= dt;
        if (monedas[k].vida <= 0) { monedas.splice(k, 1); soltarMoneda(); }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1016');

      for (const m of monedas) {
        g.globalAlpha = m.vida < 2 ? 0.4 + Math.sin(t * 14) * 0.3 : 1;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      }
      particles.render(g);

      for (const j of jug) {
        /* El fantasma: hacia dónde apunta la última orden encolada. Es lo que
           convierte el retardo en anticipación en vez de en frustración. */
        const ult = j.cola[j.cola.length - 1];
        if (ult && (ult.ax || ult.ay)) {
          const n = Math.hypot(ult.ax, ult.ay) || 1;
          g.save();
          g.globalAlpha = 0.3;
          g.strokeStyle = players[j.i].color;
          g.lineWidth = 3;
          g.setLineDash([5, 5]);
          g.beginPath();
          g.moveTo(j.x, j.y);
          g.lineTo(j.x + (ult.ax / n) * 70, j.y + (ult.ay / n) * 70);
          g.stroke();
          g.beginPath();
          g.arc(j.x + (ult.ax / n) * 70, j.y + (ult.ay / n) * 70, j.r, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
      }

      g.fillStyle = '#ffffff55';
      g.textAlign = 'center';
      g.font = '12px system-ui, sans-serif';
      g.fillText('Lo que pulsas ocurre 0,8 s después · la línea es lo que viene de camino', W / 2, H - 18);
    },

    destroy() { sb?.remove(); },
  };
}
