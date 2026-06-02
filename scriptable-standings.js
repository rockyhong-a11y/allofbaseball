// ⚾ Baseball Standings Widget
// Scriptable (iOS) — rockyhong-a11y.github.io/allofbaseball
//
// 위젯 파라미터 (Widget Parameter):
//   kbo          🇰🇷 KBO 순위
//   mlb          🇺🇸 MLB 전리그 (AL/NL 상위팀)
//   mlb-al-e     AL East
//   mlb-al-c     AL Central
//   mlb-al-w     AL West
//   mlb-nl-e     NL East
//   mlb-nl-c     NL Central
//   mlb-nl-w     NL West
//   npb          🇯🇵 NPB 센/퍼 합산
//   npb-cl       NPB 센트럴리그
//   npb-pl       NPB 퍼시픽리그
//   cpbl         🇹🇼 CPBL 순위
//
// 기본값: kbo

"use strict";

const PARAM = ((args.widgetParameter || 'kbo').toLowerCase().trim());
const YEAR  = new Date().getFullYear();
const NOW   = new Date();

const CF     = 'https://kbo-proxy.rockyhong.workers.dev';
const CTABS  = 'https://api.codetabs.com/v1/proxy/?quest=';

// ── 색상 (라이트/다크 자동) ──────────────────────────────
const C = {
  bg:    Color.dynamic(new Color('#f0f4f8'), new Color('#070c18')),
  card:  Color.dynamic(new Color('#ffffff'), new Color('#0e1525')),
  tx:    Color.dynamic(new Color('#1a2a40'), new Color('#dde4f0')),
  mu:    Color.dynamic(new Color('#5a6e8c'), new Color('#5a6e8c')),
  mu2:   Color.dynamic(new Color('#3d5270'), new Color('#8496b0')),
  ac:    Color.dynamic(new Color('#1a7fd4'), new Color('#3b9eff')),
  kbo:   Color.dynamic(new Color('#2d6fd4'), new Color('#4f8ef7')),
  mlb:   Color.dynamic(new Color('#cc1a10'), new Color('#e8352a')),
  npb:   Color.dynamic(new Color('#c01040'), new Color('#e83060')),
  cpbl:  Color.dynamic(new Color('#c02a00'), new Color('#e8461e')),
};

// ── 리그 메타 ────────────────────────────────────────────
function leagueMeta(p) {
  if (p === 'kbo')              return { label: '🇰🇷 KBO', color: C.kbo };
  if (p.startsWith('mlb'))      return { label: '🇺🇸 MLB', color: C.mlb };
  if (p.startsWith('npb'))      return { label: '🇯🇵 NPB', color: C.npb };
  if (p === 'cpbl')             return { label: '🇹🇼 CPBL', color: C.cpbl };
  return { label: '⚾ Baseball', color: C.ac };
}

// ── 데이터 페치 ──────────────────────────────────────────

