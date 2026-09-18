/**
 * Sombras Chinescas — cuatro articulaciones, dos personas, una silueta.
 *
 * Cada uno maneja un brazo entero: el hombro con arriba/abajo y el codo con
 * izquierda/derecha. La figura que pide la pared necesita los cuatro ángulos a
 * la vez, así que nadie puede comprobar si va bien mirando solo su mitad.
 *
 * El cierre es lo que obliga a hablar: para fijar la figura hay que pulsar los
 * dos casi al mismo tiempo. Si uno se adelanta, el otro se queda sin margen.
 */

import { clamp, TAU, angleDiff } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const FIGURAS = [
  { nombre: 'Conejo',    a: [-1.1, 0.5, -0.9, -0.4] },
  { nombre: 'Pájaro',    a: [-0.5, -1.0, -0.5, 1.0] },
  { nombre: 'Perro',     a: [0.2, 0.9, -0.8, 0.3] },
  { nombre: 'Cocodrilo', a: [-0.2, -0.2, 0.2, 0.2] },
  { nombre: 'Caracol',   a: [-1.3, 1.2, -0.2, -1.1] },
  { nombre: 'Elefante',  a: [0.6, -0.7, -1.2, 0.8] },
  { nombre: 'Cabra',     a: [-0.9, -1.2, 0.6, 0.9] },
  { nombre: 'Araña',     a: [1.0, 0.4, 1.0, -0.4] },
];

