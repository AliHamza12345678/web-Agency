import React, { useState } from 'react';
import type { User, TenantMembership } from '../types.js';

interface NavbarProps {
  user: User;
  tenants: TenantMembership[];
  activeTenant: TenantMembership | null;
  onSelectTenant: (tenant: TenantMembership) => void;
  onCreateTenant: (name: string) => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  tenants,
  activeTenant,
  onSelectTenant,
  onCreateTenant,
  onLogout,
}) => {
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (newOrgName.trim()) {
      onCreateTenant(newOrgName.trim());
      setNewOrgName('');
      setShowOrgModal(false);
    }
  };

  return (
    <>
      <header style={{
        height: '68px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(9, 13, 22, 0.85)',
        backdropFilter: 'blur(16px)',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 32px',
      }}>
        {/* Left: Brand & Workspace Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2zm-4 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a4 4 0 0 0-3.46 2h6.92A4 4 0 0 0 12 14z" />
              </svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.125rem', letterSpacing: '-0.02em' }}>
              OpenAgent <span className="gradient-text">Chat</span>
            </span>
          </div>

          <div style={{ height: '24px', width: '1px', background: 'var(--border-subtle)' }} />

          {/* Organization Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', fontWeight: 600 }}>WORKSPACE:</span>
            <select
              className="form-select"
              style={{
                padding: '6px 12px',
                width: 'auto',
                fontSize: '0.875rem',
                fontWeight: 600,
                background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-sm)',
              }}
              value={activeTenant?.tenantId || ''}
              onChange={(e) => {
                const found = tenants.find((t) => t.tenantId === e.target.value);
                if (found) onSelectTenant(found);
              }}
            >
              {tenants.map((t) => (
                <option key={t.tenantId} value={t.tenantId}>
                  {t.name} ({t.role})
                </option>
              ))}
            </select>

            <button
              className="btn btn-ghost"
              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
              onClick={() => setShowOrgModal(true)}
              title="Create another organization workspace"
            >
              + New Org
            </button>
          </div>
        </div>

        {/* Right: User Profile & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#23304c',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.875rem',
              color: 'var(--text-main)',
            }}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>
            </div>
          </div>

          <button
            className="btn btn-secondary"
            style={{ padding: '8px 14px', fontSize: '0.8125rem' }}
            onClick={onLogout}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* New Organization Modal */}
      {showOrgModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '20px',
        }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '440px', padding: '30px' }}>
            <h3 style={{ marginBottom: '12px' }}>Create New Workspace</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '20px' }}>
              Workspaces are completely isolated organizations with their own websites, permissions, and knowledge.
            </p>

            <form onSubmit={handleCreateOrg}>
              <div className="form-group">
                <label className="form-label">Organization Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Marketing Hub"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowOrgModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
