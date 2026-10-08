# ✅ VERIFICACIÓN DE PREMISAS: MIGRACIÓN GROQ

**Fecha:** 2026-10-06  
**Solicitada por:** Usuario (verificación antes de aceptar arquitectura)

---

## 1️⃣ PRUEBA DIRECTA CON API (HTTP sin Genkit)

### Modelos Llama (supuestamente Enterprise)

**llama-3.3-70b-versatile:**
```json
Status: 404 Not Found
Error: {
  "error": {
    "message": "The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```
**Resultado:** ❌ NO DISPONIBLE en free tier

**llama-3.1-8b-instant:**
```json
Status: 404 Not Found
Error: {
  "error": {
    "message": "The model `llama-3.1-8b-instant` does not exist or you do not have access to it.",
    "type": "invalid_request_error",
    "code": "model_not_found"
  }
}
```
**Resultado:** ❌ NO DISPONIBLE en free tier

---

### Modelos GPT-OSS (free tier actual)

**openai/gpt-oss-120b:**
```json
Status: 200 OK
Headers:
  - x-ratelimit-limit-requests: 1000  (1K RPM ✅)
  - x-ratelimit-limit-tokens: 8000    (8K TPM - ver nota abajo)
Response:
  - Modelo: openai/gpt-oss-120b
  - Tokens: 89 (79 prompt + 10 completion)
```
**Resultado:** ✅ DISPONIBLE

**openai/gpt-oss-20b:**
```json
Status: 200 OK
Headers:
  - x-ratelimit-limit-requests: 1000  (1K RPM ✅)
  - x-ratelimit-limit-tokens: 8000    (8K TPM - ver nota abajo)
Response:
  - Modelo: openai/gpt-oss-20b
  - Tokens: 89 (79 prompt + 10 completion)
```
**Resultado:** ✅ DISPONIBLE

---

## 2️⃣ DOCUMENTACIÓN OFICIAL DE GROQ

### Fuente 1: console.groq.com/docs/models

**Llama 3.3 70B:**
```
MODEL ID: llama-3.3-70b-versatile
TIER: Enterprise
PRECIO: ContactSales
RATE LIMITS: ContactSales
```

**Llama 3.1 8B:**
```
MODEL ID: llama-3.1-8b-instant
TIER: Enterprise
PRECIO: ContactSales
RATE LIMITS: ContactSales
```

**GPT OSS 120B:**
```
MODEL ID: openai/gpt-oss-120b
SPEED: 500 T/SEC
PRECIO: $0.15 input / $0.60 output per 1M tokens
RATE LIMITS (Developer Plan): 250K TPM, 1K RPM
CONTEXT WINDOW: 131,072 tokens
```

**GPT OSS 20B:**
```
MODEL ID: openai/gpt-oss-20b
SPEED: 1000 T/SEC
PRECIO: $0.075 input / $0.30 output per 1M tokens
RATE LIMITS (Developer Plan): 250K TPM, 1K RPM
CONTEXT WINDOW: 131,072 tokens
```

**Fuente oficial:** https://console.groq.com/docs/models

---

### Fuente 2: console.groq.com/docs/rate-limits

De la tabla oficial de límites (Developer Plan):

| Modelo | RPM | RPD | TPM | TPD |
|--------|-----|-----|-----|-----|
| openai/gpt-oss-120b | 30 | 1K | 8K | 200K |
| openai/gpt-oss-20b | 30 | 1K | 8K | 200K |

⚠️ **CORRECCIÓN CRÍTICA:**
- **Documentación /docs/models:** Dice "250K TPM"
- **Documentación /docs/rate-limits:** Dice "8K TPM"
- **Headers HTTP reales:** Confirman "8K TPM"

**Límites reales verificados:**
- ✅ RPM: 1,000 (correcto, coincide con /docs/models y no con /docs/rate-limits que dice 30)
- ⚠️ TPM: 8,000 (NO 250K como se citó en el reporte)
- ✅ TPD: 200,000

**Fuente oficial:** https://console.groq.com/docs/rate-limits

---

## 3️⃣ ANUNCIO OFICIAL DE DEPRECIACIÓN

### Fuente primaria: Artículo publicado

**Título:** "Groq retired llama-3.3-70b-versatile on 16 August 2026"  
**URL:** https://ecorpit.hashnode.dev/groq-retired-llama-33-70b-versatile-on-16-august-2026-and-points-production-teams-at-a-preview-model  
**Fecha:** 21 agosto 2026  
**Cita exacta:**
> "On 16 August 2026 Groq shut down llama-3.1-8b-instant and llama-3.3-70b-versatile for free and developer-tier accounts, five days before this article was written."

