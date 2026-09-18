/**
 * Tándem — uno pedalea, el otro dirige, y la bici no perdona a ninguno.
 *
 * P1 pedalea alternando sus dos teclas (izquierda y derecha, como los pies) y
 * P2 lleva el manillar. Lo que ata a los dos es el equilibrio: por debajo de
 * cierta velocidad la bici se cae, y por encima el manillar responde tanto que
 * cualquier corrección se convierte en una eñe.
 *
 * Las cuestas son la conversación obligatoria: en subida hace falta cadencia
 * (P1) y trazada limpia (P2) a la vez, o no se llega arriba.
 */

import { clamp, damp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const META = 900;              // metros de ruta
const VEL_CAIDA = 42;          // por debajo de esto, se cae
const CAIDAS_MAX = 3;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const bici = { s: 0, x: 0, vel: 90, inclina: 0 };
  let ultimoPie = '', cadencia = 0, paladas = 0;
  let curvas = [], cuestas = [];
  let caidas = 0, tiempo = 0, aviso = 0;
  let sb = null, terminado = false, tumbada = 0;

  const ANCHO = () => Math.min(360, W * 0.5);

  function reiniciar() {
    bici.s = 0; bici.x = 0; bici.vel = 90; bici.inclina = 0;
    ultimoPie = ''; cadencia = 0; paladas = 0;
    curvas = [];
    for (let m = 80; m < META; m += 90 + rng() * 90) {
      curvas.push({ m, amp: (rng() * 2 - 1) * (ANCHO() * 0.55), largo: 70 + rng() * 60 });
    }
    cuestas = [];
    for (let m = 160; m < META; m += 210 + rng() * 160) {
      cuestas.push({ m, largo: 90 + rng() * 70, dureza: 0.5 + rng() * 0.7 });
    }
    caidas = 0; tiempo = 0; tumbada = 0;
    terminado = false;
  }

  /** Centro de la carretera en un punto de la ruta. */
  function centro(m) {
    let c = 0;
    for (const k of curvas) {
      const d = m - k.m;
      if (Math.abs(d) < k.largo) c += k.amp * Math.cos((d / k.largo) * Math.PI / 2);
    }
    return c;
  }

  /** Pendiente en un punto: 0 = llano, 1 = cuesta dura. */
  function pendiente(m) {
    let p = 0;
    for (const k of cuestas) {
      const d = m - k.m;
      if (Math.abs(d) < k.largo) p += k.dureza * Math.cos((d / k.largo) * Math.PI / 2);
    }
    return p;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner(`${players[0].name} pedalea alternando A y D · ${players[1].name} lleva el manillar`);
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo += dt;
      aviso = Math.max(0, aviso - dt);

      if (tumbada > 0) {
        // Levantarse cuesta un segundo y medio: la caída se nota.
        tumbada -= dt;
        if (tumbada <= 0) { bici.vel = 70; bici.x = centro(bici.s); bici.inclina = 0; }
        sb.setCenter('levantando la bici…');
        return;
      }

      const pedal = input.player(0);
      const manillar = input.player(1);

      let palada = false;
      if (pedal.pressed('left') && ultimoPie !== 'left') { ultimoPie = 'left'; palada = true; }
      if (pedal.pressed('right') && ultimoPie !== 'right') { ultimoPie = 'right'; palada = true; }
      if (palada) {
        paladas++;
        // Hay una cadencia óptima; pisar los dos pedales a la vez no cuenta.
        const err = Math.abs(cadencia - 0.19);
        const gana = err < 0.06 ? 26 : err < 0.13 ? 17 : 8;
        bici.vel += gana;
        cadencia = 0;
        audio.tone({ freq: 240 + bici.vel * 0.6, dur: 0.03, gain: 0.07, type: 'square' });
        haptics.play('tick', { player: 0 });
      }
      cadencia += dt;

      const cuesta = pendiente(bici.s);
      bici.vel -= (14 + cuesta * 52 + bici.vel * 0.11) * dt;
      bici.vel = clamp(bici.vel, 0, 260);

      // El manillar gira más cuanto más rápido se va: el clásico problema del
      // tándem, que a poca velocidad no responde y a mucha te tira.
      const respuesta = clamp(bici.vel / 130, 0.15, 2.1);
      bici.inclina = damp(bici.inclina, manillar.x * respuesta, 6, dt);
      bici.x += bici.inclina * 92 * dt * (bici.vel / 120);
      bici.s += bici.vel * dt * 0.1;

      const half = ANCHO() / 2;
      const fuera = Math.abs(bici.x - centro(bici.s)) > half;
      if (fuera) {
        bici.vel -= 90 * dt;
        if (rng() < dt * 6) particles.burst(W / 2 + (bici.x - centro(bici.s)) * 0.4, H * 0.72, 4, {
          speed: 120, color: '#8a6a3a', size: 3, gravity: 300,
        });
        aviso = 0.4;
      }

      if (bici.vel < VEL_CAIDA || Math.abs(bici.x - centro(bici.s)) > half * 1.8) return caerse();

      sb.update(Math.round(bici.s), caidas);
      sb.setCenter(`${Math.round(bici.s)} / ${META} m · ${Math.round(bici.vel)} km/h`);

      if (bici.s >= META) return terminar(true);
      if (caidas >= CAIDAS_MAX) return terminar(false);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#101c14');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a4a6a');
      grd.addColorStop(0.45, '#3c6a4a');
      grd.addColorStop(1, '#16241a');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      const half = ANCHO() / 2;
      const cx = W / 2;
      const horizonte = H * 0.34;

      // La carretera se dibuja en franjas hacia el horizonte, con la curva
      // que le toca a cada distancia: da la sensación de trazada real.
      for (let k = 0; k < 40; k++) {
        const t0 = k / 40, t1 = (k + 1) / 40;
        const m0 = bici.s + t0 * 60, m1 = bici.s + t1 * 60;
        const y0 = H * 0.9 - (H * 0.9 - horizonte) * t0;
        const y1 = H * 0.9 - (H * 0.9 - horizonte) * t1;
        const e0 = 1 - t0 * 0.82, e1 = 1 - t1 * 0.82;
        const c0 = (centro(m0) - bici.x) * e0, c1 = (centro(m1) - bici.x) * e1;
        g.fillStyle = k % 2 ? '#2e3238' : '#33383f';
        g.beginPath();
        g.moveTo(cx + c0 - half * e0, y0);
        g.lineTo(cx + c0 + half * e0, y0);
        g.lineTo(cx + c1 + half * e1, y1);
        g.lineTo(cx + c1 - half * e1, y1);
        g.closePath(); g.fill();
        if (k % 4 === 0) {
          g.fillStyle = '#ffffff44';
          g.fillRect(cx + c0 - 2 * e0, y1, 4 * e0, y0 - y1);
        }
      }

      // Cuesta: una flecha arriba cuando toca sufrir.
      const cuesta = pendiente(bici.s);
      if (cuesta > 0.15) {
        ctx.engine.text('▲ CUESTA', cx, horizonte + 22, { size: 13, color: '#ffd166', glow: 10 });
      }

      particles.render(g);

      // El tándem: dos ciclistas en línea, inclinados con el manillar.
      g.save();
      g.translate(cx, H * 0.78);
      g.rotate(bici.inclina * 0.16 + (tumbada > 0 ? 1.2 : 0));
      g.strokeStyle = '#d8d8e0';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(-34, 12); g.lineTo(34, 12); g.stroke();
      g.fillStyle = '#22262e';
      g.beginPath(); g.arc(-34, 22, 13, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(34, 22, 13, 0, Math.PI * 2); g.fill();
      ctx.engine.glowCircle(-16, -8, 13, players[0].color, 14);
      ctx.engine.glowCircle(18, -10, 13, players[1].color, 14);
      g.restore();

      // Cadencia y velocidad: un dato para cada uno.
      const bw = 150;
      g.fillStyle = '#ffffff14';
      g.fillRect(cx - bw - 10, H - 32, bw, 8);
      g.fillStyle = bici.vel < VEL_CAIDA * 1.4 ? '#ff4757' : players[0].color;
      g.fillRect(cx - bw - 10, H - 32, bw * clamp(bici.vel / 200, 0, 1), 8);
      g.fillStyle = '#ffffff14';
      g.fillRect(cx + 10, H - 32, bw, 8);
      g.fillStyle = players[1].color;
      g.fillRect(cx + 10 + bw / 2, H - 32, clamp(bici.inclina * bw * 0.5, -bw / 2, bw / 2), 8);

      if (bici.vel < VEL_CAIDA * 1.4) {
        ctx.engine.text('¡PEDALEA O NOS CAEMOS!', cx, H - 52, { size: 12, color: '#ff4757', glow: 10 });
      }
      if (aviso > 0) ctx.engine.text('¡grava!', cx, H * 0.6, { size: 13, color: '#ffd166' });
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function caerse() {
    caidas++;
    tumbada = 1.5;
    audio.explosion();
    haptics.explosion();
    ctx.shake(16);
    particles.burst(W / 2, H * 0.78, 22, { speed: 240, color: '#d8d8e0', size: 4, gravity: 420 });
    ui.toast(caidas >= CAIDAS_MAX ? 'Tres caídas: se vuelve andando' : `Caída ${caidas}/${CAIDAS_MAX}`, {
      ms: 1200, color: '#ff4757',
    });
    if (caidas >= CAIDAS_MAX) terminar(false);
  }

  function terminar(llego) {
    terminado = true;
    let veredicto;
    if (llego && caidas === 0) veredicto = 'Ruta entera sin poner un pie en el suelo.';
    else if (llego) veredicto = `Llegaron con ${caidas} caída${caidas === 1 ? '' : 's'} y algún reproche.`;
    else veredicto = `Se quedaron en el kilómetro ${(bici.s / 1000).toFixed(2)}.`;
    if (llego) { audio.win(); haptics.victory(0); } else { audio.lose(); haptics.defeat(); }
    ctx.finish({
      winner: -1,
      scores: [paladas, caidas],
      detail: `${Math.round(bici.s)} m en ${tiempo.toFixed(1)} s · ${veredicto}`,
      record: llego ? ctx.record('tiempo', Math.round(tiempo * 10) / 10, 'low') : ctx.record('metros', Math.round(bici.s), 'high'),
    });
  }
}
