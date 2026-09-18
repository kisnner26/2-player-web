/**
 * Artillería — por turnos: ángulo, potencia y un viento que cambia cada tirada.
 *
 * El terreno es un mapa de alturas y las explosiones lo excavan de verdad, así
 * que el campo se degrada partida tras partida y los tiros que valían dejan de
 * valer. Al ser por turnos no hay ninguna tecla simultánea: cero ghosting.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const VIDA_MAX = 100;
const GRAV = 260;
const POT_MIN = 180, POT_MAX = 640;
const VEL_CARGA = 360;       // unidades de potencia por segundo
const R_CRATER = 34;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let terreno = null;          // Float32Array de altura por columna
  const jug = [tanque(0), tanque(1)];
  let turno = 0;
  let fase = 'apuntar';        // apuntar | cargando | volando | resolviendo
  let bala = null;
  let viento = 0;
  let sb = null;
  let potencia = POT_MIN;
  let banner = null;

  function tanque(i) {
    return { i, x: 0, y: 0, angulo: i === 0 ? -Math.PI / 4 : -Math.PI * 3 / 4, vida: VIDA_MAX };
  }

  function generarTerreno() {
    terreno = new Float32Array(W);
    // Suma de senos con fases aleatorias: colinas suaves y distintas cada vez.
    const base = H * 0.72;
    const ondas = [
      { amp: H * 0.10, len: W / 1.3, ph: rng() * TAU },
      { amp: H * 0.06, len: W / 3.1, ph: rng() * TAU },
      { amp: H * 0.03, len: W / 6.7, ph: rng() * TAU },
      { amp: H * 0.015, len: W / 13, ph: rng() * TAU },
    ];
    for (let x = 0; x < W; x++) {
      let y = base;
      for (const o of ondas) y -= Math.sin((x / o.len) * TAU + o.ph) * o.amp;
      terreno[x] = clamp(y, H * 0.32, H - 24);
    }
  }

  function alturaEn(x) {
    const i = clamp(Math.round(x), 0, W - 1);
    return terreno[i];
  }

  function asentar() {
    for (const p of jug) p.y = alturaEn(p.x);
  }

  function nuevoViento() {
    viento = (rng() * 2 - 1) * 46;
  }

  function actualizarBanner() {
    const p = players[turno];
    const flecha = viento > 1 ? '→' : viento < -1 ? '←' : '·';
    const fuerza = Math.abs(viento).toFixed(0);
    banner = ui.banner(
      `<b style="color:${p.color}">${p.name}</b> · viento ${flecha} ${fuerza}`,
      { color: p.color }
    );
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generarTerreno();
      jug[0].x = Math.round(W * 0.12);
      jug[1].x = Math.round(W * 0.88);
      asentar();
      nuevoViento();
      sb = ui.scoreboard({ center: 'vida' });
      sb.update(VIDA_MAX, VIDA_MAX);
      actualizarBanner();
      ui.toast('Mantén tu tecla de acción para cargar', { ms: 2400 });
    },

    resize(nw, nh) {
      W = nw; H = nh;
      generarTerreno();
      jug[0].x = Math.round(W * 0.12);
      jug[1].x = Math.round(W * 0.88);
      asentar();
    },

    update(dt) {
      const pl = input.player(turno);
      const p = jug[turno];

      if (fase === 'apuntar' || fase === 'cargando') {
        // El ángulo se ajusta siempre, incluso mientras carga.
        const dir = (pl.held('up') ? -1 : 0) + (pl.held('down') ? 1 : 0);
        if (dir !== 0) {
          p.angulo += dir * 1.1 * dt * (turno === 0 ? 1 : -1);
          const lim = turno === 0 ? [-Math.PI * 0.95, -0.05] : [-Math.PI + 0.05, -Math.PI * 0.05];
          p.angulo = clamp(p.angulo, Math.min(...lim), Math.max(...lim));
        }
      }

      if (fase === 'apuntar' && pl.pressed('a')) {
        fase = 'cargando';
        potencia = POT_MIN;
      } else if (fase === 'cargando') {
        potencia += VEL_CARGA * dt;
        if (Math.random() < dt * 30) audio.charge((potencia - POT_MIN) / (POT_MAX - POT_MIN));
        haptics.play({ lf: 0.25 + (potencia / POT_MAX) * 0.5, hf: 0.05, dur: 0.05, freq: 44 + (potencia / POT_MAX) * 40, shake: 0.5, curve: 'hold' }, { player: turno });
        if (potencia >= POT_MAX || pl.released('a')) {
          potencia = Math.min(potencia, POT_MAX);
          lanzar(p);
        }
      }

      if (fase === 'volando' && bala) {
        const pasos = 3;
        const sdt = dt / pasos;
        for (let s = 0; s < pasos; s++) {
          bala.vx += viento * sdt;
          bala.vy += GRAV * sdt;
          bala.x += bala.vx * sdt;
          bala.y += bala.vy * sdt;
          bala.estela.push({ x: bala.x, y: bala.y });
          if (bala.estela.length > 90) bala.estela.shift();

          if (bala.x < -200 || bala.x > W + 200 || bala.y > H + 400) { fallo(); return; }
          if (bala.y >= 0 && bala.y >= alturaEn(bala.x)) { explotar(bala.x, bala.y); return; }
          for (const t of jug) {
            if (Math.hypot(t.x - bala.x, t.y - 12 - bala.y) < 18) { explotar(bala.x, bala.y); return; }
          }
        }
      }

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0e1020');

      // Cielo
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a1b3a');
      grd.addColorStop(0.6, '#2a1f3d');
      grd.addColorStop(1, '#3d2438');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Terreno
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x < W; x++) g.lineTo(x, terreno[x]);
      g.lineTo(W, H);
      g.closePath();
      g.fillStyle = '#3a2b1f';
      g.fill();
      g.strokeStyle = '#6b8f3a';
      g.lineWidth = 3;
      g.beginPath();
      for (let x = 0; x < W; x++) x === 0 ? g.moveTo(x, terreno[x]) : g.lineTo(x, terreno[x]);
      g.stroke();

      particles.render(g);

      // Tanques
      for (const t of jug) {
        const col = players[t.i].color;
        g.save();
        g.translate(t.x, t.y);
        g.shadowColor = col; g.shadowBlur = 12;
        g.fillStyle = col;
        g.fillRect(-13, -12, 26, 12);
        g.beginPath(); g.arc(0, -12, 8, Math.PI, 0); g.fill();
        g.shadowBlur = 0;
        // Cañón
        g.strokeStyle = '#e8e8f5';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(0, -14);
        g.lineTo(Math.cos(t.angulo) * 26, -14 + Math.sin(t.angulo) * 26);
        g.stroke();
        g.restore();

        // Barra de vida
        const bw = 46;
        g.fillStyle = '#00000088';
        g.fillRect(t.x - bw / 2, t.y - 40, bw, 6);
        g.fillStyle = t.vida > 40 ? '#a8ff3e' : '#ff4757';
        g.fillRect(t.x - bw / 2, t.y - 40, bw * (t.vida / VIDA_MAX), 6);
      }

      // Estela y proyectil
      if (bala) {
        g.save();
        g.strokeStyle = '#ffffff55';
        g.lineWidth = 2;
        g.setLineDash([4, 6]);
        g.beginPath();
        bala.estela.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
        g.stroke();
        g.restore();
        ctx.engine.glowCircle(bala.x, bala.y, 5, '#ffd166', 18);
      }

      // Medidor de potencia
      if (fase === 'cargando' || fase === 'apuntar') {
        const t = jug[turno];
        const bw = 90, bh = 8;
        const bx = t.x - bw / 2, by = t.y - 56;
        g.fillStyle = '#00000099';
        g.fillRect(bx, by, bw, bh);
        const f = (potencia - POT_MIN) / (POT_MAX - POT_MIN);
        g.fillStyle = f > 0.85 ? '#ff4757' : f > 0.5 ? '#ffd166' : '#a8ff3e';
        g.fillRect(bx, by, bw * (fase === 'cargando' ? f : 0), bh);
        g.strokeStyle = '#ffffff44';
        g.lineWidth = 1;
        g.strokeRect(bx, by, bw, bh);
      }

      // Indicador de viento
      g.save();
      g.globalAlpha = 0.5;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      const wx = W / 2, wy = 76, len = clamp(viento * 1.6, -70, 70);
      g.beginPath();
      g.moveTo(wx, wy); g.lineTo(wx + len, wy);
      g.lineTo(wx + len - Math.sign(len) * 7, wy - 5);
      g.moveTo(wx + len, wy);
      g.lineTo(wx + len - Math.sign(len) * 7, wy + 5);
      g.stroke();
      g.restore();
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function lanzar(p) {
    fase = 'volando';
    bala = {
      x: p.x + Math.cos(p.angulo) * 28,
      y: p.y - 14 + Math.sin(p.angulo) * 28,
      vx: Math.cos(p.angulo) * potencia,
      vy: Math.sin(p.angulo) * potencia,
      estela: [],
    };
    audio.explosion();
    haptics.play('heavy', { player: turno });
    ctx.shake(6);
    particles.burst(bala.x, bala.y, 12, {
      speed: 160, dir: p.angulo, spread: 0.9, color: '#ffd166', size: 4, shape: 'spark',
    });
  }

  function excavar(cx, cy, r) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = Math.sqrt(Math.max(0, r * r - dx * dx));
      const fondo = cy + dy;
      if (fondo > terreno[x]) terreno[x] = Math.min(H - 4, Math.max(terreno[x], fondo));
    }
  }

  function explotar(x, y) {
    fase = 'resolviendo';
    bala = null;
    audio.explosion();
    haptics.explosion(null);
    ctx.shake(22);
    particles.burst(x, y, 60, { speed: 320, color: '#ff9040', size: 6, drag: 0.9, gravity: 200 });
    particles.burst(x, y, 30, { speed: 180, color: '#5a4030', size: 5, gravity: 400 });
    excavar(x, y, R_CRATER);

    let alguienMuerto = false;
    for (const t of jug) {
      const d = Math.hypot(t.x - x, t.y - 12 - y);
      if (d < R_CRATER + 18) {
        const dmg = Math.round(clamp(1 - d / (R_CRATER + 18), 0, 1) * 62 + 8);
        t.vida = Math.max(0, t.vida - dmg);
        haptics.impact(t.i, 1.3);
        ui.toast(`−${dmg} a ${players[t.i].name}`, { ms: 1300, color: players[t.i].color });
        if (t.vida <= 0) alguienMuerto = true;
      }
    }
    // Los tanques caen si el suelo bajo ellos desapareció.
    asentar();
    sb.update(jug[0].vida, jug[1].vida);

    setTimeout(() => {
      if (alguienMuerto) {
        const muerto = jug.find((t) => t.vida <= 0);
        ctx.finish({
          winner: 1 - muerto.i,
          scores: [jug[0].vida, jug[1].vida],
          detail: 'Impacto directo',
        });
      } else {
        cambiarTurno();
      }
    }, 900);
  }

  function fallo() {
    fase = 'resolviendo';
    bala = null;
    ui.toast('Fuera del campo', { ms: 1000 });
    audio.error();
    setTimeout(cambiarTurno, 500);
  }

  function cambiarTurno() {
    turno = 1 - turno;
    fase = 'apuntar';
    potencia = POT_MIN;
    nuevoViento();
    actualizarBanner();
    audio.select();
  }
}
