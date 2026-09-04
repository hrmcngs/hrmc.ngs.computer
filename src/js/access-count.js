(() => {
  'use strict';

  // カウンターは Abacus を使う（無登録・APIキー不要・CORS対応）。
  // 以前使っていた CounterAPI v1 は廃止され HTTP 410 を返すようになった。v2 は
  // サインアップと APIキーが必須で、クライアントサイドJSに置くと公開されてしまう
  // ため採用していない。
  //   GET /hit/:namespace/:key → {"value": N}（1リクエストで +1）
  //   docs: https://v2.jasoncameron.dev/abacus
  // 移行時に旧カウンターの値 19 を initializer で引き継いでいる。
  const NAMESPACE = 'hrmc-ngs-computer';
  const COUNTER   = 'home';
  const endpoint = `https://abacus.jasoncameron.dev/hit/${NAMESPACE}/${COUNTER}`;
  const DAILY_COUNTER_PREFIX = `${COUNTER}-daily`;
  const DAILY_TIME_ZONE = 'Asia/Tokyo';
  const cacheKey = 'page-access-count';
  const detailsCacheKey = 'page-access-details';
  const historyCacheKey = 'page-access-history';
  const dailyHistoryCacheKey = 'page-daily-access-history';

  function getDateKey(value = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: DAILY_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function formatDate(value) {
    if (!value) return '不明';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '不明';
    return date.toLocaleString('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short',
    });
  }

  function showDetails(details, cached = false) {
    window.pageAccessCount = details.count;
    window.pageTodayAccessCount = Number.isFinite(details.todayCount) ? details.todayCount : null;
    window.pageAccessDetails = details;
    const totalElement = document.getElementById('access-watcher-total');
    const todayElement = document.getElementById('access-watcher-today');
    if (totalElement) totalElement.textContent = details.count.toLocaleString('ja-JP');
    if (todayElement) {
      todayElement.textContent = Number.isFinite(details.todayCount)
        ? details.todayCount.toLocaleString('ja-JP')
        : '---';
    }
    console.group(`[Access Count] ${details.count.toLocaleString('ja-JP')} views${cached ? ' (前回値)' : ''}`);
    // Abacus は値以外のメタ情報を返さないため、取れなかった項目は行ごと省く。
    const rows = {
      'アクセス数': details.count,
      '今回の取得日時': formatDate(details.fetchedAt),
    };
    if (Number.isFinite(details.todayCount)) {
      rows[`今日のアクセス数 (${details.todayDate})`] = details.todayCount;
    }
    if (details.updatedAt) rows['API上の更新日時'] = formatDate(details.updatedAt);
    if (details.createdAt) rows['カウンター作成日時'] = formatDate(details.createdAt);
    rows['対象ページ'] = details.page;
    rows['カウンター名'] = details.counter;
    if (details.todayCounter) rows['今日のカウンター名'] = details.todayCounter;
    rows['取得元'] = cached ? 'ブラウザキャッシュ' : details.source;
    console.table(rows);
    console.groupEnd();
    showGraph(loadHistory());
    showDailyHistory(loadDailyHistory());
  }

  function loadHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(historyCacheKey));
      return Array.isArray(history) ? history : [];
    } catch (error) {
      return [];
    }
  }

  function saveHistory(count, fetchedAt) {
    const history = loadHistory();
    const date = new Date(fetchedAt).toLocaleDateString('sv-SE');
    const entry = { date, count, fetchedAt };
    const sameDayIndex = history.findIndex(item => item.date === date);
    if (sameDayIndex >= 0) history[sameDayIndex] = entry;
    else history.push(entry);
    const latest = history
      .filter(item => item && typeof item.date === 'string' && Number.isFinite(item.count))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
    try {
      localStorage.setItem(historyCacheKey, JSON.stringify(latest));
    } catch (error) {
      // localStorageが無効でも今回分のグラフは表示する。
    }
    window.pageAccessHistory = latest;
    return latest;
  }

  function loadDailyHistory() {
    try {
      const history = JSON.parse(localStorage.getItem(dailyHistoryCacheKey));
      return Array.isArray(history) ? history : [];
    } catch (error) {
      return [];
    }
  }

  function saveDailyHistory(date, count, fetchedAt) {
    const history = loadDailyHistory();
    const entry = { date, count, fetchedAt };
    const sameDayIndex = history.findIndex(item => item.date === date);
    if (sameDayIndex >= 0) history[sameDayIndex] = entry;
    else history.push(entry);
    const latest = history
      .filter(item => item && typeof item.date === 'string' && Number.isFinite(item.count))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
    try {
      localStorage.setItem(dailyHistoryCacheKey, JSON.stringify(latest));
    } catch (error) {
      // localStorageが無効でも今回分は表示する。
    }
    window.pageDailyAccessHistory = latest;
    return latest;
  }

  function showGraph(history) {
    if (!history.length) return;
    window.pageAccessHistory = history;
    const max = Math.max(...history.map(item => item.count), 1);
    console.group('[Access Count Graph] 累計viewsの推移（最大30日）');
    history.forEach(item => {
      const width = Math.max(1, Math.round((item.count / max) * 30));
      const bar = '█'.repeat(width);
      console.log(`${item.date} | ${bar} ${item.count.toLocaleString('ja-JP')}`);
    });
    console.groupEnd();
  }

  function showDailyHistory(history) {
    if (!history.length) return;
    window.pageDailyAccessHistory = history;
    const max = Math.max(...history.map(item => item.count), 1);
    console.group('[Daily Access Count] 日にちごとのアクセス数（最大30日）');
    console.table(history.map(item => ({
      '日付': item.date,
      'アクセス数': item.count,
      '最終取得日時': formatDate(item.fetchedAt),
    })));
    history.forEach(item => {
      const width = Math.max(1, Math.round((item.count / max) * 30));
      console.log(`${item.date} | ${'█'.repeat(width)} ${item.count.toLocaleString('ja-JP')}`);
    });
    console.groupEnd();
  }

  // APIを待たず、前回取得した値を先に表示する。
  try {
    const cachedDetails = JSON.parse(localStorage.getItem(detailsCacheKey));
    if (cachedDetails && Number.isFinite(cachedDetails.count)) {
      // 日付をまたいだ場合、前日の値を「今日」として一瞬表示しない。
      if (cachedDetails.todayDate !== getDateKey()) {
        delete cachedDetails.todayCount;
        delete cachedDetails.todayDate;
        delete cachedDetails.todayCounter;
      }
      showDetails(cachedDetails, true);
    } else {
      const cachedCount = Number(localStorage.getItem(cacheKey));
      if (Number.isFinite(cachedCount) && cachedCount > 0) {
        showDetails({
          count: cachedCount,
          fetchedAt: null,
          updatedAt: null,
          createdAt: null,
          page: location.pathname,
          counter: `${NAMESPACE} / ${COUNTER}`,
          source: 'Abacus',
        }, true);
      }
    }
  } catch (error) {
    // localStorageが無効でもカウンター取得は続ける。
  }

  async function updateAccessCount() {
    try {
      const todayDate = getDateKey();
      const todayCounterKey = `${DAILY_COUNTER_PREFIX}-${todayDate}`;
      const todayEndpoint = `https://abacus.jasoncameron.dev/hit/${NAMESPACE}/${todayCounterKey}`;
      const [response, todayResponse] = await Promise.all([
        fetch(endpoint, { cache: 'no-store' }),
        fetch(todayEndpoint, { cache: 'no-store' }),
      ]);
      if (!response.ok) throw new Error(`累計カウンター: HTTP ${response.status}`);
      if (!todayResponse.ok) throw new Error(`日別カウンター: HTTP ${todayResponse.status}`);

      const [data, todayData] = await Promise.all([response.json(), todayResponse.json()]);
      const count = Number(data.value ?? data.count);
      const todayCount = Number(todayData.value ?? todayData.count);
      if (!Number.isFinite(count) || !Number.isFinite(todayCount)) {
        throw new Error('カウンターAPIから不正な値が返されました');
      }

      const fetchedAt = new Date().toISOString();
      const details = {
        count,
        todayCount,
        todayDate,
        fetchedAt,
        // /hit はこのリクエスト自体がカウンターを更新するので更新日時＝取得日時。
        updatedAt: fetchedAt,
        createdAt: null,
        page: location.pathname,
        counter: `${NAMESPACE} / ${COUNTER}`,
        todayCounter: `${NAMESPACE} / ${todayCounterKey}`,
        source: 'Abacus (live)',
      };

      try {
        localStorage.setItem(cacheKey, String(count));
        localStorage.setItem(detailsCacheKey, JSON.stringify(details));
      } catch (error) {
        // localStorageが無効でもConsole表示は続ける。
      }
      saveHistory(count, details.fetchedAt);
      saveDailyHistory(todayDate, todayCount, details.fetchedAt);
      showDetails(details);
    } catch (error) {
      console.warn('[Access Count] アクセス数を取得できませんでした', error);
    }
  }

  // 遅い外部APIがページ本体の読み込みと競合しないよう、表示完了後に更新する。
  function scheduleUpdate() {
    const run = () => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(updateAccessCount, { timeout: 3000 });
      } else {
        window.setTimeout(updateAccessCount, 1000);
      }
    };
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  scheduleUpdate();
})();
