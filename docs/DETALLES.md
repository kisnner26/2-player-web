# 2 Player Arcade

**520 minijuegos en una misma Mac**: 500 sin contar los de Touch Bar (y dos de ellos, para hasta cuatro). Sin internet, sin cuentas,
sin instalar nada, sin dependencias. HTML + CSS + JavaScript vanilla con módulos
ES: cada juego vive en su propia carpeta y se puede tocar sin romper el resto.

- **500 juegos de teclado compartido** — funcionan en cualquier navegador. Doce de ellos son de **un jugador contra bots**, con tres dificultades.
  Incluyen una categoría entera de **40 juegos para pareja**.
- **Mando de consola opcional**: un DualShock 4 por Bluetooth vale para
  cualquiera de los 520, sin configurar nada.
- **20 juegos exclusivos de Touch Bar** — solo aparecen en una MacBook con
  barra táctil, y solo dentro de la app de escritorio.
- **Interfaz sin emoji**: iconografía propia en línea (`core/icons.js`),
  preview gráfica generada por código en cada carta del catálogo
  (`core/preview.js`), y una pantalla de controles antes de cada partida
  que explica cómo se juega a los dos jugadores.
- **Música y ambiente en todos los juegos** (`core/ambiente.js`): banda
  sintetizada según la estética —lounge de ascensor, synthwave, jazz, chiptune—
  y el ruido del escenario (lluvia, público, grillos, oleaje) deducido de las
  etiquetas del juego.
- **Banda sonora soul original** (`core/soul.js`) para los juegos de ritmo:
  saxo, bajo caminante, batería con escobillas y piano eléctrico, todo
  sintetizado — sin usar ninguna grabación con copyright.

---

## Cómo se juega

### La forma normal (500 juegos)

Doble clic en **`start.command`**. Levanta un servidor local y abre el menú.

```bash
./start.command
```

> ¿Por qué hace falta un servidor? Los módulos ES (`import`/`export`) están
> bloqueados por los navegadores cuando la página se abre con `file://`. El
> servidor es local y sirve solo esta carpeta: sigue siendo 100% offline.

### Con los 20 juegos de Touch Bar

```bash
cd desktop
npm install
npm start
```

La primera vez descarga Electron (~150 MB). A partir de ahí ya es offline.

**Por qué hace falta:** ninguna Web API puede leer ni dibujar la Touch Bar.
No es una limitación de este proyecto, es que no existe. La única vía real es
un contenedor nativo, y Electron sí expone la API `TouchBar` completa
(botones, sliders, scrubbers, selectores de color, popovers). El envoltorio de
`desktop/` no hace nada más: carga la misma app web y traduce lo que los juegos
piden a objetos nativos de la barra.

Si la app no detecta Touch Bar, los 20 juegos quedan ocultos y los otros 500
funcionan igual. Para probarlos sin barra:

```bash
cd desktop && FORZAR_TOUCHBAR=1 npm start
```

---

## Controles

| | Mover | Acción | Especial |
|---|---|---|---|
| **Jugador 1** | `W` `A` `S` `D` | `Espacio` | `E` |
| **Jugador 2** | `↑` `↓` `←` `→` | `M` | `N` |

- `Esc` — pausa y menú · `R` — revancha (con la partida pausada o terminada)
- Todo es **remapeable** desde Ajustes.

Los controles se leen por **posición física de la tecla** (`e.code`), así que
funcionan igual con teclado en español, inglés o Dvorak.

### Sobre el *ghosting*

Los teclados no gaming —el de la MacBook incluido— dejan de registrar teclas
cuando hay demasiadas pulsadas a la vez. Por eso ningún juego pide más de
**2-3 teclas sostenidas por jugador**, y los grupos de teclas de cada uno están
físicamente separados. En **Ajustes → Prueba de teclado** puedes medir cuántas
teclas simultáneas aguanta tu Mac de verdad.

---

## El catálogo

| Categoría | Nº | Qué son |
|---|---|---|
| Duelos arcade | 35 | Acción en tiempo real, uno contra uno |
| Versus | 16 | Clásicos reinterpretados como duelo |
| Reflejos | 28 | Nervio, memoria y dedos rápidos (incluye los 5 de machaque) |
| Tablero | 21 | Por turnos, sin prisa (ajedrez completo y Barrio en Venta, de cuatro jugadores) |
| Cooperativos | 24 | Los dos ganan o los dos pierden |
| Pareja | 40 | Complicidad, descubrirse y reírse juntos |
| Realismo | 40 | Tres dimensiones y física de verdad |
| Con mando | 8 | Piden un iPad o un móvil como mando |
| Un jugador | 12 | Tú contra la máquina, con tres dificultades |
| Hechos con el creador | 3 | Recetas de piezas y reglas, no código |
| Desafíos | 261 | Arenas generadas: ocho formas × parámetros |
| Touch Bar | 20 | Exclusivos de la barra táctil |

**Doce** de esos juegos son de **mecánicas raras**: los controles dejan de ser
una constante y pasan a ser parte del juego — se roban, llegan tarde, se suman,
se comparten, se heredan, se escriben por adelantado, vuelven grabados de
rondas anteriores o cambian de significado cada diez segundos. Es terreno que
solo se puede pisar con dos personas en el mismo teclado: ninguno de los doce
funcionaría jugando en red.

