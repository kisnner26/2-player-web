/**
 * Fogata — montar el campamento antes de que se haga de noche del todo.
 *
 * Uno recoge leña del bosque y el otro mantiene el fuego: si el fuego se apaga
 * no hay luz, y sin luz el que recoge no ve nada. La dependencia va en las dos
 * direcciones y se nota enseguida — cuando el fuego baja, el bosque se cierra.
 *
 * No hay enemigos ni prisa artificial: solo la noche, que llega igual. Lo que
 * se puntúa es lo alto que llegasteis a tener la hoguera, no lo rápido que
 * fuisteis.
 */

import { clamp, TAU, damp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const NOCHE = 120;             // segundos hasta el amanecer
const FUEGO_MAX = 100;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let leñador = { x: 0.5, y: 0.5, carga: 0, mira: 1, fase: 0 };
  let guarda = { x: 0.5, alimentando: 0 };
  let troncos = [], fuego = 45, reloj = NOCHE, t = 0, terminado = false;
  let echados = 0, recogidos = 0, mejorFuego = 45, calorAcum = 0;
  let sb = null;

  const hogueraX = () => W * 0.5;
  const hogueraY = () => H * 0.72;
  const CARGA_MAX = 3;

  function sembrarTroncos() {
    troncos = [];
    for (let i = 0; i < 9; i++) {
      troncos.push({ x: 0.08 + rng() * 0.84, y: 0.18 + rng() * 0.5, tomado: false, r: rng() * TAU });
    }
  }

  function nuevoTronco() {
    troncos.push({ x: 0.08 + rng() * 0.84, y: 0.18 + rng() * 0.5, tomado: false, r: rng() * TAU });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sembrarTroncos();
      sb = ui.scoreboard({ center: 'montad el campamento' });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);
      reloj -= dt;

      /* --- Leñador (J1) --- */
      const p0 = input.player(0);
      const vis = clamp(fuego / FUEGO_MAX, 0.12, 1);
      // Con poca luz se anda más despacio: tropiezas con todo.
      const vel = 0.2 + vis * 0.24;
      leñador.x = clamp(leñador.x + p0.ax * vel * dt, 0.04, 0.96);
      leñador.y = clamp(leñador.y + p0.ay * vel * dt, 0.14, 0.9);
      if (p0.ax) leñador.mira = p0.ax > 0 ? 1 : -1;

      if (p0.pressed('a')) {
        // Cerca de la hoguera suelta; en el bosque recoge.
        const dHog = Math.hypot(leñador.x - 0.5, leñador.y - 0.72);
        if (dHog < 0.1 && leñador.carga > 0) {
          echados += leñador.carga;
          leñador.carga = 0;
          audio.place();
          haptics.tap(0);
        } else {
          const cerca = troncos.find((tr) => !tr.tomado && Math.hypot(tr.x - leñador.x, tr.y - leñador.y) < 0.06);
          if (cerca && leñador.carga < CARGA_MAX) {
            cerca.tomado = true;
            leñador.carga++;
            recogidos++;
            audio.pickup();
            haptics.tick(0);
            nuevoTronco();
          } else {
            audio.tone({ freq: 170, dur: 0.06, gain: 0.07, type: 'square' });
          }
        }
      }

      /* --- Guardián del fuego (J2) --- */
      const p1 = input.player(1);
      guarda.x = clamp(guarda.x + p1.ax * 0.25 * dt, 0.38, 0.62);
      guarda.alimentando = Math.max(0, guarda.alimentando - dt * 3);
      if (p1.pressed('a') && echados > 0) {
        echados--;
        fuego = clamp(fuego + 13, 0, FUEGO_MAX);
        guarda.alimentando = 1;
        audio.tone({ freq: 240, dur: 0.14, gain: 0.13, type: 'sawtooth', sweep: 90 });
        haptics.score(1);
        particles.burst(hogueraX(), hogueraY(), 14, {
          speed: 200, dir: -Math.PI / 2, spread: 1.6, color: '#ff8c42', size: 4, gravity: -60, drag: 0.92,
        });
      }
      if (p1.held('b') || p1.held('up')) {
        // Soplar: sube un poco pero consume más leña por segundo.
        fuego = clamp(fuego + 6 * dt, 0, FUEGO_MAX);
        if (rng() < dt * 20) {
          particles.spawn({
            x: hogueraX() + (rng() - 0.5) * 30, y: hogueraY(), vx: (rng() - 0.5) * 40, vy: -90,
            life: 0.5, maxLife: 0.5, size: 3, color: '#ffd166', shape: 'circle',
          });
        }
      }

      fuego = clamp(fuego - (2.4 + (p1.held('b') ? 3.2 : 0)) * dt, 0, FUEGO_MAX);
      mejorFuego = Math.max(mejorFuego, fuego);
      calorAcum += (fuego / FUEGO_MAX) * dt;
      sb.update(Math.round(fuego), echados);

      if (rng() < dt * 3 && fuego > 5) {
        particles.spawn({
          x: hogueraX() + (rng() - 0.5) * 26, y: hogueraY() - 10,
          vx: (rng() - 0.5) * 30, vy: -60 - rng() * 60,
          life: 1.1, maxLife: 1.1, size: 3, color: '#ff8c42', shape: 'circle', drag: 0.99,
        });
      }

      if (reloj <= 0) {
        terminado = true;
        const nota = clamp(calorAcum / NOCHE, 0, 1);
        audio.win();
        haptics.victory(null);
        ctx.finish({
          winner: -1,
          scores: [Math.round(nota * 100), recogidos],
          detail: `Noche pasada con ${Math.round(nota * 100)} de calor medio · ${recogidos} troncos`,
          record: ctx.record('calor', Math.round(nota * 100), 'high'),
        });
      }
    },

    render() {
      const g = ctx.c;
      const noche = clamp(1 - reloj / NOCHE, 0, 1);
      ctx.engine.clear('#050810');

      // Cielo que se oscurece y luego clarea al final.
      const cielo = g.createLinearGradient(0, 0, 0, H);
      const azul = Math.round(40 - Math.sin(noche * Math.PI) * 30);
      cielo.addColorStop(0, `rgb(${Math.round(14 + azul * 0.3)},${Math.round(12 + azul * 0.3)},${20 + azul})`);
      cielo.addColorStop(1, '#080a12');
      g.fillStyle = cielo;
      g.fillRect(0, 0, W, H);

      for (let i = 0; i < 90; i++) {
        const x = ((i * 173) % W);
        const y = ((i * 97) % (H * 0.5));
        g.fillStyle = `rgba(255,255,255,${0.15 + Math.sin(t + i) * 0.1})`;
        g.fillRect(x, y, 2, 2);
      }

      // Árboles de fondo
      g.fillStyle = '#0d1410';
      for (let i = 0; i < 16; i++) {
        const x = (i / 16) * W + 20;
        const h = H * (0.2 + ((i * 37) % 9) / 40);
        g.beginPath();
        g.moveTo(x - 30, H * 0.62);
        g.lineTo(x, H * 0.62 - h);
        g.lineTo(x + 30, H * 0.62);
        g.fill();
      }
      g.fillStyle = '#0e1a12';
      g.fillRect(0, H * 0.62, W, H * 0.38);

      // Luz de la hoguera: define lo que se ve.
      const r = (0.2 + (fuego / FUEGO_MAX) * 0.8) * Math.min(W, H) * 0.9;
      const luz = g.createRadialGradient(hogueraX(), hogueraY(), 0, hogueraX(), hogueraY(), r);
      luz.addColorStop(0, 'rgba(255,150,60,0.34)');
      luz.addColorStop(0.5, 'rgba(255,120,40,0.12)');
      luz.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = luz;
      g.fillRect(0, 0, W, H);

      for (const tr of troncos) {
        if (tr.tomado) continue;
        const x = tr.x * W, y = tr.y * H;
        const d = Math.hypot(x - hogueraX(), y - hogueraY());
        const visible = clamp(1.2 - d / r, 0.05, 1);
        g.save();
        g.globalAlpha = visible;
        g.translate(x, y);
        g.rotate(tr.r);
        g.fillStyle = '#6b4526';
        g.fillRect(-16, -6, 32, 12);
        g.fillStyle = '#8a5a32';
        g.fillRect(-16, -6, 32, 4);
        g.restore();
      }

      // Hoguera
      const alt = 10 + (fuego / FUEGO_MAX) * 60;
      g.fillStyle = '#4a3020';
      for (const a of [-0.5, 0, 0.5]) {
        g.save();
        g.translate(hogueraX(), hogueraY() + 6);
        g.rotate(a);
        g.fillRect(-26, -5, 52, 10);
        g.restore();
      }
      for (let k = 0; k < 3; k++) {
        const w = alt * (0.5 - k * 0.12);
        ctx.engine.glowCircle(
          hogueraX() + Math.sin(t * 5 + k) * 4,
          hogueraY() - k * alt * 0.28 - alt * 0.2,
          Math.max(2, w),
          k === 0 ? '#ff4757' : k === 1 ? '#ff8c42' : '#ffd166',
          24,
        );
      }

      particles.render(g);

      // Personajes
      const anim = pasoAnimado(leñador, { vx: input.player(0).ax * 60, suelo: true, dt: 1 / 60 });
      dibujarPersonaje(g, personajeDe(players[0], 0), leñador.x * W, leñador.y * H + 24, 58, {
        ...anim, mirando: leñador.mira, acento: players[0].color, brillo: leñador.carga ? 12 : 0,
      });
      if (leñador.carga) {
        for (let k = 0; k < leñador.carga; k++) {
          g.fillStyle = '#8a5a32';
          g.fillRect(leñador.x * W - 12, leñador.y * H - 34 - k * 7, 24, 5);
        }
      }
      dibujarPersonaje(g, personajeDe(players[1], 1), guarda.x * W, hogueraY() + 34, 58, {
        pose: guarda.alimentando > 0 ? 'salta' : 'quieto',
        acento: players[1].color, mirando: guarda.x < 0.5 ? 1 : -1,
        brillo: guarda.alimentando > 0 ? 20 : 0,
      });

      // Marcadores
      g.fillStyle = '#00000088';
      g.fillRect(W / 2 - 100, 20, 200, 12);
      g.fillStyle = fuego < 25 ? '#ff4757' : '#ff8c42';
      g.fillRect(W / 2 - 100, 20, 200 * (fuego / FUEGO_MAX), 12);
      ctx.engine.text(`fuego ${Math.round(fuego)} · leña junto a la hoguera: ${echados} · en brazos: ${leñador.carga}/${CARGA_MAX}`,
        W / 2, 46, { size: 12, color: '#d8c0a0', font: 'system-ui' });
      ctx.engine.text(`amanece en ${Math.ceil(Math.max(0, reloj))}s`, W / 2, H * 0.08,
        { size: 13, color: '#9fb0d0', font: 'system-ui' });

      ctx.engine.text(`${players[0].name}: recoge leña y déjala en la hoguera · ${players[1].name}: échala al fuego y sopla`,
        W / 2, H - 12, { size: 11, color: '#6a5a48', font: 'system-ui' });
    },
  };
}
