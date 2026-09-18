/**
 * shell.js — carga y ejecuta un juego dentro de play.html.
 *
 * Cada juego solo tiene que exportar `meta` y `create(ctx)`. Todo lo demás
 * (canvas, bucle, pausa, cuenta atrás, marcador, fin de partida, registro del
 * resultado, encadenado de torneo) lo pone el shell, así que un juego nuevo
 * son ~100 líneas y una entrada en el manifiesto.
 */

import { Engine } from './engine.js';
import { input } from './input.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { GameUI } from './ui.js';
import { touchbar } from './touchbar.js';
import { Particles, seeded } from './math2d.js';
import {
  getPlayers, applyPlayerColors, loadSettings, recordResult, submitRecord,
  loadTournament, saveTournament, markPlayed, updateSettings,
} from './storage.js';
import { GAMES, byId, CATEGORIAS } from '../games/manifest.js';
import { esCreado, idReal, cargar as cargarReceta, entradaCatalogo } from './creador/biblioteca.js';
import { reproducirIntro } from './intro.js';
import { red, reanudarSala } from './red.js';
import { mandos } from './mandos.js';
import { ambiente } from './ambiente.js';
import { perfilDeJuego } from './perfiles.js';
import { pantalla } from './pantalla.js';
// La piel se aplica sola al importarse: aquí solo viste el chrome del juego
// (marcador, pausa, briefing) y cambia los sonidos de menú. Ver core/consola.js.
import './consola.js';

const qs = new URLSearchParams(location.search);
const gameId = qs.get('g');
const inTournament = qs.get('t') === '1';

const el = {
  frame: document.getElementById('frame'),
  canvas: document.getElementById('canvas'),
  domRoot: document.getElementById('dom-root'),
  flash: document.getElementById('flash'),
  loading: document.getElementById('loading'),
  error: document.getElementById('load-error'),
  topbar: document.getElementById('game-topbar'),
};

const settings = loadSettings();
const players = getPlayers();
applyPlayerColors(players);
document.body.dataset.crt = settings.crtEffect ? 'on' : 'off';

let engine = null;
let domLoop = null;
let ui = null;
let game = null;
let entry = null;
let paused = false;
let over = false;
let pauseMenu = null;
let unsubKeys = [];

/** Bucle ligero para los juegos que renderizan con DOM en vez de canvas. */
function crearBucleDom() {
  let raf = 0, last = 0, running = false, pausado = false;
  const tick = (now) => {
    if (!running) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (pausado || over) return;
    try { game?.update?.(dt); } catch (e) { console.error(e); }
    input.endFrame();
  };
  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(tick); },
    pause() { pausado = true; },
    resume() { pausado = false; last = performance.now(); },
    stop() { running = false; cancelAnimationFrame(raf); },
    get paused() { return pausado; },
  };
}

/* Los juegos de canvas usan Engine y los DOM usan domLoop; estas tres
   funciones ocultan cuál está activo para el resto del shell. */
const loopStart = () => { engine?.start(); domLoop?.start(); };
const loopPause = () => { engine?.pause(); domLoop?.pause(); };
const loopResume = () => { engine?.resume(); domLoop?.resume(); };

function fail(msg) {
  el.loading?.remove();
  el.error.hidden = false;
  el.error.textContent = msg;
}

/**
 * Vuelve al menú.
 *
 * Ojo con la ruta: los `import` de este archivo van con `../` porque se
 * resuelven contra la URL del módulo (core/shell.js), pero `location.href` se
 * resuelve contra la URL del DOCUMENTO, que es /play.html. Por eso aquí la
 * ruta es sin `../`.
 */
function goHub() {
  location.href = 'index.html';
}

/* ---------------- Arranque ---------------- */

