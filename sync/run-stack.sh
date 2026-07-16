#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$SYNC/logs"
PID_DIR="$SYNC/pids"

mkdir -p "$LOG_DIR" "$PID_DIR"

echo "Starting backend (uvicorn)..."
nohup bash -lc "cd '$ROOT' && uv run --project backend uvicorn main:app --app-dir backend --reload --host 0.0.0.0 --port 8000" \
  > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$PID_DIR/backend.pid"

echo "Starting mobile web (expo)..."
nohup bash -lc "cd '$ROOT/app' && npm run web" \
  > "$LOG_DIR/mobile-web.log" 2>&1 &
echo $! > "$PID_DIR/mobile-web.pid"

echo "Started. PIDs:"
echo "backend: $(cat "$PID_DIR/backend.pid")"
echo "mobile-web: $(cat "$PID_DIR/mobile-web.pid")"
