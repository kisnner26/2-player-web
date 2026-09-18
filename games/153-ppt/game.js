/**
 * Piedra-Papel-Tijera Turbo — rondas de un segundo, sin tiempo para pensar.
 *
 * El azar del piedra-papel-tijera clásico desaparece cuando se juegan treinta
 * rondas seguidas a toda velocidad: lo que queda es un pulso de patrones. Se
 * empieza eligiendo, se acaba reaccionando a lo que el otro repite.
 *
 * Y hay una vuelta de tuerca: la mano que ganas se te BLOQUEA la ronda
 * siguiente. Ganar con tijera es estupendo hasta que descubres que el próximo
 * segundo tienes que salir con una de las otras dos y él lo sabe.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 8;
const RONDA = 1.15;
const MANOS = [
  { id: 'piedra', nombre: 'Piedra', glifo: '✊', accion: 'left', color: '#ff8c42' },
  { id: 'papel', nombre: 'Papel', glifo: '✋', accion: 'up', color: '#3aa0ff' },
  { id: 'tijera', nombre: 'Tijera', glifo: '✌', accion: 'right', color: '#a8ff3e' },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [crear(0), crear(1)];
  let fase = 'eligiendo', reloj = RONDA, espera = 0, t = 0, ronda = 1;
  let resultado = '', ganadorRonda = -2;
  let sb = null;

  function crear(i) {
    return { i, mano: -1, bloqueada: -1, puntos: 0, historial: [] };
  }

  /** 0 empate · 1 gana a · -1 gana b */
  function comparar(a, b) {
    if (a === b) return 0;
    return (a + 1) % 3 === b ? -1 : 1;
  }

  function resolver() {
    const [a, b] = jug;
    fase = 'mostrando';
    espera = 0.95;
    ronda++;

    // Quedarse sin elegir es perder la ronda: no hay refugio en la pasividad.
    if (a.mano < 0 && b.mano < 0) {
      resultado = 'Los dos se quedan quietos';
      ganadorRonda = -1;
    } else if (a.mano < 0 || b.mano < 0) {
      const g = a.mano < 0 ? 1 : 0;
      jug[g].puntos++;
      ganadorRonda = g;
      resultado = `${players[1 - g].name} no saca mano`;
    } else {
      const r = comparar(a.mano, b.mano);
      if (r === 0) { resultado = `Empate a ${MANOS[a.mano].nombre.toLowerCase()}`; ganadorRonda = -1; }
      else {
        const g = r > 0 ? 0 : 1;
        jug[g].puntos++;
        ganadorRonda = g;
        resultado = `${MANOS[jug[g].mano].nombre} gana a ${MANOS[jug[1 - g].mano].nombre.toLowerCase()}`;
        particles.burst(W / 2, H * 0.42, 22, { speed: 250, color: players[g].color, size: 4, drag: 0.9 });
      }
    }

    for (const p of jug) {
      if (p.mano >= 0) p.historial.push(p.mano);
      if (p.historial.length > 8) p.historial.shift();
      // La mano ganadora se bloquea la ronda siguiente.
      p.bloqueada = (ganadorRonda === p.i && p.mano >= 0) ? p.mano : -1;
    }

    if (ganadorRonda >= 0) { audio.score(ganadorRonda); haptics.score(ganadorRonda); }
    else { audio.back(); }
    sb.update(jug[0].puntos, jug[1].puntos);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);

      if (fase === 'mostrando') {
        espera -= dt;
        if (espera <= 0) {
          const g = jug.find((p) => p.puntos >= PARA_GANAR);
          if (g) {
            ctx.finish({
              winner: g.i, scores: [jug[0].puntos, jug[1].puntos],
              detail: `${ronda - 1} rondas en un pulso`,
            });
            return;
          }
          for (const p of jug) p.mano = -1;
          resultado = '';
          ganadorRonda = -2;
          fase = 'eligiendo';
          reloj = RONDA;
        }
        return;
      }

      const antes = Math.ceil(reloj * 2);
      reloj -= dt;
      if (Math.ceil(reloj * 2) !== antes) audio.tick();

      for (const p of jug) {
        const pl = input.player(p.i);
        MANOS.forEach((m, k) => {
          if (!pl.pressed(m.accion)) return;
          if (k === p.bloqueada) {
            audio.error();
            haptics.error(p.i);
            return;
          }
          if (p.mano !== k) { audio.blip(); haptics.click(p.i); }
          p.mano = k;
        });
      }

      if (reloj <= 0) resolver();
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#08070f');

      // Reloj de la ronda como barra central que se vacía.
      const bw = W * 0.5;
      g.fillStyle = '#1a1a2c';
      g.fillRect(W / 2 - bw / 2, H * 0.14, bw, 8);
      const p = fase === 'eligiendo' ? clamp(reloj / RONDA, 0, 1) : 0;
      g.fillStyle = p < 0.3 ? '#ff4757' : '#ffd166';
      g.fillRect(W / 2 - bw / 2, H * 0.14, bw * p, 8);
      ctx.engine.text(`ronda ${ronda}`, W / 2, H * 0.09, { size: 13, color: '#8f8fb0', font: 'system-ui' });

      for (const j of jug) {
        const lado = j.i === 0 ? -1 : 1;
        const cx = W / 2 + lado * W * 0.26;
        const col = players[j.i].color;

        // Las tres manos, con la bloqueada tachada.
        MANOS.forEach((m, k) => {
          const y = H * 0.34 + k * H * 0.14;
          const elegida = j.mano === k;
          const bloqueada = j.bloqueada === k;
          const visible = fase === 'mostrando' || elegida;
          g.save();
          g.globalAlpha = bloqueada ? 0.25 : elegida ? 1 : 0.42;
          g.fillStyle = elegida ? `${m.color}33` : '#15152a';
          g.beginPath(); g.roundRect(cx - 78, y - 30, 156, 60, 12); g.fill();
          g.strokeStyle = elegida ? m.color : '#2a2a44';
          g.lineWidth = elegida ? 3 : 1.5;
          g.beginPath(); g.roundRect(cx - 78, y - 30, 156, 60, 12); g.stroke();
          ctx.engine.text(m.glifo, cx - 44, y, { size: 28, color: m.color, font: 'system-ui' });
          ctx.engine.text(m.nombre, cx + 18, y, { size: 14, color: elegida ? '#f2f2ff' : '#8f8fb0', font: 'system-ui' });
          if (bloqueada) {
            g.strokeStyle = '#ff4757';
            g.lineWidth = 3;
            g.beginPath(); g.moveTo(cx - 74, y - 26); g.lineTo(cx + 74, y + 26); g.stroke();
          }
          g.restore();
          if (visible && elegida && fase === 'mostrando' && ganadorRonda === j.i) {
            ctx.engine.glowCircle(cx, y, 40 + Math.sin(t * 12) * 4, m.color, 26);
          }
        });

        ctx.engine.text(`${players[j.i].name} · ${j.puntos}`, cx, H * 0.26,
          { size: 15, color: col, font: 'system-ui' });
        if (j.mano < 0 && fase === 'eligiendo') {
          ctx.engine.text('sin mano', cx, H * 0.78, { size: 12, color: '#ff475788', font: 'system-ui' });
        }
        // Historial: leerle el patrón al otro es media partida.
        const hist = j.historial.slice(-6);
        hist.forEach((m, k) => {
          ctx.engine.text(MANOS[m].glifo, cx - (hist.length - 1) * 12 + k * 24, H * 0.84,
            { size: 15, color: `${MANOS[m].color}88`, font: 'system-ui' });
        });
      }

      if (fase === 'mostrando') {
        ctx.engine.text(resultado, W / 2, H * 0.5,
          { size: 18, color: ganadorRonda >= 0 ? players[ganadorRonda].color : '#8f8fb0', glow: 10 });
      }

      particles.render(g);
      ctx.engine.text('← piedra · ↑ papel · → tijera · la mano con la que ganas se bloquea la ronda siguiente',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
