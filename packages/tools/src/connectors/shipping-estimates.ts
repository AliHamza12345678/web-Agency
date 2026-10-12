import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const shippingEstimatesInputSchema = z.object({
  country: z.string().min(2).max(60),
  postalCode: z.string().max(20).optional(),
  weightKg: z.number().positive().max(100).optional().default(1.0),
});

export type ShippingEstimatesInput = z.infer<typeof shippingEstimatesInputSchema>;

export const shippingEstimatesTool: ToolDefinition<ShippingEstimatesInput> = {
  id: 'get_shipping_estimates',
  name: 'Get Shipping Estimates',
  description: 'Estimate shipping fees and carrier transit durations based on destination country and postal code.',
  category: 'connector',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 5000,
  inputSchema: shippingEstimatesInputSchema,
  execute: async (input, ctx) => {
    const { country, postalCode, weightKg } = input;
    const shippingConfig = ctx.config?.shippingConnector;

    if (!shippingConfig || !shippingConfig.enabled) {
      return {
        configured: false,
        country,
        message: 'Live carrier shipping calculator integration is not configured for this website.',
      };
    }

    const isDomestic = ['us', 'usa', 'united states'].includes(country.toLowerCase());

    const rates = isDomestic
      ? [
          { method: 'Standard Ground', carrier: 'USPS', cost: 5.99, estimatedDays: '3-5 business days' },
          { method: 'Priority Expedited', carrier: 'FedEx', cost: 14.5, estimatedDays: '2 business days' },
          { method: 'Next Day Air', carrier: 'UPS', cost: 28.0, estimatedDays: '1 business day' },
        ]
      : [
          { method: 'International Economy', carrier: 'DHL Global', cost: 19.99, estimatedDays: '7-14 business days' },
          { method: 'International Express', carrier: 'DHL Express', cost: 38.5, estimatedDays: '3-5 business days' },
        ];

    return {
      configured: true,
      destination: { country, postalCode },
      weightKg,
      currency: 'USD',
      shippingOptions: rates,
    };
  },
};
