/**
 * Memoria — encuentra parejas; si aciertas, repites turno.
 *
 * Las cartas usan emojis en vez de imágenes: sin descargas, se ven bien en
 * cualquier tamaño y son fáciles de distinguir de un vistazo, que es
 * justo lo que necesita un juego de memoria.
 */

import { Tablero } from '../../core/boardgame.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const COLS = 6, FILAS = 4;      // 24 cartas = 12 parejas

const SIMBOLOS = [
  'pizza', 'rocket', 'octopus', 'cactus', 'guitar', 'fox', 'mushroom', 'anchor', 'dice', 'dino',
  'moon', 'orb', 'melon', 'bee', 'target', 'icecube', 'saturn', 'trumpet',
];

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  let cartas = [];               // {simbolo, revelada, due}
  let tab = null;
  let volteadas = [];            // índices destapados este turno
  let esperando = 0;             // temporizador para tapar de nuevo
  const score = [0, 0];
  let intentos = [0, 0];
  let terminado = false;

  function repartir() {
    const total = (COLS * FILAS) / 2;
    const elegidos = [...SIMBOLOS].sort(() => ctx.rng() - 0.5).slice(0, total);
    const mazo = [...elegidos, ...elegidos].sort(() => ctx.rng() - 0.5);
    cartas = mazo.map((s) => ({ simbolo: s, revelada: false, due: null }));
  }

  const indice = (x, y) => y * COLS + x;

  function pintarCelda(x, y) {
    const c = cartas[indice(x, y)];
    const clases = ['mm-carta'];
    let html = '';
    let estilo = '';

    if (c.due != null) {
      clases.push('mm-resuelta');
      estilo = `background:${players[c.due].color}22;`;
      html = `<span class="mm-simbolo">${icon(c.simbolo, { size: 26 })}</span>`;
    } else if (c.revelada) {
      clases.push('mm-abierta');
      html = `<span class="mm-simbolo">${icon(c.simbolo, { size: 26 })}</span>`;
    } else {
      html = `<span class="mm-dorso">?</span>`;
    }
    return { html, clases, estilo };
  }

  function confirmar(x, y) {
    if (terminado || esperando > 0) return;
    const i = indice(x, y);
    const c = cartas[i];
    if (c.revelada || c.due != null) { audio.error(); haptics.error(tab.turno); return; }
    if (volteadas.length >= 2) return;

    c.revelada = true;
    volteadas.push(i);
    audio.blip();
    haptics.play('click', { player: tab.turno });
    tab.refrescar();

    if (volteadas.length === 2) {
      intentos[tab.turno]++;
      const [a, b] = volteadas.map((k) => cartas[k]);
      if (a.simbolo === b.simbolo) {
        a.due = b.due = tab.turno;
        score[tab.turno]++;
        volteadas = [];
        audio.capture();
        haptics.play('score', { player: tab.turno });
        tab.refrescar();
        actualizarPie('¡Pareja! Repites turno');
        if (cartas.every((k) => k.due != null)) return fin();
      } else {
        // Un segundo para memorizar antes de que se tapen.
        esperando = 1.1;
        audio.back();
        haptics.play('soft', { player: tab.turno });
      }
    }
  }

  function actualizarPie(extra = '') {
    const restantes = cartas.filter((c) => c.due == null).length / 2;
    tab.pie(`Parejas: <b>${score[0]}</b> — <b>${score[1]}</b> · quedan ${restantes}${extra ? ' · ' + extra : ''}`);
  }

  function fin() {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    const precision = intentos.map((n, i) => (n ? Math.round((score[i] / n) * 100) : 0));
    ctx.finish({
      winner: score[0] === score[1] ? -1 : score[0] > score[1] ? 0 : 1,
      scores: [score[0], score[1]],
      detail: `Acierto: ${precision[0]}% · ${precision[1]}%`,
    });
  }

  return {
    init() {
      inyectarEstilos();
      repartir();
      tab = new Tablero(ctx, {
        cols: COLS, filas: FILAS, celda: 82,
        pintarCelda,
        onConfirmar: confirmar,
        onCursor: () => tab.refrescar(),
      });
      actualizarPie();
    },

    update(dt) {
      if (esperando > 0) {
        esperando -= dt;
        if (esperando <= 0) {
          for (const i of volteadas) cartas[i].revelada = false;
          volteadas = [];
          tab.cambiarTurno();
          actualizarPie();
        }
        return;
      }
      tab?.actualizar(dt);
    },

    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('mm-css')) return;
  const s = document.createElement('style');
  s.id = 'mm-css';
  s.textContent = `
    .mm-carta { transition: background 200ms, transform 200ms var(--ease); }
    .mm-dorso {
      font-family: var(--font-display); font-size:.8em; color:var(--ink-faint);
      opacity:.5;
    }
    .mm-abierta { background:#ffffff1c !important; }
    .mm-simbolo { font-size:1.9em; animation: mm-flip 260ms var(--ease); }
    .mm-resuelta { opacity:.62; }
    @keyframes mm-flip {
      0% { transform: rotateY(90deg) scale(.6); opacity:0; }
      100% { transform: none; opacity:1; }
    }
  `;
  document.head.appendChild(s);
}
