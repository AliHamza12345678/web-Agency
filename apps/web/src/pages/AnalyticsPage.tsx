import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import type {
  TenantMembership,
  Site,
  AnalyticsDashboardMetrics,
  UnansweredQuestionRecord,
  ConversationSummary,
  ConversationDetail,
  ConversationQueryFilters,
  RetentionCleanupResult,
} from '../types.js';

interface AnalyticsPageProps {
  tenant: TenantMembership;
  site: Site;
  onBack: () => void;
}

type AnalyticsTab = 'metrics' | 'conversations' | 'feedback_loop' | 'privacy';

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({ tenant, site, onBack }) => {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('metrics');
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | 'all'>('7d');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Metrics state
  const [metrics, setMetrics] = useState<AnalyticsDashboardMetrics | null>(null);

  // Unanswered / Low Confidence state
  const [unansweredList, setUnansweredList] = useState<UnansweredQuestionRecord[]>([]);
  const [convertModalQuestion, setConvertModalQuestion] = useState<UnansweredQuestionRecord | null>(null);
  const [faqAnswer, setFaqAnswer] = useState('');
  const [faqCategory, setFaqCategory] = useState('General');
  const [isConverting, setIsConverting] = useState(false);

  // Conversations state
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [convPagination, setConvPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [convFilters, setConvFilters] = useState<ConversationQueryFilters>({
    q: '',
    feedback: 'all',
    hasHandoff: undefined,
    isLowConfidence: undefined,
    page: 1,
    limit: 10,
  });
  const [inspectConversation, setInspectConversation] = useState<ConversationDetail | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Retention state
  const [isPurging, setIsPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<RetentionCleanupResult | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load metrics & initial data
  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const data = await api.getAnalyticsMetrics(tenant.tenantId, site.id, period, 'UTC');
      setMetrics(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch analytics metrics', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnanswered = async () => {
    try {
      const data = await api.getUnansweredQuestions(tenant.tenantId, site.id);
      setUnansweredList(data);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch unanswered questions', 'error');
    }
  };

  const fetchConversations = async (filters = convFilters) => {
    try {
      const res = await api.getConversations(tenant.tenantId, site.id, filters);
      setConversations(res.conversations);
      setConvPagination(res.pagination);
    } catch (err: any) {
      showToast(err.message || 'Failed to fetch conversations', 'error');
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchUnanswered();
    fetchConversations();
  }, [site.id, period]);

  // Handle Inspect Conversation
  const handleOpenConversation = async (convId: string) => {
    try {
      setInspectLoading(true);
      const detail = await api.getConversationDetail(tenant.tenantId, site.id, convId);
      setInspectConversation(detail);
    } catch (err: any) {
      showToast(err.message || 'Failed to inspect conversation', 'error');
    } finally {
      setInspectLoading(false);
    }
  };

  // Handle Delete Conversation
  const handleDeleteConversation = async (convId: string) => {
    if (!window.confirm('Are you sure you want to delete this conversation transcript? This action cannot be undone.')) {
      return;
    }
    try {
      await api.deleteConversation(tenant.tenantId, site.id, convId);
      showToast('Conversation deleted permanently');
      if (inspectConversation?.id === convId) {
        setInspectConversation(null);
      }
      fetchConversations();
      fetchMetrics();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete conversation', 'error');
    }
  };

  // Handle Export Transcripts
  const handleExport = async (format: 'json' | 'csv') => {
    try {
      setIsExporting(true);
      const content = await api.exportConversations(tenant.tenantId, site.id, format);
      const blob = new Blob([content], {
        type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${site.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_conversations_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`Exported transcripts as ${format.toUpperCase()}`);
    } catch (err: any) {
      showToast(err.message || `Failed to export ${format}`, 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Handle Convert to FAQ
  const handleConvertToFaq = async () => {
    if (!convertModalQuestion || !faqAnswer.trim()) {
      showToast('Please provide an answer for the FAQ', 'error');
      return;
    }
    try {
      setIsConverting(true);
      const res = await api.convertUnansweredQuestion(
        tenant.tenantId,
        site.id,
        convertModalQuestion.query,
        faqAnswer.trim(),
        faqCategory
      );
      showToast(`Added to Knowledge Base: "${res.title}"`);
      setConvertModalQuestion(null);
      setFaqAnswer('');
      fetchUnanswered();
    } catch (err: any) {
      showToast(err.message || 'Failed to convert to FAQ', 'error');
    } finally {
      setIsConverting(false);
    }
  };

  // Handle Manual Retention Purge
  const handleManualPurge = async () => {
    if (
      !window.confirm(
        `Are you sure you want to run retention purge now? All conversations older than ${site.retentionDays || 30} days will be deleted permanently.`
      )
    ) {
      return;
    }
    try {
      setIsPurging(true);
      const res = await api.runRetentionCleanup(tenant.tenantId, site.id);
      setPurgeResult(res);
      showToast(`Retention purge completed: ${res.purgedConversationsCount} conversations removed`);
      fetchConversations();
      fetchMetrics();
    } catch (err: any) {
      showToast(err.message || 'Retention purge failed', 'error');
    } finally {
      setIsPurging(false);
    }
  };

  const renderBadge = (labelType: 'measured' | 'estimated' | 'unavailable') => {
    if (labelType === 'measured') {
      return (
        <span
          style={{
            fontSize: '0.65rem',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            border: '1px solid rgba(16, 185, 129, 0.3)',
          }}
        >
          Measured
        </span>
      );
    }
    if (labelType === 'estimated') {
      return (
        <span
          style={{
            fontSize: '0.65rem',
            padding: '2px 6px',
            borderRadius: '4px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            border: '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          Estimated
        </span>
      );
    }
    return (
      <span
        style={{
          fontSize: '0.65rem',
          padding: '2px 6px',
          borderRadius: '4px',
          background: 'rgba(107, 114, 128, 0.15)',
          color: '#9ca3af',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          border: '1px solid rgba(107, 114, 128, 0.3)',
        }}
      >
        Unavailable
      </span>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)', paddingBottom: '60px' }}>
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: 'var(--bg-elevated)',
            border: `1px solid ${
              toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? '#3b82f6' : 'var(--accent-primary)'
            }`,
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          {toast.type === 'error' ? '⚠️' : '✨'} {toast.message}
        </div>
      )}

      {/* Top Navigation & Header */}
      <header
        style={{
          background: 'rgba(17, 24, 39, 0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '16px 36px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            className="btn btn-secondary"
            onClick={onBack}
            style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ← Back to Sites
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{site.name}</h1>
              <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
                Observability & Analytics
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Site ID: {site.id} &bull; Retention: {site.retentionDays || 30} days
            </div>
          </div>
        </div>

        {/* Period Selector & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
            }}
          >
            {(['today', '7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  background: period === p ? 'var(--accent-primary)' : 'transparent',
                  color: period === p ? '#ffffff' : 'var(--text-muted)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: period === p ? 600 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textTransform: 'uppercase',
                }}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => {
              fetchMetrics();
              fetchUnanswered();
              fetchConversations();
            }}
            title="Refresh analytics data"
            style={{ padding: '8px 12px' }}
          >
            🔄 Refresh
          </button>
        </div>
      </header>

      {/* Main Tab Navigation */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 36px 0' }}>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid var(--border-subtle)',
            paddingBottom: '12px',
            marginBottom: '24px',
          }}
        >
          <button
            onClick={() => setActiveTab('metrics')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'metrics' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'metrics' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'metrics' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            📊 Dashboard Metrics
          </button>
          <button
            onClick={() => setActiveTab('conversations')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'conversations' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'conversations' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'conversations' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            💬 Conversations ({convPagination.total})
          </button>
          <button
            onClick={() => setActiveTab('feedback_loop')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'feedback_loop' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'feedback_loop' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'feedback_loop' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            💡 Knowledge Feedback Loop ({unansweredList.length})
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            style={{
              padding: '10px 18px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: activeTab === 'privacy' ? 'var(--bg-elevated)' : 'transparent',
              color: activeTab === 'privacy' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: activeTab === 'privacy' ? '2px solid var(--accent-primary)' : '2px solid transparent',
            }}
          >
            🛡️ Privacy & Retention Policy
          </button>
        </div>

        {/* ---------------------------------------------------- */}
        {/* TAB 1: METRICS OVERVIEW */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'metrics' && (
          <div>
            {/* Reliability Note Banner */}
            <div
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 18px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.8125rem',
                color: 'var(--text-muted)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🎯</span>
                <span>
                  <strong>Reliability Guarantee:</strong> All numbers correspond to actual persisted application events.
                  Failed requests are never counted as successful answers. Estimates are labeled explicitly.
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                Timezone: UTC &bull; Period: {period.toUpperCase()}
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                Loading real-time analytics...
              </div>
            ) : metrics ? (
              <>
                {/* Primary KPI Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '18px',
                    marginBottom: '24px',
                  }}
                >
                  {/* Conversations Started */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Conversations Started
                      </span>
                      {renderBadge(metrics.measurementLabels.conversationsStarted)}
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ffffff' }}>
                      {metrics.conversationsStarted.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      Visitor chat sessions initiated
                    </div>
                  </div>

                  {/* Messages Received & Answered */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Messages Processed
                      </span>
                      {renderBadge(metrics.measurementLabels.messagesReceived)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                      <span style={{ fontSize: '2rem', fontWeight: 700, color: '#ffffff' }}>
                        {metrics.messagesAnswered.toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        / {metrics.messagesReceived.toLocaleString()} received
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      Answer rate:{' '}
                      {metrics.messagesReceived > 0
                        ? `${Math.round((metrics.messagesAnswered / metrics.messagesReceived) * 100)}%`
                        : '100%'}
                    </div>
                  </div>

                  {/* Response Latency */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Response Latency
                      </span>
                      {renderBadge(metrics.measurementLabels.responseLatency)}
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ffffff' }}>
                      {metrics.averageLatencyMs !== null ? `${metrics.averageLatencyMs}ms` : 'N/A'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      p50: {metrics.p50LatencyMs !== null ? `${metrics.p50LatencyMs}ms` : '—'} &bull; p95:{' '}
                      {metrics.p95LatencyMs !== null ? `${metrics.p95LatencyMs}ms` : '—'}
                    </div>
                  </div>

                  {/* Knowledge Retrieval Rate */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Knowledge Retrieval
                      </span>
                      {renderBadge(metrics.measurementLabels.retrievalSuccessRate)}
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 700, color: '#ffffff' }}>
                      {metrics.retrievalSuccessRate !== null ? `${metrics.retrievalSuccessRate}%` : 'N/A'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      {metrics.retrievalSuccessCount} matched &bull; {metrics.retrievalEmptyCount} empty
                    </div>
                  </div>
                </div>

                {/* Secondary Metrics Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '18px',
                    marginBottom: '24px',
                  }}
                >
                  {/* Visitor Feedback & Satisfaction */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Visitor Feedback
                      </span>
                      {renderBadge(metrics.measurementLabels.visitorFeedback)}
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ffffff' }}>
                      {metrics.satisfactionRate !== null ? `${metrics.satisfactionRate}% 👍` : 'No ratings yet'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      👍 {metrics.positiveFeedback} positive &bull; 👎 {metrics.negativeFeedback} negative
                    </div>
                  </div>

                  {/* Human Handoff Requests */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Human Handoff Requests
                      </span>
                      {renderBadge(metrics.measurementLabels.humanHandoffRequests)}
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ffffff' }}>
                      {metrics.humanHandoffRequests}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      Escalations to human support
                    </div>
                  </div>

                  {/* Provider Errors & Rate Limits */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Provider Health & Limits
                      </span>
                      {renderBadge(metrics.measurementLabels.providerErrors)}
                    </div>
                    <div
                      style={{
                        fontSize: '1.75rem',
                        fontWeight: 700,
                        color: metrics.providerErrors > 0 ? '#ef4444' : '#10b981',
                      }}
                    >
                      {metrics.providerErrors === 0 ? 'Operational' : `${metrics.providerErrors} Errors`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      Rate-limit throttle events: {metrics.rateLimitEvents}
                    </div>
                  </div>

                  {/* Approximate Model Usage */}
                  <div className="card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        Model Usage (Estimated)
                      </span>
                      {renderBadge(metrics.measurementLabels.approximateModelTokens)}
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#ffffff' }}>
                      {metrics.approximateModelTokens !== null
                        ? `~${metrics.approximateModelTokens.toLocaleString()} tokens`
                        : 'Unavailable'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                      Heuristic token estimation based on character volume
                    </div>
                  </div>
                </div>

                {/* Additional Insight Summary */}
                <div className="card" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px' }}>
                    🔍 Chatbot Quality & Performance Summary
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                    <div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Unanswered Questions Captured
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                        {metrics.unansweredCount} questions
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        These questions triggered fallback messages and can be added to your Knowledge Base in 1 click via the Feedback Loop tab.
                      </p>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Low Confidence Inquiries
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
                        {metrics.lowConfidenceCount} inquiries
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                        Inquiries where similarity score fell below threshold or citations were insufficient.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 2: CONVERSATION MANAGEMENT */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'conversations' && (
          <div>
            {/* Filter and Export Bar */}
            <div
              className="card"
              style={{
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {/* Search & Query */}
              <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '300px' }}>
                <input
                  type="text"
                  placeholder="Search transcripts by visitor query or response keywords..."
                  value={convFilters.q || ''}
                  onChange={(e) => setConvFilters({ ...convFilters, q: e.target.value, page: 1 })}
                  onKeyDown={(e) => e.key === 'Enter' && fetchConversations(convFilters)}
                  style={{
                    flex: 1,
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => fetchConversations(convFilters)}
                  style={{ padding: '8px 16px' }}
                >
                  Search
                </button>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <select
                  value={convFilters.feedback || 'all'}
                  onChange={(e) => {
                    const updated = {
                      ...convFilters,
                      feedback: e.target.value as any,
                      page: 1,
                    };
                    setConvFilters(updated);
                    fetchConversations(updated);
                  }}
                  style={{
                    background: 'var(--bg-app)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.8125rem',
                  }}
                >
                  <option value="all">All Feedback</option>
                  <option value="positive">👍 Positive</option>
                  <option value="negative">👎 Negative</option>
                </select>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8125rem',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!convFilters.hasHandoff}
                    onChange={(e) => {
                      const updated = {
                        ...convFilters,
                        hasHandoff: e.target.checked ? true : undefined,
                        page: 1,
                      };
                      setConvFilters(updated);
                      fetchConversations(updated);
                    }}
                  />
                  Handoffs Only
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8125rem',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!!convFilters.isLowConfidence}
                    onChange={(e) => {
                      const updated = {
                        ...convFilters,
                        isLowConfidence: e.target.checked ? true : undefined,
                        page: 1,
                      };
                      setConvFilters(updated);
                      fetchConversations(updated);
                    }}
                  />
                  Low-Confidence Only
                </label>
              </div>

              {/* Export Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  className="btn btn-secondary"
                  disabled={isExporting}
                  onClick={() => handleExport('json')}
                  style={{ padding: '8px 14px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📥 Export JSON
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={isExporting}
                  onClick={() => handleExport('csv')}
                  style={{ padding: '8px 14px', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📄 Export CSV
                </button>
              </div>
            </div>

            {/* Privacy Redaction Notice */}
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-dim)',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🔒</span>
              <span>
                <strong>Privacy by Design:</strong> Personal identifiers (emails, phone numbers, SSNs, credit cards) and
                API secrets are automatically redacted from all admin inspection views and exports.
              </span>
            </div>

            {/* Conversation List Table */}
            {conversations.length === 0 ? (
              <div className="card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No conversations found matching your filters.
              </div>
            ) : (
              <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                  <thead>
                    <tr
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        borderBottom: '1px solid var(--border-subtle)',
                        color: 'var(--text-dim)',
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                      }}
                    >
                      <th style={{ padding: '14px 20px' }}>Conversation ID</th>
                      <th style={{ padding: '14px 20px' }}>Snippet Preview</th>
                      <th style={{ padding: '14px 20px' }}>Messages</th>
                      <th style={{ padding: '14px 20px' }}>Flags & Feedback</th>
                      <th style={{ padding: '14px 20px' }}>Date</th>
                      <th style={{ padding: '14px 20px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations.map((conv) => (
                      <tr
                        key={conv.id}
                        style={{
                          borderBottom: '1px solid var(--border-subtle)',
                          transition: 'background 0.15s ease',
                        }}
                      >
                        <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                          <span title={conv.id}>{conv.id.slice(0, 8)}...</span>
                        </td>
                        <td style={{ padding: '14px 20px', maxWidth: '320px' }}>
                          <div
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              color: 'var(--text-muted)',
                            }}
                          >
                            {conv.lastMessageSnippet || 'No messages'}
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span className="badge badge-accent" style={{ fontSize: '0.75rem' }}>
                            {conv.messageCount} msgs
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {conv.feedback === 'positive' && (
                              <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                                👍 Positive
                              </span>
                            )}
                            {conv.feedback === 'negative' && (
                              <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>
                                👎 Negative
                              </span>
                            )}
                            {conv.hasHandoff && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  fontWeight: 600,
                                }}
                              >
                                🚨 Handoff
                              </span>
                            )}
                            {conv.isLowConfidence && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: 'rgba(245, 158, 11, 0.15)',
                                  color: '#f59e0b',
                                  fontWeight: 600,
                                }}
                              >
                                Low-Confidence
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px', fontSize: '0.8125rem', color: 'var(--text-dim)' }}>
                          {new Date(conv.createdAt).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-secondary"
                              onClick={() => handleOpenConversation(conv.id)}
                              style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                            >
                              Inspect
                            </button>
                            <button
                              className="btn btn-danger"
                              onClick={() => handleDeleteConversation(conv.id)}
                              style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                              title="Delete conversation transcript"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Pagination Controls */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: 'rgba(255, 255, 255, 0.01)',
                  }}
                >
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-dim)' }}>
                    Page {convPagination.page} of {convPagination.totalPages} ({convPagination.total} total)
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      disabled={convPagination.page <= 1}
                      onClick={() => {
                        const updated = { ...convFilters, page: convPagination.page - 1 };
                        setConvFilters(updated);
                        fetchConversations(updated);
                      }}
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    >
                      Previous
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={convPagination.page >= convPagination.totalPages}
                      onClick={() => {
                        const updated = { ...convFilters, page: convPagination.page + 1 };
                        setConvFilters(updated);
                        fetchConversations(updated);
                      }}
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 3: KNOWLEDGE FEEDBACK LOOP */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'feedback_loop' && (
          <div>
            <div
              style={{
                background: 'rgba(79, 70, 229, 0.1)',
                border: '1px solid rgba(79, 70, 229, 0.3)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{ fontSize: '1.5rem' }}>💡</div>
              <div style={{ flex: 1 }}>
                <h4 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 600 }}>
                  Turn Visitor Questions into Verified Knowledge
                </h4>
                <p style={{ margin: '4px 0 0', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  Below are actual questions asked by website visitors where the assistant lacked high-confidence knowledge or
                  triggered a fallback. Provide an authorized answer to immediately train the RAG knowledge retriever.
                </p>
              </div>
            </div>

            {unansweredList.length === 0 ? (
              <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                🎉 Great job! No unanswered or low-confidence questions recorded.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '12px' }}>
                {unansweredList.map((item) => (
                  <div
                    key={item.id}
                    className="card"
                    style={{
                      padding: '18px 24px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '16px',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                        "{item.query}"
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        <span
                          style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            background: item.reason === 'no_knowledge_matches' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: item.reason === 'no_knowledge_matches' ? '#ef4444' : '#f59e0b',
                            fontWeight: 600,
                          }}
                        >
                          {item.reason === 'no_knowledge_matches' ? 'No Knowledge Matches' : 'Low Confidence'}
                        </span>
                        <span>Captured on {new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <div>
                      {item.addedToKnowledge ? (
                        <span
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                          }}
                        >
                          ✓ Added to Knowledge
                        </span>
                      ) : (
                        <button
                          className="btn btn-primary"
                          onClick={() => {
                            setConvertModalQuestion(item);
                            setFaqAnswer('');
                          }}
                          style={{ padding: '8px 16px', fontSize: '0.8125rem' }}
                        >
                          ➕ Add to Knowledge Base
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* TAB 4: PRIVACY, RETENTION & ACCESS AUDITING */}
        {/* ---------------------------------------------------- */}
        {activeTab === 'privacy' && (
          <div>
            <div className="card" style={{ padding: '28px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '16px' }}>
                🛡️ Privacy, Consent & Retention Rules
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div style={{ background: 'var(--bg-app)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                    Configured Retention Window
                  </div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '8px' }}>
                    {site.retentionDays || 30} Days
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                    Conversations and visitor messages exceeding this window are automatically scheduled for permanent hard deletion.
                  </p>
                </div>

                <div style={{ background: 'var(--bg-app)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                    Manual Retention Cleanup
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    Trigger an on-demand retention job to verify and purge expired transcripts immediately.
                  </p>
                  <button
                    className="btn btn-secondary"
                    disabled={isPurging}
                    onClick={handleManualPurge}
                    style={{ padding: '8px 16px', fontSize: '0.8125rem', fontWeight: 600 }}
                  >
                    {isPurging ? 'Purging Expired Records...' : '🗑️ Run Retention Purge Now'}
                  </button>

                  {purgeResult && (
                    <div
                      style={{
                        marginTop: '12px',
                        fontSize: '0.75rem',
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.1)',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      ✓ Purge verified: {purgeResult.purgedConversationsCount} conversations and{' '}
                      {purgeResult.purgedMessagesCount} messages purged.
                    </div>
                  )}
                </div>
              </div>

              {/* Guarantees List */}
              <div style={{ marginTop: '28px', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '12px' }}>
                  Compliance & Security Commitments
                </h4>
                <ul style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: '1.7', paddingLeft: '20px', margin: 0 }}>
                  <li>
                    <strong>Strict Multi-Tenant Isolation:</strong> Conversations from this site are isolated by tenant identifier. They are never accessible by other tenants or visitors.
                  </li>
                  <li>
                    <strong>No Model Training:</strong> OpenAgent will never automatically train, fine-tune, or leak your visitor transcripts into foundational AI models.
                  </li>
                  <li>
                    <strong>Automated Secret & PII Scrubbing:</strong> Phone numbers, email addresses, credit cards, SSNs, and bearer tokens are redacted prior to admin presentation and export.
                  </li>
                  <li>
                    <strong>Access Audit Logging:</strong> Every administrator transcript view, search, export, or deletion event is recorded in immutable audit logs with user and IP references.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------- */}
      {/* MODAL 1: INSPECT CONVERSATION DRAWER */}
      {/* ---------------------------------------------------- */}
      {inspectConversation && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 250,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setInspectConversation(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '650px',
              height: '100%',
              background: 'var(--bg-elevated)',
              boxShadow: '-8px 0 30px rgba(0, 0, 0, 0.8)',
              borderLeft: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              padding: '24px',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>Conversation Transcript</h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                  ID: {inspectConversation.id}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => setInspectConversation(null)}
                style={{ padding: '6px 12px', fontSize: '0.75rem' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Redaction Notice */}
            <div
              style={{
                fontSize: '0.75rem',
                padding: '8px 12px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: '#10b981',
                marginBottom: '16px',
              }}
            >
              🔒 PII Redacted: Sensitive credentials, emails, and phone numbers are obscured for security.
            </div>

            {/* Transcript Messages Stream */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', paddingRight: '6px' }}>
              {inspectConversation.messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    alignSelf: msg.role === 'visitor' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    background:
                      msg.role === 'visitor'
                        ? 'var(--accent-primary)'
                        : msg.role === 'system'
                        ? 'rgba(255, 255, 255, 0.05)'
                        : 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: msg.role === 'visitor' ? '#e0e7ff' : 'var(--text-dim)',
                      marginBottom: '4px',
                    }}
                  >
                    {msg.role === 'visitor' ? 'Visitor' : msg.role === 'assistant' ? 'Assistant' : 'System'} &bull;{' '}
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{msg.content}</div>

                  {/* Assistant Turn Stats */}
                  {msg.role === 'assistant' && (
                    <div
                      style={{
                        marginTop: '8px',
                        paddingTop: '6px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        fontSize: '0.7rem',
                        color: 'var(--text-dim)',
                        display: 'flex',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      {msg.latencyMs && <span>Latency: {msg.latencyMs}ms</span>}
                      {msg.tokenCountEstimate && <span>Tokens: ~{msg.tokenCountEstimate} (est)</span>}
                      {msg.isUnanswered && <span style={{ color: '#f59e0b' }}>⚠️ Unanswered / Uncertain</span>}
                      {msg.feedback && (
                        <span>
                          Feedback: {msg.feedback === 'positive' ? '👍' : '👎'} {msg.feedbackComment || ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Drawer Actions */}
            <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteConversation(inspectConversation.id)}
                style={{ padding: '8px 16px', fontSize: '0.8125rem' }}
              >
                🗑️ Delete Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- */}
      {/* MODAL 2: CONVERT UNANSWERED QUESTION TO FAQ */}
      {/* ---------------------------------------------------- */}
      {convertModalQuestion && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setConvertModalQuestion(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '550px', padding: '28px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, marginBottom: '8px' }}>
              ➕ Add to Knowledge Base (FAQ)
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
              Provide the verified answer to this question. It will be indexed into your site's knowledge store immediately.
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Question / Query
              </label>
              <input
                type="text"
                readOnly
                value={convertModalQuestion.query}
                style={{
                  width: '100%',
                  marginTop: '6px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Category
              </label>
              <input
                type="text"
                value={faqCategory}
                onChange={(e) => setFaqCategory(e.target.value)}
                placeholder="e.g. Policies, Pricing, Hours"
                style={{
                  width: '100%',
                  marginTop: '6px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                Verified Answer
              </label>
              <textarea
                rows={4}
                value={faqAnswer}
                onChange={(e) => setFaqAnswer(e.target.value)}
                placeholder="Enter the official answer for website visitors..."
                style={{
                  width: '100%',
                  marginTop: '6px',
                  background: 'var(--bg-app)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '10px 12px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setConvertModalQuestion(null)}
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={isConverting || !faqAnswer.trim()}
                onClick={handleConvertToFaq}
                style={{ padding: '8px 20px', fontWeight: 600 }}
              >
                {isConverting ? 'Indexing FAQ...' : 'Save & Index FAQ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
