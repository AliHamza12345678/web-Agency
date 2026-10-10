import { describe, it, expect } from 'vitest';
import { ContextManager } from '../context-manager.js';
import type { ConversationTurn } from '../types.js';

describe('Conversation Context Manager', () => {
  it('deduplicates consecutive identical messages from the same role', () => {
    const manager = new ContextManager(6);
    const turns: ConversationTurn[] = [
      { role: 'visitor', content: 'hello' },
      { role: 'visitor', content: 'hello' },
      { role: 'assistant', content: 'Hi! How can I help?' },
      { role: 'visitor', content: 'price?' },
    ];

    const cleaned = manager.cleanTurns(turns);
    expect(cleaned.length).toBe(3);
    expect(cleaned[0]!.content).toBe('hello');
    expect(cleaned[1]!.content).toBe('Hi! How can I help?');
  });

  it('keeps history within sliding window without summarization when turns <= maxRecentTurns', () => {
    const manager = new ContextManager(4);
    const turns: ConversationTurn[] = [
      { role: 'visitor', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'visitor', content: 'What is your return policy?' },
    ];

    const res = manager.processHistory(turns);
    expect(res.recentTurns.length).toBe(3);
    expect(res.omittedTurnCount).toBe(0);
    expect(res.summary).toBeUndefined();
  });

  it('prunes older turns and summarizes key preferences and verified facts when dialogue exceeds limit', () => {
    const manager = new ContextManager(2);
    const turns: ConversationTurn[] = [
      { role: 'visitor', content: 'I want a blue jacket and my budget is 5000' },
      { role: 'assistant', content: 'We have free shipping over 3000 and 1-year warranty.' },
      { role: 'visitor', content: 'Can I pay cash on delivery?' },
      { role: 'assistant', content: 'Yes, Cash on Delivery is available.' },
      { role: 'visitor', content: 'What are delivery charges?' },
    ];

    const res = manager.processHistory(turns);
    expect(res.recentTurns.length).toBe(2);
    expect(res.omittedTurnCount).toBe(3);
    expect(res.summary).toBeDefined();

    // Check extracted summary state
    expect(res.summary?.keyPreferences.some((p) => p.includes('budget is 5000'))).toBe(true);
    expect(res.summary?.verifiedFacts.some((f) => f.includes('free shipping'))).toBe(true);
  });
});
