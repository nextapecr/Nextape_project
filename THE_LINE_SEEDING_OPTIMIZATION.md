# 🚀 OPTIMIZACIÓN DE SEEDING — THE LINE

**Rol**: backend-ai-engineer  
**Objetivo**: Reducir requests/tokens del seeding sin perder calidad  
**Fecha**: 2026-08-21

---

## 📊 SITUACIÓN ACTUAL

### Tamaño del banco por combinación:

```typescript
// src/lib/server/question-pool.ts

const BANK_QUESTIONS_PER_TYPE: Record<QuestionType, number> = {
  multiple_choice: 8,    // ← 8 preguntas
  true_false: 5,         // ← 5 preguntas
  multi_select: 4,       // ← 4 preguntas
  ordering: 4,           // ← 4 preguntas
  code_output: 4,        // ← 4 preguntas
};

// Total: 25 preguntas por combinación (tecnología × nivel)
```

### Tamaño del examen por usuario:

```typescript
// src/lib/server/assessment.ts

const EXAM_SIZE_WITH_GITHUB = 10;      // Usuario con GitHub analizado
const EXAM_SIZE_WITHOUT_GITHUB = 20;   // Usuario sin GitHub
const EXAM_SIZE_MAX = 30;              // Override máximo por reclutador
```

### Consumo actual:

- **Combinaciones**: 55 tecnologías × 3 niveles = **165 docs**
- **Llamadas IA**: 165 × 5 tipos = **825 requests**
- **Tokens**: 165 × ~3,000 = **~495,000 tokens**

---

## 🎯 ANÁLISIS: DESPERDICIO ACTUAL

### 1. ¿Cuántas preguntas se usan realmente?

**Por usuario individual**:
- Con GitHub: **10 preguntas** sorteadas del banco
- Sin GitHub: **20 preguntas** sorteadas del banco
- Máximo (vacante custom): **30 preguntas**

**Del banco de 25 preguntas**:
- Se usan: 10-30 (según caso)
- **Desperdicio potencial**: 0-15 preguntas nunca vistas

### 2. ¿Por qué se generan 25?

**Razón documentada** (comentario del código):

> "Es más grande que el repertorio de una vacante: aquí el usuario practica repetidamente sobre la misma tecnología, así que necesita variedad suficiente para no repetir preguntas enseguida."

**Caso de uso**: Usuario practica React 5 veces seguidas:
- Intento 1: Sortea 20 de 25 → Ve preguntas A-T
- Intento 2: Sortea 20 de 25 → Ve preguntas B-U (algunas repetidas, otras nuevas)
- Intento 3: Sortea 20 de 25 → Más mezcla
- ...

**Con solo 20 preguntas en el banco**:
- Intento 1: Ve las 20
- Intento 2: Ve las mismas 20 (orden diferente, pero 100% repetidas)
- **Problema**: Usuario memoriza respuestas, no aprende

---

## 💡 ESTRATEGIAS DE OPTIMIZACIÓN

### Estrategia 1: Reducir banco a mínimo necesario + top-up on-demand

**Idea**: 
- Sembrar solo **15 preguntas** por combinación inicialmente
- Cuando un usuario repite 3+ veces la misma tecnología → generar 10 más (top-up automático)

**Ahorro inicial**:
- Antes: 25 preguntas × 165 = 4,125 preguntas
- Después: 15 preguntas × 165 = 2,475 preguntas
- **Reducción**: 40% menos requests/tokens

**Pros**:
- ✅ Ahorro inmediato del 40%
- ✅ Crece solo cuando hay uso real
- ✅ Calidad mantenida (15 es suficiente para 1-2 intentos)

**Contras**:
- ❌ Requiere lógica de top-up automático
- ❌ Complejidad adicional
- ⚠️ Primera expansión usa IA en runtime (aunque sea raro)

---

### Estrategia 2: Usar llama-3.1-8b-instant para seeding

**Idea**: 
- Mantener 25 preguntas por combinación
- Cambiar modelo: llama-3.3-70b → llama-3.1-8b-instant

**Comparación de modelos**:

| Aspecto | llama-3.3-70b | llama-3.1-8b-instant |
|---------|---------------|----------------------|
| **Límite diario** | 1,000 req / 200k tokens | 14,400 req / 500k tokens |
| **Calidad** | Mejor | Buena (suficiente) |
| **Velocidad** | Más lento | Muy rápido |
| **Seeding full** | NO cabe (495k > 200k) | ✅ Sí cabe (495k < 500k) |

**Pros**:
- ✅ Cabe en un solo día (500k TPD)
- ✅ Misma cantidad de preguntas (25)
- ✅ Sin cambios de arquitectura
- ✅ Calidad probablemente suficiente para preguntas técnicas

