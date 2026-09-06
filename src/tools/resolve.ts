import type { Locator } from 'playwright';
import { BrowserError } from '../errors';
import type { BrowserSession } from '../session';

export async function resolveTarget(session: BrowserSession, params: { ref?: string; selector?: string }): Promise<Locator> {
  if (params.ref) return await session.store.resolve(session.page, params.ref); // throws StaleRefError w/ fresh snapshot
  if (params.selector) return session.page.locator(params.selector);
  throw new BrowserError('Provide ref (preferred, from the latest snapshot) or selector.');
}
