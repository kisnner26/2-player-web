/**
 * Turbo Circuito — carreras con derrape, objetos y rebufo.
 *
 * Vista cenital con cámara que sigue al líder y encuadra a los dos: si uno se
 * queda muy atrás la cámara se aleja en vez de dejarlo fuera de pantalla, así
 * nadie juega a ciegas.
 *
 * Controles dentro del límite de 2 botones (core/input.js):
 *   ← / →   girar
 *   ↑       acelerar        ↓   frenar / marcha atrás
 *   A       usar objeto
 *   B       derrapar (mantener mientras giras: carga turbo y lo suelta al salir)
 *
 * El derrape es lo que da profundidad: girar cerrado sin derrape te frena,
 * derrapar te deja tomar la curva rápido Y te regala un empujón si aguantas.
 * Los objetos se reparten con "rubber banding": el que va último saca mejores
 * cosas, para que una carrera perdida siga teniendo tensión.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VUELTAS = 3;
const ACEL = 300;
const VEL_MAX = 330;
const VEL_MAX_TURBO = 470;
const ROCE = 1.9;
const GIRO = 2.6;

/** Puntos de control del circuito, en coordenadas de mundo. */
const TRAZADO = [
  [400, 160], [780, 150], [1020, 300], [1010, 560], [820, 700],
  [520, 720], [360, 610], [180, 640], [90, 460], [140, 250],
];
const ANCHO_PISTA = 108;

