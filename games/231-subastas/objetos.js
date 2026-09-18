/**
 * objetos.js — los trastos que hay dentro de un trastero, modelados a mano.
 *
 * Cada modelo se construye con cajas, cilindros y toros: ni un archivo externo,
 * ni una textura de disco. La regla que siguen todos es la misma que en el
 * resto de Realismo: la silueta manda. Un sofá se reconoce por el respaldo y
 * los dos brazos mucho antes que por su color, así que se modela eso y se deja
 * de perseguir el detalle.
 *
 * Cada función devuelve un Group cuyo ORIGEN ESTÁ EN EL SUELO y centrado en
 * planta. Así el juego coloca los objetos sin saber nada de ellos: los pone en
 * su casilla y ya se apoyan solos.
 *
 * `radio` es la media anchura que ocupa en planta y lo usa el reparto de sitios
 * para no encajar un armario donde cabe una cámara de fotos.
 */

import { THREE } from '../../core/tres.js';

/** Malla con sombras puestas: aquí dentro todo proyecta y todo recibe. */
function m(geo, material, pos = null, rot = null) {
  const x = new THREE.Mesh(geo, material);
  x.castShadow = true;
  x.receiveShadow = true;
  if (pos) x.position.set(pos[0], pos[1], pos[2]);
  if (rot) x.rotation.set(rot[0], rot[1], rot[2]);
  return x;
}

const CAJA = (an, al, fo) => new THREE.BoxGeometry(an, al, fo);
const CIL = (r, al, seg = 16) => new THREE.CylinderGeometry(r, r, al, seg);

/* ---------------- Modelos ---------------- */

/**
 * Cada entrada: { radio, alto, hacer(M) } — `M` es la paleta de materiales
 * compartida que monta el juego (ver materiales() abajo).
 */
