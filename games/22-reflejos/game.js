/**
 * Reflejos — señales verdaderas y trampas.
 *
 * No basta con ser rápido: hay señales falsas (color equivocado, forma
 * equivocada, "casi verde") que penalizan si reaccionas. Eso obliga a mirar
 * de verdad en vez de pulsar por instinto al primer cambio de la pantalla.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const RONDAS = 9;
const VERDE = '#a8ff3e';

/** Las trampas se parecen cada vez más a la señal buena. */
const TRAMPAS = [
  { color: '#ff4757', forma: 'circulo', nombre: 'rojo' },
  { color: '#ffd166', forma: 'circulo', nombre: 'ámbar' },
  { color: VERDE, forma: 'cuadrado', nombre: 'verde pero cuadrado' },
  { color: '#7fff3e', forma: 'circulo', nombre: 'casi verde' },
  { color: '#a8ff3e', forma: 'triangulo', nombre: 'verde pero triángulo' },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let fase = 'espera';         // espera | mostrando | resuelto
  let espera = 0;
  let señal = null;            // {valida, color, forma}
  let tSenal = 0;
  let respondio = [false, false];
  const score = [0, 0];
  let ronda = 0;
  let sb = null;
  let pausa = 0;
  let mensaje = '';
  let mejor = null;

  function siguiente() {
    ronda++;
    if (ronda > RONDAS) return terminar();
    fase = 'espera';
    espera = 1.1 + rng() * 2.4;
    señal = null;
    respondio = [false, false];
    mensaje = '';
    sb.setCenter(`ronda ${ronda} / ${RONDAS}`);
  }

  function generarSenal() {
    // Un tercio de las señales son trampa; la dificultad sube con la ronda.
    const esTrampa = rng() < 0.38;
    if (!esTrampa) return { valida: true, color: VERDE, forma: 'circulo' };
    const nivel = clamp(Math.floor((ronda / RONDAS) * TRAMPAS.length) + 1, 1, TRAMPAS.length);
    const t = TRAMPAS[Math.floor(rng() * nivel)];
    return { valida: false, ...t };
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: '' });
      siguiente();
      ui.toast('Pulsa SOLO con el círculo verde', { ms: 2800 });
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (fase === 'resuelto') {
        pausa -= dt;
        if (pausa <= 0) siguiente();
        particles.update(dt);
        return;
      }

      for (let i = 0; i < 2; i++) {
        if (!input.player(i).pressed('a') || respondio[i]) continue;
        respondio[i] = true;

        if (fase === 'espera') { fallo(i, 'demasiado pronto'); return; }
        if (!señal.valida) { fallo(i, `era ${señal.nombre}`); return; }

        const t = ctx.engine.time - tSenal;
        if (mejor == null || t < mejor) mejor = t;
        acierto(i, t);
        return;
      }

      if (fase === 'espera') {
        espera -= dt;
        if (espera <= 0) {
          señal = generarSenal();
          fase = 'mostrando';
          tSenal = ctx.engine.time;
          audio.tone({ freq: señal.valida ? 700 : 480, dur: 0.07, gain: 0.14 });
          haptics.play(señal.valida ? 'impact' : 'tap');
        }
      } else if (fase === 'mostrando') {
        const t = ctx.engine.time - tSenal;
        if (señal.valida && t > 2) resolver(-1, 'nadie reaccionó');
        if (!señal.valida && t > 1.3) resolver(-1, 'bien ignorado');
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#04060c');

      const cx = W / 2, cy = H * 0.46;
      const r = Math.min(W, H) * 0.16;

      if (fase === 'mostrando' && señal) {
        g.save();
        g.shadowColor = señal.color;
        g.shadowBlur = 50;
        g.fillStyle = señal.color;
        if (señal.forma === 'circulo') {
          g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
        } else if (señal.forma === 'cuadrado') {
          g.fillRect(cx - r, cy - r, r * 2, r * 2);
        } else {
          g.beginPath();
          g.moveTo(cx, cy - r);
          g.lineTo(cx + r, cy + r * 0.8);
          g.lineTo(cx - r, cy + r * 0.8);
          g.closePath();
          g.fill();
        }
        g.restore();
      } else {
        g.strokeStyle = '#ffffff18';
        g.lineWidth = 3;
        g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
        ctx.engine.text(fase === 'espera' ? '…' : '', cx, cy, { size: 34, color: '#ffffff44' });
      }

      if (mensaje) {
        ctx.engine.text(mensaje, cx, cy + r + 46, { size: 14, color: '#ffffffaa', font: 'system-ui' });
      }

      particles.render(g);

      // Teclas de cada jugador
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? W * 0.2 : W * 0.8;
        const y = H * 0.84;
        const activo = respondio[i];
        g.save();
        g.strokeStyle = players[i].color;
        g.lineWidth = activo ? 4 : 2;
        g.globalAlpha = activo ? 1 : 0.5;
        g.beginPath();
        g.roundRect(x - 60, y - 22, 120, 44, 10);
        g.stroke();
        g.restore();
        ctx.engine.text(input.player(i).keyLabel('a'), x, y, {
          size: 13, color: players[i].color, font: 'system-ui',
        });
      }
    },

    destroy() { sb?.remove(); },
  };

  function acierto(i, t) {
    score[i]++;
    sb.update(score[0], score[1]);
    audio.score(i);
    haptics.score(i);
    resolver(i, `${Math.round(t * 1000)} ms`);
    particles.burst(W / 2, H * 0.46, 26, { speed: 260, color: players[i].color, size: 5 });
  }

  function fallo(i, motivo) {
    const otro = 1 - i;
    score[otro]++;
    sb.update(score[0], score[1]);
    audio.error();
    haptics.error(i);
    ctx.shake(8);
    resolver(otro, `${players[i].name}: ${motivo}`);
  }

  function resolver(quien, texto) {
    fase = 'resuelto';
    pausa = 1.5;
    mensaje = texto;
    if (quien >= 0) mensaje = `${players[quien].name} · ${texto}`;
  }

  function terminar() {
    const [a, b] = score;
    ctx.finish({
      winner: a === b ? -1 : a > b ? 0 : 1,
      scores: [a, b],
      detail: mejor != null ? `Mejor reacción: ${Math.round(mejor * 1000)} ms` : '',
      record: mejor != null && ctx.record('reaccion', Math.round(mejor * 1000), 'low'),
    });
  }
}
