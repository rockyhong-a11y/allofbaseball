// ⚾ Baseball Streaks Widget — 연승·연패 전용
// Scriptable (iOS) — rockyhong-a11y.github.io/allofbaseball
//
// 순위는 빼고 연승·연패만 KBO → MLB → NPB → CPBL 순으로 보여준다.
// Parameter: 최소 연속 수 (숫자, 기본 3). 예) "2" 면 2연승부터 표시.
//
// 참고: 수집 함수(fetchKbo/fetchMlbAll/fetchNpb/computeNpbStreaks/fetchCpbl)와
//       로고 캐시는 scriptable-standings.js 와 동일한 구현을 사용한다.
//       Scriptable 스크립트는 단일 파일로 동작해야 해 의도적으로 중복해 둔 것이다.

"use strict";

const MIN_STREAK = Math.max(1, parseInt(args.widgetParameter) || 3);
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


// ── Team logos ───────────────────────────────────────────
const _LB = 'https://rockyhong-a11y.github.io/allofbaseball/logos/';
const LOGO_URLS = {
  'kbo:LG':_LB+'kbo-LG.png','kbo:KT':_LB+'kbo-KT.png',
  'kbo:삼성':_LB+'kbo-Samsung.png','kbo:SSG':_LB+'kbo-SSG.png',
  'kbo:두산':_LB+'kbo-Doosan.png','kbo:한화':_LB+'kbo-Hanwha.png',
  'kbo:NC':_LB+'kbo-NC.png','kbo:롯데':_LB+'kbo-Lotte.png',
  'kbo:KIA':_LB+'kbo-KIA.png','kbo:키움':_LB+'kbo-Kiwoom.png',
  'npb:야쿠르트':_LB+'npb-Swallows.png','npb:한신':_LB+'npb-Tigers.png',
  'npb:히로시마':_LB+'npb-Carp.png','npb:요미우리':_LB+'npb-Giants.png',
  'npb:DeNA':_LB+'npb-DeNA.png','npb:주니치':_LB+'npb-Dragons.png',
  'npb:소프트뱅크':_LB+'npb-Hawks.png','npb:ORIX':_LB+'npb-Buffaloes.png',
  'npb:닛폰햄':_LB+'npb-Fighters.png','npb:세이부':_LB+'npb-Lions.png',
  'npb:라쿠텐':_LB+'npb-Eagles.png','npb:롯데':_LB+'npb-Marines.png',
  'cpbl:Brothers':_LB+'cpbl-Brothers.png','cpbl:Dragons':_LB+'cpbl-Dragons.png',
  'cpbl:Guardians':_LB+'cpbl-Guardians.png','cpbl:Monkeys':_LB+'cpbl-Monkeys.png',
  'cpbl:TSG Hawks':_LB+'cpbl-Hawks.png','cpbl:U-Lions':_LB+'cpbl-UniLions.png',
  'mlb:BAL':'https://www.mlbstatic.com/team-logos/110.svg',
  'mlb:BOS':'https://www.mlbstatic.com/team-logos/111.svg',
  'mlb:NYY':'https://www.mlbstatic.com/team-logos/147.svg',
  'mlb:TB': 'https://www.mlbstatic.com/team-logos/139.svg',
  'mlb:TOR':'https://www.mlbstatic.com/team-logos/141.svg',
  'mlb:CWS':'https://www.mlbstatic.com/team-logos/145.svg',
  'mlb:CLE':'https://www.mlbstatic.com/team-logos/114.svg',
  'mlb:DET':'https://www.mlbstatic.com/team-logos/116.svg',
  'mlb:KC': 'https://www.mlbstatic.com/team-logos/118.svg',
  'mlb:MIN':'https://www.mlbstatic.com/team-logos/142.svg',
  'mlb:HOU':'https://www.mlbstatic.com/team-logos/117.svg',
  'mlb:LAA':'https://www.mlbstatic.com/team-logos/108.svg',
  'mlb:OAK':'https://www.mlbstatic.com/team-logos/133.svg',
  'mlb:SEA':'https://www.mlbstatic.com/team-logos/136.svg',
  'mlb:TEX':'https://www.mlbstatic.com/team-logos/140.svg',
  'mlb:ATL':'https://www.mlbstatic.com/team-logos/144.svg',
  'mlb:MIA':'https://www.mlbstatic.com/team-logos/146.svg',
  'mlb:NYM':'https://www.mlbstatic.com/team-logos/121.svg',
  'mlb:PHI':'https://www.mlbstatic.com/team-logos/143.svg',
  'mlb:WSH':'https://www.mlbstatic.com/team-logos/120.svg',
  'mlb:CHC':'https://www.mlbstatic.com/team-logos/112.svg',
  'mlb:CIN':'https://www.mlbstatic.com/team-logos/113.svg',
  'mlb:MIL':'https://www.mlbstatic.com/team-logos/158.svg',
  'mlb:PIT':'https://www.mlbstatic.com/team-logos/134.svg',
  'mlb:STL':'https://www.mlbstatic.com/team-logos/138.svg',
  'mlb:ARI':'https://www.mlbstatic.com/team-logos/109.svg',
  'mlb:COL':'https://www.mlbstatic.com/team-logos/115.svg',
  'mlb:LAD':'https://www.mlbstatic.com/team-logos/119.svg',
  'mlb:SD': 'https://www.mlbstatic.com/team-logos/135.svg',
  'mlb:SF': 'https://www.mlbstatic.com/team-logos/137.svg',
};

