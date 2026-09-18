/**
 * Espías — deducción con pistas que el rival no puede leer.
 *
 * Por qué necesita mando: cada jugador recibe una pista distinta sobre el
 * mismo topo, y la gracia está en que el otro NO la vea. En una pantalla
 * compartida eso es imposible sin taparla con la mano; en una Touch Bar, sin
 * sitio. Con un iPad cada uno, la información privada es natural.
 *
 * Sobre la mesa hay dieciséis sospechosos: cada uno con forma, color y número.
 * Uno es el topo. A cada jugador le llegan dos pistas ciertas y distintas, así
 * que ninguno puede resolverlo solo de inmediato: hay que arriesgarse antes
 * que el otro, o esperar a la siguiente pista y llegar tarde.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas' };

const COLS = 4;
const FILAS = 4;
const TOTAL = COLS * FILAS;
const RONDAS = 5;
const CADA_PISTA = 7;          // segundos entre pistas nuevas

const FORMAS = ['círculo', 'cuadrado', 'triángulo', 'rombo'];
const TONOS = [
  { nombre: 'rojo', hex: '#ff4757' },
  { nombre: 'azul', hex: '#5b8cff' },
  { nombre: 'verde', hex: '#a8ff3e' },
  { nombre: 'dorado', hex: '#ffd166' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let cartas = [];
  let topo = 0;
  let ronda = 0;
  let marcador = [0, 0];
  const mira = [0, 3];           // casilla enfocada por cada jugador
  const bloqueo = [0, 0];        // penalización tras fallar
  let pistasDadas = [[], []];
  let relojPista = 0;
  let estado = 'jugando';        // jugando | revelado
  let pausa = 0;
  let aviso = '';
  let avisoT = 0;
  let tiempo = 0;

  const decir = (t) => { aviso = t; avisoT = 2.6; };

  /** Baraja los dieciséis sospechosos y elige al topo. */
  function repartir() {
    cartas = [];
    for (let i = 0; i < TOTAL; i++) {
      cartas.push({
        forma: Math.floor(ctx.rng() * FORMAS.length),
        tono: Math.floor(ctx.rng() * TONOS.length),
        numero: 1 + Math.floor(ctx.rng() * 9),
      });
    }
    topo = Math.floor(ctx.rng() * TOTAL);
  }

  /**
   * Frases ciertas sobre el topo. Se generan a partir de la carta real, así
   * que nunca mienten: la dificultad viene de que cada pista sola no basta.
   */
  function pistasPosibles() {
    const c = cartas[topo];
    const fila = Math.floor(topo / COLS) + 1;
    const col = (topo % COLS) + 1;
    return [
      `Es ${FORMAS[c.forma]}`,
      `Es de color ${TONOS[c.tono].nombre}`,
      c.numero % 2 === 0 ? 'Su número es par' : 'Su número es impar',
      `Su número es ${c.numero > 5 ? 'mayor' : 'menor o igual'} que 5`,
      `Está en la fila ${fila}`,
      `Está en la columna ${col}`,
      `${col <= 2 ? 'Está en la mitad izquierda' : 'Está en la mitad derecha'}`,
      `${fila <= 2 ? 'Está en la mitad de arriba' : 'Está en la mitad de abajo'}`,
    ].sort(() => ctx.rng() - 0.5);
  }

  let bolsa = [];

  /** Entrega una pista nueva, distinta para cada jugador. */
  function repartirPista(inicial = false) {
    for (const i of [0, 1]) {
      if (!bolsa.length) return;
      const p = bolsa.pop();
      pistasDadas[i].push(p);
      ctx.mando.vibrar(i, 'toque');
    }
    if (!inicial) decir('Pista nueva en los mandos');
    refrescarMandos();
  }

  /** Cada mando enseña SOLO sus pistas. Aquí está toda la gracia del juego. */
  function refrescarMandos() {
    for (const i of [0, 1]) {
      ctx.mando.perfil(i, {
        disposicion: 'pila',
        juego: 'Espías',
        pie: 'No se lo enseñes al otro',
        controles: [
          {
            tipo: 'secreto',
            titulo: `Tus pistas · ronda ${ronda + 1}`,
            texto: pistasDadas[i].join(' · '),
            dato: `${pistasDadas[i].length} de ${Math.ceil(bolsa.length / 2) + pistasDadas[i].length}`,
          },
          {
            tipo: 'acciones',
            botones: [
              { a: 'left', glifo: '◀' }, { a: 'right', glifo: '▶' },
              { a: 'up', glifo: '▲' }, { a: 'down', glifo: '▼' },
            ],
          },
          { tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Acusar', glifo: '!' }] },
        ],
      });
    }
  }

  function nuevaRonda() {
    repartir();
    pistasDadas = [[], []];
    bolsa = pistasPosibles();
    mira[0] = 0;
    mira[1] = TOTAL - 1;
    bloqueo[0] = bloqueo[1] = 0;
    relojPista = 0;
    estado = 'jugando';
    repartirPista(true);
    repartirPista(true);
    decir(`Ronda ${ronda + 1}: ¿quién es el topo?`);
  }

  function acusar(i) {
    if (bloqueo[i] > 0 || estado !== 'jugando') return;
    if (mira[i] === topo) {
      marcador[i]++;
      estado = 'revelado';
      pausa = 2.6;
      audio.win();
      haptics.play('score', { player: i });
      ctx.mando.vibrar(i, 'punto');
      ctx.mando.vibrar(1 - i, 'error');
      decir(`¡${players[i].name} lo encontró!`);
      const [cx, cy] = centroDe(topo);
      particles.burst(cx, cy, 30, {
        speed: 260, dir: -Math.PI / 2, spread: TAU,
        color: players[i].color, size: 3, shape: 'spark', drag: 0.9,
      });
    } else {
      // Fallar cuesta: si no, se acusaría a lo loco hasta acertar.
      bloqueo[i] = 2.4;
      audio.error();
      haptics.play('impact', { player: i });
      ctx.mando.vibrar(i, 'error');
      ctx.shake(4, 5);
      decir(`${players[i].name} falló · bloqueado 2s`);
    }
  }

  function centroDe(indice) {
    const lado = Math.min(W * 0.82, H * 0.66);
    const cw = lado / COLS;
    const ox = W / 2 - lado / 2, oy = H / 2 - lado / 2 + 14;
    return [ox + (indice % COLS) * cw + cw / 2, oy + Math.floor(indice / COLS) * cw + cw / 2];
  }

  return {
    init() { nuevaRonda(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      avisoT = Math.max(0, avisoT - dt);

      if (estado === 'revelado') {
        pausa -= dt;
        if (pausa <= 0) {
          ronda++;
          if (ronda >= RONDAS) {
            ctx.finish({
              winner: marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1),
              scores: marcador,
            });
            return;
          }
          nuevaRonda();
        }
        return;
      }

      relojPista += dt;
      if (relojPista >= CADA_PISTA && bolsa.length) {
        relojPista = 0;
        repartirPista();
      }

      for (const i of [0, 1]) {
        bloqueo[i] = Math.max(0, bloqueo[i] - dt);
        if (bloqueo[i] > 0) continue;
        const p = input.player(i);
        const col = mira[i] % COLS, fila = Math.floor(mira[i] / COLS);
        if (p.pressed('left') && col > 0) { mira[i]--; audio.blip(); }
        if (p.pressed('right') && col < COLS - 1) { mira[i]++; audio.blip(); }
        if (p.pressed('up') && fila > 0) { mira[i] -= COLS; audio.blip(); }
        if (p.pressed('down') && fila < FILAS - 1) { mira[i] += COLS; audio.blip(); }
        if (p.pressed('a')) acusar(i);
      }
    },

    render() {
      const g = ctx.c;
      g.fillStyle = '#05050a';
      g.fillRect(0, 0, W, H);

      const lado = Math.min(W * 0.82, H * 0.66);
      const cw = lado / COLS;
      const ox = W / 2 - lado / 2, oy = H / 2 - lado / 2 + 14;

      for (let i = 0; i < TOTAL; i++) {
        const x = ox + (i % COLS) * cw;
        const y = oy + Math.floor(i / COLS) * cw;
        const c = cartas[i];
        const esTopo = estado === 'revelado' && i === topo;

        g.fillStyle = esTopo ? '#ffffff18' : '#ffffff09';
        g.fillRect(x + 3, y + 3, cw - 6, cw - 6);
        g.strokeStyle = esTopo ? '#a8ff3e' : '#ffffff1a';
        g.lineWidth = esTopo ? 3 : 1;
        g.strokeRect(x + 3, y + 3, cw - 6, cw - 6);

        // Símbolo del sospechoso
        const cx = x + cw / 2, cy = y + cw / 2 - cw * 0.06;
        const r = cw * 0.2;
        g.fillStyle = TONOS[c.tono].hex;
        g.save();
        g.shadowColor = TONOS[c.tono].hex;
        g.shadowBlur = esTopo ? 20 : 8;
        g.beginPath();
        if (FORMAS[c.forma] === 'círculo') g.arc(cx, cy, r, 0, TAU);
        else if (FORMAS[c.forma] === 'cuadrado') g.rect(cx - r, cy - r, r * 2, r * 2);
        else if (FORMAS[c.forma] === 'triángulo') {
          g.moveTo(cx, cy - r); g.lineTo(cx + r, cy + r); g.lineTo(cx - r, cy + r);
        } else {
          g.moveTo(cx, cy - r); g.lineTo(cx + r, cy); g.lineTo(cx, cy + r); g.lineTo(cx - r, cy);
        }
        g.closePath();
        g.fill();
        g.restore();

        ctx.engine.text(String(c.numero), cx, y + cw - cw * 0.16, { size: Math.max(11, cw * 0.16), color: '#ffffffcc' });
      }

      // Miras: la de cada jugador, en su color. Se dibujan por fuera de la
      // casilla y con grosor distinto para que dos miras en la misma casilla
      // sigan viéndose las dos.
      for (const i of [0, 1]) {
        const x = ox + (mira[i] % COLS) * cw;
        const y = oy + Math.floor(mira[i] / COLS) * cw;
        const d = i === 0 ? 0 : 4;
        g.save();
        g.strokeStyle = players[i].color;
        g.lineWidth = 2.5;
        g.globalAlpha = bloqueo[i] > 0 ? 0.25 + Math.sin(tiempo * 22) * 0.15 : 1;
        g.shadowColor = players[i].color;
        g.shadowBlur = 12;
        g.strokeRect(x - d, y - d, cw + d * 2, cw + d * 2);
        g.restore();
      }

      particles.render(g);

      /* --- HUD --- */
      ctx.engine.text(`Ronda ${Math.min(ronda + 1, RONDAS)} de ${RONDAS}`, W / 2, 26, { size: 13, color: '#ffffff' });
      ctx.engine.text('Las pistas están en tu mando', W / 2, 46, { size: 11.5, color: '#8f8fb0', font: 'system-ui' });

      for (const i of [0, 1]) {
        const x = i === 0 ? W * 0.14 : W * 0.86;
        ctx.engine.text(players[i].name, x, oy - 26, { size: 12, color: players[i].color, font: 'system-ui' });
        ctx.engine.text(String(marcador[i]), x, oy - 4, { size: 22, color: players[i].color });
        if (bloqueo[i] > 0) {
          ctx.engine.text(`bloqueado ${bloqueo[i].toFixed(1)}s`, x, oy + 16, { size: 10.5, color: '#ff4757', font: 'system-ui' });
        } else {
          ctx.engine.text(`${pistasDadas[i].length} pistas`, x, oy + 16, { size: 10.5, color: '#8f8fb0', font: 'system-ui' });
        }
      }

      // Cuenta atrás de la próxima pista: crea la tensión de arriesgar ahora
      // o esperar a saber más y llegar tarde.
      if (estado === 'jugando' && bolsa.length) {
        const falta = Math.max(0, CADA_PISTA - relojPista);
        ctx.engine.text(`Pista nueva en ${falta.toFixed(0)}s`, W / 2, oy + lado + 26,
          { size: 12, color: '#ffd166', font: 'system-ui' });
      }
      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, oy + lado + 48, { size: 15, color: '#ffd166', font: 'system-ui' });
      }
      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita dos mandos táctiles · Menú → Mandos',
          W / 2, H - 20, { size: 13, color: '#ffd166', font: 'system-ui' });
      }
    },
  };
}
