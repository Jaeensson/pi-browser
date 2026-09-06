import { chromium } from 'playwright';

export const chrom = {
  async launchTestContext() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    return { browser, context,
      async close() { await context.close(); await browser.close(); },
    };
  },
};
