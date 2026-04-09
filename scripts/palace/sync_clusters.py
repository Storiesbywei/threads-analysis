#!/usr/bin/env python3
"""
sync_clusters.py — Convert HDBSCAN cluster results into palace graph topology.

Reads from embedding_clusters + post_clusters tables (written by cluster-explorer.py)
and creates the tp_ palace graph:

  Wing  = each HDBSCAN cluster (named by Gemma 4)
  Room  = time-based sub-divisions (quarterly buckets within each cluster)
  Drawer = post references (zero duplication — points to posts.id)

Also detects cross-cluster relationships:
  relates_to  — clusters with overlapping themes (high centroid cosine similarity)
  evolves_to  — temporal evolution (same theme, different time periods)
  contradicts — clusters with opposing sentiment on similar topics

Usage: python3 scripts/palace/sync_clusters.py [--model=all-minilm] [--rebuild]
"""

import os
import sys
import json
import time
import psycopg2
import numpy as np
from pathlib import Path

DB_URL = os.environ.get('DATABASE_URL', 'postgres://threads:threads_local_dev@localhost:5433/threads')

# Parse args
args = {}
for a in sys.argv[1:]:
    if a.startswith('--'):
        k, _, v = a[2:].partition('=')
        args[k] = v or 'true'

MODEL = args.get('model', 'all-minilm')
REBUILD = args.get('rebuild', 'false') == 'true'

print("Palace Graph Sync — Clusters → Topology")
print("=" * 45)
print(f"Model: {MODEL}")
print(f"Rebuild: {REBUILD}")
print()

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# --- Step 0: Ensure schema ---
print("Step 0: Ensuring palace schema...")
schema_path = Path(__file__).parent / 'schema.sql'
cur.execute(schema_path.read_text())
conn.commit()
print("  Schema ready.")

# --- Step 1: Clear previous topology if rebuilding ---
if REBUILD:
    print("\nStep 1: Clearing previous palace topology...")
    cur.execute("DELETE FROM tp_agent_memories")
    cur.execute("DELETE FROM tp_drawer_refs")
    cur.execute("DELETE FROM tp_edges")
    cur.execute("DELETE FROM tp_nodes")
    conn.commit()
    print("  Cleared.")
else:
    print("\nStep 1: Incremental sync (use --rebuild to clear)")
    # Remove existing nodes for this model
    cur.execute("DELETE FROM tp_drawer_refs WHERE drawer_id LIKE %s", (f'drawer:{MODEL}:%',))
    cur.execute("DELETE FROM tp_edges WHERE source_id LIKE %s OR target_id LIKE %s",
                (f'%:{MODEL}:%', f'%:{MODEL}:%'))
    cur.execute("DELETE FROM tp_nodes WHERE node_id LIKE %s", (f'%:{MODEL}:%',))
    conn.commit()

# --- Step 2: Load cluster data ---
print("\nStep 2: Loading cluster data from Postgres...")
cur.execute("""
    SELECT cluster_id, name, description, size, avg_sentiment,
           dominant_energy, dominant_intent, date_start, date_end,
           centroid_x, centroid_y
    FROM embedding_clusters
    WHERE model = %s
    ORDER BY size DESC
""", (MODEL,))
clusters = cur.fetchall()
print(f"  Loaded {len(clusters)} clusters")

if not clusters:
    print("  No clusters found! Run cluster-explorer.py first.")
    sys.exit(1)

# Load post assignments
cur.execute("""
    SELECT post_id, cluster_id, umap_x, umap_y, probability
    FROM post_clusters
    WHERE model = %s AND cluster_id >= 0
    ORDER BY cluster_id, probability DESC
""", (MODEL,))
post_assignments = cur.fetchall()
print(f"  Loaded {len(post_assignments)} post assignments")

# Load post timestamps for time-bucketing
cur.execute("""
    SELECT pc.post_id, p.timestamp, p.text
    FROM post_clusters pc
    JOIN posts p ON p.id = pc.post_id
    WHERE pc.model = %s AND pc.cluster_id >= 0
""", (MODEL,))
post_meta = {r[0]: {'timestamp': r[1], 'text': r[2]} for r in cur.fetchall()}

