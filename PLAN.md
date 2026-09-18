# Plan — 50 Minijuegos Locales para 2 Jugadores

> Propuesta del 2026-07-25. Juegos para dos personas en una misma Mac (MacBook Pro M1 Touch Bar),
> compartiendo teclado. HTML + CSS + JS vanilla, modular, sin frameworks, sin build, 100% offline.

---

## 1. Hallazgos de la investigación

- **Referentes más jugados en "2 players, 1 keyboard"**: Fireboy & Watergirl (co-op), Get On Top,
  Rooftop Snipers, 12 MiniBattles, Tank Trouble, Basket Bros / Basketball Legends, Curve Fever
  (Achtung, die Kurve!), Slime Volleyball, EGGNOGG+ (esgrima estilo Nidhogg). El estándar universal
  es **P1 = WASD, P2 = Flechas**.
- **Ghosting de teclado**: los teclados no-gaming (incluido el del MacBook) registran un número
  limitado de teclas simultáneas (~4-6 según combinación). Regla de diseño: **máximo 2-3 teclas
  sostenidas por jugador**, clusters separados físicamente, y remapeo disponible. El hub incluirá
  un **test de teclado** para verificar el rollover real de la Mac.
- **Assets libres**: Kenney.nl → CC0/dominio público (60.000+ sprites, UI, sonidos, sin atribución
  requerida, uso comercial permitido). Google Fonts (p. ej. Press Start 2P) → licencia OFL,
  se puede vendorizar para uso offline. OpenGameArt → filtrar por CC0.
- **Marcas**: las *mecánicas* de juego no tienen copyright, pero los *nombres y el arte* sí.
  Todos los juegos usan **nombres y arte propios** (nada de "Tetris", "Pac-Man", "Bomberman"
  como nombres visibles; sí sus mecánicas, reinterpretadas).

## 2. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Stack | HTML + CSS + JS vanilla con **ES Modules**. Cero dependencias, cero build. |
| Ejecución | ESM no funciona con `file://` → **`start.command`** (doble clic): levanta `python3 -m http.server` y abre el hub en el navegador. Funciona offline. |
| Render | Canvas 2D para juegos de acción; DOM+CSS para tablero/tipeo (menos código, mejor texto). Bucle `requestAnimationFrame` con dt fijo, escala retina (`devicePixelRatio`). |
| Input | Por **`e.code`** (posición física → independiente del layout español/inglés). Remapeo por jugador guardado en localStorage. Auto-pausa al perder foco la ventana. |
| Mac / Touch Bar | Sin teclas F (son virtuales en Touch Bar), sin combos Cmd/Opt, `preventDefault` en Espacio/flechas (no scroll). Pantalla completa con botón en el hub. |
| Audio | SFX retro **sintetizados con WebAudio** (cero archivos). Opcional: SFX CC0 de Kenney. Mute/volumen persistente. |
| Persistencia | localStorage: perfiles (nombre, color, emoji), **marcador histórico P1 vs P2** (global y por juego), récords, ajustes, remapeos. |
| Licencias | Solo CC0 / OFL / MIT, vendorizado en `assets/` con `LICENSES.md`. |

### Estructura de carpetas

```
2-player-web/
├── index.html            ← hub: catálogo, torneo, marcador, ajustes
├── start.command         ← doble clic: servidor local + abre el hub
├── core/
│   ├── engine.js         ← bucle, canvas, escala retina, pausa
│   ├── input.js          ← teclado 2P (e.code), remapeo, test de teclado
│   ├── audio.js          ← SFX sintetizados (WebAudio)
│   ├── ui.js             ← overlays: countdown, pausa, ganador, ayuda de teclas
│   ├── storage.js        ← perfiles, rivalidad, récords, ajustes
│   └── theme.css         ← sistema de diseño (variables CSS)
├── assets/
│   └── LICENSES.md       ← fuentes tipográficas y assets CC0 vendorizados
└── games/
    ├── manifest.js       ← registro de los 50 juegos
    ├── 01-pong-neon/
    │   ├── index.html    ← cada juego abre solo o desde el hub
    │   ├── game.js
    │   └── game.css      (opcional)
    └── … (una carpeta por juego)
```

### Contrato de cada juego (`game.js`)