const _logoMemCache = {};
function logoSync(leagueKey, teamName) {
  const url = LOGO_URLS[leagueKey + ':' + teamName];
  if (!url) return null;
  if (_logoMemCache[url] !== undefined) return _logoMemCache[url];
  try {
    const fm = FileManager.local();
    const key = url.replace(/[^a-z0-9]/gi, '_').slice(-60);
    const path = fm.joinPath(fm.documentsDirectory(), 'bb_logos', key);
    if (!fm.fileExists(path)) { _logoMemCache[url] = null; return null; }
    const age = Date.now() - fm.modificationDate(path).getTime();
    if (age > 7 * 86400000) { _logoMemCache[url] = null; return null; }
    const img = fm.readImage(path);
    _logoMemCache[url] = img || null;
    return img || null;
  } catch {
    _logoMemCache[url] = null;
    return null;
  }
}

async function downloadMissingLogos(teamKeys) {
  try {
    const fm = FileManager.local();
    const dir = fm.joinPath(fm.documentsDirectory(), 'bb_logos');
    if (!fm.fileExists(dir)) fm.createDirectory(dir);
    const missing = [...new Set(teamKeys)].filter(key => {
      const url = LOGO_URLS[key];
      if (!url) return false;
      const path = fm.joinPath(dir, url.replace(/[^a-z0-9]/gi, '_').slice(-60));
      return !fm.fileExists(path);
    });
    if (!missing.length) return;
    await Promise.all(missing.map(async key => {
      const url = LOGO_URLS[key];
      const path = fm.joinPath(dir, url.replace(/[^a-z0-9]/gi, '_').slice(-60));
      try {
        const req = new Request(url); req.timeoutInterval = 6;
        const img = await req.loadImage();
        if (img) fm.writeImage(path, img);
      } catch {}
    }));
  } catch {}
}


// ── 연속기록 파싱 ────────────────────────────────────────
function parseStreakCode(code) {
  if (!code) return null;
  const m = String(code).match(/([WL])(\d+)/i);
  return m ? { type: m[1].toUpperCase(), count: parseInt(m[2]) } : null;
}

function parseKoreanStreak(text) {
  if (!text) return null;
  const s = String(text).replace(/<[^>]+>/g, '').trim();
  // "13연패" / "3연승" (count first)
  let m = s.match(/(\d+)(연승|연패)/);
  if (m) return { type: m[2] === '연승' ? 'W' : 'L', count: parseInt(m[1]) };
  // "연패13" / "연승3" (type first)
  m = s.match(/(연승|연패)(\d+)/);
  if (m) return { type: m[1] === '연승' ? 'W' : 'L', count: parseInt(m[2]) };
  // KBO GetTeamRank의 연속 칼럼은 '연' 없이 "2승" / "7패" 형식으로 온다.
  // 전체 일치로만 허용 — "7승0무3패"(최근10경기) 같은 값이 잘못 잡히지 않도록.
  m = s.match(/^(\d+)\s*(승|패)$/);
  if (m) return { type: m[2] === '승' ? 'W' : 'L', count: parseInt(m[1]) };
  return null;
}


