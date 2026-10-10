import crypto from 'node:crypto';
import { getDb, documents, documentChunks } from '@openagent/db';
import { eq, and } from 'drizzle-orm';
import { safeFetch } from '../crawler/ssrf-guard.js';
import { extractPageContent } from '../crawler/html-extractor.js';
import { fetchAndParseSitemap } from '../crawler/sitemap-parser.js';
import { parseFaqEntries } from '../crawler/file-parsers.js';
import { RecursiveChunker } from '../chunker/recursive-chunker.js';
import { EmbeddingService } from '../embeddings/embedding-service.js';
import type { IngestedDocumentResult, DocumentType } from '../types.js';

export class IngestionPipeline {
  private chunker: RecursiveChunker;
  private embeddingService: EmbeddingService;

  constructor(chunker?: RecursiveChunker, embeddingService?: EmbeddingService) {
    this.chunker = chunker || new RecursiveChunker();
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content.trim()).digest('hex');
  }

  /**
   * Ingests a single public web page URL.
   */
  public async ingestUrl(
    siteId: string,
    rawUrl: string,
    allowedDomains: string[] = []
  ): Promise<IngestedDocumentResult> {
    const db = getDb();

    // 1. Fetch content safely with SSRF protection
    const fetchRes = await safeFetch(rawUrl, { allowedDomains });
    const extracted = extractPageContent(fetchRes.bodyText, fetchRes.url);

    const contentHash = this.calculateHash(extracted.text);

    // 2. Check for identical duplicate document to avoid redundant embedding compute
    const [existing] = await db
      .select({ id: documents.id, contentHash: documents.contentHash, status: documents.status })
      .from(documents)
      .where(and(eq(documents.siteId, siteId), eq(documents.sourceUrl, rawUrl)))
      .limit(1);

    if (existing && existing.contentHash === contentHash && existing.status === 'ready') {
      // Content has not changed; return existing record
      const chunkRows = await db
        .select({ id: documentChunks.id })
        .from(documentChunks)
        .where(eq(documentChunks.documentId, existing.id));

      return {
        documentId: existing.id,
        siteId,
        title: extracted.title,
        sourceUrl: rawUrl,
        type: 'url',
        status: 'ready',
        chunkCount: chunkRows.length,
        contentHash,
      };
    }

    // 3. Upsert document record in 'processing' status
    let docId = existing?.id;
    if (docId) {
      await db
        .update(documents)
        .set({
          title: extracted.title,
          content: extracted.text,
          contentHash,
          status: 'processing',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, docId));

      // Remove existing stale chunks
      await db.delete(documentChunks).where(eq(documentChunks.documentId, docId));
    } else {
      const [inserted] = await db
        .insert(documents)
        .values({
          siteId,
          title: extracted.title,
          sourceUrl: rawUrl,
          content: extracted.text,
          type: 'url',
          status: 'processing',
          contentHash,
        })
        .returning({ id: documents.id });
      docId = inserted!.id;
    }

    // 4. Chunk content
    const chunks = this.chunker.chunk(extracted.text, extracted.title);

    // 5. Generate embeddings
    const embeddings = await this.embeddingService.embedBatch(chunks.map((c) => c.content));

    // 6. Insert chunks into DB
    if (chunks.length > 0) {
      const chunkRecords = chunks.map((chunk, idx) => ({
        documentId: docId!,
        siteId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: embeddings[idx],
        metadata: {
          heading: chunk.heading,
          sourceUrl: rawUrl,
        },
      }));

      await db.insert(documentChunks).values(chunkRecords);
    }

    // 7. Mark document ready
    await db
      .update(documents)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(documents.id, docId));

    return {
      documentId: docId,
      siteId,
      title: extracted.title,
      sourceUrl: rawUrl,
      type: 'url',
      status: 'ready',
      chunkCount: chunks.length,
      contentHash,
    };
  }

  /**
   * Ingests a full XML sitemap.
   */
  public async ingestSitemap(
    siteId: string,
    sitemapUrl: string,
    allowedDomains: string[] = [],
    maxPages = 25
  ): Promise<IngestedDocumentResult[]> {
    const urls = await fetchAndParseSitemap(sitemapUrl, allowedDomains, maxPages);
    const results: IngestedDocumentResult[] = [];

    for (const url of urls) {
      try {
        const res = await this.ingestUrl(siteId, url, allowedDomains);
        results.push(res);
      } catch (err: any) {
        // Record crawl failure in DB so it is visible in dashboard
        const db = getDb();
        const [failedDoc] = await db
          .insert(documents)
          .values({
            siteId,
            title: url,
            sourceUrl: url,
            content: '',
            type: 'url',
            status: 'failed',
            errorMessage: err.message,
          })
          .returning({ id: documents.id });

        results.push({
          documentId: failedDoc!.id,
          siteId,
          title: url,
          sourceUrl: url,
          type: 'url',
          status: 'failed',
          chunkCount: 0,
          contentHash: '',
          errorMessage: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Ingests structured FAQ entries.
   */
  public async ingestFaq(
    siteId: string,
    faqPairs: Array<{ question: string; answer: string }>,
    title = 'Website FAQs'
  ): Promise<IngestedDocumentResult> {
    const parsed = parseFaqEntries(faqPairs, title);
    return this.ingestText(siteId, parsed.title, parsed.text, 'faq', parsed.metadata);
  }

  /**
   * Ingests raw text, markdown, policies, or uploaded file text.
   */
  public async ingestText(
    siteId: string,
    title: string,
    content: string,
    type: DocumentType = 'policy',
    metadata: Record<string, any> = {}
  ): Promise<IngestedDocumentResult> {
    const db = getDb();
    const contentHash = this.calculateHash(content);

    // 1. Create document
    const [inserted] = await db
      .insert(documents)
      .values({
        siteId,
        title,
        content,
        type,
        status: 'processing',
        contentHash,
        metadata,
      })
      .returning({ id: documents.id });

    const docId = inserted!.id;

    // 2. Chunk
    const chunks = this.chunker.chunk(content, title);

    // 3. Embed
    const embeddings = await this.embeddingService.embedBatch(chunks.map((c) => c.content));

    // 4. Save chunks
    if (chunks.length > 0) {
      const records = chunks.map((chunk, idx) => ({
        documentId: docId,
        siteId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: embeddings[idx],
        metadata: {
          heading: chunk.heading,
        },
      }));

      await db.insert(documentChunks).values(records);
    }

    // 5. Ready
    await db
      .update(documents)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(documents.id, docId));

    return {
      documentId: docId,
      siteId,
      title,
      type,
      status: 'ready',
      chunkCount: chunks.length,
      contentHash,
    };
  }

  /**
   * Removes a document and all associated chunks atomically.
   */
  public async deleteDocument(siteId: string, documentId: string): Promise<boolean> {
    const db = getDb();

    // Verify document belongs to the specified site before deleting
    const deleted = await db
      .delete(documents)
      .where(and(eq(documents.id, documentId), eq(documents.siteId, siteId)))
      .returning({ id: documents.id });

    return deleted.length > 0;
  }
}
