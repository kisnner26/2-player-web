/**
 * Nuestro Bicho — cuidar a la misma criatura entre los dos, a la vez.
 *
 * La idea es la de las mascotas virtuales de móvil (hambre, higiene, sueño,
 * ánimo), pero convertida en algo que solo funciona a dos: las necesidades
 * aparecen más rápido de lo que una sola persona puede atender, y cada objeto
 * está en un rincón distinto de la habitación. Si os solapáis cogiendo lo
 * mismo, perdéis tiempo; si os repartís, aguantáis.
 *
 * No hay ganador. O la mantenéis viva o se os muere a los dos, que es lo que
 * hace que se grite mucho.
 *
 * El bicho recuerda: el mimo acumulado y la mejor racha se guardan entre
 * partidas, así que volver tiene sentido.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { loadMascota, saveMascota } from '../../core/storage.js';

export const meta = { render: 'canvas' };

/* Las cuatro necesidades. `baja` es cuánto cae por segundo al principio. */
const NECESIDADES = [
  { clave: 'hambre', nombre: 'Hambre', obj: 'Comida', col: '#ff7847', baja: 3.4, glifo: '🍎' },
  { clave: 'higiene', nombre: 'Higiene', obj: 'Jabón', col: '#00e5ff', baja: 2.6, glifo: '🧼' },
  { clave: 'energia', nombre: 'Energía', obj: 'Cama', col: '#b04cff', baja: 2.2, glifo: '💤' },
  { clave: 'animo', nombre: 'Ánimo', obj: 'Pelota', col: '#a8ff3e', baja: 3.0, glifo: '⚽' },
];

