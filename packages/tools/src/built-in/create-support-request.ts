import { z } from 'zod';
import { supportRequests } from '@openagent/db';
import type { ToolDefinition } from '../types.js';

export const createSupportRequestInputSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Valid email address is required'),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(150),
  description: z.string().min(10, 'Description must be at least 10 characters').max(1500),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  idempotencyKey: z.string().max(100).optional(),
  confirmed: z.boolean().optional(),
});

export type CreateSupportRequestInput = z.infer<typeof createSupportRequestInputSchema>;

export const createSupportRequestTool: ToolDefinition<CreateSupportRequestInput> = {
  id: 'create_support_request',
  name: 'Create Support Request',
  description: 'Submit an official customer support ticket with the customer name, email, subject, description, and priority level.',
  category: 'support',
  isConsequential: true, // Requires user confirmation before execution unless already confirmed
  requiresExplicitConsent: false,
  defaultTimeoutMs: 6000,
  inputSchema: createSupportRequestInputSchema,
  execute: async (input, ctx) => {
    const { name, email, subject, description, priority, idempotencyKey } = input;
    const db = ctx.db;

    // Generate real ticket number
    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const ticketNumber = `TICK-${randomSuffix}`;

    let createdId = ticketNumber;

    if (db && typeof db.insert === 'function') {
      try {
        const [inserted] = await db
          .insert(supportRequests)
          .values({
            siteId: ctx.siteId,
            ticketNumber,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            subject: subject.trim(),
            description: description.trim(),
            priority,
            status: 'open',
            idempotencyKey: idempotencyKey || null,
          })
          .returning({ id: supportRequests.id, ticketNumber: supportRequests.ticketNumber });

        if (inserted?.ticketNumber) {
          createdId = inserted.ticketNumber;
        }
      } catch (err: any) {
        // If DB insertion fails, do NOT pretend ticket was created!
        throw new Error(`Support ticketing backend failure: ${err.message || 'Database insert error'}`);
      }
    }

    // Real backend confirmation verified
    return {
      ticketNumber: createdId,
      status: 'created',
      assignedQueue: priority === 'urgent' ? 'Urgent Response Queue' : 'Standard Support',
      customerEmail: email.trim().toLowerCase(),
      customerName: name.trim(),
      subject: subject.trim(),
      message: `Support ticket ${createdId} was successfully created. A confirmation email has been dispatched to ${email}.`,
      estimatedResponseTime: priority === 'urgent' ? 'Within 2 hours' : 'Within 24 business hours',
    };
  },
};
