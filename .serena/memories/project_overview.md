# PDCA-Lab (HabitLab) プロジェクト概要

## プロジェクトの目的
習慣化×ゲーミフィケーションのPWAアプリ。ローカルストレージのみで動作し、オフラインで日々の習慣・ジャーナル・ポイント・カード・イベント・チャレンジ・統計を一括管理。

## 技術スタック
- **フロントエンド**: Vanilla JavaScript (ES6+)
- **スタイリング**: CSS (インラインスタイル)
- **データストレージ**: LocalStorage (`hypolab_local_data`)
- **PWA**: Service Worker (`sw.js`, `manifest.webmanifest`)
- **ビルドツール**: なし（静的ファイル直接配信）

## プロジェクト構造
- `index.html`: リダイレクトページ
- `hypolab-local.html`: メインアプリケーション
- `js/`: JavaScriptファイル
  - `hypolab-local.js`: メインロジック
- `css/`: スタイルシート
- `icons/`: PWAアイコン
- `sw.js`, `sw.v*.js`: Service Worker

## 主要機能
1. 習慣トラッカー（強度選択、ストリーク倍率）
2. ポイント・レベルシステム
3. カードシステム（報酬・購入）
4. イベント・チャレンジ機能
5. 統計・分析機能
6. PWA対応（オフライン動作）