async function boot() {
  /* Un juego creado por un jugador no tiene carpeta: su id lleva el prefijo
     `creado:` y su contenido es una receta guardada en localStorage. A partir
     de aquí el shell lo trata igual que a cualquier otro —cuenta atrás,
     pausa, marcador, récords, torneo— porque lo único que necesita de un
     juego es un `create(ctx)`. */
  let receta = null;
  if (esCreado(gameId)) {
    receta = cargarReceta(idReal(gameId));
    if (!receta) return fail(`Ese juego creado ya no existe.\n\nIgual lo borraste desde el creador.`);
    entry = entradaCatalogo(receta);
  } else {
    entry = byId(gameId);
    if (!entry) return fail(`No existe ningún juego con el id "${gameId}".`);
  }

  document.title = `${entry.nombre} · 2 Player Arcade`;
  document.body.dataset.theme = entry.categoria;

  let mod;
  if (receta) {
    const { crearDesdeReceta } = await import('./creador/runtime.js');
    mod = { meta: { render: 'canvas' }, create: (c) => crearDesdeReceta(c, receta) };
  } else {
    try {
      mod = await import(`../games/${entry.carpeta}/game.js`);
    } catch (e) {
      return fail(`No se pudo cargar games/${entry.carpeta}/game.js\n\n${e.message}`);
    }
    if (typeof mod.create !== 'function') {
      return fail(`games/${entry.carpeta}/game.js no exporta create(ctx).`);
    }
  }

  const meta = { ...entry, ...(mod.meta || {}) };
  const usesCanvas = meta.render !== 'dom';

  // Si esta sesión tenía una sala abierta en el menú, se recupera aquí y se
  // le dice a cada mando qué botonera dibujar para este juego. El iPad no
  // tiene que reemparejarse: para él solo ha cambiado la botonera.
  reanudarSala();
  // Los mandos físicos entran por el mismo camino que los iPad (core/input.js),
  // así que basta con encender el módulo: el juego no se entera de nada.
  mandos.iniciar();
  // Música y sonido de escenario: se eligen solos a partir de la estética y
  // las etiquetas del manifiesto, así que el juego no participa en esto.
  ambiente.iniciar(entry);
  red.enviarPerfil(0, perfilDeJuego(meta, 0, players[0].color));
  red.enviarPerfil(1, perfilDeJuego(meta, 1, players[1].color));

  el.canvas.hidden = !usesCanvas;
  el.domRoot.hidden = usesCanvas;

  ui = new GameUI(el.frame, players);

  if (usesCanvas) {
    engine = new Engine({
      canvas: el.canvas,
      update: (dt) => step(dt),
      render: () => draw(),
    });
    engine.onAutoPause = () => {
      // Con mandos conectados, que la ventana pierda el foco no significa que
      // nadie esté jugando: los dos pueden estar dándole al iPad sin tocar la
      // Mac. Pausar ahí cortaría la partida sin motivo.
      if (red.mandos.length) return;
      if (!over && !paused) togglePause(true);
    };
    engine.onResize = (W, H) => game?.resize?.(W, H);
    haptics.attach(engine, settings.reducedFlash ? null : el.flash);
  } else {
    // Los juegos DOM no tienen canvas ni Engine, pero muchos necesitan un
    // reloj (cronómetros, animaciones de turno). Se les da un bucle mínimo
    // con la misma firma update(dt) y control de pausa.
    domLoop = crearBucleDom();
  }

  const ctx = buildContext(meta, usesCanvas);
  try {
    game = mod.create(ctx);
  } catch (e) {
    return fail(`El juego falló al construirse:\n${e.message}`);
  }

  el.loading?.remove();

  try { game.init?.(); } catch (e) { return fail(`init() falló:\n${e.message}`); }

  // Cortinilla de entrada: tapa el salto de página y presenta el juego.
  await reproducirIntro(el.frame, {
    ...meta,
    categoriaNombre: CATEGORIAS[meta.categoria]?.nombre || '',
  }, players, CATEGORIAS[meta.categoria]?.color || '#ff2e88');

  // La pantalla de controles solo la primera vez que se estrena un juego:
  // a la décima partida de Pong ya nadie la lee y solo estorba. Después está
  // siempre a mano en el menú de pausa.
  const estreno = markPlayed(entry.id);
  if (meta.controles && estreno) await mostrarBriefing(meta);

  // Las teclas globales se enganchan DESPUÉS del briefing: si no, el Escape
  // que lo salta abriría también el menú de pausa en el mismo golpe.
  bindGlobalKeys();

  loopStart();

  if (!meta.sinCuentaAtras) {
    loopPause();
    await ui.countdown(3);
    loopResume();
  }
  game.onStart?.();
}

