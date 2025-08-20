// Points system extracted from hypolab-local.js (behavior unchanged)
// Exposes functions on window for backward compatibility.

const LEVEL_THRESHOLDS = [
    { level: 1, name: '初心者', min: 0, max: 150 },
    { level: 2, name: '見習い', min: 151, max: 450 },
    { level: 3, name: '習慣家', min: 451, max: 900 },
    { level: 4, name: '実践者', min: 901, max: 1500 },
    { level: 5, name: '達人', min: 1501, max: 2250 },
    { level: 6, name: 'マスター', min: 2251, max: 3300 },
    { level: 7, name: 'グランドマスター', min: 3301, max: 4500 },
    { level: 8, name: 'レジェンド', min: 4501, max: 6000 },
    { level: 9, name: '神', min: 6001, max: 7800 },
    { level: 10, name: '超越者', min: 7801, max: Infinity }
];

function calculateLevel(lifetimeEarned) {
    for (const threshold of LEVEL_THRESHOLDS) {
        if (lifetimeEarned <= threshold.max) {
            return threshold;
        }
    }
    const extraPoints = lifetimeEarned - 7801;
    const extraLevels = Math.floor(extraPoints / 1400);
    return {
        level: 10 + extraLevels,
        name: '超越者',
        min: 7801 + (extraLevels * 1400),
        max: 7801 + ((extraLevels + 1) * 1400)
    };
}

