/**
 * Atados — unidos por una cuerda elástica que tira de verdad.
 *
 * Cada uno se mueve libre hasta que la cuerda se tensa; a partir de ahí lo que
 * hace uno arrastra al otro. No se puede jugar en paralelo: hay que negociar
 * hacia dónde van, y eso es exactamente la gracia.
 *
 * La cuerda se simula como una cadena de puntos con restricciones de distancia
 * (Verlet), que es lo que le da ese balanceo pesado en vez de una línea recta.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 75;
const VEL = 260;
const R = 17;
const NODOS = 14;
const LARGO_CUERDA = 190;      // longitud total en reposo
const TENSION_MAX = 1.35;      // cuánto se puede estirar antes de tirar fuerte

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [{ i: 0, x: 0, y: 0, vx: 0, vy: 0 }, { i: 1, x: 0, y: 0, vx: 0, vy: 0 }];
  let cuerda = [];
  let corazones = [];
  let obstaculos = [];
  let puntos = 0, recogidos = 0, choques = 0;
  let tiempo = DURACION;
  let sb = null, terminado = false;
  let combo = 0, mejorCombo = 0;

  const segmento = () => LARGO_CUERDA / (NODOS - 1);

  function reiniciar() {
    jug[0].x = W * 0.42; jug[0].y = H * 0.5;
    jug[1].x = W * 0.58; jug[1].y = H * 0.5;
    cuerda = [];
    for (let i = 0; i < NODOS; i++) {
      const t = i / (NODOS - 1);
      const x = jug[0].x + (jug[1].x - jug[0].x) * t;
      const y = jug[0].y + (jug[1].y - jug[0].y) * t;
      cuerda.push({ x, y, px: x, py: y });
    }
    corazones = [];
    for (let i = 0; i < 5; i++) nuevoCorazon();
    obstaculos = [];
    for (let i = 0; i < 4; i++) nuevoObstaculo();
  }

  function nuevoCorazon() {
    corazones.push({
      x: 60 + rng() * (W - 120),
      y: 90 + rng() * (H - 180),
      r: 14,
      fase: rng() * TAU,
    });
  }

  function nuevoObstaculo() {
    // Se colocan lejos del centro para no ahogar el arranque.
    let x, y, intentos = 0;
    do {
      x = 80 + rng() * (W - 160);
      y = 110 + rng() * (H - 220);
      intentos++;
    } while (intentos < 20 && Math.hypot(x - W / 2, y - H / 2) < 160);
    obstaculos.push({ x, y, r: 22 + rng() * 16, fase: rng() * TAU });
  }

  /** Verlet + restricciones: la cuerda cuelga y rebota sola. */
  function simularCuerda(dt) {
    // Los extremos van pegados a cada jugador.
    cuerda[0].x = jug[0].x; cuerda[0].y = jug[0].y;
    cuerda[NODOS - 1].x = jug[1].x; cuerda[NODOS - 1].y = jug[1].y;

    for (let i = 1; i < NODOS - 1; i++) {
      const n = cuerda[i];
      const vx = (n.x - n.px) * 0.94;
      const vy = (n.y - n.py) * 0.94;
      n.px = n.x; n.py = n.y;
      n.x += vx;
      n.y += vy + 40 * dt;         // un poco de peso: la cuerda cuelga
    }

    // Varias pasadas de restricción = cuerda más rígida y estable.
    const seg = segmento();
    for (let paso = 0; paso < 6; paso++) {
      for (let i = 0; i < NODOS - 1; i++) {
        const a = cuerda[i], b = cuerda[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const dif = (d - seg) / d * 0.5;
        const ox = dx * dif, oy = dy * dif;
        if (i !== 0) { a.x += ox; a.y += oy; }
        if (i + 1 !== NODOS - 1) { b.x -= ox; b.y -= oy; }
      }
      cuerda[0].x = jug[0].x; cuerda[0].y = jug[0].y;
      cuerda[NODOS - 1].x = jug[1].x; cuerda[NODOS - 1].y = jug[1].y;
    }
  }

  /** Longitud real de la cuerda: mide cuánto se están estirando. */
  function tension() {
    let l = 0;
    for (let i = 0; i < NODOS - 1; i++) {
      l += Math.hypot(cuerda[i + 1].x - cuerda[i].x, cuerda[i + 1].y - cuerda[i].y);
    }
    return l / LARGO_CUERDA;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Recojan corazones <b>juntos</b> · la cuerda tira');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }

      tiempo -= dt;
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s · ${puntos} pts`);
      sb.update(recogidos, choques);
      if (tiempo <= 0) return terminar();

      const t = tension();

      for (const p of jug) {
        const pl = input.player(p.i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        // Cuanto más tensa la cuerda, más cuesta alejarse.
        const freno = t > 1 ? clamp(1 - (t - 1) / (TENSION_MAX - 1), 0.18, 1) : 1;
        p.x += (dx / len) * VEL * freno * dt;
        p.y += (dy / len) * VEL * freno * dt;
        p.x = clamp(p.x, R, W - R);
        p.y = clamp(p.y, R + 50, H - R);
      }

      // Si se pasan de tensión, la cuerda los junta de golpe.
      if (t > TENSION_MAX) {
        const mx = (jug[0].x + jug[1].x) / 2, my = (jug[0].y + jug[1].y) / 2;
        for (const p of jug) {
          p.x += (mx - p.x) * Math.min(1, dt * 6);
          p.y += (my - p.y) * Math.min(1, dt * 6);
        }
        if (Math.random() < dt * 6) haptics.play('soft');
      }

      simularCuerda(dt);

      // Corazones: los recoge cualquiera de los dos, o la cuerda al pasarles por encima.
      for (let i = corazones.length - 1; i >= 0; i--) {
        const c = corazones[i];
        c.fase += dt * 2;
        let tocado = jug.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < R + c.r);
        // Que la cuerda también cuente premia moverse coordinados.
        let porCuerda = false;
        if (!tocado) {
          for (const n of cuerda) {
            if (Math.hypot(n.x - c.x, n.y - c.y) < c.r + 6) { tocado = true; porCuerda = true; break; }
          }
        }
        if (!tocado) continue;

        corazones.splice(i, 1);
        recogidos++;
        combo++;
        mejorCombo = Math.max(mejorCombo, combo);
        const base = porCuerda ? 25 : 10;
        puntos += base * Math.min(5, combo);
        audio.pickup();
        haptics.play('score', { scale: 0.7 });
        particles.burst(c.x, c.y, 16, {
          speed: 190, color: '#ff6ec7', size: 5, shape: 'circle', gravity: -60,
        });
        if (porCuerda) ui.toast(`¡Con la cuerda! ×${Math.min(5, combo)}`, { ms: 900, color: '#ff6ec7' });
        nuevoCorazon();
      }

      // Obstáculos: rompen el combo si los toca alguien o la cuerda.
      for (const o of obstaculos) {
        o.fase += dt;
        const golpe = jug.some((p) => Math.hypot(p.x - o.x, p.y - o.y) < R + o.r)
          || cuerda.some((n) => Math.hypot(n.x - o.x, n.y - o.y) < o.r + 4);
        if (golpe && o.frio == null) {
          o.frio = 1;
          choques++;
          combo = 0;
          puntos = Math.max(0, puntos - 15);
          audio.error();
          haptics.error();
          ctx.shake(8);
          particles.burst(o.x, o.y, 14, { speed: 200, color: '#ff4757', size: 4 });
        }
        if (o.frio != null) {
          o.frio -= dt;
          if (o.frio <= 0) o.frio = null;
        }
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#150a1a');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#241030');
      grd.addColorStop(1, '#100616');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Obstáculos
      for (const o of obstaculos) {
        const pulso = 1 + Math.sin(o.fase * 2) * 0.06;
        g.save();
        g.shadowColor = o.frio ? '#ff4757' : '#7a5a8a';
        g.shadowBlur = o.frio ? 26 : 12;
        g.fillStyle = o.frio ? '#ff4757' : '#3d2a4d';
        g.beginPath();
        g.arc(o.x, o.y, o.r * pulso, 0, TAU);
        g.fill();
        g.restore();
        g.strokeStyle = '#6b4a7d';
        g.lineWidth = 2;
        g.beginPath(); g.arc(o.x, o.y, o.r * pulso, 0, TAU); g.stroke();
      }

      // Corazones
      for (const c of corazones) {
        const s = 1 + Math.sin(c.fase) * 0.12;
        corazon(g, c.x, c.y, c.r * s, '#ff6ec7', 22);
      }

      // Cuerda
      const t = tension();
      const colCuerda = t > TENSION_MAX * 0.92 ? '#ff4757' : t > 1.1 ? '#ffd166' : '#e8d5f0';
      g.save();
      g.strokeStyle = colCuerda;
      g.lineWidth = clamp(7 - t * 2.2, 2.5, 7);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = colCuerda;
      g.shadowBlur = t > 1.1 ? 18 : 8;
      g.beginPath();
      cuerda.forEach((n, i) => (i === 0 ? g.moveTo(n.x, n.y) : g.lineTo(n.x, n.y)));
      g.stroke();
      g.restore();

      particles.render(g);

      // Jugadores
      for (const p of jug) {
        const col = players[p.i].color;
        ctx.engine.glowCircle(p.x, p.y, R, col, 20);
        g.fillStyle = '#00000066';
        g.beginPath(); g.arc(p.x, p.y, R * 0.45, 0, TAU); g.fill();
      }

      // Combo
      if (combo > 1) {
        ctx.engine.text(`×${Math.min(5, combo)}`, W / 2, 58, {
          size: 20, color: '#ff6ec7', glow: 14,
        });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar() {
    terminado = true;
    let veredicto;
    if (puntos >= 700) veredicto = 'Se mueven como uno solo.';
    else if (puntos >= 400) veredicto = 'Buen equipo, poca discusión.';
    else if (puntos >= 200) veredicto = 'Se han estirado bastante…';
    else veredicto = 'Cada uno tirando para su lado. Clásico.';
    ctx.finish({
      winner: -1,
      scores: [recogidos, choques],
      detail: `${puntos} puntos · ${veredicto}`,
      record: ctx.record('puntos', puntos, 'high'),
    });
  }
}

function corazon(g, cx, cy, r, color, brillo = 0) {
  g.save();
  g.translate(cx, cy);
  g.scale(r / 100, r / 100);
  if (brillo) { g.shadowColor = color; g.shadowBlur = brillo; }
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, 40);
  g.bezierCurveTo(-70, -20, -50, -80, 0, -40);
  g.bezierCurveTo(50, -80, 70, -20, 0, 40);
  g.closePath();
  g.fill();
  g.restore();
}
