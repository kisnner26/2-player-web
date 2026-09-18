/**
 * personaje3d.js — el mismo personaje, pero con volumen de verdad.
 *
 * El editor enseña un modelo 3D construido con cajas a partir de los MISMOS
 * rasgos que dibuja el sprite de core/personaje.js. No son dos personajes
 * distintos: la cara del modelo es literalmente la textura del sprite frontal
 * recortada, y los colores salen de las mismas paletas, así que lo que montas
 * girando aquí es lo que luego corre por la partida.
 *
 * Por qué cajas y no un modelo esculpido: el catálogo es de píxeles. Un muñeco
 * voxel conserva esa identidad al pasar a tres dimensiones, se construye con la
 * proporción exacta de la rejilla de 24 × 32, y cuesta unos pocos polígonos —
 * importa, porque esto convive con el resto del menú.
 *
 * ── La regla que gobierna todo este archivo ──
 * Cada pieza se ancla a un BORDE de la anatomía, nunca a un número suelto.
 * Un sombrero se apoya en `C.arriba`; unas gafas se pegan a `C.frente`; los
 * pies terminan en el suelo porque la pierna mide `PIERNA.largo` y arranca en
 * `PIERNA.arriba`. Antes había constantes copiadas a ojo y el resultado era un
 * muñeco descosido: la cabeza flotaba sobre el torso sin cuello, los brazos
 * colgaban un dedo por debajo del hombro, las piernas se quedaban dos unidades
 * por encima de la peana y todos los sombreros levitaban. Si añades una pieza,
 * cuélgala de estas medidas y no volverá a pasar.
 *
 * Three.js vive en vendor/ dentro del repositorio: se descargó una vez y no
 * hace falta `npm install` ni conexión para abrir el proyecto.
 */

import * as THREE from '../vendor/three/three.module.min.js';
import {
  PIELES, PELOS, ROPAS, COMPLEXIONES, CAMISETAS, PANTALONES, CALZADOS,
  PEINADOS, ACCESORIOS, CAPAS, ANATOMIA, normalizar, spriteDe,
} from './personaje.js';

/* ---------------- Anatomía ---------------- */

const { AL, CABEZA, CARA_Y, TORSO_Y, TORSO_H, PIERNA_Y, recorteCara } = ANATOMIA;

/** Altura del sprite (0 arriba) → altura del modelo (0 en el suelo). */
const aY = (ySprite) => AL - ySprite;

/* Los bordes de los que cuelga todo. Se derivan de la rejilla del sprite, así
   que 2D y 3D no pueden separarse aunque se toque la anatomía. */
const C = {                                   // cabeza
  w: CABEZA.w, h: CABEZA.h, d: 9,
  arriba: aY(CABEZA.y),                       // 29
  abajo: aY(CABEZA.y + CABEZA.h),             // 20
  centro: aY(CABEZA.y + CABEZA.h / 2),        // 24.5
  frente: 4.5,                                // z de la cara
  ojos: aY(CARA_Y + 1),                       // altura de la mirada
};
const T = {                                   // torso
  h: TORSO_H, d: 5.2,
  arriba: aY(TORSO_Y),                        // 19
  abajo: aY(TORSO_Y + TORSO_H),               // 10
  centro: aY(TORSO_Y + TORSO_H / 2),          // 14.5
};
const PIERNA = { arriba: aY(PIERNA_Y), largo: aY(PIERNA_Y) };   // 10 → llega a 0
const HOMBRO = T.arriba - 0.2;                // pivote del brazo, dentro del torso
const BRAZO = { largo: 7.4, ancho: 2.6, fondo: 3, mano: 2.4 };

function color(hex) { return new THREE.Color(hex); }

/** Caja con el pivote arriba, para poder rotarla como un miembro. */
function miembro(ancho, alto, fondo, material) {
  const grupo = new THREE.Group();
  const geo = new THREE.BoxGeometry(ancho, alto, fondo);
  // Se baja la geometría media altura: así el grupo gira desde el hombro o la
  // cadera y no desde el centro del brazo, que es lo que hace que andar
  // parezca andar.
  geo.translate(0, -alto / 2, 0);
  const malla = new THREE.Mesh(geo, material);
  malla.castShadow = true;
  grupo.add(malla);
  return grupo;
}

/** Caja suelta colocada por su centro. Atajo, porque aquí hay muchísimas. */
function caja(w, h, d, material, x = 0, y = 0, z = 0, sombra = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = sombra;
  return m;
}

/** Caja apoyada POR ABAJO en `y`. La usan casi todos los accesorios. */
function cajaSobre(w, h, d, material, y, x = 0, z = 0) {
  return caja(w, h, d, material, x, y + h / 2, z);
}

