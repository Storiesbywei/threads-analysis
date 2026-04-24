#!/usr/bin/env bash
# Start the full threads-analysis stack
set -e
cd "$(dirname "$0")/.."

echo "Starting threads-analysis stack..."

# 1. Postgres
docker compose up -d
echo "  Postgres: localhost:5433"

# 2. Ollama (use homebrew, not Ollama.app — qwen3.5)
if ! curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  /opt/homebrew/bin/ollama serve &>/dev/null &
  sleep 2
  echo "  Ollama: started"
else
  echo "  Ollama: already running"
fi

# 3. API server
if lsof -ti:4322 >/dev/null 2>&1; then
  echo "  API: already running on :4322"
else
  DATABASE_URL="postgres://threads:threads_local_dev@localhost:5433/threads" \
    nohup node scripts/api-server.mjs > /tmp/threads-api.log 2>&1 &
  echo "  API: started on :4322 (log: /tmp/threads-api.log)"
fi

sleep 1
echo ""
echo "Health check:"
curl -s http://localhost:4322/api/health | python3 -m json.tool 2>/dev/null || echo "  API not ready yet, check /tmp/threads-api.log"
echo ""
echo "Tailscale: http://100.71.141.45:4322"
echo "Grafana:   http://localhost:3000/d/threads-analysis"
echo "OpenAPI:   http://localhost:4322/api/openapi.json"
