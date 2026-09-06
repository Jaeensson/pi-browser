import type { BrowserContext } from 'playwright';

export const FIXTURE_URL = 'https://fixture.test/';
export const FIXTURE_HTML = `<!doctype html><html><head><title>Fixture App</title></head><body>
<h1>Fixture App</h1>
<input aria-label="Email" placeholder="you@example.com" />
<button id="save">Save</button>
<button id="alert-btn">Alert</button>
<button id="fetch-btn">Fetch</button>
<select aria-label="Color"><option>red</option><option>green</option></select>
<ul id="items"></ul>
<div id="status" hidden>saved!</div>
<div id="late" hidden>appeared!</div>
<script>
  const byId = id => document.getElementById(id);
  byId('save').onclick = () => { byId('status').hidden = false; };
  byId('alert-btn').onclick = () => alert('watch out');
  byId('fetch-btn').onclick = async () => {
    const li = document.createElement('li');
    li.textContent = await (await fetch('/api/data')).text();
    byId('items').appendChild(li);
  };
</script></body></html>`;

export async function installFixture(context: BrowserContext): Promise<void> {
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url === 'https://fixture.test/api/data')
      return route.fulfill({ status: 200, contentType: 'text/plain', body: 'fixture-data' });
    if (url.startsWith('https://fixture.test/'))
      return route.fulfill({ status: 200, contentType: 'text/html', body: FIXTURE_HTML });
    return route.abort();
  });
}
