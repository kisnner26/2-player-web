/**
 * tbgame.js — utilidades comunes de los juegos exclusivos de Touch Bar.
 *
 * La Touch Bar mide unos 1085×30 px útiles y está fuera del campo de visión
 * mientras miras la pantalla. Por eso todos estos juegos dibujan un ESPEJO en
 * pantalla: lo que ves arriba es lo que hay en la barra, y así el juego se
 * puede seguir sin bajar la vista y quien mira por encima del hombro también
 * se entera.
 *
 * El espejo también sirve de red de seguridad: si el puente nativo falla a
 * mitad de partida, el jugador ve el estado aunque la barra se apague.
 */

import { escapeHtml } from './ui.js';
import { avatarFor } from './avatar.js';

export class EspejoBarra {
  /**
   * @param {HTMLElement} host  contenedor donde montar el espejo
   * @param {number} segmentos  número de celdas de la barra
   */
  constructor(host, segmentos = 12) {
    this.host = host;
    this.n = segmentos;
    this.el = document.createElement('div');
    this.el.className = 'tb-espejo';
    this.el.innerHTML = `
      <div class="tb-marco">
        <div class="tb-esc">esc</div>
        <div class="tb-celdas"></div>
      </div>
      <div class="tb-nota">↑ esto es tu Touch Bar</div>`;
    host.appendChild(this.el);
    this.celdas = [];
    const cont = this.el.querySelector('.tb-celdas');
    for (let i = 0; i < segmentos; i++) {
      const d = document.createElement('div');
      d.className = 'tb-celda';
      cont.appendChild(d);
      this.celdas.push(d);
    }
  }

  /**
   * Pinta la barra completa.
   * @param {Array<{label?:string,bg?:string,color?:string,clase?:string}>} celdas
   */
  pintar(celdas) {
    for (let i = 0; i < this.n; i++) {
      const c = celdas[i] || {};
      const el = this.celdas[i];
      const txt = c.label ?? '';
      if (el.textContent !== txt) el.textContent = txt;
      el.style.background = c.bg || '#161616';
      el.style.color = c.color || '#f2f2f2';
      el.className = 'tb-celda' + (c.clase ? ' ' + c.clase : '');
    }
  }

  /** Destello en una celda concreta (respuesta táctil visible). */
  destello(i, color = '#ffffff') {
    const el = this.celdas[i];
    if (!el) return;
    el.animate(
      [{ boxShadow: `0 0 0 0 ${color}`, filter: 'brightness(2)' },
       { boxShadow: `0 0 22px 4px ${color}00`, filter: 'brightness(1)' }],
      { duration: 320, easing: 'ease-out' }
    );
  }

  remove() { this.el.remove(); }
}

/**
 * Cabecera estándar: marcador de los dos jugadores + línea de instrucción.
 * @returns {{el:HTMLElement, marcar:(a,b)=>void, decir:(html)=>void}}
 */
export function cabecera(host, players, titulo = '') {
  const el = document.createElement('div');
  el.className = 'tb-cab';
  el.innerHTML = `
    <div class="tb-jug">
      ${[0, 1].map((i) => `
        <div class="tb-j" style="--c:${players[i].color}">
          <img src="${avatarFor(players[i])}" alt="">
          <span class="tb-nom">${escapeHtml(players[i].name)}</span>
          <span class="tb-pts" data-p="${i}">0</span>
        </div>`).join('<div class="tb-vs">vs</div>')}
    </div>
    ${titulo ? `<h2 class="tb-titulo">${escapeHtml(titulo)}</h2>` : ''}
    <p class="tb-instr"></p>`;
  host.appendChild(el);
  const p0 = el.querySelector('[data-p="0"]');
  const p1 = el.querySelector('[data-p="1"]');
  const instr = el.querySelector('.tb-instr');
  return {
    el,
    marcar(a, b) { p0.textContent = a; p1.textContent = b; },
    decir(html) { instr.innerHTML = html; },
    resaltar(jugador) {
      el.querySelectorAll('.tb-j').forEach((d, i) => d.classList.toggle('activo', i === jugador));
    },
  };
}

/** Aviso cuando no hay puente nativo (no debería verse: el hub ya los oculta). */
export function avisoSinBarra(host, motivo) {
  const el = document.createElement('div');
  el.className = 'tb-aviso';
  el.innerHTML = `
    <div class="tb-aviso-icono">▬</div>
    <h2>Este juego necesita la Touch Bar</h2>
    <p>${escapeHtml(motivo)}</p>
    <p class="tb-aviso-sub">Ábrelo desde la app de escritorio (carpeta <code>desktop/</code>)
       en una MacBook Pro con Touch Bar.</p>`;
  host.appendChild(el);
  return el;
}

/**
 * Celda fija que tiñe la Touch Bar REAL (no solo el espejo en pantalla) con
 * el color del jugador activo. Sin esto, en un juego por turnos nada en la
 * barra física distingue de quién es el turno, así que el jugador más rápido
 * termina tocando también los turnos del otro. Los juegos por turnos deben
 * anteponerla a su propio `touchbar.set([...])`. Su click no hace nada: el
 * id `_turno` no coincide con ningún patrón de los manejadores de eventos.
 */
export function indicadorTurno(players, turno) {
  return {
    type: 'button', id: '_turno',
    label: players[turno].name.slice(0, 1).toUpperCase(),
    bg: players[turno].color, color: '#000000',
  };
}

