/**
 * Dibuja y Adivina — el iPad es el lienzo y la Mac es la mesa de todos.
 *
 * Quien dibuja recibe la palabra SOLO en su mando y traza con el dedo; el
 * trazo aparece en la pantalla grande según lo va haciendo. Quien adivina
 * escribe en el teclado, letra a letra, y se le va marcando lo que lleva bien.
 *
 * No se puede escribir ni hablar de más: si el que dibuja escribe letras o
 * números en su lienzo… bueno, eso ya no lo puede vigilar el programa, pero
 * el marcador sí puede castigar la tardanza, y lo hace.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const RONDAS = 6;
const TIEMPO = 70;
const PALABRAS = [
  'jirafa', 'submarino', 'volcan', 'guitarra', 'faro', 'cactus', 'cohete', 'pulpo',
  'castillo', 'paraguas', 'semaforo', 'tostadora', 'pinguino', 'molino', 'escoba',
  'helado', 'brujula', 'tiburon', 'bicicleta', 'cactus', 'sombrero', 'telescopio',
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let palabra = '', escrito = '', trazos = [], actual = null;
  let dibujante = 0, ronda = 1, reloj = TIEMPO, fase = 'dibujando', espera = 0;
  const puntos = [0, 0];
  let sb = null, soltar = () => {}, t = 0, mensaje = '';

  function repartirMandos() {
    ctx.mando.perfil(dibujante, {
      disposicion: 'pila',
      juego: 'Dibuja y Adivina',
      pie: 'Dibuja con el dedo · no escribas la palabra',
      controles: [
        { tipo: 'secreto', titulo: 'Te toca dibujar', texto: palabra.toUpperCase(), dato: `ronda ${ronda} de ${RONDAS}` },
        { tipo: 'trazo', pista: 'Dibuja aquí' },
      ],
    });
    ctx.mando.perfil(1 - dibujante, {
      disposicion: 'solo',
      juego: 'Dibuja y Adivina',
      pie: 'Escribe en el teclado de la Mac',
      controles: [{ tipo: 'acciones', botones: [{ a: 'a', etiqueta: 'Paso', glifo: '⏭' }] }],
    });
  }

  function nuevaRonda() {
    palabra = PALABRAS[Math.floor(rng() * PALABRAS.length)].toUpperCase();
    escrito = '';
    trazos = [];
    actual = null;
    reloj = TIEMPO;
    fase = 'dibujando';
    mensaje = '';
    repartirMandos();
    audio.select();
  }

  function acertar() {
    const gana = 10 + Math.round(reloj * 0.5);
    puntos[1 - dibujante] += gana;
    puntos[dibujante] += Math.round(gana * 0.6);   // el que dibuja también cobra
    mensaje = `¡${palabra}! +${gana}`;
    audio.win();
    haptics.victory(1 - dibujante);
    particles.burst(W / 2, H * 0.5, 26, { speed: 250, color: players[1 - dibujante].color, size: 5, drag: 0.9 });
    sb.update(puntos[0], puntos[1]);
    fase = 'resuelta';
    espera = 2.2;
  }

  function tecla(e) {
    if (fase !== 'dibujando') return;
    if (e.code === 'Backspace') { escrito = escrito.slice(0, -1); return; }
    if (!/^Key[A-Z]$/.test(e.code)) return;
    escrito += e.code.slice(3);
    if (!palabra.startsWith(escrito)) {
      escrito = '';
      audio.error();
      haptics.error(1 - dibujante);
      return;
    }
    audio.tone({ freq: 480 + escrito.length * 24, dur: 0.03, gain: 0.08, type: 'triangle' });
    if (escrito === palabra) acertar();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      nuevaRonda();
      sb = ui.scoreboard({ center: `ronda ${ronda} de ${RONDAS}` });
      soltar = input.onAny(tecla);
    },
    destroy() { soltar(); sb?.remove(); },
    resize(nw, nh) { W = nw; H = nh; },

    update(dt) {
      t += dt;
      particles.update(dt);

      if (fase === 'resuelta') {
        espera -= dt;
        if (espera > 0) return;
        if (ronda >= RONDAS) {
          const g = puntos[0] === puntos[1] ? -1 : (puntos[0] > puntos[1] ? 0 : 1);
          ctx.finish({ winner: g, scores: puntos, detail: `${RONDAS} palabras dibujadas` });
          return;
        }
        ronda++;
        dibujante = 1 - dibujante;
        sb.setCenter(`ronda ${ronda} de ${RONDAS}`);
        nuevaRonda();
        return;
      }

      // Trazos que llegan del mando del dibujante.
      const nuevos = input.player(dibujante).tomarTrazos();
      for (const puntos2 of nuevos) {
        if (Array.isArray(puntos2) && puntos2.length) trazos.push(puntos2);
      }
      if (trazos.length > 200) trazos.shift();

      // Pasar palabra: el dibujante puede rendirse con su botón.
      if (input.player(dibujante).pressed('a')) {
        mensaje = `Era ${palabra}`;
        audio.back();
        fase = 'resuelta';
        espera = 2;
      }

      reloj -= dt;
      if (reloj <= 0) {
        mensaje = `Se acabó el tiempo · era ${palabra}`;
        audio.lose();
        fase = 'resuelta';
        espera = 2.2;
      }
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#0d0c14');

      // Lienzo grande
      const lx = W * 0.1, ly = H * 0.16, lw = W * 0.8, lh = H * 0.58;
      g.fillStyle = '#f6f4ec';
      g.beginPath(); g.roundRect(lx, ly, lw, lh, 12); g.fill();

      g.save();
      g.beginPath(); g.roundRect(lx, ly, lw, lh, 12); g.clip();
      g.strokeStyle = players[dibujante].color;
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const linea of trazos) {
        g.beginPath();
        linea.forEach((p, i) => {
          // Los trazos llegan normalizados 0..1 desde el mando.
          const x = lx + clamp(p.x ?? p[0] ?? 0, 0, 1) * lw;
          const y = ly + clamp(p.y ?? p[1] ?? 0, 0, 1) * lh;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        });
        g.stroke();
      }
      g.restore();

      if (!trazos.length) {
        ctx.engine.text(ctx.mando.activo(dibujante) ? 'dibujando…' : 'esperando al mando…',
          W / 2, ly + lh / 2, { size: 16, color: '#b8b2a0', font: 'system-ui' });
      }

      ctx.engine.text(`${players[dibujante].name} dibuja · ${players[1 - dibujante].name} adivina`,
        W / 2, H * 0.1, { size: 15, color: players[dibujante].color, font: 'system-ui' });

      // Palabra en huecos
      const n = palabra.length;
      const paso = Math.min(38, (W * 0.7) / n);
      for (let i = 0; i < n; i++) {
        const x = W / 2 + (i - (n - 1) / 2) * paso;
        const y = H * 0.82;
        const puesta = i < escrito.length;
        const revelar = fase === 'resuelta';
        g.fillStyle = puesta ? `${players[1 - dibujante].color}44` : '#ffffff08';
        g.fillRect(x - paso * 0.38, y - paso * 0.42, paso * 0.76, paso * 0.84);
        g.fillStyle = puesta ? players[1 - dibujante].color : '#3a3a55';
        g.fillRect(x - paso * 0.38, y + paso * 0.42, paso * 0.76, 3);
        if (puesta || revelar) {
          ctx.engine.text(palabra[i], x, y, { size: paso * 0.5, color: puesta ? '#ffffff' : '#8a8aa8' });
        }
      }

      const bw = W * 0.4;
      g.fillStyle = '#1a1a2c';
      g.fillRect(W / 2 - bw / 2, H * 0.89, bw, 7);
      g.fillStyle = reloj < 15 ? '#ff4757' : '#ffd166';
      g.fillRect(W / 2 - bw / 2, H * 0.89, bw * clamp(reloj / TIEMPO, 0, 1), 7);

      if (mensaje) ctx.engine.text(mensaje, W / 2, H * 0.94, { size: 17, color: '#ffd166', glow: 10 });

      particles.render(g);
      if (!ctx.mando.haySala) {
        ctx.engine.text('Este juego necesita un mando táctil para dibujar · Menú → Mandos',
          W / 2, H - 12, { size: 12, color: '#ffd166', font: 'system-ui' });
      } else {
        ctx.engine.text('El que adivina escribe en el teclado de la Mac',
          W / 2, H - 12, { size: 11, color: '#5a5a78', font: 'system-ui' });
      }
    },
  };
}
