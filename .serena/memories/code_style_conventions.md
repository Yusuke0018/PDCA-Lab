# PDCA-Lab コーディング規約

## JavaScript
- ES6+記法（const/let、アロー関数、テンプレートリテラル）
- 関数名: キャメルケース（例: `calculatePoints()`, `renderHabitCard()`）
- 定数: アッパースネークケース（例: `MAX_LEVEL`, `POINT_MULTIPLIER`）
- グローバル変数: `window.`プレフィックス推奨

## HTML/CSS
- インラインスタイル多用（単一ファイルアプリのため）
- BEM記法は不使用
- カラーコード: `#rrggbb`形式
- レスポンシブ: viewport meta + flexbox

## データ構造
- LocalStorageキー: `hypolab_local_data`
- 日付フォーマット: `YYYY-MM-DD`
- タイムスタンプ: ISO 8601形式

## コメント
- 日本語コメント可
- 重要な処理には必ずコメント
- TODOコメント形式: `// TODO: 説明`

## エラーハンドリング
- try-catch使用
- console.error()でログ出力
- ユーザーへはalert()またはカスタムモーダル