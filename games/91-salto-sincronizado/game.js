/**
 * Salto Sincronizado — autoscroll a lo Geometry Dash, cada uno su carril.
 *
 * Los dos corren la MISMA pista (misma semilla, mismos obstáculos) en
 * paralelo, uno arriba y otro abajo, con un solo botón. La pista alterna
 * cuatro vehículos —cubo, OVNI, bola y onda— cada uno con su física.
 *
 * NIVELES GARANTIZADOS PASABLES
 * -----------------------------
 * El generador no inventa anchos al azar. Calcula cuánto puede librar de
 * verdad cada vehículo resolviendo y(t) = -vj·t + (g/2)·t² = -margen: eso da
 * el tiempo que el cuerpo pasa por encima del obstáculo, y multiplicado por
 * la velocidad horizontal sale el ancho máximo franqueable. Los huecos se
 * recortan a ese número con holgura.
 *
 * Además, en los modos con techo (bola y onda) los peligros de arriba y los
 * de abajo NUNCA coinciden en la misma x: si coincidieran formarían un muro
 * imposible. El generador del techo recibe los tramos ocupados del suelo y
 * los esquiva.
 *
 * La colisión usa el ancho REAL del cuerpo, no solo su centro, así que lo
 * que se ve es lo que mata.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VEL_BASE = 230;
const VEL_MAX = 400;
const RAMPA = 90;                 // px recorridos por cada px/s extra (rampa suave)
const TECHO_Y = 132;              // alto del canal de vuelo (onda/bola)
const PX = 128;                   // x fija en pantalla del vehículo

/** Media caja de colisión, en px. El dibujo usa exactamente estos valores. */
const HITBOX = { w: 13, h: 14 };
/** Holgura vertical mínima para dar por librado un peligro. */
const MARGEN = HITBOX.h + 12;     // 26
const MARGEN_ONDA = 10;           // la onda es un rombo fino: perdona menos

const FISICA = {
  cubo: { salto: 660, grav: 2000 },
  ovni: { salto: 430, grav: 1750 },
};

const NOMBRE_MODO = { cubo: 'CUBO', ovni: 'OVNI', bola: 'BOLA', onda: 'ONDA' };

const SECUENCIA = [
  { modo: 'cubo', largo: 900 },
  { modo: 'ovni', largo: 780 },
  { modo: 'bola', largo: 800 },
  { modo: 'onda', largo: 950 },
  { modo: 'cubo', largo: 700 },
  { modo: 'ovni', largo: 700 },
  { modo: 'onda', largo: 800 },
  { modo: 'cubo', largo: 600 },
];

/* ---------------- Física del generador ---------------- */

const velocidadEn = (d) => Math.min(VEL_MAX, VEL_BASE + d / RAMPA);

/**
 * Ancho máximo que un salto libra manteniéndose por encima de `margen`.
 * Devuelve 0 si el salto ni siquiera alcanza esa altura.
 */
function anchoFranqueable(salto, grav, margen, vel) {
  const disc = salto * salto - 2 * grav * margen;
  if (disc <= 0) return 0;
  return (2 * Math.sqrt(disc) / grav) * vel;
}

/** Límites de generación de cada modo, ya acotados por la física real. */
function limites(modo, velZona) {
  const SEG = 0.62;               // holgura: nada sale al límite exacto
  switch (modo) {
    case 'cubo': {
      const max = anchoFranqueable(FISICA.cubo.salto, FISICA.cubo.grav, MARGEN, velZona) * SEG;
      return { minHaz: 22, maxHaz: Math.max(30, max), minSeguro: 210, maxSeguro: 330, probHueco: 0.45 };
    }
    case 'ovni': {
      // El OVNI realetea en el aire, así que se le conceden 1.6 aleteos.
      // Aun así queda MUY por debajo de los 150 px que tenía antes.
      const uno = anchoFranqueable(FISICA.ovni.salto, FISICA.ovni.grav, MARGEN, velZona);
      return { minHaz: 26, maxHaz: Math.max(30, uno * 1.6 * SEG), minSeguro: 200, maxSeguro: 300, probHueco: 0.6 };
    }
    case 'bola': {
      // Cruzar el corredor entero cuesta t = √(2h/a); el hueco debe caber ahí.
      const t = Math.sqrt((2 * TECHO_Y) / 2200);
      return { minHaz: 24, maxHaz: Math.max(28, t * velZona * SEG), minSeguro: 230, maxSeguro: 330, probHueco: 0.45 };
    }
    default: { // onda
      // Sube y baja a 420 px/s constantes y puede sostenerse arriba: el límite
      // lo pone subir desde el suelo hasta pasar el margen del otro lado.
      const t = (TECHO_Y - MARGEN_ONDA * 2) / 420;
      return { minHaz: 28, maxHaz: Math.max(32, t * velZona * SEG), minSeguro: 190, maxSeguro: 280, probHueco: 0.5 };
    }
  }
}

