# Architecture

## 全体構成
- PWA習慣管理アプリ（PDCA-Lab/HypoLab）
- Vanilla JS + Firebase Hosting + LocalStorage
- index.html → js/hypolab-local.js主要ロジック

## 主要モジュール依存
- js/hypolab-local.js: 習慣管理コア
- js/habit-calendar.js: カレンダー表示
- js/achievement-chart.js: 統計グラフ
- Firebase SDK: 認証・データ同期

## データフロー
LocalStorage → UI表示 → ユーザー操作 → LocalStorage更新 → Firebase同期（オプション）

## ビルド/実行
- ビルド不要（vanilla JS）
- index.html直接開くかFirebase serve
- デプロイ: firebase deploy

## 非機能要件
- PWA対応（manifest.json, service-worker.js）
- モバイルファースト設計
- オフライン動作可能