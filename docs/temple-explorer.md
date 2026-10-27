# Templo 3D de Aprendiz

**Comunidad → Explorar el templo** abre un recorrido en tercera persona con cámara baja, detrás del hombro. La palanca izquierda permite avanzar, retroceder y desplazarse a los lados. Arrastrar la vista gira la cámara; los botones ↶/↷ permiten girar por pasos. En PC: WASD para caminar, flechas para avanzar/girar y E para abrir la ficha cercana. No es un modo de combate. Ampliar usa pantalla completa cuando el navegador la admite.

El personaje se desplaza continuamente según el tiempo, con colisiones y deslizamiento junto a paredes/mobiliario. No avanza por casillas. La cámara lo sigue y la marcha mueve brazos/piernas. Se detiene al soltar la palanca, perder foco, ocultar la página o abrir una lectura. El motor 3D se carga únicamente al entrar al recorrido; limita resolución y frecuencia para celulares y libera recursos al salir.

## Distribución y contenido

Se utilizó la imagen adjunta como referencia de planta: Oriente elevado, altar central y pavimento, entrada en Occidente, B y J, Secretaría y Elocuencia a los lados de Oriente y los puestos de Vigilancia. La imagen no se publica como fondo porque contiene etiquetas que no se necesitan en el recorrido de Aprendiz. El enlace compartido de Google no era accesible; la imagen adjunta sí se pudo revisar.

La fuente principal es el PDF original «Liturgia de Primer Grado Completa», 101 páginas. Se incorporan doce columnas laterales (seis por lado) con signos zodiacales en los capiteles, las esferas de B/J, piedras, bóveda estrellada, Sol/Luna, altar, tres luces, Mar de Bronce y las figuras Minerva/Sabiduría, Hércules/Fuerza y Venus/Belleza. Las proporciones están adaptadas para caminar y el orden zodiacal por pared es una decisión del mapa: no está fijado por el PDF. No se presentan las constelaciones como si cada una tuviera una enseñanza masónica individual descrita por la liturgia.

Las 26 fichas incluyen referencias a páginas del PDF; las explicaciones fueron redactadas a partir de las secciones de decoración y simbolismo de primer grado (páginas 9–10, 91–93 y 98). La tribuna también explica su relación con Secretaría y las tareas confirmadas de la app. No se importan lecciones de otros grados ni se generan mediante IA. Las palabras, signos y ceremonias no se copian a las fichas: el lector puede consultar el PDF completo de primer grado que el usuario pidió añadir.

## PDF en la app

**Liturgia de Primer Grado · PDF** está en el encabezado del juego, en las fichas (página de referencia) y en Biblioteca. Ofrece visor, abrir en otra pestaña y descarga. Se conserva el original de 756720 bytes, SHA-256 `eca9fa5e4cc9b2028e4d9297ba064006d568a8a74736199ecd0bf06224b0f117`, sin modificar sus páginas. El PDF se incluye como archivo inmutable del backend en `functions/assets/liturgia-primer-grado.pdf`. `templeReadingService` comprueba sesión, miembro activo/logia (o Admin Master), estado de contraseña y vigencia del token antes de leerlo. No recibe rutas del cliente y no escribe en Storage ni Firestore. Valida el hash del adjunto y devuelve sus bytes al lector autenticado; el navegador vuelve a verificar el SHA-256 antes de crear un enlace temporal local. Esta solución utiliza las funciones ya autorizadas y no requiere nuevos permisos de escritura de archivos o documentos para la cuenta de despliegue. La copia fuente forma parte del repositorio del proyecto.

## Arte

Archivo del juego: `public/temple/virtudes.webp` (291414 bytes). Mural de tres cuadros originales generado con la herramienta incorporada de imágenes y convertido a WebP para la app. No es una fotografía del PDF ni una atribución histórica de autor. Cada tercio se aplica a un marco independiente en el modelo 3D.

Prompt final: «One coherent panoramic triptych mural texture, three equal vertical half-length classical oil-painted portraits: left Minerva fully clothed with bronze helmet and owl, middle Hercules with lion pelt and resting club, right Venus fully clothed in pale rose robes. Matching warm gold lighting and navy backgrounds, recognizable identities, no words, logos, ritual diagrams or nudity.»

## Verificación