export const MODELOS = {

  sofa: {
    radio: 1.05, alto: 0.86,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(1.95, 0.34, 0.85), M.tapiceria, [0, 0.38, 0]));
      g.add(m(CAJA(1.95, 0.62, 0.22), M.tapiceria, [0, 0.66, -0.32]));
      for (const s of [-1, 1]) g.add(m(CAJA(0.2, 0.5, 0.85), M.tapiceria, [s * 0.88, 0.5, 0]));
      // Los cojines sueltos son lo que lo aparta de ser una caja con respaldo.
      for (const s of [-1, 1]) g.add(m(CAJA(0.78, 0.14, 0.72), M.tapicera2, [s * 0.44, 0.6, 0.02], [0, s * 0.05, 0]));
      for (const s of [-1, 1]) for (const t of [-1, 1]) g.add(m(CIL(0.05, 0.2, 8), M.maderaOsc, [s * 0.85, 0.11, t * 0.32]));
      return g;
    },
  },

  armario: {
    radio: 0.62, alto: 2.05,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(1.15, 2.0, 0.56), M.madera, [0, 1.0, 0]));
      // Dos hojas insinuadas con una ranura y dos tiradores.
      g.add(m(CAJA(0.02, 1.86, 0.02), M.negro, [0, 1.02, 0.29]));
      for (const s of [-1, 1]) g.add(m(CIL(0.022, 0.16, 8), M.laton, [s * 0.09, 1.05, 0.3], [Math.PI / 2, 0, 0]));
      g.add(m(CAJA(1.22, 0.08, 0.62), M.maderaOsc, [0, 2.02, 0]));
      return g;
    },
  },

  colchon: {
    radio: 0.98, alto: 1.75,
    hacer(M) {
      const g = new THREE.Group();
      // Apoyado en la pared, que es como acaban siempre.
      const c = m(CAJA(1.4, 1.9, 0.24), M.colchon, [0, 0.94, 0.1], [0.14, 0, 0]);
      g.add(c);
      for (let i = 0; i < 3; i++) g.add(m(CAJA(1.3, 0.02, 0.02), M.tela, [0, 0.4 + i * 0.55, 0.24]));
      return g;
    },
  },

  bicicleta: {
    radio: 0.9, alto: 1.05,
    hacer(M) {
      const g = new THREE.Group();
      const rueda = new THREE.TorusGeometry(0.33, 0.045, 8, 22);
      for (const s of [-1, 1]) {
        const r = m(rueda, M.goma, [s * 0.52, 0.33, 0], [0, Math.PI / 2, 0]);
        g.add(r);
        // Radios: dos discos finísimos cruzados leen como radios a esta distancia.
        for (let k = 0; k < 3; k++) {
          g.add(m(CIL(0.012, 0.62, 6), M.metal, [s * 0.52, 0.33, 0], [Math.PI / 2, 0, (k * Math.PI) / 3]));
        }
      }
      const tubo = (x1, y1, x2, y2, r = 0.028) => {
        const dx = x2 - x1, dy = y2 - y1;
        const l = Math.hypot(dx, dy);
        return m(CIL(r, l, 8), M.pinturaAzul, [(x1 + x2) / 2, (y1 + y2) / 2, 0], [0, 0, Math.atan2(dx, dy) * -1]);
      };
      g.add(tubo(-0.52, 0.33, 0.05, 0.62));
      g.add(tubo(0.05, 0.62, 0.52, 0.33));
      g.add(tubo(-0.52, 0.33, -0.1, 0.28));
      g.add(tubo(-0.1, 0.28, 0.05, 0.62));
      g.add(tubo(0.05, 0.62, 0.02, 0.92, 0.022));
      g.add(m(CIL(0.02, 0.42, 8), M.metal, [0.02, 0.94, 0], [Math.PI / 2, 0, 0]));  // manillar
      g.add(m(CAJA(0.24, 0.06, 0.13), M.negro, [-0.28, 0.72, 0]));                  // sillín
      return g;
    },
  },

  nevera: {
    radio: 0.42, alto: 1.6,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.72, 1.55, 0.68), M.esmalte, [0, 0.78, 0]));
      g.add(m(CAJA(0.74, 0.03, 0.7), M.negro, [0, 1.06, 0]));      // junta congelador
      g.add(m(CAJA(0.04, 0.34, 0.04), M.metal, [0.3, 1.3, 0.35]));
      g.add(m(CAJA(0.04, 0.6, 0.04), M.metal, [0.3, 0.68, 0.35]));
      return g;
    },
  },

  cajasRopa: {
    radio: 0.55, alto: 1.15,
    hacer(M) {
      const g = new THREE.Group();
      const alturas = [0.42, 0.36, 0.3];
      let y = 0;
      alturas.forEach((h, i) => {
        const an = 0.86 - i * 0.08;
        g.add(m(CAJA(an, h, an * 0.8), M.carton, [i * 0.05 - 0.05, y + h / 2, i * 0.04], [0, i * 0.14, 0]));
        // Cinta de embalar: una tira clara por el centro de la tapa.
        g.add(m(CAJA(an * 0.22, 0.006, an * 0.82), M.cinta, [i * 0.05 - 0.05, y + h + 0.004, i * 0.04], [0, i * 0.14, 0]));
        y += h;
      });
      return g;
    },
  },

  herramientas: {
    radio: 0.36, alto: 0.5,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.62, 0.26, 0.32), M.pinturaRoja, [0, 0.13, 0]));
      g.add(m(CAJA(0.64, 0.05, 0.34), M.negro, [0, 0.28, 0]));
      g.add(m(CIL(0.018, 0.34, 8), M.metal, [0, 0.44, 0], [0, 0, Math.PI / 2]));
      for (const s of [-1, 1]) g.add(m(CAJA(0.03, 0.14, 0.03), M.metal, [s * 0.16, 0.36, 0]));
      // Un par de llaves asomando: el detalle que dice "esto pesa".
      g.add(m(CAJA(0.05, 0.02, 0.28), M.metal, [0.2, 0.31, 0.1], [0, 0.3, 0]));
      return g;
    },
  },

  consola: {
    radio: 0.32, alto: 0.34,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.5, 0.1, 0.36), M.plastico, [0, 0.05, 0]));
      g.add(m(CAJA(0.3, 0.03, 0.22), M.negro, [0, 0.11, -0.03]));
      g.add(m(CAJA(0.16, 0.05, 0.1), M.plastico, [0.24, 0.15, 0.16], [0, 0.4, 0]));   // mando
      // El cable, hecho con un toro aplastado, es lo que lo identifica al vuelo.
      const cable = m(new THREE.TorusGeometry(0.14, 0.012, 6, 18), M.negro, [0.14, 0.012, 0.12], [Math.PI / 2, 0, 0]);
      cable.scale.set(1, 0.6, 1);
      g.add(cable);
      return g;
    },
  },

  vinilos: {
    radio: 0.34, alto: 0.5,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.58, 0.4, 0.42), M.maderaOsc, [0, 0.2, 0]));
      const fundas = [M.pinturaRoja, M.pinturaAzul, M.carton, M.negro, M.laton];
      for (let i = 0; i < 9; i++) {
        g.add(m(CAJA(0.5, 0.34, 0.008), fundas[i % fundas.length],
          [0, 0.24, -0.17 + i * 0.04], [0.06, 0, 0]));
      }
      return g;
    },
  },

  camara: {
    radio: 0.2, alto: 0.28,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.26, 0.17, 0.14), M.cuero, [0, 0.085, 0]));
      g.add(m(CIL(0.06, 0.1, 14), M.metal, [0, 0.1, 0.1], [Math.PI / 2, 0, 0]));
      g.add(m(CIL(0.045, 0.02, 14), M.cristal, [0, 0.1, 0.16], [Math.PI / 2, 0, 0]));
      g.add(m(CIL(0.03, 0.04, 10), M.metal, [-0.08, 0.19, 0]));
      return g;
    },
  },

  cuadro: {
    radio: 0.5, alto: 1.0,
    hacer(M) {
      const g = new THREE.Group();
      const marco = new THREE.Group();
      marco.add(m(CAJA(0.86, 0.98, 0.05), M.laton, [0, 0, 0]));
      marco.add(m(CAJA(0.72, 0.84, 0.02), M.lienzo, [0, 0, 0.032]));
      // Cuatro brochazos: basta para que no parezca un espejo.
      for (let i = 0; i < 4; i++) {
        marco.add(m(CAJA(0.4 - i * 0.06, 0.05, 0.004), i % 2 ? M.pinturaAzul : M.pinturaRoja,
          [(i % 2 ? 0.08 : -0.06), 0.24 - i * 0.16, 0.045], [0, 0, (i - 1.5) * 0.2]));
      }
      marco.position.y = 0.5;
      marco.rotation.x = 0.13;
      g.add(marco);
      return g;
    },
  },

  moneda: {
    radio: 0.16, alto: 0.2,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.24, 0.05, 0.24), M.maderaOsc, [0, 0.025, 0]));
      g.add(m(CAJA(0.2, 0.14, 0.02), M.cristal, [0, 0.12, 0]));
      const c = m(CIL(0.055, 0.008, 24), M.oro, [0, 0.11, 0], [Math.PI / 2, 0, 0]);
      g.add(c);
      return g;
    },
  },

  reloj: {
    radio: 0.16, alto: 0.14,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CIL(0.075, 0.022, 20), M.oro, [0, 0.035, 0], [Math.PI / 2, 0, 0]));
      g.add(m(CIL(0.062, 0.004, 20), M.lienzo, [0, 0.035, 0.013], [Math.PI / 2, 0, 0]));
      g.add(m(CIL(0.018, 0.02, 10), M.oro, [0, 0.035, -0.085]));
      // La cadena: eslabones sueltos cayendo del asa.
      for (let i = 0; i < 7; i++) {
        g.add(m(new THREE.TorusGeometry(0.016, 0.005, 5, 8), M.oro,
          [0.02 + i * 0.03, 0.012, -0.1 - i * 0.012], [Math.PI / 2, i * 0.6, 0]));
      }
      return g;
    },
  },

  guitarra: {
    radio: 0.42, alto: 1.15,
    hacer(M) {
      const g = new THREE.Group();
      const cuerpo = new THREE.Group();
      // La caja: dos cilindros aplastados de distinto radio dan la cintura.
      const bajo = m(CIL(0.24, 0.11, 22), M.maderaMiel, [0, -0.16, 0], [Math.PI / 2, 0, 0]);
      const alto = m(CIL(0.19, 0.11, 22), M.maderaMiel, [0, 0.15, 0], [Math.PI / 2, 0, 0]);
      cuerpo.add(bajo, alto);
      cuerpo.add(m(CIL(0.055, 0.115, 16), M.negro, [0, 0.06, 0], [Math.PI / 2, 0, 0]));  // boca
      cuerpo.add(m(CAJA(0.055, 0.62, 0.05), M.maderaOsc, [0, 0.62, 0.03]));              // mástil
      cuerpo.add(m(CAJA(0.075, 0.14, 0.04), M.maderaOsc, [0, 0.98, 0.03]));              // pala
      for (let i = 0; i < 5; i++) {
        cuerpo.add(m(CAJA(0.004, 0.9, 0.004), M.metal, [-0.016 + i * 0.008, 0.45, 0.06]));
      }
      cuerpo.position.y = 0.42;
      cuerpo.rotation.set(0.1, 0.25, 0.06);
      g.add(cuerpo);
      return g;
    },
  },

  cajaFotos: {
    radio: 0.26, alto: 0.24,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.42, 0.2, 0.32), M.carton, [0, 0.1, 0]));
      g.add(m(CAJA(0.44, 0.03, 0.34), M.cinta, [0, 0.21, 0]));
      for (let i = 0; i < 3; i++) {
        g.add(m(CAJA(0.1, 0.002, 0.14), M.lienzo, [-0.1 + i * 0.1, 0.23, 0.02], [0, i * 0.5, 0]));
      }
      return g;
    },
  },

  neumaticos: {
    radio: 0.42, alto: 0.66,
    hacer(M) {
      const g = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const t = m(new THREE.TorusGeometry(0.3, 0.12, 8, 20), M.goma,
          [i * 0.03, 0.12 + i * 0.2, i * 0.02], [Math.PI / 2, 0, i * 0.5]);
        g.add(t);
      }
      return g;
    },
  },

  chatarra: {
    radio: 0.55, alto: 0.6,
    hacer(M, rnd) {
      const g = new THREE.Group();
      // Un montón desordenado: doce trozos con tamaño, sitio y giro al azar.
      for (let i = 0; i < 12; i++) {
        const s = 0.12 + rnd() * 0.26;
        const pieza = m(CAJA(s, s * (0.2 + rnd() * 0.5), s * (0.4 + rnd())),
          i % 3 === 0 ? M.oxido : M.metal,
          [(rnd() - 0.5) * 0.8, 0.06 + rnd() * 0.42, (rnd() - 0.5) * 0.7],
          [rnd() * 3, rnd() * 3, rnd() * 3]);
        g.add(pieza);
      }
      return g;
    },
  },

  mojado: {
    radio: 0.6, alto: 0.55,
    hacer(M, rnd) {
      const g = new THREE.Group();
      // Cajas reventadas por el agua: se hunden y se abren por abajo.
      for (let i = 0; i < 5; i++) {
        const an = 0.35 + rnd() * 0.3;
        g.add(m(CAJA(an, 0.16 + rnd() * 0.14, an * 0.8), M.cartonMojado,
          [(rnd() - 0.5) * 0.75, 0.09 + i * 0.09, (rnd() - 0.5) * 0.6],
          [(rnd() - 0.5) * 0.3, rnd() * 3, (rnd() - 0.5) * 0.3]));
      }
      g.add(m(new THREE.CircleGeometry(0.55, 20), M.charco, [0, 0.006, 0], [-Math.PI / 2, 0, 0]));
      return g;
    },
  },

  microondas: {
    radio: 0.32, alto: 0.32,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.56, 0.3, 0.4), M.esmalte, [0, 0.15, 0]));
      g.add(m(CAJA(0.36, 0.22, 0.02), M.negro, [-0.08, 0.15, 0.21]));       // puerta
      g.add(m(CAJA(0.3, 0.17, 0.01), M.cristalOscuro, [-0.08, 0.15, 0.225]));
      g.add(m(CAJA(0.13, 0.24, 0.02), M.plastico, [0.19, 0.15, 0.21]));     // panel
      for (let i = 0; i < 3; i++) {
        g.add(m(CAJA(0.07, 0.02, 0.005), M.negro, [0.19, 0.21 - i * 0.05, 0.225]));
      }
      g.add(m(CIL(0.012, 0.2, 8), M.metal, [0.06, 0.15, 0.22]));            // tirador
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        g.add(m(CAJA(0.04, 0.02, 0.04), M.negro, [s * 0.24, 0.01, t * 0.16]));
      }
      return g;
    },
  },

  television: {
    radio: 0.36, alto: 0.52,
    hacer(M) {
      const g = new THREE.Group();
      // Carcasa de tele de tubo: se estrecha hacia atrás, y ese perfil es lo
      // que la separa de una caja cualquiera.
      const caja = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.48, 0.5), M.plasticoCrema,
      );
      caja.castShadow = true;
      caja.receiveShadow = true;
      caja.position.y = 0.24;
      caja.scale.z = 1;
      g.add(caja);
      const trasera = m(CAJA(0.44, 0.34, 0.14), M.plasticoCrema, [0, 0.24, -0.3]);
      trasera.scale.set(0.8, 0.8, 1);
      g.add(trasera);
      // Pantalla ligeramente abombada.
      const p = m(new THREE.SphereGeometry(0.42, 20, 14, 0, Math.PI * 2, 0, 0.42),
        M.cristalOscuro, [0, 0.26, 0.25], [Math.PI / 2, 0, 0]);
      p.scale.set(0.55, 1, 0.4);
      g.add(p);
      g.add(m(CAJA(0.1, 0.4, 0.02), M.plastico, [0.26, 0.24, 0.26]));       // mandos
      for (let i = 0; i < 2; i++) g.add(m(CIL(0.035, 0.03, 12), M.negro, [0.26, 0.34 - i * 0.1, 0.28], [Math.PI / 2, 0, 0]));
      g.add(m(CIL(0.008, 0.34, 6), M.metal, [-0.18, 0.62, -0.18], [0.4, 0, 0.35]));  // antena
      g.add(m(CIL(0.008, 0.34, 6), M.metal, [0.18, 0.62, -0.18], [0.4, 0, -0.35]));
      return g;
    },
  },

  tocadiscos: {
    radio: 0.3, alto: 0.24,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.52, 0.11, 0.44), M.maderaOsc, [0, 0.055, 0]));
      g.add(m(CIL(0.19, 0.012, 28), M.negro, [-0.03, 0.117, 0]));           // plato
      g.add(m(CIL(0.18, 0.006, 28), M.vinilo, [-0.03, 0.126, 0]));
      g.add(m(CIL(0.055, 0.007, 16), M.pinturaRoja, [-0.03, 0.13, 0]));     // etiqueta
      g.add(m(CIL(0.008, 0.03, 8), M.metal, [-0.03, 0.14, 0]));
      // Brazo: pivote + tubo + cápsula.
      g.add(m(CIL(0.028, 0.05, 12), M.metal, [0.2, 0.14, -0.14]));
      g.add(m(CIL(0.009, 0.3, 8), M.metal, [0.11, 0.155, -0.03], [0, 0.7, Math.PI / 2]));
      g.add(m(CAJA(0.045, 0.03, 0.03), M.negro, [0.01, 0.145, 0.07], [0, 0.7, 0]));
      g.add(m(CAJA(0.54, 0.02, 0.46), M.cristal, [0, 0.24, -0.16], [-0.55, 0, 0]));  // tapa abierta
      return g;
    },
  },

  cajaFuerte: {
    radio: 0.3, alto: 0.5,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.5, 0.48, 0.42), M.acero, [0, 0.24, 0]));
      g.add(m(CAJA(0.42, 0.4, 0.03), M.aceroOsc, [0, 0.24, 0.215]));        // puerta
      g.add(m(CIL(0.075, 0.04, 20), M.metal, [-0.05, 0.24, 0.235], [Math.PI / 2, 0, 0]));
      g.add(m(CIL(0.055, 0.02, 20), M.negro, [-0.05, 0.24, 0.25], [Math.PI / 2, 0, 0]));
      g.add(m(CAJA(0.012, 0.09, 0.012), M.laton, [-0.05, 0.29, 0.26]));     // aguja del dial
      g.add(m(CIL(0.016, 0.17, 10), M.laton, [0.14, 0.24, 0.245], [0, 0, Math.PI / 2]));
      for (const s of [-1, 1]) for (const t of [-1, 1]) {
        g.add(m(CAJA(0.06, 0.03, 0.06), M.aceroOsc, [s * 0.2, 0.015, t * 0.16]));
      }
      return g;
    },
  },

  maletas: {
    radio: 0.4, alto: 0.5,
    hacer(M, rnd) {
      const g = new THREE.Group();
      const cueros = [M.cuero, M.maletaVerde, M.maletaCrema];
      let y = 0;
      for (let i = 0; i < 3; i++) {
        const an = 0.72 - i * 0.11;
        const al = 0.17 - i * 0.02;
        const fo = an * 0.68;
        const rot = (rnd() - 0.5) * 0.4;
        g.add(m(CAJA(an, al, fo), cueros[i % 3], [(rnd() - 0.5) * 0.06, y + al / 2, (rnd() - 0.5) * 0.05], [0, rot, 0]));
        // Correas y cierre: dos tiras y un herraje por maleta.
        for (const s of [-1, 1]) {
          g.add(m(CAJA(0.05, al + 0.012, fo + 0.012), M.cueroOsc,
            [s * an * 0.25, y + al / 2, 0], [0, rot, 0]));
        }
        g.add(m(CAJA(0.07, 0.035, 0.02), M.laton, [0, y + al / 2, fo / 2 + 0.012], [0, rot, 0]));
        y += al;
      }
      g.add(m(CIL(0.014, 0.16, 8), M.cueroOsc, [0, y + 0.03, 0], [0, 0, Math.PI / 2]));
      return g;
    },
  },

  lampara: {
    radio: 0.26, alto: 1.55,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CIL(0.17, 0.025, 20), M.metal, [0, 0.012, 0]));
      g.add(m(CIL(0.022, 1.35, 10), M.laton, [0, 0.69, 0]));
      // Pantalla troncocónica, del revés como todas.
      const pant = m(new THREE.CylinderGeometry(0.17, 0.25, 0.3, 20, 1, true),
        M.pantalla, [0, 1.4, 0]);
      pant.material.side = THREE.DoubleSide;
      g.add(pant);
      g.add(m(CIL(0.05, 0.09, 12), M.lienzo, [0, 1.36, 0]));                // bombilla
      return g;
    },
  },

  estanteria: {
    radio: 0.5, alto: 1.35,
    hacer(M, rnd) {
      const g = new THREE.Group();
      for (const s of [-1, 1]) g.add(m(CAJA(0.04, 1.3, 0.3), M.madera, [s * 0.44, 0.65, 0]));
      const libros = [M.pinturaRoja, M.pinturaAzul, M.maderaMiel, M.cuero, M.maletaVerde];
      for (let b = 0; b < 4; b++) {
        const y = 0.06 + b * 0.4;
        g.add(m(CAJA(0.92, 0.035, 0.3), M.madera, [0, y, 0]));
        // Los libros: lomos de anchura y altura irregulares, con algún hueco.
        let x = -0.42;
        while (x < 0.4) {
          const an = 0.025 + rnd() * 0.045;
          if (rnd() > 0.12) {
            const al = 0.2 + rnd() * 0.1;
            g.add(m(CAJA(an, al, 0.22), libros[Math.floor(rnd() * libros.length)],
              [x + an / 2, y + 0.018 + al / 2, 0.02], [0, 0, (rnd() - 0.5) * 0.12]));
          }
          x += an + 0.004;
        }
      }
      return g;
    },
  },

  alfombra: {
    radio: 0.3, alto: 1.4,
    hacer(M) {
      const g = new THREE.Group();
      // Enrollada y apoyada en la pared, que es como se guardan siempre.
      const rollo = m(CIL(0.15, 1.35, 18), M.alfombra, [0, 0.72, 0.12], [0.18, 0, 0.1]);
      g.add(rollo);
      g.add(m(CIL(0.152, 0.06, 18), M.alfombraBorde, [0.02, 1.36, 0.24], [0.18, 0, 0.1]));
      g.add(m(CIL(0.152, 0.06, 18), M.alfombraBorde, [-0.02, 0.1, 0.02], [0.18, 0, 0.1]));
      g.add(m(CAJA(0.34, 0.03, 0.03), M.cuerda, [0, 1.0, 0.16], [0, 0, 0.1]));
      g.add(m(CAJA(0.34, 0.03, 0.03), M.cuerda, [0, 0.42, 0.06], [0, 0, 0.1]));
      return g;
    },
  },

  bauljoya: {
    radio: 0.5, alto: 0.62,
    hacer(M) {
      const g = new THREE.Group();
      g.add(m(CAJA(0.92, 0.42, 0.56), M.maderaMiel, [0, 0.21, 0]));
      // Tapa curva: medio cilindro tumbado.
      const tapa = m(new THREE.CylinderGeometry(0.28, 0.28, 0.92, 18, 1, false, 0, Math.PI),
        M.maderaMiel, [0, 0.42, 0], [0, 0, Math.PI / 2]);
      tapa.scale.set(1, 1, 0.62);
      g.add(tapa);
      for (const s of [-1, 1]) g.add(m(CAJA(0.05, 0.46, 0.58), M.laton, [s * 0.3, 0.22, 0]));
      g.add(m(CAJA(0.14, 0.14, 0.05), M.oro, [0, 0.36, 0.29]));
      return g;
    },
  },
};

