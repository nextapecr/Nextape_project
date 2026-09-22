# NEXTAPE — Arnés de ingeniería (harness)

> **Qué es este archivo.** El arnés con el que iteramos sobre este código usando agentes especializados:
> qué verifica cada iteración, quién toca qué, cuánto contexto lee cada agente y cómo se cierra el ciclo.
>
> Un arnés no es "usar IA para programar". Es el conjunto de **restricciones y verificaciones
> deterministas** que hacen que un agente pueda equivocarse **sin romper el sistema**. La calidad del
> resultado la fija el arnés, no el modelo.
>
> Contexto del sistema y estado real: [`CONTEXT.md`](./CONTEXT.md) (snapshot `main` @ `5e4beb7`) · Reglas vinculantes: [`/CLAUDE.md`](../CLAUDE.md)
> · Agentes actuales: [`.claude/agents/`](../.claude/agents/README.md)

---

## 1. Las tres invariantes

Todo el arnés existe para proteger estas tres. Un cambio que rompa cualquiera de ellas **se rechaza sin
discusión**, sin importar lo que aporte.

| # | Invariante | Cómo se verifica |
|---|---|---|
| **I1** | **Ninguna clave de respuesta** cruza la red hacia el cliente: `correctIndex`, `correctIndexes`, `correct`, `correctOrder` ni `source`. | Todo lo que sale de un route handler pasa por `stripAnswerKey()`, que construye la versión pública por **lista blanca** (no borrando campos). Al añadir un tipo de pregunta, añádelo a `toPublicQuestion` **y** al test que serializa los cinco tipos. |
| **I2** | Los datos verificados (DNA, intentos, matches, claves) se escriben **solo** con Admin SDK en `src/app/api/*`. | `firestore.rules` con `write: false` + cero imports del Web SDK en servidor. |
| **I3** | Toda colección nueva tiene su regla en `firestore.rules` **en el mismo commit**. | Diff review: `collection("X")` nuevo ⇒ `match /X/` nuevo. |

Si una tarea parece exigir romper una: **para y escala al equipo**. No la rompas "temporalmente".

---

## 2. Los gates de verificación

El ciclo de un agente **no se cierra** hasta que estos cuatro comandos pasan. Son el contrato objetivo
entre el agente y el repo.

```bash
npm run typecheck    # tsc --noEmit   → 0 errores. Bloqueante.
npm run lint         # eslint .       → 0 errores. Warnings: no subir de 14.
npm test             # vitest run     → 54 pass / 5 skipped. No bajar.
npm run build        # next build     → OK.
```

### ⚠️ Nunca borres `package-lock.json` para regenerarlo

Si hay que cambiar dependencias, edita `package.json` y ejecuta `npm install` **dejando el lockfile
en su sitio**, para que npm lo actualice de forma incremental.

Borrarlo y regenerarlo desde cero **rompe CI**: npm solo escribe en el lockfile nuevo los binarios
opcionales de la plataforma donde se ejecuta. Regenerado en macOS, el lockfile pierde
`@rollup/rollup-linux-x64-gnu` y compañía, y `npm ci` en los runners Linux falla con
`Cannot find module @rollup/rollup-linux-x64-gnu` — un error que no aparece en ninguna máquina de
desarrollo y que no tiene nada que ver con el cambio que se estaba haciendo.

Comprobación rápida antes de commitear un lockfile tocado:

```bash
grep -c '"node_modules/@rollup/rollup-linux-x64-gnu"' package-lock.json   # debe ser 1
```

Si sale 0, recupera el lockfile anterior (`git checkout HEAD -- package-lock.json`) y repite el
`npm install` sin borrarlo.

### Baseline verificado (tras los arreglos del 2026-08-01, Node 22)

| Gate | Estado | Detalle |
|---|---|---|
| typecheck | ✅ | limpio |
| lint | ✅ | 0 errores · **14 warnings** ← número de referencia, no subirlo |
| test | ✅ | **54 pass** · 5 skipped (`rules.test.ts`, necesita emulador) |
| build | ✅ | 20 rutas · 3 route handlers dinámicos · 102 kB First Load |

