# Tesorería: corrección de saldos y alcance pendiente

## Corregido

La matriz y el CSV usan el mismo acumulado de cuotas extraordinarias que Gestión de miembros. Los comprobantes no se suman otra vez ni reemplazan ese acumulado. Revisar diferencias es una lectura: lista miembro, mes, registrado, aplicado por comprobantes y diferencia. No etiqueta automáticamente la diferencia como dinero manual válido.

Corregir un comprobante extra ajusta su contribución con una transacción Firestore que escribe comprobante y pago juntos. Ejemplo: 4000 manuales + 500 aplicados, corrección a 300 = 4300. Si falta appliedAmount, el concepto es ambiguo o se excede la cuota, se exige revisión manual. Las correcciones de un comprobante no redistribuyen otros comprobantes automáticamente.

Tesorería abre el editor existente de pagos para corregir acumulados y fecha del registro mensual. Otro acceso abre comprobantes aprobados, donde se puede editar la fecha de transferencia. Son fechas distintas: una fila mensual no representa todos los depósitos de ese mes. Los montos mensuales de comprobantes históricos siguen sin redistribuirse automáticamente entre períodos.

Las ediciones por updatePayment recalculan totales, estado y cobertura desde las cuotas individuales y conservan historial de cambios de total/fecha. Esto no constituye un registro inmutable ni una copia histórica completa. Las condonaciones cierran deuda sin inventar ingresos. El campo agregado de pago extra es de solo lectura cuando existen cuotas individuales; se modifica cada concepto en su detalle.

No hay migraciones ni modificaciones a datos de producción. Un importe manual ya sobrescrito necesita evidencia o confirmación del tesorero; no se puede deducir del código.

## Pendiente para conciliación bancaria completa

El esquema actual agrega abonos por miembro/mes y pierde las fechas e identificadores de cada abono manual. Una conciliación exacta requiere movimientos de cobro/egreso individuales con ID estable, fecha, monto, cuenta banco/efectivo, referencia, origen y aplicación a cuotas. Los comprobantes deben enlazar al mismo movimiento, y las pantallas derivar de sus aplicaciones. Hace falta migración revisable de saldos iniciales; no convertir acumulados históricos en depósitos ficticios.

Para importar banco se requiere una muestra del estado de cuenta (encabezados, cargos, abonos, referencias y saldos). El importador deberá deduplicar por identificador estable y cuenta, permitir relaciones uno-a-varios y varios-a-uno, marcar pendientes y separar transferencias internas. Todavía no se implementa esta importación ni enlaces banco-movimiento. Tampoco se modifica en este cambio la aprobación original de comprobantes, que necesita una revisión independiente de concurrencia/idempotencia y desglose mensual.

## Validación

- `npm run test:accounting`: pruebas de abonos manuales preservados, límites, montos inválidos, compatibilidad histórica, totales y condonaciones.
- `npx vite build`: compilación de producción.
- TypeScript completo tiene errores preexistentes (Visitas, integración Gemini, dependencias de Functions y otros). Comparado contra a7d00fc: ningún diagnóstico nuevo; se corrige selectedMember inexistente al adjuntar comprobante del administrador.
- No se probaron escrituras con una sesión autenticada de producción ni reglas mediante emulador. Requiere validación funcional antes de desplegar.
