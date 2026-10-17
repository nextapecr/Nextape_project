# Configuración de Modelos Groq para Timeline

## Resumen

Las preguntas de **The LINE** (pruebas técnicas de timeline) se generan con modelos de Groq configurados en `.env.local`. El sistema implementa un fallback automático con dos modelos que tienen **límites independientes** en Groq.

## Modelos Configurados

### Modelo Primario: `qwen/qwen3.8-27b`

- **RPD (Requests per Day)**: 1,000 requests/día
- **TPD (Tokens per Day)**: 200,000 tokens/día
- **RPM (Requests per Minute)**: 30 requests/minuto
- **TPM (Tokens per Minute)**: 8,000 tokens/minuto
- **Ventaja**: Excelente adherencia a formato JSON estructurado + modelo Qwen robusto

### Modelo Fallback: `openai/gpt-oss-120b`

- **RPD**: 1,000 requests/día
- **TPD**: 200,000 tokens/día
- **RPM**: 30 requests/minuto
- **TPM**: 8,000 tokens/minuto
- **Ventaja**: Arquitectura GPT muy robusta para JSON + límites independientes

> **Nota**: Llama 3.1 8B y 3.3 70B fueron movidos a Enterprise tier (agosto 2026) y ya no están disponibles en el free tier. Los modelos GPT-OSS y Qwen son las mejores opciones actuales para generación de JSON en el tier gratuito.

## Variables de Entorno

En `.env.local`:

```bash
# Groq Models for Timeline Questions
# Primary: Qwen 3.8-27B (1K RPD, 200K TPD) - excelente para JSON estructurado
GROQ_TIMELINE_MODEL_PRIMARY=qwen/qwen3.8-27b
# Fallback: GPT-OSS 120B (1K RPD, 200K TPD) - GPT architecture backup
GROQ_TIMELINE_MODEL_FALLBACK=openai/gpt-oss-120b
```

## Límites Independientes por Modelo

**IMPORTANTE**: Los límites de Groq son **POR MODELO**, no compartidos por cuenta.

Esto significa:
- Si agotas los 14,400 requests del modelo primario (Llama 86M), el fallback (GPT-OSS 120B) tiene sus propios 1,000 requests frescos disponibles
- Los límites de tokens tampoco se comparten
- Puedes usar ambos modelos simultáneamente sin afectar los límites del otro

Ejemplo práctico:
```
Día 1, 10:00 AM:
- Qwen 3.8-27B: 1,000 requests disponibles
- GPT-OSS 120B: 1,000 requests disponibles

Día 1, 11:00 AM (después de usar todo el primario):
- Qwen 3.8-27B: 0 requests disponibles ❌
- GPT-OSS 120B: 1,000 requests disponibles ✅ (¡no se ha tocado!)
```

## Comportamiento del Fallback

### 1. Generación Normal
```typescript
// Primera llamada: usa modelo primario
const result = await generateJsonWithFallback(prompt, schema);
// result.model === 'primary'
// Modelo usado: qwen/qwen3.8-27b
```

### 2. Detección de Rate Limit
```typescript
// Si el modelo primario alcanza el rate limit...
// ⚠️ qwen/qwen3.8-27b rate limit alcanzado
// → cambiando a openai/gpt-oss-120b para esta sesión...

const result = await generateJsonWithFallback(prompt, schema);
// result.model === 'fallback'
// Modelo usado: openai/gpt-oss-120b
```

### 3. Persistencia del Estado
Una vez que se detecta el rate limit en el modelo primario:
- **Todas** las llamadas subsiguientes en esa sesión usan el fallback directamente
- No se pierde tiempo reintentando el primario en cada llamada
- El estado persiste hasta que se reinicia el servidor/proceso

## Errores que Activan el Fallback

El sistema cambia al modelo fallback cuando detecta:

1. **Rate Limit (HTTP 429)**
   - "rate limit exceeded"
   - "too many requests"
   - "quota exceeded"

2. **API Key Inválida/Revocada (401/403)**
   - "invalid api key"
   - "unauthorized"

3. **Modelo No Disponible (404/410)**
   - "model not found"
   - "end of life"
   - "decommissioned"

