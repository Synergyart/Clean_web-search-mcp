#!/usr/bin/env bash
set -euo pipefail

echo "============================================"
echo " web-search-mcp :: 1-Click Install"
echo "============================================"
echo ""

# ── 0. Clean old build artifacts and dependencies ──
echo "[0/5] Cleaning old build artifacts..."
rm -rf node_modules/ dist/ .pnpm-store/ package-lock.json 2>/dev/null || true
echo "      Old files removed."

# ── 1. Ensure pnpm is available ──
if ! command -v pnpm &>/dev/null; then
  echo "[1/5] Installing pnpm@11.5.1..."
  npm install -g pnpm@11.5.1
else
  echo "[1/5] pnpm already installed: $(pnpm --version)"
fi

# ── 2. Install Node dependencies (lockfile included) ──
echo "[2/5] Installing dependencies..."
pnpm install --frozen-lockfile

# ── 3. Install Playwright Chromium ──
echo "[3/5] Installing Playwright Chromium..."
pnpx playwright install chromium

# ── 4. Build TypeScript ──
echo "[4/5] Building TypeScript..."
pnpm run build

echo ""
echo "============================================"
echo " INSTALL COMPLETE"
echo "============================================"
echo ""
echo "Run the server:"
echo "  node dist/index.js"
echo ""
echo "Or configure in MCP client:"
echo "  {"
echo "    \"mcpServers\": {"
echo "      \"web-search\": {"
echo "        \"command\": \"node\","
echo "        \"args\": [\"$(pwd)/dist/index.js\"]"
echo "      }"
echo "    }"
echo "  }"
echo ""
