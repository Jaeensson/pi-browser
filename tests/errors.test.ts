import { describe, expect, it } from 'vitest';
import { BrowserError, LaunchError, NotLaunchedError, StaleRefError } from '../src/errors';

describe('errors', () => {
  it('NotLaunchedError tells the model what to do', () => {
    const e = new NotLaunchedError();
    expect(e).toBeInstanceOf(BrowserError);
    expect(e.message).toMatch(/browser_launch/);
  });
  it('StaleRefError carries the fresh snapshot', () => {
    const e = new StaleRefError('- button "Save" [ref=e1]', 'e9');
    expect(e.freshSnapshot).toContain('[ref=e1]');
    expect(e.message).toMatch(/e9/);
    expect(e.message).toMatch(/fresh snapshot/i);
  });
  it('LaunchError carries a recovery command', () => {
    const e = new LaunchError('no binary', 'npx playwright install chromium');
    expect(e.recovery).toBe('npx playwright install chromium');
  });
});
