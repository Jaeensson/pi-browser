import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import extension from '../src/index';
import { FakePi } from './helpers/fake-pi';

async function launched() {
  const pi = new FakePi();
  extension(pi as any);
  await pi.execute('browser_launch', {});
  return pi;
}

describe('browser_run', () => {
  it('runs JS with page/context/browser and returns JSON', async () => {
    const pi = await launched();
    const r = await pi.execute('browser_run', {
      code: "return (await page.title()) + '|' + (typeof context) + '|' + (typeof browser);",
    });
    // build() always appends a "### Page" section after the Result, so pin the value as its last line.
    expect(pi.text(r)).toMatch(/\|object\|object\n\n### Page/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('clamps on timeout (env-overridden to 500ms)', async () => {
    process.env.PI_DEV_BROWSER_RUN_TIMEOUT_MS = '500';
    const pi = new FakePi();
    try {
      extension(pi as any);
      await pi.execute('browser_launch', {});
      const r = await pi.execute('browser_run', { code: 'await page.waitForTimeout(5000); return "done";' }).catch((e: any) => e);
      expect(String(r?.message ?? r)).toMatch(/timed out/i);
    } finally {
      delete process.env.PI_DEV_BROWSER_RUN_TIMEOUT_MS;
      await pi.shutdownHandlers[0]?.();
    }
  }, 60_000);

  it('spills oversized output to a file', async () => {
    const pi = await launched();
    const r = await pi.execute('browser_run', { code: 'return "x".repeat(60000);' });
    const text = pi.text(r);
    expect(text).toMatch(/Output too large.*saved to: (\S+)/);
    const path = text.match(/saved to: (\S+)/)![1];
    expect(readFileSync(path, 'utf8').length).toBe(60000);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
