/**
 * Bomba Caliente — el paquete quema y la mecha no se ve.
 *
 * Quien la tiene se la quita pulsando su tecla, pero pasarla cuesta un tiempo
 * de vuelo que crece cada vez que va y viene: al principio cruza volando y al
 * final se arrastra, así que las últimas pasadas se juegan en el aire, sin
 * que nadie pueda hacer nada.
 *
 * Y hay una tecla más: aguantarla. Mientras la sujetas, la mecha va más
 * despacio — puedes quedarte con ella un momento para que le explote a él en
 * las manos. Es el único juego donde la jugada valiente es no soltarla.
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 3;
const MECHA_MIN = 7;
const MECHA_MAX = 15;
const VUELO_BASE = 0.55;
const VUELO_CRECE = 0.045;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let mecha = 0, total = 0, dueño = 0, pases = 0;
  let vuelo = 0, vueloTotal = 0, desde = 0;
  let fase = 'mano', espera = 0, t = 0;
  const puntos = [0, 0];
  let sb = null, sujetando = false;

  function nuevaRonda(primero) {
    total = MECHA_MIN + rng() * (MECHA_MAX - MECHA_MIN);
    mecha = total;
    dueño = primero;
    pases = 0;
    fase = 'mano';
    sujetando = false;
  }

  const manoX = (i) => W * (i === 0 ? 0.22 : 0.78);
  const manoY = () => H * 0.56;

  function pasar() {
    fase = 'vuelo';
    desde = dueño;
    pases++;
    vueloTotal = VUELO_BASE + pases * VUELO_CRECE;
    vuelo = vueloTotal;
    audio.swoosh();
    haptics.tap(dueño);
    particles.burst(manoX(dueño), manoY(), 10, {
      speed: 200, dir: dueño === 0 ? 0 : Math.PI, spread: 1, color: players[dueño].color, size: 3, drag: 0.9,
    });
  }

  function explotar() {
    const perdedor = fase === 'vuelo' ? desde : dueño;   // en el aire la paga quien la lanzó
    puntos[1 - perdedor]++;
    sb.update(puntos[0], puntos[1]);
    audio.explosion();
    haptics.explosion(perdedor);
    ctx.shake(16);
    const x = fase === 'vuelo' ? bombaX() : manoX(perdedor);
    particles.burst(x, manoY(), 40, { speed: 420, color: '#ff8c42', size: 6, drag: 0.9, gravity: 300 });
    particles.burst(x, manoY(), 20, { speed: 260, color: '#ffd166', size: 4, drag: 0.92 });
    fase = 'boom';
    espera = 2;
  }

  function bombaX() {
    if (fase !== 'vuelo') return manoX(dueño);
    const p = 1 - vuelo / vueloTotal;
    return manoX(desde) + (manoX(1 - desde) - manoX(desde)) * p;
  }
  function bombaY() {
    if (fase !== 'vuelo') return manoY() - 42;
    const p = 1 - vuelo / vueloTotal;
    return manoY() - 42 - Math.sin(p * Math.PI) * H * 0.16;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda(Math.floor(rng() * 2));
      sb = ui.scoreboard({ center: `a ${PARA_GANAR} rondas` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      particles.update(dt);

      if (fase === 'boom') {
        espera -= dt;
        if (espera <= 0) {
          const g = puntos.findIndex((v) => v >= PARA_GANAR);
          if (g >= 0) {
            ctx.finish({ winner: g, scores: puntos, detail: `la mecha aguantó ${pases} pases` });
            return;
          }
          nuevaRonda(Math.floor(rng() * 2));
        }
        return;
      }

      // Sujetarla frena la mecha: es el recurso arriesgado del juego.
      const pl = input.player(dueño);
      sujetando = fase === 'mano' && (pl.held('b') || pl.held('down'));
      mecha -= dt * (sujetando ? 0.45 : 1);
      if (mecha <= 0) { explotar(); return; }

      if (fase === 'vuelo') {
        vuelo -= dt;
        if (vuelo <= 0) { dueño = 1 - desde; fase = 'mano'; audio.tick(); haptics.tap(dueño); }
        return;
      }

      if (pl.pressed('a')) pasar();

      // Tic-tac que se acelera: la única pista de cuánto queda.
      const ritmo = clamp(mecha / total, 0.05, 1);
      if (Math.floor(t / (0.1 + ritmo * 0.5)) !== Math.floor((t - dt) / (0.1 + ritmo * 0.5))) {
        audio.tone({ freq: 900 + (1 - ritmo) * 700, dur: 0.02, gain: 0.07, type: 'square' });
        haptics.tick(dueño);
      }
    },

    render() {
      const g = ctx.c;
      const tension = fase === 'boom' ? 0 : clamp(1 - mecha / total, 0, 1);
      ctx.engine.clear(`rgb(${Math.floor(10 + tension * 40)},${8},${Math.floor(20 - tension * 8)})`);

      const halo = g.createRadialGradient(bombaX(), bombaY(), 0, bombaX(), bombaY(), H * (0.4 + tension * 0.5));
      halo.addColorStop(0, `rgba(255,140,66,${0.08 + tension * 0.25})`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      g.fillStyle = '#160f22';
      g.fillRect(0, manoY() + 26, W, H - manoY() - 26);

      for (const i of [0, 1]) {
        const tiene = fase === 'mano' && dueño === i;
        dibujarPersonaje(g, personajeDe(players[i], i), manoX(i), manoY() + 26, 96, {
          pose: tiene ? 'salta' : 'quieto',
          acento: players[i].color,
          mirando: i === 0 ? 1 : -1,
          brillo: tiene ? 22 : 0,
          alpha: tiene || fase !== 'mano' ? 1 : 0.6,
        });
        ctx.engine.text(players[i].name, manoX(i), manoY() + 48,
          { size: 13, color: players[i].color, font: 'system-ui' });
      }

      if (fase !== 'boom') {
        const bx = bombaX(), by = bombaY();
        const pulso = 1 + Math.sin(t * (6 + tension * 26)) * (0.05 + tension * 0.12);
        const r = 22 * pulso;
        ctx.engine.glowCircle(bx, by, r, sujetando ? '#3effc8' : '#ff4757', 26 + tension * 34);
        g.fillStyle = '#1a1020';
        g.beginPath(); g.arc(bx, by, r * 0.62, 0, Math.PI * 2); g.fill();
        // Mecha
        g.strokeStyle = '#ffd166';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(bx, by - r);
        g.quadraticCurveTo(bx + 12, by - r - 16, bx + 4, by - r - 26);
        g.stroke();
        ctx.engine.glowCircle(bx + 4, by - r - 26, 4 + Math.sin(t * 30) * 1.5, '#fff2a0', 18);

        if (sujetando) {
          ctx.engine.text('sujetando…', bx, by + r + 20, { size: 12, color: '#3effc8', font: 'system-ui' });
        }
      } else {
        ctx.engine.text('¡BOOM!', W / 2, H * 0.4, { size: 46, color: '#ff8c42', glow: 30 });
      }

      particles.render(g);
      ctx.engine.text('Tu tecla la lanza · mantén la especial para frenar la mecha · cada pase vuela más lento',
        W / 2, H - 12, { size: 11, color: '#6a5a70', font: 'system-ui' });
    },
  };
}
