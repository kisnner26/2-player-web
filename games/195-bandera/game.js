/**
 * Roba la Bandera — en tu campo mandas tú, en el suyo eres carne de cañón.
 *
 * La regla de toda la vida y la única que hace falta: en TU mitad eres
 * intocable y puedes pillar; en la suya te pueden tocar y vuelves al principio
 * con las manos vacías. Por eso la partida no es de velocidad, es de esperar
 * a que el otro cruce.
 *
 * Y como los dos queréis lo mismo, siempre acaba pasando: los dos con la
 * bandera del otro, corriendo en direcciones opuestas por el mismo pasillo.
 */

import { clamp, TAU } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 3;
const VEL = 300;
const VEL_CARGADO = 232;       // con bandera se corre menos

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [crear(0), crear(1)];
  const bandera = [crear2(0), crear2(1)];
  let sb = null, t = 0, terminado = false, aviso = '', avisoT = 0;

  function crear(i) {
    return { i, x: 0, y: 0, r: 20, score: 0, lleva: -1, mira: i === 0 ? 1 : -1, vx: 0, tocado: 0 };
  }
  function crear2(i) {
    return { i, x: 0, y: 0, base: { x: 0, y: 0 }, tomada: false };
  }

  /** Mitad izquierda = campo de J1, derecha = campo de J2. */
  const enSuCampo = (p) => (p.i === 0 ? p.x < W / 2 : p.x > W / 2);

  function colocar() {
    for (const i of [0, 1]) {
      const bx = W * (i === 0 ? 0.08 : 0.92);
      bandera[i].base = { x: bx, y: H * 0.5 };
      bandera[i].x = bx;
      bandera[i].y = H * 0.5;
      bandera[i].tomada = false;
      jug[i].x = W * (i === 0 ? 0.28 : 0.72);
      jug[i].y = H * 0.5;
      jug[i].lleva = -1;
      jug[i].tocado = 0;
    }
  }

  function decir(txt) { aviso = txt; avisoT = 1.4; }

  function devolver(p) {
    if (p.lleva >= 0) {
      const b = bandera[p.lleva];
      b.tomada = false;
      b.x = b.base.x;
      b.y = b.base.y;
      p.lleva = -1;
    }
    p.x = W * (p.i === 0 ? 0.18 : 0.82);
    p.y = H * 0.5;
    p.tocado = 0.7;
    audio.error();
    haptics.error(p.i);
    ctx.shake(6);
    particles.burst(p.x, p.y, 16, { speed: 200, color: '#ff4757', size: 4, drag: 0.9 });
  }

  function anotar(p) {
    p.score++;
    sb.update(jug[0].score, jug[1].score);
    audio.win();
    haptics.victory(p.i);
    particles.burst(p.x, p.y, 34, { speed: 300, color: players[p.i].color, size: 5, drag: 0.9 });
    decir(`¡Punto de ${players[p.i].name}!`);
    colocar();
    if (p.score >= PARA_GANAR) {
      terminado = true;
      ctx.finish({ winner: p.i, scores: [jug[0].score, jug[1].score], detail: `${PARA_GANAR} banderas` });
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      colocar();
      sb = ui.scoreboard({ center: `a ${PARA_GANAR} banderas` });
    },
    resize(nw, nh) { W = nw; H = nh; colocar(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      avisoT = Math.max(0, avisoT - dt);
      particles.update(dt);

      for (const p of jug) {
        p.tocado = Math.max(0, p.tocado - dt);
        const pl = input.player(p.i);
        const ex = pl.ax, ey = pl.ay;
        const l = Math.hypot(ex, ey) || 1;
        const v = p.lleva >= 0 ? VEL_CARGADO : VEL;
        if (ex || ey) {
          p.x = clamp(p.x + (ex / l) * v * dt, p.r, W - p.r);
          p.y = clamp(p.y + (ey / l) * v * dt, p.r, H - p.r);
          p.vx = ex;
          p.mira = ex >= 0 ? 1 : -1;
        } else p.vx = 0;

        // Coger la bandera rival.
        const rival = bandera[1 - p.i];
        if (!rival.tomada && p.lleva < 0 && Math.hypot(rival.x - p.x, rival.y - p.y) < p.r + 16) {
          rival.tomada = true;
          p.lleva = 1 - p.i;
          audio.pickup();
          haptics.score(p.i);
          decir(`${players[p.i].name} tiene la bandera`);
        }
        if (p.lleva >= 0) {
          bandera[p.lleva].x = p.x;
          bandera[p.lleva].y = p.y - 26;
        }

        // Devolver la propia si estaba suelta en el campo.
        const mia = bandera[p.i];
        if (!mia.tomada && (mia.x !== mia.base.x || mia.y !== mia.base.y)
            && Math.hypot(mia.x - p.x, mia.y - p.y) < p.r + 16) {
          mia.x = mia.base.x;
          mia.y = mia.base.y;
          audio.blip();
        }

        // Anotar: con la bandera rival, tocando la tuya en su sitio.
        if (p.lleva >= 0 && !bandera[p.i].tomada
            && Math.hypot(bandera[p.i].base.x - p.x, bandera[p.i].base.y - p.y) < 40) {
          anotar(p);
          return;
        }
      }

      // Placaje: solo vale en tu propio campo.
      const [a, b] = jug;
      if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r && a.tocado <= 0 && b.tocado <= 0) {
        const aSeguro = enSuCampo(a), bSeguro = enSuCampo(b);
        if (aSeguro && !bSeguro) { decir(`${players[0].name} placa a ${players[1].name}`); devolver(b); }
        else if (bSeguro && !aSeguro) { decir(`${players[1].name} placa a ${players[0].name}`); devolver(a); }
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0c1a10');

      // Campos
      for (const i of [0, 1]) {
        g.fillStyle = `${players[i].color}0e`;
        g.fillRect(i === 0 ? 0 : W / 2, 0, W / 2, H);
      }
      g.strokeStyle = '#ffffff33';
      g.lineWidth = 3;
      g.setLineDash([12, 12]);
      g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#ffffff08';
      for (let x = 0; x < W; x += 60) g.fillRect(x, 0, 1, H);

      // Bases
      for (const i of [0, 1]) {
        const b = bandera[i];
        g.strokeStyle = players[i].color;
        g.lineWidth = 2;
        g.setLineDash([5, 5]);
        g.beginPath(); g.arc(b.base.x, b.base.y, 40, 0, TAU); g.stroke();
        g.setLineDash([]);
      }

      particles.render(g);

      // Banderas
      for (const i of [0, 1]) {
        const b = bandera[i];
        const col = players[i].color;
        g.save();
        g.strokeStyle = '#e8e8f0';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(b.x, b.y + 16); g.lineTo(b.x, b.y - 18); g.stroke();
        g.fillStyle = col;
        g.shadowColor = col;
        g.shadowBlur = 16;
        g.beginPath();
        g.moveTo(b.x, b.y - 18);
        g.lineTo(b.x + 26, b.y - 10 + Math.sin(t * 5) * 3);
        g.lineTo(b.x, b.y - 2);
        g.fill();
        g.restore();
      }

      for (const p of jug) {
        const col = players[p.i].color;
        const seguro = enSuCampo(p);
        const anim = pasoAnimado(p, { vx: p.vx * 60, suelo: true, dt: 1 / 60 });
        g.save();
        if (p.tocado > 0) g.globalAlpha = 0.4 + Math.sin(t * 30) * 0.3;
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), p.x, p.y + p.r, 58, {
          ...anim, mirando: p.mira, acento: col, brillo: p.lleva >= 0 ? 22 : 0,
        });
        g.restore();
        // Escudo cuando estás a salvo: la información clave del juego.
        if (seguro) {
          g.strokeStyle = `${col}66`;
          g.lineWidth = 2;
          g.beginPath(); g.arc(p.x, p.y, p.r + 8, 0, TAU); g.stroke();
        }
      }

      if (avisoT > 0) {
        g.save();
        g.globalAlpha = clamp(avisoT, 0, 1);
        ctx.engine.text(aviso, W / 2, H * 0.12, { size: 18, color: '#ffd166', glow: 10 });
        g.restore();
      }
      ctx.engine.text('En TU mitad eres intocable · en la suya te placan y vuelves al principio',
        W / 2, H - 12, { size: 11, color: '#5a7a60', font: 'system-ui' });
    },
  };
}
