import { chrom } from './helpers/test-browser';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { expect as pwExpect } from 'playwright/test';
import { RefStore, captureAccessibility, parseAriaSnapshot, type AXNode } from '../src/snapshot';
import { FIXTURE_HTML, installFixture, FIXTURE_URL } from './helpers/fixture';

describe('RefStore', () => {
  it('assigns stable incrementing refs and counts occurrences', () => {
    const store = new RefStore();
    const r1 = store.assign('button', 'Save');
    const r2 = store.assign('button', 'Save');
    const r3 = store.assign('button', 'Cancel');
    expect(store.get(r1)).toMatchObject({ role: 'button', name: 'Save', occurrence: 0 });
    expect(store.get(r2)).toMatchObject({ occurrence: 1 });
    expect(store.get(r3)).toMatchObject({ occurrence: 0 });
    expect(new Set([r1, r2, r3]).size).toBe(3);
  });

  it('captures and annotates the fixture page; resolve() returns a working locator', async () => {
    const { context, close } = await chrom.launchTestContext();
    const page: Page = await context.newPage();
    await installFixture(context);
    await page.goto(FIXTURE_URL);

    const store = new RefStore();
    const yaml = await store.render(page);
    expect(yaml).toContain('[ref=');
    expect(yaml).toMatch(/button "Save" \[ref=e\d+\]/);

    const ref = yaml.match(/button "Save" \[ref=(e\d+)\]/)![1];
    const loc = await store.resolve(page, ref);
    await pwExpect(loc).toHaveCount(1);
    await loc.click();
    await pwExpect(page.locator('#status')).toBeVisible();
    await close();
  });

  it('render() prints text/prop lines verbatim without refs and never counts them (Ruling 7b)', async () => {
    const store = new RefStore();
    const yaml = await store.render({
      ariaSnapshot: async () => '- button "Save":\n  - /url: https://fixture.test/\n  - text: saved!',
    } as any);
    expect(yaml).toBe('- button "Save" [ref=e1]\n  - /url: https://fixture.test/\n  - text: saved!');
    expect(store.get('e2')).toBeUndefined(); // literal lines consumed no refs
  });

  it('render() prints colon-value leaves and unnamed elements verbatim, ref-free (ref fidelity)', async () => {
    const store = new RefStore();
    const yaml = await store.render({
      ariaSnapshot: async () => '- list:\n  - listitem: alpha\n  - listitem: beta\n- paragraph: paragraph text\n- button "Save"\n- button',
    } as any);
    // the leaf VALUES stay model-readable and nothing but the named button gets a ref
    expect(yaml).toBe('- list:\n  - listitem: alpha\n  - listitem: beta\n- paragraph: paragraph text\n- button "Save" [ref=e1]\n- button');
    for (const l of yaml.split('\n')) {
      if (/listitem:|paragraph:|^\s*- button$/.test(l)) expect(l).not.toContain('[ref=');
    }
    expect(store.get('e2')).toBeUndefined(); // literal lines consumed no refs
  });

  it('scoped snapshots resolve inside their scope, not a same-named sibling (scoped fidelity)', async () => {
    const { context, close } = await chrom.launchTestContext();
    const page: Page = await context.newPage();
    // two identical subtrees with same-named elements: document-wide resolution
    // would hit #list1's button (occurrence 0 document-wide) instead of #list2's
    await page.setContent('<ul id="list1"><li><button>Dup</button></li></ul><ul id="list2"><li><button>Dup</button></li></ul>');
    const store = new RefStore();
    const yaml = await store.render(page, '#list2');
    const ref = yaml.match(/button "Dup" \[ref=(e\d+)\]/)![1];
    const loc = await store.resolve(page, ref);
    await pwExpect(loc).toHaveText('Dup');
    // decisive: the resolved element lives INSIDE #list2, not its #list1 twin
    expect(await loc.evaluate(el => (el.closest('ul') as HTMLElement).id)).toBe('list2');
    // counterfactual (the pre-fix behavior): the same role/name/occurrence resolved
    // document-wide lands on the #list1 twin — proving the scope actually mattered
    const docWide = page.getByRole('button', { name: 'Dup', exact: true }).nth(0);
    expect(await docWide.evaluate(el => (el.closest('ul') as HTMLElement).id)).toBe('list1');
    await close();
  });

  it('resolve() throws StaleRefError with fresh snapshot for unknown refs', async () => {
    const { context, close } = await chrom.launchTestContext();
    const page = await context.newPage();
    await installFixture(context);
    await page.goto(FIXTURE_URL);
    const store = new RefStore();
    // no render yet → nothing to attach; the message must not promise a snapshot "below"
    await expect(store.resolve(page, 'e1')).rejects.toThrow(/re-call browser_snapshot to get fresh refs/);
    await store.render(page);
    try {
      await store.resolve(page, 'e999');
      expect.unreachable();
    } catch (e: any) {
      expect(e.name).toBe('StaleRefError');
      expect(e.freshSnapshot).toContain('[ref=');
    }
    await close();
  });

  it('resolve() throws StaleRefError when a known ref matches no element on the page', async () => {
    const { context, close } = await chrom.launchTestContext();
    const page = await context.newPage();
    await installFixture(context);
    await page.goto(FIXTURE_URL);
    const store = new RefStore();
    await store.render(page);
    const ghost = store.assign('button', 'Vanished Button');
    try {
      await store.resolve(page, ghost);
      expect.unreachable();
    } catch (e: any) {
      expect(e.name).toBe('StaleRefError');
      expect(e.freshSnapshot).toContain('[ref=');
    }
    await close();
  });

  it('captureAccessibility returns the fixture page accessibility tree', async () => {
    const { context, close } = await chrom.launchTestContext();
    const page = await context.newPage();
    await installFixture(context);
    await page.goto(FIXTURE_URL);
    const tree = await captureAccessibility(page);
    expect(tree).toBeTruthy();
    expect(JSON.stringify(tree)).toContain('button');
    await close();
  });
});

