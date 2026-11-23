/* Search recovery: isolate providers, retain identified players on detail failures. */
(() => {
  'use strict';
  const norm = value => String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s.・·'’\-]/g, '').replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
  const bounded = (promise, ms = 14000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('응답 시간 초과')), ms);
    Promise.resolve(promise).then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
  const profile = (name, league, url, note = '선수는 확인했으나 상세 기록을 불러오지 못했습니다.', bio = {}) => `<div class="pcard" style="padding:24px"><h3>${escH(name)} <span class="badge">${league}</span></h3><p>${escH(note)}</p>${Object.entries({birth:'생년월일',position:'포지션',heightWeight:'신장/체중',career:'경력',signingBonus:'입단 계약금',salary:'연봉',draftRank:'지명순위',joinYear:'입단년도'}).filter(([k])=>typeof bio?.[k]==='string'&&bio[k]).map(([k,label])=>`<p>${label}: ${escH(bio[k])}</p>`).join('')}<a href="${escH(url)}" target="_blank" rel="noopener">공식 선수 페이지 ↗</a></div>`;
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
      const keys = [id, p.n, p.zh, ...(p.aliases || []), ...(aliases[norm(p.n)] || [])].filter(Boolean).map(norm);
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
    if (data.searchProfile) return profile(data.name, league, data.sourceUrl, data.regularOnly ? 'KBO 정규시즌 기록을 확인하지 못했습니다. 다른 시즌 기록은 표시하지 않습니다.' : undefined, data.bio);
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
        if(d.playerId===String(pl.P_ID) && d.searchProfile===true) return {...d,name:pl.P_NM,regularOnly:true};
        if(!r.ok || d.playerId!==String(pl.P_ID) || d.seriesId!=='0' || d.scopeVerified!==true || d.regularSeason!==true || !Array.isArray(d.rows))throw new Error('정규시즌 범위 미확인');
        return {...d,name:pl.P_NM,teamName:pl.T_NM||'',posName:pl.POS_NO||'',backNo:pl.BACK_NO||'',handInfo:pl.P_TYPE||''};
      } catch (_) { return {searchProfile:true,regularOnly:true,name:pl.P_NM,sourceUrl:`https://www.koreabaseball.com/Record/Player/${type==='pitcher'?'Pitcher':'Hitter'}Detail/Total.aspx?playerId=${encodeURIComponent(pl.P_ID)}`}; }
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
  let cpblFullSeasonRequest;
  let cpblFullSeasonLoadedAt=0;
  function cpblFullSeason() {
    if(cpblFullSeasonLoadedAt && Date.now()-cpblFullSeasonLoadedAt>300000) {cpblFullSeasonRequest=null;cpblFullSeasonLoadedAt=0;}
    if (!cpblFullSeasonRequest) cpblFullSeasonRequest=fetch('data/cpbl_standard_2026.json',{cache:'no-store',signal:AbortSignal.timeout(5000)})
      .then(r=>{if(!r.ok)throw Error('CPBL 시즌 표');return r.json();})
      .then(d=>{
        if(d.year!==2026 || d.kindCode!=='A' || !/^\d{4}-\d{2}-\d{2}T/.test(d.readAt||'') || !d.categories?.bat || !d.categories?.pit) return null;
        for(const type of ['bat','pit']) {
          const rows=Object.values(d.categories[type]).flat();
          if(!rows.length || rows.length!==d.counts?.[type] || rows.some(r=>r.Year!=='2026'||r.KindCode!=='A'))return null;
        }
        cpblFullSeasonLoadedAt=Date.now();
        return d;
      }).catch(()=>null).then(d=>{if(!d)cpblFullSeasonRequest=null;return d;});
    return cpblFullSeasonRequest;
  }
  async function searchCpbl(query) {
    const verifiedSeason=cpblFullSeason();
    return Promise.all(cpblMatches(query).map(async id => {
      const p = CPBL_PLAYERS[id], isBatter = !/pitcher/i.test(p.p || '');
      const liveRequest = fetch(`https://all-of-baseball.rockyhong99.chatgpt.site/api/cpbl/player?id=${encodeURIComponent(id)}&year=${new Date().getFullYear()}&type=${isBatter ? 'batter' : 'pitcher'}`, {cache:'no-store',signal:AbortSignal.timeout(19000)})
        .then(async response => {const data=await response.json();if(data.id!==id || data.kindCode!=='A') throw new Error('선수/시즌 불일치');return data;})
        .catch(error => ({status:'unavailable',errors:[error.message]}));
      let careerStats = null;
      try { careerStats = await bounded(_fetchCpblCareerStats(id, isBatter), 10000); } catch (_) {}
      const [live,standard]=await Promise.all([liveRequest,verifiedSeason]);
      return {type:'cpbl', data:{live, standard, name:p.n.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)), nameZh:p.zh, jerseyNo:p.j, team:p.t, pos:p.p, photo:p.ph, bt:p.bt, hw:p.hw, born:p.b, debut:p.d, nation:p.nt, acnt:id, isBatter, careerStats, directoryReadAt:p.directoryReadAt, statsUpdated:cpblSnapshot?.updatedAt || '미확인', pageUrl:`https://stats.cpbl.com.tw/players/${id}`}};
    }));
  }
  // League's own 1군 정규시즌 table, read manually when its public endpoint
  // was unavailable from the deployment network. Replaced by a live row when available.
  const cpblVerifiedStandard = {'0000002679':{readAt:'2026-11-23 19:51 KST',bio:{debut:'2014-09-26',school:'西苑高中',draft:'統一7-ELEVEn獅 2013년 1라운드'},row:{Year:'2026',KindCode:'A',TeamAbbrName:'台鋼雄鷹',TotalGames:20,PitchStarting:20,Wins:4,Loses:5,SaveOK:0,ReliefPointCnt:0,InningPitched:109,Era:3.30,Whip:1.32,PlateAppearances:466,HittingCnt:116,HomeRunCnt:8,BasesONBallsCnt:28,StrikeOutCnt:50}}};
  function liveCpblCard(p) {
    const live=p.live || {}, basic=live.profile;
    const name=basic?.CHName || basic?.ChName || basic?.chName || p.nameZh || p.name;
    const team=basic?.Team?.Name || basic?.team?.name || p.team;
    const id=encodeURIComponent(p.acnt);
    const officialUrl=`https://www.cpbl.com.tw/team/person?acnt=${id}`;
    const advancedUrl=`https://stats.cpbl.com.tw/players/${id}`;
    const regular=r=>r?.KindCode==='A' && /^\d{4}$/.test(String(r.Year)) && (!r.Acnt||r.Acnt===p.acnt);
    const verified=cpblVerifiedStandard[p.acnt];
    const verifiedRow=regular(verified?.row)?verified.row:null;
    const saved=Array.isArray(p.careerStats)?p.careerStats.filter(regular):[];
    const type=p.isBatter?'bat':'pit';
    const season=p.standard?.categories?.[type]?.[p.acnt];
    const siteConfirmed=Array.isArray(season)?season.filter(regular):[];
    const siteYears=new Set(siteConfirmed.map(r=>String(r.Year)));
    // The conventional live route reports fetch time, not what date its
    // totals cover. Never let an unversioned route replace verified season totals.
    const recent=Array.isArray(live.seasonRecords)?live.seasonRecords.filter(r=>regular(r)&&!siteYears.has(String(r.Year))):[];
    const liveYears=new Set(recent.map(r=>String(r.Year)));
    const manual=verifiedRow && !liveYears.has(String(verifiedRow.Year)) && !siteYears.has(String(verifiedRow.Year)) ? [verifiedRow] : [];
    const confirmed=[...siteConfirmed,...manual];
    const freshYears=new Set([...liveYears,...confirmed.map(r=>String(r.Year))]);
    const standardDate=(p.standard?.readAt||'').replace('T',' ').replace(/:\d{2}(?:\.\d+)?\+09:00$/,' KST');
    const bySeason=new Map();
    for (const r of [...recent,...confirmed,...saved.filter(r=>!freshYears.has(String(r.Year)))]) {
      const season=String(r.Year), club=String(r.TeamNo || r.TeamAbbrName || '').trim();
      const group=bySeason.get(season) || new Map();
      if (!group.has(club)) group.set(club,r);
      bySeason.set(season,group);
    }
    const rows=[...bySeason.values()].flatMap(group=>{
      const values=[...group.values()];
      const total=values.find(r=>/^(?:合計|總計|生涯|TOTAL|통산)$/i.test(String(r.TeamAbbrName || '').trim()));
      return total?[total]:values;
    });
    const photos=[basic?.AcntImgPath,basic?.acntImgPath,p.photo];
    const photo=photos.map(value=>{
      if(typeof value!=='string'||!value.trim())return '';
      try {
        const u=new URL(value,'https://www.cpbl.com.tw');
        if(!['https:','http:'].includes(u.protocol)||!['www.cpbl.com.tw','cpbl.com.tw'].includes(u.hostname)||u.username||u.password||u.port||!u.pathname.startsWith('/files/atts/'))return '';
        u.protocol='https:';
        return u.href;
      }catch(_){return '';}
    }).find(Boolean);
    const one=(...values)=>values.map(v=>typeof v==='string'||typeof v==='number'?String(v).trim():'').find(v=>v&&v!=='-'&&v!=='0')||'';
    const sided={L:'좌',R:'우',S:'양'};
    const pitch=sided[one(basic?.PitchingHabbit,basic?.pitchingHabbit).toUpperCase()];
    const bat=sided[one(basic?.StrikeHabbit,basic?.strikeHabbit).toUpperCase()];
    const joined=[pitch&&pitch+'투',bat&&bat+'타'].filter(Boolean).join(' ');
    const height=one(basic?.Height,basic?.height),weight=one(basic?.Weight,basic?.weight);
    const size=[height&&height+'cm',weight&&weight+'kg'].filter(Boolean).join(' / ');
    const birth=one(basic?.BirthDate,basic?.birthDate,p.born).replace(/^(\d{4}-\d{2}-\d{2})T.*$/,'$1');
    const jersey=one(basic?.UniformNo,basic?.uniformNo,p.jerseyNo);
    const position=one(p.pos);
    const debut=one(basic?.FirstGameDate,basic?.firstGameDate,verified?.bio?.debut,p.debut).replace(/^(\d{4}-\d{2}-\d{2})T.*$/,'$1');
    const bio=[['등번호',jersey],['포지션',/pitcher/i.test(position)?'투수':position],['투타',joined||one(p.bt)],['생년월일',birth],['신장/체중',size||one(p.hw)],['데뷔',debut],['이전 이름',one(basic?.AboriginalName,basic?.aboriginalName)],['출신학교',one(basic?.SchoolName,basic?.schoolName,verified?.bio?.school)],['지명',one(verified?.bio?.draft)]]
      .filter(([,value])=>value).map(([label,value])=>`<div class="bc"><div class="bl">${label}</div><div class="bv">${escH(value)}</div></div>`).join('');
    const profile=`<div class="prof"><div class="photo"><span aria-hidden="true">⚾</span>${photo?`<img src="${escH(photo)}" alt="${escH(name)} 선수 사진" onload="this.previousElementSibling.hidden=true" onerror="this.remove()">`:''}</div><div class="pinfo"><h3>${escH(name)} <span class="badge">CPBL</span></h3><p>프로필 소속: ${escH(team || '미확인')}</p>${bio?`<div class="bio-g">${bio}</div>`:''}</div></div>`;
    const fields=p.isBatter
      ? [['TotalGames','G'],['PlateAppearances','PA'],['HitCnt','AB'],['Avg','AVG',3],['HittingCnt','H'],['HomeRunCnt','HR'],['RunBattedINCnt','RBI'],['StealBaseOKCnt','SB'],['Obp','OBP',3],['Slg','SLG',3],['Ops','OPS',3]]
      : [['TotalGames','G'],['PitchStarting','GS'],['Wins','W'],['Loses','L'],['SaveOK','SV'],['ReliefPointCnt','HLD'],['InningPitched','IP',1],['Era','ERA',2],['Whip','WHIP',2],['PlateAppearances','BF'],['HittingCnt','H'],['HomeRunCnt','HR'],['BasesONBallsCnt','BB'],['StrikeOutCnt','SO']];
    const val=(raw,dec=0,pct=false)=>(typeof raw==='number' && Number.isFinite(raw))||(typeof raw==='string' && /^-?\d+(?:\.\d+)?$/.test(raw))
      ? (Number(raw)*(pct?100:1)).toFixed(dec)+(pct?'%':'') : '미제공';
    const wrap=(caption,labels,contents)=>`<div class="tbl-wrap" tabindex="0" role="region" aria-label="${caption}"><table><caption style="text-align:left;padding:12px 0">${caption}</caption><thead><tr>${labels.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${contents}</tbody></table></div>`;
    const standardBody=[...rows].sort((a,b)=>Number(b.Year)-Number(a.Year)).map(r=>
      `<tr><td class="td-yr">${r.Year}</td><td class="td-tm">${escH(r.TeamAbbrName || '미제공')}</td>${fields.map(([key,,dec])=>`<td>${val(r[key],dec)}</td>`).join('')}<td>${recent.includes(r)?'공식 실시간 조회':siteConfirmed.includes(r)?escH(standardDate)+' 공식 전수표':r===verifiedRow?escH(verified.readAt)+' 원문 대조':escH(p.statsUpdated || '확인 시각 미상')+' 저장본'}</td></tr>`).join('');
    const standard=wrap('CPBL 1군 정규시즌 기본 기록',['연도','팀',...fields.map(([,label])=>label),'자료 확인'],standardBody || `<tr><td colspan="${fields.length+3}">확인된 기본 기록 없음</td></tr>`);
    const advancedFields=p.isBatter
      ? [['Pa','PA'],['Ba','AVG',3],['Obp','OBP',3],['Slg','SLG',3],['Woba','wOBA',3]]
      : [['Pa','상대 PA'],['Ba','피AVG',3],['Obp','피OBP',3],['Slg','피SLG',3],['Woba','피wOBA',3],['Kp','K%',1,true],['Bbp','BB%',1,true]];
    const metric=live.status==='ok' && live.metrics;
    const advanced=metric ? `<details><summary>공식 고급 지표 · 기본 기록과 별도 집계</summary>${wrap('CPBL 1군 정규시즌 고급 지표',['연도','팀',...advancedFields.map(([,label])=>label)],`<tr><td class="td-yr">${Number.isInteger(live.year)?live.year:'미확인'}</td><td class="td-tm">${escH(metric.Team?.Name || '미제공')}</td>${advancedFields.map(([key,,dec,pct])=>`<td>${val(metric[key],dec,pct)}</td>`).join('')}</tr>`)}<p class="tbl-note">고급 지표 조회 ${escH(live.retrievedAt || '미확인')} · 기본 기록과 합산하지 않습니다.</p></details>` : '';
    const state=siteConfirmed.length?`2026 공식 정규시즌 전수표 · ${escH(standardDate)} 조회 (실시간 조회 아님)`:recent.length?'CPBL 공식 기본 기록 직접 조회 · 직접 조회에 없는 과거 시즌은 저장본':verifiedRow?`기본 기록 실시간 연결 미확인 · ${escH(verified.readAt)} 공식 원문 대조값과 이전 시즌 저장본`:rows.length?`최신 시즌 성적 미확인 · 공식 기록 저장본 ${escH(p.statsUpdated || '확인 시각 미상')}`:'기본 기록 조회 미확인';
    return `<section class="pcard" style="padding:20px">${profile}<p>${state}</p>${standard}${advanced}<p class="tbl-note">기록표 팀은 해당 시즌 기준입니다. 미제공은 0이 아닙니다.</p><a href="${officialUrl}" target="_blank" rel="noopener">CPBL 공식 선수 페이지</a> · <a href="${advancedUrl}" target="_blank" rel="noopener">CPBL 공식 고급 지표</a></section>`;
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
      all.filter(r=>r.type==='cpbl').forEach(r=>cards.insertAdjacentHTML('beforeend',liveCpblCard(r.data) + recentCpblCard(r.data.acnt)));
      if (leagues.includes('cpbl') && window.cpblDirectory) main.insertAdjacentHTML('beforeend', `<p class="tbl-note">CPBL 공식 명감 ${window.cpblDirectory.count}명 · 확인 ${escH(window.cpblDirectory.readAt)}<br>기본 기록과 공식 고급 지표는 서로 다른 표에 표시합니다.</p>`);
      main.insertAdjacentHTML('afterbegin', '<p class="tbl-note">2026.11.23-gh6 · KBO 서버 검증판 · 모든 리그 정규시즌 전용 · 시범경기/포스트시즌 제외 · 새 검색마다 조회 시도 · 실패/캐시 여부 별도 표시</p>');
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
  window.baseballSearch = Object.freeze({normalize:norm, npbMatches, cpblMatches, liveCpblCard});
})();
