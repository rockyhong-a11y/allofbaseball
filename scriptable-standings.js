// ⚾ Baseball Standings Widget
// Scriptable (iOS) — rockyhong-a11y.github.io/allofbaseball
// Parameters: kbo | mlb-al-e/c/w | mlb-nl-e/c/w | npb-cl | npb-pl | cpbl | all

"use strict";

const PARAM = ((args.widgetParameter || 'kbo').toLowerCase().trim());
const YEAR  = new Date().getFullYear();
const NOW   = new Date();
const CF    = 'https://kbo-proxy.rockyhong.workers.dev';
const CTABS = 'https://api.codetabs.com/v1/proxy/?quest=';

const C = {
  bg:   Color.dynamic(new Color('#f0f4f8'), new Color('#070c18')),
  card: Color.dynamic(new Color('#dce5f2'), new Color('#0d1928')),
  tx:   Color.dynamic(new Color('#1a2a40'), new Color('#dde4f0')),
  mu:   Color.dynamic(new Color('#5a6e8c'), new Color('#5a6e8c')),
  mu2:  Color.dynamic(new Color('#3d5270'), new Color('#8496b0')),
  div:  Color.dynamic(new Color('#c6d3e8'), new Color('#1a2840')),
  kbo:  Color.dynamic(new Color('#2d6fd4'), new Color('#4f8ef7')),
  mlb:  Color.dynamic(new Color('#cc1a10'), new Color('#e8352a')),
  npb:  Color.dynamic(new Color('#c01040'), new Color('#e83060')),
  cpbl: Color.dynamic(new Color('#c02a00'), new Color('#e8461e')),
  win:  Color.dynamic(new Color('#b83000'), new Color('#ff6030')),
  lose: Color.dynamic(new Color('#1060b0'), new Color('#4090e8')),
};

function leagueMeta(p) {
  if (p === 'kbo')         return { label: '🇰🇷 KBO', color: C.kbo };
  if (p.startsWith('mlb')) return { label: '🇺🇸 MLB', color: C.mlb };
  if (p.startsWith('npb')) return { label: '🇯🇵 NPB', color: C.npb };
  if (p === 'cpbl')        return { label: '🇹🇼 CPBL', color: C.cpbl };
  return { label: '⚾', color: C.mu };
}

function parseStreakCode(code) {
  if (!code) return null;
  const m = String(code).match(/([WL])(\d+)/i);
  return m ? { type: m[1].toUpperCase(), count: parseInt(m[2]) } : null;
}

function parseKoreanStreak(text) {
  if (!text) return null;
  const m = String(text).match(/(\d+)(연승|연패)/);
  return m ? { type: m[2] === '연승' ? 'W' : 'L', count: parseInt(m[1]) } : null;
}

function extractStreaks(teams, min = 5) {
  const wins = [], losses = [];
  for (const t of teams) {
    if (!t.streak || t.streak.count < min) continue;
    const e = { team: t.team, count: t.streak.count };
    if (t.streak.type === 'W') wins.push(e);
    else losses.push(e);
  }
  wins.sort((a, b) => b.count - a.count);
  losses.sort((a, b) => b.count - a.count);
  return { wins, losses };
}

// ── Data fetch ───────────────────────────────────────────

async function fetchKbo() {
  const req = new Request(`${CF}/ws/Main.asmx/GetTeamRank?leId=1&srId=0&seasonId=${YEAR}&_t=${Date.now()}`);
  req.timeoutInterval = 15;
  const data = await req.loadJSON();
  if (!data?.rows?.length) throw new Error('KBO 데이터 없음');
  return data.rows.map((rec, i) => {
    const row = rec.row;
    const raw = row[1]?.Text || '';
    const m = raw.match(/>([^<]+)</);
    const short = m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
    return {
      rank: i + 1, team: short,
      w: parseInt(row[3]?.Text) || 0, l: parseInt(row[4]?.Text) || 0,
      d: parseInt(row[5]?.Text) || 0, pct: row[6]?.Text || '-', gb: row[7]?.Text || '-',
      streak: parseKoreanStreak(row[8]?.Text || ''),
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
    'Tampa Bay Rays':'TB','Toronto Blue Jays':'TOR','Chicago White Sox':'CWS',
    'Cleveland Guardians':'CLE','Detroit Tigers':'DET','Kansas City Royals':'KC',
    'Minnesota Twins':'MIN','Houston Astros':'HOU','Los Angeles Angels':'LAA',
    'Athletics':'OAK','Seattle Mariners':'SEA','Texas Rangers':'TEX',
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
      abbr: ML_ABB[tr.team?.name] || '',
      w: tr.wins || 0, l: tr.losses || 0, d: 0,
      pct: tr.winningPercentage || '-', gb: tr.gamesBack || '-',
      streak: parseStreakCode(tr.streak?.streakCode || ''),
    }));
    groups.push({ section: DIV_LABEL[key], teams });
  }
  if (!groups.length) throw new Error('MLB 데이터 없음');
  return groups;
}

