/**
 * Ecos — cada ronda te enfrentas también a tus rondas anteriores.
 *
 * Lo que hiciste en la ronda 1 vuelve grabado en la ronda 2, y en la 3 vuelven
 * las dos. Al final hay seis copias tuyas repitiendo exactamente lo que hiciste,
 * y son sólidas: se chocan contigo. El adversario más incómodo acabas siendo tú.
 *
 * Esto obliga a jugar pensando en el futuro: una ruta cómoda hoy es un muro
 * mañana. Y se equilibra solo — quien más monedas coge más se estorba después.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const RONDAS = 6;
const DURA = 14;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [0, 1].map((i) => ({
    i, x: 0, y: 0, r: 15, puntos: 0,
    grabando: [],             // posiciones de esta ronda
    ecos: [],                 // rondas anteriores, ya cerradas
  }));
  let monedas = [];
  let ronda = 1, t = 0, sb = null, pausa = 0;
  let aviso = '', avisoT = 0;

  const decir = (x, s = 2) => { aviso = x; avisoT = s; };

  function sembrar() {
    monedas = [];
    for (let i = 0; i < 7; i++) {
      monedas.push({
        x: 60 + ctx.rng() * (W - 120),
        y: 60 + ctx.rng() * (H - 120), r: 12, viva: true,
      });
    }
  }

  function nuevaRonda() {
    for (const j of jug) {
      if (j.grabando.length) j.ecos.push(j.grabando);
      j.grabando = [];
      j.x = j.i === 0 ? W * 0.22 : W * 0.78;
      j.y = H / 2;
    }
    t = 0;
    sembrar();
    pausa = 1.1;
    sb?.setCenter(`Ronda ${ronda}/${RONDAS} · ${jug[0].ecos.length} ecos`);
    decir(ronda === 1 ? 'Lo que hagas volverá en la ronda siguiente' : `¡${jug[0].ecos.length} ecos tuyos en la pista!`, 2.6);
  }

  /** Dónde estaba un eco en el instante `t` de su ronda. */
  const enEco = (eco, tiempo) => eco[Math.min(eco.length - 1, Math.floor(tiempo * 30))];

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ctx.ui.scoreboard({ center: `Ronda 1/${RONDAS}` });
      sb.update(0, 0);
      nuevaRonda();
    },

    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }
      t += dt;

      for (const j of jug) {
        const p = input.player(j.i);
        const ax = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);
        const ay = (p.held('down') ? 1 : 0) - (p.held('up') ? 1 : 0);
        const n = Math.hypot(ax, ay) || 1;
        j.x = clamp(j.x + (ax / n) * 290 * dt, j.r, W - j.r);
        j.y = clamp(j.y + (ay / n) * 290 * dt, j.r, H - j.r);

        // 30 muestras por segundo: suficiente para que el eco se vea fluido
        // sin guardar 60 posiciones por segundo durante seis rondas.
        if (j.grabando.length < Math.floor(t * 30)) j.grabando.push({ x: j.x, y: j.y });

        // Choque con TUS PROPIOS ecos: te frenan y te empujan.
        for (const eco of j.ecos) {
          const e = enEco(eco, t);
          if (!e) continue;
          const d = Math.hypot(e.x - j.x, e.y - j.y);
          if (d > j.r * 2) continue;
          const nx = (j.x - e.x) / (d || 1), ny = (j.y - e.y) / (d || 1);
          j.x = clamp(j.x + nx * (j.r * 2 - d), j.r, W - j.r);
          j.y = clamp(j.y + ny * (j.r * 2 - d), j.r, H - j.r);
        }

        for (const m of monedas) {
          if (!m.viva || Math.hypot(m.x - j.x, m.y - j.y) > j.r + m.r) continue;
          m.viva = false;
          j.puntos++;
          sb.update(jug[0].puntos, jug[1].puntos);
          audio.pickup();
          haptics.score(j.i);
          particles.burst(m.x, m.y, 12, { speed: 170, color: players[j.i].color, size: 3, drag: 0.9 });
        }
      }

      if (t >= DURA || monedas.every((m) => !m.viva)) {
        ronda++;
        if (ronda > RONDAS) {
          const gana = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
          ctx.finish({
            winner: gana, scores: [jug[0].puntos, jug[1].puntos],
            detail: `${RONDAS} rondas con ${RONDAS - 1} ecos`,
          });
          pausa = 99;
          return;
        }
        nuevaRonda();
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0d16');

      for (const m of monedas) {
        if (!m.viva) continue;
        g.fillStyle = '#ffd166';
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, Math.PI * 2); g.fill();
      }
      particles.render(g);

      // Los ecos, cada vez más tenues cuanto más viejos.
      for (const j of jug) {
        j.ecos.forEach((eco, k) => {
          const e = enEco(eco, t);
          if (!e) return;
          g.globalAlpha = 0.18 + (k / Math.max(1, j.ecos.length)) * 0.32;
          g.fillStyle = players[j.i].color;
          g.beginPath(); g.arc(e.x, e.y, j.r, 0, Math.PI * 2); g.fill();
          g.globalAlpha = 1;
        });
      }

      for (const j of jug) {
        g.fillStyle = players[j.i].color;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffffff'; g.lineWidth = 2;
        g.beginPath(); g.arc(j.x, j.y, j.r, 0, Math.PI * 2); g.stroke();
      }

      g.textAlign = 'center';
      g.fillStyle = '#ffffff';
      g.font = 'bold 18px system-ui, sans-serif';
      g.fillText(`${Math.max(0, DURA - t).toFixed(1)} s`, W / 2, 40);
      if (avisoT > 0) {
        g.font = '16px system-ui, sans-serif';
        g.fillStyle = '#ffffffcc';
        g.fillText(aviso, W / 2, 66);
      }
    },

    destroy() { sb?.remove(); },
  };
}