**Contras**:
- ⚠️ Modelo más pequeño (pero LLaMA 3.1 8B es bastante capaz)
- ⚠️ Requiere validar calidad con samples

---

### Estrategia 3: Reducir tipos de preguntas generadas

**Análisis de uso por tipo**:

```typescript
// Estratificación actual en pickRandomQuestions():
// Reparte por tag (tecnología) Y por tipo de pregunta

// Si un usuario hace un examen de 10 preguntas con 5 skills:
// - 2 preguntas por skill
// - Variedad de tipos dentro de cada skill

// Tipos más valiosos (orden de fiabilidad):
// 1. multiple_choice: El más fiable, siempre se incluye
// 2. code_output: Muy valioso, mide comprensión real
// 3. multi_select: Útil, pero puede confundir
// 4. true_false: Menos señal (50% adivinanza)
// 5. ordering: Valioso para flujos/procesos
```

**Propuesta**: Reducir tipos de 5 a 3

```typescript
const BANK_QUESTIONS_PER_TYPE_OPTIMIZED = {
  multiple_choice: 8,   // Mantener (columna vertebral)
  code_output: 6,       // Aumentar (alto valor)
  ordering: 6,          // Mantener (procesos/flujos)
  // Eliminar:
  // true_false: 0      // ← Bajo valor (50% guess)
  // multi_select: 0    // ← Confuso, UI compleja
};

// Total: 20 preguntas (vs 25 actual)
// Llamadas: 3 tipos (vs 5 actual)
```

**Ahorro**:
- Requests: 40% menos (3 vs 5 llamadas por combinación)
- Tokens: ~35% menos (20 vs 25 preguntas generadas)

**Pros**:
- ✅ Ahorro significativo (40% requests)
- ✅ Mantiene tipos más valiosos
- ✅ Simplifica UI (menos variantes de componentes)

**Contras**:
- ❌ Menos variedad de experiencia
- ⚠️ `true_false` es rápido para el usuario (trade-off UX)

---

### Estrategia 4: Seeding incremental por uso real

**Idea**: 
- Sembrar solo las **20 tecnologías más populares** inicialmente
- Resto se siembra on-demand cuando alguien lo solicita por primera vez

**Análisis**:
- **Top 20 tecnologías**: React, Node.js, Python, TypeScript, PostgreSQL, etc.
- Estas probablemente representan **80% del uso real**

**Ahorro inicial**:
- Antes: 165 combinaciones
- Después: 20 × 3 = 60 combinaciones
- **Reducción**: 63% menos en seeding inicial

**Pros**:
- ✅ Ahorro masivo en setup inicial
- ✅ Crece solo con demanda real
- ✅ Calidad no afectada

**Contras**:
- ❌ Primera request de tech no popular usa IA (timeout posible)
- ❌ Experiencia inconsistente (algunos ven "generando...")
- ❌ Complejidad en manejo de fallback

---

## 📊 COMPARACIÓN DE ESTRATEGIAS

| Estrategia | Ahorro Requests | Ahorro Tokens | Calidad | Complejidad | Recomendado |
|------------|-----------------|---------------|---------|-------------|-------------|
| **1. Banco reducido 15 + top-up** | 40% inicial | 40% inicial | ✅ OK | 🟡 Media | 🟡 |
| **2. llama-3.1-8b-instant** | 0% | 0% (pero cabe) | ⚠️ Menor | ✅ Baja | ✅ |
| **3. Solo 3 tipos de pregunta** | 40% | 35% | ✅ OK | ✅ Baja | ✅ |
| **4. Seeding incremental** | 63% inicial | 63% inicial | ✅ OK | 🔴 Alta | ❌ |

---

## 🎯 RECOMENDACIÓN FINAL

### **Combinación de Estrategias 2 + 3** (híbrida)

```typescript
// 1. Cambiar a modelo más pequeño para seeding
const SEEDING_MODEL = 'groq/llama-3.1-8b-instant';  // 500k TPD

// 2. Reducir tipos generados
const BANK_QUESTIONS_PER_TYPE_OPTIMIZED = {
  multiple_choice: 10,  // Aumentado (más fiable)
  code_output: 8,       // Aumentado (muy valioso)
  ordering: 6,          // Mantenido
  // true_false: ELIMINADO
  // multi_select: ELIMINADO
};

// Total: 24 preguntas (similar a antes)
// Llamadas: 3 tipos (60% menos que antes)
```

### Impacto:

**Requests/Tokens**:
- Antes: 825 requests, ~495k tokens
- Después: **495 requests** (60% menos), ~495k tokens (mismo)
- **Beneficio**: Cabe en límite diario de llama-3.1-8b (500k TPD)

