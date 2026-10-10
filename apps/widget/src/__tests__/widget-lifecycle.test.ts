// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAgentWidget } from '../widget.js';

describe('OpenAgentWidget DOM Lifecycle & Shadow DOM Isolation', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('mounts inside an isolated Shadow DOM custom element', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as any);

    const widget = new OpenAgentWidget({
      siteId: 'pk_live_lifecycle_test',
      botName: 'TestBot',
      primaryColor: '#6366f1',
    });

    await widget.mount();

    const host = document.querySelector('openagent-chat');
    expect(host).not.toBeNull();
    expect(host?.shadowRoot).toBeDefined();

    // Verify elements are inside ShadowRoot, not in host document
    expect(document.querySelector('.oa-launcher')).toBeNull(); // Not in global DOM
    expect(host?.shadowRoot?.querySelector('.oa-launcher')).not.toBeNull(); // Inside Shadow DOM
  });

  it('manages open, close, and toggle states with proper ARIA attributes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as any);

    const widget = new OpenAgentWidget({ siteId: 'pk_live_aria_test' });
    await widget.mount();

    const host = document.querySelector('openagent-chat')!;
    const shadow = host.shadowRoot!;
    const launcher = shadow.querySelector<HTMLButtonElement>('.oa-launcher')!;
    const panel = shadow.querySelector<HTMLDivElement>('.oa-panel')!;

    // Initial state: closed
    expect(panel.classList.contains('oa-hidden')).toBe(true);
    expect(launcher.getAttribute('aria-expanded')).toBe('false');

    // Open
    widget.open();
    expect(panel.classList.contains('oa-hidden')).toBe(false);
    expect(launcher.getAttribute('aria-expanded')).toBe('true');

    // Close
    widget.close();
    expect(panel.classList.contains('oa-hidden')).toBe(true);
    expect(launcher.getAttribute('aria-expanded')).toBe('false');

    // Toggle
    widget.toggle();
    expect(panel.classList.contains('oa-hidden')).toBe(false);
  });

  it('clears messages and resets input state upon restart', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, data: {} }),
    } as any);

    const widget = new OpenAgentWidget({ siteId: 'pk_live_restart_test' });
    await widget.mount();

    const host = document.querySelector('openagent-chat')!;
    const shadow = host.shadowRoot!;

    // Simulate appending a message row
    const messagesContainer = shadow.querySelector('.oa-messages')!;
    const dummyMsg = document.createElement('div');
    dummyMsg.className = 'oa-message-row';
    messagesContainer.appendChild(dummyMsg);

    expect(shadow.querySelectorAll('.oa-message-row').length).toBe(1);

    // Call restart
    widget.restart();
    expect(shadow.querySelectorAll('.oa-message-row').length).toBe(0);
  });
});
