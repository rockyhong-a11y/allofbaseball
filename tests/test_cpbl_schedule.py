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


def game(kind='A', day='2026-10-01', number=1, status='SCHEDULED'):
    return {'GameId': f'2026-{kind}-{number}', 'KindCode': kind, 'GameSno': number,
            'PreExeDate': day + 'T18:35:00', 'GameStatus': status,
            'Visiting': {'Team': {'Name': '味全龍'}, 'Score': 0},
            'Home': {'Team': {'Name': '中信兄弟'}, 'Score': 0}, 'Field': {'Abbe': '洲際'}}


def response(games):
    return {'Data': {'Games': games}}


def standings():
    return {'year': 2026, 'teams': [], 'source': cpbl.STATS_SITE}


class ScheduleTests(unittest.TestCase):
    def fetch(self, batches=None, failure=None):
        def reply(path, params):
            self.assertEqual(path, '/v1/games/schedule')
            self.assertEqual(params['year'], 2026)
            scope = (params['kindCode'], params['month'])
            if scope == failure:
                raise RuntimeError('HTTP 404')
            return response((batches or {}).get(scope, []))
        with patch.object(cpbl, 'stats_site_get', side_effect=reply) as get:
            return cpbl.fetch_schedule(2026), get

    def test_regular_and_postseason_all_months_are_verified(self):
        result, get = self.fetch({(k, 10): [game(k)] for k in 'AEC'})
        self.assertEqual({g['KindCode'] for g in result}, {'A', 'E', 'C'})
        scopes = {(c.args[1]['kindCode'], c.args[1]['month']) for c in get.call_args_list}
        self.assertEqual(scopes, {(k, m) for k in 'AEC' for m in range(1, 13)})

    def test_unannounced_postseason_zero_games_is_valid(self):
        result, _ = self.fetch({('A', 10): [game()]})
        self.assertEqual(len(result), 1)

    def test_partial_failure_cannot_replace_a_season(self):
        result, _ = self.fetch({('A', 10): [game()]}, failure=('E', 10))
        self.assertIsNone(result)

    def test_missing_array_is_not_valid_empty(self):
        for bad in ({}, {'Data': {}}, {'Data': {'Games': None}}, {'data': {'games': []}}):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                cpbl.validate_schedule_response(bad, 2026, 'E', 10)

    def test_wrong_scope_and_invalid_date_reject(self):
        for bad in (dict(game(), KindCode='C'), dict(game(), GameId='2025-A-1'),
                    dict(game(), PreExeDate='2026-02-30'), dict(game(), PreExeDate='2026-09-01'),
                    dict(game(), GameStatus='UNVERIFIED'), dict(game(), Visiting={})):
            with self.subTest(game=bad), self.assertRaises(ValueError):
                cpbl.validate_schedule_response(response([bad]), 2026, 'A', 10)

    def test_postponed_and_rescheduled_same_game_both_preserved(self):
        first = game(day='2026-10-05', status='POSTPONED')
        second = game(day='2026-10-06')
        result, _ = self.fetch({('A', 10): [first, second, second], ('E', 10): [game('E')]})
        self.assertEqual(len(result), 3)
        self.assertEqual({g['GameDate'][:10] for g in result}, {'2026-10-01', '2026-10-05', '2026-10-06'})

    def test_zero_zero_finished_game_and_live_status(self):
        finished, live = cpbl.validate_schedule_response(response([game(status='FINISHED'), game(number=2, status='START')]), 2026, 'A', 10)
        self.assertEqual(finished['GameResult'], '0')
        self.assertEqual(finished['VisitingScore'], 0)
        self.assertEqual(live['GameStatus'], 'START')
        self.assertEqual(live['IsPlayBall'], 'Y')

    def run_main(self, folder, games, ranks=None):
        with patch.object(cpbl, 'DATA_DIR', folder), patch.object(cpbl, 'fetch_schedule', return_value=games), \
                patch.object(cpbl, 'fetch_standings', return_value=ranks or standings()), \
                patch.object(sys, 'argv', ['fetch_cpbl.py', '--schedule', '--year', '2026']):
            return cpbl.main()

    def test_failed_source_nonzero_exit_preserves_all_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            files = ['cpbl_schedule_2026.json', 'cpbl_standings_2026.json', 'cpbl_meta.json']
            originals = [b'[{"old":true}]', b'{"old":true}', b'{"schedule_updated":"previous"}']
            for name, body in zip(files, originals): (Path(folder) / name).write_bytes(body)
            self.assertEqual(self.run_main(folder, None), 1)
            self.assertEqual([(Path(folder) / name).read_bytes() for name in files], originals)
            with patch.object(cpbl, 'fetch_standings', side_effect=ValueError('invalid ranks')):
                with patch.object(cpbl, 'DATA_DIR', folder), patch.object(cpbl, 'fetch_schedule', return_value=[]), \
                        patch.object(sys, 'argv', ['fetch_cpbl.py', '--schedule']):
                    self.assertEqual(cpbl.main(), 1)
            self.assertEqual([(Path(folder) / name).read_bytes() for name in files], originals)

    def test_success_saves_official_rankings_and_scope(self):
        with tempfile.TemporaryDirectory() as folder:
            self.assertEqual(self.run_main(folder, [game('E')]), 0)
            meta = json.loads((Path(folder) / 'cpbl_meta.json').read_text())
            self.assertEqual(meta['schedule_kinds'], ['A', 'E', 'C'])
            self.assertEqual(meta['schedule_updated'], meta['standings_updated'])
            self.assertEqual(meta['schedule_source'], 'https://stats.cpbl.com.tw/schedule')
            self.assertTrue((Path(folder) / 'cpbl_standings_2026.json').exists())

    def test_official_standings_bad_counts_or_duplicate_teams_rejected(self):
        teams = [{'Team': {'Code': f'{code}011', 'Name': code}, 'Ranking': i+1,
                  'GameCnt': 3, 'GameResultWCnt': 1, 'GameResultLCnt': 1, 'GameResultTCnt': 1, 'Pct': .5}
                 for i, code in enumerate(['AAA','ADD','AEO','AJL','ACN','AKP'])]
        def get_ranks(rows): return {'Data': {'TeamRecords': {'A': {'FullYear': rows}}}}
        with patch.object(cpbl, 'stats_site_get', return_value=get_ranks(teams)):
            self.assertEqual(cpbl.fetch_standings(2026)['teams'], teams)
        for bad in (teams[:5], [teams[0]] * 6, [dict(teams[0], GameCnt=4)] + teams[1:]):
            with self.subTest(bad=bad), patch.object(cpbl, 'stats_site_get', return_value=get_ranks(bad)), self.assertRaises(ValueError):
                cpbl.fetch_standings(2026)


if __name__ == '__main__': unittest.main()
