/**
 * @fileOverview Logger simple para server actions y flows de IA.
 *
 * Permite logging estructurado sin dependencias externas. Los niveles se mapean a
 * console.log/warn/error, pero con contexto adicional (timestamp, nivel, namespace).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  namespace?: string;
  message: string;
  data?: unknown;
}

class Logger {
  private namespace?: string;

  constructor(namespace?: string) {
    this.namespace = namespace;
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      namespace: this.namespace,
      message,
      data,
    };

    const prefix = `[${entry.timestamp}] [${level.toUpperCase()}]${
      this.namespace ? ` [${this.namespace}]` : ''
    }`;

    switch (level) {
      case 'debug':
      case 'info':
        console.log(prefix, message, data !== undefined ? data : '');
        break;
      case 'warn':
        console.warn(prefix, message, data !== undefined ? data : '');
        break;
      case 'error':
        console.error(prefix, message, data !== undefined ? data : '');
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

/**
 * Crea un logger con namespace opcional.
 *
 * @example
 * ```ts
 * const logger = createLogger('generateAssessmentFlow');
 * logger.info('Generando preguntas', { type: 'multiple_choice', count: 5 });
 * ```
 */
export function createLogger(namespace?: string): Logger {
  return new Logger(namespace);
}
