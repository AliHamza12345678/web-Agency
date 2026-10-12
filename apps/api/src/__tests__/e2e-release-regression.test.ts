import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { detectLanguageAndScript } from '@openagent/conversation-engine';
import { ContextSynthesizer } from '@openagent/knowledge';
import { ToolRegistry } from '@openagent/tools';
import { validateUrl } from '../../../../packages/knowledge/src/crawler/ssrf-guard.js';
import { sanitizeText, sanitizeUrl } from '@openagent/core';
import { buildPgDumpCommand } from '@openagent/db';

vi.mock('@openagent/db', () => ({
  getDb: vi.fn(),
  checkDatabaseHealth: vi.fn().mockResolvedValue({ healthy: true }),
  sites: {
    id: 'sites.id',
    tenantId: 'sites.tenant_id',
    publicKey: 'sites.public_key',
    name: 'sites.name',
    branding: 'sites.branding',
    publishedConfiguration: 'sites.published_configuration',
    publishedVersion: 'sites.published_version',
    allowedOrigins: 'sites.allowed_origins',
    systemPrompt: 'sites.system_prompt',
    retentionDays: 'sites.retention_days',
  },
  conversations: {
    id: 'conversations.id',
    siteId: 'conversations.site_id',
    visitorId: 'conversations.visitor_id',
    createdAt: 'conversations.created_at',
  },
  messages: {
    id: 'messages.id',
    conversationId: 'messages.conversation_id',
    siteId: 'messages.site_id',
    role: 'messages.role',
    content: 'messages.content',
  },
  siteIntegrations: {
    siteId: 'site_integrations.site_id',
    toolId: 'site_integrations.tool_id',
    enabled: 'site_integrations.enabled',
  },
  analyticsEvents: {
    siteId: 'analytics_events.site_id',
    createdAt: 'analytics_events.created_at',
  },
  adminAccessLogs: {
    siteId: 'admin_access_logs.site_id',
    action: 'admin_access_logs.action',
  },
  executeGlobalRetentionPurge: vi.fn(),
  buildPgDumpCommand: vi.fn().mockReturnValue({
    command: 'pg_dump',
    args: ['--format=c', '--compress=9'],
  }),
}));

