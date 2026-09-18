/**
 * Nim — quita las cerillas que quieras de UNA fila y no te quedes la última.
 *
 * Es el juego resuelto por excelencia: existe una estrategia perfecta y se
 * puede aprender en una tarde. Por eso el tablero enseña el "resto" de cada
 * fila y no esconde nada — la gracia no es descubrir el truco a ciegas, es
 * pillarlo jugando y ver cómo el otro tarda dos partidas más.
 *
 * Se juega en versión misère: quien coge la última cerilla PIERDE. Cambia por
 * completo el final respecto al Nim normal, y el que se sabe el truco del
 * normal suele caer aquí.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const FILAS = [1, 3, 5, 7];
const ANCHO = 7;

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let filas = [];
  let tab = null, terminado = false, ultimo = '';

  function pintar(x, y) {
    const quedan = filas[y];
    const hay = x < quedan;
    const j = tab?.turno ?? 0;
    // Se resalta lo que se llevaría el jugador si confirma aquí.
    const seLleva = hay && tab && !terminado && tab.cursor.y === y && x >= tab.cursor.x;
    const col = players[j].color;
    const html = hay
      ? `<div class="cerilla" style="--c:${seLleva ? col : '#d9c9a0'};${seLleva ? 'opacity:.55' : ''}"></div>`
      : '';
    return { html, estilo: 'background:#1a1626;' };
  }

  function confirmar(x, y) {
    if (terminado) return;
    const j = tab.turno;
    const quedan = filas[y];
    if (x >= quedan) { audio.error(); haptics.error(j); return; }

    const cogidas = quedan - x;
    filas[y] = x;
    ultimo = `${players[j].name} coge ${cogidas} de la fila ${y + 1}`;
    audio.tone({ freq: 300 + cogidas * 60, dur: 0.08, gain: 0.15, type: 'square' });
    haptics.play('click', { player: j });

    if (filas.every((f) => f === 0)) {
      // Misère: el que se lleva la última, pierde.
      terminado = true;
      tab.bloqueado = true;
      tab.refrescar();
      audio.lose();
      haptics.defeat(j);
      ctx.finish({ winner: 1 - j, detail: `${players[j].name} se quedó la última cerilla` });
      return;
    }

    tab.cambiarTurno();
    tab.ponerCursor(0, filas.findIndex((f) => f > 0));
    pie();
  }

  function pie() {
    const resto = filas.map((f, i) => `fila ${i + 1}: <b>${f}</b>`).join(' · ');
    tab.pie(`${resto}${ultimo ? ` — ${ultimo}` : ''}`);
  }

  return {
    init() {
      filas = [...FILAS];
      tab = new Tablero(ctx, {
        cols: ANCHO, filas: FILAS.length, celda: 60,
        pintarCelda: pintar,
        onConfirmar: confirmar,
        onCursor: () => tab.refrescar(),
      });
      if (!document.getElementById('nim-css')) {
        const s = document.createElement('style');
        s.id = 'nim-css';
        s.textContent = `
          .cerilla { width:18%; height:74%; background:var(--c); border-radius:3px;
                     position:relative; box-shadow:0 2px 6px #0008; }
          .cerilla::before { content:''; position:absolute; left:-40%; top:-8%;
                     width:180%; height:22%; border-radius:50%; background:#ff6b3c; }
        `;
        document.head.appendChild(s);
      }
      tab.ponerCursor(0, 0);
      pie();
    },
    update(dt) { tab?.actualizar(dt); },
    destroy() { tab?.destruir(); },
  };
}
