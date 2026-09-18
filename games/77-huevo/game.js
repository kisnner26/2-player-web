/**
 * El Huevo en la Cuchara — el huevo no está pegado: se balancea.
 *
 * El que corre lleva un péndulo en la mano. Acelerar mete energía al balanceo y
 * frenar también, así que la única manera de avanzar rápido es dar tirones
 * cortos en fase con el vaivén. Si la amplitud pasa del borde de la cuchara, al
 * suelo.
 *
 * El relevo es lo que lo hace de dos: en la zona de cambio los dos tienen que
 * pulsar dentro de la misma ventana, y el huevo pasa con el balanceo que
 * llevaba. Un relevo hecho a lo loco tira el huevo del siguiente.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const TRAMO = 300;             // metros por relevista
const RELEVOS = 4;             // tramos totales
const HUEVOS = 3;
const LIMITE = 0.62;           // amplitud (rad) que aguanta la cuchara
const VENTANA = 0.4;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let corredor = 0, tramo = 1;
  let avance = 0, vel = 0;
  let ang = 0, angVel = 0;
  let huevos = HUEVOS, tiempo = 0;
  let listo = [0, 0], reloj = 0;
  let sb = null, terminado = false, aviso = 0, enCambio = false;

  function reiniciar() {
    corredor = 0; tramo = 1;
    avance = 0; vel = 0;
    ang = 0.06; angVel = 0;
    huevos = HUEVOS; tiempo = 0;
    listo = [0, 0]; reloj = 0;
    aviso = 0; enCambio = false;
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Corre con tus direcciones · en la zona de cambio, pulsen los dos a la vez');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo += dt;
      reloj += dt;
      aviso = Math.max(0, aviso - dt);

      const corre = input.player(corredor);

      // Acelerar y frenar. La aceleración es lo que mueve el péndulo.
      const acelera = (corre.held('right') ? 1 : 0) - (corre.held('left') ? 1 : 0);
      const antes = vel;
      vel = clamp(vel + acelera * 190 * dt - 42 * dt, 0, 190);
      const cambioVel = (vel - antes) / Math.max(dt, 1e-4);

      // Péndulo: la mano tira del huevo con la aceleración de la carrera.
      angVel += (-9.4 * Math.sin(ang) - cambioVel * 0.012 - 1.1 * angVel) * dt;
      ang += angVel * dt;

      avance += vel * dt * 0.1;

      const restante = tramo * TRAMO - avance;
      enCambio = tramo < RELEVOS && restante < 26;

      if (enCambio) {
        for (let i = 0; i < 2; i++) if (input.player(i).pressed('a')) { listo[i] = reloj; audio.blip(); }
        for (let i = 0; i < 2; i++) if (listo[i] && reloj - listo[i] > VENTANA) listo[i] = 0;
        if (listo[0] && listo[1] && Math.abs(listo[0] - listo[1]) <= VENTANA) relevo();
      } else {
        listo = [0, 0];
      }

      if (Math.abs(ang) > LIMITE) return caer();

      if (avance >= tramo * TRAMO) {
        if (tramo >= RELEVOS) return terminar(true);
        // Pasó la zona sin relevar: penalización de ritmo, no de huevo.
        vel *= 0.35;
        angVel += 0.25;
        aviso = 1.4;
        if (!enCambio) ui.toast('¡Se pasó la zona de cambio!', { ms: 1000, color: '#ffd166' });
        tramo++;
        corredor = 1 - corredor;
      }

      sb.update(huevos, Math.round(avance));
      sb.setCenter(`Tramo ${tramo}/${RELEVOS} · ${Math.round(avance)} m · ${huevos} huevos`);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#131a12');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a4a5a');
      grd.addColorStop(0.5, '#3a5a3a');
      grd.addColorStop(1, '#1a2a1a');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      const pistaY = H * 0.72;
      g.fillStyle = '#b2603c';
      g.fillRect(0, pistaY, W, H - pistaY);
      g.save();
      g.strokeStyle = '#ffffff44';
      g.lineWidth = 2;
      const paso = 60;
      const off = (avance * 4) % paso;
      for (let x = -off; x < W + paso; x += paso) {
        g.beginPath(); g.moveTo(x, pistaY + 10); g.lineTo(x, H); g.stroke();
      }
      g.restore();

      // Zona de cambio
      if (enCambio) {
        g.save();
        g.globalAlpha = 0.35 + Math.sin(reloj * 8) * 0.2;
        g.fillStyle = '#ffd166';
        g.fillRect(0, pistaY, W, H - pistaY);
        g.restore();
        ctx.engine.text('ZONA DE CAMBIO · pulsen los dos', W / 2, pistaY - 24, {
          size: 13, color: '#ffd166', glow: 10,
        });
      }

      const cx = W * 0.42;

      // El relevista que espera, al fondo
      ctx.engine.glowCircle(W * 0.72, pistaY - 26, 16, players[1 - corredor].color, enCambio ? 20 : 5);

      // El que corre
      g.save();
      g.translate(cx, pistaY - 30);
      const paso2 = Math.sin(tiempo * (4 + vel * 0.06)) * (vel > 4 ? 6 : 0);
      g.translate(0, paso2 * 0.4);
      ctx.engine.glowCircle(0, 0, 20, players[corredor].color, 16);
      // Brazo, cuchara y huevo: el péndulo dibujado tal cual se simula.
      const bx = 26, by = -14;
      const L = 34;
      g.strokeStyle = '#e8dcc0';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, -6); g.lineTo(bx, by); g.stroke();
      const hx = bx + Math.sin(ang) * L, hy = by + Math.cos(ang) * L;
      g.strokeStyle = '#c8c8d0';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(hx, hy); g.stroke();
      g.save();
      g.translate(hx, hy);
      g.rotate(ang);
      g.fillStyle = '#c8c8d0';
      g.beginPath(); g.ellipse(0, 4, 13, 7, 0, 0, TAU); g.fill();
      g.fillStyle = '#f6efdc';
      g.beginPath(); g.ellipse(0, -4, 9, 12, 0, 0, TAU); g.fill();
      g.restore();
      g.restore();

      particles.render(g);

      // Amplitud del balanceo: el dato de vida o muerte.
      const k = clamp(ang / LIMITE, -1, 1);
      const bw = 220;
      g.fillStyle = '#ffffff14';
      g.fillRect(W / 2 - bw / 2, 48, bw, 12);
      g.fillStyle = Math.abs(k) > 0.75 ? '#ff4757' : '#a8ff3e';
      g.fillRect(W / 2, 48, k * (bw / 2), 12);
      g.fillStyle = '#fff';
      g.fillRect(W / 2 - 1, 42, 2, 24);
      ctx.engine.text('balanceo', W / 2, 74, { size: 10, color: '#ffffff88' });

      // Progreso del relevo
      g.fillStyle = '#ffffff14';
      g.fillRect(W * 0.1, H - 26, W * 0.8, 8);
      g.fillStyle = players[corredor].color;
      g.fillRect(W * 0.1, H - 26, W * 0.8 * clamp(avance / (RELEVOS * TRAMO), 0, 1), 8);
      for (let k2 = 1; k2 < RELEVOS; k2++) {
        g.fillStyle = '#ffffff55';
        g.fillRect(W * 0.1 + W * 0.8 * (k2 / RELEVOS), H - 30, 2, 16);
      }

      if (aviso > 0) ctx.engine.text('¡relevo perdido!', W / 2, H * 0.86, { size: 12, color: '#ffd166' });
      for (let i = 0; i < 2; i++) {
        if (!listo[i]) continue;
        ctx.engine.glowCircle(i === 0 ? W / 2 - 40 : W / 2 + 40, H * 0.9, 10, players[i].color, 18);
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function relevo() {
    tramo++;
    corredor = 1 - corredor;
    listo = [0, 0];
    // El huevo pasa con la mitad del balanceo: un buen relevo lo calma.
    angVel *= 0.5;
    vel *= 0.8;
    audio.arp([520, 700, 880], 0.05);
    haptics.play('score');
    ui.toast(`¡Relevo! Corre ${players[corredor].name}`, { ms: 1100, color: '#a8ff3e' });
  }

  function caer() {
    huevos--;
    audio.hit();
    haptics.error(corredor);
    ctx.shake(10);
    particles.burst(W * 0.46, H * 0.68, 18, { speed: 190, color: '#f6efdc', size: 4, gravity: 500 });
    ang = 0; angVel = 0; vel = 0;
    if (huevos <= 0) { terminar(false); return; }
    ui.toast(`¡Huevo al suelo! Quedan ${huevos}`, { ms: 1200, color: '#ff4757' });
    // Se retrocede al inicio del tramo en curso: se repite, no se pierde todo.
    avance = (tramo - 1) * TRAMO;
  }

  function terminar(llego) {
    terminado = true;
    let veredicto;
    if (llego && huevos === HUEVOS) veredicto = 'Cuatro tramos y el mismo huevo. Impecable.';
    else if (llego) veredicto = `Llegaron con ${huevos} huevo${huevos === 1 ? '' : 's'} de los ${HUEVOS}.`;
    else veredicto = `Tres huevos gastados en el metro ${Math.round(avance)}.`;
    if (llego) { audio.win(); haptics.victory(corredor); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [huevos, Math.round(avance)],
      detail: `${llego ? tiempo.toFixed(1) + ' s' : Math.round(avance) + ' m'} · ${veredicto}`,
      record: llego ? ctx.record('tiempo', Math.round(tiempo * 10) / 10, 'low') : false,
    });
  }
}
