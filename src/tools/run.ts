import { Type } from 'typebox';
import { BrowserError } from '../errors';
import { spillToTempFile, PI_MAX_BYTES } from '../response';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';

const RUN_TIMEOUT_MS = () => Number(process.env.PI_DEV_BROWSER_RUN_TIMEOUT_MS ?? 30_000);

export function makeRunTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_run',
      label: 'Run JS',
      description:
        'Escape hatch: run a short async JS body with {page, context, browser} in scope (full Playwright Page API: ' +
        'setInputFiles, mouse, cookies, …). Return a JSON-serializable value. 30s limit; large output saved to file. Not a security sandbox.',
      parameters: Type.Object({
        code: Type.String({ description: 'Async JS body, e.g. "await page.setViewportSize({width:800,height:600}); return await page.title();"' }),
      }),
      omitSnapshot: true,
      run: async (s, p, resp) => {
        const page = s.page;
        const context = s.context;
        const browser = context.browser();
        // eslint-disable-next-line no-new-func
        const fn = new Function('page', 'context', 'browser', `'use strict'; return (async () => {\n${p.code}\n})()`);
        let value: unknown;
        const user = fn(page, context, browser);
        user.catch(() => {}); // keep post-timeout rejections (e.g. browser closed) from becoming unhandled
        try {
          value = await Promise.race([
            user,
            // BrowserError so tools/factory maps the timeout to an isError result instead of rethrowing.
            new Promise((_, rej) => setTimeout(() => rej(new BrowserError(`browser_run timed out after ${RUN_TIMEOUT_MS() / 1000}s.`)), RUN_TIMEOUT_MS())),
          ]);
        } catch (e: any) {
          resp.omitSnapshot();
          if (e instanceof BrowserError) throw e;
          throw Object.assign(new Error(e?.message ?? String(e)), { fatal: false });
        }
        const out = typeof value === 'string' ? value : JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? String(v) : v), 2);
        if (out !== undefined && out.length > PI_MAX_BYTES) {
          const { path } = spillToTempFile(out);
          resp.addResult(`Output too large (${out.length} bytes). saved to: ${path}`);
        } else {
          resp.addResult(out === undefined ? 'undefined' : out);
        }
      },
    }),
  ];
}