/* ---------------- Contexto que reciben los juegos ---------------- */

function buildContext(meta, usesCanvas) {
  const particles = new Particles(500);
  const ctx = {
    meta,
    players,
    settings,
    input,
    audio,
    haptics,
    ui,
    touchbar,
    particles,
    rng: seeded((Date.now() ^ 0x9e3779b9) >>> 0),
    root: el.domRoot,
    frame: el.frame,
    canvas: usesCanvas ? el.canvas : null,
    engine: null,          // se rellena abajo si hay canvas
    c: usesCanvas ? el.canvas.getContext('2d') : null,
    get W() { return engine ? engine.W : el.frame.clientWidth; },
    get H() { return engine ? engine.H : el.frame.clientHeight; },
    /** Sacudida de cámara directa (los efectos hápticos ya la incluyen). */
    shake: (m, d) => engine?.shake(m, d),
    /** Termina la partida y muestra la pantalla de resultado. */
    finish: (result) => finish(result),
    /** Guarda un récord; devuelve true si mejoró la marca anterior. */
    record: (key, value, dir) => submitRecord(meta.id, key, value, dir),
    /** Sale al hub. */
    exit: goHub,
    /**
     * Mandos táctiles. Un juego puede rehacer la botonera en caliente
     * (cambiar de fase, repartir un rol) y mandar a la pantalla de cada
     * jugador información que el otro no debe ver.
     */
    mando: {
      /** ¿Este jugador está jugando con iPad? */
      activo: (slot) => red.mandos.includes(slot),
      /** ¿Hay alguna sala abierta? */
      get haySala() { return red.activa; },
      /** Reemplaza la botonera de un jugador. */
      perfil: (slot, perfil) => red.enviarPerfil(slot, { ...perfil, juego: perfil.juego ?? meta.nombre }),
      /** Vuelve a la botonera deducida del manifiesto. */
      restaurar: (slot) => red.enviarPerfil(slot, perfilDeJuego(meta, slot, players[slot].color)),
      /** Vibración corta en el mando: 'toque' | 'golpe' | 'error' | 'punto'. */
      vibrar: (slot, patron) => red.vibrar(slot, patron),
    },
  };
  Object.defineProperty(ctx, 'engine', { get: () => engine });
  return ctx;
}

/* ---------------- Bucle ---------------- */

function step(dt) {
  if (over) return;
  try { game?.update?.(dt); } catch (e) { console.error(e); }
  input.endFrame();
}

function draw() {
  try { game?.render?.(); } catch (e) { console.error(e); }
}

/* ---------------- Teclas globales ---------------- */

function bindGlobalKeys() {
  unsubKeys.push(input.on('Escape', () => {
    if (over) { goHub(); return; }
    togglePause();
  }));
  unsubKeys.push(input.on('KeyR', (e) => {
    // R solo reinicia con la partida pausada o terminada, para no cortar
    // una partida en curso sin querer (y R puede ser tecla de algún juego).
    if (over) { restart(); return; }
    if (paused) { pauseMenu?.close(); restart(); }
  }));
  el.topbar?.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'exit') goHub();
    if (act === 'pause') togglePause();
    if (act === 'fullscreen') toggleFullscreen();
  });
}

function togglePause(force = null) {
  const next = force ?? !paused;
  if (next === paused) return;
  paused = next;
  if (paused) {
    loopPause();
    game?.onPause?.();
    ambiente.pausar();
    audio.back();
    pauseMenu = ui.pauseMenu({
      meta: entry,
      settings,
      onResume: () => togglePause(false),
      onRestart: () => restart(),
      onExit: goHub,
      onAjuste: (clave, valor) => {
        // Los cambios se guardan y se aplican en caliente: cerrar el menú y
        // ver que las líneas de escaneo siguen igual sería desconcertante.
        settings[clave] = valor;
        updateSettings({ [clave]: valor });
        if (clave === 'crtEffect') document.body.dataset.crt = valor ? 'on' : 'off';
        if (clave === 'reducedFlash') haptics.attach(engine, valor ? null : el.flash);
        if (clave === 'musica') {
          ambiente.activa = valor;
          // Encenderla desde el menú de pausa debe sonar ya, no al reanudar.
          if (valor) { ambiente.iniciar(entry); ambiente.pausar(); }
        }
      },
    });
  } else {
    pauseMenu?.close();
    pauseMenu = null;
    input.releaseAll();
    loopResume();
    ambiente.reanudar();
    game?.onResume?.();
  }
}

