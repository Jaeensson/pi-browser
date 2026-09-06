import { Type } from 'typebox';
import type { CDPSession } from 'playwright';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

// Ruling 6 (fix leak: a CDP session was created per DSF resize and never detached).
// Verified against headless Chromium: DETACHING the session that applied an
// Emulation override resets it (window.devicePixelRatio reverts 3 → 1, even if a
// newer session re-applied it), so the ruled detach-in-finally would silently drop
// the DSF override the tool just applied. We instead keep exactly ONE emulation
// session per page (WeakMap — reaped when the browser context closes) and reuse it
// across resize calls: bounded sessions, override persists.
const emuSessions = new WeakMap<object, CDPSession>();

export function makeViewportTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_resize',
      label: 'Resize',
      description: 'Resize the viewport; optional deviceScaleFactor (retina-style DPR) via CDP emulation.',
      parameters: Type.Object({
        width: Type.Number(),
        height: Type.Number(),
        deviceScaleFactor: Type.Optional(Type.Number({ description: 'e.g. 2 or 3 for mobile-density screenshots' })),
      }),
      run: async (s, p, resp) => {
        if (p.deviceScaleFactor !== undefined) {
          let cdp = emuSessions.get(s.page);
          if (!cdp) {
            cdp = await s.context.newCDPSession(s.page);
            emuSessions.set(s.page, cdp);
          }
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: p.width, height: p.height, deviceScaleFactor: p.deviceScaleFactor, mobile: false,
          });
          resp.addResult(`Viewport ${p.width}x${p.height} @${p.deviceScaleFactor}x (CDP override).`);
        } else {
          await s.page.setViewportSize({ width: p.width, height: p.height });
          resp.addResult(`Viewport ${p.width}x${p.height}.`);
        }
      },
    }),
  ];
}
