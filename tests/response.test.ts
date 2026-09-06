import { describe, expect, it } from 'vitest';
import { BrowserResponse, PI_MAX_BYTES, spillToTempFile } from '../src/response';
import { readFileSync } from 'node:fs';

describe('BrowserResponse', () => {
  it('renders sections in order: Result, Page, Modal state, Snapshot', async () => {
    const resp = new BrowserResponse();
    resp.addResult('Clicked button');
    resp.addCode('await page.click(...)'); resp._code = []; // code only in details path below
    const result = await resp.build({
      page: { url: () => 'https://fixture.test/', title: async () => 'Fixture App' } as any,
      store: { render: () => '- button "Save" [ref=e1]' } as any,
      takeModal: () => 'alert: watch out (dismissed)',
    });
    const text = result.content.map(c => (c.type === 'text' ? c.text : '')).join('');
    const iResult = text.indexOf('### Result');
    const iPage = text.indexOf('### Page');
    const iModal = text.indexOf('### Modal state');
    const iSnap = text.indexOf('### Snapshot');
    expect(iResult).toBeGreaterThanOrEqual(0);
    expect(iPage).toBeGreaterThan(iResult);
    expect(iModal).toBeGreaterThan(iPage);
    expect(iSnap).toBeGreaterThan(iModal);
    expect(text).toContain('https://fixture.test/');
    expect(text).toContain('[ref=e1]');
    expect(text).toContain('dismissed');
  });
  it('attaches images as image content', async () => {
    const resp = new BrowserResponse();
    resp.attachImage(Buffer.from('png'), 'image/png');
    const result = await resp.build({ page: null, store: null, takeModal: () => null });
    const img = result.content.find(c => c.type === 'image') as any;
    expect(img.mimeType).toBe('image/png');
    expect(img.data).toBe(Buffer.from('png').toString('base64'));
  });
  it('spills oversized snapshots to a temp file with a pointer', async () => {
    const resp = new BrowserResponse();
    resp.includeSnapshot('huge');
    const result = await resp.build({
      page: { url: () => 'u', title: async () => 't' } as any,
      store: { render: () => '- line\n'.repeat(Math.ceil((PI_MAX_BYTES * 2) / 7)) } as any,
      takeModal: () => null,
    });
    const text = result.content.map(c => (c.type === 'text' ? c.text : '')).join('');
    expect(text).toMatch(/Snapshot truncated.*saved to: \S+/);
    const m = text.match(/saved to: (\S+)/)!;
    expect(readFileSync(m[1], 'utf8').length).toBeGreaterThan(PI_MAX_BYTES);
  });
  it('spillToTempFile writes the payload', () => {
    const { path, size } = spillToTempFile('hello world');
    expect(readFileSync(path, 'utf8')).toBe('hello world');
    expect(size).toBe(11);
  });
});
