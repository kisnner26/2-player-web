/**
 * Penaltis — cinco tiros y cinco paradas contra la máquina.
 *
 * Alternas rol: tiras y paras. Los dos roles usan la MISMA mecánica —una mira
 * que barre la portería y se para al pulsar— así que aprender a tirar te
 * enseña a parar. Es la razón de que enganche: cada tanda mejora las dos
 * mitades a la vez.
 *
 * El portero humano no ve dónde va a tirar el bot; el bot tampoco ve tu
 * intención. Los dos eligen a ciegas y se resuelve por distancia, que es
 * exactamente lo que pasa en un penalti de verdad.
 */

import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true, turnos: true };

const TANDAS = 5;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let bot = null, selector = null, jugando = false;

  let tanda = 1;
  let fase = 'tiro';        // tiro (tú tiras) | parada (tú paras)
  let marcador = [0, 0];
  let mira = 0, dirMira = 1;
  let sb = null, pausa = 0, mensaje = '', mensajeT = 0;
  let tiro = null;          // { x, y, t }
  let guante = null;

  const porteria = () => ({ x0: W * 0.2, x1: W * 0.8, y0: H * 0.24, y1: H * 0.62 });
  const decir = (m, s = 1.8) => { mensaje = m; mensajeT = s; };

  function siguiente() {
    tiro = null; guante = null; mira = 0; dirMira = 1;
    bot?.reiniciar();
    if (fase === 'tiro') { fase = 'parada'; decir('Ahora paras tú', 1.6); }
    else {
      fase = 'tiro';
      tanda++;
      if (tanda > TANDAS) {
        const gana = marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1);
        ctx.finish({ winner: gana, scores: marcador, detail: `${marcador[0]}-${marcador[1]} en ${TANDAS} tandas` });
        pausa = 99;
        return;
      }
      sb?.setCenter(`Tanda ${tanda}/${TANDAS}`);
      decir(`Tanda ${tanda}`, 1.6);
    }
    pausa = 0.9;
  }

  function resolver() {
    const p = porteria();
    const ancho = p.x1 - p.x0;
    const acierto = Math.hypot(tiro.x - guante.x, tiro.y - guante.y) > ancho * 0.16;
    const quienTira = fase === 'tiro' ? 0 : 1;

    if (acierto) {
      marcador[quienTira]++;
      audio.score(quienTira);
      haptics.score(quienTira);
      decir(quienTira === 0 ? '¡GOL!' : 'Gol de la máquina', 1.8);
      particles.burst(tiro.x, tiro.y, 26, { speed: 260, color: players[quienTira].color, size: 4, drag: 0.9 });
    } else {
      audio.error();
      haptics.error(1 - quienTira);
      decir('¡Parada!', 1.8);
      ctx.shake(9);
    }
    sb?.update(marcador[0], marcador[1]);
    pausa = 1.5;
    setTimeout(siguiente, 1500);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ctx.ui.scoreboard({ center: `Tanda 1/${TANDAS}` });
      sb.update(0, 0);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        decir('Tú tiras', 1.6);
      }, { color: players[0].color });
    },

    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (mensajeT > 0) mensajeT -= dt;
      if (!jugando) { selector?.navegar(input.player(0)); return; }
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }
      if (tiro && guante) { particles.update(dt); return; }

      const p = porteria();
      const yo = input.player(0);

      // Mira que barre la portería en zigzag. Es el reloj del juego.
      mira += dirMira * dt * 1.5;
      if (mira > 1) { mira = 1; dirMira = -1; }
      if (mira < -1) { mira = -1; dirMira = 1; }

      const puntoMira = {
        x: (p.x0 + p.x1) / 2 + mira * (p.x1 - p.x0) * 0.42,
        y: (p.y0 + p.y1) / 2 + Math.sin(mira * 2.1) * (p.y1 - p.y0) * 0.3,
      };

      if (fase === 'tiro') {
        if (yo.pressed('a')) {
          tiro = { ...puntoMira };
          // El bot elige a ciegas: un lado con su error encima.
          const lado = bot.decide(0.5) ? 1 : -1;
          const err = bot.percibir(lado, dt, { escalaError: 1.1 });
          guante = {
            x: (p.x0 + p.x1) / 2 + clamp(err, -1, 1) * (p.x1 - p.x0) * 0.4,
            y: (p.y0 + p.y1) / 2 + (ctx.rng() - 0.5) * (p.y1 - p.y0) * 0.5,
          };
          audio.tone({ freq: 420, dur: 0.08, gain: 0.18, type: 'triangle', sweep: -160 });
          resolver();
        }
      } else {
        if (yo.pressed('a')) {
          guante = { ...puntoMira };
          const lado = bot.decide(0.5) ? 1 : -1;
          const err = bot.percibir(lado, dt, { escalaError: 1.1 });
          tiro = {
            x: (p.x0 + p.x1) / 2 + clamp(err, -1, 1) * (p.x1 - p.x0) * 0.42,
            y: (p.y0 + p.y1) / 2 + (ctx.rng() - 0.5) * (p.y1 - p.y0) * 0.55,
          };
          audio.tone({ freq: 320, dur: 0.08, gain: 0.16, type: 'triangle' });
          resolver();
        }
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      const p = porteria();
      ctx.engine.clear('#123f22');

      g.fillStyle = '#1a5c31';
      g.fillRect(0, H * 0.6, W, H * 0.4);

      // Portería y red
      g.strokeStyle = '#ffffff';
      g.lineWidth = 7;
      g.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 1;
      for (let i = 1; i < 12; i++) {
        const x = p.x0 + ((p.x1 - p.x0) * i) / 12;
        g.beginPath(); g.moveTo(x, p.y0); g.lineTo(x, p.y1); g.stroke();
      }
      for (let i = 1; i < 7; i++) {
        const y = p.y0 + ((p.y1 - p.y0) * i) / 7;
        g.beginPath(); g.moveTo(p.x0, y); g.lineTo(p.x1, y); g.stroke();
      }

      particles.render(g);

      // Mira
      if (!tiro && pausa <= 0) {
        const mx = (p.x0 + p.x1) / 2 + mira * (p.x1 - p.x0) * 0.42;
        const my = (p.y0 + p.y1) / 2 + Math.sin(mira * 2.1) * (p.y1 - p.y0) * 0.3;
        g.strokeStyle = players[0].color;
        g.lineWidth = 3;
        g.beginPath(); g.arc(mx, my, 20, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(mx - 28, my); g.lineTo(mx + 28, my);
        g.moveTo(mx, my - 28); g.lineTo(mx, my + 28); g.stroke();
      }

      if (tiro) {
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(tiro.x, tiro.y, 12, 0, Math.PI * 2); g.fill();
      }
      if (guante) {
        g.fillStyle = players[fase === 'tiro' ? 1 : 0].color;
        g.beginPath(); g.arc(guante.x, guante.y, 26, 0, Math.PI * 2); g.fill();
      }

      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = 'bold 24px system-ui, sans-serif';
      g.fillText(fase === 'tiro' ? 'TIRAS' : 'PARAS', W / 2, H * 0.14);
      if (mensajeT > 0) {
        g.font = 'bold 30px system-ui, sans-serif';
        g.fillText(mensaje, W / 2, H * 0.78);
      }
      g.font = '12px system-ui, sans-serif';
      g.fillStyle = '#ffffff66';
      g.fillText('acción: fijar la mira', W / 2, H * 0.93);
    },

    destroy() { selector?.destruir(); sb?.remove(); },
  };
}
