#!/usr/bin/env bash
set -euo pipefail

SYNC="$(cd "$(dirname "$0")" && pwd)"
PID_DIR="$SYNC/pids"

check_pid() {
  local name="$1"
  local pid_file="$PID_DIR/$2"
  if [ ! -f "$pid_file" ]; then
    echo "$name: pid file missing"
    return
  fi

  local pid
  pid="$(cat "$pid_file")"
  if ps -p "$pid" > /dev/null 2>&1; then
    echo "$name: running (pid $pid)"
  else
    echo "$name: not running (stale pid $pid)"
  fi
}

check_pid "backend" "backend.pid"
check_pid "mobile-web" "mobile-web.pid"
