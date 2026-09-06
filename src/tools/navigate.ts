import { Type } from 'typebox';
import { normalizeUrl } from '../launch';
import { NAV_TIMEOUT_MS } from '../session';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

export function makeNavigateTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_navigate',
      label: 'Navigate',
      description: 'Navigate to a URL. Bare localhost:PORT gets http:// prepended.',
      parameters: Type.Object({ url: Type.String({ description: 'URL to navigate to' }) }),
      run: async (s, params, resp) => {
        const page = await s.ensurePage();
        const url = normalizeUrl(params.url);
        await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
        resp.addCode(`await page.goto('${url}')`);
      },
    }),
    browserTool(session, {
      name: 'browser_navigate_back',
      label: 'Go back',
      description: 'Go back to the previous page in history.',
      parameters: Type.Object({}),
      run: async (s, _p, resp) => {
        await s.page.goBack({ timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
        resp.addCode('await page.goBack()');
      },
    }),
    browserTool(session, {
      name: 'browser_reload',
      label: 'Reload',
      description: 'Reload the current page.',
      parameters: Type.Object({}),
      run: async (s, _p, resp) => {
        await s.page.reload({ timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
        resp.addCode('await page.reload()');
      },
    }),
  ];
}
