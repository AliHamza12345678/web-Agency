import { Hono } from 'hono';
import { z } from 'zod';
import {
  ValidationError,
  NotFoundError,
} from '@openagent/core';
import { getDb, sites, documents, documentChunks } from '@openagent/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { authMiddleware, requireTenantAccess } from '../middleware/auth.js';
import { IngestionPipeline } from '@openagent/knowledge';

export const knowledgeRouter = new Hono();

// All knowledge admin management routes require authentication and tenant access
knowledgeRouter.use('/:tenantId/sites/:siteId/knowledge/*', authMiddleware);

const crawlRequestSchema = z.object({
  url: z.string().url('A valid URL is required'),
  isSitemap: z.boolean().optional().default(false),
  maxPages: z.number().int().min(1).max(50).optional().default(15),
});

const faqRequestSchema = z.object({
  title: z.string().min(1).max(200).optional().default('Frequently Asked Questions'),
  faqPairs: z
    .array(
      z.object({
        question: z.string().min(1, 'Question cannot be empty').max(1000),
        answer: z.string().min(1, 'Answer cannot be empty').max(5000),
      })
    )
    .min(1, 'At least one FAQ question and answer pair is required'),
});

const textDocRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required').max(100000),
  type: z.enum(['policy', 'file', 'faq']).optional().default('policy'),
});

const pipeline = new IngestionPipeline();

/**
 * List all knowledge base documents for a site
 */
knowledgeRouter.get(
  '/:tenantId/sites/:siteId/knowledge/documents',
  requireTenantAccess('site:read'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const tenantId = c.req.param('tenantId');
    const db = getDb();

    // Verify site belongs to tenant
    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);

    if (!site) {
      throw new NotFoundError('Website was not found under this organization');
    }

    const docs = await db
      .select({
        id: documents.id,
        siteId: documents.siteId,
        title: documents.title,
        sourceUrl: documents.sourceUrl,
        type: documents.type,
        status: documents.status,
        errorMessage: documents.errorMessage,
        contentHash: documents.contentHash,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        chunkCount: sql<number>`count(${documentChunks.id})::int`,
      })
      .from(documents)
      .leftJoin(documentChunks, eq(documents.id, documentChunks.documentId))
      .where(eq(documents.siteId, siteId))
      .groupBy(documents.id)
      .orderBy(desc(documents.createdAt));

    return c.json({
      success: true,
      data: docs,
    });
  }
);

/**
 * Ingest URL or Sitemap
 */
knowledgeRouter.post(
  '/:tenantId/sites/:siteId/knowledge/crawl',
  requireTenantAccess('site:update'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const tenantId = c.req.param('tenantId');
    const db = getDb();

    const [site] = await db
      .select({ id: sites.id, allowedOrigins: sites.allowedOrigins })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);

    if (!site) {
      throw new NotFoundError('Website was not found under this organization');
    }

    const body = await c.req.json().catch(() => {
      throw new ValidationError('Malformed JSON payload');
    });

    const parsed = crawlRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation error', parsed.error.issues);
    }

    const { url, isSitemap, maxPages } = parsed.data;
    const allowedDomains = site.allowedOrigins || [];

    if (isSitemap) {
      const results = await pipeline.ingestSitemap(siteId, url, allowedDomains, maxPages);
      return c.json({
        success: true,
        data: results,
      });
    }

    const result = await pipeline.ingestUrl(siteId, url, allowedDomains);
    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * Ingest FAQs
 */
knowledgeRouter.post(
  '/:tenantId/sites/:siteId/knowledge/faq',
  requireTenantAccess('site:update'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const tenantId = c.req.param('tenantId');
    const db = getDb();

    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);

    if (!site) {
      throw new NotFoundError('Website was not found under this organization');
    }

    const body = await c.req.json().catch(() => {
      throw new ValidationError('Malformed JSON payload');
    });

    const parsed = faqRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation error', parsed.error.issues);
    }

    const { title, faqPairs } = parsed.data;
    const result = await pipeline.ingestFaq(siteId, faqPairs, title);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * Ingest Raw Text / Policy / File Content
 */
knowledgeRouter.post(
  '/:tenantId/sites/:siteId/knowledge/text',
  requireTenantAccess('site:update'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const tenantId = c.req.param('tenantId');
    const db = getDb();

    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);

    if (!site) {
      throw new NotFoundError('Website was not found under this organization');
    }

    const body = await c.req.json().catch(() => {
      throw new ValidationError('Malformed JSON payload');
    });

    const parsed = textDocRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('Validation error', parsed.error.issues);
    }

    const { title, content, type } = parsed.data;
    const result = await pipeline.ingestText(siteId, title, content, type);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * Delete a Document and its associated chunks
 */
knowledgeRouter.delete(
  '/:tenantId/sites/:siteId/knowledge/documents/:documentId',
  requireTenantAccess('site:update'),
  async (c) => {
    const siteId = c.req.param('siteId');
    const tenantId = c.req.param('tenantId');
    const documentId = c.req.param('documentId');
    const db = getDb();

    const [site] = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.tenantId, tenantId)))
      .limit(1);

    if (!site) {
      throw new NotFoundError('Website was not found under this organization');
    }

    const deleted = await pipeline.deleteDocument(siteId, documentId);
    if (!deleted) {
      throw new NotFoundError('Document was not found or was already deleted');
    }

    return c.json({
      success: true,
      message: 'Document and retrievable chunks were permanently deleted.',
    });
  }
);