describe('parseAriaSnapshot (pure, no browser)', () => {
  it('parses a whole-key single-quoted name containing ": " (and " #")', () => {
    const roots = parseAriaSnapshot("- 'button \"Save: Draft\"'");
    expect(roots).toHaveLength(1);
    expect(roots[0]).toEqual({ role: 'button', name: 'Save: Draft' });
    const hash = parseAriaSnapshot("- 'link \"Docs #draft\"'");
    expect(hash[0]).toEqual({ role: 'link', name: 'Docs #draft' });
  });

  it('emits ref-free literal nodes for /url: and /placeholder: prop lines', () => {
    const roots = parseAriaSnapshot([
      '- link "Home":',
      '  - /url: https://example.com',
      '- textbox "Email":',
      '  - /placeholder: you@example.com',
    ].join('\n'));
    expect(roots.map(n => n.role)).toEqual(['link', 'textbox']);
    expect(roots[0]!.children).toEqual([{ role: 'text', noRef: true, line: '/url: https://example.com' }]);
    expect(roots[1]!.children).toEqual([{ role: 'text', noRef: true, line: '/placeholder: you@example.com' }]);
  });

  it('emits a ref-free literal node for a bare text-value line', () => {
    expect(parseAriaSnapshot('- text: saved!')).toEqual([{ role: 'text', noRef: true, line: 'text: saved!' }]);
    const roots = parseAriaSnapshot('- generic "Status":\n  - text: saved!');
    expect(roots).toHaveLength(1);
    expect(roots[0]).toEqual({ role: 'generic', name: 'Status', children: [{ role: 'text', noRef: true, line: 'text: saved!' }] });
  });

  it('emits ref-free literal nodes for colon-value leaves and unnamed elements (ref fidelity)', () => {
    // ariaSnapshot serializes text-bearing leaves as `- role: value` and nameless
    // elements bare. Neither may consume a ref or drop its text.
    const roots = parseAriaSnapshot('- list:\n  - listitem: alpha\n  - listitem: beta\n- paragraph: paragraph text\n- button "Save"\n- button');
    expect(roots[0]).toEqual({
      role: 'list', noRef: true, line: 'list:',
      children: [
        { role: 'listitem', noRef: true, line: 'listitem: alpha' },
        { role: 'listitem', noRef: true, line: 'listitem: beta' },
      ],
    });
    expect(roots[1]).toEqual({ role: 'paragraph', noRef: true, line: 'paragraph: paragraph text' });
    expect(roots[2]).toEqual({ role: 'button', name: 'Save' }); // named → ref-able
    expect(roots[3]).toEqual({ role: 'button', noRef: true, line: 'button' }); // unnamed → no ref
    const store = new RefStore();
    const refs: (string | null)[] = [];
    const walk = (n: AXNode) => {
      refs.push(n.noRef ? null : store.assign(n.role, n.name ?? ''));
      for (const c of n.children ?? []) walk(c);
    };
    roots.forEach(walk);
    // only the named "Save" button consumed a ref
    expect(refs).toEqual([null, null, null, null, 'e1', null]);
  });

  it('keeps multi-root snapshots unwrapped (no fragment wrapper node)', () => {
    const roots = parseAriaSnapshot('- heading "Title" [level=1]\n- button "Go"');
    expect(roots.map(n => n.role)).toEqual(['heading', 'button']);
    expect(roots.every(n => n.role !== 'fragment')).toBe(true);
  });

  it('unescapes doubled single quotes inside a whole-key quoted name', () => {
    const roots = parseAriaSnapshot("- 'button \"it''s here\"'");
    expect(roots).toHaveLength(1);
    expect(roots[0]).toEqual({ role: 'button', name: "it's here" });
  });

  it('preserves duplicate role+name nodes in document order for occurrence counting', () => {
    const roots = parseAriaSnapshot('- button "Save"\n- button "Save"\n- button "Cancel"');
    expect(roots.map(n => `${n.role}:${n.name}`)).toEqual(['button:Save', 'button:Save', 'button:Cancel']);
    const store = new RefStore();
    const refs = roots.map(n => store.assign(n.role, n.name ?? ''));
    expect(store.get(refs[0])).toMatchObject({ occurrence: 0 });
    expect(store.get(refs[1])).toMatchObject({ occurrence: 1 });
    expect(store.get(refs[2])).toMatchObject({ role: 'button', name: 'Cancel', occurrence: 0 });
  });

  it('parses [checked]/[disabled] flags and ignores [level=N]', () => {
    const roots = parseAriaSnapshot([
      '- checkbox "Terms" [checked]',
      '- checkbox "Other" [disabled]',
      '- heading "Doc" [level=3]',
      '- textbox "Mix" [checked=mixed]',
      "- 'checkbox \"a: b\" [checked]'",
    ].join('\n'));
    expect(roots[0]).toEqual({ role: 'checkbox', name: 'Terms', checked: true });
    expect(roots[1]).toEqual({ role: 'checkbox', name: 'Other', disabled: true });
    expect(roots[2]).toEqual({ role: 'heading', name: 'Doc' });
    expect(roots[3]).toEqual({ role: 'textbox', name: 'Mix', checked: 'mixed' });
    expect(roots[4]).toEqual({ role: 'checkbox', name: 'a: b', checked: true });
  });
});
