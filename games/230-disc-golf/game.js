/**
 * Disc Golf — el disco no vuela recto ni queriendo.
 *
 * Un disco lanzado plano se va SIEMPRE hacia un lado al final del vuelo, cuando
 * pierde velocidad. Aquí eso está simulado: la curva no es constante, aparece
 * cuando el disco se cansa. Por eso apuntar a la cesta es el error de novato —
 * hay que apuntar a un lado y dejar que el disco vuelva.
 *
 * Con la inclinación (hyzer o anhyzer) se elige hacia dónde girará, y con eso
 * se rodean los árboles en vez de rezar para no darles.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
// El disco no usa `integrar`: su vuelo tiene sustentación y giro propios, que
// es justo lo que lo diferencia de una piedra con gravedad.
import { cuerpo } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const TOPE = 10;               // lanzamientos por cesta antes de recoger

const CESTAS = [
  { x: 3, z: -62, arboles: [[-2, -28], [5, -40], [-6, -48], [1, -54]] },
  { x: -9, z: -48, arboles: [[0, -20], [-4, -30], [-10, -36], [-3, -42], [-13, -25]] },
];

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#87b8dc', horizonte: '#c8dcc0', sol: 2.6, solPos: [22, 32, 16],
    sombraArea: 30, fov: 44, niebla: 0.004, lejos: 600,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#5f8f4f', veta: '#527d44', repite: 110, tam: 600 });

  const arboles = new THREE.Group();
  mundo.escena.add(arboles);

  // La cesta: poste, canasta y cadenas insinuadas.
  const cesta = new THREE.Group();
  cesta.add(cilindro(0.07, 0.07, 1.4, mat('#8a8a95', { met: 0.5 }), [0, 0.7, 0]));
  const canasta = cilindro(0.55, 0.42, 0.34, mat('#d8d8e0', { met: 0.7, rug: 0.35 }), [0, 0.9, 0], 20);
  cesta.add(canasta);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    cesta.add(cilindro(0.012, 0.012, 0.55, mat('#c8c8d4', { met: 0.9, rug: 0.2 }),
      [Math.cos(a) * 0.42, 1.45, Math.sin(a) * 0.42], 5));
  }
  cesta.add(cilindro(0.6, 0.6, 0.05, mat('#8a8a95'), [0, 1.75, 0], 20));
  mundo.escena.add(cesta);

  const disco = cuerpo({ x: 0, y: 1.2, z: 0, r: 0.28, masa: 0.18 });
  disco.malla = cilindro(0.28, 0.28, 0.05, mat('#e8523c', { rug: 0.5 }), [0, 1.2, 0], 22);
  mundo.escena.add(disco.malla);
  const sombra = sombraContacto(0.3, 0.3);
  mundo.escena.add(sombra);

  const mira = new THREE.Group();
  mira.add(caja(0.05, 0.05, 5, mat('#ffffff', { emisivo: '#ffffff', brillo: 0.6 }), [0, 0, -2.5]));
  mundo.escena.add(mira);

  let hoyo = 0, turno = 0;
  let jug = [0, 1].map((i) => ({ i, x: i === 0 ? -1.2 : 1.2, z: 0, tiros: 0, dentro: false, total: 0 }));
  let fase = 'apuntar', angulo = 0, inclina = 0, fuerza = 0, cargando = false, reloj = 0;
  let viento = 0, giroActual = 0, aviso = '';
  let marcador = null, acabado = false;

  function montarHoyo() {
    const h = CESTAS[hoyo];
    cesta.position.set(h.x, 0, h.z);
    for (const hijo of [...arboles.children]) { arboles.remove(hijo); hijo.geometry?.dispose?.(); }
    for (const [ax, az] of h.arboles) {
      const tronco = cilindro(0.28, 0.34, 4.5, mat('#5a4028', { rug: 1 }), [ax, 2.25, az]);
      const copa = esfera(2.1, mat('#2f6a34', { rug: 1 }), [ax, 5.4, az], 14);
      arboles.add(tronco, copa);
    }
    viento = (rng() * 2 - 1) * 2.2;
    for (const p of jug) { p.x = p.i === 0 ? -1.2 : 1.2; p.z = 0; p.tiros = 0; p.dentro = false; }
    turno = 0;
    fase = 'apuntar';
    angulo = 0; inclina = 0; fuerza = 0;
  }

  const dist = (p) => Math.hypot(p.x - cesta.position.x, p.z - cesta.position.z);

  function lanzar() {
    const p = jug[turno];
    const v = 12 + fuerza * 20;
    disco.pos.set(p.x, 1.3, p.z);
    disco.vel.set(Math.sin(angulo) * v, 1.4 + fuerza * 1.6, -Math.cos(angulo) * v);
    disco.quieto = false;
    giroActual = inclina;
    p.tiros++;
    fase = 'volando';
    reloj = 0;
    audio.swoosh();
    haptics.impact(turno, 0.7);
  }

  function posar(motivo) {
    const p = jug[turno];
    p.x = disco.pos.x;
    p.z = disco.pos.z;
    aviso = motivo;
    fase = 'juzgar';
    reloj = 0;
  }

  function siguiente() {
    const [a, b] = jug;
    // Tope de lanzamientos: sin él, un disco que se atasca entre árboles puede
    // dejar la cesta abierta para siempre. Se recoge y se anota el máximo.
    for (const p of jug) {
      if (!p.dentro && p.tiros >= TOPE) {
        p.dentro = true;
        aviso = `${players[p.i].name} recoge el disco en ${TOPE}`;
        audio.error();
      }
    }
    if (a.dentro && b.dentro) {
      for (const p of jug) p.total += p.tiros;
      if (hoyo >= CESTAS.length - 1) return rematar();
      hoyo++;
      montarHoyo();
      aviso = `Cesta ${hoyo + 1}`;
      audio.arp([520, 660, 880], 0.07);
      return;
    }
    // Tira el que está más lejos, como en el golf.
    if (a.dentro) turno = 1;
    else if (b.dentro) turno = 0;
    else turno = dist(a) >= dist(b) ? 0 : 1;
    fase = 'apuntar';
    fuerza = 0; cargando = false;
    const p = jug[turno];
    angulo = Math.atan2(cesta.position.x - p.x, -(cesta.position.z - p.z));
    inclina = 0;
  }

  function rematar() {
    acabado = true;
    const [a, b] = jug;
    const gan = a.total === b.total ? -1 : a.total < b.total ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [a.total, b.total],
      detail: gan < 0 ? `Empate a ${a.total} lanzamientos` : `${players[gan].name} gana por ${Math.abs(a.total - b.total)}`,
      record: ctx.record('lanzamientos', Math.min(a.total, b.total), 'low'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: 'Cesta 1' });
      montarHoyo();
      siguiente();
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;
      const pl = input.player(turno);
      const p = jug[turno];

      if (fase === 'apuntar') {
        if (pl.held('left')) angulo -= 0.6 * dt;
        if (pl.held('right')) angulo += 0.6 * dt;
        if (pl.held('up')) inclina = Math.min(1, inclina + 1.2 * dt);
        if (pl.held('down')) inclina = Math.max(-1, inclina - 1.2 * dt);
        if (pl.pressed('a')) { cargando = true; fuerza = 0; }
        if (cargando) {
          fuerza = Math.min(1, fuerza + dt * 0.9);
          if (!pl.held('a') || fuerza >= 1) { cargando = false; lanzar(); }
        }
        disco.pos.set(p.x, 1.2, p.z);
        mira.position.set(p.x, 0.6, p.z);
        mira.rotation.y = -angulo;
        mira.visible = true;
        disco.malla.rotation.z = inclina * 0.5;
      } else if (fase === 'volando') {
        mira.visible = false;
        // Sustentación: mientras vuela rápido casi no cae. Al perder velocidad
        // deja de sostenerse y es justo entonces cuando la curva se come el
        // vuelo, que es como se comporta un disco de verdad.
        const rapidez = Math.hypot(disco.vel.x, disco.vel.z);
        const sustento = Math.min(9.5, rapidez * 0.55);
        disco.vel.y += (sustento - 9.81) * dt;
        // Giro: perpendicular al avance, creciendo según se frena.
        const fatiga = Math.max(0, 1 - rapidez / 22);
        const gx = -disco.vel.z / (rapidez || 1), gz = disco.vel.x / (rapidez || 1);
        const curva = (giroActual * 5 + Math.sign(giroActual || 1) * fatiga * 4.5) * dt;
        disco.vel.x += gx * curva;
        disco.vel.z += gz * curva;
        disco.vel.x += viento * dt;
        disco.pos.addScaledVector(disco.vel, dt);
        disco.vel.multiplyScalar(Math.exp(-0.16 * dt));

        disco.malla.rotation.y += 26 * dt;
        disco.malla.rotation.z = giroActual * 0.6;

        // Árboles: si le da a un tronco, cae ahí mismo.
        for (const [ax, az] of CESTAS[hoyo].arboles) {
          if (Math.hypot(disco.pos.x - ax, disco.pos.z - az) < 0.7 && disco.pos.y < 5) {
            disco.vel.set(0, 0, 0);
            disco.pos.y = 0.1;
            audio.thud();
            haptics.play('impact');
            posar('¡Al árbol!');
          }
        }

        // Cesta: hay que entrar por arriba y sin ir a mil.
        const dc = Math.hypot(disco.pos.x - cesta.position.x, disco.pos.z - cesta.position.z);
        if (dc < 0.6 && disco.pos.y > 0.7 && disco.pos.y < 1.8 && rapidez < 15) {
          p.dentro = true;
          disco.vel.set(0, 0, 0);
          disco.pos.set(cesta.position.x, 0.95, cesta.position.z);
          audio.arp([700, 950, 1250], 0.06);
          haptics.play('score', { player: turno });
          posar(`¡Dentro! ${p.tiros} lanzamientos`);
        } else if (dc < 1 && disco.pos.y > 0.6 && disco.pos.y < 2) {
          // Rozar las cadenas frena el disco en seco.
          disco.vel.multiplyScalar(0.45);
          audio.tick();
        }

        if (disco.pos.y <= 0.1 && fase === 'volando') {
          disco.pos.y = 0.1;
          audio.tick();
          posar(`a ${dist({ x: disco.pos.x, z: disco.pos.z }).toFixed(1)} m de la cesta`);
        }
        if (reloj > 12 && fase === 'volando') posar('fuera de límites');
      } else if (fase === 'juzgar') {
        if (reloj > 1.6) siguiente();
      }

      disco.malla.position.copy(disco.pos);
      ajustarSombra(sombra, disco.malla, 0, 10);

      const foco = fase === 'volando' ? disco.pos : new THREE.Vector3(p.x, 1, p.z);
      const hacia = new THREE.Vector3(cesta.position.x - foco.x, 0, cesta.position.z - foco.z).normalize();
      mundo.camara.position.lerp(
        new THREE.Vector3(foco.x - hacia.x * 9, 5.5, foco.z - hacia.z * 9), Math.min(1, dt * 2.4),
      );
      mundo.camara.lookAt(foco.x + hacia.x * 10, 1.4, foco.z + hacia.z * 10);

      marcador?.update(jug[0].total + jug[0].tiros, jug[1].total + jug[1].tiros);
      panel.centro(fase === 'apuntar'
        ? `<b style="color:${players[turno].color}">${players[turno].name}</b> · cesta ${hoyo + 1}/${CESTAS.length} · ${Math.round(dist(p))} m`
        : aviso || 'volando…');
      panel.sub(`lanzamientos: ${jug[0].total + jug[0].tiros} — ${jug[1].total + jug[1].tiros}`
        + ` · ${inclina > 0.15 ? 'anhyzer (curva a la derecha)' : inclina < -0.15 ? 'hyzer (curva a la izquierda)' : 'plano'}`
        + ` · viento ${viento > 0 ? '→' : '←'} ${Math.abs(viento).toFixed(1)}`);
      panel.pie('← → apuntan · ↑ ↓ inclinan el disco · mantén tu tecla para cargar y suéltala para lanzar');
      panel.barra(fase === 'apuntar' ? fuerza : null, players[turno].color);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
