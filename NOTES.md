# pi-browser evaluation notes

Goal: evaluate `larsderidder/pi-browser` as the baseline, then build our own
extension we control. Research findings (2026-09-06) are summarized at the bottom.

## What was installed

- `~/.pi/agent/extensions/pi-browser` — git clone + `npm install` (Playwright ^1.52, resolved 1.61.1)
- Fixed env quirk: Playwright 1.61.1 expects `chromium-1228`; the cache only had
  `chromium-1234` (from some other tool). Fixed with `npx playwright install chromium`
  inside the extension dir.
- This Mac has **no Chrome/Chromium app installed**, so the CDP `connect` path has
  nothing to attach to yet. The `launch` path works (Playwright's own Chromium).

## Verification performed

1. `npm test` — 28/28 unit tests pass.
2. Throwaway integration test (since deleted): `BrowserSession.connect({type:'launch'})`
   → navigate to a data: URL → a11y snapshot contains the content → screenshot returned
   as `{type:'image', data, mimeType}`. **Passed.**
3. `pi -p` model-visible check: the agent confirms `browser_navigate`,
   `browser_take_screenshot`, etc. are in its tool list. **Extension loads cleanly.**

## How to use it now

```
pi                      # start; extension auto-loads from ~/.pi/agent/extensions/
/browser launch         # launches headed Chromium (only option — no headless flag)
# ... or install Chrome, then start it with --remote-debugging-port=9222
/browser connect        # attach to the running browser
# ask the agent to drive the page; tools: browser_navigate / _snapshot /
# _click / _type / _take_screenshot / _fill_form / _tabs / _evaluate / ...
/browser disconnect
```

Note Chrome 136+ ignores `--remote-debugging-port` on the default profile —
use a dedicated profile (or an alias) when we set up `connect`.

## Architecture (what it is)

- `index.ts` registers ~46 tools **upfront** at load; each errors with
  "Browser not connected" until `/browser connect|launch` runs.
- `src/browser-session.ts` — Playwright lifecycle: `cdp` attach / `launch`
  (persistent context, headed) / `isolated`.
- `src/tools/*.ts` — one file per tool family; each tool = `defineTool` with
  `capability`, schema, and a `handle(context, params, result)`.
- `src/response.ts` — `BrowserToolResult` builds pi-shaped results
  (`{content:[{type:'text'|'image'}], details}`), ported from Playwright MCP's
  Response class. Action tools **include a fresh a11y snapshot in every response**
  (refs like `e12`) so the agent rarely needs a separate snapshot call.
- `pi.on('session_shutdown')` disconnects the browser. Clean.

## Design review — keep / change for our own extension

Keep:
- Response-section format + snapshot-in-action-results (token-efficient, proven).
- Tool-per-family file layout, `defineTool` + capability tags, vitest tests.
- session_shutdown cleanup; timeouts config.

Change / gaps we can do better:
1. **46 tools always in the prompt** — pays token cost even when not browsing.
   Register dynamically on connect (pi supports runtime `registerTool`; see
   examples/extensions/dynamic-tools.ts), or collapse to a small surface
   (navigate/snapshot/act/screenshot/evaluate) like oh-my-pi's scripted `browser`.
2. **No headless mode** — `launch` is hard-coded `headless: false`. Add a flag.
3. **No viewport/device emulation tools** beyond `browser_resize` — the "render
   pages in different sizes" use case deserves first-class params
   (`--device "iPhone 15"`, DPR, dark mode).
4. **Agent can't connect by itself** — connect/launch is slash-command only.
   Expose `browser_connect`/`browser_launch` as tools so the agent can bootstrap.
5. Wait tool only supports text/time — add selector/load-state/JS-condition waits.
6. No annotated screenshots (agent-browser does numbered labels), no PDF.
7. Multi-window tabs degrade via CDP (known Playwright limitation).

## Alternative routes (from research) if we change direction

- `pi-mcp-adapter` + `@playwright/mcp` or `chrome-devtools-mcp` (zero custom code).
- agent-browser / dev-browser CLI + a Pi skill (most token-efficient; no extension).
- oh-my-pi-style single scripted `browser` tool via one `eval`-like tool.

## Live demo (Sep 6) — all green

navigate / type+submit / click / screenshot-as-image / resize (390x844 + back) /
evaluate (structured JSON) / console (caught a 404) — all worked against TodoMVC.
Screenshot returned as real image content in the model context. ✅

Observation: snapshots in this build render WITHOUT [ref=eN] markers — element
interaction went through CSS selectors. omp / playwright-mcp snapshots carry refs;
for our own extension, ref-based interaction is worth porting (selector-in, ref-out).

## ZCode/oh-my-pi deep-dive (Sep 6, verified locally)

- Z.ai ZCode desktop (/Applications/ZCode.app) = **Electron app** — Chromium bundled
  in the app bundle; "embeddedBrowser*" settings in ~/.zcode/v2/setting.json
  (default viewport 393x852 = phone-size emulation).
- omp (~/.local/bin/omp, v18.1.7) does NOT bundle/download a browser. Ghost driver
  scavenges: DONGHOST_CHROME env → installed Chromium-family browsers →
  ~/Library/Caches/ms-playwright → DevToolsActivePort files → browser-relay
  (`omp browser-relay` adopts a tab in the user's real Chrome).
  Proof: omp.sh's own docs renderer errors with "ghost: no chromium/chrome binary
  found (set DONGHOST_CHROME)" on browserless machines.
- This machine's pre-existing ~/Library/Caches/ms-playwright/chromium-1234 (Aug 28)
  is why browser tools work here without Chrome installed.
- omp browser design (docs/tools/browser.md) — best prior art for our extension:
  - Browser facade lives inside `eval` (persistent JS/Python), not as N tools:
    browser.open({name,url}) → tab.observe() → tab.id(n)/tab.ref("e5") handles →
    tab.run(fn) with raw Puppeteer page access. Near-zero schema token cost.
  - Five acquisition modes, priority: cdp_url → app.path (spawn, incl. Electron)
    → relay (real Chrome tab) → cmux WKWebView → project-shared headless Chromium
    with stealth patches.
  - observe() gives numeric ids, ariaSnapshot() gives [ref=eN]; handles invalidated
    on navigation — re-observe then act (same as pi-browser's snapshot-per-action).
  - screenshot() returns path + inline image; never accepts an output path.

## Research one-liners

- Pi tool results natively support images → screenshots go straight to the model.
- Playwright team: coding agents increasingly prefer CLI+skills over MCP (tokens).
- Chrome 136+ requires a dedicated profile for CDP attach.
- Prior art: oh-my-pi (Pi fork) ships `browser` (Puppeteer/CDP/relay) + `computer`.

## Rollout status

IMPLEMENTED on branch feature/pi-browser (64/64 tests, tsc clean, live acceptance PASS 2026-09-06).
Pending: merge decision + rollout (remove ~/.pi/agent/extensions/pi-browser, install pi-browser).

