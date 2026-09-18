/**
 * Cuento a Dos — una historia que se escribe eligiendo, por turnos.
 *
 * Cada turno salen tres continuaciones posibles y el que tiene el turno se
 * queda con una. No hay respuestas buenas ni malas: hay TONOS. Elegir en el
 * mismo tono que venía suma armonía, y romperlo la baja, así que la partida
 * se convierte en leerle el gusto al otro.
 *
 * Al final se lee el cuento entero, con vuestros nombres dentro. Eso es todo
 * el premio y es suficiente.
 */

import { clamp } from '../../core/math2d.js';

export const meta = { render: 'canvas', sinCuentaAtras: true };

const CAPITULOS = 8;
const TONOS = {
  ternura: { nombre: 'ternura', color: '#ff6ec7' },
  aventura: { nombre: 'aventura', color: '#ffd166' },
  disparate: { nombre: 'disparate', color: '#a8ff3e' },
  misterio: { nombre: 'misterio', color: '#b04cff' },
};

/** Banco de continuaciones por capítulo. {P1}/{P2} se sustituyen por los nombres. */
const BANCO = [
  [
    { t: 'ternura', txt: '{P1} se despertó con la casa oliendo a tostadas y supo que el día iba a ser largo.' },
    { t: 'aventura', txt: 'El mapa llevaba tres años en el cajón y esa mañana {P1} decidió abrirlo.' },
    { t: 'disparate', txt: 'La nevera de {P1} amaneció hablando en gallego, y no era la primera vez.' },
  ],
  [
    { t: 'misterio', txt: 'En el buzón había un sobre sin remite con una llave pequeña dentro.' },
    { t: 'ternura', txt: '{P2} había dejado una nota en la puerta: «hoy conduzco yo».' },
    { t: 'aventura', txt: 'El tren de las siete salía en cuatro minutos y estaba a seis de distancia.' },
  ],
  [
    { t: 'disparate', txt: 'Por el camino se les unió un perro con sombrero que se negó a explicarse.' },
    { t: 'misterio', txt: 'Las farolas del pueblo se apagaron todas a la vez al pasar ellos.' },
    { t: 'aventura', txt: 'Cruzaron el puente viejo justo cuando empezaba a crujir.' },
  ],
  [
    { t: 'ternura', txt: 'Pararon a comer en un bar donde el dueño les fio el café.' },
    { t: 'disparate', txt: 'El GPS insistía en que el mar estaba a la izquierda. Estaba arriba.' },
    { t: 'misterio', txt: 'Una señora les dijo el nombre de {P2} sin que nadie se lo hubiera dicho.' },
  ],
  [
    { t: 'aventura', txt: 'La subida era peor de lo que decía el cartel, y el cartel ya avisaba.' },
    { t: 'ternura', txt: '{P1} se paró a mirar atrás y esperó a que {P2} llegara sin decirlo.' },
    { t: 'misterio', txt: 'Al fondo del sendero había una puerta sin casa alrededor.' },
  ],
  [
    { t: 'disparate', txt: 'Detrás de la puerta había exactamente lo mismo, pero al revés.' },
    { t: 'aventura', txt: 'Detrás de la puerta se veía el valle entero y muy poco suelo.' },
    { t: 'ternura', txt: 'Detrás de la puerta había una silla, dos tazas y nadie más.' },
  ],
  [
    { t: 'misterio', txt: 'La llave del sobre abría esa puerta. Nunca supieron quién la mandó.' },
    { t: 'ternura', txt: 'Se sentaron sin hablar hasta que se hizo de noche del todo.' },
    { t: 'disparate', txt: 'El perro del sombrero apareció otra vez y esta vez sí se explicó.' },
  ],
  [
    { t: 'ternura', txt: 'Volvieron tarde, sin fotos, contándoselo mal el uno al otro.' },
    { t: 'aventura', txt: 'Volvieron ya de madrugada y con planes para el sábado siguiente.' },
    { t: 'misterio', txt: 'Volvieron con la llave. Sigue en el cajón, por si acaso.' },
  ],
];

