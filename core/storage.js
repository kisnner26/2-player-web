/**
 * storage.js — persistencia en localStorage.
 *
 * Guarda perfiles de jugador, ajustes, la rivalidad histórica y los récords.
 * Todo bajo el prefijo `2pa:` para no chocar con nada más del navegador.
 */

import { PERSONAJES_INICIALES } from './personaje.js';

const PREFIX = '2pa:';
const K_SETTINGS = PREFIX + 'settings';
const K_PROFILES = PREFIX + 'profiles';
const K_RIVALRY = PREFIX + 'rivalry';
const K_RECORDS = PREFIX + 'records';
const K_TOURNAMENT = PREFIX + 'tournament';
const K_MASCOTA = PREFIX + 'mascota';
const K_CASA = PREFIX + 'casa';
const K_BONSAI = PREFIX + 'bonsai';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredClone(fallback);
    return { ...structuredClone(fallback), ...JSON.parse(raw) };
  } catch {
    return structuredClone(fallback);
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/* ---------------- Ajustes ---------------- */

const DEFAULT_SETTINGS = {
  volume: 0.7,
  muted: false,
  musica: true,             // música de fondo y sonido de escenario (core/ambiente.js)
  musicaVolumen: 0.55,      // relativo al volumen general, que sigue mandando
  haptics: true,
  hapticIntensity: 1,
  maps: null,               // null = mapeo por defecto de input.js
  crtEffect: true,
  showControlsHint: true,
  reducedFlash: false,
  skin: 'consola',             // piel de la interfaz: 'consola' (core/consola.css) o 'arcade' (el neón original)
  pantallaFijada: false,    // Electron: la pantalla completa no se cae sola (ver core/pantalla.js)
  lastCategory: 'todos',
  lastGame: null,           // último juego enfocado en el hub (no el último jugado)
  touchbarForced: false,    // mostrar juegos de Touch Bar aunque no haya puente (depuración)
};

export function loadSettings() { return read(K_SETTINGS, DEFAULT_SETTINGS); }
export function saveSettings(s) { write(K_SETTINGS, s); }
export function updateSettings(patch) {
  const s = { ...loadSettings(), ...patch };
  saveSettings(s);
  return s;
}

/* ---------------- Perfiles ---------------- */

export const PLAYER_COLORS = [
  '#ff2e88', '#00e5ff', '#a8ff3e', '#ffd166', '#b04cff',
  '#ff7847', '#3effc8', '#ff4757', '#5b8cff', '#ffffff',
];

const DEFAULT_PROFILES = {
  players: [
    // `personaje` son los rasgos del creador (core/personaje.js) y `avatar`
    // una foto procesada; `modoAvatar` decide cuál de los dos se enseña.
    { name: 'Jugador 1', color: '#ff2e88', emoji: '', avatar: null, personaje: null, modoAvatar: 'personaje' },
    { name: 'Jugador 2', color: '#00e5ff', emoji: '', avatar: null, personaje: null, modoAvatar: 'personaje' },
  ],
};

export function loadProfiles() {
  const p = read(K_PROFILES, DEFAULT_PROFILES);
  // Se normaliza por si un guardado viejo tiene menos jugadores.
  if (!Array.isArray(p.players) || p.players.length < 2) p.players = structuredClone(DEFAULT_PROFILES.players);
  p.players = p.players.slice(0, 2).map((pl, i) => ({ ...DEFAULT_PROFILES.players[i], ...pl }));
  // Quien no haya pasado por el creador recibe su personaje de salida. Se
  // asigna aquí y no al dibujar para que el avatar del marcador y el muñeco
  // que corre por la pantalla sean siempre el mismo.
  p.players.forEach((pl, i) => { if (!pl.personaje) pl.personaje = structuredClone(PERSONAJES_INICIALES[i]); });
  return p;
}
export function saveProfiles(p) { write(K_PROFILES, p); }
export function getPlayers() { return loadProfiles().players; }
export function setPlayer(index, patch) {
  const p = loadProfiles();
  p.players[index] = { ...p.players[index], ...patch };
  saveProfiles(p);
  applyPlayerColors(p.players);
  return p.players[index];
}

/** Publica los colores de los perfiles como variables CSS globales. */
export function applyPlayerColors(players = getPlayers()) {
  const root = document.documentElement;
  root.style.setProperty('--p1', players[0].color);
  root.style.setProperty('--p2', players[1].color);
  root.style.setProperty('--p1-glow', players[0].color + '55');
  root.style.setProperty('--p2-glow', players[1].color + '55');
}

/* ---------------- Rivalidad histórica ---------------- */

const DEFAULT_RIVALRY = { total: [0, 0], draws: 0, byGame: {}, lastPlayed: null, sessions: 0 };

export function loadRivalry() { return read(K_RIVALRY, DEFAULT_RIVALRY); }

/**
 * Registra el resultado de una partida.
 * @param {string} gameId
 * @param {0|1|-1} winner  -1 = empate
 */
export function recordResult(gameId, winner) {
  const r = loadRivalry();
  if (winner === 0 || winner === 1) r.total[winner]++;
  else r.draws++;
  if (!r.byGame[gameId]) r.byGame[gameId] = { wins: [0, 0], draws: 0, plays: 0 };
  const g = r.byGame[gameId];
  g.plays++;
  if (winner === 0 || winner === 1) g.wins[winner]++;
  else g.draws++;
  r.lastPlayed = gameId;
  write(K_RIVALRY, r);
  apuntarReciente(gameId);
  return r;
}

/* ---------------- Recientes ----------------
   Con quinientos juegos, «el de ayer» deja de encontrarse solo. `played`
   guarda cuándo se ESTRENÓ cada uno, que no sirve para esto: hace falta el
   orden en que se han tocado por última vez. Se guarda una lista corta y no un
   mapa de fechas porque lo único que se pregunta es «los últimos veinte». */
const K_RECIENTES = PREFIX + 'recientes';
const TOPE_RECIENTES = 24;

export function loadRecientes() {
  const v = read(K_RECIENTES, { lista: [] });
  return Array.isArray(v.lista) ? v.lista : [];
}

export function apuntarReciente(gameId) {
  const lista = loadRecientes().filter((id) => id !== gameId);
  lista.unshift(gameId);
  write(K_RECIENTES, { lista: lista.slice(0, TOPE_RECIENTES) });
}

/** Los más jugados, de la rivalidad. Devuelve ids. */
export function masJugados(n = 12) {
  const { byGame } = loadRivalry();
  return Object.entries(byGame)
    .sort((a, b) => (b[1].plays || 0) - (a[1].plays || 0))
    .slice(0, n)
    .map(([id]) => id);
}

export function resetRivalry() { write(K_RIVALRY, structuredClone(DEFAULT_RIVALRY)); }

/* ---------------- Récords ---------------- */

export function loadRecords() { return read(K_RECORDS, {}); }

/* ---------------- Juegos probados ---------------- */

/*
 * Con más de setenta juegos, "¿cuáles nos faltan por probar?" es la pregunta
 * más frecuente delante del catálogo. Se guarda cuándo se estrenó cada uno:
 * el hub lo usa para el distintivo NUEVO y el shell para enseñar la pantalla
 * de controles solo la primera vez.
 */
const K_PLAYED = PREFIX + 'played';

/** { [gameId]: timestamp de la primera partida } */
export function loadPlayed() { return read(K_PLAYED, {}); }

export function isPlayed(gameId) { return !!loadPlayed()[gameId]; }

/** Marca un juego como estrenado. Devuelve true si era la primera vez. */
export function markPlayed(gameId) {
  const all = loadPlayed();
  if (all[gameId]) return false;
  all[gameId] = Date.now();
  write(K_PLAYED, all);
  return true;
}

export function resetPlayed() { write(K_PLAYED, {}); }

/* ---------------- Favoritos ----------------
   Con más de doscientos juegos, «el que jugamos el otro día» deja de
   encontrarse. Los favoritos son la respuesta más barata: una estrella y una
   sección propia arriba del todo. Se guardan como objeto y no como lista para
   que preguntar si uno lo es cueste lo mismo con 5 que con 500. */
const K_FAVORITOS = PREFIX + 'favoritos';

/** { [gameId]: timestamp de cuándo se marcó } */
export function loadFavoritos() { return read(K_FAVORITOS, {}); }

export function esFavorito(gameId) { return !!loadFavoritos()[gameId]; }

/** Marca o desmarca. Devuelve el estado nuevo. */
export function toggleFavorito(gameId) {
  const todos = loadFavoritos();
  if (todos[gameId]) delete todos[gameId];
  else todos[gameId] = Date.now();
  write(K_FAVORITOS, todos);
  return !!todos[gameId];
}

/** Cuántos hay, para el contador de la barra lateral. */
export const contarFavoritos = () => Object.keys(loadFavoritos()).length;

/**
 * Guarda un récord si mejora el anterior.
 * @param {string} gameId
 * @param {string} key       p. ej. 'rally' o 'tiempo'
 * @param {number} value
 * @param {'high'|'low'} dir
 * @returns {boolean} true si es récord nuevo
 */
export function submitRecord(gameId, key, value, dir = 'high') {
  const all = loadRecords();
  const id = `${gameId}:${key}`;
  const prev = all[id]?.value;
  const better = prev == null || (dir === 'high' ? value > prev : value < prev);
  if (better) {
    all[id] = { value, at: Date.now() };
    write(K_RECORDS, all);
  }
  return better;
}
export function getRecord(gameId, key) { return loadRecords()[`${gameId}:${key}`]?.value ?? null; }

/* ---------------- Torneo en curso ---------------- */

export function loadTournament() { return read(K_TOURNAMENT, { active: false }); }
export function saveTournament(t) { write(K_TOURNAMENT, t); }
export function clearTournament() { try { localStorage.removeItem(K_TOURNAMENT); } catch {} }

/* ---------------- Estado compartido de la pareja ----------------
   Mascota y casa persisten ENTRE partidas: son de los dos, no de una
   sesión. Por eso viven aquí y no dentro del juego, que se destruye al
   salir. `nacida`/`ultimaVisita` son marcas de tiempo absolutas para
   poder calcular cuánto tiempo real ha pasado desde la última vez.     */

const DEFAULT_MASCOTA = {
  nombre: '', tipo: 'gato', color: '#ffd166',
  hambre: 70, animo: 70, energia: 70, limpieza: 70,
  vinculo: 0, edadDias: 0, nacida: null, ultimaVisita: null,
  cuidados: [0, 0],          // cuántas acciones ha hecho cada jugador
  diario: [],                // últimos hitos, para contar la historia
};

export function loadMascota() { return read(K_MASCOTA, DEFAULT_MASCOTA); }
export function saveMascota(m) { write(K_MASCOTA, m); }
export function resetMascota() { write(K_MASCOTA, structuredClone(DEFAULT_MASCOTA)); }

const DEFAULT_CASA = {
  piezas: [],                // {tipo, x, y, rot, por}
  habitacion: 'salon',
  puestas: [0, 0],           // cuántos muebles ha puesto cada jugador
  ultimaVisita: null,
};

export function loadCasa() { return read(K_CASA, DEFAULT_CASA); }
export function saveCasa(c) { write(K_CASA, c); }
export function resetCasa() { write(K_CASA, structuredClone(DEFAULT_CASA)); }

/**
 * El bonsái crece con el tiempo REAL entre visitas, así que su estado no puede
 * vivir en la partida: se guarda aquí igual que la mascota y la casa.
 */
const DEFAULT_BONSAI = {
  ramas: [],                 // {x1,y1,x2,y2,grosor,nivel,por,podada}
  edadDias: 0, plantado: null, ultimaVisita: null,
  podas: [0, 0],             // cortes de cada jugador
  armonia: 0,
};

export function loadBonsai() { return read(K_BONSAI, DEFAULT_BONSAI); }
export function saveBonsai(b) { write(K_BONSAI, b); }
export function resetBonsai() { write(K_BONSAI, structuredClone(DEFAULT_BONSAI)); }

/* ---------------- Utilidades ---------------- */

export function exportAll() {
  return JSON.stringify({
    settings: loadSettings(), profiles: loadProfiles(),
    rivalry: loadRivalry(), records: loadRecords(),
  }, null, 2);
}

export function importAll(json) {
  const d = JSON.parse(json);
  if (d.settings) saveSettings(d.settings);
  if (d.profiles) saveProfiles(d.profiles);
  if (d.rivalry) write(K_RIVALRY, d.rivalry);
  if (d.records) write(K_RECORDS, d.records);
}

export function wipeAll() {
  for (const k of [K_SETTINGS, K_PROFILES, K_RIVALRY, K_RECORDS, K_TOURNAMENT, K_MASCOTA, K_CASA, K_PLAYED]) {
    try { localStorage.removeItem(k); } catch {}
  }
}
