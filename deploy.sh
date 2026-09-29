#!/usr/bin/env bash
set -euo pipefail

APP_NAME="sympl-pricing"
BRANCH="main"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Deploying $APP_NAME ==="
echo "Directory: $APP_DIR"
echo ""

# 1. Stop the running service
echo "[1/5] Stopping $APP_NAME..."
sudo systemctl stop "$APP_NAME" 2>/dev/null || true
echo "  Stopped."

# 2. Pull latest code
echo "[2/5] Pulling latest code from origin/$BRANCH..."
cd "$APP_DIR"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "  Updated to $(git log --oneline -1)"

# 3. Install dependencies
echo "[3/5] Installing dependencies..."
npm install
echo "  Done."

# 4. Generate Prisma client and run migrations
echo "[4/5] Running Prisma generate + migrate..."
npx prisma generate
npx prisma migrate deploy
echo "  Database synced."

# 5. Restart the service
echo "[5/5] Starting $APP_NAME..."
sudo systemctl daemon-reload
sudo systemctl start "$APP_NAME"

sleep 3
if sudo systemctl is-active --quiet "$APP_NAME"; then
  echo ""
  echo "=== Deploy complete. $APP_NAME is running. ==="
else
  echo ""
  echo "=== WARNING: $APP_NAME failed to start. Check logs: ==="
  echo "  journalctl -u $APP_NAME -n 30 --no-pager"
  exit 1
fi
