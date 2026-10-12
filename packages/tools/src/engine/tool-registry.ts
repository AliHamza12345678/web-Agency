import type { ToolDefinition, IntegrationStatus, SiteToolConfig } from '../types.js';
import { searchApprovedPagesTool } from '../built-in/search-approved-pages.js';
import { searchProductCatalogTool } from '../built-in/search-product-catalog.js';
import { getBusinessContactTool } from '../built-in/get-business-contact.js';
import { getFaqsAndPoliciesTool } from '../built-in/get-faqs-and-policies.js';
import { createSupportRequestTool } from '../built-in/create-support-request.js';
import { captureLeadTool } from '../built-in/capture-lead.js';
import { offerHumanHandoffTool } from '../built-in/offer-human-handoff.js';
import { orderStatusTool } from '../connectors/order-status.js';
import { appointmentAvailabilityTool } from '../connectors/appointment-availability.js';
import { inventoryCheckTool } from '../connectors/inventory-check.js';
import { shippingEstimatesTool } from '../connectors/shipping-estimates.js';
import { crmSyncTool } from '../connectors/crm-connector.js';

export class ToolRegistry {
  private static instance: ToolRegistry | null = null;
  private tools = new Map<string, ToolDefinition>();

  constructor() {
    this.registerDefaults();
  }

  public static getInstance(): ToolRegistry {
    if (!ToolRegistry.instance) {
      ToolRegistry.instance = new ToolRegistry();
    }
    return ToolRegistry.instance;
  }

  private registerDefaults(): void {
    // 7 Initial tools
    this.register(searchApprovedPagesTool);
    this.register(searchProductCatalogTool);
    this.register(getBusinessContactTool);
    this.register(getFaqsAndPoliciesTool);
    this.register(createSupportRequestTool);
    this.register(captureLeadTool);
    this.register(offerHumanHandoffTool);

    // Optional future connectors
    this.register(orderStatusTool);
    this.register(appointmentAvailabilityTool);
    this.register(inventoryCheckTool);
    this.register(shippingEstimatesTool);
    this.register(crmSyncTool);
  }

  public register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  public get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Generates integration statuses for a specific website based on its database configurations.
   */
  public getSiteIntegrationStatuses(
    siteConfigs: SiteToolConfig[] = [],
    siteMetadataConfig: Record<string, any> = {}
  ): IntegrationStatus[] {
    const configMap = new Map<string, SiteToolConfig>();
    for (const conf of siteConfigs) {
      configMap.set(conf.toolId, conf);
    }

    return this.getAll().map((tool) => {
      const siteConfig = configMap.get(tool.id);
      // Default initial tools to enabled unless explicitly turned off
      const defaultEnabled = [
        'search_approved_pages',
        'search_product_catalog',
        'get_business_contact',
        'get_faqs_and_policies',
        'create_support_request',
        'capture_lead',
        'offer_human_handoff',
      ].includes(tool.id);

      const isEnabled = siteConfig ? siteConfig.enabled : defaultEnabled;

      // Check if connector requires specific backend configuration
      let isConfigured = true;
      if (tool.id === 'offer_human_handoff') {
        isConfigured = Boolean(siteMetadataConfig.handoff?.enabled);
      } else if (tool.id === 'lookup_order_status') {
        isConfigured = Boolean(siteMetadataConfig.orderConnector?.enabled);
      } else if (tool.id === 'check_appointment_availability') {
        isConfigured = Boolean(siteMetadataConfig.bookingConnector?.enabled);
      } else if (tool.id === 'check_inventory') {
        isConfigured = Boolean(siteMetadataConfig.inventoryConnector?.enabled);
      } else if (tool.id === 'get_shipping_estimates') {
        isConfigured = Boolean(siteMetadataConfig.shippingConnector?.enabled);
      } else if (tool.id === 'sync_crm_or_helpdesk') {
        isConfigured = Boolean(siteMetadataConfig.crmConnector?.enabled && siteMetadataConfig.crmConnector?.apiKey);
      }

      let status: 'active' | 'disabled' | 'needs_config' = 'active';
      if (!isEnabled) {
        status = 'disabled';
      } else if (!isConfigured) {
        status = 'needs_config';
      }

      return {
        toolId: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        isConsequential: Boolean(tool.isConsequential),
        requiresConsent: Boolean(tool.requiresExplicitConsent),
        enabled: isEnabled,
        configured: isConfigured,
        status,
        configSummary: siteConfig?.config || {},
      };
    });
  }
}

export const globalToolRegistry = ToolRegistry.getInstance();
