import { describe, expect, it } from 'vitest';
import type { Route } from 'playwright';
import extension from '../src/index';
import { FakePi } from './helpers/fake-pi';

const EXAMPLE_HTML = '<!doctype html><html><head><title>Example Domain</title></head><body><p>hermetic example fixture</p></body></html>';

// Tests never require network (project policy): fulfill example.com with a
// minimal local page via context interception — same pattern as
// tests/helpers/fixture.ts — while keeping the URL-normalization assertions.
async function launchedHermetic() {
  const pi = new FakePi();
  extension(pi as any);
  await pi.execute('browser_launch', {});
  const session = (globalThis as any).__piDevBrowserSession;
  await session.context.route('https://example.com/**', (route: Route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: EXAMPLE_HTML }));
  return pi;
}

describe('navigation tools', () => {
  it('navigates, normalizes localhost URLs, goes back, reloads; snapshot included', async () => {
    const pi = await launchedHermetic();
    const nav = await pi.execute('browser_navigate', { url: 'example.com' });
    const text = pi.text(nav);
    expect(text).toMatch(/### Page/);
    expect(text).toMatch(/https:\/\/example\.com/);
    expect(text).toMatch(/### Snapshot/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('back and reload execute and include snapshots', async () => {
    const pi = await launchedHermetic();
    await pi.execute('browser_navigate', { url: 'example.com' });
    const back = await pi.execute('browser_navigate_back', {});
    expect(pi.text(back)).toMatch(/### Page/);
    const reload = await pi.execute('browser_reload', {});
    expect(pi.text(reload)).toMatch(/### Snapshot/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  // Controller ruling (native pi tool contract): a failed tool execution THROWS from
  // execute — pi marks the call as an error and reports the message to the LLM. Tools
  // stay registered after session shutdown, so the not-launched state is reached by
  // launching and then shutting down (pre-launch the tool is intentionally
  // unregistered — see registration.test.ts).
  it('navigate with no live session rejects, pointing at browser_launch', async () => {
    const pi = new FakePi();
    extension(pi as any);
    await pi.execute('browser_launch', {});
    await pi.shutdownHandlers[0]?.(); // session_shutdown → disconnect; core tools stay registered
    await expect(pi.execute('browser_navigate', { url: 'example.com' })).rejects.toThrow(/browser_launch/);
  });
});