> `npm run lint` estuvo roto (OOM de V8 al lintear los 17 MB de `.open-next/` commiteados) y rompía CI
> en todo PR. Arreglado en la Tarea 0.1. Si vuelve a crashear, sospecha de artefactos de build entrando
> a git: revisa `.gitignore` y el array `ignores` de `eslint.config.mjs`.

**Un agente que reporta "listo" sin haber ejecutado los gates no ha terminado.** Pegar la salida real
en el reporte; no describirla de memoria.

---

## 3. Ownership: quién toca qué

Con 3 personas + agentes en paralelo, las colisiones son el fallo más caro. Un archivo, un dueño.

| Zona | Dueño único | Nota |
|---|---|---|
| `firestore.rules`, `storage.rules` | **`security-auditor`** | Nadie más. Otros agentes **piden** el cambio de regla. |
| `src/ai/**` | `backend-ai-engineer` / `rag-engineer` | `ai-flow-reviewer` revisa, no edita. |
| `src/app/api/**` | `backend-ai-engineer` | Frontera de confianza — cambios con revisión obligatoria. |
| `src/types/**`, `docs/DATABASE.md` | `database-architect` | Los tipos son contrato compartido. |
| `src/app/dashboard/**`, `src/components/**` | `frontend-engineer` | `components/ui/**` es shadcn: **no editar**. |
| `*.config.*`, `ci.yml`, `.gitignore`, `wrangler/netlify` | `devops-firebase` | Incluye la Tarea 0. |
| `**/*.test.ts` | `qa-test-engineer` | Cualquiera puede añadir tests; QA es dueño de la estrategia. |
| `docs/**` | quien toca el área | Regla 20 de CLAUDE.md: doc en el **mismo** cambio. |

**Regla 19 de CLAUDE.md sigue vigente:** no borres ni reescribas archivos de un compañero sin confirmarlo.
El repo es de 3 personas y los agentes no lo saben si no se les dice.

---

## 4. El ciclo de iteración

```
   ┌─────────────────────────────────────────────────────────────────┐
   │  0. ENCUADRE      1 tarea · 1 zona · criterio de aceptación      │
   │                   verificable ANTES de escribir código          │
   ├─────────────────────────────────────────────────────────────────┤
   │  1. CONTEXTO      el agente lee SOLO su fila de CONTEXT.md §8    │
   │                   + CLAUDE.md §4 + el .md de su área            │
   ├─────────────────────────────────────────────────────────────────┤
   │  2. PLAN          archivos a tocar · invariantes en riesgo ·     │
   │                   ¿regla nueva? ¿tipo nuevo? ¿doc a actualizar?  │
   │                   ── si toca I1/I2/I3 → confirmar antes ──       │
   ├─────────────────────────────────────────────────────────────────┤
   │  3. IMPLEMENTA    cambio mínimo · test junto al código           │
   ├─────────────────────────────────────────────────────────────────┤
   │  4. GATES         typecheck · eslint src · test · build          │
   │                   ── falla → vuelve a 3, NO a 5 ──               │
   ├─────────────────────────────────────────────────────────────────┤
   │  5. REVISIÓN      code-reviewer (siempre)                        │
   │                   + security-auditor si tocó API/rules/datos     │
   │                   + ai-flow-reviewer si tocó src/ai              │
   ├─────────────────────────────────────────────────────────────────┤
   │  6. CIERRE        doc del área actualizada · deuda nueva en      │
   │                   TECH_DEBT.md · commit atómico                  │
   └─────────────────────────────────────────────────────────────────┘
```

**Por qué el criterio de aceptación va antes del código:** sin él, el agente decide solo cuándo terminó,
y siempre decide que sí. El criterio tiene que ser algo que un comando pueda comprobar.

### Presupuesto de contexto

El código propio de NEXTAPE son **~3 500 líneas** — cabe entero en contexto. El problema no es la
capacidad, es la **dilución**: un agente que lee 40 archivos irrelevantes razona peor que uno que lee 6
relevantes.