/**
 * Genera los peligros de una superficie dentro de [x0, x0+largo].
 * `vetado` son tramos donde NO puede haber nada (los peligros de la otra
 * superficie), para que techo y suelo jamás se solapen.
 */
function generarSuperficie(rng, x0, largo, lim, vetado = []) {
  const segs = [];
  const fin = x0 + largo;
  // Siempre se entra pisando firme: nadie aparece sobre un abismo.
  let x = x0 + 90;
  segs.push({ tipo: 'suelo', x0, x1: x });

  const chocaVeto = (a, b) => vetado.some((v) => a < v.b && b > v.a);

  while (x < fin - 120) {
    const esHueco = rng() < lim.probHueco;
    let ancho = esHueco ? lim.minHaz + rng() * (lim.maxHaz - lim.minHaz) : 20 + rng() * 14;
    ancho = Math.min(ancho, lim.maxHaz);

    if (chocaVeto(x, x + ancho)) {
      const v = vetado.find((z) => x < z.b && x + ancho > z.a);
      const hasta = Math.min(v.b + 60, fin);
      segs.push({ tipo: 'suelo', x0: x, x1: hasta });
      x = hasta;
      continue;
    }

    segs.push({ tipo: esHueco ? 'hueco' : 'pincho', x0: x, x1: Math.min(x + ancho, fin) });
    x += ancho;

    const seguro = lim.minSeguro + rng() * (lim.maxSeguro - lim.minSeguro);
    segs.push({ tipo: 'suelo', x0: x, x1: Math.min(x + seguro, fin) });
    x += seguro;
  }
  if (x < fin) segs.push({ tipo: 'suelo', x0: x, x1: fin });
  return segs;
}

const peligrosDe = (segs) =>
  segs.filter((s) => s.tipo === 'pincho' || s.tipo === 'hueco').map((s) => ({ a: s.x0, b: s.x1 }));

function generarNivel(rng) {
  const zonas = [];
  const suelo = [{ tipo: 'suelo', x0: 0, x1: 300 }];
  const techo = [];
  let x = 300;

  for (const { modo, largo } of SECUENCIA) {
    const x1 = x + largo;
    const lim = limites(modo, velocidadEn(x));
    const usaTecho = modo === 'bola' || modo === 'onda';

    const segSuelo = generarSuperficie(rng, x, largo, lim);
    suelo.push(...segSuelo);
    if (usaTecho) {
      techo.push(...generarSuperficie(
        rng, x, largo, { ...lim, probHueco: lim.probHueco * 0.7 }, peligrosDe(segSuelo)));
    }

    zonas.push({ modo, x0: x, x1 });
    // Descanso llano entre vehículos para reorientarse.
    x = x1 + 120;
    suelo.push({ tipo: 'suelo', x0: x1, x1: x });
    if (usaTecho) techo.push({ tipo: 'suelo', x0: x1, x1: x });
  }
  zonas.push({ modo: 'cubo', x0: x, x1: x + 60 });
  suelo.push({ tipo: 'meta', x0: x, x1: x + 60 });
  return { zonas, suelo, techo, total: x + 60 };
}

function segAt(segs, worldX) {
  for (const s of segs) if (worldX >= s.x0 && worldX < s.x1) return s;
  return { tipo: 'suelo' };
}

function zonaEn(zonas, worldX) {
  for (const z of zonas) if (worldX >= z.x0 && worldX < z.x1) return z;
  return zonas[zonas.length - 1];
}

const esHaz = (s) => s && (s.tipo === 'pincho' || s.tipo === 'hueco');

/* ---------------- Físicas por vehículo ---------------- */

function fisicaCubo(p, dt, pressed) {
  if (pressed && p.suelo) { p.vy = -FISICA.cubo.salto; p.suelo = false; }
  p.vy += FISICA.cubo.grav * dt;
  p.y += p.vy * dt;
  if (p.y >= 0) { p.y = 0; p.vy = 0; p.suelo = true; }
  p.rot = p.suelo ? Math.round(p.rot / 90) * 90 : p.rot + dt * 540;
}

