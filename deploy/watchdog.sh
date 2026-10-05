#!/bin/sh
# Restarts the game server if its health endpoint stops answering
# (three failed checks in a row). Installed as broadroads-watchdog.timer.
STATE=/run/broadroads-watchdog.failures
URL=${HEALTH_URL:-http://127.0.0.1:8080/api/health}
if curl -fsS --max-time 5 "$URL" > /dev/null; then
  rm -f "$STATE"
  exit 0
fi
n=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$STATE"
echo "health check failed ($n)"
if [ "$n" -ge 3 ]; then
  echo "restarting broadroads"
  rm -f "$STATE"
  systemctl restart broadroads
fi
