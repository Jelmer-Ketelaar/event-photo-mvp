#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.run"
API_PID_FILE="$RUN_DIR/api.pid"
WEB_PID_FILE="$RUN_DIR/web.pid"
API_PORT=8787
WEB_PORT=5173

list_child_pids() {
  local parent_pid="$1"
  ps -axo pid=,ppid= | awk -v parent_pid="$parent_pid" '$2 == parent_pid { print $1 }'
}

kill_tree() {
  local pid="$1"

  if [[ -z "$pid" ]]; then
    return 0
  fi

  local child_pid
  for child_pid in $(list_child_pids "$pid"); do
    kill_tree "$child_pid"
  done

  kill "$pid" 2>/dev/null || true
}

kill_matching_listeners() {
  local port pid command

  for port in "$API_PORT" "$WEB_PORT"; do
    while IFS= read -r pid; do
      if [[ -z "$pid" ]]; then
        continue
      fi

      command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
      if [[ "$command" == *"$ROOT_DIR"* ]]; then
        kill_tree "$pid"
      fi
    done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  done
}

stop_stack() {
  local pid_file pid

  for pid_file in "$API_PID_FILE" "$WEB_PID_FILE"; do
    if [[ -f "$pid_file" ]]; then
      pid="$(cat "$pid_file")"
      kill_tree "$pid"
      rm -f "$pid_file"
    fi
  done

  kill_matching_listeners
  rmdir "$RUN_DIR" 2>/dev/null || true
}

start_stack() {
  local mode="$1"
  local lan_ip="${2:-}"
  local api_host="127.0.0.1"
  local web_host="127.0.0.1"
  local api_base_url=""

  stop_stack
  mkdir -p "$RUN_DIR"

  if [[ "$mode" == "phone" ]]; then
    if [[ -z "$lan_ip" ]]; then
      lan_ip="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
    fi

    if [[ -z "$lan_ip" ]]; then
      echo "Could not detect a LAN IP automatically."
      echo "Run: make start-phone LAN_IP=192.168.x.x"
      exit 1
    fi

    api_host="0.0.0.0"
    web_host="0.0.0.0"
    api_base_url="http://${lan_ip}:${API_PORT}"

    echo "Starting phone dev mode"
    echo "API:  ${api_base_url}"
    echo "Web:  http://${lan_ip}:${WEB_PORT}"
  else
    echo "Starting API on http://127.0.0.1:${API_PORT} and web on http://localhost:${WEB_PORT}"
  fi

  (
    cd "$ROOT_DIR/apps/api"
    export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-/tmp}"
    exec node "$ROOT_DIR/node_modules/wrangler/bin/wrangler.js" dev --ip "$api_host" --port "$API_PORT"
  ) &
  local api_pid=$!
  echo "$api_pid" > "$API_PID_FILE"

  (
    cd "$ROOT_DIR/apps/web"
    if [[ -n "$api_base_url" ]]; then
      export VITE_API_BASE_URL="$api_base_url"
    fi
    exec node "$ROOT_DIR/node_modules/vite/bin/vite.js" --host "$web_host" --port "$WEB_PORT"
  ) &
  local web_pid=$!
  echo "$web_pid" > "$WEB_PID_FILE"

  cleanup_and_exit() {
    local status="$1"
    trap - EXIT INT TERM
    stop_stack
    exit "$status"
  }

  trap 'cleanup_and_exit 130' INT TERM

  local status=0
  wait "$api_pid" "$web_pid" || status=$?
  cleanup_and_exit "$status"
}

case "${1:-}" in
  start)
    start_stack "local"
    ;;
  start-phone)
    start_stack "phone" "${2:-}"
    ;;
  stop)
    stop_stack
    ;;
  *)
    echo "Usage: $0 {start|start-phone [LAN_IP]|stop}"
    exit 1
    ;;
esac
