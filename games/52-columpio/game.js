/**
 * El Columpio — bombear a dos manos hasta tocar la campana.
 *
 * Un columpio es un péndulo, y a un péndulo solo se le mete energía en el
 * momento justo: empujando cuando ya va en esa dirección. Aquí cada uno
 * cubre un lado —P1 empuja cuando el columpio viene hacia él, P2 cuando va
 * hacia el otro—, así que ninguno puede bombear solo: media oscilación es
 * suya y media del otro.
 *
 * Empujar a contratiempo FRENA. Es el error que hace que la primera partida
 * acabe con el columpio parado y los dos machacando teclas.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const LARGO = 0.42;            // largo de la cuerda, en fracción de la altura
const K = 6.8;                 // g/L ya adimensionalizado: periodo de ~2,4 s
const AMORTIGUA = 0.35;        // el aire y el roce de las cadenas
const EMPUJE = 1.05;           // radianes/s que añade un empujón perfecto
const CAMPANA = 1.15;          // ángulo (rad) al que está la campana
const DURACION = 60;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let ang = 0.12, vel = 0;
  let tiempo = DURACION;
  let maximo = 0, campanadas = 0, buenos = 0, fallos = 0;
  let sb = null, terminado = false, sonando = false;
  const brillo = [0, 0];        // destello del empujón de cada uno

  const pivote = () => ({ x: W / 2, y: H * 0.16 });
  const largo = () => H * LARGO;

  /**
   * Un empujón del jugador `i` es bueno si el columpio se mueve hacia SU lado.
   * P1 está a la izquierda: le toca cuando la velocidad angular es negativa.
   */
  function empujar(i) {
    const haciaP1 = vel < 0;
    const suyo = i === 0 ? haciaP1 : !haciaP1;
    const fuerza = Math.max(0.25, 1 - Math.abs(ang) / 1.4);   // desde abajo se bombea mejor
    brillo[i] = 1;
    if (suyo && Math.abs(vel) > 0.05) {
      vel += Math.sign(vel) * EMPUJE * fuerza;
      buenos++;
      audio.tone({ freq: 300 + Math.abs(vel) * 90, dur: 0.08, gain: 0.16, type: 'triangle', sweep: 140 });
      haptics.play('soft', { player: i });
      particles.burst(pivote().x + Math.sin(ang) * largo(), pivote().y + Math.cos(ang) * largo(), 6, {
        speed: 120, color: players[i].color, size: 3, shape: 'circle',
      });
    } else if (Math.abs(vel) < 0.05) {
      // Arrancar desde parado: cualquiera de los dos puede darle el primer envión.
      vel += (i === 0 ? -1 : 1) * 0.5;
      audio.blip();
    } else {
      vel *= 0.62;
      fallos++;
      audio.error();
      haptics.play('tap', { player: i });
    }
  }

  function reiniciar() {
    ang = 0.12; vel = 0;
    tiempo = DURACION;
    maximo = 0; campanadas = 0; buenos = 0; fallos = 0;
    terminado = false; sonando = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Empuja cuando el columpio venga <b>hacia ti</b> · a contratiempo frena');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }

      tiempo -= dt;
      brillo[0] = Math.max(0, brillo[0] - dt * 4);
      brillo[1] = Math.max(0, brillo[1] - dt * 4);

      for (let i = 0; i < 2; i++) if (input.player(i).pressed('a')) empujar(i);

      // Péndulo con amortiguación, sin la aproximación de ángulo pequeño: a 60°
      // el sin() de verdad se nota y el columpio "pesa" al llegar arriba.
      vel += (-K * Math.sin(ang) - AMORTIGUA * vel) * dt;
      ang += vel * dt;

      // Tope físico: la cadena no pasa de la horizontal.
      if (Math.abs(ang) > 1.55) { ang = Math.sign(ang) * 1.55; vel *= -0.3; }

      maximo = Math.max(maximo, Math.abs(ang));

      if (Math.abs(ang) >= CAMPANA && Math.sign(ang) === 1 && vel > 0) {
        // La campana está del lado de P2; suena una vez por pasada.
        if (!sonando) {
          sonando = true;
          campanadas++;
          audio.arp([880, 1320, 1760], 0.05);
          haptics.play('score');
          ctx.shake(5);
          ui.toast(`¡Campana! ×${campanadas}`, { ms: 700, color: '#ffd166' });
        }
      } else if (Math.abs(ang) < CAMPANA * 0.8) {
        sonando = false;
      }

      sb.update(buenos, fallos);
      sb.setCenter(`${Math.max(0, tiempo).toFixed(0)}s · ${Math.round(maximo * 57)}° · ${campanadas} campanadas`);
      if (tiempo <= 0) return terminar();

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#101a22');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#1d2e3c');
      grd.addColorStop(0.7, '#16232e');
      grd.addColorStop(1, '#0e161d');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      const p = pivote();
      const L = largo();

      // Suelo de parque
      g.fillStyle = '#2b3a24';
      g.fillRect(0, H * 0.84, W, H * 0.16);

      // Estructura del columpio
      g.strokeStyle = '#6b5a45';
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(p.x - L * 0.7, H * 0.86); g.lineTo(p.x, p.y);
      g.lineTo(p.x + L * 0.7, H * 0.86);
      g.stroke();

      // Campana, al lado de P2
      const cx = p.x + Math.sin(CAMPANA) * L, cy = p.y + Math.cos(CAMPANA) * L;
      g.save();
      g.globalAlpha = Math.abs(ang) >= CAMPANA ? 1 : 0.5;
      g.fillStyle = '#ffd166';
      g.beginPath();
      g.arc(cx, cy - 16, 13, Math.PI, TAU);
      g.lineTo(cx + 13, cy - 4); g.lineTo(cx - 13, cy - 4);
      g.closePath(); g.fill();
      g.restore();

      // Cadena y asiento
      const sx = p.x + Math.sin(ang) * L, sy = p.y + Math.cos(ang) * L;
      g.strokeStyle = '#9aa7b2';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(sx, sy); g.stroke();

      g.save();
      g.translate(sx, sy);
      g.rotate(-ang);
      g.fillStyle = '#7a5c3a';
      g.fillRect(-26, 0, 52, 9);
      // Los dos van sentados: el color de cada uno a un lado del asiento.
      g.fillStyle = players[0].color;
      g.beginPath(); g.arc(-13, -13, 11, 0, TAU); g.fill();
      g.fillStyle = players[1].color;
      g.beginPath(); g.arc(13, -13, 11, 0, TAU); g.fill();
      g.restore();

      particles.render(g);

      // A quién le toca ahora: la única ayuda que hace falta.
      const turno = vel < 0 ? 0 : 1;
      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? W * 0.14 : W * 0.86;
        const activo = turno === i && Math.abs(vel) > 0.05;
        g.save();
        g.globalAlpha = brillo[i] > 0 ? 1 : activo ? 0.85 : 0.22;
        ctx.engine.glowCircle(x, H * 0.5, 20 + brillo[i] * 10, players[i].color, activo ? 24 : 8);
        g.restore();
        if (activo) ctx.engine.text('¡AHORA!', x, H * 0.5 + 42, { size: 11, color: players[i].color });
      }

      // Marca del récord de la partida
      const my = p.y + Math.cos(maximo) * L;
      g.save();
      g.setLineDash([6, 6]);
      g.strokeStyle = '#ffffff22';
      g.beginPath(); g.moveTo(0, my); g.lineTo(W, my); g.stroke();
      g.restore();
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar() {
    terminado = true;
    const grados = Math.round(maximo * 57);
    let veredicto;
    if (campanadas >= 8) veredicto = 'Bombean como si llevaran años en ese parque.';
    else if (campanadas >= 3) veredicto = 'Le cogieron el ritmo a mitad de partida.';
    else if (grados > 50) veredicto = 'Alto, pero nunca a la vez. Casi.';
    else veredicto = 'Mucho empujón y poco compás.';
    if (campanadas > 0) { audio.win(); haptics.victory(1); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [buenos, fallos],
      detail: `${grados}° máximo · ${campanadas} campanadas · ${veredicto}`,
      record: ctx.record('campanadas', campanadas, 'high'),
    });
  }
}
