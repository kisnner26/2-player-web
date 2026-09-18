/**
 * hub.js — menú principal: escenario, catálogo, perfiles, ajustes, torneo
 * y rivalidad.
 *
 * El catálogo no se presenta como una rejilla de fichas informativas sino
 * como un escaparate: arriba, un escenario a sangre donde el juego enfocado
 * se mueve de verdad (core/scenes.js a través de core/preview.js); debajo,
 * rieles horizontales por categoría. Enfocar es gratis —se hace con el ratón
 * o con las flechas— y jugar es un clic o un Enter.
 *
 * El hub decide qué juegos se ven: los de Touch Bar solo aparecen si el
 * puente nativo confirma que esta Mac tiene barra táctil. En cualquier otro
 * navegador el catálogo se queda en los de teclado y no hay ninguna entrada
 * rota apuntando a hardware que no existe.
 *
 * Toda la iconografía sale de core/icons.js (sin emoji: se ven distinto en
 * cada sistema y no encajan con un catálogo que quiere leerse como un
 * producto terminado).
 */

import { GAMES, CATEGORIAS, byId, visibleGames, search, TOTAL_TOUCHBAR, TOTAL_TECLADO } from '../games/manifest.js';
import { audio } from './audio.js';
import { ambiente } from './ambiente.js';
import { haptics } from './haptics.js';
import { input, ACTIONS, ACTION_LABEL, DEFAULT_MAPS, codeLabel } from './input.js';
import { touchbar } from './touchbar.js';
import { escapeHtml } from './ui.js';
import { icon, iconLabel } from './icons.js';
import { montarRetrato } from './preview.js';
import { red, reanudarSala } from './red.js';
import { mandos } from './mandos.js';
import { perfilMenu } from './perfiles.js';
import { pantalla } from './pantalla.js';
import * as creador from './creador/biblioteca.js';
import * as logros from './logros.js';
import { consola } from './consola.js';
import {
  getPlayers, setPlayer, applyPlayerColors, loadSettings, updateSettings,
  loadRivalry, resetRivalry, loadRecords, PLAYER_COLORS,
  loadTournament, saveTournament, clearTournament, loadPlayed, resetPlayed,
  loadFavoritos, esFavorito, toggleFavorito, contarFavoritos,
  loadRecientes, masJugados,
} from './storage.js';
import {
  generateAvatar, loadImageFile, fallbackAvatar, avatarFor, STYLES, PALETTES,
} from './avatar.js';
import {
  RASGOS, PERSONAJE_BASE, personajeAleatorio, normalizar,
  opcionesDe, nombreDe, spriteDe, dibujarPersonajeGirado, varianteParaMiniatura,
} from './personaje.js';

/* Emoji de cara para el avatar de reserva: esto es contenido que elige el
   jugador (su carita), no decoración de la interfaz, así que se conserva. */
const EMOJIS = ['🐙', '🦊', '🐸', '🦁', '🐼', '🦄', '🐲', '🦖', '👾', '🤖',
                '👻', '🎃', '⚡️', '🔥', '🌟', '🍄', '🌵', '🎸', '🚀', '🎯'];

const el = {
  escenario: document.getElementById('escenario'),
  lienzo: document.getElementById('esc-lienzo'),
  lateral: document.getElementById('lateral'),
  progreso: document.getElementById('progreso'),
  btnNuevos: document.getElementById('btn-nuevos'),
  buscar: document.getElementById('buscar'),
  lista: document.getElementById('lista'),
  modales: document.getElementById('modales'),
  conteo: document.getElementById('conteo'),
};

let players = getPlayers();
let hayTouchBar = false;
let categoria = loadSettings().lastCategory || 'todos';
let consulta = '';
let soloNuevos = false;

/* Estado del escaparate. `grupos` es el orden de navegación: un array por
   riel (o uno solo en modo mural), y dentro los ids en el orden pintado. */
let enfocado = null;
let retratoEscenario = null;
const retratosFicha = new Map();
let grupos = [];
let observador = null;

/* ---------------- Arranque ---------------- */

async function iniciar() {
  applyPlayerColors(players);
  hayTouchBar = (await touchbar.ready()) || loadSettings().touchbarForced;

  pintarIconosCabecera();
  pintarLateral();
  pintarProgreso();
  enlazarBarra();
  pintarLista();
  pintarRivalidad();
  enlazarCabecera();
  enlazarTeclado();
  enlazarSala();

  // Los logros se anuncian al volver al menú, que es cuando hay hueco.
  setTimeout(anunciarLogros, 900);

  if (location.hash === '#torneo') abrirTorneo();
}

/* ---------------- Sala de mandos ---------------- */

/**
 * En el menú, los mandos navegan el catálogo: las cuatro direcciones mueven
 * el foco y el botón de acción entra al juego. Es la misma función `mover()`
 * del teclado, así que no hay dos caminos que mantener.
 */
function enlazarSala() {
  reanudarSala();
  mandos.iniciar();
  // Hilo musical del menú. Arranca solo cuando el navegador desbloquea el
  // audio (primer clic o tecla), que es lo que exige WebAudio.
  ambiente.iniciar(null);
  // Conectar un mando cambia el aviso de la cabecera y, si estaba enfocado un
  // juego, el estado de su botón.
  mandos.alCambiar(() => {
    pintarEstadoSala();
    if (enfocado) enfocar(enfocado, { desplazar: false, sonido: false, forzar: true });
  });
  let anunciado = false;
  red.alCambiar(() => {
    pintarEstadoSala();
    // Conectar o soltar un mando cambia si un juego de mando es jugable,
    // así que el escenario tiene que repintar su botón.
    if (enfocado) enfocar(enfocado, { desplazar: false, sonido: false, forzar: true });
    // La botonera del menú se manda una vez por conexión: el servidor la
    // guarda y se la entrega él mismo a cada mando que entre después.
    if (red.activa && !anunciado) {
      anunciado = true;
      red.enviarPerfil(0, perfilMenu(players[0].color));
      red.enviarPerfil(1, perfilMenu(players[1].color));
    }
    if (!red.activa) anunciado = false;
  });

  // Las acciones remotas ya entran por core/input.js; el hub solo necesita
  // enterarse de los flancos para mover el foco.
  let ultimo = 0;
  setInterval(() => {
    // Vale tanto un iPad emparejado como un mando físico: los dos escriben en
    // core/input.js y aquí solo se leen los flancos.
    if ((!red.activa && !mandos.hay) || el.modales.childElementCount) return;
    const ahora = performance.now();
    for (const p of [0, 1]) {
      const j = input.player(p);
      if (!j) continue;
      // Repetición controlada: en un mando se deja el dedo apoyado y el foco
      // debe avanzar a un ritmo legible, no a sesenta juegos por segundo.
      if (ahora - ultimo < 170) continue;
      const dx = j.x, dy = j.y;
      if (dx || dy) { mover(dx, dy); ultimo = ahora; }
      if (j.pressed('a') && enfocado) { jugar(enfocado); return; }
    }
    input.endFrame();
  }, 40);
}

function pintarEstadoSala() {
  const b = document.getElementById('btn-sala');
  if (!b) return;
  // Cuentan igual los iPad emparejados y los mandos físicos: para quien mira
  // el menú, "hay dos mandos" significa lo mismo venga de donde venga.
  const total = red.mandos.length + mandos.hay;
  b.classList.toggle('activo', total > 0);
  const etiqueta = total > 0
    ? `${total} mando${total > 1 ? 's' : ''}`
    : (red.activa ? red.codigo : 'Mandos');
  b.innerHTML = iconLabel('phone', `<span>${escapeHtml(etiqueta)}</span>`, { size: 15 });
}

function pintarIconosCabecera() {
  document.querySelectorAll('.hub-acciones [data-icon]').forEach((b) => {
    b.innerHTML = iconLabel(b.dataset.icon, b.dataset.label ? `<span>${b.dataset.label}</span>` : '', { size: 15 });
  });
}

/* Los juegos hechos con el creador entran en la MISMA lista que los escritos
   a mano: `entradaCatalogo()` les da la forma de una entrada de manifiesto, y
   a partir de ahí el hub, la búsqueda, el torneo y la rivalidad los tratan
   igual. No hay una «pestaña de mis juegos» aparte, y ésa es la gracia. */
function juegosVisibles() {
  const propios = creador.entradas();
  let base = consulta ? search(consulta, hayTouchBar) : visibleGames(hayTouchBar);
  if (propios.length) {
    const q = consulta.trim().toLowerCase();
    const mios = q
      ? propios.filter((g) => `${g.nombre} ${g.descripcion}`.toLowerCase().includes(q))
      : propios;
    base = [...mios, ...base];      // los tuyos primero: son los que buscas
  }
  /* Las categorías virtuales no son campos del manifiesto: son formas de
     mirar el catálogo. Con 500 juegos son la única manera de volver a lo que
     jugabas sin acordarte del nombre exacto. */
  if (categoria === 'favoritos') {
    const favs = loadFavoritos();
    base = base.filter((g) => favs[g.id]);
  } else if (categoria === 'recientes') {
    // Se respeta el ORDEN de la lista, no el del catálogo: lo último jugado
    // tiene que salir primero o la sección no sirve para nada.
    const orden = loadRecientes();
    const dentro = new Set(orden);
    base = base.filter((g) => dentro.has(g.id))
      .sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
  } else if (categoria === 'jugados') {
    const orden = masJugados(40);
    const dentro = new Set(orden);
    base = base.filter((g) => dentro.has(g.id))
      .sort((a, b) => orden.indexOf(a.id) - orden.indexOf(b.id));
  } else if (categoria !== 'todos') {
    base = base.filter((g) => g.categoria === categoria);
  }
  if (soloNuevos) {
    const jugados = loadPlayed();
    base = base.filter((g) => !jugados[g.id]);
  }
  return base;
}

/* ---------------- Navegación lateral ---------------- */

/**
 * Barra lateral estilo consola: una columna de iconos que se despliega con
 * los nombres al pasar el ratón. Con siete categorías y más de setenta
 * juegos, las píldoras de texto se comían una franja entera de pantalla;
 * así el catálogo se queda con todo el ancho y la navegación sigue a un
 * clic de distancia.
 */
