/**
 * Subastas de Trasteros — la nave, al atardecer, con las puertas cerradas.
 *
 * El formato de la tele: se levanta la persiana de un trastero, se mira desde
 * fuera sin pisar dentro, y se puja. Luego se abre del todo y se cuenta si el
 * que ganó hizo el negocio de su vida o compró la basura de otro.
 *
 * Toda la tensión sale de una idea: LO QUE SE VE NO ES LO QUE VALE. Los bultos
 * grandes —un sofá, un armario— están delante, se ven desde la puerta y no
 * valen nada; lo que vale está al fondo, tapado con una lona, donde no llega la
 * luz. Por eso las linternas (dos por equipo en toda la partida) son la
 * decisión del juego: gastar una enciende un foco de verdad sobre un bulto del
 * fondo, pero lo ve todo el mundo y todos pujan sabiendo lo mismo.
 *
 * Por qué es 3D y no un panel: la distancia importa. Desde el umbral se ve la
 * primera fila nítida y el fondo en penumbra, y esa penumbra ES la mecánica.
 * Un listado plano de iconos regala la información que el juego quiere negar.
 *
 * Se juega con hasta cuatro personas de verdad: los puestos 3 y 4 usan teclas
 * propias (ver core/mesa.js) y lo que sobra lo llevan bots con carácter.
 */

import {
  crearMundo, crearPanel, mat, caja, cilindro, suelo, texturaGrano, cartel,
  sombraContacto, THREE,
} from '../../core/tres.js';
import { MODELOS, materiales } from './objetos.js';
import { crearMusica } from './musica.js';
import { crearMesa, pantallaMesa } from '../../core/mesa.js';
import { escapeHtml } from '../../core/ui.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TRASTEROS = 5;
const PRESUPUESTO = 3000;      // para TODA la partida: no se recarga nunca
const INCREMENTO = 50;
const RELOJ_PUJA = 3.4;        // segundos sin pujas para adjudicar
const OJEADA = 10;             // segundos de puerta abierta
const LINTERNAS = 2;

/* Geometría de la nave. Todo lo demás se coloca a partir de esto. */
const SEP = 5.6;               // de eje a eje entre trasteros
const HUECO_AN = 4.0;          // ancho del vano de la puerta
const HUECO_AL = 2.72;
const INT_AN = 4.4, INT_FO = 5.4, INT_AL = 3.0;
const ejeDe = (i) => i * SEP;

/**
 * Catálogo. `visible` marca lo que se ve desde el umbral: los muebles grandes y
 * poco más. Los valores están pensados para que un trastero medio ronde los mil
 * y pico y el bueno se dispare.
 */
const COSAS = [
  { n: 'Sofá viejo', v: [30, 90], visible: true, modelo: 'sofa' },
  { n: 'Armario desmontado', v: [40, 120], visible: true, modelo: 'armario' },
  { n: 'Colchón', v: [10, 40], visible: true, modelo: 'colchon' },
  { n: 'Bicicleta', v: [80, 260], visible: true, modelo: 'bicicleta' },
  { n: 'Nevera', v: [60, 200], visible: true, modelo: 'nevera' },
  { n: 'Cajas de ropa', v: [30, 150], visible: true, modelo: 'cajasRopa' },
  { n: 'Herramientas', v: [120, 420], visible: false, modelo: 'herramientas' },
  { n: 'Consola retro', v: [150, 700], visible: false, modelo: 'consola' },
  { n: 'Vinilos', v: [90, 500], visible: false, modelo: 'vinilos' },
  { n: 'Cámara antigua', v: [140, 620], visible: false, modelo: 'camara' },
  { n: 'Cuadro firmado', v: [200, 1400], visible: false, modelo: 'cuadro' },
  { n: 'Moneda rara', v: [180, 1100], visible: false, modelo: 'moneda' },
  { n: 'Reloj de bolsillo', v: [220, 1300], visible: false, modelo: 'reloj' },
  { n: 'Guitarra', v: [180, 900], visible: false, modelo: 'guitarra' },
  { n: 'Caja de fotos', v: [5, 30], visible: false, modelo: 'cajaFotos' },
  { n: 'Trastos mojados', v: [-120, -30], visible: true, modelo: 'mojado' },
  { n: 'Chatarra', v: [-80, -10], visible: true, modelo: 'chatarra' },
  { n: 'Neumáticos', v: [-90, -20], visible: true, modelo: 'neumaticos' },
  { n: 'Microondas', v: [20, 110], visible: true, modelo: 'microondas' },
  { n: 'Televisor de tubo', v: [-40, 70], visible: true, modelo: 'television' },
  { n: 'Lámpara de pie', v: [30, 170], visible: true, modelo: 'lampara' },
  { n: 'Estantería con libros', v: [40, 280], visible: true, modelo: 'estanteria' },
  { n: 'Alfombra enrollada', v: [20, 360], visible: true, modelo: 'alfombra' },
  { n: 'Tocadiscos', v: [200, 950], visible: false, modelo: 'tocadiscos' },
  // La caja fuerte es la mejor carta del mazo: se ve el bulto, no lo de dentro.
  // Puede estar vacía y puede pagar el trastero entero.
  { n: 'Caja fuerte', v: [0, 1300], visible: false, modelo: 'cajaFuerte' },
  { n: 'Maletas antiguas', v: [80, 500], visible: false, modelo: 'maletas' },
];

const JOYA = { n: 'Colección completa', v: [900, 2400], visible: false, modelo: 'bauljoya' };

/**
 * Tipos de trastero.
 *
 * Que todos los trasteros valgan más o menos lo mismo mata el juego: si el de
 * dentro siempre ronda los mil, pujar mil es siempre correcto y no hay decisión
 * que tomar. Aquí hay basura de verdad (donde ganas no pujando) y trasteros que
 * valen tres veces el presupuesto de una persona.
 *
 * `sesgo` inclina el sorteo del catálogo, no lo fuerza: un trastero de basura
 * puede esconder algo bueno, y ese "puede" es lo que hace que nadie los
 * descarte del todo.
 *
 * `salida` es lo que canta el subastero al abrir, y sale de lo que se ve desde
 * fuera — que es justo lo que puede no tener nada que ver con lo que hay.
 */
const COSAS_POR_TRASTERO = 5;
const VISIBLES_MINIMO = 2;     // lo que se ve desde el umbral, siempre

const TIPOS = {
  basura: { sesgo: 'malo', joya: 0, salida: [50, 100] },
  barato: { sesgo: 'flojo', joya: 0.06, salida: [50, 150] },
  medio: { sesgo: 'normal', joya: 0.25, salida: [100, 250] },
  bueno: { sesgo: 'bueno', joya: 0.55, salida: [150, 350] },
  joya: { sesgo: 'bueno', joya: 1, salida: [200, 400] },
};

/** Peso de cada cosa del catálogo según el sesgo del trastero. */
const SESGOS = {
  malo: (c) => (c.v[1] <= 0 ? 5 : c.v[1] < 200 ? 3 : 0.35),
  flojo: (c) => (c.v[1] <= 0 ? 2 : c.v[1] < 300 ? 3 : 0.8),
  normal: () => 1,
  bueno: (c) => (c.v[1] <= 0 ? 0.4 : c.v[1] > 500 ? 3 : 1),
};

/**
 * Guion de la partida: cinco trasteros con variedad garantizada.
 *
 * Sorteando cada uno por su cuenta salían partidas de cinco trasteros medios,
 * que es la más aburrida de todas. Con un guion fijo y barajado siempre hay al
 * menos una ruina y al menos uno que merece la pena pelear.
 */
