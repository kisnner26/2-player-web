/**
 * Adivina en 3 Pistas — buzzer de deducción rápida.
 *
 * Las pistas van cayendo de una en una y valen menos cuanto más tarde
 * respondas: con la primera son 3 puntos, con la segunda 2 y con la tercera 1.
 * Ahí está toda la tensión — el que sabe la respuesta con la primera pista se
 * la juega a pulsar antes de estar seguro, porque si falla queda fuera de la
 * ronda y el otro se lleva el punto tranquilamente.
 *
 * Se responde eligiendo entre cuatro opciones y no escribiendo: escribir con
 * un solo teclado compartido y a contrarreloj sería un caos, y además obliga
 * a mirar las teclas en vez de la pantalla.
 *
 * El banco de palabras vive en games/datos/adivinanzas.js, compartido con
 * «Dilo Sin Decirlo».
 */

import { clamp } from '../../core/math2d.js';
import { barajar, CATEGORIAS_ADIVINA } from '../datos/adivinanzas.js';

export const meta = { render: 'canvas' };

const RONDAS = 8;
const SEGUNDOS_PISTA = 4.5;     // cada cuánto aparece la siguiente pista
const VALOR = [3, 2, 1];        // puntos según cuántas pistas hayan salido
const BLOQUEO = 1.0;            // no se puede pulsar en el primer segundo

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let bolsa = [];
  let actual = null;
  let opciones = [];
  let ronda = 0;
  let marcador = [0, 0];
  let pistasVisibles = 1;
  let reloj = 0;
  let estado = 'pistas';        // pistas | eligiendo | resuelto
  let quien = -1;               // quién pulsó el buzzer
  let seleccion = 0;
  let fuera = [false, false];   // quien falla queda fuera de la ronda
  let pausa = 0;
  let aviso = '';
  let avisoT = 0;
  let tiempo = 0;
  let destello = 0;

  const decir = (t, dur = 2.2) => { aviso = t; avisoT = dur; };

  function nuevaRonda() {
    if (!bolsa.length) bolsa = barajar(ctx.rng);
    actual = bolsa.pop();

    // Tres señuelos de la MISMA categoría: si fueran de categorías distintas
    // la primera pista ya descartaría tres opciones y no habría juego.
    const mismos = barajar(ctx.rng, [actual.c]).filter((a) => a.r !== actual.r).slice(0, 3);
    const rellenos = mismos.length === 3
      ? mismos
      : [...mismos, ...barajar(ctx.rng).filter((a) => a.r !== actual.r).slice(0, 3 - mismos.length)];
    opciones = [actual, ...rellenos];
    // Barajado propio del array de opciones (Fisher-Yates sobre 4 elementos).
    for (let i = opciones.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rng() * (i + 1));
      [opciones[i], opciones[j]] = [opciones[j], opciones[i]];
    }

    pistasVisibles = 1;
    reloj = 0;
    estado = 'pistas';
    quien = -1;
    seleccion = 0;
    fuera = [false, false];
    decir(`Ronda ${ronda + 1} · ${CATEGORIAS_ADIVINA[actual.c].nombre}`);
    audio.tone({ freq: 380, dur: 0.1, gain: 0.12, type: 'triangle' });
  }

  function pulsar(i) {
    if (estado !== 'pistas' || fuera[i] || reloj < BLOQUEO) return;
    quien = i;
    estado = 'eligiendo';
    seleccion = 0;
    audio.tone({ freq: 620, dur: 0.09, gain: 0.16, type: 'square', sweep: 180 });
    haptics.play('impact', { player: i });
    ctx.mando?.vibrar?.(i, 'toque');
    decir(`${players[i].name} responde`, 1.4);
  }

  function responder() {
    const acierto = opciones[seleccion]?.r === actual.r;
    if (acierto) {
      const puntos = VALOR[pistasVisibles - 1] ?? 1;
      marcador[quien] += puntos;
      estado = 'resuelto';
      pausa = 2.4;
      destello = 1;
      audio.win();
      haptics.play('score', { player: quien });
      decir(`¡${actual.r}! +${puntos} para ${players[quien].name}`, 2.4);
      particles.burst(W / 2, H * 0.42, 30, {
        speed: 260, dir: -Math.PI / 2, spread: Math.PI * 2,
        color: players[quien].color, size: 3, shape: 'spark', drag: 0.9,
      });
    } else {
      // Fallar deja fuera de ESTA ronda: el otro se queda con el camino libre.
      fuera[quien] = true;
      audio.error();
      haptics.play('impact', { player: quien });
      ctx.shake(4, 5);
      decir(`${players[quien].name} falló y queda fuera de la ronda`, 2);
      quien = -1;
      estado = fuera[0] && fuera[1] ? 'resuelto' : 'pistas';
      if (estado === 'resuelto') {
        pausa = 2.4;
        decir(`Nadie acertó · era ${actual.r}`, 2.4);
      }
    }
  }

  return {
    init() { nuevaRonda(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      avisoT = Math.max(0, avisoT - dt);
      destello = Math.max(0, destello - dt * 2);

      if (estado === 'resuelto') {
        pausa -= dt;
        if (pausa <= 0) {
          ronda++;
          if (ronda >= RONDAS) {
            ctx.finish({
              winner: marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1),
              scores: marcador,
            });
            return;
          }
          nuevaRonda();
        }
        return;
      }

      if (estado === 'pistas') {
        reloj += dt;
        // Las pistas se van soltando solas; cuando salen las tres, la ronda
        // sigue abierta pero ya solo vale un punto.
        if (pistasVisibles < 3 && reloj > SEGUNDOS_PISTA * pistasVisibles) {
          pistasVisibles++;
          audio.blip();
        }
        for (const i of [0, 1]) if (input.player(i).pressed('a')) pulsar(i);
        return;
      }

      /* Eligiendo: solo manda quien pulsó el buzzer. */
      const p = input.player(quien);
      if (p.pressed('left') || p.pressed('up')) { seleccion = (seleccion + 3) % 4; audio.blip(); }
      if (p.pressed('right') || p.pressed('down')) { seleccion = (seleccion + 1) % 4; audio.blip(); }
      if (p.pressed('a') || p.pressed('b')) responder();
    },

    render() {
      const g = ctx.c;
      g.fillStyle = '#0b0a16';
      g.fillRect(0, 0, W, H);

      if (destello > 0) {
        g.fillStyle = `rgba(255,255,255,${destello * 0.12})`;
        g.fillRect(0, 0, W, H);
      }

      const cat = CATEGORIAS_ADIVINA[actual?.c] || { nombre: '', color: '#ffffff' };

      /* Cabecera: ronda, categoría y marcador. */
      ctx.engine.text(`Ronda ${Math.min(ronda + 1, RONDAS)} de ${RONDAS}`, W / 2, 26, { size: 12.5, color: '#8f8fb0' });
      ctx.engine.text(cat.nombre.toUpperCase(), W / 2, 50, { size: 15, color: cat.color });

      for (const i of [0, 1]) {
        const x = i === 0 ? W * 0.12 : W * 0.88;
        ctx.engine.text(players[i].name, x, 30, { size: 12, color: players[i].color, font: 'system-ui' });
        ctx.engine.text(String(marcador[i]), x, 58, { size: 26, color: players[i].color });
        if (fuera[i]) ctx.engine.text('fuera', x, 76, { size: 10, color: '#ff4757', font: 'system-ui' });
      }

      /* Pistas: las ya reveladas en claro, las que faltan como huecos. */
      const oy = H * 0.2;
      const anchoP = Math.min(W * 0.78, 640);
      for (let i = 0; i < 3; i++) {
        const y = oy + i * (H * 0.09);
        const visible = i < pistasVisibles;
        g.fillStyle = visible ? '#ffffff0e' : '#ffffff05';
        const x = W / 2 - anchoP / 2;
        if (g.roundRect) { g.beginPath(); g.roundRect(x, y, anchoP, H * 0.072, 10); g.fill(); }
        else g.fillRect(x, y, anchoP, H * 0.072);
        g.strokeStyle = visible ? cat.color + '66' : '#ffffff10';
        g.lineWidth = 1;
        g.stroke();

        // El valor en puntos de responder AHORA, para que se vea lo que cuesta esperar.
        ctx.engine.text(visible ? `${VALOR[i]} pt` : '···', x + 30, y + H * 0.038,
          { size: 11, color: visible ? cat.color : '#3a3a55' });
        if (visible) {
          ctx.engine.text(actual.p[i], W / 2 + 16, y + H * 0.038,
            { size: 15, color: '#f2f2ff', font: 'system-ui' });
        }
      }

      /* Opciones: siempre a la vista, para que responder sea inmediato. */
      const oyOp = oy + 3 * (H * 0.09) + H * 0.05;
      const cw = anchoP / 2 - 8;
      const ch = H * 0.09;
      for (let i = 0; i < 4; i++) {
        const x = W / 2 - anchoP / 2 + (i % 2) * (cw + 16);
        const y = oyOp + Math.floor(i / 2) * (ch + 12);
        const elegida = estado === 'eligiendo' && i === seleccion;
        const correcta = estado === 'resuelto' && opciones[i]?.r === actual.r;

        g.fillStyle = correcta ? '#a8ff3e28' : elegida ? players[quien]?.color + '30' : '#ffffff08';
        if (g.roundRect) { g.beginPath(); g.roundRect(x, y, cw, ch, 10); g.fill(); }
        else g.fillRect(x, y, cw, ch);
        g.strokeStyle = correcta ? '#a8ff3e' : elegida ? players[quien].color : '#ffffff18';
        g.lineWidth = correcta || elegida ? 2.5 : 1;
        g.stroke();

        ctx.engine.text(opciones[i]?.r || '', x + cw / 2, y + ch / 2 + 6,
          { size: 16, color: correcta ? '#a8ff3e' : '#f2f2ff', font: 'system-ui' });
      }

      particles.render(g);

      /* Pie: qué hacer ahora mismo. */
      let pie = '';
      if (estado === 'pistas') {
        pie = reloj < BLOQUEO
          ? 'Preparados…'
          : 'El primero que pulse su tecla de acción responde';
      } else if (estado === 'eligiendo') {
        pie = `${players[quien].name}: elige con las direcciones y confirma con tu acción`;
      }
      if (pie) ctx.engine.text(pie, W / 2, H - 46, { size: 12.5, color: '#8f8fb0', font: 'system-ui' });
      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, H - 22, { size: 15, color: '#ffd166', font: 'system-ui' });
      }

      /* Barra de tiempo hasta la próxima pista. */
      if (estado === 'pistas' && pistasVisibles < 3) {
        const u = clamp((reloj - SEGUNDOS_PISTA * (pistasVisibles - 1)) / SEGUNDOS_PISTA, 0, 1);
        g.fillStyle = '#ffffff12';
        g.fillRect(W / 2 - anchoP / 2, oy - 14, anchoP, 3);
        g.fillStyle = cat.color;
        g.fillRect(W / 2 - anchoP / 2, oy - 14, anchoP * u, 3);
      }
    },
  };
}