async function fetchKbo() {
  const KBO_SHORT = {
    'KIA':'KIA','LG':'LG','키움':'키움','SSG':'SSG','두산':'두산',
    '삼성':'삼성','롯데':'롯데','NC':'NC','KT':'KT','한화':'한화',
  };
  const url = `${CF}/ws/Main.asmx/GetTeamRank?leId=1&srId=0&seasonId=${YEAR}`;
  const req = new Request(url);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  if (!data?.rows?.length) throw new Error('KBO 데이터 없음');
  return data.rows.map((rec, i) => {
    const row  = rec.row;
    const raw  = row[1]?.Text || '';
    const m    = raw.match(/>([^<]+)</);
    const key  = m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
    return {
      rank: i + 1,
      team: KBO_SHORT[key] || key,
      w:    parseInt(row[3]?.Text) || 0,
      l:    parseInt(row[4]?.Text) || 0,
      d:    parseInt(row[5]?.Text) || 0,
      pct:  row[6]?.Text || '-',
      gb:   row[7]?.Text || '-',
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
  const DIV_KEY = {
    'American League East':    'al-e', 'American League Central': 'al-c', 'American League West': 'al-w',
    'National League East':    'nl-e', 'National League Central': 'nl-c', 'National League West': 'nl-w',
  };
  const DIV_LABEL = {
    'al-e':'AL East', 'al-c':'AL Central', 'al-w':'AL West',
    'nl-e':'NL East', 'nl-c':'NL Central', 'nl-w':'NL West',
  };

  const url = `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${YEAR}&standingsTypes=regularSeason&hydrate=team,league,division`;
  const req = new Request(url);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();

  const groups = [];
  for (const rec of (data.records || [])) {
    const key = DIV_KEY[rec.division?.name || ''];
    if (!key) continue;
    // divFilter: 'mlb' → 전체, 'mlb-al-e' → al-e만
    const filterKey = divFilter === 'mlb' ? null : divFilter.replace('mlb-', '');
    if (filterKey && filterKey !== key) continue;

    const teams = (rec.teamRecords || []).map((tr, i) => ({
      rank: i + 1,
      team: ML_KO[tr.team?.name] || tr.team?.name || '',
      w:    tr.wins || 0,
      l:    tr.losses || 0,
      d:    0,
      pct:  tr.winningPercentage || '-',
      gb:   tr.gamesBack || '-',
    }));
    groups.push({ section: DIV_LABEL[key], teams });
  }
  if (!groups.length) throw new Error('MLB 데이터 없음');
  return groups;
}

async function fetchNpb(leagueFilter) {
  const NPB_KO = {
    'ヤクルト':'야쿠르트','広島':'히로시마','読売':'요미우리','中日':'주니치','DeNA':'DeNA','阪神':'한신',
    'ソフトバンク':'소프트뱅크','日本ハム':'닛폰햄','楽天':'라쿠텐','ロッテ':'롯데','オリックス':'ORIX','西武':'세이부',
  };
  const parseHtml = (html) => {
    const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    const teams = [];
    for (const [, row] of rows) {
      const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim());
      if (cells.length < 6) continue;
      const koKey = Object.keys(NPB_KO).find(k => cells[0].includes(k));
      if (!koKey) continue;
      teams.push({
        rank: teams.length + 1,
        team: NPB_KO[koKey],
        w:    parseInt(cells[2]) || 0,
        l:    parseInt(cells[3]) || 0,
        d:    parseInt(cells[4]) || 0,
        pct:  cells[5] || '-',
        gb:   teams.length === 0 ? '-' : (cells[6] || '-'),
      });
    }
    return teams;
  };

  const fetchLeague = async (slug) => {
    const req = new Request(`${CTABS}${encodeURIComponent(`https://npb.jp/${slug}/`)}`);
    req.timeoutInterval = 15;
    return parseHtml(await req.loadString());
  };

  const groups = [];
  const showCl = leagueFilter !== 'npb-pl';
  const showPl = leagueFilter !== 'npb-cl';

  if (showCl) {
    const cl = await fetchLeague('cl');
    if (cl.length) groups.push({ section: '센트럴리그', teams: cl });
  }
  if (showPl) {
    const pl = await fetchLeague('pl');
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
      .map(([, rh]) =>
        [...rh.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim())
      )
      .filter(r => r.length >= 4);
    if (!parsed.length) continue;
    const hdr = parsed[0];
    if (!hdr.some(c => /^W$/i.test(c) || /W-T-L/i.test(c))) continue;

    const iRank = hdr.findIndex(c => /rank|^#$/i.test(c));
    const iTeam = hdr.findIndex(c => /team/i.test(c));
    const iWTL  = hdr.findIndex(c => /W-T-L/i.test(c));
    const iPCT  = hdr.findIndex(c => /pct/i.test(c));
    const iGB   = hdr.findIndex(c => c === 'GB');

    const teams = [];
    for (let i = 1; i < parsed.length; i++) {
      const r = parsed[i];
      if (r.length < 4) continue;
      let rank = i, team = '';
      if (iRank >= 0 && iTeam >= 0 && iRank !== iTeam) {
        rank = parseInt(r[iRank]) || i;
        team = r[iTeam];
      } else {
        const mt = r[0].match(/^(\d+)\s+(.+)/);
        if (mt) { rank = parseInt(mt[1]); team = mt[2].trim(); }
        else    { rank = i; team = r[0]; }
      }
      if (!team) continue;
      const wtl  = iWTL >= 0 ? r[iWTL] : r[3] || '';
      const pct  = iPCT >= 0 ? r[iPCT] : (r[4] || '-');
      const gb   = iGB  >= 0 ? r[iGB]  : (r[5] || '-');
      const wtlM = wtl.match(/(\d+)-(\d+)-(\d+)/);
      teams.push({
        rank, team,
        w: wtlM ? parseInt(wtlM[1]) : 0,
        l: wtlM ? parseInt(wtlM[3]) : 0,
        d: wtlM ? parseInt(wtlM[2]) : 0,
        pct, gb,
      });
    }
    if (teams.length) return [{ section: null, teams }];
  }
  throw new Error('CPBL 데이터 없음');
}

// ── 위젯 렌더링 ──────────────────────────────────────────

function addRow(parent, team, leagueColor) {
  const row = parent.addStack();
  row.layoutHorizontally();
  row.centerAlignContent();

  // 순위
  const rEl = row.addText(String(team.rank).padStart(2, ' '));
  rEl.font   = Font.boldSystemFont(11);
  rEl.textColor = team.rank <= 3 ? leagueColor : C.mu;
  row.addSpacer(6);

  // 팀명
  const tEl = row.addText(team.team);
  tEl.font          = Font.mediumSystemFont(11);
  tEl.textColor     = C.tx;
  tEl.lineLimit     = 1;
  tEl.minimumScaleFactor = 0.7;
  row.addSpacer();

  // W-L(-D)
  const wl = team.d > 0 ? `${team.w}-${team.l}-${team.d}` : `${team.w}-${team.l}`;
  const wlEl = row.addText(wl);
  wlEl.font      = Font.systemFont(10);
  wlEl.textColor = C.mu2;
  row.addSpacer(6);

  // PCT
  const pctStr = typeof team.pct === 'string' ? team.pct.replace(/^0\./, '.') : String(team.pct);
  const pEl = row.addText(pctStr || '-');
  pEl.font      = Font.boldSystemFont(10);
  pEl.textColor = C.tx;
  row.addSpacer(6);

  // GB
  const gbStr = (team.gb === '0.0' || team.gb === '0') ? '-' : String(team.gb);
  const gEl = row.addText(gbStr);
  gEl.font      = Font.systemFont(10);
  gEl.textColor = C.mu;
}

function addDivider(parent) {
  const line = parent.addStack();
  line.layoutHorizontally();
  line.backgroundColor = Color.dynamic(new Color('#d0d9e8'), new Color('#1c2b45'));
  line.size = new Size(0, 1);
}

async function buildWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = C.bg;
  widget.setPadding(12, 14, 10, 14);

  const { label, color } = leagueMeta(PARAM);
  const widgetFamily = config.widgetFamily || 'medium';
  const maxPerGroup  = widgetFamily === 'small' ? 5 : widgetFamily === 'large' ? 13 : 8;

  // 헤더
  const hdr = widget.addStack();
  hdr.layoutHorizontally();
  hdr.centerAlignContent();
  const titleEl = hdr.addText(label + ' 순위');
  titleEl.font      = Font.boldSystemFont(13);
  titleEl.textColor = color;
  hdr.addSpacer();
  const dateEl = hdr.addText(`${NOW.getMonth()+1}/${NOW.getDate()}`);
  dateEl.font      = Font.systemFont(10);
  dateEl.textColor = C.mu;

  widget.addSpacer(5);

  // 컬럼 헤더
  const ch = widget.addStack();
  ch.layoutHorizontally();
  ch.centerAlignContent();
  [['#', 11], ['팀', null], ['W-L', null], ['PCT', null], ['GB', null]].forEach(([t, w], i) => {
    if (i > 0) ch.addSpacer(i === 1 ? 6 : (i === 2 ? null : 6));
    const el = ch.addText(t);
    el.font      = Font.boldSystemFont(9);
    el.textColor = C.mu;
    if (i === 1) el.minimumScaleFactor = 0.7;
  });

  widget.addSpacer(4);

  // 데이터 로드 및 렌더
  try {
    let groups = [];

    if (PARAM === 'kbo') {
      groups = [{ section: null, teams: await fetchKbo() }];
    } else if (PARAM.startsWith('mlb')) {
      groups = await fetchMlb(PARAM);
    } else if (PARAM.startsWith('npb')) {
      groups = await fetchNpb(PARAM);
    } else if (PARAM === 'cpbl') {
      groups = await fetchCpbl();
    } else {
      groups = [{ section: null, teams: await fetchKbo() }];
    }

    const showSections = groups.length > 1;
    // 전체 rows 제한 계산
    let totalRows = 0;
    const rowsPerGroup = showSections
      ? Math.floor(maxPerGroup / groups.length)
      : maxPerGroup;

    for (let gi = 0; gi < groups.length; gi++) {
      const { section, teams } = groups[gi];
      if (showSections && section) {
        if (gi > 0) { widget.addSpacer(3); addDivider(widget); widget.addSpacer(3); }
        const secEl = widget.addText(section);
        secEl.font      = Font.boldSystemFont(9);
        secEl.textColor = color;
        widget.addSpacer(3);
      }
      const limit = showSections ? rowsPerGroup : maxPerGroup;
      for (let i = 0; i < Math.min(teams.length, limit); i++) {
        addRow(widget, teams[i], color);
        if (i < Math.min(teams.length, limit) - 1) widget.addSpacer(3);
        totalRows++;
      }
    }

  } catch (err) {
    widget.addSpacer(4);
    const errEl = widget.addText('⚠️ 데이터 로드 실패\n' + err.message);
    errEl.font             = Font.systemFont(11);
    errEl.textColor        = C.mu;
    errEl.minimumScaleFactor = 0.7;
  }

  widget.addSpacer();

  // 푸터
  const ft = widget.addStack();
  ft.layoutHorizontally();
  ft.centerAlignContent();
  const siteEl = ft.addText('allofbaseball');
  siteEl.font      = Font.systemFont(8);
  siteEl.textColor = C.mu;
  ft.addSpacer();
  const timeEl = ft.addText(NOW.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  timeEl.font      = Font.systemFont(8);
  timeEl.textColor = C.mu;

  return widget;
}

// ── 실행 ─────────────────────────────────────────────────
const widget = await buildWidget();
if (config.runInWidget) {
  Script.setWidget(widget);
} else {
  // 앱 내 프리뷰 (크기 선택)
  if      (config.widgetFamily === 'small')  await widget.presentSmall();
  else if (config.widgetFamily === 'large')  await widget.presentLarge();
  else                                       await widget.presentMedium();
}
Script.complete();
