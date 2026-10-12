import { z } from 'zod';

export type ToolCategory = 'content' | 'commerce' | 'support' | 'connector';

export type ToolErrorCode =
  | 'TOOL_NOT_FOUND'
  | 'TOOL_UNAUTHORIZED'
  | 'INVALID_TOOL_INPUT'
  | 'CONFIRMATION_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'DUPLICATE_SUBMISSION'
  | 'TOOL_TIMEOUT'
  | 'CONNECTOR_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ToolErrorPayload {
  code: ToolErrorCode;
  message: string;
  details?: any;
  retryable: boolean;
}

export interface ToolExecutionContext {
  siteId: string;
  tenantId?: string;
  conversationId?: string;
  visitorId?: string;
  db: any;
  config: Record<string, any>;
  isConfirmed?: boolean;
  confirmationToken?: string;
  idempotencyKey?: string;
  ipAddress?: string;
  signal?: AbortSignal;
}

export interface PendingConfirmationInfo {
  token: string;
  actionSummary: string;
  toolName: string;
  payload: Record<string, any>;
  expiresAt: string;
}

export interface ToolExecutionResult<TOutput = any> {
  success: boolean;
  toolId: string;
  data?: TOutput;
  error?: ToolErrorPayload;
  pendingConfirmation?: PendingConfirmationInfo;
  durationMs: number;
  executionId: string;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  isConsequential?: boolean;
  requiresExplicitConsent?: boolean;
  defaultTimeoutMs?: number;
  maxOutputLength?: number;
  inputSchema: z.ZodType<TInput, any, any>;
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
}

export interface SiteToolConfig {
  toolId: string;
  enabled: boolean;
  requiresConfirmation?: boolean;
  config?: Record<string, any>;
}

export interface IntegrationStatus {
  toolId: string;
  name: string;
  description: string;
  category: ToolCategory;
  isConsequential: boolean;
  requiresConsent: boolean;
  enabled: boolean;
  configured: boolean;
  status: 'active' | 'disabled' | 'needs_config';
  configSummary?: Record<string, any>;
}
