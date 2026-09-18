/**
 * Encima de Ti — dos cuerpos de trapo peleando por tirar al otro de cabeza.
 *
 * La gracia no está en la puntería sino en el bamboleo: cada luchador es una
 * cadera con física y una cabeza colgada de una barra que oscila como un
 * péndulo invertido. Inclinarse acelera esa oscilación, saltar la lanza. Nadie
 * controla del todo su propio muñeco, y ahí está el chiste.
 *
 * Se pierde el punto cuando tu CABEZA toca el suelo. Eso hace que la postura
 * agresiva (inclinarse mucho para alcanzar al rival) sea también la más
 * peligrosa: cuanto más te estiras, menos te falta para besar la tarima.
 */

import { TAU, clamp, damp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const GRAVEDAD = 1750;
const BARRA = 62;              // largo del cuello-tronco, en píxeles lógicos
const INCLINA = 12.5;          // aceleración angular del pedal izquierda/derecha
const SALTO = 640;
const AMORTIGUA = 0.86;        // freno del péndulo por segundo

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0, tarimaX = 0, tarimaAn = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, ronda = 1, pausaRonda = 0, perdedor = -1;

  function crear(i) {
    return {
      i, x: 0, y: 0, vx: 0, vy: 0, r: 20,
      ang: 0, vang: 0,          // ángulo de la barra: 0 = de pie, ± = inclinado
      suelo: true, score: 0, saltoLibre: true, cara: i === 0 ? 1 : -1,
      golpe: 0,
    };
  }

  /** Punta de la barra: donde está la cabeza. */
  const cabezaX = (p) => p.x + Math.sin(p.ang) * BARRA;
  const cabezaY = (p) => p.y - Math.cos(p.ang) * BARRA;

  function nuevaRonda() {
    suelo = H * 0.78;
    tarimaAn = Math.min(W * 0.62, 620);
    tarimaX = (W - tarimaAn) / 2;
    for (const p of jug) {
      p.x = W / 2 + (p.i === 0 ? -1 : 1) * tarimaAn * 0.24;
      p.y = suelo;
      p.vx = p.vy = 0;
      p.ang = (p.i === 0 ? 1 : -1) * 0.12;
      p.vang = 0;
      p.suelo = true;
      p.saltoLibre = true;
      p.golpe = 0;
    }
    perdedor = -1;
    pausaRonda = 0;
  }

  function caer(p, motivo) {
    if (perdedor >= 0) return;
    perdedor = p.i;
    const otro = 1 - p.i;
    jug[otro].score++;
    sb.update(jug[0].score, jug[1].score);
    audio.thud();
    haptics.defeat(p.i);
    ctx.shake(12);
    particles.burst(cabezaX(p), cabezaY(p), 26, {
      speed: 260, color: players[p.i].color, size: 5, gravity: 900, drag: 0.94,
    });
    ui.toast(motivo, { ms: 1100, color: players[otro].color });
    pausaRonda = 1.6;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `asalto ${ronda} · a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },
    destroy() { sb?.remove(); },

    update(dt) {
      particles.update(dt);

      if (pausaRonda > 0) {
        pausaRonda -= dt;
        // El caído sigue rodando: el remate visual importa tanto como el punto.
        for (const p of jug) fisica(p, dt, p.i === perdedor);
        if (pausaRonda <= 0) {
          const g = jug.find((p) => p.score >= PARA_GANAR);
          if (g) { ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score] }); return; }
          ronda++;
          sb.setCenter(`asalto ${ronda} · a ${PARA_GANAR}`);
          nuevaRonda();
        }
        return;
      }

      for (const p of jug) {
        const pl = input.player(p.i);
        p.golpe = Math.max(0, p.golpe - dt);

        // Inclinarse es lo único que se controla de verdad. En el aire pesa
        // menos: no se puede corregir una mala salida a base de teclas.
        const eje = pl.ax;
        if (eje) {
          p.vang += eje * INCLINA * (p.suelo ? 1 : 0.45) * dt;
          p.cara = eje > 0 ? 1 : -1;
        }

        if (pl.pressed('a') && p.suelo && p.saltoLibre) {
          p.vy = -SALTO;
          // El salto sale en la dirección en la que ya estabas inclinado: es la
          // manera de convertir el bamboleo en desplazamiento.
          p.vx += Math.sin(p.ang) * 460;
          p.suelo = false;
          p.saltoLibre = false;
          audio.jump();
          haptics.tap(p.i);
          particles.burst(p.x, p.y, 8, { speed: 150, dir: Math.PI / 2, spread: 1.6, color: '#ffffff77', size: 3 });
        }

        fisica(p, dt, false);
      }

      choques(dt);

      for (const p of jug) {
        const hy = cabezaY(p), hx = cabezaX(p);
        if (hy > suelo - 8) { caer(p, `${players[1 - p.i].name} lo planta de cabeza`); break; }
        if (hx < tarimaX - 40 || hx > tarimaX + tarimaAn + 40) {
          caer(p, `${players[p.i].name} se sale de la tarima`); break;
        }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0710');

      // Público de fondo: puntitos que rebotan. Barato y llena el ambiente.
      const t = ctx.engine.time;
      for (let i = 0; i < 46; i++) {
        const x = ((i * 137.5) % W);
        const y = H * 0.30 + Math.sin(t * 2 + i) * 5 + (i % 5) * 12;
        g.fillStyle = i % 3 === 0 ? '#2a1f38' : '#1e1730';
        g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill();
      }

      // Tarima
      g.fillStyle = '#1a1226';
      g.fillRect(tarimaX, suelo, tarimaAn, H - suelo);
      ctx.engine.glowRect(tarimaX, suelo - 6, tarimaAn, 6, '#ffd166', 22);
      g.fillStyle = '#ffffff0a';
      for (let x = tarimaX; x < tarimaX + tarimaAn; x += 34) g.fillRect(x, suelo, 2, H - suelo);

      particles.render(g);

      for (const p of jug) {
        const col = players[p.i].color;
        const hx = cabezaX(p), hy = cabezaY(p);

        // Barra: es la información clave del juego (cuánto estás inclinado),
        // así que se dibuja gruesa y con el color del jugador.
        g.save();
        g.strokeStyle = col;
        g.lineWidth = 7;
        g.lineCap = 'round';
        g.shadowColor = col;
        g.shadowBlur = p.golpe > 0 ? 26 : 10;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(hx, hy); g.stroke();
        g.restore();

        // Pies
        ctx.engine.glowCircle(p.x, p.y, 10, col, 14);

        // El muñeco cuelga de la punta, girado con la barra.
        g.save();
        g.translate(hx, hy);
        g.rotate(p.ang);
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), 0, 30, 56, {
          pose: p.suelo ? 'quieto' : 'salta',
          acento: col,
          brillo: p.golpe > 0 ? 24 : 0,
          mirando: p.cara,
        });
        g.restore();

        if (p.golpe > 0) {
          g.strokeStyle = `rgba(255,255,255,${p.golpe * 2})`;
          g.lineWidth = 3;
          g.beginPath(); g.arc(hx, hy, 26 + (0.3 - p.golpe) * 90, 0, TAU); g.stroke();
        }
      }

      ctx.engine.text('Inclínate para alcanzarlo · salta para embestir · pierde quien toque el suelo con la cabeza',
        W / 2, H - 16, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };

  /* ---------------- Física ---------------- */

  function fisica(p, dt, derribado) {
    // Péndulo invertido: cuanto más inclinado, más tira la gravedad. Es lo que
    // hace que pasarse de vuelta sea irrecuperable.
    p.vang += Math.sin(p.ang) * 9.2 * dt * (derribado ? 2.4 : 1);
    p.vang *= Math.pow(AMORTIGUA, dt * 60 / 60);
    p.vang = clamp(p.vang, -9, 9);
    p.ang += p.vang * dt;
    p.ang = clamp(p.ang, -1.9, 1.9);

    // La cadera persigue a la cabeza: los pies "corrigen" el desequilibrio,
    // que es exactamente por lo que uno acaba corriendo cuando se tropieza.
    if (p.suelo && !derribado) p.vx = damp(p.vx, Math.sin(p.ang) * 330, 6, dt);

    p.vy += GRAVEDAD * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(p.suelo ? 0.5 : 0.85, dt);

    if (p.y >= suelo) {
      if (!p.suelo && p.vy > 200) { audio.tick(); haptics.tap(p.i); }
      p.y = suelo;
      p.vy = 0;
      p.suelo = true;
      p.saltoLibre = true;
    } else {
      p.suelo = false;
    }
  }

  /** Cabeza contra cabeza y cabeza contra pies: los dos golpes del juego. */
  function choques(dt) {
    const [a, b] = jug;
    const ax = cabezaX(a), ay = cabezaY(a);
    const bx = cabezaX(b), by = cabezaY(b);

    const chocar = (px, py, qx, qy, r, fuerza) => {
      const dx = qx - px, dy = qy - py;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-4) return null;
      return { nx: dx / d, ny: dy / d, pen: r - d, fuerza };
    };

    // Cabezazo: el impulso va al ángulo, no a la posición. Un buen cabezazo no
    // te empuja: te desequilibra, y de ahí a caer va un instante.
    const cc = chocar(ax, ay, bx, by, 46);
    if (cc) {
      const rel = Math.hypot((a.vx + a.vang * 40) - (b.vx + b.vang * 40), a.vy - b.vy);
      const imp = clamp(rel / 300, 0.25, 1.6);
      a.vang -= cc.nx * imp * 7;
      b.vang += cc.nx * imp * 7;
      a.vx -= cc.nx * imp * 150;
      b.vx += cc.nx * imp * 150;
      a.golpe = b.golpe = 0.3;
      audio.hit();
      haptics.impact(null, imp);
      ctx.shake(clamp(rel / 90, 3, 11));
      particles.burst((ax + bx) / 2, (ay + by) / 2, 12, {
        speed: 240, color: '#ffffff', size: 4, shape: 'spark', drag: 0.9,
      });
    }

    // Pisotón: caerle encima con los pies es el remate clásico.
    for (const [p, q, qx, qy] of [[a, b, bx, by], [b, a, ax, ay]]) {
      const pc = chocar(p.x, p.y, qx, qy, 34);
      if (pc && p.vy > 120) {
        q.vang += Math.sign(pc.nx || (q.i === 0 ? -1 : 1)) * 6.5;
        q.golpe = 0.3;
        p.vy = -260;
        audio.thud();
        haptics.impact(q.i, 1.2);
        ctx.shake(9);
        particles.burst(qx, qy, 14, { speed: 220, color: players[p.i].color, size: 4, gravity: 500 });
      }
    }
  }
}