async function fetchNpb(leagueFilter) {
  const NPB_KO = {
    'ヤクルト':'야쿠르트','広島':'히로시마','読売':'요미우리','中日':'주니치',
    'DeNA':'DeNA','阪神':'한신','ソフトバンク':'소프트뱅크','日本ハム':'닛폰햄',
    '楽天':'라쿠텐','ロッテ':'롯데','オリックス':'ORIX','西武':'세이부',
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
        rank: teams.length + 1, team: NPB_KO[koKey],
        w: parseInt(cells[2]) || 0, l: parseInt(cells[3]) || 0, d: parseInt(cells[4]) || 0,
        pct: cells[5] || '-', gb: teams.length === 0 ? '-' : (cells[6] || '-'),
        streak: null,
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

// NPB 연승/연패: 월간 스케줄 HTML 파싱
async function computeNpbStreaks() {
  const NPB_JP = ['ヤクルト','広島','読売','中日','DeNA','阪神',
                  'ソフトバンク','日本ハム','楽天','ロッテ','オリックス','西武'];
  const NPB_KO = {
    'ヤクルト':'야쿠르트','広島':'히로시마','読売':'요미우리','中日':'주니치',
    'DeNA':'DeNA','阪神':'한신','ソフトバンク':'소프트뱅크','日本ハム':'닛폰햄',
    '楽天':'라쿠텐','ロッテ':'롯데','オリックス':'ORIX','西武':'세이부',
  };
  const month    = String(NOW.getMonth() + 1).padStart(2, '0');
  const prevM    = NOW.getMonth() === 0 ? 12 : NOW.getMonth();
  const prevY    = NOW.getMonth() === 0 ? YEAR - 1 : YEAR;
  const prevMStr = String(prevM).padStart(2, '0');

  const fetchHtml = async url => {
    try {
      const req = new Request(`${CTABS}${encodeURIComponent(url)}`);
      req.timeoutInterval = 10;
      return await req.loadString();
    } catch { return ''; }
  };

  const [h1, h2] = await Promise.all([
    fetchHtml(`https://npb.jp/games/${prevY}/schedule_${prevMStr}_detail.html`),
    fetchHtml(`https://npb.jp/games/${YEAR}/schedule_${month}_detail.html`),
  ]);

  const combined = h1 + h2;
  const teamRes = {};
  for (const t of NPB_JP) teamRes[t] = [];

  for (const [, row] of [...combined.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]) {
    const text = row.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text.includes('○') && !text.includes('●')) continue;
    const found = NPB_JP.filter(t => text.includes(t));
    if (found.length < 2) continue;
    for (const team of found) {
      const idx = text.indexOf(team);
      const ctx = text.slice(Math.max(0, idx - 8), idx + team.length + 8);
      if (ctx.includes('○')) teamRes[team].push('W');
      else if (ctx.includes('●')) teamRes[team].push('L');
    }
  }

  const result = {};
  for (const [jp, res] of Object.entries(teamRes)) {
    if (!res.length) continue;
    const last = res[res.length - 1];
    let count = 0;
    for (let i = res.length - 1; i >= 0 && res[i] === last; i--) count++;
    if (count > 0) result[NPB_KO[jp]] = { count, type: last };
  }
  return result;
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
    const iRank  = hdr.findIndex(c => /rank|^#$/i.test(c));
    const iTeam  = hdr.findIndex(c => /team/i.test(c));
    const iWTL   = hdr.findIndex(c => /W-T-L/i.test(c));
    const iPCT   = hdr.findIndex(c => /pct/i.test(c));
    const iGB    = hdr.findIndex(c => c === 'GB');
    const iSTRK  = hdr.findIndex(c => /strk|streak/i.test(c));
    const teams = [];
    for (let i = 1; i < parsed.length; i++) {
      const r = parsed[i]; if (r.length < 4) continue;
      let rank = i, team = '';
      if (iRank >= 0 && iTeam >= 0 && iRank !== iTeam) {
        rank = parseInt(r[iRank]) || i; team = r[iTeam];
      } else {
        const mt = r[0].match(/^(\d+)\s+(.+)/);
        if (mt) { rank = parseInt(mt[1]); team = mt[2].trim(); } else { rank = i; team = r[0]; }
      }
      if (!team) continue;
      const wtl  = iWTL  >= 0 ? r[iWTL]  : r[3] || '';
      const pct  = iPCT  >= 0 ? r[iPCT]  : r[4] || '-';
      const gb   = iGB   >= 0 ? r[iGB]   : r[5] || '-';
      const strkRaw = iSTRK >= 0 ? r[iSTRK] : '';
      const wtlM = wtl.match(/(\d+)-(\d+)-(\d+)/);
      const strkM = strkRaw.match(/([WL])(\d+)/i);
      teams.push({
        rank, team,
        w: wtlM ? parseInt(wtlM[1]) : 0, l: wtlM ? parseInt(wtlM[3]) : 0,
        d: wtlM ? parseInt(wtlM[2]) : 0, pct, gb,
        streak: strkM ? { type: strkM[1].toUpperCase(), count: parseInt(strkM[2]) } : null,
      });
    }
    if (teams.length) return [{ section: null, teams }];
  }
  throw new Error('CPBL 데이터 없음');
}

async function fetchMlbAll() {
  const ML_ABB = {
    'Baltimore Orioles':'BAL','Boston Red Sox':'BOS','New York Yankees':'NYY',
    'Tampa Bay Rays':'TB','Toronto Blue Jays':'TOR','Chicago White Sox':'CWS',
    'Cleveland Guardians':'CLE','Detroit Tigers':'DET','Kansas City Royals':'KC',
    'Minnesota Twins':'MIN','Houston Astros':'HOU','Los Angeles Angels':'LAA',
    'Athletics':'OAK','Seattle Mariners':'SEA','Texas Rangers':'TEX',
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
      team: ML_ABB[tr.team?.name] || tr.team?.name?.slice(0, 3) || '',
      w: tr.wins || 0, l: tr.losses || 0, d: 0,
      pct: tr.winningPercentage || '-',
      streak: parseStreakCode(tr.streak?.streakCode || ''),
    }));
  }
  const toGroups = obj => ['East','Cntrl','West']
    .map(s => ({ section: s, teams: obj[s] || [] }))
    .filter(g => g.teams.length);
  return { al: toGroups(al), nl: toGroups(nl) };
}