```js
export const meta = {
  id: 'pong-neon',
  nombre: 'Pong Neón',
  categoria: 'arcade',            // arcade | reflejos | tablero | coop
  descripcion: 'El duelo de paletas definitivo, con power-ups.',
  controles: { p1: ['W/S mover'], p2: ['↑/↓ mover'] },
  duracion: '2-5 min',
};

export function create(ctx) {     // ctx: { canvas, input, audio, ui, storage, config }
  return { init() {}, update(dt) {}, render() {}, destroy() {} };
}
```

Modificar un juego = tocar **solo su carpeta**. Agregar uno = crear carpeta + 1 línea en `manifest.js`.

### Controles estándar

| | Mover | Acción | Especial |
|---|---|---|---|
| **P1** (izquierda) | `W A S D` | `Espacio` (pulgar) | `E` |
| **P2** (derecha) | `↑ ↓ ← →` | `M` | `N` |

- Globales: `Esc` = pausa/menú (reanudar · reiniciar · salir al hub) · `R` = revancha rápida.
- Juegos por turnos: cualquier jugador usa WASD **o** flechas + `Espacio`/`Enter` para confirmar.
- Juegos de tipeo: solo `Esc` como tecla reservada.
- Todo remapeable desde Ajustes.

## 3. Catálogo de 50 juegos

### A. Duelos arcade — tiempo real (20)

| # | Juego | La idea | Inspirado en |
|---|---|---|---|
| 1 | Pong Neón | Paleta vs paleta, power-ups opcionales | Pong |
| 2 | Hockey de Mesa | Disco y físicas top-down | Air hockey |
| 3 | Curvas | Tu línea crece y deja huecos; no choques | Achtung, die Kurve! / Curve Fever |
| 4 | Ciclos de Luz | Estelas sólidas, encierra al rival | Tron |
| 5 | Duelo de Serpientes | Come fruta, crece, no choques | Snake 2P |
| 6 | Tanques | Balas que rebotan en un laberinto | Combat (Atari) / Tank Trouble |
| 7 | Duelo Estelar | Naves + gravedad de un sol central | Spacewar! |
| 8 | Artillería | Ángulo + potencia + viento, por turnos | Scorched Earth / Worms |
| 9 | Sumo | Empuja al rival fuera del círculo | — (física propia) |
| 10 | Voley Slime | Semicírculos saltarines y una pelota | Slime Volleyball |
| 11 | Fútbol Cabezón | 1v1 con saltos y chilenas | Head Soccer |
| 12 | Basket Slime | 1v1 a canasta con físicas | Basket Bros |
| 13 | Bombas | Laberinto, bombas y power-ups | Bomberman |
| 14 | Justa Aérea | Aleteo y golpes desde arriba | Joust |
| 15 | Aleteo | Carrera flappy, primero a la meta | Flappy Bird (versus) |
| 16 | Circuito | Carrera top-down por vueltas | Micro Machines |
| 17 | Picada | Cambios de marcha con timing perfecto | Drag racing |
| 18 | Esgrima | Estocadas y terreno, hasta la salida | Nidhogg / EGGNOGG+ |
| 19 | Arquería | Duelo de arco por turnos, con viento | Bowman |
| 20 | Bolitas vs Fantasma | Asimétrico: uno come el laberinto, el otro caza | Pac-Man (1 vs 1) |

### B. Versus variados (5)

| # | Juego | La idea | Inspirado en |
|---|---|---|---|
| 21 | Muro Doble | Ladrillos al centro; rompe más que el rival | Breakout (duelo) |
| 22 | Bloques Versus | Tetrominós; tus líneas mandan basura al rival | Tetris (versus) |
| 23 | Dino Doble | Runner de saltos en dos carriles, último en pie | Chrome Dino |
| 24 | Lluvia de Meteoros | Esquiva; la arena se encoge; último vivo | Survival arena |
| 25 | Duelo del Oeste | Espera la señal… ¡desenfunda primero! | Quick draw westerns |

### C. Reflejos y fiesta (10)