/**
 * Textura de la cara, recortada del sprite frontal.
 *
 * Se reaprovecha el dibujo 2D en vez de repintar los rasgos en 3D: si mañana
 * se añade un peinado o unos ojos nuevos al catálogo, el modelo los hereda sin
 * tocar este archivo. El recorte viene de ANATOMIA —con el margen del contorno
 * ya sumado— y el lienzo guarda la proporción 10 × 9 de la cabeza para que la
 * cara no salga estirada a lo alto.
 */
function texturaCara(rasgos, acento) {
  const sp = spriteDe(rasgos, { acento, vista: 'frente' });
  const escala = 8;
  const lienzo = document.createElement('canvas');
  lienzo.width = recorteCara.w * escala;
  lienzo.height = recorteCara.h * escala;
  const g = lienzo.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(sp, recorteCara.x, recorteCara.y, recorteCara.w, recorteCara.h,
    0, 0, lienzo.width, lienzo.height);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------- Peinados en volumen ----------------
   El corte se lee en la textura de la cara; esto le pone el bulto que la
   textura no puede dar: el alto del casquete, si cae por los lados o por
   detrás, y los remates (moños, coleta, cresta). Todo en unidades de sprite. */

const PELO3D = {
  'Rapado':     { casco: 1.4 },
  'Corto':      { casco: 2.8, patillas: 3 },
  'Flequillo':  { casco: 3.2, patillas: 4 },
  'Melena':     { casco: 3.2, lados: 9, trasero: 10 },
  'Coleta':     { casco: 3.2, trasero: 4, coleta: true },
  'Afro':       { casco: 5.4, esponjado: true },
  'Cresta':     { rapado: true, cresta: true },
  'Rizado':     { casco: 3.6, esponjado: true, patillas: 4 },
  'Recogido':   { casco: 2.8, patillas: 3, mono: 1 },
  'Largo liso': { casco: 3.6, lados: 13, trasero: 14 },
  'Calvo':      null,
  'Dos moños':  { casco: 3, mono: 2 },
};

function construirPelo(nombre, matPelo) {
  const piezas = [];
  const f = PELO3D[nombre];
  if (!f) return piezas;

  // El casquete es más ancho y más profundo que la cabeza para que asome por
  // los lados y por detrás, pero se retrasa lo justo para NO tapar la cara:
  // el flequillo ya está pintado en la textura y taparlo con una caja lisa era
  // exactamente la plancha negra que se veía delante de los ojos.
  const sobresale = 0.7;
  const fondo = C.d + sobresale;
  const zCasco = -(sobresale / 2) - 0.25;     // frente del casquete justo detrás de la cara

  if (f.casco) {
    piezas.push(caja(C.w + sobresale, f.casco, fondo, matPelo,
      0, C.arriba + 0.35 - f.casco / 2, zCasco));
  }
  if (f.rapado) {
    piezas.push(caja(C.w + 0.2, 0.6, C.d + 0.2, matPelo, 0, C.arriba - 0.3, -0.2));
  }

  // Patillas: tiras finas por delante de las orejas.
  if (f.patillas) {
    for (const lado of [-1, 1]) {
      piezas.push(caja(0.7, f.patillas, 3.4, matPelo,
        lado * (C.w / 2 + 0.3), C.arriba - 1.5 - f.patillas / 2, 1.2));
    }
  }
  // Melena por los lados.
  if (f.lados) {
    for (const lado of [-1, 1]) {
      piezas.push(caja(1.1, f.lados, C.d - 0.6, matPelo,
        lado * (C.w / 2 + 0.5), C.arriba - 2 - f.lados / 2, -0.6));
    }
  }
  // Melena por detrás.
  if (f.trasero) {
    piezas.push(caja(C.w + 0.4, f.trasero, 1.4, matPelo,
      0, C.arriba - 2 - f.trasero / 2, -(C.d / 2 + 0.5)));
  }
  if (f.coleta) {
    piezas.push(caja(2.6, 2.2, 2.6, matPelo, 0, C.arriba - 3, -(C.d / 2 + 1.4)));
    const cola = caja(2, 7, 2, matPelo, 0, C.arriba - 7.5, -(C.d / 2 + 2.2));
    cola.rotation.x = -0.25;
    piezas.push(cola);
  }
  if (f.mono) {
    const sitios = f.mono === 2 ? [-1, 1] : [0];
    for (const lado of sitios) {
      piezas.push(caja(3, 3, 3, matPelo,
        lado * (C.w / 2 + 0.6), C.arriba + (f.mono === 2 ? 0.6 : 2), lado === 0 ? -1.5 : -0.5));
    }
  }
  if (f.cresta) {
    piezas.push(caja(2.4, 4.4, C.d + 0.4, matPelo, 0, C.arriba + 1.6, -0.2));
  }
  // Esponjado: cubitos en las esquinas para que afro y rizado no sean un ladrillo.
  if (f.esponjado) {
    const r = (C.w + sobresale) / 2;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      piezas.push(caja(3, 3, 3, matPelo, x * r * 0.8, C.arriba - 1, z * (C.d / 2) * 0.7 + zCasco));
    }
  }
  return piezas;
}

