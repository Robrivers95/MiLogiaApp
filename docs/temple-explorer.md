# Explorar el templo: Aprendiz

Acceso: **Comunidad → Explorar el templo**. La navegación existente, Asistencia y los juegos anteriores permanecen en sus apartados.

Un avatar con mandil recorre un templo ilustrado desde arriba. Se mueve con botones táctiles (también manteniéndolos pulsados) o con flechas/WASD al enfocar el plano. Las paredes y los puntos del mobiliario impiden atravesarlos. Cerca de un punto se habilita **Aprender**; Enter también abre su ficha. Cada ficha ofrece una explicación breve y una pregunta de reflexión. **Seguir explorando** o Escape cierra la ficha. **Volver a la entrada** recupera la posición inicial sin borrar el progreso.

Seis fichas introductorias: B, J, piedra bruta, escuadra, pavimento ajedrezado y mesa de estudio. El progreso se guarda solo en ese navegador, separado por usuario y logia. No modifica tareas, calificaciones, cuotas ni experiencia de otros juegos. No usa IA, grabaciones ni consultas a Biblioteca/Trivia. No incluye un catálogo de grados superiores oculto por botones o filtros: ese contenido no existe en este módulo.

El plano es ilustrativo, no una reproducción ritual del templo. La asociación B/fuerza se tomó del ejemplo indicado por el usuario; se presenta como la interpretación seleccionada para este recorrido, no como regla universal entre ritos. La ficha J se limita a la preparación y al acceso, sin desarrollar instrucciones rituales. La mesa de estudio es un punto pedagógico creado para el juego. Las reflexiones son textos originales y no pretenden sustituir la instrucción del taller.

Referencias públicas consultadas para las lecturas morales introductorias (no se cargan ni enlazan sus textos completos en el juego, pues esas páginas pueden abordar otros grados):

- Museum of Freemasonry, «What are masonic tracing boards?»: piedra bruta y trabajo sobre uno mismo, escuadra y conducta honesta, pavimento y cambios de fortuna. https://museumfreemasonry.org.uk/blog/learn-about-freemasonry-what-are-masonic-tracing-boards
- Provincial Grand Lodge of Middlesex, «The Square and Compasses»: lectura introductoria de la escuadra como moralidad, honestidad y trato justo. https://archive.pglm.org.uk/mk-2-the-square-and-compasses/
- United Grand Lodge of England, «What is Freemasonry?»: analogías de construcción, mejora personal, integridad, respeto, amistad y servicio. https://www.ugle.org.uk/discover-freemasonry/what-is-freemasonry

Verificación: `node tests/temple-explorer.mjs` comprueba que las seis estaciones sean alcanzables, sus colisiones y el conjunto de contenido introductorio. `node tests/temple-explorer-ui.mjs` usa Chromium para mover el avatar, leer B, comprobar controles táctiles/teclado, conservar progreso y revisar las vistas de 320/390/1440 px.
