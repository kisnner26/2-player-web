/**
 * Puño de Hierro — torneo de machaque por turnos contra parejas rivales.
 *
 * Los dos jugáis en el MISMO equipo contra parejas controladas por la
 * máquina, y subís por un cuadro de torneo hasta la final. Esa es la
 * diferencia con un juego de machacar teclas normal: aquí no competís entre
 * vosotros, os toca remar juntos, y el rival aprieta más en cada ronda.
 *
 * Se juega por turnos y con una sola tecla, la L, porque así los dos podéis
 * usar la misma mano y la misma tecla sin estorbaros — no hace falta repartir
 * el teclado ni preocuparse del ghosting.
 *
 * El bucle: turno de uno, turno del otro, turno de los dos rivales, y se
 * comparan totales. Cada pulsación suma más si mantienes el ritmo (combo),
 * así que machacar a lo loco rinde menos que machacar constante — eso es lo
 * que hace que no sea solo cuestión de dedos rápidos.
 */

import { TAU, clamp } from '../../core/math2d.js';
import { dibujarPersonaje, personajeDe } from '../../core/personaje.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const SEGUNDOS_TURNO = 6;
const COMBO_VENTANA = 0.42;     // margen entre pulsaciones para no perder combo
const COMBO_MAX = 3;

/* El cuadro de torneo. La dificultad es golpes por segundo del rival, y sube
   de forma clara para que se note que cada ronda cuesta más. */