/* ---------------- Paleta ---------------- */

/**
 * Materiales compartidos por todos los objetos.
 *
 * Se crean una sola vez y se reparten: un trastero con nueve trastos no puede
 * crear treinta materiales cada vez que se abre una puerta, o la partida se va
 * llenando de programas de sombreado que ya no usa nadie.
 */
export function materiales(mat) {
  return {
    tapiceria: mat('#6b5b47', { rug: 0.95 }),
    tapicera2: mat('#7a6a54', { rug: 0.97 }),
    madera: mat('#8a6a44', { rug: 0.8 }),
    maderaOsc: mat('#4d3928', { rug: 0.85 }),
    maderaMiel: mat('#b07c3e', { rug: 0.62 }),
    colchon: mat('#c9c3b4', { rug: 0.98 }),
    tela: mat('#9a9384', { rug: 1 }),
    carton: mat('#a87f52', { rug: 0.95 }),
    cartonMojado: mat('#6a5334', { rug: 1 }),
    cinta: mat('#d8cba8', { rug: 0.7 }),
    goma: mat('#1c1c20', { rug: 0.95 }),
    metal: mat('#b9bec6', { rug: 0.34, met: 0.85 }),
    oxido: mat('#8a4a2a', { rug: 0.92, met: 0.3 }),
    laton: mat('#c9a24a', { rug: 0.35, met: 0.8 }),
    oro: mat('#ffd98a', { rug: 0.2, met: 1, emisivo: '#5a3f10', brillo: 0.35 }),
    esmalte: mat('#e6e8ea', { rug: 0.28, met: 0.1 }),
    plastico: mat('#3c4048', { rug: 0.55 }),
    negro: mat('#141418', { rug: 0.7 }),
    cuero: mat('#3a2c22', { rug: 0.8 }),
    cristal: mat('#9fd8ff', { rug: 0.1, met: 0.2, transparente: 0.55 }),
    lienzo: mat('#ded4bd', { rug: 0.9 }),
    pinturaRoja: mat('#b83a2e', { rug: 0.6 }),
    pinturaAzul: mat('#2f5f9e', { rug: 0.6 }),
    charco: mat('#12161c', { rug: 0.12, met: 0.4 }),

    /* Añadidos para los modelos nuevos */
    cristalOscuro: mat('#0e1418', { rug: 0.12, met: 0.35 }),
    plasticoCrema: mat('#cfc4ab', { rug: 0.62 }),
    vinilo: mat('#17171b', { rug: 0.42 }),
    acero: mat('#5a5f68', { rug: 0.42, met: 0.85 }),
    aceroOsc: mat('#43474f', { rug: 0.4, met: 0.9 }),
    cueroOsc: mat('#2a2018', { rug: 0.85 }),
    maletaVerde: mat('#3d5142', { rug: 0.8 }),
    maletaCrema: mat('#9a8c6e', { rug: 0.82 }),
    // La pantalla de la lámpara lleva un punto de emisivo: una pantalla de tela
    // sin nada dentro se lee como un cubo de cartón.
    pantalla: mat('#e8d9b4', { rug: 0.95, emisivo: '#4a3a1c', brillo: 0.5 }),
    alfombra: mat('#7c3f39', { rug: 1 }),
    alfombraBorde: mat('#c9b489', { rug: 1 }),
    cuerda: mat('#8d7c5c', { rug: 1 }),
  };
}
