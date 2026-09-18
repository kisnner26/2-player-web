/**
 * perfiles.js — decide qué botonera dibuja el iPad para cada juego.
 *
 * Cada entrada de games/manifest.js ya declara sus controles en texto, para
 * la pantalla de ayuda. Aquí se lee ese mismo texto y se deduce la botonera:
 * un juego que solo dice "Espacio: aletear" recibe un botón enorme que ocupa
 * la tablet entera, y uno con "W A S D: mover" recibe cruceta y acciones.
 *
 * Así los ochenta y tres juegos existentes tienen mando correcto sin tener
 * que anotarlos uno a uno. Cuando la deducción no basta —o un juego nuevo
 * quiere palanca analógica, zona de dibujo o información secreta— el
 * manifiesto puede traer un campo `mando` que manda sobre todo esto.
 */

const NOMBRE_ACCION = { a: 'Acción', b: 'Especial' };

/** Une las líneas de control de un jugador en un solo texto comparable. */
function textoControles(game, slot) {
  const lineas = game.controles?.[`p${slot + 1}`] || [];
  return lineas.join(' · ');
}

/** Lo que hace la tecla, a partir de "Espacio: poner bomba" → "Poner bomba". */
function etiquetaDe(texto, patrones, porDefecto) {
  for (const linea of texto.split(' · ')) {
    if (!patrones.some((p) => p.test(linea))) continue;
    const dosPuntos = linea.indexOf(':');
    if (dosPuntos < 0) continue;
    const desc = linea.slice(dosPuntos + 1).trim();
    if (desc) return desc.charAt(0).toUpperCase() + desc.slice(1);
  }
  return porDefecto;
}

/* Cada jugador tiene su propio juego de teclas, así que los patrones que
   detectan "aquí hay un botón de acción" dependen de quién sea. */
const PATRONES = [
  { a: [/espacio/i], b: [/\bE\b(?!spacio)/, /\bE\+/], horiz: [/A\s*\/\s*D/i, /W\s*A\s*S\s*D/i], vert: [/W\s*\/\s*S/i, /W\s*A\s*S\s*D/i], cruz: [/W\s*A\s*S\s*D/i] },
  { a: [/\bM\b/], b: [/\bN\b/], horiz: [/←\s*\/\s*→/, /↑\s*↓\s*←\s*→/, /↑\s*←\s*↓\s*→/, /←\s*→/], vert: [/↑\s*\/\s*↓/, /↑\s*↓\s*←\s*→/, /↑\s*←\s*↓\s*→/], cruz: [/↑\s*↓\s*←\s*→/, /↑\s*←\s*↓\s*→/] },
];

/**
 * Construye el perfil de mando de un jugador para un juego.
 * @param {object} game  entrada de games/manifest.js
 * @param {number} slot  0 o 1
 * @param {string} color color del jugador, para teñir los botones
 */
export function perfilDeJuego(game, slot, color) {
  if (!game) return perfilMenu(color);

  // Un juego puede traer su propia botonera; se respeta tal cual.
  if (game.mando) {
    const propio = game.mando[slot] || game.mando;
    if (propio?.controles) return { ...propio, juego: game.nombre, color, tipo: 'perfil' };
  }

  const texto = textoControles(game, slot);
  const p = PATRONES[slot] || PATRONES[0];
  const hay = (lista) => lista.some((re) => re.test(texto));

  const cruz = hay(p.cruz) || (hay(p.horiz) && hay(p.vert));
  const horiz = hay(p.horiz);
  const vert = hay(p.vert);
  const tieneA = hay(p.a);
  const tieneB = hay(p.b);

  const botones = [];
  if (tieneA) botones.push({ a: 'a', etiqueta: etiquetaDe(texto, p.a, NOMBRE_ACCION.a) });
  if (tieneB) botones.push({ a: 'b', etiqueta: etiquetaDe(texto, p.b, NOMBRE_ACCION.b) });
  // Sin ninguna acción detectada el mando sería inservible: siempre queda una.
  if (!botones.length) botones.push({ a: 'a', etiqueta: NOMBRE_ACCION.a });

  const controles = [];
  let disposicion = 'dual';

  if (cruz) {
    controles.push({ tipo: 'cruz' });
    controles.push({ tipo: 'acciones', botones });
  } else if (horiz || vert) {
    // Solo un eje: dos teclas grandes, mucho más cómodas que media cruceta.
    const dir = horiz
      ? [{ a: 'left', glifo: '◀' }, { a: 'right', glifo: '▶' }]
      : [{ a: 'up', glifo: '▲' }, { a: 'down', glifo: '▼' }];
    controles.push({ tipo: 'acciones', botones: dir });
    controles.push({ tipo: 'acciones', botones });
  } else {
    // Juegos de un solo gesto (machaque, buzzer, timing): botón a pantalla completa.
    disposicion = botones.length > 1 ? 'pila' : 'solo';
    controles.push({ tipo: 'acciones', botones });
  }

  return {
    tipo: 'perfil',
    juego: game.nombre,
    color,
    disposicion,
    controles,
    pie: game.turnos ? 'Por turnos · espera tu turno' : 'Mira la pantalla de la Mac',
  };
}

/** Botonera del menú: navegar el catálogo y entrar a un juego. */
export function perfilMenu(color) {
  return {
    tipo: 'perfil',
    juego: 'Menú',
    color,
    disposicion: 'dual',
    controles: [
      { tipo: 'cruz' },
      {
        tipo: 'acciones',
        botones: [
          { a: 'a', etiqueta: 'Jugar', glifo: '▶' },
          { a: 'b', etiqueta: 'Atrás', glifo: '↩' },
        ],
      },
    ],
    pie: 'Elige juego en la pantalla de la Mac',
  };
}