/* ---------------- Accesorios ----------------
   Todos se apoyan en un borde real de la cabeza: `C.arriba` para lo que se
   pone encima, `C.frente` para lo que va sobre la cara, `C.ojos` para la
   altura de la mirada. Ninguno vuelve a flotar. */

function construirAccesorio(nombre, mat, extra) {
  const p = [];
  const matExtra = mat(extra);
  const oro = mat(0xffd166, 0.25, 0.85);

  switch (nombre) {
    case 'Gorra': {
      // Se hunde 2 unidades en la cabeza: un gorro que solo la toca se ve
      // pegado con cinta, uno que la abraza se ve puesto.
      const alto = 3.4;
      p.push(caja(C.w + 0.9, alto, C.d + 0.9, matExtra, 0, C.arriba + 0.6 - alto / 2, -0.2));
      p.push(caja(C.w + 0.9, 0.8, 4.6, matExtra, 0, C.arriba - 2.4, C.d / 2 + 2.1));
      p.push(caja(2, 0.8, 2, mat(extra, 0.5), 0, C.arriba + 0.9, -0.2));   // botón
      break;
    }
    case 'Gorro': {
      const alto = 4.2;
      p.push(caja(C.w + 0.9, alto, C.d + 0.9, matExtra, 0, C.arriba + 1.2 - alto / 2, -0.2));
      p.push(caja(C.w + 1.4, 1.4, C.d + 1.4, mat(extra, 0.95), 0, C.arriba - 1.9, -0.2)); // vuelta
      // El pompón aclara el color del gorro en vez de ser blanco fijo: sobre el
      // panel claro del editor un pompón blanco simplemente no se veía.
      const pompon = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0),
        mat(mezclar(extra, '#ffffff', 0.55), 0.9));
      pompon.position.set(0, C.arriba + 2.2, -0.2);
      pompon.castShadow = true;
      p.push(pompon);
      break;
    }
    case 'Casco': {
      // El domo se queda POR ENCIMA de la altura de los ojos. Bajarlo más
      // tapaba la mirada y el muñeco se quedaba sin cara.
      const matCasco = mat(extra, 0.35, 0.6);
      const abajo = C.ojos + 1.2;
      const alto = C.arriba + 0.6 - abajo;
      p.push(caja(C.w + 1.4, alto, C.d + 1.4, matCasco, 0, abajo + alto / 2, -0.2));
      // Carrilleras: bajan por los lados hasta la altura de la boca.
      for (const lado of [-1, 1]) {
        p.push(caja(1.2, 4.6, C.d - 1, matCasco, lado * (C.w / 2 + 0.9), abajo - 2, -0.4));
      }
      p.push(caja(1.1, 3.4, 0.8, matCasco, 0, abajo - 1.4, C.frente + 0.5));  // nasal
      p.push(caja(1.6, 1.6, C.d + 2, oro, 0, C.arriba + 1.4, -0.2));          // cresta
      break;
    }
    case 'Corona': {
      const aro = new THREE.Mesh(
        new THREE.CylinderGeometry(C.w / 2 + 0.3, C.w / 2 + 0.3, 1.8, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.22, metalness: 0.9, side: THREE.DoubleSide }),
      );
      aro.position.y = C.arriba + 0.5;      // apoyada en la coronilla, no flotando
      p.push(aro);
      // Puntas: lo que la convierte en corona y no en un anillo.
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const punta = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 4), oro);
        punta.position.set(Math.sin(a) * (C.w / 2 + 0.3), C.arriba + 2.5, Math.cos(a) * (C.w / 2 + 0.3));
        p.push(punta);
      }
      p.push(caja(1.4, 1.2, 0.6, mat(0xff4757, 0.3), 0, C.arriba + 0.9, C.w / 2 + 0.5)); // rubí
      break;
    }
    case 'Diadema': {
      const banda = new THREE.Mesh(
        new THREE.CylinderGeometry(C.w / 2 + 0.35, C.w / 2 + 0.35, 0.9, 16, 1, true),
        new THREE.MeshStandardMaterial({ color: extra, roughness: 0.5, side: THREE.DoubleSide }),
      );
      banda.position.y = C.arriba - 1.4;
      p.push(banda);
      for (const lado of [-1, 1]) {
        p.push(caja(2, 1.6, 1.2, matExtra, lado * 1.4, C.arriba + 0.5, -0.6));   // lazo
      }
      break;
    }
    case 'Auriculares': {
      const arco = new THREE.Mesh(new THREE.TorusGeometry(C.w / 2 + 0.7, 0.55, 8, 24, Math.PI), mat(extra, 0.4));
      arco.position.y = C.arriba - 0.3;
      p.push(arco);
      for (const lado of [-1, 1]) {
        p.push(caja(1.4, 3.6, 3.6, mat(extra, 0.4), lado * (C.w / 2 + 0.7), C.ojos, 0));
      }
      break;
    }
    case 'Orejas': {
      for (const lado of [-1, 1]) {
        p.push(cajaSobre(2.8, 3.2, 1.8, matExtra, C.arriba - 0.6, lado * 2.8, -0.4));
        p.push(cajaSobre(1.4, 2, 0.6, mat(0xff8fbf), C.arriba - 0.2, lado * 2.8, 0.5));
      }
      break;
    }
    case 'Cuernos': {
      for (const lado of [-1, 1]) {
        const cuerno = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.4, 7), matExtra);
        cuerno.position.set(lado * 3.4, C.arriba + 1.8, -0.4);
        cuerno.rotation.z = lado * 0.32;
        cuerno.castShadow = true;
        p.push(cuerno);
      }
      break;
    }
    case 'Flor': {
      const cx = C.w / 2 - 0.6, cy = C.arriba - 0.6, cz = 2.2;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        p.push(caja(1.5, 1.5, 0.9, matExtra, cx + Math.cos(a) * 1.1, cy + Math.sin(a) * 1.1, cz));
      }
      p.push(caja(1.1, 1.1, 1.1, oro, cx, cy, cz + 0.3));
      break;
    }
    /* Los tres de la cara van pegados a `C.frente` y a la altura de los ojos.
       Antes no existían en 3D: se veían solo pintados en la textura y el
       muñeco perdía las gafas en cuanto lo girabas un poco. */
    case 'Gafas': {
      const matCristal = new THREE.MeshStandardMaterial({
        color: 0x8fd9ff, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.72,
      });
      const matMontura = mat(0x1a1420, 0.5);
      for (const lado of [-1, 1]) {
        p.push(caja(3.4, 2.8, 0.35, matMontura, lado * 2.3, C.ojos, C.frente + 0.2));
        p.push(caja(2.8, 2.2, 0.2, matCristal, lado * 2.3, C.ojos, C.frente + 0.42));
        p.push(caja(0.4, 0.4, 3.4, matMontura, lado * 4.2, C.ojos + 0.6, C.frente - 1.4)); // patilla
      }
      p.push(caja(1.4, 0.4, 0.3, matMontura, 0, C.ojos, C.frente + 0.2));                  // puente
      break;
    }
    case 'Gafas de sol': {
      const matNegro = mat(0x14101a, 0.25, 0.4);
      p.push(caja(C.w + 0.4, 2.6, 0.5, matNegro, 0, C.ojos, C.frente + 0.25));
      p.push(caja(C.w - 1, 0.5, 0.3, mat(0x5f6779, 0.3), 0, C.ojos + 1.1, C.frente + 0.45));
      for (const lado of [-1, 1]) {
        p.push(caja(0.4, 0.4, 3.4, matNegro, lado * (C.w / 2 + 0.1), C.ojos + 0.5, C.frente - 1.4));
      }
      break;
    }
    case 'Antifaz': {
      // Tres piezas para dejar los ojos al aire, que es lo que hace que se lea
      // como un antifaz y no como una venda.
      p.push(caja(C.w + 0.6, 1.1, 0.5, matExtra, 0, C.ojos + 1.5, C.frente + 0.2));
      p.push(caja(C.w + 0.6, 1.1, 0.5, matExtra, 0, C.ojos - 1.5, C.frente + 0.2));
      p.push(caja(1.6, 3.2, 0.5, matExtra, 0, C.ojos, C.frente + 0.2));
      for (const lado of [-1, 1]) {
        p.push(caja(0.6, 3.2, 0.5, matExtra, lado * (C.w / 2 + 0.1), C.ojos, C.frente + 0.2));
        p.push(caja(0.5, 0.5, C.d, matExtra, lado * (C.w / 2 + 0.2), C.ojos, 0));          // cinta
      }
      break;
    }
    default: break;
  }
  return p;
}

