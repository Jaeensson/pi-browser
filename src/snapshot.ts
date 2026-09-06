import type { Locator, Page } from 'playwright';
import { StaleRefError } from './errors';

export type AXNode = {
  role: string;
  name?: string;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  children?: AXNode[];
};
export type RefInfo = { ref: string; role: string; name: string; occurrence: number };

// page.accessibility.snapshot was removed from Playwright; ariaSnapshot() is its
// successor. It serializes to YAML, so we parse it back into the same AXNode tree
// shape the ref store was designed around (role/name/checked/disabled/children).
export async function captureAccessibility(page: Page, selector?: string): Promise<AXNode | null> {
  const yaml = selector
    ? await page.locator(selector).first().ariaSnapshot()
    : await page.ariaSnapshot();
  return parseAriaSnapshot(yaml);
}

function parseNodeLine(rest: string): AXNode {
  const role = /^[^ ":]+/.exec(rest)?.[0] ?? 'generic';
  let i = role.length;
  if (rest[i] === ' ') i++;
  let name: string | undefined;
  if (rest[i] === '"') {
    let raw = '';
    i++;
    while (i < rest.length && rest[i] !== '"') {
      if (rest[i] === '\\' && i + 1 < rest.length) i++;
      raw += rest[i++];
    }
    name = raw;
  }
  const node: AXNode = { role };
  if (name) node.name = name;
  // flags precede any ": value" suffix; only checked/disabled matter to the store
  const tail = rest.slice(i).split(':')[0] ?? '';
  for (const f of tail.matchAll(/\[([a-z-]+)(?:=([^\]]*))?\]/g)) {
    if (f[1] === 'checked') node.checked = f[2] === 'mixed' ? 'mixed' : true;
    else if (f[1] === 'disabled') node.disabled = true;
  }
  return node;
}

function parseAriaSnapshot(yaml: string): AXNode | null {
  const lines = yaml.split('\n').filter(l => l.trim() !== '');
  let pos = 0;
  const parseLevel = (indent: number): AXNode[] => {
    const nodes: AXNode[] = [];
    while (pos < lines.length) {
      const m = /^( *)- (.*)$/.exec(lines[pos]);
      if (!m || m[1].length < indent) break;
      pos++;
      const node = parseNodeLine(m[2]);
      const children = parseLevel(m[1].length + 2);
      if (children.length > 0) node.children = children;
      nodes.push(node);
    }
    return nodes;
  };
  const roots = parseLevel(0);
  if (roots.length === 0) return null;
  // a full-page snapshot has sibling roots and no WebArea-style root; keep one tree
  return roots.length === 1 ? roots[0]! : { role: 'fragment', children: roots };
}

export class RefStore {
  private byRef = new Map<string, RefInfo>();
  private counts = new Map<string, number>();
  private counter = 0;

  assign(role: string, name: string): string {
    const key = `${role}\u0000${name}`;
    const occurrence = this.counts.get(key) ?? 0;
    this.counts.set(key, occurrence + 1);
    const ref = `e${++this.counter}`;
    this.byRef.set(ref, { ref, role, name, occurrence });
    return ref;
  }

  get(ref: string): RefInfo | undefined { return this.byRef.get(ref); }
  clear() { this.byRef.clear(); this.counts.clear(); this.counter = 0; }

  resolve(page: Page, ref: string): Locator {
    const info = this.byRef.get(ref);
    if (!info) this.throwStale(page, ref);
    const locator = page.getByRole(info!.role as any, { name: info!.name || undefined, exact: true }).nth(info!.occurrence);
    // count() is a heuristic liveness check; Playwright re-resolves at action time.
    const check = locator.count().then(c => { if (c <= info!.occurrence) this.throwStale(page, ref); });
    // resolve returns the locator synchronously; staleness with a live page is re-thrown at action time.
    void check.catch(() => {});
    return locator;
  }

  private throwStale(page: Page, ref: string): never {
    throw new StaleRefError(this.renderSyncCache ?? '', ref);
  }

  private renderSyncCache = '';

  async render(page: Page, selector?: string): Promise<string> {
    const tree = await captureAccessibility(page, selector);
    const lines: string[] = [];
    // fresh store per render keeps occurrence counts consistent with what is on screen
    this.clear();
    const walk = (node: AXNode | null, depth: number): void => {
      if (!node) return;
      const ref = this.assign(node.role, node.name ?? '');
      const flags: string[] = [];
      if (node.checked === 'mixed') flags.push('[mixed]');
      else if (node.checked === true) flags.push('[checked]');
      if (node.disabled) flags.push('[disabled]');
      const label = node.name ? ` "${node.name}"` : '';
      lines.push(`${'  '.repeat(depth)}- ${node.role}${label}${flags.length ? ' ' + flags.join(' ') : ''} [ref=${ref}]`);
      for (const child of node.children ?? []) walk(child, depth + 1);
    };
    walk(tree, 0);
    this.renderSyncCache = lines.join('\n');
    return this.renderSyncCache;
  }
}
