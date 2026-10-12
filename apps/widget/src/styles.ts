export const widgetStyles = `
:host {
  all: initial;
  display: block;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.5;
  color: #1e293b;
  -webkit-font-smoothing: antialiased;
  z-index: 2147483647;
}

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* Floating Launcher Button */
.oa-launcher {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 30px;
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
  z-index: 2147483647;
  outline: none;
}

.oa-launcher:hover {
  transform: scale(1.06);
  box-shadow: 0 8px 28px rgba(99, 102, 241, 0.45);
}

.oa-launcher:active {
  transform: scale(0.96);
}

.oa-launcher:focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 3px;
}

.oa-launcher.oa-left {
  right: auto;
  left: 24px;
}

.oa-launcher-icon {
  width: 28px;
  height: 28px;
  fill: currentColor;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.oa-launcher.oa-open .oa-icon-chat {
  display: none;
}

.oa-launcher:not(.oa-open) .oa-icon-close {
  display: none;
}

/* Chat Window Panel */
.oa-panel {
  position: fixed;
  bottom: 96px;
  right: 24px;
  width: 400px;
  max-width: calc(100vw - 32px);
  height: 640px;
  max-height: calc(100vh - 120px);
  background: #ffffff;
  border-radius: 20px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 2147483647;
  border: 1px solid rgba(0, 0, 0, 0.08);
  transform-origin: bottom right;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease, visibility 0.25s;
}

.oa-panel.oa-left {
  right: auto;
  left: 24px;
  transform-origin: bottom left;
}

.oa-panel.oa-hidden {
  opacity: 0;
  visibility: hidden;
  transform: scale(0.92) translateY(20px);
  pointer-events: none;
}

/* Header */
.oa-header {
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.oa-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.oa-avatar {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.oa-header-info {
  display: flex;
  flex-direction: column;
}

.oa-header-title {
  font-weight: 700;
  font-size: 15px;
  line-height: 1.2;
}

.oa-header-status {
  font-size: 11px;
  opacity: 0.85;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
}

.oa-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.oa-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.oa-btn-icon {
  background: transparent;
  border: none;
  color: #ffffff;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s, background-color 0.15s;
}

.oa-btn-icon:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.15);
}

.oa-btn-icon:focus-visible {
  outline: 2px solid #ffffff;
}

/* Message List */
.oa-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #f8fafc;
  scroll-behavior: smooth;
}

/* Welcome Card */
.oa-welcome-card {
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.oa-welcome-text {
  font-size: 14px;
  color: #334155;
  line-height: 1.5;
}

/* Suggested Questions */
.oa-suggested {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.oa-suggested-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  color: #94a3b8;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}

.oa-chip {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #475569;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
}

.oa-chip:hover {
  background: #e2e8f0;
  color: #1e293b;
  border-color: #cbd5e1;
}

.oa-chip:focus-visible {
  outline: 2px solid var(--oa-primary, #6366f1);
}

/* Message Rows */
.oa-message-row {
  display: flex;
  flex-direction: column;
  max-width: 86%;
}

.oa-row-visitor {
  align-self: flex-end;
  align-items: flex-end;
}

.oa-row-assistant {
  align-self: flex-start;
  align-items: flex-start;
}

.oa-bubble {
  padding: 12px 16px;
  border-radius: 16px;
  font-size: 13.5px;
  line-height: 1.5;
  word-break: break-word;
}

.oa-row-visitor .oa-bubble {
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  border-bottom-right-radius: 4px;
}

.oa-row-assistant .oa-bubble {
  background: #ffffff;
  color: #1e293b;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-bottom-left-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.oa-message-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.oa-row-assistant:hover .oa-message-actions {
  opacity: 1;
}

.oa-copy-btn,
.oa-feedback-btn {
  background: transparent;
  border: none;
  font-size: 11px;
  color: #94a3b8;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border-radius: 4px;
  transition: transform 0.1s ease, color 0.15s ease;
}

.oa-copy-btn:hover,
.oa-feedback-btn:hover {
  color: #475569;
  transform: scale(1.1);
}

.oa-feedback-btn.oa-selected {
  color: var(--oa-primary, #6366f1);
  font-weight: 700;
}

/* Markdown Styling inside bubbles */
.oa-bubble p {
  margin-bottom: 6px;
}

.oa-bubble p:last-child {
  margin-bottom: 0;
}

.oa-bubble strong {
  font-weight: 700;
}

.oa-bubble em {
  font-style: italic;
}

.oa-bubble .oa-inline-code {
  background: rgba(0, 0, 0, 0.06);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.oa-row-visitor .oa-bubble .oa-inline-code {
  background: rgba(255, 255, 255, 0.25);
  color: #ffffff;
}

.oa-bubble .oa-code-block {
  background: #0f172a;
  color: #f8fafc;
  padding: 10px 12px;
  border-radius: 8px;
  margin: 8px 0;
  overflow-x: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.oa-bubble .oa-link {
  color: var(--oa-primary, #6366f1);
  text-decoration: underline;
}

.oa-bubble ul.oa-list {
  padding-left: 18px;
  margin: 6px 0;
}

/* Typing Indicator */
.oa-typing {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: #ffffff;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 16px;
  border-bottom-left-radius: 4px;
  align-self: flex-start;
}

.oa-typing-dot {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border-radius: 50%;
  animation: oaPulse 1.4s infinite ease-in-out;
}

.oa-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.oa-typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes oaPulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

/* Error Banner */
.oa-error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.oa-retry-btn {
  background: transparent;
  border: 1px solid #f87171;
  color: #b91c1c;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}

/* Input Area */
.oa-footer {
  border-top: 1px solid #e2e8f0;
  padding: 12px 16px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.oa-input-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.oa-textarea {
  flex: 1;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13.5px;
  color: #1e293b;
  resize: none;
  outline: none;
  max-height: 120px;
  min-height: 42px;
  line-height: 1.4;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.oa-textarea:focus {
  border-color: var(--oa-primary, #6366f1);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.oa-btn-send {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--oa-primary, #6366f1);
  color: #ffffff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;
  flex-shrink: 0;
}

.oa-btn-send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.oa-btn-send:not(:disabled):hover {
  transform: scale(1.04);
}

.oa-branding {
  text-align: center;
  font-size: 10.5px;
  color: #94a3b8;
}

.oa-branding a {
  color: inherit;
  text-decoration: none;
  font-weight: 600;
}

/* Mobile Layout */
@media (max-width: 600px) {
  .oa-panel {
    bottom: 0;
    right: 0;
    left: 0;
    width: 100vw;
    max-width: 100vw;
    height: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
    transform-origin: bottom center;
  }
  .oa-launcher {
    bottom: 16px;
    right: 16px;
  }
}

/* Reduced Motion Support */
@media (prefers-reduced-motion: reduce) {
  .oa-launcher, .oa-panel, .oa-btn-send, .oa-typing-dot {
    transition: none !important;
    animation: none !important;
  }
}
`;
