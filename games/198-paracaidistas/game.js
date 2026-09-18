/**
 * Paracaidistas — caer es gratis, aterrizar no.
 *
 * Se salta a la vez y se cae a la vez, pero el paracaídas es de un solo uso y
 * el momento de abrirlo lo decide cada uno. Abrir pronto da control y te deja
 * a merced del viento; abrir tarde te lleva donde quieres pero puede no darte
 * tiempo a frenar.
 *
 * La diana se mueve, así que apuntar a donde está es apuntar a donde YA no
 * estará. Puntúa la distancia al centro y la velocidad de llegada: clavar el
 * centro a toda leche no vale de nada.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const SALTOS = 5;
const ALTURA = 1500;
const GRAVEDAD = 460;
const VEL_SEGURA = 130;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [crear(0), crear(1)];
  let diana = { x: 0.5, dir: 1, vel: 0.1 };
  let viento = 0, salto = 1, fase = 'cayendo', espera = 0, t = 0, terminado = false;
  let sb = null, mensaje = '';

  function crear(i) {
    return { i, x: 0.5, y: 0, vx: 0, vy: 0, abierto: false, posado: false, puntos: 0, ultima: 0 };
  }

  function nuevoSalto() {
    viento = (rng() - 0.5) * 0.34;
    diana = { x: 0.2 + rng() * 0.6, dir: rng() < 0.5 ? -1 : 1, vel: 0.05 + rng() * 0.13 };
    for (const p of jug) {
      p.x = 0.5 + (p.i === 0 ? -0.06 : 0.06);
      p.y = ALTURA;
      p.vx = 0;
      p.vy = 40;
      p.abierto = false;
      p.posado = false;
    }
    fase = 'cayendo';
    mensaje = '';
  }

  function posar(p) {
    p.posado = true;
    const dist = Math.abs(p.x - diana.x);
    const vel = Math.abs(p.vy);
    let gana = 0;
    if (vel > VEL_SEGURA) {
      gana = 0;
      p.ultima = 0;
      mensaje = `${players[p.i].name} llega demasiado rápido`;
      audio.explosion();
      haptics.explosion(p.i);
      ctx.shake(12);
    } else {
      const cerca = clamp(1 - dist / 0.28, 0, 1);
      const suave = clamp(1 - vel / VEL_SEGURA, 0, 1);
      gana = Math.round(cerca * 80 + suave * 40);
      p.ultima = gana;
      audio.score(p.i);
      haptics.score(p.i);
      particles.burst(p.x * W, H * 0.86, 16, { speed: 180, color: players[p.i].color, size: 4, drag: 0.9 });
    }
    p.puntos += gana;
    sb.update(jug[0].puntos, jug[1].puntos);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevoSalto();
      sb = ui.scoreboard({ center: `salto 1 de ${SALTOS}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      diana.x += diana.dir * diana.vel * dt;
      if (diana.x < 0.12) { diana.x = 0.12; diana.dir = 1; }
      if (diana.x > 0.88) { diana.x = 0.88; diana.dir = -1; }

      if (fase === 'resultado') {
        espera -= dt;
        if (espera <= 0) {
          if (salto >= SALTOS) {
            terminado = true;
            const g = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
            ctx.finish({
              winner: g, scores: [jug[0].puntos, jug[1].puntos],
              detail: `${SALTOS} saltos`,
              record: ctx.record('puntos', Math.max(jug[0].puntos, jug[1].puntos), 'high'),
            });
            return;
          }
          salto++;
          sb.setCenter(`salto ${salto} de ${SALTOS}`);
          nuevoSalto();
        }
        return;
      }

      for (const p of jug) {
        if (p.posado) continue;
        const pl = input.player(p.i);
        if (pl.pressed('a') && !p.abierto) {
          p.abierto = true;
          audio.swoosh();
          haptics.tap(p.i);
          particles.burst(p.x * W, H * 0.5, 12, { speed: 130, color: players[p.i].color, size: 3, drag: 0.9 });
        }

        if (p.abierto) {
          // Con el paracaídas abierto se frena mucho y se puede dirigir un poco.
          p.vy += (GRAVEDAD - p.vy * 4.2) * dt;
          p.vx += (pl.ax * 0.16 + viento) * dt;
          p.vx *= Math.pow(0.35, dt);
        } else {
          p.vy += GRAVEDAD * dt;
          p.vx += (pl.ax * 0.05 + viento * 0.35) * dt;
          p.vx *= Math.pow(0.7, dt);
        }
        p.y -= p.vy * dt;
        p.x = clamp(p.x + p.vx * dt, 0.03, 0.97);

        if (p.y <= 0) { p.y = 0; posar(p); }
      }

      if (jug.every((p) => p.posado)) {
        fase = 'resultado';
        espera = 2.2;
        if (!mensaje) {
          const g = jug[0].ultima === jug[1].ultima ? -1 : (jug[0].ultima > jug[1].ultima ? 0 : 1);
          mensaje = g < 0 ? 'Empate en el salto' : `${players[g].name} clava el salto (+${jug[g].ultima})`;
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1a2e');

      const cielo = g.createLinearGradient(0, 0, 0, H);
      cielo.addColorStop(0, '#0b1b3a');
      cielo.addColorStop(0.7, '#3d6a96');
      cielo.addColorStop(1, '#8fb0c8');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, H);

      // Nubes con paralaje según la altura media.
      const alturaMedia = (jug[0].y + jug[1].y) / 2;
      for (let i = 0; i < 8; i++) {
        const base = (i * 371) % ALTURA;
        const y = H * 0.8 - (base - alturaMedia) * 0.32;
        if (y < -60 || y > H + 60) continue;
        const x = ((i * 233) % W);
        g.fillStyle = '#ffffff22';
        for (const [ox2, oy2, r] of [[0, 0, 40], [36, 8, 30], [-34, 10, 26]]) {
          g.beginPath(); g.arc(x + ox2, y + oy2, r, 0, TAU); g.fill();
        }
      }

      // Suelo y diana
      g.fillStyle = '#2f4a2c';
      g.fillRect(0, H * 0.86, W, H * 0.14);
      const dx = diana.x * W;
      for (const [r, c] of [[52, '#f2f2ff'], [34, '#ff4757'], [16, '#f2f2ff'], [6, '#ff4757']]) {
        g.fillStyle = c;
        g.beginPath(); g.ellipse(dx, H * 0.9, r, r * 0.34, 0, 0, TAU); g.fill();
      }

      particles.render(g);

      for (const p of jug) {
        const alturaPantalla = H * 0.86 - (p.y / ALTURA) * (H * 0.76);
        const px = p.x * W;
        if (p.abierto && !p.posado) {
          g.save();
          g.fillStyle = players[p.i].color;
          g.shadowColor = players[p.i].color;
          g.shadowBlur = 14;
          g.beginPath();
          g.arc(px, alturaPantalla - 42, 30, Math.PI, 0);
          g.fill();
          g.restore();
          g.strokeStyle = '#ffffff88';
          g.lineWidth = 1.5;
          for (const o of [-24, 0, 24]) {
            g.beginPath(); g.moveTo(px + o, alturaPantalla - 42); g.lineTo(px, alturaPantalla - 14); g.stroke();
          }
        }
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), px, alturaPantalla, 46, {
          pose: p.posado ? 'quieto' : 'salta',
          acento: players[p.i].color,
          mirando: p.vx >= 0 ? 1 : -1,
        });
        if (!p.posado) {
          ctx.engine.text(`${Math.round(p.y)} m · ${Math.round(Math.abs(p.vy))}`, px, alturaPantalla - 62, {
            size: 11,
            color: Math.abs(p.vy) > VEL_SEGURA && p.y < 300 ? '#ff4757' : players[p.i].color,
            font: 'system-ui',
          });
        }
      }

      // Viento
      const vx = W / 2 + viento * 400;
      g.strokeStyle = '#ffffff44';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(W / 2, 26); g.lineTo(vx, 26); g.stroke();
      ctx.engine.text(`viento ${viento > 0 ? '→' : '←'} ${Math.abs(viento * 100).toFixed(0)}`,
        W / 2, 44, { size: 11, color: '#dfe8f8', font: 'system-ui' });

      if (mensaje) ctx.engine.text(mensaje, W / 2, H * 0.78, { size: 17, color: '#ffd166', glow: 10 });

      ctx.engine.text('Tu tecla abre el paracaídas (solo una vez) · frena antes de tocar y cae cerca del centro',
        W / 2, H - 10, { size: 11, color: '#405a70', font: 'system-ui' });
    },
  };
}
