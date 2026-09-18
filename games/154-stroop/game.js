/**
 * Caza el Color — leer y ver dicen cosas distintas, y solo una vale.
 *
 * Es el efecto Stroop puesto a duelo: sale la palabra ROJO pintada de azul y
 * hay que pulsar solo si el nombre y la tinta coinciden. Leer es automático y
 * mirar el color no lo es, así que el cerebro contesta antes que tú.
 *
 * Adelantarse cuesta caro: una pulsación de más resta y te bloquea. Como los
 * dos veis lo mismo a la vez, se convierte en un pulso de nervios — el que
 * primero se fía de su ojo se lleva el punto, y el que primero se fía de su
 * lectura se lleva el castigo.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 10;
const CASTIGO = 1.4;
const COLORES = [
  { nombre: 'ROJO', hex: '#ff4757' },
  { nombre: 'AZUL', hex: '#3aa0ff' },
  { nombre: 'VERDE', hex: '#a8ff3e' },
  { nombre: 'AMARILLO', hex: '#ffd166' },
  { nombre: 'MORADO', hex: '#b04cff' },
  { nombre: 'ROSA', hex: '#ff2e88' },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let palabra = 0, tinta = 0, coincide = false;
  let fase = 'espera', reloj = 1, t = 0, mensaje = '', resaltado = -1;
  const jug = [{ i: 0, puntos: 0, hielo: 0, fallos: 0 }, { i: 1, puntos: 0, hielo: 0, fallos: 0 }];
  let sb = null, aparicion = 0;

  function nuevaCarta() {
    palabra = Math.floor(rng() * COLORES.length);
    // Casi la mitad coinciden: si fueran raras, no habría dilema.
    coincide = rng() < 0.42;
    tinta = coincide ? palabra : (palabra + 1 + Math.floor(rng() * (COLORES.length - 1))) % COLORES.length;
    fase = 'carta';
    // La carta dura menos según avanza la partida.
    reloj = clamp(2.1 - (jug[0].puntos + jug[1].puntos) * 0.06, 0.85, 2.1);
    aparicion = 0;
    resaltado = -1;
    audio.blip();
  }

  function acertar(p) {
    p.puntos++;
    resaltado = p.i;
    mensaje = `¡${players[p.i].name}!`;
    audio.score(p.i);
    haptics.score(p.i);
    particles.burst(W / 2, H * 0.45, 22, { speed: 250, color: COLORES[tinta].hex, size: 4, drag: 0.9 });
    sb.update(jug[0].puntos, jug[1].puntos);
    fase = 'resuelta';
    reloj = 0.8;
  }

  function fallar(p, motivo) {
    p.hielo = CASTIGO;
    p.fallos++;
    p.puntos = Math.max(0, p.puntos - 1);
    mensaje = motivo;
    audio.error();
    haptics.error(p.i);
    ctx.shake(5);
    sb.update(jug[0].puntos, jug[1].puntos);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      fase = 'espera';
      reloj = 1.2;
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      aparicion += dt;
      particles.update(dt);
      for (const p of jug) if (p.hielo > 0) p.hielo -= dt;

      if (fase === 'espera' || fase === 'resuelta') {
        reloj -= dt;
        if (reloj <= 0) {
          const g = jug.find((p) => p.puntos >= PARA_GANAR);
          if (g) {
            ctx.finish({
              winner: g.i, scores: [jug[0].puntos, jug[1].puntos],
              detail: `${jug[0].fallos} y ${jug[1].fallos} pulsaciones de más`,
            });
            return;
          }
          mensaje = '';
          nuevaCarta();
        }
        return;
      }

      for (const p of jug) {
        if (p.hielo > 0) continue;
        if (!input.player(p.i).pressed('a')) continue;
        if (coincide) { acertar(p); return; }
        fallar(p, `${players[p.i].name} pulsa de más`);
      }

      reloj -= dt;
      if (reloj <= 0) {
        // Dejar pasar una que coincidía castiga a los dos: no vale esconderse.
        if (coincide) {
          mensaje = 'Se escapó una buena';
          audio.tone({ freq: 200, dur: 0.2, gain: 0.16, type: 'sawtooth', sweep: -60 });
        } else {
          mensaje = 'Bien dejada';
        }
        fase = 'resuelta';
        reloj = 0.6;
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#07070e');

      if (fase === 'carta' || fase === 'resuelta') {
        const escala = clamp(aparicion * 9, 0, 1);
        const c = COLORES[tinta];
        g.save();
        g.translate(W / 2, H * 0.45);
        g.scale(0.85 + escala * 0.15, 0.85 + escala * 0.15);
        g.globalAlpha = escala;
        ctx.engine.text(COLORES[palabra].nombre, 0, 0, {
          size: Math.min(96, W * 0.13), color: c.hex, glow: 26,
        });
        g.restore();

        if (fase === 'carta') {
          const p = clamp(reloj / 2.1, 0, 1);
          g.fillStyle = '#1a1a2c';
          g.fillRect(W * 0.25, H * 0.6, W * 0.5, 6);
          g.fillStyle = c.hex;
          g.fillRect(W * 0.25, H * 0.6, W * 0.5 * p, 6);
        }
      } else {
        ctx.engine.text('…', W / 2, H * 0.45, { size: 60, color: '#20203a' });
      }

      if (mensaje) {
        ctx.engine.text(mensaje, W / 2, H * 0.68, {
          size: 18, color: resaltado >= 0 ? players[resaltado].color : '#8f8fb0', font: 'system-ui',
        });
      }

      for (const p of jug) {
        const col = players[p.i].color;
        const x = p.i === 0 ? 30 : W - 30;
        const al = p.i === 0 ? 'left' : 'right';
        ctx.engine.text(String(p.puntos), x, H * 0.2, { size: 38, color: col, align: al });
        if (p.hielo > 0) {
          g.save();
          g.globalAlpha = 0.5 + Math.sin(t * 24) * 0.3;
          ctx.engine.text('bloqueado', x, H * 0.27, { size: 12, color: '#ff4757', align: al, font: 'system-ui' });
          g.restore();
        }
      }

      particles.render(g);
      ctx.engine.text('Pulsa tu tecla SOLO si la palabra y su color coinciden · pulsar de más resta y bloquea',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
