/**
 * Torre de Bloques — apilar sin que se caiga.
 *
 * Un bloque va y viene por arriba; lo sueltas y cae. Lo que sobresale del
 * bloque de abajo se corta y se pierde, así que cada fallo hace la torre más
 * estrecha y el siguiente turno más difícil. Se turnan, y el que tire la
 * torre pierde.
 *
 * Se entiende en un segundo: un botón, timing puro. La tensión la pone que
 * la plataforma se encoge sola con tus propios errores.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const ANCHO_INI = 190;
const ALTO = 26;
const MIN_ANCHO = 14;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let pila = [];                 // {x, w, por}
  let movil = null;              // bloque que se mueve arriba
  let cascotes = [];             // trozos cortados cayendo
  let turno = 0;
  let vel = 168;
  let camY = 0;                  // desplazamiento de cámara al subir
  let estado = 'jugando';        // jugando | fin
  let pausa = 0;
  let aviso = '', avisoT = 0;
  const colocados = [0, 0];
  let perfectos = 0;

  const baseY = () => H - 90;
  const alturaPila = () => pila.length;

  function reset() {
    const w = Math.min(ANCHO_INI, W * 0.42);
    pila = [{ x: W / 2 - w / 2, w, por: -1 }];
    cascotes = [];
    turno = 0; vel = 168; camY = 0; perfectos = 0;
    colocados[0] = colocados[1] = 0;
    estado = 'jugando';
    nuevoMovil();
  }

  function nuevoMovil() {
    const ult = pila[pila.length - 1];
    movil = {
      x: turno === 0 ? 20 : W - 20 - ult.w,
      w: ult.w,
      dir: turno === 0 ? 1 : -1,
    };
  }

  const decir = (t) => { aviso = t; avisoT = 1.8; };

  function soltar() {
    if (estado !== 'jugando' || !movil) return;
    const ult = pila[pila.length - 1];
    const izq = Math.max(movil.x, ult.x);
    const der = Math.min(movil.x + movil.w, ult.x + ult.w);
    const solape = der - izq;

    const yBloque = baseY() - alturaPila() * ALTO;

    if (solape <= 0) {
      // Fallo total: la torre se viene abajo.
      estado = 'fin';
      pausa = 1.8;
      cascotes.push({ x: movil.x, w: movil.w, y: yBloque, vy: 0, vx: movil.dir * 40, rot: 0 });
      audio.explosion();
      haptics.explosion(turno);
      ctx.shake(9, 11);
      decir(`${players[turno].name} falló la torre`);
      return;
    }

    // Trozos que sobresalen: se cortan y caen.
    if (movil.x < izq) {
      cascotes.push({ x: movil.x, w: izq - movil.x, y: yBloque, vy: 0, vx: -70, rot: 0 });
    }
    if (movil.x + movil.w > der) {
      cascotes.push({ x: der, w: movil.x + movil.w - der, y: yBloque, vy: 0, vx: 70, rot: 0 });
    }

    const exacto = Math.abs(solape - ult.w) < 3;
    if (exacto) {
      perfectos++;
      audio.arp([523, 659, 784], 0.07);
      haptics.play('victory', { player: turno });
      decir('¡Clavado!');
      particles.burst(izq + solape / 2, yBloque, 16, {
        speed: 150, dir: -Math.PI / 2, spread: Math.PI * 2, color: '#ffd166', size: 2.6, drag: 0.91,
      });
    } else {
      audio.tone({ freq: 240, dur: 0.09, gain: 0.13, type: 'square' });
      haptics.play('impact', { player: turno });
    }

    pila.push({ x: izq, w: solape, por: turno });
    colocados[turno]++;

    if (solape < MIN_ANCHO) {
      estado = 'fin';
      pausa = 1.6;
      audio.lose();
      decir('La torre quedó demasiado fina');
      return;
    }

    vel = Math.min(430, vel * 1.045);
    turno = 1 - turno;
    // La cámara sube para que la cima quede siempre visible.
    camY = Math.max(0, alturaPila() * ALTO - H * 0.5);
    nuevoMovil();
  }

  return {
    init() { reset(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;

      // Cascotes cayendo (solo decorativos)
      for (let i = cascotes.length - 1; i >= 0; i--) {
        const c = cascotes[i];
        c.vy += 1400 * dt;
        c.y += c.vy * dt;
        c.x += c.vx * dt;
        c.rot += dt * 3 * Math.sign(c.vx || 1);
        if (c.y > H + 200) cascotes.splice(i, 1);
      }

      if (estado === 'fin') {
        pausa -= dt;
        particles.update(dt);
        if (pausa <= 0) {
          const alt = alturaPila() - 1;
          const perdedor = turno;
          ctx.finish({
            winner: 1 - perdedor,
            scores: [colocados[0], colocados[1]],
            detail: `Torre de ${alt} bloques · ${perfectos} clavados`,
            record: ctx.record('altura', alt, 'high'),
          });
        }
        return;
      }

      if (movil) {
        movil.x += movil.dir * vel * dt;
        if (movil.x <= 8) { movil.x = 8; movil.dir = 1; }
        if (movil.x + movil.w >= W - 8) { movil.x = W - 8 - movil.w; movil.dir = -1; }
      }

      // Solo el jugador de turno puede soltar
      if (input.player(turno).pressed('a')) soltar();
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0a14');

      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1a1630'); grd.addColorStop(1, '#0b0a14');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);

      g.save();
      g.translate(0, camY);

      // Pila
      pila.forEach((b, k) => {
        const y = baseY() - k * ALTO;
        if (y + camY < -ALTO || y + camY > H + ALTO) return;
        const col = b.por < 0 ? '#5a5a72' : players[b.por].color;
        g.save();
        g.shadowColor = col; g.shadowBlur = 10;
        g.fillStyle = col;
        if (g.roundRect) { g.beginPath(); g.roundRect(b.x, y - ALTO, b.w, ALTO - 2, 4); g.fill(); }
        else g.fillRect(b.x, y - ALTO, b.w, ALTO - 2);
        g.restore();
        g.fillStyle = '#ffffff22';
        g.fillRect(b.x, y - ALTO, b.w, 3);
      });

      // Bloque móvil
      if (movil && estado === 'jugando') {
        const y = baseY() - alturaPila() * ALTO;
        const col = players[turno].color;
        g.save();
        g.shadowColor = col; g.shadowBlur = 18;
        g.fillStyle = col;
        if (g.roundRect) { g.beginPath(); g.roundRect(movil.x, y - ALTO, movil.w, ALTO - 2, 4); g.fill(); }
        else g.fillRect(movil.x, y - ALTO, movil.w, ALTO - 2);
        g.restore();
        // Guía vertical para ver la alineación
        const ult = pila[pila.length - 1];
        g.strokeStyle = '#ffffff33'; g.lineWidth = 1;
        g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(ult.x, y - ALTO); g.lineTo(ult.x, y + 40); g.stroke();
        g.beginPath(); g.moveTo(ult.x + ult.w, y - ALTO); g.lineTo(ult.x + ult.w, y + 40); g.stroke();
        g.setLineDash([]);
      }

      // Cascotes
      for (const c of cascotes) {
        g.save();
        g.translate(c.x + c.w / 2, c.y - ALTO / 2);
        g.rotate(c.rot);
        g.fillStyle = '#6a6a86';
        g.fillRect(-c.w / 2, -ALTO / 2, c.w, ALTO - 2);
        g.restore();
      }

      g.restore();
      particles.render(g);

      // HUD
      ctx.engine.text(`Altura ${alturaPila() - 1}`, W / 2, 28, { size: 17, color: '#ffffff' });
      if (perfectos > 0) {
        ctx.engine.text(`${perfectos} clavados`, W / 2, 48, { size: 11, color: '#ffd166', font: 'system-ui' });
      }
      for (let i = 0; i < 2; i++) {
        ctx.engine.text(`${players[i].name} · ${colocados[i]}`, i === 0 ? 16 : W - 16, 26, {
          size: 12, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }
      if (estado === 'jugando') {
        ctx.engine.text(`Turno de ${players[turno].name}`, W / 2, H - 34, {
          size: 13, color: players[turno].color, font: 'system-ui',
        });
      }
      if (avisoT > 0) ctx.engine.text(aviso, W / 2, H - 56, { size: 13, color: '#ffd166', font: 'system-ui' });
      ctx.engine.text('Suelta el bloque con tu tecla de acción · lo que sobresale se pierde',
        W / 2, H - 12, { size: 10.5, color: '#ffffff55', font: 'system-ui' });
    },

    destroy() {},
  };
}
