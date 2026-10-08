# Captura rápida

Admin y Admin master tienen un botón `$` sobre la navegación. Permite registrar ingresos y gastos con monto, fecha editable (hoy por defecto), método, nota y foto opcionales. Las capturas quedan pendientes de completar y se incluyen inmediatamente en Tesorería. Desde **Capturas** se completa concepto, categoría, proveedor y notas; se actualiza el mismo registro.

Una cuenta o caja es opcional. Elegirla suma/resta al saldo actual en la misma transacción que crea la captura. Para pagos que ya están incluidos en ese saldo, elegir **Solo tesorería**. Los saldos existentes son referencias manuales: no se reconstruyen ni se modifica su fecha de corte. Completar o aplicar una captura no vuelve a modificar el saldo de la cuenta.

Un ingreso puede aplicarse a una cuota mensual o extraordinaria ya asignada a un miembro. Se elige miembro, cuota, mes y año. La operación acredita el monto completo, conserva abonos anteriores, crea un comprobante aprobado (con la foto si existe) y marca la captura aplicada en una sola transacción. No acepta montos superiores al saldo de una cuota abierta; las extras perdonadas/cubiertas permiten el abono voluntario existente. No volver a capturar ese dinero como abono manual.

La captura aplicada se conserva en el historial de Capturas pero sale de los totales de tesorería manual: su ingreso se cuenta desde el ledger. Un identificador estable protege los reintentos y las aplicaciones concurrentes. No se crean migraciones ni se alteran registros anteriores. Las capturas enlazadas no se editan/eliminan desde formularios de movimientos manuales ni desde el comprobante independiente.

Los filtros históricos siguen usando la fecha agregada de pago por miembro/mes que tiene la app existente. Cambiar la fecha de ese agregado puede mover abonos anteriores entre rangos; esta implementación no reconstruye la distribución histórica ni sustituye una conciliación bancaria.

Verificación: `node tests/quick-finance-integration.mjs`, `node tests/quick-finance-ui.mjs` y build de producción. Las pruebas usan datos aislados, sin pagos reales.
