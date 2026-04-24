#!/bin/bash
# embed-overnight.sh — Run all missing embeddings with an auto-stop deadline
#
# Usage: bash scripts/embed-overnight.sh
# Stops at 11:00 AM local time (or when all done)

cd "$(dirname "$0")/.."

DEADLINE_HOUR=11  # Stop at 11am
LOG="output/embed-overnight-$(date +%Y%m%d-%H%M).log"
mkdir -p output

# Record start time to handle overnight wrap (start at 20:00, deadline 11:00 next day)
START_EPOCH=$(date +%s)
START_HOUR=$(date +%H)

echo "=== Overnight Embedding Run ===" | tee "$LOG"
echo "Started: $(date)" | tee -a "$LOG"
echo "Deadline: ${DEADLINE_HOUR}:00" | tee -a "$LOG"
echo "" | tee -a "$LOG"

check_deadline() {
  local current_hour=$(date +%H)
  # If we started in the evening (after deadline hour), only stop once we wrap past midnight
  # into the deadline hour range
  if [ "$START_HOUR" -ge "$DEADLINE_HOUR" ]; then
    # Started at night — only stop if it's now morning AND past deadline
    if [ "$current_hour" -ge "$DEADLINE_HOUR" ] && [ "$current_hour" -lt "$START_HOUR" ]; then
      echo "" | tee -a "$LOG"
      echo "DEADLINE REACHED (${DEADLINE_HOUR}:00) — stopping." | tee -a "$LOG"
      echo "Stopped: $(date)" | tee -a "$LOG"
      exit 0
    fi
  else
    # Started in the morning — simple check
    if [ "$current_hour" -ge "$DEADLINE_HOUR" ]; then
      echo "" | tee -a "$LOG"
      echo "DEADLINE REACHED (${DEADLINE_HOUR}:00) — stopping." | tee -a "$LOG"
      echo "Stopped: $(date)" | tee -a "$LOG"
      exit 0
    fi
  fi
}

run_model() {
  local table="$1"
  local model="$2"
  check_deadline
  echo "--- ${table} / ${model} ---" | tee -a "$LOG"
  node scripts/embed-multimodel.mjs --table="$table" --model="$model" --batch-size=50 --concurrency=5 2>&1 | tee -a "$LOG" || echo "  WARNING: ${table}/${model} exited with error, continuing..." | tee -a "$LOG"
  echo "" | tee -a "$LOG"
}

# Phase 1: Fill remaining gaps on posts (4 models done, 5 to go)
echo "=== Phase 1: Posts — remaining models ===" | tee -a "$LOG"
for col in embedding_qwen3 embedding_arctic2 embedding_nomic2; do
  run_model posts "$col"
done

# Phase 2: All 9 models on conversations (use unique column names to avoid substring matches)
echo "=== Phase 2: Conversations — all models ===" | tee -a "$LOG"
for col in embedding embedding_minilm embedding_bge_m3 embedding_qwen3 embedding_arctic2 embedding_nomic2; do
  run_model conversations "$col"
done

echo "" | tee -a "$LOG"
echo "=== ALL DONE ===" | tee -a "$LOG"
echo "Finished: $(date)" | tee -a "$LOG"
