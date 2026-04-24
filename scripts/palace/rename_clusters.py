#!/usr/bin/env python3
"""
rename_clusters.py — Re-name clusters using Gemma 4 via /api/chat endpoint.

The initial cluster-explorer.py used /api/generate which doesn't work well
with Gemma's thinking model. This script uses /api/chat with think=False
to get reliable Name: / Description: output.

Updates embedding_clusters.name and .description in-place, then propagates
to tp_nodes.label and tp_nodes.metadata.

Usage: python3 scripts/palace/rename_clusters.py [--model=all-minilm] [--force]
"""

import os
import sys
import json
import time
import urllib.request
import psycopg2

DB_URL = os.environ.get('DATABASE_URL', 'postgres://threads:threads_local_dev@localhost:5433/threads')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
GEMMA_MODEL = os.environ.get('GEMMA_MODEL', 'qwen3.5')

args = {}
for a in sys.argv[1:]:
    if a.startswith('--'):
        k, _, v = a[2:].partition('=')
        args[k] = v or 'true'

MODEL = args.get('model', 'all-minilm')
FORCE = args.get('force', 'false') == 'true'

print("Cluster Re-Naming — Gemma 4 via /api/chat")
print("=" * 45)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Get clusters that need naming
if FORCE:
    cur.execute("""
        SELECT cluster_id, name, size FROM embedding_clusters
        WHERE model = %s ORDER BY size DESC
    """, (MODEL,))
else:
    # Only re-name clusters still called "Cluster N"
    cur.execute("""
        SELECT cluster_id, name, size FROM embedding_clusters
        WHERE model = %s AND name ~ '^Cluster [0-9]+$'
        ORDER BY size DESC
    """, (MODEL,))

clusters = cur.fetchall()
print(f"Clusters to name: {len(clusters)} (model: {MODEL}, force: {FORCE})")
print()


def ask_gemma_chat(prompt, max_tokens=200):
    """Use /api/chat with think=False for reliable structured output."""
    payload = json.dumps({
        "model": GEMMA_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "think": False,
        "options": {"num_predict": max_tokens, "temperature": 0.3}
    }).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat", data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["message"]["content"].strip()


named = 0
failed = 0

for cid, current_name, size in clusters:
    # Get representative posts
    cur.execute("""
        SELECT LEFT(p.text, 250)
        FROM post_clusters pc
        JOIN posts p ON p.id = pc.post_id
        WHERE pc.model = %s AND pc.cluster_id = %s AND p.text IS NOT NULL
        ORDER BY pc.probability DESC
        LIMIT 8
    """, (MODEL, cid))
    sample_texts = [r[0] for r in cur.fetchall()]

    if not sample_texts:
        print(f"  [{cid}] SKIP — no texts")
        continue

    # Get cluster metadata
    cur.execute("""
        SELECT avg_sentiment, dominant_energy, dominant_intent
        FROM embedding_clusters
        WHERE model = %s AND cluster_id = %s
    """, (MODEL, cid))
    meta = cur.fetchone()
    sentiment = meta[0] if meta else 0
    energy = meta[1] if meta else 'unknown'
    intent = meta[2] if meta else 'unknown'

    sample_str = "\n---\n".join(sample_texts)

    prompt = f"""These are 8 representative posts from a cluster of {size} social media posts by the account owner.
The cluster has avg sentiment {sentiment:.2f}, dominant energy "{energy}", dominant intent "{intent}".

Posts:
{sample_str}

Give this cluster:
1. A short name (2-5 words, like a topic label)
2. A one-sentence description of what connects these posts

Respond in EXACTLY this format (two lines, nothing else):
Name: [cluster name]
Description: [one sentence]"""

    try:
        response = ask_gemma_chat(prompt)
        lines = response.strip().split('\n')

        name = None
        description = None
        for line in lines:
            if line.strip().startswith('Name:'):
                name = line.split('Name:', 1)[1].strip().strip('"').strip("'")
            elif line.strip().startswith('Description:'):
                description = line.split('Description:', 1)[1].strip().strip('"').strip("'")

        if not name or len(name) < 3:
            name = None

        if name:
            # Update embedding_clusters
            cur.execute("""
                UPDATE embedding_clusters SET name = %s, description = %s
                WHERE model = %s AND cluster_id = %s
            """, (name, description or '', MODEL, cid))

            # Update tp_nodes wing label
            wing_id = f"wing:{MODEL}:{cid}"
            cur.execute("""
                UPDATE tp_nodes SET label = %s,
                    metadata = jsonb_set(metadata, '{description}', %s::jsonb)
                WHERE node_id = %s
            """, (name, json.dumps(description or ''), wing_id))

            conn.commit()
            named += 1
            print(f"  [{cid:3d}] {size:5d} posts  {name}")
            if description:
                print(f"         {description[:80]}")
        else:
            failed += 1
            print(f"  [{cid:3d}] FAILED — response: {response[:100]}")

    except Exception as e:
        failed += 1
        print(f"  [{cid:3d}] ERROR — {e}")

    # Small delay to not overwhelm Ollama
    time.sleep(0.2)

print(f"\n{'=' * 45}")
print(f"Named: {named} / {len(clusters)}")
print(f"Failed: {failed}")
print(f"{'=' * 45}")

cur.close()
conn.close()