- Política: 26 puntos alcanzables con colisiones reales; doce columnas/seis por pared; tres figuras; movimiento continuo, giro, límite de tiempo de fotograma y altura de las gradas.
- Navegador: WebGL2 real con cámara al hombro, movimiento teclado/palanca, giro, neutral al soltar, ficha B con fuente, visor PDF y 320/390/1440 px.
- Backend del lector: PDF original y hash, sesión, actividad, pertenencia a logia y revocación; sin escrituras ni lectura de rutas proporcionadas por clientes. Emuladores existentes de audios, actas y comprobantes conservados.
- Build de producción; prueba real del iPhone/micrófono sigue dependiendo del dispositivo. Si WebGL no está disponible, se informa del problema; el PDF sigue disponible.


## Ampliación de puestos, salas y consultas

El mapa incluye 65 puntos de lectura de primer grado. Se añadieron las fichas de dignidades y oficiales descritos en las páginas 11–12 y su relación con las joyas del catecismo (85–86): Venerable Maestro, ambos Vigilantes, Secretario, Orador, Tesorero, Hospitalario, Maestro de Ceremonias, Porta Estandarte, Expertos, Diáconos, Diputado, Ecónomo y Guardas Templo Interior y Exterior. Las cinco gradas del Primer Vigilante, tres del Segundo, podios de Secretario/Orador y los útiles/candelabros distinguen sus puestos. Se añadieron pebetero, símbolos del altar, triángulos con ojo, borlas, herramientas, mandil, número tres y otras lecturas del simbolismo (98–101).

Por la puerta de Occidente se camina al Atrio y después a la Sala de Pasos Perdidos. Desde esta última se accede al Cuarto de Reflexiones/Cámara Negra y a la Sala de Banquetes. Las puertas conectan físicamente las salas y la cámara evita atravesar las paredes. La distribución relativa de las salas anexas se adapta para el juego: el PDF determina la secuencia Sala de Pasos Perdidos → Atrio → Templo, pero no sus medidas. El apartado de las páginas 14–15 se titula «Cuarto de Reflexiones o Cámara Negra»; se representan juntos con ambos nombres. El salón de banquetes es la dependencia opcional de la descripción.

Cada elemento con información muestra un punto proyectado sobre la escena. Los puntos se activan cerca (2.2 unidades) y se comprueban distancia y paredes al pulsarlos. Los elementos fuera de alcance no abren fichas. Los objetos cercanos tienen botones independientes bajo el recorrido para seleccionar puestos, herramientas y símbolos próximos sin depender de un único vecino. Las lecturas se guardan por identificador, conservando los puntos ya visitados.

## Ilustraciones y mitología zodiacal

`public/temple/zodiac.webp` es un atlas de doce ilustraciones originales generado con la herramienta incorporada, en cuatro columnas y tres filas. Se aplica una ilustración a cada columna y a su ficha. La narración mitológica se muestra bajo el título «Relato mitológico · complemento cultural» con una referencia externa. Se diferencia de lo atribuido a la liturgia y reconoce variantes de los relatos; no propone horóscopos, predicciones ni significados masónicos individuales inventados.

Fuentes complementarias consultadas: Theoi, Star Myths (https://www.theoi.com/greek-mythology/star-myths.html); Higino, Astronomica 2.20, para Aries (https://www.theoi.com/Text/HyginusAstronomica2.html); Arato, Fenómenos 96–136, para Virgo (https://www.theoi.com/Text/AratusPhaenomena.html); Theoi/Croto, con fuentes antiguas, para Sagitario (https://www.theoi.com/Georgikos/SatyrosKrotos.html); Ian Ridpath, Star Tales/Capricornus (https://www.ianridpath.com/startales/capricornus.html).

Prompt del atlas: «One coherent zodiac illustration atlas, precise 4-column by 3-row grid of equal square panels, classical copperplate illustration with antique gold and midnight blue. Row 1: golden ram, white bull, twin brothers, crab. Row 2: lion, maiden with wheat, balanced scales, scorpion. Row 3: centaur archer, sea-goat, water-bearer with amphora, two linked fish. No words, numbers, glyphs, UI or nudity.»

Verificación adicional: acceso por colisiones reales a los 65 puntos; cinco zonas conectadas; impedimento de consultas a través de paredes; elecciones múltiples en un mismo entorno; prueba Chromium caminando desde el templo al Atrio, Sala de Pasos Perdidos, Cuarto de Reflexiones y Sala de Banquetes; ilustración/fuente de Virgo y píxeles dibujados en las vistas de celular y escritorio.
