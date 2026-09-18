/**
 * Duelo Táctil — un botón se enciende en la barra; el primero en tocarlo gana.
 *
 * La Touch Bar es ideal para esto: los dos jugadores tienen las manos sobre la
 * misma tira de cristal, así que el duelo es físico de verdad. La barra se
 * divide en dos mitades y el botón encendido aparece en una u otra al azar:
 * si se enciende en tu lado, es tuyo; si se enciende en el del otro, apártate.
 */

import { prepararPantalla } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 12;
const PARA_GANAR = 5;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let fase = 'espera';          // espera | activo | resuelto
  let espera = 0, pausa = 0;
  let celdaViva = -1;
  let duenoCelda = -1;          // de qué mitad es la celda encendida
  let tSenal = 0;
  const score = [0, 0];
  let desuscribir = null;
  let mejorMs = null;

  const mitadDe = (i) => (i < CELDAS / 2 ? 0 : 1);

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (fase === 'activo' && i === celdaViva) {
        celdas.push({ label: '●', bg: players[duenoCelda].color, color: '#000000', clase: 'viva' });
      } else {
        // Se tiñe muy suave cada mitad para que se vea el reparto del territorio.
        const m = mitadDe(i);
        celdas.push({ label: '', bg: m === 0 ? '#0f0a10' : '#0a0f12', clase: 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set(celdas.map((c, i) => ({
      type: 'button', id: `c${i}`,
      label: c.label || ' ',
      bg: fase === 'activo' && i === celdaViva ? players[duenoCelda].color : '#111111',
      color: '#000000',
    })));
  }

  function nuevaRonda() {
    fase = 'espera';
    espera = 1.2 + Math.random() * 3;
    celdaViva = -1;
    pintar();
    cab.decir('Prepárate… el botón puede salir en cualquier lado');
  }

  function encender() {
    fase = 'activo';
    celdaViva = Math.floor(Math.random() * CELDAS);
    duenoCelda = mitadDe(celdaViva);
    tSenal = performance.now();
    audio.countdown(0);
    haptics.play('impact');
    touchbar.haptic('heavy');
    pintar();
    cab.decir(`¡Toca! está en la mitad <b style="color:${players[duenoCelda].color}">${duenoCelda === 0 ? 'izquierda' : 'derecha'}</b>`);
  }

  function tocar(indice) {
    const quien = mitadDe(indice);

    if (fase === 'espera') {
      // Tocar antes de tiempo regala el punto.
      resolver(1 - quien, `${players[quien].name} tocó antes de tiempo`);
      return;
    }
    if (fase !== 'activo') return;

    espejo?.destello(indice, players[quien].color);
    if (indice !== celdaViva) {
      resolver(1 - quien, `${players[quien].name} falló el botón`);
      return;
    }
    const ms = Math.round(performance.now() - tSenal);
    if (mejorMs == null || ms < mejorMs) mejorMs = ms;
    resolver(quien, `${ms} ms`);
  }

  function resolver(ganador, motivo) {
    fase = 'resuelto';
    pausa = 1.5;
    score[ganador]++;
    cab.marcar(score[0], score[1]);
    cab.resaltar(ganador);
    cab.decir(`<b style="color:${players[ganador].color}">${players[ganador].name}</b> · ${motivo}`);
    audio.score(ganador);
    haptics.score(ganador);
    touchbar.haptic('medium');

    // La barra entera se tiñe del color del ganador durante un instante.
    const flash = Array.from({ length: CELDAS }, () => ({
      label: '', bg: players[ganador].color, clase: 'viva',
    }));
    espejo?.pintar(flash);
    if (disponible) {
      touchbar.set(flash.map((c, i) => ({
        type: 'button', id: `c${i}`, label: ' ', bg: players[ganador].color, color: '#000000',
      })));
    }
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Duelo Táctil', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      nuevaRonda();
    },

    update(dt) {
      if (!disponible) return;
      if (fase === 'resuelto') {
        pausa -= dt;
        if (pausa <= 0) {
          const g = score.findIndex((s) => s >= PARA_GANAR);
          if (g >= 0) {
            ctx.finish({
              winner: g, scores: [score[0], score[1]],
              detail: mejorMs != null ? `Mejor reacción: ${mejorMs} ms` : '',
              record: mejorMs != null && ctx.record('reaccion', mejorMs, 'low'),
            });
          } else nuevaRonda();
        }
        return;
      }
      if (fase === 'espera') {
        espera -= dt;
        if (espera <= 0) encender();
      } else if (fase === 'activo') {
        // Nadie toca en 2,5 s: ronda nula.
        if ((performance.now() - tSenal) / 1000 > 2.5) {
          fase = 'espera';
          espera = 0.8;
          celdaViva = -1;
          pintar();
          audio.back();
        }
      }
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
