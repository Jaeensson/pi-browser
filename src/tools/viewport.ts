import { Type } from 'typebox';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

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
          const cdp = await s.context.newCDPSession(s.page);
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
