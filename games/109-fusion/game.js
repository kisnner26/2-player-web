/**
 * Fusión — el juego de fusionar de los anuncios, pero a dos y con pique.
 *
 * Cada uno tiene su tablero. Caen piezas, juntas dos iguales y suben de nivel;
 * el nivel siguiente vale el doble. Ahí está el bucle adictivo: siempre estás
 * a una fusión de la siguiente, y la siguiente siempre parece cerca.
 *
 * Lo que lo convierte en juego de dos y no en dos solitarios en paralelo: cada
 * vez que alcanzas un nivel nuevo, al rival le cae una pieza basura que ocupa
 * hueco y no fusiona con nada. Así el que va ganando ahoga al otro, y el que
 * va perdiendo tiene que arriesgar para alcanzarle.
 *
 * Se pierde cuando tu tablero se llena. Gana el que más aguante, y a igualdad
 * de aguante, el que más puntos haya hecho.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 5;
const FILAS = 6;
const CAIDA_INICIAL = 1.9;      // segundos entre piezas nuevas
const CAIDA_MINIMA = 0.62;
const ACELERA_CADA = 12;        // cada cuántas piezas se acelera el ritmo
const NIVEL_ATAQUE = 4;         // a partir de aquí, fusionar manda basura

/* Los niveles son la escalera de recompensa: nombre corto para que quepa en
   la celda y color que sube de frío a caliente para que se lea el progreso. */