### Los 261 Desafíos: qué son y qué no

Son **arenas generadas**, y conviene ser claro sobre ello. No son 261 ideas: son
**ocho formas de juego** —recolecta, supervivencia, carrera, empuje, custodia,
cosecha, laberinto, bolos— con parámetros que cambian **cómo se juega**, no cómo
se ve: si hay bot y de qué dificultad, si el suelo resbala o frena, cada cuánto
salen las monedas, qué patrón tienen los muros, cuánto dura.

Cada uno es una **receta** del creador, así que se juegan con el mismo
intérprete que los juegos hechos a mano en el editor — y **se pueden abrir y
seguir tocando**. Su generación es determinista: la misma semilla da siempre el
mismo desafío, y por eso tienen récords, entran en la rivalidad y se pueden
recomendar por su nombre.

Están para las tardes largas y para que el catálogo tenga fondo. **No para
llevar una portada**: para eso están las doce mecánicas raras.

La lista completa está en [`games/manifest.js`](games/manifest.js).

### Los cinco de machaque (jitter click)

Van todos **por turnos y con la misma tecla, la L**: así los dos machacan con la
misma mano y en la misma posición, y el duelo es limpio. Ninguno es el mismo
juego dos veces — cada uno mide una cosa distinta.

| Juego | Qué mide |
|---|---|
| **Duelo de CPS** | La velocidad pura, con la curva del turno dibujada: se ve el desfonde. |
| **Aguanta** | El fondo. El listón sube cada seis segundos hasta dejarte atrás. |
| **Picapedrero** | Constancia con premio visible: bloques que se agrietan y revientan. |
| **A Compás** | Control, no velocidad: clavar el ritmo que te pidan, incluso uno lento. |
| **La Apuesta** | Conocerse. Cantas una cifra y o la cumples o te llevas cero. |

**Solo letras.** La L se escucha con `input.on('KeyL')` — como tecla física, no
como acción mapeada — igual que en **Puño de Hierro**, que ya usaba esa
convención. La Apuesta necesita una segunda tecla y usa la **R** (subir la
apuesta; mantenida, corre sola). El Espacio no machaca: el botón de acción solo
se atiende a quien esté jugando con iPad, para que en el teclado manden las
letras y nada más.

### La categoría Realismo

Treinta y nueve juegos en 3D con Three.js, todos con física escrita a mano:
rozamiento, rebote, viento, péndulos y centros de masas. No son los mismos juegos con otro
dibujo — la mecánica *es* la física.

| Juego | Lo que simula |
|---|---|
| **Billar** | Choques elásticos con reparto de impulso: las carambolas salen solas. |
| **Bolos** | Cada pino es una pieza que vuelca y empuja a sus vecinos en cadena. |
| **Dardos** | Diana reglamentaria; la puntuación sale del ángulo y el radio del impacto. |
| **Minigolf** | Seis recorridos de datos, con bandas, rampas y agua. |
| **Baloncesto** | Aro con grosor y tablero: la bola puede dar dos vueltas al hierro. |
| **Tiro con Arco** | Setenta metros de caída y viento cruzado sobre el asta. |
| **Torre de Madera** | El desequilibrio de cada piso, pesado por su altura, decide cuándo cae. |
| **Rally** | Velocidad como vector: el agarre come la parte lateral y aparece el derrape. |
| **Curling** | La curva crece según la piedra frena; barrer la reduce y alarga el tiro. |
| **Vuelo por Aros** | El rumbo sale de la inclinación, y subir cuesta velocidad. |
| **Futbolín** | Cuatro barras deslizantes y un golpe que dura un cuarto de segundo. |
| **Tenis de Mesa** | Bote, red y efecto Magnus simplificado: liftada y cortada. |
| **Pesca** | Tensión de sedal contra los tirones del pez. |
| **Dominó** | La caída se resuelve entera de golpe: distancia y giro deciden si llega. |
| **Grúa** | La carga es un péndulo movido por la aceleración del carro. |
| **Frontón** | Rebote contra pared con turno obligado: un golpe corto no llega y es punto. |
| **Golf** | Vuelo, bote y rodadura distintos por terreno; el búnker se come el golpe. |
| **Halterofilia** | Cadencia para el tirón e inercia acumulada al corregir la barra. |
| **Salto de Longitud** | Batir alto cuesta velocidad horizontal: el óptimo no está en 45°. |
| **Martillo** | La fuerza entra en un punto del giro y la bola sale por la tangente. |
| **Piragüismo** | Corriente que empuja hacia la orilla exterior en cada curva. |
| **Velódromo** | Rebufo que quita un tercio del arrastre contra metros de más por fuera. |
| **Penaltis de Hockey** | Tiempo de reacción real: distancia partida por la velocidad del disco. |
| **Demolición** | Cajas que vuelcan y se contagian el empujón a las vecinas. |
| **Disc Golf** | Sustentación mientras vuela rápido y curva creciente al frenar. |

