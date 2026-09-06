import { Type } from 'typebox';
import { BrowserError } from '../errors';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';
import { resolveTarget } from './resolve';

export function makeInspectTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_evaluate',
      label: 'Evaluate JS',
      description: 'Run a JS function string on the page (or on a single element when ref/selector given). Returns JSON.',
      parameters: Type.Object({
        function: Type.String({ description: 'e.g. "() => document.title" or "(el) => el.textContent"' }),
        ref: Type.Optional(Type.String()),
        selector: Type.Optional(Type.String()),
      }),
      run: async (s, p, resp) => {
        let value: unknown;
        // Playwright 1.63 does not auto-invoke function-valued string expressions and
        // gives string expressions no `element` binding — recreate via in-page eval and
        // call it when the string evaluates to a function (element-bound on locators).
        if (p.ref || p.selector) {
          const loc = await resolveTarget(s, p);
          value = await loc.evaluate((el: any, src: string) => { const v = eval(src); return typeof v === 'function' ? v(el) : v; }, p.function);
        } else {
          value = await s.page.evaluate((src: string) => { const v = eval(src); return typeof v === 'function' ? v() : v; }, p.function);
        }
        resp.addResult(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
      },
    }),
    browserTool(session, {
      name: 'browser_console_messages',
      label: 'Console',
      description: 'Console messages since last navigation. Useful for debugging errors.',
      parameters: Type.Object({
        level: Type.Optional(Type.String({ description: 'debug | info (default) | warning | error — minimum level' })),
      }),
      run: async (s, p, resp) => {
        const level = p.level as any;
        if (p.level && !(level in { debug: 1, info: 1, warning: 1, error: 1 })) throw new BrowserError('level must be debug, info, warning, or error.');
        const entries = s.consoleEntries(level);
        resp.addResult(entries.length ? entries.map(e => `[${e.level.toUpperCase()}] ${e.text}`).join('\n') : 'No console messages.');
      },
    }),
    browserTool(session, {
      name: 'browser_network_requests',
      label: 'Network',
      description: 'Requests since last navigation. Static resources excluded unless includeStatic.',
      parameters: Type.Object({
        filter: Type.Optional(Type.String({ description: 'Regex on URL, e.g. "/api/.*user"' })),
        includeStatic: Type.Optional(Type.Boolean({ description: 'Include images, fonts, stylesheets' })),
      }),
      run: async (s, p, resp) => {
        const entries = s.networkEntries({ filter: p.filter, includeStatic: p.includeStatic });
        resp.addResult(entries.length
          ? entries.map(e => `[${e.status ?? '…'}] ${e.method} ${e.url} (${e.type})`).join('\n')
          : 'No matching requests.');
      },
    }),
    browserTool(session, {
      name: 'browser_route',
      label: 'Mock requests',
      description: 'Intercept requests matching a URL glob and fulfill with a mock. Great for stubbing dev APIs.',
      parameters: Type.Object({
        pattern: Type.String({ description: 'URL glob, e.g. "**/api/users"' }),
        status: Type.Optional(Type.Number()),
        body: Type.Optional(Type.String()),
        contentType: Type.Optional(Type.String()),
        headers: Type.Optional(Type.Array(Type.String(), { description: '"Name: Value" entries' })),
      }),
      run: async (s, p, resp) => {
        await s.installRoute(p.pattern, { status: p.status, body: p.body, contentType: p.contentType, headers: p.headers });
        resp.addResult(`Mocking ${p.pattern}.`);
      },
    }),
    browserTool(session, {
      name: 'browser_unroute',
      label: 'Remove mocks',
      description: 'Remove route mocks (all if no pattern).',
      parameters: Type.Object({ pattern: Type.Optional(Type.String()) }),
      run: async (s, p, resp) => {
        await s.uninstallRoute(p.pattern);
        resp.addResult(p.pattern ? `Removed mock ${p.pattern}.` : 'Removed all mocks.');
      },
    }),
  ];
}
