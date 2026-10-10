import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IngestionPipeline } from '../pipeline/ingestion-pipeline.js';
import { RecursiveChunker } from '../chunker/recursive-chunker.js';
import { EmbeddingService } from '../embeddings/embedding-service.js';

// Mock DB
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();

vi.mock('@openagent/db', () => ({
  getDb: () => ({
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  }),
  documents: {
    id: 'id',
    siteId: 'site_id',
    title: 'title',
    sourceUrl: 'source_url',
    content: 'content',
    type: 'type',
    status: 'status',
    contentHash: 'content_hash',
  },
  documentChunks: {
    id: 'id',
    documentId: 'document_id',
    siteId: 'site_id',
    chunkIndex: 'chunk_index',
    content: 'content',
    embedding: 'embedding',
  },
}));

describe('Ingestion Pipeline & Content Deduplication', () => {
  let pipeline: IngestionPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    pipeline = new IngestionPipeline(
      new RecursiveChunker({ chunkSize: 300 }),
      new EmbeddingService()
    );
  });

  it('ingests raw text and saves document and chunks with embeddings', async () => {
    mockInsert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'doc_123' }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockResolvedValue([]),
      });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await pipeline.ingestText(
      'site_1',
      'Store Policy',
      'We offer free returns within 30 days of purchase for all items.',
      'policy'
    );

    expect(res.documentId).toBe('doc_123');
    expect(res.siteId).toBe('site_1');
    expect(res.status).toBe('ready');
    expect(res.chunkCount).toBeGreaterThan(0);
    expect(res.contentHash.length).toBe(64); // SHA-256 hex length
    expect(mockInsert).toHaveBeenCalledTimes(2); // 1 for document, 1 for chunks
  });

  it('ingests FAQ entries correctly into structured Q&A format', async () => {
    mockInsert
      .mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: 'faq_doc_1' }]),
        }),
      })
      .mockReturnValueOnce({
        values: vi.fn().mockResolvedValue([]),
      });

    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const res = await pipeline.ingestFaq('site_1', [
      { question: 'What is shipping cost?', answer: 'Shipping is free over $50.' },
      { question: 'Do you deliver to Canada?', answer: 'Yes, with $15 flat rate.' },
    ]);

    expect(res.documentId).toBe('faq_doc_1');
    expect(res.type).toBe('faq');
    expect(res.status).toBe('ready');
  });

  it('deletes document and all associated chunks atomically', async () => {
    mockDelete.mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'doc_to_delete' }]),
      }),
    });

    const success = await pipeline.deleteDocument('site_1', 'doc_to_delete');
    expect(success).toBe(true);
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });
});
