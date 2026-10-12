import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const appointmentAvailabilityInputSchema = z.object({
  service: z.string().min(2).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
});

export type AppointmentAvailabilityInput = z.infer<typeof appointmentAvailabilityInputSchema>;

export const appointmentAvailabilityTool: ToolDefinition<AppointmentAvailabilityInput> = {
  id: 'check_appointment_availability',
  name: 'Check Appointment Availability',
  description: 'Query available booking time slots for a given service and date.',
  category: 'connector',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 5000,
  inputSchema: appointmentAvailabilityInputSchema,
  execute: async (input, ctx) => {
    const { service, date } = input;
    const bookingConfig = ctx.config?.bookingConnector;

    if (!bookingConfig || !bookingConfig.enabled) {
      return {
        configured: false,
        service,
        date,
        message: 'Online calendar booking integration is not configured for this website. Please contact the front desk.',
      };
    }

    const availableSlots = bookingConfig.slots || [
      '09:00 AM',
      '11:30 AM',
      '02:00 PM',
      '04:30 PM',
    ];

    return {
      configured: true,
      service,
      date,
      availableSlots,
      timeZone: bookingConfig.timeZone || 'EST',
      message: `Found ${availableSlots.length} available appointment slots for ${service} on ${date}.`,
    };
  },
};
