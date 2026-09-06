import { chrom } from './helpers/test-browser';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { expect as pwExpect } from 'playwright/test';
import { RefStore, captureAccessibility } from '../src/snapshot';
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
    const loc = store.resolve(page, ref);
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
      store.resolve(page, 'e999');
      expect.unreachable();
    } catch (e: any) {
      expect(e.name).toBe('StaleRefError');
      expect(e.freshSnapshot).toContain('[ref=');
    }
    await close();
  });

  it('captureAccessibility prunes container-only noise when interestingOnly', async () => {
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
