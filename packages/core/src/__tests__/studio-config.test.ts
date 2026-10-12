import { describe, it, expect } from 'vitest';
import {
  siteStudioConfigSchema,
  DEFAULT_STUDIO_CONFIG,
  sanitizeText,
  sanitizeUrl,
  normalizeDomain,
} from '../index.js';

describe('Phase 8: Studio Configuration Schema & Sanitization', () => {
  it('parses empty object to default studio configuration with all 12 domains', () => {
    expect(DEFAULT_STUDIO_CONFIG).toBeDefined();
    expect(DEFAULT_STUDIO_CONFIG.assistant.name).toBe('AI Assistant');
    const config = siteStudioConfigSchema.parse({});
    expect(config.assistant.name).toBe('AI Assistant');
    expect(config.theme.primaryColor).toBe('#4f46e5');
    expect(config.theme.panelWidth).toBe(380);
    expect(config.messaging.welcomeMessage).toBe('Hello! How can I help you today?');
    expect(config.messaging.suggestedQuestions.length).toBeGreaterThan(0);
    expect(config.localization.defaultLanguage).toBe('en');
    expect(config.behavior.tone).toBe('friendly');
    expect(config.behavior.responseLength).toBe('balanced');
    expect(config.knowledge.scope).toBe('all');
    expect(config.tools.allowedTools.length).toBeGreaterThan(0);
    expect(config.support.email).toBe('');
    expect(config.availability.enabled).toBe(true);
    expect(config.retention.retentionDays).toBe(30);
    expect(config.throttling.rateLimitPerMinute).toBe(20);
    expect(config.analytics.collectFeedback).toBe(true);
  });

  it('validates hex color and rejects invalid hex codes', () => {
    expect(() =>
      siteStudioConfigSchema.parse({
        theme: {
          primaryColor: 'not-a-color',
        },
      })
    ).toThrow();

    const valid = siteStudioConfigSchema.parse({
      theme: {
        primaryColor: '#ff0055',
      },
    });
    expect(valid.theme.primaryColor).toBe('#ff0055');
  });

  it('sanitizes malicious script tags and inline handlers from text', () => {
    const malicious = '<script>alert("hack")</script>Welcome to our shop!<img src="x" onerror="alert(1)">';
    const cleaned = sanitizeText(malicious);
    expect(cleaned).not.toContain('<script>');
    expect(cleaned).not.toContain('alert');
    expect(cleaned).not.toContain('onerror');
    expect(cleaned).toContain('Welcome to our shop!');
  });

  it('sanitizes URLs strictly allowing only http and https', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
    expect(sanitizeUrl('file:///etc/passwd')).toBeNull();
    expect(sanitizeUrl('https://example.com/help')).toBe('https://example.com/help');
    expect(sanitizeUrl('http://mysite.org/contact')).toBe('http://mysite.org/contact');
  });

  it('normalizes domains accurately', () => {
    expect(normalizeDomain('https://Shop.Example.COM/cart?id=1')).toBe('shop.example.com');
    expect(normalizeDomain('my-domain.co.uk')).toBe('my-domain.co.uk');
    expect(normalizeDomain('invalid domain')).toBeNull();
  });
});
