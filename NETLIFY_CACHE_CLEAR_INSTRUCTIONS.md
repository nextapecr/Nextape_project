# 🔄 INSTRUCCIONES: Clear Netlify Build Cache

**Usar si:** El deploy de `ac151ee` ya ocurrió pero el error persiste.

---

## Por qué puede ser necesario

Netlify cachea `node_modules` entre builds para acelerar deploys. Si el caché se creó **antes** de agregar el `optionalDependency`, el binario de Linux podría no instalarse en builds subsecuentes.

---

## Pasos para Clear Cache

### 1. Ve a Netlify Dashboard
   - https://app.netlify.com
   - Selecciona tu site (Nextape)

### 2. Click en "Deploys" tab

### 3. Click en "Trigger deploy" (botón dropdown)

### 4. Selecciona "Clear cache and deploy site"

### 5. Espera el rebuild (~5-10 minutos)

### 6. Re-ejecuta el análisis de GitHub

### 7. Verifica los logs nuevos

Busca específicamente:
```
[universal-parser] ✅ SUCCESS: Grammar loaded for "typescript"
[universal-parser] DIAGNOSTIC: canParse(...) = true
```

---

## Si TODAVÍA falla después de clear cache

Entonces el problema es más profundo y necesitamos investigar:

1. **Logs de build de Netlify** (no solo runtime):
   - En Netlify Dashboard → Deploys → Click en el deploy → "Deploy log"
   - Busca la sección de `npm install` o `npm ci`
   - Copia TODA la salida relacionada con `@kreuzberg/tree-sitter-language-pack`

2. **Verificar el bundle final**:
   - Los logs deberían mostrar si el binario se incluyó en el bundle
   - Busca mensajes como "Skipping optional dependency" o "EBADPLATFORM"

3. **Alternativa nuclear**: Si nada funciona, mover el paquete de `optionalDependencies` a `dependencies` normales con una condición de plataforma en postinstall (menos elegante pero más robusto).

---

**ESTADO ACTUAL:** Esperando confirmación de que el deploy `ac151ee` ya ocurrió en Netlify.
