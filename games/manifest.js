/**
 * manifest.js — registro de los juegos del catálogo.
 *
 * Agregar un juego = crear su carpeta con game.js y añadir una entrada aquí.
 * Nada más en el proyecto necesita saber que existe.
 *
 * Campos:
 *   id          identificador estable (se usa en récords y rivalidad; no cambiar)
 *   carpeta     nombre de la carpeta dentro de games/
 *   nombre      título mostrado
 *   categoria   arcade | versus | reflejos | tablero | coop | touchbar
 *   estetica    neon | pixel | papel | suave | oled | real   (define el look)
 *   descripcion una línea para el catálogo
 *   controles   { p1: [...], p2: [...] } textos de ayuda
 *   duracion    estimación legible
 *   render      'canvas' (por defecto) | 'dom'
 *   turnos      true si es por turnos (no necesita teclas simultáneas)
 *   touchbar    true = solo visible con Touch Bar detectada
 *   tags        para búsqueda
 */

import { GENERADOS } from './generados/lista.js';

const WASD = 'W A S D';
const FLECHAS = '↑ ↓ ← →';

export const CATEGORIAS = {
  arcade:   { nombre: 'Duelos arcade', icon: 'bolt',      color: '#ff2e88', desc: 'Acción en tiempo real, uno contra uno.' },
  versus:   { nombre: 'Versus',        icon: 'flame',     color: '#b04cff', desc: 'Clásicos reinterpretados como duelo.' },
  reflejos: { nombre: 'Reflejos',      icon: 'target',    color: '#00e5ff', desc: 'Nervio, memoria y dedos rápidos.' },
  tablero:  { nombre: 'Tablero',       icon: 'chess',     color: '#ffd166', desc: 'Por turnos, sin prisa, mucha cabeza.' },
  coop:     { nombre: 'Cooperativos',  icon: 'link',      color: '#a8ff3e', desc: 'Los dos ganan o los dos pierden.' },
  pareja:   { nombre: 'Pareja',        icon: 'heart',     color: '#ff6ec7', desc: 'Aventura y coordinación para dos: nada de cuestionarios.' },
  tactil:   { nombre: 'Con mando',     icon: 'phone',     color: '#3effc8', desc: 'Piden un iPad o un móvil de mando: cosas que un teclado compartido no permite.' },
  realismo: { nombre: 'Realismo',      icon: 'globe',     color: '#ff8c42', desc: 'Tres dimensiones y física de verdad: peso, rebote, viento y rozamiento.' },
  solo:     { nombre: 'Un jugador',    icon: 'cpu',      color: '#5b8cff', desc: 'Tú contra la máquina, con tres dificultades. Para cuando juegas sin nadie al lado.' },
  creados:  { nombre: 'Hechos con el creador', icon: 'palette', color: '#3effc8', desc: 'Juegos que no son código sino una receta de piezas y reglas, interpretada por core/creador.' },
  desafios: { nombre: 'Desafíos',      icon: 'dice',      color: '#b04cff', desc: 'Arenas generadas: ocho formas de juego con parámetros que cambian cómo se juega. Para las tardes largas.' },
  touchbar: { nombre: 'Touch Bar',     icon: 'bars',      color: '#ffffff', desc: 'Exclusivos de la barra táctil de tu MacBook.' },
};

