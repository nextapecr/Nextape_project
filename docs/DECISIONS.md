# Decisiones Técnicas del Proyecto

Este documento registra decisiones técnicas importantes tomadas durante el desarrollo, extraídas de auditorías y reportes de migración completados.

---

## GitHub Authentication: PAT → OAuth Per-User (Oct 2026)

**Decisión**: Migrar de Personal Access Token compartido a OAuth por usuario.

**Motivo**: 
- PAT compartido: 5,000 requests/hora para toda la plataforma (bottleneck crítico)
- OAuth per-user: 5,000 requests/hora POR usuario (escalable)
- Compliance: GDPR + SOC 2 requieren tokens individuales encriptados

**Implementación**:
- Tokens OAuth encriptados con AES-256-GCM (TOKEN_ENCRYPTION_KEY)
- Almacenados en `github_tokens/{uid}` (server-only collection)
- Flujo: Usuario conecta GitHub → token encriptado → API requests usan token individual

**Referencias**: PAT_REMOVAL_VERIFICATION_REPORT.md, GITHUB_OAUTH_PER_USER_DESIGN.md

**Fecha**: Oct 2026

---

## AI Provider: Groq GPT-OSS con Fallback Determinístico (Oct 2026)

**Decisión**: Usar Groq GPT-OSS (120B→20B) como proveedor principal para GitHub feedback con fallback determinístico.

**Motivo**:
- Mistral descartado: Rate limits extremos (8 TPM) bloqueaban producción
- Groq límites verificados: 8,000 TPM, 200,000 TPD (suficiente para producción)
- Llama 3.3 70B retirado del free tier (404 model_not_found)
- Qwen3.8-27B descartado: límite 1,000 OTPM bloquea consolidación

**Implementación**:
- Modelo primario: `groq/gpt-oss-120b-8k-20b` con `reasoning_effort: low`
- Modelo secundario: `groq/gpt-oss-20b-8k-fast`
- Fallback determinístico: Genera feedback desde `skillScores` y `topWeaknesses` cuando ambos modelos fallan
- Campo `source: 'ai' | 'deterministic'` permite distinguir en UI
- Token limit: 400 tokens para control de costos

**Referencias**: GROQ_120B_20B_FALLBACK_MIGRATION_REPORT.md, GITHUB_FEEDBACK_MIGRATION_REPORT.md, VERIFICACION_PREMISAS_MIGRACION.md

**Fecha**: Oct 2026

---

## NVIDIA como Provider: Descartado (Oct 2026)

**Decisión**: No usar NVIDIA NIM como proveedor de IA.

**Motivo**:
- Créditos gratuitos NO son renovables (one-time $10 USD)
- Modelo evaluado: `nvidia/llama-3.1-nemotron-70b-instruct` 
- No viable para producción a largo plazo sin inversión

**Referencias**: NVIDIA_VS_GROQ_MODEL_COMPARISON.md

**Fecha**: Oct 2026

---

## Mistral AI: Abandonado (Oct 2026)

**Decisión**: Abandonar Mistral AI como proveedor.

**Motivo**:
- Rate limit extremo: 8 TPM (tokens per minute) en free tier
- Bloquea análisis de GitHub: un solo análisis consume ~2K tokens
- Error frecuente: `429 Rate limit reached for requests`
- Groq ofrece 1000x más capacidad (8,000 TPM vs 8 TPM)

**Referencias**: MISTRAL_AUDIT_REPORT.md

**Fecha**: Oct 2026

---

## The LINE Seeding: No existe RAG Real (Oct 2026)

**Decisión**: Aceptar que el sistema de seeding de The LINE NO es un sistema RAG (Retrieval-Augmented Generation).

**Hallazgo verificado**:
- No hay embeddings ni búsqueda semántica
- Es scoring directo basado en reglas predefinidas
- Vocabulario tech en `the-line/tech-vocabulary.json` (112 items)
- Matching: coincidencia exacta o parcial de strings

**Implicación**:
- Bottleneck real: 8,000 TPM de Groq (no el "RAG inexistente")
- Mejoras futuras: batching, caching, optimización de prompts
- No intentar "arreglar el RAG" porque no existe

**Referencias**: THE_LINE_RAG_AUDIT_REPORT.md, SEEDING_OPTIMIZATION_REPORT.md

**Fecha**: Oct 2026

---

## GitHub API: GraphQL Batching con Aliases (Sep-Oct 2026)

**Decisión**: Usar GraphQL con aliases para reducir requests a GitHub API.

**Resultados medidos**:
- Antes (REST): ~522 requests por 100 repos
- Después (GraphQL): ~230 requests por 100 repos (56% reducción)
- Técnica: Aliases permiten consultar múltiples repos en una sola query
- Límite: 100 queries concurrentes (GitHub secondary rate limit)

**Implementación**:
- `src/services/github-engine/graphql-client.ts`
- Batches de hasta 50 repos por query
- Fallback a REST si GraphQL falla

**Referencias**: GITHUB_GRAPHQL_BATCHING_AUDIT.md, GITHUB_GRAPHQL_MIGRATION_POC.md

**Fecha**: Sep-Oct 2026

---

## Formato de Nuevas Decisiones

Al agregar decisiones futuras, usar este formato:

```markdown
## [Título Descriptivo] ([Mes Año])

**Decisión**: [Qué se decidió]

**Motivo**: 
- [Razón 1]
- [Razón 2]

**Implementación**: [Cómo se implementó, archivos clave]

**Referencias**: [Archivos de auditoría/diseño que documentaron esto]

**Fecha**: [Mes Año]
```

---

**Última actualización**: Diciembre 2026
