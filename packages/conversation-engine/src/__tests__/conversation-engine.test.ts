import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationEngine } from '../conversation-engine.js';
import type { AIOrchestrator } from '@openagent/ai-provider';

describe('Conversation Engine Pipeline', () => {
  let mockOrchestrator: AIOrchestrator;

  beforeEach(() => {
    mockOrchestrator = {
      generate: vi.fn(),
      generateStream: vi.fn(),
    } as any;
  });

  it('prepares messages with language detection and system prompt', () => {
    const engine = new ConversationEngine(mockOrchestrator);

    const { messages, languageInfo } = engine.prepareMessages(
      'bhai Lahore mein parcel kab tak pohchega?',
      [],
      { siteName: 'TechStore', botName: 'TechBot' }
    );

    expect(languageInfo.language).toBe('roman-ur');
    expect(languageInfo.script).toBe('latin');
    expect(messages.length).toBe(2); // system prompt + user turn
    expect(messages[0]!.role).toBe('system');
    expect(messages[0]!.content).toContain('ROMAN URDU');
    expect(messages[1]!.role).toBe('user');
  });

  it('generates response and passes language metadata', async () => {
    (mockOrchestrator.generate as any).mockResolvedValue({
      text: 'Standard delivery Lahore mein 2 se 3 din mein hoti hai.',
      model: '@cf/meta/llama-3.1-8b-instruct',
      provider: 'cloudflare',
    });

    const engine = new ConversationEngine(mockOrchestrator);
    const res = await engine.generate(
      'delivery kitne din mein hogi?',
      [],
      { siteName: 'Shop', botName: 'Bot' }
    );

    expect(res.text).toBe('Standard delivery Lahore mein 2 se 3 din mein hoti hai.');
    expect(res.languageInfo.language).toBe('roman-ur');
    expect(mockOrchestrator.generate).toHaveBeenCalledTimes(1);
  });

  it('streams response chunks with language metadata attached', async () => {
    (mockOrchestrator.generateStream as any).mockImplementation(async function* () {
      yield { text: 'Delivered in ', done: false };
      yield { text: '2-3 days.', done: true };
    });

    const engine = new ConversationEngine(mockOrchestrator);
    const chunks: any[] = [];

    for await (const chunk of engine.generateStream('How long does shipping take?', [], {
      siteName: 'Store',
      botName: 'Bot',
    })) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2);
    expect(chunks[0].languageInfo.language).toBe('en');
    expect(chunks.map((c) => c.text).join('')).toBe('Delivered in 2-3 days.');
  });
});
