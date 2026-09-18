/**
 * preview.js — motor de retratos del hub.
 *
 * Un "retrato" es el canvas donde vive la escena de un juego (core/scenes.js):
 * el escenario grande de la cabecera y cada ficha de los rieles son el mismo
 * objeto con distinto tamaño. Aquí no se dibuja ningún juego concreto; solo se
 * resuelve el fondo según la estética, se llama a la escena y se gestiona
 * cuándo hay que animar.
 *
 * La animación es un único requestAnimationFrame compartido por todos los
 * retratos activos. Con ochenta y tres fichas en pantalla, un rAF por ficha
 * fundiría la batería del portátil; con este esquema solo se mueven las que
 * están enfocadas o bajo el ratón, y cuando no queda ninguna el bucle se
 * apaga solo.
 */

import { seeded, TAU } from './math2d.js';
import { sceneFor, rgba, mix } from './scenes.js';

/* ---------------- Semilla estable ---------------- */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Aleatoriedad indexada y estable: `r(3)` devuelve siempre lo mismo para este
 * juego. Las escenas la usan para el "terreno" (paredes, fichas, estrellas),
 * que debe quedarse quieto aunque el fotograma cambie.
 */
function aleatorioEstable(semilla) {
  const cache = new Map();
  return (i) => {
    const k = Math.round(i);
    if (!cache.has(k)) cache.set(k, seeded(semilla + k * 2654435761)());
    return cache.get(k);
  };
}

/* ---------------- Fondo por estética ---------------- */

const FONDOS = {
  neon: (cat) => [mix(cat, '#000000', 0.78), mix(cat, '#05050c', 0.93)],
  oled: () => ['#000000', '#050508'],
  pixel: (cat) => [mix(cat, '#0b0b18', 0.8), mix(cat, '#05050c', 0.92)],
  suave: (cat) => [mix(cat, '#2c2c40', 0.55), mix(cat, '#14142a', 0.78)],
  papel: (cat) => [mix('#f0e3c8', cat, 0.12), mix('#ddcaa4', cat, 0.16)],
  // Realismo: fondo de estudio, más claro arriba que abajo, como una foto de
  // producto. Nada de halo de recreativa: estos juegos son de luz natural.
  real: (cat) => [mix(cat, '#2a2c33', 0.72), mix('#0c0d11', cat, 0.06)],
};

function fondo(c, w, h, cat, estetica, r) {
  const [a, b] = (FONDOS[estetica] || FONDOS.neon)(cat);
  const g = c.createLinearGradient(0, 0, w * 0.6, h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);

  if (estetica === 'papel') {
    // Grano de papel: puntitos de tinta seca, fijos por semilla.
    for (let i = 0; i < 60; i++) {
      c.fillStyle = rgba('#4a3a20', 0.04 + r(i) * 0.05);
      c.beginPath();
      c.arc(r(i * 3) * w, r(i * 3 + 1) * h, 0.5 + r(i * 3 + 2) * 0.9, 0, TAU);
      c.fill();
    }
    return;
  }

  if (estetica === 'pixel') {
    const bloque = Math.max(8, Math.min(w, h) * 0.055);
    c.strokeStyle = rgba('#ffffff', 0.05);
    c.lineWidth = 1;
    c.beginPath();
    for (let x = 0; x < w; x += bloque) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (let y = 0; y < h; y += bloque) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();
    return;
  }

  if (estetica === 'real') {
    // Luz de foco alto y viñeta baja: la ficha se lee como una fotografía, sin
    // líneas de escaneo ni brillo de tubo.
    const foco = c.createRadialGradient(w * 0.34, -h * 0.1, 0, w * 0.34, h * 0.1, Math.max(w, h) * 0.9);
    foco.addColorStop(0, rgba('#ffffff', 0.16));
    foco.addColorStop(0.5, rgba(cat, 0.07));
    foco.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = foco;
    c.fillRect(0, 0, w, h);
    return;
  }

  // Neón, oled y suave comparten el halo superior de "sala de recreativos".
  // El radio se mide sobre el lado largo: en el escenario panorámico un halo
  // atado a la altura dejaría los costados en negro plano.
  const radio = Math.max(w, h) * 0.85;
  const halo = c.createRadialGradient(w * 0.5, -h * 0.25, 0, w * 0.5, -h * 0.25, radio);
  halo.addColorStop(0, rgba(cat, 0.26));
  halo.addColorStop(0.55, rgba(cat, 0.08));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = halo;
  c.fillRect(0, 0, w, h);

  // Líneas de escaneo: textura de recreativa, casi invisible de cerca pero
  // suficiente para que un lienzo grande no se lea como un vacío negro.
  c.save();
  c.globalAlpha = 0.5;
  c.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < h; y += 3) c.fillRect(0, y, w, 1);
  c.restore();
}

