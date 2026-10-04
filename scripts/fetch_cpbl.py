#!/usr/bin/env python3
"""
CPBL 선수 연도별 기록 + 시즌 스케줄 수집 스크립트 (curl 버전)
- 공식 CPBL의 쿠키·CSRF 세션을 curl로 공유하며 HTTP 실패를 확인한다.
- 선수 기록: data/cpbl_stats.json
- 시즌 스케줄: data/cpbl_schedule_{year}.json

실행: python3 scripts/fetch_cpbl.py [--stats] [--schedule] [--year 2026]
"""
import json, re, time, sys, os, argparse, subprocess, tempfile
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import urlencode

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')
STATS_PART_SIZE = 50
SCHEDULE_KINDS = ('A', 'E', 'C')  # 공식 일정: 정규시즌, 플레이오프, 챔피언십

CURL_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/124.0.0.0 Safari/537.36'
)

# ── curl 헬퍼 ─────────────────────────────────────────────
def curl_get(url) -> tuple[str, str, str]:
    """
    curl로 페이지 GET → (html, __RequestVerificationToken cookie값, cookie jar 경로) 반환
    """
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as tf:
        tmp = tf.name
    with tempfile.NamedTemporaryFile(suffix='.cookies', delete=False) as cf:
        cookie_jar = cf.name

    # -D - 로 응답 헤더를 stdout에, 본문은 파일에 저장
    result = subprocess.run(
        [
            'curl', '-sS', '-L', '--fail-with-body', '--max-redirs', '5',
            '-c', cookie_jar,
            '-b', cookie_jar,
            '-D', '-',          # 헤더를 stdout으로
            '-o', tmp,          # 본문은 파일로
            '-H', f'User-Agent: {CURL_UA}',
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            '-H', 'Accept-Language: zh-TW,zh;q=0.9,en;q=0.8',
            '--max-time', '30',
            '--connect-timeout', '15',
            url,
        ],
        capture_output=True, text=True, timeout=40
    )

    headers = result.stdout  # -D - → 헤더가 stdout
    cookie_val = ''
    for line in headers.splitlines():
        if 'set-cookie' in line.lower():
            m = re.search(r'__RequestVerificationToken=([^;,\s]+)', line)
            if m:
                cookie_val = m.group(1)

    # CPBL은 www 리디렉션 뒤 쿠키 엔진이 활성화된 요청에만 CSRF 쿠키를
    # 내려주기도 한다. 이 경우 응답 헤더 대신 cookie jar에서 읽는다.
    if not cookie_val:
        try:
            with open(cookie_jar, encoding='utf-8') as f:
                for line in f:
                    if not line.startswith('#') and '__RequestVerificationToken' in line:
                        cookie_val = line.rstrip().split('\t')[-1]
                    elif line.startswith('#HttpOnly_') and '__RequestVerificationToken' in line:
                        cookie_val = line.rstrip().split('\t')[-1]
        except OSError:
            pass

    with open(tmp, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()
    os.unlink(tmp)
    statuses = re.findall(r'^HTTP/\S+\s+(\d{3})', headers, re.MULTILINE)
    status = statuses[-1] if statuses else '?'
    print(f'  GET {url}: HTTP {status}, {len(html.encode("utf-8"))} bytes')
    if result.returncode or status != '200':
        if os.path.exists(cookie_jar): os.unlink(cookie_jar)
        raise RuntimeError(f'공식 페이지 HTTP {status} (curl {result.returncode})')
    return html, cookie_val, cookie_jar


def extract_js_tokens(html: str) -> list[str]:
    return re.findall(r"RequestVerificationToken\s*:\s*['\"]([^'\"]{30,})['\"]", html)


def curl_post_json(api_url: str, body_dict: dict, token: str,
                   cookie: str, referer: str, cookie_jar: str = '') -> dict:
    """
    curl로 CSRF 인증 POST → JSON 파싱 결과 반환
    """
    body = urlencode(body_dict)
    command = [
            'curl', '-sS', '--fail-with-body', '--max-redirs', '5',
            '-L',
            '-X', 'POST',
            '-H', 'Content-Type: application/x-www-form-urlencoded',
            '-H', 'X-Requested-With: XMLHttpRequest',
            '-H', f'RequestVerificationToken: {token}',
            '-H', f'Origin: https://www.cpbl.com.tw',
            '-H', f'Referer: {referer}',
            '-H', f'User-Agent: {CURL_UA}',
            '-H', 'Accept: application/json, */*',
            '--max-time', '30',
            '--data', body,
            api_url,
        ]
    if cookie_jar:
        command[2:2] = ['-c', cookie_jar, '-b', cookie_jar]
    else:
        command[2:2] = ['-b', f'__RequestVerificationToken={cookie}']
    result = subprocess.run(
        command,
        capture_output=True, text=True, timeout=40
    )
    if result.returncode:
        raise RuntimeError(f'공식 API 요청 실패 (curl {result.returncode}): {result.stderr.strip()}')
    return json.loads(result.stdout)


# ── 선수 연도별 기록 수집 ────────────────────────────────
def fetch_all_stats(index_html_path: str) -> dict:
    print('📊 CPBL 선수 기록 수집 시작 (curl)...')
    with open(index_html_path, 'r', encoding='utf-8') as f:
        src = f.read()

    players = re.findall(r"'(\d{10})':\{n:'([^']+)'(?:[^}]*?)p:'([^']+)'", src)
    if not players:
        print('  ⚠️  CPBL_PLAYERS 파싱 실패 — index.html 확인 필요')
        return {}

    print(f'  총 {len(players)}명 처리 예정')
    stats_db = {}
    success = fail = 0

    for acnt, name, pos in players:
        is_batter = 'pitcher' not in pos.lower()
        ptype = 'bat' if is_batter else 'pit'
        print(f'  [{acnt}] {name} ({ptype})', end=' ... ', flush=True)

        try:
            page_url = f'https://cpbl.com.tw/team/person?Acnt={acnt}'
            html, cookie, cookie_jar = curl_get(page_url)
            tokens = extract_js_tokens(html)

            if not tokens or not cookie:
                print(f'토큰 없음 (t={len(tokens)}, c={bool(cookie)})')
                if os.path.exists(cookie_jar): os.unlink(cookie_jar)
                fail += 1
                continue

            token = tokens[1] if (not is_batter and len(tokens) > 1) else tokens[0]
            api_url = ('https://www.cpbl.com.tw/team/getpitchscore'
                       if not is_batter else
                       'https://www.cpbl.com.tw/team/getbattingscore')

            result = curl_post_json(api_url,
                                    {'acnt': acnt, 'kindCode': 'A'},
                                    token, cookie, page_url, cookie_jar)
            if os.path.exists(cookie_jar): os.unlink(cookie_jar)

            if result.get('Success'):
                raw_key = 'BattingScore' if is_batter else 'PitchScore'
                raw_val = result.get(raw_key) or result.get('Data') or '[]'
                seasons = json.loads(raw_val) if isinstance(raw_val, str) else raw_val
                if seasons:
                    stats_db[acnt] = {ptype: seasons}
                    print(f'✅ {len(seasons)}시즌')
                    success += 1
                else:
                    print('데이터 없음')
                    fail += 1
            else:
                print(f'응답 이상: {str(result)[:80]}')
                fail += 1

        except Exception as e:
            print(f'오류: {e}')
            fail += 1

        time.sleep(0.5)

    print(f'\n  완료: 성공 {success}명 / 실패 {fail}명')
    return stats_db


# ── 시즌 스케줄 수집 ──────────────────────────────────────
def validate_schedule_response(result, year, kind):
    if not isinstance(result, dict) or result.get('Success') is not True:
        raise ValueError('공식 일정 API가 성공 응답을 반환하지 않음')
    raw = result.get('GameDatas', result.get('Data'))
    games = json.loads(raw) if isinstance(raw, str) else raw
    if not isinstance(games, list):
        raise ValueError('공식 경기 배열이 누락되거나 형식이 잘못됨')
    for game in games:
        if not isinstance(game, dict):
            raise ValueError('경기 행 형식 오류')
        if str(game.get('Year')) != str(year) or game.get('KindCode') != kind:
            raise ValueError('공식 응답의 시즌·경기 종류가 요청 범위와 다름')
        if game.get('GameSno') is None:
            raise ValueError('경기 번호 누락')
        when = datetime.fromisoformat(game.get('GameDate', ''))
        if when.year != year:
            raise ValueError('공식 경기 날짜가 요청 시즌 밖에 있음')
    return games


def fetch_schedule(year: int):
    print(f'📅 CPBL {year} 스케줄 수집 (curl)...')
    cookie_jar = ''
    try:
        html, cookie, cookie_jar = curl_get('https://www.cpbl.com.tw/schedule')
        tokens = extract_js_tokens(html)

        if not tokens or not cookie:
            print(f'  ⚠️  토큰 없음 (t={len(tokens)}, c={bool(cookie)})')
            return None

        token = tokens[1] if len(tokens) > 1 else tokens[0]
        games = []
        for kind in SCHEDULE_KINDS:
            result = curl_post_json(
                'https://www.cpbl.com.tw/schedule/getgamedatas',
                {'calendar': f'{year}/01/01', 'location': '', 'teamNo': '', 'kindCode': kind},
                token, cookie, 'https://www.cpbl.com.tw/schedule', cookie_jar
            )
            batch = validate_schedule_response(result, year, kind)
            print(f'  ✅ {kind}: {len(batch)}경기')
            games.extend(batch)
        unique = {(str(g['Year']), g['KindCode'], str(g['GameSno']), g['GameDate']): g
                  for g in games}
        return sorted(unique.values(), key=lambda g: (g['GameDate'], g['KindCode'], int(g['GameSno'])))

    except Exception as e:
        print(f'  오류: {e}')
        return None
    finally:
        if cookie_jar and os.path.exists(cookie_jar): os.unlink(cookie_jar)


def write_stats_parts(stats: dict) -> list[str]:
    """GitHub의 단일 파일 전송 한도를 피하도록 선수 DB를 작은 조각으로 저장한다."""
    names = []
    entries = list(stats.items())
    for index in range(0, len(entries), STATS_PART_SIZE):
        name = f'cpbl_stats_part_{index // STATS_PART_SIZE + 1}.json'
        path = os.path.join(DATA_DIR, name)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(dict(entries[index:index + STATS_PART_SIZE]), f,
                      ensure_ascii=False, separators=(',', ':'))
        names.append(name)
    return names


# ── 메인 ────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='CPBL 데이터 수집')
    parser.add_argument('--stats',    action='store_true', help='선수 기록 수집')
    parser.add_argument('--schedule', action='store_true', help='스케줄 수집')
    parser.add_argument('--year', type=int, default=2026, help='시즌 연도 (기본: 2026)')
    args = parser.parse_args()

    do_stats = args.stats or not (args.stats or args.schedule)
    do_sched = args.schedule or not (args.stats or args.schedule)

    os.makedirs(DATA_DIR, exist_ok=True)

    # cpbl_meta.json 읽기 (기존 값 유지 후 갱신)
    meta_path = os.path.join(DATA_DIR, 'cpbl_meta.json')
    try:
        with open(meta_path, encoding='utf-8') as f:
            meta = json.load(f)
    except Exception:
        meta = {}

    now_str = datetime.now(ZoneInfo('Asia/Seoul')).strftime('%Y-%m-%d %H:%M KST')
    failed = False
    changed = False

    if do_stats:
        idx_path = os.path.join(BASE_DIR, 'index.html')
        if not os.path.exists(idx_path):
            print(f'오류: {idx_path} 없음')
            sys.exit(1)
        stats = fetch_all_stats(idx_path)
        if stats:
            out_path = os.path.join(DATA_DIR, 'cpbl_stats.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(stats, f, ensure_ascii=False, separators=(',', ':'))
            print(f'💾 저장: {out_path} ({os.path.getsize(out_path)//1024}KB)')
            meta['stats_parts'] = write_stats_parts(stats)
            meta['stats_updated'] = now_str
            changed = True
        else:
            failed = True

    if do_sched:
        games = fetch_schedule(args.year)
        if games is not None:
            out_path = os.path.join(DATA_DIR, f'cpbl_schedule_{args.year}.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(games, f, ensure_ascii=False, separators=(',', ':'))
            print(f'💾 저장: {out_path} ({os.path.getsize(out_path)//1024}KB)')
            meta['schedule_updated'] = now_str
            meta['schedule_kinds'] = list(SCHEDULE_KINDS)
            changed = True
        else:
            failed = True
            print('❌ 일정 수집 실패 — 기존 캐시와 갱신 시각 유지')

    # meta 저장
    if changed:
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
