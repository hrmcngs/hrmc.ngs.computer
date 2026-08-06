(() => {
  'use strict';

  const endpoint = 'https://api.counterapi.dev/v1/hrmc-ngs-computer/home/up';
  const cacheKey = 'page-access-count';
  const detailsCacheKey = 'page-access-details';
  const historyCacheKey = 'page-access-history';

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
    window.pageAccessDetails = details;
    console.group(`[Access Count] ${details.count.toLocaleString('ja-JP')} views${cached ? ' (前回値)' : ''}`);
    console.table({
      'アクセス数': details.count,
      '今回の取得日時': formatDate(details.fetchedAt),
      'API上の更新日時': formatDate(details.updatedAt),
      'カウンター作成日時': formatDate(details.createdAt),
      '対象ページ': details.page,
      'カウンター名': details.counter,
      '取得元': cached ? 'ブラウザキャッシュ' : details.source,
    });
    console.groupEnd();
    showGraph(loadHistory());
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

  // APIを待たず、前回取得した値を先に表示する。
  try {
    const cachedDetails = JSON.parse(localStorage.getItem(detailsCacheKey));
    if (cachedDetails && Number.isFinite(cachedDetails.count)) {
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
          counter: 'hrmc-ngs-computer / home',
          source: 'CounterAPI',
        }, true);
      }
    }
  } catch (error) {
    // localStorageが無効でもカウンター取得は続ける。
  }

  async function updateAccessCount() {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const count = Number(data.count ?? data.value);
      if (!Number.isFinite(count)) {
        throw new Error('カウンターAPIから不正な値が返されました');
      }

      const details = {
        count,
        fetchedAt: new Date().toISOString(),
        updatedAt: data.updated_at ?? null,
        createdAt: data.created_at ?? null,
        page: location.pathname,
        counter: `${data.namespace?.name ?? 'hrmc-ngs-computer'} / ${data.name ?? 'home'}`,
        source: 'CounterAPI (live)',
      };

      try {
        localStorage.setItem(cacheKey, String(count));
        localStorage.setItem(detailsCacheKey, JSON.stringify(details));
      } catch (error) {
        // localStorageが無効でもConsole表示は続ける。
      }
      saveHistory(count, details.fetchedAt);
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
