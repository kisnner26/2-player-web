/**
 * Timón y Cañón — cooperativo de dos palancas analógicas.
 *
 * Por qué necesita mando: una palanca da dirección Y fuerza a la vez, en 360°.
 * Con teclado solo hay ocho direcciones y siempre a tope, así que pilotar una
 * nave con inercia mientras el otro barre el cielo con la torreta se vuelve
 * tosco. Aquí cada jugador tiene su propia palanca en su propia pantalla.
 *
 * Uno pilota, el otro apunta. Ninguno puede hacer las dos cosas, y la nave es
 * una sola: si el piloto se mete en un enjambre, el artillero paga.
 */

import { TAU, clamp, angleDiff } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const EMPUJE = 460;            // aceleración máxima con la palanca a tope
const ROCE = 0.86;             // frenado por segundo: la nave no derrapa eternamente
const VEL_BALA = 620;
const CADENCIA = 0.16;
const VIDA_MAX = 5;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  const nave = { x: 0, y: 0, vx: 0, vy: 0, r: 17, rumbo: -Math.PI / 2, torreta: -Math.PI / 2 };
  let balas = [];
  let enemigos = [];
  let vida = VIDA_MAX;
  let oleada = 0;
  let puntos = 0;
  let recarga = 0;
  let desdeOleada = 0;
  let aviso = '';
  let avisoT = 0;
  let tiempo = 0;
  let terminado = false;

  function centrar() {
    nave.x = W / 2;
    nave.y = H / 2;
  }

  function decir(t) { aviso = t; avisoT = 2.4; }

  /** Nueva tanda de enemigos, entrando desde fuera de la pantalla. */
  function lanzarOleada() {
    oleada++;
    const cuantos = 3 + oleada;
    const margen = Math.max(W, H) * 0.62;
    for (let i = 0; i < cuantos; i++) {
      const a = ctx.rng() * TAU;
      enemigos.push({
        x: W / 2 + Math.cos(a) * margen,
        y: H / 2 + Math.sin(a) * margen,
        vel: 42 + oleada * 6 + ctx.rng() * 26,
        r: 13 + ctx.rng() * 7,
        giro: ctx.rng() * TAU,
      });
    }
    decir(`Oleada ${oleada}`);
    audio.tone({ freq: 180, dur: 0.2, gain: 0.15, type: 'sawtooth', sweep: -60 });
  }

  function explotar(x, y, color, n = 18) {
    particles.burst(x, y, n, {
      speed: 220, dir: -Math.PI / 2, spread: TAU,
      color, size: 2.6, shape: 'spark', drag: 0.9,
    });
  }

  return {
    init() {
      centrar();
      lanzarOleada();
      // Cada jugador recibe SU botonera: el piloto no debe tener botón de
      // disparo ni el artillero uno de impulso, o acabarán pulsando el que no.
      ctx.mando.perfil(0, ctx.meta.mando[0]);
      ctx.mando.perfil(1, ctx.meta.mando[1]);
    },
    resize(w, h) {
      // La nave conserva su posición relativa: si no, al cambiar de tamaño
      // aparecería de golpe en otra parte del mapa.
      const fx = W ? nave.x / W : 0.5, fy = H ? nave.y / H : 0.5;
      W = w; H = h;
      nave.x = fx * W;
      nave.y = fy * H;
    },

    update(dt) {
      if (terminado) return;
      tiempo += dt;
      avisoT = Math.max(0, avisoT - dt);
      recarga = Math.max(0, recarga - dt);
      desdeOleada += dt;

      const piloto = input.player(0);
      const artillero = input.player(1);

      /* --- Pilotar: la palanca da dirección y fuerza --- */
      const px = piloto.ax, py = piloto.ay;
      const fuerza = Math.min(1, Math.hypot(px, py));
      if (fuerza > 0.08) {
        nave.rumbo = Math.atan2(py, px);
        const extra = piloto.held('a') ? 1.7 : 1;      // impulso
        nave.vx += Math.cos(nave.rumbo) * EMPUJE * fuerza * extra * dt;
        nave.vy += Math.sin(nave.rumbo) * EMPUJE * fuerza * extra * dt;
        if (piloto.pressed('a')) {
          audio.tone({ freq: 300, dur: 0.1, gain: 0.12, type: 'square', sweep: 220 });
          haptics.play('tap', { player: 0 });
        }
      }
      // Roce independiente del framerate: la nave conserva inercia pero no
      // deriva para siempre.
      const roce = Math.pow(ROCE, dt * 60);
      nave.vx *= roce;
      nave.vy *= roce;
      nave.x = clamp(nave.x + nave.vx * dt, nave.r, W - nave.r);
      nave.y = clamp(nave.y + nave.vy * dt, nave.r, H - nave.r);

      /* --- Apuntar: la otra palanca gira la torreta --- */
      const ax = artillero.ax, ay = artillero.ay;
      if (Math.hypot(ax, ay) > 0.15) {
        const objetivo = Math.atan2(ay, ax);
        // Se gira progresivamente hacia donde apunta la palanca: da peso a la
        // torreta y evita que un temblor del pulgar la haga saltar.
        nave.torreta += angleDiff(nave.torreta, objetivo) * Math.min(1, dt * 14);
      }
      if (artillero.held('a') && recarga <= 0) {
        recarga = CADENCIA;
        balas.push({
          x: nave.x + Math.cos(nave.torreta) * nave.r,
          y: nave.y + Math.sin(nave.torreta) * nave.r,
          vx: Math.cos(nave.torreta) * VEL_BALA,
          vy: Math.sin(nave.torreta) * VEL_BALA,
          vida: 1.4,
        });
        audio.tone({ freq: 620, dur: 0.05, gain: 0.1, type: 'square', sweep: -280 });
        haptics.play('tap', { player: 1 });
        ctx.mando.vibrar(1, 'toque');
      }

      /* --- Balas --- */
      for (const b of balas) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vida -= dt;
      }
      balas = balas.filter((b) => b.vida > 0 && b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20);

      /* --- Enemigos: van a por la nave --- */
      for (const e of enemigos) {
        const a = Math.atan2(nave.y - e.y, nave.x - e.x);
        e.x += Math.cos(a) * e.vel * dt;
        e.y += Math.sin(a) * e.vel * dt;
        e.giro += dt * 2;
      }

      /* --- Impactos --- */
      for (const e of enemigos) {
        for (const b of balas) {
          if (Math.hypot(b.x - e.x, b.y - e.y) > e.r) continue;
          e.muerto = true;
          b.vida = 0;
          puntos++;
          explotar(e.x, e.y, '#3effc8');
          audio.tone({ freq: 240, dur: 0.09, gain: 0.13, type: 'triangle', sweep: -120 });
          haptics.play('impact', { player: 1 });
          break;
        }
        if (e.muerto) continue;
        if (Math.hypot(nave.x - e.x, nave.y - e.y) < nave.r + e.r * 0.7) {
          e.muerto = true;
          vida--;
          explotar(nave.x, nave.y, '#ff4757', 26);
          audio.explosion();
          haptics.explosion(0);
          ctx.shake(7, 9);
          ctx.mando.vibrar(0, 'golpe');
          ctx.mando.vibrar(1, 'golpe');
          if (vida <= 0) {
            terminado = true;
            ctx.record('oleadas', oleada, 'max');
            // Cooperativo: no hay ganador, se comparte el resultado.
            ctx.finish({ winner: -1, titulo: `Aguantaron ${oleada} oleadas`, detalle: `${puntos} enemigos abatidos` });
            return;
          }
          decir(`¡Impacto! Quedan ${vida}`);
        }
      }
      enemigos = enemigos.filter((e) => !e.muerto);

      if (!enemigos.length && desdeOleada > 1.2) {
        desdeOleada = 0;
        lanzarOleada();
      }
    },

    render() {
      const g = ctx.c;
      g.fillStyle = '#04060f';
      g.fillRect(0, 0, W, H);

      // Estrellas quietas: dan sensación de espacio sin distraer.
      g.fillStyle = '#ffffff22';
      for (let i = 0; i < 60; i++) {
        const x = ((i * 7919) % 1000) / 1000 * W;
        const y = ((i * 104729) % 1000) / 1000 * H;
        g.fillRect(x, y, 1.5, 1.5);
      }

      // Enemigos
      for (const e of enemigos) {
        g.save();
        g.translate(e.x, e.y);
        g.rotate(e.giro);
        g.strokeStyle = '#ff4757';
        g.fillStyle = '#ff475733';
        g.lineWidth = 2;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const r = e.r * (k % 2 ? 0.7 : 1);
          k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        g.stroke();
        g.restore();
      }

      // Balas
      for (const b of balas) {
        g.save();
        g.shadowColor = '#3effc8';
        g.shadowBlur = 10;
        g.strokeStyle = '#3effc8';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
        g.stroke();
        g.restore();
      }

      particles.render(g);

      // Nave
      g.save();
      g.translate(nave.x, nave.y);
      g.save();
      g.rotate(nave.rumbo + Math.PI / 2);
      g.shadowColor = players[0].color;
      g.shadowBlur = 18;
      g.fillStyle = players[0].color;
      g.beginPath();
      g.moveTo(0, -nave.r);
      g.lineTo(nave.r * 0.8, nave.r * 0.75);
      g.lineTo(0, nave.r * 0.35);
      g.lineTo(-nave.r * 0.8, nave.r * 0.75);
      g.closePath();
      g.fill();
      // Llama del propulsor, solo si la palanca está empujando.
      if (Math.hypot(input.player(0).ax, input.player(0).ay) > 0.1) {
        g.fillStyle = `rgba(255,209,102,${0.5 + Math.sin(tiempo * 30) * 0.3})`;
        g.beginPath();
        g.moveTo(-4, nave.r * 0.7);
        g.lineTo(0, nave.r * (1.5 + Math.sin(tiempo * 40) * 0.3));
        g.lineTo(4, nave.r * 0.7);
        g.closePath();
        g.fill();
      }
      g.restore();

      // Torreta
      g.save();
      g.rotate(nave.torreta);
      g.shadowColor = players[1].color;
      g.shadowBlur = 14;
      g.fillStyle = players[1].color;
      g.fillRect(0, -3.5, nave.r * 1.5, 7);
      g.beginPath();
      g.arc(0, 0, 7, 0, TAU);
      g.fill();
      g.restore();
      g.restore();

      // Línea de puntería: dice al artillero dónde va a caer el disparo.
      g.save();
      g.setLineDash([5, 9]);
      g.strokeStyle = players[1].color + '55';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(nave.x, nave.y);
      g.lineTo(nave.x + Math.cos(nave.torreta) * Math.max(W, H), nave.y + Math.sin(nave.torreta) * Math.max(W, H));
      g.stroke();
      g.restore();

      /* --- HUD --- */
      ctx.engine.text(`Oleada ${oleada} · ${puntos} abatidos`, W / 2, 26, { size: 13, color: '#ffffff' });
      for (let i = 0; i < VIDA_MAX; i++) {
        g.fillStyle = i < vida ? '#ff4757' : '#ffffff1a';
        g.fillRect(W / 2 - VIDA_MAX * 9 + i * 18, 38, 13, 6);
      }
      // Quién hace qué, con su personaje al lado: en un cooperativo asimétrico
      // lo primero que se pregunta cada uno es "¿cuál soy yo?".
      dibujarPersonaje(g, personajeDe(players[0], 0), 26, 54, 34, { acento: players[0].color });
      ctx.engine.text('pilota', 26, 66, { size: 9.5, color: players[0].color });
      dibujarPersonaje(g, personajeDe(players[1], 1), W - 26, 54, 34, { acento: players[1].color });
      ctx.engine.text('dispara', W - 26, 66, { size: 9.5, color: players[1].color });

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, H - 34, { size: 15, color: '#ffd166', font: 'system-ui' });
      }
      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita dos mandos táctiles · Menú → Mandos',
          W / 2, H / 2, { size: 14, color: '#ffd166', font: 'system-ui' });
      }
    },
  };
}