function pintarLateral() {
  const visibles = visibleGames(hayTouchBar);
  const jugados = loadPlayed();
  const cuenta = (c) => visibles.filter((g) => g.categoria === c).length;
  const cats = Object.entries(CATEGORIAS).filter(([k]) => k !== 'touchbar' || hayTouchBar);

  const VIRTUALES = new Set(['todos', 'favoritos', 'recientes', 'jugados']);
  const entrada = (clave, nombre, iconoNombre, color, n) => {
    // Las virtuales no filtran por `categoria`, así que su punto de «sin
    // probar» se calcula sobre todo el catálogo o no se calcula.
    const lista = VIRTUALES.has(clave) ? visibles : visibles.filter((g) => g.categoria === clave);
    const sinProbar = lista.filter((g) => !jugados[g.id]).length;
    return `
      <button class="lat-item ${categoria === clave ? 'on' : ''}" data-cat="${clave}"
              style="--lc:${color}" title="${escapeHtml(nombre)}">
        <span class="lat-icono">${icon(iconoNombre, { size: 18 })}</span>
        <span class="lat-nombre">${escapeHtml(nombre)}</span>
        <span class="lat-n">${n}</span>
        ${sinProbar ? `<span class="lat-punto" title="${sinProbar} sin probar"></span>` : ''}
      </button>`;
  };

  el.lateral.innerHTML = `
    ${entrada('todos', 'Todos', 'grid', 'var(--ink)', visibles.length)}
    ${entrada('favoritos', 'Favoritos', 'star', '#ffd166', contarFavoritos())}
    ${entrada('recientes', 'Recientes', 'pin', '#3effc8', loadRecientes().length)}
    ${entrada('jugados', 'Más jugados', 'trophy', '#ff7847', masJugados(40).length)}
    <span class="lat-sep"></span>
    ${cats.map(([k, c]) => entrada(k, c.nombre, c.icon, c.color, cuenta(k))).join('')}`;

  /* «juegos para dos» dejó de ser cierto en cuanto hubo categoría de un
     jugador: ahora se dice cuántos hay y ya. */
  el.conteo.textContent = hayTouchBar
    ? `${visibles.length} juegos · ${TOTAL_TOUCHBAR} con Touch Bar`
    : `${visibles.length} juegos`;

  el.lateral.querySelectorAll('[data-cat]').forEach((b) => {
    b.addEventListener('click', () => {
      categoria = b.dataset.cat;
      updateSettings({ lastCategory: categoria });
      audio.select();
      pintarLateral();
      pintarLista();
    });
  });
}

/** Contador «34 de 72 probados» y el filtro de los que faltan. */
function pintarProgreso() {
  const visibles = visibleGames(hayTouchBar);
  const jugados = loadPlayed();
  const probados = visibles.filter((g) => jugados[g.id]).length;
  const pct = visibles.length ? (probados / visibles.length) * 100 : 0;

  el.progreso.innerHTML = `
    <span class="prog-barra"><i style="width:${pct}%"></i></span>
    <span class="prog-texto"><b>${probados}</b> de ${visibles.length} probados</span>`;

  el.btnNuevos.classList.toggle('on', soloNuevos);
  el.btnNuevos.innerHTML = `${icon('star', { size: 13 })}<span>Solo sin probar</span>`;
}

function enlazarBarra() {
  el.btnNuevos.addEventListener('click', () => {
    soloNuevos = !soloNuevos;
    audio.select();
    pintarProgreso();
    pintarLista();
  });
  // Rehacer la lista en cada tecla es barato: los retratos se montan por
  // visibilidad, así que escribir no dispara ochenta canvas.
  el.buscar.addEventListener('input', () => { consulta = el.buscar.value; pintarLista(); });
}

/* ---------------- Catálogo: rieles y fichas ---------------- */

/** Una ficha: el retrato ocupa todo el rectángulo y el texto va encima. */
function ficha(g, riv, jugados, favs) {
  const cat = CATEGORIAS[g.categoria];
  const est = riv.byGame[g.id];
  const total = est ? est.wins[0] + est.wins[1] : 0;
  const pct = total ? (est.wins[0] / total) * 100 : 50;
  const numero = GAMES.indexOf(g) + 1;
  const nuevo = !jugados[g.id];
  return `
    <button class="ficha ${nuevo ? 'es-nuevo' : 'probado'}" data-id="${g.id}" style="--cc:${cat.color}"
            aria-label="${escapeHtml(g.nombre)} — ${escapeHtml(cat.nombre)}${nuevo ? ' — sin probar' : ''}">
      <span class="ficha-num">${String(numero).padStart(2, '0')}</span>
      <span class="ficha-fav ${favs[g.id] ? 'on' : ''}" data-fav="${g.id}"
            role="button" tabindex="-1" aria-label="${favs[g.id] ? 'Quitar de favoritos' : 'Marcar como favorito'}"
            title="Favorito (F)">${icon('star', { size: 14 })}</span>
      <span class="ficha-etiquetas">
        ${nuevo ? '<span class="et-nuevo">NUEVO</span>' : ''}
        ${g.mandoRequerido ? `<span class="et-mando">${icon('phone', { size: 8 })} MANDO</span>` : ''}
        ${g.turnos ? '<span>POR TURNOS</span>' : ''}
        ${g.touchbar ? `<span>${icon('bars', { size: 8 })} TOUCH BAR</span>` : ''}
      </span>
      <span class="ficha-pie">
        <span class="ficha-nombre">${escapeHtml(g.nombre)}</span>
        <span class="ficha-dato">
          <span>${escapeHtml(g.duracion)}</span>
          ${total ? `<span class="barra" title="${est.wins[0]} – ${est.wins[1]}"><i style="width:${pct}%"></i></span>` : ''}
        </span>
      </span>
    </button>`;
}

function pintarLista() {
  const favs = loadFavoritos();
  const lista = juegosVisibles();
  const riv = loadRivalry();
  const jugados = loadPlayed();

  // Los retratos anteriores dejan de existir: si no se destruyen, sus canvas
  // siguen en el bucle de animación aunque su ficha ya no esté en el DOM.
  for (const r of retratosFicha.values()) r.destruir();
  retratosFicha.clear();
  observador?.disconnect();
  grupos = [];
  // El escenario también se rehace: los retratos guardan la referencia al
  // array de perfiles, y esta función es justo lo que se llama cuando un
  // jugador cambia de color.
  retratoEscenario?.destruir();
  retratoEscenario = null;

  if (!lista.length) {
    /* El mensaje tiene que explicar POR QUÉ está vacío. Con las categorías
       virtuales, el genérico de búsqueda salía como «Ningún juego coincide
       con ""», que no dice nada y encima parece un error. */
    const VACIOS = {
      favoritos: 'Todavía no habéis marcado ninguno.<br><small>Pulsa la estrella de una ficha, o <b>F</b> sobre el juego que tengas enfocado.</small>',
      recientes: 'Aquí irán apareciendo los últimos que juguéis.<br><small>Con quinientos juegos, es la forma rápida de volver al de ayer.</small>',
      jugados: 'Aquí irán los que más repitáis.<br><small>Se llena solo según jugáis.</small>',
      creados: 'No habéis hecho ninguno todavía.<br><small>El botón <b>Crear</b> de arriba abre el editor.</small>',
    };
    const texto = consulta
      ? `Ningún juego coincide con “${escapeHtml(consulta)}”.`
      : (soloNuevos
        ? 'No queda ninguno sin probar por aquí.<br><small>Quita el filtro «Solo sin probar» para verlos todos.</small>'
        : VACIOS[categoria] || 'No hay nada por aquí.');
    el.lista.innerHTML = `<p class="vacio">${texto}</p>`;
    limpiarEscenario();
    return;
  }

  // Con una categoría elegida o una búsqueda en curso, un riel horizontal
  // esconde resultados; ahí conviene el mural, que los enseña todos.
  const mural = categoria !== 'todos' || consulta.trim() !== '';

  if (mural) {
    el.lista.innerHTML = `<div class="mural">${lista.map((g) => ficha(g, riv, jugados, favs)).join('')}</div>`;
    grupos = [lista.map((g) => g.id)];
  } else {
    const cats = Object.entries(CATEGORIAS).filter(([k]) => k !== 'touchbar' || hayTouchBar);
    el.lista.innerHTML = cats.map(([k, c]) => {
      const juegos = lista.filter((g) => g.categoria === k);
      if (!juegos.length) return '';
      grupos.push(juegos.map((g) => g.id));
      return `
        <section class="riel" data-cat="${k}" style="--rc:${c.color}">
          <header class="riel-top">
            <span class="riel-icono">${icon(c.icon, { size: 14 })}</span>
            <h2>${c.nombre}</h2>
            <span class="riel-n">${juegos.length}</span>
            <span class="riel-desc">${escapeHtml(c.desc)}</span>
            <span class="riel-nav">
              <button data-desliz="-1" aria-label="Anterior">${icon('chevronLeft', { size: 14 })}</button>
              <button data-desliz="1" aria-label="Siguiente">${icon('chevronRight', { size: 14 })}</button>
            </span>
          </header>
          <div class="riel-pista">${juegos.map((g) => ficha(g, riv, jugados, favs)).join('')}</div>
        </section>`;
    }).join('');
  }

  el.lista.querySelectorAll('[data-desliz]').forEach((b) => {
    b.addEventListener('click', () => {
      const pista = b.closest('.riel').querySelector('.riel-pista');
      pista.scrollBy({ left: +b.dataset.desliz * pista.clientWidth * 0.8, behavior: 'smooth' });
    });
  });

  const porId = new Map(lista.map((g) => [g.id, g]));
  /* La estrella va DENTRO del botón de la ficha, así que su clic tiene que
     pararse aquí: si no, marcar favorito lanzaría también el juego. */
  el.lista.querySelectorAll('[data-fav]').forEach((s2) => {
    s2.addEventListener('click', (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const on = toggleFavorito(s2.dataset.fav);
      s2.classList.toggle('on', on);
      s2.setAttribute('aria-label', on ? 'Quitar de favoritos' : 'Marcar como favorito');
      audio[on ? 'pickup' : 'blip']();
      pintarLateral();
      if (categoria === 'favoritos') pintarLista();
    });
  });

  el.lista.querySelectorAll('.ficha').forEach((f) => {
    const g = porId.get(f.dataset.id);
    f.addEventListener('click', () => jugar(g.id));
    f.addEventListener('mouseenter', () => {
      enfocar(g.id, { desplazar: false, sonido: false });
      retratosFicha.get(g.id)?.arrancar();
    });
    f.addEventListener('mouseleave', () => retratosFicha.get(g.id)?.parar());
    f.addEventListener('focus', () => enfocar(g.id, { desplazar: false, sonido: false }));
  });

  // Montaje perezoso: ochenta y tres canvas a la vez son decenas de megas de
  // memoria de vídeo para fichas que nadie está mirando. Cada retrato nace
  // cuando su ficha se asoma a la pantalla, y ya no se desmonta.
  observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      const f = e.target;
      observador.unobserve(f);
      const g = porId.get(f.dataset.id);
      if (!g || retratosFicha.has(g.id)) continue;
      retratosFicha.set(g.id, montarRetrato(f, g, players, CATEGORIAS[g.categoria].color, { vineta: 0.35 }));
    }
  }, { rootMargin: '240px' });
  el.lista.querySelectorAll('.ficha').forEach((f) => observador.observe(f));

  // El escenario mantiene el juego enfocado si sigue en la lista; si no,
  // arranca por el primero de lo que se esté viendo ahora.
  const preferido = (enfocado && porId.has(enfocado) && enfocado)
    || (loadSettings().lastGame && porId.has(loadSettings().lastGame) && loadSettings().lastGame)
    || grupos[0][0];
  enfocar(preferido, { desplazar: false, sonido: false, forzar: true });
}

