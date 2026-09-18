/**
 * Fila de Monedas — solo puedes coger de un extremo, y ahí está el problema.
 *
 * Parece que basta con pillar siempre la moneda más gorda, y es justo lo que
 * pierde partidas: al retirarla dejas al descubierto la siguiente, así que
 * media jugada es mirar qué le REGALAS al otro.
 *
 * La fila se genera con valores desiguales a propósito, con algún cero
 * envenenado en medio. Con dieciséis monedas hay estrategia óptima, pero no
 * cabe en la cabeza a esa velocidad: se juega mirando dos jugadas por delante
 * y confiando en que el otro solo mire una.
 */

import { Tablero } from '../../core/boardgame.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const MONEDAS = 16;

export function create(ctx) {
  const { audio, haptics, players, rng } = ctx;

  let fila = [], izq = 0, der = 0;
  let bote = [0, 0], tomadas = [[], []];
  let tab = null, terminado = false;

  function pintar(x) {
    const dentro = x >= izq && x <= der;
    if (!dentro) {
      // Fuera de la fila viva: se ve de quién fue la moneda.
      const quien = tomadas[0].includes(x) ? 0 : tomadas[1].includes(x) ? 1 : -1;
      const col = quien >= 0 ? players[quien].color : '#2a2a3c';
      return { html: `<div class="moneda ida" style="--c:${col}">${fila[x]}</div>`, estilo: 'background:#12111c;' };
    }
    const extremo = x === izq || x === der;
    const html = `<div class="moneda${extremo ? ' viva' : ''}" style="--c:${extremo ? '#ffd166' : '#8a7f5a'}">${fila[x]}</div>`;
    return { html, clases: extremo ? ['legal'] : [], estilo: `background:${extremo ? '#2c2718' : '#1a1826'};` };
  }

  function confirmar(x) {
    if (terminado) return;
    const j = tab.turno;
    if (x !== izq && x !== der) {
      audio.error();
      haptics.error(j);
      tab.pie('Solo puedes coger de un extremo de la fila');
      return;
    }
    bote[j] += fila[x];
    tomadas[j].push(x);
    if (x === izq) izq++; else der--;
    audio.pickup();
    haptics.play('score', { player: j });

    if (izq > der) {
      terminado = true;
      tab.bloqueado = true;
      tab.refrescar();
      const g = bote[0] === bote[1] ? -1 : (bote[0] > bote[1] ? 0 : 1);
      audio.win();
      ctx.finish({
        winner: g, scores: bote,
        detail: `${bote[0]} contra ${bote[1]}`,
        record: ctx.record('bote', Math.max(...bote), 'high'),
      });
      return;
    }

    tab.cambiarTurno();
    tab.ponerCursor(izq, 0);
    pie();
  }

  function pie() {
    const quedan = fila.slice(izq, der + 1).reduce((a, b) => a + b, 0);
    tab.pie(
      `<b style="color:${players[0].color}">${bote[0]}</b> — <b style="color:${players[1].color}">${bote[1]}</b>` +
      ` · quedan ${quedan} puntos en la mesa`,
    );
  }

  return {
    init() {
      // Valores muy desiguales y algún cero: sin eso, la fila se juega sola.
      fila = Array.from({ length: MONEDAS }, () => {
        const r = rng();
        if (r < 0.12) return 0;
        if (r < 0.3) return 1 + Math.floor(rng() * 3);
        if (r < 0.8) return 4 + Math.floor(rng() * 7);
        return 11 + Math.floor(rng() * 9);
      });
      izq = 0;
      der = MONEDAS - 1;
      bote = [0, 0];
      tomadas = [[], []];
      tab = new Tablero(ctx, {
        cols: MONEDAS, filas: 1, celda: 60,
        pintarCelda: (x) => pintar(x),
        onConfirmar: (x) => confirmar(x),
      });
      if (!document.getElementById('monedas-css')) {
        const s = document.createElement('style');
        s.id = 'monedas-css';
        s.textContent = `
          .moneda { width:82%; aspect-ratio:1; border-radius:50%; display:grid; place-items:center;
                    background:radial-gradient(circle at 35% 30%, #fff6, transparent 60%), var(--c);
                    color:#20180a; font-family:var(--font-display); font-size:14px;
                    box-shadow:inset 0 -3px 6px #0005, 0 2px 6px #0008; }
          .moneda.viva { animation:pop 240ms var(--ease); }
          .moneda.ida { opacity:.4; transform:scale(.8); }
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