function fisicaOvni(p, dt, pressed) {
  if (pressed) p.vy = -FISICA.ovni.salto;
  p.vy += FISICA.ovni.grav * dt;
  p.y += p.vy * dt;
  if (p.y >= 0) { p.y = 0; p.vy = 0; p.suelo = true; } else p.suelo = false;
  if (p.y < -TECHO_Y) { p.y = -TECHO_Y; p.vy = Math.max(p.vy, 0); }
}

function fisicaBola(p, dt, pressed) {
  // Solo se invierte la gravedad estando apoyado, como en el original.
  if (pressed && p.apoyada) { p.gravDir *= -1; p.vy = 0; p.apoyada = false; }
  p.vy += 2200 * dt * p.gravDir;
  p.y += p.vy * dt;
  if (p.gravDir === 1 && p.y >= 0) { p.y = 0; p.vy = 0; p.apoyada = true; }
  else if (p.gravDir === -1 && p.y <= -TECHO_Y) { p.y = -TECHO_Y; p.vy = 0; p.apoyada = true; }
  p.rot += dt * 380 * p.gravDir;
}

function fisicaOnda(p, dt, held) {
  p.vy = held ? -420 : 420;
  p.y = clamp(p.y + p.vy * dt, -TECHO_Y, 0);
  p.rot = held ? -45 : 45;
}

/** Colisión con el ancho real del cuerpo: nada de muertes por un píxel invisible. */
function comprobarChoque(p, pista, modo) {
  const margen = modo === 'onda' ? MARGEN_ONDA : MARGEN;
  const izq = p.distancia - HITBOX.w, der = p.distancia + HITBOX.w;
  const tocaSuelo = esHaz(segAt(pista.suelo, izq)) || esHaz(segAt(pista.suelo, der));
  const tocaTecho = esHaz(segAt(pista.techo, izq)) || esHaz(segAt(pista.techo, der));

  if (modo === 'cubo' || modo === 'ovni') return tocaSuelo && p.y > -margen;
  if (modo === 'onda') {
    if (tocaSuelo && p.y > -margen) return true;
    if (tocaTecho && p.y < -TECHO_Y + margen) return true;
    return false;
  }
  // bola: solo cuenta la superficie a la que está pegada
  if (p.gravDir === 1) return tocaSuelo && p.y > -margen;
  return tocaTecho && p.y < -TECHO_Y + margen;
}

/* ---------------- Juego ---------------- */