// ── Rendering ────────────────────────────────────────────

function addDivider(parent) {
  const line = parent.addStack();
  line.backgroundColor = C.div;
  line.size = new Size(0, 1);
}

// 우측 연승/연패 컬럼 (all 위젯 전용)
function addStreakColumn(parent, entries) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = C.card;
  card.cornerRadius = 7;
  card.setPadding(6, 5, 6, 5);

  const hdr = card.addText('연속기록');
  hdr.font = Font.boldSystemFont(9);
  hdr.textColor = C.mu;
  card.addSpacer(5);

  if (!entries.length) {
    const none = card.addText('5연속\n팀 없음');
    none.font = Font.systemFont(9);
    none.textColor = C.mu;
    card.addSpacer();
    return;
  }

  let first = true;
  for (const e of entries) {
    if (!first) {
      card.addSpacer(3);
      const dl = card.addStack();
      dl.backgroundColor = C.div;
      dl.size = new Size(0, 1);
      card.addSpacer(3);
    }
    first = false;

    // 팀명 행
    const r1 = card.addStack();
    r1.layoutHorizontally();
    r1.centerAlignContent();
    const ic = r1.addText(e.type === 'W' ? '🔥' : '💧');
    ic.font = Font.systemFont(10);
    r1.addSpacer(2);
    const tm = r1.addText(e.team.slice(0, 4));
    tm.font = Font.boldSystemFont(11);
    tm.textColor = C.tx;
    tm.minimumScaleFactor = 0.75;
    r1.addSpacer();

    // 연승/연패 + 리그 행
    const r2 = card.addStack();
    r2.layoutHorizontally();
    r2.centerAlignContent();
    r2.addSpacer(14);
    const cnt = r2.addText(`${e.count}${e.type === 'W' ? '연승' : '연패'}`);
    cnt.font = Font.boldSystemFont(10);
    cnt.textColor = e.type === 'W' ? C.win : C.lose;
    r2.addSpacer(3);
    const lg = r2.addText(e.league);
    lg.font = Font.systemFont(8);
    lg.textColor = C.mu;
  }

  card.addSpacer();
}

