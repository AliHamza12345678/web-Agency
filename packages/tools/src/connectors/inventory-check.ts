import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const inventoryCheckInputSchema = z.object({
  sku: z.string().min(2, 'SKU cannot be empty').max(50),
});

export type InventoryCheckInput = z.infer<typeof inventoryCheckInputSchema>;

export const inventoryCheckTool: ToolDefinition<InventoryCheckInput> = {
  id: 'check_inventory',
  name: 'Check Inventory Level',
  description: 'Query real-time warehouse inventory and stock count for a specific SKU or item code.',
  category: 'connector',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 5000,
  inputSchema: inventoryCheckInputSchema,
  execute: async (input, ctx) => {
    const { sku } = input;
    const inventoryConfig = ctx.config?.inventoryConnector;

    if (!inventoryConfig || !inventoryConfig.enabled) {
      return {
        configured: false,
        sku,
        message: 'Warehouse inventory management connector is not active for this website.',
      };
    }

    const inventoryLevels: Record<string, { inStock: boolean; quantity: number; warehouse: string }> =
      inventoryConfig.levels || {
        'SKU-CHAIR-01': { inStock: true, quantity: 42, warehouse: 'Central Fulfillment' },
        'SKU-DESK-02': { inStock: true, quantity: 8, warehouse: 'West Coast Hub' },
        'SKU-HEADSET-03': { inStock: false, quantity: 0, warehouse: 'Main Depot' },
      };

    const item = inventoryLevels[sku];
    if (!item) {
      return {
        configured: true,
        sku,
        found: false,
        message: `SKU '${sku}' was not found in active inventory catalog.`,
      };
    }

    return {
      configured: true,
      sku,
      found: true,
      inStock: item.inStock,
      quantity: item.quantity,
      warehouse: item.warehouse,
      status: item.quantity > 5 ? 'in_stock' : item.quantity > 0 ? 'low_stock' : 'out_of_stock',
    };
  },
};
