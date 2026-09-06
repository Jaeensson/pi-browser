import { Type } from 'typebox';
import { normalizeUrl } from '../launch';
import { NAV_TIMEOUT_MS } from '../session';
import { abortable, browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

export function makeNavigateTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_navigate',
      label: 'Navigate',
      description: 'Navigate to a URL. Bare localhost:PORT gets http:// prepended.',
      parameters: Type.Object({ url: Type.String({ description: 'URL to navigate to' }) }),
      run: async (s, params, resp, _onUpdate, _ctx, signal) => {
        const page = await s.ensurePage();
        const url = normalizeUrl(params.url);
        // Playwright's goto has no AbortSignal input — the race rejects the tool
        // call on abort; the underlying navigation is then cut short by teardown.
        await abortable(page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' }), signal, 'browser_navigate aborted.');
        resp.addCode(`await page.goto('${url}')`);
      },
    }),
    browserTool(session, {
      name: 'browser_navigate_back',
      label: 'Go back',
      description: 'Go back to the previous page in history.',
      parameters: Type.Object({}),
      run: async (s, _p, resp, _onUpdate, _ctx, signal) => {
        await abortable(s.page.goBack({ timeout: NAV_TIMEOUT_MS, waitUntil: 'load' }), signal, 'browser_navigate_back aborted.');
        resp.addCode('await page.goBack()');
      },
    }),
    browserTool(session, {
      name: 'browser_reload',
      label: 'Reload',
      description: 'Reload the current page.',
      parameters: Type.Object({}),
      run: async (s, _p, resp, _onUpdate, _ctx, signal) => {
        await abortable(s.page.reload({ timeout: NAV_TIMEOUT_MS, waitUntil: 'load' }), signal, 'browser_reload aborted.');
        resp.addCode('await page.reload()');
      },
    }),
  ];
}