function calculatePointsWithBoosts(basePoints, source, category = null, habitId = null) {
    const data = loadData();
    let finalPoints = basePoints;
    let multiplier = 1.0;
    let bonus = 0;

    const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
    if (isChallenge) {
        // Apply challenge_multiplier to challenge sources only
        if (data.cards && data.cards.activeEffects) {
            const now = new Date();
            const challengeBoost = data.cards.activeEffects.find(effect => 
                effect.type === 'challenge_multiplier' && 
                new Date(effect.startDate) <= now && 
                new Date(effect.endDate) >= now
            );
            if (challengeBoost) {
                return Math.round(basePoints * challengeBoost.value);
            }
        }
        return basePoints;
    }
    if (data.cards && data.cards.activeEffects) {
        const now = new Date();
        const pointGem = data.cards.activeEffects.find(effect => 
            effect.type === 'point_multiplier' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (pointGem) { multiplier *= pointGem.multiplier; }

        const rainbowBoost = data.cards.activeEffects.find(effect => 
            effect.type === 'all_category_boost' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (rainbowBoost && category) { multiplier *= rainbowBoost.multiplier; }

        const slowdown = data.cards.activeEffects.find(effect => 
            effect.type === 'slowdown' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (slowdown) { multiplier *= 0.5; }

        const reverseCurse = data.cards.activeEffects.find(effect => 
            effect.type === 'reverse_curse' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (reverseCurse && source === 'habit') { return 0; }
        
        // パワーブースト: 習慣達成時のみ+5pt
        const powerBoost = data.cards.activeEffects.find(effect => 
            effect.type === 'power_boost' && 
            new Date(effect.startDate) <= now && 
            new Date(effect.endDate) >= now
        );
        if (powerBoost && source === 'habit') { bonus += 5; }
        
        // パワーナップ: 次の習慣達成で+10pt（1回だけ）
        const powerNap = data.cards.activeEffects.find(effect => 
            effect.type === 'next_habit_bonus' && 
            effect.cardId === 'power_nap' && 
            !effect.used
        );
        if (powerNap && source === 'habit') { 
            bonus += powerNap.value;
            powerNap.used = true;
            // 使用済みのパワーナップを削除
            data.cards.activeEffects = data.cards.activeEffects.filter(e => 
                !(e.type === 'next_habit_bonus' && e.cardId === 'power_nap' && e.used)
            );
            saveData(data);
        }
    }

    console.log('[DEBUG-MODULE] EVENTS_DISABLED:', typeof EVENTS_DISABLED !== 'undefined' ? EVENTS_DISABLED : 'undefined');
    console.log('[DEBUG-MODULE] data.events:', data.events);
    console.log('[DEBUG-MODULE] data.events?.activeBoosts:', data.events?.activeBoosts);
    
    if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
        const currentHour = new Date().getHours();
        console.log('[DEBUG-MODULE] activeBoosts:', data.events.activeBoosts);
        console.log('[DEBUG-MODULE] activeBoosts length:', data.events.activeBoosts.length);
        
        data.events.activeBoosts.forEach(boost => {
            console.log('[DEBUG] boost object:', boost);
            console.log('[DEBUG] boost.effect:', boost.effect);
            console.log('[DEBUG] checking boost.effect === "points_multiplier":', boost.effect === 'points_multiplier');
            
            if (boost.effect === 'points_multiplier') {
                console.log(`[DEBUG] ポイント倍率イベント適用: ${boost.name}, 倍率: ${boost.value}, 適用前: ${multiplier}, 適用後: ${multiplier * boost.value}`);
                multiplier *= boost.value;
            } else if (boost.effect === 'achievement_bonus' && source === 'habit') {
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
            } else if (boost.effect === 'random_points' && source === 'habit') {
                const dice = Math.floor(Math.random() * (boost.max - boost.min + 1)) + boost.min;
                bonus += dice;
            } else if (boost.effect === 'coin_flip' && source === 'habit') {
                const win = Math.random() < 0.5;
                multiplier *= win ? boost.win : boost.lose;
            } else if (boost.effect === 'chain' && source === 'habit') {
                if (!data.events.chainCount) data.events.chainCount = 0;
                if (data.events.chainCount < boost.maxBonus) {
                    data.events.chainCount++;
                    bonus += data.events.chainCount;
                    saveData(data);
                } else {
                    bonus += boost.maxBonus;
                }
            } else if (boost.effect === 'momentum' && source === 'habit') {
                if (!data.events.momentumIndex) data.events.momentumIndex = 0;
                const index = Math.min(data.events.momentumIndex, boost.multipliers.length - 1);
                multiplier *= boost.multipliers[index];
                data.events.momentumIndex++;
                saveData(data);
            } else if (boost.effect === 'perfect_bonus' && source === 'habit') {
                // パーフェクトチャレンジ: 全習慣達成で+10pt
                const today = dateKeyLocal(new Date());
                const todayAchievements = data.habits.filter(h => h.achievedDates && h.achievedDates.includes(today));
                if (todayAchievements.length === data.habits.length && data.habits.length > 0) {
                    bonus += boost.value || 10;
                }
            } else if (boost.effect === 'streak_bonus' && source === 'habit') {
                // ストリークパーティ: 連続3日以上の習慣に+3pt
                // habitIdはearnPointsから渡される（引数を追加する必要があります）
                if (habitId) {
                    const habit = data.habits.find(h => h.id === habitId);
                    if (habit && habit.currentStreak >= (boost.minDays || 3)) {
                        bonus += boost.bonus || 3;
                    }
                }
            }

            const effect = boost.effect;
            if (typeof effect === 'object') {
                switch (effect.type) {
                    case 'global_multiplier':
                        multiplier *= effect.value;
                        break;
                    case 'category_multiplier':
                        if (category === effect.target) { multiplier *= effect.value; }
                        break;
                    case 'challenge_multiplier':
                        if (source === 'challenge') { multiplier *= effect.value; }
                        break;
                    case 'journal_multiplier':
                        if (source === 'journal') { multiplier *= effect.value; }
                        break;
                }
            }
        });
    }
    finalPoints = Math.round(basePoints * multiplier + bonus);
    return finalPoints;
}

function calculatePointsWithBoostsDetailed(basePoints, source, category = null, habitId = null) {
    const data = loadData();
    let multiplier = 1.0;
    let bonus = 0;
    const notes = [];
    const now = new Date();

    const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
    if (isChallenge) {
        // Apply challenge_multiplier to challenge sources only
        if (data.cards && data.cards.activeEffects) {
            const challengeBoost = data.cards.activeEffects.find(e => e.type === 'challenge_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
            if (challengeBoost) {
                multiplier = challengeBoost.value;
                notes.push(`Challenge ×${challengeBoost.value}`);
                const finalPoints = Math.round(basePoints * multiplier);
                return { finalPoints, multiplierTotal: multiplier, bonusTotal: 0, notes };
            }
        }
        return { finalPoints: basePoints, multiplierTotal: 1.0, bonusTotal: 0, notes };
    }
    if (data.cards && data.cards.activeEffects) {
        const pointGem = data.cards.activeEffects.find(e => e.type === 'point_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (pointGem) { multiplier *= pointGem.multiplier; notes.push(`PointGem ×${pointGem.multiplier}`); }
        const rainbow = data.cards.activeEffects.find(e => e.type === 'all_category_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (rainbow && category) { multiplier *= rainbow.multiplier; notes.push(`RainbowBoost ×${rainbow.multiplier}`); }
        const comboChain = data.cards.activeEffects.find(e => e.type === 'combo_multiplier' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (comboChain && source === 'combo') { multiplier *= (comboChain.value || 2.0); notes.push(`Combo ×${comboChain.value || 2.0}`); }
        const catFest = data.cards.activeEffects.find(e => e.type === 'category_theme_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (catFest && category && catFest.target === category) { multiplier *= (catFest.multiplier || 1.5); notes.push(`Festival(${category}) ×${catFest.multiplier || 1.5}`); }
        // ハッピーアワーは point_multiplier として処理されるので、ここでは削除
        // const hh = data.cards.activeEffects.find(e => e.type === 'time_window_bonus' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        // if (hh) { bonus += (hh.value || 10); notes.push(`HappyHour +${hh.value || 10}`); }
        const todayKey = dateKeyLocal(new Date());
        const spark = data.cards.activeEffects.find(e => e.type === 'streak_spark' && e.dayKey === todayKey && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (spark && source === 'habit') {
            const add = (typeof spark.perHabit === 'number' ? spark.perHabit : 1);
            bonus += add; notes.push(`Sparkle +${add}`);
        }
        const slow = data.cards.activeEffects.find(e => e.type === 'slowdown' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (slow) { multiplier *= 0.5; notes.push('Slowdown ×0.5'); }
        const reverse = data.cards.activeEffects.find(e => e.type === 'reverse_curse' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (reverse && source === 'habit') { return { finalPoints: 0, multiplierTotal: 0, bonusTotal: 0, notes: ['ReverseCurse'] }; }
        // パワーブースト: 習慣達成時のみ+5pt
        const powerBoost = data.cards.activeEffects.find(e => e.type === 'power_boost' && new Date(e.startDate) <= now && new Date(e.endDate) >= now);
        if (powerBoost && source === 'habit') { bonus += 5; notes.push('PowerBoost +5'); }
        // パワーナップ: 次の習慣達成で+10pt（1回だけ）
        const powerNap = data.cards.activeEffects.find(e => e.type === 'next_habit_bonus' && e.cardId === 'power_nap' && !e.used);
        if (powerNap && source === 'habit') { 
            bonus += powerNap.value; 
            notes.push('PowerNap +10'); 
            powerNap.used = true;
            // 使用済みのパワーナップを削除
            data.cards.activeEffects = data.cards.activeEffects.filter(e => !(e.type === 'next_habit_bonus' && e.cardId === 'power_nap' && e.used));
            saveData(data);
        }
    }

    if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
        data.events.activeBoosts.forEach(boost => {
            const eff = boost.effect;
            switch (eff.type) {
                case 'global_multiplier': multiplier *= eff.value; notes.push(`Global ×${eff.value}`); break;
                case 'category_multiplier': if (category === eff.target) { multiplier *= eff.value; notes.push(`${eff.target} ×${eff.value}`); } break;
                case 'category_bonus': if (category === eff.target) { bonus += eff.value; notes.push(`${eff.target} +${eff.value}`); } break;
                case 'challenge_multiplier': if (source === 'challenge') { multiplier *= eff.value; notes.push(`Challenge ×${eff.value}`); } break;
                case 'journal_multiplier': if (source === 'journal') { multiplier *= eff.value; notes.push(`Journal ×${eff.value}`); } break;
                case 'time_bonus':
                    const hour = new Date().getHours();
                    if ((boost.duration === 'morning' && hour >= 6 && hour <= 9) || (boost.duration === 'night' && hour >= 20 && hour <= 23)) {
                        bonus += eff.value; notes.push(`Time +${eff.value}`);
                    }
                    break;
            }
            
            // 文字列形式のeffectも処理
            if (boost.effect === 'perfect_bonus' && source === 'habit') {
                // パーフェクトチャレンジ: 全習慣達成で+10pt
                const today = dateKeyLocal(new Date());
                const todayAchievements = data.habits.filter(h => h.achievedDates && h.achievedDates.includes(today));
                if (todayAchievements.length === data.habits.length && data.habits.length > 0) {
                    bonus += boost.value || 10;
                    notes.push(`Perfect +${boost.value || 10}`);
                }
            } else if (boost.effect === 'streak_bonus' && source === 'habit') {
                // ストリークパーティ: 連続3日以上の習慣に+3pt
                if (habitId) {
                    const habit = data.habits.find(h => h.id === habitId);
                    if (habit && habit.currentStreak >= (boost.minDays || 3)) {
                        bonus += boost.bonus || 3;
                        notes.push(`Streak +${boost.bonus || 3}`);
                    }
                }
            }
        });
    }

    const finalPoints = Math.round(basePoints * multiplier + bonus);
    
    // デバッグ: ポイント半減デーの確認
    if (data.events && data.events.activeBoosts) {
        const halfPointsEvent = data.events.activeBoosts.find(b => b.id === 'half_points');
        if (halfPointsEvent) {
            console.log(`[DEBUG] ポイント半減デー適用結果: basePoints=${basePoints}, multiplier=${multiplier}, bonus=${bonus}, finalPoints=${finalPoints}`);
        }
    }
    
    return { finalPoints, multiplierTotal: multiplier, bonusTotal: bonus, notes };
}

function earnPoints(amount, source, description, multiplier = 1.0, category = null, habitId = null, meta = {}) {
    const data = loadData();
    const boost = calculatePointsWithBoostsDetailed(amount, source, category, habitId);
    const finalAmount = Math.round((boost.finalPoints) * multiplier);

    const beforePoints = data.pointSystem.currentPoints;
    data.pointSystem.currentPoints += finalAmount;
    data.pointSystem.lifetimeEarned += finalAmount;
    data.pointSystem.levelProgress = data.pointSystem.lifetimeEarned;

    const newLevel = calculateLevel(data.pointSystem.lifetimeEarned);
    const oldLevel = data.pointSystem.currentLevel;
    data.pointSystem.currentLevel = newLevel.level;

    const transaction = {
        timestamp: new Date().toISOString(),
        type: 'earn',
        amount: amount,
        source: source,
        description: description,
        multiplier: multiplier,
        finalAmount: finalAmount
    };
    if (habitId) { transaction.habitId = habitId; }
    if (boost && boost.notes && boost.notes.length > 0) { transaction.appliedEffects = boost.notes; }
    if (meta && typeof meta === 'object') { transaction.meta = meta; }
    data.pointSystem.transactions.unshift(transaction);
    if (data.pointSystem.transactions.length > 100) { data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100); }
    saveData(data);
    // 効果（例：スパークル残回数）の表示を即時更新
    try { if (typeof updateActiveEffectsDisplay === 'function') { updateActiveEffectsDisplay(); } } catch(_) {}

    if (newLevel.level > oldLevel && typeof showLevelUpNotification === 'function') {
        showLevelUpNotification(oldLevel, newLevel);
    }
    if (typeof showPointAnimation === 'function') {
        showPointAnimation(finalAmount);
    }
    if ((boost.multiplierTotal && boost.multiplierTotal !== 1) || (boost.bonusTotal && boost.bonusTotal !== 0)) {
        const title = '💎 ポイントブースト！';
        const effects = boost.notes && boost.notes.length ? boost.notes.join(' / ') : '効果適用';
        if (typeof showCardEffect === 'function') {
            showCardEffect(title, `+${finalAmount}pt (${effects})`, '#06b6d4');
        }
    }
    if (typeof updatePointDisplay === 'function') {
        updatePointDisplay();
    }
    return finalAmount;
}

function spendPoints(amount, rewardName) {
    const data = loadData();
    if (data.pointSystem.currentPoints < amount) { return false; }
    data.pointSystem.currentPoints -= amount;
    data.pointSystem.lifetimeSpent += amount;
    data.pointSystem.transactions.unshift({ timestamp: new Date().toISOString(), type: 'spend', amount, source: 'reward', description: rewardName });
    if (data.pointSystem.transactions.length > 100) { data.pointSystem.transactions = data.pointSystem.transactions.slice(0, 100); }
    saveData(data);
    if (typeof updatePointDisplay === 'function') { updatePointDisplay(); }
    return true;
}

function addEffortBonus(points, reason = '') {
    if (points < 1 || points > 3) { return false; }
    const data = loadData();
    data.pointSystem.dailyEffortUsed = (data.pointSystem.dailyEffortUsed || 0) + 1;
    saveData(data);
    const final = earnPoints(points, 'effort_bonus', reason || `努力ボーナス (${points}pt)`);
    if (typeof updatePointsView === 'function') { updatePointsView(); }
    if (typeof updateStatistics === 'function') { updateStatistics(); }
    return final >= 0;
}

// expose
window.LEVEL_THRESHOLDS = LEVEL_THRESHOLDS;
window.calculateLevel = calculateLevel;
window.calculatePointsWithBoosts = calculatePointsWithBoosts;
window.calculatePointsWithBoostsDetailed = calculatePointsWithBoostsDetailed;
window.earnPoints = earnPoints;
window.spendPoints = spendPoints;
window.addEffortBonus = addEffortBonus;