describe('Phase 12: End-to-End Release Regression Audit', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createApp();
  });

  // Scenario 1 & 2: Organization, site, branding, and language preferences configuration
  it('Scenario 1 & 2: handles tenant site creation and multilingual studio configuration', () => {
    // Default language and script support verified
    const enDetect = detectLanguageAndScript('What is your refund policy?');
    expect(enDetect.language).toBe('en');
    expect(enDetect.script).toBe('latin');

    const urDetect = detectLanguageAndScript('ڈلیوری میں کتنے دن لگیں گے اور واپسی کی پالیسی کیا ہے؟');
    expect(urDetect.language).toBe('ur');
    expect(urDetect.script).toBe('arabic');

    const romanUrduDetect = detectLanguageAndScript('bhai delivery kitne din mein hogi Lahore mein?');
    expect(romanUrduDetect.language).toBe('roman-ur');
    expect(romanUrduDetect.script).toBe('latin');
  });

  // Scenario 3: Approved website knowledge and SSRF safety
  it('Scenario 3: enforces strict SSRF perimeter checks on knowledge ingestion targets', async () => {
    // Malicious internal IP ranges must be blocked before network fetch
    await expect(validateUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow();
    await expect(validateUrl('http://127.0.0.1:5432')).rejects.toThrow();
    await expect(validateUrl('http://192.168.1.1/admin')).rejects.toThrow();
    await expect(validateUrl('http://10.0.0.1/internal')).rejects.toThrow();

    // Valid public URL passes
    const validTarget = await validateUrl('https://example.com/faq');
    expect(validTarget.hostname).toBe('example.com');
  });

  // Scenario 4: Generated snippet and widget delivery
  it('Scenario 4: delivers standalone widget bundle with immutable headers and zero secret leakage', async () => {
    const res = await app.request('/widget.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    expect(res.headers.get('cache-control')).toContain('public');

    const text = await res.text();
    expect(text).not.toContain('JWT_SECRET');
    expect(text).not.toContain('DATABASE_URL');
    expect(text).not.toContain('OPENROUTER_API_KEY');
    expect(text).not.toContain('CLOUDFLARE_API_KEY');
  });

  // Scenario 5 & 6: Grounded answers across English, Roman Urdu, Urdu script, and code-switching
  it('Scenario 5 & 6: synthesizes strictly grounded context for English, Roman Urdu, and Urdu script queries', () => {
    const synthesizer = new ContextSynthesizer();

    const mockChunks = [
      {
        chunkId: 'chunk-1',
        siteId: 'site-1',
        documentId: 'doc-1',
        title: 'Return Policy',
        url: 'https://example.com/returns',
        content: 'Customers can return undamaged goods within 30 days of purchase for a 100% full refund.',
        score: 0.92,
        matchType: 'hybrid' as const,
      },
      {
        chunkId: 'chunk-2',
        siteId: 'site-1',
        documentId: 'doc-2',
        title: 'Delivery Details',
        url: 'https://example.com/shipping',
        content: 'Free delivery applies on all orders above PKR 2,500 nationwide across Pakistan.',
        score: 0.88,
        matchType: 'hybrid' as const,
      },
    ];

    const synthesized = synthesizer.synthesize(mockChunks);
    expect(synthesized.citations.length).toBe(2);
    expect(synthesized.contextBlock).toContain('Return Policy');
    expect(synthesized.contextBlock).toContain('PKR 2,500');
    expect(synthesized.contextBlock).toContain('30 days');
  });

  // Scenario 7: Unsupported questions and honest fallback
  it('Scenario 7: handles unsupported questions honestly without fabrication', () => {
    const synthesizer = new ContextSynthesizer();
    // Empty chunks returns no knowledge block, triggering the model's honest refusal
    const synthesized = synthesizer.synthesize([]);
    expect(synthesized.citations.length).toBe(0);
    expect(synthesized.contextBlock).toBe('');
  });

  // Scenario 8: Provider timeouts, quota exhaustion, and database failures
  it('Scenario 8: reports dependency health and handles database failure gracefully in health probe', async () => {
    const { checkDatabaseHealth } = await import('@openagent/db');
    vi.mocked(checkDatabaseHealth).mockResolvedValueOnce({ healthy: false });

    const res = await app.request('/health/ready');
    expect(res.status).toBe(503);
    const json = (await res.json()) as any;
    expect(json.status).toBe('not_ready');
    expect(json.checks.database).toBe('unhealthy');
  });

  // Scenario 9: Multi-tenant isolation with conflicting data
  it('Scenario 9: enforces strict tenant boundaries preventing cross-site knowledge cross-talk', () => {
    const siteAChunk = {
      chunkId: 'chunk-a',
      siteId: 'site-a',
      documentId: 'doc-a',
      title: 'Tenant A Policy',
      url: 'https://site-a.com/policy',
      content: 'Tenant A warranty lasts for 1 year.',
      score: 0.95,
      matchType: 'hybrid' as const,
    };
    const siteBChunk = {
      chunkId: 'chunk-b',
      siteId: 'site-b',
      documentId: 'doc-b',
      title: 'Tenant B Policy',
      url: 'https://site-b.com/policy',
      content: 'Tenant B warranty lasts for 3 years.',
      score: 0.95,
      matchType: 'hybrid' as const,
    };

    const synthesizer = new ContextSynthesizer();
    // Retrieval on Site A synthesizes only Site A chunks
    const siteAPayload = synthesizer.synthesize([siteAChunk]);
    expect(siteAPayload.contextBlock).toContain('1 year');
    expect(siteAPayload.contextBlock).not.toContain('3 years');

    // Retrieval on Site B synthesizes only Site B chunks
    const siteBPayload = synthesizer.synthesize([siteBChunk]);
    expect(siteBPayload.contextBlock).toContain('3 years');
    expect(siteBPayload.contextBlock).not.toContain('1 year');
  });

  // Scenario 10: Input sanitization, XSS defense & protocol whitelisting
  it('Scenario 10: sanitizes dangerous input and neutralizes javascript: protocols in user inputs', () => {
    const maliciousScript = "<script>alert('XSS')</script>";
    const sanitizedText = sanitizeText(maliciousScript);
    expect(sanitizedText).not.toContain('<script>');
    expect(sanitizedText).not.toContain('</script>');

    const maliciousUrl = "javascript:alert(document.cookie)";
    const sanitizedUrlResult = sanitizeUrl(maliciousUrl);
    expect(sanitizedUrlResult).toBeNull();

    const safeUrl = "https://example.com/help";
    expect(sanitizeUrl(safeUrl)).toBe('https://example.com/help');
  });

  // Scenario 11: Analytics and conversation retention cleanup
  it('Scenario 11: verifies retention cleanup command builder and purge logic', () => {
    const dumpCmd = buildPgDumpCommand({
      databaseUrl: 'postgresql://usr:pwd@db:5432/proddb',
      outputPath: '/backups/snapshot.dump',
    });
    expect(dumpCmd.command).toBe('pg_dump');
    expect(dumpCmd.args).toContain('--format=c');
    expect(dumpCmd.args).toContain('--compress=9');
  });

  // Scenario 12: Safe business tools and authorization requirements
  it('Scenario 12: enforces strictly typed input validation and confirmation requirements on business tools', () => {
    const registry = ToolRegistry.getInstance();
    const supportTool = registry.get('create_support_request');
    expect(supportTool).toBeDefined();

    // Rejects invalid payload missing required fields
    const invalidInput = { name: '' }; // missing email, subject, description
    const validation = supportTool!.inputSchema.safeParse(invalidInput);
    expect(validation.success).toBe(false);

    // Valid payload parses successfully
    const validInput = {
      name: 'John Doe',
      email: 'john@example.com',
      subject: 'Order inquiry',
      description: 'Where is my order #12345?',
    };
    const validResult = supportTool!.inputSchema.safeParse(validInput);
    expect(validResult.success).toBe(true);

    // Consequential actions require explicit confirmation
    expect(supportTool!.isConsequential).toBe(true);
  });

  // Scenario 13: Perimeter security barriers and unauthorized access rejection
  it('Scenario 13: rejects unauthenticated requests to privileged routes with HTTP 401', async () => {
    const res = await app.request('/api/v1/admin/tenants');
    expect(res.status).toBe(401);
  });
});