// ── Data fetch ───────────────────────────────────────────
async function fetchKbo() {
  const req = new Request(`${CF}/ws/Main.asmx/GetTeamRank?leId=1&srId=0&seasonId=${YEAR}&_t=${Date.now()}`);
  req.timeoutInterval = 8;
  const data = await req.loadJSON();
  if (!data?.rows?.length) throw new Error('KBO 데이터 없음');
  return data.rows.map((rec, i) => {
    const row = rec.row;
    const raw = row[1]?.Text || '';
    const m = raw.match(/>([^<]+)</);
    const short = m ? m[1].trim() : raw.replace(/<[^>]+>/g, '').trim();
    // 응답은 셀 9개(0~8): 순위·팀·경기·승·패·무·승률·게임차·연속
    // 연속은 row[8]. 칼럼이 밀리더라도 동작하도록 실패 시 뒤에서부터 훑는다.
    const cells = row.map(c => String(c?.Text || '').replace(/<[^>]+>/g, '').trim());
    let streak = parseKoreanStreak(cells[8]);
    for (let ci = cells.length - 1; ci >= 2 && !streak; ci--) {
      streak = parseKoreanStreak(cells[ci]);
    }
    return {
      rank: i + 1, team: short,
      w: parseInt(row[3]?.Text) || 0, l: parseInt(row[4]?.Text) || 0,
      d: parseInt(row[5]?.Text) || 0, pct: row[6]?.Text || '-', gb: row[7]?.Text || '-',
      streak,
    };
  });
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

async function fetchNpb(leagueFilter) {
  const NPB_KO = {
    'Yomiuri Giants':'요미우리','Hanshin Tigers':'한신',
    'Hiroshima Toyo Carp':'히로시마','Tokyo Yakult Swallows':'야쿠르트',
    'Yakult Swallows':'야쿠르트','DeNA BayStars':'DeNA',
    'Yokohama DeNA BayStars':'DeNA','Chunichi Dragons':'주니치',
    'Fukuoka SoftBank Hawks':'소프트뱅크','Orix Buffaloes':'ORIX',
    'ORIX Buffaloes':'ORIX','Chiba Lotte Marines':'롯데',
    'Tohoku Rakuten Golden Eagles':'라쿠텐','Rakuten Eagles':'라쿠텐',
    'Hokkaido Nippon-Ham Fighters':'닛폰햄','Nippon-Ham Fighters':'닛폰햄',
    'Saitama Seibu Lions':'세이부','Seibu Lions':'세이부',
    'Yomiuri':'요미우리','Hanshin':'한신','Hiroshima':'히로시마',
    'Yakult':'야쿠르트','DeNA':'DeNA','BayStars':'DeNA','Chunichi':'주니치',
    'SoftBank':'소프트뱅크','ORIX':'ORIX','Orix':'ORIX','Lotte':'롯데',
    'Rakuten':'라쿠텐','Nippon-Ham':'닛폰햄','Seibu':'세이부',
  };
  // Team sets for CL/PL classification
  const CL = new Set(['요미우리','한신','히로시마','야쿠르트','DeNA','주니치']);
  const PL = new Set(['소프트뱅크','ORIX','롯데','라쿠텐','닛폰햄','세이부']);

  const parseTbl = (tblHtml) => {
    const rows = [...tblHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    // Confirmed structure: Team(0) G(1) W(2) L(3) T(4) PCT(5) GB(6)
    let iW = 2, iL = 3, iT = 4, iPct = 5, iGB = 6;
    for (const [, row] of rows.slice(0, 3)) {
      const hdrs = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').trim().toUpperCase());
      if (!hdrs.some(h => h === 'W')) continue;
      const fi = s => hdrs.indexOf(s);
      const wI = fi('W'); if (wI < 0) continue;
      iW = wI; iL = fi('L') >= 0 ? fi('L') : wI + 1;
      const tI = hdrs.findIndex(h => h === 'T' || h === 'TIE');
      iT = tI >= 0 ? tI : iL + 1;
      const pI = hdrs.findIndex(h => /^PCT$|^W%$/.test(h));
      iPct = pI >= 0 ? pI : iT + 1;
      const gI = fi('GB'); iGB = gI >= 0 ? gI : iPct + 1;
      break;
    }
    const teams = [];
    for (const [, row] of rows) {
      const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
      if (cells.length <= iGB) continue;
      const koKey = Object.keys(NPB_KO).find(k => cells[0].includes(k));
      if (!koKey) continue;
      const w = parseInt(cells[iW]), l = parseInt(cells[iL]);
      if (isNaN(w) || isNaN(l)) continue;
      teams.push({
        rank: teams.length + 1, team: NPB_KO[koKey],
        w, l, d: parseInt(cells[iT]) || 0,
        pct: cells[iPct] || '-', gb: teams.length === 0 ? '-' : (cells[iGB] || '-'),
        streak: null,
      });
    }
    return teams;
  };

  const parseHtml = (html) => {
    const result = { cl: [], pl: [] };
    for (const [tblFull] of html.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi)) {
      const teams = parseTbl(tblFull);
      if (teams.length < 3) continue;
      const tSet = new Set(teams.map(t => t.team));
      if ([...CL].filter(k => tSet.has(k)).length >= 3) result.cl = teams;
      else if ([...PL].filter(k => tSet.has(k)).length >= 3) result.pl = teams;
    }
    return result;
  };

  const loadUrl = async url => {
    const tryDirect = async () => {
      const req = new Request(url); req.timeoutInterval = 8;
      return await req.loadString();
    };
    const tryProxy = async () => {
      const req = new Request(`${CTABS}${encodeURIComponent(url)}`); req.timeoutInterval = 8;
      return await req.loadString();
    };
    try { const h = await tryDirect(); if (h && h.length > 500) return h; } catch {}
    return tryProxy();
  };

  let clTeams = [], plTeams = [];

  // Primary: main /stats/ page (has both leagues)
  try {
    const html = await loadUrl(`https://npb.jp/bis/eng/${YEAR}/stats/`);
    const { cl, pl } = parseHtml(html);
    clTeams = cl; plTeams = pl;
  } catch {}

  // Fallback: individual league pages
  if (!clTeams.length && leagueFilter !== 'npb-pl') {
    try {
      const html = await loadUrl(`https://npb.jp/bis/eng/${YEAR}/stats/std_c.html`);
      const { cl } = parseHtml(html);
      clTeams = cl;
    } catch {}
  }
  if (!plTeams.length && leagueFilter !== 'npb-cl') {
    try {
      const html = await loadUrl(`https://npb.jp/bis/eng/${YEAR}/stats/std_p.html`);
      const { pl } = parseHtml(html);
      plTeams = pl;
    } catch {}
  }

  const groups = [];
  if (clTeams.length && leagueFilter !== 'npb-pl') groups.push({ section: '센트럴리그', teams: clTeams });
  if (plTeams.length && leagueFilter !== 'npb-cl') groups.push({ section: '퍼시픽리그', teams: plTeams });
  if (!groups.length) throw new Error('NPB 데이터 없음');
  return groups;
}

// NPB 연승/연패: 웹앱 _computeNpbStreaks 로직을 regex로 재구현

async function computeNpbStreaks() {
  const NORM = {
    '巨人':'読売','ORIX':'オリックス','スワローズ':'ヤクルト','読売ジャイアンツ':'読売',
    '北海道日本ハム':'日本ハム','ファイターズ':'日本ハム','ハム':'日本ハム',
    'バファローズ':'オリックス','イーグルス':'楽天','マリーンズ':'ロッテ',
    'ライオンズ':'西武','ホークス':'ソフトバンク',
  };
  const NPB_KO = {
    'ヤクルト':'야쿠르트','広島':'히로시마','読売':'요미우리','中日':'주니치',
    'DeNA':'DeNA','阪神':'한신','ソフトバンク':'소프트뱅크','日本ハム':'닛폰햄',
    '楽天':'라쿠텐','ロッテ':'롯데','オリックス':'ORIX','西武':'세이부',
  };
  const month   = String(NOW.getMonth() + 1).padStart(2, '0');
  const prevM   = NOW.getMonth() === 0 ? 12 : NOW.getMonth();
  const prevY   = NOW.getMonth() === 0 ? YEAR - 1 : YEAR;
  const prevMStr = String(prevM).padStart(2, '0');

  const fetchHtml = async url => {
    // iOS widget has no CORS: try direct URL first, then proxies as fallback
    for (const pUrl of [
      url,
      `${CTABS}${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    ]) {
      try {
        const req = new Request(pUrl); req.timeoutInterval = 6;
        const t = await req.loadString();
        if (t && t.length > 200) return t;
      } catch {}
    }
    return '';
  };

  const htmls = await Promise.all([
    fetchHtml(`https://npb.jp/games/${prevY}/schedule_${prevMStr}_detail.html`),
    fetchHtml(`https://npb.jp/games/${YEAR}/schedule_${month}_detail.html`),
  ]);

  const games = [];

  for (let idx = 0; idx < htmls.length; idx++) {
    const html = htmls[idx];
    if (!html) continue;
    // <tr id="date{MMDD}"> 패턴 — 웹앱의 doc.querySelectorAll('tr[id]') 대응
    for (const [, trId, trBody] of [...html.matchAll(/<tr\b[^>]*\bid="date(\d{4})"[^>]*>([\s\S]*?)<\/tr>/gi)]) {
      const byClass = cls => {
        const m = trBody.match(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/`, 'i'));
        return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
      };
      let t1 = byClass('team1'), t2 = byClass('team2');
      const s1s = byClass('score1'), s2s = byClass('score2');
      if (!t1 || !t2 || !/^\d+$/.test(s1s) || !/^\d+$/.test(s2s)) continue;
      t1 = NORM[t1] || t1;
      t2 = NORM[t2] || t2;
      const mm = parseInt(trId.slice(0, 2)), dd = parseInt(trId.slice(2, 4));
      games.push({ dateKey: idx * 10000 + mm * 100 + dd, t1, t2, s1: +s1s, s2: +s2s });
    }
  }

  games.sort((a, b) => a.dateKey - b.dateKey);

  const teamSeq = {};
  for (const g of games) {
    const r1 = g.s1 > g.s2 ? 'W' : g.s1 < g.s2 ? 'L' : 'D';
    const r2 = g.s2 > g.s1 ? 'W' : g.s2 < g.s1 ? 'L' : 'D';
    (teamSeq[g.t1] = teamSeq[g.t1] || []).push(r1);
    (teamSeq[g.t2] = teamSeq[g.t2] || []).push(r2);
  }

  const result = {};
  for (const [jp, seq] of Object.entries(teamSeq)) {
    if (!seq.length) continue;
    const last = seq[seq.length - 1];
    if (last === 'D') continue;
    let count = 0;
    for (let i = seq.length - 1; i >= 0 && seq[i] === last; i--) count++;
    const ko = NPB_KO[jp];
    if (ko && count > 0) result[ko] = { count, type: last };
  }
  return result;
}

// 스케줄 JSON은 팀 영문명(...EnName)을 제공하지 않는다. TeamCode와 중문 팀명만 있으므로
// 로고 키('cpbl:Brothers' 등)와 일치하도록 영문 표기로 정규화한다.

const CPBL_TEAM_BY_CODE = {
  ACN011: 'Brothers',   // 中信兄弟
  AAA011: 'Dragons',    // 味全龍
  AEO011: 'Guardians',  // 富邦悍將
  AJL011: 'Monkeys',    // 樂天桃猿
  AKP011: 'TSG Hawks',  // 台鋼雄鷹
  ADD011: 'U-Lions',    // 統一7-ELEVEn獅
};
const CPBL_TEAM_BY_NAME = {
  '中信兄弟': 'Brothers', '味全龍': 'Dragons', '富邦悍將': 'Guardians',
  '樂天桃猿': 'Monkeys', '台鋼雄鷹': 'TSG Hawks', '統一7-ELEVEn獅': 'U-Lions',
  DRAGONS: 'Dragons', // 일부 응답이 영문 대문자로 올 때 대비
};
const cpblTeam = (code, zhName, enName) =>
  CPBL_TEAM_BY_CODE[code] || CPBL_TEAM_BY_NAME[zhName] ||
  CPBL_TEAM_BY_NAME[enName] || enName || zhName || '';

async function fetchCpbl() {
  // Primary: compute from GitHub raw schedule JSON (no proxy/Cloudflare issues)
  try {
    const DATA_URL = `https://raw.githubusercontent.com/rockyhong-a11y/allofbaseball/main/data/cpbl_schedule_${YEAR}.json`;
    const req = new Request(DATA_URL); req.timeoutInterval = 10;
    const games = JSON.parse(await req.loadString());
    // 원본 배열은 날짜순이 아니다 → 연속기록(streak)이 어긋나므로 경기 시간순으로 정렬.
    // 미실시·미래 경기는 PresentStatus가 1이어도 0-0으로 들어오므로 함께 제외한다.
    const played = games
      .filter(g => g.PresentStatus === 1
        && typeof g.VisitingScore === 'number' && typeof g.HomeScore === 'number'
        && !(g.VisitingScore === 0 && g.HomeScore === 0))
      .sort((a, b) => String(a.GameDate).localeCompare(String(b.GameDate))
        || (a.GameSno || 0) - (b.GameSno || 0));
    const rec = {}, seq = {};
    for (const g of played) {
      const vs = g.VisitingScore, hs = g.HomeScore;
      const vt = cpblTeam(g.VisitingTeamCode, g.VisitingTeamName, g.VisitingTeamEnName);
      const ht = cpblTeam(g.HomeTeamCode, g.HomeTeamName, g.HomeTeamEnName);
      if (!vt || !ht) continue;
      if (!rec[vt]) { rec[vt] = {w:0,l:0,d:0}; seq[vt] = []; }
      if (!rec[ht]) { rec[ht] = {w:0,l:0,d:0}; seq[ht] = []; }
      if (vs > hs) { rec[vt].w++; rec[ht].l++; seq[vt].push('W'); seq[ht].push('L'); }
      else if (hs > vs) { rec[ht].w++; rec[vt].l++; seq[ht].push('W'); seq[vt].push('L'); }
      else { rec[vt].d++; rec[ht].d++; seq[vt].push('D'); seq[ht].push('D'); }
    }
    const entries = Object.entries(rec);
    if (entries.length >= 2) {
      entries.sort((a,b) => (b[1].w/(b[1].w+b[1].l)||0) - (a[1].w/(a[1].w+a[1].l)||0));
      const [,lr] = entries[0];
      const teams = entries.map(([name,r],i) => {
        const s = seq[name]||[], last = s[s.length-1];
        let cnt=0; if(last&&last!=='D'){for(let j=s.length-1;j>=0&&s[j]===last;j--)cnt++;}
        return {
          rank:i+1, team:name, w:r.w, l:r.l, d:r.d,
          pct:(r.w+r.l)?String((r.w/(r.w+r.l)).toFixed(3)):'.000',
          gb: i===0?'-':String(((lr.w-r.w)+(r.l-lr.l))/2),
          streak: (last&&last!=='D'&&cnt>0) ? {type:last,count:cnt} : null,
        };
      });
      return [{ section: null, teams }];
    }
  } catch {}

  // Fallback: scrape standings HTML via proxies
  const CPBL_URL = 'https://en.cpbl.com.tw/standings/season';
  const proxies = [
    CPBL_URL,
    `${CTABS}${encodeURIComponent(CPBL_URL)}`,
    `https://corsproxy.io/?${encodeURIComponent(CPBL_URL)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(CPBL_URL)}`,
  ];
  let html = '';
  for (const url of proxies) {
    try {
      const req = new Request(url); req.timeoutInterval = 10;
      const t = await req.loadString();
      if (t && t.length > 500) { html = t; break; }
    } catch {}
  }
  if (!html) throw new Error('CPBL fetch failed');
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


// ── 렌더링 ───────────────────────────────────────────────

// 리그별 연속기록 칼럼. 연승(내림차순) 먼저, 그 다음 연패(내림차순).
function addStreakColumn(parent, labelText, color, entries, maxRows) {
  const card = parent.addStack();
  card.layoutVertically();
  card.backgroundColor = C.card;
  card.cornerRadius = 7;
  card.setPadding(6, 5, 6, 5);

  const lbl = card.addText(labelText);
  lbl.font = Font.boldSystemFont(10);
  lbl.textColor = color;
  lbl.minimumScaleFactor = 0.7;
  card.addSpacer(4);

  if (!entries.length) {
    const none = card.addText('-');
    none.font = Font.systemFont(9);
    none.textColor = C.mu;
    card.addSpacer();
    return;
  }

  const shown = entries.slice(0, maxRows);
  let first = true;
  for (const e of shown) {
    if (!first) {
      card.addSpacer(2);
      const dl = card.addStack();
      dl.backgroundColor = C.div;
      dl.size = new Size(0, 1);
      card.addSpacer(2);
    }
    first = false;

    const row = card.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();

    const ic = row.addText(e.type === 'W' ? '\u{1F525}' : '\u{1F4A7}');
    ic.font = Font.systemFont(9);
    row.addSpacer(2);

    if (e.logoImg) {
      const imgEl = row.addImage(e.logoImg);
      imgEl.imageSize = new Size(15, 15);
      imgEl.cornerRadius = 2;
    } else {
      const tm = row.addText(e.team.slice(0, 4));
      tm.font = Font.boldSystemFont(9);
      tm.textColor = C.tx;
      tm.minimumScaleFactor = 0.7;
    }
    row.addSpacer(3);

    const cnt = row.addText(String(e.count));
    cnt.font = Font.boldSystemFont(12);
    cnt.textColor = e.type === 'W' ? C.win : C.lose;
    const unit = row.addText(e.type === 'W' ? '연승' : '연패');
    unit.font = Font.systemFont(8);
    unit.textColor = e.type === 'W' ? C.win : C.lose;
    row.addSpacer();
  }

  // 잘린 항목 수 표기
  if (entries.length > shown.length) {
    card.addSpacer(2);
    const more = card.addText(`+${entries.length - shown.length}`);
    more.font = Font.systemFont(8);
    more.textColor = C.mu;
  }
  card.addSpacer();
}

function collect(teams, leagueKey, min) {
  const ws = [], ls = [];
  for (const t of teams) {
    if (!t || !t.streak || t.streak.count < min) continue;
    const e = {
      team: t.team,
      count: t.streak.count,
      type: t.streak.type,
      logoImg: logoSync(leagueKey, t.team),
    };
    (t.streak.type === 'W' ? ws : ls).push(e);
  }
  ws.sort((a, b) => b.count - a.count);
  ls.sort((a, b) => b.count - a.count);
  return [...ws, ...ls];
}

async function buildStreaksWidget() {
  const widget = new ListWidget();
  widget.backgroundColor = C.bg;
  widget.setPadding(10, 12, 8, 12);

  const hdr = widget.addStack();
  hdr.layoutHorizontally();
  hdr.centerAlignContent();
  const titleEl = hdr.addText('\u{1F525} 연승 · 연패');
  titleEl.font = Font.boldSystemFont(12);
  titleEl.textColor = C.tx;
  hdr.addSpacer(6);
  const minEl = hdr.addText(`${MIN_STREAK}연속 이상`);
  minEl.font = Font.systemFont(9);
  minEl.textColor = C.mu;
  hdr.addSpacer();
  const dateEl = hdr.addText(`${NOW.getMonth() + 1}/${NOW.getDate()}`);
  dateEl.font = Font.systemFont(10);
  dateEl.textColor = C.mu;
  widget.addSpacer(8);

  const results = await Promise.allSettled([
    fetchKbo(), fetchMlbAll(), fetchNpb('npb'), computeNpbStreaks(), fetchCpbl(),
  ]);
  const kboTeams     = results[0].status === 'fulfilled' ? results[0].value : [];
  const mlbAll       = results[1].status === 'fulfilled' ? results[1].value : { nl: [], al: [] };
  const npbGroups    = results[2].status === 'fulfilled' ? results[2].value : [];
  const npbStreakMap = results[3].status === 'fulfilled' ? results[3].value : {};
  const cpblGroups   = results[4].status === 'fulfilled' ? results[4].value : [];

  try {
    // NPB는 순위표에 연속기록이 없어 경기 결과로 따로 계산한 값을 붙인다
    for (const g of npbGroups)
      for (const t of g.teams)
        t.streak = npbStreakMap[t.team] || null;

    const mlbTeams  = [...mlbAll.nl, ...mlbAll.al].flatMap(g => g.teams);
    const npbTeams  = npbGroups.flatMap(g => g.teams);
    const cpblTeams = cpblGroups.flatMap(g => g.teams);

    const anyLoaded = kboTeams.length || mlbTeams.length || npbTeams.length || cpblTeams.length;
    if (!anyLoaded) {
      widget.addSpacer(4);
      const errEl = widget.addText('\u26A0\uFE0F 로드 실패\n네트워크를 확인하세요');
      errEl.font = Font.systemFont(11);
      errEl.textColor = C.mu;
      errEl.minimumScaleFactor = 0.7;
    } else {
      await downloadMissingLogos([
        ...kboTeams.map(t => 'kbo:' + t.team),
        ...mlbTeams.map(t => 'mlb:' + t.team),
        ...npbTeams.map(t => 'npb:' + t.team),
        ...cpblTeams.map(t => 'cpbl:' + t.team),
      ]);

      // 요청 순서: KBO → MLB → NPB → CPBL
      const cols = [
        { label: '\u{1F1F0}\u{1F1F7} KBO',  color: C.kbo,  entries: collect(kboTeams,  'kbo',  MIN_STREAK) },
        { label: '\u{1F1FA}\u{1F1F8} MLB',  color: C.mlb,  entries: collect(mlbTeams,  'mlb',  MIN_STREAK) },
        { label: '\u{1F1EF}\u{1F1F5} NPB',  color: C.npb,  entries: collect(npbTeams,  'npb',  MIN_STREAK) },
        { label: '\u{1F1F9}\u{1F1FC} CPBL', color: C.cpbl, entries: collect(cpblTeams, 'cpbl', MIN_STREAK) },
      ];

      const family = config.widgetFamily || 'large';
      const maxRows = family === 'medium' ? 4 : 9;

      const content = widget.addStack();
      content.layoutHorizontally();
      for (let i = 0; i < cols.length; i++) {
        if (i > 0) content.addSpacer(3);
        addStreakColumn(content, cols[i].label, cols[i].color, cols[i].entries, maxRows);
      }
    }
  } catch (renderErr) {
    widget.addSpacer(4);
    const errEl = widget.addText('\u26A0\uFE0F 렌더링 오류\n' + String(renderErr).slice(0, 80));
    errEl.font = Font.systemFont(9);
    errEl.textColor = C.mu;
    errEl.minimumScaleFactor = 0.6;
  }

  widget.url = `scriptable:///run/${encodeURIComponent(Script.name())}`;
  widget.addSpacer();
  const ft = widget.addStack();
  ft.layoutHorizontally();
  ft.centerAlignContent();
  const s1 = ft.addText('allofbaseball');
  s1.font = Font.systemFont(8); s1.textColor = C.mu;
  ft.addSpacer();
  const s2 = ft.addText(NOW.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
  s2.font = Font.systemFont(8); s2.textColor = C.mu;
  ft.addSpacer(4);
  const rfEl = ft.addText('\u21BA');
  rfEl.font = Font.systemFont(11);
  rfEl.textColor = C.mu;
  return widget;
}

// ── Run ──────────────────────────────────────────────────
const widget = await buildStreaksWidget();
if (config.runInWidget) {
  Script.setWidget(widget);
} else if (config.widgetFamily === 'medium') {
  await widget.presentMedium();
} else {
  await widget.presentLarge();
}
Script.complete();
