import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { knowledgeRouter } from '../routes/knowledge.js';
import { errorHandler } from '../middleware/error-handler.js';

// Mock DB
const mockSelect = vi.fn();
const mockDelete = vi.fn();
vi.mock('@openagent/db', () => ({
  getDb: () => ({
    select: mockSelect,
    delete: mockDelete,
  }),
  sites: {
    id: 'id',
    tenantId: 'tenant_id',
    allowedOrigins: 'allowed_origins',
  },
  documents: {
    id: 'id',
    siteId: 'site_id',
    title: 'title',
    sourceUrl: 'source_url',
    type: 'type',
    status: 'status',
    errorMessage: 'error_message',
    contentHash: 'content_hash',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  documentChunks: {
    id: 'id',
    documentId: 'document_id',
  },
}));

// Mock auth middleware
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: vi.fn(async (c: any, next: any) => {
    c.set('user', { userId: 'u_123', email: 'admin@org.com', isSuperAdmin: false });
    await next();
  }),
  requireTenantAccess: vi.fn(() => async (c: any, next: any) => {
    c.set('tenantRole', 'admin');
    await next();
  }),
}));

// Mock Ingestion Pipeline
vi.mock('@openagent/knowledge', () => ({
  IngestionPipeline: vi.fn().mockImplementation(() => ({
    ingestUrl: vi.fn().mockResolvedValue({
      documentId: 'doc_url_1',
      siteId: 'site_1',
      title: 'Crawled Page',
      sourceUrl: 'https://myshop.com',
      status: 'ready',
      chunkCount: 3,
    }),
    ingestSitemap: vi.fn().mockResolvedValue([
      { documentId: 'doc_1', siteId: 'site_1', title: 'Page 1', status: 'ready', chunkCount: 2 },
    ]),
    ingestFaq: vi.fn().mockResolvedValue({
      documentId: 'doc_faq_1',
      siteId: 'site_1',
      title: 'FAQs',
      status: 'ready',
      chunkCount: 2,
    }),
    ingestText: vi.fn().mockResolvedValue({
      documentId: 'doc_text_1',
      siteId: 'site_1',
      title: 'Store Policy',
      status: 'ready',
      chunkCount: 2,
    }),
    deleteDocument: vi.fn().mockResolvedValue(true),
  })),
}));

describe('Admin Knowledge Base Management Endpoints', () => {
  let app: Hono;

  beforeEach(() => {
    vi.clearAllMocks();
    app = new Hono();
    app.route('/api/v1/admin/tenants', knowledgeRouter);
    app.onError(errorHandler);
  });

  it('lists knowledge documents for an authorized site', async () => {
    mockSelect
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: 'site_1' }]),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              groupBy: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockResolvedValue([
                  {
                    id: 'doc_1',
                    siteId: 'site_1',
                    title: 'Return Policy',
                    type: 'policy',
                    status: 'ready',
                    chunkCount: 4,
                  },
                ]),
              }),
            }),
          }),
        }),
      });

    const res = await app.request('/api/v1/admin/tenants/t_1/sites/site_1/knowledge/documents');
    expect(res.status).toBe(200);

    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.length).toBe(1);
    expect(json.data[0].title).toBe('Return Policy');
  });

  it('crawls a webpage URL successfully', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'site_1', allowedOrigins: ['https://myshop.com'] }]),
        }),
      }),
    });

    const res = await app.request('/api/v1/admin/tenants/t_1/sites/site_1/knowledge/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://myshop.com/about',
        isSitemap: false,
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.documentId).toBe('doc_url_1');
  });

  it('ingests FAQ entries successfully', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'site_1' }]),
        }),
      }),
    });

    const res = await app.request('/api/v1/admin/tenants/t_1/sites/site_1/knowledge/faq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Store FAQs',
        faqPairs: [
          { question: 'What is shipping cost?', answer: 'Free over $50.' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.documentId).toBe('doc_faq_1');
  });

  it('deletes a document and invalidates retrievable chunks', async () => {
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 'site_1' }]),
        }),
      }),
    });

    const res = await app.request('/api/v1/admin/tenants/t_1/sites/site_1/knowledge/documents/doc_url_1', {
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.message).toContain('deleted');
  });
});
