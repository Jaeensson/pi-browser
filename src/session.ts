import { chromium, type BrowserContext, type ConsoleMessage, type Page, type Route } from 'playwright';
import { NotLaunchedError } from './errors';
import { installChromium, normalizeLaunchOptions, type LaunchOptions } from './launch';
import { RefStore } from './snapshot';

const LEVELS = { debug: 0, info: 1, warning: 2, error: 3 } as const;
const STATIC_TYPES = new Set(['image', 'font', 'stylesheet', 'media', 'manifest', 'other']);
export const ACTION_TIMEOUT_MS = 10_000;
export const NAV_TIMEOUT_MS = 30_000;

type ConsoleEntry = { level: string; text: string };
type NetworkEntry = { method: string; url: string; type: string; status?: number };
export type RouteMock = { status?: number; body?: string; contentType?: string; headers?: string[] };

export class BrowserSession {
  private _context: BrowserContext | null = null;
  private _active: Page | null = null;
  private _store = new RefStore();
  private consoleBuf: ConsoleEntry[] = [];
  private networkBuf = new Map<string, NetworkEntry>();
  private modal: string | null = null;
  private seq = 0;
  routes = new Map<string, { mock: RouteMock; installed: boolean }>();

  get active() { return this._context !== null; }
  get context() { if (!this._context) throw new NotLaunchedError(); return this._context; }
  get page() { if (!this._active) throw new NotLaunchedError(); return this._active; }
  get store() { return this._store; }

  pages(): Page[] { return this.context.pages(); }
  pageByIndex(i: number): Page {
    const pages = this.pages();
    if (i < 0 || i >= pages.length) throw new Error(`No tab at index ${i}. Use browser_tabs list (0–${pages.length - 1}).`);
    return pages[i];
  }
  setActive(p: Page) { this._active = p; }
  async ensurePage(): Promise<Page> {
    if (this.pages().length === 0) this.setActive(await this.context.newPage());
    return this.page;
  }

  async launch(opts: LaunchOptions, cwd: string, onProgress?: (m: string) => void): Promise<void> {
    if (this._context) await this.disconnect();
    const norm = normalizeLaunchOptions(opts, cwd);
    const base = {
      headless: norm.headless,
      colorScheme: norm.colorScheme,
      handleSIGINT: false,
      handleSIGTERM: false,
      ...(norm.deviceProps ?? {}),
      viewport: norm.viewport,
    };
    let context: BrowserContext;
    try {
      context = await chromium.launchPersistentContext(norm.profileDir, base);
    } catch (e: any) {
      if (!/Executable doesn't exist/i.test(String(e?.message))) throw e;
      onProgress?.('Chromium build missing — downloading via `playwright install chromium`…');
      await installChromium(onProgress);
      context = await chromium.launchPersistentContext(norm.profileDir, base);
    }
    this._context = context;
    this.wire(context);
    const first = context.pages()[0] ?? await context.newPage();
    this._active = first;
  }

  private wire(context: BrowserContext) {
    context.on('page', p => this.attach(p));
    for (const p of context.pages()) this.attach(p);
    context.on('response', res => {
      // map key mirrors recordRequest; responses arrive after their request entry
      const found = this.networkBuf.get(this.keyOf(res.request().url(), res.request().method()));
      if (found) found.status = res.status();
    });
    context.on('request', req => this.recordRequest(req.url(), req.method(), req.resourceType()));
  }

  private keyOf(url: string, method: string) { return `${method} ${url}`; }
  private recordRequest(url: string, method: string, type: string) {
    this.networkBuf.set(this.keyOf(url, method), { method, url, type });
  }

  attach(p: Page) {
    // Playwright reports console.log/dirxml/table as type 'log'/'dirxml'/'table' —
    // fold them into the debug/info levels the LEVELS filter understands.
    p.on('console', (m: ConsoleMessage) => {
      const lvl = ({ log: 'info', dirxml: 'info', table: 'info', trace: 'debug' } as any)[m.type()] ?? m.type();
      this.consoleBuf.push({ level: lvl, text: m.text() });
    });
    p.on('pageerror', e => this.consoleBuf.push({ level: 'error', text: String(e) }));
    p.on('dialog', async d => {
      this.modal = `${d.type()}: ${d.message()} (auto-dismissed)`;
      await d.dismiss().catch(() => {});
    });
    p.on('framenavigated', f => { if (f === p.mainFrame()) this.invalidate(); });
    p.on('close', () => {
      if (this._active === p) this._active = this._context?.pages()[0] ?? null;
    });
  }

  invalidate() {
    this.consoleBuf = [];
    this.networkBuf.clear();
    this.modal = null;
    this._store.clear();
  }

  consoleEntries(minLevel?: keyof typeof LEVELS): ConsoleEntry[] {
    const min = minLevel ? LEVELS[minLevel] : 1; // default info
    return this.consoleBuf.filter(e => (LEVELS as any)[e.level] >= min);
  }

  networkEntries(opts?: { filter?: string; includeStatic?: boolean }): NetworkEntry[] {
    let entries = [...this.networkBuf.values()];
    if (!opts?.includeStatic) entries = entries.filter(e => !STATIC_TYPES.has(e.type));
    if (opts?.filter) entries = entries.filter(e => new RegExp(opts.filter!, 'i').test(e.url));
    return entries;
  }

  takeModal(): string | null { const m = this.modal; this.modal = null; return m; }

  async installRoute(pattern: string, mock: RouteMock): Promise<void> {
    this.routes.set(pattern, { mock, installed: true });
    await this.context.route(pattern, async (route: Route) => {
      const m = this.routes.get(pattern)?.mock;
      if (!m) return route.fallback();
      await route.fulfill({
        status: m.status ?? 200,
        contentType: m.contentType ?? 'text/plain',
        body: m.body ?? '',
        headers: m.headers?.length ? Object.fromEntries(m.headers.map(h => { const i = h.indexOf(':'); return [h.slice(0, i).trim(), h.slice(i + 1).trim()]; })) : undefined,
      });
    });
  }

  async uninstallRoute(pattern?: string): Promise<void> {
    if (pattern) {
      this.routes.delete(pattern);
      await this.context.unroute(pattern);
    } else {
      for (const p of this.routes.keys()) await this.context.unroute(p);
      this.routes.clear();
    }
  }

  async disconnect(): Promise<void> {
    const ctx = this._context;
    this._context = null;
    this._active = null;
    this.invalidate();
    this.seq++;
    if (ctx) await ctx.close().catch(() => {});
  }
}
