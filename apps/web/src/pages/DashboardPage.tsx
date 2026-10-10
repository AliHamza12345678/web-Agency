import React, { useState, useEffect, useTransition } from 'react';
import { api } from '../api.js';
import type { TenantMembership, Site } from '../types.js';
import { SiteModal } from '../components/SiteModal.js';
import { ConfirmationModal } from '../components/ConfirmationModal.js';

interface DashboardPageProps {
  tenant: TenantMembership;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ tenant }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalSite, setModalSite] = useState<Site | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSites = async (query?: string) => {
    try {
      setLoading(true);
      const data = await api.getSites(tenant.tenantId, query);
      startTransition(() => {
        setSites(data);
      });
    } catch (err: any) {
      showToast(err.message || 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites(search);
  }, [tenant.tenantId]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    fetchSites(val);
  };

  const handleSaveSite = async (siteData: Partial<Site>) => {
    try {
      if (modalSite) {
        await api.updateSite(tenant.tenantId, modalSite.id, siteData);
        showToast('Site configuration updated successfully');
      } else {
        await api.createSite(tenant.tenantId, siteData);
        showToast('Website chatbot created successfully');
      }
      fetchSites(search);
    } catch (err: any) {
      showToast(err.message || 'Failed to save site');
      throw err;
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteSite(tenant.tenantId, deleteTarget.id);
      showToast(`Site '${deleteTarget.name}' deleted successfully`);
      setDeleteTarget(null);
      fetchSites(search);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete site');
    }
  };

  const handleRegenerateKey = async (siteId: string) => {
    try {
      const res = await api.regenerateKey(tenant.tenantId, siteId);
      showToast('Public widget key rotated successfully');
      setModalSite((prev) => (prev ? { ...prev, publicKey: res.publicKey } : null));
      fetchSites(search);
    } catch (err: any) {
      showToast(err.message || 'Failed to rotate key');
    }
  };

  // Metrics calculation
  const totalSites = sites.length;
  const totalDocs = sites.reduce((sum, s) => sum + (s.stats?.docsCount || 0), 0);
  const totalConvs = sites.reduce((sum, s) => sum + (s.stats?.convsCount || 0), 0);

  return (
    <main style={{ padding: '36px', maxWidth: '1300px', margin: '0 auto', width: '100%' }}>
      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--accent-primary)',
          boxShadow: 'var(--shadow-glow)',
          color: '#ffffff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}>
          ✨ {toast}
        </div>
      )}

      {/* Top Banner & Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <h1 style={{ fontSize: '1.875rem' }}>{tenant.name}</h1>
            <span className="badge badge-accent" style={{ textTransform: 'capitalize' }}>
              {tenant.role}
            </span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
            Manage website chatbots, ground knowledge, customize themes, and embed onto third-party web properties.
          </p>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => {
            setModalSite(null);
            setIsModalOpen(true);
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          New Website Chatbot
        </button>
      </div>

      {/* KPI Overview Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        marginBottom: '36px',
      }}>
        <div className="glass-panel" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Active Chatbots
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: '#ffffff' }}>
            {totalSites}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--success)', marginTop: '4px' }}>
            ● Ready for embedding
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Knowledge Documents
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: '#ffffff' }}>
            {totalDocs}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Indexed across all sites
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Visitor Conversations
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '8px', color: '#ffffff' }}>
            {totalConvs}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Retained securely
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Tenant Isolation
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '12px', color: 'var(--success)' }}>
            ✓ Enforced
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            Row-level cryptographic bounds
          </div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            className="form-input"
            placeholder="Search website chatbots by name..."
            value={search}
            onChange={handleSearchChange}
            style={{ paddingLeft: '40px' }}
          />
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="2"
            style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      {/* Site Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          Loading website chatbots...
        </div>
      ) : sites.length === 0 ? (
        <div className="glass-panel" style={{
          textAlign: 'center',
          padding: '60px 30px',
          border: '1px dashed var(--border-hover)',
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '20px',
            background: 'var(--accent-subtle)',
            color: 'var(--accent-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.75rem',
            marginBottom: '16px',
          }}>
            💬
          </div>
          <h3 style={{ marginBottom: '8px' }}>No website chatbots found</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem', maxWidth: '440px', margin: '0 auto 24px' }}>
            {search
              ? `No chatbots match your search "${search}". Try clearing the search query.`
              : 'Create your first website chatbot to embed an intelligent multilingual assistant into your web property.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setModalSite(null);
              setIsModalOpen(true);
            }}
          >
            + Create Website Chatbot
          </button>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '24px',
        }}>
          {sites.map((site) => (
            <div key={site.id} className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                <div style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '14px',
                  background: site.branding?.primaryColor || '#6366f1',
                  color: site.branding?.textColor || '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                }}>
                  🤖
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '1.0625rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {site.name}
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Bot: {site.branding?.botName || 'AI Assistant'}
                  </div>
                </div>
                <span className="badge badge-success">Active</span>
              </div>

              {/* Public Key Display */}
              <div style={{
                background: 'var(--bg-input)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 12px',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {site.publicKey}
                </span>
                <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>PUBLIC KEY</span>
              </div>

              {/* Allowed Origins */}
              <div style={{ marginBottom: '16px', flex: 1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Allowed Origins:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {site.allowedOrigins && site.allowedOrigins.length > 0 ? (
                    site.allowedOrigins.map((origin, idx) => (
                      <span key={idx} className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                        {origin}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Any origin (dev mode)
                    </span>
                  )}
                </div>
              </div>

              {/* Stats Row */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '14px',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
                marginBottom: '16px',
              }}>
                <span>Docs Indexed: <strong>{site.stats?.docsCount || 0}</strong></span>
                <span>Conversations: <strong>{site.stats?.convsCount || 0}</strong></span>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '8px' }}
                  onClick={() => {
                    setModalSite(site);
                    setIsModalOpen(true);
                  }}
                >
                  Configure
                </button>
                <button
                  className="btn btn-danger"
                  style={{ padding: '8px 12px' }}
                  onClick={() => setDeleteTarget(site)}
                  title="Delete chatbot"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Configuration Modal */}
      <SiteModal
        site={modalSite}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setModalSite(null);
        }}
        onSave={handleSaveSite}
        onRegenerateKey={handleRegenerateKey}
      />

      {/* Deletion Confirmation Modal */}
      <ConfirmationModal
        isOpen={!!deleteTarget}
        title={`Delete "${deleteTarget?.name}"?`}
        message={`Are you sure you want to permanently delete this chatbot? All associated knowledge documents, embeddings, and conversation histories will be purged immediately.`}
        confirmLabel="Yes, Delete Permanently"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
};
