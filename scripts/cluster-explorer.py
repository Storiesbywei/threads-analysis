#!/usr/bin/env python3
"""
cluster-explorer.py — HDBSCAN clustering on embeddings, Gemma 4 as navigator

Pipeline:
1. Pull embeddings from Postgres (all-minilm 384d — fast clustering)
2. UMAP dimensionality reduction (384d → 15d for HDBSCAN, 384d → 2d for viz)
3. HDBSCAN clustering — finds emergent topics without predefined k
4. Gemma 4 names each cluster by reading representative posts
5. Store results back to Postgres
6. Output JSON for Grafana

Usage: python3 scripts/cluster-explorer.py [--model=all-minilm] [--min-cluster=15]
"""

import os
import sys
import json
import time
import urllib.request
import psycopg2
import numpy as np

# --- Config ---
DB_URL = os.environ.get('DATABASE_URL', 'postgres://threads:threads_local_dev@localhost:5433/threads')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
GEMMA_MODEL = 'gemma4:e4b'

# Parse args
args = {}
for a in sys.argv[1:]:
    if a.startswith('--'):
        k, _, v = a[2:].partition('=')
        args[k] = v or 'true'

EMBEDDING_COL = {
    'all-minilm': 'embedding_minilm',
    'nomic': 'embedding',
    'bge-m3': 'embedding_bge_m3',
    'mxbai': 'embedding_mxbai',
}.get(args.get('model', 'all-minilm'), 'embedding_minilm')

MIN_CLUSTER_SIZE = int(args.get('min-cluster', '15'))
UMAP_DIM = int(args.get('umap-dim', '15'))

print("Cluster Explorer — Gemma 4 Navigator")
print("=" * 40)
print(f"Embedding: {EMBEDDING_COL}")
print(f"Min cluster size: {MIN_CLUSTER_SIZE}")
print(f"UMAP reduction: → {UMAP_DIM}d (clustering) + 2d (viz)")
print()

# --- Step 1: Pull embeddings ---
print("Step 1: Loading embeddings from Postgres...")
conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

cur.execute(f"""
    SELECT id, text, timestamp, sentiment, energy, intent,
           {EMBEDDING_COL}::text
    FROM posts
    WHERE {EMBEDDING_COL} IS NOT NULL AND text IS NOT NULL AND LENGTH(text) > 10
    ORDER BY timestamp
""")
rows = cur.fetchall()
print(f"  Loaded {len(rows)} posts with embeddings")

post_ids = [r[0] for r in rows]
texts = [r[1] for r in rows]
timestamps = [r[2] for r in rows]
sentiments = [r[3] for r in rows]
energies = [r[4] for r in rows]
intents = [r[5] for r in rows]

# Parse embedding vectors
embeddings = []
for r in rows:
    vec_str = r[6]
    # Format: [0.1,0.2,...]
    vec = json.loads(vec_str) if vec_str.startswith('[') else [float(x) for x in vec_str.strip('[]').split(',')]
    embeddings.append(vec)

X = np.array(embeddings, dtype=np.float32)
print(f"  Matrix shape: {X.shape}")

# --- Step 2: UMAP ---
print("\nStep 2: UMAP dimensionality reduction...")
from umap import UMAP

# For clustering (higher dims preserve structure)
umap_cluster = UMAP(n_components=UMAP_DIM, metric='cosine', n_neighbors=30, min_dist=0.0, random_state=42)
X_cluster = umap_cluster.fit_transform(X)
print(f"  Clustering projection: {X_cluster.shape}")

# For visualization (2D)
umap_viz = UMAP(n_components=2, metric='cosine', n_neighbors=30, min_dist=0.1, random_state=42)
X_viz = umap_viz.fit_transform(X)
print(f"  Viz projection: {X_viz.shape}")

# --- Step 3: HDBSCAN ---
print("\nStep 3: HDBSCAN clustering...")
import hdbscan

clusterer = hdbscan.HDBSCAN(
    min_cluster_size=MIN_CLUSTER_SIZE,
    min_samples=5,
    metric='euclidean',
    cluster_selection_method='eom',
    core_dist_n_jobs=1,
)
labels = clusterer.fit_predict(X_cluster)
n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
n_noise = (labels == -1).sum()
print(f"  Clusters found: {n_clusters}")
print(f"  Noise points: {n_noise} ({n_noise/len(labels)*100:.1f}%)")

# --- Step 4: Gemma 4 names clusters ---
print(f"\nStep 4: Gemma 4 naming {n_clusters} clusters...")

def ask_gemma(prompt, max_tokens=200):
    payload = json.dumps({
        "model": GEMMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": max_tokens, "temperature": 0.3}
    }).encode()
    req = urllib.request.Request(f"{OLLAMA_URL}/api/generate", data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())["response"].strip()

