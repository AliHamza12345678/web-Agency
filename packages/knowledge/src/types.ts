export type DocumentType = 'url' | 'sitemap' | 'faq' | 'file' | 'policy';

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface IngestionSource {
  siteId: string;
  type: DocumentType;
  title: string;
  url?: string;
  rawText?: string;
  faqPairs?: Array<{ question: string; answer: string }>;
  metadata?: Record<string, any>;
}

export interface IngestedDocumentResult {
  documentId: string;
  siteId: string;
  title: string;
  sourceUrl?: string;
  type: DocumentType;
  status: DocumentStatus;
  chunkCount: number;
  contentHash: string;
  errorMessage?: string;
}

export interface DocumentChunkData {
  documentId: string;
  siteId: string;
  chunkIndex: number;
  content: string;
  heading?: string;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export interface SearchResultChunk {
  chunkId: string;
  documentId: string;
  siteId: string;
  title: string;
  sourceUrl?: string;
  content: string;
  heading?: string;
  score: number;
  matchType: 'semantic' | 'lexical' | 'hybrid';
}

export interface HybridSearchOptions {
  query: string;
  siteId: string;
  topK?: number;
  minScore?: number;
  maxTokens?: number;
}

export interface CrawlOptions {
  allowedDomains: string[];
  maxPages?: number;
  timeoutMs?: number;
  maxBytes?: number;
  respectRobotsTxt?: boolean;
}

export interface ExtractedPageContent {
  url: string;
  title: string;
  text: string;
  headings: string[];
  links: string[];
}
