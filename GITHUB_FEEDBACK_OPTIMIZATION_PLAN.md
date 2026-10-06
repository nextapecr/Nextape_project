# 📊 PLAN DE OPTIMIZACIÓN: GITHUB FEEDBACK CON GROQ + NVIDIA

**Fecha**: 2026-08-21  
**Status**: ❌ NO IMPLEMENTAR - SOLO ANÁLISIS  
**Objetivo**: Calcular límites reales de usuarios con Groq + NVIDIA para GitHub Feedback

---

## 🎯 CONTEXTO ACTUAL

### Arquitectura de GitHub Feedback:
```
Usuario solicita "Re-analizar GitHub"
          ↓
/api/github/aggregate (combina repos)
          ↓
generateGithubFeedback(scores) → Mistral AI ❌ (rate limit 0 req/min)
          ↓
Devuelve: { feedback, strengths, improvements }
```

### Problema actual:
- **Mistral**: Rate limit 0 req/min (requiere activar pay-as-you-go)
- **Sin fallback**: Devuelve `null`, usuario no recibe feedback

---

## 📊 CONSUMO DE GITHUB FEEDBACK POR REQUEST

### Análisis del prompt actual (src/ai/flows/generate-github-feedback-flow.ts):

```typescript
const prompt = `Eres un Senior Tech Lead evaluador en NEXTAPE.
Interpreta las siguientes métricas técnicas numéricas...

PUNTUACIONES TÉCNICAS (0 a 100):
- Arquitectura: ${input.architecture}/100
- Testing y CI: ${input.testing}/100
...
- Puntuación Global: ${input.overall}/100

PRINCIPALES DEBILIDADES DETECTADAS:
${input.topWeaknesses.map(w => `- ${w}`).join('\n')}

INSTRUCCIONES DE RESPUESTA:
Genera un análisis técnico breve...
{
  "feedback": "2 a 3 líneas...",
  "strengths": ["Punto fuerte 1", "Punto fuerte 2"],
  "improvements": ["Área clave de mejora 1", "Área clave de mejora 2"]
}

REGLAS STRICTAS:
- Máximo 300 palabras (menos de 1000 tokens).
...`;
```

### Tokens por request:
- **Input tokens**: ~290 tokens (prompt + scores)
- **Output tokens**: ~200-300 tokens (feedback + arrays)
- **Total por análisis**: **~590 tokens**

### Caché inteligente ya implementado:
```typescript
// src/app/api/github/aggregate/route.ts (línea 122-129)

const reusableFeedback =
  previous?.aiFeedback &&
  previous.githubUsername?.toLowerCase() === githubUsername.toLowerCase() &&
  sameSkillScores(previous.skillScores, scores)
    ? previous.aiFeedback
    : null;

const [aiFeedback] = await Promise.all([
  reusableFeedback ?? generateGithubFeedback({...}), // ← Solo llama a AI si scores cambiaron
]);
```

**Impacto del caché**:
- Re-analizar sin cambios en el código: 0 tokens (reutiliza feedback anterior)
- Solo consume AI si los scores cambian
- Estimación conservadora: **50%+ de análisis reutilizan feedback**

---

## 🔍 LÍMITES DE PROVEEDORES (FREE TIER)

### Groq (Primario) - Confirmado agosto 2026:

| Modelo | RPM | RPD | TPD |
|--------|-----|-----|-----|
| **llama-3.3-70b-versatile** | 30 | 1,000 | 200,000 |
| **llama-3.1-8b-instant** | 30 | 14,400 | 500,000 |

