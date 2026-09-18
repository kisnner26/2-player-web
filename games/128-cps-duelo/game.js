/**
 * Duelo de CPS — diez segundos de L, uno detrás del otro.
 *
 * El test de clics de toda la vida, con lo que le suele faltar: no enseña solo
 * el total, enseña la CURVA. Se mide la frecuencia en una ventana deslizante de
 * un segundo y se dibuja mientras machacas, así que se ve en directo lo que
 * pasa de verdad — casi todo el mundo sale disparado, se desfonda a los cuatro
 * segundos y termina a la mitad de su pico.
 *
 * Por eso el marcador guarda tres cosas distintas: el pico (tu mejor segundo),
 * la media (lo que aguantas) y el total (lo que cuenta). Se puede ganar sin
 * tener el mejor pico, y ese es justo el interés.
 *
 * Una sola tecla y por turnos: los dos usan la misma L, con la misma mano y en
 * la misma posición, así que el duelo es limpio.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const SEGUNDOS = 10;
const VENTANA = 1;            // ventana deslizante con la que se calcula la CPS

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  let W = ctx.W, H = ctx.H;
  let turno = 0;
  let fase = 'listo';          // listo | machacando | descanso | fin
  let reloj = SEGUNDOS;
  let espera = 0;
  let tiempo = 0;

  /** Marca de tiempo de cada pulsación del turno actual (para la ventana). */
  let sellos = [];
  const datos = [[], []];      // curva de CPS por jugador
  const total = [0, 0];
  const pico = [0, 0];
  let cps = 0;
  let sacudida = 0;
  let destello = 0;
  const chispas = [];

  const media = (j) => (total[j] / SEGUNDOS);

  function pulsar() {
    if (fase !== 'machacando') return;
    sellos.push(tiempo);
    total[turno]++;

    const col = players[turno].color;
    for (let i = 0; i < 3; i++) {
      const a = ctx.rng() * TAU;
      chispas.push({
        x: W / 2, y: H * 0.44,
        vx: Math.cos(a) * (140 + ctx.rng() * 260),
        vy: Math.sin(a) * (140 + ctx.rng() * 260),
        vida: 0.4, col,
      });
    }
    sacudida = Math.min(5, sacudida + 1.1);
    destello = 0.4;
    audio.tone({ freq: 300 + Math.min(cps, 14) * 34, dur: 0.03, gain: 0.09, type: 'square' });
    haptics.play('tap', { player: turno });
    ctx.mando?.vibrar?.(turno, 'tecla');
  }

  function empezarTurno() {
    fase = 'machacando';
    reloj = SEGUNDOS;
    sellos = [];
    cps = 0;
    audio.tone({ freq: 700, dur: 0.12, gain: 0.2, type: 'triangle' });
    for (const i of [0, 1]) {
      ctx.mando?.perfil?.(i, {
        disposicion: 'solo',
        juego: 'Duelo de CPS',
        pie: i === turno ? '¡Tu turno! Machaca' : 'Espera tu turno',
        controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'CLIC', glifo: '⚡' }] }],
      });
    }
  }

  function acabarTurno() {
    fase = 'descanso';
    espera = 2.6;
    audio.tone({ freq: 240, dur: 0.3, gain: 0.18, type: 'sawtooth', sweep: -80 });
    haptics.play('score', { player: turno });
    if (turno === 1) {
      // Los dos han tirado: se resuelve.
      fase = 'fin';
      espera = 1.4;
    }
  }

  function resolver() {
    const ganador = total[0] === total[1] ? -1 : (total[0] > total[1] ? 0 : 1);
    const mejor = Math.max(total[0], total[1]);
    ctx.finish({
      winner: ganador,
      scores: [total[0], total[1]],
      detail: `Pico ${pico[0].toFixed(1)} y ${pico[1].toFixed(1)} CPS · media ${media(0).toFixed(1)} y ${media(1).toFixed(1)}`,
      record: ctx.record('clics', mejor, 'high'),
    });
  }

  let soltarTecla = () => {};

  return {
    init() {
      // La L se escucha como tecla física, no como acción mapeada: el juego se
      // anuncia con esa letra y los dos jugadores comparten la misma.
      soltarTecla = input.on('KeyL', pulsar);
      espera = 1.6;
      fase = 'listo';
    },
    destroy() { soltarTecla(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      sacudida = Math.max(0, sacudida - dt * 9);
      destello = Math.max(0, destello - dt * 3);
      for (const c of chispas) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 560 * dt; c.vida -= dt; }
      for (let i = chispas.length - 1; i >= 0; i--) if (chispas[i].vida <= 0) chispas.splice(i, 1);

      // El botón del mando entra por el mismo sitio que la tecla, pero solo si
      // ese jugador está jugando con iPad: en el teclado la única tecla que
      // machaca es la L, y si no se filtraría también el Espacio del jugador 1.
      const j = input.player(turno);
      if (fase === 'machacando' && j.conMando && j.pressed('a')) pulsar();

      if (fase === 'listo') {
        espera -= dt;
        if (espera <= 0) empezarTurno();
        return;
      }

      if (fase === 'machacando') {
        reloj -= dt;
        // Ventana deslizante: se tiran las pulsaciones de hace más de un segundo.
        while (sellos.length && sellos[0] < tiempo - VENTANA) sellos.shift();
        cps = sellos.length / VENTANA;
        pico[turno] = Math.max(pico[turno], cps);
        datos[turno].push(cps);
        if (reloj <= 0) acabarTurno();
        return;
      }

      if (fase === 'descanso') {
        espera -= dt;
        if (espera <= 0) { turno = 1; fase = 'listo'; espera = 1.8; }
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
      const sy = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      g.save();
      g.translate(sx, sy);

      ctx.engine.clear('#06060e');
      const halo = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.8);
      halo.addColorStop(0, `${players[turno].color}18`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);
      if (destello > 0) {
        g.fillStyle = `rgba(255,255,255,${destello * 0.13})`;
        g.fillRect(0, 0, W, H);
      }

      /* Curva de CPS del turno en marcha, y por detrás la del rival. */
      const gx = W * 0.5 - Math.min(W * 0.4, 340), gw = Math.min(W * 0.8, 680);
      const gy = H * 0.6, gh = H * 0.22;
      const TOPE = 16;
      g.strokeStyle = '#ffffff10';
      g.lineWidth = 1;
      for (let v = 0; v <= TOPE; v += 4) {
        const y = gy + gh - (v / TOPE) * gh;
        g.beginPath(); g.moveTo(gx, y); g.lineTo(gx + gw, y); g.stroke();
        ctx.engine.text(String(v), gx - 14, y, { size: 9, color: '#ffffff33', font: 'system-ui', align: 'right' });
      }
      for (const j of [0, 1]) {
        const serie = datos[j];
        if (serie.length < 2) continue;
        g.strokeStyle = j === turno && fase === 'machacando' ? players[j].color : `${players[j].color}66`;
        g.lineWidth = j === turno ? 2.5 : 1.6;
        g.beginPath();
        serie.forEach((v, k) => {
          const x = gx + (k / Math.max(serie.length, SEGUNDOS * 60)) * gw;
          const y = gy + gh - clamp(v / TOPE, 0, 1) * gh;
          if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
        });
        g.stroke();
      }
      ctx.engine.text('CPS a lo largo del turno', W / 2, gy + gh + 16,
        { size: 10.5, color: '#ffffff44', font: 'system-ui' });

      /* Personajes: el del turno, grande y saltando con cada golpe. */
      for (const i of [0, 1]) {
        const activo = fase === 'machacando' && i === turno;
        const x = W / 2 + (i === 0 ? -1 : 1) * (activo ? W * 0.28 : W * 0.36);
        dibujarPersonaje(g, personajeDe(players[i], i), x, H * 0.52, activo ? H * 0.2 : H * 0.14, {
          pose: activo && sellos.length && tiempo - sellos[sellos.length - 1] < 0.09 ? 'salta' : 'quieto',
          acento: players[i].color,
          brillo: activo ? 20 : 0,
          alpha: activo ? 1 : 0.4,
          mirando: i === 0 ? 1 : -1,
        });
      }

      for (const c of chispas) {
        g.save();
        g.globalAlpha = clamp(c.vida * 2.2, 0, 1);
        g.fillStyle = c.col;
        g.fillRect(c.x - 2, c.y - 2, 4, 4);
        g.restore();
      }

      /* Números grandes del turno en marcha. */
      if (fase === 'machacando') {
        ctx.engine.text(reloj.toFixed(1), W / 2, H * 0.15, { size: 34, color: reloj <= 3 ? '#ff4757' : '#f2f2ff' });
        ctx.engine.text(cps.toFixed(1), W / 2, H * 0.34, { size: 62, color: players[turno].color, glow: 26 });
        ctx.engine.text('CPS AHORA', W / 2, H * 0.41, { size: 11, color: '#ffffff55', font: 'system-ui' });
        ctx.engine.text(`${total[turno]} clics · pico ${pico[turno].toFixed(1)}`, W / 2, H * 0.47,
          { size: 13, color: '#ffd166', font: 'system-ui' });
      } else if (fase === 'listo') {
        ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, W / 2, H * 0.34,
          { size: 24, color: players[turno].color });
        ctx.engine.text('Prepara el dedo… machaca la L en cuanto empiece', W / 2, H * 0.42,
          { size: 13, color: '#8f8fb0', font: 'system-ui' });
      } else {
        const j = fase === 'fin' ? -1 : turno;
        ctx.engine.text(j < 0 ? 'Se acabó' : `${players[j].name}: ${total[j]} clics`, W / 2, H * 0.34,
          { size: 24, color: j < 0 ? '#ffd166' : players[j].color });
        if (j >= 0) {
          ctx.engine.text(`pico ${pico[j].toFixed(1)} CPS · media ${media(j).toFixed(1)}`, W / 2, H * 0.42,
            { size: 14, color: '#8f8fb0', font: 'system-ui' });
        }
      }

      /* Marcador de los dos, siempre visible. */
      for (const i of [0, 1]) {
        ctx.engine.text(`${players[i].name} ${total[i]}`, i === 0 ? 18 : W - 18, 26, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      g.restore();
      ctx.engine.text('Diez segundos cada uno · una sola tecla: L · gana quien más clics meta',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
