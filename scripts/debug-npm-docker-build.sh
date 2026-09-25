#!/usr/bin/env bash
# Debug harness: npm "Exit handler never called" during Docker api build.
# Writes NDJSON to .cursor/debug-907e89.log (session 907e89).
# Usage: bash scripts/debug-npm-docker-build.sh [--post-fix]
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/.cursor/debug-907e89.log"
SESSION="907e89"
RUN_ID="pre-fix"
[[ "${1:-}" == "--post-fix" ]] && RUN_ID="post-fix"
WORKDIR="$(mktemp -d /tmp/sickos-npm-debug.XXXXXX)"
trap 'rm -rf "$WORKDIR"' EXIT

log() {
  local hyp="$1" loc="$2" msg="$3" data="$4"
  local ts
  ts="$(date +%s%3N)"
  printf '{"sessionId":"%s","runId":"%s","hypothesisId":"%s","location":"%s","message":"%s","data":%s,"timestamp":%s}\n' \
    "$SESSION" "$RUN_ID" "$hyp" "$loc" "$msg" "$data" "$ts" >>"$LOG"
  # also POST for ingest (best-effort)
  curl -sS -m 2 -X POST "http://127.0.0.1:7545/ingest/f5680fa6-601f-42c5-962a-536e78dc53f7" \
    -H "Content-Type: application/json" -H "X-Debug-Session-Id: $SESSION" \
    -d "{\"sessionId\":\"$SESSION\",\"runId\":\"$RUN_ID\",\"hypothesisId\":\"$hyp\",\"location\":\"$loc\",\"message\":\"$msg\",\"data\":$data,\"timestamp\":$ts}" \
    >/dev/null 2>&1 || true
}

if [[ "$RUN_ID" == "post-fix" ]]; then
  mkdir -p "$ROOT/.cursor"
  # #region agent log
  BRIDGE_OUT="$WORKDIR/bridge.json"
  set +e
  docker run --rm node:22-alpine node -e 'require("dns").lookup("registry.npmjs.org",(e,a)=>{console.log(JSON.stringify({ok:!e,err:e&&e.code,addr:a})); process.exit(e?1:0)})' >"$BRIDGE_OUT" 2>&1
  BRIDGE_EC=$?
  set -e
  BRIDGE_DATA="$(python3 -c 'import json; print(open("'"$BRIDGE_OUT"'").read().strip() or "{\"ok\":false}")')"
  log "B" "debug-npm-docker-build.sh:post:bridge-dns" "bridge_dns_still_broken" "$BRIDGE_DATA"

  OUT="$WORKDIR/compose-build.log"
  set +e
  (cd "$ROOT" && docker compose build --no-cache api) >"$OUT" 2>&1
  EC=$?
  set -e
  HIT="$(grep -c 'Exit handler never called' "$OUT" || true)"
  ADDED="$(grep -cE 'added [0-9]+ packages' "$OUT" || true)"
  TAIL="$(python3 -c 'import json; print(json.dumps(open("'"$OUT"'").read()[-1200:]))')"
  log "B2" "debug-npm-docker-build.sh:post:compose-api" "compose_build_api" \
    "{\"exitCode\":$EC,\"exitHandlerNeverCalled\":$HIT,\"addedLine\":$ADDED,\"tail\":$TAIL}"
  echo "Wrote post-fix diagnostics to $LOG (compose api build exit=$EC)"
  exit "$EC"
  # #endregion
fi

mkdir -p "$ROOT/.cursor"

# --- H-A: host memory pressure / OOM during build ---
# #region agent log
MEM_JSON="$(free -b | awk '/^Mem:/{printf "{\"total\":%s,\"used\":%s,\"available\":%s}", $2,$3,$7}')"
SWAP_JSON="$(free -b | awk '/^Swap:/{printf "{\"total\":%s,\"used\":%s,\"free\":%s}", $2,$3,$4}')"
log "A" "debug-npm-docker-build.sh:mem" "host_memory" "{\"mem\":$MEM_JSON,\"swap\":$SWAP_JSON}"
# #endregion

