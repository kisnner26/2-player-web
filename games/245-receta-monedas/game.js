/* Envoltorio: la receta la juega el intérprete del creador. Un juego hecho
   con el editor tendrá exactamente esta forma. */
import { crearDesdeReceta } from '../../core/creador/runtime.js';
import receta from './receta.js';

export const meta = { render: 'canvas' };
export const create = (ctx) => crearDesdeReceta(ctx, receta);
