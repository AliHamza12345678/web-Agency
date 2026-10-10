import React, { useState } from 'react';
import { api } from '../api.js';
import type { User, TenantMembership } from '../types.js';

interface AuthPageProps {
  onAuthSuccess: (user: User, tenants: TenantMembership[]) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const data = await api.register({
          email,
          password,
          name,
          organizationName: orgName || undefined,
        });
        onAuthSuccess(data.user, [data.tenant]);
      } else {
        const data = await api.login({ email, password });
        onAuthSuccess(data.user, data.tenants);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '24px',
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '40px',
      }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'var(--accent-gradient)',
            boxShadow: 'var(--shadow-glow)',
            marginBottom: '16px',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="#ffffff">
              <path d="M12 2a2 2 0 0 1 2 2v2h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4V4a2 2 0 0 1 2-2zm-4 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-4 4a4 4 0 0 0-3.46 2h6.92A4 4 0 0 0 12 14z" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '6px' }}>OpenAgent Chat</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
            {isRegister ? 'Provision your organization workspace' : 'Sign in to your administration dashboard'}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-bg)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--danger)',
            padding: '12px 16px',
            fontSize: '0.875rem',
            marginBottom: '20px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Organization / Workspace Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Acme Technologies"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              placeholder="admin@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px', padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Processing...' : isRegister ? 'Create Organization & Account' : 'Sign In'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '24px' }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ fontSize: '0.875rem', cursor: 'pointer', border: 'none' }}
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
          >
            {isRegister
              ? 'Already have an administrator account? Sign In'
              : "Don't have an organization yet? Create One"}
          </button>
        </div>
      </div>
    </div>
  );
};
