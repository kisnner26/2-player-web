/**
 * Circuito — carrera vista desde arriba, tres vueltas, derrape incluido.
 *
 * La pista se define como una polilínea cerrada y el asfalto es todo lo que
 * queda a menos de `ANCHO_PISTA` del trazado. Así el circuito se adapta a
 * cualquier tamaño de ventana sin dibujar mapas a mano, y salirse penaliza
 * con agarre en vez de teletransportar al coche.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const VUELTAS = 3;
const ANCHO_PISTA = 62;
const ACEL = 340;
const FRENO = 420;
const VEL_MAX = 330;
const VEL_MAX_HIERBA = 130;
const GIRO = 2.7;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let trazado = [];
  let largos = [], largoTotal = 0;
  const jug = [coche(0), coche(1)];
  let sb = null;

  function coche(i) {
    return { i, x: 0, y: 0, a: 0, vel: 0, vuelta: 0, cp: 0, terminado: false, derrape: 0, marcas: [] };
  }

  /** Óvalo con dos chicanas: sencillo de leer y con sitio para adelantar. */
  function construirPista() {
    trazado = [];
    const cx = W / 2, cy = H / 2;
    const rx = W * 0.34, ry = H * 0.30;
    const N = 90;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * TAU;
      // Deformación senoidal: crea dos estrechamientos opuestos.
      const def = 1 + Math.sin(t * 3) * 0.16;
      trazado.push({ x: cx + Math.cos(t) * rx * def, y: cy + Math.sin(t) * ry * def });
    }
    largos = [];
    largoTotal = 0;
    for (let i = 0; i < trazado.length; i++) {
      const a = trazado[i], b = trazado[(i + 1) % trazado.length];
      const l = Math.hypot(b.x - a.x, b.y - a.y);
      largos.push(l);
      largoTotal += l;
    }
  }

  /** Distancia al trazado y el índice de segmento más cercano. */
  function proyectar(x, y) {
    let mejor = Infinity, idx = 0;
    for (let i = 0; i < trazado.length; i++) {
      const a = trazado[i], b = trazado[(i + 1) % trazado.length];
      const vx = b.x - a.x, vy = b.y - a.y;
      const wx = x - a.x, wy = y - a.y;
      const t = clamp((wx * vx + wy * vy) / (vx * vx + vy * vy || 1), 0, 1);
      const px = a.x + vx * t, py = a.y + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d < mejor) { mejor = d; idx = i; }
    }
    return { dist: mejor, idx };
  }

  function colocar() {
    construirPista();
    const p0 = trazado[0], p1 = trazado[1];
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      const lado = i === 0 ? -1 : 1;
      p.x = p0.x + nx * lado * 18;
      p.y = p0.y + ny * lado * 18;
      p.a = ang;
      p.vel = 0;
      p.vuelta = 0;
      p.cp = 0;
      p.terminado = false;
      p.marcas = [];
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ui.scoreboard({ center: `vuelta 1 / ${VUELTAS}` });
    },
    resize(nw, nh) { W = nw; H = nh; colocar(); },

    update(dt) {
      for (const p of jug) {
        if (p.terminado) continue;
        const pl = input.player(p.i);

        const acelera = pl.held('up');
        const frena = pl.held('down');
        if (acelera) p.vel += ACEL * dt;
        else if (frena) p.vel -= FRENO * dt;
        else p.vel *= Math.pow(0.45, dt);

        const proy = proyectar(p.x, p.y);
        const enPista = proy.dist < ANCHO_PISTA;
        const tope = enPista ? VEL_MAX : VEL_MAX_HIERBA;
        p.vel = clamp(p.vel, -110, tope);
        if (!enPista) {
          p.vel *= Math.pow(0.25, dt);
          if (Math.random() < dt * 20) {
            particles.spawn({
              x: p.x, y: p.y, vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 90,
              life: 0.4, maxLife: 0.4, size: 3, color: '#4a6b2a',
            });
            haptics.play('tick', { player: p.i });
          }
        }

        // Girar solo tiene efecto con el coche en movimiento.
        const factorGiro = clamp(Math.abs(p.vel) / 120, 0, 1);
        const giro = (pl.held('right') ? 1 : 0) - (pl.held('left') ? 1 : 0);
        p.a += giro * GIRO * dt * factorGiro * Math.sign(p.vel || 1);
        p.derrape = Math.abs(giro) * factorGiro * (p.vel / VEL_MAX);

        p.x += Math.cos(p.a) * p.vel * dt;
        p.y += Math.sin(p.a) * p.vel * dt;
        p.x = clamp(p.x, 8, W - 8);
        p.y = clamp(p.y, 8, H - 8);

        if (p.derrape > 0.45 && enPista) {
          p.marcas.push({ x: p.x, y: p.y });
          if (p.marcas.length > 120) p.marcas.shift();
          if (Math.random() < dt * 10) audio.tone({ freq: 200, dur: 0.05, gain: 0.05, type: 'sawtooth' });
        }

        // Progreso por sectores: hay que pasarlos en orden para contar vuelta.
        const sector = Math.floor((proy.idx / trazado.length) * 8);
        if (sector === (p.cp + 1) % 8) {
          p.cp = sector;
          if (sector === 0) completarVuelta(p);
        }
      }

      // Choque entre coches: se empujan, no se atraviesan.
      const a = jug[0], b = jug[1];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 30 && d > 0.1) {
        const nx = (a.x - b.x) / d, ny = (a.y - b.y) / d;
        const sep = (30 - d) / 2;
        a.x += nx * sep; a.y += ny * sep;
        b.x -= nx * sep; b.y -= ny * sep;
        a.vel *= 0.86; b.vel *= 0.86;
        if (Math.random() < 0.3) { audio.tick(); haptics.play('bounce', { player: null, scale: 0.7 }); }
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#16220f');

      // Hierba
      g.fillStyle = '#1e3315';
      g.fillRect(0, 0, W, H);

      // Asfalto: la polilínea engrosada
      g.save();
      g.strokeStyle = '#2c2c33';
      g.lineWidth = ANCHO_PISTA * 2;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.beginPath();
      trazado.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.stroke();

      // Bordillos
      g.strokeStyle = '#c94b4b';
      g.lineWidth = 3;
      g.setLineDash([16, 16]);
      g.stroke();
      g.setLineDash([]);

      // Línea central
      g.strokeStyle = '#ffffff22';
      g.lineWidth = 2;
      g.setLineDash([18, 22]);
      g.stroke();
      g.setLineDash([]);
      g.restore();

      // Meta
      const p0 = trazado[0], p1 = trazado[1];
      const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
      g.save();
      g.translate(p0.x, p0.y);
      g.rotate(ang);
      for (let k = -3; k < 3; k++) {
        for (let j = 0; j < 2; j++) {
          g.fillStyle = (k + j) % 2 ? '#fff' : '#222';
          g.fillRect(j * 9 - 9, k * (ANCHO_PISTA / 3), 9, ANCHO_PISTA / 3);
        }
      }
      g.restore();

      // Marcas de derrape
      for (const p of jug) {
        g.save();
        g.globalAlpha = 0.25;
        g.strokeStyle = '#000';
        g.lineWidth = 5;
        g.beginPath();
        p.marcas.forEach((m, i) => (i === 0 ? g.moveTo(m.x, m.y) : g.lineTo(m.x, m.y)));
        g.stroke();
        g.restore();
      }

      particles.render(g);

      // Coches
      for (const p of jug) {
        const col = players[p.i].color;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.a);
        g.fillStyle = '#00000055';
        g.fillRect(-14, -8, 28, 16);
        g.shadowColor = col; g.shadowBlur = 14;
        g.fillStyle = col;
        g.fillRect(-13, -8, 26, 16);
        g.shadowBlur = 0;
        g.fillStyle = '#0d0d14';
        g.fillRect(-3, -6, 10, 12);
        g.fillStyle = '#222';
        g.fillRect(-11, -10, 7, 3);
        g.fillRect(-11, 7, 7, 3);
        g.fillRect(5, -10, 7, 3);
        g.fillRect(5, 7, 7, 3);
        g.restore();
      }
    },

    destroy() { sb?.remove(); },
  };

  function completarVuelta(p) {
    p.vuelta++;
    sb.update(jug[0].vuelta, jug[1].vuelta);
    sb.setCenter(`vuelta ${Math.min(VUELTAS, Math.max(jug[0].vuelta, jug[1].vuelta) + 1)} / ${VUELTAS}`);
    if (p.vuelta >= VUELTAS) {
      p.terminado = true;
      const otro = jug[1 - p.i];
      ctx.finish({
        winner: p.i,
        scores: [jug[0].vuelta, jug[1].vuelta],
        detail: otro.vuelta < VUELTAS ? `${VUELTAS - otro.vuelta} vuelta(s) de ventaja` : '',
      });
    } else {
      audio.score(p.i);
      haptics.play('score', { player: p.i });
      ui.toast(`${players[p.i].name}: vuelta ${p.vuelta}`, { ms: 1100, color: players[p.i].color });
    }
  }
}
