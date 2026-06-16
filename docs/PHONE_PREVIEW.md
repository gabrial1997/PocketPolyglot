# Phone preview (real iPhone via Expo Go) — WSL2

**TL;DR:** `npm run phone` → scan the printed QR with the iOS **Camera** app.

```bash
npm run phone          # or: ./scripts/phone-preview.sh
```

The script prints an Expo Go QR in the terminal and starts Metro. Scan it with the
iOS **Camera** app (a yellow banner appears → tap it → opens in Expo Go). Install
**Expo Go** from the App Store first. First load is slow (~6.8 MB bundle over the
tunnel) — give it 20–40s; it caches after that. `Ctrl-C` stops Metro **and** the tunnel.

Test account: `test@pocketpolyglot.dev` / `Polyglot123!`.

## Why not the normal Expo workflows

On this machine (WSL2) the two built-in paths both fail:

- **`expo start --tunnel`** — Expo's bundled `@expo/ngrok 4.1.3` is broken and throws
  `CommandError: TypeError: Cannot read properties of undefined (reading 'body')`
  (also seen as `remote gone away`). ngrok's service itself is up — the wrapper is the
  problem. Not worth fighting.
- **`expo start` (LAN)** — the phone can't reach WSL2's NAT'd internal IP (`172.x`), so
  the manifest/bundle URLs are unroutable from the device.

## How the script works

It routes around both with a **free Cloudflare quick tunnel** (no account):

1. Downloads `cloudflared` to `/tmp/cloudflared` (once) and runs
   `cloudflared tunnel --url http://localhost:8081`, capturing the public
   `https://<random>.trycloudflare.com` URL.
2. Starts Metro with **`EXPO_PACKAGER_PROXY_URL=<tunnel-url>`** so the served manifest's
   `bundleUrl` points at the public tunnel host instead of `localhost` — this is the same
   mechanism Expo's own tunnel uses internally, just with a working tunnel provider.
3. Prints `exp://<tunnel-host>` as a QR. Expo Go fetches the manifest over the tunnel
   (verified: manifest **and** bundle return HTTP 200 with a public `bundleUrl`).

The tunnel hostname is **random on every run** — always use the freshly printed QR.

## Troubleshooting

- **Camera ignores the QR** — raise screen brightness, move closer/further. Recent Expo Go
  on iOS has **no in-app scanner and no manual-URL entry**; you must use the system Camera.
- **"could not obtain a tunnel URL"** — Cloudflare hiccup; just re-run.
- **Port 8081 busy** — `PORT=8082 npm run phone`.
- **Stuck Metro/tunnel from a prior run** — find and kill by PID
  (`ps -eo pid,cmd | grep -iE 'expo start|cloudflared'`). NB: `pkill -f cloudflared`
  self-terminates your shell on WSL2 because `-f` matches the pkill command's own line —
  kill by PID instead.
