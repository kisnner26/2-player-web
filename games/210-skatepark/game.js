/**
 * Skatepark — un minuto de bowl y la regla de que repetir no puntúa.
 *
 * Cada truco vale lo suyo, pero el segundo igual vale la mitad y el tercero
 * casi nada. Así que no se gana encontrando el truco fácil y machacándolo: se
 * gana variando, que es exactamente de lo que va patinar.
 *
 * La velocidad se saca bombeando en las paredes del bowl, no acelerando. Sin
 * velocidad no hay altura, y sin altura no da tiempo a girar.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom' };

const TIEMPO = 60;
const TRUCOS = [
  { id: 'ollie', nombre: 'Ollie', base: 60, giros: 0 },
  { id: 'kick', nombre: 'Kickflip', base: 140, giros: 1 },
  { id: '360', nombre: '360 Shove-it', base: 220, giros: 2 },
  { id: 'grind', nombre: 'Grind', base: 180, giros: 0 },
];

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#2a2438', horizonte: '#4a4058', sol: 2.2, solPos: [14, 26, 12],
    sombraArea: 26, fov: 46,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#4a4a54', veta: '#42424c', repite: 40 });

  /** Bowl: perfil en U a lo ancho (X). El eje Z es la longitud del bowl. */
  const ANCHO = 16;
  const perfil = (x) => Math.pow(Math.abs(x) / (ANCHO / 2), 2.4) * 6;
  for (let x = -ANCHO / 2; x <= ANCHO / 2; x += 0.8) {
    const y = perfil(x);
    const l = caja(0.9, 0.4, 22, mat('#6a6a78', { rug: 0.8 }), [x, y - 0.2, 0]);
    l.receiveShadow = true;
    mundo.escena.add(l);
  }
  // Barandilla para los grinds
  const barra = cilindro(0.12, 0.12, 12, mat('#c9c9d8', { met: 0.8, rug: 0.25 }), [0, 1.1, -6]);
  barra.rotation.x = Math.PI / 2;
  mundo.escena.add(barra);

  const jug = [0, 1].map((i) => {
    const g = new THREE.Group();
    const c = cilindro(0.26, 0.3, 1.6, mat(players[i].color, { rug: 0.6 }), [0, 0.8, 0]);
    c.castShadow = true;
    g.add(c, esfera(0.23, mat('#e0b890'), [0, 1.76, 0], 12));
    g.add(caja(0.5, 0.08, 1.5, mat('#2a2a38'), [0, -0.06, 0]));
    mundo.escena.add(g);
    return {
      i, g, x: i === 0 ? -3 : 3, z: i === 0 ? 4 : -4, y: 0,
      vx: 0, vy: 0, vz: 0, aire: false, giro: 0, puntos: 0,
      hechos: {}, truco: null, aviso: '', avisoT: 0,
    };
  });

  let reloj = TIEMPO, marcador = null, terminado = false, t = 0;

  function hacerTruco(p, k) {
    if (!p.aire) return;
    const T = TRUCOS[k];
    const veces = p.hechos[T.id] || 0;
    // Repetir vale cada vez menos: es la regla que obliga a variar.
    const factor = Math.pow(0.45, veces);
    const alturaBonus = Math.min(2, p.y / 3);
    const gana = Math.round(T.base * factor * (1 + alturaBonus));
    p.hechos[T.id] = veces + 1;
    p.puntos += gana;
    p.truco = T;
    p.giro = T.giros * Math.PI * 2;
    p.aviso = `${T.nombre} +${gana}${veces ? ` (×${veces + 1})` : ''}`;
    p.avisoT = 1.5;
    audio.pickup();
    haptics.score(p.i);
    marcador.update(jug[0].puntos, jug[1].puntos);
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${TIEMPO}s de sesión` });
      mundo.camara.position.set(0, 12, 22);
      mundo.camara.lookAt(0, 1, 0);
    },

    update(dt) {
      if (terminado) return;
      t += dt;
      reloj -= dt;

      for (const p of jug) {
        p.avisoT = Math.max(0, p.avisoT - dt);
        const pl = input.player(p.i);
        const sueloY = perfil(p.x);

        if (!p.aire) {
          // Bombear: acelerar hacia abajo de la pared da velocidad de verdad.
          const pendiente = (perfil(p.x + 0.2) - perfil(p.x - 0.2)) / 0.4;
          p.vx -= pendiente * 22 * dt;
          if (pl.held('left')) p.vx -= 9 * dt;
          if (pl.held('right')) p.vx += 9 * dt;
          p.vz += (pl.held('up') ? -1 : pl.held('down') ? 1 : 0) * 8 * dt;
          p.vx *= Math.exp(-0.45 * dt);
          p.vz *= Math.exp(-1.2 * dt);
          p.y = sueloY;
          if (pl.pressed('a')) {
            // El salto sale con la velocidad que traigas: sin bombear no hay aire.
            p.vy = 4.2 + Math.min(7, Math.abs(p.vx) * 0.55);
            p.aire = true;
            p.truco = null;
            audio.jump();
            haptics.tap(p.i);
          }
        } else {
          p.vy -= 17 * dt;
          p.y += p.vy * dt;
          if (pl.pressed('a')) hacerTruco(p, 0);
          if (pl.pressed('b')) hacerTruco(p, 1);
          if (pl.pressed('up')) hacerTruco(p, 2);
          if (pl.pressed('down')) hacerTruco(p, 3);
          if (p.y <= perfil(p.x)) {
            p.y = perfil(p.x);
            p.aire = false;
            p.vy = 0;
            // Caer girado sin haber completado el giro te frena.
            if (p.giro > 0.3) { p.vx *= 0.4; p.aviso = 'caída sucia'; p.avisoT = 1.2; audio.thud(); }
            p.giro = 0;
          }
        }

        p.x = Math.max(-ANCHO / 2, Math.min(ANCHO / 2, p.x + p.vx * dt));
        p.z = Math.max(-10, Math.min(10, p.z + p.vz * dt));
        p.giro = Math.max(0, p.giro - dt * 9);
        p.g.position.set(p.x, p.y, p.z);
        p.g.rotation.y = p.giro;
        p.g.rotation.z = -Math.atan((perfil(p.x + 0.2) - perfil(p.x - 0.2)) / 0.4) * 0.6;
      }

      if (reloj <= 0) {
        terminado = true;
        const g = jug[0].puntos === jug[1].puntos ? -1 : (jug[0].puntos > jug[1].puntos ? 0 : 1);
        audio.win();
        ctx.finish({
          winner: g, scores: [jug[0].puntos, jug[1].puntos],
          detail: `${Object.keys(jug[0].hechos).length} y ${Object.keys(jug[1].hechos).length} trucos distintos`,
          record: ctx.record('puntos', Math.max(jug[0].puntos, jug[1].puntos), 'high'),
        });
        return;
      }

      panel.centro(`${Math.ceil(reloj)}s · ${jug[0].puntos} — ${jug[1].puntos}`);
      panel.sub(jug.map((p) => (p.avisoT > 0 ? `<b style="color:${players[p.i].color}">${p.aviso}</b>` : '')).filter(Boolean).join(' · ')
        || 'bombea en las paredes para coger velocidad');
      panel.pie('Tu tecla: saltar y ollie · especial: kickflip · ↑ 360 · ↓ grind · repetir el mismo truco vale menos');
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
