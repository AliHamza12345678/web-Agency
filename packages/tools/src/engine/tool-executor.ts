import { randomUUID } from 'crypto';
import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolErrorPayload,
  PendingConfirmationInfo,
} from '../types.js';
import { ToolRegistry } from './tool-registry.js';
import { withTimeout, TimeoutError } from '../security/timeout.js';
import { sanitizeAndBoundOutput } from '../security/sanitizer.js';
import { globalIdempotencyStore } from '../security/idempotency.js';
import { ToolAuditLogger } from '../security/audit-logger.js';
import { pendingConfirmations } from '@openagent/db';

export interface ExecuteToolOptions {
  toolId: string;
  parameters: Record<string, any>;
  context: ToolExecutionContext;
  allowedToolIds?: string[]; // If provided, strictly limits authorized tools
  maxRetries?: number;
}

export class SafeToolExecutor {
  private registry: ToolRegistry;

  constructor(registry?: ToolRegistry) {
    this.registry = registry || ToolRegistry.getInstance();
  }

  /**
   * Safely and authoritatively executes a tool call.
   */
  public async execute(options: ExecuteToolOptions): Promise<ToolExecutionResult> {
    const { toolId, parameters, context, allowedToolIds, maxRetries = 1 } = options;
    const startTime = Date.now();
    const executionId = randomUUID();

    // 1. Tool Existence
    const tool = this.registry.get(toolId);
    if (!tool) {
      const error: ToolErrorPayload = {
        code: 'TOOL_NOT_FOUND',
        message: `Tool '${toolId}' is not registered or supported by this assistant.`,
        retryable: false,
      };
      await ToolAuditLogger.log(context.db, {
        siteId: context.siteId,
        visitorId: context.visitorId,
        conversationId: context.conversationId,
        toolName: toolId,
        status: 'unauthorized',
        inputPayload: parameters,
        errorMessage: error.message,
        executionTimeMs: Date.now() - startTime,
        ipAddress: context.ipAddress,
      });
      return { success: false, toolId, error, durationMs: Date.now() - startTime, executionId };
    }

    // 2. Authorization / Permission Check
    if (allowedToolIds && !allowedToolIds.includes(toolId)) {
      const error: ToolErrorPayload = {
        code: 'TOOL_UNAUTHORIZED',
        message: `Tool '${toolId}' is disabled or not authorized for website '${context.siteId}'.`,
        retryable: false,
      };
      await ToolAuditLogger.log(context.db, {
        siteId: context.siteId,
        visitorId: context.visitorId,
        conversationId: context.conversationId,
        toolName: toolId,
        status: 'unauthorized',
        inputPayload: parameters,
        errorMessage: error.message,
        executionTimeMs: Date.now() - startTime,
        ipAddress: context.ipAddress,
      });
      return { success: false, toolId, error, durationMs: Date.now() - startTime, executionId };
    }

    // 3. Strict Input Schema Validation
    const parseResult = tool.inputSchema.safeParse(parameters);
    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      const error: ToolErrorPayload = {
        code: 'INVALID_TOOL_INPUT',
        message: `Validation failed for tool '${toolId}': ${issues}`,
        details: parseResult.error.issues,
        retryable: false,
      };
      await ToolAuditLogger.log(context.db, {
        siteId: context.siteId,
        visitorId: context.visitorId,
        conversationId: context.conversationId,
        toolName: toolId,
        status: 'failure',
        inputPayload: parameters,
        errorMessage: error.message,
        executionTimeMs: Date.now() - startTime,
        ipAddress: context.ipAddress,
      });
      return { success: false, toolId, error, durationMs: Date.now() - startTime, executionId };
    }

    const validatedInput = parseResult.data;

    // 4. Explicit Consent Verification (for Lead Capture or Consent-gated tools)
    if (tool.requiresExplicitConsent) {
      const consentGiven = (validatedInput as any)?.consentGiven;
      if (consentGiven !== true) {
        const error: ToolErrorPayload = {
          code: 'CONSENT_REQUIRED',
          message: `Explicit affirmative consent is strictly required to execute tool '${toolId}'.`,
          retryable: false,
        };
        await ToolAuditLogger.log(context.db, {
          siteId: context.siteId,
          visitorId: context.visitorId,
          conversationId: context.conversationId,
          toolName: toolId,
          status: 'rejected_missing_consent',
          inputPayload: parameters,
          errorMessage: error.message,
          executionTimeMs: Date.now() - startTime,
          ipAddress: context.ipAddress,
        });
        return { success: false, toolId, error, durationMs: Date.now() - startTime, executionId };
      }
    }

    // 5. Consequential Action Confirmation Verification
    const requiresConfirmation =
      tool.isConsequential || context.config?.requiresConfirmation === true;