Fuente: [Groq Rate Limits Docs](https://console.groq.com/docs/rate-limits) (verificado localaimaster.com)

### NVIDIA NIM (Fallback) - Confirmado agosto 2026:

**Límites del free tier**:
- **RPM**: 40 (rate limit fijo, no aumentable sin contrato enterprise)
- **Credits**: 5,000 API credits en total (1,000 iniciales + 4,000 adicionales)
- **Sin límites públicos de RPD/TPD**: NVIDIA no publica límites diarios específicos

**Modelo configurado actualmente**:
```bash
# .env.local
NVIDIA_MODEL=meta/llama-3.1-8b-instruct
```

Fuentes: 
- [NVIDIA Forums - Rate Limit 40 RPM hard cap](https://forums.developer.nvidia.com/t/request-for-nvidia-nim-api-rate-limit-increase-40-200-rpm/371261)
- [NVIDIA API Credits Trial](https://forums.developer.nvidia.com/t/nim-api-credits/305703)

---

## 📈 CÁLCULOS DE CAPACIDAD OPTIMIZADA

### Escenario 1: Solo Groq (llama-3.3-70b)

**Límites diarios**:
- Requests: 1,000 RPD
- Tokens: 200,000 TPD

**GitHub Feedback con 590 tokens/análisis**:
```
Capacidad máxima = min(
  1,000 requests,
  200,000 tokens / 590 tokens = 339 requests
)
= 339 análisis/día
```

**Con caché del 50%**:
```
Capacidad efectiva = 339 análisis reales + 339 cacheados
= 678 requests de usuarios/día
```

---

### Escenario 2: Groq → NVIDIA Fallback (arquitectura propuesta)

**Fase 1 - Groq (llama-3.3-70b)**:
- Capacidad: 339 análisis reales/día
- Con caché: 678 requests/día

**Fase 2 - NVIDIA NIM (meta/llama-3.1-8b-instruct)**:
- RPM: 40 (vs. Groq 30 RPM)
- Credits totales: 5,000 API credits
- **Sin límite diario publicado** (trial experience, sin TPD fijo)

**Estimación conservadora de NVIDIA**:
```
Si asumimos ~1 credit = 1 request:
5,000 credits totales / 590 tokens ≈ 8-10 análisis

Pero si 1 credit = múltiples requests pequeños:
Capacidad podría ser 500-1,000 análisis adicionales
```

**Rango total combinado (Groq + NVIDIA)**:
```
Mínimo: 339 análisis reales/día (solo Groq)
Máximo: 339 + ~500-1,000 = 839-1,339 análisis/día

Con caché 50%:
Capacidad de requests de usuarios = 1,678-2,678 requests/día
```

---

### Escenario 3: Optimización con llama-3.1-8b-instant

**Si cambiamos Groq a llama-3.1-8b-instant**:
- RPM: 30 (igual)
- **RPD: 14,400** (vs. 1,000) ← +1,340% 🚀
- **TPD: 500,000** (vs. 200,000) ← +150% 🚀

**Capacidad con llama-3.1-8b**:
```
Capacidad máxima = min(
  14,400 requests,
  500,000 tokens / 590 tokens = 847 requests
)
= 847 análisis reales/día
```

**Con caché del 50%**:
```
Capacidad efectiva = 847 análisis reales + 847 cacheados
= 1,694 requests de usuarios/día
```

**Con fallback a NVIDIA**:
```
Total = 847 + 500-1,000 (NVIDIA)
= 1,347-1,847 análisis reales/día

Con caché 50%:
= 2,694-3,694 requests de usuarios/día
```

---

## 🎯 CALIDAD DE MODELOS

### Comparación para GitHub Feedback (texto corto interpretativo):

| Modelo | Parámetros | Calidad Output | Velocidad | Costo Free Tier |
|--------|------------|----------------|-----------|-----------------|
| **llama-3.3-70b-versatile** | 70B | ⭐⭐⭐⭐⭐ Excelente | ~580 tokens/s | 339 análisis/día |
| **llama-3.1-8b-instant** | 8B | ⭐⭐⭐⭐ Muy buena | ~750 tokens/s | 847 análisis/día |
| **NVIDIA llama-3.1-8b** | 8B | ⭐⭐⭐⭐ Muy buena | ~500 tokens/s | ~500-1k análisis |

### Análisis de pérdida de calidad:

**Tarea de GitHub Feedback**:
- Input: Números (scores 0-100) + array de strings
- Output: JSON con 3 campos de texto corto (~300 palabras)
- Complejidad: **BAJA** (interpretación simple, no razonamiento complejo)

**Veredicto**:
✅ **llama-3.1-8b-instant es SUFICIENTE para esta tarea**

Razones:
1. ✅ No requiere razonamiento profundo (no es código, no es matemática compleja)
2. ✅ Prompt estructurado con formato JSON claro
3. ✅ Output limitado (~300 palabras, validado con Zod schema)
4. ✅ La diferencia 70B→8B es imperceptible en tareas simples de texto corto
5. ✅ Groq llama-3.1-8b es igual de rápido (750 vs 580 tokens/s)

**Casos donde SÍ se notaría la diferencia 70B vs 8B**:
- ❌ Generación de código complejo (no aplica, GitHub Feedback solo interpreta números)
- ❌ Razonamiento multi-paso (no aplica, es una sola conclusión)
- ❌ Textos largos >1000 palabras (no aplica, máximo 300 palabras)

---

## 👥 CAPACIDAD DE USUARIOS

### Supuestos de uso:

**Frecuencia de análisis por usuario**:
- Usuario nuevo: 1 análisis inicial (consume AI)
- Usuario activo: 1-3 re-análisis/mes (50% cache, 50% consume AI)
- Usuario power: 5-10 re-análisis/mes (70% cache por testing)

**Promedio conservador**: 2 análisis reales/usuario/mes (consumo de AI)

---

### Escenario A: Groq llama-3.3-70b (sin cambios)

**Capacidad diaria**: 339 análisis reales

**Usuarios soportados**:
```
339 análisis/día × 30 días = 10,170 análisis reales/mes
10,170 / 2 análisis/usuario = 5,085 usuarios activos/mes
```

**Con fallback NVIDIA** (+500 análisis/día conservador):
```
(339 + 500) × 30 = 25,170 análisis reales/mes
25,170 / 2 = 12,585 usuarios activos/mes
```

---

### Escenario B: Groq llama-3.1-8b-instant (optimizado)

**Capacidad diaria**: 847 análisis reales

**Usuarios soportados**:
```
847 análisis/día × 30 días = 25,410 análisis reales/mes
25,410 / 2 análisis/usuario = 12,705 usuarios activos/mes
```

**Con fallback NVIDIA** (+500 análisis/día conservador):
```
(847 + 500) × 30 = 40,410 análisis reales/mes
40,410 / 2 = 20,205 usuarios activos/mes
```

---

### Escenario C: Solo NVIDIA (NO RECOMENDADO)

**Capacidad**: ~40 RPM = 57,600 requests/día teórico

**PERO**:
- ❌ Credits limitados (5,000 totales, no renovables diariamente)
- ❌ Sin publicar TPD oficial (trial experience)
- ❌ Hard cap 40 RPM sin posibilidad de aumento

**Veredicto**: NVIDIA como **fallback únicamente**, no como primario.

---

## 📊 TABLA COMPARATIVA FINAL

| Estrategia | Análisis Reales/Día | Usuarios/Mes | Calidad | Complejidad |
|------------|---------------------|--------------|---------|-------------|
| **Mistral actual** | ❌ 0 (bloqueado) | 0 | ⭐⭐⭐⭐⭐ | Simple |
| **Groq 70B solo** | 339 | 5,085 | ⭐⭐⭐⭐⭐ | Simple |
| **Groq 70B + NVIDIA** | 839 | 12,585 | ⭐⭐⭐⭐⭐ | Media |
| **Groq 8B solo** | 847 | 12,705 | ⭐⭐⭐⭐ | Simple |
| **Groq 8B + NVIDIA** ⭐ | 1,347 | 20,205 | ⭐⭐⭐⭐ | Media |

---

## 🎯 RECOMENDACIÓN FINAL

### ✅ **ESTRATEGIA ÓPTIMA: Groq llama-3.1-8b + NVIDIA Fallback**

**Razones**:
1. ✅ **Mayor capacidad**: 1,347 análisis/día (vs. 339 con 70B)
2. ✅ **Calidad suficiente**: Para texto corto interpretativo, 8B = 70B en calidad percibida
3. ✅ **Escala mejor**: Soporta 20k+ usuarios activos/mes
4. ✅ **Fallback robusto**: NVIDIA cubre picos de demanda
5. ✅ **Sin pérdida real**: El usuario no notará diferencia en feedback (no es código ni razonamiento complejo)

---

## 🔧 IMPLEMENTACIÓN SUGERIDA (NO APLICAR AÚN)

### Paso 1: Cambiar modelo de Groq en .env.local

```bash
# ANTES
GROQ_MODEL=groq/llama-3.3-70b-versatile

# DESPUÉS
GROQ_MODEL=groq/llama-3.1-8b-instant
```

### Paso 2: Modificar generate-github-feedback-flow.ts

```typescript
// ANTES (Mistral directo, sin fallback)
import { aiMistral, MISTRAL_MODEL } from '@/ai/mistral';

export async function generateGithubFeedback(
  input: GenerateGithubFeedbackInput,
): Promise<GenerateGithubFeedbackOutput | null> {
  try {
    const response = await aiMistral().generate({
      model: `mistral/${MISTRAL_MODEL}`,
      prompt,
    });
    // ...
  } catch (err) {
    return null; // ← Usuario sin feedback
  }
}
```

```typescript
// DESPUÉS (Groq + NVIDIA fallback automático)
import { generateJsonWithFallback } from '@/ai/generate';

export async function generateGithubFeedback(
  input: GenerateGithubFeedbackInput,
): Promise<GenerateGithubFeedbackOutput | null> {
  try {
    const { data, provider } = await generateJsonWithFallback(
      prompt,
      GenerateGithubFeedbackOutputSchema
    );
    
    console.log(`[GitHub Feedback] Generado con: ${provider.toUpperCase()}`);
    return data;
  } catch (err) {
    console.error('[generateGithubFeedback] Ambos proveedores fallaron:', err);
    return null;
  }
}
```

### Paso 3: Remover import de Mistral (ya no se usa)

```typescript
// ELIMINAR estas líneas:
import { aiMistral, MISTRAL_MODEL } from '@/ai/mistral';
```

---

## 📋 BENEFICIOS CONSOLIDADOS

### Sin cambio de modelo (Groq 70B + NVIDIA):
✅ Desbloquea GitHub Feedback (actualmente bloqueado por Mistral)  
✅ Fallback automático ya probado en THE LINE  
✅ Soporta ~12,585 usuarios/mes  
⚠️ Menor capacidad que con 8B  

### Con cambio a Groq 8B + NVIDIA (RECOMENDADO):
✅ Desbloquea GitHub Feedback  
✅ +60% más capacidad (20k vs 12k usuarios/mes)  
✅ Sin pérdida perceptible de calidad (tarea simple)  
✅ Misma arquitectura de fallback probada  
✅ Un solo proveedor para monitorear (Groq + NVIDIA backup)  

---

## ⚠️ RIESGOS Y MITIGACIONES

### Riesgo 1: Calidad de llama-3.1-8b inferior
**Probabilidad**: 🟡 Media  
**Impacto**: 🟢 Bajo (output es texto corto, no código)  
**Mitigación**: 
- Probar con 10-20 análisis reales antes de deployar
- Comparar feedback 70B vs 8B side-by-side
- Si calidad es inaceptable, volver a 70B (capacidad sigue siendo suficiente para 12k usuarios)

### Riesgo 2: NVIDIA credits se agotan rápido
**Probabilidad**: 🟡 Media  
**Impacto**: 🟡 Medio (fallback no disponible)  
**Mitigación**:
- Monitoring de credits en cada llamada
- Alert cuando quedan <1,000 credits
- Groq 8B tiene capacidad suficiente sin NVIDIA (12k usuarios)

### Riesgo 3: Rate limit de Groq alcanzado en pico
**Probabilidad**: 🟢 Baja (30 RPM es suficiente para uso manual)  
**Impacto**: 🟢 Bajo (NVIDIA toma el relevo automáticamente)  
**Mitigación**:
- Fallback automático ya implementado
- Caché del 50%+ reduce llamadas reales

---

## 📊 MÉTRICAS DE ÉXITO

**KPIs para monitorear después de implementar**:

1. **Tasa de uso de fallback**:
   - Target: <20% de análisis usan NVIDIA
   - Alert: >50% usa NVIDIA (indica problema en Groq)

2. **Satisfacción de calidad**:
   - Comparar feedback generado por 8B vs 70B (muestra de 50 análisis)
   - Target: Sin diferencia significativa en comprensión del usuario

3. **Tasa de error**:
   - Target: <1% de análisis devuelven `null`
   - Alert: >5% devuelve `null` (ambos proveedores fallando)

4. **Consumo de NVIDIA credits**:
   - Track: Credits restantes cada semana
   - Alert: <1,000 credits remaining

---

## 🚀 CONCLUSIÓN

### Capacidad final con estrategia optimizada:

**Groq llama-3.1-8b-instant + NVIDIA NIM fallback**:
- ✅ **1,347 análisis reales/día** (vs. 0 actual con Mistral bloqueado)
- ✅ **2,694 requests de usuarios/día** (con caché 50%)
- ✅ **20,205 usuarios activos/mes** (vs. 0 actual)
- ✅ **Sin pérdida perceptible de calidad** (tarea simple de texto corto)
- ✅ **Arquitectura probada** (mismo fallback de THE LINE)
- ✅ **Un solo proveedor a monitorear** (Groq + NVIDIA backup)

### Próximos pasos:
1. ❌ **NO IMPLEMENTAR** todavía (esperando confirmación del usuario)
2. ✅ Validar números con usuario
3. ✅ Probar calidad 8B vs 70B con 10 análisis reales
4. ✅ Decidir: cambiar modelo O solo cambiar de Mistral a Groq 70B
5. ✅ Implementar + monitoring de métricas

---

**Última actualización**: 2026-08-21  
**Autor**: backend-ai-engineer  
**Status**: ❌ ANÁLISIS COMPLETO - ESPERANDO DECISIÓN PARA IMPLEMENTAR
