import { describe, it, expect } from 'vitest';
import {
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  validateUrl,
  SSRFSecurityError,
} from '../crawler/ssrf-guard.js';

describe('SSRF Security Guard & URL Validation', () => {
  describe('IP Range Filtering', () => {
    it('identifies private RFC 1918 IPv4 ranges as unsafe', () => {
      expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('10.255.255.254')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.16.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('172.31.255.255')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.1.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('192.168.0.254')).toBe(true);
    });

    it('identifies loopback and cloud metadata IPs as unsafe', () => {
      expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('127.0.0.2')).toBe(true);
      expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true); // AWS/GCP/Azure metadata
      expect(isPrivateOrReservedIPv4('169.254.1.1')).toBe(true);
      expect(isPrivateOrReservedIPv4('0.0.0.0')).toBe(true);
    });

    it('identifies safe public IPv4 addresses', () => {
      expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);
      expect(isPrivateOrReservedIPv4('1.1.1.1')).toBe(false);
      expect(isPrivateOrReservedIPv4('93.184.216.34')).toBe(false);
    });

    it('identifies private and loopback IPv6 addresses as unsafe', () => {
      expect(isPrivateOrReservedIPv6('::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
      expect(isPrivateOrReservedIPv6('::ffff:127.0.0.1')).toBe(true);
    });
  });

  describe('URL Validation & Security Directives', () => {
    it('rejects forbidden protocols like file:, ftp:, gopher:', async () => {
      await expect(validateUrl('file:///etc/passwd')).rejects.toThrow(SSRFSecurityError);
      await expect(validateUrl('ftp://ftp.example.com')).rejects.toThrow(SSRFSecurityError);
      await expect(validateUrl('javascript:alert(1)')).rejects.toThrow();
    });

    it('rejects localhost and cloud metadata hostnames', async () => {
      await expect(validateUrl('http://localhost:3000')).rejects.toThrow(SSRFSecurityError);
      await expect(validateUrl('http://app.localhost')).rejects.toThrow(SSRFSecurityError);
      await expect(validateUrl('http://metadata.google.internal')).rejects.toThrow(SSRFSecurityError);
    });

    it('rejects private IP URLs', async () => {
      await expect(validateUrl('http://127.0.0.1/admin')).rejects.toThrow(SSRFSecurityError);
      await expect(validateUrl('http://192.168.1.1/setup')).rejects.toThrow(SSRFSecurityError);
      await expect(validateUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(SSRFSecurityError);
    });

    it('enforces domain allowlists strictly', async () => {
      const allowed = ['https://mystore.com', 'shop.example.com'];

      await expect(validateUrl('https://evil-site.com', allowed)).rejects.toThrow(/not authorized/);
    });
  });
});
