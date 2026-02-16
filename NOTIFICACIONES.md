# 🔔 Sistema de Notificaciones Push - MiLogia App

## ✅ Implementado

### 1. **Botón de Instalación PWA**
- Se muestra automáticamente en el Dashboard
- Un clic instala la app en iPhone o Android
- La app funciona como aplicación nativa

### 2. **Botón de Activar Notificaciones**
- Solicita permisos de notificaciones
- Guarda el token FCM en Firestore
- Muestra estado activo cuando están habilitadas

### 3. **Service Worker Actualizado**
- Maneja notificaciones push en segundo plano
- Muestra notificaciones nativas del sistema
- Abre la app al hacer clic en la notificación

### 4. **Notificaciones Preparadas en Admin**
- Al crear un **Aviso**: notifica a todo el grupo
- Al asignar una **Tarea**: notifica al usuario asignado

---

## 📱 Cómo Usar

### **Para Usuarios:**

1. **Instalar la App:**
   - Ve al Dashboard (pestaña Inicio)
   - Presiona el botón "📲 Instalar App en tu Celular"
   - La app se instala automáticamente
   
   **Alternativa manual:**
   - **iPhone:** Safari → Compartir → "Agregar a pantalla de inicio"
   - **Android:** Chrome → Menú (⋮) → "Instalar aplicación"

2. **Activar Notificaciones:**
   - En el Dashboard, presiona "🔔 Activar Notificaciones"
   - Acepta los permisos cuando el navegador lo solicite
   - Verás "✅ Notificaciones Activas"

3. **Recibir Notificaciones:**
   - Recibirás alertas cuando:
     - Haya un nuevo aviso
     - Te asignen una tarea
   - Las notificaciones funcionan incluso con la app cerrada

---

## ⚠️ Limitación Actual: Cloud Functions

### **Estado Actual:**
Las notificaciones están **preparadas** pero requieren **Cloud Functions** de Firebase para funcionar completamente.

### **¿Por qué?**
- Firebase requiere el **plan Blaze** (pago por uso) para Cloud Functions
- Actualmente el proyecto está en el **plan Spark** (gratuito)
- Las notificaciones necesitan backend para enviar mensajes push

### **¿Qué funciona ahora?**
✅ Instalación de PWA  
✅ Solicitud de permisos de notificaciones  
✅ Guardado de tokens FCM  
✅ Service Worker preparado  
✅ UI y botones implementados  

❌ Envío real de notificaciones push (requiere Cloud Functions)

---

## 🚀 Activar Notificaciones Push Completas

### **Pasos para Habilitar:**

1. **Actualizar a Plan Blaze:**
   - Ve a: https://console.firebase.google.com/project/registrologia/usage/details
   - Haz clic en "Actualizar proyecto"
   - El plan Blaze es **gratis hasta cierto límite**:
     - 2 millones de invocaciones/mes gratis
     - $0.40 por millón adicional
   - Agrega una tarjeta de crédito (no se cobra a menos que excedas el límite)

2. **Desplegar Cloud Functions:**
   ```bash
   cd /workspaces/MiLogiaApp
   firebase deploy --only functions
   ```

3. **¡Listo!** Las notificaciones funcionarán automáticamente.

### **Costo Estimado:**
- **Uso típico:** GRATIS (dentro del límite)
- **Estimado para 50 usuarios activos:**
  - ~1,000 notificaciones/mes
  - Dentro del límite gratuito
- **Solo pagarás si envías MILLONES de notificaciones**

---

## 🔧 Archivos Implementados

### **Frontend:**
- `/services/notifications.ts` - Servicio de notificaciones
- `/services/firebase.ts` - Configuración de FCM
- `/components/Dashboard.tsx` - Botones de instalación y notificaciones
- `/components/Admin.tsx` - Envío de notificaciones al crear avisos/tareas
- `/public/service-worker.js` - Manejo de push notifications

### **Backend (Cloud Functions):**
- `/functions/src/index.ts` - Funciones para enviar notificaciones
- `/functions/package.json` - Dependencias
- `/functions/tsconfig.json` - Configuración TypeScript

---

## 📋 Checklist de Activación

- [x] Código de notificaciones implementado
- [x] Service Worker actualizado
- [x] Botones en Dashboard
- [x] Integración en Admin (avisos y tareas)
- [x] Cloud Functions creadas
- [ ] **Actualizar a plan Blaze** ← PENDIENTE
- [ ] **Desplegar Cloud Functions** ← PENDIENTE

---

## 🎯 Resultado Final

Una vez activado el plan Blaze y desplegadas las Cloud Functions:

1. ✅ Los usuarios instalan la app con un clic
2. ✅ Activan notificaciones con un clic
3. ✅ Reciben alertas automáticas de:
   - Nuevos avisos
   - Tareas asignadas
4. ✅ Las notificaciones llegan incluso con la app cerrada
5. ✅ Al tocar la notificación, abre la app

---

## 💡 Recomendación

**Activa el plan Blaze ahora:**
- Es gratis para tu caso de uso
- Solo requiere tarjeta como respaldo
- Desbloquea funcionalidad completa
- La app quedará 100% funcional

**URL para actualizar:**  
https://console.firebase.google.com/project/registrologia/usage/details

---

## 🆘 Soporte

Si tienes dudas sobre el plan Blaze o necesitas ayuda con el despliegue, consulta:
- [Documentación de Firebase Pricing](https://firebase.google.com/pricing)
- [Cloud Functions Pricing](https://firebase.google.com/docs/functions/pricing)
