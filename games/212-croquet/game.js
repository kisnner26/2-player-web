/**
 * Croquet — pasa los aros en orden y, si puedes, mándale la suya al seto.
 *
 * Pasar un aro da turno extra, y ahí está la sal: una tirada buena encadena
 * tres o cuatro y el otro se queda mirando. Tocar la bola rival también da
 * turno extra, así que el ataque no es una pérdida de tiempo.
 *
 * El césped no es plano: tiene caídas suaves que se ven en el sombreado. Una
 * bola lenta se desvía y una fuerte no, lo cual complica justo lo que hay que
 * complicar.
 */

import { crearMundo, crearPanel, suelo, mat, esfera, cilindro, sombraContacto, ajustarSombra, THREE } from '../../core/tres.js';
import { cuerpo, integrar, rodar, rodarMalla, chocar, todoQuieto } from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const AROS = 6;
const R = 0.28;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#8fc0e0', horizonte: '#cfe0d0', sol: 2.6, solPos: [16, 30, 12],
    sombraArea: 26, fov: 40, niebla: 0.005,
  });
  const panel = crearPanel(ctx.root);
  suelo(mundo, { color: '#4f8c48', veta: '#478040', repite: 70 });

  /** Ondulación del césped: suave, pero suficiente para desviar bolas lentas. */
  const pendiente = (x, z) => new THREE.Vector3(
    Math.cos(x * 0.16) * 0.5 + Math.cos(z * 0.11) * 0.3,
    0,
    Math.sin(z * 0.14) * 0.5 + Math.sin(x * 0.09) * 0.3,
  );

  const aros = [];
  for (let i = 0; i < AROS; i++) {
    const x = Math.sin(i * 1.9) * 7;
    const z = -10 + i * 4.2;
    const aro = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.05, 8, 18, Math.PI),
      new THREE.MeshStandardMaterial({ color: new THREE.Color('#e8e8f0'), roughness: 0.5 }),
    );
    aro.position.set(x, 0.02, z);
    aro.rotation.y = Math.PI / 2;
    mundo.escena.add(aro);
    aros.push({ x, z, malla: aro });
  }

  const bolas = [0, 1].map((i) => {
    const c = cuerpo({ x: i === 0 ? -1.2 : 1.2, y: R, z: 12, r: R, masa: 1 });
    c.malla = esfera(R, mat(players[i].color, { rug: 0.4 }), [c.pos.x, R, 12], 20);
    c.malla.castShadow = true;
    mundo.escena.add(c.malla);
    c.due = i;
    c.aro = 0;
    return c;
  });
  const sombras = bolas.map((c) => {
    const s = sombraContacto(R * 1.2, 0.34);
    mundo.escena.add(s);
    return { s, c };
  });

  const maza = cilindro(0.09, 0.09, 1.1, mat('#8a6a42'), [0, 0.55, 0]);
  mundo.escena.add(maza);

  let turno = 0, fase = 'apuntar', angulo = 0, fuerza = 0, subiendo = true;
  let marcador = null, terminado = false, extra = false, aviso = '', tocada = false;

  function golpear() {
    const c = bolas[turno];
    const v = 3 + fuerza * 13;
    c.vel.set(Math.sin(angulo) * v, 0, -Math.cos(angulo) * v);
    c.quieto = false;
    fase = 'rodando';
    tocada = false;
    audio.hit();
    haptics.impact(turno, 0.6 + fuerza * 0.6);
  }

  function comprobarAros() {
    for (const c of bolas) {
      const a = aros[c.aro];
      if (!a) continue;
      // Pasar el aro: estar muy cerca del hueco y haberlo cruzado en Z.
      if (Math.abs(c.pos.x - a.x) < 0.5 && Math.abs(c.pos.z - a.z) < 0.35) {
        c.aro++;
        if (c.due === turno) extra = true;
        aviso = `${players[c.due].name} pasa el aro ${c.aro}`;
        audio.pickup();
        haptics.score(c.due);
        marcador.update(bolas[0].aro, bolas[1].aro);
        if (c.aro >= AROS) {
          terminado = true;
          audio.win();
          haptics.victory(c.due);
          ctx.finish({
            winner: c.due, scores: [bolas[0].aro, bolas[1].aro],
            detail: `${AROS} aros en orden`,
          });
        }
      }
    }
  }

  mundo.camara.position.set(0, 11, 20);
  mundo.camara.lookAt(0, 0, 0);

  return {
    init() {
      marcador = ctx.ui.scoreboard({ center: `${AROS} aros` });
      marcador.update(0, 0);
    },

    update(dt) {
      if (terminado) return;
      const p = input.player(turno);
      const mia = bolas[turno];

      if (fase === 'apuntar') {
        maza.visible = true;
        if (p.held('left')) angulo -= 1.1 * dt;
        if (p.held('right')) angulo += 1.1 * dt;
        fuerza += (subiendo ? 1 : -1) * dt * 0.8;
        if (fuerza >= 1) { fuerza = 1; subiendo = false; }
        if (fuerza <= 0) { fuerza = 0; subiendo = true; }
        maza.position.set(
          mia.pos.x - Math.sin(angulo) * 0.9,
          0.55,
          mia.pos.z + Math.cos(angulo) * 0.9,
        );
        maza.rotation.z = 0.4;
        maza.rotation.y = -angulo;
        if (p.pressed('a')) golpear();
      } else if (fase === 'rodando') {
        maza.visible = false;
        for (const c of bolas) {
          const v = Math.hypot(c.vel.x, c.vel.z);
          if (v > 0.05) {
            // Las bolas lentas notan el desnivel; las rápidas casi no.
            const g = pendiente(c.pos.x, c.pos.z).multiplyScalar(1 / (1 + v * 0.5));
            c.vel.addScaledVector(g, dt);
          }
          integrar(c, dt, { gravedad: 0 });
          rodar(c, dt, { friccion: 0.9, umbral: 0.1 });
          rodarMalla(c, dt);
          c.pos.y = R;
          c.malla.position.copy(c.pos);
          // Límites del jardín
          for (const eje of ['x', 'z']) {
            const lim = eje === 'x' ? 12 : 16;
            if (c.pos[eje] < -lim) { c.pos[eje] = -lim; c.vel[eje] = Math.abs(c.vel[eje]) * 0.5; }
            if (c.pos[eje] > lim) { c.pos[eje] = lim; c.vel[eje] = -Math.abs(c.vel[eje]) * 0.5; }
          }
        }
        const v = chocar(bolas[0], bolas[1], 0.92);
        if (v > 0.6 && !tocada) {
          tocada = true;
          extra = true;
          aviso = `${players[turno].name} toca la bola rival: turno extra`;
          audio.blip();
          haptics.impact(null, 0.8);
        }
        comprobarAros();
        if (terminado) return;

        if (todoQuieto(bolas, 0.12)) {
          if (!extra) turno = 1 - turno;
          extra = false;
          fase = 'apuntar';
          fuerza = 0;
          angulo = 0;
        }
      }

      for (const { s, c } of sombras) ajustarSombra(s, c.malla, 0.02, 4);
      // Aro en juego, resaltado.
      aros.forEach((a, i) => {
        const activo = i === bolas[turno].aro;
        a.malla.material.color.set(activo ? players[turno].color : '#e8e8f0');
      });

      const foco = bolas[turno].pos;
      mundo.camara.position.lerp(new THREE.Vector3(foco.x * 0.4, 11, foco.z + 12), Math.min(1, dt * 1.8));
      mundo.camara.lookAt(foco.x * 0.3, 0, foco.z - 5);

      panel.centro(fase === 'apuntar'
        ? `golpea <b style="color:${players[turno].color}">${players[turno].name}</b> · va al aro ${bolas[turno].aro + 1}`
        : 'rodando…');
      panel.sub(aviso || `aros: ${bolas[0].aro}/${AROS} — ${bolas[1].aro}/${AROS}`);
      panel.pie('← → apuntan · tu tecla golpea con la fuerza de la barra · pasar aro o tocarle la bola da turno extra');
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
