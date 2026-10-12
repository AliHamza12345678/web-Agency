import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import type { Site, IntegrationStatus, ToolAuditLog } from '../types.js';

interface IntegrationsModalProps {
  site: Site;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const IntegrationsModal: React.FC<IntegrationsModalProps> = ({
  site,
  tenantId,
  isOpen,
  onClose,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'tools' | 'tester' | 'audit'>('tools');
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [auditLogs, setAuditLogs] = useState<ToolAuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Tester state
  const [selectedToolId, setSelectedToolId] = useState<string>('search_product_catalog');
  const [testParamsJson, setTestParamsJson] = useState<string>('{\n  "query": "shoes",\n  "limit": 3\n}');
  const [testResult, setTestResult] = useState<any>(null);
  const [testingLoading, setTestingLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadIntegrations();
      loadAuditLogs();
    }
  }, [isOpen, site.id]);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const data = await api.getSiteIntegrations(tenantId, site.id);
      setIntegrations(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const logs = await api.getToolAuditLogs(tenantId, site.id, 30);
      setAuditLogs(logs);
    } catch {
      // Ignored
    }
  };

  const handleToggleTool = async (tool: IntegrationStatus) => {
    try {
      const newEnabled = !tool.enabled;
      await api.updateSiteIntegration(tenantId, site.id, {
        toolId: tool.toolId,
        enabled: newEnabled,
        requiresConfirmation: tool.isConsequential,
      });

      setIntegrations((prev) =>
        prev.map((item) =>
          item.toolId === tool.toolId
            ? {
                ...item,
                enabled: newEnabled,
                status: !newEnabled ? 'disabled' : item.configured ? 'active' : 'needs_config',
              }
            : item
        )
      );

      showToast(`Tool '${tool.name}' ${newEnabled ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to update tool');
    }
  };

  const handleRunTest = async () => {
    try {
      setTestingLoading(true);
      setTestResult(null);
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(testParamsJson);
      } catch {
        throw new Error('Malformed test JSON parameters');
      }

      const res = await api.testExecuteTool(site.publicKey, selectedToolId, parsedParams);
      setTestResult(res);
      showToast('Tool test executed');
      loadAuditLogs();
    } catch (err: any) {
      setTestResult({ success: false, error: { message: err.message } });
    } finally {
      setTestingLoading(false);
    }
  };

  const handleSelectToolPreset = (toolId: string) => {
    setSelectedToolId(toolId);
    switch (toolId) {
      case 'search_approved_pages':
        setTestParamsJson('{\n  "query": "pricing",\n  "limit": 3\n}');
        break;
      case 'search_product_catalog':
        setTestParamsJson('{\n  "query": "chair",\n  "maxPrice": 500,\n  "limit": 5\n}');
        break;
      case 'get_business_contact':
        setTestParamsJson('{\n  "department": "support"\n}');
        break;
      case 'get_faqs_and_policies':
        setTestParamsJson('{\n  "topic": "returns"\n}');
        break;
      case 'create_support_request':
        setTestParamsJson('{\n  "name": "Jane Tester",\n  "email": "jane@example.com",\n  "subject": "Inquiry about delivery",\n  "description": "When will package arrive?",\n  "priority": "normal"\n}');
        break;
      case 'capture_lead':
        setTestParamsJson('{\n  "name": "Alex Prospect",\n  "email": "alex@enterprise.com",\n  "phone": "+1 555-0199",\n  "interest": "Enterprise Custom Plan",\n  "consentGiven": true\n}');
        break;
      case 'offer_human_handoff':
        setTestParamsJson('{\n  "reason": "Need live agent assistance",\n  "visitorName": "Alex"\n}');
        break;
      case 'lookup_order_status':
        setTestParamsJson('{\n  "orderId": "ORD-1001",\n  "verificationEmail": "alice@example.com"\n}');
        break;
      case 'check_appointment_availability':
        setTestParamsJson('{\n  "service": "Product Consultation",\n  "date": "2026-10-20"\n}');
        break;
      case 'check_inventory':
        setTestParamsJson('{\n  "sku": "SKU-CHAIR-01"\n}');
        break;
      case 'get_shipping_estimates':
        setTestParamsJson('{\n  "country": "US",\n  "postalCode": "90210",\n  "weightKg": 2.5\n}');
        break;
      default:
        setTestParamsJson('{}');
    }
  };

  if (!isOpen) return null;

  const filteredIntegrations = integrations.filter((tool) => {
    if (categoryFilter === 'all') return true;
    return tool.category === categoryFilter;
  });

  const activeCount = integrations.filter((t) => t.status === 'active').length;
  const totalCount = integrations.length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '16px',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-hover)',
          background: 'var(--bg-card)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1.25rem' }}>⚡</span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                Business Integrations & Safe Tools
              </h2>
              <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
                {site.name}
              </span>
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '4px' }}>
              {activeCount} of {totalCount} tools active • Server-enforced permissions, timeouts, & audit logs
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '6px 12px', fontSize: '0.875rem' }}
          >
            ✕ Close
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.2)',
          }}
        >
          <button
            className={`btn ${activeTab === 'tools' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setActiveTab('tools')}
          >
            🧩 Configured Tools ({integrations.length})
          </button>
          <button
            className={`btn ${activeTab === 'tester' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setActiveTab('tester')}
          >
            🧪 Interactive Tool Tester
          </button>
          <button
            className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => setActiveTab('audit')}
          >
            🛡️ Security & Audit Logs ({auditLogs.length})
          </button>
        </div>

        {/* Tab Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {/* TAB 1: TOOLS LIST */}
          {activeTab === 'tools' && (
            <div>
              {/* Category Filter */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {['all', 'content', 'commerce', 'support', 'connector'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    style={{
                      background: categoryFilter === cat ? 'var(--accent-primary)' : 'var(--bg-input)',
                      color: categoryFilter === cat ? '#ffffff' : 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  Loading integration statuses...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {filteredIntegrations.map((tool) => (
                    <div
                      key={tool.toolId}
                      className="glass-panel"
                      style={{
                        padding: '18px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        borderLeft: `4px solid ${
                          tool.status === 'active'
                            ? 'var(--success)'
                            : tool.status === 'needs_config'
                            ? '#f59e0b'
                            : 'var(--border-subtle)'
                        }`,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9375rem', color: '#ffffff' }}>
                            {tool.name}
                          </span>
                          <code style={{ fontSize: '0.7rem', color: 'var(--text-dim)', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px' }}>
                            {tool.toolId}
                          </code>
                          <span
                            className={`badge ${
                              tool.status === 'active'
                                ? 'badge-success'
                                : tool.status === 'needs_config'
                                ? 'badge-warning'
                                : 'badge-secondary'
                            }`}
                            style={{ fontSize: '0.7rem' }}
                          >
                            {tool.status === 'active'
                              ? 'Active'
                              : tool.status === 'needs_config'
                              ? 'Needs Backend Config'
                              : 'Disabled'}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 8px', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                          {tool.description}
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <span className="badge badge-accent" style={{ fontSize: '0.7rem' }}>
                            {tool.category.toUpperCase()}
                          </span>
                          {tool.isConsequential && (
                            <span
                              className="badge"
                              style={{ fontSize: '0.7rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                            >
                              ⚠️ Requires Confirmation
                            </span>
                          )}
                          {tool.requiresConsent && (
                            <span
                              className="badge"
                              style={{ fontSize: '0.7rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981' }}
                            >
                              🔒 Explicit Consent Required
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          onClick={() => {
                            handleSelectToolPreset(tool.toolId);
                            setActiveTab('tester');
                          }}
                        >
                          🧪 Test Tool
                        </button>

                        <button
                          className={`btn ${tool.enabled ? 'btn-danger' : 'btn-primary'}`}
                          style={{ padding: '6px 14px', fontSize: '0.8rem', minWidth: '85px' }}
                          onClick={() => handleToggleTool(tool)}
                        >
                          {tool.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: INTERACTIVE TOOL TESTER */}
          {activeTab === 'tester' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Select Tool to Test:
                </label>
                <select
                  className="form-input"
                  value={selectedToolId}
                  onChange={(e) => handleSelectToolPreset(e.target.value)}
                  style={{ marginBottom: '16px' }}
                >
                  {integrations.map((tool) => (
                    <option key={tool.toolId} value={tool.toolId}>
                      {tool.name} ({tool.toolId})
                    </option>
                  ))}
                </select>

                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Tool Parameters (JSON Schema):
                </label>
                <textarea
                  className="form-input"
                  rows={9}
                  value={testParamsJson}
                  onChange={(e) => setTestParamsJson(e.target.value)}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', marginBottom: '16px' }}
                />

                <button
                  className="btn btn-primary"
                  onClick={handleRunTest}
                  disabled={testingLoading}
                  style={{ width: '100%', padding: '10px' }}
                >
                  {testingLoading ? 'Executing Tool Safely...' : '🚀 Execute Test Tool'}
                </button>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Execution Response (Bounded & Sanitized):
                </label>
                <div
                  style={{
                    background: 'var(--bg-input)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    padding: '14px',
                    height: '310px',
                    overflowY: 'auto',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.8125rem',
                    color: '#e2e8f0',
                  }}
                >
                  {testResult ? (
                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(testResult, null, 2)}
                    </pre>
                  ) : (
                    <span style={{ color: 'var(--text-dim)' }}>
                      Click "Execute Test Tool" to view server response, latency, and bounded data...
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY & AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  Immutable audit records of all tool executions, verification states, and latency metrics.
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={loadAuditLogs}
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  ↻ Refresh Logs
                </button>
              </div>

              {auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  No tool audit logs recorded yet for this website.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="glass-panel"
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span
                          className={`badge ${
                            log.status === 'success'
                              ? 'badge-success'
                              : log.status === 'pending_confirmation'
                              ? 'badge-warning'
                              : 'badge-danger'
                          }`}
                          style={{ fontSize: '0.7rem' }}
                        >
                          {log.status}
                        </span>
                        <code style={{ color: 'var(--text-light)', fontWeight: 600 }}>{log.toolName}</code>
                        {log.errorMessage && (
                          <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>
                            ({log.errorMessage})
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-dim)', fontSize: '0.75rem' }}>
                        <span>⚡ {log.executionTimeMs}ms</span>
                        <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
