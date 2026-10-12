import { z } from 'zod';
import { eq, and, ilike } from 'drizzle-orm';
import { documents } from '@openagent/db';
import type { ToolDefinition } from '../types.js';

export const searchApprovedPagesInputSchema = z.object({
  query: z.string().min(2, 'Query must be at least 2 characters').max(100),
  limit: z.number().int().min(1).max(5).default(3),
});

export type SearchApprovedPagesInput = z.infer<typeof searchApprovedPagesInputSchema>;

export const searchApprovedPagesTool: ToolDefinition<SearchApprovedPagesInput> = {
  id: 'search_approved_pages',
  name: 'Search Approved Website Pages',
  description: 'Search approved, verified website pages and articles ingested for this site to retrieve factual URLs and snippets.',
  category: 'content',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 5000,
  inputSchema: searchApprovedPagesInputSchema,
  execute: async (input, ctx) => {
    const { query, limit } = input;
    const db = ctx.db;

    // Search documents for this site
    let results: Array<{ id: string; title: string; sourceUrl: string | null; snippet: string }> = [];

    if (db && typeof db.select === 'function') {
      try {
        const found = await db
          .select({
            id: documents.id,
            title: documents.title,
            sourceUrl: documents.sourceUrl,
            content: documents.content,
          })
          .from(documents)
          .where(
            and(
              eq(documents.siteId, ctx.siteId),
              eq(documents.status, 'ready'),
              ilike(documents.content, `%${query}%`)
            )
          )
          .limit(limit);

        results = found.map((d: any) => ({
          id: d.id,
          title: d.title,
          sourceUrl: d.sourceUrl,
          snippet: d.content ? d.content.slice(0, 250) + '...' : '',
        }));
      } catch {
        results = [];
      }
    }

    // Fallback to configured static pages in config if DB returns none
    if (results.length === 0 && ctx.config?.pages) {
      const q = query.toLowerCase();
      const pages = (ctx.config.pages as any[]).filter(
        (p) => p.title?.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q)
      );
      results = pages.slice(0, limit).map((p) => ({
        id: p.id || 'page-1',
        title: p.title,
        sourceUrl: p.url,
        snippet: p.content ? p.content.slice(0, 250) : '',
      }));
    }

    return {
      query,
      matchCount: results.length,
      pages: results,
    };
  },
};
