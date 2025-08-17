// Extracted event-related functions from hypolab-local.js
// Note: Depends on helper functions like loadData/saveData/showNotification already present.
// HABIT_EVENTS remains defined in hypolab-local.js.

// イベントチェック（毎日実行）
function checkDailyEvents() {
    const data = loadData();
    const now = new Date();
    // 機能停止中はイベント生成・通知を無効化
    if (typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) {
        if (!data.events) data.events = {};
        data.events.activeBoosts = [];
        data.events.lastEventCheck = new Date().toDateString();
        saveData(data);
        try { updateEventDisplay(); } catch (_) {}
        return;
    }
    // モバイル環境でも確実に動くよう堅牢化
    if (!data.events) {
        data.events = {
            activeBoosts: [],
            lastEventCheck: null,
            milestoneNotifications: {},
            eventHistory: [],
            boostEnabled: true,
            forcedEvents: {}
        };
    } else {
        if (!Array.isArray(data.events.activeBoosts)) data.events.activeBoosts = [];
        if (!data.events.milestoneNotifications) data.events.milestoneNotifications = {};
        if (!data.events.eventHistory) data.events.eventHistory = [];
        if (typeof data.events.boostEnabled !== 'boolean') data.events.boostEnabled = true;
        if (!data.events.forcedEvents) data.events.forcedEvents = {};
    }
    const today = new Date().toDateString();
    const todayStr = new Date().toISOString().split('T')[0];
    
    // 最後のチェック日と同じなら何もしない
    // ただし、activeBoostsが空または古い形式（morning_boost/night_boost）を含む場合は再チェック
    const hasOldBoost = data.events.activeBoosts.some(b => 
        b.eventId === 'morning_boost' || b.eventId === 'night_boost' ||
        b.name === '🌅 朝活ボーナス' || b.name === '🌙 夜型ボーナス' ||
        (b.effect && (b.effect.type === 'morning_boost' || b.effect.type === 'night_boost'))
    );
    
    // 古いイベントがある場合は強制的にクリア
    // または週末スペシャルの倍率が1.5以外の場合もクリア
    const hasOldWeekendValue = data.events.activeBoosts.some(b => 
        b.eventId === 'weekend_special' && b.value !== 1.5
    );
    
    // 週末スペシャルの値が間違っている場合、または古い表記がある場合はクリア
    const hasWrongDescription = data.events.activeBoosts.some(b =>
        b.eventId === 'weekend_special' && 
        (b.description.includes('1.2') || b.description.includes('2'))
    );
    
    if (hasOldBoost || hasOldWeekendValue || hasWrongDescription) {
        data.events.activeBoosts = [];
        data.events.lastEventCheck = null; // リセット
    }
    
    // 日付が変わったら必ず新しいイベントを生成
    // 強制的に今日の日付と比較してリセット
    const needsReset = !data.events.lastEventCheck || data.events.lastEventCheck !== today;
    
    if (!needsReset) return;
    
    // イベントを完全にリセット
    data.events.lastEventCheck = today;
    data.events.activeBoosts = [];
    
    // 今日のイベントを取得
    const todayEvent = getDailyEvent();
    
    if (todayEvent) {
        // 週末スペシャルの場合は値を1.5倍に強制修正
        let eventValue = todayEvent.value;
        let eventDescription = todayEvent.description;
        if (todayEvent.id === 'weekend_special') {
            eventValue = 1.5;
            eventDescription = '週末はポイント1.5倍！';
        }
        
        // イベントを記録
        data.events.activeBoosts.push({
            type: 'daily_event',
            eventId: todayEvent.id,
            name: todayEvent.name,
            description: eventDescription,
            effect: todayEvent.effect,
            value: eventValue,
            date: todayStr
        });
        
        // イベント履歴に追加
        data.events.eventHistory.push({
            date: todayStr,
            eventId: todayEvent.id,
            name: todayEvent.name
        });
        
        // 履歴は最新100件まで保持
        if (data.events.eventHistory.length > 100) {
            data.events.eventHistory = data.events.eventHistory.slice(-100);
        }
    }
    
    // イベント封印チェック
    if (data.cards && data.cards.activeEffects) {
        const sealEffect = data.cards.activeEffects.find(effect => 
            effect.type === 'event_seal' && 
            new Date(effect.startDate) <= new Date() && 
            new Date(effect.endDate) >= new Date()
        );
        if (sealEffect) {
            saveData(data);
            updateEventDisplay();
            return; // イベント封印中は何もしない
        }
    }
    
    // ブーストが有効ならチェック
    if (data.events.boostEnabled) {
        let eventCount = 0;
        
        // 強制イベントチェック
        if (data.events.forcedEvents && data.events.forcedEvents[todayStr]) {
            eventCount = 1;  // 強制イベント発生
            delete data.events.forcedEvents[todayStr];  // 使用済みにする
        } else {
            // ラッキーセブンが有効なら発生率を2倍相当へ（0:25% / 1:65% / 2:10%）
            let hasLuckySeven = false;
            try {
                hasLuckySeven = !!(data.cards && Array.isArray(data.cards.activeEffects) &&
                    data.cards.activeEffects.some(e => e && e.cardId === 'lucky_seven' && e.startDate && e.endDate &&
                        new Date(e.startDate) <= now && new Date(e.endDate) >= now));
            } catch(_) {}

            const eventRoll = Math.random();
            if (hasLuckySeven) {
                if (eventRoll < 0.25) {
                    eventCount = 0;  // 25%
                } else if (eventRoll < 0.90) {
                    eventCount = 1;  // 65%
                } else {
                    eventCount = 2;  // 10%
                }
            } else {
                // 通常（0個:50%, 1個:45%, 2個:5%）
                if (eventRoll < 0.5) {
                    eventCount = 0;
                } else if (eventRoll < 0.95) {
                    eventCount = 1;
                } else {
                    eventCount = 2;
                }
            }
        }
        
        if (eventCount > 0) {
            // 利用可能なブーストをシャッフル
            const availableBoosts = [...HABIT_EVENTS.boosts];
            const shuffled = availableBoosts.sort(() => Math.random() - 0.5);
            
            // 指定された個数だけイベントを選択
            let selectedCount = 0;
            for (const boost of shuffled) {
                if (selectedCount >= eventCount) break;
                
                // 条件をチェック（条件関数がある場合は実行）
                let shouldActivate = false;
                if (typeof boost.condition === 'function') {
                    // 条件関数の結果をそのまま使用（既に確率が含まれている）
                    shouldActivate = boost.condition(data);
                } else {
                    // 条件関数がない場合はレアリティに基づく確率
                    const rarityChance = {
                        common: 0.5,  // 時間帯イベントが出やすいように
                        uncommon: 0.3,
                        rare: 0.2,
                        legendary: 0.1
                    };
                    shouldActivate = Math.random() < (rarityChance[boost.rarity] || 0.3);
                }
                
                if (shouldActivate) {
                    data.events.activeBoosts.push({
                        ...boost,
                        activatedAt: new Date().toISOString()
                    });
                    selectedCount++;
                }
            }
            
            // アクティブなブーストがあれば通知
            if (data.events.activeBoosts.length > 0) {
                data.events.activeBoosts.forEach(boost => {
                    showEventNotification(boost);
                });
            }
        }
    }
    
    saveData(data);
    // 表示を更新（イベントが無くてもコンテナは必ず表示）
    try { updateEventDisplay(); } catch (_) { /* noop */ }
}

