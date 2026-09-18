/**
 * servidor.js — sirve el arcade y hospeda las salas de mandos.
 *
 * Dos trabajos, un proceso:
 *   1. Servir los archivos del proyecto (el hub, los juegos, mando.html).
 *   2. Un relé de salas por WebSocket: la Mac abre una sala y los iPads o
 *      móviles se unen como mando de un jugador.
 *
 * El relé no sabe nada de juegos. Solo reenvía a la pantalla las acciones que
 * pulsa cada mando —las mismas seis de core/input.js— y devuelve a los mandos
 * el perfil de botones que la pantalla les pide dibujar. Toda la lógica sigue
 * viviendo en el navegador de la Mac, así que un juego nuevo no necesita
 * tocar este archivo.
 *
 * Todo ocurre dentro de la red local: no hay salida a internet, ni cuentas,
 * ni base de datos. Al cerrar el proceso no queda nada.
 *
 *   node server/servidor.js [puerto]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { montarWebSocket } from './ws.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.argv[2]) || 8765;

/* ---------------- Archivos estáticos ---------------- */

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

function servirArchivo(req, res) {
  const url = new URL(req.url, 'http://local');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  // Atajo para teclear en el iPad: /mando en vez de /mando.html
  if (rel === '/mando') rel = '/mando.html';

  // Nunca se sale de la carpeta del proyecto, pase lo que pase en la URL.
  const destino = path.join(RAIZ, path.normalize(rel));
  if (!destino.startsWith(RAIZ)) {
    res.writeHead(403).end('403');
    return;
  }

  fs.readFile(destino, (err, datos) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No existe: ' + rel);
      return;
    }
    res.writeHead(200, {
      'content-type': TIPOS[path.extname(destino).toLowerCase()] || 'application/octet-stream',
      // Sin caché en absoluto: se edita sobre la marcha y nada aquí pesa.
      // Con `no-cache` a secas el navegador reutiliza el módulo viejo al no
      // haber validador, y las ediciones parecen no surtir efecto.
      'cache-control': 'no-store, must-revalidate',
      pragma: 'no-cache',
    });
    res.end(datos);
  });
}

/* ---------------- Direcciones de la red local ---------------- */

/** IPv4 de las interfaces reales, para enseñar por dónde entra el iPad. */
function direccionesLocales() {
  const salida = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const red of lista || []) {
      if (red.family === 'IPv4' && !red.internal) salida.push(red.address);
    }
  }
  return salida;
}

/* ---------------- Salas ---------------- */

/* Sin vocales para que ningún código salga una palabra desafortunada, y sin
   letras que se confundan al leerlas de una pantalla a otra (I/1, O/0). */
const ALFABETO = 'BCDFGHJKLMNPQRSTVWXYZ23456789';

/** Cuánto sobrevive una sala sin pantalla antes de cerrarse del todo. */
const GRACIA_MS = 25000;

/** codigo -> { codigo, pantalla, mandos: Map<slot, Conexion>, perfiles, creada } */
const salas = new Map();

function codigoLibre() {
  for (let intento = 0; intento < 200; intento++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
    if (!salas.has(c)) return c;
  }
  return null;
}

/** Estado que la pantalla necesita para pintar quién está conectado. */
function resumen(sala) {
  return {
    tipo: 'sala',
    codigo: sala.codigo,
    puerto: PUERTO,
    direcciones: direccionesLocales(),
    mandos: [...sala.mandos.keys()].sort(),
  };
}

function avisarPantalla(sala) {
  sala.pantalla?.enviar(resumen(sala));
}

function cerrarSala(sala) {
  for (const m of sala.mandos.values()) {
    m.enviar({ tipo: 'sala-cerrada' });
    m.cerrar();
  }
  salas.delete(sala.codigo);
}

/* ---------------- Arranque ---------------- */

const servidor = http.createServer((req, res) => {
  if (req.url.startsWith('/api/red')) {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ puerto: PUERTO, direcciones: direccionesLocales() }));
    return;
  }
  servirArchivo(req, res);
});

