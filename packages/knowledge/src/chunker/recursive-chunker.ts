export interface ChunkOptions {
  chunkSize?: number; // Target characters per chunk (default: 500)
  chunkOverlap?: number; // Character overlap between adjacent chunks (default: 80)
  minChunkSize?: number; // Minimum characters to consider a viable chunk (default: 50)
}

export interface ChunkResult {
  chunkIndex: number;
  content: string;
  heading?: string;
  charCount: number;
}

export class RecursiveChunker {
  private chunkSize: number;
  private chunkOverlap: number;
  private minChunkSize: number;

  constructor(options: ChunkOptions = {}) {
    this.chunkSize = options.chunkSize || 500;
    this.chunkOverlap = options.chunkOverlap || 80;
    this.minChunkSize = options.minChunkSize || 50;

    if (this.chunkOverlap >= this.chunkSize) {
      this.chunkOverlap = Math.floor(this.chunkSize / 4);
    }
  }

  /**
   * Splits a document into chunks respecting natural break boundaries.
   */
  public chunk(text: string, initialHeading?: string): ChunkResult[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    if (trimmed.length <= this.chunkSize) {
      return [
        {
          chunkIndex: 0,
          content: trimmed,
          heading: initialHeading,
          charCount: trimmed.length,
        },
      ];
    }

    // 1. Break text into sections by paragraphs and markdown headings
    const paragraphs = trimmed
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const chunks: ChunkResult[] = [];
    let currentChunk = '';
    let currentHeading = initialHeading;
    let chunkHeading = initialHeading;

    for (const para of paragraphs) {
      // Check if paragraph contains or is a heading
      const headingMatch = para.match(/^#{1,4}\s+(.+)$/m);
      const nextHeading = headingMatch ? headingMatch[1]!.trim() : currentHeading;

      // If adding this paragraph exceeds target size, commit current chunk
      if (currentChunk.length + para.length + 2 > this.chunkSize) {
        if (currentChunk.length >= this.minChunkSize) {
          chunks.push({
            chunkIndex: chunks.length,
            content: currentChunk.trim(),
            heading: chunkHeading,
            charCount: currentChunk.trim().length,
          });

          // Carry over overlap tail
          const overlapStart = Math.max(0, currentChunk.length - this.chunkOverlap);
          const overlapText = currentChunk.slice(overlapStart).trim();
          currentChunk = overlapText ? `${overlapText}\n\n${para}` : para;
          chunkHeading = nextHeading;
        } else {
          currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
        }
      } else {
        if (!currentChunk) {
          chunkHeading = nextHeading;
        }
        currentChunk = currentChunk ? `${currentChunk}\n\n${para}` : para;
      }

      currentHeading = nextHeading;

      // If a single chunk is larger than chunkSize, sub-split it by sentences/newlines
      if (currentChunk.length > this.chunkSize) {
        const subChunks = this.splitLargeParagraph(currentChunk, chunkHeading);
        for (let i = 0; i < subChunks.length - 1; i++) {
          chunks.push({
            chunkIndex: chunks.length,
            content: subChunks[i]!,
            heading: chunkHeading,
            charCount: subChunks[i]!.length,
          });
        }
        currentChunk = subChunks[subChunks.length - 1] || '';
      }
    }

    // Flush remaining chunk
    if (currentChunk.trim().length >= this.minChunkSize || chunks.length === 0) {
      chunks.push({
        chunkIndex: chunks.length,
        content: currentChunk.trim(),
        heading: chunkHeading,
        charCount: currentChunk.trim().length,
      });
    }

    return chunks;
  }

  /**
   * Sub-splits an oversized paragraph by sentence boundaries or newlines.
   */
  private splitLargeParagraph(paragraph: string, _heading?: string): string[] {
    const sentences = paragraph
      .split(/(?<=[.?!])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const results: string[] = [];
    let buffer = '';

    for (const sentence of sentences) {
      if (buffer.length + sentence.length + 1 > this.chunkSize) {
        if (buffer.length > 0) {
          results.push(buffer.trim());
          const overlap = buffer.slice(Math.max(0, buffer.length - this.chunkOverlap));
          buffer = `${overlap} ${sentence}`;
        } else {
          // Hard split if a single sentence is bigger than chunkSize
          results.push(sentence.slice(0, this.chunkSize));
          buffer = sentence.slice(this.chunkSize);
        }
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }

    if (buffer.trim()) {
      results.push(buffer.trim());
    }

    return results;
  }
}
