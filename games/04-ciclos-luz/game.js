/**
 * Ciclos de Luz — motos de luz sobre rejilla, giros de 90° y estela sólida.
 *
 * A diferencia de Curvas, aquí el movimiento es por celdas: se puede razonar
 * el espacio y encerrar al rival. La rejilla se guarda como Int8Array
 * (0 vacío, 1 estela P1, 2 estela P2) y la colisión es una simple lectura.
 */

export const meta = { render: 'canvas' };

const PARA_GANAR = 5;
const CELDA = 12;
const PASOS_SEG = 22;          // celdas por segundo
const TURBO_MULT = 2;
const TURBO_MAX = 1.6;         // segundos de turbo por ronda
const TURBO_RECARGA = 0.35;    // por segundo

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let cols = 0, filas = 0, offX = 0, offY = 0;
  let rejilla = null;

  const jug = [nuevo(0), nuevo(1)];
  let ronda = 1, sb = null, finRonda = 0, vivos = 2;
  let acumulador = 0;

  function nuevo(i) {
    return { i, cx: 0, cy: 0, dx: 0, dy: 0, prox: null, vivo: true, score: 0, turbo: TURBO_MAX, usandoTurbo: false, estela: [] };
  }

  function medir() {
    cols = Math.floor((W - 20) / CELDA);
    filas = Math.floor((H - 20) / CELDA);
    offX = Math.floor((W - cols * CELDA) / 2);
    offY = Math.floor((H - filas * CELDA) / 2);
  }

  function nuevaRonda() {
    medir();
    rejilla = new Int8Array(cols * filas);
    vivos = 2;
    for (let i = 0; i < 2; i++) {
      const p = jug[i];
      p.vivo = true;
      p.cx = i === 0 ? Math.floor(cols * 0.2) : Math.floor(cols * 0.8);
      p.cy = Math.floor(filas / 2);
      p.dx = i === 0 ? 1 : -1;
      p.dy = 0;
      p.prox = null;
      p.turbo = TURBO_MAX;
      p.usandoTurbo = false;
      p.estela = [{ x: p.cx, y: p.cy }];
      rejilla[p.cy * cols + p.cx] = i + 1;
    }
    acumulador = 0;
    finRonda = 0;
    ui.toast(`Ronda ${ronda}`, { ms: 1000 });
  }

  /** Encola el giro: se aplica en el siguiente paso, nunca a mitad de celda. */
  function leerGiro(p) {
    const pl = input.player(p.i);
    let ndx = 0, ndy = 0;
    if (pl.held('up')) { ndx = 0; ndy = -1; }
    else if (pl.held('down')) { ndx = 0; ndy = 1; }
    else if (pl.held('left')) { ndx = -1; ndy = 0; }
    else if (pl.held('right')) { ndx = 1; ndy = 0; }
    else return;
    // Prohibido el giro de 180°: sería suicidio instantáneo.
    if (ndx === -p.dx && ndy === -p.dy) return;
    p.prox = { dx: ndx, dy: ndy };
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} · a ${PARA_GANAR}` });
    },

    resize(nw, nh) { W = nw; H = nh; nuevaRonda(); },

    update(dt) {
      if (finRonda > 0) {
        finRonda -= dt;
        if (finRonda <= 0) siguienteRonda();
        particles.update(dt);
        return;
      }

      let vel = PASOS_SEG;
      for (const p of jug) {
        if (!p.vivo) continue;
        leerGiro(p);
        const pl = input.player(p.i);
        p.usandoTurbo = pl.held('a') && p.turbo > 0;
        if (p.usandoTurbo) {
          p.turbo = Math.max(0, p.turbo - dt);
          if (p.turbo === 0) audio.error();
        } else {
          p.turbo = Math.min(TURBO_MAX, p.turbo + TURBO_RECARGA * dt);
        }
      }
      // Los dos avanzan en el mismo reloj; el turbo da pasos extra al que lo usa.
      acumulador += dt * vel;
      while (acumulador >= 1) {
        acumulador -= 1;
        for (const p of jug) if (p.vivo) avanzar(p);
        for (const p of jug) if (p.vivo && p.usandoTurbo) avanzar(p);
        if (finRonda > 0) break;
      }
      particles.update(dt);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#04040e');

      // Rejilla
      g.save();
      g.strokeStyle = '#ffffff0a';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= cols; x++) { g.moveTo(offX + x * CELDA + 0.5, offY); g.lineTo(offX + x * CELDA + 0.5, offY + filas * CELDA); }
      for (let y = 0; y <= filas; y++) { g.moveTo(offX, offY + y * CELDA + 0.5); g.lineTo(offX + cols * CELDA, offY + y * CELDA + 0.5); }
      g.stroke();
      g.strokeStyle = '#ffffff30';
      g.lineWidth = 2;
      g.strokeRect(offX, offY, cols * CELDA, filas * CELDA);
      g.restore();

      // Estelas
      for (const p of jug) {
        const col = players[p.i].color;
        g.save();
        g.shadowColor = col;
        g.shadowBlur = 10;
        g.fillStyle = col;
        for (const s of p.estela) {
          g.fillRect(offX + s.x * CELDA + 1, offY + s.y * CELDA + 1, CELDA - 2, CELDA - 2);
        }
        g.restore();
      }

      particles.render(g);

      // Cabezales
      for (const p of jug) {
        if (!p.vivo) continue;
        const col = players[p.i].color;
        const x = offX + p.cx * CELDA, y = offY + p.cy * CELDA;
        g.save();
        g.shadowColor = '#fff';
        g.shadowBlur = p.usandoTurbo ? 26 : 14;
        g.fillStyle = '#fff';
        g.fillRect(x, y, CELDA, CELDA);
        g.restore();
        g.strokeStyle = col;
        g.lineWidth = 2;
        g.strokeRect(x - 2, y - 2, CELDA + 4, CELDA + 4);
      }

      // Barras de turbo
      for (let i = 0; i < 2; i++) {
        const p = jug[i];
        const bw = 130, bh = 6;
        const bx = i === 0 ? 18 : W - 18 - bw;
        const by = H - 20;
        g.fillStyle = '#ffffff18';
        g.fillRect(bx, by, bw, bh);
        g.fillStyle = players[i].color;
        const w = bw * (p.turbo / TURBO_MAX);
        g.fillRect(i === 0 ? bx : bx + bw - w, by, w, bh);
      }
    },

    destroy() { sb?.remove(); },
  };

  function avanzar(p) {
    if (p.prox) { p.dx = p.prox.dx; p.dy = p.prox.dy; p.prox = null; }
    const nx = p.cx + p.dx, ny = p.cy + p.dy;

    if (nx < 0 || ny < 0 || nx >= cols || ny >= filas) return morir(p);
    const idx = ny * cols + nx;
    if (rejilla[idx] !== 0) return morir(p);

    // Choque frontal: los dos cabezales caen en la misma celda este paso.
    const otro = jug[1 - p.i];
    if (otro.vivo && otro.cx === nx && otro.cy === ny) {
      morir(p); morir(otro); return;
    }

    rejilla[idx] = p.i + 1;
    p.cx = nx; p.cy = ny;
    p.estela.push({ x: nx, y: ny });
    if (p.estela.length % 6 === 0) haptics.play('tick', { player: p.i });
  }

  function morir(p) {
    if (!p.vivo) return;
    p.vivo = false;
    vivos--;
    audio.explosion();
    haptics.explosion(p.i);
    ctx.shake(14);
    particles.burst(offX + p.cx * CELDA + CELDA / 2, offY + p.cy * CELDA + CELDA / 2, 40, {
      speed: 300, color: players[p.i].color, size: 5, drag: 0.9,
    });
    if (vivos <= 1 && finRonda <= 0) {
      const otro = jug[1 - p.i];
      if (otro.vivo) otro.score++;
      sb.update(jug[0].score, jug[1].score);
      finRonda = 1.4;
    }
  }

  function siguienteRonda() {
    const g = jug.find((p) => p.score >= PARA_GANAR);
    if (g) {
      ctx.finish({ winner: g.i, scores: [jug[0].score, jug[1].score], detail: `${ronda} rondas` });
      return;
    }
    ronda++;
    sb.setCenter(`ronda ${ronda} · a ${PARA_GANAR}`);
    nuevaRonda();
  }
}
