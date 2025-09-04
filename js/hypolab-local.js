        // PWA: service worker 登録
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                const SW_VERSION_TAG = '20250831-01';
                const SW_FILE = `./sw.v20250119-03.js?v=${SW_VERSION_TAG}`; // 新ファイル名で確実に更新
                navigator.serviceWorker.register(SW_FILE)
                    .then(reg => {
                        // 即時適用のためのハンドリング
                        if (reg.waiting) {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        }
                        reg.addEventListener('updatefound', () => {
                            const nw = reg.installing;
                            if (!nw) return;
                            nw.addEventListener('statechange', () => {
                                if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                                    reg.waiting && reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                                }
                            });
                        });
                        navigator.serviceWorker.addEventListener('controllerchange', () => {
                            // 一度だけリロードして最新資産に切替
                            if (!window.__reloadedForSW) {
                                window.__reloadedForSW = true;
                                window.location.reload();
                            }
                        });
                        // 念のため更新チェック
                        reg.update();
                        // 旧 sw.js 登録が残っていれば解除
                        navigator.serviceWorker.getRegistrations().then(list => {
                            list.forEach(r => {
                                try {
                                    if (r.active && r.active.scriptURL && r.active.scriptURL.endsWith('/sw.js')) {
                                        r.unregister();
                                    }
                                } catch(_) {}
                            });
                        });
                    })
                    .catch(() => {});
            });
        }

        // グローバルから呼び出せるように公開
        try { window.editCategoryMaster = editCategoryMaster; } catch(_) {}
        
        // 習慣の詳細を編集する関数
        window.editHabitDetails = function() {
            if (!window.currentHypothesis) return;
            
            // 現在の値をモーダルに設定
            document.getElementById('edit-habit-title').value = window.currentHypothesis.title || '';
            document.getElementById('edit-habit-description').value = window.currentHypothesis.description || '';
            
            // カテゴリ選択を更新
            try {
                updateCategoryDropdowns();
                const catEl = document.getElementById('edit-habit-category');
                if (catEl) catEl.value = window.currentHypothesis.category || 'other';
            } catch(_) {}
            
            // モーダルを表示
            document.getElementById('habit-edit-modal').style.display = 'block';
        };
        
        // 編集内容を保存
        window.saveHabitEdits = function() {
            if (!window.currentHypothesis) return;
            
            const newTitle = document.getElementById('edit-habit-title').value.trim();
            const newDescription = document.getElementById('edit-habit-description').value.trim();
            const catEl = document.getElementById('edit-habit-category');
            const newCategory = catEl ? catEl.value : (window.currentHypothesis.category || 'other');
            
            if (!newTitle) {
                alert('習慣の名前は必須です');
                return;
            }
            
            const data = loadData();
            const habitIndex = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            
            if (habitIndex === -1) return;
            
            // データを更新
            data.currentHypotheses[habitIndex].title = newTitle;
            data.currentHypotheses[habitIndex].description = newDescription;
            data.currentHypotheses[habitIndex].category = newCategory;
            
            // 現在の習慣も更新
            window.currentHypothesis.title = newTitle;
            window.currentHypothesis.description = newDescription;
            window.currentHypothesis.category = newCategory;
            
            // データを保存
            saveData(data);
            
            // UIを更新
            document.getElementById('progress-hypothesis-title').textContent = newTitle;
            document.getElementById('progress-hypothesis-description').textContent = newDescription;
            
            // モーダルを閉じる
            window.closeEditModal();
            
            // 通知を表示
            try {
                showNotification('習慣を更新しました', 'success');
            } catch(_) {}
            
            // ホーム画面のリストも更新
            updateCurrentHypothesisList();
        };
        
        // 編集モーダルを閉じる
        window.closeEditModal = function() {
            document.getElementById('habit-edit-modal').style.display = 'none';
        };

        // ホーム詳細の「編集」ボタン用ヘルパー
        window.openHabitEditModal = function(hypothesisId) {
            const data = loadData();
            const hypothesis = data.currentHypotheses.find(h => h.id === hypothesisId);
            if (!hypothesis) return;
            window.currentHypothesis = hypothesis;
            window.editHabitDetails();
        };

        // 手動更新（モバイルのキャッシュ固着対策・データは消さない）
        window.forceUpdateApp = async function(){
            const notify = (msg) => { try { showNotification(msg, 'info'); } catch(_) { try { alert(msg); } catch(_) {} } };
            notify('更新を適用中です…');
            // 1) 既存SWの登録解除
            try {
                if ('serviceWorker' in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(async (r) => {
                        try { r.active && r.active.postMessage && r.active.postMessage({ type:'SKIP_WAITING' }); } catch(_){}
                        await r.unregister();
                    }));
                }
            } catch(_) {}
            // 2) Cache Storageの削除（LocalStorageは保持）
            try {
                if (window.caches && caches.keys) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                }
            } catch(_) {}
            // 3) 完全リロード（クエリでバイパス）
            try {
                const base = location.href.split('#')[0].split('?')[0];
                const hash = location.hash || '';
                const url = `${base}?flush=${Date.now()}${hash}`;
                location.replace(url);
            } catch(_) {
                location.reload();
            }
        };

        // ローカルストレージのキー（モジュール存在時は再定義しない）
        window.STORAGE_KEY = window.STORAGE_KEY || 'hypolab_local_data';

        // 現在の習慣
        let currentHypothesis = null;
        let selectedDuration = null;

        // HTMLエスケープ（XSS対策）
        function escapeHTML(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ローカルタイムのYYYY-MM-DDキーを生成（UTCズレ防止）
        function dateKeyLocal(date) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        // 目標日数を頻度に基づいて算出（カード付与・完了判定用）
        function getTargetDaysForHypothesis(hypothesis) {
            if (!hypothesis) return 0;

            const startDate = new Date(hypothesis.startDate);
            const today = new Date();
            startDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);

            // 経過日数（開始日を1日目として計算）
            const timeDiff = today.getTime() - startDate.getTime();
            const rawDaysPassed = Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1);
            const daysPassed = hypothesis.isUnlimited
                ? rawDaysPassed
                : Math.min(rawDaysPassed, hypothesis.totalDays);

            // デフォルトは毎日
            let targetDays = daysPassed;
            const frequency = hypothesis.frequency;

            if (frequency) {
                if (frequency.type === 'weekly') {
                    // 週単位: 経過週数 × 週あたりの回数（ただし daysPassed を上限）
                    const weeks = Math.ceil(daysPassed / 7);
                    targetDays = Math.min(weeks * frequency.count, daysPassed);
                } else if (frequency.type === 'weekdays') {
                    // 特定曜日のみカウント
                    targetDays = 0;
                    for (let i = 0; i < daysPassed; i++) {
                        const checkDate = new Date(startDate);
                        checkDate.setDate(startDate.getDate() + i);
                        if (frequency.weekdays.includes(checkDate.getDay())) {
                            targetDays++;
                        }
                    }
                }
            }

            return targetDays;
        }
        
        // 習慣・ジャーナル用の日付キーを取得（深夜2時まで前日扱い）
        function getActivityDateKey(date = new Date()) {
            const now = new Date(date);
            const hour = now.getHours();
            
            // 0時〜2時の場合は前日の日付として扱う
            if (hour < 2) {
                const yesterday = new Date(now);
                yesterday.setDate(yesterday.getDate() - 1);
                return dateKeyLocal(yesterday);
            }
            
            return dateKeyLocal(now);
        }

        // カードマスターデータ
        const CARD_MASTER = {
            // 旧カード（廃止）：skip_ticket, achievement_boost などはプールから除外
            power_boost: {
                id: 'power_boost',
                type: 'reward',
                name: 'パワーブースト',
                description: '習慣達成時に+5ptボーナス（今日中）',
                icon: '💪',
                rarity: 'rare',
                color: '#dc2626'
            },
            perfect_bonus: {
                id: 'perfect_bonus',
                type: 'reward',
                name: 'パーフェクトボーナス',
                description: '次の習慣で100%達成時、報酬カード2枚獲得',
                icon: '🎯',
                rarity: 'legendary',
                color: '#f59e0b'
            },
            extension_card: {
                id: 'extension_card',
                type: 'penalty',
                name: '延長カード',
                description: '次の習慣が3日間延長される',
                icon: '⏰',
                rarity: 'common',
                color: '#ef4444'
            },
            hard_mode: {
                id: 'hard_mode',
                type: 'penalty',
                name: 'ハードモード',
                description: '次の習慣は達成率90%以上でないとカードを獲得できない',
                icon: '⚡',
                rarity: 'rare',
                color: '#dc2626'
            },
            reset_risk: {
                id: 'reset_risk',
                type: 'penalty',
                name: 'リセットリスク',
                description: '3日連続で未達成だと全ての達成がリセットされる',
                icon: '🔄',
                rarity: 'rare',
                color: '#dc2626'
            },
            short_term: {
                id: 'short_term',
                type: 'penalty',
                name: '短期集中',
                description: '次の習慣は必ず短期間（3-5日）になる',
                icon: '⏱️',
                rarity: 'common',
                color: '#ef4444'
            },
            achievement_decrease: {
                id: 'achievement_decrease',
                type: 'penalty',
                name: '達成率減少',
                description: '最終達成率から10%引かれる',
                icon: '📉',
                rarity: 'common',
                color: '#ef4444'
            },
            // 新しいカード（プロテクトシールドは削除）
            // 旧カード（廃止）：achievement_booster はプールから除外
            // 旧カード（廃止）：second_chance はプールから除外
            // 新規追加カード - 報酬カード
            event_trigger: {
                id: 'event_trigger',
                type: 'reward',
                name: 'イベントトリガー',
                description: '明日のイベント発生確率を100%にする',
                icon: '🎪',
                rarity: 'rare',
                color: '#8b5cf6'
            },
            event_combo: {
                id: 'event_combo',
                type: 'reward',
                name: 'イベントコンボ',
                description: '3日間連続でイベントが発生する',
                icon: '🔮',
                rarity: 'legendary',
                color: '#ec4899'
            },
            point_gem: {
                id: 'point_gem',
                type: 'reward',
                name: 'ポイントジェム',
                description: '明日1日限定でポイントが1.5倍になる',
                icon: '💎',
                rarity: 'rare',
                color: '#06b6d4'
            },
            mission_master: {
                id: 'mission_master',
                type: 'reward',
                name: 'ミッションマスター',
                description: '今日のミッションが2つ追加される',
                icon: '🎯',
                rarity: 'legendary',
                color: '#f59e0b'
            },
            rainbow_boost: {
                id: 'rainbow_boost',
                type: 'reward',
                name: 'レインボーブースト',
                description: '全カテゴリーの習慣が今日は2倍ポイント',
                icon: '🌈',
                rarity: 'legendary',
                color: '#a855f7'
            },
            lucky_seven: {
                id: 'lucky_seven',
                type: 'reward',
                name: 'ラッキーセブン',
                description: '今日から7日間、イベント発生率2倍',
                icon: '🎰',
                rarity: 'legendary',
                color: '#eab308'
            },
            // 新規追加カード - ペナルティカード
            event_seal: {
                id: 'event_seal',
                type: 'penalty',
                name: 'イベント封印',
                description: '3日間イベントが発生しない',
                icon: '🌑',
                rarity: 'common',
                color: '#64748b'
            },
            mission_overload: {
                id: 'mission_overload',
                type: 'penalty',
                name: 'ミッション追加',
                description: '今日のミッションが2つ追加される',
                icon: '⛓️',
                rarity: 'rare',
                color: '#991b1b'
            },
            slowdown: {
                id: 'slowdown',
                type: 'penalty',
                name: 'スローダウン',
                description: '3日間獲得ポイントが0.5倍',
                icon: '🕸️',
                rarity: 'common',
                color: '#7c2d12'
            },
            // 新規追加カード - 特殊カード
            conversion_magic: {
                id: 'conversion_magic',
                type: 'reward',
                name: '変換の魔法',
                description: 'ペナルティカード1枚を報酬カードに変換',
                icon: '🪄',
                rarity: 'legendary',
                color: '#0891b2'
            },
            fate_dice: {
                id: 'fate_dice',
                type: 'reward',
                name: '運命のダイス',
                description: 'ランダムで報酬かペナルティ効果が発動（50/50）',
                icon: '🎲',
                rarity: 'rare',
                color: '#059669'
            },
            // 新規追加（楽しい効果系 報酬カード）
            combo_chain: {
                id: 'combo_chain',
                type: 'reward',
                name: 'コンボチェーン',
                description: '今日のコンボボーナスが2倍になる',
                icon: '🧩',
                rarity: 'rare',
                color: '#22c55e'
            },
            sparkle_streak: {
                id: 'sparkle_streak',
                type: 'reward',
                name: 'スパークルストリーク',
                description: '当日中は習慣達成ごとに+1pt',
                icon: '🎆',
                rarity: 'rare',
                color: '#f97316'
            },
            category_festival: {
                id: 'category_festival',
                type: 'reward',
                name: 'カテゴリーフェス',
                description: '選んだカテゴリの達成が今日×1.5',
                icon: '🎪',
                rarity: 'rare',
                color: '#8b5cf6'
            },
            happy_hour: {
                id: 'happy_hour',
                type: 'reward',
                name: 'ハッピーアワー',
                description: '1時間ポイント1.5倍',
                icon: '⏰',
                rarity: 'common',
                color: '#06b6d4'
            },
            mystery_box: {
                id: 'mystery_box',
                type: 'reward',
                name: 'ミステリーボックス',
                description: '今日の最初の達成でサプライズ報酬！',
                icon: '🎁',
                rarity: 'rare',
                color: '#f59e0b'
            },
            // 追加: 楽しくて安全な効果系
            mini_rainbow: {
                id: 'mini_rainbow',
                type: 'reward',
                name: 'ミニレインボー',
                description: '今日だけ全カテゴリのポイントが×1.5',
                icon: '🌈',
                rarity: 'uncommon',
                color: '#a855f7'
            },
            power_nap: {
                id: 'power_nap',
                type: 'reward',
                name: 'パワーナップ',
                description: '使用すると即座に10pt獲得',
                icon: '😴',
                rarity: 'common',
                color: '#06b6d4'
            },
            shuffle_challenge: {
                id: 'shuffle_challenge',
                type: 'special',
                name: 'チャレンジシャッフル',
                description: '今日のチャレンジをランダムに変更',
                icon: '🎯',
                rarity: 'uncommon',
                color: '#8b5cf6'
            },
            event_shuffle: {
                id: 'event_shuffle',
                type: 'special',
                name: 'イベントシャッフル',
                description: '今日のイベントをランダムに変更',
                icon: '🎲',
                rarity: 'uncommon',
                color: '#f59e0b'
            },
            combo_surge: {
                id: 'combo_surge',
                type: 'reward',
                name: 'コンボサージ',
                description: '今日のコンボボーナスが×1.5',
                icon: '🧨',
                rarity: 'rare',
                color: '#f97316'
            },
            afternoon_gem: {
                id: 'afternoon_gem',
                type: 'reward',
                name: 'アフタヌーンジェム',
                description: '今日だけポイントが×1.5',
                icon: '☕',
                rarity: 'uncommon',
                color: '#10b981'
            },
            event_ticket: {
                id: 'event_ticket',
                type: 'reward',
                name: 'イベントチケット',
                description: '今日のイベントにダブルポイントデーを発動',
                icon: '🎫',
                rarity: 'rare',
                color: '#3b82f6'
            },
            challenge_boost_today: {
                id: 'challenge_boost_today',
                type: 'reward',
                name: 'チャレンジブースト',
                description: '今日のチャレンジポイントが×2',
                icon: '🎯',
                rarity: 'rare',
                color: '#22c55e'
            },
            journal_boost_today: {
                id: 'journal_boost_today',
                type: 'reward',
                name: 'ジャーナルブースト',
                description: '今日のジャーナルポイントが×2',
                icon: '📝',
                rarity: 'uncommon',
                color: '#94a3b8'
            },
            double_or_nothing: {
                id: 'double_or_nothing',
                type: 'penalty',
                name: 'ダブルオアナッシング',
                description: '次の習慣で100%達成しないとペナルティカード2枚',
                icon: '⚠️',
                rarity: 'rare',
                color: '#dc2626'
            }
        };

        // イベント機能 一時停止フラグ（URL/LocalStorageで切替可）
        // 優先度: URLパラメータ ?events=on|off > localStorage('hypolab_events_disabled') > 既定true
        const EVENTS_DISABLED = true;
        
        // イベント定義
        const EVENT_DEFINITIONS = [
            // カテゴリ系イベント
            { id: 'study_day', name: '📚 勉強デー', description: '勉強カテゴリ×1.5', effect: 'category_boost', category: 'study', multiplier: 1.5 },
            { id: 'exercise_festival', name: '💪 運動祭り', description: '運動カテゴリ×1.5', effect: 'category_boost', category: 'exercise', multiplier: 1.5 },
            { id: 'health_campaign', name: '🍎 健康キャンペーン', description: '健康カテゴリ×1.5', effect: 'category_boost', category: 'health', multiplier: 1.5 },
            { id: 'work_power', name: '💼 仕事パワー', description: '仕事カテゴリ×1.5', effect: 'category_boost', category: 'work', multiplier: 1.5 },
            { id: 'hobby_time', name: '🎨 趣味タイム', description: '趣味カテゴリ×1.5', effect: 'category_boost', category: 'hobby', multiplier: 1.5 },
            
            // 特殊系イベント
            { id: 'perfect_challenge', name: '💯 パーフェクトチャレンジ', description: '全習慣達成で+10ptボーナス', effect: 'perfect_bonus', value: 10 },
            { id: 'streak_party', name: '🔥 ストリークパーティ', description: '連続3日以上の習慣に+3pt', effect: 'streak_bonus', minDays: 3, bonus: 3 },
            
            // ギャンブル系イベント
            { id: 'dice_roll', name: '🎲 サイコロチャレンジ', description: '達成毎に1〜3ptランダム', effect: 'random_points', min: 1, max: 3 },
            { id: 'coin_flip', name: '🪙 コインフリップ', description: '50%で×1.5、50%で×0.5', effect: 'coin_flip', win: 1.5, lose: 0.5 },
            
            // 連鎖系イベント
            { id: 'chain_reaction', name: '⛓️ チェインリアクション', description: '達成する度に+1pt累積（最大+5）', effect: 'chain', maxBonus: 5 },
            { id: 'momentum_builder', name: '🚀 モメンタムビルダー', description: '連続達成で倍率上昇（1→1.1→1.2→1.3）', effect: 'momentum', multipliers: [1, 1.1, 1.2, 1.3] },
            
            
            
            // 週末イベント
            { id: 'weekend_special', name: '🎈 週末スペシャル', description: '週末はポイント1.5倍！', effect: 'points_multiplier', value: 1.5 },
            
            // ネガティブイベント（悪いイベント）
            { id: 'half_points', name: '💔 ポイント半減デー', description: '今日の獲得ポイントが半分（×0.5）', effect: 'points_multiplier', value: 0.5 },
            { id: 'expensive_rewards', name: '💸 報酬高騰', description: '報酬の消費ポイントが1.5倍', effect: 'reward_multiplier', value: 1.5 },
            { id: 'no_combo', name: '🚫 コンボ封印', description: '今日はコンボボーナスが発動しない', effect: 'combo_disable', value: 0 },
            { id: 'slow_day', name: '🐌 スローデー', description: '基本ポイントが-1（最低1pt）', effect: 'point_reduction', value: -1 },
            { id: 'hard_mode', name: '⚡ ハードモード', description: '高強度のみポイント獲得可能', effect: 'intensity_restriction', value: 'high' },
            { id: 'reverse_streak', name: '🔄 ストリーク逆転', description: 'ストリークボーナスが減算される', effect: 'streak_reverse', value: -1 }
        ];
        
        // 手動切替用ヘルパー
        window.enableEvents = () => { try { localStorage.setItem('hypolab_events_disabled','false'); } catch(_){} location.reload(); };
        window.disableEvents = () => { try { localStorage.setItem('hypolab_events_disabled','true'); } catch(_){} location.reload(); };

        // 期間中イベント定義
        const HABIT_EVENTS = {
            // マイルストーンイベント（7/14/21日達成時）
            milestones: {
                7: {
                    title: '🎊 1週間達成おめでとう！',
                    message: '習慣化への第一歩を踏み出しました！',
                    rewards: ['bonus_points', 'motivation_boost']
                },
                14: {
                    title: '🎉 2週間達成おめでとう！',
                    message: '習慣が身についてきています！',
                    rewards: ['bonus_points', 'special_card']
                },
                21: {
                    title: '🏆 3週間達成おめでとう！',
                    message: '習慣化まであと一歩！素晴らしい！',
                    rewards: ['huge_bonus', 'rare_card', 'achievement_unlock']
                }
            },
            
            // ランダムブーストイベント
            boosts: [
                // ポイント系ブースト
                {
                    id: 'double_points',
                    name: '💰 ダブルポイントデー',
                    description: '今日だけ全てのポイントが2倍！',
                    condition: () => Math.random() < 0.1,  // 10%の確率
                    effect: { type: 'global_multiplier', value: 2.0 },
                    rarity: 'legendary',
                    duration: 'today'
                },
                
                // カテゴリー系ブースト
                {
                    id: 'exercise_fever',
                    name: '💪 運動フィーバー',
                    description: '運動カテゴリーの習慣が2倍ポイント！',
                    condition: () => Math.random() < 0.15,  // 15%の確率
                    effect: { type: 'category_multiplier', target: 'exercise', value: 2.0 },
                    rarity: 'uncommon',
                    duration: 'today'
                },
                {
                    id: 'study_power',
                    name: '📚 勉強パワーアップ',
                    description: '勉強カテゴリーの習慣が2倍ポイント！',
                    condition: () => Math.random() < 0.15,  // 15%の確率
                    effect: { type: 'category_multiplier', target: 'study', value: 2.0 },
                    rarity: 'uncommon',
                    duration: 'today'
                },
                
                // 連続達成系ブースト
                {
                    id: 'streak_bonus',
                    name: '🔥 連続達成ボーナス',
                    description: '7日以上連続達成でボーナスポイント！',
                    condition: (data) => {
                        // 7日以上連続達成している習慣がある場合
                        return data.currentHypotheses.some(h => {
                            const achievements = Object.keys(h.achievements || {});
                            if (achievements.length < 7) return false;
                            
                            // 直近7日間の連続をチェック
                            const sortedDates = achievements.sort().slice(-7);
                            const startDate = new Date(sortedDates[0]);
                            const endDate = new Date(sortedDates[6]);
                            const daysDiff = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24));
                            return daysDiff === 6; // 7日連続
                        });
                    },
                    effect: { type: 'streak_bonus', value: 10 },
                    rarity: 'rare',
                    duration: 'today'
                },
                
                // 時間帯系ブースト
                
                // 特殊系ブースト
                {
                    id: 'perfect_day',
                    name: '✨ パーフェクトデー',
                    description: '今日全ての習慣を達成すると+30ポイント！',
                    condition: () => Math.random() < 0.05,  // 5%の確率
                    effect: { type: 'perfect_bonus', value: 30 },
                    rarity: 'legendary',
                    duration: 'today'
                },
                
                
            ]
        };

        // チャレンジマスターデータ
        const DAILY_CHALLENGES = [
            // 生活改善系
            { id: 'meditation_5min', name: '5分間瞑想', points: 3, icon: '🧘' },
            { id: 'no_device_30min', name: '30分間電子機器に触らない', points: 4, icon: '📵' },
            { id: 'burpee_plus10', name: 'バーピー+10回', points: 5, icon: '💪' },
            { id: 'reading_plus5', name: '読書+5分', points: 3, icon: '📚' },
            { id: 'english_review', name: '英語復習', points: 3, icon: '🌍' },
            { id: 'gratitude_journal', name: '感謝日記を1つ書く', points: 2, icon: '📝' },
            { id: 'water_plus1', name: '水を追加で1杯飲む', points: 2, icon: '💧' },
            { id: 'use_stairs', name: '階段を使う', points: 2, icon: '🪜' },
            { id: 'deep_breath_10', name: '深呼吸10回', points: 2, icon: '🫁' },
            { id: 'organize_one', name: '1つ片付ける', points: 2, icon: '🧹' },
            { id: 'say_thanks', name: '誰かに「ありがとう」を伝える', points: 3, icon: '🙏' },
            { id: 'stretch_5min', name: 'ストレッチ5分', points: 3, icon: '🤸' },
            { id: 'learn_word', name: '新しい単語を1つ覚える', points: 3, icon: '📖' },
            { id: 'plank_plus10', name: 'プランク+10秒', points: 4, icon: '🏋️' },
            { id: 'mindful_eating', name: 'スマホを見ずに食事', points: 3, icon: '🍽️' },
            
            // 習慣達成ミッション系
            { id: 'complete_3_habits', name: '今日3つ以上の習慣を達成', points: 5, icon: '🎯', checkFunction: 'checkComplete3Habits' },
            { id: 'morning_routine', name: '朝の習慣をすべて完了', points: 4, icon: '🌅', checkFunction: 'checkMorningRoutine' },
            { id: 'high_intensity_day', name: '今日すべて高強度(×1.2)で達成', points: 6, icon: '🔥', checkFunction: 'checkHighIntensityDay' },
            { id: 'perfect_streak', name: '3日連続で全習慣達成', points: 8, icon: '⚡', checkFunction: 'checkPerfectStreak' },
            { id: 'category_master', name: '同じカテゴリーの習慣を3つ達成', points: 4, icon: '📊', checkFunction: 'checkCategoryMaster' },
            { id: 'early_bird', name: '午前中に習慣を2つ以上達成', points: 3, icon: '🐦', checkFunction: 'checkEarlyBird' },
            
            { id: 'variety_day', name: '4種類の異なるカテゴリーを達成', points: 6, icon: '🌈', checkFunction: 'checkVarietyDay' },
            { id: 'consistency_bonus', name: '同じ時間帯に習慣を実行', points: 3, icon: '⏰', checkFunction: 'checkConsistencyBonus' },
            { id: 'effort_bonus_max', name: '努力ボーナスを最大まで使用', points: 4, icon: '💪', checkFunction: 'checkEffortBonusMax' },
            { id: 'habit_and_challenge', name: '習慣とチャレンジを両方達成', points: 5, icon: '🏆', checkFunction: 'checkHabitAndChallenge' }
        ];

        const WEEKLY_CHALLENGES = [
            // 生活改善系
            { id: 'new_habit', name: '新しい習慣を作る', points: 15, icon: '🌱' },
            { id: 'walking_plus1', name: 'ウォーキング週一回追加', points: 10, icon: '🚶' },
            { id: 'room_cleanup', name: '部屋の大掃除（1エリア）', points: 12, icon: '🧼' },
            { id: 'talk_stranger', name: '知らない人と会話する', points: 15, icon: '💬' },
            { id: 'early_rise_3days', name: '早起き3日連続', points: 20, icon: '🌅' },
            { id: 'try_new_sport', name: '新しい運動を試す', points: 12, icon: '🏃' },
            { id: 'read_book', name: '本を1冊読み切る', points: 25, icon: '📕' },
            { id: 'volunteer', name: '寄付/ボランティア活動', points: 20, icon: '🤝' },
            
            // 週間習慣ミッション系
            { id: 'week_perfect', name: '今週すべての習慣を90%以上達成', points: 30, icon: '💯', checkFunction: 'checkWeekPerfect' },
            { id: 'week_consistency', name: '毎日同じ時間に習慣を実行', points: 20, icon: '⏰', checkFunction: 'checkWeekConsistency' },
            { id: 'week_intensity_up', name: '週の後半は強度を上げて達成', points: 18, icon: '📈', checkFunction: 'checkWeekIntensityUp' },
            { id: 'week_all_categories', name: '全カテゴリーを週3回以上達成', points: 25, icon: '🌈', checkFunction: 'checkWeekAllCategories' },
            
            { id: 'week_card_collector', name: 'カードを5枚以上獲得', points: 20, icon: '🎴', checkFunction: 'checkWeekCardCollector' },
            { id: 'week_comeback', name: '3日サボってから復活', points: 15, icon: '💪', checkFunction: 'checkWeekComeback' },
            { id: 'week_habit_combo', name: '習慣コンボを10回達成', points: 18, icon: '🔥', checkFunction: 'checkWeekHabitCombo' },
            { id: 'week_challenge_master', name: 'デイリーチャレンジ7連続達成', points: 20, icon: '🏆', checkFunction: 'checkWeekChallengeMaster' }
        ];

        // データの読み込み
        function loadData() {
            const data = localStorage.getItem(window.STORAGE_KEY);
            if (!data) {
                return {
                    currentHypotheses: [],
                    completedHypotheses: [],
                    checklists: { morning: [], day: [], night: [] },
                    cards: {
                        inventory: [],
                        pendingPenalties: []
                    },
                    challenges: {
                        daily: null,
                        weekly: null,
                        completedToday: [],
                        completedThisWeek: [],
                        lastDailyReset: new Date().toDateString(),
                        lastWeeklyReset: new Date().toISOString(),
                        history: [],
                        streak: 0,
                        lastStreakDate: null,
                        totalCompleted: 0,
                        customChallenges: []
                    },
                    events: {
                        activeBoosts: [],
                        lastEventCheck: new Date().toISOString(),
                        milestoneNotifications: {},
                        eventHistory: [],
                        boostEnabled: true
                    },
                    meta: {}
                };
            }
            const parsed = JSON.parse(data);
            // 旧バージョンのデータ対応
            if (!parsed.cards) {
                parsed.cards = {
                    inventory: [],
                    pendingPenalties: [],
                    activeEffects: [],
                    dropHistory: []
                };
            }
            // 既存のcardsオブジェクトに必要なプロパティを追加
            if (parsed.cards && !parsed.cards.activeEffects) {
                parsed.cards.activeEffects = [];
            }
            if (parsed.cards && !parsed.cards.dropHistory) {
                parsed.cards.dropHistory = [];
            }
            if (!parsed.completedHypotheses) {
                parsed.completedHypotheses = [];
            }
            if (!parsed.currentHypotheses) {
                parsed.currentHypotheses = [];
            }
            if (!parsed.meta) {
                parsed.meta = {};
            }
            // チェックリスト（朝/日中/夜）初期化
            if (!parsed.checklists) {
                parsed.checklists = { morning: [], day: [], night: [] };
            }
            // ポイントシステムがない場合は初期化
            if (!parsed.pointSystem) {
                parsed.pointSystem = {
                    currentPoints: 0,
                    lifetimeEarned: 0,
                    lifetimeSpent: 0,
                    currentLevel: 1,
                    levelProgress: 0,
                    streakMultiplier: 1.0,
                    dailyEffortUsed: 0,
                    dailyEffortLastReset: new Date().toDateString(),
                    customRewards: [],
                    transactions: [],
                    // 前借り（ローン）機能
                    loan: null, // { principal:number, borrowedAt: ISO string }
                    lastBorrowDate: null
                };
            }
            // 既存ユーザーのための前借りフィールド補完
            if (parsed.pointSystem && parsed.pointSystem.loan === undefined) parsed.pointSystem.loan = null;
            if (parsed.pointSystem && parsed.pointSystem.lastBorrowDate === undefined) parsed.pointSystem.lastBorrowDate = null;
            // チャレンジシステムがない場合は初期化
            if (!parsed.challenges) {
                parsed.challenges = {
                    daily: null,
                    weekly: null,
                    completedToday: [],
                    completedThisWeek: [],
                    lastDailyReset: new Date().toDateString(),
                    lastWeeklyReset: new Date().toISOString(),
                    history: [],
                    streak: 0,
                    lastStreakDate: null,
                    totalCompleted: 0,
                    customChallenges: []
                };
            }
            // チャレンジ履歴がない場合は初期化
            if (!parsed.challenges.history) parsed.challenges.history = [];
            if (parsed.challenges.streak === undefined) parsed.challenges.streak = 0;
            if (!parsed.challenges.lastStreakDate) parsed.challenges.lastStreakDate = null;
            if (parsed.challenges.totalCompleted === undefined) parsed.challenges.totalCompleted = 0;
            if (!parsed.challenges.customChallenges) parsed.challenges.customChallenges = [];
            // イベントシステムがない場合は初期化
            if (!parsed.events) {
                parsed.events = {
                    activeBoosts: [],
                    lastEventCheck: new Date().toISOString(),
                    milestoneNotifications: {},
                    eventHistory: [],
                    boostEnabled: true
                };
            }
            
            // 旧カテゴリーを新カテゴリーにマッピング
            const categoryMapping = {
                'reading': 'hobby',    // 読書 → 趣味
                'wellness': 'health'   // 養生 → 健康
            };
            
            // 現在の習慣のカテゴリーを更新
            if (parsed.currentHypotheses) {
                parsed.currentHypotheses.forEach(h => {
                    if (categoryMapping[h.category]) {
                        h.category = categoryMapping[h.category];
                    }
                });
            }
            
            // 完了済み習慣のカテゴリーも更新
            if (parsed.completedHypotheses) {
                parsed.completedHypotheses.forEach(h => {
                    if (categoryMapping[h.category]) {
                        h.category = categoryMapping[h.category];
                    }
                });
            }
            
            // 日付が変わったら努力ポイントとデイリーチャレンジをリセット
            const today = new Date().toDateString();
            if (parsed.pointSystem && parsed.pointSystem.dailyEffortLastReset !== today) {
                parsed.pointSystem.dailyEffortUsed = 0;
                parsed.pointSystem.dailyEffortLastReset = today;
            }
            if (parsed.challenges && parsed.challenges.lastDailyReset !== today) {
                parsed.challenges.daily = null;
                parsed.challenges.completedToday = [];
                parsed.challenges.lastDailyReset = today;
            }
            // 週が変わったらウィークリーチャレンジをリセット
            const weekStart = new Date();
            weekStart.setDate(weekStart.getDate() - weekStart.getDay());
            weekStart.setHours(0, 0, 0, 0);
            if (parsed.challenges && new Date(parsed.challenges.lastWeeklyReset) < weekStart) {
                parsed.challenges.weekly = null;
                parsed.challenges.completedThisWeek = [];
                parsed.challenges.lastWeeklyReset = weekStart.toISOString();
            }
            
            // 期限切れのカード効果をクリーンアップ
            if (parsed.cards && parsed.cards.activeEffects) {
                const now = new Date();
                parsed.cards.activeEffects = parsed.cards.activeEffects.filter(effect => {
                    // endDateが存在する場合、期限をチェック
                    if (effect.endDate) {
                        const endDate = new Date(effect.endDate);
                        if (endDate < now) {
                            console.log(`期限切れ効果を削除: ${effect.cardId}`);
                            return false; // 期限切れなので削除
                        }
                    }
                    return true; // 期限内または無期限なので保持
                });
            }
            
            // 進行中の習慣はすべて毎日実施に統一
            if (Array.isArray(parsed.currentHypotheses)) {
                parsed.currentHypotheses.forEach(h => { h.frequency = { type: 'daily' }; });
            }
            
            return parsed;
        }

        // データの保存
        function saveData(data) {
            // 週末スペシャルの値を保存前に検証
            if (data.events && data.events.activeBoosts) {
                data.events.activeBoosts = data.events.activeBoosts.map(boost => {
                    if (boost.eventId === 'weekend_special') {
                        // 週末スペシャルは必ず1.2倍に修正
                        boost.value = 1.2;
                        boost.description = '週末はポイント1.2倍！';
                    }
                    return boost;
                });
            }
            
            localStorage.setItem(window.STORAGE_KEY, JSON.stringify(data));
        }

        // ========== デイリージャーナル関連の関数 ==========
        
        // ジャーナルステータスを更新
        function updateJournalStatus() {
            const data = loadData();
            const todayKey = getJournalDateKey(); // 深夜対忌の日付キー
            const statusContainer = document.getElementById('journal-status');
            
            if (!statusContainer) return;
            
            // データ構造の初期化
            if (!data.dailyJournal) {
                data.dailyJournal = {
                    entries: {},
                    stats: {
                        currentStreak: 0,
                        longestStreak: 0,
                        totalEntries: 0,
                        lastEntry: null
                    },
                    settings: {
                        morningReminderTime: "06:00",
                        eveningReminderTime: "21:00",
                        remindersEnabled: true
                    }
                };
                saveData(data);
            }
            
            const todayEntry = data.dailyJournal.entries[todayKey] || {};
            const hasMorning = todayEntry.morning && todayEntry.morning.timestamp;
            const hasEvening = todayEntry.evening && todayEntry.evening.timestamp;
            
            // 時刻表示を削除し、睡眠時間を表示（体重も要約に含める）
            const sleepHours = todayEntry.morning?.sleepHours ? `😴 ${todayEntry.morning.sleepHours}時間` : '';
            const weightSummary = (todayEntry.morning && todayEntry.morning.weight !== null && todayEntry.morning.weight !== undefined && todayEntry.morning.weight !== '')
                ? `⚖️ ${todayEntry.morning.weight}kg`
                : '';
            
            // 過去のジャーナルを取得（最大5日分）
            const pastJournals = [];
            const dates = Object.keys(data.dailyJournal.entries || {})
                .sort((a, b) => b.localeCompare(a))
                .slice(0, 5);
            
            dates.forEach(dateKey => {
                const entry = data.dailyJournal.entries[dateKey];
                if (entry && (entry.morning || entry.evening)) {
                    pastJournals.push({ dateKey, entry });
                }
            });
            
            statusContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <!-- 今日のジャーナル -->
                    <div class="journal-entry-item ${hasMorning ? 'expandable' : ''}" data-type="morning" data-date="${todayKey}" 
                        style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; overflow: hidden; transition: all 0.3s;"
                        ${hasMorning ? 'oncontextmenu="showJournalContextMenu(event, \'morning\'); return false;"' : ''}>
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; cursor: ${hasMorning ? 'pointer' : 'default'};" 
                            ${hasMorning ? 'onclick="toggleJournalExpand(this.parentElement, \'morning\', \'' + todayKey + '\')"}' : ''}>
                            <span style="font-size: 14px;">🌅 朝のジャーナル</span>
                            ${hasMorning 
                                ? `<div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: #10b981; font-size: 12px;">✅ ${sleepHours} ${weightSummary}</span>
                                    <span class="expand-icon" style="font-size: 12px; transition: transform 0.3s;">▼</span>
                                  </div>`
                                : `<span style="color: #f59e0b; font-size: 12px;">⏳ まだ記録していません</span>`
                            }
                        </div>
                        ${hasMorning ? `
                            <div class="journal-content" style="display: none; padding: 0 12px 12px; border-top: 1px solid var(--border);">
                                <div style="margin-top: 12px;">
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">体調: ${['😫', '😟', '😐', '🙂', '😊'][todayEntry.morning.condition - 1]} (${todayEntry.morning.condition}/5)</div>
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">気分: ${['😔', '😕', '😐', '😌', '😄'][todayEntry.morning.mood - 1]} (${todayEntry.morning.mood}/5)</div>
                                    ${((todayEntry.morning.weight !== null && todayEntry.morning.weight !== undefined && todayEntry.morning.weight !== '')) ? `
                                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">体重: ${todayEntry.morning.weight}kg</div>
                                    ` : ''}
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">最優先事項:</div>
                                    <div style="font-size: 13px; background: var(--surface); padding: 8px; border-radius: 6px; margin-top: 4px;">${todayEntry.morning.priority || 'なし'}</div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="journal-entry-item ${hasEvening ? 'expandable' : ''}" data-type="evening" data-date="${todayKey}"
                        style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; overflow: hidden; transition: all 0.3s;"
                        ${hasEvening ? 'oncontextmenu="showJournalContextMenu(event, \'evening\'); return false;"' : ''}>
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; cursor: ${hasEvening ? 'pointer' : 'default'};" 
                            ${hasEvening ? 'onclick="toggleJournalExpand(this.parentElement, \'evening\', \'' + todayKey + '\')"}' : ''}>
                            <span style="font-size: 14px;">🌙 夜のジャーナル</span>
                            ${hasEvening 
                                ? `<div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="color: #10b981; font-size: 12px;">✅</span>
                                    <span class="expand-icon" style="font-size: 12px; transition: transform 0.3s;">▼</span>
                                  </div>`
                                : `<span style="color: #f59e0b; font-size: 12px;">⏳ まだ記録していません</span>`
                            }
                        </div>
                        ${hasEvening ? `
                            <div class="journal-content" style="display: none; padding: 0 12px 12px; border-top: 1px solid var(--border);">
                                <div style="margin-top: 12px;">
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">うまくいったこと:</div>
                                    <div style="font-size: 13px; background: var(--surface); padding: 8px; border-radius: 6px; margin-bottom: 8px;">${todayEntry.evening.success || 'なし'}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">改善点:</div>
                                    <div style="font-size: 13px; background: var(--surface); padding: 8px; border-radius: 6px;">${todayEntry.evening.improvement || 'なし'}</div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${data.dailyJournal.stats.currentStreak > 0 ? `
                        <div style="text-align: center; padding: 4px; background: linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1)); border-radius: 8px; margin-top: 4px;">
                            <span style="font-size: 12px; color: #fbbf24;">🔥 ${data.dailyJournal.stats.currentStreak}日連続記録中！</span>
                        </div>
                    ` : ''}
                    
                    <!-- 過去のジャーナル履歴ボタン -->
                    ${pastJournals.length > 1 ? `
                        <button onclick="showJournalHistory()" style="
                            margin-top: 8px;
                            padding: 10px;
                            background: linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1));
                            border: 1px solid rgba(59, 130, 246, 0.3);
                            border-radius: 8px;
                            color: var(--text-primary);
                            cursor: pointer;
                            font-size: 13px;
                            transition: all 0.3s;
                        " onmouseover="this.style.background='linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))'" 
                           onmouseout="this.style.background='linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.1))'">
                            📚 過去のジャーナルを見る
                        </button>
                    ` : ''}
                </div>
            `;
        }
        
        // ジャーナル用の日付キーを取得（getActivityDateKeyを使用）
        function getJournalDateKey() {
            return getActivityDateKey();
        }
        
        // ジャーナルエントリの展開/折りたたみ
        function toggleJournalExpand(element, type, dateKey) {
            const content = element.querySelector('.journal-content');
            const icon = element.querySelector('.expand-icon');
            
            if (content) {
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    if (icon) icon.style.transform = 'rotate(180deg)';
                } else {
                    content.style.display = 'none';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                }
            }
        }
        window.toggleJournalExpand = toggleJournalExpand;
        
        // 過去のジャーナル履歴を表示
        function showJournalHistory() {
            const data = loadData();
            const entries = data.dailyJournal.entries || {};
            
            // 日付順にソート（新しい順）
            const sortedDates = Object.keys(entries)
                .filter(key => entries[key].morning || entries[key].evening)
                .sort((a, b) => b.localeCompare(a))
                .slice(0, 30); // 最大30日分
            
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '600px';
            modal.style.maxHeight = '80vh';
            modal.style.overflow = 'auto';
            modal.style.padding = '24px';
            
            let historyHTML = `
                <div class="modal-header" style="margin-bottom: 20px; position: sticky; top: -24px; background: var(--surface); padding: 24px 0 12px; margin-top: -24px; z-index: 10;">
                    <h3 style="font-size: 20px; margin-bottom: 8px;">📚 ジャーナル履歴</h3>
                    <p style="color: var(--text-secondary); font-size: 14px;">過去30日間の記録</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
            `;
            
            sortedDates.forEach(dateKey => {
                const entry = entries[dateKey];
                const date = new Date(dateKey);
                const dateStr = date.toLocaleDateString('ja-JP', { 
                    month: 'numeric', 
                    day: 'numeric', 
                    weekday: 'short' 
                });
                
                historyHTML += `
                    <div style="border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: rgba(255, 255, 255, 0.02);">
                        <div style="padding: 12px; background: rgba(255, 255, 255, 0.03); border-bottom: 1px solid var(--border);">
                            <strong style="font-size: 14px;">📅 ${dateStr}</strong>
                        </div>
                `;
                
                if (entry.morning) {
                    const sleepInfo = entry.morning.sleepHours 
                        ? `😴 睡眠${entry.morning.sleepHours}時間` 
                        : '';
                    const weightInfo = entry.morning.weight !== null && entry.morning.weight !== undefined && entry.morning.weight !== '' 
                        ? `⚖️ ${entry.morning.weight}kg` 
                        : '';
                    
                    historyHTML += `
                        <div class="history-journal-item" style="padding: 12px; border-bottom: 1px solid var(--border);">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
                                <span style="font-size: 14px; font-weight: 600;">🌅 朝のジャーナル</span>
                                ${sleepInfo ? `<span style="font-size: 11px; color: var(--text-secondary);">${sleepInfo}</span>` : ''}
                                ${weightInfo ? `<span style="font-size: 11px; color: var(--text-secondary);">${weightInfo}</span>` : ''}
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary); display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px;">
                                <span>体調: ${['😫', '😟', '😐', '🙂', '😊'][entry.morning.condition - 1]} ${entry.morning.condition}/5</span>
                                <span>気分: ${['😔', '😕', '😐', '😌', '😄'][entry.morning.mood - 1]} ${entry.morning.mood}/5</span>
                            </div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">最優先事項:</div>
                            <div style="font-size: 13px; background: var(--surface); padding: 8px; border-radius: 6px;">
                                ${entry.morning.priority || 'なし'}
                            </div>
                        </div>
                    `;
                }
                
                if (entry.evening) {
                    historyHTML += `
                        <div class="history-journal-item" style="padding: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-size: 14px; font-weight: 600;">🌙 夜のジャーナル</span>
                            </div>
                            <div style="margin-bottom: 8px;">
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">うまくいったこと:</div>
                                <div style="font-size: 13px; background: var(--surface); padding: 8px; border-radius: 6px;">
                                    ${entry.evening.success || 'なし'}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">改善点:</div>
                                <div style="font-size: 13px; background: var(--surface); padding: 8px; border-radius: 6px;">
                                    ${entry.evening.improvement || 'なし'}
                                </div>
                            </div>
                        </div>
                    `;
                }
                
                historyHTML += `</div>`;
            });
            
            historyHTML += `
                </div>
                <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; position: sticky; bottom: -24px; background: var(--surface); padding: 12px 0 0; margin-bottom: -24px;">
                    <button class="button secondary" onclick="this.closest('.overlay').remove()">閉じる</button>
                </div>
            `;
            
            modal.innerHTML = historyHTML;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // オーバーレイクリックで閉じる
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            };
        }
        window.showJournalHistory = showJournalHistory;
        
        // ジャーナルモーダルを開く
        function openJournalModal() {
            const data = loadData();
            const todayKey = getJournalDateKey(); // 深夜対応の日付キー
            const todayEntry = data.dailyJournal.entries[todayKey] || {};
            const currentHour = new Date().getHours();
            
            // 朝か夜かを判定（12時を境に、ただし深夜2時まで夜扱い）
            const isMorning = currentHour >= 2 && currentHour < 12;
            const showMorning = isMorning || !todayEntry.morning;
            
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '520px';
            modal.style.padding = '24px';
            
            if (showMorning) {
                // 朝のジャーナル
                modal.innerHTML = `
                    <div class="modal-header" style="margin-bottom: 20px;">
                        <h3 style="font-size: 20px; margin-bottom: 8px;">🌅 朝のジャーナル</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">今日のスタートを記録しましょう</p>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">体調はどうですか？</label>
                        <div id="condition-selector" style="display: flex; gap: 12px; justify-content: space-between;">
                            ${[1,2,3,4,5].map(i => `
                                <button class="mood-btn" data-value="${i}" style="
                                    flex: 1;
                                    padding: 12px;
                                    border: 2px solid var(--border);
                                    border-radius: 12px;
                                    background: var(--surface);
                                    cursor: pointer;
                                    transition: all 0.3s;
                                    text-align: center;
                                ">
                                    <div style="font-size: 24px; margin-bottom: 4px;">${['😫', '😟', '😐', '🙂', '😊'][i-1]}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${i}</div>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">睡眠時間</label>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div style="flex: 1;">
                                <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">昨夜の就寝時刻</label>
                                <input type="time" id="bedtime-input" 
                                    value="${todayEntry.morning?.bedtime || ''}" 
                                    style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; 
                                    background: var(--surface); color: var(--text-primary);">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">今朝の起床時刻</label>
                                <input type="time" id="wakeup-input" 
                                    value="${todayEntry.morning?.wakeup || ''}" 
                                    style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; 
                                    background: var(--surface); color: var(--text-primary);">
                            </div>
                        </div>
                        <div id="sleep-duration" style="margin-top: 8px; font-size: 14px; color: var(--text-secondary);"></div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">気分はどうですか？</label>
                        <div id="mood-selector" style="display: flex; gap: 12px; justify-content: space-between;">
                            ${[1,2,3,4,5].map(i => `
                                <button class="mood-btn" data-value="${i}" style="
                                    flex: 1;
                                    padding: 12px;
                                    border: 2px solid var(--border);
                                    border-radius: 12px;
                                    background: var(--surface);
                                    cursor: pointer;
                                    transition: all 0.3s;
                                    text-align: center;
                                ">
                                    <div style="font-size: 24px; margin-bottom: 4px;">${['😔', '😕', '😐', '😌', '😄'][i-1]}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${i}</div>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">体重 (任意)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="number" id="weight-input" placeholder="例: 65.52" step="0.01" 
                                value="${todayEntry.morning?.weight || ''}" 
                                style="width: 120px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; 
                                background: var(--surface); color: var(--text-primary);">
                            <span style="color: var(--text-secondary); font-size: 14px;">kg</span>
                        </div>
                        <small style="display: block; margin-top: 4px; color: var(--text-secondary); font-size: 12px;">
                            ※記録しなくてもジャーナルは完了できます
                        </small>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">今日の最優先事項は？</label>
                        <textarea id="priority-input" placeholder="例: プロジェクトXの企画書を完成させる" 
                            style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; 
                            background: var(--surface); color: var(--text-primary); min-height: 80px; resize: vertical;"
                            maxlength="200">${todayEntry.morning?.priority || ''}</textarea>
                        <div style="text-align: right; margin-top: 4px;">
                            <span id="priority-count" style="font-size: 12px; color: var(--text-secondary);">0/200</span>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                        <button class="button primary" onclick="saveMorningJournal()" style="background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);">
                            📝 保存して+1pt獲得
                        </button>
                    </div>
                `;
            } else {
                // 夜のジャーナル
                modal.innerHTML = `
                    <div class="modal-header" style="margin-bottom: 20px;">
                        <h3 style="font-size: 20px; margin-bottom: 8px;">🌙 夜のジャーナル</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">今日を振り返ってみましょう</p>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">今日うまくいったことは？</label>
                        <textarea id="success-input" placeholder="例: 企画書を予定通り完成できた。チームとの連携もスムーズだった" 
                            style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; 
                            background: var(--surface); color: var(--text-primary); min-height: 100px; resize: vertical;"
                            maxlength="300">${todayEntry.evening?.success || ''}</textarea>
                        <div style="text-align: right; margin-top: 4px;">
                            <span id="success-count" style="font-size: 12px; color: var(--text-secondary);">0/300</span>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">改善点は？</label>
                        <textarea id="improvement-input" placeholder="例: 時間配分をもっと計画的にすべきだった" 
                            style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; 
                            background: var(--surface); color: var(--text-primary); min-height: 100px; resize: vertical;"
                            maxlength="300">${todayEntry.evening?.improvement || ''}</textarea>
                        <div style="text-align: right; margin-top: 4px;">
                            <span id="improvement-count" style="font-size: 12px; color: var(--text-secondary);">0/300</span>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                        <button class="button primary" onclick="saveEveningJournal()" style="background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);">
                            📝 保存して+1pt獲得
                        </button>
                    </div>
                `;
            }
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // イベントリスナーを設定
            setTimeout(() => {
                if (showMorning) {
                    // 体調セレクター
                    document.querySelectorAll('#condition-selector .mood-btn').forEach(btn => {
                        btn.onclick = () => {
                            document.querySelectorAll('#condition-selector .mood-btn').forEach(b => {
                                b.style.border = '2px solid var(--border)';
                                b.style.background = 'var(--surface)';
                            });
                            btn.style.border = '2px solid #10b981';
                            btn.style.background = 'rgba(16, 185, 129, 0.1)';
                            btn.dataset.selected = 'true';
                        };
                        // 既存の値があれば選択
                        if (todayEntry.morning?.condition == btn.dataset.value) {
                            btn.click();
                        }
                    });
                    
                    // 気分セレクター
                    document.querySelectorAll('#mood-selector .mood-btn').forEach(btn => {
                        btn.onclick = () => {
                            document.querySelectorAll('#mood-selector .mood-btn').forEach(b => {
                                b.style.border = '2px solid var(--border)';
                                b.style.background = 'var(--surface)';
                            });
                            btn.style.border = '2px solid #3b82f6';
                            btn.style.background = 'rgba(59, 130, 246, 0.1)';
                            btn.dataset.selected = 'true';
                        };
                        // 既存の値があれば選択
                        if (todayEntry.morning?.mood == btn.dataset.value) {
                            btn.click();
                        }
                    });
                    
                    // 睡眠時間の計算
                    const bedtimeInput = document.getElementById('bedtime-input');
                    const wakeupInput = document.getElementById('wakeup-input');
                    const sleepDuration = document.getElementById('sleep-duration');
                    
                    const calculateSleepHours = () => {
                        if (bedtimeInput.value && wakeupInput.value) {
                            const bedtime = new Date(`2000-01-01 ${bedtimeInput.value}`);
                            let wakeup = new Date(`2000-01-01 ${wakeupInput.value}`);
                            
                            // 起床時刻が就寝時刻より早い場合は翌日として計算
                            if (wakeup <= bedtime) {
                                wakeup = new Date(`2000-01-02 ${wakeupInput.value}`);
                            }
                            
                            const diff = wakeup - bedtime;
                            const hours = Math.floor(diff / (1000 * 60 * 60));
                            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                            
                            const hoursStr = hours + (minutes / 60);
                            const displayStr = minutes > 0 ? `${hours}時間${minutes}分` : `${hours}時間`;
                            
                            sleepDuration.innerHTML = `😴 睡眠時間: <strong>${displayStr}</strong>`;
                            if (hoursStr < 6) {
                                sleepDuration.innerHTML += ` <span style="color: #ef4444;">⚠️ 睡眠不足です</span>`;
                            } else if (hoursStr >= 7 && hoursStr <= 9) {
                                sleepDuration.innerHTML += ` <span style="color: #10b981;">✅ 理想的です</span>`;
                            }
                            
                            return hoursStr.toFixed(1);
                        } else {
                            sleepDuration.innerHTML = '';
                            return null;
                        }
                    };
                    
                    bedtimeInput.oninput = calculateSleepHours;
                    wakeupInput.oninput = calculateSleepHours;
                    calculateSleepHours();
                    
                    // 文字数カウント
                    const priorityInput = document.getElementById('priority-input');
                    const priorityCount = document.getElementById('priority-count');
                    priorityInput.oninput = () => {
                        priorityCount.textContent = `${priorityInput.value.length}/200`;
                    };
                    priorityInput.oninput();
                } else {
                    // 文字数カウント
                    const successInput = document.getElementById('success-input');
                    const successCount = document.getElementById('success-count');
                    const improvementInput = document.getElementById('improvement-input');
                    const improvementCount = document.getElementById('improvement-count');
                    
                    successInput.oninput = () => {
                        successCount.textContent = `${successInput.value.length}/300`;
                    };
                    improvementInput.oninput = () => {
                        improvementCount.textContent = `${improvementInput.value.length}/300`;
                    };
                    successInput.oninput();
                    improvementInput.oninput();
                }
            }, 100);
        }
        
        // 朝のジャーナルを保存
        function saveMorningJournal() {
            let data = loadData();
            const todayKey = getJournalDateKey(); // 深夜対応の日付キー
            
            // 選択された値を取得
            const conditionBtn = document.querySelector('#condition-selector .mood-btn[data-selected="true"]');
            const moodBtn = document.querySelector('#mood-selector .mood-btn[data-selected="true"]');
            const priority = document.getElementById('priority-input').value.trim();
            const bedtime = document.getElementById('bedtime-input').value;
            const wakeup = document.getElementById('wakeup-input').value;
            const weightInput = document.getElementById('weight-input').value.trim(); // 体重（任意）
            const weight = weightInput ? parseFloat(weightInput) : null;
            
            // 睡眠時間を計算
            let sleepHours = null;
            if (bedtime && wakeup) {
                const bedtimeDate = new Date(`2000-01-01 ${bedtime}`);
                let wakeupDate = new Date(`2000-01-01 ${wakeup}`);
                if (wakeupDate <= bedtimeDate) {
                    wakeupDate = new Date(`2000-01-02 ${wakeup}`);
                }
                const diff = wakeupDate - bedtimeDate;
                sleepHours = (diff / (1000 * 60 * 60)).toFixed(1);
            }
            
            // 体重以外の必須項目をチェック（体重は任意）
            if (!conditionBtn || !moodBtn || !priority) {
                showNotification('体重以外のすべての項目を入力してください', 'error');
                return;
            }
            
            // データを保存
            if (!data.dailyJournal.entries[todayKey]) {
                data.dailyJournal.entries[todayKey] = {};
            }
            
            console.log('朝のジャーナル：既存データ =', data.dailyJournal.entries[todayKey].morning);
            const isFirstTime = !data.dailyJournal.entries[todayKey].morning;
            console.log('朝のジャーナル：初回判定 =', isFirstTime);
            
            data.dailyJournal.entries[todayKey].morning = {
                condition: parseInt(conditionBtn.dataset.value),
                mood: parseInt(moodBtn.dataset.value),
                priority: priority,
                bedtime: bedtime,
                wakeup: wakeup,
                sleepHours: sleepHours,
                weight: weight, // 体重を保存（入力があれば）
                timestamp: new Date().toISOString(),
                pointsEarned: isFirstTime ? 1 : 0
            };
            
            // ストリークを更新
            updateJournalStreak(data);
            
            // ジャーナルデータを保存
            // 最後にアクティブイベントをサニタイズ＆重複排除
            try {
                if (data.events && Array.isArray(data.events.activeBoosts)) {
                    let boosts = data.events.activeBoosts.map(b => {
                        if (b && b.eventId === 'weekend_special') {
                            b.value = 1.2;
                            b.description = '週末はポイント1.2倍！';
                        }
                        return b;
                    }).filter(b => {
                        if (!b) return false;
                        if (b.eventId === 'weekend_special') {
                            const desc = String(b.description || '');
                            if (desc.includes('1.5') || desc.includes('×1.5')) return false;
                        }
                        return true;
                    });
                    const dedup = new Map();
                    for (const b of boosts) {
                        const key = b && b.eventId ? `id:${b.eventId}` : `name:${b?.name || ''}|desc:${b?.description || ''}`;
                        dedup.set(key, b);
                    }
                    data.events.activeBoosts = Array.from(dedup.values());
                }
            } catch (_) { /* noop */ }

            saveData(data);
            
            // ポイントを付与（初回のみ）
            if (isFirstTime) {
                console.log('朝のジャーナル：初回記録なのでポイント付与');
                earnPoints(1, 'journal', '🌅 朝のジャーナル記録');
            }
            
            // UIを更新
            updateJournalStatus();
            
            // モーダルを閉じる
            document.querySelector('.overlay').remove();
            
            showNotification('🌅 朝のジャーナルを記録しました！', 'success');
        }
        
        // 夜のジャーナルを保存
        function saveEveningJournal() {
            let data = loadData();
            const todayKey = getJournalDateKey(); // 深夜対応の日付キー
            
            const success = document.getElementById('success-input').value.trim();
            const improvement = document.getElementById('improvement-input').value.trim();
            
            if (!success || !improvement) {
                showNotification('すべての項目を入力してください', 'error');
                return;
            }
            
            // データを保存
            if (!data.dailyJournal.entries[todayKey]) {
                data.dailyJournal.entries[todayKey] = {};
            }
            
            console.log('夜のジャーナル：既存データ =', data.dailyJournal.entries[todayKey].evening);
            const isFirstTime = !data.dailyJournal.entries[todayKey].evening;
            console.log('夜のジャーナル：初回判定 =', isFirstTime);
            
            data.dailyJournal.entries[todayKey].evening = {
                success: success,
                improvement: improvement,
                timestamp: new Date().toISOString(),
                pointsEarned: isFirstTime ? 1 : 0
            };
            
            // ストリークを更新
            updateJournalStreak(data);
            
            // ジャーナルデータを保存
            saveData(data);
            
            // ポイントを付与（初回のみ）
            if (isFirstTime) {
                console.log('夜のジャーナル：初回記録なのでポイント付与');
                earnPoints(1, 'journal', '🌙 夜のジャーナル記録');
            }
            
            // UIを更新
            updateJournalStatus();
            
            // モーダルを閉じる
            document.querySelector('.overlay').remove();
            
            showNotification('🌙 夜のジャーナルを記録しました！', 'success');
        }
        
        // ジャーナル統計を更新
        function updateJournalStats() {
            const data = loadData();
            const container = document.getElementById('journal-stats-content');
            
            if (!container || !data.dailyJournal) return;
            
            const entries = data.dailyJournal.entries || {};
            const entryDates = Object.keys(entries).sort();
            
            // 基本統計
            const totalEntries = entryDates.length;
            const morningEntries = entryDates.filter(date => entries[date].morning).length;
            const eveningEntries = entryDates.filter(date => entries[date].evening).length;
            const completeEntries = entryDates.filter(date => entries[date].morning && entries[date].evening).length;
            
            // 最近7日間の体調・気分・睡眠を計算
            const last7Days = entryDates.slice(-7);
            let avgCondition = 0;
            let avgMood = 0;
            let avgSleep = 0;
            let conditionCount = 0;
            let moodCount = 0;
            let sleepCount = 0;
            
            // 全期間の睡眠統計
            let totalSleep = 0;
            let totalSleepCount = 0;
            let bestSleep = { hours: 0, date: '' };
            let worstSleep = { hours: 24, date: '' };
            
            entryDates.forEach(date => {
                if (entries[date].morning && entries[date].morning.sleepHours) {
                    const hours = parseFloat(entries[date].morning.sleepHours);
                    totalSleep += hours;
                    totalSleepCount++;
                    
                    if (hours > bestSleep.hours) {
                        bestSleep = { hours, date };
                    }
                    if (hours < worstSleep.hours) {
                        worstSleep = { hours, date };
                    }
                }
            });
            
            last7Days.forEach(date => {
                if (entries[date].morning) {
                    if (entries[date].morning.condition) {
                        avgCondition += entries[date].morning.condition;
                        conditionCount++;
                    }
                    if (entries[date].morning.mood) {
                        avgMood += entries[date].morning.mood;
                        moodCount++;
                    }
                    if (entries[date].morning.sleepHours) {
                        avgSleep += parseFloat(entries[date].morning.sleepHours);
                        sleepCount++;
                    }
                }
            });
            
            if (conditionCount > 0) avgCondition = (avgCondition / conditionCount).toFixed(1);
            if (moodCount > 0) avgMood = (avgMood / moodCount).toFixed(1);
            if (sleepCount > 0) avgSleep = (avgSleep / sleepCount).toFixed(1);
            const totalAvgSleep = totalSleepCount > 0 ? (totalSleep / totalSleepCount).toFixed(1) : null;
            
            // よくできたことTOP3を抽出
            const successWords = {};
            const improvementWords = {};
            
            entryDates.forEach(date => {
                if (entries[date].evening) {
                    // 簡単な単語抽出（名詞っぽいもの）
                    if (entries[date].evening.success) {
                        const words = entries[date].evening.success.match(/[一-龥]{2,}/g) || [];
                        words.forEach(word => {
                            successWords[word] = (successWords[word] || 0) + 1;
                        });
                    }
                    if (entries[date].evening.improvement) {
                        const words = entries[date].evening.improvement.match(/[一-龥]{2,}/g) || [];
                        words.forEach(word => {
                            improvementWords[word] = (improvementWords[word] || 0) + 1;
                        });
                    }
                }
            });
            
            const topSuccess = Object.entries(successWords)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([word, count]) => `${word} (${count}回)`);
            
            const topImprovement = Object.entries(improvementWords)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([word, count]) => `${word} (${count}回)`);
            
            // 過去30日間のデータを取得（感情推移グラフ用）
            const last30Days = [];
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateKey = dateKeyLocal(date);
                const entry = entries[dateKey];
                
                last30Days.push({
                    date: (date.getMonth() + 1) + '/' + date.getDate(),
                    condition: entry?.morning?.condition || null,
                    mood: entry?.morning?.mood || null,
                    hasData: !!(entry?.morning)
                });
            }
            
            // 曜日別パターン分析
            const weekdayStats = {
                0: { name: '日', condition: [], mood: [], records: 0 },
                1: { name: '月', condition: [], mood: [], records: 0 },
                2: { name: '火', condition: [], mood: [], records: 0 },
                3: { name: '水', condition: [], mood: [], records: 0 },
                4: { name: '木', condition: [], mood: [], records: 0 },
                5: { name: '金', condition: [], mood: [], records: 0 },
                6: { name: '土', condition: [], mood: [], records: 0 }
            };
            
            entryDates.forEach(dateStr => {
                const [year, month, day] = dateStr.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                const weekday = date.getDay();
                const entry = entries[dateStr];
                
                if (entry.morning) {
                    weekdayStats[weekday].records++;
                    if (entry.morning.condition) {
                        weekdayStats[weekday].condition.push(entry.morning.condition);
                    }
                    if (entry.morning.mood) {
                        weekdayStats[weekday].mood.push(entry.morning.mood);
                    }
                }
            });
            
            // 曜日別平均を計算
            const weekdayAverages = Object.entries(weekdayStats).map(([day, stats]) => {
                const avgCondition = stats.condition.length > 0 
                    ? (stats.condition.reduce((a, b) => a + b, 0) / stats.condition.length).toFixed(1)
                    : null;
                const avgMood = stats.mood.length > 0
                    ? (stats.mood.reduce((a, b) => a + b, 0) / stats.mood.length).toFixed(1)
                    : null;
                
                return {
                    day: parseInt(day),
                    name: stats.name,
                    avgCondition,
                    avgMood,
                    records: stats.records
                };
            });
            
            // ベスト＆ワースト曜日を特定
            const validWeekdays = weekdayAverages.filter(d => d.avgCondition && d.avgMood);
            const bestDay = validWeekdays.length > 0 
                ? validWeekdays.reduce((best, current) => {
                    const bestScore = parseFloat(best.avgCondition) + parseFloat(best.avgMood);
                    const currentScore = parseFloat(current.avgCondition) + parseFloat(current.avgMood);
                    return currentScore > bestScore ? current : best;
                })
                : null;
            
            const worstDay = validWeekdays.length > 0
                ? validWeekdays.reduce((worst, current) => {
                    const worstScore = parseFloat(worst.avgCondition) + parseFloat(worst.avgMood);
                    const currentScore = parseFloat(current.avgCondition) + parseFloat(current.avgMood);
                    return currentScore < worstScore ? current : worst;
                })
                : null;
            
            container.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px;">
                    <div style="text-align: center; background: var(--surface-light); border: 1px solid var(--border); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #a855f7;">${data.dailyJournal.stats.currentStreak}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">現在のストリーク</div>
                    </div>
                    <div style="text-align: center; background: var(--surface-light); border: 1px solid var(--border); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${completeEntries}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">完全記録日数</div>
                    </div>
                    <div style="text-align: center; background: var(--surface-light); border: 1px solid var(--border); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #10b981;">${avgCondition || '-'}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">平均体調 (7日)</div>
                    </div>
                    <div style="text-align: center; background: var(--surface-light); border: 1px solid var(--border); padding: 12px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${avgMood || '-'}</div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">平均気分 (7日)</div>
                    </div>
                </div>
                
                <!-- 睡眠統計 -->
                <div style="background: var(--surface-light); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">😴 睡眠統計</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                        <div style="text-align: center; background: var(--surface); border: 1px solid var(--border); padding: 8px; border-radius: 6px;">
                            <div style="font-size: 20px; font-weight: bold; color: #8b5cf6;">${avgSleep || '-'}時間</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">平均睡眠 (7日)</div>
                        </div>
                        <div style="text-align: center; background: var(--surface); border: 1px solid var(--border); padding: 8px; border-radius: 6px;">
                            <div style="font-size: 20px; font-weight: bold; color: #6366f1;">${totalAvgSleep || '-'}時間</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">平均睡眠 (全期間)</div>
                        </div>
                        ${bestSleep.date ? `
                        <div style="text-align: center; background: var(--surface); border: 1px solid var(--border); padding: 8px; border-radius: 6px;">
                            <div style="font-size: 16px; font-weight: bold; color: #10b981;">${bestSleep.hours}時間</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">最長 (${bestSleep.date.slice(5)})</div>
                        </div>
                        <div style="text-align: center; background: var(--surface); border: 1px solid var(--border); padding: 8px; border-radius: 6px;">
                            <div style="font-size: 16px; font-weight: bold; color: #ef4444;">${worstSleep.hours}時間</div>
                            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">最短 (${worstSleep.date.slice(5)})</div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                ${
                    // 感情推移グラフ
                    last30Days.some(d => d.hasData) ? `
                    <div style="background: var(--surface-light); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                        <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">📈 感情推移（30日間）</h4>
                        <div style="position: relative; height: 120px; border-left: 2px solid var(--border); border-bottom: 2px solid var(--border);">
                            <div style="position: absolute; left: -20px; top: 0; font-size: 10px; color: var(--text-secondary);">5</div>
                            <div style="position: absolute; left: -20px; top: 50%; transform: translateY(-50%); font-size: 10px; color: var(--text-secondary);">3</div>
                            <div style="position: absolute; left: -20px; bottom: 0; font-size: 10px; color: var(--text-secondary);">1</div>
                            
                            <!-- 体調の線 -->
                            <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" viewBox="0 0 100 100" preserveAspectRatio="none">
                                <polyline
                                    points="${last30Days.map((d, i) => {
                                        if (!d.condition) return null;
                                        const x = (i / 29) * 100;
                                        const y = 100 - ((d.condition - 1) / 4) * 100;
                                        return `${x},${y}`;
                                    }).filter(p => p).join(' ')}"
                                    fill="none"
                                    stroke="#10b981"
                                    stroke-width="2"
                                    opacity="0.8"
                                />
                                <!-- 気分の線 -->
                                <polyline
                                    points="${last30Days.map((d, i) => {
                                        if (!d.mood) return null;
                                        const x = (i / 29) * 100;
                                        const y = 100 - ((d.mood - 1) / 4) * 100;
                                        return `${x},${y}`;
                                    }).filter(p => p).join(' ')}"
                                    fill="none"
                                    stroke="#f59e0b"
                                    stroke-width="2"
                                    opacity="0.8"
                                />
                            </svg>
                            
                            <!-- 日付ラベル -->
                            <div style="display: flex; justify-content: space-between; position: absolute; bottom: -20px; left: 0; right: 0; font-size: 10px; color: var(--text-secondary);">
                                <span>${last30Days[0].date}</span>
                                <span>${last30Days[14].date}</span>
                                <span>${last30Days[29].date}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 16px; margin-top: 24px; font-size: 11px;">
                            <span style="color: #10b981;">● 体調</span>
                            <span style="color: #f59e0b;">● 気分</span>
                        </div>
                    </div>
                ` : ''
                }

                ${
                    // 睡眠時間の推移（過去30日）
                    totalEntries > 0 ? `
                    <div style=\"background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; margin-top: 16px;\">
                        <h4 style=\"font-size: 14px; margin-bottom: 12px; color: var(--text-primary);\">😴 睡眠時間の推移（30日）</h4>
                        ${generateSleepTrend(entries)}
                    </div>
                ` : ''
                }

                ${
                    // 睡眠と体調/気分/達成率の相関
                    totalEntries > 0 ? `
                    <div style=\"background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; margin-top: 16px;\">
                        <h4 style=\"font-size: 14px; margin-bottom: 12px; color: var(--text-primary);\">🔗 睡眠と各指標の相関</h4>
                        ${generateSleepCorrelations(entries, data)}
                    </div>
                ` : ''
                }
                
                ${
                    // 曜日別パターン
                    validWeekdays.length > 0 ? `
                    <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                        <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">🗓️ 曜日別パターン</h4>
                        <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-bottom: 12px;">
                            ${weekdayAverages.map(day => `
                                <div style="text-align: center; padding: 8px 4px; background: ${
                                    bestDay && day.day === bestDay.day ? 'rgba(16, 185, 129, 0.2)' :
                                    worstDay && day.day === worstDay.day ? 'rgba(239, 68, 68, 0.2)' :
                                    'rgba(255,255,255,0.05)'
                                }; border-radius: 6px; border: 1px solid ${
                                    bestDay && day.day === bestDay.day ? 'rgba(16, 185, 129, 0.5)' :
                                    worstDay && day.day === worstDay.day ? 'rgba(239, 68, 68, 0.5)' :
                                    'transparent'
                                };">
                                    <div style="font-size: 12px; font-weight: bold; margin-bottom: 4px;">${day.name}</div>
                                    <div style="font-size: 10px; color: #10b981;">😊 ${day.avgCondition || '-'}</div>
                                    <div style="font-size: 10px; color: #f59e0b;">💭 ${day.avgMood || '-'}</div>
                                    <div style="font-size: 9px; color: var(--text-secondary); margin-top: 2px;">${day.records}回</div>
                                </div>
                            `).join('')}
                        </div>
                        ${bestDay ? `
                            <div style="display: flex; gap: 12px; font-size: 11px;">
                                <span style="color: #10b981;">✨ 最も調子が良い: ${bestDay.name}曜日</span>
                                ${worstDay ? `<span style="color: #ef4444;">📊 調子が低い: ${worstDay.name}曜日</span>` : ''}
                            </div>
                        ` : ''}
                    </div>
                ` : ''
                }
                
                ${topSuccess.length > 0 ? `
                    <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                        <h4 style="font-size: 14px; margin-bottom: 8px; color: #10b981;">🏆 よくできたこと TOP3</h4>
                        <ol style="margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-secondary);">
                            ${topSuccess.map(item => `<li>${item}</li>`).join('')}
                        </ol>
                    </div>
                ` : ''}
                
                ${topImprovement.length > 0 ? `
                    <div style="background: rgba(245, 158, 11, 0.1); padding: 12px; border-radius: 8px;">
                        <h4 style="font-size: 14px; margin-bottom: 8px; color: #f59e0b;">💡 改善テーマ TOP3</h4>
                        <ol style="margin: 0; padding-left: 20px; font-size: 12px; color: var(--text-secondary);">
                            ${topImprovement.map(item => `<li>${item}</li>`).join('')}
                        </ol>
                    </div>
                ` : ''}
                
                ${totalEntries === 0 ? `
                    <div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 14px;">
                        まだジャーナルの記録がありません
                    </div>
                ` : ''}
                
                ${
                    // 月別記録率と感情推移
                    totalEntries > 0 ? `
                    <div style="background: var(--surface-light); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-top: 16px;">
                        <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">📅 月別記録状況</h4>
                        ${generateMonthlyStats(entries)}
                    </div>
                ` : ''
                }
                
                
                
                ${
                    // 感情と習慣達成率の相関
                    totalEntries > 0 && data.currentHypotheses && data.currentHypotheses.length > 0 ? `
                    <div style="background: var(--surface-light); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-top: 16px;">
                        <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">🔗 感情と習慣の相関</h4>
                        ${generateEmotionHabitCorrelation(entries, data.currentHypotheses)}
                    </div>
                ` : ''
                }
                
                ${
                    // キーワードクラウド
                    totalEntries > 10 ? `
                    <div style="background: rgba(0,0,0,0.2); padding: 16px; border-radius: 8px; margin-top: 16px;">
                        <h4 style="font-size: 14px; margin-bottom: 12px; color: var(--text-primary);">☁️ よく使うキーワード</h4>
                        ${generateWordCloud(entries)}
                    </div>
                ` : ''
                }
            `;
        }

        // 過去30日の睡眠時間トレンド（簡易バーグラフ）
        function generateSleepTrend(entries) {
            const days = [];
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                const key = dateKeyLocal(d);
                const e = entries[key];
                const hours = e?.morning?.sleepHours ? parseFloat(e.morning.sleepHours) : null;
                days.push({ label: `${d.getMonth()+1}/${d.getDate()}`, value: hours });
            }
            const values = days.map(d => d.value).filter(v => v != null);
            const max = values.length ? Math.max(6, Math.ceil(Math.max(...values))) : 8;
            const min = 0;
            return `
                <div style=\"display:flex; gap:4px; align-items:flex-end; height:140px;\">
                    ${days.map(d => {
                        const h = d.value == null ? 0 : Math.max(2, Math.round(((d.value - min) / (max - min)) * 120));
                        const color = d.value == null ? 'transparent' : '#06b6d4';
                        const border = d.value == null ? '1px dashed rgba(255,255,255,0.2)' : 'none';
                        const tip = d.value == null ? `${d.label}: データなし` : `${d.label}: ${d.value.toFixed(1)}h`;
                        return `<div title=\"${tip}\" style=\"width:8px;height:${h}px;background:${color};border:${border};border-radius:3px;\"></div>`;
                    }).join('')}
                </div>
                <div style=\"display:flex; justify-content:space-between; font-size:10px; color: var(--text-secondary); margin-top:6px;\">
                    <span>${days[0].label}</span><span>${days[days.length-1].label}</span>
                </div>
            `;
        }

        // 相関: 睡眠時間と体調/気分/達成率
        function generateSleepCorrelations(entries, data) {
            function pearson(xs, ys) {
                const n = xs.length;
                if (n === 0) return { r: null, n: 0 };
                const mean = arr => arr.reduce((a,b)=>a+b,0)/arr.length;
                const mx = mean(xs), my = mean(ys);
                let num=0, dx=0, dy=0;
                for (let i=0;i<n;i++){ const x=xs[i]-mx; const y=ys[i]-my; num+=x*y; dx+=x*x; dy+=y*y; }
                const den = Math.sqrt(dx*dy);
                if (den === 0) return { r: 0, n };
                return { r: Math.round((num/den)*100)/100, n };
            }

            function dailyAchievementRate(key) {
                // 当日有効な習慣に対して達成率を計算（current + completed）
                const all = [...(data.currentHypotheses||[]), ...(data.completedHypotheses||[])];
                let total=0, achieved=0;
                all.forEach(h => {
                    try {
                        const start = new Date(h.startDate);
                        const end = h.endDate ? new Date(h.endDate) : new Date();
                        const kDate = new Date(key);
                        start.setHours(0,0,0,0); end.setHours(23,59,59,999); kDate.setHours(12,0,0,0);
                        if (kDate >= start && kDate <= end) {
                            total++;
                            if (h.achievements && h.achievements[key]) achieved++;
                        }
                    } catch(_){}
                });
                if (total === 0) return null;
                return achieved/total; // 0〜1
            }

            // 収集
            const keys = Object.keys(entries).sort();
            const sleep = [], condition = [], mood = [], achToday = [], achPrev = [];
            keys.forEach(k => {
                const m = entries[k]?.morning;
                if (!m || m.sleepHours == null) return;
                const s = parseFloat(m.sleepHours);
                // 体調・気分
                if (typeof m.condition === 'number') { sleep.push(s); condition.push(m.condition); }
                if (typeof m.mood === 'number') { /* separate arrays */ }
            });
            // 別途もう一度（気分用）
            const sleep2 = [], mood2 = [];
            keys.forEach(k => {
                const m = entries[k]?.morning; if (!m || m.sleepHours == null) return;
                const s = parseFloat(m.sleepHours);
                if (typeof m.mood === 'number') { sleep2.push(s); mood2.push(m.mood); }
            });
            // 達成率
            const sleep3 = [], rateToday = [], sleep4 = [], ratePrev = [];
            keys.forEach(k => {
                const m = entries[k]?.morning; if (!m || m.sleepHours == null) return;
                const s = parseFloat(m.sleepHours);
                const rT = dailyAchievementRate(k);
                // 前日
                const d = new Date(k); d.setDate(d.getDate()-1); const kPrev = dateKeyLocal(d);
                const rP = dailyAchievementRate(kPrev);
                if (rT != null) { sleep3.push(s); rateToday.push(rT); }
                if (rP != null) { sleep4.push(s); ratePrev.push(rP); }
            });

            const c1 = pearson(sleep, condition);
            const c2 = pearson(sleep2, mood2);
            const c3 = pearson(sleep3, rateToday);
            const c4 = pearson(sleep4, ratePrev);

            function label(c){ if (c.r==null) return '-'; const a=Math.abs(c.r); if(a>=0.7) return `${c.r} (強)`; if(a>=0.4) return `${c.r} (中)`; if(a>=0.2) return `${c.r} (弱)`; return `${c.r} (ほぼ無)`; }

            return `
                <div style=\"display:grid;grid-template-columns:repeat(2,1fr);gap:12px;\">
                    <div style=\"background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;\">
                        <div style=\"font-size:13px;\">😊 体調 × 睡眠</div>
                        <div style=\"font-size:22px;font-weight:800;color:#10b981;\">${label(c1)}</div>
                        <div style=\"font-size:10px;color:var(--text-secondary);\">n=${c1.n}</div>
                    </div>
                    <div style=\"background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;\">
                        <div style=\"font-size:13px;\">💭 気分 × 睡眠</div>
                        <div style=\"font-size:22px;font-weight:800;color:#f59e0b;\">${label(c2)}</div>
                        <div style=\"font-size:10px;color:var(--text-secondary);\">n=${c2.n}</div>
                    </div>
                    <div style=\"background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;\">
                        <div style=\"font-size:13px;\">✅ 当日達成率 × 睡眠</div>
                        <div style=\"font-size:22px;font-weight:800;color:#3b82f6;\">${label(c3)}</div>
                        <div style=\"font-size:10px;color:var(--text-secondary);\">n=${c3.n}</div>
                    </div>
                    <div style=\"background:rgba(255,255,255,0.05);padding:10px;border-radius:8px;\">
                        <div style=\"font-size:13px;\">📅 前日達成率 × 睡眠</div>
                        <div style=\"font-size:22px;font-weight:800;color:#8b5cf6;\">${label(c4)}</div>
                        <div style=\"font-size:10px;color:var(--text-secondary);\">n=${c4.n}</div>
                    </div>
                </div>
            `;
        }
        
        // 月別統計を生成
        function generateMonthlyStats(entries) {
            const monthlyData = {};
            
            // エントリを月別に集計
            Object.entries(entries).forEach(([dateStr, entry]) => {
                const [year, month] = dateStr.split('-');
                const monthKey = `${year}-${month}`;
                
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = {
                        total: 0,
                        morning: 0,
                        evening: 0,
                        complete: 0,
                        conditions: [],
                        moods: []
                    };
                }
                
                monthlyData[monthKey].total++;
                if (entry.morning) {
                    monthlyData[monthKey].morning++;
                    if (entry.morning.condition) monthlyData[monthKey].conditions.push(entry.morning.condition);
                    if (entry.morning.mood) monthlyData[monthKey].moods.push(entry.morning.mood);
                }
                if (entry.evening) monthlyData[monthKey].evening++;
                if (entry.morning && entry.evening) monthlyData[monthKey].complete++;
            });
            
            // 最新6ヶ月分を表示
            const sortedMonths = Object.keys(monthlyData).sort().slice(-6);
            
            return `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 8px;">
                    ${sortedMonths.map(monthKey => {
                        const data = monthlyData[monthKey];
                        const [year, month] = monthKey.split('-');
                        const daysInMonth = new Date(year, month, 0).getDate();
                        const recordRate = Math.round((data.complete / daysInMonth) * 100);
                        const avgCondition = data.conditions.length > 0 
                            ? (data.conditions.reduce((a, b) => a + b, 0) / data.conditions.length).toFixed(1)
                            : '-';
                        const avgMood = data.moods.length > 0
                            ? (data.moods.reduce((a, b) => a + b, 0) / data.moods.length).toFixed(1)
                            : '-';
                        
                        return `
                            <div style="text-align: center; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 6px;">
                                <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">${parseInt(month)}月</div>
                                <div style="font-size: 18px; font-weight: bold; color: ${
                                    recordRate >= 80 ? '#10b981' :
                                    recordRate >= 50 ? '#f59e0b' :
                                    '#ef4444'
                                };">${recordRate}%</div>
                                <div style="font-size: 9px; color: var(--text-secondary); margin-top: 2px;">
                                    😊${avgCondition} 💭${avgMood}
                                </div>
                                <div style="font-size: 9px; color: var(--text-secondary);">
                                    ${data.complete}/${daysInMonth}日
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }
        
        // 時間帯別パターン分析を生成
        function generateTimePatternAnalysis(entries) {
            const timePatterns = {
                morning: { early: 0, normal: 0, late: 0 },  // 早朝(~7時)、通常(7-9時)、遅め(9時~)
                evening: { early: 0, normal: 0, late: 0 }   // 早め(~20時)、通常(20-22時)、深夜(22時~)
            };
            
            Object.entries(entries).forEach(([dateStr, entry]) => {
                if (entry.morning && entry.morning.timestamp) {
                    const hour = new Date(entry.morning.timestamp).getHours();
                    if (hour < 7) timePatterns.morning.early++;
                    else if (hour < 9) timePatterns.morning.normal++;
                    else timePatterns.morning.late++;
                }
                if (entry.evening && entry.evening.timestamp) {
                    const hour = new Date(entry.evening.timestamp).getHours();
                    if (hour < 20) timePatterns.evening.early++;
                    else if (hour < 22) timePatterns.evening.normal++;
                    else timePatterns.evening.late++;
                }
            });
            
            const totalMorning = timePatterns.morning.early + timePatterns.morning.normal + timePatterns.morning.late;
            const totalEvening = timePatterns.evening.early + timePatterns.evening.normal + timePatterns.evening.late;
            
            return `
                <div style="display: grid; gap: 12px;">
                    <div>
                        <div style="font-size: 12px; margin-bottom: 8px; color: var(--text-secondary);">🌅 朝のジャーナル</div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 10px; width: 60px;">早朝(~7時)</span>
                            <div style="flex: 1; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${totalMorning > 0 ? (timePatterns.morning.early / totalMorning * 100) : 0}%; height: 100%; background: #3b82f6;"></div>
                            </div>
                            <span style="font-size: 10px; width: 30px; text-align: right;">${timePatterns.morning.early}</span>
                        </div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 10px; width: 60px;">通常(7-9時)</span>
                            <div style="flex: 1; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${totalMorning > 0 ? (timePatterns.morning.normal / totalMorning * 100) : 0}%; height: 100%; background: #10b981;"></div>
                            </div>
                            <span style="font-size: 10px; width: 30px; text-align: right;">${timePatterns.morning.normal}</span>
                        </div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 10px; width: 60px;">遅め(9時~)</span>
                            <div style="flex: 1; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${totalMorning > 0 ? (timePatterns.morning.late / totalMorning * 100) : 0}%; height: 100%; background: #f59e0b;"></div>
                            </div>
                            <span style="font-size: 10px; width: 30px; text-align: right;">${timePatterns.morning.late}</span>
                        </div>
                    </div>
                    
                    <div>
                        <div style="font-size: 12px; margin-bottom: 8px; color: var(--text-secondary);">🌙 夜のジャーナル</div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 10px; width: 60px;">早め(~20時)</span>
                            <div style="flex: 1; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${totalEvening > 0 ? (timePatterns.evening.early / totalEvening * 100) : 0}%; height: 100%; background: #3b82f6;"></div>
                            </div>
                            <span style="font-size: 10px; width: 30px; text-align: right;">${timePatterns.evening.early}</span>
                        </div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 10px; width: 60px;">通常(20-22時)</span>
                            <div style="flex: 1; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${totalEvening > 0 ? (timePatterns.evening.normal / totalEvening * 100) : 0}%; height: 100%; background: #10b981;"></div>
                            </div>
                            <span style="font-size: 10px; width: 30px; text-align: right;">${timePatterns.evening.normal}</span>
                        </div>
                        <div style="display: flex; gap: 4px; align-items: center;">
                            <span style="font-size: 10px; width: 60px;">深夜(22時~)</span>
                            <div style="flex: 1; height: 20px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden;">
                                <div style="width: ${totalEvening > 0 ? (timePatterns.evening.late / totalEvening * 100) : 0}%; height: 100%; background: #f59e0b;"></div>
                            </div>
                            <span style="font-size: 10px; width: 30px; text-align: right;">${timePatterns.evening.late}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // 感情と習慣達成率の相関を生成
        function generateEmotionHabitCorrelation(entries, hypotheses) {
            const correlationData = {
                highMood: { achieved: 0, total: 0 },  // 気分4-5の時
                midMood: { achieved: 0, total: 0 },   // 気分3の時
                lowMood: { achieved: 0, total: 0 }    // 気分1-2の時
            };
            
            Object.entries(entries).forEach(([dateStr, entry]) => {
                if (!entry.morning || !entry.morning.mood) return;
                
                const mood = entry.morning.mood;
                let dayAchieved = 0;
                let dayTotal = 0;
                
                // その日の習慣達成状況を集計
                hypotheses.forEach(hyp => {
                    if (hyp.achievements && hyp.achievements[dateStr]) {
                        dayAchieved++;
                    }
                    dayTotal++;
                });
                
                if (dayTotal > 0) {
                    if (mood >= 4) {
                        correlationData.highMood.achieved += dayAchieved;
                        correlationData.highMood.total += dayTotal;
                    } else if (mood === 3) {
                        correlationData.midMood.achieved += dayAchieved;
                        correlationData.midMood.total += dayTotal;
                    } else {
                        correlationData.lowMood.achieved += dayAchieved;
                        correlationData.lowMood.total += dayTotal;
                    }
                }
            });
            
            const highRate = correlationData.highMood.total > 0 
                ? Math.round((correlationData.highMood.achieved / correlationData.highMood.total) * 100)
                : 0;
            const midRate = correlationData.midMood.total > 0
                ? Math.round((correlationData.midMood.achieved / correlationData.midMood.total) * 100)
                : 0;
            const lowRate = correlationData.lowMood.total > 0
                ? Math.round((correlationData.lowMood.achieved / correlationData.lowMood.total) * 100)
                : 0;
            
            return `
                <div style="display: grid; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 12px; width: 80px;">😄 気分良好時</span>
                        <div style="flex: 1; height: 24px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; position: relative;">
                            <div style="width: ${highRate}%; height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6);"></div>
                            <span style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 11px; font-weight: bold;">${highRate}%</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 12px; width: 80px;">😐 気分普通時</span>
                        <div style="flex: 1; height: 24px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; position: relative;">
                            <div style="width: ${midRate}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #eab308);"></div>
                            <span style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 11px; font-weight: bold;">${midRate}%</span>
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px;">
                        <span style="font-size: 12px; width: 80px;">😔 気分低調時</span>
                        <div style="flex: 1; height: 24px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; position: relative;">
                            <div style="width: ${lowRate}%; height: 100%; background: linear-gradient(90deg, #ef4444, #dc2626);"></div>
                            <span style="position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 11px; font-weight: bold;">${lowRate}%</span>
                        </div>
                    </div>
                    <div style="margin-top: 8px; padding: 8px; background: rgba(59, 130, 246, 0.1); border-radius: 6px;">
                        <p style="font-size: 11px; color: var(--text-secondary); margin: 0;">
                            ${highRate > lowRate + 10 ? '💡 気分が良い日は習慣達成率も高い傾向があります！' :
                              lowRate > highRate + 10 ? '💪 気分が低い日でも頑張って習慣を続けています！' :
                              '📊 気分に関わらず安定して習慣を続けています！'}
                        </p>
                    </div>
                </div>
            `;
        }
        
        // ワードクラウドを生成
        function generateWordCloud(entries) {
            const words = {};
            
            // すべてのテキストから単語を抽出
            Object.values(entries).forEach(entry => {
                const texts = [];
                if (entry.morning) {
                    if (entry.morning.priority) texts.push(entry.morning.priority);
                }
                if (entry.evening) {
                    if (entry.evening.success) texts.push(entry.evening.success);
                    if (entry.evening.improvement) texts.push(entry.evening.improvement);
                }
                
                // 2文字以上の漢字・ひらがな・カタカナを抽出
                texts.forEach(text => {
                    const matches = text.match(/[一-龥ぁ-んァ-ヶー]{2,}/g) || [];
                    matches.forEach(word => {
                        // よくある助詞や接続詞を除外
                        if (!['です', 'ます', 'した', 'こと', 'もの', 'ため', 'から', 'まで', 'など', 'より'].includes(word)) {
                            words[word] = (words[word] || 0) + 1;
                        }
                    });
                });
            });
            
            // 頻度順にソートして上位20個を取得
            const sortedWords = Object.entries(words)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20);
            
            if (sortedWords.length === 0) {
                return '<div style="text-align: center; padding: 20px; color: var(--text-secondary); font-size: 12px;">キーワードを抽出中...</div>';
            }
            
            // 最大頻度を取得してサイズを正規化
            const maxCount = sortedWords[0][1];
            
            return `
                <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 12px;">
                    ${sortedWords.map(([word, count]) => {
                        const size = 12 + (count / maxCount) * 16; // 12px〜28pxの範囲
                        const opacity = 0.5 + (count / maxCount) * 0.5; // 0.5〜1.0の範囲
                        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
                        const color = colors[Math.floor(Math.random() * colors.length)];
                        
                        return `
                            <span style="
                                font-size: ${size}px;
                                color: ${color};
                                opacity: ${opacity};
                                padding: 4px 8px;
                                background: rgba(255,255,255,0.05);
                                border-radius: 4px;
                                cursor: default;
                                transition: all 0.2s;
                            " title="${count}回使用">
                                ${word}
                            </span>
                        `;
                    }).join('')}
                </div>
            `;
        }

        // ジャーナルストリークを更新
        function updateJournalStreak(data) {
            const today = new Date();
            const todayKey = dateKeyLocal(today);
            
            // 今日のエントリが完全かチェック
            const todayEntry = data.dailyJournal.entries[todayKey];
            const isComplete = todayEntry && todayEntry.morning && todayEntry.evening;
            
            if (isComplete) {
                // 昨日のエントリをチェック
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayKey = dateKeyLocal(yesterday);
                const yesterdayEntry = data.dailyJournal.entries[yesterdayKey];
                
                if (yesterdayEntry && yesterdayEntry.morning && yesterdayEntry.evening) {
                    // 連続を継続
                    data.dailyJournal.stats.currentStreak++;
                } else {
                    // 新しいストリークを開始
                    data.dailyJournal.stats.currentStreak = 1;
                }
                
                // 最長ストリークを更新
                if (data.dailyJournal.stats.currentStreak > data.dailyJournal.stats.longestStreak) {
                    data.dailyJournal.stats.longestStreak = data.dailyJournal.stats.currentStreak;
                }
                
                // 統計を更新
                data.dailyJournal.stats.lastEntry = todayKey;
                data.dailyJournal.stats.totalEntries++;
                
                // ストリークボーナス
                if (data.dailyJournal.stats.currentStreak === 7) {
                    earnPoints(5, 'journal', '🔥 ジャーナル7日連続ボーナス');
                    showNotification('🎆 7日連続達成！+5ptボーナス！', 'success');
                } else if (data.dailyJournal.stats.currentStreak === 30) {
                    earnPoints(20, 'journal', '🎆 ジャーナル30日連続ボーナス');
                    showNotification('🎉 30日連続達成！+20ptボーナス！', 'success');
                }
            }
        }
        
        // コンテキストメニューを表示
        function showJournalContextMenu(event, type) {
            event.preventDefault();
            
            // 既存のコンテキストメニューを削除
            const existingMenu = document.querySelector('.context-menu');
            if (existingMenu) {
                existingMenu.remove();
            }
            
            // コンテキストメニューを作成
            const menu = document.createElement('div');
            menu.className = 'context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${event.clientX}px;
                top: ${event.clientY}px;
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 8px;
                padding: 4px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 10000;
                min-width: 120px;
            `;
            
            menu.innerHTML = `
                <div onclick="editJournalEntry('${type}'); this.parentElement.remove();" style="
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 4px;
                    color: var(--text-primary);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: background 0.2s;
                " onmouseover="this.style.background='var(--hover)'" onmouseout="this.style.background='transparent'">
                    ✏️ 編集
                </div>
                <div onclick="deleteJournalEntry('${type}'); this.parentElement.remove();" style="
                    padding: 8px 12px;
                    cursor: pointer;
                    border-radius: 4px;
                    color: #ef4444;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: background 0.2s;
                " onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='transparent'">
                    🗑️ 削除
                </div>
            `;
            
            document.body.appendChild(menu);
            
            // クリックで閉じる
            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 100);
        }
        
        // ジャーナルエントリを編集
        function editJournalEntry(type) {
            const data = loadData();
            const todayKey = getJournalDateKey();
            const todayEntry = data.dailyJournal?.entries?.[todayKey];
            
            if (!todayEntry || !todayEntry[type]) {
                showNotification('編集するジャーナルが見つかりません', 'error');
                return;
            }
            
            // 編集モードでジャーナルモーダルを開く
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '520px';
            modal.style.padding = '24px';
            
            if (type === 'morning') {
                const morning = todayEntry.morning;
                modal.innerHTML = `
                    <div class="modal-header" style="margin-bottom: 20px;">
                        <h3 style="font-size: 20px; margin-bottom: 8px;">🌅 朝のジャーナルを編集</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">記録した内容を修正できます</p>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">体調はどうですか？</label>
                        <div id="condition-selector" style="display: flex; gap: 12px; justify-content: space-between;">
                            ${[1,2,3,4,5].map(i => `
                                <button class="mood-btn ${morning.condition === i ? 'active' : ''}" data-value="${i}" style="
                                    flex: 1;
                                    padding: 12px;
                                    border: 2px solid ${morning.condition === i ? 'var(--primary)' : 'var(--border)'};
                                    border-radius: 12px;
                                    background: ${morning.condition === i ? 'var(--primary-bg)' : 'var(--surface)'};
                                    cursor: pointer;
                                    transition: all 0.3s;
                                    text-align: center;
                                ">
                                    <div style="font-size: 24px; margin-bottom: 4px;">${['😫', '😟', '😐', '🙂', '😊'][i-1]}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${i}</div>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">睡眠時間</label>
                        <div style="display: flex; gap: 12px; align-items: center;">
                            <div style="flex: 1;">
                                <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">昨夜の就寝時刻</label>
                                <input type="time" id="bedtime-input" 
                                    value="${morning.bedtime || ''}" 
                                    style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; 
                                    background: var(--surface); color: var(--text-primary);">
                            </div>
                            <div style="flex: 1;">
                                <label style="display: block; margin-bottom: 4px; font-size: 12px; color: var(--text-secondary);">今朝の起床時刻</label>
                                <input type="time" id="wakeup-input" 
                                    value="${morning.wakeup || ''}" 
                                    style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 8px; 
                                    background: var(--surface); color: var(--text-primary);">
                            </div>
                        </div>
                        <div id="sleep-duration" style="margin-top: 8px; font-size: 14px; color: var(--text-secondary);"></div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">気分はどうですか？</label>
                        <div id="mood-selector" style="display: flex; gap: 12px; justify-content: space-between;">
                            ${[1,2,3,4,5].map(i => `
                                <button class="mood-btn ${morning.mood === i ? 'active' : ''}" data-value="${i}" style="
                                    flex: 1;
                                    padding: 12px;
                                    border: 2px solid ${morning.mood === i ? 'var(--primary)' : 'var(--border)'};
                                    border-radius: 12px;
                                    background: ${morning.mood === i ? 'var(--primary-bg)' : 'var(--surface)'};
                                    cursor: pointer;
                                    transition: all 0.3s;
                                    text-align: center;
                                ">
                                    <div style="font-size: 24px; margin-bottom: 4px;">${['😔', '😕', '😐', '😌', '😄'][i-1]}</div>
                                    <div style="font-size: 12px; color: var(--text-secondary);">${i}</div>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">体重 (任意)</label>
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <input type="number" id="weight-input" placeholder="例: 65.52" step="0.01" 
                                value="${morning.weight || ''}" 
                                style="width: 120px; padding: 8px; border: 1px solid var(--border); border-radius: 8px; 
                                background: var(--surface); color: var(--text-primary);">
                            <span style="color: var(--text-secondary); font-size: 14px;">kg</span>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">今日の最優先事項は？</label>
                        <textarea id="priority-input" placeholder="例: プロジェクトXの企画書を完成させる" 
                            style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; 
                            background: var(--surface); color: var(--text-primary); min-height: 80px; resize: vertical;"
                            maxlength="200">${morning.priority || ''}</textarea>
                        <div style="text-align: right; margin-top: 4px;">
                            <span id="priority-count" style="font-size: 12px; color: var(--text-secondary);">${(morning.priority || '').length}/200</span>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                        <button class="button primary" onclick="updateMorningJournal()" style="background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);">
                            💾 変更を保存
                        </button>
                    </div>
                `;
            } else {
                const evening = todayEntry.evening;
                modal.innerHTML = `
                    <div class="modal-header" style="margin-bottom: 20px;">
                        <h3 style="font-size: 20px; margin-bottom: 8px;">🌙 夜のジャーナルを編集</h3>
                        <p style="color: var(--text-secondary); font-size: 14px;">記録した内容を修正できます</p>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">今日うまくいったことは？</label>
                        <textarea id="success-input" placeholder="例: 企画書を予定通り完成できた。チームとの連携もスムーズだった" 
                            style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; 
                            background: var(--surface); color: var(--text-primary); min-height: 100px; resize: vertical;"
                            maxlength="300">${evening.success || ''}</textarea>
                        <div style="text-align: right; margin-top: 4px;">
                            <span id="success-count" style="font-size: 12px; color: var(--text-secondary);">${(evening.success || '').length}/300</span>
                        </div>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 24px;">
                        <label style="display: block; margin-bottom: 12px; font-weight: 600;">改善点は？</label>
                        <textarea id="improvement-input" placeholder="例: 時間配分をもっと計画的にすべきだった" 
                            style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; 
                            background: var(--surface); color: var(--text-primary); min-height: 100px; resize: vertical;"
                            maxlength="300">${evening.improvement || ''}</textarea>
                        <div style="text-align: right; margin-top: 4px;">
                            <span id="improvement-count" style="font-size: 12px; color: var(--text-secondary);">${(evening.improvement || '').length}/300</span>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                        <button class="button primary" onclick="updateEveningJournal()" style="background: linear-gradient(135deg, #a855f7 0%, #3b82f6 100%);">
                            💾 変更を保存
                        </button>
                    </div>
                `;
            }
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // イベントリスナーを設定
            setTimeout(() => {
                setupJournalModalListeners();
            }, 100);
        }
        window.editJournalEntry = editJournalEntry;
        
        // 朝のジャーナルを更新
        function updateMorningJournal() {
            const condition = parseInt(document.querySelector('#condition-selector .mood-btn.active')?.dataset.value || '3');
            const mood = parseInt(document.querySelector('#mood-selector .mood-btn.active')?.dataset.value || '3');
            const priority = document.getElementById('priority-input').value.trim();
            const bedtime = document.getElementById('bedtime-input').value;
            const wakeup = document.getElementById('wakeup-input').value;
            const weight = parseFloat(document.getElementById('weight-input').value) || null;
            
            if (!priority) {
                showNotification('最優先事項を入力してください', 'error');
                return;
            }
            
            let data = loadData();
            const todayKey = getJournalDateKey();
            
            // 既存のデータを保持しつつ更新
            const existingMorning = data.dailyJournal.entries[todayKey].morning;
            
            // 睡眠時間を計算
            let sleepHours = null;
            if (bedtime && wakeup) {
                const [bedHour, bedMin] = bedtime.split(':').map(Number);
                const [wakeHour, wakeMin] = wakeup.split(':').map(Number);
                
                let bedMinutes = bedHour * 60 + bedMin;
                let wakeMinutes = wakeHour * 60 + wakeMin;
                
                if (wakeMinutes <= bedMinutes) {
                    wakeMinutes += 24 * 60;
                }
                
                const diffMinutes = wakeMinutes - bedMinutes;
                sleepHours = Math.round((diffMinutes / 60) * 10) / 10;
            }
            
            // 朝のジャーナルを更新
            data.dailyJournal.entries[todayKey].morning = {
                ...existingMorning,
                condition: condition,
                mood: mood,
                priority: priority,
                bedtime: bedtime,
                wakeup: wakeup,
                sleepHours: sleepHours,
                weight: weight,
                timestamp: existingMorning.timestamp,
                pointsEarned: existingMorning.pointsEarned
            };
            
            // データを保存
            saveData(data);
            
            // UIを更新
            updateJournalStatus();
            
            // モーダルを閉じる
            document.querySelector('.overlay').remove();
            
            showNotification('🌅 朝のジャーナルを更新しました！', 'success');
        }
        window.updateMorningJournal = updateMorningJournal;
        
        // 夜のジャーナルを更新
        function updateEveningJournal() {
            const success = document.getElementById('success-input').value.trim();
            const improvement = document.getElementById('improvement-input').value.trim();
            
            if (!success && !improvement) {
                showNotification('少なくとも1つの項目を入力してください', 'error');
                return;
            }
            
            let data = loadData();
            const todayKey = getJournalDateKey();
            
            // 既存のデータを保持しつつ更新
            const existingEvening = data.dailyJournal.entries[todayKey].evening;
            
            // 夜のジャーナルを更新
            data.dailyJournal.entries[todayKey].evening = {
                ...existingEvening,
                success: success,
                improvement: improvement,
                timestamp: existingEvening.timestamp,
                pointsEarned: existingEvening.pointsEarned
            };
            
            // データを保存
            saveData(data);
            
            // UIを更新
            updateJournalStatus();
            
            // モーダルを閉じる
            document.querySelector('.overlay').remove();
            
            showNotification('🌙 夜のジャーナルを更新しました！', 'success');
        }
        window.updateEveningJournal = updateEveningJournal;
        
        // ジャーナルエントリを削除
        function deleteJournalEntry(type) {
            if (!confirm(`${type === 'morning' ? '朝' : '夜'}のジャーナルを削除しますか？\n獲得したポイントも減算されます。`)) {
                return;
            }
            
            let data = loadData();
            const todayKey = getJournalDateKey(); // 深夜対応の日付キー
            
            if (!data.dailyJournal || !data.dailyJournal.entries[todayKey]) {
                showNotification('削除するジャーナルが見つかりません', 'error');
                return;
            }
            
            const entry = data.dailyJournal.entries[todayKey][type];
            if (!entry) {
                showNotification('削除するジャーナルが見つかりません', 'error');
                return;
            }
            
            // 獲得したポイントがある場合は減算
            if (entry.pointsEarned && entry.pointsEarned > 0) {
                // 現在のブースト効果を考慮して元のポイントを計算
                const basePoints = 1; // ジャーナルの基本ポイント
                const boostedPoints = calculatePointsWithBoosts(basePoints, 'journal', null);
                const actualPointsToDeduct = Math.round(boostedPoints);
                
                // ポイントを減算
                data.pointSystem.currentPoints = Math.max(0, data.pointSystem.currentPoints - actualPointsToDeduct);
                
                // トランザクション記録
                data.pointSystem.transactions.unshift({
                    timestamp: new Date().toISOString(),
                    type: 'spend',
                    amount: actualPointsToDeduct,
                    source: 'journal_delete',
                    description: `${type === 'morning' ? '🌅 朝' : '🌙 夜'}のジャーナル削除による減算`,
                    multiplier: 1.0,
                    finalAmount: -actualPointsToDeduct
                });
                
                // トランザクション履歴を最新100件に制限
                if (data.pointSystem.transactions.length > 100) {
                    data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
                }
            }
            
            // エントリを削除
            delete data.dailyJournal.entries[todayKey][type];
            
            // 両方のエントリが削除された場合はその日のデータ自体を削除
            if (!data.dailyJournal.entries[todayKey].morning && !data.dailyJournal.entries[todayKey].evening) {
                delete data.dailyJournal.entries[todayKey];
                
                // ストリークを再計算
                recalculateJournalStreak(data);
            }
            
            // データを保存
            saveData(data);
            
            // UI更新
            updateJournalStatus();
            updatePointDisplay();
            
            showNotification(`${type === 'morning' ? '🌅 朝' : '🌙 夜'}のジャーナルを削除しました`, 'info');
        }
        
        // ジャーナルストリークを再計算
        function recalculateJournalStreak(data) {
            // 現在のストリークをリセット
            data.dailyJournal.stats.currentStreak = 0;
            
            // 今日から遡って連続日数を計算
            const today = new Date();
            let checkDate = new Date(today);
            let consecutiveDays = 0;
            
            while (true) {
                const dateKey = dateKeyLocal(checkDate);
                const entry = data.dailyJournal.entries[dateKey];
                
                // その日のエントリが完全でない場合は終了
                if (!entry || !entry.morning || !entry.evening) {
                    break;
                }
                
                consecutiveDays++;
                
                // 前日をチェック
                checkDate.setDate(checkDate.getDate() - 1);
            }
            
            data.dailyJournal.stats.currentStreak = consecutiveDays;
            
            // 最長ストリークを更新
            if (consecutiveDays > data.dailyJournal.stats.longestStreak) {
                data.dailyJournal.stats.longestStreak = consecutiveDays;
            }
        }
        
        // ========== チャレンジシステム関連の関数 ==========
        
        // チャレンジを更新
        function updateChallenges() {
            const data = loadData();
            
            // カスタムチャレンジを取得
            const customDailyChallenges = (data.challenges.customChallenges || [])
                .filter(c => c.type === 'daily');
            const customWeeklyChallenges = (data.challenges.customChallenges || [])
                .filter(c => c.type === 'weekly');
            
            // デイリーチャレンジプールを作成（既定 + カスタム）
            const allDailyChallenges = [...DAILY_CHALLENGES, ...customDailyChallenges];
            
            // デイリーチャレンジ
            const dailyContainer = document.getElementById('daily-challenge-container');
            if (!data.challenges.daily) {
                // ランダムにデイリーチャレンジを選択
                const randomDaily = allDailyChallenges[Math.floor(Math.random() * allDailyChallenges.length)];
                data.challenges.daily = randomDaily;
                saveData(data);
            }
            
            if (dailyContainer) {
                const daily = data.challenges.daily;
                const isCompleted = data.challenges.completedToday.includes(daily.id);
                
                // チェック関数は無効化（手動トグルのみ）
                let isAutoCheckable = false;
                let isAutoCompleted = false;
                
                dailyContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">${daily.icon}</span>
                            <div>
                                <div style="font-weight: bold; ${isCompleted ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${daily.name}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">
                                    報酬: ${daily.points}pt
                                    ${daily.id.startsWith('custom_') ? ' (カスタム)' : ''}
                                </div>
                            </div>
                        </div>
                        ${!isCompleted ? `
                            <button class="btn btn-primary" 
                                onclick="completeChallenge('daily', '${daily.id}')" 
                                style="padding: 8px 16px; font-size: 14px; background: linear-gradient(135deg, #667eea, #764ba2); border: none; color: white; font-weight: 600;">
                                完了にする
                            </button>
                        ` : `
                            <button class="btn btn-secondary" 
                                onclick="completeChallenge('daily', '${daily.id}')" 
                                style="padding: 8px 16px; font-size: 14px; background: #ef4444; border: none; color: white; font-weight: 600;">
                                ↩️ 取り消す
                            </button>
                        `}
                    </div>
                `;
                
                // ミッションマスターによる追加ミッション表示
                const today = new Date().toISOString().split('T')[0];
                if (data.challenges.extraMissions && data.challenges.extraMissions[today]) {
                    const extraCount = data.challenges.extraMissions[today].count || 2;
                    
                    // 追加ミッション用のミッションリストを生成（メインとは異なるミッション）
                    if (!data.challenges.extraDaily) data.challenges.extraDaily = [];
                    
                    while (data.challenges.extraDaily.length < extraCount) {
                        const availableExtras = allDailyChallenges.filter(c => 
                            c.id !== daily.id && 
                            !data.challenges.extraDaily.some(e => e.id === c.id)
                        );
                        if (availableExtras.length > 0) {
                            const randomExtra = availableExtras[Math.floor(Math.random() * availableExtras.length)];
                            data.challenges.extraDaily.push(randomExtra);
                        } else {
                            break;
                        }
                    }
                    
                    // 追加ミッション表示
                    data.challenges.extraDaily.slice(0, extraCount).forEach((extraMission, index) => {
                        const isExtraCompleted = data.challenges.completedToday.includes(`extra_${extraMission.id}`);
                        dailyContainer.innerHTML += `
                            <div style="margin-top: 12px; padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; border-left: 4px solid #f59e0b;">
                                <div style="display: flex; align-items: center; justify-content: space-between;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <span style="font-size: 20px;">${extraMission.icon}</span>
                                        <div>
                                            <div style="font-size: 12px; color: #f59e0b; font-weight: bold;">🎯 追加ミッション</div>
                                            <div style="font-weight: bold; ${isExtraCompleted ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${extraMission.name}</div>
                                            <div style="font-size: 12px; color: var(--text-secondary);">
                                                報酬: ${extraMission.points}pt
                                            </div>
                                        </div>
                                    </div>
                                    ${!isExtraCompleted ? `
                                        <button class="btn btn-primary" 
                                            onclick="completeChallenge('daily', 'extra_${extraMission.id}')" 
                                            style="padding: 8px 16px; font-size: 14px; background: linear-gradient(135deg, #f59e0b, #d97706); border: none; color: white; font-weight: 600;">
                                            完了にする
                                        </button>
                                    ` : `
                                        <button class="btn btn-secondary" 
                                            onclick="completeChallenge('daily', 'extra_${extraMission.id}')" 
                                            style="padding: 8px 16px; font-size: 14px; background: #ef4444; border: none; color: white; font-weight: 600;">
                                            ↩️ 取り消す
                                        </button>
                                    `}
                                </div>
                            </div>
                        `;
                    });
                    
                    saveData(data);
                }
            }
            
            // ウィークリーチャレンジプールを作成（既定 + カスタム）
            const allWeeklyChallenges = [...WEEKLY_CHALLENGES, ...customWeeklyChallenges];
            
            // ウィークリーチャレンジ
            const weeklyContainer = document.getElementById('weekly-challenge-container');
            if (!data.challenges.weekly) {
                // ランダムにウィークリーチャレンジを選択
                const randomWeekly = allWeeklyChallenges[Math.floor(Math.random() * allWeeklyChallenges.length)];
                data.challenges.weekly = randomWeekly;
                saveData(data);
            }
            
            if (weeklyContainer) {
                const weekly = data.challenges.weekly;
                const isCompleted = data.challenges.completedThisWeek.includes(weekly.id);
                
                weeklyContainer.innerHTML = `
                    <h4 style="margin-bottom: 8px; font-size: 14px; color: var(--text-secondary);">📅 今週のチャレンジ</h4>
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 24px;">${weekly.icon}</span>
                            <div>
                                <div style="font-weight: bold; ${isCompleted ? 'text-decoration: line-through; color: var(--text-secondary);' : ''}">${weekly.name}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">報酬: ${weekly.points}pt${weekly.id.startsWith('custom_') ? ' (カスタム)' : ''}</div>
                            </div>
                        </div>
                        ${!isCompleted ? `
                            <button class="btn btn-primary" 
                                onclick="completeChallenge('weekly', '${weekly.id}')" 
                                style="padding: 8px 16px; font-size: 14px; background: linear-gradient(135deg, #667eea, #764ba2); border: none; color: white; font-weight: 600;">
                                完了にする
                            </button>
                        ` : `
                            <button class="btn btn-secondary" 
                                onclick="completeChallenge('weekly', '${weekly.id}')" 
                                style="padding: 8px 16px; font-size: 14px; background: #ef4444; border: none; color: white; font-weight: 600;">
                                ↩️ 取り消す
                            </button>
                        `}
                    </div>
                `;
            }
        }
        
        // 現在のブースト倍率を取得（ブースト機能は無効化）
        function getBoostMultiplier() {
            return 1.0;
        }
        
        // チャレンジを完了（トグル機能付き）
        function completeChallenge(type, challengeId) {
            const data = loadData();
            const today = new Date().toDateString();
            
            if (type === 'daily') {
                // 追加ミッション（extra_プレフィックス）の処理
                let isExtraMission = challengeId.startsWith('extra_');
                let actualChallengeId = isExtraMission ? challengeId.substring(6) : challengeId;
                
                // 既定のチャレンジまたはカスタムチャレンジから検索
                let challenge = DAILY_CHALLENGES.find(c => c.id === actualChallengeId);
                if (!challenge && data.challenges.customChallenges) {
                    challenge = data.challenges.customChallenges.find(c => c.id === actualChallengeId && c.type === 'daily');
                }
                
                // 追加ミッションの場合は、extraDaily配列からも検索
                if (!challenge && isExtraMission && data.challenges.extraDaily) {
                    challenge = data.challenges.extraDaily.find(c => c.id === actualChallengeId);
                }
                
                if (challenge) {
                    // 既に完了している場合は取り消し
                    if (data.challenges.completedToday.includes(challengeId)) {
                        undoChallenge(type, challengeId);
                        return;
                    }
                    
                    // 完了処理
                    data.challenges.completedToday.push(challengeId);
                    
                    // 履歴に追加
                    data.challenges.history.unshift({
                        id: challengeId,
                        name: challenge.name,
                        type: 'daily',
                        points: challenge.points,
                        completedAt: new Date().toISOString(),
                        isCustom: actualChallengeId.startsWith('custom_'),
                        isExtra: isExtraMission
                    });
                    
                    // ストリークを更新
                    if (data.challenges.lastStreakDate !== today) {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayStr = yesterday.toDateString();
                        
                        if (data.challenges.lastStreakDate === yesterdayStr) {
                            data.challenges.streak++;
                        } else {
                            data.challenges.streak = 1;
                        }
                        data.challenges.lastStreakDate = today;
                    }
                    
                    data.challenges.totalCompleted++;
                    
                    // 履歴は最新100件のみ保存
                    if (data.challenges.history.length > 100) {
                        data.challenges.history = data.challenges.history.slice(0, 100);
                    }
                    
                    saveData(data);
                    
                    // ボーナスを考慮してポイント獲得
                    const boostMultiplier = getBoostMultiplier();
                    const earnedPoints = Math.floor(challenge.points * boostMultiplier);
                    earnPoints(earnedPoints, 'daily_challenge', `デイリーチャレンジ: ${challenge.name}`);
                    
                    const missionType = isExtraMission ? '追加ミッション' : 'デイリーチャレンジ';
                    if (boostMultiplier > 1) {
                        showNotification(`🎉 ${missionType}完了！ +${earnedPoints}pt (ブースト${boostMultiplier}x)`, 'success');
                    } else {
                        showNotification(`🎉 ${missionType}完了！ +${earnedPoints}pt`, 'success');
                    }
                }
            } else if (type === 'weekly') {
                // 既定のチャレンジまたはカスタムチャレンジから検索
                let challenge = WEEKLY_CHALLENGES.find(c => c.id === challengeId);
                if (!challenge && data.challenges.customChallenges) {
                    challenge = data.challenges.customChallenges.find(c => c.id === challengeId && c.type === 'weekly');
                }
                
                if (challenge) {
                    // 既に完了している場合は取り消し
                    if (data.challenges.completedThisWeek.includes(challengeId)) {
                        undoChallenge(type, challengeId);
                        return;
                    }
                    
                    // 完了処理
                    data.challenges.completedThisWeek.push(challengeId);
                    
                    // 履歴に追加
                    data.challenges.history.unshift({
                        id: challengeId,
                        name: challenge.name,
                        type: 'weekly',
                        points: challenge.points,
                        completedAt: new Date().toISOString(),
                        isCustom: challengeId.startsWith('custom_')
                    });
                    
                    data.challenges.totalCompleted++;
                    
                    // 履歴は最新100件のみ保存
                    if (data.challenges.history.length > 100) {
                        data.challenges.history = data.challenges.history.slice(0, 100);
                    }
                    
                    saveData(data);
                    
                    // ボーナスを考慮してポイント獲得
                    const boostMultiplier = getBoostMultiplier();
                    const earnedPoints = Math.floor(challenge.points * boostMultiplier);
                    earnPoints(earnedPoints, 'weekly_challenge', `ウィークリーチャレンジ: ${challenge.name}`);
                    
                    if (boostMultiplier > 1) {
                        showNotification(`🎉 ウィークリーチャレンジ完了！ +${earnedPoints}pt (ブースト${boostMultiplier}x)`, 'success');
                    } else {
                        showNotification(`🎉 ウィークリーチャレンジ完了！ +${earnedPoints}pt`, 'success');
                    }
                }
            }
            updateChallenges();
            updatePointDisplay();
            updatePointsView();
            updateChallengeStats();
        }
        
        // チャレンジ達成を取り消す（確認なしで即座に実行）
        function undoChallenge(type, challengeId) {
            const data = loadData();
            
            if (type === 'daily') {
                // 既定のチャレンジまたはカスタムチャレンジから検索
                let challenge = DAILY_CHALLENGES.find(c => c.id === challengeId);
                if (!challenge && data.challenges.customChallenges) {
                    challenge = data.challenges.customChallenges.find(c => c.id === challengeId && c.type === 'daily');
                }
                
                if (challenge && data.challenges.completedToday.includes(challengeId)) {
                    // 完了リストから削除
                    const index = data.challenges.completedToday.indexOf(challengeId);
                    if (index > -1) {
                        data.challenges.completedToday.splice(index, 1);
                    }
                    
                    // 最新の履歴エントリを探す
                    const historyEntry = data.challenges.history.find(h => h.id === challengeId && h.type === 'daily');
                    let pointsToDeduct = challenge.points;
                    
                    // 履歴エントリから実際に獲得したポイントを取得（ブースト考慮）
                    if (historyEntry) {
                        const historyIndex = data.challenges.history.indexOf(historyEntry);
                        if (historyIndex > -1) {
                            // トランザクション履歴から実際の獲得ポイントを探す
                            const recentTransaction = data.pointSystem.transactions.find(t => 
                                t.source === 'daily_challenge' && 
                                t.description === `デイリーチャレンジ: ${challenge.name}` &&
                                Math.abs(new Date(t.timestamp).getTime() - new Date(historyEntry.completedAt).getTime()) < 1000
                            );
                            
                            if (recentTransaction) {
                                pointsToDeduct = recentTransaction.amount;
                            }
                            
                            data.challenges.history.splice(historyIndex, 1);
                        }
                    }
                    
                    // 総達成数を減らす
                    data.challenges.totalCompleted = Math.max(0, data.challenges.totalCompleted - 1);
                    
                    // ストリークの再計算（今日の他のチャレンジが完了していない場合）
                    const today = new Date().toDateString();
                    if (data.challenges.completedToday.length === 0 && data.challenges.lastStreakDate === today) {
                        data.challenges.streak = Math.max(0, data.challenges.streak - 1);
                        // 前日の日付に戻す
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        data.challenges.lastStreakDate = yesterday.toDateString();
                    }
                    
                    // ポイントを減算（実際に獲得した分だけ）
                    data.pointSystem.currentPoints = Math.max(0, data.pointSystem.currentPoints - pointsToDeduct);
                    data.pointSystem.lifetimeEarned = Math.max(0, data.pointSystem.lifetimeEarned - pointsToDeduct);
                    data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
                    
                    // レベル更新
                    const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
                    data.pointSystem.currentLevel = newLevel.level;
                    
                    // トランザクション記録
                    data.pointSystem.transactions.unshift({
                        timestamp: new Date().toISOString(),
                        type: 'spend',
                        amount: pointsToDeduct,
                        source: 'challenge_undo',
                        description: `チャレンジ取消: ${challenge.name}`
                    });
                    
                    // トランザクション履歴を制限
                    if (data.pointSystem.transactions.length > 100) {
                        data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
                    }
                    
                    saveData(data);
                    showNotification(`取り消しました (-${pointsToDeduct}pt)`, 'info');
                }
            } else if (type === 'weekly') {
                // 既定のチャレンジまたはカスタムチャレンジから検索
                let challenge = WEEKLY_CHALLENGES.find(c => c.id === challengeId);
                if (!challenge && data.challenges.customChallenges) {
                    challenge = data.challenges.customChallenges.find(c => c.id === challengeId && c.type === 'weekly');
                }
                
                if (challenge && data.challenges.completedThisWeek.includes(challengeId)) {
                    // 完了リストから削除
                    const index = data.challenges.completedThisWeek.indexOf(challengeId);
                    if (index > -1) {
                        data.challenges.completedThisWeek.splice(index, 1);
                    }
                    
                    // 最新の履歴エントリを探す
                    const historyEntry = data.challenges.history.find(h => h.id === challengeId && h.type === 'weekly');
                    let pointsToDeduct = challenge.points;
                    
                    // 履歴エントリから実際に獲得したポイントを取得（ブースト考慮）
                    if (historyEntry) {
                        const historyIndex = data.challenges.history.indexOf(historyEntry);
                        if (historyIndex > -1) {
                            // トランザクション履歴から実際の獲得ポイントを探す
                            const recentTransaction = data.pointSystem.transactions.find(t => 
                                t.source === 'weekly_challenge' && 
                                t.description === `ウィークリーチャレンジ: ${challenge.name}` &&
                                Math.abs(new Date(t.timestamp).getTime() - new Date(historyEntry.completedAt).getTime()) < 1000
                            );
                            
                            if (recentTransaction) {
                                pointsToDeduct = recentTransaction.amount;
                            }
                            
                            data.challenges.history.splice(historyIndex, 1);
                        }
                    }
                    
                    // 総達成数を減らす
                    data.challenges.totalCompleted = Math.max(0, data.challenges.totalCompleted - 1);
                    
                    // ポイントを減算（実際に獲得した分だけ）
                    data.pointSystem.currentPoints = Math.max(0, data.pointSystem.currentPoints - pointsToDeduct);
                    data.pointSystem.lifetimeEarned = Math.max(0, data.pointSystem.lifetimeEarned - pointsToDeduct);
                    data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
                    
                    // レベル更新
                    const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
                    data.pointSystem.currentLevel = newLevel.level;
                    
                    // トランザクション記録
                    data.pointSystem.transactions.unshift({
                        timestamp: new Date().toISOString(),
                        type: 'spend',
                        amount: pointsToDeduct,
                        source: 'challenge_undo',
                        description: `チャレンジ取消: ${challenge.name}`
                    });
                    
                    // トランザクション履歴を制限
                    if (data.pointSystem.transactions.length > 100) {
                        data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
                    }
                    
                    saveData(data);
                    showNotification(`取り消しました (-${pointsToDeduct}pt)`, 'info');
                }
            }
            
            updateChallenges();
            updatePointDisplay();
            updatePointsView();
            updateChallengeStats();
        }


        // ポイントをすべてリセット（緊急時用・通常は非表示）
        // function resetAllPoints() {
        //     if (!confirm('⚠️ 警告\n\nすべてのポイントと履歴を削除します。\nこの操作は取り消せません。\n\n本当に実行しますか？')) {
        //         return;
        //     }
        //     
        //     if (!confirm('⚠️ 最終確認\n\n本当にすべてのポイントをリセットしますか？')) {
        //         return;
        //     }
        //     
        //     const data = loadData();
        //     
        //     // ポイントシステムをリセット
        //     data.pointSystem.currentPoints = 0;
        //     data.pointSystem.lifetimeEarned = 0;
        //     data.pointSystem.lifetimeSpent = 0;
        //     data.pointSystem.currentLevel = 1;
        //     data.pointSystem.levelProgress = 0;
        //     data.pointSystem.transactions = [];
        //     
        //     saveData(data);
        //     
        //     // UI更新
        //     updatePointDisplay();
        //     updatePointsView();
        //     showNotification('ポイントをリセットしました', 'success');
        // }

        // チャレンジ統計を更新
        function updateChallengeStats() {
            const data = loadData();
            const challenges = data.challenges;
            
            // 連続達成日数
            const streakEl = document.getElementById('challenge-streak');
            if (streakEl) {
                streakEl.textContent = challenges.streak || 0;
            }
            
            // 累計完了数
            const totalEl = document.getElementById('total-challenges-completed');
            if (totalEl) {
                totalEl.textContent = challenges.totalCompleted || 0;
            }
            
            // デイリー達成率を計算
            const dailyHistory = challenges.history.filter(h => h.type === 'daily');
            const last30Days = dailyHistory.filter(h => {
                const date = new Date(h.completedAt);
                const daysDiff = (new Date() - date) / (1000 * 60 * 60 * 24);
                return daysDiff <= 30;
            });
            const dailyRate = last30Days.length > 0 ? Math.round((last30Days.length / 30) * 100) : 0;
            const dailyRateEl = document.getElementById('daily-completion-rate');
            if (dailyRateEl) {
                dailyRateEl.textContent = `${dailyRate}%`;
            }
            
            // ウィークリー達成率を計算
            const weeklyHistory = challenges.history.filter(h => h.type === 'weekly');
            const last8Weeks = weeklyHistory.filter(h => {
                const date = new Date(h.completedAt);
                const weeksDiff = (new Date() - date) / (1000 * 60 * 60 * 24 * 7);
                return weeksDiff <= 8;
            });
            const weeklyRate = last8Weeks.length > 0 ? Math.round((last8Weeks.length / 8) * 100) : 0;
            const weeklyRateEl = document.getElementById('weekly-completion-rate');
            if (weeklyRateEl) {
                weeklyRateEl.textContent = `${weeklyRate}%`;
            }
            
            // お気に入りチャレンジ（よく達成するチャレンジ）
            const favoriteContainer = document.getElementById('favorite-challenges');
            if (favoriteContainer) {
                const challengeCounts = {};
                challenges.history.forEach(h => {
                    if (!challengeCounts[h.id]) {
                        challengeCounts[h.id] = { name: h.name, count: 0, type: h.type };
                    }
                    challengeCounts[h.id].count++;
                });
                
                const sortedChallenges = Object.entries(challengeCounts)
                    .sort((a, b) => b[1].count - a[1].count)
                    .slice(0, 5);
                
                if (sortedChallenges.length > 0) {
                    favoriteContainer.innerHTML = sortedChallenges.map(([id, data]) => `
                        <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(139, 92, 246, 0.1); border-radius: 8px;">
                            <span style="font-size: 12px;">${data.name}</span>
                            <span style="font-size: 12px; color: var(--text-secondary);">${data.count}回</span>
                        </div>
                    `).join('');
                } else {
                    favoriteContainer.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px;">まだデータがありません</p>';
                }
            }
            
            // 最近のチャレンジ達成
            const recentContainer = document.getElementById('recent-challenges');
            if (recentContainer) {
                const recent = challenges.history.slice(0, 10);
                if (recent.length > 0) {
                    recentContainer.innerHTML = recent.map(h => {
                        const date = new Date(h.completedAt);
                        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                        const typeIcon = h.type === 'daily' ? '📅' : '📆';
                        return `
                            <div style="display: flex; justify-content: space-between; padding: 6px; background: rgba(0, 0, 0, 0.1); border-radius: 6px;">
                                <span>${typeIcon} ${h.name}</span>
                                <span style="color: var(--text-secondary);">${dateStr}</span>
                            </div>
                        `;
                    }).join('');
                } else {
                    recentContainer.innerHTML = '<p style="color: var(--text-secondary);">まだチャレンジを達成していません</p>';
                }
            }
        }

        // カスタムチャレンジ作成フォーム表示
        function showChallengeCreation() {
            document.getElementById('reward-creation-form').style.display = 'none';
            document.getElementById('challenge-creation-form').style.display = 'block';
            document.getElementById('reward-creation-btn').style.background = '';
            document.getElementById('reward-creation-btn').style.color = '';
            document.getElementById('challenge-creation-btn').style.background = 'var(--primary)';
            document.getElementById('challenge-creation-btn').style.color = 'white';
            updateCustomChallengesList();
        }
        
        // 報酬作成フォーム表示
        function showRewardCreation() {
            document.getElementById('reward-creation-form').style.display = 'block';
            document.getElementById('challenge-creation-form').style.display = 'none';
            document.getElementById('reward-creation-btn').style.background = 'var(--primary)';
            document.getElementById('reward-creation-btn').style.color = 'white';
            document.getElementById('challenge-creation-btn').style.background = '';
            document.getElementById('challenge-creation-btn').style.color = '';
        }
        
        // チャレンジポイント更新
        function updateChallengePoints(value) {
            document.getElementById('challenge-points-display').textContent = `${value}pt`;
            document.getElementById('challenge-points').value = value;
        }
        
        // カスタムチャレンジ作成
        function createCustomChallenge(event) {
            event.preventDefault();
            const data = loadData();
            
            const challenge = {
                id: `custom_${Date.now()}`,
                name: document.getElementById('challenge-name').value,
                type: document.getElementById('challenge-type').value,
                points: parseInt(document.getElementById('challenge-points').value),
                icon: document.getElementById('challenge-emoji').value || '🎯',
                category: document.getElementById('challenge-category').value,
                isCustom: true,
                createdAt: new Date().toISOString()
            };
            
            data.challenges.customChallenges.push(challenge);
            saveData(data);
            
            // フォームをリセット
            document.getElementById('challenge-name').value = '';
            document.getElementById('challenge-emoji').value = '';
            document.getElementById('challenge-points-slider').value = 5;
            updateChallengePoints(5);
            
            showNotification('カスタムチャレンジを作成しました！', 'success');
            updateCustomChallengesList();
        }
        
        // カスタムチャレンジリストを更新
        function updateCustomChallengesList() {
            const data = loadData();
            const container = document.getElementById('custom-challenges-list');
            
            if (container) {
                if (data.challenges.customChallenges.length === 0) {
                    container.innerHTML = '<p style="color: var(--text-secondary); font-size: 12px;">まだカスタムチャレンジを作成していません</p>';
                } else {
                    container.innerHTML = data.challenges.customChallenges.map(challenge => `
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px; background: rgba(139, 92, 246, 0.1); border-radius: 8px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>${challenge.icon}</span>
                                <div>
                                    <div style="font-size: 12px; font-weight: bold;">${challenge.name}</div>
                                    <div style="font-size: 10px; color: var(--text-secondary);">${challenge.type === 'daily' ? 'デイリー' : 'ウィークリー'} / ${challenge.points}pt</div>
                                </div>
                            </div>
                            <button class="btn btn-secondary" onclick="deleteCustomChallenge('${challenge.id}')" style="padding: 4px 8px; font-size: 10px;">
                                削除
                            </button>
                        </div>
                    `).join('');
                }
            }
        }
        
        // カスタムチャレンジを削除
        function deleteCustomChallenge(challengeId) {
            if (confirm('このカスタムチャレンジを削除しますか？')) {
                const data = loadData();
                data.challenges.customChallenges = data.challenges.customChallenges.filter(c => c.id !== challengeId);
                saveData(data);
                updateCustomChallengesList();
                showNotification('カスタムチャレンジを削除しました', 'info');
            }
        }

        // ========== ポイントシステム関連の関数 ==========
        
        // レベル設定（より長期的な目標設定）
        window.LEVEL_THRESHOLDS = window.LEVEL_THRESHOLDS || [
            { level: 1, name: '', min: 0, max: 75 },
            { level: 2, name: '', min: 76, max: 225 },
            { level: 3, name: '', min: 226, max: 450 },
            { level: 4, name: '', min: 451, max: 750 },
            { level: 5, name: '', min: 751, max: 1125 },
            { level: 6, name: '', min: 1126, max: 1650 },
            { level: 7, name: '', min: 1651, max: 2250 },
            { level: 8, name: '', min: 2251, max: 3000 },
            { level: 9, name: '', min: 3001, max: 3900 }
        ];

        // レベルに応じた肩書（タイトル）
        function getLevelTitle(level) {
            const clamp = (n, min, max) => Math.max(min, Math.min(max, n|0));
            const lv = clamp(level, 1, 10000);
            const titles = [
                '駆け出し冒険者', '見習い旅人', '草原を駆ける者',
                '熟練の戦士', '森を統べる者', '王国に名を刻む者',
                '英雄の継承者', '龍を討つ者', '世界を巡る賢者',
                '星を導く者', '天空の覇者', '永劫の守護者',
                '神話を紡ぐ者', '運命を超える者', '全てを極めし者'
            ];
            const idx = (lv - 1) % titles.length;
            return titles[idx];
        }

        // 現在のレベルを計算（モジュール存在時は再定義しない）
        window.calculateLevel = window.calculateLevel || function(lifetimeEarned) {
            const thresholds = window.LEVEL_THRESHOLDS || [];
            for (const t of thresholds) {
                if (lifetimeEarned <= t.max) {
                    const level = t.level;
                    return { level, name: getLevelTitle(level), min: t.min, max: t.max };
                }
            }
            // レベル10以上の計算（700ptごとに+1レベル）
            const baseMin = 3901;
            const step = 700;
            const extraLevels = Math.floor((lifetimeEarned - baseMin) / step);
            let level = 10 + extraLevels;
            let min = baseMin + (extraLevels * step);
            let max = baseMin + ((extraLevels + 1) * step) - 1;
            let capped = false;
            if (level > 10000) {
                level = 10000;
                capped = true;
                // 10000到達時はこれ以上上がらないため、進捗範囲を固定
                min = lifetimeEarned;
                max = lifetimeEarned;
            }
            return { level, name: getLevelTitle(level), min, max, capped };
        }

        // ポイント獲得処理（ブースト機能は無効化）
        function earnPoints(amount, source, description, multiplier = 1.0, category = null, habitId = null, meta = {}) {
            console.log('earnPoints呼び出し:', {amount, source, description, habitId});
            const data = loadData();
            
            // ブースト適用を行わず、素点×倍率のみ反映
            const base = Number.isFinite(amount) ? amount : 0;
            const finalAmount = Math.round(base * (Number.isFinite(multiplier) ? multiplier : 1.0));
            console.log('計算後のポイント:', finalAmount);
            
            // ポイント追加
            const beforePoints = data.pointSystem.currentPoints;
            data.pointSystem.currentPoints += finalAmount;
            data.pointSystem.lifetimeEarned += finalAmount;
            data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
            console.log('ポイント更新:', beforePoints, '→', data.pointSystem.currentPoints);
            
            // レベル更新
            const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
            const oldLevel = data.pointSystem.currentLevel;
            data.pointSystem.currentLevel = newLevel.level;
            
            // トランザクション記録（habitIdを含める）
            const transaction = {
                timestamp: new Date().toISOString(),
                type: 'earn',
                amount: amount,
                source: source,
                description: description,
                multiplier: multiplier,
                finalAmount: finalAmount
            };
            
            // habitIdがある場合は追加
            if (habitId) {
                transaction.habitId = habitId;
            }
            
            // 追加メタ
            if (meta && typeof meta === 'object') {
                transaction.meta = meta;
            }
            data.pointSystem.transactions.unshift(transaction);
            
            // トランザクション履歴を最新100件に制限
            if (data.pointSystem.transactions.length > 100) {
                data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
            }
            
            // カテゴリーポイントを加算（categoryパラメータがある場合）
            let categoryLevelUps = [];
            if (category && window.StatusManager && window.StatusManager.addCategoryPoints) {
                // カテゴリーにポイントを追加（素点×倍率を使用）
                categoryLevelUps = window.StatusManager.addCategoryPoints(category, finalAmount);
            }
            
            saveData(data);
            // 効果（例：スパークル残回数）の表示を即時更新
            try { if (typeof updateActiveEffectsDisplay === 'function') { updateActiveEffectsDisplay(); } } catch(_) {}
            
            // カテゴリーレベルアップ通知（全体レベルアップより先に表示）
            if (categoryLevelUps && categoryLevelUps.length > 0) {
                // カテゴリーレベルアップ演出をキュー式に表示
                setTimeout(() => {
                    if (typeof showCategoryLevelUpQueue === 'function') {
                        showCategoryLevelUpQueue(categoryLevelUps);
                    } else if (typeof window.showCategoryLevelUpQueue === 'function') {
                        window.showCategoryLevelUpQueue(categoryLevelUps);
                    }
                }, newLevel.level > oldLevel ? 3500 : 500); // 全体レベルアップがある場合は少し遅らせる
            }
            
            // ステータスビューを即時更新（開いていなくても安全）
            try { if (typeof refreshStatusView === 'function') refreshStatusView(); } catch(_) {}
            
            // 全体レベルアップ通知
            if (newLevel.level > oldLevel) {
                // ドラクエ風アニメーションを最優先で直接呼び出し（関数宣言はホイストされるため利用可）
                if (typeof showLevelUpCelebration === 'function') {
                    console.log('レベルアップ演出を表示:', oldLevel, '->', newLevel);
                    showLevelUpCelebration(oldLevel, newLevel);
                } else if (typeof window !== 'undefined' && typeof window.showLevelUpCelebration === 'function') {
                    console.log('レベルアップ演出を表示(window):', oldLevel, '->', newLevel);
                    window.showLevelUpCelebration(oldLevel, newLevel);
                } else if (typeof showLevelUpNotification === 'function') {
                    showLevelUpNotification(oldLevel, newLevel);
                } else if (typeof window !== 'undefined' && typeof window.showLevelUpNotification === 'function') {
                    window.showLevelUpNotification(oldLevel, newLevel);
                } else {
                    // フォールバック
                    showNotification(`Lv.${oldLevel} → Lv.${newLevel.level}｜${newLevel.name}`, 'success', 6);
                }
                
                // カード獲得処理
                const cardId = getRandomCardForLevelUp();
                if (cardId) {
                    const updatedData = addCardToInventory(cardId);
                    if (updatedData) {
                        saveData(updatedData);
                    }
                    showNotification('🎁 レベルアップボーナス！カードを1枚獲得！', 'success');
                }
            }
            
            // ポイント獲得アニメーション
            showPointAnimation(finalAmount);
            // ブースト演出は無効化

            // ミステリーボックス効果（今日の最初の習慣達成で発火）
            try {
                if (source === 'habit' && data.cards && data.cards.activeEffects) {
                    const todayKey = dateKeyLocal(new Date());
                    const mbox = data.cards.activeEffects.find(e => e.type === 'mystery_reward' && e.dayKey === todayKey && !e.claimed);
                    if (mbox) {
                        const pool = mbox.options || ['points15','event_trigger','point_gem'];
                        const pick = pool[Math.floor(Math.random() * pool.length)];
                        if (pick === 'points15') {
                            // 追加ポイント
                            data.pointSystem.currentPoints += 15;
                            data.pointSystem.lifetimeEarned += 15;
                            data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
                            data.pointSystem.transactions.unshift({ timestamp:new Date().toISOString(), type:'earn', amount:15, finalAmount:15, source:'mystery', description:'ミステリーボックス(+15pt)' });
                            showCardEffect('🎁 ミステリーボックス！','+15pt を獲得','\#f59e0b');
                        } else if (pick === 'event_trigger') {
                            // カード付与
                            data.cards.inventory.push({ cardId:'event_trigger', acquiredDate:new Date().toISOString(), used:false });
                            // ドロップ履歴に追加
                            try {
                                if (!data.cards.dropHistory) data.cards.dropHistory = [];
                                data.cards.dropHistory.unshift('event_trigger');
                                if (data.cards.dropHistory.length > 100) data.cards.dropHistory = data.cards.dropHistory.slice(0,100);
                            } catch(_){}
                            showCardEffect('🎁 ミステリーボックス！','カード：イベントトリガー','\#f59e0b');
                        } else if (pick === 'point_gem') {
                            data.cards.inventory.push({ cardId:'point_gem', acquiredDate:new Date().toISOString(), used:false });
                            try {
                                if (!data.cards.dropHistory) data.cards.dropHistory = [];
                                data.cards.dropHistory.unshift('point_gem');
                                if (data.cards.dropHistory.length > 100) data.cards.dropHistory = data.cards.dropHistory.slice(0,100);
                            } catch(_){}
                            showCardEffect('🎁 ミステリーボックス！','カード：ポイントジェム','\#f59e0b');
                        }
                        mbox.claimed = true;
                        saveData(data);
                    }
                }
            } catch (e) { /* noop */ }
            
            // UI更新
            updatePointDisplay();
            
            return finalAmount;
        }

        // ポイント消費処理
        function spendPoints(amount, rewardName) {
            // 報酬・支出機能は廃止
            return false;
        }

        // 努力ボーナスポイント獲得（改善版：何度でも使用可能、1-3pt選択）
        function addEffortBonus(points, reason = '') {
            // ポイント数のバリデーション
            if (points < 1 || points > 3) {
                return false;
            }
            
            const data = loadData();
            
            // 使用回数を記録（上限なし）
            data.pointSystem.dailyEffortUsed = (data.pointSystem.dailyEffortUsed || 0) + 1;
            // 獲得処理は earnPoints を通してブースト（ポイントジェム等）を適用
            saveData(data);
            const final = earnPoints(points, 'effort_bonus', reason || `努力ボーナス (${points}pt)`);
            updatePointsView();
            updateStatistics();
            return final >= 0;
        }

        // ポイント表示を更新
        function updatePointDisplay() {
            const data = loadData();
            const pointDisplay = document.getElementById('point-display');
            const levelInfo = calculateLevel(data.pointSystem.lifetimeEarned);
            const current = data.pointSystem.lifetimeEarned; // ヘッダーは生涯ポイントで統一
            console.log('updatePointDisplay: 生涯ポイント =', current);
            if (pointDisplay) {
                const amountEl = pointDisplay.querySelector('.point-amount');
                const levelEl = pointDisplay.querySelector('.level-info');
                if (amountEl) amountEl.textContent = `💰 ${current}pt`;
                // 称号のみ表示（次回称号は表示しない）
                if (levelEl) levelEl.textContent = `Lv.${levelInfo.level} ${levelInfo.name}`;
            }

            // 努力ボーナスエリアの表示も更新
            updateEffortBonusArea();

            // レベルアップ演出の保険（ホーム画面の表示更新時に検知して発火）
            try {
                if (!data.meta) data.meta = {};
                const prevCelebrated = typeof data.meta.lastLevelCelebrated === 'number' ? data.meta.lastLevelCelebrated : levelInfo.level;
                if (levelInfo.level > prevCelebrated) {
                    const oldLv = prevCelebrated;
                    const newLv = levelInfo;
                    // 最優先で直接アニメ表示、無ければ簡易通知
                    if (typeof showLevelUpCelebration === 'function') {
                        showLevelUpCelebration(oldLv, newLv);
                    } else if (typeof window !== 'undefined' && typeof window.showLevelUpCelebration === 'function') {
                        window.showLevelUpCelebration(oldLv, newLv);
                    } else {
                        try { showNotification(`Lv.${oldLv} → Lv.${newLv.level}｜${newLv.name}`, 'success', 6); } catch(_) {}
                    }
                    data.meta.lastLevelCelebrated = levelInfo.level;
                    saveData(data);
                } else if (data.meta.lastLevelCelebrated === undefined) {
                    // 初期化
                    data.meta.lastLevelCelebrated = levelInfo.level;
                    saveData(data);
                }
            } catch(_) {}
        }
        
        // 努力ボーナス表示を更新（改善版：使用回数表示）
        function updateEffortBonusDisplay() {
            const data = loadData();
            const usedToday = data.pointSystem.dailyEffortUsed || 0;
            const effortStars = document.getElementById('effort-stars');
            const effortCount = document.getElementById('effort-count');
            
            if (effortStars) {
                // 今日の使用回数を星で表示（最大10個まで表示）
                let stars = '';
                const displayCount = Math.min(usedToday, 10);
                for (let i = 0; i < displayCount; i++) {
                    stars += '⭐';
                }
                if (usedToday > 10) {
                    stars += `+${usedToday - 10}`;
                }
                if (usedToday === 0) {
                    stars = '💪 まだ使っていません';
                }
                effortStars.textContent = stars;
            }
            
            if (effortCount) {
                effortCount.textContent = `今日${usedToday}回使用`;
            }
        }
        
        // 努力ボーナスボタンクリック時のエフェクト
        function handleEffortBonusClick(event) {
            const button = event.currentTarget;
            
            // ボタンにパルスエフェクトを追加
            button.classList.add('effort-click-effect');
            setTimeout(() => {
                button.classList.remove('effort-click-effect');
            }, 400);
            
            // 星のパーティクルを生成
            const buttonRect = button.getBoundingClientRect();
            const particles = ['⭐', '✨', '💫', '🌟'];
            
            for (let i = 0; i < 5; i++) {
                setTimeout(() => {
                    const particle = document.createElement('div');
                    particle.className = 'effort-star-particle';
                    particle.textContent = particles[Math.floor(Math.random() * particles.length)];
                    
                    // ボタンの中心から少しランダムな位置に配置
                    const offsetX = (Math.random() - 0.5) * 40;
                    const offsetY = (Math.random() - 0.5) * 20;
                    
                    particle.style.left = (buttonRect.left + buttonRect.width / 2 + offsetX) + 'px';
                    particle.style.top = (buttonRect.top + buttonRect.height / 2 + offsetY) + 'px';
                    
                    document.body.appendChild(particle);
                    
                    // アニメーション終了後に削除
                    setTimeout(() => {
                        particle.remove();
                    }, 800);
                }, i * 50); // 少しずつ遅らせて生成
            }
            
            // クリック音（音が利用可能な場合）
            try {
                const audio = new Audio('data:audio/wav;base64,UklGRnQFAABXQVZFZm10IBAAAAABAAEAJxAAAEwgAAACABAA');
                audio.volume = 0.3;
                audio.play().catch(() => {}); // エラーを無視
            } catch (e) {
                // 音声再生に失敗しても続行
            }
        }

        // 努力ボーナスダイアログを表示（改善版：1-3pt選択可能）
        function showEffortBonusDialog() {
            // カスタムダイアログHTMLを作成
            const dialogHTML = `
                <div id="effort-dialog" style="
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: var(--surface);
                    border: 2px solid var(--primary);
                    border-radius: 16px;
                    padding: 24px;
                    z-index: 10000;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                    max-width: 90%;
                    width: 320px;
                ">
                    <h3 style="margin-bottom: 16px; color: var(--primary);">💪 今日の目標</h3>
                    <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">達成したい目標を設定し、完了したらポイントを獲得します</p>
                    <div style="margin-bottom: 12px;">
                        <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">種類を選択</label>
                        <select id="effort-type" style="
                            width: 100%;
                            padding: 8px;
                            background: var(--background);
                            border: 1px solid var(--border);
                            border-radius: 8px;
                            color: var(--text-primary);
                            margin-bottom: 12px;
                        ">
                            <option value="morning">🌅 早起き・朝活</option>
                            <option value="exercise">💪 運動・トレーニング</option>
                            <option value="study">📚 勉強・学習</option>
                            <option value="work">💼 仕事・作業</option>
                            <option value="health">🥗 健康・食事</option>
                            <option value="cleaning">🧹 掃除・整理整頓</option>
                            <option value="mindfulness">🧘 瞑想・リラックス</option>
                            <option value="social">👥 人間関係・交流</option>
                            <option value="creative">🎨 創造・趣味</option>
                            <option value="challenge">🎯 新しい挑戦</option>
                            <option value="other">✨ その他</option>
                        </select>
                    </div>
                    <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; color: var(--text-secondary);">詳細（任意）</label>
                        <input type="text" id="effort-reason" placeholder="例: 6時に起きて朝活した" style="
                            width: 100%;
                            padding: 8px;
                            background: var(--background);
                            border: 1px solid var(--border);
                            border-radius: 8px;
                            color: var(--text-primary);
                        ">
                    </div>
                    <div style="margin-bottom: 20px;">
                        <label style="display: block; margin-bottom: 12px; color: var(--text-secondary);">獲得ポイント</label>
                        <div style="display: flex; gap: 8px;">
                            <button onclick="selectEffortPoints(1)" id="effort-1pt" class="effort-point-btn" style="
                                flex: 1;
                                padding: 12px;
                                background: var(--surface-light);
                                border: 2px solid var(--border);
                                border-radius: 8px;
                                color: var(--text-primary);
                                cursor: pointer;
                                font-size: 16px;
                                font-weight: bold;
                            ">1pt<br><small style="font-size: 11px; opacity: 0.8;">軽い努力</small></button>
                            <button onclick="selectEffortPoints(2)" id="effort-2pt" class="effort-point-btn" style="
                                flex: 1;
                                padding: 12px;
                                background: var(--primary);
                                border: 2px solid var(--primary);
                                border-radius: 8px;
                                color: white;
                                cursor: pointer;
                                font-size: 16px;
                                font-weight: bold;
                            ">2pt<br><small style="font-size: 11px; opacity: 0.8;">普通の努力</small></button>
                            <button onclick="selectEffortPoints(3)" id="effort-3pt" class="effort-point-btn" style="
                                flex: 1;
                                padding: 12px;
                                background: var(--surface-light);
                                border: 2px solid var(--border);
                                border-radius: 8px;
                                color: var(--text-primary);
                                cursor: pointer;
                                font-size: 16px;
                                font-weight: bold;
                            ">3pt<br><small style="font-size: 11px; opacity: 0.8;">大きな努力</small></button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="confirmEffortBonus()" style="
                            flex: 1;
                            padding: 12px;
                            background: var(--primary);
                            border: none;
                            border-radius: 8px;
                            color: white;
                            cursor: pointer;
                            font-weight: bold;
                        ">目標を設定</button>
                        <button onclick="closeEffortDialog()" style="
                            flex: 1;
                            padding: 12px;
                            background: var(--surface-light);
                            border: none;
                            border-radius: 8px;
                            color: var(--text-primary);
                            cursor: pointer;
                        ">キャンセル</button>
                    </div>
                </div>
                <div id="effort-overlay" onclick="closeEffortDialog()" style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    z-index: 9999;
                "></div>
            `;
            
            // ダイアログを表示
            const dialogContainer = document.createElement('div');
            dialogContainer.innerHTML = dialogHTML;
            document.body.appendChild(dialogContainer);
            
            // デフォルトで2ptを選択
            window.selectedEffortPoints = 2;
        }
        
        // 努力ポイントを選択
        function selectEffortPoints(points) {
            window.selectedEffortPoints = points;
            // ボタンのスタイルを更新
            document.querySelectorAll('.effort-point-btn').forEach(btn => {
                btn.style.background = 'var(--surface-light)';
                btn.style.borderColor = 'var(--border)';
                btn.style.color = 'var(--text-primary)';
            });
            const selectedBtn = document.getElementById(`effort-${points}pt`);
            if (selectedBtn) {
                selectedBtn.style.background = 'var(--primary)';
                selectedBtn.style.borderColor = 'var(--primary)';
                selectedBtn.style.color = 'white';
            }
        }
        
        // 努力ボーナスを確定
        function confirmEffortBonus() {
            const typeSelect = document.getElementById('effort-type');
            const typeText = typeSelect.options[typeSelect.selectedIndex].text;
            const detail = document.getElementById('effort-reason').value;
            const points = window.selectedEffortPoints || 2;
            
            // 予定として追加
            addEffortBonusPlan(points, typeText, detail);
            
            // 成功メッセージ
            const message = document.createElement('div');
            message.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--primary);
                color: white;
                padding: 20px 40px;
                border-radius: 20px;
                font-size: 18px;
                font-weight: 600;
                z-index: 10001;
                animation: fadeInOut 2s ease-out;
            `;
            message.textContent = `📋 目標を設定しました`;
            document.body.appendChild(message);
            setTimeout(() => message.remove(), 2000);
            
            closeEffortDialog();
        }
        
        // 努力ボーナスの目標を追加
        function addEffortBonusPlan(points, type, reason = '') {
            // ポイント数のバリデーション
            if (!points || points < 1 || points > 3) {
                return;
            }
            
            const data = loadData();
            const today = dateKeyLocal(new Date());
            
            // 努力ボーナスの予定リストを初期化
            if (!data.effortBonusPlans) data.effortBonusPlans = {};
            if (!data.effortBonusPlans[today]) data.effortBonusPlans[today] = [];
            
            // 新しい予定を追加
            const plan = {
                id: 'effort_' + Date.now(),
                points: points,
                type: type,
                reason: reason,
                completed: false,
                createdAt: new Date().toISOString()
            };
            
            data.effortBonusPlans[today].push(plan);
            saveData(data);
            
            // 努力ボーナスエリアを更新
            updateEffortBonusArea();
        }
        
        // 努力ボーナスの目標を完了
        function completeEffortBonusPlan(planId) {
            const data = loadData();
            const today = dateKeyLocal(new Date());
            
            if (!data.effortBonusPlans || !data.effortBonusPlans[today]) return;
            
            const plan = data.effortBonusPlans[today].find(p => p.id === planId);
            if (!plan || plan.completed) return;
            
            // 完了状態に変更
            plan.completed = true;
            plan.completedAt = new Date().toISOString();
            
            // 使用回数を記録
            data.pointSystem.dailyEffortUsed = (data.pointSystem.dailyEffortUsed || 0) + 1;
            
            // ポイント追加（直接処理）
            data.pointSystem.currentPoints += plan.points;
            data.pointSystem.lifetimeEarned += plan.points;
            data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
            
            // レベル更新
            const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
            const oldLevel = data.pointSystem.currentLevel;
            data.pointSystem.currentLevel = newLevel.level;
            
            // トランザクション記録
            data.pointSystem.transactions.unshift({
                timestamp: new Date().toISOString(),
                type: 'earn',
                amount: plan.points,
                source: 'effort_bonus',
                description: plan.reason || `努力ボーナス: ${plan.type} (${plan.points}pt)`,
                finalAmount: plan.points
            });
            
            // トランザクション履歴を最新100件に制限
            if (data.pointSystem.transactions.length > 100) {
                data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
            }
            
            saveData(data);
            updatePointDisplay();
            updateEffortBonusArea();
            
            // エフェクトを表示
            const button = document.getElementById('effort-plan-' + planId);
            if (button) {
                showFloatingPoints(plan.points, button);
            }
            playPointSound();
            
            // レベルアップ通知
            if (newLevel.level > oldLevel) {
                // ドラクエ風アニメーションを最優先で直接呼び出し（関数宣言はホイストされるため利用可）
                if (typeof showLevelUpCelebration === 'function') {
                    console.log('レベルアップ演出を表示:', oldLevel, '->', newLevel);
                    showLevelUpCelebration(oldLevel, newLevel);
                } else if (typeof window !== 'undefined' && typeof window.showLevelUpCelebration === 'function') {
                    console.log('レベルアップ演出を表示(window):', oldLevel, '->', newLevel);
                    window.showLevelUpCelebration(oldLevel, newLevel);
                } else if (typeof showLevelUpNotification === 'function') {
                    showLevelUpNotification(oldLevel, newLevel);
                } else if (typeof window !== 'undefined' && typeof window.showLevelUpNotification === 'function') {
                    window.showLevelUpNotification(oldLevel, newLevel);
                } else {
                    // フォールバック
                    showNotification(`Lv.${oldLevel} → Lv.${newLevel.level}｜${newLevel.name}`, 'success', 6);
                }
                
                // カード獲得処理
                const cardId = getRandomCardForLevelUp();
                if (cardId) {
                    const updatedData = addCardToInventory(cardId);
                    if (updatedData) {
                        saveData(updatedData);
                    }
                    showNotification('🎁 レベルアップボーナス！カードを1枚獲得！', 'success');
                }
            }
        }
        
        // 努力ボーナスの目標を削除
        function deleteEffortBonusPlan(planId) {
            const data = loadData();
            const today = dateKeyLocal(new Date());
            
            if (!data.effortBonusPlans || !data.effortBonusPlans[today]) return;
            
            // 予定を削除
            data.effortBonusPlans[today] = data.effortBonusPlans[today].filter(p => p.id !== planId);
            
            saveData(data);
            updateEffortBonusArea();
        }
        
        // 努力ボーナスの完了を取り消し
        function undoEffortBonusPlan(planId) {
            const data = loadData();
            const today = dateKeyLocal(new Date());
            
            if (!data.effortBonusPlans || !data.effortBonusPlans[today]) return;
            
            const plan = data.effortBonusPlans[today].find(p => p.id === planId);
            if (!plan || !plan.completed) return;
            
            // 完了状態を取り消し
            plan.completed = false;
            delete plan.completedAt;
            
            // ポイントを減算
            data.pointSystem.currentPoints -= plan.points;
            data.pointSystem.lifetimeEarned -= plan.points;
            data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
            
            // 使用回数を減らす
            data.pointSystem.dailyEffortUsed = Math.max(0, (data.pointSystem.dailyEffortUsed || 0) - 1);
            
            // レベル更新
            const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
            data.pointSystem.currentLevel = newLevel.level;
            
            // トランザクション記録
            data.pointSystem.transactions.unshift({
                timestamp: new Date().toISOString(),
                type: 'undo',
                amount: -plan.points,
                source: 'effort_bonus',
                description: `努力ボーナス取り消し: ${plan.type}`
            });
            
            if (data.pointSystem.transactions.length > 100) {
                data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
            }
            
            saveData(data);
            
            // 表示を更新
            updateEffortBonusArea();
            updatePointDisplay();
            updateStatistics();
            
            showNotification(`努力ボーナス取り消し: -${plan.points}pt`, 'warning');
        }
        
        // テーマ切り替え関数
        function toggleTheme() {
            const root = document.documentElement;
            const currentTheme = localStorage.getItem('theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            if (newTheme === 'light') {
                root.classList.add('light-theme');
                document.getElementById('theme-icon').textContent = '☀️';
            } else {
                root.classList.remove('light-theme');
                document.getElementById('theme-icon').textContent = '🌙';
            }
            
            localStorage.setItem('theme', newTheme);
        }
        
        // テーマを初期化
        function initializeTheme() {
            const savedTheme = localStorage.getItem('theme') || 'dark';
            const root = document.documentElement;
            
            if (savedTheme === 'light') {
                root.classList.add('light-theme');
                document.getElementById('theme-icon').textContent = '☀️';
            } else {
                root.classList.remove('light-theme');
                document.getElementById('theme-icon').textContent = '🌙';
            }
        }
        
        // windowオブジェクトに登録
        window.toggleTheme = toggleTheme;
        window.initializeTheme = initializeTheme;
        
        // 努力ボーナスエリアを更新
        function updateEffortBonusArea() {
            const data = loadData();
            const today = dateKeyLocal(new Date());
            const plans = data.effortBonusPlans && data.effortBonusPlans[today] ? data.effortBonusPlans[today] : [];
            
            const container = document.getElementById('effort-bonus-plans');
            if (!container) return;
            
            if (plans.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary); font-size: 14px; margin: 8px 0;">設定された目標はありません</p>';
            } else {
                container.innerHTML = '';
                plans.forEach(plan => {
                    const planDiv = document.createElement('div');
                    planDiv.style.cssText = `
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        padding: 8px;
                        margin-bottom: 8px;
                        background: ${plan.completed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.05)'};
                        border: 1px solid ${plan.completed ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'};
                        border-radius: 8px;
                        transition: all 0.3s ease;
                    `;
                    
                    const leftDiv = document.createElement('div');
                    leftDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1;';
                    
                    const icon = document.createElement('span');
                    icon.style.fontSize = '20px';
                    icon.textContent = plan.completed ? '✅' : '📋';
                    leftDiv.appendChild(icon);
                    
                    const textDiv = document.createElement('div');
                    textDiv.style.cssText = 'flex: 1;';
                    
                    const typeText = document.createElement('div');
                    typeText.style.cssText = `
                        font-size: 14px;
                        font-weight: 500;
                        ${plan.completed ? 'text-decoration: line-through; opacity: 0.7;' : ''}
                    `;
                    typeText.textContent = `${plan.type} (+${plan.points}pt)`;
                    textDiv.appendChild(typeText);
                    
                    if (plan.reason) {
                        const reasonText = document.createElement('div');
                        reasonText.style.cssText = 'font-size: 12px; color: var(--text-secondary); margin-top: 2px;';
                        reasonText.textContent = plan.reason;
                        textDiv.appendChild(reasonText);
                    }
                    
                    leftDiv.appendChild(textDiv);
                    planDiv.appendChild(leftDiv);
                    
                    const buttonsDiv = document.createElement('div');
                    buttonsDiv.style.cssText = 'display: flex; gap: 4px;';
                    
                    if (!plan.completed) {
                        // 完了ボタン
                        const completeBtn = document.createElement('button');
                        completeBtn.id = 'effort-plan-' + plan.id;
                        completeBtn.className = 'btn btn-primary';
                        completeBtn.style.cssText = 'padding: 4px 8px; font-size: 12px;';
                        completeBtn.textContent = '完了';
                        completeBtn.onclick = () => completeEffortBonusPlan(plan.id);
                        buttonsDiv.appendChild(completeBtn);
                        
                        // 削除ボタン
                        const deleteBtn = document.createElement('button');
                        deleteBtn.className = 'btn btn-secondary';
                        deleteBtn.style.cssText = 'padding: 4px 8px; font-size: 12px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3);';
                        deleteBtn.textContent = '削除';
                        deleteBtn.onclick = () => {
                            if (confirm('この目標を削除しますか？')) {
                                deleteEffortBonusPlan(plan.id);
                            }
                        };
                        buttonsDiv.appendChild(deleteBtn);
                    } else {
                        // 完了済みの場合、長押しで取り消し可能なインジケーター
                        const completedDiv = document.createElement('div');
                        completedDiv.style.cssText = 'padding: 4px 8px; font-size: 12px; color: #10b981; user-select: none;';
                        completedDiv.textContent = '✅ 完了';
                        
                        // 長押しで取り消し
                        let longPressTimer;
                        completedDiv.addEventListener('touchstart', (e) => {
                            longPressTimer = setTimeout(() => {
                                if (confirm('この努力ボーナスの完了を取り消しますか？')) {
                                    undoEffortBonusPlan(plan.id);
                                }
                            }, 800); // 0.8秒の長押し
                            e.preventDefault();
                        });
                        
                        completedDiv.addEventListener('touchend', () => {
                            clearTimeout(longPressTimer);
                        });
                        
                        completedDiv.addEventListener('touchcancel', () => {
                            clearTimeout(longPressTimer);
                        });
                        
                        // デスクトップ用の長押し
                        completedDiv.addEventListener('mousedown', (e) => {
                            longPressTimer = setTimeout(() => {
                                if (confirm('この努力ボーナスの完了を取り消しますか？')) {
                                    undoEffortBonusPlan(plan.id);
                                }
                            }, 800);
                            e.preventDefault();
                        });
                        
                        completedDiv.addEventListener('mouseup', () => {
                            clearTimeout(longPressTimer);
                        });
                        
                        completedDiv.addEventListener('mouseleave', () => {
                            clearTimeout(longPressTimer);
                        });
                        
                        buttonsDiv.appendChild(completedDiv);
                    }
                    
                    planDiv.appendChild(buttonsDiv);
                    container.appendChild(planDiv);
                });
            }
            
            // 努力ボーナスカードの更新も行う
            const effortCard = document.getElementById('effort-bonus-card');
            if (effortCard) {
                const usedToday = data.pointSystem.dailyEffortUsed || 0;
                const pendingCount = plans.filter(p => !p.completed).length;
                const completedCount = plans.filter(p => p.completed).length;
                
                effortCard.innerHTML = `
                    <h3 class="card-title">💪 努力ボーナス</h3>
                    <p style="margin-bottom: 12px;">今日達成したい目標を設定してポイントを獲得しましょう！</p>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <span style="color: var(--text-secondary); font-size: 14px;">
                            未完了: ${pendingCount}件 | 完了: ${completedCount}件
                        </span>
                        <span style="font-size: 24px;">${completedCount > 0 ? '⭐'.repeat(Math.min(completedCount, 5)) : '🌱'}</span>
                    </div>
                    <button class="btn btn-secondary" onclick="handleEffortBonusClick(event); showEffortBonusDialog()" style="width: 100%; padding: 10px; font-size: 14px; position: relative; overflow: visible;">
                        💪 目標を追加する (+1-3pt)
                    </button>
                `;
            }
        }

        // ===== FAB（クイックアクション） =====
        function toggleFab() {
            const fab = document.getElementById('fab');
            if (!fab) return;
            const open = fab.classList.toggle('open');
            const main = document.getElementById('fab-main');
            if (main) main.textContent = open ? '×' : '＋';
        }
        window.toggleFab = toggleFab;

        // ===== Celebration: Confetti + Mini Modal =====
        function showConfetti(duration = 1200, count = 24) {
            const colors = ['#22c55e','#06b6d4','#f59e0b','#ef4444','#8b5cf6'];
            for (let i = 0; i < count; i++) {
                const piece = document.createElement('div');
                piece.className = 'confetti';
                const size = 6 + Math.random() * 6;
                piece.style.width = size + 'px';
                piece.style.height = (size * 1.2) + 'px';
                piece.style.left = (Math.random() * 100) + 'vw';
                piece.style.background = colors[i % colors.length];
                piece.style.transform = `translateY(-20vh) rotate(${Math.random()*360}deg)`;
                piece.style.animation = `confettiFall ${0.9 + Math.random()*0.6}s ease-out forwards`;
                piece.style.animationDelay = (Math.random()*0.2) + 's';
                document.body.appendChild(piece);
                setTimeout(() => piece.remove(), duration + 600);
            }
        }

        function showMiniModal(title, desc, actions = []) {
            const modal = document.createElement('div');
            modal.className = 'mini-modal';
            const actionsHtml = actions.map(a => `<button onclick=\"${a.onclick}\">${a.label}</button>`).join('');
            modal.innerHTML = `<div class=\"title\">${title}</div><div class=\"desc\">${desc}</div>${actions.length?`<div class=\"actions\">${actionsHtml}</div>`:''}`;
            document.body.appendChild(modal);
            setTimeout(() => { modal.style.opacity = '0'; modal.style.transform = 'translate(-50%, -6px)'; }, 1500);
            setTimeout(() => modal.remove(), 1800);
        }

        function showLevelUpCelebration(oldLevel, newLevel, categoryInfo = null) {
            // ドラクエ風レベルアップ演出（全体／カテゴリー共通）
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: radial-gradient(ellipse at center, rgba(255, 215, 0, 0.3) 0%, rgba(255, 215, 0, 0) 70%);
                z-index: 10000;
                animation: levelUpFlash 0.5s ease-out;
            `;
            
            const messageBox = document.createElement('div');
            messageBox.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                color: #fff;
                padding: 30px 40px;
                border-radius: 12px;
                border: 3px solid #ffd700;
                box-shadow: 0 0 40px rgba(255, 215, 0, 0.6), inset 0 0 20px rgba(255, 255, 255, 0.2);
                font-size: 20px;
                font-weight: bold;
                text-align: center;
                z-index: 10001;
                animation: levelUpBounce 1s ease-out;
                min-width: 300px;
            `;
            
            // ステータス増分（存在すれば計算）
            let deltaHtml = '';
            try {
                if (typeof getStatusDelta === 'function') {
                    const d = getStatusDelta(oldLevel, newLevel.level);
                    if (d && (d.keizoku||d.shuchu||d.kaifuku||d.sekkei||d.kiso)) {
                        deltaHtml = `
                        <div style="margin-top:12px; font-size:16px; text-align:left; border-top:1px solid rgba(255,255,255,0.2); padding-top:10px;">
                            <div style="margin-bottom:6px; color:#ffd700;">ステータスが上がった！</div>
                            <div>けいぞくりょく +${d.keizoku||0}</div>
                            <div>しゅうちゅうりょく +${d.shuchu||0}</div>
                            <div>かいふくりょく +${d.kaifuku||0}</div>
                            <div>せっけいりょく +${d.sekkei||0}</div>
                            <div>きそたいりょく +${d.kiso||0}</div>
                        </div>`;
                    }
                }
            } catch(_) {}

            // レベルアップメッセージ（カテゴリー対応）
            if (categoryInfo) {
                // カテゴリーレベルアップ
                const statNames = {
                    keizoku: 'けいぞくりょく',
                    shuchu: 'しゅうちゅうりょく',
                    kaifuku: 'かいふくりょく',
                    sekkei: 'せっけいりょく',
                    kiso: 'きそたいりょく'
                };
                messageBox.innerHTML = `
                    <div style="font-size: 28px; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); animation: levelUpPulse 1s ease-in-out infinite;">
                        ✨ ${categoryInfo.categoryName} LEVEL UP! ✨
                    </div>
                    <div style="font-size: 20px; margin: 15px 0; color: #ffd700; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                        Lv.${categoryInfo.oldLevel || (categoryInfo.level-1)} ▶ Lv.${categoryInfo.level}
                    </div>
                    <div style="font-size: 18px; margin-top: 10px; color: #fff9c4;">
                        ${categoryInfo.title}
                    </div>
                    <div style="margin-top:12px; font-size:16px; text-align:left; border-top:1px solid rgba(255,255,255,0.2); padding-top:10px;">
                        <div style="margin-bottom:6px; color:#ffd700;">ステータスが上がった！</div>
                        <div>${statNames[categoryInfo.stat]} +${categoryInfo.increment}</div>
                    </div>
                    <div style="margin-top: 20px; font-size: 14px; opacity: 0.9;">
                        タップして閉じる
                    </div>
                `;
            } else {
                // 全体レベルアップ
                messageBox.innerHTML = `
                    <div style="font-size: 32px; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.5); animation: levelUpPulse 1s ease-in-out infinite;">
                        ✨ LEVEL UP! ✨
                    </div>
                    <div style="font-size: 24px; margin: 15px 0; color: #ffd700; text-shadow: 1px 1px 2px rgba(0,0,0,0.5);">
                        Lv.${oldLevel} ▶ Lv.${newLevel.level}
                    </div>
                    <div style="font-size: 18px; margin-top: 10px; color: #fff9c4;">
                        ${newLevel.name}
                    </div>
                    ${deltaHtml}
                    <div style="margin-top: 20px; font-size: 14px; opacity: 0.9;">
                        タップして閉じる
                    </div>
                `;
            }
            
            // キラキラエフェクト
            const particles = [];
            for (let i = 0; i < 20; i++) {
                const particle = document.createElement('div');
                const angle = (Math.PI * 2 * i) / 20;
                const distance = 100 + Math.random() * 50;
                particle.style.cssText = `
                    position: fixed;
                    width: 4px;
                    height: 4px;
                    background: #ffd700;
                    border-radius: 50%;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 10002;
                    animation: particleFloat 1.5s ease-out forwards;
                    --x: ${Math.cos(angle) * distance}px;
                    --y: ${Math.sin(angle) * distance}px;
                `;
                particles.push(particle);
                document.body.appendChild(particle);
            }
            
            // CSSアニメーションを追加
            const style = document.createElement('style');
            style.textContent = `
                @keyframes levelUpFlash {
                    0% { opacity: 0; }
                    50% { opacity: 1; }
                    100% { opacity: 0; }
                }
                @keyframes levelUpBounce {
                    0% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
                    50% { transform: translate(-50%, -50%) scale(1.1); }
                    100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
                }
                @keyframes levelUpPulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                }
                @keyframes particleFloat {
                    0% {
                        transform: translate(-50%, -50%);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y)));
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(overlay);
            document.body.appendChild(messageBox);
            
            // クリックで閉じる
            const closeAnimation = () => {
                messageBox.style.animation = 'levelUpBounce 0.3s ease-in reverse';
                overlay.style.animation = 'levelUpFlash 0.3s ease-in reverse';
                setTimeout(() => {
                    overlay.remove();
                    messageBox.remove();
                    particles.forEach(p => p.remove());
                    style.remove();
                }, 300);
            };
            
            messageBox.addEventListener('click', closeAnimation);
            overlay.addEventListener('click', closeAnimation);
            
            // 3秒後に自動で閉じる
            setTimeout(closeAnimation, 3000);
            
            // 紙吹雪も追加
            showConfetti(1200, 28);
        }
        window.showLevelUpCelebration = showLevelUpCelebration;
        window.showLevelProgress = showLevelProgress;

        function showBadgeShowcase(emoji, name){
            const box = document.createElement('div');
            box.className = 'badge-showcase';
            box.innerHTML = `<div class=\"emoji\">${emoji}</div><div class=\"name\">${name}</div>`;
            document.body.appendChild(box);
            setTimeout(()=>{ box.style.opacity='0'; box.style.transform='translate(-50%,-54%)'; }, 900);
            setTimeout(()=> box.remove(), 1200);
        }
        window.showBadgeShowcase = showBadgeShowcase;

        function openRewardsUseFlow(){
            showPointsView();
            setTimeout(()=>{
                try{ showRewardsTab(); }catch(e){}
                const list = document.getElementById('rewards-list');
                if (list){ list.scrollIntoView({behavior:'smooth', block:'start'}); list.classList.add('pulse-highlight'); setTimeout(()=> list.classList.remove('pulse-highlight'), 1800); }
            }, 80);
        }
        window.openRewardsUseFlow = openRewardsUseFlow;

        // quickAchieveToday は仕様変更により削除
        
        // Window オブジェクトに関数を登録
        window.addEffortBonusPlan = addEffortBonusPlan;
        window.completeEffortBonusPlan = completeEffortBonusPlan;
        window.deleteEffortBonusPlan = deleteEffortBonusPlan;
        window.updateEffortBonusArea = updateEffortBonusArea;
        
        // ダイアログを閉じる
        function closeEffortDialog() {
            const dialog = document.getElementById('effort-dialog');
            const overlay = document.getElementById('effort-overlay');
            if (dialog && dialog.parentElement) {
                dialog.parentElement.remove();
            }
        }

        // レベルアップ通知
        window.showLevelUpNotification = function(oldLevel, newLevel) {
            // 軽量な祝祭演出＋短い通知
            try { showLevelUpCelebration(oldLevel, newLevel); } catch(e) {}
            showNotification(`Lv.${oldLevel} → Lv.${newLevel.level}｜${newLevel.name}`, 'success', 6);
            
            // レベルアップ時にカードを1枚獲得
            const cardId = getRandomCardForLevelUp();
            if (cardId) {
                const updatedData = addCardToInventory(cardId);
                if (updatedData) {
                    saveData(updatedData);
                }
                setTimeout(() => {
                    if (window.showCardAcquisition) {
                        window.showCardAcquisition([cardId], () => {
                            showNotification('🎁 レベルアップボーナス！カードを1枚獲得！', 'success');
                        });
                    } else {
                        showNotification('🎁 レベルアップボーナス！カードを1枚獲得！', 'success');
                    }
                }, 1500);
            }
        }
        
        // カテゴリーレベルアップ演出関数を追加
        function showCategoryLevelUpQueue(levelUps, index = 0) {
            if (!levelUps || index >= levelUps.length) return;
            
            const lvUp = levelUps[index];
            showLevelUpCelebration(null, null, lvUp);
            
            // 3秒後に次の演出
            setTimeout(() => {
                showCategoryLevelUpQueue(levelUps, index + 1);
            }, 3000);
        }
        window.showCategoryLevelUpQueue = showCategoryLevelUpQueue;
        
        // レベルアップ時のランダムカード取得
        function getRandomCardForLevelUp() {
            // レベルアップ報酬用のカードプール
            const cardPool = [
                'point_gem', 'shield_card', 'challenge_card', 'recovery_card',
                'boost_card', 'perfect_bonus', 'combo_master', 'double_point',
                'effort_multiplier', 'protection_charm', 'time_extend',
                'power_nap', 'shuffle_challenge', 'event_shuffle'
            ];
            
            // ランダムに1枚選択
            return cardPool[Math.floor(Math.random() * cardPool.length)];
        }

        // ポイント獲得アニメーション
        function showPointAnimation(points) {
            // 重複表示を防ぐため、この関数では何もしない
            // ポイント表示はearnPoints内のdescriptionで行う
        }

        // レベル進捗を表示
        function showLevelProgress() {
            const data = loadData();
            const currentPoints = data.pointSystem.lifetimeEarned;
            const levelInfo = calculateLevel(currentPoints);
            
            // 次のレベルまでの情報を計算
            const nextLevelPoints = levelInfo.max + 1;
            const pointsNeeded = nextLevelPoints - currentPoints;
            const progressInLevel = currentPoints - levelInfo.min;
            const levelRange = levelInfo.max - levelInfo.min + 1;
            const progressPercent = Math.round((progressInLevel / levelRange) * 100);
            
            // 次のレベル名を取得
            // 次のレベル名（上限時はMAX表示）
            const nextLevelName = levelInfo.capped ? 'MAX' : getLevelTitle(levelInfo.level + 1);
            
            // ポップアップを作成
            const popup = document.createElement('div');
            popup.id = 'level-progress-popup';
            popup.style.cssText = `
                position: fixed;
                top: 80px;
                right: 20px;
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 16px;
                z-index: 1000;
                min-width: 280px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                animation: slideIn 0.2s ease-out;
            `;
            
            popup.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <h3 style="margin: 0; font-size: 16px;">📊 レベル進捗</h3>
                    <button onclick="document.getElementById('level-progress-popup').remove()" style="
                        background: none;
                        border: none;
                        color: var(--text-secondary);
                        font-size: 20px;
                        cursor: pointer;
                        padding: 0;
                        width: 24px;
                        height: 24px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">×</button>
                </div>
                
                <div style="background: var(--background); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-size: 18px; font-weight: bold; color: var(--primary);">
                            Lv.${levelInfo.level} ${levelInfo.name}
                        </span>
                        <span style="font-size: 14px; color: var(--text-secondary);">
                            ${currentPoints}pt
                        </span>
                    </div>
                    <div style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="
                            background: linear-gradient(90deg, #10b981, #3b82f6);
                            height: 100%;
                            width: ${progressPercent}%;
                            transition: width 0.3s;
                        "></div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px; text-align: center;">
                        ${progressPercent}% 完了
                    </div>
                </div>
                
                <div style="background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(236, 72, 153, 0.1)); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 14px; margin-bottom: 8px;">
                        次のレベルまで
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <span style="font-size: 24px; font-weight: bold; color: #8b5cf6;">
                                ${pointsNeeded}pt
                            </span>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                                Lv.${levelInfo.level + 1} ${nextLevelName}
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 12px; color: var(--text-secondary);">
                                必要合計
                            </div>
                            <div style="font-size: 16px; font-weight: bold; color: #ec4899;">
                                ${nextLevelPoints}pt
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // 既存のポップアップがあれば削除
            const existingPopup = document.getElementById('level-progress-popup');
            if (existingPopup) {
                existingPopup.remove();
            }
            
            // ポップアップを追加
            document.body.appendChild(popup);
            
            // クリック外で閉じる処理
            setTimeout(() => {
                const closeOnClickOutside = (e) => {
                    if (!popup.contains(e.target) && e.target.id !== 'point-display' && !document.getElementById('point-display').contains(e.target)) {
                        popup.remove();
                        document.removeEventListener('click', closeOnClickOutside);
                    }
                };
                document.addEventListener('click', closeOnClickOutside);
            }, 100);
        }

        // 連続ボーナスの計算
        function calculateStreakMultiplier(streakDays) {
            if (streakDays >= 21) return 2.0;
            if (streakDays >= 14) return 1.7;
            if (streakDays >= 7) return 1.5;
            if (streakDays >= 3) return 1.2;
            return 1.0;
        }

        // 現在の連続日数を計算
        function calculateCurrentStreak(hypothesis) {
            if (!hypothesis.achievements) return 0;
            
            const today = new Date();
            let streak = 0;
            let checkDate = new Date(today);
            
            // 今日から遡って連続達成をカウント
            while (true) {
                const dateKey = dateKeyLocal(checkDate);
                if (hypothesis.achievements[dateKey]) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else {
                    break;
                }
            }
            
            return streak;
        }

        // 開始日の設定関数
        function setStartDate(type) {
            const todayBtn = document.getElementById('start-today-btn');
            const laterBtn = document.getElementById('start-later-btn');
            const dateInput = document.getElementById('habit-start-date');
            const dateDisplay = document.getElementById('start-date-display');
            const selectedDateSpan = document.getElementById('selected-start-date');
            
            if (!todayBtn || !laterBtn || !dateInput || !dateDisplay || !selectedDateSpan) {
                // 新規作成画面の要素がまだ存在しない場合はリターン
                return;
            }
            
            if (type === 'today') {
                // 今日から開始
                const today = new Date();
                const dateStr = today.toISOString().split('T')[0];
                
                // ボタンのスタイルを更新
                todayBtn.style.background = 'var(--primary)';
                todayBtn.style.color = 'white';
                laterBtn.style.background = 'var(--surface-light)';
                laterBtn.style.color = 'var(--text-primary)';
                
                // 日付入力を非表示
                dateInput.style.display = 'none';
                dateInput.value = dateStr;
                
                // 開始日表示を更新
                dateDisplay.style.display = 'block';
                selectedDateSpan.textContent = formatDateJapanese(today);
                
                // グローバル変数に保存
                window.selectedStartDate = dateStr;
            }
        }
        
        function showDatePicker() {
            const todayBtn = document.getElementById('start-today-btn');
            const laterBtn = document.getElementById('start-later-btn');
            const dateInput = document.getElementById('habit-start-date');
            const dateDisplay = document.getElementById('start-date-display');
            
            if (!todayBtn || !laterBtn || !dateInput || !dateDisplay) {
                return;
            }
            
            // ボタンのスタイルを更新
            laterBtn.style.background = 'var(--primary)';
            laterBtn.style.color = 'white';
            todayBtn.style.background = 'var(--surface-light)';
            todayBtn.style.color = 'var(--text-primary)';
            
            // 日付入力を表示
            dateInput.style.display = 'block';
            
            // 最小値を今日に設定
            const today = new Date();
            const minDate = today.toISOString().split('T')[0];
            dateInput.min = minDate;
            
            // 最大値を30日後に設定
            const maxDate = new Date();
            maxDate.setDate(maxDate.getDate() + 30);
            dateInput.max = maxDate.toISOString().split('T')[0];
            
            // デフォルト値を明日に設定
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            dateInput.value = tomorrow.toISOString().split('T')[0];
            
            // 開始日表示を更新
            updateStartDateDisplay();
        }
        
        function updateStartDateDisplay() {
            const dateInput = document.getElementById('habit-start-date');
            const dateDisplay = document.getElementById('start-date-display');
            const selectedDateSpan = document.getElementById('selected-start-date');
            
            if (dateInput && dateInput.value && dateDisplay && selectedDateSpan) {
                const selectedDate = new Date(dateInput.value);
                dateDisplay.style.display = 'block';
                selectedDateSpan.textContent = formatDateJapanese(selectedDate);
                
                // グローバル変数に保存
                window.selectedStartDate = dateInput.value;
            }
        }
        
        function formatDateJapanese(date) {
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
            const weekday = weekdays[date.getDay()];
            
            return `${year}年${month}月${day}日(${weekday})`;
        }
        
        // コンボボーナスのチェックと付与
        function checkAndAwardComboBonus(dateKey) {
            const data = loadData();
            let achievedToday = 0;
            let totalHabits = 0;
            
            // 今日達成した習慣数をカウント
            data.currentHypotheses.forEach(h => {
                if (h.achievements && h.achievements[dateKey]) {
                    achievedToday++;
                }
                totalHabits++;
            });
            
            // コンボボーナス付与（優先度4）
            if (achievedToday === 2) {
                const added = earnPoints(1, 'combo', '2習慣同時達成ボーナス', 1.0, null, null, { dateKey });
                const d0 = loadData();
                if (!d0.meta) d0.meta = {};
                if (!d0.meta.comboAwards) d0.meta.comboAwards = {};
                d0.meta.comboAwards[dateKey] = (d0.meta.comboAwards[dateKey] || 0) + added;
                saveData(d0);
                showNotification('🎉 2習慣同時達成ボーナス!\n+1pt', 'success', 4);
            } else if (achievedToday === 3) {
                const added = earnPoints(3, 'combo', '3習慣同時達成ボーナス', 1.0, null, null, { dateKey });
                const d0 = loadData();
                if (!d0.meta) d0.meta = {};
                if (!d0.meta.comboAwards) d0.meta.comboAwards = {};
                d0.meta.comboAwards[dateKey] = (d0.meta.comboAwards[dateKey] || 0) + added;
                saveData(d0);
                showNotification('🔥 3習慣同時達成ボーナス!\n+3pt', 'success', 4);
            } else if (totalHabits >= 4 && achievedToday === totalHabits) {
                const added = earnPoints(5, 'combo', '全習慣達成ボーナス', 1.0, null, null, { dateKey });
                const d0 = loadData();
                if (!d0.meta) d0.meta = {};
                if (!d0.meta.comboAwards) d0.meta.comboAwards = {};
                d0.meta.comboAwards[dateKey] = (d0.meta.comboAwards[dateKey] || 0) + added;
                saveData(d0);
                showNotification('🏆 全習慣達成！素晴らしい！\n+5pt', 'success', 4);
            }

            // イベント：パーフェクトデー（全習慣達成で追加ポイント）
            try {
                const ev = loadData().events || {};
                const boosts = Array.isArray(ev.activeBoosts) ? ev.activeBoosts : [];
                const perfect = boosts.find(b => b && b.effect && b.effect.type === 'perfect_bonus');
                if (perfect && totalHabits > 0 && achievedToday === totalHabits) {
                    const d1 = loadData();
                    if (!d1.meta) d1.meta = {};
                    if (!d1.meta.eventAwards) d1.meta.eventAwards = {};
                    const already = d1.meta.eventAwards[dateKey] || 0;
                    if (already === 0) {
                        const val = (perfect.effect && typeof perfect.effect.value === 'number') ? perfect.effect.value : 30;
                        const gained = earnPoints(val, 'event', 'パーフェクトデーボーナス', 1.0, null, null, { dateKey, eventId: perfect.id });
                        const d2 = loadData();
                        if (!d2.meta) d2.meta = {};
                        if (!d2.meta.eventAwards) d2.meta.eventAwards = {};
                        d2.meta.eventAwards[dateKey] = (d2.meta.eventAwards[dateKey] || 0) + gained;
                        saveData(d2);
                        showNotification(`✨ パーフェクトデー達成！\n+${gained}pt`, 'success', 5);
                    }
                }
            } catch (_) { /* noop */ }
        }
        
        // ポイント統計を更新（統計画面用）
        function updatePointStatistics() {
            const data = loadData();
            const ps = data.pointSystem;
            
            // 現在のポイント
            const currentPointsEl = document.getElementById('current-points-stat');
            if (currentPointsEl) {
                currentPointsEl.textContent = ps.currentPoints.toLocaleString();
            }
            
            // 累計獲得
            const lifetimeEarnedEl = document.getElementById('lifetime-earned-stat');
            if (lifetimeEarnedEl) {
                lifetimeEarnedEl.textContent = ps.lifetimeEarned.toLocaleString();
            }
            
            // 累計消費
            const lifetimeSpentEl = document.getElementById('lifetime-spent-stat');
            if (lifetimeSpentEl) {
                lifetimeSpentEl.textContent = ps.lifetimeSpent.toLocaleString();
            }
            
            // 現在のレベル
            const levelInfo = calculateLevel(ps.lifetimeEarned);
            const currentLevelEl = document.getElementById('current-level-stat');
            if (currentLevelEl) {
                currentLevelEl.textContent = `Lv.${levelInfo.level}`;
                currentLevelEl.title = levelInfo.name; // ツールチップでレベル名表示
            }
            
            // レベル進捗バー
            const progressInLevel = ps.lifetimeEarned - levelInfo.min;
            const levelRange = levelInfo.max - levelInfo.min;
            const progressPercent = Math.min(100, (progressInLevel / levelRange) * 100);
            
            const levelProgressLabel = document.getElementById('level-progress-label');
            if (levelProgressLabel) {
                levelProgressLabel.textContent = levelInfo.capped
                    ? '最大レベルに到達'
                    : `Lv.${levelInfo.level + 1} ${getLevelTitle(levelInfo.level + 1)} まで`;
            }
            
            const levelProgressText = document.getElementById('level-progress-text');
            if (levelProgressText) {
                const remaining = levelInfo.max - ps.lifetimeEarned + 1;
                levelProgressText.textContent = `あと${remaining}pt`;
            }
            
            const levelProgressBar = document.getElementById('level-progress-bar');
            if (levelProgressBar) {
                levelProgressBar.style.width = `${progressPercent}%`;
            }
            
            // ポイント推移グラフ（30日間）
            const pointTrendEl = document.getElementById('point-trend-graph');
            if (pointTrendEl && ps.transactions.length > 0) {
                const last30Days = generatePointTrendData(ps.transactions, 30);
                pointTrendEl.innerHTML = `
                    <h4 style="font-size: 14px; margin-bottom: 12px;">📈 ポイント推移（30日間）</h4>
                    <div style="position: relative; height: 120px; border-left: 2px solid var(--border); border-bottom: 2px solid var(--border);">
                        ${generatePointTrendGraph(last30Days)}
                    </div>
                `;
            }
            
            // ソース別獲得統計（削除済み）
            // この機能は不要なため削除しました
            
            // 時間帯別獲得パターン
            const timePatternEl = document.getElementById('point-time-pattern');
            if (timePatternEl && ps.transactions.length > 0) {
                const timePattern = analyzeTimePattern(ps.transactions);
                timePatternEl.innerHTML = `
                    <h4 style="font-size: 14px; margin-bottom: 12px;">⏰ 時間帯別獲得パターン</h4>
                    <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;">
                        ${generateTimePatternHTML(timePattern)}
                    </div>
                `;
            }
            
            // ブースト効果分析
            const boostAnalysisEl = document.getElementById('boost-effect-analysis');
            if (boostAnalysisEl && ps.transactions.length > 0) {
                const boostStats = analyzeBoostEffects(ps.transactions);
                boostAnalysisEl.innerHTML = `
                    <h4 style="font-size: 14px; margin-bottom: 12px;">🚀 ブースト効果分析</h4>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                        ${generateBoostStatsHTML(boostStats)}
                    </div>
                `;
            }
            
            // 最近のトランザクション
            const recentTransEl = document.getElementById('recent-transactions');
            if (recentTransEl) {
                const recentTrans = ps.transactions.slice(0, 10); // 最新10件
                
                if (recentTrans.length === 0) {
                    recentTransEl.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 8px;">まだ取引履歴がありません</div>';
                } else {
                    recentTransEl.innerHTML = recentTrans.map(t => {
                        const date = new Date(t.timestamp);
                        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                        const icon = t.type === 'earn' ? '➕' : '➖';
                        const color = t.type === 'earn' ? '#10b981' : '#ef4444';
                        const amount = t.type === 'earn' ? 
                            (t.finalAmount || t.amount) : 
                            t.amount;
                        
                        return `
                            <div style="display: flex; justify-content: space-between; padding: 4px 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                    ${icon} ${escapeHTML(t.description)}
                                </span>
                                <span style="color: ${color}; font-weight: bold; margin-left: 8px;">
                                    ${t.type === 'earn' ? '+' : '-'}${amount}pt
                                </span>
                            </div>
                        `;
                    }).join('');
                }
            }
        }
        
        // ポイント推移データを生成
        function generatePointTrendData(transactions, days) {
            const today = new Date();
            const dailyPoints = {};
            let cumulativePoints = 0;
            
            // 日付別にトランザクションを集計
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateKey = dateKeyLocal(date);
                dailyPoints[dateKey] = { earned: 0, spent: 0, cumulative: 0 };
            }
            
            // トランザクションを日付順にソート（古い順）
            const sortedTrans = [...transactions].reverse();
            
            sortedTrans.forEach(t => {
                const date = new Date(t.timestamp);
                const dateKey = dateKeyLocal(date);
                
                if (dailyPoints[dateKey]) {
                    if (t.type === 'earn') {
                        dailyPoints[dateKey].earned += t.finalAmount || t.amount;
                        cumulativePoints += t.finalAmount || t.amount;
                    } else {
                        dailyPoints[dateKey].spent += t.amount;
                        cumulativePoints -= t.amount;
                    }
                    dailyPoints[dateKey].cumulative = cumulativePoints;
                }
            });
            
            return dailyPoints;
        }
        
        // ポイント推移グラフを生成
        function generatePointTrendGraph(dailyPoints) {
            const dates = Object.keys(dailyPoints);
            const maxPoints = Math.max(...dates.map(d => dailyPoints[d].cumulative), 1);
            
            const points = dates.map((date, i) => {
                const x = (i / (dates.length - 1)) * 100;
                const y = 100 - (dailyPoints[date].cumulative / maxPoints) * 100;
                return `${x},${y}`;
            }).join(' ');
            
            return `
                <svg style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline
                        points="${points}"
                        fill="none"
                        stroke="#fbbf24"
                        stroke-width="2"
                        opacity="0.8"
                    />
                </svg>
                <div style="position: absolute; left: -30px; top: 0; font-size: 10px; color: var(--text-secondary);">${maxPoints}</div>
                <div style="position: absolute; left: -20px; bottom: 0; font-size: 10px; color: var(--text-secondary);">0</div>
            `;
        }
        
        // ソース別ポイント分析
        function analyzePointSources(transactions) {
            const sources = {};
            
            transactions.forEach(t => {
                if (t.type === 'earn') {
                    const source = t.source || 'その他';
                    if (!sources[source]) {
                        sources[source] = { count: 0, total: 0, average: 0 };
                    }
                    sources[source].count++;
                    sources[source].total += t.finalAmount || t.amount;
                }
            });
            
            // 平均を計算
            Object.keys(sources).forEach(key => {
                sources[key].average = Math.round(sources[key].total / sources[key].count * 10) / 10;
            });
            
            return sources;
        }
        
        // ソース統計HTMLを生成
        function generateSourceStatsHTML(sourceStats) {
            const sourceNames = {
                'habit': '🎯 習慣達成',
                'journal': '📝 ジャーナル',
                'challenge': '🏆 チャレンジ',
                'effort': '💪 努力ボーナス',
                'streak': '🔥 ストリーク',
                'その他': '✨ その他'
            };
            
            return Object.entries(sourceStats)
                .sort((a, b) => b[1].total - a[1].total)
                .map(([source, stats]) => `
                    <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                        <span>${sourceNames[source] || source}</span>
                        <div style="text-align: right;">
                            <span style="color: #fbbf24; font-weight: bold;">${stats.total}pt</span>
                            <span style="color: var(--text-secondary); font-size: 10px; margin-left: 8px;">
                                (${stats.count}回, 平均${stats.average}pt)
                            </span>
                        </div>
                    </div>
                `).join('');
        }
        
        // 時間帯別パターン分析
        function analyzeTimePattern(transactions) {
            const timeSlots = {
                '早朝': { hours: [4, 5, 6, 7], count: 0, total: 0 },
                '朝': { hours: [8, 9, 10, 11], count: 0, total: 0 },
                '昼': { hours: [12, 13, 14, 15], count: 0, total: 0 },
                '夕方': { hours: [16, 17, 18, 19], count: 0, total: 0 },
                '夜': { hours: [20, 21, 22, 23], count: 0, total: 0 },
                '深夜': { hours: [0, 1, 2, 3], count: 0, total: 0 }
            };
            
            transactions.forEach(t => {
                if (t.type === 'earn') {
                    const hour = new Date(t.timestamp).getHours();
                    Object.entries(timeSlots).forEach(([name, slot]) => {
                        if (slot.hours.includes(hour)) {
                            slot.count++;
                            slot.total += t.finalAmount || t.amount;
                        }
                    });
                }
            });
            
            return timeSlots;
        }
        
        // 時間帯パターンHTMLを生成
        function generateTimePatternHTML(timePattern) {
            const maxTotal = Math.max(...Object.values(timePattern).map(s => s.total), 1);
            
            return Object.entries(timePattern).map(([name, stats]) => {
                const heightPercent = (stats.total / maxTotal) * 100;
                return `
                    <div style="text-align: center;">
                        <div style="position: relative; height: 60px; display: flex; align-items: flex-end;">
                            <div style="
                                width: 100%;
                                height: ${heightPercent}%;
                                background: linear-gradient(to top, #fbbf24, #f59e0b);
                                border-radius: 4px 4px 0 0;
                                opacity: ${stats.total > 0 ? 1 : 0.3};
                            "></div>
                        </div>
                        <div style="font-size: 10px; margin-top: 4px;">${name}</div>
                        <div style="font-size: 9px; color: var(--text-secondary);">${stats.total}pt</div>
                    </div>
                `;
            }).join('');
        }
        
        // ブースト効果分析
        function analyzeBoostEffects(transactions) {
            const boostStats = {
                totalBoosted: 0,
                totalNormal: 0,
                countBoosted: 0,
                countNormal: 0,
                maxMultiplier: 1,
                averageMultiplier: 1
            };
            
            let multiplierSum = 0;
            let multiplierCount = 0;
            
            transactions.forEach(t => {
                if (t.type === 'earn') {
                    const multiplier = t.multiplier || 1;
                    if (multiplier > 1) {
                        boostStats.countBoosted++;
                        boostStats.totalBoosted += t.finalAmount || t.amount;
                        boostStats.maxMultiplier = Math.max(boostStats.maxMultiplier, multiplier);
                    } else {
                        boostStats.countNormal++;
                        boostStats.totalNormal += t.amount;
                    }
                    multiplierSum += multiplier;
                    multiplierCount++;
                }
            });
            
            if (multiplierCount > 0) {
                boostStats.averageMultiplier = Math.round(multiplierSum / multiplierCount * 10) / 10;
            }
            
            return boostStats;
        }
        
        // ブースト統計HTMLを生成
        function generateBoostStatsHTML(boostStats) {
            const boostPercentage = boostStats.countBoosted + boostStats.countNormal > 0
                ? Math.round(boostStats.countBoosted / (boostStats.countBoosted + boostStats.countNormal) * 100)
                : 0;
            
            return `
                <div style="text-align: center; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${boostStats.totalBoosted}pt</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">ブースト獲得</div>
                    <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px;">${boostPercentage}%がブースト</div>
                </div>
                <div style="text-align: center; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
                    <div style="font-size: 20px; font-weight: bold; color: #10b981;">×${boostStats.averageMultiplier}</div>
                    <div style="font-size: 11px; color: var(--text-secondary);">平均倍率</div>
                    <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px;">最大 ×${boostStats.maxMultiplier}</div>
                </div>
            `;
        }

        // ポイント画面を表示
        function showPointsView() { try { showHomeView(); } catch(_) {} }
        
        // ポイント画面の更新
        function updatePointsView() {
            const data = loadData();
            const ps = data.pointSystem;
            
            // 現在のポイント
            const pointsCurrent = document.getElementById('points-current');
            if (pointsCurrent) {
                pointsCurrent.textContent = ps.currentPoints.toLocaleString();
            }
            
            // 累計ポイント
            const pointsLifetime = document.getElementById('points-lifetime');
            if (pointsLifetime) {
                pointsLifetime.textContent = ps.lifetimeEarned.toLocaleString();
            }
            
            // レベル
            const levelInfo = calculateLevel(ps.lifetimeEarned);
            const pointsLevel = document.getElementById('points-level');
            const pointsLevelName = document.getElementById('points-level-name');
            if (pointsLevel) {
                pointsLevel.textContent = `Lv.${levelInfo.level}`;
            }
            if (pointsLevelName) {
                pointsLevelName.textContent = levelInfo.name;
            }

            // 前借りセクションの更新
            updateLoanSection();

            // 報酬サマリ（回数・ポイント）
            try {
                const tx = (ps.transactions || []).filter(t => t.type === 'spend' && t.source === 'reward');
                const count = tx.length;
                const spent = tx.reduce((sum, t) => sum + (t.amount || 0), 0);
                const usedEl = document.getElementById('reward-used-count');
                const spentEl = document.getElementById('reward-spent-total');
                if (usedEl) usedEl.textContent = count.toLocaleString();
                if (spentEl) spentEl.textContent = `${spent.toLocaleString()}pt`;
                // 詳細統計側にも反映（存在すれば）
                const usedElStats = document.getElementById('reward-used-count-stats');
                const spentElStats = document.getElementById('reward-spent-total-stats');
                if (usedElStats) usedElStats.textContent = count.toLocaleString();
                if (spentElStats) spentElStats.textContent = `${spent.toLocaleString()}pt`;
            } catch (e) { /* noop */ }

            // ヘッダーのポイント表示も同期
            try { updatePointDisplay(); } catch (e) {}
        }

        function dateKeyToday() { return dateKeyLocal(new Date()); }

        function calcLoanOwed(loan) {
            if (!loan) return 0;
            const start = new Date(loan.borrowedAt);
            const today = new Date();
            start.setHours(0,0,0,0); today.setHours(0,0,0,0);
            const days = Math.max(0, Math.floor((today - start) / (1000*60*60*24)));
            const owed = Math.ceil(loan.principal * Math.pow(1.1, days));
            return { owed, days };
        }

        function updateLoanSection() {
            const el = document.getElementById('loan-section');
            if (el) el.style.display = 'none';
        }

        function openBorrowDialog() { /* 廃止 */ }
        window.openBorrowDialog = openBorrowDialog;

        function repayLoan() { /* 廃止 */ }
        window.repayLoan = repayLoan;
        
        // 報酬タブを表示
        function showRewardsTab() {
            document.getElementById('rewards-tab-content').style.display = 'block';
            document.getElementById('history-tab-content').style.display = 'none';
            document.getElementById('create-tab-content').style.display = 'none';
            
            // タブボタンのスタイル更新
            document.getElementById('rewards-tab').style.background = 'var(--primary)';
            document.getElementById('rewards-tab').style.color = 'white';
            document.getElementById('history-tab').style.background = '';
            document.getElementById('history-tab').style.color = '';
            document.getElementById('create-tab').style.background = '';
            document.getElementById('create-tab').style.color = '';
            
            updateRewardsList();
        }
        
        // 履歴タブを表示
        function showHistoryTab() {
            document.getElementById('rewards-tab-content').style.display = 'none';
            document.getElementById('history-tab-content').style.display = 'block';
            document.getElementById('create-tab-content').style.display = 'none';
            
            // タブボタンのスタイル更新
            document.getElementById('rewards-tab').style.background = '';
            document.getElementById('rewards-tab').style.color = '';
            document.getElementById('history-tab').style.background = 'var(--primary)';
            document.getElementById('history-tab').style.color = 'white';
            document.getElementById('create-tab').style.background = '';
            document.getElementById('create-tab').style.color = '';
            
            updatePointsHistory();
        }
        
        // 作成タブを表示
        function showCreateTab() {
            document.getElementById('rewards-tab-content').style.display = 'none';
            document.getElementById('history-tab-content').style.display = 'none';
            document.getElementById('create-tab-content').style.display = 'block';
            
            // タブボタンのスタイル更新
            document.getElementById('rewards-tab').style.background = '';
            document.getElementById('rewards-tab').style.color = '';
            document.getElementById('history-tab').style.background = '';
            document.getElementById('history-tab').style.color = '';
            document.getElementById('create-tab').style.background = 'var(--primary)';
            document.getElementById('create-tab').style.color = 'white';
        }
        
        // 報酬リストを更新
        function updateRewardsList() {
            const data = loadData();
            const rewardsList = document.getElementById('rewards-list');
            if (!rewardsList) return;
            
            // 統計を更新
            updateRewardsStatistics();
            
            if (!data.pointSystem.customRewards || data.pointSystem.customRewards.length === 0) {
                rewardsList.innerHTML = `
                    <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
                        報酬がまだありません<br>
                        「➕ 作成」タブから報酬を追加してください
                    </div>
                `;
                return;
            }
            
            // 報酬カードを生成
            rewardsList.innerHTML = data.pointSystem.customRewards
                .filter(r => !r.isArchived)
                .sort((a, b) => {
                    if (a.isFavorite && !b.isFavorite) return -1;
                    if (!a.isFavorite && b.isFavorite) return 1;
                    return a.cost - b.cost;
                })
                .map(reward => {
                    const canAfford = data.pointSystem.currentPoints >= reward.cost;
                    return `
                        <div style="
                            background: ${canAfford ? 'var(--surface)' : 'rgba(51, 65, 85, 0.3)'};
                            padding: 16px;
                            border-radius: 12px;
                            border: 1px solid ${canAfford ? 'var(--border)' : 'rgba(255,255,255,0.05)'};
                            display: flex;
                            justify-content: space-between;
                            align-items: center;
                            opacity: ${canAfford ? '1' : '0.6'};
                        ">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <span style="font-size: 24px;">${reward.emoji || '🎁'}</span>
                                <div>
                                    <div style="font-weight: bold; font-size: 16px; margin-bottom: 4px;">${escapeHTML(reward.name)}</div>
                                    <div style="font-size: 13px; color: var(--text-secondary);">
                                        ${escapeHTML(reward.category)} ${reward.memo ? '• ' + escapeHTML(reward.memo) : ''}
                                    </div>
                                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">
                                        使用回数: ${reward.timesUsed || 0}回
                                    </div>
                                </div>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <div style="display: flex; flex-direction: column; align-items: flex-end;">
                                    <div style="font-size: 18px; font-weight: bold; color: ${canAfford ? '#fbbf24' : 'var(--text-secondary)'};">
                                        ${reward.cost}pt
                                    </div>
                                    ${canAfford ? `
                                        <button class="btn btn-secondary" onclick="useReward('${reward.id}')" style="padding: 8px 16px; font-size: 14px;">
                                            使用
                                        </button>
                                    ` : `
                                        <span style="font-size: 10px; color: var(--text-secondary);">不足</span>
                                    `}
                                </div>
                                <button onclick="showRewardMenu(event, '${reward.id}')" style="
                                    background: var(--surface-light);
                                    border: 1px solid var(--border);
                                    border-radius: 8px;
                                    color: var(--text);
                                    cursor: pointer;
                                    padding: 12px;
                                    font-size: 20px;
                                    width: 44px;
                                    height: 44px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    transition: all 0.2s;
                                    flex-shrink: 0;
                                " onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='var(--surface-light)'">
                                    ⋮
                                </button>
                            </div>
                        </div>
                    `;
                }).join('');
        }
        
        // 履歴を更新
        function updatePointsHistory() {
            const data = loadData();
            const historyEl = document.getElementById('points-history');
            if (!historyEl) return;
            
            if (!data.pointSystem.transactions || data.pointSystem.transactions.length === 0) {
                historyEl.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 40px;">取引履歴がありません</div>';
                return;
            }
            
            historyEl.innerHTML = data.pointSystem.transactions.map(t => {
                const date = new Date(t.timestamp);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                const icon = t.type === 'earn' ? '➕' : '➖';
                const color = t.type === 'earn' ? '#10b981' : '#ef4444';
                const amount = t.type === 'earn' ? (t.finalAmount || t.amount) : t.amount;
                
                return `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        padding: 12px;
                        background: var(--surface);
                        border-radius: 8px;
                        border: 1px solid var(--border);
                    ">
                        <div>
                            <div style="font-weight: bold;">${icon} ${escapeHTML(t.description)}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${dateStr}</div>
                        </div>
                        <div style="font-size: 20px; font-weight: bold; color: ${color};">
                            ${t.type === 'earn' ? '+' : '-'}${amount}pt
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // 報酬を作成
        function createReward(event) {
            event.preventDefault();
            
            const name = document.getElementById('reward-name').value;
            const cost = parseInt(document.getElementById('reward-cost').value);
            const emoji = document.getElementById('reward-emoji').value || '🎁';
            const category = document.getElementById('reward-category').value;
            const memo = document.getElementById('reward-memo').value;
            
            const data = loadData();
            
            // 新しい報酬を追加
            const newReward = {
                id: 'reward_' + Date.now(),
                name: name,
                cost: cost,
                emoji: emoji,
                category: category,
                memo: memo,
                timesUsed: 0,
                isFavorite: false,
                isArchived: false,
                createdAt: new Date().toISOString()
            };
            
            if (!data.pointSystem.customRewards) {
                data.pointSystem.customRewards = [];
            }
            data.pointSystem.customRewards.push(newReward);
            
            saveData(data);
            
            // フォームをリセット
            document.getElementById('reward-name').value = '';
            document.getElementById('reward-cost').value = '';
            document.getElementById('reward-emoji').value = '';
            document.getElementById('reward-memo').value = '';
            
            // 報酬タブに切り替え
            showRewardsTab();
            
            showNotification('✨ 報酬を作成しました！', 'success');
        }
        
        // 報酬統計を更新
        function updateRewardsStatistics() {
            const data = loadData();
            const rewards = data.pointSystem.customRewards || [];
            
            // 基本統計
            const totalCount = rewards.filter(r => !r.isArchived).length;
            const countEl = document.getElementById('total-rewards-count');
            if (countEl) countEl.textContent = totalCount;
            
            const totalUsed = rewards.reduce((sum, r) => sum + (r.timesUsed || 0), 0);
            const usedEl = document.getElementById('total-rewards-used');
            if (usedEl) usedEl.textContent = totalUsed;
            
            const totalSpent = rewards.reduce((sum, r) => sum + (r.cost * (r.timesUsed || 0)), 0);
            const spentEl = document.getElementById('total-rewards-spent');
            if (spentEl) spentEl.textContent = totalSpent + 'pt';
            
            // 詳細統計を更新
            updateDetailedRewardStatistics();
        }
        
        // 詳細統計パネルの表示切り替え
        window.toggleRewardStatistics = function() {
            const panel = document.getElementById('reward-statistics-panel');
            const btn = document.getElementById('toggle-reward-stats-btn');
            
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                btn.textContent = '📊 統計を隠す';
                updateDetailedRewardStatistics();
            } else {
                panel.style.display = 'none';
                btn.textContent = '📊 詳細統計を見る';
            }
        }
        
        // 統計セクションのトグル関数（クラス制御に統一）
        window.toggleStatSection = function(sectionId) {
            const content = document.getElementById(sectionId);
            const arrow = document.getElementById(sectionId + '-arrow');
            if (!content) return;

            const isHidden = content.classList.contains('is-hidden') || window.getComputedStyle(content).display === 'none';

            if (isHidden) {
                content.classList.remove('is-hidden');
                // 表示レイアウトを適用
                if (sectionId === 'badge-collection' || sectionId === 'popular-rewards' || sectionId === 'top-spent-rewards' || sectionId === 'category-statistics' || sectionId === 'reward-time-pattern' || sectionId === 'recent-used-rewards') {
                    content.style.display = 'grid';
                } else {
                    content.style.display = 'block';
                }
                if (arrow) arrow.textContent = '▼';

                // セクション表示時に最新データで更新（特にモバイルでの遅延描画対策）
                try { updateDetailedRewardStatistics(); } catch (e) {}
            } else {
                // 非表示クラスを付与（!importantで確実に隠す）
                content.classList.add('is-hidden');
                if (arrow) arrow.textContent = '▶';
            }
        }
        
        // すべての統計トグルを閉じる
        function closeAllStatToggles() {
            const toggleSections = [
                'achievement-level-distribution',
                'journal-stats-content',
                'point-stats-content',
                'badge-collection',
                'challenge-stats-content',
                'habit-report',
                'ranking-content'
            ];
            
            toggleSections.forEach(sectionId => {
                const content = document.getElementById(sectionId);
                const arrow = document.getElementById(sectionId + '-arrow');
                if (content) {
                    content.classList.add('is-hidden');
                }
                if (arrow) {
                    arrow.textContent = '▶';
                }
            });
        }
        
        // ホーム画面のトグルを閉じる
        function closeHomeToggles() {
            // ホームの統計系トグル（バッジ含む）をいったん全て閉じる
            if (typeof closeAllStatToggles === 'function') {
                closeAllStatToggles();
            }
            // ジャーナル履歴の各エントリを閉じる
            const journalEntries = document.querySelectorAll('.journal-entry');
            journalEntries.forEach(entry => {
                const content = entry.querySelector('.journal-content');
                const arrow = entry.querySelector('.journal-arrow');
                if (content) {
                    content.style.display = 'none';
                }
                if (arrow) {
                    arrow.style.transform = 'rotate(0deg)';
                }
            });

            // カテゴリセクション（id="content-..."）を全て閉じる＋トグル矢印をリセット
            const categoryContents = document.querySelectorAll('[id^="content-"]');
            categoryContents.forEach(el => {
                el.style.maxHeight = '0';
            });
            const categoryToggles = document.querySelectorAll('[id^="toggle-"]');
            categoryToggles.forEach(tg => {
                tg.textContent = '▶';
            });

            // LocalStorageのカテゴリトグル状態も全てfalseにリセット
            try {
                const states = JSON.parse(localStorage.getItem('categoryToggleStates') || '{}');
                const keys = Object.keys(states);
                if (keys.length > 0) {
                    keys.forEach(k => { states[k] = false; });
                    localStorage.setItem('categoryToggleStates', JSON.stringify(states));
                }
            } catch (e) {
                // noop
            }
        }
        
        // 詳細な報酬統計を更新
        function updateDetailedRewardStatistics() {
            const data = loadData();
            const rewards = data.pointSystem.customRewards || [];
            const transactions = data.pointSystem.transactions || [];
            
            // 人気報酬ランキング
            updatePopularRewards(rewards);
            // 消費ポイントTOP5
            updateTopSpentRewards(rewards);
            
            // カテゴリー別統計
            updateCategoryStatistics(rewards);
            
            // 時間帯別使用パターン
            updateRewardTimePattern(transactions.filter(t => t.type === 'spend'));
            
            // コスト分析
            updateCostAnalysis(rewards);
            
            // 最近使用した報酬
            updateRecentUsedRewards(transactions.filter(t => t.type === 'spend'));
        }

        // 人気報酬ランキングを更新
        function updatePopularRewards(rewards) {
            const el = document.getElementById('popular-rewards');
            if (!el) return;
            
            const sortedRewards = rewards
                .filter(r => !r.isArchived && r.timesUsed > 0)
                .sort((a, b) => (b.timesUsed || 0) - (a.timesUsed || 0))
                .slice(0, 5);
            
            if (sortedRewards.length === 0) {
                el.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">まだ使用された報酬がありません</div>';
                return;
            }
            
            el.innerHTML = sortedRewards.map((reward, index) => {
                const rank = index + 1;
                const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
                const usageRate = rewards.filter(r => !r.isArchived).length > 0 ? 
                    Math.round((reward.timesUsed || 0) / rewards.reduce((sum, r) => sum + (r.timesUsed || 0), 0) * 100) : 0;
                
                return `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px;
                        background: ${rank === 1 ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1))' : 'rgba(0,0,0,0.2)'};
                        border-radius: 8px;
                        ${rank === 1 ? 'border: 1px solid rgba(251, 191, 36, 0.3);' : ''}
                    ">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 20px;">${rankEmoji}</span>
                            <div>
                                <div style="font-weight: bold;">${reward.emoji} ${escapeHTML(reward.name)}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">
                                    ${reward.cost}pt • ${reward.timesUsed}回使用 (${usageRate}%)
                                </div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 18px; font-weight: bold; color: #ef4444;">
                                ${reward.cost * (reward.timesUsed || 0)}pt
                            </div>
                            <div style="font-size: 10px; color: var(--text-secondary);">総消費</div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 消費ポイントTOP5を更新（総消費額でソート）
        function updateTopSpentRewards(rewards) {
            const el = document.getElementById('top-spent-rewards');
            if (!el) return;
            const candidates = rewards
                .filter(r => !r.isArchived && (r.timesUsed || 0) > 0)
                .map(r => ({
                    id: r.id,
                    name: r.name,
                    emoji: r.emoji || '🎁',
                    cost: r.cost || 0,
                    timesUsed: r.timesUsed || 0,
                    totalSpent: (r.timesUsed || 0) * (r.cost || 0)
                }))
                .sort((a, b) => b.totalSpent - a.totalSpent)
                .slice(0, 5);
            if (candidates.length === 0) {
                el.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">まだ使用された報酬がありません</div>';
                return;
            }
            el.innerHTML = candidates.map((r, idx) => {
                const rank = idx + 1;
                const rankEmoji = rank === 1 ? '💎' : rank === 2 ? '💠' : rank === 3 ? '🔶' : `${rank}.`;
                return `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 12px;
                        background: ${rank === 1 ? 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(16,185,129,0.08))' : 'rgba(0,0,0,0.2)'};
                        border-radius: 8px;
                        ${rank === 1 ? 'border: 1px solid rgba(16,185,129,0.3);' : ''}
                    ">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span style="font-size: 20px;">${rankEmoji}</span>
                            <div>
                                <div style="font-weight: bold;">${r.emoji} ${escapeHTML(r.name)}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${r.cost}pt • ${r.timesUsed}回使用</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 18px; font-weight: bold; color: #ef4444;">${r.totalSpent}pt</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">総消費</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        // カテゴリー別統計を更新
        function updateCategoryStatistics(rewards) {
            const el = document.getElementById('category-statistics');
            if (!el) return;
            
            const categories = {};
            rewards.filter(r => !r.isArchived).forEach(reward => {
                const category = reward.category || 'その他';
                if (!categories[category]) {
                    categories[category] = {
                        count: 0,
                        timesUsed: 0,
                        totalSpent: 0,
                        avgCost: 0
                    };
                }
                categories[category].count++;
                categories[category].timesUsed += reward.timesUsed || 0;
                categories[category].totalSpent += (reward.timesUsed || 0) * reward.cost;
                categories[category].avgCost += reward.cost;
            });
            
            // 平均コストを計算
            Object.keys(categories).forEach(cat => {
                if (categories[cat].count > 0) {
                    categories[cat].avgCost = Math.round(categories[cat].avgCost / categories[cat].count);
                }
            });
            
            const categoryEmojis = {
                '休憩': '🍵',
                '娯楽': '🎮',
                '食事': '🍰',
                '買い物': '🛍️',
                '体験': '🎭',
                '自由時間': '⏰',
                'その他': '📦'
            };
            
            const sortedCategories = Object.entries(categories)
                .sort((a, b) => b[1].timesUsed - a[1].timesUsed);
            
            if (sortedCategories.length === 0) {
                el.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">カテゴリーデータがありません</div>';
                return;
            }
            
            el.innerHTML = sortedCategories.map(([category, stats]) => `
                <div style="
                    padding: 12px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 8px;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold; font-size: 16px;">
                            ${categoryEmojis[category] || '📦'} ${category}
                        </span>
                        <span style="color: var(--text-secondary); font-size: 12px;">
                            ${stats.count}個
                        </span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
                        <div style="text-align: center;">
                            <div style="font-weight: bold; color: #fbbf24;">${stats.timesUsed}</div>
                            <div style="color: var(--text-secondary);">使用回数</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-weight: bold; color: #ef4444;">${stats.totalSpent}pt</div>
                            <div style="color: var(--text-secondary);">総消費</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-weight: bold; color: #10b981;">${stats.avgCost}pt</div>
                            <div style="color: var(--text-secondary);">平均コスト</div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // 時間帯別使用パターンを更新
        function updateRewardTimePattern(spendTransactions) {
            const el = document.getElementById('reward-time-pattern');
            if (!el) return;
            
            const timeSlots = {
                '早朝': { hours: [4, 5, 6, 7], count: 0, emoji: '🌅' },
                '朝': { hours: [8, 9, 10, 11], count: 0, emoji: '☀️' },
                '昼': { hours: [12, 13, 14, 15], count: 0, emoji: '🌞' },
                '夕方': { hours: [16, 17, 18, 19], count: 0, emoji: '🌆' },
                '夜': { hours: [20, 21, 22, 23], count: 0, emoji: '🌙' },
                '深夜': { hours: [0, 1, 2, 3], count: 0, emoji: '🌛' }
            };
            
            spendTransactions.forEach(t => {
                const hour = new Date(t.timestamp).getHours();
                Object.entries(timeSlots).forEach(([name, slot]) => {
                    if (slot.hours.includes(hour)) {
                        slot.count++;
                    }
                });
            });
            
            const maxCount = Math.max(...Object.values(timeSlots).map(s => s.count), 1);
            
            el.innerHTML = Object.entries(timeSlots).map(([name, stats]) => {
                const heightPercent = (stats.count / maxCount) * 100;
                const isActive = stats.count > 0;
                
                return `
                    <div style="text-align: center;">
                        <div style="font-size: 20px; margin-bottom: 4px;">${stats.emoji}</div>
                        <div style="
                            position: relative;
                            height: 60px;
                            display: flex;
                            align-items: flex-end;
                            margin-bottom: 4px;
                        ">
                            <div style="
                                width: 100%;
                                height: ${heightPercent}%;
                                background: ${isActive ? 'linear-gradient(to top, #8b5cf6, #ec4899)' : 'rgba(0,0,0,0.2)'};
                                border-radius: 4px 4px 0 0;
                                transition: all 0.3s;
                            "></div>
                        </div>
                        <div style="font-size: 10px; font-weight: bold;">${name}</div>
                        <div style="font-size: 9px; color: var(--text-secondary);">${stats.count}回</div>
                    </div>
                `;
            }).join('');
        }
        
        // コスト分析を更新
        function updateCostAnalysis(rewards) {
            const el = document.getElementById('cost-analysis');
            if (!el) return;
            
            const activeRewards = rewards.filter(r => !r.isArchived);
            if (activeRewards.length === 0) {
                el.innerHTML = '<div style="color: var(--text-secondary); text-align: center; grid-column: 1 / -1;">報酬データがありません</div>';
                return;
            }
            
            const costs = activeRewards.map(r => r.cost);
            const avgCost = Math.round(costs.reduce((a, b) => a + b, 0) / costs.length);
            const minCost = Math.min(...costs);
            const maxCost = Math.max(...costs);
            const medianCost = costs.sort((a, b) => a - b)[Math.floor(costs.length / 2)];
            
            // コスト効率（使用回数/コスト）
            const efficiency = activeRewards
                .filter(r => r.timesUsed > 0)
                .map(r => ({
                    name: r.name,
                    emoji: r.emoji,
                    efficiency: (r.timesUsed || 0) / r.cost,
                    cost: r.cost,
                    timesUsed: r.timesUsed
                }))
                .sort((a, b) => b.efficiency - a.efficiency)
                .slice(0, 3);
            
            el.innerHTML = `
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
                        <div style="text-align: center;">
                            <div style="font-size: 20px; font-weight: bold; color: #fbbf24;">${avgCost}pt</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">平均コスト</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 20px; font-weight: bold; color: #8b5cf6;">${medianCost}pt</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">中央値</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 20px; font-weight: bold; color: #10b981;">${minCost}pt</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">最小</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 20px; font-weight: bold; color: #ef4444;">${maxCost}pt</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">最大</div>
                        </div>
                    </div>
                </div>
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 8px;">
                    <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">💎 コスパ最強TOP3</div>
                    ${efficiency.length > 0 ? efficiency.map((r, i) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; ${i < efficiency.length - 1 ? 'border-bottom: 1px solid rgba(255,255,255,0.1);' : ''}">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>${r.emoji}</span>
                                <span style="font-size: 12px;">${escapeHTML(r.name)}</span>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 12px; font-weight: bold; color: #10b981;">
                                    ${(r.efficiency * 100).toFixed(1)}%
                                </div>
                                <div style="font-size: 10px; color: var(--text-secondary);">
                                    ${r.timesUsed}回/${r.cost}pt
                                </div>
                            </div>
                        </div>
                    `).join('') : '<div style="color: var(--text-secondary); text-align: center; font-size: 12px;">使用データがありません</div>'}
                </div>
            `;
        }
        
        // 最近使用した報酬を更新
        function updateRecentUsedRewards(spendTransactions) {
            const el = document.getElementById('recent-used-rewards');
            if (!el) return;
            
            const recent = spendTransactions
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 5);
            
            if (recent.length === 0) {
                el.innerHTML = '<div style="color: var(--text-secondary); text-align: center;">まだ報酬を使用していません</div>';
                return;
            }
            
            el.innerHTML = recent.map(t => {
                const date = new Date(t.timestamp);
                const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                const timeDiff = Date.now() - date.getTime();
                const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
                const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
                const timeAgo = daysAgo > 0 ? `${daysAgo}日前` : hoursAgo > 0 ? `${hoursAgo}時間前` : '今日';
                
                return `
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 8px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 8px;
                    ">
                        <div>
                            <div style="font-weight: bold; font-size: 14px;">${escapeHTML(t.description)}</div>
                            <div style="font-size: 11px; color: var(--text-secondary);">${dateStr} (${timeAgo})</div>
                        </div>
                        <div style="font-size: 16px; font-weight: bold; color: #ef4444;">-${t.amount}pt</div>
                    </div>
                `;
            }).join('');
        }
        
        // 報酬メニューを表示
        function showRewardMenu(event, rewardId) {
            event.stopPropagation();
            event.preventDefault();
            
            // 既存のメニューを削除
            const existingMenu = document.querySelector('.reward-menu');
            if (existingMenu) {
                existingMenu.remove();
            }
            
            // メニューを作成
            const menu = document.createElement('div');
            menu.className = 'reward-menu';
            
            // ボタンの位置を取得
            const button = event.currentTarget;
            const rect = button.getBoundingClientRect();
            
            // メニューの位置を計算（ボタンの下に表示）
            const menuTop = rect.bottom + 8;
            const menuLeft = Math.max(8, rect.right - 180); // 右寄せで表示
            
            menu.style.cssText = `
                position: fixed;
                left: ${menuLeft}px;
                top: ${menuTop}px;
                background: var(--surface);
                border: 1px solid var(--border);
                border-radius: 12px;
                padding: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                z-index: 10000;
                min-width: 160px;
            `;
            
            menu.innerHTML = `
                <div onclick="window.editReward('${rewardId}'); this.parentElement.remove();" style="
                    padding: 12px 16px;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: background 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 16px;
                " onmouseover="this.style.background='var(--surface-hover)'" onmouseout="this.style.background='transparent'">
                    ✏️ 編集
                </div>
                <div onclick="window.deleteReward('${rewardId}'); this.parentElement.remove();" style="
                    padding: 12px 16px;
                    cursor: pointer;
                    border-radius: 8px;
                    color: #ef4444;
                    transition: background 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 16px;
                " onmouseover="this.style.background='rgba(239, 68, 68, 0.1)'" onmouseout="this.style.background='transparent'">
                    🗑️ 削除
                </div>
            `;
            
            document.body.appendChild(menu);
            
            // 画面外にはみ出す場合は位置を調整
            const menuRect = menu.getBoundingClientRect();
            if (menuRect.bottom > window.innerHeight) {
                menu.style.top = (rect.top - menuRect.height - 8) + 'px';
            }
            if (menuRect.right > window.innerWidth) {
                menu.style.left = (window.innerWidth - menuRect.width - 8) + 'px';
            }
            
            // クリックで閉じる
            setTimeout(() => {
                document.addEventListener('click', function closeMenu(e) {
                    if (!menu.contains(e.target)) {
                        menu.remove();
                        document.removeEventListener('click', closeMenu);
                    }
                });
            }, 100);
        }
        
        // 報酬を編集
        window.editReward = function(rewardId) {
            const data = loadData();
            const reward = data.pointSystem.customRewards.find(r => r.id === rewardId);
            if (!reward) return;
            
            // 値を事前にエスケープ
            const escapedName = escapeHTML(reward.name);
            const escapedEmoji = reward.emoji || '';
            const escapedMemo = escapeHTML(reward.memo || '');
            
            // モーダルを作成
            const modal = document.createElement('div');
            modal.className = 'overlay active';
            modal.innerHTML = `
                <div style="
                        background: var(--surface);
                        border-radius: 24px;
                        padding: 32px;
                        max-width: 400px;
                        width: 100%;
                        max-height: 90vh;
                        overflow-y: auto;
                        border: 1px solid var(--border);
                        position: relative;
                    ">
                    <div class="modal-header">
                        <h2>報酬を編集</h2>
                        <button class="close-btn" onclick="this.closest('.overlay').remove()">×</button>
                    </div>
                    <div class="modal-body">
                        <form onsubmit="window.saveEditedReward(event, '${rewardId}'); return false;" style="display: grid; gap: 16px;">
                            <div class="form-group">
                                <label for="edit-reward-name">報酬の名前</label>
                                <input type="text" id="edit-reward-name" value="${escapedName}" required autocomplete="off">
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-reward-cost">必要ポイント</label>
                                <input type="number" id="edit-reward-cost" value="${reward.cost}" required min="1" max="999" autocomplete="off">
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-reward-emoji">アイコン（絵文字）</label>
                                <input type="text" id="edit-reward-emoji" value="${escapedEmoji}" maxlength="2" autocomplete="off">
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-reward-category">カテゴリー</label>
                                <select id="edit-reward-category">
                                    <option value="休憩" ${reward.category === '休憩' ? 'selected' : ''}>🍵 休憩</option>
                                    <option value="娯楽" ${reward.category === '娯楽' ? 'selected' : ''}>🎮 娯楽</option>
                                    <option value="食事" ${reward.category === '食事' ? 'selected' : ''}>🍰 食事</option>
                                    <option value="買い物" ${reward.category === '買い物' ? 'selected' : ''}>🛍️ 買い物</option>
                                    <option value="体験" ${reward.category === '体験' ? 'selected' : ''}>🎭 体験</option>
                                    <option value="自由時間" ${reward.category === '自由時間' ? 'selected' : ''}>⏰ 自由時間</option>
                                    <option value="その他" ${reward.category === 'その他' ? 'selected' : ''}>📦 その他</option>
                                </select>
                            </div>
                            
                            <div class="form-group">
                                <label for="edit-reward-memo">メモ（任意）</label>
                                <textarea id="edit-reward-memo" autocomplete="off">${escapedMemo}</textarea>
                            </div>
                            
                            <button type="submit" class="btn btn-primary" style="width: 100%;">
                                💾 保存
                            </button>
                        </form>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
        }
        
        // 編集した報酬を保存
        window.saveEditedReward = function(event, rewardId) {
            event.preventDefault();
            
            const data = loadData();
            const rewardIndex = data.pointSystem.customRewards.findIndex(r => r.id === rewardId);
            if (rewardIndex === -1) return;
            
            const reward = data.pointSystem.customRewards[rewardIndex];
            
            // 更新
            reward.name = document.getElementById('edit-reward-name').value.trim();
            reward.cost = parseInt(document.getElementById('edit-reward-cost').value);
            reward.emoji = document.getElementById('edit-reward-emoji').value.trim() || '🎁';
            reward.category = document.getElementById('edit-reward-category').value;
            reward.memo = document.getElementById('edit-reward-memo').value.trim();
            
            saveData(data);
            updateRewardsList();
            updateRewardsStatistics();
            
            // モーダルを閉じる
            const overlay = event.target.closest('.overlay');
            if (overlay) {
                overlay.remove();
            }
            
            showNotification('✅ 報酬を更新しました', 'success');
        }
        
        // 報酬を削除
        window.deleteReward = function(rewardId) {
            if (!confirm('この報酬を削除しますか？')) return;
            
            const data = loadData();
            const rewardIndex = data.pointSystem.customRewards.findIndex(r => r.id === rewardId);
            if (rewardIndex === -1) return;
            
            // 削除
            data.pointSystem.customRewards.splice(rewardIndex, 1);
            
            saveData(data);
            updateRewardsList();
            
            showNotification('🗑️ 報酬を削除しました', 'success');
        }
        
        // 報酬を使用
        function useReward(rewardId) {
            const data = loadData();
            const reward = data.pointSystem.customRewards.find(r => r.id === rewardId);
            
            if (!reward) return;
            
            if (data.pointSystem.currentPoints < reward.cost) {
                showNotification('ポイントが不足しています', 'error');
                return;
            }
            
            // 確認ダイアログ
            if (!confirm(`「${reward.name}」を ${reward.cost}pt で使用しますか？`)) {
                return;
            }
            
            // ポイントを消費
            if (spendPoints(reward.cost, reward.name)) {
                // 使用回数を増やす
                reward.timesUsed = (reward.timesUsed || 0) + 1;
                
                const updatedData = loadData();
                const rewardIndex = updatedData.pointSystem.customRewards.findIndex(r => r.id === rewardId);
                if (rewardIndex !== -1) {
                    updatedData.pointSystem.customRewards[rewardIndex] = reward;
                    saveData(updatedData);
                }
                
                showNotification(`🎉 「${reward.name}」を使用しました！`, 'success');
                updatePointsView();
                updateRewardsList();
            }
        }
        
        // 報酬メニューのトグル（お気に入り、編集、削除など）
        function toggleRewardMenu(rewardId) {
            // 簡単な実装として削除のみ
            if (confirm('この報酬を削除しますか？')) {
                const data = loadData();
                data.pointSystem.customRewards = data.pointSystem.customRewards.filter(r => r.id !== rewardId);
                saveData(data);
                updateRewardsList();
                showNotification('報酬を削除しました', 'info');
            }
        }

        // ========== ポイントシステム関連の関数ここまで ==========

        // ナビゲーションを更新
        function updateNavigation(activeView) {
            document.querySelectorAll('.nav-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            const activeBtn = document.querySelector(`[data-view="${activeView}"]`);
            if (activeBtn) {
                activeBtn.classList.add('active');
            }
            
            // ページインジケーターを更新
            const viewIndex = views.indexOf(activeView);
            if (viewIndex !== -1) {
                document.querySelectorAll('.dot').forEach((dot, index) => {
                    if (index === viewIndex) {
                        dot.style.background = 'var(--primary)';
                        dot.style.width = '8px';
                        dot.style.height = '8px';
                    } else {
                        dot.style.background = 'var(--surface-light)';
                        dot.style.width = '6px';
                        dot.style.height = '6px';
                    }
                });
            }

            // スライドピル（下線インジケーター）を移動
            try {
                const navContent = document.querySelector('.nav-content');
                const indicator = document.getElementById('nav-indicator');
                if (navContent && indicator && activeBtn) {
                    const left = activeBtn.offsetLeft - navContent.scrollLeft;
                    const width = activeBtn.offsetWidth;
                    indicator.style.width = width + 'px';
                    indicator.style.transform = `translateX(${left}px)`;
                }
            } catch (e) {
                // noop
            }

            // エッジナブの表示制御（進捗では非表示）
            try {
                const leftNub = document.getElementById('edge-nub-left');
                const rightNub = document.getElementById('edge-nub-right');
                if (leftNub && rightNub) {
                    const hideOn = ['progress'];
                    const show = !hideOn.includes(activeView);
                    leftNub.style.display = show ? 'flex' : 'none';
                    rightNub.style.display = show ? 'flex' : 'none';
                }
            } catch (_) {}
        }

        // ホーム画面を表示
        function showHomeView() {
            resetScrollToTop();
            document.getElementById('home-view').style.display = 'block';
            document.getElementById('new-hypothesis-view').style.display = 'none';
            const _sv = document.getElementById('shuffle-view'); if (_sv) _sv.style.display = 'none';
            document.getElementById('progress-view').style.display = 'none';
            { const el = document.getElementById('history-view'); if (el) el.style.display = 'none'; }
            { const el = document.getElementById('status-view'); if (el) el.style.display = 'none'; }
            document.getElementById('stats-view').style.display = 'none';
            document.getElementById('points-view').style.display = 'none';
            document.getElementById('cards-view').style.display = 'none';
            // 夜のチェックリストはホームでのみ表示
            try { const n = document.getElementById('night-checklist-card'); if (n) n.style.display = 'block'; } catch(_) {}
            
            // 新規習慣フォームをリセット
            try {
                document.getElementById('hypothesis-title').value = '';
                document.getElementById('hypothesis-description').value = '';
                const daysEl = document.getElementById('hypothesis-days');
                if (daysEl) daysEl.value = 7;
                const endEl = document.getElementById('habit-end-date');
                if (endEl) endEl.value = '';
                const categorySelect = document.getElementById('hypothesis-category');
                if (categorySelect) categorySelect.value = 'other';
                selectedDuration = null;
                document.querySelectorAll('.duration-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                window.selectedStartDate = null;
            } catch(_) {}
            
            updateNavigation('home');
            
            // カテゴリドロップダウンを更新
            updateCategoryDropdowns();
            
            // 保存されたカテゴリフィルターを復元
            const savedCategory = localStorage.getItem('selectedCategory') || 'all';
            const categoryFilter = document.getElementById('category-filter');
            if (categoryFilter) {
                categoryFilter.value = savedCategory;
            }
            
            updateCurrentHypothesisList();
            updatePerfectBonusIndicator();
            updatePenaltyIndicators();
            updateChallenges();
            updateJournalStatus();  // ジャーナルステータスを更新
            // チェックリスト表示を更新
            try { if (typeof renderChecklists === 'function') renderChecklists(); } catch(_) {}
            
            // イベント表示を更新（スマホ対応）
            try {
                updateEventDisplay();
            } catch (e) {
                console.error('イベント表示エラー:', e);
            }
            
            // ホーム画面ではヘッダーのポイント表示を再表示
            const pointDisplay = document.getElementById('point-display');
            if (pointDisplay) {
                pointDisplay.style.display = 'flex';
            }

            // デブリーフバナーを削除（機能を無効化）
            
            // ホーム画面のすべてのトグルを確実に閉じる
            setTimeout(() => {
                closeHomeToggles();
            }, 100);
        }
        
        // 習慣の休眠モード切り替え
        function toggleSleepMode() {
            const data = loadData();
            const hyp = data.currentHypotheses.find(h => h.id === window.currentHypothesis.id);
            
            if (!hyp) return;
            
            if (hyp.isSleeping) {
                // 休眠解除
                hyp.isSleeping = false;
                hyp.sleepEndDate = new Date().toISOString();
                
                // 休眠期間を記録（統計用）
                if (!hyp.sleepHistory) hyp.sleepHistory = [];
                hyp.sleepHistory.push({
                    startDate: hyp.sleepStartDate,
                    endDate: hyp.sleepEndDate,
                    duration: Math.floor((new Date(hyp.sleepEndDate) - new Date(hyp.sleepStartDate)) / (1000 * 60 * 60 * 24))
                });
                
                delete hyp.sleepStartDate;
                delete hyp.sleepEndDate;
                
                showNotification('🌅 習慣を再開しました！', 'success');
            } else {
                // 休眠開始
                if (confirm('この習慣を休眠させますか？\n\n休眠中は：\n• 達成率の計算から除外されます\n• ストリークは保持されます\n• いつでも再開できます')) {
                    hyp.isSleeping = true;
                    hyp.sleepStartDate = new Date().toISOString();
                    
                    showNotification('😴 習慣を休眠させました', 'info');
                }
            }
            
            saveData(data);
            window.currentHypothesis = hyp;
            window.showProgressView(hyp.id);
        }

        // ペナルティインジケーターを更新
        function updatePenaltyIndicators() {
            // 既存のインジケーターを削除
            document.querySelectorAll('.penalty-indicator').forEach(el => el.remove());
            
            let indicatorTop = 130; // パーフェクトボーナスの下から開始
            
            // ハードモード
            if (window.currentHypothesis && window.currentHypothesis.hardMode) {
                const indicator = document.createElement('div');
                indicator.className = 'penalty-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: ${indicatorTop}px;
                    right: 20px;
                    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 16px;
                    font-weight: 600;
                    font-size: 14px;
                    box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3);
                    animation: pulse 2s infinite;
                    z-index: 100;
                `;
                indicator.innerHTML = '⚡ ハードモード（90%以上必要）';
                document.body.appendChild(indicator);
                indicatorTop += 50;
            }
            
            // リセットリスク
            if (window.currentHypothesis && window.currentHypothesis.resetRisk) {
                const indicator = document.createElement('div');
                indicator.className = 'penalty-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: ${indicatorTop}px;
                    right: 20px;
                    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 16px;
                    font-weight: 600;
                    font-size: 14px;
                    box-shadow: 0 4px 20px rgba(220, 38, 38, 0.3);
                    animation: pulse 2s infinite;
                    z-index: 100;
                `;
                indicator.innerHTML = '🔄 リセットリスク適用中';
                document.body.appendChild(indicator);
                indicatorTop += 50;
            }
            
            // 達成率減少
            if (window.currentHypothesis && window.currentHypothesis.achievementDecrease) {
                const indicator = document.createElement('div');
                indicator.className = 'penalty-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: ${indicatorTop}px;
                    right: 20px;
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 16px;
                    font-weight: 600;
                    font-size: 14px;
                    box-shadow: 0 4px 20px rgba(239, 68, 68, 0.3);
                    animation: pulse 2s infinite;
                    z-index: 100;
                `;
                indicator.innerHTML = `📉 達成率-${window.currentHypothesis.achievementDecrease}%`;
                document.body.appendChild(indicator);
            }
        }
        
        // パーフェクトボーナスインジケーターを更新
        function updatePerfectBonusIndicator() {
            const data = loadData();
            const hasActiveBonus = data.cards && data.cards.activeEffects && 
                data.cards.activeEffects.some(effect => effect.cardId === 'perfect_bonus');
            
            // 既存のインジケーターを削除
            const existingIndicator = document.getElementById('perfect-bonus-indicator');
            if (existingIndicator) {
                existingIndicator.remove();
            }
            
            if (hasActiveBonus) {
                const indicator = document.createElement('div');
                indicator.id = 'perfect-bonus-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 20px;
                    font-weight: 600;
                    box-shadow: 0 4px 20px rgba(245, 158, 11, 0.3);
                    animation: pulse 2s infinite;
                    z-index: 100;
                `;
                indicator.innerHTML = '🎯 パーフェクトボーナス適用中';
                document.body.appendChild(indicator);
            }
        }

        // カテゴリで習慣をフィルタリング
        function filterHabitsByCategory() {
            const filter = document.getElementById('category-filter');
            if (filter) {
                // 選択中のカテゴリを保存
                localStorage.setItem('selectedCategory', filter.value);
                // 習慣リストを更新
                updateCurrentHypothesisList();
            }
        }
        window.filterHabitsByCategory = filterHabitsByCategory;
        
        // 新規習慣作成画面を表示
        function showNewHypothesisView() {
            resetScrollToTop();
            document.getElementById('home-view').style.display = 'none';
            document.getElementById('new-hypothesis-view').style.display = 'block';
            // 夜のチェックリストは非表示
            try { const n = document.getElementById('night-checklist-card'); if (n) n.style.display = 'none'; } catch(_) {}
            
            // カテゴリドロップダウンを更新
            updateCategoryDropdowns();
            
            // カテゴリをデフォルトにリセット
            const categorySelect = document.getElementById('hypothesis-category');
            if (categorySelect) {
                categorySelect.value = 'other';
            }
            document.getElementById('history-view').style.display = 'none';
            document.getElementById('stats-view').style.display = 'none';
            document.getElementById('points-view').style.display = 'none';
            document.getElementById('cards-view').style.display = 'none';
            
            updateNavigation('new');
            
            // 新規作成画面ではヘッダーのポイント表示を再表示
            const pointDisplay = document.getElementById('point-display');
            if (pointDisplay) {
                pointDisplay.style.display = 'flex';
            }
            
            // フォームをリセット
            document.getElementById('hypothesis-title').value = '';
            document.getElementById('hypothesis-description').value = '';
            try {
                const daysEl = document.getElementById('hypothesis-days');
                if (daysEl) daysEl.value = 7;
                const endEl = document.getElementById('habit-end-date');
                if (endEl) endEl.value = '';
            } catch(_) {}
            // 1行宣言UIは廃止
            // 入力にフォーカス
            const titleInput = document.getElementById('hypothesis-title');
            if (titleInput) {
                setTimeout(() => titleInput.focus(), 0);
            }
            // IF-THEN機能は削除
            selectedDuration = null;
            document.querySelectorAll('.duration-option').forEach(opt => {
                opt.classList.remove('selected');
                opt.classList.remove('disabled');
                opt.style.opacity = '1';
                opt.onclick = function() { selectDuration(this.dataset.duration); };
            });
            
            // 開始日を今日にリセット
            window.selectedStartDate = null;
            setStartDate('today');
            
            // 短期集中ペナルティが有効な場合
            if (window.shortTermOnly) {
                // 中期間と長期間を無効化
                ['medium', 'long'].forEach(duration => {
                    const opt = document.querySelector(`[data-duration="${duration}"]`);
                    if (opt) {
                        opt.classList.add('disabled');
                        opt.style.opacity = '0.5';
                        opt.onclick = null;
                    }
                });
                
                // 警告メッセージを表示
                showCardEffect('短期集中ペナルティ適用中！', '短期間（3-7日）のみ選択可能です', '#ef4444');
            }
            
            // 頻度UIは廃止（すべて毎日扱い）
        }

        // 頻度に応じて期間表示を更新
        function updateDurationDisplay(frequencyType) {
            const shortText = document.getElementById('duration-short-text');
            const mediumText = document.getElementById('duration-medium-text');
            const longText = document.getElementById('duration-long-text');
            
            if (!shortText || !mediumText || !longText) return;
            
            if (frequencyType === 'weekly' || frequencyType === 'weekdays') {
                // 週単位で表示
                shortText.textContent = '2〜4週間';
                mediumText.textContent = '5〜7週間';
                longText.textContent = '8〜10週間';
            } else {
                // 日単位で表示（毎日の場合）
                shortText.textContent = '3〜7日';
                mediumText.textContent = '8〜14日';
                longText.textContent = '15〜30日';
            }
        }
        
        // 検証期間を選択（廃止）
        function selectDuration(duration) {
            selectedDuration = duration;
            document.querySelectorAll('.duration-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            document.querySelector(`[data-duration="${duration}"]`).classList.add('selected');
        }
        
        

        // 習慣を作成（無期限）
        function createHypothesis(event) {
            event.preventDefault();
            
            // 短期集中ペナルティのチェック
            if (window.shortTermOnly) {
                // 旧: シャッフル短期強制。現仕様では任意日数なので特に制限しない
                window.shortTermOnly = false; // 効果を消費
            }

            const title = document.getElementById('hypothesis-title').value.trim();
            const description = document.getElementById('hypothesis-description').value.trim();
            const category = document.getElementById('hypothesis-category').value;

            if (!title || !description) {
                alert('タイトルと詳細を入力してください');
                return;
            }
            if (title.length > 100) {
                alert('タイトルは100文字以内で入力してください');
                return;
            }
            if (description.length > 1000) {
                alert('詳細は1000文字以内で入力してください');
                return;
            }
            // 1行宣言は廃止したため入力不要
            
            // すべて毎日実施に固定
            let frequencyData = { type: 'daily' };

            // 開始日を取得（未選択の場合は今日）
            let startDate = window.selectedStartDate || new Date().toISOString().split('T')[0];
            
            currentHypothesis = {
                id: Date.now(),
                title: title,
                description: description,
                category: category,  // カテゴリーを追加
                duration: 'unlimited',
                isUnlimited: true,
                startDate: startDate + 'T00:00:00.000Z',
                achievements: {},
                // ペナルティ効果を記録
                hardMode: window.hardModeActive || false,
                resetRisk: window.resetRiskActive || false,
                achievementDecrease: window.achievementDecrease || 0,
                shortTermOnly: window.shortTermOnly || false,
                // benefit: 廃止
                frequency: frequencyData  // 頻度設定を追加
            };

            // 無期限のため totalDays は設定しない
            
            // ペナルティ効果をリセット（一度使用したら消える）
            window.hardModeActive = false;
            window.resetRiskActive = false;
            window.achievementDecrease = 0;
            // shortTermOnly は現習慣に引き継いだためリセット
            window.shortTermOnly = false;
            
            // ペナルティカードのチェック
            const data = loadData();
            if (data.cards.pendingPenalties.length > 0) {
                // ペナルティカードを適用
                applyPenaltyCards();
            } else {
                // 直接開始
                finalizeStartHypothesis();
            }
        }

        // ペナルティカードを適用
        function applyPenaltyCards() {
            const data = loadData();
            
            // プロテクトシールドは削除（無効化処理は行わない）
            
            const penalties = [];
            
            // すべてのペナルティカードを収集
            data.cards.pendingPenalties.forEach(penalty => {
                penalties.push(penalty.cardId);
            });
            
            if (penalties.length > 0) {
                // ペナルティエフェクトを表示
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.style.display = 'flex';
                modal.innerHTML = `
                    <div class="modal-content penalty-effect" style="text-align: center; max-width: 400px;">
                        <h2 style="color: #ef4444; margin-bottom: 24px;">⚠️ ペナルティカード発動！</h2>
                        <div id="penalty-cards-display" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
                        </div>
                        <button class="btn" onclick="continuePenaltyApply()">確認</button>
                    </div>
                `;
                document.body.appendChild(modal);
                
                const penaltyDisplay = document.getElementById('penalty-cards-display');
                
                // ペナルティカードの効果を設定
                penalties.forEach(penaltyId => {
                    const card = CARD_MASTER[penaltyId];
                    if (card) {
                        const cardDiv = document.createElement('div');
                        cardDiv.className = 'card-item penalty';
                        cardDiv.style.margin = '0 auto';
                        cardDiv.style.maxWidth = '250px';
                        cardDiv.innerHTML = `
                            <div class="card-icon">${card.icon}</div>
                            <div class="card-name">${card.name}</div>
                            <div class="card-description">${card.description}</div>
                        `;
                        penaltyDisplay.appendChild(cardDiv);
                        
                        // ペナルティ効果を適用
                        switch(penaltyId) {
                            case 'extension_card':
                                window.pendingExtension = 3;
                                break;
                            case 'hard_mode':
                                window.hardModeActive = true;
                                break;
                            case 'reset_risk':
                                window.resetRiskActive = true;
                                break;
                            case 'short_term':
                                window.shortTermOnly = true;
                                break;
                            case 'achievement_decrease':
                                window.achievementDecrease = 10;
                                break;
                            case 'event_seal':
                                // イベント封印効果を3日間適用
                                const sealStart = new Date();
                                const sealEnd = new Date();
                                sealEnd.setDate(sealEnd.getDate() + 3);
                                if (!data.cards.activeEffects) data.cards.activeEffects = [];
                                data.cards.activeEffects.push({
                                    type: 'event_seal',
                                    startDate: sealStart.toISOString(),
                                    endDate: sealEnd.toISOString()
                                });
                                saveData(data);
                                updateActiveEffectsDisplay();
                                break;
                            case 'mission_overload':
                                // ミッション追加（ランダムに2つ追加）
                                window.additionalMissions = 2;
                                break;
                            case 'slowdown':
                                // ポイント0.5倍効果を3日間適用
                                const slowStart = new Date();
                                const slowEnd = new Date();
                                slowEnd.setDate(slowEnd.getDate() + 3);
                                if (!data.cards.activeEffects) data.cards.activeEffects = [];
                                data.cards.activeEffects.push({
                                    type: 'slowdown',
                                    startDate: slowStart.toISOString(),
                                    endDate: slowEnd.toISOString()
                                });
                                saveData(data);
                                updateActiveEffectsDisplay();
                                break;
                        }
                    }
                });
                
                // ペナルティカードを消費
                data.cards.pendingPenalties = [];
                saveData(data);
            }
        }

        // ペナルティ適用後の処理
        window.continuePenaltyApply = function() {
            document.querySelector('.modal:last-child').remove();
            finalizeStartHypothesis();
        };

        // シャッフルを使わずに、確定済みtotalDaysで開始
        function finalizeStartHypothesis() {
            if (!currentHypothesis) return;
            // 延長ペナルティが保留されていれば適用
            if (window.pendingExtension && Number.isFinite(window.pendingExtension)) {
                currentHypothesis.totalDays = Math.max(1, (currentHypothesis.totalDays || 0) + window.pendingExtension);
                window.pendingExtension = 0;
            }
            startHypothesis();
        }

        // シャッフル画面を表示
        function showShuffleView() {
            // 廃止: ランダム期間のシャッフルを行わず即時開始
            try { finalizeStartHypothesis(); } catch(_) {}
            return;
            resetScrollToTop();
            document.getElementById('new-hypothesis-view').style.display = 'none';
            document.getElementById('shuffle-view').style.display = 'block';
            
            const shuffleContainer = document.querySelector('.shuffle-container');
            const shuffleResult = document.getElementById('shuffle-result');
            
            shuffleContainer.style.display = 'block';
            shuffleResult.style.display = 'none';
            
            // シャッフルアニメーション
            // 頻度設定に応じて日数か週数かを決定
            let durationRanges;
            let isWeekMode = false;
            
            if (currentHypothesis.frequency && 
                (currentHypothesis.frequency.type === 'weekly' || currentHypothesis.frequency.type === 'weekdays')) {
                // 週単位モード（週●回または特定曜日の場合）
                isWeekMode = true;
                durationRanges = {
                    short: { min: 2, max: 4 },   // 2〜4週間（14〜28日）
                    medium: { min: 5, max: 7 },   // 5〜7週間（35〜49日）
                    long: { min: 8, max: 10 }     // 8〜10週間（56〜70日）
                };
            } else {
                // 日単位モード（毎日の場合）
                durationRanges = {
                    short: { min: 3, max: 7 },
                    medium: { min: 8, max: 14 },
                    long: { min: 15, max: 30 }
                };
            }
            
            // 短期集中ペナルティ適用時は短期レンジを調整
            let range = durationRanges[currentHypothesis.duration];
            if (currentHypothesis.duration === 'short' && currentHypothesis.shortTermOnly) {
                if (isWeekMode) {
                    range = { min: 2, max: 2 };  // 2週間固定
                } else {
                    range = { min: 3, max: 5 };  // 3-5日
                }
            }
            let shuffleCount = 0;
            const maxShuffles = 20;
            
            const shuffleInterval = setInterval(() => {
                const randomValue = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                const shuffleNumber = document.getElementById('shuffle-number');
                
                // 週モードの場合は週数と日数を両方表示
                if (isWeekMode) {
                    const days = randomValue * 7;
                    shuffleNumber.innerHTML = `<span style="font-size: 48px;">${randomValue}</span><span style="font-size: 24px;">週間</span><br><span style="font-size: 18px; color: var(--text-secondary);">(${days}日間)</span>`;
                } else {
                    shuffleNumber.textContent = randomValue;
                }
                shuffleNumber.classList.add('shuffling');
                
                setTimeout(() => {
                    shuffleNumber.classList.remove('shuffling');
                }, 250);
                
                shuffleCount++;
                
                if (shuffleCount >= maxShuffles) {
                    clearInterval(shuffleInterval);
                    
                    // 最終的な値を決定
                    let finalValue = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                    let finalDays;
                    
                    if (isWeekMode) {
                        // 週モードの場合は週数を日数に変換
                        finalDays = finalValue * 7;
                        const shuffleNumber = document.getElementById('shuffle-number');
                        shuffleNumber.innerHTML = `<span style="font-size: 48px;">${finalValue}</span><span style="font-size: 24px;">週間</span><br><span style="font-size: 18px; color: var(--text-secondary);">(${finalDays}日間)</span>`;
                    } else {
                        finalDays = finalValue;
                    }
                    
                    // ペナルティカードによる延長を適用
                    if (window.pendingExtension) {
                        finalDays += window.pendingExtension;
                        window.pendingExtension = 0;
                    }
                    
                    currentHypothesis.totalDays = finalDays;
                    
                    setTimeout(() => {
                        shuffleContainer.style.display = 'none';
                        shuffleResult.style.display = 'block';
                        document.getElementById('final-days').textContent = finalDays;
                    }, 500);
                }
            }, 150);
        }

        // 習慣を開始
        function startHypothesis() {
            const data = loadData();
            data.currentHypotheses.push(currentHypothesis);
            saveData(data);
            // 立案後はホームへ戻る
            try { showHomeView(); } catch(_) { document.getElementById('home-view').style.display = 'block'; }
        }

        // 進捗画面を表示
        window.showProgressView = function(hypothesisId) {
            resetScrollToTop();
            // モバイルの戻るボタン対策: 進捗ビューに入るタイミングで履歴を積む
            try {
                history.pushState({ view: 'progress', hypothesisId }, '');
            } catch (e) { /* noop */ }
            const data = loadData();
            const hypothesis = data.currentHypotheses.find(h => h.id === hypothesisId);
            
            if (!hypothesis) return;
            
            window.currentHypothesis = hypothesis;
            
            // intensityプロパティが存在しない場合は初期化
            if (!window.currentHypothesis.intensity) {
                window.currentHypothesis.intensity = {};
            }
            
            document.getElementById('home-view').style.display = 'none';
            { const el = document.getElementById('shuffle-view'); if (el) el.style.display = 'none'; }
            document.getElementById('progress-view').style.display = 'block';
            // 夜のチェックリストは詳細画面では非表示
            try { const n = document.getElementById('night-checklist-card'); if (n) n.style.display = 'none'; } catch(_) {}
            
            // 習慣情報を表示
            document.getElementById('progress-hypothesis-title').textContent = hypothesis.title;
            document.getElementById('progress-hypothesis-description').textContent = hypothesis.description;
            
            // 頻度情報を表示
            const daysInfo = document.getElementById('progress-days-info');
            let frequencyText = '';
            if (hypothesis.frequency) {
                if (hypothesis.frequency.type === 'daily') {
                    frequencyText = '毎日実施';
                } else if (hypothesis.frequency.type === 'weekly') {
                    frequencyText = `週${hypothesis.frequency.count}回実施`;
                } else if (hypothesis.frequency.type === 'weekdays') {
                    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
                    const days = hypothesis.frequency.weekdays.map(d => dayNames[d]).join('・');
                    frequencyText = `${days}曜日に実施`;
                }
            } else {
                frequencyText = '毎日実施';  // デフォルト
            }
            
            const startDate = new Date(hypothesis.startDate);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + hypothesis.totalDays - 1);
            
            // 習慣モードかどうかチェック
            const habitModeLabel = hypothesis.habitMode ? ' | 🌟 習慣モード' : '';
            const unlimitedLabel = hypothesis.isUnlimited ? ' | ♾️ 無期限' : '';
            const sleepingLabel = hypothesis.isSleeping ? ' | 😴 休眠中' : '';
            
            // カテゴリ情報を取得
            const categoryInfo = data.categoryMaster && data.categoryMaster[hypothesis.category] 
                ? data.categoryMaster[hypothesis.category] 
                : { name: 'その他', icon: '📝', color: '#6b7280' };
            
            daysInfo.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                    <span>📅 ${startDate.toLocaleDateString('ja-JP')} 〜 ${hypothesis.isUnlimited ? '無期限' : endDate.toLocaleDateString('ja-JP')} | ${frequencyText}${habitModeLabel}${unlimitedLabel}${sleepingLabel}</span>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button class="btn btn-secondary" onclick="editFrequencyType()" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;">
                            🔄 頻度変更
                        </button>
                        <button class="btn btn-secondary" onclick="editHypothesisCategory()" style="padding: 6px 12px; font-size: 12px; border-radius: 6px;">
                            ${categoryInfo.icon} ${categoryInfo.name} 変更
                        </button>
                    </div>
                </div>
            `;
            
            // カレンダー/進捗 表示を更新
            updateCalendar();
            updateProgress();
            
            // カード使用ボタンの表示/非表示
            updateCardUseButton();
            
            // リセットリスクのチェック
            if (hypothesis.resetRisk) {
                checkResetRisk();
            }
            
            // ペナルティインジケーターを更新
            updatePenaltyIndicators();

            // ストリークと強度（Intensity）UIを更新
            renderIntensityPanel();
            
            // 追加のUI更新があればここで実行
        }

        // カード使用ボタンの更新（有効な報酬カードがある場合のみ）
        function updateCardUseButton() {
            const data = loadData();
            const DISABLED_CARDS = new Set(['skip_ticket','achievement_boost','achievement_booster','quick_start']);
            const hasUsable = (data.cards.inventory || []).some(card => {
                const def = CARD_MASTER[card.cardId];
                return def && def.type === 'reward' && !card.used && !DISABLED_CARDS.has(card.cardId);
            });
            const cardUseSection = document.getElementById('card-use-section');
            cardUseSection.style.display = hasUsable ? 'block' : 'none';
            
            // カード使用後は即座にインベントリを更新
            updateCardDisplay();
        }

        // カード使用メニューを表示
        function showCardUseMenu() {
            const modal = document.getElementById('card-use-modal');
            const container = document.getElementById('usable-cards-container');
            const data = loadData();
            
            container.innerHTML = '';
            
            // 使用可能なカードを集計（無効カードは除外）
            const DISABLED_CARDS = new Set(['skip_ticket','achievement_boost','achievement_booster','quick_start','protect_shield']);
            const usableCards = {};
            data.cards.inventory.forEach(card => {
                if (!card.used && CARD_MASTER[card.cardId] && CARD_MASTER[card.cardId].type === 'reward' && !DISABLED_CARDS.has(card.cardId)) {
                    usableCards[card.cardId] = (usableCards[card.cardId] || 0) + 1;
                }
            });
            
            if (Object.keys(usableCards).length > 0) {
                Object.entries(usableCards).forEach(([cardId, count]) => {
                    const card = CARD_MASTER[cardId];
                    const cardDiv = document.createElement('div');
                    cardDiv.className = 'card-item reward';
                    cardDiv.style.cursor = 'pointer';
                    cardDiv.innerHTML = `
                        <div class="card-icon">${card.icon}</div>
                        <div class="card-name">${card.name}</div>
                        <div class="card-description">${card.description}</div>
                        <div class="card-count">×${count}</div>
                    `;
                    
                    // カードタイプに応じて使用関数を分ける
                    if (cardId === 'skip_ticket') {
                        cardDiv.onclick = () => useSkipTicket();
                    } else if (cardId === 'achievement_boost') {
                        cardDiv.onclick = () => useAchievementBoost();
                    } else if (cardId === 'perfect_bonus') {
                        cardDiv.onclick = () => usePerfectBonus();
                    } else if (cardId === 'achievement_booster') {
                        cardDiv.onclick = () => useAchievementBooster();
                    } else if (cardId === 'event_trigger') {
                        cardDiv.onclick = () => useEventTrigger();
                    } else if (cardId === 'event_combo') {
                        cardDiv.onclick = () => useEventCombo();
                    } else if (cardId === 'point_gem') {
                        cardDiv.onclick = () => usePointGem();
                    } else if (cardId === 'mission_master') {
                        cardDiv.onclick = () => useMissionMaster();
                    } else if (cardId === 'rainbow_boost') {
                        cardDiv.onclick = () => useRainbowBoost();
                    } else if (cardId === 'streak_bonus') {
                        cardDiv.onclick = () => useStreakBonus();
                    } else if (cardId === 'lucky_seven') {
                        cardDiv.onclick = () => useLuckySeven();
                    } else if (cardId === 'conversion_magic') {
                        cardDiv.onclick = () => useConversionMagic();
                    } else if (cardId === 'fate_dice') {
                        cardDiv.onclick = () => useFateDice();
                    } else if (cardId === 'combo_chain') {
                        cardDiv.onclick = () => useComboChain();
                    } else if (cardId === 'sparkle_streak') {
                        cardDiv.onclick = () => useSparkleStreak();
                    } else if (cardId === 'category_festival') {
                        cardDiv.onclick = () => useCategoryFestival();
                    } else if (cardId === 'happy_hour') {
                        cardDiv.onclick = () => useHappyHour();
                    } else if (cardId === 'mystery_box') {
                        cardDiv.onclick = () => useMysteryBox();
                    } else if (cardId === 'mini_rainbow') {
                        cardDiv.onclick = () => useMiniRainbow();
                    } else if (cardId === 'power_nap') {
                        cardDiv.onclick = () => usePowerNap();
                    } else if (cardId === 'shuffle_challenge') {
                        cardDiv.onclick = () => useShuffleChallenge();
                    } else if (cardId === 'event_shuffle') {
                        cardDiv.onclick = () => useEventShuffle();
                    } else if (cardId === 'combo_surge') {
                        cardDiv.onclick = () => useComboSurge();
                    } else if (cardId === 'afternoon_gem') {
                        cardDiv.onclick = () => useAfternoonGem();
                    } else if (cardId === 'event_ticket') {
                        cardDiv.onclick = () => useEventTicket();
                    } else if (cardId === 'challenge_boost_today') {
                        cardDiv.onclick = () => useChallengeBoostToday();
                    } else if (cardId === 'journal_boost_today') {
                        cardDiv.onclick = () => useJournalBoostToday();
                    }

                    container.appendChild(cardDiv);
                });
            } else {
                container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">使用可能なカードがありません</p>';
            }
            
            modal.style.display = 'flex';
        }

        // カード使用メニューを閉じる
        function closeCardUseMenu() {
            document.getElementById('card-use-modal').style.display = 'none';
        }

        // スキップチケットを使用
        function useSkipTicket() {
            closeCardUseMenu();
            
            // スキップモードを有効化
            window.skipTicketMode = true;
            
            // メッセージを表示
            const message = document.createElement('div');
            message.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: var(--gradient-1);
                color: white;
                padding: 20px 40px;
                border-radius: 20px;
                font-size: 18px;
                font-weight: 600;
                z-index: 2000;
                animation: fadeInOut 2s ease-out;
            `;
            message.textContent = '⏭️ スキップチケット使用中！達成したい日をタップ';
            document.body.appendChild(message);
            
            setTimeout(() => message.remove(), 2000);
            
            // カレンダーを更新してスキップモードを反映
            updateCalendar();
        }
        
        // 達成ブーストを使用
        function useAchievementBoost() {
            closeCardUseMenu();
            
            if (!window.currentHypothesis || window.currentHypothesis.completed) {
                alert('進行中の習慣がありません');
                return;
            }
            
            const card = findAndRemoveCard('achievement_boost');
            if (!card) {
                alert('達成ブーストカードを持っていません');
                return;
            }
            
            // 達成ブースト選択画面を表示
            showAchievementBoostSelection();
            
            saveData();
            displayUserCards();
        }
        
        function findAndRemoveCard(cardId) {
            const data = loadData();
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === cardId && !card.used
            );
            
            if (cardIndex === -1) {
                return null;
            }
            
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(cardIndex, 1);
            saveData(data);
            
            return data.cards.inventory[cardIndex];
        }
        
        function showAchievementBoostSelection() {
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🌟 達成ブースト</h3>
                    <p>達成済みにする日を2日選択してください</p>
                </div>
                <div class="skip-dates" id="boost-dates">
                    <!-- 日付ボタンが動的に追加される -->
                </div>
                <div class="modal-footer">
                    <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                    <button class="button primary" id="apply-boost" disabled>適用する</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // 選択可能な日付を表示
            const datesContainer = document.getElementById('boost-dates');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const startDate = new Date(window.currentHypothesis.startDate);
            const endDate = new Date(window.currentHypothesis.endDate);
            
            const selectedDates = new Set();
            
            // 日付ボタンを生成
            for (let d = new Date(startDate); d <= endDate && d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = dateKeyLocal(d);
                const achievements = window.currentHypothesis.achievements || {};
                
                // すでに達成済みの日はスキップ
                if (achievements[dateStr]) continue;
                
                const dateButton = document.createElement('button');
                dateButton.className = 'date-button';
                dateButton.textContent = `${d.getMonth() + 1}月${d.getDate()}日`;
                dateButton.dataset.date = dateStr;
                
                dateButton.onclick = function() {
                    if (selectedDates.has(dateStr)) {
                        selectedDates.delete(dateStr);
                        this.classList.remove('selected');
                    } else if (selectedDates.size < 2) {
                        selectedDates.add(dateStr);
                        this.classList.add('selected');
                    }
                    
                    // 適用ボタンの有効/無効を切り替え
                    document.getElementById('apply-boost').disabled = selectedDates.size !== 2;
                };
                
                datesContainer.appendChild(dateButton);
            }
            
            // 選択可能な日がない場合
            if (datesContainer.children.length === 0) {
                datesContainer.innerHTML = '<p style="text-align: center; color: #94a3b8;">達成可能な日がありません</p>';
            }
            
            // 適用ボタンの処理
            document.getElementById('apply-boost').onclick = function() {
                applyAchievementBoost(Array.from(selectedDates));
                overlay.remove();
            };
        }
        
        function applyAchievementBoost(dates) {
            if (!window.currentHypothesis || dates.length !== 2) return;
            
            // 選択された2日を達成済みにする
            if (!window.currentHypothesis.achievements) {
                window.currentHypothesis.achievements = {};
            }
            
            dates.forEach(dateStr => {
                window.currentHypothesis.achievements[dateStr] = true;
            });
            
            // データを保存
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index] = window.currentHypothesis;
                saveData(data);
            }
            
            updateCalendar();
            updateProgress();
            
            // エフェクトを表示
            showCardEffect('達成ブースト発動！', '選択した2日が達成済みになりました', '#10b981');
        }
        
        // カードエフェクトを表示
        function showCardEffect(title, message, color) {
            const effectDiv = document.createElement('div');
            effectDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: ${color};
                color: white;
                padding: 24px 48px;
                border-radius: 20px;
                font-size: 20px;
                font-weight: 700;
                z-index: 3000;
                animation: cardEffectAnimation 3s ease-out;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            `;
            effectDiv.innerHTML = `
                <h3 style="margin: 0 0 12px 0; font-size: 24px;">${title}</h3>
                <p style="margin: 0; font-size: 16px; font-weight: 400;">${message}</p>
            `;
            
            document.body.appendChild(effectDiv);
            
            setTimeout(() => effectDiv.remove(), 3000);
        }
        
        // パーフェクトボーナスを使用
        function usePerfectBonus() {
            closeCardUseMenu();
            
            if (!confirm('パーフェクトボーナスを使用しますか？\n次の習慣で100%達成時、報酬カード2枚を獲得できます。')) {
                return;
            }
            
            const data = loadData();
            
            // カードを消費
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'perfect_bonus' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ パーフェクトボーナスがありません', 'error');
                return;
            }
            
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(cardIndex, 1);
            
            // アクティブエフェクトに追加
            if (!data.cards.activeEffects) {
                data.cards.activeEffects = [];
            }
            
            data.cards.activeEffects.push({
                cardId: 'perfect_bonus',
                activatedDate: new Date().toISOString(),
                targetHypothesisId: null // 次の習慣に適用
            });
            
            saveData(data);
            
            showNotification('🎯 パーフェクトボーナスが有効になりました！\n次の習慣で100%達成を目指しましょう！', 'success');
        }
        
        // スキップチケットを適用
        function applySkipTicket(dateKey, dayCell) {
            if (!window.skipTicketMode) return;
            
            // 既に達成済みの日は選択不可
            if (window.currentHypothesis.achievements[dateKey]) {
                showNotification('⚠️ すでに達成済みの日です', 'error');
                return;
            }
            // 未来日は不可
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const target = new Date(dateKey);
            if (target > today) {
                showNotification('⚠️ 未来日はスキップできません', 'error');
                return;
            }
            
            // スキップチケットを消費
            const data = loadData();
            const skipTicketIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'skip_ticket' && !card.used
            );
            
            if (skipTicketIndex === -1) {
                showNotification('⚠️ スキップチケットがありません', 'error');
                window.skipTicketMode = false;
                updateCalendar();
                return;
            }
            
            // 確認ダイアログ
            if (!confirm(`この日をスキップして達成済みにしますか？\n日付: ${dateKey}`)) {
                return;
            }
            
            // achievementsが存在しない場合は初期化
            if (!window.currentHypothesis.achievements) {
                window.currentHypothesis.achievements = {};
            }
            
            // 達成状態にする
            window.currentHypothesis.achievements[dateKey] = true;
            
            // スキップ適用ログ（開発用）
            
            // カードを消費
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(skipTicketIndex, 1);
            
            // 現在の習慣を更新
            const hypothesisIndex = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (hypothesisIndex !== -1) {
                if (!data.currentHypotheses[hypothesisIndex].achievements) {
                    data.currentHypotheses[hypothesisIndex].achievements = {};
                }
                data.currentHypotheses[hypothesisIndex].achievements[dateKey] = true;
            }
            
            saveData(data);
            
            // スキップモードを解除
            window.skipTicketMode = false;
            
            // 成功エフェクトを表示
            dayCell.classList.remove('not-achieved');
            dayCell.classList.add('achieved');
            dayCell.style.transition = 'all 0.5s ease';
            dayCell.style.transform = 'scale(1.2)';
            dayCell.style.boxShadow = '0 0 20px var(--primary)';
            
            setTimeout(() => {
                dayCell.style.transform = 'scale(1)';
                dayCell.style.boxShadow = '';
            }, 500);
            
            // 成功メッセージ
            showNotification('✅ スキップチケットを使用しました！', 'success');
            
            // カレンダーを更新
            updateCalendar();
            updateProgress();
        }

        // カレンダーを更新（シンプル: 達成/未達成 のみ）
        function updateCalendar() {
            const calendarGrid = document.getElementById('calendar-grid');
            calendarGrid.innerHTML = '';
            
            const startDate = new Date(window.currentHypothesis.startDate);
            const today = new Date();
            startDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            
            // 経過日数（開始日を1日目として計算）
            const timeDiff = today.getTime() - startDate.getTime();
            const daysPassed = window.currentHypothesis.isUnlimited
                ? Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1)
                : Math.min(Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1), window.currentHypothesis.totalDays);
            
            const calendarDays = window.currentHypothesis.isUnlimited ? daysPassed : window.currentHypothesis.totalDays;
            for (let i = 0; i < calendarDays; i++) {
                const cellDate = new Date(startDate);
                cellDate.setDate(startDate.getDate() + i);
                const dateKey = dateKeyLocal(cellDate);
                const dayCell = document.createElement('div');
                dayCell.className = 'day-cell';
                dayCell.style.position = 'relative';
                
                // ラベル（M/D(曜) と通算日）
                const displayMonth = cellDate.getMonth() + 1;
                const displayDate = cellDate.getDate();
                const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][cellDate.getDay()];
                dayCell.innerHTML = `<small style="font-size: 10px;">${displayMonth}/${displayDate}(${dayOfWeek})</small><br><span style="font-size: 18px; font-weight: bold;">${i + 1}</span>`;
                dayCell.dataset.day = i + 1;
                
                // 状態表示
                const isFuture = cellDate > today;
                const achieved = !!(window.currentHypothesis.achievements || {})[dateKey];
                const failed = !!(window.currentHypothesis.failures || {})[dateKey];
                if (achieved) {
                    dayCell.classList.add('achieved');
                } else if (failed) {
                    dayCell.classList.add('not-achieved');
                } else if (isFuture) {
                    dayCell.classList.add('future');
                } else {
                    dayCell.classList.add('unentered');
                }
                
                // 今日以前のみクリック可能
                if (!isFuture) {
                    dayCell.style.cursor = 'pointer';
                    dayCell.onclick = () => cycleDayStatus(dateKey);
                }
                
                calendarGrid.appendChild(dayCell);
            }
            
            // 期間情報を更新（頻度情報は廃止）
            document.getElementById('progress-days-info').textContent = window.currentHypothesis.isUnlimited
                ? `継続日数: ${daysPassed}日`
                : `検証期間: ${daysPassed}日目 / ${window.currentHypothesis.totalDays}日間`;
        }

        // 長押し検出ユーティリティ
        function attachLongPress(element, onLongPress, delay = 500) {
            let timer = null;
            let longPressed = false;
            const start = (e) => {
                longPressed = false;
                timer = setTimeout(() => { longPressed = true; onLongPress(); }, delay);
            };
            const cancel = () => { if (timer) clearTimeout(timer); };
            element.addEventListener('touchstart', start, { passive: true });
            element.addEventListener('touchend', cancel, { passive: true });
            element.addEventListener('touchmove', cancel, { passive: true });
            element.addEventListener('mousedown', start);
            element.addEventListener('mouseup', cancel);
            element.addEventListener('mouseleave', cancel);
        }
        
        // 長押しで削除用のユーティリティ
        function attachLongPressToDelete(element, hypothesisId, delay = 500) {
            let timer = null;
            let longPressed = false;
            
            const start = (e) => {
                longPressed = false;
                element.classList.add('deleting');
                timer = setTimeout(() => { 
                    longPressed = true; 
                    element.classList.remove('deleting');
                    confirmDeleteHypothesis(hypothesisId);
                }, delay);
            };
            
            const cancel = (e) => { 
                if (timer) clearTimeout(timer);
                element.classList.remove('deleting');
                // 長押しが成功した場合は通常のクリックをキャンセル
                if (longPressed) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            };
            
            element.addEventListener('touchstart', start, { passive: true });
            element.addEventListener('touchend', cancel, { passive: true });
            element.addEventListener('touchmove', cancel, { passive: true });
            element.addEventListener('mousedown', start);
            element.addEventListener('mouseup', cancel);
            element.addEventListener('mouseleave', cancel);
        }
        
        // 習慣のコンテキストメニュー表示
        function showHabitContextMenu(hypothesisId, x, y) {
            // 既存のメニューを削除
            const existing = document.querySelector('.habit-context-menu');
            if (existing) existing.remove();
            
            const data = loadData();
            const hypothesis = data.currentHypotheses.find(h => h.id === hypothesisId);
            if (!hypothesis) return;
            
            // メニュー作成
            const menu = document.createElement('div');
            menu.className = 'habit-context-menu';
            menu.style.cssText = `
                position: fixed;
                left: ${x}px;
                top: ${y}px;
                background: white;
                border: 1px solid #ccc;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 10000;
                min-width: 150px;
            `;
            
            menu.innerHTML = `
                <div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;" onclick="editHabit(${hypothesisId}); document.querySelector('.habit-context-menu').remove();">
                    ✏️ 編集
                </div>
                <div style="padding: 8px 12px; cursor: pointer; color: #dc2626;" onclick="confirmDeleteHypothesis(${hypothesisId}); document.querySelector('.habit-context-menu').remove();">
                    🗑️ 削除
                </div>
            `;
            
            document.body.appendChild(menu);
            
            // メニュー外クリックで閉じる
            setTimeout(() => {
                document.addEventListener('click', function closeMenu() {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }, { once: true });
            }, 100);
        }
        
        // 習慣を編集
        function editHabit(hypothesisId) {
            const data = loadData();
            const hypothesis = data.currentHypotheses.find(h => h.id === hypothesisId);
            if (!hypothesis) return;
            
            const newTitle = prompt('習慣名を編集:', hypothesis.title);
            if (newTitle && newTitle.trim() && newTitle !== hypothesis.title) {
                hypothesis.title = newTitle.trim();
                saveData(data);
                updateCurrentHypothesisList();
                showNotification('習慣を編集しました', 'success');
            }
        }
        
        // 習慣の削除確認
        function confirmDeleteHypothesis(hypothesisId) {
            const data = loadData();
            const hypothesis = data.currentHypotheses.find(h => h.id === hypothesisId);
            
            if (!hypothesis) return;
            
            const message = `「${hypothesis.title}」を削除しますか？\n\nこの操作は取り消せません。`;
            
            if (confirm(message)) {
                deleteHypothesis(hypothesisId);
            }
        }
        
        // 習慣を削除
        function deleteHypothesis(hypothesisId) {
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === hypothesisId);
            
            if (index === -1) return;
            
            // 削除される習慣を記録（必要に応じて履歴に追加）
            const deletedHypothesis = data.currentHypotheses[index];
            
            // 習慣を削除
            data.currentHypotheses.splice(index, 1);
            
            // データを保存
            saveData(data);
            
            // 通知を表示
            showNotification(`✅ 「${deletedHypothesis.title}」を削除しました`, 'success');
            
            // 現在の習慣が削除された場合はホーム画面に戻る
            if (window.currentHypothesis && window.currentHypothesis.id === hypothesisId) {
                window.currentHypothesis = null;
                showHomeView();
            } else {
                // ホーム画面を更新
                updateCurrentHypothesisList();
            }
        }

        // 強度選択モーダル（過去日/当日用）
        function openIntensityPicker(dateKey) {
            if (!window.currentHypothesis) return;
            const hyp = window.currentHypothesis;
            hyp.intensity = hyp.intensity || {};
            hyp.intensityOptions = hyp.intensityOptions || [
                { label: '軽め', mult: 0.8 },
                { label: '基本', mult: 1.0 },
                { label: '高強度', mult: 1.2 },
            ];
            const opts = hyp.intensityOptions;
            const current = Number(hyp.intensity[dateKey] ?? 1.0);

            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '480px';
            modal.style.padding = '20px';
            const title = new Date(dateKey).toLocaleDateString('ja-JP');
            const esc = (s) => (typeof escapeHTML === 'function' ? escapeHTML(String(s)) : String(s));
            const isAchieved = !!((hyp.achievements || {})[dateKey]);
            const btnCss = (active) => `padding:10px 12px;border-radius:10px;border:2px solid ${active ? '#10b981' : '#334155'};background:${active ? 'rgba(16,185,129,0.15)' : 'rgba(30,41,59,0.5)'};color:#e2e8f0;${isAchieved ? 'cursor:pointer;' : 'opacity:0.6;cursor:not-allowed;'}`;
            modal.innerHTML = `
                <div class="modal-header" style="margin-bottom:16px;">
                    <h3>💪 強度を選択 (${esc(title)})</h3>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    ${opts.map((o, idx) => `
                        <button data-idx="${idx}" style="${btnCss(current===Number(o.mult))}">${esc(o.label)} (×${Number(o.mult).toFixed(1)})</button>
                    `).join('')}
                </div>
                <div class="modal-footer" style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end;">
                    <button class="button secondary" id="intensity-cancel">閉じる</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            if (isAchieved) {
                modal.querySelectorAll('button[data-idx]').forEach(btn => {
                    btn.onclick = () => {
                        const idx = Number(btn.getAttribute('data-idx'));
                        const mult = Number(opts[idx].mult);
                        hyp.intensity[dateKey] = mult;
                        const data = loadData();
                        const i = data.currentHypotheses.findIndex(h => h.id === hyp.id);
                        if (i !== -1) data.currentHypotheses[i] = hyp;
                        saveData(data);
                        document.body.removeChild(overlay);
                        updateCalendar();
                        updateProgress();
                    };
                });
            } else {
                const info = document.createElement('div');
                info.style.cssText = 'margin-top:12px;color:#94a3b8;font-size:12px;';
                info.textContent = '未達成日の強度は変更できません。先に達成を記録してください。';
                modal.appendChild(info);
            }
            document.getElementById('intensity-cancel').onclick = () => {
                document.body.removeChild(overlay);
            };
        }

        // 強度選択モーダルを表示（新規達成時）
        function showIntensitySelectionModal(dateKey, dayCell) {
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '400px';
            
            const dateObj = new Date(dateKey);
            const dateStr = dateObj.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>💪 強度を選択</h3>
                    <p>${dateStr}の習慣達成</p>
                </div>
                <div style="display: flex; gap: 10px; margin: 20px 0;">
                    <button class="intensity-btn" data-intensity="0.8" style="flex: 1; padding: 15px; border-radius: 10px; border: 2px solid var(--surface-light); background: var(--surface); color: var(--text-primary); cursor: pointer;">
                        <div style="font-size: 20px;">🟢</div>
                        <div style="margin-top: 5px;">軽め</div>
                        <div style="font-size: 18px; font-weight: bold;">1pt</div>
                    </button>
                    <button class="intensity-btn" data-intensity="1.0" style="flex: 1; padding: 15px; border-radius: 10px; border: 2px solid var(--primary); background: var(--surface); color: var(--text-primary); cursor: pointer;">
                        <div style="font-size: 20px;">🟡</div>
                        <div style="margin-top: 5px;">基本</div>
                        <div style="font-size: 18px; font-weight: bold;">2pt</div>
                    </button>
                    <button class="intensity-btn" data-intensity="1.2" style="flex: 1; padding: 15px; border-radius: 10px; border: 2px solid var(--surface-light); background: var(--surface); color: var(--text-primary); cursor: pointer;">
                        <div style="font-size: 20px;">🔴</div>
                        <div style="margin-top: 5px;">高強度</div>
                        <div style="font-size: 18px; font-weight: bold;">3pt</div>
                    </button>
                </div>
                <div style="margin: 20px 0; border-top: 1px solid var(--border); padding-top: 20px;">
                    <button id="fail-btn" style="width: 100%; padding: 15px; border-radius: 10px; border: 2px solid #ef4444; background: rgba(239, 68, 68, 0.1); color: #ef4444; cursor: pointer; font-weight: bold;">
                        <div style="font-size: 20px;">❌</div>
                        <div style="margin-top: 5px;">未達成として記録</div>
                        <div style="font-size: 18px; font-weight: bold;">-5pt</div>
                    </button>
                </div>
                <div class="modal-footer">
                    <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // 強度ボタンのクリック処理
            modal.querySelectorAll('.intensity-btn').forEach(btn => {
                btn.onclick = () => {
                    const intensity = parseFloat(btn.dataset.intensity);
                    applyAchievementWithIntensity(dateKey, dayCell, intensity);
                    overlay.remove();
                };
            });
            
            // 未達成ボタンのクリック処理
            const failBtn = modal.querySelector('#fail-btn');
            if (failBtn) {
                failBtn.onclick = () => {
                    applyFailure(dateKey, dayCell);
                    overlay.remove();
                };
            }
            
            // オーバーレイクリックで閉じる
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                }
            };
        }
        
        // 未達成として記録（-5ポイントのペナルティ）
        function applyFailure(dateKey, dayCell) {
            // 未達成フラグを保存
            if (!window.currentHypothesis.failures) {
                window.currentHypothesis.failures = {};
            }
            window.currentHypothesis.failures[dateKey] = true;
            
            // 見た目を更新（特別なスタイルで表示）
            dayCell.classList.remove('not-achieved');
            dayCell.classList.remove('achieved');
            dayCell.classList.add('failed');
            dayCell.style.background = 'rgba(239, 68, 68, 0.2)';
            dayCell.style.border = '2px solid #ef4444';
            
            // -5ポイントのペナルティを適用
            const data = loadData();
            const penaltyAmount = 5;
            
            // ポイント減算
            data.pointSystem.currentPoints = Math.max(0, data.pointSystem.currentPoints - penaltyAmount);
            
            // トランザクション記録
            data.pointSystem.transactions.unshift({
                timestamp: new Date().toISOString(),
                type: 'penalty',
                amount: -penaltyAmount,
                source: 'failure',
                description: `${window.currentHypothesis.title} 未達成`,
                habitId: window.currentHypothesis.id,
                dateKey: dateKey
            });
            
            // トランザクション履歴を制限
            if (data.pointSystem.transactions.length > 100) {
                data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100);
            }
            
            // 習慣データを保存
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index].failures = window.currentHypothesis.failures;
            }
            
            saveData(data);
            
            // UI更新
            updatePointDisplay();
            updateProgress();
            updateCalendar();
            try { updateCurrentHypothesisList(); } catch(_) {}
            
            // 通知を表示
            showNotification(`❌ ${window.currentHypothesis.title} 未達成\n-${penaltyAmount}pt`, 'error', 3);
        }
        
        // 強度を適用して達成状態にする
        function applyAchievementWithIntensity(dateKey, dayCell, intensityValue) {
            // 強度を保存
            if (!window.currentHypothesis.intensity) {
                window.currentHypothesis.intensity = {};
            }
            window.currentHypothesis.intensity[dateKey] = intensityValue;
            
            // 達成状態にする
            if (!window.currentHypothesis.achievements) {
                window.currentHypothesis.achievements = {};
            }
            window.currentHypothesis.achievements[dateKey] = true;
            dayCell.classList.remove('not-achieved');
            dayCell.classList.add('achieved');
            
            // データを保存（カード取得チェック前に確実に保存）
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                // カード取得履歴が存在しない場合は初期化
                if (!data.currentHypotheses[index].cardAcquisitionHistory) {
                    data.currentHypotheses[index].cardAcquisitionHistory = {
                        sevenDays: [],
                        weeklyComplete: [],
                        completion: false
                    };
                }
                
                data.currentHypotheses[index].achievements = window.currentHypothesis.achievements;
                data.currentHypotheses[index].intensity = window.currentHypothesis.intensity;
                saveData(data);
                
                }
            
            // カード取得チェック（達成時）
            checkCardAcquisitionOnAchievement(dateKey);
            
            // ポイント獲得処理
            // 強度に応じてポイントを設定（0.8→1pt、1.0→2pt、1.2→3pt）
            let actualPoints = 2; // デフォルトは基本の2pt
            if (intensityValue === 0.8) {
                actualPoints = 1; // 軽め
            } else if (intensityValue === 1.0) {
                actualPoints = 2; // 基本
            } else if (intensityValue === 1.2) {
                actualPoints = 3; // 高強度
            }
            
            // 連続日数を計算
            const streakDays = calculateCurrentStreak(window.currentHypothesis);
            let multiplier = calculateStreakMultiplier(streakDays);
            // ストリーク倍率ブースト（カード）: ボーナス部分を2倍などに拡張
            try {
                const data = loadData();
                const now = new Date();
                if (data.cards && Array.isArray(data.cards.activeEffects)) {
                    const boost = data.cards.activeEffects.find(e => e && e.type === 'streak_multiplier_boost' && e.startDate && e.endDate && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                    if (boost && boost.multiplier && Number(boost.multiplier) > 1) {
                        const base = 1;
                        const bonus = multiplier - 1;
                        multiplier = base + bonus * Number(boost.multiplier);
                    }
                }
            } catch(_) {}
            
            // ポイント付与（強度を考慮した実際のポイント）
            const basePoints = actualPoints;
            const bonusPoints = Math.round(actualPoints * (multiplier - 1));
            const credited = earnPoints(
                actualPoints,
                'habit',
                `${window.currentHypothesis.title} 達成`,
                multiplier,
                window.currentHypothesis.category || null,
                window.currentHypothesis.id,
                { dateKey }
            );
            
            // カテゴリーポイントも付与
            if (window.currentHypothesis.category && typeof window.StatusManager !== 'undefined' && window.StatusManager.addCategoryPoints) {
                const categoryPoints = actualPoints;
                const levelUps = window.StatusManager.addCategoryPoints(window.currentHypothesis.category, categoryPoints);
                console.log(`カテゴリー${window.currentHypothesis.category}に${categoryPoints}pt追加`);
                
                // カテゴリーレベルアップ通知
                if (levelUps && levelUps.length > 0) {
                    levelUps.forEach(lu => {
                        showNotification(`🎉 ${lu.categoryName} Lv.${lu.level}！\n「${lu.title}」`, 'success');
                    });
                }
            }
            // 当日付の実際の付与ポイントを記録（取り消し時に正確に減算するため）
            if (!window.currentHypothesis.pointsByDate) window.currentHypothesis.pointsByDate = {};
            window.currentHypothesis.pointsByDate[dateKey] = credited;
            
            // 基本の達成通知（優先度2）
            showNotification(`✅ ${window.currentHypothesis.title} 達成！\n+${basePoints}pt`, 'success', 2);
            
            // 連続達成ボーナスの表示（優先度5）
            if (multiplier > 1.0) {
                let streakMessage = '';
                if (streakDays >= 21) {
                    streakMessage = `🌟 21日以上連続達成！\nボーナス+${bonusPoints}pt (×2.0)`;
                } else if (streakDays >= 14) {
                    streakMessage = `⭐ 14日連続達成！\nボーナス+${bonusPoints}pt (×1.7)`;
                } else if (streakDays >= 7) {
                    streakMessage = `🔥 7日連続達成！\nボーナス+${bonusPoints}pt (×1.5)`;
                } else if (streakDays >= 3) {
                    streakMessage = `✨ 3日連続達成！\nボーナス+${bonusPoints}pt (×1.2)`;
                }
                if (streakMessage) {
                    showNotification(streakMessage, 'success', 5);
                }
            }
            
            // 同日の他の習慣達成をチェックしてコンボボーナス
            checkAndAwardComboBonus(dateKey);
            
            // 達成アニメーションを表示
            showAchievementAnimation();
            
            // データを保存
            const saveData2 = loadData();
            const index2 = saveData2.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index2 !== -1) {
                saveData2.currentHypotheses[index2] = window.currentHypothesis;
                saveData(saveData2);
            }
            
            updateProgress();
            updateCalendar(); // カレンダーを再描画して週の状況を更新
            // カード効果（残回数など）の表示も更新
            try { updateActiveEffectsDisplay(); } catch(_) {}
            try { updateCurrentHypothesisList(); } catch(_) {}
            
            // バッジ獲得チェック
            checkAndAwardBadges();
            
            // リセットリスクのチェック（翌日に実行）
            if (window.currentHypothesis.resetRisk) {
                setTimeout(() => checkResetRisk(), 100);
            }
            
            // ステージアップチェック
            checkStageProgress();
        }
        
        // ステータス選択モーダル（達成 / 未達成）
        function openDayStatusPicker(dateKey) {
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(4px)';
            overlay.style.zIndex = '9999';
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '360px';
            modal.style.padding = '20px';
            modal.innerHTML = `
                <div class="modal-header" style="margin-bottom: 12px;">
                    <h3 style="font-size: 18px;">この日の状態を選択</h3>
                </div>
                <div style="display: grid; gap: 8px;">
                    <button class="btn" id="btn-achieved" style="width: 100%;">✅ 達成（+1pt）</button>
                    <button class="btn btn-secondary" id="btn-unachieved" style="width: 100%;">❌ 未達成（0pt）</button>
                    <button class="btn btn-secondary" id="btn-clear" style="width: 100%; background: var(--surface); color: var(--text-secondary);">未入力に戻す</button>
                    <button class="btn btn-secondary" id="btn-cancel" style="width: 100%; background: var(--surface-light); color: var(--text-secondary);">キャンセル</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            const close = () => { try { overlay.remove(); } catch(_) {} };
            document.getElementById('btn-achieved').onclick = () => { setDayStatus(dateKey, true); close(); };
            document.getElementById('btn-unachieved').onclick = () => { setDayStatus(dateKey, false); close(); };
            document.getElementById('btn-clear').onclick = () => { setDayStatus(dateKey, null); close(); };
            document.getElementById('btn-cancel').onclick = close;
            overlay.onclick = (e) => { if (e.target === overlay) close(); };
        }

        // 日の達成状態を設定（達成=+1pt / 未達成=0pt）
        function setDayStatus(dateKey, makeAchieved) {
            const data = loadData();
            const idx = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (idx === -1) return;
            const hyp = data.currentHypotheses[idx];
            hyp.achievements = hyp.achievements || {};
            hyp.pointsByDate = hyp.pointsByDate || {};
            hyp.failures = hyp.failures || {};
            const wasAchieved = !!hyp.achievements[dateKey];
            const wasFailed = !!hyp.failures[dateKey];
            
            if (makeAchieved === true && !wasAchieved) {
                // 達成にする → +1pt
                hyp.achievements[dateKey] = true;
                hyp.pointsByDate[dateKey] = 1;
                if (wasFailed) delete hyp.failures[dateKey];
                
                data.pointSystem.currentPoints += 1;
                data.pointSystem.lifetimeEarned = (data.pointSystem.lifetimeEarned || 0) + 1;
                data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
                const lvl = calculateLevel(data.pointSystem.lifetimeEarned);
                data.pointSystem.currentLevel = lvl.level;
                
                // カテゴリーポイントも加算
                if (hyp.category && window.StatusManager && window.StatusManager.addCategoryPoints) {
                    const categoryLevelUps = window.StatusManager.addCategoryPoints(hyp.category, 1);
                    // カテゴリーレベルアップ演出
                    if (categoryLevelUps && categoryLevelUps.length > 0) {
                        setTimeout(() => {
                            if (typeof showCategoryLevelUpQueue === 'function') {
                                showCategoryLevelUpQueue(categoryLevelUps);
                            } else if (typeof window.showCategoryLevelUpQueue === 'function') {
                                window.showCategoryLevelUpQueue(categoryLevelUps);
                            }
                        }, 500);
                    }
                }
                
                data.pointSystem.transactions.unshift({
                    timestamp: new Date().toISOString(),
                    type: 'earn',
                    amount: 1,
                    finalAmount: 1,
                    source: 'habit_simple',
                    description: `${hyp.title} 達成 (+1pt)`,
                    habitId: hyp.id,
                    dateKey
                });
            } else if (makeAchieved === false) {
                // 未達成として明示（0pt）。達成済みなら取り消し(-1pt)。
                if (wasAchieved) {
                    delete hyp.achievements[dateKey];
                    if (hyp.pointsByDate[dateKey]) {
                        data.pointSystem.currentPoints = Math.max(0, data.pointSystem.currentPoints - 1);
                        data.pointSystem.lifetimeEarned = Math.max(0, (data.pointSystem.lifetimeEarned || 0) - 1);
                        data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
                        const lvl = calculateLevel(data.pointSystem.lifetimeEarned);
                        data.pointSystem.currentLevel = lvl.level;
                        data.pointSystem.transactions.unshift({
                            timestamp: new Date().toISOString(),
                            type: 'spend',
                            amount: 1,
                            source: 'habit_simple_cancel',
                            description: `${hyp.title} 取り消し (-1pt)`,
                            habitId: hyp.id,
                            dateKey
                        });
                        delete hyp.pointsByDate[dateKey];
                        
                        // カテゴリーポイントも減算
                        if (hyp.category && window.StatusManager && window.StatusManager.addCategoryPoints) {
                            window.StatusManager.addCategoryPoints(hyp.category, -1);
                        }
                    }
                }
                hyp.failures[dateKey] = true; // 明示的な未達成
            } else if (makeAchieved === null) {
                // 未入力に戻す。達成/未達成の記録を消す。達成済みだった場合は-1ptで取り消し。
                if (wasAchieved && hyp.pointsByDate[dateKey]) {
                    data.pointSystem.currentPoints = Math.max(0, data.pointSystem.currentPoints - 1);
                    data.pointSystem.lifetimeEarned = Math.max(0, (data.pointSystem.lifetimeEarned || 0) - 1);
                    data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
                    const lvl = calculateLevel(data.pointSystem.lifetimeEarned);
                    data.pointSystem.currentLevel = lvl.level;
                    data.pointSystem.transactions.unshift({
                        timestamp: new Date().toISOString(),
                        type: 'spend',
                        amount: 1,
                        source: 'habit_simple_cancel',
                        description: `${hyp.title} 取り消し (-1pt)`,
                        habitId: hyp.id,
                        dateKey
                    });
                    
                    // カテゴリーポイントも減算
                    if (hyp.category && window.StatusManager && window.StatusManager.addCategoryPoints) {
                        window.StatusManager.addCategoryPoints(hyp.category, -1);
                    }
                }
                delete hyp.pointsByDate[dateKey];
                delete hyp.achievements[dateKey];
                delete hyp.failures[dateKey];
            } else {
                // 指定状態と現状態が同じ → なにもしない
                return;
            }
            
            // 保存と反映
            data.currentHypotheses[idx] = hyp;
            saveData(data);
            window.currentHypothesis = hyp;
            updatePointDisplay();
            updateProgress();
            updateCalendar();
        }

        // ホーム画面用：今日の状態を対象の習慣に対してワンタップで循環
        function cycleTodayStatusForHabit(habitId) {
            try {
                const data = loadData();
                const idx = data.currentHypotheses.findIndex(h => String(h.id) === String(habitId));
                if (idx === -1) return;
                const hyp = data.currentHypotheses[idx];
                const todayKey = getActivityDateKey();
                const wasAchieved = !!(hyp.achievements && hyp.achievements[todayKey]);
                const wasFailed = !!(hyp.failures && hyp.failures[todayKey]);

                // setDayStatus は window.currentHypothesis を参照するため一時的に設定
                const prev = window.currentHypothesis;
                window.currentHypothesis = hyp;
                if (wasAchieved) {
                    setDayStatus(todayKey, false); // 達成 → 未達成（-1pt）
                } else if (wasFailed) {
                    setDayStatus(todayKey, null);  // 未達成 → 未入力
                } else {
                    setDayStatus(todayKey, true);  // 未入力 → 達成（+1pt）
                }
                // 画面を再描画
                try { updateCurrentHypothesisList(); } catch(_) {}
                try { updatePointDisplay(); } catch(_) {}
                // 元に戻す
                window.currentHypothesis = prev;
            } catch (e) { /* no-op */ }
        }
        window.cycleTodayStatusForHabit = cycleTodayStatusForHabit;

        // 日付セルをワンタップで「達成 → 未達成 → 未入力 → 達成」と循環
        function cycleDayStatus(dateKey) {
            const data = loadData();
            const idx = data.currentHypotheses.findIndex(h => h.id === (window.currentHypothesis && window.currentHypothesis.id));
            if (idx === -1) return;
            const hyp = data.currentHypotheses[idx];
            const wasAchieved = !!((hyp.achievements || {})[dateKey]);
            const wasFailed = !!((hyp.failures || {})[dateKey]);

            if (wasAchieved) {
                // 達成 → 未達成（ポイント減算を含む）
                setDayStatus(dateKey, false);
            } else if (wasFailed) {
                // 未達成 → 未入力
                setDayStatus(dateKey, null);
            } else {
                // 未入力 → 達成（ポイント加算）
                setDayStatus(dateKey, true);
            }
        }
        window.cycleDayStatus = cycleDayStatus;

        // 強度関連UIは廃止（安全のためスタブ化）
        function showIntensitySelectionModal(dateKey, dayCell) {
            try { openDayStatusPicker(dateKey); } catch(_) {}
        }
        function openIntensityPicker(dateKey) { /* no-op: 強度選択は廃止 */ }
        function applyAchievementWithIntensity(dateKey, dayCell, _intensity) {
            try { openDayStatusPicker(dateKey); } catch(_) {}
        }
        
        // 週番号を取得する関数（グローバルに定義） - 検証開始日基準
        function getWeekNumber(date, startDate) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const start = new Date(startDate || window.currentHypothesis.startDate);
            start.setHours(0, 0, 0, 0);
            const days = Math.floor((d - start) / (24 * 60 * 60 * 1000));
            return Math.floor(days / 7) + 1;  // 1週目から開始
        }
        
        // リセットリスクのチェック
        function checkResetRisk() {
            if (!window.currentHypothesis || !window.currentHypothesis.resetRisk) return;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 過去3日間の達成状況をチェック
            let consecutiveFailures = 0;
            for (let i = 1; i <= 3; i++) {
                const checkDate = new Date(today);
                checkDate.setDate(checkDate.getDate() - i);
                const dateKey = dateKeyLocal(checkDate);
                
                // その日が習慣期間内かチェック
                const startDate = new Date(window.currentHypothesis.startDate);
                startDate.setHours(0, 0, 0, 0);
                
                const failures = window.currentHypothesis.failures || {};
                if (checkDate >= startDate && failures[dateKey]) {
                    consecutiveFailures++;
                } else {
                    break; // 達成していれば連続失敗ではない
                }
            }
            
            // 3日連続で未達成の場合、全ての達成をリセット
            if (consecutiveFailures >= 3) {
                window.currentHypothesis.achievements = {};
                
                // データを保存
                const data = loadData();
                const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
                if (index !== -1) {
                    data.currentHypotheses[index] = window.currentHypothesis;
                    saveData(data);
                }
                
                // エフェクトを表示
                showCardEffect('リセットリスク発動！', '3日連続未達成により、全ての達成がリセットされました', '#dc2626');
                
                // カレンダーと進捗を更新
                updateCalendar();
                updateProgress();
            }
        }

        // 達成アニメーション表示
        function showAchievementAnimation() {
            // 複数の絵文字を同時に表示
            const emojis = ['🎉', '✨', '🌟', '⭐', '🎊', '💫', '🏆', '🔥', '💪', '🚀', '🎯', '🥳', '👏', '💯'];
            const numberOfEmojis = 8;
            
            for (let i = 0; i < numberOfEmojis; i++) {
                setTimeout(() => {
                    const emoji = emojis[Math.floor(Math.random() * emojis.length)];
                    const animation = document.createElement('div');
                    animation.className = 'achievement-animation';
                    animation.textContent = emoji;
                    
                    // ランダムな位置から開始
                    const startX = Math.random() * window.innerWidth;
                    const startY = window.innerHeight / 2 + (Math.random() - 0.5) * 200;
                    
                    animation.style.left = startX + 'px';
                    animation.style.top = startY + 'px';
                    
                    // ランダムな方向に飛ばす
                    const angle = Math.random() * Math.PI * 2;
                    const distance = 200 + Math.random() * 300;
                    const endX = startX + Math.cos(angle) * distance;
                    const endY = startY + Math.sin(angle) * distance - 200; // 上方向に偏らせる
                    
                    animation.style.setProperty('--startX', startX + 'px');
                    animation.style.setProperty('--startY', startY + 'px');
                    animation.style.setProperty('--endX', endX + 'px');
                    animation.style.setProperty('--endY', endY + 'px');
                    
                    document.body.appendChild(animation);
                    
                    setTimeout(() => {
                        animation.remove();
                    }, 2000);
                }, i * 100); // 少しずつ遅らせて表示
            }
        }

        // 進捗を更新
        function updateProgress() {
            const startDate = new Date(window.currentHypothesis.startDate);
            const today = new Date();
            startDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);
            
            const timeDiff = today.getTime() - startDate.getTime();
            const daysPassed = window.currentHypothesis.isUnlimited
                ? Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1)
                : Math.min(Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1), window.currentHypothesis.totalDays);
            
            const achievedDays = Object.keys(window.currentHypothesis.achievements || {}).length;
            const rate = window.currentHypothesis.isUnlimited
                ? (daysPassed > 0 ? Math.round((achievedDays / daysPassed) * 100) : 0)
                : (window.currentHypothesis.totalDays > 0 ? Math.round((achievedDays / window.currentHypothesis.totalDays) * 100) : 0);
            
            document.getElementById('achievement-rate').textContent = `${Math.min(100, rate)}%`;
            document.getElementById('progress-fill').style.width = `${Math.min(100, rate)}%`;
            document.getElementById('achieved-days').textContent = `達成: ${achievedDays}日`;
            document.getElementById('remaining-days').textContent = window.currentHypothesis.isUnlimited
                ? '継続中'
                : `残り: ${window.currentHypothesis.totalDays - daysPassed}日`;
            
            // シンプル化: プログレスバー配色は固定
            const progressFill = document.getElementById('progress-fill');
            progressFill.style.background = 'var(--gradient-1)';

            // サプライズブーストは廃止（以前のランダム付与は削除）
            
            // アクティブな効果を表示
            const data = loadData();
            const activeEffectsDisplay = document.getElementById('active-effects-display');
            const activeEffectsList = document.getElementById('active-effects-list');
            
            activeEffectsList.innerHTML = '';
            let hasActiveEffects = false;
            
            // 達成ブースターのチェック
            if (data.cards && data.cards.activeEffects) {
                const achievementBooster = data.cards.activeEffects.find(effect => 
                    effect.cardId === 'achievement_booster' && 
                    (!effect.targetHypothesisId || effect.targetHypothesisId === window.currentHypothesis.id)
                );
                
                if (achievementBooster) {
                    hasActiveEffects = true;
                    const effectElement = document.createElement('div');
                    effectElement.style.cssText = 'background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #10b981;';
                    effectElement.textContent = '🚀 達成ブースター (+15%)';
                    activeEffectsList.appendChild(effectElement);
                }
            }

            // 追加の効果バッジ表示
            if (data.cards && data.cards.activeEffects) {
                const ae = data.cards.activeEffects;
                const todayKey = dateKeyLocal(new Date());
                const addBadge = (text, style) => { hasActiveEffects = true; const el = document.createElement('div'); el.style.cssText = style; el.textContent = text; activeEffectsList.appendChild(el); };
                // ポイント倍率効果（ハッピーアワー、ポイントジェム、アフタヌーンジェム）
                const pointMultiplier = ae.find(e => e.type === 'point_multiplier' && new Date(e.startDate) <= new Date() && new Date(e.endDate) >= new Date());
                if (pointMultiplier) {
                    const cardName = pointMultiplier.cardId === 'happy_hour' ? 'ハッピーアワー' : 
                                   pointMultiplier.cardId === 'afternoon_gem' ? 'アフタヌーンジェム' : 
                                   'ポイントジェム';
                    const icon = pointMultiplier.cardId === 'happy_hour' ? '⏰' : 
                               pointMultiplier.cardId === 'afternoon_gem' ? '☕' : 
                               '💎';
                    addBadge(`${icon} ${cardName} ×${pointMultiplier.multiplier}`, 'background: rgba(6,182,212,0.2); color:#06b6d4; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #06b6d4;');
                }
                if (ae.find(e => e.type === 'combo_multiplier')) {
                    addBadge('🧩 コンボ×2', 'background: rgba(34,197,94,0.2); color:#22c55e; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #22c55e;');
                }
                const catFest = ae.find(e => e.type === 'category_theme_boost');
                if (catFest) {
                    addBadge(`🎪 ${catFest.target}×${catFest.multiplier || 1.5}`, 'background: rgba(139,92,246,0.2); color:#8b5cf6; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #8b5cf6;');
                }
                // ハッピーアワーは point_multiplier として表示されるので削除
                // if (ae.find(e => e.type === 'time_window_bonus')) {
                //     addBadge('⏰ ハッピーアワー +10', 'background: rgba(6,182,212,0.2); color:#06b6d4; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #06b6d4;');
                // }
                if (ae.find(e => e.type === 'streak_multiplier_boost')) {
                    addBadge('🔥 ストリーク倍率×2', 'background: rgba(249,115,22,0.2); color:#f97316; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #f97316;');
                }
                // パワーブースト（パワーナップ由来）
                if (ae.find(e => e.type === 'power_boost' && new Date(e.startDate) <= new Date() && new Date(e.endDate) >= new Date())) {
                    addBadge('😴 パワーブースト +5', 'background: rgba(6,182,212,0.2); color:#06b6d4; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #06b6d4;');
                }
                const spark = ae.find(e => e.type === 'streak_spark' && e.dayKey === todayKey);
                if (spark) {
                    addBadge('🎆 スパークル +1', 'background: rgba(249,115,22,0.2); color:#f97316; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #f97316;');
                }
                if (ae.find(e => e.cardId === 'mystery_box' && e.dayKey === todayKey && !e.claimed)) {
                    addBadge('🎁 ミステリー待機中', 'background: rgba(245,158,11,0.2); color:#f59e0b; padding:4px 12px; border-radius:16px; font-size:12px; border:1px solid #f59e0b;');
                }
            }
            
            // ハードモードのチェック
            if (window.currentHypothesis.hardMode) {
                hasActiveEffects = true;
                const effectElement = document.createElement('div');
                effectElement.style.cssText = 'background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;';
                effectElement.textContent = '💀 ハードモード';
                activeEffectsList.appendChild(effectElement);
            }
            
            // 短期間縛りのチェック
            if (window.currentHypothesis.shortTermOnly) {
                hasActiveEffects = true;
                const effectElement = document.createElement('div');
                effectElement.style.cssText = 'background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;';
                effectElement.textContent = '⏱️ 短期間縛り';
                activeEffectsList.appendChild(effectElement);
            }
            
            // 達成率減少のチェック
            if (window.currentHypothesis.achievementDecrease) {
                hasActiveEffects = true;
                const effectElement = document.createElement('div');
                effectElement.style.cssText = 'background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;';
                effectElement.textContent = `📉 達成率減少 (-${window.currentHypothesis.achievementDecrease}%)`;
                activeEffectsList.appendChild(effectElement);
            }
            
            // リセットリスクのチェック
            if (window.currentHypothesis.resetRisk) {
                hasActiveEffects = true;
                const effectElement = document.createElement('div');
                effectElement.style.cssText = 'background: rgba(239, 68, 68, 0.2); color: #ef4444; padding: 4px 12px; border-radius: 16px; font-size: 12px; border: 1px solid #ef4444;';
                effectElement.textContent = '🔄 リセットリスク';
                activeEffectsList.appendChild(effectElement);
            }
            
            activeEffectsDisplay.style.display = hasActiveEffects ? 'block' : 'none';
            
            // 期間が終了したかチェック（最終日以降）
            // デバッグ（いつでも完了OK）がONなら常に完了報告ボタンを表示
            const appData = loadData();
            const debugAlways = !!(appData.meta && appData.meta.debugAlwaysComplete);
            if (
                (!window.currentHypothesis.isUnlimited && daysPassed >= window.currentHypothesis.totalDays && !window.currentHypothesis.completed)
                || (debugAlways && !window.currentHypothesis.completed)
            ) {
                document.getElementById('completion-report-section').style.display = 'block';
                document.getElementById('completion-options').style.display = 'none';
            } else {
                document.getElementById('completion-report-section').style.display = 'none';
                document.getElementById('completion-options').style.display = 'none';
            }

            // 進捗画面にストリーク表示を反映
            const streak = computeStreak(window.currentHypothesis);
            let streakEl = document.getElementById('streak-indicator');
            if (!streakEl) {
                streakEl = document.createElement('div');
                streakEl.id = 'streak-indicator';
                streakEl.style.cssText = 'margin-top:8px;color:#f59e0b;font-weight:700;';
                const stats = document.querySelector('#progress-view .stats');
                const container = stats || document.getElementById('progress-view');
                container.appendChild(streakEl);
            }
            streakEl.textContent = `🔥 連続達成日数: ${streak}日`;

            
            // カテゴリ変更パネルを表示
            renderCategoryPanel();
        }

        // カテゴリ変更パネルを表示する関数
        function renderCategoryPanel() {
            if (!window.currentHypothesis) return;
            const hyp = window.currentHypothesis;
            const data = loadData();
            
            // カテゴリマスターの初期化
            if (!data.categoryMaster) {
                data.categoryMaster = {
                    study: { name: '勉強', icon: '📚', color: '#3b82f6' },
                    exercise: { name: '運動', icon: '💪', color: '#ef4444' },
                    health: { name: '健康', icon: '🧘', color: '#10b981' },
                    work: { name: '仕事', icon: '💼', color: '#f59e0b' },
                    hobby: { name: '趣味', icon: '🎨', color: '#8b5cf6' },
                    other: { name: 'その他', icon: '📝', color: '#6b7280' }
                };
                saveData(data);
            }
            
            const categoryInfo = data.categoryMaster[hyp.category] || 
                                { name: 'その他', icon: '📝', color: '#6b7280' };
            
            let panel = document.getElementById('category-change-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'category-change-panel';
                panel.style.cssText = 'margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);';
                
                // カレンダーの後、強度パネルの前に挿入
                const parent = document.getElementById('progress-view');
                const intensityPanel = document.getElementById('intensity-panel');
                if (intensityPanel) {
                    parent.insertBefore(panel, intensityPanel);
                } else {
                    parent.appendChild(panel);
                }
            }
            
            panel.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <div style="font-weight:700;">🏷️ カテゴリ</div>
                        <div style="color: var(--text-secondary);font-size:12px;">習慣のカテゴリを変更できます</div>
                    </div>
                    <button class="btn btn-secondary" onclick="editHypothesisCategory()" style="padding:8px 16px;border-radius:10px;display:flex;align-items:center;gap:8px;">
                        <span style="font-size:20px;">${categoryInfo.icon}</span>
                        <span>${categoryInfo.name}</span>
                        <span>変更</span>
                    </button>
                </div>
            `;
        }

        // 強度（Intensity）パネル（各習慣ごとにラベル3種を編集可能）
        function renderIntensityPanel() {
            // 今日の強度編集UIは廃止。既存のパネルがあれば削除して何もしない。
            try {
                const panel = document.getElementById('intensity-panel');
                if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
            } catch(_) {}
            return;
            if (!window.currentHypothesis) return;
            const hyp = window.currentHypothesis;
            hyp.intensity = hyp.intensity || {};
            const todayKey = dateKeyLocal(new Date());
            const selected = Number(hyp.intensity[todayKey] ?? 1.0);
            const todayAchieved = !!(hyp.achievements || {})[todayKey];
            // 強度オプション（ラベル＋倍率）を習慣ごとに保持
            if (!hyp.intensityOptions || !Array.isArray(hyp.intensityOptions) || hyp.intensityOptions.length !== 3) {
                hyp.intensityOptions = [
                    { label: '軽め', mult: 0.8 },
                    { label: '基本', mult: 1.0 },
                    { label: '高強度', mult: 1.2 },
                ];
                const data0 = loadData();
                const idx0 = data0.currentHypotheses.findIndex(h => h.id === hyp.id);
                if (idx0 !== -1) { data0.currentHypotheses[idx0] = hyp; saveData(data0); }
            }

            let panel = document.getElementById('intensity-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'intensity-panel';
                panel.style.cssText = 'margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface);';
                const parent = document.getElementById('progress-view');
                parent.appendChild(panel);
            }

            // ボタンを無効化（選択できないように）、選択状態も表示しない
            const btnStyle = (active) => `
                padding:8px 12px;border-radius:10px;border:1px solid var(--border);
                background:transparent;color:var(--text-secondary);
                cursor:not-allowed;opacity:0.5;`

            const opt0 = hyp.intensityOptions[0];
            const opt1 = hyp.intensityOptions[1];
            const opt2 = hyp.intensityOptions[2];
            const label0 = (typeof escapeHTML === 'function') ? escapeHTML(opt0.label) : opt0.label;
            const label1 = (typeof escapeHTML === 'function') ? escapeHTML(opt1.label) : opt1.label;
            const label2 = (typeof escapeHTML === 'function') ? escapeHTML(opt2.label) : opt2.label;

            panel.innerHTML = `
                <div style=\"display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;\">
                    <div style=\"display:flex;flex-direction:column;gap:4px;\">
                        <div style=\"font-weight:700;\">💪 今日の強度</div>
                        <div style=\"color: var(--text-secondary);font-size:12px;\">各習慣ごとに3つの強度ラベルを編集できます</div>
                    </div>
                    <div style=\"display:flex;gap:8px;align-items:center;\">
                        <button id=\"intensity-opt-0\" style=\"${btnStyle(selected===opt0.mult)}\">${label0} (×${opt0.mult})</button>
                        <button id=\"intensity-opt-1\" style=\"${btnStyle(selected===opt1.mult)}\">${label1} (×${opt1.mult})</button>
                        <button id=\"intensity-opt-2\" style=\"${btnStyle(selected===opt2.mult)}\">${label2} (×${opt2.mult})</button>
                        <button id=\"intensity-edit\" class=\"btn btn-secondary\" style=\"margin-left:8px;padding:8px 12px;\">編集</button>
                    </div>
                </div>
                <div style=\"margin-top:8px;color:#94a3b8;font-size:12px;\">
                    達成日に設定した強度倍率を重みとして適用し、表示達成率は全日数を分母に計算します。
                </div>
                
                <!-- 休眠ボタン -->
                <div style=\"margin-top:16px; padding-top:16px; border-top:1px solid var(--border);\">
                    <button onclick=\"toggleSleepMode()\" class=\"btn\" style=\"width:100%; padding:12px; font-size:14px; background: ${hyp.isSleeping ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)'}; color: white;\">
                        ${hyp.isSleeping ? '🌅 習慣を再開する' : '😴 習慣を休眠させる'}
                    </button>
                    ${hyp.isSleeping ? `
                        <div style=\"margin-top:8px; padding:8px; background: rgba(148, 163, 184, 0.1); border-radius:8px; font-size:12px; color: var(--text-secondary);\">
                            📌 休眠開始: ${new Date(hyp.sleepStartDate).toLocaleDateString('ja-JP')}
                        </div>
                    ` : `
                        <div style=\"margin-top:8px; font-size:11px; color: var(--text-secondary);\">
                            ※ 休眠中は達成率の計算から除外され、ストリークは保持されます
                        </div>
                    `}
                </div>
            `;

            const set = (m) => {
                hyp.intensity[todayKey] = m;
                const data = loadData();
                const idx = data.currentHypotheses.findIndex(h => h.id === hyp.id);
                if (idx !== -1) data.currentHypotheses[idx] = hyp;
                saveData(data);
                renderIntensityPanel();
                updateProgress();
            };
            const b0 = document.getElementById('intensity-opt-0');
            const b1 = document.getElementById('intensity-opt-1');
            const b2 = document.getElementById('intensity-opt-2');
            const be = document.getElementById('intensity-edit');
            if (be) be.onclick = () => editIntensityOptions();

            // 強度選択ボタンを無効化（カレンダーから選択するため）
            [b0, b1, b2].forEach(btn => {
                if (btn) {
                    btn.disabled = true;
                    btn.style.cursor = 'not-allowed';
                    btn.title = '強度の選択はカレンダーから行ってください';
                }
            });
            // クリックイベントも無効化
            if (b0) b0.onclick = (e) => { e.preventDefault(); showNotification('強度の選択はカレンダーの日付をクリックして行ってください', 'info'); };
            if (b1) b1.onclick = (e) => { e.preventDefault(); showNotification('強度の選択はカレンダーの日付をクリックして行ってください', 'info'); };
            if (b2) b2.onclick = (e) => { e.preventDefault(); showNotification('強度の選択はカレンダーの日付をクリックして行ってください', 'info'); };
        }

        // 強度ラベル/倍率の編集（シンプルなプロンプトUI）
        // カテゴリマスターを編集する関数（固定カテゴリー・レベル表示版）
        function editCategoryMaster() {
            const data = loadData();
            // 固定カテゴリーを設定
            data.categoryMaster = {
                morning: { name: '朝活', icon: '🌅', color: '#fbbf24' },
                english: { name: '英語', icon: '🌍', color: '#60a5fa' },
                life: { name: '人生', icon: '🎯', color: '#a78bfa' },
                family: { name: '妻と家庭', icon: '❤️', color: '#f87171' },
                health: { name: '健康資産', icon: '💪', color: '#34d399' },
                knowledge: { name: '博識', icon: '📚', color: '#fde047' },
                exercise: { name: '運動', icon: '🏃', color: '#fb923c' },
                other: { name: 'その他', icon: '📝', color: '#6b7280' }
            };
            saveData(data);
            
            // カテゴリーレベルを取得
            const categoryLevels = window.StatusManager ? window.StatusManager.loadCategoryLevels() : {};
            
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '600px';
            modal.style.padding = '20px';
            modal.style.maxHeight = '80vh';
            modal.style.overflowY = 'auto';
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>📊 カテゴリーレベル状況</h3>
                    <p>各カテゴリーのレベルと称号</p>
                </div>
                
                <div style="margin: 20px 0;">
                    ${Object.entries(data.categoryMaster).filter(([key]) => key !== 'other').map(([key, cat]) => {
                        const catLevel = categoryLevels[key] || { level: 1, points: 0 };
                        const catTitle = window.StatusManager ? window.StatusManager.getCategoryTitle(key, catLevel.level) : '';
                        const nextThreshold = window.StatusManager && window.StatusManager.LEVEL_THRESHOLDS ? 
                            window.StatusManager.LEVEL_THRESHOLDS[catLevel.level] || 10 : 10;
                        return `
                            <div style="margin-bottom: 16px; padding: 12px; background: rgba(30, 41, 59, 0.5); border-radius: 8px; border: 1px solid ${cat.color}33;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                    <div style="display: flex; align-items: center; gap: 8px;">
                                        <span style="font-size: 24px;">${cat.icon}</span>
                                        <strong style="color: ${cat.color};">${cat.name}</strong>
                                    </div>
                                    <div style="text-align: right;">
                                        <div style="font-size: 14px; font-weight: bold; color: ${cat.color};">Lv.${catLevel.level}</div>
                                        <div style="font-size: 11px; color: var(--text-secondary);">${catLevel.points}/${nextThreshold}pt</div>
                                    </div>
                                </div>
                                
                                <div style="margin: 8px 0;">
                                    <div style="font-size: 13px; color: var(--text-primary); font-weight: 500;">${catTitle}</div>
                                    <div style="margin-top: 8px; background: var(--surface); border-radius: 4px; overflow: hidden; height: 6px;">
                                        <div style="background: ${cat.color}; height: 100%; width: ${Math.min(100, (catLevel.points / nextThreshold) * 100)}%; transition: width 0.3s;"></div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <div style="margin-top: 16px; padding: 12px; background: rgba(96, 165, 250, 0.1); border-radius: 8px; border: 1px solid rgba(96, 165, 250, 0.3);">
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        💡 カテゴリーを選んで習慣を実行すると、そのカテゴリーのレベルが上がります。
                    </div>
                </div>
                
                <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="button primary" id="cat-close">閉じる</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // 閉じるボタン
            document.getElementById('cat-close').onclick = () => {
                overlay.remove();
                updateCategoryDropdowns();  // ドロップダウンを更新
            };
        }
        
        // カテゴリマスターを初期化（固定カテゴリー版）
        function initializeCategoryMaster() {
            const data = loadData();
            // 常に固定カテゴリーを設定
            data.categoryMaster = {
                morning: { name: '朝活', icon: '🌅', color: '#fbbf24' },
                english: { name: '英語', icon: '🌍', color: '#60a5fa' },
                life: { name: '人生', icon: '🎯', color: '#a78bfa' },
                family: { name: '妻と家庭', icon: '❤️', color: '#f87171' },
                health: { name: '健康資産', icon: '💪', color: '#34d399' },
                knowledge: { name: '博識', icon: '📚', color: '#fde047' },
                exercise: { name: '運動', icon: '🏃', color: '#fb923c' },
                other: { name: 'その他', icon: '📝', color: '#6b7280' }
            };
            saveData(data);
            return data.categoryMaster;
        }
        
        // カテゴリドロップダウンを更新
        function updateCategoryDropdowns() {
            try {
                const categoryMaster = initializeCategoryMaster();
                
                // ホーム画面のフィルター
                const filterSelect = document.getElementById('category-filter');
                if (filterSelect) {
                    const currentValue = filterSelect.value || localStorage.getItem('selectedCategory') || 'all';
                    filterSelect.innerHTML = '<option value="all">📂 全て表示</option>';
                    Object.entries(categoryMaster).forEach(([key, cat]) => {
                        const option = document.createElement('option');
                        option.value = key;
                        option.textContent = `${cat.icon} ${cat.name}`;
                        filterSelect.appendChild(option);
                    });
                    filterSelect.value = currentValue;
                }
                
                // 新規立案画面のカテゴリ選択
                const populate = (selectEl) => {
                    if (!selectEl) return;
                    const currentValue = selectEl.value || localStorage.getItem('selectedCategory') || 'other';
                    selectEl.innerHTML = '';
                    Object.entries(categoryMaster).forEach(([key, cat]) => {
                        const option = document.createElement('option');
                        option.value = key;
                        option.textContent = `${cat.icon} ${cat.name}`;
                        selectEl.appendChild(option);
                    });
                    const selectedCategory = localStorage.getItem('selectedCategory');
                    if (selectedCategory && selectedCategory !== 'all') {
                        selectEl.value = selectedCategory;
                    } else {
                        selectEl.value = currentValue;
                    }
                };
                populate(document.getElementById('hypothesis-category'));
                populate(document.getElementById('edit-habit-category'));
            } catch (e) {
                console.error('カテゴリドロップダウンの更新に失敗:', e);
            }
        }
        
        // 新しいカテゴリを追加
        function addNewCategory() {
            const data = loadData();
            const categoryMaster = data.categoryMaster || {};
            
            // 新しいカテゴリのIDを生成
            let newKey = 'custom_' + Date.now();
            
            // デフォルト値を設定
            categoryMaster[newKey] = {
                name: '新カテゴリ',
                icon: '✨',
                color: '#' + Math.floor(Math.random()*16777215).toString(16)
            };
            
            data.categoryMaster = categoryMaster;
            saveData(data);
            
            // モーダルを再表示
            const modal = document.querySelector('.skip-modal');
            if (modal) {
                modal.remove();
            }
            const overlay = document.querySelector('.overlay');
            if (overlay) {
                overlay.remove();
            }
            
            editCategoryMaster();
            showNotification('新しいカテゴリを追加しました', 'success');
        }

        // カテゴリを削除（既存の習慣は「その他」に移動）
        window.removeCategory = function(key) {
            const RESERVED = new Set(['other']);
            const data = loadData();
            if (!data.categoryMaster || !data.categoryMaster[key]) {
                showNotification('該当するカテゴリが見つかりません', 'error');
                return;
            }
            if (RESERVED.has(key)) {
                showNotification('このカテゴリは削除できません', 'error');
                return;
            }
            const name = data.categoryMaster[key].name || key;
            if (!confirm(`カテゴリ「${name}」を削除します。既存の習慣は「その他」に移動します。よろしいですか？`)) {
                return;
            }
            // 再割当て
            (data.currentHypotheses || []).forEach(h => { if (h.category === key) h.category = 'other'; });
            (data.completedHypotheses || []).forEach(h => { if (h.category === key) h.category = 'other'; });
            delete data.categoryMaster[key];
            saveData(data);
            try {
                if (window.currentHypothesis && window.currentHypothesis.category === key) {
                    window.currentHypothesis.category = 'other';
                }
            } catch(_) {}
            try {
                if (localStorage.getItem('selectedCategory') === key) {
                    localStorage.setItem('selectedCategory', 'all');
                    const filter = document.getElementById('category-filter');
                    if (filter) filter.value = 'all';
                }
            } catch(_) {}
            // モーダルを閉じて再描画
            const modal = document.querySelector('.skip-modal');
            const overlay = document.querySelector('.overlay');
            if (modal) modal.remove();
            if (overlay) overlay.remove();
            updateCategoryDropdowns();
            updateCurrentHypothesisList();
            renderCategoryPanel();
            editCategoryMaster();
            showNotification('カテゴリを削除しました', 'success');
        };
        
        // 新しいカテゴリを追加
        window.addNewCategory = function() {
            const categoryKey = prompt('カテゴリのID（英数字）を入力してください');
            if (!categoryKey || !/^[a-z0-9]+$/i.test(categoryKey)) {
                showNotification('カテゴリIDは英数字で入力してください', 'error');
                return;
            }
            
            const data = loadData();
            if (data.categoryMaster[categoryKey]) {
                showNotification('そのIDはすでに存在します', 'error');
                return;
            }
            
            data.categoryMaster[categoryKey] = {
                name: '新カテゴリ',
                icon: '✨',
                color: '#' + Math.floor(Math.random()*16777215).toString(16)
            };
            
            saveData(data);
            editCategoryMaster(); // モーダルを再表示
        }
        
        // 頻度タイプを変更する関数
        function editFrequencyType() {
            if (!window.currentHypothesis) return;
            
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '520px';
            modal.style.padding = '20px';
            
            const currentFreq = window.currentHypothesis.frequency || { type: 'daily' };
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🔄 頻度タイプの変更</h3>
                    <p>習慣の実施頻度を変更します</p>
                </div>
                
                <div class="form-group" style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 12px; font-weight: 600;">頻度タイプ</label>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <label style="display: flex; align-items: center; padding: 12px; background: rgba(30, 41, 59, 0.5); border: 2px solid ${currentFreq.type === 'daily' ? '#10b981' : 'var(--border)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="freq-type" value="daily" ${currentFreq.type === 'daily' ? 'checked' : ''} style="margin-right: 12px;">
                            <div>
                                <div style="font-weight: 600;">☀️ 毎日実施</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">毎日習慣を実施します</div>
                            </div>
                        </label>
                        
                        <label style="display: flex; align-items: center; padding: 12px; background: rgba(30, 41, 59, 0.5); border: 2px solid ${currentFreq.type === 'weekly' ? '#10b981' : 'var(--border)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="freq-type" value="weekly" ${currentFreq.type === 'weekly' ? 'checked' : ''} style="margin-right: 12px;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600;">📅 週N回実施</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">週に指定回数だけ実施します</div>
                                <div id="weekly-count-container" style="margin-top: 8px; display: ${currentFreq.type === 'weekly' ? 'block' : 'none'};">
                                    <label style="font-size: 12px;">週に<input type="number" id="weekly-count" min="1" max="7" value="${currentFreq.count || 3}" style="width: 50px; margin: 0 4px; padding: 4px; border-radius: 4px; border: 1px solid var(--border);"/>回</label>
                                </div>
                            </div>
                        </label>
                        
                        <label style="display: flex; align-items: center; padding: 12px; background: rgba(30, 41, 59, 0.5); border: 2px solid ${currentFreq.type === 'weekdays' ? '#10b981' : 'var(--border)'}; border-radius: 8px; cursor: pointer;">
                            <input type="radio" name="freq-type" value="weekdays" ${currentFreq.type === 'weekdays' ? 'checked' : ''} style="margin-right: 12px;">
                            <div style="flex: 1;">
                                <div style="font-weight: 600;">📆 曜日指定</div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">特定の曜日にのみ実施します</div>
                                <div id="weekdays-container" style="margin-top: 8px; display: ${currentFreq.type === 'weekdays' ? 'flex' : 'none'}; gap: 6px; flex-wrap: wrap;">
                                    ${['日', '月', '火', '水', '木', '金', '土'].map((day, i) => `
                                        <label style="display: flex; align-items: center; padding: 4px 8px; background: ${(currentFreq.weekdays || []).includes(i) ? 'rgba(16, 185, 129, 0.2)' : 'transparent'}; border: 1px solid ${(currentFreq.weekdays || []).includes(i) ? '#10b981' : 'var(--border)'}; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                            <input type="checkbox" name="weekday" value="${i}" ${(currentFreq.weekdays || []).includes(i) ? 'checked' : ''} style="margin-right: 4px;"/>
                                            ${day}
                                        </label>
                                    `).join('')}
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
                
                <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="button secondary" id="freq-cancel">キャンセル</button>
                    <button class="button primary" id="freq-save">保存</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // ラジオボタンの変更イベント
            modal.querySelectorAll('input[name="freq-type"]').forEach(radio => {
                radio.onchange = () => {
                    // すべてのボーダーをリセット
                    modal.querySelectorAll('label').forEach(label => {
                        if (label.querySelector('input[type="radio"]')) {
                            label.style.border = '2px solid var(--border)';
                        }
                    });
                    
                    // 選択されたボーダーをハイライト
                    radio.closest('label').style.border = '2px solid #10b981';
                    
                    // オプションの表示/非表示
                    document.getElementById('weekly-count-container').style.display = radio.value === 'weekly' ? 'block' : 'none';
                    document.getElementById('weekdays-container').style.display = radio.value === 'weekdays' ? 'flex' : 'none';
                };
            });
            
            // 曜日チェックボックスの変更イベント
            modal.querySelectorAll('input[name="weekday"]').forEach(checkbox => {
                checkbox.onchange = () => {
                    const label = checkbox.closest('label');
                    if (checkbox.checked) {
                        label.style.background = 'rgba(16, 185, 129, 0.2)';
                        label.style.border = '1px solid #10b981';
                    } else {
                        label.style.background = 'transparent';
                        label.style.border = '1px solid var(--border)';
                    }
                };
            });
            
            // キャンセルボタン
            document.getElementById('freq-cancel').onclick = () => {
                overlay.remove();
            };
            
            // 保存ボタン
            document.getElementById('freq-save').onclick = () => {
                const selectedType = modal.querySelector('input[name="freq-type"]:checked').value;
                
                let newFrequency = { type: selectedType };
                
                if (selectedType === 'weekly') {
                    const count = parseInt(document.getElementById('weekly-count').value);
                    if (count < 1 || count > 7) {
                        showNotification('週の回数は1〜7の間で指定してください', 'error');
                        return;
                    }
                    newFrequency.count = count;
                } else if (selectedType === 'weekdays') {
                    const checkedDays = Array.from(modal.querySelectorAll('input[name="weekday"]:checked')).map(cb => parseInt(cb.value));
                    if (checkedDays.length === 0) {
                        showNotification('少なくとも1つの曜日を選択してください', 'error');
                        return;
                    }
                    newFrequency.weekdays = checkedDays;
                }
                
                // データを更新
                window.currentHypothesis.frequency = newFrequency;
                const data = loadData();
                const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
                if (index !== -1) {
                    data.currentHypotheses[index].frequency = newFrequency;
                    saveData(data);
                }
                
                overlay.remove();
                showNotification('頻度タイプを変更しました', 'success');
                
                // 進捗画面を再表示
                window.showProgressView(window.currentHypothesis.id);
            };
        }
        
        // 習慣のカテゴリを変更
        function editHypothesisCategory() {
            if (!window.currentHypothesis) return;
            
            const data = loadData();
            if (!data.categoryMaster) {
                data.categoryMaster = {
                    study: { name: '勉強', icon: '📚', color: '#3b82f6' },
                    exercise: { name: '運動', icon: '💪', color: '#ef4444' },
                    health: { name: '健康', icon: '🧘', color: '#10b981' },
                    work: { name: '仕事', icon: '💼', color: '#f59e0b' },
                    hobby: { name: '趣味', icon: '🎨', color: '#8b5cf6' },
                    other: { name: 'その他', icon: '📝', color: '#6b7280' }
                };
            }
            
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            overlay.style.backdropFilter = 'blur(6px)';
            
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.maxWidth = '480px';
            modal.style.padding = '20px';
            
            const currentCategory = window.currentHypothesis.category || 'other';
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🏷️ カテゴリの変更</h3>
                    <p>この習慣のカテゴリを選択してください</p>
                </div>
                
                <div style="margin: 20px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                    ${Object.entries(data.categoryMaster).map(([key, cat]) => `
                        <label style="display: flex; align-items: center; padding: 12px; background: rgba(30, 41, 59, 0.5); border: 2px solid ${currentCategory === key ? cat.color : 'var(--border)'}; border-radius: 8px; cursor: pointer; transition: all 0.2s;">
                            <input type="radio" name="category" value="${key}" ${currentCategory === key ? 'checked' : ''} style="margin-right: 12px;">
                            <span style="font-size: 20px; margin-right: 8px;">${cat.icon}</span>
                            <span style="font-weight: 600;">${cat.name}</span>
                        </label>
                    `).join('')}
                </div>
                <div style="display:flex; justify-content:flex-end; margin-top: 4px;">
                    <button class="btn btn-secondary" onclick="try{ document.querySelector('.overlay')?.remove(); }catch(_){}; try{ editCategoryMaster(); }catch(_){}" style="padding:6px 10px; font-size:12px;">🗂 カテゴリ編集</button>
                </div>
                
                <div class="modal-footer" style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="button secondary" id="cat-change-cancel">キャンセル</button>
                    <button class="button primary" id="cat-change-save">変更</button>
                </div>
            `;
            
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // ラジオボタンの変更イベント
            modal.querySelectorAll('input[name="category"]').forEach(radio => {
                radio.onchange = () => {
                    modal.querySelectorAll('label').forEach(label => {
                        if (label.querySelector('input[type="radio"]')) {
                            const catKey = label.querySelector('input').value;
                            const catInfo = data.categoryMaster[catKey];
                            label.style.border = radio.value === catKey ? `2px solid ${catInfo.color}` : '2px solid var(--border)';
                        }
                    });
                };
            });
            
            // キャンセル
            document.getElementById('cat-change-cancel').onclick = () => overlay.remove();
            
            // 保存
            document.getElementById('cat-change-save').onclick = () => {
                const selectedCategory = modal.querySelector('input[name="category"]:checked').value;
                
                window.currentHypothesis.category = selectedCategory;
                const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
                if (index !== -1) {
                    data.currentHypotheses[index].category = selectedCategory;
                    saveData(data);
                }
                
                overlay.remove();
                showNotification('カテゴリを変更しました', 'success');
                // カテゴリパネルを更新
                renderCategoryPanel();
                // 進捗を更新
                updateProgress();
            };
        }
        
        function editIntensityOptions() {
            if (!window.currentHypothesis) return;
            const hyp = window.currentHypothesis;
            hyp.intensityOptions = hyp.intensityOptions || [
                { label: '軽め', mult: 0.8 },
                { label: '基本', mult: 1.0 },
                { label: '高強度', mult: 1.2 },
            ];
            const askLabel = (idx, placeholder) => {
                const v = prompt(`強度${idx+1}のラベル`, placeholder);
                return v == null ? null : (v || '').trim();
            };
            const askMult = (idx, placeholder) => {
                const v = prompt(`強度${idx+1}の倍率（0.1〜3.0）`, String(placeholder));
                if (v == null) return null;
                const num = parseFloat(v);
                if (!isFinite(num)) return null;
                const clamped = Math.max(0.1, Math.min(3.0, num));
                return Math.round(clamped * 10) / 10; // 小数1桁
            };

            const l0 = askLabel(0, hyp.intensityOptions[0].label); if (l0 == null) return;
            const m0 = askMult(0, hyp.intensityOptions[0].mult); if (m0 == null) return;
            const l1 = askLabel(1, hyp.intensityOptions[1].label); if (l1 == null) return;
            const m1 = askMult(1, hyp.intensityOptions[1].mult); if (m1 == null) return;
            const l2 = askLabel(2, hyp.intensityOptions[2].label); if (l2 == null) return;
            const m2 = askMult(2, hyp.intensityOptions[2].mult); if (m2 == null) return;

            hyp.intensityOptions[0].label = l0 || hyp.intensityOptions[0].label;
            hyp.intensityOptions[0].mult  = m0;
            hyp.intensityOptions[1].label = l1 || hyp.intensityOptions[1].label;
            hyp.intensityOptions[1].mult  = m1;
            hyp.intensityOptions[2].label = l2 || hyp.intensityOptions[2].label;
            hyp.intensityOptions[2].mult  = m2;
            const data = loadData();
            const idx = data.currentHypotheses.findIndex(h => h.id === hyp.id);
            if (idx !== -1) data.currentHypotheses[idx] = hyp;
            saveData(data);
            renderIntensityPanel();
        }


        // IF-THEN機能は削除

        // 習慣別詳細統計を表示
        function showHabitDetailStats() {
            const data = loadData();
            
            let html = '<div style="padding: 10px; font-size: 14px;">';
            html += '<h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">📊 習慣別詳細統計</h3>';
            
            // 習慣選択ドロップダウン
            html += '<select id="habit-detail-select" onchange="showSelectedHabitDetail()" style="width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 6px;">';
            html += '<option value="">習慣を選択してください</option>';
            
            data.currentHypotheses.forEach(habit => {
                if (habit.type === 'daily') {
                    html += `<option value="${habit.id}">${habit.title}</option>`;
                }
            });
            
            html += '</select>';
            html += '<div id="habit-detail-content"></div>';
            html += '</div>';
            
            document.getElementById('ranking-container').innerHTML = html;
            
            // タブのスタイル更新
            document.getElementById('ranking-detail-tab').style.background = '#6366f1';
            document.getElementById('ranking-detail-tab').style.color = '#fff';
            document.getElementById('ranking-achievement-tab').style.background = '#fff';
            document.getElementById('ranking-achievement-tab').style.color = '#666';
            document.getElementById('ranking-points-tab').style.background = '#fff';
            document.getElementById('ranking-points-tab').style.color = '#666';
            document.getElementById('ranking-streak-tab').style.background = '#fff';
            document.getElementById('ranking-streak-tab').style.color = '#666';
        }
        
        // 選択された習慣の詳細を表示
        window.showSelectedHabitDetail = function() {
            const habitId = document.getElementById('habit-detail-select').value;
            if (!habitId) {
                document.getElementById('habit-detail-content').innerHTML = '';
                return;
            }
            
            const data = loadData();
            const habit = data.currentHypotheses.find(h => h.id === habitId);
            if (!habit) return;
            
            // 統計情報を計算
            const stats = calculateHabitStats(habit, data);
            
            let html = '<div style="background: #f8f9fa; border-radius: 8px; padding: 15px;">';
            
            // 基本情報
            html += `<h4 style="margin: 0 0 10px 0; font-size: 15px; font-weight: 600;">🎯 ${habit.title}</h4>`;
            
            // 達成統計
            html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">';
            html += `<div style="background: #fff; padding: 10px; border-radius: 6px;">
                <div style="color: #666; font-size: 12px;">達成率</div>
                <div style="font-size: 20px; font-weight: bold; color: #4CAF50;">${stats.achievementRate}%</div>
            </div>`;
            html += `<div style="background: #fff; padding: 10px; border-radius: 6px;">
                <div style="color: #666; font-size: 12px;">総達成日数</div>
                <div style="font-size: 20px; font-weight: bold; color: #2196F3;">${stats.totalAchievedDays}日</div>
            </div>`;
            html += '</div>';
            
            // ポイント統計
            html += '<div style="background: #fff; padding: 12px; border-radius: 6px; margin-bottom: 15px;">';
            html += '<h5 style="margin: 0 0 8px 0; font-size: 14px;">💰 ポイント統計</h5>';
            html += `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; font-size: 12px;">
                <div>
                    <span style="color: #666;">総獲得:</span>
                    <span style="font-weight: 600;">${stats.totalPoints}pt</span>
                </div>
                <div>
                    <span style="color: #666;">平均:</span>
                    <span style="font-weight: 600;">${stats.averagePoints}pt</span>
                </div>
                <div>
                    <span style="color: #666;">ブースト:</span>
                    <span style="font-weight: 600;">+${stats.boostBonus}pt</span>
                </div>
            </div>`;
            html += '</div>';
            
            // 連続記録
            html += '<div style="background: #fff; padding: 12px; border-radius: 6px; margin-bottom: 15px;">';
            html += '<h5 style="margin: 0 0 8px 0; font-size: 14px;">🔥 連続記録</h5>';
            html += `<div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px;">
                <div>
                    <span style="color: #666;">現在:</span>
                    <span style="font-weight: 600; color: #FF9800;">${stats.currentStreak}日</span>
                </div>
                <div>
                    <span style="color: #666;">最長:</span>
                    <span style="font-weight: 600; color: #E91E63;">${stats.longestStreak}日</span>
                </div>
            </div>`;
            html += '</div>';
            
            // 曜日別パフォーマンス
            html += '<div style="background: #fff; padding: 12px; border-radius: 6px; margin-bottom: 15px;">';
            html += '<h5 style="margin: 0 0 8px 0; font-size: 14px;">📅 曜日別達成率</h5>';
            html += '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; font-size: 11px;">';
            const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
            stats.weekdayPerformance.forEach((rate, index) => {
                const color = rate >= 80 ? '#4CAF50' : rate >= 60 ? '#FFC107' : rate >= 40 ? '#FF9800' : '#F44336';
                html += `<div>
                    <div style="color: #666;">${dayNames[index]}</div>
                    <div style="font-weight: 600; color: ${color};">${rate}%</div>
                </div>`;
            });
            html += '</div>';
            html += '</div>';
            
            // 月別推移
            if (stats.monthlyTrend.length > 0) {
                html += '<div style="background: #fff; padding: 12px; border-radius: 6px;">';
                html += '<h5 style="margin: 0 0 8px 0; font-size: 14px;">📈 月別達成推移</h5>';
                html += '<div style="max-height: 150px; overflow-y: auto;">';
                stats.monthlyTrend.forEach(month => {
                    html += `<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px;">
                        <span>${month.label}</span>
                        <span style="font-weight: 600;">${month.rate}%</span>
                    </div>`;
                });
                html += '</div>';
                html += '</div>';
            }
            
            html += '</div>';
            
            document.getElementById('habit-detail-content').innerHTML = html;
        };
        
        // 習慣の統計情報を計算
        function calculateHabitStats(habit, data) {
            const stats = {
                achievementRate: 0,
                totalAchievedDays: 0,
                totalPoints: 0,
                averagePoints: 0,
                boostBonus: 0,
                currentStreak: 0,
                longestStreak: 0,
                weekdayPerformance: [0, 0, 0, 0, 0, 0, 0],
                monthlyTrend: []
            };
            
            // 達成日数と率を計算
            const today = getToday();
            const createdDate = new Date(habit.createdAt || today);
            const totalDays = Math.floor((new Date(today) - createdDate) / (1000 * 60 * 60 * 24)) + 1;
            
            let achievedDays = 0;
            let currentStreak = 0;
            let longestStreak = 0;
            let tempStreak = 0;
            const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
            const weekdayAchieved = [0, 0, 0, 0, 0, 0, 0];
            const monthlyData = {};
            
            // ログを日付順にソート
            const sortedDates = Object.keys(habit.logs || {}).sort();
            
            sortedDates.forEach((dateKey, index) => {
                const log = habit.logs[dateKey];
                const date = new Date(dateKey);
                const dayOfWeek = date.getDay();
                
                weekdayCount[dayOfWeek]++;
                
                if (log.completed) {
                    achievedDays++;
                    weekdayAchieved[dayOfWeek]++;
                    
                    // 月別データ
                    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                    if (!monthlyData[monthKey]) {
                        monthlyData[monthKey] = { achieved: 0, total: 0 };
                    }
                    monthlyData[monthKey].achieved++;
                    
                    // 連続記録計算
                    if (index === 0 || !habit.logs[sortedDates[index - 1]]?.completed) {
                        tempStreak = 1;
                    } else {
                        const prevDate = new Date(sortedDates[index - 1]);
                        const dayDiff = Math.floor((date - prevDate) / (1000 * 60 * 60 * 24));
                        if (dayDiff === 1) {
                            tempStreak++;
                        } else {
                            tempStreak = 1;
                        }
                    }
                    
                    longestStreak = Math.max(longestStreak, tempStreak);
                    
                    // 現在の連続記録
                    if (dateKey === today || (index === sortedDates.length - 1 && new Date(today) - date < 2 * 24 * 60 * 60 * 1000)) {
                        currentStreak = tempStreak;
                    }
                } else {
                    tempStreak = 0;
                }
                
                // 月別総日数
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { achieved: 0, total: 0 };
                }
                monthlyData[monthKey].total++;
            });
            
            stats.achievementRate = totalDays > 0 ? Math.round((achievedDays / totalDays) * 100) : 0;
            stats.totalAchievedDays = achievedDays;
            stats.currentStreak = currentStreak;
            stats.longestStreak = longestStreak;
            
            // 曜日別パフォーマンス
            stats.weekdayPerformance = weekdayCount.map((count, index) => {
                return count > 0 ? Math.round((weekdayAchieved[index] / count) * 100) : 0;
            });
            
            // 月別推移
            const sortedMonths = Object.keys(monthlyData).sort();
            stats.monthlyTrend = sortedMonths.map(monthKey => {
                const [year, month] = monthKey.split('-');
                const rate = monthlyData[monthKey].total > 0 
                    ? Math.round((monthlyData[monthKey].achieved / monthlyData[monthKey].total) * 100) 
                    : 0;
                return {
                    label: `${year}年${parseInt(month)}月`,
                    rate: rate
                };
            });
            
            // ポイント統計を計算
            let pointCount = 0;
            data.pointSystem.transactions.forEach(t => {
                if (t.source === 'habit') {
                    // habitIdまたは説明文から習慣を特定
                    if (t.habitId === habit.id || t.description.includes(habit.title)) {
                        stats.totalPoints += t.points;
                        pointCount++;
                        const basePoints = Math.round(t.points / (t.boost || 1));
                        stats.boostBonus += (t.points - basePoints);
                    }
                }
            });
            
            stats.averagePoints = pointCount > 0 ? Math.round(stats.totalPoints / pointCount) : 0;
            
            return stats;
        }
        
// IF-THEN機能は削除

        // バッジシステムの定義
        const BADGE_DEFINITIONS = {
            // 連続達成バッジ
            streak_7: { name: '🔥 週間戦士', description: '7日連続達成', emoji: '🔥' },
            streak_14: { name: '⚡ 2週間の炎', description: '14日連続達成', emoji: '⚡' },
            streak_30: { name: '🌟 月間マスター', description: '30日連続達成', emoji: '🌟' },
            streak_60: { name: '💎 ダイヤモンド', description: '60日連続達成', emoji: '💎' },
            streak_90: { name: '👑 習慣の王', description: '90日連続達成', emoji: '👑' },
            streak_365: { name: '🌈 年間達成者', description: '365日連続達成', emoji: '🌈' },
            
            // ステージ達成バッジ
            stage_sprout: { name: '🌱 最初の一歩', description: '芽吹きステージ到達', emoji: '🌱' },
            stage_growth: { name: '🌿 成長の証', description: '成長期ステージ到達', emoji: '🌿' },
            stage_establishment: { name: '🌳 定着の証', description: '定着期ステージ到達', emoji: '🌳' },
            stage_bloom: { name: '🌸 開花の証', description: '開花期ステージ到達', emoji: '🌸' },
            stage_harvest: { name: '🍎 収穫の証', description: '収穫期ステージ到達', emoji: '🍎' },
            stage_golden: { name: '👑 黄金達成', description: '黄金の習慣到達', emoji: '👑' },
            
            // 専門家シリーズ（100日達成）
            expert_study: { name: '📚 勉強の賢者', description: '勉強カテゴリー100日達成', emoji: '📚' },
            expert_exercise: { name: '💪 鉄人アスリート', description: '運動カテゴリー100日達成', emoji: '💪' },
            expert_health: { name: '🧘 瞑想マスター', description: '養生カテゴリー100日達成', emoji: '🧘' },
            expert_reading: { name: '📖 読書の哲学者', description: '読書カテゴリー100日達成', emoji: '📖' },
            rainbow_master: { name: '🌈 レインボーマスター', description: '全カテゴリーを同時進行', emoji: '🌈' },
            balance_keeper: { name: '⚖️ バランスキーパー', description: '3カテゴリー以上を均等に達成', emoji: '⚖️' },
            
            // 強度チャレンジ系
            fire_challenger: { name: '🔥 炎の挑戦者', description: '高強度×1.2を連続7日', emoji: '🔥' },
            precision_adjuster: { name: '🎯 精密調整者', description: 'カスタム強度を5種類以上使用', emoji: '🎯' },
            growth_curve: { name: '📈 成長曲線', description: '徐々に強度を上げて達成', emoji: '📈' },
            intensity_surfer: { name: '🎢 強度サーファー', description: '1週間で全強度を体験', emoji: '🎢' },
            
            // カードシステム関連
            lucky_seven: { name: '🎰 ラッキーセブン', description: 'レジェンドカード7枚獲得', emoji: '🎰' },
            shield_guardian: { name: '🛡️ 不屈の守護者', description: 'ペナルティカード10枚を乗り越える', emoji: '🛡️' },
            card_master: { name: '♠️ カードマスター', description: '全種類のカードを獲得', emoji: '♠️' },
            reversal_magician: { name: '🎭 逆転の奇術師', description: 'ペナルティをチャンスに変える', emoji: '🎭' },
            
            // 頻度管理の達人
            weekly_architect: { name: '📅 週間アーキテクト', description: '週3回習慣を完璧に管理', emoji: '📅' },
            weekday_ruler: { name: '🎯 曜日の支配者', description: '特定曜日100%達成を4週連続', emoji: '🎯' },
            flex_master: { name: '🔄 フレックスマスター', description: '3種類の頻度タイプを同時運用', emoji: '🔄' },
            weekly_perfect: { name: '📊 週間パーフェクト', description: '週の目標を12週連続達成', emoji: '📊' },
            
            // 成長・復活系
            habit_gardener: { name: '🌳 習慣の庭師', description: '5つ以上の習慣を同時育成', emoji: '🌳' },
            phoenix: { name: '🔥 不死鳥', description: '連続失敗から完全復活', emoji: '🔥' },
            diamond_habit: { name: '💎 ダイヤモンド習慣', description: '100日継続達成', emoji: '💎' },
            restart_master: { name: '🔄 再起動マスター', description: '3回リセットして最終的に成功', emoji: '🔄' },
            
            // チャレンジ系
            grand_slam: { name: '🎖️ グランドスラム', description: '月間チャレンジ全制覇', emoji: '🎖️' },
            speed_runner: { name: '⚡ スピードランナー', description: 'デイリーチャレンジ30連続', emoji: '⚡' },
            challenge_hunter: { name: '🏔️ 高難度ハンター', description: '最高難度チャレンジ10回クリア', emoji: '🏔️' },
            challenge_circus: { name: '🎪 チャレンジサーカス', description: '同時に5つ以上のチャレンジ', emoji: '🎪' },
            
            // 季節・特別系
            spring_awakening: { name: '🌸 春の目覚め', description: '3-5月に新習慣3つ確立', emoji: '🌸' },
            summer_passion: { name: '☀️ 夏の熱血', description: '6-8月に高強度習慣をマスター', emoji: '☀️' },
            autumn_harvest: { name: '🍂 秋の収穫', description: '9-11月に習慣を黄金レベルへ', emoji: '🍂' },
            winter_sage: { name: '❄️ 冬の賢者', description: '12-2月も休まず継続', emoji: '❄️' },
            
            // 特殊条件・隠し系
            adversity_hero: { name: '🎭 逆境の英雄', description: 'ハードモード中に95%以上達成', emoji: '🎭' },
            perfectionist: { name: '🔮 完璧主義者', description: '100%達成を5回', emoji: '🔮' },
            ghost_buster: { name: '👻 ゴーストバスター', description: '深夜0時をまたいで達成', emoji: '👻' },
            chaos_master: { name: '🌀 カオスマスター', description: '10個以上の習慣を同時管理', emoji: '🌀' },
            legend_seeker: { name: '🦄 伝説の探求者', description: 'すべての隠し要素を発見', emoji: '🦄' },
            
            // メタ達成系
            badge_hunter: { name: '🏅 バッジハンター', description: '50個以上のバッジ獲得', emoji: '🏅' },
            system_master: { name: '📱 システムマスター', description: '全機能を使いこなす', emoji: '📱' },
            
            // 完璧達成バッジ
            perfect_week: { name: '✨ 完璧な週', description: '1週間100%達成', emoji: '✨' },
            perfect_month: { name: '🌟 完璧な月', description: '1ヶ月100%達成', emoji: '🌟' },
            
            // 復活バッジ
            comeback: { name: '💪 復活の力', description: '3日以上の中断から復帰', emoji: '💪' },
            
            // 習慣数バッジ
            multi_habit_3: { name: '🎯 マルチタスカー', description: '3つの習慣を同時進行', emoji: '🎯' },
            multi_habit_5: { name: '🚀 習慣マスター', description: '5つの習慣を同時進行', emoji: '🚀' },
            multi_habit_10: { name: '🌟 習慣の神', description: '10個以上の習慣を同時進行', emoji: '🌟' },
            
            // 特別バッジ
            weekend_warrior: { name: '🎮 週末戦士', description: '土日の達成率90%以上', emoji: '🎮' }
        };
        
        // バッジ獲得チェック
        function checkAndAwardBadges() {
            const data = loadData();
            if (!data.badges) data.badges = {};
            const newBadges = [];
            
            // 連続達成バッジのチェック
            const allHypotheses = data.currentHypotheses.concat(data.completedHypotheses || []);
            let maxStreak = 0;
            allHypotheses.forEach(h => {
                const streak = window.computeStreak(h);
                if (streak > maxStreak) maxStreak = streak;
            });
            
            const streakBadges = [
                { id: 'streak_7', days: 7 },
                { id: 'streak_14', days: 14 },
                { id: 'streak_30', days: 30 },
                { id: 'streak_60', days: 60 },
                { id: 'streak_90', days: 90 },
                { id: 'streak_365', days: 365 }
            ];
            
            streakBadges.forEach(sb => {
                if (maxStreak >= sb.days && !data.badges[sb.id]) {
                    data.badges[sb.id] = { earnedAt: new Date().toISOString() };
                    newBadges.push(sb.id);
                }
            });
            
            // ステージバッジのチェック
            const stageMap = {
                '芽吹き': 'stage_sprout',
                '成長期': 'stage_growth',
                '定着期': 'stage_establishment',
                '開花期': 'stage_bloom',
                '収穫期': 'stage_harvest',
                '黄金の習慣': 'stage_golden'
            };
            
            allHypotheses.forEach(h => {
                const stage = window.calculateHabitStage(h);
                if (stage && stageMap[stage.name] && !data.badges[stageMap[stage.name]]) {
                    data.badges[stageMap[stage.name]] = { earnedAt: new Date().toISOString() };
                    newBadges.push(stageMap[stage.name]);
                }
            });
            
            // 完璧な週のチェック
            allHypotheses.forEach(h => {
                if (!h.achievements) return;
                const dates = Object.keys(h.achievements).sort();
                for (let i = 0; i <= dates.length - 7; i++) {
                    const weekDates = dates.slice(i, i + 7);
                    if (weekDates.length === 7) {
                        const firstDate = new Date(weekDates[0]);
                        const lastDate = new Date(weekDates[6]);
                        const dayDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
                        if (dayDiff === 6 && !data.badges.perfect_week) {
                            data.badges.perfect_week = { earnedAt: new Date().toISOString() };
                            newBadges.push('perfect_week');
                        }
                    }
                }
            });
            
            // 複数習慣バッジ
            if (data.currentHypotheses.length >= 3 && !data.badges.multi_habit_3) {
                data.badges.multi_habit_3 = { earnedAt: new Date().toISOString() };
                newBadges.push('multi_habit_3');
            }
            if (data.currentHypotheses.length >= 5 && !data.badges.multi_habit_5) {
                data.badges.multi_habit_5 = { earnedAt: new Date().toISOString() };
                newBadges.push('multi_habit_5');
            }
            if (data.currentHypotheses.length >= 10 && !data.badges.multi_habit_10) {
                data.badges.multi_habit_10 = { earnedAt: new Date().toISOString() };
                newBadges.push('multi_habit_10');
            }
            
            // カテゴリー専門家バッジ（100日達成）
            const categoryAchievements = {
                study: 0,
                exercise: 0,
                health: 0,
                reading: 0,
                work: 0,
                hobby: 0,
                other: 0
            };
            
            allHypotheses.forEach(h => {
                const category = h.category || 'other';
                const achievedDays = Object.keys(h.achievements || {}).length;
                categoryAchievements[category] += achievedDays;
            });
            
            // 専門家シリーズバッジ判定
            if (categoryAchievements.study >= 100 && !data.badges.expert_study) {
                data.badges.expert_study = { earnedAt: new Date().toISOString() };
                newBadges.push('expert_study');
            }
            if (categoryAchievements.exercise >= 100 && !data.badges.expert_exercise) {
                data.badges.expert_exercise = { earnedAt: new Date().toISOString() };
                newBadges.push('expert_exercise');
            }
            if (categoryAchievements.health >= 100 && !data.badges.expert_health) {
                data.badges.expert_health = { earnedAt: new Date().toISOString() };
                newBadges.push('expert_health');
            }
            if (categoryAchievements.reading >= 100 && !data.badges.expert_reading) {
                data.badges.expert_reading = { earnedAt: new Date().toISOString() };
                newBadges.push('expert_reading');
            }
            
            // レインボーマスター（全カテゴリー同時進行）
            const activeCategories = new Set();
            data.currentHypotheses.forEach(h => {
                activeCategories.add(h.category || 'other');
            });
            if (activeCategories.size >= 4 && !data.badges.rainbow_master) {
                data.badges.rainbow_master = { earnedAt: new Date().toISOString() };
                newBadges.push('rainbow_master');
            }
            
            // バランスキーパー（3カテゴリー均等達成）
            const significantCategories = Object.values(categoryAchievements).filter(v => v >= 30);
            if (significantCategories.length >= 3) {
                const max = Math.max(...significantCategories);
                const min = Math.min(...significantCategories);
                if (max - min <= 10 && !data.badges.balance_keeper) {
                    data.badges.balance_keeper = { earnedAt: new Date().toISOString() };
                    newBadges.push('balance_keeper');
                }
            }
            
            // 強度チャレンジバッジ
            let highIntensityStreak = 0;
            let customIntensityTypes = new Set();
            let hasGrowthCurve = false;
            let weeklyIntensityTypes = new Set();
            
            allHypotheses.forEach(h => {
                if (h.intensity) {
                    Object.values(h.intensity).forEach(mult => {
                        customIntensityTypes.add(mult.toFixed(1));
                    });
                }
                
                // 高強度連続チェック
                const sortedDates = Object.keys(h.achievements || {}).sort();
                let currentStreak = 0;
                sortedDates.forEach(date => {
                    const intensity = h.intensity && h.intensity[date] || 1.0;
                    if (intensity >= 1.2) {
                        currentStreak++;
                        if (currentStreak > highIntensityStreak) {
                            highIntensityStreak = currentStreak;
                        }
                    } else {
                        currentStreak = 0;
                    }
                });
            });
            
            if (highIntensityStreak >= 7 && !data.badges.fire_challenger) {
                data.badges.fire_challenger = { earnedAt: new Date().toISOString() };
                newBadges.push('fire_challenger');
            }
            
            if (customIntensityTypes.size >= 5 && !data.badges.precision_adjuster) {
                data.badges.precision_adjuster = { earnedAt: new Date().toISOString() };
                newBadges.push('precision_adjuster');
            }
            
            // カードシステムバッジ
            const cards = data.cards || {};
            const allCards = (cards.earned || []).concat(cards.used || []);
            const legendaryCards = allCards.filter(c => c.rarity === 'legendary');
            const penaltyCards = allCards.filter(c => c.type === 'penalty');
            const uniqueCardTypes = new Set(allCards.map(c => c.id));
            
            if (legendaryCards.length >= 7 && !data.badges.lucky_seven) {
                data.badges.lucky_seven = { earnedAt: new Date().toISOString() };
                newBadges.push('lucky_seven');
            }
            
            if (penaltyCards.length >= 10 && !data.badges.shield_guardian) {
                data.badges.shield_guardian = { earnedAt: new Date().toISOString() };
                newBadges.push('shield_guardian');
            }
            
            if (uniqueCardTypes.size >= 20 && !data.badges.card_master) {
                data.badges.card_master = { earnedAt: new Date().toISOString() };
                newBadges.push('card_master');
            }
            
            // 頻度管理バッジ
            let hasWeeklyPerfect = false;
            let hasFlexMaster = false;
            const frequencyTypes = new Set();
            
            data.currentHypotheses.forEach(h => {
                if (h.frequency) {
                    frequencyTypes.add(h.frequency.type);
                }
            });
            
            if (frequencyTypes.size >= 3 && !data.badges.flex_master) {
                data.badges.flex_master = { earnedAt: new Date().toISOString() };
                newBadges.push('flex_master');
            }
            
            // 成長・復活系バッジ
            if (data.currentHypotheses.length >= 5 && !data.badges.habit_gardener) {
                data.badges.habit_gardener = { earnedAt: new Date().toISOString() };
                newBadges.push('habit_gardener');
            }
            
            // 100日継続達成
            allHypotheses.forEach(h => {
                const achievedDays = Object.keys(h.achievements || {}).length;
                if (achievedDays >= 100 && !data.badges.diamond_habit) {
                    data.badges.diamond_habit = { earnedAt: new Date().toISOString() };
                    newBadges.push('diamond_habit');
                }
            });
            
            // 季節バッジ
            const now = new Date();
            const month = now.getMonth() + 1;
            
            if (month >= 3 && month <= 5) {
                const springNewHabits = data.currentHypotheses.filter(h => {
                    const startMonth = new Date(h.startDate).getMonth() + 1;
                    return startMonth >= 3 && startMonth <= 5;
                });
                if (springNewHabits.length >= 3 && !data.badges.spring_awakening) {
                    data.badges.spring_awakening = { earnedAt: new Date().toISOString() };
                    newBadges.push('spring_awakening');
                }
            }
            
            // 特殊条件バッジ
            if (data.currentHypotheses.length >= 10 && !data.badges.chaos_master) {
                data.badges.chaos_master = { earnedAt: new Date().toISOString() };
                newBadges.push('chaos_master');
            }
            
            // 完璧主義者バッジ
            let perfectCount = 0;
            allHypotheses.forEach(h => {
                const achievedDays = Object.keys(h.achievements || {}).length;
                const totalDays = h.totalDays || 30;
                if (achievedDays === totalDays) {
                    perfectCount++;
                }
            });
            
            if (perfectCount >= 5 && !data.badges.perfectionist) {
                data.badges.perfectionist = { earnedAt: new Date().toISOString() };
                newBadges.push('perfectionist');
            }
            
            // メタ達成系
            const earnedBadgesCount = Object.keys(data.badges).length;
            if (earnedBadgesCount >= 50 && !data.badges.badge_hunter) {
                data.badges.badge_hunter = { earnedAt: new Date().toISOString() };
                newBadges.push('badge_hunter');
            }
            
            // 新しいバッジを祝う（軽量コンフェッティ＋ミニモーダル）
            newBadges.forEach(badgeId => {
                const badge = BADGE_DEFINITIONS[badgeId];
                if (badge) {
                    setTimeout(() => {
                        try { showConfetti(1000, 20); } catch(e) {}
                        try { showBadgeShowcase(badge.emoji, badge.name); } catch(e) {}
                        try { showMiniModal('🏆 バッジ獲得！', `${badge.emoji} ${badge.name}`,[{label:'バッジを見る', onclick:"(function(){ showStatsView(); setTimeout(()=>toggleStatSection('badge-collection'), 120); })()"}]); } catch(e) {}
                    }, 200);
                }
            });
            
            if (newBadges.length > 0) {
                saveData(data);
            }
            
            return newBadges;
        }
        
        // 連続達成日数を計算（グローバル関数）
        window.computeStreak = function(hyp) {
            const today = new Date();
            today.setHours(0,0,0,0);
            const start = new Date(hyp.startDate);
            start.setHours(0,0,0,0);
            let streak = 0;
            const achievements = hyp.achievements || {};
            for (let d = new Date(today); d >= start; d.setDate(d.getDate()-1)) {
                const key = dateKeyLocal(d);
                if (achievements[key]) {
                    streak += 1;
                } else {
                    // 今日より未来はスキップ、未達で打ち切り
                    if (d > today) continue;
                    break;
                }
            }
            return streak;
        }
        
        // ステージアップ通知
        function checkStageProgress() {
            const data = loadData();
            if (!data.stageNotifications) data.stageNotifications = {};
            
            data.currentHypotheses.forEach(h => {
                const stage = window.calculateHabitStage(h);
                if (!stage) return;
                
                const notifKey = `${h.id}_${stage.name}`;
                if (!data.stageNotifications[notifKey]) {
                    // 新しいステージに到達
                    data.stageNotifications[notifKey] = new Date().toISOString();
                    
                    // 種まき以外は通知
                    if (stage.name !== '種まき') {
                        showCardEffect(
                            '🌱 ステージアップ！',
                            `「${h.title}」が${stage.name}ステージに到達！\n${stage.description}`,
                            stage.color
                        );
                    }
                }
            });
            
            saveData(data);
        }
        
        // 習慣成長ステージの計算関数（グローバル関数）
        window.calculateHabitStage = function(hypothesis) {
            if (!hypothesis || !hypothesis.achievements) return null;
            
            const start = new Date(hypothesis.startDate);
            start.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 達成日数の計算
            const achievedDays = Object.keys(hypothesis.achievements).length;
            
            // 連続達成日数の計算
            const streak = window.computeStreak(hypothesis);
            
            // 週単位での達成数を計算（週◯回や特定曜日の場合）
            let achievedWeeks = 0;
            if (hypothesis.frequency && (hypothesis.frequency.type === 'weekly' || hypothesis.frequency.type === 'weekdays')) {
                const weeks = Math.ceil((today - start) / (7 * 24 * 60 * 60 * 1000));
                for (let w = 0; w < weeks; w++) {
                    const weekStart = new Date(start);
                    weekStart.setDate(start.getDate() + w * 7);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 6);
                    
                    let weekAchievements = 0;
                    for (let d = new Date(weekStart); d <= weekEnd && d <= today; d.setDate(d.getDate() + 1)) {
                        const key = dateKeyLocal(d);
                        if (hypothesis.achievements[key]) weekAchievements++;
                    }
                    
                    if (hypothesis.frequency.type === 'weekly' && weekAchievements >= hypothesis.frequency.count) {
                        achievedWeeks++;
                    } else if (hypothesis.frequency.type === 'weekdays') {
                        const targetDaysInWeek = hypothesis.frequency.weekdays.filter(wd => {
                            for (let d = new Date(weekStart); d <= weekEnd && d <= today; d.setDate(d.getDate() + 1)) {
                                if (d.getDay() === wd) return true;
                            }
                            return false;
                        }).length;
                        if (targetDaysInWeek > 0 && weekAchievements >= targetDaysInWeek * 0.8) {
                            achievedWeeks++;
                        }
                    }
                }
            }
            
            // 基本スコアの計算
            let baseScore = achievedDays;
            if (hypothesis.frequency) {
                if (hypothesis.frequency.type === 'weekly' || hypothesis.frequency.type === 'weekdays') {
                    baseScore = achievedWeeks * 7; // 週単位を日数換算
                }
            }
            
            // 連続ボーナスの計算（1.0～2.0）
            let continuityBonus = 1.0;
            if (streak >= 90) {
                continuityBonus = 2.0;
            } else if (streak >= 60) {
                continuityBonus = 1.7;
            } else if (streak >= 30) {
                continuityBonus = 1.5;
            } else if (streak >= 14) {
                continuityBonus = 1.3;
            } else if (streak >= 7) {
                continuityBonus = 1.1;
            }
            
            // 途切れペナルティ
            const totalDays = Math.floor((today - start) / (24 * 60 * 60 * 1000)) + 1;
            const achievementRate = achievedDays / totalDays;
            if (achievementRate < 0.5 && totalDays > 7) {
                continuityBonus *= 0.8;
            }
            
            // 最終スコア
            const finalScore = Math.floor(baseScore * continuityBonus);
            
            // ステージ判定
            const stages = [
                { name: '🌱 種まき期', minScore: 0, maxScore: 7, color: '#6b7280', description: '習慣の種を植えた段階' },
                { name: '🌿 発芽期', minScore: 8, maxScore: 14, color: '#10b981', description: '小さな芽が出てきた' },
                { name: '🍀 成長期', minScore: 15, maxScore: 30, color: '#3b82f6', description: '葉が増えて成長中' },
                { name: '🌳 定着期', minScore: 31, maxScore: 60, color: '#8b5cf6', description: 'しっかりとした木に成長' },
                { name: '🌸 開花期', minScore: 61, maxScore: 90, color: '#f59e0b', description: '花が咲き始める' },
                { name: '🍎 収穫期', minScore: 91, maxScore: 120, color: '#ef4444', description: '実がなり収穫できる' },
                { name: '👑 黄金の習慣', minScore: 121, maxScore: 999999, color: '#fbbf24', description: '完全に身についた習慣' }
            ];
            
            // 特別条件：連続90日以上かつ達成率90%以上で黄金の習慣
            if (streak >= 90 && achievementRate >= 0.9) {
                return { ...stages[6], score: finalScore, streak, achievementRate: Math.round(achievementRate * 100) };
            }
            
            for (const stage of stages) {
                if (finalScore >= stage.minScore && finalScore <= stage.maxScore) {
                    return { ...stage, score: finalScore, streak, achievementRate: Math.round(achievementRate * 100) };
                }
            }
            
            return { ...stages[0], score: finalScore, streak, achievementRate: Math.round(achievementRate * 100) };
        }

        // （削除）旧デイリークエスト機能は強度（Intensity）へ置換済み

        // 完了オプションを表示
        function showCompletionOptions() {
            // カード獲得処理を先に実行
            const data = loadData();
            const hypothesis = window.currentHypothesis;
            
            // カード取得履歴の初期化（古いバージョンとの互換性）
            if (!hypothesis.cardAcquisitionHistory) {
                hypothesis.cardAcquisitionHistory = {
                    sevenDays: [],
                    weeklyComplete: [],
                    completion: false
                };
            }

            if (!hypothesis.cardAcquisitionHistory.completion) {
                // 最終的な達成率を計算（頻度に基づく目標日数を分母にする）
                const achievedDays = Object.keys(hypothesis.achievements || {}).length;
                const targetDays = getTargetDaysForHypothesis(hypothesis);
                let finalRate = targetDays > 0 ? Math.round((achievedDays / targetDays) * 100) : 0;
                
                // 7回未満の達成では完了時カード獲得をスキップ
                const shouldGetCompletionCards = achievedDays >= 7;
                
                // 達成ブースターが有効かチェック
                let hasAchievementBooster = false;
                if (data.cards && data.cards.activeEffects) {
                    hasAchievementBooster = data.cards.activeEffects.some(effect => 
                        effect.cardId === 'achievement_booster' && 
                        (!effect.targetHypothesisId || effect.targetHypothesisId === hypothesis.id)
                    );
                }
                
                // 達成ブースターの効果を適用（15%ボーナス）
                if (hasAchievementBooster) {
                    finalRate = Math.min(100, finalRate + 15);
                    // エフェクトを表示
                    showCardEffect('達成ブースター発動！', '最終達成率に+15%のボーナス！', '#10b981');
                    
                    // 達成ブースターを消費
                    data.cards.activeEffects = data.cards.activeEffects.filter(effect =>
                        !(effect.cardId === 'achievement_booster' && 
                          (!effect.targetHypothesisId || effect.targetHypothesisId === hypothesis.id))
                    );
                }
                
                // 達成率減少ペナルティの適用
                if (hypothesis.achievementDecrease) {
                    finalRate = Math.max(0, finalRate - hypothesis.achievementDecrease);
                    // エフェクトを表示
                    showCardEffect('達成率減少発動！', `最終達成率から${hypothesis.achievementDecrease}%減少しました`, '#ef4444');
                }
                
                hypothesis.finalAchievementRate = finalRate;
                
                // 完了時のカード獲得処理（7回以上達成時のみ）
                if (shouldGetCompletionCards) {
                    const acquiredCards = getCardsBasedOnAchievement(finalRate, hypothesis);
                    if (acquiredCards.length > 0) {
                        // カードを追加して最新のdataを取得
                        let updatedData = data;
                        acquiredCards.forEach(cardId => {
                            updatedData = addCardToInventory(cardId);
                        });
                        
                        // 完了時のカード獲得フラグを設定
                        hypothesis.cardAcquisitionHistory.completion = true;
                        window.currentHypothesis.cardAcquisitionHistory.completion = true;
                        
                        // 現在の習慣を更新（カード獲得履歴を保存）
                        const index = updatedData.currentHypotheses.findIndex(h => h.id === hypothesis.id);
                        if (index !== -1) {
                            updatedData.currentHypotheses[index].cardAcquisitionHistory = hypothesis.cardAcquisitionHistory;
                            updatedData.currentHypotheses[index].finalAchievementRate = finalRate;
                        }
                        
                        saveData(updatedData);
                        
                        // カード獲得演出を表示
                        window.showCardAcquisition(acquiredCards, () => {
                            // カード獲得演出後にデブリーフ→完了オプション
                            requestDebriefThenShowOptions();
                        });
                    } else {
                        // カードなしでもフラグは設定
                        hypothesis.cardAcquisitionHistory.completion = true;
                        window.currentHypothesis.cardAcquisitionHistory.completion = true;
                        
                        // 現在の習慣を更新
                        const index = data.currentHypotheses.findIndex(h => h.id === hypothesis.id);
                        if (index !== -1) {
                            data.currentHypotheses[index].cardAcquisitionHistory = hypothesis.cardAcquisitionHistory;
                            data.currentHypotheses[index].finalAchievementRate = finalRate;
                        }
                        
                        saveData(data);
                        
                        // カードなしの場合もデブリーフ→完了オプション
                        requestDebriefThenShowOptions();
                    }
                } else {
                    // 7回未満の達成の場合はカード獲得なしで完了オプションを表示
                    showNotification('⚠️ 7回以上の達成で報酬カードを獲得できます', 'info');
                    
                    // フラグは設定（ただしカードは獲得していない）
                    hypothesis.cardAcquisitionHistory.completion = true;
                    window.currentHypothesis.cardAcquisitionHistory.completion = true;
                    
                    // 現在の習慣を更新
                    const index = data.currentHypotheses.findIndex(h => h.id === hypothesis.id);
                    if (index !== -1) {
                        data.currentHypotheses[index].cardAcquisitionHistory = hypothesis.cardAcquisitionHistory;
                        data.currentHypotheses[index].finalAchievementRate = finalRate;
                    }
                    
                    saveData(data);
                    
                    // 完了オプションを表示
                    requestDebriefThenShowOptions();
                }
            } else {
                // すでに完了時のカードを獲得している場合はそのまま完了オプションを表示
                requestDebriefThenShowOptions();
            }
        }

        // デブリーフをスキップし、直接完了オプションを表示
        function requestDebriefThenShowOptions() {
            try {
                document.getElementById('completion-report-section').style.display = 'none';
                document.getElementById('completion-options').style.display = 'block';
            } catch (_) {}
        }

        // デブリーフ機能を削除（振り返りモーダルを無効化）

        // ==== デバッグ機能 ====
        function openDebugMenu() {
            const data = loadData();
            const isAlwaysComplete = !!(data.meta && data.meta.debugAlwaysComplete);
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.width = '92%';
            modal.style.maxWidth = '520px';
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🛠️ デバッグモード</h3>
                    <p>開発・検証用のショートカット</p>
                </div>
                <div style="display:grid; gap:12px;">
                    <button class="button primary" onclick="markAllDaysAchieved()">✅ 現在の習慣を全日達成にする</button>
                    <button class="button secondary" onclick="toggleAlwaysComplete()">${isAlwaysComplete ? '🟢 いつでも完了: ON（クリックでOFF）' : '⚪ いつでも完了: OFF（クリックでON）'}</button>
                    <button class="button" onclick="debugRecheckTodayEvents()">🔄 今日のイベントを再判定</button>
                    <button class="button" onclick="clearExpiredCardEffects()">🧹 期限切れカード効果をクリア</button>
                </div>
                <div class="modal-footer">
                    <button class="button" onclick="this.closest('.overlay').remove()">閉じる</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        }

        function markAllDaysAchieved() {
            if (!window.currentHypothesis) {
                showNotification('進行中の習慣がありません', 'error');
                return;
            }
            const data = loadData();
            const startDate = new Date(window.currentHypothesis.startDate);
            startDate.setHours(0,0,0,0);
            if (!window.currentHypothesis.achievements) window.currentHypothesis.achievements = {};
            for (let i = 0; i < window.currentHypothesis.totalDays; i++) {
                const d = new Date(startDate);
                d.setDate(startDate.getDate() + i);
                const key = dateKeyLocal(d);
                window.currentHypothesis.achievements[key] = true;
            }
            const idx = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (idx !== -1) {
                data.currentHypotheses[idx].achievements = { ...window.currentHypothesis.achievements };
                saveData(data);
            }
            updateCalendar();
            updateProgress();
            showNotification('全日を達成に設定しました', 'success');
        }

        function toggleAlwaysComplete() {
            const data = loadData();
            if (!data.meta) data.meta = {};
            data.meta.debugAlwaysComplete = !data.meta.debugAlwaysComplete;
            saveData(data);
            document.querySelector('.overlay')?.remove();
            openDebugMenu();
            updateProgress();
            showNotification(`いつでも完了: ${data.meta.debugAlwaysComplete ? 'ON' : 'OFF'}`, 'info');
        }

        // デバッグ：今日のイベントを再判定
        function debugRecheckTodayEvents() {
            try {
                const data = loadData();
                if (!data.events) data.events = {};
                data.events.lastEventCheck = null;
                data.events.activeBoosts = [];
                saveData(data);

                if (typeof checkDailyEvents === 'function') checkDailyEvents();
                if (typeof updateEventDisplay === 'function') updateEventDisplay();
                showNotification('🔄 今日のイベントを再判定しました', 'success');
            } catch (e) {
                console.error('デバッグ再判定エラー:', e);
                showNotification('❌ 再判定に失敗しました', 'error');
            }
        }
        
        // デバッグ：期限切れカード効果をクリア
        function clearExpiredCardEffects() {
            try {
                const data = loadData();
                if (!data.cards || !data.cards.activeEffects) {
                    showNotification('⚠️ アクティブ効果がありません', 'info');
                    return;
                }
                
                const now = new Date();
                const before = data.cards.activeEffects.length;
                
                // 期限切れ効果を削除
                data.cards.activeEffects = data.cards.activeEffects.filter(effect => {
                    if (effect.endDate) {
                        const endDate = new Date(effect.endDate);
                        if (endDate < now) {
                            console.log(`期限切れ効果を削除: ${effect.cardId}, 期限: ${endDate.toLocaleString()}`);
                            return false;
                        }
                    }
                    return true;
                });
                
                const after = data.cards.activeEffects.length;
                const removed = before - after;
                
                saveData(data);
                
                // アクティブ効果表示を更新
                if (typeof updateActiveEffectsDisplay === 'function') {
                    updateActiveEffectsDisplay();
                }
                
                showNotification(`🧹 ${removed}個の期限切れ効果をクリアしました`, 'success');
                console.log(`期限切れ効果をクリア: ${before}個 → ${after}個`);
            } catch (e) {
                console.error('期限切れ効果クリアエラー:', e);
                showNotification('❌ クリアに失敗しました', 'error');
            }
        }
        
        // デバッグ関数をwindowオブジェクトに登録（HTMLから呼び出し可能）
        window.openDebugMenu = openDebugMenu;
        window.markAllDaysAchieved = markAllDaysAchieved;
        window.toggleAlwaysComplete = toggleAlwaysComplete;
        window.debugRecheckTodayEvents = debugRecheckTodayEvents;
        window.clearExpiredCardEffects = clearExpiredCardEffects;

        // 現在の習慣リストを更新
        function updateCurrentHypothesisList() {
            const data = loadData();
            const listContainer = document.getElementById('current-hypothesis-list');
            if (!listContainer) {
                return;
            }
            listContainer.innerHTML = '';
            
            // フィルターの状態を取得
            const categoryFilter = document.getElementById('category-filter');
            const filterValue = categoryFilter ? categoryFilter.value : 'all';
            
            // フィルタリング
            let filteredHypotheses = data.currentHypotheses;
            if (filterValue !== 'all') {
                filteredHypotheses = data.currentHypotheses.filter(h => h.category === filterValue);
            }
            
            // フィルタにより0件になった場合は、自動で「すべて」に戻す
            if (filteredHypotheses.length === 0 && filterValue !== 'all' && data.currentHypotheses.length > 0) {
                try {
                    if (categoryFilter) {
                        categoryFilter.value = 'all';
                        localStorage.setItem('selectedCategory', 'all');
                    }
                } catch(_) {}
                filteredHypotheses = data.currentHypotheses;
            }

            if (filteredHypotheses.length === 0) {
                if (filterValue !== 'all') {
                    listContainer.innerHTML = '<p style="color: var(--text-secondary);">このカテゴリの習慣はありません</p>';
                } else {
                    listContainer.innerHTML = '<p style="color: var(--text-secondary);">現在進行中の習慣はありません</p>';
                }
                return;
            }
            
            // 日付が変わったら宣言状態をチェック（深夜対応）
            const todayKey = getActivityDateKey();
            
            // カテゴリーマスターを初期化
            const categoryMaster = initializeCategoryMaster();
            
            // 頻度タイプ別にグループ分け（大分類）
            const frequencyGroups = {
                daily: { 
                    title: '毎日の習慣', 
                    icon: '☀️', 
                    color: '#10b981',
                    categories: {} // カテゴリ別にさらに分類
                },
                weekly: { 
                    title: '週N回の習慣', 
                    icon: '📅', 
                    color: '#3b82f6',
                    categories: {}
                },
                weekdays: { 
                    title: '曜日指定の習慣', 
                    icon: '📆', 
                    color: '#8b5cf6',
                    categories: {}
                }
            };
            
            // 習慣を頻度タイプ別、さらにカテゴリ別に分類
            filteredHypotheses.forEach(hypothesis => {
                // 休眠中の習慣は別グループに
                if (hypothesis.isSleeping) {
                    const categoryInfo = data.categoryMaster[hypothesis.category || 'other'] || data.categoryMaster.other;
                    const categoryKey = hypothesis.category || 'other';
                    
                    if (!frequencyGroups.sleeping) {
                        frequencyGroups.sleeping = {
                            title: '休眠中の習慣',
                            icon: '😴',
                            color: '#94a3b8',
                            categories: {}
                        };
                    }
                    
                    if (!frequencyGroups.sleeping.categories[categoryKey]) {
                        frequencyGroups.sleeping.categories[categoryKey] = [];
                    }
                    frequencyGroups.sleeping.categories[categoryKey].push(hypothesis);
                    return;
                }
                
                let frequencyType = 'daily'; // デフォルトは毎日
                if (hypothesis.frequency) {
                    frequencyType = hypothesis.frequency.type || 'daily';
                }
                
                const category = hypothesis.category || 'other'; // デフォルトはその他
                
                if (frequencyGroups[frequencyType]) {
                    if (!frequencyGroups[frequencyType].categories[category]) {
                        frequencyGroups[frequencyType].categories[category] = [];
                    }
                    frequencyGroups[frequencyType].categories[category].push(hypothesis);
                }
            });
            
            // トグル状態を管理（LocalStorageから読み込み）
            const toggleStates = JSON.parse(localStorage.getItem('categoryToggleStates') || '{}');
            
            // 頻度グループごとに表示（大分類）
            const createFrequencySection = (frequencyKey, frequencyData) => {
                // この頻度タイプに習慣がない場合はスキップ
                const hasHabits = Object.values(frequencyData.categories).some(habits => habits.length > 0);
                if (!hasHabits) return null;
                
                const section = document.createElement('div');
                section.style.cssText = 'margin-bottom: 24px;';
                
                // 頻度タイプのヘッダー（トグル不可、常に表示）
                const frequencyHeader = document.createElement('div');
                const totalCount = Object.values(frequencyData.categories).reduce((sum, habits) => sum + habits.length, 0);
                frequencyHeader.style.cssText = `display: flex; align-items: center; gap: 8px; padding: 14px 16px; background: linear-gradient(135deg, ${frequencyData.color}20, ${frequencyData.color}10); border-radius: 12px; border: 2px solid ${frequencyData.color}; margin-bottom: 12px;`;
                frequencyHeader.innerHTML = `
                    <span style="font-size: 24px;">${frequencyData.icon}</span>
                    <span style="font-weight: 700; font-size: 18px; color: var(--text-primary);">${frequencyData.title}</span>
                    <span style="font-size: 14px; color: var(--text-secondary); margin-left: 8px; background: ${frequencyData.color}30; padding: 4px 12px; border-radius: 999px; font-weight: 600;">合計 ${totalCount}個</span>
                `;
                section.appendChild(frequencyHeader);
                
                // カテゴリ別のセクションを作成（小分類）
                const categoriesContainer = document.createElement('div');
                categoriesContainer.style.cssText = 'margin-left: 20px;';
                
                Object.entries(frequencyData.categories).forEach(([categoryKey, habits]) => {
                    if (habits.length === 0) return;
                    
                    const categoryInfo = data.categoryMaster[categoryKey] || { name: categoryKey, icon: '📝', color: '#6b7280' };
                    const categorySection = document.createElement('div');
                    categorySection.style.cssText = 'margin-bottom: 12px;';
                    
                    // カテゴリヘッダー
                    const categoryHeader = document.createElement('div');
                    const unachievedCount = habits.filter(h => h.failures && h.failures[todayKey]).length;
                    
                    categoryHeader.style.cssText = `
                        display: flex; 
                        align-items: center; 
                        gap: 8px; 
                        padding: 10px 14px; 
                        background: linear-gradient(135deg, ${categoryInfo.color}10, ${categoryInfo.color}05); 
                        border-radius: 10px; 
                        border-left: 3px solid ${categoryInfo.color};
                    `;
                    categoryHeader.innerHTML = `
                        <span style="font-size: 18px;">${categoryInfo.icon}</span>
                        <span style="font-weight: 600; font-size: 15px; color: var(--text-primary);">${categoryInfo.name}</span>
                        <span style="font-size: 12px; color: var(--text-secondary); margin-left: 6px; background: ${categoryInfo.color}20; padding: 2px 8px; border-radius: 999px;">${habits.length}個</span>
                        ${unachievedCount > 0 ? `<span style="margin-left: 6px; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; font-weight: 600;">未達成 ${unachievedCount}個</span>` : ''}
                    `;
                    
                    categorySection.appendChild(categoryHeader);
                    
                    // 習慣リスト（展開機能付き）
                    habits.forEach((hypothesis, index) => {
                        // 習慣コンテナ（タイトル＋詳細）
                        const habitContainer = document.createElement('div');
                        habitContainer.style.cssText = `
                            margin-top: 8px;
                            margin-left: 20px;
                        `;
                        
                        // 習慣タイトル
                        const habitItem = document.createElement('div');
                        const isAchievedToday = !!(hypothesis.achievements && hypothesis.achievements[todayKey]);
                        const isFailedToday = !!(hypothesis.failures && hypothesis.failures[todayKey]);
                        
                        habitItem.style.cssText = `
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            padding: 10px 14px;
                            background: var(--surface-light);
                            border-radius: 8px;
                            border: 1px solid var(--border);
                            cursor: pointer;
                            min-height: 44px;
                            transition: all 0.2s;
                        `;
                        
                        // 達成マーク（目立つデザイン）: ✅/🔴/空 の三値
                        const checkMarkHtml = isAchievedToday 
                            ? `<button class="home-check" data-habit-id="${hypothesis.id}" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#10b981;border-radius:50%;flex-shrink:0;border:none;cursor:pointer;"><span style=\"color: white; font-size: 16px; font-weight: bold;\">✓</span></button>`
                            : (isFailedToday
                               ? `<button class="home-check" data-habit-id="${hypothesis.id}" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#ef4444;border-radius:50%;flex-shrink:0;border:none;cursor:pointer;"><span style=\"color: white; font-size: 16px; font-weight: bold;\">❌</span></button>`
                               : `<button class="home-check" data-habit-id="${hypothesis.id}" style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:#e2e8f0;border:2px solid #cbd5e1;border-radius:50%;flex-shrink:0;cursor:pointer;"></button>`);
                        
                        // 頻度表示
                        let freqText = '';
                        if (hypothesis.frequency && hypothesis.frequency.type === 'weekly') {
                            freqText = `週${hypothesis.frequency.count || 3}`;
                        } else if (hypothesis.frequency && hypothesis.frequency.type === 'weekdays') {
                            const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
                            const days = (hypothesis.frequency.weekdays || []).map(d => weekdayNames[d]).join('');
                            freqText = days;
                        }
                        
                        // 矢印
                        const arrow = document.createElement('span');
                        arrow.id = `arrow-${hypothesis.id}`;
                        arrow.style.cssText = 'color: var(--text-secondary); font-size: 16px; transition: transform 0.3s;';
                        arrow.textContent = '▶';
                        
                        habitItem.innerHTML = `
                            ${checkMarkHtml}
                            <span class="habit-title" data-habit-id="${hypothesis.id}" style="flex: 1; font-size: 14px; color: var(--text-primary);">${escapeHTML(hypothesis.title)}</span>
                            ${freqText ? `<span style="font-size: 11px; padding: 2px 6px; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 999px;">${freqText}</span>` : ''}
                        `;
                        habitItem.appendChild(arrow);
                        // スマホ: タイトル長押しでメニュー（PCは右クリック）
                        try {
                            const titleEl = habitItem.querySelector('.habit-title');
                            if (titleEl) {
                                // 長押しでコンテキストメニュー表示
                                let longPressTimer;
                                titleEl.addEventListener('touchstart', (e) => {
                                    longPressTimer = setTimeout(() => {
                                        e.preventDefault();
                                        showHabitContextMenu(hypothesis.id, e.touches[0].clientX, e.touches[0].clientY);
                                    }, 600);
                                });
                                titleEl.addEventListener('touchend', () => clearTimeout(longPressTimer));
                                titleEl.addEventListener('touchmove', () => clearTimeout(longPressTimer));
                                
                                // PC右クリックでコンテキストメニュー
                                titleEl.addEventListener('contextmenu', (e) => {
                                    e.preventDefault();
                                    showHabitContextMenu(hypothesis.id, e.clientX, e.clientY);
                                });
                            }
                        } catch(_) {}
                        
                        // 詳細エリア（初期は非表示）
                        const detailArea = document.createElement('div');
                        detailArea.id = `detail-${hypothesis.id}`;
                        detailArea.style.cssText = `
                            max-height: 0;
                            overflow: hidden;
                            transition: max-height 0.3s ease-out;
                        `;
                        
                        const detailContent = document.createElement('div');
                        detailContent.style.cssText = `
                            padding: 12px 14px;
                            margin-top: 8px;
                            background: rgba(248, 250, 252, 0.8);
                            border-radius: 8px;
                            border: 1px solid var(--border);
                        `;
                        
                        // 詳細情報の計算
                        const startDate = new Date(hypothesis.startDate);
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        startDate.setHours(0, 0, 0, 0);
                        const daysPassed = Math.max(1, Math.floor((today - startDate) / (1000 * 60 * 60 * 24)) + 1);
                        const achievedDays = Object.keys(hypothesis.achievements || {}).length;
                        
                        detailContent.innerHTML = `
                            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.5;">
                                ${escapeHTML(hypothesis.description)}
                            </div>
                            <div style="display: flex; gap: 12px; font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">
                                <span>📅 継続${daysPassed}日</span>
                                <span>✅ 達成${achievedDays}日</span>
                                <span>📂 カテゴリ ${(initializeCategoryMaster()[hypothesis.category]||{}).name || hypothesis.category || 'その他'}</span>
                            </div>
                            <button class="btn btn-primary" style="width: 100%; padding: 10px; font-size: 14px;" onclick="event.stopPropagation(); window.openHabitEditModal(${hypothesis.id});">
                                ✏️ 編集
                            </button>
                        `;
                        
                        detailArea.appendChild(detailContent);
                        
                        // タップで展開/折りたたみ
                        let isExpanded = false;
                        habitItem.onclick = (e) => {
                            e.stopPropagation();
                            const detail = document.getElementById(`detail-${hypothesis.id}`);
                            const arrowEl = document.getElementById(`arrow-${hypothesis.id}`);
                            
                            if (isExpanded) {
                                detail.style.maxHeight = '0';
                                arrowEl.style.transform = 'rotate(0deg)';
                                habitItem.style.borderRadius = '8px';
                                isExpanded = false;
                            } else {
                                detail.style.maxHeight = '300px';
                                arrowEl.style.transform = 'rotate(90deg)';
                                habitItem.style.borderRadius = '8px 8px 0 0';
                                isExpanded = true;
                            }
                        };
                        
                        habitContainer.appendChild(habitItem);
                        habitContainer.appendChild(detailArea);
                        categorySection.appendChild(habitContainer);
                    });
                    
                    categoriesContainer.appendChild(categorySection);
                });
                
                section.appendChild(categoriesContainer);
                return section;
            };
            
            // 各習慣アイテムを作成する共通関数
            const createHypothesisItem = (hypothesis, todayKey) => {
                const item = document.createElement('div');
                item.className = 'hypothesis-item';
                item.style.position = 'relative'; // 完のハンコ用にposition:relativeを追加
                item.onclick = () => window.showProgressView(hypothesis.id);
                
                // 長押し/右クリックで削除
                attachLongPressToDelete(item, hypothesis.id);
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    confirmDeleteHypothesis(hypothesis.id);
                });
                
                // 習慣成長ステージを計算
                const stage = window.calculateHabitStage(hypothesis);
                
                const startDate = new Date(hypothesis.startDate);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                // 開始日を0時0分0秒に設定
                startDate.setHours(0, 0, 0, 0);
                
                // 経過日数を計算（開始日を1日目として計算）
                const timeDiff = today.getTime() - startDate.getTime();
                const daysPassed = Math.min(
                    Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1),
                    hypothesis.totalDays
                );
                // 表示達成率: 達成日の強度倍率合計 ÷ 全日数 × 100（小数点切り捨て）
                const intensity = hypothesis.intensity || {};
                let weightedAchieved = 0;
                for (let i = 0; i < hypothesis.totalDays; i++) {
                    const d = new Date(startDate);
                    d.setDate(startDate.getDate() + i);
                    const key = dateKeyLocal(d);
                    if (hypothesis.achievements && hypothesis.achievements[key]) {
                        const mult = Number(intensity[key] ?? 1.0);
                        weightedAchieved += mult;
                    }
                }
                const displayRate = Math.min(100, Math.floor((weightedAchieved / hypothesis.totalDays) * 100));

                // 直近日の強度バッジ（今日から最大3日分、期間内のみ）
                const endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + hypothesis.totalDays - 1);
                const opts = hypothesis.intensityOptions || [
                    { label: '軽め', mult: 0.8 },
                    { label: '基本', mult: 1.0 },
                    { label: '高強度', mult: 1.2 },
                ];
                const toFixed1 = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1);
                const badges = [];
                for (let k = 0; k < 3; k++) {
                    const d = new Date(today);
                    d.setHours(0,0,0,0);
                    d.setDate(d.getDate() - k);
                    if (d < startDate || d > endDate) continue;
                    const key = dateKeyLocal(d);
                    const mult = Number((intensity || {})[key] ?? 1.0);
                    const ach = !!((hypothesis.achievements || {})[key]);
                    const opt = opts.find(o => toFixed1(o.mult) === toFixed1(mult));
                    const labelText = opt ? opt.label : `×${toFixed1(mult)}`;
                    const style = ach
                        ? 'background: rgba(16,185,129,0.15); border:1px solid #10b981; color:#10b981;'
                        : 'background: rgba(148,163,184,0.15); border:1px solid #475569; color:#94a3b8;';
                    badges.push(`<span style="${style} padding:2px 8px; border-radius:999px; font-size:11px;">${escapeHTML(labelText)}</span>`);
                }
                
                // 頻度表示を追加
                let frequencyBadge = '';
                if (hypothesis.frequency && hypothesis.frequency.type === 'weekly') {
                    frequencyBadge = `<span style="display: inline-block; padding: 2px 8px; background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 999px; font-size: 11px; font-weight: 600; margin-left: 8px;">週${hypothesis.frequency.count || 3}回</span>`;
                } else if (hypothesis.frequency && hypothesis.frequency.type === 'weekdays') {
                    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
                    const days = (hypothesis.frequency.weekdays || []).map(d => weekdayNames[d]).join('・');
                    frequencyBadge = `<span style="display: inline-block; padding: 2px 8px; background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3); border-radius: 999px; font-size: 11px; font-weight: 600; margin-left: 8px;">${days}</span>`;
                }
                
                const achievedDaysCount = Object.keys(hypothesis.achievements || {}).length;
                item.innerHTML = `
                    <h3 class="hypothesis-title">${escapeHTML(hypothesis.title)}${frequencyBadge}</h3>
                    <p class="hypothesis-description">${escapeHTML(hypothesis.description)}</p>
                    ${stage ? `
                        <div style="margin: 12px 0; padding: 10px; background: linear-gradient(135deg, ${stage.color}15, ${stage.color}08); border-radius: 8px; border-left: 3px solid ${stage.color};">
                            <div style="font-size: 14px; font-weight: 600; color: ${stage.color}; margin-bottom: 4px;">
                                ${stage.name}
                            </div>
                            <div style="font-size: 11px; color: var(--text-secondary);">
                                ${stage.description} (スコア: ${stage.score}点)
                            </div>
                            <div style="display: flex; gap: 12px; margin-top: 6px; font-size: 11px;">
                                <span style="color: #10b981;">🔥 連続${stage.streak}日</span>
                            </div>
                        </div>
                    ` : ''}
                    <div class="hypothesis-meta">
                        <div class="hypothesis-days">📅 継続${daysPassed}日</div>
                        <div class="hypothesis-progress">✅ 達成${achievedDaysCount}日</div>
                    </div>
                    ${badges.length ? `<div class="hypothesis-intensity" style="margin-top:8px; color: var(--text-secondary); font-size:12px; display:flex; align-items:center; gap:6px;">
                        <span>💪 直近:</span> ${badges.join(' ')}
                    </div>` : ''}
                    ${(() => {
                        const todayKey = getActivityDateKey();
                        const isAchievedToday = !!(hypothesis.achievements && hypothesis.achievements[todayKey]);
                        const isFailedToday = !!(hypothesis.failures && hypothesis.failures[todayKey]);
                        if (isAchievedToday) {
                            return `
                                <div style="position: absolute; top: 10px; right: 10px; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center;">
                                    <div style="position: relative; width: 100%; height: 100%; transform: rotate(-10deg);">
                                        <div style="position: absolute; inset: 0; border: 3px solid #dc2626; border-radius: 50%; background: rgba(220, 38, 38, 0.05);"></div>
                                        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: bold; color: #dc2626; font-family: serif;">完</div>
                                    </div>
                                </div>
                            `;
                        }
                        if (isFailedToday) {
                            return `
                                <div style="position: absolute; top: 12px; right: 12px;">
                                    <span style="display:inline-block; padding:2px 8px; border-radius:999px; font-size:12px; font-weight:700; border:1px solid rgba(239,68,68,0.5); color:#ef4444; background: rgba(239,68,68,0.12);">❌ 未達成</span>
                                </div>
                            `;
                        }
                        return '';
                    })()}
                `;
                
                return item;
            };
            
            // 頻度タイプごとにセクションを作成して表示（順序を保持）
            ['daily', 'weekly', 'weekdays'].forEach(frequencyKey => {
                const frequencyData = frequencyGroups[frequencyKey];
                if (frequencyData) {
                    const section = createFrequencySection(frequencyKey, frequencyData);
                    if (section) listContainer.appendChild(section);
                }
            });
            
            // カテゴリ編集ボタンを追加
            const editButton = document.createElement('button');
            editButton.className = 'btn btn-secondary';
            editButton.style.cssText = 'width: 100%; margin-top: 16px; padding: 12px; font-size: 14px;';
            editButton.innerHTML = '⚙️ カテゴリを編集';
            editButton.onclick = editCategoryMaster;
            listContainer.appendChild(editButton);

            // ホームのチェックボタンにイベントを付与（動的生成後にアタッチ）
            try {
                listContainer.querySelectorAll('.home-check').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        try { e.stopPropagation(); } catch(_) {}
                        const id = btn.getAttribute('data-habit-id');
                        cycleTodayStatusForHabit(id);
                    }, { passive: false });
                });
            } catch(_) {}
            
        }

        // 習慣を継続
        function continueHypothesis() {
            // 継続オプションを表示するモーダル
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            
            // 週にN回の習慣かチェック
            const isWeekly = window.currentHypothesis.frequency && window.currentHypothesis.frequency.type === 'weekly';
            const weeklyCount = isWeekly ? window.currentHypothesis.frequency.count : 3;
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>🌱 習慣として継続</h3>
                    <p>この習慣を継続しますか？</p>
                </div>
                ${isWeekly ? `
                <div class="form-group" style="margin: 20px 0;">
                    <label>週の実施回数</label>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                        <span>週に</span>
                        <input type="number" id="weekly-count" min="1" max="7" value="${weeklyCount}" 
                               style="width: 50px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); text-align: center;">
                        <span>回</span>
                    </div>
                </div>
                ` : ''}
                <div class="form-group" style="margin: 20px 0;">
                    <label>継続期間を選択</label>
                    <div class="duration-selector" style="display: flex; gap: 10px; margin-top: 10px;">
                        <div class="duration-option" onclick="selectContinueDuration('short')" data-continue-duration="short" style="flex: 1; padding: 12px; border: 2px solid var(--border); border-radius: 8px; text-align: center; cursor: pointer;">
                            <h4 style="margin: 0; font-size: 14px;">短期間</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); transition: color 0.3s;" id="continue-short-text">${isWeekly ? '1〜2週間' : '7〜14日'}</p>
                        </div>
                        <div class="duration-option selected" onclick="selectContinueDuration('medium')" data-continue-duration="medium" style="flex: 1; padding: 12px; border: 2px solid var(--primary); border-radius: 8px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.1);">
                            <h4 style="margin: 0; font-size: 14px;">中期間</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); transition: color 0.3s;" id="continue-medium-text">${isWeekly ? '3〜4週間' : '21〜28日'}</p>
                        </div>
                        <div class="duration-option" onclick="selectContinueDuration('long')" data-continue-duration="long" style="flex: 1; padding: 12px; border: 2px solid var(--border); border-radius: 8px; text-align: center; cursor: pointer;">
                            <h4 style="margin: 0; font-size: 14px;">長期間</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); transition: color 0.3s;" id="continue-long-text">${isWeekly ? '5〜8週間' : '35〜56日'}</p>
                        </div>
                    </div>
                </div>
                <div class="form-group" style="margin: 20px 0;">
                    <label>
                        <input type="checkbox" id="continue-keep-records" checked> 
                        これまでの記録を引き継ぐ
                    </label>
                </div>
                <div class="form-group" style="margin: 20px 0;">
                    <label>
                        <input type="checkbox" id="continue-as-habit" checked> 
                        習慣モードで継続（黄金の習慣を目指す）
                    </label>
                </div>
                <div style="padding: 12px; background: var(--surface); border-radius: 8px; margin: 16px 0;">
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0;">
                        💡 習慣モードでは、成長ステージが表示され、継続的な達成により「黄金の習慣」を目指します。
                        記録を引き継ぐと、現在のステージとストリークが保持されます。
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                    <button class="button primary" onclick="confirmContinueHypothesis()">継続する</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // 期間をランダムに設定
            shuffleContinueDurations(isWeekly);
        }
        
        // 継続時の期間選択
        let selectedContinueDuration = 'medium';
        
        function selectContinueDuration(duration) {
            selectedContinueDuration = duration;
            document.querySelectorAll('[data-continue-duration]').forEach(opt => {
                opt.classList.remove('selected');
                opt.style.border = '2px solid var(--border)';
                opt.style.background = 'transparent';
            });
            const selected = document.querySelector(`[data-continue-duration="${duration}"]`);
            selected.classList.add('selected');
            selected.style.border = '2px solid var(--primary)';
            selected.style.background = 'rgba(59, 130, 246, 0.1)';
        }
        
        function shuffleContinueDurations(isWeekly = false) {
            const durations = isWeekly ? {
                short: { min: 1, max: 2 },   // 週
                medium: { min: 3, max: 4 },   // 週
                long: { min: 5, max: 8 }      // 週
            } : {
                short: { min: 7, max: 14 },   // 日
                medium: { min: 21, max: 28 },  // 日
                long: { min: 35, max: 56 }     // 日
            };
            
            // アニメーション用のインターバル
            let shuffleCount = 0;
            const maxShuffles = 15;
            
            const shuffleInterval = setInterval(() => {
                Object.keys(durations).forEach(key => {
                    const range = durations[key];
                    const value = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                    const textElement = document.getElementById(`continue-${key}-text`);
                    if (textElement) {
                        if (isWeekly) {
                            textElement.textContent = `${value}週間`;
                            textElement.dataset.weeks = value;
                            textElement.dataset.days = value * 7;
                        } else {
                            textElement.textContent = `${value}日`;
                            textElement.dataset.days = value;
                        }
                    }
                });
                
                shuffleCount++;
                if (shuffleCount >= maxShuffles) {
                    clearInterval(shuffleInterval);
                    // 最終的な値を設定
                    Object.keys(durations).forEach(key => {
                        const range = durations[key];
                        const value = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                        const textElement = document.getElementById(`continue-${key}-text`);
                        if (textElement) {
                            if (isWeekly) {
                                textElement.textContent = `${value}週間`;
                                textElement.dataset.weeks = value;
                                textElement.dataset.days = value * 7;
                            } else {
                                textElement.textContent = `${value}日`;
                                textElement.dataset.days = value;
                            }
                            textElement.style.color = 'var(--primary)';
                            setTimeout(() => {
                                textElement.style.color = 'var(--text-secondary)';
                            }, 500);
                        }
                    });
                }
            }, 100);
        }
        
        // 継続を確定
        function confirmContinueHypothesis() {
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            
            if (index !== -1) {
                const keepRecords = document.getElementById('continue-keep-records').checked;
                const asHabit = document.getElementById('continue-as-habit').checked;
                
                // 週にN回の習慣の場合、回数を更新
                const isWeekly = window.currentHypothesis.frequency && window.currentHypothesis.frequency.type === 'weekly';
                if (isWeekly) {
                    const weeklyCountInput = document.getElementById('weekly-count');
                    if (weeklyCountInput) {
                        const newCount = parseInt(weeklyCountInput.value);
                        if (newCount >= 1 && newCount <= 7) {
                            data.currentHypotheses[index].frequency.count = newCount;
                        }
                    }
                }
                
                // 選択された期間の日数を取得
                const durationElement = document.querySelector(`[data-continue-duration="${selectedContinueDuration}"] p`);
                const duration = parseInt(durationElement.dataset.days);
                
                // 期間を設定
                const additionalDays = duration;
                if (keepRecords) {
                    // 記録を引き継ぐ場合は現在の期間に追加
                    data.currentHypotheses[index].totalDays += additionalDays;
                } else {
                    // 記録をリセットする場合
                    data.currentHypotheses[index].totalDays = additionalDays;
                    data.currentHypotheses[index].achievements = {};
                    data.currentHypotheses[index].intensity = {};
                    data.currentHypotheses[index].startDate = new Date().toISOString();
                    // ステージもリセット
                    delete data.currentHypotheses[index].currentStage;
                }
                
                // 習慣モードフラグを設定
                data.currentHypotheses[index].habitMode = asHabit;
                data.currentHypotheses[index].continuedAt = new Date().toISOString();
                data.currentHypotheses[index].isContinuation = true;
                
                // カード獲得履歴をリセット（新しい期間でカードを獲得できるように）
                data.currentHypotheses[index].cardAcquisitionHistory = {
                    sevenDays: [],
                    weeklyComplete: [],
                    completion: false
                };
                delete data.currentHypotheses[index].finalAchievementRate;
                
                saveData(data);
                
                window.currentHypothesis = data.currentHypotheses[index];
                updateCalendar();
                updateProgress();
                
                // モーダルを閉じる
                document.querySelector('.overlay').remove();
                
                // 完了オプションを非表示にして、通常の進捗画面に戻る
                document.getElementById('completion-options').style.display = 'none';
                document.getElementById('completion-report-section').style.display = 'none';
                
                // 成功メッセージ
                const message = duration === 'unlimited' 
                    ? '✨ 習慣として無期限で継続します！'
                    : `✨ 習慣として${duration}日間継続します！`;
                showNotification(message, 'success');
                
                // 習慣モードの場合、現在のステージを表示
                if (asHabit) {
                    const stage = window.calculateHabitStage(window.currentHypothesis);
                    if (stage) {
                        setTimeout(() => {
                            showCardEffect(
                                `現在のステージ: ${stage.name}`,
                                stage.description,
                                stage.color
                            );
                        }, 1000);
                    }
                }
            }
        }

        // 修正して継続
        function modifyAndContinue() {
            // 修正オプションを表示するモーダル
            const overlay = document.createElement('div');
            overlay.className = 'overlay active';
            const modal = document.createElement('div');
            modal.className = 'skip-modal active';
            modal.style.width = '90%';
            modal.style.maxWidth = '500px';
            
            // 週にN回の習慣かチェック
            const isWeekly = window.currentHypothesis.frequency && window.currentHypothesis.frequency.type === 'weekly';
            const weeklyCount = isWeekly ? window.currentHypothesis.frequency.count : 3;
            
            modal.innerHTML = `
                <div class="modal-header">
                    <h3>✏️ 習慣内容を修正して継続</h3>
                    <p>習慣の内容を調整できます</p>
                </div>
                <div class="form-group" style="margin: 20px 0;">
                    <label>習慣名</label>
                    <input type="text" id="modify-title" value="${window.currentHypothesis.title}" 
                           style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
                </div>
                <div class="form-group" style="margin: 20px 0;">
                    <label>説明</label>
                    <textarea id="modify-description" rows="3" 
                              style="width: 100%; padding: 12px; border-radius: 8px; border: 1px solid var(--border);">${window.currentHypothesis.description}</textarea>
                </div>
                ${isWeekly ? `
                <div class="form-group" style="margin: 20px 0;">
                    <label>週の実施回数</label>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                        <span>週に</span>
                        <input type="number" id="modify-weekly-count" min="1" max="7" value="${weeklyCount}" 
                               style="width: 50px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); text-align: center;">
                        <span>回</span>
                    </div>
                </div>
                ` : ''}
                <div class="form-group" style="margin: 20px 0;">
                    <label>継続期間を選択</label>
                    <div class="duration-selector" style="display: flex; gap: 10px; margin-top: 10px;">
                        <div class="duration-option" onclick="selectModifyDuration('short')" data-modify-duration="short" style="flex: 1; padding: 12px; border: 2px solid var(--border); border-radius: 8px; text-align: center; cursor: pointer;">
                            <h4 style="margin: 0; font-size: 14px;">短期間</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); transition: color 0.3s;" id="modify-short-text">${isWeekly ? '1〜2週間' : '7〜14日'}</p>
                        </div>
                        <div class="duration-option selected" onclick="selectModifyDuration('medium')" data-modify-duration="medium" style="flex: 1; padding: 12px; border: 2px solid var(--primary); border-radius: 8px; text-align: center; cursor: pointer; background: rgba(59, 130, 246, 0.1);">
                            <h4 style="margin: 0; font-size: 14px;">中期間</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); transition: color 0.3s;" id="modify-medium-text">${isWeekly ? '3〜4週間' : '21〜28日'}</p>
                        </div>
                        <div class="duration-option" onclick="selectModifyDuration('long')" data-modify-duration="long" style="flex: 1; padding: 12px; border: 2px solid var(--border); border-radius: 8px; text-align: center; cursor: pointer;">
                            <h4 style="margin: 0; font-size: 14px;">長期間</h4>
                            <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-secondary); transition: color 0.3s;" id="modify-long-text">${isWeekly ? '5〜8週間' : '35〜56日'}</p>
                        </div>
                    </div>
                </div>
                <div class="form-group" style="margin: 20px 0;">
                    <label>
                        <input type="checkbox" id="modify-keep-records" checked> 
                        これまでの記録を引き継ぐ
                    </label>
                </div>
                <div style="padding: 12px; background: var(--surface); border-radius: 8px; margin: 16px 0;">
                    <p style="font-size: 12px; color: var(--text-secondary); margin: 0;">
                        💡 習慣の内容を変更しても、これまでの達成記録とステージは保持されます。
                        新しい目標に向けて、現在の進捗から継続できます。
                    </p>
                </div>
                <div class="modal-footer">
                    <button class="button secondary" onclick="this.closest('.overlay').remove()">キャンセル</button>
                    <button class="button primary" onclick="confirmModifyAndContinue()">変更して継続</button>
                </div>
            `;
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            
            // 期間をランダムに設定
            shuffleModifyDurations(isWeekly);
        }
        
        // 修正時の期間選択
        let selectedModifyDuration = 'medium';
        
        function selectModifyDuration(duration) {
            selectedModifyDuration = duration;
            document.querySelectorAll('[data-modify-duration]').forEach(opt => {
                opt.classList.remove('selected');
                opt.style.border = '2px solid var(--border)';
                opt.style.background = 'transparent';
            });
            const selected = document.querySelector(`[data-modify-duration="${duration}"]`);
            selected.classList.add('selected');
            selected.style.border = '2px solid var(--primary)';
            selected.style.background = 'rgba(59, 130, 246, 0.1)';
        }
        
        function shuffleModifyDurations(isWeekly = false) {
            const durations = isWeekly ? {
                short: { min: 1, max: 2 },   // 週
                medium: { min: 3, max: 4 },   // 週
                long: { min: 5, max: 8 }      // 週
            } : {
                short: { min: 7, max: 14 },   // 日
                medium: { min: 21, max: 28 },  // 日
                long: { min: 35, max: 56 }     // 日
            };
            
            // アニメーション用のインターバル
            let shuffleCount = 0;
            const maxShuffles = 15;
            
            const shuffleInterval = setInterval(() => {
                Object.keys(durations).forEach(key => {
                    const range = durations[key];
                    const value = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                    const textElement = document.getElementById(`modify-${key}-text`);
                    if (textElement) {
                        if (isWeekly) {
                            textElement.textContent = `${value}週間`;
                            textElement.dataset.weeks = value;
                            textElement.dataset.days = value * 7;
                        } else {
                            textElement.textContent = `${value}日`;
                            textElement.dataset.days = value;
                        }
                    }
                });
                
                shuffleCount++;
                if (shuffleCount >= maxShuffles) {
                    clearInterval(shuffleInterval);
                    // 最終的な値を設定
                    Object.keys(durations).forEach(key => {
                        const range = durations[key];
                        const value = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
                        const textElement = document.getElementById(`modify-${key}-text`);
                        if (textElement) {
                            if (isWeekly) {
                                textElement.textContent = `${value}週間`;
                                textElement.dataset.weeks = value;
                                textElement.dataset.days = value * 7;
                            } else {
                                textElement.textContent = `${value}日`;
                                textElement.dataset.days = value;
                            }
                            textElement.style.color = 'var(--primary)';
                            setTimeout(() => {
                                textElement.style.color = 'var(--text-secondary)';
                            }, 500);
                        }
                    });
                }
            }, 100);
        }
        
        // 修正して継続を確定
        function confirmModifyAndContinue() {
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            
            if (index !== -1) {
                const newTitle = document.getElementById('modify-title').value.trim();
                const newDescription = document.getElementById('modify-description').value.trim();
                const keepRecords = document.getElementById('modify-keep-records').checked;
                
                // 週にN回の習慣の場合、回数を更新
                const isWeekly = window.currentHypothesis.frequency && window.currentHypothesis.frequency.type === 'weekly';
                if (isWeekly) {
                    const weeklyCountInput = document.getElementById('modify-weekly-count');
                    if (weeklyCountInput) {
                        const newCount = parseInt(weeklyCountInput.value);
                        if (newCount >= 1 && newCount <= 7) {
                            data.currentHypotheses[index].frequency.count = newCount;
                        }
                    }
                }
                
                // 選択された期間の日数を取得
                const durationElement = document.querySelector(`[data-modify-duration="${selectedModifyDuration}"] p`);
                const duration = parseInt(durationElement.dataset.days);
                
                if (!newTitle) {
                    alert('習慣名を入力してください');
                    return;
                }
                
                // タイトルと説明を更新
                data.currentHypotheses[index].title = newTitle;
                data.currentHypotheses[index].description = newDescription;
                
                // 修正履歴を記録
                if (!data.currentHypotheses[index].modificationHistory) {
                    data.currentHypotheses[index].modificationHistory = [];
                }
                data.currentHypotheses[index].modificationHistory.push({
                    date: new Date().toISOString(),
                    previousTitle: window.currentHypothesis.title,
                    previousDescription: window.currentHypothesis.description,
                    newTitle: newTitle,
                    newDescription: newDescription
                });
                
                // 期間を設定
                const additionalDays = duration;
                if (keepRecords) {
                    // 記録を引き継ぐ場合は現在の期間に追加
                    data.currentHypotheses[index].totalDays += additionalDays;
                } else {
                    // 記録をリセットする場合
                    data.currentHypotheses[index].totalDays = additionalDays;
                    data.currentHypotheses[index].achievements = {};
                    data.currentHypotheses[index].intensity = {};
                    data.currentHypotheses[index].startDate = new Date().toISOString();
                    delete data.currentHypotheses[index].currentStage;
                }
                
                // 習慣モードと継続フラグを設定
                data.currentHypotheses[index].habitMode = true;
                data.currentHypotheses[index].modifiedAt = new Date().toISOString();
                data.currentHypotheses[index].isContinuation = true;
                
                // カード獲得履歴をリセット
                data.currentHypotheses[index].cardAcquisitionHistory = {
                    sevenDays: [],
                    weeklyComplete: [],
                    completion: false
                };
                delete data.currentHypotheses[index].finalAchievementRate;
                
                saveData(data);
                
                window.currentHypothesis = data.currentHypotheses[index];
                updateCalendar();
                updateProgress();
                
                // モーダルを閉じる
                document.querySelector('.overlay').remove();
                
                // 完了オプションを非表示にして、通常の進捗画面に戻る
                document.getElementById('completion-options').style.display = 'none';
                document.getElementById('completion-report-section').style.display = 'none';
                
                // 成功メッセージ
                showNotification(`✨ 「${newTitle}」として継続します！`, 'success');
                
                // 現在のステージを表示
                const stage = window.calculateHabitStage(window.currentHypothesis);
                if (stage) {
                    setTimeout(() => {
                        showCardEffect(
                            `現在のステージ: ${stage.name}`,
                            stage.description,
                            stage.color
                        );
                    }, 1000);
                }
            }
        }

        // 習慣を完了
        function completeHypothesis(showHome = true) {
            // completeHypothesis
            
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            
            // index for current hypothesis
            
            if (index !== -1) {
                const hypothesis = data.currentHypotheses[index];
                hypothesis.completedDate = new Date().toISOString();
                
                // finalAchievementRateが設定されていない場合のみ計算（通常はshowCompletionOptionsで設定済み）
                if (!hypothesis.finalAchievementRate && hypothesis.finalAchievementRate !== 0) {
                    const achievedDays = Object.keys(hypothesis.achievements || {}).length;
                    const targetDays = getTargetDaysForHypothesis(hypothesis);
                    let finalRate = targetDays > 0 ? Math.round((achievedDays / targetDays) * 100) : 0;

                    // 達成率減少ペナルティの適用
                    if (hypothesis.achievementDecrease) {
                        finalRate = Math.max(0, finalRate - hypothesis.achievementDecrease);
                    }
                    
                    hypothesis.finalAchievementRate = finalRate;
                }
                
                // ダブルオアナッシングが有効かチェック
                let hasDoubleOrNothing = false;
                if (data.cards && data.cards.activeEffects) {
                    hasDoubleOrNothing = data.cards.activeEffects.some(effect => 
                        effect.cardId === 'double_or_nothing'
                    );
                }
                
                // ダブルオアナッシングの効果を適用
                if (hasDoubleOrNothing && hypothesis.finalAchievementRate < 100) {
                    // 100%未満の場合はペナルティカードを2枚付与
                    const penaltyCards = ['extension_card', 'short_term', 'achievement_decrease', 'hard_mode', 'reset_risk'];
                    
                    for (let i = 0; i < 2; i++) {
                        const randomCard = penaltyCards[Math.floor(Math.random() * penaltyCards.length)];
                        data.cards.pendingPenalties.push({
                            cardId: randomCard,
                            acquiredDate: new Date().toISOString()
                        });
                    }
                    
                    // ダブルオアナッシングを消費
                    data.cards.activeEffects = data.cards.activeEffects.filter(effect =>
                        effect.cardId !== 'double_or_nothing'
                    );
                    
                    // エフェクトを表示
                    setTimeout(() => {
                        showCardEffect('ダブルオアナッシング発動！', '100%未満のため、ペナルティカードを2枚獲得...', '#ef4444');
                    }, 500);
                }
                
                // 習慣完了時のカード取得処理
                // showCompletionOptionsで既に取得済みかチェック
                if (!hypothesis.cardAcquisitionHistory) {
                    hypothesis.cardAcquisitionHistory = {
                        sevenDays: [],
                        weeklyComplete: [],
                        completion: false
                    };
                }
                
                // まだ完了時のカードを取得していない場合のみ取得
                if (!hypothesis.cardAcquisitionHistory.completion) {
                    // 達成率に基づいてカードを取得
                    const cards = getCardsBasedOnAchievement(hypothesis.finalAchievementRate, hypothesis);
                    
                    if (cards.length > 0) {
                        // カードをインベントリに追加
                        cards.forEach(cardId => {
                            addCardToInventory(cardId);
                        });
                        
                        // カード取得履歴を更新
                        hypothesis.cardAcquisitionHistory.completion = true;
                        
                        // カード獲得演出
                        setTimeout(() => {
                            window.showCardAcquisition(cards, () => {
                                const achievementText = hypothesis.finalAchievementRate === 100 ? 
                                    '完璧な達成！' : 
                                    `達成率 ${hypothesis.finalAchievementRate}%`;
                                showNotification(`🎉 習慣完了！${achievementText} 報酬カードを${cards.length}枚獲得！`, 'success');
                            });
                        }, 1000);
                    } else {
                        // カードがなくてもフラグは更新
                        hypothesis.cardAcquisitionHistory.completion = true;
                    }
                }
                
                // 完了リストに追加
                data.completedHypotheses.push(hypothesis);
                
                // 現在のリストから削除
                data.currentHypotheses.splice(index, 1);
                
                saveData(data);
                
                if (showHome) {
                    showNotification('✅ 習慣の検証が完了しました！', 'success');
                    showHomeView();
                }
            }
        }

        // 習慣達成時のカード取得チェック
        function checkCardAcquisitionOnAchievement(dateKey) {
            let data = loadData();
            const hypothesis = window.currentHypothesis;
            
            if (!hypothesis || !hypothesis.id) {
                return;
            }
            
            // カード取得履歴の初期化
            if (!hypothesis.cardAcquisitionHistory) {
                hypothesis.cardAcquisitionHistory = {
                    sevenDays: [], // 7日達成時のカード取得履歴
                    weeklyComplete: [], // 週間達成時のカード取得履歴
                    completion: false // 習慣完了時のカード取得済みフラグ
                };
            }
            
            const frequency = hypothesis.frequency;
            
            // 毎日の習慣の場合
            if (!frequency || frequency.type === 'daily') {
                // 7回達成のチェック（7日経過ではなく、7回達成でカード取得）
                const achievedCount = Object.keys(hypothesis.achievements || {}).length;
                const currentMilestone = Math.floor(achievedCount / 7);
                const lastMilestone = hypothesis.cardAcquisitionHistory.sevenDays.length;
                
                // 新しいマイルストーンに到達したか確認（7, 14, 21, 28...回）
                if (currentMilestone > lastMilestone && achievedCount >= 7) {
                    // 新しい7回達成 - カード取得
                    const cardId = getRandomRewardCard();
                    if (cardId) {
                        data = addCardToInventory(cardId); // 更新されたdataを取得
                        hypothesis.cardAcquisitionHistory.sevenDays.push({
                            date: new Date().toISOString(),
                            cardId: cardId,
                            milestone: currentMilestone,
                            achievedCount: achievedCount
                        });
                        
                        // カード獲得演出
                        window.showCardAcquisition([cardId], () => {
                            showNotification('🎉 7回達成！報酬カードを獲得しました！', 'success');
                        });
                    }
                }
            }
            
            // 週間N回の習慣の場合
            if (frequency && frequency.type === 'weekly') {
                // 現在の週番号を取得
                const [year, month, day] = dateKey.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                const weekNum = getWeekNumberForCard(date, hypothesis.startDate);
                
                // この週の達成状況を確認
                let weekAchieved = 0;
                const weekStart = getWeekStartDate(date, hypothesis.startDate);
                
                for (let i = 0; i < 7; i++) {
                    const checkDate = new Date(weekStart);
                    checkDate.setDate(weekStart.getDate() + i);
                    const checkKey = dateKeyLocal(checkDate);
                    if (hypothesis.achievements && hypothesis.achievements[checkKey]) {
                        weekAchieved++;
                    }
                }
                
                // 週の目標達成チェック
                const weeklyTarget = frequency.count || 3;
                const weekKey = `week_${weekNum}`;
                
                if (weekAchieved >= weeklyTarget && 
                    !hypothesis.cardAcquisitionHistory.weeklyComplete.includes(weekKey)) {
                    // 週間目標達成 - カード取得
                    const cardId = getRandomRewardCard();
                    if (cardId) {
                        data = addCardToInventory(cardId); // 更新されたdataを取得
                        hypothesis.cardAcquisitionHistory.weeklyComplete.push(weekKey);
                        
                        // カード獲得演出
                        window.showCardAcquisition([cardId], () => {
                            showNotification(`🎉 第${weekNum}週の目標達成！報酬カードを獲得しました！`, 'success');
                        });
                    }
                }
            }
            
            // データを保存（重要：cardAcquisitionHistoryを確実に保存）
            const index = data.currentHypotheses.findIndex(h => h.id === hypothesis.id);
            if (index !== -1) {
                // 重要：hypothesis変数の変更をdata.currentHypothesesに確実に反映
                data.currentHypotheses[index].cardAcquisitionHistory = hypothesis.cardAcquisitionHistory;
                data.currentHypotheses[index].achievements = hypothesis.achievements;
                saveData(data);
                
                // window.currentHypothesisも更新
                window.currentHypothesis.cardAcquisitionHistory = hypothesis.cardAcquisitionHistory;
            }
        }
        
        // 週番号を取得（カード取得用）
        function getWeekNumberForCard(date, startDateStr) {
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            const start = new Date(startDateStr);
            start.setHours(0, 0, 0, 0);
            const days = Math.floor((d - start) / (24 * 60 * 60 * 1000));
            return Math.floor(days / 7) + 1;
        }
        
        // 週の開始日を取得
        function getWeekStartDate(date, startDateStr) {
            const weekNum = getWeekNumberForCard(date, startDateStr);
            const start = new Date(startDateStr);
            start.setHours(0, 0, 0, 0);
            start.setDate(start.getDate() + (weekNum - 1) * 7);
            return start;
        }
        
        // ランダムな報酬カードを取得
        function getRandomRewardCard() {
            const data = loadData();
            const DISABLED_CARDS = new Set(['skip_ticket','achievement_boost','achievement_booster','quick_start']);
            const rewardPoolBase = Object.keys(CARD_MASTER).filter(id => 
                CARD_MASTER[id].type === 'reward' && !DISABLED_CARDS.has(id)
            );
            
            // 直近10回の報酬カードをブロック
            const history = (data.cards && Array.isArray(data.cards.dropHistory)) ? data.cards.dropHistory : [];
            const recentRewards = history.filter(cardId => {
                const card = CARD_MASTER[cardId];
                return card && card.type === 'reward';
            }).slice(0, 10);
            const blocked = new Set(recentRewards);
            
            let rewardPool = rewardPoolBase.filter(id => !blocked.has(id));
            if (rewardPool.length === 0) {
                const oldestBlocked = recentRewards[recentRewards.length - 1];
                rewardPool = rewardPoolBase.filter(id => id !== oldestBlocked);
                if (rewardPool.length === 0) rewardPool = rewardPoolBase;
            }
            
            if (rewardPool.length > 0) {
                // conversion_magicの特別処理
                if (rewardPool.includes('conversion_magic')) {
                    if (Math.random() < 0.01) return 'conversion_magic';
                    const ex = rewardPool.filter(id => id !== 'conversion_magic');
                    if (ex.length > 0) return ex[Math.floor(Math.random() * ex.length)];
                }
                return rewardPool[Math.floor(Math.random() * rewardPool.length)];
            }
            
            return null;
        }
        
        // カードをインベントリに追加
        function addCardToInventory(cardId) {
            if (!cardId) {
                return;
            }
            
            const data = loadData();
            const card = CARD_MASTER[cardId];
            
            if (!card) {
                return;
            }
            
            if (card.type === 'reward') {
                data.cards.inventory.push({
                    cardId: cardId,
                    acquiredDate: new Date().toISOString(),
                    used: false
                });
                
                // ドロップ履歴に追加
                if (!data.cards.dropHistory) data.cards.dropHistory = [];
                data.cards.dropHistory.unshift(cardId);
                if (data.cards.dropHistory.length > 100) {
                    data.cards.dropHistory = data.cards.dropHistory.slice(0, 100);
                }
            } else if (card.type === 'penalty') {
                data.cards.pendingPenalties.push({
                    cardId: cardId,
                    acquiredDate: new Date().toISOString()
                });
            }
            
            // saveData(data); // 呼び出し元で保存するため削除
            return data; // 更新されたdataを返す
        }

        // 達成率に基づいてカードを取得
        function getCardsBasedOnAchievement(achievementRate, hypothesis) {
            const cards = [];
            const data = loadData();
            
            // ハードモードの場合、90%未満はカードなし
            if (hypothesis && hypothesis.hardMode && achievementRate < 90) {
                return cards; // 空の配列を返す
            }
            
            // 習慣の期間からレアリティボーナスを計算
            const getDurationBonus = (days) => {
                if (days >= 30) return 0.4;  // 長期（30日以上）：レア率+40%
                if (days >= 21) return 0.25; // 中長期（21-29日）：レア率+25%
                if (days >= 14) return 0.15; // 中期（14-20日）：レア率+15%
                if (days >= 7) return 0.05;  // 短中期（7-13日）：レア率+5%
                return 0;                     // 短期（6日以下）：ボーナスなし
            };
            
            const durationBonus = hypothesis ? getDurationBonus(hypothesis.totalDays) : 0;
            
            // デバッグ用：期間ボーナスをコンソールに出力
            if (hypothesis) {
                console.log(`習慣期間: ${hypothesis.totalDays}日, 期間ボーナス: +${(durationBonus * 100).toFixed(0)}%`);
            }
            
            // パーフェクトボーナスが有効かチェック
            let hasPerfectBonus = false;
            if (data.cards && data.cards.activeEffects) {
                hasPerfectBonus = data.cards.activeEffects.some(effect => 
                    effect.cardId === 'perfect_bonus' && !effect.targetHypothesisId
                );
            }
            // サプライズブーストは廃止
            
            // ドロップ率ブースト（Lucky Seven）
            let dropMultiplier = 1.0;
            if (data.cards && data.cards.activeEffects) {
                const dropBoost = data.cards.activeEffects.find(e => e.cardId === 'lucky_seven');
                if (dropBoost && dropBoost.multiplier) {
                    dropMultiplier = Math.max(1.0, Number(dropBoost.multiplier) || 1.0);
                }
            }

            // レア保証（Streak Bonus）
            let hasStreakGuarantee = false;
            if (data.cards && data.cards.activeEffects) {
                hasStreakGuarantee = data.cards.activeEffects.some(e => e.cardId === 'streak_bonus' || e.type === 'streak_rare_guarantee');
            }

            if (achievementRate === 100) {
                // 報酬カード（全報酬カードから等確率で1枚）
            const DISABLED_CARDS = new Set(['skip_ticket','achievement_boost','achievement_booster','quick_start']);
                const rewardPoolBase = Object.keys(CARD_MASTER).filter(id => CARD_MASTER[id].type === 'reward' && !DISABLED_CARDS.has(id));
                
                // 直近10回の報酬カードのみをブロック（ペナルティカードは含めない）
                const history = (data.cards && Array.isArray(data.cards.dropHistory)) ? data.cards.dropHistory : [];
                const recentRewards = history.filter(cardId => {
                    const card = CARD_MASTER[cardId];
                    return card && card.type === 'reward';
                }).slice(0, 10);
                const blocked = new Set(recentRewards);
                
                let rewardPool = rewardPoolBase.filter(id => !blocked.has(id));
                if (rewardPool.length === 0) {
                    // 全除外時は、最も古いカードから順に解禁
                    const oldestBlocked = recentRewards[recentRewards.length - 1];
                    rewardPool = rewardPoolBase.filter(id => id !== oldestBlocked);
                    if (rewardPool.length === 0) rewardPool = rewardPoolBase;
                }
                
                if (rewardPool.length > 0) {
                    const pickFromPool = (pool) => {
                        if (pool.includes('conversion_magic')) {
                            if (Math.random() < 0.01) return 'conversion_magic';
                            const ex = pool.filter(id => id !== 'conversion_magic');
                            if (ex.length > 0) return ex[Math.floor(Math.random() * ex.length)];
                        }
                        return pool[Math.floor(Math.random() * pool.length)];
                    };
                    const pick = pickFromPool(rewardPool);
                    cards.push(pick);
                }
                // パーフェクトボーナスが有効なら追加で1枚（同様に等確率）
                if (hasPerfectBonus) {
                    // 1枚目と被らないように再フィルタ
                    let extraPool = rewardPool.filter(id => !cards.includes(id));
                    if (extraPool.length === 0) extraPool = rewardPool;
                    if (extraPool.length > 0) {
                        const pickFromPool = (pool) => {
                            if (pool.includes('conversion_magic')) {
                                if (Math.random() < 0.01) return 'conversion_magic';
                                const ex = pool.filter(id => id !== 'conversion_magic');
                                if (ex.length > 0) return ex[Math.floor(Math.random() * ex.length)];
                            }
                            return pool[Math.floor(Math.random() * pool.length)];
                        };
                        const extra = pickFromPool(extraPool);
                        cards.push(extra);
                    }
                    data.cards.activeEffects = (data.cards.activeEffects || []).filter(e => e.cardId !== 'perfect_bonus');
                    saveData(data);
                    setTimeout(() => {
                        showCardEffect('パーフェクトボーナス発動！', '追加で報酬カードを1枚獲得！', '#f59e0b');
                    }, 300);
                }
            } else if (achievementRate >= 80) {
                // 80-99%: 報酬カードを等確率で1枚
                const DISABLED_CARDS = new Set(['skip_ticket','achievement_boost','achievement_booster','quick_start']);
                const rewardPoolBase = Object.keys(CARD_MASTER).filter(id => CARD_MASTER[id].type === 'reward' && !DISABLED_CARDS.has(id));
                
                // 直近10回の報酬カードのみをブロック（ペナルティカードは含めない）
                const history = (data.cards && Array.isArray(data.cards.dropHistory)) ? data.cards.dropHistory : [];
                const recentRewards = history.filter(cardId => {
                    const card = CARD_MASTER[cardId];
                    return card && card.type === 'reward';
                }).slice(0, 10);
                const blocked = new Set(recentRewards);
                
                let rewardPool = rewardPoolBase.filter(id => !blocked.has(id));
                if (rewardPool.length === 0) {
                    // 全除外時は、最も古いカードから順に解禁
                    const oldestBlocked = recentRewards[recentRewards.length - 1];
                    rewardPool = rewardPoolBase.filter(id => id !== oldestBlocked);
                    if (rewardPool.length === 0) rewardPool = rewardPoolBase;
                }
                
                if (rewardPool.length > 0) {
                    const pickFromPool = (pool) => {
                        if (pool.includes('conversion_magic')) {
                            if (Math.random() < 0.01) return 'conversion_magic';
                            const ex = pool.filter(id => id !== 'conversion_magic');
                            if (ex.length > 0) return ex[Math.floor(Math.random() * ex.length)];
                        }
                        return pool[Math.floor(Math.random() * pool.length)];
                    };
                    const pick = pickFromPool(rewardPool);
                    cards.push(pick);
                }
            } else if (achievementRate < 60) {
                // 59%以下: ペナルティカードを等確率で1枚
                const penaltyPool = Object.keys(CARD_MASTER).filter(id => CARD_MASTER[id].type === 'penalty');
                if (penaltyPool.length > 0) {
                    const pick = penaltyPool[Math.floor(Math.random() * penaltyPool.length)];
                    cards.push(pick);
                }
            }
            // 60-79%は何も獲得しない（サプライズブーストは廃止）
            
            return cards;
        }

        // サプライズブースト関連の機能は廃止

        // 履歴画面を表示
        function showHistoryView() {
            resetScrollToTop();
            // 表示切替
            document.getElementById('home-view').style.display = 'none';
            document.getElementById('new-hypothesis-view').style.display = 'none';
            { const el = document.getElementById('shuffle-view'); if (el) el.style.display = 'none'; }
            document.getElementById('progress-view').style.display = 'none';
            document.getElementById('history-view').style.display = 'block';
            document.getElementById('stats-view').style.display = 'none';
            document.getElementById('points-view').style.display = 'none';
            document.getElementById('cards-view').style.display = 'none';
            
            updateNavigation('history');
            
            // リストを更新
            try { updateHistoryList(); } catch(_) {}
            
            // ヘッダーのポイント表示は履歴でも表示
            const pointDisplay = document.getElementById('point-display');
            if (pointDisplay) pointDisplay.style.display = 'flex';
        }

        // 履歴リストを更新
        function updateHistoryList() {
            const data = loadData();
            const container = document.getElementById('history-list');
            if (!container) return;
            const list = Array.isArray(data.completedHypotheses) ? data.completedHypotheses.slice() : [];
            if (list.length === 0) {
                container.innerHTML = '<p style="color: var(--text-secondary);">完了した習慣はまだありません</p>';
                return;
            }
            // 最新順に並べ替え（終了日が新しい順、なければ開始日）
            list.sort((a, b) => {
                const as = new Date(a.startDate);
                const bs = new Date(b.startDate);
                const ae = new Date(as); ae.setDate(ae.getDate() + (a.totalDays || 0) - 1);
                const be = new Date(bs); be.setDate(be.getDate() + (b.totalDays || 0) - 1);
                return be - ae;
            });
            // レンダリング
            const pad = (n) => String(n).padStart(2, '0');
            const fmt = (d) => `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
            container.innerHTML = list.map(h => {
                const s = new Date(h.startDate);
                const e = new Date(s); e.setDate(e.getDate() + (h.totalDays || 0) - 1);
                const total = Math.max(0, (h.totalDays || 0));
                const achieved = h.achievements ? Object.keys(h.achievements).length : 0;
                const rate = total > 0 ? Math.round((achieved/total)*100) : 0;
                const cat = (h.category || 'その他');
                const title = escapeHTML(h.title || '（無題）');
                const desc = escapeHTML(h.description || '');
                return `
                    <div class="history-item" style="border:1px solid var(--border); border-radius:12px; padding:12px; margin-bottom:8px; background:var(--surface);">
                        <div style="font-weight:700;">${title}</div>
                        <div style="font-size:12px; color:var(--text-secondary); margin:4px 0;">${desc}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">カテゴリ: ${escapeHTML(cat)} / 期間: ${fmt(s)} 〜 ${fmt(e)}</div>
                        <div style="margin-top:6px; font-size:12px;">
                            達成: <strong>${achieved}</strong> / ${total} 日（${rate}%）
                        </div>
                    </div>
                `;
            }).join('');
        }

        // 統計画面を表示
        function showStatsView() { try { showHomeView(); } catch(_) {} }
            /*
            // チャレンジ統計を更新
            updateChallengeStats();
            
            // ジャーナル統計を更新
            updateJournalStats();
            
            // 体重グラフを更新
            if (typeof updateWeightChart === 'function') {
                updateWeightChart();
            }
            
            const data = loadData();
            const totalHypotheses = data.currentHypotheses.length + data.completedHypotheses.length;
            let totalAchievement = 0; // 習慣平均用
            let uniqueDates = new Set();
            let weightedAchieved = 0; // 全体重み付き達成の合計

            const today = new Date();
            today.setHours(0,0,0,0);

            const all = [...data.currentHypotheses, ...data.completedHypotheses];
            all.forEach(hypothesis => {
                const start = new Date(hypothesis.startDate);
                start.setHours(0,0,0,0);
                const theoreticalEnd = new Date(start);
                theoreticalEnd.setDate(start.getDate() + (hypothesis.totalDays || 0) - 1);
                const end = hypothesis.completedDate ? new Date(hypothesis.completedDate) : today;
                end.setHours(0,0,0,0);
                const last = theoreticalEnd < end ? theoreticalEnd : end;

                // ユニーク日を収集
                for (let d = new Date(start); d <= last; d.setDate(d.getDate() + 1)) {
                    uniqueDates.add(dateKeyLocal(d));
                }

                // 重み付き達成の集計
                const intensity = hypothesis.intensity || {};
                const achievements = hypothesis.achievements || {};
                Object.keys(achievements).forEach(key => {
                    const kd = new Date(key);
                    kd.setHours(0,0,0,0);
                    if (kd >= start && kd <= last) {
                        const mult = Number(intensity[key] ?? 1.0);
                        weightedAchieved += mult;
                    }
                });

                // 習慣ごとの平均達成率（表示用に継続）
                const timeDiff = Math.min(last.getTime(), today.getTime()) - start.getTime();
                const daysPassed = Math.min(
                    Math.max(1, Math.floor(timeDiff / (1000 * 60 * 60 * 24)) + 1),
                    hypothesis.totalDays || 0
                );
                const achievedDays = Object.keys(achievements).length;
                const achievementRate = daysPassed > 0 ? Math.round((achievedDays / daysPassed) * 100) : 0;
                totalAchievement += achievementRate;
            });

            const totalDaysUnique = uniqueDates.size;
            const avgAchievement = totalHypotheses > 0 ? Math.round(totalAchievement / totalHypotheses) : 0;
            document.getElementById('total-hypotheses').textContent = totalHypotheses;
            document.getElementById('avg-achievement').textContent = avgAchievement + '%';
            document.getElementById('total-days').textContent = totalDaysUnique;
            const wa = document.getElementById('weighted-achieved');
            if (wa) wa.textContent = (Math.round(weightedAchieved * 10) / 10).toString();

            // 習慣成長ステージの計算関数
            function calculateHabitStage(hypothesis) {
                if (!hypothesis || !hypothesis.achievements) return null;
                
                const start = new Date(hypothesis.startDate);
                start.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                // 達成日数の計算
                const achievedDays = Object.keys(hypothesis.achievements).length;
                
                // 連続達成日数の計算
                const streak = computeStreak(hypothesis);
                
                // 週単位での達成数を計算（週◯回や特定曜日の場合）
                let achievedWeeks = 0;
                if (hypothesis.frequency && (hypothesis.frequency.type === 'weekly' || hypothesis.frequency.type === 'weekdays')) {
                    const weeks = Math.ceil((today - start) / (7 * 24 * 60 * 60 * 1000));
                    for (let w = 0; w < weeks; w++) {
                        const weekStart = new Date(start);
                        weekStart.setDate(start.getDate() + w * 7);
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekStart.getDate() + 6);
                        
                        let weekAchievements = 0;
                        for (let d = new Date(weekStart); d <= weekEnd && d <= today; d.setDate(d.getDate() + 1)) {
                            const key = dateKeyLocal(d);
                            if (hypothesis.achievements[key]) weekAchievements++;
                        }
                        
                        if (hypothesis.frequency.type === 'weekly' && weekAchievements >= hypothesis.frequency.count) {
                            achievedWeeks++;
                        } else if (hypothesis.frequency.type === 'weekdays') {
                            const targetDaysInWeek = hypothesis.frequency.weekdays.filter(wd => {
                                for (let d = new Date(weekStart); d <= weekEnd && d <= today; d.setDate(d.getDate() + 1)) {
                                    if (d.getDay() === wd) return true;
                                }
                                return false;
                            }).length;
                            if (targetDaysInWeek > 0 && weekAchievements >= targetDaysInWeek * 0.8) {
                                achievedWeeks++;
                            }
                        }
                    }
                }
                
                // 基本スコアの計算
                let baseScore = achievedDays;
                if (hypothesis.frequency) {
                    if (hypothesis.frequency.type === 'weekly' || hypothesis.frequency.type === 'weekdays') {
                        baseScore = achievedWeeks * 7; // 週単位を日数換算
                    }
                }
                
                // 連続ボーナスの計算（1.0～2.0）
                let continuityBonus = 1.0;
                if (streak >= 90) {
                    continuityBonus = 2.0;
                } else if (streak >= 60) {
                    continuityBonus = 1.7;
                } else if (streak >= 30) {
                    continuityBonus = 1.5;
                } else if (streak >= 14) {
                    continuityBonus = 1.3;
                } else if (streak >= 7) {
                    continuityBonus = 1.1;
                }
                
                // 途切れペナルティ
                const totalDays = Math.floor((today - start) / (24 * 60 * 60 * 1000)) + 1;
                const achievementRate = achievedDays / totalDays;
                if (achievementRate < 0.5 && totalDays > 7) {
                    continuityBonus *= 0.8;
                }
                
                // 最終スコア
                const finalScore = Math.floor(baseScore * continuityBonus);
                
                // ステージ判定
                const stages = [
                    { name: '🌱 種まき期', minScore: 0, maxScore: 7, color: '#6b7280', description: '習慣の種を植えた段階' },
                    { name: '🌿 発芽期', minScore: 8, maxScore: 14, color: '#10b981', description: '小さな芽が出てきた' },
                    { name: '🍀 成長期', minScore: 15, maxScore: 30, color: '#3b82f6', description: '葉が増えて成長中' },
                    { name: '🌳 定着期', minScore: 31, maxScore: 60, color: '#8b5cf6', description: 'しっかりとした木に成長' },
                    { name: '🌸 開花期', minScore: 61, maxScore: 90, color: '#f59e0b', description: '花が咲き始める' },
                    { name: '🍎 収穫期', minScore: 91, maxScore: 120, color: '#ef4444', description: '実がなり収穫できる' },
                    { name: '👑 黄金の習慣', minScore: 121, maxScore: 999999, color: '#fbbf24', description: '完全に身についた習慣' }
                ];
                
                // 特別条件：連続90日以上かつ達成率90%以上で黄金の習慣
                if (streak >= 90 && achievementRate >= 0.9) {
                    return stages[6]; // 黄金の習慣
                }
                
                for (const stage of stages) {
                    if (finalScore >= stage.minScore && finalScore <= stage.maxScore) {
                        return { ...stage, score: finalScore, streak, achievementRate: Math.round(achievementRate * 100) };
                    }
                }
                
                return stages[0]; // デフォルトは種まき期
            }
            
            // 習慣成長ステージ分布
            const stageDistribution = {};
            const stages = [
                '🌱 種まき期',
                '🌿 発芽期',
                '🍀 成長期',
                '🌳 定着期',
                '🌸 開花期',
                '🍎 収穫期',
                '👑 黄金の習慣'
            ];
            
            stages.forEach(stage => {
                stageDistribution[stage] = 0;
            });
            
            // 各習慣のステージを計算
            all.forEach(h => {
                const stage = calculateHabitStage(h);
                if (stage) {
                    stageDistribution[stage.name]++;
                }
            });
            
            const levelDiv = document.getElementById('achievement-level-distribution');
            if (levelDiv) {
                levelDiv.innerHTML = '';
                const maxCount = Math.max(...Object.values(stageDistribution), 1);
                
                const stageConfigs = {
                    '🌱 種まき期': { color: '#6b7280', description: '習慣の種を植えた段階' },
                    '🌿 発芽期': { color: '#10b981', description: '小さな芽が出てきた' },
                    '🍀 成長期': { color: '#3b82f6', description: '葉が増えて成長中' },
                    '🌳 定着期': { color: '#8b5cf6', description: 'しっかりとした木に成長' },
                    '🌸 開花期': { color: '#f59e0b', description: '花が咲き始める' },
                    '🍎 収穫期': { color: '#ef4444', description: '実がなり収穫できる' },
                    '👑 黄金の習慣': { color: '#fbbf24', description: '完全に身についた習慣' }
                };
                
                stages.forEach(stageName => {
                    const count = stageDistribution[stageName];
                    const config = stageConfigs[stageName];
                    const percentage = all.length > 0 ? Math.round((count / all.length) * 100) : 0;
                    const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    
                    const row = document.createElement('div');
                    row.innerHTML = `
                        <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                            <div style="width:140px;">
                                <div style="font-size:13px; font-weight:600;">${stageName}</div>
                                <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${config.description}</div>
                            </div>
                            <div style="flex:1; background:rgba(148,163,184,0.1); border-radius:4px; height:28px; position:relative;">
                                <div style="position:absolute; left:0; top:0; height:100%; background:${config.color}; border-radius:4px; width:${barWidth}%; transition:width 0.3s;"></div>
                                <div style="position:absolute; left:8px; top:50%; transform:translateY(-50%); font-size:11px; font-weight:600; color:white; text-shadow:0 1px 2px rgba(0,0,0,0.3);">
                                    ${count}個 (${percentage}%)
                                </div>
                            </div>
                        </div>
                    `;
                    levelDiv.appendChild(row);
                });
            }

            // 曜日別達成率の計算と表示（毎日の習慣のみ）
            const weekdayStats = {};
            const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
            for (let i = 0; i < 7; i++) {
                weekdayStats[i] = { achieved: 0, total: 0 };
            }
            
            all.forEach(h => {
                // 毎日の習慣のみを対象にする
                // frequencyがない場合は従来の習慣なので毎日の習慣として扱う
                const isDailyHabit = !h.frequency || h.frequency.type === 'daily';
                
                if (!isDailyHabit) {
                    return; // 毎日の習慣でない場合はスキップ
                }
                
                const start = new Date(h.startDate);
                start.setHours(0, 0, 0, 0);
                const endDate = h.completedDate ? new Date(h.completedDate) : new Date();
                endDate.setHours(0, 0, 0, 0);
                const periodEnd = new Date(start);
                periodEnd.setDate(start.getDate() + h.totalDays - 1);
                const actualEnd = endDate < periodEnd ? endDate : periodEnd;
                
                for (let d = new Date(start); d <= actualEnd && d <= today; d.setDate(d.getDate() + 1)) {
                    const weekday = d.getDay();
                    const key = dateKeyLocal(d);
                    weekdayStats[weekday].total++;
                    if (h.achievements && h.achievements[key]) {
                        weekdayStats[weekday].achieved++;
                    }
                }
            });
            
            const weekdayDiv = document.getElementById('weekday-stats');
            if (weekdayDiv) {
                weekdayDiv.innerHTML = '';
                for (let i = 0; i < 7; i++) {
                    const stats = weekdayStats[i];
                    const rate = stats.total > 0 ? Math.round((stats.achieved / stats.total) * 100) : 0;
                    const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#3b82f6' : '#ef4444';
                    
                    const dayCard = document.createElement('div');
                    dayCard.style.cssText = 'text-align:center; padding:8px 4px; background:rgba(99,102,241,0.1); border-radius:8px; min-width: 40px;';
                    dayCard.innerHTML = `
                        <div style="font-size:12px; font-weight:600; margin-bottom:2px;">${weekdayNames[i]}</div>
                        <div style="font-size:18px; font-weight:800; color:${color};">${rate}%</div>
                        <div style="font-size:9px; color:var(--text-secondary);">${stats.achieved}/${stats.total}</div>
                    `;
                    weekdayDiv.appendChild(dayCard);
                }
            }

            // 強度ラベル使用割合のドーナツ（A/B/C分類）
            const labelCounts = {};
            const toFixed1 = (n) => (Math.round(Number(n) * 10) / 10).toFixed(1);
            all.forEach(h => {
                Object.keys(h.achievements||{}).forEach(key => {
                    const m = Number((h.intensity||{})[key] ?? 1.0);
                    // 強度値に基づいてA/B/Cに分類
                    const label = m === 0.8 ? 'A' : m === 1.2 ? 'C' : 'B';
                    labelCounts[label] = (labelCounts[label]||0) + 1;
                });
            });
            const donut = document.getElementById('donut-intensity');
            const legend = document.getElementById('donut-legend');
            if (donut && legend) {
                const total = Object.values(labelCounts).reduce((a,b)=>a+b,0) || 1;
                const entries = Object.entries(labelCounts);
                // SVGドーナツ描画
                const cx=80, cy=80, r=60, sw=20;
                let acc=0;
                const colors = ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6'];
                donut.innerHTML='';
                legend.innerHTML='';
                entries.forEach(([label,count], idx)=>{
                    const frac = count/total;
                    const start = acc * 2*Math.PI - Math.PI/2;
                    const end = (acc+frac) * 2*Math.PI - Math.PI/2;
                    acc += frac;
                    const large = (end-start) > Math.PI ? 1 : 0;
                    const x1 = cx + r*Math.cos(start), y1 = cy + r*Math.sin(start);
                    const x2 = cx + r*Math.cos(end),   y2 = cy + r*Math.sin(end);
                    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
                    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
                    path.setAttribute('d', d);
                    path.setAttribute('fill','none');
                    path.setAttribute('stroke', colors[idx%colors.length]);
                    path.setAttribute('stroke-width', String(sw));
                    donut.appendChild(path);
                    // 凡例
                    const row = document.createElement('div');
                    row.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:${colors[idx%colors.length]};border-radius:2px;margin-right:6px;"></span>${escapeHTML(label)}: ${(Math.round(frac*100))}% (${count})`;
                    legend.appendChild(row);
                });
                // 中央白ヌキ
                const hole = document.createElementNS('http://www.w3.org/2000/svg','circle');
                hole.setAttribute('cx', String(cx)); hole.setAttribute('cy', String(cy)); hole.setAttribute('r', String(r-sw/2));
                hole.setAttribute('fill', 'var(--background)');
                donut.appendChild(hole);
            }

            // 全習慣横断連続達成日数（任意の習慣で達成があれば達成日とみなす）
            const dateMap = {};
            all.forEach(h => {
                Object.keys(h.achievements||{}).forEach(k => { dateMap[k] = true; });
            });
            const keys = Object.keys(dateMap).sort();
            let longest=0, current=0;
            // longest: 連続最大
            let prev=null;
            keys.forEach(k=>{
                const d = new Date(k);
                d.setHours(0,0,0,0);
                if (prev){
                    const diff = (d - prev)/(1000*60*60*24);
                    current = (diff===1) ? (current+1) : 1;
                } else {
                    current = 1;
                }
                if (current>longest) longest=current;
                prev = d;
            });
            // current: 今日から遡って
            let cur=0; const d0=new Date(today);
            for (let d=new Date(d0); ; d.setDate(d.getDate()-1)){
                const k=dateKeyLocal(d);
                if (dateMap[k]) cur+=1; else break;
                if (d < new Date(keys[0]||today)) break; // 安全
            }
            const streakDiv = document.getElementById('streak-stats');
            if (streakDiv){
                streakDiv.innerHTML = `
                    <div>現在の連続: <span style="color:#10b981;">${cur}日</span></div>
                    <div>最長記録: <span style="color:#3b82f6;">${longest}日</span></div>
                `;
            }

            // 習慣ランキングを初期表示
            showAchievementRanking();
            
            // バッジコレクションを表示
            displayBadgeCollection();
            
            // ポイント統計を表示
            updatePointStatistics();
            
            // すべてのトグルを確実に閉じる
            closeAllStatToggles();
        */
        
        // 達成率ランキングを表示
        function showAchievementRanking() {
            const data = loadData();
            const all = data.currentHypotheses.concat(data.completedHypotheses || []);
            
            // タブのスタイル更新
            document.getElementById('ranking-achievement-tab').style.background = 'var(--primary)';
            document.getElementById('ranking-achievement-tab').style.color = 'white';
            document.getElementById('ranking-points-tab').style.background = 'var(--surface)';
            document.getElementById('ranking-points-tab').style.color = 'var(--text-primary)';
            document.getElementById('ranking-streak-tab').style.background = 'var(--surface)';
            document.getElementById('ranking-streak-tab').style.color = 'var(--text-primary)';
            
            const ranking = all.map(h=>{
                const s = new Date(h.startDate); s.setHours(0,0,0,0);
                const intensity = h.intensity||{};
                let weighted=0;
                for (let i=0;i<(h.totalDays||0);i++){
                    const d=new Date(s); d.setDate(s.getDate()+i);
                    const k=dateKeyLocal(d);
                    if ((h.achievements||{})[k]) weighted += Number(intensity[k] ?? 1.0);
                }
                const rate = (h.totalDays||0)>0 ? Math.floor(Math.min(100,(weighted/(h.totalDays))*100)) : 0;
                return { id:h.id, title:h.title, rate, totalDays:h.totalDays||0 };
            }).sort((a,b)=> b.rate - a.rate).slice(0,5);
            
            const rankDiv = document.getElementById('ranking-list');
            if (rankDiv){
                rankDiv.innerHTML = ranking.map((r,idx)=>`
                    <div class="ranking-item" style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:10px;background: ${
                        idx === 0 ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1))' :
                        idx === 1 ? 'linear-gradient(135deg, rgba(192, 192, 192, 0.1), rgba(128, 128, 128, 0.1))' :
                        idx === 2 ? 'linear-gradient(135deg, rgba(205, 127, 50, 0.1), rgba(165, 87, 10, 0.1))' :
                        'rgba(0,0,0,0.1)'
                    };">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 20px;">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`}</span>
                            <span>${escapeHTML(r.title||'Untitled')}</span>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 14px; font-weight: bold; color: #10b981;">${r.rate}%</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">${r.totalDays}日間</div>
                        </div>
                    </div>
                `).join('');
            }
        }
        
        // ポイントランキングを表示
        function showPointsRanking() {
            const data = loadData();
            const all = data.currentHypotheses.concat(data.completedHypotheses || []);
            
            // タブのスタイル更新
            document.getElementById('ranking-achievement-tab').style.background = 'var(--surface)';
            document.getElementById('ranking-achievement-tab').style.color = 'var(--text-primary)';
            document.getElementById('ranking-points-tab').style.background = 'var(--primary)';
            document.getElementById('ranking-points-tab').style.color = 'white';
            document.getElementById('ranking-streak-tab').style.background = 'var(--surface)';
            document.getElementById('ranking-streak-tab').style.color = 'var(--text-primary)';
            
            // 習慣のポイント集計用オブジェクト
            const habitPoints = {};
            
            // 各習慣の初期化とカレンダーベースのポイント計算
            all.forEach(h => {
                habitPoints[h.id] = {
                    id: h.id,
                    title: h.title,
                    totalPoints: 0,
                    achievementCount: 0,
                    bonusPoints: 0,
                    averagePoints: 0,
                    recentHistory: []
                };
                
                // まず、カレンダー（logs）から基本ポイントを計算
                if (h.logs) {
                    Object.entries(h.logs).forEach(([dateKey, log]) => {
                        if (log.completed) {
                            // 基本ポイント値（デフォルト2pt）
                            const basePointValue = h.pointValue || 2;
                            // 強度による調整
                            const intensity = log.intensity || 1.0;
                            const points = Math.round(basePointValue * intensity);
                            
                            habitPoints[h.id].totalPoints += points;
                            habitPoints[h.id].achievementCount++;
                        }
                    });
                }
                
                // 旧形式のachievementsからもポイントを計算（後方互換性）
                if (h.achievements) {
                    Object.entries(h.achievements).forEach(([dateKey, achieved]) => {
                        // logsに存在しない場合のみ加算（重複防止）
                        if (achieved && (!h.logs || !h.logs[dateKey])) {
                            const basePointValue = h.pointValue || 2;
                            habitPoints[h.id].totalPoints += basePointValue;
                            habitPoints[h.id].achievementCount++;
                        }
                    });
                }
            });
            
            // トランザクションから最近の履歴とボーナスポイントを取得（追加分として）
            if (data.pointSystem && data.pointSystem.transactions) {
                // 日付と習慣ごとのトランザクション履歴を管理
                const transactionHistory = {};
                
                data.pointSystem.transactions.forEach(t => {
                    if (t.source === 'habit' && t.type === 'earn') {
                        // habitIdがある場合はそれを使用、なければdescriptionから習慣名を抽出
                        let targetHabitId = t.habitId;
                        
                        if (!targetHabitId && t.description) {
                            // 「習慣名 達成」または「習慣名 取り消し」からタイトルを抽出
                            const match = t.description.match(/(.+?)\s+(達成|取り消し)/);
                            if (match) {
                                const habitTitle = match[1].trim();
                                const habit = all.find(h => h.title === habitTitle);
                                if (habit) {
                                    targetHabitId = habit.id;
                                }
                            }
                        }
                        
                        if (targetHabitId && habitPoints[targetHabitId]) {
                            // タイムスタンプから日付キーを生成
                            const date = new Date(t.timestamp);
                            const dateKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
                            const key = `${targetHabitId}_${dateKey}`;
                            
                            // トランザクション履歴を記録
                            if (!transactionHistory[key]) {
                                transactionHistory[key] = [];
                            }
                            transactionHistory[key].push(t);
                        }
                    }
                });
                
                // 各トランザクションから最近の履歴とボーナスポイントを抽出
                Object.entries(transactionHistory).forEach(([key, transactions]) => {
                    // トランザクションを時系列順にソート
                    transactions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                    
                    // 最後のトランザクションの状態を確認
                    const lastTransaction = transactions[transactions.length - 1];
                    const [habitId] = key.split('_');
                    
                    // 取り消しされていない場合のみ履歴に追加
                    if (!lastTransaction.description.includes('取り消し') && habitPoints[habitId]) {
                        const points = lastTransaction.finalAmount || lastTransaction.amount || lastTransaction.points || 0;
                        
                        // 最近の履歴に追加（表示用）
                        if (points > 0) {
                            habitPoints[habitId].recentHistory.push({
                                timestamp: lastTransaction.timestamp,
                                amount: points,
                                description: lastTransaction.description,
                                multiplier: lastTransaction.multiplier || 1
                            });
                            
                            // ボーナスポイントの計算（連続ボーナスなど）
                            if (lastTransaction.multiplier && lastTransaction.multiplier > 1) {
                                const baseAmount = lastTransaction.amount || Math.floor(points / lastTransaction.multiplier);
                                const bonus = points - baseAmount;
                                habitPoints[habitId].bonusPoints += bonus;
                                // ボーナス分を合計に追加
                                habitPoints[habitId].totalPoints += bonus;
                            }
                        }
                    }
                });
                
                // 各習慣の履歴を時系列順（新しい順）にソート
                Object.values(habitPoints).forEach(h => {
                    h.recentHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    // 最新5件のみ保持
                    h.recentHistory = h.recentHistory.slice(0, 5);
                });
            }
            
            // 平均ポイントを計算
            const allRankable = Object.values(habitPoints)
                .map(h => {
                    h.averagePoints = h.achievementCount > 0 ? 
                        Math.round(h.totalPoints / h.achievementCount * 10) / 10 : 0;
                    return h;
                });
            // 総ポイントランキング（上位5件）
            const rankingTotal = allRankable
                .filter(h => h.totalPoints > 0)
                .sort((a, b) => b.totalPoints - a.totalPoints)
                .slice(0, 5);
            // 回数ランキング（上位5件）
            const rankingCount = allRankable
                .filter(h => h.achievementCount > 0)
                .sort((a, b) => b.achievementCount - a.achievementCount || b.totalPoints - a.totalPoints)
                .slice(0, 5);
            
            const rankDiv = document.getElementById('ranking-list');
            if (rankDiv){
                if (rankingTotal.length === 0 && rankingCount.length === 0) {
                    rankDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">まだポイント獲得履歴がありません</div>';
                } else {
                    const renderItem = (r, idx, mode) => {
                        // この習慣の最近のポイント履歴を取得（最新3件）
                        const recentPoints = r.recentHistory.slice(0, 3);
                        let historyHtml = '';
                        if (recentPoints.length > 0) {
                            historyHtml = `
                                <div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); font-size: 10px;">
                                    <div style="color: var(--text-secondary); margin-bottom: 4px;">最近の獲得:</div>
                                    ${recentPoints.map(p => {
                                        const date = new Date(p.timestamp);
                                        const dateStr = `${date.getMonth()+1}/${date.getDate()}`;
                                        return `<div style="display: flex; justify-content: space-between; padding: 2px 0;">
                                            <span style="color: var(--text-secondary);">${dateStr}</span>
                                            <span style="color: #10b981;">+${p.amount}pt</span>
                                        </div>`;
                                    }).join('')}
                                </div>
                            `;
                        }
                        const rankBg = (
                            idx === 0 ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1))' :
                            idx === 1 ? 'linear-gradient(135deg, rgba(192, 192, 192, 0.1), rgba(128, 128, 128, 0.1))' :
                            idx === 2 ? 'linear-gradient(135deg, rgba(205, 127, 50, 0.1), rgba(165, 87, 10, 0.1))' :
                            'rgba(0,0,0,0.1)'
                        );
                        const rightValue = mode === 'total' ? `${r.totalPoints}pt` : `${r.achievementCount}回`;
                        const rightColor = mode === 'total' ? '#fbbf24' : '#10b981';
                        return `
                        <div class="ranking-item" style="padding:8px;border:1px solid var(--border);border-radius:10px;background: ${
                            rankBg
                        };">
                            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 20px;">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`}</span>
                                    <div>
                                        <div>${escapeHTML(r.title||'Untitled')}</div>
                                        <div style="font-size: 10px; color: var(--text-secondary);">
                                            ${r.achievementCount}回達成 · 平均${r.averagePoints}pt
                                            ${r.bonusPoints > 0 ? ` · 🚀+${r.bonusPoints}pt` : ''}
                                        </div>
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 16px; font-weight: bold; color: ${rightColor};">${rightValue}</div>
                                </div>
                            </div>
                            ${historyHtml}
                        </div>
                    `;
                    };
                    const totalHtml = rankingTotal.length ? (`
                        <h4 style="margin:8px 0; font-size:14px;">🏆 総ポイントランキング</h4>
                        <div style="display:grid; gap:8px;">${rankingTotal.map((r,idx)=>renderItem(r,idx,'total')).join('')}</div>
                    `) : '';
                    const countHtml = rankingCount.length ? (`
                        <h4 style="margin:12px 0 8px; font-size:14px;">🔢 回数ランキング</h4>
                        <div style="display:grid; gap:8px;">${rankingCount.map((r,idx)=>renderItem(r,idx,'count')).join('')}</div>
                    `) : '';
                    rankDiv.innerHTML = totalHtml + countHtml;
                }
            }
        }
        
        // 連続ランキングを表示
        function showStreakRanking() {
            const data = loadData();
            const all = data.currentHypotheses.concat(data.completedHypotheses || []);
            
            // タブのスタイル更新
            document.getElementById('ranking-achievement-tab').style.background = 'var(--surface)';
            document.getElementById('ranking-achievement-tab').style.color = 'var(--text-primary)';
            document.getElementById('ranking-points-tab').style.background = 'var(--surface)';
            document.getElementById('ranking-points-tab').style.color = 'var(--text-primary)';
            document.getElementById('ranking-streak-tab').style.background = 'var(--primary)';
            document.getElementById('ranking-streak-tab').style.color = 'white';
            
            // 各習慣の連続日数を計算
            const ranking = all.map(h => {
                let currentStreak = 0;
                let longestStreak = 0;
                let tempStreak = 0;
                const today = new Date();
                
                // 過去60日間をチェック
                for (let i = 59; i >= 0; i--) {
                    const date = new Date(today);
                    date.setDate(date.getDate() - i);
                    const dateKey = dateKeyLocal(date);
                    
                    if ((h.achievements || {})[dateKey]) {
                        tempStreak++;
                        if (i === 0) currentStreak = tempStreak; // 今日まで続いている
                    } else {
                        if (tempStreak > longestStreak) {
                            longestStreak = tempStreak;
                        }
                        if (i === 0) currentStreak = 0; // 今日は達成していない
                        tempStreak = 0;
                    }
                }
                
                if (tempStreak > longestStreak) {
                    longestStreak = tempStreak;
                }
                
                // 昨日までの連続を確認
                if (currentStreak === 0) {
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    const yesterdayKey = dateKeyLocal(yesterday);
                    
                    if ((h.achievements || {})[yesterdayKey]) {
                        // 昨日までの連続を数える
                        for (let i = 1; i <= 60; i++) {
                            const date = new Date(today);
                            date.setDate(date.getDate() - i);
                            const dateKey = dateKeyLocal(date);
                            
                            if ((h.achievements || {})[dateKey]) {
                                currentStreak++;
                            } else {
                                break;
                            }
                        }
                    }
                }
                
                return {
                    id: h.id,
                    title: h.title,
                    currentStreak,
                    longestStreak: Math.max(currentStreak, longestStreak),
                    totalDays: Object.keys(h.achievements || {}).length
                };
            })
            .filter(h => h.currentStreak > 0 || h.longestStreak > 0)
            .sort((a, b) => b.currentStreak - a.currentStreak || b.longestStreak - a.longestStreak)
            .slice(0, 5);
            
            const rankDiv = document.getElementById('ranking-list');
            if (rankDiv){
                if (ranking.length === 0) {
                    rankDiv.innerHTML = '<div style="text-align: center; color: var(--text-secondary); padding: 20px;">まだ連続記録がありません</div>';
                } else {
                    rankDiv.innerHTML = ranking.map((r,idx)=>`
                        <div class="ranking-item" style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:10px;background: ${
                            idx === 0 ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.1), rgba(245, 158, 11, 0.1))' :
                            idx === 1 ? 'linear-gradient(135deg, rgba(192, 192, 192, 0.1), rgba(128, 128, 128, 0.1))' :
                            idx === 2 ? 'linear-gradient(135deg, rgba(205, 127, 50, 0.1), rgba(165, 87, 10, 0.1))' :
                            'rgba(0,0,0,0.1)'
                        };">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 20px;">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx+1}`}</span>
                                <div>
                                    <div>${escapeHTML(r.title||'Untitled')}</div>
                                    <div style="font-size: 10px; color: var(--text-secondary);">
                                        最長${r.longestStreak}日 · 累計${r.totalDays}日
                                    </div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 16px; font-weight: bold; color: ${r.currentStreak > 0 ? '#f59e0b' : '#6b7280'};">
                                    ${r.currentStreak > 0 ? '🔥' : ''} ${r.currentStreak}日
                                </div>
                                <div style="font-size: 10px; color: var(--text-secondary);">
                                    ${r.currentStreak > 0 ? '連続中' : '中断中'}
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            }
        }
        
        // バッジコレクションを表示
        function displayBadgeCollection() {
            const data = loadData();
            const container = document.getElementById('badge-collection');
            if (!container) return;
            
            container.innerHTML = '';
            
            // 獲得済みバッジを表示
            Object.entries(BADGE_DEFINITIONS).forEach(([id, badge]) => {
                const earned = data.badges && data.badges[id];
                const badgeEl = document.createElement('div');
                badgeEl.style.cssText = `
                    text-align: center;
                    padding: 8px;
                    background: ${earned ? 'var(--gradient-1)' : 'var(--surface)'};
                    border-radius: 12px;
                    opacity: ${earned ? '1' : '0.3'};
                    transition: all 0.3s;
                    cursor: pointer;
                    min-height: 80px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                `;
                
                badgeEl.innerHTML = `
                    <div style="font-size: 28px; margin-bottom: 4px;">${badge.emoji}</div>
                    <div style="font-size: 11px; font-weight: 600; color: ${earned ? 'white' : 'var(--text-secondary)'}; line-height: 1.2;">  
                        ${badge.name.split(' ')[1] || badge.name}
                    </div>
                `;
                
                badgeEl.title = `${badge.name}\n${badge.description}${earned ? '\n獲得済み' : '\n未獲得'}`;
                
                if (earned) {
                    badgeEl.onclick = () => {
                        showNotification(`🏆 ${badge.name}\n${badge.description}`, 'success');
                    };
                }
                
                container.appendChild(badgeEl);
            });
        }
        
        // 月次レポートを表示
        function showMonthlyReport() {
            const data = loadData();
            const container = document.getElementById('report-container');
            const now = new Date();
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();
            
            let report = `<h4>📅 ${currentYear}年${currentMonth + 1}月のレポート</h4>`;
            
            // 月間統計
            let monthlyAchievements = 0;
            let monthlyTotal = 0;
            let habitsActive = 0;
            
            data.currentHypotheses.concat(data.completedHypotheses || []).forEach(h => {
                const startDate = new Date(h.startDate);
                const endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + h.totalDays);
                
                // この月に活動した習慣
                if (startDate <= now && endDate >= new Date(currentYear, currentMonth, 1)) {
                    habitsActive++;
                    
                    // この月の達成をカウント
                    for (let d = 1; d <= 31; d++) {
                        const checkDate = new Date(currentYear, currentMonth, d);
                        if (checkDate > now) break;
                        if (checkDate >= startDate && checkDate <= endDate) {
                            monthlyTotal++;
                            const key = dateKeyLocal(checkDate);
                            if (h.achievements && h.achievements[key]) {
                                monthlyAchievements++;
                            }
                        }
                    }
                }
            });
            
            const monthlyRate = monthlyTotal > 0 ? Math.round((monthlyAchievements / monthlyTotal) * 100) : 0;
            
            const missedDays = monthlyTotal - monthlyAchievements;
            report += `
                <div style="display: grid; gap: 12px; margin-top: 16px;">
                    <div style="padding: 12px; background: var(--background); border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${monthlyRate}%</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">月間達成率</div>
                    </div>
                    <div style="display: grid; grid-template-columns: ${missedDays > 0 ? '1fr 1fr 1fr' : '1fr 1fr'}; gap: 8px;">
                        <div style="padding: 8px; background: var(--background); border-radius: 8px; text-align: center;">
                            <div style="font-weight: 600;">${habitsActive}</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">活動中の習慣</div>
                        </div>
                        <div style="padding: 8px; background: var(--background); border-radius: 8px; text-align: center;">
                            <div style="font-weight: 600;">${monthlyAchievements}</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">達成日数</div>
                        </div>
                        ${missedDays > 0 ? `
                        <div style="padding: 8px; background: var(--background); border-radius: 8px; text-align: center;">
                            <div style="font-weight: 600;">${missedDays}</div>
                            <div style="font-size: 10px; color: var(--text-secondary);">未達成日数</div>
                        </div>` : ''}
                    </div>
                </div>
            `;
            
            container.innerHTML = report;
            container.style.display = 'block';
        }
        
        // 年次レポートを表示
        function showYearlyReport() {
            const data = loadData();
            const container = document.getElementById('report-container');
            const currentYear = new Date().getFullYear();
            
            let report = `<h4>📊 ${currentYear}年のレポート</h4>`;
            
            // 月別統計
            const monthlyStats = [];
            for (let month = 0; month < 12; month++) {
                let achievements = 0;
                let total = 0;
                
                data.currentHypotheses.concat(data.completedHypotheses || []).forEach(h => {
                    const startDate = new Date(h.startDate);
                    const endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + h.totalDays);
                    
                    for (let d = 1; d <= 31; d++) {
                        const checkDate = new Date(currentYear, month, d);
                        if (checkDate > new Date()) break;
                        if (checkDate >= startDate && checkDate <= endDate) {
                            total++;
                            const key = dateKeyLocal(checkDate);
                            if (h.achievements && h.achievements[key]) {
                                achievements++;
                            }
                        }
                    }
                });
                
                monthlyStats.push({
                    month: month + 1,
                    rate: total > 0 ? Math.round((achievements / total) * 100) : 0,
                    achievements,
                    total
                });
            }
            
            // 年間統計
            const yearTotal = monthlyStats.reduce((sum, m) => sum + m.total, 0);
            const yearAchievements = monthlyStats.reduce((sum, m) => sum + m.achievements, 0);
            const yearRate = yearTotal > 0 ? Math.round((yearAchievements / yearTotal) * 100) : 0;
            
            report += `
                <div style="padding: 16px; background: var(--gradient-1); border-radius: 12px; margin: 16px 0; text-align: center; color: white;">
                    <div style="font-size: 32px; font-weight: 800;">${yearRate}%</div>
                    <div style="font-size: 14px; opacity: 0.9;">年間達成率</div>
                    <div style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
                        ${yearAchievements} / ${yearTotal} 日達成
                    </div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">
            `;
            
            monthlyStats.forEach(m => {
                if (m.total > 0) {
                    const color = m.rate >= 80 ? '#10b981' : m.rate >= 50 ? '#3b82f6' : '#ef4444';
                    report += `
                        <div style="padding: 8px; background: var(--background); border-radius: 8px; text-align: center;">
                            <div style="font-size: 10px; color: var(--text-secondary);">${m.month}月</div>
                            <div style="font-size: 16px; font-weight: 700; color: ${color};">${m.rate}%</div>
                        </div>
                    `;
                }
            });
            
            report += '</div>';
            
            container.innerHTML = report;
            container.style.display = 'block';
        }
        
        // 習慣データをエクスポート（全データ版）
        function exportHabitData() {
            const data = loadData();
            const exportData = {
                exportDate: new Date().toISOString(),
                version: '2.0',
                data: data  // 全データをそのまま保存
            };
            
            // JSONファイルとしてダウンロード
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `pdca-lab-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            showNotification('📤 全データをエクスポートしました', 'success');
        }

        // データのインポート（最初の関数は使用しない - 後の統一版を使用）
        // function handleImportFile_old(event) {
        //     // この関数は使用しない（後の統一版を使用）
        //     return;
        // }

        // インポートデータの正規化
        function normalizeImportedData(src) {
            if (!src || typeof src !== 'object') return null;
            // 既存ストレージ形式（そのまま）
            if (Array.isArray(src.currentHypotheses) || Array.isArray(src.completedHypotheses)) {
                return {
                    currentHypotheses: src.currentHypotheses || [],
                    completedHypotheses: src.completedHypotheses || [],
                    cards: src.cards || { inventory: [], pendingPenalties: [] },
                    badges: src.badges || {},
                    meta: src.meta || {}
                };
            }
            // エクスポート形式からの変換
            if (Array.isArray(src.currentHabits) || Array.isArray(src.completedHabits)) {
                return {
                    currentHypotheses: src.currentHabits || [],
                    completedHypotheses: src.completedHabits || [],
                    cards: src.cards || { inventory: [], pendingPenalties: [] },
                    badges: src.badges || {},
                    meta: src.meta || {}
                };
            }
            return null;
        }


        // カード画面を表示
        function showCardsView() {
            resetScrollToTop();
            document.getElementById('home-view').style.display = 'none';
            document.getElementById('new-hypothesis-view').style.display = 'none';
            { const el = document.getElementById('shuffle-view'); if (el) el.style.display = 'none'; }
            document.getElementById('progress-view').style.display = 'none';
            document.getElementById('history-view').style.display = 'none';
            document.getElementById('stats-view').style.display = 'none';
            document.getElementById('points-view').style.display = 'none';
            document.getElementById('cards-view').style.display = 'block';
            
            updateNavigation('cards');
            updateCardDisplay();
            
            // カード画面ではヘッダーのポイント表示を非表示
            const pointDisplay = document.getElementById('point-display');
            if (pointDisplay) {
                pointDisplay.style.display = 'none';
            }
        }

        // カード表示を更新
        function updateCardDisplay() {
            const data = loadData();
            const inventoryContainer = document.getElementById('card-inventory');
            const penaltyContainer = document.getElementById('penalty-cards');
            
            // 所持カードを集計
            const cardCounts = {};
            data.cards.inventory.forEach(card => {
                if (!card.used) {
                    cardCounts[card.cardId] = (cardCounts[card.cardId] || 0) + 1;
                }
            });
            
            // 所持カード表示
            inventoryContainer.innerHTML = '';
            if (Object.keys(cardCounts).length === 0) {
                inventoryContainer.innerHTML = '<p style="color: var(--text-secondary);">所持カードはありません</p>';
            } else {
                Object.entries(cardCounts).forEach(([cardId, count]) => {
                    const card = CARD_MASTER[cardId];
                    if (card) {
                        const cardElement = createCardElement(card, count);
                        inventoryContainer.appendChild(cardElement);
                    }
                });
            }
            
            // ペナルティカード表示
            penaltyContainer.innerHTML = '';
            if (data.cards.pendingPenalties.length === 0) {
                penaltyContainer.innerHTML = '<p style="color: var(--text-secondary);">ペナルティカードはありません</p>';
            } else {
                const penaltyCounts = {};
                data.cards.pendingPenalties.forEach(penalty => {
                    penaltyCounts[penalty.cardId] = (penaltyCounts[penalty.cardId] || 0) + 1;
                });
                
                Object.entries(penaltyCounts).forEach(([cardId, count]) => {
                    const card = CARD_MASTER[cardId];
                    if (card) {
                        const cardElement = createCardElement(card, count);
                        penaltyContainer.appendChild(cardElement);
                    }
                });
            }
        }

        // カード要素を作成
        function createCardElement(card, count) {
            const div = document.createElement('div');
            div.className = `card-item ${card.type}`;
            div.innerHTML = `
                <div class="card-icon">${card.icon}</div>
                <div class="card-name">${card.name}</div>
                <div class="card-description">${card.description}</div>
                ${count > 1 ? `<div class="card-count">×${count}</div>` : ''}
            `;
            // カードコレクションからも使用できるようにする（報酬カードのみ）
            if (card.type === 'reward') {
                div.style.cursor = 'pointer';
                div.title = 'タップして使用メニューを開く';
                div.onclick = () => {
                    // 既存の使用メニューを再利用
                    showCardUseMenu();
                };
            }
            return div;
        }

        // カード獲得表示
        function showCardAcquisition(cardIds, callback) {
            const modal = document.getElementById('card-acquisition-modal');
            const container = document.getElementById('acquired-cards-container');
            
            if (!modal) {
                console.error('card-acquisition-modal not found');
                return;
            }
            if (!container) {
                console.error('acquired-cards-container not found');
                return;
            }
            
            container.innerHTML = '';
            cardIds.forEach((cardId, index) => {
                const card = CARD_MASTER[cardId];
                if (card) {
                    const cardDiv = document.createElement('div');
                    cardDiv.className = `card-item ${card.type} card-reveal`;
                    cardDiv.style.animationDelay = `${index * 0.3}s`;
                    cardDiv.innerHTML = `
                        <div class="card-icon">${card.icon}</div>
                        <div class="card-name">${card.name}</div>
                        <div class="card-description">${card.description}</div>
                    `;
                    container.appendChild(cardDiv);
                }
            });
            
            modal.style.display = 'flex';
            
            window.cardAcquisitionCallback = callback;
        }

        // カード獲得モーダルを閉じる
        function closeCardAcquisition() {
            document.getElementById('card-acquisition-modal').style.display = 'none';
            if (window.cardAcquisitionCallback) {
                window.cardAcquisitionCallback();
                window.cardAcquisitionCallback = null;
            }
        }
        
        // グローバルに公開
        window.showCardAcquisition = showCardAcquisition;
        window.closeCardAcquisition = closeCardAcquisition;
        
        

        // スワイプ機能
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;
        let currentViewIndex = 0;
        const views = ['home', 'points', 'cards', 'stats', 'history'];
        const viewElements = {
            'home': 'home-view',
            'points': 'points-view',
            'cards': 'cards-view',
            'stats': 'stats-view',
            'history': 'history-view'
        };

        // スワイプイベントの設定
        // スワイプ関連の変数をグローバルスコープに移動
        let swipeState = {
            isEnabled: true,
            isSwiping: false,
            scrolling: false,
            touchStartX: 0,
            touchStartY: 0,
            touchEndX: 0,
            touchEndY: 0,
            edgeSwipe: false
        };
        
        function setupSwipeListeners() {
            const container = document.querySelector('.container');
            
            // フォーム要素でのスワイプを無効化
            // 入力系のみスワイプ抑止（ボタンは許可）
            document.querySelectorAll('input, textarea').forEach(element => {
                element.addEventListener('touchstart', () => {
                    swipeState.isEnabled = false;
                }, { passive: true });
                
                element.addEventListener('touchend', () => {
                    setTimeout(() => {
                        swipeState.isEnabled = true;
                    }, 100);
                }, { passive: true });
            });
            
            // 統計画面に専用のイベントリスナーを追加
            const statsView = document.getElementById('stats-view');
            if (statsView) {
                console.log('[STATS] Adding direct event listeners to stats view');
                
                // キャプチャフェーズで確実にイベントを捕捉
                statsView.addEventListener('touchstart', (e) => {
                    console.log('[STATS DIRECT] touchstart on stats view!');
                    const currentView = getCurrentView();
                    if (currentView === 'stats') {
                        swipeState.touchStartX = e.changedTouches[0].screenX;
                        swipeState.touchStartY = e.changedTouches[0].screenY;
                        swipeState.scrolling = false;
                        swipeState.isSwiping = false;
                        console.log('[STATS DIRECT] Start position:', swipeState.touchStartX, swipeState.touchStartY);
                    }
                }, { passive: true, capture: true });
                
                statsView.addEventListener('touchmove', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'stats') {
                        const diffX = Math.abs(e.changedTouches[0].screenX - swipeState.touchStartX);
                        const diffY = Math.abs(e.changedTouches[0].screenY - swipeState.touchStartY);
                        console.log('[STATS DIRECT] Move - diffX:', diffX, 'diffY:', diffY);
                        if (diffX > 18 && diffX > diffY * 0.9) {
                            swipeState.isSwiping = true;
                            swipeState.scrolling = false;
                            e.preventDefault();
                        }
                    }
                }, { passive: false, capture: true });
                
                statsView.addEventListener('touchend', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'stats' && swipeState.isSwiping) {
                        swipeState.touchEndX = e.changedTouches[0].screenX;
                        swipeState.touchEndY = e.changedTouches[0].screenY;
                        console.log('[STATS DIRECT] End - calling handleSwipe');
                        handleSwipe();
                        swipeState.isSwiping = false;
                    }
                }, { passive: true, capture: true });
            }
            
            // ポイント画面に専用のイベントリスナーを追加
            const pointsView = document.getElementById('points-view');
            if (pointsView) {
                console.log('[POINTS] Adding direct event listeners to points view');
                
                // キャプチャフェーズで確実にイベントを捕捉
                pointsView.addEventListener('touchstart', (e) => {
                    console.log('[POINTS DIRECT] touchstart on points view!');
                    const currentView = getCurrentView();
                    if (currentView === 'points') {
                        swipeState.touchStartX = e.changedTouches[0].screenX;
                        swipeState.touchStartY = e.changedTouches[0].screenY;
                        swipeState.scrolling = false;
                        swipeState.isSwiping = false;
                        console.log('[POINTS DIRECT] Start position:', swipeState.touchStartX, swipeState.touchStartY);
                    }
                }, { passive: true, capture: true });
                
                pointsView.addEventListener('touchmove', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'points') {
                        const diffX = Math.abs(e.changedTouches[0].screenX - swipeState.touchStartX);
                        const diffY = Math.abs(e.changedTouches[0].screenY - swipeState.touchStartY);
                        console.log('[POINTS DIRECT] Move - diffX:', diffX, 'diffY:', diffY);
                        if (diffX > 18 && diffX > diffY * 0.9) {
                            swipeState.isSwiping = true;
                            swipeState.scrolling = false;
                            e.preventDefault();
                        }
                    }
                }, { passive: false, capture: true });
                
                pointsView.addEventListener('touchend', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'points' && swipeState.isSwiping) {
                        swipeState.touchEndX = e.changedTouches[0].screenX;
                        swipeState.touchEndY = e.changedTouches[0].screenY;
                        console.log('[POINTS DIRECT] End - calling handleSwipe');
                        handleSwipe();
                        swipeState.isSwiping = false;
                    }
                }, { passive: true, capture: true });
            }

            // カード画面に専用のイベントリスナーを追加（カードコレクション上でも横スワイプ優先）
            const cardsView = document.getElementById('cards-view');
            if (cardsView) {
                cardsView.addEventListener('touchstart', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'cards') {
                        swipeState.touchStartX = e.changedTouches[0].screenX;
                        swipeState.touchStartY = e.changedTouches[0].screenY;
                        swipeState.scrolling = false;
                        swipeState.isSwiping = false;
                    }
                }, { passive: true, capture: true });
                cardsView.addEventListener('touchmove', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'cards') {
                        const diffX = Math.abs(e.changedTouches[0].screenX - swipeState.touchStartX);
                        const diffY = Math.abs(e.changedTouches[0].screenY - swipeState.touchStartY);
                        if (diffX > 18 && diffX > diffY * 0.9) {
                            swipeState.isSwiping = true;
                            swipeState.scrolling = false;
                            e.preventDefault();
                        }
                    }
                }, { passive: false, capture: true });
                cardsView.addEventListener('touchend', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'cards' && swipeState.isSwiping) {
                        swipeState.touchEndX = e.changedTouches[0].screenX;
                        swipeState.touchEndY = e.changedTouches[0].screenY;
                        handleSwipe();
                        swipeState.isSwiping = false;
                    }
                }, { passive: true, capture: true });
            }

            // 履歴画面に専用のイベントリスナーを追加（スワイプ感度向上）
            const historyView = document.getElementById('history-view');
            if (historyView) {
                historyView.addEventListener('touchstart', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'history') {
                        swipeState.touchStartX = e.changedTouches[0].screenX;
                        swipeState.touchStartY = e.changedTouches[0].screenY;
                        swipeState.scrolling = false;
                        swipeState.isSwiping = false;
                    }
                }, { passive: true, capture: true });
                historyView.addEventListener('touchmove', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'history') {
                        const diffX = Math.abs(e.changedTouches[0].screenX - swipeState.touchStartX);
                        const diffY = Math.abs(e.changedTouches[0].screenY - swipeState.touchStartY);
                        if (diffX > 18 && diffX > diffY * 0.9) {
                            swipeState.isSwiping = true;
                            swipeState.scrolling = false;
                            e.preventDefault();
                        }
                    }
                }, { passive: false, capture: true });
                historyView.addEventListener('touchend', (e) => {
                    const currentView = getCurrentView();
                    if (currentView === 'history' && swipeState.isSwiping) {
                        swipeState.touchEndX = e.changedTouches[0].screenX;
                        swipeState.touchEndY = e.changedTouches[0].screenY;
                        handleSwipe();
                        swipeState.isSwiping = false;
                    }
                }, { passive: true, capture: true });
            }
            
            container.addEventListener('touchstart', (e) => {
                if (!swipeState.isEnabled) {
                    console.log('[Swipe Debug] スワイプが無効です');
                    return;
                }
                
                const currentView = getCurrentView();
                console.log('[Swipe Debug] touchstart - 現在のビュー:', currentView);
                
                // 統計/ポイント/カード画面ではスクロールを無効化してスワイプを優先
                if (currentView === 'stats' || currentView === 'points' || currentView === 'cards') {
                    swipeState.scrolling = false;
                    console.log('[Swipe Debug] 統計/ポイント/カード - scrolling=false');
                } else {
                    swipeState.scrolling = false;
                }
                
                swipeState.touchStartX = e.changedTouches[0].screenX;
                swipeState.touchStartY = e.changedTouches[0].screenY;
                swipeState.isSwiping = false;
                console.log('[Swipe Debug] タッチ開始位置 X:', swipeState.touchStartX, 'Y:', swipeState.touchStartY);
                // 画面左右端からのスワイプは感度を上げる
                const vw = window.innerWidth || document.documentElement.clientWidth;
                swipeState.edgeSwipe = (swipeState.touchStartX < 24) || (swipeState.touchStartX > vw - 24);
            }, { passive: true });
            
            container.addEventListener('touchmove', (e) => {
                if (!swipeState.isEnabled) {
                    console.log('[Swipe Debug] touchmove - スワイプ無効');
                    return;
                }
                
                const currentView = getCurrentView();
                
                // 統計画面では特別な処理
                if (currentView === 'stats') {
                    const diffX = Math.abs(e.changedTouches[0].screenX - swipeState.touchStartX);
                    const diffY = Math.abs(e.changedTouches[0].screenY - swipeState.touchStartY);
                    
                    console.log('[Swipe Debug] 統計画面 touchmove - diffX:', diffX, 'diffY:', diffY, 'isSwiping:', swipeState.isSwiping);
                    
                    // 横方向の動きが縦より大きければスワイプとして扱う
                    if (diffX > 20 && diffX > diffY * 0.8) {
                        swipeState.isSwiping = true;
                        swipeState.scrolling = false;
                        console.log('[Swipe Debug] 統計画面 - スワイプ検出！');
                        try {
                            e.preventDefault(); // スクロールを防ぐ
                        } catch(err) {
                            console.log('[Swipe Debug] preventDefaultエラー:', err);
                        }
                    }
                    return;
                }
                
                // 統計画面以外の処理
                if (swipeState.scrolling) return;
                
                const diffX = Math.abs(e.changedTouches[0].screenX - swipeState.touchStartX);
                const diffY = Math.abs(e.changedTouches[0].screenY - swipeState.touchStartY);
                
                // 縦方向の動きが大きい場合はスクロールとみなす（端スワイプ時はやや緩和）
                if (diffY > diffX && diffY > (swipeState.edgeSwipe ? 14 : 10)) {
                    swipeState.scrolling = true;
                    return;
                }
                
                // 横方向の動きが大きい場合はスワイプとみなす（端スワイプ時は閾値を緩和）
                if (diffX > diffY && diffX > (swipeState.edgeSwipe ? 8 : 10)) {
                    swipeState.isSwiping = true;
                    try { e.preventDefault(); } catch(_) {}
                }
            }, { passive: false });

            container.addEventListener('touchend', (e) => {
                const currentView = getCurrentView();
                console.log('[Swipe Debug] touchend - ビュー:', currentView, 'isSwipeEnabled:', swipeState.isEnabled, 'isSwiping:', swipeState.isSwiping, 'scrolling:', swipeState.scrolling);
                
                // 統計画面ではscrollingフラグを無視
                if (!swipeState.isEnabled || (!swipeState.isSwiping) || (currentView !== 'stats' && swipeState.scrolling)) {
                    console.log('[Swipe Debug] touchend - スワイプ処理をスキップ');
                    swipeState.scrolling = false;
                    swipeState.isSwiping = false;
                    return;
                }
                
                swipeState.touchEndX = e.changedTouches[0].screenX;
                swipeState.touchEndY = e.changedTouches[0].screenY;
                console.log('[Swipe Debug] タッチ終了位置 X:', swipeState.touchEndX, 'Y:', swipeState.touchEndY);
                console.log('[Swipe Debug] 移動量 X:', swipeState.touchStartX - swipeState.touchEndX, 'Y:', swipeState.touchStartY - swipeState.touchEndY);
                handleSwipe();
                swipeState.scrolling = false;
                swipeState.isSwiping = false;
            }, { passive: true });
        }
        
        // スクロール可能な親要素を探す
        function findScrollableParent(element) {
            // 統計/ポイント/履歴/カード では常にnullを返してスワイプを優先
            const v = getCurrentView();
            if (v === 'stats' || v === 'points' || v === 'history' || v === 'cards') {
                return null;
            }
            
            let parent = element;
            while (parent && parent !== document.body) {
                const style = window.getComputedStyle(parent);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
                    parent.scrollHeight > parent.clientHeight) {
                    return parent;
                }
                parent = parent.parentElement;
            }
            return null;
        }

        // スワイプ処理
        function handleSwipe() {
            const diffX = swipeState.touchStartX - swipeState.touchEndX;
            const diffY = swipeState.touchStartY - swipeState.touchEndY;
            const currentView = getCurrentView();
            
            // ビューごとの閾値（端スワイプはさらに緩和）
            const relaxedViews = ['stats','points','home','cards','history'];
            let minSwipeDistance = relaxedViews.includes(currentView) ? 32 : 56;
            let horizontalRatio = relaxedViews.includes(currentView) ? 1.2 : 1.6;
            if (currentView === 'history') { minSwipeDistance = 24; horizontalRatio = 1.0; }
            if (swipeState.edgeSwipe) {
                minSwipeDistance = Math.min(24, minSwipeDistance);
                horizontalRatio = 1.0;
            }
            
            console.log('[Swipe Debug] handleSwipe - ビュー:', currentView);
            console.log('[Swipe Debug] 最小距離:', minSwipeDistance, '比率:', horizontalRatio);
            console.log('[Swipe Debug] 条件判定: |diffX|:', Math.abs(diffX), '> |diffY| *', horizontalRatio, '=', Math.abs(diffY) * horizontalRatio);
            console.log('[Swipe Debug] 距離判定: |diffX|:', Math.abs(diffX), '>', minSwipeDistance);
            
            // 水平スワイプのみを検出（垂直移動が少ない場合）
            if (Math.abs(diffX) > Math.abs(diffY) * horizontalRatio && Math.abs(diffX) > minSwipeDistance) {
                // 進捗画面ではスワイプ無効
                if (currentView === 'progress') {
                    console.log('[Swipe Debug] 進捗画面のためスワイプ無効');
                    return;
                }
                
                if (diffX > 0) {
                    console.log('[Swipe Debug] 左スワイプ検出 - 次の画面へ');
                    // 左スワイプ（指を右から左へ） - 次の画面へ
                    navigateToNextView();
                } else {
                    console.log('[Swipe Debug] 右スワイプ検出 - 前の画面へ');
                    // 右スワイプ（指を左から右へ） - 前の画面へ
                    navigateToPreviousView();
                }
            } else {
                console.log('[Swipe Debug] スワイプ条件を満たさず');
            }
        }

        // 現在のビューを取得
        function getCurrentView() {
            if (document.getElementById('home-view').style.display !== 'none') return 'home';
            if (document.getElementById('new-hypothesis-view').style.display !== 'none') return 'new';
            if (document.getElementById('history-view').style.display !== 'none') return 'history';
            if (document.getElementById('stats-view').style.display !== 'none') return 'stats';
            if (document.getElementById('points-view').style.display !== 'none') return 'points';
            if (document.getElementById('cards-view').style.display !== 'none') return 'cards';
            // シャッフルビューは廃止
            if (document.getElementById('progress-view').style.display !== 'none') return 'progress';
            return 'home';
        }

        // 次のビューへ遷移
        function navigateToNextView() {
            const currentView = getCurrentView();
            const currentIndex = views.indexOf(currentView);
            if (currentIndex !== -1) {
                // 最後のビューの場合は最初に戻る（ループ）
                const nextIndex = (currentIndex + 1) % views.length;
                const nextView = views[nextIndex];
                showViewWithAnimation(nextView, 'left');
            }
        }

        // 前のビューへ遷移
        function navigateToPreviousView() {
            const currentView = getCurrentView();
            const currentIndex = views.indexOf(currentView);
            if (currentIndex !== -1) {
                // 最初のビューの場合は最後に戻る（ループ）
                const previousIndex = currentIndex === 0 ? views.length - 1 : currentIndex - 1;
                const previousView = views[previousIndex];
                showViewWithAnimation(previousView, 'right');
            }
        }

        // アニメーション付きでビューを表示
        function showViewWithAnimation(viewName, direction) {
            const container = document.querySelector('.container');
            container.style.transition = 'transform 0.3s ease-out';
            
            // スワイプヒントを表示
            const hint = document.createElement('div');
            hint.className = `swipe-hint ${direction}`;
            hint.textContent = direction === 'left' ? '→' : '←';
            document.body.appendChild(hint);
            setTimeout(() => hint.remove(), 500);
            
            // スライドアニメーション
            if (direction === 'left') {
                container.style.transform = 'translateX(-20px)';
            } else {
                container.style.transform = 'translateX(20px)';
            }
            
            setTimeout(() => {
                switch (viewName) {
                    case 'home':
                        showHomeView();
                        break;
                    case 'new':
                        showNewHypothesisView();
                        break;
                    case 'history':
                        showHistoryView();
                        break;
                    case 'stats':
                        showStatsView();
                        break;
                    case 'points':
                        showPointsView();
                        break;
                    case 'cards':
                        showCardsView();
                        break;
                }
                
                container.style.transform = 'translateX(0)';
                setTimeout(() => {
                    container.style.transition = '';
                }, 300);
            }, 150);
        }

        // スワイプインジケーターを追加
        function addSwipeIndicator() {
            const indicator = document.createElement('div');
            indicator.className = 'swipe-indicator';
            indicator.innerHTML = '← スワイプでページ移動 →';
            indicator.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.7);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s;
                pointer-events: none;
            `;
            document.body.appendChild(indicator);
            
            // 初回表示
            setTimeout(() => {
                indicator.style.opacity = '1';
                setTimeout(() => {
                    indicator.style.opacity = '0';
                }, 3000);
            }, 1000);
        }

        // ヘッダー高さを実測してCSS変数を更新（端末差でのズレ防止）
        function updateHeaderHeightVar() {
            const header = document.querySelector('.header');
            if (!header) return;
            const h = Math.ceil(header.getBoundingClientRect().height);
            document.documentElement.style.setProperty('--header-height', h + 'px');
        }

        // 連続リサイズ時の負荷軽減
        function debounce(fn, wait) {
            let t;
            return function(...args) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), wait);
            };
        }

        // ========== ミッションチェック関数 ==========
        
        // デイリーミッションチェック関数
        function checkComplete3Habits() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            let completedCount = 0;
            
            data.currentHypotheses.forEach(h => {
                if (h.achievements && h.achievements[todayKey]) {
                    completedCount++;
                }
            });
            
            return completedCount >= 3;
        }
        
        function checkMorningRoutine() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            const now = new Date();
            const noon = new Date();
            noon.setHours(12, 0, 0, 0);
            
            if (now.getHours() >= 12) {
                // 午後になったらチェック可能
                let morningHabitsCompleted = 0;
                data.currentHypotheses.forEach(h => {
                    // 朝の宣言がある習慣
                    if (h.morningDeclaration && h.achievements && h.achievements[todayKey]) {
                        morningHabitsCompleted++;
                    }
                });
                return morningHabitsCompleted > 0;
            }
            return false;
        }
        
        function checkHighIntensityDay() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            let allHighIntensity = true;
            let hasAchievements = false;
            
            data.currentHypotheses.forEach(h => {
                if (h.achievements && h.achievements[todayKey]) {
                    hasAchievements = true;
                    const intensity = h.intensity && h.intensity[todayKey] || 1.0;
                    if (intensity < 1.2) {
                        allHighIntensity = false;
                    }
                }
            });
            
            return hasAchievements && allHighIntensity;
        }
        
        function checkCategoryMaster() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            const categoryCount = {};
            
            data.currentHypotheses.forEach(h => {
                if (h.achievements && h.achievements[todayKey]) {
                    const category = h.category || 'other';
                    categoryCount[category] = (categoryCount[category] || 0) + 1;
                }
            });
            
            return Object.values(categoryCount).some(count => count >= 3);
        }
        
        function checkEarlyBird() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            const now = new Date();
            
            if (now.getHours() >= 12) {
                // 午後になったらチェック可能
                let morningAchievements = 0;
                data.currentHypotheses.forEach(h => {
                    if (h.achievements && h.achievements[todayKey]) {
                        // 簡易的に午前中の達成とみなす
                        morningAchievements++;
                    }
                });
                return morningAchievements >= 2;
            }
            return false;
        }
        
        function checkVarietyDay() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            const categories = new Set();
            
            data.currentHypotheses.forEach(h => {
                if (h.achievements && h.achievements[todayKey]) {
                    categories.add(h.category || 'other');
                }
            });
            
            return categories.size >= 4;
        }
        
        function checkEffortBonusMax() {
            const data = loadData();
            // 努力ボーナスの最大使用（11種類すべて使用）
            return data.pointSystem.dailyEffortUsed >= 11;
        }
        
        function checkHabitAndChallenge() {
            const data = loadData();
            const todayKey = dateKeyLocal(new Date());
            let hasHabitAchievement = false;
            
            data.currentHypotheses.forEach(h => {
                if (h.achievements && h.achievements[todayKey]) {
                    hasHabitAchievement = true;
                }
            });
            
            const hasChallengeCompleted = data.challenges.completedToday.length > 0;
            
            return hasHabitAchievement && hasChallengeCompleted;
        }
        
        // ウィークリーミッションチェック関数
        function checkWeekPerfect() {
            const data = loadData();
            let allAbove90 = true;
            
            data.currentHypotheses.forEach(h => {
                const achievedDays = Object.keys(h.achievements || {}).length;
                const totalDays = h.totalDays || 1;
                const rate = (achievedDays / totalDays) * 100;
                if (rate < 90) {
                    allAbove90 = false;
                }
            });
            
            return data.currentHypotheses.length > 0 && allAbove90;
        }
        
        function checkWeekCardCollector() {
            const data = loadData();
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const recentCards = (data.cards.inventory || []).filter(card => {
                return new Date(card.earnedAt) > oneWeekAgo;
            });
            
            return recentCards.length >= 5;
        }
        
        function checkWeekChallengeMaster() {
            const data = loadData();
            // チャレンジストリークが7以上
            return data.challenges.streak >= 7;
        }
        
        // その他のチェック関数（簡略化）
        function checkPerfectStreak() { return false; }
        function checkIfThenExecute() { return false; }
        function checkDeclarationMaster() { return false; }
        function checkConsistencyBonus() { return false; }
        function checkWeekConsistency() { return false; }
        function checkWeekIntensityUp() { return false; }
        function checkWeekAllCategories() { return false; }
        function checkWeekIfThenMaster() { return false; }
        function checkWeekComeback() { return false; }
        function checkWeekHabitCombo() { return false; }
        function checkWeekDeclarationPerfect() { return false; }
        
        // 初期化
        window.addEventListener('load', () => {
            updateHeaderHeightVar();
            // レイアウト安定後にも再測定（フォント/アドレスバー反映）
            setTimeout(updateHeaderHeightVar, 200);
            setTimeout(updateHeaderHeightVar, 800);
        });
        window.addEventListener('resize', debounce(updateHeaderHeightVar, 120));
        window.addEventListener('orientationchange', () => setTimeout(updateHeaderHeightVar, 100));

        // ビュー切替時にスクロールをトップへ揃える
        function resetScrollToTop() {
            try {
                // まず window スクロールをリセット
                window.scrollTo({ top: 0, behavior: 'auto' });
                // 念のためドキュメントルートにも適用（iOS/Safari 対策）
                const el = document.scrollingElement || document.documentElement;
                el.scrollTop = 0;
                document.body.scrollTop = 0;
            } catch (_) {
                // フォールバック
                document.documentElement.scrollTop = 0;
                document.body.scrollTop = 0;
            }
        }

        // デバッグ機能
        function debugAchieveToday() {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!window.currentHypothesis) return;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateKey = dateKeyLocal(today);
            
            window.currentHypothesis.achievements[dateKey] = true;
            
            // データを保存
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index] = window.currentHypothesis;
                saveData(data);
            }
            
            updateCalendar();
            updateProgress();
            showNotification('✅ 今日を達成にしました', 'success');
        }
        
        function debugFailToday() {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!window.currentHypothesis) return;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dateKey = dateKeyLocal(today);
            
            delete window.currentHypothesis.achievements[dateKey];
            
            // データを保存
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index] = window.currentHypothesis;
                saveData(data);
            }
            
            updateCalendar();
            updateProgress();
            showNotification('❌ 今日を未達成にしました', 'error');
        }
        
        // ========== 期間中イベント関連の関数 ==========
        
        // イベントチェック（毎日実行）
        // ブースト効果を適用してポイントを計算
        function calculatePointsWithBoosts(basePoints, source, category = null) {
            const data = loadData();
            let finalPoints = basePoints;
            let multiplier = 1.0;
            let bonus = 0;

            // チャレンジ系（daily/weekly）はブースト適用なし
            const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
            if (isChallenge) {
                return basePoints;
            }
            
            // カード効果のチェック
            if (data.cards && data.cards.activeEffects) {
                const now = new Date();
                // ジャーナルブースト（カード由来）
                if (source === 'journal') {
                    const jmul = data.cards.activeEffects.find(effect => 
                        effect.type === 'journal_multiplier' && new Date(effect.startDate) <= now && new Date(effect.endDate) >= now
                    );
                    if (jmul) {
                        multiplier *= (jmul.value || 2.0);
                    }
                }

                // ポイントジェム効果
                const pointGem = data.cards.activeEffects.find(effect => 
                    effect.type === 'point_multiplier' && 
                    new Date(effect.startDate) <= now && 
                    new Date(effect.endDate) >= now
                );
                if (pointGem) {
                    multiplier *= pointGem.multiplier;
                }
                
                // レインボーブースト効果
                const rainbowBoost = data.cards.activeEffects.find(effect => 
                    effect.type === 'all_category_boost' && 
                    new Date(effect.startDate) <= now && 
                    new Date(effect.endDate) >= now
                );
                if (rainbowBoost && category) {
                    multiplier *= rainbowBoost.multiplier;
                }
                
                // スローダウン効果
                const slowdown = data.cards.activeEffects.find(effect => 
                    effect.type === 'slowdown' && 
                    new Date(effect.startDate) <= now && 
                    new Date(effect.endDate) >= now
                );
                if (slowdown) {
                    multiplier *= 0.5;
                }
                
            }
            
            // イベントブースト効果（機能停止中は無効）
            if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
                const currentHour = new Date().getHours();
                
                data.events.activeBoosts.forEach(boost => {
                    // 新しいイベントシステムの処理
                    if (boost.effect === 'points_multiplier') {
                        multiplier *= boost.value;
                    } else if (boost.effect === 'achievement_bonus' && source === 'habit') {
                        // 最初の3回達成のボーナス
                        if (!data.events.dailyAchievementCount) data.events.dailyAchievementCount = 0;
                        if (data.events.dailyAchievementCount < 3) {
                            bonus += boost.value;
                            data.events.dailyAchievementCount++;
                            saveData(data);
                        }
                    } else if (boost.effect === 'flat_bonus') {
                        bonus += boost.value;
                    } else if (boost.effect === 'time_bonus') {
                        if (boost.hours && boost.hours.includes(currentHour)) {
                            multiplier *= boost.multiplier;
                        }
                    } else if (boost.effect === 'lucky_time') {
                        if (boost.hours && boost.hours.includes(currentHour)) {
                            bonus += boost.bonus;
                        }
                    } else if (boost.effect === 'category_boost' && category === boost.category) {
                        multiplier *= boost.multiplier;
                    } else if (boost.effect === 'perfect_bonus') {
                        // パーフェクトチャレンジは別処理で確認
                    } else if (boost.effect === 'streak_bonus') {
                        // ストリークパーティは別処理で確認
                    } else if (boost.effect === 'comeback') {
                        // カムバックボーナスは別処理で確認
                    } else if (boost.effect === 'random_points' && source === 'habit') {
                        // ダイスロール
                        const dice = Math.floor(Math.random() * (boost.max - boost.min + 1)) + boost.min;
                        bonus += dice;
                    } else if (boost.effect === 'coin_flip' && source === 'habit') {
                        // コインフリップ
                        const win = Math.random() < 0.5;
                        multiplier *= win ? boost.win : boost.lose;
                    } else if (boost.effect === 'chain' && source === 'habit') {
                        // チェインリアクション（最大+5）
                        if (!data.events.chainCount) data.events.chainCount = 0;
                        if (data.events.chainCount < boost.maxBonus) {
                            data.events.chainCount++;
                            bonus += data.events.chainCount;
                            saveData(data);
                        } else {
                            bonus += boost.maxBonus;
                        }
                    } else if (boost.effect === 'momentum' && source === 'habit') {
                        // モメンタムビルダー
                        if (!data.events.momentumIndex) data.events.momentumIndex = 0;
                        const index = Math.min(data.events.momentumIndex, boost.multipliers.length - 1);
                        multiplier *= boost.multipliers[index];
                        data.events.momentumIndex++;
                        saveData(data);
                    } else if (boost.effect === 'card_drop') {
                        // カードドロップ率は別処理
                    } else if (boost.effect === 'rare_boost') {
                        // レアカード確率は別処理
                    }
                    
                    // 旧形式のイベント処理（互換性のため）
                    const effect = boost.effect;
                    if (typeof effect === 'object') {
                        switch (effect.type) {
                            case 'global_multiplier':
                                multiplier *= effect.value;
                                break;
                            case 'category_multiplier':
                                if (category === effect.target) {
                                    multiplier *= effect.value;
                                }
                                break;
                        }
                    }
                });
            }
            
            finalPoints = Math.round(basePoints * multiplier + bonus);
            return finalPoints;
        }

        // ブースト効果（詳細内訳付き）
        function calculatePointsWithBoostsDetailed(basePoints, source, category = null) {
            const data = loadData();
            let multiplier = 1.0;
            let bonus = 0;
            const notes = [];
            const now = new Date();

            // チャレンジ系（daily/weekly）はブースト適用なし
            const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
            let allowChallengeBoost = false;
            if (isChallenge) {
                try {
                    // カードのチャレンジ倍率が有効なら適用を許可
                    if (data.cards && data.cards.activeEffects) {
                        const nowIso = new Date();
                        allowChallengeBoost = data.cards.activeEffects.some(e => e.type === 'challenge_multiplier' && new Date(e.startDate) <= nowIso && new Date(e.endDate) >= nowIso);
                    }
                    // イベント側にチャレンジ倍率があっても許可
                    if (!allowChallengeBoost && data.events && data.events.activeBoosts) {
                        allowChallengeBoost = data.events.activeBoosts.some(b => b.effect && b.effect.type === 'challenge_multiplier');
                    }
                } catch(_) {}
            }
            if (isChallenge && !allowChallengeBoost) {
                return { finalPoints: basePoints, multiplierTotal: 1.0, bonusTotal: 0, notes };
            }
            
            // カード効果
            if (data.cards && data.cards.activeEffects) {
                // ポイントジェム
                const pointGem = data.cards.activeEffects.find(e => e.type === 'point_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (pointGem) { multiplier *= pointGem.multiplier; notes.push(`PointGem ×${pointGem.multiplier}`); }
                // レインボーブースト（カテゴリーにのみ）
                const rainbow = data.cards.activeEffects.find(e => e.type === 'all_category_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (rainbow && category) { multiplier *= rainbow.multiplier; notes.push(`RainbowBoost ×${rainbow.multiplier}`); }
                // コンボチェーン（コンボのみ倍化）
                const comboChain = data.cards.activeEffects.find(e => e.type === 'combo_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (comboChain && source === 'combo') { multiplier *= (comboChain.value || 2.0); notes.push(`Combo ×${comboChain.value || 2.0}`); }
                // カテゴリーフェス（対象カテゴリだけ）
                const catFest = data.cards.activeEffects.find(e => e.type === 'category_theme_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (catFest && category && catFest.target === category) { multiplier *= (catFest.multiplier || 1.5); notes.push(`Festival(${category}) ×${catFest.multiplier || 1.5}`); }
                // ハッピーアワーは point_multiplier として処理されるので、ここでは削除
                // const hh = data.cards.activeEffects.find(e => e.type === 'time_window_bonus' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                // if (hh) { bonus += (hh.value || 10); notes.push(`HappyHour +${hh.value || 10}`); }
                // チャレンジ倍率（カード由来）
                const isCh = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
                const chMul = data.cards.activeEffects.find(e => e.type === 'challenge_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (isCh && chMul) { multiplier *= (chMul.value || 2.0); notes.push(`Challenge ×${chMul.value || 2.0}`); }
                // ジャーナルブースト（ジャーナルのみ倍率）
                const isJournal = (source === 'journal');
                const journalMul = data.cards.activeEffects.find(e => e.type === 'journal_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (isJournal && journalMul) { multiplier *= (journalMul.value || 2.0); notes.push(`Journal ×${journalMul.value || 2.0}`); }
                // スパークルストリーク（今日の達成ごとに+1）
                const todayKey = dateKeyLocal(new Date());
                const spark = data.cards.activeEffects.find(e => e.type === 'streak_spark' && e.dayKey === todayKey && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (spark && source === 'habit') {
                    const add = (typeof spark.perHabit === 'number' ? spark.perHabit : 1);
                    bonus += add; notes.push(`Sparkle +${add}`);
                }
                // スローダウン
                const slow = data.cards.activeEffects.find(e => e.type === 'slowdown' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
                if (slow) { multiplier *= 0.5; notes.push('Slowdown ×0.5'); }
            }
            
            // イベント効果（機能停止中は無効）
            if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
                data.events.activeBoosts.forEach(boost => {
                    // 新形式（文字列）のイベント処理
                    if (typeof boost.effect === 'string') {
                        if (boost.effect === 'points_multiplier' && boost.value) {
                            multiplier *= boost.value;
                            notes.push(`${boost.name} ×${boost.value}`);
                        }
                    }
                    // 旧形式（オブジェクト）のイベント処理（互換性のため残す）
                    else if (typeof boost.effect === 'object') {
                        const eff = boost.effect;
                        switch (eff.type) {
                            case 'global_multiplier': multiplier *= eff.value; notes.push(`Global ×${eff.value}`); break;
                            case 'category_multiplier': if (category === eff.target) { multiplier *= eff.value; notes.push(`${eff.target} ×${eff.value}`); } break;
                            case 'category_bonus': if (category === eff.target) { bonus += eff.value; notes.push(`${eff.target} +${eff.value}`); } break;
                            case 'challenge_multiplier': if (source === 'challenge') { multiplier *= eff.value; notes.push(`Challenge ×${eff.value}`); } break;
                            case 'time_bonus':
                                const hour = new Date().getHours();
                                if ((boost.duration === 'morning' && hour >= 6 && hour <= 9) || (boost.duration === 'night' && hour >= 20 && hour <= 23)) {
                                    bonus += eff.value; notes.push(`Time +${eff.value}`);
                                }
                                break;
                        }
                    }
                });
            }
            
            const finalPoints = Math.round(basePoints * multiplier + bonus);
            
            
            return { finalPoints, multiplierTotal: multiplier, bonusTotal: bonus, notes };
        }


        function debugAchieveAllPast() {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!window.currentHypothesis) return;
            
            const startDate = new Date(window.currentHypothesis.startDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            // 開始日から今日までの全ての日を達成にする
            const currentDate = new Date(startDate);
            while (currentDate <= today) {
                const dateKey = dateKeyLocal(currentDate);
                window.currentHypothesis.achievements[dateKey] = true;
                currentDate.setDate(currentDate.getDate() + 1);
            }
            
            // データを保存
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index] = window.currentHypothesis;
                saveData(data);
            }
            
            updateCalendar();
            updateProgress();
            showNotification('📅 過去全てを達成にしました', 'success');
        }
        
        function debugSkipDays() {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!window.currentHypothesis) return;
            
            if (!confirm('習慣の開始日を3日前にずらします。よろしいですか？')) {
                return;
            }
            
            // 開始日を3日前にずらす
            const startDate = new Date(window.currentHypothesis.startDate);
            startDate.setDate(startDate.getDate() - 3);
            window.currentHypothesis.startDate = startDate.toISOString();
            
            // データを保存
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index] = window.currentHypothesis;
                saveData(data);
            }
            
            updateCalendar();
            updateProgress();  // 即座に進捗を更新
            showNotification('⏩ 日付を3日進めました', 'success');
        }
        
        function debugCompleteHypothesis() {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!window.currentHypothesis) return;
            
            if (!confirm('習慣を強制的に完了させます。よろしいですか？')) {
                return;
            }
            
            // 開始日を totalDays 日前にずらして期間を終了させる（最終日にする）
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const newStartDate = new Date(today);
            newStartDate.setDate(today.getDate() - window.currentHypothesis.totalDays + 1);
            window.currentHypothesis.startDate = newStartDate.toISOString();
            
            // データを保存
            const data = loadData();
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                data.currentHypotheses[index] = window.currentHypothesis;
                saveData(data);
            }
            
            updateCalendar();
            updateProgress();  // 即座に進捗を更新
            showNotification('🏁 習慣を完了状態にしました', 'success');
        }
        
        // モバイル判定（スマホ/タブレット）
        function isMobileDevice() {
            const ua = navigator.userAgent || navigator.vendor || window.opera || '';
            const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
            const narrow = Math.min(window.innerWidth, window.innerHeight) <= 820;
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone/i.test(ua) || (touch && narrow);
        }

        // デバッグモードの有効化（URLパラメータまたはローカルストレージで制御）
        function checkDebugMode() {
            const debugButton = document.getElementById('debug-button');
            const debugPanel = document.getElementById('debug-panel');
            const debugToggle = document.getElementById('debug-toggle');

            // 端末種別に関わらずデバッグボタンを表示（モバイルでも表示）
            if (debugButton) {
                debugButton.style.display = 'block';
            }

            const urlParams = new URLSearchParams(window.location.search);
            const debugMode = urlParams.get('debug') === 'true' || localStorage.getItem('debugMode') === 'true';
            
            if (debugMode) {
                if (debugPanel) {
                    debugPanel.style.display = 'block';
                }
                // ボタンのスタイルを更新
                if (debugToggle) {
                    debugToggle.style.display = 'inline-flex';
                    debugToggle.style.background = 'var(--error)';
                    debugToggle.style.color = 'white';
                    debugToggle.style.border = 'none';
                }
            } else {
                if (debugToggle) debugToggle.style.display = 'inline-flex';
            }
        }
        
        // デバッグモードのトグル
        function toggleDebugMode() {
            const currentMode = localStorage.getItem('debugMode') === 'true';
            const newMode = !currentMode;
            localStorage.setItem('debugMode', newMode.toString());
            
            const debugPanel = document.getElementById('debug-panel');
            const debugToggle = document.getElementById('debug-toggle');
            
            if (newMode) {
                if (debugPanel) {
                    debugPanel.style.display = 'block';
                }
                if (debugToggle) {
                    debugToggle.style.display = 'inline-flex';
                    debugToggle.style.background = 'var(--error)';
                    debugToggle.style.color = 'white';
                    debugToggle.style.border = 'none';
                }
                showNotification('🛠️ デバッグモードを有効化しました', 'success');
            } else {
                if (debugPanel) {
                    debugPanel.style.display = 'none';
                }
                if (debugToggle) {
                    debugToggle.style.display = 'inline-flex';
                    debugToggle.style.background = 'none';
                    debugToggle.style.color = 'var(--text-secondary)';
                    debugToggle.style.border = '1px solid var(--border)';
                }
                showNotification('🛠️ デバッグモードを無効化しました', 'info');
            }
        }

        // デバッグボタンが存在しなければ動的に生成し、常に表示されるようにする
        function ensureDebugButton() {
            let btn = document.getElementById('debug-button');
            if (!btn) {
                btn = document.createElement('button');
                btn.id = 'debug-button';
                btn.textContent = '🛠️ Debug';
                btn.onclick = () => { try { openDebugMenu(); } catch (_) {} };
                document.body.appendChild(btn);
            }
            // 常に最前面で見えるようスタイルを適用
            Object.assign(btn.style, {
                position: 'fixed',
                right: '16px',
                bottom: '88px',
                zIndex: '3000',
                border: 'none',
                borderRadius: '999px',
                padding: '10px 14px',
                background: '#0ea5e9',
                color: 'white',
                fontWeight: '700',
                boxShadow: '0 6px 16px rgba(0,0,0,0.25)',
                cursor: 'pointer',
                opacity: '0.9',
                display: 'block'
            });
        }

        // デバッグ：カードを追加
        function debugAddCard(cardId) {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            const data = loadData();
            
            data.cards.inventory.push({
                cardId: cardId,
                acquiredDate: new Date().toISOString(),
                used: false
            });
            
            saveData(data);
            updateCardUseButton();
            
            const card = CARD_MASTER[cardId];
            showNotification(`🎴 ${card.name}を追加しました`, 'success');
            
            // パーフェクトボーナスの場合は即座に有効化
            if (cardId === 'perfect_bonus') {
                updatePerfectBonusIndicator();
            }
        }
        
        // デバッグ：ペナルティ効果を適用
        function debugApplyPenalty(penaltyId) {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!window.currentHypothesis && penaltyId !== 'double_or_nothing') {
                showNotification('⚠️ 進行中の習慣がありません', 'error');
                return;
            }
            
            const card = CARD_MASTER[penaltyId];
            
            switch(penaltyId) {
                case 'extension_card':
                    // 期間を延長
                    window.currentHypothesis.totalDays += 3;
                    updateCalendar();
                    updateProgress();
                    showCardEffect('延長カード発動！', '検証期間が3日延長されました', '#ef4444');
                    break;
                    
                case 'hard_mode':
                    // ハードモードを有効化
                    window.currentHypothesis.hardMode = true;
                    updatePenaltyIndicators();
                    showCardEffect('ハードモード発動！', '90%以上の達成率が必要になりました', '#dc2626');
                    break;
                    
                case 'reset_risk':
                    // リセットリスクを有効化
                    window.currentHypothesis.resetRisk = true;
                    updatePenaltyIndicators();
                    showCardEffect('リセットリスク発動！', '3日連続未達成で全てリセットされます', '#dc2626');
                    break;
                    
                case 'achievement_decrease':
                    // 達成率減少を設定
                    window.currentHypothesis.achievementDecrease = 10;
                    updatePenaltyIndicators();
                    showCardEffect('達成率減少発動！', '最終達成率から10%減少します', '#ef4444');
                    break;
                    
                    
                case 'double_or_nothing':
                    // ダブルオアナッシングを設定
                    window.doubleOrNothingActive = true;
                    showCardEffect('ダブルオアナッシング発動！', '次の習慣で100%達成しないとペナルティカード2枚', '#dc2626');
                    const data = loadData();
                    if (!data.cards.activeEffects) data.cards.activeEffects = [];
                    data.cards.activeEffects.push({
                        cardId: 'double_or_nothing',
                        activatedDate: new Date().toISOString()
                    });
                    saveData(data);
                    break;
                    
                case 'event_seal':
                    // イベント封印効果を3日間適用
                    const sealData = loadData();
                    const sealStart = new Date();
                    const sealEnd = new Date();
                    sealEnd.setDate(sealEnd.getDate() + 3);
                    if (!sealData.cards.activeEffects) sealData.cards.activeEffects = [];
                    sealData.cards.activeEffects.push({
                        type: 'event_seal',
                        startDate: sealStart.toISOString(),
                        endDate: sealEnd.toISOString()
                    });
                    saveData(sealData);
                    showCardEffect('イベント封印発動！', '3日間イベントが発生しません', '#64748b');
                    break;
                    
                case 'mission_overload':
                    // ミッション追加（今日のミッションに2つ追加）
                    window.additionalMissions = 2;
                    showCardEffect('ミッション追加発動！', '今日のミッションが2つ追加されました', '#991b1b');
                    break;
                    
                case 'slowdown':
                    // ポイント0.5倍効果を3日間適用
                    const slowData = loadData();
                    const slowStart = new Date();
                    const slowEnd = new Date();
                    slowEnd.setDate(slowEnd.getDate() + 3);
                    if (!slowData.cards.activeEffects) slowData.cards.activeEffects = [];
                    slowData.cards.activeEffects.push({
                        type: 'slowdown',
                        startDate: slowStart.toISOString(),
                        endDate: slowEnd.toISOString()
                    });
                    saveData(slowData);
                    showCardEffect('スローダウン発動！', '3日間獲得ポイントが0.5倍になります', '#7c2d12');
                    break;
                    
            }
            
            // データを保存（double_or_nothing以外）
            if (window.currentHypothesis && penaltyId !== 'double_or_nothing') {
                const data = loadData();
                const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
                if (index !== -1) {
                    data.currentHypotheses[index] = window.currentHypothesis;
                    saveData(data);
                }
            }
            
            showNotification(`⚠️ ${card.name}の効果を適用しました`, 'error');
        }
        
        // デバッグ：全カードをクリア
        function debugClearAllCards() {
            if (isMobileDevice && isMobileDevice()) { showNotification('⚠️ デバッグ機能はPCのみ利用できます', 'error'); return; }
            if (!confirm('全てのカードと効果をクリアします。よろしいですか？')) {
                return;
            }
            
            const data = loadData();
            
            // カードインベントリをクリア
            data.cards.inventory = [];
            data.cards.pendingPenalties = [];
            data.cards.activeEffects = [];
            
            // 現在の習慣のペナルティ効果をクリア
            if (window.currentHypothesis) {
                window.currentHypothesis.hardMode = false;
                window.currentHypothesis.resetRisk = false;
                window.currentHypothesis.achievementDecrease = 0;
                
                const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
                if (index !== -1) {
                    data.currentHypotheses[index] = window.currentHypothesis;
                }
            }
            
            saveData(data);
            
            // UIを更新
            updateCardUseButton();
            updatePerfectBonusIndicator();
            updatePenaltyIndicators();
            
            showNotification('🗑️ 全てのカードと効果をクリアしました', 'info');
        }
        
        // プロテクトシールドは削除
        
        // 達成率ブースターを使用
        function useAchievementBooster() {
            closeCardUseMenu();
            
            if (!window.currentHypothesis || window.currentHypothesis.completed) {
                showNotification('⚠️ 進行中の習慣がありません', 'error');
                return;
            }
            
            const data = loadData();
            
            // カードを消費
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'achievement_booster' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ 達成率ブースターがありません', 'error');
                return;
            }
            
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(cardIndex, 1);
            
            // アクティブエフェクトに追加（この習慣に紐づく）
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({
                cardId: 'achievement_booster',
                activatedDate: new Date().toISOString(),
                targetHypothesisId: window.currentHypothesis.id
            });
            
            // データを保存
            const index = data.currentHypotheses.findIndex(h => h.id === window.currentHypothesis.id);
            if (index !== -1) {
                // 習慣本体の変更は不要
            }
            
            saveData(data);
            
            showCardEffect('達成率ブースター発動！', '最終達成率に+15%のボーナスが付与されます', '#3b82f6');
        }
        

        // 新しいカード効果関数

        // イベントトリガー
        function useEventTrigger() {
            closeCardUseMenu();
            const data = loadData();
            
            // カードを消費
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'event_trigger' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ イベントトリガーがありません', 'error');
                return;
            }
            
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(cardIndex, 1);
            
            // 明日のイベントを確定させる
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];
            
            if (!data.events) data.events = {};
            if (!data.events.forcedEvents) data.events.forcedEvents = {};
            data.events.forcedEvents[tomorrowStr] = true;
            
            saveData(data);
            showNotification('🎪 明日は必ずイベントが発生します！', 'success');
            updateCardUseButton();
        }

        // コンボチェーン: 今日のコンボ×2
        function useComboChain() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'combo_chain' && !c.used);
            if (idx === -1) { showNotification('⚠️ コンボチェーンがありません', 'error'); return; }
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'combo_chain', type:'combo_multiplier', value:2.0, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('🧩 コンボチェーン発動！','今日のコンボは×2','\#22c55e');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // スパークルストリーク: 今日の習慣達成ごとに+1pt
        function useSparkleStreak() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'sparkle_streak' && !c.used);
            if (idx === -1) { showNotification('⚠️ スパークルストリークがありません', 'error'); return; }
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            const dayKey = dateKeyLocal(new Date());
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'sparkle_streak', type:'streak_spark', perHabit:1, dayKey, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('🎆 スパークルストリーク！','今日の達成ごとに+1pt','\#f97316');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // カテゴリーフェス: 指定カテゴリ×1.5（今日）
        function useCategoryFestival() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'category_festival' && !c.used);
            if (idx === -1) { showNotification('⚠️ カテゴリーフェスがありません', 'error'); return; }
            // カテゴリ選択（ホーム画面のカテゴリを優先して参照）
            const filterEl = document.getElementById('category-filter');
            const selected = filterEl ? (filterEl.value || 'all') : (localStorage.getItem('selectedCategory') || 'all');
            const categoryMaster = initializeCategoryMaster();
            const validKeys = Object.keys(categoryMaster);
            let target = (selected && selected !== 'all' && validKeys.includes(selected)) ? selected : null;
            // 必要なら簡易UIで選択
            const options = ['study','exercise','health','work','hobby','other'];
            const label = prompt('対象カテゴリを入力 (study/exercise/health/work/hobby/other):','exercise');
            const targetInput = options.includes((label||'').trim()) ? (label||'').trim() : null;
            if (!target && targetInput) target = targetInput;
            if (!target) { showNotification('⚠️ 無効なカテゴリです', 'error'); return; }
            // カードを使用済みにして即座に削除  
            data.cards.inventory.splice(idx, 1);
            const start = new Date(); const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'category_festival', type:'category_theme_boost', target, multiplier:1.5, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('🎪 カテゴリーフェス！', `${target} が×1.5`, '\#8b5cf6');
            updateCardUseButton();
        }

        // ハッピーアワー: 今から60分 +10pt
        function useHappyHour() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'happy_hour' && !c.used);
            if (idx === -1) { showNotification('⚠️ ハッピーアワーがありません', 'error'); return; }
            // カードを使用済みにして即座に削除  
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'happy_hour', type:'point_multiplier', multiplier:1.5, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('⏰ ハッピーアワー！','1時間ポイント1.5倍','\#06b6d4');
            updateCardUseButton();
        }

        // ミニレインボー: 今日だけ全カテゴリ×1.2
        function useMiniRainbow() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'mini_rainbow' && !c.used);
            if (idx === -1) { showNotification('⚠️ ミニレインボーがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'mini_rainbow', type:'all_category_boost', multiplier:1.2, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('🌈 ミニレインボー！','全カテゴリ×1.2','\#a855f7');
            updateCardUseButton();
        }

        // パワーナップ: 使用時に即時+10pt獲得
        function usePowerNap() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'power_nap' && !c.used);
            if (idx === -1) { showNotification('⚠️ パワーナップがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);

            // 即時+10ptをポイントシステムへ加算
            if (!data.pointSystem) { data.pointSystem = { currentPoints: 0, lifetimeEarned: 0, lifetimeSpent: 0, currentLevel: 1, levelProgress: 0, transactions: [] }; }
            const gain = 10;
            data.pointSystem.currentPoints += gain;
            data.pointSystem.lifetimeEarned = (data.pointSystem.lifetimeEarned || 0) + gain;
            data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;
            if (!Array.isArray(data.pointSystem.transactions)) data.pointSystem.transactions = [];
            data.pointSystem.transactions.unshift({
                type: 'earn', amount: gain, source: 'card', description: 'パワーナップ', timestamp: new Date().toISOString()
            });

            // カード使用を記録
            if (!data.cards.dailyUsage) data.cards.dailyUsage = {};
            const today = dateKeyLocal(new Date());
            if (!data.cards.dailyUsage[today]) data.cards.dailyUsage[today] = [];
            data.cards.dailyUsage[today].push({ cardId: 'power_nap', time: new Date().toISOString() });

            saveData(data);
            showCardEffect('😴 パワーナップ！','10pt獲得！','\#06b6d4');
            updatePointDisplay();
            updateCardUseButton();
        }
        
        // チャレンジシャッフル: 今日のチャレンジを変更
        function useShuffleChallenge() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'shuffle_challenge' && !c.used);
            if (idx === -1) { showNotification('⚠️ チャレンジシャッフルがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            
            // 今日のチャレンジをリセット
            const today = dateKeyLocal(new Date());
            
            // デフォルトのチャレンジプール
            const DAILY_CHALLENGES = [
                { name: '朝活チャレンジ', description: '朝8時までに1つ習慣を達成', points: 5 },
                { name: 'コンボマスター', description: '3つ連続で習慣を達成', points: 7 },
                { name: 'カテゴリ制覇', description: '異なる3カテゴリの習慣を達成', points: 8 },
                { name: 'スピードラン', description: '1時間以内に3つ習慣を達成', points: 10 },
                { name: 'パーフェクトデー', description: '今日の習慣を全て達成', points: 15 }
            ];
            
            // カスタムチャレンジがあれば追加
            const customChallenges = data.challenges.customChallenges || [];
            const allChallenges = [...DAILY_CHALLENGES, ...customChallenges];
            
            // ランダムに新しいチャレンジを選択
            data.challenges.dailyChallenge = allChallenges[Math.floor(Math.random() * allChallenges.length)];
            data.challenges.lastDailyReset = today;
            
            saveData(data);
            showCardEffect('🎯 チャレンジシャッフル！','新しいチャレンジに変更！','\#8b5cf6');
            
            // ホーム画面のチャレンジ表示を更新
            const dailyContainer = document.getElementById('daily-challenge-container');
            if (dailyContainer && data.challenges.dailyChallenge) {
                const challenge = data.challenges.dailyChallenge;
                dailyContainer.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: var(--surface-light); border-radius: 8px;">
                        <div>
                            <div style="font-weight: 600; margin-bottom: 4px;">${challenge.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">${challenge.description}</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 18px; font-weight: bold; color: #8b5cf6;">+${challenge.points}pt</div>
                        </div>
                    </div>
                `;
            }
            
            updateCardUseButton();
        }
        
        // イベントシャッフル: 今日のイベントを変更
        function useEventShuffle() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'event_shuffle' && !c.used);
            if (idx === -1) { showNotification('⚠️ イベントシャッフルがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            
            // イベントを強制的に再選択
            const events = EVENT_DEFINITIONS.filter(e => {
                // 週末スペシャルは週末のみ
                if (e.id === 'weekend_special') {
                    const day = new Date().getDay();
                    return day === 0 || day === 6;
                }
                return true;
            });
            
            const newEvent = events[Math.floor(Math.random() * events.length)];
            data.events = data.events || {};
            data.events.activeBoosts = [newEvent];
            data.events.lastEventCheck = dateKeyLocal(new Date());
            
            saveData(data);
            showCardEffect('🎲 イベントシャッフル！',`「${newEvent.name}」に変更！`,'\#f59e0b');
            updateEventDisplay();
            updateCardUseButton();
        }

        // コンボサージ: 今日のコンボ×1.5
        function useComboSurge() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'combo_surge' && !c.used);
            if (idx === -1) { showNotification('⚠️ コンボサージがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'combo_surge', type:'combo_multiplier', value:1.5, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('🧨 コンボサージ！','コンボが×1.5','\#f97316');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // アフタヌーンジェム: 今日だけポイント×1.2
        function useAfternoonGem() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'afternoon_gem' && !c.used);
            if (idx === -1) { showNotification('⚠️ アフタヌーンジェムがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'afternoon_gem', type:'point_multiplier', multiplier:1.5, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('☕ アフタヌーンジェム！','今日のポイント×1.5','\#10b981');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }
        
        // パワーブースト: 習慣達成時に+5pt
        function usePowerBoost() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'power_boost' && !c.used);
            if (idx === -1) { showNotification('⚠️ パワーブーストがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'power_boost', type:'power_boost', startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('💪 パワーブースト！','習慣達成時に+5pt','#dc2626');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // イベントチケット: ダブルポイントデーを今日に発動
        function useEventTicket() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'event_ticket' && !c.used);
            if (idx === -1) { showNotification('⚠️ イベントチケットがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            if (!data.events) data.events = { activeBoosts: [], lastEventCheck:new Date().toISOString(), milestoneNotifications:{}, eventHistory: [] };
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            data.events.activeBoosts.push({
                id: 'double_points_manual',
                name: '💰 ダブルポイントデー',
                description: '今日だけ全てのポイントが2倍！',
                effect: { type: 'global_multiplier', value: 2.0 },
                rarity: 'legendary',
                duration: 'today',
                startDate: start.toISOString(),
                endDate: end.toISOString()
            });
            saveData(data);
            showCardEffect('🎫 イベント発動！','ダブルポイントデー (×2)','\#3b82f6');
            try { updateEventDisplay(); } catch(_) {}
            updateCardUseButton();
        }

        // チャレンジブースト: 今日のチャレンジポイント×2
        function useChallengeBoostToday() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'challenge_boost_today' && !c.used);
            if (idx === -1) { showNotification('⚠️ チャレンジブーストがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'challenge_boost_today', type:'challenge_multiplier', value:2.0, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('🎯 チャレンジブースト！','今日のチャレンジ×2','\#22c55e');
            updateCardUseButton();
        }

        // ジャーナルブースト: 今日のジャーナルポイント×2
        function useJournalBoostToday() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'journal_boost_today' && !c.used);
            if (idx === -1) { showNotification('⚠️ ジャーナルブーストがありません', 'error'); return; }
            data.cards.inventory.splice(idx, 1);
            const start = new Date();
            const end = new Date(); end.setHours(23,59,59,999);
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'journal_boost_today', type:'journal_multiplier', value:2.0, startDate:start.toISOString(), endDate:end.toISOString() });
            saveData(data);
            showCardEffect('📝 ジャーナルブースト！','今日のジャーナル×2','\\#94a3b8');
            updateCardUseButton();
        }

        // ミステリーボックス: 今日の最初の達成でサプライズ
        function useMysteryBox() {
            closeCardUseMenu();
            const data = loadData();
            const idx = data.cards.inventory.findIndex(c => c.cardId === 'mystery_box' && !c.used);
            if (idx === -1) { showNotification('⚠️ ミステリーボックスがありません', 'error'); return; }
            // カードを使用済みにして即座に削除  
            data.cards.inventory.splice(idx, 1);
            const dayKey = dateKeyLocal(new Date());
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({ cardId:'mystery_box', type:'mystery_reward', dayKey, claimed:false, options:['points15','event_trigger','point_gem'] });
            saveData(data);
            showCardEffect('🎁 ミステリーボックス！','今日の最初の達成でサプライズ','\#f59e0b');
            updateCardUseButton();
        }

        // イベントコンボ
        function useEventCombo() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'event_combo' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ イベントコンボがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 3日間連続でイベントを100%発生させる
            if (!data.events) data.events = {};
            if (!data.events.forcedEvents) data.events.forcedEvents = {};
            
            // 今日から3日間（今日、明日、明後日）
            for (let i = 0; i < 3; i++) {
                const date = new Date();
                date.setDate(date.getDate() + i);
                const dateStr = dateKeyLocal(date); // ローカル日付形式を使用
                data.events.forcedEvents[dateStr] = true;
            }
            
            saveData(data);
            showNotification('🔮 3日間連続でイベントが発生します！', 'success');
            updateCardUseButton();
        }

        // ポイントジェム
        function usePointGem() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'point_gem' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ ポイントジェムがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 明日1日限定でポイント1.5倍効果を付与
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            
            // 明日の開始時刻（0時）と終了時刻（23時59分）を設定
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            
            const endDate = new Date(tomorrow);
            endDate.setHours(23, 59, 59, 999);
            
            data.cards.activeEffects.push({
                cardId: 'point_gem',
                type: 'point_multiplier',
                multiplier: 1.5,
                startDate: tomorrow.toISOString(),
                endDate: endDate.toISOString()
            });
            
            saveData(data);
            showNotification('💎 明日1日限定でポイントが1.5倍になります！', 'success');
            updateCardUseButton();
        }

        // ミッションマスター
        function useMissionMaster() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'mission_master' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ ミッションマスターがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 今日のミッションを自動達成
            const today = new Date().toISOString().split('T')[0];
            if (!data.challenges) data.challenges = {};
            if (!data.challenges.daily) data.challenges.daily = {};
            if (!data.challenges.missions) data.challenges.missions = {};
            
            // 今日だけ追加ミッションフラグを設定
            if (!data.challenges.extraMissions) data.challenges.extraMissions = {};
            data.challenges.extraMissions[today] = { count: 2, used: true };
            
            saveData(data);

            showCardEffect('🎯 ミッションマスター！', '今日のミッションが2つ追加されます', '#f59e0b');
            updateCardUseButton();
            updateChallenges();
        }

        // レインボーブースト
        function useRainbowBoost() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'rainbow_boost' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ レインボーブーストがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 今日のすべてのカテゴリーポイント2倍
            const today = new Date();
            const endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            data.cards.activeEffects.push({
                cardId: 'rainbow_boost',
                type: 'all_category_boost',
                multiplier: 2,
                startDate: today.toISOString(),
                endDate: endDate.toISOString()
            });
            
            saveData(data);
            showNotification('🌈 今日はすべてのカテゴリーでポイント2倍！', 'success');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // クイックスタート
        function useQuickStart() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'quick_start' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ クイックスタートがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 次の習慣作成時に効果を適用するフラグを設定
            if (!data.cards.pendingEffects) data.cards.pendingEffects = [];
            data.cards.pendingEffects.push({
                cardId: 'quick_start',
                type: 'auto_achieve_first_days',
                days: 3
            });
            
            saveData(data);
            showNotification('⚡ 次の習慣の最初の3日が自動達成されます！', 'success');
            updateCardUseButton();
        }

        // 連続達成ボーナス（仕様変更：ストリークによるボーナス倍率を2倍に）
        function useStreakBonus() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'streak_bonus' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ 連続達成ボーナスがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 7日間、ストリークボーナス倍率×2
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 2);
            
            data.cards.activeEffects.push({
                cardId: 'streak_bonus',
                type: 'streak_multiplier_boost',
                multiplier: 2,
                startDate: today.toISOString(),
                endDate: endDate.toISOString()
            });
            
            saveData(data);
            showNotification('🔥 7日間、連続達成ボーナスの倍率が2倍！', 'success');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // ラッキーセブン（仕様変更：イベント発生率×2 を7日間）
        function useLuckySeven() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'lucky_seven' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ ラッキーセブンがありません', 'error');
                return;
            }
            
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 7日間 イベント発生率2倍
            if (!data.cards.activeEffects) data.cards.activeEffects = [];
            const today = new Date();
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + 7);
            
            data.cards.activeEffects.push({
                cardId: 'lucky_seven',
                type: 'event_rate_multiplier',
                multiplier: 2,
                startDate: today.toISOString(),
                endDate: endDate.toISOString()
            });
            
            saveData(data);
            showNotification('🎰 7日間イベント発生率が2倍になりました！', 'success');
            updateCardUseButton();
            updateActiveEffectsDisplay();
        }

        // 変換の魔法
        function useConversionMagic() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'conversion_magic' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ 変換の魔法がありません', 'error');
                return;
            }
            
            // ペナルティカードを探す
            const penaltyCards = data.cards.inventory.filter(
                card => !card.used && CARD_MASTER[card.cardId] && CARD_MASTER[card.cardId].type === 'penalty'
            );
            
            if (penaltyCards.length === 0) {
                showNotification('⚠️ 変換できるペナルティカードがありません', 'error');
                return;
            }
            
            // ランダムにペナルティカードを選択
            const targetCard = penaltyCards[Math.floor(Math.random() * penaltyCards.length)];
            const targetIndex = data.cards.inventory.indexOf(targetCard);
            
            // カードを使用済みにして即座に削除
            data.cards.inventory.splice(cardIndex, 1);
            
            // ペナルティカードを削除
            data.cards.inventory.splice(targetIndex, 1);
            
            // ランダムな報酬カードを追加
            const rewardCards = Object.keys(CARD_MASTER).filter(
                id => CARD_MASTER[id].type === 'reward'
            );
            const newCardId = rewardCards[Math.floor(Math.random() * rewardCards.length)];
            
            data.cards.inventory.push({
                cardId: newCardId,
                acquiredDate: new Date().toISOString(),
                used: false
            });
            // ドロップ履歴に追加（報酬カード）
            try {
                if (!data.cards.dropHistory) data.cards.dropHistory = [];
                data.cards.dropHistory.unshift(newCardId);
                if (data.cards.dropHistory.length > 100) data.cards.dropHistory = data.cards.dropHistory.slice(0,100);
            } catch(_){}
            
            
            saveData(data);
            showNotification(`🪄 ${CARD_MASTER[targetCard.cardId].name}を${CARD_MASTER[newCardId].name}に変換しました！`, 'success');
            updateCardUseButton();
        }

        // 運命のダイス
        function useFateDice() {
            closeCardUseMenu();
            const data = loadData();
            
            const cardIndex = data.cards.inventory.findIndex(
                card => card.cardId === 'fate_dice' && !card.used
            );
            
            if (cardIndex === -1) {
                showNotification('⚠️ 運命のダイスがありません', 'error');
                return;
            }
            
            // カード消費
            data.cards.inventory[cardIndex].used = true;
            data.cards.inventory[cardIndex].usedDate = new Date().toISOString();
            
            // 50/50で報酬かペナルティ
            const isReward = Math.random() < 0.5;
            
            if (isReward) {
                // 報酬効果：10-30ポイント獲得（ブースト適用あり）
                const points = Math.floor(Math.random() * 21) + 10;
                earnPoints(points, 'card', '運命のダイス（大当たり）');
                showNotification(`🎲 大当たり！+${points}pt`, 'success');
            } else {
                // ペナルティ効果：5-15ポイント失う（トランザクション記録）
                const points = Math.floor(Math.random() * 11) + 5;
                spendPoints(points, '運命のダイス（ハズレ）');
                showNotification(`🎲 残念...-${points}pt`, 'error');
            }
            
            saveData(data);
            if (typeof updateCardUseButton === 'function') updateCardUseButton();
            updatePointDisplay();
        }
        
        // 通知を表示
        // ========== データエクスポート/インポート機能 ==========
        
        // 全データをエクスポート
        function exportAllData() {
            try {
                const data = loadData();
                
                // エクスポート用のデータ構造（完全なデータを保存）
                const exportData = {
                    version: '3.0.0',
                    exportDate: new Date().toISOString(),
                    appVersion: 'PDCA-Lab v3.3.0',
                    // LocalStorageの全データをそのまま保存
                    // 含まれるデータ:
                    // - currentHypotheses: 現在の習慣リスト
                    // - completedHypotheses: 完了した習慣リスト
                    // - pointSystem: ポイントシステム（現在ポイント、レベル、取引履歴等）
                    // - challenges: チャレンジデータ（デイリー、ウィークリー、カスタム等）
                    // - cards: カードシステム（インベントリ、アクティブ効果、ペナルティ等）
                    // - events: イベントシステム（アクティブブースト、強制イベント等）
                    // - badges: 獲得バッジ
                    // - dailyJournal: ジャーナルデータ（エントリー、睡眠記録、統計等）
                    // - meta: メタデータ（デバッグフラグ、最終デブリーフ等）
                    // - effortBonusPlans: 努力ボーナスプラン
                    // - specialRewards: 特別報酬の取得履歴
                    // - categoryMaster: カテゴリ管理データ
                    // - stageNotifications: ステージ通知履歴
                    // - その他すべてのカスタムフィールド
                    data: data  // 全データを完全にエクスポート
                };
                
                // JSONファイルとしてダウンロード
                const jsonStr = JSON.stringify(exportData, null, 2);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const dateStr = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `pdca-lab-backup-${dateStr}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                showNotification('📤 データのエクスポートが完了しました', 'success');
                console.log('データエクスポート完了:', exportData);
                
            } catch (error) {
                console.error('エクスポートエラー:', error);
                showNotification('❌ エクスポートに失敗しました', 'error');
            }
        }
        
        // データをインポート（統一版）
        function handleImportFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const importedData = JSON.parse(e.target.result);
                    
                    let dataToImport = null;
                    let exportDate = 'Unknown';
                    
                    console.log('インポートデータ確認:', importedData);
                    
                    // 最新形式（v3.0.0）のチェック - 完全なデータ
                    if (importedData.version === '3.0.0' && importedData.data) {
                        dataToImport = importedData.data;
                        exportDate = importedData.exportDate || 'Unknown';
                        console.log('v3.0.0形式でインポート（完全データ）');
                    }
                    // 新形式（v1.0.0）のチェック
                    else if (importedData.version === '1.0.0' && importedData.data) {
                        // v1.0.0形式のデータもそのまま利用可能
                        dataToImport = importedData.data;
                        exportDate = importedData.exportDate || 'Unknown';
                        console.log('v1.0.0形式でインポート');
                    }
                    // 新形式（v2.0）のチェック
                    else if (importedData.version === '2.0' && importedData.data) {
                        dataToImport = importedData.data;
                        exportDate = importedData.exportDate || 'Unknown';
                        console.log('v2.0形式でインポート');
                    }
                    // 旧形式（v1.0）のチェック
                    else if (importedData.version === '1.0') {
                        // 旧形式から新形式に変換
                        const currentData = loadData();
                        dataToImport = {
                            ...currentData,
                            currentHypotheses: importedData.currentHabits || importedData.currentHypotheses || [],
                            completedHypotheses: importedData.completedHabits || importedData.completedHypotheses || [],
                            badges: importedData.badges || {},
                            cards: importedData.cards || currentData.cards
                        };
                        exportDate = importedData.exportDate || 'Unknown';
                        console.log('v1.0形式でインポート（変換）');
                    }
                    // エクスポートデータに直接アクセス（version無しだがdataプロパティあり）
                    else if (importedData.data && typeof importedData.data === 'object') {
                        dataToImport = importedData.data;
                        exportDate = importedData.exportDate || 'Unknown';
                        console.log('データプロパティからインポート');
                    }
                    // 直接データ形式（バージョンなし）
                    else if (importedData.currentHypotheses !== undefined || 
                             importedData.pointSystem !== undefined ||
                             importedData.dailyJournal !== undefined) {
                        dataToImport = importedData;
                        exportDate = 'Unknown';
                        console.log('直接データ形式でインポート');
                    }
                    else {
                        console.error('認識できないデータ形式:', importedData);
                        throw new Error('サポートされていないファイル形式です。\n\nPDCA-Labからエクスポートしたファイルを選択してください。');
                    }
                    
                    // データの必須プロパティを確認・補完
                    if (!dataToImport.currentHypotheses) dataToImport.currentHypotheses = [];
                    if (!dataToImport.completedHypotheses) dataToImport.completedHypotheses = [];
                    if (!dataToImport.cards) dataToImport.cards = { inventory: [], pendingPenalties: [] };
                    if (!dataToImport.badges) dataToImport.badges = {};
                    if (!dataToImport.pointSystem) {
                        dataToImport.pointSystem = {
                            currentPoints: 0,
                            lifetimeEarned: 0,
                            lifetimeSpent: 0,
                            transactions: [],
                            customRewards: []
                        };
                    }
                    if (!dataToImport.dailyJournal) {
                        dataToImport.dailyJournal = {
                            entries: {},
                            stats: {
                                currentStreak: 0,
                                longestStreak: 0,
                                totalEntries: 0,
                                lastEntry: null
                            }
                        };
                    }
                    if (!dataToImport.challengeSystem) {
                        dataToImport.challengeSystem = {
                            daily: [],
                            weekly: [],
                            custom: [],
                            stats: {
                                dailyStreak: 0,
                                weeklyStreak: 0,
                                totalCompleted: 0,
                                dailyCompletedCount: 0,
                                weeklyCompletedCount: 0
                            },
                            history: []
                        };
                    }
                    
                    // 確認ダイアログ
                    const dateStr = exportDate !== 'Unknown' ? `${exportDate} にエクスポートされた` : '';
                    if (!confirm(`${dateStr}データをインポートします。\n\n現在のデータは上書きされます。続行しますか？`)) {
                        event.target.value = ''; // ファイル選択をリセット
                        return;
                    }
                    
                    // データを保存
                    saveData(dataToImport);
                    
                    showNotification('📥 データのインポートが完了しました', 'success');
                    console.log('データインポート完了:', dataToImport);
                    
                    // 2秒後にページをリロード
                    setTimeout(() => {
                        location.reload();
                    }, 2000);
                    
                } catch (error) {
                    console.error('インポートエラー:', error);
                    showNotification('❌ インポートに失敗しました: ' + error.message, 'error');
                }
                
                // ファイル選択をリセット
                event.target.value = '';
            };
            
            reader.readAsText(file);
        }
        
        // 通知キューシステム
        let notificationQueue = [];
        let isShowingNotification = false;
        
        function showNotification(message, type = 'info', priority = 0) {
            // 通知をキューに追加（priorityが高いものほど優先）
            notificationQueue.push({ message, type, priority });
            
            // priorityでソート（高い順）
            notificationQueue.sort((a, b) => b.priority - a.priority);
            
            // 表示中でなければ次の通知を表示
            if (!isShowingNotification) {
                showNextNotification();
            }
        }
        
        function showNextNotification() {
            if (notificationQueue.length === 0) {
                isShowingNotification = false;
                return;
            }
            
            isShowingNotification = true;
            const { message, type } = notificationQueue.shift();
            
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                font-weight: 600;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                z-index: 3000;
                animation: slideIn 0.3s ease-out;
                max-width: 300px;
                white-space: pre-line;
            `;
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            // 表示時間を調整（重要な通知は長めに表示）
            const displayTime = message.includes('レベルアップ') ? 4000 : 
                               message.includes('達成率') ? 3500 : 
                               3000;
            
            setTimeout(() => {
                notification.style.animation = 'slideOut 0.3s ease-out';
                setTimeout(() => {
                    notification.remove();
                    // 少し間を空けて次の通知を表示
                    setTimeout(() => {
                        showNextNotification();
                    }, 300);
                }, 300);
            }, displayTime);
        }

        // データのエクスポート（JSON）
        
        // 初期化
        // タッチイベント処理を初期化
        function initTouchHandlers() {
            let touchTimer = null;
            let touchTarget = null;
            
            document.addEventListener('touchstart', function(e) {
                const target = e.target.closest('.journal-entry-item');
                if (target && (target.dataset.type === 'morning' || target.dataset.type === 'evening')) {
                    const data = loadData();
                    const todayKey = dateKeyLocal(new Date());
                    const todayEntry = data.dailyJournal?.entries?.[todayKey];
                    
                    // エントリが存在する場合のみ長押しを有効化
                    const hasEntry = target.dataset.type === 'morning' 
                        ? todayEntry?.morning?.timestamp
                        : todayEntry?.evening?.timestamp;
                    
                    if (hasEntry) {
                        touchTarget = target;
                        touchTimer = setTimeout(() => {
                            // 長押しでコンテキストメニューを表示
                            const touch = e.touches[0];
                            showJournalContextMenu({
                                preventDefault: () => {},
                                clientX: touch.clientX,
                                clientY: touch.clientY
                            }, target.dataset.type);
                            
                            // 振動フィードバック（対応デバイスのみ）
                            if (navigator.vibrate) {
                                navigator.vibrate(50);
                            }
                        }, 500); // 500ms長押し
                    }
                }
            });
            
            document.addEventListener('touchend', function() {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
                touchTarget = null;
            });
            
            document.addEventListener('touchmove', function() {
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
                touchTarget = null;
            });
        }
        
        // DOMが読み込まれたら各種初期化処理を実行
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                initializeApp();
                initTouchHandlers();
            });
        } else {
            // すでにDOMが読み込まれている場合
            initializeApp();
            initTouchHandlers();
        }

        // 日付切替を監視し、切替時にイベントを更新
        function startDailyRolloverWatcher() {
            let lastDay = new Date().toDateString();
            let lastActivityKey = getActivityDateKey();
            const checkRollover = () => {
                try {
                    const today = new Date().toDateString();
                    if (today !== lastDay) {
                        lastDay = today;
                        try { if (typeof checkDailyEvents === 'function') checkDailyEvents(); } catch (_) {}
                        try { if (typeof updateEventDisplay === 'function') updateEventDisplay(); } catch (_) {}
                    }
                    // 深夜2時基準の日付キーが変わったら、夜のチェックリスト等を更新
                    const currentActivityKey = getActivityDateKey();
                    if (currentActivityKey !== lastActivityKey) {
                        lastActivityKey = currentActivityKey;
                        try { if (typeof updateJournalStatus === 'function') updateJournalStatus(); } catch (_) {}
                    }
                } catch (_) { /* noop */ }
            };
            // 1分毎に確認
            setInterval(checkRollover, 60 * 1000);
            // 復帰・フォーカス時に即時確認
            window.addEventListener('visibilitychange', () => { if (!document.hidden) checkRollover(); });
            window.addEventListener('focus', checkRollover);
        }

        // ========== チェックリスト（朝/日中/夜） ==========
        function renderChecklistSection(category, listId) {
            const data = loadData();
            const ul = document.getElementById(listId);
            if (!ul) return;

            const items = (data.checklists && data.checklists[category]) ? data.checklists[category] : [];
            ul.innerHTML = '';

            items.forEach(item => {
                const li = document.createElement('li');
                li.style.cssText = 'display:flex; align-items:center; gap:8px; padding:8px; background: var(--surface-light); border:1px solid var(--border); border-radius:8px;';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = !!item.done;
                checkbox.onchange = () => window.toggleChecklistItem(category, item.id);

                const text = document.createElement('span');
                text.textContent = item.text || '';
                text.style.cssText = 'flex:1; user-select:none;';
                text.onclick = () => window.editChecklistItem(category, item.id);

                const editBtn = document.createElement('button');
                editBtn.textContent = '✏️';
                editBtn.title = '編集';
                editBtn.style.cssText = 'background: var(--surface); border:1px solid var(--border); color: var(--text-primary); padding:4px 8px; border-radius:6px; cursor:pointer;';
                editBtn.onclick = (e) => { e.stopPropagation(); window.editChecklistItem(category, item.id); };

                const delBtn = document.createElement('button');
                delBtn.textContent = '🗑';
                delBtn.title = '削除';
                delBtn.style.cssText = 'background: var(--surface); border:1px solid var(--border); color: var(--text-primary); padding:4px 8px; border-radius:6px; cursor:pointer;';
                delBtn.onclick = (e) => { e.stopPropagation(); window.deleteChecklistItem(category, item.id); };

                li.appendChild(checkbox);
                li.appendChild(text);
                li.appendChild(editBtn);
                li.appendChild(delBtn);
                ul.appendChild(li);
            });
        }

        function renderChecklists() {
            try { renderChecklistSection('morning', 'checklist-morning'); } catch(_) {}
            try { renderChecklistSection('day', 'checklist-day'); } catch(_) {}
            try { renderChecklistSection('night', 'checklist-night'); } catch(_) {}
        }

        function promptAddChecklistItem(category) {
            const text = prompt('項目名を入力してください');
            if (!text) return;
            const data = loadData();
            if (!data.checklists) data.checklists = { morning: [], day: [], night: [] };
            const id = `ci_${Date.now()}_${Math.floor(Math.random()*1000)}`;
            data.checklists[category].push({ id, text: text.trim(), done: false });
            saveData(data);
            renderChecklists();
        }

        function toggleChecklistItem(category, id) {
            const data = loadData();
            const list = (data.checklists && data.checklists[category]) ? data.checklists[category] : [];
            const idx = list.findIndex(i => i.id === id);
            if (idx === -1) return;
            list[idx].done = !list[idx].done;
            saveData(data);
            renderChecklists();
        }

        function editChecklistItem(category, id) {
            const data = loadData();
            const list = (data.checklists && data.checklists[category]) ? data.checklists[category] : [];
            const idx = list.findIndex(i => i.id === id);
            if (idx === -1) return;
            const current = list[idx].text || '';
            const next = prompt('項目名を編集', current);
            if (next == null) return;
            const trimmed = next.trim();
            if (!trimmed) return;
            list[idx].text = trimmed;
            saveData(data);
            renderChecklists();
        }

        function deleteChecklistItem(category, id) {
            if (!confirm('この項目を削除しますか？')) return;
            const data = loadData();
            const list = (data.checklists && data.checklists[category]) ? data.checklists[category] : [];
            const next = list.filter(i => i.id !== id);
            data.checklists[category] = next;
            saveData(data);
            renderChecklists();
        }

        // グローバル公開
        try {
            window.renderChecklists = renderChecklists;
            window.promptAddChecklistItem = promptAddChecklistItem;
            window.toggleChecklistItem = toggleChecklistItem;
            window.editChecklistItem = editChecklistItem;
            window.deleteChecklistItem = deleteChecklistItem;
        } catch(_) {}

        function initializeApp() {
            // テーマを初期化
            initializeTheme();

            // 削除カードのクリーンアップと期限切れ効果の削除
            try {
                const data = loadData();
                if (data && data.cards) {
                    let needsSave = false;
                    
                    // プロテクトシールドを削除
                    if (Array.isArray(data.cards.inventory)) {
                        const oldLength = data.cards.inventory.length;
                        data.cards.inventory = data.cards.inventory.filter(c => c.cardId !== 'protect_shield');
                        if (oldLength !== data.cards.inventory.length) needsSave = true;
                    }
                    if (Array.isArray(data.cards.pendingPenalties)) {
                        const oldLength = data.cards.pendingPenalties.length;
                        data.cards.pendingPenalties = data.cards.pendingPenalties.filter(c => c.cardId !== 'protect_shield');
                        if (oldLength !== data.cards.pendingPenalties.length) needsSave = true;
                    }
                    if (Array.isArray(data.cards.activeEffects)) {
                        const oldLength = data.cards.activeEffects.length;
                        const now = new Date();
                        data.cards.activeEffects = data.cards.activeEffects.filter(e => {
                            // プロテクトシールドを削除
                            if (e.cardId === 'protect_shield') return false;
                            // 期限切れ効果を削除
                            if (e.endDate) {
                                const endDate = new Date(e.endDate);
                                if (endDate < now) {
                                    console.log(`初期化時に期限切れ効果を削除: ${e.cardId}`);
                                    return false;
                                }
                            }
                            return true;
                        });
                        if (oldLength !== data.cards.activeEffects.length) needsSave = true;
                    }
                    
                    if (needsSave) {
                        saveData(data);
                        console.log('期限切れカード効果をクリーンアップしました');
                    }
                }
            } catch (_) { /* noop */ }
            
            // 古いイベント（朝活ボーナス・夜型ボーナス）のクリーンアップ
            try {
                const data = loadData();
                if (data && data.events && data.events.activeBoosts) {
                    const hasOldEvent = data.events.activeBoosts.some(b => 
                        b.name === '🌅 朝活ボーナス' || 
                        b.name === '🌙 夜型ボーナス' ||
                        (b.effect && (b.effect.type === 'morning_boost' || b.effect.type === 'night_boost')) ||
                        (b.eventId === 'weekend_special' && b.value !== 1.5)  // 1.5倍以外の古い週末スペシャル
                    );
                    
                    if (hasOldEvent) {
                        // 古いイベントがある場合は今日のイベントチェックをリセット
                        data.events.activeBoosts = [];
                        data.events.lastEventCheck = null;
                        saveData(data);
                        console.log('古いイベントをクリアしました');
                    }
                }
            } catch (_) { /* noop */ }
            
            // カテゴリドロップダウンを初期化
            updateCategoryDropdowns();
            
            // ホーム画面を表示（これが習慣リストも更新する）
            showHomeView();
            
            // ポイント表示を初期化
            updatePointDisplay();
            
            // 努力ボーナスエリアを初期化
            updateEffortBonusArea();
            
            // イベントチェック
            checkDailyEvents();
            // 日付切替の自動監視開始
            startDailyRolloverWatcher();
            
            // アクティブなカード効果を表示
            updateActiveEffectsDisplay();
            
            // 履歴初期化（ホームを現在の状態として記録）
            try {
                history.replaceState({ view: 'home' }, '');
            } catch (e) { 
                /* noop */
            }
            
            // デフォルトの期間を設定
            selectDuration('medium');
            
            // 開始日の初期設定
            setStartDate('today');
        }

        // 物理戻るボタン（popstate）でホームへ戻す
        window.addEventListener('popstate', (event) => {
            const state = event.state || {};
            if (state.view === 'home' || !state.view) {
                // 習慣の中身（progress）などから戻る → ホーム表示
                showHomeView();
            }
        });
        
        // 初期化関数内で呼び出されるように移動
        // スワイプ機能は削除

        // 体重グラフを更新する関数
        function updateWeightChart() {
            const data = loadData();
            const container = document.getElementById('weight-chart-content');
            const canvas = document.getElementById('weight-chart-canvas');
            const summary = document.getElementById('weight-stats-summary');
            
            if (!container || !canvas || !data.dailyJournal) return;
            
            const entries = data.dailyJournal.entries || {};
            const weightData = [];
            
            // 体重データを収集（日付順）
            Object.keys(entries).sort().forEach(date => {
                if (entries[date].morning && entries[date].morning.weight) {
                    weightData.push({
                        date: date,
                        weight: entries[date].morning.weight
                    });
                }
            });
            
            if (weightData.length === 0) {
                summary.innerHTML = `
                    <div style="grid-column: 1 / -1; text-align: center; color: var(--text-secondary); padding: 20px;">
                        まだ体重データがありません
                    </div>
                `;
                return;
            }
            
            // 最新30日分のデータに絞る
            const recentData = weightData.slice(-30);
            
            // 統計を計算
            const weights = recentData.map(d => d.weight);
            const currentWeight = weights[weights.length - 1];
            const startWeight = weights[0];
            const change = currentWeight - startWeight;
            const maxWeight = Math.max(...weights);
            const minWeight = Math.min(...weights);
            const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
            
            // グラフを描画
            const ctx = canvas.getContext('2d');
            const width = canvas.width;
            const height = canvas.height;
            
            // キャンバスをクリア
            ctx.clearRect(0, 0, width, height);
            
            // 背景
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-light').trim() || '#1a1f36';
            ctx.fillRect(0, 0, width, height);
            
            // パディング
            const padding = { top: 20, right: 20, bottom: 40, left: 50 };
            const graphWidth = width - padding.left - padding.right;
            const graphHeight = height - padding.top - padding.bottom;
            
            // スケール計算
            const yMin = minWeight - 1;
            const yMax = maxWeight + 1;
            const xStep = graphWidth / (recentData.length - 1 || 1);
            const yScale = graphHeight / (yMax - yMin);
            
            // グリッド線とY軸ラベル
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#94a3b8';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            
            for (let i = 0; i <= 5; i++) {
                const y = padding.top + (graphHeight * i / 5);
                const value = yMax - (yMax - yMin) * i / 5;
                
                // グリッド線
                ctx.beginPath();
                ctx.moveTo(padding.left, y);
                ctx.lineTo(width - padding.right, y);
                ctx.stroke();
                
                // Y軸ラベル
                ctx.fillText(value.toFixed(1) + 'kg', padding.left - 5, y + 3);
            }
            
            // X軸ラベル（日付）
            ctx.textAlign = 'center';
            const dateInterval = Math.ceil(recentData.length / 6);
            recentData.forEach((item, index) => {
                if (index % dateInterval === 0 || index === recentData.length - 1) {
                    const x = padding.left + index * xStep;
                    const [year, month, day] = item.date.split('-');
                    ctx.fillText(`${month}/${day}`, x, height - padding.bottom + 15);
                }
            });
            
            // 折れ線グラフを描画
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            recentData.forEach((item, index) => {
                const x = padding.left + index * xStep;
                const y = padding.top + (yMax - item.weight) * yScale;
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            
            // データポイント
            ctx.fillStyle = '#10b981';
            recentData.forEach((item, index) => {
                const x = padding.left + index * xStep;
                const y = padding.top + (yMax - item.weight) * yScale;
                
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            });
            
            // サマリー統計を表示
            summary.innerHTML = `
                <div style="text-align: center; background: var(--surface-light); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 18px; font-weight: bold; color: #10b981;">${currentWeight.toFixed(2)}</div>
                    <div style="font-size: 10px; color: var(--text-secondary);">現在</div>
                </div>
                <div style="text-align: center; background: var(--surface-light); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 18px; font-weight: bold; color: ${change >= 0 ? '#ef4444' : '#3b82f6'};">
                        ${change >= 0 ? '+' : ''}${change.toFixed(2)}
                    </div>
                    <div style="font-size: 10px; color: var(--text-secondary);">変化</div>
                </div>
                <div style="text-align: center; background: var(--surface-light); padding: 8px; border-radius: 6px;">
                    <div style="font-size: 18px; font-weight: bold; color: #f59e0b;">${avgWeight.toFixed(2)}</div>
                    <div style="font-size: 10px; color: var(--text-secondary);">平均</div>
                </div>
            `;
        }


        // ===== カード機能の完全無効化（安全なスタブ） =====
        try {
            window.CARDS_DISABLED = true;
            window.showCardsView = function(){ try { showHomeView(); } catch(_) {} };
            window.updateCardDisplay = function(){};
            window.updateCardUseButton = function(){};
            window.showCardUseMenu = function(){};
            window.closeCardUseMenu = function(){};
            window.showCardAcquisition = function(ids, cb){ try { if (typeof cb === 'function') cb(); } catch(_) {} };
            window.applyPenaltyCards = function(){};
            window.getRandomCardForLevelUp = function(){ return null; };
            window.addCardToInventory = function(){ return loadData(); };
            window.getCardsBasedOnAchievement = function(){ return []; };
        } catch(_) {}
        window.updateWeightChart = updateWeightChart;
        window.showHabitContextMenu = showHabitContextMenu;
        window.editHabit = editHabit;
        window.confirmDeleteHypothesis = confirmDeleteHypothesis;
        
        // windowオブジェクトに関数を登録
        // 初期化機能（開発用）は削除
        // 日替わりイベントを取得（毎日ランダムに変更）
        function getDailyEvent() {
            return null;
            /*
            const data = loadData();
            const today = dateKeyLocal(new Date());
            const todayStr = new Date().toISOString().split('T')[0];
            
            // 日付から日数を取得（例：2025-01-15 → 15）
            const dayOfMonth = new Date().getDate();
            
            // 7の倍数の日かチェック
            const isLuckySevenDay = (dayOfMonth % 7 === 0);
            
            // 強制イベントチェック（イベントトリガーカードの効果）
            if (data.events && data.events.forcedEvents && data.events.forcedEvents[todayStr]) {
                // 強制イベント日は必ずイベント発生
            } else if (isLuckySevenDay) {
                // 7の倍数の日は必ずイベント発生
            } else {
                // 通常は40%の確率でイベント発生（うち80%がポジティブ、20%がネガティブ）
                if (Math.random() > 0.4) return null;
            }
            
            // 土日は週末スペシャルを70%の確率で選択
            const dayOfWeek = new Date().getDay();
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            
            if (isWeekend) {
                // 週末は70%の確率で週末スペシャル（真のランダム）
                if (Math.random() < 0.7) {
                    // 週末スペシャルを返す
                    return EVENT_DEFINITIONS.find(e => e.id === 'weekend_special');
                }
            }
            
            // ポジティブ:ネガティブ = 4:1の割合でイベントを選択
            const positiveEvents = EVENT_DEFINITIONS.filter(e => 
                !['half_points', 'expensive_rewards', 'no_combo', 'slow_day', 'hard_mode', 'reverse_streak'].includes(e.id)
            );
            const negativeEvents = EVENT_DEFINITIONS.filter(e => 
                ['half_points', 'expensive_rewards', 'no_combo', 'slow_day', 'hard_mode', 'reverse_streak'].includes(e.id)
            );
            
            // 80%の確率でポジティブ、20%の確率でネガティブ
            if (Math.random() < 0.8) {
                // ポジティブイベントをランダムに選択
                const eventIndex = Math.floor(Math.random() * positiveEvents.length);
                return positiveEvents[eventIndex];
            } else {
                // ネガティブイベントをランダムに選択
                const eventIndex = Math.floor(Math.random() * negativeEvents.length);
                return negativeEvents[eventIndex];
            }
        */}
        
        // イベント表示の更新
        function updateEventDisplay() {
            const data = loadData();
            const eventContainer = document.getElementById('active-events');
            
            if (!eventContainer) return;
            // 機能停止中は常に非表示
            if (typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) {
                eventContainer.style.display = 'none';
                return;
            }
            
            if (!data.events || !data.events.activeBoosts || data.events.activeBoosts.length === 0) {
                eventContainer.style.display = 'none';
            } else {
                // 週末スペシャルのサニタイズと重複排除
                let boosts = Array.isArray(data.events.activeBoosts) ? data.events.activeBoosts.slice() : [];

                // 1) 値・説明の正規化（不要な強制変更を削除）
                // マイナス効果も含めて正しく表示されるようにする

                // 2) 無効なブーストを除外
                boosts = boosts.filter(b => {
                    if (!b) return false;
                    return true;
                });

                // 3) eventId ベースで重複排除（最後に現れたものを優先）
                const dedupMap = new Map();
                for (const b of boosts) {
                    const key = b && b.eventId ? `id:${b.eventId}` : `name:${b?.name || ''}|desc:${b?.description || ''}`;
                    dedupMap.set(key, b);
                }
                boosts = Array.from(dedupMap.values());

                // 永続化（今後の読み込みでも正しい状態を維持）
                data.events.activeBoosts = boosts;
                saveData(data);

                eventContainer.style.display = 'block';
                eventContainer.innerHTML = `
                    <h3 style="margin-bottom: 12px; font-size: 16px;">🎉 今日のイベント</h3>
                    ${boosts.map(boost => {
                        // マイナス効果かどうかを判定
                        const isNegative = boost.value < 1.0 || 
                                         boost.effect === 'combo_disable' || 
                                         boost.effect === 'point_reduction' ||
                                         boost.effect === 'intensity_restriction' ||
                                         boost.effect === 'streak_reverse' ||
                                         boost.effect === 'reward_multiplier';
                        
                        const bgColor = isNegative ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)';
                        const borderColor = isNegative ? 'rgba(239, 68, 68, 0.3)' : 'transparent';
                        const iconColor = isNegative ? '#ef4444' : '#f59e0b';
                        
                        return `
                        <div class="event-card" style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; margin: 8px 0;">
                            <div style="font-size: 16px; font-weight: bold;">${boost.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${boost.description}</div>
                            <div style="font-size: 10px; margin-top: 8px; color: ${iconColor};">
                                期間: 本日中
                            </div>
                        </div>
                        `;
                    }).join('')}
                `;
            }
        }
        
        // デイリーイベントをチェック
        // デイリーイベントをチェックする関数
        function checkDailyEvents() {
            if (EVENTS_DISABLED) {
                console.log('イベント機能が無効化されています');
                return;
            }
            
            const data = loadData();
            const today = dateKeyLocal(new Date());
            
            // 最後のチェック日時と比較
            if (data.events?.lastEventCheck === today) {
                console.log('本日のイベントはチェック済みです');
                return;
            }
            
            // イベントを取得して保存
            const event = getDailyEvent();
            if (event) {
                data.events = data.events || {};
                data.events.lastEventCheck = today;
                data.events.activeBoosts = [event];
                saveData(data);
                console.log('本日のイベント:', event.name);
            }
            
            // 表示を更新
            updateEventDisplay();
        }
        
        // イベント関連関数をwindowオブジェクトに登録
        window.checkDailyEvents = checkDailyEvents;
        window.getDailyEvent = getDailyEvent;
        window.updateEventDisplay = updateEventDisplay;
        
        
        // アクティブなカード効果を包括的に表示する関数
        function updateActiveEffectsDisplay() {
            const data = loadData();
            const now = new Date();
            const activeEffects = [];
            
            if (data.cards && data.cards.activeEffects) {
                data.cards.activeEffects.forEach(effect => {
                    // 有効期限チェック
                    if (effect.startDate && effect.endDate) {
                        const start = new Date(effect.startDate);
                        const end = new Date(effect.endDate);
                        if (now < start || now > end) return;
                    }
                    
                    // カード情報を取得
                    let cardInfo = null;
                    if (effect.cardId && CARD_MASTER[effect.cardId]) {
                        cardInfo = CARD_MASTER[effect.cardId];
                    }
                    
                    // 効果タイプごとの表示
                    let displayText = '';
                    let displayIcon = '';
                    let displayColor = '#6b7280';
                    
                    switch(effect.type) {
                        case 'point_multiplier':
                            displayText = `ポイント×${effect.multiplier || 1.5}`;
                            displayIcon = cardInfo ? cardInfo.icon : '💎';
                            displayColor = cardInfo ? cardInfo.color : '#06b6d4';
                            break;
                        case 'all_category_boost':
                            displayText = `全カテゴリ×${effect.multiplier || 1.2}`;
                            displayIcon = cardInfo ? cardInfo.icon : '🌈';
                            displayColor = cardInfo ? cardInfo.color : '#8b5cf6';
                            break;
                        case 'combo_multiplier':
                            displayText = `コンボ×${effect.value || 2.0}`;
                            displayIcon = cardInfo ? cardInfo.icon : '🧩';
                            displayColor = cardInfo ? cardInfo.color : '#22c55e';
                            break;
                        case 'category_theme_boost':
                            displayText = `${effect.target}×${effect.multiplier || 1.5}`;
                            displayIcon = cardInfo ? cardInfo.icon : '🎪';
                            displayColor = cardInfo ? cardInfo.color : '#8b5cf6';
                            break;
                        case 'challenge_multiplier':
                            displayText = `チャレンジ×${effect.value || 2.0}`;
                            displayIcon = cardInfo ? cardInfo.icon : '🎯';
                            displayColor = cardInfo ? cardInfo.color : '#22c55e';
                            break;
                        case 'journal_multiplier':
                            displayText = `ジャーナル×${effect.value || 2.0}`;
                            displayIcon = cardInfo ? cardInfo.icon : '📝';
                            displayColor = cardInfo ? cardInfo.color : '#94a3b8';
                            break;
                        case 'power_boost':
                            displayText = '習慣達成+5pt';
                            displayIcon = cardInfo ? cardInfo.icon : '⚡';
                            displayColor = cardInfo ? cardInfo.color : '#f59e0b';
                            break;
                        case 'next_habit_bonus':
                            if (!effect.used) {
                                displayText = `次の習慣+${effect.value || 10}pt`;
                                displayIcon = cardInfo ? cardInfo.icon : '💤';
                                displayColor = cardInfo ? cardInfo.color : '#7c3aed';
                            }
                            break;
                        case 'streak_spark':
                            if (new Date(effect.startDate) <= now && new Date(effect.endDate) >= now) {
                                const add = (typeof effect.perHabit === 'number' ? effect.perHabit : 1);
                                displayText = `スパークル +${add}`;
                                displayIcon = cardInfo ? cardInfo.icon : '🎆';
                                displayColor = cardInfo ? cardInfo.color : '#f97316';
                            }
                            break;
                        case 'mystery_reward':
                            if (!effect.claimed) {
                                displayText = 'ミステリー待機中';
                                displayIcon = cardInfo ? cardInfo.icon : '🎁';
                                displayColor = cardInfo ? cardInfo.color : '#f59e0b';
                            }
                            break;
                        case 'achievement_booster':
                            displayText = '達成ブースター+15%';
                            displayIcon = cardInfo ? cardInfo.icon : '🚀';
                            displayColor = cardInfo ? cardInfo.color : '#10b981';
                            break;
                        case 'event_seal':
                            displayText = 'イベント封印中';
                            displayIcon = cardInfo ? cardInfo.icon : '🌑';
                            displayColor = cardInfo ? cardInfo.color : '#64748b';
                            break;
                        case 'slowdown':
                            displayText = 'スローダウン×0.5';
                            displayIcon = cardInfo ? cardInfo.icon : '🕸️';
                            displayColor = cardInfo ? cardInfo.color : '#7c2d12';
                            break;
                        case 'lucky_seven':
                            displayText = 'ラッキーセブン';
                            displayIcon = cardInfo ? cardInfo.icon : '7️⃣';
                            displayColor = cardInfo ? cardInfo.color : '#f59e0b';
                            break;
                    }
                    
                    if (displayText) {
                        // 残り時間を計算
                        let remainingTime = '';
                        if (effect.endDate) {
                            const end = new Date(effect.endDate);
                            const diff = end - now;
                            if (diff > 0) {
                                const hours = Math.floor(diff / (1000 * 60 * 60));
                                const days = Math.floor(hours / 24);
                                if (days > 0) {
                                    remainingTime = ` (残${days}日)`;
                                } else if (hours > 0) {
                                    remainingTime = ` (残${hours}時間)`;
                                } else {
                                    const minutes = Math.floor(diff / (1000 * 60));
                                    remainingTime = ` (残${minutes}分)`;
                                }
                            }
                        }
                        
                        activeEffects.push({
                            icon: displayIcon,
                            text: displayText + remainingTime,
                            color: displayColor,
                            cardName: cardInfo ? cardInfo.name : ''
                        });
                    }
                });
            }
            
            // 表示を更新
            const container = document.getElementById('active-effects-display');
            const list = document.getElementById('active-effects-list');
            
            if (container && list) {
                list.innerHTML = '';
                
                if (activeEffects.length > 0) {
                    activeEffects.forEach(effect => {
                        const badge = document.createElement('div');
                        badge.style.cssText = `
                            background: ${effect.color}20;
                            color: ${effect.color};
                            padding: 4px 12px;
                            border-radius: 16px;
                            font-size: 12px;
                            border: 1px solid ${effect.color};
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                        `;
                        badge.innerHTML = `<span>${effect.icon}</span><span>${effect.text}</span>`;
                        if (effect.cardName) {
                            badge.title = effect.cardName;
                        }
                        list.appendChild(badge);
                    });
                    container.style.display = 'block';
                } else {
                    container.style.display = 'none';
                }
            }
            
            // グローバルなアクティブ効果表示は無効化
            // updateGlobalActiveEffectsDisplay(activeEffects);
        }
        
        // 画面上部に常時表示するアクティブ効果
        function updateGlobalActiveEffectsDisplay(activeEffects) {
            let globalContainer = document.getElementById('global-active-effects');
            
            if (!globalContainer && activeEffects.length > 0) {
                // コンテナがなければ作成
                globalContainer = document.createElement('div');
                globalContainer.id = 'global-active-effects';
                globalContainer.style.cssText = `
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--surface);
                    padding: 8px 12px;
                    border-radius: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    z-index: 100;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    max-width: 90%;
                    justify-content: center;
                `;
                document.body.appendChild(globalContainer);
            }
            
            if (globalContainer) {
                if (activeEffects.length > 0) {
                    globalContainer.innerHTML = '';
                    activeEffects.forEach(effect => {
                        const badge = document.createElement('div');
                        badge.style.cssText = `
                            background: ${effect.color}15;
                            color: ${effect.color};
                            padding: 2px 8px;
                            border-radius: 12px;
                            font-size: 11px;
                            border: 1px solid ${effect.color}40;
                            display: inline-flex;
                            align-items: center;
                            gap: 3px;
                        `;
                        badge.innerHTML = `<span style="font-size: 13px;">${effect.icon}</span><span>${effect.text}</span>`;
                        if (effect.cardName) {
                            badge.title = effect.cardName;
                        }
                        globalContainer.appendChild(badge);
                    });
                    globalContainer.style.display = 'flex';
                } else {
                    globalContainer.style.display = 'none';
                }
            }
        }

        // カテゴリ関連関数をwindowオブジェクトに登録
        window.initializeCategoryMaster = initializeCategoryMaster;
        window.updateCategoryDropdowns = updateCategoryDropdowns;
        window.editCategoryMaster = editCategoryMaster;
        window.addNewCategory = addNewCategory;
        window.updateActiveEffectsDisplay = updateActiveEffectsDisplay;
        
        // 累計ポイントを再計算する関数
        function recalculateLifetimePoints() {
            const data = loadData();
            let totalEarned = 0;
            
            // トランザクション履歴から集計
            if (data.pointSystem && data.pointSystem.transactions) {
                data.pointSystem.transactions.forEach(transaction => {
                    if (transaction.type === 'earn') {
                        totalEarned += (transaction.finalAmount || transaction.amount || 0);
                    }
                });
            }
            
            // 累計ポイントを更新
            data.pointSystem.lifetimeEarned = totalEarned;
            data.pointSystem.levelProgress = totalEarned;
            
            // レベルを再計算
            const newLevel = calculateLevel(totalEarned);
            data.pointSystem.currentLevel = newLevel.level;
            
            saveData(data);
            
            // 表示を更新
            updatePointDisplay();
            if (typeof updateStatistics === 'function') {
                updateStatistics();
            }
            
            showNotification(`累計ポイントを再計算しました: ${totalEarned}pt`, 'success');
            return totalEarned;
        }
        
        // グローバルに公開
        window.recalculateLifetimePoints = recalculateLifetimePoints;

        // モバイルのズーム抑止（ダブルタップ/ピンチ）
        (function preventZoom() {
            let lastTouchEnd = 0;
            document.addEventListener('touchend', function (e) {
                const now = Date.now();
                if (now - lastTouchEnd <= 300) {
                    e.preventDefault();
                }
                lastTouchEnd = now;
            }, { passive: false });
            document.addEventListener('gesturestart', function (e) {
                e.preventDefault();
            }, { passive: false });
        })();
