/**
 * La Casa de los Winters — homenaje a Ethan Winters, para dos.
 *
 * Todo es original (arte y mecánicas generados por código), pero los guiños
 * son deliberados: una casa a oscuras que hay que recorrer con linterna, tres
 * llaves para salir, frascos de líquido curativo, algo que patrulla los
 * pasillos, y sobre todo LA MANO — al personaje se le destroza una mano y no
 * puede arreglársela solo.
 *
 * Esa es la mecánica que convierte el homenaje en un juego de dos de verdad:
 * quien pierde la mano se queda medio inútil (más lento, sin poder cargar
 * llaves ni usar puertas) hasta que el otro llegue, se agache a su lado y le
 * grape la mano. No hay forma de curarse solo. Si los dos caen, se acabó.
 *
 * La linterna gasta pila. Encenderla te deja ver, pero también te delata: el
 * anfitrión va hacia la luz. Ahí está la tensión de todo el juego.
 */

import { TAU, clamp, angleDiff } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe, pasoAnimado } from '../../core/personaje.js';

export const meta = { render: 'canvas' };

const T = 40;                   // lado de celda
const VEL = 168;
const VEL_HERIDO = 96;
const PILA_MAX = 100;
const GASTO_PILA = 7.2;         // por segundo con la linterna encendida
const RECARGA_PILA = 3.4;       // por segundo con la linterna apagada
const GRAPAR_SEG = 1.6;         // cuánto hay que aguantar para coser la mano
const LLAVES = 3;

/* La casa: # muro, . suelo, S salida, k llave, f frasco, p/q inicios.
   Pasillos estrechos a propósito: cruzarse con el anfitrión tiene que doler. */
