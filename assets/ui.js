/* Navigation and accessibility around the original baseball data system. */
(() => {
  'use strict';
  const input = document.getElementById('si');
  const main = document.getElementById('main');
  const sidebar = document.getElementById('sidebar');
  const menu = document.getElementById('mobile-menu');
  const mobile = matchMedia('(max-width: 760px)');
  const historyKey = 'allofbaseball:recent:v1';
  const leagues = ['kbo', 'mlb', 'npb', 'cpbl'];
  let lastLeague = 'kbo';
  let menuOpen = false;
  let recent = [];
  let announcement = '';
  let frame = null;
  window.appSearchScope = 'all';

  try {
    const saved = JSON.parse(localStorage.getItem(historyKey) || '[]');
    if (Array.isArray(saved)) {
      recent = saved.filter(item => item && typeof item.name === 'string' &&
        item.name.length > 0 && item.name.length <= 100 &&
        (item.league === null || leagues.includes(item.league))).slice(0, 6);
    }
  } catch (_) {}

  function persistHistory() {
    try { localStorage.setItem(historyKey, JSON.stringify(recent)); } catch (_) {}
  }

  function renderHistory() {
    const list = document.getElementById('recent-list');
    list.replaceChildren();
    recent.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recent-chip';
      button.textContent = item.name;
      button.title = item.league ? `${item.league.toUpperCase()}에서 다시 검색` : '전체 리그에서 다시 검색';
      button.addEventListener('click', () => {
        window.appSetScope(item.league || 'all', false);
        fill(item.name, item.league);
      });
      list.append(button);
    });
    document.getElementById('recent-searches').hidden = !recent.length;
  }

  function syncInput() {
    const hasQuery = Boolean(input.value);
    document.body.dataset.hasQuery = String(hasQuery);
    document.getElementById('clear-search').hidden = !hasQuery;
  }

  function syncNavigation(view) {
    document.querySelectorAll('[data-view-link]').forEach(button => {
      const active = button.dataset.viewLink === view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('.lg-nav-btn').forEach(button => {
      button.setAttribute('aria-pressed', String(_lgCur === button.dataset.league));
    });
    document.querySelectorAll('.lg-tab').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.tab === _lgTab));
    });
    const txOpen = view === 'transactions';
    const txNav = document.getElementById('transaction-nav');
    txNav.hidden = !txOpen;
    document.querySelector('[data-view-link="transactions"]').setAttribute('aria-expanded', String(txOpen));
    document.querySelectorAll('[data-tx-league]').forEach(button => {
      const active = txOpen && button.dataset.txLeague === window.txCurrentLeague;
      button.classList.toggle('on', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setView(view) {
    document.body.dataset.view = view;
    const isLeague = view === 'league';
    const isTransactions = view === 'transactions';
    const label = isTransactions ? '이적/등록' : isLeague ? (_lgTab === 'standings' ? '리그 순위' : '경기 일정') : '선수 검색';
    document.getElementById('breadcrumb-view').textContent = label;
    document.getElementById('view-heading').textContent = isTransactions ? '이적·등록 소식' : isLeague ? label : '선수 기록';
    document.getElementById('view-description').textContent = isTransactions
      ? '리그별 선수 이동과 등록 현황을 확인하세요.'
      : isLeague
      ? '네 개 리그의 경기 일정과 팀 순위를 확인하세요.'
      : '시즌별 기록과 통산 성적을 확인하세요.';
    document.getElementById('back-home').textContent = (isLeague || isTransactions) ? '선수 검색' : '선수 목록';
    document.getElementById('tx-panel').hidden = !isTransactions;
    syncNavigation(isTransactions ? 'transactions' : isLeague ? _lgTab : 'search');
    syncInput();
    window.appToggleMenu(false, false);
    scheduleEnhancement();
  }

  window.appInvalidateSearch = () => {
    _searchRequestId++;
    clearTimeout(_acTimer);
    _acAbort?.abort();
    hideAcDrop();
  };

  window.appAfterCloseLeague = () => {
    window.appInvalidateSearch();
    main.replaceChildren();
    input.value = '';
    _selectedLeague = null;
    document.getElementById('featured').style.display = 'block';
    setView('search');
  };

  window.appGoHome = (focus = false) => {
    closeLeague();
    document.getElementById('tx-panel').hidden = true;
    window.scrollTo({top: 0, behavior: 'instant'});
    if (focus) input.focus({preventScroll: true});
  };

  window.appClearSearch = () => window.appGoHome(true);

  window.appPrepareSearch = query => {
    const selected = _selectedLeague;
    if (_lgCur) closeLeague();
    input.value = query;
    _selectedLeague = selected;
    if (selected) window.appSetScope(selected, false);
    const league = selected || (window.appSearchScope === 'all' ? null : window.appSearchScope);
    recent = [{name: query.slice(0, 100), league}, ...recent.filter(item =>
      item.name !== query || item.league !== league)].slice(0, 6);
    persistHistory();
    renderHistory();
    setView('results');
    if (mobile.matches) input.blur();
    window.scrollTo({top: 0, behavior: 'instant'});
  };

  window.appSetScope = (scope, focus = true) => {
    if (scope !== 'all' && !leagues.includes(scope)) return;
    window.appSearchScope = scope;
    _selectedLeague = null;
    clearTimeout(_acTimer);
    _acAbort?.abort();
    hideAcDrop();
    document.querySelectorAll('.scope-btn').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.scope === scope));
    });
    const hints = {
      all: '한글, 영문, 일본어, 중문으로 검색할 수 있어요.',
      kbo: 'KBO 선수를 한글과 영문 이름으로 검색하세요.',
      mlb: 'MLB 선수를 한글과 영문 이름으로 검색하세요.',
      npb: 'NPB 선수를 한글, 일본어, 영문으로 검색하세요.',
      cpbl: 'CPBL 선수를 한글, 영문, 중문으로 검색하세요.'
    };
    document.getElementById('sub').textContent = hints[scope];
    if (focus) {
      input.focus({preventScroll: true});
      if (input.value.trim()) input.dispatchEvent(new Event('input', {bubbles: true}));
    }
  };

  window.appClearHistory = () => {
    recent = [];
    persistHistory();
    renderHistory();
    document.getElementById('app-announcement').textContent = '최근 검색 기록을 지웠어요.';
    input.focus({preventScroll: true});
  };

  window.appSyncLeague = () => {
    if (!_lgCur) return;
    lastLeague = _lgCur;
    document.getElementById('lg-date-input').value = _lgDateApi(_lgDate);
    document.getElementById('lg-weekday').textContent = _lgDate.toLocaleDateString('ko-KR', {weekday: 'long'});
    setView('league');
  };

  window.appShowLeague = (league = null, tab = null) => {
    document.getElementById('tx-panel').hidden = true;
    const nextLeague = league || _lgCur || lastLeague;
    const nextTab = tab || (_lgCur ? _lgTab : 'schedule');
    if (_lgCur !== nextLeague) toggleLeague(nextLeague, nextTab);
    else if (_lgTab !== nextTab) switchLgTab(nextTab);
    else window.appSyncLeague();
    window.scrollTo({top: 0, behavior: 'instant'});
  };

  window.appShowTransactions = () => {
    if (_lgCur) closeLeague();
    window.appInvalidateSearch();
    main.replaceChildren();
    document.getElementById('featured').style.display = 'none';
    document.getElementById('tx-panel').hidden = false;
    setView('transactions');
    window.scrollTo({top: 0, behavior: 'instant'});
  };

  window.appLoadTransactions = league => {
    window.appShowTransactions();
    window.txSelectLeague?.(league);
    syncNavigation('transactions');
  };

  window.appRefreshTransactions = () => {
    if (window.txCurrentLeague) window.txSelectLeague?.(window.txCurrentLeague, true);
  };

  document.getElementById('lg-date-input').addEventListener('change', event => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) return;
    const [year, month, day] = event.target.value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return;
    _lgDate = date;
    _updateLgHeader();
    loadLgData();
  });

  window.appSyncTheme = () => {
    const light = document.body.classList.contains('light');
    const label = light ? '다크 모드' : '라이트 모드';
    const path = light
      ? '<path d="M20.7 13.1A9 9 0 0 1 10.9 3.3 9 9 0 1 0 20.7 13.1Z"/>'
      : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>';
    const button = document.getElementById('theme-btn');
    button.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg><span>${label}</span>`;
    button.setAttribute('aria-label', `${label}로 전환`);
    button.title = `${label}로 전환`;
    document.documentElement.style.colorScheme = light ? 'light' : 'dark';
  };

  window.appToggleMenu = (open = !menuOpen, restoreFocus = true) => {
    const wasOpen = menuOpen;
    menuOpen = mobile.matches && open;
    document.body.classList.toggle('drawer-open', menuOpen);
    document.getElementById('drawer-backdrop').hidden = !menuOpen;
    menu.setAttribute('aria-expanded', String(menuOpen));
    menu.setAttribute('aria-label', menuOpen ? '메뉴 닫기' : '메뉴 열기');
    sidebar.inert = mobile.matches && !menuOpen;
    document.getElementById('workspace-content').inert = menuOpen;
    if (menuOpen) {
      sidebar.setAttribute('role', 'dialog');
      sidebar.setAttribute('aria-modal', 'true');
      sidebar.querySelector('.brand').focus();
    } else {
      sidebar.removeAttribute('role');
      sidebar.removeAttribute('aria-modal');
      if (wasOpen && restoreFocus) menu.focus();
    }
  };
  mobile.addEventListener('change', () => window.appToggleMenu(false));

  document.addEventListener('keydown', event => {
    if (menuOpen && event.key === 'Escape') {
      event.preventDefault();
      window.appToggleMenu(false);
      return;
    }
    if (menuOpen && event.key === 'Tab') {
      const buttons = [...sidebar.querySelectorAll('a[href], button:not([disabled])')]
        .filter(element => element.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey &&
      !event.target.closest('input, textarea, select, [contenteditable="true"]') &&
      !document.getElementById('stat-guide').open && !menuOpen) {
      event.preventDefault();
      if (_lgCur) window.appGoHome();
      input.focus({preventScroll: true});
      input.select();
    }
  });

  const guide = document.getElementById('stat-guide');
  document.querySelectorAll('[data-open-guide]').forEach(button => {
    button.addEventListener('click', () => guide.showModal());
  });
  guide.addEventListener('click', event => {
    if (event.target !== guide) return;
    const rect = guide.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom) guide.close();
  });

  const terms = {
    G: '경기 수', GP: '경기 수', 경기: '경기 수', PA: '타석', AB: '타수', H: '안타',
    HR: '홈런', RBI: '타점', R: '득점', SB: '도루', BB: '볼넷', SO: '삼진', K: '삼진',
    AVG: '타율', 타율: '안타 ÷ 타수', OBP: '출루율', SLG: '장타율', OPS: '출루율 + 장타율',
    ERA: '평균자책점: 9이닝당 자책점', WHIP: '이닝당 허용한 볼넷 + 안타',
    IP: '투구 이닝: .1 = ⅓이닝, .2 = ⅔이닝', W: '승', L: '패', SV: '세이브',
    HLD: '홀드', GS: '선발 등판', GB: '선두 팀과의 게임차', 게차: '선두 팀과의 게임차'
  };

  function enhanceTables(root) {
    root.querySelectorAll('th').forEach(th => {
      th.setAttribute('scope', 'col');
      const term = terms[th.textContent.trim()];
      if (term) th.title = term;
    });
    root.querySelectorAll('.stog').forEach(button => {
      button.setAttribute('aria-pressed', String(button.classList.contains('on')));
    });
    root.querySelectorAll('.tbl-wrap, .lg-tbl-wrap').forEach(wrap => {
      const table = wrap.querySelector('table');
      if (!table) return;
      const standings = Boolean(table.querySelector('.rank-cell'));
      table.classList.toggle('standings-table', standings);
      const label = root === main ? '선수 시즌별 기록' :
        `${(_lgCur || '').toUpperCase()} ${standings ? '리그 순위' : '경기 일정'}`;
      table.setAttribute('aria-label', label);
      const scrollable = wrap.scrollWidth > wrap.clientWidth + 2;
      let hint = wrap.previousElementSibling;
      if (!hint?.classList.contains('table-scroll-hint')) {
        hint = document.createElement('div');
        hint.className = 'table-scroll-hint';
        hint.textContent = '↔ 좌우로 움직여 전체 기록을 확인하세요';
        hint.setAttribute('aria-hidden', 'true');
        wrap.before(hint);
      }
      hint.hidden = !scrollable;
      if (scrollable) {
        wrap.tabIndex = 0;
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', `${label}. 좌우 방향키로 더 보기`);
      } else {
        wrap.removeAttribute('tabindex');
        wrap.removeAttribute('role');
        wrap.removeAttribute('aria-label');
      }
    });
    root.querySelectorAll('a[target="_blank"]').forEach(link => {
      link.rel = 'noopener noreferrer';
      if (!link.hasAttribute('aria-label')) link.setAttribute('aria-label', `${link.textContent.trim()} (새 창)`);
    });
  }

  function enhanceContent() {
    frame = null;
    enhanceTables(main);
    const panel = document.getElementById('lg-content');
    enhanceTables(panel);
    const leagueView = document.body.dataset.view === 'league';
    const transactionView = document.body.dataset.view === 'transactions';
    const txContent = document.getElementById('tx-content');
    const root = transactionView ? txContent : leagueView ? panel : main;
    const busy = Boolean(root.querySelector('.spin, .is-loading'));
    main.setAttribute('aria-busy', String(!leagueView && busy));
    panel.setAttribute('aria-busy', String(leagueView && busy));
    txContent.setAttribute('aria-busy', String(transactionView && busy));
    if (document.body.dataset.view === 'search') return;
    const count = root.querySelectorAll('.prof').length;
    const status = busy ? '기록을 불러오고 있어요.' : transactionView
      ? (root.querySelector('.tx-empty, .tx-error')?.textContent || `${(window.txCurrentLeague || '').toUpperCase()} 이적·등록 소식을 불러왔어요.`)
      : leagueView
      ? `${(_lgCur || '').toUpperCase()} ${_lgTab === 'standings' ? '리그 순위' : '경기 일정'} 조회를 마쳤어요.`
      : count ? `${input.value} 검색 결과 ${count}건을 불러왔어요.`
        : (root.querySelector('.sbox p, .lg-err')?.textContent || '조회 결과를 확인하세요.');
    if (announcement !== status) {
      announcement = status;
      document.getElementById('app-announcement').textContent = status;
    }
  }

  function scheduleEnhancement() {
    if (frame === null) frame = requestAnimationFrame(enhanceContent);
  }
  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(main, {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
  observer.observe(document.getElementById('lg-panel'), {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
  observer.observe(document.getElementById('tx-panel'), {childList: true, subtree: true, attributes: true, attributeFilter: ['class']});
  window.addEventListener('resize', scheduleEnhancement);
  input.addEventListener('input', syncInput);
  document.fonts.ready.then(scheduleEnhancement);

  document.addEventListener('DOMContentLoaded', () => {
    const today = new Date();
    const date = document.getElementById('header-date');
    date.dateTime = _lgDateApi(today);
    date.textContent = today.toLocaleDateString('ko-KR', {year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'});
    window.appSyncTheme();
    window.appToggleMenu(false, false);
    renderHistory();
    syncInput();
    scheduleEnhancement();
  });
})();
