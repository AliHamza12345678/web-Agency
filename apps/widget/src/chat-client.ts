export interface WidgetConfig {
  siteId: string;
  apiUrl?: string;
  position?: 'bottom-right' | 'bottom-left';
  primaryColor?: string;
  botName?: string;
  welcomeMessage?: string;
  suggestedQuestions?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'visitor' | 'assistant';
  content: string;
  timestamp: string;
}

export class ChatClient {
  public config: WidgetConfig;
  public visitorSessionId: string;
  public siteName = 'AI Assistant';

  constructor(config: WidgetConfig) {
    this.config = {
      apiUrl: config.apiUrl || (window as any).__OPENAGENT_API_URL__ || window.location.origin.replace(':3000', ':3001'),
      ...config,
    };

    // Anonymous visitor session ID (does not store sensitive conversation messages in localStorage)
    const storageKey = `openagent_visitor_${config.siteId}`;
    let sessionId = localStorage.getItem(storageKey);
    if (!sessionId) {
      sessionId = 'v_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem(storageKey, sessionId);
    }
    this.visitorSessionId = sessionId;
  }

  /**
   * Handshake with server to load live site configuration.
   */
  public async loadConfig(): Promise<WidgetConfig> {
    try {
      const url = `${this.config.apiUrl}/api/v1/site/config?publicKey=${encodeURIComponent(this.config.siteId)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'x-visitor-session': this.visitorSessionId,
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load site config: HTTP ${res.status}`);
      }

      const data = await res.json();
      if (data?.success && data?.data) {
        const site = data.data;
        this.siteName = site.name || this.siteName;

        if (site.branding) {
          this.config.primaryColor = site.branding.primaryColor || this.config.primaryColor;
          this.config.botName = site.branding.botName || this.config.botName;
          this.config.welcomeMessage = site.branding.welcomeMessage || this.config.welcomeMessage;
          this.config.position = site.branding.position || this.config.position;
        }
      }
    } catch (err) {
      console.warn('[OpenAgent] Handshake warning; using local defaults:', err);
    }

    return this.config;
  }

  /**
   * Stream assistant chat response using Server-Sent Events or chunked stream.
   */
  public async sendMessage(
    message: string,
    history: ChatMessage[],
    onChunk: (accumulatedText: string) => void,
    onDone: () => void,
    onError: (err: Error) => void
  ): Promise<void> {
    const streamUrl = `${this.config.apiUrl}/api/v1/chat/stream`;

    try {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-visitor-session': this.visitorSessionId,
        },
        body: JSON.stringify({
          siteId: this.config.siteId,
          message,
          history: history.slice(-6).map((h) => ({ role: h.role, content: h.content })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const msg = errorData?.error?.message || `Server responded with ${response.status}`;
        throw new Error(msg);
      }

      if (!response.body) {
        throw new Error('ReadableStream not supported by browser response');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        
        // Parse SSE format: data: ...
        const lines = chunkText.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataContent = trimmed.substring(5).trim();
            if (dataContent === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(dataContent);
              if (parsed.text) {
                accumulated += parsed.text;
                onChunk(accumulated);
              }
            } catch {
              // Plain text stream fallback
              accumulated += dataContent;
              onChunk(accumulated);
            }
          } else if (trimmed.length > 0 && !trimmed.startsWith(':')) {
            accumulated += trimmed;
            onChunk(accumulated);
          }
        }
      }

      onDone();
    } catch (err: any) {
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
