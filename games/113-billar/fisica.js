/**
 * fisica.js — física de mesa de billar con efecto.
 *
 * El billar de antes trataba cada bola como un punto con velocidad y una
 * fricción exponencial. Con eso todas las tiradas salen iguales: no hay
 * retroceso, no hay corrida, no hay efecto lateral, y la bola blanca siempre
 * se queda donde choca. Aquí se usa el modelo estándar de billar, que no es
 * mucho más código y cambia el juego entero:
 *
 *   Una bola tiene velocidad `v` y velocidad angular `w`. Lo que decide todo
 *   es la velocidad del PUNTO DE CONTACTO con el paño:
 *
 *       u = v − R · (w × ŷ)
 *
 *   · Si |u| > 0 la bola PATINA. El paño la frena en la dirección de −û con
 *     fricción de deslizamiento, y a la vez ese rozamiento le aplica un par
 *     que va acercando w a la rodadura. Aquí es donde vive el retroceso: si
 *     golpeas bajo, w apunta al revés que v, la bola llega patinando a la
 *     bola objeto y, tras el choque, el giro que le queda la trae de vuelta.
 *   · Cuando u ≈ 0 la bola RUEDA. Deja de patinar y solo la frena la mucho
 *     más suave resistencia a la rodadura.
 *   · El giro sobre el eje vertical (wy) es el efecto lateral. No frena la
 *     bola: se gasta contra el paño y se cobra en las bandas y en los choques.
 *
 * Unidades: la mesa mide 22 × 11 y la bola tiene R = 0,28 — es una mesa real
 * de 2,24 m con bolas de 57 mm a escala 1 m ≈ 9,82 unidades. La gravedad va
 * en esas mismas unidades para que los coeficientes de fricción sean los
 * medidos de verdad sobre paño y no números inventados.
 */

import { THREE } from '../../core/tres.js';

export const UNIDADES_POR_METRO = 9.82;
export const G = 9.81 * UNIDADES_POR_METRO;

/* Coeficientes del paño.
 *
 * El MODELO es el físico —de ahí salen el retroceso, la corrida y el efecto—,
 * pero estos números NO son los medidos, y conviene saber por qué. Con los
 * reales (rodadura 0,010) una bola de saque tarda cuarenta segundos en
 * pararse: está medido en este mismo juego, dando el saque más fuerte y
 * contando. Es correcto —una bola de billar rueda muchísimo— y es injugable,
 * porque el turno no puede resolverse hasta que todo se detiene.
 *
 * Así que la rodadura y el giro van unas seis veces por encima del real. Lo
 * que NO se toca es el deslizamiento: ése es el que reparte el momento entre
 * traslación y giro, y falsearlo se cargaría los golpes con efecto, que es
 * justo lo que se venía a ganar. */
export const PANO = {
  DESLIZA: 0.2,       // μ deslizamiento bola-paño (el real: no se toca)
  RUEDA: 0.075,       // resistencia a la rodadura, escalada para jugar
  GIRA: 0.12,         // el efecto también se agota antes
  UMBRAL: 0.7,        // por debajo de esto la bola se para del todo
};

/* Bandas. La perpendicular pierde bastante más que la paralela: por eso una
   bola que llega muy abierta sale casi rasante en vez de rebotar como una
   pelota de goma. También van por debajo del real, por lo mismo. */
export const BANDA = {
  RESTITUCION: 0.62,   // devuelve de la componente perpendicular
  ROCE: 0.72,          // conserva de la componente paralela
  MORDIDA: 0.55,       // cuánto efecto lateral se convierte en desvío
  AGARRE: 0.45,        // cuánto giro se pierde contra la goma
};

/** Crea una bola con los campos que espera todo lo de abajo. */
export function bola({ x = 0, z = 0, r = 0.28, n = 0, malla = null, y = 0 } = {}) {
  return {
    n,
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    /** Velocidad angular. `y` es el efecto lateral; `x`/`z`, alto y bajo. */
    w: new THREE.Vector3(),
    r,
    masa: 1,
    malla,
    retirada: false,
    quieto: true,
    /** Se pone a true mientras la bola cae por una tronera. */
    cayendo: 0,
  };
}

/**
 * Velocidad del punto de contacto con el paño.
 *
 * `u = v − R (w × ŷ)`, y con ŷ = (0,1,0) el producto vectorial sale
 * `w × ŷ = (−wz, 0, wx)`, de donde u = (vx + R·wz, 0, vz − R·wx).
 */
export function contacto(b, fuera = new THREE.Vector3()) {
  return fuera.set(b.vel.x + b.r * b.w.z, 0, b.vel.z - b.r * b.w.x);
}

