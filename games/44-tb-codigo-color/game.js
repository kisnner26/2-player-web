/**
 * Código Color — Mastermind sobre la Touch Bar.
 *
 * Cada jugador tiene SU PROPIO código secreto, distinto del otro. Así se puede
 * jugar por turnos en una barra compartida sin que nadie aproveche la
 * información del rival: es una carrera a ver quién descifra el suyo antes.
 *
 * La barra muestra las cuatro ranuras y la paleta de seis colores; tocar una
 * ranura la selecciona y tocar un color la pinta. Es el uso más natural
 * posible de una tira táctil llena de color.
 */

import { prepararPantalla, indicadorTurno } from '../../core/tbgame.js';
import { escapeHtml } from '../../core/ui.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const RANURAS = 4;
const MAX_INTENTOS = 8;
const PALETA = [
  { id: 0, hex: '#ff2e5b', nombre: 'rojo' },
  { id: 1, hex: '#ff9f1c', nombre: 'naranja' },
  { id: 2, hex: '#ffd166', nombre: 'amarillo' },
  { id: 3, hex: '#2ec4b6', nombre: 'verde' },
  { id: 4, hex: '#3a86ff', nombre: 'azul' },
  { id: 5, hex: '#b04cff', nombre: 'morado' },
];

export function create(ctx) {
  const { touchbar, audio, haptics, players, root } = ctx;

  let cab = null, espejo = null, disponible = false;
  const secretos = [[], []];
  const intentos = [[], []];       // historial por jugador
  let propuesta = [0, 0, 0, 0];
  let ranuraActiva = 0;
  let turno = 0;
  let fase = 'jugando';
  let pausa = 0;
  let desuscribir = null;
  let elHistorial = null;

  function generarSecreto() {
    // Con repetición permitida: 6^4 = 1296 combinaciones.
    return Array.from({ length: RANURAS }, () => Math.floor(Math.random() * PALETA.length));
  }

  /** Aciertos exactos (posición y color) y parciales (color en otro sitio). */
  function evaluar(intento, secreto) {
    const usadoS = new Array(RANURAS).fill(false);
    const usadoI = new Array(RANURAS).fill(false);
    let exactos = 0, parciales = 0;
    for (let i = 0; i < RANURAS; i++) {
      if (intento[i] === secreto[i]) { exactos++; usadoS[i] = usadoI[i] = true; }
    }
    for (let i = 0; i < RANURAS; i++) {
      if (usadoI[i]) continue;
      for (let j = 0; j < RANURAS; j++) {
        if (usadoS[j] || intento[i] !== secreto[j]) continue;
        parciales++; usadoS[j] = true;
        break;
      }
    }
    return { exactos, parciales };
  }

  function pintarBarra() {
    // Espejo: ranuras + separador + paleta
    const celdas = [];
    for (let i = 0; i < RANURAS; i++) {
      celdas.push({
        label: i === ranuraActiva ? '▾' : '',
        bg: PALETA[propuesta[i]].hex,
        color: '#000000',
        clase: i === ranuraActiva ? 'viva' : '',
      });
    }
    celdas.push({ label: '', bg: '#000000', clase: 'tenue' });
    for (const c of PALETA) celdas.push({ label: '', bg: c.hex });
    celdas.push({ label: 'OK', bg: '#f2f2f2', color: '#000000' });
    espejo?.pintar(celdas);

    if (!disponible) return;
    const items = [indicadorTurno(players, turno)];
    for (let i = 0; i < RANURAS; i++) {
      items.push({
        type: 'button', id: `r${i}`,
        label: i === ranuraActiva ? '▾' : ' ',
        bg: PALETA[propuesta[i]].hex, color: '#000000',
      });
    }
    items.push({ type: 'spacer', id: 'sp', size: 'small' });
    for (const c of PALETA) {
      items.push({ type: 'button', id: `c${c.id}`, label: ' ', bg: c.hex, color: '#000000' });
    }
    items.push({ type: 'button', id: 'probar', label: 'PROBAR', bg: '#f2f2f2', color: '#000000' });
    touchbar.set(items);
  }

  function pintarHistorial() {
    const filas = (j) => {
      const h = intentos[j];
      if (!h.length) return `<p class="cc-vacio">sin intentos</p>`;
      return h.map((it, k) => `
        <div class="cc-fila">
          <span class="cc-n">${k + 1}</span>
          ${it.intento.map((c) => `<span class="cc-p" style="background:${PALETA[c].hex}"></span>`).join('')}
          <span class="cc-res">
            ${'●'.repeat(it.exactos)}<span class="cc-par">${'○'.repeat(it.parciales)}</span>
          </span>
        </div>`).reverse().join('');
    };
    elHistorial.innerHTML = `
      ${[0, 1].map((j) => `
        <div class="cc-col" style="--c:${players[j].color}">
          <h3>${escapeHtml(players[j].name)} <small>${intentos[j].length}/${MAX_INTENTOS}</small></h3>
          ${filas(j)}
        </div>`).join('')}`;
  }

  function actualizarTexto() {
    const p = players[turno];
    cab.resaltar(turno);
    cab.decir(
      `Turno de <b style="color:${p.color}">${p.name}</b> ·
       toca una ranura, elige color y pulsa <b>PROBAR</b> ·
       <span class="cc-leyenda">● color y sitio · ○ color mal colocado</span>`
    );
  }

  function tocarRanura(i) {
    ranuraActiva = i;
    audio.tick();
    touchbar.haptic('light');
    pintarBarra();
  }

  function tocarColor(id) {
    propuesta[ranuraActiva] = id;
    audio.blip();
    haptics.play('click', { player: turno });
    touchbar.haptic('light');
    // Avanza sola a la siguiente ranura: se pinta el código de un tirón.
    ranuraActiva = (ranuraActiva + 1) % RANURAS;
    pintarBarra();
  }

  function probar() {
    if (fase !== 'jugando') return;
    const r = evaluar(propuesta, secretos[turno]);
    intentos[turno].push({ intento: [...propuesta], ...r });
    pintarHistorial();
    cab.marcar(intentos[0].length, intentos[1].length);

    if (r.exactos === RANURAS) {
      fase = 'ganado';
      pausa = 2;
      audio.win();
      haptics.play('victory', { player: turno });
      touchbar.haptic('heavy');
      cab.decir(`<b style="color:${players[turno].color}">${players[turno].name}</b> descifra su código
                 en ${intentos[turno].length} intentos`);
      return;
    }

    audio.tone({ freq: 300 + r.exactos * 160, dur: 0.12, gain: 0.15 });
    haptics.play(r.exactos >= 2 ? 'score' : 'soft', { player: turno });
    touchbar.haptic(r.exactos >= 2 ? 'medium' : 'light');

    if (intentos[0].length >= MAX_INTENTOS && intentos[1].length >= MAX_INTENTOS) {
      fase = 'agotado';
      pausa = 2;
      return;
    }
    do { turno = 1 - turno; } while (intentos[turno].length >= MAX_INTENTOS);
    ranuraActiva = 0;
    propuesta = [0, 0, 0, 0];
    actualizarTexto();
    pintarBarra();
  }

  return {
    async init() {
      inyectarEstilos();
      const p = await prepararPantalla(ctx, { titulo: 'Código Color', segmentos: RANURAS + 1 + PALETA.length + 1 });
      cab = p.cab; espejo = p.espejo; disponible = p.disponible;
      cab.marcar(0, 0);

      elHistorial = document.createElement('div');
      elHistorial.className = 'cc-hist';
      p.pantalla.appendChild(elHistorial);

      secretos[0] = generarSecreto();
      secretos[1] = generarSecreto();
      pintarHistorial();
      if (!disponible) return;

      desuscribir = touchbar.on((ev) => {
        if (ev.type !== 'click' || fase !== 'jugando') return;
        if (ev.id.startsWith('r')) tocarRanura(parseInt(ev.id.slice(1), 10));
        else if (ev.id.startsWith('c')) tocarColor(parseInt(ev.id.slice(1), 10));
        else if (ev.id === 'probar') probar();
      });
      actualizarTexto();
      pintarBarra();
    },

    update(dt) {
      if (!disponible || fase === 'jugando') return;
      pausa -= dt;
      if (pausa > 0) return;

      const revelar = (j) => secretos[j].map((c) => PALETA[c].nombre).join(', ');
      if (fase === 'ganado') {
        ctx.finish({
          winner: turno,
          scores: [intentos[0].length, intentos[1].length],
          detail: `Código del rival: ${revelar(1 - turno)}`,
          record: ctx.record('intentos', intentos[turno].length, 'low'),
        });
      } else {
        ctx.finish({
          winner: -1,
          scores: [intentos[0].length, intentos[1].length],
          detail: `Nadie lo descifró · códigos: ${revelar(0)} / ${revelar(1)}`,
        });
      }
    },

    destroy() { desuscribir?.(); touchbar.clear(); touchbar.setFocus(false); root.innerHTML = ''; },
  };
}

function inyectarEstilos() {
  if (document.getElementById('cc-css')) return;
  const s = document.createElement('style');
  s.id = 'cc-css';
  s.textContent = `
    .cc-hist { display:flex; gap:36px; justify-content:center; width:100%; }
    .cc-col { flex:1; max-width:280px; }
    .cc-col h3 { font-size:13px; color:var(--c); margin:0 0 10px; font-weight:600; }
    .cc-col h3 small { color:var(--ink-faint); font-weight:400; }
    .cc-fila { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
    .cc-n { font-size:10px; color:var(--ink-faint); width:14px; }
    .cc-p { width:18px; height:18px; border-radius:50%; box-shadow: inset 0 -2px 4px #0006; }
    .cc-res { font-size:12px; color:#a8ff3e; letter-spacing:2px; margin-left:6px; }
    .cc-par { color:var(--ink-dim); }
    .cc-vacio { font-size:12px; color:var(--ink-faint); font-style:italic; }
    .cc-leyenda { font-size:11px; color:var(--ink-faint); }
  `;
  document.head.appendChild(s);
}
