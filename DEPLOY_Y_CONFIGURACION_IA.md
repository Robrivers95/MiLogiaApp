# Build, deploy y configuración de IA

## Probar y construir

```bash
git checkout feature/admin-ai-assistant
git pull origin feature/admin-ai-assistant
npm install
npm run build
```

## Probar localmente

```bash
npm run dev
```

## Desplegar Firebase Hosting, Functions y reglas

```bash
npm install -g firebase-tools
firebase login
firebase use registrologia
npm --prefix functions install
npm --prefix functions run build
firebase deploy --only hosting,functions,firestore:rules,storage
```

Para desplegar solamente la aplicación web:

```bash
firebase deploy --only hosting
```

## Clave de IA

El asistente administrativo incluido en esta rama usa comandos y reglas locales para navegación, consultas y preparación de acciones. Esas funciones no requieren una API key todavía.

Cuando se conecte un modelo externo para interpretar lenguaje más libre, la clave no debe colocarse en archivos `VITE_*`, React, `services/api.ts` ni en el repositorio. Debe guardarse como secreto de Firebase Functions:

```bash
firebase functions:secrets:set AI_API_KEY
```

Firebase solicitará pegar la clave de forma privada. También conviene guardar el proveedor y modelo como configuración no secreta o variables del backend, por ejemplo `openai`, `google` o `anthropic`.

El proveedor sí importa: cada API usa URL, autenticación, modelos y formato de respuesta distintos. La capa de comandos de la app puede mantenerse igual, pero hace falta un adaptador backend específico para el proveedor elegido.

## Regreso seguro

El código anterior a la IA está preservado en:

```text
backup/pre-ai-assistant-2026-07-27
```

No fusiones el PR con `main` hasta que `npm run build` termine correctamente y las funciones principales hayan sido probadas con una cuenta Admin y otra Member.
