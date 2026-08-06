(() => {
  'use strict';

  const endpoint = 'https://api.counterapi.dev/v1/hrmc-ngs-computer/home/up';

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

      // DevTools の Console から window.pageAccessCount でも確認できます。
      window.pageAccessCount = count;
      console.info(`[Access Count] ${count.toLocaleString('ja-JP')} views`);
    } catch (error) {
      console.warn('[Access Count] アクセス数を取得できませんでした', error);
    }
  }

  updateAccessCount();
})();
