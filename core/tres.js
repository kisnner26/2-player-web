/**
 * tres.js — el andamio 3D que comparten los juegos de la categoría Realismo.
 *
 * Un juego 3D del catálogo se declara con `render: 'dom'`: el shell no le da
 * lienzo 2D ni Engine, solo un contenedor y un bucle con `update(dt)`. Este
 * módulo pone todo lo demás — renderizador, escena, cámara, luces de estudio,
 * suelo, niebla, redimensionado y limpieza — para que un juego nuevo sea su
 * mecánica y poco más.
 *
 * Tres decisiones que conviene conocer antes de tocar nada:
 *
 *   1. El render va DENTRO de `update(dt)`. El bucle DOM del shell no llama a
 *      `render()`, y además así la imagen nunca adelanta a la física.
 *
 *   2. El contexto WebGL se libera a mano en `destruir()`. El catálogo carga y
 *      descarga juegos sin recargar la página (reinicio, torneo, prueba de
 *      humo); sin `forceContextLoss()` el navegador acumula contextos hasta
 *      quedarse sin ellos y los juegos siguientes salen en negro.
 *
 *   3. La pantalla partida se hace con tijera y viewport sobre UN solo
 *      renderizador. Dos renderizadores serían dos contextos y el doble de
 *      memoria de vídeo para dibujar la misma escena.
 *
 * Three.js vive en vendor/ dentro del repositorio: ni npm install ni conexión.
 */

import * as THREE from '../vendor/three/three.module.min.js';

export { THREE };

/* ---------------- Materiales y cuerpos ---------------- */

/**
 * Material estándar con los ajustes que dan aspecto de objeto real:
 * rugosidad alta por defecto (nada brilla como plástico nuevo salvo que se
 * pida) y metalness baja.
 */
export function mat(color, { rug = 0.72, met = 0.05, emisivo = null, brillo = 0.4, transparente = 0, lados = null } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: rug,
    metalness: met,
  });
  if (emisivo) { m.emissive = new THREE.Color(emisivo); m.emissiveIntensity = brillo; }
  if (transparente) { m.transparent = true; m.opacity = 1 - transparente; }
  if (lados) m.side = lados === 'doble' ? THREE.DoubleSide : THREE.BackSide;
  return m;
}

/** Caja que proyecta sombra. `pos` es el centro. */
export function caja(an, al, fo, material, pos = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(an, al, fo), material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

export function esfera(r, material, pos = null, seg = 24) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg / 2)), material);
  m.castShadow = true;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

export function cilindro(rArriba, rAbajo, alto, material, pos = null, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, rAbajo, alto, seg), material);
  m.castShadow = true;
  m.receiveShadow = true;
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/**
 * Sombra de contacto: un disco oscuro pegado al suelo bajo un objeto.
 *
 * La sombra proyectada del sol es suave y a veces se pierde; este disco es lo
 * que de verdad dice a qué altura está una pelota en el aire, que es
 * información de juego, no decoración.
 */
export function sombraContacto(radio = 0.4, opacidad = 0.34) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radio, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: opacidad, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  return m;
}

/** Sitúa la sombra de contacto bajo un objeto y la encoge con la altura. */
export function ajustarSombra(sombra, objeto, sueloY = 0, altoRef = 6) {
  const h = Math.max(0, objeto.position.y - sueloY);
  const k = Math.max(0.15, 1 - h / altoRef);
  sombra.position.set(objeto.position.x, sueloY + 0.012, objeto.position.z);
  sombra.scale.setScalar(k);
  sombra.material.opacity = 0.34 * k;
}

/**
 * Textura de tablero/fieltro/asfalto generada por código.
 *
 * Un plano de color plano se lee como cartón; con un poco de grano y unas
 * vetas la misma superficie pasa a leerse como madera o como fieltro. Se
 * genera en un canvas 2D para no arrastrar imágenes al repositorio.
 */