/* ---------------- Escenario ---------------- */

function limpiarEscenario() {
  retratoEscenario?.destruir();
  retratoEscenario = null;
  enfocado = null;
  // Sin juego enfocado, el escenario se queda con su esqueleto a la vista —un
  // punto, un guion y un botón sin texto— y parece roto. Mejor vacío del todo.
  el.escenario?.classList.add('sin-juego');
}

/**
 * Pone un juego en el escenario y marca su ficha.
 * @param {string} id
 * @param {object} opciones desplazar: llevar la ficha a la vista;
 *                          forzar: repintar aunque ya sea el enfocado.
 */
function enfocar(id, { desplazar = true, sonido = true, forzar = false } = {}) {
  if (!forzar && id === enfocado) return;
  const g = byId(id);
  if (!g) return;
  el.escenario?.classList.remove('sin-juego');
  enfocado = id;
  updateSettings({ lastGame: id });

  const cat = CATEGORIAS[g.categoria];
  el.escenario.style.setProperty('--cc', cat.color);

  // El canvas del escenario se reaprovecha: pasar el ratón por un riel cambia
  // de juego decenas de veces, y crear y destruir un canvas de pantalla
  // completa en cada uno se nota.
  if (retratoEscenario) {
    retratoEscenario.cambiar(g, cat.color);
  } else {
    retratoEscenario = montarRetrato(el.lienzo, g, players, cat.color, { vineta: 0.32, aspecto: 1.9 });
    retratoEscenario.arrancar();
  }

  const numero = GAMES.indexOf(g) + 1;
  document.getElementById('esc-cat').innerHTML = `${icon(cat.icon, { size: 12 })} ${cat.nombre}`;
  document.getElementById('esc-num').textContent = `Nº ${String(numero).padStart(2, '0')} · ${g.duracion}${g.turnos ? ' · por turnos' : ''}`;
  document.getElementById('esc-titulo').textContent = g.nombre;
  document.getElementById('esc-desc').textContent = g.descripcion;

  // Solo la primera línea de controles de cada jugador: en el escenario
  // interesa el gesto principal, no el manual entero.
  document.getElementById('esc-controles').innerHTML = [0, 1].map((i) => {
    const linea = (g.controles?.[`p${i + 1}`] || [])[0] || '';
    const teclas = linea.includes(':') ? linea.slice(0, linea.indexOf(':')) : linea;
    return `<span class="tecla-grupo" style="--tc:${players[i].color}">
              <b>${escapeHtml(players[i].name)}</b>
              <span class="kbd">${escapeHtml(teclas.trim() || '—')}</span>
            </span>`;
  }).join('');

  const jugarBtn = document.getElementById('esc-jugar');
  // Un juego de mando sin mandos conectados no se puede jugar: el botón lo
  // dice en vez de dejar entrar a una pantalla que no responde.
  const faltanMandos = g.mandoRequerido && red.mandos.length < 2;
  jugarBtn.classList.toggle('pide-mando', !!faltanMandos);
  jugarBtn.innerHTML = faltanMandos
    ? `${icon('phone', { size: 13 })}<span>CONECTAR MANDOS</span>`
    : `${icon('play', { size: 13 })}<span>JUGAR</span>`;
  jugarBtn.dataset.accion = faltanMandos ? 'sala' : 'jugar';

  const est = loadRivalry().byGame[g.id];
  const total = est ? est.wins[0] + est.wins[1] : 0;
  document.getElementById('esc-historial').innerHTML = total
    ? `<span>${est.plays} partidas</span>
       <b class="h1">${est.wins[0]}</b>
       <span class="barra"><i style="width:${(est.wins[0] / total) * 100}%"></i></span>
       <b class="h2">${est.wins[1]}</b>`
    : '<span>Sin partidas todavía</span>';

  // Reinicia la animación de entrada del bloque de texto en cada cambio.
  const info = el.escenario.querySelector('.esc-info');
  info.style.animation = 'none';
  void info.offsetWidth;
  info.style.animation = '';

  el.lista.querySelectorAll('.ficha.enfocada').forEach((f) => f.classList.remove('enfocada'));
  const f = el.lista.querySelector(`.ficha[data-id="${CSS.escape(id)}"]`);
  if (f) {
    f.classList.add('enfocada');
    if (desplazar) f.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
  if (sonido) audio.blip();
}

/* ---------------- Navegación con teclado ---------------- */

/** Columnas visibles del mural, deducidas del propio layout. */
function columnasMural() {
  const fichas = [...el.lista.querySelectorAll('.ficha')];
  if (!fichas.length) return 1;
  const primera = fichas[0].offsetTop;
  const n = fichas.filter((f) => f.offsetTop === primera).length;
  return Math.max(1, n);
}

function mover(dx, dy) {
  if (!grupos.length) return;
  let gi = grupos.findIndex((ids) => ids.includes(enfocado));
  if (gi < 0) { gi = 0; }
  let i = Math.max(0, grupos[gi].indexOf(enfocado));

  if (dy && grupos.length === 1) {
    // Mural: arriba y abajo saltan una fila entera.
    i = clampIndice(i + dy * columnasMural(), grupos[0].length);
  } else if (dy) {
    const nuevo = clampIndice(gi + dy, grupos.length);
    if (nuevo === gi) return;
    gi = nuevo;
    i = clampIndice(i, grupos[gi].length);
  } else {
    i = clampIndice(i + dx, grupos[gi].length);
  }
  enfocar(grupos[gi][i]);
}

const clampIndice = (i, largo) => Math.max(0, Math.min(i, largo - 1));

function enlazarTeclado() {
  window.addEventListener('keydown', (e) => {
    // Un modal abierto o el buscador con el cursor dentro mandan sobre el hub.
    if (el.modales.childElementCount) return;
    const foco = document.activeElement;
    if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'SELECT' || foco.tagName === 'TEXTAREA')) {
      if (e.key === 'Escape') foco.blur();
      return;
    }
    const mapa = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (mapa[e.key]) {
      e.preventDefault();
      mover(...mapa[e.key]);
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && enfocado) {
      e.preventDefault();
      jugar(enfocado);
      return;
    }
    // F sobre el juego que tengas enfocado: es lo que hace que marcar
    // favoritos sea rápido de verdad recorriendo el catálogo con las flechas.
    if ((e.key === 'f' || e.key === 'F') && enfocado) {
      e.preventDefault();
      const on = toggleFavorito(enfocado);
      audio[on ? 'pickup' : 'blip']();
      const estrella = el.lista.querySelector(`[data-fav="${CSS.escape(enfocado)}"]`);
      estrella?.classList.toggle('on', on);
      pintarLateral();
      if (categoria === 'favoritos') pintarLista();
    }
  });

  // El escenario se redibuja al cambiar de tamaño: su canvas es de píxeles.
  let temporizador;
  window.addEventListener('resize', () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      retratoEscenario?.redibujar();
      for (const r of retratosFicha.values()) r.redibujar();
    }, 140);
  });
}

function jugar(id, enTorneo = false) {
  audio.select();
  haptics.play('impact');
  location.href = `play.html?g=${encodeURIComponent(id)}${enTorneo ? '&t=1' : ''}`;
}

/* ---------------- Cabecera ---------------- */

function enlazarCabecera() {
  document.getElementById('esc-jugar').addEventListener('click', (e) => {
    if (e.currentTarget.dataset.accion === 'sala') { abrirSala(); return; }
    if (enfocado) jugar(enfocado);
  });
  document.getElementById('btn-sala').addEventListener('click', abrirSala);
  document.getElementById('btn-perfiles').addEventListener('click', abrirPerfiles);
  document.getElementById('btn-ajustes').addEventListener('click', abrirAjustes);
  document.getElementById('btn-torneo').addEventListener('click', abrirTorneo);
  document.getElementById('rivalry').addEventListener('click', abrirRivalidad);
  document.getElementById('btn-azar').addEventListener('click', () => {
    const lista = juegosVisibles();
    if (!lista.length) return;
    jugar(lista[Math.floor(Math.random() * lista.length)].id);
  });
  document.getElementById('btn-crear').addEventListener('click', () => abrirMisJuegos());
  document.getElementById('btn-logros').addEventListener('click', abrirLogros);
  document.getElementById('btn-pantalla').addEventListener('click', () => {
    // Por el módulo, no por `requestFullscreen`: en Electron la pantalla
    // completa HTML se cae sola al navegar a un juego. Ver core/pantalla.js.
    pantalla.alternar();
  });
}