function guionPartida(rng) {
  const fijos = ['basura', 'barato', 'medio', 'bueno'];
  const comodin = ['medio', 'bueno', 'joya', 'basura', 'barato'][Math.floor(rng() * 5)];
  const lista = [...fijos, comodin];
  for (let i = lista.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  return lista;
}

/* Franjas del suelo del trastero: delante lo que se ve desde el umbral, al
   fondo lo que hay que adivinar. */
const FRANJA_FRENTE = [-1.05, -2.5];
const FRANJA_FONDO = [-3.1, -5.1];

/**
 * Capa de luz del interior de los trasteros.
 *
 * Todo lo que está dentro vive en esta capa, y el sol NO la ilumina. Son dos
 * cosas de una: por un lado es lo que pasa de verdad —dentro de un trastero al
 * atardecer no entra el sol, entra lo que dejan entrar la luz del umbral y tu
 * linterna—, y por otro se acabó el acné de sombra, que con el sol rasando las
 * paredes llenaba el fondo de manchas cuadradas por mucho sesgo que se le
 * pusiera. Sin sol sobre esa geometría no hay mapa de sombras que fallar.
 */
const CAPA_INT = 1;
const aInterior = (obj) => obj.traverse((o) => o.layers.set(CAPA_INT));

export function create(ctx) {
  const { audio, haptics, rng } = ctx;

  /* ═══════════════ Mundo ═══════════════ */

  const mundo = crearMundo(ctx.root, {
    cielo: '#171232', horizonte: '#e08246', niebla: 0.013,
    sol: 2.6, solPos: [-34, 7.5, 7], sombraArea: 13, fov: 50,
    // El plano cercano por delante de 0,1 y el lejano recortado: con 0,1–400 el
    // búfer de profundidad no daba para tanto rango y las superficies grandes
    // (suelo, paredes de la nave) parpadeaban al moverse la cámara.
    cerca: 0.35, lejos: 260,
  });
  // Sol de última hora: bajo, naranja y rasante. Es lo que mete las sombras
  // largas por el suelo y deja el interior de los trasteros en penumbra.
  mundo.luzSol.color.set('#ffc084');
  // El relleno hemisférico de tres.js viene teñido del color del horizonte, y
  // con un atardecer así de naranja pintaba de cartón hasta la chapa. Se
  // sustituye por un azul de sombra, que es lo que rellena de verdad a esta
  // hora: el sol calienta lo que toca y el resto se lo queda el cielo.
  mundo.ambiente.color.set('#7d8ba8');
  mundo.ambiente.intensity = 1.05;
  mundo.contra.intensity = 0.45;
  // Sesgo de sombra generoso: el interior del trastero es un cubo del revés y
  // el sol lo raspa casi en paralelo. Con el sesgo por defecto se llenaba de
  // cuadros negros (la sombra de la pared sobre sí misma).
  mundo.luzSol.shadow.bias = -0.0022;
  mundo.luzSol.shadow.normalBias = 0.06;

  const panel = crearPanel(ctx.root);
  const M = materiales(mat);

  // El foco del sol sigue al trastero en juego: con área de sombra pequeña la
  // sombra sale nítida donde se está mirando y no cuesta un mapa gigante.
  const focoSol = new THREE.Object3D();
  mundo.escena.add(focoSol);
  mundo.luzSol.target = focoSol;

  /* ---------------- Nave ---------------- */

  const chapa = new THREE.MeshStandardMaterial({
    map: texturaGrano('#767d88', '#575d67', { lineas: 46, repite: 1, ruido: 0.04 }),
    roughness: 0.5, metalness: 0.55,
  });
  // Ninguna nave tiene las cinco puertas del mismo naranja: unas se han
  // repintado y otras llevan diez años al sol. Tres tonos bastan para que la
  // fila deje de parecer un patrón repetido.
  const chapaPuerta = [
    ['#c86a35', '#8f4620'], ['#b45a2c', '#7d3d1c'], ['#d17a44', '#9a5228'],
  ].map(([a, b]) => new THREE.MeshStandardMaterial({
    map: texturaGrano(a, b, { lineas: 30, repite: 1, ruido: 0.05 }),
    roughness: 0.55, metalness: 0.42,
  }));
  // Doble cara: las paredes se miran desde dentro, pero la cámara del reparto
  // entra y sale y conviene que no desaparezcan al cruzarlas.
  const interiorMat = mat('#22242c', { rug: 0.96, lados: 'doble' });
  const soleraMat = new THREE.MeshStandardMaterial({
    map: texturaGrano('#3a3b40', '#2c2d31', { repite: 3, ruido: 0.09 }),
    roughness: 0.95, metalness: 0,
  });

  // El suelo tiene que caber DENTRO de la cúpula del cielo (radio = lejos·0,45).
  // Con un plano más ancho que la cúpula, el asfalto la atravesaba y dejaba una
  // costura recta cruzando la pantalla por el horizonte.
  suelo(mundo, { color: '#2c2c33', veta: '#232329', tam: 200, repite: 46, rug: 0.92 });

  const nave = new THREE.Group();
  mundo.escena.add(nave);

  const centroFila = ejeDe(TRASTEROS - 1) / 2;
  const largoFila = SEP * TRASTEROS + 2.4;

  // Pilares: uno por junta entre trasteros, más los dos extremos. El vano que
  // queda entre dos pilares ES la puerta; así no hace falta agujerear un muro.
  for (let i = 0; i <= TRASTEROS; i++) {
    nave.add(caja(SEP - HUECO_AN, HUECO_AL + 0.1, 0.55, chapa,
      [ejeDe(i) - SEP / 2, (HUECO_AL + 0.1) / 2, 0]));
  }
  // Dintel corrido y peto de la cubierta.
  nave.add(caja(largoFila, INT_AL - HUECO_AL, 0.55, chapa,
    [centroFila, HUECO_AL + (INT_AL - HUECO_AL) / 2, 0]));
  /* Ojo con las caras coplanares: el alero se separa del techo del trastero y
     la trasera de la nave, de la pared del fondo. Cuando dos caras caen en el
     mismo plano el búfer de profundidad no sabe cuál va delante y aparece un
     damero que parpadea con la cámara — que es exactamente lo que se veía
     rasgando el fondo de los trasteros. Unos centímetros de aire lo arreglan. */
  nave.add(caja(largoFila, 0.22, 1.9, chapa, [centroFila, INT_AL + 0.21, -0.35]));
  nave.add(caja(largoFila, 0.5, 0.16, mat('#3c3f47', { rug: 0.7, met: 0.4 }),
    [centroFila, INT_AL + 0.5, 0.5]));

  // Trasera y laterales de la nave, para que no se vea el vacío por detrás.
  nave.add(caja(largoFila, INT_AL + 0.5, 0.4, chapa, [centroFila, (INT_AL + 0.5) / 2, -INT_FO - 0.95]));
  for (const s of [-1, 1]) {
    nave.add(caja(0.4, INT_AL + 0.5, INT_FO + 0.8, chapa,
      [centroFila + s * (largoFila / 2), (INT_AL + 0.5) / 2, -INT_FO / 2]));
  }

  /* ---------------- Trasteros ---------------- */

  /** unidades[i] = { eje, casco, puerta, luz, apertura } */
  const unidades = [];

  for (let i = 0; i < TRASTEROS; i++) {
    const eje = ejeDe(i);

    /* Casco: cuatro paredes sueltas, no un cubo del revés.
       Con el cubo invertido las normales apuntan hacia FUERA de la habitación,
       y el sesgo de normal del mapa de sombras empujaba la muestra al otro
       lado del muro: el sol rasante dejaba las paredes llenas de manchas
       cuadradas. Con planos orientados hacia dentro el sesgo empuja donde
       tiene que empujar y las paredes salen limpias. */
    const casco = new THREE.Group();
    const pared = (an, al, pos, rot) => {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(an, al), interiorMat);
      p.position.set(pos[0], pos[1], pos[2]);
      if (rot) p.rotation.set(rot[0], rot[1], rot[2]);
      p.receiveShadow = true;
      casco.add(p);
    };
    const zc = -INT_FO / 2 - 0.2;
    pared(INT_AN, INT_AL, [eje, INT_AL / 2, -INT_FO - 0.2], null);                       // fondo
    pared(INT_FO, INT_AL, [eje - INT_AN / 2, INT_AL / 2, zc], [0, Math.PI / 2, 0]);       // izquierda
    pared(INT_FO, INT_AL, [eje + INT_AN / 2, INT_AL / 2, zc], [0, -Math.PI / 2, 0]);      // derecha
    pared(INT_AN, INT_FO, [eje, INT_AL, zc], [Math.PI / 2, 0, 0]);                        // techo
    aInterior(casco);
    nave.add(casco);

    // Solera de hormigón: separada del casco porque es lo único del interior
    // que recibe luz de verdad, y en un plano propio se le puede dar el
    // desgaste que la pared no necesita.
    const solera = new THREE.Mesh(new THREE.PlaneGeometry(INT_AN - 0.02, INT_FO - 0.02), soleraMat);
    solera.rotation.x = -Math.PI / 2;
    solera.position.set(eje, 0.012, -INT_FO / 2 - 0.2);
    solera.receiveShadow = true;
    aInterior(solera);
    nave.add(solera);

    // Persiana: doce lamas. Al subir se van amontonando contra el dintel, que
    // es lo que hace que se lea como una persiana y no como una tapa que sube.
    const puerta = new THREE.Group();
    const nLamas = 12, hLama = HUECO_AL / nLamas;
    for (let k = 0; k < nLamas; k++) {
      const lama = caja(HUECO_AN - 0.06, hLama * 0.94, 0.07, chapaPuerta[i % chapaPuerta.length],
        [eje, (k + 0.5) * hLama, 0.14]);
      lama.userData.baseY = (k + 0.5) * hLama;
      lama.userData.topeY = HUECO_AL - (nLamas - 1 - k) * hLama * 0.17 - hLama * 0.5;
      puerta.add(lama);
    }
    // Tirador y número pintado en la lama de abajo.
    puerta.children[0].add(cilindro(0.03, 0.03, 0.5, M.metal, [0, 0, 0.06], 8));
    puerta.children[0].children[0].rotation.z = Math.PI / 2;
    nave.add(puerta);

    const num = cartel(String(i + 1), { color: '#ffe9c8', fondo: 'rgba(0,0,0,0)', escala: 0.55 });
    num.position.set(eje - HUECO_AN / 2 - 0.42, HUECO_AL - 0.3, 0.34);
    nave.add(num);

    // Luz de cortesía sobre cada puerta: el detalle que convierte una fila de
    // cajas grises en un sitio a las nueve de la noche.
    const farola = caja(0.5, 0.12, 0.3, mat('#ffd9a0', { emisivo: '#ffbb66', brillo: 1.5 }),
      [eje, HUECO_AL + 0.32, 0.4]);
    nave.add(farola);

    unidades.push({ eje, casco, puerta, apertura: 0, luz: null });
  }

  // Una sola luz de interior, que viaja al trastero en juego. Cinco luces fijas
  // costarían cinco veces lo mismo para iluminar un sitio donde no mira nadie.
  const luzInterior = new THREE.PointLight(0xffd2a0, 0, 14, 1.4);
  luzInterior.position.set(0, INT_AL - 0.5, -1.4);
  mundo.escena.add(luzInterior);

  const luzUmbral = new THREE.PointLight(0xffbb77, 9, 10, 1.5);
  luzUmbral.position.set(0, HUECO_AL + 0.25, 0.55);
  mundo.escena.add(luzUmbral);

  /* Reparto de capas: la cámara lo ve todo; las luces de dentro alcanzan las
     dos capas; el sol se queda fuera (mantiene su capa 0 por defecto). */
  mundo.camara.layers.enableAll();
  for (const l of [mundo.ambiente, mundo.contra, luzInterior, luzUmbral]) l.layers.enable(CAPA_INT);

  /* La linterna: un foco de verdad, con su cono visible. Gastarla tiene que
     verse desde la última fila, porque su coste es justo ese: que lo vea todo
     el mundo. */
  const linterna = new THREE.SpotLight(0xfff4dd, 0, 16, 0.3, 0.55, 1.0);
  linterna.position.set(0, 1.75, 1.2);
  linterna.layers.enable(CAPA_INT);
  // La linterna sí proyecta sombra, y es la única del interior que lo hace:
  // enfocar un bulto y ver su sombra estirarse por la pared del fondo es la
  // mitad de la gracia de gastarla.
  linterna.castShadow = true;
  linterna.shadow.mapSize.set(1024, 1024);
  linterna.shadow.camera.near = 0.5;
  linterna.shadow.camera.far = 18;
  linterna.shadow.bias = -0.0025;
  linterna.shadow.normalBias = 0.03;
  const linternaMira = new THREE.Object3D();
  mundo.escena.add(linterna, linternaMira);
  linterna.target = linternaMira;

  const conoGeo = new THREE.ConeGeometry(1, 1, 20, 1, true);
  conoGeo.translate(0, -0.5, 0);   // vértice en el origen: se apunta como un foco
  const cono = new THREE.Mesh(conoGeo, new THREE.MeshBasicMaterial({
    color: 0xffeccc, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  }));
  cono.visible = false;
  mundo.escena.add(cono);

  /* Polvo en suspensión. Solo se nota cuando lo cruza la linterna, que es
     exactamente cuando hace falta que se note. */
  const polvo = (() => {
    const n = 220;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * INT_AN * 0.9;
      pos[i * 3 + 1] = Math.random() * (INT_AL - 0.4) + 0.2;
      pos[i * 3 + 2] = -Math.random() * INT_FO;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffe8c0, size: 0.022, transparent: true, opacity: 0.3,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    p.layers.set(CAPA_INT);
    mundo.escena.add(p);
    return p;
  })();

  /* ---------------- Atrezo del aparcamiento ---------------- */

  (function exteriores() {
    const posteMat = mat('#3a3d44', { rug: 0.8, met: 0.4 });
    for (const x of [-4.5, centroFila * 2 + 4.5]) {
      const poste = cilindro(0.09, 0.11, 6.4, posteMat, [x, 3.2, 9]);
      nave.add(poste);
      const lampara = caja(0.9, 0.16, 0.5, mat('#fff0cc', { emisivo: '#ffcc88', brillo: 2.2 }), [x, 6.3, 8.4]);
      nave.add(lampara);
      const luz = new THREE.PointLight(0xffcf95, 22, 26, 1.5);
      luz.position.set(x, 6.1, 8.4);
      mundo.escena.add(luz);
    }
    // Valla de malla al fondo: postes finos y un travesaño. Con la niebla del
    // atardecer basta para que la nave esté "en algún sitio".
    const vallaMat = mat('#31343a', { rug: 0.9, met: 0.5 });
    for (let i = -3; i < 12; i++) nave.add(caja(0.07, 2.2, 0.07, vallaMat, [i * 3, 1.1, 17]));
    nave.add(caja(50, 0.06, 0.06, vallaMat, [centroFila, 2.15, 17]));
    nave.add(caja(50, 0.06, 0.06, vallaMat, [centroFila, 0.9, 17]));
  })();

  /* ═══════════════ Estado de partida ═══════════════ */

  let mesa = null, pantalla = null, marcador = null;
  let fase = 'config';           // config | puerta | subasta | reparto | fin
  let trastero = 0, unidad = null;
  let precio = 0, lider = null, reloj = 0;
  let botTimer = new Map(), historia = [];
  let tiempo = 0, faseT = 0, sacudida = 0, cortar = true;
  let pujadores = [], tiraHUD = null;
  let luzLinterna = 0;           // 0..1, lo que queda de foco encendido
  let guion = guionPartida(rng);
  const animaciones = [];
  const ambiente = crearAmbiente(ctx.audio);
  const musica = crearMusica(ctx.audio);

  const ejeActual = () => unidades[Math.min(trastero, TRASTEROS - 1)].eje;

  /** Animación por tiempo: paso(k) con k de 0 a 1, y `fin` opcional. */
  function animar(dur, paso, fin = null) { animaciones.push({ t: 0, dur, paso, fin }); }

  /* ---------------- Generación ---------------- */

  /**
   * Saca una cosa del catálogo con el sesgo del tipo de trastero.
   *
   * `entre` permite restringir el sorteo (por ejemplo, solo a lo que se ve
   * desde la puerta) sin duplicar la tabla de pesos.
   */
  function sortearCosa(sesgo, entre = COSAS) {
    const peso = SESGOS[sesgo] || SESGOS.normal;
    const total = entre.reduce((s, c) => s + peso(c), 0);
    if (total <= 0) return entre[Math.floor(rng() * entre.length)];
    let r = rng() * total;
    for (const c of entre) { r -= peso(c); if (r <= 0) return c; }
    return entre[entre.length - 1];
  }

  const SOLO_VISIBLES = COSAS.filter((c) => c.visible);
  const SOLO_TAPADAS = COSAS.filter((c) => !c.visible);

  function nuevoTrastero(indice) {
    const tipo = TIPOS[guion[indice]] || TIPOS.medio;
    const cosas = [];
    const meter = (base) => {
      const valor = Math.round(base.v[0] + rng() * (base.v[1] - base.v[0]));
      cosas.push({ ...base, valor, revelado: base.visible });
    };

    /* Cinco trastos, ni uno más: con quince bultos amontonados no se distingue
       nada y da igual lo bien modelados que estén. Se garantizan dos a la vista
       y dos tapados — un trastero sin nada delante no parece un trastero, y uno
       sin nada al fondo no tiene misterio que subastar. */
    for (let i = 0; i < VISIBLES_MINIMO; i++) meter(sortearCosa(tipo.sesgo, SOLO_VISIBLES));
    for (let i = 0; i < VISIBLES_MINIMO; i++) meter(sortearCosa(tipo.sesgo, SOLO_TAPADAS));
    for (let i = cosas.length; i < COSAS_POR_TRASTERO; i++) meter(sortearCosa(tipo.sesgo));
    // La pieza gorda: lo que hace que valga la pena pelear por el que parece
    // vacío. En los buenos casi siempre la hay; en los de basura, nunca.
    if (rng() < tipo.joya) {
      cosas.push({ ...JOYA, valor: Math.round(JOYA.v[0] + rng() * (JOYA.v[1] - JOYA.v[0])), revelado: false });
    }
    const pista = [
      'huele a humedad', 'todo muy ordenado', 'polvo de años', 'hay cajas selladas',
      'cerradura nueva', 'hay una nota dentro', 'lleno hasta el techo', 'medio vacío',
    ][Math.floor(rng() * 8)];
    // La salida la canta el subastero mirando desde fuera: sube con lo que se
    // ve, no con lo que hay. Redondeada al incremento para que las cuentas
    // salgan redondas durante toda la puja.
    const [sMin, sMax] = tipo.salida;
    const bruto = sMin + rng() * (sMax - sMin) + cosas.filter((c) => c.visible).length * 12;
    const salida = Math.max(50, Math.round(bruto / INCREMENTO) * INCREMENTO);

    return {
      indice, cosas, pista, salida, tipo: guion[indice],
      valor: cosas.reduce((s, c) => s + c.valor, 0),
    };
  }

  /* ---------------- Montaje del trastero ---------------- */

  const grupoCosas = new THREE.Group();
  mundo.escena.add(grupoCosas);

  const lonaMat = mat('#4a4f58', { rug: 0.98 });
  const cuerdaMat = mat('#6e6252', { rug: 1 });

  /**
   * Reparte `n` sitios en una rejilla de tres columnas dentro de una franja.
   *
   * Antes había una lista fija de huecos y los trasteros con más cosas que
   * huecos repetían posición: dos trastos en el mismo sitio se atraviesan y se
   * ve el truco. La rejilla se hace tan honda como haga falta.
   */
  function rejilla(n, [zIni, zFin]) {
    if (n <= 0) return [];
    const cols = Math.min(3, n);
    const filas = Math.ceil(n / cols);
    const util = INT_AN - 1.0;
    const puntos = [];
    for (let i = 0; i < n; i++) {
      const f = Math.floor(i / cols);
      const c = i % cols;
      const x = cols === 1 ? 0 : -util / 2 + (c * util) / (cols - 1);
      const z = filas === 1 ? (zIni + zFin) / 2 : zIni + (f * (zFin - zIni)) / (filas - 1);
      puntos.push([x + (rng() - 0.5) * 0.26, z + (rng() - 0.5) * 0.28]);
    }
    return puntos;
  }

  /**
   * Ordena por tamaño y manda lo gordo al fondo de su franja. Nadie apila un
   * armario delante de una caja de fotos: lo grande va contra la pared y lo
   * pequeño donde se alcanza.
   */
  function colocar(lista) {
    const orden = [...lista].sort(
      (a, b) => (MODELOS[b.modelo]?.radio ?? 0.4) - (MODELOS[a.modelo]?.radio ?? 0.4),
    );
    return orden;
  }

  function poblar(eje) {
    const visibles = colocar(unidad.cosas.filter((c) => c.visible));
    const ocultas = colocar(unidad.cosas.filter((c) => !c.visible));
    const sitiosV = rejilla(visibles.length, FRANJA_FRENTE).reverse();
    const sitiosO = rejilla(ocultas.length, FRANJA_FONDO).reverse();

    const montar = (c, sitio) => {
      const def = MODELOS[c.modelo] || MODELOS.cajasRopa;
      const g = def.hacer(M, rng);
      g.position.set(eje + sitio[0], 0, sitio[1] - 0.2);
      g.rotation.y = (rng() - 0.5) * 0.9;
      aInterior(g);
      grupoCosas.add(g);

      /* Sombra de contacto: un disco oscuro pegado al suelo bajo cada trasto.
         Dentro del trastero no hay sol y por tanto no hay sombra proyectada,
         y sin nada debajo los objetos parecen flotar un dedo por encima de la
         solera. Este disco es lo que los posa en el suelo. */
      const disco = sombraContacto(def.radio * 1.15, 0.42);
      disco.position.set(g.position.x, 0.02, g.position.z);
      disco.layers.set(CAPA_INT);
      disco.userData.propio = true;   // material de un solo uso: ver vaciar()
      grupoCosas.add(disco);
      c.malla = g;
      c.alto = def.alto;
      c.sitio = sitio;

      if (!c.revelado) {
        // Bajo lona: un bulto con forma pero sin identidad. Lo que se puede
        // deducir es el tamaño, y ese es justo el dato que el juego quiere dar.
        g.visible = false;
        const r = Math.max(0.34, def.radio * 0.95);
        const lona = new THREE.Group();
        const cuerpo = caja(r * 2, def.alto * 0.96, r * 1.9, lonaMat, [0, def.alto * 0.48, 0]);
        cuerpo.rotation.y = (rng() - 0.5) * 0.5;
        lona.add(cuerpo);
        // Los pliegues: dos tiras finas cruzando por encima rompen el cubo.
        const pliegueA = caja(r * 2.2, 0.05, r * 0.5, lonaMat, [0, def.alto * 0.95, 0]);
        pliegueA.rotation.set(0, 0.4, 0.06);
        const pliegueB = caja(r * 0.5, 0.05, r * 2.1, lonaMat, [0, def.alto * 0.93, 0]);
        pliegueB.rotation.set(0.05, -0.3, 0);
        lona.add(pliegueA, pliegueB);
        lona.add(caja(r * 2.05, 0.04, 0.04, cuerdaMat, [0, def.alto * 0.55, 0]));
        lona.position.set(eje + sitio[0], 0, sitio[1] - 0.2);
        lona.rotation.y = (rng() - 0.5) * 0.8;
        aInterior(lona);
        grupoCosas.add(lona);
        c.lona = lona;
      }
    };

    visibles.forEach((c, i) => montar(c, sitiosV[i]));
    ocultas.forEach((c, i) => montar(c, sitiosO[i]));
  }

  /**
   * Quita el trastero anterior de la escena y suelta lo que era suyo.
   *
   * Las geometrías son de un solo uso y se tiran siempre; los materiales, no:
   * los comparten todos los trasteros de la partida (ver objetos.js) y tirarlos
   * dejaría el siguiente en negro. Las excepciones —etiquetas de precio, con su
   * textura, y sombras de contacto, con su opacidad propia— van marcadas.
   */
  function vaciar() {
    grupoCosas.traverse((o) => {
      o.geometry?.dispose();
      if (o.isSprite) { o.material.map?.dispose(); o.material.dispose(); }
      else if (o.userData.propio) o.material?.dispose();
    });
    grupoCosas.clear();
  }

  /** Levanta la lona de una cosa y la deja a la vista. */
  function destapar(c, conFoco) {
    if (c.revelado) return;
    c.revelado = true;
    c.malla.visible = true;
    c.malla.scale.setScalar(0.92);
    animar(0.45, (k) => c.malla.scale.setScalar(0.92 + 0.08 * k));

    const lona = c.lona;
    if (lona) {
      const y0 = lona.position.y;
      // La lona sale hacia arriba y hacia el fondo, como si tirasen de ella.
      lona.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; } });
      animar(0.7, (k) => {
        lona.position.y = y0 + k * 2.6;
        lona.rotation.x = -k * 0.9;
        lona.traverse((o) => { if (o.material) o.material.opacity = 1 - k; });
      }, () => {
        lona.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        lona.removeFromParent();
        c.lona = null;
      });
    }

    if (conFoco) {
      // El foco apunta al bulto que se acaba de abrir y se queda un rato.
      const p = c.malla.position;
      linternaMira.position.set(p.x, Math.max(0.4, c.alto * 0.6), p.z);
      linterna.position.set(ejeActual() + (p.x - ejeActual()) * 0.15, 1.8, 1.3);
      luzLinterna = 1;
    }
  }

  /* ---------------- Pujadores ---------------- */

  /**
   * Una figura por equipo delante de la puerta, de espaldas a la cámara.
   *
   * No hace falta que sean personas convincentes: hace falta saber de un
   * vistazo quién acaba de pujar. Por eso lo que se mueve es la paleta, que es
   * grande, va arriba y lleva el color del equipo.
   */
  function construirPujadores() {
    const n = mesa.equipos.length;
    mesa.equipos.forEach((e, i) => {
      const g = new THREE.Group();
      const col = mat(e.color, { rug: 0.7 });
      const ropa = mat('#2b2f38', { rug: 0.95 });

      g.add(cilindro(0.17, 0.19, 0.86, ropa, [0, 0.43, 0], 10));
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.44, 4, 12), col);
      torso.position.y = 1.16;
      torso.castShadow = true;
      g.add(torso);
      const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), mat('#b98d6a', { rug: 0.85 }));
      cabeza.position.y = 1.66;
      cabeza.castShadow = true;
      g.add(cabeza);

      // Brazo y paleta: el brazo pivota desde el hombro, así que va en su
      // propio grupo con el origen ahí.
      const brazo = new THREE.Group();
      brazo.position.set(0.28, 1.38, 0);
      brazo.add(cilindro(0.055, 0.055, 0.52, col, [0, -0.26, 0], 8));
      brazo.add(cilindro(0.03, 0.03, 0.3, M.maderaMiel, [0, -0.62, 0], 8));
      const pala = caja(0.34, 0.34, 0.03, mat(e.color, { rug: 0.55 }), [0, -0.9, 0]);
      brazo.add(pala);
      g.add(brazo);

      const etiqueta = cartel(String(i + 1), { color: '#ffffff', fondo: 'rgba(0,0,0,0)', escala: 0.5 });
      etiqueta.position.set(0, -0.9, 0.05);
      brazo.add(etiqueta);

      g.position.set(0, 0, 6.6);
      g.rotation.y = Math.PI;   // de cara a la puerta
      mundo.escena.add(g);

      pujadores.push({ equipo: e, grupo: g, brazo, alzada: 0, objetivo: 0, salto: 0, iy: i, n });
    });
    colocarPujadores();
  }

  function colocarPujadores() {
    const eje = ejeActual();
    pujadores.forEach((p, i) => {
      const dx = (i - (p.n - 1) / 2) * 1.45;
      p.grupo.position.set(eje + dx, 0, 6.5 + Math.abs(dx) * 0.16);
    });
  }

  /* ---------------- Fases ---------------- */

  function empezarTrastero() {
    vaciar();
    unidad = nuevoTrastero(trastero);
    poblar(ejeActual());
    precio = unidad.salida;
    lider = null;
    reloj = OJEADA;
    fase = 'puerta';
    faseT = 0;
    cortar = true;
    botTimer = new Map();
    // Ganas y retirada, de cero en cada trastero: a uno le puede no apetecer
    // este y dejarse la caja en el siguiente.
    for (const e of mesa.equipos) { e.ganas = 0.45 + rng() * 0.75; e.retirado = false; }
    colocarPujadores();
    audio.select();

    // La persiana sube en tres segundos largos: es el momento en el que todo el
    // mundo se calla, y acelerarlo se carga el juego.
    const u = unidades[trastero];
    animar(3.2, (k) => { u.apertura = k * k * (3 - 2 * k); });
    pintarEquipos();
  }

  function empezarSubasta() {
    fase = 'subasta';
    faseT = 0;
    cortar = true;
    reloj = RELOJ_PUJA;
    audio.arp([440, 660, 880], 0.05);
    for (const e of mesa.equipos) botTimer.set(e.id, mesa.demora() + rng() * 0.8);
  }

  function pujar(equipo, puesto = null) {
    if (fase !== 'subasta') return;
    if (lider === equipo) return;                       // no te pujas a ti mismo
    const coste = lider ? precio + INCREMENTO : precio;
    if (equipo.dinero < coste) return;
    precio = coste;
    lider = equipo;
    reloj = RELOJ_PUJA;
    audio.tone({ freq: 520 + Math.min(600, precio * 0.2), dur: 0.07, gain: 0.16, type: 'square' });
    haptics.play('tick', { player: puesto && puesto.i < 2 ? puesto.i : null });
    sacudida = Math.min(0.5, sacudida + 0.22);

    for (const p of pujadores) {
      if (p.equipo === equipo) { p.objetivo = 1; p.salto = 1; }
      else if (p.objetivo === 1) p.objetivo = 0.12;      // el que mandaba, baja
    }
    pintarEquipos();
  }

  function adjudicar() {
    fase = 'reparto';
    faseT = 0;
    cortar = true;
    reloj = 5.4;
    for (const p of pujadores) p.objetivo = 0;

    // Se destapa todo, escalonado: uno cada poco, para que dé tiempo a leerlo.
    let retardo = 0;
    for (const c of unidad.cosas) {
      if (c.revelado) continue;
      const cc = c;
      animar(retardo + 0.01, () => {}, () => destapar(cc, false));
      retardo += 0.28;
    }
    animar(0.9, (k) => { luzInterior.intensity = k * 26; });

    if (lider) {
      // La caja baja al pagar; lo que había dentro NO entra ahora. El botín se
      // guarda aparte y solo se convierte en dinero en el recuento final: hasta
      // entonces nadie sabe si va ganando, y eso es todo el juego.
      lider.dinero -= precio;
      lider.botin += unidad.valor;
      lider.comprados++;
      const balance = unidad.valor - precio;
      historia.push({ trastero: trastero + 1, equipo: lider.nombre, precio, valor: unidad.valor, balance });
      if (balance > 0) { audio.win(); haptics.play('score'); }
      else { audio.error(); haptics.play('soft'); }
    } else {
      historia.push({ trastero: trastero + 1, equipo: null, precio: 0, valor: unidad.valor, balance: 0 });
      audio.back();
    }

    // Etiquetas de precio sobre cada trasto, ya con el trastero encendido.
    animar(1.4, () => {}, () => {
      for (const c of unidad.cosas) {
        if (!c.malla) continue;
        const s = cartel(`${c.valor} €`, {
          color: c.valor < 0 ? '#ff9a92' : '#c6ff7a',
          fondo: 'rgba(8,10,16,0.72)', escala: 0.34,
        });
        s.position.set(c.malla.position.x, c.alto + 0.34, c.malla.position.z);
        grupoCosas.add(s);
      }
    });
    pintarEquipos();
  }

  function siguiente() {
    trastero++;
    if (trastero >= TRASTEROS) return terminar();
    luzInterior.intensity = 0;
    empezarTrastero();
  }

  /** Recuento final: lo que queda en caja más lo que valía todo lo comprado. */
  const patrimonio = (e) => e.dinero + e.botin;

  function terminar() {
    fase = 'fin';
    const orden = [...mesa.equipos].sort((a, b) => patrimonio(b) - patrimonio(a));
    const campeon = orden[0];
    const mejorBalance = historia.reduce((m, h) => (h.balance > (m?.balance ?? -1e9) ? h : m), null);
    // Sin escapar: la pantalla de fin de partida ya escapa el detalle.
    const detalle = `${campeon.nombre}: ${campeon.dinero} € en caja + ${campeon.botin} € en género `
      + `= ${patrimonio(campeon)} € (${campeon.comprados} trastero${campeon.comprados === 1 ? '' : 's'})`
      + (mejorBalance && mejorBalance.equipo ? ` · mejor pelotazo: ${mejorBalance.equipo} +${mejorBalance.balance} €` : '');
    // El shell solo entiende dos bandos: si gana un bot, se cuenta como empate
    // y el detalle dice quién ganó de verdad.
    ctx.finish({
      winner: campeon.slotShell,
      scores: [
        (() => { const e = mesa.equipos.find((x) => x.slotShell === 0); return e ? patrimonio(e) : 0; })(),
        (() => { const e = mesa.equipos.find((x) => x.slotShell === 1); return e ? patrimonio(e) : 0; })(),
      ],
      detail: detalle,
      record: ctx.record('patrimonio', patrimonio(campeon), 'high'),
    });
  }

  /* ---------------- Bots ---------------- */

  /** Lo que un bot cree que vale este trastero mirando solo lo destapado. */
  function tasacionBot(equipo) {
    const visto = unidad.cosas.filter((c) => c.revelado).reduce((s, c) => s + c.valor, 0);
    const ocultas = unidad.cosas.filter((c) => !c.revelado).length;
    // Lo tapado se estima por número de bultos, no por su valor: nadie lo sabe.
    return mesa.tasar(equipo, visto + ocultas * 220);
  }

  /**
   * Hasta dónde puede llegar un bot en ESTE trastero.
   *
   * Tres frenos, y los tres hacen falta:
   *
   *   · **La cuota.** La caja se reparte entre los trasteros que quedan. Un bot
   *     puede estirarse por encima de su parte si le gusta lo que ve, pero no
   *     vaciarse: sin esto, el primero que salía se llevaba una guerra de pujas
   *     y dejaba a media mesa sin un euro para los cuatro siguientes.
   *
   *   · **Las ganas.** Cada bot decide al abrirse la puerta cuánto le apetece
   *     ESTE trastero (`ganas`, de 0,45 a 1,2). Que los cuatro peleen por todo
   *     no es una subasta, es una carrera: lo que da vida a la mesa es que a
   *     veces solo dos entren al trapo.
   *
   *   · **El margen.** Nadie puja por lo que cree que vale exactamente; se puja
   *     por debajo, para ganar algo. Ese margen es lo que los vuelve pasivos de
   *     verdad, porque corta la puja bastante antes de la tasación.
   *
   * En el último trastero desaparece la cuota: ya no hay nada que reservar.
   */
  function topeBot(equipo) {
    const quedan = TRASTEROS - trastero;                 // contando el de ahora
    const cuota = equipo.dinero / quedan;
    const techoCaja = quedan === 1
      ? equipo.dinero * 0.95
      : Math.min(equipo.dinero * 0.5, cuota * (0.95 + equipo.caracter.riesgo * 0.45));
    const margen = 0.72 + equipo.caracter.riesgo * 0.1;  // se puja por debajo
    const porGusto = tasacionBot(equipo) * equipo.caracter.tope * margen * (equipo.ganas ?? 1);
    return Math.min(porGusto, techoCaja);
  }

  function pensarBots(dt) {
    for (const e of mesa.equipos) {
      if (!e.esBot) continue;

      if (fase === 'puerta') {
        // Un bot gasta linterna si el trastero pinta a misterio y le sobra.
        if (e.linternas > 0 && faseT > 3.4
          && unidad.cosas.filter((c) => !c.revelado).length >= 3 && rng() < dt * 0.14) {
          usarLinterna(e);
        }
        continue;
      }
      if (fase !== 'subasta' || lider === e) continue;

      if (e.retirado) continue;                 // ya dijo que no en este trastero

      const t = (botTimer.get(e.id) ?? 0) - dt;
      botTimer.set(e.id, t);
      if (t > 0) continue;

      const tope = topeBot(e);
      const coste = lider ? precio + INCREMENTO : precio;
      // El farol: subir por encima de lo que vale para que el otro se lo quede
      // caro. Es exactamente lo que hacen en el programa. Pero nunca por encima
      // de la caja: farolear hasta arruinarte no es farolear, es perder.
      const farol = rng() < e.caracter.farol * 0.3 ? tope * 0.2 : 0;
      const limite = Math.min(tope + farol, e.dinero);

      if (coste > limite) {
        // Se retira, y se retira de verdad. Antes recalculaba en cada vuelta y
        // acababa colándose otra vez con el precio más alto todavía; una puja
        // en la que nadie se baja nunca no termina, solo se hace larga.
        e.retirado = true;
        continue;
      }

      // Cuanto más cerca del límite, más se lo piensa. Es lo que convierte el
      // final de una puja en un duelo lento en vez de una ráfaga de teclas.
      const apuro = coste / Math.max(1, limite);
      botTimer.set(e.id, mesa.demora() * (1 + apuro * apuro * 3.2));
      pujar(e);
    }
  }

  function usarLinterna(equipo) {
    if (equipo.linternas <= 0) return;
    const ocultas = unidad.cosas.filter((c) => !c.revelado);
    if (!ocultas.length) return;
    equipo.linternas--;
    destapar(ocultas[Math.floor(rng() * ocultas.length)], true);
    audio.pickup();
    haptics.play('click');
    pintarEquipos();
  }

  /* ---------------- Cámara ---------------- */

  const objPos = new THREE.Vector3();
  const objMira = new THREE.Vector3();

  function encuadre(dt) {
    const eje = ejeActual();
    const t = tiempo;

    if (fase === 'config') {
      // Plano de situación: recorrido lento por delante de toda la fila.
      objPos.set(centroFila + Math.sin(t * 0.12) * 9, 4.6, 20);
      objMira.set(centroFila + Math.sin(t * 0.12) * 4, 1.6, 0);
    } else if (fase === 'puerta') {
      // Acercarse a la puerta y asomarse, sin llegar a entrar.
      const k = Math.min(1, faseT / OJEADA);
      objPos.set(eje + Math.sin(t * 0.5) * 0.35, 1.85 + Math.sin(t * 0.7) * 0.04, 7.4 - k * 2.6);
      objMira.set(eje + Math.sin(t * 0.33) * 0.5, 1.5, -2.6);
    } else if (fase === 'subasta') {
      // Detrás de los pujadores: la puerta al fondo y las paletas en primer
      // término. El plano se cierra según sube el precio.
      const tension = Math.min(1, (precio - (unidad?.salida ?? 100)) / 1600);
      objPos.set(eje + Math.sin(t * 0.25) * 0.6, 3.5 - tension * 0.5, 12.4 - tension * 2.6);
      objMira.set(eje, 1.55, 1.2);
    } else if (fase === 'reparto') {
      // Cruzar el umbral y quedarse justo dentro.
      //
      // No más adentro: metiendo la cámara hasta el fondo, los carteles de
      // precio de la primera fila quedaban a un palmo del objetivo y tapaban
      // la pantalla entera. Desde el umbral cabe el trastero completo y se
      // leen todos los precios de una vez, que es de lo que va el plano.
      const k = Math.min(1, faseT / 3.4);
      const s = k * k * (3 - 2 * k);
      objPos.set(eje + Math.sin(t * 0.4) * 0.28, 2.1 - s * 0.35, 4.6 - s * 3.6);
      objMira.set(eje, 1.05, -2.8);
    }

    if (cortar) {
      // Cambio de fase = corte de plano. Interpolar entre dos sitios tan
      // distintos haría que la cámara atravesara a los pujadores y la pared.
      mundo.camara.position.copy(objPos);
      cortar = false;
    } else {
      mundo.camara.position.lerp(objPos, 1 - Math.exp(-3.4 * dt));
    }

    if (sacudida > 0) {
      mundo.camara.position.x += Math.sin(t * 47) * sacudida * 0.05;
      mundo.camara.position.y += Math.sin(t * 39) * sacudida * 0.04;
    }
    mundo.camara.lookAt(objMira);
  }

  /* ---------------- Interfaz ---------------- */

  function pintarEquipos() {
    if (!tiraHUD || !mesa) return;
    tiraHUD.innerHTML = mesa.equipos.map((e) => `
      <div class="sub3-eq ${lider === e ? 'lider' : ''} ${e.esBot ? 'bot' : ''}" style="--c:${e.color}">
        <b>${escapeHtml(e.nombre)}</b>
        <span class="sub3-din">${e.dinero} €</span>
        <span class="sub3-meta">${e.esBot ? escapeHtml(e.caracter.nombre)
          : e.puestos.map((p) => `<i>${p.teclas.etiqueta[0]}</i>`).join('')}
          · ${'✦'.repeat(e.linternas)}${'·'.repeat(LINTERNAS - e.linternas)}
          · ${e.comprados} 🔒</span>
      </div>`).join('');
  }

  function pintarPanel() {
    // El pie del panel de tres.js cae justo encima de la botonera del shell
    // (← Menú · ⏸ · ⛶), así que en este juego todo el texto vive arriba.
    if (fase === 'puerta') {
      const ocultas = unidad.cosas.filter((c) => !c.revelado).length;
      panel.centro(`Trastero ${trastero + 1} de ${TRASTEROS} · salida ${precio} €`);
      panel.sub(`«${escapeHtml(unidad.pista)}» — ${ocultas} bulto${ocultas === 1 ? '' : 's'} sin destapar al fondo`
        + '<br>Tu tecla <b>especial</b> gasta una linterna y destapa uno · lo verá todo el mundo');
      panel.pie('');
      panel.barra(reloj / OJEADA, '#ffd166');
    } else if (fase === 'subasta') {
      panel.centro(`<span style="font-size:34px;font-family:var(--font-display)">${precio} €</span>`);
      panel.sub((lider
        ? `manda <b style="color:${lider.color}">${escapeHtml(lider.nombre)}</b>`
        : 'nadie ha pujado todavía')
        + `<br>Tu tecla de <b>acción</b> puja +${INCREMENTO} €`);
      panel.pie('');
      panel.barra(reloj / RELOJ_PUJA, reloj < 1.2 ? '#ff4757' : '#a8ff3e');
    } else if (fase === 'reparto') {
      const bal = lider ? unidad.valor - precio : 0;
      panel.centro(lider ? `${escapeHtml(lider.nombre)} paga ${precio} €` : 'Nadie pujó');
      panel.sub((lider
        ? `Dentro había <b>${unidad.valor} €</b> en género · <b style="color:${bal >= 0 ? '#a8ff3e' : '#ff4757'}">${bal >= 0 ? '+' : ''}${bal} €</b>`
        : `Dentro había ${unidad.valor} €`)
        + (lider ? '<br>El género no se vende hasta el final: todavía no entra en caja' : ''));
      panel.pie('');
      panel.barra(null);
    }
  }

  /* ═══════════════ Ciclo ═══════════════ */

  return {
    init() {
      inyectarEstilos();
      tiraHUD = document.createElement('div');
      tiraHUD.className = 'sub3-tira';
      ctx.root.appendChild(tiraHUD);
      marcador = ctx.ui.scoreboard({ center: 'Subastas' });

      pantalla = pantallaMesa(ctx, {
        titulo: 'Subasta de trasteros',
        subtitulo: 'Se puja a ciegas por lo que hay detrás de la puerta. Gana quien acabe con más dinero, no quien compre más.',
        formatos: [
          { id: 'individual', etiqueta: 'Individual · 4 equipos de 1', equipos: 4, porEquipo: 1, nota: 'Cada uno a lo suyo. Hasta cuatro personas de verdad.' },
          { id: 'parejas', etiqueta: 'Parejas · 3 equipos de 2', equipos: 3, porEquipo: 2, nota: 'Seis puestos en tres equipos: los que no ocupéis los llevan bots.' },
        ],
      }, (cfg) => {
        mesa = crearMesa(ctx, cfg);
        for (const e of mesa.equipos) { e.dinero = PRESUPUESTO; e.botin = 0; e.comprados = 0; e.linternas = LINTERNAS; }
        marcador.setCenter(`${PRESUPUESTO} € para los ${TRASTEROS} trasteros`);
        construirPujadores();
        empezarTrastero();
      });
    },

    update(dt) {
      tiempo += dt;
      faseT += dt;
      sacudida = Math.max(0, sacudida - dt * 2.2);

      // Animaciones en curso (persiana, lonas, luces).
      for (let i = animaciones.length - 1; i >= 0; i--) {
        const a = animaciones[i];
        a.t += dt;
        const k = Math.min(1, a.t / a.dur);
        a.paso(k);
        if (k >= 1) { a.fin?.(); animaciones.splice(i, 1); }
      }

      // Persianas: cada lama sube hasta su tope y ahí se amontona.
      for (const u of unidades) {
        if (u.apertura <= 0) continue;
        for (const lama of u.puerta.children) {
          const subida = lama.userData.baseY + u.apertura * HUECO_AL * 1.15;
          lama.position.y = Math.min(subida, lama.userData.topeY);
        }
      }

      // La tensión que oye el ambiente es la misma que cierra el plano: lo que
      // ha subido el precio por encima de la salida.
      const tension = unidad
        ? Math.min(1, (precio - unidad.salida) / 1600)
        : 0;
      ambiente.paso(dt, fase, tension);
      musica.paso(fase);

      if (fase === 'config') {
        pantalla.actualizar();
        encuadre(dt);
        mundo.dibujar();
        return;
      }

      reloj -= dt;

      // Entradas humanas: cualquier puesto del equipo vale.
      for (const e of mesa.equipos) {
        if (e.esBot) continue;
        const pujaste = mesa.pulsoEquipo(e, 'accion');
        if (pujaste && fase === 'subasta') pujar(e, pujaste);
        const linterna = mesa.pulsoEquipo(e, 'especial');
        if (linterna && fase === 'puerta') usarLinterna(e);
      }

      pensarBots(dt);

      if (reloj <= 0) {
        if (fase === 'puerta') empezarSubasta();
        else if (fase === 'subasta') adjudicar();
        else if (fase === 'reparto') siguiente();
      }

      /* --- Luces --- */
      const eje = ejeActual();
      // El sol viaja con el trastero manteniendo su ángulo: si solo moviera el
      // punto de mira, la luz entraría cada vez más de lado según avanza la
      // fila y el último trastero quedaría a oscuras.
      //
      // Y va casi paralelo a la fachada a propósito: si el sol entrase de
      // frente iluminaría el fondo del trastero y se acabó el juego. Rasante,
      // solo lame el umbral y deja la penumbra donde tiene que estar.
      focoSol.position.set(eje, 1.2, 0.5);
      mundo.luzSol.position.set(eje - 34, 7.5, 7);
      luzUmbral.position.x = eje;
      luzInterior.position.x = eje;
      if (fase !== 'reparto') luzInterior.intensity = Math.max(0, luzInterior.intensity - dt * 40);

      luzLinterna = Math.max(0, luzLinterna - dt * 0.34);
      linterna.intensity = luzLinterna * 130;
      cono.visible = luzLinterna > 0.02;
      if (cono.visible) {
        // El cono se estira desde el foco hasta lo que ilumina.
        const d = linterna.position.distanceTo(linternaMira.position);
        cono.position.copy(linterna.position);
        cono.scale.set(d * 0.32, d, d * 0.32);
        cono.lookAt(linternaMira.position);
        cono.rotateX(-Math.PI / 2);
        cono.material.opacity = luzLinterna * 0.1;
      }

      // El polvo se mueve despacio y solo vive dentro del trastero en juego.
      polvo.position.x = eje;
      polvo.rotation.y = tiempo * 0.02;
      polvo.material.opacity = 0.1 + luzLinterna * 0.42;

      /* --- Pujadores --- */
      for (const p of pujadores) {
        p.alzada += (p.objetivo - p.alzada) * Math.min(1, dt * 9);
        p.salto = Math.max(0, p.salto - dt * 3);
        // La paleta sube girando el brazo hacia atrás desde el hombro.
        p.brazo.rotation.x = -p.alzada * 2.5;
        p.grupo.position.y = Math.sin(p.salto * Math.PI) * 0.09;
        const espera = fase === 'subasta' ? 0.02 : 0.008;
        p.grupo.rotation.y = Math.PI + Math.sin(tiempo * 0.9 + p.iy) * espera * 6;
      }

      encuadre(dt);
      pintarPanel();
      mundo.dibujar();

      const a = mesa.equipos.find((e) => e.slotShell === 0);
      const b = mesa.equipos.find((e) => e.slotShell === 1);
      marcador?.update(a ? a.dinero : 0, b ? b.dinero : 0);
      mesa.finFrame();
    },

    destroy() {
      ambiente.parar();
      musica.parar();
      pantalla?.cerrar();
      mesa?.destruir();
      marcador?.remove();
      tiraHUD?.remove();
      panel.destruir();
      mundo.destruir();
    },
  };
}

