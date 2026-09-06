import type { Locator, Page } from 'playwright';
import { StaleRefError } from './errors';

export type AXNode = {
  role: string;
  name?: string;
  checked?: boolean | 'mixed';
  disabled?: boolean;
  /** Ref-free literal line (bare text value or /prop:): rendered verbatim, never
   *  assigned a ref, never resolvable. `line` holds the content after "- ". */
  noRef?: true;
  line?: string;
  children?: AXNode[];
};
export type RefInfo = { ref: string; role: string; name: string; occurrence: number };

// page.accessibility.snapshot was removed from Playwright; ariaSnapshot() is its
// successor. It serializes to YAML, so we parse it back into the same AXNode tree
// shape the ref store was designed around (role/name/checked/disabled/children).
export async function captureAccessibility(page: Page, selector?: string): Promise<AXNode | null> {
  const roots = parseAriaSnapshot(await ariaYaml(page, selector));
  if (roots.length === 0) return null;
  // Multi-root snapshots need one AXNode per this function's signature. 'fragment'
  // is a pure type adapter here; the ref store walks parseAriaSnapshot's root list
  // directly, so a wrapper node is never walked and never assigned a ref.
  return roots.length === 1 ? roots[0]! : { role: 'fragment', children: roots };
}

async function ariaYaml(page: Page, selector?: string): Promise<string> {
  return selector ? await page.locator(selector).first().ariaSnapshot() : await page.ariaSnapshot();
}

// prop lines (/url:, /placeholder:, …) and bare text-value lines (text: …) are not
// elements — they cannot resolve via getByRole, so they get no ref. They are kept as
// noRef literal nodes so render() still shows them (Ruling 7b: visible page text must
// stay model-readable); the store never assigns or counts them.
const NON_ELEMENT_LINE = /^(?:\/[^\s:]*:|text:)/;

function parseNodeLine(rest: string): AXNode | null {
  if (NON_ELEMENT_LINE.test(rest)) return { role: 'text', noRef: true, line: rest };
  // YAML single-quotes the whole key (doubling any inner ') when the accessible
  // name forces it: - 'button "Save: Draft"' — also for ' #', {, }, `. Strip the
  // wrapper, unescape '', then re-parse the inner key: role + quoted name + flags.
  if (rest.startsWith("'")) {
    let j = 1;
    let inner = '';
    while (j < rest.length) {
      if (rest[j] === "'") {
        if (rest[j + 1] === "'") { inner += "'"; j += 2; continue; }
        break;
      }
      inner += rest[j++];
    }
    return parseNodeLine(inner);
  }
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

/** Pure ariaSnapshot-YAML → AXNode parser. Returns the root nodes — multi-root
 *  snapshots stay unwrapped (no fragment node) — with prop and bare text-value
 *  lines emitted as noRef literal nodes (rendered verbatim, never ref'd).
 *  Exported for unit tests. */
export function parseAriaSnapshot(yaml: string): AXNode[] {
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
      if (!node) continue; // prop/text-value line: never has children in ariaSnapshot
      if (children.length > 0) node.children = children;
      nodes.push(node);
    }
    return nodes;
  };
  return parseLevel(0);
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

  async resolve(page: Page, ref: string): Promise<Locator> {
    const info = this.byRef.get(ref);
    if (!info) this.throwStale(page, ref);
    const locator = page.getByRole(info!.role as any, { name: info!.name || undefined, exact: true }).nth(info!.occurrence);
    // awaited liveness check: a ref that no longer matches enough elements must
    // surface as StaleRefError (with the last-rendered snapshot), never as a raw
    // action timeout.
    const count = await locator.count();
    if (count <= info!.occurrence) this.throwStale(page, ref);
    return locator;
  }

  private throwStale(page: Page, ref: string): never {
    throw new StaleRefError(this.renderSyncCache ?? '', ref);
  }

  private renderSyncCache = '';

  async render(page: Page, selector?: string): Promise<string> {
    const roots = parseAriaSnapshot(await ariaYaml(page, selector));
    const lines: string[] = [];
    // fresh store per render keeps occurrence counts consistent with what is on screen
    this.clear();
    const walk = (node: AXNode, depth: number): void => {
      const indent = '  '.repeat(depth);
      if (node.noRef) {
        // ref-free literal line (text value or /prop:): visible in the snapshot but
        // unresolvable by design — no [ref=…], no store entry (Ruling 7b)
        lines.push(`${indent}- ${node.line}`);
      } else {
        const ref = this.assign(node.role, node.name ?? '');
        const flags: string[] = [];
        if (node.checked === 'mixed') flags.push('[mixed]');
        else if (node.checked === true) flags.push('[checked]');
        if (node.disabled) flags.push('[disabled]');
        const label = node.name ? ` "${node.name}"` : '';
        lines.push(`${indent}- ${node.role}${label}${flags.length ? ' ' + flags.join(' ') : ''} [ref=${ref}]`);
      }
      for (const child of node.children ?? []) walk(child, depth + 1);
    };
    for (const root of roots) walk(root, 0);
    this.renderSyncCache = lines.join('\n');
    return this.renderSyncCache;
  }
}
