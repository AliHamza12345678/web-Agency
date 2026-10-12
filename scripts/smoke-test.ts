/**
 * Production Readiness & Deployment Smoke Test Script
 *
 * Verifies core API contracts, public widget availability, health checks,
 * security headers, payload bounding, and authentication barriers.
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts [BASE_URL]
 *   Example: npx tsx scripts/smoke-test.ts http://localhost:3001
 */

const BASE_URL = process.argv[2] || process.env.API_BASE_URL || 'http://localhost:3001';

interface SmokeTestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  details?: string;
}

const results: SmokeTestResult[] = [];

async function runStep(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ name, passed: true, durationMs });
    console.log(`[PASS] ${name} (${durationMs}ms)`);
  } catch (error: any) {
    const durationMs = Date.now() - start;
    results.push({ name, passed: false, durationMs, details: error.message });
    console.error(`[FAIL] ${name} (${durationMs}ms) - ${error.message}`);
  }
}

export async function runSmokeTests() {
  console.log(`=======================================================`);
  console.log(`OpenAgent Production Deployment Smoke Tests`);
  console.log(`Target: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`=======================================================\n`);

  // 1. Root Operational Status
  await runStep('1. Root operational status endpoint', async () => {
    const res = await fetch(`${BASE_URL}/`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (data.status !== 'operational') throw new Error(`Unexpected status: ${data.status}`);
  });

  // 2. Liveness Probe
  await runStep('2. Liveness probe (/health/live)', async () => {
    const res = await fetch(`${BASE_URL}/health/live`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as any;
    if (data.status !== 'ok') throw new Error(`Status not ok: ${data.status}`);
  });

  // 3. Readiness Probe
  await runStep('3. Readiness probe (/health/ready)', async () => {
    const res = await fetch(`${BASE_URL}/health/ready`);
    // On cold start / fresh deployment, may return 200 or 503 with dependency report
    const data = (await res.json()) as any;
    if (!data.status || !data.checks) throw new Error('Malformed readiness report');
  });

  // 4. Detailed Health Summary & Dependency Monitoring
  await runStep('4. Dependency health status (/health)', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    const data = (await res.json()) as any;
    if (!data.dependencies || !data.dependencies.database) {
      throw new Error('Missing dependencies report');
    }
  });

  // 5. Standalone Widget Bundle Serving
  await runStep('5. Public widget bundle delivery (/widget.js)', async () => {
    const res = await fetch(`${BASE_URL}/widget.js`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('javascript')) throw new Error(`Invalid content-type: ${contentType}`);

    const cacheControl = res.headers.get('cache-control') || '';
    if (!cacheControl.includes('public')) throw new Error(`Missing public Cache-Control: ${cacheControl}`);

    const scriptText = await res.text();
    if (scriptText.length < 5000) throw new Error(`Bundle unexpectedly small (${scriptText.length} bytes)`);
    if (scriptText.includes('JWT_SECRET') || scriptText.includes('DATABASE_URL')) {
      throw new Error('CRITICAL: Server secrets detected inside public client bundle!');
    }
  });

  // 6. Security Headers Check
  await runStep('6. Secure HTTP perimeter headers', async () => {
    const res = await fetch(`${BASE_URL}/`);
    const hsts = res.headers.get('strict-transport-security');
    const nosniff = res.headers.get('x-content-type-options');
    const frameOptions = res.headers.get('x-frame-options');

    if (!nosniff || nosniff !== 'nosniff') throw new Error('Missing X-Content-Type-Options: nosniff');
    if (!frameOptions) throw new Error('Missing X-Frame-Options');
  });

  // 7. Public Key Handshake Contract (Negative Test)
  await runStep('7. Public key validation on handshake endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/site/config?publicKey=invalid_key`);
    if (res.status !== 400 && res.status !== 404) {
      throw new Error(`Expected HTTP 400 or 404, got ${res.status}`);
    }
  });

  // 8. Admin JWT Protection Barrier (Negative Test)
  await runStep('8. Unauthenticated admin endpoint rejection', async () => {
    const res = await fetch(`${BASE_URL}/api/v1/admin/tenants`);
    if (res.status !== 401) {
      throw new Error(`Expected HTTP 401 Unauthorized, got ${res.status}`);
    }
  });

  // 9. Payload Size Limit Enforcement (Negative Test)
  await runStep('9. Request size limit (>1MB payload rejection)', async () => {
    const oversizedPayload = JSON.stringify({ data: 'A'.repeat(1024 * 1024 + 100) });
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: oversizedPayload,
    });
    if (res.status !== 413) {
      throw new Error(`Expected HTTP 413 Payload Too Large, got ${res.status}`);
    }
  });

  // Summary Report
  console.log(`\n=======================================================`);
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`Smoke Test Results: ${passedCount} Passed, ${failedCount} Failed`);
  console.log(`=======================================================`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.includes('smoke-test')) {
  runSmokeTests().catch((err) => {
    console.error('Smoke tests execution failed:', err);
    process.exit(1);
  });
}
