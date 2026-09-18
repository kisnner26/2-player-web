/**
 * Relevos Táctiles — carrera de relevos sobre la barra.
 *
 * El testigo avanza celda a celda: cada toque lo empuja una posición, pero
 * SOLO puede tocarlo quien lo tiene. Cuando cruza la línea de cambio (el
 * centro), el testigo pasa al otro jugador y ahora le toca a él empujarlo
 * hasta el final. Luego vuelve. Tres relevos completos.
 *
 * Es cooperativo pero con reparto claro: si tocas cuando no te toca, el
 * testigo retrocede. Obliga a mirar de reojo y a avisar el cambio.
 */

import { prepararPantalla } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 18;
const RELEVOS = 3;
const TIEMPO = 45;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false;
  let pos = 0;                 // celda del testigo
  let portador = 0;            // quién lo lleva ahora
  let relevo = 1;
  let sentido = 1;             // 1 = hacia la derecha, -1 = de vuelta
  let tiempo = TIEMPO;
  let fase = 'jugando';
  const toques = [0, 0];
  let penalizaciones = 0;
  let desuscribir = null;

  const mitadDe = (i) => (i < CELDAS / 2 ? 0 : 1);

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (i === pos) {
        celdas.push({ label: '◆', bg: players[portador].color, color: '#000000', clase: 'viva' });
      } else if (i === Math.floor(CELDAS / 2)) {
        // Línea de cambio, siempre visible
        celdas.push({ label: '|', bg: '#3a3a48', color: '#ffffff' });
      } else {
        const m = mitadDe(i);
        // Se ilumina la zona de quien lleva el testigo ahora.
        const activa = m === portador;
        celdas.push({ label: '', bg: activa ? players[m].color + '33' : '#101018', clase: activa ? '' : 'tenue' });
      }
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set(celdas.map((c, i) => ({
      type: 'button', id: `r${i}`,
      label: c.label || ' ',
      bg: i === pos ? players[portador].color : mitadDe(i) === portador ? '#242430' : '#101018',
      color: '#000000',
    })));
  }

  function texto() {
    cab.decir(
      `Relevo <b>${relevo}</b>/${RELEVOS} · lleva el testigo ` +
      `<b style="color:${players[portador].color}">${players[portador].name}</b> · ` +
      `${tiempo.toFixed(0)}s`
    );
    cab.resaltar(portador);
  }

  function tocar(i) {
    if (fase !== 'jugando') return;
    const quien = mitadDe(i);

    if (quien !== portador) {
      // Tocar cuando no llevas el testigo lo hace retroceder.
      pos = Math.max(0, Math.min(CELDAS - 1, pos - sentido));
      penalizaciones++;
      audio.error();
      haptics.error(quien);
      touchbar.haptic('medium');
      pintar(); texto();
      return;
    }

    toques[quien]++;
    pos += sentido;
    espejo?.destello(Math.max(0, Math.min(CELDAS - 1, pos)), players[quien].color);
    audio.tone({ freq: 300 + quien * 90, dur: 0.04, gain: 0.11, type: 'square' });
    haptics.play('tap', { player: quien });
    touchbar.haptic('light');

    const centro = Math.floor(CELDAS / 2);
    // Cambio de portador al cruzar el centro
    if (sentido === 1 && pos >= centro && portador === 0) {
      portador = 1;
      audio.select(); touchbar.haptic('heavy');
      cab.decir(`¡Cambio! Ahora <b style="color:${players[1].color}">${players[1].name}</b>`);
    } else if (sentido === -1 && pos <= centro && portador === 1) {
      portador = 0;
      audio.select(); touchbar.haptic('heavy');
      cab.decir(`¡Cambio! Ahora <b style="color:${players[0].color}">${players[0].name}</b>`);
    }

    // Fin de tramo
    if (sentido === 1 && pos >= CELDAS - 1) {
      sentido = -1; portador = 1;
      audio.arp([440, 550, 660], 0.1);
      cab.decir('¡Vuelta! De regreso');
    } else if (sentido === -1 && pos <= 0) {
      relevo++;
      if (relevo > RELEVOS) return terminar(true);
      sentido = 1; portador = 0;
      audio.win();
      cab.decir(`Relevo ${relevo} de ${RELEVOS}`);
    }

    cab.marcar(toques[0], toques[1]);
    pintar();
  }

  function terminar(exito) {
    if (fase === 'fin') return;
    fase = 'fin';
    if (exito) { audio.win(); haptics.play('victory'); }
    else { audio.lose(); haptics.play('defeat'); }
    const usado = TIEMPO - tiempo;
    ctx.finish({
      winner: -1,
      scores: [toques[0], toques[1]],
      detail: exito
        ? `${RELEVOS} relevos en ${usado.toFixed(1)}s · ${penalizaciones} penalización(es)`
        : `Se quedaron en el relevo ${relevo}`,
      record: exito && ctx.record('tiempo', Math.round(usado * 10) / 10, 'low'),
    });
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Relevos Táctiles', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click') return;
        const i = parseInt(ev.id.slice(1), 10);
        if (!Number.isNaN(i)) tocar(i);
      });
      texto(); pintar();
    },

    update(dt) {
      if (!disponible || fase !== 'jugando') return;
      tiempo -= dt;
      if (tiempo <= 0) return terminar(false);
      texto();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}