function addCell(parent, team, leagueColor) {
  const cell = parent.addStack();
  cell.layoutVertically();
  const top = cell.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();
  const rEl = top.addText(String(team.rank));
  rEl.font = Font.boldSystemFont(15);
  rEl.textColor = team.rank <= 3 ? leagueColor : C.mu;
  top.addSpacer(6);
  const tEl = top.addText(team.team);
  tEl.font = Font.boldSystemFont(16);
  tEl.textColor = C.tx;
  tEl.lineLimit = 1;
  tEl.minimumScaleFactor = 0.72;
  cell.addSpacer(3);
  const bot = cell.addStack();
  bot.layoutHorizontally();
  bot.addSpacer(20);
  const wl = team.d > 0 ? `${team.w}-${team.l}-${team.d}` : `${team.w}-${team.l}`;
  const statEl = bot.addText(wl);
  statEl.font = Font.systemFont(12);
  statEl.textColor = C.mu2;
}

function addLeagueColumn(parent, labelText, color, sections) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = C.card;
  card.cornerRadius = 7;
  card.setPadding(6, 6, 6, 6);

  const lbl = card.addText(labelText);
  lbl.font = Font.boldSystemFont(10);
  lbl.textColor = color;
  card.addSpacer(4);

  let firstRow = true;
  for (let si = 0; si < sections.length; si++) {
    const { section, teams } = sections[si];
    if (section) {
      if (si > 0) {
        card.addSpacer(3);
        const dl = card.addStack();
        dl.backgroundColor = C.div;
        dl.size = new Size(0, 1);
        card.addSpacer(3);
      }
      const secEl = card.addText(section);
      secEl.font = Font.boldSystemFont(8);
      secEl.textColor = color;
      card.addSpacer(3);
      firstRow = true;
    }
    for (const team of teams) {
      if (!firstRow) {
        card.addSpacer(2);
        const rl = card.addStack();
        rl.backgroundColor = C.div;
        rl.size = new Size(0, 1);
        card.addSpacer(2);
      }
      firstRow = false;
      const row = card.addStack();
      row.layoutHorizontally();
      row.centerAlignContent();
      const rEl = row.addText(String(team.rank));
      rEl.font = Font.boldSystemFont(12);
      rEl.textColor = team.rank <= 3 ? color : C.mu;
      row.addSpacer(3);
      const tEl = row.addText((team.team || '').slice(0, 5));
      tEl.font = Font.boldSystemFont(14);
      tEl.textColor = C.tx;
      tEl.minimumScaleFactor = 0.65;
      row.addSpacer();
    }
  }

  card.addSpacer();
}

// ── Individual league widget ─────────────────────────────
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
        addCell(row, teams[i], color);
        row.addSpacer(8);
        if (i + 1 < show) addCell(row, teams[i+1], color);
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

// ── All-leagues 4-column Large widget ───────────────────
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
    const [kboTeams, npbGroups, mlbAll, npbStreakMap] = await Promise.all([
      fetchKbo(), fetchNpb('npb'), fetchMlbAll(), computeNpbStreaks(),
    ]);

    for (const g of npbGroups)
      for (const t of g.teams)
        t.streak = npbStreakMap[t.team] || null;

    const npbSec = npbGroups.map(g => ({
      section: g.section === '센트럴리그' ? 'セ' : g.section === '퍼시픽리그' ? 'パ' : g.section,
      teams: g.teams,
    }));

    // 연속기록 5+ 수집 (연승 먼저, 연패 다음 / 각 league 내 count 내림차순)
    const collectEntries = (teams, league) => {
      const ws = [], ls = [];
      for (const t of teams) {
        if (!t.streak || t.streak.count < 5) continue;
        const e = { team: t.team, count: t.streak.count, type: t.streak.type, league };
        if (t.streak.type === 'W') ws.push(e); else ls.push(e);
      }
      ws.sort((a, b) => b.count - a.count);
      ls.sort((a, b) => b.count - a.count);
      return [...ws, ...ls];
    };
    const streakEntries = [
      ...collectEntries(kboTeams, 'KBO'),
      ...collectEntries(npbGroups.flatMap(g => g.teams), 'NPB'),
      ...collectEntries(mlbAll.nl.flatMap(g => g.teams), 'NL'),
      ...collectEntries(mlbAll.al.flatMap(g => g.teams), 'AL'),
    ];

    const content = widget.addStack();
    content.layoutHorizontally();

    addLeagueColumn(content, '🇰🇷 KBO', C.kbo, [{ section: null, teams: kboTeams }]);
    content.addSpacer(4);
    addLeagueColumn(content, '🇯🇵 NPB', C.npb, npbSec);
    content.addSpacer(4);
    addLeagueColumn(content, '🇺🇸 NL',  C.mlb, mlbAll.nl);
    content.addSpacer(4);
    addLeagueColumn(content, 'AL',       C.mlb, mlbAll.al);
    content.addSpacer(4);
    addStreakColumn(content, streakEntries);

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

// ── Run ──────────────────────────────────────────────────
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
