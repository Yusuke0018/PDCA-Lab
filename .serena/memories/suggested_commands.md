# PDCA-Lab 開発コマンド

## Git操作
```bash
# 変更確認
git status
git diff

# コミット
git add .
git commit -m "メッセージ"
git push origin main

# 履歴確認
git log --oneline -5
```

## ローカル開発
```bash
# ローカルサーバー起動（Python）
python3 -m http.server 8000

# ブラウザで開く
open http://localhost:8000/hypolab-local.html

# キャッシュクリア付きリロード
# Chrome/Edge: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
# Safari: Cmd+Option+R
```

## 検証・デバッグ
```bash
# ブラウザのDevToolsコンソール
localStorage.getItem('hypolab_local_data')
localStorage.clear() # データクリア（注意）

# Service Worker確認
navigator.serviceWorker.getRegistrations()
```

## ファイル検索
```bash
# コード内検索
grep -r "検索文字列" js/
find . -name "*.js" -o -name "*.html"
```