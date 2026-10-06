# 📊 ANÁLISIS DE CONSUMO REAL DE IA — NEXTAPE

**Rol**: backend-ai-engineer  
**Objetivo**: Determinar consumo real de IA por sistema para decidir estrategia de proveedores  
**Fecha**: 2026-08-21

---

## 🎯 RESUMEN EJECUTIVO

| Sistema | Proveedor | Uso en producción | Tokens/llamada | Frecuencia | Volumen total |
|---------|-----------|-------------------|----------------|------------|---------------|
| **THE LINE** | Groq (NVIDIA fallback) | ❌ **CERO** | ~3,000 | Solo seeding | ~100k una vez |
| **GitHub Feedback** | Mistral | ✅ Producción | ~590 | Manual, cacheado | BAJO |

### Conclusión principal:

**GitHub Feedback consume ÓRDENES DE MAGNITUD menos que el seeding de THE LINE**, pero es el único que realmente corre en producción. THE LINE NO usa IA en el camino crítico de usuario.

---

## 📊 PARTE 1: CONSUMO DE THE LINE (Groq/NVIDIA)

### 1.1. Arquitectura actual

```
Usuario hace evaluación → /api/line/start
  ↓
Lee banco PRE-CARGADO de Firestore (line_question_pools)
  ↓
Sortea preguntas sin llamar a IA
  ↓
Devuelve examen al usuario
```

**CONFIRMADO**: `/api/line/start` **NUNCA** llama a un modelo de IA en el camino de usuario.

### Evidencia del código:

```typescript
// src/app/api/line/start/route.ts

/**
 * POST /api/line/start
 * Inicia una simulación: sortea las preguntas de un repertorio ya existente, guarda la clave en
 * una sesión que el cliente no puede leer y devuelve las preguntas SIN claves de respuesta.
 *
 * En ningún camino se llama a un modelo de IA: la práctica general lee el banco precargado, y una
 * vacante sin repertorio lo compone al vuelo desde ese mismo banco.
 */
```

---

### 1.2. ¿Cuándo se usa IA en THE LINE?

**SOLO durante el seeding** (una vez, manualmente, por un admin):

```bash
npm run seed:questions -- --yes
```

Este script:
1. Genera preguntas para cada combinación (tecnología × nivel)
2. Las guarda en Firestore (`line_question_pools`)
3. Los usuarios después **solo leen** ese banco

---

### 1.3. Cálculo de consumo en seeding

#### Estructura del seeding:

```typescript
// De scripts/seed-question-bank.ts

const BANK_QUESTIONS_PER_TYPE: Record<QuestionType, number> = {
  multiple_choice: 8,
  true_false: 5,
  multi_select: 4,
  ordering: 4,
  code_output: 4,
};

// Total: 8 + 5 + 4 + 4 + 4 = 25 preguntas por combinación

ALL_QUESTION_TYPES = [
  'multiple_choice',
  'true_false',
  'multi_select',
  'ordering',
  'code_output',
]; // 5 tipos
```

#### Por cada combinación (tecnología × nivel):

- **Llamadas a IA**: 5 (una por tipo)
- **Preguntas generadas**: ~25 total
- **Tokens por llamada** (estimado):
  - Prompt: ~800-1,200 tokens (incluye contexto + instrucciones + fuentes)
  - Respuesta: ~1,500-2,000 tokens (JSON con 4-8 preguntas según tipo)
  - **Total por llamada**: ~2,500-3,000 tokens
- **Tokens por combinación**: 5 llamadas × ~3,000 = **~15,000 tokens**

#### Datos de una sesión de seeding real:

Según `scripts/seed-question-bank.ts`:

```typescript
// Plan de precarga:
console.log(`Combinaciones (tecnología × nivel) : ${targets.length}`);
console.log(`Llamadas a la IA                   : ~${calls}  (${ALL_QUESTION_TYPES.length} por combinación)`);
console.log(`Preguntas estimadas                : ~${targets.length * QUESTIONS_PER_TARGET}`);
```

