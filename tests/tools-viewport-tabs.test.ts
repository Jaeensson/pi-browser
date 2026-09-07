import { describe, expect, it } from 'vitest';
import extension from '../src/index';
import { FakePi } from './helpers/fake-pi';
import { FIXTURE_URL, installFixture } from './helpers/fixture';

async function launched() {
  const pi = new FakePi();
  extension(pi as any);
  await pi.execute('browser_launch', {});
  const session = (globalThis as any).__piBrowserSession;
  await installFixture(session.context);
  await pi.execute('browser_navigate', { url: FIXTURE_URL });
  return { pi, session };
}

describe('browser_resize', () => {
  it('resizes viewport; DPR override via CDP', async () => {
    const { pi, session } = await launched();
    await pi.execute('browser_resize', { width: 390, height: 844 });
    expect(session.page.viewportSize()).toEqual({ width: 390, height: 844 });
    await pi.execute('browser_resize', { width: 390, height: 844, deviceScaleFactor: 3 });
    const dsf = await session.page.evaluate('window.devicePixelRatio');
    expect(Number(dsf)).toBe(3);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});

describe('browser_tabs', () => {
  it('new/list/select/close', async () => {
    const { pi, session } = await launched();
    await pi.execute('browser_tabs', { action: 'new', url: FIXTURE_URL + '?tab2' });
    expect(session.pages().length).toBe(2);
    expect(session.page.url()).toContain('tab2');
    const listed = pi.text(await pi.execute('browser_tabs', { action: 'list' }));
    expect(listed).toMatch(/tab2/);
    await pi.execute('browser_tabs', { action: 'select', index: 0 });
    expect(session.page.url()).not.toContain('tab2');
    await pi.execute('browser_tabs', { action: 'close' });
    expect(session.pages().length).toBe(1);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
