/**
 * Invernadero — sembrar, regar y cosechar antes de que caiga la helada.
 *
 * Las tareas están repartidas de forma que ninguno puede hacer la ronda
 * completa: uno siembra y cosecha, el otro riega y espanta las plagas. Una
 * planta cosechada sin regar no vale nada, y una regada que nadie cosecha se
 * pasa y se pierde igual.
 *
 * La helada avisa con un contador y llega para los dos. Lo que quede en la
 * tierra cuando llegue no cuenta, así que la última media vuelta siempre es
 * una discusión sobre qué se abandona.
 */

import { clamp, TAU } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 5;
const FILAS = 3;
const TIEMPO = 105;
const CRECE = 0.16;            // madurez por segundo con agua
const SED = 0.09;
const META = 22;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let bancal = [], cursor = [0, 0], reloj = TIEMPO, cosechadas = 0, perdidas = 0;
  let t = 0, terminado = false, sb = null, aviso = '', avisoT = 0;

  const k = (x, y) => y * COLS + x;

  function nueva() {
    bancal = Array.from({ length: COLS * FILAS }, () => ({
      estado: 'vacia',        // vacia | brote | madura | pasada
      madurez: 0,
      agua: 0,
      plaga: 0,
    }));
  }

  function decir(texto) { aviso = texto; avisoT = 1.2; }

  function sembrar(c) {
    if (c.estado !== 'vacia') { audio.error(); haptics.error(0); return; }
    c.estado = 'brote';
    c.madurez = 0;
    c.agua = 0.35;
    audio.place();
    haptics.tap(0);
  }

  function cosechar(c, x, y) {
    if (c.estado !== 'madura') {
      decir(c.estado === 'pasada' ? 'Esa se pasó: hay que arrancarla' : 'Todavía no está');
      if (c.estado === 'pasada') { c.estado = 'vacia'; c.madurez = 0; c.plaga = 0; audio.back(); }
      else { audio.error(); haptics.error(0); }
      return;
    }
    cosechadas++;
    c.estado = 'vacia';
    c.madurez = 0;
    c.agua = 0;
    c.plaga = 0;
    audio.pickup();
    haptics.score(0);
    sb.update(cosechadas, perdidas);
    particles.burst(celdaX(x), celdaY(y), 16, { speed: 180, color: '#a8ff3e', size: 4, drag: 0.9 });
  }

  const celdaX = (x) => W * 0.5 + (x - (COLS - 1) / 2) * Math.min(120, W * 0.13);
  const celdaY = (y) => H * 0.5 + (y - (FILAS - 1) / 2) * Math.min(120, H * 0.2);

  function acabar() {
    terminado = true;
    const exito = cosechadas >= META;
    if (exito) { audio.win(); haptics.victory(null); } else { audio.lose(); }
    ctx.finish({
      winner: -1,
      scores: [cosechadas, perdidas],
      detail: exito
        ? `¡Cosecha salvada! ${cosechadas} piezas (hacían falta ${META})`
        : `Solo ${cosechadas} de ${META} piezas antes de la helada`,
      record: ctx.record('cosecha', cosechadas, 'high'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nueva();
      sb = ui.scoreboard({ center: `${META} piezas antes de la helada` });
      ui.toast(`${players[0].name}: siembra y cosecha · ${players[1].name}: riega y quita plagas`, { ms: 3000 });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      avisoT = Math.max(0, avisoT - dt);
      particles.update(dt);
      const antes = Math.ceil(reloj);
      reloj -= dt;
      if (Math.ceil(reloj) !== antes && reloj <= 10 && reloj > 0) audio.countdown(Math.ceil(reloj));
      if (reloj <= 0) { acabar(); return; }

      for (const j of [0, 1]) {
        const pl = input.player(j);
        if (pl.pressed('left')) { cursor[j] = (cursor[j] + COLS * FILAS - 1) % (COLS * FILAS); audio.tick(); }
        if (pl.pressed('right')) { cursor[j] = (cursor[j] + 1) % (COLS * FILAS); audio.tick(); }
        if (pl.pressed('up')) { cursor[j] = (cursor[j] + COLS * FILAS - COLS) % (COLS * FILAS); audio.tick(); }
        if (pl.pressed('down')) { cursor[j] = (cursor[j] + COLS) % (COLS * FILAS); audio.tick(); }
      }

      const c0 = bancal[cursor[0]];
      const p0 = input.player(0);
      if (p0.pressed('a')) {
        const x = cursor[0] % COLS, y = Math.floor(cursor[0] / COLS);
        if (c0.estado === 'vacia') sembrar(c0);
        else cosechar(c0, x, y);
      }

      const c1 = bancal[cursor[1]];
      const p1 = input.player(1);
      if (p1.held('a') && c1.estado !== 'vacia') {
        c1.agua = clamp(c1.agua + dt * 0.9, 0, 1);
        if (rng() < dt * 18) {
          particles.spawn({
            x: celdaX(cursor[1] % COLS) + (rng() - 0.5) * 40, y: celdaY(Math.floor(cursor[1] / COLS)) - 30,
            vx: 0, vy: 130, life: 0.35, maxLife: 0.35, size: 3, color: '#9fd8ff', shape: 'circle',
          });
        }
      }
      if (p1.pressed('b') && c1.plaga > 0) {
        c1.plaga = 0;
        audio.hit();
        haptics.tap(1);
        particles.burst(celdaX(cursor[1] % COLS), celdaY(Math.floor(cursor[1] / COLS)), 12,
          { speed: 160, color: '#b04cff', size: 3, drag: 0.9 });
      }

      // Crecimiento, sed y plagas.
      for (let i = 0; i < bancal.length; i++) {
        const c = bancal[i];
        if (c.estado === 'vacia') continue;
        c.agua = clamp(c.agua - SED * dt, 0, 1);
        if (c.plaga > 0) c.plaga = clamp(c.plaga + dt * 0.22, 0, 1);
        else if (rng() < dt * 0.035) c.plaga = 0.25;

        const ritmo = (c.agua > 0.12 ? 1 : 0.12) * (1 - c.plaga * 0.8);
        c.madurez += CRECE * ritmo * dt;

        if (c.estado === 'brote' && c.madurez >= 1) { c.estado = 'madura'; audio.blip(); }
        if (c.estado === 'madura' && c.madurez >= 1.9) {
          c.estado = 'pasada';
          perdidas++;
          sb.update(cosechadas, perdidas);
          audio.tone({ freq: 150, dur: 0.14, gain: 0.1, type: 'sawtooth' });
        }
        if (c.plaga >= 1) {
          c.estado = 'vacia';
          c.madurez = 0;
          c.plaga = 0;
          perdidas++;
          sb.update(cosechadas, perdidas);
          audio.error();
        }
      }

      if (cosechadas >= META) { acabar(); }
    },

    render() {
      const g = ctx.c;
      const frio = clamp(1 - reloj / TIEMPO, 0, 1);
      ctx.engine.clear(`rgb(${Math.round(12 + frio * 8)},${Math.round(16 + frio * 10)},${Math.round(14 + frio * 30)})`);

      // Cristales del invernadero
      g.strokeStyle = '#ffffff0c';
      g.lineWidth = 2;
      for (let x = 0; x < W; x += 90) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y < H; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

      const an = Math.min(112, W * 0.12), al = Math.min(104, H * 0.18);

      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const c = bancal[k(x, y)];
          const cx = celdaX(x), cy = celdaY(y);
          // Tierra, más oscura cuanto más mojada.
          const humedad = c.agua;
          g.fillStyle = `rgb(${Math.round(70 - humedad * 34)},${Math.round(48 - humedad * 22)},${Math.round(32 - humedad * 12)})`;
          g.beginPath(); g.roundRect(cx - an / 2, cy - al / 2, an, al, 10); g.fill();

          if (c.estado !== 'vacia') {
            const madurez = clamp(c.madurez, 0, 1);
            const alto = al * (0.18 + madurez * 0.5);
            g.strokeStyle = c.estado === 'pasada' ? '#7a6a4a' : '#3f8f3a';
            g.lineWidth = 4;
            g.beginPath();
            g.moveTo(cx, cy + al * 0.3);
            g.lineTo(cx, cy + al * 0.3 - alto);
            g.stroke();
            const rf = 8 + madurez * 12;
            g.fillStyle = c.estado === 'pasada' ? '#6a5a3a' : c.estado === 'madura' ? '#ff6b3c' : '#7fc45a';
            g.beginPath(); g.arc(cx, cy + al * 0.3 - alto, rf, 0, TAU); g.fill();
            if (c.estado === 'madura') ctx.engine.glowCircle(cx, cy + al * 0.3 - alto, rf, '#ff6b3c', 16);

            // Sed y plaga, marcados encima
            if (c.agua < 0.15) ctx.engine.text('💧', cx - an * 0.32, cy - al * 0.32, { size: 15, color: '#ff4757', font: 'system-ui' });
            if (c.plaga > 0) {
              for (let n = 0; n < 3; n++) {
                const a = t * 3 + n * 2;
                g.fillStyle = `rgba(176,76,255,${0.4 + c.plaga * 0.6})`;
                g.beginPath();
                g.arc(cx + Math.cos(a) * 22, cy - al * 0.2 + Math.sin(a) * 14, 4, 0, TAU);
                g.fill();
              }
            }
          }

          for (const j of [0, 1]) {
            if (cursor[j] !== k(x, y)) continue;
            g.strokeStyle = players[j].color;
            g.lineWidth = 3;
            const d = j === 0 ? 0 : 6;
            g.strokeRect(cx - an / 2 - d, cy - al / 2 - d, an + d * 2, al + d * 2);
          }
        }
      }

      // Helada
      g.fillStyle = `rgba(140,190,255,${frio * 0.12})`;
      g.fillRect(0, 0, W, H);

      particles.render(g);

      ctx.engine.text(`${Math.ceil(Math.max(0, reloj))}s para la helada`, W / 2, H * 0.08, {
        size: 17, color: reloj < 20 ? '#8fc6ff' : '#c9c9e0', font: 'system-ui',
      });
      ctx.engine.text(`cosechadas ${cosechadas}/${META} · perdidas ${perdidas}`, W / 2, H * 0.13,
        { size: 13, color: '#8f9fb0', font: 'system-ui' });
      if (avisoT > 0) {
        g.save();
        g.globalAlpha = clamp(avisoT, 0, 1);
        ctx.engine.text(aviso, W / 2, H * 0.88, { size: 15, color: '#ffd166', font: 'system-ui' });
        g.restore();
      }

      ctx.engine.text(`${players[0].name}: siembra y cosecha · ${players[1].name}: mantén para regar, especial contra plagas`,
        W / 2, H - 12, { size: 11, color: '#5a6a58', font: 'system-ui' });
    },
  };
}
