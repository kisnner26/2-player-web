/**
 * Ajedrez — interfaz. Las reglas viven en `reglas.js`, sin nada de DOM.
 *
 * Esa separación no es cosmética: permite validar el motor con `perft`, el
 * test estándar del ajedrez por ordenador. Las seis posiciones de referencia
 * (inicial, Kiwipete y las posiciones 3 a 6) dan los números publicados, así
 * que el enroque, la captura al paso, la coronación y las clavadas están
 * comprobados, no solo "parecen funcionar".
 */

import { Tablero } from '../../core/boardgame.js';
import {
  N, BLANCAS, NOMBRES, VALOR,
  posicionInicial, pieza, legalesDe, todasLegales, aplicar, enJaque, evaluar,
} from './reglas.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

/**
 * Los dos bandos usan los glifos SÓLIDOS y se distinguen por color, no por
 * relleno: los huecos (♔♕♖) sobre casilla clara se leen fatal, que es el
 * problema de la mitad de los tableros hechos en HTML.
 */
const GLIFOS = { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' };

export function create(ctx) {
  const { audio, haptics, players } = ctx;

  const E = posicionInicial();
  let tab = null;
  let seleccion = null;
  let legales = [];
  let ultimoMov = null;
  let promocionPendiente = null;
  let terminado = false;
  let jugadas = 0;

  /* ---------------- Pintado ---------------- */

  function pintarCelda(x, y) {
    const clases = [(x + y) % 2 === 1 ? 'aj-oscura' : 'aj-clara'];
    let html = '';

    const p = pieza(E, x, y);
    if (p) {
      const relleno = p.c === BLANCAS ? '#fbf7ee' : '#15151c';
      const contorno = p.c === BLANCAS ? '#2a2118' : '#e8dcc0';
      const acento = players[p.c].color;
      html = `<span class="aj-pieza" style="color:${relleno};
                -webkit-text-stroke:1.2px ${contorno};
                text-shadow:0 0 6px ${acento}, 0 2px 3px #0009">${GLIFOS[p.t]}</span>`;
    }

    if (seleccion && seleccion.x === x && seleccion.y === y) clases.push('marcada');
    if (ultimoMov && ((ultimoMov.desde.x === x && ultimoMov.desde.y === y) ||
                      (ultimoMov.hasta.x === x && ultimoMov.hasta.y === y))) {
      clases.push('aj-ultimo');
    }
    // Varias jugadas pueden apuntar a la misma casilla (las cuatro coronaciones).
    const l = legales.find((m) => m.x === x && m.y === y);
    if (l) clases.push(l.captura ? 'legal-captura' : 'legal');
    if (p?.t === 'k' && p.c === E.turno && enJaque(E, E.turno)) clases.push('aj-jaque');

    return { html, clases };
  }

  /* ---------------- Interacción ---------------- */

  function confirmar(x, y) {
    if (terminado || promocionPendiente) return;

    if (seleccion) {
      const candidatas = legales.filter((m) => m.x === x && m.y === y);
      if (candidatas.length === 1) return mover(seleccion, candidatas[0]);
      if (candidatas.length > 1) {
        // Cuatro jugadas al mismo destino = coronación: hay que preguntar.
        promocionPendiente = { desde: seleccion, opciones: candidatas };
        mostrarPromocion();
        return;
      }
    }

    const p = pieza(E, x, y);
    if (p && p.c === E.turno) {
      const l = legalesDe(E, x, y);
      if (!l.length) {
        audio.error();
        haptics.error(E.turno);
        tab.pie(`Ese ${NOMBRES[p.t]} no tiene jugadas legales`);
        return;
      }
      seleccion = { x, y };
      legales = l;
      audio.select();
      tab.refrescar();
      return;
    }

    seleccion = null;
    legales = [];
    tab.refrescar();
  }

  function mover(desde, m) {
    const capturada = m.alPaso
      ? pieza(E, m.x, E.turno === BLANCAS ? m.y + 1 : m.y - 1)
      : pieza(E, m.x, m.y);
    if (capturada) E.capturadas[E.turno].push(capturada.t);

    aplicar(E, desde, m);
    jugadas++;
    ultimoMov = { desde, hasta: { x: m.x, y: m.y } };
    seleccion = null;
    legales = [];

    if (m.enroque) { audio.thud(); haptics.play('heavy', { player: E.turno }); }
    else if (m.promocion) { audio.win(); haptics.play('score', { player: E.turno }); }
    else if (capturada) { audio.capture(); haptics.play('impact', { player: E.turno }); }
    else { audio.place(); haptics.play('click', { player: E.turno }); }

    E.turno = 1 - E.turno;
    tab.turno = E.turno;
    tab.actualizarTurno();
    tab.refrescar();
    evaluarPosicion();
  }

  function mostrarPromocion() {
    const orden = ['q', 'r', 'b', 'n'];
    const disponibles = orden.filter((t) => promocionPendiente.opciones.some((m) => m.promocion === t));
    // Todo el HTML de una vez: reasignarlo después borraría los listeners.
    tab.pie(
      `<b>Corona tu peón</b>: ` +
      disponibles.map((t) => `<button class="aj-promo" data-t="${t}">${GLIFOS[t]} ${NOMBRES[t]}</button>`).join(' ') +
      `<div class="aj-promo-hint">o pulsa
         <span class="kbd">↑</span> dama · <span class="kbd">←</span> torre ·
         <span class="kbd">↓</span> alfil · <span class="kbd">→</span> caballo</div>`
    );
    tab.elPie.querySelectorAll('.aj-promo').forEach((b) => {
      b.addEventListener('click', () => coronar(b.dataset.t));
    });
  }

  function coronar(tipo) {
    const pend = promocionPendiente;
    if (!pend) return;
    const m = pend.opciones.find((o) => o.promocion === tipo);
    if (!m) return;
    promocionPendiente = null;
    mover(pend.desde, m);
  }

  function evaluarPosicion() {
    const r = evaluar(E);
    if (r.tipo === 'jaque-mate') return fin(1 - E.turno, 'Jaque mate');
    if (r.tipo === 'ahogado') return fin(-1, 'Rey ahogado');
    if (r.tipo === 'tablas-50') return fin(-1, 'Tablas: 50 movimientos sin avance');
    if (r.tipo === 'tablas-material') return fin(-1, 'Tablas: material insuficiente');

    const ventaja = textoVentaja();
    tab.pie(
      (r.tipo === 'jaque' ? `<b style="color:var(--danger)">¡Jaque!</b> · ` : '') +
      `${r.jugadas} jugadas legales` + (ventaja ? ` · ${ventaja}` : '')
    );
    if (r.tipo === 'jaque') { audio.error(); haptics.play('heavy', { player: E.turno }); }
  }

  const sumar = (arr) => arr.reduce((a, t) => a + VALOR[t], 0);

  function textoVentaja() {
    const d = sumar(E.capturadas[0]) - sumar(E.capturadas[1]);
    if (d === 0) return '';
    return `${players[d > 0 ? 0 : 1].name} +${Math.abs(d)}`;
  }

  function fin(ganador, motivo) {
    terminado = true;
    tab.bloqueado = true;
    tab.refrescar();
    ctx.finish({
      winner: ganador,
      scores: [sumar(E.capturadas[0]), sumar(E.capturadas[1])],
      detail: `${motivo} · ${jugadas} jugadas`,
    });
  }

  return {
    init() {
      inyectarEstilos();
      tab = new Tablero(ctx, {
        cols: N, filas: N, celda: 62,
        pintarCelda,
        onConfirmar: confirmar,
        onCursor: () => tab.refrescar(),
      });
      tab.ponerCursor(4, 6);
      evaluarPosicion();
    },

    update(dt) {
      if (promocionPendiente) {
        // Atajo de teclado para coronar sin soltar el teclado.
        const pl = ctx.input.player(E.turno);
        const mapa = { up: 'q', left: 'r', down: 'b', right: 'n' };
        for (const [dir, tipo] of Object.entries(mapa)) {
          if (pl.pressed(dir)) { coronar(tipo); return; }
        }
        return;
      }
      tab?.actualizar(dt);
    },

    destroy() { tab?.destruir(); },
  };
}

function inyectarEstilos() {
  if (document.getElementById('aj-css')) return;
  const s = document.createElement('style');
  s.id = 'aj-css';
  s.textContent = `
    .bg-celda.aj-clara { background:#d9c9a8; }
    .bg-celda.aj-oscura { background:#7d5a3c; }
    .aj-pieza { font-size:1.9em; line-height:1; user-select:none; }
    .aj-ultimo { box-shadow: inset 0 0 0 3px #ffd16688; }
    .aj-jaque { background:#ff475766 !important; animation: pulse-glow .8s infinite; }
    .aj-promo {
      display:inline-flex; align-items:center; gap:5px; padding:5px 10px; margin:0 2px;
      border-radius:8px; background:#ffffff14; border:1px solid var(--line);
      font-size:13px; cursor:pointer;
    }
    .aj-promo:hover { background:#ffffff22; }
    .aj-promo-hint { margin-top:8px; font-size:11px; color:var(--ink-faint); }
  `;
  document.head.appendChild(s);
}
