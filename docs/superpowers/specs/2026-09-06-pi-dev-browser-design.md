# pi-dev-browser — Design Spec

**Date:** 2026-09-06
**Status:** Approved design (pending implementation plan)
**Replaces:** larsderidder/pi-browser (installed at `~/.pi/agent/extensions/pi-browser`)
**Project root:** `~/pi-browser/`

## 1. Purpose

A Pi extension that gives the agent a real browser for the **development loop**:
verify UI changes visually, exercise flows, debug (console/network/DOM), and
inspect responsive layouts — without the user leaving the chat.

Derived from the user's selected jobs (in priority order):

1. **Testing my web projects** — drive localhost/dev-server apps end-to-end
2. **Debugging web apps** — console, network, DOM/JS evaluation, API stubbing
3. **Responsive/visual work** — viewport/device sizes, screenshots for visual checks

## 2. Non-goals (v1)

- General web automation (public scraping, stealth/anti-bot)
- CDP attach to a running browser, relay into the user's real Chrome, scavenge chain
  (architecture must not preclude adding attach later — see §7)
- Performance tracing (chrome-devtools-mcp territory)
- Publishing to npm (package structure supports it later; not a v1 task)

## 3. Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Tool surface | Compact ref-based core (20 tools) + `browser_run` escape hatch | Determinism of fine-grained tools, token cost of a small set, hatch covers long tail |
| Browser acquisition | Launch-own only: Playwright Chromium, headless default, headed option | Zero external deps; ~95% of dev-loop needs; simplest robust core |
| Bootstrap | Agent-facing `browser_launch` tool (not slash-command-only) | Agent must be able to start testing unprompted-setup |
| Naming | Replaces pi-browser; keeps `browser_*` tool names 1:1 | Clean end state; no namespace collision after transition |
| Build strategy | Fresh codebase; surgical ports from pi-browser (response builder, route mocking, wait logic, vitest setup) | Codebase matches design 1:1; ref store structural from day one |

## 4. Architecture

```
~/pi-browser/
├── package.json              pi.extensions: ["./src/index.ts"]
│                             deps: playwright · peers: pi-coding-agent, typebox
├── src/
│   ├── index.ts              entry: registers ONLY browser_launch at load;
│   │                         registers remaining tools after first successful launch;
│   │                         /browser command (status, disconnect); session_shutdown hook
│   ├── session.ts            BrowserSession: launch (headless/headed, device/viewport,
│   │                         colorScheme), persistent per-project profile, console +
│   │                         network buffers, timeouts, teardown
│   ├── snapshot.ts           aria snapshot + ref store (§6)
│   ├── response.ts           section builder (ported): Result / Page / Snapshot /
│   │                         Modal state / Image sections
│   ├── tools/
│   │   ├── bootstrap.ts      browser_launch
│   │   ├── navigate.ts       navigate, back, reload
│   │   ├── observe.ts        snapshot, screenshot
│   │   ├── interact.ts       click, type, press_key, fill_form, hover
│   │   ├── inspect.ts        evaluate, console_messages, network_requests, route, unroute
│   │   ├── viewport.ts       resize
│   │   ├── tabs.ts           tabs
│   │   ├── wait.ts           wait_for
│   │   └── run.ts            browser_run
│   └── errors.ts             typed errors → LLM-actionable messages
└── tests/
    ├── fixture/              local interactive test page (no network dependency)
    └── *.test.ts             unit + integration
```

**Data flow (every action):**

```
LLM → browser_click {ref: "e12"}
   → interact.ts resolves ref via snapshot.ts ref store → role-based locator
   → Playwright click()
   → response.ts: Result line + FRESH annotated snapshot + (image only when requested)
   → LLM continues with new refs
```

Properties: every action returns the updated snapshot; screenshots are opt-in;
idle prompt carries only `browser_launch`'s schema (~100 tokens) until launch.

## 5. Tool surface (20 tools)

