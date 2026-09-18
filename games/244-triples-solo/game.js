/**
 * Triples — concurso de tiro contra la máquina.
 *
 * Un minuto, cinco posiciones y una barra de fuerza que sube y baja. Clavar la
 * ventana verde entra siempre; fuera de ella la parábola se queda corta o se
 * pasa. Es la mecánica más pura que hay: una sola decisión, mil veces, y cada
 * vez sabes exactamente por qué has fallado.
 *
 * El bot usa la misma barra. Su «pulso» es el error de core/bot.js: en fácil
 * se le va bastante y en duro clava casi siempre.
 */

import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const DURACION = 60;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let bot = null, selector = null, jugando = false;
  let reloj = DURACION, marcador = [0, 0], sb = null, acabado = false;

  const tirador = [0, 1].map(() => ({
    barra: 0, dir: 1, pos: 0, vuelo: null, recarga: 0,
  }));

  const VENTANA = 0.11;      // media anchura de la zona buena, en unidades de barra

  function tirar(quien) {
    const t = tirador[quien];
    const err = Math.abs(t.barra);
    const dentro = err < VENTANA;
    t.vuelo = { t: 0, dentro, desde: t.pos };
    t.barra = 0;
    audio.tone({ freq: 500, dur: 0.06, gain: 0.12, type: 'triangle', sweep: 120 });
    if (dentro) {
      marcador[quien] += 3;
      sb?.update(marcador[0], marcador[1]);
      audio.score(quien);
      haptics.score(quien);
    } else {
      audio.tone({ freq: 200, dur: 0.1, gain: 0.1, type: 'square', sweep: -80 });
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ctx.ui.scoreboard({ center: `${DURACION} s` });
      sb.update(0, 0);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
      }, { color: players[0].color });
    },

    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (!jugando) { selector?.navegar(input.player(0)); return; }
      if (acabado) return;

      reloj -= dt;
      sb?.setCenter(`${Math.ceil(reloj)} s`);
      if (reloj <= 0) {
        acabado = true;
        const gana = marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1);
        ctx.finish({ winner: gana, scores: marcador, detail: `${marcador[0]}-${marcador[1]} puntos` });
        return;
      }

      for (const [quien, t] of tirador.entries()) {
        if (t.vuelo) {
          t.vuelo.t += dt * 1.7;
          if (t.vuelo.t >= 1) {
            if (t.vuelo.dentro) {
              particles.burst(W * (0.5 + (quien ? 0.22 : -0.22)), H * 0.28, 18, {
                speed: 190, color: players[quien].color, size: 3, drag: 0.9,
              });
            }
            t.vuelo = null;
            t.pos = (t.pos + 1) % 5;
            t.recarga = 0.28;
          }
          continue;
        }
        if (t.recarga > 0) { t.recarga -= dt; continue; }
        t.barra += t.dir * dt * 1.9;
        if (Math.abs(t.barra) > 1) { t.barra = Math.sign(t.barra); t.dir *= -1; }

        if (quien === 0) {
          if (input.player(0).pressed('a')) tirar(0);
        } else {
          // El bot "ve" la barra con retraso y error: suelta cuando cree que
          // está en el centro, que no siempre es cuando lo está.
          const visto = bot.percibir(t.barra, dt, { escalaError: 0.5 });
          if (!bot.distraido && Math.abs(visto) < VENTANA * 0.8) tirar(1);
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#1c1410');
      g.fillStyle = '#2b1f18';
      g.fillRect(0, H * 0.55, W, H * 0.45);

      particles.render(g);

      for (const [quien, t] of tirador.entries()) {
        const cx = W * (0.5 + (quien ? 0.22 : -0.22));
        // Canasta
        g.strokeStyle = '#ff7847';
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(cx - 34, H * 0.3); g.lineTo(cx + 34, H * 0.3); g.stroke();
        g.fillStyle = '#ffffff18';
        g.fillRect(cx - 44, H * 0.16, 88, H * 0.14);

        // Barra de fuerza con su ventana verde
        const bx = cx - 90, by = H * 0.72, bw = 180, bh = 20;
        g.fillStyle = '#00000066';
        g.fillRect(bx, by, bw, bh);
        g.fillStyle = '#3fc47f';
        g.fillRect(bx + bw / 2 - bw * VENTANA, by, bw * VENTANA * 2, bh);
        if (!t.vuelo && t.recarga <= 0) {
          g.fillStyle = players[quien].color;
          g.fillRect(bx + bw / 2 + t.barra * bw / 2 - 3, by - 5, 6, bh + 10);
        }

        // Balón en vuelo
        if (t.vuelo) {
          const p = t.vuelo.t;
          const x = cx + (1 - p) * (quien ? 60 : -60);
          const y = H * 0.62 - Math.sin(p * Math.PI) * H * 0.34
            - (t.vuelo.dentro ? 0 : Math.sin(p * Math.PI) * -20);
          g.fillStyle = '#ff8c42';
          g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
        }
      }

      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = 'bold 34px system-ui, sans-serif';
      g.fillText(`${marcador[0]} – ${marcador[1]}`, W / 2, H * 0.1);
      g.font = '12px system-ui, sans-serif';
      g.fillStyle = '#ffffff66';
      g.fillText('acción: soltar cuando la barra esté en verde', W / 2, H * 0.92);
    },

    destroy() { selector?.destruir(); sb?.remove(); },
  };
}
