// ⚾ Baseball Standings Widget
// Scriptable (iOS) — rockyhong-a11y.github.io/allofbaseball
//
// 위젯 파라미터 (Widget Parameter):
//   kbo          🇰🇷 KBO 순위
//   mlb-al-e     AL East    mlb-al-c  AL Central    mlb-al-w  AL West
//   mlb-nl-e     NL East    mlb-nl-c  NL Central    mlb-nl-w  NL West
//   npb-cl       NPB 센트럴리그        npb-pl        NPB 퍼시픽리그
//   cpbl         🇹🇼 CPBL 순위
//   all          ★ 전리그 4컬럼 Large 위젯 (KBO|NPB|NL|AL)
//
// 기본값: kbo

"use strict";

const PARAM = ((args.widgetParameter || 'kbo').toLowerCase().trim());
const YEAR  = new Date().getFullYear();
const NOW   = new Date();
const CF    = 'https://kbo-proxy.rockyhong.workers.dev';
const CTABS = 'https://api.codetabs.com/v1/proxy/?quest=';
const S     = 'https://rockyhong-a11y.github.io/allofbaseball/';
const ESPN  = 'https://a.espncdn.com/i/teamlogos/mlb/500/';

// ── 색상 ────────────────────────────────────────────────
const C = {
  bg:   Color.dynamic(new Color('#f0f4f8'), new Color('#070c18')),
  tx:   Color.dynamic(new Color('#1a2a40'), new Color('#dde4f0')),
  mu:   Color.dynamic(new Color('#5a6e8c'), new Color('#5a6e8c')),
  mu2:  Color.dynamic(new Color('#3d5270'), new Color('#8496b0')),
  div:  Color.dynamic(new Color('#d0d9e8'), new Color('#1c2b45')),
  kbo:  Color.dynamic(new Color('#2d6fd4'), new Color('#4f8ef7')),
  mlb:  Color.dynamic(new Color('#cc1a10'), new Color('#e8352a')),
  npb:  Color.dynamic(new Color('#c01040'), new Color('#e83060')),
  cpbl: Color.dynamic(new Color('#c02a00'), new Color('#e8461e')),
};

// ── 팀 로고 URL 맵 ──────────────────────────────────────
const LOGO = {
  // KBO
  'KIA': S+'logos/kbo-KIA.png',    'LG':  S+'logos/kbo-LG.png',
  '키움': S+'logos/kbo-Kiwoom.png', 'SSG': S+'logos/kbo-SSG.png',
  '두산': S+'logos/kbo-Doosan.png', '삼성': S+'logos/kbo-Samsung.png',
  '롯데(KBO)': S+'logos/kbo-Lotte.png', 'NC':  S+'logos/kbo-NC.png',
  'KT':  S+'logos/kbo-KT.png',     '한화': S+'logos/kbo-Hanwha.png',
  // NPB
  '야쿠르트': S+'logos/npb-Swallows.png', '히로시마': S+'logos/npb-Carp.png',
  '요미우리':  S+'logos/npb-Giants.png',   '주니치':   S+'logos/npb-Dragons.png',
  'DeNA':      S+'logos/npb-DeNA.png',     '한신':     S+'logos/npb-Tigers.png',
  '소프트뱅크': S+'logos/npb-Hawks.png',   '닛폰햄':  S+'logos/npb-Fighters.png',
  '라쿠텐':   S+'logos/npb-Eagles.png',    '롯데(NPB)': S+'logos/npb-Marines.png',
  'ORIX':     S+'logos/npb-Buffaloes.png', '세이부':   S+'logos/npb-Lions.png',
  // CPBL
  'Brothers':  S+'logos/cpbl-Brothers.png',
  'Dragons':   S+'logos/cpbl-Dragons.png',
  'DRAGONS':   S+'logos/cpbl-Dragons.png',
  'Guardians': S+'logos/cpbl-Guardians.png',
  'Monkeys':   S+'logos/cpbl-Monkeys.png',
  'TSG Hawks': S+'logos/cpbl-Hawks.png',
  'U-Lions':   S+'logos/cpbl-UniLions.png',
  // MLB (ESPN PNG)
  'BAL':ESPN+'bal.png','BOS':ESPN+'bos.png','NYY':ESPN+'nyy.png',
  'TB': ESPN+'tb.png', 'TOR':ESPN+'tor.png',
  'CWS':ESPN+'chw.png','CLE':ESPN+'cle.png','DET':ESPN+'det.png',
  'KC': ESPN+'kc.png', 'MIN':ESPN+'min.png',
  'HOU':ESPN+'hou.png','LAA':ESPN+'laa.png','OAK':ESPN+'oak.png',
  'SEA':ESPN+'sea.png','TEX':ESPN+'tex.png',
  'ATL':ESPN+'atl.png','MIA':ESPN+'mia.png','NYM':ESPN+'nym.png',
  'PHI':ESPN+'phi.png','WSH':ESPN+'wsh.png',
  'CHC':ESPN+'chc.png','CIN':ESPN+'cin.png','MIL':ESPN+'mil.png',
  'PIT':ESPN+'pit.png','STL':ESPN+'stl.png',
  'ARI':ESPN+'ari.png','COL':ESPN+'col.png','LAD':ESPN+'lad.png',
  'SD': ESPN+'sd.png', 'SF': ESPN+'sf.png',
};