function pintarRivalidad() {
  const r = loadRivalry();
  document.getElementById('riv-n1').textContent = r.total[0];
  document.getElementById('riv-n2').textContent = r.total[1];
  document.getElementById('riv-av1').src = avatarFor(players[0]);
  document.getElementById('riv-av2').src = avatarFor(players[1]);
}

/* ---------------- Modales ---------------- */

function modal(html, { ancho = '' } = {}) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal" ${ancho ? `style="width:${ancho}"` : ''}>${html}</div>`;
  el.modales.appendChild(fondo);
  const cerrar = () => { fondo.remove(); audio.back(); };
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  fondo.querySelector('.modal-cerrar')?.addEventListener('click', cerrar);
  const onEsc = (e) => { if (e.key === 'Escape') { cerrar(); window.removeEventListener('keydown', onEsc); } };
  window.addEventListener('keydown', onEsc);
  return { fondo, caja: fondo.querySelector('.modal'), cerrar };
}

const botonCerrar = () => `<button class="modal-cerrar">${icon('close', { size: 18 })}</button>`;

/* ---------------- Sala de mandos ---------------- */

function abrirSala() {
  audio.select();
  red.abrir();

  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('phone', { size: 17 })} Mandos táctiles</h2>
    <p style="font-size:14px;color:var(--ink-dim);margin-top:0">
      Convierte un iPad o un móvil en el mando de un jugador. Los dos dispositivos
      tienen que estar en la misma wifi; nada de esto sale a internet.
    </p>
    <div id="sala-cuerpo"></div>
  `, { ancho: 'min(620px, 100%)' });

  const pintar = () => {
    const cuerpo = m.caja.querySelector('#sala-cuerpo');
    if (!cuerpo) return;

    if (red.estado === 'error') {
      cuerpo.innerHTML = `
        <div class="tb-estado"><span class="punto"></span><span>${escapeHtml(red.motivo)}</span></div>
        <h3>Cómo activarlo</h3>
        <p style="font-size:13px;color:var(--ink-dim);line-height:1.6">
          Las salas necesitan el servidor de Node que viene con el proyecto.
          Cierra este servidor y arranca el arcade con <b>start.command</b>
          (doble clic en Finder), o desde la terminal:
        </p>
        <div class="sala-url"><code>node server/servidor.js</code></div>`;
      return;
    }

    if (red.estado !== 'abierta') {
      cuerpo.innerHTML = '<p class="vacio">Abriendo la sala…</p>';
      return;
    }

    cuerpo.innerHTML = `
      <div class="sala-codigo">
        <span class="sala-etiqueta">Código de sala</span>
        <b>${escapeHtml(red.codigo)}</b>
      </div>

      <h3>1 · Abre esta dirección en el iPad</h3>
      <div class="sala-url"><code>${escapeHtml(red.url)}</code></div>
      ${red.direcciones.length > 1 ? `
        <p style="font-size:11.5px;color:var(--ink-faint);margin:6px 0 0">
          Si esa no funciona, prueba con:
          ${red.direcciones.slice(1).map((d) => `<code>http://${escapeHtml(d)}:${red.puerto}/mando</code>`).join(' · ')}
        </p>` : ''}

      <h3>2 · Escribe el código y elige jugador</h3>
      <div class="sala-mandos">
        ${[0, 1].map((s) => {
          const puesto = red.mandos.includes(s);
          return `
            <div class="sala-mando ${puesto ? 'on' : ''}" style="--mc:${players[s].color}">
              <img src="${avatarFor(players[s])}" alt="">
              <b>${escapeHtml(players[s].name)}</b>
              <span>${puesto ? 'Mando conectado' : 'Teclado de la Mac'}</span>
            </div>`;
        }).join('')}
      </div>

      <p style="font-size:12px;color:var(--ink-faint);margin-top:16px;line-height:1.6">
        El mando funciona con los ${TOTAL_TECLADO} juegos del catálogo: los botones cambian
        solos según el juego que elijas. Puedes mezclar — uno con iPad y el otro con teclado.
      </p>
      <div class="ui-card-actions" style="margin-top:16px">
        <button class="btn ghost" id="sala-cerrar-todo">Cerrar la sala</button>
      </div>`;

    cuerpo.querySelector('#sala-cerrar-todo')?.addEventListener('click', () => {
      red.cerrar();
      audio.back();
      m.cerrar();
      pintarEstadoSala();
    });
  };

  pintar();
  const desuscribir = red.alCambiar(pintar);
  // El modal puede cerrarse por Escape o por clic fuera: en cualquier caso
  // hay que soltar la suscripción o se acumulan repintados de un DOM muerto.
  new MutationObserver(() => {
    if (!document.body.contains(m.fondo)) desuscribir();
  }).observe(el.modales, { childList: true });
}

/* ---------------- Perfiles ---------------- */

