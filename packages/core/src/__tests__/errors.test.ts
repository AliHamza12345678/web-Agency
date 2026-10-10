import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
} from '../errors.js';

describe('AppError Hierarchy', () => {
  it('correctly sets status code and error codes for specific subclasses', () => {
    const valErr = new ValidationError('Invalid email', [{ field: 'email', message: 'Required' }]);
    expect(valErr.statusCode).toBe(400);
    expect(valErr.code).toBe('VALIDATION_ERROR');
    expect(valErr.details).toBeDefined();

    const notFound = new NotFoundError('Site', 'site-123');
    expect(notFound.statusCode).toBe(404);
    expect(notFound.code).toBe('NOT_FOUND');
    expect(notFound.message).toContain('site-123');

    const unauth = new UnauthorizedError();
    expect(unauth.statusCode).toBe(401);
    expect(unauth.code).toBe('UNAUTHORIZED');

    const forbidden = new ForbiddenError();
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.code).toBe('FORBIDDEN');

    const rateLimit = new RateLimitError();
    expect(rateLimit.statusCode).toBe(429);
    expect(rateLimit.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('marks all AppError subclasses as operational', () => {
    const appErr = new AppError('Generic error', 500);
    expect(appErr.isOperational).toBe(true);
  });
});