/* ---------------- Ambiente sonoro ---------------- */

/**
 * La nave suena: viento sobre el asfalto, el zumbido de los fluorescentes y,
 * cuando arranca la puja, un drone grave que va apretando.
 *
 * Todo sintetizado, como el resto del proyecto — ni un archivo de audio. El
 * viento es un bucle de ruido rosa de tres segundos con los extremos fundidos
 * (sin ese fundido se oye el chasquido del bucle cada vuelta) y un LFO
 * lentísimo abriendo el filtro, que es lo que lo convierte en ráfagas en vez
 * de en un siseo plano.
 *
 * Cuelga del compresor de audio.js, así que el volumen y el silencio del
 * arcade lo afectan igual que a los efectos.
 */
function crearAmbiente(audio) {
  let n = null;                       // nodos, una vez arrancado
  let grillo = 2 + Math.random() * 4;
  let chapa = 9 + Math.random() * 10;

  function arrancar() {
    const ac = audio.ctx;
    if (!ac) return;

    const salida = ac.createGain();
    salida.gain.value = 0.0001;
    salida.connect(audio.comp);

    /* Viento */
    const largo = Math.floor(ac.sampleRate * 3);
    const buf = ac.createBuffer(1, largo, ac.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < largo; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.029;
      b1 = 0.985 * b1 + w * 0.075;
      b2 = 0.950 * b2 + w * 0.300;
      d[i] = (b0 + b1 + b2 + w * 0.02) * 0.55;
    }
    const fundido = Math.floor(ac.sampleRate * 0.3);
    for (let i = 0; i < fundido; i++) {
      const k = i / fundido;
      d[i] *= k;
      d[largo - 1 - i] *= k;
    }
    const viento = ac.createBufferSource();
    viento.buffer = buf;
    viento.loop = true;
    const filtro = ac.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 330;
    filtro.Q.value = 0.7;
    const gViento = ac.createGain();
    gViento.gain.value = 0.5;
    viento.connect(filtro).connect(gViento).connect(salida);
    viento.start();

    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoG = ac.createGain();
    lfoG.gain.value = 180;
    lfo.connect(lfoG).connect(filtro.frequency);
    lfo.start();

    /* Zumbido de los fluorescentes: 100 Hz y tercer armónico, muy tapados. */
    const gHum = ac.createGain();
    gHum.gain.value = 0.05;
    const lpHum = ac.createBiquadFilter();
    lpHum.type = 'lowpass';
    lpHum.frequency.value = 480;
    gHum.connect(lpHum).connect(salida);
    const hums = [[100, 1], [300, 0.3]].map(([f, g]) => {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og).connect(gHum);
      o.start();
      return o;
    });

    /* Drone de tensión: callado hasta que empieza la puja. */
    const gDrone = ac.createGain();
    gDrone.gain.value = 0.0001;
    const lpDrone = ac.createBiquadFilter();
    lpDrone.type = 'lowpass';
    lpDrone.frequency.value = 220;
    gDrone.connect(lpDrone).connect(salida);
    const drones = [55, 82.5].map((f, i) => {
      const o = ac.createOscillator();
      o.type = i ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      o.detune.value = i * 6;
      const og = ac.createGain();
      og.gain.value = i ? 0.35 : 1;
      o.connect(og).connect(gDrone);
      o.start();
      return o;
    });

    n = { ac, salida, gDrone, fuentes: [viento, lfo, ...hums, ...drones] };
  }

  return {
    /**
     * @param {number} dt
     * @param {string} fase
     * @param {number} tension 0..1 — lo caliente que está la puja
     */
    paso(dt, fase, tension = 0) {
      // El arcade desbloquea WebAudio con el primer gesto; hasta entonces no
      // hay contexto que valga y se reintenta en el siguiente fotograma.
      if (!n) { if (audio.ready) arrancar(); return; }

      const t = n.ac.currentTime;
      // Con la sintonía sonando, el ambiente pasa a ser una capa debajo: se
      // nota cuando la música respira, no compite con ella.
      const fondo = fase === 'config' ? 0.35 : 1;
      n.salida.gain.setTargetAtTime(Math.max(0.0001, 0.24 * fondo), t, 0.8);
      const quiere = fase === 'subasta' ? 0.02 + tension * 0.07 : 0.0001;
      n.gDrone.gain.setTargetAtTime(quiere, t, fase === 'subasta' ? 0.5 : 1.4);

      // Sueltos: grillos en los silencios y la chapa quejándose al enfriar.
      grillo -= dt;
      if (grillo <= 0) {
        grillo = (fase === 'subasta' ? 7 : 3) + Math.random() * 6;
        if (fase !== 'subasta') {
          for (let i = 0; i < 3; i++) {
            audio.tone({ freq: 4100 + Math.random() * 500, dur: 0.018, gain: 0.025, type: 'sine', delay: i * 0.055 });
          }
        }
      }
      chapa -= dt;
      if (chapa <= 0) {
        chapa = 14 + Math.random() * 14;
        audio.tone({ freq: 150 + Math.random() * 90, dur: 0.55, gain: 0.035, type: 'sawtooth', sweep: -70 });
        audio.noise({ dur: 0.3, gain: 0.02, filter: 900, q: 4, type: 'bandpass', sweep: -400 });
      }
    },

    parar() {
      if (!n) return;
      const t = n.ac.currentTime;
      n.salida.gain.setTargetAtTime(0.0001, t, 0.12);
      // Se deja morir el fundido antes de cortar: parar en seco chasquea.
      for (const f of n.fuentes) { try { f.stop(t + 0.5); } catch { /* ya parado */ } }
      setTimeout(() => { try { n.salida.disconnect(); } catch { /* ya suelto */ } }, 800);
      n = null;
    },
  };
}

