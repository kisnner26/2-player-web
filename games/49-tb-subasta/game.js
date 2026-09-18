/**
 * Subasta a Ciegas — pujas secretas con el slider de la Touch Bar.
 *
 * El secreto funciona por hardware: la barra es estrecha, está tumbada y se
 * tapa con la mano sin esfuerzo, mientras que la pantalla —que es lo que mira
 * el rival— nunca muestra tu puja. Ese reparto de información es imposible de
 * conseguir con un teclado compartido, y es justo lo que hace que el faroleo
 * tenga sentido aquí.
 */

import { prepararPantalla } from '../../core/tbgame.js';
import { escapeHtml } from '../../core/ui.js';
import { icon } from '../../core/icons.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const PRESUPUESTO = 100;
const LOTES = 6;
const CELDAS = 20;

const CATALOGO = [
  { nombre: 'Cofre pequeño', icono: 'chest', valor: 10 },
  { nombre: 'Rubí', icono: 'gem', valor: 25 },
  { nombre: 'Corona', icono: 'crown', valor: 35 },
  { nombre: 'Mapa del tesoro', icono: 'map', valor: 20 },
  { nombre: 'Reliquia', icono: 'relic', valor: 30 },
  { nombre: 'Llave dorada', icono: 'key', valor: 15 },
  { nombre: 'Espejo antiguo', icono: 'mirror', valor: 22 },
  { nombre: 'Reloj de bolsillo', icono: 'timer', valor: 18 },
];

