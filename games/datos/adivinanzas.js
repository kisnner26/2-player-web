/**
 * adivinanzas.js — banco compartido para los juegos de adivinar.
 *
 * Lo usan «Adivina en 3 Pistas» (las pistas salen en pantalla) y «Dilo Sin
 * Decirlo» (la palabra sale solo en el mando del que describe). Al estar
 * aquí, añadir una entrada la mete en los dos juegos a la vez.
 *
 * Regla al escribir entradas: la respuesta tiene que ser algo que cualquiera
 * reconozca al instante. Si hay que pensarlo, no vale — la gracia de este
 * tipo de juego es la carcajada de «¡cómo no lo he dicho!», no la erudición.
 *
 * Las tres pistas van de más vaga a más obvia:
 *   1. sitúa la categoría sin acercarse
 *   2. acota de verdad
 *   3. la dice casi con todas las letras
 *
 * Las marcas se citan por su nombre, como en cualquier juego de preguntas;
 * no se reproducen logos ni imágenes de marca.
 */

export const CATEGORIAS_ADIVINA = {
  animal: { nombre: 'Animal', color: '#a8ff3e', icon: 'paw' },
  marca: { nombre: 'Marca', color: '#00e5ff', icon: 'star' },
  lugar: { nombre: 'Lugar', color: '#ffd166', icon: 'globe' },
  comida: { nombre: 'Comida', color: '#ff7847', icon: 'pizza' },
  objeto: { nombre: 'Objeto', color: '#b04cff', icon: 'cpu' },
  personaje: { nombre: 'Personaje', color: '#ff6ec7', icon: 'crown' },
};

