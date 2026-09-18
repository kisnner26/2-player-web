/**
 * Aguanta — el machaque que no premia el pico, sino el fondo.
 *
 * Hay un listón de clics por segundo y sube solo cada pocos segundos. Mientras
 * tu ritmo esté por encima, la barra se rellena; en cuanto bajas, empieza a
 * vaciarse. Cuando se vacía, tu turno ha terminado. Gana quien aguante más
 * tiempo antes de que el listón lo deje atrás.
 *
 * Es el contrario exacto del test de CPS: ahí sale ganando quien arranca como
 * un cohete, y aquí quien arranca como un cohete llega fundido al segundo
 * quince. El listón empieza tan bajo que los primeros veinte segundos son un
 * paseo — y ese paseo es una trampa, porque el que se relaja no calienta.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const VENTANA = 0.8;          // ventana con la que se mide el ritmo
const LISTON_INICIAL = 3.4;
const SUBIDA = 0.55;          // cuánto sube el listón en cada escalón
const CADA = 6;               // segundos entre escalones
const TOPE_TIEMPO = 120;      // por si alguien es una máquina

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  let W = ctx.W, H = ctx.H;
  let turno = 0;
  let fase = 'listo';          // listo | corriendo | descanso | fin
  let espera = 1.8;
  let tiempo = 0;

  let sellos = [];
  let cps = 0;
  let liston = LISTON_INICIAL;
  let escalon = 0;
  let energia = 1;
  let vivido = 0;
  /* Margen de arranque. Sin él, el turno empieza con el listón ya exigiendo y
     la barra se vacía en siete décimas si tardas un parpadeo en arrancar el
     dedo: se perdía el turno antes de empezar a jugarlo. */
  let gracia = 0;
  const marcas = [0, 0];       // segundos aguantados por cada uno
  const escalones = [0, 0];    // escalón al que llegó cada uno

  let sacudida = 0;
  let aviso = '', avisoT = 0;
  const chispas = [];

  const decir = (t, s = 1.8) => { aviso = t; avisoT = s; };

  function pulsar() {
    if (fase !== 'corriendo') return;
    sellos.push(tiempo);
    const col = players[turno].color;
    for (let i = 0; i < 2; i++) {
      const a = -Math.PI / 2 + (ctx.rng() - 0.5) * 1.6;
      chispas.push({
        x: W / 2 + (ctx.rng() - 0.5) * 40, y: H * 0.52,
        vx: Math.cos(a) * (90 + ctx.rng() * 150),
        vy: Math.sin(a) * (90 + ctx.rng() * 150),
        vida: 0.35, col,
      });
    }
    sacudida = Math.min(4, sacudida + 0.8);
    audio.tone({ freq: 260 + Math.min(cps, 15) * 30, dur: 0.025, gain: 0.07, type: 'square' });
    haptics.play('tap', { player: turno });
    ctx.mando?.vibrar?.(turno, 'tecla');
  }

  function empezarTurno() {
    fase = 'corriendo';
    sellos = [];
    cps = 0;
    liston = LISTON_INICIAL;
    escalon = 0;
    energia = 1;
    vivido = 0;
    gracia = 1.5;
    audio.tone({ freq: 660, dur: 0.14, gain: 0.2, type: 'triangle' });
    for (const i of [0, 1]) {
      ctx.mando?.perfil?.(i, {
        disposicion: 'solo',
        juego: 'Aguanta',
        pie: i === turno ? 'Mantén el ritmo' : 'Espera tu turno',
        controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'AGUANTA', glifo: '💪' }] }],
      });
    }
  }

  function caer() {
    marcas[turno] = vivido;
    escalones[turno] = escalon;
    audio.lose();
    haptics.play('defeat', { player: turno });
    ctx.shake(7, 10);
    decir(`${players[turno].name} aguantó ${vivido.toFixed(1)} s`, 2.4);
    if (turno === 0) { fase = 'descanso'; espera = 2.8; }
    else { fase = 'fin'; espera = 2.2; }
  }

  function resolver() {
    const [a, b] = marcas;
    ctx.finish({
      winner: Math.abs(a - b) < 0.05 ? -1 : (a > b ? 0 : 1),
      scores: [Math.round(a * 10) / 10, Math.round(b * 10) / 10],
      detail: `Listón alcanzado: ${(LISTON_INICIAL + escalones[0] * SUBIDA).toFixed(1)} y ${(LISTON_INICIAL + escalones[1] * SUBIDA).toFixed(1)} CPS`,
      record: ctx.record('aguante', Math.round(Math.max(a, b) * 10) / 10, 'high'),
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
      sacudida = Math.max(0, sacudida - dt * 9);
      if (avisoT > 0) avisoT -= dt;
      for (const c of chispas) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 420 * dt; c.vida -= dt; }
      for (let i = chispas.length - 1; i >= 0; i--) if (chispas[i].vida <= 0) chispas.splice(i, 1);

      // Solo el botón del iPad: en el teclado machaca la L y nada más.
      const j = input.player(turno);
      if (fase === 'corriendo' && j.conMando && j.pressed('a')) pulsar();

      if (fase === 'listo') {
        espera -= dt;
        if (espera <= 0) empezarTurno();
        return;
      }

      if (fase === 'corriendo') {
        vivido += dt;
        while (sellos.length && sellos[0] < tiempo - VENTANA) sellos.shift();
        cps = sellos.length / VENTANA;

        const nuevoEscalon = Math.floor(vivido / CADA);
        if (nuevoEscalon > escalon) {
          escalon = nuevoEscalon;
          liston = LISTON_INICIAL + escalon * SUBIDA;
          decir(`Listón: ${liston.toFixed(1)} CPS`, 1.4);
          audio.tone({ freq: 880, dur: 0.16, gain: 0.16, type: 'square', sweep: 120 });
          haptics.play('tick', { player: turno });
        }

        // Por encima del listón se recupera; por debajo se cae, y cuanto más
        // lejos estés, más deprisa. Durante el margen de arranque no se pierde
        // nada, solo se puede ganar.
        if (gracia > 0) gracia -= dt;
        const falta = liston - cps;
        const cambio = falta <= 0 ? 0.42 : (gracia > 0 ? 0 : -clamp(falta * 0.42, 0.1, 1.5));
        energia = clamp(energia + cambio * dt, 0, 1);
        if (energia <= 0 || vivido >= TOPE_TIEMPO) caer();
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
      const sx = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      g.save();
      g.translate(sx, 0);

      ctx.engine.clear('#07060c');
      const peligro = fase === 'corriendo' ? 1 - energia : 0;
      const fondo = g.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H);
      fondo.addColorStop(0, peligro > 0.5 ? `rgba(255,71,87,${(peligro - 0.5) * 0.35})` : `${players[turno].color}14`);
      fondo.addColorStop(1, '#00000000');
      g.fillStyle = fondo;
      g.fillRect(0, 0, W, H);

      /* Termómetro central: el listón es una marca fija y tu ritmo, la columna. */
      const cx = W / 2, ancho = Math.min(W * 0.34, 260);
      const arriba = H * 0.2, alto = H * 0.44;
      const TOPE = Math.max(12, liston + 5);

      g.fillStyle = '#ffffff0d';
      g.fillRect(cx - ancho / 2, arriba, ancho, alto);

      const hCps = clamp(cps / TOPE, 0, 1) * alto;
      const porEncima = cps >= liston;
      g.save();
      g.shadowColor = porEncima ? players[turno].color : '#ff4757';
      g.shadowBlur = 22;
      g.fillStyle = porEncima ? players[turno].color : '#ff4757';
      g.fillRect(cx - ancho / 2 + 6, arriba + alto - hCps, ancho - 12, hCps);
      g.restore();

      const yListon = arriba + alto - clamp(liston / TOPE, 0, 1) * alto;
      g.strokeStyle = '#ffd166';
      g.lineWidth = 3;
      g.setLineDash([10, 6]);
      g.beginPath();
      g.moveTo(cx - ancho / 2 - 16, yListon);
      g.lineTo(cx + ancho / 2 + 16, yListon);
      g.stroke();
      g.setLineDash([]);
      ctx.engine.text(`LISTÓN ${liston.toFixed(1)}`, cx + ancho / 2 + 22, yListon,
        { size: 11, color: '#ffd166', align: 'left', font: 'system-ui' });
      ctx.engine.text(cps.toFixed(1), cx, arriba - 22, { size: 30, color: porEncima ? '#f2f2ff' : '#ff4757' });

      /* Barra de energía: lo que de verdad decide cuándo se acaba tu turno. */
      const bw = Math.min(W * 0.62, 520), bx = cx - bw / 2, by = H * 0.72;
      g.fillStyle = '#ffffff12';
      g.fillRect(bx, by, bw, 20);
      g.save();
      g.shadowColor = energia > 0.35 ? '#a8ff3e' : '#ff4757';
      g.shadowBlur = 16;
      g.fillStyle = energia > 0.35 ? '#a8ff3e' : '#ff4757';
      g.fillRect(bx, by, bw * energia, 20);
      g.restore();
      ctx.engine.text('AGUANTE', cx, by + 34, { size: 11, color: '#ffffff44', font: 'system-ui' });

      for (const c of chispas) {
        g.save();
        g.globalAlpha = clamp(c.vida * 2.6, 0, 1);
        g.fillStyle = c.col;
        g.fillRect(c.x - 2, c.y - 2, 4, 4);
        g.restore();
      }

      if (fase === 'corriendo') {
        ctx.engine.text(`${vivido.toFixed(1)} s`, cx, H * 0.12, { size: 26, color: players[turno].color });
        if (gracia > 0) {
          ctx.engine.text('¡ARRANCA!', cx, H * 0.05, { size: 15, color: '#a8ff3e', font: 'system-ui' });
        }
      } else if (fase === 'listo') {
        ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, cx, H * 0.42,
          { size: 24, color: players[turno].color });
        ctx.engine.text('El listón sube cada 6 segundos. No lo pierdas de vista.', cx, H * 0.5,
          { size: 13, color: '#8f8fb0', font: 'system-ui' });
      }
      // El aviso va por debajo de la barra de aguante: puesto más arriba caía
      // dentro de la columna y se leía sobre el propio relleno.
      if (avisoT > 0) ctx.engine.text(aviso, cx, H * 0.88, { size: 16, color: '#ffd166', font: 'system-ui' });

      for (const i of [0, 1]) {
        const txt = marcas[i] ? `${marcas[i].toFixed(1)} s` : (i === turno && fase === 'corriendo' ? '…' : '—');
        ctx.engine.text(`${players[i].name} ${txt}`, i === 0 ? 18 : W - 18, 26, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      g.restore();
      ctx.engine.text('Mantén la L por encima del listón · si la barra se vacía, se acabó tu turno',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
