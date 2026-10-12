export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'jwt_secret',
  'encryption_key',
  'authorization',
  'cookie',
  'set-cookie',
  'database_url',
  'gemini_api_key',
  'groq_api_key',
  'openai_api_key',
  'mistral_api_key',
]);

/**
 * Deeply redacts sensitive keys from objects and records.
 */
export function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 6 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Redact Bearer tokens in strings
    return obj.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]');
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('password') || lowerKey.includes('apikey')) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return redacted;
  }

  return obj;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
}

export class Logger {
  private minLevel: LogLevel;
  private serviceName: string;

  constructor(serviceName = 'openagent', minLevel: LogLevel = 'info') {
    this.serviceName = serviceName;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>, err?: Error): void {
    if (!this.shouldLog(level)) return;

    const safeMeta = meta ? (redactSensitiveData(meta) as Record<string, unknown>) : undefined;
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(safeMeta && { context: safeMeta }),
    };

    if (safeMeta?.requestId && typeof safeMeta.requestId === 'string') {
      entry.requestId = safeMeta.requestId;
      delete safeMeta.requestId;
    }

    if (err) {
      entry.error = {
        name: err.name,
        message: err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
      };
    }

    const output = JSON.stringify({ service: this.serviceName, ...entry });
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.write('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.write('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>, err?: Error): void {
    this.write('warn', message, meta, err);
  }

  public error(message: string, err?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorInstance = err instanceof Error ? err : err ? new Error(String(err)) : undefined;
    this.write('error', message, meta, errorInstance);
  }
}

export const defaultLogger = new Logger(
  'openagent-api',
  (process.env.LOG_LEVEL as LogLevel) || (process.env.NODE_ENV === 'development' ? 'debug' : 'info')
);

export const logger = defaultLogger;
