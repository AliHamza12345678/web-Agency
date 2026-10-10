import { widgetStyles } from './styles.js';
import { renderSafeMarkdown, escapeHtml } from './markdown.js';
import { ChatClient, type WidgetConfig, type ChatMessage } from './chat-client.js';

export class OpenAgentWidget {
  private client: ChatClient;
  private shadow: ShadowRoot;
  private host: HTMLElement;

  private isOpen = false;
  private isGenerating = false;
  private messages: ChatMessage[] = [];
  private lastVisitorMessage = '';

  // Cached DOM elements
  private launcherBtn!: HTMLButtonElement;
  private panelEl!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private inputEl!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;
  private typingEl!: HTMLDivElement;
  private errorEl!: HTMLDivElement;

  constructor(config: WidgetConfig) {
    this.client = new ChatClient(config);

    // Host element attached to host document body
    this.host = document.createElement('openagent-chat');
    this.shadow = this.host.attachShadow({ mode: 'open' });
  }

  public async mount(): Promise<void> {
    // 1. Initial render with local/provided config
    this.render();
    document.body.appendChild(this.host);

    // 2. Load live config from API handshake
    await this.client.loadConfig();
    this.updateTheme();
  }

  private render(): void {
    const isLeft = this.client.config.position === 'bottom-left';

    this.shadow.innerHTML = `
      <style>${widgetStyles}</style>

      <!-- Floating Launcher Button -->
      <button
        class="oa-launcher ${isLeft ? 'oa-left' : ''}"
        aria-label="Open AI chat assistant"
        aria-expanded="false"
        type="button"
      >
        <svg class="oa-launcher-icon oa-icon-chat" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
        <svg class="oa-launcher-icon oa-icon-close" viewBox="0 0 24 24">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>

      <!-- Chat Panel -->
      <div
        class="oa-panel oa-hidden ${isLeft ? 'oa-left' : ''}"
        role="dialog"
        aria-label="Chat with AI assistant"
      >
        <!-- Header -->
        <div class="oa-header">
          <div class="oa-header-left">
            <div class="oa-avatar" aria-hidden="true">🤖</div>
            <div class="oa-header-info">
              <span class="oa-header-title">${escapeHtml(this.client.config.botName || 'AI Assistant')}</span>
              <span class="oa-header-status">
                <span class="oa-status-dot"></span> Online & Grounded
              </span>
            </div>
          </div>
          <div class="oa-header-actions">
            <button class="oa-btn-icon oa-btn-restart" title="Restart Conversation" aria-label="Restart conversation" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
              </svg>
            </button>
            <button class="oa-btn-icon oa-btn-close" title="Close Chat" aria-label="Close chat" type="button">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div class="oa-messages" role="log" aria-live="polite">
          <div class="oa-welcome-card">
            <div class="oa-welcome-text">
              ${renderSafeMarkdown(this.client.config.welcomeMessage || 'Hello! How can I assist you with this website today?')}
            </div>
            <div class="oa-suggested">
              <span class="oa-suggested-title">Suggested Inquiries</span>
              <button type="button" class="oa-chip" data-query="What can you help me with?">What can you help me with?</button>
              <button type="button" class="oa-chip" data-query="Tell me about your services">Tell me about your services</button>
            </div>
          </div>
        </div>

        <!-- Typing Indicator (Hidden by default) -->
        <div class="oa-typing" style="display: none; margin: 0 20px 10px;" aria-label="Assistant is generating response">
          <span class="oa-typing-dot"></span>
          <span class="oa-typing-dot"></span>
          <span class="oa-typing-dot"></span>
        </div>

        <!-- Error Banner (Hidden by default) -->
        <div class="oa-error-banner" style="display: none; margin: 0 20px 10px;">
          <span class="oa-error-text">Network error occurred</span>
          <button type="button" class="oa-retry-btn">Retry</button>
        </div>

        <!-- Footer / Input -->
        <div class="oa-footer">
          <div class="oa-input-row">
            <textarea
              class="oa-textarea"
              placeholder="Ask a question..."
              rows="1"
              aria-label="Message input"
            ></textarea>
            <button class="oa-btn-send" aria-label="Send message" type="button" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
          <div class="oa-branding">
            Powered by <strong>OpenAgent Chat</strong>
          </div>
        </div>
      </div>
    `;

    // Cache element references
    this.launcherBtn = this.shadow.querySelector('.oa-launcher')!;
    this.panelEl = this.shadow.querySelector('.oa-panel')!;
    this.messagesEl = this.shadow.querySelector('.oa-messages')!;
    this.inputEl = this.shadow.querySelector('.oa-textarea')!;
    this.sendBtn = this.shadow.querySelector('.oa-btn-send')!;
    this.typingEl = this.shadow.querySelector('.oa-typing')!;
    this.errorEl = this.shadow.querySelector('.oa-error-banner')!;

    this.bindEvents();
    this.updateTheme();
  }

  private updateTheme(): void {
    const color = this.client.config.primaryColor || '#6366f1';
    this.host.style.setProperty('--oa-primary', color);

    const titleEl = this.shadow.querySelector('.oa-header-title');
    if (titleEl && this.client.config.botName) {
      titleEl.textContent = this.client.config.botName;
    }

    const welcomeEl = this.shadow.querySelector('.oa-welcome-text');
    if (welcomeEl && this.client.config.welcomeMessage) {
      welcomeEl.innerHTML = renderSafeMarkdown(this.client.config.welcomeMessage);
    }
  }

