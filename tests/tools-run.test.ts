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

  // Spec §7 dialog policy: a user handler registered via browser_run must WIN over
  // the session's auto-dismiss listener (which fires first — so its dismiss is
  // deferred). The prompt's accept value proves the custom handler ran: with the
  // old synchronous auto-dismiss, prompt() returned null and a Modal line appeared.
  it('custom dialog handler via browser_run wins over auto-dismiss; takeModal stays null', async () => {
    const pi = await launched();
    const session = (globalThis as any).__piBrowserSession;
    await pi.execute('browser_run', { code: `await page.setContent('<button id="b" onclick="window.r = prompt(\\'name?\\')">Ask</button>');` });
    await pi.execute('browser_run', { code: `page.once('dialog', d => d.accept('custom-answer')); return 'handler set';` });
    await session.page.click('#b');
    // give the deferred auto-dismiss timeout a chance to (wrongly) fire before asserting
    await pi.execute('browser_run', { code: 'await page.waitForTimeout(200); return "settled";' });
    const r = await pi.execute('browser_evaluate', { function: '() => window.r' });
    expect(pi.text(r)).toContain('custom-answer'); // the user handler consumed the dialog
    expect(session.takeModal()).toBeNull();        // and no Modal state line was recorded
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  // Spec §8: the session abort signal cancels in-flight waits.
  it('rejects promptly when the abort signal fires', async () => {
    const pi = await launched();
    const ctrl = new AbortController();
    const run = pi.execute('browser_run', { code: 'await page.waitForTimeout(10_000); return "done";' }, process.cwd(), undefined, ctrl.signal);
    setTimeout(() => ctrl.abort(), 150);
    await expect(run).rejects.toThrow(/browser_run aborted/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
