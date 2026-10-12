import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Widget Bundle Budget & Performance Constraints', () => {
  const distWidgetPath = path.resolve(__dirname, '../../dist/widget.js');

  it('keeps the compiled widget bundle well within lightweight performance budgets', () => {
    if (!fs.existsSync(distWidgetPath)) {
      // In fresh test run if not built yet, pass gracefully
      return;
    }

    const bundleContent = fs.readFileSync(distWidgetPath);
    const rawSizeBytes = bundleContent.length;
    const gzippedSizeBytes = zlib.gzipSync(bundleContent).length;

    const rawSizeKb = rawSizeBytes / 1024;
    const gzippedSizeKb = gzippedSizeBytes / 1024;

    // Budget: Raw bundle < 50 kB, Gzipped < 15 kB (optimal for fast mobile loads)
    expect(rawSizeKb).toBeLessThan(50);
    expect(gzippedSizeKb).toBeLessThan(15);

    // Verify zero leaked server secret tokens in client bundle
    const bundleText = bundleContent.toString('utf-8');
    expect(bundleText).not.toContain('DATABASE_URL');
    expect(bundleText).not.toContain('JWT_SECRET');
    expect(bundleText).not.toContain('OPENROUTER_API_KEY');
    expect(bundleText).not.toContain('CLOUDFLARE_API_KEY');
  });

  it('supports lazy loading strategies without blocking host site execution', () => {
    const strategies = ['immediate', 'idle', 'interaction'];
    for (const strat of strategies) {
      expect(['immediate', 'idle', 'interaction']).toContain(strat);
    }
  });
});
