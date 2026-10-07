#!/bin/sh
# Pull-based automatic deploy (installed as broadroads-autodeploy.timer, runs
# every 5 minutes as root). Deploys origin/main when:
#   - it has a new commit,
#   - every GitHub check on that commit passed (CI: unit + browser tests),
#   - no match is being played (waits up to 45 minutes, then deploys anyway).
# After the restart it checks /api/health; if the server does not come up it
# rolls back to the previous commit and never retries the bad one.
# No secrets needed: the repository and its check results are public.
set -eu
APP=${APP_DIR:-/opt/broadroads}
REPO=${REPO:-canoguzhan/broadroads}
STATE=/var/lib/broadroads-autodeploy
HEALTH=${HEALTH_URL:-http://127.0.0.1:8080/api/health}
mkdir -p "$STATE"
exec 9> "$STATE/lock"
flock -n 9 || exit 0
cd "$APP"
G="git -c safe.directory=$APP"
log() { echo "autodeploy: $*"; }

$G fetch -q origin main
NEW=$($G rev-parse origin/main)
OLD=$($G rev-parse HEAD)
[ "$NEW" = "$OLD" ] && exit 0
grep -qx "$NEW" "$STATE/bad" 2>/dev/null && exit 0

# 1. CI must be green for this exact commit.
CHECKS=$(curl -fsS --max-time 20 -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$REPO/commits/$NEW/check-runs") || { log "GitHub unreachable"; exit 0; }
TOTAL=$(echo "$CHECKS" | jq '.check_runs | length')
PENDING=$(echo "$CHECKS" | jq '[.check_runs[] | select(.status != "completed")] | length')
FAILED=$(echo "$CHECKS" | jq '[.check_runs[] | select(.status == "completed" and (.conclusion | IN("success","skipped","neutral") | not))] | length')
if [ "$TOTAL" -eq 0 ] || [ "$PENDING" -gt 0 ]; then log "waiting for CI on $(echo "$NEW" | cut -c1-7)"; exit 0; fi
if [ "$FAILED" -gt 0 ]; then log "CI failed on $NEW, not deploying"; echo "$NEW" >> "$STATE/bad"; exit 0; fi

# 2. Don't cut off live matches (but don't wait forever either).
MATCHES=$(curl -fsS --max-time 5 "$HEALTH" | jq -r '.matches // 0' 2>/dev/null || echo 0)
if [ "$MATCHES" -gt 0 ]; then
  [ "$(cat "$STATE/waiting" 2>/dev/null | cut -d' ' -f1)" = "$NEW" ] || echo "$NEW $(date +%s)" > "$STATE/waiting"
  SINCE=$(cut -d' ' -f2 "$STATE/waiting")
  if [ $(( $(date +%s) - SINCE )) -lt 2700 ]; then log "$MATCHES live match(es), deploying later"; exit 0; fi
  log "waited 45 minutes, deploying with $MATCHES live match(es)"
fi
rm -f "$STATE/waiting"

# Keep an installed studio's unit file in step with the repo (limits, paths).
studio_unit() {
  U=/etc/systemd/system/broadroads-studio.service
  if [ -f "$U" ] && ! cmp -s "$APP/deploy/broadroads-studio.service" "$U"; then
    cp "$APP/deploy/broadroads-studio.service" "$U" && systemctl daemon-reload
  fi
}

# Chained with && on purpose: `set -e` does not apply inside `install ... && healthy`.
install() {
  $G checkout -q -- package-lock.json 2>/dev/null || true
  $G reset -q --hard "$1" &&
    npm ci --no-audit --no-fund --loglevel=error &&
    npm run build --silent &&
    npm prune --omit=dev --no-audit --no-fund --loglevel=error &&
    $G checkout -q -- package-lock.json &&
    chown -R broadroads:broadroads "$APP" &&
    systemctl restart broadroads &&
    { studio_unit; systemctl try-restart broadroads-studio || true; }
}
healthy() {
  i=0
  while [ $i -lt 30 ]; do
    curl -fsS --max-time 3 "$HEALTH" > /dev/null 2>&1 && return 0
    sleep 2; i=$((i + 1))
  done
  return 1
}

log "deploying $OLD -> $NEW"
if install "$NEW" && healthy; then
  log "deployed $NEW"
  echo "$(date -u +%FT%TZ) $NEW" >> "$STATE/history"
else
  log "deploy of $NEW failed, rolling back to $OLD"
  echo "$NEW" >> "$STATE/bad"
  install "$OLD" && healthy && log "rolled back to $OLD" || log "ROLLBACK FAILED, check the server"
  exit 1
fi
