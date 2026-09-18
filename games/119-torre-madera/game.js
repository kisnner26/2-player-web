/**
 * Torre de madera — saca un bloque, ponlo arriba, y que no se caiga.
 *
 * La torre no es decorado: cada piso lleva la cuenta de qué bloques le quedan y
 * de cuánto se ha desplazado su centro de masas. Sacar el del medio casi no la
 * afecta; sacar uno de fuera deja el piso cojo, y ese desequilibrio se
 * multiplica por la altura a la que está. Cuando el conjunto pasa de lo que
 * aguanta, se viene abajo de verdad — cada bloque cae por su cuenta.
 *
 * Tirar es un pulso: mantienes la tecla y el bloque sale poco a poco mientras
 * la torre se queja. Puedes soltar en cualquier momento para dejarla asentarse.
 * El que la tira, pierde.
 */

import { crearMundo, crearPanel, mat, caja, suelo, texturaGrano, THREE } from '../../core/tres.js';
import * as F from '../../core/fisica3d.js';

export const meta = { render: 'dom', sinCuentaAtras: true };

const PISOS = 16;
const LARGO = 3, ALTO = 0.62, ANCHO = 0.98;

export function create(ctx) {
  const { input, audio, haptics, players } = ctx;

  const mundo = crearMundo(ctx.root, {
    cielo: '#0e1016', horizonte: '#2b2418', sol: 2.4, solPos: [10, 22, 12],
    sombraArea: 14, fov: 42, niebla: 0.01,
  });
  const panel = crearPanel(ctx.root);

  suelo(mundo, { color: '#3a2a1c', veta: '#2a1e14', lineas: 26, repite: 26 });
  mundo.escena.add(caja(60, 12, 1, mat('#141118'), [0, 6, -16]));

  const maderas = [
    new THREE.MeshStandardMaterial({ map: texturaGrano('#c99a5c', '#9a6f3a', { lineas: 26, repite: 1, ruido: 0.05 }), roughness: 0.72 }),
    new THREE.MeshStandardMaterial({ map: texturaGrano('#d4a868', '#a87a42', { lineas: 22, repite: 1, ruido: 0.05 }), roughness: 0.68 }),
    new THREE.MeshStandardMaterial({ map: texturaGrano('#bd8d52', '#8d6532', { lineas: 30, repite: 1, ruido: 0.06 }), roughness: 0.76 }),
  ];

  const torre = new THREE.Group();
  mundo.escena.add(torre);

  /* ---------------- Construcción ---------------- */

  /** pisos[i] = [bloque|null, bloque|null, bloque|null], de abajo arriba. */
  const pisos = [];
  const todos = [];

  function crearBloque(piso, ranura) {
    const horizontal = piso % 2 === 0;
    const g = new THREE.Mesh(
      new THREE.BoxGeometry(horizontal ? LARGO : ANCHO, ALTO, horizontal ? ANCHO : LARGO),
      maderas[(piso * 3 + ranura) % 3],
    );
    g.castShadow = true;
    g.receiveShadow = true;
    const off = (ranura - 1) * (ANCHO + 0.02);
    g.position.set(horizontal ? 0 : off, ALTO / 2 + piso * ALTO, horizontal ? off : 0);
    torre.add(g);
    const b = { malla: g, piso, ranura, horizontal, base: g.position.clone() };
    todos.push(b);
    return b;
  }

  function construir() {
    for (let p = 0; p < PISOS; p++) {
      pisos.push([crearBloque(p, 0), crearBloque(p, 1), crearBloque(p, 2)]);
    }
  }

  /* ---------------- Selección ---------------- */

  const marcoSel = new THREE.Mesh(
    new THREE.BoxGeometry(LARGO + 0.08, ALTO + 0.08, ANCHO + 0.08),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 }),
  );
  mundo.escena.add(marcoSel);

  let selPiso = PISOS - 4;
  let selRanura = 1;

  const cimaLlena = () => pisos[pisos.length - 1].filter(Boolean).length;
  /** El piso más alto y el siguiente no se tocan: es la regla de siempre. */
  const pisoMax = () => pisos.length - (cimaLlena() === 3 ? 2 : 3);

  function bloqueSel() { return pisos[selPiso]?.[selRanura] || null; }

  /** Mueve el cursor saltándose los huecos: nunca señala un bloque que ya no está. */
  function moverSeleccion(dp, dr) {
    const maxP = pisoMax();
    if (dp) selPiso += dp;
    selPiso = Math.max(0, Math.min(maxP, selPiso));
    if (dr) {
      for (let i = 0; i < 3; i++) {
        selRanura = (selRanura + dr + 3) % 3;
        if (pisos[selPiso][selRanura]) break;
      }
    }
    if (!pisos[selPiso][selRanura]) {
      const k = pisos[selPiso].findIndex(Boolean);
      if (k >= 0) selRanura = k;
    }
  }

  /* ---------------- Estabilidad ---------------- */

  /**
   * Cuánto está pidiendo caerse la torre, de 0 a 1.
   *
   * Se suma el desplazamiento del centro de masas de cada piso, pesado por la
   * altura: un hueco abajo del todo importa mucho más que el mismo hueco arriba.
   */
  function desequilibrio() {
    let total = 0;
    for (let p = 0; p < pisos.length; p++) {
      const quedan = pisos[p].filter(Boolean);
      if (!quedan.length) continue;
      const centro = quedan.reduce((a, b) => a + (b.ranura - 1), 0) / quedan.length;
      const huecos = 3 - quedan.length;
      const peso = (p + 1) / pisos.length;
      total += (Math.abs(centro) * 0.9 + huecos * 0.35) * peso;
    }
    return total / 5.5;
  }

  /* ---------------- Estado ---------------- */

  let turno = 0;
  let fase = 'elegir';          // elegir | sacando | colocando | cayendo | fin
  let tirando = null;           // { bloque, avance }
  let tambaleo = 0;             // 0..1; a 1 se cae
  let sacudida = 0;
  let camAng = 0.7;
  let colocados = [0, 0];
  let piezas = [];
  let aviso = '', avisoT = 0;
  let marcador = null;
  let acabado = false;

  const decir = (t, s = 2) => { aviso = t; avisoT = s; };

  function empezarTirar() {
    const b = bloqueSel();
    if (!b) return;
    if (pisos[selPiso].filter(Boolean).length <= 1) { decir('Ese piso se queda sin nada'); audio.error(); return; }
    tirando = { bloque: b, avance: 0 };
    fase = 'sacando';
  }

  function completarTirada() {
    const b = tirando.bloque;
    pisos[b.piso][b.ranura] = null;

    // El bloque va a la cima; cuando el piso de arriba se llena, empieza otro.
    let cima = pisos[pisos.length - 1];
    if (cima.filter(Boolean).length === 3) {
      pisos.push([null, null, null]);
      cima = pisos[pisos.length - 1];
    }
    const hueco = cima.findIndex((x) => !x);
    const nivel = pisos.length - 1;
    const horizontal = nivel % 2 === 0;
    b.piso = nivel;
    b.ranura = hueco;
    b.horizontal = horizontal;
    cima[hueco] = b;

    // Se rehace la geometría porque cambia la orientación del bloque.
    b.malla.geometry.dispose();
    b.malla.geometry = new THREE.BoxGeometry(horizontal ? LARGO : ANCHO, ALTO, horizontal ? ANCHO : LARGO);
    const off = (hueco - 1) * (ANCHO + 0.02);
    b.destino = new THREE.Vector3(horizontal ? 0 : off, ALTO / 2 + nivel * ALTO, horizontal ? off : 0);
    b.base = b.destino.clone();
    colocados[turno]++;
    fase = 'colocando';
    audio.place();
  }

  function derrumbar(culpable) {
    fase = 'cayendo';
    piezas = todos.filter((b) => b.malla.parent).map((b) => {
      const p = F.pieza(b.malla, { r: ANCHO / 2, alto: ALTO, masa: 1 });
      // Empujón inicial hacia fuera, más fuerte cuanto más alto está.
      const h = b.malla.position.y;
      const dir = new THREE.Vector3(b.malla.position.x + (Math.random() - 0.5), 0, b.malla.position.z + (Math.random() - 0.5));
      if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      F.empujar(p, dir, 0.6 + h * 0.32);
      return p;
    });
    audio.explosion();
    haptics.explosion(culpable);
    ctx.shake?.(12, 9);
    decir(`${players[culpable].name} tiró la torre`, 3);
    setTimeout(() => {
      if (acabado) return;
      acabado = true;
      ctx.finish({
        winner: 1 - culpable,
        scores: [colocados[0], colocados[1]],
        detail: `Torre de ${pisos.length} pisos · ${colocados[0] + colocados[1]} bloques movidos`,
        record: ctx.record('pisos', pisos.length, 'high'),
      });
    }, 2600);
  }

  /* ---------------- Presentación ---------------- */

  function moverCamara(dt) {
    // La cámara se coloca del lado por el que sale el bloque elegido.
    const b = bloqueSel();
    const objetivoAng = b && !b.horizontal ? 0 : Math.PI / 2;
    camAng += (objetivoAng - camAng) * Math.min(1, dt * 2.2);
    const alturaMira = fase === 'cayendo' ? 2.5 : (selPiso * ALTO) * 0.5 + 3;
    const r = 13;
    mundo.camara.position.set(Math.sin(camAng) * r, alturaMira + 4.2, Math.cos(camAng) * r);
    // La sacudida se aplica a la cámara: la torre parece pesar.
    if (sacudida > 0) {
      mundo.camara.position.x += (Math.random() - 0.5) * sacudida * 0.5;
      mundo.camara.position.y += (Math.random() - 0.5) * sacudida * 0.3;
    }
    mundo.camara.lookAt(0, alturaMira, 0);
  }

  function pintarPanel() {
    if (fase === 'cayendo' || acabado) { panel.centro('¡Abajo!'); panel.sub(aviso); panel.barra(null); return; }
    const j = players[turno];
    panel.centro(`<span style="color:${j.color}">${j.name}</span> · piso ${selPiso + 1} de ${pisos.length}`);
    panel.sub(avisoT > 0 ? aviso : (fase === 'sacando' ? 'Sigue tirando… o suelta para dejarla asentar' : 'Elige bloque con ↑ ↓ ← → y mantén acción para tirar'));
    panel.pie(`Bloques movidos: ${players[0].name} ${colocados[0]} · ${players[1].name} ${colocados[1]}`);
    panel.barra(tambaleo, tambaleo > 0.72 ? '#ff4757' : tambaleo > 0.45 ? '#ffd166' : '#a8ff3e');
  }

  return {
    init() {
      construir();
      moverSeleccion(0, 0);
      marcador = ctx.ui.scoreboard({ center: 'Torre' });
      marcador.update(0, 0);
    },

    update(dt) {
      if (avisoT > 0) avisoT -= dt;
      sacudida = Math.max(0, sacudida - dt * 3);
      const p = input.player(turno);

      if (fase === 'elegir') {
        if (p.pressed('up')) moverSeleccion(1, 0);
        if (p.pressed('down')) moverSeleccion(-1, 0);
        if (p.pressed('left')) moverSeleccion(0, -1);
        if (p.pressed('right')) moverSeleccion(0, 1);
        if (p.pressed('a')) empezarTirar();
        // Fuera de turno la torre se asienta poco a poco.
        tambaleo = Math.max(desequilibrio(), tambaleo - dt * 0.16);
      } else if (fase === 'sacando') {
        if (p.held('a')) {
          tirando.avance = Math.min(1, tirando.avance + dt * 0.55);
          // Cuanto peor está la torre, más castiga cada centímetro de tirón.
          const riesgo = 0.12 + desequilibrio() * 0.75 + (tirando.bloque.ranura !== 1 ? 0.16 : 0);
          tambaleo += riesgo * dt * 0.85;
          sacudida = Math.min(1, tambaleo);
          if (Math.random() < dt * 6) audio.tone({ freq: 90 + Math.random() * 60, dur: 0.05, gain: 0.05 + tambaleo * 0.08, type: 'sine' });
          if (tirando.avance >= 1) completarTirada();
        } else {
          // Soltar devuelve el bloque a su sitio y la torre respira.
          tirando.avance = Math.max(0, tirando.avance - dt * 1.4);
          tambaleo = Math.max(desequilibrio(), tambaleo - dt * 0.35);
          if (tirando.avance <= 0) { tirando = null; fase = 'elegir'; }
        }
        if (tirando) {
          const b = tirando.bloque;
          const d = tirando.avance * (LARGO * 0.95);
          b.malla.position.copy(b.base);
          if (b.horizontal) b.malla.position.x += d; else b.malla.position.z += d;
        }
        if (tambaleo >= 1) { derrumbar(turno); return; }
      } else if (fase === 'colocando') {
        const b = todos.find((x) => x.destino);
        if (b) {
          b.malla.position.lerp(b.destino, 1 - Math.exp(-6 * dt));
          if (b.malla.position.distanceTo(b.destino) < 0.02) {
            b.malla.position.copy(b.destino);
            delete b.destino;
            marcador?.update(colocados[0], colocados[1]);
            turno = 1 - turno;
            tirando = null;
            selPiso = Math.min(selPiso, pisoMax());
            moverSeleccion(0, 0);
            fase = 'elegir';
            tambaleo = Math.max(desequilibrio(), tambaleo);
            if (tambaleo >= 1) derrumbar(turno);
          }
        } else { fase = 'elegir'; }
      } else if (fase === 'cayendo') {
        for (const pz of piezas) F.pasoPieza(pz, dt, { sueloY: ALTO / 2, friccion: 3 });
      }

      // Inclinación general: la torre entera se ladea con el desequilibrio.
      const inclina = tambaleo * 0.055;
      if (fase !== 'cayendo') {
        torre.rotation.z = Math.sin(performance.now() * 0.0016) * inclina;
        torre.rotation.x = Math.cos(performance.now() * 0.0013) * inclina * 0.7;
      }

      const sel = bloqueSel();
      marcoSel.visible = (fase === 'elegir' || fase === 'sacando') && !!sel;
      if (sel) {
        marcoSel.position.copy(sel.malla.position);
        // El marco tiene la forma de un bloque tumbado: para los de canto basta
        // con girarlo un cuarto de vuelta.
        marcoSel.rotation.y = sel.horizontal ? 0 : Math.PI / 2;
        marcoSel.material.color.setStyle(players[turno].color);
      }

      moverCamara(dt);
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
