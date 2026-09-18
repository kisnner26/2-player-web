/**
 * Espejos Láser — un rayo que no para y dos espejos que sí obedecen.
 *
 * El emisor del centro dispara sin descanso y el haz rebota hasta ocho veces.
 * Nadie dispara: los dos jugadores solo orientan un espejo y lo deslizan por
 * su carril. El punto se lleva quien consiga que el rayo termine en el núcleo
 * del rival.
 *
 * Lo bonito es que el rayo es información perfecta y compartida: los dos veis
 * exactamente adónde va a ir antes de que llegue. La partida es una discusión
 * a dos manos sobre la misma línea, y cada giro del rival te obliga a rehacer
 * el tuyo. Girar rápido es fácil; girar en el ángulo correcto, no.
 */

import { TAU, clamp, segIntersect } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const REBOTES = 8;
const GIRO = 2.1;              // rad/s
const DESLIZ = 300;            // px/s por el carril
const MEDIO_ESPEJO = 46;
const CARGA = 1.35;            // segundos que tarda el rayo en hacer daño

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let emisorX = 0, emisorY = 0, emisorAng = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, pausa = 0, ronda = 1, perdio = -1, t = 0;
  let camino = [];
  let impacto = -1;             // jugador cuyo núcleo está recibiendo el rayo

  function crear(i) {
    return { i, score: 0, ang: i === 0 ? -Math.PI / 4 : Math.PI / 4, pos: 0.5,
             carril: { x: 0, y0: 0, y1: 0 }, nucleo: { x: 0, y: 0, r: 26 }, quemado: 0, escudo: 1 };
  }

  function nuevaRonda() {
    emisorX = W / 2;
    emisorY = H / 2;
    emisorAng = -Math.PI / 2;
    for (const p of jug) {
      const margen = W * 0.16;
      p.carril = { x: p.i === 0 ? margen : W - margen, y0: H * 0.18, y1: H * 0.82 };
      p.nucleo = { x: p.i === 0 ? W * 0.06 : W * 0.94, y: H / 2, r: Math.min(30, W * 0.03) };
      p.pos = 0.5;
      p.ang = p.i === 0 ? -Math.PI / 4 : Math.PI / 4;
      p.quemado = 0;
      p.escudo = 1;
    }
    perdio = -1;
    pausa = 0;
    impacto = -1;
  }

  const espejoY = (p) => p.carril.y0 + (p.carril.y1 - p.carril.y0) * p.pos;
  const espejoPuntos = (p) => {
    const y = espejoY(p);
    const dx = Math.cos(p.ang) * MEDIO_ESPEJO, dy = Math.sin(p.ang) * MEDIO_ESPEJO;
    return [p.carril.x - dx, y - dy, p.carril.x + dx, y + dy];
  };

  function fundir(p) {
    if (perdio >= 0) return;
    perdio = p.i;
    jug[1 - p.i].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(13);
    particles.burst(p.nucleo.x, p.nucleo.y, 34, {
      speed: 320, color: players[p.i].color, size: 5, drag: 0.92, shape: 'spark',
    });
    ui.toast(`${players[1 - p.i].name} funde el núcleo`, { ms: 1200, color: players[1 - p.i].color });
    pausa = 1.6;
  }

  /**
   * Traza el rayo rebotando en espejos y paredes.
   * Devuelve la polilínea y, si acaba en un núcleo, a quién pertenece.
   */
  function trazar() {
    const pts = [{ x: emisorX, y: emisorY }];
    let x = emisorX, y = emisorY;
    let dx = Math.cos(emisorAng), dy = Math.sin(emisorAng);
    let golpea = -1;

    for (let rebote = 0; rebote <= REBOTES; rebote++) {
      const x2 = x + dx * 4000, y2 = y + dy * 4000;
      let mejor = null;

      for (const p of jug) {
        const [ax, ay, bx, by] = espejoPuntos(p);
        const hit = segIntersect(x, y, x2, y2, ax, ay, bx, by);
        // Un `t` mínimo evita que el rayo se re-choque con el espejo del que sale.
        if (hit && hit.t > 1e-4 && (!mejor || hit.t < mejor.t)) {
          mejor = { ...hit, tipo: 'espejo', nx: -(by - ay), ny: bx - ax };
        }
      }

      for (const p of jug) {
        const n = p.nucleo;
        // Intersección rayo-círculo, solo hacia delante.
        const fx = x - n.x, fy = y - n.y;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - n.r * n.r;
        const disc = b * b - 4 * c;
        if (disc >= 0) {
          const raiz = Math.sqrt(disc);
          const t1 = (-b - raiz) / 2;
          if (t1 > 0.5) {
            const tt = t1 / 4000;
            if (!mejor || tt < mejor.t) mejor = { x: x + dx * t1, y: y + dy * t1, t: tt, tipo: 'nucleo', quien: p.i };
          }
        }
      }

      const paredes = [[0, 0, W, 0], [W, 0, W, H], [W, H, 0, H], [0, H, 0, 0]];
      for (const [px, py, qx, qy] of paredes) {
        const hit = segIntersect(x, y, x2, y2, px, py, qx, qy);
        if (hit && hit.t > 1e-4 && (!mejor || hit.t < mejor.t)) {
          mejor = { ...hit, tipo: 'pared', nx: -(qy - py), ny: qx - px };
        }
      }

      if (!mejor) { pts.push({ x: x2, y: y2 }); break; }
      pts.push({ x: mejor.x, y: mejor.y });
      if (mejor.tipo === 'nucleo') { golpea = mejor.quien; break; }

      const nl = Math.hypot(mejor.nx, mejor.ny) || 1;
      const nx = mejor.nx / nl, ny = mejor.ny / nl;
      const dot = dx * nx + dy * ny;
      dx -= 2 * dot * nx;
      dy -= 2 * dot * ny;
      x = mejor.x + dx * 0.5;
      y = mejor.y + dy * 0.5;
      // Las paredes se comen el rayo si rebota demasiado plano: evita bucles.
      if (mejor.tipo === 'pared' && Math.abs(dot) < 0.06) break;
    }
    return { pts, golpea };
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
      t += dt;
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

      // El emisor barre despacio: aunque los dos se queden quietos, la
      // situación cambia sola y nadie puede atrincherarse.
      emisorAng += 0.34 * dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        if (pl.held('up')) p.pos = clamp(p.pos - DESLIZ / (p.carril.y1 - p.carril.y0) * dt, 0, 1);
        if (pl.held('down')) p.pos = clamp(p.pos + DESLIZ / (p.carril.y1 - p.carril.y0) * dt, 0, 1);
        const giro = (pl.held('right') ? 1 : 0) - (pl.held('left') ? 1 : 0);
        if (giro) p.ang += giro * GIRO * dt;
        // Frenar el espejo cuesta escudo: es el recurso para aguantar un apuro.
        if (pl.held('a') && p.escudo > 0) {
          p.escudo = Math.max(0, p.escudo - dt * 0.7);
        } else {
          p.escudo = Math.min(1, p.escudo + dt * 0.18);
        }
      }

      const trazo = trazar();
      camino = trazo.pts;
      impacto = trazo.golpea;

      for (const p of jug) {
        const recibiendo = impacto === p.i;
        const pl = input.player(p.i);
        const protegido = pl.held('a') && p.escudo > 0;
        if (recibiendo && !protegido) {
          p.quemado += dt;
          if (Math.random() < dt * 40) {
            particles.spawn({ x: p.nucleo.x + (Math.random() - 0.5) * 40, y: p.nucleo.y + (Math.random() - 0.5) * 40,
              vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200,
              life: 0.35, maxLife: 0.35, size: 3, color: '#ffd166', shape: 'spark' });
          }
          if (p.quemado > CARGA) { fundir(p); break; }
          if (Math.random() < dt * 6) audio.tone({ freq: 200 + p.quemado * 400, dur: 0.06, gain: 0.1, type: 'sawtooth' });
        } else if (recibiendo && protegido) {
          particles.spawn({ x: p.nucleo.x, y: p.nucleo.y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2,
            size: 8, color: '#3effc8', shape: 'circle' });
        } else {
          p.quemado = Math.max(0, p.quemado - dt * 0.9);
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#03040c');

      g.strokeStyle = '#ffffff08';
      g.lineWidth = 1;
      for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      // Carriles
      for (const p of jug) {
        g.strokeStyle = `${players[p.i].color}22`;
        g.lineWidth = 3;
        g.setLineDash([6, 8]);
        g.beginPath(); g.moveTo(p.carril.x, p.carril.y0); g.lineTo(p.carril.x, p.carril.y1); g.stroke();
        g.setLineDash([]);
      }

      // Rayo
      if (camino.length > 1) {
        g.save();
        g.strokeStyle = '#ff2e88';
        g.shadowColor = '#ff2e88';
        g.shadowBlur = 20;
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(camino[0].x, camino[0].y);
        for (let i = 1; i < camino.length; i++) g.lineTo(camino[i].x, camino[i].y);
        g.stroke();
        g.strokeStyle = '#ffffffcc';
        g.lineWidth = 1;
        g.stroke();
        g.restore();
        for (let i = 1; i < camino.length - 1; i++) {
          ctx.engine.glowCircle(camino[i].x, camino[i].y, 3.5, '#ffd166', 12);
        }
      }

      // Emisor
      g.save();
      g.translate(emisorX, emisorY);
      g.rotate(emisorAng);
      g.fillStyle = '#2a2340';
      g.fillRect(-18, -18, 36, 36);
      ctx.engine.glowRect(14, -4, 14, 8, '#ff2e88', 20);
      g.restore();
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 2;
      g.beginPath(); g.arc(emisorX, emisorY, 28, 0, TAU); g.stroke();

      // Espejos
      for (const p of jug) {
        const [ax, ay, bx, by] = espejoPuntos(p);
        const col = players[p.i].color;
        g.save();
        g.strokeStyle = col;
        g.lineWidth = 7;
        g.lineCap = 'round';
        g.shadowColor = col;
        g.shadowBlur = 16;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.restore();
        // La cara reflectante marcada, para saber qué lado usa cada uno.
        g.strokeStyle = '#ffffffaa';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      }

      particles.render(g);

      // Núcleos
      for (const p of jug) {
        const col = players[p.i].color;
        const n = p.nucleo;
        const carga = clamp(p.quemado / CARGA, 0, 1);
        const pulso = 1 + Math.sin(t * (4 + carga * 22)) * 0.06 * (1 + carga * 3);
        ctx.engine.glowCircle(n.x, n.y, n.r * pulso, carga > 0.05 ? '#ff8c42' : col, 22 + carga * 30);
        g.fillStyle = '#04040c';
        g.beginPath(); g.arc(n.x, n.y, n.r * 0.55, 0, TAU); g.fill();
        if (carga > 0) {
          g.strokeStyle = '#ff4757';
          g.lineWidth = 4;
          g.beginPath(); g.arc(n.x, n.y, n.r + 8, -Math.PI / 2, -Math.PI / 2 + carga * TAU); g.stroke();
        }
        if (input.player(p.i).held('a') && p.escudo > 0) {
          g.strokeStyle = `rgba(62,255,200,${0.35 + Math.sin(t * 20) * 0.2})`;
          g.lineWidth = 3;
          g.beginPath(); g.arc(n.x, n.y, n.r + 14, 0, TAU); g.stroke();
        }
        // Escudo restante
        const bx2 = p.i === 0 ? 14 : W - 74;
        g.fillStyle = '#00000088';
        g.fillRect(bx2, H - 34, 60, 6);
        g.fillStyle = '#3effc8';
        g.fillRect(bx2, H - 34, 60 * p.escudo, 6);
      }

      ctx.engine.text('←/→ giran tu espejo · ↑/↓ lo deslizan · tu tecla levanta el escudo (se gasta)',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
