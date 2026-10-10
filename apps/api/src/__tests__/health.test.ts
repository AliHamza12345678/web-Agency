import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('Health Endpoints', () => {
  const app = createApp();

  describe('GET /health/live', () => {
    it('returns status 200 and ok health payload', async () => {
      const res = await app.request('/health/live');
      expect(res.status).toBe(200);

      const json = (await res.json()) as { status: string; timestamp: string; uptimeSeconds: number };
      expect(json.status).toBe('ok');
      expect(json.timestamp).toBeDefined();
      expect(typeof json.uptimeSeconds).toBe('number');
    });
  });

  describe('GET /health/ready', () => {
    it('returns readiness payload and does NOT leak any secrets or database credentials', async () => {
      const res = await app.request('/health/ready');
      expect([200, 503]).toContain(res.status);

      const json = (await res.json()) as { status: string; timestamp: string; checks: { database: string } };
      expect(['ready', 'not_ready']).toContain(json.status);
      expect(json.checks).toBeDefined();
      expect(json.checks.database).toBeDefined();

      const rawJsonString = JSON.stringify(json);
      // Ensure zero secrets leaked
      expect(rawJsonString).not.toMatch(/password/i);
      expect(rawJsonString).not.toMatch(/secret/i);
      expect(rawJsonString).not.toMatch(/postgres:\/\//i);
      expect(rawJsonString).not.toMatch(/neon\.tech/i);
    });
  });
});
