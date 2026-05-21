#!/usr/bin/env python3
"""
CPBL 선수 연도별 기록 + 시즌 스케줄 수집 스크립트 (Playwright 버전)
- Cloudflare WAF를 통과하기 위해 실제 Chromium 브라우저 사용
- 선수 기록: data/cpbl_stats.json
- 시즌 스케줄: data/cpbl_schedule_{year}.json

실행: python3 scripts/fetch_cpbl.py [--stats] [--schedule] [--year 2026]
아무 옵션 없이 실행하면 둘 다 수집.
"""
import json, re, time, sys, os, argparse

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, 'data')

# ── Playwright 기반 공통 헬퍼 ──────────────────────────────
def make_browser(p):
    """Cloudflare를 통과할 수 있는 브라우저 컨텍스트 반환"""
    browser = p.chromium.launch(
        headless=True,
        args=['--no-sandbox', '--disable-setuid-sandbox',
              '--disable-blink-features=AutomationControlled']
    )
    ctx = browser.new_context(
        user_agent=(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
            'AppleWebKit/537.36 (KHTML, like Gecko) '
            'Chrome/124.0.0.0 Safari/537.36'
        ),
        locale='zh-TW',
        timezone_id='Asia/Taipei',
        viewport={'width': 1280, 'height': 800},
        extra_http_headers={
            'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
        }
    )
    return browser, ctx

def wait_cf(page, timeout=15000):
    """Cloudflare 챌린지 통과 대기"""
    try:
        page.wait_for_load_state('networkidle', timeout=timeout)
    except Exception:
        pass
    time.sleep(1.5)  # JS 렌더링 여유

def get_csrf(page):
    """현재 페이지에서 CSRF 토큰 + 쿠키 추출"""
    html = page.content()
    tokens = re.findall(r"RequestVerificationToken\s*:\s*['\"]([^'\"]{30,})['\"]", html)
    # hidden input 방식도 시도
    hidden = re.findall(r'name="__RequestVerificationToken"[^>]*value="([^"]{30,})"', html)
    hidden += re.findall(r'value="([^"]{30,})"[^>]*name="__RequestVerificationToken"', html)
    all_tokens = list(dict.fromkeys(tokens + hidden))

    cookies = page.context.cookies()
    cookie_val = next(
        (c['value'] for c in cookies if c['name'] == '__RequestVerificationToken'),
        ''
    )
    return all_tokens, cookie_val

def post_api(page, api_url, body: dict, token: str, referer: str):
    """페이지 컨텍스트에서 XHR POST — 쿠키·헤더 자동 포함"""
    body_str = '&'.join(f'{k}={v}' for k, v in body.items())
    result = page.evaluate(f"""
        async () => {{
            const resp = await fetch({json.dumps(api_url)}, {{
                method: 'POST',
                headers: {{
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    'RequestVerificationToken': {json.dumps(token)},
                    'Referer': {json.dumps(referer)},
                }},
                body: {json.dumps(body_str)},
                credentials: 'same-origin',
            }});
            return await resp.text();
        }}
    """)
    return json.loads(result)

# ── 선수 연도별 기록 수집 ────────────────────────────────
def fetch_all_stats(index_html_path):
    from playwright.sync_api import sync_playwright

    print('📊 CPBL 선수 기록 수집 시작 (Playwright)...')
    with open(index_html_path, 'r', encoding='utf-8') as f:
        src = f.read()

    players = re.findall(r"'(\d{10})':\{n:'([^']+)'(?:[^}]*?)p:'([^']+)'", src)
    if not players:
        print('  ⚠️  CPBL_PLAYERS 파싱 실패 — index.html 확인 필요')
        return {}

    print(f'  총 {len(players)}명 처리 예정')
    stats_db = {}
    success = fail = 0

    with sync_playwright() as p:
        browser, ctx = make_browser(p)
        page = ctx.new_page()

        for acnt, name, pos in players:
            is_batter = 'pitcher' not in pos.lower()
            ptype = 'bat' if is_batter else 'pit'
            print(f'  [{acnt}] {name} ({ptype})', end=' ... ', flush=True)

            try:
                page_url = f'https://en.cpbl.com.tw/team/person?Acnt={acnt}'
                page.goto(page_url, wait_until='domcontentloaded', timeout=30000)
                wait_cf(page)

                all_tokens, cookie_val = get_csrf(page)
                if not all_tokens or not cookie_val:
                    print(f'토큰 없음 (t={len(all_tokens)}, c={bool(cookie_val)})')
                    fail += 1
                    continue

                # 투수: 두 번째 토큰, 타자: 첫 번째
                token = all_tokens[1] if (not is_batter and len(all_tokens) > 1) else all_tokens[0]
                api_url = ('https://en.cpbl.com.tw/team/getpitchscore'
                           if not is_batter else
                           'https://en.cpbl.com.tw/team/getbattingscore')

                result = post_api(page, api_url,
                                  {'acnt': acnt, 'kindCode': 'A'},
                                  token, page_url)

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

        browser.close()

    print(f'\n  완료: 성공 {success}명 / 실패 {fail}명')
    return stats_db

# ── 시즌 스케줄 수집 ──────────────────────────────────────
def fetch_schedule(year):
    from playwright.sync_api import sync_playwright

    print(f'📅 CPBL {year} 스케줄 수집 (Playwright)...')
    try:
        with sync_playwright() as p:
            browser, ctx = make_browser(p)
            page = ctx.new_page()

            page.goto('https://en.cpbl.com.tw/schedule',
                      wait_until='domcontentloaded', timeout=30000)
            wait_cf(page)

            all_tokens, cookie_val = get_csrf(page)
            if not all_tokens or not cookie_val:
                print(f'  ⚠️  토큰 없음 (t={len(all_tokens)}, c={bool(cookie_val)})')
                browser.close()
                return None

            token = all_tokens[1] if len(all_tokens) > 1 else all_tokens[0]
            result = post_api(
                page,
                'https://en.cpbl.com.tw/schedule/getgamedatas',
                {'calendar': f'{year}/01/01', 'location': '', 'kindCode': 'A'},
                token,
                'https://en.cpbl.com.tw/schedule'
            )
            browser.close()

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
