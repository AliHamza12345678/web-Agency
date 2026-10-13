import type { ErrorHandler } from 'hono';
import { ZodError } from 'zod';
import { AppError, defaultLogger, type ApiErrorResponse } from '@openagent/core';

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get('requestId') || 'unknown';

  // 1. Handled Operational Errors
  if (err instanceof AppError) {
    defaultLogger.warn(`Operational Error: ${err.message}`, {
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
    });

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    };

    return c.json(response, err.statusCode as any);
  }

  // 2. Zod Validation Errors
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((i: any) => ({
      field: i.path.join('.'),
      message: i.message,
    }));

    defaultLogger.warn('Validation Error', {
      requestId,
      issues: formattedIssues,
    });

    const response: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data provided',
        details: formattedIssues,
        requestId,
      },
    };

    return c.json(response, 400);
  }

  // 3. Unhandled Server Errors
  defaultLogger.error('Unhandled Server Error', err, { requestId });

  const response: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: err.message || 'An unexpected internal error occurred',
      requestId,
    },
  };

  return c.json(response, 500);
};
