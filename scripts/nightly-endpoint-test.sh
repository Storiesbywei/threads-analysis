#!/bin/bash
# Nightly API endpoint health check
# Runs all endpoints, logs pass/fail + response time
# Gemma/LLM endpoints get extra buffer time between calls

FLASK="http://100.71.141.45:4323"
NODE="http://100.71.141.45:4322"
LOG_DIR="/Users/weixiangzhang/Local_Dev/projects/threads-analysis/logs"
DATE=$(date '+%Y-%m-%d')
LOG="$LOG_DIR/endpoint-test-$DATE.log"

PASS=0
FAIL=0
SKIP=0
TOTAL=0

test_endpoint() {
  local label="$1"
  local url="$2"
  local timeout="${3:-10}"
  local is_llm="${4:-false}"

  TOTAL=$((TOTAL + 1))

  # Buffer before LLM endpoints so Gemma doesn't choke
  if [ "$is_llm" = "true" ]; then
    echo "  [buffer] waiting 5s before LLM endpoint..." >> "$LOG"
    sleep 5
  fi

  start=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null)
  end=$(date +%s%N 2>/dev/null || python3 -c "import time; print(int(time.time()*1e9))")

  # Calculate ms (macOS date doesn't support %N, fallback)
  if [ "$start" = "%N" ] || [ -z "$start" ]; then
    ms="?"
  else
    ms=$(( (end - start) / 1000000 ))
  fi

  if [ "$status" = "200" ]; then
    echo "  PASS  ${ms}ms  $status  $label" >> "$LOG"
    PASS=$((PASS + 1))
  elif [ "$status" = "000" ]; then
    echo "  FAIL  timeout  ---  $label" >> "$LOG"
    FAIL=$((FAIL + 1))
  else
    echo "  FAIL  ${ms}ms  $status  $label" >> "$LOG"
    FAIL=$((FAIL + 1))
  fi
}

# Use python3 for timing since macOS date doesn't support %N
time_ms() {
  python3 -c "import time; print(int(time.time()*1000))"
}

# Override with python3 timing
test_endpoint() {
  local label="$1"
  local url="$2"
  local timeout="${3:-10}"
  local is_llm="${4:-false}"

  TOTAL=$((TOTAL + 1))

  if [ "$is_llm" = "true" ]; then
    echo "  [buffer] waiting 5s before LLM endpoint..." >> "$LOG"
    sleep 5
  fi

  start=$(time_ms)
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$timeout" "$url" 2>/dev/null)
  end=$(time_ms)
  ms=$((end - start))

  if [ "$status" = "200" ]; then
    echo "  PASS  ${ms}ms  $status  $label" >> "$LOG"
    PASS=$((PASS + 1))
  elif [ "$status" = "000" ]; then
    echo "  FAIL  timeout  ---  $label" >> "$LOG"
    FAIL=$((FAIL + 1))
  else
    echo "  FAIL  ${ms}ms  $status  $label" >> "$LOG"
    FAIL=$((FAIL + 1))
  fi
}

echo "========================================" >> "$LOG"
echo "Nightly Endpoint Test — $(date)" >> "$LOG"
echo "========================================" >> "$LOG"
echo "" >> "$LOG"

# --- Flask API (:4323) ---
echo "--- Flask API ($FLASK) ---" >> "$LOG"

# Health & utility
test_endpoint "GET /health" "$FLASK/health"
test_endpoint "GET /llms.txt" "$FLASK/llms.txt"
test_endpoint "GET /llms-mini.txt" "$FLASK/llms-mini.txt"
test_endpoint "GET /who-am-i" "$FLASK/who-am-i"

# Stats
test_endpoint "GET /stats/overview" "$FLASK/stats/overview"
test_endpoint "GET /stats/tags" "$FLASK/stats/tags"
test_endpoint "GET /stats/daily" "$FLASK/stats/daily"
test_endpoint "GET /stats/hourly" "$FLASK/stats/hourly"
test_endpoint "GET /stats/streak" "$FLASK/stats/streak"
test_endpoint "GET /stats/velocity" "$FLASK/stats/velocity"
test_endpoint "GET /stats/top?by=views&n=5" "$FLASK/stats/top?by=views&n=5"
test_endpoint "GET /stats/top/today" "$FLASK/stats/top/today"

# Posts — time windows
test_endpoint "GET /posts/latest" "$FLASK/posts/latest"
test_endpoint "GET /posts/today" "$FLASK/posts/today"
test_endpoint "GET /posts/now" "$FLASK/posts/now"
test_endpoint "GET /posts/hour" "$FLASK/posts/hour"
test_endpoint "GET /posts/week" "$FLASK/posts/week"
test_endpoint "GET /posts/month" "$FLASK/posts/month"
test_endpoint "GET /posts/random" "$FLASK/posts/random"
test_endpoint "GET /posts/since?minutes=60" "$FLASK/posts/since?minutes=60"
test_endpoint "GET /posts/between?from=2025-01-01&to=2025-01-02" "$FLASK/posts/between?from=2025-01-01&to=2025-01-02"

# Posts — search
test_endpoint "GET /posts/search?q=philosophy" "$FLASK/posts/search?q=philosophy"
test_endpoint "GET /posts/tag/AI" "$FLASK/posts/tag/AI"
test_endpoint "GET /posts/tag/AI/latest" "$FLASK/posts/tag/AI/latest"
test_endpoint "GET /posts/random/AI" "$FLASK/posts/random/AI"

