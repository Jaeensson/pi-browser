# pi-browser

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that gives the
agent a real Chromium browser for the **development loop**: verify UI changes
visually, exercise flows end-to-end, debug console/network/DOM, and inspect
responsive layouts — without leaving the chat.

Built for three jobs, in priority order:

1. **Testing your web projects** — drive localhost/dev-server apps with ref-based clicks and typing
2. **Debugging** — console messages, network requests, JS evaluation, API stubbing
3. **Responsive/visual work** — resize/DPR, device presets, screenshots returned straight into the model context

## Install

```bash
pi install git:git@github.com:Jaeensson/pi-browser
```

That's everything — the extension and its `playwright` dependency install together.
No system Chrome is required: Playwright downloads its own managed Chromium build
at install time, or automatically on first `browser_launch` if missing. Login
profiles persist per-project under the OS cache dir. Remove with
`pi remove git:git@github.com:Jaeensson/pi-browser`.

## Launch-first flow

At load, **only `browser_launch` is registered** — its description advertises the
full toolkit it unlocks, so idle sessions pay ~one tool of prompt cost. When the
agent (or you) call it, the remaining 19 tools register dynamically and the
success result lists every new tool. You never need a slash command to start
browsing; `/browser status` and `/browser disconnect` exist for humans.

## Tools (20)

| Tool | Purpose / key params |
|---|---|
| `browser_launch` | Only tool registered pre-launch. `mode: "headless"\|"headed"` (default headless), `device?` (Playwright preset, e.g. `"iPhone 15"`), `viewport?`, `colorScheme?`. Relaunches if connected |
| `browser_navigate` | `{url}`; auto-prepends `http://` for bare `localhost:PORT` |
| `browser_navigate_back` | — |
| `browser_reload` | — |
| `browser_snapshot` | Annotated a11y tree with `[ref=eN]` markers; optional `selector` scopes to a subtree |
| `browser_take_screenshot` | `fullPage?`, element via `ref`/`selector`; `type: png\|jpeg`; returned as image content |
| `browser_click` | `ref` (preferred) or `selector`; `button?`, `doubleClick?`, `modifiers?` |
| `browser_type` | `ref`/`selector`, `text`, `submit?` (presses Enter) |
| `browser_press_key` | `{key}` |
| `browser_fill_form` | `fields[]` of `{type: textbox\|checkbox\|radio\|combobox\|slider, ref/selector, value}` — includes dropdown selection |
| `browser_hover` | `ref`/`selector` |
| `browser_evaluate` | `{function}`, optional `ref` (function receives the element) |
| `browser_console_messages` | `level?` minimum severity; buffer resets per navigation |
| `browser_network_requests` | `filter?` regex, `includeStatic?`; recorded since last navigation |
| `browser_route` | Mock requests matching a URL pattern: `status`, `body`, `contentType`, `headers` |
| `browser_unroute` | Remove mocks (`pattern?` omitted = all) |
| `browser_wait_for` | one-of: `text`, `textGone`, `selector`, `hidden`, `loadState`, `time` |
| `browser_resize` | `{width, height}` + DPR; full device emulation lives on launch |
| `browser_tabs` | `list/new/select/close` |
| `browser_run` | Escape hatch: short async JS with `{page, context, browser}` in scope; 30 s limit; >50 KB output spilled to a temp file. Not a security sandbox |

## Typical workflow

Interact through **refs from snapshots**, not hand-written selectors:

> Open localhost:3000, log in, add an item, and verify there are no console errors.

The agent will: `browser_launch` → `browser_navigate` → `browser_snapshot` →
`browser_fill_form`/`browser_type` + `browser_click` by ref → `browser_snapshot`
to confirm → `browser_console_messages`. Every action response includes a fresh
annotated snapshot, so the next ref is always in context.

### `browser_run` for the long tail

Rarely-needed capabilities were cut from the fixed surface and are one
`browser_run` away (full Playwright Page API in scope):

```js
// read cookies
code: "return await page.context().cookies();"
```

```js
// upload a file
code: "await page.setInputFiles('input[type=file]', '/tmp/fixture.png'); return 'uploaded';"
```

```js
// custom dialog handling
code: "page.once('dialog', d => d.accept('yes')); return 'handler set';"
```

## Policies

- **Headless by default** — `browser_launch {mode: "headed"}` to watch it run.
- **Dialogs auto-dismissed** — the next response carries a `Modal state` line
  describing what popped and that it was dismissed; custom handlers via
  `browser_run` (`page.once('dialog', …)`).
- **Snapshot-per-action** — every action returns the updated annotated snapshot;
  refs are invalidated by navigation/DOM changes and resolved through role-based
  locators at action time (no page mutation).
- **50 KB spill** — oversized `browser_run`/`evaluate` output is written to a
  temp file with the path in the result; oversized snapshots are truncated with a
  hint to re-snapshot using a `selector`.

## Error behavior

Tools throw typed errors — pi marks them as failed tool calls — with messages
written for the model:

- Not launched → `No browser running. Call browser_launch first.`
- Stale/unknown ref → `Ref e12 is stale — fresh snapshot attached below.` with
  the fresh annotated snapshot **embedded in the error itself**, so the agent
  retries in one step without a separate snapshot call.
- Element not found → tool + locator + hint to re-snapshot.
- Launch failure → underlying cause + manual recovery command.

## Troubleshooting

- **Missing Chromium:** on first launch, if no Playwright Chromium build is
  installed, the extension auto-downloads it (`npx playwright install chromium`)
  and retries. If the download fails, run it manually from the extension directory.
- **Browser stuck:** `/browser disconnect`, then ask the agent to launch again.
- **Persistent login state:** profiles persist per-project (keyed by cwd) under
  the OS cache dir (e.g. `~/Library/Caches/pi-browser/profile-<hash>` on
  macOS), so sessions survive restarts.

## Development

```bash
npm install
npm test        # vitest unit + integration (headless Chromium, local fixture page)
```

## License

MIT