const VEL = 300;
const RADIO_AGARRE = 46;
const SUBIDA = 46;             // cuánto recupera una necesidad al atenderla

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let tiempo = 0;
  let dificultad = 1;
  let terminado = false;
  let atendidas = 0;
  let mimo = 0;
  let aviso = '';
  let avisoT = 0;
  let sacudida = 0;

  const barras = {};
  for (const n of NECESIDADES) barras[n.clave] = 78 + ctx.rng() * 14;

  /* Las cuatro estaciones, una en cada esquina: obliga a repartirse. */
  const estaciones = NECESIDADES.map((n, i) => ({ ...n, x: 0, y: 0, i }));

  /* Un cursor por jugador: la mano con la que cogen y sueltan. */
  const manos = [0, 1].map((i) => ({
    i, x: 0, y: 0, lleva: null, guiño: 0,
  }));

  const bicho = { x: 0, y: 0, animo: 0, parpadeo: 0, salto: 0 };

  function colocar() {
    bicho.x = W / 2;
    bicho.y = H * 0.52;
    const mx = Math.min(W * 0.16, 150), my = Math.min(H * 0.2, 130);
    const puntos = [[mx, my + H * 0.12], [W - mx, my + H * 0.12], [mx, H - my], [W - mx, H - my]];
    estaciones.forEach((e, k) => { e.x = puntos[k][0]; e.y = puntos[k][1]; });
    manos.forEach((m, k) => {
      if (!m.x) { m.x = W * (k === 0 ? 0.36 : 0.64); m.y = H * 0.7; }
    });
  }

  const decir = (t) => { aviso = t; avisoT = 2; };

  /** La necesidad más urgente, para señalarla en el bicho. */
  function masUrgente() {
    let peor = null;
    for (const n of NECESIDADES) {
      if (!peor || barras[n.clave] < barras[peor.clave]) peor = n;
    }
    return peor;
  }

  function atender(mano, necesidad) {
    const antes = barras[necesidad.clave];
    barras[necesidad.clave] = clamp(antes + SUBIDA, 0, 100);
    atendidas++;
    mimo += antes < 30 ? 3 : 1;      // salvarlo en el último momento vale más
    mano.lleva = null;
    bicho.salto = 0.5;
    bicho.animo = 1;

    audio.tone({ freq: 420 + (100 - antes) * 3, dur: 0.12, gain: 0.16, type: 'triangle', sweep: 160 });
    haptics.play('score', { player: mano.i });
    ctx.mando?.vibrar?.(mano.i, 'punto');
    particles.burst(bicho.x, bicho.y - 20, 16, {
      speed: 190, dir: -Math.PI / 2, spread: Math.PI * 1.6,
      color: necesidad.col, size: 3, drag: 0.9,
    });
    decir(antes < 25 ? `¡Por los pelos! ${necesidad.nombre}` : `${necesidad.nombre} al día`);
  }

  return {
    init() {
      colocar();
      const guardado = loadMascota();
      mimo = 0;
      decir(guardado?.mimo ? `Os echaba de menos · mimo ${guardado.mimo}` : '¡Cuidadlo entre los dos!');
    },
    resize(w, h) { W = w; H = h; colocar(); },

    update(dt) {
      if (terminado) return;
      tiempo += dt;
      avisoT = Math.max(0, avisoT - dt);
      sacudida = Math.max(0, sacudida - dt * 6);
      bicho.salto = Math.max(0, bicho.salto - dt * 2);
      bicho.animo = Math.max(0, bicho.animo - dt * 0.5);
      bicho.parpadeo = (bicho.parpadeo + dt) % 4;

      // La dificultad sube sola: es lo que convierte «fácil» en «tenso».
      dificultad = 1 + tiempo / 42;

      for (const n of NECESIDADES) {
        barras[n.clave] = clamp(barras[n.clave] - n.baja * dificultad * dt, 0, 100);
        if (barras[n.clave] <= 0) {
          terminado = true;
          audio.explosion();
          haptics.explosion(0);
          ctx.shake(9, 12);
          const previo = loadMascota() || {};
          saveMascota({
            ...previo,
            mimo: (previo.mimo || 0) + mimo,
            mejorRacha: Math.max(previo.mejorRacha || 0, Math.floor(tiempo)),
          });
          ctx.record('cuidados', Math.floor(tiempo), 'max');
          ctx.finish({
            winner: -1,
            titulo: `El bicho aguantó ${Math.floor(tiempo)} s`,
            detalle: `${atendidas} cuidados · le falló ${n.nombre.toLowerCase()}`,
          });
          return;
        }
      }

      /* Manos: mover, coger y soltar. */
      for (const m of manos) {
        const p = input.player(m.i);
        m.x = clamp(m.x + p.x * VEL * dt, 14, W - 14);
        m.y = clamp(m.y + p.y * VEL * dt, H * 0.14, H - 14);
        m.guiño = Math.max(0, m.guiño - dt * 3);

        if (!p.pressed('a')) continue;

        if (m.lleva) {
          // Soltar sobre el bicho lo aplica; soltarlo en otro sitio lo tira.
          if (Math.hypot(m.x - bicho.x, m.y - bicho.y) < RADIO_AGARRE + 18) {
            atender(m, m.lleva);
          } else {
            m.lleva = null;
            audio.back();
          }
          continue;
        }
        // Coger de la estación más cercana.
        const cerca = estaciones.find((e) => Math.hypot(m.x - e.x, m.y - e.y) < RADIO_AGARRE);
        if (cerca) {
          m.lleva = cerca;
          m.guiño = 1;
          audio.pickup();
          haptics.play('click', { player: m.i });
          ctx.mando?.vibrar?.(m.i, 'tecla');
        }
      }
    },

    render() {
      const g = ctx.c;
      const sx = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;

      /* Habitación */
      g.fillStyle = '#171029';
      g.fillRect(0, 0, W, H);
      const luz = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.5, Math.max(W, H) * 0.6);
      luz.addColorStop(0, '#ff6ec71c');
      luz.addColorStop(1, '#00000000');
      g.fillStyle = luz;
      g.fillRect(0, 0, W, H);
      // Suelo
      g.fillStyle = '#22183a';
      g.fillRect(0, H * 0.78, W, H * 0.22);

      g.save();
      g.translate(sx, 0);

      /* Estaciones */
      for (const e of estaciones) {
        const activa = barras[e.clave] < 45;
        g.save();
        if (activa) {
          g.shadowColor = e.col;
          g.shadowBlur = 18 + Math.sin(tiempo * 6) * 8;
        }
        g.fillStyle = e.col + (activa ? '44' : '1e');
        g.beginPath();
        g.arc(e.x, e.y, 34, 0, TAU);
        g.fill();
        g.strokeStyle = e.col;
        g.lineWidth = activa ? 3 : 1.5;
        g.stroke();
        g.restore();
        ctx.engine.text(e.glifo, e.x, e.y + 9, { size: 24, color: '#ffffff' });
        ctx.engine.text(e.obj, e.x, e.y + 50, { size: 11, color: e.col, font: 'system-ui' });
      }

      /* El bicho */
      const y = bicho.y - bicho.salto * 26;
      const r = 46 + bicho.animo * 5;
      const urgente = masUrgente();
      const malestar = clamp(1 - barras[urgente.clave] / 45, 0, 1);

      g.save();
      g.shadowColor = urgente.col;
      g.shadowBlur = 20 + malestar * 26;
      g.fillStyle = malestar > 0.55 ? '#c94f7c' : '#ff8fd0';
      g.beginPath();
      g.ellipse(bicho.x, y, r, r * 0.92, 0, 0, TAU);
      g.fill();
      g.restore();

      // Orejas
      for (const lado of [-1, 1]) {
        g.fillStyle = malestar > 0.55 ? '#c94f7c' : '#ff8fd0';
        g.beginPath();
        g.moveTo(bicho.x + lado * r * 0.55, y - r * 0.6);
        g.lineTo(bicho.x + lado * r * 0.85, y - r * 1.25);
        g.lineTo(bicho.x + lado * r * 0.15, y - r * 0.9);
        g.closePath();
        g.fill();
      }
      // Ojos: se cierran al parpadear y se entristecen si algo va mal.
      const cerrado = bicho.parpadeo > 3.85;
      g.fillStyle = '#2a0f22';
      for (const lado of [-1, 1]) {
        if (cerrado) {
          g.fillRect(bicho.x + lado * r * 0.34 - 7, y - r * 0.1, 14, 3);
        } else {
          g.beginPath();
          g.arc(bicho.x + lado * r * 0.34, y - r * 0.12, 8, 0, TAU);
          g.fill();
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.arc(bicho.x + lado * r * 0.34 - 2.5, y - r * 0.18, 2.8, 0, TAU);
          g.fill();
          g.fillStyle = '#2a0f22';
        }
      }
      // Boca: sonríe o se curva hacia abajo según cómo esté.
      g.strokeStyle = '#2a0f22';
      g.lineWidth = 3.5;
      g.lineCap = 'round';
      g.beginPath();
      if (malestar > 0.5) g.arc(bicho.x, y + r * 0.5, r * 0.28, Math.PI + 0.4, -0.4);
      else g.arc(bicho.x, y + r * 0.16, r * 0.3, 0.3, Math.PI - 0.3);
      g.stroke();

      // Burbuja de lo que más necesita
      if (malestar > 0.35) {
        g.save();
        g.globalAlpha = 0.6 + Math.sin(tiempo * 7) * 0.4;
        g.fillStyle = urgente.col;
        g.beginPath();
        g.arc(bicho.x + r * 0.9, y - r * 0.9, 19, 0, TAU);
        g.fill();
        g.restore();
        ctx.engine.text(urgente.glifo, bicho.x + r * 0.9, y - r * 0.82, { size: 19, color: '#ffffff' });
      }

      particles.render(g);

      /* Manos de los jugadores */
      for (const m of manos) {
        const col = players[m.i].color;
        g.save();
        g.shadowColor = col;
        g.shadowBlur = 14;
        g.strokeStyle = col;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(m.x, m.y, 15 + m.guiño * 6, 0, TAU);
        g.stroke();
        g.beginPath();
        g.moveTo(m.x - 6, m.y); g.lineTo(m.x + 6, m.y);
        g.moveTo(m.x, m.y - 6); g.lineTo(m.x, m.y + 6);
        g.stroke();
        g.restore();
        if (m.lleva) {
          ctx.engine.text(m.lleva.glifo, m.x, m.y - 22, { size: 21, color: '#ffffff' });
        }
      }

      g.restore();

      /* Barras de necesidad, arriba y bien grandes: son el reloj del juego. */
      const anchoB = Math.min(W * 0.9, 760);
      const bx = W / 2 - anchoB / 2;
      const cw = anchoB / NECESIDADES.length;
      NECESIDADES.forEach((n, k) => {
        const v = barras[n.clave];
        const x = bx + k * cw;
        g.fillStyle = '#ffffff10';
        g.fillRect(x + 6, 34, cw - 12, 12);
        g.fillStyle = v < 25 ? '#ff4757' : n.col;
        g.fillRect(x + 6, 34, (cw - 12) * (v / 100), 12);
        if (v < 25) {
          g.save();
          g.globalAlpha = 0.4 + Math.sin(tiempo * 12) * 0.4;
          g.fillStyle = '#ff4757';
          g.fillRect(x + 6, 34, cw - 12, 12);
          g.restore();
        }
        ctx.engine.text(n.nombre, x + cw / 2, 28, { size: 11, color: v < 25 ? '#ff4757' : '#8f8fb0', font: 'system-ui' });
      });

      ctx.engine.text(`${Math.floor(tiempo)} s · ${atendidas} cuidados · mimo ${mimo}`, W / 2, H - 16,
        { size: 12, color: '#8f8fb0', font: 'system-ui' });

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, 66, { size: 14, color: '#ffd166', font: 'system-ui' });
      }
    },
  };
}