Todos comparten dos módulos: [`core/tres.js`](core/tres.js) (escena, luces,
suelo, pantalla partida, limpieza del contexto WebGL) y
[`core/fisica3d.js`](core/fisica3d.js) (choques, rodadura, cuerdas, piezas que
vuelcan). Three.js está versionado en `vendor/three/`, así que siguen sin hacer
falta ni `npm install` ni conexión.

### La categoría Pareja

No son los mismos juegos con corazones: están diseñados con otra intención.
Casi ninguno reparte ganador, varios miden *complicidad* en vez de habilidad, y
los que sí compiten lo hacen por cosas tontas a propósito.

| Juego | La idea |
|---|---|
| **Sincronía** | Pulsar a la vez sin contar. El aro se vuelve invisible: hay que sentirse. |
| **¿Quién es más probable?** | Votan en secreto quién de los dos. Coincidir suma; no coincidir da conversación. |
| **Test de Pareja** | Uno responde sobre sí mismo tras una cortina; el otro adivina qué contestó. |
| **Verdad o Reto** | Tres niveles que eligen ustedes. Siempre se puede pasar. |
| **Dibuja y Adivina** | Dibujar con WASD es horrible, y esa es la gracia. |
| **Atados** | Una cuerda elástica los une de verdad. Hay que negociar hacia dónde van. |
| **Baile a Dos** | Ritmo cooperativo: el combo solo sube si aciertan los dos a la vez. |
| **Guerra de Almohadas** | Sin barras de vida: plumas. Tirar al otro de la cama vale doble. |
| **La Cita** | Eligen a la vez y en secreto; el resultado es una cita narrada y un % de compatibilidad. |
| **Latidos** | Dos corazones que deben latir al unísono mientras el tempo cambia solo. |
| **Duelo de Miradas** | Mantener la tecla mientras la pantalla intenta hacerles reír. |
| **El Nudo** | Cuerda con física real; cada uno lleva un extremo. Imposible en solitario. |
| **Escapa Juntos** | Uno ve los cables, el otro el manual. La única herramienta es hablar. |
| **Constelaciones** | El juego tranquilo: trazar figuras del cielo entre los dos, sin prisa. |
| **Guerra de Piropos** | Un piropo con la letra que toque, contrarreloj. Acaba en cosas absurdas. |
| **Café a Dos** | La bandeja es la recta que une sus manos: la inclinación es el desacuerdo. |
| **El Columpio** | Cada uno cubre media oscilación; a contratiempo se frena. |
| **La Manta** | Lo que uno se lleva se lo quita al otro, y si uno se hiela pierden ambos. |
| **Cita a Ciegas** | Uno ve el comedor y solo manda flechas; el otro camina a oscuras. |
| **Carrito del Súper** | Uno acelera, otro dirige, y el manillar depende de la velocidad del otro. |
| **Un Paraguas para Dos** | El paraguas está en el punto medio: separarse moja a los dos. |
| **Tándem** | Uno pedalea y otro lleva el manillar; por debajo de una velocidad, al suelo. |
| **La Guerra del Mando** | Machacar cansa y en los anuncios no puntúa nadie: conviene soltar. |
| **Pintar la Pared** | Pintar sobre lo del otro hace mancha: hay que repartirse el muro. |
| **Sombras Chinescas** | Cuatro articulaciones entre dos personas y una figura que igualar. |
| **Hamaca** | Los cocos que atrapas pesan y desequilibran al otro sin que él haga nada. |
| **Montar el Mueble** | Uno sujeta en la marca y otro atornilla; los papeles se cambian a mitad. |
| **Un Espagueti, Dos Bocas** | Sorber los dos a la vez lo rompe: hay que turnarse hasta el beso. |
| **Foto de Pareja** | Llegar a la marca no basta; el último segundo mide si te mueves. |
| **Cosquillas** | Dos rondas con los papeles cambiados: gana quien rompa antes al otro. |
| **Barca a Dos Remos** | Cada palada gira hacia el lado contrario: la línea recta es alternar. |
| **El Huevo en la Cuchara** | El huevo es un péndulo; acelerar y frenar lo balancean. |
| **La Discusión** | Se gana razón hablando, pero hablar encima sube la tensión hasta la bronca. |
| **Doce Uvas** | Campanadas que aceleran; la uva solo cuenta doble si la comen los dos. |
| **Bailar Pegados** | Baldosas que se apagan y un abrazo con distancia máxima. |

Los contenidos de texto están en archivos aparte para que los edites a tu gusto:
`52-quien-es-mas/preguntas.js`, `53-test-pareja/preguntas.js`,
`54-verdad-reto/cartas.js` y `55-dibuja-adivina/palabras.js`.

---

## Qué trae el hub

- **Perfiles** con nombre, color, emoji y **avatar a partir de una foto tuya**.
  La foto se procesa en tu Mac (recorte, auto-niveles, cuantización a paleta,
  pixelado y contorno) y **nunca sale de la máquina**. Seis estilos: Pixel,
  Arcade, Chunky, Game Boy, Duotono y Suave.
