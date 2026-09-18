/**
 * Defensa Cruzada — dos cuarteles, un pasillo y oro que no para de caer.
 *
 * No se controla a nadie: se contrata. Los bichos salen andando solos y pelean
 * con lo primero que se cruzan, así que la partida se juega en la cabeza —
 * ¿gasto ahora en tres corredores baratos o me aguanto veinte segundos para un
 * coloso?
 *
 * El engranaje está en el triángulo: el corredor llega enseguida pero se
 * deshace, el coloso aguanta pero tarda una eternidad, y el arquero no
 * sobrevive a nada pero dispara desde atrás. Ninguno gana solo.
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const BASE_VIDA = 220;
const ORO_SEG = 11;
const ORO_MAX = 130;

const TIPOS = {
  corredor: { nombre: 'Corredor', coste: 14, vida: 22, daño: 7, cadencia: 0.6, vel: 74, alcance: 22, alto: 40, tecla: '◀' },
  coloso:   { nombre: 'Coloso',   coste: 42, vida: 105, daño: 15, cadencia: 1.1, vel: 30, alcance: 26, alto: 58, tecla: '▲' },
  arquero:  { nombre: 'Arquero',  coste: 26, vida: 20, daño: 11, cadencia: 0.95, vel: 40, alcance: 128, alto: 42, tecla: '▶' },
};
const ORDEN = ['corredor', 'coloso', 'arquero'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let suelo = 0;
  const jug = [crear(0), crear(1)];
  const unidades = [];
  const flechas = [];
  let sb = null, terminado = false, t = 0;

  function crear(i) {
    return { i, oro: 30, vida: BASE_VIDA, x: 0, ultimo: '', destello: 0, gastado: 0 };
  }

  function colocar() {
    suelo = H * 0.74;
    jug[0].x = W * 0.08;
    jug[1].x = W * 0.92;
  }

  function contratar(p, clave) {
    const T = TIPOS[clave];
    if (p.oro < T.coste) {
      audio.error();
      haptics.error(p.i);
      p.destello = 0.3;
      return;
    }
    p.oro -= T.coste;
    p.gastado += T.coste;
    p.ultimo = T.nombre;
    unidades.push({
      de: p.i, clave, T,
      x: p.x + (p.i === 0 ? 34 : -34), y: suelo,
      vida: T.vida, maxVida: T.vida, recarga: rng() * 0.3, golpe: 0, fase: 0, mira: p.i === 0 ? 1 : -1,
    });
    audio.tone({ freq: clave === 'coloso' ? 180 : clave === 'arquero' ? 520 : 340, dur: 0.1, gain: 0.16, type: 'square' });
    haptics.click(p.i);
    particles.burst(p.x, suelo - 10, 8, { speed: 120, color: players[p.i].color, size: 3, gravity: 300 });
  }

  /** Enemigo más cercano por delante, o null. */
  function objetivo(u) {
    let mejor = null, mejorD = Infinity;
    for (const o of unidades) {
      if (o.de === u.de || o.vida <= 0) continue;
      const d = Math.abs(o.x - u.x);
      const delante = u.mira > 0 ? o.x > u.x - 6 : o.x < u.x + 6;
      if (delante && d < mejorD) { mejor = o; mejorD = d; }
    }
    return { obj: mejor, d: mejorD };
  }

  function dañar(u, cantidad, colorGolpe) {
    u.vida -= cantidad;
    u.golpe = 0.14;
    particles.burst(u.x, suelo - u.T.alto * 0.5, 4, { speed: 110, color: colorGolpe, size: 3, drag: 0.9 });
    if (u.vida <= 0) {
      audio.thud();
      particles.burst(u.x, suelo - u.T.alto * 0.4, 12, {
        speed: 160, color: players[u.de].color, size: 4, gravity: 500,
      });
    }
  }

  function ganar(i) {
    if (terminado) return;
    terminado = true;
    audio.win();
    haptics.victory(i);
    ctx.finish({
      winner: i,
      scores: [Math.max(0, Math.round(jug[0].vida)), Math.max(0, Math.round(jug[1].vida))],
      detail: `${players[i].name} derriba el cuartel con ${Math.round(jug[i].vida)} de vida`,
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ui.scoreboard({ center: 'derriba el cuartel' });
    },
    resize(nw, nh) { W = nw; H = nh; colocar(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      for (const p of jug) {
        p.oro = Math.min(ORO_MAX, p.oro + ORO_SEG * dt);
        p.destello = Math.max(0, p.destello - dt);
        const pl = input.player(p.i);
        if (pl.pressed('left')) contratar(p, 'corredor');
        if (pl.pressed('up')) contratar(p, 'coloso');
        if (pl.pressed('right')) contratar(p, 'arquero');
      }

      for (const u of unidades) {
        if (u.vida <= 0) continue;
        u.golpe = Math.max(0, u.golpe - dt);
        u.recarga = Math.max(0, u.recarga - dt);

        const { obj, d } = objetivo(u);
        const baseRival = jug[1 - u.de];
        const dBase = Math.abs(baseRival.x - u.x);

        // Prioridad: lo que tenga delante; si no hay nadie, el cuartel.
        const blanco = obj && d <= u.T.alcance ? obj : null;
        const pegaBase = !blanco && dBase <= u.T.alcance + 26;

        if (blanco || pegaBase) {
          if (u.recarga <= 0) {
            u.recarga = u.T.cadencia;
            if (u.clave === 'arquero') {
              flechas.push({
                x: u.x + u.mira * 14, y: suelo - u.T.alto * 0.62,
                vx: u.mira * 420, de: u.de, daño: u.T.daño, vida: 1.4,
              });
              audio.tone({ freq: 900, dur: 0.06, gain: 0.1, type: 'sawtooth', sweep: -300 });
            } else if (blanco) {
              dañar(blanco, u.T.daño, players[u.de].color);
              audio.tone({ freq: 240, dur: 0.05, gain: 0.11, type: 'square' });
            } else {
              baseRival.vida -= u.T.daño;
              baseRival.destello = 0.3;
              audio.hit();
              haptics.impact(1 - u.de, 0.8);
              ctx.shake(4);
              particles.burst(baseRival.x, suelo - 40, 10, { speed: 170, color: '#ffd166', size: 4, drag: 0.9 });
            }
          }
        } else {
          // Avanzar, pero sin atravesar a un compañero parado delante.
          let bloqueado = false;
          for (const o of unidades) {
            if (o === u || o.de !== u.de || o.vida <= 0) continue;
            const delante = (o.x - u.x) * u.mira;
            if (delante > 0 && delante < 26) { bloqueado = true; break; }
          }
          if (!bloqueado) u.x += u.mira * u.T.vel * dt;
        }
      }

      for (let i = flechas.length - 1; i >= 0; i--) {
        const f = flechas[i];
        f.x += f.vx * dt;
        f.vida -= dt;
        let impacto = false;
        for (const o of unidades) {
          if (o.de === f.de || o.vida <= 0) continue;
          if (Math.abs(o.x - f.x) < 14) { dañar(o, f.daño, players[f.de].color); impacto = true; break; }
        }
        const base = jug[1 - f.de];
        if (!impacto && Math.abs(base.x - f.x) < 26) {
          base.vida -= f.daño;
          base.destello = 0.25;
          impacto = true;
          audio.hit();
        }
        if (impacto || f.vida <= 0 || f.x < -20 || f.x > W + 20) flechas.splice(i, 1);
      }

      for (let i = unidades.length - 1; i >= 0; i--) if (unidades[i].vida <= 0) unidades.splice(i, 1);

      sb.update(Math.max(0, Math.round(jug[0].vida)), Math.max(0, Math.round(jug[1].vida)));
      for (const p of jug) if (p.vida <= 0) { ganar(1 - p.i); return; }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0912');

      // Cielo y colinas
      const cielo = g.createLinearGradient(0, 0, 0, suelo);
      cielo.addColorStop(0, '#141033');
      cielo.addColorStop(1, '#2a1b3d');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, suelo);
      g.fillStyle = '#1c1430';
      for (let i = 0; i < 6; i++) {
        const cx = (i * W) / 5;
        g.beginPath();
        g.arc(cx, suelo, 90 + (i % 3) * 40, Math.PI, 0);
        g.fill();
      }
      g.fillStyle = '#161022';
      g.fillRect(0, suelo, W, H - suelo);
      ctx.engine.glowRect(0, suelo - 2, W, 2, '#5a4a80', 10);

      // Cuarteles
      for (const p of jug) {
        const col = players[p.i].color;
        const an = 62, al = 92;
        g.save();
        if (p.destello > 0) { g.shadowColor = '#ff4757'; g.shadowBlur = 26; }
        g.fillStyle = '#241a38';
        g.fillRect(p.x - an / 2, suelo - al, an, al);
        g.restore();
        g.fillStyle = col;
        g.fillRect(p.x - an / 2, suelo - al, an, 8);
        g.beginPath();
        g.moveTo(p.x - an / 2 - 6, suelo - al);
        g.lineTo(p.x, suelo - al - 26);
        g.lineTo(p.x + an / 2 + 6, suelo - al);
        g.fillStyle = '#33254d';
        g.fill();
        g.fillStyle = '#0d0a16';
        g.fillRect(p.x - 10, suelo - 34, 20, 34);

        // Vida del cuartel
        const bw = 110;
        g.fillStyle = '#00000099';
        g.fillRect(p.x - bw / 2, suelo - al - 44, bw, 9);
        g.fillStyle = p.vida < BASE_VIDA * 0.3 ? '#ff4757' : col;
        g.fillRect(p.x - bw / 2, suelo - al - 44, bw * clamp(p.vida / BASE_VIDA, 0, 1), 9);
      }

      for (const f of flechas) {
        g.save();
        g.strokeStyle = '#ffd166';
        g.lineWidth = 2.5;
        g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x - Math.sign(f.vx) * 16, f.y); g.stroke();
        g.restore();
      }

      // Unidades: las de atrás más apagadas para leer el frente de batalla.
      for (const u of [...unidades].sort((a, b) => a.x - b.x)) {
        const col = players[u.de].color;
        const anim = pasoAnimado(u, { vx: u.mira * u.T.vel, suelo: true, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[u.de], u.de), u.x, suelo, u.T.alto, {
          ...anim, mirando: u.mira, acento: col, brillo: u.golpe > 0 ? 22 : 0,
        });
        if (u.clave === 'coloso') {
          g.fillStyle = `${col}cc`;
          g.fillRect(u.x - u.mira * u.T.alto * 0.34, suelo - u.T.alto * 0.7, 7, u.T.alto * 0.5);
        }
        if (u.clave === 'arquero') {
          g.strokeStyle = '#d8c9a0';
          g.lineWidth = 2.5;
          g.beginPath();
          g.arc(u.x + u.mira * 10, suelo - u.T.alto * 0.6, 9, -1.2, 1.2);
          g.stroke();
        }
        const bw = 26;
        g.fillStyle = '#00000099';
        g.fillRect(u.x - bw / 2, suelo - u.T.alto - 10, bw, 4);
        g.fillStyle = col;
        g.fillRect(u.x - bw / 2, suelo - u.T.alto - 10, bw * clamp(u.vida / u.maxVida, 0, 1), 4);
      }

      particles.render(g);

      // Panel de contratación de cada jugador.
      for (const p of jug) {
        const col = players[p.i].color;
        const x = p.i === 0 ? 18 : W - 18;
        const al = p.i === 0 ? 'left' : 'right';
        g.save();
        if (p.destello > 0) g.globalAlpha = 0.4 + Math.sin(t * 40) * 0.3;
        ctx.engine.text(`${Math.floor(p.oro)} oro`, x, 26, { size: 16, color: '#ffd166', align: al, font: 'system-ui' });
        g.restore();
        ORDEN.forEach((clave, n) => {
          const T = TIPOS[clave];
          const puede = p.oro >= T.coste;
          ctx.engine.text(`${T.tecla} ${T.nombre} · ${T.coste}`, x, 50 + n * 19, {
            size: 12, color: puede ? col : '#4a4a60', align: al, font: 'system-ui',
          });
        });
      }

      ctx.engine.text('← corredor · ↑ coloso · → arquero · el oro cae solo y no se guarda para siempre',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
