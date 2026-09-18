/**
 * familias.js — plantillas de arena parametrizadas.
 *
 * Aquí no hay juegos: hay ocho FORMAS de juego, y cada una acepta parámetros
 * que cambian cómo se JUEGA, no cómo se ve. Cambiar el color del fondo daría
 * cien juegos idénticos; cambiar si hay bot, si el suelo resbala, si las
 * monedas caducan o si hay que aguantar una zona da cien partidas distintas.
 *
 * Cada familia devuelve una receta del formato de core/creador, así que se
 * juegan con el MISMO intérprete que los juegos que hace un jugador con el
 * editor. Un juego generado y uno hecho a mano son la misma cosa por dentro,
 * y eso significa que cualquiera puede abrir uno generado y seguir tocándolo.
 *
 * Honestidad sobre lo que son: variaciones de arena bien afinadas, no ocho
 * ideas nuevas. Están para dar volumen y variedad de tarde, no para llevar
 * una portada.
 */

const rejilla = (rng, n, W, H, margen = 120) => Array.from({ length: n }, () => ({
  x: margen + rng() * (W - margen * 2),
  y: margen + rng() * (H - margen * 2),
}));

const W = 1200, H = 700;

/** Muros repartidos según un patrón, que es lo que da carácter al mapa. */
function muros(rng, patron, densidad) {
  const out = [];
  const add = (x, y, ancho, alto) => out.push({ tipo: 'muro', x, y, ancho, alto });
  const n = 2 + Math.round(densidad * 5);

  if (patron === 'columnas') {
    for (let i = 0; i < n; i++) {
      const x = (W / (n + 1)) * (i + 1);
      add(x, H / 2, 26, 120 + rng() * 240);
    }
  } else if (patron === 'cruz') {
    add(W / 2, H / 2, 30, H * 0.55);
    add(W / 2, H / 2, W * 0.5, 30);
  } else if (patron === 'anillo') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      add(W / 2 + Math.cos(a) * 260, H / 2 + Math.sin(a) * 190, 90, 26);
    }
  } else if (patron === 'celdas') {
    for (let i = 0; i < n; i++) {
      const p = rejilla(rng, 1, W, H, 160)[0];
      add(p.x, p.y, 30 + rng() * 180, 30);
      add(p.x, p.y, 30, 30 + rng() * 180);
    }
  } else if (patron === 'pasillo') {
    for (let i = 0; i < n; i++) {
      const y = (H / (n + 1)) * (i + 1);
      const hueco = 150 + rng() * 120;
      const cx = 200 + rng() * (W - 400);
      add((cx - hueco / 2) / 2, y, cx - hueco / 2, 24);
      add((cx + hueco / 2 + W) / 2, y, W - cx - hueco / 2, 24);
    }
  }
  return out;
}

/** Terreno especial: es lo que hace que dos mapas con los mismos muros no
    se jueguen igual. */
function terreno(rng, tipo) {
  if (tipo === 'ninguno') return [];
  const p = rejilla(rng, 2 + Math.floor(rng() * 3), W, H, 180);
  return p.map((q) => {
    if (tipo === 'hielo') return { tipo: 'hielo', x: q.x, y: q.y, ancho: 180, alto: 160, props: { friccion: 0.3 } };
    if (tipo === 'barro') return { tipo: 'lento', x: q.x, y: q.y, ancho: 180, alto: 160, props: { factor: 0.42 } };
    return {
      tipo: 'cinta', x: q.x, y: q.y, ancho: 190, alto: 110,
      props: { direccion: Math.floor(rng() * 4) * 90, fuerza: 240 },
    };
  });
}

const actores = (rng, o) => {
  const list = [{ tipo: 'jugador', x: 140, y: H / 2, props: { slot: 0, velocidad: o.velocidad, personaje: true } }];
  if (o.rival === 'humano') {
    list.push({ tipo: 'jugador', x: W - 140, y: H / 2, props: { slot: 1, velocidad: o.velocidad, personaje: true } });
  } else {
    list.push({
      tipo: 'bot', x: W - 140, y: H / 2,
      props: { dificultad: o.dificultad, velocidad: Math.round(o.velocidad * 0.94), persigue: o.persigue },
    });
  }
  return list;
};

const base = (o) => ({
  version: 1,
  arena: { ancho: W, alto: H, fondo: o.fondo, reja: true, muros: true, friccion: o.friccion },
  ajustes: { duracion: 0, paraGanar: 0, vidas: 0 },
  piezas: [], reglas: [],
});

/* ---------------- Las ocho familias ---------------- */