- **Encontrar algo entre 500**: cuatro secciones virtuales —**Todos**,
  **Favoritos**, **Recientes** y **Más jugados**— que no son categorías del
  manifiesto sino formas de mirar el catálogo. Con **F** sobre el juego
  enfocado se marca favorito sin soltar el teclado.
- **Búsqueda tolerante**: sin acentos y ordenada por lo bien que encaja
  —primero lo que empieza por lo que escribiste, luego el nombre, y al final la
  descripción—. `artilleria` encuentra *Artillería*. Con un catálogo pequeño
  daba igual el orden; con quinientos, una lista sin ordenar es inútil.
- **Logros** (`core/logros.js`): catorce metas a largo plazo. Ninguna pide
  moler —«juega 1000 partidas» no es una meta, es un peaje— y todas se miden
  con datos que ya se guardaban, así que no añaden contabilidad al shell. Se
  anuncian al volver al menú, nunca en mitad de una partida.
- **Rivalidad histórica**: marcador acumulado entre los dos jugadores, global
  y desglosado por juego, más los récords de cada uno.
- **Torneo**: elige N juegos al azar (filtrables por categoría o por duración)
  y los encadena; al final corona campeón.
- **Ajustes**: volumen, sistema háptico, efecto CRT, remapeo de teclas y la
  prueba de ghosting.

---

## El creador de juegos

Los 244 juegos escritos a mano tienen un techo: **no hay forma de recombinar
código escrito**. Un editor no puede arrastrar y soltar un `game.js`. Por eso
`core/creador/` introduce otra clase de juego — uno que es **datos**:

```js
{ piezas: [ {tipo:'jugador', x, y}, {tipo:'pincho', …} ],
  reglas: [ { cuando:{tipo:'choque', a:'jugador', b:'atajo'},
              entonces:[ {tipo:'empujar', fuerza:620} ] } ] }
```

Es la misma idea que un `.gmd` de Geometry Dash: objetos con propiedades y
disparadores. Y `runtime.js` devuelve un objeto **con la misma forma que
cualquier `game.js`**, así que el shell no se entera de que no es un juego
normal: tiene marcador, pausa, cuenta atrás, torneo y récords. Ésa es la
recompensa de haber separado el shell del juego desde el principio.

**No reimplementa nada.** Una receta usa las colisiones y el rebote elástico de
`math2d.js`, las partículas y el sonido del contexto, los bots de `bot.js` y
**los personajes que los jugadores se han creado** en el editor de personajes. Tiene
acceso a lo mismo que un juego escrito a mano.

Las piezas viven en `piezas.js` y los disparadores en `reglas.js`, cada uno
declarando sus propiedades editables y su tipo de control. Eso no es
casualidad: el editor visual construirá su paleta y su inspector **recorriendo
esos catálogos**, así que añadir una pieza nueva serán diez líneas en
`piezas.js` y ni una en el intérprete ni en el editor.

Hay tres recetas de ejemplo en el catálogo (**Fiebre del Oro**, **Arena de
Bombas**, **La Fuga**), y su `game.js` son cuatro líneas.

### El editor

Se abre con **Crear** en la cabecera del menú. Tres columnas —paleta, arena,
inspector—, que es la disposición de Geometry Dash y lo es por una razón: lo
que colocas, dónde lo colocas y cómo es, en ese orden y sin cambiar de
pantalla.

**Ni la paleta ni el inspector tienen nada escrito a mano.** Se construyen
recorriendo `piezas.js` y `reglas.js`, que declaran cada propiedad con su tipo
de control (`numero`, `opcion`, `interruptor`, `texto`). Añadir una pieza nueva
son diez líneas en el catálogo y **cero** en el intérprete y **cero** en el
editor. Ésa era toda la apuesta de separar los catálogos.

- **Clic** coloca la pieza elegida · **clic en una pieza** la selecciona y se
  arrastra · **Mayús+clic** coloca encima de otra · **Supr** borra.
- El aviso de arriba valida en vivo: enterarte de que *«la partida no puede
  terminar nunca»* **después** de darle a probar es el peor momento posible.
- **Probar** no simula nada: guarda y abre `play.html`, así que lo que pruebas
  es literalmente el juego final, con su cuenta atrás, su pausa y su marcador.

### Guardar y compartir

Los juegos se guardan en `localStorage` y se exportan a un archivo **`.2pa`**,
que es JSON legible a propósito: alguien tiene que poder abrirlo, ver qué hay
dentro y arreglarlo a mano — es lo que hizo que los `.gmd` de Geometry Dash
sobrevivieran a diez versiones del juego. Se manda por mensaje y el otro lo
importa, sin cuentas y sin servidor.

Y aparecen **en el mismo catálogo que los demás**, con el id `creado:<id>`. El
shell reconoce ese prefijo y lo manda al intérprete en vez de buscar una
carpeta, así que un juego hecho por un jugador se lanza, se pausa, puntúa y
entra en torneos exactamente igual que uno escrito a mano. No hay una pestaña
de «mis juegos» aparte, y ésa es la gracia.

---

## El creador de personajes