# --- H-D: disk space ---
# #region agent log
DISK_JSON="$(df -B1 / /var/lib/docker 2>/dev/null | awk 'NR>1{printf "%s{\"mount\":\"%s\",\"avail\":%s,\"use_pct\":\"%s\"}", (n++?",":""), $6,$4,$5}' | sed 's/^/[/' | sed 's/$/]/')"
log "D" "debug-npm-docker-build.sh:disk" "host_disk" "{\"filesystems\":$DISK_JSON}"
# #endregion

# --- H-C: lockfile / host npm install ---
# #region agent log
cp "$ROOT/server/package.json" "$WORKDIR/"
cp "$ROOT/server/package-lock.json" "$WORKDIR/" 2>/dev/null || true
HOST_OUT="$WORKDIR/host-npm.log"
set +e
(cd "$WORKDIR" && npm install --no-audit --no-fund >"$HOST_OUT" 2>&1)
HOST_EC=$?
set -e
HOST_TAIL="$(tail -c 800 "$HOST_OUT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
log "C" "debug-npm-docker-build.sh:host-npm" "host_npm_install" \
  "{\"exitCode\":$HOST_EC,\"node\":\"$(node -v)\",\"npm\":\"$(npm -v)\",\"tail\":$HOST_TAIL}"
# #endregion

# --- H-B: registry reachability from alpine container ---
# #region agent log
NET_OUT="$WORKDIR/net.log"
set +e
docker run --rm node:22-alpine sh -c \
  'node -v; npm -v; wget -qO- --timeout=10 https://registry.npmjs.org/express 2>&1 | head -c 200' \
  >"$NET_OUT" 2>&1
NET_EC=$?
set -e
NET_TAIL="$(python3 -c 'import json; print(json.dumps(open("'"$NET_OUT"'").read()[-800:]))')"
log "B" "debug-npm-docker-build.sh:registry" "alpine_registry_fetch" \
  "{\"exitCode\":$NET_EC,\"tail\":$NET_TAIL}"
# #endregion

build_probe() {
  local hyp="$1" tag="$2" base="$3"
  local dir="$WORKDIR/build-$tag"
  mkdir -p "$dir"
  cp "$ROOT/server/package.json" "$dir/"
  cp "$ROOT/server/package-lock.json" "$dir/" 2>/dev/null || true
  cat >"$dir/Dockerfile" <<EOF
FROM $base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN node -v && npm -v && cat /etc/os-release | head -5
RUN npm install --no-audit --no-fund
EOF
  local out="$WORKDIR/build-$tag.log"
  set +e
  docker build --no-cache -t "sickos-npm-probe-$tag" "$dir" >"$out" 2>&1
  local ec=$?
  set -e
  local tail
  tail="$(python3 -c 'import json; print(json.dumps(open("'"$out"'").read()[-1200:]))')"
  local hit
  hit="$(grep -c 'Exit handler never called' "$out" || true)"
  log "$hyp" "debug-npm-docker-build.sh:build:$tag" "docker_npm_install_probe" \
    "{\"base\":\"$base\",\"exitCode\":$ec,\"exitHandlerNeverCalled\":$hit,\"tail\":$tail}"
  docker rmi "sickos-npm-probe-$tag" >/dev/null 2>&1 || true
}

# --- H-E: node:22-alpine npm bug (known) ---
# #region agent log
build_probe "E" "22-alpine" "node:22-alpine"
# #endregion

# --- H-E2: node:20-alpine control ---
# #region agent log
build_probe "E2" "20-alpine" "node:20-alpine"
# #endregion

# --- H-E3: node:22-bookworm-slim control (debian, not alpine) ---
# #region agent log
build_probe "E3" "22-slim" "node:22-bookworm-slim"
# #endregion

# --- H-A2: kernel OOM after builds ---
# #region agent log
OOM="$(journalctl -k --no-pager -n 80 2>/dev/null | grep -iE 'oom|killed process' | tail -5 | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' || echo '""')"
log "A" "debug-npm-docker-build.sh:oom" "kernel_oom_check" "{\"recent\":$OOM}"
# #endregion

echo "Wrote diagnostics to $LOG"
