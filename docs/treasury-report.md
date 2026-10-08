# Reporte mensual de tesorería

El historial y CSV leen los mismos registros miembro/mes de la matriz de pagos. Cada mes se separa en una fila de cuota normal y una por cada cuota extraordinaria con abonos. Un miembro con ambas tendrá al menos dos filas. No se duplican los comprobantes ni se incluyen cargos todavía no pagados.

**Mes** usa por defecto el mes asignado a la cuota; los movimientos manuales usan el mes de su fecha. **Fecha de registro** conserva la fecha del acumulado del ledger: no se inventan fechas de depósitos individuales. El selector **Mes según → Fecha de registro** permite usar esa fecha para filtrar. El CSV conserva también **Mes de cuota** para distinguir ambos criterios.

Filtros: año, mes, ingresos/gastos, clase (normal/extra/otros/sin desglose), concepto extraordinario de la matriz, proyecto, sin proyecto y búsqueda de miembro/concepto. El reporte móvil usa tarjetas paginadas; escritorio usa tabla. Los totales corresponden a todos los resultados filtrados, no solo la página visible. La descarga exporta todas esas filas.

La columna Proyecto conserva el vínculo directo de los movimientos manuales y usa los conceptos extraordinarios vinculados en Finanzas → Proyectos para los abonos de miembros. Si un concepto pertenece a varios proyectos, sus nombres aparecen juntos en una sola fila y se puede filtrar por cualquiera, sin repetir dinero.

El CSV es UTF-8 para Excel, escapa comillas y fórmulas introducidas como texto y muestra una sola fila por concepto. Las asignaciones a Tesoro general, Beneficencia y Fondo cuotas son columnas separadas: no repiten el monto total en varias filas.

El cambio es de lectura; no modifica cuotas, abonos, proyectos ni saldos. Los registros históricos con un importe que no se puede desglosar conservan ese importe como **Cuota sin desglose**, con una observación para revisar la matriz. La carga falla si no se pudo leer parte del historial, en lugar de exportar un reporte incompleto sin aviso.

Validación: `node tests/treasury-report.mjs` y `node tests/treasury-report-ui.mjs`.
