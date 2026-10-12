import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const orderStatusInputSchema = z.object({
  orderId: z.string().min(3, 'Order ID must be at least 3 characters').max(50),
  verificationEmail: z.string().email('Order verification email is required for privacy protection'),
});

export type OrderStatusInput = z.infer<typeof orderStatusInputSchema>;

export const orderStatusTool: ToolDefinition<OrderStatusInput> = {
  id: 'lookup_order_status',
  name: 'Lookup Order Status',
  description: 'Lookup current delivery and fulfillment status of an order. Requires the Order ID and matching billing email to safeguard visitor privacy.',
  category: 'commerce',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 5000,
  inputSchema: orderStatusInputSchema,
  execute: async (input, ctx) => {
    const { orderId, verificationEmail } = input;
    const connectorConfig = ctx.config?.orderConnector;

    // Check if real backend connector exists
    if (!connectorConfig || !connectorConfig.enabled) {
      return {
        configured: false,
        orderId,
        message: 'Order management backend integration is not configured for this website. Please contact support with your order number.',
      };
    }

    // In a live integration, query order API or ERP using connectorConfig.apiKey
    // Check against mock/configured orders or verify email match
    const ordersMap = connectorConfig.orders || {
      'ORD-1001': {
        email: 'alice@example.com',
        status: 'shipped',
        carrier: 'FedEx',
        trackingNumber: 'FDX-99887766',
        estimatedDelivery: '2026-10-14',
        items: ['Ergonomic Desk Chair', 'Lumbar Cushion'],
      },
      'ORD-1002': {
        email: 'bob@example.com',
        status: 'processing',
        carrier: 'USPS',
        trackingNumber: 'Pending dispatch',
        estimatedDelivery: '2026-10-18',
        items: ['Wireless Noise Canceling Headphones'],
      },
    };

    const found = ordersMap[orderId];
    if (!found) {
      return {
        configured: true,
        orderId,
        found: false,
        message: `Order ${orderId} was not found. Please verify the order number on your receipt.`,
      };
    }

    // Strict privacy defense: verify email matches
    if (found.email.toLowerCase() !== verificationEmail.toLowerCase()) {
      return {
        configured: true,
        orderId,
        found: false,
        message: 'Verification failed: The email provided does not match the order records.',
      };
    }

    return {
      configured: true,
      found: true,
      orderId,
      status: found.status,
      carrier: found.carrier,
      trackingNumber: found.trackingNumber,
      estimatedDelivery: found.estimatedDelivery,
      items: found.items,
      message: `Order ${orderId} is currently ${found.status}. Estimated delivery date is ${found.estimatedDelivery}.`,
    };
  },
};