const _u = new THREE.Vector3();

/**
 * Un paso de paño para una bola: patinar o rodar, más el desgaste del efecto.
 */
export function pasoPano(b, dt) {
  if (b.retirada || b.quieto) return;

  const u = contacto(b, _u);
  const rapidezU = u.length();

  if (rapidezU > 0.02) {
    /* --- Patinando --- */
    const a = PANO.DESLIZA * G;
    const dv = Math.min(rapidezU, a * dt);
    const ux = u.x / rapidezU, uz = u.z / rapidezU;

    // El rozamiento frena el centro de masas…
    b.vel.x -= ux * dv;
    b.vel.z -= uz * dv;
    // …y le mete un par que empuja el giro hacia la rodadura. Para una esfera
    // maciza el momento de inercia es 2/5·m·R², de ahí el factor 5/(2R).
    const k = (5 / (2 * b.r)) * dv;
    b.w.x += uz * k;
    b.w.z -= ux * k;
  } else {
    /* --- Rodando --- */
    const v = Math.hypot(b.vel.x, b.vel.z);
    if (v > 1e-4) {
      const dv = Math.min(v, PANO.RUEDA * G * dt);
      b.vel.x -= (b.vel.x / v) * dv;
      b.vel.z -= (b.vel.z / v) * dv;
    }
    /* En rodadura pura el giro queda atado a la velocidad. El signo sale de
       imponer u = 0 en la fórmula del contacto:
           vx + R·wz = 0  →  wz = −vx/R
           vz − R·wx = 0  →  wx =  vz/R
       Con los signos al revés —que es como estaba— la bola entra en rodadura
       con el giro invertido, el paso siguiente la ve patinando al doble de
       velocidad y la frena con fricción de deslizamiento sin parar. El
       síntoma era que la blanca se moría antes de llegar a la bola objeto. */
    b.w.x = b.vel.z / b.r;
    b.w.z = -b.vel.x / b.r;
  }

  /* --- Efecto lateral --- */
  // Se gasta contra el paño sin frenar la bola. Es lo que hace que el efecto
  // haya que usarlo pronto: a media mesa ya casi no queda.
  const perdida = (5 * PANO.GIRA * G) / (2 * b.r) * dt;
  const signo = Math.sign(b.w.y);
  b.w.y = Math.abs(b.w.y) > perdida ? b.w.y - signo * perdida : 0;

  b.pos.x += b.vel.x * dt;
  b.pos.z += b.vel.z * dt;

  /* Una bola está parada cuando no se mueve NI SU CENTRO NI SU PUNTO DE
     CONTACTO. Mirar solo el centro fue un error caro: justo después de un
     golpe con retroceso la blanca se queda un instante casi quieta pero
     cargada de giro, y con la prueba antigua se la declaraba parada y se le
     borraba el efecto. El retroceso no llegaba a existir. */
  const uFinal = contacto(b, _u);
  if (Math.hypot(b.vel.x, b.vel.z) < PANO.UMBRAL
      && uFinal.length() < PANO.UMBRAL
      && Math.abs(b.w.y) < 1.5) {
    b.vel.set(0, 0, 0);
    b.w.set(0, 0, 0);
    b.quieto = true;
  }
}

/**
 * Aplica el taco a la blanca.
 *
 * @param {object} b       la blanca
 * @param {number} angulo  dirección del tiro
 * @param {number} v       velocidad de salida
 * @param {object} efecto  {x: −1..1 lateral, y: −1..1 alto/bajo}, en radios
 */
export function golpear(b, angulo, v, efecto = { x: 0, y: 0 }) {
  const dx = Math.cos(angulo), dz = Math.sin(angulo);
  b.vel.set(dx * v, 0, dz * v);
  b.quieto = false;

  // Un golpe descentrado imprime giro. El 5/(2R) sale del mismo momento de
  // inercia de antes: golpear a distancia `d` del centro produce
  // w = 5·v·d / (2·R²), con d medido en radios.
  const k = (5 * v) / (2 * b.r);
  /* Alto/bajo: giro alrededor del eje perpendicular al tiro.
     El signo importa y está medido: la rodadura natural es wz = −vx/R, así
     que golpear ARRIBA (efecto.y > 0) tiene que hacer wz aún más negativo
     para que la blanca corra detrás de la bola. Con el signo contrario
     —que es como estaba— golpear arriba daba retroceso y abajo corrida,
     justo al revés de lo que dice el diagrama en pantalla. */
  b.w.x = dz * efecto.y * k;
  b.w.z = -dx * efecto.y * k;
  // Lateral: giro alrededor de la vertical.
  b.w.y = -efecto.x * k;
}

