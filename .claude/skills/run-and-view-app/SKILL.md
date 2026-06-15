---
name: run-and-view-app
description: Launch the PocketPolyglot Expo app and view/drive it from this headless WSL2 box. Use when asked to run, start, view, screenshot, or test the app locally (web preview), or to drive it with the chrome-devtools MCP.
---

# Run & view the PocketPolyglot app (headless WSL2)

The product is **mobile-only** (iOS/Android). For development you have two ways to see it:

- **Web preview** (`expo start --web`) — react-native-web build in a browser; fastest loop, and
  the only way to *screenshot/drive it from this machine*. Dev-only — there is **no `web` block**
  in `app.config.ts` and the build script stays `expo export --platform ios`.
- **iPhone via Expo Go** (`npx expo start --tunnel`, scan QR) — true iOS, the source of truth.

This skill covers the **web preview + driving it with the chrome-devtools MCP**, which on this
headless WSL2 box needs a specific setup (the MCP's default pipe-launch of Chrome dies here).

## Why the non-obvious setup

The `chrome-devtools` MCP defaults to launching its **own** Chrome over a debugging **pipe**
(fd 3/4). In this WSL2/container environment that pipe transport dies → `Protocol error
(Target.setDiscoverTargets): Target closed`. Headless flags don't fix it — the *transport* is the
problem. The fix: launch a headless Chrome ourselves with a debugging **port**, and point the MCP
at it via `--browserUrl` (port/WebSocket transport works where the pipe doesn't).

## One-time MCP config (already applied; re-check if it regressed)

In `~/.claude.json`, the `chrome-devtools` server must connect, not launch:
```jsonc
"chrome-devtools": {
  "type": "stdio", "command": "npx",
  "args": ["chrome-devtools-mcp@latest", "--browserUrl", "http://127.0.0.1:9222"]
}
```
After editing this, the MCP server must be reloaded (`/mcp` → chrome-devtools → reconnect, or
restart Claude Code). NOTE: a reconnect attaches to any already-running server process — if you
changed args, `pkill -9 -f chrome-devtools-mcp` first so a fresh process reads the new config.
(`pkill ... chrome-devtools-mcp` also kills the running MCP server — that's intended; reconnect
respawns it.)

## Launch sequence

Run both background processes, then drive via the MCP.

```bash
cd ~/workspace/pocketpolyglot/pocketpolyglot-app

# 1) Expo web server on :8081 (background). Watch mode; omit CI for hot reload.
BROWSER=none npx expo start --web --port 8081 > /tmp/expo-web.log 2>&1 &
# wait until it serves:
for i in $(seq 1 20); do [ "$(curl -s -o /dev/null -w %{http_code} --max-time 3 http://localhost:8081)" = 200 ] && break; sleep 2; done

# 2) Headless Chrome with a DEBUGGING PORT on :9222 (background). This is the key step.
CHROME=$(find ~/.cache/puppeteer/chrome -maxdepth 3 -type f -name chrome | head -1)
rm -rf /tmp/cdp-profile
nohup "$CHROME" --headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu \
  --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1 \
  --user-data-dir=/tmp/cdp-profile --window-size=390,844 about:blank \
  > /tmp/cdp-chrome.log 2>&1 &
# confirm the CDP endpoint is up (expect JSON with webSocketDebuggerUrl):
curl -s --max-time 5 http://127.0.0.1:9222/json/version
```

Both must stay alive. If Chrome (`:9222`) dies, re-run step 2 — the MCP will reconnect to it.
If `$CHROME` is empty, the puppeteer Chrome isn't downloaded; `npx playwright install chromium`
also works and its binary path can be passed as `$CHROME`.

## Drive it (chrome-devtools MCP)

```
mcp__chrome-devtools__navigate_page  { type: "url", url: "http://localhost:8081" }
mcp__chrome-devtools__wait_for        { text: ["Sveiki"] }          # login headline
mcp__chrome-devtools__take_screenshot { filePath: "/tmp/app.png" }  # then Read it
mcp__chrome-devtools__take_snapshot                                  # a11y tree → uids for click/fill
```
Use `take_snapshot` to get element `uid`s, then `click`/`fill`. Viewport is iPhone-sized
(390x844) from the Chrome `--window-size`.

## Verify a real change

Don't just screenshot the login. Drive the path the change touches: `fill` the email/password,
`click` Continue, `wait_for` the next screen, screenshot. Look at the screenshot — a blank frame
is a launch failure, not success. Check `list_console_messages` (types: ["error"]) for runtime errors.

## Gotchas

- `expo start` errors "Port 8081 is running this app in another window" → an instance is already
  serving; just use it (curl returns 200), don't start a second.
- Login is **email + password** (Supabase); Apple/Google/Forgot are cosmetic. To sign in you need a
  Supabase account (or disable Auth→Email→Confirm-email for a fast dev loop).
