import { z } from 'zod';
import { eq, and, ilike } from 'drizzle-orm';
import { products } from '@openagent/db';
import type { ToolDefinition } from '../types.js';

export const searchProductCatalogInputSchema = z.object({
  query: z.string().min(1, 'Product search term cannot be empty').max(100),
  category: z.string().max(50).optional(),
  maxPrice: z.number().positive().optional(),
  inStockOnly: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(10).default(5),
});

export type SearchProductCatalogInput = z.infer<typeof searchProductCatalogInputSchema>;

export const searchProductCatalogTool: ToolDefinition<SearchProductCatalogInput> = {
  id: 'search_product_catalog',
  name: 'Search Product Catalog',
  description: 'Search configured store products by name, category, maximum price, and stock status.',
  category: 'commerce',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 5000,
  inputSchema: searchProductCatalogInputSchema,
  execute: async (input, ctx) => {
    const { query, category, maxPrice, inStockOnly, limit } = input;
    const db = ctx.db;

    let items: Array<{
      sku: string;
      name: string;
      description: string;
      price: number;
      currency: string;
      inStock: boolean;
      category?: string | null;
      url?: string | null;
    }> = [];

    // 1. Try querying DB products
    if (db && typeof db.select === 'function') {
      try {
        const rows = await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.siteId, ctx.siteId),
              ilike(products.name, `%${query}%`)
            )
          )
          .limit(limit);

        items = rows.map((r: any) => ({
          sku: r.sku,
          name: r.name,
          description: r.description,
          price: r.price / 100, // convert cents to currency
          currency: r.currency,
          inStock: r.inStock,
          category: r.category,
          url: r.url,
        }));
      } catch {
        items = [];
      }
    }

    // 2. Fallback to catalog configured in site integration config
    if (items.length === 0 && Array.isArray(ctx.config?.catalog)) {
      const q = query.toLowerCase();
      const filtered = ctx.config.catalog.filter((prod: any) => {
        const matchesName = prod.name?.toLowerCase().includes(q) || prod.description?.toLowerCase().includes(q);
        const matchesCat = !category || prod.category?.toLowerCase() === category.toLowerCase();
        const matchesPrice = !maxPrice || prod.price <= maxPrice;
        const matchesStock = !inStockOnly || prod.inStock === true;
        return matchesName && matchesCat && matchesPrice && matchesStock;
      });

      items = filtered.slice(0, limit).map((p: any) => ({
        sku: p.sku || `SKU-${p.id}`,
        name: p.name,
        description: p.description || '',
        price: p.price,
        currency: p.currency || 'USD',
        inStock: p.inStock ?? true,
        category: p.category,
        url: p.url,
      }));
    }

    // Additional filtering for DB items
    if (category) {
      items = items.filter((i) => i.category?.toLowerCase() === category.toLowerCase());
    }
    if (maxPrice) {
      items = items.filter((i) => i.price <= maxPrice);
    }
    if (inStockOnly) {
      items = items.filter((i) => i.inStock === true);
    }

    return {
      query,
      foundCount: items.length,
      products: items.slice(0, limit),
    };
  },
};