function abrirPerfiles() {
  audio.select();
  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('users', { size: 17 })} Jugadores</h2>
    <div class="perfiles">${[0, 1].map(fichaPerfil).join('')}</div>
    <p style="font-size:12px;color:var(--ink-faint);margin-top:20px">
      Crea un personaje pieza a pieza, o usa una foto tuya. Con personaje,
      además del avatar, es él quien sale corriendo dentro de las partidas.
      Todo se procesa en tu Mac y nunca sale de aquí.
    </p>`);

  m.caja.querySelectorAll('[data-crear]').forEach((b) => {
    b.addEventListener('click', () => abrirCreador(+b.dataset.crear, m));
  });
  m.caja.querySelectorAll('[data-foto]').forEach((b) => {
    b.addEventListener('click', () => abrirEditorAvatar(+b.dataset.foto, m));
  });

  m.caja.querySelectorAll('[data-perfil]').forEach((cont) => {
    const i = +cont.dataset.perfil;

    // Tocar el avatar abre el creador, que es la vía principal; la foto
    // sigue estando a un botón de distancia.
    cont.querySelector('.perfil-av').addEventListener('click', () => abrirCreador(i, m));

    const nombre = cont.querySelector('input[type="text"]');
    nombre.addEventListener('input', () => {
      players[i] = setPlayer(i, { name: nombre.value.slice(0, 16) || `Jugador ${i + 1}` });
      pintarRivalidad();
    });

    cont.querySelectorAll('.color-op').forEach((c) => {
      c.addEventListener('click', () => {
        players[i] = setPlayer(i, { color: c.dataset.color });
        applyPlayerColors(players);
        audio.blip();
        haptics.play('click', { player: i });
        cont.querySelectorAll('.color-op').forEach((o) => o.classList.toggle('on', o === c));
        if (!players[i].avatar) cont.querySelector('.perfil-av').src = avatarFor(players[i]);
        pintarRivalidad();
        pintarLista();
      });
    });

    cont.querySelectorAll('.emoji-op').forEach((e) => {
      e.addEventListener('click', () => {
        players[i] = setPlayer(i, { emoji: e.dataset.emoji });
        audio.blip();
        cont.querySelectorAll('.emoji-op').forEach((o) => o.classList.toggle('on', o === e));
        if (!players[i].avatar) cont.querySelector('.perfil-av').src = avatarFor(players[i]);
        pintarRivalidad();
      });
    });
  });
}

function fichaPerfil(i) {
  const p = players[i];
  return `
    <div class="perfil" data-perfil="${i}">
      <img class="perfil-av" src="${avatarFor(p)}" alt="Avatar de ${escapeHtml(p.name)}" title="Cambiar avatar">
      <input type="text" value="${escapeHtml(p.name)}" maxlength="16" aria-label="Nombre del jugador ${i + 1}">
      <div class="perfil-botones">
        <button class="btn small primary" data-crear="${i}">${icon('palette', { size: 13 })} Crear personaje</button>
        <button class="btn small" data-foto="${i}">${icon('camera', { size: 13 })} Usar foto</button>
      </div>
      <div class="colores">
        ${PLAYER_COLORS.map((c) => `
          <button class="color-op ${p.color === c ? 'on' : ''}" data-color="${c}"
                  style="background:${c};color:${c}" aria-label="Color ${c}"></button>`).join('')}
      </div>
      <div class="emojis">
        ${EMOJIS.map((e) => `
          <button class="emoji-op ${p.emoji === e ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}
      </div>
    </div>`;
}

/* ---------------- Creador de personaje ---------------- */

/**
 * Editor tipo "crea un personaje": a la izquierda el muñeco andando, a la
 * derecha una fila por rasgo con flechas para recorrer sus opciones.
 *
 * Los controles no están escritos a mano: se generan recorriendo RASGOS de
 * core/personaje.js, así que añadir un peinado o un sombrero allí lo hace
 * aparecer aquí sin tocar este archivo.
 */
function abrirCreador(indice, modalPadre) {
  const jugador = players[indice];
  let rasgos = normalizar(jugador.personaje || PERSONAJE_BASE);
  let grupoActivo = 'Cuerpo';

  const grupos = [...new Set(RASGOS.map((r) => r.grupo))];

  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('palette', { size: 17 })} Personaje de ${escapeHtml(jugador.name)}</h2>
    <div class="cas">
      <div class="cas-vista">
        <div class="cas-peana" id="cas-peana" title="Arrastra para girar">
          <div class="cas-3d" id="cas-3d"></div>
          <canvas id="cas-lienzo" width="260" height="330" hidden></canvas>
        </div>
        <div class="cas-giro">
          <button class="cas-flecha" data-girar="-45" aria-label="Girar a la izquierda">${icon('chevronLeft', { size: 14 })}</button>
          <input type="range" id="cas-angulo" min="0" max="359" value="0" aria-label="Girar el personaje">
          <button class="cas-flecha" data-girar="45" aria-label="Girar a la derecha">${icon('chevronRight', { size: 14 })}</button>
        </div>
        <div class="cas-poses">
          <button class="btn small" data-pose="quieto">Quieto</button>
          <button class="btn small primary" data-pose="anda">Andando</button>
          <button class="btn small" data-pose="salta">Saltando</button>
        </div>
        <div class="cas-extras">
          <button class="btn small" id="cas-vueltas">Girar solo</button>
          <button class="btn small" id="cas-azar">${icon('dice', { size: 13 })} Al azar</button>
        </div>
      </div>
      <div class="cas-panel">
        <div class="cas-pestanas">
          ${grupos.map((g) => `<button class="cas-pestana ${g === grupoActivo ? 'on' : ''}" data-grupo="${g}">${g}</button>`).join('')}
        </div>
        <div class="cas-rasgos" id="cas-rasgos"></div>
      </div>
    </div>
    <div class="cas-pie">
      <button class="btn ghost" id="cas-cancelar">Cancelar</button>
      <button class="btn primary" id="cas-guardar">Guardar personaje</button>
    </div>`, { ancho: 'min(960px, 100%)' });

  const lienzo = m.caja.querySelector('#cas-lienzo');
  const g2d = lienzo.getContext('2d');
  let pose = 'anda';
  let frame = 0;
  let animando = true;
  let angulo = 0;
  let girandoSolo = false;

  /* Visor 3D. Se carga bajo demanda: Three.js son 366 KB y solo hacen falta
     si de verdad abres el creador, no cada vez que entras al menú. Si algo
     falla —WebGL desactivado, por ejemplo— el editor sigue funcionando con
     la vista de sprite de siempre, que se queda como reserva. */
  let visor = null;
  (async () => {
    try {
      const { crearVisor3D } = await import('./personaje3d.js');
      visor = crearVisor3D(m.caja.querySelector('#cas-3d'));
      visor.actualizar(rasgos, jugador.color);
      visor.pose(pose);
      m.caja.querySelector('#cas-3d').classList.add('listo');
    } catch (e) {
      console.warn('Sin vista 3D, se usa el sprite:', e);
      lienzo.hidden = false;
      m.caja.querySelector('#cas-3d').remove();
      pintarVista();
    }
  })();

  /* La vista previa se anima y se puede girar: un personaje quieto y de
     frente no deja ver si el peinado, la capa o el gorro aguantan desde
     otro ángulo ni cómo se mueven, que es como se le verá jugando. */
  /**
   * Refresca la vista previa. Con 3D disponible manda el modelo; si no, se
   * dibuja el sprite en el canvas de reserva.
   */
  function pintarVista() {
    if (visor) {
      visor.girar(angulo);
      visor.pose(pose);
      return;
    }
    if (lienzo.hidden) return;
    const W = lienzo.width, H = lienzo.height;
    g2d.clearRect(0, 0, W, H);

    // Peana: un disco en perspectiva que da referencia del giro.
    const suelo = H - 26;
    g2d.save();
    g2d.strokeStyle = jugador.color + '55';
    g2d.lineWidth = 2;
    g2d.beginPath();
    g2d.ellipse(W / 2, suelo + 8, 74, 15, 0, 0, Math.PI * 2);
    g2d.stroke();
    g2d.fillStyle = jugador.color + '14';
    g2d.fill();
    // Marca que gira con el personaje: sin ella, de frente y de espaldas
    // costaría saber hacia dónde está mirando.
    const rad = (angulo * Math.PI) / 180;
    g2d.fillStyle = jugador.color;
    g2d.beginPath();
    g2d.ellipse(W / 2 + Math.sin(rad) * 74, suelo + 8 + Math.cos(rad) * 15, 5, 3.5, 0, 0, Math.PI * 2);
    g2d.fill();
    g2d.restore();

    g2d.fillStyle = '#00000055';
    g2d.beginPath();
    g2d.ellipse(W / 2, suelo + 4, 34, 7, 0, 0, Math.PI * 2);
    g2d.fill();

    dibujarPersonajeGirado(g2d, rasgos, W / 2, suelo, 290, angulo, {
      pose, frame, acento: jugador.color,
    });
  }

  // El modelo 3D se anima solo en su propio bucle; este intervalo solo mueve
  // el ángulo y el fotograma del sprite de reserva.
  let temporizador = setInterval(() => {
    if (girandoSolo) {
      angulo = (angulo + 2.2) % 360;
      m.caja.querySelector('#cas-angulo').value = String(Math.round(angulo));
      visor?.girar(angulo);
    }
    if (!visor && animando) { frame = (frame + 1) % 4; pintarVista(); }
  }, 40);

  /* --- Giro con el ratón, como se espera de un visor de modelo --- */
  const peana = m.caja.querySelector('#cas-peana');
  let arrastrando = false;
  let xPrevio = 0;
  peana.addEventListener('pointerdown', (e) => {
    arrastrando = true;
    xPrevio = e.clientX;
    girandoSolo = false;
    peana.setPointerCapture(e.pointerId);
  });
  peana.addEventListener('pointermove', (e) => {
    if (!arrastrando) return;
    angulo = (angulo + (e.clientX - xPrevio) * 1.2 + 360) % 360;
    xPrevio = e.clientX;
    m.caja.querySelector('#cas-angulo').value = String(Math.round(angulo));
    pintarVista();
  });
  const soltarPeana = () => { arrastrando = false; };
  peana.addEventListener('pointerup', soltarPeana);
  peana.addEventListener('pointercancel', soltarPeana);

  m.caja.querySelector('#cas-angulo').addEventListener('input', (e) => {
    angulo = +e.target.value;
    girandoSolo = false;
    pintarVista();
  });
  m.caja.querySelectorAll('[data-girar]').forEach((b) => {
    b.addEventListener('click', () => {
      angulo = (angulo + Number(b.dataset.girar) + 360) % 360;
      girandoSolo = false;
      m.caja.querySelector('#cas-angulo').value = String(Math.round(angulo));
      audio.blip();
      pintarVista();
    });
  });
  m.caja.querySelector('#cas-vueltas').addEventListener('click', (e) => {
    girandoSolo = !girandoSolo;
    e.currentTarget.classList.toggle('primary', girandoSolo);
    audio.blip();
  });

  /**
   * Rejilla de miniaturas: cada opción se ve dibujada de verdad, en vez de
   * tener que ir pasando con flechas y leer un nombre. Con doce peinados y
   * doce accesorios, ir de uno en uno era el cuello de botella del editor.
   */
  function pintarRasgos() {
    const cont = m.caja.querySelector('#cas-rasgos');
    cont.innerHTML = RASGOS.filter((r) => r.grupo === grupoActivo).map((r) => {
      const valor = rasgos[r.clave];
      const n = opcionesDe(r);
      const opciones = Array.from({ length: n }, (_, i) => {
        if (r.colores) {
          return `<button class="cas-op cas-op-color ${i === valor ? 'on' : ''}" data-clave="${r.clave}" data-valor="${i}"
                          style="background:${r.colores[i]}" title="${escapeHtml(nombreDe(r, i))}"></button>`;
        }
        return `<button class="cas-op ${i === valor ? 'on' : ''}" data-clave="${r.clave}" data-valor="${i}"
                        title="${escapeHtml(r.lista[i].nombre)}">
                  <canvas class="cas-mini" width="52" height="66" data-mini="${r.clave}:${i}"></canvas>
                </button>`;
      }).join('');
      return `
        <div class="cas-rasgo" data-clave="${r.clave}">
          <span class="cas-etiqueta">${r.etiqueta}<b>${escapeHtml(nombreDe(r, valor))}</b></span>
          <div class="cas-opciones">${opciones}</div>
        </div>`;
    }).join('');

    // Las miniaturas se pintan tras insertar el HTML: cada una es el mismo
    // personaje con ese único rasgo cambiado, así se compara de verdad.
    cont.querySelectorAll('[data-mini]').forEach((mini) => {
      const [clave, i] = mini.dataset.mini.split(':');
      // `varianteParaMiniatura` quita lo que taparía justo el rasgo que se está
      // comparando: con un casco puesto, los doce peinados salían idénticos.
      const variante = varianteParaMiniatura(rasgos, clave, i);
      const mg = mini.getContext('2d');
      const sp = spriteDe(variante, { acento: jugador.color });
      mg.imageSmoothingEnabled = false;
      // Los rasgos de la cara se enseñan de cerca; el resto, de cuerpo entero.
      const deCara = ['Cabeza', 'Cara'].includes(grupoActivo);
      if (deCara) mg.drawImage(sp, 4, 0, 18, 16, -2, 2, 56, 50);
      else mg.drawImage(sp, 0, 0, 26, 34, 6, 2, 40, 62);
    });

    cont.querySelectorAll('[data-valor]').forEach((b) => {
      b.addEventListener('click', () => {
        rasgos[b.dataset.clave] = Number(b.dataset.valor);
        audio.blip();
        pintarRasgos();
        visor?.actualizar(rasgos, jugador.color);
        pintarVista();
      });
    });
  }

  m.caja.querySelectorAll('[data-grupo]').forEach((b) => {
    b.addEventListener('click', () => {
      grupoActivo = b.dataset.grupo;
      m.caja.querySelectorAll('[data-grupo]').forEach((o) => o.classList.toggle('on', o === b));
      audio.select();
      pintarRasgos();
    });
  });

  m.caja.querySelectorAll('[data-pose]').forEach((b) => {
    b.addEventListener('click', () => {
      pose = b.dataset.pose;
      animando = pose === 'anda';
      frame = 0;
      m.caja.querySelectorAll('[data-pose]').forEach((o) => o.classList.toggle('primary', o === b));
      pintarVista();
    });
  });

  m.caja.querySelector('#cas-azar').addEventListener('click', () => {
    rasgos = personajeAleatorio();
    audio.pickup();
    pintarRasgos();
    visor?.actualizar(rasgos, jugador.color);
    pintarVista();
  });

  m.caja.querySelector('#cas-guardar').addEventListener('click', () => {
    players[indice] = setPlayer(indice, { personaje: rasgos, modoAvatar: 'personaje' });
    audio.win();
    haptics.play('score', { player: indice });
    refrescarPerfil(indice, modalPadre);
    m.cerrar();
  });
  m.caja.querySelector('#cas-cancelar').addEventListener('click', () => m.cerrar());

  // El intervalo y el visor 3D deben morir con el modal: si no, seguirían
  // animando y ocupando memoria de vídeo sobre un DOM que ya no existe.
  new MutationObserver(() => {
    if (document.body.contains(m.fondo)) return;
    clearInterval(temporizador);
    visor?.destruir();
    visor = null;
  }).observe(el.modales, { childList: true });

  pintarRasgos();
  pintarVista();
}

/** Repinta el avatar de un jugador en el modal de perfiles y en todo el hub. */
function refrescarPerfil(indice, modalPadre) {
  players = getPlayers();
  const av = modalPadre?.caja.querySelector(`[data-perfil="${indice}"] .perfil-av`);
  if (av) av.src = avatarFor(players[indice]);
  pintarRivalidad();
  pintarLista();
}

/* ---------------- Editor de avatar (a partir de una foto) ---------------- */

function abrirEditorAvatar(indice, modalPadre) {
  const p = players[indice];
  let imagen = null;
  const opciones = {
    style: 'arcade', zoom: 1, offsetX: 0, offsetY: 0,
    brightness: 0, accent: p.color, size: 256,
  };

  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('camera', { size: 17 })} Avatar de ${escapeHtml(p.name)}</h2>
    <div class="av">
      <div class="av-vista">
        <img id="av-img" src="${avatarFor(p)}" alt="Vista previa">
        <button class="btn small" id="av-quitar">Quitar foto</button>
      </div>
      <div class="av-mandos">
        <div class="av-soltar" id="av-soltar">
          Arrastra una foto aquí<br><small>o haz clic para elegirla</small>
          <input type="file" id="av-archivo" accept="image/*" hidden>
        </div>
        <h3 style="margin-top:14px">Estilo</h3>
        <div class="av-estilos" id="av-estilos">
          ${Object.entries(STYLES).map(([k, s]) => `
            <button class="av-estilo ${k === 'arcade' ? 'on' : ''}" data-estilo="${k}">${s.nombre}</button>`).join('')}
        </div>
        <h3>Ajuste</h3>
        <div class="av-deslizador"><span>Encuadre</span><input type="range" id="av-zoom" min="70" max="260" value="100"></div>
        <div class="av-deslizador"><span>Horizontal</span><input type="range" id="av-x" min="-100" max="100" value="0"></div>
        <div class="av-deslizador"><span>Vertical</span><input type="range" id="av-y" min="-100" max="100" value="0"></div>
        <div class="av-deslizador"><span>Luz</span><input type="range" id="av-luz" min="-70" max="70" value="0"></div>
        <div class="av-deslizador"><span>Detalle</span><input type="range" id="av-detalle" min="14" max="96" value="40"></div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn primary" id="av-guardar" style="flex:1">Guardar avatar</button>
        </div>
      </div>
    </div>`, { ancho: 'min(720px, 100%)' });

  const img = m.caja.querySelector('#av-img');
  const drop = m.caja.querySelector('#av-soltar');
  const file = m.caja.querySelector('#av-archivo');

  function refrescar() {
    if (!imagen) return;
    try {
      img.src = generateAvatar(imagen, opciones);
    } catch (e) {
      console.error(e);
    }
  }

  drop.addEventListener('click', () => file.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('activo'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('activo'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('activo');
    const f = e.dataTransfer.files[0];
    if (f) cargar(f);
  });
  file.addEventListener('change', () => { if (file.files[0]) cargar(file.files[0]); });

  async function cargar(f) {
    try {
      imagen = await loadImageFile(f);
      drop.textContent = 'Foto cargada · ajusta y guarda';
      audio.pickup();
      refrescar();
    } catch (err) {
      drop.textContent = err.message;
      audio.error();
    }
  }

  m.caja.querySelectorAll('[data-estilo]').forEach((b) => {
    b.addEventListener('click', () => {
      opciones.style = b.dataset.estilo;
      opciones.pixelSize = null;
      m.caja.querySelector('#av-detalle').value = STYLES[b.dataset.estilo].pixelSize;
      m.caja.querySelectorAll('[data-estilo]').forEach((o) => o.classList.toggle('on', o === b));
      audio.blip();
      refrescar();
    });
  });

  const enlazar = (id, prop, transformar) => {
    m.caja.querySelector(id).addEventListener('input', (e) => {
      opciones[prop] = transformar(+e.target.value);
      refrescar();
    });
  };
  enlazar('#av-zoom', 'zoom', (v) => v / 100);
  enlazar('#av-x', 'offsetX', (v) => v / 100);
  enlazar('#av-y', 'offsetY', (v) => v / 100);
  enlazar('#av-luz', 'brightness', (v) => v / 100);
  enlazar('#av-detalle', 'pixelSize', (v) => v);

  m.caja.querySelector('#av-quitar').addEventListener('click', () => {
    // Quitar la foto devuelve el mando al personaje, si lo hay.
    players[indice] = setPlayer(indice, { avatar: null, modoAvatar: 'personaje' });
    audio.back();
    refrescarPerfil(indice, modalPadre);
    m.cerrar();
  });

  m.caja.querySelector('#av-guardar').addEventListener('click', () => {
    if (!imagen) {
      players[indice] = setPlayer(indice, { avatar: null, modoAvatar: 'personaje' });
    } else {
      players[indice] = setPlayer(indice, { avatar: generateAvatar(imagen, opciones), modoAvatar: 'foto' });
    }
    audio.win();
    haptics.play('score', { player: indice });
    refrescarPerfil(indice, modalPadre);
    m.cerrar();
  });
}

