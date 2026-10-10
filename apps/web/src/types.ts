export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface TenantMembership {
  tenantId: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  plan: string;
}

export interface SiteBranding {
  botName: string;
  primaryColor: string;
  textColor: string;
  welcomeMessage: string;
  placeholder?: string;
  logoUrl?: string;
  position?: 'bottom-right' | 'bottom-left';
}

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  publicKey: string;
  allowedOrigins: string[];
  systemPrompt?: string;
  branding: SiteBranding;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
  stats?: {
    docsCount: number;
    convsCount: number;
  };
}
