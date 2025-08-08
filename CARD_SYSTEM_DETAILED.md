# HypoLab カードシステム詳細定義書

## 基本仕様

### カードの分類
- **報酬カード（Reward）**: プレイヤーが任意のタイミングで使用可能
- **ペナルティカード（Penalty）**: 次回仮説作成時に自動適用され、プレイヤーは回避不可

### カード取得条件
仮説の検証期間終了時、達成率に応じてカードを獲得：
- **100%達成**: 報酬カード1枚確定（レア以上50%）
  - 現行実装の分布: レジェンダリー15% / レア35% / コモン50%
- **80-99%達成**: 報酬カード1枚（レア20%、コモン80%）
- **60-79%達成**: カード獲得なし
- **0-59%達成**: ペナルティカード1枚

## カード詳細定義

### 報酬カード

#### 1. 🌟 達成ブースト（Achievement Boost）
```json
{
  "id": "reward_achievement_boost",
  "type": "reward",
  "name": "達成ブースト",
  "description": "使用すると、今日を含む3日間が自動的に達成済みになる",
  "rarity": "rare",
  "effect": {
    "type": "auto_achieve_days",
    "value": 3,
    "target": "current_hypothesis"
  },
  "constraints": {
    "usable_when": "hypothesis_in_progress",
    "cannot_use_if": "remaining_days < 3",
    "usage_limit": "once_per_hypothesis"
  },
  "ui": {
    "icon": "🌟",
    "color": "#10b981",
    "animation": "star_burst"
  }
}
```

**使用フロー**:
1. 進捗画面で「カード使用」ボタンをタップ
2. 所持カード一覧から選択
3. 確認ダイアログ「今日から3日間を達成済みにしますか？」
4. 実行すると、カレンダー上で該当日が即座に達成マークに変化
5. アニメーションと共に達成率が上昇

#### 2. ⏭️ スキップチケット（Skip Ticket）
```json
{
  "id": "reward_skip_ticket",
  "type": "reward",
  "name": "スキップチケット",
  "description": "任意の1日をスキップして達成扱いにできる",
  "rarity": "common",
  "effect": {
    "type": "skip_specific_day",
    "value": 1,
    "target": "selected_day"
  },
  "constraints": {
    "usable_when": "hypothesis_in_progress",
    "selectable_days": "past_and_today_only",
    "usage_limit": "unlimited"
  },
  "ui": {
    "icon": "⏭️",
    "color": "#3b82f6",
    "animation": "slide_right"
  }
}
```

**使用フロー**:
1. 進捗画面の「カードを使用」でスキップチケットを選択（スキップモードに切替）
2. カレンダーで未達成の日をタップ
3. 使用すると、その日が達成済みに変化
4. 過去の日と今日のみ選択可能（未来は不可）

#### 3. 🎯 パーフェクトボーナス（Perfect Bonus）
```json
{
  "id": "reward_perfect_bonus",
  "type": "reward",
  "name": "パーフェクトボーナス",
  "description": "次の仮説で100%達成時、報酬カードを通常1枚に加えて+1枚（合計2枚）",
  "rarity": "legendary",
  "effect": {
    "type": "next_perfect_reward",
    "value": 2,
    "target": "next_hypothesis"
  },
  "constraints": {
    "usable_when": "always",
    "stacks": false,
    "expires_after": "next_hypothesis_completion"
  },
  "ui": {
    "icon": "🎯",
    "color": "#f59e0b",
    "animation": "pulse_glow"
  }
}
```

**使用フロー**:
1. ホーム画面または新規仮説作成前に使用
2. 次の仮説に「パーフェクトボーナス適用中」バッジが表示
3. 100%達成時に通常の1枚に加えて追加で1枚獲得（合計2枚）

#### 4. 🚀 達成率ブースター（Achievement Booster）
```json
{
  "id": "reward_achievement_booster",
  "type": "reward",
  "name": "達成率ブースター",
  "description": "最終達成率に+15%のボーナス",
  "rarity": "common",
  "effect": {
    "type": "achievement_rate_bonus",
    "value": 15,
    "target": "current_hypothesis"
  },
  "constraints": {
    "usable_when": "hypothesis_in_progress",
    "stacks": false
  },
  "ui": {
    "icon": "📈",
    "color": "#3b82f6"
  }
}
```
4. 100%未達成の場合は効果消失

### ペナルティカード

#### 5. ⏰ 延長カード（Extension Card）
```json
{
  "id": "penalty_extension",
  "type": "penalty",
  "name": "延長カード",
  "description": "次の仮説の期間が強制的に+3日される",
  "rarity": "common",
  "effect": {
    "type": "extend_duration",
    "value": 3,
    "target": "next_hypothesis"
  },
  "constraints": {
    "auto_apply": true,
    "apply_when": "hypothesis_creation",
    "notification": "required"
  },
  "ui": {
    "icon": "⏰",
    "color": "#ef4444",
    "animation": "shake"
  }
}
```

