/**
 * mesa3d.js — la mesa, la sala, el público y los jugadores.
 *
 * Todo lo que se ve y no se mueve. Está separado del juego porque son dos
 * trabajos distintos: aquí no hay ni una regla ni un turno, solo geometría.
 *
 * Las MEDIDAS viven en este archivo y las importa todo el mundo —la física
 * necesita saber dónde están las bandas y las troneras—, así que mover una
 * banda aquí la mueve también para el que calcula los rebotes. Es la misma
 * lección de `core/personaje3d.js`: una sola fuente para la anatomía.
 */

import { mat, esfera, caja, cilindro, suelo, sala, gradas, texturaGrano, THREE } from '../../core/tres.js';
import { construirPersonaje3D } from '../../core/personaje3d.js';
import { personajeDe } from '../../core/personaje.js';
import { construirTaco as construirTacoDe } from './tacos.js';

/* ---------------- Medidas ----------------
   Mesa de 2,24 m con bolas de 57 mm, a escala 1 m ≈ 9,82 unidades. */

export const LARGO = 11;              // media longitud del paño
export const ANCHO = 5.5;             // media anchura
export const R = 0.28;                // radio de bola
export const ALTO_MESA = 3;
export const GROSOR_PANO = 0.4;
export const SUPERFICIE = ALTO_MESA + GROSOR_PANO / 2 + R;
export const ALTO_BANDA = 0.42;

const D = Math.SQRT1_2;

/**
 * Las seis troneras. `dx,dz` apunta de la mesa hacia dentro de la garganta,
 * `ancho` es la media boca y `mandibula` el radio de las dos puntas duras
 * entre las que hay que colar la bola.
 */
export const TRONERAS = [
  { x: -LARGO, z: -ANCHO, dx: -D, dz: -D, ancho: 0.80, mandibula: 0.30, esquina: true },
  { x: LARGO, z: -ANCHO, dx: D, dz: -D, ancho: 0.80, mandibula: 0.30, esquina: true },
  { x: -LARGO, z: ANCHO, dx: -D, dz: D, ancho: 0.80, mandibula: 0.30, esquina: true },
  { x: LARGO, z: ANCHO, dx: D, dz: D, ancho: 0.80, mandibula: 0.30, esquina: true },
  { x: 0, z: -ANCHO, dx: 0, dz: -1, ancho: 0.74, mandibula: 0.26, esquina: false },
  { x: 0, z: ANCHO, dx: 0, dz: 1, ancho: 0.74, mandibula: 0.26, esquina: false },
];

export const LIMITES = { minX: -LARGO, maxX: LARGO, minZ: -ANCHO, maxZ: ANCHO };

/** Punto de la cabecera donde se coloca la blanca al sacar. */
export const CABECERA = { x: -LARGO * 0.55, z: 0 };

/* ---------------- Sala ---------------- */

export function construirSala(mundo, tema) {
  sala(mundo, tema.sala);
  suelo(mundo, tema.suelo);

  if (tema.rejilla) {
    /* Rejilla Circuito: dos mallas de líneas a ras de suelo. No es decoración
       gratuita — sin una referencia horizontal, una sala negra con niebla no
       da ninguna sensación de tamaño. */
    const rejilla = new THREE.GridHelper(120, 60, new THREE.Color(tema.neon), new THREE.Color(tema.neon));
    rejilla.material.transparent = true;
    rejilla.material.opacity = 0.16;
    rejilla.position.y = 0.02;
    mundo.escena.add(rejilla);

    const halo = new THREE.GridHelper(120, 12, new THREE.Color(tema.neonSecundario), new THREE.Color(tema.neonSecundario));
    halo.material.transparent = true;
    halo.material.opacity = 0.1;
    halo.position.y = 0.03;
    mundo.escena.add(halo);
  }
}

/* ---------------- Mesa ---------------- */

/**
 * Construye la mesa entera y devuelve las piezas que el juego necesita tocar.
 */
