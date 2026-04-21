#!/usr/bin/env python3
"""
navigate.py — Gemma 4 routed traversal through threads palace graph.

The palace is an INDEX over HDBSCAN clusters. Content lives in posts table.
Gemma routes through the hierarchy locally (~1,125 tokens, invisible to caller).
Only final results surface.

Hierarchy:
  Wing (cluster theme) → Room (time bucket) → Drawer (post ref)

Usage:
  python3 scripts/palace/navigate.py "surveillance capitalism"
  python3 scripts/palace/navigate.py "what do I post about late at night" --limit=20
  python3 scripts/palace/navigate.py --topology  # just print the map
  python3 scripts/palace/navigate.py --interactive  # REPL mode
"""

import os
import sys
import json
import time
import urllib.request
import psycopg2
import numpy as np

DB_URL = os.environ.get('DATABASE_URL', 'postgres://threads:threads_local_dev@localhost:5433/threads')
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434')
GEMMA_MODEL = os.environ.get('GEMMA_MODEL', 'qwen3:14b')
EMBED_MODEL = 'all-minilm'

# Parse args
args = {}
positional = []
for a in sys.argv[1:]:
    if a.startswith('--'):
        k, _, v = a[2:].partition('=')
        args[k] = v or 'true'
    else:
        positional.append(a)

LIMIT = int(args.get('limit', '10'))
MODEL = args.get('model', 'all-minilm')


