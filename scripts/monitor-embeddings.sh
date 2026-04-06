#!/usr/bin/env bash
# Monitor embedding progress every 15 minutes
# Texts ALERT_PHONE via iMessage if repeated failures detected
set -e
cd "$(dirname "$0")/.."

PHONE="${ALERT_PHONE:-}"
if [ -z "$PHONE" ]; then
  # Load from .env
  PHONE=$(grep "^ALERT_PHONE=" "$(dirname "$0")/../.env" 2>/dev/null | cut -d= -f2)
fi
if [ -z "$PHONE" ]; then
  echo "ERROR: Set ALERT_PHONE in .env or environment"
  exit 1
fi
CHECK_INTERVAL=900  # 15 minutes
FAIL_THRESHOLD=3
fail_count=0
last_count=0

send_text() {
  osascript -e "tell application \"Messages\" to send \"$1\" to buddy \"$PHONE\"" 2>/dev/null
}

check_health() {
  # Check Flask API
  flask_ok=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4323/health --max-time 5 2>/dev/null)

  # Check Postgres
  pg_ok=$(PGPASSWORD=threads_local_dev psql -h localhost -p 5433 -U threads -d threads -c "SELECT 1" -t 2>/dev/null | tr -d ' ')

  # Check embedding progress
  embed_count=$(PGPASSWORD=threads_local_dev psql -h localhost -p 5433 -U threads -d threads -t -c "SELECT count(*) FROM posts WHERE embedding IS NOT NULL" 2>/dev/null | tr -d ' ')
  total_text=$(PGPASSWORD=threads_local_dev psql -h localhost -p 5433 -U threads -d threads -t -c "SELECT count(*) FROM posts WHERE text IS NOT NULL" 2>/dev/null | tr -d ' ')

  echo "[$(date '+%H:%M')] Flask: $flask_ok | PG: ${pg_ok:-down} | Embeddings: ${embed_count:-0}/${total_text:-?}"

  # Check for failures
  if [ "$flask_ok" != "200" ] || [ -z "$pg_ok" ]; then
    fail_count=$((fail_count + 1))
    echo "  FAIL #$fail_count"

    if [ "$fail_count" -ge "$FAIL_THRESHOLD" ]; then
      send_text "[threads-analysis] $fail_count consecutive failures. Flask: $flask_ok, PG: ${pg_ok:-down}, Embeddings: ${embed_count:-0}/${total_text:-?}"
      echo "  TEXTED alert"
      fail_count=0  # reset after alert
    fi
  else
    fail_count=0
  fi

  # Check if embeddings stalled (same count as last check)
  if [ -n "$embed_count" ] && [ "$embed_count" = "$last_count" ] && [ "$embed_count" != "0" ] && [ "$embed_count" != "$total_text" ]; then
    echo "  WARN: embedding count unchanged ($embed_count)"
    stall_count=$((stall_count + 1))
    if [ "$stall_count" -ge 2 ]; then
      send_text "[threads-analysis] Embeddings stalled at ${embed_count}/${total_text}. Check embed script."
      stall_count=0
    fi
  else
    stall_count=0
  fi

  last_count="$embed_count"
}

echo "=== Embedding Monitor ==="
echo "Checking every $((CHECK_INTERVAL/60)) minutes"
echo "Will text $PHONE after $FAIL_THRESHOLD consecutive failures"
echo ""

# Initial check
check_health

# Loop
while true; do
  sleep $CHECK_INTERVAL
  check_health
done
