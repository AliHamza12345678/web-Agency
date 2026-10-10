import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridRetriever } from '../retrieval/hybrid-retriever.js';
import { EmbeddingService } from '../embeddings/embedding-service.js';

// Mock DB
const mockSelect = vi.fn();
vi.mock('@openagent/db', () => ({
  getDb: () => ({
    select: mockSelect,
  }),
  documentChunks: {
    id: 'id',
    documentId: 'document_id',
    siteId: 'site_id',
    content: 'content',
    embedding: 'embedding',
  },
  documents: {
    id: 'id',
    siteId: 'site_id',
    title: 'title',
    sourceUrl: 'source_url',
  },
}));

describe('Hybrid Retriever & Cross-Tenant Site Isolation', () => {
  let embeddingService: EmbeddingService;
  let retriever: HybridRetriever;

  beforeEach(() => {
    vi.clearAllMocks();
    embeddingService = new EmbeddingService();
    retriever = new HybridRetriever(embeddingService);
  });

  it('strictly isolates knowledge between two sites with conflicting policies', async () => {
    const siteAId = 'site_aaa_111';
    const siteBId = 'site_bbb_222';

    // Mock DB: Site A only has 14-day policy
    const siteAChunks = [
      {
        chunkId: 'c_siteA_1',
        documentId: 'doc_A',
        siteId: siteAId,
        content: 'Site A Policy: Customers can return items within 14 days of purchase.',
        title: 'Return Policy Site A',
        sourceUrl: 'https://siteA.com/returns',
        similarity: 0.92,
      },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(siteAChunks),
            }),
          }),
        }),
      }),
    });

    // Query on Site A
    const resultsA = await retriever.search({
      query: 'What is the return policy window?',
      siteId: siteAId,
    });

    expect(resultsA.length).toBe(1);
    expect(resultsA[0]!.siteId).toBe(siteAId);
    expect(resultsA[0]!.content).toContain('14 days');
    expect(resultsA[0]!.content).not.toContain('60 days');

    // Mock DB: Site B only has 60-day policy
    const siteBChunks = [
      {
        chunkId: 'c_siteB_1',
        documentId: 'doc_B',
        siteId: siteBId,
        content: 'Site B Policy: Customers can return items within 60 days of purchase.',
        title: 'Return Policy Site B',
        sourceUrl: 'https://siteB.com/returns',
        similarity: 0.95,
      },
    ];

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(siteBChunks),
            }),
          }),
        }),
      }),
    });

    // Query on Site B
    const resultsB = await retriever.search({
      query: 'What is the return policy window?',
      siteId: siteBId,
    });

    expect(resultsB.length).toBe(1);
    expect(resultsB[0]!.siteId).toBe(siteBId);
    expect(resultsB[0]!.content).toContain('60 days');
    expect(resultsB[0]!.content).not.toContain('14 days');
  });

  it('falls back to lexical keyword matching when vector search returns no results or throws', async () => {
    // Vector search throws/fails
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockRejectedValue(new Error('Vector extension not found')),
            }),
          }),
        }),
      }),
    });

    // Lexical fallback query succeeds
    mockSelect.mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                chunkId: 'chunk_lex_1',
                documentId: 'doc_lex_1',
                siteId: 'site_123',
                content: 'Express shipping takes 24 hours for delivery.',
                title: 'Shipping FAQ',
                sourceUrl: 'https://example.com/faq',
              },
            ]),
          }),
        }),
      }),
    });

    const results = await retriever.search({
      query: 'express shipping delivery time',
      siteId: 'site_123',
    });

    expect(results.length).toBe(1);
    expect(results[0]!.matchType).toBe('lexical');
    expect(results[0]!.content).toContain('Express shipping takes 24 hours');
  });
});
