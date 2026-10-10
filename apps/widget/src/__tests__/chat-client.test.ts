// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatClient } from '../chat-client.js';

describe('ChatClient Transport & Session Management', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('generates an anonymous visitor session ID and reuses it on subsequent initializations', () => {
    const client1 = new ChatClient({ siteId: 'pk_live_site_1' });
    const id1 = client1.visitorSessionId;
    expect(id1).toMatch(/^v_[a-z0-9]+/);

    const client2 = new ChatClient({ siteId: 'pk_live_site_1' });
    expect(client2.visitorSessionId).toBe(id1);
  });

  it('isolates visitor session IDs across different site IDs', () => {
    const clientA = new ChatClient({ siteId: 'pk_live_site_A' });
    const clientB = new ChatClient({ siteId: 'pk_live_site_B' });

    expect(clientA.visitorSessionId).not.toBe(clientB.visitorSessionId);
  });

  it('loads site configuration from API handshake endpoint', async () => {
    const mockSiteData = {
      name: 'Acme Superbot',
      branding: {
        botName: 'Acme AI',
        primaryColor: '#10b981',
        welcomeMessage: 'Welcome to Acme!',
        position: 'bottom-left',
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        data: mockSiteData,
      }),
    } as any);

    const client = new ChatClient({ siteId: 'pk_live_test_site', apiUrl: 'http://localhost:3001' });
    const config = await client.loadConfig();

    expect(config.primaryColor).toBe('#10b981');
    expect(config.botName).toBe('Acme AI');
    expect(config.welcomeMessage).toBe('Welcome to Acme!');
    expect(config.position).toBe('bottom-left');
  });

  it('handles API network failure during handshake gracefully with fallback defaults', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

    const client = new ChatClient({
      siteId: 'pk_live_offline_site',
      primaryColor: '#6366f1',
      botName: 'Fallback Bot',
    });

    const config = await client.loadConfig();
    expect(config.primaryColor).toBe('#6366f1');
    expect(config.botName).toBe('Fallback Bot');
  });
});
