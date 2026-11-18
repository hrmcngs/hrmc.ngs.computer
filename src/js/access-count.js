(() => {
  'use strict';

  const eyeButton = document.querySelector('.access-watcher-character');
  const eyeMessage = document.querySelector('.access-watcher-message');
  if (eyeButton && eyeMessage) {
    const originalMessage = eyeMessage.innerHTML;
    let restoreTimer;
    eyeButton.addEventListener('click', () => {
      window.clearTimeout(restoreTimer);
      eyeMessage.textContent = '痛いよ';
      // 涙と閉じた目を同じ状態で表示し、連打時は復帰時刻だけ延長する。
      eyeButton.classList.add('is-crying');
      restoreTimer = window.setTimeout(() => {
        eyeMessage.innerHTML = originalMessage;
        eyeButton.classList.remove('is-crying');
      }, 2000);
    });
  }

  // Count APIは無登録・APIキー不要・CORS対応。
  //   GET /api/v1/hit/:key → {"value": "N"}（1リクエストで +1）
  //   docs: https://countapi.mileshilliard.com/
  // Abacus停止時に表示していた941を、新カウンターの初回値として引き継ぐ。
  const COUNTER = 'hrmc_ngs_computer_home_total_v2';
  const TOTAL_OFFSET = 940;
  const endpoint = `https://countapi.mileshilliard.com/api/v1/hit/${COUNTER}`;
  const DAILY_COUNTER_PREFIX = 'hrmc_ngs_computer_home_daily';
  const DAILY_TIME_ZONE = 'Asia/Tokyo';
  const cacheKey = 'page-access-count';
  const detailsCacheKey = 'page-access-details';
  const historyCacheKey = 'page-access-history';
  const dailyHistoryCacheKey = 'page-daily-access-history';
  const REQUEST_TIMEOUT = 8000;

  async function fetchCounter(url) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const value = Number(data.value ?? data.count);
      if (!Number.isFinite(value)) throw new Error('APIから不正な値が返されました');
      return value;
    } finally {
      window.clearTimeout(timeout);
    }
  }

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
    const hasTotal = Number.isFinite(details.count);
    window.pageAccessCount = hasTotal ? details.count : null;
    window.pageTodayAccessCount = Number.isFinite(details.todayCount) ? details.todayCount : null;
    window.pageAccessDetails = details;
    const totalElement = document.getElementById('access-watcher-total');
    const todayElement = document.getElementById('access-watcher-today');
    if (totalElement) {
      totalElement.textContent = hasTotal ? details.count.toLocaleString('ja-JP') : '---';
    }
    if (todayElement) {
      todayElement.textContent = Number.isFinite(details.todayCount)
        ? details.todayCount.toLocaleString('ja-JP')
        : '---';
    }
    console.group(`[Access Count] ${hasTotal ? details.count.toLocaleString('ja-JP') : '取得失敗'} views${cached ? ' (前回値)' : ''}`);
    // APIは値以外のメタ情報を返さないため、取れなかった項目は行ごと省く。
    const rows = { '今回の取得日時': formatDate(details.fetchedAt) };
    if (hasTotal) rows['アクセス数'] = details.count;
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
          counter: COUNTER,
          source: 'ブラウザキャッシュ',
        }, true);
      }
    }
  } catch (error) {
    // localStorageが無効でもカウンター取得は続ける。
  }

  async function updateAccessCount() {
    const todayDate = getDateKey();
    const todayCounterKey = `${DAILY_COUNTER_PREFIX}_${todayDate.replaceAll('-', '_')}`;
    const todayEndpoint = `https://countapi.mileshilliard.com/api/v1/hit/${todayCounterKey}`;
    const [totalResult, todayResult] = await Promise.allSettled([
      fetchCounter(endpoint).then(value => value + TOTAL_OFFSET),
      fetchCounter(todayEndpoint),
    ]);

    let cachedDetails = {};
    try {
      cachedDetails = JSON.parse(localStorage.getItem(detailsCacheKey)) || {};
    } catch (error) {
      // localStorageが無効でも取得結果の表示は続ける。
    }

    const legacyCachedCount = Number(localStorage.getItem(cacheKey));
    const fallbackCount = Number.isFinite(cachedDetails.count)
      ? cachedDetails.count
      : legacyCachedCount;
    const count = totalResult.status === 'fulfilled'
      ? totalResult.value
      : fallbackCount;
    const cachedTodayCount = cachedDetails.todayDate === todayDate
      ? cachedDetails.todayCount
      : undefined;
    const todayCount = todayResult.status === 'fulfilled'
      ? todayResult.value
      : cachedTodayCount;

    if (!Number.isFinite(count) && !Number.isFinite(todayCount)) {
      console.warn('[Access Count] 累計・今日ともに取得できませんでした', {
        total: totalResult.reason,
        today: todayResult.reason,
      });
      return;
    }

    const fetchedAt = new Date().toISOString();
    const details = {
      count,
      todayCount: Number.isFinite(todayCount) ? todayCount : null,
      todayDate: Number.isFinite(todayCount) ? todayDate : null,
      fetchedAt,
      // /hitはこのリクエスト自体がカウンターを更新するので更新日時＝取得日時。
      updatedAt: fetchedAt,
      createdAt: null,
      page: location.pathname,
      counter: COUNTER,
      todayCounter: todayCounterKey,
      source: 'Count API (live)',
    };

    try {
      if (Number.isFinite(count)) {
        localStorage.setItem(cacheKey, String(count));
      }
      localStorage.setItem(detailsCacheKey, JSON.stringify(details));
    } catch (error) {
      // localStorageが無効でもConsole表示は続ける。
    }
    if (totalResult.status === 'fulfilled') saveHistory(count, details.fetchedAt);
    if (todayResult.status === 'fulfilled') saveDailyHistory(todayDate, todayCount, details.fetchedAt);
    showDetails(details);
    if (totalResult.status === 'rejected') {
      console.warn('[Access Count] 累計を更新できなかったため前回値を表示します', totalResult.reason);
    }
    if (todayResult.status === 'rejected') {
      console.warn('[Access Count] 今日を更新できなかったため同日の前回値を表示します', todayResult.reason);
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
