/* League transaction feeds. A feed is requested only after its league is selected. */
(() => {
  'use strict';

  const content = document.getElementById('tx-content');
  const refresh = document.getElementById('tx-refresh');
  const cache = new Map();
  const DAYS = 14;
  const cfg = {
    kbo: {name: '한국 프로야구', badge: 'b-kbo', source: 'KBO 공식 선수 이동', href: 'https://www.koreabaseball.com/Player/Trade.aspx'},
    mlb: {name: '메이저리그', badge: 'b-mlb', source: 'MLB Stats API', href: 'https://www.mlb.com/transactions'},
    npb: {name: '일본 프로야구', badge: 'b-npb', source: 'NPB 공식 공시', href: 'https://npb.jp/announcement/'},
    cpbl: {name: '대만 프로야구', badge: 'b-cpbl', source: 'CPBL 공식 선수 이동', href: 'https://www.cpbl.com.tw/player/trans'}
  };
  let requestId = 0;
  window.txCurrentLeague = null;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const startDate = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (DAYS - 1)); return d; };
  const inRange = date => date >= iso(startDate()) && date <= iso(new Date());

  async function fetchText(url) {
    const attempts = [
      [url, {}],
      [`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, {}],
      [`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`, {}],
      [`https://r.jina.ai/${url}`, {'X-Return-Format': 'html'}]
    ];
    const errors = [];
    for (const [href, headers] of attempts) {
      try {
        const response = await fetch(href, {cache: 'no-store', headers, signal: AbortSignal.timeout(10000)});
        if (!response.ok) { errors.push(`HTTP ${response.status}`); continue; }
        const text = await response.text();
        if (text.length > 80) return text;
      } catch (error) { errors.push(error.name || 'fetch'); }
    }
    throw new Error(errors.join(', ') || '데이터 응답 없음');
  }

  async function fetchJson(url) {
    try {
      const response = await fetch(url, {cache: 'no-store', signal: AbortSignal.timeout(12000)});
      if (response.ok) return response.json();
    } catch (_) {}
    return JSON.parse(await fetchText(url));
  }

  function classifyMlb(transaction) {
    const text = `${transaction.typeDesc || ''} ${transaction.description || ''}`.toLowerCase();
    const rules = [
      ['designated for assignment', 'DFA 지정'], ['injured list', '부상자 명단'],
      ['claimed off waivers', '웨이버 클레임'], ['signed', '계약'], ['released', '방출'],
      ['optioned', '마이너 옵션'], ['recalled', '콜업'], ['selected', '40인 등록'],
      ['reinstated', '복귀'], ['activated', '복귀'], ['traded', '트레이드'], ['trade', '트레이드'],
      ['outrighted', '마이너 이관'], ['assigned', '배정'], ['status change', '상태 변경']
    ];
    return rules.find(([term]) => text.includes(term))?.[1] || transaction.typeDesc || '기타';
  }

  async function loadMlb() {
    const start = iso(startDate()), end = iso(new Date());
    const data = await fetchJson(`https://statsapi.mlb.com/api/v1/transactions?startDate=${start}&endDate=${end}&sportId=1`);
    return {
      items: (data.transactions || []).filter(t => t.person?.fullName).map(t => ({
        date: (t.date || t.effectiveDate || '').slice(0, 10),
        type: classifyMlb(t),
        team: t.toTeam?.name || t.fromTeam?.name || 'MLB',
        player: t.person.fullName,
        detail: t.description || t.typeDesc || '',
        url: `https://www.mlb.com/player/${t.person.id}`
      })).filter(item => inRange(item.date)),
      updated: `${start} ~ ${end}`
    };
  }

  async function loadKbo() {
    const remote = `https://raw.githubusercontent.com/rockyhong-a11y/allofbaseball/main/data/kbo_transactions.json?_=${Date.now()}`;
    let data;
    try {
      const response = await fetch(remote, {cache: 'no-store', signal: AbortSignal.timeout(12000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      data = await response.json();
    }
    catch (_) { data = await fetchJson(`data/kbo_transactions.json?_=${Date.now()}`); }
    const items = (data.rows || []).map(record => {
      const cells = (record.row || []).map(cell => String(cell?.Text || '').trim());
      if (cells.length < 4) return null;
      const [date, type, team, player, note = ''] = cells;
      return {date, type: type || '선수 이동', team: team || 'KBO', player: player || '—', detail: note, url: cfg.kbo.href};
    }).filter(item => item && inRange(item.date));
    const newest = items.map(item => item.date).sort().at(-1);
    return {items, updated: newest ? `최근 공시 ${newest}` : '최근 14일'};
  }

  const cpblTypes = [
    ['解除合約', '계약 해지'], ['自由契約', '자유계약'], ['戰力外', '전력 외'], ['釋出', '방출'],
    ['降二軍', '2군 강등'], ['取消登錄', '등록 말소'], ['升一軍', '1군 등록'], ['重新登錄', '재등록'],
    ['新註冊', '신규 등록'], ['新增登錄', '신규 등록'], ['登錄', '등록'], ['註銷', '말소'],
    ['轉隊', '이적'], ['移籍', '이적'], ['交易', '트레이드'], ['簽約', '계약'], ['退休', '은퇴'], ['引退', '은퇴']
  ];
  function cpblType(event) { return cpblTypes.find(([term]) => event.includes(term))?.[1] || event || '선수 이동'; }

  async function loadCpbl() {
    const url = `https://raw.githubusercontent.com/rockyhong-a11y/BBNews/main/cpbl-cache.json?_=${Date.now()}`;
    const data = await fetchJson(url);
    const items = (data.rows || []).map(row => ({
      date: row.date,
      type: cpblType(row.event || ''),
      team: row.team || 'CPBL',
      player: row.playerEn ? `${row.player} · ${row.playerEn}` : row.player,
      detail: row.event || '',
      url: row.acnt ? `https://www.cpbl.com.tw/team/person?Acnt=${encodeURIComponent(row.acnt)}` : cfg.cpbl.href
    })).filter(item => inRange(item.date));
    return {items, updated: data.updated ? `데이터 갱신 ${new Date(data.updated).toLocaleString('ko-KR')}` : '최근 14일'};
  }

  function parseNpbDate(text, year = new Date().getFullYear()) {
    const match = text.match(/(?:(\d{4})[\/.年-])?(\d{1,2})[\/.月-](\d{1,2})/);
    return match ? `${match[1] || year}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : '';
  }

  function parseNpbAnnouncement(html, page, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = [];
    doc.querySelectorAll('table tr').forEach(row => {
      const cells = [...row.querySelectorAll('th,td')];
      if (cells.length < 3) return;
      const texts = cells.map(cell => cell.textContent.replace(/\s+/g, ' ').trim());
      const date = texts.map(text => parseNpbDate(text)).find(Boolean);
      if (!date || !inRange(date)) return;
      const nameCell = row.querySelector('.pnname') || cells.find(cell => cell.querySelector('a[href*="/bis/players/"]'));
      const player = nameCell?.textContent.replace(/\s+/g, ' ').trim();
      if (!player) return;
      const team = row.querySelector('.pnteam')?.textContent.replace(/\s+/g, ' ').trim() || texts[1] || 'NPB';
      const link = nameCell.querySelector('a')?.href || url;
      items.push({date, type: page.label, team, player, detail: texts.slice(3).join(' · '), url: link});
    });
    return items;
  }

  function parseNpbRoster(html, date, url) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items = [];
    doc.querySelectorAll('.half_inner_wrap').forEach(box => {
      const removed = (box.querySelector('h5')?.textContent || '').includes('抹消');
      box.querySelectorAll('table tr').forEach(row => {
        const cells = [...row.querySelectorAll('td')];
        if (cells.length < 4) return;
        const team = cells[0].textContent.replace(/\s+/g, ' ').trim();
        const position = cells[1].textContent.replace(/\s+/g, '').trim();
        const nameCell = cells[3];
        const player = nameCell.textContent.replace(/\s+/g, ' ').trim();
        if (!player) return;
        items.push({date, type: removed ? '1군 말소' : '1군 등록', team, player, detail: position, url: nameCell.querySelector('a')?.href || url});
      });
    });
    return items;
  }

  async function loadNpb() {
    const year = new Date().getFullYear();
    const pages = [
      ['pn_registered.html', '신규 등록'], ['pn_traded.html', '트레이드'],
      ['pn_released.html', '자유계약'], ['pn_retired.html', '은퇴']
    ];
    const tasks = pages.map(async ([path, label]) => {
      const url = `https://npb.jp/announcement/${year}/${path}`;
      return parseNpbAnnouncement(await fetchText(url), {label}, url);
    });
    for (let cursor = new Date(startDate()); cursor <= new Date(); cursor.setDate(cursor.getDate() + 1)) {
      const date = iso(cursor);
      const mmdd = `${String(cursor.getMonth() + 1).padStart(2, '0')}${String(cursor.getDate()).padStart(2, '0')}`;
      tasks.push((async () => {
        const url = `https://npb.jp/announcement/roster/roster_${mmdd}.html`;
        return parseNpbRoster(await fetchText(url), date, url);
      })());
    }
    const settled = await Promise.allSettled(tasks);
    const succeeded = settled.filter(result => result.status === 'fulfilled');
    if (!succeeded.length) throw new Error('NPB 공식 공시를 불러오지 못했습니다.');
    return {items: succeeded.flatMap(result => result.value), updated: `${iso(startDate())} ~ ${iso(new Date())}`};
  }

  const loaders = {kbo: loadKbo, mlb: loadMlb, npb: loadNpb, cpbl: loadCpbl};

  function render(league, result) {
    const leagueCfg = cfg[league];
    const sorted = [...result.items].sort((a, b) => b.date.localeCompare(a.date) || a.player.localeCompare(b.player));
    const shown = sorted.slice(0, 250);
    const groups = new Map();
    shown.forEach(item => {
      if (!groups.has(item.date)) groups.set(item.date, []);
      groups.get(item.date).push(item);
    });
    const list = [...groups].map(([date, items]) => `
      <section class="tx-day">
        <h3 class="tx-date">${esc(new Date(`${date}T12:00:00`).toLocaleDateString('ko-KR', {month:'long', day:'numeric', weekday:'short'}))}</h3>
        ${items.map(item => `<article class="tx-item">
          <div><span class="tx-type">${esc(item.type)}</span></div>
          <div><a class="tx-player" href="${esc(item.url || leagueCfg.href)}" target="_blank" rel="noopener noreferrer">${esc(item.player)}</a><span class="tx-team">${esc(item.team)}</span></div>
          <p class="tx-detail">${esc(item.detail || '세부 내용 없음')}</p>
        </article>`).join('')}
      </section>`).join('');
    content.innerHTML = `
      <div class="tx-result-head">
        <div class="tx-result-title"><span class="badge ${leagueCfg.badge}">${league.toUpperCase()}</span><strong>${leagueCfg.name}</strong></div>
        <div class="tx-meta">최근 ${DAYS}일 · ${sorted.length.toLocaleString('ko-KR')}건<br><a href="${leagueCfg.href}" target="_blank" rel="noopener noreferrer">${leagueCfg.source}</a> · ${esc(result.updated)}</div>
      </div>
      ${sorted.length ? `<div class="tx-list">${list}</div>` : `<div class="tx-list"><p class="tx-empty">최근 ${DAYS}일 동안 확인된 이적·등록 소식이 없습니다.</p></div>`}`;
  }

  window.txSelectLeague = async (league, force = false) => {
    if (!loaders[league]) return;
    window.txCurrentLeague = league;
    document.querySelectorAll('[data-tx-league]').forEach(button => {
      const active = button.dataset.txLeague === league;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
    refresh.hidden = false;
    const current = ++requestId;
    if (!force && cache.has(league)) { render(league, cache.get(league)); return; }
    content.innerHTML = `<div class="tx-state is-loading"><div><div class="spin"></div><strong>${league.toUpperCase()} 소식을 불러오는 중</strong><br><small>선택한 리그만 요청하고 있습니다.</small></div></div>`;
    try {
      const result = await loaders[league]();
      if (current !== requestId) return;
      cache.set(league, result);
      render(league, result);
    } catch (error) {
      if (current !== requestId) return;
      content.innerHTML = `<div class="tx-state tx-error"><div><strong>${league.toUpperCase()} 소식을 불러오지 못했습니다.</strong><br><small>${esc(error.message)}</small><br><button type="button" class="text-button" onclick="appRefreshTransactions()">다시 시도</button></div></div>`;
    }
  };
})();
