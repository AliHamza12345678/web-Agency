import type { MiddlewareHandler } from 'hono';

/**
 * Production Security Headers Middleware
 * Implements defense-in-depth HTTP headers for API and web responses.
 */
export const securityHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  // Prevent MIME type sniffing
  c.header('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking / frame embedding on API endpoints (widget.js has custom frame rules)
  if (!c.req.path.startsWith('/widget.js')) {
    c.header('X-Frame-Options', 'SAMEORIGIN');
  }

  // Enforce HTTPS transmission
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  // Control referrer leakage
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Disable browser feature permissions not required by the API
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');

  // Modern browser XSS auditor control (disabled to prevent side-channel leaks, relying on CSP)
  c.header('X-XSS-Protection', '0');

  // Prevent opening untrusted HTML downloads directly in browser context
  c.header('X-Download-Options', 'noopen');

  // DNS prefetch control
  c.header('X-DNS-Prefetch-Control', 'off');

  // Baseline Content Security Policy for API responses
  if (!c.res.headers.has('Content-Security-Policy')) {
    c.header(
      'Content-Security-Policy',
      "default-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self';"
    );
  }
};