/* ---------------- Logros ---------------- */

function abrirLogros() {
  audio.select();
  const lista = logros.estado(GAMES);
  const hechos = lista.filter((l) => l.conseguido).length;
  modal(`
    ${botonCerrar()}
    <h2>${icon('medalla', { size: 17 })} Logros <span style="opacity:.5;font-size:14px">${hechos} de ${lista.length}</span></h2>
    <div class="logros">
      ${lista.map((l) => `
        <div class="logro ${l.conseguido ? 'on' : ''}">
          <span class="logro-icono">${icon(l.icono, { size: 18 })}</span>
          <span class="logro-txt">
            <b>${escapeHtml(l.nombre)}</b>
            <small>${escapeHtml(l.desc)}</small>
          </span>
          <span class="logro-prog">
            ${l.conseguido ? icon('check', { size: 16 }) : `${l.progreso}/${l.de}`}
            ${l.de > 1 ? `<i style="width:${Math.round((l.progreso / l.de) * 100)}%"></i>` : ''}
          </span>
        </div>`).join('')}
    </div>`);
}

/**
 * Anuncia los logros recién conseguidos.
 * Se llama al volver al menú, no dentro de la partida: interrumpir una jugada
 * con un cartel es la forma más rápida de que un logro caiga mal.
 */
function anunciarLogros() {
  const nuevos = logros.revisar(GAMES);
  if (!nuevos.length) return;
  nuevos.forEach((l, k) => {
    setTimeout(() => {
      const t = document.createElement('div');
      t.className = 'logro-aviso';
      t.innerHTML = `${icon(l.icono, { size: 20 })}
        <span><small>Logro conseguido</small><b>${escapeHtml(l.nombre)}</b></span>`;
      document.body.appendChild(t);
      audio.win();
      setTimeout(() => { t.classList.add('fuera'); setTimeout(() => t.remove(), 400); }, 4200);
    }, k * 700);
  });
}

/* ---------------- Creador de juegos ---------------- */

/**
 * Abre el editor de JUEGOS. Ojo: `abrirCreador()`, sin apellido, es el de
 * personajes y lleva ahí desde el principio — de ahí el nombre largo.
 *
 * El módulo y su hoja de estilos se cargan bajo demanda: el editor pesa y la
 * mayoría de las sesiones no lo abren nunca.
 */
async function abrirCreadorJuegos(receta = null) {
  audio.select();
  if (!document.getElementById('css-editor')) {
    const link = document.createElement('link');
    link.id = 'css-editor';
    link.rel = 'stylesheet';
    link.href = 'core/creador/editor.css';
    document.head.appendChild(link);
  }
  const { abrirEditor } = await import('./creador/editor.js');
  abrirEditor(document.body, {
    receta,
    alCerrar() { pintarLista(); pintarProgreso(); pintarLateral(); },
  });
}

