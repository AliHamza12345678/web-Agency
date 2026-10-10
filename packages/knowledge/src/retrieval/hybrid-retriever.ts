import { getDb, documentChunks, documents } from '@openagent/db';
import { eq, sql, desc } from 'drizzle-orm';
import { EmbeddingService } from '../embeddings/embedding-service.js';
import type { SearchResultChunk, HybridSearchOptions } from '../types.js';

export class HybridRetriever {
  private embeddingService: EmbeddingService;

  constructor(embeddingService?: EmbeddingService) {
    this.embeddingService = embeddingService || new EmbeddingService();
  }

  /**
   * Executes tenant-filtered hybrid retrieval (Semantic vector search + Lexical fallback).
   */
  public async search(options: HybridSearchOptions): Promise<SearchResultChunk[]> {
    const { query, siteId, topK = 4, minScore = 0.55 } = options;
    const db = getDb();

    const semanticResults: SearchResultChunk[] = [];

    // 1. Attempt Semantic Vector Search
    try {
      const queryEmbedding = await this.embeddingService.embedText(query);
      const vectorLiteral = `[${queryEmbedding.join(',')}]`;

      // STRICT TENANT FILTER: document_chunks.site_id = siteId
      const vectorRows = await db
        .select({
          chunkId: documentChunks.id,
          documentId: documentChunks.documentId,
          siteId: documentChunks.siteId,
          content: documentChunks.content,
          title: documents.title,
          sourceUrl: documents.sourceUrl,
          similarity: sql<number>`1 - (${documentChunks.embedding} <=> ${vectorLiteral}::vector)`,
        })
        .from(documentChunks)
        .innerJoin(documents, eq(documentChunks.documentId, documents.id))
        .where(
          sql`${documentChunks.siteId} = ${siteId} AND ${documentChunks.embedding} IS NOT NULL`
        )
        .orderBy(desc(sql`1 - (${documentChunks.embedding} <=> ${vectorLiteral}::vector)`))
        .limit(topK * 2);

      for (const row of vectorRows) {
        const score = Number(row.similarity);
        if (score >= minScore) {
          semanticResults.push({
            chunkId: row.chunkId,
            documentId: row.documentId,
            siteId: row.siteId,
            title: row.title,
            sourceUrl: row.sourceUrl || undefined,
            content: row.content,
            score,
            matchType: 'semantic',
          });
        }
      }
    } catch {
      // Vector extension or live embedding provider unavailable; proceed to lexical fallback
    }

    // 2. Lexical Fallback / Augmentation (Keyword matching strictly filtered by siteId)
    const keywords = query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 6);

    const lexicalResults: SearchResultChunk[] = [];

    if (keywords.length > 0) {
      try {
        const allSiteChunks = await db
          .select({
            chunkId: documentChunks.id,
            documentId: documentChunks.documentId,
            siteId: documentChunks.siteId,
            content: documentChunks.content,
            title: documents.title,
            sourceUrl: documents.sourceUrl,
          })
          .from(documentChunks)
          .innerJoin(documents, eq(documentChunks.documentId, documents.id))
          .where(eq(documentChunks.siteId, siteId))
          .limit(100);

        for (const row of allSiteChunks) {
          const contentLower = row.content.toLowerCase();
          const titleLower = row.title.toLowerCase();

          let matchCount = 0;
          for (const kw of keywords) {
            if (contentLower.includes(kw) || titleLower.includes(kw)) {
              matchCount++;
            }
          }

          if (matchCount > 0) {
            const score = Math.min(0.95, 0.4 + (matchCount / keywords.length) * 0.5);
            lexicalResults.push({
              chunkId: row.chunkId,
              documentId: row.documentId,
              siteId: row.siteId,
              title: row.title,
              sourceUrl: row.sourceUrl || undefined,
              content: row.content,
              score,
              matchType: 'lexical',
            });
          }
        }
      } catch {
        // DB query error handling
      }
    }

    // 3. Fusion & Deduplication
    const mergedMap = new Map<string, SearchResultChunk>();

    // Add semantic results first (priority)
    for (const item of semanticResults) {
      mergedMap.set(item.chunkId, item);
    }

    // Blend in lexical results if not already present or if semantic was unavailable
    for (const item of lexicalResults) {
      const existing = mergedMap.get(item.chunkId);
      if (!existing) {
        mergedMap.set(item.chunkId, item);
      } else {
        // Boost score if chunk was matched by BOTH semantic and lexical search
        existing.score = Math.min(0.99, existing.score * 0.7 + item.score * 0.3 + 0.1);
        existing.matchType = 'hybrid';
      }
    }

    // Sort by score descending and take topK
    const finalResults = Array.from(mergedMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return finalResults;
  }
}