const RONDAS = [
  { nombre: 'Cuartos', rival: ['Los Pulgares', 'Tuercas'], gps: 5.2, premio: 'Guantes de cuero' },
  { nombre: 'Semifinal', rival: ['Hermanas Trueno', 'Chispa'], gps: 6.6, premio: 'Cinturón de bronce' },
  { nombre: 'Final', rival: ['Los Titanes', 'Yunque'], gps: 8.1, premio: 'CINTURÓN DE ORO' },
];

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let ronda = 0;
  let fase = 'presenta';        // presenta | turno | rivales | resultado | fin
  let reloj = 0;
  let espera = 2.6;

  let turnoDe = 0;              // 0 y 1 = nuestros jugadores
  const golpes = [0, 0];        // pulsaciones de cada uno en su turno
  let puntosEquipo = 0;
  let puntosRival = 0;
  let combo = 1;
  let desdeUltimo = 0;
  let mejorCombo = 1;

  let sacudida = 0;
  let destello = 0;
  let tiempo = 0;
  let aviso = '';
  let ganados = 0;

  /* Ondas de impacto: puro efecto, pero es lo que da la sensación de fuerza. */
  const ondas = [];
  const chispas = [];

  const rondaActual = () => RONDAS[Math.min(ronda, RONDAS.length - 1)];

  function decir(t) { aviso = t; }

  function golpear() {
    // El combo sube si el ritmo se mantiene y se cae si te paras.
    combo = desdeUltimo < COMBO_VENTANA ? Math.min(COMBO_MAX, combo + 0.08) : 1;
    desdeUltimo = 0;
    golpes[turnoDe]++;
    puntosEquipo += combo;
    mejorCombo = Math.max(mejorCombo, combo);

    const col = players[turnoDe].color;
    ondas.push({ r: 10, vida: 1, col });
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * TAU;
      chispas.push({
        x: W / 2, y: H * 0.46,
        vx: Math.cos(a) * (160 + ctx.rng() * 220),
        vy: Math.sin(a) * (160 + ctx.rng() * 220),
        vida: 0.5, col,
      });
    }
    sacudida = Math.min(6, sacudida + 1.6);
    destello = 0.5;

    // El tono sube con el combo: se oye el progreso sin mirar el número.
    audio.tone({
      freq: 180 + combo * 90 + Math.min(golpes[turnoDe], 40) * 4,
      dur: 0.05, gain: 0.15, type: 'square', sweep: -60,
    });
    haptics.play('tap', { player: turnoDe });
    ctx.mando?.vibrar?.(turnoDe, 'tecla');
  }

  /** Simula el turno de la pareja rival con su ritmo, con algo de variación. */
  function turnoRivales() {
    const r = rondaActual();
    let total = 0;
    for (let k = 0; k < 2; k++) {
      const ritmo = r.gps * (0.86 + ctx.rng() * 0.28);
      total += ritmo * SEGUNDOS_TURNO * (1 + ctx.rng() * 0.35);
    }
    puntosRival = total;
  }

  function resolverRonda() {
    const ganamos = puntosEquipo >= puntosRival;
    fase = 'resultado';
    espera = 3.4;
    if (ganamos) {
      ganados++;
      decir(`¡Ganáis ${rondaActual().nombre}! ${rondaActual().premio}`);
      audio.win();
      haptics.victory(0);
      for (let i = 0; i < 40; i++) {
        const a = ctx.rng() * TAU;
        chispas.push({
          x: W / 2, y: H * 0.4,
          vx: Math.cos(a) * (200 + ctx.rng() * 320),
          vy: Math.sin(a) * (200 + ctx.rng() * 320),
          vida: 1.2, col: ['#ffd166', '#a8ff3e', '#ff2e88'][i % 3],
        });
      }
      ctx.shake(8, 12);
    } else {
      decir(`${rondaActual().rival[0]} os eliminan`);
      audio.error();
      ctx.shake(6, 9);
    }
    for (const i of [0, 1]) ctx.mando?.vibrar?.(i, ganamos ? 'punto' : 'error');
  }

  function siguienteRonda() {
    const ganamos = puntosEquipo >= puntosRival;
    if (!ganamos || ronda >= RONDAS.length - 1) {
      fase = 'fin';
      const campeones = ganamos && ronda >= RONDAS.length - 1;
      ctx.record('machaque', Math.round(puntosEquipo), 'max');
      ctx.finish({
        winner: -1,
        titulo: campeones ? '¡CAMPEONES! Cinturón de oro' : `Eliminados en ${rondaActual().nombre}`,
        detalle: `${ganados} de ${RONDAS.length} rondas ganadas · mejor combo ×${mejorCombo.toFixed(1)}`,
        scores: [Math.round(golpes[0]), Math.round(golpes[1])],
      });
      return;
    }
    ronda++;
    prepararRonda();
  }

  function prepararRonda() {
    fase = 'presenta';
    espera = 2.8;
    puntosEquipo = 0;
    puntosRival = 0;
    golpes[0] = golpes[1] = 0;
    combo = 1;
    turnoDe = 0;
    decir(`${rondaActual().nombre} · contra ${rondaActual().rival[0]}`);
    audio.tone({ freq: 320, dur: 0.3, gain: 0.18, type: 'sawtooth', sweep: 140 });
    // Los mandos avisan de quién empieza y con qué se machaca.
    for (const i of [0, 1]) {
      ctx.mando?.perfil?.(i, {
        disposicion: 'solo',
        juego: 'Puño de Hierro',
        pie: i === 0 ? 'Empiezas tú' : 'Vas después',
        controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'GOLPEAR', glifo: '👊' }] }],
      });
    }
  }

  let soltarTecla = () => {};

  return {
    init() {
      prepararRonda();
      /* Una sola tecla para los dos.
         Al ser por turnos no hay que repartir el teclado: los dos usan la
         misma L, con la misma mano y sin pelearse por el sitio. Se escucha
         la tecla física directamente, no la acción mapeada, porque el juego
         se anuncia con esa letra concreta. */
      soltarTecla = input.on('KeyL', () => {
        if (fase === 'turno') golpear();
      });
    },
    destroy() { soltarTecla(); },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      sacudida = Math.max(0, sacudida - dt * 9);
      destello = Math.max(0, destello - dt * 3);
      desdeUltimo += dt;

      for (const o of ondas) { o.r += dt * 420; o.vida -= dt * 1.8; }
      for (let i = ondas.length - 1; i >= 0; i--) if (ondas[i].vida <= 0) ondas.splice(i, 1);
      for (const c of chispas) {
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.vy += 620 * dt;
        c.vida -= dt;
      }
      for (let i = chispas.length - 1; i >= 0; i--) if (chispas[i].vida <= 0) chispas.splice(i, 1);

      if (fase === 'presenta') {
        espera -= dt;
        if (espera <= 0) { fase = 'turno'; reloj = SEGUNDOS_TURNO; combo = 1; decir(''); }
        return;
      }

      if (fase === 'turno') {
        reloj -= dt;
        if (desdeUltimo > COMBO_VENTANA) combo = Math.max(1, combo - dt * 1.6);

        // La tecla L se engancha aparte, en init. Aquí solo se atiende el
        // botón del mando, para quien juegue con iPad.
        for (const i of [0, 1]) {
          if (input.player(i).pressed('a')) golpear();
        }

        if (reloj <= 0) {
          if (turnoDe === 0) {
            turnoDe = 1;
            reloj = SEGUNDOS_TURNO;
            combo = 1;
            decir(`Turno de ${players[1].name}`);
            audio.tone({ freq: 420, dur: 0.16, gain: 0.16, type: 'triangle' });
          } else {
            fase = 'rivales';
            espera = 2.2;
            turnoRivales();
            decir(`${rondaActual().rival[0]} responden…`);
            audio.tone({ freq: 200, dur: 0.3, gain: 0.16, type: 'sawtooth', sweep: -70 });
          }
        }
        return;
      }

      if (fase === 'rivales') {
        espera -= dt;
        if (espera <= 0) resolverRonda();
        return;
      }

      if (fase === 'resultado') {
        espera -= dt;
        if (espera <= 0) siguienteRonda();
      }
    },

    render() {
      const g = ctx.c;
      const sx = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;
      const sy = sacudida ? (ctx.rng() - 0.5) * sacudida : 0;

      g.save();
      g.translate(sx, sy);

      /* Fondo de ring: focos y suelo. */
      g.fillStyle = '#0a0710';
      g.fillRect(-10, -10, W + 20, H + 20);
      const foco = g.createRadialGradient(W / 2, H * 0.1, 0, W / 2, H * 0.45, H * 0.9);
      foco.addColorStop(0, '#ffd16620');
      foco.addColorStop(1, '#00000000');
      g.fillStyle = foco;
      g.fillRect(0, 0, W, H);

      if (destello > 0) {
        g.fillStyle = `rgba(255,255,255,${destello * 0.16})`;
        g.fillRect(0, 0, W, H);
      }

      /* Ondas de impacto */
      for (const o of ondas) {
        g.save();
        g.globalAlpha = clamp(o.vida, 0, 1) * 0.6;
        g.strokeStyle = o.col;
        g.lineWidth = 4;
        g.beginPath();
        g.arc(W / 2, H * 0.46, o.r, 0, TAU);
        g.stroke();
        g.restore();
      }

      /* Cabecera: ronda y premio en juego */
      const r = rondaActual();
      ctx.engine.text(r.nombre.toUpperCase(), W / 2, 30, { size: 15, color: '#ffd166' });
      ctx.engine.text(`en juego: ${r.premio}`, W / 2, 50, { size: 11.5, color: '#8f8fb0', font: 'system-ui' });

      /* Cuadro del torneo: dónde estamos */
      const paso = 34;
      const bx = W / 2 - (RONDAS.length * paso) / 2;
      RONDAS.forEach((rr, k) => {
        const hecho = k < ronda || (k === ronda && fase === 'fin' && ganados > k);
        const aqui = k === ronda;
        g.fillStyle = hecho ? '#a8ff3e' : aqui ? '#ffd166' : '#ffffff20';
        g.beginPath();
        g.arc(bx + k * paso + paso / 2, 72, aqui ? 7 : 5, 0, TAU);
        g.fill();
        if (k < RONDAS.length - 1) {
          g.strokeStyle = '#ffffff1a';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(bx + k * paso + paso / 2 + 8, 72);
          g.lineTo(bx + (k + 1) * paso + paso / 2 - 8, 72);
          g.stroke();
        }
      });

      /* Nuestros dos personajes, el del turno al frente y grande */
      const suelo = H * 0.74;
      for (const i of [0, 1]) {
        const activo = fase === 'turno' && i === turnoDe;
        const x = W / 2 + (i === 0 ? -1 : 1) * (activo ? 0 : W * 0.16);
        const alto = activo ? H * 0.3 : H * 0.19;
        const pulso = activo ? Math.sin(tiempo * 26) * (combo - 1) * 3 : 0;
        dibujarPersonaje(g, personajeDe(players[i], i), x, suelo + pulso, alto, {
          pose: activo && desdeUltimo < 0.12 ? 'salta' : 'quieto',
          acento: players[i].color,
          brillo: activo ? 22 : 0,
          alpha: activo || fase !== 'turno' ? 1 : 0.45,
          mirando: i === 0 ? 1 : -1,
        });
      }

      /* Chispas */
      for (const c of chispas) {
        g.save();
        g.globalAlpha = clamp(c.vida, 0, 1);
        g.fillStyle = c.col;
        g.fillRect(c.x - 2, c.y - 2, 4, 4);
        g.restore();
      }

      /* Marcador del asalto */
      const barraY = H * 0.84;
      const total = Math.max(puntosEquipo, puntosRival, 1);
      const anchoB = Math.min(W * 0.8, 620);
      const bxx = W / 2 - anchoB / 2;

      g.fillStyle = '#ffffff10';
      g.fillRect(bxx, barraY, anchoB, 16);
      g.fillStyle = players[0].color;
      g.fillRect(bxx, barraY, anchoB * (puntosEquipo / total) * 0.5, 16);
      g.fillStyle = '#ff4757';
      const anchoR = anchoB * (puntosRival / total) * 0.5;
      g.fillRect(bxx + anchoB - anchoR, barraY, anchoR, 16);

      ctx.engine.text(`VOSOTROS ${Math.round(puntosEquipo)}`, bxx + 70, barraY - 8,
        { size: 12.5, color: players[0].color, font: 'system-ui' });
      ctx.engine.text(`${Math.round(puntosRival)} ${r.rival[0].toUpperCase()}`, bxx + anchoB - 70, barraY - 8,
        { size: 12.5, color: '#ff4757', font: 'system-ui' });

      /* Estado central: cronómetro, combo y quién machaca */
      if (fase === 'turno') {
        const u = reloj / SEGUNDOS_TURNO;
        g.strokeStyle = '#ffffff14';
        g.lineWidth = 8;
        g.beginPath();
        g.arc(W / 2, H * 0.2, 34, 0, TAU);
        g.stroke();
        g.strokeStyle = reloj <= 2 ? '#ff4757' : players[turnoDe].color;
        g.beginPath();
        g.arc(W / 2, H * 0.2, 34, -Math.PI / 2, -Math.PI / 2 + TAU * u);
        g.stroke();
        ctx.engine.text(reloj.toFixed(1), W / 2, H * 0.2 + 7, { size: 20, color: '#f2f2ff' });

        ctx.engine.text(`¡${players[turnoDe].name.toUpperCase()}, MACHACA L!`, W / 2, H * 0.32, {
          size: 19, color: players[turnoDe].color,
        });
        if (combo > 1.05) {
          const esc = 1 + (combo - 1) * 0.25;
          ctx.engine.text(`COMBO ×${combo.toFixed(1)}`, W / 2, H * 0.38, {
            size: Math.round(15 * esc), color: '#ffd166',
          });
        }
        ctx.engine.text(`${golpes[turnoDe]} golpes`, W / 2, H * 0.9 + 18, {
          size: 12, color: '#8f8fb0', font: 'system-ui',
        });
      } else if (aviso) {
        ctx.engine.text(aviso, W / 2, H * 0.3, { size: 20, color: '#ffd166', font: 'system-ui' });
      }

      if (fase === 'rivales') {
        // Los rivales «machacan»: barras que suben solas, para que se vea.
        ctx.engine.text(r.rival.join('  ·  '), W / 2, H * 0.38, {
          size: 15, color: '#ff4757', font: 'system-ui',
        });
      }

      particles.render(g);
      g.restore();

      ctx.engine.text('Los dos en el mismo equipo · turnos de 6 s · mantén el ritmo para el combo',
        W / 2, H - 14, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
