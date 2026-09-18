/**
 * Café a Dos — una bandeja, dos manos y tres tazas que no perdonan.
 *
 * Cada uno sostiene SU extremo de la bandeja y solo puede subirlo o bajarlo.
 * La bandeja no tiene posición propia: es la recta que une las dos manos, así
 * que la inclinación es literalmente el desacuerdo entre los dos. Las tazas
 * resbalan cuesta abajo con la componente de la gravedad, igual que en la vida.
 *
 * El pasillo avanza solo y los baches empujan un extremo concreto (nunca los
 * dos), que es lo que fuerza a hablar: el que recibe el bache no puede
 * arreglarlo solo sin volcar las tazas hacia el otro.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const META = 100;              // metros de pasillo
const VEL_PASILLO = 9;         // metros por segundo
const TAZAS = 3;
const MANO_VEL = 190;          // px/s de subida y bajada de cada extremo
const RESBALON = 900;          // cuánto acelera la taza por unidad de pendiente

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const mano = [0, 0];          // altura en píxeles de cada extremo
  let tazas = [];
  let baches = [];
  let metros = 0, servidas = 0, caidas = 0;
  let sb = null, terminado = false, aviso = 0;

  const extremoX = () => [W * 0.24, W * 0.76];

  function reiniciar() {
    mano[0] = mano[1] = H * 0.62;
    tazas = [];
    for (let i = 0; i < TAZAS; i++) {
      tazas.push({ t: -0.5 + i * 0.5, v: 0, cafe: 1, viva: true });
    }
    baches = [];
    for (let m = 12; m < META; m += 6 + rng() * 7) {
      baches.push({ m, lado: rng() < 0.5 ? 0 : 1, fuerza: 120 + rng() * 150, hecho: false });
    }
    metros = 0; servidas = 0; caidas = 0;
    terminado = false;
  }

  /** Pendiente de la bandeja: positiva = cae hacia la derecha. */
  function pendiente() {
    const [ax, bx] = extremoX();
    return (mano[0] - mano[1]) / (bx - ax);
  }

  /** Posición en pantalla de una taza según su sitio en la bandeja (t de -1 a 1). */
  function puntoTaza(t) {
    const [ax, bx] = extremoX();
    const k = (t + 1) / 2;
    return { x: ax + (bx - ax) * k, y: mano[0] + (mano[1] - mano[0]) * k };
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '0 m' });
      sb.update(TAZAS, 0);
      ui.banner('Cada uno sube y baja <b>su</b> lado · las tazas resbalan cuesta abajo');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }

      metros += VEL_PASILLO * dt;
      aviso = Math.max(0, aviso - dt);

      for (let i = 0; i < 2; i++) {
        const pl = input.player(i);
        mano[i] = clamp(mano[i] + pl.y * MANO_VEL * dt, H * 0.34, H * 0.8);
      }

      // Baches: un empujón seco a un solo extremo.
      for (const b of baches) {
        if (b.hecho || metros < b.m) continue;
        b.hecho = true;
        mano[b.lado] = clamp(mano[b.lado] - b.fuerza * 0.35, H * 0.3, H * 0.84);
        for (const t of tazas) if (t.viva) t.v += (b.lado === 0 ? 1 : -1) * 0.7;
        audio.thud();
        haptics.impact(b.lado, 0.7);
        ctx.shake(6);
        aviso = 1;
      }

      const p = pendiente();
      for (const t of tazas) {
        if (!t.viva) continue;
        // Aceleración cuesta abajo + rozamiento del fieltro de la bandeja.
        t.v += p * RESBALON * dt * 0.01;
        t.v *= Math.pow(0.55, dt);
        t.t += t.v * dt;

        // El café se derrama antes de que la taza caiga: es el aviso justo.
        if (Math.abs(p) > 0.28 || Math.abs(t.v) > 1.6) {
          t.cafe = Math.max(0, t.cafe - dt * 0.5);
          if (rng() < dt * 6) {
            const q = puntoTaza(t.t);
            particles.spawn({
              x: q.x, y: q.y - 12, vx: t.v * 20, vy: 40, life: 0.5, maxLife: 0.5,
              size: 3, color: '#6b4326', gravity: 420, shape: 'circle',
            });
          }
        }

        if (Math.abs(t.t) > 1) {
          t.viva = false;
          caidas++;
          const q = puntoTaza(clamp(t.t, -1, 1));
          particles.burst(q.x, q.y, 18, { speed: 240, color: '#e8dcc8', size: 4, gravity: 700 });
          audio.hit();
          haptics.error();
          ctx.shake(12);
          ui.toast('¡Se cayó una taza!', { ms: 1100, color: '#ff4757' });
        }
      }

      servidas = tazas.filter((t) => t.viva).length;
      sb.update(servidas, Math.round(metros));
      sb.setCenter(`${Math.round(metros)} / ${META} m`);

      if (!servidas) return terminar(false);
      if (metros >= META) return terminar(true);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#1a1410');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2b2118');
      grd.addColorStop(1, '#140e0a');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Pasillo: baldosas que corren para dar sensación de avance.
      g.save();
      g.strokeStyle = '#ffffff10';
      g.lineWidth = 1;
      const paso = 90;
      const off = (metros * 26) % paso;
      for (let x = -off; x < W + paso; x += paso) {
        g.beginPath(); g.moveTo(x, H * 0.86); g.lineTo(x + 40, H); g.stroke();
      }
      g.strokeStyle = '#ffffff18';
      g.beginPath(); g.moveTo(0, H * 0.86); g.lineTo(W, H * 0.86); g.stroke();
      g.restore();

      // Barra de progreso del pasillo
      g.fillStyle = '#ffffff14';
      g.fillRect(W * 0.1, H * 0.94, W * 0.8, 6);
      g.fillStyle = '#c9a227';
      g.fillRect(W * 0.1, H * 0.94, W * 0.8 * (metros / META), 6);

      const [ax, bx] = extremoX();

      // Bandeja
      g.save();
      g.lineCap = 'round';
      g.strokeStyle = '#8a6a3a';
      g.lineWidth = 12;
      g.beginPath(); g.moveTo(ax, mano[0]); g.lineTo(bx, mano[1]); g.stroke();
      g.strokeStyle = '#c9a05a';
      g.lineWidth = 5;
      g.beginPath(); g.moveTo(ax, mano[0] - 4); g.lineTo(bx, mano[1] - 4); g.stroke();
      g.restore();

      // Manos
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? ax : bx;
        ctx.engine.glowCircle(x, mano[i] + 14, 15, players[i].color, 16);
      }

      // Tazas
      for (const t of tazas) {
        if (!t.viva) continue;
        const q = puntoTaza(t.t);
        const ang = Math.atan2(mano[1] - mano[0], bx - ax);
        g.save();
        g.translate(q.x, q.y - 8);
        g.rotate(ang);
        g.fillStyle = '#f2ece0';
        g.beginPath();
        g.moveTo(-13, -18); g.lineTo(13, -18); g.lineTo(9, 0); g.lineTo(-9, 0);
        g.closePath(); g.fill();
        if (t.cafe > 0.02) {
          g.fillStyle = '#5b3a20';
          const alto = 14 * t.cafe;
          g.fillRect(-12 + (1 - t.cafe) * 1.5, -17, 24 - (1 - t.cafe) * 3, alto);
        }
        g.strokeStyle = '#d8cdbb';
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(15, -10, 6, -1.2, 1.2); g.stroke();
        g.restore();
      }

      particles.render(g);

      // Nivel de inclinación: la información que de verdad necesitan.
      const p = pendiente();
      const peligro = Math.abs(p) > 0.24;
      g.save();
      g.globalAlpha = peligro ? 0.95 : 0.45;
      g.fillStyle = peligro ? '#ff4757' : '#ffd166';
      const anchoBarra = clamp(p * 420, -150, 150);
      g.fillRect(W / 2, 46, anchoBarra, 8);
      g.globalAlpha = 0.3;
      g.fillStyle = '#fff';
      g.fillRect(W / 2 - 1, 40, 2, 20);
      g.restore();
      if (aviso > 0) {
        ctx.engine.text('¡BACHE!', W / 2, 78, { size: 16, color: '#ff4757', glow: 12 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(llego) {
    terminado = true;
    const vivas = tazas.filter((t) => t.viva).length;
    const cafe = tazas.reduce((s, t) => s + (t.viva ? t.cafe : 0), 0);
    let veredicto;
    if (llego && vivas === TAZAS && cafe > 2.4) veredicto = 'Servicio impecable. Contratados los dos.';
    else if (llego && vivas === TAZAS) veredicto = 'Llegaron las tres, medio vacías, pero llegaron.';
    else if (llego) veredicto = `Llegaron ${vivas} de ${TAZAS}. El suelo se quedó el resto.`;
    else veredicto = 'Ni una taza sobrevivió al pasillo.';
    if (llego) { audio.win(); haptics.victory(0); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [vivas, caidas],
      detail: `${Math.round(metros)} m · ${veredicto}`,
      record: ctx.record('metros', Math.round(metros), 'high'),
    });
  }
}
