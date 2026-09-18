/**
 * Mapa del Tesoro — uno tiene el mapa en el iPad y el otro camina a oscuras.
 *
 * La pantalla grande solo enseña lo que pisa el explorador: un círculo de
 * arena a su alrededor. El mapa completo, con las trampas y el cofre, vive en
 * el mando del otro y no se puede enseñar.
 *
 * El mapa se describe en coordenadas de tablero (columna-fila) para que se
 * pueda cantar en voz alta: "C4, cuidado con D5". Sin ese vocabulario común
 * el juego es imposible, y encontrarlo es media diversión.
 */

import { clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const COLS = 9;
const FILAS = 7;
const TIEMPO = 160;
const TRAMPAS = 9;
const LETRAS = 'ABCDEFGHI';

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let trampas = new Set(), cofre = { x: 0, y: 0 };
  let explorador = { x: 0, y: 0, px: 0, py: 0, mover: 0, mira: 1 };
  let visto = new Set(), sustos = 0, reloj = TIEMPO, t = 0, terminado = false;
  let guia = 1, sb = null, mensaje = '';

  const k = (x, y) => y * COLS + x;
  const nombre = (x, y) => `${LETRAS[x]}${y + 1}`;

  function generar() {
    trampas = new Set();
    while (trampas.size < TRAMPAS) {
      const x = Math.floor(rng() * COLS), y = Math.floor(rng() * FILAS);
      if (x === 0 && y === 0) continue;
      trampas.add(k(x, y));
    }
    do {
      cofre = { x: Math.floor(rng() * COLS), y: Math.floor(rng() * FILAS) };
    } while (trampas.has(k(cofre.x, cofre.y)) || (cofre.x < 3 && cofre.y < 3));
    explorador = { x: 0, y: 0, px: 0, py: 0, mover: 0, mira: 1 };
    visto = new Set([k(0, 0)]);
  }

  function mandarMapa() {
    const filas = [];
    for (let y = 0; y < FILAS; y++) {
      let linea = `${y + 1} `;
      for (let x = 0; x < COLS; x++) {
        if (cofre.x === x && cofre.y === y) linea += 'X';
        else if (trampas.has(k(x, y))) linea += '#';
        else linea += '·';
      }
      filas.push(linea);
    }
    ctx.mando.perfil(guia, {
      disposicion: 'pila',
      juego: 'Mapa del Tesoro',
      pie: 'Cántale las coordenadas · no le enseñes la pantalla',
      controles: [
        {
          tipo: 'secreto',
          titulo: `  ${LETRAS.slice(0, COLS).split('').join('')}`,
          texto: filas.join('\n'),
          dato: `X = cofre · # = trampa · está en ${nombre(explorador.x, explorador.y)}`,
        },
      ],
    });
    ctx.mando.perfil(1 - guia, {
      disposicion: 'dual',
      juego: 'Mapa del Tesoro',
      pie: 'Camina donde te digan',
      controles: [{ tipo: 'cruz' }, { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Cavar', glifo: '⛏' }] }],
    });
  }

  function mover(dx, dy) {
    const nx = clamp(explorador.x + dx, 0, COLS - 1);
    const ny = clamp(explorador.y + dy, 0, FILAS - 1);
    if (nx === explorador.x && ny === explorador.y) return;
    explorador.px = explorador.x; explorador.py = explorador.y;
    explorador.x = nx; explorador.y = ny;
    explorador.mover = 0.16;
    if (dx) explorador.mira = dx > 0 ? 1 : -1;
    visto.add(k(nx, ny));
    audio.tick();
    mandarMapa();

    if (trampas.has(k(nx, ny))) {
      sustos++;
      reloj -= 12;
      mensaje = `¡Trampa en ${nombre(nx, ny)}! −12 s`;
      audio.explosion();
      haptics.explosion(1 - guia);
      ctx.shake(12);
      particles.burst(celdaX(nx), celdaY(ny), 20, { speed: 220, color: '#ff4757', size: 4, drag: 0.9 });
      sb.update(visto.size, sustos);
    }
  }

  const lado = () => Math.min((W - 80) / COLS, (H - 160) / FILAS);
  const celdaX = (x) => (W - lado() * COLS) / 2 + (x + 0.5) * lado();
  const celdaY = (y) => (H - lado() * FILAS) / 2 + 20 + (y + 0.5) * lado();

  return {
    init() {
      W = ctx.W; H = ctx.H;
      generar();
      sb = ui.scoreboard({ center: 'encontrad el cofre' });
      mandarMapa();
      ui.toast(`${players[guia].name} tiene el mapa · ${players[1 - guia].name} camina`, { ms: 2800 });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      explorador.mover = Math.max(0, explorador.mover - dt);
      particles.update(dt);
      reloj -= dt;
      if (reloj <= 0) {
        terminado = true;
        audio.lose();
        ctx.finish({
          winner: -1, scores: [visto.size, sustos],
          detail: `Sin tiempo · ${sustos} trampas pisadas`,
        });
        return;
      }

      const pl = input.player(1 - guia);
      if (explorador.mover <= 0) {
        if (pl.pressed('left')) mover(-1, 0);
        else if (pl.pressed('right')) mover(1, 0);
        else if (pl.pressed('up')) mover(0, -1);
        else if (pl.pressed('down')) mover(0, 1);
      }
      if (pl.pressed('a')) {
        if (explorador.x === cofre.x && explorador.y === cofre.y) {
          terminado = true;
          audio.win();
          haptics.victory(null);
          particles.burst(celdaX(cofre.x), celdaY(cofre.y), 40, { speed: 300, color: '#ffd166', size: 5, drag: 0.9 });
          ctx.finish({
            winner: -1,
            scores: [Math.round(TIEMPO - reloj), sustos],
            detail: `¡Cofre en ${nombre(cofre.x, cofre.y)}! en ${Math.round(TIEMPO - reloj)} s con ${sustos} trampas`,
            record: ctx.record('tiempo', Math.round(TIEMPO - reloj), 'low'),
          });
          return;
        }
        mensaje = `Aquí no hay nada (${nombre(explorador.x, explorador.y)})`;
        reloj -= 3;
        audio.error();
        haptics.error(1 - guia);
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0a08');
      const l = lado();

      for (let y = 0; y < FILAS; y++) {
        for (let x = 0; x < COLS; x++) {
          const cx = celdaX(x), cy = celdaY(y);
          const d = Math.abs(x - explorador.x) + Math.abs(y - explorador.y);
          const conocida = visto.has(k(x, y));
          const cerca = d <= 1;
          g.fillStyle = cerca ? '#4a3a24' : conocida ? '#2a2216' : '#16120e';
          g.fillRect(cx - l / 2 + 1, cy - l / 2 + 1, l - 2, l - 2);
          if (conocida && trampas.has(k(x, y))) {
            ctx.engine.text('✖', cx, cy, { size: l * 0.4, color: '#ff4757', font: 'system-ui' });
          }
          if (terminado && cofre.x === x && cofre.y === y) {
            ctx.engine.glowCircle(cx, cy, l * 0.3, '#ffd166', 20);
          }
          // Coordenadas: el vocabulario común de los dos.
          if (y === 0) ctx.engine.text(LETRAS[x], cx, celdaY(0) - l * 0.75, { size: 12, color: '#7a6a4a', font: 'system-ui' });
          if (x === 0) ctx.engine.text(String(y + 1), celdaX(0) - l * 0.75, cy, { size: 12, color: '#7a6a4a', font: 'system-ui' });
        }
      }

      particles.render(g);

      const p = clamp(1 - explorador.mover / 0.16, 0, 1);
      const ex = celdaX(explorador.px + (explorador.x - explorador.px) * p);
      const ey = celdaY(explorador.py + (explorador.y - explorador.py) * p);
      dibujarPersonaje(g, personajeDe(players[1 - guia], 1 - guia), ex, ey + l * 0.4, l * 0.9, {
        pose: explorador.mover > 0 ? 'anda' : 'quieto',
        frame: Math.floor(t * 8) % 4,
        acento: players[1 - guia].color, mirando: explorador.mira, brillo: 14,
      });

      ctx.engine.text(`estás en ${nombre(explorador.x, explorador.y)} · ${Math.ceil(Math.max(0, reloj))}s`,
        W / 2, H * 0.06, { size: 16, color: '#ffd166', font: 'system-ui' });
      if (mensaje) ctx.engine.text(mensaje, W / 2, H * 0.11, { size: 13, color: '#d8b088', font: 'system-ui' });

      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita un mando táctil para el mapa · Menú → Mandos',
          W / 2, H - 12, { size: 12, color: '#ffd166', font: 'system-ui' });
      } else {
        ctx.engine.text(`${players[guia].name} lee el mapa en su mando · ${players[1 - guia].name} camina y cava`,
          W / 2, H - 12, { size: 11, color: '#6a5a48', font: 'system-ui' });
      }
    },
  };
}