export function texturaGrano(base, veta, { lineas = 0, ruido = 0.06, repite = 1 } = {}) {
  const lienzo = document.createElement('canvas');
  lienzo.width = lienzo.height = 256;
  const g = lienzo.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);

  if (lineas > 0) {
    // Vetas de madera: curvas suaves y paralelas, con separación irregular.
    g.strokeStyle = veta;
    g.lineWidth = 1.4;
    for (let i = 0; i < lineas; i++) {
      const y = (i / lineas) * 256 + Math.sin(i * 3.1) * 4;
      g.globalAlpha = 0.10 + (i % 3) * 0.06;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 2.5);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  // Grano: sal y pimienta finas. Sin esto el material queda demasiado limpio.
  const img = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (Math.random() - 0.5) * 255 * ruido;
    img.data[i] += d; img.data[i + 1] += d; img.data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(lienzo);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repite, repite);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Etiqueta plana que siempre mira a cámara — números de bola, dorsales, avisos. */
export function cartel(texto, { color = '#ffffff', fondo = 'rgba(0,0,0,0.55)', escala = 1 } = {}) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 256; lienzo.height = 128;
  const g = lienzo.getContext('2d');
  g.fillStyle = fondo;
  g.beginPath();
  if (g.roundRect) g.roundRect(6, 26, 244, 76, 18); else g.rect(6, 26, 244, 76);
  g.fill();
  g.fillStyle = color;
  g.font = 'bold 54px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, 128, 64);
  const tex = new THREE.CanvasTexture(lienzo);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.4 * escala, 1.2 * escala, 1);
  sp.renderOrder = 10;
  return sp;
}

/* ---------------- Mundo ---------------- */

/**
 * Monta el mundo 3D dentro de un contenedor y devuelve los mandos para usarlo.
 *
 * @param {HTMLElement} raiz          normalmente `ctx.root`
 * @param {object} o
 * @param {string} [o.cielo]          color del fondo
 * @param {string} [o.horizonte]      segundo color del degradado del cielo
 * @param {number} [o.niebla]         densidad de niebla (0 = sin niebla)
 * @param {number} [o.sol]            intensidad de la luz principal
 * @param {number[]} [o.solPos]       posición de la luz principal
 * @param {number} [o.sombraArea]     mitad del lado del área con sombra nítida
 * @param {boolean} [o.sombras]
 * @returns {object} mundo
 */