Un personaje es un **objeto de rasgos**, no una imagen: `{ peinado: 4,
colorPelo: 2, accesorio: 8… }`. Por eso el mismo personaje sirve de retrato de
256 px en el menú, de sprite de 30 px corriendo dentro de una partida y de
muñeco 3D en el editor, sin guardar tres versiones que se parezcan solo de
lejos. Diecinueve rasgos, y añadir una pieza es añadir una función a su
catálogo: el editor se entera solo porque construye sus controles recorriendo
[`RASGOS`](core/personaje.js).

**Una sola anatomía manda.** [`personaje.js`](core/personaje.js) exporta
`ANATOMIA` —dónde empieza la cabeza, dónde acaba el torso, a qué altura van los
ojos— y el modelo 3D cuelga de ahí. Antes tenía las medidas copiadas a mano y
se habían desincronizado, con este resultado: la cara se recortaba olvidando el
margen del contorno y salía corrida un píxel; no había cuello, así que la
cabeza flotaba sobre el torso; los brazos colgaban un dedo por debajo del
hombro; las piernas medían 8 sobre una caída de 10 y el muñeco levitaba sobre
la peana; y **todos los sombreros flotaban** por encima del cráneo.

La regla, si tocas [`personaje3d.js`](core/personaje3d.js): **cada pieza se
ancla a un borde**, nunca a un número suelto. Lo que se pone encima se apoya en
`C.arriba`; lo que va sobre la cara se pega a `C.frente`; los pies llegan al
suelo porque la pierna mide exactamente la distancia de la cadera al suelo. Dos
trampas concretas que ya están resueltas y conviene no reabrir:

- **El pelo no puede tapar la cara.** El corte está pintado en la textura; la
  caja 3D solo le da bulto. Si su cara frontal se adelanta del plano de la cara
  aparece la plancha lisa que tapaba los ojos. Se retrasa hasta quedar 0,25
  detrás.
- **El casco se queda por encima de la altura de los ojos.** Un domo que baje
  más deja al muñeco sin mirada.

Los accesorios de la cara (gafas, gafas de sol, antifaz) **existen ahora en 3D**
y no solo pintados en la textura: antes desaparecían en cuanto girabas el
muñeco. Y cada accesorio declara con `cubre: 'pelo' | 'ojos'` qué esconde, para
que el editor no te enseñe doce peinados idénticos bajo el mismo casco: la
miniatura de comparación se quita el estorbo, el personaje guardado no.

---

## La piel Consola

El arcade arranca con una piel que imita el **menú de una consola de sobremesa**: fondo
claro con puntos que derivan despacio, barra blanca arriba con **reloj y fecha
en vivo**, losetas cuadradas que rebotan al enfocarlas, una **barra inferior
tipo GamePad** —donde bajan las acciones del catálogo y una pantallita refleja
el juego que hay en el escenario— y sonidos de menú suaves en vez del bip
chiptune. Dentro de la partida el lienzo del juego **sigue oscuro**, como en una
consola de verdad: lo que se viste de blanco es el chrome (marcador, pausa,
briefing, victoria). Y el mando táctil del iPad se convierte en un GamePad
blanco con botones de relieve.

Se apaga en **Ajustes → Imagen → Piel Consola** y vuelve el neón original.

Vive en dos archivos, encima de los de siempre y sin sustituirlos:

| Archivo | Qué hace |
| --- | --- |
| `core/consola.css` | Todo el aspecto. Cuelga de `html[data-skin="consola"]`. |
| `core/consola.js` | Lo que no se puede hacer con CSS: el reloj, la barra del GamePad y los sonidos. |

Tres decisiones que conviene conocer antes de tocarlo:

- **El atributo se pone en el `<head>`**, no en `wiiu.js`: un módulo carga
  después del primer pintado y se vería un fogonazo del tema oscuro.
- **Los paneles no repintan cada color a mano**: redefinen `--ink`, `--ink-dim`
  y `--line` dentro de sí mismos y los hijos se recolorean por herencia.
- **Las acciones del catálogo se mueven** al pie: son los mismos nodos, así que
  los listeners que enlazó `hub.js` siguen vivos y `hub.js` no se entera.

Ojo con la especificidad: `[data-skin="wiiu"] .jug` pesa lo mismo que
`.jug1.on`, y como `wiiu.css` carga después, gana. Cuando la piel toque un
elemento que ya tenía un estado (`.on`, `.actual`, `.enfocada`), hay que
repetir ese estado en la piel o desaparece.

### Contraste: la regla que no se puede saltar

Un tema oscuro perdona los colores brillantes; uno claro, no. Los colores de
perfil están pensados para brillar sobre negro y sobre blanco se hunden: el
cian `#00e5ff` da **1.6:1**, o sea que el nombre del jugador 2, su marcador y
su chuleta de teclas eran invisibles.

La piel no le cambia el color a nadie. Cuando ese color se usa como **texto
sobre superficie clara**, lo oscurece con `color-mix(in oklab, …​ 40%, …​)` —en
oklab, que baja la luminosidad conservando la saturación, así el cian sigue
siendo cian—. Donde el color es **fondo** (pastillas, palanca, tecla pulsada)
se usa crudo.

