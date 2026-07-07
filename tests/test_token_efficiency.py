import json
import tempfile
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))

import token_efficiency


class TokenEfficiencyTests(unittest.TestCase):
    def test_log_entry_computes_saved_tokens_and_percent(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_file = Path(tmp) / 'shore-sentinel.jsonl'
            rc = token_efficiency.main([
                'log',
                '--data-file', str(data_file),
                '--task', 'Find API port',
                '--graph-query', 'What is the API port of shore sentinel?',
                '--graph-query-budget', '1000',
                '--candidate-files', '.env.example,docker-compose.yml,api/Dockerfile',
                '--files-read', '.env.example,docker-compose.yml',
                '--estimated-without', '6000',
                '--estimated-with', '1800',
                '--graph-commit', 'cfc799e5',
            ])
            self.assertEqual(rc, 0)
            record = json.loads(data_file.read_text().strip())
            self.assertEqual(record['estimated_tokens_saved'], 4200)
            self.assertEqual(record['estimated_savings_percent'], 70.0)
            self.assertTrue(record['graphify_first'])
            self.assertTrue(record['query_hit'])
            self.assertEqual(record['files_avoided_count'], 1)

    def test_summary_reports_totals_and_top_savings(self):
        with tempfile.TemporaryDirectory() as tmp:
            data_file = Path(tmp) / 'shore-sentinel.jsonl'
            records = [
                {
                    'date': '2026-07-07T00:00:00Z',
                    'repo': 'shore-sentinel-app',
                    'task': 'Find API port',
                    'graphify_first': True,
                    'query_hit': True,
                    'estimated_tokens_without_graphify': 6000,
                    'estimated_tokens_with_graphify': 1800,
                    'estimated_tokens_saved': 4200,
                    'estimated_savings_percent': 70.0,
                    'files_avoided_count': 1,
                },
                {
                    'date': '2026-07-07T01:00:00Z',
                    'repo': 'shore-sentinel-app',
                    'task': 'No graph task',
                    'graphify_first': False,
                    'query_hit': False,
                    'estimated_tokens_without_graphify': 2000,
                    'estimated_tokens_with_graphify': 2000,
                    'estimated_tokens_saved': 0,
                    'estimated_savings_percent': 0.0,
                    'files_avoided_count': 0,
                },
            ]
            data_file.write_text('\n'.join(json.dumps(r) for r in records) + '\n')
            summary = token_efficiency.build_summary(token_efficiency.load_records(data_file))
            self.assertEqual(summary['tasks'], 2)
            self.assertEqual(summary['graphify_first_rate_percent'], 50.0)
            self.assertEqual(summary['query_hit_rate_percent'], 50.0)
            self.assertEqual(summary['estimated_tokens_saved'], 4200)
            self.assertEqual(summary['top_savings'][0]['task'], 'Find API port')

    def test_graph_metadata_reads_networkx_links_shape(self):
        with tempfile.TemporaryDirectory() as tmp:
            graph = Path(tmp) / 'graphify-out' / 'graph.json'
            graph.parent.mkdir()
            graph.write_text(json.dumps({
                'built_at_commit': 'abc123',
                'nodes': [{'id': 'a'}, {'id': 'b'}],
                'links': [{'source': 'a', 'target': 'b'}],
            }))
            meta = token_efficiency.graph_metadata(Path(tmp))
            self.assertEqual(meta['graph_commit'], 'abc123')
            self.assertEqual(meta['graph_nodes'], 2)
            self.assertEqual(meta['graph_links'], 1)


if __name__ == '__main__':
    unittest.main()
