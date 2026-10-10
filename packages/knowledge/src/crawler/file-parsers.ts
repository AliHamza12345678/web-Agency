export interface ParsedDocumentContent {
  title: string;
  text: string;
  metadata?: Record<string, any>;
}

/**
 * Parses markdown and plain text content.
 */
export function parseTextDocument(rawContent: string, fallbackTitle = 'Document'): ParsedDocumentContent {
  const lines = rawContent.split('\n').map((l) => l.trim());
  let title = fallbackTitle;

  // Check if first non-empty line is a markdown heading
  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.replace(/^#+\s*/, '').trim();
      break;
    }
  }

  const cleanText = rawContent
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title,
    text: cleanText,
  };
}

/**
 * Parses structured or text FAQ entries into standardized Q&A documents.
 */
export function parseFaqEntries(
  faqPairs: Array<{ question: string; answer: string }>,
  title = 'Frequently Asked Questions'
): ParsedDocumentContent {
  const sections: string[] = [];

  for (const pair of faqPairs) {
    const q = pair.question.trim();
    const a = pair.answer.trim();
    if (q && a) {
      sections.push(`Q: ${q}\nA: ${a}`);
    }
  }

  return {
    title,
    text: sections.join('\n\n'),
    metadata: {
      entryCount: faqPairs.length,
      isFaq: true,
    },
  };
}

/**
 * Safe lightweight pure-JavaScript text extractor for PDF documents.
 * Extracts text stream blocks (BT...ET) and text operators (Tj, TJ, ') without executing JavaScript or external processes.
 */
export function parsePdfText(pdfBuffer: Buffer, fallbackTitle = 'PDF Document'): ParsedDocumentContent {
  const rawString = pdfBuffer.toString('latin1');
  const textChunks: string[] = [];

  // Match text objects enclosed between BT (Begin Text) and ET (End Text)
  const btEtBlocks = rawString.matchAll(/BT[\s\S]*?ET/g);

  for (const blockMatch of btEtBlocks) {
    const block = blockMatch[0];

    // Match strings inside parentheses: (Text) Tj or [(T) -10 (ext)] TJ
    const strMatches = block.matchAll(/\(([^)]*)\)/g);
    for (const m of strMatches) {
      const text = m[1]!
        .replace(/\\([()\\])/g, '$1') // unescape \(, \), \\
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, ' ')
        .replace(/\\t/g, ' ');

      if (text.trim().length > 0) {
        textChunks.push(text);
      }
    }
  }

  let fullText = textChunks.join(' ').replace(/\s+/g, ' ').trim();
  if (!fullText) {
    // Fallback: look for readable ASCII sequences
    const asciiMatches = rawString.match(/[\x20-\x7E]{5,}/g) || [];
    fullText = asciiMatches
      .filter((s) => !/^[0-9\s]+$/.test(s) && !s.startsWith('/'))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    title: fallbackTitle,
    text: fullText || 'No readable text could be extracted from this PDF file.',
    metadata: {
      bytes: pdfBuffer.length,
      extractedCharacters: fullText.length,
    },
  };
}
