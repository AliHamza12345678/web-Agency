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

  /**
   * Schedules lazy mounting based on selected loading strategy:
   * - 'immediate': Mounts immediately
   * - 'idle': Defers until browser main thread is idle (requestIdleCallback)
   * - 'interaction': Defers until visitor moves mouse, scrolls, or touches screen
   */
  const scheduleInit = (config: WidgetConfig, strategy: 'immediate' | 'idle' | 'interaction' = 'immediate') => {
    if (strategy === 'idle') {
      const schedule = (window as any).requestIdleCallback
        ? (cb: () => void) => (window as any).requestIdleCallback(cb, { timeout: 3000 })
        : (cb: () => void) => setTimeout(cb, 1000);

      if (document.readyState === 'complete') {
        schedule(() => initWidget(config).catch(console.error));
      } else {
        window.addEventListener(
          'load',
          () => {
            schedule(() => initWidget(config).catch(console.error));
          },
          { once: true }
        );
      }
    } else if (strategy === 'interaction') {
      const triggers = ['mousemove', 'touchstart', 'scroll', 'keydown'];
      const onFirstInteraction = () => {
        triggers.forEach((event) => window.removeEventListener(event, onFirstInteraction));
        initWidget(config).catch(console.error);
      };
      triggers.forEach((event) => window.addEventListener(event, onFirstInteraction, { once: true, passive: true }));
    } else {
      initWidget(config).catch((err) => {
        console.error('[OpenAgent] Initialization failed:', err);
      });
    }
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

  // 3. Auto-bootstrap from <script data-site-id="..."> with lazy-loading support
  const currentScript = document.currentScript as HTMLScriptElement | null;
  if (currentScript) {
    const siteId = currentScript.getAttribute('data-site-id');
    const apiUrl = currentScript.getAttribute('data-api-url') || undefined;
    const position = (currentScript.getAttribute('data-position') as 'bottom-right' | 'bottom-left') || undefined;
    const primaryColor = currentScript.getAttribute('data-primary-color') || undefined;
    const botName = currentScript.getAttribute('data-bot-name') || undefined;
    const welcomeMessage = currentScript.getAttribute('data-welcome-message') || undefined;

    const rawStrategy = currentScript.getAttribute('data-strategy');
    const isDeferred = currentScript.getAttribute('data-defer') === 'true';
    const strategy: 'immediate' | 'idle' | 'interaction' =
      rawStrategy === 'idle' || isDeferred ? 'idle' : rawStrategy === 'interaction' ? 'interaction' : 'immediate';

    if (siteId) {
      scheduleInit(
        {
          siteId,
          apiUrl,
          position,
          primaryColor,
          botName,
          welcomeMessage,
          strategy,
        },
        strategy
      );
    }
  }
}

export { OpenAgentWidget };
export type { WidgetConfig };