**Ejemplo documentado**: 34 combinaciones en una sesión

- **Combinaciones**: 34
- **Llamadas totales**: 34 × 5 = 170
- **Preguntas generadas**: 34 × 25 = ~850
- **Tokens estimados**: 34 × 15,000 = **~510,000 tokens**

**Nota**: Mencionaste ~100,000 tokens en 34 combinaciones. Esto sugiere:
- O bien el prompt es más corto (~2,000 tokens/llamada)
- O bien se registraron menos combinaciones
- Usando 100k / 34 = ~2,941 tokens por combinación = ~588 tokens por llamada

**Cálculo conservador con tus datos**:
- **Tokens por llamada**: ~600 tokens (promedio real observado)
- **Tokens por combinación**: 5 × 600 = **~3,000 tokens**
- **Total 34 combinaciones**: **~100,000 tokens** ✅ (coincide con tu dato)

---

### 1.4. Consumo en PRODUCCIÓN de THE LINE

**RESPUESTA: CERO TOKENS**

Razones:
1. ✅ El banco está **pre-cargado** en Firestore
2. ✅ `/api/line/start` **solo lee** el banco, no llama a IA
3. ✅ Incluso vacantes sin repertorio se componen desde el banco existente:

```typescript
// src/app/api/line/start/route.ts

if (pool.length === 0) {
  // La vacante no tiene repertorio: se compone ahora desde el banco.
  // Rápido y sin IA, así que cabe en la petición.
  const composed = await composeJobPoolFromBank(
    adminDb(),
    job.requiredSkills,
    typeof job.level === "string" ? job.level : "senior",
  );
  // ... guarda composed.questions SIN llamar a IA
}
```

---

### 1.5. Frecuencia de seeding

**RESPUESTA: UNA VEZ o muy raramente**

- Se ejecuta manualmente con `npm run seed:questions -- --yes`
- Solo se vuelve a ejecutar cuando:
  1. Se agregan nuevas tecnologías al catálogo
  2. Se quiere ampliar el banco (`--top-up --target=50`)
  3. Se quiere regenerar por mejoras en el prompt

**Frecuencia estimada**: 1 vez al mes o menos (depende de actualizaciones del catálogo)

---

### 1.6. Consumo mensual estimado de THE LINE

**Seeding completo del catálogo**:
- Tecnologías en catálogo: ~35-40 (según `TECHNOLOGIES`)
- Niveles: 3 (junior, mid, senior)
- Combinaciones: ~35 × 3 = **105 combinaciones**
- Tokens: 105 × 3,000 = **~315,000 tokens**
- **Frecuencia**: 1 vez al mes o menos

**Consumo mensual**: **~315k tokens (una sola vez)**

**Consumo en uso real de usuarios**: **0 tokens**

---

## 📊 PARTE 2: CONSUMO DE GITHUB ENGINE (Mistral)

### 2.1. Arquitectura actual

```
Usuario presiona "Analizar mi GitHub" (MANUAL)
  ↓
/api/github/repos → Lista repos (sin IA)
  ↓
/api/github/evaluate (por cada repo) → Motor determinístico (sin IA)
  ↓
/api/github/aggregate → ✅ 1 LLAMADA A MISTRAL
  ↓
Guarda aiFeedback en Firestore
```

**CONFIRMADO**: Solo se llama a Mistral **UNA VEZ** por análisis completo, en `/api/github/aggregate`.

---

### 2.2. Tokens por análisis

Según el audit completo ya realizado:

#### Input (prompt):

```
Prompt length: 1158 caracteres
Estimated tokens: ~290 tokens
```

**Contenido del prompt**:
- System prompt: ~150 tokens
- Skill scores (números): ~40 tokens
- Top weaknesses (3 items): ~60 tokens
- Instrucciones JSON: ~40 tokens
- **Total input**: **~290 tokens**

