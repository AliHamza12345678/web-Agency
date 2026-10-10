import { OpenAgentWidget } from './widget.js';
import type { WidgetConfig } from './chat-client.js';

declare global {
  interface Window {
    OpenAgentChat?: {
      init: (config: WidgetConfig) => Promise<OpenAgentWidget>;
      open: () => void;
      close: () => void;
      toggle: () => void;
      restart: () => void;
      sendMessage: (msg: string) => void;
      instance?: OpenAgentWidget;
    };
    __OPENAGENT_WIDGET_LOADED__?: boolean;
    __OPENAGENT_API_URL__?: string;
  }
}

// 1. Guard against duplicate script injection
if (window.__OPENAGENT_WIDGET_LOADED__) {
  console.warn('[OpenAgent] Chat widget script is already loaded.');
} else {
  window.__OPENAGENT_WIDGET_LOADED__ = true;

  let activeWidget: OpenAgentWidget | null = null;

  const initWidget = async (config: WidgetConfig): Promise<OpenAgentWidget> => {
    if (activeWidget) {
      console.warn('[OpenAgent] Chat widget has already been initialized.');
      return activeWidget;
    }

    const widget = new OpenAgentWidget(config);
    await widget.mount();
    activeWidget = widget;

    if (window.OpenAgentChat) {
      window.OpenAgentChat.instance = widget;
    }

    return widget;
  };

  // 2. Expose Programmatic Global API
  window.OpenAgentChat = {
    init: initWidget,
    open: () => activeWidget?.open(),
    close: () => activeWidget?.close(),
    toggle: () => activeWidget?.toggle(),
    restart: () => activeWidget?.restart(),
    sendMessage: (msg: string) => activeWidget?.submitMessage(msg),
  };

  // 3. Auto-bootstrap from <script data-site-id="...">
  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    const siteId = currentScript.getAttribute('data-site-id');
    const apiUrl = currentScript.getAttribute('data-api-url') || undefined;
    const position = (currentScript.getAttribute('data-position') as 'bottom-right' | 'bottom-left') || undefined;
    const primaryColor = currentScript.getAttribute('data-primary-color') || undefined;
    const botName = currentScript.getAttribute('data-bot-name') || undefined;
    const welcomeMessage = currentScript.getAttribute('data-welcome-message') || undefined;

    if (siteId) {
      initWidget({
        siteId,
        apiUrl,
        position,
        primaryColor,
        botName,
        welcomeMessage,
      }).catch((err) => {
        console.error('[OpenAgent] Auto-initialization failed:', err);
      });
    }
  }
}

export { OpenAgentWidget };
export type { WidgetConfig };
