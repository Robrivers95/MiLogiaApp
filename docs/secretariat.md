# Secretaría: actas de tenida modulares

Acceso: Comunidad → Secretaría y actas. Admin, Master y miembros activos cuyo Cargo / Oficio sea Secretario. El administrador asigna este cargo desde Gestión de miembros → ficha → Editar perfil → Cargo / Oficio. Las reglas impiden autoasignarse cargos, reactivar la propia cuenta después de una baja y consultar actas desde otra logia.

## Flujo

1. Nueva tenida: título y fecha. Configurar los puntos en Formato y acta antes de grabar o antes del análisis.
2. Elegir hablante entre miembros activos; opcionalmente cargar los presentes desde Asistencia y ajustarlos sin modificar la asistencia oficial. Cada pulsación durante la grabación guarda un turno con tiempo. No se usa reconocimiento biométrico ni se adivinan nombres.
3. Grabar audio con el micrófono que el usuario conecte. Medidor de señal, contador y pausa que cierra y guarda un tramo. Cada tramo se descarga como un archivo válido independiente, sin concatenar encabezados MP4 diferentes. Los tramos se ordenan en una línea de tiempo acumulada. Guardado de fragmentos en IndexedDB, aviso ante desconexión/interrupción y respaldo en memoria para descargar cuando falle el guardado del audio. Mantener la pantalla abierta y probar el micrófono; la web no puede garantizar continuidad con llamadas, bloqueo o cierre del navegador.
4. Opcional: dictado del navegador es-MX mientras se graba. No llama a Gemini ni consume sus tokens. No se promete funcionamiento sin internet ni compatibilidad universal; el servicio del navegador puede procesar el audio fuera del dispositivo. Si falla, se conserva la grabación. Cada frase conserva el hablante de su inicio aunque el resultado final llegue después de cambiar el botón. Los tiempos y atribuciones son aproximados y corregibles.
5. Alternativa: importar TXT, SRT o VTT de otra herramienta de transcripción. Elegir si sus tiempos empiezan al inicio completo o al comienzo de un tramo posterior. El texto sin tiempos queda Sin identificar; no se atribuye todo al último hablante. Se pueden añadir intervenciones manuales y corregir el texto y el hablante por párrafo.
6. Formato: título e instrucciones libres por campo (hasta 15), opción Solo llenado manual, contenidos editables y notas adicionales. Predeterminados: trazados/expositores, punto central por trazado, comentarios/crítica y autor, acuerdos, compromisos/responsables/fechas. Usar este formato en otra tenida crea un documento nuevo con los mismos campos e instrucciones, sin copiar contenido o audio.
7. Organizar texto con IA: solo envía las intervenciones textuales, nombres asignados, campos solicitados y notas; nunca envía el audio. Las correcciones manuales no se sobrescriben. Si se edita la fuente mientras responde la IA, se descarta esa respuesta. Los resultados citan identificadores de las intervenciones y requieren revisión humana. No consta se usa cuando falta evidencia.
8. Revisar y marcar como revisada. Cualquier edición posterior vuelve el documento a borrador. Descargar acta/transcripción TXT y respaldo editable JSON. Restaurar un JSON crea una copia nueva del texto/formato/turnos en la misma logia, sin simular recuperación de los audios. Estos deben descargarse por separado.
9. Guardar texto en la logia comparte el acta únicamente con Secretaría/Admin/Master. Audio local. La sincronización usa una versión y rechaza sobrescribir cambios de otra persona; traer actas no reemplaza borradores locales existentes.

El borrador y el audio están limitados a esta cuenta y logia en el dispositivo; no hay sincronización automática de audio. Borrar el almacenamiento del navegador elimina estas copias locales: descargar respaldos al terminar. El guardado local es por mejor esfuerzo y un fallo se muestra explícitamente. El permiso de micrófono solo se solicita al tocar Grabar.

## IA y publicación

La antigua integración de trivia usa una API de SDK incompatible y un fallback fijo; no prueba que exista una conexión Gemini configurada para actas. El nuevo organizador usa Gemini por REST en el servidor, sin incluir claves en el bundle del cliente.

El workflow Deploy secretary minutes service verifica reglas y publica solo organizeMeetingMinutes. Reutiliza un secreto de GitHub GEMINI_API_KEY o, si existe para esta integración, API_KEY. Lo configura como variable de entorno de la función, con un archivo temporal privado que se elimina al finalizar. No registra la clave ni texto de las tenidas. GEMINI_MODEL es una variable de repositorio opcional; por defecto gemini-flash-latest. No hay que pegar claves en el chat ni en el código. Si falta la clave, el servidor devuelve un aviso de configuración y nunca inventa un acta ni devuelve datos de ejemplo. El editor permite preparar una solicitud de texto para otra herramienta de IA mientras se configura la integración automática.

Requiere permisos de publicación de reglas y de Cloud Functions para la identidad de despliegue y los permisos de Firestore para la cuenta de ejecución. En este proyecto la última comprobación previa tenía pendientes Cloud Functions Admin y Service Account User. Confirmar el resultado del workflow actual antes de afirmar que la organización automática funciona.

Pruebas: secretariat.mjs, secretariat-backend.mjs, security-rules.mjs en el emulador y secretariat-ui.mjs con MediaRecorder real en Chromium y reconocimiento simulado sin enviar audio a terceros. La grabación real en iPhone debe verificarse con el micrófono elegido por el usuario.

## Comprobación del 26 de octubre de 2026

Las reglas privadas de actas y la protección del cargo de Secretario se publicaron correctamente. La función organizeMeetingMinutes no se publicó: falta iam.serviceAccounts.actAs para registrologia@appspot.gserviceaccount.com. El workflow también confirmó Meeting AI key configured: False. Por tanto, no afirmar que la organización automática está activa. El editor, audio local, turnos, dictado del navegador e importación/exportación son independientes de ese backend.
