/**
 * Banco de preguntas de Trivia Buzzer.
 *
 * Convención: `opciones[0]` es SIEMPRE la respuesta correcta. El juego baraja
 * las cuatro posiciones antes de mostrarlas, así que aquí se puede leer y
 * corregir el banco de un vistazo sin descifrar índices.
 *
 * Para añadir preguntas basta con seguir el mismo formato.
 */

export const PREGUNTAS = [
  /* ---------- Geografía ---------- */
  { categoria: 'Geografía', texto: '¿Cuál es el río más largo del mundo?',
    opciones: ['El Nilo', 'El Amazonas', 'El Yangtsé', 'El Misisipi'] },
  { categoria: 'Geografía', texto: '¿En qué país está el lago Titicaca?',
    opciones: ['Entre Perú y Bolivia', 'Entre Chile y Argentina', 'En Ecuador', 'En Colombia'] },
  { categoria: 'Geografía', texto: '¿Cuál es el país más pequeño del mundo?',
    opciones: ['El Vaticano', 'Mónaco', 'San Marino', 'Liechtenstein'] },
  { categoria: 'Geografía', texto: '¿Qué océano baña la costa este de Nicaragua?',
    opciones: ['El Atlántico', 'El Pacífico', 'El Índico', 'El Ártico'] },
  { categoria: 'Geografía', texto: '¿Cuál es la capital de Australia?',
    opciones: ['Canberra', 'Sídney', 'Melbourne', 'Brisbane'] },
  { categoria: 'Geografía', texto: '¿Qué desierto es el más grande del mundo?',
    opciones: ['La Antártida', 'El Sáhara', 'El Gobi', 'El Atacama'] },
  { categoria: 'Geografía', texto: '¿Cuántos países hispanohablantes hay en América?',
    opciones: ['18', '15', '21', '12'] },

  /* ---------- Ciencia ---------- */
  { categoria: 'Ciencia', texto: '¿Cuál es el elemento más abundante del universo?',
    opciones: ['Hidrógeno', 'Oxígeno', 'Helio', 'Carbono'] },
  { categoria: 'Ciencia', texto: '¿Cuántos huesos tiene un adulto humano?',
    opciones: ['206', '186', '224', '198'] },
  { categoria: 'Ciencia', texto: '¿Qué planeta gira sobre su costado?',
    opciones: ['Urano', 'Neptuno', 'Saturno', 'Venus'] },
  { categoria: 'Ciencia', texto: '¿Qué gas absorben las plantas para la fotosíntesis?',
    opciones: ['Dióxido de carbono', 'Oxígeno', 'Nitrógeno', 'Metano'] },
  { categoria: 'Ciencia', texto: '¿A qué velocidad viaja la luz en el vacío?',
    opciones: ['300.000 km/s', '150.000 km/s', '1.000.000 km/s', '30.000 km/s'] },
  { categoria: 'Ciencia', texto: '¿Cuál es el animal terrestre más rápido?',
    opciones: ['El guepardo', 'El antílope', 'El caballo', 'El galgo'] },
  { categoria: 'Ciencia', texto: '¿Qué órgano produce la insulina?',
    opciones: ['El páncreas', 'El hígado', 'El riñón', 'El bazo'] },
  { categoria: 'Ciencia', texto: '¿Cuánto tarda la luz del Sol en llegar a la Tierra?',
    opciones: ['Unos 8 minutos', 'Unos 8 segundos', 'Una hora', 'Instantáneamente'] },

  /* ---------- Historia ---------- */
  { categoria: 'Historia', texto: '¿En qué año llegó el ser humano a la Luna?',
    opciones: ['1969', '1965', '1972', '1959'] },
  { categoria: 'Historia', texto: '¿Qué civilización construyó Machu Picchu?',
    opciones: ['Los incas', 'Los mayas', 'Los aztecas', 'Los olmecas'] },
  { categoria: 'Historia', texto: '¿Cuánto duró la Guerra de los Cien Años?',
    opciones: ['116 años', '100 años exactos', '75 años', '130 años'] },
  { categoria: 'Historia', texto: '¿Qué muro cayó en 1989?',
    opciones: ['El muro de Berlín', 'La muralla china', 'El muro de Adriano', 'El muro de las lamentaciones'] },
  { categoria: 'Historia', texto: '¿Quién pintó el techo de la Capilla Sixtina?',
    opciones: ['Miguel Ángel', 'Leonardo da Vinci', 'Rafael', 'Donatello'] },
  { categoria: 'Historia', texto: '¿Qué imperio construyó el Coliseo de Roma?',
    opciones: ['El Imperio romano', 'El Imperio griego', 'El Imperio bizantino', 'El Imperio otomano'] },

  /* ---------- Videojuegos ---------- */
  { categoria: 'Videojuegos', texto: '¿Cómo se llama el juego arcade de paletas de 1972 que popularizó los videojuegos?',
    opciones: ['Pong', 'Breakout', 'Space Invaders', 'Asteroids'] },
  { categoria: 'Videojuegos', texto: '¿De qué color es el fantasma que persigue directamente en el laberinto clásico?',
    opciones: ['Rojo', 'Rosa', 'Azul', 'Naranja'] },
  { categoria: 'Videojuegos', texto: '¿Cuántas piezas distintas tiene el juego de bloques que caen?',
    opciones: ['7', '5', '6', '8'] },
  { categoria: 'Videojuegos', texto: '¿Qué consola introdujo el mando con dos palancas analógicas de serie?',
    opciones: ['PlayStation (DualShock)', 'Nintendo 64', 'Sega Saturn', 'Atari Jaguar'] },
  { categoria: 'Videojuegos', texto: '¿Qué significa "NPC" en un videojuego?',
    opciones: ['Personaje no jugable', 'Nueva partida cargada', 'Nivel por completar', 'Núcleo de procesamiento'] },
  { categoria: 'Videojuegos', texto: '¿Qué género popularizó el juego de disparos en primera persona en 1993?',
    opciones: ['El FPS', 'El RPG', 'El RTS', 'El battle royale'] },

  /* ---------- Cine y música ---------- */
  { categoria: 'Cine', texto: '¿Qué película ganó el primer Óscar a mejor película animada?',
    opciones: ['Shrek', 'Toy Story', 'Monstruos S.A.', 'El rey león'] },
  { categoria: 'Cine', texto: '¿Cuántas películas componen la trilogía original de La Guerra de las Galaxias?',
    opciones: ['Tres', 'Seis', 'Cuatro', 'Nueve'] },
  { categoria: 'Música', texto: '¿Cuántas cuerdas tiene una guitarra española estándar?',
    opciones: ['Seis', 'Cuatro', 'Siete', 'Doce'] },
  { categoria: 'Música', texto: '¿Cuántas teclas tiene un piano de cola estándar?',
    opciones: ['88', '76', '96', '64'] },
  { categoria: 'Música', texto: '¿Qué instrumento tocaba principalmente Louis Armstrong?',
    opciones: ['La trompeta', 'El saxofón', 'El piano', 'El clarinete'] },

  /* ---------- Deportes ---------- */
  { categoria: 'Deportes', texto: '¿Cada cuántos años se celebran los Juegos Olímpicos de verano?',
    opciones: ['Cada 4 años', 'Cada 2 años', 'Cada 5 años', 'Cada 3 años'] },
  { categoria: 'Deportes', texto: '¿Cuántos jugadores tiene un equipo de baloncesto en la cancha?',
    opciones: ['Cinco', 'Seis', 'Siete', 'Cuatro'] },
  { categoria: 'Deportes', texto: '¿En qué deporte se usa el término "home run"?',
    opciones: ['Béisbol', 'Fútbol americano', 'Críquet', 'Hockey'] },
  { categoria: 'Deportes', texto: '¿Cuánto mide una portería de fútbol de ancho?',
    opciones: ['7,32 metros', '6 metros', '8 metros', '5,5 metros'] },

  /* ---------- Lengua y curiosidades ---------- */
  { categoria: 'Lengua', texto: '¿Cuántas letras tiene el alfabeto español actual?',
    opciones: ['27', '26', '28', '29'] },
  { categoria: 'Lengua', texto: '¿Qué es un palíndromo?',
    opciones: ['Una palabra que se lee igual al revés', 'Una palabra sin vocales', 'Un sinónimo exacto', 'Una palabra de origen griego'] },
  { categoria: 'Curiosidades', texto: '¿De qué animal proviene la lana de cachemira?',
    opciones: ['De la cabra', 'De la oveja', 'De la alpaca', 'Del conejo'] },
  { categoria: 'Curiosidades', texto: '¿Qué fruta tiene sus semillas por fuera?',
    opciones: ['La fresa', 'El kiwi', 'La frambuesa', 'El higo'] },
  { categoria: 'Curiosidades', texto: '¿Cuántos minutos tiene un día completo?',
    opciones: ['1440', '1200', '1600', '2400'] },
  { categoria: 'Curiosidades', texto: '¿Qué color se obtiene mezclando azul y amarillo?',
    opciones: ['Verde', 'Morado', 'Naranja', 'Marrón'] },
  { categoria: 'Curiosidades', texto: '¿Cuál es el metal líquido a temperatura ambiente?',
    opciones: ['El mercurio', 'El plomo', 'El estaño', 'El aluminio'] },

  /* ---------- Tecnología ---------- */
  { categoria: 'Tecnología', texto: '¿Qué significan las siglas HTML?',
    opciones: ['HyperText Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language', 'Hyperlink Text Machine Language'] },
  { categoria: 'Tecnología', texto: '¿Cuántos bits tiene un byte?',
    opciones: ['8', '16', '4', '32'] },
  { categoria: 'Tecnología', texto: '¿Qué empresa fabricó el primer Macintosh?',
    opciones: ['Apple', 'IBM', 'Microsoft', 'Xerox'] },
  { categoria: 'Tecnología', texto: '¿Qué tecla se usa junto a otra para copiar en un Mac?',
    opciones: ['Command (⌘)', 'Control', 'Option', 'Shift'] },
];