const NIVELES = [
  { n: 'o', col: '#5b8cff', pts: 1 },
  { n: 'O', col: '#3effc8', pts: 3 },
  { n: '◆', col: '#a8ff3e', pts: 8 },
  { n: '★', col: '#ffd166', pts: 20 },
  { n: '✦', col: '#ff7847', pts: 50 },
  { n: '❂', col: '#ff2e88', pts: 120 },
  { n: '☀', col: '#b04cff', pts: 300 },
];
const BASURA = -1;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let tiempo = 0;
  let terminado = false;

  /** Estado independiente de cada jugador. */
  const tableros = [0, 1].map(() => ({
    celdas: new Array(COLS * FILAS).fill(0),   // 0 = vacío, 1..7 = nivel, -1 basura
    cursor: 2,
    puntos: 0,
    fusiones: 0,
    piezas: 0,
    reloj: 0,
    ritmo: CAIDA_INICIAL,
    vivo: true,
    mejorNivel: 1,
    aviso: '',
    avisoT: 0,
    sacudida: 0,
  }));

  const idx = (x, y) => y * COLS + x;

  /** Deja caer un valor por una columna hasta donde tope. Devuelve la fila. */
  function soltarEn(t, col, valor) {
    for (let y = FILAS - 1; y >= 0; y--) {
      if (t.celdas[idx(col, y)] === 0) {
        t.celdas[idx(col, y)] = valor;
        return y;
      }
    }
    return -1;   // columna llena
  }

  /**
   * Fusiona en cadena desde una celda: si la de debajo es igual, sube de
   * nivel y vuelve a intentarlo. Las cadenas son lo que da los subidones.
   */
  function fusionarDesde(t, x, y, jugador) {
    let cadena = 0;
    let fila = y;
    for (;;) {
      const abajo = fila + 1;
      const aqui = t.celdas[idx(x, fila)];
      if (aqui <= 0 || abajo >= FILAS) break;
      if (t.celdas[idx(x, abajo)] !== aqui) break;
      if (aqui >= NIVELES.length) break;

      t.celdas[idx(x, abajo)] = aqui + 1;
      t.celdas[idx(x, fila)] = 0;
      compactarColumna(t, x);
      cadena++;

      const nivel = aqui + 1;
      t.puntos += NIVELES[nivel - 1].pts * (1 + cadena * 0.5) | 0;
      t.fusiones++;
      t.mejorNivel = Math.max(t.mejorNivel, nivel);

      audio.tone({
        freq: 260 + nivel * 90 + cadena * 40,
        dur: 0.09, gain: 0.14, type: 'triangle', sweep: 140,
      });
      haptics.play('click', { player: jugador });

      // Recolocar: tras compactar, la pieza fusionada puede haber bajado.
      fila = alturaDe(t, x, nivel);
      if (fila < 0) break;

      if (nivel >= NIVEL_ATAQUE) {
        atacar(1 - jugador, nivel - NIVEL_ATAQUE + 1);
        t.aviso = `¡Nivel ${nivel}! Basura para el rival`;
        t.avisoT = 1.8;
      }
    }
    if (cadena >= 2) {
      t.aviso = `Cadena de ${cadena}`;
      t.avisoT = 1.4;
      ctx.shake(3, 4);
    }
    return cadena;
  }

  /** Primera fila (de abajo arriba) donde hay ese valor en la columna. */
  function alturaDe(t, x, valor) {
    for (let y = FILAS - 1; y >= 0; y--) if (t.celdas[idx(x, y)] === valor) return y;
    return -1;
  }

  /** Hace caer todo lo que haya quedado flotando en una columna. */
  function compactarColumna(t, x) {
    const pila = [];
    for (let y = FILAS - 1; y >= 0; y--) {
      const v = t.celdas[idx(x, y)];
      if (v !== 0) pila.push(v);
      t.celdas[idx(x, y)] = 0;
    }
    pila.forEach((v, k) => { t.celdas[idx(x, FILAS - 1 - k)] = v; });
  }

  /** Mete basura en el tablero del rival, en columnas al azar. */
  function atacar(destino, cuantas) {
    const t = tableros[destino];
    if (!t.vivo) return;
    for (let i = 0; i < cuantas; i++) {
      const col = Math.floor(ctx.rng() * COLS);
      if (soltarEn(t, col, BASURA) < 0) { perder(destino); return; }
    }
    t.sacudida = 0.4;
    t.aviso = '¡Te cae basura!';
    t.avisoT = 1.4;
    audio.tone({ freq: 130, dur: 0.16, gain: 0.13, type: 'sawtooth', sweep: -50 });
    haptics.play('impact', { player: destino });
    ctx.mando?.vibrar?.(destino, 'golpe');
  }

  function perder(jugador) {
    const t = tableros[jugador];
    if (!t.vivo) return;
    t.vivo = false;
    audio.explosion();
    haptics.explosion(jugador);
    ctx.shake(6, 8);
    revisarFinal();
  }

  function revisarFinal() {
    if (terminado) return;
    const vivos = tableros.filter((t) => t.vivo).length;
    if (vivos > 1) return;
    terminado = true;
    const [a, b] = tableros;
    let ganador;
    if (a.vivo !== b.vivo) ganador = a.vivo ? 0 : 1;
    else ganador = a.puntos === b.puntos ? -1 : (a.puntos > b.puntos ? 0 : 1);
    ctx.record('fusion', Math.max(a.puntos, b.puntos), 'max');
    ctx.finish({ winner: ganador, scores: [a.puntos, b.puntos] });
  }

  /** Nueva pieza para un jugador, en su columna elegida. */
  function nuevaPieza(t, jugador) {
    // Casi siempre nivel 1; de vez en cuando un 2 como regalo. Sin ese regalo
    // ocasional el tablero se atasca en cuanto te descuidas.
    const valor = ctx.rng() < 0.16 ? 2 : 1;
    const fila = soltarEn(t, t.cursor, valor);
    if (fila < 0) { perder(jugador); return; }
    t.piezas++;
    fusionarDesde(t, t.cursor, fila, jugador);
    if (t.piezas % ACELERA_CADA === 0) {
      t.ritmo = Math.max(CAIDA_MINIMA, t.ritmo * 0.9);
    }
    audio.blip();
  }

  return {
    init() {
      // Un par de piezas de salida para que el tablero no empiece desierto.
      for (const [i, t] of tableros.entries()) {
        for (let k = 0; k < 4; k++) {
          t.cursor = Math.floor(ctx.rng() * COLS);
          nuevaPieza(t, i);
        }
        t.cursor = 2;
        t.puntos = 0;
      }
    },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      if (terminado) return;
      tiempo += dt;

      for (const [i, t] of tableros.entries()) {
        t.avisoT = Math.max(0, t.avisoT - dt);
        t.sacudida = Math.max(0, t.sacudida - dt);
        if (!t.vivo) continue;

        const p = input.player(i);
        if (p.pressed('left')) { t.cursor = (t.cursor + COLS - 1) % COLS; audio.blip(); }
        if (p.pressed('right')) { t.cursor = (t.cursor + 1) % COLS; audio.blip(); }
        // Soltar a mano adelanta la pieza: premia jugar rápido en vez de
        // esperar al reloj, que es lo que engancha de estos juegos.
        if (p.pressed('a')) { nuevaPieza(t, i); t.reloj = 0; }

        t.reloj += dt;
        if (t.reloj >= t.ritmo) { t.reloj = 0; nuevaPieza(t, i); }
      }
    },

    render() {
      const g = ctx.c;
      g.fillStyle = '#0a0916';
      g.fillRect(0, 0, W, H);

      const anchoMitad = W / 2;
      const cw = Math.min(anchoMitad * 0.72 / COLS, (H * 0.62) / FILAS);
      const ox0 = anchoMitad * 0.5 - (COLS * cw) / 2;
      const oy = H * 0.28;

      for (const [i, t] of tableros.entries()) {
        const ox = ox0 + i * anchoMitad + (t.sacudida > 0 ? Math.sin(tiempo * 60) * 4 : 0);
        const col = players[i].color;

        /* Cabecera del jugador */
        ctx.engine.text(players[i].name, ox + (COLS * cw) / 2, oy - 74, {
          size: 14, color: col, font: 'system-ui',
        });
        ctx.engine.text(String(t.puntos), ox + (COLS * cw) / 2, oy - 42, { size: 30, color: col });
        ctx.engine.text(`${t.fusiones} fusiones`, ox + (COLS * cw) / 2, oy - 22, {
          size: 10.5, color: '#6a6a8c', font: 'system-ui',
        });

        /* Rejilla */
        g.fillStyle = '#ffffff06';
        g.fillRect(ox, oy, COLS * cw, FILAS * cw);
        g.strokeStyle = t.vivo ? col + '44' : '#ff475766';
        g.lineWidth = 2;
        g.strokeRect(ox, oy, COLS * cw, FILAS * cw);

        for (let y = 0; y < FILAS; y++) {
          for (let x = 0; x < COLS; x++) {
            const v = t.celdas[idx(x, y)];
            const px = ox + x * cw, py = oy + y * cw;
            g.strokeStyle = '#ffffff0c';
            g.lineWidth = 1;
            g.strokeRect(px, py, cw, cw);
            if (v === 0) continue;

            if (v === BASURA) {
              g.fillStyle = '#3a3a52';
              g.fillRect(px + 3, py + 3, cw - 6, cw - 6);
              g.strokeStyle = '#5a5a78';
              g.lineWidth = 1.5;
              g.strokeRect(px + 3, py + 3, cw - 6, cw - 6);
              continue;
            }

            const nivel = NIVELES[Math.min(v, NIVELES.length) - 1];
            g.save();
            g.shadowColor = nivel.col;
            g.shadowBlur = 8 + v * 2;
            g.fillStyle = nivel.col;
            const r = cw * 0.38;
            g.beginPath();
            g.arc(px + cw / 2, py + cw / 2, r, 0, Math.PI * 2);
            g.fill();
            g.restore();
            ctx.engine.text(nivel.n, px + cw / 2, py + cw / 2 + cw * 0.14, {
              size: Math.round(cw * 0.4), color: '#06060c',
            });
          }
        }

        /* Cursor: la columna donde va a caer la próxima pieza. */
        if (t.vivo) {
          const cx = ox + t.cursor * cw;
          g.save();
          g.globalAlpha = 0.75 + Math.sin(tiempo * 6) * 0.25;
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(cx + cw / 2 - 8, oy - 14);
          g.lineTo(cx + cw / 2 + 8, oy - 14);
          g.lineTo(cx + cw / 2, oy - 3);
          g.closePath();
          g.fill();
          g.restore();
          g.fillStyle = col + '10';
          g.fillRect(cx, oy, cw, FILAS * cw);

          /* Barra de cuándo cae la siguiente. */
          const u = clamp(t.reloj / t.ritmo, 0, 1);
          g.fillStyle = '#ffffff14';
          g.fillRect(ox, oy + FILAS * cw + 10, COLS * cw, 4);
          g.fillStyle = col;
          g.fillRect(ox, oy + FILAS * cw + 10, COLS * cw * u, 4);
        } else {
          ctx.engine.text('TABLERO LLENO', ox + (COLS * cw) / 2, oy + (FILAS * cw) / 2, {
            size: 15, color: '#ff4757',
          });
        }

        if (t.avisoT > 0) {
          ctx.engine.text(t.aviso, ox + (COLS * cw) / 2, oy + FILAS * cw + 34, {
            size: 12.5, color: '#ffd166', font: 'system-ui',
          });
        }
      }

      particles.render(g);

      /* Escalera de niveles: enseña adónde se puede llegar, que es la mitad
         del enganche de estos juegos. */
      const escalaY = H - 26;
      const paso = Math.min(46, W / (NIVELES.length + 2));
      const escalaX = W / 2 - (NIVELES.length * paso) / 2;
      NIVELES.forEach((n, k) => {
        const alcanzado = Math.max(...tableros.map((t) => t.mejorNivel)) >= k + 1;
        g.save();
        g.globalAlpha = alcanzado ? 1 : 0.25;
        g.fillStyle = n.col;
        g.beginPath();
        g.arc(escalaX + k * paso + paso / 2, escalaY, 9, 0, Math.PI * 2);
        g.fill();
        g.restore();
        ctx.engine.text(n.n, escalaX + k * paso + paso / 2, escalaY + 4, {
          size: 11, color: alcanzado ? '#06060c' : '#06060c',
        });
      });
      ctx.engine.text(`fusiona dos iguales · a partir del nivel ${NIVEL_ATAQUE} le cae basura al rival`,
        W / 2, escalaY - 20, { size: 11, color: '#6a6a8c', font: 'system-ui' });
    },
  };
}
