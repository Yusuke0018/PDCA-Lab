// Points system extracted from hypolab-local.js (behavior unchanged)
// Exposes functions on window for backward compatibility.

const LEVEL_THRESHOLDS = [
    { level: 1, min: 0, max: 75 },
    { level: 2, min: 76, max: 225 },
    { level: 3, min: 226, max: 450 },
    { level: 4, min: 451, max: 750 },
    { level: 5, min: 751, max: 1125 },
    { level: 6, min: 1126, max: 1650 },
    { level: 7, min: 1651, max: 2250 },
    { level: 8, min: 2251, max: 3000 },
    { level: 9, min: 3001, max: 3900 }
];

function getLevelTitle(level) {
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n|0));
    const lv = clamp(level, 1, 10000);
    const stageTitles = [
        ['駆け出し冒険者', '見習い旅人', '草原を駆ける者'],
        ['熟練の戦士', '森を統べる者', '王国に名を刻む者'],
        ['英雄の継承者', '龍を討つ者', '世界を巡る賢者'],
        ['星を導く者', '天空の覇者', '永劫の守護者'],
        ['神話を紡ぐ者', '運命を超える者', '全てを極めし者']
    ];
    if (lv <= 25) {
        const stageIndex = Math.floor((lv - 1) / 5);
        const posInStage = ((lv - 1) % 5) + 1;
        const titleIndex = posInStage <= 2 ? 0 : (posInStage <= 4 ? 1 : 2);
        return stageTitles[stageIndex][titleIndex];
    }
    return '全てを極めし者';
}

function calculateLevel(lifetimeEarned) {
    for (const t of LEVEL_THRESHOLDS) {
        if (lifetimeEarned <= t.max) {
            return { level: t.level, name: getLevelTitle(t.level), min: t.min, max: t.max };
        }
    }
    const baseMin = 3901;
    const step = 700;
    const extraLevels = Math.floor((lifetimeEarned - baseMin) / step);
    let level = 10 + extraLevels;
    let min = baseMin + (extraLevels * step);
    let max = baseMin + ((extraLevels + 1) * step) - 1;
    if (level > 10000) {
        level = 10000;
        min = lifetimeEarned;
        max = lifetimeEarned;
    }
    return { level, name: getLevelTitle(level), min, max };
}

function calculatePointsWithBoosts(basePoints, source, category = null, habitId = null) {
    const data = loadData();
    let finalPoints = basePoints;
    let multiplier = 1.0;
    let bonus = 0;

    const isChallenge = (source === 'daily_challenge' || source === 'weekly_challenge' || source === 'challenge');
    if (isChallenge) { return basePoints; }

    if (!(typeof EVENTS_DISABLED !== 'undefined' && EVENTS_DISABLED) && data.events && data.events.activeBoosts) {
        const currentHour = new Date().getHours();
        
        data.events.activeBoosts.forEach(boost => {
            if (boost.effect === 'points_multiplier') {
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
        return { finalPoints: basePoints, multiplierTotal: 1.0, bonusTotal: 0, notes };
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
