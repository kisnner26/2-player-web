/**
 * Chocones — autos de choque de feria sobre una pista que se rompe.
 *
 * Los coches no frenan: giran. Toda la pelea es de morro contra costado,
 * porque el golpe reparte según el ángulo — embestir de frente a alguien que
 * viene de frente casi no mueve a nadie, y pillarlo de lado lo manda a tomar
 * viento. Buscar el costado es el juego entero.
 *
 * La pista pierde una baldosa cada pocos segundos. No es decoración: los
 * huecos se tragan a quien pase por encima, así que al final quedan dos coches
 * peleando en un pasillo.
 */

import { TAU, clamp, angleDiff } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const ACEL = 560;
const MARCHA_ATRAS = 300;
const GIRO = 3.0;              // rad/s a velocidad de crucero
const VEL_MAX = 330;
const CAIDA_BALDOSA = 3.2;     // segundos entre desprendimientos
const REJILLA = 7;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let pistaX = 0, pistaY = 0, lado = 0;
  let baldosas = [];            // 0 = firme, >0 = temblando, -1 = agujero
  const jug = [crear(0), crear(1)];
  let sb = null, pausa = 0, ronda = 1, fuera = -1, relojBaldosa = 0;

  function crear(i) {
    return { i, x: 0, y: 0, vx: 0, vy: 0, r: 22, ang: 0, score: 0, vivo: true,
             turbo: 1, golpe: 0, cayendo: 0 };
  }

  function nuevaRonda() {
    lado = Math.min(W * 0.8, H * 0.74) / REJILLA;
    pistaX = (W - lado * REJILLA) / 2;
    pistaY = (H - lado * REJILLA) / 2 + 10;
    baldosas = new Array(REJILLA * REJILLA).fill(0);
    for (const p of jug) {
      p.x = pistaX + lado * (p.i === 0 ? 1.5 : REJILLA - 1.5);
      p.y = pistaY + lado * (REJILLA / 2);
      p.vx = p.vy = 0;
      p.ang = p.i === 0 ? 0 : Math.PI;
      p.vivo = true;
      p.turbo = 1;
      p.golpe = 0;
      p.cayendo = 0;
    }
    relojBaldosa = CAIDA_BALDOSA;
    fuera = -1;
    pausa = 0;
  }

  const celdaDe = (x, y) => {
    const cx = Math.floor((x - pistaX) / lado);
    const cy = Math.floor((y - pistaY) / lado);
    if (cx < 0 || cy < 0 || cx >= REJILLA || cy >= REJILLA) return -1;
    return cy * REJILLA + cx;
  };

  function tirarBaldosa() {
    const libres = [];
    for (let k = 0; k < baldosas.length; k++) {
      if (baldosas[k] !== 0) continue;
      const cx = k % REJILLA, cy = Math.floor(k / REJILLA);
      // Nunca justo debajo de un coche: sería una muerte sin aviso.
      const ocupada = jug.some((p) => p.vivo && celdaDe(p.x, p.y) === k);
      if (!ocupada) libres.push({ k, borde: Math.min(cx, cy, REJILLA - 1 - cx, REJILLA - 1 - cy) });
    }
    if (!libres.length) return;
    // Se cae antes lo de fuera: la pista se estrecha hacia el centro.
    libres.sort((a, b) => a.borde - b.borde || rng() - 0.5);
    const elegida = libres[Math.floor(rng() * Math.min(4, libres.length))];
    baldosas[elegida.k] = 1.2;
    audio.tone({ freq: 180, dur: 0.18, gain: 0.14, type: 'sawtooth', sweep: -60 });
  }

  function caer(p) {
    if (!p.vivo || fuera >= 0) return;
    p.vivo = false;
    fuera = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.explosion();
    haptics.defeat(p.i);
    ctx.shake(11);
    particles.burst(p.x, p.y, 24, { speed: 180, color: players[p.i].color, size: 5, gravity: 400 });
    pausa = 1.5;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      particles.update(dt);

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          ronda++;
          sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
          nuevaRonda();
        }
        return;
      }

      relojBaldosa -= dt;
      if (relojBaldosa <= 0) { relojBaldosa = CAIDA_BALDOSA; tirarBaldosa(); }
      for (let k = 0; k < baldosas.length; k++) {
        if (baldosas[k] > 0) {
          baldosas[k] -= dt;
          if (baldosas[k] <= 0) {
            baldosas[k] = -1;
            const cx = pistaX + (k % REJILLA + 0.5) * lado;
            const cy = pistaY + (Math.floor(k / REJILLA) + 0.5) * lado;
            particles.burst(cx, cy, 14, { speed: 120, color: '#4a3c66', size: 5, gravity: 600 });
            audio.thud();
          }
        }
      }

      for (const p of jug) {
        if (!p.vivo) continue;
        const pl = input.player(p.i);
        p.golpe = Math.max(0, p.golpe - dt);

        const vel = Math.hypot(p.vx, p.vy);
        // Girar en parado no debería funcionar: es un coche, no un tanque.
        const giro = pl.ax * GIRO * clamp(0.25 + vel / VEL_MAX, 0.25, 1.2);
        p.ang += giro * dt;

        const acelerar = pl.held('up') || pl.held('a');
        const atras = pl.held('down');
        if (acelerar) {
          p.vx += Math.cos(p.ang) * ACEL * p.turbo * dt;
          p.vy += Math.sin(p.ang) * ACEL * p.turbo * dt;
          if (rng() < dt * 22) {
            particles.spawn({ x: p.x - Math.cos(p.ang) * 20, y: p.y - Math.sin(p.ang) * 20,
              vx: -Math.cos(p.ang) * 60, vy: -Math.sin(p.ang) * 60,
              life: 0.3, maxLife: 0.3, size: 4, color: `${players[p.i].color}88` });
          }
        }
        if (atras) {
          p.vx -= Math.cos(p.ang) * MARCHA_ATRAS * dt;
          p.vy -= Math.sin(p.ang) * MARCHA_ATRAS * dt;
        }

        // Agarre lateral: se cancela parte de la velocidad perpendicular al
        // morro. Sin esto el coche patina como un disco y no se siente coche.
        const fx = Math.cos(p.ang), fy = Math.sin(p.ang);
        const along = p.vx * fx + p.vy * fy;
        const perpX = p.vx - fx * along, perpY = p.vy - fy * along;
        const agarre = Math.pow(0.06, dt);
        p.vx = fx * along + perpX * agarre;
        p.vy = fy * along + perpY * agarre;

        const v2 = Math.hypot(p.vx, p.vy);
        if (v2 > VEL_MAX) { p.vx *= VEL_MAX / v2; p.vy *= VEL_MAX / v2; }
        p.vx *= Math.pow(0.65, dt);
        p.vy *= Math.pow(0.65, dt);

        p.x += p.vx * dt;
        p.y += p.vy * dt;

        const c = celdaDe(p.x, p.y);
        if (c < 0 || baldosas[c] === -1) { caer(p); break; }
      }

      // Choque: el reparto depende del ángulo entre el morro del que embiste
      // y la normal del contacto. Pillar de costado multiplica el empujón.
      const [a, b] = jug;
      if (a.vivo && b.vivo) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d < a.r + b.r) {
          const nx = dx / d, ny = dy / d;
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            // ¿Quién embiste? El que más alineado va con la normal.
            const aliA = Math.cos(angleDiff(a.ang, Math.atan2(ny, nx)));
            const aliB = Math.cos(angleDiff(b.ang, Math.atan2(-ny, -nx)));
            const ventajaA = clamp(aliA - aliB, -1, 1);
            const j = -rel * 1.5;
            const repA = 0.5 - ventajaA * 0.42;
            const repB = 0.5 + ventajaA * 0.42;
            a.vx -= nx * j * repA * 2; a.vy -= ny * j * repA * 2;
            b.vx += nx * j * repB * 2; b.vy += ny * j * repB * 2;
            a.golpe = b.golpe = 0.28;
            audio.hit();
            haptics.impact(null, clamp(Math.abs(rel) / 300, 0.5, 1.5));
            ctx.shake(clamp(Math.abs(rel) / 45, 4, 13));
            particles.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 16,
              { speed: 250, color: '#ffd166', size: 4, shape: 'spark', drag: 0.9 });
          }
          const sep = (a.r + b.r - d) / 2 + 0.5;
          a.x -= nx * sep; a.y -= ny * sep;
          b.x += nx * sep; b.y += ny * sep;
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#080614');

      for (let k = 0; k < baldosas.length; k++) {
        const cx = pistaX + (k % REJILLA) * lado;
        const cy = pistaY + Math.floor(k / REJILLA) * lado;
        const est = baldosas[k];
        if (est === -1) continue;
        const temblor = est > 0 ? (rng() - 0.5) * 4 : 0;
        g.fillStyle = est > 0 ? '#3a2140' : ((k + Math.floor(k / REJILLA)) % 2 ? '#1c1630' : '#221a38');
        g.fillRect(cx + temblor + 1, cy + temblor + 1, lado - 2, lado - 2);
        if (est > 0) {
          g.strokeStyle = `rgba(255,71,87,${0.4 + Math.sin(est * 30) * 0.4})`;
          g.lineWidth = 2;
          g.strokeRect(cx + 2, cy + 2, lado - 4, lado - 4);
        }
      }
      g.strokeStyle = '#ffd16655';
      g.lineWidth = 2;
      g.strokeRect(pistaX, pistaY, lado * REJILLA, lado * REJILLA);

      particles.render(g);

      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.ang);
        // Chasis
        g.save();
        g.shadowColor = col;
        g.shadowBlur = p.golpe > 0 ? 30 : 14;
        g.fillStyle = col;
        g.beginPath();
        g.roundRect(-p.r, -p.r * 0.72, p.r * 2, p.r * 1.44, 7);
        g.fill();
        g.restore();
        // Parachoques delantero: enseña dónde pega
        g.fillStyle = '#ffffffcc';
        g.fillRect(p.r - 5, -p.r * 0.8, 5, p.r * 1.6);
        g.restore();

        // Conductor, sin rotar: se le tiene que ver la cara.
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + 6, 30, {
          pose: 'quieto', acento: col, mirando: Math.cos(p.ang) >= 0 ? 1 : -1,
        });
      }

      ctx.engine.text('Acelera con tu tecla · gira con izquierda/derecha · píllalo de costado y échalo al agujero',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