/** Lista de juegos propios, para abrirlos, duplicarlos o borrarlos. */
function abrirMisJuegos() {
  const propios = creador.listar();
  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('palette', { size: 17 })} Mis juegos</h2>
    ${propios.length ? `<div class="torneo-lista">${propios.map((r) => `
      <div class="torneo-item" data-id="${escapeHtml(r.id)}">
        <span class="n">${r.piezas.length}</span>
        <label>${escapeHtml(r.nombre)}
          <span class="sub">${r.reglas.length} reglas · ${r.ajustes.duracion ? `${r.ajustes.duracion} s` : 'sin límite'}</span>
        </label>
        <span class="gana" style="display:flex;gap:6px">
          <button class="btn small" data-editar="${escapeHtml(r.id)}">Editar</button>
          <button class="btn small" data-jugar="${escapeHtml(r.id)}">Jugar</button>
          <button class="btn small" data-borrar="${escapeHtml(r.id)}">Borrar</button>
        </span>
      </div>`).join('')}</div>`
      : '<p class="vacio">Todavía no has hecho ninguno.</p>'}
    <div class="ui-card-actions" style="margin-top:16px">
      <button class="btn primary" id="nuevo-juego">+ Juego nuevo</button>
    </div>`);

  m.caja.querySelector('#nuevo-juego').addEventListener('click', () => { m.cerrar(); abrirCreadorJuegos(); });
  m.caja.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
    m.cerrar(); abrirCreadorJuegos(creador.cargar(b.dataset.editar));
  }));
  m.caja.querySelectorAll('[data-jugar]').forEach((b) => b.addEventListener('click', () => {
    jugar(creador.PREFIJO + b.dataset.jugar);
  }));
  m.caja.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', () => {
    if (!confirm('¿Seguro que quieres borrar este juego? No hay vuelta atrás.')) return;
    creador.borrar(b.dataset.borrar);
    audio.back();
    m.cerrar();
    pintarLista();
    abrirMisJuegos();
  }));
}

/* ---------------- Ajustes ---------------- */

function abrirAjustes() {
  audio.select();
  const s = loadSettings();
  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('gear', { size: 17 })} Ajustes</h2>

    <h3>Sonido</h3>
    <div class="fila">
      <label>Volumen</label>
      <input type="range" id="vol" min="0" max="100" value="${Math.round(audio.volume * 100)}">
    </div>
    <div class="fila">
      <label>Silencio</label>
      <button class="switch ${audio.muted ? 'on' : ''}" id="mute" role="switch"></button>
    </div>
    <div class="fila">
      <label>Música y ambiente
        <span class="sub">Banda sintetizada según la estética del juego y el ruido del escenario</span>
      </label>
      <button class="switch ${ambiente.activa ? 'on' : ''}" id="mus" role="switch"></button>
    </div>
    <div class="fila">
      <label>Volumen de la música</label>
      <input type="range" id="musvol" min="0" max="100" value="${Math.round(ambiente.volumen * 100)}">
    </div>

    <h3>Vibración</h3>
    <div class="fila">
      <label>Sistema háptico
        <span class="sub">Rumble sónico + sacudida de cámara + mando si hay uno conectado</span>
      </label>
      <button class="switch ${haptics.enabled ? 'on' : ''}" id="hap" role="switch"></button>
    </div>
    <div class="fila">
      <label>Intensidad</label>
      <input type="range" id="hapint" min="0" max="150" value="${Math.round(haptics.intensity * 100)}">
    </div>
    <div class="fila">
      <label>Probar
        <span class="sub" id="hap-info"></span>
      </label>
      <button class="btn small" id="hapdemo">Sentir la escala</button>
    </div>

    <h3>Imagen</h3>
    <div class="fila">
      <label>Piel Consola
        <span class="sub">Menú claro con losetas, reloj y barra de GamePad. Apagarla devuelve el neón original.</span>
      </label>
      <button class="switch ${consola.activa ? 'on' : ''}" id="skin" role="switch"></button>
    </div>
    ${pantalla.nativa ? `
    <div class="fila">
      <label>Pantalla completa fija
        <span class="sub">En la app de escritorio, ni cambiar de juego ni un juego que la pida podrán sacarte. Solo tú.</span>
      </label>
      <button class="switch ${s.pantallaFijada ? 'on' : ''}" id="fijar-pantalla" role="switch"></button>
    </div>` : ''}
    <div class="fila">
      <label>Líneas de escaneo (CRT)</label>
      <button class="switch ${s.crtEffect ? 'on' : ''}" id="crt" role="switch"></button>
    </div>
    <div class="fila">
      <label>Reducir destellos
        <span class="sub">Quita los flashes de pantalla de los impactos fuertes</span>
      </label>
      <button class="switch ${s.reducedFlash ? 'on' : ''}" id="flash" role="switch"></button>
    </div>
    <div class="fila">
      <label>Explicar controles al empezar cada partida</label>
      <button class="switch ${s.showControlsHint ? 'on' : ''}" id="hint" role="switch"></button>
    </div>

    <h3>Touch Bar</h3>
    <div class="tb-estado ${hayTouchBar ? 'ok' : ''}">
      <span class="punto"></span>
      <span id="tb-txt"></span>
    </div>

    <h3>Controles</h3>
    <div class="mapa" id="mapa"></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn small" id="reset-mapa">Restaurar por defecto</button>
    </div>

    <h3>Prueba de teclado (ghosting)</h3>
    <div class="test-teclado">
      <p style="font-size:13px;color:var(--ink-dim);margin:0">
        Mantengan pulsadas todas las teclas que puedan <b>los dos a la vez</b>.
      </p>
      <div class="test-num" id="test-n">0</div>
      <div class="test-teclas" id="test-k"></div>
      <div class="test-veredicto" id="test-v"></div>
    </div>

    <h3>Datos</h3>
    <div class="fila">
      <label>Rivalidad histórica
        <span class="sub" id="riv-info"></span>
      </label>
      <button class="btn small" id="reset-riv">Reiniciar</button>
    </div>
  `);

  /* Sonido */
  m.caja.querySelector('#vol').addEventListener('input', (e) => {
    audio.unlock();
    audio.volume = +e.target.value / 100;
    audio.blip();
  });
  const swMute = m.caja.querySelector('#mute');
  swMute.addEventListener('click', () => {
    swMute.classList.toggle('on', audio.toggleMute());
    if (!audio.muted) audio.blip();
  });
  const swMus = m.caja.querySelector('#mus');
  swMus.addEventListener('click', () => {
    audio.unlock();
    ambiente.activa = !ambiente.activa;
    swMus.classList.toggle('on', ambiente.activa);
    // Encenderla desde aquí tiene que sonar en el acto, no al entrar a un juego.
    if (ambiente.activa) ambiente.iniciar(null);
  });
  m.caja.querySelector('#musvol').addEventListener('input', (e) => {
    audio.unlock();
    // El volumen se aplica en caliente; solo hay que arrancarla si aún no sonaba.
    ambiente.volumen = +e.target.value / 100;
    if (ambiente.activa && !ambiente.sonando) ambiente.iniciar(null);
  });

  /* Háptica */
  const swHap = m.caja.querySelector('#hap');
  swHap.addEventListener('click', () => {
    haptics.enabled = !haptics.enabled;
    swHap.classList.toggle('on', haptics.enabled);
    if (haptics.enabled) haptics.play('impact');
  });
  m.caja.querySelector('#hapint').addEventListener('input', (e) => {
    haptics.intensity = +e.target.value / 100;
    haptics.play('bounce');
  });
  m.caja.querySelector('#hapdemo').addEventListener('click', () => {
    audio.unlock();
    haptics.demo();
  });
  const info = m.caja.querySelector('#hap-info');
  const conectados = mandos.hay;
  info.textContent = conectados > 0
    ? `${conectados === 1 ? `${mandos.nombre(0)} como jugador 1` : `${mandos.nombre(0)} (J1) y ${mandos.nombre(1)} (J2)`}`
      + ' · cruceta o palanca izquierda, ✕ acción, ○ especial, Options pausa'
    : 'Sin mandos: se usa rumble sónico y sacudida (Safari no permite vibrar el Mac). '
      + 'Un DualShock 4 por Bluetooth se empareja solo: se detecta al pulsar cualquier botón.';

  /* Imagen */
  const alterna = (id, clave) => {
    const b = m.caja.querySelector(id);
    b.addEventListener('click', () => {
      const nuevo = !b.classList.contains('on');
      b.classList.toggle('on', nuevo);
      updateSettings({ [clave]: nuevo });
      audio.blip();
    });
  };
  const swFijar = m.caja.querySelector('#fijar-pantalla');
  if (swFijar) {
    swFijar.addEventListener('click', async () => {
      const nuevo = !swFijar.classList.contains('on');
      swFijar.classList.toggle('on', nuevo);
      updateSettings({ pantallaFijada: nuevo });
      await pantalla.fijar(nuevo);
      audio.blip();
    });
  }

  alterna('#crt', 'crtEffect');
  alterna('#flash', 'reducedFlash');
  alterna('#hint', 'showControlsHint');

  // La piel recarga la página: cambia la proporción de las losetas y los
  // retratos se miden al montarse, así que repintar a medias no vale.
  m.caja.querySelector('#skin').addEventListener('click', () => consola.alternar());

  /* Touch Bar */
  m.caja.querySelector('#tb-txt').innerHTML = hayTouchBar
    ? `Touch Bar detectada · los ${TOTAL_TOUCHBAR} juegos exclusivos están disponibles`
    : `No detectada (${escapeHtml(touchbar.reason)}) · los ${TOTAL_TOUCHBAR} juegos exclusivos están ocultos`;

  /* Remapeo */
  pintarMapa(m.caja.querySelector('#mapa'));
  m.caja.querySelector('#reset-mapa').addEventListener('click', () => {
    input.setMaps(DEFAULT_MAPS);
    updateSettings({ maps: DEFAULT_MAPS });
    pintarMapa(m.caja.querySelector('#mapa'));
    audio.back();
  });

  /* Test de teclado */
  const testN = m.caja.querySelector('#test-n');
  const testK = m.caja.querySelector('#test-k');
  const testV = m.caja.querySelector('#test-v');
  let maxVisto = 0;
  const refrescarTest = () => {
    const n = input.rawHeldCount;
    maxVisto = Math.max(maxVisto, n);
    testN.textContent = maxVisto;
    testK.innerHTML = input.rawHeld.map((c) => `<span class="kbd">${escapeHtml(codeLabel(c))}</span>`).join('');
    testV.innerHTML = maxVisto >= 6
      ? '<span style="color:var(--lime)">Excelente: soporta de sobra dos jugadores.</span>'
      : maxVisto >= 4
        ? '<span style="color:var(--gold)">Suficiente para los juegos de este catálogo.</span>'
        : maxVisto > 0
          ? '<span style="color:var(--ink-dim)">Sigan pulsando más teclas a la vez…</span>'
          : '';
  };
  const t = setInterval(refrescarTest, 90);
  m.fondo.addEventListener('remove', () => clearInterval(t));
  new MutationObserver(() => { if (!document.body.contains(m.fondo)) clearInterval(t); })
    .observe(el.modales, { childList: true });

  /* Datos */
  const riv = loadRivalry();
  m.caja.querySelector('#riv-info').textContent =
    `${riv.total[0] + riv.total[1] + riv.draws} partidas registradas`;
  m.caja.querySelector('#reset-riv').addEventListener('click', (e) => {
    if (e.target.dataset.confirmar) {
      resetRivalry();
      pintarRivalidad();
      pintarLista();
      e.target.textContent = 'Reiniciada';
      e.target.disabled = true;
      audio.back();
    } else {
      e.target.dataset.confirmar = '1';
      e.target.textContent = '¿Seguro? Toca otra vez';
      e.target.classList.add('primary');
    }
  });
}

