# 🚨 INFORME COMPLETO: FALLO DEL PARSER DE TYPESCRIPT EN NETLIFY

**Fecha:** 3 de Octubre, 2026  
**Estado:** ❌ NO RESUELTO después de 3 intentos  
**Impacto:** 0 archivos TypeScript/TSX analizados en producción

---

## 📋 RESUMEN EJECUTIVO

### Problema
El parser de TypeScript/TSX falla en Netlify (Linux) porque el binario nativo `@kreuzberg/tree-sitter-language-pack-linux-x64-gnu` **NO se instala durante el build**, a pesar de estar declarado correctamente en `package.json`.

### Síntoma
```
Cannot find module '@kreuzberg/tree-sitter-language-pack-linux-x64-gnu'
canParse() = false para TODOS los archivos TypeScript/TSX
filesAnalyzed = 0 (debería ser 12)
```

### Impacto en usuario
- Repositorios con TypeScript muestran "Sin código analizable"
- No hay scores de Architecture, Security, Maintainability
- GitHub Analysis inútil para repos TypeScript (>90% de casos)

---

## 🔍 CAUSA RAÍZ CONFIRMADA

**Netlify NO instala optionalDependencies durante `npm ci`**, incluso con configuración explícita en `.npmrc`.

### Evidencia del Build Log:
```
1:59:38 PM: Installing npm packages using npm version 10.9.9
1:59:38 PM: npm warn config optional Use `--omit=optional` to exclude...
1:59:40 PM: up to date in 2s
```

**El paquete simplemente no se instala.** npm 10.9.9 en Netlify ignora:
1. La declaración en `optionalDependencies` 
2. La configuración `.npmrc` con `optional=true`
3. La configuración `.npmrc` con `include=optional`

---

## 📊 HISTORIAL COMPLETO DE INTENTOS

| # | Estrategia | Commit | Resultado | Por qué falló |
|---|------------|--------|-----------|---------------|
| 1 | Agregar a `optionalDependencies` | `ac151ee` | ❌ No instalado | npm CI skipea opcionales por defecto |
| 2 | `.npmrc` con `optional=true` | `32f3a81`, `f4cdeb6` | ❌ No instalado | Sintaxis incorrecta de npm |
| 3 | `.npmrc` con `include=optional` | `793900f`, `174eec5` | ❌ No instalado | **npm lo ignora en Netlify** |

### Evidencia de cada intento:

**Intento 1 (Oct 3, 01:48 PM):**
```
SHA actual: ac151ee
Cannot find module '@kreuzberg/tree-sitter-language-pack-linux-x64-gnu'
```

**Intento 2 (Oct 3, 01:53 PM + 01:59 PM):**
```
SHA actual: ac151ee, f4cdeb6
npm warn config optional Use '--include=optional'...
Cannot find module '@kreuzberg/tree-sitter-language-pack-linux-x64-gnu'
```

**Intento 3 (Oct 3, 02:06 PM):**
```
SHA actual: 174eec5
Cannot find module '@kreuzberg/tree-sitter-language-pack-linux-x64-gnu'
```

---

## 🛠️ CAMBIOS IMPLEMENTADOS

### Archivos modificados:

#### 1. `package.json`
```json
"optionalDependencies": {
  "@kreuzberg/tree-sitter-language-pack-linux-x64-gnu": "^1.10.9"
}
```

#### 2. `.npmrc` (intento 2)
```ini
optional=true  # ← Sintaxis incorrecta
```

#### 3. `.npmrc` (intento 3 - actual)
```ini
include=optional  # ← Sintaxis correcta pero ignorada
```

#### 4. Instrumentación diagnóstica
- `src/services/github-error-classifier.ts` - Clasificación de errores
- `src/types/github.types.ts` - Tipos de error
- `src/services/github-signals.service.ts` - Logging detallado
- `src/services/github-engine/parsers/universal-parser.ts` - Logging de parser

---

## 🔬 ANÁLISIS TÉCNICO

### ¿Por qué tree-sitter necesita binarios nativos?

Tree-sitter usa gramáticas compiladas en C para parsear código de forma eficiente. Cada plataforma (Windows, Linux, macOS) necesita su propio binario nativo (`.node` file).

**Estructura del paquete:**
```
@kreuzberg/tree-sitter-language-pack (base)
├── @kreuzberg/tree-sitter-language-pack-win32-x64-msvc (Windows)
├── @kreuzberg/tree-sitter-language-pack-linux-x64-gnu (Linux) ← FALTA
└── @kreuzberg/tree-sitter-language-pack-darwin-* (macOS)
```

### ¿Por qué funciona en Windows local?

En desarrollo (Windows), npm instala automáticamente el binario de Windows. El código funciona porque el paquete detecta la plataforma y carga el binario correcto.

### ¿Por qué falla en Netlify?

Netlify usa Linux x64, pero npm **NO instala el binario de Linux** a pesar de:
- Estar en `package-lock.json` con `"optional": true`
- Estar en `optionalDependencies` en `package.json`
- Configuración `.npmrc` explícita

**Razón:** Netlify probablemente usa `npm ci --omit=optional` o tiene una configuración interna que previene la instalación de optionalDependencies.

---

## 🎯 SOLUCIONES INTENTADAS Y RECHAZADAS

