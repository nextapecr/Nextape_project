# Roadmap determinístico — cómo funciona

> Documento de referencia de los algoritmos del roadmap. Lo citan `src/lib/roadmap-engine.ts`,
> `src/types/roadmap.types.ts`, `src/ai/flows/generate-roadmap-flow.ts` y `scripts/seed-skill-catalog.ts`.
> Fuente de verdad: el código. Última revisión: 2026-10-14.

## 1. Qué es

Un plan de mejora **100 % determinista, sin IA**: mismos datos de entrada → mismo roadmap. Le dice al usuario
qué habilidades le faltan para pasar de su nivel actual al siguiente en un rol (backend, frontend, fullstack,
devops, mobile) y en qué orden trabajarlas.

- Motor: `computeRoadmap()` en [`src/lib/roadmap-engine.ts`](../src/lib/roadmap-engine.ts). Función pura.
- Se ejecuta **en el navegador** (excepción consciente al patrón server-trust): solo lee y calcula, no escribe
  ningún dato verificado. Ver `docs/ARCHITECTURE.md`.
- El flow de IA `generate-roadmap-flow.ts` está **obsoleto** (`@deprecated`): solo lo carga el Dev UI de Genkit.

## 2. Datos de entrada

| Dato | De dónde sale |
|---|---|
| Ruta | `roadmap_routes/{role}_{from}_to_{to}`: qué skills pide y cuánto pesa cada una (`skillWeights`, suman 1.0) |
| Catálogo | `skill_catalog/{id}`: 112 habilidades conceptuales con categoría, prerequisitos y dimensión de GitHub |
| DNA | `user_skill_scores/{uid}.scores`: nota por **tecnología** de The LINE (0–100, ya ponderada por nivel) |
| GitHub (opcional) | `github_evidence/{uid}.skillScores`: 5 dimensiones del motor de GitHub |

Los catálogos se siembran con `npm run seed:catalog:full` (112 skills, 10 rutas =
`backend|frontend|fullstack|devops|mobile` × `junior_to_mid|mid_to_senior`). El seeder valida antes de escribir
que los pesos de cada ruta sumen 1.0 y que todos los ids y prerequisitos existan.

## 3. Algoritmos

### 3.1 Requisito previo: The LINE

Sin ninguna entrada en el DNA, el motor lanza `ROADMAP_REQUIRES_LINE_EVALUATION`. The LINE es obligatorio.

### 3.2 Nivel actual y ruta

`inferFromLevel(dna)`: promedio de las notas del DNA comparado con `SENIORITY_THRESHOLDS`
(junior 50, mid 70, senior 85). El nivel es el más alto cuyo umbral se alcanza. El objetivo es el siguiente
nivel (junior → mid, mid → senior) y la ruta es `{role}_{actual}_to_{objetivo}`.

El **umbral objetivo** de cada skill es `SENIORITY_THRESHOLDS[route.toLevel]`.

### 3.3 Nota de cada skill (en cascada)

1. **The LINE (`line`)** — vía [`src/lib/skill-technology-map.ts`](../src/lib/skill-technology-map.ts):
   - si el DNA tiene una entrada con el id de la skill (p. ej. `postgresql`), esa;
   - si no, la **mejor** nota de las tecnologías que evidencian la skill (p. ej. `react-fundamentals` ←
     `react`, `nextjs`, `react native`). El item guarda de cuáles salió en `evidenceTechnologies`.
   - Las claves del DNA se comparan por id canónico, así que el DNA antiguo con alias ("React.js") también vale.
2. **GitHub (`github`)** — si la skill tiene `githubDimension` y el usuario tiene esa dimensión medida.
3. **Promedio de categoría (`category-inferred`)** — promedio de las notas de The LINE de las demás skills de la
   ruta en la misma categoría.
4. **Sin datos (`none`)** — `null`. La skill queda como `unknown`, **nunca** como "gap con 0".

> **Antes de 2026-10** el paso 1 buscaba solo `dna[skill.id]`. Los ids del catálogo son habilidades
> conceptuales y los del DNA son tecnologías, así que solo 2 de 112 coincidían y el roadmap casi no usaba The
> LINE. El mapa conecta hoy 62 de 112; el resto no tiene ninguna tecnología de The LINE que lo mida.

### 3.4 Estado de cada skill

| Estado | Condición |
|---|---|
| `unknown` | Nota `null` (sin evidencia) |
| `completed` | Nota ≥ umbral objetivo |
| `blocked` | Nota < umbral y algún prerequisito de la ruta sin dominar (`blockedBy`) |
| `gap` | Nota < umbral y todos los prerequisitos dominados |

### 3.5 Prioridad

```
déficit     = max(0, umbral − nota)        (0 si la nota es null)
rawPriority = (déficit / 100) × peso de la skill en la ruta
```

| rawPriority | Prioridad |
|---|---|
| ≥ 0.15 | `critical` |
| ≥ 0.08 | `high` |
| ≥ 0.03 | `medium` |
| > 0 | `low` |
| 0 | `none` |

### 3.6 Orden: Kahn + prioridad

Orden topológico de Kahn sobre el grafo de prerequisitos **completo** (los prerequisitos ya dominados siguen
contando para calcular el nivel topológico):

1. **Primario:** nivel topológico. Una skill nunca aparece antes que sus prerequisitos.
2. **Secundario:** `rawPriority` descendente entre skills del mismo nivel.

### 3.7 Precisión

`precision = 'standard'` si más del 30 % de las skills de la ruta quedan `unknown`; si no, `'high'`.

## 4. Salida

`{ items: RoadmapItem[], precision }`. Cada item: `skillId`, `skillName`, `category`, `status`, `priority`,
`order`, `currentScore`, `targetScore`, `deficit`, `blockedBy`, `prerequisites`, `scoreSource` y, cuando la nota
sale de The LINE, `evidenceTechnologies`.

En la página (`src/app/dashboard/roadmap/page.tsx`), cada skill muestra de dónde sale su nota
("The LINE (React, Next.js)") y, si alguna tecnología relacionada tiene banco de preguntas, un botón
"Practicar React en The LINE".

## 5. Mantenimiento

- **Al añadir una skill al catálogo o una tecnología a The LINE**, revisa `SKILL_TECHNOLOGY_MAP`. El test
  `skill-technology-map.test.ts` falla si el mapa apunta a una skill o tecnología que no existe.
- **Tests:** `src/lib/skill-technology-map.test.ts` cubre el mapa y escenarios de `computeRoadmap`.
  `scripts/verify-roadmap-engine.ts` es una verificación manual contra Firestore (no es un gate de CI).

## 6. Limitaciones conocidas

- **Escalón superior:** quien ya es `senior` construye `{role}_senior_to_senior`, que no existe. En backend cae
  a `backend_junior_to_mid`; en los demás roles se muestra un error (`docs/CONTEXT.md` §9).
- **Cobertura del banco:** una skill solo se alimenta de The LINE si su tecnología tiene preguntas sembradas
  (`npm run inventory:pools`). Con los 13 bancos actuales, 20 skills del catálogo ya se alimentan; cada
  tecnología nueva que se siembre suma las suyas.
- **Las skills sin tecnología relacionada** (accesibilidad, observabilidad, redes…) solo pueden medirse con
  GitHub o por promedio de categoría.