| # | Tool | Purpose / key params |
|---|---|---|
| 1 | `browser_launch` | Only tool registered pre-connect. `mode: "headless"\|"headed"` (default headless), `device?` preset from Playwright's device registry (e.g. "iPhone 15"; full emulation: UA/DPR/touch), `viewport?`, `colorScheme?`. Relaunches if connected. **Discoverability requirement:** description lists the capability families unlocked on launch; a `promptGuidelines` bullet tells the model to call it when the user asks to view/test/interact with a page or dev server; the successful result enumerates all newly registered tools |
| 2 | `browser_navigate` | `{url}`; auto-prepends `http://` for bare `localhost:PORT` |
| 3 | `browser_navigate_back` | — |
| 4 | `browser_reload` | — |
| 5 | `browser_snapshot` | Annotated a11y tree; optional `selector` scopes to a subtree |
| 6 | `browser_take_screenshot` | `fullPage?`, element via `ref`/`selector`; `type: png\|jpeg`; returned as `ImageContent` |
| 7 | `browser_click` | `ref` (preferred) or `selector`; `element?` human description; `button?`, `doubleClick?`, `modifiers?` |
| 8 | `browser_type` | `ref`/`selector`, `text`, `submit?` (Enter) |
| 9 | `browser_press_key` | `{key}` |
| 10 | `browser_fill_form` | `fields[]` of `{type: textbox\|checkbox\|radio\|combobox\|slider, ref/selector, value}` — absorbs dropdown selection (no separate select_option) |
| 11 | `browser_hover` | `ref`/`selector` |
| 12 | `browser_evaluate` | `{function}`, optional `ref` (fn receives element) |
| 13 | `browser_console_messages` | `level?` min severity; buffer resets per navigation |
| 14 | `browser_network_requests` | `filter?` regex, `type?`; recorded since last navigation |
| 15 | `browser_route` | Mock requests matching URL pattern: `status`, `body`, `contentType`, `headers` |
| 16 | `browser_unroute` | Remove mocks (`pattern?` = all) |
| 17 | `browser_wait_for` | one-of: `text`, `textGone`, `selector`, `hidden`, `loadState`, `time` |
| 18 | `browser_resize` | `{width, height}` + DPR; full device emulation lives on launch |
| 19 | `browser_tabs` | `list/new/select/close` |
| 20 | `browser_run` | Escape hatch: short async JS with `{page, context, browser}`; JSON-serialized return; 30 s clamp; output > 50 KB spilled to temp file with path in result. Not a security sandbox (same trust as pi's bash) |

Cut from pi-browser's 46 (reachable via `browser_run`): mouse-XY family,
cookies/localStorage/sessionStorage family, file upload (`page.setInputFiles`),
drag, standalone select_option, `browser_handle_dialog` (§7 dialog policy),
standalone `browser_close` (tab lifecycle via `browser_tabs`).

## 6. Ref system (isolated in `snapshot.ts`; mechanism swappable)

- **Contract:** snapshot YAML annotated with stable element refs:
  `- button "Save" [ref=e12]`
- **Store:** `ref → {role, name, occurrence}` resolved through Playwright
  role-based locators at action time. No page mutation, no CSS-path generation.
- **Invalidation:** navigation and DOM mutations invalidate refs.
- **Self-heal:** an action with a stale/unknown ref never dead-ends — the error
  result embeds a fresh annotated snapshot so the agent retries in one step.
- Snapshot response includes a short usage hint when refs are present
  (mirrors playwright-mcp's "use ref for interaction" guidance) — kept to one
  line to control token cost.

## 7. Behavior policies

- **Dialogs:** auto-dismissed by default; surfaced as a `Modal state` line
  (description + dismissed action) in the next snapshot. Custom handlers via
  `browser_run` (`page.once('dialog', ...)`).
- **Downloads/profile:** persistent per-project profile keyed by cwd hash under a
  state root — the OS cache dir (e.g. `~/Library/Caches/pi-dev-browser/profile-<hash>` on macOS); survives
  sessions; `session_shutdown` closes the browser but not the profile.
- **Binary bootstrap:** on missing-executable error, spawn
  `npx playwright install chromium` with progress streamed via `onUpdate`,
  retry launch once; on failure return the manual command.
- **Timeouts:** action 10 s, navigation 30 s (internal constants, v1).
- **Waits:** navigation waits for `load` + short settle; actions use Playwright
  auto-waiting.
- **Truncation:** oversized snapshots suggest the `selector` param; `browser_run`
  and `evaluate` outputs spill to file past 50 KB (pi truncation utils).

## 8. Error handling

All errors are LLM-actionable strings:

| Case | Message shape |
|---|---|
| Not launched | "No browser running. Call browser_launch first." |
| Stale/unknown ref | "Ref e12 is stale — fresh snapshot attached." + annotated snapshot |
| Element not found | Tool + locator + hint to re-snapshot |
| Launch failure | Underlying cause + manual recovery command |

Tools throw typed errors (pi marks `isError`); `signal` aborts in-flight
Playwright waits; long ops stream `onUpdate` progress (launch, download, waits).

## 9. Testing

- **Unit:** ref store (annotate → resolve → invalidate), response section builder,
  launch-param parsing, URL normalization
- **Integration** (headless Chromium against `tests/fixture/` local page):
  launch → navigate → click-by-ref happy path · stale-ref self-heal ·
  dialog auto-dismiss + Modal state reporting · `browser_run` clamp/spill ·
  console/network buffers · route mock round-trip · resize/screenshot
- **Acceptance scenario** (success criterion): with only a dev server running,
  a fresh pi session can: launch headless → open the app → complete a flow
  using refs → read a console error → screenshot at desktop and mobile sizes →
  stub an API with `browser_route` — zero manual steps, zero hand-written selectors.

## 10. Rollout

1. Develop/trial: `pi -e ~/pi-browser`
2. At functional parity: remove `~/.pi/agent/extensions/pi-browser`, install this
   extension in `~/.pi/agent/extensions/pi-dev-browser/`
3. Later (optional): publish as npm pi package (structure already compliant)

## 11. Prior art

- **pi-browser** (base being replaced): response sections, snapshot-per-action,
  per-family tool files, tests
- **oh-my-pi/ghost**: ref handles, browser acquisition modes, eval facade,
  stealth-headless (not adopted: general-web scoped)
- **playwright-mcp**: ref-annotated snapshots, modal-state policy, per-workspace
  profiles, compact tool surface
- **agent-browser**: ref UX (`@eN`), annotated screenshots (future idea)
