/**
 * bolas.js — el aspecto de las bolas.
 *
 * Antes una bola era una esfera de color liso: la 3 y la 5 eran exactamente el
 * mismo objeto rojo y no había forma de seguir cuál acababas de meter. Aquí
 * cada bola lleva su textura pintada a mano en un lienzo: el número en su
 * círculo blanco, la franja de las altas y el barniz.
 *
 * La textura es equirectangular —lo que espera SphereGeometry— así que una
 * banda horizontal del lienzo se convierte en una banda de latitud de la bola.
 * De ahí que la franja de las bolas altas salga sola: es un rectángulo.
 *
 * El número se pinta DOS veces, en longitudes opuestas, como en una bola de
 * verdad: si solo estuviera una vez, media mesa mostraría bolas anónimas.
 */

import { THREE } from '../../core/tres.js';

/* Colores oficiales de la bola americana. Del 1 al 7 son lisas y del 9 al 15
   las mismas con franja, que es justo por lo que el índice se repite. */
const COLOR_NUM = [
  '#f2efe6', // 0 · blanca
  '#f2c318', // 1 amarillo
  '#1552a8', // 2 azul
  '#c8232b', // 3 rojo
  '#5b2d8e', // 4 morado
  '#e8701a', // 5 naranja
  '#1d7a45', // 6 verde
  '#7d2230', // 7 granate
  '#141419', // 8 negra
];

export const DISENOS = [
  {
    id: 'clasico',
    nombre: 'Clásico',
    descripcion: 'Resina pulida de toda la vida',
    material: { rug: 0.09, met: 0.02 },
  },
  {
    id: 'marmol',
    nombre: 'Mármol',
    descripcion: 'Vetas de piedra en cada bola',
    material: { rug: 0.16, met: 0.04 },
    veteado: true,
  },
  {
    id: 'metal',
    nombre: 'Metal',
    descripcion: 'Acero pulido, reflejos duros',
    material: { rug: 0.22, met: 0.92 },
    cepillado: true,
  },
  {
    id: 'neon',
    nombre: 'Neón',
    descripcion: 'Aro luminoso sobre carcasa negra',
    material: { rug: 0.3, met: 0.1 },
    emisivo: 0.85,
    oscura: true,
  },
  {
    id: 'holograma',
    nombre: 'Holograma',
    descripcion: 'Cristal iridiscente, para la mesa de circuito',
    material: { rug: 0.05, met: 0.35, transparente: 0.82 },
    emisivo: 0.5,
    iris: true,
  },
];

export const porId = (id) => DISENOS.find((d) => d.id === id) || DISENOS[0];

/**
 * Diseños de la bola blanca, aparte de los del juego de bolas.
 *
 * No es un capricho: ahora que la blanca lleva efecto de verdad, **saber cómo
 * gira importa**. Una blanca lisa gira sin que se note nada; la de puntos —la
 * de entrenamiento de toda la vida— enseña el giro que le has metido y si
 * llegó a la bola patinando o rodando. Es la que más se juega, y por eso.
 */
export const BLANCAS = [
  { id: 'lisa', nombre: 'Lisa', descripcion: 'Marfil sin marcas' },
  { id: 'puntos', nombre: 'De puntos', descripcion: 'La de entrenamiento: se le ve el efecto', puntos: '#d8302c' },
  { id: 'raya', nombre: 'Con aro', descripcion: 'El aro rojo del billar de bar', aro: '#d8302c' },
  { id: 'corona', nombre: 'Corona', descripcion: 'Seis puntos negros', puntos: '#1a1a20' },
  { id: 'circuito', nombre: 'Circuito', descripcion: 'Rejilla luminosa', rejilla: '#00e5ff' },
];

export const blancaPorId = (id) => BLANCAS.find((b) => b.id === id) || BLANCAS[0];

const LADO = 512;         // ancho del lienzo; el alto es la mitad (equirect.)
const cache = new Map();

function colorBase(n) {
  if (n === 0) return COLOR_NUM[0];
  return COLOR_NUM[n > 8 ? n - 8 : n];
}

/** Ruido de vetas, para mármol y para el cepillado del metal. */
function vetas(g, w, h, color, { lineas = 26, grosor = 3, alfa = 0.16, vertical = false } = {}) {
  g.save();
  g.globalAlpha = alfa;
  g.strokeStyle = color;
  g.lineWidth = grosor;
  for (let i = 0; i < lineas; i++) {
    g.beginPath();
    if (vertical) {
      const x = (i / lineas) * w;
      g.moveTo(x, 0);
      g.lineTo(x, h);
    } else {
      const y = (i / lineas) * h;
      let x = 0;
      g.moveTo(0, y);
      while (x < w) {
        x += w / 12;
        g.lineTo(x, y + Math.sin((x / w) * Math.PI * 4 + i) * h * 0.045);
      }
    }
    g.stroke();
  }
  g.restore();
}