// ── 리그 메타 ────────────────────────────────────────────
function leagueMeta(p) {
  if (p === 'kbo')         return { label: '🇰🇷 KBO', color: C.kbo };
  if (p.startsWith('mlb')) return { label: '🇺🇸 MLB', color: C.mlb };
  if (p.startsWith('npb')) return { label: '🇯🇵 NPB', color: C.npb };
  if (p === 'cpbl')        return { label: '🇹🇼 CPBL', color: C.cpbl };
  return { label: '⚾', color: C.mu };
}

// ── 로고 일괄 프리페치 ───────────────────────────────────
async function loadLogos(groups) {
  const urls = new Set();
  for (const { teams } of groups)
    for (const t of teams)
      if (t.logoKey && LOGO[t.logoKey]) urls.add(LOGO[t.logoKey]);
  const cache = {};
  await Promise.all([...urls].map(async url => {
    try { cache[url] = await new Request(url).loadImage(); }
    catch { cache[url] = null; }
  }));
  return cache;
}

// ── 데이터 페치 ──────────────────────────────────────────

async function fetchKbo() {
  const KBO_KEY = {
    'KIA':'KIA','LG':'LG','키움':'키움','SSG':'SSG','두산':'두산',
    '삼성':'삼성','롯데':'롯데(KBO)','NC':'NC','KT':'KT','한화':'한화',
  };
  const req = new Request(`${CF}/ws/Main.asmx/GetTeamRank?leId=1&srId=0&seasonId=${YEAR}`);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  if (!data?.rows?.length) throw new Error('KBO 데이터 없음');
  return data.rows.map((rec, i) => {
    const row = rec.row;
    const raw = row[1]?.Text || '';
    const m   = raw.match(/>([^<]+)</);
    const short = m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
    const key = KBO_KEY[short] || short;
    return {
      rank: i + 1, team: short, logoKey: key,
      w: parseInt(row[3]?.Text) || 0, l: parseInt(row[4]?.Text) || 0,
      d: parseInt(row[5]?.Text) || 0, pct: row[6]?.Text || '-', gb: row[7]?.Text || '-',
    };
  });
}

