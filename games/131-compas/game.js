/**
 * A Compás — machacar no es correr, es medir.
 *
 * La aguja marca tu ritmo de clics y hay una franja verde que dice a qué ritmo
 * hay que ir. Puntúa el tiempo que consigas mantenerte dentro, y la franja
 * cambia de sitio cada seis segundos: cuatro clavados, uno de ellos lento.
 *
 * Es el juego incómodo del paquete. Al que solo sabe machacar a tope le va
 * fatal el tramo de 3 CPS — frenar de golpe y quedarse quieto en un número
 * cuesta más que ir a saco, y ahí es donde se decide.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const VENTANA = 0.7;
const TRAMO = 6;              // segundos por objetivo
const MARGEN = 0.9;           // ± tolerancia en CPS
const OBJETIVOS = [5, 8.5, 3, 7];
const TOTAL = OBJETIVOS.length * TRAMO;
const TOPE = 13;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  let W = ctx.W, H = ctx.H;
  let turno = 0;
  let fase = 'listo';          // listo | midiendo | descanso | fin
  let espera = 1.8;
  let tiempo = 0;
  let reloj = 0;

  let sellos = [];
  let cps = 0;
  let dentro = 0;              // segundos acertados en este turno
  let racha = 0;
  const puntos = [0, 0];
  const mejorRacha = [0, 0];
  let latido = 0;              // metrónomo visual y sonoro
  let aviso = '', avisoT = 0;

  const objetivoAhora = () => OBJETIVOS[Math.min(OBJETIVOS.length - 1, Math.floor((TOTAL - reloj) / TRAMO))];
  const acertando = () => Math.abs(cps - objetivoAhora()) <= MARGEN;
  const decir = (t, s = 1.6) => { aviso = t; avisoT = s; };

  function pulsar() {
    if (fase !== 'midiendo') return;
    sellos.push(tiempo);
    audio.tone({ freq: acertando() ? 720 : 380, dur: 0.025, gain: 0.07, type: 'square' });
    haptics.play('tap', { player: turno });
    ctx.mando?.vibrar?.(turno, 'tecla');
  }

  function empezarTurno() {
    fase = 'midiendo';
    reloj = TOTAL;
    sellos = [];
    cps = 0;
    dentro = 0;
    racha = 0;
    latido = 0;
    audio.tone({ freq: 660, dur: 0.14, gain: 0.2, type: 'triangle' });
    for (const i of [0, 1]) {
      ctx.mando?.perfil?.(i, {
        disposicion: 'solo',
        juego: 'A Compás',
        pie: i === turno ? 'Sigue la franja verde' : 'Espera tu turno',
        controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'COMPÁS', glifo: '🎯' }] }],
      });
    }
  }

  function acabarTurno() {
    puntos[turno] = dentro;
    audio.tone({ freq: 240, dur: 0.3, gain: 0.18, type: 'sawtooth', sweep: -80 });
    decir(`${players[turno].name}: ${dentro.toFixed(1)} s a compás`, 2.4);
    if (turno === 0) { fase = 'descanso'; espera = 2.8; }
    else { fase = 'fin'; espera = 2.2; }
  }

  function resolver() {
    const [a, b] = puntos;
    ctx.finish({
      winner: Math.abs(a - b) < 0.05 ? -1 : (a > b ? 0 : 1),
      scores: [Math.round(a * 10) / 10, Math.round(b * 10) / 10],
      detail: `De ${TOTAL} s posibles · mejor racha seguida: ${mejorRacha[0].toFixed(1)} s y ${mejorRacha[1].toFixed(1)} s`,
      record: ctx.record('compas', Math.round(Math.max(a, b) * 10) / 10, 'high'),
    });
  }

  let soltarTecla = () => {};

  return {
    init() {
      soltarTecla = input.on('KeyL', pulsar);
      fase = 'listo';
      espera = 1.8;
    },
    destroy() { soltarTecla(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      if (avisoT > 0) avisoT -= dt;

      // Solo el botón del iPad: en el teclado marca el compás la L y nada más.
      const j = input.player(turno);
      if (fase === 'midiendo' && j.conMando && j.pressed('a')) pulsar();

      if (fase === 'listo') {
        espera -= dt;
        if (espera <= 0) empezarTurno();
        return;
      }

      if (fase === 'midiendo') {
        const antes = objetivoAhora();
        reloj -= dt;
        while (sellos.length && sellos[0] < tiempo - VENTANA) sellos.shift();
        cps = sellos.length / VENTANA;

        if (acertando()) {
          dentro += dt;
          racha += dt;
          mejorRacha[turno] = Math.max(mejorRacha[turno], racha);
        } else {
          racha = 0;
        }

        // Metrónomo: un tic al ritmo pedido, para poder seguirlo de oído.
        const obj = objetivoAhora();
        latido += dt * obj;
        if (latido >= 1) {
          latido -= 1;
          audio.tone({ freq: 1100, dur: 0.018, gain: 0.05, type: 'sine' });
        }
        if (obj !== antes) {
          decir(`Ahora ${obj} CPS`, 1.6);
          audio.tone({ freq: 900, dur: 0.18, gain: 0.16, type: 'square', sweep: -160 });
          haptics.play('tick', { player: turno });
        }
        if (reloj <= 0) { reloj = 0; acabarTurno(); }
        return;
      }

      if (fase === 'descanso') {
        espera -= dt;
        if (espera <= 0) { turno = 1; fase = 'listo'; espera = 2; }
        return;
      }

      if (fase === 'fin') {
        espera -= dt;
        if (espera <= 0) resolver();
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#06070e');

      const bien = fase === 'midiendo' && acertando();
      const halo = g.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, H * 0.8);
      halo.addColorStop(0, bien ? 'rgba(168,255,62,0.14)' : `${players[turno].color}10`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      /* Dial semicircular: la escala de CPS, la franja objetivo y la aguja.
         El centro va bajo a propósito: con el eje a media altura, el arco se
         comía la parte de arriba y dejaba un tercio de pantalla vacío debajo. */
      const cx = W / 2, cy = H * 0.78, R = Math.min(W * 0.3, H * 0.46);
      const A0 = Math.PI * 1.08, A1 = Math.PI * 1.92;
      const aDe = (v) => A0 + clamp(v / TOPE, 0, 1) * (A1 - A0);

      g.strokeStyle = '#ffffff14';
      g.lineWidth = 22;
      g.beginPath();
      g.arc(cx, cy, R, A0, A1);
      g.stroke();

      const obj = objetivoAhora();
      g.strokeStyle = bien ? '#a8ff3e' : '#a8ff3e88';
      g.lineWidth = 22;
      g.beginPath();
      g.arc(cx, cy, R, aDe(obj - MARGEN), aDe(obj + MARGEN));
      g.stroke();

      g.strokeStyle = '#ffffff33';
      g.lineWidth = 2;
      for (let v = 0; v <= TOPE; v += 2) {
        const a = aDe(v);
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
        g.lineTo(cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14));
        g.stroke();
        ctx.engine.text(String(v), cx + Math.cos(a) * (R + 30), cy + Math.sin(a) * (R + 30),
          { size: 10, color: '#ffffff44', font: 'system-ui' });
      }

      // Aguja.
      const aAguja = aDe(cps);
      g.save();
      g.shadowColor = bien ? '#a8ff3e' : '#ff4757';
      g.shadowBlur = 18;
      g.strokeStyle = bien ? '#a8ff3e' : '#ff4757';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(aAguja) * (R + 6), cy + Math.sin(aAguja) * (R + 6));
      g.stroke();
      g.restore();
      g.fillStyle = '#f2f2ff';
      g.beginPath();
      g.arc(cx, cy, 7, 0, TAU);
      g.fill();

      /* Metrónomo: un punto que late al ritmo pedido. */
      if (fase === 'midiendo') {
        const p = 1 - latido;
        g.save();
        g.globalAlpha = clamp(p * 1.4, 0, 1);
        g.fillStyle = '#ffd166';
        g.beginPath();
        g.arc(cx, H * 0.16, 8 + p * 12, 0, TAU);
        g.fill();
        g.restore();
        // El aviso de cambio ocupa el sitio del rótulo del objetivo: dicen lo
        // mismo, y ponerlo aparte lo dejaba encima del arco del dial.
        if (avisoT > 0) ctx.engine.text(aviso.toUpperCase(), cx, H * 0.25, { size: 22, color: '#ffffff', glow: 14 });
        else ctx.engine.text(`OBJETIVO ${obj} CPS`, cx, H * 0.25, { size: 18, color: '#ffd166' });
        ctx.engine.text(cps.toFixed(1), cx, cy - R * 0.5, { size: 46, color: bien ? '#a8ff3e' : '#f2f2ff', glow: bien ? 20 : 0 });
        ctx.engine.text(`${dentro.toFixed(1)} s dentro · quedan ${reloj.toFixed(0)} s`, cx, H * 0.94,
          { size: 13, color: players[turno].color, font: 'system-ui' });
      } else if (fase === 'listo') {
        ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, cx, H * 0.4,
          { size: 24, color: players[turno].color });
        ctx.engine.text('No es ir rápido: es quedarse en el número que te pidan.', cx, H * 0.48,
          { size: 13, color: '#8f8fb0', font: 'system-ui' });
      } else if (aviso) {
        // Entre turnos y al final, el dial se queda quieto y manda el resultado.
        ctx.engine.text(aviso, cx, H * 0.42, { size: 20, color: '#ffd166', font: 'system-ui' });
      }
      /* Los cuatro tramos, para saber por dónde va el turno. */
      if (fase === 'midiendo') {
        const hecho = (TOTAL - reloj) / TRAMO;
        OBJETIVOS.forEach((v, i) => {
          const s = 22, x = cx - (OBJETIVOS.length * (s + 8)) / 2 + i * (s + 8);
          g.fillStyle = i < Math.floor(hecho) ? '#a8ff3e' : (i === Math.floor(hecho) ? '#ffd166' : '#ffffff22');
          g.fillRect(x, H * 0.08, s, 6);
        });
      }

      for (const i of [0, 1]) {
        const txt = puntos[i] ? `${puntos[i].toFixed(1)} s` : (i === turno && fase === 'midiendo' ? '…' : '—');
        ctx.engine.text(`${players[i].name} ${txt}`, i === 0 ? 18 : W - 18, 26, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      ctx.engine.text('Machaca la L al ritmo que marca la franja verde · puntúa el tiempo dentro',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