export function create(ctx) {
  const { input, audio, haptics, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let pista = null;
  const jug = [crearJugador(0), crearJugador(1)];
  let terminado = false, pausaFin = 0;

  function crearJugador(i) {
    return {
      i, y: 0, vy: 0, rot: 0, gravDir: 1, distancia: 0,
      suelo: true, apoyada: true, vivo: true, listo: false,
      trail: [], modoPrev: '',
    };
  }

  function reiniciar() {
    pista = generarNivel(rng);
    for (const p of jug) Object.assign(p, crearJugador(p.i));
    terminado = false;
    pausaFin = 0;
  }

  function estrellar(p, laneY) {
    p.vivo = false; p.listo = true;
    particles.burst(PX, laneY + p.y, 26, {
      speed: 220, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: players[p.i].color, size: 3, shape: 'spark', drag: 0.93,
    });
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(7, 9);
  }

  /** Al cambiar de vehículo se coloca en una posición segura del modo nuevo. */
  function entrarEnModo(p, modo, laneY) {
    p.vy = 0;
    if (modo === 'onda') p.y = -TECHO_Y / 2;
    else if (modo === 'bola') { p.y = 0; p.gravDir = 1; p.apoyada = true; }
    else { p.y = 0; p.suelo = true; }
    p.rot = 0;
    particles.burst(PX, laneY + p.y, 14, {
      speed: 160, dir: 0, spread: Math.PI * 2, color: '#ffffff', size: 2.2, shape: 'spark', drag: 0.91,
    });
    audio.select();
  }

  function actualizarJugador(p, dt, laneY, ip) {
    if (p.listo) return;

    const zona = zonaEn(pista.zonas, p.distancia);
    if (zona.modo !== p.modoPrev) { p.modoPrev = zona.modo; entrarEnModo(p, zona.modo, laneY); }

    const pressed = ip.pressed('a'), held = ip.held('a');
    switch (zona.modo) {
      case 'cubo': fisicaCubo(p, dt, pressed); break;
      case 'ovni': fisicaOvni(p, dt, pressed); break;
      case 'bola': fisicaBola(p, dt, pressed); break;
      case 'onda': fisicaOnda(p, dt, held); break;
    }
    if (pressed) haptics.play('tap', { player: p.i });

    p.distancia += velocidadEn(p.distancia) * dt;

    // El rastro guarda la posición EN EL MUNDO; al pintar se convierte a
    // pantalla. Si se guardara la x de pantalla (siempre PX) el rastro
    // saldría como una línea vertical clavada bajo el vehículo.
    p.trail.push({ d: p.distancia, y: p.y, t: 0 });
    for (const t of p.trail) t.t += dt;
    p.trail = p.trail.filter((t) => t.t < 0.4);

    if (p.distancia >= pista.total - 60) {
      p.vivo = true; p.listo = true;
      audio.win();
      haptics.play('victory', { player: p.i });
      return;
    }
    if (comprobarChoque(p, pista, zona.modo)) estrellar(p, laneY);
  }

  function dibujarVehiculo(g, p, cy, modo) {
    g.save();
    g.translate(PX, cy);
    const muerto = p.listo && !p.vivo;
    const color = muerto ? '#3a3a48' : players[p.i].color;
    g.shadowColor = color; g.shadowBlur = muerto ? 0 : 16;
    g.fillStyle = color; g.strokeStyle = '#0a0a12'; g.lineWidth = 2.2;

    if (modo === 'cubo') {
      g.rotate((p.rot * Math.PI) / 180);
      g.fillRect(-HITBOX.w, -HITBOX.h, HITBOX.w * 2, HITBOX.h * 2);
      g.strokeRect(-HITBOX.w, -HITBOX.h, HITBOX.w * 2, HITBOX.h * 2);
    } else if (modo === 'onda') {
      g.rotate((p.rot * Math.PI) / 180);
      g.beginPath();
      g.moveTo(0, -HITBOX.h); g.lineTo(HITBOX.w, 0); g.lineTo(0, HITBOX.h); g.lineTo(-HITBOX.w, 0);
      g.closePath(); g.fill(); g.stroke();
    } else if (modo === 'bola') {
      g.rotate((p.rot * Math.PI) / 180);
      g.beginPath(); g.arc(0, 0, HITBOX.h, 0, Math.PI * 2); g.fill(); g.stroke();
      g.strokeStyle = '#ffffff55';
      g.beginPath(); g.moveTo(-HITBOX.h, 0); g.lineTo(HITBOX.h, 0); g.stroke();
    } else {
      g.beginPath(); g.ellipse(0, 2, HITBOX.w + 4, HITBOX.h * 0.62, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(0, -4, HITBOX.h * 0.55, Math.PI, 0); g.fill(); g.stroke();
    }
    g.restore();
  }

  function dibujarObstaculo(g, seg, sx0, sx1, laneY, laneH, esTecho) {
    const ancho = sx1 - sx0;
    if (seg.tipo === 'pincho') {
      const punta = esTecho ? laneY + 34 : laneY - 34;
      g.save();
      g.shadowColor = '#ff2e5b'; g.shadowBlur = 16;
      g.fillStyle = '#ff435f';
      g.beginPath();
      g.moveTo(sx0, laneY); g.lineTo((sx0 + sx1) / 2, punta); g.lineTo(sx1, laneY);
      g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = '#ffd7de'; g.lineWidth = 2; g.stroke();
      g.restore();
    } else if (seg.tipo === 'hueco') {
      const alto = laneH * 0.32;
      const y0 = esTecho ? laneY - alto : laneY;
      g.save();
      g.fillStyle = '#2a0a12';
      g.fillRect(sx0, y0, ancho, alto);
      g.fillStyle = '#ff2e5b';
      g.fillRect(sx0, esTecho ? y0 + alto - 4 : y0, ancho, 4);
      g.strokeStyle = '#ff2e5b88'; g.lineWidth = 1.5;
      g.strokeRect(sx0 + 0.5, y0 + 0.5, ancho - 1, alto - 1);
      g.restore();
    } else if (seg.tipo === 'meta') {
      for (let k = 0; k < 6; k++) {
        g.fillStyle = k % 2 ? '#0a0a12' : '#ffffff';
        g.fillRect(sx0, laneY - (k + 1) * 10, ancho, 10);
      }
    }
  }

  function dibujarCarril(g, p, laneY, laneH) {
    const d = p.distancia;
    const visIni = d - 60, visFin = d + (W - PX) + 40;
    const zona = zonaEn(pista.zonas, d);
    const techoActivo = zona.modo === 'bola' || zona.modo === 'onda';

    const col = (p.vivo || !p.listo) ? players[p.i].color : '#ffffff30';
    g.save();
    g.shadowColor = col; g.shadowBlur = 8;
    g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, laneY); g.lineTo(W, laneY); g.stroke();
    g.fillStyle = col + '22';
    g.fillRect(0, laneY, W, laneH * 0.3);
    if (techoActivo) {
      g.beginPath(); g.moveTo(0, laneY - TECHO_Y); g.lineTo(W, laneY - TECHO_Y); g.stroke();
      g.fillRect(0, laneY - TECHO_Y - laneH * 0.3, W, laneH * 0.3);
    }
    g.restore();

    for (const seg of pista.suelo) {
      if (seg.x1 < visIni || seg.x0 > visFin) continue;
      dibujarObstaculo(g, seg, PX + (seg.x0 - d), PX + (seg.x1 - d), laneY, laneH, false);
    }
    if (techoActivo) {
      for (const seg of pista.techo) {
        if (seg.x1 < visIni || seg.x0 > visFin) continue;
        dibujarObstaculo(g, seg, PX + (seg.x0 - d), PX + (seg.x1 - d), laneY - TECHO_Y, laneH, true);
      }
    }

    for (const z of pista.zonas) {
      if (z.x0 < visIni || z.x0 > visFin) continue;
      const sx = PX + (z.x0 - d);
      g.save();
      g.fillStyle = '#ffffff22';
      g.fillRect(sx - 3, laneY - laneH * 0.45, 6, laneH * 0.45);
      g.fillStyle = '#ffffffcc';
      g.font = '700 9px system-ui'; g.textAlign = 'center';
      g.fillText(NOMBRE_MODO[z.modo] || '', sx, laneY - laneH * 0.47);
      g.restore();
    }

    for (const t of p.trail) {
      const f = clamp(1 - t.t / 0.4, 0, 1);
      const tx = PX + (t.d - d);            // mundo -> pantalla: queda atrás
      if (tx < -20) continue;
      g.save();
      g.globalAlpha = f * 0.5;
      g.fillStyle = players[p.i].color;
      g.beginPath(); g.arc(tx, laneY + t.y, 4 * f, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    dibujarVehiculo(g, p, laneY + p.y, zona.modo);
  }

  function resolver() {
    const d0 = jug[0].distancia, d1 = jug[1].distancia;
    const meta = pista.total - 60;
    const t0 = d0 >= meta, t1 = d1 >= meta;
    let winner = -1;
    if (t0 !== t1) winner = t0 ? 0 : 1;
    else if (Math.abs(d0 - d1) > 5) winner = d0 > d1 ? 0 : 1;
    const mejor = Math.max(d0, d1);
    ctx.finish({
      winner,
      scores: [Math.round(d0), Math.round(d1)],
      detail: `${Math.round((mejor / pista.total) * 100)}% de la pista`,
      record: ctx.record('distancia', Math.round(mejor), 'high'),
    });
  }

  return {
    init() { reiniciar(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      if (terminado) {
        pausaFin -= dt;
        if (pausaFin <= 0) resolver();
        return;
      }
      actualizarJugador(jug[0], dt, H * 0.28, input.player(0));
      actualizarJugador(jug[1], dt, H * 0.72, input.player(1));
      particles.update(dt);
      if (jug[0].listo && jug[1].listo) { terminado = true; pausaFin = 1.4; }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#06060c');
      g.strokeStyle = '#ffffff10'; g.lineWidth = 1;
      for (let y = 0; y < H; y += 26) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.strokeStyle = '#ffffff30';
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();

      dibujarCarril(g, jug[0], H * 0.28, H * 0.44);
      dibujarCarril(g, jug[1], H * 0.72, H * 0.44);
      particles.render(g);

      for (let i = 0; i < 2; i++) {
        const z = zonaEn(pista.zonas, jug[i].distancia);
        const pct = Math.min(100, Math.round((jug[i].distancia / pista.total) * 100));
        ctx.engine.text(`${players[i].name} · ${pct}% · ${NOMBRE_MODO[z.modo] || ''}`,
          14, i === 0 ? H * 0.06 : H * 0.94,
          { size: 12, color: players[i].color, align: 'left', font: 'system-ui' });
      }
      ctx.engine.text('CUBO/OVNI: toca para saltar · BOLA: toca para invertir gravedad · ONDA: mantén para subir',
        W / 2, H - 10, { size: 10, color: '#ffffff44', font: 'system-ui' });
    },

    destroy() {},
  };
}
