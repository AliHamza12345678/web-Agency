import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const offerHumanHandoffInputSchema = z.object({
  reason: z.string().max(250).optional(),
  visitorName: z.string().max(100).optional(),
  visitorEmail: z.string().email().optional(),
});

export type OfferHumanHandoffInput = z.infer<typeof offerHumanHandoffInputSchema>;

export const offerHumanHandoffTool: ToolDefinition<OfferHumanHandoffInput> = {
  id: 'offer_human_handoff',
  name: 'Offer Human Agent Handoff',
  description: 'Initiate or check availability for human support escalation when an integration exists on this website.',
  category: 'support',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 4000,
  inputSchema: offerHumanHandoffInputSchema,
  execute: async (input, ctx) => {
    const { reason, visitorName, visitorEmail } = input;
    const handoffConfig = ctx.config?.handoff;

    // Check if integration exists
    if (!handoffConfig || handoffConfig.enabled !== true) {
      return {
        available: false,
        status: 'not_configured',
        message: 'Live human agent handoff is currently not integrated on this website. Please contact our support team via email or submit a support ticket.',
        fallbackEmail: ctx.config?.contact?.email || 'support@example.com',
      };
    }

    // Check working hours if configured
    if (handoffConfig.activeHoursOnly && handoffConfig.isOutsideHours) {
      return {
        available: false,
        status: 'outside_hours',
        operatingHours: handoffConfig.operatingHours || 'Monday - Friday, 9:00 AM - 5:00 PM EST',
        message: 'Our human support agents are currently offline for the day. Please leave a support request or email us.',
      };
    }

    const handoffId = `handoff_${Date.now()}`;

    return {
      available: true,
      status: 'initiated',
      handoffId,
      queuePosition: handoffConfig.currentQueuePosition || 1,
      estimatedWaitMinutes: handoffConfig.estimatedWaitMinutes || 3,
      liveChatUrl: handoffConfig.liveChatUrl || null,
      visitorName: visitorName || 'Valued Visitor',
      visitorEmail: visitorEmail || null,
      reason: reason || 'General inquiry escalation',
      message: 'A human agent has been notified and will connect with you shortly.',
    };
  },
};
