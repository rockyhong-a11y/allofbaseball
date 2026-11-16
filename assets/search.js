/* Search recovery: isolate providers, retain identified players on detail failures. */
(() => {
  'use strict';
  const norm = value => String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s.・·'’\-]/g, '').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const bounded = (promise, ms = 14000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('응답 시간 초과')), ms);
    Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
  const profile = (name, league, url, note = '선수는 확인했으나 상세 기록을 불러오지 못했습니다.') => `<div class="pcard" style="padding:24px"><h3>${escH(name)} <span class="badge">${league}</span></h3><p>${escH(note)}</p><a href="${escH(url)}" target="_blank" rel="noopener">공식 선수 페이지 ↗</a></div>`;
  function npbMatches(query) {
    const q = norm(query), found = new Map();
    if (!q) return [];
    for (const map of [NPB_KO_MAP, NPB_EN_MAP, NPB_YOMI_MAP]) {
      for (const [alias, name] of Object.entries(map)) if (norm(alias).includes(q)) found.set(name, norm(alias) === q ? 0 : 1);
    }
    for (const name of Object.keys(NPB_BIS_INDEX)) if (norm(name).includes(q)) found.set(name, norm(name) === q ? 0 : 1);
    return [...found].sort((a,b) => a[1]-b[1]).map(([name]) => name).slice(0, 12);
  }
  function cpblMatches(query) {
    const q = norm(query), matches = new Map();
    if (!q) return [];
    const aliases = {};
    for (const map of [CPBL_KO_MAP, CPBL_ZH_MAP]) for (const [alias, name] of Object.entries(map)) (aliases[norm(name)] ||= []).push(alias);
    for (const [id, p] of Object.entries(CPBL_PLAYERS)) {
      const keys = [p.n, p.zh, ...(p.aliases || []), ...(aliases[norm(p.n)] || [])].filter(Boolean).map(norm);
      if (keys.some(k => k.includes(q))) matches.set(id, keys.includes(q) ? 0 : 1);
    }
    return [...matches].sort((a,b) => a[1]-b[1]).map(([id]) => id).slice(0, 12);
  }
  const originalKboDetail = _kboFetchPlayer;
  _kboFetchPlayer = async (proxy, pl) => {
    try { const data = await bounded(originalKboDetail(proxy, pl), 31000); if (data) return data; } catch (_) {}
    return {searchProfile: true, regularOnly:true, name: pl.P_NM, sourceUrl: `https://www.koreabaseball.com/Record/Player/${/투수/.test(pl.POS_NO) ? 'Pitcher' : 'Hitter'}Detail/Total.aspx?playerId=${encodeURIComponent(pl.P_ID)}`};
  };
  const originalExternalCard = buildExternalCard;
  buildExternalCard = (data, league) => {
    if (league === 'KBO' && !data.searchProfile && (data.scopeVerified !== true || data.seriesId !== '0' || data.regularSeason !== true)) return profile(data.name, 'KBO', '/','정규시즌 검증 실패로 성적을 차단했습니다.');
    if (data.searchProfile) return profile(data.name, league, data.sourceUrl, data.regularOnly ? 'KBO 정규시즌 기록을 확인하지 못했습니다. 다른 시즌 기록은 표시하지 않습니다.' : undefined);
    const card = originalExternalCard(data, league);
    return `<p class="tbl-note">${league} 정규시즌 기록만 표시 · 공식 자료 조회 ${escH(data.fetchedAt || '미확인')}</p>` + card;
  };
  fetchKboData = async query => {
    const response=await fetch('https://all-of-baseball.rockyhong99.chatgpt.site/api/kbo/search?q='+encodeURIComponent(query.replace(/\s+/g,'')), {cache:'no-store',signal:AbortSignal.timeout(23000)});
    const search=await response.json();
    if(!response.ok || search.scope!=='KBO_REGULAR' || !Array.isArray(search.players)) throw new Error('KBO 선수 검색 실패');
    return Promise.all(search.players.map(async pl => {
      const type=/투수/.test(pl.POS_NO || pl.POS_NM || '')?'pitcher':'hitter';
      try {
        const r=await fetch(`https://all-of-baseball.rockyhong99.chatgpt.site/api/kbo/player?id=${encodeURIComponent(pl.P_ID)}&type=${type}`,{cache:'no-store',signal:AbortSignal.timeout(45000)});
        const d=await r.json();
        if(!r.ok || d.playerId!==String(pl.P_ID) || d.seriesId!=='0' || d.scopeVerified!==true || d.regularSeason!==true || !Array.isArray(d.rows))throw new Error('정규시즌 범위 미확인');
        return {...d,name:pl.P_NM,teamName:pl.T_NM||'',posName:pl.POS_NO||'',backNo:pl.BACK_NO||'',handInfo:pl.P_TYPE||''};
      } catch (_) { return {searchProfile:true,regularOnly:true,name:pl.P_NM,sourceUrl:`https://all-of-baseball.rockyhong99.chatgpt.site/api/kbo/player?id=${encodeURIComponent(pl.P_ID)}&type=${type}`}; }
    }));
  };
  mlbFetch = async (q, sportIds = '1') => {
    const sp = sportIds ? `&sportIds=${sportIds}` : '';
    const response = await fetch(`https://statsapi.mlb.com/api/v1/people/search?names=${encodeURIComponent(q)}${sp}`, {signal: AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error(`MLB HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.people)) throw new Error('MLB 응답 형식 오류');
    return data.people.slice(0, 12);
  };
  const originalApiCard = buildApiCard;
  buildApiCard = async player => {
    try { const card=await bounded(originalApiCard(player), 11000); return `<div><p class="tbl-note">MLB 정규시즌(R) · 공식 API 조회 ${escH(new Date().toISOString())}</p>${card}</div>`; }
    catch (_) { return profile(player.fullName, 'MLB', `https://www.mlb.com/player/${player.id}`); }
  };
  async function searchMlb(query) {
    let names = [query];
    if (isKorean(query)) {
      const q = norm(query);
      const entries = Object.entries(KO_MAP).filter(([k]) => norm(k).includes(q));
      const exact = entries.filter(([k]) => norm(k) === q);
      names = [...new Set((exact.length ? exact : entries).map(([,v]) => v))].slice(0, 8);
      if (!names.length) names = [romanize(query)];
    }
    const groups = await Promise.all(names.map(n => mlbFetch(n, '1')));
    return [...new Map(groups.flat().map(p => [p.id, {type:'api', data:p}])).values()];
  }
  async function searchNpb(query) {
    const names = npbMatches(query);
    if (!names.length) {
      const d = await bounded(fetchNpbData(query), 13000);
      return d ? [{type:'external', data:d, league:'NPB'}] : [];
    }
    return Promise.all(names.map(async name => {
      let data; try { data = await bounded(fetchNpbData(name), 12000); } catch (_) {}
      if (data) return {type:'external', data, league:'NPB'};
      const id = NPB_BIS_INDEX[name];
      return {type:'external', league:'NPB', data:{searchProfile:true, name, sourceUrl: id ? `https://npb.jp/bis/players/${id}.html` : 'https://npb.jp/bis/players/'}};
    }));
  }
  // Fetch metadata and all chunks from ONE origin; never label a local fallback
  // with a newer remote timestamp. Retry freshness after five minutes.
  let cpblSnapshot = null, cpblSnapshotPromise = null;
  _loadCpblStatsDb = async () => {
    if (cpblSnapshot && Date.now() - cpblSnapshot.loadedAt < 300000) return cpblSnapshot.db;
    if (cpblSnapshotPromise) return cpblSnapshotPromise;
    cpblSnapshotPromise = (async () => {
      for (const base of ['https://raw.githubusercontent.com/rockyhong-a11y/allofbaseball/main/data/', 'data/']) {
        try {
          const get = async name => {
            const r = await fetch(base + name, {cache:'no-store',signal:AbortSignal.timeout(4000)});
            if (!r.ok) throw new Error('CPBL HTTP ' + r.status);
            return r.json();
          };
          const meta = await get('cpbl_meta.json');
          const parts = meta.stats_parts?.length ? meta.stats_parts : ['cpbl_stats.json'];
          if (parts.some(p => !/^cpbl_stats(?:_part_\d+)?\.json$/.test(p))) throw new Error('Invalid stats manifest');
          const chunks = await Promise.all(parts.map(get));
          const db = Object.assign({}, ...chunks);
          if (!Object.keys(db).length) throw new Error('Empty stats snapshot');
          cpblSnapshot = {db, updatedAt:meta.stats_updated || '미확인', loadedAt:Date.now(), source:base};
          return db;
        } catch (_) {}
      }
      return null;
    })();
    try { return await cpblSnapshotPromise; } finally { cpblSnapshotPromise = null; }
  };
  _fetchCpblCareerStats = async (id, isBatter) => {
    const db = await _loadCpblStatsDb();
    const rows = db?.[id]?.[isBatter ? 'bat' : 'pit'];
    return Array.isArray(rows) ? rows.filter(r => r.KindCode === 'A') : null;
  };
  async function searchCpbl(query) {
    return Promise.all(cpblMatches(query).map(async id => {
      const p = CPBL_PLAYERS[id], isBatter = !/pitcher/i.test(p.p || '');
      const liveRequest = fetch(`https://all-of-baseball.rockyhong99.chatgpt.site/api/cpbl/player?id=${encodeURIComponent(id)}&year=${new Date().getFullYear()}&type=${isBatter ? 'batter' : 'pitcher'}`, {cache:'no-store',signal:AbortSignal.timeout(19000)})
        .then(async response => {const data=await response.json();if(data.id!==id || data.kindCode!=='A') throw new Error('선수/시즌 불일치');return data;})
        .catch(error => ({status:'unavailable',errors:[error.message]}));
      let careerStats = null;
      try { careerStats = await bounded(_fetchCpblCareerStats(id, isBatter), 10000); } catch (_) {}
      const live = await liveRequest;
      return {type:'cpbl', data:{live, name:p.n.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)), nameZh:p.zh, jerseyNo:p.j, team:p.t, pos:p.p, photo:p.ph, bt:p.bt, hw:p.hw, born:p.b, debut:p.d, nation:p.nt, acnt:id, isBatter, careerStats, directoryReadAt:p.directoryReadAt, statsUpdated:cpblSnapshot?.updatedAt || '미확인', pageUrl:`https://stats.cpbl.com.tw/players/${id}`}};
    }));
  }
  function liveCpblCard(p) {
    const live=p.live || {status:'unavailable'}, basic=live.profile;
    const name=basic?.ChName || basic?.chName || p.nameZh || p.name;
    const team=basic?.Team?.Name || basic?.team?.name || p.team;
    const row=live.metrics;
    const specs=p.isBatter ? [['Pa','PA',0],['Ba','AVG',3],['Obp','OBP',3],['Slg','SLG',3],['Woba','wOBA',3]] : [['Pa','상대 PA',0],['Ba','피AVG',3],['Obp','피OBP',3],['Slg','피SLG',3],['Woba','피wOBA',3],['Kp','K%',1,true],['Bbp','BB%',1,true]];
    const cells=row ? specs.filter(([key])=>typeof row[key]==='number').map(([key,label,dec,pct])=>`<span class="badge">${label} ${Number(row[key]*(pct?100:1)).toFixed(dec)}${pct?'%':''}</span>`).join(' ') : '';
    const state=live.status==='ok' ? '공식 DB 직접 조회 · 1군 정규시즌(A)' : live.status==='no_metrics' ? '해당 시즌 정규시즌 지표 없음' : '최신 공식 DB 조회 실패 · 이전 캐시를 최신으로 대체하지 않음';
    return `<section class="pcard" style="padding:20px"><h3>${escH(name)} <span class="badge">CPBL</span></h3><p>${escH(team || '')}</p><p>${escH(state)}</p>${cells ? `<div>${cells}</div>` : ''}<p class="tbl-note">${live.retrievedAt ? `조회 ${escH(live.retrievedAt)} · ` : ''}제공처 갱신 시각/집계 마감 시각은 미제공. 공식 시즌지표 데이터셋이며 연도별 통산표와 혼합하지 않습니다. 제공되지 않은 G·HR·RBI·ERA·WHIP 등은 계산하거나 채우지 않습니다.</p><a href="https://stats.cpbl.com.tw/players/${escH(p.acnt)}" target="_blank" rel="noopener">공식 선수 DB</a>${live.sources?.metrics ? ` · <a href="${escH(live.sources.metrics)}" target="_blank" rel="noopener">공식 지표 원본</a>` : ''}</section>`;
  }
  function recentCpblCard(id) {
    const snapshot = window.cpblRecentRegular;
    if (!snapshot) return '';
    const lines=[];
    for (const g of snapshot.games) {
      if (g.kindCode !== 'A' || g.gameStatus !== 'FINISHED') continue;
      for (const side of [g.home,g.visiting]) {
        const h=side.hitters?.find(p=>p.hitterAcnt===id);
        const p=side.pitchers?.find(p=>p.pitcherAcnt===id);
        if (!h && !p) continue;
        const detail=h ? `PA ${h.plateAppearances} · AB ${h.hitCnt} · H ${h.hittingCnt} · HR ${h.homeRunCnt} · RBI ${h.runBattedInCnt} · BB ${h.basesOnBallsCnt} · 경기 당시 시즌 AVG ${Number(h.avg).toFixed(3)}` : `IP ${p.inningPitchedCnt} ${p.inningPitchedDiv3Cnt}/3 · ER ${p.earnedRunCnt} · SO ${p.strikeOutCnt} · BB ${p.basesOnBallsCnt}`;
        lines.push(`<li>${escH(g.preExeDate.slice(0,10))} · ${escH(detail)} <a href="https://stats.cpbl.com.tw/schedule/${escH(g.gameId)}" target="_blank" rel="noopener">공식 박스스코어</a></li>`);
      }
    }
    return lines.length ? `<section class="pcard" style="padding:16px"><h4>10/1 이후 확인된 정규경기</h4><ul>${lines.join('')}</ul><p class="tbl-note">개별 경기 기록이며 시즌 누적에 합산하지 않았습니다. ${escH(snapshot.coverageNote)} 조회 ${escH(snapshot.readAt)}</p></section>` : '';
  }
  // Each league reports independently. Slow providers cannot hide successful results.
  async function search(query, leagues, requestId) {
    if (leagues.includes('cpbl')) { cpblSnapshot=null; _cpblMetaCache=null; }
    setLoading(query);
    const status = {}, results = {};
    const render = async () => {
      if (requestId !== _searchRequestId) return;
      const all = leagues.flatMap(l => results[l] || []);
      const regular = all.filter(r => r.type !== 'cpbl');
      await renderAll(regular, query, requestId);
      if (requestId !== _searchRequestId) return;
      const main = document.getElementById('main');
      if (!regular.length) main.innerHTML = `<div class="rhead"><h3>🔍 ${escH(query)}</h3></div><div id="cards"></div>`;
      const cards = document.getElementById('cards');
      all.filter(r=>r.type==='cpbl').forEach(r=>cards.insertAdjacentHTML('beforeend',liveCpblCard(r.data) + recentCpblCard(r.data.acnt) + `<details><summary>이전 연도별 캐시 · ${escH(r.data.statsUpdated || '미확인')} (최신 확인 안 됨)</summary>` + buildCpblCard(r.data) + '</details>'));
      if (leagues.includes('cpbl') && window.cpblDirectory) main.insertAdjacentHTML('beforeend', `<p class="tbl-note">CPBL 공식 명감 ${window.cpblDirectory.count}명 · 확인 ${escH(window.cpblDirectory.readAt)}<br>공식 정규시즌 지표는 검색 시 직접 조회합니다. 연도별 성적 캐시는 접힌 영역에 별도 표시합니다.</p>`);
      main.insertAdjacentHTML('afterbegin', '<p class="tbl-note">2026.11.16-gh1 · KBO 서버 검증판 · 모든 리그 정규시즌 전용 · 시범경기/포스트시즌 제외 · 새 검색마다 조회 시도 · 실패/캐시 여부 별도 표시</p>');
      const summary = leagues.map(l=>`${l.toUpperCase()}: ${status[l] || '검색 중…'}`).join(' · ');
      main.insertAdjacentHTML('afterbegin', `<p role="status" style="padding:12px;color:var(--mu)">${escH(summary)}</p>`);
      if (all.some(r=>r.type==='cpbl')) _fillCpblMeta('stats');
    };
    await Promise.all(leagues.map(async league => {
      try {
        const task = league === 'kbo' ? fetchKboData(query).then(a=>(Array.isArray(a)?a:[a]).filter(Boolean).map(data=>({type:'external',data,league:'KBO'}))) : league === 'mlb' ? searchMlb(query) : league === 'npb' ? searchNpb(query) : searchCpbl(query);
        results[league] = await bounded(task, league === 'kbo' ? 70000 : 21000);
        status[league] = results[league].length ? `${results[league].length}명` : (league==='npb'||league==='cpbl' ? '등록된 이름 색인에서 일치 없음' : '검색 결과 없음');
      } catch (_) { status[league] = '연결 실패 · 재시도 필요'; }
      await render();
    }));
  }
  runAll = (q,id=_searchRequestId) => search(q,['kbo','mlb','npb','cpbl'],id);
  runMLB = (q,id=_searchRequestId) => search(q,['mlb'],id);
  runKboNpb = (q,league,id=_searchRequestId) => search(q,[league],id);
  runCpbl = (q,id=_searchRequestId) => search(q,['cpbl'],id);
  // Exposed read-only helpers allow repeatable regression tests of every index.
  window.baseballSearch = Object.freeze({normalize:norm, npbMatches, cpblMatches});
})();