El **40 %** está medido, no elegido a ojo: es el punto donde los diez colores
de `PLAYER_COLORS` pasan de 4.8:1 sobre blanco, incluidos los tres que más
cuesta oscurecer (blanco 4.85, lima 5.43, menta 5.58). **Si se añade un color
a la paleta, hay que volver a medir ese número.**

Lo mismo con los grises: `--wu-ink-faint` está en 4.9:1 y `--wu-ink-dim` en
6.8:1. Un gris «bonito» tipo `#9aa8b4` se queda en 2.4:1 y convierte en
decorativo todo lo que marca.

Y dos sitios donde un degradado a transparente rompía la lectura, por si
vuelve la tentación: el velo del escenario y la banda del marcador se
desvanecían justo donde acababa el texto, así que el final de cada frase caía
sobre la imagen oscura. Los dos son ahora **blanco opaco** en la zona de
texto.

---

## Mandos de consola (DualShock 4 y compatibles)

Funcionan en **todos los juegos**, sin excepción y sin configurar nada.

**Emparejar el DS4 con la Mac**: mantén pulsados **Share + PS** hasta que la
barra parpadee en blanco, y búscalo en *Ajustes → Bluetooth* como `Wireless
Controller`. Luego abre el arcade y **pulsa cualquier botón**: hasta que no
llega una pulsación, el navegador no revela el mando (es una medida
antihuellas, no un fallo).

| Mando | Equivale a |
|---|---|
| Cruceta o palanca izquierda | las cuatro direcciones del jugador |
| ✕ (y R1/R2) | la tecla de acción (`Espacio` / `M`) |
| ○ y △ (y L1/L2) | la tecla especial (`E` / `N`) |
| Options | `Esc`: pausa en partida, cerrar en el menú |

- El **primer** mando que se conecta es el jugador 1 y el **segundo** el
  jugador 2 — el mismo orden que usa el rumble, así que quien pulsa es quien
  vibra. Se puede mezclar: uno a mando y otro a teclado.
- La **palanca es analógica de verdad**: los juegos que leen `ax`/`ay` (conducir,
  apuntar) reciben el valor continuo, y los que leen direcciones lo reciben por
  umbral. Zona muerta de 0,26 para los DS4 usados, que derivan.
- También sirve para **navegar el menú** y para la pantalla de pausa.

Todo esto vive en un solo archivo, [`core/mandos.js`](core/mandos.js), y entra
por el mismo sitio que los mandos táctiles de iPad: `core/input.js`. Por eso
ningún juego tiene una línea de código de mando. Soporta los dos mapas que
existen en la práctica —el `standard` de Chrome y el **crudo** de Safari, donde
✕ pasa a ser el botón 1 y la cruceta es un *hat* en el eje 9— y se recupera solo
de una pausa aunque el botón siguiera apretado.

---

## Los dos juegos de cuatro

El arcade es de dos jugadores por diseño, pero hay formatos que con dos no
existen: una subasta con un solo rival no es una subasta. Estos dos usan
[`core/mesa.js`](core/mesa.js), que reparte **hasta cuatro puestos**, forma
equipos y rellena con **bots** lo que nadie ocupe.

| Puesto | Teclas | Quién |
|---|---|---|
| 1 | `Espacio` · `E` | jugador 1 de siempre (remapeable) |
| 2 | `M` · `N` | jugador 2 de siempre (remapeable) |
| 3 | `F` · `G` | teclas propias de estos juegos |
| 4 | `J` · `K` | teclas propias de estos juegos |

**Dos teclas por puesto y ni una más.** Con cuatro personas apretadas delante
del mismo teclado, cualquier cosa más rica acaba en codazos; y de paso ningún
puesto necesita más de dos dedos, así que caben de verdad.

Los bots tienen carácter (`prudente`, `tiburón`, `caprichoso`, `contable`,
`showman`) y tres niveles, que cambian cuánto se equivocan al tasar y cuánto
tardan en decidirse.

### Subastas de Trasteros

Una nave de trasteros al atardecer, en 3D sobre [`core/tres.js`](core/tres.js).
Sube la persiana, te asomas desde el umbral y pujas. La regla que lo sostiene
todo: **lo que se ve no es lo que vale**. Los muebles grandes —sofá, colchón,
neumáticos— están delante, se ven desde la puerta y no valen nada o cuestan
dinero tirarlos; lo que vale está al fondo, bajo lona, donde no llega la luz.

Por eso es 3D y no un panel: la distancia y la penumbra **son** la mecánica. Un
listado de iconos regala la información que el juego quiere negar. Cada equipo
tiene **dos linternas para toda la partida** y gastar una enciende un foco de
verdad sobre un bulto del fondo — pero lo ve todo el mundo, así que informas a
tus rivales al mismo tiempo que a ti.

La economía tiene una vuelta de tuerca sobre el programa de la tele:

- **3000 € para las cinco subastas**, sin recargas. Cada puja que ganas te deja
  con menos para las siguientes.
- **Lo que hay dentro no se cobra al momento.** Se apunta como género y solo se
  convierte en dinero en el recuento final, donde gana el mayor
  `caja + género`. Hasta ahí nadie sabe de verdad quién va ganando.