/** @type {{r: string, c: keyof CATEGORIAS_ADIVINA, p: [string, string, string]}[]} */
export const ADIVINANZAS = [
  /* ---------------- Animales ---------------- */
  { r: 'Jirafa', c: 'animal', p: ['Es un animal grande', 'Vive en la sabana africana', 'Tiene el cuello larguísimo y manchas'] },
  { r: 'Elefante', c: 'animal', p: ['Es enorme y gris', 'Tiene orejas gigantes', 'Su nariz es una trompa'] },
  { r: 'Pingüino', c: 'animal', p: ['Es un ave que no vuela', 'Vive donde hace muchísimo frío', 'Parece que lleva esmoquin y camina torpe'] },
  { r: 'Canguro', c: 'animal', p: ['Vive en Australia', 'Se desplaza a saltos', 'Lleva a su cría en una bolsa'] },
  { r: 'Pulpo', c: 'animal', p: ['Vive en el mar', 'No tiene huesos y suelta tinta', 'Tiene ocho tentáculos con ventosas'] },
  { r: 'Murciélago', c: 'animal', p: ['Es el único mamífero que vuela', 'Duerme boca abajo', 'Sale de noche y se guía por el eco'] },
  { r: 'Tiburón', c: 'animal', p: ['Vive en el mar y da miedo', 'Tiene muchísimos dientes', 'Su aleta asoma sobre el agua'] },
  { r: 'Camaleón', c: 'animal', p: ['Es un reptil pequeño', 'Sus ojos se mueven por separado', 'Cambia de color para camuflarse'] },
  { r: 'Perezoso', c: 'animal', p: ['Vive colgado de los árboles', 'Se mueve lentísimo', 'Su nombre es sinónimo de vago'] },
  { r: 'Abeja', c: 'animal', p: ['Es un insecto que vuela', 'Vive en colmenas y pica', 'Hace miel'] },
  { r: 'Cebra', c: 'animal', p: ['Parece un caballo', 'Vive en África', 'Es blanca con rayas negras'] },
  { r: 'Delfín', c: 'animal', p: ['Vive en el mar pero respira aire', 'Es famoso por ser listísimo', 'Salta fuera del agua y hace ruiditos'] },
  { r: 'Búho', c: 'animal', p: ['Es un ave nocturna', 'Gira mucho la cabeza', 'Sus ojos son enormes y hace uh-uh'] },
  { r: 'Cocodrilo', c: 'animal', p: ['Es un reptil de río', 'Sus mandíbulas cierran con muchísima fuerza', 'Parece un tronco flotando hasta que se mueve'] },
  { r: 'Erizo', c: 'animal', p: ['Es pequeño y sale de noche', 'Se hace una bola cuando se asusta', 'Está cubierto de púas'] },
  { r: 'Koala', c: 'animal', p: ['Vive en Australia', 'Duerme casi todo el día', 'Se pasa la vida abrazado a un eucalipto'] },

  /* ---------------- Marcas ---------------- */
  { r: 'Coca-Cola', c: 'marca', p: ['Es una bebida', 'Su lata es roja', 'Es el refresco de cola más famoso del mundo'] },
  { r: 'Nike', c: 'marca', p: ['Es de ropa y calzado deportivo', 'Su logo es una especie de coma', 'Su lema es «Just Do It»'] },
  { r: 'Apple', c: 'marca', p: ['Hace aparatos electrónicos', 'Su logo es una fruta mordida', 'Fabrica el iPhone'] },
  { r: 'McDonald’s', c: 'marca', p: ['Es comida rápida', 'Su símbolo son dos arcos amarillos', 'Vende el Big Mac'] },
  { r: 'Netflix', c: 'marca', p: ['Se ve en la tele', 'Su logo es rojo sobre negro', 'Hace ese «tudum» al empezar'] },
  { r: 'Google', c: 'marca', p: ['Está en internet', 'Su nombre se usa como verbo', 'Es el buscador más usado'] },
  { r: 'Adidas', c: 'marca', p: ['Es ropa deportiva', 'Su símbolo tiene tres rayas', 'Es la eterna rival de Nike'] },
  { r: 'Lego', c: 'marca', p: ['Es un juguete', 'Es danesa', 'Son bloques de plástico que se encajan'] },
  { r: 'Ferrari', c: 'marca', p: ['Hace coches', 'Es italiana y muy cara', 'Su color es el rojo y su símbolo un caballo'] },
  { r: 'Spotify', c: 'marca', p: ['Se usa con auriculares', 'Su color es el verde', 'Sirve para escuchar música'] },
  { r: 'YouTube', c: 'marca', p: ['Está en internet', 'Su logo es rojo con un triángulo', 'Ahí se suben vídeos'] },
  { r: 'Nintendo', c: 'marca', p: ['Hace videojuegos', 'Es japonesa', 'Inventó a Mario y la Switch'] },
  { r: 'Nutella', c: 'marca', p: ['Se come', 'Viene en un bote de cristal', 'Es crema de cacao y avellanas'] },
  { r: 'Amazon', c: 'marca', p: ['Se usa para comprar', 'Su flecha va de la A a la Z', 'Te lo deja en la puerta de casa'] },
  { r: 'WhatsApp', c: 'marca', p: ['Está en el móvil', 'Su icono es verde', 'Sirve para mandar mensajes'] },
  { r: 'Pepsi', c: 'marca', p: ['Es una bebida', 'Su lata es azul', 'Es la eterna segunda frente a Coca-Cola'] },

  /* ---------------- Lugares ---------------- */
  { r: 'París', c: 'lugar', p: ['Es una ciudad europea', 'La llaman la ciudad del amor', 'Ahí está la Torre Eiffel'] },
  { r: 'Egipto', c: 'lugar', p: ['Es un país con mucho desierto', 'Lo cruza el río Nilo', 'Ahí están las pirámides y la Esfinge'] },
  { r: 'Japón', c: 'lugar', p: ['Es un país de Asia', 'Es un archipiélago', 'Ahí están el sushi, el monte Fuji y el anime'] },
  { r: 'Amazonas', c: 'lugar', p: ['Está en Sudamérica', 'Es verde y llueve muchísimo', 'Es la selva más grande del mundo'] },
  { r: 'Nueva York', c: 'lugar', p: ['Es una ciudad de Estados Unidos', 'La llaman la Gran Manzana', 'Ahí está la Estatua de la Libertad'] },
  { r: 'Everest', c: 'lugar', p: ['Está en Asia', 'Hay que escalarlo con oxígeno', 'Es la montaña más alta del mundo'] },
  { r: 'Venecia', c: 'lugar', p: ['Es una ciudad italiana', 'Se está hundiendo poco a poco', 'Sus calles son canales y se va en góndola'] },
  { r: 'Sahara', c: 'lugar', p: ['Está en África', 'Hace un calor insoportable', 'Es el desierto de arena más grande'] },
  { r: 'Roma', c: 'lugar', p: ['Es una ciudad europea', 'Dentro tiene otro país diminuto', 'Ahí está el Coliseo'] },
  { r: 'Hawái', c: 'lugar', p: ['Son islas', 'Tienen volcanes y se hace surf', 'Ahí se ponen collares de flores al llegar'] },
  { r: 'China', c: 'lugar', p: ['Es un país enorme de Asia', 'Es el que más gente tiene', 'Tiene una muralla larguísima'] },
  { r: 'Australia', c: 'lugar', p: ['Es un país y un continente a la vez', 'Está en el hemisferio sur', 'Ahí viven los canguros y los koalas'] },

  /* ---------------- Comida ---------------- */
  { r: 'Pizza', c: 'comida', p: ['Se come caliente', 'Es italiana y redonda', 'Lleva queso encima y se corta en triángulos'] },
  { r: 'Sushi', c: 'comida', p: ['Es japonés', 'Se come con palillos', 'Lleva arroz y pescado crudo'] },
  { r: 'Hamburguesa', c: 'comida', p: ['Se come con las manos', 'Va entre dos panes', 'Lleva carne, queso y a veces pepinillos'] },
  { r: 'Chocolate', c: 'comida', p: ['Es dulce', 'Se derrite en la mano', 'Se hace con cacao'] },
  { r: 'Paella', c: 'comida', p: ['Es española', 'Se hace en una sartén enorme y plana', 'Lleva arroz amarillo y marisco'] },
  { r: 'Helado', c: 'comida', p: ['Está frío', 'Se toma en verano', 'Va en cucurucho y se derrite'] },
  { r: 'Tacos', c: 'comida', p: ['Son mexicanos', 'Se comen con la mano y llevan limón', 'Van en tortilla de maíz doblada'] },
  { r: 'Palomitas', c: 'comida', p: ['Se comen en el cine', 'Empiezan siendo granos duros', 'Explotan con el calor'] },
  { r: 'Aguacate', c: 'comida', p: ['Es verde por dentro', 'Tiene un hueso enorme', 'Con él se hace el guacamole'] },
  { r: 'Espaguetis', c: 'comida', p: ['Es pasta italiana', 'Se enrolla en el tenedor', 'Son largos y finos, con tomate'] },

  /* ---------------- Objetos ---------------- */
  { r: 'Paraguas', c: 'objeto', p: ['Se usa fuera de casa', 'Solo cuando hace mal tiempo', 'Se abre cuando llueve'] },
  { r: 'Semáforo', c: 'objeto', p: ['Está en la calle', 'Tiene tres luces', 'Dice cuándo se puede cruzar'] },
  { r: 'Guitarra', c: 'objeto', p: ['Es un instrumento', 'Se toca con los dedos', 'Tiene seis cuerdas y caja de madera'] },
  { r: 'Microondas', c: 'objeto', p: ['Está en la cocina', 'Hace pi-pi-pi al terminar', 'Calienta la comida en un minuto'] },
  { r: 'Ascensor', c: 'objeto', p: ['Está en los edificios', 'Tiene botones con números', 'Te sube sin usar las escaleras'] },
  { r: 'Brújula', c: 'objeto', p: ['Cabe en la mano', 'Se usa cuando te pierdes', 'Su aguja siempre apunta al norte'] },
  { r: 'Almohada', c: 'objeto', p: ['Está en el dormitorio', 'Es blanda', 'Se pone bajo la cabeza para dormir'] },
  { r: 'Cepillo de dientes', c: 'objeto', p: ['Está en el baño', 'Se usa dos veces al día', 'Va con pasta y cerdas'] },
  { r: 'Paracaídas', c: 'objeto', p: ['Se usa muy alto', 'Se abre tirando de una cuerda', 'Evita que te estrelles al saltar de un avión'] },
  { r: 'Piano', c: 'objeto', p: ['Es un instrumento grande', 'Se toca sentado', 'Tiene teclas blancas y negras'] },

  /* ---------------- Personajes ---------------- */
  { r: 'Papá Noel', c: 'personaje', p: ['Solo aparece una vez al año', 'Va vestido de rojo', 'Deja regalos y baja por la chimenea'] },
  { r: 'Batman', c: 'personaje', p: ['Es un superhéroe', 'No tiene superpoderes, solo dinero', 'Se viste de murciélago y vive en Gotham'] },
  { r: 'Mario', c: 'personaje', p: ['Es de videojuegos', 'Es fontanero e italiano', 'Lleva gorra roja y bigote, y salta sobre tortugas'] },
  { r: 'Drácula', c: 'personaje', p: ['Sale de noche', 'Le temen al ajo por su culpa', 'Es un vampiro con colmillos y capa'] },
  { r: 'Pikachu', c: 'personaje', p: ['Es de dibujos japoneses', 'Es amarillo con la cola en forma de rayo', 'Es el Pokémon más famoso y lanza electricidad'] },
  { r: 'Sherlock Holmes', c: 'personaje', p: ['Es de novelas inglesas', 'Usa lupa y fuma en pipa', 'Es el detective más famoso, y su amigo es Watson'] },
  { r: 'Sirena', c: 'personaje', p: ['Vive en el mar', 'Aparece en muchos cuentos', 'Es mujer por arriba y pez por abajo'] },
  { r: 'Cleopatra', c: 'personaje', p: ['Fue una reina de verdad', 'Vivió en Egipto', 'Se la relaciona con áspides y con Julio César'] },
  { r: 'Momia', c: 'personaje', p: ['Sale en pelis de miedo', 'Viene de Egipto', 'Va envuelta en vendas y anda muy despacio'] },
  { r: 'Robot', c: 'personaje', p: ['No está vivo', 'Habla con voz metálica', 'Es una máquina con forma de persona'] },
];

/** Todas las respuestas en minúscula y sin tildes, para comparar. */
export function normalizarRespuesta(texto) {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ ]/g, '')
    .trim();
}

/** Baraja una copia del banco, opcionalmente filtrando por categorías. */
export function barajar(rng = Math.random, categorias = null) {
  const base = categorias?.length
    ? ADIVINANZAS.filter((a) => categorias.includes(a.c))
    : [...ADIVINANZAS];
  const out = [...base];
  // Fisher-Yates: un sort() con comparador aleatorio no reparte igual de bien.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const TOTAL_ADIVINANZAS = ADIVINANZAS.length;
