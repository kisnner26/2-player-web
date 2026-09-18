/**
 * Anagramas — las mismas letras, desordenadas, y un reloj encima.
 *
 * Por turnos y con el teclado entero, que para escribir no hay forma de
 * repartirlo. Cada palabra vale lo que te sobre del reloj, así que resolverla
 * en tres segundos vale el triple que resolverla en diez.
 *
 * El desorden no es cualquiera: se garantiza que ninguna letra se quede en su
 * sitio. Eso quita las palabras "casi resueltas" que se leían solas y deja el
 * juego donde tiene que estar — en darle la vuelta a la palabra en la cabeza.
 */

export const meta = { render: 'canvas', sinCuentaAtras: true };

const PALABRAS = [
  'ventana', 'caballo', 'pimiento', 'cuchara', 'domingo', 'fantasma', 'lechuga',
  'molinos', 'naufragio', 'orquesta', 'pantalla', 'quimica', 'ruleta', 'sombrilla',
  'trueno', 'valiente', 'zanahoria', 'bufanda', 'cometa', 'diamante', 'espuma',
  'fogata', 'granizo', 'hierba', 'iglesia', 'jarabe', 'linterna', 'muralla',
];
const RONDAS = 6;              // tres palabras por cabeza
const TIEMPO = 18;

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let palabra = '', revuelta = '', escrito = '';
  let turno = 0, ronda = 1, fase = 'jugando', reloj = TIEMPO, espera = 0, t = 0;
  const puntos = [0, 0];
  let sb = null, soltar = () => {}, sacudida = 0, mensaje = '';

  function revolver(p) {
    const letras = [...p];
    for (let intento = 0; intento < 40; intento++) {
      for (let i = letras.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [letras[i], letras[j]] = [letras[j], letras[i]];
      }
      // Sin letras en su sitio original: si no, media palabra se lee sola.
      if (letras.every((c, i) => c !== p[i])) break;
    }
    return letras.join('');
  }

  function nuevaPalabra() {
    palabra = PALABRAS[Math.floor(rng() * PALABRAS.length)].toUpperCase();
    revuelta = revolver(palabra);
    escrito = '';
    reloj = TIEMPO;
    fase = 'jugando';
    mensaje = '';
    audio.select();
  }

  function resolver(acertada) {
    fase = 'resuelta';
    espera = 2;
    if (acertada) {
      const gana = 10 + Math.round(reloj * 4);
      puntos[turno] += gana;
      mensaje = `¡${palabra}! +${gana}`;
      audio.win();
      haptics.victory(turno);
      particles.burst(W / 2, H * 0.45, 26, { speed: 260, color: players[turno].color, size: 5, drag: 0.9 });
    } else {
      mensaje = `Era ${palabra}`;
      audio.lose();
      haptics.error(turno);
    }
    sb.update(puntos[0], puntos[1]);
  }

  function tecla(e) {
    if (fase !== 'jugando') return;
    if (e.code === 'Backspace') {
      escrito = escrito.slice(0, -1);
      audio.tone({ freq: 200, dur: 0.04, gain: 0.08, type: 'square' });
      return;
    }
    if (!/^Key[A-Z]$/.test(e.code)) return;
    const l = e.code.slice(3);
    escrito += l;
    audio.tone({ freq: 420 + escrito.length * 20, dur: 0.03, gain: 0.08, type: 'triangle' });

    if (!palabra.startsWith(escrito)) {
      // No se corta la palabra: se avisa y se limpia, que es menos frustrante.
      sacudida = 6;
      escrito = '';
      audio.error();
      haptics.error(turno);
      return;
    }
    if (escrito === palabra) resolver(true);
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaPalabra();
      sb = ui.scoreboard({ center: `palabra 1 de ${RONDAS}` });
      soltar = input.onAny(tecla);
    },
    destroy() { soltar(); sb?.remove(); },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      t += dt;
      sacudida = Math.max(0, sacudida - dt * 26);
      particles.update(dt);

      if (fase === 'resuelta') {
        espera -= dt;
        if (espera > 0) return;
        if (ronda >= RONDAS) {
          const g = puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1);
          ctx.finish({
            winner: g, scores: puntos, detail: `${RONDAS} palabras`,
            record: ctx.record('puntos', Math.max(...puntos), 'high'),
          });
          return;
        }
        ronda++;
        turno = 1 - turno;
        sb.setCenter(`palabra ${ronda} de ${RONDAS}`);
        nuevaPalabra();
        return;
      }

      const antes = Math.ceil(reloj);
      reloj -= dt;
      if (Math.ceil(reloj) !== antes && reloj <= 5 && reloj > 0) audio.countdown(Math.ceil(reloj));
      if (reloj <= 0) resolver(false);
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0a0810');
      const col = players[turno].color;

      const halo = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.8);
      halo.addColorStop(0, `${col}16`);
      halo.addColorStop(1, '#00000000');
      g.fillStyle = halo;
      g.fillRect(0, 0, W, H);

      ctx.engine.text(`TURNO DE ${players[turno].name.toUpperCase()}`, W / 2, H * 0.16,
        { size: 18, color: col, glow: 10 });

      // Letras revueltas: fichas sueltas, para que se vean como piezas.
      const n = revuelta.length;
      const paso = Math.min(60, (W * 0.82) / n);
      g.save();
      g.translate(sacudida ? (rng() - 0.5) * sacudida : 0, 0);
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * paso;
        const y = H * 0.4 + Math.sin(t * 2 + i * 0.7) * 3;
        g.fillStyle = '#191529';
        g.beginPath(); g.roundRect(x - paso * 0.42, y - paso * 0.42, paso * 0.84, paso * 0.84, 8); g.fill();
        g.strokeStyle = '#2f2a48';
        g.lineWidth = 2;
        g.stroke();
        ctx.engine.text(revuelta[i], x, y, { size: paso * 0.5, color: '#f2f2ff' });
      }
      g.restore();

      // Lo tecleado
      const m = palabra.length;
      const paso2 = Math.min(46, (W * 0.7) / m);
      for (let i = 0; i < m; i++) {
        const x = W / 2 + (i - (m - 1) / 2) * paso2;
        const y = H * 0.63;
        const puesta = i < escrito.length;
        g.fillStyle = puesta ? `${col}33` : '#ffffff06';
        g.fillRect(x - paso2 * 0.38, y - paso2 * 0.4, paso2 * 0.76, paso2 * 0.8);
        g.fillStyle = puesta ? col : '#3a3a55';
        g.fillRect(x - paso2 * 0.38, y + paso2 * 0.4, paso2 * 0.76, 3);
        if (puesta) ctx.engine.text(escrito[i], x, y, { size: paso2 * 0.5, color: '#ffffff' });
      }

      // Reloj
      const bw = W * 0.5;
      const p = Math.max(0, reloj / TIEMPO);
      g.fillStyle = '#1a1a2c';
      g.fillRect(W / 2 - bw / 2, H * 0.76, bw, 8);
      g.fillStyle = p < 0.25 ? '#ff4757' : '#ffd166';
      g.fillRect(W / 2 - bw / 2, H * 0.76, bw * p, 8);
      ctx.engine.text(`${Math.max(0, reloj).toFixed(1)}s`, W / 2, H * 0.81,
        { size: 13, color: p < 0.25 ? '#ff4757' : '#8f8fb0', font: 'system-ui' });

      if (mensaje) {
        ctx.engine.text(mensaje, W / 2, H * 0.88, { size: 20, color: '#ffd166', glow: 12 });
      }

      for (const i of [0, 1]) {
        ctx.engine.text(`${players[i].name}: ${puntos[i]}`, i === 0 ? 20 : W - 20, H * 0.1, {
          size: 13, color: players[i].color, align: i === 0 ? 'left' : 'right', font: 'system-ui',
        });
      }

      particles.render(g);
      ctx.engine.text('Escribe la palabra con el teclado · vale más cuanto antes la saques',
        W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
    },
  };
}
