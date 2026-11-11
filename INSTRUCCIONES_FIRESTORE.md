# 🔧 ACCIÓN REQUERIDA: Configurar Reglas de Firestore

## ⚠️ Problema Actual

Los errores que estás viendo son por falta de reglas de seguridad en Firestore:
- **"Missing or insufficient permissions"** → Firestore no tiene reglas configuradas
- **Trivia no guarda respuestas** → Permisos bloqueados para escribir en `/users/{uid}/triviaAnswers`
- **No se pueden crear visitas** → Permisos bloqueados para escribir en `/visitRequests`

## 🚀 Solución (2 minutos)

### Paso 1: Ir a la Consola de Firebase
1. Abre: https://console.firebase.google.com/project/gen-lang-client-0255480722/firestore/rules
2. Verás un editor con reglas de Firestore

### Paso 2: Reemplazar las reglas
1. **Borra todo** el contenido actual
2. Copia y pega el contenido del archivo `firestore.rules` de este repositorio (está en la raíz del proyecto)
3. Haz clic en **"Publicar"** (botón azul arriba a la derecha)

### Paso 3: Esperar propagación
- Espera 1-2 minutos después de publicar
- Las reglas se aplicarán automáticamente

## 🧪 Cómo verificar que funcionó

### Después de aplicar las reglas:

1. **Hard refresh** en la app: `Ctrl + Shift + R`
2. **Abre la consola del navegador** (F12 → Console)
3. **Intenta responder una trivia**:
   - Verás logs como: `"Submitting answer:"`, `"Answer saved successfully"`
   - Si ves un error, cópialo y compártelo
4. **Intenta crear una solicitud de visita**:
   - Debería funcionar sin error de permisos
   - Si falla, revisa que tu usuario tenga `role: "master"` en Firestore

## 📋 Checklist

- [ ] Reglas de Firestore publicadas
- [ ] Hard refresh en la app (v2.2.1 visible)
- [ ] Consola del navegador abierta (F12)
- [ ] Probar trivia y ver logs
- [ ] Probar crear visita
- [ ] Compartir errores si persisten

## 🔍 Debug adicional

Si aún falla después de aplicar las reglas:

1. **Verifica tu role en Firestore**:
   - Ve a: https://console.firebase.google.com/project/gen-lang-client-0255480722/firestore/data
   - Busca tu documento en `users/{tu-uid}`
   - Verifica que `role` sea `"master"`

2. **Revisa logs en consola**:
   - La app ahora tiene logging extensivo
   - Copia y pega cualquier error rojo que aparezca

---

**Versión actual desplegada**: v2.2.1
**Archivo de reglas**: `firestore.rules` (en la raíz del repositorio)