- Los trasteros vienen por tipos (basura, barato, medio, bueno, joya) con un
  guion barajado que garantiza al menos una ruina y al menos uno que merece la
  pena pelear. Los cinco medios eran la partida más aburrida posible.
- Los bots reparten su caja entre los trasteros que quedan en vez de vaciarse en
  el primero, y se lo piensan más cuanto más cerca están de su tope: por eso el
  final de una puja es un duelo lento y no una ráfaga.

Los modelos de los trastos —sofás, neveras, guitarras, baúles— están aparte en
[`games/231-subastas/objetos.js`](games/231-subastas/objetos.js), construidos
con cajas y cilindros: ni un archivo externo.

Formatos: **4 equipos de 1** o **3 equipos de 2** (seis puestos; los que no
ocupéis, bots).

### Barrio en Venta

Propiedades, alquileres, casas y calabozo, para dos a cuatro propietarios.
Dos decisiones propias:

- **Si no compras, se subasta.** Es la regla del reglamento clásico que casi
  nadie aplica en casa, y es la que evita que el tablero se quede lleno de
  calles sin dueño porque quien cayó no tenía dinero.
- **La partida tiene final**: a las doce rondas gana el patrimonio más alto. No
  hace falta arruinar a nadie para terminar, aunque se puede.

El tablero y la aritmética de alquileres están aparte, en
[`games/232-propiedades/tablero.js`](games/232-propiedades/tablero.js), sin nada
de DOM: se puede reequilibrar el juego sin abrir el resto.

> Las mecánicas de los juegos de mesa no tienen copyright, pero los nombres y
> el arte sí. Por eso las calles son inventadas y el juego se llama como se
> llama.

---

## Música y ambiente

Un juego sin fondo suena a maqueta. Ahora hay dos capas por debajo de todo,
sintetizadas como el resto ([`core/ambiente.js`](core/ambiente.js)):

**1. La banda.** Toca sola y se elige por la *estética* del juego, no por su
nombre, así que un juego nuevo ya nace con música:

| Estética | Qué suena | Tempo |
|---|---|---|
| `suave` | Hilo musical de ascensor: Rhodes, escobillas y bajo paseando | 76 |
| `real` | Jazz de bar: contrabajo, aro y adornos | 92 |
| `neon` | Synthwave: bajo pulsante, pad ancho y arpegio | 104 |
| `pixel` | Chiptune de ondas cuadradas | 116 |
| `papel` | Guitarra punteada, nada más | 84 |
| `oled` | Casi nada, para no tapar los pitidos de la Touch Bar | 88 |

La progresión se **transpone al azar en cada partida** y la **tensión sube
sola**: cuanto más dura la partida, más se abre el filtro y más se puebla la
percusión. La misma canción no suena igual dos veces ni se queda plana.

**2. El escenario.** El ruido del sitio donde pasa el juego, deducido de las
`tags` del manifiesto: lluvia, mar, bosque con pájaros, noche con grillos,
público de estadio, salón con su zumbido, sala de máquinas, hielo, fuego que
chisporrotea, motor. Un juego nuevo con `tags: ['playa']` suena a playa sin
escribir una línea de código.

Detalles que importan:

- Va al bus maestro, **no al compresor de efectos**: así una explosión no
  aplasta la música entera.
- El planificador agenda por delante con **horizonte adaptativo**. Si el
  navegador se atasca cargando un juego 3D, la música no deja hueco.
- Se baja sola en la pausa y en la pantalla de resultado, con un acorde de
  cierre en vez de un silencio seco.
- Se apaga entera desde **Ajustes → Música y ambiente**, y tiene volumen propio
  independiente del de los efectos (también en el menú de pausa).

---

## El sistema de vibración

Merece una explicación honesta, porque hay un límite de hardware:

- Safari en macOS **no implementa** `navigator.vibrate` (decisión de Apple).
- La MacBook **no expone** su Taptic Engine a ninguna API web.
- La Touch Bar en sí **no vibra**: el motor táptil está en el trackpad.

Así que la vibración se construye por capas, y cada una degrada sola si no
está disponible ([`core/haptics.js`](core/haptics.js)):

1. **Rumble de mando** — vibración real vía `Gamepad.vibrationActuator` si hay
   un DualSense o similar conectado (Chrome/Edge).
2. **`navigator.vibrate`** — donde exista.
3. **Rumble sónico** — un seno de 35-90 Hz con distorsión y envolvente propia
   por WebAudio. El chasis de la MacBook transmite esas frecuencias: **se
   siente**, no solo se oye. Es la capa que hace el trabajo en esta máquina.
4. **Rumble visual** — sacudida de cámara y destello, sincronizados.

Cada efecto tiene su propia curva de amplitud (`click`, `punch`, `blast`,
`buzz`, `ramp`…), que es lo que hace que un golpe seco y un motor sostenido no
se sientan igual.

---

## Estructura