- **Sí:** la fila correspondiente de [`CONTEXT.md §8`](./CONTEXT.md), `CLAUDE.md §4`, el `.md` del área.
- **No:** `src/components/ui/**` (3 655 líneas de shadcn), `.open-next/**`, `package-lock.json`,
  `docs/blueprint.md` (histórico, menciona Gemini).
- **Solo si aplica:** `docs/TECH_DEBT.md` antes de "arreglar de paso" cualquier cosa.

### Cuándo un agente debe parar y preguntar

1. La tarea exige romper I1, I2 o I3.
2. Hay que relajar una regla de Firestore.
3. Aparece un ítem de `TECH_DEBT.md` en medio del camino (**no lo arregles de paso** — regla 18).
4. Hay que tocar un archivo fuera de su zona de ownership.
5. El fix requiere una decisión de producto (ej.: visibilidad de candidatos, C2).

---

## 5. Roster de agentes

### 5.1 Existentes — [`.claude/agents/`](../.claude/agents/README.md)

`frontend-engineer` · `backend-ai-engineer` · `database-architect` · `security-auditor` ·
`ai-flow-reviewer` · `code-reviewer` · `devops-firebase` · `qa-test-engineer`

Están bien construidos y alineados con las reglas. **Dos correcciones pendientes** (heredadas de cuando
el proveedor era Gemini): `backend-ai-engineer` describe el patrón `ai.definePrompt` + Handlebars, pero
el código real usa `generateJson()` + template literal; y su descripción sigue diciendo "Genkit/Gemini".
Mismo desfase en [`BACKEND_AI.md §2`](./BACKEND_AI.md).

### 5.2 Nuevos para el trabajo de RAG

Especificaciones listas para copiar como `.claude/agents/<nombre>.md`.

#### `rag-engineer`

```yaml
---
name: rag-engineer
description: Diseña e implementa la capa de retrieval de The LINE — ingesta del corpus, chunking, indexación, recuperación y grounding del prompt de generateQuestions. Úsalo para cualquier trabajo de RAG. NO toca UI, ni reglas de seguridad (delega en security-auditor), ni el scoring.
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---
```

Contexto obligatorio: `docs/CONTEXT.md` (§3.3 y §7), `docs/BACKEND_AI.md`, `CLAUDE.md` §4.1 y §4.3.

Reglas del área:
1. **Todo el retrieval ocurre en servidor.** El corpus, el índice y los chunks recuperados **nunca**
   llegan al cliente. Si un candidato ve la fuente, deduce la respuesta — rompe I1 de facto.
2. El contrato de salida de `generateQuestions` **no cambia**. RAG entra por el prompt, no por el tipo.
   `PublicQuestion` sigue intacto.
3. Toda colección nueva → regla `read, write: if false` en `firestore.rules`, pedida a `security-auditor`,
   en el mismo cambio.
4. `normalizeTag()` sigue siendo obligatorio: el `tag` debe casar con el vocabulario del `stack` o el
   match se rompe silenciosamente.
5. Mantener el patrón **lenient → normalize → strict** de los flows actuales.
6. Toda llamada a un proveedor de embeddings va detrás de una función única y centralizada (como
   `generateJson`), con su key en variable de entorno de servidor y documentada en `.env.example`.
7. **Mide siempre la latencia añadida** a `/api/line/start` y repórtala. Ya la domina el LLM.

#### `rag-evaluator`

```yaml
---
name: rag-evaluator
description: Evalúa la CALIDAD del sistema RAG de The LINE — relevancia de lo recuperado, grounding de las preguntas generadas, tasa de alucinación, coste y latencia. Read-only, mide y reporta con números. Úsalo tras cada cambio del pipeline de retrieval.
tools: Read, Grep, Glob, Bash
model: sonnet
---
```

Existe porque **el RAG es la única parte del sistema que los gates no pueden verificar**. `typecheck` y
`build` no dicen nada sobre si una pregunta recuperada es buena. Sin medición, "mejoramos el RAG" es una
opinión.