const TOLERANCIA = 0.3;        // radianes de margen por articulación
const VENTANA = 0.35;          // segundos entre los dos cierres
const DURACION = 90;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  // Ángulos: [hombro P1, codo P1, hombro P2, codo P2]
  let ang = [0, 0, 0, 0];
  let orden = [], indice = 0;
  let listo = [0, 0];           // marca de tiempo del cierre de cada uno
  let reloj = 0, tiempo = DURACION;
  let logradas = 0, fallos = 0;
  let sb = null, terminado = false, destello = 0;

  const objetivo = () => orden[indice % orden.length];

  function reiniciar() {
    ang = [0.2, -0.2, 0.2, -0.2];
    orden = FIGURAS.map((f, i) => i).sort(() => rng() - 0.5);
    indice = 0;
    listo = [0, 0];
    reloj = 0; tiempo = DURACION;
    logradas = 0; fallos = 0;
    terminado = false;
  }

  /** Error máximo entre la pose actual y la pedida. */
  function error() {
    const t = FIGURAS[objetivo()].a;
    let peor = 0;
    for (let i = 0; i < 4; i++) peor = Math.max(peor, Math.abs(angleDiff(ang[i], t[i])));
    return peor;
  }

  function intentarCerrar() {
    const err = error();
    if (err <= TOLERANCIA) {
      logradas++;
      destello = 1;
      audio.win();
      haptics.play('score');
      particles.burst(W / 2, H * 0.45, 24, { speed: 220, color: '#ffd166', size: 4, shape: 'circle' });
      ui.toast(`¡${FIGURAS[objetivo()].nombre}! (${logradas})`, { ms: 900, color: '#ffd166' });
    } else {
      fallos++;
      audio.error();
      haptics.error();
      ctx.shake(6);
      ui.toast(`No era eso · faltaban ${Math.round(err * 57)}°`, { ms: 900, color: '#ff4757' });
    }
    indice++;
    listo = [0, 0];
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Cada uno mueve su brazo (arriba/abajo = hombro, izq/der = codo) · cierren <b>a la vez</b>');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      reloj += dt;
      tiempo -= dt;
      destello = Math.max(0, destello - dt * 2.5);

      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        ang[i * 2] = clamp(ang[i * 2] + pl.y * 1.5 * dt, -1.5, 1.5);
        ang[i * 2 + 1] = clamp(ang[i * 2 + 1] + pl.x * 1.5 * dt, -1.5, 1.5);
        if (pl.pressed('a')) {
          listo[i] = reloj;
          audio.blip();
          haptics.play('tick', { player: i });
        }
      }

      // Cierre válido solo si los dos han pulsado dentro de la ventana.
      if (listo[0] && listo[1] && Math.abs(listo[0] - listo[1]) <= VENTANA) intentarCerrar();
      // Un cierre solitario caduca: no se puede dejar la tecla "puesta".
      for (let i = 0; i < 2; i++) if (listo[i] && reloj - listo[i] > VENTANA) listo[i] = 0;

      sb.update(logradas, fallos);
      sb.setCenter(`${FIGURAS[objetivo()].nombre} · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (tiempo <= 0) return terminar();

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0e0c14');

      // Pared iluminada por la vela
      const rg = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, W * 0.55);
      rg.addColorStop(0, '#f5e2b8');
      rg.addColorStop(0.6, '#c9a878');
      rg.addColorStop(1, '#4a3a2a');
      g.fillStyle = rg;
      g.fillRect(0, 0, W, H);

      const cx = W / 2, cy = H * 0.46;
      const L1 = Math.min(W, H) * 0.19, L2 = Math.min(W, H) * 0.15;

      /** Dibuja un brazo de dos tramos con su mano. */
      function brazo(base, dir, a1, a2, color, grosor) {
        const x0 = cx + dir * base;
        const y0 = cy + Math.min(W, H) * 0.1;
        const x1 = x0 + Math.cos(-Math.PI / 2 + a1) * L1 * dir;
        const y1 = y0 + Math.sin(-Math.PI / 2 + a1) * L1;
        const x2 = x1 + Math.cos(-Math.PI / 2 + a1 + a2) * L2 * dir;
        const y2 = y1 + Math.sin(-Math.PI / 2 + a1 + a2) * L2;
        g.save();
        g.strokeStyle = color;
        g.lineWidth = grosor;
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        g.beginPath(); g.arc(x2, y2, grosor * 0.55, 0, TAU); g.fillStyle = color; g.fill();
        g.restore();
        return { x2, y2 };
      }

      // La silueta pedida, muy tenue detrás: la referencia a igualar.
      const t = FIGURAS[objetivo()].a;
      brazo(-Math.min(W, H) * 0.06, -1, t[0], t[1], '#00000028', 26);
      brazo(Math.min(W, H) * 0.06, 1, t[2], t[3], '#00000028', 26);

      // La sombra real de los dos
      brazo(-Math.min(W, H) * 0.06, -1, ang[0], ang[1], '#1a1208', 22);
      brazo(Math.min(W, H) * 0.06, 1, ang[2], ang[3], '#1a1208', 22);

      particles.render(g);

      // Nombre de la figura y semáforo de cercanía
      const err = error();
      const cerca = err <= TOLERANCIA;
      ctx.engine.text(FIGURAS[objetivo()].nombre.toUpperCase(), cx, H * 0.14, {
        size: 20, color: cerca ? '#2a6a2a' : '#4a3a2a',
      });
      g.fillStyle = '#00000022';
      g.fillRect(cx - 90, H * 0.18, 180, 8);
      g.fillStyle = cerca ? '#2a8a2a' : err < TOLERANCIA * 2 ? '#c9a227' : '#a02a2a';
      g.fillRect(cx - 90, H * 0.18, 180 * clamp(1 - err / 1.6, 0, 1), 8);

      // Quién ha pulsado ya
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? cx - 120 : cx + 120;
        const pulsado = listo[i] && reloj - listo[i] <= VENTANA;
        g.save();
        g.globalAlpha = pulsado ? 1 : 0.25;
        ctx.engine.glowCircle(x, H * 0.86, 14, players[i].color, pulsado ? 20 : 4);
        g.restore();
      }
      ctx.engine.text('pulsen los dos a la vez para fijar', cx, H * 0.93, { size: 10, color: '#4a3a2a' });

      if (destello > 0) {
        g.save();
        g.globalAlpha = destello * 0.5;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, W, H);
        g.restore();
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar() {
    terminado = true;
    let veredicto;
    if (logradas >= 6) veredicto = 'Se entienden con las manos. Literalmente.';
    else if (logradas >= 3) veredicto = 'Media pared de animales reconocibles.';
    else veredicto = 'La vela vio sobre todo manchas.';
    if (logradas >= 3) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [logradas, fallos],
      detail: `${logradas} figuras · ${fallos} fallos · ${veredicto}`,
      record: ctx.record('figuras', logradas, 'high'),
    });
  }
}
