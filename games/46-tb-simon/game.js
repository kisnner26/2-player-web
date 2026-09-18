/**
 * Simón Táctil — la barra enciende una secuencia y hay que repetirla tocando.
 *
 * Sobre la Touch Bar el juego cambia respecto al de teclado: aquí la secuencia
 * es espacial (doce posiciones a lo largo de una tira de 30 cm), no de
 * cuatro colores. Se memoriza con el cuerpo, no con la vista, y por eso se puede
 * llegar a secuencias sorprendentemente largas.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 12;
const COLORES = ['#ff2e5b', '#ff7847', '#ff9f1c', '#ffd166', '#a8ff3e', '#2ec4b6',
                 '#3effc8', '#00e5ff', '#3a86ff', '#7b5cff', '#b04cff', '#ff6ec7'];
const NOTAS = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659, 698, 784];

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let secuencia = [];
  let fase = 'mostrando';       // mostrando | repitiendo | entreRonda | fallo
  let idxMostrar = 0;
  let tMostrar = 0;
  let encendida = -1;
  let turno = 0;
  let paso = 0;
  const aciertos = [0, 0];
  let ganador = -1;
  let pausa = 0;
  let desuscribir = null;

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const on = encendida === i;
      celdas.push({
        label: '',
        bg: on ? COLORES[i] : sombrear(COLORES[i]),
        clase: on ? 'viva' : 'tenue',
      });
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    const botones = celdas.map((c, i) => ({
      type: 'button', id: `s${i}`, label: ' ', bg: c.bg, color: '#000000',
    }));
    // El indicador de turno solo tiene sentido mientras se repite: durante
    // la fase de mostrar la secuencia nadie está "jugando" todavía.
    touchbar.set(fase === 'repitiendo' ? [indicadorTurno(players, turno), ...botones] : botones);
  }

  /** Versión muy oscura del color: la barra apagada sigue insinuando su tono. */
  function sombrear(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) * 0.16, g = ((n >> 8) & 255) * 0.16, b = (n & 255) * 0.16;
    return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  }

  function nuevaRonda() {
    secuencia.push(Math.floor(Math.random() * CELDAS));
    fase = 'mostrando';
    idxMostrar = 0;
    tMostrar = 0.55;
    encendida = -1;
    paso = 0;
    turno = 0;
    cab.decir(`Secuencia de <b>${secuencia.length}</b> · observa`);
    cab.resaltar(-1);
    pintar();
  }

  function encender(i, dur) {
    encendida = i;
    audio.tone({ freq: NOTAS[i], dur: dur * 0.85, gain: 0.18, type: 'square' });
    haptics.play('tap');
    touchbar.haptic('light');
    pintar();
  }

  function tocar(i) {
    if (fase !== 'repitiendo') return;
    espejo?.destello(i, COLORES[i]);
    encender(i, 0.18);
    setTimeout(() => { if (encendida === i) { encendida = -1; pintar(); } }, 170);

    if (i === secuencia[paso]) {
      paso++;
      aciertos[turno]++;
      cab.marcar(aciertos[0], aciertos[1]);
      if (paso < secuencia.length) return;

      if (turno === 0) {
        turno = 1;
        paso = 0;
        cab.resaltar(1);
        cab.decir(`Ahora <b style="color:${players[1].color}">${players[1].name}</b>`);
        audio.select();
      } else {
        fase = 'entreRonda';
        pausa = 0.9;
        audio.arp([523, 659, 784]);
        haptics.play('score');
        cab.decir('¡Los dos! La secuencia crece');
      }
      return;
    }

    // Fallo
    fase = 'fallo';
    pausa = 1.8;
    ganador = 1 - turno;
    audio.lose();
    haptics.defeat(turno);
    touchbar.haptic('heavy');
    cab.resaltar(ganador);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> falló en el paso ${paso + 1}`);
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Simón Táctil', segmentos: CELDAS });
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

      if (fase === 'fallo') {
        pausa -= dt;
        if (pausa <= 0) {
          ctx.finish({
            winner: ganador,
            scores: [aciertos[0], aciertos[1]],
            detail: `Secuencia de ${secuencia.length} posiciones`,
            record: ctx.record('secuencia', secuencia.length, 'high'),
          });
        }
        return;
      }
      if (fase === 'entreRonda') {
        pausa -= dt;
        if (pausa <= 0) nuevaRonda();
        return;
      }
      if (fase !== 'mostrando') return;

      tMostrar -= dt;
      if (tMostrar > 0) return;

      if (encendida >= 0) {
        encendida = -1;
        pintar();
        tMostrar = 0.13;
        if (idxMostrar >= secuencia.length) {
          fase = 'repitiendo';
          turno = 0;
          paso = 0;
          cab.resaltar(0);
          cab.decir(`Repite la secuencia · <b style="color:${players[0].color}">${players[0].name}</b> primero`);
          audio.select();
        }
        return;
      }
      if (idxMostrar < secuencia.length) {
        // La secuencia se acelera al crecer, igual que el Simón original.
        const dur = Math.max(0.2, 0.5 - secuencia.length * 0.012);
        encender(secuencia[idxMostrar], dur);
        idxMostrar++;
        tMostrar = dur;
      }
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
