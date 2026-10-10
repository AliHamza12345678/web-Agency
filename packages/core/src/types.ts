import { z } from 'zod';

// ============================================================================
// API Response Contracts
// ============================================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Health Check Contracts
// ============================================================================

export interface LivenessResponse {
  status: 'ok';
  timestamp: string;
  uptimeSeconds: number;
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: {
    database: 'healthy' | 'unhealthy';
  };
}

// ============================================================================
// Domain Entities & Schemas
// ============================================================================

export const siteBrandingSchema = z.object({
  botName: z.string().min(1).max(50).default('AI Assistant'),
  primaryColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color').default('#4f46e5'),
  textColor: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color').default('#ffffff'),
  logoUrl: z.string().url().optional(),
  welcomeMessage: z.string().min(1).max(500).default('Hello! How can I help you today?'),
  placeholder: z.string().min(1).max(100).default('Ask anything...'),
  position: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
});

export type SiteBranding = z.infer<typeof siteBrandingSchema>;

export const publicSiteConfigSchema = z.object({
  siteId: z.string().uuid(),
  publicKey: z.string(),
  name: z.string(),
  branding: siteBrandingSchema,
});

export type PublicSiteConfig = z.infer<typeof publicSiteConfigSchema>;
