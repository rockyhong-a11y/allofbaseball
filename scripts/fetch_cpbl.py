#!/usr/bin/env python3
"""
CPBL 선수 연도별 기록 + 시즌 스케줄 수집 스크립트 (curl 버전)
- Python urllib/requests는 Cloudflare WAF에 차단되지만 curl은 정상 통과
- 선수 기록: data/cpbl_stats.json
- 시즌 스케줄: data/cpbl_schedule_{year}.json

실행: python3 scripts/fetch_cpbl.py [--stats] [--schedule] [--year 2026]
"""
import json, re, time, sys, os, argparse, subprocess, tempfile
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')

CURL_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
    'AppleWebKit/537.36 (KHTML, like Gecko) '
    'Chrome/124.0.0.0 Safari/537.36'
)

# ── curl 헬퍼 ─────────────────────────────────────────────
def curl_get(url) -> tuple[str, str]:
    """
    curl로 페이지 GET → (html, __RequestVerificationToken cookie값) 반환
    """
    with tempfile.NamedTemporaryFile(suffix='.html', delete=False) as tf:
        tmp = tf.name

    # -D - 로 응답 헤더를 stdout에, 본문은 파일에 저장
    result = subprocess.run(
        [
            'curl', '-s', '-L',
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

    with open(tmp, 'r', encoding='utf-8', errors='replace') as f:
        html = f.read()
    os.unlink(tmp)
    return html, cookie_val


def extract_js_tokens(html: str) -> list[str]:
    return re.findall(r"RequestVerificationToken\s*:\s*['\"]([^'\"]{30,})['\"]", html)


def curl_post_json(api_url: str, body_dict: dict, token: str,
                   cookie: str, referer: str) -> dict:
    """
    curl로 CSRF 인증 POST → JSON 파싱 결과 반환
    """
    body = '&'.join(f'{k}={v}' for k, v in body_dict.items())
    result = subprocess.run(
        [
            'curl', '-s',
            '-X', 'POST',
            '-H', 'Content-Type: application/x-www-form-urlencoded',
            '-H', 'X-Requested-With: XMLHttpRequest',
            '-H', f'RequestVerificationToken: {token}',
            '-H', f'Cookie: __RequestVerificationToken={cookie}',
            '-H', f'Origin: https://cpbl.com.tw',
            '-H', f'Referer: {referer}',
            '-H', f'User-Agent: {CURL_UA}',
            '-H', 'Accept: application/json, */*',
            '--max-time', '30',
            '--data', body,
            api_url,
        ],
        capture_output=True, text=True, timeout=40
    )
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
            html, cookie = curl_get(page_url)
            tokens = extract_js_tokens(html)

            if not tokens or not cookie:
                print(f'토큰 없음 (t={len(tokens)}, c={bool(cookie)})')
                fail += 1
                continue

            token = tokens[1] if (not is_batter and len(tokens) > 1) else tokens[0]
            api_url = ('https://cpbl.com.tw/team/getpitchscore'
                       if not is_batter else
                       'https://cpbl.com.tw/team/getbattingscore')

            result = curl_post_json(api_url,
                                    {'acnt': acnt, 'kindCode': 'A'},
                                    token, cookie, page_url)

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
def fetch_schedule(year: int):
    print(f'📅 CPBL {year} 스케줄 수집 (curl)...')
    try:
        html, cookie = curl_get('https://cpbl.com.tw/schedule')
        tokens = extract_js_tokens(html)

        if not tokens or not cookie:
            print(f'  ⚠️  토큰 없음 (t={len(tokens)}, c={bool(cookie)})')
            return None

        token = tokens[1] if len(tokens) > 1 else tokens[0]
        result = curl_post_json(
            'https://cpbl.com.tw/schedule/getgamedatas',
            {'calendar': f'{year}/01/01', 'location': '', 'kindCode': 'A'},
            token, cookie,
            'https://cpbl.com.tw/schedule'
        )

        if result.get('Success'):
            raw_val = result.get('GameDatas') or result.get('Data') or '[]'
            games = json.loads(raw_val) if isinstance(raw_val, str) else raw_val
            if isinstance(games, list):
                print(f'  ✅ {len(games)}경기')
                return games
        print(f'  응답 이상: {str(result)[:100]}')
        return None

    except Exception as e:
        print(f'  오류: {e}')
        return None


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

    now_str = datetime.now().strftime('%Y-%m-%d %H:%M KST')

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
            meta['stats_updated'] = now_str

    if do_sched:
        games = fetch_schedule(args.year)
        if games is not None:
            out_path = os.path.join(DATA_DIR, f'cpbl_schedule_{args.year}.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(games, f, ensure_ascii=False, separators=(',', ':'))
            print(f'💾 저장: {out_path} ({os.path.getsize(out_path)//1024}KB)')
            meta['schedule_updated'] = now_str

    # meta 저장
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