class PalaceNavigator:
    """Gemma-routed traversal through threads palace graph."""

    def __init__(self, db_url, ollama_url):
        self.conn = psycopg2.connect(db_url)
        self.cur = self.conn.cursor()
        self.ollama_url = ollama_url
        self._gemma_available = None

    def close(self):
        self.cur.close()
        self.conn.close()

    # ── Topology (<3K tokens) ────────────────────────────────────── #

    def load_topology(self):
        """Load wing-level map. This is all that's needed at session start."""
        self.cur.execute("""
            SELECT n.node_id, n.label, n.metadata,
                   COUNT(e.target_id) AS room_count
            FROM tp_nodes n
            LEFT JOIN tp_edges e ON e.source_id = n.node_id
                                AND e.relationship = 'contains'
            WHERE n.node_type = 'wing'
            GROUP BY n.node_id, n.label, n.metadata
            ORDER BY (n.metadata->>'size')::int DESC NULLS LAST
        """)
        wings = []
        for row in self.cur.fetchall():
            meta = row[2] if isinstance(row[2], dict) else json.loads(row[2]) if row[2] else {}
            wings.append({
                "i": row[0], "l": row[1],
                "n": meta.get('size', 0),
                "rooms": int(row[3]),
                "s": meta.get('avg_sentiment', 0),
                "e": meta.get('dominant_energy', ''),
            })

        # Cross-cluster edges
        self.cur.execute("""
            SELECT source_id, target_id, relationship, weight
            FROM tp_edges
            WHERE relationship IN ('relates_to', 'contradicts', 'evolves_to')
            ORDER BY weight DESC
            LIMIT 50
        """)
        xedges = [[r[0], r[1], r[2], round(r[3], 2)] for r in self.cur.fetchall()]

        return {"v": 1, "wings": wings, "xedges": xedges, "model": MODEL}

    def list_rooms(self, wing_id):
        """On-demand: rooms within a wing."""
        self.cur.execute("""
            SELECT n.node_id, n.label, n.metadata,
                   COUNT(ce.target_id) AS drawer_count
            FROM tp_nodes n
            JOIN tp_edges e ON e.target_id = n.node_id
                           AND e.source_id = %s
                           AND e.relationship = 'contains'
            LEFT JOIN tp_edges ce ON ce.source_id = n.node_id
                                 AND ce.relationship = 'contains'
            WHERE n.node_type = 'room'
            GROUP BY n.node_id, n.label, n.metadata
            ORDER BY n.label
        """, (wing_id,))
        return [{
            "i": r[0], "l": r[1],
            "n": int(r[3]),
            "meta": r[2] if isinstance(r[2], dict) else json.loads(r[2]) if r[2] else {},
        } for r in self.cur.fetchall()]

    # ── Gemma routing ────────────────────────────────────────────── #

    def _check_gemma(self):
        if self._gemma_available is not None:
            return self._gemma_available
        try:
            req = urllib.request.Request(f"{self.ollama_url}/api/tags", method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                self._gemma_available = resp.status == 200
        except Exception:
            self._gemma_available = False
        return self._gemma_available

    def _ask_gemma_route(self, query, candidates, level, top_k=3):
        """Ask Gemma to pick the most relevant candidates."""
        cand_text = "\n".join(
            f"  {c['i']}: {c['l']} ({c.get('n', 0)} items)"
            + (f" [sentiment: {c.get('s', '')}]" if c.get('s') else "")
            + (f" [energy: {c.get('e', '')}]" if c.get('e') else "")
            for c in candidates
        )

        prompt = f"""You are navigating a knowledge graph of social media posts to find relevant content.

QUERY: {query}

AVAILABLE {level.upper()}S:
{cand_text}

Which {level}s are most likely to contain posts relevant to the query?
Pick the top {top_k}, ranked by relevance.

Respond with ONLY this JSON (no explanation):
{{"ids": ["id1", "id2"]}}"""

        payload = json.dumps({
            "model": GEMMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "think": False,
            "options": {"temperature": 0, "num_predict": 150},
        }).encode()

        req = urllib.request.Request(
            f"{self.ollama_url}/api/chat", data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            response = json.loads(resp.read())["message"]["content"].strip()

        return self._parse_ids(response, candidates, top_k)

    def _parse_ids(self, response, candidates, top_k):
        """Extract IDs from Gemma's JSON response."""
        import re
        valid_ids = {c['i'] for c in candidates}

        # Try JSON parse
        match = re.search(r'\{[^}]*"ids"\s*:\s*\[([^\]]*)\][^}]*\}', response, re.DOTALL)
        if match:
            try:
                extracted = json.loads('{"ids":[' + match.group(1) + ']}')
                ids = [i for i in extracted["ids"] if i in valid_ids]
                if ids:
                    return ids[:top_k]
            except (json.JSONDecodeError, KeyError):
                pass

        # Fallback: quoted strings matching valid IDs
        quoted = re.findall(r'"([^"]+)"', response)
        ids = [q for q in quoted if q in valid_ids]
        if ids:
            return list(dict.fromkeys(ids))[:top_k]

        # Positional fallback
        return [c['i'] for c in candidates[:top_k]]

    # ── Embedding for vector search ──────────────────────────────── #

    def _embed(self, text):
        """Embed query via Ollama for vector refinement."""
        payload = json.dumps({
            "model": EMBED_MODEL,
            "input": text,
        }).encode()
        req = urllib.request.Request(
            f"{self.ollama_url}/api/embed", data=payload,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
            return data["embeddings"][0]

    # ── Full traversal ───────────────────────────────────────────── #

    def traverse(self, query, limit=10, use_gemma=True):
        """
        Gemma-routed hierarchical traversal.

        Token budget (all local, invisible to caller):
          Level 0 (wings):  ~200 tokens
          Level 1 (rooms):  ~375 tokens
          Level 2 (vector): pgvector refinement
          Total: ~575-1,125 tokens (LOCAL, free)
        """
        t0 = time.monotonic()
        path = []

        topology = self.load_topology()
        wings = topology['wings']
        if not wings:
            return {'posts': [], 'path': [], 'latency_ms': 0}

        # ── Level 0: Wing selection ──
        if use_gemma and self._check_gemma() and len(wings) > 3:
            selected_wing_ids = self._ask_gemma_route(query, wings, "wing", top_k=min(4, len(wings)))
            path.append(f"gemma:wings:{selected_wing_ids}")
        else:
            selected_wing_ids = [w['i'] for w in wings[:4]]
            path.append(f"fallback:wings:{selected_wing_ids}")

        # ── Level 1: Room selection ──
        all_rooms = []
        for wid in selected_wing_ids:
            all_rooms.extend(self.list_rooms(wid))

        if all_rooms and use_gemma and self._check_gemma() and len(all_rooms) > 5:
            selected_room_ids = self._ask_gemma_route(query, all_rooms, "room", top_k=min(6, len(all_rooms)))
            path.append(f"gemma:rooms:{selected_room_ids}")
        elif all_rooms:
            selected_room_ids = [r['i'] for r in all_rooms[:6]]
            path.append(f"fallback:rooms:{selected_room_ids}")
        else:
            selected_room_ids = selected_wing_ids

        # ── Level 2: Vector refinement within scope ──
        # Get all post_ids within selected rooms/wings
        scope_ids = selected_room_ids or selected_wing_ids
        placeholders = ','.join(['%s'] * len(scope_ids))

        self.cur.execute(f"""
            SELECT DISTINCT dr.post_id
            FROM tp_drawer_refs dr
            JOIN tp_nodes d ON d.node_id = dr.drawer_id
            JOIN tp_edges e ON e.target_id = d.node_id AND e.relationship = 'contains'
            WHERE e.source_id IN ({placeholders})
        """, scope_ids)
        scoped_post_ids = [r[0] for r in self.cur.fetchall()]
        path.append(f"scope:{len(scoped_post_ids)}_posts")

        if not scoped_post_ids:
            # Fallback: search all posts
            scoped_post_ids = None

        # Vector search within scope
        embedding_col = {
            'all-minilm': 'embedding_minilm',
            'nomic': 'embedding',
            'bge-m3': 'embedding_bge_m3',
            'mxbai': 'embedding_bge_m3',
        }.get(MODEL, 'embedding_minilm')

        try:
            query_vec = self._embed(query)
            vec_str = '[' + ','.join(map(str, query_vec)) + ']'

            if scoped_post_ids and len(scoped_post_ids) < 50000:
                id_placeholders = ','.join(['%s'] * len(scoped_post_ids))
                self.cur.execute(f"""
                    SELECT id, text, timestamp, sentiment, energy, intent,
                           1 - ({embedding_col}::vector <=> %s::vector) AS score
                    FROM posts
                    WHERE id IN ({id_placeholders})
                      AND {embedding_col} IS NOT NULL
                    ORDER BY {embedding_col}::vector <=> %s::vector
                    LIMIT %s
                """, [vec_str] + scoped_post_ids + [vec_str, limit])
            else:
                self.cur.execute(f"""
                    SELECT id, text, timestamp, sentiment, energy, intent,
                           1 - ({embedding_col}::vector <=> %s::vector) AS score
                    FROM posts
                    WHERE {embedding_col} IS NOT NULL
                    ORDER BY {embedding_col}::vector <=> %s::vector
                    LIMIT %s
                """, [vec_str, vec_str, limit])

            posts = []
            for r in self.cur.fetchall():
                posts.append({
                    'id': r[0],
                    'text': r[1][:300] if r[1] else '',
                    'timestamp': r[2].isoformat() if r[2] else None,
                    'sentiment': r[3],
                    'energy': r[4],
                    'intent': r[5],
                    'score': round(float(r[6]), 4),
                })
            path.append(f"vector:{len(posts)}_results")

        except Exception as e:
            posts = []
            path.append(f"vector_error:{e}")

        latency = int((time.monotonic() - t0) * 1000)
        return {
            'query': query,
            'posts': posts,
            'path': path,
            'latency_ms': latency,
            'model': MODEL,
        }

    # ── Summarize with Gemma ─────────────────────────────────────── #

    def summarize(self, query, posts):
        """Ask Gemma to synthesize findings from traversal results."""
        if not posts:
            return "No relevant posts found."

        posts_text = "\n---\n".join(
            f"[{p.get('timestamp', '?')}] (sentiment: {p.get('sentiment', '?')}, energy: {p.get('energy', '?')})\n{p['text']}"
            for p in posts[:8]
        )

        prompt = f"""You are analyzing social media posts by the account owner.

Question: {query}

Relevant posts (ranked by semantic similarity):
{posts_text}

Provide a concise, insightful answer (3-5 sentences) that directly addresses the question.
Note any patterns in timing, sentiment, or energy."""

        payload = json.dumps({
            "model": GEMMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "think": False,
            "options": {"temperature": 0.3, "num_predict": 400},
        }).encode()

        try:
            req = urllib.request.Request(
                f"{self.ollama_url}/api/chat", data=payload,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())["message"]["content"].strip()
        except Exception as e:
            return f"(Gemma unavailable: {e})"


# ── CLI ──────────────────────────────────────────────────────────── #

def main():
    nav = PalaceNavigator(DB_URL, OLLAMA_URL)

    if args.get('topology') == 'true':
        topo = nav.load_topology()
        print(json.dumps(topo, indent=2, default=str))
        nav.close()
        return

    if args.get('interactive') == 'true':
        print("Palace Navigator — Interactive Mode")
        print("=" * 40)
        topo = nav.load_topology()
        print(f"Loaded {len(topo['wings'])} topic wings, {len(topo.get('xedges', []))} cross-links")
        print()
        for w in topo['wings'][:15]:
            print(f"  {w['l']} ({w['n']} posts, sentiment: {w.get('s', '?')})")
        print()
        print("Type a query to navigate, 'topo' for topology, 'quit' to exit.")
        print()

        while True:
            try:
                query = input("navigate> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not query or query == 'quit':
                break
            if query == 'topo':
                topo = nav.load_topology()
                print(json.dumps(topo, indent=2, default=str))
                continue

            result = nav.traverse(query, limit=LIMIT)
            print(f"\n  Path: {' → '.join(result['path'])}")
            print(f"  Latency: {result['latency_ms']}ms")
            print(f"  Results: {len(result['posts'])}")
            print()
            for p in result['posts']:
                print(f"  [{p['timestamp'][:10] if p.get('timestamp') else '?'}] "
                      f"(s:{p.get('sentiment', '?')}, e:{p.get('energy', '?')}) "
                      f"score:{p['score']}")
                print(f"    {p['text'][:120]}")
                print()

            # Gemma summary
            if result['posts'] and nav._check_gemma():
                print("  --- Gemma Summary ---")
                summary = nav.summarize(query, result['posts'])
                print(f"  {summary}")
                print()

        nav.close()
        return

    # Single query mode
    if not positional:
        print("Usage: python3 scripts/palace/navigate.py \"your query here\"")
        print("       python3 scripts/palace/navigate.py --topology")
        print("       python3 scripts/palace/navigate.py --interactive")
        nav.close()
        return

    query = ' '.join(positional)
    print(f"Navigating: \"{query}\"")
    print()

    result = nav.traverse(query, limit=LIMIT)
    print(f"Path: {' → '.join(result['path'])}")
    print(f"Latency: {result['latency_ms']}ms")
    print(f"Results: {len(result['posts'])}")
    print()

    for p in result['posts']:
        print(f"[{p['timestamp'][:10] if p.get('timestamp') else '?'}] "
              f"(s:{p.get('sentiment', '?')}, e:{p.get('energy', '?')}) "
              f"score:{p['score']}")
        print(f"  {p['text'][:150]}")
        print()

    if result['posts'] and nav._check_gemma():
        print("--- Gemma Summary ---")
        summary = nav.summarize(query, result['posts'])
        print(summary)

    nav.close()


if __name__ == '__main__':
    main()
