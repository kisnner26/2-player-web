/**
 * Piragüismo Eslalon — dos ríos, dos piraguas, pantalla partida.
 *
 * Cada palada empuja y gira hacia el lado contrario, así que ir recto es
 * alternar; pero aquí eso no basta, porque para cruzar una puerta hay que
 * ATRAVESARLA con la piragua encarada río abajo, y la corriente empuja hacia
 * fuera en cada curva.
 *
 * Tocar un palo son dos segundos de penalización y saltarse una puerta son
 * cincuenta, así que el que va a lo loco llega antes y pierde igual.
 */

import { crearMundo, crearPanel, suelo, mat, caja, cilindro, esfera, THREE } from '../../core/tres.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const LARGO = 190;             // metros de río
const ANCHO = 7;               // media anchura
const PUERTAS = 10;
const PENAL_TOQUE = 2;
const PENAL_SALTO = 50;

export function create(ctx) {
  const { input, audio, haptics, players, rng } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#2e4a6a', horizonte: '#8aa8b8', sol: 2.4, solPos: [16, 30, 12],
    sombraArea: 22, fov: 55, niebla: 0.008, lejos: 400,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#2f5a3a', veta: '#27492f', repite: 80, tam: 500 });

  // El río: una cinta de agua con su eje serpenteante.
  const meandros = [];
  for (let m = 20; m < LARGO; m += 26 + rng() * 16) {
    meandros.push({ m, amp: (rng() * 2 - 1) * 4.5, largo: 18 + rng() * 10 });
  }
  const eje = (z) => {
    let c = 0;
    for (const k of meandros) {
      const d = -z - k.m;
      if (Math.abs(d) < k.largo) c += k.amp * Math.cos((d / k.largo) * Math.PI / 2);
    }
    return c;
  };

  const agua = new THREE.Group();
  for (let i = 0; i < 60; i++) {
    const z = -(i * (LARGO / 60));
    const t = caja(ANCHO * 2, 0.06, LARGO / 60 + 0.4, mat(i % 2 ? '#2a6a8a' : '#2f7396', { rug: 0.25, met: 0.3 }),
      [eje(z), 0.03, z]);
    agua.add(t);
  }
  mundo.escena.add(agua);

  // Puertas: verdes a favor de corriente, con dos palos colgando.
  const puertas = [];
  for (let i = 0; i < PUERTAS; i++) {
    const z = -(16 + i * ((LARGO - 24) / PUERTAS));
    const x = eje(z) + (rng() * 2 - 1) * 3.4;
    const g = new THREE.Group();
    const ancho = 1.9;
    for (const s of [-1, 1]) {
      const palo = cilindro(0.07, 0.07, 2.4, mat('#2fbf5a', { emisivo: '#1a7a38', brillo: 0.35 }), [s * ancho, 1.4, 0]);
      g.add(palo);
    }
    g.add(caja(ancho * 2, 0.1, 0.1, mat('#eaeaea'), [0, 2.6, 0]));
    g.position.set(x, 0, z);
    mundo.escena.add(g);
    puertas.push({ g, x, z, ancho, hecha: [false, false], tocada: [false, false] });
  }

  const piraguas = [0, 1].map((i) => {
    const g = new THREE.Group();
    const casco = cilindro(0.22, 0.16, 3.6, mat(players[i].color, { rug: 0.5 }));
    casco.rotation.x = Math.PI / 2;
    g.add(casco, esfera(0.24, mat('#e0b890'), [0, 0.42, 0.2], 12));
    const remo = caja(2.6, 0.08, 0.16, mat('#e8dcc0'), [0, 0.5, 0]);
    g.add(remo);
    g.position.set(eje(0), 0.18, 0);
    mundo.escena.add(g);
    return {
      i, g, remo, x: eje(0), z: 0, vel: 0, ang: 0, ultima: '',
      penal: 0, puerta: 0, tiempo: 0, fin: 0, chapoteo: 0,
    };
  });

  const camaras = [mundo.camaraExtra(55), mundo.camaraExtra(55)];
  let marcador = null, acabado = false, reloj = 0;

  function penalizar(p, segundos, motivo) {
    p.penal += segundos;
    audio.error();
    haptics.error(p.i);
    ctx.ui?.toast?.(`${players[p.i].name}: +${segundos}s (${motivo})`, { ms: 1100, color: '#ff4757' });
  }

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${PUERTAS} puertas` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (acabado) return;
      reloj += dt;

      for (const p of piraguas) {
        if (p.fin) continue;
        p.tiempo += dt;
        const pl = input.player(p.i);
        p.chapoteo = Math.max(0, p.chapoteo - dt * 4);

        // Paladas alternas: cada lado empuja y gira hacia el contrario.
        let palada = 0;
        if (pl.pressed('left') && p.ultima !== 'left') { p.ultima = 'left'; palada = -1; }
        if (pl.pressed('right') && p.ultima !== 'right') { p.ultima = 'right'; palada = 1; }
        if (palada) {
          p.vel += 1.5;
          p.ang += palada * 0.16;
          p.chapoteo = 1;
          audio.noise({ dur: 0.1, gain: 0.08, filter: 800, sweep: -300 });
          haptics.play('tick', { player: p.i });
        }
        // Un timón fino con la palanca, para afinar la entrada a puerta.
        p.ang += pl.ax * 0.9 * dt;
        p.ang = Math.max(-0.9, Math.min(0.9, p.ang));

        p.vel = Math.max(0, p.vel - (0.9 + p.vel * 0.35) * dt);

        // Corriente: empuja río abajo y, en las curvas, hacia la orilla exterior.
        const centro = eje(p.z);
        const curva = (eje(p.z - 1) - centro);
        const corriente = 3.4;
        p.z -= (p.vel + corriente) * dt;
        p.x += Math.sin(p.ang) * (p.vel + corriente) * dt + curva * corriente * dt * 0.6;
        p.ang *= Math.pow(0.7, dt);

        const limite = ANCHO - 0.4;
        if (Math.abs(p.x - centro) > limite) {
          p.x = centro + Math.sign(p.x - centro) * limite;
          p.vel *= 0.6;
        }

        // Puertas: se pasan en orden y hay que cruzar la línea entre los palos.
        const pu = puertas[p.puerta];
        if (pu) {
          const dz = p.z - pu.z;
          const dx = Math.abs(p.x - pu.x);
          if (dx < pu.ancho + 0.35 && Math.abs(dz) < 0.9 && !pu.tocada[p.i] && dx > pu.ancho - 0.35) {
            pu.tocada[p.i] = true;
            penalizar(p, PENAL_TOQUE, 'toque de palo');
          }
          if (dz < -0.6) {
            // Ya la ha dejado atrás: o la cruzó o se la saltó.
            if (dx < pu.ancho) {
              pu.hecha[p.i] = true;
              audio.pickup();
              haptics.play('score', { player: p.i });
            } else {
              penalizar(p, PENAL_SALTO, 'puerta saltada');
            }
            p.puerta++;
          }
        }

        if (-p.z >= LARGO) {
          p.fin = p.tiempo + p.penal;
          audio.win();
          haptics.victory(p.i);
        }

        p.g.position.set(p.x, 0.18, p.z);
        p.g.rotation.y = -p.ang;
        p.remo.rotation.z = Math.sin(reloj * 9) * (0.3 + p.chapoteo * 0.8);
        p.remo.rotation.y = p.chapoteo * 0.6;
      }

      // Dos cámaras persiguiendo, una por mitad de pantalla.
      for (let i = 0; i < 2; i++) {
        const p = piraguas[i];
        const c = camaras[i];
        c.position.lerp(new THREE.Vector3(p.x - Math.sin(p.ang) * -1, 3.1, p.z + 7.5), Math.min(1, dt * 3.5));
        c.lookAt(p.x + Math.sin(-p.ang) * 4, 0.8, p.z - 9);
      }

      marcador?.update(piraguas[0].puerta, piraguas[1].puerta);

      if (piraguas.every((p) => p.fin)) {
        acabado = true;
        const [a, b] = piraguas;
        const gan = Math.abs(a.fin - b.fin) < 0.01 ? -1 : a.fin < b.fin ? 0 : 1;
        ctx.finish({
          winner: gan,
          scores: [+a.fin.toFixed(2), +b.fin.toFixed(2)],
          detail: `${a.tiempo.toFixed(1)}s +${a.penal}s contra ${b.tiempo.toFixed(1)}s +${b.penal}s`,
          record: ctx.record('tiempo', +Math.min(a.fin, b.fin).toFixed(2), 'low'),
        });
        return;
      }

      const linea = (p) => `${p.puerta}/${PUERTAS} · ${p.tiempo.toFixed(1)}s${p.penal ? ` +${p.penal}` : ''}`;
      panel.centro(`<b style="color:${players[0].color}">${linea(piraguas[0])}</b> — <b style="color:${players[1].color}">${linea(piraguas[1])}</b>`);
      panel.sub('arriba jugador 1 · abajo jugador 2 · las puertas se cruzan en orden');
      panel.pie('alterna ← y → para remar · cada palada gira hacia el lado contrario');
      mundo.dibujarPartida(camaras[0], camaras[1]);
    },

    destroy() {
      panel.destruir();
      mundo.destruir();
      marcador?.remove();
    },
  };
}
