/**
 * Mano de Póker — las cartas en el iPad y las fichas en la mesa grande.
 *
 * Es el único sitio del catálogo donde la información oculta funciona de
 * verdad: cada uno ve sus dos cartas en su mando y nadie más. Las comunitarias
 * salen en la pantalla de la Mac, que es la mesa.
 *
 * Se juega a la versión corta y sin manías: ciega, apuestas por rondas y
 * mostrar. Sin subidas infinitas ni all-in encadenados — se apuesta en pasos
 * fijos para que una mano dure lo que dura una mano de sofá.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const FICHAS = 40;
const CIEGA = 2;
const SUBIDA = 4;
const PALOS = ['♠', '♥', '♦', '♣'];
const VALORES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let mazo = [], manos = [[], []], mesa = [];
  let fichas = [FICHAS, FICHAS], bote = 0, apostado = [0, 0];
  let turno = 0, calle = 0, terminado = false, fase = 'apostando';
  let mensaje = '', espera = 0, t = 0, sb = null, mostrar = false;

  function barajar() {
    mazo = [];
    for (let p = 0; p < 4; p++) for (let v = 0; v < 13; v++) mazo.push({ p, v });
    for (let i = mazo.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [mazo[i], mazo[j]] = [mazo[j], mazo[i]];
    }
  }

  function mandarCartas() {
    for (const j of [0, 1]) {
      const texto = manos[j].map((c) => `${VALORES[c.v]}${PALOS[c.p]}`).join('   ');
      ctx.mando.perfil(j, {
        disposicion: 'pila',
        juego: 'Mano de Póker',
        pie: 'Tus cartas · tápalas',
        controles: [
          { tipo: 'secreto', titulo: 'Tu mano', texto, dato: `fichas: ${fichas[j]} · bote: ${bote}` },
          {
            tipo: 'acciones',
            botones: [
              { a: 'a', etiqueta: 'Igualar/Pasar', glifo: '✓' },
              { a: 'b', etiqueta: `Subir ${SUBIDA}`, glifo: '▲' },
              { a: 'down', etiqueta: 'Retirarse', glifo: '✕' },
            ],
          },
        ],
      });
    }
  }

  function nuevaMano() {
    barajar();
    manos = [[mazo.pop(), mazo.pop()], [mazo.pop(), mazo.pop()]];
    mesa = [];
    bote = CIEGA * 2;
    fichas = fichas.map((f) => f - CIEGA);
    apostado = [CIEGA, CIEGA];
    calle = 0;
    turno = 0;
    fase = 'apostando';
    mostrar = false;
    mensaje = 'Ciegas puestas';
    mandarCartas();
    sb.update(fichas[0], fichas[1]);
  }

  /** Valor de la mejor mano de cinco entre las siete cartas. */
  function valorar(j) {
    const cartas = [...manos[j], ...mesa];
    const cuentaV = {}, cuentaP = {};
    for (const c of cartas) {
      cuentaV[c.v] = (cuentaV[c.v] || 0) + 1;
      cuentaP[c.p] = (cuentaP[c.p] || 0) + 1;
    }
    const grupos = Object.entries(cuentaV).map(([v, n]) => ({ v: +v, n })).sort((a, b) => b.n - a.n || b.v - a.v);
    const color = Object.values(cuentaP).some((n) => n >= 5);
    const vals = [...new Set(cartas.map((c) => c.v))].sort((a, b) => a - b);
    let escalera = 0;
    for (let i = 0; i < vals.length; i++) {
      let largo = 1;
      while (vals.includes(vals[i] + largo)) largo++;
      if (largo >= 5) escalera = vals[i] + largo - 1;
    }
    // As bajo (A-2-3-4-5)
    if (vals.includes(12) && [0, 1, 2, 3].every((v) => vals.includes(v))) escalera = Math.max(escalera, 3);

    let cat = 0;
    if (color && escalera) cat = 8;
    else if (grupos[0].n === 4) cat = 7;
    else if (grupos[0].n === 3 && grupos[1]?.n >= 2) cat = 6;
    else if (color) cat = 5;
    else if (escalera) cat = 4;
    else if (grupos[0].n === 3) cat = 3;
    else if (grupos[0].n === 2 && grupos[1]?.n === 2) cat = 2;
    else if (grupos[0].n === 2) cat = 1;

    const desempate = grupos.slice(0, 5).map((x) => x.v);
    return { cat, desempate, escalera };
  }

  const NOMBRE_MANO = ['carta alta', 'pareja', 'doble pareja', 'trío', 'escalera', 'color', 'full', 'póker', 'escalera de color'];

  function comparar() {
    const a = valorar(0), b = valorar(1);
    if (a.cat !== b.cat) return a.cat > b.cat ? 0 : 1;
    for (let i = 0; i < Math.max(a.desempate.length, b.desempate.length); i++) {
      const x = a.desempate[i] ?? -1, y = b.desempate[i] ?? -1;
      if (x !== y) return x > y ? 0 : 1;
    }
    return -1;
  }

  function repartirCalle() {
    calle++;
    if (calle === 1) mesa.push(mazo.pop(), mazo.pop(), mazo.pop());
    else if (calle <= 3) mesa.push(mazo.pop());
    apostado = [0, 0];
    turno = 0;
    audio.place();
    mandarCartas();
    if (calle > 3) resolver();
  }

  function resolver(retirado = -1) {
    mostrar = true;
    fase = 'mostrando';
    espera = 4;
    let g;
    if (retirado >= 0) { g = 1 - retirado; mensaje = `${players[retirado].name} se retira`; }
    else {
      g = comparar();
      const a = valorar(0), b = valorar(1);
      mensaje = g < 0
        ? `Reparto: ${NOMBRE_MANO[a.cat]} contra ${NOMBRE_MANO[b.cat]}`
        : `${players[g].name} gana con ${NOMBRE_MANO[valorar(g).cat]}`;
    }
    if (g < 0) { fichas[0] += bote / 2; fichas[1] += bote / 2; }
    else {
      fichas[g] += bote;
      audio.win();
      haptics.victory(g);
      particles.burst(W / 2, H * 0.55, 30, { speed: 260, color: players[g].color, size: 5, drag: 0.9 });
    }
    bote = 0;
    sb.update(fichas[0], fichas[1]);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      sb = ui.scoreboard({ center: `${FICHAS} fichas cada uno` });
      nuevaMano();
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      if (fase === 'mostrando') {
        espera -= dt;
        if (espera > 0) return;
        if (fichas[0] <= 0 || fichas[1] <= 0) {
          terminado = true;
          const g = fichas[0] > fichas[1] ? 0 : 1;
          ctx.finish({ winner: g, scores: fichas, detail: `${players[g].name} se queda con todas las fichas` });
          return;
        }
        nuevaMano();
        return;
      }

      const pl = input.player(turno);
      const debe = Math.max(0, apostado[1 - turno] - apostado[turno]);

      if (pl.pressed('down') || pl.pressed('left')) {
        resolver(turno);
        return;
      }
      if (pl.pressed('a')) {
        const paga = Math.min(debe, fichas[turno]);
        fichas[turno] -= paga;
        apostado[turno] += paga;
        bote += paga;
        audio.select();
        haptics.click(turno);
        mandarCartas();
        sb.update(fichas[0], fichas[1]);
        if (apostado[0] === apostado[1] && (turno === 1 || debe > 0)) repartirCalle();
        else turno = 1 - turno;
        return;
      }
      if (pl.pressed('b') || pl.pressed('up')) {
        const paga = Math.min(debe + SUBIDA, fichas[turno]);
        fichas[turno] -= paga;
        apostado[turno] += paga;
        bote += paga;
        mensaje = `${players[turno].name} sube`;
        audio.tone({ freq: 620, dur: 0.1, gain: 0.14, type: 'square' });
        haptics.score(turno);
        mandarCartas();
        sb.update(fichas[0], fichas[1]);
        turno = 1 - turno;
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#08140e');
      const paño = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
      paño.addColorStop(0, '#12442a');
      paño.addColorStop(1, '#05100a');
      g.fillStyle = paño;
      g.fillRect(0, 0, W, H);

      const an = Math.min(96, W * 0.1), al = an * 1.45;
      const pintar = (x, y, c, oculta) => {
        g.save();
        g.shadowColor = '#000a';
        g.shadowBlur = 12;
        g.fillStyle = oculta ? '#2a2050' : '#f6f3ea';
        g.beginPath(); g.roundRect(x - an / 2, y - al / 2, an, al, 8); g.fill();
        g.restore();
        if (!oculta) {
          const rojo = c.p === 1 || c.p === 2;
          const tinta = rojo ? '#d8344f' : '#1c1c28';
          ctx.engine.text(VALORES[c.v], x, y - al * 0.14, { size: an * 0.4, color: tinta, font: 'system-ui' });
          ctx.engine.text(PALOS[c.p], x, y + al * 0.22, { size: an * 0.3, color: tinta, font: 'system-ui' });
        }
      };

      // Comunitarias
      mesa.forEach((c, i) => {
        pintar(W / 2 + (i - (mesa.length - 1) / 2) * (an * 1.1), H * 0.44, c, false);
      });
      if (!mesa.length) {
        ctx.engine.text('mesa vacía · ronda de ciegas', W / 2, H * 0.44, { size: 15, color: '#7aa88a', font: 'system-ui' });
      }

      // Manos: tapadas salvo al mostrar.
      for (const j of [0, 1]) {
        const y = j === 0 ? H * 0.14 : H * 0.78;
        manos[j].forEach((c, i) => {
          pintar(W / 2 + (i - 0.5) * (an * 1.05), y, c, !mostrar);
        });
        ctx.engine.text(`${players[j].name} · ${fichas[j]} fichas${apostado[j] ? ` · apostado ${apostado[j]}` : ''}`,
          W / 2, y + (j === 0 ? -al * 0.72 : al * 0.72), {
            size: 13, color: turno === j && fase === 'apostando' ? '#ffd166' : players[j].color, font: 'system-ui',
          });
      }

      ctx.engine.text(`BOTE ${bote}`, W / 2, H * 0.3, { size: 22, color: '#ffd166', glow: 10 });
      ctx.engine.text(mensaje, W / 2, H * 0.6, { size: 15, color: '#c9e0d0', font: 'system-ui' });
      if (fase === 'apostando') {
        const debe = Math.max(0, apostado[1 - turno] - apostado[turno]);
        ctx.engine.text(debe ? `${players[turno].name}: debes ${debe} para seguir` : `${players[turno].name}: puedes pasar o subir`,
          W / 2, H * 0.65, { size: 13, color: players[turno].color, font: 'system-ui' });
      }

      particles.render(g);
      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita dos mandos táctiles: las cartas son secretas · Menú → Mandos',
          W / 2, H - 12, { size: 12, color: '#ffd166', font: 'system-ui' });
      } else {
        ctx.engine.text('Tu tecla iguala o pasa · la especial sube · abajo te retiras',
          W / 2, H - 12, { size: 11, color: '#5a7a68', font: 'system-ui' });
      }
    },
  };
}
