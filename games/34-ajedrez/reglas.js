/**
 * reglas.js — motor de reglas del ajedrez, sin nada de interfaz.
 *
 * Está separado del juego a propósito: así se puede validar con un `perft`
 * (el test estándar del ajedrez por ordenador, que cuenta las posiciones
 * alcanzables a N jugadas) sin necesidad de navegador ni DOM. Si los números
 * cuadran con los publicados, las reglas son correctas — incluidas las tres
 * que casi siempre se implementan mal: enroque, captura al paso y las
 * jugadas que dejarían al propio rey en jaque.
 */

export const N = 8;
export const BLANCAS = 0, NEGRAS = 1;

export const NOMBRES = { p: 'peón', n: 'caballo', b: 'alfil', r: 'torre', q: 'dama', k: 'rey' };
export const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const RECT = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const SALTOS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

export const dentro = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

/** Crea el estado inicial de una partida. */
export function posicionInicial() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const piezas = Array.from({ length: N }, () => new Array(N).fill(null));
  for (let x = 0; x < N; x++) {
    piezas[0][x] = { t: back[x], c: NEGRAS, movida: false };
    piezas[1][x] = { t: 'p', c: NEGRAS, movida: false };
    piezas[6][x] = { t: 'p', c: BLANCAS, movida: false };
    piezas[7][x] = { t: back[x], c: BLANCAS, movida: false };
  }
  return {
    piezas,
    turno: BLANCAS,
    enroque: { 0: { corto: true, largo: true }, 1: { corto: true, largo: true } },
    alPaso: null,
    medios: 0,
    capturadas: [[], []],
  };
}

export const pieza = (E, x, y) => (dentro(x, y) ? E.piezas[y][x] : null);

/* ---------------- Generación de jugadas ---------------- */

/**
 * Jugadas pseudo-legales de la pieza en (x,y): siguen el movimiento de la
 * pieza pero pueden dejar al propio rey en jaque. `legalesDe` las filtra.
 */
export function pseudoLegales(E, x, y) {
  const p = pieza(E, x, y);
  if (!p) return [];
  const out = [];

  const añadir = (nx, ny) => {
    if (!dentro(nx, ny)) return false;
    const o = pieza(E, nx, ny);
    if (o && o.c === p.c) return false;
    out.push({ x: nx, y: ny, captura: !!o });
    return !o;                       // solo se sigue deslizando por casilla vacía
  };
  const deslizar = (dirs) => {
    for (const [dx, dy] of dirs) {
      let nx = x + dx, ny = y + dy;
      while (añadir(nx, ny)) { nx += dx; ny += dy; }
    }
  };

  switch (p.t) {
    case 'p': {
      const dir = p.c === BLANCAS ? -1 : 1;
      const filaInicio = p.c === BLANCAS ? 6 : 1;
      const filaFinal = p.c === BLANCAS ? 0 : 7;

      const empujar = (nx, ny, extra) => {
        // Un peón que llega al fondo genera cuatro jugadas, una por pieza.
        if (ny === filaFinal) {
          for (const t of ['q', 'r', 'b', 'n']) out.push({ x: nx, y: ny, promocion: t, ...extra });
        } else out.push({ x: nx, y: ny, ...extra });
      };

      if (!pieza(E, x, y + dir)) {
        empujar(x, y + dir, { captura: false });
        if (y === filaInicio && !pieza(E, x, y + dir * 2)) {
          out.push({ x, y: y + dir * 2, captura: false, dobleAvance: true });
        }
      }
      for (const dx of [-1, 1]) {
        const nx = x + dx, ny = y + dir;
        if (!dentro(nx, ny)) continue;
        const o = pieza(E, nx, ny);
        if (o && o.c !== p.c) empujar(nx, ny, { captura: true });
        if (E.alPaso && E.alPaso.x === nx && E.alPaso.y === ny) {
          out.push({ x: nx, y: ny, captura: true, alPaso: true });
        }
      }
      break;
    }
    case 'n': for (const [dx, dy] of SALTOS) añadir(x + dx, y + dy); break;
    case 'b': deslizar(DIAG); break;
    case 'r': deslizar(RECT); break;
    case 'q': deslizar([...DIAG, ...RECT]); break;
    case 'k': {
      for (const [dx, dy] of [...DIAG, ...RECT]) añadir(x + dx, y + dy);
      const fila = p.c === BLANCAS ? 7 : 0;
      if (!p.movida && y === fila && x === 4) {
        const torreDer = pieza(E, 7, fila);
        if (E.enroque[p.c].corto && torreDer?.t === 'r' && torreDer.c === p.c && !torreDer.movida &&
            !pieza(E, 5, fila) && !pieza(E, 6, fila)) {
          out.push({ x: 6, y: fila, enroque: 'corto' });
        }
        const torreIzq = pieza(E, 0, fila);
        if (E.enroque[p.c].largo && torreIzq?.t === 'r' && torreIzq.c === p.c && !torreIzq.movida &&
            !pieza(E, 1, fila) && !pieza(E, 2, fila) && !pieza(E, 3, fila)) {
          out.push({ x: 2, y: fila, enroque: 'largo' });
        }
      }
      break;
    }
  }
  return out;
}

