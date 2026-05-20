#!/usr/bin/env python3
"""
CPBL 선수 연도별 기록 + 시즌 스케줄 수집 스크립트
- 선수 기록: data/cpbl_stats.json
- 시즌 스케줄: data/cpbl_schedule_{year}.json

실행: python3 scripts/fetch_cpbl.py [--stats] [--schedule] [--year 2026]
아무 옵션 없이 실행하면 둘 다 수집.
"""
import json, re, time, sys, os, argparse
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import URLError, HTTPError

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120'
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')

def fetch_page(url, extra_headers=None):
    headers = {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
    }
    if extra_headers:
        headers.update(extra_headers)
    req = Request(url, headers=headers)
    resp = urlopen(req, timeout=20)
    html = resp.read().decode('utf-8', errors='replace')

    # set-cookie에서 __RequestVerificationToken 추출
    cookie_val = ''
    # Python urllib은 headers.get_all이 없어 items()로 순회
    for name, val in resp.headers.items():
        if name.lower() == 'set-cookie':
            m = re.search(r'__RequestVerificationToken=([^;,\s]+)', val)
            if m:
                cookie_val = m.group(1)
    return html, cookie_val

def extract_js_tokens(html):
    """JS 변수 방식: RequestVerificationToken: 'xxx'"""
    return re.findall(r"RequestVerificationToken\s*:\s*['\"]([^'\"]{30,})['\"]", html)

def post_json(url, body_dict, token, cookie, referer):
    data = urlencode(body_dict).encode()
    headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'RequestVerificationToken': token,
        'Cookie': f'__RequestVerificationToken={cookie}',
        'Origin': 'https://en.cpbl.com.tw',
        'Referer': referer,
        'User-Agent': UA,
        'Accept': 'application/json, */*',
    }
    req = Request(url, data=data, headers=headers, method='POST')
    resp = urlopen(req, timeout=20)
    return json.loads(resp.read().decode('utf-8'))

# ── 선수 연도별 기록 수집 ────────────────────────────────
def fetch_all_stats(index_html_path):
    print('📊 CPBL 선수 기록 수집 시작...')
    # index.html에서 CPBL_PLAYERS 파싱
    with open(index_html_path, 'r', encoding='utf-8') as f:
        src = f.read()

    # '0000002298':{n:'...',j:'...',t:'...',tc:'...',p:'Pitcher',...} 패턴
    players = re.findall(r"'(\d{10})':\{n:'([^']+)'(?:[^}]*?)p:'([^']+)'", src)
    if not players:
        print('  ⚠️  CPBL_PLAYERS 파싱 실패 — index.html 경로 확인 필요')
        return {}

    print(f'  총 {len(players)}명 처리 예정')
    stats_db = {}
    success = 0
    fail = 0

    for acnt, name, pos in players:
        is_batter = 'pitcher' not in pos.lower()
        ptype = 'bat' if is_batter else 'pit'
        print(f'  [{acnt}] {name} ({ptype})', end=' ... ', flush=True)

        try:
            page_url = f'https://en.cpbl.com.tw/team/person?Acnt={acnt}'
            html, cookie = fetch_page(page_url)
            tokens = extract_js_tokens(html)

            if not tokens or not cookie:
                print(f'토큰 없음 (tokens={len(tokens)}, cookie={bool(cookie)})')
                fail += 1
                continue

            # 투수는 두 번째 JS 토큰, 타자는 첫 번째
            token = tokens[1] if not is_batter and len(tokens) > 1 else tokens[0]
            api_url = ('https://en.cpbl.com.tw/team/getpitchscore'
                       if not is_batter else
                       'https://en.cpbl.com.tw/team/getbattingscore')

            result = post_json(api_url, {'acnt': acnt, 'kindCode': 'A'}, token, cookie, page_url)

            if result.get('Success') and result.get('Data'):
                stats_db[acnt] = {ptype: result['Data']}
                print(f'✅ {len(result["Data"])}시즌')
                success += 1
            else:
                print(f'응답 이상: {str(result)[:80]}')
                fail += 1

        except (URLError, HTTPError) as e:
            print(f'HTTP 오류: {e}')
            fail += 1
        except Exception as e:
            print(f'오류: {e}')
            fail += 1

        time.sleep(0.8)  # 서버 부하 방지

    print(f'\n  완료: 성공 {success}명 / 실패 {fail}명')
    return stats_db

# ── 시즌 스케줄 수집 ──────────────────────────────────────
def fetch_schedule(year):
    print(f'📅 CPBL {year} 스케줄 수집...')
    try:
        html, cookie = fetch_page('https://en.cpbl.com.tw/schedule')
        tokens = extract_js_tokens(html)
        if not tokens or not cookie:
            print(f'  ⚠️  토큰 없음 (tokens={len(tokens)}, cookie={bool(cookie)})')
            return None

        token = tokens[1] if len(tokens) > 1 else tokens[0]
        result = post_json(
            'https://en.cpbl.com.tw/schedule/getgamedatas',
            {'calendar': f'{year}/01/01', 'location': '', 'kindCode': 'A'},
            token, cookie,
            'https://en.cpbl.com.tw/schedule'
        )

        if result.get('Success') is not False:
            games = result.get('Data', result) if isinstance(result, dict) else result
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
    parser.add_argument('--stats', action='store_true', help='선수 기록 수집')
    parser.add_argument('--schedule', action='store_true', help='스케줄 수집')
    parser.add_argument('--year', type=int, default=2026, help='시즌 연도 (기본: 2026)')
    args = parser.parse_args()

    # 아무 옵션도 없으면 둘 다 실행
    do_stats = args.stats or not (args.stats or args.schedule)
    do_sched = args.schedule or not (args.stats or args.schedule)

    os.makedirs(DATA_DIR, exist_ok=True)

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

    if do_sched:
        games = fetch_schedule(args.year)
        if games is not None:
            out_path = os.path.join(DATA_DIR, f'cpbl_schedule_{args.year}.json')
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(games, f, ensure_ascii=False, separators=(',', ':'))
            print(f'💾 저장: {out_path} ({os.path.getsize(out_path)//1024}KB)')

if __name__ == '__main__':
    main()
