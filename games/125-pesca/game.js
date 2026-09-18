/**
 * Pesca — dos cañas, un lago y noventa segundos. Gana quien saque más kilos.
 *
 * El pulso está en el sedal. Cuando pica, recoger es mantener la tecla, pero el
 * pez tira hacia el lado contrario y la tensión sube; si la fuerzas, el sedal se
 * rompe y el pez se va con el anzuelo. Soltar da cuerda y baja la tensión, pero
 * también deja al pez alejarse. Recoger a tirones cortos, dando cuerda cuando
 * el pez corre, es lo que saca las piezas grandes.
 *
 * Los dos pescan a la vez, cada uno en su parte del lago, así que no hay turnos
 * ni esperas: se juega mirando de reojo lo que saca el otro.
 */

import { crearMundo, crearPanel, mat, caja, cilindro, esfera, suelo, texturaGrano, THREE } from '../../core/tres.js';
import { Cuerda } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: false };

const DURACION = 95;
const LAGO = 46;

/** Especies: cuanto más pesa, más tira y más despacio se cansa. */
const PECES = [
  { nombre: 'Perca', kilos: [0.4, 1.2], color: '#6f8f4a', fuerza: 0.55, tam: 0.5 },
  { nombre: 'Trucha', kilos: [0.8, 2.4], color: '#a08a55', fuerza: 0.8, tam: 0.7 },
  { nombre: 'Lucio', kilos: [2.0, 5.5], color: '#4c6b3c', fuerza: 1.15, tam: 1.0 },
  { nombre: 'Siluro', kilos: [4.0, 11.0], color: '#4a4238', fuerza: 1.5, tam: 1.4 },
];

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#8fb8d8', horizonte: '#cfe2ee', sol: 2.2, solPos: [-24, 30, 18],
    sombraArea: 26, fov: 46, niebla: 0.006, lejos: 400,
  });
  const panel = crearPanel(ctx.root);
  mundo.ambiente.intensity = 1.3;

  mundo.camara.position.set(0, 11, 21);
  mundo.camara.lookAt(0, 0, -10);

  /* ---------------- Lago y orilla ---------------- */

  // El lecho va hundido: si el suelo y la lámina de agua compartieran altura,
  // los dos planos se pelearían por el z-buffer y el lago saldría a parches.
  const lecho = suelo(mundo, { color: '#4f6b3a', veta: '#3d5430', repite: 90, tam: 300 });
  lecho.position.y = -0.9;

  const agua = new THREE.Mesh(
    new THREE.PlaneGeometry(LAGO * 2, LAGO * 2, 24, 24),
    new THREE.MeshStandardMaterial({
      // Poco espejo a propósito: con la rugosidad muy baja, el sol dejaba un
      // borrón blanco quemado en una esquina del lago.
      color: 0x2f6d92, roughness: 0.28, metalness: 0.32, transparent: true, opacity: 0.82,
    }),
  );
  agua.rotation.x = -Math.PI / 2;
  agua.position.set(0, 0, -22);
  mundo.escena.add(agua);
  const posAgua = agua.geometry.attributes.position;
  const baseAgua = Float32Array.from(posAgua.array);

  // Fondo del lago y juncos: dan borde al agua sin modelar una orilla.
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = 24 + Math.random() * 22;
    const x = Math.cos(a) * r, z = -22 + Math.sin(a) * r * 0.8;
    if (z > 4) continue;
    const junco = cilindro(0.05, 0.07, 1.6 + Math.random(), mat('#5d7a34', { rug: 1 }), [x, -0.1, z], 5);
    junco.rotation.z = (Math.random() - 0.5) * 0.3;
    mundo.escena.add(junco);
  }
  // Los árboles van pasada la orilla del fondo (el agua llega hasta z = -68).
  for (let i = 0; i < 14; i++) {
    const x = -46 + Math.random() * 92, z = -72 - Math.random() * 30;
    const tronco = cilindro(0.4, 0.5, 3.4, mat('#4a3220'), [x, 0.8, z], 6);
    const copa = new THREE.Mesh(new THREE.ConeGeometry(2.6, 7, 7), mat('#2f5a2a', { rug: 1 }));
    copa.position.set(x, 5.3, z);
    mundo.escena.add(tronco, copa);
  }

  /* ---------------- Pescadores ---------------- */

  function crearPuesto(j) {
    const x = j === 0 ? -9 : 9;
    const g = new THREE.Group();
    g.position.set(x, 0, 4);
    // Pantalán de tablas hacia el agua.
    for (let i = 0; i < 7; i++) {
      g.add(caja(3.2, 0.16, 0.7, mat('#8a6236', { rug: 0.85 }), [0, 0.3, -i * 0.9]));
    }
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      g.add(cilindro(0.13, 0.13, 1.6, mat('#5f4222'), [s * 1.4, -0.4, -i * 2.4], 6));
    }
    // Pescador: caja con gorro, del color del jugador.
    const cuerpo = caja(0.8, 1.3, 0.6, mat(players[j].color, { rug: 0.75 }), [0, 1.05, 0.2]);
    const cabeza = esfera(0.34, mat('#f0c9a0', { rug: 0.8 }), [0, 1.95, 0.2], 12);
    const gorro = cilindro(0.42, 0.46, 0.22, mat('#2b2f3a', { rug: 0.9 }), [0, 2.2, 0.2], 12);
    g.add(cuerpo, cabeza, gorro);
    // Caña.
    const cana = cilindro(0.03, 0.07, 4.4, mat('#20242c', { rug: 0.4 }), [0, 0, 0], 6);
    const grupoCana = new THREE.Group();
    grupoCana.position.set(0.3, 1.6, 0);
    grupoCana.rotation.x = -0.9;
    cana.position.y = 2.2;
    grupoCana.add(cana);
    g.add(grupoCana);
    g.traverse((o) => { o.castShadow = true; });
    mundo.escena.add(g);
    return { grupo: g, cana: grupoCana, x };
  }

  /* ---------------- Peces ---------------- */

  const peces = [];
  function crearPez() {
    const tipo = PECES[Math.floor(rng() * PECES.length)];
    const kilos = tipo.kilos[0] + rng() * (tipo.kilos[1] - tipo.kilos[0]);
    const escala = tipo.tam * (0.75 + kilos / (tipo.kilos[1] * 2));
    const g = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat(tipo.color, { rug: 0.45, met: 0.15 }));
    cuerpo.scale.set(0.55, 0.7, 1.7);
    const cola = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.6, 5), mat(tipo.color, { rug: 0.5 }));
    cola.rotation.x = Math.PI / 2;
    cola.position.z = -1;
    g.add(cuerpo, cola);
    g.scale.setScalar(escala);
    g.position.set((rng() - 0.5) * 30, -0.9 - rng() * 1.4, -8 - rng() * 26);
    mundo.escena.add(g);
    return {
      malla: g, tipo, kilos,
      rumbo: rng() * Math.PI * 2,
      vel: 1.2 + rng() * 1.4,
      estado: 'libre',
      objetivo: null,
    };
  }
  for (let i = 0; i < 14; i++) peces.push(crearPez());

  /* ---------------- Cañas de cada jugador ---------------- */

  const cañas = [0, 1].map((j) => {
    const puesto = crearPuesto(j);
    const flotador = new THREE.Group();
    const cuerpoF = esfera(0.22, mat('#ff3d3d', { rug: 0.5 }), [0, 0.1, 0], 10);
    const bajoF = esfera(0.22, mat('#f4f4f4', { rug: 0.5 }), [0, -0.1, 0], 10);
    flotador.add(cuerpoF, bajoF);
    flotador.visible = false;
    mundo.escena.add(flotador);

    const cuerda = new Cuerda(10, 8, { gravedad: 5, pasadas: 3 });
    const geoLinea = new THREE.BufferGeometry().setFromPoints(cuerda.p.map((p) => p.clone()));
    const linea = new THREE.Line(geoLinea, new THREE.LineBasicMaterial({ color: 0xf0f4ff, transparent: true, opacity: 0.55 }));
    mundo.escena.add(linea);

    return {
      j, puesto, flotador, cuerda, geoLinea, linea,
      estado: 'lanzar',       // lanzar | esperando | pique | luchando | cobrando
      fuerza: 0,
      cebo: new THREE.Vector3(puesto.x, 0, -2),
      tension: 0,
      pez: null,
      ventana: 0,
      kilos: 0,
      piezas: 0,
      mejor: 0,
      aviso: '', avisoT: 0,
    };
  });

  const puntaCaña = (c) => new THREE.Vector3(c.puesto.x + 0.3, 4.4, c.puesto.grupo.position.z - 3.2);

  /* ---------------- Estado ---------------- */

  let tiempo = DURACION;
  let acabado = false;
  let marcador = null;
  let t = 0;

  const decir = (c, txt, s = 2) => { c.aviso = txt; c.avisoT = s; };

  function lanzar(c) {
    const alcance = 6 + c.fuerza * 22;
    c.cebo.set(c.puesto.x + (Math.random() - 0.5) * 3, 0, -2 - alcance);
    c.flotador.visible = true;
    c.estado = 'esperando';
    c.espera = 1.5 + Math.random() * 4;
    audio.swoosh();
    haptics.tap(c.j);
  }

  function picar(c, pez) {
    c.pez = pez;
    pez.estado = 'enganchado';
    c.estado = 'pique';
    c.ventana = 1.3;
    audio.tone({ freq: 520, dur: 0.09, gain: 0.2, type: 'square', sweep: 260 });
    haptics.impact(c.j, 0.8);
    decir(c, '¡PICA! Dale a la acción', 1.3);
  }

  function clavar(c) {
    c.estado = 'luchando';
    c.tension = 0.25;
    c.distancia = c.cebo.distanceTo(puntaCaña(c));
    audio.tone({ freq: 800, dur: 0.1, gain: 0.18, type: 'sawtooth', sweep: -300 });
    decir(c, `¡${c.pez.tipo.nombre} de ${c.pez.kilos.toFixed(1)} kg!`, 2);
  }

  function perder(c, razon) {
    if (c.pez) { c.pez.estado = 'libre'; c.pez = null; }
    c.estado = 'lanzar';
    c.fuerza = 0;
    c.flotador.visible = false;
    audio.error();
    haptics.error(c.j);
    decir(c, razon, 2.2);
  }

  function cobrar(c) {
    const pez = c.pez;
    c.kilos += pez.kilos;
    c.piezas++;
    c.mejor = Math.max(c.mejor, pez.kilos);
    marcador?.update(Math.round(cañas[0].kilos * 10) / 10, Math.round(cañas[1].kilos * 10) / 10);
    audio.arp([660, 880, 1320], 0.06);
    haptics.score(c.j);
    decir(c, `¡${pez.tipo.nombre} de ${pez.kilos.toFixed(1)} kg cobrado!`, 2.4);
    // El pez pescado vuelve al lago en otro sitio: el lago no se vacía.
    pez.malla.position.set((Math.random() - 0.5) * 30, -0.9 - Math.random() * 1.4, -8 - Math.random() * 26);
    pez.estado = 'libre';
    pez.kilos = pez.tipo.kilos[0] + Math.random() * (pez.tipo.kilos[1] - pez.tipo.kilos[0]);
    c.pez = null;
    c.estado = 'lanzar';
    c.fuerza = 0;
    c.flotador.visible = false;
  }

  function actualizarCaña(c, dt) {
    const p = input.player(c.j);
    if (c.avisoT > 0) c.avisoT -= dt;

    if (c.estado === 'lanzar') {
      if (p.held('a')) c.fuerza = Math.min(1, c.fuerza + dt * 0.75);
      if (p.released('a') && c.fuerza > 0.05) lanzar(c);
    } else if (c.estado === 'esperando') {
      c.espera -= dt;
      // Recoger sin pique: se puede volver a lanzar cuando quieras.
      if (p.pressed('b')) { c.estado = 'lanzar'; c.fuerza = 0; c.flotador.visible = false; }
      if (c.espera <= 0) {
        const libre = peces.filter((f) => f.estado === 'libre');
        if (libre.length) {
          // Pica el que esté más cerca del cebo: colocarlo bien importa.
          libre.sort((a, b) => a.malla.position.distanceTo(c.cebo) - b.malla.position.distanceTo(c.cebo));
          picar(c, libre[0]);
        } else c.espera = 2;
      }
    } else if (c.estado === 'pique') {
      c.ventana -= dt;
      c.flotador.position.y = -0.35 + Math.sin(t * 26) * 0.3;
      if (p.pressed('a')) clavar(c);
      else if (c.ventana <= 0) perder(c, 'Se llevó el cebo');
    } else if (c.estado === 'luchando') {
      const pez = c.pez;
      const recoge = p.held('a');
      // El pez tira a rachas: la fuerza sube y baja sola.
      const racha = 0.55 + Math.sin(t * 2.1 + c.j * 2) * 0.3 + Math.sin(t * 5.7) * 0.15;
      const tiron = pez.tipo.fuerza * racha * (pez.kilos / 3 + 0.5);

      if (recoge) {
        c.distancia -= (2.6 - tiron * 0.5) * dt;
        c.tension += (tiron * 0.55 - 0.12) * dt;
      } else {
        c.distancia += tiron * 0.7 * dt;
        c.tension -= 0.75 * dt;
      }
      c.tension = Math.max(0, c.tension);
      if (c.tension > 0.82 && Math.random() < dt * 8) audio.tone({ freq: 1200 + Math.random() * 400, dur: 0.03, gain: 0.06, type: 'sawtooth' });

      if (c.tension >= 1) { perder(c, '¡Se rompió el sedal!'); return; }
      if (c.distancia > 34) { perder(c, 'El pez se fue al fondo'); return; }
      if (c.distancia <= 2.4) { cobrar(c); return; }

      // El cebo (y el pez) se acercan a la caña según la distancia que queda.
      const punta = puntaCaña(c);
      const dir = new THREE.Vector3(c.puesto.x - punta.x, 0, -1).normalize();
      c.cebo.copy(punta).addScaledVector(dir, c.distancia);
      c.cebo.y = 0;
      c.cebo.x += Math.sin(t * 3 + c.j) * Math.min(3, c.distancia * 0.2);
      pez.malla.position.set(c.cebo.x, -0.5 - Math.sin(t * 6) * 0.3, c.cebo.z);
      pez.malla.rotation.y = Math.atan2(punta.x - c.cebo.x, punta.z - c.cebo.z) + Math.PI;
    }

    // Flotador y sedal.
    if (c.flotador.visible) {
      c.flotador.position.x = c.cebo.x;
      c.flotador.position.z = c.cebo.z;
      if (c.estado !== 'pique') c.flotador.position.y = Math.sin(t * 2 + c.j) * 0.09;
      c.cuerda.paso(dt, puntaCaña(c), c.flotador.position);
      c.cuerda.aGeometria(c.geoLinea);
      c.linea.visible = true;
    } else {
      c.linea.visible = false;
    }
    // La caña se dobla con la tensión: la señal más honesta de lo que pasa.
    const dobla = c.estado === 'luchando' ? c.tension : 0;
    c.puesto.cana.rotation.x = -0.9 - dobla * 0.75;
    c.puesto.cana.rotation.z = Math.sin(t * 3) * dobla * 0.12;
  }

  function nadar(dt) {
    for (const f of peces) {
      if (f.estado !== 'libre') continue;
      f.rumbo += (Math.random() - 0.5) * dt * 2;
      f.malla.position.x += Math.sin(f.rumbo) * f.vel * dt;
      f.malla.position.z += Math.cos(f.rumbo) * f.vel * dt;
      // Rebote suave contra los bordes del lago.
      if (Math.abs(f.malla.position.x) > 20) f.rumbo = Math.PI - f.rumbo;
      if (f.malla.position.z > -5 || f.malla.position.z < -40) f.rumbo = -f.rumbo;
      f.malla.rotation.y = f.rumbo;
      f.malla.children[1].rotation.z = Math.sin(t * 9 + f.vel) * 0.4;
    }
  }

  function pintarPanel() {
    const [a, b] = cañas;
    const estado = (c) => ({
      lanzar: `cargando ${(c.fuerza * 100).toFixed(0)}%`,
      esperando: 'esperando…',
      pique: '¡PICA!',
      luchando: `luchando · ${c.distancia?.toFixed(0)} m`,
    }[c.estado] || '');
    panel.centro(`⏱ ${Math.max(0, tiempo).toFixed(0)} s`);
    panel.sub(`<span style="color:${players[0].color}">${players[0].name}: ${a.avisoT > 0 ? a.aviso : estado(a)}</span>
      &nbsp;·&nbsp; <span style="color:${players[1].color}">${players[1].name}: ${b.avisoT > 0 ? b.aviso : estado(b)}</span>`);
    panel.pie(`${a.kilos.toFixed(1)} kg (${a.piezas}) — ${b.kilos.toFixed(1)} kg (${b.piezas}) · acción: lanzar, clavar y recoger · especial: recoger sedal`);
    // La barra muestra la tensión de quien esté luchando (la peor de las dos).
    const luchando = cañas.filter((c) => c.estado === 'luchando').sort((x, y) => y.tension - x.tension)[0];
    panel.barra(luchando ? luchando.tension : null, luchando && luchando.tension > 0.8 ? '#ff4757' : '#ffd166');
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: 'kg' });
      marcador.update(0, 0);
    },

    update(dt) {
      t += dt;
      if (!acabado) {
        tiempo -= dt;
        if (tiempo <= 0) {
          acabado = true;
          const [a, b] = cañas;
          ctx.finish({
            winner: Math.abs(a.kilos - b.kilos) < 0.01 ? -1 : (a.kilos > b.kilos ? 0 : 1),
            scores: [Math.round(a.kilos * 10) / 10, Math.round(b.kilos * 10) / 10],
            detail: `Mejor pieza: ${Math.max(a.mejor, b.mejor).toFixed(1)} kg`,
            record: ctx.record('kilos', Math.round(Math.max(a.kilos, b.kilos) * 10) / 10, 'high'),
          });
        }
        actualizarCaña(cañas[0], dt);
        actualizarCaña(cañas[1], dt);
        nadar(dt);
      }

      // Oleaje: se mueve la malla del agua, no una textura.
      for (let i = 0; i < posAgua.count; i++) {
        const x = baseAgua[i * 3], y = baseAgua[i * 3 + 1];
        posAgua.array[i * 3 + 2] = Math.sin(x * 0.25 + t * 1.4) * 0.16 + Math.cos(y * 0.3 + t) * 0.12;
      }
      posAgua.needsUpdate = true;

      pintarPanel();
      mundo.dibujar();
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
