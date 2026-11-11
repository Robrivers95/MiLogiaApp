# Captura por texto, acuerdos y compromisos

## Uso

- **Comunidad → Captura y tareas**: disponible para cuentas activas de miembro, secretario, Admin y Admin Master dentro de la logia seleccionada. Los visores y logias suspendidas no pueden crear tareas.
- **Gestionar → Tareas → Capturar tareas, acuerdos y compromisos por texto**: conserva la lista y formularios existentes.
- **Secretaría y actas → Formato y acta → Preparar tareas de acuerdos y compromisos**: copia únicamente los campos cuyos títulos contienen “acuerd” o “comprom”. Puedes pegar/corregir cualquier otro campo. Nunca envía automáticamente el audio ni toda la transcripción a este capturador.

Escribe los acuerdos y pulsa **Interpretar con IA**. El resultado es una propuesta editable, sin registrar tareas. Revisa título, descripción, responsables, fecha y tipo. Puedes añadir tareas manuales, descartar propuestas o desmarcarlas. Si eliges varios responsables, selecciona entre tarea de equipo o una independiente por miembro. Marca que revisaste y pulsa **Confirmar y crear tareas**. Cualquier corrección desmarca la revisión.

Los responsables deben ser miembros activos de la misma logia; un nombre ambiguo queda pendiente de selección. Se validan de nuevo al confirmar, incluso si cambió su estado después del análisis. No se envían correos, WhatsApp ni notificaciones push desde este flujo. Las tareas se comparten en el módulo existente y aparecen en Inicio de los responsables.

El capturador permite consultar tareas propias y creadas por el usuario, y cambiar su estado con confirmación. Los administradores ven todas las de su logia. La creación por miembros y los cambios de estado pasan por el servidor; no se amplían sus permisos directos de escritura en Firestore. Como en el módulo existente, los registros de tareas de la logia son legibles para sus miembros; revisa el contenido compartido. La evidencia literal del análisis y la transcripción privada no se guardan en las tareas.

## Ingresos o gastos desde texto

Solo Admin y Admin Master pueden seleccionar este modo. La IA llena un borrador en **Captura rápida**, donde se corrigen monto, fecha, miembro, método y notas, y se requiere marcar la revisión antes de confirmar el guardado. Si un método o fecha no consta, se debe seleccionar. No se asigna una cuota por similitud de texto: después de guardar el ingreso, abre la captura y selecciona el periodo y cuota para registrar el abono mediante la operación contable existente, sin duplicar el dinero.

## Reintentos y límites

La confirmación se congela y conserva en la sesión del navegador mientras se espera respuesta. Un reintento tras mala conexión o recarga utiliza el mismo identificador y datos; el servidor devuelve las tareas ya creadas sin repetirlas. Una validación definitiva rechazada permite corregir; ante respuesta incierta se conserva el bloqueo. No borres los datos del navegador para resolver una confirmación incierta: primero reintenta y comprueba la lista.

Máximo 20,000 caracteres por análisis, 12 propuestas y 10 responsables por propuesta. Las fechas deben existir en el calendario. Análisis de IA limitados por usuario y compartidos con el organizador de actas para evitar solicitudes simultáneas o repetidas en un minuto. Las tareas manuales confirmadas no consumen Gemini.

## Servidor y despliegue

Callable `captureWithAI` en us-central1. Usa el mismo secreto servidor y modelo del organizador de actas. GitHub Actions toma `API_KEY_GEMINI_FREE`, `GEMINI_API_KEY` o `API_KEY`, en ese orden. La clave nunca se incluye en el código cliente. La acción de análisis solo genera propuestas; únicamente la acción explícita `confirmTasks` crea registros, en una transacción con control de sesión, logia, responsables e idempotencia. Los recibos privados están en `taskCaptureRequests` y no permiten acceso cliente.

El workflow `secretariat-backend.yml` construye, verifica reglas y publica solamente `organizeMeetingMinutes` y `captureWithAI`. Si no se despliega el servidor, la interfaz conserva los borradores y muestra que la IA está pendiente; no devuelve resultados ficticios ni informa tareas guardadas sin respuesta confirmada.

## Validación

- `node tests/task-capture.mjs`: validación de revisión, fechas, responsables, roles y minimización del texto compartido.
- `node tests/task-capture-backend.mjs`: callable real con SDK/proveedor simulados, análisis sin escrituras de dinero/tareas, confirmación explícita, asignaciones corregidas, transacciones, reintentos, logias, roles, sesiones, suspensión y estado de tareas.
- `node tests/task-capture-ui.mjs`: Chromium con servicios simulados; revisión editable y reinicio de aprobación, asignación corregida, doble clic, pérdida de respuesta/recarga, modo manual, confirmación financiera y estado de tarea, vistas de 320/390/1440.
- `tests/security-rules.mjs`: emulador Firestore, acceso de tareas limitado a la logia, escritura de miembros y recibos de confirmación privados denegados.

Las pruebas no envían audio, texto privado ni solicitudes pagadas a un proveedor de IA.
