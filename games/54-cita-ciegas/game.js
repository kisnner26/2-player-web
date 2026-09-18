/**
 * Cita a Ciegas — uno ve el restaurante, el otro camina por él.
 *
 * Pantalla partida asimétrica: a la izquierda, P1 ve el comedor entero pero no
 * puede moverse; a la derecha, P2 se mueve pero solo ve un palmo alrededor.
 * P1 no habla con teclas de movimiento propias: manda FLECHAS, que aparecen
 * enormes en la mitad de P2 durante un segundo.
 *
 * Lo que hace que funcione es el retardo: cuando la flecha llega, el camarero
 * ya se movió. P1 tiene que anticipar, no describir.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const MUNDO_W = 620, MUNDO_H = 520;
const VEL = 132;
const VISION = 92;
const DURACION = 80;
const VIDAS = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const yo = { x: 60, y: MUNDO_H - 60, r: 13 };
  const mesa = { x: MUNDO_W - 70, y: 70, r: 26 };
  let sillas = [];
  let camareros = [];
  let senal = null;             // { dir, vida }
  let tiempo = DURACION, vidas = VIDAS, golpes = 0, senales = 0;
  let sb = null, terminado = false, invulnerable = 0;

  function reiniciar() {
    yo.x = 60; yo.y = MUNDO_H - 60;
    sillas = [];
    for (let i = 0; i < 16; i++) {
      let x, y, intentos = 0;
      do {
        x = 70 + rng() * (MUNDO_W - 140);
        y = 70 + rng() * (MUNDO_H - 140);
        intentos++;
      } while (intentos < 30 && (Math.hypot(x - yo.x, y - yo.y) < 90 || Math.hypot(x - mesa.x, y - mesa.y) < 80));
      sillas.push({ x, y, r: 17 + rng() * 7 });
    }
    camareros = [];
    for (let i = 0; i < 3; i++) {
      camareros.push({
        x: 100 + rng() * (MUNDO_W - 200),
        y: 100 + rng() * (MUNDO_H - 200),
        r: 18,
        ang: rng() * TAU,
        vel: 62 + rng() * 40,
      });
    }
    tiempo = DURACION; vidas = VIDAS; golpes = 0; senales = 0;
    senal = null; invulnerable = 0;
    terminado = false;
  }

  /** Dibuja el mundo dentro de un rectángulo de pantalla, con recorte. */
  function vista(g, x, y, w, h, dibujo) {
    const esc = Math.min(w / MUNDO_W, h / MUNDO_H);
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(x + (w - MUNDO_W * esc) / 2, y + (h - MUNDO_H * esc) / 2);
    g.scale(esc, esc);
    dibujo(g);
    g.restore();
  }

  function comedor(g, { conNiebla }) {
    g.fillStyle = '#1a1220';
    g.fillRect(0, 0, MUNDO_W, MUNDO_H);
    g.strokeStyle = '#ffffff0e';
    g.lineWidth = 1;
    for (let i = 0; i <= MUNDO_W; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, MUNDO_H); g.stroke(); }
    for (let i = 0; i <= MUNDO_H; i += 40) { g.beginPath(); g.moveTo(0, i); g.lineTo(MUNDO_W, i); g.stroke(); }

    // Mesa reservada, con su velita
    g.save();
    g.shadowColor = '#ffd166'; g.shadowBlur = 22;
    g.fillStyle = '#3a2a1a';
    g.beginPath(); g.arc(mesa.x, mesa.y, mesa.r, 0, TAU); g.fill();
    g.restore();
    g.fillStyle = '#ffd166';
    g.beginPath(); g.arc(mesa.x, mesa.y, 5, 0, TAU); g.fill();

    for (const s of sillas) {
      g.fillStyle = '#39304a';
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
      g.strokeStyle = '#4d4165'; g.lineWidth = 2;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.stroke();
    }

    for (const c of camareros) {
      g.save();
      g.shadowColor = '#ff4757'; g.shadowBlur = 12;
      g.fillStyle = '#c0392b';
      g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.fill();
      g.restore();
      // Bandeja: indica hacia dónde va, que es lo que P1 tiene que leer.
      g.fillStyle = '#e8e0d0';
      g.beginPath();
      g.arc(c.x + Math.cos(c.ang) * c.r, c.y + Math.sin(c.ang) * c.r, 7, 0, TAU);
      g.fill();
    }

    // El que camina
    g.save();
    if (invulnerable > 0 && Math.sin(invulnerable * 30) < 0) g.globalAlpha = 0.3;
    g.shadowColor = players[1].color; g.shadowBlur = 18;
    g.fillStyle = players[1].color;
    g.beginPath(); g.arc(yo.x, yo.y, yo.r, 0, TAU); g.fill();
    g.restore();

    particles.render(g);

    // Niebla de la vista de P2: todo negro salvo un círculo alrededor.
    if (conNiebla) {
      g.save();
      g.globalCompositeOperation = 'destination-in';
      const rg = g.createRadialGradient(yo.x, yo.y, VISION * 0.35, yo.x, yo.y, VISION);
      rg.addColorStop(0, '#fff');
      rg.addColorStop(1, '#fff0');
      g.fillStyle = rg;
      g.fillRect(0, 0, MUNDO_W, MUNDO_H);
      g.restore();
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('P1 manda flechas con sus direcciones · P2 camina a ciegas hasta la mesa');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;
      invulnerable = Math.max(0, invulnerable - dt);

      // P1 solo puede señalar. Una flecha a la vez: no vale pintar un mapa.
      const guia = input.player(0);
      for (const [accion, dir] of [['up', 'up'], ['down', 'down'], ['left', 'left'], ['right', 'right']]) {
        if (guia.pressed(accion)) {
          senal = { dir, vida: 1.1 };
          senales++;
          audio.blip();
          haptics.play('tick', { player: 1 });
        }
      }
      if (guia.pressed('a')) { senal = { dir: 'alto', vida: 0.9 }; senales++; audio.beep(520); }
      if (senal) { senal.vida -= dt; if (senal.vida <= 0) senal = null; }

      // P2 camina
      const pl = input.player(1);
      const dx = pl.x, dy = pl.y;
      const len = Math.hypot(dx, dy) || 1;
      yo.x = clamp(yo.x + (dx / len) * VEL * dt, yo.r, MUNDO_W - yo.r);
      yo.y = clamp(yo.y + (dy / len) * VEL * dt, yo.r, MUNDO_H - yo.r);

      for (const c of camareros) {
        c.x += Math.cos(c.ang) * c.vel * dt;
        c.y += Math.sin(c.ang) * c.vel * dt;
        if (c.x < c.r || c.x > MUNDO_W - c.r) { c.ang = Math.PI - c.ang; c.x = clamp(c.x, c.r, MUNDO_W - c.r); }
        if (c.y < c.r || c.y > MUNDO_H - c.r) { c.ang = -c.ang; c.y = clamp(c.y, c.r, MUNDO_H - c.r); }
        if (rng() < dt * 0.4) c.ang += (rng() - 0.5) * 1.2;
      }

      if (invulnerable <= 0) {
        const choque = [...sillas, ...camareros].find((o) => Math.hypot(o.x - yo.x, o.y - yo.y) < o.r + yo.r);
        if (choque) {
          vidas--;
          golpes++;
          invulnerable = 1.4;
          audio.hit();
          haptics.error(1);
          ctx.shake(10);
          particles.burst(yo.x, yo.y, 14, { speed: 170, color: '#ff4757', size: 4 });
          // Retrocede hacia donde venía: castigo sin teletransporte injusto.
          const ang = Math.atan2(yo.y - choque.y, yo.x - choque.x);
          yo.x = clamp(yo.x + Math.cos(ang) * 42, yo.r, MUNDO_W - yo.r);
          yo.y = clamp(yo.y + Math.sin(ang) * 42, yo.r, MUNDO_H - yo.r);
          ui.toast(vidas > 0 ? `¡Ay! Quedan ${vidas}` : 'Se acabó la paciencia del camarero', { ms: 1100, color: '#ff4757' });
        }
      }

      sb.update(senales, vidas);
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s · ${vidas} tropiezos de margen`);

      if (Math.hypot(yo.x - mesa.x, yo.y - mesa.y) < mesa.r) return terminar(true);
      if (vidas <= 0 || tiempo <= 0) return terminar(false);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0710');

      const media = (W - 6) / 2;
      const alto = H - 84;
      const y0 = 74;

      vista(g, 0, y0, media, alto, (gg) => comedor(gg, { conNiebla: false }));
      vista(g, media + 6, y0, media, alto, (gg) => comedor(gg, { conNiebla: true }));

      // Separador
      g.fillStyle = '#ffffff22';
      g.fillRect(media, y0, 6, alto);

      // Etiquetas de cada mitad
      ctx.engine.text(`${players[0].name} · lo ve todo`, media / 2, y0 - 12, { size: 11, color: players[0].color });
      ctx.engine.text(`${players[1].name} · a ciegas`, media + 6 + media / 2, y0 - 12, { size: 11, color: players[1].color });

      // La señal, dibujada GRANDE sobre la mitad de P2.
      if (senal) {
        const cx = media + 6 + media / 2, cy = y0 + alto / 2;
        g.save();
        g.globalAlpha = clamp(senal.vida, 0, 1);
        g.translate(cx, cy);
        g.fillStyle = players[0].color;
        g.shadowColor = players[0].color;
        g.shadowBlur = 30;
        if (senal.dir === 'alto') {
          g.beginPath(); g.arc(0, 0, 54, 0, TAU); g.fill();
          g.fillStyle = '#000';
          g.fillRect(-30, -9, 60, 18);
        } else {
          const rot = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[senal.dir];
          g.rotate(rot);
          g.beginPath();
          g.moveTo(64, 0); g.lineTo(4, -42); g.lineTo(4, -16);
          g.lineTo(-60, -16); g.lineTo(-60, 16); g.lineTo(4, 16); g.lineTo(4, 42);
          g.closePath(); g.fill();
        }
        g.restore();
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(llego) {
    terminado = true;
    const usado = DURACION - Math.max(0, tiempo);
    let veredicto;
    if (llego && golpes === 0) veredicto = 'Hasta la mesa sin rozar una silla. Telepatía.';
    else if (llego) veredicto = `Llegaron, con ${golpes} tropiezo${golpes === 1 ? '' : 's'} de propina.`;
    else if (vidas <= 0) veredicto = 'Demasiadas bandejas por el suelo.';
    else veredicto = 'La mesa se dio por perdida y la dieron a otros.';
    if (llego) { audio.win(); haptics.victory(1); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [senales, golpes],
      detail: `${llego ? usado.toFixed(1) + ' s' : 'sin llegar'} · ${senales} señales · ${veredicto}`,
      record: llego ? ctx.record('tiempo', Math.round(usado * 10) / 10, 'low') : false,
    });
  }
}