const MAPA = [
  '######################',
  '#p......#.....#....k.#',
  '#.####..#.###.#.####.#',
  '#.#..#..#...#.#.#....#',
  '#.#..####.#.#.#.#.####',
  '#.#.......#.#...#....#',
  '#.#####.###.#####.##.#',
  '#.....#.#.......#..#.#',
  '####f.#.#.#####.#..#.#',
  '#...#.#.#.#...#.#..#k#',
  '#.#.#.#.#.#.#.#.####.#',
  '#.#...#...#.#........#',
  '#.#########.########.#',
  '#..........#.......#.#',
  '#.########.#.#####.#.#',
  '#k#......#.#.....#...#',
  '#.#.####.#.#####.#####',
  '#...#..#.......#....q#',
  '###.#..#######.#.###.#',
  '#f..#........#.#...#.#',
  '#####.######.#.###.#.#',
  '#........S.#...#.....#',
  '######################',
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let mapa = [], cols = 0, filas = 0, offX = 0, offY = 0, celda = T;
  let llaves = [], frascos = [], salida = { x: 0, y: 0 };
  let recogidas = 0;
  let tiempo = 0;
  let estado = 'jugando';        // jugando | fin
  let aviso = '';
  let avisoT = 0;
  let latido = 0;                // sube cuando el anfitrión está cerca

  const her = [0, 1].map((i) => ({
    i, x: 0, y: 0, sx: 0, sy: 0, vx: 0, vy: 0,
    mira: 0, linterna: false, pila: PILA_MAX,
    herido: false, grapando: 0, curas: 0,
    fase: 0,
  }));

  const anfitrion = { x: 0, y: 0, ang: 0, vel: 74, objetivo: null, gruñido: 0 };

  const decir = (t, d = 2.6) => { aviso = t; avisoT = d; };

  const celdaEn = (px, py) => {
    const cx = Math.floor((px - offX) / celda);
    const cy = Math.floor((py - offY) / celda);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= filas) return '#';
    return mapa[cy][cx];
  };
  const solido = (c) => c === '#';
  const chocaEn = (px, py, r = 11) =>
    solido(celdaEn(px - r, py - r)) || solido(celdaEn(px + r, py - r)) ||
    solido(celdaEn(px - r, py + r)) || solido(celdaEn(px + r, py + r));

  function medir() {
    const margen = 24;
    celda = Math.max(12, Math.floor(Math.min(
      (W - margen * 2) / cols,
      (H - margen * 2 - 40) / filas,
      T,
    )));
    offX = Math.floor((W - cols * celda) / 2);
    offY = Math.floor((H - filas * celda) / 2) + 16;
  }

  const centro = (cx, cy) => [offX + cx * celda + celda / 2, offY + cy * celda + celda / 2];

  function cargar() {
    filas = MAPA.length;
    cols = MAPA[0].length;
    mapa = MAPA.map((f) => f.split(''));
    llaves = [];
    frascos = [];
    for (let y = 0; y < filas; y++) {
      for (let x = 0; x < cols; x++) {
        const c = mapa[y][x];
        if (c === 'k') llaves.push({ x, y, tomada: false });
        else if (c === 'f') frascos.push({ x, y, tomado: false });
        else if (c === 'S') salida = { x, y };
        else if (c === 'p') { her[0].sx = x; her[0].sy = y; }
        else if (c === 'q') { her[1].sx = x; her[1].sy = y; }
      }
    }
    medir();
    for (const h of her) {
      const [px, py] = centro(h.sx, h.sy);
      h.x = px; h.y = py;
    }
    // El anfitrión empieza lejos de los dos, en el centro de la casa.
    const [ax, ay] = centro(Math.floor(cols / 2), Math.floor(filas / 2));
    anfitrion.x = ax;
    anfitrion.y = ay;
  }

  function herir(h) {
    if (h.herido || estado !== 'jugando') return;
    h.herido = true;
    h.linterna = false;
    audio.explosion();
    haptics.explosion(h.i);
    ctx.shake(10, 14);
    ctx.mando?.vibrar?.(h.i, 'golpe');
    particles.burst(h.x, h.y, 26, {
      speed: 230, dir: -Math.PI / 2, spread: TAU,
      color: '#a3121f', size: 3, shape: 'spark', drag: 0.9,
    });
    decir(`¡La mano de ${players[h.i].name}! Que le grapen`, 3.4);

    if (her.every((x) => x.herido)) {
      estado = 'fin';
      ctx.record('winters', Math.floor(tiempo), 'max');
      ctx.finish({
        winner: -1,
        titulo: 'Los dos caísteis',
        detalle: `${recogidas} de ${LLAVES} llaves · ${Math.floor(tiempo)} s dentro`,
      });
    }
  }

  function escapar() {
    estado = 'fin';
    audio.win();
    haptics.victory(0);
    ctx.record('winters-escape', Math.floor(tiempo), 'min');
    ctx.finish({
      winner: -1,
      titulo: 'Salisteis de la casa',
      detalle: `${Math.floor(tiempo)} s · ${her.reduce((a, h) => a + h.curas, 0)} manos grapadas`,
    });
  }

  return {
    init() {
      cargar();
      decir('Tres llaves y la puerta del fondo. La linterna os delata.', 4);
    },
    resize(w, h) {
      const antes = her.map((x) => ({ cx: (x.x - offX) / celda, cy: (x.y - offY) / celda }));
      const ant = { cx: (anfitrion.x - offX) / celda, cy: (anfitrion.y - offY) / celda };
      W = w; H = h;
      medir();
      her.forEach((x, i) => { x.x = offX + antes[i].cx * celda; x.y = offY + antes[i].cy * celda; });
      anfitrion.x = offX + ant.cx * celda;
      anfitrion.y = offY + ant.cy * celda;
    },

    update(dt) {
      if (estado !== 'jugando') return;
      tiempo += dt;
      avisoT = Math.max(0, avisoT - dt);
      anfitrion.gruñido = Math.max(0, anfitrion.gruñido - dt);

      /* --- Supervivientes --- */
      for (const h of her) {
        const p = input.player(h.i);
        const vel = h.herido ? VEL_HERIDO : VEL;
        const dx = p.x, dy = p.y;
        if (dx || dy) h.mira = Math.atan2(dy, dx);

        const nx = h.x + dx * vel * dt;
        if (!chocaEn(nx, h.y)) h.x = nx;
        const ny = h.y + dy * vel * dt;
        if (!chocaEn(h.x, ny)) h.y = ny;
        h.vx = dx * vel;
        h.vy = dy * vel;

        /* Linterna: alterna con B y gasta pila. Es el recurso central. */
        if (p.pressed('b') && !h.herido) {
          h.linterna = !h.linterna;
          audio.blip();
          ctx.mando?.vibrar?.(h.i, 'tecla');
        }
        if (h.linterna) {
          h.pila = clamp(h.pila - GASTO_PILA * dt, 0, PILA_MAX);
          if (h.pila <= 0) { h.linterna = false; decir(`${players[h.i].name} se queda sin pila`, 2); }
        } else {
          h.pila = clamp(h.pila + RECARGA_PILA * dt, 0, PILA_MAX);
        }

        /* Grapar al compañero: hay que estar al lado y AGUANTAR pulsado.
           Que cueste tiempo es lo que lo vuelve una decisión y no un trámite:
           mientras coses, los dos estáis quietos y a merced de lo que ronde. */
        const otro = her[1 - h.i];
        const cerca = Math.hypot(h.x - otro.x, h.y - otro.y) < celda * 1.1;
        if (otro.herido && cerca && !h.herido && p.held('a')) {
          h.grapando += dt;
          if (h.grapando >= GRAPAR_SEG) {
            otro.herido = false;
            otro.pila = Math.max(otro.pila, 45);
            h.grapando = 0;
            h.curas++;
            audio.tone({ freq: 300, dur: 0.22, gain: 0.18, type: 'square', sweep: 260 });
            haptics.play('score', { player: h.i });
            ctx.mando?.vibrar?.(otro.i, 'punto');
            particles.burst(otro.x, otro.y, 18, {
              speed: 170, dir: -Math.PI / 2, spread: TAU, color: '#a8ff3e', size: 2.6, drag: 0.9,
            });
            decir(`${players[h.i].name} le grapa la mano a ${players[otro.i].name}`, 2.6);
          }
        } else {
          h.grapando = 0;
        }

        /* Recoger llaves y frascos. Con la mano rota no puedes cargar nada. */
        if (h.herido) continue;
        for (const k of llaves) {
          if (k.tomada) continue;
          const [kx, ky] = centro(k.x, k.y);
          if (Math.hypot(h.x - kx, h.y - ky) > celda * 0.7) continue;
          k.tomada = true;
          recogidas++;
          audio.pickup();
          haptics.play('click', { player: h.i });
          ctx.mando?.vibrar?.(h.i, 'punto');
          decir(`Llave ${recogidas} de ${LLAVES}`, 2.2);
        }
        for (const f of frascos) {
          if (f.tomado) continue;
          const [fx, fy] = centro(f.x, f.y);
          if (Math.hypot(h.x - fx, h.y - fy) > celda * 0.7) continue;
          f.tomado = true;
          h.pila = PILA_MAX;
          audio.pickup();
          decir('Frasco: pila al máximo', 2);
        }

        /* Salida: solo con las tres llaves y con los dos allí. */
        const [sx, sy] = centro(salida.x, salida.y);
        const enSalida = Math.hypot(h.x - sx, h.y - sy) < celda * 0.8;
        const otroEnSalida = Math.hypot(otro.x - sx, otro.y - sy) < celda * 0.8;
        if (enSalida && otroEnSalida && recogidas >= LLAVES && !otro.herido) {
          escapar();
          return;
        }
        if (enSalida && recogidas < LLAVES && avisoT <= 0) {
          decir(`Faltan ${LLAVES - recogidas} llaves`, 1.6);
        }
      }

      /* --- El anfitrión ---
         Va hacia la luz. Si nadie alumbra, patrulla hacia el más cercano,
         pero mucho más despacio: apagar la linterna es esconderse. */
      const conLuz = her.filter((h) => h.linterna && !h.herido);
      let objetivo = null;
      let prisa = 0.55;
      if (conLuz.length) {
        objetivo = conLuz.reduce((a, b) =>
          Math.hypot(a.x - anfitrion.x, a.y - anfitrion.y) < Math.hypot(b.x - anfitrion.x, b.y - anfitrion.y) ? a : b);
        prisa = 1;
      } else {
        objetivo = her.reduce((a, b) =>
          Math.hypot(a.x - anfitrion.x, a.y - anfitrion.y) < Math.hypot(b.x - anfitrion.x, b.y - anfitrion.y) ? a : b);
      }
      anfitrion.objetivo = objetivo;

      const deseado = Math.atan2(objetivo.y - anfitrion.y, objetivo.x - anfitrion.x);
      anfitrion.ang += angleDiff(anfitrion.ang, deseado) * Math.min(1, dt * 2.4);
      const av = anfitrion.vel * prisa * (1 + tiempo / 150);
      const ax = anfitrion.x + Math.cos(anfitrion.ang) * av * dt;
      const ay = anfitrion.y + Math.sin(anfitrion.ang) * av * dt;
      if (!chocaEn(ax, anfitrion.y, 13)) anfitrion.x = ax;
      else anfitrion.ang += 1.1;                     // rebota por los pasillos
      if (!chocaEn(anfitrion.x, ay, 13)) anfitrion.y = ay;
      else anfitrion.ang -= 1.1;

      /* Latido: la señal de que está cerca aunque no lo veas. */
      const dist = Math.min(...her.map((h) => Math.hypot(h.x - anfitrion.x, h.y - anfitrion.y)));
      latido = clamp(1 - dist / (celda * 7), 0, 1);
      if (latido > 0.55 && anfitrion.gruñido <= 0) {
        anfitrion.gruñido = 1.6;
        audio.tone({ freq: 70 + latido * 40, dur: 0.5, gain: 0.1 * latido, type: 'sawtooth', sweep: -20 });
        for (const h of her) ctx.mando?.vibrar?.(h.i, 'aviso');
      }

      for (const h of her) {
        if (!h.herido && Math.hypot(h.x - anfitrion.x, h.y - anfitrion.y) < celda * 0.62) herir(h);
      }
    },

    render() {
      const g = ctx.c;
      g.fillStyle = '#04030a';
      g.fillRect(0, 0, W, H);

      /* La casa solo se ve donde hay luz. Se dibuja todo y luego se tapa con
         una capa de oscuridad a la que se le abren agujeros: es lo que hace
         que la linterna se sienta como una linterna y no como un adorno. */
      g.save();

      // Suelo y muros (se pintan enteros; la oscuridad los ocultará)
      for (let y = 0; y < filas; y++) {
        for (let x = 0; x < cols; x++) {
          const px = offX + x * celda, py = offY + y * celda;
          if (mapa[y][x] === '#') {
            g.fillStyle = '#241d2e';
            g.fillRect(px, py, celda, celda);
            g.strokeStyle = '#3b3049';
            g.lineWidth = 1;
            g.strokeRect(px + 0.5, py + 0.5, celda - 1, celda - 1);
          } else {
            g.fillStyle = '#120e1b';
            g.fillRect(px, py, celda, celda);
          }
        }
      }

      // Salida
      const [sx, sy] = centro(salida.x, salida.y);
      const abierta = recogidas >= LLAVES;
      g.strokeStyle = abierta ? '#a8ff3e' : '#6b5a2a';
      g.lineWidth = 3;
      g.strokeRect(sx - celda * 0.34, sy - celda * 0.42, celda * 0.68, celda * 0.84);
      g.fillStyle = abierta ? '#a8ff3e22' : '#00000000';
      g.fillRect(sx - celda * 0.34, sy - celda * 0.42, celda * 0.68, celda * 0.84);

      // Llaves y frascos
      for (const k of llaves) {
        if (k.tomada) continue;
        const [kx, ky] = centro(k.x, k.y);
        g.save();
        g.shadowColor = '#ffd166';
        g.shadowBlur = 12;
        g.fillStyle = '#ffd166';
        g.beginPath();
        g.arc(kx, ky - 3, celda * 0.13, 0, TAU);
        g.fill();
        g.fillRect(kx - 1.5, ky - 2, 3, celda * 0.26);
        g.fillRect(kx - 1.5, ky + celda * 0.16, celda * 0.12, 2.5);
        g.restore();
      }
      for (const f of frascos) {
        if (f.tomado) continue;
        const [fx, fy] = centro(f.x, f.y);
        g.save();
        g.shadowColor = '#3effc8';
        g.shadowBlur = 10;
        g.fillStyle = '#3effc8';
        g.fillRect(fx - celda * 0.1, fy - celda * 0.16, celda * 0.2, celda * 0.32);
        g.restore();
      }

      particles.render(g);

      /* El anfitrión */
      g.save();
      g.translate(anfitrion.x, anfitrion.y);
      g.rotate(anfitrion.ang + Math.PI / 2);
      g.shadowColor = '#a3121f';
      g.shadowBlur = 18;
      g.fillStyle = '#2b1016';
      g.beginPath();
      g.ellipse(0, 0, celda * 0.3, celda * 0.4, 0, 0, TAU);
      g.fill();
      g.strokeStyle = '#a3121f';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#ff4757';
      g.beginPath();
      g.arc(-celda * 0.1, -celda * 0.12, 2.6, 0, TAU);
      g.arc(celda * 0.1, -celda * 0.12, 2.6, 0, TAU);
      g.fill();
      g.restore();

      /* Supervivientes */
      for (const h of her) {
        const anim = pasoAnimado(h, { vx: h.vx, suelo: true, dt: 1 / 60 });
        dibujarPersonaje(g, personajeDe(players[h.i], h.i), h.x, h.y + celda * 0.4, celda * 1.15, {
          ...anim,
          acento: players[h.i].color,
          brillo: h.linterna ? 16 : 6,
          alpha: h.herido ? 0.75 : 1,
        });
        if (h.herido) {
          // Muñón marcado en rojo: se ve de lejos quién necesita ayuda.
          g.save();
          g.globalAlpha = 0.55 + Math.sin(tiempo * 8) * 0.45;
          g.fillStyle = '#ff4757';
          g.beginPath();
          g.arc(h.x + celda * 0.22, h.y, 4.5, 0, TAU);
          g.fill();
          g.restore();
        }
        if (h.grapando > 0) {
          const u = h.grapando / GRAPAR_SEG;
          g.strokeStyle = '#a8ff3e';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(h.x, h.y - celda * 0.6, 12, -Math.PI / 2, -Math.PI / 2 + TAU * u);
          g.stroke();
        }
      }

      g.restore();

      /* La oscuridad va encima de todo lo dibujado: una capa negra con los
         huecos de las linternas recortados. El HUD se pinta después, para
         que siempre se lea. */
      pintarOscuridad(g);

      /* HUD */
      for (const h of her) {
        const x = h.i === 0 ? W * 0.14 : W * 0.86;
        ctx.engine.text(players[h.i].name, x, 24, { size: 12, color: players[h.i].color, font: 'system-ui' });
        // Pila
        g.fillStyle = '#ffffff14';
        g.fillRect(x - 44, 32, 88, 7);
        g.fillStyle = h.pila < 25 ? '#ff4757' : '#ffd166';
        g.fillRect(x - 44, 32, 88 * (h.pila / PILA_MAX), 7);
        ctx.engine.text(h.herido ? 'MANO DESTROZADA' : (h.linterna ? 'linterna encendida' : 'a oscuras'),
          x, 52, { size: 10.5, color: h.herido ? '#ff4757' : '#6a6a8c', font: 'system-ui' });
      }
      ctx.engine.text(`${recogidas} / ${LLAVES} llaves`, W / 2, 28, { size: 14, color: '#ffd166' });
      ctx.engine.text(`${Math.floor(tiempo)} s`, W / 2, 48, { size: 11, color: '#5a5a78', font: 'system-ui' });

      if (avisoT > 0) {
        ctx.engine.text(aviso, W / 2, H - 20, { size: 14, color: '#ffd166', font: 'system-ui' });
      }

      /* Aviso rojo cuando el anfitrión está encima: el jugador no siempre
         puede verlo, pero tiene que poder sentirlo. */
      if (latido > 0.2) {
        g.save();
        g.globalAlpha = latido * (0.35 + Math.sin(tiempo * 9) * 0.25);
        g.strokeStyle = '#a3121f';
        g.lineWidth = 14;
        g.strokeRect(7, 7, W - 14, H - 14);
        g.restore();
      }
    },
  };

  /**
   * Cubre la casa de negro y abre huecos donde hay luz.
   *
   * Se hace sobre un canvas aparte porque `destination-out` sobre el canvas
   * del juego borraría también el suelo y los muros ya pintados.
   */
  function pintarOscuridad(g) {
    if (!pintarOscuridad.lienzo) pintarOscuridad.lienzo = document.createElement('canvas');
    const off = pintarOscuridad.lienzo;
    if (off.width !== W || off.height !== H) { off.width = W; off.height = H; }
    const o = off.getContext('2d');

    o.globalCompositeOperation = 'source-over';
    o.fillStyle = 'rgba(2,1,6,0.96)';
    o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'destination-out';

    for (const h of her) {
      // Aura mínima: siempre se ve un palmo alrededor, aunque estés a oscuras.
      const aura = o.createRadialGradient(h.x, h.y, 0, h.x, h.y, celda * 1.5);
      aura.addColorStop(0, 'rgba(0,0,0,0.95)');
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = aura;
      o.beginPath();
      o.arc(h.x, h.y, celda * 1.5, 0, TAU);
      o.fill();

      if (!h.linterna) continue;
      // Cono de linterna hacia donde mira.
      const largo = celda * 7.5;
      const abertura = 0.52;
      const cono = o.createRadialGradient(h.x, h.y, celda * 0.3, h.x, h.y, largo);
      cono.addColorStop(0, 'rgba(0,0,0,1)');
      cono.addColorStop(0.55, 'rgba(0,0,0,0.85)');
      cono.addColorStop(1, 'rgba(0,0,0,0)');
      o.fillStyle = cono;
      o.beginPath();
      o.moveTo(h.x, h.y);
      o.arc(h.x, h.y, largo, h.mira - abertura, h.mira + abertura);
      o.closePath();
      o.fill();
    }

    g.drawImage(off, 0, 0);
  }
}
