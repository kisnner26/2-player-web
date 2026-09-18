/**
 * Tenis — un set contra la máquina.
 *
 * Vista cenital de una pista: tú abajo, el bot arriba. La pelota lleva altura
 * simulada aunque se dibuje en dos dimensiones, y esa altura es la regla del
 * juego: solo puedes golpear cuando la pelota está lo bastante baja, así que
 * el tenis no va de llegar, va de llegar A TIEMPO.
 *
 * El bot no persigue la pelota: persigue DONDE VA A BOTAR, calculado con la
 * misma física que la mueve. Un bot que persigue la posición actual siempre
 * llega tarde y se le nota el truco enseguida.
 */

import { crearBot, selectorDificultad } from '../../core/bot.js';
import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const PUNTOS = ['0', '15', '30', '40'];
const JUEGOS_PARA_GANAR = 4;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const pista = () => ({ x0: W * 0.16, x1: W * 0.84, y0: H * 0.1, y1: H * 0.9 });

  let bot = null;
  let selector = null;
  let jugando = false;

  const raqueta = [
    { x: 0, y: 0, w: 78, vel: 620 },      // humano, abajo
    { x: 0, y: 0, w: 78, vel: 620 },      // bot, arriba
  ];
  const pelota = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, viva: false, ultimo: 0, botes: 0 };

  let puntos = [0, 0];
  let juegos = [0, 0];
  let saca = 0;
  let aviso = '';
  let avisoT = 0;
  let sb = null;
  let esperaSaque = 0;

  const decir = (t, s = 1.8) => { aviso = t; avisoT = s; };

  function colocar() {
    const p = pista();
    raqueta[0].y = p.y1 - 26;
    raqueta[1].y = p.y0 + 26;
    raqueta[0].x = raqueta[1].x = (p.x0 + p.x1) / 2;
  }

  function sacar() {
    const p = pista();
    const desde = saca;
    pelota.x = raqueta[desde].x;
    pelota.y = raqueta[desde].y + (desde === 0 ? -20 : 20);
    pelota.z = 34;
    pelota.vz = 40;
    pelota.vx = (ctx.rng() - 0.5) * 120;
    pelota.vy = desde === 0 ? -430 : 430;
    pelota.viva = true;
    pelota.ultimo = desde;
    pelota.botes = 0;
    bot?.reiniciar();
    audio.tone({ freq: 620, dur: 0.06, gain: 0.14 });
  }

  /** Dónde botará la pelota, con la misma física que la mueve. */
  function prediccion() {
    let { x, y, z, vx, vy, vz } = pelota;
    for (let i = 0; i < 240 && z > 0; i++) {
      const h = 1 / 120;
      vz -= 240 * h;
      x += vx * h; y += vy * h; z += vz * h;
    }
    return { x, y };
  }

  function golpear(quien) {
    const dir = quien === 0 ? -1 : 1;
    const r = raqueta[quien];
    // El punto de la raqueta donde pega decide el ángulo: golpear con la punta
    // abre la bola. Es lo que convierte el peloteo en algo con intención.
    const desvio = clamp((pelota.x - r.x) / (r.w / 2), -1, 1);
    pelota.vx = desvio * 340 + (ctx.rng() - 0.5) * 40;
    pelota.vy = dir * (400 + Math.abs(desvio) * 60);
    pelota.vz = 34 + ctx.rng() * 10;
    pelota.z = Math.max(pelota.z, 6);
    pelota.ultimo = quien;
    pelota.botes = 0;
    audio.tone({ freq: 300 + Math.abs(desvio) * 200, dur: 0.05, gain: 0.16, type: 'triangle' });
    haptics.impact(quien, 0.5);
    particles.burst(pelota.x, pelota.y, 8, { speed: 120, color: players[quien].color, size: 3, drag: 0.9 });
  }

  function punto(para) {
    puntos[para]++;
    pelota.viva = false;
    esperaSaque = 1.1;
    audio.score(para);
    haptics.score(para);

    // Marcador de tenis de verdad: 40-40 es deuce y hay que ganar de dos.
    const a = puntos[para], b = puntos[1 - para];
    if (a >= 4 && a - b >= 2) {
      juegos[para]++;
      puntos = [0, 0];
      saca = 1 - saca;
      decir(juegos[para] >= JUEGOS_PARA_GANAR ? '¡Set!' : `Juego para ${players[para].name}`, 2.2);
      if (juegos[para] >= JUEGOS_PARA_GANAR) {
        setTimeout(() => ctx.finish({
          winner: para, scores: juegos,
          detail: `${juegos[0]}-${juegos[1]} en juegos`,
        }), 1200);
        return;
      }
    } else {
      decir(para === 0 ? 'Punto tuyo' : 'Punto de la máquina');
    }
    sb?.update(juegos[0], juegos[1]);
  }

  const marcadorTexto = () => {
    if (puntos[0] >= 3 && puntos[1] >= 3) {
      if (puntos[0] === puntos[1]) return 'Iguales';
      return `Ventaja ${players[puntos[0] > puntos[1] ? 0 : 1].name}`;
    }
    return `${PUNTOS[Math.min(3, puntos[0])]} – ${PUNTOS[Math.min(3, puntos[1])]}`;
  };

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ctx.ui.scoreboard({ center: 'Tenis' });
      sb.update(0, 0);
      selector = selectorDificultad(ctx.frame, (id) => {
        bot = crearBot({ dificultad: id, rng: ctx.rng });
        jugando = true;
        esperaSaque = 0.8;
        decir(`Dificultad: ${bot.nombre}`, 2);
      }, { color: players[0].color });
    },

    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      if (!jugando) { selector?.navegar(input.player(0)); return; }

      const p = pista();
      const yo = input.player(0);

      // --- Raqueta humana ---
      const mov = (yo.held('right') ? 1 : 0) - (yo.held('left') ? 1 : 0);
      raqueta[0].x = clamp(raqueta[0].x + mov * raqueta[0].vel * dt, p.x0 + 20, p.x1 - 20);

      // --- Raqueta del bot ---
      if (pelota.viva && pelota.vy < 0) {
        // La pelota va hacia el bot: persigue donde va a botar, no dónde está.
        const meta = prediccion();
        const objetivo = bot.percibir(meta.x, dt, { escalaError: (p.x1 - p.x0) * 0.5 });
        const dir = bot.mover(raqueta[1].x, objetivo, { zonaMuerta: 8 });
        raqueta[1].x = clamp(raqueta[1].x + dir * raqueta[1].vel * dt, p.x0 + 20, p.x1 - 20);
      } else {
        // Entre puntos vuelve al centro, como haría cualquiera.
        const dir = bot.mover(raqueta[1].x, (p.x0 + p.x1) / 2, { zonaMuerta: 14 });
        raqueta[1].x = clamp(raqueta[1].x + dir * raqueta[1].vel * 0.6 * dt, p.x0 + 20, p.x1 - 20);
      }

      if (esperaSaque > 0) {
        esperaSaque -= dt;
        if (esperaSaque <= 0) sacar();
        particles.update(dt);
        return;
      }
      if (!pelota.viva) { particles.update(dt); return; }

      // --- Pelota ---
      pelota.vz -= 240 * dt;
      pelota.x += pelota.vx * dt;
      pelota.y += pelota.vy * dt;
      pelota.z += pelota.vz * dt;

      if (pelota.x < p.x0 || pelota.x > p.x1) {
        pelota.vx *= -1;
        pelota.x = clamp(pelota.x, p.x0, p.x1);
        audio.tone({ freq: 200, dur: 0.04, gain: 0.06 });
      }

      if (pelota.z <= 0) {
        pelota.z = 0;
        pelota.botes++;
        if (pelota.botes >= 2) { punto(pelota.ultimo); return; }
        pelota.vz = Math.abs(pelota.vz) * 0.62;
        audio.tone({ freq: 150, dur: 0.05, gain: 0.09, type: 'sine' });
        particles.burst(pelota.x, pelota.y, 5, { speed: 70, color: '#ffffff', size: 2, drag: 0.88 });
      }

      // --- Golpes ---
      // Solo se puede golpear con la pelota baja: es la regla que da el ritmo.
      const alcanzable = pelota.z < 40;
      for (const quien of [0, 1]) {
        const r = raqueta[quien];
        const cerca = Math.abs(pelota.y - r.y) < 30 && Math.abs(pelota.x - r.x) < r.w / 2 + 12;
        const viene = quien === 0 ? pelota.vy > 0 : pelota.vy < 0;
        if (!alcanzable || !cerca || !viene) continue;

        if (quien === 0) {
          if (yo.pressed('a') || yo.held('a')) golpear(0);
        } else if (!bot.distraido) {
          golpear(1);
        }
      }

      // Fuera de pista por el fondo: punto para quien golpeó el último.
      if (pelota.y < p.y0 - 40) { punto(0); return; }
      if (pelota.y > p.y1 + 40) { punto(1); return; }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      const p = pista();
      ctx.engine.clear('#123a24');

      // Pista
      g.fillStyle = '#1d6b41';
      g.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      g.strokeStyle = '#ffffffcc';
      g.lineWidth = 3;
      g.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      g.beginPath();
      g.moveTo(p.x0, (p.y0 + p.y1) / 2);
      g.lineTo(p.x1, (p.y0 + p.y1) / 2);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = '#ffffff66';
      g.beginPath();
      g.moveTo((p.x0 + p.x1) / 2, p.y0 + 60);
      g.lineTo((p.x0 + p.x1) / 2, p.y1 - 60);
      g.stroke();

      particles.render(g);

      // Sombra de la pelota: sin ella no hay forma de saber la altura.
      if (pelota.viva) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(pelota.x, pelota.y, 7, 4, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = pelota.z < 40 ? '#eaff5a' : '#c8e04a';
        g.beginPath();
        g.arc(pelota.x, pelota.y - pelota.z, 7, 0, Math.PI * 2);
        g.fill();
      }

      // Raquetas
      for (const quien of [0, 1]) {
        const r = raqueta[quien];
        g.fillStyle = players[quien].color;
        g.fillRect(r.x - r.w / 2, r.y - 6, r.w, 12);
      }

      // Marcador de tenis
      g.fillStyle = '#ffffff';
      g.font = 'bold 22px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(marcadorTexto(), W / 2, p.y0 - 16);
      if (avisoT > 0) {
        g.font = '16px system-ui, sans-serif';
        g.fillStyle = '#ffffffcc';
        g.fillText(aviso, W / 2, H / 2 - 10);
      }
    },

    destroy() { selector?.destruir(); sb?.remove(); },
  };
}
