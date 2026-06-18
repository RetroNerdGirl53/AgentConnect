#!/usr/bin/env bash
#
# WhisperChat installer.
#   ./install.sh                 install app dependencies
#   ./install.sh --with-browser  also install Playwright Chromium (for the
#                                 headless verification scripts in scripts/)
#
# Re-runnable and safe to run multiple times.
set -euo pipefail

cd "$(dirname "$0")"

WITH_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --with-browser) WITH_BROWSER=1 ;;
    -h|--help) sed -n '3,8p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# --- prerequisites -----------------------------------------------------------
say "Checking prerequisites"

command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ (https://nodejs.org)."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old; need 20+."
echo "  node $(node -v)"

command -v npm >/dev/null 2>&1 || die "npm not found."
echo "  npm  $(npm -v)"

if command -v claude >/dev/null 2>&1; then
  echo "  claude $(claude --version 2>/dev/null | head -1)"
else
  warn "Claude Code CLI ('claude') not found. You can still build and run the UI,"
  warn "but you'll need 'claude' on PATH to launch the agents in each panel."
fi

# --- dependencies ------------------------------------------------------------
say "Installing npm dependencies"
npm install

if [ "$WITH_BROWSER" -eq 1 ]; then
  say "Installing Playwright Chromium (for headless verification)"
  npx playwright install chromium
fi

# --- config ------------------------------------------------------------------
if [ ! -f whisper.config.json ]; then
  say "Writing default whisper.config.json"
  cat > whisper.config.json <<'JSON'
{
  "host": "localhost",
  "port": 3000,
  "agentsRoot": "./agents",
  "allowedDevOrigins": []
}
JSON
fi
HOST="$(node -p 'require("./whisper.config.json").host')"
PORT="$(node -p 'require("./whisper.config.json").port')"

# --- done --------------------------------------------------------------------
cat <<DONE

$(printf '\033[1;32m✓ WhisperChat installed.\033[0m')

  Start it:        npm run dev
  Then open:       http://${HOST}:${PORT}

  Bind address lives in whisper.config.json (host/port). To reach it from
  another machine, set "host" to this machine's LAN IP and reopen the URL there.

  Next: docs/getting-started.md
DONE
