/**
 * fisica3d.js — la física que comparten los juegos de Realismo.
 *
 * No es un motor: es el puñado de reglas que hacen falta para que una bola de
 * billar, una piedra de curling y un balón de baloncesto se comporten como lo
 * que son. Todo trabaja sobre objetos planos `{ pos, vel, r, masa }` con
 * `pos`/`vel` como THREE.Vector3, para que un juego pueda añadirles los campos
 * que quiera sin heredar de nada.
 *
 * Criterio general: se prefiere el modelo simple y estable al exacto. Un
 * integrador semi-implícito con fricción exponencial no conserva la energía al
 * milímetro, pero nunca explota, y en una partida de tres minutos la
 * diferencia no se ve; una simulación que se descuadra, sí.
 */

import * as THREE from '../vendor/three/three.module.min.js';

export const G = 9.81;

/** Crea un cuerpo con los campos que esperan el resto de funciones. */
export function cuerpo({ x = 0, y = 0, z = 0, r = 0.5, masa = 1, malla = null } = {}) {
  return {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    r, masa,
    malla,
    quieto: false,
    /** Giro acumulado, para hacer rodar la malla. */
    giro: new THREE.Vector3(),
  };
}

/**
 * Un paso de integración con gravedad y arrastre del aire.
 *
 * `arrastre` es la fracción de velocidad que se pierde por segundo; se aplica
 * como decaimiento exponencial para que el resultado no dependa del dt.
 */
export function integrar(c, dt, { gravedad = G, arrastre = 0, viento = null } = {}) {
  if (c.quieto) return;
  if (gravedad) c.vel.y -= gravedad * dt;
  if (viento) c.vel.addScaledVector(viento, dt);
  if (arrastre > 0) c.vel.multiplyScalar(Math.exp(-arrastre * dt));
  c.pos.addScaledVector(c.vel, dt);
}

/**
 * Rodadura sobre una superficie: fricción que frena y umbral de parada.
 *
 * El umbral importa más de lo que parece. Sin él, una bola de billar tarda un
 * minuto en "casi" pararse y el turno no acaba nunca; con él, cuando la
 * velocidad baja del umbral la bola se detiene del todo y el juego avanza.
 */
export function rodar(c, dt, { friccion = 0.55, umbral = 0.06 } = {}) {
  if (c.quieto) return;
  const v = Math.hypot(c.vel.x, c.vel.z);
  if (v < umbral) {
    c.vel.x = 0; c.vel.z = 0;
    c.quieto = Math.abs(c.vel.y) < 0.01;
    return;
  }
  const k = Math.exp(-friccion * dt);
  c.vel.x *= k;
  c.vel.z *= k;
}

/**
 * Hace girar la malla según su desplazamiento, como una rueda que no patina.
 * Es el detalle que separa "una esfera que se traslada" de "una bola que rueda".
 */
export function rodarMalla(c, dt) {
  if (!c.malla || c.r <= 0) return;
  const v = new THREE.Vector3(c.vel.x, 0, c.vel.z);
  const rapidez = v.length();
  if (rapidez < 1e-4) return;
  // Eje de giro: perpendicular al avance y horizontal.
  const eje = new THREE.Vector3(v.z, 0, -v.x).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(eje, (rapidez / c.r) * dt);
  c.malla.quaternion.premultiply(q);
}

/**
 * Rebote contra el suelo horizontal. Devuelve la fuerza del impacto (0 si no
 * hubo), que los juegos usan para el volumen del golpe.
 */
export function rebotarSuelo(c, sueloY = 0, { restitucion = 0.55, friccion = 0.82, minRebote = 0.5 } = {}) {
  const limite = sueloY + c.r;
  if (c.pos.y > limite) return 0;
  const impacto = Math.abs(c.vel.y);
  c.pos.y = limite;
  if (impacto < minRebote) {
    c.vel.y = 0;
  } else {
    c.vel.y = impacto * restitucion;
  }
  c.vel.x *= friccion;
  c.vel.z *= friccion;
  return impacto;
}

/**
 * Choque elástico entre dos esferas con masa. Separa el solape y reparte el
 * impulso por la normal. Devuelve la velocidad relativa del impacto.
 */