cluster_info = []
for cluster_id in range(n_clusters):
    mask = labels == cluster_id
    cluster_indices = np.where(mask)[0]
    cluster_size = len(cluster_indices)

    # Get representative posts (closest to cluster center)
    cluster_embeddings = X_cluster[mask]
    centroid = cluster_embeddings.mean(axis=0)
    distances = np.linalg.norm(cluster_embeddings - centroid, axis=1)
    closest = distances.argsort()[:8]

    sample_texts = [texts[cluster_indices[i]][:200] for i in closest]
    sample_str = "\n---\n".join(sample_texts)

    # Avg sentiment and dominant energy/intent
    cluster_sentiments = [sentiments[i] for i in cluster_indices if sentiments[i] is not None]
    avg_sentiment = np.mean(cluster_sentiments) if cluster_sentiments else 0

    cluster_energies = [energies[i] for i in cluster_indices if energies[i] is not None]
    dominant_energy = max(set(cluster_energies), key=cluster_energies.count) if cluster_energies else 'unknown'

    cluster_intents = [intents[i] for i in cluster_indices if intents[i] is not None]
    dominant_intent = max(set(cluster_intents), key=cluster_intents.count) if cluster_intents else 'unknown'

    # Date range
    cluster_dates = sorted([timestamps[i] for i in cluster_indices if timestamps[i]])
    date_start = cluster_dates[0].strftime('%Y-%m-%d') if cluster_dates else 'unknown'
    date_end = cluster_dates[-1].strftime('%Y-%m-%d') if cluster_dates else 'unknown'

    # Ask Gemma to name it
    prompt = f"""These are 8 representative posts from a cluster of {cluster_size} social media posts by the account owner.
Give this cluster:
1. A short name (2-5 words, like a topic label)
2. A one-sentence description of what connects these posts

Posts:
{sample_str}

Respond in exactly this format:
Name: [cluster name]
Description: [one sentence]"""

    try:
        response = ask_gemma(prompt)
        name_line = [l for l in response.split('\n') if l.startswith('Name:')]
        desc_line = [l for l in response.split('\n') if l.startswith('Description:')]
        name = name_line[0].replace('Name:', '').strip() if name_line else f'Cluster {cluster_id}'
        description = desc_line[0].replace('Description:', '').strip() if desc_line else 'No description'
    except Exception as e:
        name = f'Cluster {cluster_id}'
        description = f'Error: {e}'

    info = {
        'cluster_id': cluster_id,
        'name': name,
        'description': description,
        'size': cluster_size,
        'avg_sentiment': round(float(avg_sentiment), 3),
        'dominant_energy': dominant_energy,
        'dominant_intent': dominant_intent,
        'date_start': date_start,
        'date_end': date_end,
        'centroid_x': float(X_viz[cluster_indices].mean(axis=0)[0]),
        'centroid_y': float(X_viz[cluster_indices].mean(axis=0)[1]),
    }
    cluster_info.append(info)
    print(f"  [{cluster_id}] {name} ({cluster_size} posts) — {description[:80]}")

# --- Step 5: Store to Postgres ---
print(f"\nStep 5: Storing results to Postgres...")

cur.execute("""
    CREATE TABLE IF NOT EXISTS embedding_clusters (
        id SERIAL PRIMARY KEY,
        cluster_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        size INTEGER,
        avg_sentiment REAL,
        dominant_energy TEXT,
        dominant_intent TEXT,
        date_start DATE,
        date_end DATE,
        centroid_x REAL,
        centroid_y REAL,
        model TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )
""")

cur.execute("""
    CREATE TABLE IF NOT EXISTS post_clusters (
        post_id TEXT NOT NULL,
        cluster_id INTEGER NOT NULL,
        umap_x REAL,
        umap_y REAL,
        probability REAL,
        model TEXT NOT NULL,
        PRIMARY KEY (post_id, model)
    )
""")

# Clear previous results for this model
model_name = args.get('model', 'all-minilm')
cur.execute("DELETE FROM embedding_clusters WHERE model = %s", (model_name,))
cur.execute("DELETE FROM post_clusters WHERE model = %s", (model_name,))

# Insert cluster info
for info in cluster_info:
    cur.execute("""
        INSERT INTO embedding_clusters (cluster_id, name, description, size, avg_sentiment,
            dominant_energy, dominant_intent, date_start, date_end, centroid_x, centroid_y, model)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (info['cluster_id'], info['name'], info['description'], info['size'],
          info['avg_sentiment'], info['dominant_energy'], info['dominant_intent'],
          info['date_start'], info['date_end'], info['centroid_x'], info['centroid_y'], model_name))

# Insert post assignments (batch)
print(f"  Inserting {len(post_ids)} post cluster assignments...")
probs = getattr(clusterer, 'probabilities_', np.ones(len(labels)))
batch = []
for i in range(len(post_ids)):
    batch.append((post_ids[i], int(labels[i]), float(X_viz[i][0]), float(X_viz[i][1]),
                  float(probs[i]), model_name))
    if len(batch) >= 1000:
        cur.executemany("""
            INSERT INTO post_clusters (post_id, cluster_id, umap_x, umap_y, probability, model)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (post_id, model) DO UPDATE SET
                cluster_id = EXCLUDED.cluster_id, umap_x = EXCLUDED.umap_x,
                umap_y = EXCLUDED.umap_y, probability = EXCLUDED.probability
        """, batch)
        batch = []
if batch:
    cur.executemany("""
        INSERT INTO post_clusters (post_id, cluster_id, umap_x, umap_y, probability, model)
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (post_id, model) DO UPDATE SET
            cluster_id = EXCLUDED.cluster_id, umap_x = EXCLUDED.umap_x,
            umap_y = EXCLUDED.umap_y, probability = EXCLUDED.probability
    """, batch)

conn.commit()
print(f"  Done! {n_clusters} clusters + {len(post_ids)} assignments stored.")

# --- Summary ---
print(f"\n{'=' * 40}")
print(f"CLUSTERS FOUND: {n_clusters}")
print(f"NOISE: {n_noise} posts ({n_noise/len(labels)*100:.1f}%)")
print(f"{'=' * 40}")
for info in sorted(cluster_info, key=lambda x: x['size'], reverse=True)[:20]:
    print(f"  [{info['cluster_id']:2d}] {info['size']:5d} posts  {info['name']}")
print(f"\nRun again with different models: --model=bge-m3, --model=mxbai, --model=nomic")

cur.close()
conn.close()
