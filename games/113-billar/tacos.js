/**
 * tacos.js — el catálogo de tacos.
 *
 * Un taco no es un palo: es flecha, virola, aro, empalme, mango y culata, y
 * cada tramo tiene su material. Construirlo por tramos cuesta seis cilindros
 * en vez de uno y es la diferencia entre «hay un palo apuntando» y «hay un
 * taco». Además da de qué elegir, que es de lo que se trata.
 *
 * Cada diseño describe SOLO colores y acabados; la geometría es la misma para
 * todos y vive en `construir()`. Añadir un taco nuevo son ocho líneas.
 */

import { mat, cilindro, THREE } from '../../core/tres.js';

export const TACOS = [
  {
    id: 'arce',
    nombre: 'Arce',
    descripcion: 'El de la casa: fresno claro y virola azul',
    flecha: { color: '#e3c48d', rug: 0.42, met: 0.02 },
    mango: { color: '#8a5a2b', rug: 0.55, met: 0.02 },
    culata: { color: '#5a3418', rug: 0.5, met: 0.03 },
    aro: { color: '#d8c07a', rug: 0.3, met: 0.8 },
    virola: '#f4efe2',
    suela: '#1e5fa8',
  },
  {
    id: 'ebano',
    nombre: 'Ébano',
    descripcion: 'Negro mate con incrustaciones de nácar',
    flecha: { color: '#efe0c0', rug: 0.38, met: 0.02 },
    mango: { color: '#15131a', rug: 0.42, met: 0.06 },
    culata: { color: '#0c0b10', rug: 0.4, met: 0.08 },
    aro: { color: '#e8e6de', rug: 0.2, met: 0.85 },
    virola: '#ffffff',
    suela: '#2a2730',
    puntas: '#e8e6de',
  },
  {
    id: 'caoba',
    nombre: 'Caoba',
    descripcion: 'Madera roja y anillos de latón',
    flecha: { color: '#dfc292', rug: 0.44, met: 0.02 },
    mango: { color: '#6b2a1c', rug: 0.5, met: 0.04 },
    culata: { color: '#41180f', rug: 0.48, met: 0.05 },
    aro: { color: '#c8922a', rug: 0.22, met: 0.95 },
    virola: '#f6f1e4',
    suela: '#8c1f1f',
    puntas: '#c8922a',
  },
  {
    id: 'carbono',
    nombre: 'Carbono',
    descripcion: 'Fibra tejida, sin brillo y sin perdón',
    flecha: { color: '#3a3f47', rug: 0.55, met: 0.35 },
    mango: { color: '#1b1f26', rug: 0.6, met: 0.4 },
    culata: { color: '#101318', rug: 0.6, met: 0.45 },
    aro: { color: '#8f98a6', rug: 0.25, met: 0.9 },
    virola: '#c9cfd8',
    suela: '#e8434f',
  },
  {
    id: 'hueso',
    nombre: 'Marfil',
    descripcion: 'Blanco roto con hilo dorado',
    flecha: { color: '#f4ecd8', rug: 0.35, met: 0.02 },
    mango: { color: '#e6dcc2', rug: 0.4, met: 0.03 },
    culata: { color: '#cdbf9c', rug: 0.42, met: 0.05 },
    aro: { color: '#d6b45a', rug: 0.2, met: 0.95 },
    virola: '#ffffff',
    suela: '#6b5a3a',
    puntas: '#d6b45a',
  },
  {
    id: 'circuito',
    nombre: 'Circuito',
    descripcion: 'Aleación negra con nervio de luz',
    flecha: { color: '#16222c', rug: 0.3, met: 0.7, emisivo: '#00e5ff', brillo: 0.25 },
    mango: { color: '#0b141c', rug: 0.35, met: 0.75 },
    culata: { color: '#060c12', rug: 0.35, met: 0.8 },
    aro: { color: '#00e5ff', rug: 0.2, met: 0.6, emisivo: '#00e5ff', brillo: 2 },
    virola: '#ff2e88',
    suela: '#ff2e88',
    nervio: '#00e5ff',
  },
];

export const porId = (id) => TACOS.find((t) => t.id === id) || TACOS[0];

const LARGO = 10.4;

/**
 * Construye un taco. Su punta queda en x = 0 y el resto se extiende hacia −x,
 * que es lo que espera el juego para colocarlo detrás de la blanca.
 */
export function construirTaco(d) {
  const g = new THREE.Group();
  const m = (c) => mat(c.color, {
    rug: c.rug, met: c.met,
    emisivo: c.emisivo || null, brillo: c.brillo ?? 0.4,
  });

  /* Tramos, de la punta hacia atrás. El taco se estrecha de la culata a la
     flecha: por eso cada cilindro tiene dos radios distintos. */
  const tramos = [
    { largo: 0.30, r0: 0.070, r1: 0.072, mat: mat(d.virola, { rug: 0.25 }) },      // virola
    { largo: 4.60, r0: 0.072, r1: 0.105, mat: m(d.flecha) },                       // flecha
    { largo: 0.22, r0: 0.108, r1: 0.112, mat: m(d.aro) },                          // aro del empalme
    { largo: 3.60, r0: 0.112, r1: 0.145, mat: m(d.mango) },                        // mango
    { largo: 0.20, r0: 0.148, r1: 0.150, mat: m(d.aro) },                          // aro de la culata
    { largo: 1.30, r0: 0.150, r1: 0.160, mat: m(d.culata) },                       // culata
    { largo: 0.22, r0: 0.162, r1: 0.162, mat: mat(d.suela, { rug: 0.7 }) },        // suela
  ];

  let x = 0;
  for (const t of tramos) {
    const c = cilindro(t.r0, t.r1, t.largo, t.mat, null, 16);
    c.rotation.z = Math.PI / 2;
    c.position.x = -(x + t.largo / 2);
    c.castShadow = true;
    g.add(c);
    x += t.largo;
  }

  /* Puntas del empalme: los rombos claros que separan flecha y mango en los
     tacos buenos. Solo los llevan los diseños que lo declaran. */
  if (d.puntas) {
    const matP = mat(d.puntas, { rug: 0.3, met: 0.4 });
    for (let i = 0; i < 4; i++) {
      const punta = new THREE.Mesh(new THREE.ConeGeometry(0.055, 1.1, 4), matP);
      punta.rotation.z = -Math.PI / 2;
      punta.rotation.x = (i / 4) * Math.PI * 2;
      punta.position.x = -6.0;
      g.add(punta);
    }
  }

  /* Nervio luminoso del taco Circuito: una tira fina que recorre el mango. */
  if (d.nervio) {
    const nervio = cilindro(0.03, 0.03, 5.4, mat(d.nervio, {
      rug: 0.3, emisivo: d.nervio, brillo: 2.6,
    }), null, 8);
    nervio.rotation.z = Math.PI / 2;
    nervio.position.set(-7.1, 0.12, 0);
    g.add(nervio);
  }

  g.userData.largo = LARGO;
  return g;
}