/** El círculo blanco con el número, pintado en las dos longitudes opuestas. */
function numeros(g, w, h, n, { tinta = '#16161c', disco = '#ffffff' } = {}) {
  if (n === 0) return;
  const r = h * 0.27;
  for (const cx of [w * 0.25, w * 0.75]) {
    g.beginPath();
    g.arc(cx, h / 2, r, 0, Math.PI * 2);
    g.fillStyle = disco;
    g.fill();
    g.fillStyle = tinta;
    g.font = `700 ${Math.round(r * 1.25)}px ui-rounded, "SF Pro Rounded", Helvetica, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), cx, h / 2 + r * 0.06);
  }
}

/**
 * Marcas de la bola blanca.
 *
 * Los puntos se reparten por longitud y latitud a propósito: si estuvieran
 * todos en el ecuador, un giro de alto o bajo no movería ninguno y la bola
 * parecería quieta justo cuando más está pasando.
 */
function marcasBlanca(g, w, h, blanca) {
  if (blanca.puntos) {
    g.fillStyle = blanca.puntos;
    const sitios = [
      [0.12, 0.5], [0.37, 0.5], [0.62, 0.5], [0.87, 0.5],
      [0.25, 0.22], [0.75, 0.22], [0.25, 0.78], [0.75, 0.78],
    ];
    for (const [u, v] of sitios) {
      g.beginPath();
      // Los de arriba y abajo se estiran: en una esfera, un círculo cerca del
      // polo ocupa más longitud. Sin corregirlo salen elipses aplastadas.
      const rx = h * 0.075 / Math.max(0.35, Math.sin(v * Math.PI));
      g.ellipse(u * w, v * h, rx, h * 0.075, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (blanca.aro) {
    g.strokeStyle = blanca.aro;
    g.lineWidth = h * 0.075;
    for (const v of [0.3, 0.7]) {
      g.beginPath(); g.moveTo(0, v * h); g.lineTo(w, v * h); g.stroke();
    }
  }
  if (blanca.rejilla) {
    g.strokeStyle = blanca.rejilla;
    g.lineWidth = 2.5;
    g.globalAlpha = 0.85;
    for (let i = 0; i < 12; i++) {
      g.beginPath(); g.moveTo((i / 12) * w, 0); g.lineTo((i / 12) * w, h); g.stroke();
    }
    for (let i = 1; i < 6; i++) {
      g.beginPath(); g.moveTo(0, (i / 6) * h); g.lineTo(w, (i / 6) * h); g.stroke();
    }
    g.globalAlpha = 1;
  }
}

/**
 * Lienzo equirectangular de una bola.
 * @param {number} n  0 blanca · 1-7 lisas · 8 negra · 9-15 con franja
 */
function pintar(n, diseño, blanca) {
  const w = LADO, h = LADO / 2;
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const g = lienzo.getContext('2d');

  const base = colorBase(n);
  const rayada = n > 8;

  /* La blanca no sigue el juego de bolas: tiene catálogo propio. Solo hereda
     el acabado —mate, metálico, iridiscente— del diseño activo. */
  if (n === 0) {
    g.fillStyle = diseño.oscura ? '#e8f6ff' : base;
    g.fillRect(0, 0, w, h);
    if (diseño.iris) {
      const grad = g.createLinearGradient(0, 0, w, 0);
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${(i * 58) % 360} 70% 82%)`);
      g.globalAlpha = 0.55; g.fillStyle = grad; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
    }
    if (diseño.cepillado) vetas(g, w, h, '#ffffff', { lineas: 90, grosor: 1, alfa: 0.12, vertical: true });
    if (diseño.veteado) vetas(g, w, h, '#c9c2b0', { lineas: 20, grosor: 4, alfa: 0.2 });
    marcasBlanca(g, w, h, blanca);
    const brillo = g.createLinearGradient(0, 0, 0, h);
    brillo.addColorStop(0, 'rgba(255,255,255,0.3)');
    brillo.addColorStop(0.35, 'rgba(255,255,255,0)');
    brillo.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = brillo;
    g.fillRect(0, 0, w, h);
    return lienzo;
  }

  if (diseño.oscura) {
    /* Neón: carcasa negra y un aro de luz en el ecuador con el color de la
       bola. La franja de las altas se convierte en un aro doble. */
    g.fillStyle = '#0b0c12';
    g.fillRect(0, 0, w, h);
    g.fillStyle = base;
    const alto = rayada ? h * 0.1 : h * 0.16;
    g.fillRect(0, h / 2 - alto, w, alto * 2);
    if (rayada) {
      g.fillRect(0, h * 0.2, w, h * 0.06);
      g.fillRect(0, h * 0.74, w, h * 0.06);
    }
    numeros(g, w, h, n, { tinta: base, disco: '#0b0c12' });
    g.strokeStyle = base;
    g.lineWidth = 4;
    for (const cx of [w * 0.25, w * 0.75]) {
      g.beginPath(); g.arc(cx, h / 2, h * 0.27, 0, Math.PI * 2); g.stroke();
    }
  } else if (diseño.iris) {
    /* Holograma: degradado iridiscente que recorre el ecuador. */
    const grad = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) {
      grad.addColorStop(i / 6, `hsl(${(i * 58 + n * 24) % 360} 90% 62%)`);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.globalAlpha = 0.35;
    g.fillStyle = '#04121c';
    if (!rayada) g.fillRect(0, 0, w, h);
    else { g.fillRect(0, 0, w, h * 0.28); g.fillRect(0, h * 0.72, w, h * 0.28); }
    g.globalAlpha = 1;
    vetas(g, w, h, '#ffffff', { lineas: 40, grosor: 1, alfa: 0.22, vertical: true });
    numeros(g, w, h, n, { tinta: '#04121c', disco: '#dffbff' });
  } else {
    /* Clásico, mármol y metal comparten construcción y cambian el acabado. */
    if (rayada) {
      g.fillStyle = '#f4f1e8';
      g.fillRect(0, 0, w, h);
      g.fillStyle = base;
      g.fillRect(0, h * 0.28, w, h * 0.44);
    } else {
      g.fillStyle = base;
      g.fillRect(0, 0, w, h);
    }
    if (diseño.veteado) vetas(g, w, h, '#ffffff', { lineas: 22, grosor: 5, alfa: 0.14 });
    if (diseño.veteado) vetas(g, w, h, '#000000', { lineas: 14, grosor: 3, alfa: 0.1 });
    if (diseño.cepillado) vetas(g, w, h, '#ffffff', { lineas: 90, grosor: 1, alfa: 0.1, vertical: true });
    numeros(g, w, h, n);
  }

  /* Barniz: una banda clara arriba insinúa el reflejo del foco. Es falso —el
     reflejo real lo pone la luz— pero da profundidad al color plano incluso
     cuando la bola está en penumbra. */
  if (!diseño.oscura) {
    const brillo = g.createLinearGradient(0, 0, 0, h);
    brillo.addColorStop(0, 'rgba(255,255,255,0.28)');
    brillo.addColorStop(0.35, 'rgba(255,255,255,0)');
    brillo.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = brillo;
    g.fillRect(0, 0, w, h);
  }

  return lienzo;
}

