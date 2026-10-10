import type {
  ConversationTurn,
  ConversationSummary,
  BoundedHistoryResult,
} from './types.js';

export class ContextManager {
  private maxRecentTurns: number;

  constructor(maxRecentTurns = 6) {
    this.maxRecentTurns = Math.max(2, maxRecentTurns);
  }

  /**
   * Cleans up conversation turns by removing consecutive duplicate messages.
   */
  public cleanTurns(turns: ConversationTurn[]): ConversationTurn[] {
    const cleaned: ConversationTurn[] = [];

    for (const turn of turns) {
      const content = turn.content.trim();
      if (!content) continue;

      const last = cleaned[cleaned.length - 1];
      if (last && last.role === turn.role && last.content.trim() === content) {
        // Skip duplicate identical consecutive message
        continue;
      }
      cleaned.push({ ...turn, content });
    }

    return cleaned;
  }

  /**
   * Extracts essential conversation state (preferences, verified facts, unresolved questions)
   * from older turns that are being pruned from the immediate context window.
   */
  public extractSummary(olderTurns: ConversationTurn[]): ConversationSummary {
    const preferences: string[] = [];
    const verifiedFacts: string[] = [];
    const unresolvedQuestions: string[] = [];
    let detectedTopic = '';

    for (let i = 0; i < olderTurns.length; i++) {
      const turn = olderTurns[i]!;
      const text = turn.content.toLowerCase();

      // Detect user preferences / constraints
      if (turn.role === 'visitor' || turn.role === 'user') {
        if (/i prefer|i want|mujhe .* chahiye|my budget is|deliver to|mera shahar|i need/i.test(turn.content)) {
          preferences.push(turn.content.slice(0, 120));
        }
        if (/\?|kia|kya|how|why|when|kab|price|cost|where/i.test(turn.content)) {
          // If next turn was not an assistant response or turn is near end
          const nextTurn = olderTurns[i + 1];
          if (!nextTurn || nextTurn.role !== 'assistant') {
            unresolvedQuestions.push(turn.content.slice(0, 100));
          }
        }
      }

      // Detect facts stated by assistant
      if (turn.role === 'assistant') {
        if (/policy|guarantee|warranty|free shipping|business hours|open from|cost is|price is/i.test(turn.content)) {
          verifiedFacts.push(turn.content.slice(0, 140));
        }
      }

      // Track ongoing topic keywords
      if (/order|delivery|shipping|return|refund|price|specs|discount|account/i.test(text)) {
        const match = text.match(/\b(order|delivery|shipping|return|refund|price|specs|discount|account)\b/i);
        if (match) detectedTopic = match[0];
      }
    }

    return {
      keyPreferences: Array.from(new Set(preferences)).slice(-4),
      verifiedFacts: Array.from(new Set(verifiedFacts)).slice(-4),
      unresolvedQuestions: Array.from(new Set(unresolvedQuestions)).slice(-3),
      currentTopic: detectedTopic || undefined,
    };
  }

  /**
   * Binds conversation history to a sliding window, synthesizing an older summary if needed.
   */
  public processHistory(allTurns: ConversationTurn[]): BoundedHistoryResult {
    const cleaned = this.cleanTurns(allTurns);

    if (cleaned.length <= this.maxRecentTurns) {
      return {
        recentTurns: cleaned,
        omittedTurnCount: 0,
      };
    }

    const splitIndex = cleaned.length - this.maxRecentTurns;
    const olderTurns = cleaned.slice(0, splitIndex);
    const recentTurns = cleaned.slice(splitIndex);

    const summary = this.extractSummary(olderTurns);

    return {
      recentTurns,
      summary,
      omittedTurnCount: olderTurns.length,
    };
  }
}
