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
#   # 個別指定（bare 名は hrmcngs を補完、OWNER/NAME 形式で他 owner も指定可）
#   PAT=ghp_xxxx ./scripts/setup-dispatch.sh \
#     MC-Mod-Utility ShelfMod Drowse-Lab/The-four-primitives-and-Weapons
#
#   # デフォルト owner 群（hrmcngs + Drowse-Lab）の全リポを一括適用:
#   PAT=ghp_xxxx ./scripts/setup-dispatch.sh --all
#
#   # owner を明示して全リポ:
#   PAT=ghp_xxxx ./scripts/setup-dispatch.sh --all hrmcngs Drowse-Lab some-org
#
# 既存の notify-charts.yml がある場合は上書き更新する。

set -euo pipefail

DEFAULT_OWNER="hrmcngs"
DEFAULT_ALL_OWNERS=("hrmcngs" "Drowse-Lab")
CENTRAL="hrmcngs/hrmc.ngs.computer"

# --force: 既に notify-charts.yml がある repo も上書き更新する
# （未指定だと既存ファイルがあればスキップ＝idempotent）
FORCE=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --force|-f) FORCE=1 ;;
    *) ARGS+=("$a") ;;
  esac
done
set -- "${ARGS[@]:-}"
# bash 3 で空配列展開を避けるための置換
[ "${1:-}" = "" ] && [ ${#ARGS[@]} -eq 0 ] && set --

# PAT は環境変数 PAT で明示指定可。未指定なら gh CLI の auth token に
# 自動フォールバック（`gh auth token` が repo スコープを持っていれば dispatch 可）
PAT_SOURCE="env PAT"
if [ -z "${PAT:-}" ]; then
  if command -v gh >/dev/null 2>&1; then
    PAT="$(gh auth token 2>/dev/null || true)"
    PAT_SOURCE="gh auth token"
  fi
fi
if [ -z "${PAT:-}" ]; then
  cat <<EOF >&2
ERROR: 認証トークンが取得できません。

どちらかを満たしてください:
  (A) gh CLI でログイン:   gh auth login   (scope: repo / workflow)
  (B) PAT を明示指定:      PAT=ghp_xxxxxxxx $0 ...

PAT 作成: https://github.com/settings/tokens
  scope: classic→repo / fine-grained→Actions: Read & write on ${CENTRAL}

Usage:
  $0 repo1 [repo2 ...]
  $0 --all                # 未設置のリポだけ自動で設置（既存はスキップ）
  $0 --all --force        # 既存も上書き更新
EOF
  exit 1
fi
echo "→ 認証トークン: ${PAT:0:7}…  (取得元: $PAT_SOURCE)" >&2

# --all [owner...]: 指定 owner 群（省略時はデフォルト）の全リポを対象にする
# 除外: archive / fork / 中央リポ自身 / 名前が "-" で始まる / .github 系 (org meta)
# macOS の system bash 3.2 には mapfile が無いので while read で代用
if [ "${1:-}" = "--all" ]; then
  shift
  if [ $# -gt 0 ]; then
    ALL_OWNERS=("$@")
  else
    ALL_OWNERS=("${DEFAULT_ALL_OWNERS[@]}")
  fi
  echo "→ owners: ${ALL_OWNERS[*]} のリポジトリを列挙中…" >&2
  REPOS=()
  for OWN in "${ALL_OWNERS[@]}"; do
    while IFS= read -r name; do
      [ -z "$name" ] && continue
      FULLNAME="$OWN/$name"
      [ "$FULLNAME" = "$CENTRAL" ] && { echo "  (skip: $FULLNAME — 中央リポ自身)" >&2; continue; }
      case "$name" in
        -*)        echo "  (skip: $FULLNAME — 名前が '-' で始まる)" >&2; continue ;;
        .github|.github-private) echo "  (skip: $FULLNAME — org meta repo)" >&2; continue ;;
      esac
      REPOS+=("$FULLNAME")
    done < <(gh repo list "$OWN" --limit 200 \
      --json name,isArchived,isFork \
      --jq '.[] | select(.isArchived==false and .isFork==false) | .name')
  done
  if [ ${#REPOS[@]} -eq 0 ]; then
    echo "ERROR: 対象リポジトリが見つかりませんでした。" >&2
    exit 1
  fi
  echo "→ 対象 ${#REPOS[@]} 件" >&2
  set -- "${REPOS[@]}"
fi

if [ $# -eq 0 ]; then
  echo "ERROR: 対象リポジトリ名を1つ以上指定してください（または --all）。" >&2
  exit 1
fi

# NOTE: bash の `$(cat <<...)` 構文は `\<改行>` を line-continuation として
# 解釈して取り除いてしまうため、関数定義として書いてパイプで base64 に流す。
workflow_body() {
  cat <<'YAML'
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
}

ENCODED=$(workflow_body | base64 | tr -d '\n')

FAILED=()
SKIPPED_EXISTING=0
for ARG in "$@"; do
  # bare 名は DEFAULT_OWNER を補完、OWNER/REPO 形式ならそのまま
  case "$ARG" in
    */*) FULL="$ARG" ;;
    *)   FULL="$DEFAULT_OWNER/$ARG" ;;
  esac
  echo
  echo "──────── $FULL ────────"

  # リポジトリ情報を取得（空 / archive 等を判定）
  REPO_JSON="$(gh api "repos/$FULL" 2>/dev/null || true)"
  if [ -z "$REPO_JSON" ]; then
    echo "  ✗ リポジトリが見つからないかアクセスできません — スキップ"
    FAILED+=("$FULL (not found)")
    continue
  fi

  IS_EMPTY="$(printf '%s' "$REPO_JSON" | jq -r '.size==0')"
  IS_ARCHIVED="$(printf '%s' "$REPO_JSON" | jq -r '.archived')"
  DEFAULT_BRANCH="$(printf '%s' "$REPO_JSON" | jq -r '.default_branch')"

  if [ "$IS_ARCHIVED" = "true" ]; then
    echo "  ⊘ archive 済みなのでスキップ"
    continue
  fi
  if [ "$IS_EMPTY" = "true" ]; then
    echo "  ⊘ コミットが1つも無い（空リポ）のでスキップ"
    continue
  fi

  # 既存ファイルチェック → デフォルトでは設置済みリポをスキップ（idempotent）
  EXISTING_SHA="$(gh api "repos/$FULL/contents/.github/workflows/notify-charts.yml?ref=$DEFAULT_BRANCH" \
    --jq '.sha // empty' 2>/dev/null || true)"
  if [[ ! "$EXISTING_SHA" =~ ^[a-f0-9]{40,64}$ ]]; then
    EXISTING_SHA=""
  fi
  if [ -n "$EXISTING_SHA" ] && [ "$FORCE" -eq 0 ]; then
    echo "  ⊘ notify-charts.yml 設置済み — スキップ (--force で上書き)"
    SKIPPED_EXISTING=$((SKIPPED_EXISTING+1))
    continue
  fi
  echo "  · default branch = $DEFAULT_BRANCH"

  echo "  · CHARTS_TRIGGER_TOKEN secret を設定…"
  SEC_ERR="$(gh secret set CHARTS_TRIGGER_TOKEN --repo "$FULL" --body "$PAT" 2>&1 1>/dev/null || true)"
  if [ -z "$SEC_ERR" ]; then
    echo "    ✓ 設定完了"
  else
    echo "    ✗ secret 設定に失敗:"
    echo "      $SEC_ERR" | head -3 | sed 's/^/      /'
    FAILED+=("$FULL (secret)")
    continue
  fi

  if [ -n "$EXISTING_SHA" ]; then
    MSG="ci: update chart-update dispatcher"
    PAYLOAD=$(printf '{"message":"%s","branch":"%s","content":"%s","sha":"%s"}' \
      "$MSG" "$DEFAULT_BRANCH" "$ENCODED" "$EXISTING_SHA")
    echo "  · notify-charts.yml を更新…"
  else
    MSG="ci: add chart-update dispatcher"
    PAYLOAD=$(printf '{"message":"%s","branch":"%s","content":"%s"}' \
      "$MSG" "$DEFAULT_BRANCH" "$ENCODED")
    echo "  · notify-charts.yml を新規作成…"
  fi

  PUT_ERR="$(echo "$PAYLOAD" | gh api -X PUT \
    "repos/$FULL/contents/.github/workflows/notify-charts.yml" --input - 2>&1 1>/dev/null || true)"
  if [ -z "$PUT_ERR" ]; then
    echo "    ✓ workflow ファイル設置完了"
  else
    echo "    ✗ workflow 設置に失敗:"
    printf '%s\n' "$PUT_ERR" | head -5 | sed 's/^/      /'
    FAILED+=("$FULL (workflow)")
  fi
done

echo
if [ "$SKIPPED_EXISTING" -gt 0 ]; then
  echo "⊘ 既に設置済みでスキップ: $SKIPPED_EXISTING 件 (上書きするなら --force)"
fi
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "✅ 完了"
else
  echo "⚠ 失敗したリポジトリ: ${FAILED[*]}"
fi

echo "対象リポジトリに push があると、即座に $CENTRAL の Update chart SVGs が走ります。"
