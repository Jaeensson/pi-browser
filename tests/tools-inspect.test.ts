import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import extension from '../src/index';
import { FakePi } from './helpers/fake-pi';
import { FIXTURE_URL, installFixture } from './helpers/fixture';

async function launchedWithFixture() {
  const pi = new FakePi();
  extension(pi as any);
  await pi.execute('browser_launch', {});
  const session = (globalThis as any).__piDevBrowserSession;
  await installFixture(session.context);
  await pi.execute('browser_navigate', { url: FIXTURE_URL });
  return { pi, session };
}

describe('inspection tools', () => {
  it('evaluate runs JS and returns JSON', async () => {
    const { pi } = await launchedWithFixture();
    const r = await pi.execute('browser_evaluate', { function: '() => ({ title: document.title, n: 1 + 1 })' });
    expect(pi.text(r)).toMatch(/"title":\s*"Fixture App"/);
    expect(pi.text(r)).toMatch(/"n":\s*2/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('evaluate spills oversized output to a file (same 50KB policy as browser_run)', async () => {
    const { pi } = await launchedWithFixture();
    const r = await pi.execute('browser_evaluate', { function: '() => "x".repeat(60000)' });
    const text = pi.text(r);
    expect(text).toMatch(/Output too large \(60000 bytes\)\. saved to: (\S+)/);
    expect(readFileSync(text.match(/saved to: (\S+)/)![1], 'utf8').length).toBe(60000);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('console captures the page 404-free fixture but surfaces page errors', async () => {
    const { pi, session } = await launchedWithFixture();
    await session.page.evaluate(() => { console.error('boom'); });
    const r = await pi.execute('browser_console_messages', { level: 'error' });
    expect(pi.text(r)).toContain('boom');
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('network lists the API call; filter works', async () => {
    const { pi } = await launchedWithFixture();
    const snap = pi.text(await pi.execute('browser_snapshot', {}));
    const fetchRef = snap.match(/button "Fetch" \[ref=(e\d+)\]/)![1];
    await pi.execute('browser_click', { ref: fetchRef });
    await pi.execute('browser_wait_for', { text: 'fixture-data' });
    const r = await pi.execute('browser_network_requests', { filter: 'api' });
    expect(pi.text(r)).toMatch(/\/api\/data/);
    expect(pi.text(r)).toMatch(/200/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('route mocks an API and unroute restores', async () => {
    const { pi } = await launchedWithFixture();
    await pi.execute('browser_route', { pattern: '**/api/data', body: 'stubbed!', contentType: 'text/plain' });
    const snap = pi.text(await pi.execute('browser_snapshot', {}));
    const fetchRef = snap.match(/button "Fetch" \[ref=(e\d+)\]/)![1];
    await pi.execute('browser_click', { ref: fetchRef });
    await pi.execute('browser_wait_for', { text: 'stubbed!' });
    await pi.execute('browser_unroute', {});
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
