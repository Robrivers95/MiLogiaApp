# Instrucciones de Despliegue para Reglas de Storage - v3.1.0

## 📋 Reglas de Storage Pendientes

Las reglas de Firebase Storage necesitan ser desplegadas manualmente desde tu máquina local.

### Pasos para Desplegar:

1. **Asegúrate de tener Firebase CLI instalado:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Inicia sesión en Firebase:**
   ```bash
   firebase login
   ```

3. **Despliega las reglas de Storage:**
   ```bash
   cd /ruta/a/MiLogiaApp
   firebase deploy --only storage
   ```

### Alternativa: Desplegar Manualmente desde Firebase Console

1. Ve a: https://console.firebase.google.com/project/registrologia/storage/rules
2. Copia el contenido del archivo `storage.rules`
3. Pégalo en el editor de reglas
4. Haz clic en "Publicar"

### Contenido de las Reglas (storage.rules):

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // App icons - only Master can upload
    match /app-icons/{allPaths=**} {
      allow read: if true;  // Anyone can read/download the icons
      allow write: if request.auth != null && 
                      exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
                      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'master';
    }
    
    // Default: deny everything else
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

## ✅ Verificación

Después de desplegar, verifica que:
- El usuario Master puede subir iconos desde "📱 Configurar App" en el Panel Maestro
- Los iconos se guardan correctamente en Firebase Storage
- Los usuarios pueden ver el botón de instalación en sus dispositivos móviles
