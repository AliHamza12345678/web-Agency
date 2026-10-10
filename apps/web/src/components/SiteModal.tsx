import React, { useState, useEffect } from 'react';
import type { Site, SiteBranding } from '../types.js';

interface SiteModalProps {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Site>) => Promise<void>;
  onRegenerateKey?: (siteId: string) => Promise<void>;
}

export const SiteModal: React.FC<SiteModalProps> = ({
  site,
  isOpen,
  onClose,
  onSave,
  onRegenerateKey,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'branding' | 'embed'>('general');
  const [name, setName] = useState('');
  const [origins, setOrigins] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [branding, setBranding] = useState<SiteBranding>({
    botName: 'AI Support Assistant',
    primaryColor: '#6366f1',
    textColor: '#ffffff',
    welcomeMessage: 'Hello! How can I help you today?',
    placeholder: 'Ask a question...',
    position: 'bottom-right',
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (site) {
      setName(site.name);
      setOrigins(site.allowedOrigins?.join(', ') || '');
      setSystemPrompt(site.systemPrompt || '');
      setBranding({
        botName: site.branding?.botName || 'AI Support Assistant',
        primaryColor: site.branding?.primaryColor || '#6366f1',
        textColor: site.branding?.textColor || '#ffffff',
        welcomeMessage: site.branding?.welcomeMessage || 'Hello! How can I help you today?',
        placeholder: site.branding?.placeholder || 'Ask a question...',
        position: site.branding?.position || 'bottom-right',
      });
      setActiveTab('general');
    } else {
      setName('');
      setOrigins('');
      setSystemPrompt('You are a helpful website assistant. Answer only from the site knowledge.');
      setBranding({
        botName: 'AI Assistant',
        primaryColor: '#6366f1',
        textColor: '#ffffff',
        welcomeMessage: 'Hi there! How can I assist you?',
        placeholder: 'Ask a question...',
        position: 'bottom-right',
      });
      setActiveTab('general');
    }
  }, [site, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const originsList = origins
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    try {
      await onSave({
        name: name.trim(),
        allowedOrigins: originsList,
        systemPrompt: systemPrompt.trim() || undefined,
        branding,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const embedSnippet = site
    ? `<script src="${window.location.origin.replace(':3000', ':3001')}/widget.js" data-site-id="${site.publicKey}" defer></script>`
    : '';

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(embedSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '24px',
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '24px 30px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h3>{site ? `Configure: ${site.name}` : 'New Website Chatbot'}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
              {site ? 'Manage allowed domains, custom branding, and embed credentials' : 'Set up a new isolated AI conversational assistant for your website'}
            </p>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.25rem', padding: '4px 10px' }}>
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0 30px',
          gap: '24px',
          background: 'rgba(0,0,0,0.15)',
        }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: 0,
              padding: '14px 4px',
              borderBottom: activeTab === 'general' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'general' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: 600,
            }}
            onClick={() => setActiveTab('general')}
          >
            General & Origins
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{
              borderRadius: 0,
              padding: '14px 4px',
              borderBottom: activeTab === 'branding' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              color: activeTab === 'branding' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: 600,
            }}
            onClick={() => setActiveTab('branding')}
          >
            Branding & Style
          </button>
          {site && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                borderRadius: 0,
                padding: '14px 4px',
                borderBottom: activeTab === 'embed' ? '2px solid var(--accent-primary)' : '2px solid transparent',
                color: activeTab === 'embed' ? '#ffffff' : 'var(--text-muted)',
                fontWeight: 600,
              }}
              onClick={() => setActiveTab('embed')}
            >
              Embed Snippet
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '24px 30px', flex: 1 }}>
          {activeTab === 'general' && (
            <>
              <div className="form-group">
                <label className="form-label">Website / Bot Label</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Acme Main Store"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Allowed Web Origins (CORS Security)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="https://example.com, https://app.example.com"
                  value={origins}
                  onChange={(e) => setOrigins(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                  Comma-separated list of host website URLs. Requests from unauthorized domains are blocked with 403 Forbidden. Leave empty to allow any origin in development.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">System Persona & Grounding Directives</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  placeholder="Instructions for the AI persona on how to answer visitors..."
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
              </div>
            </>
          )}

          {activeTab === 'branding' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label className="form-label">Bot Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={branding.botName}
                    onChange={(e) => setBranding({ ...branding, botName: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Primary Brand Color</label>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border-subtle)',
                        background: 'none',
                        cursor: 'pointer',
                      }}
                    />
                    <input
                      type="text"
                      className="form-input"
                      value={branding.primaryColor}
                      onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Welcome Message</label>
                <input
                  type="text"
                  className="form-input"
                  value={branding.welcomeMessage}
                  onChange={(e) => setBranding({ ...branding, welcomeMessage: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Input Field Placeholder</label>
                <input
                  type="text"
                  className="form-input"
                  value={branding.placeholder}
                  onChange={(e) => setBranding({ ...branding, placeholder: e.target.value })}
                />
              </div>

              {/* Live Preview Box */}
              <div style={{
                marginTop: '16px',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Widget Preview
                </span>
                <div style={{
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: branding.primaryColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: branding.textColor,
                    fontWeight: 700,
                  }}>
                    🤖
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>{branding.botName}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{branding.welcomeMessage}</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'embed' && site && (
            <div>
              <div className="form-group">
                <label className="form-label">Public Widget Key</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="text"
                    className="form-input"
                    value={site.publicKey}
                    readOnly
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
                  />
                  {onRegenerateKey && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => onRegenerateKey(site.id)}
                    >
                      Rotate Key
                    </button>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">HTML Embed Snippet</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={embedSnippet}
                  readOnly
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                />
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCopySnippet}
                style={{ width: '100%', marginTop: '6px' }}
              >
                {copied ? '✓ Copied to Clipboard!' : 'Copy Embed Code'}
              </button>

              <div style={{
                marginTop: '16px',
                fontSize: '0.8125rem',
                color: 'var(--text-dim)',
                lineHeight: 1.6,
              }}>
                Paste this script tag before the closing <code>&lt;/body&gt;</code> tag of your website. It initializes an isolated Shadow DOM chat bubble that will not interfere with your host CSS or JS.
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '28px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : site ? 'Update Configuration' : 'Create Chatbot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
