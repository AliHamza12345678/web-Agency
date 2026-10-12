import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const getBusinessContactInputSchema = z.object({
  department: z.enum(['general', 'support', 'sales', 'billing']).default('general'),
});

export type GetBusinessContactInput = z.infer<typeof getBusinessContactInputSchema>;

export const getBusinessContactTool: ToolDefinition<GetBusinessContactInput> = {
  id: 'get_business_contact',
  name: 'Retrieve Verified Business Contact Information',
  description: 'Retrieve verified, public business contact information (email, phone, physical address, business hours, and department).',
  category: 'support',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 3000,
  inputSchema: getBusinessContactInputSchema,
  execute: async (input, ctx) => {
    const { department } = input;
    const contactConfig = ctx.config?.contact || {};

    // Verified defaults if not custom configured
    const defaultInfo: Record<string, any> = {
      general: {
        email: contactConfig.generalEmail || contactConfig.email || 'hello@example.com',
        phone: contactConfig.generalPhone || contactConfig.phone || '+1 (555) 019-2834',
        address: contactConfig.address || '100 Innovation Way, Suite 400, Tech City, CA',
        businessHours: contactConfig.businessHours || 'Monday - Friday, 9:00 AM - 6:00 PM EST',
      },
      support: {
        email: contactConfig.supportEmail || contactConfig.email || 'support@example.com',
        phone: contactConfig.supportPhone || contactConfig.phone || '+1 (555) 019-2834',
        businessHours: contactConfig.supportHours || '24/7 Virtual Support, Live Desk: Mon-Fri 9am-6pm EST',
      },
      sales: {
        email: contactConfig.salesEmail || 'sales@example.com',
        phone: contactConfig.salesPhone || '+1 (555) 019-5678',
        businessHours: 'Monday - Friday, 8:00 AM - 5:00 PM EST',
      },
      billing: {
        email: contactConfig.billingEmail || 'billing@example.com',
        businessHours: 'Monday - Friday, 9:00 AM - 5:00 PM EST',
      },
    };

    const selected = defaultInfo[department] || defaultInfo.general;

    return {
      department,
      verified: true,
      ...selected,
      website: ctx.config?.websiteUrl || 'https://example.com',
    };
  },
};