# --- Step 3: Create wing nodes (one per cluster) ---
print("\nStep 3: Creating palace topology...")
wing_count = 0
room_count = 0
drawer_count = 0
edge_count = 0

for cluster in clusters:
    cid, name, desc, size, sentiment, energy, intent, d_start, d_end, cx, cy = cluster
    wing_id = f"wing:{MODEL}:{cid}"

    cur.execute("""
        INSERT INTO tp_nodes (node_id, node_type, label, metadata)
        VALUES (%s, 'wing', %s, %s)
        ON CONFLICT (node_id) DO UPDATE SET label = EXCLUDED.label, metadata = EXCLUDED.metadata
    """, (wing_id, name, json.dumps({
        'cluster_id': cid,
        'model': MODEL,
        'size': size,
        'description': desc,
        'avg_sentiment': sentiment,
        'dominant_energy': energy,
        'dominant_intent': intent,
        'date_start': str(d_start) if d_start else None,
        'date_end': str(d_end) if d_end else None,
        'centroid_x': cx,
        'centroid_y': cy,
    })))
    wing_count += 1

print(f"  Wings: {wing_count}")

# --- Step 4: Create room nodes (quarterly time buckets per cluster) ---
print("\nStep 4: Creating time-bucketed rooms...")

# Group posts by cluster
from collections import defaultdict
cluster_posts = defaultdict(list)
for post_id, cid, ux, uy, prob in post_assignments:
    if post_id in post_meta and post_meta[post_id]['timestamp']:
        cluster_posts[cid].append({
            'post_id': post_id,
            'timestamp': post_meta[post_id]['timestamp'],
            'umap_x': ux, 'umap_y': uy, 'probability': prob,
        })

for cid, posts in cluster_posts.items():
    wing_id = f"wing:{MODEL}:{cid}"

    # Bucket by quarter
    quarters = defaultdict(list)
    for p in posts:
        ts = p['timestamp']
        q = f"{ts.year}-Q{(ts.month - 1) // 3 + 1}"
        quarters[q].append(p)

    for q_label, q_posts in sorted(quarters.items()):
        room_id = f"room:{MODEL}:{cid}:{q_label}"
        cur.execute("""
            INSERT INTO tp_nodes (node_id, node_type, label, metadata)
            VALUES (%s, 'room', %s, %s)
            ON CONFLICT (node_id) DO UPDATE SET metadata = EXCLUDED.metadata
        """, (room_id, q_label, json.dumps({
            'cluster_id': cid,
            'quarter': q_label,
            'post_count': len(q_posts),
        })))
        room_count += 1

        # Wing → Room containment edge
        cur.execute("""
            INSERT INTO tp_edges (source_id, target_id, relationship)
            VALUES (%s, %s, 'contains')
            ON CONFLICT (source_id, target_id, relationship) DO NOTHING
        """, (wing_id, room_id))
        edge_count += 1

        # Create drawer refs (posts in this room)
        for p in q_posts:
            drawer_id = f"drawer:{MODEL}:{cid}:{p['post_id'][:12]}"

            # Upsert drawer node
            cur.execute("""
                INSERT INTO tp_nodes (node_id, node_type, label, metadata)
                VALUES (%s, 'drawer', %s, %s)
                ON CONFLICT (node_id) DO NOTHING
            """, (drawer_id, f"post-{p['post_id'][:8]}", json.dumps({
                'umap_x': p['umap_x'], 'umap_y': p['umap_y'],
                'probability': p['probability'],
            })))

            # Room → Drawer containment
            cur.execute("""
                INSERT INTO tp_edges (source_id, target_id, relationship)
                VALUES (%s, %s, 'contains')
                ON CONFLICT (source_id, target_id, relationship) DO NOTHING
            """, (room_id, drawer_id))

            # Drawer → Post reference
            cur.execute("""
                INSERT INTO tp_drawer_refs (drawer_id, post_id, relevance_score)
                VALUES (%s, %s, %s)
                ON CONFLICT (drawer_id, post_id) DO UPDATE SET relevance_score = EXCLUDED.relevance_score
            """, (drawer_id, p['post_id'], p['probability']))
            drawer_count += 1

    # Commit per cluster to avoid massive transaction
    if cid % 5 == 0:
        conn.commit()

