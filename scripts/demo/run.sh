#!/usr/bin/env bash
# Runs the app with no Twilio or Igloo account: Sync is in memory, Verify
# accepts the code 123456, prize messages and lock unlocks are printed to this
# terminal. See docs/testing.md.
#
# Builds a throwaway git worktree of the current commit, swaps in the stand-ins
# from scripts/demo/stubs, and deletes the worktree again on exit, so your
# checkout is never modified. Uncommitted changes are not included.
#
#   scripts/demo/run.sh          # dev server (hot reload)
#   scripts/demo/run.sh start    # production build, like the container
#
# Options (env vars):
#   DEMO_MODE=kiosk|device   activation mode (default kiosk)
#   DEMO_PUZZLE=0            2FA-only mode: no puzzle
#   DEMO_IDLE=20             kiosk idle timeout in seconds (default 60, min 15)
#   DEMO_STATS=1             seed 60 sample sessions for /stats
#   DEMO_PORT=3000           port to listen on
#   PI_BASE_URL=http://127.0.0.1:8765   drive the vault LED from the server (kiosk); fake Pi: scripts/demo/led-controller.mjs
#   DEMO_LED_ROUTE=browser DEMO_LED_BROWSER_URL=http://127.0.0.1:8765   drive it from the kiosk browser instead
set -euo pipefail

repo=$(git -C "$(dirname "$0")" rev-parse --show-toplevel)
command="${1:-dev}"
port="${DEMO_PORT:-3000}"

case "$command" in
  dev | start) ;;
  *) echo "usage: $0 [dev|start]" >&2; exit 2 ;;
esac

# One worktree per run, so two demos (e.g. kiosk and device on different
# ports) don't share files. macOS TMPDIR ends in "/"; a "//" in the project
# path makes Turbopack load two copies of React ("Invalid hook call").
tmp="${TMPDIR:-/tmp}"
dir=$(mktemp -d "${tmp%/}/wordlock-demo.XXXXXX")
cleanup() {
  git -C "$repo" worktree remove --force "$dir" 2>/dev/null || rm -rf "$dir"
  git -C "$repo" worktree prune
}
trap cleanup EXIT

git -C "$repo" worktree add --quiet --detach "$dir" HEAD
stubs="$repo/scripts/demo/stubs"
cp "$stubs/sync.ts" "$dir/utils/sync.ts"
cp "$stubs/locks.js" "$dir/utils/locks.js"
cp "$stubs/next.config.ts" "$dir/next.config.ts"

cd "$dir"
echo "Installing dependencies in $dir ..."
pnpm install --frozen-lockfile --prefer-offline --silent
# Swap the twilio package for the offline fake, in this worktree only. The
# pages router loads it from node_modules at runtime, so a bundler alias
# wouldn't reach it.
rm -rf node_modules/twilio
mkdir node_modules/twilio
cp "$stubs/twilio.js" node_modules/twilio/index.js
echo 'declare const twilio: any; export default twilio;' > node_modules/twilio/index.d.ts
echo '{ "name": "twilio", "version": "0.0.0-demo", "main": "index.js", "types": "index.d.ts" }' > node_modules/twilio/package.json

# Placeholders only: nothing reads them once the stand-ins are in.
export TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx TWILIO_AUTH_TOKEN=demo
export TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx TWILIO_MESSAGING_SERVICE_SID=MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export TWILIO_CONTENT_SID=HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx SYNC_SERVICE_SID=ISxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
export ADMIN_CREDENTIALS="${ADMIN_CREDENTIALS:-demo:demo}"
export NEXT_TELEMETRY_DISABLED=1

cat <<EOF

  Wordlock demo ($command, ${DEMO_MODE:-kiosk} mode) on http://localhost:$port
  Verify code: 123456      Admin (/admin, /stats): $ADMIN_CREDENTIALS
  State is in memory and resets when you stop the server (Ctrl-C).

EOF

if [[ "$command" == start ]]; then
  pnpm exec next build
  pnpm exec next start -p "$port"
else
  pnpm exec next dev -p "$port"
fi