function pintarMapa(cont) {
  const maps = input.maps;
  cont.innerHTML = [0, 1].map((i) => `
    <div class="mapa-col">
      <h4 style="color:${players[i].color}">${escapeHtml(players[i].name)}</h4>
      ${ACTIONS.map((a) => `
        <div class="mapa-fila">
          <span>${ACTION_LABEL[a]}</span>
          <button class="tecla-btn" data-j="${i}" data-a="${a}">${escapeHtml(codeLabel(maps[i][a]))}</button>
        </div>`).join('')}
    </div>`).join('');

  cont.querySelectorAll('.tecla-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const j = +b.dataset.j, a = b.dataset.a;
      cont.querySelectorAll('.tecla-btn').forEach((o) => o.classList.remove('esperando'));
      b.classList.add('esperando');
      b.textContent = 'pulsa…';
      audio.blip();

      const capturar = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.removeEventListener('keydown', capturar, true);
        if (e.code === 'Escape') { pintarMapa(cont); return; }

        const conflicto = input.conflictFor(e.code, j, a);
        if (conflicto) {
          b.classList.remove('esperando');
          b.classList.add('conflicto');
          b.textContent = `ya usada (${conflicto})`;
          audio.error();
          setTimeout(() => pintarMapa(cont), 1400);
          return;
        }
        input.setMap(j, a, e.code);
        updateSettings({ maps: input.maps });
        audio.select();
        haptics.play('click', { player: j });
        pintarMapa(cont);
      };
      window.addEventListener('keydown', capturar, true);
    });
  });
}

/* ---------------- Rivalidad ---------------- */

function abrirRivalidad() {
  audio.select();
  const r = loadRivalry();
  const recs = loadRecords();
  const total = r.total[0] + r.total[1] + r.draws;

  const filas = Object.entries(r.byGame)
    .sort((a, b) => b[1].plays - a[1].plays)
    .map(([id, g]) => {
      const juego = byId(id);
      if (!juego) return '';
      return `
        <div class="torneo-item">
          <span class="n">${g.plays}</span>
          <span>${escapeHtml(juego.nombre)}</span>
          <span class="gana" style="margin-left:auto">
            <b style="color:${players[0].color}">${g.wins[0]}</b>
            <span style="color:var(--ink-faint)"> – </span>
            <b style="color:${players[1].color}">${g.wins[1]}</b>
          </span>
        </div>`;
    }).join('');

  const misRecords = Object.entries(recs).map(([k, v]) => {
    const [gid, clave] = k.split(':');
    const juego = byId(gid);
    if (!juego) return '';
    return `<div class="torneo-item"><span>${escapeHtml(juego.nombre)}</span>
              <span class="gana" style="margin-left:auto">${escapeHtml(clave)}: <b>${v.value}</b></span></div>`;
  }).join('');

  modal(`
    ${botonCerrar()}
    <h2>${icon('trophy', { size: 17 })} Rivalidad histórica</h2>
    <div style="display:flex;align-items:center;justify-content:center;gap:28px;margin-bottom:22px">
      ${[0, 1].map((i) => `
        <div style="text-align:center">
          <img src="${avatarFor(players[i])}" style="width:76px;height:76px;border-radius:50%;image-rendering:pixelated">
          <div style="font-family:var(--font-display);font-size:30px;color:${players[i].color};margin-top:8px">
            ${r.total[i]}
          </div>
          <div style="font-size:12px;color:var(--ink-dim)">${escapeHtml(players[i].name)}</div>
        </div>`).join('<div style="color:var(--ink-faint);font-size:12px">VS</div>')}
    </div>
    <p style="text-align:center;font-size:13px;color:var(--ink-dim)">
      ${total} partidas · ${r.draws} empates
    </p>
    ${filas ? `<h3>Por juego</h3><div class="torneo-lista">${filas}</div>` : ''}
    ${misRecords ? `<h3>Récords</h3><div class="torneo-lista">${misRecords}</div>` : ''}
    ${!total ? '<p class="vacio">Todavía no han jugado ninguna partida.</p>' : ''}
  `);
}

/* ---------------- Torneo ---------------- */

function abrirTorneo() {
  audio.select();
  const t = loadTournament();
  if (t.active) return pantallaTorneo(t);

  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('trophy', { size: 17 })} Torneo</h2>
    <p style="font-size:14px;color:var(--ink-dim);margin-top:0">
      Se eligen juegos al azar y se juegan seguidos. Gana quien se lleve más.
    </p>
    <div class="fila">
      <label>Número de juegos</label>
      <select id="t-n">
        <option value="3">3 juegos</option>
        <option value="5" selected>5 juegos</option>
        <option value="7">7 juegos</option>
        <option value="9">9 juegos</option>
      </select>
    </div>
    <div class="fila">
      <label>Categoría</label>
      <select id="t-cat">
        <option value="todos">Cualquiera</option>
        ${Object.entries(CATEGORIAS)
          .filter(([k]) => k !== 'touchbar' || hayTouchBar)
          .map(([k, c]) => `<option value="${k}">${c.nombre}</option>`).join('')}
      </select>
    </div>
    <div class="fila">
      <label>Solo juegos rápidos
        <span class="sub">Descarta los de más de 6 minutos</span>
      </label>
      <button class="switch" id="t-rapido" role="switch"></button>
    </div>
    <div class="ui-card-actions" style="margin-top:22px">
      <button class="btn primary" id="t-crear">Crear torneo</button>
    </div>`);

  m.caja.querySelector('#t-rapido').addEventListener('click', (e) => e.target.classList.toggle('on'));
  m.caja.querySelector('#t-crear').addEventListener('click', () => {
    const n = +m.caja.querySelector('#t-n').value;
    const cat = m.caja.querySelector('#t-cat').value;
    const rapido = m.caja.querySelector('#t-rapido').classList.contains('on');

    let pool = visibleGames(hayTouchBar);
    if (cat !== 'todos') pool = pool.filter((g) => g.categoria === cat);
    if (rapido) pool = pool.filter((g) => parseInt(g.duracion, 10) <= 4);
    if (pool.length < 2) { audio.error(); return; }

    const barajado = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(n, pool.length));
    const torneo = {
      active: true,
      juegos: barajado.map((g) => g.id),
      index: 0,
      score: [0, 0],
      results: [],
    };
    saveTournament(torneo);
    m.cerrar();
    pantallaTorneo(torneo);
  });
}

function pantallaTorneo(t) {
  const terminado = t.index >= t.juegos.length;
  const lider = t.score[0] === t.score[1] ? -1 : t.score[0] > t.score[1] ? 0 : 1;

  const m = modal(`
    ${botonCerrar()}
    <h2>${icon('trophy', { size: 17 })} ${terminado ? 'Torneo terminado' : 'Torneo en curso'}</h2>
    <div style="display:flex;align-items:center;justify-content:center;gap:26px;margin-bottom:20px">
      ${[0, 1].map((i) => `
        <div style="text-align:center;opacity:${lider === i || lider === -1 ? 1 : 0.5}">
          <img src="${avatarFor(players[i])}" style="width:64px;height:64px;border-radius:50%;image-rendering:pixelated">
          <div style="font-family:var(--font-display);font-size:26px;color:${players[i].color};margin-top:6px">
            ${t.score[i]}
          </div>
        </div>`).join('<div style="color:var(--ink-faint);font-size:12px">VS</div>')}
    </div>

    ${terminado && lider >= 0 ? `
      <p class="resultado-linea">
        ${icon('trophy', { size: 18 })}
        Gana <b style="color:${players[lider].color}">${escapeHtml(players[lider].name)}</b>
      </p>` : ''}
    ${terminado && lider === -1 ? `
      <p class="resultado-linea">${icon('handshake', { size: 18 })} Empate técnico</p>` : ''}

    <div class="torneo-lista">
      ${t.juegos.map((id, k) => {
        const g = byId(id);
        const res = t.results[k];
        const clase = k < t.index ? 'hecho' : k === t.index ? 'actual' : '';
        const gana = res
          ? (res.winner === -1
              ? '<span style="color:var(--ink-faint)">empate</span>'
              : `<b style="color:${players[res.winner].color}">${escapeHtml(players[res.winner].name)}</b>`)
          : '';
        return `<div class="torneo-item ${clase}">
                  <span class="n">${k + 1}</span>
                  <span>${escapeHtml(g?.nombre || id)}</span>
                  <span class="gana">${gana}</span>
                </div>`;
      }).join('')}
    </div>

    <div class="ui-card-actions" style="margin-top:20px">
      ${terminado
        ? `<button class="btn primary" id="t-nuevo">Nuevo torneo</button>`
        : `<button class="btn primary" id="t-jugar">Jugar: ${escapeHtml(byId(t.juegos[t.index])?.nombre || '')}</button>`}
      <button class="btn ghost" id="t-abandonar">${terminado ? 'Cerrar' : 'Abandonar torneo'}</button>
    </div>`);

  m.caja.querySelector('#t-jugar')?.addEventListener('click', () => jugar(t.juegos[t.index], true));
  m.caja.querySelector('#t-nuevo')?.addEventListener('click', () => {
    clearTournament();
    m.cerrar();
    abrirTorneo();
  });
  m.caja.querySelector('#t-abandonar').addEventListener('click', () => {
    clearTournament();
    history.replaceState(null, '', location.pathname);
    m.cerrar();
  });
}

/* ---------------- Inicio ---------------- */

// `iniciar` es async: sin este catch, cualquier error suyo se convierte en una
// promesa rechazada que no aparece como error de consola, y el hub se queda
// mudo y a medio pintar sin decir por qué.
iniciar().catch((e) => {
  console.error('El menú no pudo arrancar:', e);
  el.lista.innerHTML = `<p class="vacio">El menú no pudo arrancar: ${escapeHtml(e.message)}</p>`;
});
