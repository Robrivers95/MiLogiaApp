# Instrucciones para desplegar reglas de Firestore

Las reglas de Firestore NO se despliegan automáticamente con GitHub Actions (solo Hosting).

## Opción 1: Desplegar desde Firebase Console (Recomendado)

1. Ve a: https://console.firebase.google.com/project/gen-lang-client-0255480722/firestore/rules
2. Copia y pega el contenido del archivo `firestore.rules` de este repositorio
3. Haz clic en "Publicar"

## Opción 2: Desplegar con Firebase CLI (Desde tu computadora)

```bash
# Instala Firebase CLI si no lo tienes
npm install -g firebase-tools

# Inicia sesión
firebase login

# Selecciona el proyecto
firebase use gen-lang-client-0255480722

# Despliega solo las reglas
firebase deploy --only firestore:rules
```

## Verificar que las reglas se aplicaron

1. Ve a la consola de Firebase
2. Firestore Database → Rules
3. Verifica que las reglas estén activas

## Nota importante

Sin estas reglas, verás errores como:
- "Missing or insufficient permissions"
- "Error de permisos: Contacta al administrador..."

Las reglas actuales permiten:
- ✅ Usuarios pueden leer/escribir sus propias respuestas de trivia
- ✅ Admin/Master pueden crear solicitudes de visita
- ✅ Admin/Master pueden gestionar todo
