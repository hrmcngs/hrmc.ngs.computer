https://hrmc.ngs.computer/

gh workflow run update-charts.yml
> ビルドchart SVGsの

gh run watch 
> 途中経過を見る

action
./scripts/setup-dispatch.sh --all
## テーマ

`theme.jsonc` の `preset` でサイトのテーマを選べます。

- `macos`: macOSのデスクトップ風。グラデーションの壁紙、半透明のメニューバー、ウィンドウ風カードを表示します。
- トップページを `/?theme=macos` で開くと、設定ファイルを変更せずプレビューできます。
- 常時使用する場合は `"preset": "macos"` に変更してください。
- 開発者コンソールでも `theme.setPreset('macos')` で切り替え、`theme.reset()` で設定値に戻せます。
- macOSテーマの上部メニューにある表示モードで「自動・ライト・ダーク」を切り替えられます。「自動」は端末の設定に追従し、選択はブラウザに保存されます。
- macOSのカラーテーマはHome／Photos上部の「Classic・Ghost・Ocean・Rose」から選べます。Ghostは無彩色、Oceanは青緑、Roseはピンク系です。ライト／ダークとは独立して選択でき、ページ間で共有・保存されます。