montarWebSocket(servidor, '/ws', (con) => {
  con.onMensaje = (msg) => {
    switch (msg.tipo) {
      /* La Mac abre una sala y se queda escuchando.
         Si manda un código, está reclamando una sala que se quedó huérfana:
         eso es lo que pasa al pasar del menú a un juego, porque la página
         cambia y con ella se va el WebSocket. Los mandos ni se enteran. */
      case 'crear': {
        const pedido = String(msg.codigo || '').toUpperCase();
        const previa = pedido && salas.get(pedido);
        if (previa && previa.huerfanaDesde) {
          previa.huerfanaDesde = null;
          previa.pantalla = con;
          con.datos = { rol: 'pantalla', codigo: previa.codigo };
          con.enviar(resumen(previa));
          for (const m of previa.mandos.values()) m.enviar({ tipo: 'pantalla-vuelve' });
          return;
        }
        const codigo = codigoLibre();
        if (!codigo) { con.enviar({ tipo: 'error', razon: 'No hay códigos libres' }); return; }
        const sala = {
          codigo, pantalla: con, mandos: new Map(), perfiles: new Map(),
          creada: Date.now(), huerfanaDesde: null,
        };
        salas.set(codigo, sala);
        con.datos = { rol: 'pantalla', codigo };
        con.enviar(resumen(sala));
        break;
      }

      /* Un iPad se une como mando del jugador `slot` (0 o 1). */
      case 'unir': {
        const sala = salas.get(String(msg.codigo || '').toUpperCase());
        if (!sala) { con.enviar({ tipo: 'error', razon: 'No existe ninguna sala con ese código' }); return; }

        // Si no pide sitio concreto, se le da el primero libre.
        let slot = Number.isInteger(msg.slot) ? msg.slot : [0, 1].find((s) => !sala.mandos.has(s));
        if (slot === undefined) { con.enviar({ tipo: 'error', razon: 'La sala ya tiene dos mandos' }); return; }
        if (sala.mandos.has(slot)) sala.mandos.get(slot).cerrar();  // el nuevo releva al viejo

        sala.mandos.set(slot, con);
        con.datos = { rol: 'mando', codigo: sala.codigo, slot };
        con.enviar({ tipo: 'unido', slot, codigo: sala.codigo });
        // El perfil vigente se reenvía al recién llegado: si entra a mitad de
        // partida, dibuja los botones de ese juego y no una botonera genérica.
        if (sala.perfiles.has(slot)) con.enviar(sala.perfiles.get(slot));
        else if (sala.perfiles.has('todos')) con.enviar(sala.perfiles.get('todos'));
        avisarPantalla(sala);
        break;
      }

      /* La pantalla dice a los mandos qué botones dibujar. */
      case 'perfil': {
        const sala = salas.get(con.datos.codigo);
        if (!sala || con.datos.rol !== 'pantalla') return;
        const destino = Number.isInteger(msg.slot) ? msg.slot : 'todos';
        sala.perfiles.set(destino, msg);
        if (destino === 'todos') for (const m of sala.mandos.values()) m.enviar(msg);
        else sala.mandos.get(destino)?.enviar(msg);
        break;
      }

      /* Vibración o aviso puntual de la pantalla a un mando concreto. */
      case 'aviso': {
        const sala = salas.get(con.datos.codigo);
        if (!sala || con.datos.rol !== 'pantalla') return;
        if (Number.isInteger(msg.slot)) sala.mandos.get(msg.slot)?.enviar(msg);
        else for (const m of sala.mandos.values()) m.enviar(msg);
        break;
      }

      /* El camino caliente: una pulsación del mando hacia la pantalla. */
      case 'accion':
      case 'stick':
      case 'trazo': {
        const sala = salas.get(con.datos.codigo);
        if (!sala || con.datos.rol !== 'mando') return;
        sala.pantalla?.enviar({ ...msg, slot: con.datos.slot });
        break;
      }

      case 'ping':
        con.enviar({ tipo: 'pong', t: msg.t });
        break;
    }
  };

  con.onCierre = () => {
    const sala = salas.get(con.datos.codigo);
    if (!sala) return;
    if (con.datos.rol === 'pantalla') {
      if (sala.pantalla !== con) return;
      // Margen de gracia: pasar del menú a un juego recarga la página y tira
      // el WebSocket. Sin esto, cada partida obligaría a reemparejar el iPad.
      sala.pantalla = null;
      sala.huerfanaDesde = Date.now();
      for (const m of sala.mandos.values()) m.enviar({ tipo: 'pantalla-fuera' });
      setTimeout(() => {
        if (salas.get(sala.codigo) === sala && sala.huerfanaDesde) cerrarSala(sala);
      }, GRACIA_MS);
      return;
    }
    if (sala.mandos.get(con.datos.slot) === con) {
      sala.mandos.delete(con.datos.slot);
      // Soltar todo lo que tuviera pulsado: si no, el personaje sigue andando.
      sala.pantalla?.enviar({ tipo: 'mando-fuera', slot: con.datos.slot });
      avisarPantalla(sala);
    }
  };
});

servidor.listen(PUERTO, () => {
  const ips = direccionesLocales();
  const linea = '═'.repeat(52);
  console.log(`╔${linea}╗`);
  console.log('   2 PLAYER ARCADE — servidor con salas de mando');
  console.log(`╚${linea}╝\n`);
  console.log(`  En esta Mac:   http://localhost:${PUERTO}`);
  for (const ip of ips) {
    console.log(`  Desde el iPad: http://${ip}:${PUERTO}/mando`);
  }
  if (!ips.length) console.log('  (sin red local detectada: los mandos no podrán conectarse)');
  console.log('\n  Ctrl+C para apagarlo.\n');
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PUERTO} ya está ocupado. Cierra el otro servidor o usa: node server/servidor.js 8766`);
    process.exit(1);
  }
  throw e;
});
