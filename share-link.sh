#!/bin/sh
# 共有リンクを作成する（Node.js が必要）。リポジトリのルートから実行。
#
# 対話形式でWebテーマ・背景・カード・色・明暗を選ぶ:
#   sh share-link.sh
# 番号または名前を入力し、Enterで初期値を採用。
# 初期値: macOS / 季節自動 / 端末の明暗設定に追従。
#
# 引数で指定し、質問なしでURLを出力:
#   sh share-link.sh --palette engraving --appearance dark
#   sh share-link.sh --theme macos --palette seasonal --season autumn --appearance light
#   sh share-link.sh --palette ghost --appearance dark | pbcopy
#   sh share-link.sh --url 'https://hrmc.ngs.computer/photos/#album'
#   sh share-link.sh --help
#
# --theme: theme.jsonc のプリセット名
# --site / --card: 背景・カードを個別指定（プリセットより優先）
# --palette: seasonal / classic / ghost / mono / ocean / rose / engraving
# --appearance: system / light / dark
# --season: auto / spring / summer / autumn / winter（季節配色の場合）
# --url: 共有するページ。その他のクエリやアンカーは維持。
# --interactive: 引数の値を初期値として対話形式で選ぶ。
#
# URLのみを標準出力に、案内を標準エラー出力に表示する。
# サイト設定の変更やリンクの送信は行わない。
#
# 動作確認:
#   node scripts/test-share-link.cjs
#   node scripts/test-theme-links.cjs
set -eu
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js が必要です。Node.js をインストールしてから実行してください。' >&2
  exit 1
fi
share_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec node "$share_script_dir/scripts/create-theme-link.cjs" "$@"