export function inyectarEstilosTB() {
  if (document.getElementById('tbg-css')) return;
  const s = document.createElement('style');
  s.id = 'tbg-css';
  s.textContent = `
    .tb-pantalla {
      display:flex; flex-direction:column; align-items:center; gap:26px;
      width:min(1100px, 94vw);
    }
    .tb-cab { text-align:center; width:100%; }
    .tb-jug { display:flex; align-items:center; justify-content:center; gap:22px; }
    .tb-j {
      display:flex; align-items:center; gap:10px; padding:8px 16px;
      border-radius:999px; border:1px solid #ffffff18; opacity:.55;
      transition: all 200ms var(--ease);
    }
    .tb-j.activo { opacity:1; border-color:var(--c); box-shadow:0 0 26px -8px var(--c); background:#ffffff08; }
    .tb-j img { width:30px; height:30px; border-radius:50%; image-rendering:pixelated; }
    .tb-nom { font-size:13px; color:var(--c); }
    .tb-pts { font-family:var(--font-display); font-size:17px; }
    .tb-vs { font-size:11px; color:var(--ink-faint); letter-spacing:.14em; }
    .tb-titulo { font-size:19px; font-weight:600; margin:18px 0 4px; }
    .tb-instr { font-size:14px; color:var(--ink-dim); margin:6px 0 0; min-height:20px; }

    /* Espejo de la barra */
    .tb-espejo { width:100%; }
    .tb-marco {
      display:flex; align-items:stretch; gap:6px;
      background:#000; border:1px solid #2a2a2a; border-radius:10px;
      padding:6px; box-shadow: 0 10px 40px -12px #000, inset 0 1px 0 #ffffff10;
    }
    .tb-esc {
      display:grid; place-items:center; min-width:52px;
      font-size:10px; color:#8a8a8a; background:#141414; border-radius:6px;
      letter-spacing:.06em;
    }
    .tb-celdas { display:flex; gap:5px; flex:1; }
    .tb-celda {
      flex:1; display:grid; place-items:center;
      min-height:44px; border-radius:6px; background:#161616;
      font-size:15px; font-weight:600; letter-spacing:.02em;
      transition: background 90ms linear, color 90ms linear, transform 90ms var(--ease);
      overflow:hidden; white-space:nowrap;
    }
    .tb-celda.viva { transform: scaleY(1.12); }
    .tb-celda.tenue { opacity:.35; }
    .tb-nota {
      text-align:center; font-size:11px; color:var(--ink-faint);
      margin-top:8px; letter-spacing:.06em;
    }

    .tb-panel {
      display:flex; gap:14px; flex-wrap:wrap; justify-content:center;
      font-size:13px; color:var(--ink-dim);
    }
    .tb-panel b { color:var(--ink); }
    .tb-pista {
      display:flex; gap:6px; flex-wrap:wrap; justify-content:center;
      font-size:12px; color:var(--ink-faint);
    }

    .tb-aviso { text-align:center; max-width:520px; }
    .tb-aviso-icono { font-size:52px; letter-spacing:-6px; color:var(--ink-faint); }
    .tb-aviso h2 { font-size:20px; margin:12px 0 8px; }
    .tb-aviso p { color:var(--ink-dim); font-size:14px; margin:6px 0; }
    .tb-aviso-sub { font-size:12px !important; color:var(--ink-faint) !important; }
    .tb-aviso code { background:#ffffff12; padding:2px 6px; border-radius:4px; }
  `;
  document.head.appendChild(s);
}

/**
 * Prepara la pantalla de un juego de Touch Bar y confirma que hay puente.
 * @returns {Promise<{pantalla:HTMLElement, disponible:boolean}>}
 */
export async function prepararPantalla(ctx, { titulo = '', segmentos = 12 } = {}) {
  inyectarEstilosTB();
  const pantalla = document.createElement('div');
  pantalla.className = 'tb-pantalla';
  ctx.root.appendChild(pantalla);

  const disponible = await ctx.touchbar.ready();
  const cab = cabecera(pantalla, ctx.players, titulo);
  if (!disponible) {
    avisoSinBarra(pantalla, ctx.touchbar.reason);
    return { pantalla, cab, espejo: null, disponible: false };
  }
  const espejo = new EspejoBarra(pantalla, segmentos);
  ctx.touchbar.setFocus(true);

  // Se ocupa también la ranura del "esc": por defecto macOS pone ahí su botón
  // de sistema y esa celda se desperdicia. Al declarar un escapeItem propio la
  // barra queda entera del juego. El id `_esc` no coincide con ningún patrón
  // de los manejadores de clic, así que pulsarlo no altera la partida.
  ctx.touchbar.setEscape({
    type: 'button', id: '_esc',
    label: (titulo || '2P').slice(0, 12).toUpperCase(),
    bg: '#101018', color: '#8a8a9a',
  });

  return { pantalla, cab, espejo, disponible: true };
}

/**
 * Rellena una lista de items hasta ocupar el ancho completo de la barra.
 *
 * La Touch Bar reparte el espacio entre los items que haya: si un juego manda
 * 8 botones, quedan anchos y sobra sitio. Añadiendo espaciadores flexibles al
 * final, el contenido se estira y no queda hueco muerto.
 *
 * @param {Array<object>} items
 * @param {number} minimo  cuántas ranuras se quieren ocupar como mínimo
 */
export function rellenarBarra(items, minimo = 0) {
  const out = [...items];
  const faltan = Math.max(0, minimo - items.length);
  for (let i = 0; i < faltan; i++) {
    out.push({ type: 'spacer', id: `_fill${i}`, size: 'flexible' });
  }
  return out;
}
