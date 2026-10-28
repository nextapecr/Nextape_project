import { describe, it, expect } from 'vitest';
import { buildProductionPrompt, typeSpec } from './generate-assessment-flow';

describe('buildProductionPrompt', () => {
  /**
   * Test de equivalencia REAL: snapshot del prompt inline extraído de commit 59b0458^
   * (commit inmediatamente anterior a la extracción de buildProductionPrompt).
   * 
   * Obtenido con Node desde git show 59b0458^:src/ai/flows/generate-assessment-flow.ts (UTF-8).
   */
  it('produce el mismo prompt que el código inline anterior (equivalencia snapshot)', () => {
    const input = {
      count: 5,
      type: 'multiple_choice' as const,
      stack: ['react', 'typescript', 'nodejs'],
      level: 'senior',
    };

    // Snapshot del commit 59b0458^ (82ac093).
    // Variables evaluadas: count=5, stack='react, typescript, nodejs', level='senior', sources=[], sourcesBlock=''
    const expectedPrompt = `Eres un Arquitecto de Software Senior en NEXTAPE que evalúa a candidatos de élite.

Responde ÚNICAMENTE con un objeto JSON válido. Sin markdown, sin texto adicional, solo JSON.

Genera EXACTAMENTE 5 desafíos técnicos de nivel senior centrados en: react, typescript, nodejs.

Estructura EXACTA del JSON:
{
  "questions": [
    {
      "briefing": "contexto corto de un sistema en producción",
      "text": "enunciado del problema técnico específico",
      "options": ["solución 1", "solución 2", "solución 3", "solución 4"],
      "correctIndex": 0,
      "difficulty": "senior",
      "tag": "una de las habilidades del stack, en minúsculas"
    }
  ]
}

REGLAS:
- "options": EXACTAMENTE 4 soluciones de ingeniería. Todas deben sonar profesionales; solo UNA es la óptima.
- "correctIndex": índice (0 a 3) de la opción correcta dentro de "options".
- "difficulty": uno de junior, mid o senior (el más cercano al nivel "senior").
- "tag": DEBE ser EXACTAMENTE una de estas habilidades (en minúsculas): react, typescript, nodejs. No inventes otras.
- NO preguntes sintaxis trivial. Plantea problemas reales: fugas de memoria, cuellos de botella,
  condiciones de carrera, seguridad, deuda técnica.
- Genera EXACTAMENTE 5 preguntas en el array "questions".

Responde solo con el JSON.`;

    const actualPrompt = buildProductionPrompt(input);

    expect(actualPrompt).toBe(expectedPrompt);
  });

  it('genera el prompt de producción sin cambiar su comportamiento', () => {
    const input = {
      count: 3,
      type: 'multiple_choice' as const,
      stack: ['react', 'typescript'],
      level: 'senior',
    };

    const prompt = buildProductionPrompt(input);

    // Verificar elementos clave del prompt
    expect(prompt).toContain('Eres un Arquitecto de Software Senior en NEXTAPE');
    expect(prompt).toContain('EXACTAMENTE 3 desafíos técnicos de nivel senior');
    expect(prompt).toContain('centrados en: react, typescript');
    expect(prompt).toContain('"difficulty": "senior"');
    expect(prompt).toContain('Responde solo con el JSON');

    // Verificar que incluye las reglas del tipo multiple_choice
    const spec = typeSpec('multiple_choice', 'senior');
    expect(prompt).toContain(spec.shape);
    expect(prompt).toContain('EXACTAMENTE 4 soluciones de ingeniería');
  });

  it('incluye el bloque de fuentes cuando se proporcionan', () => {
    const input = {
      count: 2,
      type: 'code_output' as const,
      stack: ['nodejs'],
      level: 'mid',
      sources: [
        'https://nodejs.org/api/async_hooks.html',
        'https://nodejs.org/api/worker_threads.html',
      ],
    };

    const prompt = buildProductionPrompt(input);

    expect(prompt).toContain('FUENTES DE REFERENCIA');
    expect(prompt).toContain('https://nodejs.org/api/async_hooks.html');
    expect(prompt).toContain('https://nodejs.org/api/worker_threads.html');
    expect(prompt).toContain('"source": "una URL EXACTA de la lista de fuentes"');
  });

  it('NO incluye el bloque de fuentes cuando no se proporcionan', () => {
    const input = {
      count: 1,
      type: 'true_false' as const,
      stack: ['python'],
      level: 'junior',
    };

    const prompt = buildProductionPrompt(input);

    expect(prompt).not.toContain('FUENTES DE REFERENCIA');
    expect(prompt).not.toContain('"source"');
  });

  it('genera prompts específicos para cada tipo de pregunta', () => {
    const types = ['multiple_choice', 'code_output', 'multi_select', 'true_false', 'ordering'] as const;

    for (const type of types) {
      const prompt = buildProductionPrompt({
        count: 1,
        type,
        stack: ['javascript'],
        level: 'mid',
      });

      const spec = typeSpec(type, 'mid');
      expect(prompt).toContain(spec.shape);
      expect(prompt).toContain(spec.rules);
    }
  });
});

describe('typeSpec', () => {
  it('retorna especificaciones correctas para multiple_choice', () => {
    const spec = typeSpec('multiple_choice', 'senior');
    expect(spec.shape).toContain('"options"');
    expect(spec.shape).toContain('"correctIndex": 0');
    expect(spec.rules).toContain('EXACTAMENTE 4 soluciones');
  });

  it('retorna especificaciones correctas para code_output', () => {
    const spec = typeSpec('code_output', 'mid');
    expect(spec.shape).toContain('"code"');
    expect(spec.shape).toContain('"language"');
    expect(spec.rules).toContain('fragmento REAL de 5 a 15 líneas');
  });

  it('retorna especificaciones correctas para multi_select', () => {
    const spec = typeSpec('multi_select', 'junior');
    expect(spec.shape).toContain('"correctIndexes"');
    expect(spec.rules).toContain('EXACTAMENTE 5 afirmaciones');
  });

  it('retorna especificaciones correctas para true_false', () => {
    const spec = typeSpec('true_false', 'senior');
    expect(spec.shape).toContain('"correct": true');
    expect(spec.rules).toContain('afirmación técnica precisa y verificable');
  });

  it('retorna especificaciones correctas para ordering', () => {
    const spec = typeSpec('ordering', 'mid');
    expect(spec.shape).toContain('"items"');
    expect(spec.rules).toContain('EXACTAMENTE 4 pasos');
    expect(spec.rules).toContain('YA EN EL ORDEN CORRECTO');
  });
});