```
2-player-web/
├── index.html            menú principal
├── play.html             contenedor de cualquier juego (?g=<id>)
├── start.command         doble clic para jugar
├── _prueba.html          prueba de humo: arranca los 232 y reporta errores
├── core/
│   ├── engine.js         bucle de paso fijo, canvas retina, sacudida
│   ├── input.js          teclado 2P por e.code, remapeo, test de ghosting
│   ├── mandos.js         mandos DualShock 4 y compatibles (Gamepad API)
│   ├── mesa.js           partidas de hasta 4 puestos, equipos y bots
│   ├── audio.js          SFX sintetizados (cero archivos de audio)
│   ├── ambiente.js       música de fondo y sonido de escenario
│   ├── haptics.js        sistema de vibración por capas
│   ├── ui.js             marcador, cuenta atrás, pausa, fin de partida
│   ├── storage.js        perfiles, rivalidad, récords, ajustes
│   ├── avatar.js         foto → avatar arcade
│   ├── personaje.js      rasgos → sprite 2D, y la anatomía de referencia
│   ├── personaje3d.js    los mismos rasgos → muñeco voxel del editor
│   ├── consola.css/.js      piel «Consola» (reloj, barra GamePad, sonidos)
│   ├── boardgame.js      armazón de los juegos de tablero
│   ├── tbgame.js         utilidades de los juegos de Touch Bar
│   ├── touchbar.js       cliente del puente nativo
│   ├── math2d.js         geometría, colisiones, partículas
│   ├── tres.js           andamio 3D: escena, luces, pantalla partida, panel
│   ├── fisica3d.js       física de los juegos de Realismo
│   └── shell.js          carga y ejecuta un juego
├── desktop/              envoltorio Electron (solo para la Touch Bar)
├── assets/LICENSES.md    procedencia de todo
└── games/
    ├── manifest.js       registro de los 520
    └── <nn-nombre>/game.js
```

---

## Añadir o modificar un juego

Modificar uno = tocar **solo su carpeta**. Añadir uno son dos pasos:

**1.** Crea `games/233-mi-juego/game.js`:

```js
export const meta = { render: 'canvas' };   // o 'dom'

export function create(ctx) {
  let x = 100;
  return {
    init() {},
    update(dt) {
      x += ctx.input.player(0).x * 200 * dt;
      if (ctx.input.player(1).pressed('a')) {
        ctx.haptics.impact(1);
        ctx.finish({ winner: 1, detail: '¡Ganaste!' });
      }
    },
    render() {
      ctx.engine.clear('#06060c');
      ctx.engine.glowRect(x, 100, 40, 40, ctx.players[0].color);
    },
    destroy() {},
  };
}
```

**2.** Añade una línea en `games/manifest.js` y ya aparece en el menú.

### Lo que recibes en `ctx`

| | |
|---|---|
| `input` | `player(0|1)` → `.x .y .held(a) .pressed(a) .released(a)` |
| `audio` | `.hit() .explosion() .score(j) .win()` … todo sintetizado |
| `haptics` | `.impact(j) .explosion(j) .play('heavy')` … |
| `ui` | `.scoreboard() .countdown() .toast() .banner()` |
| `particles` | `.burst(x, y, n, opts)` |
| `players` | perfiles con `name`, `color`, `emoji`, `avatar` |
| `engine` | `.clear() .glowRect() .glowCircle() .text() .time` |
| `finish()` | termina la partida y muestra el resultado |
| `record()` | guarda un récord si mejora el anterior |

El shell pone por ti el canvas, el bucle, la pausa, la cuenta atrás, el
marcador, el registro del resultado y el encadenado de torneo.

---

## Verificación

```bash
# Prueba de humo de los 232 juegos (abre en el navegador)
open http://localhost:8765/_prueba.html
```

Instancia cada juego, lo hace correr 45 fotogramas, lo redimensiona y lo
destruye, reportando cualquier error. **Los 232 pasan.**

Las reglas del ajedrez están separadas en
[`games/34-ajedrez/reglas.js`](games/34-ajedrez/reglas.js), sin nada de DOM,
para poder validarlas con `perft` — el test estándar del ajedrez por ordenador.
Las seis posiciones de referencia dan los números publicados:

| Posición | perft |
|---|---|
| Inicial | 20 · 400 · 8.902 · 197.281 ✓ |
| Kiwipete (enroques) | 48 · 2.039 · 97.862 ✓ |
| Posición 3 (al paso) | 14 · 191 · 2.812 · 43.238 ✓ |
| Posición 4 (coronación) | 6 · 264 · 9.467 ✓ |
| Posición 5 | 44 · 1.486 · 62.379 ✓ |
| Posición 6 | 46 · 2.079 · 89.890 ✓ |

Ese test encontró un fallo real durante el desarrollo: `atacada()` usaba las
jugadas de los peones en vez de sus **ataques**, y como un peón solo "amenaza"
la diagonal si hay una pieza ahí, se podía enrocar pasando por una casilla
vacía defendida por un peón.

---

## Licencias

Todo el arte se genera por código y todo el sonido se sintetiza: **no hay
ningún recurso de terceros**, así que no hay atribución obligatoria. Detalles y
recomendaciones para añadir assets CC0 (Kenney, OpenGameArt) en
[`assets/LICENSES.md`](assets/LICENSES.md).

Las *mecánicas* de juego no tienen copyright, pero los nombres y el arte sí:
por eso el juego de bombas se llama "Bombas" y ningún sprite imita a un
personaje registrado.
