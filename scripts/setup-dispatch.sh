#!/usr/bin/env bash
# 指定した「主要リポジトリ」群に対して、push があれば
# hrmcngs/hrmc.ngs.computer のチャート更新を即時トリガーする仕組みを設置する。
#
# 各リポに以下を作成/更新:
#   1. .github/workflows/notify-charts.yml       (push → repository_dispatch)
#   2. シークレット CHARTS_TRIGGER_TOKEN          (中央リポへの API 呼び出し用 PAT)
#
# 事前準備:
#   - https://github.com/settings/tokens で Personal Access Token を作成
#     スコープ: classic なら `repo`、fine-grained なら
#       Repository: hrmcngs/hrmc.ngs.computer のみ / Permissions: Actions=Read and write
#   - その PAT を環境変数 PAT に入れて実行
#
# 使い方:
#   PAT=ghp_xxxxxxxxxxxxxxxxxx ./scripts/setup-dispatch.sh \
#     MC-Mod-Utility ShelfMod github-stats-charts Akuas-Mystic-Blade-Mod
#
# 既存の notify-charts.yml がある場合は上書き更新する。

set -euo pipefail

OWNER="hrmcngs"
CENTRAL="hrmcngs/hrmc.ngs.computer"

if [ -z "${PAT:-}" ]; then
  cat <<EOF >&2
ERROR: 環境変数 PAT が未設定です。

Usage:
  PAT=ghp_xxxxxxxxxxxxxxxxxx $0 repo1 [repo2 ...]

PAT は ${CENTRAL} の Actions を起動できる Personal Access Token です。
作成: https://github.com/settings/tokens
EOF
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "ERROR: 対象リポジトリ名を1つ以上指定してください。" >&2
  exit 1
fi

WORKFLOW_BODY=$(cat <<'YAML'
name: Notify chart updater

# このリポジトリへの push を hrmcngs/hrmc.ngs.computer にディスパッチして
# チャート再生成を即時トリガーする。

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions: {}

concurrency:
  group: notify-charts
  cancel-in-progress: true

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch chart update
        env:
          TOKEN: ${{ secrets.CHARTS_TRIGGER_TOKEN }}
        run: |
          if [ -z "$TOKEN" ]; then
            echo "CHARTS_TRIGGER_TOKEN が未設定のためスキップ"
            exit 0
          fi
          curl -fsSL -X POST \
            -H "Authorization: Bearer $TOKEN" \
            -H "Accept: application/vnd.github+json" \
            -H "X-GitHub-Api-Version: 2022-11-28" \
            https://api.github.com/repos/hrmcngs/hrmc.ngs.computer/dispatches \
            -d '{"event_type":"user-commit","client_payload":{"repo":"${{ github.repository }}","sha":"${{ github.sha }}"}}'
YAML
)

ENCODED=$(printf '%s\n' "$WORKFLOW_BODY" | base64 | tr -d '\n')

for NAME in "$@"; do
  FULL="$OWNER/$NAME"
  echo
  echo "──────── $FULL ────────"

  if ! gh repo view "$FULL" >/dev/null 2>&1; then
    echo "  ✗ リポジトリが見つからないかアクセスできません — スキップ"
    continue
  fi

  echo "  · CHARTS_TRIGGER_TOKEN secret を設定…"
  if gh secret set CHARTS_TRIGGER_TOKEN --repo "$FULL" --body "$PAT" >/dev/null; then
    echo "    ✓ 設定完了"
  else
    echo "    ✗ secret 設定に失敗 — スキップ"
    continue
  fi

  # 既存ファイルの sha（あれば update、無ければ create）
  EXISTING_SHA="$(gh api "repos/$FULL/contents/.github/workflows/notify-charts.yml" \
    --jq '.sha' 2>/dev/null || true)"

  if [ -n "$EXISTING_SHA" ]; then
    MSG="ci: update chart-update dispatcher"
    PAYLOAD=$(printf '{"message":"%s","content":"%s","sha":"%s"}' "$MSG" "$ENCODED" "$EXISTING_SHA")
    echo "  · .github/workflows/notify-charts.yml を更新…"
  else
    MSG="ci: add chart-update dispatcher"
    PAYLOAD=$(printf '{"message":"%s","content":"%s"}' "$MSG" "$ENCODED")
    echo "  · .github/workflows/notify-charts.yml を作成…"
  fi

  if echo "$PAYLOAD" | gh api -X PUT "repos/$FULL/contents/.github/workflows/notify-charts.yml" --input - >/dev/null; then
    echo "    ✓ workflow ファイル設置完了"
  else
    echo "    ✗ workflow 設置に失敗"
  fi
done

echo
echo "完了。"
echo "対象リポジトリに push があると、即座に $CENTRAL の Update chart SVGs が走ります。"
