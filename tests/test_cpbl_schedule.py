import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/fetch_cpbl.py'
spec = importlib.util.spec_from_file_location('fetch_cpbl', SCRIPT)
cpbl = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cpbl)


def game(kind='A', day='2026-10-01', number=1):
    return {'Year': '2026', 'KindCode': kind, 'GameSno': number,
            'GameDate': day + 'T00:00:00', 'GameResult': ''}


def response(games):
    return {'Success': True, 'GameDatas': json.dumps(games)}


class ScheduleTests(unittest.TestCase):
    def fetch(self, replies):
        with tempfile.NamedTemporaryFile() as cookie:
            with patch.object(cpbl, 'curl_get', return_value=('page', 'cookie', cookie.name)), \
                    patch.object(cpbl, 'extract_js_tokens', return_value=['opts', 'games']), \
                    patch.object(cpbl, 'curl_post_json', side_effect=replies) as post, \
                    patch.object(cpbl.os, 'unlink'):
                result = cpbl.fetch_schedule(2026)
        return result, post

    def test_regular_and_postseason_are_separate_verified_scopes(self):
        result, post = self.fetch([response([game()]), response([game('E')]), response([game('C')])])
        self.assertEqual({g['KindCode'] for g in result}, {'A', 'E', 'C'})
        self.assertEqual([call.args[1]['kindCode'] for call in post.call_args_list], ['A', 'E', 'C'])
        for call in post.call_args_list:
            self.assertEqual(call.args[0], 'https://www.cpbl.com.tw/schedule/getgamedatas')
            self.assertEqual(call.args[1]['calendar'], '2026/01/01')
            self.assertEqual(call.args[1]['teamNo'], '')
            self.assertEqual(call.args[2], 'games')

    def test_unannounced_postseason_zero_games_is_valid(self):
        result, _ = self.fetch([response([game()]), response([]), response([])])
        self.assertEqual(result, [game()])

    def test_partial_failure_cannot_replace_a_season(self):
        result, _ = self.fetch([response([game()]), RuntimeError('HTTP 404')])
        self.assertIsNone(result)

    def test_missing_array_cannot_be_confused_with_valid_empty(self):
        with self.assertRaises(ValueError):
            cpbl.validate_schedule_response({'Success': True}, 2026, 'E')

    def test_wrong_year_kind_and_invalid_dates_reject(self):
        for bad in (dict(game(), KindCode='C'), dict(game(), Year='2025'),
                    dict(game(), GameDate='2026-02-30'), dict(game(), GameDate='2025-10-01')):
            with self.subTest(game=bad), self.assertRaises(ValueError):
                cpbl.validate_schedule_response(response([bad]), 2026, 'A')

    def test_same_number_on_rescheduled_day_and_other_kind_is_preserved(self):
        original, rescheduled = game(day='2026-09-30'), game(day='2026-10-01')
        result, _ = self.fetch([response([original, rescheduled, rescheduled]),
                              response([game('E')]), response([])])
        self.assertEqual(len(result), 3)
        self.assertEqual({g['GameDate'][:10] for g in result}, {'2026-09-30', '2026-10-01'})

    def test_failed_source_has_nonzero_exit_and_preserves_cache_and_meta_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder) / 'cpbl_schedule_2026.json'
            meta = Path(folder) / 'cpbl_meta.json'
            original_cache = json.dumps([game()]).encode()
            original_meta = b'{"schedule_updated":"2026-10-01 11:07 KST"}'
            cache.write_bytes(original_cache)
            meta.write_bytes(original_meta)
            with patch.object(cpbl, 'DATA_DIR', folder), \
                    patch.object(cpbl, 'fetch_schedule', return_value=None), \
                    patch.object(sys, 'argv', ['fetch_cpbl.py', '--schedule', '--year', '2026']):
                self.assertEqual(cpbl.main(), 1)
            self.assertEqual(cache.read_bytes(), original_cache)
            self.assertEqual(meta.read_bytes(), original_meta)

    def test_success_saves_postseason_scope_and_confirmation_time(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.object(cpbl, 'DATA_DIR', folder), \
                    patch.object(cpbl, 'fetch_schedule', return_value=[game('E')]), \
                    patch.object(sys, 'argv', ['fetch_cpbl.py', '--schedule', '--year', '2026']):
                self.assertEqual(cpbl.main(), 0)
            meta = json.loads((Path(folder) / 'cpbl_meta.json').read_text())
            self.assertEqual(meta['schedule_kinds'], ['A', 'E', 'C'])
            self.assertIn('schedule_updated', meta)
            self.assertEqual(json.loads((Path(folder) / 'cpbl_schedule_2026.json').read_text()), [game('E')])


if __name__ == '__main__':
    unittest.main()
