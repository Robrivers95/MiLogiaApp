# 📱 Sistema PWA e Instalación Automática - MiLogia

## 🎯 ¿Qué es PWA?

**Progressive Web App (PWA)** es una tecnología que convierte tu sitio web en una app instalable como si fuera de la App Store o Google Play, pero **sin necesidad de publicarla en las tiendas**.

### ✅ Ventajas de PWA:
- ✅ Se instala directo desde el navegador (Chrome, Safari)
- ✅ Aparece en la pantalla de inicio como cualquier app
- ✅ Funciona offline (sin internet) 
- ✅ Recibe notificaciones push
- ✅ Ocupa menos espacio que una app nativa
- ✅ Se actualiza automáticamente
- ✅ No pasa por revisión de tiendas (Apple/Google)

---

## 🔧 Componentes del Sistema PWA

### 1. **Banner de Instalación Flotante** (`InstallPWA.tsx`)

Banner que aparece en la parte inferior de la pantalla:

**Características:**
- 🎨 Diseño atractivo con gradiente logia-accent
- 📱 Detección automática iOS vs Android
- ⏱️ Aparece 3 segundos después de cargar (iOS)
- ❌ Botón "X" para cerrar si no se quiere instalar
- 🔔 Incluye botón para activar notificaciones
- 🎯 Se oculta automáticamente cuando ya está instalada

**Funcionalidad por plataforma:**

**Android/Chrome:**
```
1. Usuario entra → Banner aparece
2. Toca "Instalar" → Chrome muestra diálogo nativo
3. Usuario acepta → ✅ Icono en pantalla de inicio
```

**iOS/Safari:**
```
1. Usuario entra → Banner aparece
2. Toca "Ver Cómo" → Modal con instrucciones paso a paso
3. Sigue 3 pasos → ✅ Icono en pantalla de inicio
```

### 2. **Modal de Instrucciones iOS**

Modal elegante que muestra los 3 pasos para instalar en iOS:
1. 📤 Toca el botón de Compartir (cuadro con flecha)
2. 🔽 Desliza y toca "Añadir a inicio"
3. ✅ Toca "Añadir"

### 3. **Manifest.json**

Define cómo se ve la app instalada:
```json
{
  "name": "Mi Logia",
  "short_name": "MiLogia",
  "theme_color": "#6366f1",
  "background_color": "#0f172a",
  "display": "standalone",
  "orientation": "portrait",
  "icons": [...]
}
```

### 4. **Service Worker** (`service-worker.js`)

Motor que hace funcionar la app como nativa:
- 🔔 Notificaciones Push
- 💾 Cache para offline
- ⚡ Actualizaciones automáticas
- 🔄 Sincronización en segundo plano

---

## 🎨 Experiencia de Usuario

### Banner Flotante:
```
┌────────────────────────────────────┐
│  📥  ¡Instala MiLogia App!        │
│      Acceso rápido desde tu       │
│      pantalla de inicio           │
│                                    │
│      [Instalar]  [Luego]     [X]  │
│                                    │
│  🔔 Activar Notificaciones        │
└────────────────────────────────────┘
```

### Estados del Banner:
1. **No instalada + Android**: Muestra "Instalar" → diálogo nativo
2. **No instalada + iOS**: Muestra "Ver Cómo" → instrucciones detalladas
3. **Ya instalada**: Banner no aparece
4. **Descartada**: No aparece (hasta limpiar localStorage)

---

## 🔄 Cómo Funciona el Proceso Completo

### En Android/Chrome:
1. Usuario visita `https://registrologia.web.app`
2. Chrome detecta que es PWA (manifest.json + service worker + HTTPS)
3. Dispara evento `beforeinstallprompt`
4. Banner aparece automáticamente
5. Usuario toca "Instalar"
6. Chrome muestra diálogo: "¿Añadir MiLogia a la pantalla de inicio?"
7. Usuario acepta
8. ✅ App instalada - abre sin barra del navegador

### En iOS/Safari:
1. Usuario visita `https://registrologia.web.app`  
2. Banner aparece después de 3 segundos
3. Usuario toca "Ver Cómo"
4. Modal muestra instrucciones visuales con numeración
5. Usuario sigue los pasos manualmente
6. ✅ App instalada - icono en home screen

---

## 💾 Almacenamiento Local

```javascript
localStorage.setItem('pwa-install-dismissed', 'true');
```

- Guarda si el usuario cerró el banner
- Evita que aparezca de nuevo
- Se puede limpiar para volver a mostrar

---

## 🚀 Instalación en Código

### Importar en Dashboard:
```tsx
import InstallPWA from './InstallPWA';

<InstallPWA userId={user.uid} />
```

### Requisitos:
- `userId`: Para guardar token FCM de notificaciones
- Debe estar dentro de un componente con acceso a `user.uid`

---

## 🎯 Por Qué Funciona Tan Bien

### ✅ No necesita tiendas:
- No esperar revisión de Apple (1-2 semanas)
- No pagar $99/año a Apple Developer
- No pagar $25 a Google Play

### ✅ Instalación simple:
- **Android**: 2 clics
- **iOS**: 3 pasos manuales
- No descarga 50-100 MB, solo acceso directo

