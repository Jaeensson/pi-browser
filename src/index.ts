import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { BrowserSession } from './session';
import { browserTool, type BrowserTool } from './tools/factory';
import { makeInteractTools } from './tools/interact';
import { makeInspectTools } from './tools/inspect';
import { makeNavigateTools } from './tools/navigate';
import { makeObserveTools } from './tools/observe';
import { makeRunTools } from './tools/run';
import { makeTabsTools } from './tools/tabs';
import { makeViewportTools } from './tools/viewport';
import { makeWaitTools } from './tools/wait';

export default function (pi: ExtensionAPI) {
  const session = new BrowserSession();
  (globalThis as any).__piDevBrowserSession = session; // test seam; harmless in production
  let registered = false;

  const registerCore = () => {
    if (registered) return;
    registered = true;
    // Populated incrementally by Tasks 8–14; ends at 19 entries.
    const core: BrowserTool[] = [
      ...makeNavigateTools(session),
      ...makeObserveTools(session),
      ...makeInteractTools(session),
      ...makeInspectTools(session),
      ...makeViewportTools(session),
      ...makeTabsTools(session),
      ...makeWaitTools(session),
      ...makeRunTools(session),
    ];
    for (const t of core) pi.registerTool(t as any);
  };

  pi.registerTool(browserTool(session, {
    name: 'browser_launch',
    label: 'Launch browser',
    description:
      'Launch the managed Chromium browser (headless by default; mode:"headed" to watch). ' +
      'Registers the full browser toolkit: browser_navigate/back/reload, browser_snapshot + ref-based ' +
      'browser_click/type/fill_form/hover, browser_take_screenshot, browser_evaluate, browser_console_messages, ' +
      'browser_network_requests, browser_route/unroute, browser_wait_for, browser_resize, browser_tabs, and the ' +
      'browser_run JavaScript escape hatch. Call this before any other browser_* tool.',
    promptGuidelines: [
      'Call browser_launch when the user asks to open, view, test, or debug a web page or dev server — the remaining browser_* tools become available after it.',
    ],
    parameters: Type.Object({
      mode: Type.Optional(Type.String({ description: '"headless" (default) or "headed"' })),
      device: Type.Optional(Type.String({ description: 'Playwright device preset, e.g. "iPhone 15" (full emulation: UA, DPR, touch)' })),
      viewport: Type.Optional(Type.Object({ width: Type.Number(), height: Type.Number() })),
      colorScheme: Type.Optional(Type.String({ description: '"light" or "dark"' })),
    }),
    omitSnapshot: true,
    requireLaunched: false,
    run: async (s, params, resp, onUpdate) => {
      await s.launch(params ?? {}, process.cwd(), onUpdate);
      registerCore();
      // Aspirational until Task 14 wires all core tools; registration.test tracks the real set.
      const names = ['browser_navigate', 'browser_navigate_back', 'browser_reload', 'browser_snapshot',
        'browser_take_screenshot', 'browser_click', 'browser_type', 'browser_press_key', 'browser_fill_form',
        'browser_hover', 'browser_evaluate', 'browser_console_messages', 'browser_network_requests',
        'browser_route', 'browser_unroute', 'browser_wait_for', 'browser_resize', 'browser_tabs', 'browser_run'];
      resp.addResult(`Launched Chromium (${params?.mode === 'headed' ? 'headed' : 'headless'}). Registered 19 tools:\n${names.join(', ')}`);
    },
  }) as any);

  pi.registerCommand('browser', {
    description: 'Browser: status | disconnect',
    handler: async (args, ctx) => {
      const sub = (args ?? '').trim().split(/\s+/)[0];
      if (sub === 'disconnect') { await session.disconnect(); await ctx.ui.notify('Browser disconnected.', 'info'); return; }
      const msg = session.active
        ? `Browser: connected\nTabs: ${session.pages().map((p, i) => `${i}: ${p.url()}`).join('\n') || '(none)'}`
        : 'Browser: not running (agent can call browser_launch)';
      await ctx.ui.notify(msg, 'info');
    },
  });

  pi.on('session_shutdown', async () => { await session.disconnect(); });
}
