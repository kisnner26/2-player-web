/**
 * Ruleta de Globos — infla por turnos y decide cuándo dejarlo.
 *
 * El globo aguanta una presión que nadie conoce. Cada soplido añade una
 * cantidad al azar, así que el riesgo no se calcula: se estima. Y como el
 * globo NO se reinicia al pasar el turno, todo lo que infles se lo dejas al
 * otro más cerca del límite.
 *
 * La regla que lo cierra: hay que soplar al menos una vez antes de pasar. No
 * existe la jugada cobarde de no hacer nada. Se puede soplar una y pasar, o
 * apretar a ver si revienta en la cara del contrario.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 3;
const LIMITE_MIN = 55;
const LIMITE_MAX = 125;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let presion = 0, limite = 0, turno = 0, soplidos = 0, esteTurno = 0;
  let fase = 'turno', espera = 0, t = 0, sacudida = 0;
  const puntos = [0, 0];
  let sb = null;

  function nuevaRonda(primero) {
    presion = 0;
    limite = LIMITE_MIN + rng() * (LIMITE_MAX - LIMITE_MIN);
    turno = primero;
    soplidos = 0;
    esteTurno = 0;
    fase = 'turno';
  }

  function soplar() {
    // Los soplidos crecen con el tamaño: al final cada uno es una ruleta rusa.
    const aire = 5 + rng() * (7 + presion * 0.12);
    presion += aire;
    soplidos++;
    esteTurno++;
    sacudida = 4;
    audio.tone({ freq: 200 + presion * 4, dur: 0.16, gain: 0.14, type: 'sawtooth', sweep: 60 });
    haptics.play('tap', { player: turno });
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      particles.spawn({
        x: W / 2 + Math.cos(a) * radio(), y: H * 0.44 + Math.sin(a) * radio(),
        vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
        life: 0.4, maxLife: 0.4, size: 3, color: '#ffffff44', shape: 'circle',
      });
    }
    if (presion >= limite) reventar();
  }

  function reventar() {
    fase = 'boom';
    espera = 2.1;
    puntos[1 - turno]++;
    sb.update(puntos[0], puntos[1]);
    audio.explosion();
    haptics.explosion(turno);
    ctx.shake(18);
    particles.burst(W / 2, H * 0.44, 44, {
      speed: 460, color: players[turno].color, size: 6, drag: 0.9, gravity: 260,
    });
  }

  function pasar() {
    if (esteTurno < 1) {
      audio.error();
      haptics.error(turno);
      return;
    }
    turno = 1 - turno;
    esteTurno = 0;
    audio.select();
  }

  const radio = () => Math.min(H * 0.3, 26 + presion * 1.5);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda(Math.floor(rng() * 2));
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      sacudida = Math.max(0, sacudida - dt * 18);
      particles.update(dt);

      if (fase === 'boom') {
        espera -= dt;
        if (espera <= 0) {
          const g = puntos.findIndex((v) => v >= PARA_GANAR);
          if (g >= 0) {
            ctx.finish({ winner: g, scores: puntos, detail: `el último globo aguantó ${soplidos} soplidos` });
            return;
          }
          nuevaRonda(1 - turno);
        }
        return;
      }

      const pl = input.player(turno);
      if (pl.pressed('a')) soplar();
      if (pl.pressed('b') || pl.pressed('down')) pasar();
    },

    render() {
      const g = ctx.c;
      const tension = clamp(presion / LIMITE_MAX, 0, 1.1);
      ctx.engine.clear('#0a0714');
      const col = players[turno].color;

      const halo = g.createRadialGradient(W / 2, H * 0.44, 0, W / 2, H * 0.44, H * 0.9);
      halo.addColorStop(0, `${col}18`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      for (const i of [0, 1]) {
        const activo = fase !== 'boom' && turno === i;
        dibujarPersonaje(g, personajeDe(players[i], i), W * (i === 0 ? 0.16 : 0.84), H * 0.82, activo ? 110 : 86, {
          pose: activo && sacudida > 1 ? 'salta' : 'quieto',
          acento: players[i].color,
          mirando: i === 0 ? 1 : -1,
          alpha: activo ? 1 : 0.42,
          brillo: activo ? 18 : 0,
        });
        ctx.engine.text(players[i].name, W * (i === 0 ? 0.16 : 0.84), H * 0.9,
          { size: 13, color: players[i].color, font: 'system-ui' });
      }

      if (fase !== 'boom') {
        const r = radio();
        const sx = sacudida ? (rng() - 0.5) * sacudida : 0;
        const bx = W / 2 + sx, by = H * 0.44;
        // El globo se estira un poco al inflarse: se nota que está al límite.
        g.save();
        g.translate(bx, by);
        g.scale(1, 1.12 + tension * 0.1);
        g.shadowColor = col;
        g.shadowBlur = 20 + tension * 30;
        g.fillStyle = col;
        g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
        g.restore();
        g.fillStyle = '#ffffff44';
        g.beginPath(); g.arc(bx - r * 0.3, by - r * 0.34, r * 0.16, 0, TAU); g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(bx - 7, by + r * 1.1);
        g.lineTo(bx + 7, by + r * 1.1);
        g.lineTo(bx, by + r * 1.1 + 16);
        g.fill();

        ctx.engine.text(String(Math.round(presion)), bx, by, {
          size: Math.max(20, r * 0.42), color: '#0d0a16',
        });
        ctx.engine.text(`${soplidos} soplidos`, W / 2, H * 0.13, { size: 13, color: '#8f8fb0', font: 'system-ui' });
        ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, W / 2, H * 0.07,
          { size: 18, color: col, glow: 10 });
        ctx.engine.text(esteTurno === 0 ? 'sopla al menos una vez' : 'sopla otra vez o pasa',
          W / 2, H * 0.72, { size: 13, color: esteTurno === 0 ? '#ffd166' : '#7a7a98', font: 'system-ui' });
      } else {
        ctx.engine.text('¡PLAF!', W / 2, H * 0.42, { size: 52, color: '#ffd166', glow: 30 });
        ctx.engine.text(`aguantaba ${Math.round(limite)}`, W / 2, H * 0.53,
          { size: 15, color: '#8f8fb0', font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text('Tu tecla sopla · la especial pasa el turno · el globo NO se vacía entre turnos',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
