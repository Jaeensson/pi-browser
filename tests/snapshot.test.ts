import { chrom } from './helpers/test-browser';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { expect as pwExpect } from 'playwright/test';
import { RefStore, captureAccessibility, parseAriaSnapshot } from '../src/snapshot';
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

  it('resolve() throws StaleRefError with fresh snapshot for unknown refs', async () => {
    const { context, close } = await chrom.launchTestContext();
    const page = await context.newPage();
    await installFixture(context);
    await page.goto(FIXTURE_URL);
    const store = new RefStore();
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

  it('emits no nodes for /url: and /placeholder: prop lines', () => {
    const roots = parseAriaSnapshot([
      '- link "Home":',
      '  - /url: https://example.com',
      '- textbox "Email":',
      '  - /placeholder: you@example.com',
    ].join('\n'));
    expect(roots.map(n => n.role)).toEqual(['link', 'textbox']);
    expect(roots[0]!.children).toBeUndefined();
    expect(roots[1]!.children).toBeUndefined();
    expect(JSON.stringify(roots)).not.toContain('/url');
    expect(JSON.stringify(roots)).not.toContain('placeholder');
  });

  it('emits no node for a bare text-value line', () => {
    expect(parseAriaSnapshot('- text: saved!')).toEqual([]);
    const roots = parseAriaSnapshot('- generic "Status":\n  - text: saved!');
    expect(roots).toHaveLength(1);
    expect(roots[0]).toEqual({ role: 'generic', name: 'Status' });
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
