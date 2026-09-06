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

describe('browser_wait_for', () => {
  it('waits for text to appear after an action', async () => {
    const { pi } = await launchedWithFixture();
    const snap = pi.text(await pi.execute('browser_snapshot', {}));
    const saveRef = snap.match(/button "Save" \[ref=(e\d+)\]/)![1];
    await pi.execute('browser_click', { ref: saveRef });
    const r = await pi.execute('browser_wait_for', { text: 'saved!' });
    expect(pi.text(r)).toMatch(/appeared/i);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('waits for text to disappear and rejects conflicting params', async () => {
    const { pi } = await launchedWithFixture();
    const r = await pi.execute('browser_wait_for', { textGone: 'no-such-text' });
    expect(pi.text(r)).toMatch(/gone|hidden/i);
    const bad = await pi.execute('browser_wait_for', { text: 'a', time: 1 }).catch(e => e);
    expect(String(bad?.message ?? pi.text(bad as any))).toMatch(/one of/i);
    // hidden is a modifier of selector, not a standalone choice
    const badHidden = await pi.execute('browser_wait_for', { hidden: true }).catch(e => e);
    expect(String(badHidden?.message ?? badHidden)).toMatch(/one of/i);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('selector + hidden:true resolves for an already-hidden element', async () => {
    const { pi } = await launchedWithFixture();
    // fixture `#late` ships hidden → the hidden-state wait resolves immediately
    const r = await pi.execute('browser_wait_for', { selector: '#late', hidden: true });
    expect(pi.text(r)).toMatch(/Selector #late is hidden/);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
