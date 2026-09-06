import { Type } from 'typebox';
import { browserTool, type BrowserTool } from './factory';
import type { BrowserSession } from '../session';
import { resolveTarget } from './resolve';

export function makeObserveTools(session: BrowserSession): BrowserTool[] {
  return [
    browserTool(session, {
      name: 'browser_snapshot',
      label: 'Page snapshot',
      description:
        'Capture the accessibility tree with stable [ref=eN] element refs. Use refs for browser_click/type/fill_form. ' +
        'Action tools already include a fresh snapshot — call this only to find refs or re-observe.',
      promptGuidelines: [
        'Prefer acting on refs from the latest browser_snapshot; do not call browser_snapshot to confirm an action result (it is already included).',
      ],
      parameters: Type.Object({
        selector: Type.Optional(Type.String({ description: 'CSS selector to scope the snapshot to a subtree' })),
      }),
      run: async (s, params, resp) => {
        resp.includeSnapshot(params.selector); // explicit scope overrides default
        resp.addResult(params.selector ? `Snapshot scoped to "${params.selector}".` : 'Captured page snapshot.');
      },
    }),
    browserTool(session, {
      name: 'browser_take_screenshot',
      label: 'Screenshot',
      description: 'Take a screenshot (returned as an image). Use browser_snapshot for interaction; screenshots for visual inspection.',
      parameters: Type.Object({
        fullPage: Type.Optional(Type.Boolean({ description: 'Capture the full scrollable page' })),
        ref: Type.Optional(Type.String({ description: 'Element ref from the last snapshot' })),
        selector: Type.Optional(Type.String({ description: 'CSS selector of element to screenshot' })),
        type: Type.Optional(Type.String({ description: '"png" (default) or "jpeg"' })),
      }),
      omitSnapshot: true,
      run: async (s, params, resp) => {
        const page = s.page;
        const mime = params.type === 'jpeg' ? 'image/jpeg' as const : 'image/png' as const;
        if (params.ref || params.selector) {
          const loc = await resolveTarget(s, params);
          resp.attachImage(await loc.screenshot({ type: mime === 'image/jpeg' ? 'jpeg' : 'png' }), mime);
        } else {
          resp.attachImage(await page.screenshot({ fullPage: !!params.fullPage, type: mime === 'image/jpeg' ? 'jpeg' : 'png' }), mime);
        }
        resp.addResult(fullDescribe(params));
      },
    }),
  ];
}

function fullDescribe(params: any): string {
  const what = params.ref ? `element ${params.ref}` : params.selector ? `element matching "${params.selector}"` : params.fullPage ? 'full page' : 'viewport';
  return `Screenshot of ${what} captured.`;
}
