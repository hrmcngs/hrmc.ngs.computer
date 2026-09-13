https://hrmc.ngs.computer/

gh workflow run update-charts.yml
> ビルドchart SVGsの

gh run watch 
> 途中経過を見る

action
./scripts/setup-dispatch.sh --all
## テーマ

`theme.jsonc` の `preset` でサイトのテーマを選べます。

既定は macOS テーマ・Ghost 配色です。URL指定やブラウザに保存した配色がある場合は、そちらを優先します。

- `macos`: macOSのデスクトップ風。グラデーションの壁紙、半透明のメニューバー、ウィンドウ風カードを表示します。
- トップページを `/?theme=macos` で開くと、設定ファイルを変更せずプレビューできます。
- 常時使用する場合は `"preset": "macos"` に変更してください。
- 開発者コンソールでも `theme.setPreset('macos')` で切り替え、`theme.reset()` で設定値に戻せます。
- macOSテーマの上部メニューにある表示モードで「自動・ライト・ダーク」を切り替えられます。「自動」は端末の設定に追従し、選択はブラウザに保存されます。
- macOSのカラーテーマはHome／Photos上部の「Classic・Ghost・Mono・Ocean・Rose」から選べます。Ghostは青緑・ミント・淡い緑、Monoは従来のGhostの無彩色、Oceanは青緑、Roseはピンク系です。ライト／ダークとは独立して選択でき、ページ間で共有・保存されます。

### 見た目を指定した共有リンク

Home／Photos のカラーテーマを開き、「この見た目のリンクをコピー」を押すと、現在のサイト・カード・配色・明暗を指定したURLをコピーできます。コピーできない環境では、選択してコピーできるURL欄を表示します。

例: `https://hrmc.ngs.computer/?theme=macos&palette=engraving&appearance=dark`

| パラメータ | 指定できる内容 |
| --- | --- |
| `theme` | `theme.jsonc` のプリセット名。例: `macos`、`digital`、`vault`、`workshop` |
| `site` | `theme.jsonc` の `siteThemes` の名前。背景などサイトのテーマを個別指定 |
| `card` | `theme.jsonc` の `cardThemes` の名前。作品カードのテーマを個別指定 |
| `palette` | `seasonal`、`classic`、`ghost`、`mono`、`ocean`、`rose`、`engraving` |
| `appearance` | `light`、`dark`、`system` |
| `season` | `spring`、`summer`、`autumn`、`winter`。季節配色の季節を固定 |

`site`・`card` は `theme` の対応する設定より優先します。配色・明暗はmacOSの表示に適用されます。URLの有効な指定はブラウザの保存設定より優先され、開くだけではその指定を保存しません。画面で手動変更した選択は通常どおり保存します。不明な値は無視します。

コピーしたリンクでは、端末や開いた時期が違っても同じ見た目になるよう、表示中の明暗と季節を固定します。受け取る人の端末設定に合わせたい場合は `appearance=system`、季節を自動更新したい場合は `palette=seasonal` にして `season` を省略してください。現在のページ・アンカー・その他のパラメータは維持します。