export function chocar(a, b, restitucion = 0.94) {
  const n = new THREE.Vector3().subVectors(b.pos, a.pos);
  const d = n.length();
  const min = a.r + b.r;
  if (d === 0 || d >= min) return 0;
  n.divideScalar(d);

  // Separación proporcional a la masa: la bola pesada se aparta menos.
  const total = a.masa + b.masa;
  const solape = min - d;
  a.pos.addScaledVector(n, -solape * (b.masa / total));
  b.pos.addScaledVector(n, solape * (a.masa / total));

  const vr = new THREE.Vector3().subVectors(b.vel, a.vel);
  const vn = vr.dot(n);
  if (vn > 0) return 0;                    // ya se estaban separando
  const j = (-(1 + restitucion) * vn) / (1 / a.masa + 1 / b.masa);
  a.vel.addScaledVector(n, -j / a.masa);
  b.vel.addScaledVector(n, j / b.masa);
  a.quieto = b.quieto = false;
  return Math.abs(vn);
}

/**
 * Bandas de una mesa rectangular (billar, futbolín, ping-pong).
 * Devuelve el eje del rebote: '' | 'x' | 'z'.
 */
export function bandas(c, { minX, maxX, minZ, maxZ, restitucion = 0.78 } = {}) {
  let eje = '';
  if (c.pos.x - c.r < minX) { c.pos.x = minX + c.r; c.vel.x = Math.abs(c.vel.x) * restitucion; eje = 'x'; }
  else if (c.pos.x + c.r > maxX) { c.pos.x = maxX - c.r; c.vel.x = -Math.abs(c.vel.x) * restitucion; eje = 'x'; }
  if (c.pos.z - c.r < minZ) { c.pos.z = minZ + c.r; c.vel.z = Math.abs(c.vel.z) * restitucion; eje = 'z'; }
  else if (c.pos.z + c.r > maxZ) { c.pos.z = maxZ - c.r; c.vel.z = -Math.abs(c.vel.z) * restitucion; eje = 'z'; }
  if (eje) c.quieto = false;
  return eje;
}

/** ¿Se ha parado todo? Los juegos por turnos lo consultan para pasar turno. */
export function todoQuieto(cuerpos, umbral = 0.08) {
  return cuerpos.every((c) => c.retirada || (Math.abs(c.vel.x) < umbral && Math.abs(c.vel.z) < umbral && Math.abs(c.vel.y) < umbral));
}

/**
 * Alcance balístico: con qué velocidad hay que lanzar desde `origen` para caer
 * en `destino` con un ángulo dado. Sirve para colocar la mira de la máquina y
 * para calibrar las barras de fuerza de los juegos de lanzamiento.
 */
export function velocidadParaAlcance(distancia, alturaRelativa, angulo, gravedad = G) {
  const c = Math.cos(angulo), s = Math.sin(angulo);
  const den = 2 * c * c * (distancia * Math.tan(angulo) - alturaRelativa);
  if (den <= 0) return null;
  return Math.sqrt((gravedad * distancia * distancia) / den);
}

/**
 * Cadena de puntos con restricciones de distancia (Verlet).
 *
 * Es lo que hace de sedal de caña, de cuerda de grúa y de red: barata, estable
 * y con el bamboleo justo. Dos o tres pasadas de relajación bastan.
 */
export class Cuerda {
  constructor(puntos, largo, { pasadas = 4, gravedad = 12, amortigua = 0.985 } = {}) {
    this.p = [];
    this.previo = [];
    for (let i = 0; i < puntos; i++) {
      const v = new THREE.Vector3(0, -i * (largo / puntos), 0);
      this.p.push(v.clone());
      this.previo.push(v.clone());
    }
    this.segmento = largo / (puntos - 1);
    this.pasadas = pasadas;
    this.gravedad = gravedad;
    this.amortigua = amortigua;
  }

