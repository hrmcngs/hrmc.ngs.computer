#!/usr/bin/env bash
# VS Code を開いている間、定期的に upstream を確認して fast-forward 可能なら自動 pull する。
# folderOpen タスクから起動され、ワークスペースを閉じるまでバックグラウンドで走り続ける。
#
# 安全策:
#   - fetch で更新がある場合のみ pull する（無駄なリベース作業を避ける）
#   - LOCAL が REMOTE の祖先 (= 真の fast-forward) のときだけ pull
#     → ローカル独自コミットがある場合 / 過去版を checkout 中は何もしない
#   - --autostash で未コミット変更を一時退避してから pull
#   - 取得失敗は静かに無視（オフライン時等）
#
# 環境変数 AUTO_PULL_INTERVAL で秒数を上書き可（デフォルト 300 = 5分）

set -u
cd "$(dirname "$0")/.."

INTERVAL="${AUTO_PULL_INTERVAL:-300}"
echo "[auto-pull] watching (every ${INTERVAL}s) in $(pwd)"

while true; do
  if git fetch --quiet 2>/dev/null; then
    LOCAL="$(git rev-parse HEAD 2>/dev/null || true)"
    REMOTE="$(git rev-parse '@{u}' 2>/dev/null || true)"
    if [ -n "$LOCAL" ] && [ -n "$REMOTE" ] && [ "$LOCAL" != "$REMOTE" ]; then
      BASE="$(git merge-base HEAD '@{u}' 2>/dev/null || true)"
      if [ "$LOCAL" = "$BASE" ]; then
        echo "[auto-pull] $(date '+%H:%M:%S') upstream is ahead → pulling…"
        if git pull --rebase --autostash --quiet; then
          echo "[auto-pull] pulled to $(git rev-parse --short HEAD)"
        else
          echo "[auto-pull] pull failed (左記の状態を維持します)"
        fi
      else
        # diverged or local-ahead → 何もしない（手動で解決させる）
        :
      fi
    fi
  fi
  sleep "$INTERVAL"
done
