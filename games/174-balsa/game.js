/**
 * Balsa — un remo cada uno y un río que no espera.
 *
 * Nadie puede girar solo: remar por la izquierda empuja hacia delante Y hace
 * girar a la derecha, y al revés. Ir recto es remar los dos a la vez, y girar
 * es que uno pare. Eso obliga a cantar el ritmo en voz alta, que es justo lo
 * que hace gracia.
 *
 * La corriente empuja siempre, así que dejar de remar no es una opción: es
 * elegir chocarse un poco más lejos.
 */

import { clamp, TAU, damp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const LARGO = 5200;            // longitud del río
const REMADA = 190;
const GIRO = 1.5;
const CORRIENTE = 90;
const VIDA = 5;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let balsa = { x: 0.5, y: 0, vx: 0, vy: 0, ang: 0 };
  let rocas = [], boyas = [];
  let vida = VIDA, recogidas = 0, terminado = false, t = 0, golpe = 0;
  const remo = [0, 0];
  let sb = null, camara = 0;

  function generar() {
    rocas = [];
    boyas = [];
    for (let y = 300; y < LARGO; y += 120) {
      const n = 1 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) {
        rocas.push({ x: 0.12 + rng() * 0.76, y: y + rng() * 90, r: 16 + rng() * 16 });
      }
      if (rng() < 0.4) boyas.push({ x: 0.15 + rng() * 0.7, y: y + 60, tomada: false });
    }
  }

  /** El cauce serpentea: las orillas son función de la altura. */
  const orillaIzq = (y) => 0.12 + Math.sin(y * 0.0016) * 0.08 + Math.sin(y * 0.0007) * 0.04;
  const orillaDer = (y) => 0.88 + Math.sin(y * 0.0016 + 1) * 0.08 + Math.sin(y * 0.0007) * 0.04;

  function chocar(motivo) {
    vida--;
    golpe = 0.5;
    audio.hit();
    haptics.impact(null, 1.2);
    ctx.shake(12);
    balsa.vy *= 0.3;
    particles.burst(balsa.x * W, H * 0.68, 20, { speed: 220, color: '#9fd8ff', size: 4, drag: 0.9 });
    sb.update(vida, recogidas);
    if (vida <= 0) {
      terminado = true;
      audio.lose();
      ctx.finish({
        winner: -1,
        scores: [Math.round((balsa.y / LARGO) * 100), recogidas],
        detail: `La balsa se rompe en el ${Math.round((balsa.y / LARGO) * 100)}% del río · ${motivo}`,
      });
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      balsa = { x: 0.5, y: 0, vx: 0, vy: 0, ang: 0 };
      vida = VIDA;
      sb = ui.scoreboard({ center: 'bajad el río' });
      sb.update(vida, 0);
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      golpe = Math.max(0, golpe - dt);
      particles.update(dt);

      for (const i of [0, 1]) {
        const pl = input.player(i);
        remo[i] = Math.max(0, remo[i] - dt * 3);
        if (pl.pressed('a')) {
          remo[i] = 1;
          audio.noise({ dur: 0.16, gain: 0.1, filter: 500, sweep: 400, type: 'bandpass', q: 2 });
          haptics.tap(i);
          particles.spawn({
            x: balsa.x * W + (i === 0 ? -30 : 30), y: H * 0.7,
            vx: (i === 0 ? -50 : 50), vy: 30,
            life: 0.5, maxLife: 0.5, size: 5, color: '#9fd8ff88', shape: 'circle',
          });
        }
      }

      // El remo izquierdo empuja y gira a la derecha; el derecho, al revés.
      const fuerza = (remo[0] + remo[1]) * REMADA;
      balsa.ang += (remo[0] - remo[1]) * GIRO * dt;
      balsa.ang = clamp(balsa.ang, -1.1, 1.1);
      balsa.vy += (fuerza + CORRIENTE) * dt;
      balsa.vx += Math.sin(balsa.ang) * (fuerza * 0.5 + CORRIENTE * 0.35) * dt / W;
      balsa.vy *= Math.pow(0.35, dt);
      balsa.vx *= Math.pow(0.2, dt);
      balsa.ang = damp(balsa.ang, 0, 1.2, dt);

      balsa.y += balsa.vy * dt;
      balsa.x += balsa.vx * dt;

      const iz = orillaIzq(balsa.y), de = orillaDer(balsa.y);
      if (balsa.x < iz + 0.03) { balsa.x = iz + 0.03; if (golpe <= 0) chocar('contra la orilla'); }
      if (balsa.x > de - 0.03) { balsa.x = de - 0.03; if (golpe <= 0) chocar('contra la orilla'); }

      for (const r of rocas) {
        if (Math.abs(r.y - balsa.y) > 40) continue;
        if (Math.abs(r.x - balsa.x) * W < r.r + 26 && golpe <= 0) { chocar('contra una roca'); break; }
      }
      for (const b of boyas) {
        if (b.tomada || Math.abs(b.y - balsa.y) > 26) continue;
        if (Math.abs(b.x - balsa.x) * W < 34) {
          b.tomada = true;
          recogidas++;
          if (recogidas % 3 === 0 && vida < VIDA) vida++;
          audio.pickup();
          haptics.score(null);
          sb.update(vida, recogidas);
          particles.burst(b.x * W, H * 0.68, 14, { speed: 170, color: '#ffd166', size: 4, drag: 0.9 });
        }
      }

      camara = balsa.y;

      if (balsa.y >= LARGO) {
        terminado = true;
        audio.win();
        haptics.victory(null);
        ctx.finish({
          winner: -1,
          scores: [vida, recogidas],
          detail: `¡Río completado! ${recogidas} boyas y ${vida} de ${VIDA} de casco · ${Math.round(t)} s`,
          record: ctx.record('tiempo', Math.round(t), 'low'),
        });
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a1622');

      const aPantalla = (y) => H * 0.7 - (y - camara);

      // Orillas
      g.fillStyle = '#16301c';
      g.beginPath();
      g.moveTo(0, 0);
      for (let sy = -60; sy <= H + 60; sy += 20) {
        const y = camara + (H * 0.7 - sy);
        g.lineTo(orillaIzq(y) * W, sy);
      }
      g.lineTo(0, H);
      g.fill();
      g.beginPath();
      g.moveTo(W, 0);
      for (let sy = -60; sy <= H + 60; sy += 20) {
        const y = camara + (H * 0.7 - sy);
        g.lineTo(orillaDer(y) * W, sy);
      }
      g.lineTo(W, H);
      g.fill();

      // Corriente
      g.strokeStyle = '#2a5a7a55';
      g.lineWidth = 2;
      for (let i = 0; i < 24; i++) {
        const y = ((i * 97 + t * 90) % (H + 120)) - 60;
        const x = (0.2 + ((i * 37) % 60) / 100) * W;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + 16, y + 8);
        g.stroke();
      }

      for (const r of rocas) {
        const y = aPantalla(r.y);
        if (y < -60 || y > H + 60) continue;
        g.fillStyle = '#4a4a58';
        g.beginPath(); g.arc(r.x * W, y, r.r, 0, TAU); g.fill();
        g.fillStyle = '#5f6070';
        g.beginPath(); g.arc(r.x * W - r.r * 0.25, y - r.r * 0.25, r.r * 0.55, 0, TAU); g.fill();
        g.fillStyle = '#ffffff22';
        g.beginPath(); g.ellipse(r.x * W, y + r.r * 0.7, r.r * 1.2, r.r * 0.3, 0, 0, TAU); g.fill();
      }
      for (const b of boyas) {
        if (b.tomada) continue;
        const y = aPantalla(b.y);
        if (y < -30 || y > H + 30) continue;
        ctx.engine.glowCircle(b.x * W, y, 11, '#ffd166', 16);
      }

      particles.render(g);

      // Balsa
      g.save();
      g.translate(balsa.x * W, H * 0.7);
      g.rotate(balsa.ang * 0.5);
      if (golpe > 0) g.globalAlpha = 0.5 + Math.sin(t * 40) * 0.4;
      g.fillStyle = '#8a5a32';
      g.beginPath(); g.roundRect(-34, -22, 68, 44, 7); g.fill();
      g.fillStyle = '#6b4526';
      for (let k = -2; k <= 2; k++) g.fillRect(k * 13 - 2, -22, 3, 44);
      // Remos: se levantan al remar.
      for (const i of [0, 1]) {
        const lado = i === 0 ? -1 : 1;
        g.save();
        g.translate(lado * 32, 0);
        g.rotate(lado * (0.5 - remo[i] * 0.9));
        g.strokeStyle = players[i].color;
        g.lineWidth = 5;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(lado * 30, 12); g.stroke();
        g.restore();
      }
      g.restore();

      for (const i of [0, 1]) {
        dibujarPersonaje(g, personajeDe(players[i], i), balsa.x * W + (i === 0 ? -14 : 14), H * 0.7 + 6, 42, {
          pose: remo[i] > 0.4 ? 'anda' : 'quieto',
          frame: remo[i] > 0.4 ? 1 : 0,
          acento: players[i].color,
          mirando: i === 0 ? -1 : 1,
        });
      }

      // Progreso y casco
      const prog = clamp(balsa.y / LARGO, 0, 1);
      g.fillStyle = '#00000088';
      g.fillRect(W * 0.25, 22, W * 0.5, 8);
      g.fillStyle = '#3effc8';
      g.fillRect(W * 0.25, 22, W * 0.5 * prog, 8);
      ctx.engine.text(`${Math.round(prog * 100)}% del río · casco ${'♥'.repeat(Math.max(0, vida))}`,
        W / 2, 46, { size: 12, color: vida <= 2 ? '#ff4757' : '#8fbfd0', font: 'system-ui' });

      ctx.engine.text(`${players[0].name}: remo izquierdo · ${players[1].name}: remo derecho · remad a la vez para ir recto`,
        W / 2, H - 12, { size: 11, color: '#4a6a7a', font: 'system-ui' });
    },
  };
}
