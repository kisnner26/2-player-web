/**
 * Esgrima — a cinco tocados contra la máquina.
 *
 * Una línea, dos tiradores y una sola pregunta: ¿avanzo o espero? La estocada
 * es rapidísima pero deja el brazo estirado un instante, y ese instante es la
 * ventana del otro. Parar bien devuelve la iniciativa: quien para, contraataca
 * gratis.
 *
 * La distancia lo es todo. Fuera de alcance no pasa nada nunca, así que el
 * juego entero ocurre en los cincuenta píxeles donde ambos llegan.
 */

import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const TOCADOS = 5;
const ALCANCE = 132;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let bot = null, selector = null, jugando = false;

  const tirador = (x) => ({
    x, estocada: 0, recobro: 0, para: 0, intencion: 0, avanza: 0,
  });
  let t = [tirador(0), tirador(0)];
  let marcador = [0, 0];
  let pausa = 0;
  let sb = null;
  let mensaje = '', mensajeT = 0;

  const decir = (m, s = 1.5) => { mensaje = m; mensajeT = s; };
  const linea = () => ({ x0: W * 0.12, x1: W * 0.88 });

  function colocar() {
    t = [tirador(W * 0.34), tirador(W * 0.66)];
    pausa = 0.9;
    bot?.reiniciar();
  }

  function tocado(quien) {
    marcador[quien]++;
    sb?.update(marcador[0], marcador[1]);
    audio.score(quien);
    haptics.score(quien);
    ctx.shake(9);
    particles.burst(t[1 - quien].x, H * 0.55, 20, {
      speed: 240, color: players[quien].color, size: 4, drag: 0.9,
    });
    decir(quien === 0 ? '¡Tocado!' : 'Te ha tocado', 1.6);
    if (marcador[quien] >= TOCADOS) {
      setTimeout(() => ctx.finish({
        winner: quien, scores: marcador, detail: `${marcador[0]}-${marcador[1]} a cinco tocados`,
      }), 900);
      pausa = 99;
      return;
    }
    colocar();
  }

  function estocar(quien) {
    const a = t[quien];
    if (a.estocada > 0 || a.recobro > 0 || a.para > 0) return;
    a.estocada = 0.2;
    a.recobro = 0.36;      // el brazo estirado: aquí estás vendido
    audio.tone({ freq: 1100, dur: 0.05, gain: 0.1, type: 'sawtooth', sweep: -500 });
  }

  function parar(quien) {
    const a = t[quien];
    if (a.para > 0 || a.recobro > 0 || a.estocada > 0) return;
    a.para = 0.22;
    audio.tone({ freq: 420, dur: 0.05, gain: 0.08 });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ctx.ui.scoreboard({ center: `A ${TOCADOS} tocados` });
      sb.update(0, 0);
      colocar();
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        colocar();
      }, { color: players[0].color });
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      if (mensajeT > 0) mensajeT -= dt;
      if (!jugando) { selector?.navegar(input.player(0)); return; }
      if (pausa > 0) { pausa -= dt; particles.update(dt); return; }

      const L = linea();
      const yo = input.player(0);
      for (const a of t) {
        if (a.estocada > 0) a.estocada -= dt;
        if (a.recobro > 0) a.recobro -= dt;
        if (a.para > 0) a.para -= dt;
      }

      // --- Humano ---
      const libre = t[0].estocada <= 0 && t[0].recobro <= 0;
      const mov = (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0);
      if (libre) t[0].x = clamp(t[0].x + mov * 260 * dt, L.x0, t[1].x - 46);
      if (yo.pressed('a')) estocar(0);
      if (yo.pressed('b')) parar(0);

      // --- Bot ---
      const dist = t[1].x - t[0].x;
      const b = t[1];
      if (b.estocada <= 0 && b.recobro <= 0) {
        // Distancia deseada: justo fuera de tu alcance, para entrar y salir.
        const quiere = bot.percibir(ALCANCE * 1.05, dt, { escalaError: 40 });
        const dir = bot.mover(dist, quiere, { zonaMuerta: 10 });
        // Ojo al signo: acercarse es mover el bot hacia −x.
        b.x = clamp(b.x + dir * 240 * dt, t[0].x + 46, L.x1);

        if (t[0].recobro > 0 && dist < ALCANCE && bot.decide(3.5 * dt)) {
          estocar(1);                        // castigo: has fallado y estás vendido
        } else if (t[0].estocada > 0 && dist < ALCANCE * 1.1 && bot.decide(2.2 * dt)) {
          parar(1);                          // te ve venir y para
        } else if (dist < ALCANCE * 0.95 && bot.decide(1.1 * dt)) {
          estocar(1);
        }
      }

      // --- Resolución ---
      for (const quien of [0, 1]) {
        const a = t[quien], d = t[1 - quien];
        if (a.estocada <= 0 || a.estocada > dt * 1.6) continue;   // solo al extenderse del todo
        if (dist > ALCANCE) continue;                              // fuera de alcance: nada
        if (d.para > 0) {
          // Parada: el que para gana la iniciativa y el otro queda expuesto.
          decir(quien === 0 ? 'Parada de la máquina' : '¡Parada!');
          audio.tone({ freq: 1600, dur: 0.07, gain: 0.13, type: 'square', sweep: -700 });
          a.recobro = Math.max(a.recobro, 0.5);
          d.para = 0;
          continue;
        }
        tocado(quien);
        return;
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      const L = linea();
      ctx.engine.clear('#0e1016');

      // Pista de esgrima
      g.fillStyle = '#1b2030';
      g.fillRect(L.x0, H * 0.48, L.x1 - L.x0, 16);
      g.strokeStyle = '#ffffff30';
      g.lineWidth = 2;
      for (const f of [0.25, 0.5, 0.75]) {
        const x = L.x0 + (L.x1 - L.x0) * f;
        g.beginPath(); g.moveTo(x, H * 0.44); g.lineTo(x, H * 0.52); g.stroke();
      }

      particles.render(g);

      for (const quien of [0, 1]) {
        const a = t[quien];
        const dir = quien === 0 ? 1 : -1;
        const y = H * 0.48;
        g.save();
        g.translate(a.x, y);
        g.globalAlpha = a.recobro > 0 ? 0.62 : 1;
        g.fillStyle = players[quien].color;
        g.fillRect(-13, -54, 26, 54);
        // Florete: se estira con la estocada.
        const largo = a.estocada > 0 ? ALCANCE : 52;
        g.strokeStyle = a.para > 0 ? '#ffffff' : '#d7dce6';
        g.lineWidth = a.para > 0 ? 6 : 3;
        g.beginPath();
        g.moveTo(dir * 13, -34);
        g.lineTo(dir * (13 + largo), -34);
        g.stroke();
        g.restore();
      }

      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.font = 'bold 30px system-ui, sans-serif';
      g.fillText(`${marcador[0]} – ${marcador[1]}`, W / 2, H * 0.2);
      if (mensajeT > 0) {
        g.font = '18px system-ui, sans-serif';
        g.fillStyle = '#ffffffcc';
        g.fillText(mensaje, W / 2, H * 0.3);
      }
      g.font = '12px system-ui, sans-serif';
      g.fillStyle = '#ffffff55';
      g.fillText('← → distancia · acción estocada · especial parada', W / 2, H * 0.9);
    },

    destroy() { selector?.destruir(); sb?.remove(); },
  };
}