export function create(ctx) {
  const { touchbar, audio, haptics, players } = ctx;

  let cab = null, espejo = null, disponible = false, pantalla = null;
  let elLote = null;
  const saldo = [PRESUPUESTO, PRESUPUESTO];
  const botin = [0, 0];
  const ganados = [[], []];
  let lotes = [];
  let loteActual = 0;
  let turno = 0;
  const pujas = [null, null];
  let pujaActual = 0;
  let fase = 'pujando';        // pujando | revelando | fin
  let pausa = 0;
  let desuscribir = null;

  function prepararLotes() {
    lotes = [...CATALOGO].sort(() => Math.random() - 0.5).slice(0, LOTES);
  }

  function pintarBarra() {
    const max = saldo[turno];
    const frac = max > 0 ? pujaActual / max : 0;
    const idx = Math.round(frac * (CELDAS - 1));
    const celdas = [];
    for (let i = 0; i < CELDAS; i++) {
      if (fase !== 'pujando') {
        celdas.push({ label: '', bg: '#0d0d0d', clase: 'tenue' });
      } else if (i <= idx) {
        celdas.push({ label: i === idx ? String(pujaActual) : '', bg: players[turno].color, color: '#000000' });
      } else {
        celdas.push({ label: '', bg: '#141414' });
      }
    }
    // El espejo NO revela la puja: solo indica que estás pujando.
    espejo?.pintar(
      fase === 'pujando'
        ? Array.from({ length: CELDAS }, (_, i) => ({
            label: i === Math.floor(CELDAS / 2) - 1 ? '···' : '',
            bg: '#111111', clase: 'tenue',
          }))
        : celdas
    );

    if (!disponible) return;
    touchbar.set([
      { type: 'label', id: 'lbl', label: `  Puja: ${pujaActual} / ${max}  ` },
      { type: 'slider', id: 'puja', label: '', value: pujaActual, min: 0, max: Math.max(1, max) },
      { type: 'button', id: 'ok', label: 'CONFIRMAR', bg: players[turno].color, color: '#000000' },
    ]);
  }

  function pintarLote() {
    const l = lotes[loteActual];
    const historial = [0, 1].map((j) => `
      <div class="sb-col" style="--c:${players[j].color}">
        <div class="sb-saldo">${saldo[j]} <small>monedas</small></div>
        <div class="sb-botin">${botin[j]} <small>pts de botín</small></div>
        <div class="sb-items">${ganados[j].length ? ganados[j].map((g) => icon(g.icono, { size: 18 })).join('') : '—'}</div>
      </div>`).join('');

    elLote.innerHTML = `
      <div class="sb-lote">
        <span class="sb-num">Lote ${loteActual + 1} / ${LOTES}</span>
        <div class="sb-emoji">${icon(l.icono, { size: 52 })}</div>
        <div class="sb-nombre">${escapeHtml(l.nombre)}</div>
        <div class="sb-valor">vale <b>${l.valor}</b> puntos</div>
      </div>
      <div class="sb-cols">${historial}</div>`;
  }

  function textoTurno() {
    if (fase !== 'pujando') return;
    const p = players[turno];
    const yaPujo = pujas[1 - turno] != null;
    cab.resaltar(turno);
    cab.decir(
      `<b style="color:${p.color}">${p.name}</b>, puja en la barra y tápala con la mano ·
       ${yaPujo ? 'el otro ya pujó' : 'después le toca al otro'} ·
       la pantalla no muestra tu cifra`
    );
  }

  function confirmar() {
    if (fase !== 'pujando') return;
    pujas[turno] = Math.min(pujaActual, saldo[turno]);
    audio.select();
    haptics.play('impact', { player: turno });
    touchbar.haptic('medium');

    if (pujas[1 - turno] == null) {
      turno = 1 - turno;
      pujaActual = 0;
      textoTurno();
      pintarBarra();
      return;
    }
    revelar();
  }

  function revelar() {
    fase = 'revelando';
    pausa = 2.6;
    const l = lotes[loteActual];
    const [a, b] = pujas;

    let ganador;
    if (a === b) {
      // Empate: gana quien tenga menos botín, para que no se dispare la ventaja.
      ganador = botin[0] <= botin[1] ? 0 : 1;
    } else ganador = a > b ? 0 : 1;

    const pago = pujas[ganador];
    saldo[ganador] -= pago;
    botin[ganador] += l.valor;
    ganados[ganador].push(l);

    cab.marcar(botin[0], botin[1]);
    cab.resaltar(ganador);
    cab.decir(
      `${players[0].name} pujó <b>${a}</b> · ${players[1].name} pujó <b>${b}</b> →
       se lo lleva <b style="color:${players[ganador].color}">${players[ganador].name}</b>
       por ${pago} ${a === b ? '(empate: gana quien va detrás)' : ''}`
    );
    audio.score(ganador);
    haptics.score(ganador);
    touchbar.haptic('heavy');
    pintarLote();
    pintarBarra();
  }

  function siguienteLote() {
    loteActual++;
    if (loteActual >= LOTES || (saldo[0] === 0 && saldo[1] === 0)) return terminar();
    pujas[0] = pujas[1] = null;
    pujaActual = 0;
    // Empieza el que tiene menos botín: compensa un poco la ventaja.
    turno = botin[0] <= botin[1] ? 0 : 1;
    fase = 'pujando';
    pintarLote();
    textoTurno();
    pintarBarra();
  }

  function terminar() {
    fase = 'fin';
    // El dinero sobrante también puntúa: guardarlo es una estrategia válida.
    const total = [botin[0] + Math.floor(saldo[0] / 5), botin[1] + Math.floor(saldo[1] / 5)];
    ctx.finish({
      winner: total[0] === total[1] ? -1 : total[0] > total[1] ? 0 : 1,
      scores: total,
      detail: `Botín ${botin[0]}/${botin[1]} + ahorro ${Math.floor(saldo[0] / 5)}/${Math.floor(saldo[1] / 5)}`,
    });
  }

  return {
    async init() {
      inyectarEstilos();
      const p = await prepararPantalla(ctx, { titulo: 'Subasta a Ciegas', segmentos: CELDAS });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible; pantalla = p.pantalla;
      cab.marcar(0, 0);

      elLote = document.createElement('div');
      elLote.className = 'sb-wrap';
      pantalla.appendChild(elLote);

      prepararLotes();
      pintarLote();
      if (!disponible) return;

      desuscribir = touchbar.on((ev) => {
        if (fase !== 'pujando') return;
        if (ev.id === 'puja' && ev.type === 'change') {
          pujaActual = Math.round(ev.value);
          touchbar.update('lbl', { label: `  Puja: ${pujaActual} / ${saldo[turno]}  ` });
          haptics.play('tick', { player: turno });
        }
        if (ev.id === 'ok' && ev.type === 'click') confirmar();
      });
      textoTurno();
      pintarBarra();
    },

    update(dt) {
      if (!disponible || fase !== 'revelando') return;
      pausa -= dt;
      if (pausa <= 0) siguienteLote();
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); ctx.root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('sb-css')) return;
  const s = document.createElement('style');
  s.id = 'sb-css';
  s.textContent = `
    .sb-wrap { display:flex; flex-direction:column; align-items:center; gap:22px; width:100%; }
    .sb-lote { text-align:center; }
    .sb-num { font-size:11px; color:var(--ink-faint); letter-spacing:.12em; text-transform:uppercase; }
    .sb-emoji { font-size:66px; line-height:1.2; animation: pop 300ms var(--ease); }
    .sb-nombre { font-size:19px; font-weight:600; }
    .sb-valor { font-size:13px; color:var(--ink-dim); }
    .sb-valor b { color:var(--gold); }
    .sb-cols { display:flex; gap:44px; }
    .sb-col { text-align:center; }
    .sb-saldo { font-family:var(--font-display); font-size:17px; color:var(--c); }
    .sb-saldo small, .sb-botin small { font-family:var(--font-ui); font-size:10px; color:var(--ink-faint); }
    .sb-botin { font-size:14px; color:var(--ink); margin-top:4px; }
    .sb-items { font-size:19px; margin-top:8px; min-height:24px; letter-spacing:2px; }
  `;
  document.head.appendChild(s);
}
