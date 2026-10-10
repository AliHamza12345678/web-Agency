import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('API Core Middleware & Routing', () => {
  const app = createApp();

  describe('Request ID Middleware', () => {
    it('generates a new x-request-id header when not provided by client', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);

      const requestId = res.headers.get('x-request-id');
      expect(requestId).toBeDefined();
      expect(requestId?.length).toBeGreaterThan(10);
    });

    it('preserves client-provided x-request-id', async () => {
      const clientReqId = 'custom-trace-id-12345';
      const res = await app.request('/', {
        headers: {
          'x-request-id': clientReqId,
        },
      });

      expect(res.headers.get('x-request-id')).toBe(clientReqId);
    });
  });

  describe('404 Route Handling', () => {
    it('returns structured JSON error response for non-existent routes', async () => {
      const res = await app.request('/api/v1/non-existent-endpoint');
      expect(res.status).toBe(404);

      const json = (await res.json()) as { success: boolean; error: { code: string; message: string; requestId: string } };
      expect(json.success).toBe(false);
      expect(json.error.code).toBe('NOT_FOUND');
      expect(json.error.message).toContain('/api/v1/non-existent-endpoint');
      expect(json.error.requestId).toBeDefined();
    });
  });

  describe('Root Endpoint', () => {
    it('returns operational status payload', async () => {
      const res = await app.request('/');
      expect(res.status).toBe(200);

      const json = (await res.json()) as { name: string; status: string };
      expect(json.name).toBe('OpenAgent Chat API');
      expect(json.status).toBe('operational');
    });
  });
});