export function crearMundo(raiz, {
  cielo = '#0a0c12', horizonte = '#1b2030', niebla = 0.0,
  sol = 2.2, solPos = [24, 38, 18], sombraArea = 26, sombras = true,
  fov = 45, cerca = 0.1, lejos = 500,
} = {}) {
  const contenedor = document.createElement('div');
  contenedor.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
  raiz.appendChild(contenedor);

  const escena = new THREE.Scene();
  escena.background = new THREE.Color(cielo);
  // La niebla converge al color del horizonte, no al del cenit: así lo lejano
  // se disuelve justo donde empieza el cielo y no se ve dónde acaba el suelo.
  if (niebla > 0) escena.fog = new THREE.FogExp2(new THREE.Color(horizonte).getHex(), niebla);

  const camara = new THREE.PerspectiveCamera(fov, 16 / 9, cerca, lejos);
  camara.position.set(0, 12, 18);
  camara.lookAt(0, 0, 0);

  let render;
  try {
    render = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    contenedor.remove();
    throw new Error('WebGL no disponible: ' + e.message);
  }
  render.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  render.outputColorSpace = THREE.SRGBColorSpace;
  render.toneMapping = THREE.ACESFilmicToneMapping;
  render.toneMappingExposure = 1.05;
  if (sombras) {
    render.shadowMap.enabled = true;
    render.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  render.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  contenedor.appendChild(render.domElement);

  /* Cúpula de cielo.
     El color de fondo de la escena no pasa por el mapeo de tonos, pero la
     geometría sí: con un fondo plano aparecía una costura de dos azules justo
     encima del horizonte. Una cúpula con material básico se dibuja por el mismo
     camino que todo lo demás y el empalme desaparece — y de paso se gana un
     degradado de cenit a horizonte, que es lo que hace que un exterior parezca
     un exterior. No escribe profundidad: nunca tapa nada. */
  const cupula = (() => {
    const lienzo = document.createElement('canvas');
    lienzo.width = 4;
    lienzo.height = 128;
    const g = lienzo.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    // El degradado se mantiene en el color del cenit hasta bien pasada la mitad
    // de la esfera: la línea del horizonte cae en v = 0,5, y si el cambio
    // empezara antes el cielo entero saldría del color pálido de la bruma.
    grad.addColorStop(0, cielo);
    grad.addColorStop(0.45, cielo);
    grad.addColorStop(0.88, horizonte);
    grad.addColorStop(1, horizonte);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    const tex = new THREE.CanvasTexture(lienzo);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(lejos * 0.45, 24, 16),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }),
    );
    m.renderOrder = -1;
    return m;
  })();
  escena.add(cupula);

  /* Luces: un sol direccional que hace la sombra, un hemisférico que tiñe el
     relleno con el color del cielo por arriba y el del suelo por abajo, y una
     luz fría de contra para separar las siluetas del fondo. Con estas tres
     casi cualquier objeto de caja parece un objeto. */
  const luzSol = new THREE.DirectionalLight(0xfff2e0, sol);
  luzSol.position.set(solPos[0], solPos[1], solPos[2]);
  if (sombras) {
    luzSol.castShadow = true;
    luzSol.shadow.mapSize.set(2048, 2048);
    luzSol.shadow.camera.left = -sombraArea;
    luzSol.shadow.camera.right = sombraArea;
    luzSol.shadow.camera.top = sombraArea;
    luzSol.shadow.camera.bottom = -sombraArea;
    luzSol.shadow.camera.near = 1;
    luzSol.shadow.camera.far = sombraArea * 4;
    // Sin este sesgo, las superficies grandes se llenan de rayas de sombra
    // consigo mismas (acné de sombra) en cuanto el sol está bajo.
    luzSol.shadow.bias = -0.0006;
    luzSol.shadow.normalBias = 0.02;
  }
  escena.add(luzSol);

  const ambiente = new THREE.HemisphereLight(new THREE.Color(horizonte), new THREE.Color(cielo), 1.0);
  escena.add(ambiente);

  const contra = new THREE.DirectionalLight(0x9fc6ff, 0.5);
  contra.position.set(-solPos[0] * 0.6, solPos[1] * 0.5, -solPos[2]);
  escena.add(contra);

  let ancho = 1, alto = 1;

  function ajustar() {
    ancho = Math.max(1, contenedor.clientWidth || raiz.clientWidth || window.innerWidth);
    alto = Math.max(1, contenedor.clientHeight || raiz.clientHeight || window.innerHeight);
    render.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
    mundo.onAjustar?.(ancho, alto);
  }

  const alRedimensionar = () => ajustar();
  window.addEventListener('resize', alRedimensionar);

  const mundo = {
    THREE, escena, camara, render, luzSol, ambiente, contra, contenedor, cupula,
    get ancho() { return ancho; },
    get alto() { return alto; },
    /** Gancho opcional: se llama tras cada redimensionado. */
    onAjustar: null,

    ajustar,

    /** Añade objetos a la escena. Acepta varios de golpe. */
    add(...objetos) { objetos.forEach((o) => o && escena.add(o)); return objetos[0]; },

    /** Un fotograma con la cámara principal (o la que se le pase). */
    dibujar(cam = camara) {
      render.setScissorTest(false);
      render.setViewport(0, 0, ancho, alto);
      render.render(escena, cam);
    },

    /**
     * Pantalla partida vertical: jugador 1 arriba, jugador 2 abajo.
     *
     * Se parte en horizontal y no en vertical a propósito: en una pantalla de
     * portátil, dos mitades apaisadas conservan un campo de visión utilizable
     * para conducir o volar; dos columnas estrechas, no.
     */
    dibujarPartida(camA, camB, { separacion = 2 } = {}) {
      const mitad = Math.floor((alto - separacion) / 2);
      render.setScissorTest(true);
      // El origen de viewport en WebGL está abajo a la izquierda: el jugador 1
      // va arriba, así que ocupa la mitad de arriba en coordenadas de pantalla.
      render.setViewport(0, alto - mitad, ancho, mitad);
      render.setScissor(0, alto - mitad, ancho, mitad);
      camA.aspect = ancho / mitad;
      camA.updateProjectionMatrix();
      render.render(escena, camA);

      render.setViewport(0, 0, ancho, mitad);
      render.setScissor(0, 0, ancho, mitad);
      camB.aspect = ancho / mitad;
      camB.updateProjectionMatrix();
      render.render(escena, camB);
      render.setScissorTest(false);
    },

    /** Cámara secundaria con los mismos ajustes que la principal. */
    camaraExtra(fovPropio = fov) {
      return new THREE.PerspectiveCamera(fovPropio, ancho / alto, cerca, lejos);
    },

    destruir() {
      window.removeEventListener('resize', alRedimensionar);
      escena.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const materiales = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
        for (const m of materiales) {
          for (const clave of ['map', 'normalMap', 'roughnessMap', 'alphaMap', 'emissiveMap']) m[clave]?.dispose?.();
          m.dispose();
        }
      });
      escena.clear();
      render.dispose();
      // Ver la nota de cabecera: sin esto se agotan los contextos WebGL.
      render.forceContextLoss?.();
      render.domElement.remove();
      contenedor.remove();
    },
  };

  // El primer ajuste espera al layout: recién insertado, el contenedor mide 0.
  ajustar();
  if (ancho <= 1 || alto <= 1) requestAnimationFrame(ajustar);

  return mundo;
}