/** Viñeta final: hunde los bordes para que el texto de encima se lea. */
function vineta(c, w, h, fuerza) {
  const g = c.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${fuerza})`);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
}

/* ---------------- Bucle compartido ---------------- */

const activos = new Set();
let corriendo = false;
let inicio = 0;

function latido(ahora) {
  if (!activos.size) { corriendo = false; return; }
  const t = (ahora - inicio) / 1000;
  for (const retrato of activos) retrato.dibujar(t + retrato.desfase);
  requestAnimationFrame(latido);
}

function arrancarBucle() {
  if (corriendo) return;
  corriendo = true;
  inicio = performance.now();
  requestAnimationFrame(latido);
}

/* ---------------- Retrato ---------------- */

/**
 * Monta el canvas de un juego dentro de `contenedor`.
 *
 * @param {HTMLElement} contenedor
 * @param {object} game       entrada de games/manifest.js
 * @param {Array}  players    perfiles [p1, p2] (aportan los dos colores)
 * @param {string} colorCat   color de la categoría
 * @param {object} opciones   { vineta: number, escala: number }
 * @returns {{arrancar:Function, parar:Function, redibujar:Function, destruir:Function, canvas:HTMLCanvasElement}}
 */
export function montarRetrato(contenedor, game, players, colorCat, opciones = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'retrato';
  contenedor.appendChild(canvas);

  const fuerzaVineta = opciones.vineta ?? 0.55;
  // Proporción a la que se fuerza la escena. Sin ella, la escena se estira con
  // el contenedor: en el escenario panorámico eso convierte la paleta de Pong
  // en una cápsula de tres dedos de ancho y separa a los dos jugadores medio
  // metro. Con `aspecto`, la escena se dibuja completa y en proporción sana
  // dentro del lienzo, y el fondo sigue cubriéndolo todo.
  const aspecto = opciones.aspecto || 0;

  let juego = game, cat = colorCat;
  let semilla = hash(juego.id);
  let escena = sceneFor(juego);
  let r = aleatorioEstable(semilla);
  // Cada juego arranca su animación en un punto distinto del ciclo: dos fichas
  // vecinas del mismo arquetipo no laten al unísono.
  let desfase = (semilla % 1000) / 100;

  let w = 0, h = 0;

  function medir() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = contenedor.clientWidth || 240;
    h = contenedor.clientHeight || 150;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dibujar(t) {
    if (!w || !h) medir();
    const c = canvas.getContext('2d');
    c.clearRect(0, 0, w, h);
    fondo(c, w, h, cat, juego.estetica, r);

    // Recuadro de la escena: todo el lienzo, o uno en proporción `aspecto`
    // pegado al borde derecho (el texto del escenario vive a la izquierda).
    const ew = aspecto ? Math.min(w, h * aspecto) : w;
    const eh = aspecto ? Math.min(h, w / aspecto) : h;
    const ox = w - ew, oy = (h - eh) / 2;

    // `tinta` es el color de lo estructural (líneas de tablero, renglones,
    // reversos de carta). Sobre el papel crema el blanco desaparece, así que
    // ahí se cambia por tinta sepia y las escenas siguen leyéndose.
    const papel = juego.estetica === 'papel';
    const S = {
      t, cat, r,
      a: players[0].color,
      b: players[1].color,
      estetica: juego.estetica,
      tinta: papel ? '#2b2118' : '#ffffff',
    };
    c.save();
    c.beginPath();
    c.rect(ox, oy, ew, eh);
    c.clip();
    c.translate(ox, oy);
    // Una escena rota no puede dejar un hueco negro en el catálogo.
    try { escena(c, ew, eh, S); } catch (e) { console.error(`escena de ${juego.id}`, e); }
    c.restore();

    if (ew < w) {
      // Funde el borde izquierdo de la escena. El degradado arranca en x=0 y
      // no en el borde del recuadro: si empezara ahí se vería el escalón entre
      // la zona velada y la que no lo está.
      const fin = ox + ew * 0.34;
      const g = c.createLinearGradient(0, 0, fin, 0);
      // Sobre papel crema hace falta más velo: si no, el título blanco del
      // escenario se pierde contra el fondo claro.
      const op = papel ? 0.97 : 0.92;
      g.addColorStop(0, `rgba(4,4,10,${op})`);
      g.addColorStop(ox / fin, `rgba(4,4,10,${op - 0.04})`);
      g.addColorStop(1, 'rgba(4,4,10,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, fin, h);
    }
    vineta(c, w, h, fuerzaVineta);
  }

  const retrato = {
    canvas,
    get desfase() { return desfase; },
    dibujar,
    /** Reaprovecha el canvas para otro juego: el escenario cambia constantemente. */
    cambiar(nuevoJuego, nuevoColor) {
      juego = nuevoJuego;
      cat = nuevoColor;
      semilla = hash(juego.id);
      escena = sceneFor(juego);
      r = aleatorioEstable(semilla);
      desfase = (semilla % 1000) / 100;
      retrato.redibujar();
    },
    arrancar() {
      if (activos.has(retrato)) return;
      activos.add(retrato);
      arrancarBucle();
    },
    parar() {
      activos.delete(retrato);
      // Deja un fotograma limpio en vez de congelar a media animación.
      dibujar(desfase);
    },
    redibujar() {
      medir();
      dibujar(activos.has(retrato) ? (performance.now() - inicio) / 1000 + desfase : desfase);
    },
    destruir() {
      activos.delete(retrato);
      canvas.remove();
    },
  };

  // El primer fotograma espera al layout: antes, el contenedor mide cero.
  requestAnimationFrame(() => retrato.redibujar());
  return retrato;
}
