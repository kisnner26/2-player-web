/**
 * Picapedrero — treinta segundos picando, y cada bloque cuesta más que el anterior.
 *
 * A diferencia de un test de clics, aquí el machaque tiene una forma: se ve el
 * bloque agrietarse golpe a golpe y reventar. Eso cambia cómo se juega — no
 * machacas contra un cronómetro abstracto, machacas contra la obsidiana, y
 * cuando quedan dos golpes se aprieta distinto.
 *
 * La dureza sube en cada bloque, así que el marcador no premia solo la
 * velocidad: llegar al diamante exige haber sido rápido antes. El desempate es
 * por golpes dados, para que quedarse a medio bloque también cuente algo.
 */

import { TAU, clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const SEGUNDOS = 30;

/**
 * Los materiales, de blando a imposible. Se repite el último si alguien llega.
 *
 * `claro` es el color del rótulo: escribir el nombre con el color del material
 * dejaba «OBSIDIANA» en negro sobre negro, ilegible justo cuando más épico era.
 */
const MATERIALES = [
  { nombre: 'Tierra', dureza: 4, color: '#8b5a2b', veta: '#6b4420', claro: '#c98a4e' },
  { nombre: 'Madera', dureza: 7, color: '#a9743a', veta: '#7d5227', claro: '#d9a066' },
  { nombre: 'Piedra', dureza: 12, color: '#7d7d86', veta: '#5c5c64', claro: '#b8b8c2' },
  { nombre: 'Hierro', dureza: 19, color: '#b6b0a4', veta: '#8c877d', claro: '#e2ddd2' },
  { nombre: 'Oro', dureza: 27, color: '#e0b429', veta: '#a8851c', claro: '#ffd45c' },
  { nombre: 'Diamante', dureza: 38, color: '#3fd4d8', veta: '#2a9a9d', claro: '#7ef0f3' },
  { nombre: 'Obsidiana', dureza: 55, color: '#2a2036', veta: '#171021', claro: '#a98fd0' },
];

const materialDe = (n) => MATERIALES[Math.min(n, MATERIALES.length - 1)];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  let W = ctx.W, H = ctx.H;
  let turno = 0;
  let fase = 'listo';           // listo | picando | descanso | fin
  let espera = 1.8;
  let reloj = SEGUNDOS;
  let tiempo = 0;

  let indice = 0;               // material actual
  let golpesBloque = 0;
  let sacudida = 0;
  let temblor = 0;              // el bloque vibra al recibir
  const rotos = [[], []];       // materiales rotos por jugador
  const golpes = [0, 0];
  const trozos = [];
  let aviso = '', avisoT = 0;

  const decir = (t, s = 1.6) => { aviso = t; avisoT = s; };

  function reventar() {
    const m = materialDe(indice);
    rotos[turno].push(indice);
    for (let i = 0; i < 26; i++) {
      const a = ctx.rng() * TAU;
      trozos.push({
        x: W / 2, y: H * 0.44,
        vx: Math.cos(a) * (120 + ctx.rng() * 380),
        vy: Math.sin(a) * (120 + ctx.rng() * 380) - 120,
        vida: 0.9, tam: 3 + ctx.rng() * 5,
        col: ctx.rng() < 0.5 ? m.color : m.veta,
      });
    }
    audio.explosion();
    haptics.play('explosion', { player: turno });
    ctx.shake(7, 11);
    ctx.mando?.vibrar?.(turno, 'punto');
    indice++;
    golpesBloque = 0;
    decir(`¡${m.nombre} roto! Ahora ${materialDe(indice).nombre}`, 1.5);
  }

  function picar() {
    if (fase !== 'picando') return;
    const m = materialDe(indice);
    golpesBloque++;
    golpes[turno]++;
    temblor = 1;
    sacudida = Math.min(5, sacudida + 1);

    const resto = m.dureza - golpesBloque;
    // El tono sube según se acerca el reventón: se oye cuánto falta.
    audio.tone({
      freq: 150 + (golpesBloque / m.dureza) * 420,
      dur: 0.04, gain: 0.12, type: 'square', sweep: -40,
    });
    audio.noise({ dur: 0.05, gain: 0.07, filter: 2400 });
    haptics.play('impact', { player: turno, scale: 0.5 });
    ctx.mando?.vibrar?.(turno, 'tecla');

    for (let i = 0; i < 3; i++) {
      const a = ctx.rng() * TAU;
      trozos.push({
        x: W / 2 + (ctx.rng() - 0.5) * 60, y: H * 0.44 + (ctx.rng() - 0.5) * 60,
        vx: Math.cos(a) * (80 + ctx.rng() * 160),
        vy: Math.sin(a) * (80 + ctx.rng() * 160),
        vida: 0.4, tam: 2 + ctx.rng() * 3, col: m.veta,
      });
    }
    if (resto <= 0) reventar();
  }

  function empezarTurno() {
    fase = 'picando';
    reloj = SEGUNDOS;
    indice = 0;
    golpesBloque = 0;
    audio.tone({ freq: 620, dur: 0.14, gain: 0.2, type: 'triangle' });
    for (const i of [0, 1]) {
      ctx.mando?.perfil?.(i, {
        disposicion: 'solo',
        juego: 'Picapedrero',
        pie: i === turno ? '¡Pica!' : 'Espera tu turno',
        controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'PICAR', glifo: '⛏' }] }],
      });
    }
  }

  function acabarTurno() {
    audio.tone({ freq: 220, dur: 0.32, gain: 0.18, type: 'sawtooth', sweep: -80 });
    decir(`${players[turno].name}: ${rotos[turno].length} bloques`, 2.4);
    if (turno === 0) { fase = 'descanso'; espera = 2.8; }
    else { fase = 'fin'; espera = 2.4; }
  }

  function resolver() {
    const a = rotos[0].length, b = rotos[1].length;
    const ganador = a === b
      ? (golpes[0] === golpes[1] ? -1 : (golpes[0] > golpes[1] ? 0 : 1))
      : (a > b ? 0 : 1);
    const masDuro = Math.max(...rotos.flat(), 0);
    ctx.finish({
      winner: ganador,
      scores: [a, b],
      detail: `${golpes[0]} y ${golpes[1]} golpes · lo más duro roto: ${materialDe(masDuro).nombre}`,
      record: ctx.record('bloques', Math.max(a, b), 'high'),
    });
  }

  let soltarTecla = () => {};

  return {
    init() {
      soltarTecla = input.on('KeyL', picar);
      fase = 'listo';
      espera = 1.8;
    },
    destroy() { soltarTecla(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      sacudida = Math.max(0, sacudida - dt * 10);
      temblor = Math.max(0, temblor - dt * 7);
      if (avisoT > 0) avisoT -= dt;
      for (const t of trozos) { t.x += t.vx * dt; t.y += t.vy * dt; t.vy += 900 * dt; t.vida -= dt; }
      for (let i = trozos.length - 1; i >= 0; i--) if (trozos[i].vida <= 0) trozos.splice(i, 1);

      // Solo el botón del iPad: en el teclado pica la L y nada más.
      const j = input.player(turno);
      if (fase === 'picando' && j.conMando && j.pressed('a')) picar();

      if (fase === 'listo') {
        espera -= dt;
        if (espera <= 0) empezarTurno();
      } else if (fase === 'picando') {
        reloj -= dt;
        if (reloj <= 0) { reloj = 0; acabarTurno(); }
      } else if (fase === 'descanso') {
        espera -= dt;
        if (espera <= 0) { turno = 1; fase = 'listo'; espera = 2; }
      } else if (fase === 'fin') {
        espera -= dt;
        if (espera <= 0) resolver();
      }
    },

    render() {
      const g = ctx.c;
      const sx = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      const sy = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      g.save();
      g.translate(sx, sy);

      ctx.engine.clear('#0a0a12');
      // Pared de mina al fondo: bloques oscuros en rejilla.
      const celda = Math.max(28, H * 0.075);
      g.fillStyle = '#12121c';
      for (let y = 0; y < H; y += celda) {
        for (let x = ((y / celda) % 2) * celda * 0.5 - celda; x < W; x += celda) {
          g.fillRect(x + 1, y + 1, celda - 2, celda - 2);
        }
      }

      const m = materialDe(indice);
      const lado = Math.min(W * 0.3, H * 0.34);
      const bx = W / 2 - lado / 2, by = H * 0.44 - lado / 2;
      const tx = temblor ? (ctx.rng() - 0.5) * temblor * 8 : 0;
      const ty = temblor ? (ctx.rng() - 0.5) * temblor * 8 : 0;

      if (fase === 'picando' || fase === 'descanso' || fase === 'fin') {
        g.save();
        g.translate(tx, ty);
        // Cara del bloque, con biselado para que tenga volumen de píxel.
        g.fillStyle = m.color;
        g.fillRect(bx, by, lado, lado);
        g.fillStyle = '#ffffff22';
        g.fillRect(bx, by, lado, lado * 0.08);
        g.fillRect(bx, by, lado * 0.08, lado);
        g.fillStyle = '#00000033';
        g.fillRect(bx, by + lado * 0.92, lado, lado * 0.08);
        g.fillRect(bx + lado * 0.92, by, lado * 0.08, lado);
        // Vetas fijas del material.
        g.fillStyle = m.veta;
        for (let i = 0; i < 14; i++) {
          const r = (i * 2654435761) % 1000 / 1000;
          const r2 = (i * 40503) % 997 / 997;
          g.fillRect(bx + r * lado * 0.82, by + r2 * lado * 0.82, lado * 0.11, lado * 0.11);
        }

        // Grietas: cuantas más, más cerca está de reventar.
        const avance = clamp(golpesBloque / m.dureza, 0, 1);
        const grietas = Math.floor(avance * 9);
        g.strokeStyle = `rgba(0,0,0,${0.35 + avance * 0.5})`;
        g.lineWidth = Math.max(1.5, lado * 0.012);
        for (let i = 0; i < grietas; i++) {
          const a = (i / 9) * TAU + 0.4;
          g.beginPath();
          g.moveTo(W / 2, H * 0.44);
          const largo = lado * (0.2 + ((i * 37) % 10) / 22);
          g.lineTo(W / 2 + Math.cos(a) * largo, H * 0.44 + Math.sin(a) * largo * 0.9);
          g.stroke();
        }
        g.restore();

        ctx.engine.text(m.nombre.toUpperCase(), W / 2, by - 26, { size: 16, color: m.claro, glow: 12 });
        const faltan = Math.max(0, m.dureza - golpesBloque);
        ctx.engine.text(`${faltan} golpes`, W / 2, by + lado + 28,
          { size: 14, color: faltan <= 3 ? '#ff4757' : '#8f8fb0', font: 'system-ui' });
      }

      for (const t of trozos) {
        g.save();
        g.globalAlpha = clamp(t.vida * 1.6, 0, 1);
        g.fillStyle = t.col;
        g.fillRect(t.x, t.y, t.tam, t.tam);
        g.restore();
      }

      /* Fila de bloques rotos del turno: el progreso de un vistazo. */
      const fy = H * 0.82;
      rotos[turno].forEach((k, i) => {
        const mm = materialDe(k);
        const s = Math.min(26, W / 40);
        const x = W / 2 - (rotos[turno].length * (s + 4)) / 2 + i * (s + 4);
        g.fillStyle = mm.color;
        g.fillRect(x, fy, s, s);
        g.fillStyle = '#00000044';
        g.fillRect(x, fy + s * 0.8, s, s * 0.2);
      });

      if (fase === 'picando') {
        ctx.engine.text(reloj.toFixed(1), W / 2, H * 0.12, { size: 30, color: reloj <= 5 ? '#ff4757' : '#f2f2ff' });
        ctx.engine.text(`${rotos[turno].length} bloques · ${golpes[turno]} golpes`, W / 2, H * 0.19,
          { size: 13, color: players[turno].color, font: 'system-ui' });
      } else if (fase === 'listo') {
        ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, W / 2, H * 0.4,
          { size: 24, color: players[turno].color });
        ctx.engine.text('Treinta segundos. Cada bloque es más duro que el anterior.', W / 2, H * 0.48,
          { size: 13, color: '#8f8fb0', font: 'system-ui' });
      }
      if (avisoT > 0) ctx.engine.text(aviso, W / 2, H * 0.72, { size: 15, color: '#ffd166', font: 'system-ui' });

      for (const i of [0, 1]) {
        ctx.engine.text(`${players[i].name} ${rotos[i].length}`, i === 0 ? 18 : W - 18, 26, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      g.restore();
      ctx.engine.text('Machaca la L para picar · gana quien rompa más bloques en 30 segundos',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
