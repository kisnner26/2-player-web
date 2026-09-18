/**
 * Trapecio — uno se suelta y el otro tiene que estar allí.
 *
 * Dos péndulos que van cada uno a su ritmo. El volante se suelta cuando quiere
 * y vuela en parábola; el portor cuelga boca abajo y cierra las manos cuando
 * quiere. La captura solo ocurre si el vuelo y el cierre coinciden en el mismo
 * punto y en el mismo instante.
 *
 * Nadie puede compensar al otro: soltarse tarde no se arregla cerrando antes.
 * Por eso funciona como juego cooperativo de verdad — el acierto no es de
 * ninguno de los dos, es del par.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const INTENTOS = 8;
const GRAVEDAD = 900;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let anguloA = 0, anguloB = Math.PI, velA = 1.5, velB = 1.5;
  let fase = 'columpio';        // columpio | vuelo | resultado
  let volante = { x: 0, y: 0, vx: 0, vy: 0 };
  let manos = 0;                // 0..1, cuánto están cerradas las manos del portor
  let intento = 1, capturas = 0, mejor = 0, espera = 0, t = 0, mensaje = '';
  let sb = null, terminado = false;

  const pivA = () => ({ x: W * 0.3, y: H * 0.16 });
  const pivB = () => ({ x: W * 0.7, y: H * 0.16 });
  const largo = () => H * 0.34;

  const puntoA = () => {
    const p = pivA();
    return { x: p.x + Math.sin(anguloA) * largo(), y: p.y + Math.cos(anguloA) * largo() };
  };
  const puntoB = () => {
    const p = pivB();
    return { x: p.x + Math.sin(anguloB) * largo(), y: p.y + Math.cos(anguloB) * largo() };
  };

  function soltar() {
    const p = puntoA();
    // Velocidad tangencial del péndulo: es lo que se lleva al vuelo.
    const v = velA * largo();
    volante = { x: p.x, y: p.y, vx: Math.cos(anguloA) * v, vy: -Math.sin(anguloA) * v };
    fase = 'vuelo';
    audio.swoosh();
    haptics.tap(0);
  }

  function resolver(exito, motivo) {
    fase = 'resultado';
    espera = 1.8;
    mensaje = motivo;
    if (exito) {
      capturas++;
      mejor = Math.max(mejor, capturas);
      audio.win();
      haptics.victory(null);
      particles.burst(volante.x, volante.y, 30, { speed: 280, color: '#ffd166', size: 5, drag: 0.9 });
    } else {
      audio.lose();
      haptics.error(null);
      ctx.shake(6);
    }
    sb.update(capturas, intento);
  }

  function siguiente() {
    intento++;
    if (intento > INTENTOS) {
      terminado = true;
      ctx.finish({
        winner: -1,
        scores: [capturas, INTENTOS],
        detail: `${capturas} de ${INTENTOS} capturas`,
        record: ctx.record('capturas', capturas, 'high'),
      });
      return;
    }
    fase = 'columpio';
    anguloA = 0;
    anguloB = Math.PI;
    // Cada intento va un poco más rápido: los dos péndulos se desincronizan.
    velA = 1.5 + intento * 0.12;
    velB = -(1.5 + intento * 0.16);
    manos = 0;
    mensaje = '';
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      velA = 1.5;
      velB = -1.5;
      sb = ui.scoreboard({ center: `${INTENTOS} intentos` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      // Péndulos: aceleración por gravedad más un empujón si mantienen la tecla.
      const p0 = input.player(0), p1 = input.player(1);
      velA += -Math.sin(anguloA) * 3.4 * dt + (p0.held('b') || p0.held('down') ? Math.sign(velA) * 1.6 * dt : 0);
      velB += -Math.sin(anguloB) * 3.4 * dt + (p1.held('b') || p1.held('down') ? Math.sign(velB) * 1.6 * dt : 0);
      velA = clamp(velA, -3.4, 3.4);
      velB = clamp(velB, -3.4, 3.4);
      if (fase !== 'resultado') { anguloA += velA * dt; anguloB += velB * dt; }

      // Manos del portor: se cierran mientras mantiene la tecla.
      manos = clamp(manos + (p1.held('a') ? dt * 6 : -dt * 5), 0, 1);

      if (fase === 'columpio') {
        if (p0.pressed('a')) soltar();
        return;
      }

      if (fase === 'vuelo') {
        volante.vy += GRAVEDAD * dt;
        volante.x += volante.vx * dt;
        volante.y += volante.vy * dt;
        particles.spawn({
          x: volante.x, y: volante.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25,
          size: 4, color: `${players[0].color}88`, shape: 'circle',
        });

        const b = puntoB();
        const d = Math.hypot(volante.x - b.x, volante.y - b.y);
        // La ventana de captura depende de cuánto tenga cerradas las manos.
        const alcance = 20 + manos * 34;
        if (d < alcance && manos > 0.55) {
          resolver(true, `¡Agarrada! a ${Math.round(d)} px con las manos al ${Math.round(manos * 100)}%`);
          return;
        }
        if (volante.y > H * 0.86) {
          resolver(false, d < 70 ? 'Se rozaron: faltó cerrar las manos' : 'Al vacío');
          return;
        }
        return;
      }

      espera -= dt;
      if (espera <= 0) siguiente();
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#120a18');

      // Carpa
      const carpa = g.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.1, H);
      carpa.addColorStop(0, '#2a1436');
      carpa.addColorStop(1, '#0c0612');
      g.fillStyle = carpa;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#3a2450';
      g.lineWidth = 3;
      for (let i = 0; i <= 8; i++) {
        g.beginPath();
        g.moveTo(W / 2, 0);
        g.lineTo((i / 8) * W, H * 0.34);
        g.stroke();
      }
      // Red
      g.strokeStyle = '#ffffff18';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x, H * 0.88); g.lineTo(x + 22, H * 0.94); g.stroke(); }
      for (let x = 0; x < W; x += 22) { g.beginPath(); g.moveTo(x, H * 0.94); g.lineTo(x + 22, H * 0.88); g.stroke(); }
      g.strokeStyle = '#ffffff33';
      g.beginPath(); g.moveTo(0, H * 0.9); g.lineTo(W, H * 0.9); g.stroke();

      // Barras y cuerdas
      for (const [piv, punto, col] of [[pivA(), puntoA(), players[0].color], [pivB(), puntoB(), players[1].color]]) {
        g.strokeStyle = '#c9a86a';
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(piv.x, piv.y); g.lineTo(punto.x, punto.y); g.stroke();
        ctx.engine.glowRect(punto.x - 22, punto.y - 3, 44, 6, col, 12);
      }

      const a = puntoA(), b = puntoB();

      // Portor: cuelga boca abajo de su barra.
      g.save();
      g.translate(b.x, b.y + 30);
      g.scale(1, -1);
      dibujarPersonaje(g, personajeDe(players[1], 1), 0, 0, 62, {
        pose: 'salta', acento: players[1].color, mirando: -1, brillo: manos > 0.55 ? 22 : 0,
      });
      g.restore();
      // Manos: el indicador que el volante tiene que leer.
      const rMano = 14 + manos * 22;
      g.strokeStyle = manos > 0.55 ? '#a8ff3e' : '#ffffff44';
      g.lineWidth = 3;
      g.beginPath(); g.arc(b.x, b.y + 66, rMano, 0, TAU); g.stroke();

      // Volante
      if (fase === 'columpio') {
        dibujarPersonaje(g, personajeDe(players[0], 0), a.x, a.y + 62, 60, {
          pose: 'salta', acento: players[0].color, mirando: velA > 0 ? 1 : -1,
        });
      } else {
        dibujarPersonaje(g, personajeDe(players[0], 0), volante.x, volante.y + 30, 60, {
          pose: 'salta', acento: players[0].color, mirando: volante.vx > 0 ? 1 : -1, brillo: 16,
        });
      }

      particles.render(g);

      ctx.engine.text(`intento ${Math.min(intento, INTENTOS)} de ${INTENTOS} · ${capturas} capturas`,
        W / 2, H * 0.06, { size: 14, color: '#ffd166', font: 'system-ui' });
      if (mensaje) {
        ctx.engine.text(mensaje, W / 2, H * 0.78, { size: 17, color: '#f2f2ff', glow: 8 });
      }
      ctx.engine.text(`${players[0].name}: suéltate en el momento justo · ${players[1].name}: mantén para cerrar las manos`,
        W / 2, H - 12, { size: 11, color: '#6a5a78', font: 'system-ui' });
    },
  };
}