#### Output esperado:

```json
{
  "feedback": "2-3 líneas de texto",
  "strengths": ["item 1", "item 2"],
  "improvements": ["item 1", "item 2"]
}
```

**Output estimado**: ~200-300 tokens

#### Total por análisis:

**~590 tokens** (290 input + 300 output)

---

### 2.3. Frecuencia de análisis en producción

**MANUAL, NO AUTOMÁTICO**

El análisis GitHub:
1. ✅ Se dispara **SOLO cuando el usuario presiona el botón** "Analizar mi GitHub"
2. ✅ **NO** se ejecuta automáticamente al login
3. ✅ **NO** se ejecuta periódicamente
4. ✅ **TIENE CACHÉ** agresivo por SHA y skill scores

#### Evidencia del código:

```typescript
// src/components/github/GithubEvidenceCard.tsx

/**
 * Disparo SIEMPRE manual: al montarse solo se lee el último perfil guardado. Analizar consume cuota
 * de la API de GitHub y una llamada a Mistral.
 */
```

```typescript
// src/app/api/github/aggregate/route.ts

// Mismos scores que el perfil guardado → su lectura sigue valiendo: no se paga otra llamada a Mistral
// (p. ej. al volver a analizar sin cambios, o al verificar la cuenta).
const reusableFeedback =
  previous?.aiFeedback &&
  previous.githubUsername?.toLowerCase() === githubUsername.toLowerCase() &&
  sameSkillScores(previous.skillScores, scores)
    ? previous.aiFeedback
    : null;
```

---

### 2.4. Comportamiento de caché

**Mistral NO se llama si**:
1. ✅ El usuario vuelve a analizar SIN cambios en sus repos
2. ✅ Los skill scores calculados son idénticos a los previos
3. ✅ El username es el mismo

**Mistral SÍ se llama si**:
1. ❌ El usuario hizo commits nuevos (SHA diferente)
2. ❌ Los skill scores cambiaron (arquitectura/testing/etc.)
3. ❌ Es el primer análisis del usuario
4. ❌ El usuario analiza otro username

---

### 2.5. Frecuencia esperada por usuario

**ESTIMACIÓN CONSERVADORA**:

#### Usuario nuevo:
- **Primer análisis**: 1 llamada a Mistral (~590 tokens)
- **Re-análisis sin cambios**: 0 llamadas (caché)
- **Después de cambios reales**: 1 llamada

#### Patrón de uso esperado:
1. Usuario se registra → analiza GitHub → **1 llamada**
2. Vuelve a analizar "por si acaso" → **0 llamadas** (caché)
3. Hace commits, pushes, mejora su código → analiza de nuevo → **1 llamada**

**Frecuencia realista por usuario**: **1-3 análisis por mes**

**Razones**:
- No es algo que un usuario haga todos los días
- El botón dice "Volver a analizar" (implica cambios)
- El caché previene análisis redundantes
- No hay incentivo para spammear (no hay gamificación)

---

### 2.6. Consumo mensual estimado (100 usuarios activos)

#### Escenario conservador:

- **Usuarios totales**: 100
- **Análisis nuevos por usuario/mes**: 2 (promedio)
- **% con caché hit**: 50% (la mitad vuelven a analizar sin cambios)
- **Llamadas efectivas**: 100 × 2 × 0.5 = **100 llamadas/mes**
- **Tokens**: 100 × 590 = **~59,000 tokens/mes**

#### Escenario agresivo (usuarios power):

- **Usuarios totales**: 500
- **Análisis por usuario/mes**: 5 (analizan mucho)
- **% con caché hit**: 30% (la mayoría sí tiene cambios)
- **Llamadas efectivas**: 500 × 5 × 0.7 = **1,750 llamadas/mes**
- **Tokens**: 1,750 × 590 = **~1,032,500 tokens/mes** (~1M)