  private bindEvents(): void {
    // Launcher click
    this.launcherBtn.addEventListener('click', () => this.toggle());

    // Close and restart buttons
    this.shadow.querySelector('.oa-btn-close')?.addEventListener('click', () => this.close());
    this.shadow.querySelector('.oa-btn-restart')?.addEventListener('click', () => this.restart());

    // Suggested questions click
    this.messagesEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('oa-chip')) {
        const query = target.getAttribute('data-query');
        if (query) this.submitMessage(query);
      } else if (target.classList.contains('oa-copy-btn') || target.closest('.oa-copy-btn')) {
        const btn = target.classList.contains('oa-copy-btn') ? target : target.closest('.oa-copy-btn')!;
        const text = btn.getAttribute('data-text');
        if (text) {
          navigator.clipboard.writeText(text);
          btn.textContent = '✓ Copied!';
          setTimeout(() => {
            btn.innerHTML = '📋 Copy';
          }, 2000);
        }
      }
    });

    // Error retry button
    this.errorEl.querySelector('.oa-retry-btn')?.addEventListener('click', () => {
      if (this.lastVisitorMessage) {
        this.submitMessage(this.lastVisitorMessage);
      }
    });

    // Textarea input
    this.inputEl.addEventListener('input', () => {
      // Auto-grow
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
      this.sendBtn.disabled = this.inputEl.value.trim().length === 0 || this.isGenerating;
    });

    // Textarea keyboard handling
    this.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const text = this.inputEl.value.trim();
        if (text && !this.isGenerating) {
          this.submitMessage(text);
        }
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    // Send button click
    this.sendBtn.addEventListener('click', () => {
      const text = this.inputEl.value.trim();
      if (text && !this.isGenerating) {
        this.submitMessage(text);
      }
    });

    // Close on escape globally when panel has focus
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  public open(): void {
    this.isOpen = true;
    this.panelEl.classList.remove('oa-hidden');
    this.launcherBtn.classList.add('oa-open');
    this.launcherBtn.setAttribute('aria-expanded', 'true');
    setTimeout(() => this.inputEl.focus(), 150);
  }

  public close(): void {
    this.isOpen = false;
    this.panelEl.classList.add('oa-hidden');
    this.launcherBtn.classList.remove('oa-open');
    this.launcherBtn.setAttribute('aria-expanded', 'false');
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public restart(): void {
    this.messages = [];
    this.messagesEl.querySelectorAll('.oa-message-row').forEach((el) => el.remove());
    this.errorEl.style.display = 'none';
    this.typingEl.style.display = 'none';
    this.isGenerating = false;
    this.sendBtn.disabled = this.inputEl.value.trim().length === 0;
  }

  private appendMessageElement(role: 'visitor' | 'assistant', contentHtml: string, rawText: string): HTMLElement {
    const row = document.createElement('div');
    row.className = `oa-message-row oa-row-${role}`;

    let actionsHtml = '';
    if (role === 'assistant') {
      actionsHtml = `
        <div class="oa-message-actions">
          <button type="button" class="oa-copy-btn" data-text="${escapeHtml(rawText)}" aria-label="Copy assistant answer">
            📋 Copy
          </button>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="oa-bubble">${contentHtml}</div>
      ${actionsHtml}
    `;

    this.messagesEl.appendChild(row);
    this.scrollToBottom();
    return row;
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  public async submitMessage(text: string): Promise<void> {
    if (!text || this.isGenerating) return;

    this.lastVisitorMessage = text;
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this.sendBtn.disabled = true;
    this.errorEl.style.display = 'none';

    // 1. Append Visitor Message
    const userMsg: ChatMessage = {
      id: 'msg_' + Date.now(),
      role: 'visitor',
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.messages.push(userMsg);
    this.appendMessageElement('visitor', escapeHtml(text), text);

    // 2. Start Assistant Streaming
    this.isGenerating = true;
    this.typingEl.style.display = 'inline-flex';
    this.scrollToBottom();

    let assistantRow: HTMLElement | null = null;
    let bubbleEl: HTMLElement | null = null;
    let accumulatedText = '';

    await this.client.sendMessage(
      text,
      this.messages,
      (chunk) => {
        // First chunk received: hide typing dots, create bubble
        if (!assistantRow) {
          this.typingEl.style.display = 'none';
          assistantRow = this.appendMessageElement('assistant', '', '');
          bubbleEl = assistantRow.querySelector('.oa-bubble');
        }

        accumulatedText = chunk;
        if (bubbleEl) {
          bubbleEl.innerHTML = renderSafeMarkdown(accumulatedText);
          const copyBtn = assistantRow?.querySelector('.oa-copy-btn');
          if (copyBtn) copyBtn.setAttribute('data-text', accumulatedText);
          this.scrollToBottom();
        }
      },
      () => {
        // Done
        this.isGenerating = false;
        this.typingEl.style.display = 'none';
        this.sendBtn.disabled = this.inputEl.value.trim().length === 0;

        if (accumulatedText) {
          this.messages.push({
            id: 'msg_a_' + Date.now(),
            role: 'assistant',
            content: accumulatedText,
            timestamp: new Date().toISOString(),
          });
        }
      },
      (error) => {
        // Error fallback
        this.isGenerating = false;
        this.typingEl.style.display = 'none';
        this.sendBtn.disabled = this.inputEl.value.trim().length === 0;

        const errorMsg = error.message || 'Unable to connect to assistant';
        const errorTextEl = this.errorEl.querySelector('.oa-error-text');
        if (errorTextEl) errorTextEl.textContent = errorMsg;
        this.errorEl.style.display = 'flex';
        this.scrollToBottom();
      }
    );
  }
}