// マイルストーンチェック
function checkMilestoneEvent(hypothesis, achievedDays) {
    const data = loadData();
    const milestones = HABIT_EVENTS.milestones;
    
    Object.keys(milestones).forEach(days => {
        const daysNum = parseInt(days);
        if (achievedDays >= daysNum && !data.events.milestoneNotifications[`${hypothesis.id}_${days}`]) {
            const milestone = milestones[days];
            
            // マイルストーン報酬を付与
            if (milestone.rewards.includes('bonus_points')) {
                earnPoints(daysNum * 5, 'milestone', `${hypothesis.title} ${days}日達成記念！`);
                // マイルストーン通知（優先度6）
                showNotification(
                    `🏆 マイルストーン達成！\n${hypothesis.title}\n${days}日継続！\n+${daysNum * 5}pt`,
                    'success',
                    6
                );
            }
            if (milestone.rewards.includes('huge_bonus')) {
                earnPoints(50, 'milestone', `${hypothesis.title} 21日達成おめでとう！`);
                // 21日達成は特別（優先度7）
                showNotification(
                    `🎊 祝！21日達成！\n${hypothesis.title}\n習慣化成功！\n+50pt`,
                    'success',
                    7
                );
            }
            
            // 通知済みとして記録
            data.events.milestoneNotifications[`${hypothesis.id}_${days}`] = new Date().toISOString();
            saveData(data);
        }
    });
}

