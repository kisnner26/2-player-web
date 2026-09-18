/**
 * Central Nuclear — dos paneles, un reactor y ninguna manera de llegar solo.
 *
 * Las alarmas salen en el panel de uno pero se apagan con la palanca del otro:
 * el que ve el aviso NUNCA es el que puede resolverlo. Todo el juego es leer en
 * voz alta lo que te sale y confiar en que el otro esté escuchando.
 *
 * El reactor sube de temperatura solo, y cada alarma sin atender lo acelera.
 * No se gana apagando alarmas: se gana aguantando el turno entero sin que
 * llegue al rojo.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const TURNO = 120;             // segundos que hay que aguantar
const CALOR_MAX = 100;

/** Cada alarma nace en un panel y se resuelve en el contrario. */
const TIPOS = [
  { id: 'refrig', nombre: 'REFRIGERANTE BAJO', accion: 'left', glifo: '◀', color: '#3aa0ff' },
  { id: 'presion', nombre: 'PRESIÓN ALTA', accion: 'up', glifo: '▲', color: '#ffd166' },
  { id: 'barras', nombre: 'BARRAS FUERA', accion: 'right', glifo: '▶', color: '#a8ff3e' },
  { id: 'turbina', nombre: 'TURBINA TRABADA', accion: 'down', glifo: '▼', color: '#ff8c42' },
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let calor = 22, reloj = TURNO, t = 0, terminado = false;
  let alarmas = [], siguiente = 2.5, resueltas = 0, fallidas = 0;
  let sb = null, destello = 0;

  function nuevaAlarma() {
    const tipo = TIPOS[Math.floor(rng() * TIPOS.length)];
    // `panel` es quien la VE; `resuelve` es quien tiene la palanca.
    const panel = Math.floor(rng() * 2);
    alarmas.push({
      tipo, panel, resuelve: 1 - panel,
      vida: clamp(7.5 - resueltas * 0.15, 3.4, 7.5),
      max: clamp(7.5 - resueltas * 0.15, 3.4, 7.5),
    });
    audio.tone({ freq: 700, dur: 0.16, gain: 0.16, type: 'square' });
    haptics.play('tick', { player: panel });
  }

  function acabar(exito, motivo) {
    if (terminado) return;
    terminado = true;
    if (exito) { audio.win(); haptics.victory(null); } else { audio.explosion(); haptics.explosion(null); ctx.shake(24); }
    ctx.finish({
      winner: -1,
      scores: [resueltas, fallidas],
      detail: motivo,
      record: exito ? ctx.record('alarmas', resueltas, 'high') : false,
    });
  }

  const panelX = (i) => W * (i === 0 ? 0.25 : 0.75);

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: `aguantad ${TURNO} s` });
      ui.toast('La alarma sale en un panel y se apaga en el otro', { ms: 2800 });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      destello = Math.max(0, destello - dt);
      particles.update(dt);
      reloj -= dt;

      siguiente -= dt;
      if (siguiente <= 0 && alarmas.length < 4) {
        nuevaAlarma();
        siguiente = clamp(4.2 - resueltas * 0.09, 1.5, 4.2) * (0.7 + rng() * 0.6);
      }

      for (let i = alarmas.length - 1; i >= 0; i--) {
        const a = alarmas[i];
        a.vida -= dt;
        if (a.vida <= 0) {
          alarmas.splice(i, 1);
          fallidas++;
          calor += 11;
          destello = 0.5;
          audio.error();
          haptics.error(null);
          ctx.shake(8);
        }
      }

      for (const j of [0, 1]) {
        const pl = input.player(j);
        for (const tipo of TIPOS) {
          if (!pl.pressed(tipo.accion)) continue;
          const k = alarmas.findIndex((a) => a.resuelve === j && a.tipo.id === tipo.id);
          if (k >= 0) {
            alarmas.splice(k, 1);
            resueltas++;
            calor = Math.max(10, calor - 6);
            audio.pickup();
            haptics.score(j);
            particles.burst(panelX(j), H * 0.5, 14, { speed: 180, color: tipo.color, size: 4, drag: 0.9 });
            sb.update(resueltas, fallidas);
          } else {
            // Tocar la palanca que no toca calienta: no vale barrer todas.
            calor += 2.5;
            audio.tone({ freq: 170, dur: 0.07, gain: 0.1, type: 'square' });
            haptics.error(j);
          }
        }
      }

      // El reactor sube solo, y más cuanto más tiempo llevéis.
      calor += (0.9 + alarmas.length * 0.75 + (TURNO - reloj) * 0.008) * dt;
      calor = clamp(calor, 0, CALOR_MAX + 1);

      if (calor >= CALOR_MAX) { acabar(false, `Fusión del núcleo con ${Math.round(reloj)} s por delante`); return; }
      if (reloj <= 0) { acabar(true, `¡Turno completado! ${resueltas} alarmas atendidas y ${fallidas} fallidas`); }
    },

    render() {
      const g = ctx.c;
      const rojo = calor > 75;
      ctx.engine.clear(rojo ? '#180810' : '#0a0d12');

      if (destello > 0) {
        g.fillStyle = `rgba(255,71,87,${destello * 0.3})`;
        g.fillRect(0, 0, W, H);
      }

      // Núcleo central
      const cx = W / 2, cy = H * 0.42;
      const r = Math.min(W, H) * 0.13;
      const inten = clamp(calor / CALOR_MAX, 0, 1);
      const halo = g.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
      halo.addColorStop(0, `rgba(255,${Math.round(200 - inten * 160)},60,${0.2 + inten * 0.5})`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);
      ctx.engine.glowCircle(cx, cy, r * (1 + Math.sin(t * (2 + inten * 10)) * 0.04),
        inten > 0.75 ? '#ff4757' : inten > 0.5 ? '#ff8c42' : '#3effc8', 30 + inten * 40);
      g.fillStyle = '#0a0a12';
      g.beginPath(); g.arc(cx, cy, r * 0.55, 0, Math.PI * 2); g.fill();
      ctx.engine.text(`${Math.round(calor)}°`, cx, cy, { size: r * 0.42, color: '#f2f2ff' });

      // Termómetro
      const bw = W * 0.4;
      g.fillStyle = '#1a1a26';
      g.fillRect(cx - bw / 2, H * 0.63, bw, 16);
      g.fillStyle = inten > 0.75 ? '#ff4757' : inten > 0.5 ? '#ffd166' : '#3effc8';
      g.fillRect(cx - bw / 2, H * 0.63, bw * inten, 16);
      g.strokeStyle = '#ff475788';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - bw / 2 + bw * 0.75, H * 0.63 - 5);
      g.lineTo(cx - bw / 2 + bw * 0.75, H * 0.63 + 21);
      g.stroke();

      // Paneles
      for (const j of [0, 1]) {
        const px = panelX(j);
        const col = players[j].color;
        g.fillStyle = '#12141e';
        g.beginPath(); g.roundRect(px - W * 0.21, H * 0.1, W * 0.42, H * 0.44, 12); g.fill();
        g.strokeStyle = `${col}55`;
        g.lineWidth = 2;
        g.stroke();
        ctx.engine.text(`PANEL DE ${players[j].name.toUpperCase()}`, px, H * 0.145,
          { size: 12, color: col, font: 'system-ui' });

        const mias = alarmas.filter((a) => a.panel === j);
        if (!mias.length) {
          ctx.engine.text('todo en orden', px, H * 0.3, { size: 14, color: '#3a4a58', font: 'system-ui' });
        }
        mias.forEach((a, k) => {
          const y = H * 0.2 + k * H * 0.085;
          const p = clamp(a.vida / a.max, 0, 1);
          g.save();
          g.globalAlpha = p < 0.35 ? 0.5 + Math.sin(t * 22) * 0.5 : 1;
          g.fillStyle = `${a.tipo.color}22`;
          g.beginPath(); g.roundRect(px - W * 0.18, y - 18, W * 0.36, 36, 8); g.fill();
          g.strokeStyle = a.tipo.color;
          g.lineWidth = 2;
          g.beginPath(); g.roundRect(px - W * 0.18, y - 18, W * 0.36, 36, 8); g.stroke();
          g.restore();
          ctx.engine.text(a.tipo.nombre, px - W * 0.04, y, {
            size: 13, color: a.tipo.color, align: 'right', font: 'system-ui',
          });
          // La instrucción para el OTRO, dicha en su idioma de teclas.
          ctx.engine.text(`→ ${players[a.resuelve].name}: ${a.tipo.glifo}`, px + W * 0.02, y, {
            size: 12, color: players[a.resuelve].color, align: 'left', font: 'system-ui',
          });
          g.fillStyle = '#00000066';
          g.fillRect(px - W * 0.18, y + 14, W * 0.36, 3);
          g.fillStyle = a.tipo.color;
          g.fillRect(px - W * 0.18, y + 14, W * 0.36 * p, 3);
        });
      }

      particles.render(g);
      ctx.engine.text(`${Math.ceil(Math.max(0, reloj))}s de turno · ${resueltas} atendidas · ${fallidas} fallidas`,
        W / 2, H * 0.72, { size: 13, color: '#8f9fb0', font: 'system-ui' });
      ctx.engine.text('Las cuatro palancas son tus direcciones · lee tu panel en voz alta',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