## Scripts de Prueba

### Test del Sistema de Fallback
```bash
npm run test:timeline-models
```

Este script:
- Verifica la configuración de los modelos
- Genera preguntas de prueba con el sistema de fallback
- Muestra métricas de tokens y duración
- Valida que el estado persiste entre llamadas

### Seed de Preguntas (Producción)
```bash
# Dry run (solo planificación)
npm run seed:questions -- --dry-run

# Generar para frontend
npm run seed:questions -- --category=frontend --yes

# Generar todo el catálogo
npm run seed:questions -- --yes

# Ampliar lo existente hasta 50 preguntas
npm run seed:questions -- --top-up --target=50 --yes
```

## Logs de Generación

Durante la generación, verás logs como:

```
[1/150] 🤖 typescript_junior — generando (TypeScript, junior)...
   ⏳ Generando tipo 'multiple_choice' (8 preguntas)...
   ✅ Completado tipo 'multiple_choice': 8 preguntas (modelo: qwen3.8-27b [primary])
   ⏳ Generando tipo 'true_false' (5 preguntas)...
   ✅ Completado tipo 'true_false': 5 preguntas (modelo: qwen3.8-27b [primary])
```

Si se activa el fallback:
```
[ai/generate] ⚠️ qwen/qwen3.8-27b rate limit alcanzado
              → cambiando a openai/gpt-oss-120b para esta sesión...
   ✅ Completado tipo 'code_output': 4 preguntas (modelo: gpt-oss-120b [fallback])
```

## Métricas de Uso

Cada generación reporta:
- **Prompt tokens**: tokens de entrada (prompt + contexto)
- **Completion tokens**: tokens generados por el modelo
- **Total tokens**: suma de entrada + salida
- **Reasoning tokens**: (solo GPT-OSS con reasoning_effort)

Ejemplo:
```typescript
{
  data: { questions: [...] },
  model: 'primary',
  usage: {
    promptTokens: 1250,
    completionTokens: 3800,
    totalTokens: 5050
  }
}
```

## Cambiar los Modelos

Para usar otros modelos de Groq, actualiza `.env.local`:

```bash
# Ejemplo: usar Qwen y Llama como alternativa
GROQ_TIMELINE_MODEL_PRIMARY=qwen/qwen3.8-27b
GROQ_TIMELINE_MODEL_FALLBACK=meta-llama/llama-prompt-guard-2-22m
```

Consulta los límites actualizados en: https://console.groq.com/docs/rate-limits

## Mejores Prácticas

1. **Monitorear el uso**: los logs muestran qué modelo se usó en cada llamada
2. **Elegir horarios de menor uso**: evita ejecutar seeds masivos en horas pico
3. **Usar --delay**: añade pausas entre llamadas para distribuir la carga
   ```bash
   npm run seed:questions -- --delay=2000 --yes
   ```
4. **Generar por categorías**: divide el trabajo en tandas más pequeñas
   ```bash
   npm run seed:questions -- --category=frontend --yes
   npm run seed:questions -- --category=backend --yes
   ```

## Troubleshooting

### Error: "GROQ_API_KEY no definida"
```bash
# Verifica que está en .env.local
cat .env.local | grep GROQ_API_KEY

# Debe mostrar algo como:
# GROQ_API_KEY=gsk_...
```

### Error: "Rate limit exceeded" en ambos modelos
Si agotaste ambos modelos en el mismo día:
- Espera a que se reseteen los límites diarios (medianoche UTC)
- O considera el plan de pago de Groq para límites más altos

### El modelo primario no funciona pero el fallback sí
Verifica que el nombre del modelo primario sea correcto:
```bash
# Debe ser exactamente:
qwen/qwen3.8-27b

# NO:
qwen3.8-27b              # ❌ falta el prefijo qwen/
groq/qwen/qwen3.8-27b    # ❌ groq/ se agrega automáticamente
```

## Referencias

- [Documentación de Rate Limits de Groq](https://console.groq.com/docs/rate-limits)
- [Modelos Disponibles en Groq](https://console.groq.com/docs/models)
- [API Keys de Groq](https://console.groq.com/keys)