    if (requiresConfirmation && !context.isConfirmed) {
      const confirmationToken = randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const actionSummary = `Action '${tool.name}' requires visitor confirmation before proceeding.`;

      // Persist pending confirmation
      if (context.db && typeof context.db.insert === 'function') {
        try {
          await context.db.insert(pendingConfirmations).values({
            id: confirmationToken,
            siteId: context.siteId,
            visitorId: context.visitorId || 'anonymous_visitor',
            toolName: toolId,
            payload: validatedInput,
            status: 'pending',
            idempotencyKey: context.idempotencyKey || null,
            expiresAt: new Date(expiresAt),
          });
        } catch {
          // Ignored if DB unavailable in test
        }
      }

      const pendingConfirmation: PendingConfirmationInfo = {
        token: confirmationToken,
        actionSummary,
        toolName: tool.name,
        payload: validatedInput,
        expiresAt,
      };

      await ToolAuditLogger.log(context.db, {
        siteId: context.siteId,
        visitorId: context.visitorId,
        conversationId: context.conversationId,
        toolName: toolId,
        status: 'pending_confirmation',
        inputPayload: parameters,
        outputPayload: { pendingConfirmation },
        executionTimeMs: Date.now() - startTime,
        ipAddress: context.ipAddress,
      });

      return {
        success: false,
        toolId,
        pendingConfirmation,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: `This action (${tool.name}) has real-world consequences and requires confirmation before it can be executed.`,
          details: pendingConfirmation,
          retryable: false,
        },
        durationMs: Date.now() - startTime,
        executionId,
      };
    }

    // 6. Idempotency Check & Duplicate Submission Defense
    const effectiveIdempotencyKey = context.idempotencyKey || (validatedInput as any)?.idempotencyKey;
    if (effectiveIdempotencyKey) {
      const cached = globalIdempotencyStore.get(context.siteId, toolId, effectiveIdempotencyKey);
      if (cached) {
        await ToolAuditLogger.log(context.db, {
          siteId: context.siteId,
          visitorId: context.visitorId,
          conversationId: context.conversationId,
          toolName: toolId,
          status: 'duplicate_submission',
          inputPayload: parameters,
          outputPayload: cached,
          executionTimeMs: Date.now() - startTime,
          ipAddress: context.ipAddress,
        });
        return {
          success: true,
          toolId,
          data: cached,
          durationMs: Date.now() - startTime,
          executionId,
        };
      }
    }

    // 7. Execution with Hard Timeout and Retries
    const timeoutMs = tool.defaultTimeoutMs || 5000;
    let attempts = 0;
    let lastError: any = null;

    while (attempts <= maxRetries) {
      attempts++;
      try {
        const rawOutput = await withTimeout((signal) => {
          return tool.execute(validatedInput, { ...context, signal });
        }, timeoutMs);

        // 8. Bounded Output & Prompt Injection Sanitization
        const boundedOutput = sanitizeAndBoundOutput(rawOutput, tool.maxOutputLength || 3500);

        // Cache in idempotency store
        if (effectiveIdempotencyKey) {
          globalIdempotencyStore.set(context.siteId, toolId, effectiveIdempotencyKey, boundedOutput);
        }

        // 9. Success Audit Log
        await ToolAuditLogger.log(context.db, {
          siteId: context.siteId,
          visitorId: context.visitorId,
          conversationId: context.conversationId,
          toolName: toolId,
          status: 'success',
          inputPayload: parameters,
          outputPayload: boundedOutput,
          executionTimeMs: Date.now() - startTime,
          ipAddress: context.ipAddress,
        });

        return {
          success: true,
          toolId,
          data: boundedOutput,
          durationMs: Date.now() - startTime,
          executionId,
        };
      } catch (err: any) {
        lastError = err;
        // If it was a timeout, don't spin in retry loops
        if (err instanceof TimeoutError) {
          break;
        }
        // Small backoff before retry if retries left
        if (attempts <= maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 200 * attempts));
        }
      }
    }

    // 10. Handle Failures & Timeouts
    const isTimeout = lastError instanceof TimeoutError;
    const errorCode = isTimeout ? 'TOOL_TIMEOUT' : 'CONNECTOR_ERROR';
    const errorPayload: ToolErrorPayload = {
      code: errorCode,
      message: isTimeout
        ? `Tool '${toolId}' timed out after ${timeoutMs}ms.`
        : `Backend connector failure: ${lastError?.message || 'Unknown error'}`,
      retryable: isTimeout,
    };

    await ToolAuditLogger.log(context.db, {
      siteId: context.siteId,
      visitorId: context.visitorId,
      conversationId: context.conversationId,
      toolName: toolId,
      status: isTimeout ? 'timeout' : 'failure',
      inputPayload: parameters,
      errorMessage: errorPayload.message,
      executionTimeMs: Date.now() - startTime,
      ipAddress: context.ipAddress,
    });

    return {
      success: false,
      toolId,
      error: errorPayload,
      durationMs: Date.now() - startTime,
      executionId,
    };
  }
}