export function construirMesa(mundo, tema) {
  const grupo = new THREE.Group();
  mundo.escena.add(grupo);

  /* --- Paño --- */
  const pano = new THREE.Mesh(
    new THREE.BoxGeometry(LARGO * 2, GROSOR_PANO, ANCHO * 2),
    new THREE.MeshStandardMaterial({
      map: texturaGrano(tema.pano.base, tema.pano.veta, {
        repite: tema.pano.repite, ruido: tema.pano.ruido,
      }),
      roughness: 0.98,
      metalness: 0,
      emissive: tema.neon ? new THREE.Color(tema.pano.veta) : new THREE.Color('#000000'),
      emissiveIntensity: tema.neon ? 0.25 : 0,
    }),
  );
  pano.position.y = ALTO_MESA;
  pano.receiveShadow = true;
  grupo.add(pano);

  /* --- Bandas ---
     Se construyen por tramos, dejando hueco en cada tronera: una banda
     continua taparía las bocas y ninguna bola entraría nunca. */
  const matBanda = mat(tema.pano.veta, { rug: 0.95 });
  const HUECO_ESQ = 1.15;                 // hueco a cada lado de una esquina
  const HUECO_LAT = 1.0;                  // hueco de la tronera central

  const tramosLargos = [
    [-LARGO + HUECO_ESQ, -HUECO_LAT],
    [HUECO_LAT, LARGO - HUECO_ESQ],
  ];
  for (const signo of [-1, 1]) {
    for (const [x0, x1] of tramosLargos) {
      const an = x1 - x0;
      grupo.add(caja(an, ALTO_BANDA, 0.55, matBanda,
        [(x0 + x1) / 2, ALTO_MESA + GROSOR_PANO / 2 + ALTO_BANDA / 2, signo * (ANCHO + 0.275)]));
    }
  }
  for (const signo of [-1, 1]) {
    const fo = (ANCHO - HUECO_ESQ) * 2;
    grupo.add(caja(0.55, ALTO_BANDA, fo, matBanda,
      [signo * (LARGO + 0.275), ALTO_MESA + GROSOR_PANO / 2 + ALTO_BANDA / 2, 0]));
  }

  /* --- Marco de madera --- */
  const madera = mat(tema.madera, { rug: 0.55, met: tema.neon ? 0.4 : 0.05 });
  for (const [an, fo, x, z] of [
    [LARGO * 2 + 2.4, 1.1, 0, -ANCHO - 1.1], [LARGO * 2 + 2.4, 1.1, 0, ANCHO + 1.1],
    [1.1, ANCHO * 2 + 2.4, -LARGO - 1.1, 0], [1.1, ANCHO * 2 + 2.4, LARGO + 1.1, 0],
  ]) {
    const m = caja(an, 0.62, fo, madera, [x, ALTO_MESA + GROSOR_PANO / 2 + 0.31, z]);
    m.castShadow = true;
    grupo.add(m);
  }

  /* --- Rombos de puntería ---
     Son las marcas con las que se calculan las bandas. Que estén es la
     diferencia entre una mesa y una caja verde. */
  const matRombo = mat(tema.rombos, {
    rug: 0.3, met: 0.5,
    emisivo: tema.neon ? tema.rombos : null, brillo: 0.9,
  });
  const yRombo = ALTO_MESA + GROSOR_PANO / 2 + 0.63;
  for (const signo of [-1, 1]) {
    for (let i = 1; i <= 7; i++) {
      if (i === 4) continue;                        // ahí está la tronera central
      const x = -LARGO + (i * LARGO * 2) / 8;
      const rombo = esfera(0.13, matRombo, [x, yRombo, signo * (ANCHO + 1.1)], 8);
      rombo.scale.set(1, 0.45, 1.4);
      grupo.add(rombo);
    }
    for (let i = 1; i <= 3; i++) {
      const z = -ANCHO + (i * ANCHO * 2) / 4;
      const rombo = esfera(0.13, matRombo, [signo * (LARGO + 1.1), yRombo, z], 8);
      rombo.scale.set(1.4, 0.45, 1);
      grupo.add(rombo);
    }
  }

  /* --- Troneras: boca, mandíbulas y red --- */
  const matHueco = mat(tema.tronera, { rug: 1 });
  const matCuero = mat(tema.cuero, { rug: 0.85 });
  for (const t of TRONERAS) {
    // Garganta: un cilindro hundido bajo el paño.
    const boca = cilindro(t.ancho, t.ancho * 0.7, 1.2, matHueco,
      [t.x + t.dx * 0.35, ALTO_MESA - 0.2, t.z + t.dz * 0.35], 22);
    grupo.add(boca);

    // Las dos mandíbulas, visibles: si no se ven, que la bola rebote en ellas
    // parece un fallo del juego en vez de la punta de la madera.
    for (const lado of [-1, 1]) {
      const mx = t.x + -t.dz * lado * t.ancho;
      const mz = t.z + t.dx * lado * t.ancho;
      const punta = cilindro(t.mandibula, t.mandibula, ALTO_BANDA, matCuero,
        [mx, ALTO_MESA + GROSOR_PANO / 2 + ALTO_BANDA / 2, mz], 14);
      punta.castShadow = true;
      grupo.add(punta);
    }
  }

  /* --- Faldón y patas --- */
  grupo.add(caja(LARGO * 2 + 2.4, 1.3, ANCHO * 2 + 2.4, mat(tema.faldon, { rug: 0.7 }),
    [0, ALTO_MESA - 0.85, 0]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pata = caja(1.1, ALTO_MESA - 1.5, 1.1, mat(tema.patas),
      [sx * (LARGO - 0.4), (ALTO_MESA - 1.5) / 2, sz * (ANCHO - 0.3)]);
    pata.castShadow = true;
    grupo.add(pata);
  }

  /* --- Luz --- */
  const foco = new THREE.SpotLight(tema.foco.color, tema.foco.intensidad, 60,
    tema.foco.angulo, tema.foco.penumbra, 1.5);
  foco.position.set(0, ALTO_MESA + tema.foco.alto, 0);
  foco.target.position.set(0, ALTO_MESA, 0);
  foco.castShadow = true;
  foco.shadow.mapSize.set(1024, 1024);
  foco.shadow.bias = -0.0015;
  mundo.escena.add(foco, foco.target);

  if (tema.lampara) {
    // La pantalla no proyecta sombra: si lo hiciera taparía media mesa con un
    // óvalo negro justo debajo del foco.
    const pantalla = cilindro(3.2, 1.5, 1.4, mat(tema.lampara, { rug: 0.6 }),
      [0, ALTO_MESA + tema.foco.alto + 0.5, 0]);
    pantalla.castShadow = false;
    grupo.add(pantalla);
    const bombilla = esfera(0.4, mat('#fff3d4', { emisivo: '#fff3d4', brillo: 2 }),
      [0, ALTO_MESA + tema.foco.alto - 0.2, 0], 12);
    // Tampoco la bombilla: queda por DEBAJO del foco, así que proyectaba su
    // propia silueta y dejaba un octágono oscuro en mitad del paño.
    bombilla.castShadow = false;
    grupo.add(bombilla);
  }

  if (tema.neon) {
    /* Tiras de neón por el borde: son las que hacen que la mesa se lea en una
       sala casi negra, donde el foco por sí solo no llega. */
    const tira = (an, fo, x, z, color) => {
      const m = caja(an, 0.1, fo, mat(color, { emisivo: color, brillo: 2.4, rug: 0.4 }),
        [x, ALTO_MESA + GROSOR_PANO / 2 + 0.64, z]);
      grupo.add(m);
      return m;
    };
    tira(LARGO * 2 + 2.4, 0.14, 0, -ANCHO - 1.62, tema.neon);
    tira(LARGO * 2 + 2.4, 0.14, 0, ANCHO + 1.62, tema.neon);
    tira(0.14, ANCHO * 2 + 2.4, -LARGO - 1.62, 0, tema.neonSecundario);
    tira(0.14, ANCHO * 2 + 2.4, LARGO + 1.62, 0, tema.neonSecundario);

    const luzMesa = new THREE.PointLight(new THREE.Color(tema.neon), 55, 40, 2);
    luzMesa.position.set(0, ALTO_MESA + 2.5, 0);
    mundo.escena.add(luzMesa);
  }

  return { grupo, pano, foco };
}

/* ---------------- Público ---------------- */

/**
 * Gradas alrededor. Devuelve un objeto con `animar(dt, energia)`: la grada se
 * mece despacio y da un respingo cuando entra una bola difícil.
 */
export function construirPublico(mundo, tema) {
  const malla = gradas(mundo, {
    filas: tema.publico.filas,
    porFila: tema.publico.porFila,
    radio: tema.publico.radio,
    alturaBase: 1.5,
  });
  malla.material.roughness = 1;
  if (tema.publico.emisivo) {
    malla.material.emissive = new THREE.Color(tema.publico.emisivo);
    malla.material.emissiveIntensity = 0.25;
  }

  const base = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < malla.count; i++) {
    malla.getMatrixAt(i, m4);
    base.push(m4.elements[13]);
  }

  let jaleo = 0;
  let t = 0;
  return {
    /** `energia` de 0 a 1: cuanto más gorda la jugada, más salta la grada. */
    animar(dt, energia = 0) {
      jaleo = Math.max(jaleo * Math.exp(-dt * 1.6), energia);
      if (jaleo < 0.01) return;
      t += dt;
      for (let i = 0; i < malla.count; i++) {
        malla.getMatrixAt(i, m4);
        const salto = Math.abs(Math.sin(t * 7 + i * 1.7)) * jaleo * 1.4;
        m4.elements[13] = base[i] + salto;
        malla.setMatrixAt(i, m4);
      }
      malla.instanceMatrix.needsUpdate = true;
    },
    malla,
  };
}

