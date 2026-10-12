/**
 * In-memory & DB Idempotency Manager
 * Prevents accidental duplicate submissions of consequential or state-mutating actions.
 */

export interface IdempotencyEntry {
  key: string;
  toolName: string;
  siteId: string;
  result: any;
  createdAt: number;
}

export class IdempotencyStore {
  private cache = new Map<string, IdempotencyEntry>();
  private maxAgeMs: number;

  constructor(maxAgeMs = 300000) { // default 5 minutes
    this.maxAgeMs = maxAgeMs;
  }

  private compositeKey(siteId: string, toolName: string, idempotencyKey: string): string {
    return `${siteId}:${toolName}:${idempotencyKey}`;
  }

  public get(siteId: string, toolName: string, idempotencyKey: string): any | null {
    const key = this.compositeKey(siteId, toolName, idempotencyKey);
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > this.maxAgeMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  public set(siteId: string, toolName: string, idempotencyKey: string, result: any): void {
    const key = this.compositeKey(siteId, toolName, idempotencyKey);
    this.cache.set(key, {
      key,
      toolName,
      siteId,
      result,
      createdAt: Date.now(),
    });
  }

  public clear(): void {
    this.cache.clear();
  }
}

export const globalIdempotencyStore = new IdempotencyStore();
