# 🚀 MIGRACIÓN: GROQ 120B → 20B FALLBACK (NVIDIA ELIMINADO)

**Fecha:** 2026-08-21  
**Estado:** ✅ COMPLETADO Y VALIDADO

---

## 📊 RESUMEN EJECUTIVO

### ✅ Objetivos Cumplidos
1. ✅ Eliminado NVIDIA como proveedor de fallback (créditos no renovables)
2. ✅ Implementado fallback interno Groq 120B → 20B
3. ✅ Migrado de `genkitx-groq` a `@genkit-ai/compat-oai` (modelos GPT-OSS)
4. ✅ Actualizada documentación (`docs/BACKEND_AI.md`)
5. ✅ Typecheck + diagnóstico en verde

### 🎯 Estrategia Final
**Proveedor único:** Groq  
**Fallback interno:** GPT-OSS 120B (primario) → GPT-OSS 20B (fallback)  
**Capacidad combinada:** 500K TPM (250K + 250K)  
**Renovación:** Por minuto (no diaria)

---

## 🔧 CAMBIOS TÉCNICOS

### 1. Arquitectura de IA (src/ai/genkit.ts)

**ANTES:**
```typescript
import groq from 'genkitx-groq';
export const GROQ_MODEL = 'groq/llama-3.3-70b-versatile'; // ❌ Movido a Enterprise
```

**AHORA:**
```typescript
import { openAICompatible } from '@genkit-ai/compat-oai';
export const GROQ_MODEL = 'groq/openai/gpt-oss-120b'; // ✅ Free tier

export const ai = genkit({
  plugins: [
    openAICompatible({
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    }),
  ],
  model: GROQ_MODEL,
});
```

**Razón del cambio de plugin:**  
- `genkitx-groq` no tiene los modelos GPT-OSS registrados (desactualizado, agosto 2026)
- `@genkit-ai/compat-oai` permite usar cualquier API compatible con OpenAI (incluida Groq)
- Ya estaba instalado en el proyecto (`package.json`)

---

### 2. Fallback Interno (src/ai/generate.ts)

**ANTES:**
```typescript
// Groq → NVIDIA fallback (entre proveedores)
const data = await generateJsonNvidia(prompt, schema);
return { data, provider: 'nvidia' };
```

**AHORA:**
```typescript
// Groq 120B → Groq 20B fallback (interno)
const MODEL_120B = 'groq/openai/gpt-oss-120b';
const MODEL_20B = 'groq/openai/gpt-oss-20b';

if (isGroq120bUnavailable) {
  const data = await generateJsonWithModel(prompt, schema, MODEL_20B);
  return { data, model: '20b' };
}

try {
  const data = await generateJsonWithModel(prompt, schema, MODEL_120B);
  return { data, model: '120b' };
} catch (err) {
  // Rate limit 429 → fallback a 20B
  isGroq120bUnavailable = true;
  const data = await generateJsonWithModel(prompt, schema, MODEL_20B);
  return { data, model: '20b' };
}
```

---

### 3. Archivos Eliminados

| Archivo | Razón |
|---------|-------|
| `src/ai/genkit-nvidia.ts` | NVIDIA eliminado |
| `scripts/diagnose-ai-providers.ts` | Reemplazado por `diagnose-groq.ts` |
| `scripts/test-nvidia.ts` | NVIDIA eliminado |
| `scripts/test-github-feedback-migration.ts` | Obsoleto (específico a Groq→NVIDIA) |

---

### 4. Archivos Creados

| Archivo | Propósito |
|---------|-----------|
| `scripts/diagnose-groq.ts` | Valida Groq 120B + 20B disponibles |
| `scripts/test-groq-direct-api.ts` | Lista modelos disponibles en Groq API |
| `scripts/test-model.ts` | Test rápido de un modelo específico |

---

### 5. Flows Actualizados

| Flow | Cambio |
|------|--------|
| `generate-assessment-flow.ts` | `provider` → `model` (Groq 120B/20B) |
| `generate-roadmap-flow.ts` | `provider` → `model` |
| `generate-github-feedback-flow.ts` | `provider` → `model`, logs actualizados |

---

## 📈 COMPARACIÓN: NVIDIA vs GROQ FALLBACK

