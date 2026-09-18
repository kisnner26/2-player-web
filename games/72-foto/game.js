/**
 * Foto de Pareja — el temporizador ya está corriendo, corran a su marca.
 *
 * Cada foto pone dos marcas en el suelo y una cuenta atrás. Hay que llegar y
 * QUEDARSE QUIETO: el último segundo antes del disparo mide el movimiento, y
 * moverse ahí sale borroso aunque estés en el sitio.
 *
 * Entre medias cruzan gaviotas y olas que empujan. La foto perfecta necesita
 * los dos en marca y los dos quietos, así que siempre hay uno esperando al
 * otro y aguantando la respiración.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const FOTOS = 5;
const CUENTA = 7;              // segundos de temporizador
const VEL = 250;
const RADIO_MARCA = 34;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  const jug = [{ i: 0, x: 0, y: 0, quieto: 0 }, { i: 1, x: 0, y: 0, quieto: 0 }];
  let marcas = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  let olas = [], gaviotas = [];
  let foto = 1, cuenta = CUENTA, album = [];
  let sb = null, terminado = false, flash = 0, ultima = '';

  const sueloY = () => H * 0.58;

  function nuevasMarcas() {
    for (let i = 0; i < 2; i++) {
      marcas[i] = {
        x: W * (0.16 + rng() * 0.68),
        y: sueloY() + rng() * (H * 0.3),
      };
    }
    // Que no salgan pegadas: si no, la foto se hace sin coordinarse.
    if (Math.hypot(marcas[0].x - marcas[1].x, marcas[0].y - marcas[1].y) < 120) {
      marcas[1].x = clamp(marcas[0].x + (marcas[0].x < W / 2 ? 190 : -190), 60, W - 60);
    }
    cuenta = CUENTA;
  }

  function reiniciar() {
    jug[0].x = W * 0.3; jug[0].y = H * 0.8;
    jug[1].x = W * 0.7; jug[1].y = H * 0.8;
    jug[0].quieto = jug[1].quieto = 0;
    olas = []; gaviotas = [];
    foto = 1; album = [];
    flash = 0; ultima = '';
    nuevasMarcas();
    terminado = false;
  }

  const enMarca = (p) => Math.hypot(p.x - marcas[p.i].x, p.y - marcas[p.i].y) < RADIO_MARCA;

  return {
    init() {
      W = ctx.W; H = ctx.H;
      reiniciar();
      sb = ui.scoreboard({ center: '' });
      ui.banner('Corran a su marca y <b>quédense quietos</b> antes del disparo');
    },
    resize(nw, nh) { W = nw; H = nh; reiniciar(); },

    update(dt) {
      if (terminado) { particles.update(dt); return; }
      flash = Math.max(0, flash - dt * 2);
      cuenta -= dt;

      for (const p of jug) {
        const pl = input.player(p.i);
        const dx = pl.x, dy = pl.y;
        const movio = dx !== 0 || dy !== 0;
        const len = Math.hypot(dx, dy) || 1;
        p.x = clamp(p.x + (dx / len) * VEL * dt, 22, W - 22);
        p.y = clamp(p.y + (dy / len) * VEL * dt, sueloY(), H - 22);
        p.quieto = movio ? 0 : p.quieto + dt;
      }

      // Olas: empujan hacia arriba a quien pise la orilla.
      if (rng() < dt * 0.6) olas.push({ y: sueloY() - 10, alcance: 30 + rng() * 70, vida: 2.4 });
      for (let i = olas.length - 1; i >= 0; i--) {
        const o = olas[i];
        o.vida -= dt;
        if (o.vida <= 0) { olas.splice(i, 1); continue; }
        for (const p of jug) {
          if (p.y < sueloY() + o.alcance) {
            p.y += 120 * dt;
            p.quieto = 0;
          }
        }
      }

      // Gaviotas: cruzan y si te dan, te mueven.
      if (rng() < dt * 0.5) {
        gaviotas.push({ x: rng() < 0.5 ? -30 : W + 30, y: H * (0.62 + rng() * 0.3), v: 0 });
        const g0 = gaviotas[gaviotas.length - 1];
        g0.v = (g0.x < 0 ? 1 : -1) * (150 + rng() * 130);
      }
      for (let i = gaviotas.length - 1; i >= 0; i--) {
        const gv = gaviotas[i];
        gv.x += gv.v * dt;
        if (gv.x < -60 || gv.x > W + 60) { gaviotas.splice(i, 1); continue; }
        for (const p of jug) {
          if (Math.hypot(p.x - gv.x, p.y - gv.y) < 26) {
            p.x += Math.sign(gv.v) * 130 * dt;
            p.quieto = 0;
            if (rng() < dt * 5) audio.blip();
          }
        }
      }

      if (cuenta <= 0) disparar();

      sb.update(album.filter((a) => a === 'perfecta').length, album.filter((a) => a !== 'perfecta').length);
      sb.setCenter(`Foto ${Math.min(foto, FOTOS)}/${FOTOS} · ${Math.max(0, cuenta).toFixed(1)}s`);

      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0f1a24');
      const grd = g.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, '#f2a25c');
      grd.addColorStop(0.35, '#c96f6f');
      grd.addColorStop(0.58, '#3f6f8f');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, sueloY());

      // Sol de atardecer
      g.save();
      g.shadowColor = '#ffd166'; g.shadowBlur = 60;
      g.fillStyle = '#ffe0a0';
      g.beginPath(); g.arc(W * 0.5, sueloY() - 40, 36, 0, TAU); g.fill();
      g.restore();

      // Arena
      const ag = g.createLinearGradient(0, sueloY(), 0, H);
      ag.addColorStop(0, '#d8b878');
      ag.addColorStop(1, '#b89858');
      g.fillStyle = ag;
      g.fillRect(0, sueloY(), W, H - sueloY());

      // Espuma de las olas
      for (const o of olas) {
        g.save();
        g.globalAlpha = clamp(o.vida / 2.4, 0, 1) * 0.6;
        g.fillStyle = '#eaf6ff';
        g.beginPath();
        g.ellipse(W / 2, sueloY() + o.alcance * 0.3, W * 0.6, o.alcance * 0.5, 0, 0, TAU);
        g.fill();
        g.restore();
      }

      // Marcas
      for (let i = 0; i < 2; i++) {
        const m = marcas[i];
        const dentro = enMarca(jug[i]);
        g.save();
        g.strokeStyle = players[i].color;
        g.globalAlpha = dentro ? 1 : 0.55;
        g.lineWidth = 4;
        g.setLineDash([8, 6]);
        g.beginPath(); g.arc(m.x, m.y, RADIO_MARCA, 0, TAU); g.stroke();
        g.setLineDash([]);
        g.beginPath();
        g.moveTo(m.x - 12, m.y - 12); g.lineTo(m.x + 12, m.y + 12);
        g.moveTo(m.x + 12, m.y - 12); g.lineTo(m.x - 12, m.y + 12);
        g.stroke();
        g.restore();
      }

      // Gaviotas
      for (const gv of gaviotas) {
        g.save();
        g.strokeStyle = '#f0f0f0';
        g.lineWidth = 3;
        const f = Math.sin(ctx.engine.time * 12) * 8;
        g.beginPath();
        g.moveTo(gv.x - 14, gv.y + f); g.lineTo(gv.x, gv.y - 4); g.lineTo(gv.x + 14, gv.y + f);
        g.stroke();
        g.restore();
      }

      particles.render(g);

      // Los dos
      for (const p of jug) {
        const listo = enMarca(p) && p.quieto > 0.35;
        ctx.engine.glowCircle(p.x, p.y, 19, players[p.i].color, listo ? 22 : 8);
        if (cuenta < 1.2 && !listo) {
          ctx.engine.text(enMarca(p) ? '¡quieto!' : '¡a tu marca!', p.x, p.y - 34, {
            size: 10, color: '#ff4757',
          });
        }
      }

      // Cámara con el temporizador
      const cw = 120;
      g.fillStyle = '#1a1a22';
      g.fillRect(W / 2 - cw / 2, 42, cw, 40);
      g.fillStyle = cuenta < 1.2 ? '#ff4757' : '#a8ff3e';
      g.fillRect(W / 2 - cw / 2 + 6, 48, (cw - 12) * clamp(cuenta / CUENTA, 0, 1), 10);
      ctx.engine.text(cuenta > 0 ? cuenta.toFixed(1) : '¡CLIC!', W / 2, 70, {
        size: 13, color: cuenta < 1.2 ? '#ff4757' : '#fff',
      });

      // Álbum: cómo salió cada foto
      for (let i = 0; i < album.length; i++) {
        const x = 24 + i * 30;
        g.fillStyle = album[i] === 'perfecta' ? '#a8ff3e' : album[i] === 'borrosa' ? '#ffd166' : '#ff4757';
        g.fillRect(x, H - 34, 22, 22);
      }
      if (ultima) ctx.engine.text(ultima, W / 2, H - 22, { size: 11, color: '#ffffffaa' });

      if (flash > 0) {
        g.save();
        g.globalAlpha = flash;
        g.fillStyle = '#fff';
        g.fillRect(0, 0, W, H);
        g.restore();
      }
    },

    destroy() { sb?.remove(); ui.hideBanner(); },
  };

  function disparar() {
    flash = 1;
    audio.tone({ freq: 1200, dur: 0.05, gain: 0.2, type: 'square' });
    audio.noise({ dur: 0.12, gain: 0.2, filter: 3000, sweep: -2000 });
    haptics.play('impact');

    const enSitio = jug.every(enMarca);
    const quietos = jug.every((p) => p.quieto > 0.35);
    const resultado = enSitio && quietos ? 'perfecta' : enSitio ? 'borrosa' : 'sin salir';
    album.push(resultado);
    ultima = resultado === 'perfecta' ? '¡Perfecta!' : resultado === 'borrosa' ? 'Borrosa: alguien se movió' : 'Alguien no llegó a su marca';
    if (resultado === 'perfecta') {
      haptics.play('score');
      particles.burst(W / 2, H * 0.4, 20, { speed: 200, color: '#a8ff3e', size: 4 });
    } else {
      haptics.play('tap');
    }

    if (foto >= FOTOS) return terminar();
    foto++;
    nuevasMarcas();
  }

  function terminar() {
    terminado = true;
    const buenas = album.filter((a) => a === 'perfecta').length;
    let veredicto;
    if (buenas === FOTOS) veredicto = 'Álbum entero de portada.';
    else if (buenas >= 3) veredicto = 'Hay tres para el marco y dos para reír.';
    else if (buenas >= 1) veredicto = 'Una salió. Suficiente para el perfil.';
    else veredicto = 'Cinco fotos, cero caras. Un logro.';
    if (buenas >= 3) { audio.win(); haptics.play('score'); } else { audio.lose(); haptics.play('soft'); }
    ctx.finish({
      winner: -1,
      scores: [buenas, FOTOS - buenas],
      detail: `${buenas} de ${FOTOS} perfectas · ${veredicto}`,
      record: ctx.record('perfectas', buenas, 'high'),
    });
  }
}
