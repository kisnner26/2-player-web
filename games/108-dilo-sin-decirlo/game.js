/**
 * Dilo Sin Decirlo — el clásico de describir sin nombrar, con iPad.
 *
 * Por qué necesita mando: la palabra tiene que verla UNO SOLO. En una pantalla
 * compartida haría falta que el otro cerrara los ojos, y la versión de móvil
 * en la frente no funciona con una Mac encima de la mesa. Con un iPad, quien
 * describe lee su palabra en privado y la pantalla grande solo lleva la cuenta.
 *
 * Un turno son sesenta segundos: describir sin decir la palabra ni nada de la
 * misma familia. El que describe marca con sus propios botones si el otro
 * acertó o si pasa de palabra. Luego se cambian los papeles y gana quien más
 * haya conseguido.
 *
 * Pasar palabra cuesta un punto para que no sea gratis saltarse las difíciles.
 */

import { barajar, CATEGORIAS_ADIVINA } from '../datos/adivinanzas.js';

export const meta = { render: 'canvas' };

const SEGUNDOS_TURNO = 60;
const PENALIZA_PASO = 1;

export function create(ctx) {
  const { input, audio, haptics, players, particles } = ctx;

  let W = ctx.W, H = ctx.H;
  let bolsa = [];
  let actual = null;
  let describe = 0;             // quién tiene la palabra
  let turno = 0;                // 0 y 1 = un turno cada uno
  let restante = SEGUNDOS_TURNO;
  let marcador = [0, 0];
  let aciertos = [0, 0];
  let pasos = [0, 0];
  let estado = 'aviso';         // aviso | jugando | fin-turno
  let pausa = 0;
  let historial = [];           // últimas palabras, para repasarlas al final
  let tiempo = 0;
  let destello = 0;
  let aviso = '';

  function perfilDescriptor() {
    // Quien describe ve la palabra y tiene los dos botones de la ronda.
    ctx.mando.perfil(describe, {
      disposicion: 'pila',
      juego: 'Dilo Sin Decirlo',
      pie: 'No la digas ni la deletrees',
      controles: [
        {
          tipo: 'secreto',
          titulo: CATEGORIAS_ADIVINA[actual.c]?.nombre || 'Descríbela',
          dato: actual.r,
        },
        {
          tipo: 'acciones',
          botones: [
            { a: 'a', etiqueta: 'Acertó', glifo: '✓' },
            { a: 'b', etiqueta: 'Paso (−1)', glifo: '→' },
          ],
        },
      ],
    });
  }

  function perfilAdivinador() {
    // El otro no puede ver nada: su mando solo dice de qué va la cosa.
    ctx.mando.perfil(1 - describe, {
      disposicion: 'solo',
      juego: 'Dilo Sin Decirlo',
      pie: 'Te toca adivinar en voz alta',
      controles: [{
        tipo: 'secreto',
        titulo: 'Tú adivinas',
        texto: 'Escucha a tu pareja y grita todo lo que se te ocurra.',
        dato: '👂',
      }],
    });
  }

  function siguientePalabra() {
    if (!bolsa.length) bolsa = barajar(ctx.rng);
    actual = bolsa.pop();
    perfilDescriptor();
  }

  function empezarTurno() {
    restante = SEGUNDOS_TURNO;
    estado = 'jugando';
    historial = [];
    siguientePalabra();
    perfilAdivinador();
    audio.tone({ freq: 520, dur: 0.16, gain: 0.16, type: 'triangle', sweep: 120 });
  }

  function acertar() {
    marcador[describe]++;
    aciertos[describe]++;
    historial.push({ r: actual.r, ok: true });
    destello = 1;
    audio.win();
    haptics.play('score', { player: describe });
    ctx.mando.vibrar(describe, 'punto');
    particles.burst(W / 2, H * 0.5, 22, {
      speed: 240, dir: -Math.PI / 2, spread: Math.PI * 2,
      color: players[describe].color, size: 3, drag: 0.9,
    });
    siguientePalabra();
  }

  function pasar() {
    marcador[describe] = Math.max(0, marcador[describe] - PENALIZA_PASO);
    pasos[describe]++;
    historial.push({ r: actual.r, ok: false });
    audio.error();
    ctx.mando.vibrar(describe, 'error');
    siguientePalabra();
  }

  function terminarTurno() {
    estado = 'fin-turno';
    pausa = 4;
    audio.tone({ freq: 200, dur: 0.4, gain: 0.18, type: 'sawtooth', sweep: -90 });
    haptics.play('impact', { player: describe });
    ctx.mando.vibrar(describe, 'golpe');
    aviso = `Turno de ${players[describe].name} terminado`;
  }

  return {
    init() {
      estado = 'aviso';
      pausa = 3;
      aviso = `Empieza ${players[0].name} describiendo`;
      // Aunque el turno aún no ha empezado, los mandos ya deben decir a cada
      // uno qué papel le toca: enterarse al mismo tiempo que arranca el
      // cronómetro es tarde.
      ctx.mando.perfil(0, {
        disposicion: 'solo', juego: 'Dilo Sin Decirlo', pie: 'Prepárate',
        controles: [{ tipo: 'secreto', titulo: 'Tu papel', texto: 'Tú describes primero', dato: '🗣' }],
      });
      ctx.mando.perfil(1, {
        disposicion: 'solo', juego: 'Dilo Sin Decirlo', pie: 'Prepárate',
        controles: [{ tipo: 'secreto', titulo: 'Tu papel', texto: 'Tú adivinas primero', dato: '👂' }],
      });
    },
    resize(w, h) { W = w; H = h; },

    update(dt) {
      tiempo += dt;
      destello = Math.max(0, destello - dt * 2.2);

      if (estado === 'aviso') {
        pausa -= dt;
        if (pausa <= 0) empezarTurno();
        return;
      }

      if (estado === 'fin-turno') {
        pausa -= dt;
        if (pausa <= 0) {
          turno++;
          if (turno >= 2) {
            ctx.record('palabras', Math.max(...aciertos), 'max');
            ctx.finish({
              winner: marcador[0] === marcador[1] ? -1 : (marcador[0] > marcador[1] ? 0 : 1),
              scores: marcador,
            });
            return;
          }
          describe = 1 - describe;
          estado = 'aviso';
          pausa = 3;
          aviso = `Ahora describe ${players[describe].name}`;
        }
        return;
      }

      /* Jugando: solo el que describe toca botones. */
      restante -= dt;
      if (restante <= 0) { restante = 0; terminarTurno(); return; }

      const p = input.player(describe);
      if (p.pressed('a')) acertar();
      if (p.pressed('b')) pasar();
    },

    render() {
      const g = ctx.c;
      const col = players[describe]?.color || '#ff2e88';
      g.fillStyle = '#0c0a18';
      g.fillRect(0, 0, W, H);

      if (destello > 0) {
        g.fillStyle = `rgba(168,255,62,${destello * 0.14})`;
        g.fillRect(0, 0, W, H);
      }

      /* Marcador de los dos, siempre visible. */
      for (const i of [0, 1]) {
        const x = i === 0 ? W * 0.16 : W * 0.84;
        const activo = i === describe && estado === 'jugando';
        ctx.engine.text(players[i].name, x, 34, {
          size: 13, color: players[i].color, font: 'system-ui',
        });
        ctx.engine.text(String(marcador[i]), x, 70, { size: 30, color: players[i].color });
        ctx.engine.text(activo ? 'describiendo' : 'adivinando', x, 90, {
          size: 10.5, color: activo ? '#a8ff3e' : '#6a6a8c', font: 'system-ui',
        });
      }

      if (estado === 'aviso' || estado === 'fin-turno') {
        ctx.engine.text(aviso, W / 2, H * 0.44, { size: 20, color: '#ffd166', font: 'system-ui' });
        if (estado === 'fin-turno' && historial.length) {
          ctx.engine.text('Palabras de este turno', W / 2, H * 0.54, { size: 12, color: '#8f8fb0', font: 'system-ui' });
          historial.slice(-8).forEach((h, k) => {
            ctx.engine.text(`${h.ok ? '✓' : '✗'} ${h.r}`, W / 2, H * 0.58 + k * 20, {
              size: 13.5, color: h.ok ? '#a8ff3e' : '#ff4757', font: 'system-ui',
            });
          });
        }
        if (estado === 'aviso') {
          ctx.engine.text(`Empieza en ${Math.ceil(pausa)}`, W / 2, H * 0.54, {
            size: 14, color: '#8f8fb0', font: 'system-ui',
          });
        }
        return;
      }

      /* Cronómetro grande: es el corazón del juego. */
      const u = restante / SEGUNDOS_TURNO;
      const r = Math.min(W, H) * 0.19;
      const cx = W / 2, cy = H * 0.42;
      g.strokeStyle = '#ffffff12';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
      // El aro se vacía y se pone rojo en los últimos diez segundos.
      g.strokeStyle = restante <= 10 ? '#ff4757' : col;
      g.lineWidth = 10;
      g.lineCap = 'round';
      g.beginPath();
      g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u);
      g.stroke();
      ctx.engine.text(String(Math.ceil(restante)), cx, cy + 14, {
        size: Math.round(r * 0.62),
        color: restante <= 10 ? '#ff4757' : '#f2f2ff',
      });

      /* La palabra NO se dibuja aquí: está solo en el mando del que describe.
         En su lugar, la pantalla dice quién hace qué. */
      ctx.engine.text(`${players[describe].name} lo describe · ${players[1 - describe].name} adivina`,
        W / 2, cy + r + 44, { size: 15, color: '#f2f2ff', font: 'system-ui' });
      ctx.engine.text('La palabra está en el iPad de quien describe',
        W / 2, cy + r + 68, { size: 12, color: '#6a6a8c', font: 'system-ui' });

      /* Últimas palabras resueltas, para el público. */
      historial.slice(-4).forEach((h, k, arr) => {
        ctx.engine.text(`${h.ok ? '✓' : '✗'} ${h.r}`, W / 2, H - 96 + k * 20, {
          size: 13, color: h.ok ? '#a8ff3e88' : '#ff475788', font: 'system-ui',
        });
      });

      ctx.engine.text('✓ acertó   ·   → paso (−1 punto)', W / 2, H - 22, {
        size: 12, color: '#6a6a8c', font: 'system-ui',
      });

      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita un mando táctil · Menú → Mandos',
          W / 2, H * 0.18, { size: 13, color: '#ffd166', font: 'system-ui' });
      }
    },
  };
}