/** Textura de una bola, cacheada por número, diseño y —si es la 0— blanca. */
export function texturaBola(n, diseño, blanca = BLANCAS[0]) {
  const clave = n === 0 ? `${diseño.id}:0:${blanca.id}` : `${diseño.id}:${n}`;
  if (cache.has(clave)) return cache.get(clave);
  const tex = new THREE.CanvasTexture(pintar(n, diseño, blanca));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(clave, tex);
  return tex;
}

/** Material listo para la esfera. */
export function materialBola(n, diseño, acento = null, blanca = BLANCAS[0]) {
  const m = diseño.material;
  const mapa = texturaBola(n, diseño, blanca);
  const opciones = {
    map: mapa,
    roughness: m.rug,
    metalness: m.met,
  };
  if (diseño.emisivo) {
    opciones.emissiveMap = mapa;
    opciones.emissive = new THREE.Color(acento || '#ffffff');
    opciones.emissiveIntensity = diseño.emisivo;
  }
  if (m.transparente) {
    opciones.transparent = true;
    opciones.opacity = m.transparente;
  }
  return new THREE.MeshStandardMaterial(opciones);
}

/** Suelta las texturas de un diseño (al cambiar de juego de bolas). */
export function olvidarTexturas() {
  for (const tex of cache.values()) tex.dispose();
  cache.clear();
}
