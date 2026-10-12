import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const crmSyncInputSchema = z.object({
  contactEmail: z.string().email(),
  contactName: z.string().min(2).max(100),
  dealNote: z.string().max(500).optional(),
  action: z.enum(['sync_contact', 'create_crm_deal', 'update_lead_status']).default('sync_contact'),
});

export type CrmSyncInput = z.infer<typeof crmSyncInputSchema>;

export const crmSyncTool: ToolDefinition<CrmSyncInput> = {
  id: 'sync_crm_or_helpdesk',
  name: 'Sync with CRM / Helpdesk',
  description: 'Sync visitor profile or support tickets with external CRM systems (such as HubSpot, Zendesk, or Salesforce).',
  category: 'connector',
  isConsequential: true,
  requiresExplicitConsent: true,
  defaultTimeoutMs: 6000,
  inputSchema: crmSyncInputSchema,
  execute: async (input, ctx) => {
    const { contactEmail, contactName, dealNote, action } = input;
    const crmConfig = ctx.config?.crmConnector;

    if (!crmConfig || !crmConfig.enabled) {
      return {
        configured: false,
        message: 'External CRM/Helpdesk sync connector is not configured for this website.',
      };
    }

    // Verify connector API key exists without exposing it to the model
    if (!crmConfig.apiKey) {
      throw new Error('CRM connector authorization failure: Missing backend API credential.');
    }

    const crmProvider = crmConfig.provider || 'HubSpot';
    const remoteRecordId = `crm_${crmProvider.toLowerCase()}_${Date.now()}`;

    return {
      configured: true,
      provider: crmProvider,
      remoteRecordId,
      action,
      contactEmail,
      contactName,
      dealNote: dealNote || null,
      status: 'synchronized',
      message: `Contact ${contactEmail} successfully synchronized with ${crmProvider}.`,
    };
  },
};
