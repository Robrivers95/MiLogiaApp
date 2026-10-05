# Recordatorios por WhatsApp

Ruta: Gestionar → Finanzas → Recordatorios → Cobros por WhatsApp.

Admin activo y Master pueden preparar el recorrido, editar contactos y abrir chats. Master trabaja sobre la Logia seleccionada, aunque no pertenezca a ella; Admin solo sobre su propia Logia. `viewer` y `member` ven el botón deshabilitado; una Logia suspendida tampoco lo habilita. Cada preparación y guardado comprueba la sesión y la pertenencia a la Logia. Los datos del recorrido se reinician al cambiar usuario, grupo o rol.

El administrador registra `phoneNumber` y `whatsappRemindersAllowed` en la ficha (incluidos miembros temporales). La vinculación a una cuenta real conserva contacto y autorización cuando copia el teléfono. Números de México con diez dígitos se normalizan a +52; otros países deben indicarse con prefijo. El miembro debe aceptar estos recordatorios. Contactos modificados deben guardarse antes de abrir un chat.

La preparación consulta saldos recientes, usa el mismo cálculo de períodos pendientes que push y excluye cuotas futuras, perdonadas e información de otras Logias. Los errores de consulta no se interpretan como deuda cero. No escribe pagos ni modifica saldos. El campo «Mensaje previo para todos» permite escribir una introducción una sola vez por tanda, antes de preparar los cobros. Aparece al principio de cada mensaje, seguida del nombre y adeudo individual; la vista previa y el enlace se actualizan al editarlo. Se conserva al avanzar, volver a la selección o actualizar saldos; es opcional y se reinicia al recargar o cambiar sesión. No modifica recordatorios push. Se pueden agregar instrucciones de pago para todos los mensajes del recorrido.

`wa.me/<teléfono>?text=<mensaje>` abre el destino y texto listos. El remitente es el WhatsApp activo en el dispositivo: no se conectan números remitentes ni claves. El administrador pulsa Enviar en WhatsApp y regresa a Mi Logia para avanzar. No se confirma entrega ni envío mediante el enlace. El recorrido se mantiene en memoria mientras la app permanezca abierta; si se recarga debe prepararse otra vez.

Pruebas: cálculo contable/legacy/perdón, teléfonos y caracteres; rol estricto y aislamiento de grupo mediante API simulado; apertura directa, selección, contacto/autorización y pantallas PC/celular en navegador. Las pruebas interceptan window.open y no envían WhatsApps reales.
