# NEXTAPE — Despliegue (Netlify + Firebase)

> Modelo real: **Netlify** hospeda la app Next.js (SSR + route handlers `/api/*` como Netlify Functions).
> **Firebase** aporta **Auth + Firestore** (no se usa Firebase Hosting ni App Hosting).
> `apphosting.yaml` y la sección `hosting` de `firebase.json` **no aplican** con Netlify (config muerta).

## ⚠️ Importante tras el saneamiento (server-trust)
El scoring y la escritura del DNA ahora ocurren en **servidor** (route handlers con Firebase Admin SDK).
En Netlify **no hay credenciales automáticas de Google Cloud (ADC)**, así que el Admin SDK **necesita un
service account en una variable de entorno**. **Sin esto, "The LINE" y la generación de pruebas fallan.**

---

## Paso a paso (lo que TÚ debes hacer)

### 1) Service Account de Firebase → variable en Netlify (OBLIGATORIO)
Da a los route handlers permiso para escribir el DNA de forma segura.

1. Firebase Console → tu proyecto **studio-4462619429-470d8** → ⚙️ **Configuración del proyecto** →
   pestaña **Cuentas de servicio** → **Generar nueva clave privada** → descarga el archivo `.json`.
2. Abre el JSON y **copia todo su contenido**.
3. Netlify → tu sitio → **Site configuration → Environment variables → Add a variable**:
   - **Key:** `FIREBASE_SERVICE_ACCOUNT`
   - **Value:** pega el **JSON completo** (tal cual, con sus `\n`). Marca el scope para *Functions*/*Builds*.
4. (Trata este valor como secreto; nunca lo commitees.)

> El código ya lo soporta: `src/lib/firebase/admin.ts` hace `JSON.parse(FIREBASE_SERVICE_ACCOUNT)`.

### 2) API Key de Groq → variable en Netlify (OBLIGATORIO para la IA)
La usa la precarga del banco de preguntas (`npm run seed:questions`); The LINE y las pruebas de vacantes ya no
dependen de ella en tiempo de petición. Groq es el proveedor de IA del proyecto
(modelos open-source tipo Llama), elegido por su bajo coste frente a Gemini.

1. Consíguela en **Groq Console** (https://console.groq.com/keys).
2. Netlify → Environment variables → añade:
   - **Key:** `GROQ_API_KEY`
   - **Value:** tu API key.
   - (Opcional) `GROQ_MODEL` para cambiar el modelo por defecto (`groq/llama-3.3-70b-versatile`).

### 3) Config web de Firebase → variables en Netlify (recomendado)
Opcional (hay fallback en `client.ts`), pero recomendable para no hardcodear el proyecto:

```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=studio-4462619429-470d8.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=studio-4462619429-470d8
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=studio-4462619429-470d8.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1098477758552
NEXT_PUBLIC_FIREBASE_APP_ID=...
```
(Los valores actuales están en `src/lib/firebase/client.ts` y `.env.example`.)

### 4) Firebase Auth: proveedores + dominios autorizados (OBLIGATORIO para login)
1. Firebase Console → **Authentication → Sign-in method**: habilita **Email/Password**, **Google** y **GitHub**
   (para GitHub necesitas crear una OAuth App en GitHub y pegar Client ID/Secret).
2. Firebase Console → **Authentication → Settings → Authorized domains**: **añade tu dominio de Netlify**
   (p.ej. `tu-sitio.netlify.app` y tu dominio propio si tienes). Sin esto, el login con Google/GitHub (popup) falla.

### 5) Desplegar las reglas de Firestore (OBLIGATORIO; es independiente de Netlify)
Las reglas nuevas cierran la integridad del DNA. Se despliegan con el CLI de Firebase, no con Netlify:

```bash
npm i -g firebase-tools      # si no lo tienes
firebase login
firebase deploy --only firestore:rules,storage:rules   # usa .firebaserc → studio-4462619429-470d8
```

### 6) Netlify: build y plugin
- Ya se añadió **`netlify.toml`** (build `npm run build` + `@netlify/plugin-nextjs`, Node 22).
- En Netlify, el **branch de producción** debe ser el que quieras desplegar (revisa *Site configuration →
  Build & deploy → Branches*). Haz un *Deploy* / *Clear cache and deploy* tras añadir las variables.

---

## Checklist de verificación post-deploy
1. **Login**: entra con Email y con Google/GitHub → debe redirigir a `/dashboard` y crear `users/{uid}`.
2. **The LINE** (`/dashboard/line`): inicia una simulación → deben cargar 20 preguntas (10 si el usuario tiene
   su GitHub analizado). Si falla, revisa `FIREBASE_SERVICE_ACCOUNT` en Netlify → *Functions logs*.
3. Respóndelas → pantalla de resultado con % → ve a **CORE** y verifica que aparece el score.
4. **Roadmap**: genera un roadmap (necesita Groq).
5. **Reclutador**: crea una vacante en `/dashboard/vacancies/new` → debe guardarse y componer su prueba desde el
   banco (aviso «The LINE lista con un repertorio de N preguntas»). Como candidato, postula y responde: la
   candidatura debe aparecer en `/dashboard/candidates` del reclutador.
5b. **GitHub** (`/dashboard/github`): «Analizar todos mis repositorios» → progreso por repositorio y perfil
   agregado. Requiere `GITHUB_TOKEN` y `firestore.rules` desplegadas (`github_evidence/{uid}/repos`,
   `api_rate_limits`). Para que The LINE baje a 10 preguntas, el usuario debe tener vinculado ese GitHub
   («Verificar con GitHub»).
6. **Reglas**: intenta escribir `user_skill_scores` desde la consola del navegador → debe fallar
   (prueba de que el DNA no es falsificable).

## Notas / límites
- **Logs**: si algo falla en `/api/*`, míralo en Netlify → *Functions* → logs de la función.
- **Tamaño de función**: `firebase-admin` + `genkit` son pesados; si Netlify se queja del tamaño de la
  función, avísame (hay opciones para aligerar).
- **Sesiones huérfanas**: `line_sessions` se borra al enviar; si un usuario abandona a mitad, el doc queda.
  **Ya no hace falta nada:** cada vez que un usuario empieza una prueba, `/api/line/start` borra sus sesiones
  vencidas (y las antiguas de más de un día). Es la alternativa a la TTL de Firestore, que **exige facturación
  activada (plan Blaze)**: con el proyecto en el plan gratuito, crearla devuelve `403 billing disabled`.
  Si algún día se activa la facturación, se puede añadir además la TTL sobre `expireAt` (vencimiento + 1 día),
  que limpia también las de usuarios que no vuelven:
  `gcloud firestore fields ttls update expireAt --collection-group=line_sessions --enable-ttl`
  ⚠️ No uses `createdAt`: un TTL borra el documento cuando su fecha ya pasó, o sea, al instante.
- **`apphosting.yaml`** y la sección `hosting` de `firebase.json` son restos de Firebase Hosting; con
  Netlify no se usan y pueden eliminarse para evitar confusión.
- **Ranking de candidatos (A4, resuelto)**: tomar The LINE de una vacante ahora, además de actualizar el
  DNA del candidato, lo registra como aplicante escribiendo `candidate_matches` e incrementando
  `applicantsCount` (`/api/line/submit`, server-trust); el reclutador ve el ranking en `/dashboard/candidates`.