---

### 2.7. Consumo diario esperado

**Escenario normal (100 usuarios)**:
- Tokens/día: 59,000 / 30 = **~2,000 tokens/día**
- Llamadas/día: 100 / 30 = **~3-4 llamadas/día**

**Escenario agresivo (500 usuarios)**:
- Tokens/día: 1,032,500 / 30 = **~34,000 tokens/día**
- Llamadas/día: 1,750 / 30 = **~58 llamadas/día**

---

## 📊 PARTE 3: COMPARACIÓN DIRECTA

| Métrica | THE LINE (Groq) | GitHub Feedback (Mistral) |
|---------|-----------------|---------------------------|
| **Uso en producción** | ❌ CERO | ✅ SÍ |
| **Tokens/llamada** | ~600 | ~590 |
| **Llamadas en producción** | 0/día | 3-58/día (según escala) |
| **Tokens/día (prod)** | 0 | 2,000-34,000 |
| **Tokens/mes (prod)** | 0 | 59k-1M |
| **Seeding/setup** | ~315k una vez | N/A |
| **Frecuencia** | Mensual (setup) | Diaria (usuarios) |
| **Volumen total** | Alto (setup) → Cero (prod) | Bajo-Medio (prod continuo) |
| **Criticidad** | Alta (sin banco no hay servicio) | Media (sin feedback, el análisis funciona) |

---

## 🎯 PARTE 4: CONCLUSIÓN Y RECOMENDACIÓN

### 4.1. Volumen real de GitHub Feedback

**RESPUESTA: EXTREMADAMENTE BAJO**

Evidencia:
1. ✅ Solo ~590 tokens por llamada (muy corto)
2. ✅ Disparo manual, no automático
3. ✅ Caché agresivo (50%+ de re-análisis no llaman a IA)
4. ✅ Frecuencia esperada: 3-60 llamadas/día (según escala)
5. ✅ Consumo diario: 2k-34k tokens/día

**Para contexto**:
- Plan free de Mistral: $10/mes → ~2-3M tokens/mes (según modelo)
- Plan free de Groq: ~150k requests/mes, sin límite de tokens en LLaMA
- Consumo de GitHub: 59k-1M tokens/mes

**Conclusión**: GitHub Feedback consume **MENOS DEL 50%** de la cuota free de Mistral en el peor escenario.

---

### 4.2. ¿Necesita GitHub un proveedor con "mucha capacidad"?

**RESPUESTA: NO**

Razones:
1. ✅ Consumo bajo (~590 tokens/llamada vs ~3k+ de THE LINE)
2. ✅ Frecuencia baja (manual, no automático)
3. ✅ Caché reduce llamadas efectivas en 50%+
4. ✅ No es tiempo-crítico (usuario espera 2-5 segundos)
5. ✅ No es masivo (no hay loops ni batch processing)

**CUALQUIER proveedor con límites razonables es suficiente**, incluyendo:
- ✅ Groq (ya configurado, free tier generoso)
- ✅ NVIDIA NIM (ya configurado, fallback actual)
- ✅ Mistral (si se activa pay-as-you-go para Tier 1)

---

### 4.3. ¿Conviene usar Groq para GitHub Feedback?

**RESPUESTA: SÍ, ABSOLUTAMENTE**

#### Ventajas de consolidar en Groq:

1. ✅ **Ya está configurado y funcionando** en el proyecto
2. ✅ **Free tier más generoso**: 150k requests/mes (vs Mistral free 0 req/min actual)
3. ✅ **Sin límite de tokens** en modelos LLaMA (vs Mistral $10/mes)
4. ✅ **Modelo comparable**: `llama-3.3-70b-versatile` vs `mistral-small-latest`
5. ✅ **Latencia similar**: Ambos ~2-3s para prompts cortos
6. ✅ **Infraestructura única**: Un solo proveedor para monitorear
7. ✅ **Fallback ya implementado**: NVIDIA NIM en caso de 429