### NVIDIA (ELIMINADO)
| Métrica | Valor | Problema |
|---------|-------|----------|
| Créditos totales | 5,000 | ❌ No renovables |
| Seeding completo | 6-10 ejecuciones | ❌ Luego inutilizable |
| Renovación | Nunca | ❌ Trial permanente |

### GROQ GPT-OSS (ACTUAL)
| Modelo | TPM | RPM | Velocidad | Precio |
|--------|-----|-----|-----------|--------|
| **120B** | 250K | 1K | 500 T/sec | $0.15 / $0.60 por 1M |
| **20B** | 250K | 1K | 1000 T/sec | $0.075 / $0.30 por 1M |

**Ventajas:**
- ✅ **500K TPM combinados** (250K + 250K)
- ✅ **Renovación por minuto** (no diaria como Llama)
- ✅ **1K RPM** (33x más que Llama 3.3 70B: 30 RPM)
- ✅ **Seeding de 825 requests < 1 minuto** (vs 27-28 min con Llama)
- ✅ **Gratis e ilimitado** (dentro de límites por minuto)

---

## 🧪 VALIDACIÓN

### Typecheck
```bash
npm run typecheck
# ✅ Exit Code: 0
```

### Diagnóstico Groq
```bash
npx tsx scripts/diagnose-groq.ts
# ✅ Groq 120B: Funcional
# ✅ Groq 20B: Funcional
# ✅ Sistema listo: Groq 120B como primario, 20B como fallback
```

---

## 📝 VARIABLES DE ENTORNO

### Limpiar (ya no necesarias)
```bash
# En Netlify Dashboard → Environment Variables:
❌ NVIDIA_API_KEY  # ELIMINAR
❌ NVIDIA_MODEL    # ELIMINAR
❌ MISTRAL_API_KEY # ELIMINAR (nunca usado)
❌ MISTRAL_MODEL   # ELIMINAR (nunca usado)
```

### Mantener (única necesaria)
```bash
✅ GROQ_API_KEY=gsk_... # Regenerada en console.groq.com/keys
```

---

## 🎯 PRÓXIMOS PASOS

### 1. Deploy a Producción
```bash
git add .
git commit -m "feat: migrate to Groq 120B→20B fallback, remove NVIDIA"
git push origin main
```

### 2. Limpieza Netlify
1. Ir a **Netlify Dashboard → Site settings → Environment variables**
2. Eliminar:
   - `NVIDIA_API_KEY`
   - `NVIDIA_MODEL`
   - `MISTRAL_API_KEY`
   - `MISTRAL_MODEL`
3. Verificar que `GROQ_API_KEY` esté actualizada

### 3. Test en Producción
```bash
# Ejecutar GitHub Feedback en producción
# Verificar logs: modelo usado (120B o 20B)
```

---

## 💡 DECISIONES CLAVE

### ¿Por qué GPT-OSS en vez de Llama?
**Llama 3.3 70B y 3.1 8B movidos a Enterprise (agosto 2026)**  
- Requieren contactar ventas
- No disponibles en free tier
- GPT-OSS es el reemplazo oficial en free tier

### ¿Por qué eliminar NVIDIA?
**Créditos no renovables (5K totales)**  
- Seeding completo: 6-10 ejecuciones → agotado
- Groq renueva límites cada minuto → sostenible infinitamente

### ¿Por qué cambiar de plugin?
**`genkitx-groq` desactualizado**  
- No tiene GPT-OSS registrados
- `@genkit-ai/compat-oai` es oficial de Firebase y soporta cualquier API OpenAI-compatible

---

## 📚 DOCUMENTACIÓN ACTUALIZADA

### docs/BACKEND_AI.md
- ✅ Sección "Capa de IA" reescrita
- ✅ Tabla de límites actualizada (120B/20B)
- ✅ Explicación de por qué se eliminó NVIDIA
- ✅ Nota sobre cambio de plugin (genkitx-groq → @genkit-ai/compat-oai)

---

## 🎉 RESULTADO

**Sistema simplificado, sostenible y más rápido:**
- 1 proveedor (Groq) en vez de 2 (Groq + NVIDIA)
- Límites renovables por minuto (no diarios)
- 33x más RPM que antes (1K vs 30)
- Seeding 27x más rápido (<1 min vs 27-28 min)
- Sin riesgo de agotar créditos permanentemente

**Estado:** ✅ LISTO PARA PRODUCCIÓN
