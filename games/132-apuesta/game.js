/**
 * La Apuesta — di cuántos clics vas a meter, y luego mételos.
 *
 * Antes de cada asalto anuncias una cifra. Si la alcanzas en cinco segundos, te
 * llevas esos puntos enteros; si te quedas a uno, te llevas cero. Tres asaltos
 * cada uno, alternando, y el que apuesta segundo ve lo que hizo el otro.
 *
 * Aquí no gana el que más rápido machaca, gana el que mejor se conoce. Apostar
 * treinta y clavarlo vale más que apostar cincuenta y quedarse en cuarenta y
 * ocho — y cuando vas perdiendo en el último asalto no queda más remedio que
 * pasarte de valiente, que es exactamente lo que hace divertido el final.
 *
 * Dos teclas y las dos son letras, como el resto de los juegos de machaque: la
 * R sube la apuesta (mantenida corre sola, y al pasarse vuelve al mínimo) y la
 * L la cierra. Cerrar y empezar es el mismo gesto: ese primer golpe de L ya
 * cuenta, así que no hay ni cuenta atrás ni tiempo muerto.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const ASALTOS = 3;
const SEGUNDOS = 5;
const MIN = 10, MAX = 70;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  let W = ctx.W, H = ctx.H;
  let asalto = 0;
  let turno = 0;
  let fase = 'apostando';       // apostando | machacando | resultado | fin
  let espera = 0;
  let reloj = 0;
  let tiempo = 0;

  let apuesta = 30;
  let clics = 0;
  const puntos = [0, 0];
  const historial = [[], []];   // { apuesta, clics, logrado }
  let sacudida = 0;
  let destello = 0;
  const chispas = [];
  let aviso = '', avisoT = 0;
  let ultimoClic = -1;
  /* Margen de seguridad al entrar en la apuesta: si el jugador anterior venía
     machacando, su inercia no debe cerrar la apuesta del siguiente. */
  let bloqueo = 0;
  let repite = 0;               // tiempo que lleva sostenida la R

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };

  function pulsar() {
    if (fase !== 'machacando') return;
    clics++;
    ultimoClic = tiempo;
    const col = players[turno].color;
    for (let i = 0; i < 3; i++) {
      const a = ctx.rng() * TAU;
      chispas.push({
        x: W / 2, y: H * 0.46,
        vx: Math.cos(a) * (150 + ctx.rng() * 280),
        vy: Math.sin(a) * (150 + ctx.rng() * 280),
        vida: 0.4, col,
      });
    }
    sacudida = Math.min(5, sacudida + 1);
    destello = 0.35;
    // El tono sube según te acercas a tu apuesta: se oye la cuenta atrás.
    audio.tone({ freq: 240 + (clics / apuesta) * 520, dur: 0.03, gain: 0.1, type: 'square' });
    haptics.play('tap', { player: turno });
    ctx.mando?.vibrar?.(turno, 'tecla');
    if (clics === apuesta) {
      audio.arp([700, 950, 1300], 0.05);
      haptics.play('score', { player: turno });
      ctx.mando?.vibrar?.(turno, 'punto');
    }
  }

  /** Sube la apuesta un punto; al pasarse del techo, vuelve al mínimo. */
  function subirApuesta() {
    apuesta = apuesta >= MAX ? MIN : apuesta + 1;
    audio.blip();
  }

  function empezarApuesta() {
    fase = 'apostando';
    clics = 0;
    bloqueo = 0.5;
    repite = 0;
    // La apuesta arranca donde la dejaste la última vez: se corrige, no se
    // vuelve a empezar de cero cada asalto.
    const previo = historial[turno][historial[turno].length - 1];
    apuesta = previo ? clamp(previo.logrado ? previo.apuesta + 4 : previo.clics, MIN, MAX) : 30;
    for (const i of [0, 1]) {
      ctx.mando?.perfil?.(i, {
        disposicion: 'dual',
        juego: 'La Apuesta',
        pie: i === turno ? 'Sube la apuesta y ciérrala' : 'Espera tu turno',
        // En el iPad las dos letras se convierten en dos botones: subir y cerrar.
        controles: [
          { tipo: 'acciones', botones: [{ a: 'b', etiqueta: 'SUBIR', glifo: '▲' }] },
          { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'CERRAR Y MACHACAR', glifo: '⚡' }] },
        ],
      });
    }
  }

  function lanzar() {
    fase = 'machacando';
    reloj = SEGUNDOS;
    clics = 0;
    audio.tone({ freq: 760, dur: 0.16, gain: 0.22, type: 'triangle' });
    ctx.mando?.perfil?.(turno, {
      disposicion: 'solo',
      juego: 'La Apuesta',
      pie: `¡${apuesta} clics!`,
      controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'YA', glifo: '⚡' }] }],
    });
  }

  function resolverAsalto() {
    const logrado = clics >= apuesta;
    historial[turno].push({ apuesta, clics, logrado });
    if (logrado) {
      puntos[turno] += apuesta;
      decir(`¡${apuesta} clavados! +${apuesta}`, 2.4);
      audio.win();
      haptics.play('victory', { player: turno });
      for (let i = 0; i < 30; i++) {
        const a = ctx.rng() * TAU;
        chispas.push({
          x: W / 2, y: H * 0.42,
          vx: Math.cos(a) * (200 + ctx.rng() * 300),
          vy: Math.sin(a) * (200 + ctx.rng() * 300),
          vida: 1, col: ['#ffd166', '#a8ff3e', players[turno].color][i % 3],
        });
      }
      ctx.shake(7, 11);
    } else {
      decir(`${clics} de ${apuesta}… te quedaste a ${apuesta - clics}`, 2.4);
      audio.lose();
      haptics.play('defeat', { player: turno });
      ctx.mando?.vibrar?.(turno, 'error');
    }
    fase = 'resultado';
    espera = 2.8;
  }

  function siguiente() {
    if (turno === 0) { turno = 1; empezarApuesta(); return; }
    turno = 0;
    asalto++;
    if (asalto >= ASALTOS) {
      fase = 'fin';
      const [a, b] = puntos;
      const clavadas = (j) => historial[j].filter((x) => x.logrado).length;
      ctx.finish({
        winner: a === b ? -1 : (a > b ? 0 : 1),
        scores: [a, b],
        detail: `Apuestas clavadas: ${clavadas(0)} y ${clavadas(1)} de ${ASALTOS}`,
        record: ctx.record('apuesta', Math.max(a, b), 'high'),
      });
      return;
    }
    empezarApuesta();
  }

  /**
   * La L hace las dos cosas: si estás apostando, cierra la apuesta y ese mismo
   * golpe ya cuenta como el primer clic; si ya estás machacando, suma.
   */
  function tocarL() {
    if (fase === 'apostando') {
      if (bloqueo > 0) return;
      lanzar();
      pulsar();
      return;
    }
    pulsar();
  }

  let soltarL = () => {};
  let soltarR = () => {};

  return {
    init() {
      soltarL = input.on('KeyL', tocarL);
      // La R es libre durante la partida: el shell solo la usa para reiniciar
      // cuando el juego está en pausa o terminado, nunca mientras se juega.
      soltarR = input.on('KeyR', () => { if (fase === 'apostando') subirApuesta(); });
      empezarApuesta();
    },
    destroy() { soltarL(); soltarR(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      sacudida = Math.max(0, sacudida - dt * 10);
      destello = Math.max(0, destello - dt * 3);
      if (avisoT > 0) avisoT -= dt;
      for (const c of chispas) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 620 * dt; c.vida -= dt; }
      for (let i = chispas.length - 1; i >= 0; i--) if (chispas[i].vida <= 0) chispas.splice(i, 1);

      const p = input.player(turno);
      // Los botones del iPad solo se atienden a quien juegue con mando: en el
      // teclado mandan las letras y nada más.
      const mando = p.conMando;

      if (fase === 'apostando') {
        bloqueo = Math.max(0, bloqueo - dt);
        // Mantener la R corre la cifra: primero un respiro y luego seguido.
        if (input.keyHeld('KeyR')) {
          repite += dt;
          if (repite > 0.4 && Math.floor(repite * 22) !== Math.floor((repite - dt) * 22)) subirApuesta();
        } else repite = 0;
        if (mando && p.pressed('b')) subirApuesta();
        if (mando && p.pressed('a') && bloqueo <= 0) { lanzar(); pulsar(); }
        return;
      }

      if (fase === 'machacando') {
        if (mando && p.pressed('a')) pulsar();
        reloj -= dt;
        if (reloj <= 0) { reloj = 0; resolverAsalto(); }
        return;
      }

      if (fase === 'resultado') {
        espera -= dt;
        if (espera <= 0) siguiente();
      }
    },

    render() {
      const g = ctx.c;
      const sx = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      const sy = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      g.save();
      g.translate(sx, sy);

      ctx.engine.clear('#080610');
      const halo = g.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, H * 0.9);
      halo.addColorStop(0, `${players[turno].color}18`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);
      if (destello > 0) {
        g.fillStyle = `rgba(255,255,255,${destello * 0.14})`;
        g.fillRect(0, 0, W, H);
      }

      ctx.engine.text(`ASALTO ${Math.min(asalto + 1, ASALTOS)} DE ${ASALTOS}`, W / 2, 30,
        { size: 14, color: '#ffd166' });

      /* Barra de progreso hacia la apuesta: la única lectura que importa. */
      if (fase === 'machacando' || fase === 'resultado') {
        const bw = Math.min(W * 0.7, 560), bx = W / 2 - bw / 2, by = H * 0.62;
        const u = clamp(clics / apuesta, 0, 1);
        g.fillStyle = '#ffffff10';
        g.fillRect(bx, by, bw, 26);
        g.save();
        g.shadowColor = u >= 1 ? '#a8ff3e' : players[turno].color;
        g.shadowBlur = 20;
        g.fillStyle = u >= 1 ? '#a8ff3e' : players[turno].color;
        g.fillRect(bx, by, bw * u, 26);
        g.restore();
        // La meta, marcada con una línea: se ve cuánto falta sin leer números.
        g.strokeStyle = '#ffd166';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(bx + bw, by - 8);
        g.lineTo(bx + bw, by + 34);
        g.stroke();
        ctx.engine.text(`${clics} / ${apuesta}`, W / 2, by - 24,
          { size: 30, color: u >= 1 ? '#a8ff3e' : '#f2f2ff' });
      }

      for (const i of [0, 1]) {
        const activo = i === turno;
        dibujarPersonaje(g, personajeDe(players[i], i), W / 2 + (i === 0 ? -1 : 1) * W * 0.3, H * 0.55,
          activo ? H * 0.2 : H * 0.14, {
            pose: activo && fase === 'machacando' && tiempo - ultimoClic < 0.09 ? 'salta' : 'quieto',
            acento: players[i].color,
            brillo: activo ? 20 : 0,
            alpha: activo ? 1 : 0.4,
            mirando: i === 0 ? 1 : -1,
          });
      }

      for (const c of chispas) {
        g.save();
        g.globalAlpha = clamp(c.vida * 1.8, 0, 1);
        g.fillStyle = c.col;
        g.fillRect(c.x - 2, c.y - 2, 4, 4);
        g.restore();
      }

      if (fase === 'apostando') {
        ctx.engine.text(`${players[turno].name.toUpperCase()}, ¿CUÁNTOS?`, W / 2, H * 0.24,
          { size: 22, color: players[turno].color });
        ctx.engine.text(String(apuesta), W / 2, H * 0.4, { size: 82, color: '#ffd166', glow: 26 });
        ctx.engine.text(`clics en ${SEGUNDOS} segundos · eso son ${(apuesta / SEGUNDOS).toFixed(1)} CPS`,
          W / 2, H * 0.48, { size: 13, color: '#8f8fb0', font: 'system-ui' });
        ctx.engine.text('R para subir (mantenla y corre sola) · L para cerrar y empezar',
          W / 2, H * 0.86, { size: 12.5, color: '#8f8fb0', font: 'system-ui' });
      } else if (fase === 'machacando') {
        ctx.engine.text(reloj.toFixed(1), W / 2, H * 0.22, { size: 40, color: reloj <= 1.5 ? '#ff4757' : '#f2f2ff' });
        ctx.engine.text('¡MACHACA LA L!', W / 2, H * 0.32, { size: 20, color: players[turno].color });
      } else if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, H * 0.3, { size: 20, color: '#ffd166', font: 'system-ui' });
      }

      /* Historial: las apuestas de cada uno, clavadas o falladas. */
      for (const i of [0, 1]) {
        const base = i === 0 ? 18 : W - 18;
        ctx.engine.text(`${players[i].name} ${puntos[i]}`, base, 56, {
          size: 15, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
        historial[i].forEach((h, k) => {
          ctx.engine.text(`${h.logrado ? '✓' : '✗'} ${h.apuesta}`, base, 78 + k * 18, {
            size: 12, color: h.logrado ? '#a8ff3e' : '#ff4757',
            align: i === 0 ? 'left' : 'right', font: 'system-ui',
          });
        });
      }

      g.restore();
      ctx.engine.text('R sube la apuesta · L la cierra y ya cuenta como primer clic · si te quedas corto, cero',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