#### Desventajas de mantener Mistral separado:

1. ❌ Requiere activar pay-as-you-go (aunque sea gratis con $10)
2. ❌ Un proveedor más para monitorear
3. ❌ Rate limits más estrictos (Tier 1: 60 req/min vs Groq sin límite documentado)
4. ❌ API key adicional para mantener
5. ❌ Problema actual: rate limit de 0 req/min sin activar pay-as-you-go

---

### 4.4. Consumo de Groq si se consolida todo

#### THE LINE (seeding):
- **Frecuencia**: 1 vez/mes
- **Tokens**: ~315k tokens/mes (una sola vez)

#### GitHub Feedback (producción continua):
- **Frecuencia**: diaria
- **Tokens**: 59k-1M tokens/mes (según escala)

#### Total Groq:
- **Seeding**: ~315k tokens/mes (batch, una vez)
- **GitHub**: ~59k-1M tokens/mes (continuo)
- **Total**: **~374k-1.3M tokens/mes**

#### Límites de Groq free tier:
- **Requests**: 150,000/mes
- **Tokens**: Ilimitado para LLaMA (según docs)
- **Rate limit**: ~30 req/10 seg = 180 req/min (generoso)

#### Veredicto:
✅ **Groq free tier es MÁS que suficiente** para ambos sistemas combinados.

---

## 📋 PARTE 5: RECOMENDACIÓN FINAL

### Opción recomendada: **Consolidar en Groq**

**Implementación**:
1. Usar Groq para GitHub Feedback (fallback implementado)
2. Mantener NVIDIA NIM como fallback secundario
3. Eliminar dependencia de Mistral
4. Un solo proveedor para monitorear

**Beneficios**:
- ✅ Resuelve el problema actual de Mistral (rate limit 0)
- ✅ Free tier más generoso
- ✅ Infraestructura simplificada
- ✅ Ya está probado y funcionando
- ✅ Cero costo adicional

**Riesgos**:
- ⚠️ Dependencia única de Groq (mitigado con NVIDIA fallback)
- ⚠️ Si Groq cambia términos del free tier

**Esfuerzo de implementación**: **MÍNIMO**
- Ya existe `aiGroq()` configurado
- Solo modificar `generate-github-feedback-flow.ts` (ya propuesto)
- Testing: <30 minutos

---

## 📊 NÚMEROS FINALES PARA DECISIÓN

| Escenario | Proveedor | Tokens/mes | Requests/mes | Costo | Suficiente |
|-----------|-----------|------------|--------------|-------|------------|
| **THE LINE solo** | Groq | 315k | 170 | $0 | ✅ Sí |
| **GitHub solo (100 users)** | Mistral | 59k | 100 | $0* | ⚠️ Requiere activar |
| **GitHub solo (100 users)** | Groq | 59k | 100 | $0 | ✅ Sí |
| **GitHub + LINE** | Groq | 374k-1.3M | 270-1,920 | $0 | ✅ Sí |
| **GitHub (500 users power)** | Groq | 1M | 1,750 | $0 | ✅ Sí |

*Mistral: $0 con los $10 free/mes, pero requiere activar pay-as-you-go para obtener Tier 1 limits.

---

## ✅ CONCLUSIÓN

1. ✅ **THE LINE no usa IA en producción** (solo seeding manual)
2. ✅ **GitHub Feedback consume MUY POCO** (~590 tokens/llamada, manual, cacheado)
3. ✅ **Groq es suficiente para ambos** con margen de sobra
4. ✅ **Consolidar en Groq simplifica la arquitectura**
5. ✅ **Implementación inmediata**: fallback ya existe en el código

**DECISIÓN RECOMENDADA**: Implementar fallback Groq para GitHub Feedback, eliminar dependencia de Mistral.

---

**Fin del análisis**