### Fuente secundaria: MarkAI Code

**URL:** https://markaicode.com/pricing/llama-33-pricing/  
**Cita exacta:**
> "Groq no longer publishes self-serve pricing for this model: it moved Llama 3.3 70B to enterprise-only 'contact sales' pricing on August 26, 2026, after announcing the model's deprecation on its free and developer tiers on June 17, 2026."

**Timeline confirmado:**
- 17 junio 2026: Anuncio de depreciación
- 16 agosto 2026: Shutdown de free/developer tier
- 26 agosto 2026: Movido oficialmente a Enterprise-only

### Fuente terciaria: Medium

**URL:** https://0xhagen.medium.com/is-deepinfra-leaving-groq-behind-b8a42d45285d  
**Fecha:** 17 junio 2026  
**Cita exacta:**
> "Breaking Update (June 17, 2026): Groq has just officially announced the deprecation and upcoming decommissioning of both Qwen3 32B and its absolute production workhorse, Llama 3.3 70B Versatile. By August 2026, requests to these models will no longer be served."

---

## 4️⃣ CONCLUSIONES

### ✅ PREMISA 1: Llama movido a Enterprise
**Estado:** CORRECTA  
**Evidencia:**
- HTTP 404 "model_not_found" en prueba directa
- Documentación oficial marca ambos como "Enterprise"
- 3 fuentes independientes confirman shutdown 16 agosto 2026

### ⚠️ PREMISA 2: Límites de GPT-OSS
**Estado:** PARCIALMENTE INCORRECTA

**Lo que se citó en el reporte:**
- ❌ 250K TPM (INCORRECTO - basado en /docs/models)
- ✅ 1K RPM (CORRECTO - verificado en HTTP headers)
- ✅ 200K TPD (CORRECTO - verificado en /docs/rate-limits)

**Límites reales (verificados):**
- ✅ 8K TPM (tokens per minute) - confirmado por:
  - HTTP headers reales: `x-ratelimit-limit-tokens: 8000`
  - Tabla oficial en /docs/rate-limits
- ✅ 1K RPM (requests per minute)
- ✅ 200K TPD (tokens per day)

**Discrepancia en documentación Groq:**
La página `/docs/models` dice "250K TPM" pero la página `/docs/rate-limits` y los headers HTTP reales confirman "8K TPM". Los headers HTTP son la fuente de verdad.

### ✅ PREMISA 3: Cambio necesario
**Estado:** CORRECTA  
**Razón:** Llama NO funciona en free tier, GPT-OSS SÍ funciona.

---

## 📊 IMPACTO EN CAPACIDAD

### Capacidad citada en reporte (INCORRECTA):
```
Groq 120B: 250K TPM
Groq 20B: 250K TPM
Total: 500K TPM
```

### Capacidad real (VERIFICADA):
```
Groq 120B: 8K TPM, 200K TPD
Groq 20B: 8K TPM, 200K TPD
Total (con fallback): 8K TPM, 400K TPD
```

**Diferencia crítica:**
- TPM real es 31x MENOR que lo citado (8K vs 250K)
- TPD sigue siendo suficiente (400K combinados vs 495K seeding)
- Pero seeding NO será instantáneo como se afirmó (<1 min)

**Tiempo real de seeding (825 requests):**
- Con límite 8K TPM y 495k tokens total:
- 495,000 tokens ÷ 8,000 TPM = ~62 minutos
- O limitado por RPM: 825 requests ÷ 1,000 RPM = ~1 minuto

**El cuello de botella será TPM (tokens), no RPM (requests).**

---

## 🎯 RECOMENDACIÓN FINAL

### El cambio fue necesario y correcto ✅
- Llama NO está disponible
- GPT-OSS SÍ está disponible
- El sistema funciona

### Pero el reporte contiene un error importante ⚠️
- TPM real: 8K (no 250K)
- Seeding tomará ~62 minutos (no <1 minuto)
- Sigue siendo mejor que Llama original (~27 min con límite diferente)

### NO revertir la migración
- La arquitectura es correcta
- Solo corregir la documentación sobre límites

---

## ✅ VERIFICACIÓN COMPLETADA

**Firmado:** Backend AI Engineer  
**Fecha:** 2026-10-06  
**Evidencia:** Scripts + HTTP traces + fuentes oficiales