**適用フロー**:
1. 新規仮説作成時、シャッフル前に警告表示
2. 「ペナルティカード適用：期間+3日」
3. シャッフル結果に自動的に3日追加
4. カードは自動消費される

#### 6. 🔒 ロックカード（Lock Card）
```json
{
  "id": "penalty_minimum_lock",
  "type": "penalty",
  "name": "ロックカード",
  "description": "次の仮説は最低7日間になる（短期間選択不可）",
  "rarity": "rare",
  "effect": {
    "type": "minimum_duration",
    "value": 7,
    "target": "next_hypothesis"
  },
  "constraints": {
    "auto_apply": true,
    "apply_when": "hypothesis_creation",
    "overrides": "duration_selection"
  },
  "ui": {
    "icon": "🔒",
    "color": "#dc2626",
    "animation": "lock_close"
  }
}
```

**適用フロー**:
1. 新規仮説作成時、期間選択が自動的に「中期間」以上に制限
2. 「短期間」オプションがグレーアウト
3. シャッフル範囲が7日以上に固定
4. 警告メッセージ表示

#### 7. 🌀 混乱の渦（Chaos Vortex）
```json
{
  "id": "penalty_chaos_vortex",
  "type": "penalty",
  "name": "混乱の渦",
  "description": "達成/未達成がランダムで3日分入れ替わる",
  "rarity": "rare",
  "effect": {
    "type": "flip_random_days",
    "value": 3,
    "target": "current_hypothesis"
  },
  "constraints": {
    "auto_apply": true,
    "apply_when": "hypothesis_in_progress"
  },
  "ui": {
    "icon": "🌀",
    "color": "#dc2626"
  }
}
```

#### 8. ⚠️ ダブルオアナッシング（Double or Nothing）
```json
{
  "id": "penalty_double_or_nothing",
  "type": "penalty",
  "name": "ダブルオアナッシング",
  "description": "次の仮説で100%未達成ならペナルティカード2枚",
  "rarity": "rare",
  "effect": {
    "type": "next_fail_penalty",
    "value": 2,
    "target": "next_hypothesis_completion"
  },
  "constraints": {
    "auto_apply": true,
    "apply_when": "hypothesis_completion"
  },
  "ui": {
    "icon": "⚠️",
    "color": "#dc2626"
  }
}
```

## データ構造

### ユーザーのカード所持データ
```javascript
{
  "cards": {
    "inventory": [
      {
        "cardId": "reward_skip_ticket",
        "acquiredDate": "2025-01-03T10:00:00Z",
        "used": false
      }
    ],
    "activeEffects": [
      {
        "cardId": "reward_perfect_bonus",
        "activatedDate": "2025-01-03T10:00:00Z",
        "targetHypothesisId": null // 次の仮説に適用
      }
    ],
    "pendingPenalties": [
      {
        "cardId": "penalty_extension",
        "acquiredDate": "2025-01-03T10:00:00Z"
      }
    ]
  }
}
```

### カード取得確率テーブル
```javascript
const CARD_PROBABILITY = {
  "perfect": { // 100%達成
    "reward_common": 0.5,
    "reward_rare": 0.4,
    "reward_legendary": 0.1
  },
  "high": { // 80-99%達成
    "reward_common": 0.8,
    "reward_rare": 0.2,
    "reward_legendary": 0
  },
  "low": { // 0-59%達成
    "penalty_common": 0.7,
    "penalty_rare": 0.3
  }
};
```

## UI/UX仕様

### カード獲得演出
1. 仮説完了時、達成率表示後にカード獲得アニメーション
2. カードが回転しながら表示される
3. レアリティに応じたエフェクト（キラキラ、虹色など）
4. タップでカード詳細を確認

### カード管理画面
- ナビゲーションに「カード」タブを追加
- 所持カード一覧（使用可能/使用済み/ペナルティ）
- 各カードをタップで詳細表示
- 使用可能カードには「使用する」ボタン

### 通知システム
- ペナルティカード保持時は、ホーム画面に警告バッジ
- カード使用可能な状況では、進捗画面にヒント表示
- パーフェクトボーナス適用中は常時バッジ表示

## エッジケース処理

1. **複数ペナルティ**: 同時に複数のペナルティカードを保持している場合、すべて適用
2. **カード上限**: 各種カードの所持上限は99枚
3. **仮説中断時**: 使用済みカードは返却されない
4. **データ移行**: ブラウザ間でのデータ移行は未対応