/**
 * Choque entre dos bolas, con transmisión de efecto.
 *
 * Además del reparto de impulso por la normal —que es lo que ya hacía— aquí
 * se resuelve el rozamiento tangencial del contacto. De ahí salen dos cosas
 * que cualquiera que juegue al billar espera: el «arrastre», que desvía un
 * poco la bola objeto en los cortes finos, y que parte del efecto lateral
 * pase de una bola a la otra con el signo cambiado.
 *
 * @returns {number} velocidad relativa del impacto (0 si no hubo)
 */
const _n = new THREE.Vector3();
const _vr = new THREE.Vector3();
export function chocarBolas(a, b, restitucion = 0.95) {
  _n.subVectors(b.pos, a.pos);
  _n.y = 0;
  const d = _n.length();
  const min = a.r + b.r;
  if (d === 0 || d >= min) return 0;
  _n.divideScalar(d);

  // Separar el solape a partes iguales (misma masa en todas las bolas).
  const solape = (min - d) / 2;
  a.pos.addScaledVector(_n, -solape);
  b.pos.addScaledVector(_n, solape);

  _vr.subVectors(b.vel, a.vel);
  const vn = _vr.x * _n.x + _vr.z * _n.z;
  if (vn > 0) return 0;

  const j = (-(1 + restitucion) * vn) / 2;
  a.vel.x -= j * _n.x; a.vel.z -= j * _n.z;
  b.vel.x += j * _n.x; b.vel.z += j * _n.z;

  /* --- Rozamiento del contacto: arrastre y traspaso de efecto --- */
  const tx = -_n.z, tz = _n.x;                     // tangente
  // Velocidad relativa de las superficies en el punto de contacto: la
  // tangencial de los centros más lo que aporta el giro vertical de cada una.
  const vt = (_vr.x * tx + _vr.z * tz) + (a.w.y * a.r + b.w.y * b.r);
  if (Math.abs(vt) > 1e-3) {
    // Coeficiente de arrastre pequeño y con tope: el rozamiento entre dos
    // bolas pulidas es bajo, y sin tope los cortes finos salían disparados.
    const jt = Math.max(-0.06 * Math.abs(j), Math.min(0.06 * Math.abs(j), -vt * 0.09));
    a.vel.x -= jt * tx; a.vel.z -= jt * tz;
    b.vel.x += jt * tx; b.vel.z += jt * tz;
    // Al rozar, cada bola le pasa a la otra algo de giro con el signo opuesto.
    const traspaso = (5 * jt) / (2 * a.r) * 0.5;
    a.w.y -= traspaso;
    b.w.y -= traspaso;
  }

  a.quieto = b.quieto = false;
  return Math.abs(vn);
}

/**
 * Rebote en banda con efecto.
 *
 * Tres cosas que el rebote plano de antes no hacía:
 *   1. la perpendicular y la paralela pierden distinto, así que el ángulo de
 *      salida no es el de entrada;
 *   2. el efecto lateral «muerde» la goma y desvía la salida — es el recurso
 *      con el que se sale de una bola pegada a banda;
 *   3. el giro de alto/bajo sobrevive al rebote, de modo que una bola con
 *      corrida sigue corriendo después de la banda.
 *
 * @returns {number} fuerza del impacto contra la goma (0 si no la tocó)
 */
export function bandasConEfecto(b, { minX, maxX, minZ, maxZ }) {
  let golpe = 0;
  // nx, nz: normal de la banda tocada, hacia dentro de la mesa.
  let nx = 0, nz = 0;
  if (b.pos.x - b.r < minX) { b.pos.x = minX + b.r; nx = 1; }
  else if (b.pos.x + b.r > maxX) { b.pos.x = maxX - b.r; nx = -1; }
  if (b.pos.z - b.r < minZ) { b.pos.z = minZ + b.r; nz = 1; }
  else if (b.pos.z + b.r > maxZ) { b.pos.z = maxZ - b.r; nz = -1; }
  if (!nx && !nz) return 0;

  const largo = Math.hypot(nx, nz);
  nx /= largo; nz /= largo;
  const tx = -nz, tz = nx;

  const vn = b.vel.x * nx + b.vel.z * nz;
  if (vn >= 0) return 0;                            // ya salía de la banda
  let vt = b.vel.x * tx + b.vel.z * tz;
  golpe = -vn;

  const vnSale = -vn * BANDA.RESTITUCION;
  // El efecto lateral empuja a lo largo de la banda al morder la goma.
  vt = vt * BANDA.ROCE + b.w.y * b.r * BANDA.MORDIDA;
  b.w.y *= -(1 - BANDA.AGARRE);                     // y se invierte, ya gastado

  b.vel.x = nx * vnSale + tx * vt;
  b.vel.z = nz * vnSale + tz * vt;
  b.quieto = false;
  return golpe;
}

