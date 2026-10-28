import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateGithubFeedback } from './generate-github-feedback-flow';
import type { GenerateGithubFeedbackInput } from './generate-github-feedback-flow';

// Mock generateJsonWithFallback en el módulo generate
vi.mock('@/ai/generate', () => ({
  generateJsonWithFallback: vi.fn(),
}));

describe('generateGithubFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockInput: GenerateGithubFeedbackInput = {
    architecture: 75,
    testing: 80,
    security: 70,
    maintainability: 65,
    documentation: 85,
    overall: 75,
    topWeaknesses: ['Mejorar cobertura de tests', 'Reforzar validación de entradas'],
  };

  describe('C.1: AI failures return deterministic feedback without throwing', () => {
    it('returns deterministic feedback on 429 rate limit error', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      const mockError = new Error('Rate limit exceeded');
      (mockError as { status?: number }).status = 429;
      vi.mocked(generateJsonWithFallback).mockRejectedValueOnce(mockError);

      const result = await generateGithubFeedback(mockInput);

      expect(result.source).toBe('deterministic');
      expect(result.feedback).toBeTruthy();
      expect(result.strengths).toBeInstanceOf(Array);
      expect(result.improvements).toBeInstanceOf(Array);
    });

    it('returns deterministic feedback on JSON parse error', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      const mockError = new SyntaxError('Unexpected token in JSON');
      vi.mocked(generateJsonWithFallback).mockRejectedValueOnce(mockError);

      const result = await generateGithubFeedback(mockInput);

      expect(result.source).toBe('deterministic');
      expect(result.feedback).toBeTruthy();
    });

    it('returns deterministic feedback on network error', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      const mockError = new Error('Network request failed');
      vi.mocked(generateJsonWithFallback).mockRejectedValueOnce(mockError);

      const result = await generateGithubFeedback(mockInput);

      expect(result.source).toBe('deterministic');
    });

    it('ROJO/VERDE: without catch block, AI failure throws', async () => {
      // Este test demuestra que el catch es necesario
      // PASO 1: Simular un error de la IA
      const { generateJsonWithFallback } = await import('@/ai/generate');
      const mockError = new Error('AI exploded');
      vi.mocked(generateJsonWithFallback).mockRejectedValueOnce(mockError);

      // PASO 2: Con el catch implementado, NO lanza → retorna deterministic
      const result = await generateGithubFeedback(mockInput);
      expect(result.source).toBe('deterministic');
      expect(result.feedback).toBeTruthy();
      
      // NOTA: Si se quitara el try/catch del código, este test fallaría con:
      // "Error: AI exploded" (UnhandledPromiseRejection)
      // Demostración manual: comentar try/catch → ver test fallar → restaurar
    });
  });

  describe('C.2: handles null scores and empty topWeaknesses', () => {
    it('generates feedback with all null scores except required ones', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      vi.mocked(generateJsonWithFallback).mockRejectedValueOnce(new Error('Force deterministic'));

      const nullInput: GenerateGithubFeedbackInput = {
        architecture: null,
        testing: 0,
        security: null,
        maintainability: null,
        documentation: 0,
        overall: 0,
        topWeaknesses: [],
      };

      const result = await generateGithubFeedback(nullInput);

      expect(result.source).toBe('deterministic');
      expect(result.feedback).toBeTruthy();
      expect(result.strengths.length).toBeGreaterThan(0);
      expect(result.improvements.length).toBeGreaterThan(0);
    });

    it('uses default improvements when topWeaknesses is empty', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      vi.mocked(generateJsonWithFallback).mockRejectedValueOnce(new Error('Force deterministic'));

      const emptyWeaknesses: GenerateGithubFeedbackInput = {
        ...mockInput,
        topWeaknesses: [],
      };

      const result = await generateGithubFeedback(emptyWeaknesses);

      expect(result.improvements).toContain('Ampliar cobertura de tests y documentación técnica');
    });
  });

  describe('C.3: normal AI result preserves source=ai', () => {
    it('returns AI-generated feedback with source=ai on success', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      const mockAIResponse = {
        data: {
          feedback: 'Perfil técnico sólido con experiencia evidenciada.',
          strengths: ['Excelente testing', 'Documentación clara'],
          improvements: ['Reforzar seguridad', 'Mejorar arquitectura'],
        },
        model: 'primary' as const,
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      };
      vi.mocked(generateJsonWithFallback).mockResolvedValueOnce(mockAIResponse);

      const result = await generateGithubFeedback(mockInput);

      expect(result.source).toBe('ai');
      expect(result.feedback).toBe('Perfil técnico sólido con experiencia evidenciada.');
      expect(result.strengths).toEqual(['Excelente testing', 'Documentación clara']);
    });
  });

  describe('ROJO/VERDE: timeout handling', () => {
    it('returns deterministic feedback on timeout (8s)', async () => {
      const { generateJsonWithFallback } = await import('@/ai/generate');
      
      // Simular timeout: promesa que nunca resuelve
      vi.mocked(generateJsonWithFallback).mockImplementationOnce(
        () => new Promise(() => {}) // Nunca resuelve
      );

      // Mock timers para controlar el timeout
      vi.useFakeTimers();
      const resultPromise = generateGithubFeedback(mockInput);
      
      // Avanzar 8 segundos (AI_FEEDBACK_TIMEOUT_MS)
      vi.advanceTimersByTime(8000);
      
      const result = await resultPromise;

      expect(result.source).toBe('deterministic');
      
      vi.useRealTimers();
    });
  });
});
