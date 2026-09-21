#!/bin/bash
# ============================================================
#  2 Player Arcade — arranque rápido (doble clic en Finder)
# ============================================================
#
#  Los juegos usan módulos ES (import/export), y los navegadores los bloquean
#  cuando la página se abre con file://. Por eso hace falta un servidor local.
#
#  Con Node (lo normal en un Mac con Xcode o Homebrew) arranca el servidor
#  completo: además de servir el arcade, hospeda las salas que convierten un
#  iPad o un móvil en mando de un jugador.
#
#  Sin Node cae al servidor de Python que trae macOS: se juega igual con el
#  teclado, pero sin mandos táctiles.
#
#  Todo sigue siendo 100% offline: el servidor solo sirve esta carpeta y solo
#  habla con los dispositivos de tu propia wifi.
#
#  Para los juegos de Touch Bar hace falta la app de escritorio:
#      cd desktop && npm install && npm start
# ============================================================

cd "$(dirname "$0")" || exit 1

PUERTO=8765

# Finder abre los .command con un PATH mínimo, y Node casi nunca está ahí. Sin
# esto el script no lo encuentra, cae al servidor de reserva y los mandos
# táctiles se quedan sin sala. Se añaden los sitios habituales de Node.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.bun/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1

# Si el puerto está ocupado: si es el servidor de este arcade (con salas) se
# reutiliza; si es otra cosa —por ejemplo un servidor de reserva que quedó
# abierto— se prueba el puerto siguiente en vez de servir un arcade sin mandos.
while lsof -nP -iTCP:$PUERTO -sTCP:LISTEN >/dev/null 2>&1; do
  if curl -sI -m 2 "http://localhost:$PUERTO/index.html" 2>/dev/null | grep -qi '^x-2pa: salas'; then
    echo "Ya había un servidor del arcade en el puerto $PUERTO. Abriendo el menú…"
    open "http://localhost:$PUERTO/index.html"
    exit 0
  fi
  echo "El puerto $PUERTO lo usa otro servidor sin salas de mando; pruebo el siguiente."
  PUERTO=$((PUERTO + 1))
  if [ "$PUERTO" -gt 8785 ]; then
    echo "No encontré un puerto libre entre 8765 y 8785."
    read -r -p "Pulsa Intro para cerrar…"
    exit 1
  fi
done

echo "╔══════════════════════════════════════════════╗"
echo "║              2 PLAYER ARCADE                 ║"
echo "╚══════════════════════════════════════════════╝"
echo

if command -v node >/dev/null 2>&1; then
  # ---- Servidor completo: arcade + salas de mando ----
  node server/servidor.js "$PUERTO" &
  SERVIDOR=$!
  trap 'kill $SERVIDOR 2>/dev/null' EXIT INT TERM
  sleep 1
  open "http://localhost:$PUERTO/index.html"
  wait $SERVIDOR
  exit 0
fi

# ---- Reserva: Python, sin salas de mando ----
echo "No se encontró Node, así que los mandos táctiles no estarán disponibles."
echo "Para activarlos, instala Node desde https://nodejs.org y vuelve a abrir esto."
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "Tampoco se encontró python3."
  echo "Instálalo con:  xcode-select --install"
  read -r -p "Pulsa Intro para cerrar…"
  exit 1
fi

echo "Servidor local en http://localhost:$PUERTO"
echo "Cierra esta ventana de Terminal para apagarlo."
echo

# Servidor con caché desactivada: al editar un juego basta con recargar la
# página para ver el cambio. Con el http.server de serie el navegador se queda
# con la versión vieja del .js y parece que tus ediciones no hacen nada.
python3 - "$PUERTO" <<'PY' >/dev/null 2>&1 &
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class SinCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        super().end_headers()
    def log_message(self, *args):
        pass

ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), SinCache).serve_forever()
PY
SERVIDOR=$!

# Se cierra el servidor al cerrar la Terminal, para no dejarlo colgado.
trap 'kill $SERVIDOR 2>/dev/null' EXIT INT TERM

sleep 1
open "http://localhost:$PUERTO/index.html"

wait $SERVIDOR
