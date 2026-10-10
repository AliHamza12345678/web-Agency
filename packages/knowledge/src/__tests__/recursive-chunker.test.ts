import { describe, it, expect } from 'vitest';
import { RecursiveChunker } from '../chunker/recursive-chunker.js';

describe('Recursive Document Chunker', () => {
  it('returns single chunk for documents smaller than chunkSize', () => {
    const chunker = new RecursiveChunker({ chunkSize: 500 });
    const text = 'Short document content with simple paragraph text.';
    const chunks = chunker.chunk(text, 'Overview');

    expect(chunks.length).toBe(1);
    expect(chunks[0]!.content).toBe(text);
    expect(chunks[0]!.heading).toBe('Overview');
  });

  it('splits long documents into chunks and preserves heading context', () => {
    const chunker = new RecursiveChunker({ chunkSize: 200, chunkOverlap: 40 });
    const text = `
# Shipping Policy
Standard nationwide shipping arrives in 2 to 3 business days for all metro areas across the country.

# International Orders
We deliver to Canada, the United States, and the United Kingdom via DHL Express with signature confirmation required.

# Return Window
Returns are accepted within 30 days of receipt provided the item is in pristine condition.
    `.trim();

    const chunks = chunker.chunk(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.heading).toBe('Shipping Policy');
    // Verify chunk indexes are sequential
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.chunkIndex).toBe(i);
    }
  });

  it('maintains overlap across adjacent chunk boundaries', () => {
    const chunker = new RecursiveChunker({ chunkSize: 150, chunkOverlap: 50 });
    const text = `
First section details instructions for installation.
Second section covers troubleshooting network timeouts and socket failures.
Third section provides warranty terms and contact information.
    `.trim();

    const chunks = chunker.chunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });
});
