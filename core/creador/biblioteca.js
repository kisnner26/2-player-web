/**
 * biblioteca.js — dónde viven los juegos que hace la gente.
 *
 * Se guardan en localStorage bajo el mismo prefijo que el resto del proyecto,
 * y se exportan a un archivo `.2pa` que es JSON legible. Que sea legible es a
 * propósito: alguien tiene que poder abrirlo, ver qué hay dentro y arreglarlo
 * a mano si algo se rompe — es lo que hace que un formato de nivel
 * sobreviva a diez versiones del juego.
 *
 * Cada juego creado aparece en el catálogo como una entrada más, con el id
 * `creado:<id>`. El shell reconoce ese prefijo y lo manda al intérprete en vez
 * de buscar una carpeta. Así un juego hecho por un jugador se lanza, se pausa,
 * puntúa y entra en torneos exactamente igual que uno escrito a mano.
 */

import { normalizar, migrar, aTexto, desdeTexto, nuevoId, revisar } from './formato.js';

const CLAVE = '2pa:creados';
export const PREFIJO = 'creado:';

function leer() {
  try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; }
}
function escribir(todo) {
  try { localStorage.setItem(CLAVE, JSON.stringify(todo)); return true; }
  catch { return false; }          // cuota llena: el editor avisa
}

/** Todas las recetas guardadas, de la más reciente a la más antigua. */
export function listar() {
  const todo = leer();
  return Object.values(todo)
    .map((r) => migrar(r))
    .sort((a, b) => (b.modificado || 0) - (a.modificado || 0));
}

export function cargar(id) {
  const r = leer()[id];
  return r ? migrar(r) : null;
}

export function guardar(receta) {
  const r = normalizar(receta);
  if (!r.id) r.id = nuevoId('j');
  r.modificado = Date.now();
  const todo = leer();
  todo[r.id] = r;
  return escribir(todo) ? r : null;
}

export function borrar(id) {
  const todo = leer();
  delete todo[id];
  escribir(todo);
}

export function duplicar(id) {
  const r = cargar(id);
  if (!r) return null;
  return guardar({ ...r, id: '', nombre: `${r.nombre} (copia)` });
}

/**
 * Entrada de catálogo para un juego creado.
 * Tiene la misma forma que las de games/manifest.js, así que el hub la pinta
 * con el mismo código: no hay una lista «de los otros juegos».
 */
export function entradaCatalogo(receta) {
  const r = migrar(receta);
  const jugadores = r.piezas.filter((p) => p.tipo === 'jugador').length;
  const hayBot = r.piezas.some((p) => p.tipo === 'bot');
  return {
    id: PREFIJO + r.id,
    carpeta: null,
    nombre: r.nombre || 'Sin nombre',
    categoria: 'creados',
    estetica: 'neon',
    descripcion: r.descripcion || (hayBot ? 'Hecho con el creador. Contra la máquina.' : 'Hecho con el creador.'),
    controles: {
      p1: ['W A S D: moverte'],
      p2: [jugadores > 1 ? '↑ ↓ ← →: moverte' : '—: lo lleva la máquina'],
    },
    duracion: r.ajustes.duracion > 0 ? `${Math.round(r.ajustes.duracion / 60) || 1} min` : '1-4 min',
    render: 'canvas',
    creado: true,
    tags: ['creador', 'receta', r.autor || ''].filter(Boolean),
  };
}

/** Todas las entradas de catálogo de los juegos creados. */
export const entradas = () => listar().map(entradaCatalogo);

/** ¿Este id del catálogo es un juego creado? */
export const esCreado = (id) => typeof id === 'string' && id.startsWith(PREFIJO);
export const idReal = (id) => String(id).slice(PREFIJO.length);

/* ---------------- Intercambio ---------------- */

/**
 * Descarga la receta como archivo `.2pa`.
 * Es el equivalente a exportar un nivel: se puede mandar por mensaje y el otro
 * lo importa sin cuentas ni servidor, que es todo el espíritu del proyecto.
 */
export function exportar(receta) {
  const r = normalizar(receta);
  const blob = new Blob([aTexto(r)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(r.nombre || 'juego').replace(/[^\w\-]+/g, '-').toLowerCase()}.2pa`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Importa un archivo `.2pa`. Siempre con id NUEVO: importar dos veces el mismo
 * archivo debe dar dos juegos, no pisar el que ya tenías.
 * @returns {Promise<object>} la receta guardada
 */
export async function importar(archivo) {
  const texto = await archivo.text();
  let r;
  try { r = desdeTexto(texto); }
  catch (e) { throw new Error(`Ese archivo no es un juego válido: ${e.message}`); }
  const problemas = revisar(r);
  r.id = '';
  const guardada = guardar(r);
  if (!guardada) throw new Error('No hay sitio para guardar más juegos.');
  guardada.avisos = problemas;
  return guardada;
}