/* ---------------- Ropa de arriba ----------------
   El torso es una caja; lo que cambia de una prenda a otra son los apliques.
   Devuelve también de qué color va el tronco, porque hay prendas (peto,
   tirantes, sin camiseta) en las que se ve la piel. */

function construirPrenda(nombre, anchoTorso, mats, cols) {
  const { matPiel, matArriba, mat } = mats;
  const p = [];
  const w = anchoTorso + 1;
  let matTronco = matArriba;

  const frente = T.d / 2 + 0.06;              // los apliques se despegan un pelo
  const bandaY = (dy) => T.arriba - dy;

  switch (nombre) {
    case 'Rayas':
      for (let i = 1; i < T.h; i += 2) {
        p.push(caja(w + 0.08, 1, T.d + 0.08, mat(cols.arribaOscuro, 0.95), 0, bandaY(i + 0.5), 0, false));
      }
      break;
    case 'Tirantes':
      matTronco = matArriba;
      p.push(caja(w + 0.12, 2, T.d + 0.12, matPiel, 0, bandaY(1), 0, false));
      for (const lado of [-1, 1]) {
        p.push(caja(1.8, 2.4, T.d + 0.14, matArriba, lado * (w / 2 - 1.4), bandaY(1.2), 0, false));
      }
      break;
    case 'Chaqueta':
      matTronco = mat(cols.arribaOscuro, 0.95);
      p.push(caja(1.6, T.h - 0.4, T.d + 0.1, mat(cols.arribaClaro, 0.9), 0, T.centro, 0, false));
      for (const lado of [-1, 1]) {
        p.push(caja(2.4, 3, T.d + 0.12, matArriba, lado * (w / 2 - 1.2), bandaY(1.5), 0, false));  // solapa
      }
      break;
    case 'Sudadera':
      p.push(caja(w - 2, 2.6, 0.8, mat(cols.arribaOscuro, 0.95), 0, bandaY(5.5), frente, false));  // bolsillo
      p.push(caja(w - 1.5, 2.6, 3, mat(cols.arribaOscuro, 0.95), 0, T.arriba + 0.4, -2.4));       // capucha
      break;
    case 'Peto':
      matTronco = matPiel;
      p.push(caja(w - 1, T.h - 2.6, T.d + 0.1, matArriba, 0, T.centro - 1.1, 0, false));
      for (const lado of [-1, 1]) {
        p.push(caja(1.6, 3.2, T.d + 0.14, matArriba, lado * (w / 2 - 1.6), bandaY(1.6), 0, false));
        p.push(caja(0.8, 0.8, 0.5, mat(0xffd166, 0.4, 0.6), lado * 1.8, bandaY(4), frente, false));
      }
      break;
    case 'Armadura': {
      matTronco = mat(0x8b93a8, 0.35, 0.75);
      p.push(caja(w + 0.6, 2, T.d + 0.5, mat(0xc3cad9, 0.3, 0.8), 0, bandaY(1.6), 0));            // gola
      p.push(caja(4.4, 4.4, 0.7, matArriba, 0, T.centro, frente + 0.2, false));                   // emblema
      for (const lado of [-1, 1]) {                                                               // hombreras
        p.push(caja(3.4, 2.4, T.d + 1.2, mat(0x5f6779, 0.35, 0.75), lado * (w / 2 + 0.4), T.arriba - 0.9, 0));
      }
      break;
    }
    case 'Túnica':
      p.push(caja(w + 1.6, 5.5, T.d + 1, matArriba, 0, T.abajo - 1.4, 0));                        // faldón
      p.push(caja(w + 1.7, 1, T.d + 1.1, mat(0xffd166, 0.4, 0.5), 0, bandaY(5.5), 0, false));     // cinturón
      p.push(caja(1.4, T.h - 1, T.d + 0.1, mat(cols.arribaOscuro, 0.95), 0, T.centro, 0, false));
      break;
    case 'Sin camiseta':
      matTronco = matPiel;
      p.push(caja(w - 3, 0.5, 0.3, mat(cols.pielSombra, 0.95), 0, bandaY(3.5), frente, false));
      break;
    case 'Deportiva':
      for (const lado of [-1, 1]) {
        p.push(caja(0.9, T.h, T.d + 0.1, mat(0xffffff, 0.9), lado * (w / 2 - 0.6), T.centro, 0, false));
      }
      p.push(caja(2.4, 2.4, 0.4, mat(0xffffff, 0.9), 0, bandaY(3.5), frente, false));
      break;
    default: break;                            // 'Camiseta': el tronco liso basta
  }
  return { piezas: p, matTronco };
}