/**
 * Espera a que los dos jugadores confirmen que están listos (pulsando su
 * tecla de acción), con un tope de tiempo para no bloquear a quien ya
 * conoce el juego. Escape también salta la espera al instante.
 */
function esperarListos(timeoutMs = 7000) {
  return new Promise((resolve) => {
    let p0 = false, p1 = false, hecho = false;
    let quitar = () => {};
    const finalizar = () => {
      if (hecho) return;
      hecho = true;
      clearTimeout(temporizador);
      quitar();
      resolve();
    };
    quitar = input.onAny((e) => {
      if (e.code === input.player(0).map.a) p0 = true;
      if (e.code === input.player(1).map.a) p1 = true;
      if (e.code === 'Escape' || (p0 && p1)) finalizar();
    });
    const temporizador = setTimeout(finalizar, timeoutMs);
  });
}

/** Muestra la pantalla de controles y espera antes de arrancar la partida. */
async function mostrarBriefing(meta) {
  if (!settings.showControlsHint) return;
  const TIEMPO = 7000;
  const briefing = ui.controlsBriefing(meta);
  const barra = briefing.el.querySelector('.briefing-bar i');
  if (barra) barra.style.animationDuration = `${TIEMPO}ms`;
  audio.select();
  await esperarListos(TIEMPO);
  briefing.close();
}

function toggleFullscreen() {
  // Ver core/pantalla.js: en Electron va por la ventana, no por el documento.
  pantalla.alternar();
}

/* ---------------- Fin y reinicio ---------------- */

function finish({ winner = -1, detail = '', scores = null, record = false, silent = false } = {}) {
  if (over) return;
  over = true;
  loopPause();
  game?.onFinish?.(winner);

  recordResult(entry.id, winner);
  if (winner === 0 || winner === 1) haptics.victory(winner);
  else haptics.play('soft');
  // La música se queda de fondo en la pantalla de resultado, pero baja y pone
  // un acorde de cierre: el silencio seco después de una partida corta mucho.
  ambiente.acento(winner);
  ambiente.pausar();

  if (silent) return;

  const t = inTournament ? loadTournament() : null;
  if (t?.active) {
    t.results.push({ game: entry.id, winner });
    if (winner === 0 || winner === 1) t.score[winner]++;
    t.index++;
    saveTournament(t);
  }

  ui.gameOver({ winner, detail, scores, record }, {
    onRematch: restart,
    onExit: () => {
      if (t?.active) { location.href = 'index.html#torneo'; }
      else goHub();
    },
    onNext: t?.active ? () => { location.href = 'index.html#torneo'; } : null,
  });
}

function restart() {
  try { game?.destroy?.(); } catch {}
  touchbar.clear();
  ui.clear();
  ui = new GameUI(el.frame, players);
  el.domRoot.innerHTML = '';
  input.releaseAll();
  input.resetTaps();
  over = false;
  paused = false;
  pauseMenu = null;
  // La revancha vuelve a subir la música, que el fin de partida había bajado.
  ambiente.reanudar();

  const meta = { ...entry, ...(game?.meta || {}) };
  const ctx = buildContext(meta, entry.render !== 'dom');
  import(`../games/${entry.carpeta}/game.js`).then(async (mod) => {
    game = mod.create(ctx);
    game.init?.();
    loopResume();
    if (!meta.sinCuentaAtras) {
      loopPause();
      await ui.countdown(3);
      loopResume();
    }
    game.onStart?.();
  });
}

/* ---------------- Limpieza ---------------- */

window.addEventListener('pagehide', () => {
  ambiente.parar();
  try { game?.destroy?.(); } catch {}
  touchbar.clear();
  haptics.detach();
  engine?.destroy();
  domLoop?.stop();
  unsubKeys.forEach((f) => f());
});

boot();
