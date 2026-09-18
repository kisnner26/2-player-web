/**
 * Ahorcado a Dos — la misma palabra y turnos alternos para pedir letras.
 *
 * No hay muñeco colgado: lo que hay es un reparto. Cada letra que aciertas te
 * la apuntas y sigues pidiendo; en cuanto fallas, el turno pasa. Como la
 * palabra es compartida, acertar una vocal fácil le deja el trabajo hecho al
 * otro, y guardar la consonante que lo cierra todo vale más que ir rápido.
 *
 * Gana la palabra quien haya destapado más letras cuando se complete, así que
 * la última letra no decide nada por sí sola: decide la cuenta.
 */

export const meta = { render: 'canvas', sinCuentaAtras: true };

const PALABRAS = [
  'murcielago', 'bicicleta', 'chocolate', 'ventilador', 'tormenta', 'zapatilla',
  'naranja', 'esqueleto', 'ferrocarril', 'guitarra', 'almohada', 'relampago',
  'cangrejo', 'telescopio', 'mermelada', 'paraguas', 'terremoto', 'girasol',
  'submarino', 'calabaza', 'hormiguero', 'tornillo', 'panaderia', 'invierno',
  'estornudo', 'campanario', 'jirafa', 'brujula', 'escalera', 'nube',
];
const RONDAS = 5;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let palabra = '', reveladas = new Set(), usadas = new Set();
  let turno = 0, ronda = 1, fase = 'jugando', espera = 0, t = 0;
  let destapadas = [0, 0], ganadas = [0, 0], ultimaLetra = '', ultimoAcierto = false;
  let sb = null, soltar = () => {};

  const sinTilde = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  function nuevaPalabra() {
    palabra = sinTilde(PALABRAS[Math.floor(rng() * PALABRAS.length)]).toUpperCase();
    reveladas = new Set();
    usadas = new Set();
    destapadas = [0, 0];
    fase = 'jugando';
    ultimaLetra = '';
  }

  const completa = () => [...palabra].every((c) => reveladas.has(c));

  function pedir(letra) {
    if (fase !== 'jugando' || usadas.has(letra)) {
      if (usadas.has(letra)) audio.tone({ freq: 160, dur: 0.06, gain: 0.08, type: 'square' });
      return;
    }
    usadas.add(letra);
    ultimaLetra = letra;

    const veces = [...palabra].filter((c) => c === letra).length;
    if (veces > 0) {
      reveladas.add(letra);
      destapadas[turno] += veces;
      ultimoAcierto = true;
      audio.pickup();
      haptics.score(turno);
      particles.burst(W / 2, H * 0.45, 10 + veces * 4, {
        speed: 190, color: players[turno].color, size: 4, drag: 0.9,
      });
      if (completa()) {
        const g = destapadas[0] === destapadas[1] ? turno : (destapadas[0] > destapadas[1] ? 0 : 1);
        ganadas[g]++;
        sb.update(ganadas[0], ganadas[1]);
        audio.win();
        haptics.victory(g);
        fase = 'resuelta';
        espera = 2.4;
      }
    } else {
      ultimoAcierto = false;
      audio.error();
      haptics.error(turno);
      ctx.shake(4);
      turno = 1 - turno;
    }
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaPalabra();
      sb = ui.scoreboard({ center: `palabra ${ronda} de ${RONDAS}` });
      // Las letras se leen crudas del teclado: los dos comparten el abecedario
      // y el turno es lo que decide de quién es la pulsación.
      soltar = input.onAny((e) => {
        if (!/^Key[A-Z]$/.test(e.code)) return;
        pedir(e.code.slice(3));
      });
    },
    destroy() { soltar(); sb?.remove(); },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      t += dt;
      particles.update(dt);
      if (fase !== 'resuelta') return;
      espera -= dt;
      if (espera > 0) return;
      if (ronda >= RONDAS) {
        const g = ganadas[0] === ganadas[1] ? -1 : (ganadas[0] > ganadas[1] ? 0 : 1);
        ctx.finish({ winner: g, scores: ganadas, detail: `${RONDAS} palabras jugadas` });
        return;
      }
      ronda++;
      sb.setCenter(`palabra ${ronda} de ${RONDAS}`);
      turno = ronda % 2;
      nuevaPalabra();
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0b0812');
      const col = players[turno].color;

      const halo = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.8);
      halo.addColorStop(0, `${col}14`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      // La palabra, con huecos.
      const n = palabra.length;
      const paso = Math.min(52, (W * 0.86) / n);
      const y = H * 0.44;
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * paso;
        const letra = palabra[i];
        const visible = reveladas.has(letra) || fase === 'resuelta';
        g.fillStyle = visible ? '#ffffff10' : '#ffffff06';
        g.fillRect(x - paso * 0.4, y - paso * 0.5, paso * 0.8, paso);
        g.fillStyle = visible ? '#3effc8' : '#4a4a66';
        g.fillRect(x - paso * 0.4, y + paso * 0.5, paso * 0.8, 3);
        if (visible) {
          ctx.engine.text(letra, x, y, { size: paso * 0.62, color: '#f2f2ff', glow: 8 });
        }
      }

      // Abecedario: lo que queda por pedir es la información importante.
      const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      const cols = 13;
      const cel = Math.min(34, (W * 0.62) / cols);
      for (let i = 0; i < ABC.length; i++) {
        const cx = W / 2 + ((i % cols) - (cols - 1) / 2) * cel;
        const cy = H * 0.7 + Math.floor(i / cols) * cel;
        const l = ABC[i];
        const gastada = usadas.has(l);
        const acerto = reveladas.has(l);
        g.fillStyle = acerto ? '#1d3a2c' : gastada ? '#2a1620' : '#17142a';
        g.fillRect(cx - cel * 0.44, cy - cel * 0.44, cel * 0.88, cel * 0.88);
        ctx.engine.text(l, cx, cy, {
          size: cel * 0.44,
          color: acerto ? '#a8ff3e' : gastada ? '#6a3a4a' : '#9a9ac0',
          font: 'system-ui',
        });
      }

      // Turno
      const parpadeo = 0.75 + Math.sin(t * 5) * 0.25;
      g.save();
      g.globalAlpha = fase === 'jugando' ? parpadeo : 1;
      ctx.engine.text(
        fase === 'resuelta' ? '¡Palabra completa!' : `TURNO DE ${players[turno].name.toUpperCase()}`,
        W / 2, H * 0.2, { size: 22, color: fase === 'resuelta' ? '#ffd166' : col, glow: 14 },
      );
      g.restore();
      if (ultimaLetra && fase === 'jugando') {
        ctx.engine.text(`${ultimaLetra} — ${ultimoAcierto ? 'sigue' : 'cambio de turno'}`,
          W / 2, H * 0.27, { size: 13, color: ultimoAcierto ? '#a8ff3e' : '#ff4757', font: 'system-ui' });
      }

      for (const i of [0, 1]) {
        ctx.engine.text(`${players[i].name}: ${destapadas[i]} letras`, i === 0 ? 20 : W - 20, H * 0.33, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      particles.render(g);
      ctx.engine.text('Pide letras con el teclado · si aciertas sigues, si fallas pasa el turno · gana quien más destape',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
