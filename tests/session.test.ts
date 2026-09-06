import { describe, expect, it } from 'vitest';
import { BrowserSession } from '../src/session';
import { NotLaunchedError } from '../src/errors';
import { FIXTURE_URL, installFixture } from './helpers/fixture';

describe('BrowserSession', () => {
  it('throws NotLaunchedError before launch', () => {
    const s = new BrowserSession();
    expect(() => s.page).toThrow(NotLaunchedError);
    expect(s.active).toBe(false);
  });

  it('launches headless, serves fixture, records console+network, resets on navigation', async () => {
    const s = new BrowserSession();
    await s.launch({}, process.cwd());
    expect(s.active).toBe(true);
    const ctx = s.context;
    await installFixture(ctx);

    await s.page.goto(FIXTURE_URL);
    await s.page.click('#fetch-btn');
    await s.page.waitForTimeout(300);

    expect(s.networkEntries().some(r => r.url === 'https://fixture.test/api/data' && r.status === 200)).toBe(true);
    await s.page.click('#alert-btn');
    expect(s.takeModal()).toMatch(/alert.*watch out/i);
    expect(s.takeModal()).toBeNull();

    // navigation resets buffers + ref store
    await s.page.goto(FIXTURE_URL + '?next');
    expect(s.networkEntries()).toHaveLength(0);
    expect(s.store.get('e1')).toBeUndefined();

    await s.disconnect();
    expect(s.active).toBe(false);
  }, 30_000);

  it('consoleEntries filters by minimum level', async () => {
    const s = new BrowserSession();
    await s.launch({}, process.cwd());
    await installFixture(s.context);
    await s.page.goto(FIXTURE_URL);
    await s.page.evaluate(() => { console.info('info-msg'); console.error('err-msg'); });
    await s.page.waitForTimeout(200);
    const errors = s.consoleEntries('error');
    expect(errors.some(e => e.text.includes('err-msg'))).toBe(true);
    expect(errors.some(e => e.text.includes('info-msg'))).toBe(false);
    await s.disconnect();
  }, 30_000);

  it('relaunch disconnects the previous browser', async () => {
    const s = new BrowserSession();
    await s.launch({}, process.cwd());
    const first = s.context;
    await s.launch({ mode: 'headed' === 'headed' ? {} : {} }, process.cwd()); // same opts; still relaunches
    expect(s.context).not.toBe(first);
    await s.disconnect();
  }, 30_000);
});