// イベント通知表示
function showEventNotification(boost) {
    const rarityColors = {
        common: '#64748b',
        uncommon: '#10b981',
        rare: '#3b82f6',
        legendary: '#fbbf24'
    };
    
    const notification = document.createElement('div');
    notification.className = 'event-notification';
    notification.innerHTML = `
        <div style="background: linear-gradient(135deg, ${rarityColors[boost.rarity]}33, ${rarityColors[boost.rarity]}11); 
                    border: 1px solid ${rarityColors[boost.rarity]}; 
                    border-radius: 12px; padding: 16px; margin: 8px;">
            <div style="font-size: 20px; margin-bottom: 8px;">${boost.name}</div>
            <div style="font-size: 14px; color: var(--text-secondary);">${boost.description}</div>
            <div style="font-size: 12px; margin-top: 8px; color: ${rarityColors[boost.rarity]};">
                ${boost.rarity.toUpperCase()} イベント
            </div>
        </div>
    `;
    
    // 通知を画面に表示
    const container = document.getElementById('notifications-container') || document.body;
    container.appendChild(notification);
    
    // アニメーション
    setTimeout(() => {
        notification.style.animation = 'slideInFromTop 0.5s ease-out';
    }, 100);
    
    // 5秒後に自動削除
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease-out';
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

// マイルストーン通知表示
function showMilestoneNotification(milestone, habitTitle) {
    const notification = document.createElement('div');
    notification.className = 'milestone-notification';
    notification.innerHTML = `
        <div style="background: linear-gradient(135deg, #fbbf24, #f59e0b); 
                    color: white; border-radius: 12px; padding: 20px; margin: 8px; text-align: center;">
            <div style="font-size: 24px; margin-bottom: 8px;">${milestone.title}</div>
            <div style="font-size: 16px; margin-bottom: 8px;">「${habitTitle}」</div>
            <div style="font-size: 14px;">${milestone.message}</div>
        </div>
    `;
    
    const container = document.getElementById('notifications-container') || document.body;
    container.appendChild(notification);
    
    // 特別なアニメーション
    notification.style.animation = 'bounceIn 1s ease-out';
    
    // 10秒後に自動削除
    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.5s ease-out';
        setTimeout(() => notification.remove(), 500);
    }, 10000);
}

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

        // 1) 値・説明の正規化（週末スペシャル）
        boosts = boosts.map(b => {
            if (b && b.eventId === 'weekend_special') {
                b.value = 1.5;
                b.description = '週末はポイント1.5倍！';
            }
            return b;
        });

        // 2) 明らかに古い表記（1.2など）を含む週末スペシャルを除外
        boosts = boosts.filter(b => {
            if (!b) return false;
            if (b.eventId === 'weekend_special') {
                const desc = String(b.description || '');
                if (desc.includes('1.2') || desc.includes('×1.2')) return false;
            }
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
            ${boosts.map(boost => `
                <div class="event-card" style="background: rgba(251, 191, 36, 0.15); border-radius: 8px; padding: 12px; margin: 8px 0;">
                    <div style="font-size: 16px; font-weight: bold;">${boost.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">${boost.description}</div>
                    <div style="font-size: 10px; margin-top: 8px; color: #f59e0b;">
                        期間: 本日中
                    </div>
                </div>
            `).join('')}
        `;
    }
}

// Expose to global
window.checkDailyEvents = checkDailyEvents;
window.checkMilestoneEvent = checkMilestoneEvent;
window.showEventNotification = showEventNotification;
window.showMilestoneNotification = showMilestoneNotification;
window.updateEventDisplay = updateEventDisplay;