### ✅ Actualizaciones automáticas:
- Haces `firebase deploy` → todos se actualizan
- No publicar nueva versión en tiendas
- Service Worker cachea nueva versión

### ✅ Funciona offline:
- Service Worker cachea archivos críticos
- Puede ver contenido sin internet
- Notificaciones llegan incluso con app cerrada

### ✅ Menos espacio:
- App nativa: **50-100 MB**
- PWA: **2-5 MB** (solo cache)

---

## 📊 Stack Tecnológico

| Tecnología | Propósito |
|------------|-----------|
| Web App Manifest | Define apariencia de app instalada |
| Service Worker | Notificaciones + cache + offline |
| `beforeinstallprompt` API | Detecta cuándo puede instalarse (Android) |
| Firebase Cloud Messaging | Envía notificaciones push |
| `matchMedia` API | Detecta si ya está instalada |
| React + TypeScript | UI del componente InstallPWA |
| TailwindCSS | Estilos y animaciones |

---

## 🔔 Sistema de Notificaciones Push

### Funcionalidad Implementada:
✅ Permiso de notificaciones integrado en banner
✅ FCM token guardado en Firestore (`users/{uid}.fcmToken`)
✅ Service Worker maneja notificaciones en background
✅ Notificaciones en primer plano (app abierta)
✅ Click en notificación abre/enfoca la app

### Triggers de Notificaciones:
1. **Nuevo Aviso** → Envía a todos los usuarios del grupo
2. **Nueva Tarea** → Envía al usuario asignado

### Estado Actual:
⚠️ **Cloud Functions NO desplegadas** (requiere plan Blaze de Firebase)

#### Código listo en: `/functions/src/index.ts`
```typescript
export const sendNotification = functions.https.onCall(...)
export const sendNotificationToGroup = functions.https.onCall(...)
```

---

## 💰 Costos y Planes de Firebase

### Plan Spark (ACTUAL - Gratuito):
- ✅ Hosting ilimitado
- ✅ Authentication
- ✅ Firestore: 1 GB storage, 50K lecturas/día
- ❌ **NO Cloud Functions**
- ❌ **NO envío de notificaciones push**

### Plan Blaze (Pay-as-you-go):
- ✅ Todo lo de Spark
- ✅ Cloud Functions (2M invocaciones gratis/mes)
- ✅ Firebase Cloud Messaging (ilimitado gratis)
- 💵 **Costo típico: $0-5/mes** para uso normal

#### Ejemplo de costos:
- 📱 100 usuarios activos
- 🔔 10 notificaciones/día = 30,000 notificaciones/mes
- 📊 Resultado: **$0/mes** (dentro de límites gratuitos)

### Cómo actualizar:
1. Ir a: https://console.firebase.google.com/project/registrologia/usage/details
2. Click en "Actualizar proyecto"
3. Agregar método de pago (tarjeta)
4. Desplegar: `firebase deploy --only functions`

---

## ✅ Estado Actual del Sistema

### Implementado y Funcionando:
- ✅ Banner de instalación flotante
- ✅ Detección automática iOS/Android
- ✅ Modal con instrucciones para iOS
- ✅ Ocultamiento automático cuando instalada
- ✅ Integración con notificaciones
- ✅ Animaciones suaves (slide-up)
- ✅ Diseño responsive
- ✅ Service Worker activo
- ✅ Manifest configurado
- ✅ Iconos optimizados (72, 192, 512px)

### Pendiente (Requiere Plan Blaze):
- ⏳ Cloud Functions deployment
- ⏳ Envío real de notificaciones push

---

## 🧪 Cómo Probar

### Android:
1. Abre Chrome en tu celular
2. Ve a https://registrologia.web.app
3. Espera el banner flotante
4. Toca "Instalar"
5. Acepta el diálogo
6. ✅ Busca el icono en tu home screen

### iOS:
1. Abre Safari en tu iPhone
2. Ve a https://registrologia.web.app
3. Espera 3 segundos → banner aparece
4. Toca "Ver Cómo"
5. Sigue las instrucciones del modal
6. ✅ Busca el icono en tu home screen

### Verificar instalación:
```javascript
window.matchMedia('(display-mode: standalone)').matches
// true = instalada | false = en navegador
```

---

## 📝 Archivos Clave

```
/components/InstallPWA.tsx          → Banner flotante + modal iOS
/components/Dashboard.tsx           → Integración del banner
/public/manifest.json               → Configuración PWA
/public/service-worker.js           → Service Worker
/services/notifications.ts          → FCM + permisos
/functions/src/index.ts             → Cloud Functions (no desplegadas)
/INSTALACION_PWA.md                 → Esta documentación
/NOTIFICACIONES.md                  → Documentación notificaciones
```

---

## 🎉 Resultado Final

La app se "instala sola" porque:
1. El navegador detecta **manifest.json**
2. Detecta **service worker registrado**  
3. Verifica que sea **HTTPS**
4. ➡️ Habilita opción de instalación

**El banner hace visible esa opción** para que el usuario no tenga que buscarla en el menú del navegador.

---

✨ **¡MiLogia ahora es una Progressive Web App completa y moderna!**