export function create(ctx) {
  const { input, audio, haptics, ui, players, particles, rng } = ctx;

  let W = ctx.W, H = ctx.H;
  let capitulo = 0, opciones = [], cursor = 0, turno = 0;
  let historia = [], armonia = 50, ultimoTono = null, t = 0, terminado = false;
  let sb = null, fase = 'eligiendo', espera = 0;

  const rellenar = (s) => s.replace(/\{P1\}/g, players[0].name).replace(/\{P2\}/g, players[1].name);

  function preparar() {
    const banco = BANCO[capitulo];
    opciones = [...banco].sort(() => rng() - 0.5);
    cursor = 0;
  }

  function elegir() {
    const o = opciones[cursor];
    historia.push({ txt: rellenar(o.txt), tono: o.t, por: turno });
    const encaja = ultimoTono === null || ultimoTono === o.t;
    armonia = clamp(armonia + (encaja ? 9 : -6), 0, 100);
    ultimoTono = o.t;
    audio.select();
    haptics.score(turno);
    particles.burst(W / 2, H * 0.5, 14, { speed: 170, color: TONOS[o.t].color, size: 4, drag: 0.9 });
    sb.update(historia.length, Math.round(armonia));

    capitulo++;
    if (capitulo >= CAPITULOS) { fase = 'leyendo'; espera = 0; return; }
    turno = 1 - turno;
    preparar();
  }

  return {
    init() {
      W = ctx.W; H = ctx.H;
      capitulo = 0;
      historia = [];
      preparar();
      sb = ui.scoreboard({ center: `${CAPITULOS} capítulos` });
    },
    resize(nw, nh) { W = nw; H = nh; },
    destroy() { sb?.remove(); },

    update(dt) {
      if (terminado) return;
      t += dt;
      particles.update(dt);

      if (fase === 'leyendo') {
        espera += dt;
        // Un rato para leer el cuento entero antes de cerrar.
        if (espera > 3 && (input.player(0).pressed('a') || input.player(1).pressed('a') || espera > 26)) {
          terminado = true;
          audio.win();
          ctx.finish({
            winner: -1,
            scores: [Math.round(armonia), historia.length],
            detail: `Cuento terminado con ${Math.round(armonia)} de armonía`,
            record: ctx.record('armonia', Math.round(armonia), 'high'),
          });
        }
        return;
      }

      const pl = input.player(turno);
      if (pl.pressed('up') || pl.pressed('left')) { cursor = (cursor + opciones.length - 1) % opciones.length; audio.tick(); }
      if (pl.pressed('down') || pl.pressed('right')) { cursor = (cursor + 1) % opciones.length; audio.tick(); }
      if (pl.pressed('a')) elegir();
    },

    render() {
      const g = ctx.c;
      ctx.engine.clear('#141019');

      // Papel
      g.fillStyle = '#f3ecdc';
      g.beginPath(); g.roundRect(W * 0.08, H * 0.06, W * 0.84, H * 0.86, 12); g.fill();
      g.fillStyle = '#e3d9c2';
      g.fillRect(W * 0.08, H * 0.06, W * 0.84, 6);

      if (fase === 'leyendo') {
        ctx.engine.text('Vuestro cuento', W / 2, H * 0.13, { size: 22, color: '#3a2f22', font: 'system-ui' });
        historia.forEach((h, i) => {
          const y = H * 0.2 + i * H * 0.082;
          g.fillStyle = TONOS[h.tono].color;
          g.fillRect(W * 0.11, y - 8, 4, 18);
          ctx.engine.text(h.txt, W * 0.13, y, {
            size: Math.min(15, W * 0.017), color: '#2a2318', align: 'left', font: 'system-ui',
          });
        });
        ctx.engine.text(`armonía ${Math.round(armonia)} · pulsad para cerrar el libro`,
          W / 2, H * 0.89, { size: 13, color: '#7a6a52', font: 'system-ui' });
        particles.render(g);
        return;
      }

      // Lo escrito hasta ahora, en pequeño.
      historia.slice(-3).forEach((h, i) => {
        ctx.engine.text(h.txt, W / 2, H * 0.15 + i * 26, {
          size: 13, color: '#8a7c64', font: 'system-ui',
        });
      });

      ctx.engine.text(`Capítulo ${capitulo + 1} · le toca a ${players[turno].name}`,
        W / 2, H * 0.3, { size: 17, color: players[turno].color, font: 'system-ui' });

      opciones.forEach((o, i) => {
        const y = H * 0.42 + i * H * 0.14;
        const sel = i === cursor;
        g.save();
        g.fillStyle = sel ? `${TONOS[o.t].color}22` : '#00000008';
        g.beginPath(); g.roundRect(W * 0.13, y - H * 0.055, W * 0.74, H * 0.11, 10); g.fill();
        g.strokeStyle = sel ? TONOS[o.t].color : '#00000018';
        g.lineWidth = sel ? 3 : 1;
        g.beginPath(); g.roundRect(W * 0.13, y - H * 0.055, W * 0.74, H * 0.11, 10); g.stroke();
        g.restore();
        ctx.engine.text(rellenar(o.txt), W / 2, y - 6, {
          size: Math.min(15, W * 0.017), color: '#2a2318', font: 'system-ui',
        });
        ctx.engine.text(TONOS[o.t].nombre, W / 2, y + 18, {
          size: 11, color: TONOS[o.t].color, font: 'system-ui',
        });
      });

      // Armonía
      g.fillStyle = '#00000012';
      g.fillRect(W * 0.3, H * 0.87, W * 0.4, 10);
      g.fillStyle = ultimoTono ? TONOS[ultimoTono].color : '#8a7c64';
      g.fillRect(W * 0.3, H * 0.87, W * 0.4 * (armonia / 100), 10);
      ctx.engine.text(`armonía ${Math.round(armonia)}${ultimoTono ? ` · el cuento va de ${TONOS[ultimoTono].nombre}` : ''}`,
        W / 2, H * 0.845, { size: 12, color: '#7a6a52', font: 'system-ui' });

      particles.render(g);
    },
  };
}