async function fetchMlb(divFilter) {
  const ML_KO = {
    'Baltimore Orioles':'볼티모어','Boston Red Sox':'보스턴','New York Yankees':'뉴욕 양키스',
    'Tampa Bay Rays':'탬파베이','Toronto Blue Jays':'토론토',
    'Chicago White Sox':'시카고 WS','Cleveland Guardians':'클리블랜드',
    'Detroit Tigers':'디트로이트','Kansas City Royals':'캔자스시티','Minnesota Twins':'미네소타',
    'Houston Astros':'휴스턴','Los Angeles Angels':'LA 에인절스','Athletics':'애슬레틱스',
    'Seattle Mariners':'시애틀','Texas Rangers':'텍사스',
    'Atlanta Braves':'애틀랜타','Miami Marlins':'마이애미','New York Mets':'뉴욕 메츠',
    'Philadelphia Phillies':'필라델피아','Washington Nationals':'워싱턴',
    'Chicago Cubs':'시카고 컵스','Cincinnati Reds':'신시내티','Milwaukee Brewers':'밀워키',
    'Pittsburgh Pirates':'피츠버그','St. Louis Cardinals':'세인트루이스',
    'Arizona Diamondbacks':'애리조나','Colorado Rockies':'콜로라도',
    'Los Angeles Dodgers':'LA 다저스','San Diego Padres':'샌디에이고','San Francisco Giants':'SF 자이언츠',
  };
  const ML_ABB = {
    'Baltimore Orioles':'BAL','Boston Red Sox':'BOS','New York Yankees':'NYY',
    'Tampa Bay Rays':'TB','Toronto Blue Jays':'TOR',
    'Chicago White Sox':'CWS','Cleveland Guardians':'CLE','Detroit Tigers':'DET',
    'Kansas City Royals':'KC','Minnesota Twins':'MIN','Houston Astros':'HOU',
    'Los Angeles Angels':'LAA','Athletics':'OAK','Seattle Mariners':'SEA','Texas Rangers':'TEX',
    'Atlanta Braves':'ATL','Miami Marlins':'MIA','New York Mets':'NYM',
    'Philadelphia Phillies':'PHI','Washington Nationals':'WSH','Chicago Cubs':'CHC',
    'Cincinnati Reds':'CIN','Milwaukee Brewers':'MIL','Pittsburgh Pirates':'PIT',
    'St. Louis Cardinals':'STL','Arizona Diamondbacks':'ARI','Colorado Rockies':'COL',
    'Los Angeles Dodgers':'LAD','San Diego Padres':'SD','San Francisco Giants':'SF',
  };
  const DIV_KEY = {
    'American League East':'al-e','American League Central':'al-c','American League West':'al-w',
    'National League East':'nl-e','National League Central':'nl-c','National League West':'nl-w',
  };
  const DIV_LABEL = {
    'al-e':'AL East','al-c':'AL Central','al-w':'AL West',
    'nl-e':'NL East','nl-c':'NL Central','nl-w':'NL West',
  };
  const req = new Request(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${YEAR}&standingsTypes=regularSeason&hydrate=team,league,division`);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  const groups = [];
  for (const rec of (data.records || [])) {
    const key = DIV_KEY[rec.division?.name || ''];
    if (!key) continue;
    const filterKey = divFilter === 'mlb' ? null : divFilter.replace('mlb-', '');
    if (filterKey && filterKey !== key) continue;
    const teams = (rec.teamRecords || []).map((tr, i) => ({
      rank: i + 1,
      team: ML_KO[tr.team?.name] || tr.team?.name || '',
      logoKey: ML_ABB[tr.team?.name] || '',
      w: tr.wins || 0, l: tr.losses || 0, d: 0,
      pct: tr.winningPercentage || '-', gb: tr.gamesBack || '-',
    }));
    groups.push({ section: DIV_LABEL[key], teams });
  }
  if (!groups.length) throw new Error('MLB 데이터 없음');
  return groups;
}

async function fetchNpb(leagueFilter) {
  const NPB_KO = {
    'ヤクルト':'야쿠르트','広島':'히로시마','読売':'요미우리','中日':'주니치','DeNA':'DeNA','阪神':'한신',
    'ソフトバンク':'소프트뱅크','日本ハム':'닛폰햄','楽天':'라쿠텐','ロッテ':'롯데(NPB)','オリックス':'ORIX','西武':'세이부',
  };
  const DISPLAY = { '롯데(NPB)':'롯데' }; // 표시명은 롯데
  const parseHtml = (html) => {
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const teams = [];
    for (const [, row] of rows) {
      const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim());
      if (cells.length < 6) continue;
      const koKey = Object.keys(NPB_KO).find(k => cells[0].includes(k));
      if (!koKey) continue;
      const logoKey = NPB_KO[koKey];
      const display = DISPLAY[logoKey] || logoKey;
      teams.push({
        rank: teams.length + 1, team: display, logoKey,
        w: parseInt(cells[2]) || 0, l: parseInt(cells[3]) || 0, d: parseInt(cells[4]) || 0,
        pct: cells[5] || '-', gb: teams.length === 0 ? '-' : (cells[6] || '-'),
      });
    }
    return teams;
  };
  const fetch1 = async slug => {
    const req = new Request(`${CTABS}${encodeURIComponent(`https://npb.jp/${slug}/`)}`);
    req.timeoutInterval = 15;
    return parseHtml(await req.loadString());
  };
  const groups = [];
  if (leagueFilter !== 'npb-pl') {
    const cl = await fetch1('cl');
    if (cl.length) groups.push({ section: '센트럴리그', teams: cl });
  }
  if (leagueFilter !== 'npb-cl') {
    const pl = await fetch1('pl');
    if (pl.length) groups.push({ section: '퍼시픽리그', teams: pl });
  }
  if (!groups.length) throw new Error('NPB 데이터 없음');
  return groups;
}

async function fetchCpbl() {
  const req = new Request(`${CTABS}${encodeURIComponent('https://en.cpbl.com.tw/standings/season')}`);
  req.timeoutInterval = 15;
  const html = await req.loadString();
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map(m => m[1]);
  for (const tbl of tables) {
    const rows = [...tbl.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    if (rows.length < 3) continue;
    const parsed = rows
      .map(([,rh]) => [...rh.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim()))
      .filter(r => r.length >= 4);
    if (!parsed.length) continue;
    const hdr = parsed[0];
    if (!hdr.some(c => /^W$/i.test(c) || /W-T-L/i.test(c))) continue;
    const iRank=hdr.findIndex(c=>/rank|^#$/i.test(c)), iTeam=hdr.findIndex(c=>/team/i.test(c));
    const iWTL=hdr.findIndex(c=>/W-T-L/i.test(c)), iPCT=hdr.findIndex(c=>/pct/i.test(c));
    const iGB=hdr.findIndex(c=>c==='GB');
    const teams = [];
    for (let i = 1; i < parsed.length; i++) {
      const r = parsed[i]; if (r.length < 4) continue;
      let rank = i, team = '';
      if (iRank >= 0 && iTeam >= 0 && iRank !== iTeam) { rank=parseInt(r[iRank])||i; team=r[iTeam]; }
      else { const mt=r[0].match(/^(\d+)\s+(.+)/); if(mt){rank=parseInt(mt[1]);team=mt[2].trim();}else{rank=i;team=r[0];} }
      if (!team) continue;
      const wtl=iWTL>=0?r[iWTL]:r[3]||''; const pct=iPCT>=0?r[iPCT]:(r[4]||'-'); const gb=iGB>=0?r[iGB]:(r[5]||'-');
      const wtlM=wtl.match(/(\d+)-(\d+)-(\d+)/);
      teams.push({ rank, team, logoKey: team, w:wtlM?parseInt(wtlM[1]):0, l:wtlM?parseInt(wtlM[3]):0,
        d:wtlM?parseInt(wtlM[2]):0, pct, gb });
    }
    if (teams.length) return [{ section: null, teams }];
  }
  throw new Error('CPBL 데이터 없음');
}

// ── 전리그용: MLB 지구별 그룹 페치 ─────────────────────
async function fetchMlbAll() {
  const ML_ABB = {
    'Baltimore Orioles':'BAL','Boston Red Sox':'BOS','New York Yankees':'NYY',
    'Tampa Bay Rays':'TB','Toronto Blue Jays':'TOR',
    'Chicago White Sox':'CWS','Cleveland Guardians':'CLE','Detroit Tigers':'DET',
    'Kansas City Royals':'KC','Minnesota Twins':'MIN','Houston Astros':'HOU',
    'Los Angeles Angels':'LAA','Athletics':'OAK','Seattle Mariners':'SEA','Texas Rangers':'TEX',
    'Atlanta Braves':'ATL','Miami Marlins':'MIA','New York Mets':'NYM',
    'Philadelphia Phillies':'PHI','Washington Nationals':'WSH','Chicago Cubs':'CHC',
    'Cincinnati Reds':'CIN','Milwaukee Brewers':'MIL','Pittsburgh Pirates':'PIT',
    'St. Louis Cardinals':'STL','Arizona Diamondbacks':'ARI','Colorado Rockies':'COL',
    'Los Angeles Dodgers':'LAD','San Diego Padres':'SD','San Francisco Giants':'SF',
  };
  const DIV_MAP = {
    'American League East':    { lg:'al', sec:'East' },
    'American League Central': { lg:'al', sec:'Cntrl' },
    'American League West':    { lg:'al', sec:'West' },
    'National League East':    { lg:'nl', sec:'East' },
    'National League Central': { lg:'nl', sec:'Cntrl' },
    'National League West':    { lg:'nl', sec:'West' },
  };
  const req = new Request(`https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${YEAR}&standingsTypes=regularSeason&hydrate=team,league,division`);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();

  const al = {East:[], Cntrl:[], West:[]};
  const nl = {East:[], Cntrl:[], West:[]};
  for (const rec of (data.records || [])) {
    const dm = DIV_MAP[rec.division?.name || ''];
    if (!dm) continue;
    const target = dm.lg === 'al' ? al : nl;
    target[dm.sec] = (rec.teamRecords || []).map((tr, i) => ({
      rank: i + 1,
      team: ML_ABB[tr.team?.name] || tr.team?.name?.slice(0,5) || '',
      logoKey: ML_ABB[tr.team?.name] || '',
      w: tr.wins || 0, l: tr.losses || 0, d: 0,
      pct: tr.winningPercentage || '-',
    }));
  }
  const toGroups = obj => ['East','Cntrl','West'].map(s => ({ section: s, teams: obj[s] || [] })).filter(g => g.teams.length);
  return { al: toGroups(al), nl: toGroups(nl) };
}

// ── 렌더링 헬퍼 ─────────────────────────────────────────

function fmtPct(raw) {
  const n = parseFloat(raw);
  return isNaN(n) ? '-' : n.toFixed(3).replace(/^0\./, '.');
}

function addDivider(parent) {
  const line = parent.addStack();
  line.backgroundColor = C.div;
  line.size = new Size(0, 1);
}

// 개별 리그 위젯용 2컬럼 그리드 셀
function addCell(parent, team, leagueColor, logoCache) {
  const cell = parent.addStack();
  cell.layoutVertically();

  const top = cell.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  const rEl = top.addText(String(team.rank));
  rEl.font = Font.boldSystemFont(14);
  rEl.textColor = team.rank <= 3 ? leagueColor : C.mu;
  top.addSpacer(6);

  const logoUrl = team.logoKey && LOGO[team.logoKey];
  const img = logoUrl && logoCache ? logoCache[logoUrl] : null;
  if (img) {
    const imgEl = top.addImage(img);
    imgEl.imageSize = new Size(28, 28);
    imgEl.cornerRadius = 4;
  } else {
    const tEl = top.addText(team.team);
    tEl.font = Font.boldSystemFont(14);
    tEl.textColor = C.tx;
    tEl.lineLimit = 1;
    tEl.minimumScaleFactor = 0.72;
  }

  cell.addSpacer(3);

  const bot = cell.addStack();
  bot.layoutHorizontally();
  bot.addSpacer(20);
  const wl = team.d > 0 ? `${team.w}-${team.l}-${team.d}` : `${team.w}-${team.l}`;
  const statEl = bot.addText(`${wl}  ${fmtPct(team.pct)}`);
  statEl.font = Font.systemFont(12);
  statEl.textColor = C.mu2;
}

// 전리그 위젯용 컬럼 셀 (로고+PCT, 행 높이 최소화)
function addLeagueColumn(parent, labelText, color, sections, logoCache) {
  const col = parent.addStack();
  col.layoutVertically();

  const lbl = col.addText(labelText);
  lbl.font = Font.boldSystemFont(10);
  lbl.textColor = color;
  col.addSpacer(5);

  for (let si = 0; si < sections.length; si++) {
    const { section, teams } = sections[si];
    if (section) {
      if (si > 0) col.addSpacer(4);
      const secEl = col.addText(section);
      secEl.font = Font.boldSystemFont(8);
      secEl.textColor = color;
      col.addSpacer(3);
    }
    for (let i = 0; i < teams.length; i++) {
      const team = teams[i];
      const row = col.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();

      // 순위
      const rEl = row.addText(String(team.rank));
      rEl.font = Font.boldSystemFont(10);
      rEl.textColor = team.rank <= 3 ? color : C.mu;
      row.addSpacer(3);

      // 로고 또는 약어 fallback
      const logoUrl = team.logoKey && LOGO[team.logoKey];
      const img = logoUrl && logoCache ? logoCache[logoUrl] : null;
      if (img) {
        const imgEl = row.addImage(img);
        imgEl.imageSize = new Size(16, 16);
        imgEl.cornerRadius = 2;
      } else {
        const tEl = row.addText((team.team || '').slice(0, 4));
        tEl.font = Font.systemFont(9);
        tEl.textColor = C.tx;
        tEl.minimumScaleFactor = 0.7;
      }
      row.addSpacer(3);

      // PCT
      const pEl = row.addText(fmtPct(team.pct));
      pEl.font = Font.boldSystemFont(10);
      pEl.textColor = C.mu2;

      if (i < teams.length - 1) col.addSpacer(2);
    }
  }
  col.addSpacer();
}

// ── 개별 리그 위젯 (2컬럼 그리드) ───────────────────────
async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = C.bg;
  widget.setPadding(12, 14, 10, 14);

  const { label, color } = leagueMeta(PARAM);
  const widgetFamily = config.widgetFamily || 'medium';
  const maxTeams = widgetFamily === 'small' ? 6 : widgetFamily === 'large' ? 20 : 10;

  const hdr = widget.addStack();
  hdr.layoutHorizontally();
  hdr.centerAlignContent();
  const titleEl = hdr.addText(label + ' 순위');
  titleEl.font = Font.boldSystemFont(13);
  titleEl.textColor = color;
  hdr.addSpacer();
  const dateEl = hdr.addText(`${NOW.getMonth()+1}/${NOW.getDate()}`);
  dateEl.font = Font.systemFont(10);
  dateEl.textColor = C.mu;
  widget.addSpacer(8);

  try {
    let groups = [];
    if (PARAM === 'kbo')              groups = [{ section: null, teams: await fetchKbo() }];
    else if (PARAM.startsWith('mlb')) groups = await fetchMlb(PARAM);
    else if (PARAM.startsWith('npb')) groups = await fetchNpb(PARAM);
    else if (PARAM === 'cpbl')        groups = await fetchCpbl();
    else                              groups = [{ section: null, teams: await fetchKbo() }];

    const logoCache = await loadLogos(groups.flatMap(g => g.teams).map(t => ({ teams: [t] })).flatMap(x => x.teams).reduce((a, t) => { a.push({ teams: [t] }); return a; }, []));
    // simpler: just loadLogos with all groups
    const allTeamsForLogos = groups.flatMap(g => g.teams);
    const lc = {};
    await Promise.all([...new Set(allTeamsForLogos.filter(t => t.logoKey && LOGO[t.logoKey]).map(t => LOGO[t.logoKey]))].map(async url => {
      try { lc[url] = await new Request(url).loadImage(); } catch { lc[url] = null; }
    }));

    const showSections = groups.length > 1;
    let shown = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const { section, teams } = groups[gi];
      if (showSections && section) {
        if (gi > 0) { widget.addSpacer(6); addDivider(widget); widget.addSpacer(6); }
        const secEl = widget.addText(section);
        secEl.font = Font.boldSystemFont(11);
        secEl.textColor = color;
        widget.addSpacer(5);
      }
      const groupMax = showSections ? Math.floor(maxTeams / groups.length) : maxTeams;
      const show = Math.min(teams.length, groupMax, maxTeams - shown);
      for (let i = 0; i < show; i += 2) {
        const row = widget.addStack();
        row.layoutHorizontally();
        addCell(row, teams[i], color, lc);
        row.addSpacer(8);
        if (i + 1 < show) addCell(row, teams[i+1], color, lc);
        else row.addSpacer();
        if (i + 2 < show) widget.addSpacer(7);
        shown += i + 1 < show ? 2 : 1;
      }
    }
  } catch (err) {
    widget.addSpacer(4);
    const errEl = widget.addText('⚠️ 데이터 로드 실패\n' + err.message);
    errEl.font = Font.systemFont(11);
    errEl.textColor = C.mu;
    errEl.minimumScaleFactor = 0.7;
  }

  widget.addSpacer();
  const ft = widget.addStack();
  ft.layoutHorizontally();
  ft.centerAlignContent();
  const s1 = ft.addText('allofbaseball');
  s1.font = Font.systemFont(8); s1.textColor = C.mu;
  ft.addSpacer();
  const s2 = ft.addText(NOW.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }));
  s2.font = Font.systemFont(8); s2.textColor = C.mu;
  return widget;
}

// ── 전리그 4컬럼 Large 위젯 ─────────────────────────────
async function buildAllWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = C.bg;
  widget.setPadding(10, 12, 8, 12);

  const hdr = widget.addStack();
  hdr.layoutHorizontally();
  hdr.centerAlignContent();
  const titleEl = hdr.addText('⚾ 전리그 순위');
  titleEl.font = Font.boldSystemFont(12);
  titleEl.textColor = C.tx;
  hdr.addSpacer();
  const dateEl = hdr.addText(`${NOW.getMonth()+1}/${NOW.getDate()}`);
  dateEl.font = Font.systemFont(10);
  dateEl.textColor = C.mu;
  widget.addSpacer(8);

  try {
    const [kboTeams, npbGroups, mlbAll] = await Promise.all([
      fetchKbo(), fetchNpb('npb'), fetchMlbAll(),
    ]);

    // NPB 섹션 레이블 단축
    const npbSec = npbGroups.map(g => ({
      section: g.section === '센트럴리그' ? 'セ' : g.section === '퍼시픽리그' ? 'パ' : g.section,
      teams: g.teams,
    }));

    // 전체 팀 목록으로 로고 프리페치
    const allTeams = [
      ...kboTeams,
      ...npbGroups.flatMap(g => g.teams),
      ...mlbAll.al.flatMap(g => g.teams),
      ...mlbAll.nl.flatMap(g => g.teams),
    ];
    const lc = {};
    await Promise.all([...new Set(allTeams.filter(t => t.logoKey && LOGO[t.logoKey]).map(t => LOGO[t.logoKey]))].map(async url => {
      try { lc[url] = await new Request(url).loadImage(); } catch { lc[url] = null; }
    }));

    const content = widget.addStack();
    content.layoutHorizontally();

    addLeagueColumn(content, '🇰🇷 KBO', C.kbo, [{ section: null, teams: kboTeams }], lc);
    content.addSpacer(8);
    addLeagueColumn(content, '🇯🇵 NPB', C.npb, npbSec, lc);
    content.addSpacer(8);
    addLeagueColumn(content, '🇺🇸 NL',  C.mlb, mlbAll.nl, lc);
    content.addSpacer(8);
    addLeagueColumn(content, 'AL',       C.mlb, mlbAll.al, lc);

  } catch (err) {
    widget.addSpacer(4);
    const errEl = widget.addText('⚠️ 로드 실패\n' + err.message);
    errEl.font = Font.systemFont(11);
    errEl.textColor = C.mu;
    errEl.minimumScaleFactor = 0.7;
  }

  widget.addSpacer();
  const ft = widget.addStack();
  ft.layoutHorizontally();
  ft.centerAlignContent();
  const s1 = ft.addText('allofbaseball');
  s1.font = Font.systemFont(8); s1.textColor = C.mu;
  ft.addSpacer();
  const s2 = ft.addText(NOW.toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' }));
  s2.font = Font.systemFont(8); s2.textColor = C.mu;
  return widget;
}

// ── 실행 ─────────────────────────────────────────────────
const widget = PARAM === 'all' ? await buildAllWidget() : await buildWidget();
if (config.runInWidget) {
  Script.setWidget(widget);
} else {
  if      (PARAM === 'all')                  await widget.presentLarge();
  else if (config.widgetFamily === 'small')  await widget.presentSmall();
  else if (config.widgetFamily === 'large')  await widget.presentLarge();
  else                                       await widget.presentMedium();
}
Script.complete();