Métricas mínimas por iteración, comparadas contra el baseline sin RAG:

| Métrica | Cómo |
|---|---|
| **Grounding** | ¿cada pregunta es trazable a un chunk recuperado? % sobre N=20 |
| **Relevancia** | ¿los chunks recuperados corresponden al `stack` pedido? |
| **Corrección de la clave** | ¿`correctIndex` apunta realmente a la opción óptima? (revisión humana o LLM-judge) |
| **Latencia** | p50/p95 de `/api/line/start`, antes vs después |
| **Coste** | llamadas a embeddings + LLM por simulación |

#### `docs-sync`

```yaml
---
name: docs-sync
description: Detecta y corrige desfases entre la documentación de docs/ y el código real. Úsalo al cerrar una fase o cuando un doc contradiga al código. Read-only sobre src/, escribe solo en docs/ y *.md.
tools: Read, Grep, Glob, Edit
model: haiku
---
```

Existe porque el arnés se alimenta de la documentación: **doc desincronizada = agentes envenenados**. Hoy
hay 6 desfases confirmados en [`CONTEXT.md §6.8`](./CONTEXT.md) — entre ellos `DATABASE.md` afirmando que
"no hay Admin SDK", que es exactamente lo contrario de la arquitectura actual. Un agente que lea eso
razonará mal sobre la frontera de confianza.

Regla del proyecto que aplica: cuando doc y código discrepan, **manda el código**.

---

## 6. Decisiones del RAG

### 6.0 ✅ Decidido — modelo de embeddings: **BGE-M3** *(equipo, 2026-08-01)*

