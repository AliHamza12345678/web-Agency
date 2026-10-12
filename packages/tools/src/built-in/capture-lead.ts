import { z } from 'zod';
import { leads } from '@openagent/db';
import type { ToolDefinition } from '../types.js';

export const captureLeadInputSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Valid email address is required'),
  phone: z.string().max(30).optional(),
  interest: z.string().max(250).optional(),
  consentGiven: z.boolean({
    required_error: 'Explicit consent is mandatory to capture visitor details',
  }),
  idempotencyKey: z.string().max(100).optional(),
});

export type CaptureLeadInput = z.infer<typeof captureLeadInputSchema>;

export const captureLeadTool: ToolDefinition<CaptureLeadInput> = {
  id: 'capture_lead',
  name: 'Capture Lead with Explicit Consent',
  description: 'Record visitor contact details and inquiry interest for business follow-up. REQUIRES explicit, affirmative visitor consent.',
  category: 'support',
  isConsequential: false,
  requiresExplicitConsent: true,
  defaultTimeoutMs: 5000,
  inputSchema: captureLeadInputSchema,
  execute: async (input, ctx) => {
    const { name, email, phone, interest, consentGiven, idempotencyKey } = input;

    // Strict safety check: Explicit consent MUST be affirmative true
    if (consentGiven !== true) {
      throw new Error('CONSENT_REQUIRED: Visitor must explicitly agree to have their contact information recorded.');
    }

    const db = ctx.db;
    const consentTimestamp = new Date();
    let leadId = `lead_${Date.now()}`;

    if (db && typeof db.insert === 'function') {
      try {
        const [inserted] = await db
          .insert(leads)
          .values({
            siteId: ctx.siteId,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            phone: phone ? phone.trim() : null,
            interest: interest ? interest.trim() : null,
            consentGiven: true,
            consentTimestamp,
            idempotencyKey: idempotencyKey || null,
          })
          .returning({ id: leads.id });

        if (inserted?.id) {
          leadId = inserted.id;
        }
      } catch (err: any) {
        throw new Error(`Lead database error: ${err.message || 'Failed to save lead'}`);
      }
    }

    return {
      leadId,
      status: 'recorded',
      customerName: name.trim(),
      customerEmail: email.trim().toLowerCase(),
      consentVerified: true,
      consentTimestamp: consentTimestamp.toISOString(),
      message: `Thank you, ${name}. Your information has been registered with your consent. Our team will contact you at ${email}.`,
    };
  },
};
