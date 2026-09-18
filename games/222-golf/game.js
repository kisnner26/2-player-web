/**
 * Golf — dos hoyos largos, con viento, búnker y un lago que se cobra lo suyo.
 *
 * Tira el que está MÁS LEJOS del hoyo, como en el golf de verdad. Eso hace que
 * un buen drive no solo te acerque: también te quita el turno, así que el otro
 * pega dos veces seguidas y puede pasarte sin que puedas responder.
 *
 * El palo cambia el ángulo de salida: con el hierro la bola vuela y se para
 * antes; con el putt rueda. En el green solo el putt entra: pegar alto ahí es
 * pasarse siempre.
 */

import { crearMundo, crearPanel, suelo, mat, caja, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, rodar, rodarMalla, rebotarSuelo } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const PALOS = [
  { nombre: 'Madera', ang: 0.30, fuerza: 34 },
  { nombre: 'Hierro', ang: 0.52, fuerza: 24 },
  { nombre: 'Wedge',  ang: 0.75, fuerza: 15 },
  { nombre: 'Putt',   ang: 0.02, fuerza: 9 },
];

const TOPE_GOLPES = 12;        // más que esto en un hoyo ya no es un hoyo

const HOYOS = [
  { largo: 112, banderaX: 4, agua: [{ x: -3, z: -74, r: 9 }], bunker: [{ x: 7, z: -96, r: 6 }] },
  { largo: 88, banderaX: -6, agua: [], bunker: [{ x: -2, z: -52, r: 7 }, { x: -9, z: -78, r: 5 }] },
];

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#7fb8e0', horizonte: '#cfe4c0', sol: 2.6, solPos: [26, 34, 16],
    sombraArea: 34, fov: 42, niebla: 0.004, lejos: 700,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#5e8f4a', veta: '#4f7d3f', repite: 120, tam: 700 });

  let hoyo = 0;
  const decorado = new THREE.Group();
  mundo.escena.add(decorado);

  const bandera = new THREE.Group();
  const mastil = cilindro(0.04, 0.04, 2.4, mat('#e8e8e8'), [0, 1.2, 0]);
  const trapo = caja(0.9, 0.5, 0.03, mat('#e8523c'), [0.45, 2.1, 0]);
  const copa = cilindro(0.35, 0.35, 0.06, mat('#1a1a1a'), [0, 0.03, 0], 18);
  bandera.add(mastil, trapo, copa);
  mundo.escena.add(bandera);

  const bolas = [0, 1].map((i) => {
    const c = cuerpo({ x: i === 0 ? -1 : 1, y: 0.18, z: 0, r: 0.18, masa: 0.05 });
    c.malla = esfera(0.18, mat('#f6f6f0', { rug: 0.35 }), [c.pos.x, 0.18, 0], 16);
    mundo.escena.add(c.malla);
    const s = sombraContacto(0.22, 0.3);
    mundo.escena.add(s);
    return { i, c, s, golpes: 0, dentro: false, total: 0 };
  });

  const mira = new THREE.Group();
  const flecha = cilindro(0.05, 0.05, 5, mat('#ffffff', { emisivo: '#ffffff', brillo: 0.6 }), [0, 0.1, -2.5]);
  flecha.rotation.x = Math.PI / 2;
  mira.add(flecha);
  mundo.escena.add(mira);

  let turno = 0, fase = 'apuntar', angulo = 0, palo = 0, fuerza = 0, cargando = false;
  let viento = new THREE.Vector3(0, 0, 0);
  let marcador = null, acabado = false, aviso = '';

  function montarHoyo() {
    // Se limpia el decorado del hoyo anterior y se pone el nuevo.
    for (const hijo of [...decorado.children]) {
      decorado.remove(hijo);
      hijo.geometry?.dispose?.();
    }
    const h = HOYOS[hoyo];
    bandera.position.set(h.banderaX, 0, -h.largo);
    // Green: un disco de hierba más clara alrededor del hoyo.
    const green = new THREE.Mesh(
      new THREE.CircleGeometry(9, 28),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#7fc464'), roughness: 0.9 }),
    );
    green.rotation.x = -Math.PI / 2;
    green.position.set(h.banderaX, 0.02, -h.largo);
    green.receiveShadow = true;
    decorado.add(green);
    for (const a of h.agua) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(a.r, 24),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#2f6f9e'), roughness: 0.2, metalness: 0.4 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(a.x, 0.03, a.z);
      decorado.add(m);
    }
    for (const b of h.bunker) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(b.r, 24),
        new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0cf9a'), roughness: 1 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(b.x, 0.025, b.z);
      decorado.add(m);
    }
    for (const b of bolas) {
      b.c.pos.set(b.i === 0 ? -1.2 : 1.2, 0.18, 0);
      b.c.vel.set(0, 0, 0);
      b.c.quieto = false;
      b.golpes = 0;
      b.dentro = false;
    }
    viento.set((rng() * 2 - 1) * 2.6, 0, (rng() * 2 - 1) * 1.6);
    turno = 0;
    fase = 'apuntar';
    angulo = 0; palo = 0; fuerza = 0; cargando = false;
  }

  const dist = (b) => Math.hypot(b.c.pos.x - bandera.position.x, b.c.pos.z - bandera.position.z);

  /** Terreno bajo una bola: define la fricción y si hay penalización. */
  function terreno(b) {
    const h = HOYOS[hoyo];
    for (const a of h.agua) if (Math.hypot(b.c.pos.x - a.x, b.c.pos.z - a.z) < a.r) return 'agua';
    for (const s of h.bunker) if (Math.hypot(b.c.pos.x - s.x, b.c.pos.z - s.z) < s.r) return 'bunker';
    if (dist(b) < 9) return 'green';
    if (Math.abs(b.c.pos.x - bandera.position.x * (1 - dist(b) / h.largo)) > 16) return 'rough';
    return 'calle';
  }

  function friccion(t) {
    return t === 'green' ? 0.65 : t === 'calle' ? 1.5 : t === 'bunker' ? 7 : 3.2;
  }

  function pegar() {
    const b = bolas[turno];
    const p = PALOS[palo];
    const v = p.fuerza * (0.25 + fuerza * 0.75);
    const dirX = Math.sin(angulo), dirZ = -Math.cos(angulo);
    const t = terreno(b);
    // En el búnker la bola sale con la mitad de fuerza: la arena se come el golpe.
    const merma = t === 'bunker' ? 0.55 : 1;
    b.c.vel.set(dirX * v * Math.cos(p.ang) * merma, v * Math.sin(p.ang) * merma, dirZ * v * Math.cos(p.ang) * merma);
    b.c.quieto = false;
    b.golpes++;
    fase = 'rodando';
    audio.hit();
    haptics.impact(turno, 0.9);
  }

  function siguienteTurno() {
    const [a, b] = bolas;
    if (a.dentro && b.dentro) return cerrarHoyo();
    // Tira el que está más lejos; si uno ya ha embocado, tira el otro.
    if (a.dentro) turno = 1;
    else if (b.dentro) turno = 0;
    else turno = dist(a) >= dist(b) ? 0 : 1;
    fase = 'apuntar';
    fuerza = 0;
    cargando = false;
    // El putt se ofrece solo en green: es lo que uno haría de todas formas.
    if (terreno(bolas[turno]) === 'green') palo = 3;
    else if (palo === 3) palo = 1;
    // Se apunta a bandera por defecto para no empezar de espaldas.
    const b2 = bolas[turno];
    angulo = Math.atan2(bandera.position.x - b2.c.pos.x, -(bandera.position.z - b2.c.pos.z));
  }

  function cerrarHoyo() {
    for (const b of bolas) b.total += b.golpes;
    if (hoyo >= HOYOS.length - 1) return rematar();
    hoyo++;
    montarHoyo();
    aviso = `Hoyo ${hoyo + 1}`;
    audio.arp([520, 660, 880], 0.07);
  }

  function rematar() {
    acabado = true;
    const [a, b] = bolas;
    const gan = a.total === b.total ? -1 : a.total < b.total ? 0 : 1;
    audio.win();
    if (gan >= 0) haptics.victory(gan);
    ctx.finish({
      winner: gan,
      scores: [a.total, b.total],
      detail: gan < 0 ? `Empate a ${a.total} golpes` : `${players[gan].name} gana por ${Math.abs(a.total - b.total)} golpe(s)`,
      record: ctx.record('golpes', Math.min(a.total, b.total), 'low'),
    });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: 'Hoyo 1' });
      montarHoyo();
      siguienteTurno();
    },

    update(dt) {
      if (acabado) return;
      const b = bolas[turno];
      const pl = input.player(turno);

      if (fase === 'apuntar') {
        if (pl.held('left')) angulo -= 0.7 * dt;
        if (pl.held('right')) angulo += 0.7 * dt;
        if (pl.pressed('up')) palo = Math.max(0, palo - 1);
        if (pl.pressed('down')) palo = Math.min(PALOS.length - 1, palo + 1);

        // Carga manteniendo la tecla; al soltar, se pega con lo que hubiera.
        if (pl.pressed('a')) { cargando = true; fuerza = 0; }
        if (cargando) {
          fuerza = Math.min(1, fuerza + dt * 0.85);
          if (!pl.held('a') || fuerza >= 1) { cargando = false; pegar(); }
        }

        mira.position.copy(b.c.pos);
        mira.position.y = 0.05;
        mira.rotation.y = -angulo;
        mira.visible = true;
      } else {
        mira.visible = false;
        let quietas = true;
        for (const bb of bolas) {
          if (bb.dentro) continue;
          const t = terreno(bb);
          integrar(bb.c, dt, { arrastre: 0.06, viento });
          const imp = rebotarSuelo(bb.c, 0, {
            restitucion: t === 'bunker' ? 0.08 : t === 'green' ? 0.35 : 0.42,
            friccion: t === 'bunker' ? 0.35 : 0.86,
            minRebote: 0.5,
          });
          if (imp > 2) audio.tick();
          rodar(bb.c, dt, { friccion: friccion(t), umbral: 0.12 });
          rodarMalla(bb.c, dt);
          bb.c.malla.position.copy(bb.c.pos);

          if (t === 'agua') {
            // Agua: golpe de penalización y se repone donde entró.
            bb.golpes++;
            bb.c.vel.set(0, 0, 0);
            bb.c.pos.z += 6;
            bb.c.pos.y = 0.18;
            audio.noise({ dur: 0.4, gain: 0.2, filter: 500, sweep: -300 });
            haptics.error(bb.i);
            aviso = `¡Al agua! ${players[bb.i].name} suma un golpe`;
          }

          // Tope de golpes: en un hoyo largo, sin límite, una mala racha puede
          // no acabar nunca. Se recoge la bola y se anota el máximo, como en
          // el golf de verdad cuando ya no hay nada que rascar.
          if (bb.golpes >= TOPE_GOLPES && !bb.dentro) {
            bb.dentro = true;
            bb.c.vel.set(0, 0, 0);
            bb.c.pos.y = -0.2;
            bb.c.malla.position.copy(bb.c.pos);
            audio.error();
            aviso = `${players[bb.i].name} recoge la bola en ${TOPE_GOLPES}`;
          }

          const d = Math.hypot(bb.c.pos.x - bandera.position.x, bb.c.pos.z - bandera.position.z);
          if (d < 0.42 && Math.hypot(bb.c.vel.x, bb.c.vel.z) < 5.5) {
            bb.dentro = true;
            bb.c.pos.y = -0.2;
            bb.c.malla.position.copy(bb.c.pos);
            audio.arp([700, 900, 1200], 0.06);
            haptics.play('score', { player: bb.i });
            aviso = `¡Dentro! ${players[bb.i].name} en ${bb.golpes} golpes`;
          }
          if (!bb.c.quieto && (Math.abs(bb.c.vel.x) > 0.12 || Math.abs(bb.c.vel.z) > 0.12 || bb.c.pos.y > 0.2)) {
            quietas = false;
          }
        }
        if (quietas) siguienteTurno();
      }

      for (const bb of bolas) ajustarSombra(bb.s, bb.c.malla, 0, 8);
      trapo.rotation.y = Math.sin(performance.now() * 0.002) * 0.5 + viento.x * 0.2;

      // Cámara detrás de la bola activa, mirando a bandera.
      const foco = fase === 'rodando' ? b.c.pos : bolas[turno].c.pos;
      const hacia = new THREE.Vector3(bandera.position.x - foco.x, 0, bandera.position.z - foco.z).normalize();
      const deseada = new THREE.Vector3(
        foco.x - hacia.x * 11 + 1, 6.5, foco.z - hacia.z * 11 + 1,
      );
      mundo.camara.position.lerp(deseada, Math.min(1, dt * 2.2));
      mundo.camara.lookAt(foco.x + hacia.x * 12, 1.4, foco.z + hacia.z * 12);

      const t = terreno(bolas[turno]);
      panel.centro(fase === 'apuntar'
        ? `<b style="color:${players[turno].color}">${players[turno].name}</b> · ${PALOS[palo].nombre} · ${t}`
        : 'la bola rueda…');
      panel.sub(`hoyo ${hoyo + 1}/${HOYOS.length} · ${Math.round(dist(bolas[0]))} m — ${Math.round(dist(bolas[1]))} m al hoyo`
        + ` · viento ${viento.x > 0 ? '→' : '←'} ${Math.abs(viento.x).toFixed(1)}${aviso ? ` · ${aviso}` : ''}`);
      panel.pie('← → apuntan · ↑ ↓ cambian de palo · mantén tu tecla para cargar y suéltala para pegar');
      panel.barra(fase === 'apuntar' ? fuerza : null, players[turno].color);
      marcador?.update(bolas[0].total + bolas[0].golpes, bolas[1].total + bolas[1].golpes);
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
