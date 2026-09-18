/**
 * Teclas Prohibidas — haz lo que dice la pantalla, salvo una cosa.
 *
 * Cada tanda anuncia una dirección prohibida. Luego van saliendo órdenes a
 * toda velocidad y hay que obedecerlas… menos cuando la orden es justo la
 * prohibida, que entonces hay que quedarse quieto.
 *
 * Lo cruel es que la prohibida cambia cada pocas órdenes, y el cambio se anuncia
 * mientras las órdenes siguen cayendo. Nadie falla por lentitud: se falla
 * porque la mano sigue obedeciendo a la regla vieja.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const PARA_GANAR = 12;
const ACCIONES = ['up', 'right', 'down', 'left'];
const GLIFOS = { up: '↑', right: '→', down: '↓', left: '←' };
const NOMBRES = { up: 'ARRIBA', right: 'DERECHA', down: 'ABAJO', left: 'IZQUIERDA' };

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let prohibida = 'up', orden = 'right', esTrampa = false;
  let fase = 'aviso', reloj = 2.2, ventana = 1.4, t = 0, tandas = 0, ordenes = 0;
  const jug = [crear(0), crear(1)];
  let sb = null, avisoCambio = 0;

  function crear(i) {
    return { i, puntos: 0, hielo: 0, respondio: false, marca: 0, fallos: 0 };
  }

  function nuevaProhibida() {
    let p;
    do { p = ACCIONES[Math.floor(rng() * 4)]; } while (p === prohibida);
    prohibida = p;
    tandas++;
    avisoCambio = 1.4;
    audio.tone({ freq: 300, dur: 0.22, gain: 0.18, type: 'square', sweep: -80 });
    haptics.play('heavy');
  }

  function nuevaOrden() {
    ordenes++;
    // Una de cada tres es la trampa: suficiente para no relajarse nunca.
    esTrampa = rng() < 0.34;
    orden = esTrampa ? prohibida : ACCIONES.filter((a) => a !== prohibida)[Math.floor(rng() * 3)];
    ventana = clamp(1.5 - ordenes * 0.022, 0.55, 1.5);
    reloj = ventana;
    fase = 'orden';
    for (const p of jug) p.respondio = false;
    audio.blip();
  }

  function acierto(p) {
    p.puntos++;
    p.marca = 0.35;
    p.respondio = true;
    sb.update(jug[0].puntos, jug[1].puntos);
    audio.tone({ freq: 720, dur: 0.06, gain: 0.14, type: 'square' });
    haptics.score(p.i);
    particles.burst(centroX(p.i), H * 0.66, 12, { speed: 190, color: players[p.i].color, size: 3, drag: 0.9 });
  }

  function fallo(p) {
    p.puntos = Math.max(0, p.puntos - 1);
    p.hielo = 0.9;
    p.fallos++;
    p.respondio = true;
    sb.update(jug[0].puntos, jug[1].puntos);
    audio.error();
    haptics.error(p.i);
    ctx.shake(4);
  }

  const centroX = (i) => W * (i === 0 ? 0.24 : 0.76);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      prohibida = ACCIONES[Math.floor(rng() * 4)];
      fase = 'aviso';
      reloj = 2.2;
      avisoCambio = 1.4;
      sb = ui.scoreboard({ center: `a ${PARA_GANAR}` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      t += dt;
      avisoCambio = Math.max(0, avisoCambio - dt);
      particles.update(dt);
      for (const p of jug) {
        p.marca = Math.max(0, p.marca - dt);
        if (p.hielo > 0) p.hielo -= dt;
      }

      if (fase === 'aviso') {
        reloj -= dt;
        if (reloj <= 0) nuevaOrden();
        return;
      }

      reloj -= dt;

      for (const p of jug) {
        if (p.respondio || p.hielo > 0) continue;
        const pl = input.player(p.i);
        for (const a of ACCIONES) {
          if (!pl.pressed(a)) continue;
          if (esTrampa) fallo(p);                 // había que quedarse quieto
          else if (a === orden) acierto(p);
          else fallo(p);
          break;
        }
      }

      if (reloj <= 0) {
        // Se acabó la ventana: quien no reaccionó a una orden buena, pierde;
        // quien se estuvo quieto ante la trampa, gana el punto.
        for (const p of jug) {
          if (p.respondio || p.hielo > 0) continue;
          if (esTrampa) acierto(p); else fallo(p);
        }
        const g = jug.find((p) => p.puntos >= PARA_GANAR);
        if (g) {
          ctx.finish({
            winner: g.i, scores: [jug[0].puntos, jug[1].puntos],
            detail: `${jug[0].fallos} y ${jug[1].fallos} fallos`,
          });
          return;
        }
        // Cada cuatro órdenes cambia la prohibida, sin parar el ritmo.
        if (ordenes % 4 === 0) nuevaProhibida();
        fase = 'aviso';
        reloj = 0.45;
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#08060f');

      // Regla vigente: enorme y tachada.
      g.save();
      if (avisoCambio > 0) {
        g.globalAlpha = 0.6 + Math.sin(t * 26) * 0.4;
      }
      ctx.engine.text('PROHIBIDA', W / 2, H * 0.13, { size: 14, color: '#ff4757', font: 'system-ui' });
      ctx.engine.text(`${GLIFOS[prohibida]} ${NOMBRES[prohibida]}`, W / 2, H * 0.22,
        { size: Math.min(40, W * 0.05), color: '#ff4757', glow: 16 });
      g.restore();
      g.strokeStyle = '#ff475766';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(W * 0.33, H * 0.245); g.lineTo(W * 0.67, H * 0.195);
      g.stroke();

      // Orden actual
      if (fase === 'orden') {
        const p = clamp(reloj / ventana, 0, 1);
        const trampa = esTrampa;
        ctx.engine.text(GLIFOS[orden], W / 2, H * 0.45, {
          size: Math.min(120, W * 0.15), color: trampa ? '#ff4757' : '#f2f2ff', glow: trampa ? 26 : 14,
        });
        const bw = W * 0.42;
        g.fillStyle = '#1a1a2c';
        g.fillRect(W / 2 - bw / 2, H * 0.56, bw, 7);
        g.fillStyle = p < 0.3 ? '#ff4757' : '#ffd166';
        g.fillRect(W / 2 - bw / 2, H * 0.56, bw * p, 7);
      } else {
        ctx.engine.text('…', W / 2, H * 0.45, { size: 50, color: '#1e1e34' });
      }

      for (const p of jug) {
        const cx = centroX(p.i);
        const col = players[p.i].color;
        g.save();
        if (p.marca > 0) { g.shadowColor = col; g.shadowBlur = 26; }
        g.fillStyle = p.hielo > 0 ? '#331a22' : p.marca > 0 ? `${col}44` : '#14142400';
        g.beginPath(); g.roundRect(cx - 84, H * 0.62, 168, 66, 12); g.fill();
        g.restore();
        g.strokeStyle = p.hielo > 0 ? '#ff4757' : `${col}66`;
        g.lineWidth = 2;
        g.beginPath(); g.roundRect(cx - 84, H * 0.62, 168, 66, 12); g.stroke();
        ctx.engine.text(String(p.puntos), cx, H * 0.655 + 8, { size: 30, color: col });
        ctx.engine.text(players[p.i].name, cx, H * 0.62 - 12, { size: 12, color: col, font: 'system-ui' });
        if (p.hielo > 0) {
          ctx.engine.text('bloqueado', cx, H * 0.62 + 84, { size: 11, color: '#ff4757', font: 'system-ui' });
        }
      }

      particles.render(g);
      ctx.engine.text('Obedece la flecha… salvo cuando sea la prohibida: entonces no toques nada',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
