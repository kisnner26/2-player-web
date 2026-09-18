/**
 * Cargador de los desafíos generados.
 *
 * Todos comparten este módulo: la receta concreta viaja en la entrada de
 * catálogo (`meta.receta`), que es lo que el shell le pasa al juego. Así no
 * hacen falta doscientas carpetas con cuatro líneas cada una.
 */
import { crearDesdeReceta } from '../../core/creador/runtime.js';

export const meta = { render: 'canvas' };

export function create(ctx) {
  const receta = ctx.meta?.receta;
  if (!receta) throw new Error('Este desafío no trae receta.');
  return crearDesdeReceta(ctx, receta);
}