conn.commit()
print(f"  Rooms: {room_count}")
print(f"  Drawers: {drawer_count}")
print(f"  Containment edges: {edge_count + drawer_count}")

# --- Step 5: Cross-cluster edges ---
print("\nStep 5: Detecting cross-cluster relationships...")

centroids = []
for cluster in clusters:
    cid, name, desc, size, sentiment, energy, intent, d_start, d_end, cx, cy = cluster
    centroids.append({
        'cid': cid, 'name': name, 'sentiment': sentiment or 0,
        'energy': energy, 'intent': intent,
        'cx': cx or 0, 'cy': cy or 0,
        'd_start': d_start, 'd_end': d_end,
    })

cross_edges = 0
for i in range(len(centroids)):
    for j in range(i + 1, len(centroids)):
        a, b = centroids[i], centroids[j]

        # UMAP centroid distance (2D) — proxy for semantic similarity
        dist = np.sqrt((a['cx'] - b['cx'])**2 + (a['cy'] - b['cy'])**2)

        # relates_to: close centroids (themes overlap)
        if dist < 3.0:
            weight = float(max(0.1, 1.0 - dist / 3.0))
            wing_a = f"wing:{MODEL}:{a['cid']}"
            wing_b = f"wing:{MODEL}:{b['cid']}"
            cur.execute("""
                INSERT INTO tp_edges (source_id, target_id, relationship, weight)
                VALUES (%s, %s, 'relates_to', %s)
                ON CONFLICT (source_id, target_id, relationship) DO UPDATE SET weight = EXCLUDED.weight
            """, (wing_a, wing_b, weight))
            cur.execute("""
                INSERT INTO tp_edges (source_id, target_id, relationship, weight)
                VALUES (%s, %s, 'relates_to', %s)
                ON CONFLICT (source_id, target_id, relationship) DO UPDATE SET weight = EXCLUDED.weight
            """, (wing_b, wing_a, weight))
            cross_edges += 2

        # contradicts: close themes but opposing sentiment
        if dist < 4.0 and a['sentiment'] and b['sentiment']:
            sent_diff = float(abs(a['sentiment'] - b['sentiment']))
            if sent_diff > 0.4:
                wing_a = f"wing:{MODEL}:{a['cid']}"
                wing_b = f"wing:{MODEL}:{b['cid']}"
                cur.execute("""
                    INSERT INTO tp_edges (source_id, target_id, relationship, weight)
                    VALUES (%s, %s, 'contradicts', %s)
                    ON CONFLICT (source_id, target_id, relationship) DO UPDATE SET weight = EXCLUDED.weight
                """, (wing_a, wing_b, sent_diff))
                cross_edges += 1

conn.commit()
print(f"  Cross-cluster edges: {cross_edges}")

# --- Step 6: Topology summary ---
cur.execute("SELECT COUNT(*) FROM tp_nodes")
total_nodes = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM tp_edges")
total_edges = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM tp_drawer_refs")
total_refs = cur.fetchone()[0]

print(f"\n{'=' * 45}")
print(f"PALACE TOPOLOGY SYNCED")
print(f"  Nodes:  {total_nodes} (wings: {wing_count}, rooms: {room_count}, drawers: {drawer_count})")
print(f"  Edges:  {total_edges}")
print(f"  Refs:   {total_refs}")
print(f"{'=' * 45}")

# Output compact topology (what gets loaded at session start)
topology = {"v": 1, "wings": [], "model": MODEL}
for cluster in clusters:
    cid, name, desc, size, sentiment, energy, intent, d_start, d_end, cx, cy = cluster
    topology["wings"].append({
        "i": f"wing:{MODEL}:{cid}",
        "l": name,
        "n": size,
        "s": round(sentiment, 2) if sentiment else 0,
        "e": energy,
    })

topo_json = json.dumps(topology, separators=(',', ':'))
print(f"\nTopology JSON: {len(topo_json)} chars")
print(topo_json[:500] + "..." if len(topo_json) > 500 else topo_json)

cur.close()
conn.close()
print("\nDone.")
