import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import type {
  TenantMembership,
  Site,
  SiteStudioConfig,
  DomainVerification,
  ConfigurationVersion,
  EmbedSnippetData,
} from '../types.js';

interface StudioPageProps {
  tenant: TenantMembership;
  site: Site;
  onBack: () => void;
}

type TabType =
  | 'assistant'
  | 'profile'
  | 'theme'
  | 'messaging'
  | 'behavior'
  | 'localization'
  | 'knowledge'
  | 'tools'
  | 'support'
  | 'availability'
  | 'retention'
  | 'throttling'
  | 'analytics'
  | 'embed'
  | 'domains'
  | 'versions';

interface ChatPreviewMessage {
  id: string;
  role: 'assistant' | 'visitor';
  content: string;
  time: string;
}

export const StudioPage: React.FC<StudioPageProps> = ({ tenant, site, onBack }) => {
  const [activeTab, setActiveTab] = useState<TabType>('assistant');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Studio configuration state
  const [draftConfig, setDraftConfig] = useState<SiteStudioConfig | null>(null);
  const [publishedConfig, setPublishedConfig] = useState<SiteStudioConfig | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState(1);
  const [versions, setVersions] = useState<ConfigurationVersion[]>([]);

  // Embed and domain state
  const [embedData, setEmbedData] = useState<EmbedSnippetData | null>(null);
  const [domains, setDomains] = useState<DomainVerification[]>([]);
  const [newDomainInput, setNewDomainInput] = useState('');
  const [newDomainMethod, setNewDomainMethod] = useState<'dns_txt' | 'meta_tag' | 'well_known'>('dns_txt');
  const [activeDomainInstructions, setActiveDomainInstructions] = useState<any | null>(null);

  // Preview Frame & Playground state
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [isWidgetOpen, setIsWidgetOpen] = useState(true);
  const [previewInput, setPreviewInput] = useState('');
  const [testMessages, setTestMessages] = useState<ChatPreviewMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Assistant Profile & Personality state
  const [profilePreview, setProfilePreview] = useState<{
    compiledInstruction: string;
    summary: any;
  } | null>(null);
  const [previewingProfile, setPreviewingProfile] = useState(false);
  const [newAllowedTopic, setNewAllowedTopic] = useState('');
  const [newOutOfScopeTopic, setNewOutOfScopeTopic] = useState('');
  const [newFactLabel, setNewFactLabel] = useState('');
  const [newFactValue, setNewFactValue] = useState('');
  const [newPolicyName, setNewPolicyName] = useState('');
  const [newPolicyRule, setNewPolicyRule] = useState('');

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadStudioData = async () => {
    try {
      setLoading(true);
      const res = await api.getStudioConfiguration(tenant.tenantId, site.id);
      setDraftConfig(res.draftConfiguration);
      setPublishedConfig(res.publishedConfiguration);
      setIsDirty(res.isDirty);
      setPublishedVersion(res.publishedVersion);
      setVersions(res.versions || []);

      // Prepopulate initial preview welcome message
      if (res.draftConfiguration?.messaging?.welcomeMessage) {
        setTestMessages([
          {
            id: 'init_1',
            role: 'assistant',
            content: res.draftConfiguration.messaging.welcomeMessage,
            time: 'Just now',
          },
        ]);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to load configuration studio', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudioData();
  }, [tenant.tenantId, site.id]);

  // Load embed or domain data when respective tabs are clicked
  useEffect(() => {
    if (activeTab === 'embed' && !embedData) {
      api.getStudioEmbed(tenant.tenantId, site.id).then(setEmbedData).catch(console.error);
    }
    if (activeTab === 'domains') {
      api.getStudioDomains(tenant.tenantId, site.id).then(setDomains).catch(console.error);
    }
    if (activeTab === 'versions') {
      api.getStudioVersions(tenant.tenantId, site.id).then(setVersions).catch(console.error);
    }
  }, [activeTab]);

  // Handle draft state mutations
  const updateDraft = <K extends keyof SiteStudioConfig>(section: K, updates: Partial<SiteStudioConfig[K]>) => {
    if (!draftConfig) return;
    const next: SiteStudioConfig = {
      ...draftConfig,
      [section]: {
        ...draftConfig[section],
        ...updates,
      },
    };
    setDraftConfig(next);
    setIsDirty(true);
  };

  const handlePreviewProfile = async () => {
    if (!draftConfig) return;
    try {
      setPreviewingProfile(true);
      const res = await api.previewProfile(tenant.tenantId, site.id, draftConfig.profile);
      setProfilePreview(res);
      showToast('Assistant profile compiled successfully!', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to generate profile preview', 'error');
    } finally {
      setPreviewingProfile(false);
    }
  };

  // Save Draft
  const handleSaveDraft = async () => {
    if (!draftConfig) return;
    try {
      setSaving(true);
      const res = await api.saveStudioDraft(tenant.tenantId, site.id, draftConfig);
      setDraftConfig(res.draftConfiguration);
      setIsDirty(res.isDirty);
      showToast('Draft configuration saved successfully', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to save draft', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Publish Changes
  const handlePublish = async () => {
    try {
      setPublishing(true);
      const res = await api.publishStudioConfig(
        tenant.tenantId,
        site.id,
        `Published updates for ${draftConfig?.assistant.name || 'Assistant'}`
      );
      setPublishedVersion(res.version);
      setPublishedConfig(res.publishedConfiguration);
      setDraftConfig(res.publishedConfiguration);
      setIsDirty(false);
      setVersions((prev) => [res.versionRecord, ...prev]);
      showToast(`🎉 Configuration version ${res.version} published to live production!`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to publish configuration', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // Rollback to version
  const handleRollback = async (version: number) => {
    if (!confirm(`Are you sure you want to rollback to configuration Version ${version}? This will overwrite your current draft.`)) {
      return;
    }
    try {
      setSaving(true);
      const res = await api.rollbackStudioConfig(tenant.tenantId, site.id, version, false);
      setDraftConfig(res.draftConfiguration);
      setIsDirty(true);
      showToast(`Draft restored to historical Version ${version}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Rollback failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Domains handling
  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomainInput.trim()) return;
    try {
      const res = await api.createStudioDomain(tenant.tenantId, site.id, newDomainInput.trim(), newDomainMethod);
      setDomains((prev) => [res.verification, ...prev]);
      setActiveDomainInstructions(res.instructions);
      setNewDomainInput('');
      showToast(`Domain verification initiated for ${res.verification.domain}`, 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to add domain', 'error');
    }
  };

  const handleVerifyCheck = async (id: string) => {
    try {
      const updated = await api.checkStudioDomain(tenant.tenantId, site.id, id);
      setDomains((prev) => prev.map((d) => (d.id === id ? updated : d)));
      if (updated.status === 'verified') {
        showToast(`Domain ${updated.domain} verified and whitelisted!`, 'success');
      } else {
        showToast(`Verification check failed: ${updated.errorMessage || 'DNS TXT record not found yet'}`, 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Verification check error', 'error');
    }
  };

  const handleDeleteDomain = async (id: string) => {
    try {
      await api.deleteStudioDomain(tenant.tenantId, site.id, id);
      setDomains((prev) => prev.filter((d) => d.id !== id));
      showToast('Domain verification removed', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete domain', 'error');
    }
  };

  // Preview Playground Chat Interaction
  const handleSendPreviewMessage = (textToSend?: string) => {
    const text = (textToSend || previewInput).trim();
    if (!text || !draftConfig) return;

    const visitorMsg: ChatPreviewMessage = {
      id: 'msg_v_' + Date.now(),
      role: 'visitor',
      content: text,
      time: 'Now',
    };

    setTestMessages((prev) => [...prev, visitorMsg]);
    setPreviewInput('');
    setIsTyping(true);

    // Simulate smart preview assistant response grounded in draft settings
    setTimeout(() => {
      let reply = `Thanks for asking! I'm ${draftConfig.assistant.name}, speaking in a ${draftConfig.behavior.tone} tone.`;
      if (text.toLowerCase().includes('help') || text.toLowerCase().includes('offer')) {
        reply = `We specialize in website guidance, catalog discovery, and support handoffs. Scope is currently set to "${draftConfig.knowledge.scope}".`;
      } else if (text.toLowerCase().includes('contact') || text.toLowerCase().includes('support')) {
        reply = `You can reach our team at ${draftConfig.support.email || 'support@' + site.name.toLowerCase().replace(/\s+/g, '') + '.com'}. Hours: ${draftConfig.support.hours || 'Mon-Fri 9-5'}.`;
      } else if (text.toLowerCase().includes('hours') || text.toLowerCase().includes('offline')) {
        reply = `Operating schedule: ${draftConfig.availability.activeHoursStart} to ${draftConfig.availability.activeHoursEnd} (${draftConfig.availability.timezone}).`;
      }

      setTestMessages((prev) => [
        ...prev,
        {
          id: 'msg_a_' + Date.now(),
          role: 'assistant',
          content: reply,
          time: 'Now',
        },
      ]);
      setIsTyping(false);
    }, 600);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    showToast(`Copied ${label} to clipboard!`, 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading || !draftConfig) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '12px' }}>⚙️ Loading Configuration Studio...</div>
        <div>Retrieving draft settings, published bundles, and verification status</div>
      </div>
    );
  }

  const { assistant, theme, messaging, localization, behavior, knowledge, tools, support, availability, retention, throttling, analytics } = draftConfig;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '12px 20px',
            borderRadius: '8px',
            background: toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#3b82f6' : '#10b981',
            color: '#fff',
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
            zIndex: 99999,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Top Navigation Bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={onBack}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
          >
            ← Back
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>
                {site.name} — Configuration Studio
              </h1>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: isDirty ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: isDirty ? '#f59e0b' : '#10b981',
                  fontWeight: 600,
                }}
              >
                {isDirty ? '● Unsaved Draft' : `● v${publishedVersion} Published`}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Site ID: <code>{site.publicKey}</code> • Changes take effect instantly without rebuilding widget bundle
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="btn btn-secondary"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            style={{ padding: '8px 16px' }}
          >
            {saving ? 'Saving...' : '💾 Save Draft'}
          </button>
          <button
            className="btn btn-primary"
            onClick={handlePublish}
            disabled={publishing}
            style={{
              padding: '8px 20px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              fontWeight: 600,
              boxShadow: '0 2px 10px rgba(79, 70, 229, 0.4)',
            }}
          >
            {publishing ? 'Publishing...' : '🚀 Publish Changes'}
          </button>
        </div>
      </header>

      {/* Main Studio Workspace: Settings Panel (Left) & Live Preview (Right) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Side: Settings Navigation & Editor */}
        <div
          style={{
            width: '540px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-surface)',
          }}
        >
          {/* Tabs Bar */}
          <div
            style={{
              display: 'flex',
              overflowX: 'auto',
              padding: '8px 12px 0',
              borderBottom: '1px solid var(--border-subtle)',
              gap: '4px',
              background: 'var(--bg-surface)',
            }}
          >
            {[
              { id: 'assistant', label: '🤖 Assistant' },
              { id: 'profile', label: '🎭 Personality & Profile' },
              { id: 'theme', label: '🎨 Theme' },
              { id: 'messaging', label: '💬 Messaging' },
              { id: 'behavior', label: '🧠 Behavior' },
              { id: 'localization', label: '🌐 Language' },
              { id: 'knowledge', label: '📚 Scope' },
              { id: 'tools', label: '⚡ Tools' },
              { id: 'support', label: '🎧 Support' },
              { id: 'availability', label: '⏰ Hours' },
              { id: 'retention', label: '🔒 Retention' },
              { id: 'throttling', label: '⏱️ Limits' },
              { id: 'analytics', label: '📊 Feedback' },
              { id: 'embed', label: '📦 Embed' },
              { id: 'domains', label: '🛡️ Domains' },
              { id: 'versions', label: '📜 History' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                style={{
                  padding: '8px 12px',
                  fontSize: '0.8125rem',
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--text-muted)',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                  background: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content Panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
            {/* 1. ASSISTANT TAB */}
            {activeTab === 'assistant' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Assistant Identity</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Customize what visitors see in chat header and notification prompts.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Assistant Display Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={assistant.name}
                    onChange={(e) => updateDraft('assistant', { name: e.target.value })}
                    placeholder="e.g. Acme Concierge"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Avatar Format</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {(['emoji', 'preset', 'url'] as const).map((type) => (
                      <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name="avatarType"
                          checked={assistant.avatarType === type}
                          onChange={() => updateDraft('assistant', { avatarType: type })}
                        />
                        <span style={{ textTransform: 'capitalize' }}>{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Avatar Symbol / URL</label>
                  <input
                    type="text"
                    className="form-input"
                    value={assistant.avatar}
                    onChange={(e) => updateDraft('assistant', { avatar: e.target.value })}
                    placeholder={assistant.avatarType === 'emoji' ? '🤖' : 'https://...'}
                  />
                </div>
              </div>
            )}

            {/* 1b. PERSONALITY & PROFILE TAB (BONUS) */}
            {activeTab === 'profile' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '4px' }}>Conversational Personality & Scope Profile</h2>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Configure business ground-truth, allowed topic boundaries, and adaptive persona.
                    </p>
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={handlePreviewProfile}
                    disabled={previewingProfile}
                    style={{ fontSize: '0.8125rem', padding: '6px 12px' }}
                  >
                    {previewingProfile ? 'Compiling...' : '👁️ Preview Compiled Prompt'}
                  </button>
                </div>

                {/* Compiled Preview Drawer / Alert */}
                {profilePreview && (
                  <div style={{
                    marginBottom: '20px',
                    padding: '16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-accent, #4f46e5)',
                    borderRadius: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#818cf8' }}>
                        ⚡ Server-Compiled System Instruction Preview
                      </span>
                      <button
                        className="btn-ghost"
                        onClick={() => setProfilePreview(null)}
                        style={{ fontSize: '0.75rem', cursor: 'pointer', padding: '2px 8px' }}
                      >
                        ✕ Close
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', fontSize: '0.75rem' }}>
                      <span style={{ background: 'rgba(79, 70, 229, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                        Formality: {profilePreview.summary.formality}
                      </span>
                      <span style={{ background: 'rgba(79, 70, 229, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                        Warmth: {profilePreview.summary.warmth}
                      </span>
                      <span style={{ background: 'rgba(79, 70, 229, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                        Allowed Topics: {profilePreview.summary.allowedTopicCount}
                      </span>
                      <span style={{ background: 'rgba(239, 68, 68, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                        Out of Scope: {profilePreview.summary.outOfScopeTopicCount}
                      </span>
                      <span style={{ background: 'rgba(16, 185, 129, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>
                        Verified Facts: {profilePreview.summary.verifiedFactCount}
                      </span>
                    </div>

                    <textarea
                      readOnly
                      value={profilePreview.compiledInstruction}
                      rows={10}
                      style={{
                        width: '100%',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        background: '#0f172a',
                        color: '#94a3b8',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid #334155',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                )}

                {/* Section A: Verified Business Identity */}
                <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>🏢 Business Identity</h3>
                  <div className="form-group" style={{ marginBottom: '12px' }}>
                    <label className="form-label">Verified Business Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={draftConfig.profile?.businessName ?? site.name}
                      onChange={(e) => updateDraft('profile', { ...draftConfig.profile, businessName: e.target.value })}
                      placeholder="e.g. Acme Health Products, Luxe Boutique"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Business Description <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(Sandboxed factual reference)</span>
                    </label>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={draftConfig.profile?.businessDescription || ''}
                      onChange={(e) => updateDraft('profile', { ...draftConfig.profile, businessDescription: e.target.value })}
                      placeholder="Verified description of products, services, target audience, and specialization..."
                    />
                  </div>
                </div>

                {/* Section B: Conversational Personality */}
                <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>🎭 Conversational Dimensions</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Formality</label>
                      <select
                        className="form-input"
                        value={draftConfig.profile?.personality?.formality || 'neutral'}
                        onChange={(e) => updateDraft('profile', {
                          ...draftConfig.profile,
                          personality: {
                            ...draftConfig.profile?.personality,
                            formality: e.target.value as any,
                          },
                        })}
                      >
                        <option value="formal">Formal & Polite</option>
                        <option value="neutral">Neutral & Balanced</option>
                        <option value="casual">Casual & Friendly</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Warmth</label>
                      <select
                        className="form-input"
                        value={draftConfig.profile?.personality?.warmth || 'balanced'}
                        onChange={(e) => updateDraft('profile', {
                          ...draftConfig.profile,
                          personality: {
                            ...draftConfig.profile?.personality,
                            warmth: e.target.value as any,
                          },
                        })}
                      >
                        <option value="high">High Warmth & Empathy</option>
                        <option value="balanced">Balanced Cordial</option>
                        <option value="reserved">Reserved & Objective</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Verbosity</label>
                      <select
                        className="form-input"
                        value={draftConfig.profile?.personality?.verbosity || 'balanced'}
                        onChange={(e) => updateDraft('profile', {
                          ...draftConfig.profile,
                          personality: {
                            ...draftConfig.profile?.personality,
                            verbosity: e.target.value as any,
                          },
                        })}
                      >
                        <option value="concise">Concise (1-3 sentences)</option>
                        <option value="balanced">Balanced</option>
                        <option value="detailed">Detailed & Thorough</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Response Style</label>
                      <select
                        className="form-input"
                        value={draftConfig.profile?.personality?.responseStyle || 'conversational'}
                        onChange={(e) => updateDraft('profile', {
                          ...draftConfig.profile,
                          personality: {
                            ...draftConfig.profile?.personality,
                            responseStyle: e.target.value as any,
                          },
                        })}
                      >
                        <option value="conversational">Conversational Prose</option>
                        <option value="bulleted">Bulleted Lists</option>
                        <option value="step_by_step">Step-by-Step Instructions</option>
                        <option value="direct">Direct (Bottom Line First)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Section C: Topic Scope & Guardrails */}
                <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>🎯 Allowed vs Out-of-Scope Topics</h3>

                  {/* Allowed topics */}
                  <div style={{ marginBottom: '14px' }}>
                    <label className="form-label" style={{ color: '#10b981' }}>✓ Allowed Topics (In-Scope)</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={newAllowedTopic}
                        onChange={(e) => setNewAllowedTopic(e.target.value)}
                        placeholder="e.g. dress sizing, shipping times, menu items..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newAllowedTopic.trim()) {
                            e.preventDefault();
                            const current = draftConfig.profile?.topicScope?.allowedTopics || [];
                            updateDraft('profile', {
                              ...draftConfig.profile,
                              topicScope: {
                                ...draftConfig.profile?.topicScope,
                                allowedTopics: [...current, newAllowedTopic.trim()],
                              },
                            });
                            setNewAllowedTopic('');
                          }
                        }}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!newAllowedTopic.trim()) return;
                          const current = draftConfig.profile?.topicScope?.allowedTopics || [];
                          updateDraft('profile', {
                            ...draftConfig.profile,
                            topicScope: {
                              ...draftConfig.profile?.topicScope,
                              allowedTopics: [...current, newAllowedTopic.trim()],
                            },
                          });
                          setNewAllowedTopic('');
                        }}
                      >
                        Add
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(draftConfig.profile?.topicScope?.allowedTopics || []).map((t, idx) => (
                        <span key={idx} style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          color: '#10b981',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8125rem',
                        }}>
                          {t}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (draftConfig.profile?.topicScope?.allowedTopics || []).filter((_, i) => i !== idx);
                              updateDraft('profile', {
                                ...draftConfig.profile,
                                topicScope: {
                                  ...draftConfig.profile?.topicScope,
                                  allowedTopics: updated,
                                },
                              });
                            }}
                            style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Out of scope topics */}
                  <div style={{ marginBottom: '14px' }}>
                    <label className="form-label" style={{ color: '#ef4444' }}>✕ Out-of-Scope Topics (Prohibited)</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={newOutOfScopeTopic}
                        onChange={(e) => setNewOutOfScopeTopic(e.target.value)}
                        placeholder="e.g. medical advice, coding solutions, political debates..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newOutOfScopeTopic.trim()) {
                            e.preventDefault();
                            const current = draftConfig.profile?.topicScope?.outOfScopeTopics || [];
                            updateDraft('profile', {
                              ...draftConfig.profile,
                              topicScope: {
                                ...draftConfig.profile?.topicScope,
                                outOfScopeTopics: [...current, newOutOfScopeTopic.trim()],
                              },
                            });
                            setNewOutOfScopeTopic('');
                          }
                        }}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!newOutOfScopeTopic.trim()) return;
                          const current = draftConfig.profile?.topicScope?.outOfScopeTopics || [];
                          updateDraft('profile', {
                            ...draftConfig.profile,
                            topicScope: {
                              ...draftConfig.profile?.topicScope,
                              outOfScopeTopics: [...current, newOutOfScopeTopic.trim()],
                            },
                          });
                          setNewOutOfScopeTopic('');
                        }}
                      >
                        Add
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(draftConfig.profile?.topicScope?.outOfScopeTopics || []).map((t, idx) => (
                        <span key={idx} style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'rgba(239, 68, 68, 0.1)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#ef4444',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '0.8125rem',
                        }}>
                          {t}
                          <button
                            type="button"
                            onClick={() => {
                              const updated = (draftConfig.profile?.topicScope?.outOfScopeTopics || []).filter((_, i) => i !== idx);
                              updateDraft('profile', {
                                ...draftConfig.profile,
                                topicScope: {
                                  ...draftConfig.profile?.topicScope,
                                  outOfScopeTopics: updated,
                                },
                              });
                            }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Out of scope message */}
                  <div className="form-group">
                    <label className="form-label">Out-of-Scope Redirection Response</label>
                    <input
                      type="text"
                      className="form-input"
                      value={draftConfig.profile?.topicScope?.outOfScopeMessage || ''}
                      onChange={(e) => updateDraft('profile', {
                        ...draftConfig.profile,
                        topicScope: {
                          ...draftConfig.profile?.topicScope,
                          outOfScopeMessage: e.target.value,
                        },
                      })}
                      placeholder="I'm specifically focused on helping with our website services. For other topics, please contact our team directly."
                    />
                  </div>
                </div>

                {/* Section D: Verified Facts & Policies */}
                <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>📜 Verified Facts & Official Policies</h3>

                  {/* Facts */}
                  <div style={{ marginBottom: '16px' }}>
                    <label className="form-label">Verified Business Facts (Official Ground Truth)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Label (e.g. Return Window)"
                        value={newFactLabel}
                        onChange={(e) => setNewFactLabel(e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Fact (e.g. 14 days with original tags)"
                        value={newFactValue}
                        onChange={(e) => setNewFactValue(e.target.value)}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!newFactLabel.trim() || !newFactValue.trim()) return;
                          const current = draftConfig.profile?.verifiedFacts || [];
                          updateDraft('profile', {
                            ...draftConfig.profile,
                            verifiedFacts: [...current, { label: newFactLabel.trim(), fact: newFactValue.trim() }],
                          });
                          setNewFactLabel('');
                          setNewFactValue('');
                        }}
                      >
                        + Add Fact
                      </button>
                    </div>

                    {(draftConfig.profile?.verifiedFacts || []).map((f, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 12px',
                        background: 'var(--bg-card)',
                        borderRadius: '6px',
                        marginBottom: '6px',
                        fontSize: '0.8125rem',
                      }}>
                        <div>
                          <strong>{f.label}:</strong> {f.fact}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (draftConfig.profile?.verifiedFacts || []).filter((_, i) => i !== idx);
                            updateDraft('profile', { ...draftConfig.profile, verifiedFacts: updated });
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Policies */}
                  <div>
                    <label className="form-label">Official Business Policies</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Policy Name (e.g. Shipping Policy)"
                        value={newPolicyName}
                        onChange={(e) => setNewPolicyName(e.target.value)}
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Rule (e.g. Orders placed before 2 PM ship same-day)"
                        value={newPolicyRule}
                        onChange={(e) => setNewPolicyRule(e.target.value)}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (!newPolicyName.trim() || !newPolicyRule.trim()) return;
                          const current = draftConfig.profile?.verifiedPolicies || [];
                          updateDraft('profile', {
                            ...draftConfig.profile,
                            verifiedPolicies: [...current, { name: newPolicyName.trim(), rule: newPolicyRule.trim() }],
                          });
                          setNewPolicyName('');
                          setNewPolicyRule('');
                        }}
                      >
                        + Add Policy
                      </button>
                    </div>

                    {(draftConfig.profile?.verifiedPolicies || []).map((p, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 12px',
                        background: 'var(--bg-card)',
                        borderRadius: '6px',
                        marginBottom: '6px',
                        fontSize: '0.8125rem',
                      }}>
                        <div>
                          <strong>{p.name}:</strong> {p.rule}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (draftConfig.profile?.verifiedPolicies || []).filter((_, i) => i !== idx);
                            updateDraft('profile', { ...draftConfig.profile, verifiedPolicies: updated });
                          }}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Section E: Languages & Script */}
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '12px' }}>🌐 Language & Script Directives</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div className="form-group">
                      <label className="form-label">Script Preference</label>
                      <select
                        className="form-input"
                        value={draftConfig.profile?.scriptPreference || 'auto'}
                        onChange={(e) => updateDraft('profile', {
                          ...draftConfig.profile,
                          scriptPreference: e.target.value as any,
                        })}
                      >
                        <option value="auto">Auto-Detect Visitor Script</option>
                        <option value="latin">Latin / Roman Urdu</option>
                        <option value="nastaliq">Urdu Nastaliq Script</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.875rem' }}>
                        <input
                          type="checkbox"
                          checked={draftConfig.profile?.allowCodeSwitching !== false}
                          onChange={(e) => updateDraft('profile', {
                            ...draftConfig.profile,
                            allowCodeSwitching: e.target.checked,
                          })}
                        />
                        <span>Allow Bilingual Code-Switching (e.g. English + Urdu)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. THEME & STYLING TAB */}
            {activeTab === 'theme' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Visual Styling & Theme</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Match your brand palette and customize dimensions without rebuilding bundles.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Primary Color</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="color"
                        value={theme.primaryColor}
                        onChange={(e) => updateDraft('theme', { primaryColor: e.target.value })}
                        style={{ width: '40px', height: '36px', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={theme.primaryColor}
                        onChange={(e) => updateDraft('theme', { primaryColor: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Accent Color</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="color"
                        value={theme.accentColor}
                        onChange={(e) => updateDraft('theme', { accentColor: e.target.value })}
                        style={{ width: '40px', height: '36px', padding: '2px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}
                      />
                      <input
                        type="text"
                        className="form-input"
                        value={theme.accentColor}
                        onChange={(e) => updateDraft('theme', { accentColor: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Typography Preset</label>
                    <select
                      className="form-input"
                      value={theme.typography}
                      onChange={(e) => updateDraft('theme', { typography: e.target.value as any })}
                    >
                      <option value="inter">Inter (Modern Sans)</option>
                      <option value="roboto">Roboto (Clean Sans)</option>
                      <option value="outfit">Outfit (Geometric & Friendly)</option>
                      <option value="system">System UI Native</option>
                      <option value="serif">Classic Editorial Serif</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Launcher Position</label>
                    <select
                      className="form-input"
                      value={theme.launcherPosition}
                      onChange={(e) => updateDraft('theme', { launcherPosition: e.target.value as any })}
                    >
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Width (px)</label>
                    <input
                      type="number"
                      className="form-input"
                      min={320}
                      max={600}
                      value={theme.panelWidth}
                      onChange={(e) => updateDraft('theme', { panelWidth: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Height (px)</label>
                    <input
                      type="number"
                      className="form-input"
                      min={400}
                      max={900}
                      value={theme.panelHeight}
                      onChange={(e) => updateDraft('theme', { panelHeight: Number(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Radius (px)</label>
                    <input
                      type="number"
                      className="form-input"
                      min={0}
                      max={32}
                      value={theme.borderRadius}
                      onChange={(e) => updateDraft('theme', { borderRadius: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 3. MESSAGING TAB */}
            {activeTab === 'messaging' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Welcome & Conversation Starters</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  First impressions shown before visitors type their first message.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Welcome Message (Markdown supported)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    value={messaging.welcomeMessage}
                    onChange={(e) => updateDraft('messaging', { welcomeMessage: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Input Field Placeholder</label>
                  <input
                    type="text"
                    className="form-input"
                    value={messaging.placeholder}
                    onChange={(e) => updateDraft('messaging', { placeholder: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Suggested Questions (Chips)</label>
                  {messaging.suggestedQuestions.map((q, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={q}
                        onChange={(e) => {
                          const updated = [...messaging.suggestedQuestions];
                          updated[idx] = e.target.value;
                          updateDraft('messaging', { suggestedQuestions: updated });
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          const updated = messaging.suggestedQuestions.filter((_, i) => i !== idx);
                          updateDraft('messaging', { suggestedQuestions: updated });
                        }}
                        style={{ color: '#ef4444' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {messaging.suggestedQuestions.length < 6 && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8125rem', marginTop: '6px' }}
                      onClick={() =>
                        updateDraft('messaging', {
                          suggestedQuestions: [...messaging.suggestedQuestions, 'New question prompt'],
                        })
                      }
                    >
                      + Add Question
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* 4. BEHAVIOR & TONE TAB */}
            {activeTab === 'behavior' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Tone & Response Behavior</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Tune personality and answer verbosity for your brand tone.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Conversation Tone</label>
                    <select
                      className="form-input"
                      value={behavior.tone}
                      onChange={(e) => updateDraft('behavior', { tone: e.target.value as any })}
                    >
                      <option value="friendly">Friendly & Welcoming</option>
                      <option value="professional">Professional & Authoritative</option>
                      <option value="casual">Casual & Conversational</option>
                      <option value="concise">Concise & Direct</option>
                      <option value="technical">Technical & Precise</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Response Length</label>
                    <select
                      className="form-input"
                      value={behavior.responseLength}
                      onChange={(e) => updateDraft('behavior', { responseLength: e.target.value as any })}
                    >
                      <option value="concise">Concise (1-2 sentences)</option>
                      <option value="balanced">Balanced (1-2 paragraphs)</option>
                      <option value="detailed">Detailed (Thorough explanations)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Custom Business Directives (Sanitized)</label>
                  <textarea
                    className="form-input"
                    rows={4}
                    value={behavior.customInstructions}
                    onChange={(e) => updateDraft('behavior', { customInstructions: e.target.value })}
                    placeholder="e.g. Always emphasize that quotes are free and highlight 24/7 emergency services."
                  />
                </div>
              </div>
            )}

            {/* 5. LOCALIZATION TAB */}
            {activeTab === 'localization' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Language & Localization</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Provide multilingual assistance with automatic visitor language detection.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Default Language</label>
                  <select
                    className="form-input"
                    value={localization.defaultLanguage}
                    onChange={(e) => updateDraft('localization', { defaultLanguage: e.target.value })}
                  >
                    <option value="en">English (US/UK)</option>
                    <option value="es">Spanish (Español)</option>
                    <option value="fr">French (Français)</option>
                    <option value="de">German (Deutsch)</option>
                    <option value="ja">Japanese (日本語)</option>
                    <option value="zh">Chinese (中文)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={localization.autoDetect}
                      onChange={(e) => updateDraft('localization', { autoDetect: e.target.checked })}
                    />
                    <span>Auto-detect visitor language from browser headers</span>
                  </label>
                </div>
              </div>
            )}

            {/* 6. KNOWLEDGE TAB */}
            {activeTab === 'knowledge' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Knowledge Scope & Grounding</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Strict grounding bounds to eliminate hallucinations.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Grounding Scope Mode</label>
                  <select
                    className="form-input"
                    value={knowledge.scope}
                    onChange={(e) => updateDraft('knowledge', { scope: e.target.value as any })}
                  >
                    <option value="all">All Indexed Sources</option>
                    <option value="verified_only">Verified Documents Only</option>
                    <option value="strict">Strict (Refuse without direct quotation)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Allowed Knowledge Types</label>
                  {(['url', 'sitemap', 'faq', 'file', 'policy'] as const).map((source) => (
                    <label key={source} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <input
                        type="checkbox"
                        checked={knowledge.allowedSources.includes(source)}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...knowledge.allowedSources, source]
                            : knowledge.allowedSources.filter((s) => s !== source);
                          updateDraft('knowledge', { allowedSources: updated });
                        }}
                      />
                      <span style={{ textTransform: 'uppercase', fontSize: '0.8125rem' }}>{source}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 7. TOOLS & ACTIONS TAB */}
            {activeTab === 'tools' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Allowed Tools & Actions</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Select which capabilities the assistant can execute and require explicit confirmation for consequential actions.
                </p>

                {[
                  { id: 'search_website', label: 'Search Approved Website Pages', consequential: false },
                  { id: 'search_product_catalog', label: 'Search Product Catalog', consequential: false },
                  { id: 'get_business_info', label: 'Retrieve Verified Business Contact', consequential: false },
                  { id: 'search_faqs', label: 'Search FAQs & Policies', consequential: false },
                  { id: 'create_support_request', label: 'Create Support Ticket', consequential: true },
                  { id: 'capture_lead', label: 'Capture Lead with Consent', consequential: true },
                  { id: 'offer_human_handoff', label: 'Offer Human Escalation', consequential: false },
                ].map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: '12px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      marginBottom: '10px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={tools.allowedTools.includes(t.id)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...tools.allowedTools, t.id]
                              : tools.allowedTools.filter((id) => id !== t.id);
                            updateDraft('tools', { allowedTools: updated });
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.label}</span>
                      </div>
                      {t.consequential && (
                        <span style={{ fontSize: '0.6875rem', padding: '2px 6px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', borderRadius: '4px' }}>
                          Consequential Action
                        </span>
                      )}
                    </label>

                    {t.consequential && tools.allowedTools.includes(t.id) && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', marginLeft: '24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <input
                          type="checkbox"
                          checked={tools.requireConfirmationTools.includes(t.id)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...tools.requireConfirmationTools, t.id]
                              : tools.requireConfirmationTools.filter((id) => id !== t.id);
                            updateDraft('tools', { requireConfirmationTools: updated });
                          }}
                        />
                        Require visitor explicit confirmation before execution
                      </label>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 8. SUPPORT & ESCALATION TAB */}
            {activeTab === 'support' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Human Support Escalation</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Direct contact details shared when the AI offers human handoff.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Support Email</label>
                  <input
                    type="email"
                    className="form-input"
                    value={support.email || ''}
                    onChange={(e) => updateDraft('support', { email: e.target.value })}
                    placeholder="support@example.com"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Support Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    value={support.phone || ''}
                    onChange={(e) => updateDraft('support', { phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Operating Hours</label>
                  <input
                    type="text"
                    className="form-input"
                    value={support.hours || ''}
                    onChange={(e) => updateDraft('support', { hours: e.target.value })}
                    placeholder="Mon-Fri 9:00 AM - 5:00 PM EST"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Escalation / Ticketing Portal URL</label>
                  <input
                    type="url"
                    className="form-input"
                    value={support.escalationUrl || ''}
                    onChange={(e) => updateDraft('support', { escalationUrl: e.target.value })}
                    placeholder="https://helpdesk.example.com"
                  />
                </div>
              </div>
            )}

            {/* 9. AVAILABILITY & HOURS TAB */}
            {activeTab === 'availability' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Availability Schedule</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Control whether the chatbot responds around the clock or follows office hours.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={availability.scheduleEnabled}
                      onChange={(e) => updateDraft('availability', { scheduleEnabled: e.target.checked })}
                    />
                    <span>Enforce Business Hours Schedule</span>
                  </label>
                </div>

                {availability.scheduleEnabled && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                      <div className="form-group">
                        <label className="form-label">Active Start (HH:MM)</label>
                        <input
                          type="time"
                          className="form-input"
                          value={availability.activeHoursStart}
                          onChange={(e) => updateDraft('availability', { activeHoursStart: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Active End (HH:MM)</label>
                        <input
                          type="time"
                          className="form-input"
                          value={availability.activeHoursEnd}
                          onChange={(e) => updateDraft('availability', { activeHoursEnd: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label">Outside-Hours Message</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        value={availability.outsideHoursMessage}
                        onChange={(e) => updateDraft('availability', { outsideHoursMessage: e.target.value })}
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 10. RETENTION TAB */}
            {activeTab === 'retention' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Retention & Privacy</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Set how long conversation history is preserved on the server.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Conversation Retention (Days)</label>
                  <input
                    type="number"
                    className="form-input"
                    min={1}
                    max={365}
                    value={retention.retentionDays}
                    onChange={(e) => updateDraft('retention', { retentionDays: Number(e.target.value) })}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={retention.allowVisitorExport}
                      onChange={(e) => updateDraft('retention', { allowVisitorExport: e.target.checked })}
                    />
                    <span>Allow visitors to export or copy their chat transcript</span>
                  </label>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={retention.enablePiiRedaction}
                      onChange={(e) => updateDraft('retention', { enablePiiRedaction: e.target.checked })}
                    />
                    <span>Redact credit cards and SSNs in audit storage</span>
                  </label>
                </div>
              </div>
            )}

            {/* 11. THROTTLING TAB */}
            {activeTab === 'throttling' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Usage Limits & Abuse Protection</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Protect your AI quota from scraping and denial-of-wallet spikes.
                </p>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label">Per-Minute Rate Limit</label>
                  <input
                    type="number"
                    className="form-input"
                    min={5}
                    max={120}
                    value={throttling.rateLimitPerMinute}
                    onChange={(e) => updateDraft('throttling', { rateLimitPerMinute: Number(e.target.value) })}
                  />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Maximum queries accepted from a single visitor per minute.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Max Messages per Session</label>
                  <input
                    type="number"
                    className="form-input"
                    min={5}
                    max={200}
                    value={throttling.maxMessagesPerSession}
                    onChange={(e) => updateDraft('throttling', { maxMessagesPerSession: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {/* 12. ANALYTICS & FEEDBACK TAB */}
            {activeTab === 'analytics' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Visitor Feedback & Analytics</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Collect satisfaction scores directly inside the chat interface.
                </p>

                <div className="form-group" style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={analytics.collectFeedback}
                      onChange={(e) => updateDraft('analytics', { collectFeedback: e.target.checked })}
                    />
                    <span>Enable Thumbs Up / Thumbs Down feedback on answers</span>
                  </label>
                </div>

                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={analytics.trackAnalytics}
                      onChange={(e) => updateDraft('analytics', { trackAnalytics: e.target.checked })}
                    />
                    <span>Collect aggregate conversation & topic telemetry</span>
                  </label>
                </div>
              </div>
            )}

            {/* EMBED SNIPPET TAB */}
            {activeTab === 'embed' && embedData && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Widget Installation & Embed Code</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Copy either snippet and paste it right before the closing <code>&lt;/body&gt;</code> tag on your website.
                </p>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Standard Script Tag Embed</label>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => copyToClipboard(embedData.scriptSnippet, 'Script Embed')}
                    >
                      {copiedKey === 'Script Embed' ? '✓ Copied' : '📋 Copy Script'}
                    </button>
                  </div>
                  <pre
                    style={{
                      background: 'var(--bg-secondary)',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      overflowX: 'auto',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <code>{embedData.scriptSnippet}</code>
                  </pre>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label className="form-label" style={{ margin: 0 }}>Web Component Embed</label>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => copyToClipboard(embedData.webComponentSnippet, 'Web Component')}
                    >
                      {copiedKey === 'Web Component' ? '✓ Copied' : '📋 Copy Component'}
                    </button>
                  </div>
                  <pre
                    style={{
                      background: 'var(--bg-secondary)',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      overflowX: 'auto',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <code>{embedData.webComponentSnippet}</code>
                  </pre>
                </div>

                {/* Security separation notice */}
                <div
                  style={{
                    background: 'rgba(79, 70, 229, 0.08)',
                    border: '1px solid rgba(79, 70, 229, 0.25)',
                    padding: '14px',
                    borderRadius: '8px',
                    fontSize: '0.8125rem',
                  }}
                >
                  <strong style={{ display: 'block', color: 'var(--color-primary)', marginBottom: '4px' }}>
                    🛡️ Security Credentials Architecture
                  </strong>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>Public Site Identifier:</strong> {embedData.explanation.publicKeyDescription}
                  </div>
                  <div>
                    <strong>Private Server Credentials:</strong> {embedData.explanation.serverSecretsDescription}
                  </div>
                </div>
              </div>
            )}

            {/* DOMAINS TAB */}
            {activeTab === 'domains' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Domain Verification Flow</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Verify website domain ownership to prevent unauthorized third parties from embedding your chatbot assistant.
                </p>

                <form onSubmit={handleAddDomain} style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={newDomainInput}
                      onChange={(e) => setNewDomainInput(e.target.value)}
                      placeholder="e.g. store.mysite.com"
                      style={{ flex: 1 }}
                    />
                    <select
                      className="form-input"
                      value={newDomainMethod}
                      onChange={(e) => setNewDomainMethod(e.target.value as any)}
                      style={{ width: '130px' }}
                    >
                      <option value="dns_txt">DNS TXT</option>
                      <option value="meta_tag">HTML Meta</option>
                      <option value="well_known">Well-Known</option>
                    </select>
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px' }}>
                      + Add
                    </button>
                  </div>
                </form>

                {/* Instructions Box */}
                {activeDomainInstructions && (
                  <div
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-subtle)',
                      marginBottom: '18px',
                      fontSize: '0.8125rem',
                    }}
                  >
                    <strong>Verification Challenge Record:</strong>
                    <div style={{ marginTop: '6px' }}>
                      Type: <code>{activeDomainInstructions.dns_txt?.type || 'TXT'}</code>
                    </div>
                    <div>
                      Host: <code>{activeDomainInstructions.dns_txt?.host}</code>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      Value: <code>{activeDomainInstructions.dns_txt?.value}</code>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '0.6875rem' }}
                        onClick={() => copyToClipboard(activeDomainInstructions.dns_txt?.value, 'Token')}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {/* Configured Domains List */}
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '10px' }}>Configured Domains</h3>
                  {domains.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>No domains registered yet.</div>
                  ) : (
                    domains.map((dom) => (
                      <div
                        key={dom.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'var(--bg-secondary)',
                          marginBottom: '8px',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{dom.domain}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Method: {dom.verificationMethod} • Added {new Date(dom.createdAt).toLocaleDateString()}
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontWeight: 600,
                              background: dom.status === 'verified' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                              color: dom.status === 'verified' ? '#10b981' : '#f59e0b',
                            }}
                          >
                            {dom.status === 'verified' ? '✓ Verified' : 'Pending'}
                          </span>
                          {dom.status !== 'verified' && (
                            <button
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              onClick={() => handleVerifyCheck(dom.id)}
                            >
                              Check
                            </button>
                          )}
                          <button
                            className="btn btn-danger"
                            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteDomain(dom.id)}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* VERSION HISTORY & AUDIT TRAIL TAB */}
            {activeTab === 'versions' && (
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>Version History & Rollback</h2>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                  Inspect every snapshot published to live visitors and restore earlier settings if needed.
                </p>

                {versions.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                    No previous versions recorded yet. Publish your first changes to create an audit snapshot!
                  </div>
                ) : (
                  versions.map((ver) => (
                    <div
                      key={ver.id}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        background: 'var(--bg-secondary)',
                        marginBottom: '10px',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9375rem' }}>v{ver.version}</span>
                          {ver.version === publishedVersion && (
                            <span style={{ fontSize: '0.6875rem', padding: '1px 6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', borderRadius: '4px' }}>
                              Current Live
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8125rem', marginTop: '2px' }}>{ver.changeSummary || 'Configuration update'}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          By {ver.createdBy} • {new Date(ver.createdAt).toLocaleString()}
                        </div>
                      </div>

                      {ver.version !== publishedVersion && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                          onClick={() => handleRollback(ver.version)}
                        >
                          ↩ Rollback to v{ver.version}
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Live Interactive Widget Preview & Frame Controls */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-primary)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Preview Controls Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Preview Frame:</span>
              <button
                className={`btn ${previewDevice === 'desktop' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => setPreviewDevice('desktop')}
              >
                🖥️ Desktop
              </button>
              <button
                className={`btn ${previewDevice === 'mobile' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => setPreviewDevice('mobile')}
              >
                📱 Mobile (375px)
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {isWidgetOpen ? 'Widget Expanded' : 'Widget Minimized'}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => setIsWidgetOpen(!isWidgetOpen)}
              >
                {isWidgetOpen ? 'Minimize' : 'Expand'}
              </button>
            </div>
          </div>

          {/* Interactive Preview Canvas */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              overflow: 'hidden',
              background: 'radial-gradient(circle at center, rgba(99, 102, 241, 0.05) 0%, transparent 70%)',
            }}
          >
            {/* Simulated Frame */}
            <div
              style={{
                width: previewDevice === 'mobile' ? '375px' : '100%',
                maxWidth: previewDevice === 'mobile' ? '375px' : '720px',
                height: previewDevice === 'mobile' ? '667px' : '100%',
                maxHeight: '680px',
                background: 'var(--bg-surface)',
                borderRadius: previewDevice === 'mobile' ? '36px' : '16px',
                border: previewDevice === 'mobile' ? '10px solid #1f2937' : '1px solid var(--border-subtle)',
                boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Mobile Notch Bar if mobile view */}
              {previewDevice === 'mobile' && (
                <div
                  style={{
                    height: '24px',
                    background: '#1f2937',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <div style={{ width: '80px', height: '10px', background: '#000', borderRadius: '10px' }}></div>
                </div>
              )}

              {/* Simulated Web Host Website Container */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#f8fafc',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Simulated Host Webpage Background */}
                <div style={{ padding: '20px', color: '#64748b' }}>
                  <div style={{ height: '16px', width: '120px', background: '#cbd5e1', borderRadius: '4px', marginBottom: '14px' }}></div>
                  <div style={{ height: '32px', width: '220px', background: '#e2e8f0', borderRadius: '6px', marginBottom: '10px' }}></div>
                  <div style={{ height: '12px', width: '90%', background: '#f1f5f9', borderRadius: '4px', marginBottom: '6px' }}></div>
                  <div style={{ height: '12px', width: '80%', background: '#f1f5f9', borderRadius: '4px', marginBottom: '20px' }}></div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ height: '80px', flex: 1, background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}></div>
                    <div style={{ height: '80px', flex: 1, background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}></div>
                  </div>
                </div>

                {/* Floating Widget Launcher Button */}
                <button
                  type="button"
                  onClick={() => setIsWidgetOpen(!isWidgetOpen)}
                  style={{
                    position: 'absolute',
                    bottom: '20px',
                    right: theme.launcherPosition === 'bottom-right' ? '20px' : 'auto',
                    left: theme.launcherPosition === 'bottom-left' ? '20px' : 'auto',
                    width: '56px',
                    height: '56px',
                    borderRadius: '28px',
                    background: theme.primaryColor,
                    color: theme.headerTextColor,
                    border: 'none',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    zIndex: 10,
                    transition: 'transform 0.2s ease',
                  }}
                  title="Toggle Assistant Preview"
                >
                  {isWidgetOpen ? '✕' : assistant.avatar || '💬'}
                </button>

                {/* Live Widget Dialog Panel */}
                {isWidgetOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '86px',
                      right: theme.launcherPosition === 'bottom-right' ? '20px' : 'auto',
                      left: theme.launcherPosition === 'bottom-left' ? '20px' : 'auto',
                      width: previewDevice === 'mobile' ? 'calc(100% - 24px)' : `${theme.panelWidth}px`,
                      maxWidth: 'calc(100% - 24px)',
                      height: previewDevice === 'mobile' ? 'calc(100% - 100px)' : `${theme.panelHeight}px`,
                      maxHeight: 'calc(100% - 100px)',
                      background: theme.backgroundColor,
                      borderRadius: `${theme.borderRadius}px`,
                      boxShadow: '0 12px 48px rgba(0, 0, 0, 0.22)',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      zIndex: 20,
                      border: '1px solid rgba(0,0,0,0.1)',
                      fontFamily: theme.typography === 'inter' ? 'Inter, sans-serif' : theme.typography === 'roboto' ? 'Roboto, sans-serif' : 'system-ui',
                    }}
                  >
                    {/* Widget Header */}
                    <div
                      style={{
                        background: theme.primaryColor,
                        color: theme.headerTextColor,
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.125rem',
                          }}
                        >
                          {assistant.avatar || '🤖'}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{assistant.name}</div>
                          <div style={{ fontSize: '0.6875rem', opacity: 0.85, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '3px', background: '#10b981' }}></span>
                            {availability.enabled ? 'Online & Grounded' : 'Offline'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsWidgetOpen(false)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: theme.headerTextColor,
                          fontSize: '1rem',
                          cursor: 'pointer',
                          opacity: 0.8,
                        }}
                      >
                        ✕
                      </button>
                    </div>

                    {/* Messages Body */}
                    <div
                      style={{
                        flex: 1,
                        padding: '16px',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        background: '#ffffff',
                      }}
                    >
                      {/* Suggested Chips Card */}
                      {messaging.suggestedQuestions.length > 0 && (
                        <div
                          style={{
                            padding: '12px',
                            background: '#f8fafc',
                            borderRadius: '10px',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>
                            Suggested Inquiries
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {messaging.suggestedQuestions.map((q, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleSendPreviewMessage(q)}
                                style={{
                                  background: '#ffffff',
                                  border: '1px solid #cbd5e1',
                                  borderRadius: '16px',
                                  padding: '4px 10px',
                                  fontSize: '0.6875rem',
                                  cursor: 'pointer',
                                  color: '#334155',
                                  textAlign: 'left',
                                }}
                              >
                                {q}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Chat Messages */}
                      {testMessages.map((msg) => (
                        <div
                          key={msg.id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: msg.role === 'visitor' ? 'flex-end' : 'flex-start',
                          }}
                        >
                          <div
                            style={{
                              maxWidth: '85%',
                              padding: '10px 14px',
                              borderRadius: '12px',
                              fontSize: '0.8125rem',
                              lineHeight: 1.45,
                              background: msg.role === 'visitor' ? theme.primaryColor : '#f1f5f9',
                              color: msg.role === 'visitor' ? theme.headerTextColor : theme.textColor,
                              borderBottomRightRadius: msg.role === 'visitor' ? '2px' : '12px',
                              borderBottomLeftRadius: msg.role === 'assistant' ? '2px' : '12px',
                            }}
                          >
                            {msg.content}
                          </div>
                          {analytics.collectFeedback && msg.role === 'assistant' && (
                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', fontSize: '0.6875rem', color: '#94a3b8' }}>
                              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                👍
                              </button>
                              <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                👎
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Typing Dots */}
                      {isTyping && (
                        <div
                          style={{
                            padding: '8px 12px',
                            background: '#f1f5f9',
                            borderRadius: '12px',
                            width: 'fit-content',
                            fontSize: '0.75rem',
                            color: '#64748b',
                          }}
                        >
                          ● ● ● Thinking...
                        </div>
                      )}
                    </div>

                    {/* Footer / Input */}
                    <div
                      style={{
                        padding: '10px 14px',
                        borderTop: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#ffffff',
                      }}
                    >
                      <input
                        type="text"
                        value={previewInput}
                        onChange={(e) => setPreviewInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendPreviewMessage()}
                        placeholder={messaging.placeholder}
                        style={{
                          flex: 1,
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          fontSize: '0.8125rem',
                          outline: 'none',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => handleSendPreviewMessage()}
                        disabled={!previewInput.trim()}
                        style={{
                          background: theme.primaryColor,
                          color: theme.headerTextColor,
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.8125rem',
                        }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
