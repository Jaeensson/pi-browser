import { describe, expect, it } from 'vitest';
import extension from '../src/index';
import { FakePi } from './helpers/fake-pi';
import { FIXTURE_URL, installFixture } from './helpers/fixture';

async function launched() {
  const pi = new FakePi();
  extension(pi as any);
  await pi.execute('browser_launch', {});
  const session = (globalThis as any).__piBrowserSession as import('../src/session').BrowserSession;
  await installFixture(session.context);
  await pi.execute('browser_navigate', { url: FIXTURE_URL });
  return pi;
}

describe('observe tools', () => {
  it('browser_snapshot returns annotated tree with usage hint; selector scopes it', async () => {
    const pi = await launched();
    const snap = await pi.execute('browser_snapshot', {});
    const text = pi.text(snap);
    expect(text).toMatch(/button "Save" \[ref=e\d+\]/);
    expect(text).toMatch(/ref/i);
    const scoped = await pi.execute('browser_snapshot', { selector: 'ul#items' });
    expect(pi.text(scoped)).not.toMatch(/button "Save"/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('browser_take_screenshot returns image content', async () => {
    const pi = await launched();
    const shot = await pi.execute('browser_take_screenshot', { type: 'png' });
    const img = shot.content.find((c: any) => c.type === 'image');
    expect(img).toBeTruthy();
    expect((img as any).mimeType).toBe('image/png');
    expect(pi.text(shot)).not.toMatch(/### Snapshot/); // omitSnapshot
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
