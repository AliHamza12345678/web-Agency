import type { User, TenantMembership, Site } from './types.js';

const API_BASE = '/api/v1';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('openagent_token');
  }

  public setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('openagent_token', token);
    } else {
      localStorage.removeItem('openagent_token');
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      // Non-JSON response
    }

    if (!response.ok) {
      const errorMsg =
        data?.error?.message ||
        data?.message ||
        (text && text.length < 200 && !text.includes('<!DOCTYPE') ? text : `Request failed with status ${response.status}`);
      throw new Error(errorMsg);
    }

    return data.data as T;
  }

  // Auth Endpoints
  public async register(payload: { email: string; password: string; name: string; organizationName?: string }) {
    const data = await this.request<{ user: User; tenant: TenantMembership; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    this.setToken(data.token);
    return data;
  }

  public async login(payload: { email: string; password: string }) {
    const data = await this.request<{ user: User; tenants: TenantMembership[]; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    this.setToken(data.token);
    return data;
  }

  public async getMe() {
    return this.request<{ user: User; tenants: TenantMembership[] }>('/auth/me');
  }

  public async getAuthConfig() {
    return this.request<{ allowRegistration: boolean }>('/auth/config');
  }

  // Tenant Endpoints
  public async getTenants() {
    return this.request<TenantMembership[]>('/admin/tenants');
  }

  public async createTenant(name: string) {
    return this.request<TenantMembership>('/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  // Site Endpoints
  public async getSites(tenantId: string, search?: string) {
    const query = search ? `?q=${encodeURIComponent(search)}` : '';
    return this.request<Site[]>(`/admin/tenants/${tenantId}/sites${query}`);
  }

  public async createSite(tenantId: string, siteData: Partial<Site>) {
    return this.request<Site>(`/admin/tenants/${tenantId}/sites`, {
      method: 'POST',
      body: JSON.stringify(siteData),
    });
  }

  public async updateSite(tenantId: string, siteId: string, siteData: Partial<Site>) {
    return this.request<Site>(`/admin/tenants/${tenantId}/sites/${siteId}`, {
      method: 'PUT',
      body: JSON.stringify(siteData),
    });
  }

  public async deleteSite(tenantId: string, siteId: string) {
    return this.request<{ message: string }>(`/admin/tenants/${tenantId}/sites/${siteId}`, {
      method: 'DELETE',
    });
  }

  public async regenerateKey(tenantId: string, siteId: string) {
    return this.request<{ siteId: string; publicKey: string }>(`/admin/tenants/${tenantId}/sites/${siteId}/regenerate-key`, {
      method: 'POST',
    });
  }

  // Phase 7: Integrations & Tool Calling Endpoints
  public async getSiteIntegrations(tenantId: string, siteId: string) {
    return this.request<import('./types.js').IntegrationStatus[]>(
      `/admin/tenants/${tenantId}/sites/${siteId}/integrations`
    );
  }

  public async updateSiteIntegration(
    tenantId: string,
    siteId: string,
    payload: { toolId: string; enabled: boolean; requiresConfirmation?: boolean; config?: Record<string, any> }
  ) {
    return this.request<{ message: string }>(
      `/admin/tenants/${tenantId}/sites/${siteId}/integrations`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  }

  public async getToolAuditLogs(tenantId: string, siteId: string, limit = 25, toolName?: string) {
    const q = new URLSearchParams();
    if (limit) q.set('limit', String(limit));
    if (toolName) q.set('toolName', toolName);
    const queryStr = q.toString() ? `?${q.toString()}` : '';
    return this.request<import('./types.js').ToolAuditLog[]>(
      `/admin/tenants/${tenantId}/sites/${siteId}/tools/audit-logs${queryStr}`
    );
  }

  public async testExecuteTool(siteId: string, toolId: string, parameters: Record<string, any>) {
    return this.request<any>('/tools/execute', {
      method: 'POST',
      body: JSON.stringify({ siteId, toolId, parameters }),
    });
  }

  // Phase 8: No-Code Studio Endpoints
  public async getStudioConfiguration(tenantId: string, siteId: string) {
    return this.request<{
      siteId: string;
      siteName: string;
      publicKey: string;
      publishedVersion: number;
      draftConfiguration: import('./types.js').SiteStudioConfig;
      publishedConfiguration: import('./types.js').SiteStudioConfig;
      isDirty: boolean;
      versions: import('./types.js').ConfigurationVersion[];
    }>(`/admin/tenants/${tenantId}/sites/${siteId}/studio/configuration`);
  }

  public async saveStudioDraft(
    tenantId: string,
    siteId: string,
    draftConfig: import('./types.js').SiteStudioConfig
  ) {
    return this.request<{
      draftConfiguration: import('./types.js').SiteStudioConfig;
      isDirty: boolean;
      updatedAt: string;
    }>(`/admin/tenants/${tenantId}/sites/${siteId}/studio/draft`, {
      method: 'PUT',
      body: JSON.stringify(draftConfig),
    });
  }

  public async publishStudioConfig(tenantId: string, siteId: string, changeSummary?: string) {
    return this.request<{
      version: number;
      publishedConfiguration: import('./types.js').SiteStudioConfig;
      versionRecord: import('./types.js').ConfigurationVersion;
    }>(`/admin/tenants/${tenantId}/sites/${siteId}/studio/publish`, {
      method: 'POST',
      body: JSON.stringify({ changeSummary }),
    });
  }

  public async previewProfile(
    tenantId: string,
    siteId: string,
    profile?: Partial<import('./types.js').AssistantProfile>
  ) {
    return this.request<{
      compiledInstruction: string;
      summary: any;
    }>(`/admin/tenants/${tenantId}/sites/${siteId}/studio/profile/preview`, {
      method: 'POST',
      body: JSON.stringify({ profile }),
    });
  }

  public async rollbackStudioConfig(
    tenantId: string,
    siteId: string,
    version: number,
    publishImmediately = false
  ) {
    return this.request<{
      message: string;
      restoredVersion: number;
      draftConfiguration: import('./types.js').SiteStudioConfig;
      isPublished: boolean;
    }>(`/admin/tenants/${tenantId}/sites/${siteId}/studio/rollback`, {
      method: 'POST',
      body: JSON.stringify({ version, publishImmediately }),
    });
  }

  public async getStudioVersions(tenantId: string, siteId: string) {
    return this.request<import('./types.js').ConfigurationVersion[]>(
      `/admin/tenants/${tenantId}/sites/${siteId}/studio/versions`
    );
  }

  public async getStudioEmbed(tenantId: string, siteId: string) {
    return this.request<import('./types.js').EmbedSnippetData>(
      `/admin/tenants/${tenantId}/sites/${siteId}/studio/embed`
    );
  }

  public async getStudioDomains(tenantId: string, siteId: string) {
    return this.request<import('./types.js').DomainVerification[]>(
      `/admin/tenants/${tenantId}/sites/${siteId}/studio/domains`
    );
  }

  public async createStudioDomain(
    tenantId: string,
    siteId: string,
    domain: string,
    verificationMethod: string = 'dns_txt'
  ) {
    return this.request<{
      verification: import('./types.js').DomainVerification;
      instructions: any;
    }>(`/admin/tenants/${tenantId}/sites/${siteId}/studio/domains`, {
      method: 'POST',
      body: JSON.stringify({ domain, verificationMethod }),
    });
  }

  public async checkStudioDomain(tenantId: string, siteId: string, verificationId: string) {
    return this.request<import('./types.js').DomainVerification>(
      `/admin/tenants/${tenantId}/sites/${siteId}/studio/domains/${verificationId}/check`,
      {
        method: 'POST',
      }
    );
  }

  public async deleteStudioDomain(tenantId: string, siteId: string, verificationId: string) {
    return this.request<{ message: string }>(
      `/admin/tenants/${tenantId}/sites/${siteId}/studio/domains/${verificationId}`,
      {
        method: 'DELETE',
      }
    );
  }

  // Phase 9: Analytics & Conversation Management
  public async getAnalyticsMetrics(tenantId: string, siteId: string, period = '7d', timezone = 'UTC') {
    return this.request<import('./types.js').AnalyticsDashboardMetrics>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/metrics?period=${encodeURIComponent(period)}&timezone=${encodeURIComponent(timezone)}`
    );
  }

  public async getUnansweredQuestions(tenantId: string, siteId: string) {
    return this.request<import('./types.js').UnansweredQuestionRecord[]>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/unanswered-questions`
    );
  }

  public async convertUnansweredQuestion(
    tenantId: string,
    siteId: string,
    question: string,
    answer: string,
    category?: string
  ) {
    return this.request<{ documentId: string; title: string; message: string }>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/unanswered-questions/convert`,
      {
        method: 'POST',
        body: JSON.stringify({ question, answer, category }),
      }
    );
  }

  public async getConversations(
    tenantId: string,
    siteId: string,
    filters: import('./types.js').ConversationQueryFilters = {}
  ) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.feedback) params.set('feedback', filters.feedback);
    if (filters.hasHandoff !== undefined) params.set('hasHandoff', String(filters.hasHandoff));
    if (filters.isLowConfidence !== undefined) params.set('isLowConfidence', String(filters.isLowConfidence));
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
    if (filters.page) params.set('page', String(filters.page));
    if (filters.limit) params.set('limit', String(filters.limit));

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<import('./types.js').ConversationListResponse>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/conversations${qs}`
    );
  }

  public async getConversationDetail(tenantId: string, siteId: string, conversationId: string) {
    return this.request<import('./types.js').ConversationDetail>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/conversations/${conversationId}`
    );
  }

  public async deleteConversation(tenantId: string, siteId: string, conversationId: string) {
    return this.request<{ message: string; conversationId: string }>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/conversations/${conversationId}`,
      {
        method: 'DELETE',
      }
    );
  }

  public async exportConversations(tenantId: string, siteId: string, format: 'json' | 'csv' = 'json') {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const response = await fetch(
      `${API_BASE}/admin/tenants/${tenantId}/sites/${siteId}/analytics/export?format=${format}`,
      { headers }
    );
    if (!response.ok) {
      throw new Error(`Export failed with status ${response.status}`);
    }
    return response.text();
  }

  public async runRetentionCleanup(tenantId: string, siteId: string) {
    return this.request<import('./types.js').RetentionCleanupResult>(
      `/admin/tenants/${tenantId}/sites/${siteId}/analytics/retention/cleanup`,
      {
        method: 'POST',
      }
    );
  }
}

export const api = new ApiClient();