/**
 * Construye el muñeco y lo devuelve como grupo suelto.
 *
 * Está separado del visor a propósito: así el mismo personaje que montas en
 * el editor puede plantarse dentro de la escena de un juego —el billar pone
 * a los dos jugadores junto a la mesa— sin arrastrar un segundo renderizador
 * ni una segunda escena. `partes` son los miembros, por si quien lo recibe
 * quiere animarlos.
 *
 * @returns {{grupo: THREE.Group, partes: object}}
 */
export function construirPersonaje3D(rasgosCrudos, acento = '#ff2e88') {
  const muñeco = new THREE.Group();
  const p = normalizar(rasgosCrudos);

  const mat = (c, rug = 0.9, met = 0.05) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: rug, metalness: met });

  const hexPiel = PIELES[p.piel];
  const hexArriba = ROPAS[p.colorArriba];
  const cols = {
    pielSombra: mezclar(hexPiel, '#000000', 0.18),
    arribaOscuro: mezclar(hexArriba, '#000000', 0.28),
    arribaClaro: mezclar(hexArriba, '#ffffff', 0.3),
  };

  const matPiel = mat(hexPiel);
  const matArriba = mat(hexArriba, 0.95);
  const matAbajo = mat(ROPAS[p.colorAbajo], 0.95);
  const matPelo = mat(PELOS[p.colorPelo], 0.95);
  const extra = ROPAS[p.colorExtra];

  const comp = COMPLEXIONES[p.complexion];
  const anchoTorso = 8 + comp.torso * 2;
  const camiseta = CAMISETAS[p.camiseta];
  const pant = PANTALONES[p.pantalon];
  const calz = CALZADOS[p.calzado];
  const mangaLarga = ['Chaqueta', 'Sudadera', 'Túnica', 'Armadura'].includes(camiseta.nombre);

  /* --- Cabeza --- */
  const caraTex = texturaCara(p, acento);
  const matsCabeza = [
    matPiel, matPiel, matPiel, matPiel,
    new THREE.MeshStandardMaterial({ map: caraTex, roughness: 0.9 }),   // +Z, de frente
    matPiel,
  ];
  const cabeza = new THREE.Mesh(new THREE.BoxGeometry(C.w, C.h, C.d), matsCabeza);
  cabeza.position.y = C.centro;
  cabeza.castShadow = true;
  muñeco.add(cabeza);

  // Orejas: el sprite las tiene y sin ellas la cabeza es un ladrillo.
  for (const lado of [-1, 1]) {
    muñeco.add(caja(0.9, 2.2, 2.6, matPiel, lado * (C.w / 2 + 0.3), C.ojos - 0.6, 0));
  }

  /* --- Cuello ---
     No existía: la cabeza flotaba un dedo por encima del torso. Se solapa a
     propósito con los dos para que no quede junta a la vista. */
  muñeco.add(caja(4.2, 2, 4, mat(cols.pielSombra), 0, C.abajo - 0.2, 0));

  /* --- Pelo y accesorio --- */
  for (const pieza of construirPelo(PEINADOS[p.peinado].nombre, matPelo)) muñeco.add(pieza);
  for (const pieza of construirAccesorio(ACCESORIOS[p.accesorio].nombre, mat, extra)) muñeco.add(pieza);

  /* --- Torso --- */
  const prenda = construirPrenda(camiseta.nombre, anchoTorso,
    { matPiel, matArriba, mat }, cols);
  const torso = caja(anchoTorso + 1, T.h, T.d, prenda.matTronco, 0, T.centro, 0);
  muñeco.add(torso);
  for (const pieza of prenda.piezas) muñeco.add(pieza);

  // Banda del color del jugador: la misma señal que lleva el sprite para
  // saber de un vistazo quién es quién dentro de una partida.
  muñeco.add(caja(anchoTorso + 1.2, 1, T.d + 0.2,
    new THREE.MeshStandardMaterial({
      color: color(acento), roughness: 0.5,
      emissive: color(acento), emissiveIntensity: 0.35,
    }), 0, T.abajo + 0.5, 0, false));

  /* --- Brazos ---
     El pivote entra 0.2 dentro del torso: colgados justo del borde dejaban
     un escalón visible en el hombro en cuanto el muñeco andaba. */
  const matBrazo = mangaLarga ? matArriba : matPiel;
  const brazos = [];
  for (const lado of [-1, 1]) {
    const b = miembro(BRAZO.ancho, BRAZO.largo, BRAZO.fondo, matBrazo);
    b.position.set(lado * ((anchoTorso + 1) / 2 + BRAZO.ancho / 2 - 0.2), HOMBRO, 0);
    muñeco.add(b);
    brazos.push(b);
    // Mano siempre de piel, aunque la manga sea larga.
    b.add(caja(BRAZO.ancho + 0.2, BRAZO.mano, BRAZO.fondo + 0.2, matPiel,
      0, -BRAZO.largo - BRAZO.mano / 2 + 0.2, 0));
  }

  /* --- Piernas ---
     Miden `PIERNA.largo`, que es justo la distancia de la cadera al suelo:
     antes medían 8 sobre una caída de 10 y el muñeco levitaba. */
  const piernas = [];
  const anchoPierna = 3.2 + Math.max(0, comp.torso) * 0.6;
  for (const lado of [-1, 1]) {
    const pierna = new THREE.Group();
    pierna.position.set(lado * (anchoPierna / 2 + 0.3), PIERNA.arriba, 0);
    muñeco.add(pierna);
    piernas.push(pierna);

    const L = PIERNA.largo;
    const hPant = pant.falda ? 0 : Math.min(pant.h, L);
    if (hPant > 0) {
      pierna.add(caja(anchoPierna, hPant, 4, matAbajo, 0, -hPant / 2, 0));
      if (pant.roto) {
        pierna.add(caja(anchoPierna + 0.1, 0.8, 4.1,
          mat(mezclar(ROPAS[p.colorAbajo], '#000000', 0.3), 0.95), 0, -hPant + 0.4, 0, false));
      }
    }
    if (L > hPant) pierna.add(caja(anchoPierna, L - hPant, 4, matPiel, 0, -hPant - (L - hPant) / 2, 0));

    if (!calz.ninguno) {
      const hz = calz.alto ? 3.4 : calz.bajo ? 1.4 : 2.2;
      // El pie asoma hacia delante: una bota que es un cubo no parece un pie.
      pierna.add(caja(anchoPierna + 0.8, hz, 5.4, mat(ROPAS[p.colorPies]), 0, -L + hz / 2, 0.7));
    }
  }

  if (pant.falda) {
    const falda = new THREE.Mesh(
      new THREE.CylinderGeometry(anchoTorso / 2 + 0.8, anchoTorso / 2 + 3.4, 4.4, 14),
      matAbajo,
    );
    falda.position.y = T.abajo - 1.2;        // colgada de la cintura, no del aire
    falda.castShadow = true;
    muñeco.add(falda);
  }

  /* --- Espalda --- */
  const capa = CAPAS[p.capa].nombre;
  const traseraTorso = -(T.d / 2);
  if (capa === 'Capa' || capa === 'Capa larga') {
    const largo = capa === 'Capa larga' ? 20 : 13;
    const tela = caja(anchoTorso + 2.4, largo, 0.8,
      new THREE.MeshStandardMaterial({ color: extra, roughness: 1, side: THREE.DoubleSide }),
      0, T.arriba - 0.6 - largo / 2, traseraTorso - 0.5);
    muñeco.add(tela);
    // Broche: sujeta la capa a los hombros en vez de dejarla pegada a la nada.
    muñeco.add(caja(anchoTorso + 2.4, 1.4, T.d + 1.2, mat(extra, 0.8), 0, T.arriba - 0.5, 0));
  } else if (capa === 'Alas') {
    const matAla = new THREE.MeshStandardMaterial({ color: 0xf2f2ff, roughness: 0.8, side: THREE.DoubleSide });
    for (const lado of [-1, 1]) {
      const ala = new THREE.Group();
      ala.position.set(lado * (anchoTorso / 2 - 0.5), T.arriba - 1.5, traseraTorso - 0.4);
      // Tres plumas de largo decreciente: una caja sola no se lee como ala.
      for (let i = 0; i < 3; i++) {
        const largo = 9 - i * 2.2;
        ala.add(caja(2.4, largo, 0.7, matAla, lado * (1.6 + i * 2.1), -largo / 2 + 1 - i * 0.8, -i * 0.5));
      }
      ala.rotation.z = lado * -0.22;
      muñeco.add(ala);
    }
  } else if (capa === 'Mochila') {
    muñeco.add(caja(anchoTorso - 0.5, 6.5, 3.2, mat(extra), 0, T.centro + 0.5, traseraTorso - 1.6));
    muñeco.add(caja(anchoTorso - 2.5, 2, 3.4, mat(mezclar(extra, '#000000', 0.25)),
      0, T.centro - 2.2, traseraTorso - 1.7, false));
    for (const lado of [-1, 1]) {           // correas por delante
      muñeco.add(caja(1, T.h - 2, 0.6, mat(mezclar(extra, '#000000', 0.25)),
        lado * (anchoTorso / 2 - 1.4), T.centro, T.d / 2 + 0.1, false));
    }
  }

  return { grupo: muñeco, partes: { brazos, piernas, cabeza } };
}