  /** `ancla` fija el primer punto; `punta` (opcional) fija el último. */
  paso(dt, ancla, punta = null) {
    for (let i = 0; i < this.p.length; i++) {
      const act = this.p[i];
      const ant = this.previo[i];
      const vx = (act.x - ant.x) * this.amortigua;
      const vy = (act.y - ant.y) * this.amortigua;
      const vz = (act.z - ant.z) * this.amortigua;
      ant.copy(act);
      act.x += vx;
      act.y += vy - this.gravedad * dt * dt;
      act.z += vz;
    }
    for (let k = 0; k < this.pasadas; k++) {
      this.p[0].copy(ancla);
      if (punta) this.p[this.p.length - 1].copy(punta);
      for (let i = 0; i < this.p.length - 1; i++) {
        const a = this.p[i], b = this.p[i + 1];
        const d = a.distanceTo(b);
        if (d < 1e-6) continue;
        const corrige = (d - this.segmento) / d * 0.5;
        const dx = (b.x - a.x) * corrige, dy = (b.y - a.y) * corrige, dz = (b.z - a.z) * corrige;
        if (i > 0) { a.x += dx; a.y += dy; a.z += dz; }
        if (!(punta && i + 1 === this.p.length - 1)) { b.x -= dx; b.y -= dy; b.z -= dz; }
      }
    }
  }

  /** Vuelca los puntos en la geometría de una línea. */
  aGeometria(geo) {
    const arr = geo.attributes.position.array;
    for (let i = 0; i < this.p.length; i++) {
      arr[i * 3] = this.p[i].x;
      arr[i * 3 + 1] = this.p[i].y;
      arr[i * 3 + 2] = this.p[i].z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
  }
}

/**
 * Pieza que se cae: caja con posición, velocidad y giro propio.
 *
 * Los juegos de derribo (bolos, dominó, torre de madera) no necesitan
 * contactos de verdad — necesitan que las piezas se vuelquen de forma creíble
 * y se queden tumbadas. Esto lo hace con un cuarto de las líneas.
 */
export function pieza(malla, { r = 0.5, alto = 1, masa = 1 } = {}) {
  return {
    malla, r, alto, masa,
    pos: malla.position,
    vel: new THREE.Vector3(),
    velGiro: new THREE.Vector3(),
    caida: false,
    quieto: false,
  };
}

/** Paso de una pieza que se cae: gravedad, giro y aterrizaje. */
export function pasoPieza(p, dt, { sueloY = 0, friccion = 3.4 } = {}) {
  if (p.quieto) return;
  p.vel.y -= G * dt;
  p.pos.addScaledVector(p.vel, dt);
  p.malla.rotation.x += p.velGiro.x * dt;
  p.malla.rotation.y += p.velGiro.y * dt;
  p.malla.rotation.z += p.velGiro.z * dt;

  // Al volcar, el centro baja hasta la mitad del grosor: la pieza queda
  // tumbada en vez de flotando de pie sobre el suelo.
  const inclinada = Math.abs(p.malla.rotation.x) > 0.7 || Math.abs(p.malla.rotation.z) > 0.7;
  const reposo = sueloY + (inclinada ? p.r : p.alto / 2);
  if (p.pos.y <= reposo) {
    p.pos.y = reposo;
    p.vel.y = 0;
    const k = Math.exp(-friccion * dt);
    p.vel.x *= k; p.vel.z *= k;
    p.velGiro.multiplyScalar(k);
    if (p.vel.lengthSq() < 0.02 && p.velGiro.lengthSq() < 0.05) {
      p.quieto = true;
      p.vel.set(0, 0, 0);
      p.velGiro.set(0, 0, 0);
    }
    if (inclinada) p.caida = true;
  }
}

/** Empuja una pieza con un impacto: la tumba en la dirección del golpe. */
export function empujar(p, direccion, fuerza) {
  const d = direccion.clone().setY(0).normalize();
  p.vel.addScaledVector(d, fuerza / p.masa);
  p.vel.y += fuerza * 0.12;
  // El giro es perpendicular al empuje: la pieza cae hacia donde la empujaron.
  p.velGiro.x += d.z * fuerza * 0.9;
  p.velGiro.z += -d.x * fuerza * 0.9;
  p.velGiro.y += (Math.random() - 0.5) * fuerza * 0.3;
  p.quieto = false;
}

/** Distancia horizontal entre dos cuerpos (la vertical casi nunca importa). */
export function distXZ(a, b) {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
}
