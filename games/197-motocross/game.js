/**
 * Motocross — el acelerador es lo fácil; el equilibrio es el juego.
 *
 * Dar gas levanta el morro y frenar lo hunde. En una subida hay que echarse
 * adelante o vuelcas hacia atrás; al caer de un salto hay que enderezar antes
 * de tocar. Nadie pierde por ir despacio: se pierde por ir rápido en el sitio
 * equivocado.
 *
 * El terreno es el mismo para los dos, generado una vez y compartido, así que
 * la carrera se puede comentar en directo — "¡el badén de después de la
 * rampa!" — y eso es media diversión.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const META = 4200;
const GRAVEDAD = 1500;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let terreno = [];
  const jug = [crear(0), crear(1)];
  let sb = null, t = 0, terminado = false;

  function crear(i) {
    return { i, x: 40, y: 0, vx: 0, vy: 0, ang: 0, vang: 0, suelo: true, caidas: 0, reinicio: 0 };
  }

  function generar() {
    terreno = [];
    let y = 0;
    for (let x = 0; x <= META + 900; x += 24) {
      // Suma de senos: colinas grandes con rizado encima, más un salto ocasional.
      y = Math.sin(x * 0.0022) * 90 + Math.sin(x * 0.0071) * 34 + Math.sin(x * 0.017) * 11;
      if (x > 600 && Math.floor(x / 700) % 3 === 1 && (x % 700) < 140) y -= 60;
      terreno.push(y);
    }
  }

  /** Altura del terreno interpolada, en coordenadas de mundo. */
  function alturaEn(x) {
    const i = clamp(x / 24, 0, terreno.length - 2);
    const k = Math.floor(i), f = i - k;
    return terreno[k] * (1 - f) + terreno[k + 1] * f;
  }
  const pendienteEn = (x) => Math.atan2(alturaEn(x + 12) - alturaEn(x - 12), 24);

  function caer(p) {
    p.caidas++;
    p.reinicio = 1.2;
    p.vx = 0; p.vy = 0;
    p.ang = 0; p.vang = 0;
    p.x = Math.max(0, p.x - 120);
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(10);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      for (const p of jug) { p.x = 40; p.y = alturaEn(40); }
      sb = ui.scoreboard({ center: 'a la meta' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const p of jug) {
        if (p.reinicio > 0) { p.reinicio -= dt; continue; }
        const pl = input.player(p.i);
        const gas = pl.held('a') || pl.held('right');
        const freno = pl.held('down') || pl.held('b');
        const inclina = (pl.held('up') ? -1 : 0) + (pl.held('left') ? 1 : 0);

        const suelo = alturaEn(p.x);
        p.suelo = p.y >= suelo - 2;

        if (p.suelo) {
          const pend = pendienteEn(p.x);
          // El motor empuja a lo largo de la pendiente y la gravedad frena.
          if (gas) p.vx += (330 * Math.cos(pend)) * dt;
          if (freno) p.vx -= 420 * dt;
          p.vx -= Math.sin(pend) * GRAVEDAD * 0.55 * dt;
          p.vx *= Math.pow(0.62, dt);
          p.vx = Math.max(0, p.vx);
          // Gas levanta el morro, freno lo hunde.
          p.vang += ((gas ? -2.1 : 0) + (freno ? 1.7 : 0)) * dt;
          p.ang += (pend - p.ang) * Math.min(1, dt * 12);
          p.y = suelo;
          p.vy = 0;
          if (p.vx > 60 && rng() < dt * 26) {
            particles.spawn({
              x: 0, y: 0, vx: -p.vx * 0.3, vy: -40 - rng() * 60,
              life: 0.4, maxLife: 0.4, size: 3, color: '#6b5a3e',
              mundoX: p.x - 18, mundoY: p.y,
            });
          }
        } else {
          p.vy += GRAVEDAD * dt;
          p.y += p.vy * dt;
          p.ang += p.vang * dt;
        }

        p.vang += inclina * 3.4 * dt;
        p.vang *= Math.pow(p.suelo ? 0.02 : 0.6, dt);
        p.vang = clamp(p.vang, -5, 5);
        p.x += p.vx * dt;

        // Despegue: si el suelo baja más rápido que la moto, vuela.
        if (p.suelo && alturaEn(p.x) > p.y + 6 && p.vx > 120) {
          p.suelo = false;
          p.vy = -60;
        }

        // Volcar: solo cuenta al tocar suelo con el ángulo muy pasado.
        if (p.suelo && Math.abs(p.ang - pendienteEn(p.x)) > 1.35) caer(p);
        if (!p.suelo && Math.abs(p.ang) > 3.4) { p.ang = 0; p.vang = 0; }

        if (p.x >= META) {
          terminado = true;
          audio.win();
          haptics.victory(p.i);
          ctx.finish({
            winner: p.i,
            scores: [Math.round(jug[0].x), Math.round(jug[1].x)],
            detail: `${p.caidas} caídas · ${Math.round(t)} s`,
            record: ctx.record('tiempo', Math.round(t), 'low'),
          });
          return;
        }
      }

      sb.update(Math.round((jug[0].x / META) * 100), Math.round((jug[1].x / META) * 100));
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0e1622');

      const cielo = g.createLinearGradient(0, 0, 0, H);
      cielo.addColorStop(0, '#1c2c48');
      cielo.addColorStop(1, '#3a3a52');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, H);

      // Pantalla partida horizontal: cada uno su carril con su cámara.
      for (const p of jug) {
        const alto = H / 2;
        const top = p.i * alto;
        g.save();
        g.beginPath();
        g.rect(0, top, W, alto - 2);
        g.clip();

        const camX = p.x - W * 0.32;
        const camY = p.y - alto * 0.55;
        const mundo = (wx, wy) => ({ x: wx - camX, y: wy - camY + top });

        // Montañas de fondo
        g.fillStyle = '#26304a';
        g.beginPath();
        g.moveTo(0, top + alto);
        for (let sx = 0; sx <= W; sx += 30) {
          const wx = camX * 0.4 + sx;
          g.lineTo(sx, top + alto * 0.5 + Math.sin(wx * 0.001) * 40 + Math.sin(wx * 0.004) * 14);
        }
        g.lineTo(W, top + alto);
        g.fill();

        // Terreno
        g.fillStyle = '#4a3a26';
        g.beginPath();
        g.moveTo(-10, top + alto);
        for (let sx = -10; sx <= W + 10; sx += 8) {
          const wx = camX + sx;
          const pt = mundo(wx, alturaEn(wx));
          g.lineTo(pt.x, pt.y);
        }
        g.lineTo(W + 10, top + alto);
        g.fill();
        g.strokeStyle = '#7a6444';
        g.lineWidth = 3;
        g.beginPath();
        for (let sx = -10; sx <= W + 10; sx += 8) {
          const wx = camX + sx;
          const pt = mundo(wx, alturaEn(wx));
          g.lineTo(pt.x, pt.y);
        }
        g.stroke();

        // Meta
        const m = mundo(META, alturaEn(META));
        for (let k = 0; k < 8; k++) {
          g.fillStyle = k % 2 ? '#ffffff' : '#20202e';
          g.fillRect(m.x, m.y - 110 + k * 14, 14, 14);
        }

        // Partículas de tierra de este jugador
        for (const q of particles.list) {
          if (q.mundoX === undefined) continue;
          const pt = mundo(q.mundoX + (q.x || 0), q.mundoY + (q.y || 0));
          g.globalAlpha = clamp(q.life / q.maxLife, 0, 1);
          g.fillStyle = q.color;
          g.fillRect(pt.x, pt.y, q.size, q.size);
          g.globalAlpha = 1;
        }

        // Moto
        const pos = mundo(p.x, p.y);
        g.save();
        g.translate(pos.x, pos.y);
        g.rotate(p.ang);
        g.strokeStyle = '#1a1a24';
        g.lineWidth = 4;
        g.beginPath(); g.arc(-20, -13, 13, 0, TAU); g.stroke();
        g.beginPath(); g.arc(20, -13, 13, 0, TAU); g.stroke();
        g.fillStyle = players[p.i].color;
        g.beginPath();
        g.roundRect(-20, -30, 40, 14, 5);
        g.fill();
        g.restore();
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), pos.x, pos.y - 24, 44, {
          pose: p.suelo ? 'quieto' : 'salta',
          acento: players[p.i].color,
          mirando: 1,
          alpha: p.reinicio > 0 ? 0.4 : 1,
        });

        g.restore();

        // HUD del carril
        ctx.engine.text(`${players[p.i].name} · ${Math.round((p.x / META) * 100)}% · ${p.caidas} caídas`,
          14, top + 20, { size: 12, color: players[p.i].color, align: 'left', font: 'system-ui' });
        if (p.reinicio > 0) {
          ctx.engine.text('¡al suelo!', W / 2, top + alto / 2, { size: 22, color: '#ff4757', glow: 12 });
        }
      }

      g.strokeStyle = '#00000088';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();

      ctx.engine.text('Tu tecla es el gas · ↑ y ← inclinan la moto · el gas levanta el morro',
        W / 2, H - 10, { size: 11, color: '#8a8aa8', font: 'system-ui' });
    },
  };
}
