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

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data?.error?.message || `Request failed with status ${response.status}`;
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
}

export const api = new ApiClient();