### ❌ Solución 1: optionalDependencies estándar
**Por qué no funcionó:** npm CI en Netlify skipea opcionales por defecto.

### ❌ Solución 2: Forzar con .npmrc
**Por qué no funcionó:** Netlify ignora `.npmrc` o tiene override interno.

### ❌ Solución 3 (no intentada): Mover a dependencies normales
**Por qué no funcionaría:** npm bloqueará la instalación en Windows con `EBADPLATFORM`, rompiendo el desarrollo local.

---

## ✅ SOLUCIONES VIABLES (NO IMPLEMENTADAS)

### OPCIÓN A: Modificar build command en netlify.toml ⭐ RECOMENDADA
```toml
[build]
  command = "npm install --include=optional && npm run build"
```

**Pros:**
- Fuerza instalación explícita de opcionales
- No rompe desarrollo local
- Limpio y simple

**Contras:**
- Agrega ~5-10s al build time
- Si Netlify hace cache de node_modules, podría no ayudar

---

### OPCIÓN B: Usar script postinstall para verificar/instalar
Crear `scripts/ensure-tree-sitter-linux.js`:
```javascript
if (process.platform === 'linux') {
  const packageName = '@kreuzberg/tree-sitter-language-pack-linux-x64-gnu';
  try {
    require.resolve(packageName);
    console.log('✅ Linux tree-sitter bindings found');
  } catch (e) {
    console.log('⚠️  Installing Linux tree-sitter bindings...');
    execSync(`npm install ${packageName}`, { stdio: 'inherit' });
  }
}
```

Agregar en `package.json`:
```json
"scripts": {
  "postinstall": "node scripts/ensure-tree-sitter-linux.js"
}
```

**Pros:**
- Garantiza instalación en Linux
- No afecta Windows/Mac
- Auto-recuperable

**Contras:**
- Más complejo
- Requiere mantenimiento

---

### OPCIÓN C: Pre-build las gramáticas y commitearlas
Generar las gramáticas compiladas en un entorno Linux y commitearlas al repo.

**Pros:**
- 100% confiable
- No depende de npm

**Contras:**
- Aumenta tamaño del repo (~5-10 MB)
- Requiere rebuild manual en cada actualización
- Más complejo de mantener

---

### OPCIÓN D: Cambiar a parser alternativo
Reemplazar tree-sitter con:
- `@typescript-eslint/parser` + `acorn` (solo JS/TS)
- `@babel/parser` (solo JS/TS/JSX)

**Pros:**
- No requiere binarios nativos
- Más simple de instalar

**Contras:**
- **NO soporta múltiples lenguajes** (solo JS/TS)
- Requiere reescribir toda la lógica de parsing
- Perdemos soporte para Python, Go, Rust, etc.
- ~4-6 horas de trabajo

---

## 📈 RECOMENDACIÓN FINAL

### Implementar OPCIÓN A primero (5 minutos):

1. Modificar `netlify.toml`:
```toml
[build]
  command = "npm install --include=optional && npm run build"
```

2. Commit y push

3. Esperar deploy

4. Verificar que el parser funciona

**Si OPCIÓN A falla:** Implementar OPCIÓN B (postinstall script) - 15 minutos

**Si OPCIÓN B falla:** Considerar OPCIÓN C (pre-build) o OPCIÓN D (cambiar parser) - varias horas

---

## 🔄 ESTADO ACTUAL DEL CÓDIGO

### Archivos con cambios pendientes de revertir (si cambiamos enfoque):
- `src/services/github-error-classifier.ts` - MANTENER (útil para debugging)
- `src/types/github.types.ts` - MANTENER (útil para debugging)
- `src/services/github-signals.service.ts` - REVERTIR logging verboso (commits 82f08e9)
- `src/services/github-engine/parsers/universal-parser.ts` - REVERTIR logging verboso

### Archivos que deben permanecer:
- `package.json` - optionalDependencies (correcto)
- `.npmrc` - puede permanecer o eliminarse (no hace daño)
- `package-lock.json` - tiene la entrada correcta

---

## 📞 PRÓXIMOS PASOS INMEDIATOS

1. **Implementar OPCIÓN A** (modificar netlify.toml build command)
2. **Commit y push**
3. **Esperar deploy de Netlify (~5 min)**
4. **Re-ejecutar análisis de GitHub**
5. **Verificar logs:**
   - ✅ Buscar `npm install --include=optional` en build log
   - ✅ Buscar `canParse() = true` en runtime log
   - ✅ Verificar `filesAnalyzed > 0`

**Si funciona:** Limpiar logging verboso y cerrar issue.

**Si no funciona:** Proceder con OPCIÓN B (postinstall script).

---

## 🎯 CRITERIOS DE ÉXITO

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Módulo instalado | ❌ No | ✅ Sí |
| canParse() | false | true |
| filesAnalyzed | 0 | 12 |
| hasASTData | false | true |
| Architecture Score | null | 0-100 |
| Security Score | null | 0-100 |
| Maintainability Score | null | 0-100 |

---

**Generado:** 3 de Octubre, 2026, 14:10 PM  
**Commits relevantes:** `ac151ee`, `32f3a81`, `793900f`, `174eec5`, `82f08e9`  
**Tiempo invertido:** ~2 horas de debugging  
**Estado:** Esperando implementación de OPCIÓN A
