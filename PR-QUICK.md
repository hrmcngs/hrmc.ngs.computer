# PR-Quick — co-author 付き PR を一発で merge

GitHub の **Pair Extraordinaire** achievement（共著 PR の累計マージ数）を稼ぐための git alias セットアップ。
`git pr-quick "メッセージ"` 1 行で **ブランチ作成 → commit（co-author 付き）→ push → PR → auto-merge → main に戻る** までを自動化する。

## 共著者

| 項目 | 値 |
|---|---|
| GitHub ID | `aya526dev` |
| numeric id | `165481574` |
| trailer | `Co-Authored-By: aya526dev <165481574+aya526dev@users.noreply.github.com>` |

## セットアップ（1回だけ）

```bash
git config --global alias.pr-quick '!f() {
  set -e
  MSG="${1:-chore: update}"
  BR="pair/$(date +%Y%m%d-%H%M%S)"
  MAIN="$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed s@^refs/remotes/origin/@@)"
  : "${MAIN:=main}"
  echo "→ branch: $BR (base: $MAIN)"
  git switch "$MAIN" >/dev/null
  git pull --rebase --autostash >/dev/null 2>&1 || true
  git switch -c "$BR"
  git add -A
  if git diff --cached --quiet; then
    echo "  ⊘ 変更なし — 中断"; git switch "$MAIN"; git branch -D "$BR"; exit 1
  fi
  git commit -m "$MSG" --trailer "Co-Authored-By: aya526dev <165481574+aya526dev@users.noreply.github.com>"
  git push -u origin HEAD
  gh pr create --fill --title "$MSG"
  gh pr merge --squash --auto --delete-branch
  git switch "$MAIN" >/dev/null
  git pull --rebase --autostash >/dev/null 2>&1 || true
  echo "✓ PR merged → back on $MAIN"
}; f'
```

**前提**: `gh` CLI がインストール＆ログイン済み (`gh auth login`)。

## 使い方

```bash
# ファイル編集
vim README.md

# 一発実行（add は内部で全部やる）
git pr-quick "docs: tweak README"
```

メッセージ省略時は `chore: update` がデフォルト：

```bash
git pr-quick
```

## 実行フロー

```
→ branch: pair/20260612-094530 (base: main)
  ✓ main pull --rebase --autostash
  ✓ switch -c pair/...
  ✓ git add -A
  ✓ git commit -m "..." --trailer Co-Authored-By: aya526dev <...>
  ✓ git push -u origin HEAD
  ✓ gh pr create --fill
  ✓ gh pr merge --squash --auto --delete-branch
  ✓ switch main → pull --rebase
✓ PR merged → back on main
```

## 仕様

| 動き | 説明 |
|---|---|
| **ブランチ名** | `pair/YYYYMMDD-HHMMSS` |
| **base branch** | `origin/HEAD` から自動検出（`main` / `master` どちらも対応） |
| **変更ゼロ** | 即中断 + ゴミブランチ削除 |
| **merge 方法** | `--squash` で 1 commit に圧縮 |
| **`--auto`** | CI 通過後に自動 merge（CI 無いリポは即 merge） |
| **co-author** | squash 後も trailer は保持され GitHub で集計される |

## Pair Extraordinaire のティア

| Tier | 必要 PR 数（共著付き・merge 済） |
|---|---|
| Default | 1 |
| Bronze (x2) | 10 |
| Silver (x3) | 24 |
| **Gold (x4)** | **48** |

`git pr-quick` を 48 回叩けば Gold 達成。

## トラブルシュート

### `gh pr create` で失敗する

リモートに `origin/main` が無い／push 直後で GitHub 側が認識してない可能性。手動で `gh pr create --fill` を再実行すれば通ることが多い。

### `gh pr merge --auto` が効かない

そのリポで Settings → General → "Allow auto-merge" が有効か確認。無効なら：

```bash
# alias の --auto を外す（即時 merge）
git config --global alias.pr-quick "$(git config --global alias.pr-quick | sed 's/--auto //')"
```

### co-author が GitHub UI に表示されない

trailer 行の前に空行が必要（`git commit --trailer` は自動でやってくれる）。直接 `-m` で書く時は：

```bash
git commit -m "msg" -m "" -m "Co-Authored-By: aya526dev <165481574+aya526dev@users.noreply.github.com>"
```

## 解除

Pair Extraordinaire Gold 達成後など：

```bash
git config --global --unset alias.pr-quick
```

## 関連

- 常時 hook 版（**今は無効**）: `~/.git-hooks/prepare-commit-msg` ファイル自体は残っている。再度全 commit に co-author を自動付与したい場合は `git config --global core.hooksPath "$HOME/.git-hooks"`
- Achievement 一覧: <https://github.com/users/hrmcngs/achievements>


## 達成度の確認

現在のティアと残り PR 数を確認するには：

```bash
gh api graphql -f query='{ viewer { login } }'   # 自分のログインを確認
```

GitHub プロフィール → Achievements タブ で Pair Extraordinaire のティアが表示される。残り PR 数の早見：

| 次のティア | あと何回 |
|---|---|
| Default → Bronze | 9 |
| Bronze → Silver | 14 |
| Silver → Gold | 24 |
