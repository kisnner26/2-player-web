/**
 * Bonsái — un árbol que es de los dos y crece entre visitas.
 *
 * Crece solo con el tiempo REAL: si volvéis mañana, habrá brotado por su
 * cuenta. Lo único que se hace aquí es podar, y podar es quitar. Cada corte es
 * definitivo y el árbol responde: quitar una rama hace que las vecinas
 * engorden.
 *
 * La armonía mide el equilibrio entre los dos lados y la limpieza de la copa.
 * No hay forma de terminarlo — un bonsái no se acaba, se cuida.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { loadBonsai, saveBonsai } from '../../core/storage.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const CRECE_POR_HORA = 1.4;    // ramas nuevas por hora real
const SESION = 100;            // segundos de sesión de poda

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let arbol = null, ramas = [], cursor = [0, 0], reloj = SESION;
  let t = 0, terminado = false, sb = null, mensaje = '', mensajeT = 0;
  let podadasSesion = [0, 0], brotadas = 0;

  function ramaNueva(padre) {
    const nivel = padre ? padre.nivel + 1 : 0;
    const ang = padre
      ? padre.ang + (rng() - 0.5) * 1.5 - (padre.ang * 0.25)
      : -Math.PI / 2 + (rng() - 0.5) * 0.3;
    const largo = padre ? padre.largo * (0.62 + rng() * 0.18) : 0.16 + rng() * 0.05;
    const x1 = padre ? padre.x2 : 0.5;
    const y1 = padre ? padre.y2 : 0.92;
    return {
      x1, y1,
      x2: x1 + Math.cos(ang) * largo * 0.6,
      y2: y1 + Math.sin(ang) * largo,
      ang, largo, nivel,
      grosor: Math.max(1.5, 12 - nivel * 2.4),
      por: -1, hojas: nivel >= 2 ? 1 + Math.floor(rng() * 3) : 0,
    };
  }

  function crecer(cuantas) {
    for (let i = 0; i < cuantas; i++) {
      if (!ramas.length) { ramas.push(ramaNueva(null)); continue; }
      // Brota preferentemente de las ramas jóvenes: es como crece de verdad.
      const candidatas = ramas.filter((r) => r.nivel < 4);
      if (!candidatas.length) break;
      candidatas.sort((a, b) => b.nivel - a.nivel || rng() - 0.5);
      const padre = candidatas[Math.floor(rng() * Math.min(5, candidatas.length))];
      ramas.push(ramaNueva(padre));
      brotadas++;
    }
  }

  /** Equilibrio izquierda/derecha y densidad de copa. */
  function armonia() {
    if (!ramas.length) return 0;
    let iz = 0, de = 0;
    for (const r of ramas) (r.x2 < 0.5 ? (iz += r.largo) : (de += r.largo));
    const balance = 1 - Math.abs(iz - de) / Math.max(0.001, iz + de);
    const densidad = clamp(1 - Math.abs(ramas.length - 14) / 20, 0, 1);
    return Math.round((balance * 0.6 + densidad * 0.4) * 100);
  }

  function podar(j) {
    const r = ramas[cursor[j]];
    if (!r) return;
    if (r.nivel === 0 && ramas.filter((x) => x.nivel === 0).length <= 1) {
      mensaje = 'El tronco no se poda';
      mensajeT = 1.4;
      audio.error();
      return;
    }
    // Se van también las ramas que colgaban de ella.
    const fuera = new Set([ramas.indexOf(r)]);
    let cambio = true;
    while (cambio) {
      cambio = false;
      ramas.forEach((o, i) => {
        if (fuera.has(i)) return;
        const padre = ramas.findIndex((p) => Math.abs(p.x2 - o.x1) < 1e-6 && Math.abs(p.y2 - o.y1) < 1e-6);
        if (padre >= 0 && fuera.has(padre)) { fuera.add(i); cambio = true; }
      });
    }
    const px = r.x2 * W, py = r.y2 * H;
    ramas = ramas.filter((_, i) => !fuera.has(i));
    // Las vecinas engordan: la savia va a otra parte.
    for (const o of ramas) if (o.nivel === r.nivel) o.grosor += 0.4;
    podadasSesion[j] += fuera.size;
    cursor = cursor.map((c) => clamp(c, 0, Math.max(0, ramas.length - 1)));
    audio.tone({ freq: 620, dur: 0.08, gain: 0.14, type: 'triangle', sweep: -260 });
    haptics.click(j);
    particles.burst(px, py, 10 + fuera.size * 3, { speed: 150, color: '#7fc45a', size: 3, gravity: 240 });
    mensaje = fuera.size > 1 ? `−${fuera.size} ramas` : 'corte limpio';
    mensajeT = 1;
  }

  function guardar() {
    const b = loadBonsai();
    b.ramas = ramas;
    b.ultimaVisita = Date.now();
    if (!b.plantado) b.plantado = Date.now();
    b.podas = [b.podas[0] + podadasSesion[0], b.podas[1] + podadasSesion[1]];
    b.armonia = armonia();
    saveBonsai(b);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      const b = loadBonsai();
      ramas = Array.isArray(b.ramas) && b.ramas.length ? b.ramas.map((r) => ({ ...r })) : [];
      if (!ramas.length) { crecer(7); }
      else if (b.ultimaVisita) {
        // Lo que ha crecido solo desde la última vez.
        const horas = clamp((Date.now() - b.ultimaVisita) / 3600000, 0, 72);
        crecer(Math.floor(horas * CRECE_POR_HORA));
      }
      cursor = [0, Math.min(1, ramas.length - 1)];
      sb = ui.scoreboard({ center: 'podad el bonsái' });
      sb.update(0, 0);
      if (brotadas) ui.toast(`Han brotado ${brotadas} ramas desde la última visita`, { ms: 2600 });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { guardar(); sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      mensajeT = Math.max(0, mensajeT - dt);
      particles.update(dt);
      reloj -= dt;

      for (const j of [0, 1]) {
        const pl = input.player(j);
        if (!ramas.length) continue;
        if (pl.pressed('left') || pl.pressed('up')) { cursor[j] = (cursor[j] + ramas.length - 1) % ramas.length; audio.tick(); }
        if (pl.pressed('right') || pl.pressed('down')) { cursor[j] = (cursor[j] + 1) % ramas.length; audio.tick(); }
        if (pl.pressed('a')) podar(j);
      }

      sb.update(podadasSesion[0], podadasSesion[1]);

      if (reloj <= 0 || !ramas.length) {
        terminado = true;
        guardar();
        const a = armonia();
        audio.win();
        ctx.finish({
          winner: -1,
          scores: [podadasSesion[0], podadasSesion[1]],
          detail: `Armonía ${a} · ${ramas.length} ramas · el bonsái os espera`,
          record: ctx.record('armonia', a, 'high'),
        });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0e1210');

      const fondo = g.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, H);
      fondo.addColorStop(0, '#18201c');
      fondo.addColorStop(1, '#080c0a');
      g.fillStyle = fondo;
      g.fillRect(0, 0, W, H);

      // Maceta
      g.fillStyle = '#5a3a30';
      g.beginPath();
      g.moveTo(W * 0.36, H * 0.93);
      g.lineTo(W * 0.64, H * 0.93);
      g.lineTo(W * 0.6, H * 0.99);
      g.lineTo(W * 0.4, H * 0.99);
      g.fill();
      g.fillStyle = '#2f2018';
      g.fillRect(W * 0.36, H * 0.915, W * 0.28, 12);

      for (const [i, r] of ramas.entries()) {
        const sel = cursor.indexOf(i);
        g.save();
        g.strokeStyle = r.nivel === 0 ? '#6b4a2e' : r.nivel === 1 ? '#7a5836' : '#8a6a42';
        g.lineWidth = r.grosor;
        g.lineCap = 'round';
        if (sel >= 0) { g.shadowColor = players[sel].color; g.shadowBlur = 18; }
        g.beginPath();
        g.moveTo(r.x1 * W, r.y1 * H);
        g.lineTo(r.x2 * W, r.y2 * H);
        g.stroke();
        g.restore();
        for (let k = 0; k < r.hojas; k++) {
          const a = r.ang + (k - 1) * 0.8;
          g.fillStyle = '#4f9a45';
          g.beginPath();
          g.ellipse(r.x2 * W + Math.cos(a) * 10, r.y2 * H + Math.sin(a) * 10, 8, 4, a, 0, TAU);
          g.fill();
        }
        if (sel >= 0) {
          g.strokeStyle = players[sel].color;
          g.lineWidth = 2;
          g.beginPath(); g.arc(r.x2 * W, r.y2 * H, 12 + sel * 4, 0, TAU); g.stroke();
        }
      }

      particles.render(g);

      const a = armonia();
      ctx.engine.text(`armonía ${a}`, W / 2, H * 0.08, { size: 20, color: '#7fc45a', font: 'system-ui' });
      ctx.engine.text(`${ramas.length} ramas · quedan ${Math.ceil(Math.max(0, reloj))}s de poda`,
        W / 2, H * 0.13, { size: 12, color: '#6a8070', font: 'system-ui' });
      if (mensajeT > 0) {
        g.save();
        g.globalAlpha = clamp(mensajeT, 0, 1);
        ctx.engine.text(mensaje, W / 2, H * 0.18, { size: 14, color: '#c9e0b0', font: 'system-ui' });
        g.restore();
      }
      ctx.engine.text('Cada uno mueve su selector y poda con su tecla · el corte se lleva lo que colgaba',
        W / 2, H - 12, { size: 11, color: '#4a6050', font: 'system-ui' });
    },
  };
}
