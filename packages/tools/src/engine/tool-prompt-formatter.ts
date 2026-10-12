import type { ToolDefinition } from '../types.js';

export class ToolPromptFormatter {
  /**
   * Generates formatted prompt instructions describing available tools and safety rules.
   */
  public static formatToolsSystemPrompt(tools: ToolDefinition[]): string {
    if (!tools || tools.length === 0) {
      return '';
    }

    const toolDescriptions = tools.map((t) => {
      const isConsequentialNotice = t.isConsequential
        ? ' [CONSEQUENTIAL ACTION: Server requires explicit user confirmation]'
        : '';
      const consentNotice = t.requiresExplicitConsent
        ? ' [REQUIRES EXPLICIT VISITOR CONSENT]'
        : '';

      return `- **${t.id}**: ${t.description}${isConsequentialNotice}${consentNotice}`;
    });

    return [
      'APPROVED BUSINESS TOOLS & ACTIONS:',
      'You have access to the following server-authorized tools when relevant to the visitor inquiry:',
      toolDescriptions.join('\n'),
      '',
      'TOOL USAGE & TRUTHFULNESS DIRECTIVES:',
      '1. NEVER CLAIM UNCONFIRMED ACTIONS: You must NEVER claim or promise that a support ticket, booking, lead, or email was created until the server confirms the real backend success payload.',
      '2. SUGGESTING A TOOL CALL: To invoke an approved tool, output a single XML tool block in the exact format:',
      '<tool_call>{"tool":"<tool_id>","parameters":{...}}</tool_call>',
      '3. CONSEQUENTIAL ACTIONS: If a visitor asks to create a ticket, cancel a booking, or submit personal information, clearly explain the action details and ask for their confirmation if not yet given.',
      '4. CONSENT: Never record leads without affirmative consent.',
      '5. SAFETY BOUNDARIES: Never attempt to execute shell commands, access arbitrary URLs, or query database credentials.',
    ].join('\n');
  }

  /**
   * Parses model-suggested tool calls from generated text.
   */
  public static parseToolCall(
    text: string
  ): { tool: string; parameters: Record<string, any> } | null {
    if (!text) return null;

    const match = text.match(/<tool_call>([\s\S]*?)<\/tool_call>/);
    if (!match || !match[1]) return null;

    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && typeof parsed.tool === 'string') {
        return {
          tool: parsed.tool,
          parameters: parsed.parameters || {},
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
