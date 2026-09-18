/**
 * Carrito del Súper — uno empuja, el otro dirige. Y la rueda va loca.
 *
 * P1 tiene el acelerador y el freno; P2 tiene el manillar. Ninguno de los dos
 * controla el carrito: lo controlan los dos juntos, y como el giro depende de
 * la velocidad que pone el otro, girar en seco no hace nada y a toda pastilla
 * se va contra la estantería.
 *
 * La rueda loca añade una deriva lenta que hay que corregir siempre. Sin ella
 * el pasillo recto se conduce solo y el juego se apaga.
 */

import { clamp, TAU, damp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const LISTA = ['Leche', 'Pan', 'Huevos', 'Tomates', 'Café', 'Papel'];
const VEL_MAX = 320;
const CHOQUES_MAX = 3;
const DURACION = 90;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  // El carrito vive en coordenadas de mundo; la cámara solo sigue su avance.
  const carro = { x: 0, y: 0, vel: 0, ang: -Math.PI / 2, deriva: 0 };
  let productos = [], estantes = [];
  let recogidos = 0, choques = 0, tiempo = DURACION, avanceMax = 0;
  let sb = null, terminado = false;

  const ANCHO_PASILLO = () => Math.min(520, W * 0.72);

  function reiniciar() {
    carro.x = 0; carro.y = 0; carro.vel = 0; carro.ang = -Math.PI / 2;
    carro.deriva = (rng() * 2 - 1) * 0.25;
    productos = [];
    estantes = [];
    const half = ANCHO_PASILLO() / 2;
    for (let i = 0; i < LISTA.length; i++) {
      productos.push({
        nombre: LISTA[i],
        x: (rng() * 2 - 1) * (half - 46),
        y: -(220 + i * 300 + rng() * 120),
        r: 20, tomado: false,
      });
    }
    for (let i = 0; i < 34; i++) {
      estantes.push({
        x: (rng() * 2 - 1) * (half - 30),
        y: -(260 + i * 150 + rng() * 90),
        w: 48 + rng() * 70, h: 26 + rng() * 16,
      });
    }
    recogidos = 0; choques = 0; tiempo = DURACION; avanceMax = 0;
    terminado = false;
  }

  /** Metros recorridos: el mundo va hacia -y, así que el avance es -y. */
  const avance = () => -carro.y;

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner(`${players[0].name} empuja (W/S) · ${players[1].name} dirige (← →)`);
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      const empuja = input.player(0);
      const dirige = input.player(1);

      // Acelerador y freno de P1
      if (empuja.held('up') || empuja.held('a')) carro.vel += 240 * dt;
      if (empuja.held('down') || empuja.held('b')) carro.vel -= 420 * dt;
      carro.vel = clamp(carro.vel - 55 * dt, 0, VEL_MAX);

      // Manillar de P2: el giro es proporcional a la velocidad, como en un
      // carro de verdad. Parado, el manillar no gira nada.
      const giro = dirige.x * 2.6 * (carro.vel / VEL_MAX);
      carro.ang += giro * dt + carro.deriva * dt * (carro.vel / VEL_MAX);
      carro.ang = clamp(carro.ang, -Math.PI / 2 - 1.1, -Math.PI / 2 + 1.1);

      // La rueda loca cambia de humor cada tanto.
      if (rng() < dt * 0.35) carro.deriva = (rng() * 2 - 1) * 0.4;

      carro.x += Math.cos(carro.ang) * carro.vel * dt;
      carro.y += Math.sin(carro.ang) * carro.vel * dt;
      avanceMax = Math.max(avanceMax, avance());

      const half = ANCHO_PASILLO() / 2;
      if (Math.abs(carro.x) > half - 18) {
        carro.x = Math.sign(carro.x) * (half - 18);
        carro.vel *= 0.4;
        carro.ang = damp(carro.ang, -Math.PI / 2, 8, dt);
        if (rng() < dt * 8) { audio.tone({ freq: 90, dur: 0.06, gain: 0.1, type: 'sawtooth' }); }
      }

      for (const p of productos) {
        if (p.tomado) continue;
        if (Math.hypot(p.x - carro.x, p.y - carro.y) < p.r + 22) {
          p.tomado = true;
          recogidos++;
          audio.pickup();
          haptics.play('score');
          particles.burst(W / 2 + p.x, H * 0.74 - (p.y - carro.y), 14, {
            speed: 160, color: '#a8ff3e', size: 4, shape: 'circle', gravity: -40,
          });
          ui.toast(`${p.nombre} ✓ (${recogidos}/${LISTA.length})`, { ms: 900, color: '#a8ff3e' });
        }
      }

      for (const e of estantes) {
        if (e.frio > 0) { e.frio -= dt; continue; }
        const cerca = Math.abs(carro.y - e.y) < e.h / 2 + 20 && Math.abs(carro.x - e.x) < e.w / 2 + 20;
        if (!cerca) continue;
        e.frio = 1.2;
        choques++;
        carro.vel *= 0.25;
        carro.deriva = (rng() * 2 - 1) * 0.5;
        audio.hit();
        haptics.impact(null, 1);
        ctx.shake(14);
        particles.burst(W / 2 + e.x - carro.x, H * 0.74, 18, { speed: 220, color: '#ff4757', size: 4, gravity: 260 });
        ui.toast(choques >= CHOQUES_MAX ? '¡Todo por el suelo!' : `Choque ${choques}/${CHOQUES_MAX}`, {
          ms: 1000, color: '#ff4757',
        });
      }

      sb.update(recogidos, choques);
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s · ${Math.round(avance() / 10)} m`);

      if (recogidos >= LISTA.length) return terminar(true);
      if (choques >= CHOQUES_MAX || tiempo <= 0) return terminar(false);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#12151c');

      const half = ANCHO_PASILLO() / 2;
      const cx = W / 2, cy = H * 0.74;

      // Suelo del pasillo con juntas que corren: la referencia de velocidad.
      g.fillStyle = '#20242e';
      g.fillRect(cx - half, 0, half * 2, H);
      g.save();
      g.strokeStyle = '#ffffff10';
      g.lineWidth = 2;
      const paso = 80;
      const off = ((-carro.y) % paso);
      for (let y = -paso + off; y < H + paso; y += paso) {
        g.beginPath(); g.moveTo(cx - half, y); g.lineTo(cx + half, y); g.stroke();
      }
      g.restore();

      // Estanterías laterales
      g.fillStyle = '#2c2438';
      g.fillRect(0, 0, cx - half, H);
      g.fillRect(cx + half, 0, W - (cx + half), H);
      g.fillStyle = '#3a3049';
      for (let y = ((-carro.y) % 60) - 60; y < H; y += 60) {
        g.fillRect(0, y, cx - half, 34);
        g.fillRect(cx + half, y, W - (cx + half), 34);
      }

      const py = (wy) => cy - (wy - carro.y);

      for (const e of estantes) {
        const y = py(e.y);
        if (y < -60 || y > H + 60) continue;
        g.fillStyle = e.frio > 0 ? '#ff4757' : '#4a3f5e';
        g.fillRect(cx + e.x - e.w / 2, y - e.h / 2, e.w, e.h);
        g.strokeStyle = '#6a5c85';
        g.lineWidth = 2;
        g.strokeRect(cx + e.x - e.w / 2, y - e.h / 2, e.w, e.h);
      }

      for (const p of productos) {
        if (p.tomado) continue;
        const y = py(p.y);
        if (y < -40 || y > H + 40) continue;
        g.save();
        g.shadowColor = '#a8ff3e'; g.shadowBlur = 16;
        g.fillStyle = '#a8ff3e';
        g.beginPath(); g.arc(cx + p.x, y, p.r * (1 + Math.sin(ctx.engine.time * 3) * 0.06), 0, TAU); g.fill();
        g.restore();
        ctx.engine.text(p.nombre, cx + p.x, y - 30, { size: 9, color: '#a8ff3e' });
      }

      particles.render(g);

      // El carrito: cesta, ruedas y las dos manos.
      g.save();
      g.translate(cx + carro.x, cy);
      g.rotate(carro.ang + Math.PI / 2);
      g.fillStyle = '#c8ccd4';
      g.fillRect(-17, -24, 34, 46);
      g.strokeStyle = '#8b929e'; g.lineWidth = 2;
      for (let i = -12; i <= 12; i += 8) { g.beginPath(); g.moveTo(i, -24); g.lineTo(i, 22); g.stroke(); }
      g.fillStyle = players[1].color;
      g.fillRect(-19, 22, 38, 6);
      g.fillStyle = players[0].color;
      g.beginPath(); g.arc(0, 40, 12, 0, TAU); g.fill();
      g.restore();

      // Velocímetro y deriva: lo que cada uno necesita saber del otro.
      const bw = 160;
      g.fillStyle = '#ffffff14';
      g.fillRect(cx - bw / 2, H - 34, bw, 8);
      g.fillStyle = players[0].color;
      g.fillRect(cx - bw / 2, H - 34, bw * (carro.vel / VEL_MAX), 8);
      g.save();
      g.globalAlpha = 0.8;
      g.fillStyle = Math.abs(carro.deriva) > 0.25 ? '#ff4757' : '#ffd166';
      g.fillRect(cx, H - 50, clamp(carro.deriva * 200, -70, 70), 6);
      g.restore();
      ctx.engine.text(`${recogidos}/${LISTA.length} de la lista`, cx, 34, { size: 12, color: '#a8ff3e' });
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(completo) {
    terminado = true;
    let veredicto;
    if (completo && choques === 0) veredicto = 'La lista entera y sin tocar una estantería.';
    else if (completo) veredicto = 'La compra está hecha. El súper, regular.';
    else if (choques >= CHOQUES_MAX) veredicto = 'Tres estanterías. Les van a pedir el carné.';
    else veredicto = `Cerraron con ${LISTA.length - recogidos} cosas sin coger.`;
    if (completo) { audio.win(); haptics.victory(0); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [recogidos, choques],
      detail: `${veredicto} · ${Math.round(avanceMax / 10)} m de pasillo`,
      record: ctx.record('productos', recogidos, 'high'),
    });
  }
}
