/**
 * Puyo Doble — parejas de gotas que caen y estallan de cuatro en cuatro.
 *
 * Frente al tetromino clásico, aquí la pieza es minúscula y todo el juego está
 * en lo que dejas debajo. Un montón bien construido no se rompe: se DESPLOMA
 * en cascada, y cada escalón de esa cascada multiplica el ataque.
 *
 * De ahí la tensión: el que revienta cada cuatro gotas sobrevive tranquilo
 * pero no hace daño; el que aguanta construyendo tres o cuatro escalones roza
 * el techo, y si le entra basura antes de disparar, pierde ahí mismo.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 6;
const FILAS = 12;
const COLORES = ['#ff2e88', '#00e5ff', '#a8ff3e', '#ffd166'];
const BASURA = -2;
const CAIDA_BASE = 0.62;       // segundos por casilla
const CAIDA_MIN = 0.2;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let celda = 0, tabAn = 0, tabAl = 0;
  const lados = [crear(0), crear(1)];
  let sb = null, terminado = false, tiempo = 0;

  function crear(i) {
    return {
      i, rej: new Array(COLS * FILAS).fill(-1),
      pieza: null, siguiente: parejaNueva(),
      reloj: CAIDA_BASE, resolviendo: 0, cola: [],
      pendiente: 0, enviadas: 0, cadena: 0, aviso: 0, texto: '', sacudida: 0,
    };
  }

  function parejaNueva() {
    return { a: Math.floor(rng() * COLORES.length), b: Math.floor(rng() * COLORES.length) };
  }

  const k = (x, y) => y * COLS + x;

  /** La pieza son dos gotas: el pivote y la que gira alrededor. */
  function soltarPieza(L) {
    const par = L.siguiente;
    L.siguiente = parejaNueva();
    L.pieza = { x: 2, y: 0, rot: 0, a: par.a, b: par.b };
    if (!cabe(L, L.pieza.x, L.pieza.y, L.pieza.rot)) { perder(L); return false; }
    return true;
  }

  const compa = (p) => {
    const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.rot];
    return { x: p.x + d[0], y: p.y + d[1] };
  };

  function cabe(L, x, y, rot) {
    const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][rot];
    const celdas = [[x, y], [x + d[0], y + d[1]]];
    for (const [cx, cy] of celdas) {
      if (cx < 0 || cx >= COLS || cy >= FILAS) return false;
      if (cy >= 0 && L.rej[k(cx, cy)] !== -1) return false;
    }
    return true;
  }

  function fijar(L) {
    const p = L.pieza;
    const c = compa(p);
    if (p.y >= 0) L.rej[k(p.x, p.y)] = p.a;
    if (c.y >= 0) L.rej[k(c.x, c.y)] = p.b;
    L.pieza = null;
    L.resolviendo = 0.001;
    L.cadena = 0;
    audio.place();
    haptics.tap(L.i);
  }

  function asentar(L) {
    let movio = false;
    for (let x = 0; x < COLS; x++) {
      let destino = FILAS - 1;
      for (let y = FILAS - 1; y >= 0; y--) {
        const v = L.rej[k(x, y)];
        if (v === -1) continue;
        if (y !== destino) { L.rej[k(x, destino)] = v; L.rej[k(x, y)] = -1; movio = true; }
        destino--;
      }
    }
    return movio;
  }

  /** Grupos de 4+ del mismo color conectados. La basura solo cae con ellos. */
  function estallar(L) {
    const visto = new Array(COLS * FILAS).fill(false);
    const romper = [];
    let grupos = 0;

    for (let y = 0; y < FILAS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = k(x, y);
        const col = L.rej[i];
        if (col < 0 || visto[i]) continue;
        const pila = [i], grupo = [];
        visto[i] = true;
        while (pila.length) {
          const c = pila.pop();
          grupo.push(c);
          const cx = c % COLS, cy = Math.floor(c / COLS);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= FILAS) continue;
            const ni = k(nx, ny);
            if (visto[ni] || L.rej[ni] !== col) continue;
            visto[ni] = true;
            pila.push(ni);
          }
        }
        if (grupo.length >= 4) {
          grupos++;
          romper.push(...grupo);
          // La basura pegada al grupo se va con él: es la única forma de quitarla.
          for (const c of grupo) {
            const cx = c % COLS, cy = Math.floor(c / COLS);
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (nx < 0 || ny < 0 || nx >= COLS || ny >= FILAS) continue;
              if (L.rej[k(nx, ny)] === BASURA) romper.push(k(nx, ny));
            }
          }
        }
      }
    }
    if (!romper.length) return 0;

    for (const c of new Set(romper)) {
      const px = tabX(L.i) + (c % COLS) * celda + celda / 2;
      const py = tabY() + Math.floor(c / COLS) * celda + celda / 2;
      particles.burst(px, py, 7, {
        speed: 170, color: L.rej[c] === BASURA ? '#8a90a8' : COLORES[L.rej[c]], size: 3, drag: 0.9,
      });
      L.rej[c] = -1;
    }
    return grupos;
  }

  function meterBasura(L, cantidad) {
    let puestas = 0;
    for (let n = 0; n < cantidad; n++) {
      // Se reparte por columnas al azar, sin apilar todo en la misma.
      const orden = [...Array(COLS).keys()].sort(() => rng() - 0.5);
      let colocada = false;
      for (const x of orden) {
        for (let y = FILAS - 1; y >= 0; y--) {
          if (L.rej[k(x, y)] === -1) { L.rej[k(x, y)] = BASURA; colocada = true; break; }
        }
        if (colocada) break;
      }
      if (colocada) puestas++;
    }
    L.sacudida = Math.min(9, 3 + cantidad);
    audio.tone({ freq: 170, dur: 0.14, gain: 0.14, type: 'sawtooth', sweep: -50 });
    haptics.impact(L.i, 0.9);
    return puestas;
  }

  const tabX = (i) => (i === 0 ? W * 0.5 - tabAn - 60 : W * 0.5 + 60);
  const tabY = () => (H - tabAl) / 2 + 12;

  function medir() {
    celda = Math.floor(Math.min((W * 0.36) / COLS, (H - 100) / FILAS));
    tabAn = celda * COLS;
    tabAl = celda * FILAS;
  }

  function perder(L) {
    if (terminado) return;
    terminado = true;
    const g = 1 - L.i;
    audio.win();
    haptics.victory(g);
    ctx.finish({
      winner: g,
      scores: [lados[0].enviadas, lados[1].enviadas],
      detail: `${players[L.i].name} llega al techo`,
      record: ctx.record('cadena', Math.max(lados[0].cadena, lados[1].cadena), 'high'),
    });
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      medir();
      for (const L of lados) soltarPieza(L);
      sb = ui.scoreboard({ center: 'cuatro iguales estallan' });
    },
    resize(nw, nh) { W = nw; H = nh; medir(); },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      tiempo += dt;
      particles.update(dt);
      const ritmo = Math.max(CAIDA_MIN, CAIDA_BASE - tiempo * 0.006);

      for (const L of lados) {
        L.aviso = Math.max(0, L.aviso - dt);
        L.sacudida = Math.max(0, L.sacudida - dt * 24);

        // Fase de estallidos: se resuelve escalón a escalón, con pausa visible.
        if (L.resolviendo > 0) {
          L.resolviendo -= dt;
          if (L.resolviendo > 0) continue;
          asentar(L);
          const grupos = estallar(L);
          if (grupos) {
            L.cadena++;
            L.resolviendo = 0.28;
            audio.tone({ freq: 400 + L.cadena * 150, dur: 0.1, gain: 0.17, type: 'square' });
            haptics.play('score', { player: L.i });
            L.aviso = 1.1;
            L.texto = L.cadena > 1 ? `CADENA ×${L.cadena}` : '¡Boom!';
            const ataque = grupos * 2 * L.cadena;
            L.enviadas += ataque;
            // La basura propia pendiente se cancela antes de atacar.
            const cancelado = Math.min(L.pendiente, ataque);
            L.pendiente -= cancelado;
            if (ataque - cancelado > 0) lados[1 - L.i].pendiente += ataque - cancelado;
          } else {
            L.resolviendo = 0;
            if (L.pendiente > 0) {
              meterBasura(L, Math.min(L.pendiente, COLS * 2));
              L.pendiente = Math.max(0, L.pendiente - COLS * 2);
              L.resolviendo = 0.001;
              continue;
            }
            if (!soltarPieza(L)) return;
            L.reloj = ritmo;
          }
          continue;
        }

        if (!L.pieza) continue;
        const pl = input.player(L.i);
        const p = L.pieza;

        if (pl.pressed('left') && cabe(L, p.x - 1, p.y, p.rot)) { p.x--; audio.tick(); }
        if (pl.pressed('right') && cabe(L, p.x + 1, p.y, p.rot)) { p.x++; audio.tick(); }
        if (pl.pressed('a') || pl.pressed('up')) {
          const nr = (p.rot + 1) % 4;
          if (cabe(L, p.x, p.y, nr)) { p.rot = nr; audio.blip(); }
          else if (cabe(L, p.x - 1, p.y, nr)) { p.x--; p.rot = nr; audio.blip(); }
          else if (cabe(L, p.x + 1, p.y, nr)) { p.x++; p.rot = nr; audio.blip(); }
        }

        const rapido = pl.held('down');
        L.reloj -= dt * (rapido ? 9 : 1);
        if (L.reloj <= 0) {
          L.reloj = ritmo;
          if (cabe(L, p.x, p.y + 1, p.rot)) p.y++;
          else fijar(L);
        }
      }

      sb.update(lados[0].enviadas, lados[1].enviadas);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#05050e');

      for (const L of lados) {
        const ox = tabX(L.i) + (L.sacudida ? (rng() - 0.5) * L.sacudida : 0);
        const oy = tabY();
        const col = players[L.i].color;

        g.fillStyle = '#0d0b18';
        g.fillRect(ox - 4, oy - 4, tabAn + 8, tabAl + 8);
        g.strokeStyle = `${col}55`;
        g.lineWidth = 2;
        g.strokeRect(ox - 4, oy - 4, tabAn + 8, tabAl + 8);
        g.strokeStyle = '#ffffff08';
        g.lineWidth = 1;
        for (let x = 1; x < COLS; x++) { g.beginPath(); g.moveTo(ox + x * celda, oy); g.lineTo(ox + x * celda, oy + tabAl); g.stroke(); }

        const gota = (x, y, v, alpha = 1) => {
          const px = ox + x * celda + celda / 2, py = oy + y * celda + celda / 2;
          g.save();
          g.globalAlpha = alpha;
          if (v === BASURA) {
            g.fillStyle = '#5b6178';
            g.beginPath(); g.arc(px, py, celda * 0.36, 0, Math.PI * 2); g.fill();
            g.strokeStyle = '#8a90a8';
            g.lineWidth = 2;
            g.stroke();
          } else {
            g.fillStyle = COLORES[v];
            g.shadowColor = COLORES[v];
            g.shadowBlur = 10;
            g.beginPath(); g.arc(px, py, celda * 0.42, 0, Math.PI * 2); g.fill();
            g.shadowBlur = 0;
            g.fillStyle = '#ffffff66';
            g.beginPath(); g.arc(px - celda * 0.12, py - celda * 0.14, celda * 0.11, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        };

        for (let y = 0; y < FILAS; y++) {
          for (let x = 0; x < COLS; x++) {
            const v = L.rej[k(x, y)];
            if (v !== -1) gota(x, y, v);
          }
        }

        if (L.pieza) {
          const p = L.pieza;
          const c = compa(p);
          if (p.y >= 0) gota(p.x, p.y, p.a);
          if (c.y >= 0) gota(c.x, c.y, p.b);
        }

        // Siguiente pareja
        const nx = L.i === 0 ? ox - 46 : ox + tabAn + 12;
        ctx.engine.text('sig.', nx + 17, oy + 6, { size: 9, color: '#6a6a88', font: 'system-ui' });
        for (const [n, v] of [[0, L.siguiente.b], [1, L.siguiente.a]]) {
          g.fillStyle = COLORES[v];
          g.beginPath(); g.arc(nx + 17, oy + 26 + n * 26, 10, 0, Math.PI * 2); g.fill();
        }

        if (L.pendiente > 0) {
          ctx.engine.text(`⚠ ${L.pendiente}`, ox + tabAn / 2, oy - 16,
            { size: 13, color: '#ff4757', font: 'system-ui' });
        }
        if (L.aviso > 0) {
          g.save();
          g.globalAlpha = clamp(L.aviso, 0, 1);
          ctx.engine.text(L.texto, ox + tabAn / 2, oy + tabAl * 0.4, { size: 19, color: '#ffd166', glow: 16 });
          g.restore();
        }
        ctx.engine.text(players[L.i].name, ox + tabAn / 2, oy + tabAl + 18,
          { size: 12, color: col, font: 'system-ui' });
      }

      particles.render(g);
      ctx.engine.text('←/→ mueven · tu tecla (o ↑) gira la pareja · ↓ acelera · cuatro del mismo color estallan',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
