import { describe, expect, it } from 'vitest';
import extension from '../src/index';
import type { BrowserSession } from '../src/session';
import { makeInteractTools } from '../src/tools/interact';
import { makeInspectTools } from '../src/tools/inspect';
import { makeNavigateTools } from '../src/tools/navigate';
import { makeObserveTools } from '../src/tools/observe';
import { makeRunTools } from '../src/tools/run';
import { makeTabsTools } from '../src/tools/tabs';
import { makeViewportTools } from '../src/tools/viewport';
import { makeWaitTools } from '../src/tools/wait';
import { FakePi } from './helpers/fake-pi';

const dummySession = {} as BrowserSession;
const coreTools = [
  ...makeNavigateTools(dummySession),
  ...makeObserveTools(dummySession),
  ...makeInteractTools(dummySession),
  ...makeInspectTools(dummySession),
  ...makeViewportTools(dummySession),
  ...makeTabsTools(dummySession),
  ...makeWaitTools(dummySession),
  ...makeRunTools(dummySession),
];
const expectedNames = new Set(['browser_launch', ...coreTools.map(t => t.name)]);

describe('registration lifecycle', () => {
  it('registers only browser_launch before launch; core modules after', async () => {
    const pi = new FakePi();
    extension(pi as any);
    expect(pi.tools.has('browser_launch')).toBe(true);
    expect(pi.tools.size).toBe(1);

    const launchResult = await pi.execute('browser_launch', {});
    expect(launchResult.isError).toBeUndefined(); // launch must actually launch, not error
    // All 20 tools: browser_launch + exactly 19 core tools (toolkit complete as of Task 14).
    expect(pi.tools.size).toBe(20);
    expect(new Set(pi.tools.keys())).toEqual(expectedNames);

    // idempotent: launching again must not throw from duplicate registration
    await pi.execute('browser_launch', { mode: 'headed' });
    expect(pi.tools.size).toBe(20);
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('launch description advertises capabilities; result lists tools; guideline present', async () => {
    const pi = new FakePi();
    extension(pi as any);
    const launch = pi.tools.get('browser_launch')!;
    expect(launch.description).toMatch(/browser_run/);
    expect(launch.promptGuidelines?.join(' ')).toMatch(/browser_launch/);
    const result = await pi.execute('browser_launch', {});
    const text = pi.text(result);
    expect(text).toContain('Registered 19 tools');
    const listed = text.split('Registered 19 tools:\n')[1]!.split('\n')[0].trim().split(/,\s*/);
    expect(listed).toHaveLength(19);
    expect(new Set(listed)).toEqual(new Set(coreTools.map(t => t.name)));
    await pi.shutdownHandlers[0]?.();
  }, 60_000);

  it('does not register non-launch tools before launch', () => {
    const pi = new FakePi();
    extension(pi as any);
    expect(pi.tools.has('browser_launch')).toBe(true);
    expect(pi.tools.has('browser_navigate')).toBe(false);
  });
});
