#!/usr/bin/env sh
# --------------------------------------------------------------------------
# ローカル開発用サーバーを起動する。
#
#   ./serve.sh          → http://localhost:8000/ で表示
#   ./serve.sh 3000     → ポート番号を指定して起動
#
# 停止: Ctrl+C
# --------------------------------------------------------------------------
set -e

PORT="${1:-8000}"

# このスクリプトの置かれているディレクトリ（＝サイトのルート）へ移動
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# 既に同じポートを使っているプロセスがあれば停止する
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -ti "tcp:$PORT" 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    echo "ポート $PORT を使用中のプロセスを停止します: $PIDS"
    # shellcheck disable=SC2086
    kill $PIDS 2>/dev/null || true
    sleep 1
  fi
fi

echo "http://localhost:$PORT/ で起動します（停止: Ctrl+C）"

# 利用できるものでサーバーを起動（python3 → python → npx serve の順）
if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  exec python -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  exec npx --yes serve -l "$PORT" .
else
  echo "エラー: python3 / python / npx のいずれも見つかりません。" >&2
  exit 1
fi
