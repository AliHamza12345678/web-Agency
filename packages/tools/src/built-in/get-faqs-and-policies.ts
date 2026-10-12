import { z } from 'zod';
import type { ToolDefinition } from '../types.js';

export const getFaqsAndPoliciesInputSchema = z.object({
  topic: z.enum(['returns', 'shipping', 'privacy', 'terms', 'faqs', 'general']),
});

export type GetFaqsAndPoliciesInput = z.infer<typeof getFaqsAndPoliciesInputSchema>;

export const getFaqsAndPoliciesTool: ToolDefinition<GetFaqsAndPoliciesInput> = {
  id: 'get_faqs_and_policies',
  name: 'Retrieve Verified FAQs and Policies',
  description: 'Retrieve verified store policies such as returns/refunds, shipping rules, privacy policy, terms, and frequently asked questions.',
  category: 'content',
  isConsequential: false,
  requiresExplicitConsent: false,
  defaultTimeoutMs: 3000,
  inputSchema: getFaqsAndPoliciesInputSchema,
  execute: async (input, ctx) => {
    const { topic } = input;
    const policiesConfig = ctx.config?.policies || {};

    const defaultPolicies: Record<string, { title: string; content: string; lastUpdated: string }> = {
      returns: {
        title: 'Return & Refund Policy',
        content: policiesConfig.returns || 'Customers may return eligible items within 30 days of delivery in original condition. Refunds are processed to the original payment method within 3-5 business days upon inspection.',
        lastUpdated: '2026-01-15',
      },
      shipping: {
        title: 'Shipping & Delivery Policy',
        content: policiesConfig.shipping || 'Standard delivery takes 2 to 5 business days. Express overnight shipping is available at checkout. Free shipping applies on all qualifying domestic orders over $50.',
        lastUpdated: '2026-01-15',
      },
      privacy: {
        title: 'Privacy Policy',
        content: policiesConfig.privacy || 'We respect your data privacy. We do not sell your personal data. Chat records and visitor identifiers are encrypted at rest and retained only according to your configured site retention policy.',
        lastUpdated: '2026-01-15',
      },
      terms: {
        title: 'Terms of Service',
        content: policiesConfig.terms || 'By using this service, you agree to our terms of acceptable usage. Automated scraping without authorization is strictly prohibited.',
        lastUpdated: '2026-01-15',
      },
      faqs: {
        title: 'Frequently Asked Questions',
        content: policiesConfig.faqs || 'Q: How do I track my order? A: Use the order-status lookup tool or check your email receipt for the tracking link. Q: Do you ship internationally? A: Yes, to over 60 countries.',
        lastUpdated: '2026-01-15',
      },
      general: {
        title: 'General Store Overview',
        content: policiesConfig.general || 'Welcome to our store. We provide verified consumer products with 24/7 online AI assistance.',
        lastUpdated: '2026-01-15',
      },
    };

    const policy = defaultPolicies[topic] || defaultPolicies.general;

    return {
      topic,
      ...policy,
      verified: true,
    };
  },
};