const OBJETOS = [
  { id: 'turbo',  nom: 'Turbo',   col: '#ffd166' },
  { id: 'misil',  nom: 'Misil',   col: '#ff4757' },
  { id: 'mancha', nom: 'Mancha',  col: '#9a7fb8' },
  { id: 'escudo', nom: 'Escudo',  col: '#6fd0f0' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let cam = { x: 0, y: 0, z: 1 };
  let estado = 'carrera';
  let tiempo = 0, cuenta = 3.2;
  let manchas = [], misiles = [];
  let aviso = '', avisoT = 0;

  const kart = [crear(0), crear(1)];

  function crear(i) {
    const p0 = TRAZADO[0], p1 = TRAZADO[1];
    const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const off = (i === 0 ? -26 : 26);
    return {
      i, x: p0[0] + nx * off, y: p0[1] + ny * off, ang,
      vel: 0, derrape: 0, cargaTurbo: 0, turbo: 0,
      cp: 0, vuelta: 1, terminado: false, tFinal: 0,
      objeto: null, escudo: 0, girado: 0, aturdido: 0, resbala: 0,
    };
  }

  /* ---------------- Geometría de la pista ---------------- */

  function segmentoMasCercano(x, y) {
    let mejor = 0, mejorD = Infinity, mejorT = 0;
    for (let i = 0; i < TRAZADO.length; i++) {
      const a = TRAZADO[i], b = TRAZADO[(i + 1) % TRAZADO.length];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1);
      const px = a[0] + dx * t, py = a[1] + dy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < mejorD) { mejorD = d; mejor = i; mejorT = t; }
    }
    return { seg: mejor, dist: mejorD, t: mejorT };
  }

  const enPista = (x, y) => segmentoMasCercano(x, y).dist < ANCHO_PISTA / 2;

  function progreso(k) {
    const { seg, t } = segmentoMasCercano(k.x, k.y);
    return k.vuelta * 1000 + seg * 10 + t * 10;
  }

  function posiciones() {
    return [0, 1].sort((a, b) => progreso(kart[b]) - progreso(kart[a]));
  }

  /* ---------------- Objetos ---------------- */

  function darObjeto(k) {
    if (k.objeto) return;
    const orden = posiciones();
    const ultimo = orden[1] === k.i;
    // Rubber banding: el rezagado saca cosas mejores.
    const pool = ultimo ? ['turbo', 'misil', 'turbo', 'escudo'] : ['mancha', 'escudo', 'misil'];
    k.objeto = pool[Math.floor(Math.random() * pool.length)];
    audio.blip();
  }

  function usarObjeto(k) {
    if (!k.objeto || k.aturdido > 0) return;
    const o = k.objeto;
    k.objeto = null;
    if (o === 'turbo') {
      k.turbo = 1.5;
      audio.tone({ freq: 300, dur: 0.25, gain: 0.14, type: 'sawtooth', sweep: 500 });
      haptics.play('impact', { player: k.i });
    } else if (o === 'escudo') {
      k.escudo = 6;
      audio.tone({ freq: 620, dur: 0.2, gain: 0.12, type: 'sine' });
    } else if (o === 'mancha') {
      manchas.push({ x: k.x - Math.cos(k.ang) * 40, y: k.y - Math.sin(k.ang) * 40, vida: 22 });
      audio.tone({ freq: 160, dur: 0.12, gain: 0.1, type: 'triangle' });
    } else if (o === 'misil') {
      const otro = kart[1 - k.i];
      misiles.push({ x: k.x, y: k.y, ang: Math.atan2(otro.y - k.y, otro.x - k.x), de: k.i, vida: 4 });
      audio.tone({ freq: 420, dur: 0.14, gain: 0.13, type: 'square', sweep: -180 });
    }
    decir(`${players[k.i].name}: ${OBJETOS.find((x) => x.id === o).nom}`);
  }

  const decir = (t) => { aviso = t; avisoT = 1.8; };

  /* ---------------- Simulación ---------------- */

  function conducir(k, dt) {
    const p = input.player(k.i);
    if (k.aturdido > 0) { k.aturdido -= dt; k.vel *= Math.pow(0.1, dt); return; }

    const acelera = p.held('up');
    const frena = p.held('down');
    const quiereDerrape = p.held('b');
    const giro = (p.held('right') ? 1 : 0) - (p.held('left') ? 1 : 0);

    if (p.pressed('a')) usarObjeto(k);

    // Velocidad
    const fuera = !enPista(k.x, k.y);
    const techo = (k.turbo > 0 ? VEL_MAX_TURBO : VEL_MAX) * (fuera ? 0.45 : 1);
    if (acelera) k.vel += ACEL * dt;
    else if (frena) k.vel -= ACEL * 1.5 * dt;
    else k.vel -= ROCE * 24 * dt;
    if (k.turbo > 0) { k.turbo -= dt; k.vel += 240 * dt; }
    k.vel = clamp(k.vel, -110, techo);

    // Derrape: gira más pero pierde algo de agarre; al soltar, mini-turbo.
    const derrapando = quiereDerrape && Math.abs(giro) > 0 && k.vel > 90;
    if (derrapando) {
      k.derrape = clamp(k.derrape + dt * 2.4, 0, 1);
      k.cargaTurbo += dt;
      k.vel -= 26 * dt;
    } else {
      if (k.cargaTurbo > 0.75) {
        k.turbo = Math.max(k.turbo, clamp(k.cargaTurbo * 0.55, 0.3, 1.2));
        audio.tone({ freq: 520, dur: 0.16, gain: 0.13, type: 'sawtooth', sweep: 300 });
        haptics.play('tap', { player: k.i });
        particles.burst(k.x, k.y, 12, {
          speed: 150, dir: k.ang + Math.PI, spread: 0.9, color: '#ffd166', size: 2.6, shape: 'spark', drag: 0.91,
        });
      }
      k.cargaTurbo = 0;
      k.derrape = Math.max(0, k.derrape - dt * 3);
    }

    // Sobre mancha: se resbala
    if (k.resbala > 0) k.resbala -= dt;
    const factorGiro = GIRO * (1 + k.derrape * 0.75) * (k.resbala > 0 ? 2.2 : 1);
    const velFrac = clamp(Math.abs(k.vel) / 150, 0, 1);
    k.ang += giro * factorGiro * velFrac * dt * Math.sign(k.vel || 1);

    // Movimiento con deriva lateral durante el derrape
    const deriva = k.derrape * 0.35;
    const dirX = Math.cos(k.ang), dirY = Math.sin(k.ang);
    k.x += (dirX + -Math.sin(k.ang) * deriva * (giro || 0)) * k.vel * dt;
    k.y += (dirY + Math.cos(k.ang) * deriva * (giro || 0)) * k.vel * dt;

    // Manchas
    for (const m of manchas) {
      if (Math.hypot(k.x - m.x, k.y - m.y) < 34 && k.escudo <= 0) {
        k.resbala = 1.4;
        k.vel *= 0.86;
      }
    }

    // Checkpoints y vueltas
    const { seg } = segmentoMasCercano(k.x, k.y);
    const siguiente = (k.cp + 1) % TRAZADO.length;
    if (seg === siguiente) {
      k.cp = siguiente;
      if (k.cp === 0) {
        k.vuelta++;
        if (k.vuelta > VUELTAS) {
          k.terminado = true;
          k.tFinal = tiempo;
          decir(`${players[k.i].name} termina`);
          audio.win();
        } else {
          decir(`${players[k.i].name}: vuelta ${k.vuelta}`);
          audio.select();
        }
      }
      if (k.cp % 3 === 0) darObjeto(k);
    }
  }

  function moverMisiles(dt) {
    for (let i = misiles.length - 1; i >= 0; i--) {
      const m = misiles[i];
      m.vida -= dt;
      const obj = kart[1 - m.de];
      const deseado = Math.atan2(obj.y - m.y, obj.x - m.x);
      let d = deseado - m.ang;
      while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      m.ang += clamp(d, -2.6 * dt, 2.6 * dt);
      m.x += Math.cos(m.ang) * 420 * dt;
      m.y += Math.sin(m.ang) * 420 * dt;

      if (Math.hypot(m.x - obj.x, m.y - obj.y) < 26) {
        if (obj.escudo > 0) { obj.escudo = 0; decir(`${players[obj.i].name} bloqueó el misil`); }
        else {
          obj.aturdido = 1.1; obj.vel *= 0.25;
          ctx.shake(6, 8);
          haptics.explosion(obj.i);
          decir(`${players[obj.i].name} recibió el misil`);
        }
        particles.burst(m.x, m.y, 20, { speed: 220, dir: 0, spread: TAU, color: '#ff4757', size: 3, shape: 'spark', drag: 0.93 });
        audio.explosion();
        misiles.splice(i, 1);
        continue;
      }
      if (m.vida <= 0) misiles.splice(i, 1);
    }
  }

  function actualizarCamara(dt) {
    const mx = (kart[0].x + kart[1].x) / 2, my = (kart[0].y + kart[1].y) / 2;
    const sep = Math.hypot(kart[0].x - kart[1].x, kart[0].y - kart[1].y);
    const zDeseado = clamp(Math.min(W, H) / (sep + 420), 0.42, 1.05);
    cam.x += (mx - cam.x) * clamp(dt * 3.4, 0, 1);
    cam.y += (my - cam.y) * clamp(dt * 3.4, 0, 1);
    cam.z += (zDeseado - cam.z) * clamp(dt * 2.2, 0, 1);
  }

  function terminarCarrera() {
    estado = 'fin';
    const [a, b] = kart;
    let winner;
    if (a.terminado && b.terminado) winner = a.tFinal <= b.tFinal ? 0 : 1;
    else if (a.terminado) winner = 0;
    else if (b.terminado) winner = 1;
    else winner = progreso(a) > progreso(b) ? 0 : 1;
    const t = kart[winner].tFinal || tiempo;
    ctx.finish({
      winner,
      scores: [Math.round(progreso(a)), Math.round(progreso(b))],
      detail: `${VUELTAS} vueltas · ${t.toFixed(1)}s`,
      record: ctx.record('vuelta', Math.round(t * 10) / 10, 'low'),
    });
  }

  /* ---------------- Render ---------------- */

  function aPantalla(x, y) {
    return [(x - cam.x) * cam.z + W / 2, (y - cam.y) * cam.z + H / 2];
  }

  function dibujarPista(g) {
    // Asfalto: línea gruesa siguiendo el trazado
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = '#2a2a34';
    g.lineWidth = ANCHO_PISTA * cam.z;
    g.beginPath();
    for (let i = 0; i <= TRAZADO.length; i++) {
      const [px, py] = aPantalla(...TRAZADO[i % TRAZADO.length]);
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath(); g.stroke();

    // Bordes
    g.strokeStyle = '#ff6ec755';
    g.lineWidth = 3 * cam.z;
    for (const lado of [-1, 1]) {
      g.beginPath();
      for (let i = 0; i <= TRAZADO.length; i++) {
        const a = TRAZADO[i % TRAZADO.length], b = TRAZADO[(i + 1) % TRAZADO.length];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const nx = -Math.sin(ang) * (ANCHO_PISTA / 2) * lado, ny = Math.cos(ang) * (ANCHO_PISTA / 2) * lado;
        const [px, py] = aPantalla(a[0] + nx, a[1] + ny);
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.stroke();
    }

    // Meta a cuadros
    const a = TRAZADO[0], b = TRAZADO[1];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    for (let k = -3; k < 3; k++) {
      const nx = -Math.sin(ang) * k * 18, ny = Math.cos(ang) * k * 18;
      const [px, py] = aPantalla(a[0] + nx, a[1] + ny);
      g.fillStyle = k % 2 ? '#ffffff' : '#111';
      g.save(); g.translate(px, py); g.rotate(ang);
      g.fillRect(-5 * cam.z, -9 * cam.z, 10 * cam.z, 18 * cam.z);
      g.restore();
    }
  }

  function dibujarKart(g, k) {
    const [px, py] = aPantalla(k.x, k.y);
    const s = cam.z;
    g.save();
    g.translate(px, py);
    g.rotate(k.ang + k.derrape * 0.4 * Math.sign(input.player(k.i).x || 1));

    if (k.turbo > 0) {
      g.save(); g.globalAlpha = 0.7; g.shadowColor = '#ffd166'; g.shadowBlur = 22;
      g.fillStyle = '#ffd166';
      g.beginPath(); g.moveTo(-16 * s, -6 * s); g.lineTo(-36 * s, 0); g.lineTo(-16 * s, 6 * s); g.closePath(); g.fill();
      g.restore();
    }

    g.shadowColor = players[k.i].color; g.shadowBlur = 14 * s;
    g.fillStyle = k.aturdido > 0 ? '#ffffff' : players[k.i].color;
    g.beginPath();
    g.moveTo(18 * s, 0); g.lineTo(-12 * s, -11 * s); g.lineTo(-8 * s, 0); g.lineTo(-12 * s, 11 * s);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = '#0a0a12';
    g.fillRect(-2 * s, -7 * s, 8 * s, 14 * s);

    if (k.escudo > 0) {
      g.strokeStyle = '#6fd0f0'; g.lineWidth = 2.5 * s;
      g.globalAlpha = 0.5 + Math.sin(tiempo * 9) * 0.25;
      g.beginPath(); g.arc(0, 0, 26 * s, 0, TAU); g.stroke();
    }
    g.restore();

    // Nombre encima
    ctx.engine.text(players[k.i].name, px, py - 30 * s, {
      size: Math.max(9, 11 * s), color: players[k.i].color, font: 'system-ui',
    });
  }

  return {
    init() { cam.x = TRAZADO[0][0]; cam.y = TRAZADO[0][1]; },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      if (estado === 'fin') return;
      if (avisoT > 0) avisoT -= dt;

      if (cuenta > 0) {
        cuenta -= dt;
        actualizarCamara(dt);
        return;
      }

      tiempo += dt;
      for (const k of kart) if (!k.terminado) conducir(k, dt);
      moverMisiles(dt);
      for (let i = manchas.length - 1; i >= 0; i--) {
        manchas[i].vida -= dt;
        if (manchas[i].vida <= 0) manchas.splice(i, 1);
      }
      actualizarCamara(dt);
      particles.update(dt);

      // Rastro de derrape
      for (const k of kart) {
        if (k.derrape > 0.4 && Math.abs(k.vel) > 100 && Math.random() < 0.5) {
          particles.burst(k.x, k.y, 1, { speed: 20, dir: k.ang + Math.PI, spread: 0.6, color: '#ffffff44', size: 2.2, drag: 0.95 });
        }
      }

      if (kart[0].terminado && kart[1].terminado) terminarCarrera();
      else if (kart.some((k) => k.terminado) && tiempo > (kart.find((k) => k.terminado).tFinal + 12)) terminarCarrera();
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1410');

      dibujarPista(g);

      // Manchas
      for (const m of manchas) {
        const [px, py] = aPantalla(m.x, m.y);
        g.save(); g.globalAlpha = clamp(m.vida / 4, 0, 0.8); g.fillStyle = '#9a7fb8';
        g.beginPath(); g.ellipse(px, py, 26 * cam.z, 20 * cam.z, 0, 0, TAU); g.fill(); g.restore();
      }

      particles.render(g);

      // Misiles
      for (const m of misiles) {
        const [px, py] = aPantalla(m.x, m.y);
        g.save(); g.translate(px, py); g.rotate(m.ang);
        g.shadowColor = '#ff4757'; g.shadowBlur = 14; g.fillStyle = '#ff4757';
        g.beginPath(); g.moveTo(10 * cam.z, 0); g.lineTo(-7 * cam.z, -5 * cam.z); g.lineTo(-7 * cam.z, 5 * cam.z); g.closePath(); g.fill();
        g.restore();
      }

      for (const k of kart) dibujarKart(g, k);

      // HUD
      const orden = posiciones();
      for (let i = 0; i < 2; i++) {
        const k = kart[i];
        const x = i === 0 ? 16 : W - 16;
        const al = i === 0 ? 'left' : 'right';
        const pos = orden.indexOf(i) + 1;
        ctx.engine.text(`${pos}º · ${players[i].name}`, x, 24, { size: 13, color: players[i].color, align: al, font: 'system-ui' });
        ctx.engine.text(`Vuelta ${Math.min(k.vuelta, VUELTAS)}/${VUELTAS}`, x, 42, { size: 11, color: '#ffffff88', align: al, font: 'system-ui' });
        if (k.objeto) {
          const o = OBJETOS.find((z) => z.id === k.objeto);
          ctx.engine.text(`[${o.nom}]`, x, 60, { size: 11.5, color: o.col, align: al, font: 'system-ui' });
        }
        // Carga de derrape
        if (k.cargaTurbo > 0.2) {
          const bw = 54, bx = i === 0 ? 16 : W - 16 - bw;
          g.fillStyle = '#00000066'; g.fillRect(bx, 68, bw, 5);
          g.fillStyle = k.cargaTurbo > 0.75 ? '#ffd166' : '#ffffff77';
          g.fillRect(bx, 68, bw * clamp(k.cargaTurbo / 1.2, 0, 1), 5);
        }
      }

      ctx.engine.text(`${tiempo.toFixed(1)}s`, W / 2, 24, { size: 14, color: '#ffffff' });

      if (cuenta > 0) {
        const n = Math.ceil(cuenta);
        ctx.engine.text(n > 3 ? 'PREPARADOS' : n > 0 ? String(n) : '¡YA!', W / 2, H / 2, { size: 44, color: '#ffd166', glow: 20 });
      }
      if (avisoT > 0) ctx.engine.text(aviso, W / 2, H - 34, { size: 12.5, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('↑ acelerar · ↓ frenar · ←/→ girar · B: derrapar (carga turbo) · A: objeto',
        W / 2, H - 12, { size: 10.5, color: '#ffffff55', font: 'system-ui' });
    },

    destroy() {},
  };
}
