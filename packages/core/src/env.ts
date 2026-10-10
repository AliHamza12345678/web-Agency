import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  API_URL: z.string().url().default('http://localhost:3001'),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  WIDGET_CDN_URL: z.string().url().default('http://localhost:3001/widget.js'),

  // Database
  DATABASE_URL: z.string({ required_error: 'DATABASE_URL is required' }).min(1, 'DATABASE_URL is required'),
  DATABASE_POOL_SIZE: z.coerce.number().int().min(1).max(50).default(10),
  DATABASE_SSL: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('false'),

  // Security
  JWT_SECRET: z.string({ required_error: 'JWT_SECRET is required' }).min(16, 'JWT_SECRET must be at least 16 characters'),
  ENCRYPTION_KEY: z.string({ required_error: 'ENCRYPTION_KEY is required' }).min(16, 'ENCRYPTION_KEY must be at least 16 characters'),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),

  // Rate Limiting
  RATE_LIMIT_PER_MINUTE_IP: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_PER_MINUTE_SITE: z.coerce.number().int().positive().default(120),

  // AI Provider & Inference Engine Configuration
  AI_PRIMARY_PROVIDER: z.enum(['cloudflare', 'openrouter', 'ollama', 'gemini', 'groq']).default('cloudflare'),
  AI_PRIMARY_MODEL: z.string().default('@cf/meta/llama-3.1-8b-instruct'),
  AI_FALLBACK_PROVIDER: z.enum(['cloudflare', 'openrouter', 'ollama', 'gemini', 'groq']).optional(),
  AI_FALLBACK_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(1024),
  AI_DISABLED: z
    .string()
    .transform((val) => val === 'true' || val === '1')
    .default('false'),

  // Cloudflare Workers AI (Free Tier: 10,000 Neurons/day)
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),

  // OpenRouter (Free Models: :free tag)
  OPENROUTER_API_KEY: z.string().optional(),

  // Local Ollama
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),

  // Optional Providers
  GEMINI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and parses environment variables.
 * Throws a clean, actionable error message if validation fails.
 */
export function validateEnv(rawEnv: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((issue) => `  - [${issue.path.join('.')}] ${issue.message}`)
      .join('\n');

    throw new Error(
      `\n❌ Configuration Error: Environment variable validation failed:\n${errorMessages}\n\nPlease check your .env configuration against .env.example.\n`
    );
  }

  return result.data;
}