/**
 * Troneras con mandíbulas.
 *
 * Antes una tronera era «si el centro de la bola está a menos de X, dentro».
 * Con eso una bola que pasa rasante junto a la boca se cuela por
 * teletransporte aunque en una mesa real hubiera rebotado en la punta de la
 * madera. Aquí cada tronera tiene dos mandíbulas —dos círculos duros en las
 * esquinas de la boca— y una garganta detrás. La bola entra solo si pasa
 * limpia entre las dos; si no, choca con la punta y se queda bailando, que es
 * media gracia del billar.
 *
 * @param {object} t  {x, z, dx, dz: dirección hacia dentro, ancho, r}
 * @returns {'dentro'|'mandibula'|''}
 */
export function tronera(b, t) {
  // Posición relativa en el sistema de la tronera: p = a lo largo de la
  // garganta, l = a lo ancho de la boca.
  const rx = b.pos.x - t.x, rz = b.pos.z - t.z;
  const p = rx * t.dx + rz * t.dz;
  const l = rx * -t.dz + rz * t.dx;

  // Dentro de la garganta y suficientemente centrada: entra.
  if (p > 0 && Math.abs(l) < t.ancho - b.r * 0.55) return 'dentro';

  // Mandíbulas: dos discos en los extremos de la boca.
  for (const lado of [-1, 1]) {
    const mx = t.x + (-t.dz) * lado * t.ancho;
    const mz = t.z + (t.dx) * lado * t.ancho;
    const dx = b.pos.x - mx, dz = b.pos.z - mz;
    const d = Math.hypot(dx, dz);
    const min = b.r + t.mandibula;
    if (d > 1e-4 && d < min) {
      const nx = dx / d, nz = dz / d;
      b.pos.x = mx + nx * min;
      b.pos.z = mz + nz * min;
      const vn = b.vel.x * nx + b.vel.z * nz;
      if (vn < 0) {
        // La madera de la punta devuelve poco: la bola muere ahí.
        b.vel.x -= (1 + 0.5) * vn * nx;
        b.vel.z -= (1 + 0.5) * vn * nz;
        b.vel.multiplyScalar(0.78);
        b.quieto = false;
        return 'mandibula';
      }
    }
  }
  return '';
}

/**
 * ¿La bola está en la boca de esta tronera?
 *
 * Hace falta porque las bandas y las troneras se estorban: la banda devuelve
 * la bola al paño antes de que pueda entrar en la garganta. Mientras una bola
 * está en una boca, esa banda no existe para ella — que es exactamente lo que
 * pasa en una mesa, donde la goma se interrumpe en cada tronera.
 */
export function enBoca(b, t) {
  const rx = b.pos.x - t.x, rz = b.pos.z - t.z;
  const p = rx * t.dx + rz * t.dz;
  const l = rx * -t.dz + rz * t.dx;
  return p > -b.r * 1.6 && Math.abs(l) < t.ancho;
}

/**
 * Cuántos subpasos hacen falta este fotograma.
 *
 * Con un número fijo de subpasos, la bola más rápida del juego avanzaba dos
 * radios por fotograma y podía atravesar a otra sin tocarla. Aquí el número
 * sale de la velocidad real: ninguna bola avanza más de un tercio de su radio
 * por subpaso.
 */
export function subpasos(bolas, dt, { min = 4, max = 48 } = {}) {
  let vmax = 0;
  for (const b of bolas) {
    if (b.retirada) continue;
    const v = Math.hypot(b.vel.x, b.vel.z);
    if (v > vmax) vmax = v;
  }
  const r = bolas[0]?.r || 0.28;
  return Math.max(min, Math.min(max, Math.ceil((vmax * dt) / (r * 0.33))));
}

/** Hace girar la malla según velocidad Y giro: sin esto el efecto no se ve. */
const _eje = new THREE.Vector3();
const _q = new THREE.Quaternion();
export function girarMalla(b, dt) {
  if (!b.malla) return;
  const w = b.w;
  const mod = Math.hypot(w.x, w.y, w.z);
  if (mod < 1e-4) return;
  _eje.set(w.x / mod, w.y / mod, w.z / mod);
  _q.setFromAxisAngle(_eje, mod * dt);
  b.malla.quaternion.premultiply(_q);
}

/** ¿Se ha parado todo? El turno no puede resolverse hasta que sí. */
export function todoQuieto(bolas) {
  return bolas.every((b) => b.retirada || b.quieto);
}
