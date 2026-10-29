# Ingresos con texto e imágenes

Ruta: Comunidad → Captura y tareas → Qué quieres preparar → Ingresos de HH: texto, fotos y solicitudes.

Admin y Admin Master pueden agregar texto y hasta cuatro JPG, PNG o WebP. Las imágenes se preparan a una resolución máxima de 1800 px y se guardan como comprobantes de los borradores detectados. Una imagen de estado de cuenta puede respaldar varias solicitudes: se conserva la imagen completa, así que debe revisarse antes de aprobarla como comprobante para el miembro.

El servicio existente captureWithAI interpreta movimientos recibidos, genera una solicitud por pago y utiliza los nombres del directorio de la logia. Las coincidencias ambiguas permanecen sin hermano seleccionado. Los meses no explícitos no se deducen de la fecha bancaria. Se advierten posibles duplicados por ordenante, fecha e importe; esta advertencia requiere revisión y no demuestra por sí sola que un ingreso sea duplicado.

El análisis no escribe cuotas, tesorería, bancos ni comprobantes aprobados. Los borradores pendientes se guardan para revisarlos después y otros administradores de la misma logia pueden revisarlos. Rechazar no registra dinero.

En cada solicitud se corrigen hermano, monto, fecha del pago, mes/año, cuota normal/extra/otro concepto, descripción, método y cuenta o caja opcional. Las cuotas extras deben estar asignadas en ese mes. La aprobación requiere marcar la revisión; cualquier edición desmarca la casilla. Una transacción verifica permisos y pertenencia del miembro, aplica el abono y vincula las imágenes como comprobante. La misma solicitud no puede contarse dos veces. No se crea otro ingreso de tesorería para un abono ya incluido en el ledger. Si se elige cuenta, su saldo se incrementa una vez. Otros ingresos se registran en tesorería sin modificar cuotas.

Los abonos mayores al saldo normal o a una cuota extra no perdonada se detienen para que el administrador corrija la aplicación. No se distribuyen automáticamente entre meses. Un estado de cuenta puede contener información de varios hermanos; la imagen completa queda enlazada al comprobante aprobado conforme al flujo existente de evidencias de la app.

Seguridad: financeImportRequests y financeImportLocks son privados del servidor. incomeDrafts solo permite lecturas y decisiones de administradores de esa logia o Master; solo el servidor puede crear borradores. Las imágenes se suben desde el servidor a financeEvidence y se enlazan con URL de comprobante. La clave Gemini permanece en el entorno de Cloud Functions, usando el secret existente API_KEY_GEMINI_FREE de CI.

Pruebas: task-capture-backend.mjs incluye el análisis de texto/imágenes, coincidencias, comprobantes y reintentos. income-capture.mjs ejecuta la API real de aprobación contra un almacén transaccional. income-capture-ui.mjs prueba dos solicitudes y correcciones antes de aprobar. security-rules.mjs prueba privacidad, alcance y transiciones de revisión.
