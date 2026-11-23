"""Normalize complete official CPBL first-team 2026 RecordAll tables.

The input is taken from the official rendered table with KindCode=A, Online=01,
year 2026 and games sort (unqualified players are included). Input TSV columns
must begin with id and team, then use the original official column captions.
"""
import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path

FIELDS = {
    'bat': {
        '出賽數': 'TotalGames', '打席': 'PlateAppearances', '打數': 'HitCnt',
        '打擊率': 'Avg', '安打': 'HittingCnt', '全壘打': 'HomeRunCnt',
        '打點': 'RunBattedINCnt', '盜壘': 'StealBaseOKCnt',
        '上壘率': 'Obp', '長打率': 'Slg', '整體攻擊指數': 'Ops',
    },
    'pit': {
        '出賽數': 'TotalGames', '先發': 'PitchStarting', '勝場': 'Wins',
        '敗場': 'Loses', '救援成功': 'SaveOK', '中繼成功': 'ReliefPointCnt',
        '投球局數': 'InningPitched', '防禦率': 'Era', '每局被上壘率': 'Whip',
        '打席': 'PlateAppearances', '被安打': 'HittingCnt',
        '被全壘打': 'HomeRunCnt', '四壞': 'BasesONBallsCnt', '奪三振': 'StrikeOutCnt',
    }
}
TEAMS = {
    'AAA011': '味全龍', 'ACN011': '中信兄弟', 'ADD011': '統一7-ELEVEn獅',
    'AEO011': '富邦悍將', 'AJL011': '樂天桃猿', 'AKP011': '台鋼雄鷹',
}



def parse_table(filename, category, expected):
    with Path(filename).open(newline='', encoding='utf-8-sig') as src:
        reader = csv.reader(src, delimiter='\t')
        header = [x.strip() for x in next(reader)]
        if header[:2] != ['id', 'team'] or len(header) != len(set(header)):
            raise ValueError('Ambiguous table header')
        spec = FIELDS[category]
        if missing := set(spec) - set(header):
            raise ValueError(f'Missing {category} fields: {sorted(missing)}')
        columns = {key: header.index(label) for label, key in spec.items()}
        result = {}
        seen = set()
        for record in reader:
            if len(record) != len(header):
                raise ValueError(f'Malformed {category} row {reader.line_num}')
            player, team = (x.strip() for x in record[:2])
            if not re.fullmatch(r'\d{10}', player) or team not in TEAMS:
                raise ValueError(f'Unmatched official ID/team: {player} / {team}')
            if (player, team) in seen:
                raise ValueError(f'Duplicate official row: {player} / {team}')
            seen.add((player, team))
            row = {'Acnt': player, 'Year': '2026', 'KindCode': 'A', 'TeamNo': team, 'TeamAbbrName': TEAMS[team]}
            for key, column in columns.items():
                value = record[column].strip()
                if re.fullmatch(r'\d+(?:\.\d+)?', value):
                    row[key] = value
                elif value not in {'-', '—', ''}:
                    raise ValueError(f'Unexpected {category} cell {key}: {value!r}')
            if not int(row.get('TotalGames', '0')) > 0:
                raise ValueError(f'No regular season games in official row: {player}')
            result.setdefault(player, []).append(row)
        if len(seen) != expected:
            raise ValueError(f'Incomplete {category} snapshot: expected {expected}, found {len(seen)}')
        return result


def build_snapshot(bat, pit, bat_count, pit_count, read_at):
    datetime.fromisoformat(read_at)
    categories = {}
    for category, filename, count in [('bat', bat, bat_count), ('pit', pit, pit_count)]:
        categories[category] = parse_table(filename, category, count)
    return {
        'year': 2026,
        'kindCode': 'A',
        'readAt': read_at,
        'counts': {'bat': bat_count, 'pit': pit_count},
        'source': 'https://www.cpbl.com.tw/Stats/RecordAll',
        'categories': categories,
    }


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('--bat', required=True)
    cli.add_argument('--pit', required=True)
    cli.add_argument('--bat-count', required=True, type=int)
    cli.add_argument('--pit-count', required=True, type=int)
    cli.add_argument('--read-at', required=True)
    cli.add_argument('--output', default='data/cpbl_standard_2026.json')
    args = vars(cli.parse_args())
    output = args.pop('output')
    obj = build_snapshot(**args)
    Path(output).write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':'))+'\n')