/* ---------------- Suelos y escenarios ---------------- */

/**
 * Suelo infinito con textura. Devuelve la malla por si el juego quiere moverla
 * (el truco de mover el suelo bajo el jugador en las carreras).
 */
export function suelo(mundo, {
  color = '#2a2f38', veta = '#20242c', tam = 400, repite = 60, lineas = 0, rug = 0.95,
} = {}) {
  const tex = texturaGrano(color, veta, { lineas, repite, ruido: 0.05 });
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(tam, tam),
    new THREE.MeshStandardMaterial({ map: tex, roughness: rug, metalness: 0 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  mundo.escena.add(m);
  return m;
}

/**
 * Sala cerrada: cuatro paredes y techo insinuados con un cubo invertido.
 * Da profundidad a los juegos de interior (billar, futbolín, bolos) sin
 * modelar nada.
 */
export function sala(mundo, { color = '#141821', tam = 90, alto = 26 } = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(tam, alto, tam),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 1, side: THREE.BackSide }),
  );
  m.position.y = alto / 2 - 0.1;
  mundo.escena.add(m);
  return m;
}

/** Público de fondo: filas de cápsulas de colores. Puro atrezo, sin coste. */
export function gradas(mundo, { filas = 4, porFila = 26, radio = 34, alturaBase = 2, color = 0x556 } = {}) {
  const geo = new THREE.CapsuleGeometry(0.45, 0.7, 4, 8);
  const total = filas * porFila;
  const malla = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1 }), total);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  let i = 0;
  for (let f = 0; f < filas; f++) {
    for (let k = 0; k < porFila; k++) {
      const a = (k / porFila) * Math.PI * 2 + f * 0.05;
      const r = radio + f * 2.2;
      m4.makeTranslation(Math.cos(a) * r, alturaBase + f * 1.5, Math.sin(a) * r);
      malla.setMatrixAt(i, m4);
      col.setHSL(((i * 0.137) % 1), 0.35, 0.42);
      malla.setColorAt(i, col);
      i++;
    }
  }
  malla.instanceMatrix.needsUpdate = true;
  if (malla.instanceColor) malla.instanceColor.needsUpdate = true;
  mundo.escena.add(malla);
  return malla;
}

