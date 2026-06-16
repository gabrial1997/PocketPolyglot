#!/usr/bin/env bash
#
# phone-preview.sh — open the app on a physical iPhone via Expo Go, from WSL2.
#
# WHY THIS EXISTS: Expo's built-in `--tunnel` (bundled @expo/ngrok) is broken
# (throws "Cannot read properties of undefined (reading 'body')"), and plain LAN
# mode is unreachable on WSL2 because the phone can't route to WSL's NAT'd IP.
# This script routes around both with a free Cloudflare quick tunnel and tells
# Expo to advertise the public tunnel host in its manifest (EXPO_PACKAGER_PROXY_URL).
#
# USAGE:   ./scripts/phone-preview.sh
# Then scan the printed QR with the iOS *Camera* app (recent Expo Go on iOS has no
# in-app scanner / manual URL entry — you must use the system Camera).
#
# Ctrl-C stops Expo AND tears down the tunnel.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-8081}"
CF_BIN="${CF_BIN:-/tmp/cloudflared}"
CF_LOG="$(mktemp)"

# 1. Ensure cloudflared is present (single static binary, no account needed).
if [ ! -x "$CF_BIN" ]; then
  echo "→ downloading cloudflared…"
  curl -fsSL -o "$CF_BIN" \
    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$CF_BIN"
fi

# 2. Start the tunnel pointing at Metro's port and capture its public https URL.
echo "→ starting Cloudflare tunnel…"
"$CF_BIN" tunnel --url "http://localhost:${PORT}" --no-autoupdate >"$CF_LOG" 2>&1 &
CF_PID=$!
# Always clean up the tunnel when this script exits.
trap 'kill "$CF_PID" 2>/dev/null || true; rm -f "$CF_LOG"' EXIT

CF_URL=""
for _ in $(seq 1 30); do
  CF_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" | head -1 || true)"
  [ -n "$CF_URL" ] && break
  sleep 2
done
if [ -z "$CF_URL" ]; then
  echo "✗ could not obtain a tunnel URL. cloudflared output:" >&2
  cat "$CF_LOG" >&2
  exit 1
fi
CF_HOST="${CF_URL#https://}"

# 3. Print the Expo Go QR (the exp:// deep link to the public host).
echo
echo "════════════════════════════════════════════════════════════"
echo "  Scan with the iOS Camera app (opens in Expo Go):"
echo "  exp://${CF_HOST}"
echo "════════════════════════════════════════════════════════════"
echo
npx --yes qrcode-terminal "exp://${CF_HOST}"
echo
echo "  First load is slow (~6.8 MB bundle over the tunnel) — give it 20–40s."
echo

# 4. Start Metro, advertising the public host so the manifest's bundleUrl is reachable.
cd "$APP_DIR"
EXPO_PACKAGER_PROXY_URL="$CF_URL" \
EXPO_MANIFEST_PROXY_URL="$CF_URL" \
  npx expo start --port "$PORT" --host lan
