import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Page } from 'playwright';
import type { RefStore } from './snapshot';

export const PI_MAX_BYTES = 50 * 1024;

export type PiToolResult = {
  content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>;
  details: Record<string, unknown>;
};

export function spillToTempFile(text: string): { path: string; size: number } {
  const dir = join(tmpdir(), 'pi-dev-browser');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `spill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  writeFileSync(path, text);
  return { path, size: text.length };
}

export class BrowserResponse {
  private results: string[] = [];
  private code: string[] = [];
  private modal: string | null = null;
  private image: { data: Buffer; mime: 'image/png' | 'image/jpeg' } | null = null;
  private snapshotSelector: string | undefined | null = undefined; // undefined = default include; null = omit

  addResult(line: string) { this.results.push(line); }
  addCode(line: string) { this.code.push(line); }
  setModal(text: string) { this.modal = text; }
  attachImage(data: Buffer, mime: 'image/png' | 'image/jpeg') { this.image = { data, mime }; }
  includeSnapshot(selector?: string) { this.snapshotSelector = selector ?? ''; }
  omitSnapshot() { this.snapshotSelector = null; }
  /** test hook */
  get _code() { return this.code; }
  set _code(v: string[]) { this.code = v; }

  async build(deps: {
    page: Pick<Page, 'url'> & { title(): Promise<string> } | null;
    store: Pick<RefStore, 'render'> | null;
    takeModal: () => string | null;
  }): Promise<PiToolResult> {
    const sections: string[] = [];

    if (this.results.length) sections.push(`### Result\n${this.results.join('\n')}`);
    if (this.code.length) sections.push(`### Ran Playwright code\n\`\`\`js\n${this.code.join('\n')}\n\`\`\``);
    if (deps.page) {
      const title = await deps.page.title().catch(() => '');
      sections.push(`### Page\n- Page URL: ${deps.page.url()}\n- Page Title: ${title}`);
    }
    const modal = deps.takeModal();
    if (modal) sections.push(`### Modal state\n- ${modal} — use browser_run(page.once('dialog', …)) to change handling`);
    if (this.snapshotSelector !== null && deps.store && deps.page) {
      const snap = await deps.store.render(deps.page, this.snapshotSelector || undefined);
      if (snap.length > PI_MAX_BYTES) {
        const { path } = spillToTempFile(snap);
        sections.push(`### Snapshot\n${snap.slice(0, PI_MAX_BYTES)}\n\n[Snapshot truncated (${snap.length} bytes). Full snapshot saved to: ${path} — re-call browser_snapshot with a selector to scope.]`);
      } else {
        sections.push(`### Snapshot\n${snap}`);
      }
    }

    const content: PiToolResult['content'] = [];
    if (sections.length) content.push({ type: 'text', text: sections.join('\n\n') });
    if (this.image) content.push({ type: 'image', data: this.image.data.toString('base64'), mimeType: this.image.mime });
    return { content, details: {} };
  }
}
