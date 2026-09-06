import { Type } from 'typebox';
import { normalizeUrl } from '../launch';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

export function makeTabsTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_tabs',
      label: 'Tabs',
      description: 'List, open, switch, or close tabs.',
      parameters: Type.Object({
        action: Type.String({ description: 'list | new | select | close' }),
        index: Type.Optional(Type.Number({ description: 'for select/close' })),
        url: Type.Optional(Type.String({ description: 'for new' })),
      }),
      run: async (s, p, resp) => {
        if (p.action === 'list') {
          const pages = s.pages();
          resp.addResult(pages.length
            ? pages.map((pg, i) => `${i === pages.indexOf(s.page) ? '*' : ' '} ${i}: ${pg.url()}`).join('\n')
            : '(no tabs)');
          return;
        }
        if (p.action === 'new') {
          const page = await s.context.newPage();
          s.setActive(page);
          if (p.url) await page.goto(normalizeUrl(p.url), { waitUntil: 'load' });
          resp.addResult(`Opened new tab${p.url ? ` at ${page.url()}` : ''}.`);
          return;
        }
        if (p.action === 'select') {
          if (p.index === undefined) throw new Error('select requires index (see browser_tabs list).');
          s.setActive(s.pageByIndex(p.index));
          resp.addResult(`Active tab: ${s.page.url()}.`);
          return;
        }
        if (p.action === 'close') {
          const pages = s.pages();
          const target = p.index !== undefined ? s.pageByIndex(p.index) : s.page;
          await target.close();
          resp.addResult(`Closed tab. ${pages.length - 1} remaining.`);
        }
      },
    }),
  ];
}
