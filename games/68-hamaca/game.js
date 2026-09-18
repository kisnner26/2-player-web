/**
 * Hamaca — dos cuerpos en una tela, y un cocotero encima.
 *
 * La hamaca se inclina según el centro de masas de los dos, así que moverse a
 * por un coco desequilibra al otro sin que él haga nada. Los cocos, además,
 * PESAN: cada uno que atrapas suma a tu lado y hace que la siguiente carrera
 * sea más difícil.
 *
 * Se puede tirar un coco al agua (soltar peso) pulsando la tecla especial. Ese
 * es el botón que salva la partida y el que provoca todas las discusiones.
 */

import { clamp, TAU, damp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const DURACION = 75;
const LIMITE = 0.72;           // inclinación (rad) a partir de la cual vuelcan
const VEL = 1.35;              // posición normalizada por segundo

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [{ i: 0, p: -0.45, peso: 1 }, { i: 1, p: 0.45, peso: 1 }];
  let cocos = [], puntos = 0, atrapados = 0, tirados = 0;
  let inclina = 0, tiempo = DURACION, proximo = 1.5;
  let sb = null, terminado = false;

  const hamacaY = () => H * 0.56;
  const largo = () => Math.min(W * 0.72, 520);

  /** Punto de la hamaca para una posición normalizada (-1 a 1). */
  function punto(p) {
    const L = largo();
    const x = W / 2 + p * (L / 2);
    // La tela cuelga: parábola más honda en el centro, girada por la inclinación.
    const caida = (1 - p * p) * H * 0.09;
    return { x, y: hamacaY() + caida + p * Math.tan(inclina) * (L / 2) * 0.55 };
  }

  function reiniciar() {
    jug[0].p = -0.45; jug[0].peso = 1;
    jug[1].p = 0.45; jug[1].peso = 1;
    cocos = []; puntos = 0; atrapados = 0; tirados = 0;
    inclina = 0; tiempo = DURACION; proximo = 1.5;
    terminado = false;
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Atrapen cocos sin volcar · tu tecla especial tira un coco al agua');
    },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      tiempo -= dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        p.p = clamp(p.p + pl.x * VEL * dt, -0.92, 0.92);
        if (pl.pressed('b') && p.peso > 1) {
          p.peso = Math.max(1, p.peso - 0.9);
          tirados++;
          puntos = Math.max(0, puntos - 20);
          audio.swoosh();
          haptics.play('soft', { player: p.i });
          const q = punto(p.p);
          particles.burst(q.x, q.y, 10, { speed: 150, color: '#8a5a2a', size: 4, gravity: 500 });
          ui.toast(`${players[p.i].name} suelta lastre (−20)`, { ms: 900, color: '#ffd166' });
        }
      }

      // Momento respecto al centro: masa por brazo. La hamaca busca su reposo.
      const momento = jug[0].p * jug[0].peso + jug[1].p * jug[1].peso;
      inclina = damp(inclina, clamp(momento * 0.62, -1.2, 1.2), 3.4, dt);

      proximo -= dt;
      if (proximo <= 0) {
        proximo = 0.85 + rng() * 0.9;
        cocos.push({ x: W / 2 + (rng() * 2 - 1) * (largo() / 2), y: -20, v: 190 + rng() * 130 });
      }

      for (let i = cocos.length - 1; i >= 0; i--) {
        const c = cocos[i];
        c.v += 620 * dt;
        c.y += c.v * dt;
        let cogido = false;
        for (const p of jug) {
          const q = punto(p.p);
          if (Math.hypot(c.x - q.x, c.y - (q.y - 18)) < 30) {
            cogido = true;
            atrapados++;
            puntos += 30;
            p.peso += 0.32;
            audio.pickup();
            haptics.play('score', { player: p.i });
            particles.burst(c.x, c.y, 10, { speed: 130, color: '#a8ff3e', size: 4, shape: 'circle' });
            break;
          }
        }
        if (cogido || c.y > H + 30) cocos.splice(i, 1);
      }

      sb.update(Math.round(jug[0].peso * 10) / 10, Math.round(jug[1].peso * 10) / 10);
      sb.setCenter(`${puntos} pts · ${Math.max(0, tiempo).toFixed(0)}s`);

      if (Math.abs(inclina) > LIMITE) return terminar(false);
      if (tiempo <= 0) return terminar(true);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d1a1e');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#2a5a6a');
      grd.addColorStop(0.55, '#3f7a72');
      grd.addColorStop(1, '#134a4a');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      // Mar al fondo
      g.save();
      g.globalAlpha = 0.35;
      g.strokeStyle = '#bfeaea';
      g.lineWidth = 2;
      for (let k = 0; k < 5; k++) {
        const y = H * 0.78 + k * 14;
        g.beginPath();
        for (let x = 0; x <= W; x += 18) {
          g.lineTo(x, y + Math.sin(x * 0.03 + ctx.engine.time * 1.5 + k) * 4);
        }
        g.stroke();
      }
      g.restore();

      const L = largo();
      // Palmeras: los dos postes
      for (const s of [-1, 1]) {
        const x = W / 2 + s * (L / 2 + 24);
        g.strokeStyle = '#6b4a2a';
        g.lineWidth = 14;
        g.beginPath(); g.moveTo(x, H); g.lineTo(x - s * 12, hamacaY() - 70); g.stroke();
        g.fillStyle = '#2f7a3a';
        for (let k = -2; k <= 2; k++) {
          g.save();
          g.translate(x - s * 12, hamacaY() - 70);
          g.rotate(k * 0.42 + (s > 0 ? Math.PI : 0));
          g.beginPath();
          g.ellipse(38, 0, 40, 9, 0, 0, TAU);
          g.fill();
          g.restore();
        }
      }

      // La tela de la hamaca
      g.save();
      g.strokeStyle = '#e8dcc0';
      g.lineWidth = 5;
      g.beginPath();
      for (let p = -1; p <= 1.001; p += 0.05) {
        const q = punto(p);
        if (p === -1) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y);
      }
      g.stroke();
      g.strokeStyle = '#e8dcc055';
      g.lineWidth = 2;
      for (let p = -0.9; p <= 0.9; p += 0.12) {
        const q = punto(p);
        g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x, q.y - 12); g.stroke();
      }
      g.restore();

      // Cocos cayendo
      for (const c of cocos) {
        g.save();
        g.fillStyle = '#6b4426';
        g.beginPath(); g.arc(c.x, c.y, 13, 0, TAU); g.fill();
        g.fillStyle = '#8a5a34';
        g.beginPath(); g.arc(c.x - 4, c.y - 4, 5, 0, TAU); g.fill();
        g.restore();
      }

      particles.render(g);

      // Los dos, con su tamaño según el peso acumulado
      for (const p of jug) {
        const q = punto(p.p);
        ctx.engine.glowCircle(q.x, q.y - 18, 16 + (p.peso - 1) * 8, players[p.i].color, 16);
        if (p.peso > 1.6) ctx.engine.text('pesado', q.x, q.y - 44, { size: 9, color: '#ffd166' });
      }

      // Nivel de inclinación: la barra que hay que mirar.
      const k = clamp(inclina / LIMITE, -1, 1);
      g.fillStyle = '#ffffff18';
      g.fillRect(W / 2 - 110, 50, 220, 10);
      g.fillStyle = Math.abs(k) > 0.75 ? '#ff4757' : '#ffd166';
      g.fillRect(W / 2, 50, k * 110, 10);
      g.fillStyle = '#fff';
      g.fillRect(W / 2 - 1, 44, 2, 22);
      if (Math.abs(k) > 0.75) {
        ctx.engine.text('¡VOLCAMOS!', W / 2, 82, { size: 14, color: '#ff4757', glow: 12 });
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function terminar(aguantaron) {
    terminado = true;
    let veredicto;
    if (aguantaron && puntos >= 300) veredicto = 'Siesta productiva: cocos y equilibrio.';
    else if (aguantaron) veredicto = 'Aguantaron la hamaca, que ya es bastante.';
    else veredicto = `Al agua los dos, con ${Math.round(inclina * 57)}° de inclinación.`;
    if (aguantaron) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.defeat(); ctx.shake(18); }
    ctx.finish({
      winner: -1,
      scores: [atrapados, tirados],
      detail: `${puntos} pts · ${atrapados} cocos · ${veredicto}`,
      record: ctx.record('puntos', puntos, 'high'),
    });
  }
}
