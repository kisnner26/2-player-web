/**
 * El Nudo — cada uno lleva un extremo de la cuerda; hay que desenredarla.
 *
 * La cuerda es una cadena Verlet con repulsión entre segmentos no vecinos, así
 * que el nudo se deshace de verdad al tirar en la dirección correcta y se
 * aprieta si tiran a lo bruto. El contador de cruces baja según lo resuelven,
 * y ese número es la única pista: no hay flechas ni tutorial.
 *
 * Nadie puede resolverlo solo: los dos extremos tienen que ir a sitios
 * distintos y hay que decir en voz alta hacia dónde vas.
 */

import { TAU, clamp, segIntersect } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const NODOS = 26;
const VEL = 230;
const R_MANO = 15;
const SEG = 17;                // longitud de cada segmento en reposo
const REPULSION = 26;          // distancia a la que los segmentos se empujan
const NIVELES = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let cuerda = [];
  let nivel = 1;
  let cruces = 0;
  let crucesIniciales = 0;
  let limpioDesde = 0;
  let sb = null;
  let terminado = false;
  let pausa = 0;
  let tiempoTotal = 0;

  /** Genera una maraña con varias vueltas: cuantas más, más difícil. */
  function enredar() {
    cuerda = [];
    const cx = W / 2, cy = H * 0.52;
    const radio = Math.min(W, H) * 0.16;
    const vueltas = 1.6 + nivel * 0.9;
    for (let i = 0; i < NODOS; i++) {
      const t = i / (NODOS - 1);
      const a = t * TAU * vueltas;
      // Radio oscilante: crea lóbulos que se cruzan entre sí.
      const r = radio * (0.55 + Math.sin(t * Math.PI * (1 + nivel)) * 0.5);
      const x = cx + Math.cos(a) * r + (rng() - 0.5) * 14;
      const y = cy + Math.sin(a) * r * 0.75 + (rng() - 0.5) * 14;
      cuerda.push({ x, y, px: x, py: y });
    }
    crucesIniciales = contarCruces();
    cruces = crucesIniciales;
    limpioDesde = 0;
  }

  /** Cruces entre segmentos que no son vecinos. */
  function contarCruces() {
    let n = 0;
    for (let i = 0; i < cuerda.length - 1; i++) {
      for (let j = i + 2; j < cuerda.length - 1; j++) {
        const a = cuerda[i], b = cuerda[i + 1], c = cuerda[j], d = cuerda[j + 1];
        if (segIntersect(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y)) n++;
      }
    }
    return n;
  }

  function simular(dt) {
    // Extremos: los llevan los jugadores.
    for (let i = 1; i < cuerda.length - 1; i++) {
      const n = cuerda[i];
      const vx = (n.x - n.px) * 0.90;
      const vy = (n.y - n.py) * 0.90;
      n.px = n.x; n.py = n.y;
      n.x += vx;
      n.y += vy;
    }

    // Restricción de longitud
    for (let paso = 0; paso < 5; paso++) {
      for (let i = 0; i < cuerda.length - 1; i++) {
        const a = cuerda[i], b = cuerda[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const dif = ((d - SEG) / d) * 0.5;
        const ox = dx * dif, oy = dy * dif;
        if (i !== 0) { a.x += ox; a.y += oy; }
        if (i + 1 !== cuerda.length - 1) { b.x -= ox; b.y -= oy; }
      }
    }

    // Repulsión entre nodos lejanos en la cuerda: es lo que evita que se
    // atraviese a sí misma y hace que el nudo se "abra" al tirar bien.
    for (let i = 0; i < cuerda.length; i++) {
      for (let j = i + 3; j < cuerda.length; j++) {
        const a = cuerda[i], b = cuerda[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > REPULSION * REPULSION || d2 < 0.01) continue;
        const d = Math.sqrt(d2);
        const empuje = ((REPULSION - d) / d) * 0.34;
        const ox = dx * empuje, oy = dy * empuje;
        if (i !== 0 && i !== cuerda.length - 1) { a.x -= ox; a.y -= oy; }
        if (j !== 0 && j !== cuerda.length - 1) { b.x += ox; b.y += oy; }
      }
    }

    // Márgenes de pantalla
    for (const n of cuerda) {
      n.x = clamp(n.x, 12, W - 12);
      n.y = clamp(n.y, 60, H - 12);
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      enredar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Cada uno lleva un extremo · díganse hacia dónde van');
    },
    resize(nw, nh) { W = nw; H = nh; enredar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempoTotal += dt;

      if (pausa > 0) {
        pausa -= dt;
        if (pausa <= 0) siguienteNivel();
        particles.update(dt);
        return;
      }

      // Los jugadores mueven los extremos
      const extremos = [cuerda[0], cuerda[cuerda.length - 1]];
      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        const dx = pl.x, dy = pl.y;
        const len = Math.hypot(dx, dy) || 1;
        const e = extremos[i];
        e.px = e.x; e.py = e.y;
        e.x = clamp(e.x + (dx / len) * VEL * dt, 12, W - 12);
        e.y = clamp(e.y + (dy / len) * VEL * dt, 60, H - 12);
      }

      simular(dt);

      const antes = cruces;
      cruces = contarCruces();
      if (cruces < antes) {
        audio.tone({ freq: 500 + (crucesIniciales - cruces) * 40, dur: 0.07, gain: 0.12 });
        haptics.play('click');
        const m = cuerda[Math.floor(cuerda.length / 2)];
        particles.burst(m.x, m.y, 6, { speed: 130, color: '#a8ff3e', size: 3 });
      } else if (cruces > antes) {
        audio.tick();
      }

      sb.update(crucesIniciales - cruces, cruces);
      sb.setCenter(`nivel ${nivel}/${NIVELES} · ${cruces} cruces`);

      // Hay que mantenerlo limpio un momento para evitar falsos positivos.
      if (cruces === 0) {
        limpioDesde += dt;
        if (limpioDesde > 0.8) resolver();
      } else limpioDesde = 0;

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0c1014');
      const grd = g.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, Math.max(W, H) * 0.7);
      grd.addColorStop(0, '#16202a');
      grd.addColorStop(1, '#080c10');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Sombra de la cuerda
      g.save();
      g.strokeStyle = '#00000066';
      g.lineWidth = 13;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      cuerda.forEach((n, i) => (i === 0 ? g.moveTo(n.x + 4, n.y + 6) : g.lineTo(n.x + 4, n.y + 6)));
      g.stroke();
      g.restore();

      // Cuerda con degradado entre los colores de los dos
      const grad = g.createLinearGradient(
        cuerda[0].x, cuerda[0].y,
        cuerda[cuerda.length - 1].x, cuerda[cuerda.length - 1].y
      );
      grad.addColorStop(0, players[0].color);
      grad.addColorStop(1, players[1].color);
      g.save();
      g.strokeStyle = grad;
      g.lineWidth = 10;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.shadowColor = cruces === 0 ? '#a8ff3e' : '#00000000';
      g.shadowBlur = cruces === 0 ? 24 : 0;
      g.beginPath();
      cuerda.forEach((n, i) => (i === 0 ? g.moveTo(n.x, n.y) : g.lineTo(n.x, n.y)));
      g.stroke();
      // Brillo interior: da aspecto de cuerda trenzada
      g.strokeStyle = '#ffffff33';
      g.lineWidth = 3;
      g.beginPath();
      cuerda.forEach((n, i) => (i === 0 ? g.moveTo(n.x, n.y - 2) : g.lineTo(n.x, n.y - 2)));
      g.stroke();
      g.restore();

      // Marcas en los cruces restantes
      for (let i = 0; i < cuerda.length - 1; i++) {
        for (let j = i + 2; j < cuerda.length - 1; j++) {
          const a = cuerda[i], b = cuerda[i + 1], c = cuerda[j], d = cuerda[j + 1];
          const p = segIntersect(a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y);
          if (!p) continue;
          g.save();
          g.globalAlpha = 0.55;
          g.strokeStyle = '#ff4757';
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, 9, 0, TAU); g.stroke();
          g.restore();
        }
      }

      particles.render(g);

      // Extremos (las manos)
      const extremos = [cuerda[0], cuerda[cuerda.length - 1]];
      for (let i = 0; i < 2; i++) {
        const e = extremos[i];
        ctx.engine.glowCircle(e.x, e.y, R_MANO, players[i].color, 24);
        g.fillStyle = '#00000077';
        g.beginPath(); g.arc(e.x, e.y, R_MANO * 0.42, 0, TAU); g.fill();
        ctx.engine.text(players[i].name, e.x, e.y - R_MANO - 14, {
          size: 10, color: players[i].color, font: 'system-ui',
        });
      }

      if (cruces === 0 && limpioDesde > 0) {
        ctx.engine.text('¡Desenredada!', W / 2, 80, { size: 20, color: '#a8ff3e', glow: 18 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function resolver() {
    audio.win();
    haptics.play('victory');
    for (const n of cuerda) {
      particles.spawn({
        x: n.x, y: n.y,
        vx: (rng() - 0.5) * 130, vy: (rng() - 0.5) * 130,
        life: 0.9, maxLife: 0.9, size: 4, color: '#a8ff3e', shape: 'circle',
      });
    }
    ui.banner(`Nivel ${nivel} resuelto`);
    pausa = 1.8;
  }

  function siguienteNivel() {
    nivel++;
    if (nivel > NIVELES) {
      terminado = true;
      ctx.finish({
        winner: -1,
        scores: [NIVELES, Math.round(tiempoTotal)],
        detail: `Los ${NIVELES} nudos en ${tiempoTotal.toFixed(0)} s, sin soltarse`,
        record: ctx.record('tiempo', Math.round(tiempoTotal), 'low'),
      });
      return;
    }
    ui.banner(`Nudo ${nivel} · más apretado`);
    enredar();
  }
}