/* ---------------- Jugadores ---------------- */

/* El muñeco de core/personaje3d.js mide 32 unidades de alto en su propia
   escala. Aquí hay que escalarlo CONTRA LA MESA, no contra el metro:
   el paño mide 22 × 11 a escala real (2,24 m), pero la mesa solo levanta 3
   unidades del suelo, que serían 30 cm. Es una altura estilizada, y por eso
   convertir 1,75 m a 17,2 unidades daba dos gigantes de seis metros a los
   que solo se les veían las piernas en pantalla.
   Una persona mide unas 2,2 veces la altura de una mesa de billar, así que
   la referencia buena es ALTO_MESA, no el metro. */
const ESCALA_PERSONA = (ALTO_MESA * 2.25) / 32;

/**
 * Planta a los dos jugadores a los lados de la mesa, cada uno con su taco.
 * Son los personajes que cada uno se ha creado en el menú, no dos maniquíes.
 */
export function plantarJugadores(mundo, players, tema, voz = null) {
  const figuras = [];
  for (let i = 0; i < 2; i++) {
    const { grupo, partes } = construirPersonaje3D(personajeDe(players[i], i), players[i].color);
    grupo.scale.setScalar(ESCALA_PERSONA);
    grupo.position.y = 0.42;

    const soporte = new THREE.Group();
    soporte.add(grupo);
    const lado = i === 0 ? -1 : 1;
    soporte.position.set(lado * LARGO * 0.55, 0, -(ANCHO + 3.4));
    soporte.rotation.y = -lado * 0.26;
    mundo.escena.add(soporte);

    const color = new THREE.Color(players[i].color);

    const peana = cilindro(1.5, 1.7, 0.42, mat(tema.neon ? '#08131b' : '#241a14', { rug: 0.8 }),
      [0, 0.21, 0], 24);
    peana.receiveShadow = true;
    soporte.add(peana);
    const aro = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.08, 8, 32),
      mat(players[i].color, { rug: 0.35, emisivo: players[i].color, brillo: 2.2 }),
    );
    aro.rotation.x = Math.PI / 2;
    aro.position.y = 0.44;
    soporte.add(aro);

    /* El taco es SUYO: cuelga del soporte y lo llevan las manos.
       Antes era un palo apoyado que no se movía nunca, así que los dos
       miraban la mesa como quien espera el autobús. */
    const taco = cilindro(0.04, 0.09, 6.2, mat('#c79a5a', { rug: 0.45 }), null, 10);
    taco.castShadow = true;
    soporte.add(taco);

    /* Sin cartel de nombre a propósito: el encuadre corta justo por encima de
       la cabeza. Quién es quién lo dicen el marcador, el aro de la peana y el
       foco, que solo se enciende para el que tira. */

    const foco = new THREE.SpotLight(color, 0, 20, 0.6, 0.7, 1.4);
    foco.position.set(0, 11, 4);
    foco.target = soporte;
    mundo.escena.add(foco);

    if (tema.neon) {
      const luz = new THREE.PointLight(color, 14, 12, 2);
      luz.position.set(0, 4, 1.6);
      soporte.add(luz);
    }

    figuras.push({
      soporte, grupo, partes, taco, aro, foco,
      estado: 'espera', tirando: 0, animo: 0,
      // Valores suavizados: se persiguen en vez de saltar, que es lo que hace
      // que agacharse parezca agacharse y no un corte de montaje.
      s: { inclina: 0, brazo: 0, tacoX: 0.62, tacoY: 2.5, tacoZ: 0.5, tacoRot: 0.34 },
    });
  }

  /* Postura de cada estado. La de apuntar deja el taco horizontal apuntando a
     la mesa y los brazos echados adelante; la de espera lo devuelve al hombro. */
  const POSES = {
    espera: { inclina: 0, brazo: 0.05, tacoX: 0.62, tacoY: 2.5, tacoZ: 0.5, tacoRot: 0.34 },
    apunta: { inclina: 0.5, brazo: -0.95, tacoX: 0.1, tacoY: 1.75, tacoZ: 1.5, tacoRot: 0 },
  };

  let fase = 0;
  const hacia = (a, b, k) => a + (b - a) * k;

  return {
    figuras,

    /** Gesto de tirar: empuja el taco. Lo llama el juego al golpear. */
    tirar(turno) { if (figuras[turno]) figuras[turno].tirando = 1; },

    /** Celebrar o lamentarse: un rebote del cuerpo, con signo. */
    animar_(turno, signo) { if (figuras[turno]) figuras[turno].animo = signo; },

    /** 'espera' mientras ruedan las bolas o no es tu turno; 'apunta' al apuntar. */
    postura(turno, apuntando) {
      figuras.forEach((f, i) => { f.estado = (i === turno && apuntando) ? 'apunta' : 'espera'; });
    },

    animar(dt, turno) {
      fase += dt;
      const k = 1 - Math.exp(-7 * dt);

      figuras.forEach((f, i) => {
        const activo = i === turno;
        const meta = POSES[f.estado];
        f.tirando = Math.max(0, f.tirando - dt * 2.6);
        f.animo *= Math.exp(-dt * 1.8);

        for (const clave of Object.keys(meta)) f.s[clave] = hacia(f.s[clave], meta[clave], k);

        // Empujón del taco en el momento del golpe.
        const empuje = Math.sin(f.tirando * Math.PI);

        f.grupo.position.y = 0.42 + Math.sin(fase * 1.6 + i) * 0.06 + Math.abs(f.animo) * 0.35;
        f.grupo.rotation.x = f.s.inclina + empuje * 0.16;
        f.grupo.rotation.y = activo ? Math.sin(fase * 0.9) * 0.08 : 0;
        f.grupo.rotation.z = f.animo * 0.12;

        // Los brazos van al taco: es lo que hace que lo esté sujetando.
        if (f.partes?.brazos) {
          f.partes.brazos[0].rotation.x = f.s.brazo - empuje * 0.5;
          f.partes.brazos[1].rotation.x = f.s.brazo * 0.75 + empuje * 0.3;
        }
        // Y la cabeza se mueve al hablar: sin boca animada, el cabeceo es lo
        // que delata quién está diciendo algo.
        if (f.partes?.cabeza) {
          const habla = voz ? voz.hablando(i) : 0;
          f.partes.cabeza.rotation.x = Math.sin(fase * 22) * 0.13 * habla;
          f.partes.cabeza.rotation.z = Math.sin(fase * 9) * 0.05 * habla;
        }

        f.taco.position.set(f.s.tacoX, f.s.tacoY, f.s.tacoZ + empuje * 1.3);
        f.taco.rotation.set(f.s.tacoRot === 0 ? Math.PI / 2 - 0.16 : 0, 0, f.s.tacoRot);

        const brillo = activo ? 1.6 + Math.sin(fase * 3) * 0.6 : 0.25;
        f.aro.material.emissiveIntensity = brillo;
        f.foco.intensity = activo ? 60 : 0;
      });
    },
  };
}

/* ---------------- Taco ---------------- */

/**
 * El taco que de verdad golpea. La geometría vive en tacos.js —cada diseño
 * es solo una lista de colores— y aquí únicamente se le da su sitio.
 */
export function construirTaco(mundo, tema, diseño) {
  const taco = construirTacoDe(diseño);
  mundo.escena.add(taco);
  return taco;
}