# Posts — vector (needs embeddings, longer timeout)
test_endpoint "GET /posts/semantic-search?q=teaching" "$FLASK/posts/semantic-search?q=teaching" 30 true
test_endpoint "GET /posts/similar/17851770864673120" "$FLASK/posts/similar/17851770864673120" 15

# Analysis
test_endpoint "GET /analysis/sentiment" "$FLASK/analysis/sentiment"
test_endpoint "GET /analysis/energy" "$FLASK/analysis/energy"
test_endpoint "GET /analysis/intent" "$FLASK/analysis/intent"
test_endpoint "GET /analysis/language" "$FLASK/analysis/language"
test_endpoint "GET /analysis/hours" "$FLASK/analysis/hours"

# Social
test_endpoint "GET /social/mentions" "$FLASK/social/mentions"
test_endpoint "GET /social/interactions" "$FLASK/social/interactions"

# Knowledge graph
test_endpoint "GET /graph/topics" "$FLASK/graph/topics"
test_endpoint "GET /graph/related/AI" "$FLASK/graph/related/AI"

# Digests (LLM-powered — buffer these)
test_endpoint "GET /digest/today" "$FLASK/digest/today" 60 true
test_endpoint "GET /digest/week" "$FLASK/digest/week" 60 true
test_endpoint "GET /digest/brief" "$FLASK/digest/brief" 60 true

# Vibe & mood
test_endpoint "GET /vibe/now" "$FLASK/vibe/now"
test_endpoint "GET /mood" "$FLASK/mood"

# Tech genealogy
test_endpoint "GET /genealogy/topics" "$FLASK/genealogy/topics"
test_endpoint "GET /genealogy/timeline" "$FLASK/genealogy/timeline"
test_endpoint "GET /genealogy/connections" "$FLASK/genealogy/connections"
test_endpoint "GET /genealogy/evolution?topic=claude" "$FLASK/genealogy/evolution?topic=claude"
test_endpoint "GET /genealogy/brief" "$FLASK/genealogy/brief" 60 true

# Pedagogy
test_endpoint "GET /pedagogy/topics" "$FLASK/pedagogy/topics"
test_endpoint "GET /pedagogy/timeline" "$FLASK/pedagogy/timeline"
test_endpoint "GET /pedagogy/connections" "$FLASK/pedagogy/connections"
test_endpoint "GET /pedagogy/evolution?topic=mentorship" "$FLASK/pedagogy/evolution?topic=mentorship"
test_endpoint "GET /pedagogy/brief" "$FLASK/pedagogy/brief" 60 true
test_endpoint "GET /pedagogy/vector-search?q=teaching" "$FLASK/pedagogy/vector-search?q=teaching" 30 true

# Semantic analysis
test_endpoint "GET /bridges" "$FLASK/bridges" 15
test_endpoint "GET /drift" "$FLASK/drift" 15

# Haiku
test_endpoint "GET /haiku/latest" "$FLASK/haiku/latest"
test_endpoint "GET /haiku/all" "$FLASK/haiku/all"

echo "" >> "$LOG"

# --- Node API (:4322) ---
echo "--- Node API ($NODE) ---" >> "$LOG"

test_endpoint "GET /api/health" "$NODE/api/health"
test_endpoint "GET /api/posts" "$NODE/api/posts"
test_endpoint "GET /api/posts/recent" "$NODE/api/posts/recent"
test_endpoint "GET /api/posts/random" "$NODE/api/posts/random"
test_endpoint "GET /api/posts/today" "$NODE/api/posts/today"
test_endpoint "GET /api/posts/search?q=philosophy" "$NODE/api/posts/search?q=philosophy"
test_endpoint "GET /api/posts/stats" "$NODE/api/posts/stats"
test_endpoint "GET /api/tags" "$NODE/api/tags"
test_endpoint "GET /api/tags/cloud" "$NODE/api/tags/cloud"
test_endpoint "GET /api/metrics/top" "$NODE/api/metrics/top"
test_endpoint "GET /api/metrics/summary" "$NODE/api/metrics/summary"
test_endpoint "GET /api/metrics/daily" "$NODE/api/metrics/daily"
test_endpoint "GET /api/graph/nodes" "$NODE/api/graph/nodes"
test_endpoint "GET /api/graph/edges" "$NODE/api/graph/edges"
test_endpoint "GET /api/analysis/surprise" "$NODE/api/analysis/surprise"
test_endpoint "GET /api/analysis/entropy" "$NODE/api/analysis/entropy"
test_endpoint "GET /api/analysis/timeline" "$NODE/api/analysis/timeline"

# Node RAG endpoint (LLM — extra buffer, longer timeout)
test_endpoint "GET /api/ask?q=what+topics+do+I+post+about" "$NODE/api/ask?q=what+topics+do+I+post+about" 120 true

echo "" >> "$LOG"

# --- Summary ---
echo "========================================" >> "$LOG"
echo "RESULTS: $PASS pass / $FAIL fail / $TOTAL total" >> "$LOG"
echo "Finished: $(date)" >> "$LOG"
echo "========================================" >> "$LOG"

# Also print to stdout for cron mail
echo "Endpoint test $DATE: $PASS pass / $FAIL fail / $TOTAL total"
