#!/usr/bin/env bash
# Refresh the local Graphify navigation artifacts. They are intentionally untracked.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! command -v graphify >/dev/null 2>&1; then
  echo "graphify is required; install Graphify and retry." >&2
  exit 127
fi

head_sha="$(git rev-parse HEAD)"
generated_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cli_version="$(graphify --version)"

graphify update . --force --no-cluster
graphify cluster-only . --no-label --no-viz
graphify tree --graph graphify-out/graph.json --output graphify-out/GRAPH_TREE.html --root "$repo_root" --label "Shore Sentinel"

python3 -c 'import json, sys; from pathlib import Path; graph_path = Path("graphify-out/graph.json"); graph = json.loads(graph_path.read_text(encoding="utf-8")); relationship_key = "links" if "links" in graph else "edges"; freshness = {"source_head": sys.argv[1], "generated_at_utc": sys.argv[2], "graphify_cli_version": sys.argv[3], "node_count": len(graph.get("nodes", [])), "relationship_count": len(graph.get(relationship_key, [])), "relationship_key": relationship_key}; Path("graphify-out/FRESHNESS.json").write_text(json.dumps(freshness, indent=2) + "\n", encoding="utf-8"); print(json.dumps(freshness, sort_keys=True))' "$head_sha" "$generated_at" "$cli_version"