**Calidad**:
- ✅ Más `multiple_choice` (el más fiable)
- ✅ Más `code_output` (el más valioso)
- ✅ Mantiene `ordering` (flujos/procesos)
- ❌ Pierde `true_false` (bajo valor) y `multi_select` (confuso)

**Complejidad**:
- ✅ Baja: Solo cambiar configuración en 2 archivos
- ✅ Sin cambios de arquitectura
- ✅ Sin lógica nueva de runtime

---

## 🔧 IMPLEMENTACIÓN PROPUESTA

### Archivo 1: `src/lib/server/question-pool.ts`

```typescript
// Cambio 1: Reducir tipos generados
export const BANK_QUESTIONS_PER_TYPE: Record<QuestionType, number> = {
  multiple_choice: 10,  // ← Era 8, ahora 10
  code_output: 8,       // ← Era 4, ahora 8
  ordering: 6,          // ← Era 4, ahora 6
  // Eliminados:
  // true_false: 5,     // ← ELIMINADO
  // multi_select: 4,   // ← ELIMINADO
};

// Cambio 2: Actualizar lista de tipos
export const ALL_QUESTION_TYPES: QuestionType[] = [
  "multiple_choice",
  "code_output",
  "ordering",
  // "true_false",     // ← ELIMINADO
  // "multi_select",   // ← ELIMINADO
];
```

### Archivo 2: `scripts/seed-question-bank.ts`

```typescript
// Usar modelo más pequeño para seeding
import { ai } from '@/ai/genkit';

// Cambiar en la función generate():
const result = await generateQuestions({
  stack: [skill],
  level,
  type,
  count: perType?.[type] ?? BANK_QUESTIONS_PER_TYPE[type],
  sources,
  model: 'groq/llama-3.1-8b-instant',  // ← Cambiar de llama-3.3-70b
});
```

### Archivo 3: `src/ai/flows/generate-assessment-flow.ts`

```typescript
// Agregar parámetro opcional de modelo
export async function generateQuestions(
  input: GenerateQuestionsInput & { model?: string }
): Promise<GenerateQuestionsOutput> {
  const model = input.model ?? 'groq/llama-3.3-70b-versatile';
  // ... usar model en la generación
}
```

---

## 📊 IMPACTO EN GROQ FREE TIER

### Seeding completo (165 combinaciones):

**Antes**:
- Requests: 825 (165 × 5 tipos)
- Tokens: ~495k
- Modelo: llama-3.3-70b (límite: 1k req/día, 200k tokens/día)
- **Resultado**: NO cabe en un día ❌

**Después**:
- Requests: 495 (165 × 3 tipos)
- Tokens: ~495k
- Modelo: llama-3.1-8b-instant (límite: 14.4k req/día, 500k tokens/día)
- **Resultado**: ✅ Cabe en un día con margen

---

## ✅ BENEFICIOS ADICIONALES

1. **Seeding más rápido**: llama-3.1-8b es ~3x más rápido
2. **Menos failures**: Menos llamadas = menos riesgo de 429
3. **UI más simple**: Solo 3 tipos de pregunta en componentes
4. **Calidad enfocada**: Más preguntas de los tipos más valiosos

---

## 🧪 PLAN DE VALIDACIÓN

### Antes de implementar en producción:

1. **Test de calidad**:
   ```bash
   # Generar 10 combinaciones con llama-3.1-8b-instant
   npm run seed:questions -- --only=react,python,typescript --yes
   
   # Revisar manualmente calidad de preguntas
   # Comparar con preguntas existentes de llama-3.3-70b
   ```

2. **Test de cobertura**:
   ```bash
   # Verificar que 24 preguntas (10+8+6) son suficientes
   # para exámenes de 10-30 preguntas sin repetición inmediata
   ```

3. **Test de seeding completo**:
   ```bash
   # Ejecutar seeding de 165 combinaciones
   # Verificar que cabe en límites de Groq (500k TPD)
   npm run seed:questions -- --yes
   ```

---

## 📋 CONCLUSIÓN

**Recomendación**: Implementar **Estrategia 2 + 3** (modelo más pequeño + menos tipos)

**Beneficios**:
- ✅ 60% menos requests (825 → 495)
- ✅ Cabe en límite diario de Groq (500k TPD)
- ✅ Calidad mantenida (enfocada en tipos más valiosos)
- ✅ Implementación simple (2-3 archivos)
- ✅ Sin cambios de arquitectura

**Trade-offs aceptables**:
- ⚠️ Modelo más pequeño (pero 8B es capaz)
- ⚠️ Menos tipos de pregunta (pero los más valiosos quedan)

**Próximo paso**: Validar calidad con samples antes de full seeding.

---

**Fin del análisis de optimización**