/* ---------------- Estilos ---------------- */

function inyectarEstilos() {
  if (document.getElementById('sub3-css')) return;
  const s = document.createElement('style');
  s.id = 'sub3-css';
  s.textContent = `
    /* Por encima de la barra de tiempo y del pie del panel de tres.js, que
       viven en bottom:44px y bottom:14px. */
    .sub3-tira { position:absolute; left:0; right:0; bottom:78px; z-index:6;
      display:flex; gap:8px; justify-content:center; flex-wrap:wrap; pointer-events:none;
      font-family:var(--font-ui, system-ui); color:#fff; }
    .sub3-eq { min-width:118px; padding:7px 12px; border-radius:10px; font-size:12px;
      background:#0b0d14cc; backdrop-filter:blur(6px);
      border:1px solid #ffffff1f; border-left:4px solid var(--c); }
    .sub3-eq.lider { background:#1a1a24e6; box-shadow:0 0 0 2px var(--c) inset, 0 6px 24px #0009; }
    .sub3-eq.bot { opacity:.8; }
    .sub3-eq b { display:block; font-size:12px; }
    .sub3-din { display:block; font-family:var(--font-display); font-size:17px; }
    .sub3-meta { font-size:10px; opacity:.7; }
    .sub3-meta i { font-style:normal; padding:0 4px; border-radius:4px; background:#ffffff20;
      font-family:var(--font-mono, monospace); }
  `;
  document.head.appendChild(s);
}