export function buscarRey(E, color) {
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const p = E.piezas[y][x];
      if (p?.t === 'k' && p.c === color) return { x, y };
    }
  }
  return null;
}

/**
 * Casillas que ATACA la pieza de (x,y), que no es lo mismo que sus jugadas.
 *
 * La diferencia está en el peón y es la fuente clásica de errores: un peón
 * ataca las dos diagonales SIEMPRE, haya o no una pieza ahí, mientras que su
 * avance recto no ataca nada. Usar las jugadas en vez de los ataques deja
 * enrocar por encima de una casilla vacía defendida por un peón.
 */
export function ataquesDe(E, x, y) {
  const p = pieza(E, x, y);
  if (!p) return [];
  if (p.t === 'p') {
    const dir = p.c === BLANCAS ? -1 : 1;
    return [[x - 1, y + dir], [x + 1, y + dir]]
      .filter(([ax, ay]) => dentro(ax, ay))
      .map(([ax, ay]) => ({ x: ax, y: ay }));
  }
  // El resto de piezas atacan justo donde pueden moverse, salvo el enroque,
  // que no amenaza su casilla de destino.
  return pseudoLegales(E, x, y).filter((m) => !m.enroque);
}

/** ¿La casilla (x,y) está atacada por alguna pieza de `porColor`? */
export function atacada(E, x, y, porColor) {
  for (let cy = 0; cy < N; cy++) {
    for (let cx = 0; cx < N; cx++) {
      const p = E.piezas[cy][cx];
      if (!p || p.c !== porColor) continue;
      for (const a of ataquesDe(E, cx, cy)) {
        if (a.x === x && a.y === y) return true;
      }
    }
  }
  return false;
}

export function enJaque(E, color) {
  const r = buscarRey(E, color);
  return r ? atacada(E, r.x, r.y, 1 - color) : false;
}

/* ---------------- Aplicar y deshacer ---------------- */

/** Aplica un movimiento y devuelve el registro necesario para revertirlo. */
export function aplicar(E, desde, m) {
  const p = E.piezas[desde.y][desde.x];
  // Se guarda el tipo ANTES de una posible coronación: después de promover,
  // `p.t` ya no dice qué pieza se movió, y los derechos de enroque dependen
  // de eso (un peón coronado a torre no debe tocarlos).
  const tipoOriginal = p.t;
  const d = {
    desde, m, pieza: p,
    capturada: E.piezas[m.y][m.x],
    capturadaEn: { x: m.x, y: m.y },
    alPasoPrev: E.alPaso,
    enroquePrev: { 0: { ...E.enroque[0] }, 1: { ...E.enroque[1] } },
    mediosPrev: E.medios,
    movidaPrev: p.movida,
    torre: null,
    eraPeon: false,
  };

  if (m.alPaso) {
    const cy = p.c === BLANCAS ? m.y + 1 : m.y - 1;
    d.capturada = E.piezas[cy][m.x];
    d.capturadaEn = { x: m.x, y: cy };
    E.piezas[cy][m.x] = null;
  }

  E.piezas[m.y][m.x] = p;
  E.piezas[desde.y][desde.x] = null;
  p.movida = true;

  if (m.enroque) {
    const fila = m.y;
    const [origen, destino] = m.enroque === 'corto' ? [7, 5] : [0, 3];
    const torre = E.piezas[fila][origen];
    E.piezas[fila][destino] = torre;
    E.piezas[fila][origen] = null;
    d.torre = { origen, destino, fila, pieza: torre, movidaPrev: torre.movida };
    torre.movida = true;
  }

  if (m.promocion) { d.eraPeon = true; p.t = m.promocion; }

  // Casilla de captura al paso: solo vive un movimiento.
  E.alPaso = m.dobleAvance ? { x: m.x, y: (desde.y + m.y) / 2 } : null;

  // Derechos de enroque. Se pierden en tres casos, y los tres importan:
  if (tipoOriginal === 'k') {
    // 1. Mover el rey (incluido enrocar) los quita los dos.
    E.enroque[p.c].corto = false;
    E.enroque[p.c].largo = false;
  } else if (tipoOriginal === 'r') {
    // 2. Mover una torre quita el de su lado.
    const fila = p.c === BLANCAS ? 7 : 0;
    if (desde.y === fila && desde.x === 0) E.enroque[p.c].largo = false;
    if (desde.y === fila && desde.x === 7) E.enroque[p.c].corto = false;
  }
  // 3. Que te capturen una torre en su casilla de origen quita el del rival.
  if (d.capturada?.t === 'r') {
    const filaRival = d.capturada.c === BLANCAS ? 7 : 0;
    if (d.capturadaEn.y === filaRival && d.capturadaEn.x === 0) E.enroque[d.capturada.c].largo = false;
    if (d.capturadaEn.y === filaRival && d.capturadaEn.x === 7) E.enroque[d.capturada.c].corto = false;
  }

  // Regla de 50 movimientos: el contador se reinicia con peón o con captura.
  E.medios = (tipoOriginal === 'p' || d.capturada) ? 0 : E.medios + 1;
  return d;
}

