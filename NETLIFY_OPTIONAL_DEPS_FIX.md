# ✅ NETLIFY OPTIONAL DEPENDENCIES FIX

**Date:** October 3, 2026  
**Commit:** `32f3a81` - "fix: force installation of optional dependencies in Netlify"  
**Status:** ⏳ DEPLOYED - AWAITING VERIFICATION

---

## 🎯 ROOT CAUSE (CONFIRMADO CON EVIDENCIA)

### Problema Original:
```
optionalDependencies en package.json NO se instalan en Netlify
```

### Evidencia de Production Logs (Oct 3, 01:53 PM):
```
SHA actual: ac151ee  ← Deploy con optionalDependency declarado
Cannot find module '@kreuzberg/tree-sitter-language-pack-linux-x64-gnu'  ← Módulo NO instalado
```

### Por qué falló:
- Netlify usa `npm ci` para builds (no `npm install`)
- `npm ci` **skip optionalDependencies por defecto** en entornos CI
- El paquete Linux estaba en package.json pero npm lo ignoraba
- Resultado: 0 archivos analizados porque el parser no puede cargar

---

## 🛠️ SOLUCIÓN IMPLEMENTADA

### Archivo creado: `.npmrc`
```ini
# Force installation of optional dependencies in CI environments
# Required for tree-sitter native bindings on Netlify (Linux)
optional=true
```

### Cómo funciona:
1. ✅ **Netlify (Linux):** npm intentará instalar `@kreuzberg/tree-sitter-language-pack-linux-x64-gnu`
2. ✅ **Windows (tu máquina):** npm intentará instalar, pero fallará con EBADPLATFORM (esperado y correcto)
3. ✅ **El paquete tiene restricciones de plataforma:** `"os": ["linux"], "cpu": ["x64"]`
4. ✅ **Solo se instalará donde corresponde:** Linux x64

### Por qué es seguro:
- npm respeta las restricciones de plataforma del paquete
- En Windows, npm intentará instalar pero el paquete se saltará automáticamente
- No rompe el build en ninguna plataforma

---

## 📋 HISTORIAL DE INTENTOS

| Intento | Estrategia | Resultado | Commit |
|---------|------------|-----------|--------|
| 1 | Agregar a `optionalDependencies` | ❌ Netlify lo skipea | `ac151ee` |
| 2 | Agregar `.npmrc` con `optional=true` | ⏳ En verificación | `32f3a81` |

---

## ⏱️ PRÓXIMOS PASOS

### 1. Esperar deploy de Netlify (~3-5 min)
- Ve a https://app.netlify.com
- Verifica que el deploy con SHA `32f3a81` esté "Published"

### 2. Re-ejecutar análisis de GitHub
- Ir al sitio de producción
- Ejecutar análisis completo
- Esperar resultados

### 3. Verificar logs de Netlify
Buscar específicamente:
```
✅ [universal-parser] SUCCESS: Grammar loaded for "typescript"
✅ [universal-parser] DIAGNOSTIC: canParse(...) = true
✅ filesAnalyzed > 0
```

### 4. Confirmar resultados
- ¿Cuántos archivos se analizaron?
- ¿Aparecen los scores de Architecture/Security/Maintainability?
- ¿Desapareció "Sin código analizable"?

---

## 🎉 CRITERIOS DE ÉXITO

| Métrica | Antes | Después (Esperado) |
|---------|-------|-------------------|
| Files Analyzed | 0 | 12 |
| Has AST Data | false | true |
| Parsed Languages | {} | {typescript: X, tsx: Y} |
| Architecture Score | null | 0-100 |
| Security Score | null | 0-100 |
| canParse() | false | true |

---

## 🔄 SI TODAVÍA FALLA DESPUÉS DE ESTE FIX

### Plan B: Clear Netlify Build Cache
1. Netlify Dashboard → Deploys → Trigger deploy
2. Select "Clear cache and deploy site"
3. Esperar rebuild completo
4. Re-verificar

### Plan C: Inspeccionar Build Logs
Si `.npmrc` no funciona, necesito ver los **build logs** completos de Netlify (no solo runtime):
1. Netlify → Deploys → Click en el deploy → "Deploy log"
2. Buscar la sección de `npm ci` o `npm install`
3. Copiar TODO el output relacionado con tree-sitter-language-pack
4. Enviar esos logs para diagnóstico

### Plan D: Alternativa nuclear
Si nada funciona, última opción:
- Pre-compilar las gramáticas en un script postinstall
- Bundlear los binarios pre-compilados en el repo
- (Menos elegante, más mantenimiento, pero 100% confiable)

---

**ESTADO:** Fix desplegado en commit `32f3a81`. Esperando que Netlify complete el deploy y el usuario verifique.
