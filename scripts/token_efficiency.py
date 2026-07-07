#!/usr/bin/env python3
"""Track Graphify-first token-efficiency estimates for Shore Sentinel work.

This tracker intentionally records estimates unless exact provider-side token
usage is supplied. It does not read OpenAI credentials or call external APIs.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_DATA_FILE = Path('.token-efficiency/shore-sentinel.jsonl')
DEFAULT_REPO = 'shore-sentinel-app'


def split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(',') if part.strip()]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def safe_git_commit(repo_root: Path) -> str | None:
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--short=8', 'HEAD'],
            cwd=repo_root,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
        )
        return result.stdout.strip() or None
    except Exception:
        return None


def graph_metadata(repo_root: Path = Path('.')) -> dict[str, Any]:
    graph_path = repo_root / 'graphify-out' / 'graph.json'
    report_path = repo_root / 'graphify-out' / 'GRAPH_REPORT.md'
    metadata: dict[str, Any] = {
        'graph_path': str(graph_path),
        'graph_exists': graph_path.exists(),
        'graph_commit': None,
        'graph_nodes': 0,
        'graph_links': 0,
        'graph_report_exists': report_path.exists(),
    }
    if not graph_path.exists():
        return metadata
    try:
        graph = json.loads(graph_path.read_text(encoding='utf-8'))
    except Exception as exc:
        metadata['graph_error'] = str(exc)
        return metadata
    nodes = graph.get('nodes', []) if isinstance(graph, dict) else []
    links = []
    if isinstance(graph, dict):
        links = graph.get('links') or graph.get('edges') or []
    metadata.update({
        'graph_commit': graph.get('built_at_commit') if isinstance(graph, dict) else None,
        'graph_nodes': len(nodes),
        'graph_links': len(links),
    })
    return metadata


def build_record(args: argparse.Namespace) -> dict[str, Any]:
    estimated_without = int(args.estimated_without)
    estimated_with = int(args.estimated_with)
    saved = max(0, estimated_without - estimated_with)
    savings_percent = round((saved / estimated_without * 100), 2) if estimated_without else 0.0
    candidate_files = split_csv(args.candidate_files)
    files_read = split_csv(args.files_read)
    files_avoided = max(0, len(candidate_files) - len(files_read))
    repo_root = Path(args.repo_root).resolve()
    graph = graph_metadata(repo_root)
    record = {
        'date': args.date or utc_now(),
        'repo': args.repo,
        'repo_commit': args.repo_commit or safe_git_commit(repo_root),
        'graph_commit': args.graph_commit or graph.get('graph_commit'),
        'graph_nodes': graph.get('graph_nodes'),
        'graph_links': graph.get('graph_links'),
        'task': args.task,
        'graphify_first': not args.no_graphify_first,
        'graph_query': args.graph_query,
        'graph_query_budget': int(args.graph_query_budget) if args.graph_query_budget else None,
        'query_hit': args.query_hit if args.query_hit is not None else bool(candidate_files or files_read),
        'candidate_files_found': candidate_files,
        'files_read_after_graphify': files_read,
        'files_avoided_count': files_avoided,
        'estimated_tokens_without_graphify': estimated_without,
        'estimated_tokens_with_graphify': estimated_with,
        'estimated_tokens_saved': saved,
        'estimated_savings_percent': savings_percent,
        'actual_input_tokens': int(args.actual_input_tokens) if args.actual_input_tokens is not None else None,
        'actual_output_tokens': int(args.actual_output_tokens) if args.actual_output_tokens is not None else None,
        'notes': args.notes or '',
        'estimates_only': args.actual_input_tokens is None and args.actual_output_tokens is None,
    }
    return record


def append_record(data_file: Path, record: dict[str, Any]) -> None:
    data_file.parent.mkdir(parents=True, exist_ok=True)
    with data_file.open('a', encoding='utf-8') as handle:
        handle.write(json.dumps(record, sort_keys=True) + '\n')


def load_records(data_file: Path) -> list[dict[str, Any]]:
    if not data_file.exists():
        return []
    records: list[dict[str, Any]] = []
    for line in data_file.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        records.append(json.loads(line))
    return records


def pct(numerator: int | float, denominator: int | float) -> float:
    return round((numerator / denominator * 100), 2) if denominator else 0.0


def build_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    tasks = len(records)
    graphify_first = sum(1 for r in records if r.get('graphify_first'))
    query_hits = sum(1 for r in records if r.get('query_hit'))
    total_without = sum(int(r.get('estimated_tokens_without_graphify') or 0) for r in records)
    total_with = sum(int(r.get('estimated_tokens_with_graphify') or 0) for r in records)
    total_saved = sum(int(r.get('estimated_tokens_saved') or 0) for r in records)
    files_avoided = sum(int(r.get('files_avoided_count') or 0) for r in records)
    actual_input = sum(int(r.get('actual_input_tokens') or 0) for r in records)
    actual_output = sum(int(r.get('actual_output_tokens') or 0) for r in records)
    top = sorted(records, key=lambda r: int(r.get('estimated_tokens_saved') or 0), reverse=True)[:5]
    return {
        'tasks': tasks,
        'graphify_first_tasks': graphify_first,
        'graphify_first_rate_percent': pct(graphify_first, tasks),
        'query_hit_tasks': query_hits,
        'query_hit_rate_percent': pct(query_hits, tasks),
        'estimated_tokens_without_graphify': total_without,
        'estimated_tokens_with_graphify': total_with,
        'estimated_tokens_saved': total_saved,
        'estimated_savings_percent': pct(total_saved, total_without),
        'files_avoided_count': files_avoided,
        'actual_input_tokens': actual_input or None,
        'actual_output_tokens': actual_output or None,
        'top_savings': [
            {
                'task': r.get('task'),
                'estimated_tokens_saved': r.get('estimated_tokens_saved'),
                'estimated_savings_percent': r.get('estimated_savings_percent'),
                'graph_commit': r.get('graph_commit'),
            }
            for r in top
        ],
    }


def render_summary(summary: dict[str, Any]) -> str:
    if not summary['tasks']:
        return 'No token-efficiency records found yet.'
    lines = [
        'Token efficiency summary',
        f"- Tasks logged: {summary['tasks']}",
        f"- Graphify-first rate: {summary['graphify_first_rate_percent']}% ({summary['graphify_first_tasks']}/{summary['tasks']})",
        f"- Query hit rate: {summary['query_hit_rate_percent']}% ({summary['query_hit_tasks']}/{summary['tasks']})",
        f"- Estimated tokens without Graphify: {summary['estimated_tokens_without_graphify']:,}",
        f"- Estimated tokens with Graphify: {summary['estimated_tokens_with_graphify']:,}",
        f"- Estimated tokens saved: {summary['estimated_tokens_saved']:,} ({summary['estimated_savings_percent']}%)",
        f"- Files avoided: {summary['files_avoided_count']}",
    ]
    if summary.get('actual_input_tokens') or summary.get('actual_output_tokens'):
        lines.append(f"- Actual provider tokens logged: {summary.get('actual_input_tokens') or 0:,} input / {summary.get('actual_output_tokens') or 0:,} output")
    lines.append('- Top savings:')
    for item in summary['top_savings']:
        lines.append(f"  - {item['task']}: {int(item.get('estimated_tokens_saved') or 0):,} tokens saved ({item.get('estimated_savings_percent')}%)")
    return '\n'.join(lines)


def add_common_data_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument('--data-file', type=Path, default=DEFAULT_DATA_FILE, help='JSONL data file path')


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description='Track Graphify-first token-efficiency estimates')
    sub = root.add_subparsers(dest='command', required=True)

    log = sub.add_parser('log', help='Append one token-efficiency record')
    add_common_data_arg(log)
    log.add_argument('--repo-root', default='.')
    log.add_argument('--repo', default=DEFAULT_REPO)
    log.add_argument('--repo-commit')
    log.add_argument('--graph-commit')
    log.add_argument('--date')
    log.add_argument('--task', required=True)
    log.add_argument('--graph-query', default='')
    log.add_argument('--graph-query-budget')
    log.add_argument('--candidate-files', default='')
    log.add_argument('--files-read', default='')
    log.add_argument('--estimated-without', required=True)
    log.add_argument('--estimated-with', required=True)
    log.add_argument('--actual-input-tokens')
    log.add_argument('--actual-output-tokens')
    log.add_argument('--notes')
    log.add_argument('--no-graphify-first', action='store_true')
    hit = log.add_mutually_exclusive_group()
    hit.add_argument('--query-hit', dest='query_hit', action='store_true')
    hit.add_argument('--query-miss', dest='query_hit', action='store_false')
    log.set_defaults(query_hit=None)

    summary = sub.add_parser('summary', help='Summarize token-efficiency records')
    add_common_data_arg(summary)
    summary.add_argument('--json', action='store_true')

    meta = sub.add_parser('graph-meta', help='Show Graphify graph metadata for this repo')
    meta.add_argument('--repo-root', default='.')
    meta.add_argument('--json', action='store_true')

    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    if args.command == 'log':
        record = build_record(args)
        append_record(args.data_file, record)
        print(f"logged token-efficiency record: {record['task']} ({record['estimated_tokens_saved']:,} estimated tokens saved)")
        return 0
    if args.command == 'summary':
        summary = build_summary(load_records(args.data_file))
        print(json.dumps(summary, indent=2, sort_keys=True) if args.json else render_summary(summary))
        return 0
    if args.command == 'graph-meta':
        meta = graph_metadata(Path(args.repo_root).resolve())
        print(json.dumps(meta, indent=2, sort_keys=True) if args.json else '\n'.join(f'{k}: {v}' for k, v in meta.items()))
        return 0
    raise AssertionError(args.command)


if __name__ == '__main__':
    raise SystemExit(main())