export const GAMES = [
  /* ═══════════════ DUELOS ARCADE (16) ═══════════════ */
  {
    id: 'pong-neon', carpeta: '01-pong-neon', nombre: 'Pong Neón', categoria: 'arcade', estetica: 'neon',
    descripcion: 'El duelo de paletas definitivo, con efecto y power-ups.',
    controles: { p1: [`${WASD.slice(0, 3)} · W/S mover`, 'Espacio: saque con efecto'], p2: [`${FLECHAS} · ↑/↓ mover`, 'M: saque con efecto'] },
    duracion: '2-4 min', tags: ['pong', 'paletas', 'clásico'],
  },
  {
    id: 'hockey-mesa', carpeta: '02-hockey-mesa', nombre: 'Hockey de Mesa', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Disco, mazos y físicas de aire. Siete goles y se acabó.',
    controles: { p1: [`${WASD}: mover mazo`], p2: [`${FLECHAS}: mover mazo`] },
    duracion: '3-5 min', tags: ['hockey', 'deporte', 'físicas'],
  },
  {
    id: 'curvas', carpeta: '03-curvas', nombre: 'Curvas', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Tu línea nunca para y deja huecos. El último que sobrevive gana.',
    controles: { p1: ['A / D: girar'], p2: ['← / →: girar'] },
    duracion: '3-6 min', tags: ['achtung', 'curve fever', 'estela'],
  },
  {
    id: 'ciclos-luz', carpeta: '04-ciclos-luz', nombre: 'Ciclos de Luz', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Motos de luz en ángulo recto. Encierra al rival en su propia estela.',
    controles: { p1: [`${WASD}: girar`, 'Espacio: turbo'], p2: [`${FLECHAS}: girar`, 'M: turbo'] },
    duracion: '2-4 min', tags: ['motos de luz', 'estela', 'rejilla'],
  },
  {
    id: 'tanques', carpeta: '05-tanques', nombre: 'Tanques', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Laberinto y balas que rebotan. Cuidado con la tuya.',
    controles: { p1: ['W/S: avanzar', 'A/D: girar', 'Espacio: disparar'], p2: ['↑/↓: avanzar', '←/→: girar', 'M: disparar'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Disparar', glifo: '◎' }] },
    ] },
    duracion: '3-6 min', tags: ['tanque', 'rebote', 'laberinto'],
  },
  {
    id: 'duelo-estelar', carpeta: '06-duelo-estelar', nombre: 'Duelo Estelar', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Dos naves, un sol que tira de todo y muy poco combustible.',
    controles: { p1: ['A/D: rotar', 'W: propulsar', 'Espacio: disparar'], p2: ['←/→: rotar', '↑: propulsar', 'M: disparar'] },
    duracion: '3-5 min', tags: ['spacewar', 'gravedad', 'naves'],
  },
  {
    id: 'artilleria', carpeta: '07-artilleria', nombre: 'Artillería', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Ángulo, potencia y viento. Por turnos, hasta que uno caiga.',
    controles: { p1: ['W/S: ángulo', 'Espacio: cargar y soltar'], p2: ['↑/↓: ángulo', 'M: cargar y soltar'] },
    duracion: '4-7 min', turnos: true, tags: ['worms', 'balística', 'turnos'],
  },
  {
    id: 'sumo', carpeta: '08-sumo', nombre: 'Sumo', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Empuja al otro fuera del círculo. La plataforma se encoge.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: embestida'], p2: [`${FLECHAS}: mover`, 'M: embestida'] },
    duracion: '2-4 min', tags: ['empujar', 'arena', 'físicas'],
  },
  {
    id: 'voley-slime', carpeta: '09-voley-slime', nombre: 'Voley Slime', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Dos gotas saltarinas y una pelota que no debe tocar tu suelo.',
    controles: { p1: ['A/D: mover', 'W: saltar'], p2: ['←/→: mover', '↑: saltar'] },
    duracion: '3-5 min', tags: ['voleibol', 'slime', 'deporte'],
  },
  {
    id: 'futbol-cabezon', carpeta: '10-futbol-cabezon', nombre: 'Fútbol Cabezón', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Uno contra uno, cabezazos y chilenas. Gol de oro opcional.',
    controles: { p1: ['A/D: correr', 'W: saltar', 'Espacio: patear'], p2: ['←/→: correr', '↑: saltar', 'M: patear'] },
    duracion: '3-5 min', tags: ['fútbol', 'deporte', 'chilena'],
  },
  {
    id: 'bombas', carpeta: '11-bombas', nombre: 'Bombas', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Laberinto destructible, bombas y mejoras. No te encierres solo.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: poner bomba'], p2: [`${FLECHAS}: mover`, 'M: poner bomba'] },
    duracion: '3-6 min', tags: ['bomberman', 'explosión', 'laberinto'],
  },
  {
    id: 'justa-aerea', carpeta: '12-justa-aerea', nombre: 'Justa Aérea', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Aletea para subir y golpea desde arriba. Quien esté más alto, manda.',
    controles: { p1: ['A/D: dirigir', 'W: aletear'], p2: ['←/→: dirigir', '↑: aletear'] },
    duracion: '3-5 min', tags: ['joust', 'vuelo', 'plataformas'],
  },
  {
    id: 'aleteo', carpeta: '13-aleteo', nombre: 'Aleteo', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Carrera de aleteo entre tuberías. El primero en llegar al final.',
    controles: { p1: ['W o Espacio: aletear'], p2: ['↑ o M: aletear'] },
    duracion: '2-3 min', tags: ['flappy', 'carrera', 'obstáculos'],
  },
  {
    id: 'circuito', carpeta: '14-circuito', nombre: 'Circuito', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Carrera vista desde arriba. Tres vueltas y el asfalto no perdona.',
    controles: { p1: ['W: acelerar', 'S: frenar', 'A/D: girar'], p2: ['↑: acelerar', '↓: frenar', '←/→: girar'] },
    duracion: '3-5 min', tags: ['carreras', 'derrape', 'vueltas'],
  },
  {
    id: 'esgrima', carpeta: '15-esgrima', nombre: 'Esgrima', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Estocada, guardia y terreno. Llega a la salida del rival.',
    controles: { p1: ['A/D: avanzar', 'W/S: alto y bajo', 'Espacio: estocada'], p2: ['←/→: avanzar', '↑/↓: alto y bajo', 'M: estocada'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Estocada', glifo: '⚔' }] },
    ] },
    duracion: '3-6 min', tags: ['nidhogg', 'duelo', 'espada'],
  },
  {
    id: 'bolitas-fantasma', carpeta: '16-bolitas-fantasma', nombre: 'Bolitas vs Fantasma', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Asimétrico: uno come el laberinto, el otro lo caza. Luego cambian.',
    controles: { p1: [`${WASD}: comelón`], p2: [`${FLECHAS}: fantasma`] },
    duracion: '4-6 min', tags: ['comecocos', 'asimétrico', 'persecución'],
  },

  /* ═══════════════ VERSUS (4) ═══════════════ */
  {
    id: 'muro-doble', carpeta: '17-muro-doble', nombre: 'Muro Doble', categoria: 'versus', estetica: 'neon',
    descripcion: 'Un muro de ladrillos al centro. Rompe más que el rival antes de fallar.',
    controles: { p1: ['A/D: mover paleta'], p2: ['←/→: mover paleta'] },
    duracion: '3-5 min', tags: ['breakout', 'ladrillos', 'paleta'],
  },
  {
    id: 'bloques-versus', carpeta: '18-bloques-versus', nombre: 'Bloques Versus', categoria: 'versus', estetica: 'pixel',
    descripcion: 'Piezas que caen. Cada línea que haces le manda basura al otro.',
    controles: { p1: ['A/D: mover', 'W: rotar', 'S: bajar', 'Espacio: soltar'], p2: ['←/→: mover', '↑: rotar', '↓: bajar', 'M: soltar'] },
    duracion: '4-8 min', tags: ['piezas que caen', 'bloques', 'basura'],
  },
  {
    id: 'meteoros', carpeta: '19-meteoros', nombre: 'Lluvia de Meteoros', categoria: 'versus', estetica: 'neon',
    descripcion: 'Esquiva lo que cae mientras la arena se encoge. El último en pie.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: esquivar'], p2: [`${FLECHAS}: mover`, 'M: esquivar'] },
    duracion: '2-4 min', tags: ['supervivencia', 'esquivar', 'arena'],
  },
  {
    id: 'duelo-oeste', carpeta: '20-duelo-oeste', nombre: 'Duelo del Oeste', categoria: 'versus', estetica: 'pixel',
    descripcion: 'Espera la señal. Dispara antes y pierdes; tarde, también.',
    controles: { p1: ['Espacio: desenfundar'], p2: ['M: desenfundar'] },
    duracion: '1-3 min', tags: ['reacción', 'oeste', 'duelo'],
  },

  /* ═══════════════ REFLEJOS Y FIESTA (7) ═══════════════ */
  {
    id: 'tira-afloja', carpeta: '21-tira-afloja', nombre: 'Tira y Afloja', categoria: 'reflejos', estetica: 'pixel',
    descripcion: 'Machaca tu tecla y arrastra la cuerda a tu lado. Simple y brutal.',
    controles: { p1: ['Espacio: tirar'], p2: ['M: tirar'] },
    duracion: '1-2 min', tags: ['machaque', 'fuerza', 'rápido'],
  },
  {
    id: 'reflejos', carpeta: '22-reflejos', nombre: 'Reflejos', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Señales verdaderas y trampas. El primero que acierta suma.',
    controles: { p1: ['Espacio: reaccionar'], p2: ['M: reaccionar'] },
    duracion: '2-3 min', tags: ['reacción', 'trampa', 'nervio'],
  },
  {
    id: 'simon', carpeta: '23-simon', nombre: 'Simón Dice', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'La secuencia crece. El primero que se equivoca, pierde.',
    controles: { p1: [`${WASD}: los cuatro colores`], p2: [`${FLECHAS}: los cuatro colores`] },
    duracion: '2-5 min', turnos: true, tags: ['memoria', 'secuencia', 'colores'],
  },
  {
    id: 'topos', carpeta: '24-topos', nombre: 'Topos', categoria: 'reflejos', estetica: 'pixel',
    descripcion: 'Nueve agujeros cada uno. Aporrea la tecla correcta antes que él.',
    controles: { p1: ['Q W E / A S D / Z X C'], p2: ['U I O / J K L / M , .'] },
    duracion: '2-3 min', tags: ['topos', 'rejilla', 'velocidad'],
  },
  {
    id: 'carrera-teclas', carpeta: '25-carrera-teclas', nombre: 'Carrera de Teclas', categoria: 'reflejos', estetica: 'papel',
    descripcion: 'Escribe la frase sin fallos. Tu corredor avanza con cada palabra.',
    controles: { p1: ['Escribe en tu campo'], p2: ['Escribe en tu campo'] },
    duracion: '2-4 min', render: 'dom', turnos: true, tags: ['mecanografía', 'escribir', 'carrera'],
  },
  {
    id: 'ritmo', carpeta: '26-ritmo', nombre: 'Ritmo', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Flechas que caen al compás. Precisión, combo y nada de improvisar.',
    controles: { p1: [`${WASD}: las cuatro pistas`], p2: [`${FLECHAS}: las cuatro pistas`] },
    duracion: '2-4 min', tags: ['música', 'ritmo', 'combo'],
  },
  {
    id: 'trivia', carpeta: '27-trivia', nombre: 'Trivia Buzzer', categoria: 'reflejos', estetica: 'papel',
    descripcion: 'Pregunta en pantalla, buzzer y cuatro opciones. Fallar resta.',
    controles: { p1: ['Espacio: buzzer', 'W A S D: opción'], p2: ['M: buzzer', '↑ ← ↓ →: opción'] },
    duracion: '4-6 min', render: 'dom', turnos: true, tags: ['preguntas', 'cultura', 'buzzer'],
  },

  /* ═══════════════ TABLERO (8) ═══════════════ */
  {
    id: 'tres-en-raya', carpeta: '28-tres-en-raya', nombre: 'Tres en Raya ∞', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Ultimate: nueve tableros anidados. Tu jugada decide dónde juega el otro.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: colocar'], p2: [`${FLECHAS}: mover`, 'M: colocar'] },
    duracion: '2-6 min', render: 'dom', turnos: true, tags: ['tres en raya', 'ultimate', 'clásico'],
  },
  {
    id: 'conecta4', carpeta: '29-conecta4', nombre: 'Conecta 4', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Fichas que caen. Cuatro en línea en cualquier dirección.',
    controles: { p1: ['A/D: columna', 'Espacio: soltar'], p2: ['←/→: columna', 'M: soltar'] },
    duracion: '3-5 min', render: 'dom', turnos: true, tags: ['conecta 4', 'línea', 'clásico'],
  },
  {
    id: 'damas', carpeta: '30-damas', nombre: 'Damas', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Capturas encadenadas y coronación. Reglas completas.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: elegir'], p2: [`${FLECHAS}: mover`, 'M: elegir'] },
    duracion: '6-12 min', render: 'dom', turnos: true, tags: ['damas', 'captura', 'clásico'],
  },
  {
    id: 'reversi', carpeta: '31-reversi', nombre: 'Reversi', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Voltea las fichas del rival encerrándolas. Gana quien tenga más.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: colocar'], p2: [`${FLECHAS}: mover`, 'M: colocar'] },
    duracion: '5-10 min', render: 'dom', turnos: true, tags: ['othello', 'voltear', 'estrategia'],
  },
  {
    id: 'timbiriche', carpeta: '32-timbiriche', nombre: 'Timbiriche', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Une puntos y cierra cajitas. Cerrar una te da otro turno.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: trazar'], p2: [`${FLECHAS}: mover`, 'M: trazar'] },
    duracion: '5-8 min', render: 'dom', turnos: true, tags: ['cajitas', 'puntos', 'papel'],
  },
  {
    id: 'batalla-naval', carpeta: '33-batalla-naval', nombre: 'Batalla Naval', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Coloca tu flota en secreto (con cortina) y luego a disparar.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: confirmar', 'E: rotar'], p2: [`${FLECHAS}: mover`, 'M: confirmar', 'N: rotar'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Confirmar', glifo: '✓' },
        { a: 'b', etiqueta: 'Rotar barco', glifo: '⟳' },
      ] },
    ] },
    duracion: '6-10 min', render: 'dom', turnos: true, tags: ['flota', 'hundir', 'secreto'],
  },
  {
    id: 'ajedrez', carpeta: '34-ajedrez', nombre: 'Ajedrez', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Reglas completas: enroque, al paso, coronación, jaque mate y ahogado.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: elegir'], p2: [`${FLECHAS}: mover`, 'M: elegir'] },
    duracion: '10-30 min', render: 'dom', turnos: true, tags: ['ajedrez', 'estrategia', 'clásico'],
  },
  {
    id: 'memoria', carpeta: '35-memoria', nombre: 'Memoria', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Encuentra parejas. Si aciertas, repites turno.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: voltear'], p2: [`${FLECHAS}: mover`, 'M: voltear'] },
    duracion: '3-6 min', render: 'dom', turnos: true, tags: ['parejas', 'memoria', 'cartas'],
  },

  /* ═══════════════ COOPERATIVOS (5) ═══════════════ */
  {
    id: 'alunizaje', carpeta: '36-alunizaje', nombre: 'Alunizaje a Dos', categoria: 'coop', estetica: 'suave',
    descripcion: 'Uno rota la nave, el otro da gas. Aterricen suave o no aterrizan.',
    controles: { p1: ['A/D: rotar la nave'], p2: ['↑: propulsor principal', '←/→: laterales'] },
    duracion: '3-6 min', tags: ['lunar lander', 'cooperativo', 'precisión'],
  },
  {
    id: 'cocina-caos', carpeta: '37-cocina-caos', nombre: 'Cocina Caos', categoria: 'coop', estetica: 'suave',
    descripcion: 'Pedidos contrarreloj. Uno corta, otro cocina, los dos sirven.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: agarrar / usar'], p2: [`${FLECHAS}: mover`, 'M: agarrar / usar'] },
    duracion: '4-6 min', tags: ['overcooked', 'cocina', 'cooperativo'],
  },
  {
    id: 'piloto-artillero', carpeta: '38-piloto-artillero', nombre: 'Piloto y Artillero', categoria: 'coop', estetica: 'neon',
    descripcion: 'Una nave, dos manos: uno vuela y el otro apunta la torreta.',
    controles: { p1: ['A/D: rotar', 'W: propulsar'], p2: ['←/→: girar torreta', 'M: disparar'] },
    duracion: '4-7 min', tags: ['asteroides', 'torreta', 'cooperativo'],
  },
  {
    id: 'doble-llave', carpeta: '39-doble-llave', nombre: 'Doble Llave', categoria: 'coop', estetica: 'suave',
    descripcion: 'Palancas cruzadas y puertas que solo abre el otro. Nadie pasa solo.',
    controles: { p1: [`${WASD}: mover`, 'Espacio: usar'], p2: [`${FLECHAS}: mover`, 'M: usar'] },
    duracion: '5-10 min', tags: ['puzle', 'plataformas', 'cooperativo'],
  },
  {
    id: 'torre-dos', carpeta: '40-torre-dos', nombre: 'Torre a Dos', categoria: 'coop', estetica: 'suave',
    descripcion: 'Grúa por turnos. Apilen la torre más alta antes de que se caiga.',
    controles: { p1: ['Espacio: soltar bloque'], p2: ['M: soltar bloque'] },
    duracion: '3-5 min', tags: ['apilar', 'grúa', 'cooperativo'],
  },

  /* ═══════════════ PAREJA (15) ═══════════════ */
  {
    id: 'atados', carpeta: '56-atados', nombre: 'Atados', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Unidos por una cuerda elástica. Recojan corazones sin estrangularse.',
    controles: { p1: ['W A S D: mover'], p2: ['↑ ← ↓ →: mover'] },
    duracion: '3-5 min', tags: ['cooperativo', 'física', 'cuerda'],
  },
  {
    id: 'baile-dos', carpeta: '57-baile-dos', nombre: 'Baile a Dos', categoria: 'pareja', estetica: 'neon',
    descripcion: 'Ritmo cooperativo: el combo solo sube si los dos aciertan a la vez.',
    controles: { p1: ['W A S D: pistas'], p2: ['↑ ← ↓ →: pistas'] },
    duracion: '3-5 min', tags: ['ritmo', 'cooperativo', 'baile'],
  },
  {
    id: 'almohadas', carpeta: '58-almohadas', nombre: 'Guerra de Almohadas', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Sobre la cama, a almohadazos. Gana quien tire al otro… o quien reviente la almohada.',
    controles: { p1: ['A/D: mover · W: saltar · Espacio: golpear'], p2: ['←/→: mover · ↑: saltar · M: golpear'] },
    duracion: '3-5 min', tags: ['pelea', 'bobo', 'físicas'],
  },
  {
    id: 'nudo', carpeta: '62-nudo', nombre: 'El Nudo', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Cada uno mueve su extremo de la cuerda. Desenrédenla entre los dos.',
    controles: { p1: ['W A S D: tu extremo'], p2: ['↑ ← ↓ →: tu extremo'] },
    duracion: '4-8 min', tags: ['puzle', 'cooperativo', 'cuerda'],
  },
  {
    id: 'escapa-juntos', carpeta: '63-escapa-juntos', nombre: 'Escapa Juntos', categoria: 'pareja', estetica: 'papel',
    descripcion: 'Uno ve la bomba, el otro el manual. Solo hablando se salvan. Contrarreloj.',
    controles: { p1: ['W/S: mover · Espacio: cortar'], p2: ['↑/↓: pasar páginas del manual'] },
    duracion: '4-8 min', render: 'dom', tags: ['hablar', 'cooperativo', 'presión'],
  },
  {
    id: 'tres-piernas', carpeta: '66-tres-piernas', nombre: 'Carrera de Tres Piernas', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Cada uno controla una pierna del mismo corredor. Alternen o se caen.',
    controles: { p1: ['Espacio: tu pierna'], p2: ['M: tu pierna'] },
    duracion: '2-4 min', tags: ['cooperativo', 'ritmo', 'ridículo'],
  },
  {
    id: 'globo', carpeta: '67-globo', nombre: 'Globo al Aire', categoria: 'pareja', estetica: 'suave',
    descripcion: 'No dejen que el globo toque el suelo. Parece fácil hasta que hay dos.',
    controles: { p1: ['A/D: mover', 'W: soplar'], p2: ['←/→: mover', '↑: soplar'] },
    duracion: '2-4 min', tags: ['cooperativo', 'globo', 'aguantar'],
  },
  {
    id: 'pulso', carpeta: '71-pulso', nombre: 'Pulso Chino', categoria: 'pareja', estetica: 'pixel',
    descripcion: 'Echen un pulso. La fuerza bruta se acaba: hay que dosificar.',
    controles: { p1: ['Espacio: empujar'], p2: ['M: empujar'] },
    duracion: '2-3 min', tags: ['fuerza', 'aguante', 'duelo'],
  },
  {
    id: 'tarta', carpeta: '74-tarta', nombre: 'Tarta a la Cara', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Tartazos a bocajarro. Tirar, esquivar o cubrirse: solo una es la buena.',
    controles: { p1: ['A: tirar · S: cubrirse · D: esquivar'], p2: ['←: tirar · ↓: cubrirse · →: esquivar'] },
    duracion: '2-4 min', tags: ['piedra papel tijera', 'reflejos', 'bobo'],
  },
  {
    id: 'puente', carpeta: '75-puente', nombre: 'Puente Frágil', categoria: 'pareja', estetica: 'suave',
    descripcion: 'El puente solo aguanta a uno. Crúcenlo por turnos sin que se rompa.',
    controles: { p1: ['A/D: avanzar', 'Espacio: esperar'], p2: ['←/→: avanzar', 'M: esperar'] },
    duracion: '3-6 min', tags: ['cooperativo', 'turnos', 'coordinación'],
  },
  {
    id: 'tb-duelo', carpeta: '41-tb-duelo', nombre: 'Duelo Táctil', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Un botón se enciende en la barra. El primero en tocarlo, gana el punto.',
    controles: { p1: ['Toca la mitad izquierda de la barra'], p2: ['Toca la mitad derecha de la barra'] },
    duracion: '2-3 min', render: 'dom', tags: ['reacción', 'táctil'],
  },
  {
    id: 'tb-cuerda', carpeta: '42-tb-cuerda', nombre: 'Cuerda Táctil', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Tira de la cuerda tocando tu extremo de la barra. La marca se mueve.',
    controles: { p1: ['Toca repetido tu extremo izquierdo'], p2: ['Toca repetido tu extremo derecho'] },
    duracion: '1-2 min', render: 'dom', tags: ['machaque', 'táctil'],
  },
  {
    id: 'tb-caja-fuerte', carpeta: '43-tb-caja-fuerte', nombre: 'Caja Fuerte', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Desliza por la barra buscando el punto exacto. Caliente, frío, clic.',
    controles: { p1: ['Desliza el scrubber en tu turno'], p2: ['Desliza el scrubber en tu turno'] },
    duracion: '3-5 min', render: 'dom', turnos: true, tags: ['precisión', 'táctil', 'turnos'],
  },
  {
    id: 'tb-codigo-color', carpeta: '44-tb-codigo-color', nombre: 'Código Color', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Adivina la combinación de colores del rival con el selector de la barra.',
    controles: { p1: ['Selector de color de la barra'], p2: ['Selector de color de la barra'] },
    duracion: '4-8 min', render: 'dom', turnos: true, tags: ['mastermind', 'colores', 'deducción'],
  },
  {
    id: 'tb-ruleta', carpeta: '45-tb-ruleta', nombre: 'Ruleta de Botones', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Ocho botones, una bomba escondida. Se turnan hasta que alguien la toca.',
    controles: { p1: ['Toca un botón en tu turno'], p2: ['Toca un botón en tu turno'] },
    duracion: '2-4 min', render: 'dom', turnos: true, tags: ['suerte', 'nervio', 'turnos'],
  },
  {
    id: 'tb-simon', carpeta: '46-tb-simon', nombre: 'Simón Táctil', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'La barra enciende una secuencia cada vez más larga. Repítela sin fallar.',
    controles: { p1: ['Repite la secuencia en tu turno'], p2: ['Repite la secuencia en tu turno'] },
    duracion: '3-6 min', render: 'dom', turnos: true, tags: ['memoria', 'secuencia', 'táctil'],
  },
  {
    id: 'tb-precision', carpeta: '47-tb-precision', nombre: 'Precisión', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Un marcador recorre la barra a toda velocidad. Párralo en la zona verde.',
    controles: { p1: ['Toca para parar el marcador'], p2: ['Toca para parar el marcador'] },
    duracion: '2-4 min', render: 'dom', turnos: true, tags: ['timing', 'precisión', 'táctil'],
  },
  {
    id: 'tb-pong', carpeta: '48-tb-pong', nombre: 'Pong Lineal', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Pong en una sola dimensión: la barra entera es el campo de juego.',
    controles: { p1: ['Toca cuando la bola llegue a tu lado'], p2: ['Toca cuando la bola llegue a tu lado'] },
    duracion: '2-4 min', render: 'dom', tags: ['pong', '1D', 'táctil'],
  },
  {
    id: 'tb-subasta', carpeta: '49-tb-subasta', nombre: 'Subasta a Ciegas', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Puja en secreto con el slider (el popover te tapa). Gana el lote quien más pague.',
    controles: { p1: ['Slider dentro del popover'], p2: ['Slider dentro del popover'] },
    duracion: '4-6 min', render: 'dom', turnos: true, tags: ['faroleo', 'apuesta', 'secreto'],
  },
  {
    id: 'tb-escalera', carpeta: '50-tb-escalera', nombre: 'Escalera de Nervios', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Sube escalones para multiplicar puntos. Uno de ellos te lo quita todo.',
    controles: { p1: ['Sube o plántate en tu turno'], p2: ['Sube o plántate en tu turno'] },
    duracion: '3-5 min', render: 'dom', turnos: true, tags: ['push your luck', 'riesgo', 'turnos'],
  },

  /* ═══════════════ JUEGOS NUEVOS ═══════════════ */
  {
    id: 'salto-sincronizado', carpeta: '91-salto-sincronizado', nombre: 'Salto Sincronizado', categoria: 'arcade', estetica: 'neon',
    descripcion: 'La pantalla corre sola: cubo, OVNI, bola y onda. Cada uno su carril, gana quien llegue más lejos.',
    controles: { p1: ['Espacio: toca o mantén según el vehículo'], p2: ['M: toca o mantén según el vehículo'] },
    duracion: '2-4 min', tags: ['autoscroll', 'ritmo', 'reflejos', 'plataformas'],
  },
  {
    id: 'nuestra-mascota', carpeta: '83-nuestra-mascota', nombre: 'Nuestra Mascota', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Una criatura que crían los dos. Sigue viva entre partidas y les extraña si no vuelven.',
    controles: { p1: ['←/→ elegir cuidado', 'Espacio: cuidar · E: mimar'], p2: ['←/→ elegir cuidado', 'M: cuidar · N: mimar'] },
    duracion: '3-8 min', render: 'dom', turnos: true, tags: ['mascota', 'cuidar', 'persistente'],
  },
  {
    id: 'nuestra-casa', carpeta: '82-nuestra-casa', nombre: 'Nuestra Casa', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Construyan y decoren una casa que es de los dos. Lo que pongan hoy sigue ahí mañana.',
    controles: {
      p1: ['W A S D: mover cursor', 'Espacio: poner · E: quitar', 'E+A/D: cambiar mueble · E+W: color'],
      p2: ['↑ ↓ ← →: mover cursor', 'M: poner · N: quitar', 'N+←/→: cambiar mueble · N+↑: color'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Poner', glifo: '+' },
        { a: 'b', etiqueta: 'Quitar', glifo: '−' },
        { a: 'left', etiqueta: 'Mueble ◀' },
        { a: 'right', etiqueta: 'Mueble ▶' },
      ] },
    ] },
    duracion: '5-15 min', tags: ['construir', 'decorar', 'persistente'],
  },
  {
    id: 'llama-y-marea', carpeta: '81-llama-y-marea', nombre: 'Llama y Marea', categoria: 'coop', estetica: 'neon',
    descripcion: 'Fuego y agua en el mismo nivel. Ella cruza lo que a él lo mata. Las puertas piden a los dos.',
    controles: {
      p1: ['A/D: mover', 'Espacio: saltar', 'Eres Llama: muere en el agua'],
      p2: ['←/→: mover', 'M: saltar', 'Eres Marea: mueres en la lava'],
    },
    duracion: '6-12 min', tags: ['puzle', 'plataformas', 'cooperativo'],
  },
  {
    id: 'templo-perdido', carpeta: '84-templo-perdido', nombre: 'Templo Perdido', categoria: 'coop', estetica: 'papel',
    descripcion: 'Cuatro salas de acertijos. Cada uno ve la mitad de la solución: sin hablar no salen.',
    controles: {
      p1: ['Dirección: navegar', 'Espacio: accionar', 'Lee en voz alta lo que solo tú ves'],
      p2: ['Dirección: navegar', 'M: accionar', 'Lee en voz alta lo que solo tú ves'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Accionar', glifo: '⊙' }] },
    ] },
    duracion: '8-15 min', render: 'dom', tags: ['puzle', 'lógica', 'cooperativo'],
  },
  {
    id: 'atlas-contrarreloj', carpeta: '85-atlas-contrarreloj', nombre: 'Atlas a Contrarreloj', categoria: 'reflejos', estetica: 'papel',
    descripcion: 'Geografía a botonazo: el primero que pulsa responde, el otro puede robar por el doble.',
    controles: { p1: ['Espacio: pulsar y confirmar', '←/→: elegir opción'], p2: ['M: pulsar y confirmar', '←/→: elegir opción'] },
    duracion: '4-7 min', render: 'dom', tags: ['geografía', 'buzzer', 'cultura'],
  },
  {
    id: 'creadores-mundos', carpeta: '86-creadores-de-mundos', nombre: 'Creadores de Mundos', categoria: 'coop', estetica: 'pixel',
    descripcion: 'Dos dioses moldean el mismo planeta. Cooperativo o versus, con volcanes y diluvios.',
    controles: {
      p1: ['W A S D: mover', 'Espacio: obrar', 'E+A/D: cambiar acto'],
      p2: ['↑ ↓ ← →: mover', 'M: obrar', 'N+←/→: cambiar acto'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'palanca' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Obrar', glifo: '✷' },
        { a: 'b', etiqueta: 'Cambiar acto', glifo: '⟳' },
      ] },
    ] },
    duracion: '5-9 min', tags: ['worldbox', 'simulación', 'dioses'],
  },
  {
    id: 'brote', carpeta: '87-brote', nombre: 'Brote', categoria: 'versus', estetica: 'oled',
    descripcion: 'Ella diseña el patógeno, él levanta la respuesta tecnológica. En equipo o uno contra otro.',
    controles: {
      p1: ['↑/↓: mejora del patógeno', '←/→: región', 'Espacio: desplegar'],
      p2: ['↑/↓: mejora de respuesta', '←/→: región', 'M: desplegar · N: aislar región'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Desplegar', glifo: '▲' },
        { a: 'b', etiqueta: 'Aislar región', glifo: '⊘' },
      ] },
    ] },
    duracion: '6-11 min', render: 'dom', tags: ['plague inc', 'epidemia', 'asimétrico'],
  },
  {
    id: 'jardin-asedio', carpeta: '88-jardin-asedio', nombre: 'Jardín Bajo Asedio', categoria: 'coop', estetica: 'pixel',
    descripcion: 'Defensa cooperativa con sol compartido. Si uno lo gasta todo, el otro se queda sin defensas.',
    controles: {
      p1: ['W A S D: mover', 'Espacio: plantar / recoger sol', 'E: quitar · E+A/D: cambiar planta'],
      p2: ['↑ ↓ ← →: mover', 'M: plantar / recoger sol', 'N: quitar · N+←/→: cambiar planta'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Plantar / sol', glifo: '☀' },
        { a: 'b', etiqueta: 'Quitar', glifo: '−' },
      ] },
    ] },
    duracion: '7-12 min', tags: ['tower defense', 'oleadas', 'cooperativo'],
  },
  {
    id: 'golpe-final', carpeta: '89-golpe-final', nombre: 'Golpe Final', categoria: 'versus', estetica: 'neon',
    descripcion: 'Pelea 1v1 con bloqueo, barridos y especiales. Al mejor de tres asaltos.',
    controles: {
      p1: ['A/D: mover · W: saltar', 'Espacio: puño · ↓+Espacio: barrido', 'E: bloquear · E+Espacio: especial'],
      p2: ['←/→: mover · ↑: saltar', 'M: puño · ↓+M: barrido', 'N: bloquear · N+M: especial'],
    },
    duracion: '3-6 min', tags: ['pelea', 'combos', 'mortal kombat'],
  },
  {
    id: 'turbo-circuito', carpeta: '90-turbo-circuito', nombre: 'Turbo Circuito', categoria: 'versus', estetica: 'neon',
    descripcion: 'Carreras con derrape que carga turbo, misiles y manchas. Tres vueltas.',
    controles: {
      p1: ['W: acelerar · S: frenar', 'A/D: girar', 'E: derrapar · Espacio: objeto'],
      p2: ['↑: acelerar · ↓: frenar', '←/→: girar', 'N: derrapar · M: objeto'],
    },
    duracion: '4-7 min', tags: ['carreras', 'derrape', 'mario kart'],
  },
  {
    id: 'cartas-de-poder', carpeta: '92-cartas-de-poder', nombre: 'Cartas de Poder', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Duelo de cartas por turnos: criaturas, hechizos y defensoras. Baja la vida del rival a cero.',
    controles: {
      p1: ['←/→: elegir carta', '↑/↓: mano o mesa', 'Espacio: jugar o atacar · E: terminar turno'],
      p2: ['←/→: elegir carta', '↑/↓: mano o mesa', 'M: jugar o atacar · N: terminar turno'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Jugar / atacar', glifo: '⚔' },
        { a: 'b', etiqueta: 'Terminar turno', glifo: '⏭' },
      ] },
    ] },
    duracion: '8-14 min', render: 'dom', turnos: true, tags: ['cartas', 'estrategia', 'turnos'],
  },

  /* ═══════════════ TOUCH BAR NUEVOS ═══════════════ */
  {
    id: 'tb-cinta', carpeta: '93-tb-cinta', nombre: 'Cinta Transportadora', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Cajas cruzando la barra: las rojas son suyas, las azules del otro. Si una se escapa, pierden los dos.',
    controles: { p1: ['Toca las cajas ROJAS en tu mitad'], p2: ['Toca las cajas AZULES en tu mitad'] },
    duracion: '3-5 min', render: 'dom', tags: ['cooperativo', 'reflejos', 'táctil'],
  },
  {
    id: 'tb-relevos', carpeta: '94-tb-relevos', nombre: 'Relevos Táctiles', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Empujen el testigo por la barra. Solo puede tocarlo quien lo lleva: si te adelantas, retrocede.',
    controles: { p1: ['Toca tu mitad cuando lleves el testigo'], p2: ['Toca tu mitad cuando lleves el testigo'] },
    duracion: '2-4 min', render: 'dom', tags: ['cooperativo', 'relevos', 'táctil'],
  },
  {
    id: 'tb-morse', carpeta: '95-tb-morse', nombre: 'Código Táctil', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Uno ve el símbolo y lo transmite en pulsos; el otro solo ve parpadear la barra y lo descifra.',
    controles: { p1: ['Izquierda: punto · Derecha: raya'], p2: ['Izquierda: punto · Derecha: raya'] },
    duracion: '4-7 min', render: 'dom', turnos: true, tags: ['asimétrico', 'código', 'táctil'],
  },
  {
    id: 'tb-cofres', carpeta: '96-tb-cofres', nombre: 'Cofres Gemelos', categoria: 'touchbar', estetica: 'oled', touchbar: true,
    descripcion: 'Memoria repartida: cada uno solo abre cofres de su mitad, así que las parejas cruzadas hay que pedirlas.',
    controles: { p1: ['Abre cofres de tu mitad izquierda'], p2: ['Abre cofres de tu mitad derecha'] },
    duracion: '4-6 min', render: 'dom', turnos: true, tags: ['memoria', 'cooperativo', 'táctil'],
  },

  /* ═══════════════ PLATAFORMAS COOPERATIVAS ═══════════════ */
  {
    id: 'sombra-y-luz', carpeta: '97-sombra-y-luz', nombre: 'Sombra y Luz', categoria: 'coop', estetica: 'neon',
    descripcion: 'Ella muere a oscuras, él muere en la luz. Las placas conmutan todas las lámparas: hay que turnarse.',
    controles: {
      p1: ['A/D: mover', 'Espacio: saltar', 'Eres Luz: mueres a oscuras'],
      p2: ['←/→: mover', 'M: saltar', 'Eres Sombra: mueres en la luz'],
    },
    duracion: '7-13 min', tags: ['puzle', 'plataformas', 'cooperativo'],
  },
  {
    id: 'peso-y-pluma', carpeta: '98-peso-y-pluma', nombre: 'Peso y Pluma', categoria: 'coop', estetica: 'pixel',
    descripcion: 'Uno rompe suelos y hunde placas; la otra planea y vuela con el viento. Cada uno abre paso al otro.',
    controles: {
      p1: ['A/D: mover', 'Espacio: saltar (corto)', 'Rompes suelos frágiles'],
      p2: ['←/→: mover', 'M: saltar alto · mantén M: planear', 'Te ahogas en el agua'],
    },
    duracion: '7-13 min', tags: ['puzle', 'plataformas', 'cooperativo'],
  },

  /* ═══════════════ FÁCILES Y DIRECTOS ═══════════════ */
  {
    id: 'serpiente-doble', carpeta: '99-serpiente-doble', nombre: 'Serpiente Doble', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Dos serpientes, un tablero. Come y crece, pero tu cuerpo también le cierra el paso al otro.',
    controles: { p1: ['W A S D: girar'], p2: ['↑ ↓ ← →: girar'] },
    duracion: '2-4 min', tags: ['snake', 'clásico', 'crecer'],
  },
  {
    id: 'pelea-nieve', carpeta: '100-pelea-nieve', nombre: 'Pelea de Nieve', categoria: 'arcade', estetica: 'suave',
    descripcion: 'Lanza bolas en arco, agáchate para esquivar y recarga a tiempo. Cinco vidas cada uno.',
    controles: {
      p1: ['A/D: moverse · S: agacharse', 'Espacio: lanzar', 'S+E: recargar'],
      p2: ['←/→: moverse · ↓: agacharse', 'M: lanzar', '↓+N: recargar'],
    },
    duracion: '3-5 min', tags: ['puntería', 'esquivar', 'invierno'],
  },
  {
    id: 'torre-bloques', carpeta: '101-torre-bloques', nombre: 'Torre de Bloques', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Suelta el bloque en el momento justo. Lo que sobresale se pierde y la torre se afila.',
    controles: { p1: ['Espacio: soltar en tu turno'], p2: ['M: soltar en tu turno'] },
    duracion: '2-4 min', turnos: true, tags: ['apilar', 'timing', 'turnos'],
  },
  {
    id: 'salta-cuerda', carpeta: '102-salta-cuerda', nombre: 'Salta la Cuerda', categoria: 'coop', estetica: 'suave',
    descripcion: 'La cuerda gira y acelera. Si uno tropieza, pierden los dos: hay que saltar al unísono.',
    controles: { p1: ['Espacio: saltar'], p2: ['M: saltar'] },
    duracion: '2-4 min', tags: ['ritmo', 'cooperativo', 'timing'],
  },
  {
    id: 'atrapa-mosca', carpeta: '103-atrapa-mosca', nombre: 'Atrapa la Mosca', categoria: 'reflejos', estetica: 'pixel',
    descripcion: 'La mosca salta de casilla en casilla. Muévete y golpea: fallar te bloquea medio segundo.',
    controles: { p1: ['W A S D: mover', 'Espacio: golpear'], p2: ['↑ ↓ ← →: mover', 'M: golpear'] },
    duracion: '2-3 min', tags: ['reflejos', 'rejilla', 'rápido'],
  },

  /* ═══════════════ CON MANDO TÁCTIL ═══════════════
     Estos tres no son versiones táctiles de juegos de teclado: son cosas que
     un teclado compartido no puede hacer. Uno necesita dos palancas
     analógicas de verdad, otro que cada jugador dibuje en su propia pantalla,
     y el tercero que cada uno lea información que el otro no ve. */
  {
    id: 'timon-y-canon', carpeta: '104-timon-y-canon', nombre: 'Timón y Cañón', categoria: 'tactil', estetica: 'neon',
    mandoRequerido: true,
    descripcion: 'Una nave, dos palancas: uno la pilota en 360° y el otro barre el cielo con la torreta.',
    controles: {
      p1: ['Palanca: pilotar la nave', 'Botón: impulso'],
      p2: ['Palanca: apuntar la torreta', 'Botón: disparar'],
    },
    duracion: '4-7 min', tags: ['cooperativo', 'palanca', 'naves', 'mando'],
    mando: {
      0: {
        disposicion: 'dual', pie: 'Tú pilotas',
        controles: [{ tipo: 'palanca' }, { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Impulso', glifo: '»' }] }],
      },
      1: {
        disposicion: 'dual', pie: 'Tú disparas',
        controles: [{ tipo: 'palanca' }, { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Fuego', glifo: '◎' }] }],
      },
    },
  },
  {
    id: 'trazos-gemelos', carpeta: '105-trazos-gemelos', nombre: 'Trazos Gemelos', categoria: 'tactil', estetica: 'suave',
    mandoRequerido: true,
    descripcion: 'Cada uno dibuja su mitad de la figura sin ver la del otro. Al soltar el dedo se juntan las dos.',
    controles: {
      p1: ['Dibuja con el dedo la mitad izquierda'],
      p2: ['Dibuja con el dedo la mitad derecha'],
    },
    duracion: '4-6 min', render: 'canvas', tags: ['dibujar', 'cooperativo', 'pareja', 'mando'],
    mando: {
      disposicion: 'solo', pie: 'Dibuja tu mitad y suelta',
      controles: [{ tipo: 'trazo', pista: 'Dibuja aquí tu mitad' }],
    },
  },
  {
    id: 'nuestro-bicho', carpeta: '111-nuestro-bicho', nombre: 'Nuestro Bicho', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Una criatura, cuatro necesidades y dos pares de manos. Repartíos o se os muere: recuerda cuánto lo mimáis.',
    controles: {
      p1: ['W A S D: mover tu mano', 'Espacio: coger y soltar'],
      p2: ['↑ ↓ ← →: mover tu mano', 'M: coger y soltar'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'palanca' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Coger / soltar', glifo: '✋' }] },
    ] },
    duracion: '3-6 min', tags: ['mascota', 'cuidar', 'cooperativo', 'persistente', 'adictivo'],
  },
  {
    id: 'casa-winters', carpeta: '112-casa-winters', nombre: 'La Casa de los Winters', categoria: 'coop', estetica: 'oled',
    descripcion: 'Homenaje a Ethan Winters: casa a oscuras, linterna, tres llaves y algo que patrulla. Si te destroza una mano, solo el otro puede graparla.',
    controles: {
      p1: ['W A S D: moverte', 'Espacio: usar / grapar', 'E: linterna'],
      p2: ['↑ ↓ ← →: moverte', 'M: usar / grapar', 'N: linterna'],
    },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [
        { a: 'a', etiqueta: 'Usar / grapar', glifo: '✚' },
        { a: 'b', etiqueta: 'Linterna', glifo: '🔦' },
      ] },
    ] },
    duracion: '6-10 min', tags: ['terror', 'supervivencia', 'cooperativo', 'linterna', 'resident evil'],
  },
  {
    id: 'torneo-machaque', carpeta: '110-torneo-machaque', nombre: 'Puño de Hierro', categoria: 'coop', estetica: 'neon',
    descripcion: 'Los dos en el mismo equipo: machacad la L por turnos y subid el cuadro del torneo hasta el cinturón de oro.',
    controles: {
      p1: ['L: golpear en tu turno', 'Mantén el ritmo para el combo'],
      p2: ['L: golpear en tu turno', 'Mantén el ritmo para el combo'],
    },
    duracion: '4-6 min', turnos: true, tags: ['machaque', 'torneo', 'cooperativo', 'contra la máquina', 'adictivo'],
  },
  {
    id: 'fusion', carpeta: '109-fusion', nombre: 'Fusión', categoria: 'versus', estetica: 'neon',
    descripcion: 'Junta dos iguales y sube de nivel. Cada nivel alto le tira basura al rival: aguanta más que él.',
    controles: {
      p1: ['A/D: elegir columna', 'Espacio: soltar ya'],
      p2: ['←/→: elegir columna', 'M: soltar ya'],
    },
    duracion: '4-8 min', tags: ['fusionar', 'merge', 'farmear', 'adictivo', 'puzle'],
  },
  {
    id: 'tres-pistas', carpeta: '107-tres-pistas', nombre: 'Adivina en 3 Pistas', categoria: 'reflejos', estetica: 'papel',
    descripcion: 'Marcas, animales, lugares… Tres pistas de más vaga a más obvia: cuanto antes pulses, más vale.',
    controles: {
      p1: ['Espacio: pulsar el buzzer', 'W A S D: elegir opción'],
      p2: ['M: pulsar el buzzer', '↑ ← ↓ →: elegir opción'],
    },
    duracion: '5-8 min', tags: ['adivinar', 'buzzer', 'marcas', 'cultura', 'trivia'],
  },
  {
    id: 'dilo-sin-decirlo', carpeta: '108-dilo-sin-decirlo', nombre: 'Dilo Sin Decirlo', categoria: 'tactil', estetica: 'suave',
    mandoRequerido: true,
    descripcion: 'La palabra sale solo en tu iPad. Descríbela sin nombrarla y que el otro la adivine antes de que caiga el minuto.',
    controles: {
      p1: ['Tu iPad muestra la palabra', 'Acertó / Paso en el mando'],
      p2: ['Adivina en voz alta'],
    },
    duracion: '4-6 min', tags: ['adivinar', 'palabras', 'fiesta', 'guessup', 'mando'],
  },
  {
    id: 'espias', carpeta: '106-espias', nombre: 'Espías', categoria: 'tactil', estetica: 'oled',
    mandoRequerido: true,
    descripcion: 'Cada mando recibe una pista que el otro no puede leer. El primero que señale al topo se lleva el punto.',
    controles: {
      p1: ['Cruceta: mover la mira', 'Botón: acusar'],
      p2: ['Cruceta: mover la mira', 'Botón: acusar'],
    },
    duracion: '4-7 min', tags: ['deducción', 'secreto', 'asimétrico', 'mando'],
  },

  /* ═══════════════ REALISMO — 3D con física (15) ═══════════════
     Todos usan Three.js (vendor/three) sobre core/tres.js y core/fisica3d.js,
     y renderizan con `render: 'dom'`: el shell les da el bucle y ellos montan
     su propio lienzo WebGL dentro del contenedor. */
  {
    id: 'billar', carpeta: '113-billar', nombre: 'Billar', categoria: 'realismo', estetica: 'real',
    descripcion: 'Bola 8 con efecto de verdad: retroceso, corrida y lateral. Dos salas, cinco juegos de bolas.',
    controles: {
      p1: ['A / D: apuntar', 'W / S: ajuste fino', 'E + flechas: efecto', 'Espacio: mantener para la fuerza'],
      p2: ['← / →: apuntar', '↑ / ↓: ajuste fino', 'N + flechas: efecto', 'M: mantener para la fuerza'],
    },
    duracion: '6-12 min', render: 'dom', turnos: true,
    tags: ['billar', 'pool', 'bolas', 'físicas', '3d', 'efecto', 'futurista'],
  },
  {
    id: 'bolos', carpeta: '114-bolos', nombre: 'Bolos', categoria: 'realismo', estetica: 'real',
    descripcion: 'Cinco rondas en la bolera. Los pinos caen unos sobre otros: el pleno se propaga.',
    controles: {
      p1: ['A / D: colocarte y dar efecto', 'Espacio: cargar y lanzar'],
      p2: ['← / →: colocarte y dar efecto', 'M: cargar y lanzar'],
    },
    duracion: '5-9 min', render: 'dom', turnos: true, tags: ['bolos', 'bowling', 'pinos', 'pleno', '3d'],
  },
  {
    id: 'dardos', carpeta: '115-dardos', nombre: 'Dardos', categoria: 'realismo', estetica: 'real',
    descripcion: '501 a la baja con diana reglamentaria. Cuanto más tardas en tirar, más te baila el pulso.',
    controles: {
      p1: ['W A S D: corregir la mira', 'Espacio: tirar'],
      p2: ['↑ ↓ ← →: corregir la mira', 'M: tirar'],
    },
    duracion: '6-10 min', render: 'dom', turnos: true, tags: ['dardos', '501', 'diana', 'puntería', '3d'],
  },
  {
    id: 'minigolf', carpeta: '116-minigolf', nombre: 'Minigolf', categoria: 'realismo', estetica: 'real',
    descripcion: 'Seis hoyos con bandas, rampas y un agua que se traga los tiros valientes.',
    controles: {
      p1: ['A / D: apuntar', 'Espacio: mantener para la fuerza'],
      p2: ['← / →: apuntar', 'M: mantener para la fuerza'],
    },
    duracion: '8-14 min', render: 'dom', turnos: true, tags: ['golf', 'minigolf', 'hoyos', 'precisión', '3d'],
  },
  {
    id: 'baloncesto', carpeta: '117-baloncesto', nombre: 'Baloncesto', categoria: 'realismo', estetica: 'real',
    descripcion: 'Seis tiros cada uno desde donde quieras. Aro de hierro, tablero y triples.',
    controles: {
      p1: ['A / D: moverte por el arco', 'W / S: ángulo', 'E: cambiar distancia', 'Espacio: tirar'],
      p2: ['← / →: moverte por el arco', '↑ / ↓: ángulo', 'N: cambiar distancia', 'M: tirar'],
    },
    duracion: '4-7 min', render: 'dom', turnos: true, tags: ['baloncesto', 'canasta', 'triples', 'tiro', '3d'],
  },
  {
    id: 'tiro-arco', carpeta: '118-tiro-arco', nombre: 'Tiro con Arco', categoria: 'realismo', estetica: 'real',
    descripcion: 'Setenta metros, viento cruzado y una flecha que cae. Seis por cabeza.',
    controles: {
      p1: ['W A S D: apuntar', 'Espacio: mantener para tensar'],
      p2: ['↑ ↓ ← →: apuntar', 'M: mantener para tensar'],
    },
    duracion: '5-8 min', render: 'dom', turnos: true, tags: ['arco', 'flecha', 'viento', 'diana', '3d'],
  },
  {
    id: 'torre-madera', carpeta: '119-torre-madera', nombre: 'Torre de Madera', categoria: 'realismo', estetica: 'real',
    descripcion: 'Saca un bloque y ponlo arriba. El que tira la torre, pierde.',
    controles: {
      p1: ['W A S D: elegir bloque', 'Espacio: mantener para tirar de él'],
      p2: ['↑ ↓ ← →: elegir bloque', 'M: mantener para tirar de él'],
    },
    duracion: '5-10 min', render: 'dom', turnos: true, tags: ['torre de bloques', 'torre', 'equilibrio', 'pulso', '3d'],
  },
  {
    id: 'rally', carpeta: '120-rally', nombre: 'Rally', categoria: 'realismo', estetica: 'real',
    descripcion: 'Tres vueltas a pantalla partida, con derrapes y grava que castiga.',
    controles: {
      p1: ['A / D: girar', 'W / S: acelerar y frenar', 'Espacio: gas', 'E: freno'],
      p2: ['← / →: girar', '↑ / ↓: acelerar y frenar', 'M: gas', 'N: freno'],
    },
    duracion: '4-7 min', render: 'dom', tags: ['coches', 'carrera', 'derrape', 'pantalla partida', '3d'],
  },
  {
    id: 'curling', carpeta: '121-curling', nombre: 'Curling', categoria: 'realismo', estetica: 'real',
    descripcion: 'Cuatro piedras cada uno. Efecto para rodear guardas y barrido para llegar.',
    controles: {
      p1: ['A / D: apuntar', 'W / S: cambiar el efecto', 'Espacio: fuerza y barrido'],
      p2: ['← / →: apuntar', '↑ / ↓: cambiar el efecto', 'M: fuerza y barrido'],
    },
    duracion: '6-10 min', render: 'dom', turnos: true, tags: ['curling', 'hielo', 'piedra', 'barrer', '3d'],
  },
  {
    id: 'vuelo-aros', carpeta: '122-vuelo-aros', nombre: 'Vuelo por Aros', categoria: 'realismo', estetica: 'real',
    descripcion: 'Doce aros en orden, avioneta con inercia y pantalla partida.',
    controles: {
      p1: ['A / D: alabeo', 'W / S: morro', 'Espacio: gas', 'E: frenar'],
      p2: ['← / →: alabeo', '↑ / ↓: morro', 'M: gas', 'N: frenar'],
    },
    duracion: '3-6 min', render: 'dom', tags: ['avión', 'volar', 'aros', 'pantalla partida', '3d'],
  },
  {
    id: 'futbolin', carpeta: '123-futbolin', nombre: 'Futbolín', categoria: 'realismo', estetica: 'real',
    descripcion: 'Dos barras por jugador, a la vez, hasta cinco goles.',
    controles: {
      p1: ['A / D: deslizar la barra', 'Espacio: chutar', 'E: cambiar de barra'],
      p2: ['← / →: deslizar la barra', 'M: chutar', 'N: cambiar de barra'],
    },
    duracion: '4-8 min', render: 'dom', tags: ['futbolín', 'fútbol', 'mesa', 'goles', '3d'],
  },
  {
    id: 'tenis-mesa', carpeta: '124-tenis-mesa', nombre: 'Tenis de Mesa', categoria: 'realismo', estetica: 'real',
    descripcion: 'Bote, red y efecto. Liftada para acelerar, cortada para que flote.',
    controles: {
      p1: ['A / D: mover la pala', 'W / S: liftada o cortada', 'Espacio: golpear'],
      p2: ['← / →: mover la pala', '↑ / ↓: liftada o cortada', 'M: golpear'],
    },
    duracion: '4-8 min', render: 'dom', tags: ['ping pong', 'tenis de mesa', 'efecto', 'rally', '3d'],
  },
  {
    id: 'pesca', carpeta: '125-pesca', nombre: 'Pesca', categoria: 'realismo', estetica: 'real',
    descripcion: 'Noventa segundos en el lago. Recoge sin pasarte o el sedal se rompe.',
    controles: {
      p1: ['Espacio: lanzar, clavar y recoger', 'E: recoger el sedal'],
      p2: ['M: lanzar, clavar y recoger', 'N: recoger el sedal'],
    },
    duracion: '2-3 min', render: 'dom', tags: ['pesca', 'lago', 'tensión', 'peces', '3d'],
  },
  {
    id: 'domino', carpeta: '126-domino', nombre: 'Dominó', categoria: 'realismo', estetica: 'real',
    descripcion: 'Montáis la cadena entre los dos y decidís cuándo empujarla. Si se para, pierde quien empujó.',
    controles: {
      p1: ['A / D: girar la cadena', 'W / S: separación', 'Espacio: colocar', 'E: EMPUJAR'],
      p2: ['← / →: girar la cadena', '↑ / ↓: separación', 'M: colocar', 'N: EMPUJAR'],
    },
    duracion: '4-8 min', render: 'dom', turnos: true, tags: ['dominó', 'cadena', 'faroleo', 'caída', '3d'],
  },
  {
    id: 'grua', carpeta: '127-grua', nombre: 'Grúa', categoria: 'realismo', estetica: 'real',
    descripcion: 'Ocho contenedores colgando de un cable que se balancea. Gana la pila más alta.',
    controles: {
      p1: ['A / D: mover el carro', 'W / S: subir y bajar el cable', 'Espacio: soltar'],
      p2: ['← / →: mover el carro', '↑ / ↓: subir y bajar el cable', 'M: soltar'],
    },
    duracion: '3-6 min', render: 'dom', tags: ['grúa', 'apilar', 'péndulo', 'puerto', '3d'],
  },

  /* ═══════════════ MACHAQUE DE LA L — jitter click (5) ═══════════════
     Todos por turnos y con la MISMA tecla, la L: así los dos machacan con la
     misma mano en la misma posición y el duelo es limpio. La tecla se escucha
     con `input.on('KeyL')`, no como acción mapeada. */
  {
    id: 'cps-duelo', carpeta: '128-cps-duelo', nombre: 'Duelo de CPS', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Diez segundos de L cada uno. Enseña el pico, la media y la curva: casi todos se desfondan al cuarto segundo.',
    controles: { p1: ['L: machacar (por turnos)'], p2: ['L: machacar (por turnos)'] },
    duracion: '1-2 min', turnos: true, tags: ['cps', 'jitter', 'clics', 'machaque', 'velocidad'],
  },
  {
    id: 'aguante', carpeta: '129-aguante', nombre: 'Aguanta', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'El listón de clics por segundo sube solo cada seis segundos. Gana quien tarde más en quedarse atrás.',
    controles: { p1: ['L: machacar (por turnos)'], p2: ['L: machacar (por turnos)'] },
    duracion: '2-4 min', turnos: true, tags: ['cps', 'jitter', 'resistencia', 'machaque', 'aguante'],
  },
  {
    id: 'picar', carpeta: '130-picar', nombre: 'Picapedrero', categoria: 'reflejos', estetica: 'pixel',
    descripcion: 'Treinta segundos rompiendo bloques a golpes. Tierra, piedra, hierro, diamante… cada uno cuesta más.',
    controles: { p1: ['L: machacar (por turnos)'], p2: ['L: machacar (por turnos)'] },
    duracion: '2-3 min', turnos: true, tags: ['picar', 'minar', 'bloques', 'machaque', 'clics'],
  },
  {
    id: 'compas', carpeta: '131-compas', nombre: 'A Compás', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'No es ir rápido: es clavar el ritmo que te piden. Cuatro objetivos, y uno de ellos es lento a propósito.',
    controles: { p1: ['L: machacar (por turnos)'], p2: ['L: machacar (por turnos)'] },
    duracion: '2-3 min', turnos: true, tags: ['ritmo', 'control', 'clics', 'precisión', 'metrónomo'],
  },
  {
    id: 'apuesta', carpeta: '132-apuesta', nombre: 'La Apuesta', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Dices cuántos clics vas a meter en cinco segundos. Si llegas, te los llevas enteros; si te quedas corto, cero.',
    controles: {
      p1: ['R: subir la apuesta', 'L: cerrarla y machacar'],
      p2: ['R: subir la apuesta', 'L: cerrarla y machacar'],
    },
    duracion: '3-5 min', turnos: true, tags: ['apuesta', 'faroleo', 'clics', 'machaque', 'riesgo'],
  },

  /* ═══════════════ AMPLIACIÓN — ARCADE ═══════════════ */
  {
    id: 'encima', carpeta: '133-encima', nombre: 'Encima de Ti', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Dos cuerpos de trapo en una tarima. Pierde quien toque el suelo con la cabeza.',
    controles: { p1: ['A / D: inclinarse', 'Espacio: saltar'], p2: ['← / →: inclinarse', 'M: saltar'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Saltar', glifo: '↥' }] },
    ] },
    duracion: '3-5 min', tags: ['lucha', 'ragdoll', 'equilibrio', 'físicas', 'tarima'],
  },
  {
    id: 'azotea', carpeta: '134-azotea', nombre: 'Azotea', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Dos tejados, un abismo y un arma que empuja más de lo que apunta. El retroceso es el enemigo.',
    controles: { p1: ['A / D: andar', 'W: saltar', 'Espacio: disparar'], p2: ['← / →: andar', '↑: saltar', 'M: disparar'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Disparar', glifo: '◎' }, { a: 'b', etiqueta: 'Saltar', glifo: '↥' }] },
    ] },
    duracion: '3-5 min', tags: ['duelo', 'retroceso', 'tejado', 'físicas', 'empujón'],
  },
  {
    id: 'ganchos', carpeta: '135-ganchos', nombre: 'Ganchos', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Cueva con pinchos y un gancho al techo. Todo está en cuándo sueltas la cuerda.',
    controles: { p1: ['Espacio (mantener): gancho', 'A / D: aire', 'W / S: cuerda'], p2: ['M (mantener): gancho', '← / →: aire', '↑ / ↓: cuerda'] },
    duracion: '3-5 min', tags: ['gancho', 'columpio', 'péndulo', 'pinchos', 'velocidad'],
  },
  {
    id: 'imanes', carpeta: '136-imanes', nombre: 'Imanes', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Los motores no empujan: el imán sí. Atráelo y cambia de polo justo antes del choque.',
    controles: { p1: ['W A S D: motores', 'Espacio: cambiar polo'], p2: ['↑ ↓ ← →: motores', 'M: cambiar polo'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'palanca' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Polo', glifo: '⇄' }] },
    ] },
    duracion: '3-5 min', tags: ['imán', 'polaridad', 'empujón', 'físicas', 'sumo'],
  },
  {
    id: 'chocones', carpeta: '137-chocones', nombre: 'Chocones', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Autos de choque sobre una pista que se va cayendo a trozos. Píllalo de costado.',
    controles: { p1: ['W / Espacio: acelerar', 'S: atrás', 'A / D: girar'], p2: ['↑ / M: acelerar', '↓: atrás', '← / →: girar'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Gas', glifo: '⏵' }] },
    ] },
    duracion: '3-5 min', tags: ['coches', 'choque', 'derribo', 'arena', 'físicas'],
  },
  {
    id: 'jetpack', carpeta: '138-jetpack', nombre: 'Jetpack Sumo', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Volar quema depósito y solo se reposta en el suelo. Embiste al que ya no tenga gas.',
    controles: { p1: ['Espacio / W: propulsar', 'A / D: lateral'], p2: ['M / ↑: propulsar', '← / →: lateral'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'cruz' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Volar', glifo: '▲' }] },
    ] },
    duracion: '3-5 min', tags: ['jetpack', 'lava', 'combustible', 'empujón', 'vuelo'],
  },
  {
    id: 'submarinos', carpeta: '139-submarinos', nombre: 'Submarinos', categoria: 'arcade', estetica: 'oled',
    descripcion: 'No se ve al rival: se ve su eco. Y el sonar que lo revela también te delata a ti.',
    controles: { p1: ['W A S D: navegar', 'Espacio: torpedo', 'E: sonar'], p2: ['↑ ↓ ← →: navegar', 'M: torpedo', 'N: sonar'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'palanca' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Torpedo', glifo: '➤' }, { a: 'b', etiqueta: 'Sonar', glifo: '◉' }] },
    ] },
    duracion: '4-6 min', tags: ['submarino', 'sonar', 'información', 'ocultación', 'torpedos'],
  },
  {
    id: 'espejos', carpeta: '140-espejos', nombre: 'Espejos Láser', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Un rayo que rebota ocho veces y dos espejos que discuten por él. Funde el núcleo rival.',
    controles: { p1: ['A / D: girar espejo', 'W / S: deslizar', 'Espacio: escudo'], p2: ['← / →: girar espejo', '↑ / ↓: deslizar', 'M: escudo'] },
    duracion: '3-5 min', tags: ['láser', 'espejos', 'reflejo', 'geometría', 'puntería'],
  },

  /* ═══════════════ AMPLIACIÓN — VERSUS ═══════════════ */
  {
    id: 'gemas', carpeta: '141-gemas', nombre: 'Gemas Versus', categoria: 'versus', estetica: 'neon',
    descripcion: 'El suelo sube y no para. Encadena roturas para ahogar al rival en basura.',
    controles: { p1: ['W A S D: cursor', 'Espacio: intercambiar', 'E: acelerar suelo'], p2: ['↑ ↓ ← →: cursor', 'M: intercambiar', 'N: acelerar suelo'] },
    duracion: '3-6 min', tags: ['gemas', 'cadenas', 'puzle', 'match', 'basura'],
  },
  {
    id: 'buscaminas', carpeta: '142-buscaminas', nombre: 'Buscaminas Duelo', categoria: 'versus', estetica: 'oled',
    descripcion: 'Un solo campo minado y dos a la vez. Marcar una mina te da puntos… y se la quita de en medio al otro.',
    controles: { p1: ['W A S D: cursor', 'Espacio: destapar', 'E: bandera'], p2: ['↑ ↓ ← →: cursor', 'M: destapar', 'N: bandera'] },
    duracion: '3-5 min', tags: ['buscaminas', 'minas', 'deducción', 'carrera', 'lógica'],
  },
  {
    id: 'sokoban', carpeta: '143-sokoban', nombre: 'Carrera Sokoban', categoria: 'versus', estetica: 'pixel',
    descripcion: 'Un almacén, dos operarios y cajas para todos. Ponerte detrás de una caja también es jugar.',
    controles: { p1: ['W A S D: empujar'], p2: ['↑ ↓ ← →: empujar'] },
    duracion: '4-7 min', turnos: false, tags: ['sokoban', 'cajas', 'almacén', 'puzle', 'estorbar'],
  },
  {
    id: 'duelo-2048', carpeta: '144-2048', nombre: '2048 Duelo', categoria: 'versus', estetica: 'suave',
    descripcion: 'Cada fusión de 64 o más le manda una roca al otro. Las torres grandes arman al enemigo.',
    controles: { p1: ['W A S D: deslizar'], p2: ['↑ ↓ ← →: deslizar'] },
    duracion: '4-7 min', tags: ['2048', 'fusión', 'números', 'puzle', 'sabotaje'],
  },
  {
    id: 'puyo', carpeta: '145-puyo', nombre: 'Puyo Doble', categoria: 'versus', estetica: 'neon',
    descripcion: 'Gotas de cuatro en cuatro. Aguantar la cadena es arriesgado y es justo lo que hace daño.',
    controles: { p1: ['A / D: mover', 'W / Espacio: girar', 'S: bajar'], p2: ['← / →: mover', '↑ / M: girar', '↓: bajar'] },
    duracion: '3-6 min', tags: ['puyo', 'cadenas', 'gotas', 'caída', 'basura'],
  },
  {
    id: 'laberinto', carpeta: '146-laberinto', nombre: 'Laberinto Contrarreloj', categoria: 'versus', estetica: 'oled',
    descripcion: 'El mismo laberinto para los dos, cada uno con su linterna. Sin suerte: solo quien elija mejor.',
    controles: { p1: ['W A S D: moverse'], p2: ['↑ ↓ ← →: moverse'] },
    duracion: '2-4 min', tags: ['laberinto', 'linterna', 'carrera', 'orientación', 'memoria'],
  },
  {
    id: 'guerra-cartas', carpeta: '147-guerra-cartas', nombre: 'Guerra de Cartas', categoria: 'versus', estetica: 'papel',
    descripcion: 'Manos abiertas: los dos veis todo. La carta que gana se quema y la que pierde vuelve a tu mano.',
    controles: { p1: ['A / D: elegir', 'Espacio: confirmar', 'E: rectificar'], p2: ['← / →: elegir', 'M: confirmar', 'N: rectificar'] },
    duracion: '4-6 min', tags: ['cartas', 'bazas', 'faroleo', 'información', 'decisión'],
  },
  {
    id: 'defensa', carpeta: '148-defensa', nombre: 'Defensa Cruzada', categoria: 'versus', estetica: 'pixel',
    descripcion: 'No mandas a nadie: contratas. Corredor, coloso y arquero, y un cuartel que aguanta lo que aguanta.',
    controles: { p1: ['A: corredor', 'W: coloso', 'D: arquero'], p2: ['←: corredor', '↑: coloso', '→: arquero'] },
    mando: { disposicion: 'pila', controles: [
      { tipo: 'acciones', botones: [
        { a: 'left', etiqueta: 'Corredor 14', glifo: '🏃' },
        { a: 'up', etiqueta: 'Coloso 42', glifo: '🛡' },
        { a: 'right', etiqueta: 'Arquero 26', glifo: '🏹' },
      ] },
    ] },
    duracion: '4-7 min', tags: ['defensa', 'oro', 'unidades', 'estrategia', 'cuartel'],
  },

  /* ═══════════════ AMPLIACIÓN — REFLEJOS ═══════════════ */
  {
    id: 'ahorcado', carpeta: '149-ahorcado', nombre: 'Ahorcado a Dos', categoria: 'reflejos', estetica: 'papel',
    descripcion: 'Turnos alternos pidiendo letras de la misma palabra. Si aciertas sigues; si fallas, se la dejas servida.',
    controles: { p1: ['Teclado: pedir letra (por turnos)'], p2: ['Teclado: pedir letra (por turnos)'] },
    duracion: '4-6 min', turnos: true, tags: ['ahorcado', 'palabras', 'letras', 'turnos', 'deducción'],
  },
  {
    id: 'calculo', carpeta: '150-calculo', nombre: 'Cálculo Relámpago', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Una cuenta, cuatro respuestas y los señuelos son justo los errores que se cometen de verdad.',
    controles: { p1: ['W A S D: responder'], p2: ['↑ ↓ ← →: responder'] },
    duracion: '2-4 min', tags: ['cálculo', 'mental', 'rapidez', 'números', 'duelo'],
  },
  {
    id: 'semaforo', carpeta: '151-semaforo', nombre: 'Semáforo', categoria: 'reflejos', estetica: 'pixel',
    descripcion: 'Corre en verde y suéltalo en rojo. El ámbar dura lo que le da la gana.',
    controles: { p1: ['Espacio (mantener): correr'], p2: ['M (mantener): correr'] },
    duracion: '2-3 min', tags: ['semáforo', 'carrera', 'reflejos', 'aguantar', 'luz roja'],
  },
  {
    id: 'bomba-caliente', carpeta: '152-bomba', nombre: 'Bomba Caliente', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Pásala antes de que reviente… o sujétala para frenar la mecha y que le explote a él.',
    controles: { p1: ['Espacio: pasarla', 'E: sujetarla'], p2: ['M: pasarla', 'N: sujetarla'] },
    duracion: '2-4 min', tags: ['bomba', 'mecha', 'nervios', 'pasar', 'riesgo'],
  },
  {
    id: 'ppt', carpeta: '153-ppt', nombre: 'Piedra-Papel-Tijera Turbo', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Rondas de un segundo. La mano con la que ganas se te bloquea la siguiente.',
    controles: { p1: ['A: piedra', 'W: papel', 'D: tijera'], p2: ['←: piedra', '↑: papel', '→: tijera'] },
    duracion: '2-4 min', tags: ['piedra papel tijera', 'patrones', 'rapidez', 'lectura', 'duelo'],
  },
  {
    id: 'stroop', carpeta: '154-stroop', nombre: 'Caza el Color', categoria: 'reflejos', estetica: 'oled',
    descripcion: 'Pulsa solo si la palabra y su tinta coinciden. Leer es automático; mirar, no.',
    controles: { p1: ['Espacio: cazar'], p2: ['M: cazar'] },
    duracion: '2-3 min', tags: ['stroop', 'color', 'atención', 'reflejos', 'engaño'],
  },
  {
    id: 'nunca-dos', carpeta: '155-nunca-dos', nombre: 'Nunca Dos Veces', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Seis teclas, un plazo que se acorta y la prohibición de repetir. La mano va sola a la equivocada.',
    controles: { p1: ['W A S D · Espacio · E: cualquiera sin repetir'], p2: ['↑ ↓ ← → · M · N: cualquiera sin repetir'] },
    duracion: '2-4 min', tags: ['memoria', 'teclas', 'plazo', 'repetir', 'aguante'],
  },
  {
    id: 'cuenta', carpeta: '156-cuenta', nombre: 'Cuenta Rápida', categoria: 'reflejos', estetica: 'oled',
    descripcion: 'Un vistazo de medio segundo al enjambre. Las opciones falsas están pegadas a la buena.',
    controles: { p1: ['W A S D: responder'], p2: ['↑ ↓ ← →: responder'] },
    duracion: '2-3 min', tags: ['contar', 'vistazo', 'estimar', 'números', 'percepción'],
  },
  {
    id: 'anagramas', carpeta: '157-anagramas', nombre: 'Anagramas', categoria: 'reflejos', estetica: 'papel',
    descripcion: 'Las mismas letras, desordenadas del todo. Vale más cuanto antes la saques.',
    controles: { p1: ['Teclado: escribir (por turnos)'], p2: ['Teclado: escribir (por turnos)'] },
    duracion: '4-6 min', turnos: true, tags: ['anagrama', 'palabras', 'escribir', 'turnos', 'ingenio'],
  },
  {
    id: 'halcon', carpeta: '158-halcon', nombre: 'Ojo de Halcón', categoria: 'reflejos', estetica: 'oled',
    descripcion: 'Todo igual menos una cosa. Se responde con la dirección, no con el cursor.',
    controles: { p1: ['W A S D: señalar cuadrante'], p2: ['↑ ↓ ← →: señalar cuadrante'] },
    duracion: '2-3 min', tags: ['vista', 'intruso', 'diferencias', 'percepción', 'rapidez'],
  },
  {
    id: 'globos', carpeta: '159-globos', nombre: 'Ruleta de Globos', categoria: 'reflejos', estetica: 'suave',
    descripcion: 'Infla por turnos y el globo no se vacía. Todo lo que soples se lo dejas más cerca del límite.',
    controles: { p1: ['Espacio: soplar', 'E: pasar turno'], p2: ['M: soplar', 'N: pasar turno'] },
    duracion: '3-5 min', turnos: true, tags: ['globo', 'riesgo', 'faroleo', 'turnos', 'nervios'],
  },
  {
    id: 'prohibidas', carpeta: '160-prohibidas', nombre: 'Teclas Prohibidas', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Obedece la flecha salvo cuando sea la prohibida. Y la prohibida cambia sin parar el ritmo.',
    controles: { p1: ['W A S D: obedecer'], p2: ['↑ ↓ ← →: obedecer'] },
    duracion: '2-4 min', tags: ['inhibición', 'reflejos', 'reglas', 'flechas', 'atención'],
  },

  /* ═══════════════ AMPLIACIÓN — TABLERO ═══════════════ */
  {
    id: 'gomoku', carpeta: '161-gomoku', nombre: 'Gomoku', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Cinco EXACTOS en línea: seis no valen. El tablero marca solo las líneas peligrosas.',
    controles: { p1: ['W A S D: mover', 'Espacio: colocar'], p2: ['↑ ↓ ← →: mover', 'M: colocar'] },
    duracion: '5-10 min', turnos: true, tags: ['gomoku', 'cinco en raya', 'go', 'línea', 'táctica'],
  },
  {
    id: 'mancala', carpeta: '162-mancala', nombre: 'Mancala', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Siembra y cosecha con reglas kalah completas: repites turno y capturas de enfrente.',
    controles: { p1: ['W A S D: mover', 'Espacio: sembrar'], p2: ['↑ ↓ ← →: mover', 'M: sembrar'] },
    duracion: '6-10 min', turnos: true, tags: ['mancala', 'kalah', 'semillas', 'siembra', 'clásico'],
  },
  {
    id: 'quoridor', carpeta: '163-quoridor', nombre: 'Quoridor', categoria: 'tablero', estetica: 'suave',
    descripcion: 'O avanzas tú o le pones un muro. Y ningún muro puede dejar a nadie sin camino.',
    controles: { p1: ['W A S D: mover', 'Espacio: confirmar'], p2: ['↑ ↓ ← →: mover', 'M: confirmar'] },
    duracion: '6-12 min', turnos: true, tags: ['quoridor', 'muros', 'laberinto', 'bloqueo', 'abstracto'],
  },
  {
    id: 'hex', carpeta: '164-hex', nombre: 'Hex', categoria: 'tablero', estetica: 'suave',
    descripcion: 'Une tus dos lados. Sin capturas, sin azar y sin empate posible: está demostrado.',
    controles: { p1: ['W A S D: mover', 'Espacio: colocar'], p2: ['↑ ↓ ← →: mover', 'M: colocar'] },
    duracion: '5-10 min', turnos: true, tags: ['hex', 'conexión', 'abstracto', 'topología', 'clásico'],
  },
  {
    id: 'molino', carpeta: '165-molino', nombre: 'Molino', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Tres en línea y le comes una ficha. Con tres fichas puedes saltar a donde quieras.',
    controles: { p1: ['W A S D: mover', 'Espacio: confirmar'], p2: ['↑ ↓ ← →: mover', 'M: confirmar'] },
    duracion: '6-12 min', turnos: true, tags: ['molino', 'nine mens morris', 'fichas', 'línea', 'clásico'],
  },
  {
    id: 'nim', carpeta: '166-nim', nombre: 'Nim', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Quita las cerillas que quieras de una fila. Versión misère: quien coge la última, pierde.',
    controles: { p1: ['W A S D: mover', 'Espacio: quitar'], p2: ['↑ ↓ ← →: mover', 'M: quitar'] },
    duracion: '2-5 min', turnos: true, tags: ['nim', 'cerillas', 'matemático', 'misère', 'estrategia'],
  },
  {
    id: 'monedas', carpeta: '167-monedas', nombre: 'Fila de Monedas', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Solo se coge de los extremos. Media jugada es mirar qué le dejas al descubierto.',
    controles: { p1: ['A / D: mover', 'Espacio: coger'], p2: ['← / →: mover', 'M: coger'] },
    duracion: '3-6 min', turnos: true, tags: ['monedas', 'extremos', 'cálculo', 'avaricia', 'clásico'],
  },
  {
    id: 'escaleras', carpeta: '168-escaleras', nombre: 'Escaleras y Serpientes', categoria: 'tablero', estetica: 'pixel',
    descripcion: 'Con la decisión que le faltaba: uno o dos dados. Y hay que caer clavado en la 100.',
    controles: { p1: ['Espacio: un dado', 'E: dos dados'], p2: ['M: un dado', 'N: dos dados'] },
    duracion: '4-8 min', turnos: true, tags: ['dados', 'serpientes', 'escaleras', 'azar', 'clásico'],
  },
  {
    id: 'halma', carpeta: '169-halma', nombre: 'Damas Chinas', categoria: 'tablero', estetica: 'suave',
    descripcion: 'Lleva tus diez fichas enfrente saltando por encima de todo. Las suyas también son escalones.',
    controles: { p1: ['W A S D: mover', 'Espacio: elegir y soltar'], p2: ['↑ ↓ ← →: mover', 'M: elegir y soltar'] },
    duracion: '8-15 min', turnos: true, tags: ['halma', 'damas chinas', 'saltos', 'cadena', 'carrera'],
  },
  {
    id: 'hanoi', carpeta: '170-hanoi', nombre: 'Torres de Hanói Duelo', categoria: 'tablero', estetica: 'neon',
    descripcion: 'Los dos sabéis la solución: son 31 movimientos. Pierde quien se equivoque de poste.',
    controles: { p1: ['A / D: poste', 'Espacio: coger y soltar'], p2: ['← / →: poste', 'M: coger y soltar'] },
    duracion: '2-5 min', tags: ['hanói', 'discos', 'puzle', 'carrera', 'ejecución'],
  },
  {
    id: 'backgammon', carpeta: '171-backgammon', nombre: 'Backgammon', categoria: 'tablero', estetica: 'real',
    descripcion: 'Reglas completas: dobles, barra, comer blots y sacar con la regla del dado grande.',
    controles: { p1: ['A / D: punto', 'Espacio: mover', 'E: cambiar dado'], p2: ['← / →: punto', 'M: mover', 'N: cambiar dado'] },
    duracion: '10-20 min', turnos: true, tags: ['backgammon', 'dados', 'fichas', 'clásico', 'carrera'],
  },

  /* ═══════════════ AMPLIACIÓN — COOPERATIVOS ═══════════════ */
  {
    id: 'bomba-manual', carpeta: '172-bomba-manual', nombre: 'Bomba a Cuatro Manos', categoria: 'coop', estetica: 'oled',
    descripcion: 'Uno tiene los cables y el otro el manual de ocho páginas. Todo pasa por la voz.',
    controles: { p1: ['W / S: elegir cable', 'Espacio: cortar'], p2: ['↑ ↓ ← →: pasar páginas', 'M: siguiente'] },
    duracion: '3-6 min', tags: ['bomba', 'manual', 'comunicación', 'cables', 'tensión'],
  },
  {
    id: 'cordada', carpeta: '173-cordada', nombre: 'Cordada', categoria: 'coop', estetica: 'suave',
    descripcion: 'Atados a la misma cuerda: si os soltáis los dos a la vez, caéis los dos.',
    controles: { p1: ['Espacio (mantener): agarrarse', 'W: trepar'], p2: ['M (mantener): agarrarse', '↑: trepar'] },
    duracion: '4-7 min', tags: ['escalada', 'cuerda', 'turnos', 'altura', 'confianza'],
  },
  {
    id: 'balsa', carpeta: '174-balsa', nombre: 'Balsa', categoria: 'coop', estetica: 'pixel',
    descripcion: 'Un remo cada uno. Remar solo gira la balsa: ir recto es remar a la vez.',
    controles: { p1: ['Espacio: remo izquierdo'], p2: ['M: remo derecho'] },
    duracion: '4-6 min', tags: ['río', 'remo', 'ritmo', 'rápidos', 'coordinación'],
  },
  {
    id: 'ambulancia', carpeta: '175-ambulancia', nombre: 'Ambulancia', categoria: 'coop', estetica: 'neon',
    descripcion: 'La velocidad que le viene bien al conductor es la que arruina al sanitario.',
    controles: { p1: ['W A S D: conducir', 'Espacio: acelerar'], p2: ['M: estabilizar en la banda verde'] },
    duracion: '3-5 min', tags: ['ambulancia', 'conducir', 'paciente', 'prisa', 'conflicto'],
  },
  {
    id: 'reactor', carpeta: '176-reactor', nombre: 'Central Nuclear', categoria: 'coop', estetica: 'oled',
    descripcion: 'La alarma sale en tu panel pero se apaga con la palanca del otro. Aguantad el turno.',
    controles: { p1: ['W A S D: palancas'], p2: ['↑ ↓ ← →: palancas'] },
    duracion: '3-4 min', tags: ['reactor', 'alarmas', 'paneles', 'comunicación', 'presión'],
  },
  {
    id: 'bomberos', carpeta: '177-bomberos', nombre: 'Bomberos', categoria: 'coop', estetica: 'pixel',
    descripcion: 'Uno apunta la lanza y el otro da presión. Pasarse revienta la manguera.',
    controles: { p1: ['W / S: apuntar la lanza'], p2: ['M: bombear presión'] },
    duracion: '3-5 min', tags: ['fuego', 'manguera', 'parábola', 'presión', 'rescate'],
  },
  {
    id: 'trapecio', carpeta: '178-trapecio', nombre: 'Trapecio', categoria: 'coop', estetica: 'suave',
    descripcion: 'Uno se suelta y el otro cierra las manos. El acierto no es de ninguno: es del par.',
    controles: { p1: ['Espacio: soltarse', 'S: bombear el columpio'], p2: ['M (mantener): cerrar las manos', '↓: bombear'] },
    duracion: '3-5 min', tags: ['circo', 'trapecio', 'timing', 'péndulo', 'confianza'],
  },
  {
    id: 'rescate', carpeta: '179-rescate', nombre: 'Rescate Submarino', categoria: 'coop', estetica: 'oled',
    descripcion: 'Uno pilota a ciegas, el otro lleva el foco. El oxígeno es de los dos y la prisa lo quema.',
    controles: { p1: ['W A S D: pilotar', 'Espacio: acelerar'], p2: ['← / →: girar el foco', 'M: cerrar el haz'] },
    duracion: '4-7 min', tags: ['submarino', 'oscuridad', 'foco', 'oxígeno', 'cueva'],
  },
  {
    id: 'orquesta', carpeta: '180-orquesta', nombre: 'Orquesta', categoria: 'coop', estetica: 'neon',
    descripcion: 'Dos instrumentos y una pieza. Las notas doradas son acordes: hay que clavarlas a la vez.',
    controles: { p1: ['W A S D: tocar'], p2: ['↑ ↓ ← →: tocar'] },
    duracion: '2-3 min', tags: ['ritmo', 'música', 'acordes', 'sincronía', 'partitura'],
  },
  {
    id: 'invernadero', carpeta: '181-invernadero', nombre: 'Invernadero', categoria: 'coop', estetica: 'suave',
    descripcion: 'Uno siembra y cosecha, el otro riega y espanta plagas. La helada llega para los dos.',
    controles: { p1: ['W A S D: mover', 'Espacio: sembrar y cosechar'], p2: ['↑ ↓ ← →: mover', 'M: regar', 'N: plagas'] },
    duracion: '2-4 min', tags: ['huerto', 'regar', 'cosecha', 'helada', 'reparto'],
  },

  /* ═══════════════ AMPLIACIÓN — PAREJA ═══════════════ */
  {
    id: 'mudanza', carpeta: '182-mudanza', nombre: 'Mudanza', categoria: 'pareja', estetica: 'suave',
    descripcion: 'El sofá es rígido y la escalera estrecha. Si uno tira, el otro va detrás.',
    controles: { p1: ['W A S D: tu extremo'], p2: ['↑ ↓ ← →: tu extremo'] },
    duracion: '4-7 min', tags: ['sofá', 'mudanza', 'coordinación', 'esquinas', 'paciencia'],
  },
  {
    id: 'constelaciones', carpeta: '183-constelaciones', nombre: 'Constelaciones', categoria: 'pareja', estetica: 'oled',
    descripcion: 'Una línea solo se traza si los dos estáis en su estrella y confirmáis a la vez.',
    controles: { p1: ['W A S D: elegir estrella', 'Espacio: listo'], p2: ['↑ ↓ ← →: elegir estrella', 'M: listo'] },
    duracion: '4-6 min', tags: ['estrellas', 'cielo', 'trazar', 'calma', 'sincronía'],
  },
  {
    id: 'karaoke', carpeta: '184-karaoke', nombre: 'Karaoke a Dos', categoria: 'pareja', estetica: 'neon',
    descripcion: 'Frases sostenidas: estrofas repartidas y estribillos que se cantan entre los dos.',
    controles: { p1: ['Espacio (mantener): cantar'], p2: ['M (mantener): cantar'] },
    duracion: '2-3 min', tags: ['karaoke', 'canción', 'sostener', 'dúo', 'ritmo'],
  },
  {
    id: 'cuento', carpeta: '185-cuento', nombre: 'Cuento a Dos', categoria: 'pareja', estetica: 'papel',
    descripcion: 'Ocho capítulos por turnos. No hay respuestas buenas: hay tonos, y el tono se contagia.',
    controles: { p1: ['W / S: elegir', 'Espacio: escribirlo'], p2: ['↑ / ↓: elegir', 'M: escribirlo'] },
    duracion: '4-6 min', turnos: true, tags: ['historia', 'cuento', 'turnos', 'tono', 'complicidad'],
  },
  {
    id: 'fogata', carpeta: '186-fogata', nombre: 'Fogata', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Uno recoge leña y el otro mantiene el fuego. Sin fuego no hay luz para buscar leña.',
    controles: { p1: ['W A S D: andar', 'Espacio: coger y soltar'], p2: ['M: echar leña', 'N: soplar'] },
    duracion: '2-4 min', tags: ['campamento', 'fuego', 'noche', 'leña', 'dependencia'],
  },
  {
    id: 'bonsai', carpeta: '187-bonsai', nombre: 'Bonsái', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Un árbol vuestro que crece solo entre visitas. Aquí solo se poda, y el corte no vuelve.',
    controles: { p1: ['W A S D: elegir rama', 'Espacio: podar'], p2: ['↑ ↓ ← →: elegir rama', 'M: podar'] },
    duracion: '2-4 min', tags: ['bonsái', 'podar', 'persistente', 'calma', 'cuidar'],
  },
  {
    id: 'cometa', carpeta: '188-cometa', nombre: 'Cometa', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Uno corre por la playa y el otro lleva el hilo. El viento va a rachas y avisa con la hierba.',
    controles: { p1: ['A / D: correr'], p2: ['M (mantener): recoger hilo', 'N: soltar hilo'] },
    duracion: '2-4 min', tags: ['cometa', 'viento', 'playa', 'hilo', 'calma'],
  },

  /* ═══════════════ AMPLIACIÓN — CON MANDO ═══════════════ */
  {
    id: 'dibuja', carpeta: '189-dibuja', nombre: 'Dibuja y Adivina', categoria: 'tactil', estetica: 'papel',
    descripcion: 'La palabra sale solo en tu mando y el dedo es el pincel. El otro escribe en la Mac.',
    controles: { p1: ['Mando: dibujar', 'Espacio: pasar palabra'], p2: ['Teclado: escribir'] },
    duracion: '5-8 min', turnos: true, tags: ['dibujar', 'adivinar', 'dibujar y adivinar', 'mando', 'palabras'],
  },
  {
    id: 'tesoro', carpeta: '190-tesoro', nombre: 'Mapa del Tesoro', categoria: 'tactil', estetica: 'pixel',
    descripcion: 'El mapa con trampas y cofre vive en un mando. El otro camina a oscuras y cava.',
    controles: { p1: ['Mando: leer el mapa'], p2: ['↑ ↓ ← →: caminar', 'M: cavar'] },
    duracion: '4-7 min', tags: ['mapa', 'tesoro', 'coordenadas', 'trampas', 'comunicación'],
  },
  {
    id: 'torre-control', carpeta: '191-torre-control', nombre: 'Torre de Control', categoria: 'tactil', estetica: 'oled',
    descripcion: 'El piloto vuela dentro de la nube; el radar está en el otro mando. Se canta por radio.',
    controles: { p1: ['Mando: leer el radar'], p2: ['↑ ↓ ← →: pilotar', 'M: gas'] },
    duracion: '4-6 min', tags: ['avión', 'radar', 'niebla', 'instrucciones', 'aterrizaje'],
  },
  {
    id: 'poker', carpeta: '192-poker', nombre: 'Mano de Póker', categoria: 'tactil', estetica: 'real',
    descripcion: 'Las cartas propias en tu mando y las comunitarias en la mesa. Información oculta de verdad.',
    controles: { p1: ['Espacio: igualar', 'E: subir', 'S: retirarse'], p2: ['M: igualar', 'N: subir', '↓: retirarse'] },
    duracion: '6-12 min', turnos: true, tags: ['póker', 'apuestas', 'faroleo', 'cartas', 'secreto'],
  },

  /* ═══════════════ AMPLIACIÓN — ARCADE (segunda tanda) ═══════════════ */
  {
    id: 'nieve', carpeta: '193-nieve', nombre: 'Bola de Nieve', categoria: 'arcade', estetica: 'suave',
    descripcion: 'Rueda para engordar. El grande aplasta al pequeño… y gira como un camión.',
    controles: { p1: ['W A S D: rodar'], p2: ['↑ ↓ ← →: rodar'] },
    duracion: '3-5 min', tags: ['nieve', 'tamaño', 'aplastar', 'recursos', 'físicas'],
  },
  {
    id: 'colina', carpeta: '194-colina', nombre: 'Rey de la Colina', categoria: 'arcade', estetica: 'neon',
    descripcion: 'El reloj solo corre si estás SOLO arriba. Bajar a pelear es perder tiempo.',
    controles: { p1: ['W A S D: mover', 'Espacio: embestir'], p2: ['↑ ↓ ← →: mover', 'M: embestir'] },
    mando: { disposicion: 'dual', controles: [
      { tipo: 'palanca' },
      { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Embestir', glifo: '⇥' }] },
    ] },
    duracion: '3-5 min', tags: ['colina', 'control', 'zona', 'empujón', 'aguantar'],
  },
  {
    id: 'bandera', carpeta: '195-bandera', nombre: 'Roba la Bandera', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'En tu mitad eres intocable; en la suya te placan. Gana quien sepa esperar.',
    controles: { p1: ['W A S D: correr'], p2: ['↑ ↓ ← →: correr'] },
    duracion: '4-6 min', tags: ['bandera', 'campo', 'placaje', 'robar', 'clásico'],
  },
  {
    id: 'pinball', carpeta: '196-pinball', nombre: 'Pinball Duelo', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Dos mesas espejo y una sola bola: cuando sale por arriba, aparece en la del otro.',
    controles: { p1: ['A / Espacio: paleta izq.', 'D / E: paleta der.'], p2: ['← / M: paleta izq.', '→ / N: paleta der.'] },
    duracion: '3-6 min', tags: ['pinball', 'paletas', 'rebotes', 'bumpers', 'ángulo'],
  },
  {
    id: 'motocross', carpeta: '197-motocross', nombre: 'Motocross', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'El gas levanta el morro y el freno lo hunde. Se pierde por ir rápido donde no toca.',
    controles: { p1: ['Espacio / D: gas', 'S: freno', 'W / A: inclinar'], p2: ['M / →: gas', '↓: freno', '↑ / ←: inclinar'] },
    duracion: '3-5 min', tags: ['moto', 'colinas', 'equilibrio', 'saltos', 'carrera'],
  },
  {
    id: 'paracaidistas', carpeta: '198-paracaidistas', nombre: 'Paracaidistas', categoria: 'arcade', estetica: 'suave',
    descripcion: 'El paracaídas es de un solo uso y la diana se mueve. Llegar rápido no puntúa.',
    controles: { p1: ['A / D: dirigir', 'Espacio: abrir'], p2: ['← / →: dirigir', 'M: abrir'] },
    duracion: '3-5 min', tags: ['paracaídas', 'caída', 'diana', 'viento', 'precisión'],
  },
  {
    id: 'manguera', carpeta: '199-manguera', nombre: 'Manguera', categoria: 'arcade', estetica: 'oled',
    descripcion: 'Nadie toca la pelota: solo el agua. Y el chorro tarda en llegar donde apuntas.',
    controles: { p1: ['W / S: apuntar', 'Espacio: soltar agua'], p2: ['↑ / ↓: apuntar', 'M: soltar agua'] },
    duracion: '3-5 min', tags: ['agua', 'chorro', 'pelota', 'empujar', 'parábola'],
  },
  {
    id: 'trampolin', carpeta: '200-trampolin', nombre: 'Trampolín', categoria: 'arcade', estetica: 'neon',
    descripcion: 'La lona te devuelve lo que le das. Si caéis a la vez, el fuerte le roba el rebote al otro.',
    controles: { p1: ['A / D: mover', 'Espacio (mantener): encoger'], p2: ['← / →: mover', 'M (mantener): encoger'] },
    duracion: '3-5 min', tags: ['trampolín', 'rebote', 'altura', 'pisotón', 'físicas'],
  },

  /* ═══════════════ AMPLIACIÓN — REALISMO ═══════════════ */
  {
    id: 'petanca', carpeta: '201-petanca', nombre: 'Petanca', categoria: 'realismo', estetica: 'real',
    descripcion: 'Tira quien va perdiendo. Y la mejor jugada casi nunca es acercarse: es sacarle la suya.',
    controles: { p1: ['A / D: apuntar', 'W / S: altura', 'Espacio: lanzar'], p2: ['← / →: apuntar', '↑ / ↓: altura', 'M: lanzar'] },
    duracion: '5-9 min', turnos: true, tags: ['petanca', 'bolas', 'puntería', 'físicas', 'jardín'],
  },
  {
    id: 'tenis', carpeta: '202-tenis', nombre: 'Tenis', categoria: 'realismo', estetica: 'real',
    descripcion: 'Bote obligatorio, red que perdona poco y efecto de verdad: liftado cae antes, cortado muere.',
    controles: { p1: ['W A S D: moverse', 'Espacio: liftado', 'E: cortado'], p2: ['↑ ↓ ← →: moverse', 'M: liftado', 'N: cortado'] },
    duracion: '4-8 min', tags: ['tenis', 'raqueta', 'efecto', 'pista', 'rally'],
  },
  {
    id: 'badminton', carpeta: '203-badminton', nombre: 'Bádminton', categoria: 'realismo', estetica: 'real',
    descripcion: 'El volante frena en el aire: no va de potencia, va de profundidad. Y no hay botes.',
    controles: { p1: ['W A S D: moverse', 'Espacio: golpear', 'E: globo'], p2: ['↑ ↓ ← →: moverse', 'M: golpear', 'N: globo'] },
    duracion: '4-7 min', tags: ['bádminton', 'volante', 'remate', 'globo', 'pista'],
  },
  {
    id: 'voley-playa', carpeta: '204-voley-playa', nombre: 'Vóley Playa', categoria: 'realismo', estetica: 'real',
    descripcion: 'Dos toques por lado: el primero levanta y el segundo remata. Y sopla viento.',
    controles: { p1: ['W A S D: moverse', 'Espacio: tocar', 'E: saltar'], p2: ['↑ ↓ ← →: moverse', 'M: tocar', 'N: saltar'] },
    duracion: '4-7 min', tags: ['vóley', 'playa', 'remate', 'arena', 'viento'],
  },
  {
    id: 'penaltis', carpeta: '205-penaltis', nombre: 'Penaltis', categoria: 'realismo', estetica: 'real',
    descripcion: 'El portero elige lado ANTES del disparo. No es reflejos: es leerle la cara al otro.',
    controles: { p1: ['W A S D: lado y altura', 'Espacio: confirmar'], p2: ['↑ ↓ ← →: lado y altura', 'M: confirmar'] },
    duracion: '4-6 min', turnos: true, tags: ['fútbol', 'penaltis', 'portero', 'faroleo', 'tanda'],
  },
  {
    id: 'tiro-plato', carpeta: '206-tiro-plato', nombre: 'Tiro al Plato', categoria: 'realismo', estetica: 'real',
    descripcion: 'La escopeta abre cono: no hay que clavar el punto, hay que llegar a tiempo. Dos cartuchos.',
    controles: { p1: ['W A S D: mira', 'Espacio: disparar'], p2: ['↑ ↓ ← →: mira', 'M: disparar'] },
    duracion: '4-6 min', turnos: true, tags: ['escopeta', 'plato', 'puntería', 'cielo', 'reflejos'],
  },
  {
    id: 'beisbol', carpeta: '207-beisbol', nombre: 'Béisbol', categoria: 'realismo', estetica: 'real',
    descripcion: 'El lanzador elige recta, curva o cambio. El bateador solo ve la bola salir de la mano.',
    controles: { p1: ['A / D: elegir lanzamiento', 'Espacio: lanzar o batear'], p2: ['← / →: elegir lanzamiento', 'M: lanzar o batear'] },
    duracion: '5-9 min', turnos: true, tags: ['béisbol', 'bateo', 'lanzamiento', 'timing', 'engaño'],
  },
  {
    id: 'slalom', carpeta: '208-slalom', nombre: 'Slalom', categoria: 'realismo', estetica: 'real',
    descripcion: 'El canto agarra según lo inclinado que vayas. Saltarse una puerta cuesta dos segundos.',
    controles: { p1: ['A / D: inclinar', 'Espacio: cuña de freno'], p2: ['← / →: inclinar', 'M: cuña de freno'] },
    duracion: '2-4 min', tags: ['esquí', 'slalom', 'nieve', 'trazada', 'cronómetro'],
  },
  {
    id: 'salto-esqui', carpeta: '209-salto-esqui', nombre: 'Salto de Esquí', categoria: 'realismo', estetica: 'real',
    descripcion: 'Impulso, postura y aterrizaje. Cada momento tiene su ventana y ninguna se arregla después.',
    controles: { p1: ['Espacio: impulso', 'W / S: postura'], p2: ['M: impulso', '↑ / ↓: postura'] },
    duracion: '3-6 min', turnos: true, tags: ['esquí', 'salto', 'vuelo', 'postura', 'distancia'],
  },
  {
    id: 'skatepark', carpeta: '210-skatepark', nombre: 'Skatepark', categoria: 'realismo', estetica: 'real',
    descripcion: 'Un minuto de bowl. Repetir el mismo truco vale cada vez menos: hay que variar.',
    controles: { p1: ['A / D: bombear', 'Espacio: saltar y ollie', 'E: kickflip', 'W/S: 360 y grind'], p2: ['← / →: bombear', 'M: saltar y ollie', 'N: kickflip', '↑/↓: 360 y grind'] },
    duracion: '2-3 min', tags: ['skate', 'trucos', 'bowl', 'variedad', 'combo'],
  },
  {
    id: 'shuffleboard', carpeta: '211-shuffleboard', nombre: 'Shuffleboard', categoria: 'realismo', estetica: 'real',
    descripcion: 'Llegar al final sin caerse. Y solo puntúa el bando que tenga el disco más adelantado.',
    controles: { p1: ['A / D: colocar', 'Espacio: soltar'], p2: ['← / →: colocar', 'M: soltar'] },
    duracion: '4-7 min', turnos: true, tags: ['shuffleboard', 'deslizar', 'discos', 'precisión', 'bar'],
  },
  {
    id: 'croquet', carpeta: '212-croquet', nombre: 'Croquet', categoria: 'realismo', estetica: 'real',
    descripcion: 'Pasar aro da turno extra… y tocarle la bola también. El césped tiene caídas.',
    controles: { p1: ['A / D: apuntar', 'Espacio: golpear'], p2: ['← / →: apuntar', 'M: golpear'] },
    duracion: '6-10 min', turnos: true, tags: ['croquet', 'aros', 'maza', 'jardín', 'turno extra'],
  },
  {
    id: 'jabalina', carpeta: '213-jabalina', nombre: 'Jabalina', categoria: 'realismo', estetica: 'real',
    descripcion: 'Carrera alternando teclas, ángulo por debajo de los 45° y un solo instante para soltar.',
    controles: { p1: ['A y D alternando: correr', 'W / S: ángulo', 'Espacio: soltar'], p2: ['← y → alternando: correr', '↑ / ↓: ángulo', 'M: soltar'] },
    duracion: '3-5 min', turnos: true, tags: ['atletismo', 'jabalina', 'lanzamiento', 'ángulo', 'carrera'],
  },
  {
    id: 'cien-metros', carpeta: '214-cien-metros', nombre: 'Cien Metros', categoria: 'realismo', estetica: 'real',
    descripcion: 'Hay una cadencia óptima: machacar más rápido descoordina la zancada y te frena.',
    controles: { p1: ['A y D alternando: correr'], p2: ['← y → alternando: correr'] },
    duracion: '1-2 min', tags: ['atletismo', 'velocidad', 'zancada', 'salida', 'carrera'],
  },

  /* ═══════════════ AMPLIACIÓN — TOUCH BAR ═══════════════ */
  {
    id: 'tb-serpiente', carpeta: '215-tb-serpiente', nombre: 'Serpiente Táctil', categoria: 'touchbar', estetica: 'oled',
    descripcion: 'La serpiente en una sola dimensión: la barra es un anillo y solo puedes darte la vuelta.',
    controles: { p1: ['Touch Bar: girar (por turnos)'], p2: ['Touch Bar: girar (por turnos)'] },
    duracion: '3-5 min', turnos: true, touchbar: true, tags: ['serpiente', 'anillo', 'espacio', 'barra', 'supervivencia'],
  },
  {
    id: 'tb-oido', carpeta: '216-tb-oido', nombre: 'Oído Absoluto', categoria: 'touchbar', estetica: 'oled',
    descripcion: 'Suena una nota y hay que encontrarla en la barra. Las teclas no están marcadas ni suenan.',
    controles: { p1: ['Touch Bar: tocar nota (por turnos)'], p2: ['Touch Bar: tocar nota (por turnos)'] },
    duracion: '3-5 min', turnos: true, touchbar: true, tags: ['oído', 'notas', 'música', 'barra', 'afinación'],
  },
  {
    id: 'tb-pesca', carpeta: '217-tb-pesca', nombre: 'Pesca en la Barra', categoria: 'touchbar', estetica: 'oled',
    descripcion: 'El anzuelo se coloca antes y no se mueve. El pez cambia de idea a media travesía.',
    controles: { p1: ['Touch Bar: colocar y tirar (por turnos)'], p2: ['Touch Bar: colocar y tirar (por turnos)'] },
    duracion: '3-5 min', turnos: true, touchbar: true, tags: ['pesca', 'anzuelo', 'timing', 'barra', 'paciencia'],
  },
  {
    id: 'tb-sable', carpeta: '218-tb-sable', nombre: 'Sable de Luz', categoria: 'touchbar', estetica: 'oled',
    descripcion: 'El golpe se anuncia un instante y hay que pararlo justo donde entra. Con fintas.',
    controles: { p1: ['Touch Bar: parar el golpe (por turnos)'], p2: ['Touch Bar: parar el golpe (por turnos)'] },
    duracion: '3-4 min', turnos: true, touchbar: true, tags: ['sable', 'parada', 'reflejos', 'finta', 'barra'],
  },
  {
    id: 'tb-crono', carpeta: '219-tb-crono', nombre: 'Cronómetro Exacto', categoria: 'touchbar', estetica: 'oled',
    descripcion: 'Para en cinco segundos clavados. Pasado segundo y medio, la barra se apaga del todo.',
    controles: { p1: ['Touch Bar: arrancar y parar (por turnos)'], p2: ['Touch Bar: arrancar y parar (por turnos)'] },
    duracion: '2-4 min', turnos: true, touchbar: true, tags: ['cronómetro', 'tiempo', 'precisión', 'ciego', 'barra'],
  },
  {
    id: 'tb-invasores', carpeta: '220-tb-invasores', nombre: 'Invasores 1D', categoria: 'touchbar', estetica: 'oled',
    descripcion: 'Bajan por los dos extremos hacia tu base. El disparo tarda: hay que adelantar el dedo.',
    controles: { p1: ['Touch Bar: disparar (por turnos)'], p2: ['Touch Bar: disparar (por turnos)'] },
    duracion: '3-5 min', turnos: true, touchbar: true, tags: ['invasores', 'disparar', 'oleadas', 'barra', 'reflejos'],
  },

  /* ═══════════════ PAREJA — los veinte que faltaban del bloque 51-80 (20) ═══════════════
     Completan la numeración reservada a la categoría. Todos de canvas y todos
     con la misma regla: ninguno se puede jugar bien sin mirar lo que hace el
     otro, ni siquiera los que parecen un duelo. */
  {
    id: 'cafe', carpeta: '51-cafe', nombre: 'Café a Dos', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Una bandeja sostenida entre los dos. La inclinación es literalmente el desacuerdo.',
    controles: { p1: ['W / S: subir y bajar tu lado'], p2: ['↑ / ↓: subir y bajar tu lado'] },
    duracion: '2-4 min', tags: ['equilibrio', 'cooperativo', 'bandeja', 'físicas', 'tazas'],
  },
  {
    id: 'columpio', carpeta: '52-columpio', nombre: 'El Columpio', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Cada uno cubre media oscilación. Empujar a contratiempo frena en vez de impulsar.',
    controles: { p1: ['Espacio: empujar cuando venga hacia ti'], p2: ['M: empujar cuando venga hacia ti'] },
    duracion: '2-3 min', tags: ['péndulo', 'ritmo', 'cooperativo', 'parque', 'timing'],
  },
  {
    id: 'manta', carpeta: '53-manta', nombre: 'La Manta', categoria: 'pareja', estetica: 'suave',
    descripcion: 'La manta no da para los dos. Si a uno se le congela el termómetro, pierden ambos.',
    controles: { p1: ['Espacio: tirar de la manta'], p2: ['M: tirar de la manta'] },
    duracion: '2-4 min', tags: ['reparto', 'frío', 'negociación', 'noche', 'tira y afloja'],
  },
  {
    id: 'cita-ciegas', carpeta: '54-cita-ciegas', nombre: 'Cita a Ciegas', categoria: 'pareja', estetica: 'papel',
    descripcion: 'Uno ve el comedor entero y solo puede mandar flechas; el otro camina a ciegas.',
    controles: {
      p1: ['W A S D: mandar flechas', 'Espacio: señal de alto'],
      p2: ['↑ ↓ ← →: caminar a ciegas'],
    },
    duracion: '3-5 min', tags: ['asimétrico', 'guiar', 'a ciegas', 'restaurante', 'cooperativo'],
  },
  {
    id: 'carrito', carpeta: '55-carrito', nombre: 'Carrito del Súper', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Uno empuja y otro dirige. El manillar solo responde con la velocidad que pone el otro.',
    controles: { p1: ['W / S: acelerar y frenar'], p2: ['← / →: dirigir'] },
    duracion: '2-4 min', tags: ['conducir', 'asimétrico', 'compra', 'rueda loca', 'cooperativo'],
  },
  {
    id: 'paraguas', carpeta: '59-paraguas', nombre: 'Un Paraguas para Dos', categoria: 'pareja', estetica: 'suave',
    descripcion: 'El paraguas va en el punto medio de los dos: separarse moja a ambos.',
    controles: { p1: ['A / D: moverte'], p2: ['← / →: moverte'] },
    duracion: '2-4 min', tags: ['lluvia', 'juntos', 'cooperativo', 'esquivar', 'charcos'],
  },
  {
    id: 'tandem', carpeta: '60-tandem', nombre: 'Tándem', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Uno pedalea y otro lleva el manillar. Por debajo de cierta velocidad, al suelo.',
    controles: { p1: ['A y D alternando: pedalear'], p2: ['← / →: manillar'] },
    duracion: '3-5 min', tags: ['bicicleta', 'asimétrico', 'equilibrio', 'ruta', 'cuestas'],
  },
  {
    id: 'mando-tele', carpeta: '61-mando-tele', nombre: 'La Guerra del Mando', categoria: 'pareja', estetica: 'pixel',
    descripcion: 'Gana quien mejor descansa: el brazo se cansa y en los anuncios no puntúa nadie.',
    controles: { p1: ['Espacio: tirar del mando'], p2: ['M: tirar del mando'] },
    duracion: '3-5 min', tags: ['machaque', 'sofá', 'estrategia', 'anuncios', 'duelo'],
  },
  {
    id: 'pared', carpeta: '64-pared', nombre: 'Pintar la Pared', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Pintar encima de lo del otro hace mancha. Hay que repartirse la pared, no correr.',
    controles: { p1: ['W A S D: mover la brocha'], p2: ['↑ ↓ ← →: mover la brocha'] },
    duracion: '2-4 min', tags: ['territorio', 'pintar', 'reparto', 'cooperativo', 'cuadrícula'],
  },
  {
    id: 'sombras', carpeta: '65-sombras', nombre: 'Sombras Chinescas', categoria: 'pareja', estetica: 'papel',
    descripcion: 'Cuatro articulaciones repartidas entre dos personas y una figura que igualar.',
    controles: {
      p1: ['W / S: hombro', 'A / D: codo', 'Espacio: fijar'],
      p2: ['↑ / ↓: hombro', '← / →: codo', 'M: fijar'],
    },
    duracion: '3-5 min', tags: ['siluetas', 'coordinación', 'figuras', 'vela', 'cooperativo'],
  },
  {
    id: 'hamaca', carpeta: '68-hamaca', nombre: 'Hamaca', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Los cocos que atrapas pesan. Cada carrera tuya desequilibra al otro.',
    controles: {
      p1: ['A / D: moverte por la hamaca', 'E: tirar un coco'],
      p2: ['← / →: moverte por la hamaca', 'N: tirar un coco'],
    },
    duracion: '2-4 min', tags: ['equilibrio', 'playa', 'cocos', 'peso', 'cooperativo'],
  },
  {
    id: 'mueble', carpeta: '69-mueble', nombre: 'Montar el Mueble', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Uno sujeta la pieza en la marca y otro atornilla. Los papeles se cambian a mitad.',
    controles: {
      p1: ['Espacio: sujetar o atornillar', 'W A S D: corregir la pieza'],
      p2: ['M: sujetar o atornillar', '↑ ↓ ← →: corregir la pieza'],
    },
    duracion: '3-5 min', tags: ['asimétrico', 'montar', 'roles', 'contrarreloj', 'cooperativo'],
  },
  {
    id: 'espagueti', carpeta: '70-espagueti', nombre: 'Un Espagueti, Dos Bocas', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Sorber los dos a la vez rompe la pasta. Hay que turnarse hasta el beso.',
    controles: { p1: ['Espacio: sorber'], p2: ['M: sorber'] },
    duracion: '2-3 min', tags: ['turnarse', 'tensión', 'romántico', 'cena', 'bobo'],
  },
  {
    id: 'foto', carpeta: '72-foto', nombre: 'Foto de Pareja', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Llegar a la marca no basta: el último segundo mide si te mueves.',
    controles: { p1: ['W A S D: correr a tu marca'], p2: ['↑ ↓ ← →: correr a tu marca'] },
    duracion: '2-4 min', tags: ['temporizador', 'quietos', 'playa', 'carrera', 'cooperativo'],
  },
  {
    id: 'cosquillas', carpeta: '73-cosquillas', nombre: 'Cosquillas', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Dos rondas con los papeles cambiados: gana quien rompa antes al otro.',
    controles: {
      p1: ['A / D: elegir zona', 'Espacio: cosquillas o aguantar'],
      p2: ['← / →: elegir zona', 'M: cosquillas o aguantar'],
    },
    duracion: '2-4 min', tags: ['asimétrico', 'roles', 'aguante', 'risa', 'duelo'],
  },
  {
    id: 'remos', carpeta: '76-remos', nombre: 'Barca a Dos Remos', categoria: 'pareja', estetica: 'suave',
    descripcion: 'Cada palada gira la barca hacia el lado contrario. La línea recta es alternar.',
    controles: { p1: ['Espacio: palada del remo izquierdo'], p2: ['M: palada del remo derecho'] },
    duracion: '3-5 min', tags: ['remar', 'río', 'sincronía', 'cooperativo', 'rocas'],
  },
  {
    id: 'huevo', carpeta: '77-huevo', nombre: 'El Huevo en la Cuchara', categoria: 'pareja', estetica: 'suave',
    descripcion: 'El huevo es un péndulo: acelerar y frenar lo balancean. El relevo se pulsa a la vez.',
    controles: {
      p1: ['A / D: frenar y acelerar', 'Espacio: relevo'],
      p2: ['← / →: frenar y acelerar', 'M: relevo'],
    },
    duracion: '3-5 min', tags: ['relevos', 'péndulo', 'precisión', 'carrera', 'cooperativo'],
  },
  {
    id: 'discusion', carpeta: '78-discusion', nombre: 'La Discusión', categoria: 'pareja', estetica: 'papel',
    descripcion: 'Se gana razón hablando, pero si hablan los dos sube la tensión y estalla la bronca.',
    controles: { p1: ['Espacio: hablar (mantener)'], p2: ['M: hablar (mantener)'] },
    duracion: '3-5 min', tags: ['turnarse', 'tensión', 'silencios', 'duelo', 'conversación'],
  },
  {
    id: 'uvas', carpeta: '79-uvas', nombre: 'Doce Uvas', categoria: 'pareja', estetica: 'pixel',
    descripcion: 'Doce campanadas que aceleran. La uva solo cuenta doble si la comen los dos.',
    controles: { p1: ['Espacio: comer uva'], p2: ['M: comer uva'] },
    duracion: '1-2 min', tags: ['ritmo', 'nochevieja', 'campanadas', 'cooperativo', 'timing'],
  },
  {
    id: 'pegados', carpeta: '80-pegados', nombre: 'Bailar Pegados', categoria: 'pareja', estetica: 'neon',
    descripcion: 'Baldosas que se apagan y un abrazo con distancia máxima. El sitio bueno nunca es el mismo.',
    controles: { p1: ['W A S D: bailar'], p2: ['↑ ↓ ← →: bailar'] },
    duracion: '2-4 min', tags: ['baile', 'juntos', 'baldosas', 'cooperativo', 'pista'],
  },

  /* ═══════════════ AMPLIACIÓN — REALISMO (10) ═══════════════
     Misma receta que el resto de la categoría: Three.js sobre core/tres.js,
     física de core/fisica3d.js y `render: 'dom'`. */
  {
    id: 'fronton', carpeta: '221-fronton', nombre: 'Frontón', categoria: 'realismo', estetica: 'real',
    descripcion: 'Se golpea por turnos contra la pared. Un golpe corto que no llega al frontis es punto en contra.',
    controles: {
      p1: ['A / D: moverte', 'Espacio: golpear'],
      p2: ['← / →: moverte', 'M: golpear'],
    },
    duracion: '4-7 min', render: 'dom', tags: ['frontón', 'pelota', 'pared', 'turnos', '3d'],
  },
  {
    id: 'golf', carpeta: '222-golf', nombre: 'Golf', categoria: 'realismo', estetica: 'real',
    descripcion: 'Dos hoyos largos con viento, búnker y lago. Tira siempre el que está más lejos.',
    controles: {
      p1: ['A / D: apuntar', 'W / S: cambiar de palo', 'Espacio: mantener para cargar'],
      p2: ['← / →: apuntar', '↑ / ↓: cambiar de palo', 'M: mantener para cargar'],
    },
    duracion: '8-14 min', render: 'dom', turnos: true, tags: ['golf', 'viento', 'búnker', 'palos', '3d'],
  },
  {
    id: 'halterofilia', carpeta: '223-halterofilia', nombre: 'Halterofilia', categoria: 'realismo', estetica: 'real',
    descripcion: 'Tú eliges los kilos. Más peso puntúa más, pero el tirón pide ritmo y la barra se te va.',
    controles: {
      p1: ['W / S: elegir peso', 'A y D alternando: tirón', 'Espacio: empezar'],
      p2: ['↑ / ↓: elegir peso', '← y → alternando: tirón', 'M: empezar'],
    },
    duracion: '4-7 min', render: 'dom', turnos: true, tags: ['pesas', 'apuesta', 'equilibrio', 'ritmo', '3d'],
  },
  {
    id: 'salto-longitud', carpeta: '224-salto-longitud', nombre: 'Salto de Longitud', categoria: 'realismo', estetica: 'real',
    descripcion: 'Correr más alarga el salto y hace más fácil pasarse de tabla. Tres intentos.',
    controles: {
      p1: ['A y D alternando: correr', 'W / S: ángulo', 'Espacio: batir'],
      p2: ['← y → alternando: correr', '↑ / ↓: ángulo', 'M: batir'],
    },
    duracion: '3-6 min', render: 'dom', turnos: true, tags: ['atletismo', 'salto', 'batida', 'nulo', '3d'],
  },
  {
    id: 'martillo', carpeta: '225-martillo', nombre: 'Lanzamiento de Martillo', categoria: 'realismo', estetica: 'real',
    descripcion: 'Solo acelera si empujas al pasar por la zona. Y el martillo sale por la tangente.',
    controles: {
      p1: ['Espacio: empujar en la zona', 'E: soltar'],
      p2: ['M: empujar en la zona', 'N: soltar'],
    },
    duracion: '3-6 min', render: 'dom', turnos: true, tags: ['atletismo', 'giros', 'sector', 'tangente', '3d'],
  },
  {
    id: 'piraguismo', carpeta: '226-piraguismo', nombre: 'Piragüismo Eslalon', categoria: 'realismo', estetica: 'real',
    descripcion: 'Pantalla partida por el río. Tocar palo son dos segundos; saltarse una puerta, cincuenta.',
    controles: {
      p1: ['A y D alternando: remar'],
      p2: ['← y → alternando: remar'],
    },
    duracion: '4-7 min', render: 'dom', tags: ['piragua', 'río', 'puertas', 'pantalla partida', '3d'],
  },
  {
    id: 'velodromo', carpeta: '227-velodromo', nombre: 'Velódromo', categoria: 'realismo', estetica: 'real',
    descripcion: 'El rebufo ahorra un tercio del esfuerzo y por la cuerda se corren menos metros. Elige.',
    controles: {
      p1: ['A y D alternando: pedalear', 'W / S: carril', 'Espacio: esprintar'],
      p2: ['← y → alternando: pedalear', '↑ / ↓: carril', 'M: esprintar'],
    },
    duracion: '3-5 min', render: 'dom', tags: ['ciclismo', 'rebufo', 'sprint', 'pantalla partida', '3d'],
  },
  {
    id: 'hockey-penaltis', carpeta: '228-hockey-penaltis', nombre: 'Penaltis de Hockey', categoria: 'realismo', estetica: 'real',
    descripcion: 'Cinco tiros cada uno y un portero de carne y hueso al otro lado del disco.',
    controles: {
      p1: ['A / D: apuntar o mover el guante', 'W / S: altura', 'Espacio: acelerar o estirarse', 'E: disparar'],
      p2: ['← / →: apuntar o mover el guante', '↑ / ↓: altura', 'M: acelerar o estirarse', 'N: disparar'],
    },
    duracion: '4-7 min', render: 'dom', turnos: true, tags: ['hockey', 'penaltis', 'portero', 'hielo', '3d'],
  },
  {
    id: 'demolicion', carpeta: '229-demolicion', nombre: 'Demolición', categoria: 'realismo', estetica: 'real',
    descripcion: 'Tres bolas contra tu propia torre. Puntúan las cajas tumbadas, no las movidas.',
    controles: {
      p1: ['A / D: apuntar', 'W / S: elevación', 'Espacio: mantener para cargar'],
      p2: ['← / →: apuntar', '↑ / ↓: elevación', 'M: mantener para cargar'],
    },
    duracion: '4-6 min', render: 'dom', turnos: true, tags: ['derribo', 'cajas', 'torre', 'físicas', '3d'],
  },
  {
    id: 'disc-golf', carpeta: '230-disc-golf', nombre: 'Disc Golf', categoria: 'realismo', estetica: 'real',
    descripcion: 'El disco se curva cuando pierde velocidad. Apuntar a la cesta es el error de novato.',
    controles: {
      p1: ['A / D: apuntar', 'W / S: inclinar el disco', 'Espacio: mantener para cargar'],
      p2: ['← / →: apuntar', '↑ / ↓: inclinar el disco', 'M: mantener para cargar'],
    },
    duracion: '6-10 min', render: 'dom', turnos: true, tags: ['frisbee', 'cesta', 'curva', 'viento', '3d'],
  },

  /* ═══════════════ MESA GRANDE — hasta cuatro personas (2) ═══════════════
     Los dos únicos juegos del catálogo que se salen de los dos jugadores:
     usan core/mesa.js para repartir cuatro puestos (teclas propias para el 3
     y el 4), formar equipos y rellenar lo que sobre con bots. */
  {
    id: 'subastas', carpeta: '231-subastas', nombre: 'Subastas de Trasteros', categoria: 'realismo', estetica: 'real',
    descripcion: 'Sube la persiana, mira desde el umbral y puja. Lo que se ve desde fuera nunca es lo que vale.',
    controles: {
      p1: ['Espacio: pujar', 'E: gastar linterna', 'Puesto 3: F y G', 'Puesto 4: J y K'],
      p2: ['M: pujar', 'N: gastar linterna', 'Hasta 4 personas reales', 'Los puestos libres los llevan bots'],
    },
    duracion: '8-12 min', render: 'dom', turnos: true,
    tags: ['subasta', 'pujar', 'trasteros', 'cuatro jugadores', 'bots', 'dinero', 'faroleo', '3d'],
  },
  {
    id: 'propiedades', carpeta: '232-propiedades', nombre: 'Barrio en Venta', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Calles, alquileres y casas. Si no compras la casilla donde caes, sale a subasta para todos.',
    controles: {
      p1: ['Espacio: tirar, comprar o pujar', 'E: construir o pasar', 'Puesto 3: F y G', 'Puesto 4: J y K'],
      p2: ['M: tirar, comprar o pujar', 'N: construir o pasar', 'De 2 a 4 propietarios', 'Los puestos libres los llevan bots'],
    },
    duracion: '15-25 min', render: 'dom', turnos: true,
    tags: ['propiedades', 'propiedades', 'alquiler', 'dados', 'cuatro jugadores', 'bots', 'subasta'],
  },

  /* ═══════════════ UN JUGADOR · CONTRA LA MÁQUINA (6) ═══════════════
     Todos comparten core/bot.js: un rival con tiempo de reacción, error que
     persiste, despistes y el MISMO tope de velocidad que el humano. La
     dificultad cambia esos cuatro números y nada más, así que ganarle en
     «duro» es ganarle al mismo juego, no a otro. */
  {
    id: 'tenis-solo', carpeta: '233-tenis-solo', nombre: 'Saque y Resto', categoria: 'solo', estetica: 'suave',
    descripcion: 'Un set contra la máquina. Golpea con la punta para abrir la bola.',
    controles: {
      p1: ['← / →: mover la raqueta', 'Espacio: golpear'],
      p2: ['—: lo lleva la máquina'],
    },
    duracion: '4-7 min', tags: ['tenis', 'deporte', 'bot', 'un jugador'],
  },
  {
    id: 'boxeo-solo', carpeta: '234-boxeo-solo', nombre: 'Boxeo', categoria: 'solo', estetica: 'suave',
    descripcion: 'Tres asaltos. El cruzado pega el doble y te deja el doble de vendido.',
    controles: {
      p1: ['↑ esquivar · ↓ cubrirse', 'Espacio: jab · E: cruzado'],
      p2: ['—: lo lleva la máquina'],
    },
    duracion: '3-5 min', tags: ['boxeo', 'lucha', 'bot', 'un jugador'],
  },
  {
    id: 'esgrima-solo', carpeta: '235-esgrima-solo', nombre: 'A Cinco Tocados', categoria: 'solo', estetica: 'oled',
    descripcion: 'A cinco tocados. Quien para, contraataca gratis.',
    controles: {
      p1: ['← / →: distancia', 'Espacio: estocada · E: parada'],
      p2: ['—: lo lleva la máquina'],
    },
    duracion: '3-5 min', tags: ['esgrima', 'florete', 'bot', 'un jugador'],
  },
  {
    id: 'sumo-3d', carpeta: '236-sumo-3d', nombre: 'Sumo 3D', categoria: 'solo', estetica: 'real',
    descripcion: 'Tirarlo del disco antes de que te tire. Y el disco encoge.',
    controles: {
      p1: ['W A S D: empujar'],
      p2: ['—: lo lleva la máquina'],
    },
    duracion: '3-6 min', render: 'dom', tags: ['sumo', 'físicas', '3d', 'bot', 'un jugador'],
  },
  {
    id: 'carrera-3d', carpeta: '237-carrera-3d', nombre: 'Carrera de Obstáculos', categoria: 'solo', estetica: 'real',
    descripcion: 'Mismo trazado para los dos. Chocar no elimina: frena.',
    controles: {
      p1: ['← / →: esquivar'],
      p2: ['—: lo lleva la máquina'],
    },
    duracion: '2-4 min', render: 'dom', tags: ['carrera', 'obstáculos', '3d', 'bot', 'un jugador'],
  },
  {
    id: 'diana-3d', carpeta: '238-diana-3d', nombre: 'Plato al Vuelo', categoria: 'solo', estetica: 'real',
    descripcion: 'Un minuto de platos. La mira tiene inercia: no se teletransporta.',
    controles: {
      p1: ['Flechas: mover la mira', 'Espacio: disparar'],
      p2: ['—: lo lleva la máquina'],
    },
    duracion: '2 min', render: 'dom', tags: ['tiro', 'puntería', '3d', 'bot', 'un jugador'],
  },

  {
    id: 'artilleria-solo', carpeta: '239-artilleria-solo', nombre: 'Duelo de Cañones', categoria: 'solo', estetica: 'real',
    descripcion: 'Duelo de cañones con viento. El bot resuelve la parábola de verdad y falla a propósito.',
    controles: { p1: ['↑ / ↓: ángulo', 'Espacio: mantener para la fuerza'], p2: ['—: lo lleva la máquina'] },
    duracion: '3-6 min', render: 'dom', turnos: true, tags: ['artillería', 'parábola', '3d', 'bot', 'un jugador'],
  },
  {
    id: 'penaltis-solo', carpeta: '240-penaltis-solo', nombre: 'Desde el Punto', categoria: 'solo', estetica: 'suave',
    descripcion: 'Cinco tiros y cinco paradas. Tirar y parar usan la misma mecánica.',
    controles: { p1: ['Espacio: fijar la mira'], p2: ['—: lo lleva la máquina'] },
    duracion: '3-4 min', turnos: true, tags: ['fútbol', 'penaltis', 'bot', 'un jugador'],
  },
  {
    id: 'pingpong-3d', carpeta: '241-pingpong-3d', nombre: 'Ping Pong', categoria: 'solo', estetica: 'real',
    descripcion: 'A once. Dos botes en tu campo y el punto es del otro.',
    controles: { p1: ['← / →: mover la pala', 'Espacio: golpear'], p2: ['—: lo lleva la máquina'] },
    duracion: '4-6 min', render: 'dom', tags: ['ping pong', 'deporte', '3d', 'bot', 'un jugador'],
  },
  {
    id: 'bolos-solo', carpeta: '242-bolos-solo', nombre: 'Bolera', categoria: 'solo', estetica: 'real',
    descripcion: 'Cinco rondas. Los pinos se empujan entre sí: el pleno se propaga.',
    controles: { p1: ['Espacio: mantener para la fuerza'], p2: ['—: lo lleva la máquina'] },
    duracion: '4-6 min', render: 'dom', turnos: true, tags: ['bolos', 'bolera', '3d', 'bot', 'un jugador'],
  },
  {
    id: 'slalom-3d', carpeta: '243-slalom-3d', nombre: 'Slalom Gigante', categoria: 'solo', estetica: 'real',
    descripcion: 'Pasar por las puertas, no esquivarlas. Saltarse una son dos segundos.',
    controles: { p1: ['← / →: trazar la curva'], p2: ['—: lo lleva la máquina'] },
    duracion: '2-4 min', render: 'dom', tags: ['esquí', 'slalom', '3d', 'bot', 'un jugador'],
  },
  {
    id: 'triples-solo', carpeta: '244-triples-solo', nombre: 'Triples', categoria: 'solo', estetica: 'suave',
    descripcion: 'Un minuto de tiro. Suelta la barra en verde y entra siempre.',
    controles: { p1: ['Espacio: soltar en la ventana verde'], p2: ['—: lo lleva la máquina'] },
    duracion: '2 min', tags: ['baloncesto', 'triples', 'ritmo', 'bot', 'un jugador'],
  },

  /* ═══════════════ HECHOS CON EL CREADOR (3) ═══════════════
     No son módulos con lógica: son RECETAS —listas de piezas y de reglas—
     que interpreta core/creador/runtime.js. Están aquí como prueba de que el
     formato aguanta juegos distintos entre sí, y como ejemplo de partida para
     el editor. Su `game.js` son cuatro líneas. */
  {
    id: 'receta-monedas', carpeta: '245-receta-monedas', nombre: 'Fiebre del Oro', categoria: 'creados', estetica: 'neon',
    descripcion: 'Más monedas que la máquina en 45 segundos. Hecho con el creador.',
    controles: { p1: ['W A S D: moverte'], p2: ['—: lo lleva la máquina'] },
    duracion: '1 min', tags: ['creador', 'receta', 'monedas', 'bot'],
  },
  {
    id: 'receta-arena', carpeta: '246-receta-arena', nombre: 'Arena de Bombas', categoria: 'creados', estetica: 'neon',
    descripcion: 'Bombas que ruedan y cintas que arrastran. Tres vidas. Hecho con el creador.',
    controles: { p1: ['W A S D: moverte'], p2: ['↑ ↓ ← →: moverte'] },
    duracion: '2-4 min', tags: ['creador', 'receta', 'bombas', 'duelo'],
  },
  {
    id: 'receta-fuga', carpeta: '247-receta-fuga', nombre: 'La Fuga', categoria: 'creados', estetica: 'neon',
    descripcion: 'Llega a la meta con un perseguidor detrás. Hecho con el creador.',
    controles: { p1: ['W A S D: moverte'], p2: ['—: lo lleva la máquina'] },
    duracion: '1-3 min', tags: ['creador', 'receta', 'huida', 'bot'],
  },

  /* ═══════════════ MECÁNICAS RARAS (6) ═══════════════
     Seis ideas que no tienen equivalente en el resto del catálogo. El hilo
     común: los CONTROLES dejan de ser una constante y pasan a ser parte del
     juego —se roban, llegan tarde, se suman, se comparten, se heredan o se
     escriben por adelantado—. Es terreno que solo se puede pisar con dos
     personas en el mismo teclado. */
  {
    id: 'teclas-robadas', carpeta: '248-teclas-robadas', nombre: 'Teclas Robadas', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Cada golpe le quita una dirección al rival durante ocho segundos. Y a ti te la regala.',
    controles: { p1: ['W A S D: moverte', 'Embiste al rival'], p2: ['↑ ↓ ← →: moverte', 'Embiste al rival'] },
    duracion: '3-5 min', tags: ['controles', 'robar', 'duelo', 'raro'],
  },
  {
    id: 'retardo', carpeta: '249-retardo', nombre: 'Retardo', categoria: 'reflejos', estetica: 'oled',
    descripcion: 'Lo que pulsas ocurre 0,8 s después. Hay que jugar por delante de uno mismo.',
    controles: { p1: ['W A S D: moverte (con retraso)'], p2: ['↑ ↓ ← →: moverte (con retraso)'] },
    duracion: '2 min', tags: ['retardo', 'anticipación', 'monedas', 'raro'],
  },
  {
    id: 'un-solo-cuerpo', carpeta: '250-un-solo-cuerpo', nombre: 'Un Solo Cuerpo', categoria: 'coop', estetica: 'suave',
    descripcion: 'Los dos movéis al mismo muñeco: su dirección es la suma. Si no os ponéis de acuerdo, no se mueve.',
    controles: { p1: ['W A S D: tirar del muñeco'], p2: ['↑ ↓ ← →: tirar del muñeco'] },
    duracion: '3-6 min', tags: ['cooperativo', 'coordinación', 'raro'],
  },
  {
    id: 'una-sola-tecla', carpeta: '251-una-sola-tecla', nombre: 'Una Sola Tecla', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Hay una tecla, la L, y es de quien la coja. Al pulsarla se bloquea segundo y medio para el otro.',
    controles: { p1: ['L: cogerla (por turnos)'], p2: ['L: cogerla (por turnos)'] },
    duracion: '1-2 min', tags: ['una tecla', 'ritmo', 'precisión', 'raro'],
  },
  {
    id: 'planes', carpeta: '252-planes', nombre: 'Planes', categoria: 'tablero', estetica: 'papel',
    descripcion: 'Escribís cuatro movimientos en secreto y se ejecutan a la vez. Chocar os frena a los dos.',
    controles: { p1: ['W A S D: escribir el plan', 'E: borrar el último'], p2: ['↑ ↓ ← →: escribir el plan', 'N: borrar el último'] },
    duracion: '4-6 min', turnos: true, tags: ['simultáneo', 'farol', 'plan', 'raro'],
  },
  {
    id: 'herencia', carpeta: '253-herencia', nombre: 'Herencia', categoria: 'versus', estetica: 'neon',
    descripcion: 'Quien pierde la ronda regala su poder al otro y estrena uno nuevo. La ventaja se paga con el cuerpo.',
    controles: { p1: ['W A S D: moverte', 'Espacio / E: según tus poderes'], p2: ['↑ ↓ ← →: moverte', 'M / N: según tus poderes'] },
    duracion: '4-7 min', tags: ['poderes', 'equilibrio', 'pelota', 'raro'],
  },

  /* ═══════════════ MECÁNICAS RARAS · SEGUNDA TANDA (6) ═══════════════ */
  {
    id: 'ecos', carpeta: '254-ecos', nombre: 'Ecos', categoria: 'arcade', estetica: 'oled',
    descripcion: 'Cada ronda vuelven grabadas tus rondas anteriores, y son sólidas. El rival acabas siendo tú.',
    controles: { p1: ['W A S D: moverte'], p2: ['↑ ↓ ← →: moverte'] },
    duracion: '2-3 min', tags: ['ecos', 'fantasmas', 'monedas', 'raro'],
  },
  {
    id: 'contagio', carpeta: '255-contagio', nombre: 'Contagio', categoria: 'arcade', estetica: 'neon',
    descripcion: 'Puntúas mientras NO lo tengas. Y el infectado corre más, así que perder te da con qué remontar.',
    controles: { p1: ['W A S D: moverte'], p2: ['↑ ↓ ← →: moverte'] },
    duracion: '1-2 min', tags: ['pillar', 'contagio', 'persecución', 'raro'],
  },
  {
    id: 'cuerda', carpeta: '256-cuerda', nombre: 'Cuerda', categoria: 'coop', estetica: 'suave',
    descripcion: 'Vais atados. Cada uno tiene sus monedas en lados opuestos: tirar del otro es la mecánica.',
    controles: { p1: ['W A S D: moverte'], p2: ['↑ ↓ ← →: moverte'] },
    duracion: '1-2 min', tags: ['cuerda', 'tensión', 'coordinación', 'raro'],
  },
  {
    id: 'suelo-fragil', carpeta: '257-suelo-fragil', nombre: 'Suelo Frágil', categoria: 'arcade', estetica: 'pixel',
    descripcion: 'Cada baldosa aguanta tres pisadas. El enemigo es el mapa, y se gasta debajo de los dos.',
    controles: { p1: ['W A S D: moverte'], p2: ['↑ ↓ ← →: moverte'] },
    duracion: '3-5 min', tags: ['suelo', 'supervivencia', 'empujar', 'raro'],
  },
  {
    id: 'rebote', carpeta: '258-rebote', nombre: 'Rebote', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'No puedes parar: las flechas giran, no mueven. Una carambola bien calculada vale más que el volante.',
    controles: { p1: ['A / D: girar'], p2: ['← / →: girar'] },
    duracion: '1-2 min', tags: ['inercia', 'rebote', 'trayectoria', 'raro'],
  },
  {
    id: 'interruptor', carpeta: '259-interruptor', nombre: 'Interruptor', categoria: 'reflejos', estetica: 'neon',
    descripcion: 'Las reglas cambian cada diez segundos y avisan dos antes. Lo que se mide es desaprender rápido.',
    controles: { p1: ['W A S D: moverte'], p2: ['↑ ↓ ← →: moverte'] },
    duracion: '1-2 min', tags: ['reglas', 'adaptación', 'caos', 'raro'],
  },
];

/* ---------------- Consultas ---------------- */

/* Los desafíos generados se añaden al final del catálogo, no se escriben aquí
   uno a uno: son 267 y sus PARÁMETROS son la entrada, no una lista literal.
   Ver games/generados/lista.js. */
GAMES.push(...GENERADOS);

export function byId(id) { return GAMES.find((g) => g.id === id) || null; }

export function byCategoria(cat) {
  return cat === 'todos' ? GAMES : GAMES.filter((g) => g.categoria === cat);
}

/** Catálogo visible: oculta los de Touch Bar si no hay barra detectada. */
export function visibleGames(hasTouchBar) {
  return hasTouchBar ? GAMES : GAMES.filter((g) => !g.touchbar);
}

/**
 * Normaliza para buscar: sin acentos y en minúsculas.
 * Con 500 juegos importa de verdad — «artilleria» tiene que encontrar
 * «Artillería», y nadie escribe los acentos en un buscador.
 */
const plano = (t) => String(t).toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Busca por nombre, descripción y etiquetas.
 *
 * Los resultados van ORDENADOS por lo bien que encajan: primero los que
 * empiezan por lo que escribiste, luego los que lo contienen en el nombre y al
 * final los que solo lo tienen en la descripción. Con un catálogo pequeño daba
 * igual el orden; con quinientos, una lista sin ordenar es una lista inútil.
 */
export function search(query, hasTouchBar = false) {
  const q = plano(query.trim());
  const list = visibleGames(hasTouchBar);
  if (!q) return list;

  const puntuados = [];
  for (const g of list) {
    const nombre = plano(g.nombre);
    const desc = plano(g.descripcion);
    const tags = (g.tags || []).map(plano);
    let p = 0;
    if (nombre === q) p = 100;
    else if (nombre.startsWith(q)) p = 80;
    else if (nombre.includes(q)) p = 60;
    else if (tags.some((t) => t === q)) p = 50;
    else if (tags.some((t) => t.includes(q))) p = 35;
    else if (desc.includes(q)) p = 20;
    if (p) puntuados.push([p, g]);
  }
  return puntuados.sort((a, b) => b[0] - a[0]).map(([, g]) => g);
}

export const TOTAL = GAMES.length;
export const TOTAL_TECLADO = GAMES.filter((g) => !g.touchbar).length;
export const TOTAL_TOUCHBAR = GAMES.filter((g) => g.touchbar).length;
