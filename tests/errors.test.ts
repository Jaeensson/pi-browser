import { describe, expect, it } from 'vitest';
import { BrowserError, LaunchError, NotLaunchedError, StaleRefError } from '../src/errors';
import { PI_MAX_BYTES } from '../src/response';

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
  it('StaleRefError truncates an oversized fresh snapshot at the 50KB cap', () => {
    const huge = '- button "Save" [ref=e1]\n'.repeat(6000); // > 50KB
    expect(huge.length).toBeGreaterThan(PI_MAX_BYTES);
    const e = new StaleRefError(huge, 'e9');
    expect(e.freshSnapshot.length).toBeLessThanOrEqual(PI_MAX_BYTES + 100); // capped, not passed through
    expect(e.freshSnapshot).toMatch(/\[Snapshot truncated at 50KB — re-call browser_snapshot with a selector\.\]$/);
    expect(e.message).toMatch(/fresh snapshot attached below/); // stale-ref framing intact
    // undersized snapshots pass through untouched
    expect(new StaleRefError('- button [ref=e1]', 'e9').freshSnapshot).toBe('- button [ref=e1]');
  });
  it('LaunchError carries a recovery command', () => {
    const e = new LaunchError('no binary', 'npx playwright install chromium');
    expect(e.recovery).toBe('npx playwright install chromium');
  });
});
