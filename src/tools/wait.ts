import { Type } from 'typebox';
import { ACTION_TIMEOUT_MS } from '../session';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

export function makeWaitTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_wait_for',
      label: 'Wait for',
      description: 'Wait for: text to appear (text), disappear (textGone), a selector (selector / hidden), a load state (loadState: load|domcontentloaded|networkidle), or a fixed time (time seconds). Provide exactly one.',
      parameters: Type.Object({
        text: Type.Optional(Type.String()),
        textGone: Type.Optional(Type.String()),
        selector: Type.Optional(Type.String()),
        hidden: Type.Optional(Type.Boolean({ description: 'with selector: wait for it to be hidden/detached' })),
        loadState: Type.Optional(Type.String()),
        time: Type.Optional(Type.Number({ description: 'seconds' })),
      }),
      run: async (s, p, resp) => {
        // `hidden` is a modifier of `selector`, never a standalone choice.
        const given = ['text', 'textGone', 'selector', 'loadState', 'time'].filter(k => p[k] !== undefined);
        if (given.length !== 1 || (p.hidden !== undefined && !p.selector)) throw new Error('Provide exactly one of: text, textGone, selector (+optional hidden), loadState, time.');
        const page = s.page;
        if (p.text !== undefined) { await page.getByText(p.text).first().waitFor({ state: 'visible', timeout: ACTION_TIMEOUT_MS }); resp.addResult(`Text "${p.text}" appeared.`); }
        else if (p.textGone !== undefined) { await page.getByText(p.textGone).first().waitFor({ state: 'hidden', timeout: ACTION_TIMEOUT_MS }); resp.addResult(`Text "${p.textGone}" is gone.`); }
        else if (p.selector !== undefined) { await page.locator(p.selector).first().waitFor({ state: p.hidden ? 'hidden' : 'visible', timeout: ACTION_TIMEOUT_MS }); resp.addResult(`Selector ${p.selector} is ${p.hidden ? 'hidden' : 'visible'}.`); }
        else if (p.loadState !== undefined) { await page.waitForLoadState(p.loadState as any, { timeout: ACTION_TIMEOUT_MS }); resp.addResult(`Load state "${p.loadState}" reached.`); }
        else { await page.waitForTimeout(p.time * 1000); resp.addResult(`Waited ${p.time}s.`); }
      },
    }),
  ];
}