export const FAMILIAS = {
  /** Coger más monedas que el rival antes de que se acabe el tiempo. */
  recolecta(rng, o) {
    const r = base(o);
    r.ajustes.duracion = o.duracion;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'moneda' }),
      ...muros(rng, o.patron, o.densidad),
      ...terreno(rng, o.terreno),
      { tipo: 'generador', x: W / 2, y: H / 2, props: { que: 'moneda', cada: o.ritmo, tope: 10, impulso: 150 } },
    ];
    r.reglas = [{ id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
      { tipo: 'generar', que: 'moneda', cuantas: o.siembra, alAzar: 'azar' },
    ] }];
    return r;
  },

  /** Aguantar vivo entre bombas que no dejan de salir. */
  supervivencia(rng, o) {
    const r = base(o);
    r.ajustes.vidas = 1;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'huye' }),
      ...muros(rng, o.patron, o.densidad),
      ...terreno(rng, o.terreno),
      { tipo: 'generador', x: W * 0.3, y: 120, props: { que: 'bomba', cada: o.ritmo, tope: o.peligro, impulso: 340 } },
      { tipo: 'generador', x: W * 0.7, y: H - 120, props: { que: 'bomba', cada: o.ritmo, tope: o.peligro, impulso: 340 } },
    ];
    r.reglas = [{ id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
      { tipo: 'mensaje', texto: 'Aguanta más que el otro', segundos: 2 },
    ] }];
    return r;
  },

  /** Llegar a la meta esquivando lo que haya. */
  carrera(rng, o) {
    const r = base(o);
    // Reloj de seguridad: con meta pero sin tiempo, una partida en la que
    // nadie llega no acabaría nunca.
    r.ajustes.duracion = o.duracion + 30;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'jugador' }),
      ...muros(rng, 'pasillo', o.densidad),
      ...terreno(rng, o.terreno),
      { tipo: 'meta', x: W - 70, y: H / 2, ancho: 90, alto: 220, props: { gana: true } },
    ];
    for (let i = 0; i < Math.round(o.peligro); i++) {
      const p = rejilla(rng, 1, W, H, 200)[0];
      r.piezas.push({ tipo: 'pincho', x: p.x, y: p.y, ancho: 130, alto: 22 });
    }
    return r;
  },

  /** Empujar al otro fuera de la zona central. */
  empuje(rng, o) {
    const r = base(o);
    r.ajustes.paraGanar = 3;
    r.arena.friccion = 1.6;              // resbala: empujar tiene consecuencias
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'jugador' }),
      { tipo: 'zona', x: W / 2, y: H / 2, ancho: 620, alto: 460, etiqueta: 'ring' },
      { tipo: 'muerte', x: W / 2, y: 30, ancho: W, alto: 60 },
      { tipo: 'muerte', x: W / 2, y: H - 30, ancho: W, alto: 60 },
      { tipo: 'muerte', x: 30, y: H / 2, ancho: 60, alto: H },
      { tipo: 'muerte', x: W - 30, y: H / 2, ancho: 60, alto: H },
      ...terreno(rng, o.terreno),
    ];
    r.reglas = [{ id: 'r1', unaVez: false, cuando: { tipo: 'muerte', slot: -1 }, entonces: [
      { tipo: 'puntos', a: 'causante', cantidad: 0 },
      { tipo: 'sonido', cual: 'explosion' },
    ] }];
    return r;
  },

  /** Quedarse dentro de una zona para puntuar. */
  custodia(rng, o) {
    const r = base(o);
    r.ajustes.duracion = o.duracion;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'jugador' }),
      ...muros(rng, o.patron, o.densidad * 0.6),
      { tipo: 'zona', x: W / 2, y: H / 2, ancho: 260, alto: 220, etiqueta: 'trono' },
      { tipo: 'generador', x: W / 2, y: H / 2, props: { que: 'moneda', cada: 0.9, tope: 4, impulso: 0 } },
      ...terreno(rng, o.terreno),
    ];
    r.reglas = [{ id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
      { tipo: 'mensaje', texto: 'Aguanta en el centro: ahí salen las monedas', segundos: 2.5 },
    ] }];
    return r;
  },

  /** Oleadas: todo aparece de golpe y hay que barrer rápido. */
  cosecha(rng, o) {
    const r = base(o);
    r.ajustes.duracion = o.duracion;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'moneda' }),
      ...muros(rng, o.patron, o.densidad),
      ...terreno(rng, o.terreno),
    ];
    r.reglas = [
      { id: 'r1', cuando: { tipo: 'inicio' }, entonces: [
        { tipo: 'generar', que: 'moneda', cuantas: o.siembra + 6, alAzar: 'azar' },
      ] },
      { id: 'r2', unaVez: false, cuando: { tipo: 'cada', segundos: o.ritmo * 3 }, entonces: [
        { tipo: 'generar', que: 'moneda', cuantas: o.siembra, alAzar: 'azar' },
        { tipo: 'sonido', cual: 'pickup' },
      ] },
    ];
    return r;
  },

  /** Laberinto con pinchos: llegar sin tocarlos. */
  laberinto(rng, o) {
    const r = base(o);
    r.ajustes.vidas = 3;
    r.ajustes.duracion = o.duracion + 45;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'jugador' }),
      ...muros(rng, 'celdas', o.densidad + 0.4),
      { tipo: 'meta', x: W - 80, y: H / 2, ancho: 100, alto: 180, props: { gana: true } },
    ];
    for (let i = 0; i < Math.round(o.peligro * 1.6); i++) {
      const p = rejilla(rng, 1, W, H, 160)[0];
      r.piezas.push({ tipo: 'pincho', x: p.x, y: p.y, ancho: 100, alto: 22 });
    }
    return r;
  },

  /** Billar de personas: pelotas pesadas que empujan. */
  bolos(rng, o) {
    const r = base(o);
    r.ajustes.duracion = o.duracion;
    r.arena.friccion = 1.2;
    r.piezas = [
      ...actores(rng, { ...o, persigue: 'jugador' }),
      ...muros(rng, o.patron, o.densidad * 0.5),
    ];
    for (const p of rejilla(rng, 4 + Math.floor(o.peligro), W, H, 200)) {
      r.piezas.push({ tipo: 'pelota', x: p.x, y: p.y, props: { rebote: 0.92, masa: 1.6 } });
    }
    r.piezas.push({ tipo: 'generador', x: W / 2, y: H / 2, props: { que: 'moneda', cada: o.ritmo, tope: 8, impulso: 120 } });
    return r;
  },
};

export const NOMBRES_FAMILIA = {
  recolecta: 'Recolecta', supervivencia: 'Supervivencia', carrera: 'Carrera',
  empuje: 'Empuje', custodia: 'Custodia', cosecha: 'Cosecha',
  laberinto: 'Laberinto', bolos: 'Bolos',
};
