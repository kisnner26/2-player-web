import { crearDesdeReceta } from '../../core/creador/runtime.js';
import receta from './receta.js';

export const meta = { render: 'canvas' };
export const create = (ctx) => crearDesdeReceta(ctx, receta);