/**
 * Crea el visor y devuelve los mandos para gobernarlo.
 *
 * @param {HTMLElement} contenedor
 * @returns {{ actualizar, girar, pose, ajustar, destruir, lienzo }}
 */
export function crearVisor3D(contenedor) {
  const escena = new THREE.Scene();
  escena.background = null;

  const camara = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  const render = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  render.shadowMap.enabled = true;
  render.shadowMap.type = THREE.PCFSoftShadowMap;
  contenedor.appendChild(render.domElement);

  /* Luces: una cenital cálida que hace la sombra, una de relleno por delante
     para que la cara no quede apagada, y ambiente para que ninguna cara quede
     apagada al girar.

     El ambiente es casi neutro a propósito. Con un hemisférico de suelo morado
     y un relleno azul, las caras a contraluz perdían el tono: al girar el
     muñeco el brazo de atrás se volvía gris y parecía de otro color que el de
     delante. Aquí interesa que el color de la piel y de la ropa se reconozca
     desde cualquier ángulo, no un ambiente vistoso. */
  const sol = new THREE.DirectionalLight(0xfff4e6, 1.55);
  sol.position.set(14, 40, 22);
  sol.castShadow = true;
  sol.shadow.mapSize.set(1024, 1024);
  sol.shadow.camera.left = -30;
  sol.shadow.camera.right = 30;
  sol.shadow.camera.top = 50;
  sol.shadow.camera.bottom = -10;
  escena.add(sol);
  escena.add(new THREE.HemisphereLight(0xffffff, 0xc2cedd, 1.25));
  const relleno = new THREE.DirectionalLight(0xf4f8ff, 0.55);
  relleno.position.set(-18, 12, 26);
  escena.add(relleno);

  /* Peana: recibe la sombra del muñeco, que es lo que lo asienta en el suelo. */
  const peana = new THREE.Mesh(
    new THREE.CylinderGeometry(13, 13, 1, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a1630, roughness: 0.85, metalness: 0.1 }),
  );
  peana.position.y = -0.5;
  peana.receiveShadow = true;
  escena.add(peana);

  const aro = new THREE.Mesh(
    new THREE.TorusGeometry(13, 0.35, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xff2e88 }),
  );
  aro.rotation.x = Math.PI / 2;
  aro.position.y = 0.1;
  escena.add(aro);

  const muñeco = new THREE.Group();
  escena.add(muñeco);

  let partes = null;
  let giro = 0;
  let poseActual = 'anda';
  let fase = 0;

  /**
   * Libera la memoria de vídeo del muñeco anterior.
   *
   * El orden importa: antes se llamaba a `clear()` ANTES de recorrer, así que
   * el recorrido no encontraba ya ningún hijo y no se liberaba nada. Cada
   * cambio de rasgo dejaba tiradas todas las geometrías y una textura de cara.
   */
  function limpiar() {
    muñeco.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const materiales = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of materiales) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    muñeco.clear();
  }

  /** Rehace el muñeco del visor con unos rasgos. */
  function actualizar(rasgosCrudos, acento = '#ff2e88') {
    limpiar();
    const hecho = construirPersonaje3D(rasgosCrudos, acento);
    muñeco.add(hecho.grupo);
    aro.material.color = color(acento);
    partes = hecho.partes;
  }

  /* ---------------- Bucle ---------------- */

  let raf = 0;
  let corriendo = true;

  function ajustar() {
    const w = contenedor.clientWidth || 260;
    const h = contenedor.clientHeight || 320;
    render.setSize(w, h, false);
    camara.aspect = w / h;
    camara.updateProjectionMatrix();
  }

  function bucle() {
    if (!corriendo) return;
    raf = requestAnimationFrame(bucle);

    muñeco.rotation.y = (giro * Math.PI) / 180;

    if (partes) {
      // Andar: brazos y piernas en oposición, y un rebote del cuerpo al paso.
      if (poseActual === 'anda') {
        fase += 0.12;
        const sw = Math.sin(fase) * 0.55;
        partes.piernas[0].rotation.x = sw;
        partes.piernas[1].rotation.x = -sw;
        partes.brazos[0].rotation.x = -sw * 0.8;
        partes.brazos[1].rotation.x = sw * 0.8;
        muñeco.position.y = Math.abs(Math.sin(fase)) * 0.5;
      } else if (poseActual === 'salta') {
        partes.piernas[0].rotation.x = -0.7;
        partes.piernas[1].rotation.x = 0.35;
        partes.brazos[0].rotation.x = -2.2;
        partes.brazos[1].rotation.x = -2.2;
        muñeco.position.y = 2.4;
      } else {
        fase += 0.03;
        const respira = Math.sin(fase) * 0.05;
        partes.piernas[0].rotation.x = 0;
        partes.piernas[1].rotation.x = 0;
        partes.brazos[0].rotation.x = respira;
        partes.brazos[1].rotation.x = -respira;
        muñeco.position.y = 0;
      }
    }

    // Encuadre: ligeramente por encima de la cintura y mirando al pecho.
    camara.position.set(0, 21, 60);
    camara.lookAt(0, 13.5, 0);
    render.render(escena, camara);
  }

  ajustar();
  bucle();

  return {
    actualizar,
    girar(grados) { giro = grados; },
    get giro() { return giro; },
    pose(p) { poseActual = p; },
    ajustar,
    lienzo: render.domElement,
    destruir() {
      corriendo = false;
      cancelAnimationFrame(raf);
      limpiar();
      render.dispose();
      render.domElement.remove();
    },
  };
}

/** Mezcla dos colores hexadecimales. Se usa para sombras y luces de la ropa. */
function mezclar(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const m = (desp) => Math.round(((na >> desp) & 255) * (1 - t) + ((nb >> desp) & 255) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}