| # | Juego | La idea | Inspirado en |
|---|---|---|---|
| 26 | Tira y Afloja | Machaca tu tecla y arrastra la cuerda | Button mashers |
| 27 | Reflejos | Señales válidas y engañosas; primera tecla correcta gana | Reaction duels |
| 28 | Simón Dice | Secuencia que crece; el que falla pierde | Simon |
| 29 | Topos | Whack-a-mole con dos rejillas de teclas (QWE-ASD-ZXC vs UIO-JKL-M,.) | Whack-a-mole |
| 30 | Carrera de Teclas | Escribe la frase; tu corredor avanza | Typing races |
| 31 | Duelo de Palabras | Escribe palabras para atacar y escudarte | Typing warriors |
| 32 | Cálculo Relámpago | Operación en pantalla; responde primero | Math blitz |
| 33 | Ritmo | Flechas cayendo, precisión estilo baile | DDR / Stepmania |
| 34 | Semáforo | Avanza en verde, congélate en rojo | Luz roja, luz verde |
| 35 | Trivia Buzzer | Banco de preguntas en español; buzzea y responde | Trivia de mesa |

### D. Tablero y mente — hot-seat (10)

| # | Juego | La idea | Inspirado en |
|---|---|---|---|
| 36 | Tres en Raya ∞ | Clásico + modo Ultimate (9 tableros) | Tic-tac-toe |
| 37 | Conecta 4 | Fichas que caen, 4 en línea | Connect Four |
| 38 | Damas | Con damas coronadas y capturas múltiples | Checkers |
| 39 | Reversi | Voltea fichas, domina el tablero | Othello |
| 40 | Timbiriche | Cierra cajitas, roba turnos | Dots and Boxes |
| 41 | Gomoku | 5 en línea en tablero grande | Gomoku |
| 42 | Mancala | Siembra semillas, captura la cosecha | Mancala/Oware |
| 43 | Batalla Naval | Colocación secreta con "cortina", luego disparos | Battleship |
| 44 | Ajedrez | Reglas completas (enroque, al paso, jaque mate); sin IA — son 2 humanos | Ajedrez |
| 45 | Memoria | Parejas por turnos en el mismo tablero | Concentration |

### E. Cooperativos (5)

| # | Juego | La idea | Inspirado en |
|---|---|---|---|
| 46 | Alunizaje a Dos | Uno rota la nave, el otro propulsa: aterricen suave | Lunar Lander |
| 47 | Cocina Caos | Pedidos contrarreloj: uno pica, otro cocina y entrega | Overcooked |
| 48 | Piloto y Artillero | Uno vuela la nave, el otro dispara la torreta | Asteroids co-op |
| 49 | Doble Llave | Palancas y puertas cruzadas: solo pasan juntos | Fireboy & Watergirl |
| 50 | Torre a Dos | Grúa alternada: apilen la torre más alta | Tower stackers |

## 4. Extras del hub

- **Modo torneo / ruleta**: elige N juegos al azar (filtrable por categoría), serie al mejor de X,
  campeón de la noche. Ideal para citas/tardes de juegos.
- **Rivalidad histórica**: marcador P1 vs P2 acumulado de todos los tiempos, global y por juego.
- **Perfiles**: nombre, color y emoji por jugador; los juegos los usan en HUD y pantallas de victoria.
- **Ajustes**: remapeo de teclas, volumen/mute, test de teclado (rollover), pantalla completa.
- **Catálogo**: búsqueda y filtros por categoría/duración; `R` = revancha instantánea en todo juego.

## 5. Fases de construcción

1. **Fase 0** — `core/` + hub + Pong Neón como juego de referencia (valida la arquitectura).
2. **Fase 1** — Lote piloto: 10 juegos representativos (2 por categoría) → feedback de estilo y controles.
3. **Fases 2-5** — Lotes de ~10 hasta completar los 50.
4. **Fase 6** — Pulido: torneo, balance, sonido, récords, QA de ghosting en la Mac real.

## 6. Fuentes

- Referentes y estándar WASD/flechas: https://2player.co/ · https://twozygames.com/blog/best-2player-games/ · https://komligames.com/blog/best-2-player-games-one-keyboard
- Guía same-keyboard y ghosting: https://twozygames.com/blog/same-keyboard-guide/ · https://keyboardtester.click/blog/what-is-keyboard-ghosting-anti-ghosting-fix-guide.php
- Assets CC0: https://kenney.nl · https://opengameart.org/content/all-cc0-uploader-kenney
- Juegos web local-multiplayer (inspiración): https://itch.io/games/local-multiplayer/platform-web

## 7. Pendientes de decisión

- [ ] Estética: neón arcade por código · pixel art Kenney · mixta
- [ ] Arranque: lote piloto de 10 vs los 50 de corrido
- [ ] Ajustes a la lista de juegos (quitar/agregar/cambiar)
