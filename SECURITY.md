# セキュリティガイドライン

## APIキーの管理

### ❌ やってはいけないこと
- APIキーを直接コードに書く
- APIキーをGitHubなどの公開リポジトリにコミットする
- 制限のないAPIキーを使用する

### ✅ 正しい方法

#### 1. ローカル開発環境
`.env.local`ファイルを作成:
```
VITE_FIREBASE_API_KEY=your_api_key_here
```

#### 2. 本番環境（Firebase Hosting）
Firebase CLIで環境変数を設定:
```bash
firebase functions:config:set api.key="your_api_key_here"
```

#### 3. APIキーの制限
Google Cloud Consoleで必ず以下を設定:
- **ウェブサイト制限**: 許可するドメインのみ
- **API制限**: 必要なAPIのみ許可

## 緊急時の対応

APIキーが露出した場合:
1. 即座にコードから削除してプッシュ
2. Google Cloud ConsoleでAPIキーを再生成
3. 新しいAPIキーに制限を追加
4. 環境変数での管理に切り替え

## チェックリスト

- [ ] .gitignoreに機密ファイルが含まれているか確認
- [ ] APIキーに適切な制限が設定されているか確認
- [ ] 環境変数を使用しているか確認
- [ ] 定期的にGoogle Cloud Consoleで不正使用をチェック