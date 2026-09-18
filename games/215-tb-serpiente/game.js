/**
 * Serpiente Táctil — la serpiente de siempre, pero en una sola dimensión.
 *
 * La barra es un anillo: al salir por un extremo se entra por el otro. La
 * serpiente avanza sola y lo único que se puede hacer es DARSE LA VUELTA, así
 * que el juego es un problema de espacio puro — cada trozo que creces es un
 * trozo del anillo que ya no puedes cruzar.
 *
 * Se juega por turnos porque la barra es una sola. Gana quien aguante más
 * comida antes de morderse a sí mismo.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const CELDAS = 20;
const PASO_BASE = 0.42;        // segundos por casilla al empezar
const PASO_MIN = 0.13;

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false, desuscribir = null;
  let cuerpo = [], dir = 1, comida = 0, reloj = 0, paso = PASO_BASE;
  let turno = 0, fase = 'jugando', pausa = 0;
  const comidas = [0, 0], mejor = [0, 0];

  function nuevaPartida() {
    cuerpo = [4, 3, 2];
    dir = 1;
    paso = PASO_BASE;
    reloj = paso;
    ponerComida();
    fase = 'jugando';
    cab.resaltar(turno);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · toca la barra para darte la vuelta`);
    pintar();
  }

  function ponerComida() {
    let c;
    do { c = Math.floor(Math.random() * CELDAS); } while (cuerpo.includes(c));
    comida = c;
  }

  function pintar() {
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      const k = cuerpo.indexOf(i);
      if (k === 0) celdas.push({ label: dir > 0 ? '▶' : '◀', bg: '#ffffff', color: '#000000', clase: 'viva' });
      else if (k > 0) {
        // El cuerpo se apaga hacia la cola: se ve por dónde vas a liberar sitio.
        const f = 1 - k / Math.max(6, cuerpo.length);
        celdas.push({ label: '', bg: mezclar(players[turno].color, f) });
      } else if (i === comida) celdas.push({ label: '●', bg: '#ffd166', color: '#000000' });
      else celdas.push({ label: '', bg: '#0d0d12', clase: 'tenue' });
    }
    espejo?.pintar(celdas);
    if (!disponible) return;
    touchbar.set([
      indicadorTurno(players, turno),
      ...celdas.map((c, i) => ({
        type: 'button', id: `c${i}`, label: c.label || ' ', bg: c.bg, color: c.color || '#000000',
      })),
    ]);
  }

  /** Oscurece el color del jugador según lo lejos que esté de la cabeza. */
  function mezclar(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const g = (v) => Math.round(v * (0.32 + f * 0.68));
    return `rgb(${g((n >> 16) & 255)},${g((n >> 8) & 255)},${g(n & 255)})`;
  }

  function morir(motivo) {
    fase = 'muerta';
    pausa = 1.9;
    mejor[turno] = Math.max(mejor[turno], comidas[turno]);
    cab.marcar(mejor[0], mejor[1]);
    cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> · ${motivo} · ${comidas[turno]} comidas`);
    audio.lose();
    haptics.defeat(turno);
    touchbar.haptic('heavy');
    espejo?.destello(cuerpo[0], '#ff2e2e');
  }

  function avanzar() {
    const cabeza = (cuerpo[0] + dir + CELDAS) % CELDAS;
    // Morderse: única forma de perder, y llega sola al crecer.
    if (cuerpo.includes(cabeza)) { morir('te muerdes'); return; }
    cuerpo.unshift(cabeza);
    if (cabeza === comida) {
      comidas[turno]++;
      cuerpo.push(cuerpo[cuerpo.length - 1]);   // crece dos: se nota
      paso = Math.max(PASO_MIN, paso * 0.94);
      ponerComida();
      audio.pickup();
      haptics.score(turno);
      touchbar.haptic('medium');
      if (cuerpo.length >= CELDAS - 1) { morir('¡anillo completo!'); return; }
    } else {
      cuerpo.pop();
    }
    pintar();
  }

  return {
    async init() {
      const p = await prepararPantalla(ctx, { titulo: 'Serpiente', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);
      if (!disponible) return;
      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || ev.id === '_turno' || fase !== 'jugando') return;
        dir = -dir;
        audio.blip();
        touchbar.haptic('light');
        pintar();
      });
      nuevaPartida();
    },

    update(dt) {
      if (!disponible) return;

      if (fase === 'muerta') {
        pausa -= dt;
        if (pausa > 0) return;
        if (turno === 0) { turno = 1; nuevaPartida(); return; }
        const [a, b] = mejor;
        ctx.finish({
          winner: a === b ? -1 : a > b ? 0 : 1,
          scores: [a, b],
          detail: `${a} y ${b} comidas en un anillo de ${CELDAS}`,
          record: ctx.record('comidas', Math.max(a, b), 'high'),
        });
        return;
      }

      reloj -= dt;
      if (reloj <= 0) { reloj = paso; avanzar(); }
    },

    destroy() {
      desuscribir?.();
      touchbar.clear();
    },
  };
}
