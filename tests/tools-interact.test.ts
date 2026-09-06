import { describe, expect, it } from 'vitest';
import { expect as pwExpect } from 'playwright/test';
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

describe('interaction tools', () => {
  it('click by ref, type by ref with submit, fill_form with combobox, hover', async () => {
    const { pi, session } = await launchedWithFixture();
    const snap = pi.text(await pi.execute('browser_snapshot', {}));
    const saveRef = snap.match(/button "Save" \[ref=(e\d+)\]/)![1];
    const emailRef = snap.match(/textbox "Email" \[ref=(e\d+)\]/)![1];
    const colorRef = snap.match(/combobox "Color" \[ref=(e\d+)\]/)![1];

    await pi.execute('browser_click', { ref: saveRef });
    await pwExpect(session.page.locator('#status')).toBeVisible();
    // Ruling 7d: the model-visible snapshot carries the revealed text as a ref-free line
    expect(pi.text(await pi.execute('browser_snapshot', {}))).toMatch(/saved!/);

    await pi.execute('browser_type', { ref: emailRef, text: 'a@b.c', submit: true });
    // fixture input has aria-label, not id="email" — probe by attribute
    expect(await session.page.inputValue('input[aria-label="Email"]')).toBe('a@b.c');

    await pi.execute('browser_fill_form', { fields: [{ type: 'combobox', ref: colorRef, value: 'green' }] });
    expect(await (globalThis as any).__piDevBrowserSession.page.inputValue('select')).toBe('green');

    await pi.execute('browser_hover', { selector: 'h1' });
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('stale ref self-heals: rejection embeds a fresh annotated snapshot', async () => {
    const { pi, session } = await launchedWithFixture();
    const snap = pi.text(await pi.execute('browser_snapshot', {}));
    const staleRef = snap.match(/button "Save" \[ref=(e\d+)\]/)![1];
    // Real staleness (Ruling 7c): mutate the DOM behind the store's back so the
    // async count-check in RefStore.resolve must reject the captured ref.
    await session.page.evaluate(() => document.getElementById('save')!.remove());
    const err: any = await pi.execute('browser_click', { ref: staleRef }).catch((e: any) => e);
    expect(String(err?.message ?? err)).toMatch(/stale/i);
    expect(String(err?.message ?? err)).toMatch(/\[ref=e\d+\]/); // fresh snapshot attached for self-heal
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('press_key works', async () => {
    const { pi, session } = await launchedWithFixture();
    const snap = pi.text(await pi.execute('browser_snapshot', {}));
    const emailRef = snap.match(/textbox "Email" \[ref=(e\d+)\]/)![1];
    await pi.execute('browser_type', { ref: emailRef, text: 'x' });
    await pi.execute('browser_press_key', { key: 'End' });
    expect(session.active).toBe(true);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);
});