[BGE-M3](https://huggingface.co/BAAI/bge-m3) (BAAI), sobre XLM-RoBERTa-large: **1024 dimensiones**,
contexto de 8 192 tokens, ~568M parámetros, 100+ idiomas.

**Encaja bien con NEXTAPE por dos razones concretas:**
- **Multilingüe.** El producto está en español y el material técnico que se indexaría (docs oficiales,
  post-mortems, CVEs) está casi todo en inglés. Un modelo monolingüe obligaría a traducir o a degradar
  la recuperación cross-lingual.
- **Contexto de 8 192 tokens.** Permite chunks grandes: un post-mortem completo cabe entero, sin partir
  el incidente en trozos que pierden la causa raíz.

**Lo que esta decisión aún no resuelve — y hay que cerrar en este orden:**

| # | Decisión | Por qué depende de la anterior |
|---|---|---|
| D1 | **Dónde corre la inferencia** | 568M params ≈ 1-2 GB en memoria: **no cabe en un cold start serverless**. No se puede empotrar en una Netlify Function ni en un Worker. Opciones: Cloudflare Workers AI (`@cf/baai/bge-m3` — **verificar disponibilidad y precio**), HuggingFace Inference, o un servicio de inferencia propio. Está **acoplado a la decisión de hosting** (Fase 0.3). |
| D2 | **Vector store** | Con dense-only: Firestore `findNearest` (KNN nativo; **verificar** el límite de dimensiones, 1024 debería entrar) o Cloudflare Vectorize. Con híbrido: hace falta Qdrant / Weaviate / Vespa. |
| D3 | **Corpus** | §6.1 abajo. Sigue abierto. |

> ⚠️ **Tensión a resolver conscientemente.** Lo que distingue a BGE-M3 de un modelo de embeddings normal
> es la recuperación **híbrida**: denso + sparse (léxico) + multi-vector (ColBERT). Y eso es
> justo lo que necesita este dominio — un embedding denso empareja mal los términos exactos que definen
> una pregunta técnica ("N+1 query", "OOM killer", el nombre de una librería), que es donde brilla el
> componente sparse.
>
> **Pero Firestore `findNearest` y Cloudflare Vectorize son dense-only.** Si D2 cae en uno de ellos,
> se estará pagando el coste de BGE-M3 (más grande, más lento, más caro de servir) usando solo la parte
> que un modelo mucho más pequeño haría igual de bien. **Decidir a propósito:** o se usa el híbrido y el
> store lo soporta, o se acepta dense-only y se documenta por qué sigue mereciendo la pena (el argumento
> multilingüe basta por sí solo — pero hay que escribirlo, no asumirlo).

### 6.1 ✅ Decidido — corpus: catálogo de fuentes técnicas *(equipo, 2026-08-02)*

El equipo aportó el corpus: ~60 URLs en 13 categorías (documentación oficial de frameworks,
lenguajes, bases de datos y cloud; OWASP/MITRE/NIST; material de arquitectura; blogs de ingeniería
de Netflix, Cloudflare, Stripe, Uber…). Está en
[`src/lib/server/sources.ts`](../src/lib/server/sources.ts) con un índice `tecnología → fuentes`.

Es la **opción A** de las que se barajaban abajo, y encaja con BGE-M3: material técnico extenso,
mayoritariamente en inglés, con documentos largos que aprovechan los 8 192 tokens de contexto.

**Estado:** las URLs ya se usan como **anclaje del prompt** (el modelo recibe la lista y atribuye
una fuente a cada pregunta). Falta la parte de retrieval propiamente dicha — ingesta del texto,
chunking, embeddings, índice — que sigue bloqueada por D1 y D2 del §6.0.

> ⚠️ No confundir anclaje con recuperación. Hoy el modelo no lee las fuentes; `source` es una
> atribución suya. Mientras eso siga así, **no se puede afirmar que las preguntas estén verificadas
> contra documentación** — sería exactamente la falsa auditabilidad que el producto no se puede
> permitir.

**Lista de ingesta:** `allSources()` en ese mismo archivo devuelve el corpus completo deduplicado.

<details>
<summary>Opciones que se barajaron (histórico)</summary>

Las tres producen sistemas distintos, no variantes del mismo.

### Opción A — Corpus técnico curado *(recomendada)*

Indexar material técnico real: documentación oficial, post-mortems de incidentes públicos, advisories de
CVE, guías de arquitectura. `generateQuestions` recupera 3-5 chunks del `stack` pedido y genera el
escenario **anclado a un caso real**.

- ✔ Ataca el problema de raíz: escenarios reales en vez de plausibles, y **auditables** — se puede
  justificar por qué una opción es la correcta. Es lo que respalda la palabra *verificado*.
- ✔ Diferenciador de producto defendible.
- ✘ Hay que construir y mantener el corpus (ingesta, licencias, actualización).

### Opción B — Banco de preguntas + retrieval

Persistir las preguntas generadas y recuperar/variar las de mayor calidad en vez de generar de cero.

- ✔ Barato, rápido, reduce llamadas al LLM, **resuelve de paso el §6.4** (consistencia entre candidatos
  de una misma vacante).
- ✘ No mejora la calidad de origen: si el banco nace de preguntas alucinadas, el RAG las recicla.
- ✔ **Compatible con A** — es la capa de caché natural sobre ella.

### Opción C — RAG sobre el perfil/CORE del candidato

Recuperar el historial del propio candidato (intentos, gaps, roadmap) para personalizar la dificultad.

- ✔ Personalización real y adaptativa.
- ✘ No arregla la calidad ni la auditabilidad. Es una feature de producto, no de integridad.
- ⚠️ Datos personales entrando al prompt de un tercero (Groq): revisar con `security-auditor`.

**Recomendación:** **A**, con **B** como caché encima. A resuelve el problema que hace creíble al producto;
B lo abarata y arregla la inconsistencia del §6.4 de CONTEXT. C es una fase posterior.

**Resultado:** se eligió **A** (§6.1). **B** quedó implementada de otra forma — el repertorio por
vacante (Fase 1.6) ya evita regenerar por candidato, que era su principal beneficio.

</details>

---

## 7. Backlog secuenciado

Cada fase tiene criterio de aceptación verificable. **No empezar una fase con la anterior en rojo.**

### Fase 0 — Desbloqueo *(antes de cualquier feature)*

| # | Tarea | Agente | Aceptación |
|---|---|---|---|
| ✅ 0.1 | `.open-next/` y `.wrangler/` fuera de git y de eslint | `devops-firebase` | **Hecho 2026-08-01.** `npm run lint` termina: 0 errores, 14 warnings |
| ✅ 0.2 | Añadir `thelineRAG` a los branches de `ci.yml` | `devops-firebase` | **Hecho 2026-08-01.** |
| 0.3 | **Decidir hosting**: Cloudflare **o** Netlify. Borrar la config del descartado | equipo + `devops-firebase` | Un solo target; `docs/DEPLOYMENT.md` coincide. **Bloquea D1 del §6.0** |
| 0.4 | Verificar que `firebase-admin` funciona en el target elegido | `devops-firebase` | `/api/line/submit` escribe el DNA en un deploy real |
| 0.5 | Configurar `GROQ_API_KEY` y `FIREBASE_SERVICE_ACCOUNT` en hosting | quien tenga accesos | The LINE completa un ciclo end-to-end en staging |

> 0.3 y 0.4 son bloqueantes de verdad: sin saber dónde corre el código, no se puede diseñar dónde vive el
> índice del RAG.

### Fase 1 — Endurecer The LINE *(el RAG se apoya aquí)*

| # | Tarea | Agente | Aceptación |
|---|---|---|---|
| ✅ 1.1 | Persistir en `job_answer_keys` las preguntas generadas al vuelo en `line/start` ([§6.4](./CONTEXT.md)) | `backend-ai-engineer` | **Hecho 2026-08-01.** Escritura en transacción; `jobId` inexistente → 404 |
| ✅ 1.2 | `runTransaction` en la escritura del DNA ([§6.5](./CONTEXT.md)) | `backend-ai-engineer` | **Hecho 2026-08-01.** También en `candidate_matches` + `applicantsCount` |
| ✅ 1.3 | Validar longitud de `answers` ([§6.7](./CONTEXT.md)) | `qa-test-engineer` | **Hecho 2026-08-01.** `isValidAnswerSet()` + 6 tests; `answers` inválido → 400 |
| ✅ 1.6 | **Repertorio por vacante** — generar el banco al publicar y sortear X por candidato | `backend-ai-engineer` | **Hecho 2026-08-02.** `buildQuestionPool()` + `pickRandomQuestions()` estratificado; `/api/line/start` ya no llama a la IA en el camino normal |
| ✅ 1.7 | Anclar la generación en el catálogo de fuentes del equipo | `rag-engineer` | **Hecho 2026-08-02.** `sources.ts` (13 categorías) + campo `source` por pregunta, descartando URLs inventadas |
| ✅ 1.8 | **Prueba de vacante sin IA**: componer el repertorio desde `line_question_pools` | `backend-ai-engineer` | **Hecho 2026-09-14.** `job-pool.ts` + alias canónicos; `jobs/assessment` y `line/start` sin llamadas al modelo; errores 422/409 explícitos; `SkillPicker` en los formularios |
| ✅ 1.9 | **Tamaño de examen compensado por GitHub** (10 con GitHub, 20 sin él; override 10–30) | `backend-ai-engineer` | **Hecho 2026-09-14.** `examSizeFor` + `hasGithubEvidence`; `/api/line/catalog` devuelve `examSize` |
| ✅ 1.10 | **GitHub multi-repo** (todos los repositorios, 20 lenguajes) | `backend-ai-engineer` + `frontend-engineer` | **Hecho 2026-09-14.** `repos` → `evaluate` por repo → `aggregate`; subcolección con regla propia; tests de agregación y selección de archivos |
| 1.11 | Ampliar el banco a ~50 preguntas por combinación (`seed:questions --top-up`) | quien tenga una API key de IA válida | Cada `line_question_pools/*` ≥ 50. **Bloqueado:** Groq 401, NVIDIA 410/404, Mistral 429 (2026-09-14) |
| 1.4 | Rate limiting en los endpoints que llaman al LLM ([§6.6](./CONTEXT.md)) | `backend-ai-engineer` + `security-auditor` | N.º de generaciones por usuario/hora acotado y testeado |
| 1.5 | Tests de los 3 route handlers (Admin SDK mockeado) | `qa-test-engineer` | Cubiertos 401 / 403 / happy path. Tests totales > 14 |

### Fase 2 — RAG *(tras cerrar la §6)*

| # | Tarea | Agente | Aceptación |
|---|---|---|---|
| 2.1 | Definir corpus, fuentes y licencias | equipo + `rag-engineer` | Documento de decisión en `docs/` |
| 2.2 | Elegir embeddings + store; documentar coste y latencia | `rag-engineer` + `devops-firebase` | ADR con la alternativa descartada y por qué |
| 2.3 | Esquema `rag_*` + reglas `read, write: if false` | `database-architect` + `security-auditor` | `DATABASE.md` actualizado; regla en el mismo commit |
| 2.4 | Pipeline de ingesta y chunking | `rag-engineer` | Script idempotente + corpus indexado |
| 2.5 | `retrieve()` server-only, aislada y testeable | `rag-engineer` | Tests unitarios sin red |
| 2.6 | Grounding de `generateQuestions` con lo recuperado | `rag-engineer` | `PublicQuestion` intacto; gates en verde |
| 2.7 | **Evaluación contra baseline sin RAG** | `rag-evaluator` | Grounding y relevancia medidos sobre N=20; latencia p50/p95 reportada |

> 2.7 no es opcional. Si no se puede demostrar con números que el RAG mejora las preguntas, no se mergea —
> se habrá añadido latencia, coste y una dependencia a cambio de nada.

### Fase 3 — Sincronización

| # | Tarea | Agente |
|---|---|---|
| 3.1 | Corregir los 6 desfases de [`CONTEXT.md §6.8`](./CONTEXT.md) | `docs-sync` |
| 3.2 | Actualizar `backend-ai-engineer` y `BACKEND_AI.md` al patrón real (`generateJson`, no `definePrompt`) | `docs-sync` |
| 3.3 | Marcar en `TECH_DEBT.md` lo resuelto en fases 0-2 | quien resolvió |
| 3.4 | Bajar los 23 warnings de ESLint | cualquiera |

---

## 8. Definición de "terminado"

Un cambio está terminado cuando **todo** esto es cierto:

- [ ] Los 4 gates pasan, con la salida real pegada en el reporte.
- [ ] I1, I2, I3 intactas.
- [ ] Colección nueva ⇒ regla en `firestore.rules` en **este** commit.
- [ ] Tipo nuevo/cambiado ⇒ `src/types/*.types.ts` + `docs/DATABASE.md`.
- [ ] Doc del área actualizada (regla 20 de CLAUDE.md).
- [ ] Deuda nueva registrada en `TECH_DEBT.md`; deuda resuelta, marcada.
- [ ] `code-reviewer` pasó (+ `security-auditor` si tocó API/rules/datos).
- [ ] Ningún archivo fuera de la zona de ownership, ni archivos de compañeros sin confirmar.
- [ ] Commit atómico: una tarea, un commit.

---

## 9. Notas de operación

- **Un agente por zona a la vez.** Dos agentes editando `src/ai/**` en paralelo se pisan; el arnés no lo
  detecta y los gates tampoco.
- **Paraleliza lo independiente**, no lo secuencial: Fase 0 (infra), Fase 1.3 (tests) y Fase 3.1 (docs)
  pueden ir a la vez. Fase 2 es una cadena.
- **`main` no es la base.** Recuerda: sin historia común con esta rama ([`CONTEXT.md §0`](./CONTEXT.md)).
  Ramifica siempre desde `thelineRAG`, y trata la integración a `main` como una decisión de equipo aparte.
- **Este arnés es código.** Si una fase revela que una regla estorba o falta un agente, se edita este
  archivo en el mismo PR. Un arnés que no se actualiza deja de proteger.
