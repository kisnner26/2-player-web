/**
 * Semáforo — corre mientras esté verde y quédate MUY quieto cuando no lo esté.
 *
 * Se avanza manteniendo la tecla, así que la trampa es física: el dedo va más
 * despacio que el ojo. Entre el ámbar y el rojo hay una ventana corta y quien
 * la apura gana medio metro por ronda; quien la apura de más vuelve atrás.
 *
 * El semáforo no es honesto: a veces el ámbar dura un suspiro y a veces se
 * eterniza, y de vez en cuando vuelve a verde sin pasar por rojo. La única
 * defensa es no fiarse del ritmo anterior.
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const META = 100;
const VELOCIDAD = 15.5;        // unidades de avance por segundo
const CASTIGO = 9;             // lo que se retrocede al pillarte en rojo

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let luz = 'verde', reloj = 2.2, t = 0, terminado = false;
  const jug = [crear(0), crear(1)];
  let sb = null;

  function crear(i) {
    return { i, avance: 0, pillado: 0, fase: 0, mira: 1, faltas: 0, corriendo: false };
  }

  function cambiar() {
    if (luz === 'verde') {
      luz = 'ambar';
      // El ámbar es corto y variable: es donde se decide la partida.
      reloj = 0.35 + rng() * 0.8;
      audio.tone({ freq: 620, dur: 0.1, gain: 0.16, type: 'triangle' });
    } else if (luz === 'ambar') {
      // A veces el semáforo se arrepiente y vuelve a verde sin pasar por rojo.
      if (rng() < 0.22) {
        luz = 'verde';
        reloj = 1.4 + rng() * 2.6;
        audio.tone({ freq: 780, dur: 0.12, gain: 0.16, type: 'triangle' });
      } else {
        luz = 'rojo';
        reloj = 1.1 + rng() * 1.9;
        audio.tone({ freq: 260, dur: 0.16, gain: 0.2, type: 'square' });
        ctx.shake(3);
      }
    } else {
      luz = 'verde';
      reloj = 1.6 + rng() * 3.0;
      audio.tone({ freq: 880, dur: 0.14, gain: 0.18, type: 'triangle' });
    }
  }

  function pillar(p) {
    p.pillado = 0.7;
    p.faltas++;
    p.avance = Math.max(0, p.avance - CASTIGO);
    audio.error();
    haptics.error(p.i);
    ctx.shake(6);
    particles.burst(carrilX(p.avance), carrilY(p.i), 16, {
      speed: 200, color: '#ff4757', size: 4, drag: 0.9,
    });
  }

  const carrilX = (av) => 70 + (W - 170) * clamp(av / META, 0, 1);
  const carrilY = (i) => H * (i === 0 ? 0.52 : 0.74);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      luz = 'verde';
      reloj = 2.2;
      sb = ui.scoreboard({ center: 'a la meta' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      reloj -= dt;
      if (reloj <= 0) cambiar();

      for (const p of jug) {
        p.pillado = Math.max(0, p.pillado - dt);
        const pl = input.player(p.i);
        const anda = pl.held('a') || pl.held('right');
        p.corriendo = anda && p.pillado <= 0;

        if (!anda || p.pillado > 0) continue;

        if (luz === 'rojo') { pillar(p); continue; }
        // En ámbar se avanza, pero más despacio: apurar renta poco y arriesga.
        p.avance += VELOCIDAD * (luz === 'verde' ? 1 : 0.45) * dt;
        p.fase += dt * 8;
        if (rng() < dt * 12) {
          particles.spawn({
            x: carrilX(p.avance) - 14, y: carrilY(p.i), vx: -60 - rng() * 60, vy: -20 + rng() * 40,
            life: 0.35, maxLife: 0.35, size: 3, color: `${players[p.i].color}88`,
          });
        }

        if (p.avance >= META) {
          terminado = true;
          audio.win();
          haptics.victory(p.i);
          ctx.finish({
            winner: p.i,
            scores: [Math.round(jug[0].avance), Math.round(jug[1].avance)],
            detail: `${p.faltas} salidas en rojo`,
          });
          return;
        }
      }

      sb.update(Math.round(jug[0].avance), Math.round(jug[1].avance));
    },

    render() {
      const g = ctx.c;
      const fondo = luz === 'rojo' ? '#160810' : luz === 'ambar' ? '#161006' : '#06120a';
      ctx.engine.clear(fondo);

      // Semáforo enorme: es lo único que hay que mirar.
      const cx = W / 2, cy = H * 0.22, r = Math.min(46, H * 0.07);
      g.fillStyle = '#15121f';
      g.beginPath(); g.roundRect(cx - r * 1.5, cy - r * 3.6, r * 3, r * 7.2, r * 0.6); g.fill();
      const luces = [['rojo', '#ff4757'], ['ambar', '#ffd166'], ['verde', '#a8ff3e']];
      luces.forEach(([nombre, color], i) => {
        const y = cy + (i - 1) * r * 2.3;
        if (luz === nombre) ctx.engine.glowCircle(cx, y, r * 0.85, color, 40);
        else { g.fillStyle = `${color}18`; g.beginPath(); g.arc(cx, y, r * 0.85, 0, Math.PI * 2); g.fill(); }
      });

      // Pista
      for (const p of jug) {
        const y = carrilY(p.i);
        const col = players[p.i].color;
        g.fillStyle = '#12101d';
        g.fillRect(50, y - 26, W - 100, 52);
        g.strokeStyle = '#ffffff10';
        g.setLineDash([12, 14]);
        g.beginPath(); g.moveTo(50, y); g.lineTo(W - 50, y); g.stroke();
        g.setLineDash([]);

        // Meta
        for (let k = 0; k < 6; k++) {
          g.fillStyle = k % 2 ? '#ffffff' : '#20202e';
          g.fillRect(W - 100 + (k % 2) * 9, y - 26 + k * 9, 9, 9);
        }

        const x = carrilX(p.avance);
        const anim = pasoAnimado(p, { vx: p.corriendo ? 90 : 0, suelo: true, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[p.i], p.i), x, y + 22, 54, {
          ...anim, mirando: 1, acento: col,
          brillo: p.pillado > 0 ? 24 : 0,
          alpha: p.pillado > 0 ? 0.55 + Math.sin(t * 30) * 0.25 : 1,
        });

        ctx.engine.text(`${players[p.i].name} · ${Math.round(p.avance)}`, 54, y - 36,
          { size: 12, color: col, align: 'left', font: 'system-ui' });
        if (p.pillado > 0) {
          ctx.engine.text('¡PILLADO!', x, y - 44, { size: 14, color: '#ff4757', glow: 10 });
        }
      }

      particles.render(g);
      ctx.engine.text('Mantén tu tecla para correr · en rojo, suéltala o retrocedes · el ámbar avanza a medias',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