export function deshacer(E, d) {
  const p = d.pieza;
  E.piezas[d.desde.y][d.desde.x] = p;
  E.piezas[d.m.y][d.m.x] = null;
  if (d.capturada) E.piezas[d.capturadaEn.y][d.capturadaEn.x] = d.capturada;
  if (d.torre) {
    E.piezas[d.torre.fila][d.torre.origen] = d.torre.pieza;
    E.piezas[d.torre.fila][d.torre.destino] = null;
    d.torre.pieza.movida = d.torre.movidaPrev;
  }
  if (d.eraPeon) p.t = 'p';
  p.movida = d.movidaPrev;
  E.alPaso = d.alPasoPrev;
  E.enroque = d.enroquePrev;
  E.medios = d.mediosPrev;
}

/* ---------------- Jugadas legales ---------------- */

/** Jugadas legales de la pieza en (x,y), del color que tenga el turno. */
export function legalesDe(E, x, y) {
  const p = pieza(E, x, y);
  if (!p || p.c !== E.turno) return [];
  const out = [];
  for (const m of pseudoLegales(E, x, y)) {
    if (m.enroque) {
      // No se puede enrocar en jaque, ni pasando por una casilla atacada.
      if (enJaque(E, p.c)) continue;
      const paso = m.enroque === 'corto' ? 5 : 3;
      if (atacada(E, paso, m.y, 1 - p.c)) continue;
    }
    const d = aplicar(E, { x, y }, m);
    const ilegal = enJaque(E, p.c);
    deshacer(E, d);
    if (!ilegal) out.push(m);
  }
  return out;
}

/** Todas las jugadas legales del color que tiene el turno. */
export function todasLegales(E, color = E.turno) {
  const guardado = E.turno;
  E.turno = color;
  const out = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (E.piezas[y][x]?.c !== color) continue;
      for (const m of legalesDe(E, x, y)) out.push({ desde: { x, y }, ...m });
    }
  }
  E.turno = guardado;
  return out;
}

/* ---------------- Final de partida ---------------- */

export function materialInsuficiente(E) {
  const restantes = [];
  for (const f of E.piezas) for (const p of f) if (p && p.t !== 'k') restantes.push(p);
  if (restantes.length === 0) return true;
  if (restantes.length === 1 && (restantes[0].t === 'n' || restantes[0].t === 'b')) return true;
  if (restantes.length === 2 && restantes.every((p) => p.t === 'b') && restantes[0].c !== restantes[1].c) return true;
  return false;
}

/**
 * @returns {{tipo:'jaque-mate'|'ahogado'|'tablas-50'|'tablas-material'|'jaque'|'normal', jugadas:number}}
 */
export function evaluar(E) {
  const jugadas = todasLegales(E, E.turno);
  const jaque = enJaque(E, E.turno);
  if (jugadas.length === 0) return { tipo: jaque ? 'jaque-mate' : 'ahogado', jugadas: 0 };
  if (E.medios >= 100) return { tipo: 'tablas-50', jugadas: jugadas.length };
  if (materialInsuficiente(E)) return { tipo: 'tablas-material', jugadas: jugadas.length };
  return { tipo: jaque ? 'jaque' : 'normal', jugadas: jugadas.length };
}

/**
 * Cuenta las posiciones alcanzables en `profundidad` jugadas.
 * Es el test estándar para validar un generador de movimientos: los valores
 * correctos desde la posición inicial son 20, 400, 8902, 197281, 4865609.
 */
export function perft(E, profundidad) {
  if (profundidad === 0) return 1;
  const jugadas = todasLegales(E, E.turno);
  if (profundidad === 1) return jugadas.length;
  let total = 0;
  for (const j of jugadas) {
    const d = aplicar(E, j.desde, j);
    E.turno = 1 - E.turno;
    total += perft(E, profundidad - 1);
    E.turno = 1 - E.turno;
    deshacer(E, d);
  }
  return total;
}