/* ---------------- Panel de información ---------------- */

/**
 * HUD en DOM sobre el lienzo 3D.
 *
 * Dibujar el marcador dentro de la escena obligaría a cada juego a resolver
 * tipografía en textura; en DOM se hereda la del catálogo, se lee nítido en
 * retina y no cuesta un solo polígono.
 */
export function crearPanel(raiz) {
  const el = document.createElement('div');
  el.style.cssText = `
    position:absolute; inset:0; pointer-events:none; z-index:5;
    font-family: var(--font-ui, system-ui); color:#fff;`;
  el.innerHTML = `
    <div data-p="centro" style="position:absolute;top:56px;left:0;right:0;text-align:center;
      font-size:15px;font-weight:600;letter-spacing:.02em;text-shadow:0 2px 12px #000c"></div>
    <div data-p="sub" style="position:absolute;top:80px;left:0;right:0;text-align:center;
      padding:0 28px;line-height:1.6;font-size:12px;opacity:.78;text-shadow:0 2px 10px #000c"></div>
    <div data-p="pie" style="position:absolute;bottom:14px;left:0;right:0;text-align:center;
      font-size:11px;opacity:.5"></div>
    <div data-p="barra" style="position:absolute;bottom:44px;left:50%;transform:translateX(-50%);
      width:220px;height:9px;border-radius:6px;background:#ffffff1f;overflow:hidden;display:none">
      <i data-p="relleno" style="display:block;height:100%;width:0%;border-radius:6px;background:#fff"></i>
    </div>`;
  raiz.appendChild(el);
  const q = (n) => el.querySelector(`[data-p="${n}"]`);
  const centro = q('centro'), sub = q('sub'), pie = q('pie'), barra = q('barra'), relleno = q('relleno');

  return {
    el,
    centro(t) { centro.innerHTML = t ?? ''; },
    sub(t) { sub.innerHTML = t ?? ''; },
    pie(t) { pie.innerHTML = t ?? ''; },
    /** Barra de fuerza/tensión. `v` de 0 a 1; `null` la oculta. */
    barra(v, color = '#fff') {
      if (v == null) { barra.style.display = 'none'; return; }
      barra.style.display = 'block';
      relleno.style.width = `${Math.max(0, Math.min(1, v)) * 100}%`;
      relleno.style.background = color;
    },
    destruir() { el.remove(); },
  };
}

/* ---------------- Utilidades de cámara ---------------- */

/**
 * Cámara que persigue a un objeto con retardo.
 *
 * El retardo es lo que hace que conducir se sienta como conducir: la cámara
 * llega tarde al giro y el coche parece tener peso. Con la cámara clavada al
 * coche, la misma física se percibe como un fondo que se desliza.
 */
export function perseguir(cam, objetivo, dt, {
  distancia = 9, altura = 4, mirarAlto = 1.4, suavidad = 5, giro = null,
} = {}) {
  const ang = giro ?? objetivo.rotation.y;
  const deseada = new THREE.Vector3(
    objetivo.position.x - Math.sin(ang) * distancia,
    objetivo.position.y + altura,
    objetivo.position.z - Math.cos(ang) * distancia,
  );
  const k = 1 - Math.exp(-suavidad * dt);
  cam.position.lerp(deseada, k);
  cam.lookAt(objetivo.position.x, objetivo.position.y + mirarAlto, objetivo.position.z);
}
