#!/usr/bin/env bash
# Run ON the VPS (e.g. root@server1:/opt/bad-qb) to diagnose:
#   Bind for 127.0.0.1:5433 failed: port is already allocated
#   Network bad-qb_default Resource is still in use
#
# Prints NDJSON lines. Copy the whole output back into the Cursor chat,
# or:  bash scripts/debug-vps-5433.sh | tee /tmp/bad-qb-debug.ndjson
set -u

log() {
  local hyp="$1" msg="$2" data="$3"
  printf '{"sessionId":"907e89","runId":"vps-pre","hypothesisId":"%s","location":"debug-vps-5433.sh","message":"%s","data":%s,"timestamp":%s}\n' \
    "$hyp" "$msg" "$data" "$(date +%s%3N)"
}

escape() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || sed 's/"/\\"/g; s/^/"/; s/$/"/'
}

# H-A: docker container already publishing 5433
PORTS="$(docker ps -a --format '{{.ID}} {{.Names}} {{.Ports}} {{.Status}}' 2>/dev/null | grep -E '5433|NAMES' || true)"
log "A" "containers_mentioning_5433" "$(printf '%s' "$PORTS" | escape)"

# H-B: host process (non-docker) on 5433
SS="$(ss -tlnp 2>/dev/null | grep -E ':5433\b' || true)"
log "B" "ss_listen_5433" "$(printf '%s' "$SS" | escape)"

# H-C: compose file on this host publishes 5433 / wrong compose file
COMPOSE_HITS=""
for d in /opt/bad-qb /opt/sickos-league; do
  if [[ -d "$d" ]]; then
    COMPOSE_HITS+=$'\n'"DIR=$d"$'\n'
    COMPOSE_HITS+="$(ls -la "$d"/docker-compose*.yml 2>/dev/null || true)"$'\n'
    COMPOSE_HITS+="$(grep -nE '5433|ports:|container_name|project' "$d"/docker-compose*.yml 2>/dev/null || true)"$'\n'
  fi
done
log "C" "compose_files_5433" "$(printf '%s' "$COMPOSE_HITS" | escape)"

# H-D: bad-qb_default still has endpoints after compose down
NET="$(docker network inspect bad-qb_default 2>&1 || true)"
log "D" "network_bad_qb_default" "$(printf '%s' "$NET" | escape)"

# H-E: other compose projects / orphan containers on docker networks
ALL="$(docker ps -a --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}\t{{.Labels}}' 2>&1 | head -80)"
log "E" "all_containers" "$(printf '%s' "$ALL" | escape)"

NETS="$(docker network ls 2>&1)"
log "E" "all_networks" "$(printf '%s' "$NETS" | escape)"

echo "# done — paste NDJSON lines above into Cursor" >&2
