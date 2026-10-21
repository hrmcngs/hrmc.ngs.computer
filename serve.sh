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

# SBCLで静的ファイルとライブ写真カタログを配信する。
if ! command -v sbcl >/dev/null 2>&1; then
  echo "エラー: SBCLが必要です（macOS: brew install sbcl / Ubuntu: sudo apt-get install sbcl）。" >&2
  exit 1
fi
exec sbcl --script scripts/photo-catalog.lisp --serve "$PORT"
